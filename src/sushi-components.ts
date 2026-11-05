import { createComponent, Types } from '@iwsdk/core';

/**
 * Component declarations shared by the app runtime and the editor.
 * Keep this module free of systems, DOM and renderer imports.
 */

/** Places a hand can act on. Each kind appears once in the scene. */
export const StationKind = {
  CuttingBoard: 'CuttingBoard',
  NetaCase: 'NetaCase',
  Geta: 'Geta',
  Knife: 'Knife',
  WetCloth: 'WetCloth',
  Tezu: 'Tezu',
  Wasabi: 'Wasabi',
  /** The rice tub, kept low on the chef's right, out of view. */
  RiceTub: 'RiceTub',
  Basin: 'Basin',
  Soap: 'Soap',
  Towel: 'Towel',
} as const;

/**
 * A station is a zone above a surface. `radius` makes a round zone; when
 * `width` is set, the zone is a `width` x `depth` box instead. `height` is
 * the surface height above the node origin (where a hand must be above).
 */
export const Station = createComponent('Station', {
  kind: { type: Types.Enum, enum: StationKind, default: StationKind.CuttingBoard },
  radius: { type: Types.Float32, default: 0.12, min: 0.03, max: 0.6, step: 0.01 },
  width: { type: Types.Float32, default: 0, min: 0, max: 2, step: 0.01 },
  depth: { type: Types.Float32, default: 0, min: 0, max: 2, step: 0.01 },
  height: { type: Types.Float32, default: 0, min: 0, max: 0.5, step: 0.005 },
  /** True for props the player may pinch and move (position is remembered). */
  movable: { type: Types.Boolean, default: false },
});

export const Fish = {
  Tuna: 'Tuna',
  White: 'White',
  Silver: 'Silver',
} as const;

/** A fish block in the neta case; slices are cut from it to order. */
export const Saku = createComponent('Saku', {
  fish: { type: Types.Enum, enum: Fish, default: Fish.Tuna },
});

/** Bar-wide state, on one runtime entity named `Bar`. */
export const Bar = createComponent('Bar', {
  /** True while the chef has turned around to the washing station. */
  facingBack: { type: Types.Boolean, default: false },
  /** How many times the chef has turned around. */
  turns: { type: Types.Int32, default: 0 },
});
