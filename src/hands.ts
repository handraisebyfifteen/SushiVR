import { createSystem, Group, Vector3 } from '@iwsdk/core';
import { HandReader } from './hand-reader.js';
import { makeTextSprite } from './text-sprites.js';

/** Controllers in hand and no hands seen for this long: say that the bar is worked with the hands. */
const NO_HANDS_SECONDS = 1.5;

/**
 * Owns the two hand readers and updates them once per frame, before every
 * other game system runs. Other systems read `hands.left` / `hands.right`.
 */
export const hands: { left: HandReader; right: HandReader; all: HandReader[] } = {
  left: null as unknown as HandReader,
  right: null as unknown as HandReader,
  all: [],
};

/**
 * Reads both hands each frame. The game is worked with the hands alone
 * (hand tracking): with controllers in hand and no hands seen, a word in
 * front of the eyes says so, on a headset and in the emulator alike.
 */
export class HandsSystem extends createSystem({}) {
  private notice!: Group;
  private noHands = 0;

  init(): void {
    hands.left = new HandReader('left', this.input.xr);
    hands.right = new HandReader('right', this.input.xr);
    hands.all = [hands.left, hands.right];
    this.notice = new Group();
    this.notice.name = 'HandsOnlyNotice';
    const main = makeTextSprite('Hands only: put the controllers down', { width: 0.6 });
    const sub = makeTextSprite('In the emulator: input mode (hand icon) > Hands', { width: 0.5 });
    sub.position.y = -0.085;
    this.notice.add(main, sub);
    this.notice.visible = false;
    this.notice.position.set(0, -0.04, -0.65);
    this.world.camera.add(this.notice);
  }

  update(delta: number): void {
    hands.left.update();
    hands.right.update();
    const pads = this.input.xr.gamepads;
    const controllers = !!pads.left || !!pads.right;
    this.noHands = controllers && !hands.left.tracked && !hands.right.tracked ? this.noHands + delta : 0;
    const show = this.noHands > NO_HANDS_SECONDS;
    if (show !== this.notice.visible) {
      this.notice.visible = show;
      if (show) console.log('[Hands] controllers but no hands: this bar is worked with the hands');
    }
  }
}

/**
 * Accumulates how far a palm travels while a condition holds (rubbing,
 * wiping). Resets as soon as the condition breaks. With `flat`, only the
 * side-to-side and back-and-forth travel counts, so lowering the hands into
 * the basin and lifting them out is not rubbing.
 */
export class RubTracker {
  private last = new Vector3();
  private active = false;
  distance = 0;

  constructor(private readonly flat = false) {}

  /** Feed one frame. Returns the accumulated distance while `on` stays true. */
  update(point: Vector3, on: boolean): number {
    if (!on) {
      this.active = false;
      this.distance = 0;
      return 0;
    }
    if (this.active) {
      this.distance += this.flat
        ? Math.hypot(point.x - this.last.x, point.z - this.last.z)
        : this.last.distanceTo(point);
    }
    this.last.copy(point);
    this.active = true;
    return this.distance;
  }

  reset(): void {
    this.active = false;
    this.distance = 0;
  }
}
