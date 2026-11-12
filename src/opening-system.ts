import { createSystem, type Material, type Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { nakagoApi } from './prep-api.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { chef, day, nakago, prep, prepCleaned, prepReady, type Side, staff } from './game-state.js';
import { hands, RubTracker } from './hands.js';
import { BACK_ROW_Z, MANAITA_DEPTH, MANAITA_THICKNESS, MANAITA_WIDTH, SINK_TOP } from './layout.js';
import { GAZE_CONE_DEG, gazeOff, GazePinch } from './gaze.js';
import { heldOut, POINT_LATCH_SECONDS, pointsAt } from './pointing.js';

/** Looking at the noren: the cloth, roughly (eye tracking). */
const NOREN_LOOK_RADIUS = 0.3;
import { overStation, stations } from './station-system.js';
import { Held, StationKind } from './sushi-components.js';
import { BOARD_DRY_SECONDS, CLEANUP_SECONDS, CLOSE_AFTER_SECONDS, RUB_WASH_CLOTH } from './tuning.js';
import { playPress } from './sfx.js';

/** How the part-timer clears the scraps off the board (set by src/prep-cut-system.ts). */
export const scrapsApi = {
  clear: (): void => undefined,
};

/** The trash bin's lid opens when a hand is this close above it. */
const LID_NEAR = 0.3;
const LID_OPEN = 1.25;
/** The nori tin's lid opens back this far when a hand is this close to the tin. */
const NORI_NEAR = 0.2;
const NORI_LID_OPEN = 1.9;
/**
 * The wasabi is out only while the bar is open; at other times (the prep,
 * after closing) its little dish is kept turned over on the board (the
 * owner: 伏せておく).
 */
let wasabiCovered: boolean | null = null;
/** Things that stand on the manaita and sink to the counter while it is away. */
const ON_BOARD = [StationKind.NoriBox, StationKind.Wasabi, StationKind.Tezu, StationKind.Makisu, StationKind.PaperBox] as const;

/**
 * From the end of the prep to opening:
 *  - the trash bin's lid opens as a hand comes near;
 *  - cleaning: the manaita is lifted (pinch its near edge), carried to the
 *    sink and washed (the other hand rubs it under the faucet), left
 *    standing against the sink to drain, then carried back to the counter;
 *  - once the prep and the cleaning are done the hands need washing, and
 *    after that wash (src/hygiene-system.ts) the noren may be hung out:
 *    point at it at the entrance and pinch. The bar opens.
 *  - with the part-timer in (src/staff-system.ts), the scraps and the board
 *    are seen to once the prep is done;
 *  - at the end of the day the noren is taken in the same way: last orders.
 */
export class OpeningSystem extends createSystem({}) {
  private lid: Object3D | null = null;
  private noriLid: Object3D | null = null;
  private noriAngle = 0;
  private lidAngle = 0;
  private board: Object3D | null = null;
  private readonly boardHome = new Vector3();
  private boardState: 'home' | 'carried' | 'leaning' = 'home';
  private boardSide: Side | null = null;
  private readonly boardOffset = new Vector3();
  private washed = false;
  private dryLeft = 0;
  private readonly washRub = new RubTracker();
  private readonly sunk = new Map<Object3D, number>();
  private washAsked = false;
  private norenIn: Object3D | null = null;
  private norenOut: Object3D | null = null;
  private norenCloth: Material | null = null;
  private readonly tmp = new Vector3();
  private readonly rig = new Quaternion();
  private readonly lastPointed = [-10, -10];
  private readonly gazePinch = new GazePinch<true>();
  private time = 0;
  private cleanLeft = 0;
  private readonly head = new Vector3();

  update(delta: number): void {
    this.time += delta;
    this.updateLid(delta);
    this.updateNoriLid(delta);
    this.updateWasabi();
    if (!prep.active) {
      if (chef.open) {
        day.openFor += delta;
        this.updateNoren();
      }
      return;
    }
    if (prep.done && !prep.boardUsed && !prep.boardWashed) {
      // Nothing was cut on it this morning: no wash needed.
      prep.boardWashed = true;
      console.log('[Opening] the board was not used: no wash needed');
    }
    this.updateBoard(delta);
    this.updatePartTimer(delta);
    if (prepCleaned() && !this.washAsked) {
      // Fish on the hands, the board scrubbed: a wash with soap before opening.
      this.washAsked = true;
      for (const h of chef.hands) h.needsWash = true;
      console.log('[Opening] cleaned up: wash your hands, then hang the noren');
    }
    this.updateNoren();
    this.publish();
  }

  // ---- the trash bin's lid ---------------------------------------------------------

  /** The wasabi's dish: upright while the bar is open, turned over (the wasabi under it) otherwise. */
  private updateWasabi(): void {
    const covered = !chef.open || day.closed;
    if (covered === wasabiCovered) return;
    const o = stations.get(StationKind.Wasabi)?.entity.object3D;
    const dish = o?.getObjectByName('Dish');
    const mound = o?.getObjectByName('Wasabi');
    if (!dish || !mound) return;
    wasabiCovered = covered;
    dish.rotation.x = covered ? Math.PI : 0;
    mound.visible = !covered;
  }

  private updateLid(delta: number): void {
    const bin = stations.get(StationKind.TrashBin);
    if (!bin) return;
    this.lid ??= bin.entity.object3D?.getObjectByName('Lid') ?? null;
    if (!this.lid) return;
    let near = false;
    for (const hand of hands.all) {
      if (!hand.tracked) continue;
      const dx = hand.grasp.x - bin.pos.x;
      const dz = hand.grasp.z - bin.pos.z;
      const dy = hand.grasp.y - bin.pos.y;
      if (dx * dx + dz * dz < LID_NEAR * LID_NEAR && dy > -0.05 && dy < 0.45) near = true;
    }
    const target = near ? LID_OPEN : 0;
    this.lidAngle += (target - this.lidAngle) * Math.min(1, delta * 10);
    this.lid.rotation.z = this.lidAngle;
  }

  /** The nori tin's lid: raised back while a hand is near the tin, shut again to keep the nori dry. */
  private updateNoriLid(delta: number): void {
    const tin = stations.get(StationKind.NoriBox);
    if (!tin) return;
    this.noriLid ??= tin.entity.object3D?.getObjectByName('Lid') ?? null;
    if (!this.noriLid) return;
    let near = false;
    for (const hand of hands.all) {
      if (!hand.tracked) continue;
      const dx = hand.grasp.x - tin.pos.x;
      const dz = hand.grasp.z - tin.pos.z;
      const dy = hand.grasp.y - tin.pos.y;
      if (dx * dx + dz * dz < NORI_NEAR * NORI_NEAR && dy > -0.03 && dy < 0.3) near = true;
    }
    const target = near ? NORI_LID_OPEN : 0;
    this.noriAngle += (target - this.noriAngle) * Math.min(1, delta * 8);
    // Hinged at its back edge: its front swings up and over, away from the chef.
    this.noriLid.rotation.x = -this.noriAngle;
  }

  // ---- washing the board -----------------------------------------------------------

  private updateBoard(delta: number): void {
    const info = stations.get(StationKind.CuttingBoard);
    if (!this.board && info?.entity.object3D) {
      this.board = info.entity.object3D;
      this.boardHome.copy(this.board.position);
    }
    const board = this.board;
    if (!board || prep.boardWashed) return;
    const ready = prep.done && prep.scrapsLeft === 0;
    if (this.boardState === 'leaning' && this.dryLeft > 0) this.dryLeft -= delta;
    if (this.boardState !== 'carried') {
      if (!ready || (this.boardState === 'leaning' && this.dryLeft > 0)) return;
      for (const side of [chef.netaSide, chef.riceSide] as Side[]) {
        const hand = hands.all[side];
        if (!hand.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None) continue;
        if (!this.onBoardEdge(hand.grasp)) continue;
        this.boardSide = side;
        chef.hands[side].holding = Held.Board;
        if (this.boardState === 'home') this.sink(true);
        // Held in the chef's frame, so it turns with the chef.
        this.player.getWorldQuaternion(this.rig);
        this.boardOffset.copy(board.position).sub(hand.grasp).applyQuaternion(this.rig.invert());
        this.boardState = 'carried';
        this.washRub.reset();
        coach.done('liftBoard');
        console.log('[Opening] the board is lifted');
        return;
      }
      return;
    }
    const side = this.boardSide!;
    const hand = hands.all[side];
    if (hand.tracked) {
      this.player.getWorldQuaternion(this.rig);
      board.position.copy(this.boardOffset).applyQuaternion(this.rig).add(hand.grasp);
      board.quaternion.copy(this.rig);
    }
    // Washing: the board held over the sink, the other hand rubbing it under the faucet.
    if (!this.washed) {
      const other = hands.all[side === 0 ? 1 : 0];
      const over = overStation(hand.grasp, StationKind.Sink) || overStation(board.position, StationKind.Sink);
      const rubbing = over && other.tracked && overStation(other.palm, StationKind.Sink);
      if (this.washRub.update(other.palm, rubbing) >= RUB_WASH_CLOTH) {
        this.washed = true;
        chef.boardDirt = 0;
        feedback.flash(StationKind.Sink, COLOR_DONE);
        coach.done('washBoard');
        console.log('[Opening] the board is washed');
      }
    }
    if (hand.tracked && !hand.pinchEnd) return;
    chef.hands[side].holding = Held.None;
    this.boardSide = null;
    const dried = this.washed && this.dryLeft <= 0 && this.leanedOnce;
    if (dried && this.nearHome(hand.grasp)) {
      board.position.copy(this.boardHome);
      board.rotation.set(0, 0, 0);
      this.boardState = 'home';
      this.sink(false);
      prep.boardWashed = true;
      feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
      coach.done('returnBoard');
      console.log('[Opening] the board is back on the counter');
      return;
    }
    if (this.washed && (overStation(hand.grasp, StationKind.Sink) || this.leanedOnce)) {
      this.lean(board);
      return;
    }
    // Not washed yet: back where it was.
    board.position.copy(this.boardHome);
    board.rotation.set(0, 0, 0);
    this.boardState = 'home';
    this.sink(false);
    if (this.washed) feedback.flash(StationKind.Sink, COLOR_WARN);
  }
  private leanedOnce = false;

  /** Stood up against the back of the sink to drain. */
  private lean(board: Object3D): void {
    const sink = stations.get(StationKind.Sink);
    const x = sink ? sink.pos.x : 0;
    board.position.set(x, SINK_TOP + 0.02 + MANAITA_DEPTH * 0.48, BACK_ROW_Z + 0.47);
    board.rotation.set(-1.32, 0, 0);
    this.boardState = 'leaning';
    if (!this.leanedOnce) this.dryLeft = BOARD_DRY_SECONDS;
    this.leanedOnce = true;
    coach.done('leanBoard');
    console.log('[Opening] the board stands draining');
  }

  /** A pinch on the board: its near edge at home, or anywhere on it while it leans. */
  private onBoardEdge(p: Vector3): boolean {
    const b = this.board!.position;
    if (this.boardState === 'home') {
      return Math.abs(p.x - b.x) < MANAITA_WIDTH / 2 && Math.abs(p.z - (b.z + MANAITA_DEPTH / 2)) < 0.07 && Math.abs(p.y - (b.y + MANAITA_THICKNESS)) < 0.07;
    }
    return Math.abs(p.x - b.x) < MANAITA_WIDTH / 2 && Math.abs(p.z - b.z) < 0.12 && Math.abs(p.y - b.y) < 0.22;
  }

  private nearHome(p: Vector3): boolean {
    return Math.abs(p.x - this.boardHome.x) < MANAITA_WIDTH / 2 + 0.1 && Math.abs(p.z - this.boardHome.z) < MANAITA_DEPTH && p.y < this.boardHome.y + 0.35;
  }

  /** The things on the board drop to the counter while it is away, and back. */
  private sink(down: boolean): void {
    for (const kind of ON_BOARD) {
      const o = stations.get(kind)?.entity.object3D;
      if (!o) continue;
      if (down) {
        this.sunk.set(o, o.position.y);
        o.position.y -= MANAITA_THICKNESS;
      } else {
        const y = this.sunk.get(o);
        if (y !== undefined) o.position.y = y;
      }
    }
    if (!down) this.sunk.clear();
  }

  // ---- the part-timer -----------------------------------------------------------------

  /** Once the prep is done, the part-timer (at the board, src/staff-system.ts) throws out the scraps and washes the board. */
  private updatePartTimer(delta: number): void {
    staff.cleanupWanted = prep.done && (prep.scrapsLeft > 0 || !prep.boardWashed || nakago.left > 0) && this.boardState === 'home';
    const work = staff.partTimer && staff.cleanupWanted && staff.partTimerReady;
    if (!work) {
      staff.cleaning = false;
      this.cleanLeft = CLEANUP_SECONDS;
      return;
    }
    if (!staff.cleaning) console.log('[Opening] the part-timer starts the cleaning');
    staff.cleaning = true;
    this.cleanLeft -= delta;
    if (this.cleanLeft > 0) return;
    scrapsApi.clear();
    prep.boardWashed = true;
    nakagoApi.byStaff();
    chef.boardDirt = 0;
    staff.cleaning = false;
    feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
    console.log('[Opening] the part-timer has cleared the scraps and washed the board');
  }

  // ---- the noren -------------------------------------------------------------------

  /** Hung out to open (after the prep), taken in to close (last orders). */
  private updateNoren(): void {
    if (!this.norenIn) {
      this.norenIn = this.world.scene.getObjectByName('NorenInside') ?? null;
      this.norenOut = this.world.scene.getObjectByName('NorenOutside') ?? null;
      if (!this.norenIn) return;
    }
    const closing = chef.open;
    if (closing && day.closing) return;
    const noren = closing ? this.norenOut : this.norenIn;
    const cloth = noren?.getObjectByName('Cloth') as (Object3D & { material?: Material }) | undefined;
    this.norenCloth = cloth?.material ?? null;
    const pole = noren?.getObjectByName('Pole');
    if (pole) pole.getWorldPosition(prep.norenAt);
    prep.norenAt.y -= 0.25;
    const ready = closing ? day.openFor >= CLOSE_AFTER_SECONDS : prepReady();
    let pointing = false;
    let chose = false;
    this.player.head.getWorldPosition(this.head);
    for (const side of [chef.netaSide, chef.riceSide] as Side[]) {
      const hand = hands.all[side];
      if (!hand.tracked || chef.hands[side].holding !== Held.None) continue;
      // Only with the hand held out pointing (a pinch at work on the board does not touch the noren).
      if (!heldOut(hand, this.head)) {
        if (hand.pinchStart) this.lastPointed[side] = -10;
        continue;
      }
      if (pointsAt(hand, prep.norenAt)) {
        pointing = true;
        this.lastPointed[side] = this.time;
      }
      // The pinch bends the index finger: it counts if it pointed just before.
      if (!hand.pinchStart || this.time - this.lastPointed[side] > POINT_LATCH_SECONDS) continue;
      chose = true;
      break;
    }
    // Eye tracking (the glasses): look at the noren and pinch with an empty hand.
    const seen = gazeOff(this.player, prep.norenAt, NOREN_LOOK_RADIUS) < GAZE_CONE_DEG;
    if (seen) pointing = true;
    if (chose) this.gazePinch.cancel();
    else if (this.gazePinch.update(seen ? true : null)) chose = true;
    if (chose) {
      if (!ready) {
        coach.nudge();
        console.log(closing ? '[Opening] just opened: serve a while first' : '[Opening] not yet: finish the prep and the cleaning, and wash your hands');
      } else {
        playPress();
        if (closing) this.takeIn();
        else this.hangOut();
        return;
      }
    }
    const glow = this.norenCloth as (Material & { emissive?: { setRGB(r: number, g: number, b: number): void } }) | null;
    glow?.emissive?.setRGB(pointing && ready ? 0.12 : 0, pointing && ready ? 0.12 : 0, pointing && ready ? 0.2 : 0);
  }

  private hangOut(): void {
    if (this.norenIn) this.norenIn.visible = false;
    if (this.norenOut) this.norenOut.visible = true;
    chef.open = true;
    prep.active = false;
    day.openFor = 0;
    coach.done('hangNoren');
    console.log('[Opening] the noren is hung out: the bar is open');
  }

  /** The end of the day: the noren back inside, the seated customer's order is the last. */
  private takeIn(): void {
    const glow = this.norenCloth as (Material & { emissive?: { setRGB(r: number, g: number, b: number): void } }) | null;
    glow?.emissive?.setRGB(0, 0, 0);
    if (this.norenOut) this.norenOut.visible = false;
    if (this.norenIn) this.norenIn.visible = true;
    day.closing = true;
    console.log('[Opening] the noren is taken in: last orders');
  }

  // ---- what comes next ---------------------------------------------------------------

  private publish(): void {
    if (this.board) this.board.getWorldPosition(prep.boardAt);
    prep.boardHome.copy(this.boardHome);
    if (!prep.done || prep.scrapsLeft > 0) return;
    if (!prep.boardWashed) {
      if (this.boardState === 'home') prep.next = 'liftBoard';
      else if (this.boardState === 'carried') prep.next = !this.washed ? 'washBoard' : this.leanedOnce && this.dryLeft <= 0 ? 'returnBoard' : 'leanBoard';
      else prep.next = this.dryLeft > 0 ? 'dryBoard' : 'liftBoard';
      return;
    }
    if (prepReady()) prep.next = 'noren';
  }
}
