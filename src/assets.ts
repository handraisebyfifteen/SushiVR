import { defineAssets } from '@iwsdk/core';
import { createRoomFloor } from './scene-assets/room.scene-asset.js';

/**
 * Shared asset catalog, evaluated by both the app runtime and the editor.
 * Keep it deterministic and side-effect free (no World, DOM, or timers).
 *
 * Every entry here must also be listed in CREDITS.md.
 */
export default defineAssets({
  'room-floor': createRoomFloor(),
});
