import { type BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, LatheGeometry, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector2, Vector3 } from '@iwsdk/core';
import { box, named } from './fillet-look.js';
import { paint, seeded, weld } from './neta-paint.js';
import type { PrepMaterialLook } from './prep-look.js';

/**
 * The full difficulty's tamago (the owner's shop): 厚焼き with surimi, baked
 * in the shop in a square copper pan (玉子焼き鍋) on a low flame and turned
 * once. The batter is made in the shop (the owner): the surimi ground in a
 * suribachi (すり鉢) with its pestle (すりこぎ), the eggs in, mixed till
 * frothy, then poured into the pan. Runtime meshes (src/tamago-system.ts;
 * the surimi and the eggs come in the ice box, src/prep-cut-system.ts).
 */

/** The pan's inside (square) and its depth; origin at its floor's middle. */
export const PAN_INNER = 0.18;
export const PAN_DEPTH = 0.035;
const WALL = 0.003;
/** The handle: out of the front wall (toward the chef, -Z), tilted up. */
const HANDLE_TILT = 0.26;
const HANDLE_ROOT = new Vector3(0, 0.022, -(PAN_INNER / 2 + WALL));
/** Where the handle is pinched (pan-local): its wooden grip's middle. */
export const PAN_GRIP = new Vector3(0, HANDLE_ROOT.y + Math.sin(HANDLE_TILT) * 0.1, HANDLE_ROOT.z - Math.cos(HANDLE_TILT) * 0.1);
/** The baked block's height (surimi makes it rise thick). */
export const EGG_HEIGHT = 0.03;

const copper = new MeshStandardMaterial({ color: '#B66A3C', metalness: 0.75, roughness: 0.35 });
const tin = new MeshStandardMaterial({ color: '#C9CCCF', metalness: 0.7, roughness: 0.32 });
const handleWood = new MeshStandardMaterial({ color: '#8A6038', roughness: 0.7 });
const bowlSteel = new MeshStandardMaterial({ color: '#C8CDD1', metalness: 0.65, roughness: 0.3, side: DoubleSide });
const wrap = new MeshStandardMaterial({ color: '#F4F6F8', roughness: 0.1, transparent: true, opacity: 0.28, depthWrite: false });

/** The tamago's colours: the raw batter, the set egg, a golden face, a scorched one. */
export const EGG_RAW = new Color('#F3C640');
export const EGG_SET = new Color('#F1CF63');
export const EGG_GOLD = new Color('#C9862E');
export const EGG_BURNT = new Color('#4E2C12');

/** The block in the pan, as named parts of 'Egg', and the materials that colour as it bakes. */
export interface EggParts {
  egg: Group;
  /** The block's body (raw to set), its first face down (A) and its other face (B). */
  body: MeshStandardMaterial;
  faceA: MeshStandardMaterial;
  faceB: MeshStandardMaterial;
}

/**
 * The square copper pan, tinned inside, its wooden handle toward the chef,
 * and the tamago in it ('Egg', hidden till poured). The egg group's pivot is
 * the block's middle (it is turned over about X).
 */
export function createTamagoPan(): { pan: Group; egg: EggParts } {
  const pan = new Group();
  pan.name = 'TamagoPan';
  const O = PAN_INNER + 2 * WALL;
  pan.add(box(O, 0.003, O, copper, 'PanBase', 0, -0.0015));
  pan.add(box(PAN_INNER, 0.0006, PAN_INNER, tin, 'PanTin', 0, 0.0003));
  for (const [name, x, z, w, d] of [
    ['WallFront', 0, -(PAN_INNER + WALL) / 2, O, WALL],
    ['WallBack', 0, (PAN_INNER + WALL) / 2, O, WALL],
    ['WallLeft', -(PAN_INNER + WALL) / 2, 0, WALL, PAN_INNER],
    ['WallRight', (PAN_INNER + WALL) / 2, 0, WALL, PAN_INNER],
  ] as const) {
    pan.add(box(w, PAN_DEPTH, d, copper, name, x, PAN_DEPTH / 2, z));
  }
  const handle = new Group();
  handle.name = 'Handle';
  handle.position.copy(HANDLE_ROOT);
  handle.rotation.x = HANDLE_TILT;
  handle.add(named(new Mesh(new CylinderGeometry(0.009, 0.011, 0.04, 12).rotateX(Math.PI / 2).translate(0, 0, -0.02), copper), 'Socket'));
  handle.add(named(new Mesh(new CylinderGeometry(0.0115, 0.0105, 0.13, 12).rotateX(Math.PI / 2).translate(0, 0, -0.105), handleWood), 'Grip'));
  pan.add(handle);
  const body = new MeshStandardMaterial({ color: EGG_RAW.clone(), roughness: 0.25 });
  const faceA = new MeshStandardMaterial({ color: EGG_RAW.clone(), roughness: 0.55 });
  const faceB = new MeshStandardMaterial({ color: EGG_RAW.clone(), roughness: 0.25 });
  const egg = new Group();
  egg.name = 'Egg';
  egg.position.y = EGG_HEIGHT / 2 + 0.0006;
  const W = PAN_INNER - 0.002;
  egg.add(box(W, EGG_HEIGHT - 0.002, W, body, 'EggBody', 0, 0));
  egg.add(box(W - 0.002, 0.001, W - 0.002, faceA, 'FaceA', 0, -EGG_HEIGHT / 2 + 0.0005));
  egg.add(box(W - 0.002, 0.001, W - 0.002, faceB, 'FaceB', 0, EGG_HEIGHT / 2 - 0.0005));
  egg.visible = false;
  pan.add(egg);
  return { pan, egg: { egg, body, faceA, faceB } };
}

// ---------------------------------------------------------------- the suribachi

/** The suribachi (すり鉢, 18 cm): its rim's radius and height; its floor inside; origin at its foot's middle. */
export const SURIBACHI_RIM = 0.093;
export const SURIBACHI_TOP = 0.078;
export const SURIBACHI_FLOOR = 0.014;
/** The pestle (すりこぎ): its length, and where along it the hand holds it (from its rounded tip, the origin; it runs along +Y). */
export const PESTLE_LENGTH = 0.28;
export const PESTLE_GRIP = 0.2;
/** The beaten batter's level in the suribachi (about ten eggs with the surimi). */
export const BATTER_LEVEL = 0.05;

const glaze = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
const pestleWood = new MeshStandardMaterial({ color: '#C7A574', roughness: 0.75 });
const surimiMat = new MeshStandardMaterial({ color: '#E7DDD3', roughness: 0.6 });
const eggWhite = new MeshStandardMaterial({ color: '#F6EFC6', roughness: 0.08, transparent: true, opacity: 0.55, depthWrite: false });
const yolk = new MeshStandardMaterial({ color: '#F0A21E', roughness: 0.2 });

/** The suribachi's parts the work changes: the surimi (lumpy, then ground smooth), the batter and its froth. */
export interface SuribachiParts {
  bowl: Group;
  lumpy: Mesh;
  smooth: Mesh;
  batter: Mesh;
  batterMat: MeshStandardMaterial;
  froth: Mesh;
  frothMat: MeshStandardMaterial;
}

/**
 * The suribachi: glazed dark brown outside, the unglazed inside combed with
 * fine grooves (櫛目) from the floor up, which grind the surimi. In it, hidden
 * till the work puts them there: the surimi in lumps, the same ground smooth,
 * the beaten batter and its froth.
 */
export function createSuribachi(): SuribachiParts {
  const bowl = new Group();
  bowl.name = 'Suribachi';
  const profile = [
    new Vector2(0.001, 0), new Vector2(0.04, 0), new Vector2(0.044, 0.006), new Vector2(0.05, 0.008), new Vector2(0.086, 0.066), new Vector2(0.096, SURIBACHI_TOP - 0.003),
    new Vector2(0.094, SURIBACHI_TOP), new Vector2(SURIBACHI_RIM - 0.006, SURIBACHI_TOP - 0.002), new Vector2(0.042, 0.018), new Vector2(0.001, SURIBACHI_FLOOR),
  ];
  const outside = new Color('#5B2E1A');
  const inside = new Color('#B4683F');
  const groove = new Color('#7C4128');
  const g = paint(new LatheGeometry(profile, 96), (p, n, out) => {
    const r = Math.hypot(p.x, p.z);
    const inner = r < 0.0935 && p.y > 0.011 && n.x * p.x + n.z * p.z < 0.001 * r;
    if (!inner) return void out.copy(outside);
    // The comb's lines: from the floor's middle out and up the wall, every few degrees.
    const a = Math.atan2(p.z, p.x);
    out.copy(inside);
    if (r > 0.012 && Math.cos(a * 48) > 0.2) out.lerp(groove, 0.55);
  });
  bowl.add(named(new Mesh(g, glaze), 'Bowl'));
  // The surimi as it goes in: lumps on the floor, one mesh.
  const rnd = seeded('surimi');
  const lumps: Array<[BufferGeometry, Matrix4]> = [];
  for (let k = 0; k < 9; k++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.012 + rnd() * 0.022;
    const size = 0.012 + rnd() * 0.008;
    lumps.push([new SphereGeometry(1, 10, 7), new Matrix4().compose(new Vector3(Math.cos(a) * r, SURIBACHI_FLOOR + 0.008 + rnd() * 0.006, Math.sin(a) * r), new Quaternion(), new Vector3(size, size * 0.7, size))]);
  }
  const lumpyMesh = named(new Mesh(weld(lumps), surimiMat), 'SurimiLumps', false);
  bowl.add(lumpyMesh);
  const smooth = named(new Mesh(new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.046, 0.016, 0.046).translate(0, SURIBACHI_FLOOR + 0.004, 0), surimiMat), 'SurimiSmooth', false);
  bowl.add(smooth);
  const batterMat = new MeshStandardMaterial({ color: '#E7B23A', roughness: 0.18 });
  const batter = named(new Mesh(new CylinderGeometry(0.067, 0.041, BATTER_LEVEL - 0.016, 40).translate(0, (BATTER_LEVEL + 0.016) / 2, 0), batterMat), 'Batter', false);
  bowl.add(batter);
  const frothMat = new MeshStandardMaterial({ color: '#FBEFC4', roughness: 0.9, transparent: true, opacity: 0, depthWrite: false });
  const froth = named(new Mesh(new CylinderGeometry(0.069, 0.067, 0.004, 40).translate(0, BATTER_LEVEL + 0.002, 0), frothMat), 'Froth', false);
  bowl.add(froth);
  return { bowl, lumpy: lumpyMesh, smooth, batter, batterMat, froth, frothMat };
}

/** The pestle (すりこぎ, 山椒の木): its rounded tip at the origin, running up +Y, a little thicker toward the top. */
export function createPestle(): Group {
  const g = new Group();
  g.name = 'Surikogi';
  g.add(named(new Mesh(new CylinderGeometry(0.0155, 0.0115, PESTLE_LENGTH - 0.011, 16).translate(0, (PESTLE_LENGTH - 0.011) / 2 + 0.011, 0), pestleWood), 'Stick'));
  g.add(named(new Mesh(new SphereGeometry(0.0115, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, 0.011, 0), pestleWood), 'Tip'));
  return g;
}

/** A small steel bowl, its foot at the origin: `r` across the rim, `h` deep. */
function steelBowl(r: number, h: number): Mesh {
  const profile = [new Vector2(0.001, 0), new Vector2(r * 0.6, 0), new Vector2(r * 0.8, h * 0.2), new Vector2(r * 0.95, h * 0.6), new Vector2(r, h), new Vector2(r + 0.003, h + 0.002)];
  return new Mesh(new LatheGeometry(profile, 28), bowlSteel);
}

/** The eggs, cracked into a steel bowl (about ten): the whites clear, the yolks whole; foot at the origin. */
export function createEggBowl(): Group {
  const g = new Group();
  g.name = 'EggBowl';
  g.add(named(steelBowl(0.06, 0.045), 'Bowl'));
  g.add(named(new Mesh(new CylinderGeometry(0.054, 0.04, 0.026, 28).translate(0, 0.016, 0), eggWhite), 'Whites'));
  const rnd = seeded('yolks');
  const yolks: Array<[BufferGeometry, Matrix4]> = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + rnd() * 0.4;
    const r = k < 3 ? 0.012 * k : 0.03 + rnd() * 0.01;
    yolks.push([new SphereGeometry(1, 12, 8), new Matrix4().compose(new Vector3(Math.cos(a) * r, 0.028, Math.sin(a) * r), new Quaternion(), new Vector3(0.011, 0.007, 0.011))]);
  }
  g.add(named(new Mesh(weld(yolks), yolk), 'Yolks'));
  return g;
}

/**
 * What the fish shop brings for the tamago, in the ice box: a block of
 * surimi in a small stainless tray under wrap, and the eggs. Let go over the
 * suribachi, the surimi goes in and the eggs are set down beside it.
 */
export function tamagoMakings(): PrepMaterialLook {
  const root = new Group();
  root.name = 'Tamago';
  const T = 0.008;
  root.add(box(0.17, 0.004, 0.13, bowlSteel, 'Tray', 0, 0.002));
  for (const [name, x, z, w, d] of [
    ['TrayFront', 0, -0.063, 0.17, 0.004],
    ['TrayBack', 0, 0.063, 0.17, 0.004],
    ['TrayLeft', -0.083, 0, 0.004, 0.13],
    ['TrayRight', 0.083, 0, 0.004, 0.13],
  ] as const) root.add(box(w, 0.02, d, bowlSteel, name, x, 0.01, z));
  root.add(box(0.075, 0.03, 0.06, surimiMat, 'SurimiBlock', -0.035, T + 0.011, 0));
  const eggs = createEggBowl();
  eggs.scale.setScalar(0.85);
  eggs.position.set(0.04, 0.004, 0);
  root.add(eggs);
  root.add(box(0.172, 0.0008, 0.132, wrap, 'Wrap', 0, 0.062));
  root.userData.top = 0.064;
  return {
    root,
    length: 0.17,
    halfWidth: 0.065,
    top: 0.064,
    steps: [],
    products: [{ parts: [], neta: 'Tamago', dest: 'case' }],
  };
}
