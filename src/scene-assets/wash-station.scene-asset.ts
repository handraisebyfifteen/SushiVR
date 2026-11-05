import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';

/**
 * Hand-washing station behind the chef (reached by turning around):
 * a back counter with a basin, a soap pump and a hand towel.
 * Primitives only; origins at the contact point.
 */

const darkWood = new MeshStandardMaterial({ color: '#4A3526', roughness: 0.8 });
const lightWood = new MeshStandardMaterial({ color: '#D9B98A', roughness: 0.7 });
const water = new MeshStandardMaterial({
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

/** Hand-washing basin: a wooden tub with a water surface. */
export function createBasin(): Group {
  const root = new Group();
  root.name = 'Basin';
  const tub = new Mesh(new CylinderGeometry(0.13, 0.12, 0.09, 24, 1), lightWood);
  tub.name = 'Tub';
  tub.position.y = 0.045;
  const surface = new Mesh(new CylinderGeometry(0.12, 0.12, 0.004, 24, 1), water);
  surface.name = 'Water';
  surface.position.y = 0.08;
  root.add(tub, surface);
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
