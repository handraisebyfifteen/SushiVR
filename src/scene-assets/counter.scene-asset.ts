import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import {
  BAR_LENGTH,
  CUSTOMER_COUNTER_DEPTH,
  CUSTOMER_COUNTER_HEIGHT,
  GETA_DEPTH,
  MANAITA_DEPTH,
  MANAITA_THICKNESS,
  MANAITA_WIDTH,
  NETA_CASE_DEPTH,
  NETA_CASE_HEIGHT,
  NETA_SLOT_PITCH,
  TSUKEDAI_DEPTH,
  TSUKEDAI_TOP,
  WORK_COUNTER_DEPTH,
  WORK_COUNTER_TOP,
} from '../layout.js';
import { mergeBoxes, mergeGeometries } from './lib/batch.js';

/**
 * Sushi bar front: the chef's counter and everything on it, built from
 * primitives only (no external models). All sizes are meters. Each factory
 * returns a parentless Object3D whose origin is its contact point, so the
 * scene can place it on a surface.
 *
 * Layout (chef seated at the origin, facing -Z): manaita on the work counter
 * -> tsukedai carrying the neta case and the geta -> customer counter. Every
 * dimension comes from src/layout.ts; positions are applied to the scene by
 * `npm run layout`.
 *
 * Shared materials: one material per look keeps draw-call state changes low.
 */

const darkWood = new MeshStandardMaterial({ color: '#4A3526', roughness: 0.8 });
const lightWood = new MeshStandardMaterial({ color: '#D9B98A', roughness: 0.7 });
const paleWood = new MeshStandardMaterial({ color: '#EADBB8', roughness: 0.65 });
const lacquer = new MeshStandardMaterial({ color: '#1E1A1A', roughness: 0.35 });
const steel = new MeshStandardMaterial({ color: '#C9CDD2', roughness: 0.25, metalness: 0.8 });
const ledLight = new MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFF4E0', emissiveIntensity: 0.6, roughness: 0.4 });
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
  const legH = WORK_COUNTER_TOP - 0.04;
  const top = box(BAR_LENGTH, 0.04, WORK_COUNTER_DEPTH, darkWood, 'CounterTop');
  top.position.set(0, WORK_COUNTER_TOP - 0.02, 0);
  const legL = box(0.06, legH, WORK_COUNTER_DEPTH - 0.04, darkWood, 'LegL');
  legL.position.set(-BAR_LENGTH / 2 + 0.03, legH / 2, 0);
  const legR = box(0.06, legH, WORK_COUNTER_DEPTH - 0.04, darkWood, 'LegR');
  legR.position.set(BAR_LENGTH / 2 - 0.03, legH / 2, 0);
  root.add(top, legL, legR);
  return root;
}

/**
 * Tsukedai: the raised step between the chef's counter and the customer
 * counter. The neta case sits on its chef side, and the strip in front of the
 * case is where the geta (or a leaf, or the sushi itself) is placed for the
 * customer. Kept under the manifest id `ledge`.
 */
export function createLedge(): Group {
  const root = new Group();
  root.name = 'Ledge';
  const bodyH = TSUKEDAI_TOP - 0.04;
  const body = box(BAR_LENGTH, bodyH, TSUKEDAI_DEPTH, darkWood, 'Body');
  body.position.set(0, bodyH / 2, 0);
  const top = box(BAR_LENGTH, 0.04, TSUKEDAI_DEPTH, lightWood, 'Top');
  top.position.set(0, TSUKEDAI_TOP - 0.02, 0);
  root.add(body, top);
  return root;
}

/** Customer side of the bar: a solid counter block with a lighter top, one step lower. */
export function createCustomerCounter(): Group {
  const root = new Group();
  root.name = 'CustomerCounter';
  const bodyH = CUSTOMER_COUNTER_HEIGHT - 0.04;
  const body = box(BAR_LENGTH, bodyH, CUSTOMER_COUNTER_DEPTH, darkWood, 'Body');
  body.position.set(0, bodyH / 2, 0);
  const top = box(BAR_LENGTH, 0.04, CUSTOMER_COUNTER_DEPTH, lightWood, 'Top');
  top.position.set(0, CUSTOMER_COUNTER_HEIGHT - 0.02, 0);
  root.add(body, top);
  return root;
}

/** Cutting board (manaita): 1 m wide, every cut and every nigiri happens here. */
export function createCuttingBoard(): Group {
  const root = new Group();
  root.name = 'CuttingBoard';
  const board = box(MANAITA_WIDTH, MANAITA_THICKNESS, MANAITA_DEPTH, paleWood, 'Board');
  board.position.y = MANAITA_THICKNESS / 2;
  root.add(board);
  return root;
}

/** Serving stand (geta): a plank on two feet, where finished sushi is served. */
export function createGeta(): Group {
  const root = new Group();
  root.name = 'Geta';
  const plank = box(0.26, 0.02, GETA_DEPTH, lightWood, 'Plank');
  plank.position.y = 0.04;
  const footL = box(0.03, 0.03, GETA_DEPTH - 0.02, lightWood, 'FootL');
  footL.position.set(-0.1, 0.015, 0);
  const footR = box(0.03, 0.03, GETA_DEPTH - 0.02, lightWood, 'FootR');
  footR.position.set(0.1, 0.015, 0);
  root.add(plank, footL, footR);
  return root;
}

const caseFloor = new MeshStandardMaterial({ color: '#3F8C5B', roughness: 0.8 });
const caseDark = new MeshStandardMaterial({ color: '#2A2D30', roughness: 0.5 });

/** Inside width of the neta case; saku are placed along it. */
export const NETA_CASE_WIDTH = 1.2;
/** Door track offsets from the case's chef-side edge (outer doors front, middle door back). */
export const NETA_DOOR_FRONT = 0.006;
export const NETA_DOOR_BACK = 0.017;
export { NETA_CASE_DEPTH };

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
  const H = NETA_CASE_HEIGHT;
  const base = box(W, 0.05, D, steel, 'Base');
  base.position.y = 0.025;
  const floor = box(W - 0.2, 0.004, D - 0.04, caseFloor, 'Floor');
  floor.position.set(0.08, 0.052, 0);
  // Compressor housing at the left end.
  const housing = box(0.16, H, D, steel, 'Housing');
  housing.position.set(-W / 2 + 0.08, H / 2, 0);
  const panel = box(0.004, 0.05, 0.1, caseDark, 'HousingPanel');
  panel.position.set(-W / 2 + 0.162, 0.14, 0);
  // Glass, sloped for a view in: the customer-side front leans back toward
  // the chef, and the top falls gently toward the customer. Right end glass.
  const glassW = W - 0.16;
  const glassX = 0.08;
  const frontBottom = { y: 0.05, z: -D / 2 + 0.005 };
  const frontTop = { y: H - 0.02, z: -D / 2 + 0.07 };
  const frontLen = Math.hypot(frontTop.y - frontBottom.y, frontTop.z - frontBottom.z);
  const front = box(glassW, frontLen, 0.006, glass, 'GlassFront');
  front.rotation.x = Math.atan2(frontTop.z - frontBottom.z, frontTop.y - frontBottom.y);
  front.position.set(glassX, (frontBottom.y + frontTop.y) / 2, (frontBottom.z + frontTop.z) / 2);
  const topBack = { y: H, z: D / 2 - 0.02 };
  const topLen = Math.hypot(topBack.z - frontTop.z, topBack.y - frontTop.y);
  const top = box(glassW, 0.006, topLen, glass, 'GlassTop');
  top.rotation.x = -Math.atan2(topBack.y - frontTop.y, topBack.z - frontTop.z);
  top.position.set(glassX, (frontTop.y + topBack.y) / 2 - 0.003, (frontTop.z + topBack.z) / 2);
  const end = box(0.006, H - 0.07, D, glass, 'GlassEnd');
  end.position.set(W / 2 - 0.003, 0.05 + (H - 0.07) / 2, 0);
  const railTop = box(glassW, 0.01, 0.01, steel, 'RailTop');
  railTop.position.set(glassX, frontTop.y, frontTop.z);
  // LED strip under the top at the chef side: lights the fish (brighter while a door is open).
  const led = box(glassW - 0.02, 0.006, 0.012, ledLight, 'LedStrip');
  led.position.set(glassX, H - 0.012, D / 2 - 0.035);
  const railBottom = box(glassW, 0.01, 0.01, steel, 'RailBottom');
  railBottom.position.set(glassX, 0.055, -D / 2 + 0.005);
  root.add(base, floor, housing, panel, front, top, end, railTop, railBottom, led);

  // Chef side (+Z): one sliding glass door per saku slot, on two tracks so an
  // open door slides over its neighbour; NetaCaseSystem opens them as the
  // neta hand comes near. A fixed pane closes the right end.
  const doorH = H - 0.075;
  const doorY = 0.058 + doorH / 2;
  for (let i = 0; i < 3; i++) {
    const door = new Group();
    door.name = `Door${i}`;
    door.position.set((i - 1) * NETA_SLOT_PITCH, doorY, D / 2 - (i === 1 ? NETA_DOOR_BACK : NETA_DOOR_FRONT));
    const pane = box(NETA_SLOT_PITCH - 0.006, doorH, 0.004, glass, 'Pane');
    const stiles = new Mesh(
      mergeBoxes([
        { w: 0.008, h: doorH, d: 0.008, x: -NETA_SLOT_PITCH / 2 + 0.004, y: 0, z: 0 },
        { w: 0.008, h: doorH, d: 0.008, x: NETA_SLOT_PITCH / 2 - 0.004, y: 0, z: 0 },
        // Pull handle near the leading edge, on the chef's face.
        { w: 0.01, h: 0.06, d: 0.01, x: (i === 2 ? -1 : 1) * (NETA_SLOT_PITCH / 2 - 0.03), y: 0, z: 0.007 },
      ]),
      steel,
    );
    stiles.name = 'Stiles';
    door.add(pane, stiles);
    root.add(door);
  }
  const doorsEnd = 1.5 * NETA_SLOT_PITCH;
  const glassEnd = glassX + glassW / 2;
  const fixed = box(glassEnd - doorsEnd, doorH, 0.004, glass, 'FixedPane');
  fixed.position.set((doorsEnd + glassEnd) / 2, doorY, D / 2 - NETA_DOOR_FRONT);
  const rails = new Mesh(
    mergeBoxes([
      { w: glassW, h: 0.008, d: 0.024, x: glassX, y: 0.054, z: D / 2 - 0.012 },
      { w: glassW, h: 0.008, d: 0.024, x: glassX, y: H - 0.01, z: D / 2 - 0.012 },
    ]),
    steel,
  );
  rails.name = 'DoorRails';
  root.add(fixed, rails);
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

const tubWood = new MeshStandardMaterial({ color: '#E2C9A0', roughness: 0.7, side: DoubleSide });
const copper = new MeshStandardMaterial({ color: '#B87333', roughness: 0.4, metalness: 0.6 });
const riceWhite = new MeshStandardMaterial({ color: '#F2EFE6', roughness: 0.9 });

/**
 * Ohitsu: the rice tub low on the chef's right, a cypress tub with two copper
 * hoops on a low stand, and a wooden lid (`Lid`) that RiceTubSystem slides
 * aside while the rice hand reaches in. Origin: the rice surface (the rice
 * tub station's height); the stand reaches down to the floor, which is
 * standHeight + 0.12 below it.
 */
export function createRiceTub(standHeight = 0.28): Group {
  const root = new Group();
  root.name = 'RiceTub';
  const R = 0.16;
  const m = (x: number, y: number, z: number, rx = 0) => new Matrix4().makeRotationX(rx).setPosition(x, y, z);
  const tub = new Mesh(
    mergeGeometries([
      [new CylinderGeometry(R, R - 0.01, 0.12, 24, 1, false), m(0, -0.06, 0)],
      [new CylinderGeometry(R, R, 0.05, 24, 1, true), m(0, 0.025, 0)],
    ]),
    tubWood,
  );
  tub.name = 'Tub';
  const rice = new Mesh(new CylinderGeometry(R - 0.008, R - 0.008, 0.01, 24, 1), riceWhite);
  rice.name = 'Rice';
  rice.position.y = 0.005;
  const hoop = new TorusGeometry(R + 0.003, 0.005, 6, 32);
  const hoops = new Mesh(mergeGeometries([[hoop, m(0, -0.09, 0, Math.PI / 2)], [hoop, m(0, 0.03, 0, Math.PI / 2)]]), copper);
  hoops.name = 'Hoops';
  const stand = box(0.34, standHeight, 0.34, darkWood, 'Stand');
  stand.position.y = -0.12 - standHeight / 2;
  // Lid: a board disc with a handle across it, resting on the rim.
  const lid = new Group();
  lid.name = 'Lid';
  const lidBody = new Mesh(
    mergeGeometries([
      [new CylinderGeometry(R + 0.012, R + 0.012, 0.018, 24, 1), m(0, 0.059, 0)],
      [new BoxGeometry(0.2, 0.018, 0.03), m(0, 0.077, 0)],
    ]),
    tubWood,
  );
  lidBody.name = 'LidBody';
  lid.add(lidBody);
  root.add(stand, tub, rice, hoops, lid);
  return root;
}
