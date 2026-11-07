import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
} from '@iwsdk/core';
import {
  AISLE_CENTER_Z,
  BACK_ROW_Z,
  BAR_LENGTH,
  BACK_WALL_Z,
  CEILING_HEIGHT,
  EAVES_BACK_OVERLAP,
  EAVES_HEIGHT,
  EAVES_Z,
  KITCHEN_DEPTH,
  KITCHEN_DOOR_HEIGHT,
  KITCHEN_DOOR_WIDTH,
  MANAITA_Z,
  LONG_NOREN_LENGTH,
  ROOM_END_X,
  TSUKEDAI_CHEF_Z,
  TSUKEDAI_CUSTOMER_Z,
  WALL_THICKNESS,
} from '../layout.js';
import { type BoxPart, boxBatch, instances } from './lib/batch.js';

/**
 * The chef's room (itaba) around the aisle: plaster back and end walls with a
 * wooden wainscot, a header wall that meets the eaves, a board ceiling with
 * fluorescent work-light fixtures, and the kitchen doorway in the left end
 * wall: a door frame, a long indigo noren (長のれん), and a bright kitchen
 * beyond it that shows through the slit and under the noren and whose light
 * spills onto the aisle floor. At the bar's right end, between the
 * eaves post and the right end wall, the passage to the customer room: a
 * lintel carrying on the eaves beam, a plaster header above it, and a long
 * indigo noren (長のれん) that screens the office corner from the seats.
 *
 * Nothing here is a light source. The tubes, the kitchen and the spill are
 * unlit or emissive materials that only look bright; the scene's single key
 * light does the actual lighting.
 *
 * Origin: the player's floor point (layout origin), so walls follow layout.ts.
 */

const plaster = new MeshStandardMaterial({ color: '#D9CDB4', roughness: 0.95 });
const wood = new MeshStandardMaterial({ color: '#5A4130', roughness: 0.7 });
const steel = new MeshStandardMaterial({ color: '#B9BEC4', roughness: 0.35, metalness: 0.6 });
const tube = new MeshBasicMaterial({ color: '#F3F8FF' });
/** The kitchen is drawn unlit, so it reads as a brighter room than the bar. */
const kitchenLit = new MeshBasicMaterial({ color: '#FFFFFF' });
/** The long indigo noren (長のれん) of the kitchen doorway and the passage to the customer room. */
const longNoren = new MeshStandardMaterial({ color: '#24365A', roughness: 1.0 });
const spill = new MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  blending: AdditiveBlending,
  depthWrite: false,
});

export function createItabaRoom(): Group {
  const root = new Group();
  root.name = 'ItabaRoom';
  const X = ROOM_END_X;
  const T = WALL_THICKNESS;
  const H = CEILING_HEIGHT;
  const zFront = TSUKEDAI_CUSTOMER_Z;
  const doorZ0 = AISLE_CENTER_Z - KITCHEN_DOOR_WIDTH / 2;
  const doorZ1 = AISLE_CENTER_Z + KITCHEN_DOOR_WIDTH / 2;
  const DH = KITCHEN_DOOR_HEIGHT;
  /** Header wall line: just behind the eaves' back edge. */
  const headerZ = TSUKEDAI_CHEF_Z + EAVES_BACK_OVERLAP + 0.02;
  const headerBottom = EAVES_HEIGHT + 0.19;
  const span = (z0: number, z1: number) => ({ d: z1 - z0, z: (z0 + z1) / 2 });

  // --- plaster: back wall, end walls (left one around the doorway), header wall ---
  const walls: BoxPart[] = [
    { w: 2 * X + 2 * T, h: H, d: T, x: 0, y: H / 2, z: BACK_WALL_Z + T / 2 },
    { w: T, h: H, ...span(zFront, BACK_WALL_Z), x: X + T / 2, y: H / 2 },
    { w: T, h: H, ...span(zFront, doorZ0), x: -X - T / 2, y: H / 2 },
    { w: T, h: H, ...span(doorZ1, BACK_WALL_Z), x: -X - T / 2, y: H / 2 },
    { w: T, h: H - DH, ...span(doorZ0, doorZ1), x: -X - T / 2, y: (H + DH) / 2 },
    { w: 2 * X, h: H - headerBottom, d: 0.04, x: 0, y: (H + headerBottom) / 2, z: headerZ },
  ];
  root.add(boxBatch('Walls', plaster, walls));

  // --- wood: ceiling boards and battens, wainscot, door frame, noren rod ---
  const ceilingZ0 = headerZ - 0.02;
  const trim: BoxPart[] = [
    { w: 2 * X, h: 0.03, ...span(ceilingZ0, BACK_WALL_Z), x: 0, y: H + 0.015 },
    { w: 2 * X, h: 0.9, d: 0.015, x: 0, y: 0.45, z: BACK_WALL_Z - 0.0075 },
    { w: 0.015, h: 0.9, ...span(zFront, BACK_WALL_Z), x: X - 0.0075, y: 0.45 },
    { w: 0.015, h: 0.9, ...span(zFront, doorZ0), x: -X + 0.0075, y: 0.45 },
    { w: 0.015, h: 0.9, ...span(doorZ1, BACK_WALL_Z), x: -X + 0.0075, y: 0.45 },
    { w: T + 0.04, h: DH, d: 0.05, x: -X - T / 2, y: DH / 2, z: doorZ0 - 0.025 },
    { w: T + 0.04, h: DH, d: 0.05, x: -X - T / 2, y: DH / 2, z: doorZ1 + 0.025 },
    { w: T + 0.04, h: 0.07, d: KITCHEN_DOOR_WIDTH + 0.1, x: -X - T / 2, y: DH + 0.035, z: AISLE_CENTER_Z },
    { w: 0.02, h: 0.02, d: KITCHEN_DOOR_WIDTH, x: -X + 0.02, y: DH - 0.015, z: AISLE_CENTER_Z },
  ];
  const battens = 7;
  for (let i = 0; i < battens; i++) {
    const x = -X + 0.2 + (i * (2 * X - 0.4)) / (battens - 1);
    trim.push({ w: 0.03, h: 0.025, ...span(ceilingZ0, BACK_WALL_Z), x, y: H - 0.0125 });
  }
  root.add(boxBatch('WoodTrim', wood, trim));

  // --- fluorescent work lights: over the manaita, over the sink, in the kitchen ---
  const tubeLen = 1.2;
  const kitchenX = -X - T - KITCHEN_DEPTH / 2;
  const fixtures: Array<[number, number, number]> = [
    [0, MANAITA_Z + 0.02, 0],
    [0, BACK_ROW_Z + 0.05, 0],
    [kitchenX, AISLE_CENTER_Z, Math.PI / 2],
  ];
  const bodies: BoxPart[] = [];
  const tubeMats: Matrix4[] = [];
  for (const [x, z, ry] of fixtures) {
    const ceilingY = x < -X ? H - 0.1 : H;
    bodies.push({ w: tubeLen + 0.1, h: 0.04, d: 0.1, x, y: ceilingY - 0.02, z, ry });
    for (const dz of [-0.025, 0.025]) {
      const m = new Matrix4().makeRotationY(ry).multiply(new Matrix4().makeRotationZ(Math.PI / 2));
      const ox = ry ? dz : 0;
      const oz = ry ? 0 : dz;
      m.setPosition(x + ox, ceilingY - 0.055, z + oz);
      tubeMats.push(m);
    }
  }
  root.add(boxBatch('LightFixtures', steel, bodies));
  root.add(instances('FluorescentTubes', new CylinderGeometry(0.013, 0.013, tubeLen, 10, 1), tube, tubeMats));

  // --- kitchen beyond the doorway: an unlit, bright shell with a worktable ---
  const kx0 = -X - T - KITCHEN_DEPTH;
  const kz = 0.65;
  const kh = H - 0.1;
  const shell: Array<[BoxPart, string]> = [
    [{ w: 0.04, h: kh, d: 2 * kz, x: kx0, y: kh / 2, z: AISLE_CENTER_Z }, '#F2EBDC'],
    [{ w: KITCHEN_DEPTH, h: kh, d: 0.04, x: kitchenX, y: kh / 2, z: AISLE_CENTER_Z - kz }, '#E6DDCB'],
    [{ w: KITCHEN_DEPTH, h: kh, d: 0.04, x: kitchenX, y: kh / 2, z: AISLE_CENTER_Z + kz }, '#E6DDCB'],
    [{ w: KITCHEN_DEPTH, h: 0.04, d: 2 * kz, x: kitchenX, y: kh, z: AISLE_CENTER_Z }, '#F7F2E6'],
    [{ w: KITCHEN_DEPTH, h: 0.02, d: 2 * kz, x: kitchenX, y: -0.01, z: AISLE_CENTER_Z }, '#B8AC96'],
    [{ w: 0.45, h: 0.82, d: 1.1, x: kx0 + 0.25, y: 0.41, z: AISLE_CENTER_Z }, '#AEB3B8'],
    [{ w: 0.3, h: 0.03, d: 1.0, x: kx0 + 0.17, y: 1.45, z: AISLE_CENTER_Z }, '#9EA3A8'],
  ];
  const kitchen = boxBatch('KitchenBeyond', kitchenLit, shell.map(([p]) => p));
  const c = new Color();
  shell.forEach(([, hex], i) => kitchen.setColorAt(i, c.set(hex)));
  kitchen.instanceColor!.needsUpdate = true;
  root.add(kitchen);

  // --- kitchen noren: a long noren in two panels; the bright kitchen shows through the slit and under it ---
  const slit = 0.02;
  const panelD = (KITCHEN_DOOR_WIDTH - 0.04 - slit) / 2;
  const panelLen = LONG_NOREN_LENGTH;
  const panel = new BoxGeometry(0.004, panelLen, panelD);
  const panelMats = [-1, 1].map((s) =>
    new Matrix4().makeTranslation(-X + 0.03, DH - 0.03 - panelLen / 2, AISLE_CENTER_Z + s * (panelD + slit) / 2),
  );
  root.add(instances('KitchenNoren', panel, longNoren, panelMats));

  // --- passage to the customer room: lintel, header, rod and a long noren in two panels ---
  const passX0 = BAR_LENGTH / 2 + 0.06 + 0.045; // the eaves post's outer face
  const passW = X - passX0;
  const passX = (passX0 + X) / 2;
  const lintelTop = EAVES_HEIGHT + 0.12;
  root.add(boxBatch('PassageFrame', wood, [
    { w: passW, h: 0.12, d: 0.09, x: passX, y: EAVES_HEIGHT + 0.06, z: EAVES_Z },
    { w: passW, h: 0.02, d: 0.02, x: passX, y: EAVES_HEIGHT - 0.03, z: EAVES_Z },
  ]));
  root.add(boxBatch('PassageHeader', plaster, [{ w: passW, h: H - lintelTop, d: 0.05, x: passX, y: (H + lintelTop) / 2, z: EAVES_Z }]));
  const longW = (passW - 0.02 - slit) / 2;
  const longPanel = new BoxGeometry(longW, LONG_NOREN_LENGTH, 0.004);
  const longMats = [-1, 1].map((s) =>
    new Matrix4().makeTranslation(passX + s * (longW + slit) / 2, EAVES_HEIGHT - 0.04 - LONG_NOREN_LENGTH / 2, EAVES_Z),
  );
  root.add(instances('PassageNoren', longPanel, longNoren, longMats));

  // --- light spill on the aisle floor in front of the doorway ---
  const spillLen = 0.95;
  const spillGeo = new PlaneGeometry(spillLen, KITCHEN_DOOR_WIDTH + 0.15, 4, 1);
  const pos = spillGeo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - (pos.getX(i) + spillLen / 2) / spillLen; // 1 at the door, 0 far away
    const edge = 1 - Math.abs(pos.getY(i)) / ((KITCHEN_DOOR_WIDTH + 0.15) / 2);
    const a = k * k * (0.55 + 0.45 * edge) * 0.32;
    colors.set([a, a * 0.86, a * 0.62], i * 3);
  }
  spillGeo.setAttribute('color', new BufferAttribute(colors, 3));
  const spillMesh = new Mesh(spillGeo, spill);
  spillMesh.name = 'DoorLightSpill';
  spillMesh.rotation.x = -Math.PI / 2;
  spillMesh.position.set(-X + spillLen / 2, 0.003, AISLE_CENTER_Z);
  spillMesh.renderOrder = 1;
  spillMesh.userData.iwsdkPreviewBounds = 'exclude';
  root.add(spillMesh);
  return root;
}
