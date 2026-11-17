import {
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';
import {
  CEILING_HEIGHT,
  CUSTOMER_SEAT_Z,
  EAVES_BACK_OVERLAP,
  ENTRANCE_X,
  ENTRANCE_Z,
  ROOM_END_X,
  STEP_HEIGHT,
  TSUKEDAI_CHEF_Z,
  TSUKEDAI_CUSTOMER_Z,
  WALL_THICKNESS,
} from '../layout.js';
import { type BoxPart, boxBatch, instances, mergeGeometries } from './lib/batch.js';

/**
 * The customers' room (客席) in front of the bar, one step below the chef's
 * floor: plaster walls with a wooden wainscot and timber posts that join the
 * entrance wall and the chef's room, a stone-tiled floor, a board ceiling
 * with two paper ceiling lamps, a shoji window beside the entrance, a
 * hanging scroll (bamboo in ink, no lettering) with a flower shelf on the
 * left wall, a pendulum wall clock on the right wall, an umbrella stand by
 * the door and three stools at the counter.
 *
 * Decoration only (no stations). Nothing here is a light source: the paper
 * of the window and the lamps is unlit, so it only looks bright.
 *
 * Origin: the player's floor point (layout origin), like itaba-room; the
 * customer floor is at y = -STEP_HEIGHT.
 */

const plaster = new MeshStandardMaterial({ color: '#D9CDB4', roughness: 0.95 });
const wood = new MeshStandardMaterial({ color: '#5A4130', roughness: 0.7 });
const paleWood = new MeshStandardMaterial({ color: '#C9A36B', roughness: 0.7 });
const stone = new MeshStandardMaterial({ color: '#57534E', roughness: 0.85 });
const grout = new MeshStandardMaterial({ color: '#7C776F', roughness: 0.95 });
const glow = new MeshBasicMaterial({ color: '#F6EAC8' });
const paper = new MeshStandardMaterial({ color: '#EFE6D2', roughness: 0.95 });
const mount = new MeshStandardMaterial({ color: '#5F6A52', roughness: 1.0 });
const ink = new MeshStandardMaterial({ color: '#2A2A28', roughness: 0.9 });
const celadon = new MeshStandardMaterial({ color: '#8FA89A', roughness: 0.35 });
const camellia = new MeshStandardMaterial({ color: '#B5302E', roughness: 0.7 });
const leaf = new MeshStandardMaterial({ color: '#3F5B36', roughness: 0.8 });
const brass = new MeshStandardMaterial({ color: '#A88A4A', roughness: 0.4, metalness: 0.6 });
const glaze = new MeshStandardMaterial({ color: '#34435C', roughness: 0.4 });
const umbrellaCloth = new MeshStandardMaterial({ color: '#2B2726', roughness: 0.9 });

/** The room's inner faces: left wall, right wall, the entrance wall's face, the bar's line. */
const Y0 = -STEP_HEIGHT;
const XL = ENTRANCE_X - 1.1;
const XR = ROOM_END_X;
const ZF = ENTRANCE_Z + 0.05;
const ZB = TSUKEDAI_CUSTOMER_Z;
const span = (a: number, b: number) => ({ size: b - a, mid: (a + b) / 2 });

/** Walls, posts, wainscot, floor and ceiling. */
function shell(root: Group): void {
  const T = WALL_THICKNESS;
  const H = CEILING_HEIGHT;
  const hh = H - Y0;
  const yc = (H + Y0) / 2;
  const zOut = ZF - 0.1;
  const side = span(zOut, ZB);
  const xLeftOfBar = -ROOM_END_X - T;
  const entranceTop = Y0 + 2.3;
  root.add(boxBatch('Walls', plaster, [
    { w: T, h: hh, d: side.size, x: XL - T / 2, y: yc, z: side.mid },
    { w: T, h: hh, d: side.size, x: XR + T / 2, y: yc, z: side.mid },
    // The return beside the chef's room, on the left.
    { w: xLeftOfBar - (XL - T), h: hh, d: T, x: (xLeftOfBar + XL - T) / 2, y: yc, z: ZB + T / 2 },
    // The front wall right of the entrance, and the strip over the entrance wall.
    { w: XR + T - (ENTRANCE_X + 1.1), h: hh, d: 0.1, x: (XR + T + ENTRANCE_X + 1.1) / 2, y: yc, z: ZF - 0.05 },
    { w: 2.2 + T, h: H - entranceTop, d: 0.1, x: ENTRANCE_X - T / 2, y: (H + entranceTop) / 2, z: ZF - 0.05 },
  ]));

  const ceilingZ1 = TSUKEDAI_CHEF_Z + EAVES_BACK_OVERLAP;
  const ceil = span(zOut, ceilingZ1);
  const across = span(XL - T, XR + T);
  const inner = span(ZF, ZB);
  const wy = Y0 + 0.45;
  const capY = Y0 + 0.9 + 0.015;
  const railY = 1.95;
  const trim: BoxPart[] = [
    { w: across.size, h: 0.03, d: ceil.size, x: across.mid, y: H + 0.015, z: ceil.mid },
    // Wainscot: left, right, the return, the front wall right of the entrance, the entrance wall's two sides.
    { w: 0.015, h: 0.9, d: inner.size, x: XL + 0.0075, y: wy, z: inner.mid },
    { w: 0.015, h: 0.9, d: inner.size, x: XR - 0.0075, y: wy, z: inner.mid },
    { w: xLeftOfBar - XL, h: 0.9, d: 0.015, x: (xLeftOfBar + XL) / 2, y: wy, z: ZB - 0.0075 },
    { w: XR - (ENTRANCE_X + 1.1), h: 0.9, d: 0.015, x: (XR + ENTRANCE_X + 1.1) / 2, y: wy, z: ZF + 0.0075 },
    { w: 0.58, h: 0.9, d: 0.015, x: ENTRANCE_X - 0.81, y: wy, z: ZF + 0.0075 },
    { w: 0.58, h: 0.9, d: 0.015, x: ENTRANCE_X + 0.81, y: wy, z: ZF + 0.0075 },
    // Its cap rail.
    { w: 0.03, h: 0.03, d: inner.size, x: XL + 0.015, y: capY, z: inner.mid },
    { w: 0.03, h: 0.03, d: inner.size, x: XR - 0.015, y: capY, z: inner.mid },
    { w: xLeftOfBar - XL, h: 0.03, d: 0.03, x: (xLeftOfBar + XL) / 2, y: capY, z: ZB - 0.015 },
    { w: XR - (ENTRANCE_X + 1.1), h: 0.03, d: 0.03, x: (XR + ENTRANCE_X + 1.1) / 2, y: capY, z: ZF + 0.015 },
    { w: 0.58, h: 0.03, d: 0.03, x: ENTRANCE_X - 0.81, y: capY, z: ZF + 0.015 },
    { w: 0.58, h: 0.03, d: 0.03, x: ENTRANCE_X + 0.81, y: capY, z: ZF + 0.015 },
    // The head rail (長押) round the room, level with the eaves.
    { w: 0.02, h: 0.07, d: inner.size, x: XL + 0.01, y: railY, z: inner.mid },
    { w: 0.02, h: 0.07, d: inner.size, x: XR - 0.01, y: railY, z: inner.mid },
    { w: XR - XL, h: 0.07, d: 0.02, x: (XR + XL) / 2, y: railY + 0.2, z: ZF + 0.01 },
    { w: xLeftOfBar - XL, h: 0.07, d: 0.02, x: (xLeftOfBar + XL) / 2, y: railY, z: ZB - 0.01 },
    // Posts: the four corners, and where the entrance wall ends.
    { w: 0.09, h: hh, d: 0.09, x: XL + 0.045, y: yc, z: ZF + 0.045 },
    { w: 0.09, h: hh, d: 0.09, x: XR - 0.045, y: yc, z: ZF + 0.045 },
    { w: 0.09, h: hh, d: 0.09, x: XL + 0.045, y: yc, z: ZB - 0.045 },
    { w: 0.09, h: hh, d: 0.05, x: ENTRANCE_X + 1.1, y: yc, z: ZF + 0.025 },
  ];
  // Ceiling battens, across the room.
  const battens = 6;
  for (let i = 0; i < battens; i++) {
    const z = ZF + 0.15 + (i * (ceilingZ1 - ZF - 0.3)) / (battens - 1);
    trim.push({ w: XR - XL, h: 0.025, d: 0.03, x: (XR + XL) / 2, y: H - 0.0125, z });
  }
  root.add(boxBatch('WoodTrim', wood, trim));

  // Stone tiles, 30 cm, with their joints.
  const fx = span(XL, XR);
  root.add(boxBatch('StoneFloor', stone, [{ w: fx.size, h: 0.012, d: inner.size, x: fx.mid, y: Y0 + 0.006, z: inner.mid }]));
  const joints: BoxPart[] = [];
  for (let x = XL + 0.3; x < XR - 0.01; x += 0.3) joints.push({ w: 0.006, h: 0.013, d: inner.size, x, y: Y0 + 0.0065, z: inner.mid });
  for (let z = ZF + 0.3; z < ZB - 0.01; z += 0.3) joints.push({ w: fx.size, h: 0.013, d: 0.006, x: fx.mid, y: Y0 + 0.0065, z });
  root.add(boxBatch('FloorJoints', grout, joints));
}

/** The shoji window in the front wall, right of the entrance, and the two paper ceiling lamps. */
function windowAndLamps(root: Group): void {
  const cx = (XR + ENTRANCE_X + 1.1) / 2 + 0.02;
  const w = 0.84;
  const h = 0.9;
  const y0 = 0.8;
  const lampY = CEILING_HEIGHT - 0.085;
  const lamps: Array<[number, number]> = [[-0.95, -1.75], [0.6, -1.75]];
  root.add(boxBatch('PaperGlow', glow, [
    { w, h, d: 0.006, x: cx, y: y0 + h / 2, z: ZF + 0.012 },
    ...lamps.map(([x, z]) => ({ w: 0.3, h: 0.11, d: 0.3, x, y: lampY, z })),
  ]));
  const frame: BoxPart[] = [
    { w: w + 0.1, h: 0.05, d: 0.04, x: cx, y: y0 - 0.025, z: ZF + 0.02 },
    { w: w + 0.1, h: 0.05, d: 0.04, x: cx, y: y0 + h + 0.025, z: ZF + 0.02 },
    { w: 0.05, h, d: 0.04, x: cx - w / 2 - 0.025, y: y0 + h / 2, z: ZF + 0.02 },
    { w: 0.05, h, d: 0.04, x: cx + w / 2 + 0.025, y: y0 + h / 2, z: ZF + 0.02 },
    // Two sliding panels meet in the middle.
    { w: 0.03, h, d: 0.02, x: cx, y: y0 + h / 2, z: ZF + 0.022 },
  ];
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    frame.push({ w: 0.01, h, d: 0.012, x: cx - w / 2 + (i * w) / 8, y: y0 + h / 2, z: ZF + 0.02 });
  }
  for (let k = 1; k < 5; k++) frame.push({ w, h: 0.01, d: 0.012, x: cx, y: y0 + (k * h) / 5, z: ZF + 0.02 });
  // The lamps' frames: four corner sticks, a top and a bottom ring each.
  for (const [x, z] of lamps) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) frame.push({ w: 0.014, h: 0.13, d: 0.014, x: x + sx * 0.152, y: lampY, z: z + sz * 0.152 });
      frame.push({ w: 0.014, h: 0.014, d: 0.318, x: x + sx * 0.152, y: lampY - 0.058, z });
      frame.push({ w: 0.318, h: 0.014, d: 0.014, x, y: lampY - 0.058, z: z + sx * 0.152 });
    }
    frame.push({ w: 0.34, h: 0.03, d: 0.34, x, y: CEILING_HEIGHT - 0.015, z });
  }
  root.add(boxBatch('WindowAndLampFrames', paleWood, frame));
}

/** On the left wall: the hanging scroll (bamboo in ink) and the flower shelf with a camellia in a celadon vase. */
function scrollAndFlower(root: Group): void {
  const x = XL + 0.02;
  const z = -1.45;
  const top = 1.86;
  const len = 1.0;
  root.add(boxBatch('ScrollMount', mount, [{ w: 0.004, h: len, d: 0.36, x, y: top - len / 2, z }]));
  root.add(boxBatch('ScrollPaper', paper, [{ w: 0.004, h: 0.62, d: 0.27, x: x + 0.002, y: top - 0.46, z }]));
  root.add(boxBatch('ScrollRods', wood, [
    { w: 0.02, h: 0.02, d: 0.38, x: x + 0.004, y: top, z },
    { w: 0.028, h: 0.028, d: 0.42, x: x + 0.006, y: top - len, z },
    { w: 0.004, h: 0.07, d: 0.004, x: x - 0.004, y: top + 0.04, z },
  ]));
  // The bamboo: a stalk in four joints leaning a little, and leaves at two of its nodes.
  const ix = x + 0.005;
  const strokes: BoxPart[] = [];
  const base = top - 0.75;
  for (let i = 0; i < 4; i++) {
    strokes.push({ w: 0.002, h: 0.125, d: 0.018 - i * 0.002, x: ix, y: base + 0.07 + i * 0.135, z: z + 0.04 - i * 0.012, rx: 0.09 });
  }
  const leaves: Array<[number, number, number, number]> = [
    [0.3, -0.03, 1.0, 0.1], [0.33, -0.06, 1.35, 0.12], [0.27, -0.055, 1.75, 0.09],
    [0.44, 0.05, -0.9, 0.1], [0.47, 0.075, -1.3, 0.11], [0.5, -0.03, 1.2, 0.08],
  ];
  for (const [dy, dz, rx, l] of leaves) strokes.push({ w: 0.002, h: l, d: 0.014, x: ix, y: base + dy, z: z + dz, rx });
  root.add(boxBatch('ScrollInk', ink, strokes));

  // The flower shelf, on the wainscot's cap, toward the entrance.
  const sz = -2.0;
  const sy = Y0 + 0.96;
  root.add(boxBatch('FlowerShelf', paleWood, [
    { w: 0.15, h: 0.02, d: 0.4, x: XL + 0.075, y: sy - 0.01, z: sz },
    { w: 0.11, h: 0.1, d: 0.02, x: XL + 0.055, y: sy - 0.07, z: sz - 0.14 },
    { w: 0.11, h: 0.1, d: 0.02, x: XL + 0.055, y: sy - 0.07, z: sz + 0.14 },
  ]));
  const m = (px: number, py: number, pz: number, s = 1) => new Matrix4().makeScale(s, s, s).setPosition(px, py, pz);
  const vx = XL + 0.08;
  const vase = new Mesh(
    mergeGeometries([
      [new CylinderGeometry(0.022, 0.038, 0.1, 16), m(vx, sy + 0.05, sz)],
      [new CylinderGeometry(0.014, 0.022, 0.05, 16), m(vx, sy + 0.125, sz)],
    ]),
    celadon,
  );
  vase.name = 'Vase';
  root.add(vase);
  root.add(boxBatch('Branch', wood, [
    { w: 0.006, h: 0.2, d: 0.006, x: vx + 0.01, y: sy + 0.23, z: sz + 0.02, rx: 0.25, rz: -0.1 },
    { w: 0.005, h: 0.1, d: 0.005, x: vx + 0.02, y: sy + 0.27, z: sz - 0.02, rx: -0.6, rz: -0.1 },
  ]));
  const bloom = new SphereGeometry(0.022, 10, 8);
  root.add(instances('Camellias', bloom, camellia, [m(vx + 0.022, sy + 0.33, sz + 0.045), m(vx + 0.03, sy + 0.3, sz - 0.05, 0.7)]));
  root.add(boxBatch('CamelliaLeaves', leaf, [
    { w: 0.004, h: 0.05, d: 0.024, x: vx + 0.02, y: sy + 0.29, z: sz + 0.065, rx: 0.9 },
    { w: 0.004, h: 0.05, d: 0.024, x: vx + 0.015, y: sy + 0.25, z: sz + 0.0, rx: -0.7 },
    { w: 0.004, h: 0.045, d: 0.022, x: vx + 0.025, y: sy + 0.27, z: sz - 0.07, rx: -1.1 },
  ]));
}

/** On the right wall: a pendulum wall clock (柱時計), its hands at ten past ten. */
function clock(root: Group): void {
  const z = -1.6;
  const y = 1.5;
  const face = XR - 0.08;
  root.add(boxBatch('ClockCase', wood, [
    { w: 0.08, h: 0.46, d: 0.25, x: XR - 0.04, y, z },
    { w: 0.1, h: 0.03, d: 0.29, x: XR - 0.05, y: y + 0.245, z },
    { w: 0.1, h: 0.03, d: 0.29, x: XR - 0.05, y: y - 0.245, z },
  ]));
  const onWall = (r: number, t: number, px: number, py: number) =>
    [new CylinderGeometry(r, r, t, 24), new Matrix4().makeRotationZ(Math.PI / 2).setPosition(px, py, z)] as [CylinderGeometry, Matrix4];
  const dial = new Mesh(mergeGeometries([onWall(0.092, 0.006, face - 0.005, y + 0.09)]), paper);
  dial.name = 'ClockDial';
  const metal = new Mesh(
    mergeGeometries([onWall(0.1, 0.004, face - 0.002, y + 0.09), onWall(0.03, 0.006, face - 0.006, y - 0.15)]),
    brass,
  );
  metal.name = 'ClockBrass';
  root.add(dial, metal);
  root.add(boxBatch('ClockHands', ink, [
    { w: 0.003, h: 0.055, d: 0.009, x: face - 0.01, y: y + 0.09 + 0.022, z: z + 0.016, rx: 0.9 },
    { w: 0.003, h: 0.08, d: 0.007, x: face - 0.011, y: y + 0.09 + 0.03, z: z - 0.02, rx: -1.05 },
    // The pendulum's window and rod.
    { w: 0.002, h: 0.15, d: 0.15, x: face - 0.001, y: y - 0.125, z },
    { w: 0.003, h: 0.09, d: 0.006, x: face - 0.005, y: y - 0.1, z },
  ]));
}

/** By the door: a glazed umbrella stand with two umbrellas; at the counter: three stools. */
function standAndStools(root: Group): void {
  const ux = ENTRANCE_X + 0.86;
  const uz = ZF + 0.17;
  const at = (g: CylinderGeometry, x: number, y: number, z: number, rx = 0, rz = 0): [CylinderGeometry, Matrix4] => [
    g,
    new Matrix4().makeRotationX(rx).multiply(new Matrix4().makeRotationZ(rz)).setPosition(x, y, z),
  ];
  const stand = new Mesh(mergeGeometries([at(new CylinderGeometry(0.105, 0.09, 0.4, 20), ux, Y0 + 0.2, uz)]), glaze);
  stand.name = 'UmbrellaStand';
  const closed = new CylinderGeometry(0.024, 0.01, 0.6, 10);
  const umbrellas = new Mesh(
    mergeGeometries([at(closed, ux - 0.03, Y0 + 0.5, uz + 0.01, 0.06, 0.1), at(closed, ux + 0.035, Y0 + 0.5, uz - 0.015, -0.08, -0.1)]),
    umbrellaCloth,
  );
  umbrellas.name = 'Umbrellas';
  root.add(stand, umbrellas);
  root.add(boxBatch('UmbrellaHandles', paleWood, [
    { w: 0.014, h: 0.14, d: 0.014, x: ux - 0.062, y: Y0 + 0.86, z: uz + 0.03, rx: 0.06, rz: 0.1 },
    { w: 0.014, h: 0.14, d: 0.014, x: ux + 0.068, y: Y0 + 0.86, z: uz - 0.042, rx: -0.08, rz: -0.1 },
  ]));

  const seatY = Y0 + 0.45;
  const sz = CUSTOMER_SEAT_Z - 0.04;
  const xs = [-0.62, 0, 0.62];
  root.add(instances('StoolSeats', new CylinderGeometry(0.15, 0.15, 0.035, 20), paleWood, xs.map((x) => new Matrix4().makeTranslation(x, seatY - 0.0175, sz))));
  const legs: BoxPart[] = [];
  for (const x of xs) {
    for (const sx of [-1, 1]) {
      for (const s2 of [-1, 1]) legs.push({ w: 0.03, h: seatY - Y0 - 0.035, d: 0.03, x: x + sx * 0.09, y: (seatY - 0.035 + Y0) / 2, z: sz + s2 * 0.09 });
      legs.push({ w: 0.02, h: 0.02, d: 0.18, x: x + sx * 0.09, y: Y0 + 0.14, z: sz });
      legs.push({ w: 0.18, h: 0.02, d: 0.02, x, y: Y0 + 0.22, z: sz + sx * 0.09 });
    }
  }
  root.add(boxBatch('StoolLegs', wood, legs));
}

export function createCustomerRoom(): Group {
  const root = new Group();
  root.name = 'CustomerRoom';
  shell(root);
  windowAndLamps(root);
  scrollAndFlower(root);
  clock(root);
  standAndStools(root);
  return root;
}
