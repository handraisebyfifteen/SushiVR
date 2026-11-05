import { defineAssets } from '@iwsdk/core';
import {
  createCounter,
  createCustomerCounter,
  createCuttingBoard,
  createGeta,
  createKnife,
  createLedge,
  createNetaCase,
  createSaku,
  createTezuBowl,
  createWasabiDish,
  createWetCloth,
} from './scene-assets/counter.scene-asset.js';
import { createDishCabinet } from './scene-assets/dish-cabinet.scene-asset.js';
import { createEaves } from './scene-assets/eaves.scene-asset.js';
import { createItabaRoom } from './scene-assets/itaba-room.scene-asset.js';
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
  'saku-tuna': createSaku('tuna'),
  'saku-white': createSaku('white'),
  'saku-silver': createSaku('silver'),
  knife: createKnife(),
  'wet-cloth': createWetCloth(),
  'tezu-bowl': createTezuBowl(),
  'wasabi-dish': createWasabiDish(),
  'sink-unit': createSinkUnit(),
  soap: createSoap(),
  towel: createTowel(),
  'dish-cabinet': createDishCabinet(),
  eaves: createEaves(),
  'itaba-room': createItabaRoom(),
});
