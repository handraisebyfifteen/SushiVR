import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';

/**
 * Hand-washing station behind the chef (reached by turning around):
 * a back counter with a sink (faucet), a soap pump and a hand towel.
 * Primitives only; origins at the contact point.
 */

const darkWood = new MeshStandardMaterial({ color: '#4A3526', roughness: 0.8 });
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

/** Back counter: a solid block with a top, holding the washing station. */
export function createBackCounter(): Group {
  const root = new Group();
  root.name = 'BackCounter';
  const body = box(1.2, 0.71, 0.4, darkWood, 'Body');
  body.position.set(0, 0.355, 0);
  const top = box(1.2, 0.04, 0.4, darkWood, 'Top');
  top.position.set(0, 0.73, 0);
  root.add(body, top);
  return root;
}

const steel = new MeshStandardMaterial({ color: '#C9CDD2', roughness: 0.3, metalness: 0.8 });
const steelDark = new MeshStandardMaterial({ color: '#8E949A', roughness: 0.45, metalness: 0.7 });

/**
 * Sink with a faucet: a steel basin set into the counter and a tap arching
 * over it. Hands and the wet cloth are washed under the faucet.
 */
export function createSink(): Group {
  const root = new Group();
  root.name = 'Sink';
  const rim = box(0.40, 0.02, 0.32, steel, 'Rim');
  rim.position.y = 0.01;
  const bowl = box(0.34, 0.012, 0.26, steelDark, 'BowlFloor');
  bowl.position.y = 0.004;
  const wallBack = box(0.34, 0.1, 0.012, steel, 'WallBack');
  wallBack.position.set(0, 0.06, -0.126);
  const wallFront = box(0.34, 0.1, 0.012, steel, 'WallFront');
  wallFront.position.set(0, 0.06, 0.126);
  const wallL = box(0.012, 0.1, 0.26, steel, 'WallL');
  wallL.position.set(-0.166, 0.06, 0);
  const wallR = box(0.012, 0.1, 0.26, steel, 'WallR');
  wallR.position.set(0.166, 0.06, 0);
  const water = new Mesh(new CylinderGeometry(0.1, 0.1, 0.004, 20, 1), waterMat);
  water.name = 'Water';
  water.position.y = 0.012;
  const riser = new Mesh(new CylinderGeometry(0.012, 0.014, 0.22, 10, 1), steel);
  riser.name = 'FaucetRiser';
  riser.position.set(0, 0.22, -0.15);
  const arm = new Mesh(new CylinderGeometry(0.01, 0.01, 0.16, 10, 1), steel);
  arm.name = 'FaucetArm';
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, 0.33, -0.07);
  const spout = new Mesh(new CylinderGeometry(0.01, 0.012, 0.04, 10, 1), steel);
  spout.name = 'FaucetSpout';
  spout.position.set(0, 0.31, 0.0);
  const handle = box(0.05, 0.012, 0.012, steelDark, 'FaucetHandle');
  handle.position.set(0, 0.34, -0.15);
  root.add(rim, bowl, wallBack, wallFront, wallL, wallR, water, riser, arm, spout, handle);
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
