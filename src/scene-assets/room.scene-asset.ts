import {
  createScenePrimitiveObject,
  Group,
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
