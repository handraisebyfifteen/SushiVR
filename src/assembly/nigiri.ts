import { type BufferGeometry, type Material, Mesh, Vector3 } from '@iwsdk/core';
import { coach } from '../coach.js';
import { feedback } from '../feedback.js';
import { chef, service } from '../game-state.js';
import type { HandReader } from '../hand-reader.js';
import { hands } from '../hands.js';
import { menuFor, NETA, type NetaId, orderAccepts } from '../menu.js';
import type { PieceResult } from '../scoring.js';
import { sliceLook } from '../scene-assets/lib/neta-look.js';
import { restMaterial } from '../scene-assets/lib/neta-material.js';
import { Drape, SHARI_FINISHED, TOPPING_STIFFNESS } from '../scene-assets/lib/nigiri-form.js';
import { Held, NigiriStage, Piece, StationKind } from '../sushi-components.js';
import {
  BOARD_DIRT_PER_NIGIRI,
  DIAGONAL_DEG,
  FLIP_CURL_DELTA,
  FLIP_PUSH_DISTANCE,
  FLIP_WINDOW_SECONDS,
  JOIN_DISTANCE,
  ORIENTATION_TOLERANCE_DEG,
  ROTATE_DEG,
  TOUCH_DISTANCE,
} from '../tuning.js';
import { type Assembly, lineDiff, normYaw, type PieceCore } from './types.js';

/**
 * The shaping through the work (the user's shop): the stage the shari is
 * pressed toward and how far the neta bends (negative: cupped up in the palm,
 * under the shari; positive: draped over it once it is rolled over).
 * Touch 1 presses the top (the shari's future bottom) flat, touch 2 sets the
 * form and lays the neta over it, touch 3 evens it into the finished piece.
 */
const FORM: Partial<Record<string, readonly [number, number]>> = {
  [NigiriStage.Joined]: [1, -0.3],
  [NigiriStage.Touched1]: [2, -0.4],
  [NigiriStage.Flipped]: [2, 0.45],
  [NigiriStage.Touched2]: [3, 0.85],
  [NigiriStage.Rotated]: [3, 0.85],
  [NigiriStage.Done]: [SHARI_FINISHED, 1],
  [NigiriStage.Carried]: [SHARI_FINISHED, 1],
  [NigiriStage.Placed]: [SHARI_FINISHED, 1],
};
/** How fast the neta settles to its bend (amount per second). */
const DRAPE_RATE = 5;
/** The neta sinks this little into the rice, so no gap shows between them. */
const SINK = 0.0008;
/** Flip detection keeps this many recent neta-hand samples (enough for FLIP_WINDOW_SECONDS at 120 fps). */
const FLIP_SAMPLES = 72;

/**
 * The nigiri, from the slice to the finished piece (rice hand = right, neta
 * hand = left, swapped by CHEF_LEFT_HANDED):
 *  1 the neta hand pinches the slice on the board (a ready-cut piece comes
 *    straight onto the fingers)       2-4 the rice (PieceSystem)
 *  5 index finger: wasabi dish, then the neta   6 palms together: rice on neta
 *  7 touch 1: fist (judged)           8 push the neta hand forward while the
 *    fingers curl: the piece rolls over, neta on top
 *  9 touch 2: pinch (judged)          10 pinch and turn the hand clockwise:
 *    the piece spins half a turn      11 touch 3: pinch (judged) - done.
 */
export class NigiriAssembly implements Assembly {
  readonly kind = 'nigiri' as const;
  readonly judgeSlots = 4;
  private readonly neta: Mesh<BufferGeometry, Material>;
  private readonly flipT = new Float64Array(FLIP_SAMPLES);
  private readonly flipZ = new Float32Array(FLIP_SAMPLES);
  private readonly flipCurl = new Float32Array(FLIP_SAMPLES);
  private flipCount = 0;
  private flipHead = 0;
  private rotateStartYaw: number | null = null;
  private time = 0;
  /** The neta's own bendable copy of the slice, how far it may bend, and the shari's yaw to lie along it. */
  private drape: Drape | null = null;
  private stiffness = 1;
  private shariYaw = 0;
  private readonly tmp = new Vector3();

  constructor(private readonly core: PieceCore) {
    const first = sliceLook(core.netaId);
    this.neta = new Mesh(first.geometry, first.material);
    this.neta.name = 'Neta';
    this.neta.visible = false;
    core.piece.add(this.neta);
  }

  // ---- the slice ----------------------------------------------------------

  /** A slice was cut and lies on the board. */
  cut(neta: NetaId, skinRight: boolean, at: Vector3): void {
    if (!this.core.begin('nigiri')) return;
    this.setNeta(neta, skinRight);
    this.core.netaHeld = false;
    this.core.netaOnBoard.copy(at);
  }

  /** A ready-cut piece onto the neta hand's fingers: as if the slice had just been picked up. */
  take(neta: NetaId): void {
    if (!this.core.begin('nigiri')) return;
    this.setNeta(neta, true);
    this.core.netaHeld = true;
    chef.hands[chef.netaSide].holding = Held.Neta;
    this.core.setStage(this.core.hasRice ? NigiriStage.Rice : NigiriStage.Neta);
    console.log(`[Nigiri] ${neta} on the palm`);
  }

  /**
   * The topping's shape and material for this neta. Its material is the
   * neta's own (shared, never recoloured), so a served piece keeps its look.
   * A saku slice is turned a quarter turn onto the rice and mirrored so its
   * skin edge lands on the side the cut left it (-X when skinRight).
   */
  private setNeta(neta: NetaId, skinRight: boolean): void {
    const core = this.core;
    const look = sliceLook(neta);
    core.netaId = neta;
    core.skinRight = skinRight;
    core.hasNeta = true;
    core.cutAge = 0;
    // Its own copy to bend over the shari (a served piece keeps its own: PieceSystem.serve).
    const old = this.drape;
    this.drape = new Drape(look.geometry);
    this.neta.geometry = this.drape.geometry;
    this.neta.material = restMaterial(look.material);
    old?.dispose();
    this.stiffness = TOPPING_STIFFNESS[NETA[neta].look.shape] ?? 1;
    const yaw = look.blockAxes ? -Math.PI / 2 : 0;
    this.neta.rotation.set(0, yaw, 0);
    this.neta.scale.set(1, 1, look.blockAxes && !skinRight ? -1 : 1);
    // The shari lies along the neta's length (its own length is along X).
    this.shariYaw = this.drape.alongZ ? yaw - Math.PI / 2 : yaw;
    this.neta.visible = true;
    core.pieceYaw = 0;
    core.entity.setValue(Piece, 'neta', neta);
    core.entity.setValue(Piece, 'hasNeta', true);
    core.entity.setValue(Piece, 'skinRight', skinRight);
    core.entity.setValue(Piece, 'cutAge', 0);
  }

  // ---- the steps ----------------------------------------------------------

  update(delta: number): void {
    this.time += delta;
    const core = this.core;
    // Shaping: the shari toward this step's form, the neta settling over it.
    const form = FORM[core.stage];
    if (form) core.shariLevel = form[0];
    if (this.drape) {
      const want = (form ? form[1] : 0) * this.stiffness;
      const at = this.drape.amount;
      if (Math.abs(at - want) > 1e-4) {
        const step = DRAPE_RATE * delta;
        this.drape.bend(at < want ? Math.min(want, at + step) : Math.max(want, at - step));
      }
    }
    const riceHand = hands.all[chef.riceSide];
    const netaHand = hands.all[chef.netaSide];
    switch (core.stage) {
      case NigiriStage.None:
        this.updatePickNeta(netaHand);
        break;
      case NigiriStage.Neta:
      case NigiriStage.Rice:
        // Wasabi only while the rice is in hand (taken on the way up from the tub).
        core.updateWasabi(riceHand, core.hasRice);
        this.updateJoin(riceHand, netaHand);
        break;
      case NigiriStage.Joined:
        this.updateTouchFist(riceHand, netaHand);
        break;
      case NigiriStage.Touched1:
        this.updateFlip(netaHand);
        break;
      case NigiriStage.Flipped:
        this.updateTouchPinch(riceHand, 2, NigiriStage.Touched2);
        break;
      case NigiriStage.Touched2:
        this.updateRotate(riceHand);
        break;
      case NigiriStage.Rotated:
        this.updateTouchPinch(riceHand, 3, NigiriStage.Done);
        break;
    }
  }

  private updatePickNeta(hand: HandReader): void {
    const state = chef.hands[chef.netaSide];
    if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None) return;
    if (hand.grasp.distanceTo(this.core.netaOnBoard) > TOUCH_DISTANCE) return;
    this.core.netaHeld = true;
    state.holding = Held.Neta;
    this.core.setStage(this.core.hasRice ? NigiriStage.Rice : NigiriStage.Neta);
    coach.done('takeNeta');
    console.log('[Nigiri] neta on the palm');
  }

  private updateJoin(riceHand: HandReader, netaHand: HandReader): void {
    const core = this.core;
    if (!core.hasRice || !core.netaHeld) return;
    if (!riceHand.tracked || !netaHand.tracked || riceHand.fist) return;
    if (riceHand.palm.distanceTo(netaHand.palm) > JOIN_DISTANCE) return;
    chef.hands[chef.riceSide].holding = Held.None;
    // The wasabi is now between the neta and the rice.
    core.wasabiBlob.visible = false;
    core.boardWasDirty = chef.boardDirt >= 1;
    chef.boardDirt = Math.min(1, chef.boardDirt + BOARD_DIRT_PER_NIGIRI);
    core.startMetronome(60);
    core.setStage(NigiriStage.Joined);
    coach.done('join');
    console.log('[Nigiri] rice on the neta');
  }

  private updateTouchFist(riceHand: HandReader, netaHand: HandReader): void {
    if (!riceHand.tracked || !riceHand.fistStart) return;
    if (netaHand.tracked && riceHand.palm.distanceTo(netaHand.palm) > JOIN_DISTANCE + 0.06) return;
    this.touch(1, NigiriStage.Touched1);
  }

  private updateTouchPinch(riceHand: HandReader, n: 2 | 3, next: string): void {
    if (!riceHand.tracked || !riceHand.pinchStart) return;
    const d = riceHand.grasp.distanceTo(this.core.focus);
    if (d > TOUCH_DISTANCE) {
      console.log(`[Nigiri] touch ${n}: pinch ${(d * 100).toFixed(0)} cm from the piece`);
      return;
    }
    this.touch(n, next);
    if (next === NigiriStage.Done) this.rotateStartYaw = null;
  }

  private touch(n: 1 | 2 | 3, next: string): void {
    const judge = this.core.judge(n);
    this.core.judges[n] = judge;
    this.core.entity.setValue(Piece, n === 1 ? 'judge1' : n === 2 ? 'judge2' : 'judge3', judge);
    this.core.setStage(next);
    coach.done(n === 1 ? 'touch1' : n === 2 ? 'touch2' : 'touch3');
    console.log(`[Nigiri] touch ${n}: ${judge}`);
  }

  /** Roll over: within FLIP_WINDOW_SECONDS the neta palm moves forward (-Z) while the fingers curl more. */
  private updateFlip(netaHand: HandReader): void {
    if (!netaHand.tracked) return;
    this.flipHead = (this.flipHead + 1) % FLIP_SAMPLES;
    this.flipT[this.flipHead] = this.time;
    this.flipZ[this.flipHead] = netaHand.palm.z;
    this.flipCurl[this.flipHead] = netaHand.curl;
    this.flipCount = Math.min(FLIP_SAMPLES, this.flipCount + 1);
    if (this.flipCount < 2) return;
    let maxZ = -Infinity;
    let minCurl = Infinity;
    for (let k = 0; k < this.flipCount; k++) {
      const i = (this.flipHead - k + FLIP_SAMPLES) % FLIP_SAMPLES;
      if (this.time - this.flipT[i] > FLIP_WINDOW_SECONDS) break;
      if (this.flipZ[i] > maxZ) maxZ = this.flipZ[i];
      if (this.flipCurl[i] < minCurl) minCurl = this.flipCurl[i];
    }
    const pushed = maxZ - netaHand.palm.z >= FLIP_PUSH_DISTANCE;
    const curled = netaHand.curl - minCurl >= FLIP_CURL_DELTA && !netaHand.fist;
    if (pushed && curled) {
      this.flipCount = 0;
      this.core.setStage(NigiriStage.Flipped);
      coach.done('flip');
      console.log('[Nigiri] rolled over: neta on top');
    }
  }

  /** Half turn: keep pinching and turn the rice hand clockwise by ROTATE_DEG. */
  private updateRotate(riceHand: HandReader): void {
    if (!riceHand.tracked || !riceHand.pinch || riceHand.grasp.distanceTo(this.core.focus) > TOUCH_DISTANCE * 1.5) {
      this.rotateStartYaw = null;
      return;
    }
    if (this.rotateStartYaw === null) {
      this.rotateStartYaw = riceHand.yawDeg;
      return;
    }
    // Clockwise seen from above = heading decreases.
    if (normYaw(riceHand.yawDeg - this.rotateStartYaw) <= -ROTATE_DEG) {
      this.core.pieceYaw += 180;
      this.rotateStartYaw = null;
      this.core.setStage(NigiriStage.Rotated);
      coach.done('rotate');
      console.log('[Nigiri] turned half round');
    }
  }

  // ---- shared hooks ---------------------------------------------------------

  layout(): boolean {
    const stage = this.core.stage;
    const flipped =
      stage === NigiriStage.Flipped || stage === NigiriStage.Touched2 || stage === NigiriStage.Rotated ||
      stage === NigiriStage.Done || stage === NigiriStage.Carried || stage === NigiriStage.Placed;
    const joined = flipped || stage === NigiriStage.Joined || stage === NigiriStage.Touched1;
    const minY = this.drape ? this.drape.minY : 0;
    const top = (this.drape ? this.drape.maxY : 0.006) - minY;
    const rice = this.core.rice;
    const h = this.core.shari.height;
    if (joined) {
      if (flipped) {
        // On its flat bottom, the neta over it, the wasabi between.
        rice.rotation.set(0, this.shariYaw, 0);
        rice.position.set(0, 0, 0);
        this.neta.position.set(0, h - minY - SINK, 0);
        this.core.wasabiBlob.position.set(0, h - 0.002, 0);
      } else {
        // In the palm: the neta below, cupped; the shari upside down on it, its dome down into the neta.
        this.neta.position.set(0, -minY, 0);
        rice.rotation.set(Math.PI, this.shariYaw, 0);
        rice.position.set(0, top + h - SINK, 0);
        this.core.wasabiBlob.position.set(0, top + 0.002, 0);
      }
    } else {
      this.neta.position.set(0, -minY, 0);
      if (this.core.wasabi === 'neta') this.core.wasabiBlob.position.set(0, top + 0.003, 0);
    }
    return joined;
  }

  wasabiTarget(out: Vector3): boolean {
    this.neta.getWorldPosition(out);
    return true;
  }

  ringOnHand(): boolean {
    const s = this.core.stage;
    return s === NigiriStage.None || s === NigiriStage.Neta || s === NigiriStage.Rice;
  }

  hints(): void {
    const core = this.core;
    const riceState = chef.hands[chef.riceSide];
    if (core.stage === NigiriStage.None) {
      if (core.hasNeta) feedback.hints.add(StationKind.CuttingBoard);
    } else if (core.stage === NigiriStage.Neta || core.stage === NigiriStage.Rice) {
      if (!core.hasRice) feedback.hints.add(riceState.wet ? StationKind.RiceTub : StationKind.Tezu);
      else if (service.order?.wasabi && core.wasabi === 'none') feedback.hints.add(StationKind.Wasabi);
    }
  }

  /** Right neta; orientation on the geta (straight across first, then diagonal, head toward the customer); skin side. */
  score(r: PieceResult): void {
    const core = this.core;
    const order = service.order;
    const yaw = normYaw(core.pieceYaw);
    let angleOk: boolean;
    let headOk = true;
    if (!service.customerHandKnown) {
      // Straight across the geta: the long axis runs left-right.
      angleOk = Math.abs(lineDiff(yaw, 90)) <= ORIENTATION_TOLERANCE_DEG;
    } else {
      const expected = service.customerLeftHanded ? -DIAGONAL_DEG : DIAGONAL_DEG;
      angleOk = Math.abs(lineDiff(yaw, expected)) <= ORIENTATION_TOLERANCE_DEG;
      headOk = Math.cos((yaw * Math.PI) / 180) > 0;
    }
    const served = menuFor('nigiri', [core.netaId]);
    r.served = served;
    r.itemOk = !!order && !!served && orderAccepts(order.item, served);
    r.headOk = headOk;
    r.angleOk = angleOk;
    r.skinOk = !NETA[core.netaId].skinEdge || core.skinRight;
    r.hospitalityOk = angleOk;
  }

  reset(): void {
    this.neta.visible = false;
    this.drape?.bend(0);
    this.shariYaw = 0;
    this.flipCount = 0;
    this.rotateStartYaw = null;
  }

  publish(): void {}

  describe(): string {
    return `neta=${this.core.hasNeta ? this.core.netaId : '-'}`;
  }
}
