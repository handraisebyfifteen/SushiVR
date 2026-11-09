import type { Vector3, XROrigin } from '@iwsdk/core';
import { chef, type Side } from './game-state.js';
import { GAZE_CONE_DEG, gazeOff, GazePinch } from './gaze.js';
import { hands } from './hands.js';
import { heldOut, POINT_ACROSS_DEG, POINT_LATCH_SECONDS, pointOff } from './pointing.js';
import { Held } from './sushi-components.js';

/** Something chosen from afar: where it is, and how big it looks to the eyes (for gaze). */
export interface FarTarget<T> {
  id: T;
  at: Vector3;
  radius: number;
}

const SIDES: readonly Side[] = [0, 1];

/**
 * Choosing something out of reach, as the office does: an empty hand held
 * out points at it and pinches (the pinch counts if it pointed just before),
 * or, on a device that tracks the eyes, a look at it and a pinch with an
 * empty hand. `hovered` is what is pointed or looked at (to glow it).
 */
export class FarChooser<T> {
  hovered: T | null = null;
  private readonly pointed: [T | null, T | null] = [null, null];
  private readonly lastPointed = [-1, -1];
  private readonly gazePinch = new GazePinch<T>();
  private time = 0;

  /** One frame: the target chosen now, or null. `targets` are the ones that may be chosen. */
  update(delta: number, player: XROrigin, head: Vector3, targets: readonly FarTarget<T>[]): T | null {
    this.time += delta;
    this.hovered = null;
    let chosen: T | null = null;
    for (const side of SIDES) {
      const hand = hands.all[side];
      if (!hand?.tracked || chef.hands[side].holding !== Held.None) continue;
      if (!heldOut(hand, head)) {
        if (hand.pinchStart) this.pointed[side] = null;
        continue;
      }
      let best: T | null = null;
      let off = POINT_ACROSS_DEG;
      for (const t of targets) {
        const o = pointOff(hand, t.at);
        if (o < off) {
          off = o;
          best = t.id;
        }
      }
      if (best !== null) {
        this.pointed[side] = best;
        this.lastPointed[side] = this.time;
        this.hovered = best;
      }
      const was = this.pointed[side];
      if (!hand.pinchStart || was === null || this.time - this.lastPointed[side] > POINT_LATCH_SECONDS) continue;
      this.pointed[side] = null;
      if (targets.some((t) => t.id === was)) {
        chosen = was;
        break;
      }
    }
    let seen: T | null = null;
    let seenOff = GAZE_CONE_DEG;
    for (const t of targets) {
      const o = gazeOff(player, t.at, t.radius);
      if (o < seenOff) {
        seenOff = o;
        seen = t.id;
      }
    }
    if (chosen !== null) {
      this.gazePinch.cancel();
      this.hovered = null;
      return chosen;
    }
    if (seen !== null) this.hovered = seen;
    const byEye = this.gazePinch.update(seen);
    if (byEye !== null && targets.some((t) => t.id === byEye)) {
      this.hovered = null;
      return byEye;
    }
    return null;
  }

  /** Forget a half-made choice (the targets changed). */
  reset(): void {
    this.pointed[0] = this.pointed[1] = null;
    this.gazePinch.cancel();
  }
}
