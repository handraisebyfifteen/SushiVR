import { Color, createSystem, type Entity, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { progress } from './game-state.js';
import { chef, prep, prepCleaned, type Side } from './game-state.js';
import { hands, RubTracker } from './hands.js';
import { overStation, stations } from './station-system.js';
import { Bar, Chef, Held, StationKind } from './sushi-components.js';
import { TurnSystem } from './turn-system.js';
import {
  PIECES_PER_WASH,
  RUB_WASH_CLOTH,
  RUB_WASH_HANDS,
  RUB_WIPE_BOARD,
} from './tuning.js';

const COLOR_UNWASHED = new Color('#8C8C8C');
const COLOR_TOWEL = new Color('#F2D35B');
const COLOR_WET = new Color('#5FB8FF');
const HAND_FIELDS = [
  ['leftDirt', 'leftNeedsWash', 'leftNeedsTowel', 'leftWet', 'leftHolding'],
  ['rightDirt', 'rightNeedsWash', 'rightNeedsTowel', 'rightWet', 'rightHolding'],
] as const;

/**
 * Hand and board hygiene.
 *  - Opening: soap, then rub both hands under the faucet, then grip the
 *    towel hanging under the sink with both hands (two fists) to dry them.
 *    Service starts when both hands are dry.
 *  - During service: water only (soap now taints the food), towel after.
 *  - Dirt builds up with every piece; at 1.0 the hand needs washing.
 *  - The wet cloth wipes the board clean (the cloth gets dirty) and is
 *    washed in the sink, which washes the hands along with it.
 * Small rings under each palm show grey (needs washing), yellow (needs the
 * towel) or blue (wet from tezu); no ring means clean and dry.
 */
export class HygieneSystem extends createSystem({}) {
  private chefEntity!: Entity;
  private handRings!: [Mesh<RingGeometry, MeshBasicMaterial>, Mesh<RingGeometry, MeshBasicMaterial>];
  // Washing in the basin counts only the rubbing (horizontal) travel.
  private washRub = [new RubTracker(true), new RubTracker(true)];
  private clothRub = new RubTracker(true);
  /** One wash (or rinse) per visit: re-armed once the hands (or the cloth) leave the sink. */
  private washArmed = true;
  private rinseArmed = true;
  private boardRub = new RubTracker();
  private clothHome = new Vector3();
  private clothHomeSet = false;
  private clothSide: Side | null = null;
  private readonly tmp = new Vector3();
  /** Progress 0..1 of the rub in progress, for a bar in the debug panel. */
  rubProgress = 0;

  init(): void {
    this.chefEntity = this.world.createTransformEntity();
    this.chefEntity.object3D!.name = 'Chef';
    this.chefEntity.addComponent(Chef, {});

    const makeRing = (name: string) => {
      const ring = new Mesh(
        new RingGeometry(0.028, 0.038, 24),
        new MeshBasicMaterial({ color: COLOR_UNWASHED, transparent: true, opacity: 0.85 }),
      );
      ring.name = name;
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.world.createTransformEntity(ring);
      return ring;
    };
    this.handRings = [makeRing('HandRing_left'), makeRing('HandRing_right')];
  }

  update(): void {
    const [L, R] = hands.all;
    this.rubProgress = 0;
    const cloth = stations.get(StationKind.WetCloth);
    if (cloth && !this.clothHomeSet) {
      cloth.entity.object3D!.getWorldPosition(this.clothHome);
      this.clothHomeSet = true;
    }

    // --- soap: a pinch or fist on the pump ---
    for (let i = 0; i < 2; i++) {
      const hand = hands.all[i];
      if (!hand.tracked || chef.hands[i].holding !== Held.None) continue;
      if ((hand.pinchStart || hand.fistStart) && overStation(hand.palm, StationKind.Soap)) {
        chef.soaped = true;
        if (chef.open) {
          chef.soapDuringService = true;
          feedback.flash(StationKind.Soap, COLOR_WARN);
          coach.mistake('soapInService', StationKind.Soap);
          console.log('[Hygiene] soap during service: the food will smell of it');
        } else {
          feedback.flash(StationKind.Soap, COLOR_DONE);
          coach.done('soap');
          console.log('[Hygiene] soap on');
        }
      }
    }

    // --- washing hands: both palms under the faucet, rubbing ---
    const bothFree = chef.hands[0].holding === Held.None && chef.hands[1].holding === Held.None;
    const bothInSink =
      bothFree && L.tracked && R.tracked &&
      overStation(L.palm, StationKind.Sink) && overStation(R.palm, StationKind.Sink);
    if (!bothInSink) this.washArmed = true;
    const counting = bothInSink && this.washArmed;
    const rub = this.washRub[0].update(L.palm, counting) + this.washRub[1].update(R.palm, counting);
    if (counting) {
      this.rubProgress = Math.min(1, rub / RUB_WASH_HANDS);
      if (rub >= RUB_WASH_HANDS) {
        if (!chef.open && !chef.soaped) {
          feedback.flash(StationKind.Soap, COLOR_WARN); // opening wash needs soap first
          coach.mistake('needSoap', StationKind.Soap);
          console.log('[Hygiene] opening wash needs soap');
        } else {
          this.washed();
          coach.done('washHands');
          feedback.flash(StationKind.Sink, COLOR_DONE);
        }
        this.washArmed = false;
        this.washRub[0].reset();
        this.washRub[1].reset();
      }
    }

    // --- wet cloth: pick up, wipe the board, wash it in the sink ---
    this.updateCloth();

    // --- towel: grip it with both hands (two fists) to dry them ---
    let onTowelBoth = true;
    let gripping = true;
    for (let i = 0; i < 2; i++) {
      const hand = hands.all[i];
      const state = chef.hands[i];
      const onTowel = hand.tracked && state.holding === Held.None && overStation(hand.palm, StationKind.Towel);
      if (onTowel && state.needsWash && hand.fistStart) {
        feedback.flash(StationKind.Towel, COLOR_WARN); // wash first
        coach.mistake('washFirst', StationKind.Towel);
      }
      onTowelBoth &&= onTowel;
      gripping &&= hand.fist;
    }
    const needsTowel = chef.hands[0].needsTowel || chef.hands[1].needsTowel;
    if (onTowelBoth && gripping && needsTowel && !chef.hands[0].needsWash && !chef.hands[1].needsWash) {
      for (const h of chef.hands) {
        h.needsTowel = false;
        h.wet = false;
      }
      feedback.flash(StationKind.Towel, COLOR_DONE);
      coach.done('towel');
      console.log('[Hygiene] hands dried');
      if (!chef.open && prep.active) {
        // After the prep and the cleaning, this is the opening wash: the noren may go out.
        if (prepCleaned()) {
          prep.washedAfter = true;
          console.log('[Hygiene] hands clean for opening: hang the noren');
        } else {
          console.log('[Hygiene] hands dried; the prep goes on');
        }
      } else if (!chef.open) {
        chef.open = true;
        console.log('[Hygiene] bar is open');
      }
    }

    // --- hints ---
    if (chef.hands[0].needsWash || chef.hands[1].needsWash || chef.clothDirty) {
      feedback.hints.add(StationKind.Sink);
      if (!chef.open && !chef.soaped) feedback.hints.add(StationKind.Soap);
    }
    if (chef.hands[0].needsTowel || chef.hands[1].needsTowel) feedback.hints.add(StationKind.Towel);
    if (chef.boardDirt >= 1) feedback.hints.add(StationKind.WetCloth);

    progress.clothHeld = this.clothSide !== null;
    this.updateRings();
    this.sync();
  }

  private washed(): void {
    for (const h of chef.hands) {
      h.dirt = 0;
      h.needsWash = false;
      h.needsTowel = true;
      h.wet = false;
    }
    chef.soaped = false;
    console.log('[Hygiene] hands washed');
  }

  private updateCloth(): void {
    const info = stations.get(StationKind.WetCloth);
    if (!info) return;
    const clothObject = info.entity.object3D!;
    if (this.clothSide === null) {
      for (let i = 0; i < 2; i++) {
        const hand = hands.all[i];
        if (!hand.tracked || chef.hands[i].holding !== Held.None) continue;
        if (hand.pinchStart && overStation(hand.grasp, StationKind.WetCloth)) {
          this.clothSide = i as Side;
          chef.hands[i].holding = Held.Cloth;
          coach.done('takeCloth');
          console.log('[Hygiene] cloth picked up');
        }
      }
      return;
    }
    const side = this.clothSide;
    const hand = hands.all[side];
    if (hand.tracked) clothObject.position.copy(hand.grasp);
    this.tmp.copy(hand.grasp);

    // Wipe the board: the cloth travels over it.
    const board = stations.get(StationKind.CuttingBoard);
    const onBoard = !!board && overStation(this.tmp, StationKind.CuttingBoard) && this.tmp.y < board.pos.y + 0.08;
    const wiped = this.boardRub.update(this.tmp, onBoard);
    if (onBoard && chef.boardDirt > 0) this.rubProgress = Math.min(1, wiped / RUB_WIPE_BOARD);
    if (wiped >= RUB_WIPE_BOARD && chef.boardDirt > 0) {
      chef.boardDirt = 0;
      chef.clothDirty = true;
      this.boardRub.reset();
      feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
      coach.done('wipeBoard');
      console.log('[Hygiene] board wiped; the cloth is dirty now');
    }

    // Wash the cloth under the faucet: hands get washed along with it.
    const inSink = overStation(this.tmp, StationKind.Sink);
    if (!inSink) this.rinseArmed = true;
    const washed = this.clothRub.update(this.tmp, inSink && this.rinseArmed);
    if (inSink && this.rinseArmed) this.rubProgress = Math.min(1, washed / RUB_WASH_CLOTH);
    if (washed >= RUB_WASH_CLOTH) {
      this.rinseArmed = false;
      chef.clothDirty = false;
      this.washed();
      this.clothRub.reset();
      feedback.flash(StationKind.Sink, COLOR_DONE);
      coach.done('rinseCloth');
      console.log('[Hygiene] cloth washed');
    }

    if (hand.pinchEnd || !hand.tracked) {
      // Put down: the cloth goes back to its place beside the knife.
      clothObject.position.copy(this.clothHome);
      chef.hands[side].holding = Held.None;
      this.clothSide = null;
      this.boardRub.reset();
      this.clothRub.reset();
    }
  }

  private updateRings(): void {
    for (let i = 0; i < 2; i++) {
      const hand = hands.all[i];
      const ring = this.handRings[i];
      const state = chef.hands[i];
      const color = state.needsWash ? COLOR_UNWASHED : state.needsTowel ? COLOR_TOWEL : state.wet ? COLOR_WET : null;
      if (!hand.tracked || !color) {
        ring.visible = false;
        continue;
      }
      ring.visible = true;
      ring.position.copy(hand.palm);
      ring.position.y -= 0.015;
      ring.material.color.copy(color);
    }
  }

  private sync(): void {
    const e = this.chefEntity;
    for (let i = 0; i < 2; i++) {
      const h = chef.hands[i];
      const f = HAND_FIELDS[i];
      e.setValue(Chef, f[0], h.dirt);
      e.setValue(Chef, f[1], h.needsWash);
      e.setValue(Chef, f[2], h.needsTowel);
      e.setValue(Chef, f[3], h.wet);
      e.setValue(Chef, f[4], h.holding);
    }
    e.setValue(Chef, 'soaped', chef.soaped);
    e.setValue(Chef, 'soapDuringService', chef.soapDuringService);
    e.setValue(Chef, 'knifeUnwiped', chef.knifeUnwiped);
    e.setValue(Chef, 'boardDirt', chef.boardDirt);
    e.setValue(Chef, 'clothDirty', chef.clothDirty);
    e.setValue(Chef, 'knifeDirty', chef.knifeDirty);
    const bar = this.world.getSystem(TurnSystem)?.barEntity;
    if (bar && bar.getValue(Bar, 'open') !== chef.open) bar.setValue(Bar, 'open', chef.open);
  }
}

/** Called when a piece is served: rice and fish oils build up on both hands. */
export function addPieceDirt(): void {
  for (const h of chef.hands) {
    h.dirt = Math.min(1, h.dirt + 1 / PIECES_PER_WASH);
    if (h.dirt >= 1) h.needsWash = true;
  }
}
