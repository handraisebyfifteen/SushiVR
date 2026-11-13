import { createSystem, type Object3D, type Sprite, Vector3 } from '@iwsdk/core';
import { coach, type Grade } from './coach.js';
import { display } from './display-settings.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { chef, prawn, service, type Side } from './game-state.js';
import { onHandsChanged, sideX } from './handedness.js';
import { hands } from './hands.js';
import { ICE_BOX_X, ICE_BOX_Z, WORK_COUNTER_TOP } from './layout.js';
import { pieceApi } from './piece-system.js';
import { createPrawnPot, createPrawnSkewer, createWholePrawn, PRAWN_LENGTH, PRAWN_POT_RADIUS, PRAWN_WATER_Y, SKEWER_LENGTH, type WholePrawn } from './scene-assets/lib/prawn-look.js';
import { playDone, playPick, playPut, playTone, playWarn } from './sfx.js';
import { overStation, stations } from './station-system.js';
import { Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { PRAWN_BOIL_BAD, PRAWN_BOIL_GOOD, PRAWN_BOIL_POOR, PRAWN_BOIL_SECONDS, PRAWN_PULL, PRAWN_PUSH } from './tuning.js';

/** The prawn's spot on the board: left of the middle, its tail toward the chef. */
const BOARD_X = -0.1;
const BOARD_Z = 0.01;
/** A pinch this near a part takes it. */
const PICK = 0.06;
const SIDES: readonly Side[] = [0, 1];

/** The kuruma-ebi's work at the board in service, before it is a topping (src/prawn-system.ts). */
export const prawnApi = {
  /** A prawn is being worked: no other can be taken. */
  busy: (): boolean => false,
  /** A live prawn from the case, into this hand. */
  take: (_side: Side): void => undefined,
};

/**
 * The kuruma-ebi worked to order (the user's shop): the case holds them
 * live; each order is boiled or raw.
 *  - Boiled: on the board, the bamboo skewer lying in line behind its tail
 *    is pushed in along the belly (pinch its grip end, push it away); taken
 *    by the skewer into the pot that stays on the boil left of the board,
 *    about ten seconds (a Ready sign comes up over the pot); out onto the
 *    board, the skewer drawn out toward the chef, then peeled.
 *  - Raw: on the board, peeled as it is.
 * Peeling: the neta hand holds the body, the rice hand pinches the head and
 * pulls it off with the shell (the tail fan stays on); then a pinch with
 * the neta hand takes it onto the fingers as the nigiri's topping.
 */
export class PrawnSystem extends createSystem({}) {
  private look!: WholePrawn;
  private skewer!: Object3D;
  private pot!: Object3D;
  private bubbles: Object3D | null = null;
  private ready!: Sprite;
  private label!: Sprite;
  private labelText = '';
  private stage: 'none' | 'held' | 'board' | 'pot' = 'none';
  private skewered = false;
  private cooked = false;
  private peeled = false;
  private carrySide: Side | -1 = -1;
  private readonly carryOffset = new Vector3();
  /** A pinch on the skewer's grip pushing it in or drawing it out, the shell being pulled off. */
  private skewerGrab: { side: Side; from: Vector3; out: boolean } | null = null;
  private holdSide: Side | -1 = -1;
  private peelFrom: Vector3 | null = null;
  private readonly skewerHome = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly pinchAt = new Vector3();
  private wasOpen = false;

  init(): void {
    this.look = createWholePrawn();
    this.look.root.visible = false;
    this.world.createTransformEntity(this.look.root);
    this.skewer = createPrawnSkewer();
    this.skewer.visible = false;
    this.world.createTransformEntity(this.skewer);
    this.pot = createPrawnPot();
    this.pot.visible = false;
    this.bubbles = this.pot.getObjectByName('Bubbles') ?? null;
    this.world.createTransformEntity(this.pot);
    this.ready = makeTextSprite('Ready', { width: 0.09, background: '#2E8B57' });
    this.ready.visible = false;
    this.world.createTransformEntity(this.ready);
    this.label = makeTextSprite(' ', { width: 0.12 });
    this.label.visible = false;
    this.world.createTransformEntity(this.label);
    this.place();
    this.cleanupFuncs.push(onHandsChanged(() => this.place()));
    prawnApi.busy = () => this.stage !== 'none';
    prawnApi.take = (side) => this.take(side);
  }

  /** The pot where the ice box stood in the morning (on the chef's own side), the board spot. */
  private place(): void {
    this.pot.position.set(sideX(ICE_BOX_X), WORK_COUNTER_TOP, ICE_BOX_Z);
    prawn.potAt.copy(this.pot.position).add(this.tmp.set(0, PRAWN_WATER_Y, 0));
    const board = stations.get(StationKind.CuttingBoard);
    if (board) prawn.boardAt.copy(board.pos).add(this.tmp.set(sideX(BOARD_X), 0, BOARD_Z));
  }

  /** A live prawn from the case into the hand: boiled or raw, as the order says. */
  private take(side: Side): void {
    this.stage = 'held';
    this.carrySide = side;
    this.carryOffset.set(0, -0.01, 0);
    this.skewered = this.cooked = this.peeled = false;
    prawn.boil = service.order?.item !== 'RawPrawnNigiri';
    prawn.boilT = 0;
    prawn.lastBoil = null;
    for (const t of this.look.tints) t.material.color.copy(t.raw);
    this.look.shell.visible = true;
    this.look.shell.position.set(0, 0, 0);
    this.look.meat.visible = false;
    this.look.root.visible = true;
    this.skewer.visible = false;
    chef.hands[side].holding = Held.Saku;
    console.log(`[Prawn] a live prawn from the case, to be ${prawn.boil ? 'boiled' : 'served raw'}`);
  }

  update(delta: number): void {
    const open = chef.open;
    if (open !== this.wasOpen) {
      this.wasOpen = open;
      this.pot.visible = open;
      if (!open) this.clear();
    }
    if (!open) return;
    this.place();
    // The pot stays on the boil.
    if (this.bubbles) this.bubbles.position.y = 0.0015 * Math.sin(performance.now() * 0.03);
    if (this.stage === 'held') this.updateCarried();
    else if (this.stage === 'pot') this.updatePot(delta);
    else if (this.stage === 'board') this.updateBoard();
    this.publish();
  }

  /** In a hand: follows it; let go over the board it lies there, over the pot (skewered) it goes in. */
  private updateCarried(): void {
    const side = this.carrySide as Side;
    const hand = hands.all[side];
    if (hand.tracked) this.moveTo(this.tmp.copy(hand.grasp).add(this.carryOffset));
    if (hand.tracked && !hand.pinchEnd) return;
    chef.hands[side].holding = Held.None;
    this.carrySide = -1;
    const g = hand.grasp;
    if (this.skewered && !this.cooked && this.overPot(g)) {
      this.stage = 'pot';
      this.moveTo(this.tmp.copy(prawn.potAt).add(this.tmp2.set(0, -0.008, -0.02)));
      playPut();
      coach.done('prawnPot');
      console.log('[Prawn] into the boiling water: about ten seconds');
      return;
    }
    // Let go over the board, or anywhere else: it lies on its spot on the board (taken, it is worked).
    this.lay();
  }

  private lay(): void {
    this.stage = 'board';
    this.moveTo(prawn.boardAt);
    if (prawn.boil && !this.skewered && !this.cooked) {
      // The skewer lies in line behind the tail, its point touching it.
      this.skewerHome.copy(prawn.boardAt).add(this.tmp.set(0, 0.006, PRAWN_LENGTH / 2 + 0.004));
      this.skewer.position.copy(this.skewerHome);
      this.skewer.visible = true;
    }
    playPut();
    feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
    coach.done('prawnBoard');
    console.log(`[Prawn] on the board${this.cooked ? ', boiled' : ''}`);
  }

  /** Moves the prawn (and its skewer, once in it) to a place. */
  private moveTo(at: Vector3): void {
    const r = this.look.root.position;
    if (this.skewered) this.skewer.position.add(this.tmp2.copy(at).sub(r));
    r.copy(at);
  }

  private overPot(p: Vector3): boolean {
    const c = prawn.potAt;
    return Math.hypot(p.x - c.x, p.z - c.z) < PRAWN_POT_RADIUS + 0.04 && p.y > c.y - 0.02 && p.y < c.y + 0.3;
  }

  /** In the pot: it boils (its colour turns), Ready at about ten seconds; a pinch on the skewer's grip takes it out. */
  private updatePot(delta: number): void {
    const before = prawn.boilT;
    prawn.boilT += delta;
    const k = Math.min(1, prawn.boilT / PRAWN_BOIL_SECONDS);
    for (const t of this.look.tints) t.material.color.copy(t.raw).lerp(t.cooked, k);
    if (before < PRAWN_BOIL_SECONDS && prawn.boilT >= PRAWN_BOIL_SECONDS) {
      playDone();
      console.log('[Prawn] boiled: out now');
    }
    this.ready.visible = prawn.boilT >= PRAWN_BOIL_SECONDS && prawn.boilT < PRAWN_BOIL_SECONDS + PRAWN_BOIL_POOR;
    this.ready.position.copy(prawn.potAt).add(this.tmp.set(0, 0.16, 0));
    this.showLabel(display.status ? `${Math.floor(prawn.boilT)} s` : '');
    for (const side of SIDES) {
      const hand = hands.all[side];
      if (!hand.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None) continue;
      const at = hand.pinchPoint(this.pinchAt);
      if (at.distanceTo(this.gripOf(this.tmp)) > PICK && !this.overPot(at)) continue;
      this.cooked = true;
      prawn.lastBoil = this.boilGrade();
      this.ready.visible = false;
      this.showLabel('');
      this.stage = 'held';
      this.carrySide = side;
      this.carryOffset.copy(this.look.root.position).sub(hand.grasp);
      chef.hands[side].holding = Held.Saku;
      playPick();
      coach.done('prawnOut');
      console.log(`[Prawn] out of the pot after ${prawn.boilT.toFixed(1)} s: ${prawn.lastBoil}`);
      return;
    }
  }

  /** About ten seconds (the user's shop): short of it the middle is raw, past it the prawn toughens. */
  private boilGrade(): Grade {
    const off = Math.abs(prawn.boilT - PRAWN_BOIL_SECONDS);
    return off <= PRAWN_BOIL_GOOD / 2 ? 'Excellent' : off <= PRAWN_BOIL_GOOD ? 'Good' : off <= PRAWN_BOIL_BAD ? 'Poor' : 'Bad';
  }

  private showLabel(text: string): void {
    this.label.visible = text !== '';
    this.label.position.copy(prawn.potAt).add(this.tmp2.set(0, 0.24, 0));
    if (text === this.labelText) return;
    this.labelText = text;
    if (text) setSpriteText(this.label, text);
  }

  /** The skewer's grip end (world). */
  private gripOf(out: Vector3): Vector3 {
    return out.copy(this.skewer.position).add(this.tmp2.set(0, 0, SKEWER_LENGTH - 0.009));
  }

  /** On the board: the skewer in or out, the shell off, then onto the fingers. */
  private updateBoard(): void {
    const g = this.skewerGrab;
    if (g) return this.updateSkewer(g);
    if (this.holdSide !== -1) return this.updatePeel();
    for (const side of SIDES) {
      const hand = hands.all[side];
      if (!hand.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None) continue;
      const at = hand.pinchPoint(this.pinchAt);
      const onGrip = this.skewer.visible && at.distanceTo(this.gripOf(this.tmp)) < PICK;
      const onBody = at.distanceTo(prawn.at) < PICK;
      if (chef.hands[side].needsWash && (onGrip || onBody)) {
        feedback.flash(StationKind.CuttingBoard, COLOR_WARN);
        coach.mistake('washFirst', StationKind.CuttingBoard);
        console.log('[Prawn] wash your hands before touching the prawn');
        return;
      }
      if (prawn.boil && !this.cooked && !this.skewered && onGrip) {
        this.skewerGrab = { side, from: hand.grasp.clone(), out: false };
        return;
      }
      if (prawn.boil && this.skewered && !this.cooked && (onGrip || onBody)) {
        // Taken by the skewer, to the pot.
        this.stage = 'held';
        this.carrySide = side;
        this.carryOffset.copy(this.look.root.position).sub(hand.grasp);
        chef.hands[side].holding = Held.Saku;
        playPick();
        return;
      }
      if (this.cooked && this.skewered && onGrip) {
        this.skewerGrab = { side, from: hand.grasp.clone(), out: true };
        return;
      }
      if (this.peeled && onBody && side === chef.netaSide) return this.toFingers();
      // Peeling: the neta hand holds the body (the rice hand then pulls the head off).
      if (!this.peeled && !this.skewered && (this.cooked || !prawn.boil) && onBody && side === chef.netaSide) {
        this.holdSide = side;
        return;
      }
    }
  }

  /** The skewer's grip in the fingers: pushed away along the belly it goes in; drawn back toward the chef it comes out. */
  private updateSkewer(g: { side: Side; from: Vector3; out: boolean }): void {
    const hand = hands.all[g.side];
    const travel = g.out ? hand.grasp.z - g.from.z : g.from.z - hand.grasp.z;
    const base = g.out ? prawn.at.z - PRAWN_LENGTH / 2 - 0.004 : this.skewerHome.z;
    // It slides along its own line, in or out.
    const along = Math.max(0, Math.min(g.out ? PRAWN_PULL + 0.04 : PRAWN_PUSH, travel));
    this.skewer.position.z = g.out ? base + along : base - along;
    if (!g.out && along >= PRAWN_PUSH) {
      this.skewerGrab = null;
      this.skewered = true;
      this.skewer.position.z = this.skewerHome.z - PRAWN_PUSH;
      playTone(880, 0.05, 0.05);
      coach.done('skewerPrawn');
      console.log('[Prawn] skewered along the belly: it stays straight in the water');
      return;
    }
    if (g.out && along >= PRAWN_PULL) {
      this.skewerGrab = null;
      this.skewered = false;
      this.skewer.visible = false;
      playPut();
      coach.done('prawnUnskewer');
      console.log('[Prawn] the skewer out');
      return;
    }
    if (hand.tracked && !hand.pinchEnd) return;
    // Let go short of it: back where it was.
    this.skewerGrab = null;
    this.skewer.position.z = base;
  }

  /** The neta hand holds the body; the rice hand pinches the head and pulls it away with the shell. */
  private updatePeel(): void {
    const hold = hands.all[this.holdSide as Side];
    const pull = hands.all[chef.riceSide];
    if (!hold.tracked || !hold.pinch) {
      this.holdSide = -1;
      this.peelFrom = null;
      this.look.shell.position.set(0, 0, 0);
      return;
    }
    if (!this.peelFrom) {
      if (pull.tracked && pull.pinchStart && chef.hands[chef.riceSide].holding === Held.None && pull.pinchPoint(this.pinchAt).distanceTo(prawn.headAt) < PICK) {
        this.peelFrom = pull.grasp.clone();
      }
      return;
    }
    if (!pull.pinch || !pull.tracked) {
      this.peelFrom = null;
      this.look.shell.position.set(0, 0, 0);
      return;
    }
    const moved = this.tmp.copy(pull.grasp).sub(this.peelFrom);
    this.look.shell.position.copy(moved);
    if (moved.length() < PRAWN_PULL) return;
    this.peelFrom = null;
    this.holdSide = -1;
    this.peeled = true;
    this.look.shell.visible = false;
    this.look.shell.position.set(0, 0, 0);
    this.look.meat.visible = true;
    playPick();
    coach.done('peelPrawn');
    console.log('[Prawn] peeled: the head and shell off (into the trash), the tail fan on');
  }

  /** The peeled prawn onto the neta hand's fingers: the nigiri's topping from here. */
  private toFingers(): void {
    if (pieceApi.hasNeta()) return;
    const neta = prawn.boil ? 'BoiledPrawn' : 'RawPrawn';
    this.clear();
    pieceApi.take(neta);
    coach.done('prawnFingers');
    console.log(`[Prawn] onto the fingers: ${neta}`);
  }

  private clear(): void {
    if (this.carrySide !== -1) chef.hands[this.carrySide].holding = Held.None;
    this.stage = 'none';
    this.carrySide = -1;
    this.skewerGrab = null;
    this.holdSide = -1;
    this.peelFrom = null;
    this.skewered = this.cooked = this.peeled = false;
    this.look.root.visible = false;
    this.skewer.visible = false;
    this.ready.visible = false;
    this.showLabel('');
  }

  private publish(): void {
    const r = this.look.root.position;
    prawn.at.copy(r).add(this.tmp.set(0, 0.012, 0));
    prawn.headAt.copy(r).add(this.tmp.set(0, 0.012, -PRAWN_LENGTH / 2 + 0.015));
    this.gripOf(prawn.skewerAt);
    prawn.next =
      this.stage === 'none'
        ? null
        : this.stage === 'pot'
          ? prawn.boilT < PRAWN_BOIL_SECONDS
            ? 'boil'
            : 'out'
          : this.stage === 'held'
            ? this.skewered && !this.cooked
              ? 'pot'
              : 'board'
            : prawn.boil && !this.cooked
              ? this.skewered
                ? 'pot'
                : 'skewer'
              : this.skewered
                ? 'unskewer'
                : this.peeled
                  ? 'hand'
                  : 'peel';
  }
}
