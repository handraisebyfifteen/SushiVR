import { createSystem, type Object3D, type Sprite, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { COLOR_DONE, feedback } from './feedback.js';
import { prep, staff } from './game-state.js';
import { stations } from './station-system.js';
import { StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { fishOrder, orderTotal, pickKohadaSize, sizesOf } from './fish-order.js';
import { yen } from './ledger.js';
import { DELIVERY_SECONDS } from './tuning.js';

/** The handset rises this far off its cradle, the call goes through after this long, and it goes back down after this. */
const LIFT = 0.07;
const RING_SECONDS = 1.0;
const HANG_UP_SECONDS = 3.0;
const SPEECH_SECONDS = 4;

/** How the office corner (src/office-system.ts) picks up the phone when it is pointed at. */
export const phoneApi = {
  /** True while the phone can be pointed at: to call (the morning, before the order), or to end the order (full). */
  ready: (): boolean => false,
  call: (): void => undefined,
};

/**
 * The telephone in the office corner, and the fish shop. It is out of reach
 * from the seat: point at it and pinch (src/office-system.ts), and the
 * handset comes up off its cradle. On the easy difficulty the shop brings
 * the usual ("omakase"). On the full difficulty the handset stays up while
 * the chef orders from the case (src/fish-order-system.ts); a point at the
 * phone again ends the call. A while later the delivery, the styrofoam ice
 * box of wrapped fish, is on the counter (src/prep-cut-system.ts).
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
    phoneApi.ready = () => !!this.handset && prep.active && !prep.ordered && (this.lifted < 0 || fishOrder.ordering);
    phoneApi.call = () => {
      if (!phoneApi.ready()) return;
      if (fishOrder.ordering) this.endOrder();
      else this.lifted = 0;
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
      // Held to the ear while the order is taken.
      if (fishOrder.ordering) this.lifted = Math.min(this.lifted, RING_SECONDS + 0.3);
      const up = Math.min(1, this.lifted / 0.3, Math.max(0, (HANG_UP_SECONDS - this.lifted) / 0.3));
      handset.position.copy(this.home).add(this.tmp.set(0, LIFT * up, -0.02 * up));
      handset.rotation.x = 0.5 * up;
      if (this.lifted >= RING_SECONDS && prep.active && !prep.ordered && !fishOrder.ordering) this.order();
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
    feedback.flash(StationKind.Phone, COLOR_DONE);
    coach.done('callFishShop');
    if (fishOrder.difficulty === 'full') {
      // The chef orders from the case; the call ends with a point at the phone.
      fishOrder.ordering = true;
      fishOrder.lines.clear();
      fishOrder.version++;
      this.say('Fish shop: Morning! What will it be?', stations.get(StationKind.Phone)!.pos, 0.3);
      console.log('[Phone] called the fish shop: taking the order');
      return;
    }
    prep.ordered = true;
    this.deliverIn = DELIVERY_SECONDS;
    this.say('Fish shop: Morning! The usual? Right away.', stations.get(StationKind.Phone)!.pos, 0.3);
    console.log('[Phone] called the fish shop: omakase');
  }

  /** The order is given (full): the shop repeats it, the handset goes down, the delivery is on its way. */
  private endOrder(): void {
    fishOrder.ordering = false;
    prep.ordered = true;
    this.deliverIn = DELIVERY_SECONDS;
    this.lifted = Math.max(this.lifted, HANG_UP_SECONDS - 0.6);
    const n = fishOrder.lines.size;
    let words = n ? `Fish shop: ${n} item${n > 1 ? 's' : ''}, ${yen(orderTotal())}. Right away!` : 'Fish shop: Nothing today? All right.';
    if (fishOrder.lines.has('Kohada')) {
      pickKohadaSize();
      words += ['', ' The kohada are small today.', ' The kohada are on the large side.'][fishOrder.kohadaSize === 0 ? 0 : fishOrder.kohadaSize < 0 ? 1 : 2];
    }
    this.say(words, stations.get(StationKind.Phone)!.pos, 0.3);
    feedback.flash(StationKind.Phone, COLOR_DONE);
    coach.done('orderFish');
    const list = [...fishOrder.lines].map(([id, at]) => sizesOf(id)[at].name).join(', ');
    console.log(`[Phone] the order: ${list || 'nothing'} (${yen(orderTotal())})`);
  }

  private deliver(): void {
    prep.delivered = true;
    // Nothing ordered (full): nothing comes.
    if (fishOrder.difficulty === 'full' && !fishOrder.lines.size) return;
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
