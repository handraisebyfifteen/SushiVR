import { createSystem, type Material, type Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { chef, prep, prepCleaned, prepReady, type Side } from './game-state.js';
import { hands, RubTracker } from './hands.js';
import { BACK_ROW_Z, MANAITA_DEPTH, MANAITA_THICKNESS, MANAITA_WIDTH, SINK_TOP } from './layout.js';
import { overStation, stations } from './station-system.js';
import { Held, StationKind } from './sushi-components.js';
import { BOARD_DRY_SECONDS, RUB_WASH_CLOTH } from './tuning.js';

/** The trash bin's lid opens when a hand is this close above it. */
const LID_NEAR = 0.3;
const LID_OPEN = 1.25;
/** Pointing at the noren: within this many degrees across (the aim that matters, it is far), and loosely up or down. */
const POINT_ACROSS_DEG = 10;
const POINT_UPDOWN_DEG = 75;
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
 */
export class OpeningSystem extends createSystem({}) {
  private lid: Object3D | null = null;
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
  private time = 0;
  private readonly dir = new Vector3();
  private readonly to = new Vector3();

  update(delta: number): void {
    this.time += delta;
    this.updateLid(delta);
    if (!prep.active) return;
    this.updateBoard(delta);
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

  // ---- the noren -------------------------------------------------------------------

  private updateNoren(): void {
    if (!this.norenIn) {
      this.norenIn = this.world.scene.getObjectByName('NorenInside') ?? null;
      this.norenOut = this.world.scene.getObjectByName('NorenOutside') ?? null;
      const cloth = this.norenIn?.getObjectByName('Cloth') as (Object3D & { material?: Material }) | undefined;
      this.norenCloth = cloth?.material ?? null;
      if (!this.norenIn) return;
    }
    const pole = this.norenIn.getObjectByName('Pole');
    if (pole) pole.getWorldPosition(prep.norenAt);
    prep.norenAt.y -= 0.25;
    const ready = prepReady();
    let pointing = false;
    for (const side of [chef.netaSide, chef.riceSide] as Side[]) {
      const hand = hands.all[side];
      if (!hand.tracked || chef.hands[side].holding !== Held.None) continue;
      if (this.pointsAt(side, prep.norenAt)) {
        pointing = true;
        this.lastPointed[side] = this.time;
      }
      // The pinch bends the index finger: it counts if it pointed just before.
      if (!hand.pinchStart || this.time - this.lastPointed[side] > 0.4) continue;
      if (!ready) {
        coach.nudge();
        console.log('[Opening] not yet: finish the prep and the cleaning, and wash your hands');
        continue;
      }
      this.hangOut();
      return;
    }
    const glow = this.norenCloth as (Material & { emissive?: { setRGB(r: number, g: number, b: number): void } }) | null;
    glow?.emissive?.setRGB(pointing && ready ? 0.12 : 0, pointing && ready ? 0.12 : 0, pointing && ready ? 0.2 : 0);
  }

  /** The index finger (wrist to fingertip) points at a far point. */
  private pointsAt(side: Side, target: Vector3): boolean {
    const hand = hands.all[side];
    this.dir.copy(hand.indexTip).sub(hand.wrist);
    this.to.copy(target).sub(hand.indexTip);
    const across = Math.abs(Math.atan2(this.dir.x * this.to.z - this.dir.z * this.to.x, this.dir.x * this.to.x + this.dir.z * this.to.z));
    const upDir = Math.atan2(this.dir.y, Math.hypot(this.dir.x, this.dir.z));
    const upTo = Math.atan2(this.to.y, Math.hypot(this.to.x, this.to.z));
    return across < (POINT_ACROSS_DEG * Math.PI) / 180 && Math.abs(upDir - upTo) < (POINT_UPDOWN_DEG * Math.PI) / 180;
  }

  private hangOut(): void {
    if (this.norenIn) this.norenIn.visible = false;
    if (this.norenOut) this.norenOut.visible = true;
    chef.open = true;
    prep.active = false;
    coach.done('hangNoren');
    console.log('[Opening] the noren is hung out: the bar is open');
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
