import { Box3, BoxGeometry, createSystem, type Entity, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, type Sprite, Vector3 } from '@iwsdk/core';
import { coach, type Grade } from './coach.js';
import { knifeApi } from './cutting-system.js';
import { debugLines } from './debug.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { chef, prep, type Side, staff } from './game-state.js';
import { hands, RubTracker } from './hands.js';
import { ledger } from './ledger.js';
import { NETA, type NetaId } from './menu.js';
import { scrapsApi } from './opening-system.js';
import { ICE_BOX_ORDER, isPrepped, PREP, type PrepId, prepTasks } from './prep.js';
import { type PrepMaterialLook, type PrepProduct, type PrepStep, paperSheet, prepMaterialLook } from './scene-assets/lib/prep-look.js';
import { overStation, stations } from './station-system.js';
import { CaseItem, Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import {
  BOARD_DIRT_PER_CUT,
  COOK_MINUTES,
  COOK_MINUTES_PER_CASE_ITEM,
  COOK_SECONDS,
  CUT_STROKE,
  DIFFICULTY,
  FISH_SHOP_PRICE,
  PREP_CUT_EXCELLENT,
  PREP_CUT_GOOD,
  PREP_CUT_POOR,
  PREP_STAGE,
  PREP_YIELD_LOSS,
  RESULT_SECONDS,
  RUB_WIPE_BOARD,
  SQUID_PULL_DISTANCE,
} from './tuning.js';

/**
 * Where each material lies in the ice box (box-local x, height above the
 * ice): the tuna and the bonito side by side, the squid on top of them.
 */
const SLOT: Partial<Record<PrepId, [number, number]>> = { TunaBelly: [0.068, 0], BonitoHalf: [-0.088, 0], Squid: [0, 0.058] };
/** The pile of scraps on the board, front right of the work (root-local), lying across the board. */
const SCRAP_X = 0.28;
const SCRAP_Z = 0.08;
/** A pinch this close to a piece picks it up (across it, or beyond its ends). */
const PICK_RADIUS = 0.08;
/** The fingers move the pinch point as they close: judge where they were this long before. */
const PINCH_LOOKBACK = 0.15;
const HISTORY = 24;
/** How far the blade may stray from the guide line and still count as cutting along it. */
const ON_LINE = 0.03;
/** A shave runs flat along the board: the blade this low over it. */
const LOW_BLADE = 0.024;
const GRADE_POINTS: Record<Grade, number> = { Excellent: 100, Good: 80, Poor: 60, Bad: 40 };

interface Material {
  id: PrepId;
  look: PrepMaterialLook;
  root: Object3D;
  /** The root's place in the ice box (world). */
  slot: Vector3;
  /** 'cook': taken to the back by the cook (src/staff-system.ts). */
  state: 'box' | 'held' | 'board' | 'cook' | 'done';
  step: number;
  parts: Map<string, Object3D>;
  /** Each part's bounding-box centre relative to its position (root-local). */
  centres: Map<string, Vector3>;
  grades: Grade[];
  loose: Loose[];
}

/** A piece lying loose on the board: a saku to put away, or a scrap to throw out. */
interface Loose {
  kind: 'product' | 'scrap';
  m: Material | null;
  parts: Object3D[];
  /** Where each part lies when not in a hand (its parent's frame). */
  home: Vector3[];
  /** parts[0]'s centre relative to its position. */
  centre: Vector3;
  length: number;
  /** Lying across the board (X) rather than toward the chef (Z). */
  alongX?: boolean;
  product: PrepProduct | null;
  /** Slices this saku gives (fewer after crooked cuts). */
  stock?: number;
  done: boolean;
}

type Carried =
  | { kind: 'material'; m: Material }
  | { kind: 'loose'; loose: Loose }
  | { kind: 'paper'; mesh: Mesh; used: boolean };

const usedPaper = new MeshStandardMaterial({ color: '#D9D2C2', roughness: 0.95 });

/**
 * Saku-taking (柵取り) in the morning prep, on the itaba manaita.
 *  - The case items the prep fills start the day empty. The fish shop's
 *    delivery (src/phone-system.ts) brings the ice box of wrapped fish.
 *  - The neta hand (washed) takes a fish from the ice and lays it on the
 *    board, its length toward the chef.
 *  - Its wrapping is pulled off (the neta hand holds the fish, the rice hand
 *    pulls), then each white line is cut with the knife: drawn toward the
 *    chef along the fish, across it, or flat along the board under the
 *    flesh (shaving off skin). The squid's legs and its skin are pulled off
 *    the same way as the wrapping, and it is patted dry with kitchen paper.
 *  - Each saku is let go over the case (it fills its item), the bonito belly
 *    over the ice (it waits for the range). Scraps stay on the board until
 *    they are dropped in the trash bin at the chef's left foot.
 *  - Money: the fish shop bills every material it delivers. A crooked cut
 *    wastes flesh, so the saku gives fewer slices to sell. With the cook in
 *    (the plaque by the phone) the fish still in the ice box go to the back
 *    and come out as full saku, for wages; on the easy difficulty the cook
 *    has readied every case item the chef does not prep.
 */
export class PrepCutSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private readonly materials: Material[] = [];
  private readonly loose: Loose[] = [];
  private readonly caseItems = new Map<NetaId, Entity>();
  private readonly caseHomes = new Map<NetaId, Vector3>();
  private readonly carried: [Carried | null, Carried | null] = [null, null];
  private readonly grabOffset = [new Vector3(), new Vector3()];
  private cutStart: number | null = null;
  private offSum = 0;
  private offCount = 0;
  private netaGrip = false;
  private riceGrip = false;
  private pullStart: number | null = null;
  private readonly pullFrom = new Vector3();
  private readonly pullHome: Vector3[] = [];
  private readonly wipeRub = new RubTracker();
  private guide!: Mesh<BoxGeometry, MeshBasicMaterial>;
  private summary!: Sprite;
  private summaryTime = 0;
  /** The material the cook is on, and seconds until it is done. */
  private cooking: Material | null = null;
  private cookLeft = 0;
  /** Slices the saku gave, against what perfect cuts would give. */
  private yieldGot = 0;
  private yieldFull = 0;
  private built = false;
  private cleared = false;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly pinchAt = new Vector3();
  private time = 0;
  private readonly graspTime = [new Float64Array(HISTORY), new Float64Array(HISTORY)];
  private readonly graspXYZ = [new Float32Array(HISTORY * 3), new Float32Array(HISTORY * 3)];
  private readonly graspHead = [0, 0];

  init(): void {
    this.guide = new Mesh(new BoxGeometry(1, 0.002, 1), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
    this.guide.name = 'PrepCutGuide';
    this.guide.visible = false;
    this.world.createTransformEntity(this.guide);
    this.summary = makeTextSprite(' ', { width: 0.36 });
    this.summary.name = 'PrepSummary';
    this.summary.visible = false;
    this.world.createTransformEntity(this.summary);
    this.cleanupFuncs.push(this.queries.items.subscribe('qualify', (e) => this.seeCaseItem(e)));
    for (const e of this.queries.items.entities) this.seeCaseItem(e);
    prep.tasksTotal = prepTasks(PREP_STAGE).filter((id) => PREP[id].kind !== 'simmer').length;
    scrapsApi.clear = () => this.clearScraps();
    if (prep.active && DIFFICULTY === 'easy') {
      // Everything the chef does not prep, the cook has readied: wages.
      const items = (Object.keys(NETA) as NetaId[]).filter((n) => !isPrepped(n, PREP_STAGE)).length;
      ledger.wage('cook', `case items (${items})`, items * COOK_MINUTES_PER_CASE_ITEM);
    }
    debugLines.push(() => {
      if (!prep.active) return 'Prep: done, the bar is open';
      const board = this.boardMaterial();
      const on = board ? ` | board: ${board.id} step ${board.step + 1}/${board.look.steps.length}` : '';
      return `Prep: ${prep.tasksDone}/${prep.tasksTotal} | scraps ${prep.scrapsLeft} | next ${prep.next ?? '-'}${on}`;
    });
  }

  /** Remember where each case item sits; the ones the prep fills start empty. */
  private seeCaseItem(entity: Entity): void {
    const neta = entity.getValue(CaseItem, 'neta') as NetaId;
    this.caseItems.set(neta, entity);
    if (entity.object3D) this.caseHomes.set(neta, entity.object3D.position.clone());
    if (prep.active && isPrepped(neta, PREP_STAGE)) entity.setValue(CaseItem, 'remaining', 0);
  }

  /** The delivered fish, laid in the ice box (each in its wrapping). */
  private build(): void {
    const box = stations.get(StationKind.IceBox)!;
    for (const id of ICE_BOX_ORDER) {
      if (PREP[id].stage > PREP_STAGE) continue;
      const look = prepMaterialLook(id);
      if (!look) continue;
      const root = look.root;
      const parts = new Map<string, Object3D>();
      const centres = new Map<string, Vector3>();
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (o === root || !o.name) return;
        parts.set(o.name, o);
        const c = new Box3().setFromObject(o, true).getCenter(new Vector3()).sub(o.position);
        centres.set(o.name, c);
      });
      const [sx, sy] = SLOT[id] ?? [0, 0];
      const slot = new Vector3(box.pos.x + sx, box.pos.y + sy, box.pos.z);
      root.position.copy(slot);
      this.world.createTransformEntity(root);
      this.materials.push({ id, look, root, slot, state: 'box', step: 0, parts, centres, grades: [], loose: [] });
      ledger.fishShop(FISH_SHOP_PRICE[id] ?? 0);
    }
    this.built = true;
    console.log(`[Prep] the delivery is in the ice box (fish shop ¥${this.materials.reduce((sum, m) => sum + (FISH_SHOP_PRICE[m.id] ?? 0), 0)})`);
  }

  update(delta: number): void {
    this.time += delta;
    this.recordGrasps();
    if (this.summaryTime > 0) {
      this.summaryTime -= delta;
      if (this.summaryTime <= 0) this.summary.visible = false;
    }
    // The empty styrofoam box is put away once every fish in it is prepped (the user's shop).
    const box = stations.get(StationKind.IceBox);
    if (box?.entity.object3D) {
      const shown = prep.delivered && prep.active && !prep.done;
      if (box.entity.object3D.visible && !shown && prep.done) console.log('[Prep] the empty ice box is put away');
      box.entity.object3D.visible = shown;
    }
    if (!prep.active) {
      if (!this.cleared) this.clearAway();
      return;
    }
    if (!prep.delivered || !box) {
      this.publish();
      return;
    }
    if (!this.built) this.build();
    this.updateCook(delta);
    this.updateCarried(chef.netaSide);
    this.updateCarried(chef.riceSide);
    const board = this.boardMaterial();
    const step = board ? board.look.steps[board.step] : undefined;
    this.guide.visible = false;
    if (board && step?.kind === 'cut') this.updateCut(board, step);
    else if (board && step?.kind === 'pull') this.updatePull(board, step);
    else if (board && step?.kind === 'wipe') this.updateWipe(board);
    this.updatePick(chef.netaSide, board, step);
    this.updatePick(chef.riceSide, board, step);
    prep.scrapsLeft = this.loose.filter((l) => l.kind === 'scrap' && !l.done).length + this.carried.filter((c) => c?.kind === 'paper').length;
    this.publish();
    this.hints();
  }

  private boardMaterial(): Material | null {
    for (const m of this.materials) if (m.state === 'board') return m;
    return null;
  }

  /** The bar is open: the ice box and what is left in it are put away. */
  private clearAway(): void {
    this.cleared = true;
    this.guide.visible = false;
    for (const m of this.materials) m.root.visible = false;
    for (const l of this.loose) for (const p of l.parts) p.visible = false;
    console.log('[Prep] the ice box is put away');
  }

  private recordGrasps(): void {
    for (let side = 0; side < 2; side++) {
      const hand = hands.all[side];
      if (!hand.tracked) continue;
      const i = (this.graspHead[side] = (this.graspHead[side] + 1) % HISTORY);
      this.graspTime[side][i] = this.time;
      this.graspXYZ[side][i * 3] = hand.grasp.x;
      this.graspXYZ[side][i * 3 + 1] = hand.grasp.y;
      this.graspXYZ[side][i * 3 + 2] = hand.grasp.z;
    }
  }

  /** Where this hand's pinch point was just before the fingers closed (scratch vector). */
  private pinchPoint(side: number): Vector3 {
    const want = this.time - PINCH_LOOKBACK;
    let best = this.graspHead[side];
    for (let k = 0; k < HISTORY; k++) {
      const i = (this.graspHead[side] - k + HISTORY) % HISTORY;
      if (this.graspTime[side][i] === 0) break;
      best = i;
      if (this.graspTime[side][i] <= want) break;
    }
    const xyz = this.graspXYZ[side];
    return this.pinchAt.set(xyz[best * 3], xyz[best * 3 + 1], xyz[best * 3 + 2]);
  }

  // ---- picking things up -----------------------------------------------------------

  /** A free hand's pinch: a fish from the ice, a saku or scrap on the board, or a sheet of paper. */
  private updatePick(side: Side, board: Material | null, step: PrepStep | undefined): void {
    const hand = hands.all[side];
    const state = chef.hands[side];
    if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None || this.carried[side]) return;
    // A pull step's grips are taken by updatePull.
    if (step?.kind === 'pull' && ((side === chef.netaSide && this.netaGrip) || (side === chef.riceSide && this.riceGrip))) return;
    const at = this.pinchPoint(side);
    const paperBox = overStation(at, StationKind.PaperBox) || overStation(hand.grasp, StationKind.PaperBox);
    const loose = paperBox ? null : this.looseAt(at, board, step);
    if (loose) {
      if (state.needsWash && loose.kind === 'product') return this.washFirst(StationKind.CuttingBoard);
      this.carry(side, { kind: 'loose', loose });
      state.holding = Held.Saku;
      this.grabOffset[side].copy(this.worldOf(loose, 0)).sub(hand.grasp);
      return;
    }
    if (paperBox) {
      const mesh = paperSheet();
      this.world.createTransformEntity(mesh);
      this.carry(side, { kind: 'paper', mesh, used: false });
      state.holding = Held.Paper;
      this.wipeRub.reset();
      console.log('[Prep] a sheet of kitchen paper');
      return;
    }
    if (side !== chef.netaSide || board) return;
    const m = this.materialAt(at);
    if (!m) return;
    if (state.needsWash) return this.washFirst(StationKind.IceBox);
    this.carry(side, { kind: 'material', m });
    m.state = 'held';
    state.holding = Held.Saku;
    this.grabOffset[side].copy(m.root.position).sub(hand.grasp);
    console.log(`[Prep] took the ${PREP[m.id].name.toLowerCase()} from the ice`);
  }

  private washFirst(at: (typeof StationKind)[keyof typeof StationKind]): void {
    feedback.flash(at, COLOR_WARN);
    coach.mistake('washFirst', at);
    console.log('[Prep] wash your hands before touching the fish');
  }

  /** The highest material in the box under a point. */
  private materialAt(p: Vector3): Material | null {
    let best: Material | null = null;
    for (const m of this.materials) {
      if (m.state !== 'box') continue;
      const r = m.root.position;
      const { halfWidth, length, top } = m.look;
      const inside = Math.abs(p.x - r.x) < halfWidth + 0.03 && Math.abs(p.z - r.z) < length / 2 + 0.03 && p.y > r.y - 0.02 && p.y < r.y + top + 0.07;
      if (inside && (!best || r.y > best.root.position.y)) best = m;
    }
    return best;
  }

  /** The nearest saku (once the work is done) or scrap under a point. */
  private looseAt(p: Vector3, board: Material | null, step: PrepStep | undefined): Loose | null {
    let best: Loose | null = null;
    let bestD = PICK_RADIUS;
    for (const l of this.loose) {
      if (l.done) continue;
      if (l.kind === 'product' && (l.m !== board || step)) continue;
      const c = this.centreOf(l, this.tmp);
      const along = l.alongX ? Math.abs(p.x - c.x) : Math.abs(p.z - c.z);
      const across = l.alongX ? Math.abs(p.z - c.z) : Math.abs(p.x - c.x);
      const d = Math.hypot(across, Math.max(0, along - l.length / 2));
      if (d < bestD && Math.abs(p.y - c.y) < 0.08) {
        best = l;
        bestD = d;
      }
    }
    return best;
  }

  /** World position of a loose piece's part i (its home, or wherever it is now). */
  private worldOf(l: Loose, i: number): Vector3 {
    const p = l.parts[i];
    return this.tmp2.copy(p.position).add(l.m && p.parent === l.m.root ? l.m.root.position : this.zero);
  }
  private readonly zero = new Vector3();

  private centreOf(l: Loose, out: Vector3): Vector3 {
    return out.copy(this.worldOf(l, 0)).add(l.centre);
  }

  // ---- carrying and letting go ---------------------------------------------------------

  /** What a hand carries of the prep; shared, as chef.hands' holding does not cover it. */
  private carry(side: Side, c: Carried | null): void {
    this.carried[side] = c;
    prep.carrying[side] = c !== null;
  }

  private updateCarried(side: Side): void {
    const c = this.carried[side];
    if (!c) return;
    const hand = hands.all[side];
    if (hand.tracked) this.follow(c, side);
    if (hand.tracked && !hand.pinchEnd) return;
    this.carry(side, null);
    chef.hands[side].holding = Held.None;
    const at = hand.grasp;
    if (c.kind === 'material') return this.releaseMaterial(c.m, at);
    if (c.kind === 'paper') return this.releasePaper(c, at);
    this.releaseLoose(c.loose, at);
  }

  private follow(c: Carried, side: Side): void {
    const g = hands.all[side].grasp;
    if (c.kind === 'material') {
      c.m.root.position.copy(g).add(this.grabOffset[side]);
    } else if (c.kind === 'paper') {
      c.mesh.position.copy(g);
    } else {
      const l = c.loose;
      const parent = l.m && l.parts[0].parent === l.m.root ? l.m.root.position : this.zero;
      // part 0 to the hand (plus the grab offset), the others keep their places around it
      const target = this.tmp.copy(g).add(this.grabOffset[side]).sub(parent);
      for (let i = 0; i < l.parts.length; i++) l.parts[i].position.copy(target).add(l.home[i]).sub(l.home[0]);
    }
  }

  private releaseMaterial(m: Material, at: Vector3): void {
    const board = stations.get(StationKind.CuttingBoard);
    if (board && overStation(at, StationKind.CuttingBoard) && !this.boardMaterial()) {
      m.root.position.set(board.pos.x, board.pos.y, board.pos.z);
      m.state = 'board';
      m.step = 0;
      prep.boardUsed = true;
      feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
      coach.done('takeMaterial');
      console.log(`[Prep] the ${PREP[m.id].name.toLowerCase()} is on the board`);
      return;
    }
    m.root.position.copy(m.slot);
    m.state = 'box';
  }

  private releasePaper(c: Extract<Carried, { kind: 'paper' }>, at: Vector3): void {
    if (overStation(at, StationKind.TrashBin) || !c.used) {
      // Thrown away (or an unused sheet put back in its box).
      c.mesh.visible = false;
      c.mesh.removeFromParent();
      if (c.used) this.thrown('paper');
      return;
    }
    // A used sheet left lying: one more scrap on the board.
    const board = stations.get(StationKind.CuttingBoard);
    if (board) c.mesh.position.set(board.pos.x + SCRAP_X, board.pos.y + 0.002, board.pos.z - 0.06);
    this.loose.push({ kind: 'scrap', m: null, parts: [c.mesh], home: [c.mesh.position.clone()], centre: new Vector3(), length: 0.1, product: null, done: false });
  }

  private releaseLoose(l: Loose, at: Vector3): void {
    if (l.kind === 'scrap') {
      if (overStation(at, StationKind.TrashBin)) {
        l.done = true;
        for (const p of l.parts) p.visible = false;
        this.thrown(l.parts[0].name);
        return;
      }
      this.putHome(l);
      return;
    }
    const product = l.product!;
    if (product.dest === 'case' && overStation(at, StationKind.NetaCase)) {
      l.done = true;
      for (const p of l.parts) p.visible = false;
      const stock = l.stock ?? NETA[product.neta].stock;
      this.caseItems.get(product.neta)?.setValue(CaseItem, 'remaining', stock);
      this.yieldGot += stock;
      this.yieldFull += NETA[product.neta].stock;
      feedback.flash(StationKind.NetaCase, COLOR_DONE);
      coach.done('stockSaku');
      console.log(`[Prep] ${product.neta} in the case (${stock} of ${NETA[product.neta].stock})`);
    } else if (product.dest === 'ice' && overStation(at, StationKind.IceBox)) {
      l.done = true;
      // Back on the ice where the bonito lay, to be seared later.
      const m = l.m!;
      const target = this.tmp.copy(m.slot).sub(m.root.position).sub(l.centre).add(this.tmp2.set(0, l.centre.y + 0.004, 0));
      for (let i = 0; i < l.parts.length; i++) l.parts[i].position.copy(target).add(l.home[i]).sub(l.home[0]);
      feedback.flash(StationKind.IceBox, COLOR_DONE);
      coach.done('stockSaku');
      console.log(`[Prep] ${product.neta} back on the ice, to be seared`);
    } else {
      this.putHome(l);
      return;
    }
    const m = l.m!;
    if (m.loose.every((x) => x.kind !== 'product' || x.done)) this.finish(m);
  }

  private putHome(l: Loose): void {
    for (let i = 0; i < l.parts.length; i++) l.parts[i].position.copy(l.home[i]);
  }

  private thrown(what: string): void {
    feedback.flash(StationKind.TrashBin, COLOR_DONE);
    coach.done('discardScrap');
    console.log(`[Prep] ${what} in the trash`);
  }

  // ---- the work on the board -------------------------------------------------------------

  /** Where a cut's guide line lies (world): its middle, and whether it runs across the board. */
  private lineOf(m: Material, s: Extract<PrepStep, { kind: 'cut' }>, out: Vector3): Vector3 {
    const r = m.root.position;
    const y = r.y + (s.low ? 0.006 : m.look.top);
    return s.axis === 'z' ? out.set(r.x + s.at, y, r.z + s.mid) : out.set(r.x + s.mid, y, r.z + s.at);
  }

  private updateCut(m: Material, s: Extract<PrepStep, { kind: 'cut' }>): void {
    const line = this.lineOf(m, s, this.tmp);
    const across = s.axis === 'x';
    this.guide.visible = knifeApi.held;
    this.guide.position.copy(line).add(this.tmp2.set(0, 0.003, 0));
    this.guide.scale.set(across ? s.len : 0.003, 1, across ? 0.003 : s.len);
    if (!knifeApi.held) {
      this.cutStart = null;
      return;
    }
    const blade = knifeApi.blade;
    const neta = hands.all[chef.netaSide];
    const r = m.root.position;
    const holdingDown =
      neta.tracked && Math.hypot(neta.palm.x - r.x, neta.palm.z - r.z) < m.look.halfWidth + m.look.length / 2 + 0.06 && neta.palm.y < r.y + m.look.top + 0.15;
    // Along the line, the blade within reach of it; a shave runs low, flat along the board.
    const off = across ? Math.abs(blade.z - line.z) : Math.abs(blade.x - line.x);
    const along = across ? blade.x - line.x : blade.z - line.z;
    const height = s.low ? blade.y < r.y + LOW_BLADE : blade.y < line.y + 0.1;
    const over = off < ON_LINE && Math.abs(along) < s.len / 2 + CUT_STROKE + 0.04 && height;
    if (!holdingDown || !over) {
      this.cutStart = null;
      return;
    }
    const pos = across ? blade.x : blade.z;
    if (this.cutStart === null) {
      this.cutStart = pos;
      this.offSum = this.offCount = 0;
    }
    this.offSum += off;
    this.offCount++;
    // Toward the chef along the fish; across it, either way.
    const travel = across ? Math.abs(pos - this.cutStart) : pos - this.cutStart;
    if (travel < CUT_STROKE) return;
    this.cutStart = null;
    const mean = this.offSum / Math.max(1, this.offCount);
    const grade: Grade = mean < PREP_CUT_EXCELLENT ? 'Excellent' : mean < PREP_CUT_GOOD ? 'Good' : mean < PREP_CUT_POOR ? 'Poor' : 'Bad';
    m.grades.push(grade);
    chef.knifeDirty = true;
    chef.boardDirt = Math.min(1, chef.boardDirt + BOARD_DIRT_PER_CUT);
    coach.done('cutPrep');
    console.log(`[Prep] ${s.say.toLowerCase()} (${PREP[m.id].name.toLowerCase()}, step ${m.step + 1}): ${grade}, ${(mean * 1000).toFixed(1)} mm off the line`);
    this.stepDone(m, s);
  }

  private updatePull(m: Material, s: Extract<PrepStep, { kind: 'pull' }>): void {
    const neta = hands.all[chef.netaSide];
    const rice = hands.all[chef.riceSide];
    const netaAt = this.tmp.copy(m.root.position).add(s.netaAt);
    const riceAt = this.tmp2.copy(m.root.position).add(s.riceAt);
    if (neta.tracked && neta.pinchStart && chef.hands[chef.netaSide].holding === Held.None && this.pinchPoint(chef.netaSide).distanceTo(netaAt) < 0.09) {
      if (chef.hands[chef.netaSide].needsWash) this.washFirst(StationKind.CuttingBoard);
      else this.netaGrip = true;
    }
    if (rice.tracked && rice.pinchStart && chef.hands[chef.riceSide].holding === Held.None && this.pinchPoint(chef.riceSide).distanceTo(riceAt) < 0.09) {
      if (chef.hands[chef.riceSide].needsWash) this.washFirst(StationKind.CuttingBoard);
      else this.riceGrip = true;
    }
    if (!neta.pinch || !neta.tracked) this.netaGrip = false;
    if (!rice.pinch || !rice.tracked) this.riceGrip = false;
    const parts = s.parts.map((n) => m.parts.get(n)).filter((p): p is Object3D => !!p);
    if (!this.netaGrip || !this.riceGrip) {
      if (this.pullStart !== null) parts.forEach((p, i) => p.position.copy(this.pullHome[i]));
      this.pullStart = null;
      return;
    }
    if (this.pullStart === null) {
      this.pullStart = neta.grasp.distanceTo(rice.grasp);
      this.pullFrom.copy(rice.grasp);
      parts.forEach((p, i) => (this.pullHome[i] ??= new Vector3()).copy(p.position));
    }
    const moved = this.tmp.copy(rice.grasp).sub(this.pullFrom);
    parts.forEach((p, i) => p.position.copy(this.pullHome[i]).add(moved));
    if (neta.grasp.distanceTo(rice.grasp) - this.pullStart < SQUID_PULL_DISTANCE) return;
    parts.forEach((p, i) => p.position.copy(this.pullHome[i]));
    this.pullStart = null;
    this.netaGrip = this.riceGrip = false;
    m.grades.push('Excellent');
    coach.done('pullPrep');
    console.log(`[Prep] ${s.say.toLowerCase()} (${PREP[m.id].name.toLowerCase()})`);
    this.stepDone(m, s);
  }

  /** Kitchen paper in either hand, rubbed over the material. */
  private updateWipe(m: Material): void {
    for (const side of [chef.netaSide, chef.riceSide]) {
      const c = this.carried[side];
      if (c?.kind !== 'paper') continue;
      const g = hands.all[side].grasp;
      const r = m.root.position;
      const over = Math.abs(g.x - r.x) < m.look.halfWidth + 0.08 && Math.abs(g.z - r.z) < m.look.length / 2 + 0.02 && g.y < r.y + m.look.top + 0.06;
      if (this.wipeRub.update(g, over) < RUB_WIPE_BOARD) continue;
      this.wipeRub.reset();
      c.used = true;
      c.mesh.material = usedPaper;
      m.grades.push('Excellent');
      coach.done('wipePaper');
      console.log(`[Prep] patted dry (${PREP[m.id].name.toLowerCase()})`);
      this.stepDone(m, m.look.steps[m.step]);
      return;
    }
  }

  /** A step done: its effects, then the next step (or the saku, once all are done). */
  private stepDone(m: Material, s: PrepStep): void {
    for (const [name, dx, dz] of s.shift ?? []) m.parts.get(name)?.position.add(this.tmp.set(dx, 0, dz));
    for (const name of s.hide ?? []) {
      const p = m.parts.get(name);
      if (p) p.visible = false;
    }
    for (const name of s.show ?? []) {
      const p = m.parts.get(name);
      if (p) p.visible = true;
    }
    for (const name of s.scrap ?? []) this.toScrap(m, name);
    m.step++;
    feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
    if (m.step < m.look.steps.length) return;
    // Every step done: the saku lie ready. Each crooked cut cost a slice or more, shared out among them.
    let loss = m.grades.reduce((sum, g) => sum + PREP_YIELD_LOSS[g], 0);
    const forCase = m.look.products.filter((p) => p.dest === 'case');
    const lost = forCase.map(() => 0);
    for (let i = 0; loss > 0 && forCase.length; i++, loss--) lost[i % forCase.length]++;
    for (const product of m.look.products) {
      const parts = product.parts.map((n) => m.parts.get(n)!);
      const full = NETA[product.neta].stock;
      const k = forCase.indexOf(product);
      const l: Loose = {
        kind: 'product', m, parts, home: parts.map((p) => p.position.clone()), centre: m.centres.get(product.parts[0])!.clone(),
        length: this.lengthOf(m, product.parts[0]), product, stock: k < 0 ? full : Math.max(Math.ceil(full / 2), full - lost[k]), done: false,
      };
      m.loose.push(l);
      this.loose.push(l);
    }
  }

  // ---- the cook and the part-timer ---------------------------------------------------

  /** With the cook asked (and at the ice box), the fish still in it go to the back one by one and come out as full saku. */
  private updateCook(delta: number): void {
    staff.boxLeft = this.materials.filter((x) => x.state === 'box').length;
    if (!this.cooking && staff.cook && staff.cookReady) {
      const m = this.materials.filter((x) => x.state === 'box').sort((a, b) => b.slot.y - a.slot.y)[0];
      if (m) {
        staff.cookReady = false;
        m.state = 'cook';
        m.root.visible = false;
        this.cooking = m;
        this.cookLeft = COOK_SECONDS;
        staff.cookOn = PREP[m.id].name;
        console.log(`[Prep] the cook takes the ${PREP[m.id].name.toLowerCase()} to the back`);
      }
    }
    const m = this.cooking;
    if (!m) return;
    this.cookLeft -= delta;
    if (this.cookLeft > 0) return;
    this.cooking = null;
    staff.cookOn = '';
    for (const product of m.look.products) {
      if (product.dest !== 'case') continue;
      const stock = NETA[product.neta].stock;
      this.caseItems.get(product.neta)?.setValue(CaseItem, 'remaining', stock);
      this.yieldGot += stock;
      this.yieldFull += stock;
    }
    ledger.wage('cook', 'saku-taking', COOK_MINUTES[m.id] ?? 0);
    feedback.flash(StationKind.NetaCase, COLOR_DONE);
    console.log(`[Prep] the cook has put the ${PREP[m.id].name.toLowerCase()} saku in the case`);
    this.finish(m);
  }

  /** The part-timer's cleaning: every scrap on the board into the trash (one in a hand stays there). */
  private clearScraps(): void {
    for (const l of this.loose) {
      if (l.kind !== 'scrap' || l.done || this.carried.some((c) => c?.kind === 'loose' && c.loose === l)) continue;
      l.done = true;
      for (const p of l.parts) p.visible = false;
    }
    prep.scrapsLeft = this.loose.filter((l) => l.kind === 'scrap' && !l.done).length + this.carried.filter((c) => c?.kind === 'paper').length;
  }

  private lengthOf(m: Material, name: string): number {
    const p = m.parts.get(name)!;
    return new Box3().setFromObject(p, true).getSize(this.tmp).z;
  }

  /** A freed scrap goes to the pile on the board's left, to be thrown away. */
  private toScrap(m: Material, name: string): void {
    const p = m.parts.get(name);
    if (!p) return;
    const n = this.loose.filter((l) => l.kind === 'scrap').length;
    const big = name === 'Plastic' || name === 'Paper';
    // Laid across the board (its long side along X), the wrapping crumpled smaller.
    p.rotation.y = 0;
    if (big) p.scale.set(0.45, 0.6, 0.45);
    const geometry = (p as Mesh).geometry;
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const centre = bb.getCenter(new Vector3()).multiply(p.scale);
    const length = (bb.max.x - bb.min.x) * p.scale.x;
    // Its centre to the pile spot (root-local), in rows toward the back, stacked a little.
    p.position.set(SCRAP_X - centre.x, 0.002 + (n % 4) * 0.004 - (bb.min.y * p.scale.y), SCRAP_Z - (n % 4) * 0.035 - centre.z);
    p.visible = true;
    const l: Loose = { kind: 'scrap', m, parts: [p], home: [p.position.clone()], centre, length, alongX: true, product: null, done: false };
    m.loose.push(l);
    this.loose.push(l);
  }

  private finish(m: Material): void {
    m.state = 'done';
    prep.tasksDone++;
    if (m.grades.length) {
      const score = Math.round(m.grades.reduce((s, g) => s + GRADE_POINTS[g], 0) / m.grades.length);
      console.log(`[Prep] ${PREP[m.id].name} done: ${score}`);
    }
    if (prep.tasksDone < prep.tasksTotal) return;
    prep.done = true;
    const all = this.materials.flatMap((x) => x.grades);
    const total = Math.round(all.reduce((s, g) => s + GRADE_POINTS[g], 0) / Math.max(1, all.length));
    const grade: Grade = total >= 90 ? 'Excellent' : total >= 75 ? 'Good' : total >= 55 ? 'Poor' : 'Bad';
    const pct = Math.round((100 * this.yieldGot) / Math.max(1, this.yieldFull));
    setSpriteText(this.summary, all.length ? `Prep done: ${grade}, yield ${pct}%` : 'Prep done by the cook');
    const board = stations.get(StationKind.CuttingBoard);
    if (board) this.summary.position.copy(board.pos).add(this.tmp.set(0, 0.32, -0.05));
    this.summary.visible = true;
    this.summaryTime = RESULT_SECONDS * 2;
    console.log(`[Prep] all prep done${all.length ? `: ${grade} ${total}` : ' by the cook'}, yield ${this.yieldGot}/${this.yieldFull} slices; now clean up`);
  }

  // ---- what comes next (master, practice, hints) ------------------------------------

  private publish(): void {
    prep.next = null;
    prep.onBoard = '';
    prep.say = '';
    prep.guideAcross = prep.guideLow = false;
    const trash = stations.get(StationKind.TrashBin);
    if (trash) prep.trashAt.copy(trash.pos);
    const paper = stations.get(StationKind.PaperBox);
    if (paper) prep.paperAt.copy(paper.pos);
    if (!prep.delivered) {
      prep.next = prep.ordered ? 'wait' : 'call';
      return;
    }
    const m = this.boardMaterial();
    if (m) {
      prep.onBoard = m.id;
      const r = m.root.position;
      prep.materialAt.copy(r).add(this.tmp.set(0, m.look.top, 0));
      const s = m.look.steps[m.step];
      if (s) prep.say = s.say;
      if (s?.kind === 'cut') {
        prep.next = 'cut';
        this.lineOf(m, s, prep.guideAt);
        prep.guideLength = s.len;
        prep.guideAcross = s.axis === 'x';
        prep.guideLow = !!s.low;
        return;
      }
      if (s?.kind === 'pull') {
        prep.next = 'pull';
        prep.pullNeta.copy(r).add(s.netaAt);
        prep.pullRice.copy(r).add(s.riceAt);
        return;
      }
      if (s?.kind === 'wipe') {
        prep.next = 'wipe';
        return;
      }
      const p = m.loose.find((x) => x.kind === 'product' && !x.done);
      if (p) {
        prep.next = 'stock';
        this.centreOf(p, prep.productAt);
        if (p.product!.dest === 'ice') prep.slotAt.copy(m.slot).add(this.tmp.set(0, 0.02, 0));
        else {
          const home = this.caseHomes.get(p.product!.neta);
          if (home) prep.slotAt.copy(home);
        }
        return;
      }
    }
    // The one on top comes out first.
    const held = this.materials.find((x) => x.state === 'held');
    const next = held ?? this.materials.filter((x) => x.state === 'box').sort((a, b) => b.slot.y - a.slot.y)[0];
    if (next) {
      prep.next = 'take';
      // Picked up at its near end (toward the chef), on its top.
      prep.boxAt.copy(next.slot).add(this.tmp.set(0, next.look.top + 0.012, next.look.length / 2 - 0.04));
      return;
    }
    const scrap = this.loose.find((l) => l.kind === 'scrap' && !l.done);
    if (scrap) {
      prep.next = 'discard';
      this.centreOf(scrap, prep.scrapAt);
    }
  }

  private hints(): void {
    switch (prep.next) {
      case 'take':
        feedback.hints.add(this.carried[chef.netaSide] ? StationKind.CuttingBoard : StationKind.IceBox);
        break;
      case 'cut':
        feedback.hints.add(knifeApi.held ? StationKind.CuttingBoard : StationKind.Knife);
        break;
      case 'pull':
        feedback.hints.add(StationKind.CuttingBoard);
        break;
      case 'wipe':
        feedback.hints.add(this.carried.some((c) => c?.kind === 'paper') ? StationKind.CuttingBoard : StationKind.PaperBox);
        break;
      case 'stock':
        feedback.hints.add(this.carried[chef.netaSide] ? StationKind.NetaCase : StationKind.CuttingBoard);
        break;
      case 'discard':
        feedback.hints.add(this.carried.some((c) => c?.kind === 'loose') ? StationKind.TrashBin : StationKind.CuttingBoard);
        break;
    }
  }
}
