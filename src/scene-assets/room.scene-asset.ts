import {
  BoxGeometry,
  createScenePrimitiveObject,
  Group,
  Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';

/**
 * Empty room: a plain floor the player can stand and walk on.
 * Built from a single primitive so the app ships no external model files.
 * Registered in src/assets.ts as `room-floor` and placed by the scene.
 */

const floorMaterial = new MeshStandardMaterial({
  color: '#C9BFB2',
  roughness: 0.95,
});

export function createRoomFloor(size = 12): Group {
  const floor = createScenePrimitiveObject(
    { geometry: { type: 'plane', size: [size, size] } },
    floorMaterial,
  );
  floor.rotation.x = -Math.PI / 2;
  const root = new Group();
  root.add(floor);
  return root;
}

const platformMaterial = new MeshStandardMaterial({ color: '#6B5B4A', roughness: 0.9 });

/**
 * Raised chef platform: the kitchen floor is one step above the customer
 * floor, as in a real sushi bar. The player stands on its top (y = 0).
 * Origin at the top surface center; the block extends downward.
 */
export function createChefPlatform(width = 3.6, depth = 2.5, height = 0.2): Group {
  const root = new Group();
  root.name = 'ChefPlatform';
  const block = new Mesh(new BoxGeometry(width, height, depth), platformMaterial);
  block.name = 'Platform';
  block.position.y = -height / 2;
  root.add(block);
  return root;
}
