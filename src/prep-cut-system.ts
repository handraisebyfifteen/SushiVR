import {
  Box3,
  BoxGeometry,
  Color,
  createSystem,
  type Entity,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  type Sprite,
  Vector3,
} from '@iwsdk/core';
import { coach, type Grade } from './coach.js';
import { knifeApi } from './cutting-system.js';
import { debugLines } from './debug.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { chef, edgeCatches, prep, type Side, staff, wearKnife } from './game-state.js';
import { handedness, sideX } from './handedness.js';
import { hands, RubTracker } from './hands.js';
import { cureApi, nakagoApi, prepApi, rangeApi, tamagoApi, tsumeApi } from './prep-api.js';
import { NAKAGO_FLOOR } from './scene-assets/lib/nakago-look.js';
import { NETA, type NetaId } from './menu.js';
import { scrapsApi } from './opening-system.js';
import {
  BACK_ROW_Z,
  DEBA_X,
  DEBA_Z,
  FISH_BOX_DEPTH,
  FISH_BOX_HEIGHT,
  FISH_BOX_ICE_TOP,
  FISH_BOX_WIDTH,
  FISH_BOX_X,
  FISH_BOX_Z,
  SCALER_X,
  SCALER_Z,
  SINK_BASIN_X,
  SINK_BIN_X,
  SINK_BIN_Z,
  SINK_FRONT_RIM,
  SINK_TOP,
  TWEEZERS_X,
  WASH_BOARD_DEPTH,
  WASH_BOARD_THICKNESS,
  WASH_BOARD_TOP,
  WASH_BOARD_WIDTH,
  WASH_BOARD_Z,
  FISH_STAND_HEIGHT,
} from './layout.js';
import { fractionOf, kohadaScale, noteAdded, todaysMaterials, todaysTaskCount } from './fish-order.js';
import { stage, stageRice } from './stage.js';
import { NAKAGO_IDS, PREP, type PrepId, prepTasks } from './prep.js';
import {
  createDeba,
  createFishBox,
  createScaler,
  createTweezers,
  createWashBoard,
  createWaterStream,
  PIN_LENGTH,
  SCALES_OPACITY,
} from './scene-assets/lib/fillet-look.js';
import { type PrepMaterialLook, type PrepProduct, type PrepStep, paperSheet, prepMaterialLook } from './scene-assets/lib/prep-look.js';
import { createFishStand } from './scene-assets/lib/cure-look.js';
import { createTrashBin } from './scene-assets/shop-props.scene-asset.js';
import { overStation, stations } from './station-system.js';
import { CaseItem, Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import {
  BOARD_DIRT_PER_CUT,
  COOK_SECONDS,
  CUT_STROKE,
  PREP_CUT_EXCELLENT,
  PREP_CUT_GOOD,
  PREP_CUT_POOR,
  PREP_STAGE,
  PIN_GRIP,
  PIN_PULL,
  PREP_YIELD_LOSS,
  RESULT_SECONDS,
  RINSE_RUB,
  RUB_WIPE_BOARD,
  SCALE_RUB,
  SQUID_PULL_DISTANCE,
  TURN_LIFT,
} from './tuning.js';

/**
 * Where each material lies in the ice box (box-local x, height above the
 * ice): the tuna and the bonito side by side, the squid on top of them.
 */
const SLOT: Partial<Record<PrepId, [number, number, number?]>> = {
  TunaBelly: [0.068, 0],
  BonitoHalf: [-0.088, 0],
  Squid: [0, 0.058],
  // The range's ingredients on top (box-local x, height, z).
  SeaEel: [-0.09, 0.1, 0],
  Octopus: [0.075, 0.1, 0.065],
  Abalone: [0.08, 0.1, -0.085],
  // The hamaguri, live in their net bag.
  Hamaguri: [-0.005, 0.105, -0.09],
  // The tamago's batter bowl (full) on top of them.
  Tamago: [0.005, 0.16, 0],
};
/** Stage 4's fish box at the sink's foot (across the box, height above the ice): the flounder flat, the jack and the hamachi half on it, the saba and the kohada (full) over them. */
const FISH_SLOT: Partial<Record<PrepId, [number, number]>> = {
  Flounder: [0, 0],
  StripedJack: [0.066, 0.031],
  Yellowtail: [-0.068, 0.031],
  Saba: [0.03, 0.062],
  Aji: [-0.05, 0.062],
  Kohada: [0, 0.09],
};
/** In the fish box a fish lies along the box (along X) as on the wash board: head on the chef's left facing the sink (away from it), belly toward the chef. */
const FISH_BOX_YAW = Math.PI;
/** On the wash board the fish is turned round: head on the chef's left, facing the sink. */
const WASH_YAW = Math.PI;
/** The tap's spout, over the wash board's middle (the long faucet reaches the basin's front). */
const SPOUT = new Vector3(SINK_BASIN_X, SINK_TOP + 0.21, BACK_ROW_Z + SINK_FRONT_RIM + 0.08);
const SINK_BIN_TOP = 0.42;
/** The deba's handle, the scaler's grip: this close takes it (a fist, a pinch). */
const TOOL_PICK = 0.07;
const DEBA_REACH = 0.15;
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
  /** 'cook': taken to the back by the cook (src/staff-system.ts); 'pot': on the range (src/range-system.ts); 'wash': on the wash board at the sink. */
  /** 'cure': in its tray on the drainboard (src/cure-system.ts, the full difficulty). */
  state: 'box' | 'held' | 'board' | 'wash' | 'cook' | 'pot' | 'cure' | 'done';
  /** Where it goes back to when let go elsewhere: its box, or the wash board (once it has been laid there). */
  home: 'box' | 'wash';
  /** Its turn about Y in the box (the fish box lays them lengthwise). */
  boxYaw: number;
  /** The height its root rests at (lifted a little while it is being turned). */
  baseY: number;
  /** Of a full yield (a 1/16 tuna belly or a hamachi quarter gives half: the full difficulty's order). */
  frac: number;
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
  /** Slices this saku gives (fewer after crooked cuts), and what it would give cut straight. */
  stock?: number;
  full?: number;
  done: boolean;
}

/** A tool of the whole fish's work: held by a pinch (scaler, tweezers) or a fist (deba); let go, it goes back to its place. */
interface Tool {
  object: Object3D;
  home: Vector3;
  homeYaw: number;
  /** Where the hand takes it (world, at home). */
  grip: Vector3;
  held: Side | -1;
  kind: 'Scaler' | 'Deba' | 'Tweezers';
}

type Carried =
  | { kind: 'material'; m: Material }
  | { kind: 'loose'; loose: Loose }
  | { kind: 'paper'; mesh: Mesh; used: boolean };

const usedPaper = new MeshStandardMaterial({ color: '#D9D2C2', roughness: 0.95 });
/** The tsume's dark brown, brushed over the opened clams. */
const TSUME_COLOR = new Color('#5A2E12');

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
 *  - A crooked cut wastes flesh, so the saku gives fewer slices to serve.
 *    With the cook in (called on the phone) the fish still in the ice box go
 *    to the back and come out as full saku; on the easy difficulty the cook
 *    has readied every case item the chef does not prep.
 */
export class PrepCutSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private readonly materials: Material[] = [];
  private readonly loose: Loose[] = [];
  private readonly caseItems = new Map<NetaId, Entity>();
  private readonly carried: [Carried | null, Carried | null] = [null, null];
  private readonly grabOffset = [new Vector3(), new Vector3()];
  private cutStart: number | null = null;
  /** The dull edge caught on this line: the next stroke cuts it. */
  private caught = false;
  private offSum = 0;
  private offCount = 0;
  private netaGrip = false;
  private riceGrip = false;
  private pullStart: number | null = null;
  private readonly pullFrom = new Vector3();
  private readonly pullHome: Vector3[] = [];
  private readonly wipeRub = new RubTracker();
  private readonly brushRub = new RubTracker();
  /** The material cooling on the board (the hamaguri off the range), and for how long so far. */
  private coolFor: Material | null = null;
  private coolT = 0;
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
  /** The cook took a material to the back this morning. */
  private cookDid = false;
  private cleared = false;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly pinchAt = new Vector3();
  private time = 0;
  private readonly graspTime = [new Float64Array(HISTORY), new Float64Array(HISTORY)];
  private readonly graspXYZ = [new Float32Array(HISTORY * 3), new Float32Array(HISTORY * 3)];
  private readonly graspHead = [0, 0];
  // Stage 4: the fish box, the wash board and its tap, the tools, the sink's trash bin.
  private fishBox: Object3D | null = null;
  private fishStand: Object3D | null = null;
  private washBoard: Object3D | null = null;
  private tapWater: Mesh | null = null;
  private sinkBin: Object3D | null = null;
  private sinkLid: Object3D | null = null;
  private sinkLidAngle = 0;
  private readonly tools: Tool[] = [];
  private readonly debaBlade = new Vector3();
  /** Scraper travel over the fish so far (kept while the scaler strays off it for a moment). */
  private scaled = 0;
  private readonly scaleLast = new Vector3();
  private scaleOn = false;
  private readonly rinseRub = new RubTracker();
  private turnSide: Side | -1 = -1;
  private turnY = 0;
  private pinGrip: Object3D | null = null;
  private pinY = 0;
  private pileCount = 0;
  private readonly yAxis = new Vector3(0, 1, 0);
  private readonly tmpL = new Vector3();
  private readonly tmpW = new Vector3();
  private readonly quat = new Quaternion();

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
    // Every material and the range's work, and the shari (src/shari-system.ts).
    prep.tasksTotal = prepTasks(PREP_STAGE).length + 1;
    scrapsApi.clear = () => this.clearScraps();
    prepApi.taskDone = (what) => this.taskDone(what);
    prepApi.stock = (neta, stock) => this.stock(neta, stock, NETA[neta].stock);
    prepApi.paperIn = (side) => this.carried[side]?.kind === 'paper';
    prepApi.fromPot = (id, grade) => this.fromPot(id, grade);
    prepApi.boardFree = () => !this.boardMaterial() && !prep.boardBusy;
    prepApi.potWanted = (id) => !this.built || this.materials.some((m) => m.id === id && (m.state === 'box' || m.state === 'held' || m.state === 'pot'));
    prepApi.awaitingPot = (id) => this.materials.some((m) => m.id === id && (m.state === 'box' || m.state === 'held'));
    prepApi.usePaper = (side) => {
      const c = this.carried[side];
      if (c?.kind !== 'paper') return;
      c.used = true;
      c.mesh.material = usedPaper;
    };
    debugLines.push(() => {
      if (!prep.active) return 'Prep: done, the bar is open';
      const board = this.boardMaterial();
      const wash = this.washMaterial();
      const on =
        (board ? ` | board: ${board.id} step ${board.step + 1}/${board.look.steps.length}` : '') +
        (wash ? ` | wash board: ${wash.id} step ${wash.step + 1}` : '');
      return `Prep: ${prep.tasksDone}/${prep.tasksTotal} | scraps ${prep.scrapsLeft} | next ${prep.next ?? '-'}${on}`;
    });
  }

  /** Remember where each case item sits (the morning's stock is src/fish-order-system.ts's). */
  private seeCaseItem(entity: Entity): void {
    const neta = entity.getValue(CaseItem, 'neta') as NetaId;
    this.caseItems.set(neta, entity);
  }

  /** The delivered fish, laid in the ice box (each in its wrapping), and stage 4's whole fish in their box at the sink. */
  private build(): void {
    const box = stations.get(StationKind.IceBox)!;
    // The fish box on its low stand at the sink's foot, lying long along X.
    const fishBox = new Vector3(FISH_BOX_X, FISH_STAND_HEIGHT, FISH_BOX_Z);
    // Everything on easy; what was ordered on full.
    nakagoApi.clear();
    for (const id of todaysMaterials()) {
      const look = prepMaterialLook(id, kohadaScale());
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
      const inFishBox = 'fishBox' in PREP[id];
      let slot: Vector3;
      if (inFishBox) {
        const [sx, sy] = FISH_SLOT[id] ?? [0, 0];
        // The box lies long along X: across it (the slot's x) runs along Z.
        slot = new Vector3(fishBox.x, fishBox.y + FISH_BOX_ICE_TOP + sy, fishBox.z + sx);
      } else {
        const [sx, sy, sz] = SLOT[id] ?? [0, 0];
        slot = new Vector3(box.pos.x + sx, box.pos.y + sy, box.pos.z + (sz ?? 0));
        // The range's ingredients come in the fish shop's inserts (the anago opened, in its pack): each rests on its floor.
        if (NAKAGO_IDS.includes(id)) {
          slot.y += NAKAGO_FLOOR;
          nakagoApi.deliver(id, slot);
        }
      }
      const boxYaw = inFishBox ? FISH_BOX_YAW : 0;
      root.position.copy(slot);
      root.rotation.y = boxYaw;
      this.world.createTransformEntity(root);
      const frac = fractionOf(id);
      this.materials.push({ id, look, root, slot, state: 'box', home: 'box', boxYaw, baseY: slot.y, frac, step: 0, parts, centres, grades: [], loose: [] });
    }
    if (this.materials.some((m) => this.fromFishBox(m))) this.buildSink(fishBox);
    this.built = true;
    // Today's tasks: what came, the work that comes with it, and the shari. Done already if nothing came.
    prep.tasksTotal = todaysTaskCount() + (stage.prep && !stageRice() ? 0 : 1);
    console.log(`[Prep] the delivery is in the ice box: ${this.materials.length} material(s)`);
    this.checkDone();
  }

  /** The sink's things for the whole fish: the box on its stand at the sink's foot, the wash board over the basin, the tap's water, the tools, a trash bin. */
  private buildSink(fishBox: Vector3): void {
    this.fishStand = createFishStand(FISH_BOX_DEPTH + 0.04, FISH_BOX_WIDTH + 0.04, FISH_STAND_HEIGHT);
    this.fishStand.position.set(fishBox.x, 0, fishBox.z);
    this.world.createTransformEntity(this.fishStand);
    this.fishBox = createFishBox(FISH_BOX_WIDTH, FISH_BOX_DEPTH, FISH_BOX_HEIGHT, FISH_BOX_ICE_TOP);
    this.fishBox.position.copy(fishBox);
    this.fishBox.rotation.y = Math.PI / 2;
    this.world.createTransformEntity(this.fishBox);
    this.washBoard = createWashBoard(WASH_BOARD_WIDTH, WASH_BOARD_DEPTH, WASH_BOARD_THICKNESS);
    this.washBoard.position.set(SINK_BASIN_X, SINK_TOP, WASH_BOARD_Z);
    this.world.createTransformEntity(this.washBoard);
    this.tapWater = createWaterStream(SPOUT.y - WASH_BOARD_TOP);
    this.tapWater.position.copy(SPOUT);
    this.tapWater.visible = false;
    this.world.createTransformEntity(this.tapWater);
    this.sinkBin = createTrashBin();
    this.sinkBin.name = 'SinkTrashBin';
    this.sinkBin.position.set(SINK_BIN_X, 0, SINK_BIN_Z);
    this.world.createTransformEntity(this.sinkBin);
    this.sinkLid = this.sinkBin.getObjectByName('Lid') ?? null;
    const board = stations.get(StationKind.CuttingBoard);
    // The scaler and the deba on the soap strip, handles toward the chef; the tweezers on the board's back row.
    const scalerHome = new Vector3(SCALER_X, SINK_TOP + 0.004, SCALER_Z);
    this.addTool('Scaler', createScaler(), scalerHome, Math.PI, scalerHome.clone().add(new Vector3(0, 0.01, -0.03)));
    const debaHome = new Vector3(DEBA_X, SINK_TOP + 0.001, DEBA_Z);
    this.addTool('Deba', createDeba(), debaHome, -Math.PI / 2, debaHome.clone().add(new Vector3(0, 0.01, -0.07)));
    if (board) {
      // Gripped on the knife hand's side (src/handedness.ts).
      const home = new Vector3(board.pos.x + sideX(TWEEZERS_X + 0.055), board.pos.y + 0.001, board.pos.z - 0.1);
      this.addTool('Tweezers', createTweezers(), home, handedness.left ? Math.PI : 0, home.clone().add(new Vector3(sideX(-0.05), 0.004, 0)));
    }
    console.log('[Prep] the whole fish are in their box by the sink');
  }

  private addTool(kind: Tool['kind'], object: Object3D, home: Vector3, homeYaw: number, grip: Vector3): void {
    object.position.copy(home);
    object.rotation.y = homeYaw;
    this.world.createTransformEntity(object);
    this.tools.push({ object, home, homeYaw, grip, held: -1, kind });
  }

  private tool(kind: Tool['kind']): Tool | undefined {
    return this.tools.find((t) => t.kind === kind);
  }

  /** Delivered in the fish box at the sink (stage 4). */
  private fromFishBox(m: Material): boolean {
    return 'fishBox' in PREP[m.id];
  }

  /** Its next step is done on the wash board (it still has washing to do). */
  private sinkNext(m: Material): boolean {
    return !!m.look.steps[m.step]?.sink;
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
      // Nothing in it today (full: no ice box material ordered): it never comes.
      const shown = prep.delivered && prep.active && !prep.done && (!this.built || this.materials.some((m) => !this.fromFishBox(m)));
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
    this.updateTools();
    this.updateSinkThings(delta);
    const board = this.boardMaterial();
    const step = board ? board.look.steps[board.step] : undefined;
    // The work in front of the chef: the wash board facing the sink, the manaita facing the bar.
    const wash = this.washMaterial();
    const work = chef.facingBack ? (wash && this.sinkNext(wash) ? wash : null) : board;
    const live = work ? work.look.steps[work.step] : undefined;
    this.guide.visible = false;
    // Cooling goes on whichever way the chef faces.
    if (board && step?.kind === 'cool') this.updateCool(board, step, delta);
    if (this.tapWater) this.tapWater.visible = !!wash && wash.look.steps[wash.step]?.kind === 'rinse';
    if (work && live?.kind === 'cut') this.updateCut(work, live);
    else if (work && live?.kind === 'pull') this.updatePull(work, live);
    else if (work && live?.kind === 'wipe') this.updateWipe(work);
    else if (work && live?.kind === 'brush') this.updateBrush(work);
    else if (work && live?.kind === 'scale') this.updateScale(work, live);
    else if (work && live?.kind === 'turn') this.updateTurn(work, live);
    else if (work && live?.kind === 'rinse') this.updateRinse(work, live);
    else if (work && live?.kind === 'pins') this.updatePins(work, live);
    if (live?.kind !== 'turn' && this.turnSide >= 0) this.turnSide = -1;
    this.updatePick(chef.netaSide, board, step, live);
    this.updatePick(chef.riceSide, board, step, live);
    prep.scrapsLeft = this.loose.filter((l) => l.kind === 'scrap' && !l.done).length + this.carried.filter((c) => c?.kind === 'paper').length;
    this.publish();
    this.hints();
  }

  private boardMaterial(): Material | null {
    for (const m of this.materials) if (m.state === 'board') return m;
    return null;
  }

  private washMaterial(): Material | null {
    for (const m of this.materials) if (m.state === 'wash') return m;
    return null;
  }

  /** Root-local point to world (a root turns about Y only). */
  /** Root-local to world: the root's place, its turn about Y, and its mirror (a whole fish lies head right on the board). */
  private toWorld(m: Material, local: Vector3, out: Vector3): Vector3 {
    out.copy(local);
    out.x *= m.root.scale.x;
    return out.applyAxisAngle(this.yAxis, m.root.rotation.y).add(m.root.position);
  }

  private toLocal(m: Material, world: Vector3, out: Vector3): Vector3 {
    out.copy(world).sub(m.root.position).applyAxisAngle(this.yAxis, -m.root.rotation.y);
    out.x *= m.root.scale.x;
    return out;
  }

  /**
   * A whole fish washed at the sink (its head cut off there, head left) is
   * filleted on the board head right, belly still toward the chef (the
   * owner): laid over, its look mirrored left to right.
   */
  private headRight(m: Material): boolean {
    return !!m.look.alongX && m.look.steps.some((s) => !!s.sink);
  }

  /** Laid on the board mirrored: a fish filleted head right, and for a left-handed chef the other way round (all of the board's work is mirrored). */
  private boardFlip(m: Material): boolean {
    return this.headRight(m) !== handedness.left;
  }

  /** A point over the material's footprint (plus a margin), between its bottom and a little over its top. */
  private overMaterial(m: Material, p: Vector3, margin: number, above = 0.07): boolean {
    const l = this.toLocal(m, p, this.tmpL);
    const { halfWidth, length, top, alongX } = m.look;
    const ax = alongX ? length / 2 : halfWidth;
    const az = alongX ? halfWidth : length / 2;
    return Math.abs(l.x) < ax + margin && Math.abs(l.z) < az + margin && l.y > -0.02 && l.y < top + above;
  }

  /** The bar is open: the ice box and what is left in it are put away. */
  private clearAway(): void {
    this.cleared = true;
    this.guide.visible = false;
    for (const m of this.materials) m.root.visible = false;
    for (const l of this.loose) for (const p of l.parts) p.visible = false;
    for (const o of [this.fishBox, this.fishStand, this.washBoard, this.tapWater, this.sinkBin, ...this.tools.map((t) => t.object)]) if (o) o.visible = false;
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

  // ---- the whole fish's tools and the sink -----------------------------------------------

  /**
   * The scaler and the tweezers are taken with a pinch and held while it
   * lasts; the deba like the board's knife, with a fist. Let go, each goes
   * back to its place.
   */
  private updateTools(): void {
    for (const t of this.tools) {
      if (t.held < 0) {
        for (const side of [chef.riceSide, chef.netaSide]) {
          const hand = hands.all[side];
          const state = chef.hands[side];
          if (!hand.tracked || state.holding !== Held.None || this.carried[side]) continue;
          const start = t.kind === 'Deba' ? hand.fistStart : hand.pinchStart;
          const at = t.kind === 'Deba' ? hand.palm : this.pinchPoint(side);
          if (!start || at.distanceTo(t.grip) > TOOL_PICK) continue;
          if (state.needsWash && t.kind !== 'Deba') {
            this.washFirst(StationKind.Sink);
            continue;
          }
          t.held = side;
          state.holding = Held[t.kind];
          hand.pinchStart = false;
          if (t.kind === 'Deba') coach.done('holdDeba');
          console.log(`[Prep] the ${t.kind === 'Deba' ? 'deba' : t.kind.toLowerCase()} in hand`);
          break;
        }
        continue;
      }
      const side = t.held as Side;
      const hand = hands.all[side];
      const end = t.kind === 'Deba' ? hand.fistEnd : hand.pinchEnd;
      if (!hand.tracked || end) {
        chef.hands[side].holding = Held.None;
        t.held = -1;
        t.object.position.copy(t.home);
        t.object.rotation.set(0, t.homeYaw, 0, 'XYZ');
        if (t.kind === 'Deba') coach.done('putDeba');
        else coach.done('putTool');
        console.log(`[Prep] the ${t.kind === 'Deba' ? 'deba' : t.kind.toLowerCase()} back in its place`);
        continue;
      }
      const yaw = (hand.yawDeg * Math.PI) / 180;
      if (t.kind === 'Deba') {
        // On its edge for a cut, laid flat for a shave.
        t.object.position.copy(hand.palm);
        t.object.rotation.set(prep.guideLow ? 0 : Math.PI / 2, yaw + Math.PI / 2, 0, 'YXZ');
        this.debaBlade.copy(hand.palm).addScaledVector(hand.fingerDir, DEBA_REACH);
      } else {
        t.object.position.copy(hand.grasp);
        t.object.rotation.set(0, t.kind === 'Scaler' ? yaw : yaw + Math.PI / 2, 0);
      }
    }
    prep.scalerHeld = this.tool('Scaler')?.held !== undefined && this.tool('Scaler')!.held >= 0;
    prep.debaHeld = this.tool('Deba')?.held !== undefined && this.tool('Deba')!.held >= 0;
    prep.tweezersHeld = this.tool('Tweezers')?.held !== undefined && this.tool('Tweezers')!.held >= 0;
  }

  /** The fish box shows while a fish lies in it; the wash board while there is washing to do; the sink bin's lid opens for a hand. */
  private updateSinkThings(delta: number): void {
    if (this.fishBox) this.fishBox.visible = this.materials.some((m) => this.fromFishBox(m) && (m.state === 'box' || (m.state === 'held' && m.home === 'box')));
    if (this.fishStand && this.fishBox) this.fishStand.visible = this.fishBox.visible;
    if (this.washBoard) {
      // Until the last fish is washed and its head and guts are thrown away.
      this.washBoard.visible =
        this.materials.some((m) => m.state === 'wash' || (this.fromFishBox(m) && this.sinkNext(m))) ||
        this.loose.some((l) => l.kind === 'scrap' && !l.done && this.atSink(l));
    }
    if (this.sinkLid && this.sinkBin) {
      let near = false;
      for (const hand of hands.all) {
        if (!hand.tracked) continue;
        const dx = hand.grasp.x - SINK_BIN_X;
        const dz = hand.grasp.z - SINK_BIN_Z;
        if (dx * dx + dz * dz < 0.06 && hand.grasp.y > SINK_BIN_TOP - 0.05 && hand.grasp.y < SINK_BIN_TOP + 0.45) near = true;
      }
      this.sinkLidAngle += ((near ? 1.2 : 0) - this.sinkLidAngle) * Math.min(1, delta * 10);
      this.sinkLid.rotation.z = this.sinkLidAngle;
    }
  }

  /** Over the sink's trash bin (its opening). */
  private overSinkBin(p: Vector3): boolean {
    if (!this.sinkBin) return false;
    const dx = p.x - SINK_BIN_X;
    const dz = p.z - SINK_BIN_Z;
    return dx * dx + dz * dz < 0.15 * 0.15 && p.y > SINK_BIN_TOP - 0.05 && p.y < SINK_BIN_TOP + 0.3;
  }

  /** Over the wash board at the sink. */
  private overWash(p: Vector3): boolean {
    return (
      !!this.washBoard?.visible &&
      Math.abs(p.x - SINK_BASIN_X) < WASH_BOARD_WIDTH / 2 + 0.03 &&
      Math.abs(p.z - WASH_BOARD_Z) < WASH_BOARD_DEPTH / 2 + 0.03 &&
      p.y > WASH_BOARD_TOP - 0.03 &&
      p.y < WASH_BOARD_TOP + 0.3
    );
  }

  // ---- picking things up -----------------------------------------------------------

  /** A free hand's pinch: a fish from the ice (or the fish box, or the wash board), a saku or scrap, or a sheet of paper. */
  private updatePick(side: Side, board: Material | null, step: PrepStep | undefined, live: PrepStep | undefined): void {
    const hand = hands.all[side];
    const state = chef.hands[side];
    if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None || this.carried[side]) return;
    // A pull step's grips are taken by updatePull, a turn's by updateTurn.
    if (live?.kind === 'pull' && ((side === chef.netaSide && this.netaGrip) || (side === chef.riceSide && this.riceGrip))) return;
    if (live?.kind === 'turn' && this.turnSide === side) return;
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
    const m = this.materialAt(at);
    if (!m) return;
    // A fish for the board: the neta hand, the board free; a whole fish for the wash board, that one free. The range's ingredients: either hand.
    if (PREP[m.id].kind !== 'simmer') {
      if (side !== chef.netaSide) return;
      if (this.sinkNext(m) ? m.state === 'box' && this.washMaterial() : board || prep.boardBusy) return;
    }
    if (state.needsWash) return this.washFirst(m.state === 'wash' || this.fromFishBox(m) ? StationKind.Sink : StationKind.IceBox);
    const from = m.state === 'wash' ? 'the wash board' : this.fromFishBox(m) ? 'the fish box' : 'the ice';
    this.carry(side, { kind: 'material', m });
    m.state = 'held';
    state.holding = Held.Saku;
    this.grabOffset[side].copy(m.root.position).sub(hand.grasp);
    console.log(`[Prep] took the ${PREP[m.id].name.toLowerCase()} from ${from}`);
  }

  private washFirst(at: (typeof StationKind)[keyof typeof StationKind]): void {
    feedback.flash(at, COLOR_WARN);
    coach.mistake('washFirst', at);
    console.log('[Prep] wash your hands before touching the fish');
  }

  /** The highest material in a box under a point, or the washed fish on the wash board (to carry to the manaita). */
  private materialAt(p: Vector3): Material | null {
    let best: Material | null = null;
    for (const m of this.materials) {
      const takeable = m.state === 'box' || (m.state === 'wash' && !this.sinkNext(m));
      if (!takeable || !this.overMaterial(m, p, 0.03)) continue;
      if (!best || m.root.position.y > best.root.position.y) best = m;
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
      rangeApi.carried(c.m.id, c.m.root);
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
    if (PREP[m.id].kind === 'simmer') {
      // Into its pot on the range (or back on the ice).
      if (rangeApi.putIn(m.id, m.root, at)) {
        m.state = 'pot';
        return;
      }
      m.root.position.copy(m.slot);
      m.state = 'box';
      return;
    }
    const board = stations.get(StationKind.CuttingBoard);
    const washing = this.sinkNext(m);
    if (washing && this.overWash(at) && !this.washMaterial()) {
      // On the wash board, under the tap, head on the chef's left (facing the sink).
      m.root.position.set(SINK_BASIN_X, WASH_BOARD_TOP, WASH_BOARD_Z);
      m.root.rotation.y = WASH_YAW;
      m.baseY = WASH_BOARD_TOP;
      m.state = 'wash';
      m.home = 'wash';
      feedback.flash(StationKind.Sink, COLOR_DONE);
      coach.done('takeMaterial');
      console.log(`[Prep] the ${PREP[m.id].name.toLowerCase()} is on the wash board`);
      return;
    }
    if (washing && overStation(at, StationKind.CuttingBoard)) {
      feedback.flash(StationKind.Sink, COLOR_WARN);
      console.log(`[Prep] the ${PREP[m.id].name.toLowerCase()} is washed at the sink first`);
    } else if (!washing && board && overStation(at, StationKind.CuttingBoard) && !this.boardMaterial() && !prep.boardBusy) {
      const [bx, bz] = m.look.boardAt ?? [0, 0];
      const flip = this.boardFlip(m);
      m.root.position.set(board.pos.x + (flip ? -bx : bx), board.pos.y, board.pos.z + bz);
      m.root.rotation.y = 0;
      m.root.scale.x = flip ? -1 : 1;
      m.baseY = board.pos.y;
      m.state = 'board';
      prep.boardUsed = true;
      feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
      coach.done('takeMaterial');
      console.log(`[Prep] the ${PREP[m.id].name.toLowerCase()} is on the board`);
      return;
    }
    this.backHome(m);
  }

  /** Let go elsewhere: back in its box, or back on the wash board once it has been laid there. */
  private backHome(m: Material): void {
    m.root.scale.x = 1;
    if (m.home === 'wash' && !this.washMaterial()) {
      m.root.position.set(SINK_BASIN_X, WASH_BOARD_TOP, WASH_BOARD_Z);
      m.root.rotation.y = WASH_YAW;
      m.baseY = WASH_BOARD_TOP;
      m.state = 'wash';
      return;
    }
    m.root.position.copy(m.slot);
    m.root.rotation.y = m.boxYaw;
    m.baseY = m.slot.y;
    m.home = 'box';
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
    if (board) c.mesh.position.set(board.pos.x + sideX(SCRAP_X), board.pos.y + 0.002, board.pos.z - 0.06);
    this.loose.push({ kind: 'scrap', m: null, parts: [c.mesh], home: [c.mesh.position.clone()], centre: new Vector3(), length: 0.1, product: null, done: false });
  }

  private releaseLoose(l: Loose, at: Vector3): void {
    if (l.kind === 'scrap') {
      if (overStation(at, StationKind.TrashBin) || this.overSinkBin(at)) {
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
      const full = l.full ?? NETA[product.neta].stock;
      const stock = l.stock ?? full;
      this.stock(product.neta, stock, full);
      feedback.flash(StationKind.NetaCase, COLOR_DONE);
      coach.done('stockSaku');
      console.log(`[Prep] ${product.neta} in the case (${stock} of ${full})`);
    } else if (product.dest === 'ice' && overStation(at, StationKind.IceBox)) {
      l.done = true;
      // Back on the ice where the bonito lay, to be seared later.
      const m = l.m!;
      const target = this.tmp.copy(m.slot).sub(m.root.position).sub(l.centre).add(this.tmp2.set(0, l.centre.y + 0.004, 0));
      for (let i = 0; i < l.parts.length; i++) l.parts[i].position.copy(target).add(l.home[i]).sub(l.home[0]);
      if (PREP_STAGE >= 3) {
        // The range takes it from here (skewers, the net): its own belly lies where this one would.
        for (const p of l.parts) p.visible = false;
        rangeApi.bellyOnIce(this.tmp.copy(m.slot).add(this.tmp2.set(0, 0.004, 0)));
      }
      feedback.flash(StationKind.IceBox, COLOR_DONE);
      coach.done('stockSaku');
      console.log(`[Prep] ${product.neta} back on the ice, to be seared`);
    } else if (product.dest === 'cure' && cureApi.lay(l.m!.id, l.parts, at)) {
      // Into its tray on the drainboard: the curing keeps it from here, and finishes its task.
      l.done = true;
      l.m!.state = 'cure';
      return;
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

  /** Where a cut's guide line lies (world): its middle. (A root turns by 0 or π, so the axes stay the world's.) */
  private lineOf(m: Material, s: Extract<PrepStep, { kind: 'cut' }>, out: Vector3): Vector3 {
    const y = s.low ? 0.006 : m.look.top;
    this.tmpL.set(s.axis === 'z' ? s.at : s.mid, y, s.axis === 'z' ? s.mid : s.at);
    return this.toWorld(m, this.tmpL, out);
  }

  private updateCut(m: Material, s: Extract<PrepStep, { kind: 'cut' }>): void {
    const line = this.lineOf(m, s, this.tmp);
    const across = s.axis === 'x';
    // At the sink the deba cuts; on the board the yanagiba (the deba too, if it is in hand).
    const deba = this.tool('Deba');
    const debaHeld = !!deba && deba.held >= 0;
    const held = debaHeld || knifeApi.held;
    this.guide.visible = held;
    this.guide.position.copy(line).add(this.tmp2.set(0, 0.003, 0));
    this.guide.scale.set(across ? s.len : 0.003, 1, across ? 0.003 : s.len);
    if (!held) {
      this.cutStart = null;
      return;
    }
    const blade = debaHeld ? this.debaBlade : knifeApi.blade;
    const neta = hands.all[chef.netaSide];
    const r = m.root.position;
    // The other hand steadies the fish: on it, or by the line (a fillet laid out beside it).
    const nearRoot = Math.hypot(neta.palm.x - r.x, neta.palm.z - r.z) < m.look.halfWidth + m.look.length / 2 + 0.06;
    const nearLine = Math.hypot(neta.palm.x - line.x, neta.palm.z - line.z) < s.len / 2 + 0.12;
    const holdingDown = neta.tracked && (nearRoot || nearLine) && neta.palm.y < r.y + m.look.top + 0.15;
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
    // Drawn back the other way (after a catch, the blade is taken back for another stroke): the stroke starts over from there.
    const towardChef = Math.cos(m.root.rotation.y) < 0 ? -1 : 1;
    if (!across && (pos - this.cutStart) * towardChef < -0.005) {
      this.cutStart = pos;
      this.offSum = this.offCount = 0;
    }
    this.offSum += off;
    this.offCount++;
    // Toward the chef along the line (who stands at -Z of the wash board, at +Z of the manaita); across, either way.
    const toward = Math.cos(m.root.rotation.y) < 0 ? -1 : 1;
    const travel = across ? Math.abs(pos - this.cutStart) : (pos - this.cutStart) * toward;
    if (travel < CUT_STROKE) return;
    if (!debaHeld && !this.caught && edgeCatches()) {
      // The yanagiba's dull edge caught in the flesh: the line is not cut; draw it again.
      this.caught = true;
      this.cutStart = null;
      feedback.flash(m.state === 'wash' ? StationKind.Sink : StationKind.CuttingBoard, COLOR_WARN);
      coach.mistake('dullEdge', StationKind.Knife);
      console.log(`[Prep] the dull edge caught in the flesh (edge ${chef.knifeSharp.toFixed(2)}): draw it again`);
      return;
    }
    this.caught = false;
    this.cutStart = null;
    const mean = this.offSum / Math.max(1, this.offCount);
    const grade: Grade = mean < PREP_CUT_EXCELLENT ? 'Excellent' : mean < PREP_CUT_GOOD ? 'Good' : mean < PREP_CUT_POOR ? 'Poor' : 'Bad';
    m.grades.push(grade);
    if (!debaHeld) {
      chef.knifeDirty = true;
      wearKnife();
    }
    if (m.state === 'board') chef.boardDirt = Math.min(1, chef.boardDirt + BOARD_DIRT_PER_CUT);
    coach.done('cutPrep');
    console.log(`[Prep] ${s.say.toLowerCase()} (${PREP[m.id].name.toLowerCase()}, step ${m.step + 1}): ${grade}, ${(mean * 1000).toFixed(1)} mm off the line`);
    this.stepDone(m, s);
  }

  private updatePull(m: Material, s: Extract<PrepStep, { kind: 'pull' }>): void {
    const neta = hands.all[chef.netaSide];
    const rice = hands.all[chef.riceSide];
    const netaAt = this.toWorld(m, s.netaAt, this.tmp);
    const riceAt = this.toWorld(m, s.riceAt, this.tmp2);
    // The holding hand: a pinch by its grip point, or anywhere on the fish.
    const holdAt = neta.tracked && neta.pinchStart ? this.pinchPoint(chef.netaSide) : null;
    if (holdAt && chef.hands[chef.netaSide].holding === Held.None && (holdAt.distanceTo(netaAt) < 0.09 || this.overMaterial(m, holdAt, 0.02))) {
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
    parts.forEach((p, i) => p.position.copy(this.pullHome[i]).add(this.inParent(p, moved, this.tmpW)));
    // Pulled apart, or drawn well away from where it was gripped (toward the chef, past the holding hand).
    const apart = neta.grasp.distanceTo(rice.grasp) - this.pullStart;
    if (Math.max(apart, moved.length() * 0.8) < SQUID_PULL_DISTANCE) return;
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
      const over = this.overMaterial(m, g, 0.05, 0.06);
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

  /** Hot from the pot, it lies on the board a while before it can be worked. */
  private updateCool(m: Material, s: Extract<PrepStep, { kind: 'cool' }>, delta: number): void {
    if (this.coolFor !== m) {
      this.coolFor = m;
      this.coolT = 0;
    }
    this.coolT += delta;
    if (this.coolT < s.seconds) return;
    this.coolFor = null;
    console.log(`[Prep] the ${PREP[m.id].name.toLowerCase()} are cool enough to handle`);
    this.stepDone(m, s);
  }

  /** The tsume brush stroked over the material: the opened clams darken and shine. */
  private updateBrush(m: Material): void {
    for (const side of [chef.netaSide, chef.riceSide]) {
      if (!tsumeApi.tipAt(side, this.tmpW)) continue;
      // The bristles over the clams, touching or nearly (a few centimetres' grace).
      const over = this.overMaterial(m, this.tmpW, 0.03, 0.05);
      if (this.brushRub.update(this.tmpW, over) < RUB_WIPE_BOARD) continue;
      this.brushRub.reset();
      for (const mat of (m.root.userData.glaze as MeshStandardMaterial[] | undefined) ?? []) {
        mat.color.lerp(TSUME_COLOR, 0.5);
        mat.roughness = 0.22;
      }
      m.grades.push('Excellent');
      coach.done('brushTsume');
      console.log(`[Prep] tsume on (${PREP[m.id].name.toLowerCase()})`);
      this.stepDone(m, m.look.steps[m.step]);
      return;
    }
  }

  /** The hamaguri out of their pot, let go over the board (their broth stays for the soup): on the board to cool, then worked there. */
  private fromPot(id: PrepId, grade: Grade): boolean {
    const m = this.materials.find((x) => x.id === id && x.state === 'pot');
    const board = stations.get(StationKind.CuttingBoard);
    if (!m || !board) return false;
    if (this.boardMaterial() || prep.boardBusy) {
      feedback.flash(StationKind.CuttingBoard, COLOR_WARN);
      console.log(`[Prep] the board is in use: finish what is on it first`);
      return false;
    }
    const [bx, bz] = m.look.boardAt ?? [0, 0];
    m.root.position.set(board.pos.x + sideX(bx), board.pos.y, board.pos.z + bz);
    m.root.rotation.set(0, 0, 0);
    m.root.scale.x = 1;
    m.baseY = board.pos.y;
    m.state = 'board';
    m.step = 0;
    m.grades.push(grade);
    prep.boardUsed = true;
    feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
    console.log(`[Prep] the ${PREP[m.id].name.toLowerCase()} are on the board to cool (${grade})`);
    return true;
  }

  /** A world direction in a part's parent's frame (the root turns; the fish's group rolls over). */
  private inParent(p: Object3D, dir: Vector3, out: Vector3): Vector3 {
    out.copy(dir);
    if (!p.parent) return out;
    out.applyQuaternion(p.parent.getWorldQuaternion(this.quat).invert());
    // A mirrored fish (head right on the board): its X runs the other way.
    p.parent.updateWorldMatrix(true, false);
    if (p.parent.matrixWorld.determinant() < 0) out.x = -out.x;
    return out;
  }

  /** The scaler scraped over the fish (tail to head, again and again) until the scales on top are gone. */
  private updateScale(m: Material, s: Extract<PrepStep, { kind: 'scale' }>): void {
    const tool = this.tool('Scaler');
    const part = m.parts.get(s.part) as Mesh | undefined;
    if (!tool || tool.held < 0) {
      this.scaleOn = false;
      return;
    }
    const g = hands.all[tool.held].grasp;
    const over = this.overMaterial(m, g, 0.02, 0.05);
    if (over && this.scaleOn) this.scaled += g.distanceTo(this.scaleLast);
    this.scaleLast.copy(g);
    this.scaleOn = over;
    const left = Math.max(0, 1 - this.scaled / SCALE_RUB);
    if (part) (part.material as MeshStandardMaterial).opacity = SCALES_OPACITY * left;
    if (left > 0) return;
    this.scaled = 0;
    this.scaleOn = false;
    m.grades.push('Excellent');
    coach.done('scaleFish');
    console.log(`[Prep] scales off (${PREP[m.id].name.toLowerCase()})`);
    this.stepDone(m, { ...s, hide: [...(s.hide ?? []), s.part] });
  }

  /** A pinch on the fish and a little lift: it rolls over. */
  private updateTurn(m: Material, s: Extract<PrepStep, { kind: 'turn' }>): void {
    if (this.turnSide < 0) {
      for (const side of [chef.netaSide, chef.riceSide]) {
        const hand = hands.all[side];
        if (!hand.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None || this.carried[side]) continue;
        const at = this.pinchPoint(side);
        if (!this.overMaterial(m, at, 0.03) && at.distanceTo(this.toWorld(m, s.at, this.tmp)) > 0.08) continue;
        if (chef.hands[side].needsWash) {
          this.washFirst(m.state === 'wash' ? StationKind.Sink : StationKind.CuttingBoard);
          return;
        }
        this.turnSide = side;
        this.turnY = hand.grasp.y;
        break;
      }
      if (this.turnSide < 0) return;
    }
    const hand = hands.all[this.turnSide];
    if (!hand.tracked || !hand.pinch) {
      this.turnSide = -1;
      m.root.position.y = m.baseY;
      return;
    }
    const rise = hand.grasp.y - this.turnY;
    m.root.position.y = m.baseY + Math.min(0.06, Math.max(0, rise));
    if (rise < TURN_LIFT) return;
    this.turnSide = -1;
    m.root.position.y = m.baseY;
    m.grades.push('Excellent');
    coach.done('turnFish');
    console.log(`[Prep] turned over (${PREP[m.id].name.toLowerCase()})`);
    this.stepDone(m, s);
  }

  /** A hand rubs the belly cavity clean under the running tap. */
  private updateRinse(m: Material, s: Extract<PrepStep, { kind: 'rinse' }>): void {
    const spot = this.toWorld(m, s.at, this.tmp);
    let rubbing = false;
    let rubbed = 0;
    for (const side of [chef.riceSide, chef.netaSide]) {
      const hand = hands.all[side];
      if (!hand.tracked || chef.hands[side].holding !== Held.None || this.carried[side]) continue;
      const g = hand.grasp;
      const over = Math.hypot(g.x - spot.x, g.z - spot.z) < 0.09 && g.y < spot.y + 0.07 && g.y > spot.y - 0.04;
      if (!over) continue;
      rubbed = this.rinseRub.update(g, true);
      rubbing = true;
      break;
    }
    if (!rubbing) this.rinseRub.update(spot, false);
    if (rubbed < RINSE_RUB) return;
    this.rinseRub.reset();
    m.grades.push('Excellent');
    coach.done('rinseFish');
    console.log(`[Prep] washed under the tap (${PREP[m.id].name.toLowerCase()})`);
    this.stepDone(m, s);
  }

  /** A pin bone's tip (world). */
  private pinTip(p: Object3D, out: Vector3): Vector3 {
    return p.localToWorld(out.set(-Math.sin(0.45) * PIN_LENGTH, Math.cos(0.45) * PIN_LENGTH, 0));
  }

  /** The tweezers' tips to a pin bone, then up: it comes out. Every pin out, the step is done. */
  private updatePins(m: Material, s: Extract<PrepStep, { kind: 'pins' }>): void {
    const tool = this.tool('Tweezers');
    if (!tool || tool.held < 0) {
      this.pinGrip = null;
      return;
    }
    const tip = hands.all[tool.held].grasp;
    if (!this.pinGrip) {
      for (const name of s.pins) {
        const p = m.parts.get(name);
        if (!p?.visible || this.pinTip(p, this.tmp).distanceTo(tip) > PIN_GRIP) continue;
        this.pinGrip = p;
        this.pinY = tip.y;
        break;
      }
      return;
    }
    const p = this.pinGrip;
    const at = this.pinTip(p, this.tmp);
    if (Math.hypot(at.x - tip.x, at.z - tip.z) > 0.04) {
      this.pinGrip = null;
      return;
    }
    if (tip.y - this.pinY < PIN_PULL) return;
    p.visible = false;
    this.pinGrip = null;
    console.log(`[Prep] a pin bone out (${PREP[m.id].name.toLowerCase()})`);
    if (s.pins.some((n) => m.parts.get(n)?.visible)) return;
    m.grades.push('Excellent');
    coach.done('pullPins');
    this.stepDone(m, s);
  }

  /** A step done: its effects, then the next step (or the saku, once all are done). */
  private stepDone(m: Material, s: PrepStep): void {
    for (const [name, dx, dz, dy = 0] of s.shift ?? []) {
      const p = m.parts.get(name);
      // Root-local offsets, in the part's own parent's frame (a part in the fish's group may be rolled over).
      if (p) p.position.add(p.parent === m.root || !p.parent ? this.tmp.set(dx, dy, dz) : this.tmp.set(dx, dy, dz).applyQuaternion(this.quat.copy(p.parent.quaternion).invert()));
    }
    if (s.flip && m.look.turnable) {
      const { group, thickness } = m.look.turnable;
      const over = group.rotation.x === 0;
      group.rotation.x = over ? Math.PI : 0;
      group.position.y = over ? thickness : 0;
    }
    for (const name of s.hide ?? []) {
      const p = m.parts.get(name);
      if (p) p.visible = false;
    }
    for (const name of s.show ?? []) {
      const p = m.parts.get(name);
      if (p) p.visible = true;
    }
    for (const name of s.scrap ?? []) {
      // A whole fish's scraps stay where they fell at the sink, or go to its pile clear of the work on the board.
      if (m.state === 'wash') this.scrapAside(m, name, false);
      else if (m.look.pileAt) this.scrapAside(m, name, true);
      else this.toScrap(m, name);
    }
    m.step++;
    feedback.flash(m.state === 'wash' ? StationKind.Sink : StationKind.CuttingBoard, COLOR_DONE);
    if (m.step < m.look.steps.length) return;
    // Every step done: the saku lie ready. Each crooked cut cost a slice or more, shared out among them.
    let loss = m.grades.reduce((sum, g) => sum + PREP_YIELD_LOSS[g], 0);
    const forCase = m.look.products.filter((p) => p.dest === 'case');
    const lost = forCase.map(() => 0);
    for (let i = 0; loss > 0 && forCase.length; i++, loss--) lost[i % forCase.length]++;
    const mirrored = m.root.scale.x < 0;
    for (const product of m.look.products) {
      const parts = product.parts.map((n) => m.parts.get(n)!);
      // Off a mirrored fish, the saku stand on their own (their places and middles in the world), as scraps do.
      if (mirrored) for (const p of parts) this.toWorldPart(p);
      const centre = mirrored ? new Box3().setFromObject(parts[0], true).getCenter(new Vector3()).sub(parts[0].position) : m.centres.get(product.parts[0])!.clone();
      const full = this.shareOf(m, product);
      const k = forCase.indexOf(product);
      const l: Loose = {
        kind: 'product', m, parts, home: parts.map((p) => p.position.clone()), centre,
        length: this.lengthOf(m, product.parts[0]), alongX: m.look.alongX, product,
        stock: k < 0 ? full : Math.max(Math.ceil(full / 2), full - lost[k]), full, done: false,
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
        this.cookDid = true;
        staff.cookOn = PREP[m.id].name;
        if (m.id === 'Tamago') tamagoApi.byCook();
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
      if (product.dest === 'ice' && PREP_STAGE >= 3) {
        // The belly too: seared in the back.
        this.stock(product.neta, NETA[product.neta].stock);
        rangeApi.bellyByCook();
        this.completeTask();
        continue;
      }
      // Cured too, in the back (the full difficulty's kohada and saba).
      if (product.dest !== 'case' && product.dest !== 'cure') continue;
      this.stock(product.neta, this.shareOf(m, product));
    }
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
    const size = new Box3().setFromObject(p, true).getSize(this.tmp);
    return m.look.alongX ? size.x : size.z;
  }

  /** A part out of its material into the world, where it is (its place, turn and mirror kept). */
  private toWorldPart(p: Object3D): void {
    p.updateWorldMatrix(true, true);
    const pos = new Vector3();
    const q = new Quaternion();
    const scale = new Vector3();
    p.matrixWorld.decompose(pos, q, scale);
    p.removeFromParent();
    this.world.createTransformEntity(p);
    p.position.copy(pos);
    p.quaternion.copy(q);
    p.scale.copy(scale);
    p.updateMatrixWorld(true);
  }

  /**
   * A freed scrap taken out of the material (so it stays put when the fish
   * is carried on): left where it fell, or laid on the pile (rows toward the
   * back, stacked a little), clear of the rest of the work.
   */
  private scrapAside(m: Material, name: string, pile: boolean): void {
    const p = m.parts.get(name);
    if (!p) return;
    p.visible = true;
    p.updateWorldMatrix(true, true);
    const pos = new Vector3();
    const q = new Quaternion();
    const scale = new Vector3();
    p.matrixWorld.decompose(pos, q, scale);
    p.removeFromParent();
    this.world.createTransformEntity(p);
    p.position.copy(pos);
    p.quaternion.copy(q);
    p.scale.copy(scale);
    p.updateMatrixWorld(true);
    let box = new Box3().setFromObject(p, true);
    const board = stations.get(StationKind.CuttingBoard);
    if (pile && board && m.look.pileAt) {
      const n = this.pileCount++;
      const c = box.getCenter(new Vector3());
      p.position.x += board.pos.x + sideX(m.look.pileAt[0]) - c.x;
      p.position.y += board.pos.y + 0.002 + (n % 4) * 0.004 - box.min.y;
      p.position.z += board.pos.z + m.look.pileAt[1] - (n % 4) * 0.035 - c.z;
      p.updateMatrixWorld(true);
      box = new Box3().setFromObject(p, true);
    }
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3()).sub(p.position);
    const l: Loose = {
      kind: 'scrap', m, parts: [p], home: [p.position.clone()], centre, length: Math.max(size.x, size.z), alongX: size.x >= size.z, product: null, done: false,
    };
    m.loose.push(l);
    this.loose.push(l);
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
    if (m.grades.length) {
      const score = Math.round(m.grades.reduce((s, g) => s + GRADE_POINTS[g], 0) / m.grades.length);
      console.log(`[Prep] ${PREP[m.id].name} done: ${score}`);
    }
    this.completeTask();
  }

  /** Slices into a case item from the prep (added to what is there; its yield counted against straight cuts). */
  private stock(neta: NetaId, stock: number, full = stock): void {
    const item = this.caseItems.get(neta);
    if (item) {
      const left = item.getValue(CaseItem, 'remaining') ?? 0;
      const now = Math.min(NETA[neta].stock, left + stock);
      item.setValue(CaseItem, 'remaining', now);
      noteAdded(neta, now - left);
    }
    this.yieldGot += stock;
    this.yieldFull += full;
  }

  /** A saku's share of its case item: the item's full stock over the saku of it this material gives. */
  private shareOf(m: Material, product: PrepProduct): number {
    const n = m.look.products.filter((p) => p.neta === product.neta).length;
    return Math.round((NETA[product.neta].stock * m.frac) / Math.max(1, n));
  }

  /** A task from elsewhere is done: a material from its pot (its own task), the seared belly, the shari. */
  private taskDone(what: string): void {
    const m = this.materials.find((x) => x.id === what && (x.state === 'pot' || x.state === 'cure'));
    if (m) {
      m.state = 'done';
      m.root.visible = false;
    }
    console.log(`[Prep] ${what} done`);
    this.completeTask();
  }

  /** One more task done; once all are, the prep is over (cleaning comes next). */
  private completeTask(): void {
    prep.tasksDone++;
    this.checkDone();
  }

  private checkDone(): void {
    if (prep.done || prep.tasksDone < prep.tasksTotal) return;
    prep.done = true;
    const all = this.materials.flatMap((x) => x.grades);
    for (const g of all) prep.cutGrades[g]++;
    const total = Math.round(all.reduce((s, g) => s + GRADE_POINTS[g], 0) / Math.max(1, all.length));
    const grade: Grade = total >= 90 ? 'Excellent' : total >= 75 ? 'Good' : total >= 55 ? 'Poor' : 'Bad';
    const pct = Math.round((100 * this.yieldGot) / Math.max(1, this.yieldFull));
    // No grade here (shops differ in their prep): only what came of it.
    setSpriteText(this.summary, all.length ? `Prep done: ${this.yieldGot} of ${this.yieldFull} slices` : this.cookDid ? 'Prep done by the cook' : 'Prep done');
    const board = stations.get(StationKind.CuttingBoard);
    if (board) this.summary.position.copy(board.pos).add(this.tmp.set(0, 0.32, -0.05));
    this.summary.visible = true;
    this.summaryTime = RESULT_SECONDS * 2;
    console.log(`[Prep] all prep done${all.length ? ` (cuts ${grade} ${total}, ${pct}%)` : this.cookDid ? ' by the cook' : ''}, yield ${this.yieldGot}/${this.yieldFull} slices; now clean up`);
  }

  // ---- what comes next (master, practice, hints) ------------------------------------

  private publish(): void {
    prep.next = null;
    prep.takeToPot = false;
    prep.takeId = '';
    prep.onBoard = '';
    prep.say = '';
    prep.guideAcross = prep.guideLow = false;
    knifeApi.flat = false;
    prep.where = 'board';
    prep.takeFrom = 'ice';
    prep.takeTo = 'board';
    prep.materialHeld = this.carried.some((c) => c?.kind === 'material');
    prep.productHeld = this.carried.some((c) => c?.kind === 'loose' && c.loose.kind === 'product');
    prep.washBusy = !!this.washMaterial();
    prep.pinsAt.length = 0;
    const trash = stations.get(StationKind.TrashBin);
    if (trash) prep.trashAt.copy(trash.pos);
    const paper = stations.get(StationKind.PaperBox);
    if (paper) prep.paperAt.copy(paper.pos);
    prep.washAt.set(SINK_BASIN_X, WASH_BOARD_TOP, WASH_BOARD_Z);
    prep.sinkBinAt.set(SINK_BIN_X, SINK_BIN_TOP, SINK_BIN_Z);
    for (const t of this.tools) (t.kind === 'Scaler' ? prep.scalerAt : t.kind === 'Deba' ? prep.debaAt : prep.tweezersAt).copy(t.grip);
    prep.sinkWanted =
      this.materials.some((x) => this.fromFishBox(x) && (x.state === 'box' || x.state === 'wash' || (x.state === 'held' && (this.sinkNext(x) || x.home === 'wash')))) ||
      this.loose.some((l) => l.kind === 'scrap' && !l.done && this.atSink(l));
    if (!prep.delivered) {
      prep.next = prep.ordered ? 'wait' : 'call';
      return;
    }
    const m = this.boardMaterial();
    if (m) {
      prep.onBoard = m.id;
      if (this.publishStep(m)) return;
      const p = m.loose.find((x) => x.kind === 'product' && !x.done);
      if (p) {
        prep.next = 'stock';
        this.centreOf(p, prep.productAt);
        prep.stockTo = p.product!.dest;
        if (p.product!.dest === 'ice') prep.slotAt.copy(m.slot).add(this.tmp.set(0, 0.02, 0));
        else if (p.product!.dest === 'cure') cureApi.trayAt(m.id, prep.slotAt);
        else {
          // Its place in the case (where the chef's hand has it, src/handedness.ts).
          this.caseItems.get(p.product!.neta)?.object3D?.getWorldPosition(prep.slotAt);
        }
        return;
      }
    }
    // A whole fish being washed at the sink.
    const wash = this.washMaterial();
    if (wash && this.sinkNext(wash) && this.publishStep(wash)) {
      prep.where = 'sink';
      return;
    }
    const held = this.materials.find((x) => x.state === 'held');
    if (held && PREP[held.id].kind === 'simmer') {
      // The range's ingredient goes into its own pot.
      prep.next = 'pot';
      prep.onBoard = held.id;
      rangeApi.potAt(held.id, prep.slotAt);
      return;
    }
    // What is in a hand; the washed fish, to the manaita; then the boxes, the ice box first, the one on top first.
    const washed = wash && !this.sinkNext(wash) && !m && !prep.boardBusy ? wash : null;
    const byTop = (a: Material, b: Material) => b.slot.y - a.slot.y;
    const inBox = this.materials.filter((x) => x.state === 'box');
    // The tamago's scallops and eggs wait on the ice till the suribachi is out on the work table.
    const fromIce = inBox.filter((x) => !this.fromFishBox(x) && (x.id !== 'Tamago' || tamagoApi.ready())).sort(byTop)[0];
    const fromFish = wash ? undefined : inBox.filter((x) => this.fromFishBox(x)).sort(byTop)[0];
    // The wash board cleared of scraps before a fish comes off it or onto it (the last one's would be in the way).
    const sinkScrap = !held && (washed || (!fromIce && fromFish)) ? this.loose.find((l) => l.kind === 'scrap' && !l.done && this.atSink(l)) : undefined;
    if (sinkScrap) {
      prep.next = 'discard';
      this.centreOf(sinkScrap, prep.scrapAt);
      prep.where = 'sink';
      prep.trashAt.copy(prep.sinkBinAt);
      return;
    }
    const next = held ?? washed ?? fromIce ?? fromFish;
    if (next) {
      this.publishTake(next);
      return;
    }
    // The scraps where the chef stands first (the sink's or the board's), not back and forth.
    const scraps = this.loose.filter((l) => l.kind === 'scrap' && !l.done);
    const scrap = scraps.find((l) => this.atSink(l) === (chef.at === 'sink')) ?? scraps[0];
    if (scrap) {
      prep.next = 'discard';
      this.centreOf(scrap, prep.scrapAt);
      if (this.atSink(scrap)) {
        prep.where = 'sink';
        prep.trashAt.copy(prep.sinkBinAt);
      }
    }
  }

  /** A scrap left at the sink (from the washing), thrown in the sink's own bin. */
  private atSink(l: Loose): boolean {
    return this.worldOf(l, 0).z > BACK_ROW_Z - 0.25;
  }

  /** The material's next step, if it has one, for the master and practice. */
  private publishStep(m: Material): boolean {
    const s = m.look.steps[m.step];
    if (!s) return false;
    prep.materialAt.copy(m.root.position).add(this.tmp.set(0, m.look.top, 0));
    prep.say = s.say;
    switch (s.kind) {
      case 'cut':
        prep.next = 'cut';
        this.lineOf(m, s, prep.guideAt);
        prep.guideLength = s.len;
        prep.guideAcross = s.axis === 'x';
        prep.guideLow = !!s.low;
        knifeApi.flat = prep.guideLow;
        break;
      case 'pull':
        prep.next = 'pull';
        this.toWorld(m, s.netaAt, prep.pullNeta);
        this.toWorld(m, s.riceAt, prep.pullRice);
        break;
      case 'wipe':
        prep.next = 'wipe';
        break;
      case 'cool':
        prep.next = 'cool';
        break;
      case 'brush':
        prep.next = 'tsume';
        break;
      case 'scale':
        prep.next = 'scale';
        break;
      case 'turn':
        prep.next = 'turn';
        this.toWorld(m, s.at, prep.pullNeta);
        break;
      case 'rinse':
        prep.next = 'rinse';
        this.toWorld(m, s.at, prep.rinseAt);
        break;
      case 'pins':
        prep.next = 'pins';
        for (const name of s.pins) {
          const p = m.parts.get(name);
          if (!p?.visible) continue;
          const k = prep.pinsAt.length;
          this.pinsPool[k] ??= new Vector3();
          prep.pinsAt.push(this.pinTip(p, this.pinsPool[k]));
        }
        break;
    }
    return true;
  }
  private readonly pinsPool: Vector3[] = [];

  /** The next material to take: where it lies (its near end, on top) and where it goes. */
  private publishTake(x: Material): void {
    prep.next = 'take';
    prep.takeTo = PREP[x.id].kind === 'simmer' ? 'pot' : this.sinkNext(x) ? 'wash' : 'board';
    prep.takeToPot = prep.takeTo === 'pot';
    prep.takeId = x.id;
    prep.takeFrom = x.home === 'wash' ? 'wash' : this.fromFishBox(x) ? 'fish' : 'ice';
    const { alongX, length, top } = x.look;
    this.tmpL.set(alongX ? length / 2 - 0.04 : 0, top + 0.012, alongX ? 0 : length / 2 - 0.04);
    if (x.look.takeAt) this.tmpL.set(x.look.takeAt[0], top + 0.012, x.look.takeAt[1]);
    if (x.state === 'held') prep.boxAt.copy(x.root.position);
    else this.toWorld(x, this.tmpL, prep.boxAt);
    if (prep.takeTo === 'wash') prep.slotAt.copy(prep.washAt);
    else {
      const board = stations.get(StationKind.CuttingBoard);
      const [bx, bz] = x.look.boardAt ?? [0, 0];
      if (board) prep.slotAt.copy(board.pos).add(this.tmp.set(bx, 0, bz));
    }
    // Where the chef stands for it: the sink to take from the fish box or the wash board, or to lay a fish on the wash board.
    const atSinkNow = x.state === 'held' ? prep.takeTo === 'wash' : prep.takeFrom !== 'ice';
    prep.where = atSinkNow ? 'sink' : 'board';
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
      case 'turn':
        feedback.hints.add(prep.where === 'sink' ? StationKind.Sink : StationKind.CuttingBoard);
        break;
      case 'scale':
      case 'rinse':
        feedback.hints.add(StationKind.Sink);
        break;
      case 'pins':
      case 'tsume':
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
