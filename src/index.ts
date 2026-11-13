import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { CustomerSystem } from './customer-system.js';
import { CureSystem } from './cure-system.js';
import { CupboardSystem } from './cupboard-system.js';
import { CuttingSystem } from './cutting-system.js';
import { DebugHudSystem } from './debug-hud-system.js';
import { FeedbackSystem } from './feedback.js';
import { FishOrderSystem } from './fish-order-system.js';
import { HandsSystem } from './hands.js';
import { HygieneSystem } from './hygiene-system.js';
import { NakagoSystem } from './nakago-system.js';
import { SharpenSystem } from './sharpen-system.js';
import { MasterSystem } from './master-system.js';
import { MenuBoardSystem } from './menu-board-system.js';
import { NameTagSystem } from './name-tag-system.js';
import { NetaCaseSystem } from './neta-case-system.js';
import { OfficeSystem } from './office-system.js';
import { OpeningSystem } from './opening-system.js';
import { PantrySystem } from './pantry-system.js';
import { PhoneBookSystem } from './phone-book-system.js';
import { PhoneSystem } from './phone-system.js';
import { PieceSystem } from './piece-system.js';
import { PrepCutSystem } from './prep-cut-system.js';
import { RiceTubSystem } from './rice-tub-system.js';
import { PlaceSystem } from './place-system.js';
import { RangeSystem } from './range-system.js';
import { TamagoSystem } from './tamago-system.js';
import { LabelSystem } from './label-system.js';
import { ShariSystem } from './shari-system.js';
import { StaffSystem } from './staff-system.js';
import { StationSystem } from './station-system.js';
import { TeaSystem } from './tea-system.js';
import { TsumeSystem } from './tsume-system.js';
import { TurnSystem } from './turn-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Order matters: hands and stations first, feedback and debug last.
  world.registerSystem(HandsSystem);
  world.registerSystem(StationSystem);
  world.registerSystem(TurnSystem);
  world.registerSystem(PlaceSystem);
  world.registerSystem(CupboardSystem);
  world.registerSystem(CustomerSystem);
  world.registerSystem(HygieneSystem);
  world.registerSystem(NetaCaseSystem);
  world.registerSystem(RiceTubSystem);
  world.registerSystem(CuttingSystem);
  world.registerSystem(SharpenSystem);
  world.registerSystem(NakagoSystem);
  world.registerSystem(PhoneSystem);
  world.registerSystem(FishOrderSystem);
  world.registerSystem(OfficeSystem);
  world.registerSystem(PhoneBookSystem);
  world.registerSystem(PantrySystem);
  world.registerSystem(StaffSystem);
  world.registerSystem(TeaSystem);
  world.registerSystem(TsumeSystem);
  world.registerSystem(PrepCutSystem);
  world.registerSystem(CureSystem);
  world.registerSystem(ShariSystem);
  world.registerSystem(RangeSystem);
  world.registerSystem(TamagoSystem);
  world.registerSystem(LabelSystem);
  world.registerSystem(OpeningSystem);
  world.registerSystem(PieceSystem);
  world.registerSystem(MasterSystem);
  world.registerSystem(MenuBoardSystem);
  world.registerSystem(NameTagSystem);
  world.registerSystem(FeedbackSystem);
  world.registerSystem(DebugHudSystem);
  // Keyboard practice mode for the desktop emulator (P key). Dev builds only:
  // the import is dropped from production bundles.
  if (import.meta.env.DEV) {
    void import('./practice-system.js').then(({ PracticeSystem }) => world.registerSystem(PracticeSystem));
  }
});
