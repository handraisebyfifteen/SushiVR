import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
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
import { canTakeNori, useNori, useShari } from '../pantry.js';
import type { PieceResult } from '../scoring.js';
import { playTone } from '../sfx.js';
import { caseLook, lookMaterial, noriMaterial, toolGeometry } from '../scene-assets/lib/neta-look.js';
import { patterned, weld } from '../scene-assets/lib/neta-paint.js';
import { overStation, stations } from '../station-system.js';
import { GunkanStage, Held, Judge, NigiriStage, Piece, StationKind } from '../sushi-components.js';
import type { Assembly, PieceCore } from './types.js';

/**
 * The rice inside the nori band: a low oval filling its lower part (about
 * 4.8 x 3.7 cm, 2.7 cm high), the shari shaped once (stage 3) and stretched
 * to the band (the stage-3 shari is the nigiri's 19 g one, so it is squeezed
 * along its length and widened to fit).
 */
const RICE_GUNKAN = new Vector3(0.754, 1.083, 1.246);
const RICE_GUNKAN_STAGE = 3;
/**
 * The shaped rice goes down on the board when the rice hand's palm comes
 * within this height of the board's top (not over the makisu, which is the
 * rolls' place).
 */
const SET_DOWN_HEIGHT = 0.05;
/** The shari stays this far inside the board's edges. */
const BOARD_MARGIN = 0.05;
/**
 * It goes on the near half of the board, the chef's side (手前, the user's
 * shop): the palm no farther out than this from the board's middle line.
 */
const NEAR_FROM = 0;
/**
 * Gunkan nori is 6切り: a sheet (21 x 19 cm) cut into six strips, each
 * 3.5 cm by 19 cm (src/tuning.ts GUNKAN_STRIPS_PER_SHEET).
 */
const STRIP_LENGTH = 0.19;
/** The nori band stands higher than the rice, so the topping sits inside it like a boat. */
const BAND_HEIGHT = 0.035;
/** The band's radius before its oval scale (BAND_SX across, BAND_SZ along). */
const BAND_RADIUS = 0.019;
const BAND_SX = 1.3;
const BAND_SZ = 0.95;
/** Segments per turn of the band (each drawn as 2 triangles, see layout). */
const BAND_SEGMENTS = 32;
/** How much wider the band gets per turn (a fraction of its radius), so the overlap lies on top. */
const BAND_GROW = 0.07;
/** Turns the 19 cm strip makes round the shari: once, and the rest overlaps (Ramanujan's oval perimeter). */
const WRAP_TURNS = (() => {
  const a = BAND_RADIUS * BAND_SX;
  const b = BAND_RADIUS * BAND_SZ;
  return STRIP_LENGTH / (Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))));
})();
const BAND_TOTAL = Math.ceil(WRAP_TURNS * BAND_SEGMENTS);
/**
 * The two-point wrap (二点留め, the user's shop): the strip's end is set
 * against the shari, the rice hand's index finger holds it down there, the
 * neta hand takes the strip once round, and the last end is pulled a little
 * taut ("ピン") before it is let go.
 * The end goes against the shari when the pinch comes within START_RADIUS
 * of its axis (seen from above), no higher than START_ABOVE.
 */
const START_RADIUS = 0.06;
const START_ABOVE = 0.08;
/** The index tip holds the end within PIN_RADIUS of it; until PIN_UNTIL of a turn is done it slips beyond PIN_SLIP. */
const PIN_RADIUS = 0.03;
const PIN_SLIP = 0.05;
const PIN_UNTIL = 0.75;
/** The last end pulled this much farther out than where the wrap came full: taut. */
const TAUT_PULL = 0.012;
/** A band let go loose sits this much wider round the rice. */
const LOOSE_SCALE = 1.06;
/**
 * The shari lies lengthwise on the board (縦, its long axis pointing away
 * from the chef): its near end is the bottom (下部), where the strip's end
 * is set and held, and its far end the apex (頂点), where the strip curls
 * round ("クルッ") half way.
 */
const SHARI_YAW_DEG = 90;
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
/** The wrapped nori: BAND_TOTAL segments, its points written at each wrap's start (GunkanAssembly.layBand). */
function bandGeometry(): BufferGeometry {
  const n = BAND_TOTAL + 1;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(n * 6), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(n * 6), 3));
  const uv = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) uv.set([i / BAND_SEGMENTS, 0, i / BAND_SEGMENTS, 1], i * 4);
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(new BufferAttribute(new Uint16Array(BAND_TOTAL * 6), 1));
  return g;
}

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
 * The gunkan (sea urchin or salmon roe), made on the cutting board, not in
 * the palm (the user's shop):
 *  1 the rice (PieceSystem), and one squeeze (a fist) shapes it
 *  2 the rice hand sets the shaped shari down on the board, on its near
 *    half (the chef's side)
 *  3 the neta hand pinches a nori strip (6切り) from the nori box (board,
 *    back left) and sets its end against the shari; the rice hand's index
 *    finger holds that end down; the neta hand takes the strip once round
 *    ("kururi") and pulls the last end a little taut before letting go
 *    (二点留め: the finger, then the taut end). Let go loose, it sags.
 *  4 wasabi, if ordered: index finger to the dish, then onto the rice
 *  5 the rice hand takes the tool from the tray in the case (a small wooden
 *    spatula for uni, a spoon for salmon roe) and lets go over the gunkan:
 *    the topping is on. Done.
 * Served at once: the nori softens (freshness runs from the wrap).
 */
export class GunkanAssembly implements Assembly {
  readonly kind = 'gunkan' as const;
  /** The rice (slot 0) and the wrap (slot 1: Excellent taut, Poor loose). */
  readonly judgeSlots = 2;
  /** The shaped shari is on the board. */
  private riceDown = false;
  /** Told once per lowering that the rice is not shaped yet, or is over the board's far half. */
  private toldShape = false;
  private toldNear = false;
  private noriHeld = false;
  /** The strip's end is set against the shari. */
  private started = false;
  /** The rice hand's index finger holds that end down. */
  private pinned = false;
  /** Told once that the finger goes on the end first. */
  private toldPin = false;
  /** Where the end sits round the shari (band-local angle, x = sin, z = cos), and which way the wrap goes (0 until the hand moves). */
  private startAngle = 0;
  private dir = 0;
  /** The neta hand's angle round the shari last frame, and how far it has gone round since (signed radians). */
  private lastAngle = 0;
  private turned = 0;
  /** The hand's distance from the shari's axis when the wrap came full; the last end pulled out from there is taut. */
  private fullReach = 0;
  private taut = false;
  private wrapped = false;
  /** How far the band has gone round the rice, in turns (0..WRAP_TURNS). */
  private wrapT = 0;
  /** The hand's distance from the shari's axis, set by angleOf. */
  private reach = 0;
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
  private readonly tmp2 = new Vector3();
  /** Toward the chef at the bar (world +z), for the shari's near end. */
  private readonly towardChef = new Vector3(0, 0, 0.05);

  constructor(
    private readonly core: PieceCore,
    world: World,
  ) {
    this.strip = new Mesh(patterned(new BoxGeometry(BAND_HEIGHT, 0.0015, STRIP_LENGTH)), noriMaterial());
    this.strip.name = 'NoriStrip';
    this.band = new Mesh(patterned(bandGeometry()), noriMaterial());
    this.band.name = 'NoriBand';
    this.band.scale.set(BAND_SX, 1, BAND_SZ);
    // Its points are rewritten at each wrap, so its bounds are not kept.
    this.band.frustumCulled = false;
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
    if (!this.riceDown) {
      this.updateSetDown(riceHand);
      this.updateEarlyNori(netaHand);
    } else if (!this.wrapped) {
      this.updateNori(netaHand, riceHand);
    } else {
      // Wasabi goes on the rice before the topping.
      if (!this.topped && !this.spoonItem) core.updateWasabi(riceHand, true);
      this.updateSpoon(riceHand);
    }
  }

  /** 2: the shaped shari from the rice hand down onto the board (only for an ordered gunkan). */
  private updateSetDown(hand: HandReader): void {
    const core = this.core;
    const state = chef.hands[chef.riceSide];
    if (orderKind() !== 'gunkan' || !core.hasRice || state.holding !== Held.Rice || !hand.tracked) return;
    const board = stations.get(StationKind.CuttingBoard);
    if (!board || !overStation(hand.palm, StationKind.CuttingBoard) || overStation(hand.palm, StationKind.Makisu)) return;
    if (hand.palm.y > board.pos.y + SET_DOWN_HEIGHT) {
      this.toldShape = this.toldNear = false;
      return;
    }
    if (core.shariLevel < 1) {
      // Loose rice is not set down: one squeeze (a fist) shapes it first.
      if (!this.toldShape) {
        this.toldShape = true;
        feedback.flash(StationKind.CuttingBoard, COLOR_WARN);
        coach.nudge();
        console.log('[Gunkan] shape the rice first: one squeeze');
      }
      return;
    }
    if (hand.palm.z < board.pos.z + NEAR_FROM) {
      // The far half is not where a gunkan is made: the near half, the chef's side.
      if (!this.toldNear) {
        this.toldNear = true;
        feedback.flash(StationKind.CuttingBoard, COLOR_WARN);
        coach.nudge();
        console.log('[Gunkan] the shari goes on the near half of the board');
      }
      return;
    }
    if (!core.begin('gunkan')) return;
    state.holding = Held.None;
    this.riceDown = true;
    // Where the palm came down, inside the board's edges, on its near half.
    const x = Math.min(board.pos.x + board.halfW - BOARD_MARGIN, Math.max(board.pos.x - board.halfW + BOARD_MARGIN, hand.palm.x));
    const z = Math.min(board.pos.z + board.halfD - BOARD_MARGIN, Math.max(board.pos.z + NEAR_FROM, hand.palm.z));
    core.netaOnBoard.set(x, board.pos.y, z);
    // The piece now lies on the board (the core places it at netaOnBoard);
    // the freshness clock starts over at the wrap.
    core.hasNeta = true;
    core.rice.scale.copy(RICE_GUNKAN);
    core.rice.rotation.set(0, 0, 0);
    core.pieceYaw = SHARI_YAW_DEG;
    core.shariLevel = RICE_GUNKAN_STAGE;
    core.setStage(GunkanStage.Rice);
    useShari('gunkan');
    feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
    coach.done('setShari');
    console.log('[Gunkan] the shari on the board');
  }

  /** The nori box pinched before the shari is down: not yet (or not this order). */
  private updateEarlyNori(hand: HandReader): void {
    // For a roll the nori box gives a half sheet (MakiAssembly).
    const kind = orderKind();
    if (kind === 'maki' || !service.order) return;
    if (!hand.tracked || !hand.pinchStart || chef.hands[chef.netaSide].holding !== Held.None) return;
    if (!overStation(hand.grasp, StationKind.NoriBox)) return;
    feedback.flash(StationKind.NoriBox, COLOR_WARN);
    if (kind !== 'gunkan') {
      coach.mistake('wrongItem', StationKind.NoriBox);
      console.log('[Gunkan] no gunkan was ordered');
    } else {
      coach.nudge();
      console.log('[Gunkan] the shari goes on the board first');
    }
  }

  /**
   * 3: a nori strip from the box; its end set against the shari and held
   * there by the rice hand's index finger; taken once round by the neta
   * hand; the last end pulled a little taut; let go.
   */
  private updateNori(hand: HandReader, riceHand: HandReader): void {
    const core = this.core;
    const state = chef.hands[chef.netaSide];
    if (!this.noriHeld) {
      if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None) return;
      if (!overStation(hand.grasp, StationKind.NoriBox)) return;
      if (state.needsWash) {
        feedback.flash(StationKind.NoriBox, COLOR_WARN);
        coach.mistake('washFirst', StationKind.NoriBox);
        return;
      }
      // On full the tin can run out (src/pantry.ts).
      if (!canTakeNori('gunkan')) {
        feedback.flash(StationKind.NoriBox, COLOR_WARN);
        console.log('[Gunkan] the nori tin is empty');
        return;
      }
      this.noriHeld = true;
      state.holding = Held.Nori;
      core.setStage(GunkanStage.Nori);
      feedback.flash(StationKind.NoriBox, COLOR_DONE);
      coach.done('takeNori');
      console.log('[Gunkan] a nori strip in the fingers');
      return;
    }
    if (!hand.tracked || hand.pinchEnd) {
      this.letGo();
      return;
    }
    const angle = this.angleOf(hand.grasp);
    if (!this.started) {
      const above = hand.grasp.y - core.focus.y;
      if (this.reach > START_RADIUS || above < -0.03 || above > START_ABOVE) return;
      this.started = true;
      this.lastAngle = angle;
      // The end goes to the shari's near end (下部), whichever side the hand comes from.
      this.startAngle = this.angleOf(this.tmp2.copy(core.focus).add(this.towardChef));
      this.turned = 0;
      this.dir = 0;
      console.log('[Gunkan] the nori\'s end on the shari\'s near end: a finger on it');
      return;
    }
    let d = angle - this.lastAngle;
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    this.lastAngle = angle;
    this.updatePin(riceHand);
    if (!this.pinned) {
      // Nothing holds the end: taken away, it comes off the shari.
      if (this.reach > START_RADIUS * 1.5) {
        this.started = false;
        return;
      }
      this.turned += d;
      if (!this.toldPin && Math.abs(this.turned) > 0.4) {
        this.toldPin = true;
        feedback.flash(StationKind.CuttingBoard, COLOR_WARN);
        coach.nudge();
        console.log('[Gunkan] hold the end down with a finger first');
      }
      return;
    }
    // Round it goes: as far as the hand has gone about the shari since the finger went on.
    this.turned += d;
    if (this.dir === 0) {
      if (Math.abs(this.turned) < 0.15) return;
      this.dir = Math.sign(this.turned);
      this.layBand();
    }
    const turns = Math.min(WRAP_TURNS, Math.max(this.wrapT, (this.dir * this.turned) / (Math.PI * 2)));
    if (turns >= 0.5 && this.wrapT < 0.5) {
      // Round the far end, the apex: the strip curls round it.
      playTone(1320, 0.04, 0.05);
      console.log('[Gunkan] round the apex (頂点)');
    }
    if (turns >= WRAP_TURNS && this.wrapT < WRAP_TURNS) {
      this.fullReach = this.reach;
      console.log('[Gunkan] round: pull the last end a little, then let go');
    }
    this.wrapT = turns;
    if (this.wrapT >= WRAP_TURNS && !this.taut && this.reach >= this.fullReach + TAUT_PULL) {
      this.taut = true;
      playTone(1760, 0.05, 0.08);
      console.log('[Gunkan] the last end pulled taut');
    }
  }

  /** The rice hand's index finger on the strip's end: it holds; lifted too soon, the strip springs off. */
  private updatePin(hand: HandReader): void {
    const free = hand.tracked && chef.hands[chef.riceSide].holding === Held.None;
    const d = free ? hand.indexTip.distanceTo(this.bandPoint(0, this.tmp2)) : Infinity;
    if (!this.pinned) {
      if (d > PIN_RADIUS) return;
      this.pinned = true;
      // From here the turn counts from where the end is held.
      this.turned = 0;
      feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
      coach.done('pinNori');
      console.log('[Gunkan] a finger on the end: now round');
      return;
    }
    if (this.wrapT >= PIN_UNTIL || d <= PIN_SLIP) return;
    this.pinned = this.started = false;
    this.wrapT = this.turned = 0;
    this.dir = 0;
    feedback.flash(StationKind.CuttingBoard, COLOR_WARN);
    coach.nudge();
    console.log('[Gunkan] the end slipped: keep the finger on it until the strip is most of the way round');
  }

  /** The neta hand lets go of the strip: round and held, the gunkan is wrapped; otherwise it goes back to the tin. */
  private letGo(): void {
    const core = this.core;
    this.noriHeld = false;
    chef.hands[chef.netaSide].holding = Held.None;
    if (this.started && this.pinned && this.wrapT >= WRAP_TURNS - 0.04) {
      this.wrapped = true;
      this.wrapT = WRAP_TURNS;
      // Pulled taut, the band hugs the rice; let go loose, it sags (a weaker piece).
      core.judges[1] = this.taut ? Judge.Excellent : Judge.Poor;
      const k = this.taut ? 1 : LOOSE_SCALE;
      this.band.scale.set(BAND_SX * k, 1, BAND_SZ * k);
      if (!this.taut) feedback.flash(StationKind.CuttingBoard, COLOR_WARN);
      // The nori starts to soften now: freshness runs from the wrap.
      core.cutAge = 0;
      core.entity.setValue(Piece, 'cutAge', 0);
      core.setStage(GunkanStage.Wrapped);
      useNori('gunkan');
      coach.done('wrapNori');
      console.log(this.taut ? '[Gunkan] the nori round the shari, taut' : '[Gunkan] the nori round the shari, loose: pull the last end a little before letting go');
      return;
    }
    const why = !this.started ? 'away from the shari' : !this.pinned ? 'with no finger on its end' : `${Math.round((100 * this.wrapT) / WRAP_TURNS)}% round`;
    this.started = this.pinned = this.taut = false;
    this.wrapT = this.turned = 0;
    this.dir = 0;
    core.setStage(GunkanStage.Rice);
    console.log(`[Gunkan] the nori went back (let go ${why})`);
  }

  /** A world point's angle round the shari in the band's own (unscaled) frame; its distance from the shari's axis goes to `reach`. */
  private angleOf(world: Vector3): number {
    const p = this.core.piece.worldToLocal(this.tmp.copy(world));
    this.reach = Math.hypot(p.x, p.z);
    return Math.atan2(p.x / BAND_SX, p.z / BAND_SZ);
  }

  /** The band's point `turns` round from the strip's end, half way up, in world space. */
  private bandPoint(turns: number, out: Vector3): Vector3 {
    const t = this.startAngle + (this.dir || 1) * turns * Math.PI * 2;
    const r = BAND_RADIUS * (1 + BAND_GROW * turns);
    out.set(r * Math.sin(t) * BAND_SX, BAND_HEIGHT / 2, r * Math.cos(t) * BAND_SZ);
    return this.core.piece.localToWorld(out);
  }

  /** Writes the band's points from the strip's end round the way the hand goes, a little wider each turn. */
  private layBand(): void {
    const g = this.band.geometry;
    const pos = g.getAttribute('position') as BufferAttribute;
    const nor = g.getAttribute('normal') as BufferAttribute;
    const index = g.getIndex()!;
    for (let i = 0; i <= BAND_TOTAL; i++) {
      const t = this.startAngle + (this.dir * i * Math.PI * 2) / BAND_SEGMENTS;
      const r = BAND_RADIUS * (1 + (BAND_GROW * i) / BAND_SEGMENTS);
      const sin = Math.sin(t);
      const cos = Math.cos(t);
      pos.setXYZ(2 * i, r * sin, 0, r * cos);
      pos.setXYZ(2 * i + 1, r * sin, BAND_HEIGHT, r * cos);
      nor.setXYZ(2 * i, sin, 0, cos);
      nor.setXYZ(2 * i + 1, sin, 0, cos);
    }
    // Two triangles a segment, wound so the outside faces out whichever way it goes round.
    for (let i = 0; i < BAND_TOTAL; i++) {
      const a = 2 * i;
      const b = a + 2;
      const o = i * 6;
      const forward = this.dir > 0;
      index.setX(o, a);
      index.setX(o + 1, forward ? b : a + 1);
      index.setX(o + 2, forward ? a + 1 : b);
      index.setX(o + 3, b);
      index.setX(o + 4, forward ? b + 1 : a + 1);
      index.setX(o + 5, forward ? a + 1 : b + 1);
    }
    pos.needsUpdate = nor.needsUpdate = index.needsUpdate = true;
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
    this.wrapT = WRAP_TURNS;
    this.topping = neta;
    core.netaId = neta;
    for (const [id, top] of this.tops) top.visible = id === neta;
    core.setStage(NigiriStage.Done);
    coach.done('spoonTopping');
    console.log(`[Gunkan] ${neta} on top`);
  }

  // ---- shared hooks ---------------------------------------------------------

  layout(): boolean {
    const core = this.core;
    const grasp = hands.all[chef.netaSide].grasp;
    this.strip.visible = this.noriHeld;
    if (this.noriHeld && !this.started) {
      // Held by its near end in the neta hand's pinch, the rest reaching forward.
      core.piece.worldToLocal(this.strip.position.copy(grasp));
      this.strip.position.z -= STRIP_LENGTH / 2 - 0.01;
      this.strip.rotation.set(0, 0, 0);
      this.strip.scale.set(1, 1, 1);
    } else if (this.noriHeld) {
      // On edge, from where the band has got to (or the end on the shari) to the pinch.
      const from = this.bandPoint(this.dir ? this.wrapT : 0, this.tmp2);
      const length = Math.max(0.01, from.distanceTo(grasp));
      core.piece.worldToLocal(this.strip.position.copy(from).add(grasp).multiplyScalar(0.5));
      this.strip.lookAt(grasp);
      this.strip.rotateZ(Math.PI / 2);
      this.strip.scale.set(1, 1, length / STRIP_LENGTH);
    }
    this.band.visible = this.wrapped || (this.noriHeld && this.dir !== 0 && this.wrapT > 0);
    if (this.band.visible) {
      // Round it goes: the band's triangles run segment by segment from the
      // strip's end, so drawing the first part of them draws it part way round.
      const segments = Math.min(BAND_TOTAL, Math.ceil(this.wrapT * BAND_SEGMENTS));
      this.band.geometry.setDrawRange(0, segments * 6);
    }
    if (this.riceDown) {
      // On the board; the shari's origin is its flat bottom.
      core.rice.position.set(0, 0, 0);
      core.wasabiBlob.position.set(0, TOP_Y - 0.002, 0);
    }
    return this.riceDown;
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
    if (!this.riceDown) {
      if (!core.hasRice) feedback.hints.add(riceState.wet ? StationKind.RiceTub : StationKind.Tezu);
      else if (core.shariLevel >= 1) feedback.hints.add(StationKind.CuttingBoard);
    } else if (!this.wrapped) {
      // The board's shari: the strip's end to it, the finger on the end, round it.
      feedback.hints.add(this.noriHeld ? StationKind.CuttingBoard : StationKind.NoriBox);
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
    this.riceDown = this.toldShape = this.toldNear = this.noriHeld = this.wrapped = this.topped = false;
    this.started = this.pinned = this.toldPin = this.taut = false;
    this.wrapT = this.turned = this.dir = 0;
    this.band.scale.set(BAND_SX, 1, BAND_SZ);
    this.topping = null;
    this.spoonItem = null;
    if (this.trayTool) this.trayTool.visible = true;
    this.trayTool = null;
    this.strip.visible = this.band.visible = false;
    for (const top of this.tops.values()) top.visible = false;
    this.spoon.visible = false;
  }

  publish(): void {
    progress.shaped = this.core.hasRice && this.core.shariLevel >= 1;
    progress.shariDown = this.riceDown;
    progress.noriHeld = this.noriHeld;
    progress.noriPinned = this.pinned;
    progress.wrapped = this.wrapped;
    progress.topped = this.topped;
  }

  describe(): string {
    const nori = !this.noriHeld ? 'n' : !this.started ? 'y' : `${this.pinned ? 'pinned' : 'on'} ${Math.round((100 * this.wrapT) / WRAP_TURNS)}%${this.taut ? ' taut' : ''}`;
    return `shari=${this.riceDown ? 'board' : 'hand'} nori=${nori} wrapped=${this.wrapped ? (this.taut ? 'taut' : 'loose') : 'n'} topping=${this.topping ?? '-'}`;
  }
}
