import { defineAssets } from '@iwsdk/core';
import {
  createCounter,
  createCustomerCounter,
  createCuttingBoard,
  createGeta,
  createKnife,
  createLedge,
  createNetaCase,
  createMakisu,
  createNoriBox,
  createRiceTub,
  createTezuBowl,
  createWasabiDish,
  createWetCloth,
} from './scene-assets/counter.scene-asset.js';
import { createIceBox } from './scene-assets/ice-box.scene-asset.js';
import { createEntrance, createFoodShelf, createPaperBox, createPhone, createTrashBin } from './scene-assets/shop-props.scene-asset.js';
import { caseItemAssets } from './scene-assets/case-items.scene-asset.js';
import { createDishCabinet } from './scene-assets/dish-cabinet.scene-asset.js';
import { createEaves } from './scene-assets/eaves.scene-asset.js';
import { createItabaRoom } from './scene-assets/itaba-room.scene-asset.js';
import { createGasStove, createWorkTable } from './scene-assets/kitchen-station.scene-asset.js';
import { createChefPlatform, createRoomFloor } from './scene-assets/room.scene-asset.js';
import {
  createSinkUnit,
  createSoap,
  createTowel,
} from './scene-assets/wash-station.scene-asset.js';

/**
 * Shared asset catalog, evaluated by both the app runtime and the editor.
 * Keep it deterministic and side-effect free (no World, DOM, or timers).
 *
 * Every entry here must also be listed in CREDITS.md.
 */
export default defineAssets({
  'room-floor': createRoomFloor(),
  'chef-platform': createChefPlatform(),
  counter: createCounter(),
  ledge: createLedge(),
  'customer-counter': createCustomerCounter(),
  'cutting-board': createCuttingBoard(),
  geta: createGeta(),
  'neta-case': createNetaCase(),
  knife: createKnife(),
  'wet-cloth': createWetCloth(),
  'tezu-bowl': createTezuBowl(),
  'wasabi-dish': createWasabiDish(),
  'nori-box': createNoriBox(),
  'ice-box': createIceBox(),
  'trash-bin': createTrashBin(),
  'paper-box': createPaperBox(),
  phone: createPhone(),
  'food-shelf': createFoodShelf(),
  entrance: createEntrance(),
  makisu: createMakisu(),
  'rice-tub': createRiceTub(),
  'sink-unit': createSinkUnit(),
  soap: createSoap(),
  towel: createTowel(),
  'dish-cabinet': createDishCabinet(),
  eaves: createEaves(),
  'itaba-room': createItabaRoom(),
  'work-table': createWorkTable(),
  'gas-stove': createGasStove(),
  // Every neta-case item (case-lean-tuna, ...), from src/menu.ts.
  ...caseItemAssets(),
});
