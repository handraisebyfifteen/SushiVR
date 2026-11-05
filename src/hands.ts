import { createSystem } from '@iwsdk/core';
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
