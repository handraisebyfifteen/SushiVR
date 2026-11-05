import { Group, Mesh, type Vector3 } from '@iwsdk/core';
import { coach } from '../coach.js';
import { COLOR_DONE, feedback } from '../feedback.js';
import { chef, orderKind, progress, service } from '../game-state.js';
import type { HandReader } from '../hand-reader.js';
import { hands } from '../hands.js';
import type { PieceResult } from '../scoring.js';
import { inariShapes, lookMaterial } from '../scene-assets/lib/neta-look.js';
import { Held, InariStage, NigiriStage, StationKind } from '../sushi-components.js';
import { JOIN_DISTANCE } from '../tuning.js';
import type { Assembly, PieceCore } from './types.js';

/**
 * Inari, Kanto style (a plump tawara with its mouth folded shut):
 *  1 the neta hand takes a seasoned pouch from the case (through the
 *    cutting system, like a ready-cut piece); it lies open on the fingers
 *  2 the rice (PieceSystem)            3 palms together: the rice goes in
 *  4 a fist with the neta hand on the beat folds the mouth shut (judged). Done.
 * No wasabi.
 */
export class InariAssembly implements Assembly {
  readonly kind = 'inari' as const;
  readonly judgeSlots = 2;
  private ageHeld = false;
  private stuffed = false;
  private closed = false;
  private readonly open: Mesh;
  private readonly plump: Mesh;
  private readonly rice: Mesh;
  private readonly fold: Mesh;

  constructor(private readonly core: PieceCore) {
    const shapes = inariShapes();
    const material = lookMaterial('InariAge');
    const group = new Group();
    group.name = 'Inari';
    this.open = new Mesh(shapes.open, material);
    this.plump = new Mesh(shapes.plump, material);
    this.rice = new Mesh(shapes.rice, material);
    this.fold = new Mesh(shapes.fold, material);
    this.open.name = 'AgeOpen';
    this.plump.name = 'AgeFilled';
    this.rice.name = 'RiceInMouth';
    this.fold.name = 'FoldedMouth';
    group.add(this.open, this.plump, this.rice, this.fold);
    core.piece.add(group);
    this.reset();
  }

  /** A pouch from the case onto the neta hand. False if another piece is in progress. */
  take(): boolean {
    if (!this.core.begin('inari')) return false;
    this.ageHeld = true;
    this.core.netaHeld = true;
    this.core.netaId = 'InariAge';
    chef.hands[chef.netaSide].holding = Held.Neta;
    this.core.setStage(InariStage.Age);
    coach.done('takeAge');
    console.log('[Inari] a pouch on the fingers');
    return true;
  }

  update(_delta: number): void {
    if (!this.ageHeld || chef.facingBack) return;
    const riceHand = hands.all[chef.riceSide];
    const netaHand = hands.all[chef.netaSide];
    if (!this.stuffed) this.updateStuff(riceHand, netaHand);
    else this.updateClose(netaHand);
  }

  private updateStuff(riceHand: HandReader, netaHand: HandReader): void {
    const core = this.core;
    if (!core.hasRice || !riceHand.tracked || !netaHand.tracked || riceHand.fist) return;
    if (riceHand.palm.distanceTo(netaHand.palm) > JOIN_DISTANCE) return;
    chef.hands[chef.riceSide].holding = Held.None;
    this.stuffed = true;
    core.hasNeta = true;
    core.cutAge = 0;
    core.startMetronome(60);
    core.setStage(InariStage.Stuffed);
    coach.done('stuffAge');
    console.log('[Inari] rice in the pouch');
  }

  /** A fist with the hand holding it, on the beat: the mouth folds under. */
  private updateClose(netaHand: HandReader): void {
    if (!netaHand.tracked || !netaHand.fistStart) return;
    const judge = this.core.judge(1);
    this.core.judges[1] = judge;
    this.closed = true;
    this.core.setStage(NigiriStage.Done);
    feedback.flash(StationKind.Geta, COLOR_DONE);
    coach.done('closeAge');
    console.log(`[Inari] folded shut: ${judge}`);
  }

  layout(): boolean {
    this.open.visible = this.ageHeld && !this.stuffed;
    this.plump.visible = this.stuffed;
    this.rice.visible = this.stuffed && !this.closed;
    this.fold.visible = this.closed;
    this.open.position.y = 0.002;
    // The rice is inside the pouch now: its own mesh is not shown.
    if (this.stuffed) this.core.rice.visible = false;
    return this.stuffed;
  }

  wasabiTarget(_out: Vector3): boolean {
    return false;
  }

  ringOnHand(): boolean {
    return !this.stuffed;
  }

  hints(): void {
    const core = this.core;
    if (orderKind() !== 'inari' && core.kind !== 'inari') return;
    const riceState = chef.hands[chef.riceSide];
    if (!this.stuffed && !core.hasRice) feedback.hints.add(riceState.wet ? StationKind.RiceTub : StationKind.Tezu);
    if (!this.ageHeld) feedback.hints.add(StationKind.NetaCase);
  }

  score(r: PieceResult): void {
    const order = service.order;
    r.itemOk = !!order && order.item === 'Inari' && this.closed;
    // No head end or skin; any heading is fine.
  }

  reset(): void {
    this.ageHeld = this.stuffed = this.closed = false;
    this.open.visible = this.plump.visible = this.rice.visible = this.fold.visible = false;
  }

  publish(): void {
    progress.ageHeld = this.ageHeld;
    progress.stuffed = this.stuffed;
    progress.closed = this.closed;
  }

  describe(): string {
    return `pouch=${this.ageHeld ? 'y' : 'n'} filled=${this.stuffed ? 'y' : 'n'} shut=${this.closed ? 'y' : 'n'}`;
  }
}
