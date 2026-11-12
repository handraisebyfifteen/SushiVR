import {
  BoxGeometry,
  createSystem,
  type Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  type Material,
  type Sprite,
  Vector3,
} from '@iwsdk/core';
import { GunkanAssembly } from './assembly/gunkan.js';
import { InariAssembly } from './assembly/inari.js';
import { MakiAssembly } from './assembly/maki.js';
import { NigiriAssembly } from './assembly/nigiri.js';
import { type Assembly, normYaw, type PieceCore } from './assembly/types.js';
import { coach, type Grade } from './coach.js';
import { customerApi } from './customer-system.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { canTakeRice } from './pantry.js';
import { chef, type JudgeKind, prep, progress, service, shari } from './game-state.js';
import type { HandReader } from './hand-reader.js';
import { sideSign } from './handedness.js';
import { hands } from './hands.js';
import { addPieceDirt } from './hygiene-system.js';
import type { NetaId, PieceKind } from './menu.js';
import { type PieceResult, scorePiece } from './scoring.js';
import { playRustle, playTone } from './sfx.js';
import { overStation, stations } from './station-system.js';
import { Held, Judge, NigiriStage, Piece, PieceKindValue, StationKind } from './sushi-components.js';
import { makeNetaMaterial, NetaPattern, restMaterial } from './scene-assets/lib/neta-material.js';
import { ownPieceGeometry, Shari, SHARI_HALF_LENGTH, SHARI_HALF_WIDTH, SHARI_HEIGHT } from './scene-assets/lib/nigiri-form.js';
import { makeTextSprite } from './text-sprites.js';
import {
  FRESH_SECONDS,
  JUDGE_EXCELLENT_MS,
  JUDGE_GOOD_MS,
  JUDGE_POOR_MS,
  SERVE_HOLD_SECONDS,
  STALE_SECONDS,
  TEMPO_MS,
  TOUCH_DISTANCE,
} from './tuning.js';

const WASABI_DAB_DISTANCE = 0.05;
const WASABI_TOUCH_HEIGHT = 0.035;
const JUDGE_TEXT_SECONDS = 0.8;
/** The rice hand counts as "gone to the tub" when it drops below the counter on its own side (the right; a left-handed chef's left), beside the body. */
const TUB_MAX_Y = 0.65;
const TUB_MIN_X = 0.25;
const TUB_MIN_Z = -0.15;
const COUNTER_Y = 0.72;
/** How fast the shari takes its next shape when pressed (stages per second: a touch shows in about 0.2 s). */
const SHAPE_RATE = 5;
/** Shari: packed grains of slightly warm white rice. */
const SHARI_MATERIAL = restMaterial(makeNetaMaterial('shari', NetaPattern.Shari, '#F4F0E7', '#DCD2BF', [SHARI_HALF_LENGTH * 2, SHARI_HEIGHT, SHARI_HALF_WIDTH * 2], 0.7, 0.3));

/** Let the cutting system start a nigiri without importing this class. */
export const pieceApi = {
  /** A piece is in progress (a slice exists, a gunkan is being made...): nothing else can start. */
  hasNeta: (): boolean => false,
  /** A saku may be taken up and sliced now: no piece in progress, or a roll waiting for its core (the tekka's tuna). */
  sliceWanted: (): boolean => true,
  /** A slice was cut from a saku and lies on the board at `at` (a nigiri's topping, or a waiting roll's core). */
  cut: (_neta: NetaId, _skinRight: boolean, _at: Vector3): void => undefined,
  /** A ready-cut piece was taken from the case straight onto the neta hand. */
  take: (_neta: NetaId): void => undefined,
  /** An inari pouch was taken from the case onto the neta hand; false if another piece is in progress. */
  takeAge: (): boolean => false,
};

/**
 * The piece being made, whatever its kind, and what all kinds share:
 *  - the rice hand dips in the tezu (beat 1), reaches down to the rice tub
 *    on the right and comes back up with rice (beat 2, judged); a fist
 *    rounds it;
 *  - wasabi with the index finger (where it goes is the kind's);
 *  - a ring shrinks to a target ring on every beat, and each timed touch is
 *    judged Excellent / Good / Poor / Bad;
 *  - once done: pinch, carry over the case, let go on the geta (turning the
 *    hand turns the piece), hold a fist over the geta to serve; scored.
 * Each kind (src/assembly/) builds the piece up to Done: NigiriAssembly
 * (slice, join, three touches, roll over, half turn), GunkanAssembly
 * (nori strip, wrap, topping on), InariAssembly (pouch, fill, fold shut)
 * and MakiAssembly (nori on the mat, spread, fillings, roll, squeeze, cut).
 * The first ingredient decides the kind: a cut or taken slice makes a
 * nigiri, a nori strip a gunkan, a pouch an inari, a half sheet a roll.
 */
export class PieceSystem extends createSystem({}) implements PieceCore {
  entity!: Entity;
  piece!: Group;
  rice!: Mesh<Shari['geometry'], Material>;
  readonly shari = new Shari();
  shariLevel = 0;
  wasabiBlob!: Mesh<SphereGeometry, MeshStandardMaterial>;
  readonly focus = new Vector3();
  readonly netaOnBoard = new Vector3();
  kind: PieceKind | null = null;
  stage: string = NigiriStage.None;
  netaId: NetaId = 'LeanTuna';
  hasNeta = false;
  netaHeld = false;
  hasRice = false;
  wasabi: 'none' | 'finger' | 'neta' = 'none';
  readonly judges: JudgeKind[] = [Judge.None, Judge.None, Judge.None, Judge.None];
  cutAge = 0;
  skinRight = true;
  pieceYaw = 0;
  boardWasDirty = false;

  private nigiri!: NigiriAssembly;
  private gunkan!: GunkanAssembly;
  private inari!: InariAssembly;
  private maki!: MakiAssembly;
  private beatRing!: Mesh<RingGeometry, MeshBasicMaterial>;
  private targetRing!: Mesh<RingGeometry, MeshBasicMaterial>;
  private judgeSprites = new Map<JudgeKind, Sprite>();
  private judgeTime = 0;
  private judgeShown: Sprite | null = null;
  private holdBar!: Mesh<BoxGeometry, MeshBasicMaterial>;
  private phaseStart: number | null = null;
  private metronomeUntil = 0;
  private lastBeat = -1;
  private inTub = false;
  private toldEmpty = false;
  private lastLowRight = false;
  private carryYawOffset = 0;
  private holdTime = 0;
  private readonly tmp = new Vector3();

  private get active(): Assembly | null {
    switch (this.kind) {
      case 'nigiri':
        return this.nigiri;
      case 'gunkan':
        return this.gunkan;
      case 'inari':
        return this.inari;
      case 'maki':
        return this.maki;
      default:
        return null;
    }
  }

  init(): void {
    this.entity = this.world.createTransformEntity();
    this.entity.object3D!.name = 'Piece';
    this.entity.addComponent(Piece, {});

    this.piece = new Group();
    this.piece.name = 'Piece';
    this.rice = new Mesh(this.shari.geometry, SHARI_MATERIAL);
    this.rice.name = 'Shari';
    // Yaw to lie along the neta, then (before the roll-over) upside down about its length.
    this.rice.rotation.order = 'YXZ';
    this.wasabiBlob = new Mesh(new SphereGeometry(0.008, 10, 8), new MeshStandardMaterial({ color: '#6B9E3A', roughness: 0.8 }));
    this.wasabiBlob.name = 'WasabiDab';
    this.piece.add(this.rice, this.wasabiBlob);
    this.world.createTransformEntity(this.piece);
    this.rice.visible = this.wasabiBlob.visible = false;

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

    this.nigiri = new NigiriAssembly(this);
    this.gunkan = new GunkanAssembly(this, this.world);
    this.inari = new InariAssembly(this);
    this.maki = new MakiAssembly(this, this.world);

    pieceApi.hasNeta = () => this.kind !== null;
    pieceApi.sliceWanted = () => this.kind === null || (this.kind === 'maki' && this.maki.wantsCore());
    pieceApi.cut = (neta, skinRight, at) => (this.kind === 'maki' ? this.maki.coreCut(neta, at) : this.nigiri.cut(neta, skinRight, at));
    pieceApi.take = (neta) => this.nigiri.take(neta);
    pieceApi.takeAge = () => this.inari.take();
  }

  /** Claims the piece for a kind; false if another kind is already in progress. */
  begin(kind: PieceKind): boolean {
    if (this.kind && this.kind !== kind) return false;
    this.kind = kind;
    this.entity.setValue(Piece, 'kind', kind);
    return true;
  }

  update(delta: number): void {
    const riceHand = hands.all[chef.riceSide];
    const riceState = chef.hands[chef.riceSide];
    // The shari takes the shape it is being pressed toward (a short ease, not a jump).
    const at = this.shari.stage;
    if (Math.abs(at - this.shariLevel) > 1e-4) {
      const step = SHAPE_RATE * delta;
      this.shari.shape(at < this.shariLevel ? Math.min(this.shariLevel, at + step) : Math.max(this.shariLevel, at - step));
    }

    // Freshness clock (paused while the chef faces the washing station).
    if (this.hasNeta && !chef.facingBack) {
      this.cutAge = (this.entity.getValue(Piece, 'cutAge') ?? 0) + delta;
      this.entity.setValue(Piece, 'cutAge', this.cutAge);
    }

    this.updateTezuAndRice(riceHand, riceState);
    const active = this.active;
    if (!active) {
      // No piece yet: a nori strip starts a gunkan, a half sheet on the mat a
      // roll (a slice or a pouch comes through pieceApi).
      this.gunkan.update(delta);
      this.maki.update(delta);
    } else if (this.stage === NigiriStage.Done) {
      this.updatePickUp(riceHand);
    } else if (this.stage === NigiriStage.Carried) {
      this.updateCarry(riceHand);
    } else if (this.stage === NigiriStage.Placed) {
      this.updatePlaced(riceHand, delta);
    } else {
      active.update(delta);
    }
    this.layout();
    this.updateRhythmVisuals(delta);
    this.updateHints();
    this.publish();
  }

  // ---- tezu and rice -------------------------------------------------------

  private updateTezuAndRice(hand: HandReader, state: (typeof chef.hands)[0]): void {
    if (!hand.tracked && !this.inTub) return;
    if (!chef.open || chef.facingBack) return;
    const free = state.holding === Held.None;
    if (free && hand.tracked && hand.curl < 0.5 && overStation(hand.palm, StationKind.Tezu)) {
      if (!state.wet) {
        state.wet = true;
        this.startMetronome(3);
        feedback.flash(StationKind.Tezu, COLOR_DONE);
        coach.done('tezu');
        console.log('[Piece] tezu (beat 1)');
      }
    }
    // Reaching down to the rice tub on the rice hand's side: by zone, or by leaving the camera's view there.
    const lowRight = hand.tracked && hand.palm.y < TUB_MAX_Y && hand.palm.x * sideSign() > TUB_MIN_X && hand.palm.z > TUB_MIN_Z;
    const inZone = hand.tracked && overStation(hand.palm, StationKind.RiceTub);
    // On full the ohitsu can run out (src/pantry.ts): an empty one gives nothing; nor one fetched off its stand for a batch in service (src/shari-system.ts).
    const tubHome = shari.inTub || (!prep.active && shari.step === 'done');
    const riceIn = tubHome && canTakeRice();
    if (!riceIn && free && !this.hasRice && inZone && !this.toldEmpty && tubHome) {
      this.toldEmpty = true;
      feedback.flash(StationKind.RiceTub, COLOR_WARN);
      console.log('[Piece] the ohitsu is empty: no rice');
    }
    if (riceIn) this.toldEmpty = false;
    if (riceIn && free && !this.hasRice && !this.inTub && (inZone || lowRight || (!hand.tracked && this.lastLowRight))) {
      this.inTub = true;
      playRustle();
    }
    this.lastLowRight = lowRight;
    if (this.inTub && hand.tracked && hand.palm.y > COUNTER_Y && !lowRight && !inZone) {
      this.inTub = false;
      if (state.wet && free) {
        this.hasRice = true;
        state.holding = Held.Rice;
        // A new loose lump from the tub.
        this.rice.scale.set(1, 1, 1);
        this.rice.rotation.set(0, 0, 0);
        this.shari.reseed(1 + Math.random() * 6);
        this.shariLevel = 0;
        this.shari.shape(0);
        this.rice.visible = true;
        this.judges[0] = this.judge(0);
        this.entity.setValue(Piece, 'judgeRice', this.judges[0]);
        if (this.stage === NigiriStage.Neta) this.setStage(NigiriStage.Rice);
        coach.done('rice');
        console.log(`[Piece] rice taken (beat 2: ${this.judges[0]})`);
      } else {
        coach.nudge();
        console.log('[Piece] dry hand: no rice came back');
      }
    }
    // Fist with the rice still on the rice hand: it rounds up.
    if (this.hasRice && hand.fistStart && state.holding === Held.Rice) this.shariLevel = Math.max(this.shariLevel, 1);
  }

  updateWasabi(riceHand: HandReader, canTake: boolean): void {
    if (!riceHand.tracked) return;
    if (this.wasabi === 'none') {
      // The index finger comes down to the dish (passing high over it does not count).
      if (!canTake) return;
      const dish = stations.get(StationKind.Wasabi);
      const low = !!dish && riceHand.indexTip.y < dish.pos.y + WASABI_TOUCH_HEIGHT;
      if (low && overStation(riceHand.indexTip, StationKind.Wasabi)) {
        this.wasabi = 'finger';
        this.wasabiBlob.visible = true;
        feedback.flash(StationKind.Wasabi, COLOR_DONE);
      }
    } else if (this.wasabi === 'finger') {
      if (this.active?.wasabiTarget(this.tmp) && riceHand.indexTip.distanceTo(this.tmp) < WASABI_DAB_DISTANCE) {
        this.wasabi = 'neta';
        this.entity.setValue(Piece, 'wasabi', true);
        coach.done('wasabi');
        console.log('[Piece] wasabi on');
      }
    }
  }

  // ---- carry, place, serve ------------------------------------------------

  private updatePickUp(riceHand: HandReader): void {
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

  private updateCarry(riceHand: HandReader): void {
    if (riceHand.tracked) this.pieceYaw = riceHand.yawDeg + this.carryYawOffset;
    if (!riceHand.pinchEnd && riceHand.tracked) return;
    chef.hands[chef.riceSide].holding = Held.None;
    if (overStation(riceHand.grasp, StationKind.Geta)) {
      this.setStage(NigiriStage.Placed);
      feedback.flash(StationKind.Geta, COLOR_DONE);
      coach.done('place');
      console.log(`[Piece] on the geta, heading ${normYaw(this.pieceYaw).toFixed(0)} deg`);
    } else {
      // Dropped elsewhere: back onto the neta hand.
      this.netaHeld = true;
      chef.hands[chef.netaSide].holding = Held.Neta;
      this.setStage(NigiriStage.Done);
    }
  }

  private updatePlaced(riceHand: HandReader, delta: number): void {
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
    const active = this.active!;
    const order = service.order;
    const result: PieceResult = {
      judges: this.judges.slice(0, active.judgeSlots),
      itemOk: false,
      served: null,
      wasabiOk: !!order && order.wasabi === (this.wasabi === 'neta'),
      headOk: true,
      angleOk: true,
      skinOk: true,
      hospitalityOk: true,
      freshness:
        this.cutAge <= FRESH_SECONDS ? 1 : Math.max(0, 1 - (this.cutAge - FRESH_SECONDS) / (STALE_SECONDS - FRESH_SECONDS)),
      handsDirty: chef.hands[0].needsWash || chef.hands[1].needsWash,
      boardDirty: this.boardWasDirty,
      soapDuringService: chef.soapDuringService,
      knifeUnwiped: chef.knifeUnwiped,
      knifeDull: chef.knifeDull,
    };
    active.score(result);
    chef.soapDuringService = false;
    chef.knifeUnwiped = false;
    chef.knifeDull = false;
    const score = scorePiece(result);
    this.entity.setValue(Piece, 'wrongItem', !result.itemOk);
    this.entity.setValue(Piece, 'boardWasDirty', result.boardDirty);
    this.entity.setValue(Piece, 'knifeUnwiped', result.knifeUnwiped);
    this.entity.setValue(Piece, 'soapDuringService', result.soapDuringService);

    // Hand a copy of the piece to the customer; it disappears when taken.
    const served = this.piece.clone();
    served.name = 'ServedPiece';
    // The working shari and neta are reshaped for the next piece: the served one keeps its own.
    ownPieceGeometry(served);
    const item = result.itemOk && order ? (result.served ?? order.item) : null;
    customerApi.serve(score, this.world.createTransformEntity(served), item);

    addPieceDirt();
    chef.hands[chef.riceSide].wet = false;
    this.resetPiece();
    feedback.flash(StationKind.Geta, COLOR_DONE);
    coach.done('serve');
    coach.served(score.grade as Grade);
    console.log(`[Piece] served: ${score.grade} ${score.score}`);
  }

  private resetPiece(): void {
    this.hasNeta = this.netaHeld = this.hasRice = false;
    this.wasabi = 'none';
    this.judges.fill(Judge.None);
    this.boardWasDirty = false;
    this.pieceYaw = 0;
    this.cutAge = 0;
    this.rice.visible = this.wasabiBlob.visible = false;
    this.rice.scale.set(1, 1, 1);
    this.rice.rotation.set(0, 0, 0);
    this.shariLevel = 0;
    this.shari.shape(0);
    this.metronomeUntil = 0;
    this.phaseStart = null;
    this.nigiri.reset();
    this.gunkan.reset();
    this.inari.reset();
    this.maki.reset();
    this.kind = null;
    const e = this.entity;
    e.setValue(Piece, 'kind', PieceKindValue.None);
    e.setValue(Piece, 'hasNeta', false);
    e.setValue(Piece, 'cutAge', 0);
    e.setValue(Piece, 'wasabi', false);
    e.setValue(Piece, 'judgeRice', Judge.None);
    e.setValue(Piece, 'judge1', Judge.None);
    e.setValue(Piece, 'judge2', Judge.None);
    e.setValue(Piece, 'judge3', Judge.None);
    e.setValue(Piece, 'knifeUnwiped', false);
    e.setValue(Piece, 'wrongItem', false);
    e.setValue(Piece, 'boardWasDirty', false);
    e.setValue(Piece, 'soapDuringService', false);
    this.setStage(NigiriStage.None);
  }

  // ---- rhythm -------------------------------------------------------------

  startMetronome(beats: number): void {
    this.phaseStart = performance.now();
    this.metronomeUntil = this.phaseStart + beats * TEMPO_MS;
    this.lastBeat = 0;
  }

  judge(slot: number): JudgeKind {
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
      const onHand = !this.active || this.active.ringOnHand();
      this.beatRing.position.copy(onHand ? hands.all[chef.riceSide].palm : this.focus);
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

  /** Where the piece is this frame; the kind places its own parts, the rice follows the rice hand until it is on. */
  private layout(): void {
    const riceHand = hands.all[chef.riceSide];
    const netaHand = hands.all[chef.netaSide];
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
    this.piece.updateMatrixWorld();
    this.piece.getWorldPosition(this.focus);

    const riceOnPiece = this.active ? this.active.layout() : false;
    if (!riceOnPiece && this.hasRice) {
      // Rice on its own palm: placed in world space through the piece group.
      // Its flat side (the origin) on the palm.
      this.piece.worldToLocal(this.rice.position.copy(riceHand.palm).add(this.tmp.set(0, 0.004, 0)));
    }
    if (this.wasabi === 'finger') this.piece.worldToLocal(this.wasabiBlob.position.copy(riceHand.indexTip));
  }

  // ---- helpers ------------------------------------------------------------

  setStage(stage: string): void {
    if (stage === this.stage) return;
    this.stage = stage;
    this.entity.setValue(Piece, 'stage', stage);
    this.entity.setValue(Piece, 'yawDeg', normYaw(this.pieceYaw));
  }

  private updateHints(): void {
    if (!chef.open) return;
    if (this.stage === NigiriStage.Done || this.stage === NigiriStage.Carried || this.stage === NigiriStage.Placed) {
      feedback.hints.add(StationKind.Geta);
      return;
    }
    if (this.active) this.active.hints();
    else {
      this.gunkan.hints();
      this.inari.hints();
      this.maki.hints();
    }
  }

  /** Share the piece's progress, for the master. */
  private publish(): void {
    progress.kind = this.kind;
    progress.stage = this.stage;
    progress.hasNeta = this.hasNeta;
    progress.netaHeld = this.netaHeld;
    progress.hasRice = this.hasRice;
    progress.wasabi = this.wasabi;
    progress.beatOrigin = this.phaseStart ?? 0;
    // A roll's core slice publishes its own place (MakiAssembly.publish).
    if (this.kind !== 'maki') progress.sliceAt.copy(this.netaOnBoard);
    progress.pieceAt.copy(this.focus);
    this.gunkan.publish();
    this.nigiri.publish();
    this.inari.publish();
    this.maki.publish();
  }

  /** For the debug panel. */
  describe(): string {
    const slots = this.active?.judgeSlots ?? 1;
    const j = this.judges.slice(0, slots).map((x) => (x === Judge.None ? '-' : x[0])).join('');
    const own = this.active ? this.active.describe() : '';
    return `Piece: ${this.kind ?? '-'} ${this.stage} rice=${this.hasRice ? 'y' : 'n'} wasabi=${this.wasabi} judges=${j} age=${this.cutAge.toFixed(0)}s yaw=${normYaw(this.pieceYaw).toFixed(0)} ${own}`;
  }
}
