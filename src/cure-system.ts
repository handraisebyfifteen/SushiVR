import { Box3, Color, createSystem, Euler, Group, type Mesh, type MeshStandardMaterial, type Object3D, Quaternion, type Sprite, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { debugLines } from './debug.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { fractionOf, kohadaScale, todaysMaterials } from './fish-order.js';
import { chef, cure, type CureNext, prep } from './game-state.js';
import { hands } from './hands.js';
import {
  BACK_ROW_Z,
  KOHADA_ZARU_D,
  KOHADA_ZARU_X,
  KOHADA_ZARU_Z,
  SABA_TRAY_D,
  SABA_TRAY_W,
  SABA_TRAY_X,
  SABA_TRAY_Z,
  SALT_BOWL_X,
  SALT_BOWL_Z,
  SINK_BASIN_X,
  SINK_FRONT_RIM,
  SINK_TOP,
  TIMER_X,
  TIMER_Y,
  TIMER_Z,
  VINEGAR_POT_D,
  VINEGAR_POT_W,
  VINEGAR_POT_X,
  VINEGAR_POT_Z,
  WASH_BOARD_TOP,
  WASH_BOARD_Z,
  WATER_BOWL_R,
  WATER_BOWL_X,
} from './layout.js';
import { NETA, type NetaId } from './menu.js';
import type { PrepId } from './prep.js';
import { cureApi, prepApi } from './prep-api.js';
import {
  createKitchenTimer,
  createSaltBowl,
  createTray,
  createVinegarPot,
  createWaterBowl,
  createZaru,
  OPEN_THICKNESS,
  TIMER_FACE,
} from './scene-assets/lib/cure-look.js';
import { createWaterStream } from './scene-assets/lib/fillet-look.js';
import { playDone, playPick, playPress, playPut, playWarn } from './sfx.js';
import { overStation } from './station-system.js';
import { CaseItem, Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import {
  CURE_MINUTE_SECONDS,
  CURE_RINSE_SECONDS,
  KOHADA_SALT_MINUTES,
  SABA_SALT_MINUTES,
  SALT_COVER,
  SALT_PER_PINCH,
  SALT_RADIUS,
  SKIP_LEAD_SECONDS,
  SKIP_LONG_MINUTES,
  TIME_EXCELLENT,
  TIME_GOOD,
  TIME_POOR,
  VINEGAR_MINUTES,
} from './tuning.js';

type FishId = 'Kohada' | 'Saba';
const FISH: readonly FishId[] = ['Saba', 'Kohada'];
/**
 * The kohada: empty basket, salted basket (bedded), laid, salted over, in the
 * water (soaked: the salt comes off as they go in), drained on the basket, in
 * the vinegar. The saba: empty tray, laid, salted, rinsed, in the vinegar.
 */
type State = 'empty' | 'bedded' | 'laid' | 'salted' | 'soaked' | 'draining' | 'rinsed' | 'vinegar' | 'done';
type Side = 0 | 1;
type From = 'salt' | 'water' | 'pot';
type Place = { p: Vector3; q: Quaternion };

/** One fish's curing: its basket or tray (the salter), where its pieces are, its time. */
interface Batch {
  id: FishId;
  neta: NetaId;
  salter: Group;
  home: Vector3;
  W: number;
  D: number;
  /** The salter's own salt (the kohada's basket, under the fish) and the salt over the fish. */
  bed: Mesh | null;
  top: Mesh;
  parts: Object3D[];
  /** Each part's place in the salter, the water, the vinegar (container-local), to put them back. */
  saved: Record<From, Place[]>;
  state: State;
  /** Shop minutes in the present stage. */
  minutes: number;
  rinse: number;
  /** The salter's salt rinsed off (the kohada's basket, before the fish come back on it to drain). */
  clean: boolean;
  /** Where a pinch of salt would whiten the most still-bare salt (world). */
  saltAt: Vector3;
  coming: boolean;
  timer: Group;
  timerText: Sprite;
  /** What the timer shows now (a number standing for its text), so the text is redrawn only when it changes. */
  timerKey: number;
  /** The timer's body, coloured by where the time stands (ZONE_COLORS), and that zone. */
  face: MeshStandardMaterial;
  zone: number;
  /** Minutes in the vinegar when the fish were taken up out of it (graded when they reach the case). */
  taken: number;
  /** The last time's grade, shown on the timer for a moment. */
  note: string;
  noteTime: number;
}

/** What a timer shows when it is not a count of seconds: a grade, the blink at zero, no time running, nothing. */
const NOTE_KEY = 1e9;
const BLINK_KEY = 1e9 + 1;
const IDLE_KEY = 1e9 + 2;
const OFF_KEY = 1e9 + 3;
/**
 * The timer's body by where the time stands, read without the digits: too
 * early (white), its Good before the time (yellow), its Excellent (green: a
 * chime as it begins), past it (red: a buzz).
 */
const ZONE_COLORS = [new Color('#F2F2EE'), new Color('#F2C230'), new Color('#4FD06A'), new Color('#E5533D')];
const ZONE_GLOW = [0, 0.35, 0.45, 0.45];
/** Seconds a time's grade stays on the timer. */
const NOTE_SECONDS = 5;
/** A pinch this close to a kitchen timer skips the shop's time ahead. */
const TIMER_REACH = 0.09;
/** The skip lands this far (a share of the target) inside the Good, so it is a Good to the last digit. */
const SKIP_INSIDE = 0.002;
/** Minutes before a fish's time when the master calls the chef over to be ready. */
const CURE_READY_MINUTES = 6;
/** A pinch this close takes salt, the salter's rim (generous: the pinch point moves as the fingers close). */
const TAKE = 0.1;
/** The tap's water falls here (world): over the basin's front, in front of the wash board's spout. */
const TAP = new Vector3(SINK_BASIN_X, SINK_TOP + 0.21, BACK_ROW_Z + SINK_FRONT_RIM + 0.08);
const UNDER_TAP = 0.13;
/** A salt cell counts as white from this much salt (its alpha). */
const WHITE = 0.5;
/** The pinch point's recent places kept, and how far back the salt's fall is read. */
const HISTORY = 24;
const LOOKBACK = 0.15;
/** The basket stands on the drainboard's ribs, this high. */
const RIB = 0.005;
/** Half round about Y. */
const HALF_TURN = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
/** An opened kohada's length (its origin at the cut head end), at the day's size. */
const KOHADA_OPEN = 0.086;

/**
 * The full difficulty's curing (締め), the owner's shop, on the drainboard
 * beside the sink: things are used a stage at a time and put away (a sushi
 * bar's small space).
 *  - Kohada: the round bamboo basket (平ざる) salted, the opened kohada laid
 *    on it skin up in a row, overlapping, salted over (both sides); about 40
 *    minutes (five more or less with the day's size: the fish shop says it).
 *    Then into the bowl of water in the sink to take the salt off; the
 *    basket rinsed under the tap meanwhile; the kohada back on it in a row,
 *    overlapping, to drain; then into the vinegar, 20 minutes. The water and
 *    the drain are steps of the work, not times (the owner): each goes on
 *    as soon as the chef moves them.
 *  - Saba: the fillets in the stainless tray, salted till white; 2-3 hours
 *    (the owner keeps it in the fridge: to come with the fridge); the tray
 *    rinsed under the tap; into the vinegar, 30 minutes.
 *  - One enamel container of vinegar (kept for vinegar), the kohada first,
 *    then the saba. Out of it (a pinch over it) and let go over the case.
 * Salt: a pinch from the bowl, the fingers opened over the bare part; till
 * fairly white. The shop's time runs as it does in a shop, shown on two
 * kitchen timers on the dish cabinet's side (the time left, then the time
 * over; the body yellow in the Good before the time, green in the
 * Excellent, red past it); a pinch on a timer skips ahead: to 20 seconds
 * before the Excellent of a long time (the salt), to where the Good begins
 * of a short one. Each time is graded as the fish come out, by how far off its
 * target it was (the design memo of 2026-11-10: early is under-cured, late
 * is salty or firm); the grade shows on the timer and is kept for the
 * result. No time costs pieces.
 */
export class CureSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private batches: Batch[] = [];
  private bowl: Group | null = null;
  private water: Group | null = null;
  private readonly waterHome = new Vector3(WATER_BOWL_X, WASH_BOARD_TOP, WASH_BOARD_Z);
  private pot: Group | null = null;
  private readonly potHome = new Vector3(VINEGAR_POT_X, SINK_TOP, VINEGAR_POT_Z);
  private potBy: FishId | null = null;
  private stream: Object3D | null = null;
  private built = false;
  private readonly saltIn: [boolean, boolean] = [false, false];
  private trayHand: { side: Side; b: Batch; offset: Vector3 } | null = null;
  private fishHand: { side: Side; b: Batch; from: From } | null = null;
  private holder!: Group;
  private readonly caseItems = new Map<NetaId, Object3D>();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly box = new Box3();
  private readonly partBox = new Box3();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private time = 0;
  private readonly histHead = [0, 0];
  private readonly histTime = [new Float64Array(HISTORY), new Float64Array(HISTORY)];
  private readonly histAt = [Array.from({ length: HISTORY }, () => new Vector3()), Array.from({ length: HISTORY }, () => new Vector3())];

  init(): void {
    this.holder = this.world.createTransformEntity().object3D as Group;
    this.holder.name = 'CureHeld';
    this.cleanupFuncs.push(this.queries.items.subscribe('qualify', (e) => this.seeItem(e.getValue(CaseItem, 'neta') as NetaId, e.object3D)));
    for (const e of this.queries.items.entities) this.seeItem(e.getValue(CaseItem, 'neta') as NetaId, e.object3D);
    cureApi.lay = (id, parts, at) => this.lay(id, parts, at);
    cureApi.trayAt = (id, out) => {
      const b = this.batches.find((x) => x.id === id);
      if (!b) return false;
      out.copy(b.home).add(this.tmp.set(0, 0.02, 0));
      return true;
    };
    debugLines.push(() =>
      this.built && prep.active
        ? `Cure: ${this.batches
            .map((b) => `${b.id} ${b.state}${this.sheetWanted(b) ? ` ${Math.round(this.cover(b) * 100)}%` : ` ${Math.floor(b.minutes)}min`}${b.clean ? ' clean' : ''}`)
            .join(' | ')} | pot ${this.potBy ?? '-'} | next ${cure.next ?? '-'} ${cure.tray}`
        : '',
    );
  }

  private seeItem(neta: NetaId, object: Object3D | null | undefined): void {
    if (object) this.caseItems.set(neta, object);
  }

  /** The drainboard's things come out with the delivery, when kohada or saba were ordered. */
  private build(): void {
    this.built = true;
    const today = todaysMaterials();
    if (!today.includes('Kohada') && !today.includes('Saba')) return;
    const make = (id: FishId, salter: Group, x: number, z: number, W: number, D: number, timerY: number): Batch => {
      salter.position.set(x, SINK_TOP + (id === 'Kohada' ? RIB : 0), z);
      salter.visible = today.includes(id);
      this.world.createTransformEntity(salter);
      const timer = createKitchenTimer();
      timer.position.set(TIMER_X - 0.002, timerY, TIMER_Z);
      timer.rotation.y = -Math.PI / 2;
      timer.visible = today.includes(id);
      this.world.createTransformEntity(timer);
      timer.updateMatrixWorld(true);
      const timerText = makeTextSprite(' ', { width: 0.11 });
      timerText.position.copy(timer.localToWorld(TIMER_FACE.clone().add(this.tmp.set(0, 0, 0.008))));
      timerText.visible = false;
      this.world.createTransformEntity(timerText);
      return {
        id, neta: id === 'Kohada' ? 'Kohada' : 'CuredMackerel', salter, home: salter.position.clone(), W, D,
        bed: (salter.getObjectByName('SaltBed') as Mesh | undefined) ?? null, top: salter.getObjectByName('Salt') as Mesh,
        parts: [], saved: { salt: [], water: [], pot: [] }, state: 'empty', minutes: 0, rinse: 0, clean: false, saltAt: salter.position.clone(),
        coming: today.includes(id), timer, timerText, timerKey: NaN, taken: 0, note: '', noteTime: 0,
        face: (timer.getObjectByName('TimerBody') as Mesh).material as MeshStandardMaterial, zone: 0,
      };
    };
    cure.grades.length = 0;
    this.batches = [
      make('Kohada', createZaru(KOHADA_ZARU_D), KOHADA_ZARU_X, KOHADA_ZARU_Z, KOHADA_ZARU_D, KOHADA_ZARU_D, TIMER_Y[0]),
      make('Saba', createTray(SABA_TRAY_W, SABA_TRAY_D), SABA_TRAY_X, SABA_TRAY_Z, SABA_TRAY_W, SABA_TRAY_D, TIMER_Y[1]),
    ];
    const kohada = this.batches[0];
    if (kohada.bed) this.nextSaltSpot(kohada, kohada.bed);
    this.bowl = createSaltBowl();
    this.bowl.position.set(SALT_BOWL_X, SINK_TOP, SALT_BOWL_Z);
    this.world.createTransformEntity(this.bowl);
    this.pot = createVinegarPot(VINEGAR_POT_W, VINEGAR_POT_D, 0.055);
    this.pot.position.copy(this.potHome);
    this.world.createTransformEntity(this.pot);
    this.water = createWaterBowl(WATER_BOWL_R);
    this.water.position.copy(this.waterHome);
    this.water.visible = false;
    this.world.createTransformEntity(this.water);
    this.stream = createWaterStream(TAP.y - SINK_TOP - 0.02);
    this.stream.position.copy(TAP);
    this.stream.visible = false;
    this.world.createTransformEntity(this.stream);
    console.log(`[Cure] the drainboard is set: ${this.batches.filter((b) => b.coming).map((b) => b.id.toLowerCase()).join(' and ')}`);
  }

  // ---- laying out ------------------------------------------------------------------

  /** Into its salter: the kohada on the salted basket in a row, skin up; the saba fillets in the tray, turned head left. */
  private lay(id: PrepId, parts: Object3D[], at: Vector3): boolean {
    const b = this.batches.find((x) => x.id === id);
    if (!b || !this.near(b.home, b.W, b.D, at, 0.06, 0.35)) return false;
    if (b.id === 'Kohada' && b.state === 'empty') {
      feedback.flash(StationKind.Sink, COLOR_WARN);
      playWarn();
      console.log('[Cure] salt the basket first, then lay the kohada on it');
      return false;
    }
    if (b.state !== (b.id === 'Kohada' ? 'bedded' : 'empty')) return false;
    b.parts = parts;
    // The kohada in a row, overlapping, skin up (as the owner lays them, opened or draining); the saba turned head left.
    b.saved.salt = b.id === 'Kohada' ? this.rows(b.salter, parts, [0], -0.06, 0.017, 0.0035) : this.settle(b.salter, parts, b.W, b.D, true);
    this.box.makeEmpty();
    for (const p of parts) this.box.expandByObject(p, true);
    b.top.position.y = this.box.max.y - b.home.y + 0.0015;
    b.state = 'laid';
    this.nextSaltSpot(b, b.top);
    playPut();
    feedback.flash(StationKind.Sink, COLOR_DONE);
    coach.done('layCure');
    console.log(`[Cure] the ${id.toLowerCase()} are laid: salt them over till they are white`);
    return true;
  }

  /** One opened kohada into a container (its local place): its cut head end at (x, z), its length toward `yaw`, skin up. */
  private placeKohada(into: Group, p: Object3D, x: number, y: number, z: number, yaw: number): Place {
    into.add(p);
    p.visible = true;
    p.position.set(x, y + OPEN_THICKNESS, z);
    p.quaternion.setFromEuler(this.euler.set(Math.PI, yaw, 0, 'YXZ'));
    p.scale.set(kohadaScale(), 1, kohadaScale());
    return { p: p.position.clone(), q: p.quaternion.clone() };
  }

  /** In rows, overlapping, head left (on the basket to drain, in the vinegar), skin up; one row per entry of `cols` (its middle's X). */
  private rows(into: Group, parts: Object3D[], cols: readonly number[], z0: number, step: number, floor: number): Place[] {
    const per = Math.ceil(parts.length / cols.length);
    const half = (KOHADA_OPEN * kohadaScale()) / 2;
    return parts.map((p, i) => {
      const k = i % per;
      // Head left facing the drainboard (the chef faces +Z there: left is +X), the length toward -X.
      return this.placeKohada(into, p, cols[Math.floor(i / per)] + half, floor + k * 0.0011, z0 + k * step, Math.PI);
    });
  }

  /** In the bowl of water: a loose pile, under the water. */
  private pile(into: Group, parts: Object3D[]): Place[] {
    const half = (KOHADA_OPEN * kohadaScale()) / 2;
    return parts.map((p, i) => this.placeKohada(into, p, half + (((i * 37) % 5) - 2) * 0.004, 0.006 + i * 0.0035, -0.02 + (i % 4) * 0.013, Math.PI));
  }

  /**
   * Parts into a container (unturned, its origin at its floor's middle):
   * their centres drawn in about its middle until they fit (each part keeps
   * its size), the lowest resting on the floor; turned half round about the
   * set's middle when `turn` (the chef faces the drainboard the other way
   * from the board). Returns their container-local places.
   */
  private settle(into: Group, parts: Object3D[], W: number, D: number, turn = false): Place[] {
    into.updateMatrixWorld(true);
    this.box.makeEmpty();
    let extX = 0;
    let extZ = 0;
    const centres = parts.map((p) => {
      p.visible = true;
      p.updateMatrixWorld(true);
      this.partBox.setFromObject(p, true);
      this.box.union(this.partBox);
      const size = this.partBox.getSize(this.tmp);
      extX = Math.max(extX, size.x);
      extZ = Math.max(extZ, size.z);
      return this.partBox.getCenter(new Vector3());
    });
    const centre = this.box.getCenter(new Vector3());
    const size = this.box.getSize(new Vector3());
    const fit = (room: number, all: number, one: number): number => (all - one < 1e-4 ? 1 : Math.min(1, Math.max(0, room - one) / (all - one)));
    const fx = fit(W - 0.012, size.x, extX);
    const fz = fit(D - 0.012, size.z, extZ);
    const origin = into.getWorldPosition(new Vector3());
    const floor = this.box.min.y;
    const dir = turn ? -1 : 1;
    return parts.map((p, i) => {
      const c = centres[i];
      into.attach(p);
      // The container is neither turned nor scaled: a world shift is a local one.
      if (turn) {
        p.position.x = 2 * (c.x - origin.x) - p.position.x;
        p.position.z = 2 * (c.z - origin.z) - p.position.z;
        p.quaternion.premultiply(HALF_TURN);
      }
      p.position.x += origin.x + dir * (c.x - centre.x) * fx - c.x;
      p.position.z += origin.z + dir * (c.z - centre.z) * fz - c.z;
      p.position.y += origin.y + 0.0016 - floor;
      return { p: p.position.clone(), q: p.quaternion.clone() };
    });
  }

  // ---- each frame --------------------------------------------------------------------

  update(delta: number): void {
    if (!prep.active) {
      if (this.built) this.clearAway();
      this.publish();
      return;
    }
    if (!this.built) {
      if (prep.delivered) this.build();
      this.publish();
      return;
    }
    if (!this.batches.length) {
      this.publish();
      return;
    }
    const minutes = delta / CURE_MINUTE_SECONDS;
    for (const b of this.batches) {
      if (b.state === 'salted' || b.state === 'vinegar') b.minutes += minutes;
      b.noteTime = Math.max(0, b.noteTime - delta);
    }
    if (cure.skip) {
      this.skip(cure.skip);
      cure.skip = null;
    }
    // The bowl of water stands in the sink from the kohada's salting till they come out of it.
    const kohada = this.batches.find((b) => b.id === 'Kohada');
    if (this.water) this.water.visible = !!kohada && (kohada.state === 'salted' || kohada.state === 'soaked' || this.fishHand?.from === 'water');
    this.time += delta;
    for (const side of [0, 1] as const) this.remember(side);
    for (const side of [0, 1] as const) this.updateHand(side);
    this.updateTray(delta);
    this.updateFish();
    for (const b of this.batches) this.updateTimer(b);
    this.publish();
  }

  /** A pinch starting: salt from the bowl, the salter's rim, the fish (on to their next place). A pinch ending: salt sprinkled. */
  private updateHand(side: Side): void {
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    const at = hand.grasp;
    if (hand.pinchEnd && this.saltIn[side]) {
      this.saltIn[side] = false;
      // The salt leaves the fingers where they were as they began to open (the pinch point moves as they do).
      const from = this.before(side);
      for (const b of this.batches) {
        const sheet = this.sheetWanted(b);
        if (sheet && this.near(b.home, b.W, b.D, from, 0.02, 0.3)) {
          this.sprinkle(b, sheet, from);
          break;
        }
      }
      return;
    }
    if (!hand.pinchStart || chef.hands[side].holding !== Held.None || !chef.facingBack) return;
    for (const b of this.batches) {
      if (!b.timer.visible || at.distanceTo(b.timer.position) >= TIMER_REACH) continue;
      if (this.skip('good')) playPress();
      else playWarn();
      return;
    }
    if (this.bowl && this.batches.some((b) => this.sheetWanted(b)) && at.distanceTo(this.tmp.copy(this.bowl.position).add(this.tmp2.set(0, 0.03, 0))) < TAKE) {
      this.saltIn[side] = true;
      playPick();
      return;
    }
    if (!this.trayHand) {
      for (const b of this.batches) {
        if (!this.rinseWanted(b) || at.distanceTo(this.rim(b, this.tmp)) >= TAKE) continue;
        this.trayHand = { side, b, offset: b.salter.position.clone().sub(at) };
        chef.hands[side].holding = Held.Saku;
        playPick();
        return;
      }
    }
    if (this.fishHand) return;
    for (const b of this.batches) {
      let from: From | null = null;
      if ((b.state === 'salted' && b.id === 'Kohada') || b.state === 'draining' || b.state === 'rinsed') from = this.near(b.home, b.W, b.D, at, 0.02, 0.1) ? 'salt' : null;
      else if (b.state === 'soaked' && this.water) from = this.near(this.waterHome, 2 * WATER_BOWL_R, 2 * WATER_BOWL_R, at, 0.02, 0.12) ? 'water' : null;
      else if (b.state === 'vinegar' && this.potBy === b.id) from = this.near(this.potHome, VINEGAR_POT_W, VINEGAR_POT_D, at, 0.02, 0.12) ? 'pot' : null;
      if (from) return this.takeUp(side, b, from);
    }
  }

  /** Each hand's pinch point over the last moments (a ring of times and places). */
  private remember(side: Side): void {
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    const i = (this.histHead[side] = (this.histHead[side] + 1) % HISTORY);
    this.histTime[side][i] = this.time;
    this.histAt[side][i].copy(hand.grasp);
  }

  /** Where this hand's pinch point was a moment ago (scratch vector). */
  private before(side: Side): Vector3 {
    const want = this.time - LOOKBACK;
    let best = this.histHead[side];
    for (let k = 0; k < HISTORY; k++) {
      const i = (this.histHead[side] - k + HISTORY) % HISTORY;
      if (this.histTime[side][i] === 0) break;
      best = i;
      if (this.histTime[side][i] <= want) break;
    }
    return this.tmp.copy(this.histAt[side][best]);
  }

  /** Which salt a fish wants now: the kohada's basket before they are laid, then over the fish. */
  private sheetWanted(b: Batch): Mesh | null {
    if (b.id === 'Kohada' && b.state === 'empty' && b.coming && b.bed) return b.bed;
    return b.state === 'laid' ? b.top : null;
  }

  /** The salter is to go under the tap: the saba's tray with its fish salted; the kohada's basket once its fish are in the water. */
  private rinseWanted(b: Batch): boolean {
    if (b.id === 'Saba') return b.state === 'salted';
    return b.state === 'soaked' && !b.clean;
  }

  /** Over a container's floor (within its sides and `margin`, up to `high` above it). */
  private near(home: Vector3, W: number, D: number, at: Vector3, margin: number, high: number): boolean {
    return Math.abs(at.x - home.x) < W / 2 + margin && Math.abs(at.z - home.z) < D / 2 + margin && at.y > home.y - 0.02 && at.y < home.y + high;
  }

  private rim(b: Batch, out: Vector3): Vector3 {
    return out.copy(b.salter.position).add(this.tmp2.set(0, 0.022, b.D / 2));
  }

  /** The share of the wanted salt that is white. */
  private cover(b: Batch): number {
    const sheet = this.sheetWanted(b);
    if (!sheet) return 1;
    const color = sheet.geometry.attributes.color;
    const mask = sheet.userData.mask as Uint8Array;
    let white = 0;
    let all = 0;
    for (let i = 0; i < color.count; i++) {
      if (!mask[i]) continue;
      all++;
      if (color.getW(i) >= WHITE) white++;
    }
    return white / Math.max(1, all);
  }

  /** Salt falls where the fingers open: the cells under them whiten (most at the middle). White enough all over, that side is salted. */
  private sprinkle(b: Batch, sheet: Mesh, at: Vector3): void {
    const pos = sheet.geometry.attributes.position;
    const color = sheet.geometry.attributes.color;
    const mask = sheet.userData.mask as Uint8Array;
    const lx = at.x - b.salter.position.x;
    const lz = at.z - b.salter.position.z;
    for (let i = 0; i < pos.count; i++) {
      if (!mask[i]) continue;
      const d = Math.hypot(pos.getX(i) - lx, pos.getZ(i) - lz);
      if (d < SALT_RADIUS) color.setW(i, Math.min(1, color.getW(i) + SALT_PER_PINCH * (1 - (d / SALT_RADIUS) ** 2)));
    }
    color.needsUpdate = true;
    playPut();
    if (this.cover(b) < SALT_COVER) {
      this.nextSaltSpot(b, sheet);
      return;
    }
    coach.done('saltCure');
    if (b.state === 'empty') {
      b.state = 'bedded';
      console.log('[Cure] the basket is salted: lay the kohada on it');
      return;
    }
    b.state = 'salted';
    b.minutes = 0;
    console.log(`[Cure] the ${b.id.toLowerCase()} are salted (${this.saltWords(b)})`);
  }

  /** Where a pinch would whiten the most still-bare salt (for practice mode and the master's pointer). */
  private nextSaltSpot(b: Batch, sheet: Mesh): void {
    const pos = sheet.geometry.attributes.position;
    const color = sheet.geometry.attributes.color;
    const mask = sheet.userData.mask as Uint8Array;
    let best = 0;
    let bestScore = -1;
    for (let i = 0; i < pos.count; i += 2) {
      if (!mask[i]) continue;
      let score = 0;
      for (let j = 0; j < pos.count; j++) {
        if (!mask[j]) continue;
        const d = Math.hypot(pos.getX(i) - pos.getX(j), pos.getZ(i) - pos.getZ(j));
        if (d < SALT_RADIUS) score += (1 - Math.min(1, color.getW(j) / WHITE)) * (1 - (d / SALT_RADIUS) ** 2);
      }
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    b.saltAt.set(pos.getX(best), sheet.position.y, pos.getZ(best)).add(b.salter.position);
  }

  /** The salter in a hand: it follows; held under the tap long enough, its salt is washed off; let go, it goes back. */
  private updateTray(delta: number): void {
    const h = this.trayHand;
    if (this.stream) this.stream.visible = false;
    if (!h) return;
    const hand = hands.all[h.side];
    const b = h.b;
    // Let go only when the fingers open (a hand lost for a moment, in a turn's blink, keeps hold).
    if (!hand?.tracked) return;
    if (hand.pinchEnd) {
      b.salter.position.copy(b.home);
      this.trayHand = null;
      chef.hands[h.side].holding = Held.None;
      playPut();
      return;
    }
    b.salter.position.copy(hand.grasp).add(h.offset);
    const under = Math.hypot(b.salter.position.x - TAP.x, b.salter.position.z - TAP.z) < UNDER_TAP && b.salter.position.y < TAP.y;
    if (!under || !this.rinseWanted(b)) return;
    if (this.stream) this.stream.visible = true;
    b.rinse += delta;
    const fade = Math.max(0, 1 - b.rinse / CURE_RINSE_SECONDS);
    for (const sheet of [b.top, b.bed]) if (sheet) (sheet.material as unknown as { opacity: number }).opacity = fade;
    if (b.rinse < CURE_RINSE_SECONDS) return;
    b.rinse = 0;
    for (const sheet of [b.top, b.bed]) if (sheet) sheet.visible = false;
    playDone();
    coach.done('rinseCure');
    if (b.id === 'Kohada') {
      b.clean = true;
      console.log('[Cure] the basket is rinsed clean');
      return;
    }
    this.judge(b, 'salt', b.minutes, this.saltAim(b));
    b.state = 'rinsed';
    b.minutes = 0;
  }

  /** The fish come up in the hand, all together. */
  private takeUp(side: Side, b: Batch, from: From): void {
    const hand = hands.all[side];
    if (from === 'pot') b.taken = b.minutes;
    this.holder.position.copy(hand.grasp);
    this.holder.updateMatrixWorld(true);
    for (const p of b.parts) this.holder.attach(p);
    this.fishHand = { side, b, from };
    chef.hands[side].holding = Held.Saku;
    playPick();
  }

  /** The fish in a hand follow it; let go where they go next they are laid there, elsewhere they go back. */
  private updateFish(): void {
    const h = this.fishHand;
    if (!h) return;
    const hand = hands.all[h.side];
    const b = h.b;
    if (!hand?.tracked) return;
    if (!hand.pinchEnd) {
      this.holder.position.copy(hand.grasp);
      return;
    }
    this.fishHand = null;
    chef.hands[h.side].holding = Held.None;
    const g = hand.grasp;
    if (h.from === 'salt' && b.state === 'salted' && this.water && this.near(this.waterHome, 2 * WATER_BOWL_R, 2 * WATER_BOWL_R, g, 0.06, 0.35)) {
      b.saved.water = this.pile(this.water, b.parts);
      this.judge(b, 'salt', b.minutes, this.saltAim(b));
      b.state = 'soaked';
      b.minutes = 0;
      playPut();
      coach.done('vinegarCure');
      console.log('[Cure] the kohada are in the water: the salt comes off (rinse the basket, then onto it to drain)');
      return;
    }
    if (h.from === 'water' && this.near(b.home, b.W, b.D, g, 0.06, 0.35)) {
      if (!b.clean) {
        playWarn();
        console.log('[Cure] rinse the salt off the basket first');
      } else {
        b.saved.salt = this.rows(b.salter, b.parts, [0], -0.06, 0.017, 0.0035);
        b.state = 'draining';
        b.minutes = 0;
        if (this.water) this.water.visible = false;
        playPut();
        coach.done('vinegarCure');
        console.log('[Cure] the kohada drain on the basket, in a row');
        return;
      }
    }
    if (h.from === 'salt' && (b.state === 'draining' || b.state === 'rinsed') && this.near(this.potHome, VINEGAR_POT_W, VINEGAR_POT_D, g, 0.06, 0.35)) {
      if (this.potBy) {
        playWarn();
        console.log(`[Cure] the vinegar has the ${this.potBy.toLowerCase()} in it: after them`);
      } else {
        this.intoVinegar(b);
        return;
      }
    }
    if (h.from === 'pot' && overStation(g, StationKind.NetaCase)) {
      this.stock(b);
      return;
    }
    // Back where they came from.
    const into = h.from === 'salt' ? b.salter : h.from === 'water' ? this.water! : this.pot!;
    b.parts.forEach((p, i) => {
      into.add(p);
      const s = b.saved[h.from][i];
      p.position.copy(s.p);
      p.quaternion.copy(s.q);
    });
    playPut();
  }

  private intoVinegar(b: Batch): void {
    const pot = this.pot!;
    b.saved.pot = b.id === 'Kohada' ? this.rows(pot, b.parts, [-0.06, 0.06], -0.04, 0.025, 0.0018) : this.settle(pot, b.parts, VINEGAR_POT_W, VINEGAR_POT_D);
    b.state = 'vinegar';
    b.minutes = 0;
    this.potBy = b.id;
    // The basket or tray is done with: put away.
    b.salter.visible = false;
    playPut();
    coach.done('vinegarCure');
    console.log(`[Cure] the ${b.id.toLowerCase()} are in the vinegar (${VINEGAR_MINUTES} min)`);
  }

  private stock(b: Batch): void {
    for (const p of b.parts) p.visible = false;
    this.judge(b, 'vinegar', b.taken, VINEGAR_MINUTES);
    b.state = 'done';
    this.potBy = null;
    const stock = Math.round(NETA[b.neta].stock * fractionOf(b.id));
    prepApi.stock(b.neta, stock);
    feedback.flash(StationKind.NetaCase, COLOR_DONE);
    playDone();
    coach.done('cureOut');
    console.log(`[Cure] the ${b.id.toLowerCase()} are in the case (${stock})`);
    prepApi.taskDone(b.id);
  }

  // ---- times ---------------------------------------------------------------------------

  private saltAim(b: Batch): number {
    return b.id === 'Kohada' ? KOHADA_SALT_MINUTES : SABA_SALT_MINUTES;
  }

  /** The present stage's target time (0: no timer running). */
  private aim(b: Batch): number {
    switch (b.state) {
      case 'salted':
        return this.saltAim(b);
      case 'vinegar':
        return VINEGAR_MINUTES;
      default:
        return 0;
    }
  }

  private saltWords(b: Batch): string {
    return `${b.id.toLowerCase()}: ${this.saltAim(b)} min`;
  }

  /**
   * A time's grade as the fish come out: how far off the target, as a share
   * of it. Early, they are under-cured; late, salty (the salt) or firm (the
   * vinegar). Shown on the fish's timer for a moment and kept for the result.
   */
  private judge(b: Batch, stage: 'salt' | 'vinegar', minutes: number, aim: number): void {
    const off = (minutes - aim) / aim;
    const far = Math.abs(off);
    const grade = far <= TIME_EXCELLENT ? 'Excellent' : far <= TIME_GOOD ? 'Good' : far <= TIME_POOR ? 'Poor' : 'Bad';
    const fault = off < 0 ? 'under-cured' : stage === 'salt' ? 'too salty' : 'too firm';
    b.note = grade === 'Excellent' ? 'Excellent' : `${grade}: ${fault}`;
    b.noteTime = NOTE_SECONDS;
    b.timerKey = NaN;
    cure.grades.push({ fish: b.id, stage, grade, minutes, aim });
    feedback.flash(StationKind.Sink, grade === 'Excellent' || grade === 'Good' ? COLOR_DONE : COLOR_WARN);
    if (grade === 'Poor' || grade === 'Bad') playWarn();
    console.log(`[Cure] the ${b.id.toLowerCase()} out of the ${stage} at ${minutes.toFixed(1)} min of ${aim}: ${b.note}`);
  }

  /**
   * The shop's time skipped ahead for every running timer alike: to where
   * the nearest time's Good begins ('good', the timer's pinch: an Excellent
   * is a short wait from there), or to the time itself ('aim', practice
   * mode). Nothing to skip when a fish is at that point already.
   */
  private skip(to: 'good' | 'aim'): boolean {
    let ahead = Infinity;
    for (const b of this.batches) {
      const aim = this.aim(b);
      if (aim <= 0) continue;
      const point =
        to === 'aim' ? aim
        : aim >= SKIP_LONG_MINUTES ? aim * (1 - TIME_EXCELLENT) - SKIP_LEAD_SECONDS / CURE_MINUTE_SECONDS
        : aim * (1 - TIME_GOOD + SKIP_INSIDE);
      ahead = Math.min(ahead, point - b.minutes);
    }
    if (ahead === Infinity || ahead <= 0) return false;
    for (const b of this.batches) if (this.aim(b) > 0) b.minutes += ahead;
    console.log(`[Cure] the time skipped ahead ${ahead.toFixed(1)} min`);
    return true;
  }

  /** Each fish's kitchen timer: the time left of the stage's target, a beep at zero, then the time over; a grade for a moment after it. */
  private updateTimer(b: Batch): void {
    const aim = this.aim(b);
    const off = aim > 0 ? (b.minutes - aim) / aim : -1;
    const zone = off < -TIME_GOOD ? 0 : off < -TIME_EXCELLENT ? 1 : off <= TIME_EXCELLENT ? 2 : 3;
    if (zone !== b.zone) {
      b.zone = zone;
      b.face.color.copy(ZONE_COLORS[zone]);
      b.face.emissive.copy(ZONE_COLORS[zone]);
      b.face.emissiveIntensity = ZONE_GLOW[zone];
      if (zone === 2) playDone();
      else if (zone === 3) playWarn();
    }
    let key: number;
    if (b.noteTime > 0) key = NOTE_KEY;
    else if (aim > 0) {
      const left = Math.ceil((aim - b.minutes) * 60);
      key = left <= 0 && Math.floor(performance.now() / 400) % 2 === 0 ? BLINK_KEY : left;
    } else key = b.coming && b.state !== 'done' ? IDLE_KEY : OFF_KEY;
    if (b.state === 'done' && b.noteTime <= 0) b.timer.visible = false;
    if (key === b.timerKey) return;
    b.timerKey = key;
    b.timerText.visible = key !== OFF_KEY;
    if (key === OFF_KEY) return;
    const name = b.id === 'Kohada' ? 'Kohada' : 'Saba';
    const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    setSpriteText(
      b.timerText,
      key === NOTE_KEY ? b.note : key === BLINK_KEY ? `${name}   :  ` : key === IDLE_KEY ? `${name} --:--` : key > 0 ? `${name} ${clock(key)}` : `${name} +${clock(-key)}`,
    );
  }

  // ---- what the others see ---------------------------------------------------------------

  /** What the drainboard wants next, for the master and practice mode. */
  private publish(): void {
    cure.saltHeld = this.saltIn[0] || this.saltIn[1];
    cure.trayHeld = !!this.trayHand;
    cure.fishHeld = !!this.fishHand;
    let next: CureNext | null = null;
    let b: Batch | undefined;
    if (this.fishHand) {
      b = this.fishHand.b;
      next = this.fishHand.from === 'pot' ? 'case' : 'move';
    } else if (this.trayHand) {
      b = this.trayHand.b;
      next = this.rinseWanted(b) ? 'rinse' : 'back';
    } else if (cure.saltHeld) {
      b = this.batches.find((x) => this.sheetWanted(x));
      next = b?.state === 'empty' ? 'bed' : 'salt';
    } else {
      for (const id of FISH) {
        const x = this.batches.find((y) => y.id === id);
        if (!x) continue;
        const n = this.wants(x);
        if (n && (!next || this.rank(n) > this.rank(next))) {
          next = n;
          b = x;
        }
      }
    }
    cure.next = next;
    cure.tray = b?.id ?? '';
    cure.wanted = !!next && next !== 'wait' && next !== 'case';
    cure.left = b ? Math.max(0, Math.ceil(this.aim(b) - b.minutes)) : 0;
    cure.say = '';
    if (this.bowl) cure.bowlAt.copy(this.bowl.position).add(this.tmp.set(0, 0.03, 0));
    cure.potAt.copy(this.potHome).add(this.tmp.set(0, 0.03, 0));
    cure.tapAt.copy(TAP).add(this.tmp.set(0, -0.12, 0));
    if (!b) return;
    b.salter.getWorldPosition(cure.trayAt);
    cure.trayAt.y += 0.02;
    this.rim(b, cure.rimAt);
    cure.saltAt.copy(b.saltAt);
    // Where the fish are, and where they go next.
    const waterAt = this.tmp2.copy(this.waterHome).add(this.tmp.set(0, 0.03, 0));
    const inWater = b.state === 'soaked';
    if (inWater) cure.fishAt.copy(waterAt);
    else if (b.state === 'vinegar') cure.fishAt.copy(cure.potAt);
    else cure.fishAt.copy(cure.trayAt);
    if (b.state === 'salted' && b.id === 'Kohada') cure.dropAt.copy(waterAt);
    else if (inWater) cure.dropAt.copy(cure.trayAt);
    else cure.dropAt.copy(cure.potAt);
    const item = this.caseItems.get(b.neta);
    if (item) item.getWorldPosition(cure.caseAt);
    const name = b.id === 'Kohada' ? 'kohada' : 'saba';
    const stage = b.state === 'salted' ? 'salt' : 'vinegar';
    const move =
      b.state === 'salted' ? `The kohada have had their salt (${this.saltWords(b)}): into the bowl of water in the sink`
      : inWater ? 'The salt is off in the water: the kohada onto the clean basket, in a row, to drain'
      : `Into the vinegar: the ${name} into the enamel container`;
    cure.say =
      next === 'bed' ? 'The basket first: salt it (a pinch from the bowl, opened over the bare parts)'
      : next === 'salt' ? `Salt the ${name} over till they are fairly white: pinches from the bowl, over the bare parts`
      : next === 'rinse' ? (b.id === 'Kohada' ? 'Rinse the salt off the basket under the tap' : `The saba have had their salt (${this.saltWords(b)}): rinse it off under the tap`)
      : next === 'back' ? 'Put it back'
      : next === 'move' ? move
      : next === 'out' ? `The ${name} are done: out of the vinegar, into the case`
      : next === 'case' ? 'Into the case'
      : next === 'soon' ? `Get ready: the ${name} come off the ${stage} in about ${cure.left} min`
      : `The ${name}: about ${cure.left} min more (pinch a timer to skip ahead)`;
  }

  /** What one fish wants of the chef now. */
  private wants(b: Batch): CureNext | null {
    switch (b.state) {
      case 'empty':
        // The basket is salted just before the opened kohada come to it.
        return b.id === 'Kohada' && b.coming && prep.next === 'stock' && prep.stockTo === 'cure' && prep.onBoard === 'Kohada' ? 'bed' : null;
      case 'laid':
        return 'salt';
      case 'salted':
        return this.timed(b.minutes, this.saltAim(b), b.id === 'Kohada' ? 'move' : 'rinse');
      case 'soaked':
        return b.clean ? 'move' : 'rinse';
      case 'draining':
        return this.potBy ? 'wait' : 'move';
      case 'rinsed':
        return this.potBy ? 'wait' : 'move';
      case 'vinegar':
        return this.timed(b.minutes, VINEGAR_MINUTES, 'out');
      default:
        return null;
    }
  }

  /** Its time: due (the action), close (get ready at the drainboard: a few minutes before), or not yet. */
  private timed(minutes: number, aim: number, due: CureNext): CureNext {
    return minutes >= aim ? due : minutes >= aim - CURE_READY_MINUTES ? 'soon' : 'wait';
  }

  /** Which of two fish's wants comes first: one due, then one close, then waiting. */
  private rank(n: CureNext): number {
    return n === 'wait' ? 0 : n === 'soon' ? 1 : 2;
  }

  /** The bar opens: the drainboard is cleared. */
  private clearAway(): void {
    for (const b of this.batches) {
      b.salter.visible = false;
      b.timer.visible = false;
      b.timerText.visible = false;
      for (const p of b.parts) p.visible = false;
    }
    for (const o of [this.bowl, this.pot, this.water, this.stream]) if (o) o.visible = false;
    this.batches = [];
    // Kept from re-building: nothing is delivered after the opening.
    this.built = true;
  }
}
