import { Box3, BoxGeometry, createSystem, type Entity, Mesh, MeshBasicMaterial, type Object3D, type Sprite, Vector3 } from '@iwsdk/core';
import { coach, type Grade } from './coach.js';
import { knifeApi } from './cutting-system.js';
import { debugLines } from './debug.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { chef, prep } from './game-state.js';
import { hands } from './hands.js';
import { NETA, type NetaId } from './menu.js';
import { ICE_BOX_ORDER, isPrepped, PREP, type PrepId, prepTasks } from './prep.js';
import { type PrepMaterialLook, type PrepStep, prepMaterialLook } from './scene-assets/lib/prep-look.js';
import { overStation, stations } from './station-system.js';
import { CaseItem, Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import {
  BOARD_DIRT_PER_CUT,
  CUT_STROKE,
  PREP_CUT_EXCELLENT,
  PREP_CUT_GOOD,
  PREP_CUT_POOR,
  PREP_STAGE,
  RESULT_SECONDS,
  SQUID_PULL_DISTANCE,
} from './tuning.js';

/** Where each material lies in the ice box (box-local x); the box's long side faces the chef. */
const SLOT_X: Partial<Record<PrepId, number>> = { TunaBelly: 0.08, BonitoLoin: -0.03, Squid: -0.105 };
/** A pinch this close (across) to a material or a saku picks it up. */
const PICK_SLACK = 0.03;
/** The nearest saku on the board within this (across, beyond its ends) is picked. */
const PICK_RADIUS = 0.08;
/** The fingers move the pinch point as they close: judge where they were this long before. */
const PINCH_LOOKBACK = 0.15;
const HISTORY = 24;
/** How far the blade may stray from the guide line and still count as cutting along it. */
const ON_LINE = 0.03;
const GRADE_POINTS: Record<Grade, number> = { Excellent: 100, Good: 80, Poor: 60, Bad: 40 };

interface Product {
  part: Object3D;
  neta: NetaId;
  /** Where it lies on the board (root-local part position), and its centre relative to that position. */
  home: Vector3;
  centre: Vector3;
  length: number;
  stocked: boolean;
}

interface Material {
  id: PrepId;
  look: PrepMaterialLook;
  root: Object3D;
  /** The root's place in the ice box (world). */
  slot: Vector3;
  state: 'box' | 'held' | 'board' | 'done';
  step: number;
  parts: Map<string, Object3D>;
  products: Product[];
  grades: Grade[];
}

/**
 * Saku-taking (柵取り) in the morning prep, on the itaba manaita.
 *  - The case items the prep fills start the day empty.
 *  - The neta hand (washed) takes a material from the ice box and lays it on
 *    the board, its length toward the chef.
 *  - With the neta hand steadying it, the knife is drawn toward the chef
 *    along each white guide line; the squid's legs are first pulled out of
 *    its body with both hands.
 *  - Each saku cut free is pinched and let go over the case: it fills its
 *    item. When every task is done the hands need washing, and the opening
 *    wash opens the bar (src/hygiene-system.ts); the ice box is put away.
 */
export class PrepCutSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private readonly materials: Material[] = [];
  private readonly caseItems = new Map<NetaId, Entity>();
  private readonly caseHomes = new Map<NetaId, Vector3>();
  private held: Material | null = null;
  private heldProduct: Product | null = null;
  private readonly grabOffset = new Vector3();
  private cutStartZ: number | null = null;
  private offSum = 0;
  private offCount = 0;
  private netaGrip = false;
  private riceGrip = false;
  private pullStart: number | null = null;
  private readonly pullFrom = new Vector3();
  private readonly legsHome = new Vector3();
  private guide!: Mesh<BoxGeometry, MeshBasicMaterial>;
  private summary!: Sprite;
  private summaryTime = 0;
  private built = false;
  private cleared = false;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly pinchAt = new Vector3();
  private time = 0;
  /** Per hand, a ring of (time, grasp point). */
  private readonly graspTime = [new Float64Array(HISTORY), new Float64Array(HISTORY)];
  private readonly graspXYZ = [new Float32Array(HISTORY * 3), new Float32Array(HISTORY * 3)];
  private readonly graspHead = [0, 0];

  init(): void {
    this.guide = new Mesh(new BoxGeometry(0.003, 0.002, 1), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
    this.guide.name = 'PrepCutGuide';
    this.guide.visible = false;
    this.world.createTransformEntity(this.guide);
    this.summary = makeTextSprite(' ', { width: 0.36 });
    this.summary.name = 'PrepSummary';
    this.summary.visible = false;
    this.world.createTransformEntity(this.summary);
    this.cleanupFuncs.push(this.queries.items.subscribe('qualify', (e) => this.seeCaseItem(e)));
    for (const e of this.queries.items.entities) this.seeCaseItem(e);
    prep.tasksTotal = prepTasks(PREP_STAGE).length;
    debugLines.push(() => {
      if (!prep.active) return 'Prep: done, the bar is open';
      const board = this.boardMaterial();
      const on = board ? ` | on the board: ${board.id} step ${board.step + 1}/${board.look.steps.length}` : '';
      return `Prep: ${prep.tasksDone}/${prep.tasksTotal} done${prep.done ? ' (wash, then open)' : ''} | next ${prep.next ?? '-'}${on}`;
    });
  }

  /** Remember where each case item sits; the ones the prep fills start empty. */
  private seeCaseItem(entity: Entity): void {
    const neta = entity.getValue(CaseItem, 'neta') as NetaId;
    this.caseItems.set(neta, entity);
    if (entity.object3D) this.caseHomes.set(neta, entity.object3D.position.clone());
    if (prep.active && isPrepped(neta, PREP_STAGE)) entity.setValue(CaseItem, 'remaining', 0);
  }

  /** The morning's materials, laid in the ice box once it exists. */
  private build(): boolean {
    if (this.built) return true;
    const box = stations.get(StationKind.IceBox);
    if (!box) return false;
    for (const id of ICE_BOX_ORDER) {
      if (PREP[id].stage > PREP_STAGE) continue;
      const look = prepMaterialLook(id);
      if (!look) continue;
      const root = look.root;
      const parts = new Map<string, Object3D>();
      root.traverse((o) => {
        if (o !== root && o.name) parts.set(o.name, o);
      });
      // Part centres, measured with the root still at the origin (root-local).
      root.updateMatrixWorld(true);
      const products = look.products.map(({ part, neta }): Product => {
        const object = parts.get(part)!;
        const bounds = new Box3().setFromObject(object, true);
        const centre = bounds.getCenter(new Vector3()).sub(object.position);
        return { part: object, neta, home: object.position.clone(), centre, length: bounds.max.z - bounds.min.z, stocked: false };
      });
      const slot = new Vector3(box.pos.x + (SLOT_X[id] ?? 0), box.pos.y, box.pos.z);
      root.position.copy(slot);
      this.world.createTransformEntity(root);
      this.materials.push({ id, look, root, slot, state: 'box', step: 0, parts, products, grades: [] });
    }
    this.built = true;
    return true;
  }

  update(delta: number): void {
    if (!this.build()) return;
    this.time += delta;
    this.recordGrasps();
    if (this.summaryTime > 0) {
      this.summaryTime -= delta;
      if (this.summaryTime <= 0) this.summary.visible = false;
    }
    if (!prep.active) {
      if (!this.cleared) this.clearAway();
      return;
    }
    this.updateHeld();
    const board = this.boardMaterial();
    if (board && !this.held) {
      const step = board.look.steps[board.step];
      if (step?.kind === 'cut') this.updateCut(board, step);
      else if (step?.kind === 'pull') this.updatePull(board, step);
      else this.updateStock(board);
    } else {
      this.guide.visible = false;
      if (!this.held) this.updateTake();
    }
    this.publish();
    this.hints();
  }

  /** The bar is open: the ice box and what is left in it are put away. */
  private clearAway(): void {
    this.cleared = true;
    this.guide.visible = false;
    for (const m of this.materials) m.root.visible = false;
    const box = stations.get(StationKind.IceBox);
    if (box?.entity.object3D) box.entity.object3D.visible = false;
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

  private boardMaterial(): Material | null {
    for (const m of this.materials) if (m.state === 'board') return m;
    return null;
  }

  // ---- taking from the ice box ---------------------------------------------------

  private updateTake(): void {
    const side = chef.netaSide;
    const hand = hands.all[side];
    if (!hand.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None) return;
    const m = this.materialAt(this.pinchPoint(side));
    if (!m) return;
    if (chef.hands[side].needsWash) {
      feedback.flash(StationKind.IceBox, COLOR_WARN);
      coach.mistake('washFirst', StationKind.IceBox);
      console.log('[Prep] wash your hands before touching the fish');
      return;
    }
    this.held = m;
    m.state = 'held';
    chef.hands[side].holding = Held.Saku;
    this.grabOffset.copy(m.root.position).sub(hand.grasp);
    console.log(`[Prep] took the ${PREP[m.id].name.toLowerCase()} from the ice`);
  }

  /** The material in the box under a pinch, if any. */
  private materialAt(p: Vector3): Material | null {
    for (const m of this.materials) {
      if (m.state !== 'box') continue;
      const r = m.root.position;
      const { halfWidth, length, top } = m.look;
      if (Math.abs(p.x - r.x) < halfWidth + PICK_SLACK && Math.abs(p.z - r.z) < length / 2 + PICK_SLACK && p.y > r.y - 0.02 && p.y < r.y + top + 0.06) return m;
    }
    return null;
  }

  /** A material or a saku in the neta hand, following it; let go on the board, over the case, or back. */
  private updateHeld(): void {
    const side = chef.netaSide;
    const hand = hands.all[side];
    if (this.held) {
      const m = this.held;
      if (hand.tracked) m.root.position.copy(hand.grasp).add(this.grabOffset);
      if (hand.tracked && !hand.pinchEnd) return;
      chef.hands[side].holding = Held.None;
      this.held = null;
      const board = stations.get(StationKind.CuttingBoard);
      if (board && overStation(hand.grasp, StationKind.CuttingBoard) && !this.boardMaterial()) {
        m.root.position.set(board.pos.x, board.pos.y, board.pos.z);
        m.state = 'board';
        m.step = 0;
        feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
        coach.done('takeMaterial');
        console.log(`[Prep] the ${PREP[m.id].name.toLowerCase()} is on the board`);
      } else {
        m.root.position.copy(m.slot);
        m.state = 'box';
      }
    }
  }

  // ---- cutting along a guide line --------------------------------------------------

  private updateCut(m: Material, step: Extract<PrepStep, { kind: 'cut' }>): void {
    const r = m.root.position;
    const gx = r.x + step.x;
    const gz = r.z + step.z0;
    const gy = r.y + m.look.top;
    this.guide.visible = knifeApi.held;
    this.guide.position.set(gx, gy + 0.003, gz);
    this.guide.scale.z = step.len;
    if (!knifeApi.held) {
      this.cutStartZ = null;
      return;
    }
    const blade = knifeApi.blade;
    const neta = hands.all[chef.netaSide];
    const holdingDown =
      neta.tracked && Math.hypot(neta.palm.x - r.x, neta.palm.z - gz) < m.look.halfWidth + 0.12 && neta.palm.y < gy + 0.15;
    const over = Math.abs(blade.x - gx) < ON_LINE && Math.abs(blade.z - gz) < step.len / 2 + CUT_STROKE + 0.04 && blade.y < gy + 0.1;
    if (!holdingDown || !over) {
      this.cutStartZ = null;
      return;
    }
    if (this.cutStartZ === null) {
      this.cutStartZ = blade.z;
      this.offSum = this.offCount = 0;
    }
    this.offSum += Math.abs(blade.x - gx);
    this.offCount++;
    if (blade.z - this.cutStartZ < CUT_STROKE) return;
    this.cutStartZ = null;
    const off = this.offSum / Math.max(1, this.offCount);
    const grade: Grade = off < PREP_CUT_EXCELLENT ? 'Excellent' : off < PREP_CUT_GOOD ? 'Good' : off < PREP_CUT_POOR ? 'Poor' : 'Bad';
    m.grades.push(grade);
    if (step.shift) {
      const part = m.parts.get(step.shift[0]);
      if (part) {
        part.position.x += step.shift[1];
        const product = m.products.find((p) => p.part === part);
        if (product) product.home.copy(part.position);
      }
    }
    if (step.scrap) this.toIceBox(m, step.scrap);
    if (step.swap) {
      const from = m.parts.get(step.swap[0]);
      const to = m.parts.get(step.swap[1]);
      if (from) from.visible = false;
      if (to) to.visible = true;
    }
    chef.knifeDirty = true;
    chef.boardDirt = Math.min(1, chef.boardDirt + BOARD_DIRT_PER_CUT);
    m.step++;
    this.guide.visible = false;
    feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
    coach.done('cutPrep');
    console.log(`[Prep] cut ${m.step} of ${m.look.steps.length} on the ${PREP[m.id].name.toLowerCase()}: ${grade} (${(off * 1000).toFixed(1)} mm off the line)`);
  }

  /** A scrap (the blood line, the squid's legs) is set aside on the ice, where the material came from. */
  private toIceBox(m: Material, name: string): void {
    const part = m.parts.get(name);
    if (!part) return;
    part.position.add(this.tmp.copy(m.slot).sub(m.root.position));
  }

  // ---- pulling the squid's legs out ---------------------------------------------------

  private updatePull(m: Material, step: Extract<PrepStep, { kind: 'pull' }>): void {
    this.guide.visible = false;
    const neta = hands.all[chef.netaSide];
    const rice = hands.all[chef.riceSide];
    const netaAt = this.tmp.copy(m.root.position).add(step.netaAt);
    const riceAt = this.tmp2.copy(m.root.position).add(step.riceAt);
    const legs = m.parts.get(step.ricePart);
    if (neta.tracked && neta.pinchStart && chef.hands[chef.netaSide].holding === Held.None && this.pinchPoint(chef.netaSide).distanceTo(netaAt) < 0.08) {
      if (chef.hands[chef.netaSide].needsWash) coach.mistake('washFirst', StationKind.CuttingBoard);
      else this.netaGrip = true;
    }
    if (rice.tracked && rice.pinchStart && chef.hands[chef.riceSide].holding === Held.None && this.pinchPoint(chef.riceSide).distanceTo(riceAt) < 0.08) {
      if (chef.hands[chef.riceSide].needsWash) coach.mistake('washFirst', StationKind.CuttingBoard);
      else this.riceGrip = true;
    }
    if (!neta.pinch || !neta.tracked) this.netaGrip = false;
    if (!rice.pinch || !rice.tracked) this.riceGrip = false;
    if (!this.netaGrip || !this.riceGrip) {
      if (this.pullStart !== null && legs) legs.position.copy(this.legsHome);
      this.pullStart = null;
      return;
    }
    if (this.pullStart === null) {
      this.pullStart = neta.grasp.distanceTo(rice.grasp);
      this.pullFrom.copy(rice.grasp);
      if (legs) this.legsHome.copy(legs.position);
    }
    if (legs) legs.position.copy(this.legsHome).add(this.tmp.copy(rice.grasp).sub(this.pullFrom));
    if (neta.grasp.distanceTo(rice.grasp) - this.pullStart < SQUID_PULL_DISTANCE) return;
    if (legs) legs.position.copy(this.legsHome);
    this.toIceBox(m, step.ricePart);
    this.pullStart = null;
    this.netaGrip = this.riceGrip = false;
    m.grades.push('Excellent');
    m.step++;
    feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
    coach.done('pullSquid');
    console.log('[Prep] the legs are out of the squid');
  }

  // ---- stocking the saku in the case ------------------------------------------------

  private updateStock(m: Material): void {
    this.guide.visible = false;
    const side = chef.netaSide;
    const hand = hands.all[side];
    const r = m.root.position;
    const p = this.heldProduct;
    if (!p) {
      if (!hand.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None) return;
      const at = this.pinchPoint(side);
      let best: Product | null = null;
      let bestD = PICK_RADIUS;
      for (const product of m.products) {
        if (product.stocked) continue;
        const c = this.tmp.copy(r).add(product.part.position).add(product.centre);
        const dz = Math.max(0, Math.abs(at.z - c.z) - product.length / 2);
        const d = Math.hypot(at.x - c.x, dz);
        if (d < bestD && Math.abs(at.y - c.y) < 0.07) {
          best = product;
          bestD = d;
        }
      }
      if (best) {
        this.heldProduct = best;
        chef.hands[side].holding = Held.Saku;
      }
      return;
    }
    // Carried by its middle.
    if (hand.tracked) p.part.position.copy(hand.grasp).sub(r).sub(p.centre);
    if (hand.tracked && !hand.pinchEnd) return;
    chef.hands[side].holding = Held.None;
    this.heldProduct = null;
    if (!overStation(hand.grasp, StationKind.NetaCase)) {
      p.part.position.copy(p.home);
      return;
    }
    p.stocked = true;
    p.part.visible = false;
    const item = this.caseItems.get(p.neta);
    item?.setValue(CaseItem, 'remaining', NETA[p.neta].stock);
    feedback.flash(StationKind.NetaCase, COLOR_DONE);
    coach.done('stockSaku');
    console.log(`[Prep] ${p.neta} saku in the case (${NETA[p.neta].stock})`);
    if (m.products.every((x) => x.stocked)) this.finish(m);
  }

  private finish(m: Material): void {
    m.state = 'done';
    prep.tasksDone++;
    const score = Math.round(m.grades.reduce((s, g) => s + GRADE_POINTS[g], 0) / Math.max(1, m.grades.length));
    console.log(`[Prep] ${PREP[m.id].name} done: ${score}`);
    if (prep.tasksDone < prep.tasksTotal) return;
    prep.done = true;
    // Fish on the hands: a wash with soap before the bar opens.
    for (const h of chef.hands) h.needsWash = true;
    const all = this.materials.flatMap((x) => x.grades);
    const total = Math.round(all.reduce((s, g) => s + GRADE_POINTS[g], 0) / Math.max(1, all.length));
    const grade: Grade = total >= 90 ? 'Excellent' : total >= 75 ? 'Good' : total >= 55 ? 'Poor' : 'Bad';
    setSpriteText(this.summary, `Prep done: ${grade} ${total}`);
    const board = stations.get(StationKind.CuttingBoard);
    if (board) this.summary.position.copy(board.pos).add(this.tmp.set(0, 0.32, -0.05));
    this.summary.visible = true;
    this.summaryTime = RESULT_SECONDS * 2;
    console.log(`[Prep] all prep done: ${grade} ${total}; wash before opening`);
  }

  // ---- what comes next (master, practice, hints) ------------------------------------

  private publish(): void {
    prep.next = null;
    prep.onBoard = '';
    const m = this.boardMaterial();
    if (m) {
      prep.onBoard = m.id;
      const r = m.root.position;
      prep.materialAt.copy(r).add(this.tmp.set(0, m.look.top, 0));
      const step = m.look.steps[m.step];
      if (step?.kind === 'cut') {
        prep.next = 'cut';
        prep.guideAt.set(r.x + step.x, r.y + m.look.top, r.z + step.z0);
        prep.guideLength = step.len;
      } else if (step?.kind === 'pull') {
        prep.next = 'pull';
        prep.pullNeta.copy(r).add(step.netaAt);
        prep.pullRice.copy(r).add(step.riceAt);
      } else {
        const p = m.products.find((x) => !x.stocked);
        if (p) {
          prep.next = 'stock';
          prep.productAt.copy(r).add(p.home).add(p.centre);
          const home = this.caseHomes.get(p.neta);
          if (home) prep.slotAt.copy(home);
        }
      }
      return;
    }
    const next = this.held ?? this.materials.find((x) => x.state === 'box');
    if (next) {
      prep.next = 'take';
      // Picked up at its near end (toward the chef).
      prep.boxAt.copy(next.slot).add(this.tmp.set(0, next.look.top, next.look.length / 2 - 0.04));
    }
  }

  private hints(): void {
    switch (prep.next) {
      case 'take':
        feedback.hints.add(this.held ? StationKind.CuttingBoard : StationKind.IceBox);
        break;
      case 'cut':
        feedback.hints.add(knifeApi.held ? StationKind.CuttingBoard : StationKind.Knife);
        break;
      case 'pull':
        feedback.hints.add(StationKind.CuttingBoard);
        break;
      case 'stock':
        feedback.hints.add(this.heldProduct ? StationKind.NetaCase : StationKind.CuttingBoard);
        break;
    }
  }
}
