import { createSystem, type Object3D, type Sprite, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { COLOR_DONE, feedback } from './feedback.js';
import { chef, prep, type Side } from './game-state.js';
import { hands } from './hands.js';
import { stations } from './station-system.js';
import { Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { DELIVERY_SECONDS, DIFFICULTY } from './tuning.js';

/** The handset counts as lifted this far above its cradle, and the call goes through after this long. */
const LIFTED = 0.05;
const RING_SECONDS = 1.0;
const SPEECH_SECONDS = 4;

/**
 * The telephone on the sink's left end, and the fish shop. Lift the handset
 * (pinch it and raise it) to call; on the easy difficulty the shop brings
 * what is missing on its own ("omakase"). A while later the delivery, the
 * styrofoam ice box of wrapped fish, is on the counter (src/prep-cut-system.ts).
 * Ordering by checking the case stock is the full difficulty's (later).
 */
export class PhoneSystem extends createSystem({}) {
  private handset: Object3D | null = null;
  private readonly home = new Vector3();
  private held: Side | null = null;
  private ringing = 0;
  private deliverIn = 0;
  private speech!: Sprite;
  private speechTime = 0;
  private readonly tmp = new Vector3();

  init(): void {
    this.speech = makeTextSprite(' ', { width: 0.42 });
    this.speech.name = 'PhoneSpeech';
    this.speech.visible = false;
    this.world.createTransformEntity(this.speech);
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
    const parent = phone.entity.object3D!;
    if (this.held === null) {
      for (const side of [chef.netaSide, chef.riceSide] as Side[]) {
        const hand = hands.all[side];
        if (!hand.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None) continue;
        handset.getWorldPosition(this.tmp);
        if (hand.grasp.distanceTo(this.tmp) > 0.11) continue;
        this.held = side;
        chef.hands[side].holding = Held.Phone;
        this.ringing = 0;
        break;
      }
    }
    if (this.held !== null) {
      const hand = hands.all[this.held];
      if (hand.tracked) parent.worldToLocal(handset.position.copy(hand.grasp));
      if (handset.position.y - this.home.y > LIFTED) this.ringing += delta;
      if (this.ringing >= RING_SECONDS && prep.active && !prep.ordered) this.order();
      if (!hand.tracked || hand.pinchEnd) {
        chef.hands[this.held].holding = Held.None;
        this.held = null;
        handset.position.copy(this.home);
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
