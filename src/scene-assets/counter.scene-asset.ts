import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';

/**
 * Sushi bar front: the chef's counter and everything on it, built from
 * primitives only (no external models). All sizes are meters. Each factory
 * returns a parentless Object3D whose origin is its contact point, so the
 * scene can place it on a surface.
 *
 * Layout (chef seated at the origin, facing -Z; distances are set in
 * public/scenes/main.iwsdk.scene.json):
 *   cutting board (1 m wide) -> neta case (long glass showcase) -> customer counter + geta
 *
 * Shared materials: one material per look keeps draw-call state changes low.
 */

const darkWood = new MeshStandardMaterial({ color: '#4A3526', roughness: 0.8 });
const lightWood = new MeshStandardMaterial({ color: '#D9B98A', roughness: 0.7 });
const paleWood = new MeshStandardMaterial({ color: '#EADBB8', roughness: 0.65 });
const lacquer = new MeshStandardMaterial({ color: '#1E1A1A', roughness: 0.35 });
const steel = new MeshStandardMaterial({ color: '#C9CDD2', roughness: 0.25, metalness: 0.8 });
const glass = new MeshStandardMaterial({
  color: '#BFE3F2',
  roughness: 0.05,
  transparent: true,
  opacity: 0.22,
});
const water = new MeshStandardMaterial({
  color: '#9CCBE0',
  roughness: 0.15,
  transparent: true,
  opacity: 0.85,
});
const wetCloth = new MeshStandardMaterial({ color: '#CFD8DC', roughness: 1.0 });
const ceramic = new MeshStandardMaterial({ color: '#E8E4DA', roughness: 0.4 });
const wasabi = new MeshStandardMaterial({ color: '#6B9E3A', roughness: 0.8 });
const tunaFlesh = new MeshStandardMaterial({ color: '#C8333A', roughness: 0.5 });
const whiteFlesh = new MeshStandardMaterial({ color: '#F3DDD6', roughness: 0.55 });
const silverFlesh = new MeshStandardMaterial({ color: '#8FA3B8', roughness: 0.35, metalness: 0.2 });
const silverSkin = new MeshStandardMaterial({ color: '#4F5F73', roughness: 0.4, metalness: 0.3 });

function box(
  w: number,
  h: number,
  d: number,
  material: MeshStandardMaterial,
  name: string,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.name = name;
  return mesh;
}

/** Chef's work counter: a slab with a leg at each end (knees go under it). */
export function createCounter(): Group {
  const root = new Group();
  root.name = 'Counter';
  const top = box(1.8, 0.04, 0.5, darkWood, 'CounterTop');
  top.position.set(0, 0.73, 0);
  const legL = box(0.06, 0.71, 0.46, darkWood, 'LegL');
  legL.position.set(-0.87, 0.355, 0);
  const legR = box(0.06, 0.71, 0.46, darkWood, 'LegR');
  legR.position.set(0.87, 0.355, 0);
  root.add(top, legL, legR);
  return root;
}

/** Customer side of the bar: a solid counter block with a lighter top. */
export function createCustomerCounter(): Group {
  const root = new Group();
  root.name = 'CustomerCounter';
  const body = box(1.8, 0.71, 0.42, darkWood, 'Body');
  body.position.set(0, 0.355, 0);
  const top = box(1.8, 0.04, 0.42, lightWood, 'Top');
  top.position.set(0, 0.73, 0);
  root.add(body, top);
  return root;
}

/** Cutting board (manaita): 1 m wide, every cut and every nigiri happens here. */
export function createCuttingBoard(): Group {
  const root = new Group();
  root.name = 'CuttingBoard';
  const board = box(1.0, 0.02, 0.3, paleWood, 'Board');
  board.position.y = 0.01;
  root.add(board);
  return root;
}

/** Serving stand (geta): a plank on two feet, where finished sushi is served. */
export function createGeta(): Group {
  const root = new Group();
  root.name = 'Geta';
  const plank = box(0.26, 0.02, 0.12, lightWood, 'Plank');
  plank.position.y = 0.04;
  const footL = box(0.03, 0.03, 0.1, lightWood, 'FootL');
  footL.position.set(-0.1, 0.015, 0);
  const footR = box(0.03, 0.03, 0.1, lightWood, 'FootR');
  footR.position.set(0.1, 0.015, 0);
  root.add(plank, footL, footR);
  return root;
}

const caseFloor = new MeshStandardMaterial({ color: '#3F8C5B', roughness: 0.8 });
const caseDark = new MeshStandardMaterial({ color: '#2A2D30', roughness: 0.5 });

/** Inside width of the neta case; saku are placed along it. */
export const NETA_CASE_WIDTH = 1.2;
export const NETA_CASE_DEPTH = 0.24;

/**
 * Neta case: a long, low refrigerated showcase between chef and customer,
 * like the stainless counter-top cases in sushi bars. Stainless base, green
 * floor inside, a sloped glass front on the customer side, a glass top and a
 * glass end; the chef side (+Z) is open so a hand can reach in. The
 * compressor housing sits at the left end.
 */
export function createNetaCase(): Group {
  const root = new Group();
  root.name = 'NetaCase';
  const W = NETA_CASE_WIDTH;
  const D = NETA_CASE_DEPTH;
  const H = 0.22;
  const base = box(W, 0.05, D, steel, 'Base');
  base.position.y = 0.025;
  const floor = box(W - 0.2, 0.004, D - 0.04, caseFloor, 'Floor');
  floor.position.set(0.08, 0.052, 0);
  // Compressor housing at the left end.
  const housing = box(0.16, H, D, steel, 'Housing');
  housing.position.set(-W / 2 + 0.08, H / 2, 0);
  const panel = box(0.004, 0.05, 0.1, caseDark, 'HousingPanel');
  panel.position.set(-W / 2 + 0.162, 0.14, 0);
  // Glass: sloped front on the customer side (-Z), flat top, right end.
  const glassW = W - 0.16;
  const glassX = 0.08;
  const front = box(glassW, 0.19, 0.006, glass, 'GlassFront');
  front.rotation.x = -0.35;
  front.position.set(glassX, 0.05 + 0.09, -D / 2 + 0.035);
  const top = box(glassW, 0.006, D - 0.1, glass, 'GlassTop');
  top.position.set(glassX, H - 0.003, 0.02);
  const end = box(0.006, H - 0.05, D, glass, 'GlassEnd');
  end.position.set(W / 2 - 0.003, 0.05 + (H - 0.05) / 2, 0);
  const railTop = box(glassW, 0.01, 0.01, steel, 'RailTop');
  railTop.position.set(glassX, H, -D / 2 + 0.07);
  const railBottom = box(glassW, 0.01, 0.01, steel, 'RailBottom');
  railBottom.position.set(glassX, 0.055, -D / 2 + 0.005);
  root.add(base, floor, housing, panel, front, top, end, railTop, railBottom);
  return root;
}

export type SakuKind = 'tuna' | 'white' | 'silver';

/**
 * Saku: a block of fish from which slices are cut to order. The block runs
 * along X. The silver-skinned fish shows its skin pattern on the top face only,
 * so a slice has a visible skin side.
 */
export function createSaku(kind: SakuKind): Group {
  const root = new Group();
  root.name = `Saku_${kind}`;
  const material = kind === 'tuna' ? tunaFlesh : kind === 'white' ? whiteFlesh : silverFlesh;
  const block = box(0.22, 0.035, 0.08, material, 'Block');
  block.position.y = 0.0175;
  root.add(block);
  if (kind === 'silver') {
    for (let i = 0; i < 6; i++) {
      const stripe = box(0.012, 0.003, 0.08, silverSkin, `Skin${i}`);
      stripe.position.set(-0.09 + i * 0.036, 0.036, 0);
      root.add(stripe);
    }
  }
  return root;
}

/** Yanagiba: a long single-edged slicing knife. Blade runs along +X. */
export function createKnife(): Group {
  const root = new Group();
  root.name = 'Knife';
  const blade = box(0.27, 0.004, 0.032, steel, 'Blade');
  blade.position.set(0.075, 0.016, 0);
  const handle = new Mesh(new CylinderGeometry(0.011, 0.013, 0.13, 10, 1), lightWood);
  handle.name = 'Handle';
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-0.125, 0.014, 0);
  const bolster = new Mesh(new CylinderGeometry(0.012, 0.012, 0.012, 10, 1), lacquer);
  bolster.name = 'Bolster';
  bolster.rotation.z = Math.PI / 2;
  bolster.position.set(-0.062, 0.014, 0);
  root.add(blade, handle, bolster);
  return root;
}

/** Wet cloth (fukin) kept beside the knife to wipe the blade and the board. */
export function createWetCloth(): Group {
  const root = new Group();
  root.name = 'WetCloth';
  const fold = box(0.14, 0.016, 0.1, wetCloth, 'Fold');
  fold.position.y = 0.008;
  const edge = box(0.14, 0.005, 0.035, wetCloth, 'Edge');
  edge.position.set(0, 0.0185, 0.025);
  root.add(fold, edge);
  return root;
}

/** Tezu bowl: vinegar water the chef dips fingers in so rice does not stick. */
export function createTezuBowl(): Group {
  const root = new Group();
  root.name = 'TezuBowl';
  const bowl = new Mesh(new CylinderGeometry(0.06, 0.045, 0.05, 20, 1), ceramic);
  bowl.name = 'Bowl';
  bowl.position.y = 0.025;
  const surface = new Mesh(new CylinderGeometry(0.052, 0.052, 0.004, 20, 1), water);
  surface.name = 'Water';
  surface.position.y = 0.042;
  root.add(bowl, surface);
  return root;
}

/** Small dish with a mound of wasabi. */
export function createWasabiDish(): Group {
  const root = new Group();
  root.name = 'WasabiDish';
  const dish = new Mesh(new CylinderGeometry(0.045, 0.04, 0.015, 20, 1), lacquer);
  dish.name = 'Dish';
  dish.position.y = 0.0075;
  const mound = new Mesh(new SphereGeometry(0.025, 14, 10), wasabi);
  mound.name = 'Wasabi';
  mound.scale.set(1, 0.6, 1);
  mound.position.y = 0.015;
  root.add(dish, mound);
  return root;
}
