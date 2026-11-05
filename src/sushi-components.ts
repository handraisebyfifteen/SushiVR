import { createComponent, Types } from '@iwsdk/core';

/** Which counter station a scene node is. Authored in scene JSON. */
export const StationKind = {
  RiceTub: 'RiceTub',
  CuttingBoard: 'CuttingBoard',
  NetaTray: 'NetaTray',
  Geta: 'Geta',
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
  Idle: 'Idle',
  HoldRice: 'HoldRice',
  RiceOnBoard: 'RiceOnBoard',
  HoldNeta: 'HoldNeta',
  NigiriOnBoard: 'NigiriOnBoard',
  HoldNigiri: 'HoldNigiri',
  OnGeta: 'OnGeta',
  Serving: 'Serving',
} as const;

/** Runtime game state. One entity carries it so tools can inspect it. */
export const NigiriGame = createComponent('NigiriGame', {
  step: { type: Types.Enum, default: NigiriStep.Idle, enum: NigiriStep },
  squeezes: { type: Types.Int32, default: 0 },
  shaped: { type: Types.Boolean, default: false },
  served: { type: Types.Int32, default: 0 },
  holdProgress: { type: Types.Float32, default: 0 },
});
