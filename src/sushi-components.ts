import { createComponent, Types } from '@iwsdk/core';

/** Which counter station a scene node is. Authored in scene JSON. */
export const StationKind = {
  RiceTub: 'RiceTub',
  CuttingBoard: 'CuttingBoard',
  NetaTray: 'NetaTray',
  Geta: 'Geta',
  Basin: 'Basin',
  Towel: 'Towel',
  Tezu: 'Tezu',
  Wasabi: 'Wasabi',
} as const;

export const Station = createComponent('Station', {
  kind: {
    type: Types.Enum,
    default: StationKind.RiceTub,
    enum: StationKind,
    help: 'Role of this station in the nigiri workflow.',
  },
  radius: {
    type: Types.Float32,
    default: 0.14,
    min: 0.05,
    max: 0.5,
    help: 'Horizontal reach (m) around the station where a hand counts as "over" it.',
  },
  height: {
    type: Types.Float32,
    default: 0.0,
    help: 'Height (m) of the working surface above the station origin.',
  },
});

/** Steps of the nigiri workflow, in order. */
export const NigiriStep = {
  /** Nothing held. Rice hand takes rice from the tub (needs a wet hand). */
  Idle: 'Idle',
  /** Rice ball in the rice hand; the other hand takes neta from the tray. */
  HoldRice: 'HoldRice',
  /** Rice in one hand, neta on the other palm; wasabi, then join the hands. */
  HoldBoth: 'HoldBoth',
  /** Rice sits on the neta in the neta hand; squeeze to press and flip. */
  Shaping: 'Shaping',
  /** Shaped nigiri rests in the neta hand; pinch it with the other hand. */
  NigiriInHand: 'NigiriInHand',
  /** Nigiri pinched; release it on the geta. */
  HoldNigiri: 'HoldNigiri',
  /** On the geta; hold a fist there to serve. */
  OnGeta: 'OnGeta',
  Serving: 'Serving',
} as const;

/** Cleanliness of one hand. Shown as a small ring under the palm. */
export const HandState = {
  /** Needs the basin: start of service, or rice grains after several pieces. */
  Unwashed: 'Unwashed',
  /** Needs the towel: just washed, or touched something other than food. */
  NeedsWipe: 'NeedsWipe',
  Clean: 'Clean',
  /** Dipped in tezu (vinegar water); rice will not stick. */
  Wet: 'Wet',
} as const;

export const Hand = { None: 'None', Left: 'Left', Right: 'Right' } as const;

export const WasabiState = { None: 'None', OnFinger: 'OnFinger', OnNeta: 'OnNeta' } as const;

/** Runtime game state. One entity carries it so tools can inspect it. */
export const NigiriGame = createComponent('NigiriGame', {
  step: { type: Types.Enum, default: NigiriStep.Idle, enum: NigiriStep },
  riceHand: { type: Types.Enum, default: Hand.None, enum: Hand },
  leftHand: { type: Types.Enum, default: HandState.Unwashed, enum: HandState },
  rightHand: { type: Types.Enum, default: HandState.Unwashed, enum: HandState },
  lidOpen: { type: Types.Boolean, default: false },
  wasabi: { type: Types.Enum, default: WasabiState.None, enum: WasabiState },
  squeezes: { type: Types.Int32, default: 0 },
  shaped: { type: Types.Boolean, default: false },
  served: { type: Types.Int32, default: 0 },
  holdProgress: { type: Types.Float32, default: 0 },
});
