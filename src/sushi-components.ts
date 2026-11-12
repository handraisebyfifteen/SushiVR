import { createComponent, Types } from '@iwsdk/core';
import { Menu, Neta } from './menu.js';

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
  /** The hinoki holder (包丁桶) the knife stands in beside the board. */
  KnifeHolder: 'KnifeHolder',
  WetCloth: 'WetCloth',
  Tezu: 'Tezu',
  Wasabi: 'Wasabi',
  /** The rice tub on a low stand at the chef's right, under the counter, out of the customers' view. */
  RiceTub: 'RiceTub',
  Sink: 'Sink',
  /** The whetstone on the sink's end strip (src/sharpen-system.ts). */
  Whetstone: 'Whetstone',
  Soap: 'Soap',
  Towel: 'Towel',
  /** Nori for gunkan and rolls, on the board's back-left corner. */
  NoriBox: 'NoriBox',
  /** The bamboo mat, laid out on the board while a roll is ordered. */
  Makisu: 'Makisu',
  /** The morning's materials on ice in a styrofoam box, at the counter's left end. */
  IceBox: 'IceBox',
  /** The trash bin at the chef's left foot; its lid opens as a hand comes near. */
  TrashBin: 'TrashBin',
  /** A box of kitchen paper at the board's back edge. */
  PaperBox: 'PaperBox',
  /** The telephone on the sink's left end (seen facing the sink). */
  Phone: 'Phone',
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
  /** How far above the surface the zone still counts (higher for the geta, reached over the neta case). */
  above: { type: Types.Float32, default: 0.3, min: 0.05, max: 1, step: 0.01 },
  /** True for props the player may pinch and move (position is remembered). */
  movable: { type: Types.Boolean, default: false },
});

/**
 * One item in the neta case (a saku, a tray of ready-cut pieces, a box of
 * uni...). `remaining` is the slices, pieces or servings left; 0 = sold out.
 */
export const CaseItem = createComponent('CaseItem', {
  neta: { type: Types.Enum, enum: Neta, default: Neta.LeanTuna },
  remaining: { type: Types.Int32, default: 0, min: 0, max: 200 },
});

/** Bar-wide state, on one runtime entity named `Bar`. */
export const Bar = createComponent('Bar', {
  /** True while the chef has turned around to the washing station. */
  facingBack: { type: Types.Boolean, default: false },
  turns: { type: Types.Int32, default: 0 },
  /** True once the opening hand wash (with soap) is done and service starts. */
  open: { type: Types.Boolean, default: false },
  served: { type: Types.Int32, default: 0 },
  /** Yen taken today. */
  sales: { type: Types.Int32, default: 0 },
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
  /** A nori strip on the neta hand's fingers (a gunkan in the making). */
  Nori: 'Nori',
  /** The topping spoon, uni or salmon roe on it. */
  Spoon: 'Spoon',
  /** A roll filling (kanpyo, cucumber...) on its way to the mat. */
  Filling: 'Filling',
  /** A half sheet of nori on its way to the mat. */
  NoriSheet: 'NoriSheet',
  /** The whetstone, on its way to the basin to be wetted. */
  Stone: 'Stone',
  /** One of the fish shop's empty inserts (or the anago's pack), on its way to the sink and the sink's end (or the trash). */
  Nakago: 'Nakago',
  /** The dry cloth from the sink's front edge (drying an insert). */
  DryCloth: 'DryCloth',
  /** A sheet of kitchen paper (patting the squid dry). */
  Paper: 'Paper',
  /** The manaita, carried to the sink to be washed and back. */
  Board: 'Board',
  /** The telephone handset. */
  Phone: 'Phone',
  /** A cup of tea, on its way to the customer. */
  Tea: 'Tea',
  /** The rice paddle (shari-kiri). */
  Shamoji: 'Shamoji',
  /** The bowl of awasezu, poured over the rice. */
  Awasezu: 'Awasezu',
  /** The ohitsu, brought to the work table and back. */
  Ohitsu: 'Ohitsu',
  /** The grill net, from its hook onto a burner. */
  Net: 'Net',
  /** The scaler (鱗取り), from the sink's soap strip. */
  Scaler: 'Scaler',
  /** The deba (出刃包丁), the sink's own knife for heads and bellies. */
  Deba: 'Deba',
  /** The tweezers (骨抜き) for pin bones. */
  Tweezers: 'Tweezers',
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
  /** Done, waiting for the check. */
  Paying: 'Paying',
  Leaving: 'Leaving',
} as const;

/** One customer at the counter (an abstract figure) and their current order. */
export const Customer = createComponent('Customer', {
  /** What the customer ordered (src/menu.ts). */
  item: { type: Types.Enum, enum: Menu, default: Menu.LeanTunaNigiri },
  wasabi: { type: Types.Boolean, default: true },
  leftHanded: { type: Types.Boolean, default: false },
  /** True after the customer has reached for a piece, revealing their hand. */
  handKnown: { type: Types.Boolean, default: false },
  eaten: { type: Types.Int32, default: 0 },
  /** Orders this customer will make (good pieces bring more), and how many are done. */
  orders: { type: Types.Int32, default: 3 },
  ordersDone: { type: Types.Int32, default: 0 },
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

/** A gunkan's own stages; None, Done, Carried and Placed are shared with the nigiri. */
export const GunkanStage = {
  /** The shaped shari on the cutting board (a gunkan is made there, not in the palm). */
  Rice: 'ShariDown',
  /** A nori strip in the neta hand's pinch, the shari still on the board. */
  Nori: 'Nori',
  /** The rice wrapped in the nori, on the board. */
  Wrapped: 'Wrapped',
} as const;

/** An inari's own stages. */
export const InariStage = {
  /** An opened pouch on the neta hand's fingers. */
  Age: 'Age',
  /** The rice is in the pouch; the mouth is still open. */
  Stuffed: 'Stuffed',
} as const;

/** A roll's own stages. */
export const MakiStage = {
  /** A half sheet of nori lies on the mat. */
  Laid: 'Laid',
  /** The rice is spread over the nori. */
  Spread: 'Spread',
  /** Every filling is on the rice. */
  Filled: 'Filled',
  /** Rolled up in the mat. */
  Rolled: 'Rolled',
  /** Squeezed firm (judged); now it is cut. */
  Squeezed: 'Squeezed',
} as const;

export const PieceKindValue = {
  None: 'None',
  Nigiri: 'nigiri',
  Gunkan: 'gunkan',
  Inari: 'inari',
  Maki: 'maki',
} as const;

export const Judge = {
  None: 'None',
  Excellent: 'Excellent',
  Good: 'Good',
  Poor: 'Poor',
  Bad: 'Bad',
} as const;

/** The piece being made (nigiri, gunkan...), on one runtime entity named `Piece`. */
export const Piece = createComponent('Piece', {
  /** What kind of piece is in progress ('None' until its first ingredient). */
  kind: { type: Types.Enum, enum: PieceKindValue, default: PieceKindValue.None },
  /** NigiriStage or GunkanStage value. */
  stage: { type: Types.String, default: NigiriStage.None },
  neta: { type: Types.Enum, enum: Neta, default: Neta.LeanTuna },
  /** True while a cut slice exists (on the board or in hand), or a gunkan is wrapped. */
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
  wrongItem: { type: Types.Boolean, default: false },
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
