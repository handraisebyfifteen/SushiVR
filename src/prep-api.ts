import type { Object3D, Vector3 } from '@iwsdk/core';
import type { Grade } from './coach.js';
import type { Side } from './game-state.js';
import type { NetaId } from './menu.js';
import type { PrepId } from './prep.js';

/**
 * What the morning prep's systems ask of each other (filled in by each in
 * its init): kept apart so the systems need not import one another.
 */
export const prepApi = {
  /** A prep task is finished (a material, the bonito belly, the shari): counted toward the prep being done. */
  taskDone: (_what: string): void => {},
  /** A case item filled with this many slices (yield counted). */
  stock: (_neta: NetaId, _stock: number): void => {},
  /** The hand holds a sheet of kitchen paper; it is used now (to be thrown away). */
  paperIn: (_side: Side): boolean => false,
  usePaper: (_side: Side): void => {},
  /** This material still comes to its pot today (before the delivery, all may): not ordered, or taken by the cook, it does not. */
  potWanted: (_id: string): boolean => true,
  /** This material has still to go into its pot (in the ice box, or in a hand on the way): its insert is not done with yet. */
  awaitingPot: (_id: PrepId): boolean => false,
  /** The hamaguri, out of their pot and let go over the board: true when they went onto it (the board's work takes them from there). */
  fromPot: (_id: PrepId, _grade: Grade): boolean => false,
  /** Nothing lies on the board (no material, no seared belly): the hamaguri may come onto it. */
  boardFree: (): boolean => true,
};

/** The tsume pot and its brush on the counter (src/tsume-system.ts). */
export const tsumeApi = {
  /** The brush is in this hand. */
  brushIn: (_side: Side): boolean => false,
  /** The brush's bristle tip (world) while in this hand; false if it is not. */
  tipAt: (_side: Side, _out: Vector3): boolean => false,
};

export const cureApi = {
  /** A filleted or opened fish let go here (its parts): true when it went into its tray on the drainboard (the curing keeps it from then on). */
  lay: (_id: PrepId, _parts: Object3D[], _at: Vector3): boolean => false,
  /** Where its tray is (world, its middle just over the floor), for hints and practice. */
  trayAt: (_id: PrepId, _out: Vector3): boolean => false,
};

export const rangeApi = {
  /** A prepared ingredient let go here: true when it went into its own pot (the range keeps it from then on). */
  putIn: (_id: PrepId, _root: Object3D, _at: Vector3): boolean => false,
  /** A material is in a hand this frame (the octopus's legs are dipped while it is held over its boiling pot). */
  carried: (_id: PrepId, _root: Object3D): void => {},
  /** Where its pot is (world, the liquid's middle), for hints and practice. */
  potAt: (_id: PrepId, _out: Vector3): boolean => false,
  /** The bonito belly is back on the ice at this point: the range takes it from here (skewers, the net, the ice, paper). */
  bellyOnIce: (_at: Vector3): void => {},
  /** The cook took it to the back: it comes out seared and goes into the case. */
  bellyByCook: (): void => {},
};

/** The tamago's suribachi on the work table (src/tamago-system.ts), for the prep's scallops and eggs. */
export const tamagoApi = {
  /** The suribachi is out on the work table, empty: the scallops and eggs can come from the ice box. */
  ready: (): boolean => false,
  /** The scallops and eggs let go over the suribachi: the scallops in, the pack of eggs set down beside it. */
  makingsIn: (_root: Object3D, _at: Vector3): boolean => false,
  /** The suribachi's middle (world). */
  bowlAt: (_out: Vector3): boolean => false,
  /** The cook took the batter to the back: no tamago on the range today. */
  byCook: (): void => {},
};

/** The fish shop's inserts (中子) and the anago's plate (src/nakago-system.ts). */
export const nakagoApi = {
  /** The delivery is being laid out afresh (a new day): yesterday's inserts go. */
  clear: (): void => {},
  /** This range ingredient comes in an insert (the anago on a plate) at this spot in the ice box (world; the food rests on its floor). */
  deliver: (_id: PrepId, _slot: Vector3): void => {},
  /** The part-timer's cleanup: the inserts washed and stacked without the chef. */
  byStaff: (): void => {},
};
