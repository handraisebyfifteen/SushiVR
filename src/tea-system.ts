import { createSystem, type Group, Vector3 } from '@iwsdk/core';
import { COLOR_HINT, glowObject } from './feedback.js';
import { chef, type Side, tea } from './game-state.js';
import { onHandsChanged, sideX } from './handedness.js';
import { hands } from './hands.js';
import {
  CUSTOMER_COUNTER_FAR_Z,
  CUSTOMER_COUNTER_HEIGHT,
  GETA_Z,
  STEP_HEIGHT,
  TEA_CUP_X,
  TEA_CUP_Z,
  TEA_SERVE_X,
  TSUKEDAI_CHEF_Z,
  TSUKEDAI_CUSTOMER_Z,
  TSUKEDAI_TOP,
  WORK_COUNTER_TOP,
} from './layout.js';
import { ledger } from './ledger.js';
import { createYunomi } from './scene-assets/tea-station.scene-asset.js';
import { Held } from './sushi-components.js';
import { TEA_MINUTES, TEA_POUR_SECONDS } from './tuning.js';

/** A pinch this close to the cup's middle takes it. */
const TAKE_RADIUS = 0.08;
/** Where the hand holds the cup, above its foot. */
const HOLD_Y = 0.06;
/** Let go over the tsukedai (its whole depth, the neta case too), not too high: the cup goes before the customer. */
const SERVE_HALF_X = 0.7;
const SERVE_MAX_Y = TSUKEDAI_TOP + 0.5;
const GLOW_SECONDS = 1.5;

/** The office corner calls these (the urn pointed at) and the part-timer (src/staff-system.ts). */
export const teaApi = {
  /** The chef pinched pointing at the urn: a cup is poured, then set down at hand. */
  pour: (): void => undefined,
  /** The part-timer, who poured one at the office (tea.cup 'partTimer' meanwhile), comes out with it (tea.cupAt follows their hand). */
  partTimerTakes: (): void => undefined,
  /** The part-timer has set it on the customer counter before the customer. */
  partTimerPlaces: (): void => undefined,
};

/**
 * The customer's tea (お茶). Made out of sight at the office corner's urn:
 *  - by the chef: point at the urn and pinch; after a moment the cup is at
 *    hand on the stainless strip right of the board. Pinch it, carry it over
 *    the case and let go above the tsukedai: it stands before the customer;
 *  - by the part-timer, when called in: poured at the office, brought out
 *    through the passage and set on the customer counter (paid by the cup,
 *    src/ledger.ts).
 * Customers ask for tea now and then (src/customer-system.ts); the cup goes
 * when they leave. One cup is reused, so nothing is made per serving.
 */
export class TeaSystem extends createSystem({}) {
  private cup!: Group;
  private pourLeft = 0;
  private side: Side | null = null;
  private glowLeft = 0;
  private readonly offset = new Vector3();
  /** Past the cloth, on the knife hand's side (src/handedness.ts). */
  private readonly handSpot = new Vector3(sideX(TEA_CUP_X), WORK_COUNTER_TOP, TEA_CUP_Z);
  private readonly counterSpot = new Vector3(TEA_SERVE_X, -STEP_HEIGHT + CUSTOMER_COUNTER_HEIGHT, CUSTOMER_COUNTER_FAR_Z + 0.12);
  private readonly mid = new Vector3();
  private urnFound = false;

  init(): void {
    this.cup = createYunomi(true);
    this.cup.name = 'TeaCup';
    this.cup.visible = false;
    this.world.createTransformEntity(this.cup);
    tea.cupAt.copy(this.handSpot);
    tea.serveAt.set(TEA_SERVE_X, TSUKEDAI_TOP, GETA_Z);
    this.cleanupFuncs.push(
      onHandsChanged(() => {
        this.handSpot.x = sideX(TEA_CUP_X);
        if (tea.cup === 'none') tea.cupAt.copy(this.handSpot);
      }),
    );
    teaApi.pour = () => {
      if (tea.cup !== 'none') return;
      tea.cup = 'pouring';
      this.pourLeft = TEA_POUR_SECONDS;
      console.log('[Tea] the chef pours a cup at the urn');
    };
    teaApi.partTimerTakes = () => {
      tea.cup = 'partTimer';
      this.cup.visible = true;
      console.log('[Tea] the part-timer brings a cup out');
    };
    teaApi.partTimerPlaces = () => {
      if (tea.cup !== 'partTimer') return;
      this.cup.position.copy(this.counterSpot);
      this.served();
      ledger.wage('partTimer', 'tea', TEA_MINUTES);
    };
  }

  update(delta: number): void {
    if (!this.urnFound) this.findUrn();
    if (tea.clear) {
      this.reset();
      tea.clear = false;
    }
    if (this.glowLeft > 0) {
      this.glowLeft -= delta;
      if (this.glowLeft <= 0 && tea.cup === 'atHand') glowObject(this.cup, null);
    }
    switch (tea.cup) {
      case 'pouring':
        this.pourLeft -= delta;
        if (this.pourLeft <= 0) {
          // Poured out of sight: the cup is set down at hand.
          tea.cup = 'atHand';
          this.cup.position.copy(this.handSpot);
          this.cup.visible = true;
          tea.cupAt.copy(this.handSpot);
          glowObject(this.cup, COLOR_HINT);
          this.glowLeft = GLOW_SECONDS;
          console.log('[Tea] the cup is at hand');
        }
        break;
      case 'atHand':
        this.updateTake();
        break;
      case 'held':
        this.updateHeld();
        break;
      case 'partTimer':
        this.cup.position.copy(tea.cupAt);
        break;
    }
  }

  /** A free hand pinches the cup at hand. */
  private updateTake(): void {
    this.mid.copy(this.cup.position).setY(this.cup.position.y + HOLD_Y);
    for (const side of [chef.riceSide, chef.netaSide] as Side[]) {
      const hand = hands.all[side];
      const state = chef.hands[side];
      if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None) continue;
      if (hand.grasp.distanceTo(this.mid) > TAKE_RADIUS) continue;
      state.holding = Held.Tea;
      this.side = side;
      this.offset.copy(this.cup.position).sub(hand.grasp);
      tea.cup = 'held';
      glowObject(this.cup, null);
      this.glowLeft = 0;
      return;
    }
  }

  /** The cup follows the hand; let go above the tsukedai and it is served, anywhere else it goes back to hand. */
  private updateHeld(): void {
    const side = this.side;
    if (side === null) return;
    const hand = hands.all[side];
    this.cup.position.copy(hand.grasp).add(this.offset);
    tea.cupAt.copy(this.cup.position);
    if (hand.tracked && hand.pinch) return;
    chef.hands[side].holding = Held.None;
    this.side = null;
    const p = this.cup.position;
    const over = Math.abs(p.x) < SERVE_HALF_X && p.z > TSUKEDAI_CUSTOMER_Z - 0.05 && p.z < TSUKEDAI_CHEF_Z && p.y < SERVE_MAX_Y;
    if (over) {
      this.cup.position.copy(tea.serveAt);
      this.served();
      return;
    }
    tea.cup = 'atHand';
    this.cup.position.copy(this.handSpot);
    tea.cupAt.copy(this.handSpot);
  }

  private served(): void {
    tea.cup = 'served';
    tea.justServed = true;
    tea.cupAt.copy(this.cup.position);
    console.log('[Tea] served before the customer');
  }

  /** The customer has gone: the cup is cleared away (or the one never served). */
  private reset(): void {
    if (this.side !== null) chef.hands[this.side].holding = Held.None;
    this.side = null;
    this.cup.visible = false;
    glowObject(this.cup, null);
    tea.cup = 'none';
    tea.wanted = false;
    tea.cupAt.copy(this.handSpot);
  }

  /** The urn comes with the scene: where its lid is, to point at. */
  private findUrn(): void {
    const urn = this.world.scene.getObjectByName('TeaUrn');
    if (!urn) return;
    urn.updateWorldMatrix(true, false);
    urn.getWorldPosition(tea.urnAt);
    tea.urnAt.y += 0.25;
    this.urnFound = true;
  }
}
