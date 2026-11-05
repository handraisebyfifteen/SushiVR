import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { CustomerSystem } from './customer-system.js';
import { CuttingSystem } from './cutting-system.js';
import { DebugHudSystem } from './debug-hud-system.js';
import { FeedbackSystem } from './feedback.js';
import { HandsSystem } from './hands.js';
import { HygieneSystem } from './hygiene-system.js';
import { NigiriSystem } from './nigiri-system.js';
import { StationSystem } from './station-system.js';
import { TurnSystem } from './turn-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Order matters: hands and stations first, feedback and debug last.
  world.registerSystem(HandsSystem);
  world.registerSystem(StationSystem);
  world.registerSystem(TurnSystem);
  world.registerSystem(CustomerSystem);
  world.registerSystem(HygieneSystem);
  world.registerSystem(CuttingSystem);
  world.registerSystem(NigiriSystem);
  world.registerSystem(FeedbackSystem);
  world.registerSystem(DebugHudSystem);
});
