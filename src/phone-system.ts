import { createSystem, type Object3D, type Sprite, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { COLOR_DONE, feedback } from './feedback.js';
import { prep, staff } from './game-state.js';
import { stations } from './station-system.js';
import { StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { DELIVERY_SECONDS, DIFFICULTY } from './tuning.js';

/** The handset rises this far off its cradle, the call goes through after this long, and it goes back down after this. */
const LIFT = 0.07;
const RING_SECONDS = 1.0;
const HANG_UP_SECONDS = 3.0;
const SPEECH_SECONDS = 4;

/** How the office corner (src/office-system.ts) picks up the phone when it is pointed at. */
export const phoneApi = {
  /** True while a call can be made (the morning, before the order). */
  ready: (): boolean => false,
  call: (): void => undefined,
};

/**
 * The telephone in the office corner, and the fish shop. It is out of reach
 * from the seat: point at it and pinch (src/office-system.ts), and the
 * handset comes up off its cradle; on the easy difficulty the shop brings
 * what is missing on its own ("omakase"). A while later the delivery, the
 * styrofoam ice box of wrapped fish, is on the counter (src/prep-cut-system.ts).
 * Ordering by checking the case stock is the full difficulty's (later).
 */
export class PhoneSystem extends createSystem({}) {
  private handset: Object3D | null = null;
  private readonly home = new Vector3();
  /** Seconds since the handset was picked up, or -1 while it rests. */
  private lifted = -1;
  private deliverIn = 0;
  private speech!: Sprite;
  private speechTime = 0;
  private readonly tmp = new Vector3();

  init(): void {
    this.speech = makeTextSprite(' ', { width: 0.42 });
    this.speech.name = 'PhoneSpeech';
    this.speech.visible = false;
    this.world.createTransformEntity(this.speech);
    phoneApi.ready = () => !!this.handset && this.lifted < 0 && prep.active && !prep.ordered;
    phoneApi.call = () => {
      if (phoneApi.ready()) this.lifted = 0;
    };
  }

  update(delta: number): void {
    if (this.speechTime > 0) {
      this.speechTime -= delta;
      if (this.speechTime <= 0) this.speech.visible = false;
    }
    const phone = stations.get(StationKind.Phone);
    if (!phone) return;
    if (!this.handset) {
      this.handset = phone.entity.object3D?.getObjectByName('Handset') ?? null;
      if (!this.handset) return;
      this.home.copy(this.handset.position);
    }
    const handset = this.handset;
    handset.getWorldPosition(staff.phoneAt);
    if (this.lifted >= 0) {
      // Up off the cradle and tilted, as held to the ear; then back down.
      this.lifted += delta;
      const up = Math.min(1, this.lifted / 0.3, Math.max(0, (HANG_UP_SECONDS - this.lifted) / 0.3));
      handset.position.copy(this.home).add(this.tmp.set(0, LIFT * up, -0.02 * up));
      handset.rotation.x = 0.5 * up;
      if (this.lifted >= RING_SECONDS && prep.active && !prep.ordered) this.order();
      if (this.lifted >= HANG_UP_SECONDS) {
        this.lifted = -1;
        handset.position.copy(this.home);
        handset.rotation.x = 0;
      }
    }
    if (prep.ordered && !prep.delivered) {
      this.deliverIn -= delta;
      if (this.deliverIn <= 0) this.deliver();
    }
  }

  private order(): void {
    prep.ordered = true;
    this.deliverIn = DELIVERY_SECONDS;
    const words = DIFFICULTY === 'easy' ? 'Fish shop: Morning! The usual? Right away.' : 'Fish shop: Morning! What will it be?';
    this.say(words, stations.get(StationKind.Phone)!.pos, 0.3);
    feedback.flash(StationKind.Phone, COLOR_DONE);
    coach.done('callFishShop');
    console.log('[Phone] called the fish shop: omakase');
  }

  private deliver(): void {
    prep.delivered = true;
    const box = stations.get(StationKind.IceBox);
    if (box) this.say('Delivery! On the counter.', box.pos, 0.28);
    console.log('[Phone] the delivery has come');
  }

  private say(text: string, at: Vector3, lift: number): void {
    setSpriteText(this.speech, text);
    this.speech.position.copy(at).add(this.tmp.set(0, lift, 0));
    this.speech.visible = true;
    this.speechTime = SPEECH_SECONDS;
  }
}
