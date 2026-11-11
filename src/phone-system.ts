import { createSystem, type Object3D, type Sprite, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { COLOR_DONE, feedback } from './feedback.js';
import { prep, staff } from './game-state.js';
import { stations } from './station-system.js';
import { StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { fishOrder, fundsNow, orderNames, orderTotal, pickKohadaSize, startOrder, type Supplier } from './fish-order.js';
import { yen } from './ledger.js';
import { DELIVERY_SECONDS } from './tuning.js';

/** The handset rises this far off its cradle, the call goes through after this long, and it goes back down after this. */
const LIFT = 0.07;
const RING_SECONDS = 1.0;
const HANG_UP_SECONDS = 3.0;
const SPEECH_SECONDS = 4;

/** How the office corner (src/office-system.ts) and the phone book (src/phone-book-system.ts) use the phone. */
export const phoneApi = {
  /** True while the phone can be pointed at (any time; the office corner checks the stool). */
  ready: (): boolean => false,
  /** Pointed at and pinched: the phone book comes up; again, the call ends (full: the order is given). */
  call: (): void => undefined,
  /** The phone book is open, the handset up. */
  book: false,
  /** This shop can be called now: the morning, before its order (the greengrocer on the full difficulty). */
  canDial: (_who: Supplier): boolean => false,
  dial: (_who: Supplier): void => undefined,
  hangUp: (): void => undefined,
};

/**
 * The telephone in the office corner, and the fish shop. It is out of reach
 * from the seat: point at it and pinch (src/office-system.ts), and the
 * handset comes up off its cradle with the phone book (src/phone-book-system.ts);
 * the fish shop is one of its lines. On the easy difficulty the shop brings
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
  /** A shop's number is ringing (seconds since it was dialled). */
  private dialing: Supplier | null = null;
  private ring = 0;
  private deliverIn = 0;
  private greensIn = 0;
  private speech!: Sprite;
  private speechTime = 0;
  private readonly tmp = new Vector3();

  init(): void {
    this.speech = makeTextSprite(' ', { width: 0.42 });
    this.speech.name = 'PhoneSpeech';
    this.speech.visible = false;
    this.world.createTransformEntity(this.speech);
    phoneApi.ready = () => !!this.handset && this.dialing === null;
    phoneApi.call = () => {
      if (!phoneApi.ready()) return;
      if (fishOrder.ordering) this.endOrder();
      else if (phoneApi.book) phoneApi.hangUp();
      else {
        phoneApi.book = true;
        this.lifted = Math.min(Math.max(this.lifted, 0), 0.3);
      }
    };
    phoneApi.canDial = (who) => {
      if (!this.handset || !prep.active || fishOrder.ordering || this.dialing !== null) return false;
      // On easy the greengrocer's things come as usual each morning: no call.
      return who === 'fish' ? !prep.ordered : fishOrder.difficulty === 'full' && !fishOrder.greensOrdered;
    };
    phoneApi.dial = (who) => {
      if (!phoneApi.canDial(who)) return;
      phoneApi.book = false;
      this.dialing = who;
      this.ring = 0;
    };
    phoneApi.hangUp = () => {
      phoneApi.book = false;
      if (this.lifted >= 0 && this.dialing === null && !fishOrder.ordering) this.lifted = Math.max(this.lifted, HANG_UP_SECONDS - 0.6);
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
      if (this.dialing !== null) {
        this.ring += delta;
        if (this.ring >= RING_SECONDS) {
          const who = this.dialing;
          this.dialing = null;
          if (who === 'fish') this.order();
          else this.orderGreens();
        }
      }
      // Held to the ear while the book is open, the number rings, or the order is taken.
      if (phoneApi.book || this.dialing !== null || fishOrder.ordering) this.lifted = Math.min(this.lifted, RING_SECONDS + 0.3);
      const up = Math.min(1, this.lifted / 0.3, Math.max(0, (HANG_UP_SECONDS - this.lifted) / 0.3));
      handset.position.copy(this.home).add(this.tmp.set(0, LIFT * up, -0.02 * up));
      handset.rotation.x = 0.5 * up;
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
    if (fishOrder.greensOrdered && !fishOrder.greensDelivered) {
      this.greensIn -= delta;
      if (this.greensIn <= 0) this.deliverGreens();
    }
  }

  private order(): void {
    feedback.flash(StationKind.Phone, COLOR_DONE);
    coach.done('callFishShop');
    if (fishOrder.difficulty === 'full') {
      // The chef orders from the case; the call ends with a point at the phone.
      fishOrder.ordering = true;
      startOrder('fish');
      this.say('Fish shop: Morning! What will it be?', stations.get(StationKind.Phone)!.pos, 0.3);
      console.log(`[Phone] called the fish shop: taking the order (funds ${yen(fundsNow())})`);
      return;
    }
    prep.ordered = true;
    this.deliverIn = DELIVERY_SECONDS;
    this.say('Fish shop: Morning! The usual? Right away.', stations.get(StationKind.Phone)!.pos, 0.3);
    console.log('[Phone] called the fish shop: omakase');
  }

  /** The greengrocer (full): the chef orders the garnishes and pickles from the case, as with the fish shop. */
  private orderGreens(): void {
    feedback.flash(StationKind.Phone, COLOR_DONE);
    fishOrder.ordering = true;
    startOrder('greengrocer');
    this.say('Greengrocer: Morning! What do you need?', stations.get(StationKind.Phone)!.pos, 0.3);
    console.log(`[Phone] called the greengrocer: taking the order (funds ${yen(fundsNow())})`);
  }

  /** The order is given (full): the shop repeats it, the handset goes down, the delivery is on its way. */
  private endOrder(): void {
    fishOrder.ordering = false;
    this.lifted = Math.max(this.lifted, HANG_UP_SECONDS - 0.6);
    if (fishOrder.calling === 'greengrocer') {
      fishOrder.greensOrdered = true;
      this.greensIn = DELIVERY_SECONDS;
      const names = orderNames('greengrocer');
      const n = names.length;
      this.say(n ? `Greengrocer: ${n} item${n > 1 ? 's' : ''}, ${yen(orderTotal('greengrocer'))}. Right away!` : 'Greengrocer: Nothing today? All right.', stations.get(StationKind.Phone)!.pos, 0.3);
      feedback.flash(StationKind.Phone, COLOR_DONE);
      console.log(`[Phone] the greengrocer's order: ${names.join(', ') || 'nothing'} (${yen(orderTotal('greengrocer'))})`);
      return;
    }
    prep.ordered = true;
    this.deliverIn = DELIVERY_SECONDS;
    const n = orderNames('fish').length;
    let words = n ? `Fish shop: ${n} item${n > 1 ? 's' : ''}, ${yen(orderTotal('fish'))}. Right away!` : 'Fish shop: Nothing today? All right.';
    if (fishOrder.lines.has('Kohada')) {
      pickKohadaSize();
      words += ['', ' The kohada are small today.', ' The kohada are on the large side.'][fishOrder.kohadaSize === 0 ? 0 : fishOrder.kohadaSize < 0 ? 1 : 2];
    }
    this.say(words, stations.get(StationKind.Phone)!.pos, 0.3);
    feedback.flash(StationKind.Phone, COLOR_DONE);
    coach.done('orderFish');
    console.log(`[Phone] the order: ${orderNames('fish').join(', ') || 'nothing'} (${yen(orderTotal('fish'))})`);
  }

  private deliver(): void {
    prep.delivered = true;
    // Nothing ordered (full): nothing comes.
    if (fishOrder.difficulty === 'full' && !orderNames('fish').length) return;
    const box = stations.get(StationKind.IceBox);
    if (box) this.say('Delivery! On the counter.', box.pos, 0.28);
    console.log('[Phone] the delivery has come');
  }

  /** The greengrocer's things come (full): straight into the case (src/fish-order-system.ts), billed. */
  private deliverGreens(): void {
    fishOrder.greensDelivered = true;
    if (!orderNames('greengrocer').length) return;
    const board = stations.get(StationKind.CuttingBoard);
    if (board) this.say("Greengrocer's here! In the case.", board.pos, 0.35);
    console.log("[Phone] the greengrocer's delivery has come");
  }

  private say(text: string, at: Vector3, lift: number): void {
    setSpriteText(this.speech, text);
    this.speech.position.copy(at).add(this.tmp.set(0, lift, 0));
    this.speech.visible = true;
    this.speechTime = SPEECH_SECONDS;
  }
}
