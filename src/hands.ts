import { createSystem, Vector3 } from '@iwsdk/core';
import { HandReader } from './hand-reader.js';

/**
 * Owns the two hand readers and updates them once per frame, before every
 * other game system runs. Other systems read `hands.left` / `hands.right`.
 */
export const hands: { left: HandReader; right: HandReader; all: HandReader[] } = {
  left: null as unknown as HandReader,
  right: null as unknown as HandReader,
  all: [],
};

export class HandsSystem extends createSystem({}) {
  init(): void {
    hands.left = new HandReader('left', this.input.xr);
    hands.right = new HandReader('right', this.input.xr);
    hands.all = [hands.left, hands.right];
  }

  update(): void {
    hands.left.update();
    hands.right.update();
  }
}

/**
 * Accumulates how far a palm travels while a condition holds (rubbing,
 * wiping). Resets as soon as the condition breaks.
 */
export class RubTracker {
  private last = new Vector3();
  private active = false;
  distance = 0;

  /** Feed one frame. Returns the accumulated distance while `on` stays true. */
  update(point: Vector3, on: boolean): number {
    if (!on) {
      this.active = false;
      this.distance = 0;
      return 0;
    }
    if (this.active) this.distance += this.last.distanceTo(point);
    this.last.copy(point);
    this.active = true;
    return this.distance;
  }

  reset(): void {
    this.active = false;
    this.distance = 0;
  }
}
