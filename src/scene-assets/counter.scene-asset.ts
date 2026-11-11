import {
  BoxGeometry,
  type BufferGeometry,
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
  KNIFE_HOLDER_HEIGHT,
  KNIFE_HOLDER_LENGTH,
  KNIFE_HOLDER_LIP,
  KNIFE_HOLDER_TOOL_BAY,
  KNIFE_HOLDER_WALL,
  KNIFE_HOLDER_WIDTH,
  KNIFE_PITCH_DEG,
  KNIFE_REST,
  MANAITA_DEPTH,
  MANAITA_THICKNESS,
  MANAITA_WIDTH,
  NETA_CASE_DEPTH,
  NETA_CASE_HEIGHT,
  NETA_CASE_WIDTH,
  NETA_DOOR_COUNT,
  NETA_DOOR_PITCH,
  NETA_HOUSING_WIDTH,
  RICE_TUB_TOP,
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
/** The yanagiba's ground bevel (切刃): polished brighter than the flat. */
const bevelSteel = new MeshStandardMaterial({ color: '#EEF1F4', roughness: 0.12, metalness: 0.9 });
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

const stainless = new MeshStandardMaterial({ color: '#C4C9CE', roughness: 0.38, metalness: 0.7 });
const coldDark = new MeshStandardMaterial({ color: '#25282B', roughness: 0.6 });
const coldDisplay = new MeshStandardMaterial({ color: '#0E1A12', emissive: '#3BD16F', emissiveIntensity: 0.5, roughness: 0.3 });

/**
 * Chef's work counter: a stainless cold table (under-counter refrigerator)
 * the manaita sits on. Its front faces the chef (+Z): a machine compartment
 * with a louvred vent and a small temperature display at the left end, then
 * three hinged doors with a bar pull along the top of each, all over a dark
 * recessed plinth. Origin: floor, centred on the table.
 */
export function createCounter(): Group {
  const root = new Group();
  root.name = 'Counter';
  const W = BAR_LENGTH;
  const D = WORK_COUNTER_DEPTH;
  const topT = 0.035;
  const plinthH = 0.09;
  const bodyTop = WORK_COUNTER_TOP - topT;
  const bodyH = bodyTop - plinthH;
  const front = D / 2;
  const machineW = 0.36;
  const doorCount = 3;
  const doorW = (W - machineW) / doorCount;
  const panel: Parameters<typeof mergeBoxes>[0] = [
    // Top with a rounded-looking front nose, the cabinet shell and its ends.
    { w: W, h: topT, d: D, x: 0, y: bodyTop + topT / 2, z: 0 },
    { w: W, h: 0.012, d: 0.018, x: 0, y: bodyTop - 0.004, z: front - 0.009 },
    { w: W - 0.01, h: bodyH, d: D - 0.03, x: 0, y: plinthH + bodyH / 2, z: -0.012 },
    // Machine compartment front.
    { w: machineW - 0.006, h: bodyH - 0.02, d: 0.012, x: -W / 2 + machineW / 2, y: plinthH + bodyH / 2, z: front - 0.022 },
  ];
  const dark: Parameters<typeof mergeBoxes>[0] = [
    // Recessed plinth.
    { w: W - 0.04, h: plinthH, d: D - 0.08, x: 0, y: plinthH / 2, z: -0.02 },
  ];
  const pulls: Parameters<typeof mergeBoxes>[0] = [];
  // Louvred vent on the machine compartment, and the temperature display above it.
  for (let i = 0; i < 9; i++) {
    dark.push({ w: machineW - 0.08, h: 0.008, d: 0.006, x: -W / 2 + machineW / 2, y: plinthH + 0.06 + i * 0.026, z: front - 0.014 });
  }
  dark.push({ w: 0.09, h: 0.04, d: 0.006, x: -W / 2 + machineW / 2, y: bodyTop - 0.07, z: front - 0.014 });
  for (let i = 0; i < doorCount; i++) {
    const x = -W / 2 + machineW + (i + 0.5) * doorW;
    // Door leaf, its gasket line, and a bar pull on two standoffs near the top.
    panel.push({ w: doorW - 0.012, h: bodyH - 0.02, d: 0.02, x, y: plinthH + bodyH / 2, z: front - 0.02 });
    dark.push({ w: doorW - 0.004, h: bodyH - 0.012, d: 0.004, x, y: plinthH + bodyH / 2, z: front - 0.031 });
    pulls.push({ w: doorW - 0.12, h: 0.014, d: 0.014, x, y: bodyTop - 0.06, z: front + 0.022 });
    pulls.push({ w: 0.012, h: 0.012, d: 0.024, x: x - doorW / 2 + 0.07, y: bodyTop - 0.06, z: front + 0.006 });
    pulls.push({ w: 0.012, h: 0.012, d: 0.024, x: x + doorW / 2 - 0.07, y: bodyTop - 0.06, z: front + 0.006 });
  }
  const body = new Mesh(mergeBoxes(panel), stainless);
  body.name = 'ColdTableBody';
  const trim = new Mesh(mergeBoxes(dark), coldDark);
  trim.name = 'ColdTableTrim';
  const bars = new Mesh(mergeBoxes(pulls), steel);
  bars.name = 'ColdTablePulls';
  const display = box(0.07, 0.022, 0.004, coldDisplay, 'ColdTableDisplay');
  display.position.set(-W / 2 + machineW / 2, bodyTop - 0.07, front - 0.0095);
  root.add(body, trim, bars, display);
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

/** Door track offsets from the case's chef-side edge (even doors on the front track, odd on the back). */
export const NETA_DOOR_FRONT = 0.006;
export const NETA_DOOR_BACK = 0.017;
export { NETA_CASE_DEPTH };

/**
 * Neta case: a long, low refrigerated showcase between chef and customer,
 * like the stainless counter-top cases in sushi bars. Stainless base, green
 * floor inside, a sloped glass front on the customer side, a glass top and a
 * glass end. The compressor housing sits at the left end; the glass part to
 * its right is closed on the chef side (+Z) by sliding glass doors.
 */
export function createNetaCase(): Group {
  const root = new Group();
  root.name = 'NetaCase';
  const W = NETA_CASE_WIDTH;
  const D = NETA_CASE_DEPTH;
  const H = NETA_CASE_HEIGHT;
  const glassW = W - NETA_HOUSING_WIDTH;
  const glassX = NETA_HOUSING_WIDTH / 2;
  const glassLeft = -W / 2 + NETA_HOUSING_WIDTH;
  const base = box(W, 0.05, D, steel, 'Base');
  base.position.y = 0.025;
  const floor = box(glassW - 0.03, 0.004, D - 0.04, caseFloor, 'Floor');
  floor.position.set(glassX, 0.052, 0);
  // Compressor housing at the left end.
  const housing = box(NETA_HOUSING_WIDTH, H, D, steel, 'Housing');
  housing.position.set(-W / 2 + NETA_HOUSING_WIDTH / 2, H / 2, 0);
  const panel = box(0.004, 0.05, 0.1, caseDark, 'HousingPanel');
  panel.position.set(glassLeft + 0.002, 0.14, 0);
  // Glass, sloped for a view in: the customer-side front leans back toward
  // the chef, and the top falls gently toward the customer. Right end glass.
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

  // Chef side (+Z): sliding glass doors side by side, alternating between two
  // tracks so an open door slides over its neighbour; NetaCaseSystem opens
  // them as a hand comes near. A pull on each stile, since a door may slide
  // either way.
  const doorH = H - 0.075;
  const doorY = 0.058 + doorH / 2;
  const P = NETA_DOOR_PITCH;
  const stiles = mergeBoxes([
    { w: 0.008, h: doorH, d: 0.008, x: -P / 2 + 0.004, y: 0, z: 0 },
    { w: 0.008, h: doorH, d: 0.008, x: P / 2 - 0.004, y: 0, z: 0 },
    { w: 0.01, h: 0.06, d: 0.01, x: -P / 2 + 0.03, y: 0, z: 0.007 },
    { w: 0.01, h: 0.06, d: 0.01, x: P / 2 - 0.03, y: 0, z: 0.007 },
  ]);
  const paneGeometry = new BoxGeometry(P - 0.006, doorH, 0.004);
  for (let i = 0; i < NETA_DOOR_COUNT; i++) {
    const door = new Group();
    door.name = `Door${i}`;
    door.position.set(glassLeft + (i + 0.5) * P, doorY, D / 2 - (i % 2 === 1 ? NETA_DOOR_BACK : NETA_DOOR_FRONT));
    const pane = new Mesh(paneGeometry, glass);
    pane.name = 'Pane';
    const frame = new Mesh(stiles, steel);
    frame.name = 'Stiles';
    door.add(pane, frame);
    root.add(door);
  }
  const rails = new Mesh(
    mergeBoxes([
      { w: glassW, h: 0.008, d: 0.024, x: glassX, y: 0.054, z: D / 2 - 0.012 },
      { w: glassW, h: 0.008, d: 0.024, x: glassX, y: H - 0.01, z: D / 2 - 0.012 },
    ]),
    steel,
  );
  rails.name = 'DoorRails';
  root.add(rails);
  return root;
}

/** Yanagiba: a long single-edged slicing knife. Blade runs along +X. */
/**
 * The yanagiba, lying on its flat: blade along +X from the handle, edge on
 * +Z. A single-bevel knife: its ground bevel (切刃), a bright band along
 * the edge, is on the top face, the shinogi line its inner border. Its
 * mirror image is a left-handed yanagiba (src/handedness.ts mirrors it),
 * the band then on the other face for the same edge.
 */
export function createKnife(): Group {
  const root = new Group();
  root.name = 'Knife';
  const blade = box(0.27, 0.004, 0.032, steel, 'Blade');
  blade.position.set(0.075, 0.016, 0);
  const bevel = box(0.262, 0.0006, 0.009, bevelSteel, 'Bevel');
  bevel.position.set(0.079, 0.0183, 0.0115);
  const shinogi = box(0.262, 0.0007, 0.0012, lacquer, 'Shinogi');
  shinogi.position.set(0.079, 0.0183, 0.0066);
  root.add(bevel, shinogi);
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

/**
 * The knife box (包丁桶; the user's photo): a long open hinoki box lying on
 * the counter, its length running away from the chef (-Z): two slots side
 * by side for the knives, either side of a partition, and a bay at the far
 * end where the cooking chopsticks stand. The lip at the chef's end is low:
 * the yanagiba lies over it, blade in the box pitched down to the floor,
 * handle out toward the chef (src/layout.ts KNIFE_REST). Origin: counter
 * contact under the box's centre. Mirrored in X for a left-handed chef
 * (src/handedness.ts).
 */
export function createKnifeHolder(): Group {
  const root = new Group();
  root.name = 'KnifeHolder';
  const L = KNIFE_HOLDER_LENGTH;
  const W = KNIFE_HOLDER_WIDTH;
  const H = KNIFE_HOLDER_HEIGHT;
  const t = KNIFE_HOLDER_WALL;
  const floorT = 0.01;
  const floor = box(W, floorT, L, paleWood, 'Floor');
  floor.position.y = floorT / 2;
  root.add(floor);
  for (const [i, x] of [-(W - t) / 2, (W - t) / 2].entries()) {
    const side = box(t, H, L, paleWood, `Side${i + 1}`);
    side.position.set(x, H / 2, 0);
    root.add(side);
  }
  const farEnd = box(W - 2 * t, H, t, paleWood, 'FarEnd');
  farEnd.position.set(0, H / 2, -(L - t) / 2);
  const lip = box(W - 2 * t, KNIFE_HOLDER_LIP, t, paleWood, 'Lip');
  lip.position.set(0, KNIFE_HOLDER_LIP / 2, (L - t) / 2);
  // The wall across, closing the chopsticks' bay, and the partition along, between the two slots.
  const bayWallZ = -L / 2 + t + KNIFE_HOLDER_TOOL_BAY + t / 2;
  const bayWall = box(W - 2 * t, H, t, paleWood, 'BayWall');
  bayWall.position.set(0, H / 2, bayWallZ);
  const slotsFrom = bayWallZ + t / 2;
  const slotsTo = L / 2 - t;
  const partition = box(t, H, slotsTo - slotsFrom, paleWood, 'Partition');
  partition.position.set(0, H / 2, (slotsFrom + slotsTo) / 2);
  root.add(farEnd, lip, bayWall, partition);
  // Two cooking chopsticks (菜箸) standing in the bay, leaning a little on the far wall.
  const stickLength = 0.33;
  const baseZ = -L / 2 + t + 0.012;
  for (const [i, [x, leanDeg]] of ([[-0.014, -3], [0.012, -2.5]] as const).entries()) {
    const stick = new Mesh(new CylinderGeometry(0.003, 0.0038, stickLength, 8, 1), bamboo);
    stick.name = `Chopstick${i + 1}`;
    const lean = (leanDeg * Math.PI) / 180;
    stick.rotation.x = lean;
    stick.position.set(x, floorT + (stickLength / 2) * Math.cos(lean), baseZ + (stickLength / 2) * Math.sin(lean));
    root.add(stick);
  }
  return root;
}

/** The box with the knife lying in it, for the isolated preview (src/assets.ts knife-holder-preview). */
export function createKnifeHolderPreview(): Group {
  const root = new Group();
  root.name = 'KnifeHolderPreview';
  const knife = createKnife();
  knife.position.set(...KNIFE_REST);
  // Blade (local +X) into the box (-Z), edge outward (+X), pitched down: Euler XYZ (-pitch, 90°, 0), as the scene node has it.
  knife.rotation.set((-KNIFE_PITCH_DEG * Math.PI) / 180, Math.PI / 2, 0);
  root.add(createKnifeHolder(), knife);
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

const noriSheet = new MeshStandardMaterial({ color: '#1B2A1F', roughness: 0.55 });

/** The nori tin's height to its rim (its lid sits on it). */
export const NORI_TIN_HEIGHT = 0.068;

/**
 * The nori tin (海苔缶): a lacquered red tin with a gold line at its rim and
 * round its lid (no lettering: the owner's choice), its lid hinged at the
 * back. Inside, gold-tinned, a white plate with four holes over the drying
 * agent, and the nori on it (half sheets for rolls, strips for gunkan). The
 * lid ('Lid', pivot at its back edge) is raised by src/opening-system.ts
 * while a hand is near, and shut again to keep the nori dry. Origin: its
 * bottom centre; the chef's side +Z. About 20 x 11 x 7.5 cm.
 */
export function createNoriBox(): Group {
  const root = new Group();
  root.name = 'NoriBox';
  const W = 0.2;
  const D = 0.11;
  const H = NORI_TIN_HEIGHT;
  const t = 0.0015;
  const red = new MeshStandardMaterial({ color: '#C3301C', metalness: 0.3, roughness: 0.2 });
  const gold = new MeshStandardMaterial({ color: '#C9A659', metalness: 0.85, roughness: 0.28 });
  const tinned = new MeshStandardMaterial({ color: '#D8CBA2', metalness: 0.6, roughness: 0.32 });
  const white = new MeshStandardMaterial({ color: '#F1EEE8', roughness: 0.5 });
  const shell = new Mesh(
    mergeBoxes([
      { w: W, h: t, d: D, x: 0, y: t / 2, z: 0 },
      { w: W, h: H, d: t, x: 0, y: H / 2, z: D / 2 - t / 2 },
      { w: W, h: H, d: t, x: 0, y: H / 2, z: -D / 2 + t / 2 },
      { w: t, h: H, d: D, x: W / 2 - t / 2, y: H / 2, z: 0 },
      { w: t, h: H, d: D, x: -W / 2 + t / 2, y: H / 2, z: 0 },
    ]),
    red,
  );
  shell.name = 'Tin';
  const lining = new Mesh(
    mergeBoxes([
      { w: W - 2 * t, h: H - 0.004, d: 0.0006, x: 0, y: H / 2, z: D / 2 - t - 0.0003 },
      { w: W - 2 * t, h: H - 0.004, d: 0.0006, x: 0, y: H / 2, z: -D / 2 + t + 0.0003 },
      { w: 0.0006, h: H - 0.004, d: D - 2 * t, x: W / 2 - t - 0.0003, y: H / 2, z: 0 },
      { w: 0.0006, h: H - 0.004, d: D - 2 * t, x: -W / 2 + t + 0.0003, y: H / 2, z: 0 },
    ]),
    tinned,
  );
  lining.name = 'Lining';
  // The gold line round the tin, just below where the lid's skirt comes down.
  const band = new Mesh(
    mergeBoxes([
      { w: W + 0.001, h: 0.003, d: 0.0008, x: 0, y: H - 0.02, z: D / 2 + 0.0004 },
      { w: W + 0.001, h: 0.003, d: 0.0008, x: 0, y: H - 0.02, z: -D / 2 - 0.0004 },
      { w: 0.0008, h: 0.003, d: D + 0.001, x: W / 2 + 0.0004, y: H - 0.02, z: 0 },
      { w: 0.0008, h: 0.003, d: D + 0.001, x: -W / 2 - 0.0004, y: H - 0.02, z: 0 },
    ]),
    gold,
  );
  band.name = 'Band';
  // The perforated plate over the drying agent, and the nori on it.
  const plate = new Mesh(new BoxGeometry(W - 0.012, 0.002, D - 0.012).translate(0, 0.016, 0), white);
  plate.name = 'Plate';
  const holes = new Mesh(
    mergeBoxes([-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ w: 0.012, h: 0.0006, d: 0.012, x: sx * 0.055, y: 0.0172, z: sz * 0.025 })))),
    new MeshStandardMaterial({ color: '#3C3833', roughness: 0.9 }),
  );
  holes.name = 'PlateHoles';
  const nori = new Mesh(
    mergeBoxes([
      { w: 0.19, h: 0.012, d: 0.095, x: 0, y: 0.023, z: 0 },
      { w: 0.188, h: 0.0006, d: 0.093, x: 0.001, y: 0.0293, z: 0.001, ry: 0.01 },
    ]),
    noriSheet,
  );
  nori.name = 'Nori';
  // The lid: hinged at the back top edge, its skirt over the tin's rim.
  const lid = new Group();
  lid.name = 'Lid';
  lid.position.set(0, H, -D / 2 - 0.002);
  const L = 0.004;
  const skirt = 0.014;
  const lidShell = new Mesh(
    mergeBoxes([
      { w: W + 0.004, h: L, d: D + 0.004, x: 0, y: L / 2, z: D / 2 + 0.002 },
      { w: W + 0.004, h: skirt, d: t, x: 0, y: L - skirt / 2, z: D + 0.004 - t / 2 },
      { w: W + 0.004, h: skirt, d: t, x: 0, y: L - skirt / 2, z: t / 2 },
      { w: t, h: skirt, d: D + 0.004, x: W / 2 + 0.002 - t / 2, y: L - skirt / 2, z: D / 2 + 0.002 },
      { w: t, h: skirt, d: D + 0.004, x: -W / 2 - 0.002 + t / 2, y: L - skirt / 2, z: D / 2 + 0.002 },
    ]),
    red,
  );
  lidShell.name = 'LidShell';
  // A gold line round the lid's top, inset from its edge.
  const inset = 0.008;
  const lidLine = new Mesh(
    mergeBoxes([
      { w: W - 2 * inset, h: 0.0006, d: 0.0025, x: 0, y: L + 0.0003, z: inset + 0.002 },
      { w: W - 2 * inset, h: 0.0006, d: 0.0025, x: 0, y: L + 0.0003, z: D + 0.002 - inset },
      { w: 0.0025, h: 0.0006, d: D - 2 * inset, x: W / 2 - inset, y: L + 0.0003, z: D / 2 + 0.002 },
      { w: 0.0025, h: 0.0006, d: D - 2 * inset, x: -W / 2 + inset, y: L + 0.0003, z: D / 2 + 0.002 },
    ]),
    gold,
  );
  lidLine.name = 'LidLine';
  lid.add(lidShell, lidLine);
  root.add(shell, lining, band, plate, holes, nori, lid);
  return root;
}

const bamboo = new MeshStandardMaterial({ color: '#CDB67E', roughness: 0.6 });
const cotton = new MeshStandardMaterial({ color: '#3B3A35', roughness: 0.9 });

/** Makisu size: slats along X, the mat rolls forward along Z. */
export const MAKISU_WIDTH = 0.24;
export const MAKISU_DEPTH = 0.22;

/**
 * Makisu: the bamboo rolling mat, origin at its centre on the board. `Open`
 * is the mat laid out for a roll; `Rolled` is the same mat rolled up and
 * put aside at the board's left edge. The roll system shows one or the
 * other (open while a roll is ordered).
 */
export function createMakisu(): Group {
  const root = new Group();
  root.name = 'Makisu';
  const slats: Array<[BufferGeometry, Matrix4]> = [];
  const slat = new CylinderGeometry(0.0036, 0.0036, MAKISU_WIDTH, 6, 1).rotateZ(Math.PI / 2);
  const count = 24;
  for (let i = 0; i < count; i++) {
    const z = -MAKISU_DEPTH / 2 + ((i + 0.5) * MAKISU_DEPTH) / count;
    slats.push([slat, new Matrix4().makeScale(1, 0.55, 1).setPosition(0, 0.002, z)]);
  }
  const open = new Mesh(mergeGeometries(slats), bamboo);
  open.name = 'Open';
  const strings = new Mesh(
    mergeBoxes([-0.09, -0.03, 0.03, 0.09].map((x) => ({ w: 0.0016, h: 0.0016, d: MAKISU_DEPTH, x, y: 0.004, z: 0 }))),
    cotton,
  );
  strings.name = 'Strings';
  open.add(strings);
  const rolled = new Mesh(new CylinderGeometry(0.019, 0.019, MAKISU_WIDTH, 16, 1).rotateX(Math.PI / 2), bamboo);
  rolled.name = 'Rolled';
  rolled.position.set(-0.25, 0.019, 0);
  root.add(open, rolled);
  open.visible = false;
  return root;
}

const tubWood = new MeshStandardMaterial({ color: '#E2C9A0', roughness: 0.7, side: DoubleSide });
const copper = new MeshStandardMaterial({ color: '#B87333', roughness: 0.4, metalness: 0.6 });
const riceWhite = new MeshStandardMaterial({ color: '#F2EFE6', roughness: 0.9 });

/**
 * Ohitsu: the rice tub on the chef's right, a cypress tub with two copper
 * hoops on a low stand (between knee and waist), and a wooden lid (`Lid`) that RiceTubSystem slides
 * aside while the rice hand reaches in. Origin: the rice surface (the rice
 * tub station's height); the stand reaches down to the floor, which is
 * standHeight + 0.12 below it.
 */
export function createRiceTub(standHeight = RICE_TUB_TOP - 0.12): Group {
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
