import {
  type BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import { boxBatch, type BoxPart, mergeBoxes, mergeGeometries } from './lib/batch.js';
import { seeded } from './lib/neta-paint.js';

/**
 * Small shop props for the morning prep and the opening: the trash bin with
 * its lid, the kitchen-paper box, the black dial telephone, the food shelf,
 * the shop entrance with its noren, and the office corner's phone shelf,
 * books board and staff call buttons. Each origin is at floor (or counter)
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

/** The seasoning bottles' caps. */
const capGold = new MeshStandardMaterial({ color: '#B49A5A', metalness: 0.7, roughness: 0.35 });

/**
 * An open wooden food shelf by the phone: the seasonings out where they can
 * be told apart (the owner), each with a paper label (its text written at
 * runtime by src/label-system.ts from the mesh's name, `Label:<text>`): soy
 * sauce, mirin, sake and rice vinegar bottles at eye level, salt and sugar
 * in lidded jars below them; tins and boxes, and a sack of rice at the
 * bottom (no brands). Origin: floor, front -Z, 0.8 wide and 0.35 deep.
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
  const paper = new MeshStandardMaterial({ color: '#F3EDDC', roughness: 0.85 });
  /** A paper label on an item's front (it faces -Z), its text in the mesh's name. */
  const label = (text: string, x: number, y: number, z: number, w = 0.075, h = 0.04): Mesh => {
    const m = new Mesh(new PlaneGeometry(w, h).rotateY(Math.PI), paper);
    m.name = `Label:${text}`;
    m.position.set(x, y, z);
    return m;
  };
  const items: Object3D[] = [];
  // The bottles at eye level: glass, the liquid's colour showing; a cap on each.
  const shelf3 = levels[3] + 0.0125;
  const bottles: Array<{ text: string; glass: string; tall: number; r: number }> = [
    { text: 'Soy sauce', glass: '#2B140A', tall: 0.26, r: 0.036 },
    { text: 'Mirin', glass: '#A8742A', tall: 0.26, r: 0.036 },
    { text: 'Sake', glass: '#2F5A33', tall: 0.3, r: 0.042 },
    { text: 'Rice vinegar', glass: '#D9C98E', tall: 0.26, r: 0.036 },
  ];
  bottles.forEach((b, i) => {
    const x = -0.28 + i * 0.185;
    const body = new Mesh(
      mergeGeometries([
        [new CylinderGeometry(b.r, b.r, b.tall * 0.72, 16), new Matrix4().makeTranslation(0, b.tall * 0.36, 0)],
        [new CylinderGeometry(0.013, b.r, b.tall * 0.18, 16), new Matrix4().makeTranslation(0, b.tall * 0.81, 0)],
        [new CylinderGeometry(0.013, 0.013, b.tall * 0.1, 12), new Matrix4().makeTranslation(0, b.tall * 0.95, 0)],
      ]),
      new MeshStandardMaterial({ color: b.glass, roughness: 0.12, metalness: 0.05 }),
    );
    body.name = `Bottle${b.text.replace(/\s/g, '')}`;
    body.position.set(x, shelf3, 0.0);
    const cap = new Mesh(new CylinderGeometry(0.015, 0.015, 0.012, 12), capGold);
    cap.position.set(x, shelf3 + b.tall + 0.006, 0);
    items.push(body, cap, label(b.text, x, shelf3 + b.tall * 0.38, -b.r - 0.002, 0.07, 0.045));
  });
  // Salt and sugar in lidded white jars, one shelf down, with the tins and boxes beside them.
  const shelf2 = levels[2] + 0.0125;
  const jar = new MeshStandardMaterial({ color: '#F4F2EC', roughness: 0.35 });
  const jarLid = new MeshStandardMaterial({ color: '#B8B4AA', roughness: 0.4, metalness: 0.4 });
  ['Salt', 'Sugar'].forEach((text, i) => {
    const x = -0.27 + i * 0.15;
    const body = new Mesh(new CylinderGeometry(0.055, 0.052, 0.13, 20).translate(0, 0.065, 0), jar);
    body.name = `Jar${text}`;
    body.position.set(x, shelf2, -0.02);
    const lid = new Mesh(new CylinderGeometry(0.057, 0.057, 0.018, 20).translate(0, 0.139, 0), jarLid);
    lid.position.set(x, shelf2, -0.02);
    items.push(body, lid, label(text, x, shelf2 + 0.07, -0.02 - 0.056, 0.075, 0.045));
  });
  const parts: BoxPart[] = [];
  for (let i = 0; i < 3; i++) parts.push({ w: 0.11, h: 0.14 + rnd() * 0.06, d: 0.16, x: 0.02 + i * 0.13, y: levels[2] + 0.09, z: 0.02 });
  for (let i = 0; i < 4; i++) parts.push({ w: 0.16, h: 0.12, d: 0.22, x: -0.27 + i * 0.18, y: levels[1] + 0.07, z: 0.01 });
  const boxes = boxBatch('Goods', goods, parts);
  const tint = ['#D8CBA8', '#B5432E', '#E4E0D6', '#7B8C5A', '#C8A060', '#E9E5DA', '#D7C49A'];
  const c = new Color();
  tint.forEach((hex, i) => boxes.setColorAt(i, c.set(hex)));
  if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
  // A sack of rice on the bottom shelf.
  const sack = new Mesh(new SphereGeometry(1, 14, 10).scale(0.3, 0.17, 0.15).translate(0, levels[0] + 0.15, 0.0), new MeshStandardMaterial({ color: '#E8E0CC', roughness: 0.95 }));
  sack.name = 'RiceSack';
  root.add(boxes, sack, ...items);
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

const hookBrass = new MeshStandardMaterial({ color: '#A88A4A', roughness: 0.4, metalness: 0.6 });

/**
 * A small wooden wall shelf for the telephone: a plank on two angled
 * brackets. Origin: wall contact at the middle of the plank's top (where the
 * phone stands); front -Z; 0.3 wide, 0.24 deep.
 */
export function createPhoneShelf(): Group {
  const root = new Group();
  root.name = 'PhoneShelf';
  const parts: BoxPart[] = [
    { w: 0.3, h: 0.022, d: 0.24, x: 0, y: -0.011, z: -0.12 },
    // Brackets: an upright on the wall and a strut under the plank.
    { w: 0.02, h: 0.16, d: 0.02, x: -0.11, y: -0.1, z: -0.01 },
    { w: 0.02, h: 0.16, d: 0.02, x: 0.11, y: -0.1, z: -0.01 },
    { w: 0.02, h: 0.02, d: 0.2, x: -0.11, y: -0.1, z: -0.09, rx: -0.65 },
    { w: 0.02, h: 0.02, d: 0.2, x: 0.11, y: -0.1, z: -0.09, rx: -0.65 },
  ];
  const shelf = new Mesh(mergeBoxes(parts), shelfWood);
  shelf.name = 'Shelf';
  root.add(shelf);
  return root;
}

/** The books board's paper: where the system writes the day's books. */
export const BOOKS_SHEET_WIDTH = 0.26;
export const BOOKS_SHEET_HEIGHT = 0.34;

/**
 * The day's books (帳簿) hung on the wall over the phone: a wooden board
 * with a sheet of paper ('BooksSheet') under a clip. The system writes the
 * takings, the fish shop's bill and the wages on it. Origin: wall contact at
 * the board's middle; front -Z; 0.3 x 0.4.
 */
export function createBooksBoard(): Group {
  const root = new Group();
  root.name = 'BooksBoard';
  const board = new Mesh(mergeBoxes([{ w: 0.3, h: 0.4, d: 0.012, x: 0, y: 0, z: -0.006 }]), shelfWood);
  board.name = 'Board';
  const sheet = new Mesh(mergeBoxes([{ w: BOOKS_SHEET_WIDTH, h: BOOKS_SHEET_HEIGHT, d: 0.002, x: 0, y: -0.015, z: -0.013 }]), paperWhite);
  sheet.name = 'BooksSheet';
  const clip = new Mesh(mergeBoxes([
    { w: 0.1, h: 0.035, d: 0.012, x: 0, y: 0.165, z: -0.019 },
    { w: 0.02, h: 0.012, d: 0.016, x: 0, y: 0.19, z: -0.016 },
  ]), hookBrass);
  clip.name = 'Clip';
  root.add(board, sheet, clip);
  return root;
}

/** Where each staff call button sits on its board, board-local x (the cook on the left, seen from the front). */
export const STAFF_BUTTON_X = { cook: 0.15, partTimer: -0.15 } as const;
export const STAFF_BUTTON_Y = -0.015;
/** The pilot lamp over each button: dark until the system lights it. */
export const STAFF_LAMP_Y = 0.085;
/** The buttons are drawn at this scale, to read from the seat. */
const STAFF_BUTTON_SCALE = 1.25;
const brass = new MeshStandardMaterial({ color: '#B08A4A', roughness: 0.35, metalness: 0.7 });
const lampOff = new MeshStandardMaterial({ color: '#4A2E1E', roughness: 0.2 });
const cookFace = new MeshStandardMaterial({ color: '#23305A', roughness: 0.5 });
const partTimerFace = new MeshStandardMaterial({ color: '#EDE6D4', roughness: 0.5 });
const coatWhite = new MeshStandardMaterial({ color: '#F4F2EC', roughness: 0.6 });
const uniformNavy = new MeshStandardMaterial({ color: '#2F3A4A', roughness: 0.6 });
const apronBrown = new MeshStandardMaterial({ color: '#7A5638', roughness: 0.6 });

/** A person's silhouette on a button face (head and shoulders), facing +Z before it is turned. */
function silhouette(cap: boolean): Array<[BufferGeometry, Matrix4]> {
  const body = new Shape();
  body.moveTo(-0.027, -0.036);
  body.lineTo(0.027, -0.036);
  body.lineTo(0.021, -0.002);
  body.quadraticCurveTo(0, 0.008, -0.021, -0.002);
  body.closePath();
  const parts: Array<[BufferGeometry, Matrix4]> = [
    [new ShapeGeometry(body, 6), new Matrix4()],
    [new CircleGeometry(0.0115, 18), new Matrix4().makeTranslation(0, 0.017, 0)],
  ];
  // The cook's tall white cap.
  if (cap) parts.push([mergeBoxes([{ w: 0.021, h: 0.016, d: 0.0005, x: 0, y: 0.034, z: 0 }]), new Matrix4()]);
  return parts;
}

/**
 * The staff call board in the office corner: a wooden board with two round
 * push buttons, the cook (a white figure with his cap, on indigo) on the
 * left and the part-timer (a navy figure in a brown apron, on cream) on the
 * right, each under a pilot lamp that is lit while they are asked. The
 * system finds the buttons and lamps by name ('CookButton', 'CookLamp',
 * 'PartTimerButton', 'PartTimerLamp'). Origin: wall contact at the board's
 * middle; front -Z; 0.6 x 0.22.
 */
export function createStaffButtons(): Group {
  const root = new Group();
  root.name = 'StaffButtons';
  const board = new Mesh(mergeBoxes([{ w: 0.6, h: 0.22, d: 0.018, x: 0, y: 0, z: -0.009 }]), shelfWood);
  board.name = 'StaffBoard';
  root.add(board);
  // Flat parts are made facing +Z and turned to face the front (-Z).
  const toFront = (z: number) => new Matrix4().makeTranslation(0, 0, z).multiply(new Matrix4().makeRotationY(Math.PI));
  const ring = new CylinderGeometry(0.06, 0.06, 0.014, 28).rotateX(Math.PI / 2);
  const disc = new CylinderGeometry(0.05, 0.05, 0.002, 28).rotateX(Math.PI / 2);
  for (const who of ['cook', 'partTimer'] as const) {
    const cook = who === 'cook';
    const name = cook ? 'Cook' : 'PartTimer';
    const button = new Group();
    button.name = name + 'Button';
    // Scaled up to read from the seat; its parts start at the board's face (z = -0.018) and stay there.
    button.position.set(STAFF_BUTTON_X[who], STAFF_BUTTON_Y, 0.018 * (STAFF_BUTTON_SCALE - 1));
    button.scale.setScalar(STAFF_BUTTON_SCALE);
    const bezel = new Mesh(mergeGeometries([[ring, new Matrix4().makeTranslation(0, 0, -0.025)]]), brass);
    bezel.name = name + 'Bezel';
    const face = new Mesh(mergeGeometries([[disc, new Matrix4().makeTranslation(0, 0, -0.033)]]), cook ? cookFace : partTimerFace);
    face.name = name + 'Face';
    const figure = new Mesh(
      mergeGeometries(silhouette(cook).map(([g, m]): [BufferGeometry, Matrix4] => [g, toFront(-0.0345).multiply(m)])),
      cook ? coatWhite : uniformNavy,
    );
    figure.name = name + 'Figure';
    button.add(bezel, face, figure);
    if (!cook) {
      const apron = new Mesh(mergeBoxes([{ w: 0.024, h: 0.03, d: 0.0005, x: 0, y: -0.021, z: -0.0352 }]), apronBrown);
      apron.name = 'PartTimerApron';
      button.add(apron);
    }
    const lamp = new Mesh(new SphereGeometry(0.012, 14, 10), lampOff);
    lamp.name = name + 'Lamp';
    lamp.position.set(STAFF_BUTTON_X[who], STAFF_LAMP_Y, -0.02);
    root.add(button, lamp);
  }
  return root;
}
