import { defineAssets } from '@iwsdk/core';
import {
  createCounter,
  createCustomerCounter,
  createCuttingBoard,
  createGeta,
  createKnife,
  createNetaCase,
  createSaku,
  createTezuBowl,
  createWasabiDish,
  createWetCloth,
} from './scene-assets/counter.scene-asset.js';
import { createRoomFloor } from './scene-assets/room.scene-asset.js';
import {
  createBackCounter,
  createBasin,
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
  counter: createCounter(),
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
  'back-counter': createBackCounter(),
  basin: createBasin(),
  soap: createSoap(),
  towel: createTowel(),
});
