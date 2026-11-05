import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';

/**
 * Sushi counter stations, built from primitives only (no external models).
 * All sizes are meters. Each factory returns a parentless Object3D whose
 * origin is its floor/contact point, so the scene can place it on a surface.
 *
 * Shared materials: reusing one material per look keeps draw-call state
 * changes low on Quest.
 */

const darkWood = new MeshStandardMaterial({ color: '#4A3526', roughness: 0.8 });
const lightWood = new MeshStandardMaterial({ color: '#D9B98A', roughness: 0.7 });
const paleWood = new MeshStandardMaterial({ color: '#EADBB8', roughness: 0.65 });
const lacquer = new MeshStandardMaterial({ color: '#1E1A1A', roughness: 0.35 });
const rice = new MeshStandardMaterial({ color: '#F6F2EA', roughness: 0.9 });
const tuna = new MeshStandardMaterial({ color: '#C8333A', roughness: 0.5 });
const water = new MeshStandardMaterial({
  color: '#9CCBE0',
  roughness: 0.15,
  transparent: true,
  opacity: 0.85,
});
const cloth = new MeshStandardMaterial({ color: '#F1EFE6', roughness: 1.0 });
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

/** Counter body in front of the seated player: top slab plus front panel. */
export function createCounter(): Group {
  const root = new Group();
  root.name = 'Counter';
  const top = box(1.6, 0.04, 0.6, darkWood, 'CounterTop');
  top.position.set(0, 0.73, 0);
  const panel = box(1.6, 0.71, 0.04, darkWood, 'CounterFront');
  panel.position.set(0, 0.355, -0.28);
  const shelf = box(1.6, 0.02, 0.6, darkWood, 'CounterShelf');
  shelf.position.set(0, 0.01, 0);
  root.add(top, panel, shelf);
  return root;
}

/** Cutting board (tsukedai) where the rice is shaped and topped. */
export function createCuttingBoard(): Group {
  const root = new Group();
  root.name = 'CuttingBoard';
  const board = box(0.3, 0.02, 0.2, paleWood, 'Board');
  board.position.y = 0.01;
  root.add(board);
  return root;
}

/** Serving stand (geta): a plank on two feet, where finished sushi is served. */
export function createGeta(): Group {
  const root = new Group();
  root.name = 'Geta';
  const plank = box(0.26, 0.02, 0.12, lightWood, 'Plank');
  plank.position.y = 0.04;
  const footL = box(0.03, 0.03, 0.1, lightWood, 'FootL');
  footL.position.set(-0.1, 0.015, 0);
  const footR = box(0.03, 0.03, 0.1, lightWood, 'FootR');
  footR.position.set(0.1, 0.015, 0);
  root.add(plank, footL, footR);
  return root;
}

/** Rice tub (ohitsu) with a mound of vinegared rice inside. */
export function createRiceTub(): Group {
  const root = new Group();
  root.name = 'RiceTub';
  const tub = new Mesh(new CylinderGeometry(0.12, 0.11, 0.12, 24, 1), lightWood);
  tub.name = 'Tub';
  tub.position.y = 0.06;
  const mound = new Mesh(new SphereGeometry(0.1, 20, 12), rice);
  mound.name = 'Rice';
  mound.scale.set(1, 0.45, 1);
  mound.position.y = 0.1;
  root.add(tub, mound);
  return root;
}

/** Topping tray (neta) holding slices of lean tuna. */
export function createNetaTray(): Group {
  const root = new Group();
  root.name = 'NetaTray';
  const tray = box(0.2, 0.015, 0.14, lacquer, 'Tray');
  tray.position.y = 0.0075;
  root.add(tray);
  for (let i = 0; i < 3; i++) {
    const slice = box(0.07, 0.01, 0.035, tuna, `Slice${i}`);
    slice.position.set(0, 0.02, -0.045 + i * 0.045);
    root.add(slice);
  }
  return root;
}

/** Hand-washing basin: a wooden tub with a water surface. */
export function createBasin(): Group {
  const root = new Group();
  root.name = 'Basin';
  const tub = new Mesh(new CylinderGeometry(0.11, 0.1, 0.08, 24, 1), lightWood);
  tub.name = 'Tub';
  tub.position.y = 0.04;
  const surface = new Mesh(new CylinderGeometry(0.1, 0.1, 0.004, 24, 1), water);
  surface.name = 'Water';
  surface.position.y = 0.07;
  root.add(tub, surface);
  return root;
}

/** Folded hand towel (fukin). */
export function createTowel(): Group {
  const root = new Group();
  root.name = 'Towel';
  const fold = box(0.16, 0.02, 0.12, cloth, 'Fold');
  fold.position.y = 0.01;
  const edge = box(0.16, 0.006, 0.04, cloth, 'Edge');
  edge.position.set(0, 0.023, 0.03);
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
