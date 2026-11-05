import {
  BoxGeometry,
  type BufferAttribute,
  Color,
  createSystem,
  type Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  type Sprite,
  Vector3,
} from '@iwsdk/core';
import { coach, type Grade } from './coach.js';
import { customerApi } from './customer-system.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { chef, FISH_COLOR, type FishKind, type JudgeKind, progress, service } from './game-state.js';
import { hands } from './hands.js';
import { addPieceDirt } from './hygiene-system.js';
import { type PieceResult, scorePiece } from './scoring.js';
import { playRustle, playTone } from './sfx.js';
import { overStation, stations } from './station-system.js';
import { Fish, Held, Judge, Nigiri, NigiriStage, StationKind } from './sushi-components.js';
import { makeTextSprite } from './text-sprites.js';
import {
  BOARD_DIRT_PER_NIGIRI,
  DIAGONAL_DEG,
  FLIP_CURL_DELTA,
  FLIP_PUSH_DISTANCE,
  FLIP_WINDOW_SECONDS,
  FRESH_SECONDS,
  JOIN_DISTANCE,
  JUDGE_EXCELLENT_MS,
  JUDGE_GOOD_MS,
  JUDGE_POOR_MS,
  ORIENTATION_TOLERANCE_DEG,
  ROTATE_DEG,
  SERVE_HOLD_SECONDS,
  STALE_SECONDS,
  TEMPO_MS,
  TOUCH_DISTANCE,
  WASABI_TOUCH_HEIGHT,
} from './tuning.js';

type Stage = (typeof NigiriStage)[keyof typeof NigiriStage];

const WASABI_DAB_DISTANCE = 0.05;
const JUDGE_TEXT_SECONDS = 0.8;
/** The rice hand counts as "gone to the tub" when it drops below the counter on the chef's right, beside the body. */
const TUB_MAX_Y = 0.65;
const TUB_MIN_X = 0.25;
const TUB_MIN_Z = -0.15;
const COUNTER_Y = 0.72;
const RICE_LOOSE = new Vector3(0.85, 0.85, 0.85);
const RICE_ROUND = new Vector3(1, 0.9, 1);
const RICE_SHAPED = new Vector3(1.15, 0.55, 0.8);

/** Let the cutting system create the slice without importing this class. */
export const pieceApi = {
  hasNeta: (): boolean => false,
  cut: (_fish: FishKind, _skinRight: boolean, _at: Vector3): void => undefined,
};

/** A slice of fish: thick at the head end (local -Z), thinner toward the tail. */
function makeNetaGeometry(): BoxGeometry {
  const geometry = new BoxGeometry(0.03, 0.012, 0.08);
  const position = geometry.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    if (z > 0) position.setY(i, position.getY(i) * 0.4);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The nigiri itself, from the slice on the board to the piece on the geta.
 * Rice hand = right, neta hand = left (swapped by CHEF_LEFT_HANDED):
 *  1 neta hand pinches the slice      2 rice hand dips in tezu (beat 1)
 *  3 rice hand reaches to the tub low on the right and comes back with rice
 *    (beat 2, judged)                 4 fist: the rice rounds
 *  5 index finger: wasabi dish, then the neta   6 palms together: rice on neta
 *  7 touch 1: fist (judged)           8 push the neta hand forward while the
 *    fingers curl: the piece rolls over, neta on top
 *  9 touch 2: pinch (judged)          10 pinch and turn the hand clockwise:
 *    the piece spins half a turn      11 touch 3: pinch (judged) - done
 *  12 pinch, carry over the case, let go on the geta (turn it while held)
 *  13 hold a fist over the geta: served and scored.
 * A ring around the piece shrinks to a target ring on every beat; the
 * timing of each touch gives Excellent / Good / Poor / Bad.
 */
export class NigiriSystem extends createSystem({}) {
  private entity!: Entity;
  private piece!: Group;
  private rice!: Mesh<SphereGeometry, MeshStandardMaterial>;
  private neta!: Mesh<BoxGeometry, MeshStandardMaterial>;
  private skin!: Mesh<BoxGeometry, MeshStandardMaterial>;
  private wasabiBlob!: Mesh<SphereGeometry, MeshStandardMaterial>;
  private beatRing!: Mesh<RingGeometry, MeshBasicMaterial>;
  private targetRing!: Mesh<RingGeometry, MeshBasicMaterial>;
  private judgeSprites = new Map<JudgeKind, Sprite>();
  private judgeTime = 0;
  private judgeShown: Sprite | null = null;
  private holdBar!: Mesh<BoxGeometry, MeshBasicMaterial>;

  private stage: Stage = NigiriStage.None;
  private hasNeta = false;
  private netaHeld = false;
  private hasRice = false;
  private fish: FishKind = Fish.Tuna;
  private skinRight = true;
  private cutAge = 0;
  private wasabi: 'none' | 'finger' | 'neta' = 'none';
  private judges: [JudgeKind, JudgeKind, JudgeKind, JudgeKind] = [Judge.None, Judge.None, Judge.None, Judge.None];
  private boardWasDirty = false;
  private phaseStart: number | null = null;
  private metronomeUntil = 0;
  private lastBeat = -1;
  private inTub = false;
  private flipHistory: Array<{ t: number; z: number; curl: number }> = [];
  private rotateStartYaw: number | null = null;
  private carryYawOffset = 0;
  private pieceYaw = 0;
  private holdTime = 0;
  private time = 0;
  private readonly netaOnBoard = new Vector3();
  private readonly focus = new Vector3();
  private readonly tmp = new Vector3();

  init(): void {
    this.entity = this.world.createTransformEntity();
    this.entity.object3D!.name = 'Nigiri';
    this.entity.addComponent(Nigiri, {});

    this.piece = new Group();
    this.piece.name = 'Piece';
    this.rice = new Mesh(
      new SphereGeometry(0.03, 16, 12),
      new MeshStandardMaterial({ color: '#F6F2EA', roughness: 0.9 }),
    );
    this.rice.name = 'Shari';
    this.neta = new Mesh(makeNetaGeometry(), new MeshStandardMaterial({ color: FISH_COLOR.Tuna, roughness: 0.5 }));
    this.neta.name = 'Neta';
    this.skin = new Mesh(
      new BoxGeometry(0.004, 0.003, 0.08),
      new MeshStandardMaterial({ color: '#4F5F73', roughness: 0.4, metalness: 0.3 }),
    );
    this.skin.name = 'NetaSkin';
    this.neta.add(this.skin);
    this.wasabiBlob = new Mesh(
      new SphereGeometry(0.008, 10, 8),
      new MeshStandardMaterial({ color: '#6B9E3A', roughness: 0.8 }),
    );
    this.wasabiBlob.name = 'WasabiDab';
    this.piece.add(this.rice, this.neta, this.wasabiBlob);
    this.world.createTransformEntity(this.piece);
    this.rice.visible = this.neta.visible = this.wasabiBlob.visible = false;

    this.beatRing = new Mesh(
      new RingGeometry(0.05, 0.058, 32),
      new MeshBasicMaterial({ color: '#8fd3ff', transparent: true, opacity: 0.9, depthTest: false }),
    );
    this.beatRing.name = 'BeatRing';
    this.beatRing.rotation.x = -Math.PI / 2;
    this.beatRing.renderOrder = 800;
    this.beatRing.visible = false;
    this.world.createTransformEntity(this.beatRing);
    this.targetRing = new Mesh(
      new RingGeometry(0.044, 0.05, 32),
      new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthTest: false }),
    );
    this.targetRing.name = 'TargetRing';
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.renderOrder = 800;
    this.targetRing.visible = false;
    this.world.createTransformEntity(this.targetRing);

    for (const judge of [Judge.Excellent, Judge.Good, Judge.Poor, Judge.Bad] as JudgeKind[]) {
      const color = judge === Judge.Excellent ? '#7CFC8C' : judge === Judge.Good ? '#8fd3ff' : judge === Judge.Poor ? '#F2D35B' : '#F2B134';
      const sprite = makeTextSprite(judge, { color, width: 0.14 });
      sprite.visible = false;
      this.world.createTransformEntity(sprite);
      this.judgeSprites.set(judge, sprite);
    }

    this.holdBar = new Mesh(new BoxGeometry(0.2, 0.012, 0.012), new MeshBasicMaterial({ color: COLOR_DONE }));
    this.holdBar.name = 'ServeHold';
    this.holdBar.visible = false;
    this.world.createTransformEntity(this.holdBar);

    pieceApi.hasNeta = () => this.hasNeta;
    pieceApi.cut = (fish, skinRight, at) => this.cut(fish, skinRight, at);
  }

  // ---- slice ------------------------------------------------------------

  private cut(fish: FishKind, skinRight: boolean, at: Vector3): void {
    this.fish = fish;
    this.skinRight = skinRight;
    this.hasNeta = true;
    this.netaHeld = false;
    this.cutAge = 0;
    this.netaOnBoard.copy(at);
    this.neta.material.color.set(FISH_COLOR[fish]);
    this.skin.visible = fish === Fish.Silver;
    this.skin.position.set(skinRight ? -0.013 : 0.013, 0.0075, 0);
    this.neta.visible = true;
    this.pieceYaw = 0;
    this.layout();
    this.entity.setValue(Nigiri, 'fish', fish);
    this.entity.setValue(Nigiri, 'hasNeta', true);
    this.entity.setValue(Nigiri, 'skinRight', skinRight);
    this.entity.setValue(Nigiri, 'cutAge', 0);
  }

  // ---- frame ------------------------------------------------------------

  update(delta: number): void {
    this.time += delta;
    const riceHand = hands.all[chef.riceSide];
    const netaHand = hands.all[chef.netaSide];
    const riceState = chef.hands[chef.riceSide];
    const netaState = chef.hands[chef.netaSide];

    // Freshness clock (paused while the chef faces the washing station).
    if (this.hasNeta && !chef.facingBack) {
      this.cutAge = (this.entity.getValue(Nigiri, 'cutAge') ?? 0) + delta;
      this.entity.setValue(Nigiri, 'cutAge', this.cutAge);
    }

    this.updateTezuAndRice(riceHand, riceState);
    if (this.hasNeta) {
      switch (this.stage) {
        case NigiriStage.None:
          this.updatePickNeta(netaHand, netaState);
          break;
        case NigiriStage.Neta:
        case NigiriStage.Rice:
          this.updateWasabi(riceHand);
          this.updateJoin(riceHand, netaHand);
          break;
        case NigiriStage.Joined:
          this.updateTouchFist(riceHand, netaHand, 1, NigiriStage.Touched1);
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
        case NigiriStage.Done:
          this.updatePickUp(riceHand);
          break;
        case NigiriStage.Carried:
          this.updateCarry(riceHand);
          break;
        case NigiriStage.Placed:
          this.updatePlaced(riceHand, delta);
          break;
      }
    }
    this.layout();
    this.updateRhythmVisuals(delta);
    this.updateHints();
    this.publish();
  }

  // ---- steps 2-4: tezu, rice ---------------------------------------------

  private updateTezuAndRice(hand: typeof hands.left, state: typeof chef.hands[0]): void {
    if (!hand.tracked && !this.inTub) return;
    if (!chef.open || chef.facingBack) return;
    const free = state.holding === Held.None;
    if (free && hand.tracked && hand.curl < 0.5 && overStation(hand.palm, StationKind.Tezu)) {
      if (!state.wet) {
        state.wet = true;
        this.startMetronome(3);
        feedback.flash(StationKind.Tezu, COLOR_DONE);
        coach.done('tezu');
        console.log('[Nigiri] tezu (beat 1)');
      }
    }
    // Reaching down to the rice tub on the right: by zone, or by leaving the camera's view there.
    const lowRight = hand.tracked && hand.palm.y < TUB_MAX_Y && hand.palm.x > TUB_MIN_X && hand.palm.z > TUB_MIN_Z;
    const inZone = hand.tracked && overStation(hand.palm, StationKind.RiceTub);
    if (free && !this.hasRice && !this.inTub && (inZone || lowRight || (!hand.tracked && this.lastLowRight))) {
      this.inTub = true;
      playRustle();
    }
    this.lastLowRight = lowRight;
    if (this.inTub && hand.tracked && hand.palm.y > COUNTER_Y && !lowRight && !inZone) {
      this.inTub = false;
      if (state.wet && free) {
        this.hasRice = true;
        state.holding = Held.Rice;
        this.rice.scale.copy(RICE_LOOSE);
        this.rice.visible = true;
        this.judges[0] = this.judge(0);
        this.entity.setValue(Nigiri, 'judgeRice', this.judges[0]);
        this.setStage(this.stage === NigiriStage.Neta ? NigiriStage.Rice : this.stage);
        coach.done('rice');
        console.log(`[Nigiri] rice taken (beat 2: ${this.judges[0]})`);
      } else {
        coach.nudge();
        console.log('[Nigiri] dry hand: no rice came back');
      }
    }
    // Fist with the rice: it rounds up.
    if (this.hasRice && this.stage !== NigiriStage.Joined && hand.fistStart && state.holding === Held.Rice) {
      this.rice.scale.copy(RICE_ROUND);
    }
  }
  private lastLowRight = false;

  // ---- step 1: pick the slice --------------------------------------------

  private updatePickNeta(hand: typeof hands.left, state: typeof chef.hands[0]): void {
    if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None) return;
    if (hand.grasp.distanceTo(this.netaOnBoard) > TOUCH_DISTANCE) return;
    this.netaHeld = true;
    state.holding = Held.Neta;
    this.setStage(this.hasRice ? NigiriStage.Rice : NigiriStage.Neta);
    coach.done('takeNeta');
    console.log('[Nigiri] neta on the palm');
  }

  // ---- step 5: wasabi -----------------------------------------------------

  private updateWasabi(riceHand: typeof hands.left): void {
    if (!riceHand.tracked) return;
    if (this.wasabi === 'none') {
      // The fingertip has to come down to the dish, not just pass over it.
      const dish = stations.get(StationKind.Wasabi);
      const low = !!dish && riceHand.indexTip.y < dish.pos.y + WASABI_TOUCH_HEIGHT;
      if (low && overStation(riceHand.indexTip, StationKind.Wasabi)) {
        this.wasabi = 'finger';
        this.wasabiBlob.visible = true;
        feedback.flash(StationKind.Wasabi, COLOR_DONE);
      }
    } else if (this.wasabi === 'finger') {
      this.neta.getWorldPosition(this.tmp);
      if (riceHand.indexTip.distanceTo(this.tmp) < WASABI_DAB_DISTANCE) {
        this.wasabi = 'neta';
        this.entity.setValue(Nigiri, 'wasabi', true);
        coach.done('wasabi');
        console.log('[Nigiri] wasabi on the neta');
      }
    }
  }

  // ---- step 6: join -------------------------------------------------------

  private updateJoin(riceHand: typeof hands.left, netaHand: typeof hands.left): void {
    if (!this.hasRice || !this.netaHeld) return;
    if (!riceHand.tracked || !netaHand.tracked || riceHand.fist) return;
    if (riceHand.palm.distanceTo(netaHand.palm) > JOIN_DISTANCE) return;
    chef.hands[chef.riceSide].holding = Held.None;
    this.wasabiBlob.visible = false;
    this.boardWasDirty = chef.boardDirt >= 1;
    chef.boardDirt = Math.min(1, chef.boardDirt + BOARD_DIRT_PER_NIGIRI);
    this.startMetronome(60);
    this.setStage(NigiriStage.Joined);
    coach.done('join');
    console.log('[Nigiri] rice on the neta');
  }

  // ---- steps 7, 9, 11: timed touches --------------------------------------

  private updateTouchFist(riceHand: typeof hands.left, netaHand: typeof hands.left, n: 1 | 2 | 3, next: Stage): void {
    if (!riceHand.tracked || !riceHand.fistStart) return;
    if (netaHand.tracked && riceHand.palm.distanceTo(netaHand.palm) > JOIN_DISTANCE + 0.06) return;
    this.touch(n, next);
  }

  private updateTouchPinch(riceHand: typeof hands.left, n: 1 | 2 | 3, next: Stage): void {
    if (!riceHand.tracked || !riceHand.pinchStart) return;
    this.piece.getWorldPosition(this.tmp);
    if (riceHand.grasp.distanceTo(this.tmp) > TOUCH_DISTANCE) return;
    this.touch(n, next);
    if (next === NigiriStage.Done) this.rotateStartYaw = null;
  }

  private touch(n: 1 | 2 | 3, next: Stage): void {
    const judge = this.judge(n);
    this.judges[n] = judge;
    this.entity.setValue(Nigiri, `judge${n}` as 'judge1' | 'judge2' | 'judge3', judge);
    if (n === 1) this.rice.scale.copy(RICE_SHAPED);
    this.setStage(next);
    coach.done(n === 1 ? 'touch1' : n === 2 ? 'touch2' : 'touch3');
    console.log(`[Nigiri] touch ${n}: ${judge}`);
  }

  // ---- step 8: roll it over ----------------------------------------------

  private updateFlip(netaHand: typeof hands.left): void {
    if (!netaHand.tracked) return;
    const h = this.flipHistory;
    h.push({ t: this.time, z: netaHand.palm.z, curl: netaHand.curl });
    while (h.length && h[0].t < this.time - FLIP_WINDOW_SECONDS) h.shift();
    if (h.length < 2) return;
    // Forward is -Z when facing the bar: the palm z decreases while the fingers curl more.
    let maxZ = -Infinity;
    let minCurl = Infinity;
    for (const s of h) {
      if (s.z > maxZ) maxZ = s.z;
      if (s.curl < minCurl) minCurl = s.curl;
    }
    const pushed = maxZ - netaHand.palm.z >= FLIP_PUSH_DISTANCE;
    const curled = netaHand.curl - minCurl >= FLIP_CURL_DELTA && !netaHand.fist;
    if (pushed && curled) {
      this.flipHistory.length = 0;
      this.setStage(NigiriStage.Flipped);
      coach.done('flip');
      console.log('[Nigiri] rolled over: neta on top');
    }
  }

  // ---- step 10: half turn -------------------------------------------------

  private updateRotate(riceHand: typeof hands.left): void {
    if (!riceHand.tracked || !riceHand.pinch) {
      this.rotateStartYaw = null;
      return;
    }
    this.piece.getWorldPosition(this.tmp);
    if (riceHand.grasp.distanceTo(this.tmp) > TOUCH_DISTANCE * 1.5) {
      this.rotateStartYaw = null;
      return;
    }
    if (this.rotateStartYaw === null) {
      this.rotateStartYaw = riceHand.yawDeg;
      return;
    }
    // Clockwise seen from above = heading decreases.
    const turned = this.angleDelta(riceHand.yawDeg, this.rotateStartYaw);
    if (turned <= -ROTATE_DEG) {
      this.pieceYaw += 180;
      this.rotateStartYaw = null;
      this.setStage(NigiriStage.Rotated);
      coach.done('rotate');
      console.log('[Nigiri] turned half round');
    }
  }

  // ---- steps 12-13: carry, place, serve -----------------------------------

  private updatePickUp(riceHand: typeof hands.left): void {
    if (!riceHand.tracked || !riceHand.pinchStart) return;
    this.piece.getWorldPosition(this.tmp);
    if (riceHand.grasp.distanceTo(this.tmp) > TOUCH_DISTANCE) return;
    this.carryYawOffset = this.pieceYaw - riceHand.yawDeg;
    chef.hands[chef.riceSide].holding = Held.Sushi;
    if (this.netaHeld) {
      this.netaHeld = false;
      chef.hands[chef.netaSide].holding = Held.None;
    }
    this.setStage(NigiriStage.Carried);
  }

  private updateCarry(riceHand: typeof hands.left): void {
    if (riceHand.tracked) this.pieceYaw = riceHand.yawDeg + this.carryYawOffset;
    if (!riceHand.pinchEnd && riceHand.tracked) return;
    chef.hands[chef.riceSide].holding = Held.None;
    if (overStation(riceHand.grasp, StationKind.Geta)) {
      this.setStage(NigiriStage.Placed);
      feedback.flash(StationKind.Geta, COLOR_DONE);
      coach.done('place');
      console.log(`[Nigiri] on the geta, heading ${this.normYaw(this.pieceYaw).toFixed(0)} deg`);
    } else {
      // Dropped elsewhere: back onto the neta hand.
      this.netaHeld = true;
      chef.hands[chef.netaSide].holding = Held.Neta;
      this.setStage(NigiriStage.Done);
    }
  }

  private updatePlaced(riceHand: typeof hands.left, delta: number): void {
    this.updatePickUp(riceHand);
    if (this.stage !== NigiriStage.Placed) return;
    let confirming = false;
    for (const hand of hands.all) {
      if (hand.tracked && hand.fist && overStation(hand.palm, StationKind.Geta)) confirming = true;
    }
    this.holdTime = confirming ? this.holdTime + delta : 0;
    if (this.holdTime >= SERVE_HOLD_SECONDS) {
      this.holdTime = 0;
      this.serve();
    }
  }

  private serve(): void {
    const order = service.order;
    const yaw = this.normYaw(this.pieceYaw);
    const first = !service.customerHandKnown;
    let angleOk: boolean;
    let headOk = true;
    if (first) {
      // Straight across the geta: the long axis runs left-right.
      angleOk = Math.abs(this.lineDiff(yaw, 90)) <= ORIENTATION_TOLERANCE_DEG;
    } else {
      const expected = service.customerLeftHanded ? -DIAGONAL_DEG : DIAGONAL_DEG;
      angleOk = Math.abs(this.lineDiff(yaw, expected)) <= ORIENTATION_TOLERANCE_DEG;
      headOk = Math.cos((yaw * Math.PI) / 180) > 0;
    }
    const result: PieceResult = {
      judges: [...this.judges] as PieceResult['judges'],
      fishOk: !!order && order.fish === this.fish,
      wasabiOk: !!order && order.wasabi === (this.wasabi === 'neta'),
      headOk,
      angleOk,
      skinOk: this.fish !== Fish.Silver || this.skinRight,
      hospitalityOk: angleOk,
      freshness:
        this.cutAge <= FRESH_SECONDS ? 1 : Math.max(0, 1 - (this.cutAge - FRESH_SECONDS) / (STALE_SECONDS - FRESH_SECONDS)),
      handsDirty: chef.hands[0].needsWash || chef.hands[1].needsWash,
      boardDirty: this.boardWasDirty,
      soapDuringService: chef.soapDuringService,
      knifeUnwiped: chef.knifeUnwiped,
    };
    chef.soapDuringService = false;
    chef.knifeUnwiped = false;
    const score = scorePiece(result);
    this.entity.setValue(Nigiri, 'wrongFish', !result.fishOk);
    this.entity.setValue(Nigiri, 'boardWasDirty', result.boardDirty);
    this.entity.setValue(Nigiri, 'knifeUnwiped', result.knifeUnwiped);
    this.entity.setValue(Nigiri, 'soapDuringService', result.soapDuringService);

    // Hand a copy of the piece to the customer; it disappears when taken.
    const served = this.piece.clone();
    served.name = 'ServedPiece';
    this.world.createTransformEntity(served);
    customerApi.serve(score, served);

    addPieceDirt();
    chef.hands[chef.riceSide].wet = false;
    this.resetPiece();
    feedback.flash(StationKind.Geta, COLOR_DONE);
    coach.done('serve');
    coach.served(score.grade as Grade);
    console.log(`[Nigiri] served: ${score.grade} ${score.score}`);
  }

  private resetPiece(): void {
    this.hasNeta = this.netaHeld = this.hasRice = false;
    this.wasabi = 'none';
    this.judges = [Judge.None, Judge.None, Judge.None, Judge.None];
    this.boardWasDirty = false;
    this.pieceYaw = 0;
    this.cutAge = 0;
    this.rice.visible = this.neta.visible = this.wasabiBlob.visible = false;
    this.rice.scale.copy(RICE_LOOSE);
    this.flipHistory.length = 0;
    this.rotateStartYaw = null;
    this.metronomeUntil = 0;
    this.phaseStart = null;
    const e = this.entity;
    e.setValue(Nigiri, 'hasNeta', false);
    e.setValue(Nigiri, 'cutAge', 0);
    e.setValue(Nigiri, 'wasabi', false);
    e.setValue(Nigiri, 'judgeRice', Judge.None);
    e.setValue(Nigiri, 'judge1', Judge.None);
    e.setValue(Nigiri, 'judge2', Judge.None);
    e.setValue(Nigiri, 'judge3', Judge.None);
    e.setValue(Nigiri, 'knifeUnwiped', false);
    e.setValue(Nigiri, 'wrongFish', false);
    e.setValue(Nigiri, 'boardWasDirty', false);
    e.setValue(Nigiri, 'soapDuringService', false);
    this.setStage(NigiriStage.None);
  }

  // ---- rhythm -------------------------------------------------------------

  private startMetronome(beats: number): void {
    this.phaseStart = performance.now();
    this.metronomeUntil = this.phaseStart + beats * TEMPO_MS;
    this.lastBeat = 0;
  }

  private judge(slot: 0 | 1 | 2 | 3): JudgeKind {
    if (this.phaseStart === null) return Judge.Bad;
    const offset = (performance.now() - this.phaseStart) % TEMPO_MS;
    const d = Math.min(offset, TEMPO_MS - offset);
    const judge = d <= JUDGE_EXCELLENT_MS ? Judge.Excellent : d <= JUDGE_GOOD_MS ? Judge.Good : d <= JUDGE_POOR_MS ? Judge.Poor : Judge.Bad;
    this.showJudge(judge, slot);
    playTone(judge === Judge.Excellent ? 1320 : judge === Judge.Good ? 990 : judge === Judge.Poor ? 660 : 330, 0.12, 0.12);
    return judge;
  }

  private showJudge(judge: JudgeKind, slot: number): void {
    if (this.judgeShown) this.judgeShown.visible = false;
    const sprite = this.judgeSprites.get(judge) ?? null;
    this.judgeShown = sprite;
    this.judgeTime = JUDGE_TEXT_SECONDS;
    if (sprite) {
      sprite.visible = true;
      sprite.position.copy(slot === 0 ? hands.all[chef.riceSide].palm : this.focus);
      sprite.position.y += 0.08;
    }
  }

  private updateRhythmVisuals(delta: number): void {
    const now = performance.now();
    const active = this.phaseStart !== null && now < this.metronomeUntil;
    this.beatRing.visible = this.targetRing.visible = active;
    if (active) {
      const elapsed = now - this.phaseStart!;
      const beat = Math.floor(elapsed / TEMPO_MS);
      if (beat !== this.lastBeat) {
        this.lastBeat = beat;
        playTone(880, 0.04, 0.05);
      }
      const k = (elapsed % TEMPO_MS) / TEMPO_MS;
      const at = this.stage === NigiriStage.None || this.stage === NigiriStage.Neta || this.stage === NigiriStage.Rice
        ? hands.all[chef.riceSide].palm
        : this.focus;
      this.beatRing.position.copy(at);
      this.beatRing.position.y += 0.02;
      this.beatRing.scale.setScalar(1 + 1.4 * (1 - k));
      this.targetRing.position.copy(this.beatRing.position);
    }
    if (this.judgeShown) {
      this.judgeTime -= delta;
      this.judgeShown.position.y += delta * 0.06;
      if (this.judgeTime <= 0) {
        this.judgeShown.visible = false;
        this.judgeShown = null;
      }
    }
    const hold = this.stage === NigiriStage.Placed ? Math.min(1, this.holdTime / SERVE_HOLD_SECONDS) : 0;
    this.holdBar.visible = hold > 0;
    if (hold > 0) {
      const geta = stations.get(StationKind.Geta)!;
      this.holdBar.position.set(geta.pos.x, geta.pos.y + 0.12, geta.pos.z);
      this.holdBar.scale.x = Math.max(0.01, hold);
    }
  }

  // ---- layout -------------------------------------------------------------

  /** Where the rice, the neta and the wasabi sit this frame. */
  private layout(): void {
    const riceHand = hands.all[chef.riceSide];
    const netaHand = hands.all[chef.netaSide];
    const flipped =
      this.stage === NigiriStage.Flipped || this.stage === NigiriStage.Touched2 || this.stage === NigiriStage.Rotated ||
      this.stage === NigiriStage.Done || this.stage === NigiriStage.Carried || this.stage === NigiriStage.Placed;
    const joined = flipped || this.stage === NigiriStage.Joined || this.stage === NigiriStage.Touched1;

    // Piece anchor.
    if (this.stage === NigiriStage.Carried) {
      this.piece.position.copy(riceHand.grasp);
    } else if (this.stage === NigiriStage.Placed) {
      const geta = stations.get(StationKind.Geta)!;
      this.piece.position.set(geta.pos.x, geta.pos.y + 0.004, geta.pos.z);
    } else if (this.netaHeld) {
      this.piece.position.copy(netaHand.palm);
      this.piece.position.y += 0.01;
    } else if (this.hasNeta) {
      this.piece.position.copy(this.netaOnBoard);
    }
    this.piece.rotation.y = (this.pieceYaw * Math.PI) / 180;
    this.piece.getWorldPosition(this.focus);

    if (joined) {
      if (flipped) {
        this.rice.position.set(0, 0.014, 0);
        this.neta.position.set(0, 0.034, 0);
      } else {
        this.neta.position.set(0, 0.006, 0);
        this.rice.position.set(0, 0.034, 0);
      }
    } else {
      this.neta.position.set(0, 0.006, 0);
      if (this.hasRice) {
        // Rice on its own palm: shown in world space, outside the piece group.
        this.piece.worldToLocal(this.rice.position.copy(riceHand.palm).add(this.tmp.set(0, 0.025, 0)));
      }
      if (this.wasabi === 'finger') {
        this.piece.worldToLocal(this.wasabiBlob.position.copy(riceHand.indexTip));
      } else if (this.wasabi === 'neta') {
        this.wasabiBlob.position.set(0, 0.016, -0.01);
      }
    }
  }

  // ---- helpers ------------------------------------------------------------

  private setStage(stage: Stage): void {
    if (stage === this.stage) return;
    this.stage = stage;
    this.entity.setValue(Nigiri, 'stage', stage);
    this.entity.setValue(Nigiri, 'yawDeg', this.normYaw(this.pieceYaw));
  }

  private normYaw(deg: number): number {
    let d = deg % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
  }

  private angleDelta(a: number, b: number): number {
    return this.normYaw(a - b);
  }

  /** Difference between two headings as lines (direction ignored), -90..90. */
  private lineDiff(a: number, b: number): number {
    let d = (a - b) % 180;
    if (d > 90) d -= 180;
    if (d < -90) d += 180;
    return d;
  }

  private updateHints(): void {
    if (!chef.open) return;
    const riceState = chef.hands[chef.riceSide];
    switch (this.stage) {
      case NigiriStage.None:
        if (this.hasNeta) feedback.hints.add(StationKind.CuttingBoard);
        break;
      case NigiriStage.Neta:
      case NigiriStage.Rice:
        if (!this.hasRice) feedback.hints.add(riceState.wet ? StationKind.RiceTub : StationKind.Tezu);
        else if (service.order?.wasabi && this.wasabi === 'none') feedback.hints.add(StationKind.Wasabi);
        break;
      case NigiriStage.Done:
      case NigiriStage.Carried:
      case NigiriStage.Placed:
        feedback.hints.add(StationKind.Geta);
        break;
    }
  }

  /** Share the piece's progress, for the master. */
  private publish(): void {
    progress.stage = this.stage;
    progress.hasNeta = this.hasNeta;
    progress.netaHeld = this.netaHeld;
    progress.hasRice = this.hasRice;
    progress.wasabi = this.wasabi;
    progress.beatOrigin = this.phaseStart ?? 0;
    progress.sliceAt.copy(this.netaOnBoard);
    progress.pieceAt.copy(this.focus);
  }

  /** For the debug panel. */
  describe(): string {
    const j = this.judges.map((x) => (x === Judge.None ? '-' : x[0])).join('');
    return `Piece: ${this.stage} fish=${this.hasNeta ? this.fish : '-'} rice=${this.hasRice ? 'y' : 'n'} wasabi=${this.wasabi} judges=${j} age=${this.cutAge.toFixed(0)}s yaw=${this.normYaw(this.pieceYaw).toFixed(0)}`;
  }
}
