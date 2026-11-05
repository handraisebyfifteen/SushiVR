import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { CustomerSystem } from './customer-system.js';
import { CuttingSystem } from './cutting-system.js';
import { DebugHudSystem } from './debug-hud-system.js';
import { FeedbackSystem } from './feedback.js';
import { HandsSystem } from './hands.js';
import { HygieneSystem } from './hygiene-system.js';
import { MasterSystem } from './master-system.js';
import { NetaCaseSystem } from './neta-case-system.js';
import { NigiriSystem } from './nigiri-system.js';
import { RiceTubSystem } from './rice-tub-system.js';
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
  world.registerSystem(NetaCaseSystem);
  world.registerSystem(RiceTubSystem);
  world.registerSystem(CuttingSystem);
  world.registerSystem(NigiriSystem);
  world.registerSystem(MasterSystem);
  world.registerSystem(FeedbackSystem);
  world.registerSystem(DebugHudSystem);
  // Keyboard practice mode for the desktop emulator (P key). Dev builds only:
  // the import is dropped from production bundles.
  if (import.meta.env.DEV) {
    void import('./practice-system.js').then(({ PracticeSystem }) => world.registerSystem(PracticeSystem));
  }
});
