import { Color, createSystem, Group, Matrix4, type Object3D, Quaternion, type Sprite, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { debugLines } from './debug.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { fractionOf, todaysMaterials } from './fish-order.js';
import { chef, prep, range, tamago, type TamagoNext } from './game-state.js';
import { sideSign } from './handedness.js';
import { hands, RubTracker } from './hands.js';
import { BACK_ROW_DEPTH, BACK_ROW_Z, BACK_WALL_Z, NET_HOOK_Y, NET_HOOK_Z, RANGE_HEIGHT, ROOM_END_X, SINK_SHELF_Y, SINK_TOP, SINK_UNIT_X, SINK_UNIT_Z, SINK_WIDTH, WALL_THICKNESS, WORKTABLE_WIDTH, WORKTABLE_X } from './layout.js';
import { NETA } from './menu.js';
import { prepApi, tamagoApi } from './prep-api.js';
import {
  createChopsticks,
  createEggPack,
  createSeasoningJar,
  createPestle,
  createSuribachi,
  createTamagoPan,
  createOilPot,
  createTamagoLid,
  EGG_BURNT,
  EGG_GOLD,
  EGG_HEIGHT,
  EGG_RAW,
  EGG_SET,
  type EggParts,
  LID_GRIP_Y,
  OIL_POT_TOP,
  PAN_GRIP,
  PAN_INNER,
  PESTLE_GRIP,
  SAIBASHI_GRIP,
  SURIBACHI_FLOOR,
  SURIBACHI_RIM,
  SURIBACHI_TOP,
  type SuribachiParts,
} from './scene-assets/lib/tamago-look.js';
import { playDone, playPick, playPress, playPut, playSizzle, playWarn } from './sfx.js';
import { overStation } from './station-system.js';
import { CaseItem, Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { PREP_STAGE, RUB_WIPE_BOARD, TAMAGO_BAKE_RATE, TAMAGO_BROWN_RATE, TAMAGO_COOL_SECONDS, TAMAGO_FLIP_SPEED, TAMAGO_GRIND_TRAVEL, TAMAGO_HEAT_RATE, TAMAGO_OIL_HEAT, TAMAGO_POUR_HEAT, TAMAGO_POUR_SECONDS, TAMAGO_SCORCHED, TAMAGO_SIDE_SECONDS, TAMAGO_TURN_READY, TAMAGO_WHISK_TRAVEL } from './tuning.js';
import { cupboardApi } from './cupboard-system.js';
import { display } from './display-settings.js';

type Side = 0 | 1;
/** The tamago: poured, its first side, tossed over, its other side, baked; the lid on it, pressed, turned out onto the lid, cooling there; in a hand, in the case. */
type Egg = 'none' | 'pouring' | 'first' | 'turning' | 'second' | 'done' | 'lidded' | 'pressed' | 'turningOut' | 'cooling' | 'held' | 'cased';
/** The batter in the suribachi: empty, the scallops in (grinding), ground, the eggs in (mixing), frothy, poured. */
type Mix = 'none' | 'scallop' | 'ground' | 'eggs' | 'mixed' | 'poured';

/** The suribachi's place: the work table's back corner on the sink's side, clear of the hangiri and the rice tub; the eggs beside it. */
const BOWL_HOME = new Vector3(WORKTABLE_X + 0.205, SINK_TOP, BACK_ROW_Z + 0.42);
const EGGS_HOME = new Vector3(WORKTABLE_X + 0.05, SINK_TOP, BACK_ROW_Z + 0.48);
/** The suribachi's place in the cupboard under the sink: its left half, on the shelf, toward the doors. */
const CUPBOARD_HOME = new Vector3(SINK_UNIT_X - SINK_WIDTH / 4, SINK_SHELF_Y, SINK_UNIT_Z - (BACK_ROW_DEPTH - 0.04) / 2 + 0.16);
const STICKS_PICK = 0.08;
const JAR_PICK = 0.09;
type Jar = 'Salt' | 'Sugar';
const JARS: readonly Jar[] = ['Salt', 'Sugar'];
const PACK_TAP = 0.08;
/** A pinch this close takes the pestle (by its grip), the bowl of eggs, the suribachi (by its front rim). */
const PESTLE_PICK = 0.08;
const RIM_PICK = 0.08;
/** The pestle's tip goes round the floor at most this far from the middle. */
const TIP_ROUND = 0.03;
/** A hand's move longer than this in one frame (the hand lost a moment) does not count as going round. */
const ROUND_STEP = 0.05;
const UP = new Vector3(0, 1, 0);
/** The batter: yolky as the eggs go in, paler as it froths. */
const BATTER_RAW = new Color('#E7B23A');
const BATTER_FROTHY = new Color('#F2CF6A');

/** The grates' top on the range (as src/range-system.ts has it), where the pan stands. */
const GRATE_Y = RANGE_HEIGHT + 0.043;
/** A pinch this close to the handle's grip takes it. */
const GRIP_PICK = 0.1;
/** The handle raised this far turns the tamago over (the board over the pan, turned, slid back). */
const TURN_LIFT = 0.06;
const TURN_SECONDS = 0.7;
const SIDES: readonly Side[] = [0, 1];
/**
 * The tamago cools on its lid here: the work table's front by the range, between the awasezu and the ohitsu, the
 * lid's back edge just clear of the hangiri's rim (r 0.17 at WORKTABLE_X - 0.145, BACK_ROW_Z + 0.345).
 */
const LID_COOL = new Vector3(WORKTABLE_X - 0.09, SINK_TOP, BACK_ROW_Z + 0.087);
/** A pinch this close takes the lid (by its bar), the oil pot (by its knob), the cooled tamago. */
const LID_PICK = 0.09;
const OIL_PICK = 0.09;
const EGG_PICK = 0.1;
/** The lid turning out with the tamago onto the work table. */
const OUT_SECONDS = 0.9;
/** The toss: how high the tamago flies as it turns over. */
const TOSS_HEIGHT = 0.16;
/** An open palm this far over the lid's bar presses it (having come down from above it). */
const PRESS_ABOVE = 0.035;
const PRESS_ARM = 0.06;
/** The pressed tamago, squared: a little lower. */
const PRESSED_SCALE = 0.95;
/** Upside down (the lid with the tamago on it, turned out). */
const FLIP_X = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);

/**
 * The full difficulty's tamago (厚焼き with scallop, the owner's shop). The
 * batter is made in the shop in the suribachi on the work table (the
 * owner): when tamago was ordered (the scallops and the eggs come in the ice
 * box):
 *  a. the cupboard under the sink: a pinch on its left door's handle slides
 *     it open; the suribachi (its pestle and chopsticks in it) by its rim,
 *     let go over the work table: it stands in its place there;
 *  b. the scallops and eggs from the ice box, let go over the suribachi: the
 *     scallops go in, the pack of eggs is set down beside it;
 *  c. the pestle by its grip, round and round till the scallops are a paste;
 *  d. a tap on the pack of eggs: the eggs go in (the cracking is skipped);
 *  e. the cooking chopsticks, round and round till the batter is frothy.
 * Then on the range; the square copper pan hangs on the end wall beside the
 * grill net, its wooden lid (木蓋) in it, a set:
 *  1. the pan by its handle, off its hook, onto a free burner;
 *  2. heated on a medium flame, then oiled (油返し): the oil pot from the
 *     food shelf (the oil is a seasoning), let go over the hot pan: the oil
 *     goes round it and the rest back into the pot;
 *  3. the suribachi by its front rim, let go over the pan: poured, with a
 *     sizzle when the pan is hot and oiled (cold or dry, the tamago sticks);
 *  4. a low flame (the knob, as for the pots): it bakes slowly, its face
 *     down browning (a higher flame bakes faster but scorches it);
 *  5. turned once when the first side is set, like fried rice: the
 *     chopsticks in one hand, the handle in the other flicked up: it flies
 *     over (tossed before it is set, it breaks);
 *  6. done, the flame off: the lid from its hook by its bar, laid on the
 *     tamago in the pan and pressed once with the palm (squared); the handle
 *     raised: pan and lid turn over together, the tamago out on the lid on
 *     the work table;
 *  7. a little while to cool there, then from the lid into the case;
 *  8. the pan wiped while hot with a sheet of kitchen paper (no soap on the
 *     copper) and hung back up, its lid with it.
 * Times are the master's guide, not a grade; a scorched face, a stuck or a
 * broken tamago costs a couple of pieces, as a scorched abalone does.
 */
export class TamagoSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private pan!: Group;
  private egg!: EggParts;
  private label!: Sprite;
  private labelText = '';
  /** A green "Ready" over the pan once it is hot enough (in the shop a drop from the chopsticks tells; here a sign). */
  private readySign!: Sprite;
  private holder!: Group;
  private readonly hookPos = new Vector3(-ROOM_END_X + WALL_THICKNESS / 2 + 0.006, NET_HOOK_Y - 0.06, NET_HOOK_Z + 0.22);
  /** On the hook: the open side to the room, the handle up. */
  private readonly hookQuat = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 0, -1), new Vector3(1, 0, 0), new Vector3(0, -1, 0)));
  private caseItem: Object3D | null = null;
  private active = false;
  private built = false;
  private cleared = false;
  /** Tamago is baked today (ordered; not taken by the cook). */
  private wanted = false;
  private onBurner = -1;
  private state: Egg = 'none';
  private progress = 0;
  /** How browned each face is (A: down first, B: down after the turn); 1 golden. */
  private readonly brown = [0, 0];
  private pourT = 0;
  private turnT = 0;
  private batter: Object3D | null = null;
  private suri!: SuribachiParts;
  private pestle!: Group;
  private eggPack!: Group;
  private sticks!: Group;
  /** The salt and sugar: a pinch and a teaspoon into the eggs before the mixing (the owner). The jars are carried from the food shelf (copies; the shelf's own hide meanwhile). */
  private readonly jars = {} as Record<Jar, Group>;
  private readonly shelfJars: Record<Jar, Object3D[]> = { Salt: [], Sugar: [] };
  private readonly jarHome: Record<Jar, Vector3> = { Salt: new Vector3(), Sugar: new Vector3() };
  private jarHand: Side | null = null;
  private jarHeld: Jar | null = null;
  private salted = false;
  private sugared = false;
  private mix: Mix = 'none';
  /** The suribachi is in the cupboard under the sink (not out on the work table). */
  private stored = true;
  /** How far the scallops are ground, and the batter mixed (1: a paste, frothy). */
  private ground = 0;
  private whisked = 0;
  private pestleHand: Side | null = null;
  private sticksHand: Side | null = null;
  private bowlHand: Side | null = null;
  private readonly bowlOffset = new Vector3();
  private readonly lastHand = new Vector3();
  private readonly tip = new Vector3();
  private readonly dir = new Vector3();
  private panHand: Side | null = null;
  private liftHand: { side: Side; fromY: number } | null = null;
  private eggHand: Side | null = null;
  /** The pan's wooden lid (a set with the pan): its hand, its place on the hook, where it turned out from, the tamago's turn on it. */
  private lid!: Group;
  private lidHand: Side | null = null;
  private readonly lidHook = new Vector3();
  private readonly outFrom = new Vector3();
  private readonly eggOnLid = new Quaternion();
  private readonly pressArmed = [false, false];
  private outT = 0;
  private coolT = 0;
  /** The oil: its pot (a copy carried from the shelf; the shelf's own hides meanwhile), its film in the pan, the pan's heat (0 cold .. 1 hot). */
  private oilPot!: Group;
  private shelfOil: Object3D[] = [];
  private readonly oilHome = new Vector3();
  private oilHand: Side | null = null;
  private oilFilm!: Object3D;
  private panHeat = 0;
  private oiled = false;
  /** Poured into a cold or dry pan (it stuck); tossed before the first side was set (it broke). */
  private stuck = false;
  private torn = false;
  /** The chopsticks in a hand at the range (for the toss); the handle's height a frame ago and its upward speed (the flick). */
  private flipSticksHand: Side | null = null;
  private lastLiftY = 0;
  private liftSpeed = 0;
  private toldSticks = false;
  /** The pan wiped with kitchen paper after the tamago is out. */
  private wiped = false;
  private readonly panRub = new RubTracker();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly aimAt = new Vector3();

  init(): void {
    this.active = PREP_STAGE >= 3;
    this.cleanupFuncs.push(
      this.queries.items.subscribe('qualify', (e) => {
        if (e.getValue(CaseItem, 'neta') === 'Tamago') this.caseItem = e.object3D ?? null;
      }),
    );
    for (const e of this.queries.items.entities) if (e.getValue(CaseItem, 'neta') === 'Tamago') this.caseItem = e.object3D ?? null;
    tamagoApi.ready = () => this.active && this.wanted && this.mix === 'none' && !this.stored && this.bowlHand === null;
    tamagoApi.makingsIn = (root, at) => this.makingsIn(root, at);
    tamagoApi.bowlAt = (out) => {
      if (!this.active) return false;
      out.copy(this.suri.bowl.position).add(this.tmp.set(0, SURIBACHI_TOP, 0));
      return true;
    };
    tamagoApi.byCook = () => {
      this.wanted = false;
      if (this.onBurner >= 0 && this.state === 'none') this.hang();
      // A pan the chef had already heated and oiled goes back up clean.
      if (this.active) {
        this.oiled = false;
        this.oilFilm.visible = false;
        this.panHeat = 0;
      }
      if (this.active && this.mix === 'none') this.setOut(false);
    };
    if (!this.active) return;
    const { pan, egg, oil } = createTamagoPan();
    this.pan = pan;
    this.egg = egg;
    this.oilFilm = oil;
    this.world.createTransformEntity(pan);
    // The lid hangs with the pan, in it, on the same hook.
    this.lid = createTamagoLid();
    this.world.createTransformEntity(this.lid);
    this.lidHook.set(0, 0.012, 0).applyQuaternion(this.hookQuat).add(this.hookPos);
    this.hang();
    this.oilPot = createOilPot();
    this.suri = createSuribachi();
    this.pestle = createPestle();
    this.eggPack = createEggPack();
    this.sticks = createChopsticks();
    for (const j of JARS) this.jars[j] = createSeasoningJar(j);
    for (const o of [this.suri.bowl, this.pestle, this.eggPack, this.sticks, this.jars.Salt, this.jars.Sugar, this.oilPot]) {
      this.world.createTransformEntity(o);
      o.visible = false;
    }
    this.holder = this.world.createTransformEntity().object3D as Group;
    this.holder.name = 'TamagoHeld';
    this.label = makeTextSprite(' ', { width: 0.24 });
    this.label.visible = false;
    this.world.createTransformEntity(this.label);
    this.readySign = makeTextSprite('Ready', { width: 0.09, background: '#2E8B57' });
    this.readySign.visible = false;
    this.world.createTransformEntity(this.readySign);
    debugLines.push(() =>
      this.wanted && prep.active
        ? `Tamago: ${this.mix} ground ${this.ground.toFixed(2)} mixed ${this.whisked.toFixed(2)} | ${this.state} on ${this.onBurner} ${Math.round(this.progress * 100)}% brown ${this.brown.map((b) => b.toFixed(2)).join('/')} | next ${tamago.next ?? '-'}`
        : '',
    );
  }

  update(delta: number): void {
    if (!this.active) return;
    if (!prep.active) {
      if (this.built && !this.cleared) this.clearAway();
      this.publish();
      return;
    }
    if (!this.built) {
      if (prep.delivered) {
        this.built = true;
        this.wanted = todaysMaterials().includes('Tamago');
        this.findJars();
        this.setOut(this.wanted);
      }
      this.publish();
      return;
    }
    for (const side of SIDES) this.updateHand(side);
    this.updatePestle();
    this.updateSticks();
    this.updateJar();
    this.updateOil();
    this.updateBowl();
    this.updatePan();
    this.updateFlipSticks();
    this.updateLift(delta);
    this.updateLidHand();
    this.updatePress();
    this.updateEggHand();
    this.updateWipe();
    this.updateHeat(delta);
    this.bake(delta);
    this.animate(delta);
    this.placeLid();
    this.updateLabel();
    this.updateReady();
    this.publish();
  }

  // ---- the pan --------------------------------------------------------------------

  private hang(): void {
    this.pan.position.copy(this.hookPos);
    this.pan.quaternion.copy(this.hookQuat);
    if (this.onBurner >= 0 && range.burners[this.onBurner]) range.burners[this.onBurner].pan = false;
    this.onBurner = -1;
    range.panOn = -1;
  }

  private grip(out: Vector3): Vector3 {
    return out.copy(PAN_GRIP).applyQuaternion(this.pan.quaternion).add(this.pan.position);
  }

  /** A burner the pan may go on: its pot put away, no net, nothing else on it. */
  private freeBurner(): number {
    return range.burners.findIndex((b) => b.state === 'out' && !b.net && !b.pan);
  }

  /** A pinch starting: the pestle, the bowl of eggs, the suribachi (to pour), the pan's handle (off its hook, or to turn the tamago), the baked tamago out. */
  private updateHand(side: Side): void {
    const hand = hands.all[side];
    if (!hand?.tracked || !hand.pinchStart || !this.wanted) return;
    if (chef.hands[side].holding !== Held.None || prep.carrying[side] || this.panHand !== null || this.eggHand !== null) return;
    if (this.pestleHand !== null || this.sticksHand !== null || this.bowlHand !== null || this.jarHand !== null || this.oilHand !== null || this.lidHand !== null) return;
    const g = hand.grasp;
    // Where the pinch was aimed (the grasp a moment before it closed), for the taps.
    const aim = hand.pinchPoint(this.aimAt);
    // The toss: the chopsticks lie on the pan's rim while the first side bakes (the handle may already be in the other hand).
    if (this.state === 'first' && this.flipSticksHand === null && g.distanceTo(this.sticksGrip(this.tmp)) < STICKS_PICK) {
      this.flipSticksHand = side;
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    if (this.liftHand) return;
    // The cupboard under the sink (its door, src/cupboard-system.ts): with the left half open, the suribachi comes out by its rim.
    if (this.mix === 'none' && this.stored) {
      if (cupboardApi.openness('left') > 0.8 && g.distanceTo(this.rim(this.tmp)) < RIM_PICK) {
        this.bowlHand = side;
        this.bowlOffset.copy(this.suri.bowl.position).sub(g);
        chef.hands[side].holding = Held.Saku;
        playPick();
      }
      return;
    }
    if (this.mix === 'scallop' && g.distanceTo(this.pestleGrip(this.tmp)) < PESTLE_PICK) {
      this.pestleHand = side;
      this.lastHand.copy(g);
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    // The salt, then the sugar, from their jars on the food shelf (a pinch on a jar takes it).
    if (this.mix === 'eggs' && !(this.salted && this.sugared)) {
      const j: Jar = this.salted ? 'Sugar' : 'Salt';
      if (aim.distanceTo(this.tmp.copy(this.jarHome[j]).add(this.tmp2.set(0, 0.08, 0))) < JAR_PICK) {
        this.jarHand = side;
        this.jarHeld = j;
        for (const o of this.shelfJars[j]) o.visible = false;
        this.jars[j].visible = true;
        chef.hands[side].holding = Held.Saku;
        playPick();
      }
      return;
    }
    if (this.mix === 'eggs' && g.distanceTo(this.sticksGrip(this.tmp)) < STICKS_PICK) {
      this.sticksHand = side;
      this.lastHand.copy(g);
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    if (this.mix === 'ground' && aim.distanceTo(this.tmp.copy(this.eggPack.position).add(this.tmp2.set(0, 0.04, 0))) < PACK_TAP) {
      this.eggsIn();
      return;
    }
    if (this.mix === 'mixed' && this.onBurner >= 0 && this.state === 'none' && g.distanceTo(this.rim(this.tmp)) < RIM_PICK) {
      this.bowlHand = side;
      this.bowlOffset.copy(this.suri.bowl.position).sub(g);
      // The chopsticks are laid aside for the pour.
      this.sticks.visible = false;
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    // The oil (the pan on its burner, the batter ready): the oil pot from the food shelf, by its knob.
    if (this.mix === 'mixed' && this.onBurner >= 0 && this.state === 'none' && !this.oiled && this.shelfOil.length && aim.distanceTo(this.tmp.copy(this.oilHome).add(this.tmp2.set(0, OIL_POT_TOP, 0))) < OIL_PICK) {
      this.oilHand = side;
      for (const o of this.shelfOil) o.visible = false;
      this.oilPot.visible = true;
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    // Baked: the lid from its hook by its bar (the flame off first).
    if (this.state === 'done' && aim.distanceTo(this.lidGrip(this.tmp)) < LID_PICK) {
      const b = range.burners[this.onBurner];
      if (b && b.level > 0) {
        playWarn();
        console.log('[Tamago] put out the flame under the pan first');
        return;
      }
      this.lidHand = side;
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    const near = g.distanceTo(this.grip(this.tmp)) < GRIP_PICK;
    if (near && this.onBurner < 0 && this.state === 'none') {
      this.panHand = side;
      this.pan.quaternion.identity();
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    if (near && this.onBurner >= 0 && (this.state === 'first' || this.state === 'pressed')) {
      this.liftHand = { side, fromY: g.y };
      this.lastLiftY = g.y;
      this.liftSpeed = 0;
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    // Cooled on its lid: the tamago, for the case.
    if (this.state === 'cooling' && g.distanceTo(this.egg.egg.getWorldPosition(this.tmp)) < EGG_PICK) {
      if (this.coolT < TAMAGO_COOL_SECONDS) {
        playWarn();
        console.log('[Tamago] let it cool a little on the lid first');
        return;
      }
      this.holder.position.copy(g);
      this.holder.updateMatrixWorld(true);
      this.holder.attach(this.egg.egg);
      this.eggHand = side;
      this.state = 'held';
      chef.hands[side].holding = Held.Saku;
      playPick();
    }
  }

  private overPan(at: Vector3): boolean {
    const p = this.pan.position;
    return Math.abs(at.x - p.x) < PAN_INNER / 2 + 0.02 && Math.abs(at.z - p.z) < PAN_INNER / 2 + 0.02 && at.y > p.y - 0.01 && at.y < p.y + 0.12;
  }

  /** The pan in a hand, level, by its handle; let go over a free burner it stands there, elsewhere it goes back on its hook. */
  private updatePan(): void {
    if (this.panHand === null) return;
    const side = this.panHand;
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    this.pan.position.copy(hand.grasp).sub(PAN_GRIP);
    if (!hand.pinchEnd) return;
    this.panHand = null;
    chef.hands[side].holding = Held.None;
    const p = this.pan.position;
    const i = range.burners.findIndex((b) => b.state === 'out' && !b.net && !b.pan && Math.hypot(p.x - b.at.x, p.z - b.at.z) < 0.15 && p.y < GRATE_Y + 0.35);
    if (i < 0) {
      this.hang();
      playPut();
      return;
    }
    const b = range.burners[i];
    this.pan.position.set(b.at.x, GRATE_Y + 0.003, b.at.z);
    b.pan = true;
    this.onBurner = i;
    range.panOn = i;
    playPut();
    coach.done('panOn');
    console.log('[Tamago] the pan is on a burner: pour the batter');
  }

  /**
   * The handle held on the burner: the pan rises with the hand. While the first side bakes, a quick flick up with the
   * chopsticks in the other hand tosses the tamago over (like fried rice); with the lid pressed on, raising it turns
   * the tamago out onto the lid.
   */
  private updateLift(delta: number): void {
    const h = this.liftHand;
    if (!h || this.onBurner < 0) return;
    const hand = hands.all[h.side];
    if (!hand?.tracked) return;
    const lift = Math.max(0, Math.min(0.12, hand.grasp.y - h.fromY));
    if (delta > 0) this.liftSpeed = 0.5 * this.liftSpeed + (0.5 * (hand.grasp.y - this.lastLiftY)) / delta;
    this.lastLiftY = hand.grasp.y;
    this.pan.position.y = GRATE_Y + 0.003 + lift;
    if (this.state === 'first' && lift > 0.015 && this.liftSpeed >= TAMAGO_FLIP_SPEED) {
      if (this.flipSticksHand === null) {
        if (!this.toldSticks) {
          this.toldSticks = true;
          playWarn();
          console.log('[Tamago] the chopsticks in the other hand to toss it over');
        }
      } else {
        this.state = 'turning';
        this.turnT = 0;
        this.torn = this.progress < TAMAGO_TURN_READY;
        console.log(
          this.torn
            ? `[Tamago] tossed over before the first side was set (${Math.round(this.progress * 100)}%): it broke`
            : `[Tamago] tossed over after ${Math.round(this.progress * 100)}% of the first side (golden ${this.brown[0].toFixed(2)})`,
        );
      }
    }
    if (this.state === 'pressed' && lift >= TURN_LIFT) this.turnOut();
    if (!hand.pinchEnd) return;
    this.liftHand = null;
    this.toldSticks = false;
    chef.hands[h.side].holding = Held.None;
    this.pan.position.y = GRATE_Y + 0.003;
    playPut();
  }

  /** The chopsticks in a hand at the range: they follow it, tips down toward the pan; let go, they lie on its rim again (or are put away once the tamago is out). */
  private updateFlipSticks(): void {
    const side = this.flipSticksHand;
    if (side === null) return;
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    this.dir.set(0.3, 1, -0.4).normalize();
    this.sticks.quaternion.setFromUnitVectors(UP, this.dir);
    this.sticks.position.copy(hand.grasp).addScaledVector(this.dir, -SAIBASHI_GRIP);
    if (!hand.pinchEnd) return;
    this.flipSticksHand = null;
    chef.hands[side].holding = Held.None;
    if (this.state === 'first' || this.state === 'turning' || this.state === 'second') this.restSticksAtPan();
    else this.sticks.visible = false;
    playPut();
  }

  /**
   * The chopsticks laid in the pan along the wall on the rice hand's side, their ends out over the rim (for the
   * toss). At the range the chef faces the back wall, so the rice hand's side is world -X (+X left-handed).
   */
  private restSticksAtPan(): void {
    const p = this.pan.position;
    const x = -sideSign();
    this.sticks.position.set(p.x + x * (PAN_INNER / 2 - 0.03), p.y + 0.012, p.z - 0.03);
    this.sticks.quaternion.setFromUnitVectors(UP, this.dir.set(x, 0.35, -0.2).normalize());
    this.sticks.visible = true;
  }

  /** The lid's bar (world). */
  private lidGrip(out: Vector3): Vector3 {
    return out.set(0, LID_GRIP_Y, 0).applyQuaternion(this.lid.quaternion).add(this.lid.position);
  }

  /** The lid in a hand by its bar: let go over the baked tamago in the pan, it lies on it; elsewhere it goes back on its hook. */
  private updateLidHand(): void {
    const side = this.lidHand;
    if (side === null) return;
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    this.lid.position.copy(hand.grasp);
    this.lid.position.y -= LID_GRIP_Y;
    this.lid.quaternion.identity();
    if (!hand.pinchEnd) return;
    this.lidHand = null;
    chef.hands[side].holding = Held.None;
    playPut();
    const p = this.pan.position;
    const g = hand.grasp;
    const over = Math.abs(g.x - p.x) < PAN_INNER / 2 + 0.03 && Math.abs(g.z - p.z) < PAN_INNER / 2 + 0.03 && g.y > p.y && g.y < p.y + 0.2;
    if (this.state !== 'done' || this.onBurner < 0 || !over) return;
    this.state = 'lidded';
    this.pressArmed[0] = this.pressArmed[1] = false;
    coach.done('lidTamago');
    console.log('[Tamago] the lid on the tamago: press it down once with the palm');
  }

  /** The lid on the tamago: an open palm coming down onto its bar presses it (once): the tamago is squared. */
  private updatePress(): void {
    if (this.state !== 'lidded') return;
    const top = this.lid.position.y + LID_GRIP_Y;
    for (const side of SIDES) {
      const hand = hands.all[side];
      if (!hand?.tracked || chef.hands[side].holding !== Held.None) continue;
      const p = hand.palm;
      const over = Math.abs(p.x - this.lid.position.x) < PAN_INNER / 2 && Math.abs(p.z - this.lid.position.z) < PAN_INNER / 2;
      // It counts only coming down from above (not the hand that has just let the lid go there).
      if (!over || p.y > top + PRESS_ARM) {
        this.pressArmed[side] = true;
        continue;
      }
      if (!this.pressArmed[side] || hand.curl > 0.6 || p.y > top + PRESS_ABOVE || p.y < top - 0.05) continue;
      const egg = this.egg.egg;
      egg.scale.y = PRESSED_SCALE;
      egg.position.y = (EGG_HEIGHT * PRESSED_SCALE) / 2 + 0.0006;
      this.state = 'pressed';
      playPress();
      coach.done('pressLid');
      console.log('[Tamago] pressed square under the lid: raise the handle to turn it out onto the lid');
      return;
    }
  }

  /** The lid pressed on, the handle raised: pan and lid turn over together; the tamago comes out on the lid, onto the work table. */
  private turnOut(): void {
    this.state = 'turningOut';
    this.outT = 0;
    this.outFrom.copy(this.lid.position);
    this.lid.attach(this.egg.egg);
    this.eggOnLid.copy(this.egg.egg.quaternion);
    if (this.flipSticksHand === null) this.sticks.visible = false;
    playPut();
    coach.done('turnOutTamago');
    console.log('[Tamago] turned out onto the lid: it cools a little on the work table');
  }

  /** The lid's place: in a hand, on the tamago in the pan, turning out, under the cooling tamago on the work table, or on its hook (in the pan when that hangs there too). */
  private placeLid(): void {
    if (this.lidHand !== null || this.state === 'turningOut') return;
    const s = this.state;
    if (s === 'lidded' || s === 'pressed') {
      this.lid.position.copy(this.pan.position);
      this.lid.position.y += EGG_HEIGHT * this.egg.egg.scale.y + 0.0006;
      this.lid.quaternion.identity();
    } else if (s === 'cooling' || s === 'held' || (s === 'cased' && !this.wiped)) {
      // Upside down, resting on its bar; the tamago on the board's underside.
      this.lid.position.set(LID_COOL.x, LID_COOL.y + LID_GRIP_Y, LID_COOL.z);
      this.lid.quaternion.copy(FLIP_X);
    } else {
      this.lid.position.copy(this.lidHook);
      this.lid.quaternion.copy(this.hookQuat);
    }
  }

  /** The oil pot in a hand: let go over the hot pan, the oil goes round it and the rest back into the pot (油返し); either way the pot goes back to the shelf. */
  private updateOil(): void {
    const side = this.oilHand;
    if (side === null) return;
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    this.oilPot.position.copy(hand.grasp);
    this.oilPot.position.y -= OIL_POT_TOP;
    if (!hand.pinchEnd) return;
    this.oilHand = null;
    chef.hands[side].holding = Held.None;
    this.oilPot.visible = false;
    for (const o of this.shelfOil) o.visible = true;
    playPut();
    const p = this.pan.position;
    const g = hand.grasp;
    if (this.onBurner < 0 || this.state !== 'none' || Math.abs(g.x - p.x) > PAN_INNER / 2 + 0.08 || Math.abs(g.z - p.z) > PAN_INNER / 2 + 0.08 || g.y > p.y + 0.45) return;
    if (this.panHeat < TAMAGO_OIL_HEAT) {
      playWarn();
      console.log('[Tamago] heat the pan first (a medium flame), then the oil');
      return;
    }
    this.oiled = true;
    this.oilFilm.visible = true;
    playDone();
    coach.done('oilPan');
    console.log('[Tamago] 油返し: the oil round the hot pan, the rest back into the pot: pour the batter');
  }

  /** The pan's heat: up on a lit burner (faster on a higher flame), down off it. */
  private updateHeat(delta: number): void {
    const level = this.onBurner >= 0 ? (range.burners[this.onBurner]?.level ?? 0) : 0;
    this.panHeat = Math.max(0, Math.min(1, this.panHeat + TAMAGO_HEAT_RATE[level] * delta));
  }

  /** After the tamago is out on its lid: a sheet of kitchen paper rubbed round inside the hot pan wipes it (no soap on the copper); wiped, it goes back on its hook. */
  private updateWipe(): void {
    const out = this.state === 'cooling' || this.state === 'held' || this.state === 'cased';
    if (!out || this.wiped || this.onBurner < 0 || this.panHand !== null || this.liftHand) return;
    for (const side of SIDES) {
      if (!prepApi.paperIn(side)) continue;
      const g = hands.all[side].grasp;
      const over = this.overPan(g) && g.y < this.pan.position.y + 0.06;
      if (this.panRub.update(g, over) < RUB_WIPE_BOARD) continue;
      prepApi.usePaper(side);
      this.wiped = true;
      this.oilFilm.visible = false;
      this.hang();
      playDone();
      coach.done('wipePan');
      console.log('[Tamago] the pan wiped clean while hot (no soap on the copper) and hung back up');
      if (this.state === 'cased') this.finish();
      return;
    }
  }

  /** In the case, the pan wiped and hung up: the tamago's work is done. */
  private finish(): void {
    prepApi.taskDone('Tamago');
    console.log('[Tamago] done: in the case, the pan wiped and hung up with its lid');
  }

  /** The cooled tamago in a hand: over the case it is stocked; elsewhere it goes back on its lid. */
  private updateEggHand(): void {
    if (this.eggHand === null) return;
    const side = this.eggHand;
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    this.holder.position.copy(hand.grasp);
    if (!hand.pinchEnd) return;
    this.eggHand = null;
    chef.hands[side].holding = Held.None;
    const egg = this.egg.egg;
    if (overStation(hand.grasp, StationKind.NetaCase) || (hand.grasp.distanceTo(tamago.caseAt) < 0.1 && hand.grasp.y > tamago.caseAt.y - 0.03)) {
      this.stock();
      return;
    }
    this.lid.add(egg);
    egg.position.set(0, -(EGG_HEIGHT * egg.scale.y) / 2, 0);
    egg.quaternion.copy(this.eggOnLid);
    this.state = 'cooling';
    playPut();
  }

  private stock(): void {
    this.egg.egg.visible = false;
    this.state = 'cased';
    const full = Math.round(NETA.Tamago.stock * fractionOf('Tamago'));
    const scorched = this.brown.filter((b) => b > TAMAGO_SCORCHED).length;
    const lost = scorched + (this.stuck ? 1 : 0) + (this.torn ? 1 : 0);
    const stock = Math.max(Math.ceil(full / 2), full - 2 * lost);
    prepApi.stock('Tamago', stock);
    feedback.flash(StationKind.NetaCase, COLOR_DONE);
    playDone();
    coach.done('eggOut');
    const why = [scorched ? `${scorched} face${scorched > 1 ? 's' : ''} scorched` : '', this.stuck ? 'stuck to the pan' : '', this.torn ? 'broken in the toss' : ''].filter(Boolean).join(', ');
    console.log(`[Tamago] in the case: ${stock} of ${full}${why ? ` (${why})` : ''}`);
    // The pan is wiped and hung up on its own (no soap on the copper); the work is done when both are.
    if (this.wiped) this.finish();
  }

  // ---- the batter and the bake ------------------------------------------------------

  // ---- the batter: the suribachi --------------------------------------------------------

  /** The suribachi (empty, its pestle and chopsticks in it) in the cupboard under the sink, the door shut; or put away for good. */
  private setOut(out: boolean): void {
    this.suri.bowl.position.copy(CUPBOARD_HOME);
    this.suri.bowl.rotation.set(0, 0, 0);
    this.suri.bowl.visible = out;
    this.stored = true;
    this.salted = this.sugared = false;
    this.eggPack.visible = false;
    for (const m of [this.suri.lumpy, this.suri.smooth, this.suri.batter, this.suri.froth]) m.visible = false;
    this.restTools(out);
  }

  /** The suribachi stood in its place on the work table, its pestle leaning on the rim and the chopsticks laid beside it. */
  private onTable(): void {
    this.suri.bowl.position.copy(BOWL_HOME);
    this.suri.bowl.rotation.set(0, 0, 0);
    this.stored = false;
    cupboardApi.open('none');
    this.restTools(true);
    this.pestle.visible = true;
    this.sticks.visible = true;
    coach.done('suribachiOut');
    console.log('[Tamago] the suribachi is on the work table: the scallops and eggs from the ice box');
  }

  /** The pestle and chopsticks at rest: standing in the bowl while it is in the cupboard or carried, laid by it on the table. */
  private restTools(visible: boolean): void {
    this.pestle.visible = this.sticks.visible = visible;
    if (this.stored) {
      const c = this.suri.bowl.position;
      this.pestle.position.set(c.x + 0.02, c.y + SURIBACHI_FLOOR + 0.003, c.z);
      this.pestle.quaternion.setFromUnitVectors(UP, this.dir.set(0.25, 1, 0.1).normalize());
      this.sticks.position.set(c.x - 0.025, c.y + SURIBACHI_FLOOR + 0.003, c.z + 0.01);
      this.sticks.quaternion.setFromUnitVectors(UP, this.dir.set(-0.2, 1, -0.15).normalize());
      return;
    }
    this.restPestle();
    this.restSticks();
  }

  /** The chopsticks laid on the table beside the suribachi (the chef's right), their tips toward the back. */
  private restSticks(): void {
    const c = this.suri.bowl.position;
    this.sticks.position.set(c.x + SURIBACHI_RIM + 0.03, c.y + 0.004, c.z - 0.1);
    this.sticks.quaternion.setFromUnitVectors(UP, this.dir.set(0.12, 0.02, 1).normalize());
  }

  /** The shelf's own salt and sugar jars (by name), and where they stand (world). */
  private findJars(): void {
    for (const j of JARS) {
      const body = this.world.scene.getObjectByName(`Jar${j}`);
      if (!body) continue;
      body.getWorldPosition(this.jarHome[j]);
      this.shelfJars[j] = [body, ...[`Jar${j}Lid`, `Jar${j}Label`].map((n) => this.world.scene.getObjectByName(n)).filter((o): o is Object3D => !!o)];
    }
    // The oil pot on the same shelf (src/scene-assets/shop-props.scene-asset.ts).
    const oil = this.world.scene.getObjectByName('JarOil');
    if (oil) {
      oil.getWorldPosition(this.oilHome);
      const tag = this.world.scene.getObjectByName('JarOilLabel');
      this.shelfOil = tag ? [oil, tag] : [oil];
    } else {
      // No oil pot to take (an older scene): the pan counts as oiled, so the tamago can still be poured.
      this.oiled = true;
      console.warn('[Tamago] no oil pot on the food shelf: the pan counts as oiled');
    }
  }

  /** A jar in a hand: let go over the suribachi, its pinch or spoonful goes in; either way it goes back to the shelf. */
  private updateJar(): void {
    const side = this.jarHand;
    const j = this.jarHeld;
    if (side === null || !j) return;
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    this.jars[j].position.copy(hand.grasp).add(this.tmp.set(0, -0.07, 0));
    if (!hand.pinchEnd) return;
    this.jarHand = null;
    this.jarHeld = null;
    chef.hands[side].holding = Held.None;
    this.jars[j].visible = false;
    for (const o of this.shelfJars[j]) o.visible = true;
    playPut();
    if (!this.overBowl(hand.grasp, 0.4)) return;
    if (j === 'Salt') {
      this.salted = true;
      coach.done('saltTamago');
      console.log('[Tamago] a pinch of salt in: now a teaspoon of sugar');
    } else {
      this.sugared = true;
      coach.done('sugarTamago');
      console.log('[Tamago] a teaspoon of sugar in: mix with the chopsticks till frothy');
    }
  }

  private sticksGrip(out: Vector3): Vector3 {
    return out.set(0, SAIBASHI_GRIP, 0).applyQuaternion(this.sticks.quaternion).add(this.sticks.position);
  }

  /** Over the work table's top (where the suribachi is let go to stand there). */
  private overTable(at: Vector3): boolean {
    return Math.abs(at.x - WORKTABLE_X) < WORKTABLE_WIDTH / 2 + 0.06 && at.z > BACK_ROW_Z - 0.12 && at.z < BACK_WALL_Z && at.y > SINK_TOP - 0.1 && at.y < SINK_TOP + 0.5;
  }

  /** The pestle at rest: its tip on the floor, leaning on the rim toward the chef's right. */
  private restPestle(): void {
    const c = this.suri.bowl.position;
    this.tip.set(c.x - 0.026, c.y + SURIBACHI_FLOOR + 0.003, c.z + 0.026);
    this.dir.set(c.x + SURIBACHI_RIM * 0.7, c.y + SURIBACHI_TOP + 0.013, c.z - SURIBACHI_RIM * 0.7).sub(this.tip).normalize();
    this.pestle.position.copy(this.tip);
    this.pestle.quaternion.setFromUnitVectors(UP, this.dir);
  }

  private pestleGrip(out: Vector3): Vector3 {
    return out.set(0, PESTLE_GRIP, 0).applyQuaternion(this.pestle.quaternion).add(this.pestle.position);
  }

  /** The suribachi's front rim (toward the chef), where it is taken up to pour. */
  private rim(out: Vector3): Vector3 {
    return out.copy(this.suri.bowl.position).add(this.tmp2.set(0, SURIBACHI_TOP, -SURIBACHI_RIM));
  }

  private overBowl(at: Vector3, high: number): boolean {
    const c = this.suri.bowl.position;
    return Math.hypot(at.x - c.x, at.z - c.z) < 0.15 && at.y > c.y && at.y < c.y + SURIBACHI_TOP + high;
  }

  /** The scallops and eggs (from the ice box) let go over the suribachi on the work table: the scallops in, the pack of eggs set down beside it. */
  private makingsIn(root: Object3D, at: Vector3): boolean {
    if (!this.active || !this.wanted || this.mix !== 'none' || this.stored || !this.overBowl(at, 0.45)) return false;
    root.visible = false;
    this.mix = 'scallop';
    this.ground = 0;
    this.showScallops();
    this.eggPack.position.copy(EGGS_HOME);
    this.eggPack.rotation.set(0, 0, 0);
    this.eggPack.visible = true;
    playPut();
    coach.done('potIn');
    console.log('[Tamago] the scallops are in the suribachi, the eggs beside it: grind them to a paste with the pestle');
    return true;
  }

  /** A tap on the pack of eggs (the scallops ground): the eggs go into the suribachi, the pack is done with; the pestle is laid aside for the chopsticks. */
  private eggsIn(): void {
    this.eggPack.visible = false;
    this.pestle.visible = false;
    this.suri.smooth.visible = this.suri.lumpy.visible = false;
    this.suri.batter.visible = this.suri.froth.visible = true;
    this.mix = 'eggs';
    this.whisked = 0;
    this.showBatter();
    this.restSticks();
    this.sticks.visible = true;
    playPut();
    coach.done('eggsTamago');
    console.log('[Tamago] the eggs are in: a pinch of salt and a teaspoon of sugar, from the jars on the food shelf');
  }

  /** The pestle in a hand: its tip on the floor under the hand, the stick up through it; going round grinds the scallops. */
  private updatePestle(): void {
    this.roundAndRound(this.pestleHand, this.pestle, 'scallop');
  }

  /** The chopsticks in a hand, the same way: going round mixes the eggs in. */
  private updateSticks(): void {
    this.roundAndRound(this.sticksHand, this.sticks, 'eggs');
  }

  /** A tool in a hand over the suribachi: its tip on the floor under the hand, held up through it; the hand's way round counts toward the work of that stage. */
  private roundAndRound(side: Side | null, tool: Group, stage: 'scallop' | 'eggs'): void {
    if (side === null) return;
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    const g = hand.grasp;
    if (hand.pinchEnd) {
      if (stage === 'scallop') this.pestleHand = null;
      else this.sticksHand = null;
      chef.hands[side].holding = Held.None;
      if (stage === 'scallop') this.restPestle();
      else this.restSticks();
      playPut();
      return;
    }
    const c = this.suri.bowl.position;
    this.tip.set(g.x - c.x, 0, g.z - c.z);
    const r = this.tip.length();
    if (r > TIP_ROUND) this.tip.multiplyScalar(TIP_ROUND / r);
    this.tip.add(c);
    this.tip.y = c.y + SURIBACHI_FLOOR + 0.003;
    this.dir.copy(g).sub(this.tip);
    if (this.dir.y < 0.05) this.dir.y = 0.05;
    this.dir.normalize();
    tool.position.copy(this.tip);
    tool.quaternion.setFromUnitVectors(UP, this.dir);
    // Round and round over the bowl: the hand's way counts (not a jump, as when it is lost a moment).
    const step = Math.hypot(g.x - this.lastHand.x, g.z - this.lastHand.z);
    this.lastHand.copy(g);
    if (step > ROUND_STEP || !this.overBowl(g, 0.3) || this.mix !== stage || (stage === 'eggs' && !(this.salted && this.sugared))) return;
    if (stage === 'scallop') {
      this.ground = Math.min(1, this.ground + step / TAMAGO_GRIND_TRAVEL);
      this.showScallops();
      if (this.ground < 1) return;
      this.mix = 'ground';
      playDone();
      coach.done('grindTamago');
      console.log('[Tamago] the scallops are ground to a paste: tap the pack of eggs');
    } else {
      this.whisked = Math.min(1, this.whisked + step / TAMAGO_WHISK_TRAVEL);
      this.showBatter();
      if (this.whisked < 1) return;
      this.mix = 'mixed';
      playDone();
      coach.done('whiskTamago');
      console.log('[Tamago] the batter is frothy: the pan on a burner, then pour it in');
    }
  }

  /** The scallops as they are ground: the pieces sink away, the paste spreads over the floor. */
  private showScallops(): void {
    const { lumpy, smooth } = this.suri;
    lumpy.visible = this.ground < 0.85;
    lumpy.scale.set(1, 1 - 0.7 * this.ground, 1);
    smooth.visible = this.ground > 0.25;
    const spread = 0.55 + 0.45 * this.ground;
    smooth.scale.set(spread, 1, spread);
  }

  /** The batter as it is mixed: yolky to pale, the froth coming up on it. */
  private showBatter(): void {
    this.suri.batterMat.color.copy(BATTER_RAW).lerp(BATTER_FROTHY, this.whisked);
    this.suri.frothMat.opacity = 0.9 * this.whisked;
  }

  /**
   * The suribachi in a hand, by its rim. From the cupboard: let go over the work table, it stands in its place there
   * (elsewhere it goes back on the shelf). With the batter: let go over the pan on its burner, it tips and pours;
   * elsewhere it goes back to its place.
   */
  private updateBowl(): void {
    const side = this.bowlHand;
    if (side === null) return;
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    this.suri.bowl.position.copy(hand.grasp).add(this.bowlOffset);
    if (this.stored) this.restTools(true);
    if (!hand.pinchEnd) return;
    this.bowlHand = null;
    chef.hands[side].holding = Held.None;
    if (this.stored) {
      if (this.overTable(hand.grasp)) this.onTable();
      else this.setOut(true);
      playPut();
      return;
    }
    if (this.pourInto(hand.grasp)) return;
    this.suri.bowl.position.copy(BOWL_HOME);
    this.sticks.visible = true;
    this.restSticks();
    playPut();
  }

  /** The suribachi let go over the pan on its burner: it tips and pours (then is put away with its pestle and chopsticks). */
  private pourInto(at: Vector3): boolean {
    if (!this.wanted || this.onBurner < 0 || this.state !== 'none' || this.mix !== 'mixed') return false;
    const p = this.pan.position;
    if (Math.abs(at.x - p.x) > PAN_INNER / 2 + 0.08 || Math.abs(at.z - p.z) > PAN_INNER / 2 + 0.08 || at.y > GRATE_Y + 0.45) return false;
    this.batter = this.suri.bowl;
    this.suri.batter.visible = this.suri.froth.visible = false;
    this.mix = 'poured';
    this.state = 'pouring';
    this.pourT = 0;
    this.progress = 0;
    this.brown[0] = this.brown[1] = 0;
    this.torn = false;
    // Hot and oiled, it sizzles; into a cold or dry pan it sticks.
    this.stuck = !this.oiled || this.panHeat < TAMAGO_POUR_HEAT;
    if (this.stuck) {
      playWarn();
      console.log(`[Tamago] poured into a ${this.oiled ? 'cold' : 'dry'} pan: it sticks`);
    } else {
      playSizzle();
    }
    const egg = this.egg.egg;
    this.pan.add(egg);
    egg.quaternion.identity();
    egg.visible = true;
    egg.scale.set(1, 0.02, 1);
    playPut();
    coach.done('pourTamago');
    console.log('[Tamago] the batter is in the pan: a low flame');
    return true;
  }

  /** The heat under the pan: the side down bakes and browns; the body sets. */
  private bake(delta: number): void {
    if (this.state !== 'first' && this.state !== 'second' && this.state !== 'done') return;
    const level = this.onBurner >= 0 ? (range.burners[this.onBurner]?.level ?? 0) : 0;
    const first = this.state === 'first';
    const seconds = TAMAGO_SIDE_SECONDS[first ? 0 : 1];
    this.brown[first ? 0 : 1] += (delta * TAMAGO_BROWN_RATE[level]) / seconds;
    if (this.state !== 'done') {
      const was = this.progress;
      this.progress += (delta * TAMAGO_BAKE_RATE[level]) / seconds;
      if (first && was < 1 && this.progress >= 1) {
        playDone();
        console.log('[Tamago] the first side is done: turn it over');
      }
      if (!first && this.progress >= 1) {
        this.state = 'done';
        playDone();
        console.log('[Tamago] baked through: the flame off, then out into the case');
      }
    }
    const set = first ? 0.6 * Math.min(1, this.progress) : this.state === 'done' ? 1 : 0.6 + 0.4 * Math.min(1, this.progress);
    this.egg.body.color.copy(EGG_RAW).lerp(EGG_SET, set);
    this.egg.body.roughness = 0.25 + 0.35 * set;
    this.browned(this.egg.faceA.color, this.brown[0]);
    // Face B is the batter's top until it goes down after the turn.
    if (first) this.egg.faceB.color.copy(this.egg.body.color);
    else this.browned(this.egg.faceB.color, this.brown[1]);
  }

  private browned(out: Color, b: number): void {
    if (b <= 1) out.copy(EGG_SET).lerp(EGG_GOLD, b);
    else out.copy(EGG_GOLD).lerp(EGG_BURNT, Math.min(1, (b - 1) / 1.2));
  }

  /** The pour (the bowl tips over the pan, the batter rises in it) and the turn (the block over, up and back down). */
  private animate(delta: number): void {
    const egg = this.egg.egg;
    if (this.state === 'pouring') {
      this.pourT += delta;
      const t = Math.min(1, this.pourT / TAMAGO_POUR_SECONDS);
      const p = this.pan.position;
      if (this.batter) {
        this.batter.position.set(p.x + 0.11, p.y + 0.09, p.z);
        this.batter.rotation.set(0, 0, Math.min(1, t * 2.5) * 1.9);
      }
      egg.scale.y = Math.max(0.02, t);
      egg.position.y = (EGG_HEIGHT * egg.scale.y) / 2 + 0.0006;
      if (t >= 1) {
        if (this.batter) this.batter.visible = false;
        this.batter = null;
        this.state = 'first';
        this.progress = 0;
        // The chopsticks come along to the range, for the toss.
        this.restSticksAtPan();
      }
    }
    if (this.state === 'turning') {
      this.turnT += delta;
      const t = Math.min(1, this.turnT / TURN_SECONDS);
      egg.quaternion.setFromAxisAngle(this.tmp.set(1, 0, 0), Math.PI * t);
      egg.position.y = EGG_HEIGHT / 2 + 0.0006 + Math.sin(Math.PI * t) * TOSS_HEIGHT;
      if (t >= 1) {
        egg.position.y = EGG_HEIGHT / 2 + 0.0006;
        this.state = 'second';
        this.progress = 0;
        playPut();
        coach.done('turnEgg');
      }
    }
    if (this.state === 'turningOut') {
      // Pan and lid over together: the lid, the tamago on it, arcs onto the work table upside down.
      this.outT += delta;
      const t = Math.min(1, this.outT / OUT_SECONDS);
      const k = t * t * (3 - 2 * t);
      this.lid.position.lerpVectors(this.outFrom, this.tmp.set(LID_COOL.x, LID_COOL.y + LID_GRIP_Y, LID_COOL.z), k);
      this.lid.position.y += Math.sin(Math.PI * t) * 0.12;
      this.lid.quaternion.identity().slerp(FLIP_X, k);
      if (t >= 1) {
        this.state = 'cooling';
        this.coolT = 0;
        playPut();
      }
    }
    if (this.state === 'cooling' && this.coolT < TAMAGO_COOL_SECONDS) {
      this.coolT += delta;
      if (this.coolT >= TAMAGO_COOL_SECONDS) {
        playDone();
        console.log('[Tamago] cooled on the lid: into the case');
      }
    }
  }

  // ---- words, and what the others see ---------------------------------------------------

  private updateLabel(): void {
    const pct = Math.round(Math.min(1, this.progress) * 100);
    const mixing = this.wanted && this.mix !== 'none' && this.mix !== 'poured';
    const text = mixing
      ? this.mix === 'scallop' ? `Tamago: grind the scallops ${Math.round(this.ground * 100)}%`
      : this.mix === 'ground' ? 'Tamago: tap the eggs in'
      : this.mix === 'eggs' ? (!this.salted ? 'Tamago: a pinch of salt' : !this.sugared ? 'Tamago: a teaspoon of sugar' : `Tamago: mix till frothy ${Math.round(this.whisked * 100)}%`)
      : this.onBurner < 0 ? 'Tamago: frothy. The pan onto a burner'
      : 'Tamago: frothy. Pour it into the pan'
      : !this.wanted
      ? ''
      : this.state === 'cooling' ? (this.coolT >= TAMAGO_COOL_SECONDS ? 'Tamago: cooled, into the case' : `Tamago: cooling on the lid ${Math.ceil(TAMAGO_COOL_SECONDS - this.coolT)} s`)
      : this.onBurner < 0
      ? ''
      : this.state === 'none' ? (this.oiled ? 'Tamago: pour the batter' : this.panHeat >= TAMAGO_OIL_HEAT ? 'Tamago: the pan is hot, oil it' : `Tamago: the pan heats ${Math.round((100 * this.panHeat) / TAMAGO_OIL_HEAT)}%`)
      : this.state === 'first' ? (this.progress >= 1 ? 'Tamago: turn it over' : `Tamago: first side ${pct}%`)
      : this.state === 'second' ? `Tamago: other side ${pct}%`
      : this.state === 'done' ? 'Tamago: done. Flame off, the lid on'
      : this.state === 'lidded' ? 'Tamago: press the lid once'
      : this.state === 'pressed' ? 'Tamago: raise the handle, out onto the lid'
      : '';
    if (text !== this.labelText) {
      this.labelText = text;
      if (text) setSpriteText(this.label, text);
    }
    // Shown only if the player wants the figures on the work.
    this.label.visible = !!text && display.status;
    if (!this.label.visible) return;
    if (mixing) this.label.position.copy(this.suri.bowl.position).add(this.tmp2.set(0, 0.3, -0.04));
    else if (this.state === 'cooling') this.label.position.copy(LID_COOL).add(this.tmp2.set(0, 0.22, 0.04));
    else this.label.position.copy(this.pan.position).add(this.tmp2.set(0, 0.2, 0.06));
  }

  /**
   * The pan on a lit burner, hot enough for the oil (then for the batter)
   * and the batter not in yet: "Ready" over it, with a ping as it comes.
   * Shown whatever the display settings: it stands in for the chef's own
   * test of the heat.
   */
  private updateReady(): void {
    const lit = this.onBurner >= 0 && (range.burners[this.onBurner]?.level ?? 0) > 0;
    const want = this.wanted && lit && this.state === 'none' && this.panHeat >= (this.oiled ? TAMAGO_POUR_HEAT : TAMAGO_OIL_HEAT);
    if (want && !this.readySign.visible) {
      playDone();
      console.log(`[Tamago] the pan is hot: ready for the ${this.oiled ? 'batter' : 'oil'}`);
    }
    this.readySign.visible = want;
    if (want) this.readySign.position.copy(this.pan.position).add(this.tmp2.set(0, 0.11, 0));
  }

  private publish(): void {
    tamago.panHeld = this.panHand !== null;
    tamago.eggHeld = this.eggHand !== null;
    tamago.pestleHeld = this.pestleHand !== null;
    tamago.sticksHeld = this.sticksHand !== null;
    tamago.jarHeld = this.jarHand !== null;
    tamago.bowlHeld = this.bowlHand !== null;
    tamago.oilHeld = this.oilHand !== null;
    tamago.lidHeld = this.lidHand !== null;
    tamago.flipSticksHeld = this.flipSticksHand !== null;
    let next: TamagoNext | null = null;
    const free = this.freeBurner();
    const out = this.state === 'turningOut' || this.state === 'cooling' || this.state === 'held' || this.state === 'cased';
    if (this.active && this.wanted && !(this.state === 'cased' && this.wiped)) {
      if (this.eggHand !== null) next = 'case';
      else if (this.panHand !== null) next = 'place';
      else if (this.oilHand !== null) next = 'oil';
      else if (this.lidHand !== null) next = 'lid';
      else if (this.bowlHand !== null) next = this.stored ? 'suribachi' : 'pour';
      // Out on the lid: the pan wiped while it is hot, the tamago into the case once cooled.
      else if (out) next = this.state === 'turningOut' ? 'cool' : !this.wiped ? 'wipe' : this.state === 'cased' ? null : this.coolT >= TAMAGO_COOL_SECONDS ? 'out' : 'cool';
      else if (this.mix === 'ground') next = 'eggs';
      else if (this.mix === 'none') next = this.stored ? (cupboardApi.openness('left') > 0.8 ? 'suribachi' : 'cupboard') : 'makings';
      else if (this.mix === 'scallop') next = 'grind';
      else if (this.mix === 'eggs') next = this.jarHeld ? (this.jarHeld === 'Salt' ? 'salt' : 'sugar') : !this.salted ? 'salt' : !this.sugared ? 'sugar' : 'whisk';
      else if (this.onBurner < 0) next = free >= 0 ? 'pan' : null;
      else if (this.state === 'none') next = this.oiled ? 'pour' : this.panHeat >= TAMAGO_OIL_HEAT ? 'oil' : 'heat';
      else if (this.state === 'first' && this.progress >= 1) next = 'turn';
      else if (this.state === 'done') next = 'lid';
      else if (this.state === 'lidded') next = 'press';
      else if (this.state === 'pressed') next = 'turnOut';
      else next = 'bake';
    }
    tamago.next = next;
    // A medium flame heats the pan for the oil and the pour; then low for the bake; off when it is done.
    range.panTarget =
      this.state === 'none' && this.mix === 'mixed' ? 2 : this.state === 'pouring' || this.state === 'first' || this.state === 'turning' || this.state === 'second' ? 1 : 0;
    if (!this.active) return;
    this.suri.bowl.getWorldPosition(tamago.bowlAt).add(this.tmp.set(0, SURIBACHI_FLOOR + 0.03, 0));
    this.rim(tamago.rimAt);
    this.pestleGrip(tamago.pestleAt);
    this.sticksGrip(tamago.sticksAt);
    for (const j of JARS) (j === 'Salt' ? tamago.saltAt : tamago.sugarAt).copy(this.jarHeld === j ? this.jars[j].position : this.jarHome[j]).add(this.tmp.set(0, 0.08, 0));
    tamago.tableAt.copy(BOWL_HOME).add(this.tmp.set(0, SURIBACHI_TOP, 0));
    tamago.packAt.copy(this.eggPack.position).add(this.tmp.set(0, 0.04, 0));
    this.grip(tamago.gripAt);
    tamago.oilAt.copy(this.oilHand !== null ? this.oilPot.position : this.oilHome).add(this.tmp.set(0, OIL_POT_TOP, 0));
    this.lidGrip(tamago.lidAt);
    this.egg.egg.getWorldPosition(tamago.eggAt);
    tamago.panAt.copy(this.pan.position).add(this.tmp.set(0, EGG_HEIGHT + 0.01, 0));
    // Where the hand lets go so that the pan (held by its handle, PAN_GRIP from its middle) lands on the free burner.
    if (free >= 0) tamago.burnerAt.copy(range.burners[free].at).setY(GRATE_Y + 0.03).add(PAN_GRIP);
    if (this.caseItem) this.caseItem.getWorldPosition(tamago.caseAt);
    tamago.say =
      next === 'pan' ? 'The tamago pan: off its hook by the handle, onto a free burner'
      : next === 'place' ? 'Onto a free burner'
      : next === 'cupboard' ? 'The suribachi is in the cupboard under the sink: slide the left door open by its handle'
      : next === 'suribachi' ? (this.bowlHand !== null ? 'Onto the work table, at its back corner' : 'The suribachi out of the cupboard by its rim, onto the work table')
      : next === 'makings' ? 'The scallops and eggs from the ice box: the scallops into the suribachi on the work table'
      : next === 'grind' ? 'Grind the scallops to a paste: the pestle round and round in the suribachi'
      : next === 'eggs' ? 'Tap the pack of eggs: they go into the suribachi'
      : next === 'salt' ? (this.jarHeld ? 'A pinch over the suribachi' : 'A pinch of salt: the salt jar from the food shelf by the end wall')
      : next === 'sugar' ? (this.jarHeld ? 'A teaspoon over the suribachi' : 'A teaspoon of sugar: the sugar jar from the food shelf')
      : next === 'whisk' ? 'Mix the eggs in till frothy: the chopsticks round and round'
      : next === 'pour' ? (this.bowlHand !== null ? 'Over the pan: pour it in' : 'The batter is frothy: the suribachi by its front rim, poured into the pan')
      : next === 'heat' ? 'Heat the pan on a medium flame'
      : next === 'oil' ? (this.oilHand !== null ? 'Over the hot pan: the oil round it, the rest back into the pot' : 'Oil the hot pan: the oil pot from the food shelf')
      : next === 'turn' ? (this.flipSticksHand !== null ? 'Now flick the handle up: toss it over' : 'The first side is set: the chopsticks in one hand, the handle in the other, flick it up')
      : next === 'lid' ? (this.lidHand !== null ? 'Onto the tamago in the pan' : 'Baked: flame off, the lid from its hook onto the tamago')
      : next === 'press' ? 'Press the lid down once with the palm: it squares the tamago'
      : next === 'turnOut' ? 'Raise the handle: pan and lid over, the tamago out onto the lid'
      : next === 'cool' ? 'It cools a little on the lid'
      : next === 'wipe' ? (SIDES.some((x) => prepApi.paperIn(x)) ? 'Wipe the hot pan with the paper (no soap on the copper)' : 'A sheet of kitchen paper, to wipe the pan while it is hot')
      : next === 'out' ? 'Cooled: from the lid into the case'
      : next === 'case' ? 'Into the case'
      : next === 'bake' ? 'The tamago bakes slowly on a low flame'
      : '';
  }

  /** The bar opens: the pan back on its hook, what was in it gone. */
  private clearAway(): void {
    this.cleared = true;
    this.readySign.visible = false;
    for (const side of [this.panHand, this.liftHand?.side ?? null, this.eggHand, this.pestleHand, this.sticksHand, this.bowlHand, this.jarHand, this.oilHand, this.lidHand, this.flipSticksHand]) if (side !== null) chef.hands[side].holding = Held.None;
    this.panHand = this.eggHand = null;
    this.oilHand = this.lidHand = this.flipSticksHand = null;
    this.oilPot.visible = false;
    for (const o of this.shelfOil) o.visible = true;
    this.oilFilm.visible = false;
    this.lid.position.copy(this.lidHook);
    this.lid.quaternion.copy(this.hookQuat);
    this.pestleHand = this.sticksHand = this.bowlHand = this.jarHand = null;
    if (this.jarHeld) {
      this.jars[this.jarHeld].visible = false;
      for (const o of this.shelfJars[this.jarHeld]) o.visible = true;
      this.jarHeld = null;
    }
    this.setOut(false);
    this.liftHand = null;
    this.egg.egg.visible = false;
    if (this.batter) this.batter.visible = false;
    this.label.visible = false;
    this.hang();
    this.wanted = false;
  }
}
