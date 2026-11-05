import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  type Entity,
  Group,
  type Object3D,
  Matrix4,
  Mesh,
  Vector3,
  type World,
} from '@iwsdk/core';
import { coach } from '../coach.js';
import { COLOR_DONE, COLOR_WARN, feedback } from '../feedback.js';
import { chef, orderKind, orderNeta, progress, service } from '../game-state.js';
import type { HandReader } from '../hand-reader.js';
import { hands } from '../hands.js';
import { menuFor, NETA, type NetaId } from '../menu.js';
import { caseApi } from '../neta-case-system.js';
import type { PieceResult } from '../scoring.js';
import { caseLook, lookMaterial, noriMaterial, toolGeometry } from '../scene-assets/lib/neta-look.js';
import { patterned, weld } from '../scene-assets/lib/neta-paint.js';
import { overStation } from '../station-system.js';
import { GunkanStage, Held, NigiriStage, StationKind } from '../sushi-components.js';
import { JOIN_DISTANCE } from '../tuning.js';
import type { Assembly, PieceCore } from './types.js';

/** The rice inside the nori band: a low oval filling its lower part. */
const RICE_GUNKAN = new Vector3(0.8, 0.45, 0.62);
/** The nori band stands higher than the rice, so the topping sits inside it like a boat. */
const BAND_HEIGHT = 0.036;
/** The topping rests here on the rice (piece-local y). */
const TOP_Y = 0.026;
/**
 * Letting go of the tool over the gunkan puts the topping on: within this
 * distance of it seen from above (opening the fingers moves the pinch
 * point a few centimetres), and no higher than DROP_ABOVE above it.
 */
const DROP_RADIUS = 0.09;
const DROP_ABOVE = 0.15;

/**
 * Several copies of one piece geometry (uni lobes, roe beads), placed by
 * [x, y, z, yaw, scale?, shade?]; shade (0..1) deepens a lobe's colour
 * toward orange, as the lobes in one box differ.
 */
function heap(geometry: BufferGeometry, at: Array<[number, number, number, number, number?, number?]>): BufferGeometry {
  return weld(
    at.map(([x, y, z, ry, sc = 1, shade = 0]) => {
      const g = geometry.clone();
      const color = g.getAttribute('color');
      for (let i = 0; i < color.count; i++) color.setXYZ(i, 1, 1 - 0.2 * shade, 1 - 0.42 * shade);
      const m = new Matrix4().makeRotationY(ry).scale(new Vector3(sc, sc, sc)).setPosition(x, y, z);
      return [g, m] as [BufferGeometry, Matrix4];
    }),
  );
}

/** A mound of roe beads within an oval of half-sizes rx, rz. */
function roeMound(rx: number, rz: number, layers: number): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (let layer = 0; layer < layers; layer++) {
    const s = 1 - layer * 0.35;
    for (let x = -rx * s; x <= rx * s + 1e-6; x += 0.006) {
      for (let z = -rz * s; z <= rz * s + 1e-6; z += 0.006) {
        if ((x / rx) ** 2 + (z / rz) ** 2 > s * s) continue;
        out.push([x + layer * 0.003, layer * 0.005, z + layer * 0.003, 0]);
      }
    }
  }
  return out;
}

/**
 * The gunkan (sea urchin or salmon roe):
 *  1 the neta hand pinches a nori strip from the nori box (board, back left)
 *  2 the rice (PieceSystem)            3 palms together: the nori wraps the rice
 *  4 wasabi, if ordered: index finger to the dish, then onto the rice
 *  5 the rice hand takes the tool from the tray in the case (a small wooden
 *    spatula for uni, a spoon for salmon roe) and lets go over the gunkan:
 *    the topping is on. Done.
 * Served at once: the nori softens (freshness runs from the wrap).
 */
export class GunkanAssembly implements Assembly {
  readonly kind = 'gunkan' as const;
  readonly judgeSlots = 1;
  private noriHeld = false;
  private wrapped = false;
  private topped = false;
  private topping: NetaId | null = null;
  /** The case item the tool came from, while the rice hand carries it. */
  private spoonItem: Entity | null = null;
  /** That tray's own tool, hidden while it is in the hand. */
  private trayTool: Object3D | null = null;
  private readonly strip: Mesh;
  private readonly band: Mesh;
  private readonly tops = new Map<NetaId, Mesh>();
  /** The tool in the rice hand: one per topping, the right one shown. */
  private readonly spoon: Group;
  private readonly tools = new Map<NetaId, Group>();
  private readonly tmp = new Vector3();

  constructor(
    private readonly core: PieceCore,
    world: World,
  ) {
    this.strip = new Mesh(patterned(new BoxGeometry(BAND_HEIGHT, 0.0015, 0.16)), noriMaterial());
    this.strip.name = 'NoriStrip';
    this.band = new Mesh(patterned(new CylinderGeometry(0.019, 0.019, BAND_HEIGHT, 32, 2, true)), noriMaterial());
    this.band.name = 'NoriBand';
    this.band.scale.set(1.3, 1, 0.95);
    this.band.position.set(0, BAND_HEIGHT / 2, 0);
    core.piece.add(this.strip, this.band);

    // Toppings on the gunkan and dabs on the spoon, from the case's own pieces.
    const uni = caseLook('Uni').geometry;
    const roe = caseLook('Ikura').geometry;
    const tops: Array<[NetaId, BufferGeometry, BufferGeometry]> = [
      // Uni: three big lobes side by side along the gunkan filling its mouth,
      // a fourth on top, each its own shade; two on the spatula's blade.
      ['Uni', heap(uni, [[0, 0, -0.0105, 0.04, 1.6, 0.6], [0.001, 0.0008, 0, -0.05, 1.65, 0.2], [-0.001, 0, 0.0105, 0.06, 1.6, 0.85], [0, 0.0055, -0.003, 0.02, 1.45, 0.4]]),
        heap(uni, [[0, 0, -0.004, Math.PI / 2, 1.2, 0.4], [0.002, 0.003, 0.004, Math.PI / 2, 1.2, 0.7]])],
      ['Ikura', heap(roe, roeMound(0.021, 0.0145, 2)), heap(roe, roeMound(0.008, 0.006, 1))],
    ];
    this.spoon = new Group();
    this.spoon.name = 'ToppingTool';
    for (const [id, top, dab] of tops) {
      const onPiece = new Mesh(top, lookMaterial(id));
      onPiece.name = `Topping_${id}`;
      onPiece.position.set(0, TOP_Y, 0);
      onPiece.visible = false;
      core.piece.add(onPiece);
      this.tops.set(id, onPiece);
      const tool = new Group();
      tool.name = `Tool_${id}`;
      const shape = toolGeometry(id);
      if (shape) tool.add(new Mesh(shape, lookMaterial(id)));
      const onTool = new Mesh(dab, lookMaterial(id));
      onTool.position.y = 0.001;
      tool.add(onTool);
      tool.visible = false;
      this.spoon.add(tool);
      this.tools.set(id, tool);
    }
    world.createTransformEntity(this.spoon);
    this.reset();
  }

  update(_delta: number): void {
    const core = this.core;
    if (!chef.open || chef.facingBack) return;
    const riceHand = hands.all[chef.riceSide];
    const netaHand = hands.all[chef.netaSide];
    if (!this.noriHeld) {
      this.updateTakeNori(netaHand);
    } else if (!this.wrapped) {
      this.updateWrap(riceHand, netaHand);
    } else {
      // Wasabi goes on the rice before the topping.
      if (!this.topped && !this.spoonItem) core.updateWasabi(riceHand, true);
      this.updateSpoon(riceHand);
    }
  }

  private updateTakeNori(hand: HandReader): void {
    const state = chef.hands[chef.netaSide];
    if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None) return;
    if (!overStation(hand.grasp, StationKind.NoriBox)) return;
    if (state.needsWash) {
      feedback.flash(StationKind.NoriBox, COLOR_WARN);
      coach.mistake('washFirst', StationKind.NoriBox);
      return;
    }
    if (service.order && orderKind() !== 'gunkan') {
      feedback.flash(StationKind.NoriBox, COLOR_WARN);
      coach.mistake('wrongItem', StationKind.NoriBox);
      console.log('[Gunkan] no gunkan was ordered');
      return;
    }
    if (!this.core.begin('gunkan')) return;
    this.noriHeld = true;
    this.core.netaHeld = true;
    state.holding = Held.Nori;
    this.core.setStage(GunkanStage.Nori);
    feedback.flash(StationKind.NoriBox, COLOR_DONE);
    coach.done('takeNori');
    console.log('[Gunkan] a nori strip on the fingers');
  }

  private updateWrap(riceHand: HandReader, netaHand: HandReader): void {
    const core = this.core;
    if (!core.hasRice || !riceHand.tracked || !netaHand.tracked || riceHand.fist) return;
    if (riceHand.palm.distanceTo(netaHand.palm) > JOIN_DISTANCE) return;
    chef.hands[chef.riceSide].holding = Held.None;
    this.wrapped = true;
    // The nori starts to soften now: freshness runs from the wrap.
    core.hasNeta = true;
    core.cutAge = 0;
    core.rice.scale.copy(RICE_GUNKAN);
    core.setStage(GunkanStage.Wrapped);
    coach.done('wrapNori');
    console.log('[Gunkan] rice wrapped in nori');
  }

  private updateSpoon(riceHand: HandReader): void {
    const core = this.core;
    const state = chef.hands[chef.riceSide];
    if (!this.spoonItem) {
      if (this.topped || !riceHand.tracked || !riceHand.pinchStart || state.holding !== Held.None) return;
      const item = caseApi.chosen(chef.riceSide);
      if (!item) return;
      const neta = caseApi.neta(item);
      if (NETA[neta].prep !== 'scoop' || caseApi.check(chef.riceSide, item) !== 'ok') return;
      const ordered = orderNeta();
      if (ordered && ordered !== neta) {
        feedback.flash(StationKind.NetaCase, COLOR_WARN);
        coach.mistake('wrongItem', StationKind.NetaCase);
        console.log(`[Gunkan] ${neta} is not what was ordered`);
        return;
      }
      if (caseApi.stock(item) < 1) return;
      this.spoonItem = item;
      state.holding = Held.Spoon;
      for (const [id, tool] of this.tools) tool.visible = id === neta;
      this.spoon.visible = true;
      this.trayTool = item.object3D?.getObjectByName('Tool') ?? null;
      if (this.trayTool) this.trayTool.visible = false;
      console.log(`[Gunkan] ${neta} on the ${neta === 'Uni' ? 'spatula' : 'spoon'}`);
      return;
    }
    if (riceHand.tracked) {
      this.spoon.position.copy(riceHand.grasp);
      this.spoon.rotation.y = (riceHand.yawDeg * Math.PI) / 180;
    }
    if (riceHand.tracked && !riceHand.pinchEnd) return;
    // Let go: over the gunkan the topping goes on, anywhere else it goes back.
    const item = this.spoonItem;
    const neta = caseApi.neta(item);
    this.spoonItem = null;
    this.spoon.visible = false;
    if (this.trayTool) this.trayTool.visible = true;
    this.trayTool = null;
    state.holding = Held.None;
    const g = riceHand.grasp;
    const d = Math.hypot(g.x - core.focus.x, g.z - core.focus.z);
    const above = g.y - core.focus.y;
    if (d > DROP_RADIUS || above < -0.03 || above > DROP_ABOVE || !caseApi.consume(item, 1)) {
      console.log(`[Gunkan] the ${neta} went back (let go ${(d * 100).toFixed(0)} cm from the gunkan)`);
      return;
    }
    this.topped = true;
    this.topping = neta;
    core.netaId = neta;
    for (const [id, top] of this.tops) top.visible = id === neta;
    core.setStage(NigiriStage.Done);
    coach.done('spoonTopping');
    console.log(`[Gunkan] ${neta} on top`);
  }

  // ---- shared hooks ---------------------------------------------------------

  layout(): boolean {
    this.strip.visible = this.noriHeld && !this.wrapped;
    this.strip.position.set(0, 0.004, 0);
    this.band.visible = this.wrapped;
    if (this.wrapped) {
      this.core.rice.position.set(0, 0.0135, 0);
      this.core.wasabiBlob.position.set(0, TOP_Y - 0.002, 0);
    }
    return this.wrapped;
  }

  wasabiTarget(out: Vector3): boolean {
    if (!this.wrapped || this.topped) return false;
    this.core.piece.localToWorld(out.set(0, TOP_Y - 0.002, 0));
    return true;
  }

  ringOnHand(): boolean {
    return true;
  }

  hints(): void {
    const core = this.core;
    if (orderKind() !== 'gunkan' && !core.kind) return;
    const riceState = chef.hands[chef.riceSide];
    if (!this.wrapped) {
      if (!this.noriHeld) feedback.hints.add(StationKind.NoriBox);
      if (!core.hasRice) feedback.hints.add(riceState.wet ? StationKind.RiceTub : StationKind.Tezu);
    } else if (!this.topped) {
      if (service.order?.wasabi && core.wasabi === 'none') feedback.hints.add(StationKind.Wasabi);
      else feedback.hints.add(StationKind.NetaCase);
    }
  }

  score(r: PieceResult): void {
    const order = service.order;
    r.itemOk = !!order && this.topped && !!this.topping && order.item === menuFor('gunkan', [this.topping]);
    // No head end or skin on a gunkan; any heading is fine.
  }

  reset(): void {
    this.noriHeld = this.wrapped = this.topped = false;
    this.topping = null;
    this.spoonItem = null;
    if (this.trayTool) this.trayTool.visible = true;
    this.trayTool = null;
    this.strip.visible = this.band.visible = false;
    for (const top of this.tops.values()) top.visible = false;
    this.spoon.visible = false;
  }

  publish(): void {
    progress.noriHeld = this.noriHeld;
    progress.wrapped = this.wrapped;
    progress.topped = this.topped;
  }

  describe(): string {
    return `nori=${this.noriHeld ? 'y' : 'n'} wrapped=${this.wrapped ? 'y' : 'n'} topping=${this.topping ?? '-'}`;
  }
}
