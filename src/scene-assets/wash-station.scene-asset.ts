import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';

/**
 * Behind the chef (reached by turning around): a stainless prep sink unit
 * with sliding doors, a backsplash and a faucet, plus a wooden dish cabinet.
 * Primitives only; origins at floor contact. The chef faces +Z after turning,
 * so "far side" here is +Z and the chef's right is -X.
 */

const steel = new MeshStandardMaterial({ color: '#C9CDD2', roughness: 0.3, metalness: 0.8 });
const steelDark = new MeshStandardMaterial({ color: '#8E949A', roughness: 0.45, metalness: 0.7 });
const groove = new MeshStandardMaterial({ color: '#2B2E31', roughness: 0.6 });
const waterMat = new MeshStandardMaterial({
  color: '#9CCBE0',
  roughness: 0.15,
  transparent: true,
  opacity: 0.85,
});
const cloth = new MeshStandardMaterial({ color: '#F1EFE6', roughness: 1.0 });
const soapBottle = new MeshStandardMaterial({
  color: '#DDEBD2',
  roughness: 0.3,
  transparent: true,
  opacity: 0.9,
});
const plastic = new MeshStandardMaterial({ color: '#F4F4F4', roughness: 0.5 });
const wood = new MeshStandardMaterial({ color: '#A8632A', roughness: 0.6 });
const woodDark = new MeshStandardMaterial({ color: '#8A4E20', roughness: 0.65 });
const woodInner = new MeshStandardMaterial({ color: '#C98A4E', roughness: 0.7 });
const cabinetGlass = new MeshStandardMaterial({
  color: '#DCE8E4',
  roughness: 0.05,
  transparent: true,
  opacity: 0.3,
});
const brass = new MeshStandardMaterial({ color: '#6E4A1E', roughness: 0.5, metalness: 0.4 });

function box(w: number, h: number, d: number, material: MeshStandardMaterial, name: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.name = name;
  return mesh;
}

/** Basin center in the unit: on the chef's right once turned around (-X). */
export const SINK_BASIN_X = -0.25;
export const SINK_TOP_Y = 0.8;
const BASIN_W = 0.45;
const BASIN_D = 0.38;
const BASIN_DEPTH = 0.2;

/**
 * Prep sink unit: 1.2 m stainless cabinet with two sliding doors, a top with
 * a drainboard on the left and a deep basin on the right, a raised
 * backsplash on the far edge and a faucet rising from it over the basin.
 */
export function createSinkUnit(): Group {
  const root = new Group();
  root.name = 'SinkUnit';
  const W = 1.2;
  const D = 0.6;
  // Cabinet on four short legs.
  const body = box(W, 0.7, D - 0.04, steel, 'Body');
  body.position.set(0, 0.42, 0);
  root.add(body);
  for (const [x, z] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) {
    const leg = new Mesh(new CylinderGeometry(0.02, 0.02, 0.07, 8, 1), steelDark);
    leg.name = 'Leg';
    leg.position.set(x, 0.035, z);
    root.add(leg);
  }
  // Sliding doors: a center groove and two recessed black handles on the near face.
  const seam = box(0.006, 0.6, 0.004, groove, 'DoorSeam');
  seam.position.set(0, 0.42, -0.28);
  const handleL = box(0.02, 0.1, 0.004, groove, 'HandleL');
  handleL.position.set(-0.08, 0.5, -0.28);
  const handleR = box(0.02, 0.1, 0.004, groove, 'HandleR');
  handleR.position.set(0.52, 0.5, -0.28);
  root.add(seam, handleL, handleR);

  // Top slab, built around the basin opening.
  const topY = SINK_TOP_Y - 0.015;
  const bx = SINK_BASIN_X;
  const leftEdge = bx - BASIN_W / 2;
  const rightEdge = bx + BASIN_W / 2;
  const drain = box(W / 2 - rightEdge, 0.03, D, steel, 'TopDrainboard');
  drain.position.set((W / 2 + rightEdge) / 2, topY, 0);
  const endStrip = box(leftEdge + W / 2, 0.03, D, steel, 'TopEnd');
  endStrip.position.set((leftEdge - W / 2) / 2, topY, 0);
  const front = box(BASIN_W, 0.03, (D - BASIN_D) / 2, steel, 'TopFront');
  front.position.set(bx, topY, -(D / 2 - (D - BASIN_D) / 4));
  const back = box(BASIN_W, 0.03, (D - BASIN_D) / 2, steel, 'TopBack');
  back.position.set(bx, topY, D / 2 - (D - BASIN_D) / 4);
  root.add(drain, endStrip, front, back);
  // Drainboard ridges.
  for (let i = 0; i < 5; i++) {
    const ridge = box(0.3, 0.004, 0.01, steelDark, 'Ridge');
    ridge.position.set(0.28, SINK_TOP_Y + 0.002, -0.2 + i * 0.1);
    root.add(ridge);
  }
  // Basin: floor and four walls, darker steel.
  const floor = box(BASIN_W, 0.012, BASIN_D, steelDark, 'BasinFloor');
  floor.position.set(bx, SINK_TOP_Y - BASIN_DEPTH, 0);
  const wallN = box(BASIN_W, BASIN_DEPTH, 0.012, steelDark, 'BasinWallNear');
  wallN.position.set(bx, SINK_TOP_Y - BASIN_DEPTH / 2, -BASIN_D / 2);
  const wallF = box(BASIN_W, BASIN_DEPTH, 0.012, steelDark, 'BasinWallFar');
  wallF.position.set(bx, SINK_TOP_Y - BASIN_DEPTH / 2, BASIN_D / 2);
  const wallL = box(0.012, BASIN_DEPTH, BASIN_D, steelDark, 'BasinWallL');
  wallL.position.set(leftEdge, SINK_TOP_Y - BASIN_DEPTH / 2, 0);
  const wallR = box(0.012, BASIN_DEPTH, BASIN_D, steelDark, 'BasinWallR');
  wallR.position.set(rightEdge, SINK_TOP_Y - BASIN_DEPTH / 2, 0);
  const water = box(BASIN_W - 0.03, 0.004, BASIN_D - 0.03, waterMat, 'Water');
  water.position.set(bx, SINK_TOP_Y - BASIN_DEPTH + 0.02, 0);
  root.add(floor, wallN, wallF, wallL, wallR, water);
  // Backsplash on the far edge, faucet rising from it over the basin.
  const splash = box(W, 0.12, 0.03, steel, 'Backsplash');
  splash.position.set(0, SINK_TOP_Y + 0.06, D / 2 - 0.015);
  const riser = new Mesh(new CylinderGeometry(0.014, 0.016, 0.26, 10, 1), steel);
  riser.name = 'FaucetRiser';
  riser.position.set(bx, SINK_TOP_Y + 0.13, D / 2 - 0.06);
  const arm = new Mesh(new CylinderGeometry(0.011, 0.011, 0.24, 10, 1), steel);
  arm.name = 'FaucetArm';
  arm.rotation.x = Math.PI / 2;
  arm.position.set(bx, SINK_TOP_Y + 0.26, D / 2 - 0.06 - 0.12);
  const spout = new Mesh(new CylinderGeometry(0.011, 0.013, 0.05, 10, 1), steel);
  spout.name = 'FaucetSpout';
  spout.position.set(bx, SINK_TOP_Y + 0.235, D / 2 - 0.06 - 0.24);
  const handle = box(0.06, 0.012, 0.012, steelDark, 'FaucetHandle');
  handle.position.set(bx + 0.04, SINK_TOP_Y + 0.27, D / 2 - 0.06);
  root.add(splash, riser, arm, spout, handle);
  return root;
}

/**
 * Wooden dish cabinet: two rows of sliding glass doors with shelves behind
 * them, three drawers with knobs, and six panelled doors below. Front is -Z.
 */
export function createDishCabinet(): Group {
  const root = new Group();
  root.name = 'DishCabinet';
  const W = 1.2;
  const H = 1.85;
  const D = 0.45;
  const sideL = box(0.04, H, D, wood, 'SideL');
  sideL.position.set(-W / 2 + 0.02, H / 2, 0);
  const sideR = box(0.04, H, D, wood, 'SideR');
  sideR.position.set(W / 2 - 0.02, H / 2, 0);
  const top = box(W, 0.04, D, wood, 'Top');
  top.position.set(0, H - 0.02, 0);
  const plinth = box(W, 0.08, D, woodDark, 'Plinth');
  plinth.position.set(0, 0.04, 0);
  const backPanel = box(W - 0.08, H - 0.12, 0.02, woodInner, 'Back');
  backPanel.position.set(0, H / 2, D / 2 - 0.01);
  root.add(sideL, sideR, top, plinth, backPanel);

  // Horizontal rails that split the front into bands.
  const rails = [H - 0.06, 1.55, 1.04, 0.86, 0.1];
  for (const y of rails) {
    const rail = box(W - 0.08, 0.05, 0.04, wood, 'Rail');
    rail.position.set(0, y, -D / 2 + 0.02);
    root.add(rail);
  }
  // Glass door rows: a small upper row and a tall main row, each two panes
  // with a center stile, shelves visible behind.
  const glassRows: Array<[number, number]> = [
    [1.58, H - 0.085],
    [1.07, 1.525],
  ];
  for (const [y0, y1] of glassRows) {
    const h = y1 - y0;
    for (const sx of [-1, 1]) {
      const pane = box(W / 2 - 0.08, h, 0.006, cabinetGlass, 'GlassPane');
      pane.position.set(sx * (W / 4 - 0.02), (y0 + y1) / 2, -D / 2 + 0.03);
      const frame = box(0.04, h, 0.02, wood, 'PaneStile');
      frame.position.set(sx * (W / 2 - 0.06), (y0 + y1) / 2, -D / 2 + 0.03);
      root.add(pane, frame);
    }
    const stile = box(0.04, h, 0.02, wood, 'CenterStile');
    stile.position.set(0, (y0 + y1) / 2, -D / 2 + 0.03);
    root.add(stile);
  }
  for (const y of [1.07, 1.22, 1.37, 1.58]) {
    const shelf = box(W - 0.1, 0.02, D - 0.1, woodInner, 'Shelf');
    shelf.position.set(0, y + 0.01, 0.02);
    root.add(shelf);
  }
  // Three drawers with knobs.
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.37;
    const drawer = box(0.35, 0.13, 0.02, wood, 'Drawer');
    drawer.position.set(x, 0.95, -D / 2 + 0.01);
    const knob = new Mesh(new CylinderGeometry(0.012, 0.012, 0.02, 8, 1), brass);
    knob.name = 'Knob';
    knob.rotation.x = Math.PI / 2;
    knob.position.set(x, 0.95, -D / 2 - 0.01);
    root.add(drawer, knob);
  }
  // Six panelled doors.
  for (let i = 0; i < 6; i++) {
    const x = -0.46 + i * 0.184;
    const door = box(0.17, 0.7, 0.02, wood, 'Door');
    door.position.set(x, 0.48, -D / 2 + 0.01);
    const panel = box(0.11, 0.5, 0.01, woodDark, 'DoorPanel');
    panel.position.set(x, 0.48, -D / 2 - 0.004);
    root.add(door, panel);
  }
  return root;
}

/** Hand soap: a pump bottle. Used when the bar opens, not during service. */
export function createSoap(): Group {
  const root = new Group();
  root.name = 'Soap';
  const bottle = new Mesh(new CylinderGeometry(0.03, 0.03, 0.12, 14, 1), soapBottle);
  bottle.name = 'Bottle';
  bottle.position.y = 0.06;
  const neck = new Mesh(new CylinderGeometry(0.008, 0.008, 0.04, 8, 1), plastic);
  neck.name = 'Neck';
  neck.position.y = 0.14;
  const head = box(0.05, 0.015, 0.02, plastic, 'PumpHead');
  head.position.set(0.012, 0.165, 0);
  root.add(bottle, neck, head);
  return root;
}

/** Folded hand towel for drying hands after washing. */
export function createTowel(): Group {
  const root = new Group();
  root.name = 'Towel';
  const fold = box(0.18, 0.02, 0.13, cloth, 'Fold');
  fold.position.y = 0.01;
  const edge = box(0.18, 0.006, 0.045, cloth, 'Edge');
  edge.position.set(0, 0.023, 0.03);
  root.add(fold, edge);
  return root;
}
