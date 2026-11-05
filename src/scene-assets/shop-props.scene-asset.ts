import { Color, CylinderGeometry, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { boxBatch, type BoxPart, mergeBoxes, mergeGeometries } from './lib/batch.js';
import { seeded } from './lib/neta-paint.js';

/**
 * Small shop props for the morning prep and the opening: the trash bin with
 * its lid, the kitchen-paper box, the black dial telephone, the food shelf
 * and the shop entrance with its noren. Each origin is at floor (or counter)
 * contact; each front faces -Z unless noted. Moving parts are named groups
 * (Lid, Handset, NorenInside, NorenOutside) that the systems animate.
 */

const plasticGrey = new MeshStandardMaterial({ color: '#B9BDBF', roughness: 0.55 });
const plasticDark = new MeshStandardMaterial({ color: '#8E9396', roughness: 0.5 });
const cardboard = new MeshStandardMaterial({ color: '#C9A77A', roughness: 0.9 });
const paperWhite = new MeshStandardMaterial({ color: '#F4F1EA', roughness: 0.95, side: DoubleSide });
const bakelite = new MeshStandardMaterial({ color: '#141414', roughness: 0.25 });
const dialCream = new MeshStandardMaterial({ color: '#E8E2D2', roughness: 0.4 });
const shelfWood = new MeshStandardMaterial({ color: '#8A6440', roughness: 0.75 });
const goods = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.5 });
const wallPlaster = new MeshStandardMaterial({ color: '#E6DED0', roughness: 0.95 });
const timber = new MeshStandardMaterial({ color: '#6B4A2E', roughness: 0.7 });
const lattice = new MeshStandardMaterial({ color: '#8C6A44', roughness: 0.7 });
const noren = new MeshStandardMaterial({ color: '#23305A', roughness: 0.92, side: DoubleSide });
const bamboo = new MeshStandardMaterial({ color: '#C8B27A', roughness: 0.6 });

/** Trash bin height and radius: the lid's top, where scraps are let go. */
export const TRASH_BIN_HEIGHT = 0.42;
export const TRASH_BIN_RADIUS = 0.12;

/** A round plastic trash bin; its lid ('Lid', hinged at the -X rim) swings open about Z. */
export function createTrashBin(): Group {
  const root = new Group();
  root.name = 'TrashBin';
  const H = TRASH_BIN_HEIGHT;
  const R = TRASH_BIN_RADIUS;
  const body = new Mesh(new CylinderGeometry(R, R * 0.9, H - 0.02, 24, 1, true), plasticGrey);
  body.position.y = (H - 0.02) / 2;
  body.name = 'Body';
  const bottom = new Mesh(new CylinderGeometry(R * 0.9, R * 0.9, 0.01, 24), plasticDark);
  bottom.position.y = 0.005;
  bottom.name = 'Bottom';
  const rim = new Mesh(new TorusGeometry(R, 0.007, 6, 28), plasticDark);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = H - 0.02;
  rim.name = 'Rim';
  const inside = new Mesh(new CylinderGeometry(R - 0.004, R * 0.9 - 0.004, H - 0.03, 24, 1, true), new MeshStandardMaterial({ color: '#3B3E40', roughness: 0.8, side: DoubleSide }));
  inside.position.y = (H - 0.03) / 2 + 0.008;
  inside.name = 'Inside';
  const hinge = new Group();
  hinge.name = 'Lid';
  hinge.position.set(-R, H - 0.012, 0);
  const lid = new Mesh(new CylinderGeometry(R + 0.006, R + 0.006, 0.016, 24), plasticGrey);
  lid.position.x = R;
  lid.name = 'LidTop';
  const knob = new Mesh(new CylinderGeometry(0.018, 0.018, 0.012, 12), plasticDark);
  knob.position.set(R * 1.6, 0.012, 0);
  knob.name = 'LidKnob';
  hinge.add(lid, knob);
  root.add(body, bottom, rim, inside, hinge);
  return root;
}

/** A box of kitchen paper with one sheet showing at its slot. Origin: bottom centre. */
export function createPaperBox(): Group {
  const root = new Group();
  root.name = 'PaperBox';
  const box = new Mesh(mergeBoxes([{ w: 0.2, h: 0.055, d: 0.1, x: 0, y: 0.0275, z: 0 }]), cardboard);
  box.name = 'Box';
  const sheet = new Mesh(mergeBoxes([
    { w: 0.09, h: 0.022, d: 0.002, x: 0, y: 0.066, z: 0, rx: 0.25 },
    { w: 0.06, h: 0.012, d: 0.002, x: 0.01, y: 0.08, z: -0.004, rx: -0.4, rz: 0.2 },
  ]), paperWhite);
  sheet.name = 'Sheet';
  root.add(box, sheet);
  return root;
}

/** A black dial telephone (kurodenwa): body, cream dial, the handset ('Handset') lying across its cradle. */
export function createPhone(): Group {
  const root = new Group();
  root.name = 'Telephone';
  const body = new Mesh(mergeBoxes([
    { w: 0.17, h: 0.06, d: 0.19, x: 0, y: 0.03, z: 0 },
    { w: 0.14, h: 0.03, d: 0.15, x: 0, y: 0.072, z: 0.005, rx: -0.12 },
    // Cradle forks.
    { w: 0.03, h: 0.03, d: 0.03, x: -0.06, y: 0.1, z: 0.035 },
    { w: 0.03, h: 0.03, d: 0.03, x: 0.06, y: 0.1, z: 0.035 },
  ]), bakelite);
  body.name = 'Body';
  const dial = new Mesh(new CylinderGeometry(0.045, 0.045, 0.008, 28), dialCream);
  dial.position.set(0, 0.086, -0.045);
  dial.rotation.x = -0.45;
  dial.name = 'Dial';
  const centre = new Mesh(new CylinderGeometry(0.016, 0.016, 0.01, 16), bakelite);
  centre.position.set(0, 0.09, -0.047);
  centre.rotation.x = -0.45;
  centre.name = 'DialCentre';
  const handset = new Group();
  handset.name = 'Handset';
  handset.position.set(0, 0.122, 0.035);
  const grip = new Mesh(
    mergeGeometries([
      [new CylinderGeometry(0.014, 0.014, 0.17, 10), new Matrix4().makeRotationZ(Math.PI / 2)],
      [new CylinderGeometry(0.026, 0.022, 0.03, 14), new Matrix4().makeTranslation(-0.085, -0.008, 0)],
      [new CylinderGeometry(0.026, 0.022, 0.03, 14), new Matrix4().makeTranslation(0.085, -0.008, 0)],
    ]),
    bakelite,
  );
  grip.name = 'Grip';
  handset.add(grip);
  // The coiled cord, hanging from the body's side.
  const coils: Array<[TorusGeometry, Matrix4]> = [];
  const coil = new TorusGeometry(0.008, 0.002, 4, 10);
  for (let i = 0; i < 9; i++) coils.push([coil, new Matrix4().makeRotationY(Math.PI / 2).setPosition(-0.095, 0.02 + i * 0.006, 0.02 - i * 0.004)]);
  const cord = new Mesh(mergeGeometries(coils), bakelite);
  cord.name = 'Cord';
  root.add(body, dial, centre, handset, cord);
  return root;
}

/**
 * An open wooden food shelf: four shelves of soy sauce, vinegar and mirin
 * bottles, tins, boxes and a sack of rice at the bottom (no labels or
 * brands). Origin: floor, front -Z, 0.8 wide and 0.35 deep.
 */
export function createFoodShelf(): Group {
  const root = new Group();
  root.name = 'FoodShelf';
  const W = 0.8;
  const D = 0.35;
  const H = 1.6;
  const frame: BoxPart[] = [
    { w: 0.03, h: H, d: D, x: -W / 2 + 0.015, y: H / 2, z: 0 },
    { w: 0.03, h: H, d: D, x: W / 2 - 0.015, y: H / 2, z: 0 },
    { w: W, h: H, d: 0.01, x: 0, y: H / 2, z: D / 2 - 0.005 },
  ];
  const levels = [0.05, 0.45, 0.85, 1.2, 1.57];
  for (const y of levels) frame.push({ w: W - 0.06, h: 0.025, d: D - 0.02, x: 0, y, z: 0 });
  root.add(boxBatch('ShelfFrame', shelfWood, frame));
  const rnd = seeded('food-shelf');
  const bottleColors = ['#3A1C10', '#3A1C10', '#E8E4D4', '#C9A64A', '#5A2A18'];
  const bottle = new CylinderGeometry(0.035, 0.035, 0.24, 12);
  const neck = new CylinderGeometry(0.012, 0.02, 0.06, 10);
  const colored: Mesh[] = [];
  bottleColors.forEach((color, i) => {
    const x = -0.3 + i * 0.13;
    const y = levels[3] + 0.0125;
    const m = new Mesh(mergeGeometries([
      [bottle, new Matrix4().makeTranslation(0, 0.12, 0)],
      [neck, new Matrix4().makeTranslation(0, 0.27, 0)],
    ]), new MeshStandardMaterial({ color, roughness: 0.2 }));
    m.position.set(x, y, 0.02);
    m.name = 'Bottle' + i;
    colored.push(m);
  });
  // Tins, boxes and jars on the middle shelves.
  const parts: BoxPart[] = [];
  for (let i = 0; i < 5; i++) parts.push({ w: 0.11, h: 0.14 + rnd() * 0.06, d: 0.16, x: -0.3 + i * 0.145, y: levels[2] + 0.09, z: 0.02 });
  for (let i = 0; i < 4; i++) parts.push({ w: 0.16, h: 0.12, d: 0.22, x: -0.27 + i * 0.18, y: levels[1] + 0.07, z: 0.01 });
  const boxes = boxBatch('Goods', goods, parts);
  const tint = ['#D8CBA8', '#B5432E', '#E4E0D6', '#7B8C5A', '#C8A060', '#E9E5DA', '#D7C49A', '#9C3B2C', '#E2D9C4'];
  const c = new Color();
  tint.forEach((hex, i) => boxes.setColorAt(i, c.set(hex)));
  if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
  // A sack of rice on the bottom shelf.
  const sack = new Mesh(new SphereGeometry(1, 14, 10).scale(0.3, 0.17, 0.15).translate(0, levels[0] + 0.15, 0.0), new MeshStandardMaterial({ color: '#E8E0CC', roughness: 0.95 }));
  sack.name = 'RiceSack';
  root.add(boxes, sack, ...colored);
  return root;
}

/** The entrance's door opening and its height. */
export const ENTRANCE_DOOR_WIDTH = 0.9;
export const ENTRANCE_DOOR_HEIGHT = 1.85;
/** Where the noren hangs (entrance-local): its pole's height, and inside (+Z, the customers' room) or outside (-Z). */
export const NOREN_POLE_Y = 1.9;
export const NOREN_OFFSET = 0.09;

/**
 * The shop's entrance: a short plastered wall with a timber-framed doorway
 * and a lattice sliding door, and the noren on its bamboo pole. Before
 * opening it hangs inside ('NorenInside'); hung outside ('NorenOutside',
 * hidden until then) the shop is open. Origin: floor at the doorway's
 * middle; +Z faces into the shop.
 */
export function createEntrance(): Group {
  const root = new Group();
  root.name = 'Entrance';
  const W = 2.2;
  const H = 2.3;
  const T = 0.1;
  const dw = ENTRANCE_DOOR_WIDTH;
  const dh = ENTRANCE_DOOR_HEIGHT;
  root.add(boxBatch('Wall', wallPlaster, [
    { w: (W - dw) / 2, h: H, d: T, x: -(dw + (W - dw) / 2) / 2, y: H / 2, z: 0 },
    { w: (W - dw) / 2, h: H, d: T, x: (dw + (W - dw) / 2) / 2, y: H / 2, z: 0 },
    { w: dw, h: H - dh, d: T, x: 0, y: dh + (H - dh) / 2, z: 0 },
  ]));
  root.add(boxBatch('DoorFrame', timber, [
    { w: 0.07, h: dh, d: T + 0.04, x: -dw / 2 - 0.035, y: dh / 2, z: 0 },
    { w: 0.07, h: dh, d: T + 0.04, x: dw / 2 + 0.035, y: dh / 2, z: 0 },
    { w: dw + 0.14, h: 0.08, d: T + 0.04, x: 0, y: dh + 0.04, z: 0 },
    { w: dw + 0.14, h: 0.03, d: T + 0.04, x: 0, y: 0.015, z: 0 },
  ]));
  // The lattice sliding door, shut.
  const bars: BoxPart[] = [
    { w: dw, h: 0.04, d: 0.03, x: 0, y: 0.06, z: 0 },
    { w: dw, h: 0.04, d: 0.03, x: 0, y: dh - 0.04, z: 0 },
    { w: 0.04, h: dh - 0.04, d: 0.03, x: -dw / 2 + 0.02, y: dh / 2, z: 0 },
    { w: 0.04, h: dh - 0.04, d: 0.03, x: dw / 2 - 0.02, y: dh / 2, z: 0 },
  ];
  for (let i = 1; i < 12; i++) bars.push({ w: 0.012, h: dh - 0.1, d: 0.02, x: -dw / 2 + (i * dw) / 12, y: dh / 2, z: 0 });
  for (let k = 1; k < 4; k++) bars.push({ w: dw - 0.04, h: 0.015, d: 0.022, x: 0, y: 0.08 + (k * (dh - 0.16)) / 4, z: 0 });
  root.add(boxBatch('LatticeDoor', lattice, bars));
  root.add(norenOn('NorenInside', NOREN_OFFSET, true), norenOn('NorenOutside', -NOREN_OFFSET, false));
  return root;
}

/** The noren on its bamboo pole, resting on two hooks, three panels hanging. */
function norenOn(name: string, z: number, visible: boolean): Group {
  const g = new Group();
  g.name = name;
  g.visible = visible;
  const pole = new Mesh(new CylinderGeometry(0.014, 0.014, ENTRANCE_DOOR_WIDTH + 0.3, 10), bamboo);
  pole.rotation.z = Math.PI / 2;
  pole.position.set(0, NOREN_POLE_Y, z);
  pole.name = 'Pole';
  const panels: BoxPart[] = [];
  const pw = (ENTRANCE_DOOR_WIDTH + 0.1) / 3;
  for (let i = 0; i < 3; i++) panels.push({ w: pw - 0.012, h: 0.62, d: 0.004, x: (i - 1) * pw, y: NOREN_POLE_Y - 0.32, z });
  const cloth = new Mesh(mergeBoxes(panels), noren);
  cloth.name = 'Cloth';
  const hooks = boxBatch('Hooks', timber, [
    { w: 0.02, h: 0.06, d: Math.abs(z) + 0.02, x: -ENTRANCE_DOOR_WIDTH / 2 - 0.08, y: NOREN_POLE_Y + 0.02, z: z / 2 },
    { w: 0.02, h: 0.06, d: Math.abs(z) + 0.02, x: ENTRANCE_DOOR_WIDTH / 2 + 0.08, y: NOREN_POLE_Y + 0.02, z: z / 2 },
  ]);
  g.add(pole, cloth, hooks);
  return g;
}
