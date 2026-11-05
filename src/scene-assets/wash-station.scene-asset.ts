import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';
import {
  BACK_ROW_DEPTH,
  SINK_BASIN_DEPTH,
  SINK_BASIN_WIDTH,
  SINK_BASIN_X,
  SINK_FRONT_RIM,
  SINK_TOP,
  SINK_UNIT_X,
  SINK_WIDTH,
} from '../layout.js';

/**
 * Behind the chef (reached by turning around): a stainless prep sink unit
 * with sliding doors, a backsplash and a long faucet, plus the soap and towel.
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

function box(w: number, h: number, d: number, material: MeshStandardMaterial, name: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.name = name;
  return mesh;
}

/** Basin centre in the unit's own coordinates (the unit itself is placed by layout.ts). */
export const SINK_BASIN_LOCAL_X = SINK_BASIN_X - SINK_UNIT_X;
export { SINK_BASIN_X, SINK_TOP };
const BASIN_DROP = 0.2;

/**
 * Prep sink unit: a stainless cabinet with two sliding doors, a top with the
 * basin straight behind the player and a drainboard on its far side, a rolled
 * front edge, a backsplash, and a long faucet whose spout reaches the front of
 * the basin. The basin starts right behind the front rim so a seated chef in
 * the middle of the aisle can wash without leaning. The dish cabinet stands
 * beside the sink as its own asset (dish-cabinet).
 */
export function createSinkUnit(): Group {
  const root = new Group();
  root.name = 'SinkUnit';
  const W = SINK_WIDTH;
  const D = BACK_ROW_DEPTH;
  const BW = SINK_BASIN_WIDTH;
  const BD = SINK_BASIN_DEPTH;
  const top = SINK_TOP;
  const bx = SINK_BASIN_LOCAL_X;
  const bz = -D / 2 + SINK_FRONT_RIM + BD / 2;
  const nearFace = -(D - 0.04) / 2 - 0.002;
  // Cabinet on four short legs.
  const body = box(W, top - 0.1, D - 0.04, steel, 'Body');
  body.position.set(0, 0.07 + (top - 0.1) / 2, 0);
  root.add(body);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new Mesh(new CylinderGeometry(0.02, 0.02, 0.07, 8, 1), steelDark);
    leg.name = 'Leg';
    leg.position.set(x * (W / 2 - 0.05), 0.035, z * (D / 2 - 0.05));
    root.add(leg);
  }
  // Sliding doors: a centre groove and two recessed black handles on the near face.
  const seam = box(0.006, top - 0.2, 0.004, groove, 'DoorSeam');
  seam.position.set(0, 0.42, nearFace);
  const handleL = box(0.02, 0.1, 0.004, groove, 'HandleL');
  handleL.position.set(-0.08, 0.5, nearFace);
  const handleR = box(0.02, 0.1, 0.004, groove, 'HandleR');
  handleR.position.set(W / 2 - 0.08, 0.5, nearFace);
  root.add(seam, handleL, handleR);

  // Top slab, built around the basin opening.
  const slabY = top - 0.015;
  const leftEdge = bx - BW / 2;
  const rightEdge = bx + BW / 2;
  const backDepth = D - SINK_FRONT_RIM - BD;
  const drain = box(W / 2 - rightEdge, 0.03, D, steel, 'TopDrainboard');
  drain.position.set((W / 2 + rightEdge) / 2, slabY, 0);
  const endStrip = box(leftEdge + W / 2, 0.03, D, steel, 'TopEnd');
  endStrip.position.set((leftEdge - W / 2) / 2, slabY, 0);
  const front = box(BW, 0.03, SINK_FRONT_RIM, steel, 'TopFront');
  front.position.set(bx, slabY, -D / 2 + SINK_FRONT_RIM / 2);
  const back = box(BW, 0.03, backDepth, steel, 'TopBack');
  back.position.set(bx, slabY, D / 2 - backDepth / 2);
  const lip = box(W, 0.045, 0.02, steel, 'FrontLip');
  lip.position.set(0, top - 0.02, -D / 2 - 0.008);
  root.add(drain, endStrip, front, back, lip);
  // Drainboard ridges.
  const drainX = (W / 2 + rightEdge) / 2;
  const ridgeLen = Math.min(0.3, W / 2 - rightEdge - 0.08);
  for (let i = 0; i < 5; i++) {
    const ridge = box(ridgeLen, 0.004, 0.01, steelDark, 'Ridge');
    ridge.position.set(drainX, top + 0.002, -D / 2 + 0.08 + (i * (D - 0.16)) / 4);
    root.add(ridge);
  }
  // Basin: floor and four walls, darker steel.
  const floor = box(BW, 0.012, BD, steelDark, 'BasinFloor');
  floor.position.set(bx, top - BASIN_DROP, bz);
  const wallN = box(BW, BASIN_DROP, 0.012, steelDark, 'BasinWallNear');
  wallN.position.set(bx, top - BASIN_DROP / 2, bz - BD / 2);
  const wallF = box(BW, BASIN_DROP, 0.012, steelDark, 'BasinWallFar');
  wallF.position.set(bx, top - BASIN_DROP / 2, bz + BD / 2);
  const wallL = box(0.012, BASIN_DROP, BD, steelDark, 'BasinWallL');
  wallL.position.set(leftEdge, top - BASIN_DROP / 2, bz);
  const wallR = box(0.012, BASIN_DROP, BD, steelDark, 'BasinWallR');
  wallR.position.set(rightEdge, top - BASIN_DROP / 2, bz);
  const water = box(BW - 0.03, 0.004, BD - 0.03, waterMat, 'Water');
  water.position.set(bx, top - BASIN_DROP + 0.02, bz);
  root.add(floor, wallN, wallF, wallL, wallR, water);
  // Backsplash on the far edge; a long faucet arm reaches the front of the basin.
  const splash = box(W, 0.12, 0.03, steel, 'Backsplash');
  splash.position.set(0, top + 0.06, D / 2 - 0.015);
  const riserZ = D / 2 - 0.06;
  const spoutZ = -D / 2 + SINK_FRONT_RIM + 0.08;
  const riser = new Mesh(new CylinderGeometry(0.014, 0.016, 0.26, 10, 1), steel);
  riser.name = 'FaucetRiser';
  riser.position.set(bx, top + 0.13, riserZ);
  const armLen = riserZ - spoutZ;
  const arm = new Mesh(new CylinderGeometry(0.011, 0.011, armLen, 10, 1), steel);
  arm.name = 'FaucetArm';
  arm.rotation.x = Math.PI / 2;
  arm.position.set(bx, top + 0.26, (riserZ + spoutZ) / 2);
  const spout = new Mesh(new CylinderGeometry(0.011, 0.013, 0.05, 10, 1), steel);
  spout.name = 'FaucetSpout';
  spout.position.set(bx, top + 0.235, spoutZ);
  const handle = box(0.06, 0.012, 0.012, steelDark, 'FaucetHandle');
  handle.position.set(bx + 0.04, top + 0.27, riserZ);
  root.add(splash, riser, arm, spout, handle);
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
