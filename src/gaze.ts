import { Quaternion, Vector3, type XROrigin } from '@iwsdk/core';
import { chef, prep, type Side } from './game-state.js';
import { hands } from './hands.js';
import { Held } from './sushi-components.js';

/**
 * Eye tracking, on devices that have it (Meta VR Glasses): look at something
 * out of reach and pinch, with either empty hand, to choose it. It is the
 * glasses' own way of choosing; pointing (src/pointing.ts) stays as it is,
 * and a device without eye tracking (Quest 3, 3S) has only pointing.
 *
 * The runtime gives the gaze ray when `gazeTracking` is granted
 * (iwsdk.config.json); IWSDK keeps it in `player.eyeSpace`.
 */

/** Within this many degrees of a target's edge counts as looking at it (the eyes' aim, as read). */
export const GAZE_CONE_DEG = 4;

const SIDES: readonly Side[] = [0, 1];
const origin = new Vector3();
const dir = new Vector3();
const to = new Vector3();
const q = new Quaternion();

/** The hand holds nothing: no tool or food, nothing of the prep. */
function empty(side: Side): boolean {
  return chef.hands[side].holding === Held.None && !prep.carrying[side];
}

/** The eyes are tracked this frame. */
export function gazeTracked(player: XROrigin): boolean {
  return player.gazeOrigin === 'tracked';
}

/**
 * How many degrees the gaze passes outside a far target of this radius
 * (0 when it falls on it); Infinity without eye tracking.
 */
export function gazeOff(player: XROrigin, target: Vector3, radius: number): number {
  if (player.gazeOrigin !== 'tracked') return Infinity;
  player.eyeSpace.getWorldPosition(origin);
  player.eyeSpace.getWorldQuaternion(q);
  dir.set(0, 0, -1).applyQuaternion(q);
  to.copy(target).sub(origin);
  const dist = to.length();
  if (dist < 1e-3) return Infinity;
  const angle = (dir.angleTo(to) * 180) / Math.PI;
  const half = (Math.atan2(radius, dist) * 180) / Math.PI;
  return Math.max(0, angle - half);
}

/**
 * A pinch while looking at a far target. It is taken a frame later, and only
 * if the pinching hand still holds nothing: a pinch that took something up
 * at hand (a piece of neta, the cup) was work, not a choice.
 */
export class GazePinch<T> {
  private pending: T | null = null;
  private side: Side = 0;

  /** Once a frame, with what is looked at (null for nothing). Returns what a pinch has chosen, or null. */
  update(seen: T | null): T | null {
    if (this.pending !== null) {
      const chosen = this.pending;
      this.pending = null;
      if (empty(this.side)) return chosen;
    }
    if (seen === null) return null;
    for (const side of SIDES) {
      const hand = hands.all[side];
      if (hand?.tracked && hand.pinchStart && empty(side)) {
        this.pending = seen;
        this.side = side;
        break;
      }
    }
    return null;
  }

  /** Something else (pointing) took this pinch: drop a pinch waiting to be taken. */
  cancel(): void {
    this.pending = null;
  }
}
