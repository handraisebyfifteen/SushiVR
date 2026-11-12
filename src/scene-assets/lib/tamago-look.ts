import { type BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, LatheGeometry, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector2, Vector3 } from '@iwsdk/core';
import { box, named } from './fillet-look.js';
import { paint, seeded, weld } from './neta-paint.js';
import type { PrepMaterialLook } from './prep-look.js';

/**
 * The full difficulty's tamago (the owner's shop): 厚焼き with scallop, baked
 * in the shop in a square copper pan (玉子焼き鍋) on a low flame and turned
 * once. The batter is made in the shop (the owner): the scallops ground in a
 * suribachi (すり鉢) with its pestle (すりこぎ), the eggs tapped in from their
 * pack, mixed with cooking chopsticks (菜箸) till frothy, then poured into
 * the pan. The suribachi lives in the cupboard under the sink. Runtime meshes
 * (src/tamago-system.ts; the scallops and the eggs come in the ice box,
 * src/prep-cut-system.ts).
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
/** The baked block's height (the scallop paste makes it rise thick). */
export const EGG_HEIGHT = 0.03;

const copper = new MeshStandardMaterial({ color: '#B66A3C', metalness: 0.75, roughness: 0.35 });
const tin = new MeshStandardMaterial({ color: '#C9CCCF', metalness: 0.7, roughness: 0.32 });
const handleWood = new MeshStandardMaterial({ color: '#8A6038', roughness: 0.7 });
const bowlSteel = new MeshStandardMaterial({ color: '#C8CDD1', metalness: 0.65, roughness: 0.3, side: DoubleSide });
const oilFilm = new MeshStandardMaterial({ color: '#E2B04A', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false });
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
export function createTamagoPan(): { pan: Group; egg: EggParts; oil: Mesh } {
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
  // The oil left on the tin after the 油返し (hidden till the pan is oiled).
  const oil = box(PAN_INNER - 0.004, 0.0008, PAN_INNER - 0.004, oilFilm, 'Oil', 0, 0.0011);
  oil.visible = false;
  pan.add(oil);
  return { pan, egg: { egg, body, faceA, faceB }, oil };
}

// ---------------------------------------------------------------- the suribachi

/** The suribachi (すり鉢, 18 cm): its rim's radius and height; its floor inside; origin at its foot's middle. */
export const SURIBACHI_RIM = 0.093;
export const SURIBACHI_TOP = 0.078;
export const SURIBACHI_FLOOR = 0.014;
/** The pestle (すりこぎ): its length, and where along it the hand holds it (from its rounded tip, the origin; it runs along +Y). */
export const PESTLE_LENGTH = 0.28;
export const PESTLE_GRIP = 0.2;
/** The beaten batter's level in the suribachi (about ten eggs with the scallop paste). */
export const BATTER_LEVEL = 0.05;

const glaze = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
const pestleWood = new MeshStandardMaterial({ color: '#C7A574', roughness: 0.75 });
const scallopMat = new MeshStandardMaterial({ color: '#F1E6D6', roughness: 0.5 });
const pasteMat = new MeshStandardMaterial({ color: '#EEE3D3', roughness: 0.6 });
const shell = new MeshStandardMaterial({ color: '#E6D3B4', roughness: 0.6 });
const packPlastic = new MeshStandardMaterial({ color: '#EAF1F5', roughness: 0.1, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide });
const bamboo = new MeshStandardMaterial({ color: '#D9C39A', roughness: 0.7 });
/** The cooking chopsticks (菜箸): this long, their tips this far apart when held together. */
export const SAIBASHI_LENGTH = 0.33;
export const SAIBASHI_GRIP = 0.24;
/** The pack of eggs (ten, two by five): its footprint. */
export const EGG_PACK_W = 0.15;
export const EGG_PACK_D = 0.065;

/** The suribachi's parts the work changes: the scallops (in pieces, then ground to a paste), the batter and its froth. */
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
 * fine grooves (櫛目) from the floor up, which grind the scallops. In it, hidden
 * till the work puts them there: the scallops in pieces, the same ground to a
 * paste, the beaten batter and its froth.
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
  // The scallops as they go in: the adductor muscles whole, a few halved, on the floor; one mesh.
  const rnd = seeded('scallops');
  const lumps: Array<[BufferGeometry, Matrix4]> = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rnd() * 0.5;
    const r = k === 0 ? 0 : 0.022 + rnd() * 0.012;
    const d = k % 3 === 2 ? 0.011 : 0.015;
    lumps.push([new CylinderGeometry(d, d * 0.9, 0.014, 14), new Matrix4().compose(new Vector3(Math.cos(a) * r, SURIBACHI_FLOOR + 0.009 + rnd() * 0.004, Math.sin(a) * r), new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (rnd() - 0.5) * 0.6), new Vector3(1, 1, 1))]);
  }
  const lumpyMesh = named(new Mesh(weld(lumps), scallopMat), 'ScallopPieces', false);
  bowl.add(lumpyMesh);
  const smooth = named(new Mesh(new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.046, 0.016, 0.046).translate(0, SURIBACHI_FLOOR + 0.004, 0), pasteMat), 'ScallopPaste', false);
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

const jarWhite = new MeshStandardMaterial({ color: '#F4F2EC', roughness: 0.35 });
const jarLidMat = new MeshStandardMaterial({ color: '#B8B4AA', roughness: 0.4, metalness: 0.4 });
/** A seasoning jar as on the food shelf (the salt, the sugar), carried to the suribachi: a lidded white jar, its foot at the origin. */
export function createSeasoningJar(text: 'Salt' | 'Sugar'): Group {
  const g = new Group();
  g.name = `${text}Jar`;
  g.add(named(new Mesh(new CylinderGeometry(0.055, 0.052, 0.13, 20).translate(0, 0.065, 0), jarWhite), 'Body'));
  g.add(named(new Mesh(new CylinderGeometry(0.057, 0.057, 0.018, 20).translate(0, 0.139, 0), jarLidMat), 'Lid'));
  return g;
}

/** The cooking chopsticks (菜箸), held as one: their tips together at the origin, running up +Y, a little apart toward the top. */
export function createChopsticks(): Group {
  const g = new Group();
  g.name = 'Saibashi';
  for (const side of [-1, 1]) {
    const stick = named(new Mesh(new CylinderGeometry(0.0035, 0.0022, SAIBASHI_LENGTH, 8).translate(0, SAIBASHI_LENGTH / 2, 0), bamboo), side < 0 ? 'StickL' : 'StickR');
    stick.position.set(side * 0.003, 0, 0);
    stick.rotation.z = -side * 0.035;
    g.add(stick);
  }
  return g;
}

/** The eggs as they come: ten in a clear plastic pack (two by five), the lid on; its floor's middle at the origin. */
export function createEggPack(): Group {
  const g = new Group();
  g.name = 'EggPack';
  g.add(box(EGG_PACK_W, 0.003, EGG_PACK_D, packPlastic, 'PackFloor'));
  for (const [name, x, z, w, d] of [
    ['PackFront', 0, -EGG_PACK_D / 2, EGG_PACK_W, 0.002],
    ['PackBack', 0, EGG_PACK_D / 2, EGG_PACK_W, 0.002],
    ['PackLeft', -EGG_PACK_W / 2, 0, 0.002, EGG_PACK_D],
    ['PackRight', EGG_PACK_W / 2, 0, 0.002, EGG_PACK_D],
  ] as const) g.add(box(w, 0.07, d, packPlastic, name, x, 0.035, z));
  const eggs: Array<[BufferGeometry, Matrix4]> = [];
  for (let i = 0; i < 5; i++) for (const j of [-1, 1]) eggs.push([new SphereGeometry(1, 12, 9), new Matrix4().compose(new Vector3(-0.058 + i * 0.029, 0.03, j * 0.016), new Quaternion(), new Vector3(0.0135, 0.0185, 0.0135))]);
  g.add(named(new Mesh(weld(eggs), shell), 'Eggs'));
  const lid = box(EGG_PACK_W + 0.004, 0.003, EGG_PACK_D + 0.004, packPlastic, 'PackLid', 0, 0.0715);
  g.add(lid);
  return g;
}

/**
 * What the fish shop brings for the tamago, in the ice box: scallops (the
 * adductor muscles) in a small stainless tray under wrap, and the pack of
 * eggs. Let go over the suribachi, the scallops go in and the pack is set
 * down beside it.
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
  const rnd = seeded('tray');
  const discs: Array<[BufferGeometry, Matrix4]> = [];
  for (let k = 0; k < 6; k++) discs.push([new CylinderGeometry(0.015, 0.0135, 0.014, 14), new Matrix4().compose(new Vector3(-0.058 + (k % 3) * 0.031, T + 0.007, (k < 3 ? -1 : 1) * 0.018), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rnd()), new Vector3(1, 1, 1))]);
  root.add(named(new Mesh(weld(discs), scallopMat), 'Scallops'));
  const eggs = createEggPack();
  eggs.scale.setScalar(0.5);
  eggs.rotation.y = Math.PI / 2;
  eggs.position.set(0.05, T, 0);
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

// ---------------------------------------------------------------- the lid and the oil

/**
 * The pan's wooden lid (木蓋), a set with the pan: a square board that fits
 * inside it, one bar across its top to hold it by. At the end it is laid on
 * the baked tamago and pressed once to square it, then the pan is turned over
 * onto it and the tamago cools on it. Origin at the board's underside middle;
 * the bar runs along X.
 */
export const LID_SIZE = PAN_INNER - 0.008;
export const LID_THICK = 0.012;
export const LID_BAR_H = 0.02;
/** Where the lid is held (lid-local): the bar's top, in the middle. */
export const LID_GRIP_Y = LID_THICK + LID_BAR_H;
const lidWood = new MeshStandardMaterial({ color: '#DCC093', roughness: 0.78 });
const lidBarWood = new MeshStandardMaterial({ color: '#CDAE7C', roughness: 0.75 });

export function createTamagoLid(): Group {
  const g = new Group();
  g.name = 'TamagoLid';
  g.add(box(LID_SIZE, LID_THICK, LID_SIZE, lidWood, 'Board', 0, LID_THICK / 2));
  g.add(box(LID_SIZE, LID_BAR_H, 0.024, lidBarWood, 'Bar', 0, LID_THICK + LID_BAR_H / 2));
  return g;
}

/**
 * The oil pot (オイルポット) from the food shelf, beside the salt and sugar: a
 * stainless pot with a lid and knob, a spout to the right (+X) and a dark
 * handle to the left. Origin at its foot's middle.
 */
export const OIL_POT_TOP = 0.114;
const potSteel = new MeshStandardMaterial({ color: '#C3C8CC', metalness: 0.7, roughness: 0.28 });
const potHandle = new MeshStandardMaterial({ color: '#2B2B2B', roughness: 0.6 });

export function createOilPot(): Group {
  const g = new Group();
  g.name = 'OilPot';
  g.add(named(new Mesh(new CylinderGeometry(0.04, 0.043, 0.09, 20).translate(0, 0.045, 0), potSteel), 'Body'));
  g.add(named(new Mesh(new CylinderGeometry(0.035, 0.041, 0.012, 20).translate(0, 0.096, 0), potSteel), 'Lid'));
  g.add(named(new Mesh(new CylinderGeometry(0.008, 0.01, 0.012, 10).translate(0, 0.108, 0), potHandle), 'Knob'));
  // The spout: out of the body's right side near the top, tilted up.
  const spout = named(new Mesh(new CylinderGeometry(0.004, 0.009, 0.05, 10), potSteel), 'Spout');
  spout.rotation.z = -0.9;
  spout.position.set(0.04 + 0.025 * Math.sin(0.9), 0.07 + 0.025 * Math.cos(0.9), 0);
  g.add(spout);
  // The handle: a bar standing off the left side on two arms.
  g.add(box(0.008, 0.06, 0.012, potHandle, 'Handle', -0.058, 0.06));
  g.add(box(0.016, 0.008, 0.012, potHandle, 'HandleTop', -0.049, 0.088));
  g.add(box(0.016, 0.008, 0.012, potHandle, 'HandleFoot', -0.049, 0.032));
  return g;
}
