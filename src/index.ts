import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((_world) => {
  // Game systems are registered here (world.registerSystem(...)).
});
