import { Color, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, MeshStandardMaterial, Vector2, Vector3 } from '@iwsdk/core';
import { box, named } from './fillet-look.js';
import type { PrepMaterialLook } from './prep-look.js';

/**
 * The full difficulty's tamago (the owner's shop): 厚焼き with surimi, baked
 * in the shop in a square copper pan (玉子焼き鍋) on a low flame and turned
 * once. The work starts from pouring the mixed batter into the pan. Runtime
 * meshes (src/tamago-system.ts; the batter's bowl comes in the ice box,
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

/** The mixed batter (eggs, surimi, sugar…) in a steel bowl under wrap: it comes in the ice box and is poured into the pan. */
export function tamagoBatter(): PrepMaterialLook {
  const root = new Group();
  root.name = 'Tamago';
  const R = 0.075;
  const H = 0.07;
  const profile = [new Vector2(0.001, 0), new Vector2(0.045, 0), new Vector2(0.06, 0.012), new Vector2(0.071, 0.04), new Vector2(R, H), new Vector2(R + 0.004, H + 0.002)];
  root.add(named(new Mesh(new LatheGeometry(profile, 28), bowlSteel), 'Bowl'));
  const batter = new MeshStandardMaterial({ color: EGG_RAW.clone(), roughness: 0.2 });
  root.add(named(new Mesh(new CylinderGeometry(0.068, 0.068, 0.002, 28).translate(0, 0.05, 0), batter), 'Batter'));
  root.add(named(new Mesh(new CylinderGeometry(R + 0.005, R + 0.005, 0.0008, 28).translate(0, H + 0.003, 0), wrap), 'Wrap'));
  root.userData.top = H + 0.004;
  return {
    root,
    length: 2 * R,
    halfWidth: R,
    top: H + 0.004,
    steps: [],
    products: [{ parts: [], neta: 'Tamago', dest: 'case' }],
  };
}
