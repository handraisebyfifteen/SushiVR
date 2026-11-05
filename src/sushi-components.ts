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
  Sink: 'Sink',
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
  /** How far below the surface the zone still counts (deeper for the sink, where hands go into the basin). */
  below: { type: Types.Float32, default: 0.05, min: 0, max: 0.5, step: 0.01 },
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
  turns: { type: Types.Int32, default: 0 },
  /** True once the opening hand wash (with soap) is done and service starts. */
  open: { type: Types.Boolean, default: false },
  served: { type: Types.Int32, default: 0 },
  totalScore: { type: Types.Int32, default: 0 },
});

export const Held = {
  None: 'None',
  Saku: 'Saku',
  Knife: 'Knife',
  Cloth: 'Cloth',
  Neta: 'Neta',
  Rice: 'Rice',
  Sushi: 'Sushi',
  Dish: 'Dish',
} as const;

/** The chef's hands and tools, mirrored from the game state for inspection. */
export const Chef = createComponent('Chef', {
  leftDirt: { type: Types.Float32, default: 0 },
  rightDirt: { type: Types.Float32, default: 0 },
  leftNeedsWash: { type: Types.Boolean, default: true },
  rightNeedsWash: { type: Types.Boolean, default: true },
  leftNeedsTowel: { type: Types.Boolean, default: false },
  rightNeedsTowel: { type: Types.Boolean, default: false },
  leftWet: { type: Types.Boolean, default: false },
  rightWet: { type: Types.Boolean, default: false },
  leftHolding: { type: Types.Enum, enum: Held, default: Held.None },
  rightHolding: { type: Types.Enum, enum: Held, default: Held.None },
  soaped: { type: Types.Boolean, default: false },
  soapDuringService: { type: Types.Boolean, default: false },
  knifeUnwiped: { type: Types.Boolean, default: false },
  boardDirt: { type: Types.Float32, default: 0 },
  clothDirty: { type: Types.Boolean, default: false },
  knifeDirty: { type: Types.Boolean, default: false },
});

export const CustomerState = {
  Waiting: 'Waiting',
  Reaching: 'Reaching',
  Eating: 'Eating',
  Leaving: 'Leaving',
} as const;

/** One customer at the counter (an abstract figure) and their current order. */
export const Customer = createComponent('Customer', {
  fish: { type: Types.Enum, enum: Fish, default: Fish.Tuna },
  wasabi: { type: Types.Boolean, default: true },
  leftHanded: { type: Types.Boolean, default: false },
  /** True after the customer has reached for a piece, revealing their hand. */
  handKnown: { type: Types.Boolean, default: false },
  eaten: { type: Types.Int32, default: 0 },
  state: { type: Types.Enum, enum: CustomerState, default: CustomerState.Waiting },
  lastGrade: { type: Types.String, default: '' },
});

export const NigiriStage = {
  None: 'None',
  Neta: 'Neta',
  Rice: 'Rice',
  Joined: 'Joined',
  Touched1: 'Touched1',
  Flipped: 'Flipped',
  Touched2: 'Touched2',
  Rotated: 'Rotated',
  Done: 'Done',
  Carried: 'Carried',
  Placed: 'Placed',
} as const;

export const Judge = {
  None: 'None',
  Excellent: 'Excellent',
  Good: 'Good',
  Poor: 'Poor',
  Bad: 'Bad',
} as const;

/** The piece being made, on one runtime entity named `Nigiri`. */
export const Nigiri = createComponent('Nigiri', {
  stage: { type: Types.Enum, enum: NigiriStage, default: NigiriStage.None },
  fish: { type: Types.Enum, enum: Fish, default: Fish.Tuna },
  /** True while a cut slice exists (on the board or in hand). */
  hasNeta: { type: Types.Boolean, default: false },
  /** Seconds since the slice was cut (freshness). Writable for testing. */
  cutAge: { type: Types.Float32, default: 0 },
  wasabi: { type: Types.Boolean, default: false },
  /** True when the slice's skin edge will end up on the customer's right. */
  skinRight: { type: Types.Boolean, default: true },
  judgeRice: { type: Types.Enum, enum: Judge, default: Judge.None },
  judge1: { type: Types.Enum, enum: Judge, default: Judge.None },
  judge2: { type: Types.Enum, enum: Judge, default: Judge.None },
  judge3: { type: Types.Enum, enum: Judge, default: Judge.None },
  /** Heading of the head (thick) end in degrees: 0 = toward the customer. */
  yawDeg: { type: Types.Float32, default: 0 },
  knifeUnwiped: { type: Types.Boolean, default: false },
  wrongFish: { type: Types.Boolean, default: false },
  boardWasDirty: { type: Types.Boolean, default: false },
  soapDuringService: { type: Types.Boolean, default: false },
});

/** The master (guide), on one runtime entity named `Master`, mirrored for inspection. */
export const Master = createComponent('Master', {
  /** The step the master thinks comes next ('' when none). */
  step: { type: Types.String, default: '' },
  /** Seconds without progress on that step. */
  idle: { type: Types.Float32, default: 0 },
  /** Last word the master said. */
  lastSaid: { type: Types.String, default: '' },
  /** True while the ghost hands show the motion. */
  demo: { type: Types.Boolean, default: false },
  /** Steps done often enough that the master stays quiet about them. */
  learnedSteps: { type: Types.Int32, default: 0 },
});
