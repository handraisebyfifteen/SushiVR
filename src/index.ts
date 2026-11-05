import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { DebugHudSystem } from './debug-hud-system.js';
import { HandsSystem } from './hands.js';
import { StationSystem } from './station-system.js';
import { TurnSystem } from './turn-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(HandsSystem);
  world.registerSystem(StationSystem);
  world.registerSystem(TurnSystem);
  world.registerSystem(DebugHudSystem);
});
