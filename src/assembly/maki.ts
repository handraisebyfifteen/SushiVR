import { BoxGeometry, type BufferGeometry, type Entity, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, Vector3, type World } from '@iwsdk/core';
import { coach } from '../coach.js';
import { knifeApi } from '../cutting-system.js';
import { COLOR_DONE, COLOR_WARN, feedback } from '../feedback.js';
import { chef, orderKind, progress, service, wearKnife } from '../game-state.js';
import type { HandReader } from '../hand-reader.js';
import { sideX } from '../handedness.js';
import { hands } from '../hands.js';
import { MANAITA_TOP } from '../layout.js';
import { CORE_FROM, MENU, menuFor, NETA, type NetaId, rollCore } from '../menu.js';
import { caseApi } from '../neta-case-system.js';
import { canTakeNori, useNori, useShari } from '../pantry.js';
import type { PieceResult } from '../scoring.js';
import { caseLook, fillingOnRice, lookMaterial, MAKI_RADIUS, MAKI_RADIUS_THICK, makiMaterial, makiSegmentGeometry, noriMaterial, sliceLook } from '../scene-assets/lib/neta-look.js';
import { restMaterial } from '../scene-assets/lib/neta-material.js';
import { patterned } from '../scene-assets/lib/neta-paint.js';
import { overStation, stations } from '../station-system.js';
import { Held, MakiStage, NigiriStage, StationKind } from '../sushi-components.js';
import { CUT_STROKE, ROLL_PUSH_DISTANCE, ROLL_WINDOW_SECONDS, SPREAD_DISTANCE, SQUEEZE_SYNC_SECONDS, TOUCH_DISTANCE } from '../tuning.js';
import type { Assembly, PieceCore } from './types.js';

const ROLL_LENGTH = 0.2;
/** A 中太 (the tekka): the half sheet rolled 縦, its short side along the roll. */
const ROLL_LENGTH_THICK = 0.105;
/** Rows of halves (and quarters) laid side by side for cutting, and the gap a cut leaves. */
const ROW = 0.028;
const ROW_THICK = 0.051;
const GAP = 0.002;
const MAX_SEGMENTS = 8;
type Pieces = 4 | 6 | 8;

/** Knife strokes for a roll: two for a 中太 into four; three either way for six or eight. */
function strokesFor(pieces: Pieces): number {
  return pieces === 4 ? 2 : 3;
}
const RICE_LAYER_Y = 0.0065;

interface Seg {
  x: number;
  z: number;
  len: number;
}

/**
 * The roll's pieces after k knife strokes (piece-local, lying along X; L the
 * roll's length, row the pitch of the rows). The first stroke halves the
 * roll and the halves lie side by side. Into four (the 中太): one more
 * stroke halves both halves. Into six (kanpyo): two more strokes cut both
 * halves into thirds. Into eight: halve both halves, lay the four quarters
 * side by side, halve them all.
 */
function segmentsAfter(pieces: Pieces, k: number, L: number, row: number): Seg[] {
  if (k === 0) return [{ x: 0, z: 0, len: L }];
  const half = L / 2;
  const two = [-0.5, 0.5];
  if (k === 1) return two.map((r) => ({ x: 0, z: r * row, len: half }));
  if (pieces === 4) return two.flatMap((r) => [-1, 1].map((sign) => ({ x: (sign * L) / 8, z: r * row, len: L / 4 })));
  if (pieces === 6) {
    const sixth = L / 6;
    if (k === 2) return two.flatMap((r) => [{ x: -sixth, z: r * row, len: sixth }, { x: sixth / 2, z: r * row, len: 2 * sixth }]);
    return two.flatMap((r) => [-1, 0, 1].map((i) => ({ x: i * sixth, z: r * row, len: sixth })));
  }
  const four = [-1.5, -0.5, 0.5, 1.5];
  if (k === 2) return four.map((r) => ({ x: 0, z: r * row, len: L / 4 }));
  return four.flatMap((r) => [-1, 1].map((sign) => ({ x: (sign * L) / 16, z: r * row, len: L / 8 })));
}

/** Where stroke k+1 cuts (piece-local x), and how far its line runs across (z half-span). */
function guideFor(pieces: Pieces, k: number, L: number, row: number): { x: number; span: number } {
  if (k === 0) return { x: 0, span: 0.02 };
  if (pieces === 4) return { x: 0, span: row };
  if (pieces === 6) return { x: ((k === 1 ? -1 : 1) * L) / 12, span: row };
  return { x: 0, span: k === 1 ? row : 2 * row };
}

/**
 * A thin roll (hosomaki) on the makisu:
 *  1 the neta hand takes a half sheet of nori from the nori box and lays it
 *    on the mat (the mat lies open on the board while a roll is ordered)
 *  2 the rice (PieceSystem)   3 an open rice hand sweeps it out over the nori
 *  4 wasabi, if ordered       5 the rice hand lays the filling(s) from the
 *    case's right end along the middle (ume-shiso: shiso then plum; ume-kyu:
 *    plum then cucumber)
 *  6 both hands push the mat forward: rolled   7 both fists on the beat:
 *    squeezed firm (judged)   8 three knife strokes on the guide line:
 *    kanpyo into six (halve, lay the halves side by side, cut them in
 *    thirds), the others into eight (halve, halve, halve, laying the
 *    pieces side by side each time). The pieces stand ready.
 * The tekka is a 中太 (the user's shop): the half sheet is laid 縦, its long
 * side away from the chef, so the roll is short and thick; its core is not
 * a case item but a slice of the lean tuna cut on the board in service (with
 * the trimmings), laid on the rice by the neta hand; two strokes cut it into
 * four.
 */
export class MakiAssembly implements Assembly {
  readonly kind = 'maki' as const;
  readonly judgeSlots = 2;
  private carryingNori = false;
  private laid = false;
  private spread = 0;
  private spreadLast = new Vector3();
  private spreading = false;
  private readonly placed: NetaId[] = [];
  private carriedItem: Entity | null = null;
  private carriedNeta: NetaId | null = null;
  private rolled = false;
  private rollStartZ: number | null = null;
  private rollStartT = 0;
  private squeezed = false;
  private readonly lastFist = [-10, -10];
  private strokes = 0;
  private pieces: Pieces = 8;
  /** A 中太: the roll's length, the rows' pitch and its radius follow. */
  private thick = false;
  private length = ROLL_LENGTH;
  private row = ROW;
  private radius = MAKI_RADIUS;
  /** A core cut from a saku (the tekka's tuna): the slice on the board, or on the neta hand. */
  private coreOnBoard: NetaId | null = null;
  private coreHeld = false;
  private coreYaw = 0;
  /** Where the core's slice lies (world); the piece itself stays on the mat. */
  private readonly coreAt = new Vector3();
  private cutStartZ: number | null = null;
  /** The squeezed roll is off the mat, on the bare board; the hand lifting it there, and where it was taken by. */
  private onBoard = false;
  private lifting: 0 | 1 | null = null;
  private readonly liftOffset = new Vector3();
  private time = 0;
  private matOpen: boolean | null = null;
  private matOpenMesh: Object3D | null = null;
  private matRolledMesh: Object3D | null = null;
  private readonly sheet: Mesh;
  private readonly riceLayer: Mesh;
  private readonly fillingMeshes: Mesh[] = [];
  private readonly carried: Mesh;
  private readonly segments: Mesh[] = [];
  private readonly thinSegment: BufferGeometry;
  private readonly thickSegment: BufferGeometry;
  private readonly guide: Mesh;
  private readonly tmp = new Vector3();
  private readonly guideAt = new Vector3();

  constructor(
    private readonly core: PieceCore,
    world: World,
  ) {
    this.sheet = new Mesh(patterned(new BoxGeometry(ROLL_LENGTH, 0.0012, 0.095)), noriMaterial());
    this.sheet.name = 'NoriSheet';
    this.riceLayer = new Mesh(new BoxGeometry(ROLL_LENGTH - 0.01, 0.006, 0.07), new MeshStandardMaterial({ color: '#F2EFE6', roughness: 0.9 }));
    this.riceLayer.name = 'RiceSpread';
    core.piece.add(this.sheet, this.riceLayer);
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(caseLook('Cucumber').geometry, lookMaterial('Cucumber'));
      m.name = `Filling${i}`;
      core.piece.add(m);
      this.fillingMeshes.push(m);
    }
    this.thinSegment = makiSegmentGeometry();
    this.thickSegment = makiSegmentGeometry(MAKI_RADIUS_THICK);
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const m = new Mesh(this.thinSegment, makiMaterial(['Kanpyo']));
      m.name = `RollPiece${i}`;
      core.piece.add(m);
      this.segments.push(m);
    }
    this.carried = new Mesh(caseLook('Cucumber').geometry, lookMaterial('Cucumber'));
    this.carried.name = 'CarriedFilling';
    world.createTransformEntity(this.carried);
    this.guide = new Mesh(new BoxGeometry(0.003, 0.002, 1), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
    this.guide.name = 'RollCutGuide';
    world.createTransformEntity(this.guide);
    this.reset();
  }

  /** The fillings this roll needs, in placing order (from the order; one, if none). */
  private wanted(): readonly NetaId[] | null {
    const order = service.order;
    return order && MENU[order.item].kind === 'maki' ? MENU[order.item].neta : null;
  }

  /** Lays the mat out while a roll is ordered or in progress; rolled up aside otherwise. */
  private updateMat(): void {
    const open = orderKind() === 'maki' || this.core.kind === 'maki';
    if (open === this.matOpen) return;
    const mat = stations.get(StationKind.Makisu)?.entity.object3D;
    if (!mat) return;
    this.matOpenMesh ??= mat.getObjectByName('Open') ?? null;
    this.matRolledMesh ??= mat.getObjectByName('Rolled') ?? null;
    if (this.matOpenMesh) this.matOpenMesh.visible = open;
    if (this.matRolledMesh) this.matRolledMesh.visible = !open;
    this.matOpen = open;
  }

  update(delta: number): void {
    this.time += delta;
    this.updateMat();
    if (!chef.open || chef.facingBack) return;
    if (this.core.kind && this.core.kind !== 'maki') return;
    const riceHand = hands.all[chef.riceSide];
    const netaHand = hands.all[chef.netaSide];
    if (!this.laid) this.updateNori(netaHand);
    else if (this.spread < 1) this.updateSpread(riceHand);
    else if (!this.filled()) {
      // Wasabi goes on the rice before the fillings.
      this.core.updateWasabi(riceHand, this.placed.length === 0 && !this.carriedItem && !this.coreHeld);
      if (this.nextIsCore()) this.updateCore(netaHand);
      else this.updateFilling(riceHand);
    } else if (!this.rolled) this.updateRoll(riceHand, netaHand);
    else if (!this.squeezed) this.updateSqueeze(riceHand, netaHand);
    else if (!this.onBoard) this.updateLift();
    else this.updateCut(netaHand);
  }

  private filled(): boolean {
    return this.placed.length >= (this.wanted()?.length ?? 1);
  }

  private matCentre(out: Vector3): Vector3 {
    const mat = stations.get(StationKind.Makisu);
    return mat ? out.copy(mat.pos).add(this.tmp.set(0, 0.004, 0)) : out.set(0, 0, 0);
  }

  // ---- 1: a half sheet of nori onto the mat ---------------------------------

  private updateNori(hand: HandReader): void {
    const state = chef.hands[chef.netaSide];
    if (!this.carryingNori) {
      if (orderKind() !== 'maki' && this.core.kind !== 'maki') return;
      if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None) return;
      if (!overStation(hand.grasp, StationKind.NoriBox)) return;
      if (state.needsWash) {
        feedback.flash(StationKind.NoriBox, COLOR_WARN);
        coach.mistake('washFirst', StationKind.NoriBox);
        return;
      }
      // On full the tin can run out (src/pantry.ts).
      if (!canTakeNori('maki')) {
        feedback.flash(StationKind.NoriBox, COLOR_WARN);
        console.log('[Maki] the nori tin is empty');
        return;
      }
      if (!this.core.begin('maki')) return;
      // A 中太 (the tekka): the half sheet laid 縦, rolled into a shorter, thicker roll cut into four.
      const item = service.order?.item;
      this.thick = !!item && MENU[item].kind === 'maki' && MENU[item].pieces === 4;
      this.length = this.thick ? ROLL_LENGTH_THICK : ROLL_LENGTH;
      this.row = this.thick ? ROW_THICK : ROW;
      this.radius = this.thick ? MAKI_RADIUS_THICK : MAKI_RADIUS;
      this.matCentre(this.core.netaOnBoard);
      this.core.hasNeta = true;
      this.carryingNori = true;
      state.holding = Held.NoriSheet;
      console.log('[Maki] a half sheet of nori');
      return;
    }
    if (hand.tracked && !hand.pinchEnd) return;
    this.carryingNori = false;
    state.holding = Held.None;
    if (!overStation(hand.grasp, StationKind.Makisu)) {
      const g = hand.grasp;
      console.log(`[Maki] the nori went back (let go at ${g.x.toFixed(2)} ${g.y.toFixed(2)} ${g.z.toFixed(2)})`);
      return;
    }
    this.laid = true;
    useNori('maki');
    this.core.setStage(MakiStage.Laid);
    feedback.flash(StationKind.Makisu, COLOR_DONE);
    coach.done('layNori');
    console.log('[Maki] nori on the mat');
  }

  // ---- 3: spread the rice ----------------------------------------------------

  private updateSpread(hand: HandReader): void {
    const core = this.core;
    if (!core.hasRice || !hand.tracked) return;
    const mat = stations.get(StationKind.Makisu);
    const over = !!mat && overStation(hand.palm, StationKind.Makisu) && hand.palm.y < mat.pos.y + 0.07 && !hand.fist && hand.curl < 0.5;
    if (!over) {
      this.spreading = false;
      return;
    }
    if (this.spreading) {
      this.spread += Math.hypot(hand.palm.x - this.spreadLast.x, hand.palm.z - this.spreadLast.z) / SPREAD_DISTANCE;
    }
    this.spreadLast.copy(hand.palm);
    this.spreading = true;
    if (this.spread < 1) return;
    this.spread = 1;
    chef.hands[chef.riceSide].holding = Held.None;
    core.setStage(MakiStage.Spread);
    useShari('maki');
    coach.done('spreadRice');
    console.log('[Maki] rice spread');
  }

  // ---- 5: the fillings ---------------------------------------------------------

  private updateFilling(hand: HandReader): void {
    const state = chef.hands[chef.riceSide];
    if (!this.carriedItem) {
      if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None) return;
      const item = caseApi.chosen(chef.riceSide);
      if (!item) return;
      const neta = caseApi.neta(item);
      if (NETA[neta].prep !== 'filling' || caseApi.check(chef.riceSide, item) !== 'ok') return;
      const expected = this.wanted()?.[this.placed.length];
      if (expected && expected !== neta) {
        feedback.flash(StationKind.NetaCase, COLOR_WARN);
        coach.mistake('wrongItem', StationKind.NetaCase);
        console.log(`[Maki] ${neta} is not next`);
        return;
      }
      if (caseApi.stock(item) < 1) return;
      this.carriedItem = item;
      this.carriedNeta = neta;
      this.carried.geometry = caseLook(neta).geometry;
      this.carried.material = lookMaterial(neta);
      state.holding = Held.Filling;
      return;
    }
    if (hand.tracked) {
      this.carried.position.copy(hand.grasp);
      this.carried.rotation.y = (hand.yawDeg * Math.PI) / 180;
    }
    if (hand.tracked && !hand.pinchEnd) return;
    const item = this.carriedItem;
    const neta = this.carriedNeta!;
    this.carriedItem = null;
    this.carriedNeta = null;
    state.holding = Held.None;
    if (!overStation(hand.grasp, StationKind.Makisu) || !caseApi.consume(item, 1)) return;
    const slot = this.fillingMeshes[this.placed.length];
    slot.geometry = fillingOnRice(neta);
    slot.material = lookMaterial(neta);
    this.placed.push(neta);
    feedback.flash(StationKind.Makisu, COLOR_DONE);
    console.log(`[Maki] ${neta} laid on the rice`);
    if (this.filled()) {
      this.core.setStage(MakiStage.Filled);
      coach.done('placeFilling');
    }
  }

  // ---- 5b: a core cut from a saku (the tekka's tuna) ----------------------------

  /** The next filling is cut from a saku in service, not taken from the case. */
  private nextIsCore(): boolean {
    const next = this.wanted()?.[this.placed.length];
    return !!next && !!CORE_FROM[next];
  }

  /** The roll waits for its core: a saku may be taken to the board and sliced (src/cutting-system.ts). */
  wantsCore(): boolean {
    return this.laid && !this.filled() && !this.coreOnBoard && !this.coreHeld && this.nextIsCore();
  }

  /** A slice cut from the saku on the board for this roll's core: it lies there until the neta hand takes it. */
  coreCut(neta: NetaId, at: Vector3): void {
    this.coreOnBoard = neta;
    this.coreHeld = false;
    this.coreAt.copy(at);
    const look = sliceLook(neta);
    this.carried.geometry = look.geometry;
    this.carried.material = restMaterial(look.material);
    this.coreYaw = look.blockAxes ? -Math.PI / 2 : 0;
    console.log(`[Maki] a slice of ${neta} for the core, on the board`);
  }

  /** The neta hand takes the slice from the board and lays it along the middle of the rice. */
  private updateCore(hand: HandReader): void {
    const state = chef.hands[chef.netaSide];
    if (!this.coreOnBoard) return;
    if (!this.coreHeld) {
      if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None) return;
      if (hand.grasp.distanceTo(this.coreAt) > TOUCH_DISTANCE) return;
      this.coreHeld = true;
      state.holding = Held.Filling;
      coach.done('takeNeta');
      console.log('[Maki] the core on the hand');
      return;
    }
    if (hand.tracked) {
      this.carried.position.copy(hand.grasp);
      this.carried.rotation.y = (hand.yawDeg * Math.PI) / 180;
    }
    if (hand.tracked && !hand.pinchEnd) return;
    this.coreHeld = false;
    state.holding = Held.None;
    if (!overStation(hand.grasp, StationKind.Makisu)) {
      // Let go elsewhere: it lies there, on the board's level.
      const board = stations.get(StationKind.CuttingBoard);
      this.coreAt.set(hand.grasp.x, board ? board.pos.y : hand.grasp.y, hand.grasp.z);
      console.log('[Maki] the core put down off the mat');
      return;
    }
    const from = this.coreOnBoard;
    const neta = rollCore(from);
    this.coreOnBoard = null;
    const slot = this.fillingMeshes[this.placed.length];
    slot.geometry = fillingOnRice(neta);
    slot.material = lookMaterial(neta);
    this.placed.push(neta);
    feedback.flash(StationKind.Makisu, COLOR_DONE);
    console.log(`[Maki] ${neta} laid on the rice (the core, cut from the ${from})`);
    if (this.filled()) {
      this.core.setStage(MakiStage.Filled);
      coach.done('placeFilling');
    }
  }

  // ---- 6-7: roll and squeeze ---------------------------------------------------

  private updateRoll(rice: HandReader, neta: HandReader): void {
    const mat = stations.get(StationKind.Makisu);
    const both =
      !!mat && rice.tracked && neta.tracked &&
      overStation(rice.palm, StationKind.Makisu) && overStation(neta.palm, StationKind.Makisu) &&
      rice.palm.y < mat.pos.y + 0.12 && neta.palm.y < mat.pos.y + 0.12;
    if (!both) {
      this.rollStartZ = null;
      return;
    }
    const z = (rice.palm.z + neta.palm.z) / 2;
    if (this.rollStartZ === null || this.time - this.rollStartT > ROLL_WINDOW_SECONDS || z > this.rollStartZ) {
      this.rollStartZ = z;
      this.rollStartT = this.time;
      return;
    }
    // Forward is -Z: both palms push the mat away.
    if (this.rollStartZ - z < ROLL_PUSH_DISTANCE) return;
    const core = this.core;
    this.rolled = true;
    core.cutAge = 0;
    core.startMetronome(60);
    const fillings = this.placed.length ? this.placed : ['Kanpyo' as NetaId];
    const material = makiMaterial(fillings, this.thick);
    for (const s of this.segments) {
      s.material = material;
      s.geometry = this.thick ? this.thickSegment : this.thinSegment;
    }
    const order = service.order;
    this.pieces = (order && MENU[order.item].kind === 'maki' ? MENU[order.item].pieces : null) ?? (this.thick ? 4 : fillings[0] === 'Kanpyo' ? 6 : 8);
    core.setStage(MakiStage.Rolled);
    coach.done('rollMaki');
    console.log('[Maki] rolled');
  }

  private updateSqueeze(rice: HandReader, neta: HandReader): void {
    if (rice.fistStart) this.lastFist[chef.riceSide] = this.time;
    if (neta.fistStart) this.lastFist[chef.netaSide] = this.time;
    const [a, b] = this.lastFist;
    if (Math.abs(a - b) > SQUEEZE_SYNC_SECONDS || this.time - Math.max(a, b) > 0.1) return;
    const focus = this.core.focus;
    if (rice.palm.distanceTo(focus) > 0.16 || neta.palm.distanceTo(focus) > 0.16) return;
    const judge = this.core.judge(1);
    this.core.judges[1] = judge;
    this.squeezed = true;
    this.lastFist[0] = this.lastFist[1] = -10;
    this.core.setStage(MakiStage.Squeezed);
    coach.done('squeezeRoll');
    console.log(`[Maki] squeezed firm: ${judge}`);
  }

  // ---- 7b: off the mat, onto the board ------------------------------------------------

  /** Where the roll is laid to be cut: on the bare board, the knife's side of the mat, level with it (clear of the wasabi and tezu at the back). */
  private boardSpot(out: Vector3): Vector3 {
    const board = stations.get(StationKind.CuttingBoard);
    return out.set((board?.pos.x ?? 0) + sideX(0.1), MANAITA_TOP + 0.002, (board?.pos.z ?? 0) + 0.08);
  }

  /**
   * The squeezed roll is not cut on the makisu: either hand pinches it and
   * lifts it off the mat; let go over the bare board (not the mat) it lies
   * there to be cut; let go anywhere else, it goes back onto the mat.
   */
  private updateLift(): void {
    const core = this.core;
    if (this.lifting === null) {
      for (const side of [chef.netaSide, chef.riceSide] as const) {
        const hand = hands.all[side];
        if (!hand.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None) continue;
        const g = hand.grasp;
        if (Math.hypot(g.x - core.focus.x, g.z - core.focus.z) > 0.1 || Math.abs(g.y - core.focus.y) > 0.08) continue;
        this.lifting = side;
        this.liftOffset.copy(core.netaOnBoard).sub(g);
        chef.hands[side].holding = Held.Sushi;
        console.log('[Maki] the roll off the mat');
        return;
      }
      return;
    }
    const side = this.lifting;
    const hand = hands.all[side];
    if (hand.tracked) core.netaOnBoard.copy(hand.grasp).add(this.liftOffset);
    if (hand.tracked && !hand.pinchEnd) return;
    this.lifting = null;
    chef.hands[side].holding = Held.None;
    const g = hand.grasp;
    if (overStation(g, StationKind.CuttingBoard) && !overStation(g, StationKind.Makisu)) {
      core.netaOnBoard.set(g.x + this.liftOffset.x, MANAITA_TOP + 0.002, g.z + this.liftOffset.z);
      this.onBoard = true;
      feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
      coach.done('rollToBoard');
      console.log('[Maki] the roll on the board, to be cut');
      return;
    }
    this.matCentre(core.netaOnBoard);
    console.log('[Maki] the roll back on the mat: it is cut on the board');
  }

  // ---- 8: cut -------------------------------------------------------------------

  private updateCut(neta: HandReader): void {
    if (this.strokes >= strokesFor(this.pieces) || !knifeApi.held) {
      this.cutStartZ = null;
      return;
    }
    const core = this.core;
    const g = guideFor(this.pieces, this.strokes, this.length, this.row);
    core.piece.localToWorld(this.guideAt.set(g.x, this.radius, 0));
    const blade = knifeApi.blade;
    const holdingDown =
      neta.tracked && Math.hypot(neta.palm.x - core.focus.x, neta.palm.z - core.focus.z) < 0.14 && neta.palm.y < core.focus.y + 0.15;
    const over =
      Math.abs(blade.x - this.guideAt.x) < 0.035 &&
      Math.abs(blade.z - this.guideAt.z) < g.span + CUT_STROKE + 0.04 &&
      blade.y < this.guideAt.y + 0.1;
    if (!holdingDown || !over) {
      this.cutStartZ = null;
      return;
    }
    if (this.cutStartZ === null) this.cutStartZ = blade.z;
    if (blade.z - this.cutStartZ < CUT_STROKE) return;
    this.cutStartZ = null;
    this.strokes++;
    chef.knifeDirty = true;
    wearKnife();
    coach.done('cutRoll');
    console.log(`[Maki] cut ${this.strokes} of ${strokesFor(this.pieces)}`);
    if (this.strokes === strokesFor(this.pieces)) {
      core.setStage(NigiriStage.Done);
      feedback.flash(StationKind.Makisu, COLOR_DONE);
      console.log(`[Maki] ${this.pieces} pieces`);
    }
  }

  // ---- shared hooks ---------------------------------------------------------

  layout(): boolean {
    this.updateMat();
    const core = this.core;
    this.carried.visible = !!this.carriedItem || !!this.coreOnBoard;
    if (this.coreOnBoard && !this.coreHeld) {
      // The core's slice lying on the board.
      this.carried.position.copy(this.coreAt);
      this.carried.rotation.y = this.coreYaw;
    }
    this.sheet.visible = this.carryingNori || (this.laid && !this.rolled);
    // 縦 for a 中太: the sheet's long side runs away from the chef.
    this.sheet.rotation.y = this.thick ? Math.PI / 2 : 0;
    this.riceLayer.rotation.y = this.thick ? Math.PI / 2 : 0;
    if (this.carryingNori) {
      core.piece.worldToLocal(this.sheet.position.copy(hands.all[chef.netaSide].grasp));
    } else {
      this.sheet.position.set(0, 0.002, 0);
    }
    this.riceLayer.visible = this.spread > 0 && !this.rolled;
    const along = 0.25 + 0.75 * this.spread;
    const across = 0.3 + 0.7 * this.spread;
    // 縦: the rice stops short of the sheet's far edge and spans its width.
    if (this.thick) this.riceLayer.scale.set(along * 0.84, 1, across * 1.21);
    else this.riceLayer.scale.set(along, 1, across);
    this.riceLayer.position.set(0, 0.0042, 0);
    if (this.spread > 0) core.rice.visible = false;
    // Wasabi: drawn as a line along the middle of the rice.
    if (core.wasabi === 'neta') {
      core.wasabiBlob.visible = !this.rolled;
      core.wasabiBlob.position.set(0, 0.0085, 0);
      core.wasabiBlob.scale.set(this.thick ? 3 : 6, 0.3, 0.45);
    } else {
      core.wasabiBlob.scale.set(1, 1, 1);
    }
    this.fillingMeshes.forEach((m, i) => {
      m.visible = i < this.placed.length && !this.rolled;
      if (this.thick) {
        // The 中太's core, the slice with the trimmings: a thick line along the short side.
        m.scale.set(0.55, 2.2, 2);
        m.position.set(0, 0.011, 0);
      } else {
        m.scale.set(1, 1, 1);
        m.position.set(0, 0.0075 + i * 0.002, (i - (this.placed.length - 1) / 2) * 0.008);
      }
    });
    this.layoutSegments();
    const cutting = this.squeezed && this.strokes < strokesFor(this.pieces) && knifeApi.held;
    this.guide.visible = cutting;
    if (cutting) {
      const g = guideFor(this.pieces, this.strokes, this.length, this.row);
      this.guide.position.copy(this.guideAt);
      this.guide.position.y += this.radius + 0.002;
      this.guide.scale.z = 2 * g.span + 0.03;
    }
    return this.spread > 0 || this.rolled;
  }

  /** The roll lying on the mat as it is cut; once cut, the pieces stand in two rows, cut face up. */
  private layoutSegments(): void {
    if (!this.rolled) {
      for (const s of this.segments) s.visible = false;
      return;
    }
    if (this.strokes >= strokesFor(this.pieces)) {
      // Standing, cut face up, in two rows: two, three or four to a row.
      const n = this.pieces;
      const cols = n === 4 ? 2 : n / 2;
      const rows = n / cols;
      const len = this.length / n;
      const pitch = this.row + 0.001;
      this.segments.forEach((m, i) => {
        m.visible = i < n;
        if (i >= n) return;
        const col = i % cols;
        const row = Math.floor(i / cols);
        m.rotation.set(0, 0, Math.PI / 2);
        m.scale.set(len - GAP, 1, 1);
        m.position.set((col - (cols - 1) / 2) * pitch, len / 2, (row - (rows - 1) / 2) * pitch);
      });
      return;
    }
    const segs = segmentsAfter(this.pieces, this.strokes, this.length, this.row);
    this.segments.forEach((m, i) => {
      const s = segs[i];
      m.visible = !!s;
      if (!s) return;
      m.rotation.set(0, 0, 0);
      m.scale.set(s.len - (this.strokes ? GAP : 0), this.squeezed ? 0.94 : 1, this.squeezed ? 1.04 : 1);
      m.position.set(s.x, this.radius, s.z);
    });
  }

  wasabiTarget(out: Vector3): boolean {
    if (this.spread < 1 || this.placed.length || this.rolled) return false;
    this.core.piece.localToWorld(out.set(0, 0.009, 0));
    return true;
  }

  ringOnHand(): boolean {
    return !this.rolled;
  }

  hints(): void {
    const core = this.core;
    if (orderKind() !== 'maki' && core.kind !== 'maki') return;
    const riceState = chef.hands[chef.riceSide];
    if (!this.laid) {
      feedback.hints.add(StationKind.NoriBox);
      if (!core.hasRice) feedback.hints.add(riceState.wet ? StationKind.RiceTub : StationKind.Tezu);
    } else if (this.spread < 1) {
      feedback.hints.add(core.hasRice ? StationKind.Makisu : riceState.wet ? StationKind.RiceTub : StationKind.Tezu);
    } else if (!this.filled()) {
      if (service.order?.wasabi && core.wasabi === 'none' && !this.placed.length) feedback.hints.add(StationKind.Wasabi);
      else if (this.nextIsCore()) {
        // The core is cut from a saku: the case, the knife and the board, then the mat.
        if (this.coreHeld) feedback.hints.add(StationKind.Makisu);
        else if (this.coreOnBoard) feedback.hints.add(knifeApi.held ? StationKind.WetCloth : StationKind.CuttingBoard);
        else if (!progress.sakuOnBoard) feedback.hints.add(StationKind.NetaCase);
        else feedback.hints.add(knifeApi.held ? StationKind.CuttingBoard : StationKind.Knife);
      } else feedback.hints.add(this.carriedItem ? StationKind.Makisu : StationKind.NetaCase);
    } else if (!this.squeezed) {
      feedback.hints.add(StationKind.Makisu);
    } else if (!this.onBoard) {
      feedback.hints.add(this.lifting === null ? StationKind.Makisu : StationKind.CuttingBoard);
    } else if (knifeApi.held) {
      feedback.hints.add(StationKind.CuttingBoard);
    } else if (this.strokes < strokesFor(this.pieces)) {
      feedback.hints.add(StationKind.Knife);
    }
  }

  score(r: PieceResult): void {
    const order = service.order;
    r.itemOk = !!order && this.strokes >= strokesFor(this.pieces) && order.item === menuFor('maki', this.placed);
    // Pieces stand cut face up; any heading is fine.
  }

  reset(): void {
    this.carryingNori = this.laid = this.rolled = this.squeezed = this.spreading = false;
    this.spread = 0;
    this.placed.length = 0;
    this.carriedItem = null;
    this.carriedNeta = null;
    this.rollStartZ = null;
    this.cutStartZ = null;
    if (this.lifting !== null) chef.hands[this.lifting].holding = Held.None;
    this.onBoard = false;
    this.lifting = null;
    this.strokes = 0;
    this.thick = false;
    this.length = ROLL_LENGTH;
    this.row = ROW;
    this.radius = MAKI_RADIUS;
    this.coreOnBoard = null;
    this.coreHeld = false;
    this.sheet.rotation.y = this.riceLayer.rotation.y = 0;
    this.lastFist[0] = this.lastFist[1] = -10;
    this.sheet.visible = this.riceLayer.visible = this.carried.visible = this.guide.visible = false;
    for (const m of this.fillingMeshes) m.visible = false;
    for (const m of this.segments) m.visible = false;
    this.core.wasabiBlob.scale.set(1, 1, 1);
    this.matOpen = null;
  }

  publish(): void {
    progress.matNori = this.laid;
    progress.spread = this.spread;
    progress.fillings = this.placed.length;
    progress.rolled = this.rolled;
    progress.squeezed = this.squeezed;
    progress.rollOnBoard = this.onBoard;
    progress.rollHeld = this.lifting !== null;
    this.boardSpot(progress.rollSpot);
    progress.cutsDone = this.strokes;
    progress.cutsNeeded = strokesFor(this.pieces);
    progress.coreOnBoard = !!this.coreOnBoard && !this.coreHeld;
    progress.coreHeld = this.coreHeld;
    if (this.coreOnBoard && !this.coreHeld) progress.sliceAt.copy(this.coreAt);
    if (this.squeezed && this.strokes < strokesFor(this.pieces)) progress.guideAt.copy(this.guideAt);
    else progress.guideAt.copy(this.core.focus);
  }

  describe(): string {
    return `nori=${this.laid ? 'y' : 'n'}${this.thick ? ' chubuto' : ''} spread=${this.spread.toFixed(2)} core=${this.coreHeld ? 'held' : this.coreOnBoard ? 'board' : '-'} fillings=${this.placed.join('+') || '-'} rolled=${this.rolled ? 'y' : 'n'} squeezed=${this.squeezed ? 'y' : 'n'} board=${this.onBoard ? 'y' : this.lifting !== null ? 'held' : 'n'} cuts=${this.strokes}/${strokesFor(this.pieces)} into ${this.pieces}`;
  }
}
