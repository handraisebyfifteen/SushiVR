import { Vector3 } from '@iwsdk/core';
import type { HandReader } from './hand-reader.js';

/**
 * Pointing at something out of reach (the noren at the entrance, the name
 * plaques on the back wall): the index finger, wrist to tip, aims at it, and
 * a pinch right after (it bends the finger) chooses it.
 */

/** Within this many degrees across counts (the aim that matters, it is far); up or down only loosely. */
export const POINT_ACROSS_DEG = 10;
const POINT_UPDOWN_DEG = 75;
/** A pinch counts if the hand pointed this recently (the pinch itself bends the finger). */
export const POINT_LATCH_SECONDS = 0.4;
/**
 * Pointing is done with the hand held out, the other three fingers curled:
 * the fingertip no lower than this below the eyes, this far out from the
 * head, and the middle, ring and little fingers at least half closed. Work
 * at the counter (the board, the case, the ice box) stays lower and closer,
 * and the open hands at the sink do not curl, so a pinch there is never
 * taken for pointing.
 */
const POINT_BELOW_EYES = 0.32;
const POINT_OUT = 0.42;
const POINT_CURL = 0.5;

const dir = new Vector3();
const to = new Vector3();

/** How far off (degrees across) the index finger points from a far point; Infinity if far too high or low. */
export function pointOff(hand: HandReader, target: Vector3): number {
  dir.copy(hand.indexTip).sub(hand.wrist);
  to.copy(target).sub(hand.indexTip);
  const upDir = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
  const upTo = Math.atan2(to.y, Math.hypot(to.x, to.z));
  if (Math.abs(upDir - upTo) >= (POINT_UPDOWN_DEG * Math.PI) / 180) return Infinity;
  return (Math.abs(Math.atan2(dir.x * to.z - dir.z * to.x, dir.x * to.x + dir.z * to.z)) * 180) / Math.PI;
}

/** The index finger points at a far point. */
export function pointsAt(hand: HandReader, target: Vector3): boolean {
  return pointOff(hand, target) < POINT_ACROSS_DEG;
}

/** The hand is held out to point (see POINT_BELOW_EYES), given the head's world position. */
export function heldOut(hand: HandReader, head: Vector3): boolean {
  return (
    hand.curl >= POINT_CURL &&
    hand.indexTip.y >= head.y - POINT_BELOW_EYES &&
    Math.hypot(hand.indexTip.x - head.x, hand.indexTip.z - head.z) > POINT_OUT
  );
}
