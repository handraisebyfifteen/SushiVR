import { defineAssets } from '@iwsdk/core';
import {
  createBasin,
  createCounter,
  createCuttingBoard,
  createGeta,
  createNetaTray,
  createRiceTub,
  createTezuBowl,
  createTowel,
  createWasabiDish,
} from './scene-assets/counter.scene-asset.js';
import { createRoomFloor } from './scene-assets/room.scene-asset.js';

/**
 * Shared asset catalog, evaluated by both the app runtime and the editor.
 * Keep it deterministic and side-effect free (no World, DOM, or timers).
 *
 * Every entry here must also be listed in CREDITS.md.
 */
export default defineAssets({
  'room-floor': createRoomFloor(),
  counter: createCounter(),
  'cutting-board': createCuttingBoard(),
  geta: createGeta(),
  'rice-tub': createRiceTub(),
  'neta-tray': createNetaTray(),
  basin: createBasin(),
  towel: createTowel(),
  'tezu-bowl': createTezuBowl(),
  'wasabi-dish': createWasabiDish(),
});
