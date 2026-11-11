import { Color, createSystem, Group, Matrix4, type Object3D, Quaternion, type Sprite, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { debugLines } from './debug.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { fractionOf, todaysMaterials } from './fish-order.js';
import { chef, prep, range, tamago, type TamagoNext } from './game-state.js';
import { hands } from './hands.js';
import { BACK_ROW_DEPTH, BACK_ROW_Z, BACK_WALL_Z, NET_HOOK_Y, NET_HOOK_Z, RANGE_HEIGHT, ROOM_END_X, SINK_SHELF_Y, SINK_TOP, SINK_UNIT_X, SINK_UNIT_Z, SINK_WIDTH, WALL_THICKNESS, WORKTABLE_WIDTH, WORKTABLE_X } from './layout.js';
import { NETA } from './menu.js';
import { prepApi, tamagoApi } from './prep-api.js';
import {
  createChopsticks,
  createEggPack,
  createPestle,
  createSuribachi,
  createTamagoPan,
  EGG_BURNT,
  EGG_GOLD,
  EGG_HEIGHT,
  EGG_RAW,
  EGG_SET,
  type EggParts,
  PAN_GRIP,
  PAN_INNER,
  PESTLE_GRIP,
  SAIBASHI_GRIP,
  SURIBACHI_FLOOR,
  SURIBACHI_RIM,
  SURIBACHI_TOP,
  type SuribachiParts,
} from './scene-assets/lib/tamago-look.js';
import { playDone, playPick, playPut, playWarn } from './sfx.js';
import { overStation } from './station-system.js';
import { CaseItem, Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { PREP_STAGE, TAMAGO_BAKE_RATE, TAMAGO_BROWN_RATE, TAMAGO_GRIND_TRAVEL, TAMAGO_POUR_SECONDS, TAMAGO_SCORCHED, TAMAGO_SIDE_SECONDS, TAMAGO_WHISK_TRAVEL } from './tuning.js';
import { display } from './display-settings.js';

type Side = 0 | 1;
type Egg = 'none' | 'pouring' | 'first' | 'turning' | 'second' | 'done' | 'held' | 'cased';
/** The batter in the suribachi: empty, the scallops in (grinding), ground, the eggs in (mixing), frothy, poured. */
type Mix = 'none' | 'scallop' | 'ground' | 'eggs' | 'mixed' | 'poured';

/** The suribachi's place: the work table's back corner on the sink's side, clear of the hangiri and the rice tub; the eggs beside it. */
const BOWL_HOME = new Vector3(WORKTABLE_X + 0.205, SINK_TOP, BACK_ROW_Z + 0.42);
const EGGS_HOME = new Vector3(WORKTABLE_X + 0.05, SINK_TOP, BACK_ROW_Z + 0.48);
/** The suribachi's place in the cupboard under the sink: its left half, on the shelf, toward the doors. */
const CUPBOARD_HOME = new Vector3(SINK_UNIT_X - SINK_WIDTH / 4, SINK_SHELF_Y, SINK_UNIT_Z - (BACK_ROW_DEPTH - 0.04) / 2 + 0.16);
/** The left door slides this far to the right to open the cupboard, in this time. */
const DOOR_SLIDE = SINK_WIDTH / 2 - 0.02;
const DOOR_SECONDS = 0.5;
const HANDLE_PICK = 0.07;
const STICKS_PICK = 0.08;
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
 * grill net:
 *  1. the pan by its handle, off its hook, onto a free burner;
 *  2. the suribachi by its front rim, let go over the pan: poured (the
 *     suribachi and its pestle are put away);
 *  3. a low flame (the knob, as for the pots): it bakes slowly, its face
 *     down browning (a higher flame bakes faster but scorches it);
 *  4. turned once: the handle pinched and raised (the board over it,
 *     turned over, slid back), the other side baked;
 *  5. done: the flame off, the tamago out (a pinch over it) into the case.
 * Times are the master's guide, not a grade; only a scorched face costs a
 * couple of pieces, as scorched gourd strips do.
 */
export class TamagoSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private pan!: Group;
  private egg!: EggParts;
  private label!: Sprite;
  private labelText = '';
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
  private mix: Mix = 'none';
  /** The suribachi is in the cupboard under the sink (not out on the work table). */
  private stored = true;
  /** The cupboard's left door (found in the sink unit once the prep starts), where it hangs shut, and how far open it is (0..1) and wants to be. */
  private door: Object3D | null = null;
  private readonly doorHome = new Vector3();
  private doorOpen = 0;
  private doorWant = 0;
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
      if (this.active && this.mix === 'none') this.setOut(false);
    };
    if (!this.active) return;
    const { pan, egg } = createTamagoPan();
    this.pan = pan;
    this.egg = egg;
    this.world.createTransformEntity(pan);
    this.hang();
    this.suri = createSuribachi();
    this.pestle = createPestle();
    this.eggPack = createEggPack();
    this.sticks = createChopsticks();
    for (const o of [this.suri.bowl, this.pestle, this.eggPack, this.sticks]) {
      this.world.createTransformEntity(o);
      o.visible = false;
    }
    this.holder = this.world.createTransformEntity().object3D as Group;
    this.holder.name = 'TamagoHeld';
    this.label = makeTextSprite(' ', { width: 0.24 });
    this.label.visible = false;
    this.world.createTransformEntity(this.label);
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
        this.door = this.world.scene.getObjectByName('DoorL') ?? null;
        if (this.door) this.doorHome.copy(this.door.position);
        else console.warn('[Tamago] the sink unit has no DoorL: the cupboard cannot open');
        this.setOut(this.wanted);
      }
      this.publish();
      return;
    }
    for (const side of SIDES) this.updateHand(side);
    this.updatePestle();
    this.updateSticks();
    this.updateBowl();
    this.updateDoor(delta);
    this.updatePan();
    this.updateLift();
    this.updateEggHand();
    this.bake(delta);
    this.animate(delta);
    this.updateLabel();
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
    if (chef.hands[side].holding !== Held.None || prep.carrying[side] || this.panHand !== null || this.liftHand || this.eggHand !== null) return;
    if (this.pestleHand !== null || this.sticksHand !== null || this.bowlHand !== null) return;
    const g = hand.grasp;
    // Where the pinch was aimed (the grasp a moment before it closed), for the taps.
    const aim = hand.pinchPoint(this.aimAt);
    // The cupboard under the sink: the handle slides the door open; then the suribachi comes out by its rim.
    if (this.mix === 'none' && this.stored) {
      if (this.doorWant === 0 && this.door && aim.distanceTo(this.handle(this.tmp)) < HANDLE_PICK) {
        this.doorWant = 1;
        playPick();
        console.log('[Tamago] the cupboard under the sink is open: the suribachi out, onto the work table');
        return;
      }
      if (this.doorOpen > 0.8 && g.distanceTo(this.rim(this.tmp)) < RIM_PICK) {
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
    const near = g.distanceTo(this.grip(this.tmp)) < GRIP_PICK;
    if (near && this.onBurner < 0 && this.state === 'none') {
      this.panHand = side;
      this.pan.quaternion.identity();
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    if (near && this.onBurner >= 0 && this.state === 'first') {
      this.liftHand = { side, fromY: g.y };
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    if (this.state === 'done' && this.overPan(g)) {
      const b = range.burners[this.onBurner];
      if (b && b.level > 0) {
        feedback.flash(StationKind.NetaCase, COLOR_WARN);
        playWarn();
        console.log('[Tamago] put out the flame under the pan first');
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

  /** The handle held while the first side bakes: the pan rises with the hand; raised enough, the tamago is turned. */
  private updateLift(): void {
    const h = this.liftHand;
    if (!h || this.onBurner < 0) return;
    const hand = hands.all[h.side];
    if (!hand?.tracked) return;
    const lift = Math.max(0, Math.min(0.12, hand.grasp.y - h.fromY));
    this.pan.position.y = GRATE_Y + 0.003 + lift;
    if (lift >= TURN_LIFT && this.state === 'first') {
      this.state = 'turning';
      this.turnT = 0;
      console.log(`[Tamago] turned over after ${Math.round(this.progress * 100)}% of the first side (golden ${this.brown[0].toFixed(2)})`);
    }
    if (!hand.pinchEnd) return;
    this.liftHand = null;
    chef.hands[h.side].holding = Held.None;
    this.pan.position.y = GRATE_Y + 0.003;
    playPut();
  }

  /** The baked tamago in a hand: over the case it is stocked; elsewhere it goes back in its pan. */
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
    this.pan.add(egg);
    egg.position.set(0, EGG_HEIGHT / 2 + 0.0006, 0);
    egg.quaternion.setFromAxisAngle(this.tmp.set(1, 0, 0), Math.PI);
    this.state = 'done';
    playPut();
  }

  private stock(): void {
    this.egg.egg.visible = false;
    this.state = 'cased';
    const full = Math.round(NETA.Tamago.stock * fractionOf('Tamago'));
    const scorched = this.brown.filter((b) => b > TAMAGO_SCORCHED).length;
    const stock = Math.max(Math.ceil(full / 2), full - 2 * scorched);
    prepApi.stock('Tamago', stock);
    // The pan goes back on its hook (washed).
    this.hang();
    feedback.flash(StationKind.NetaCase, COLOR_DONE);
    playDone();
    coach.done('eggOut');
    console.log(`[Tamago] in the case: ${stock} of ${full}${scorched ? ` (${scorched} face${scorched > 1 ? 's' : ''} scorched)` : ''}`);
    prepApi.taskDone('Tamago');
  }

  // ---- the batter and the bake ------------------------------------------------------

  // ---- the batter: the suribachi --------------------------------------------------------

  /** The suribachi (empty, its pestle and chopsticks in it) in the cupboard under the sink, the door shut; or put away for good. */
  private setOut(out: boolean): void {
    this.suri.bowl.position.copy(CUPBOARD_HOME);
    this.suri.bowl.rotation.set(0, 0, 0);
    this.suri.bowl.visible = out;
    this.stored = true;
    this.doorWant = 0;
    this.eggPack.visible = false;
    for (const m of [this.suri.lumpy, this.suri.smooth, this.suri.batter, this.suri.froth]) m.visible = false;
    this.restTools(out);
  }

  /** The suribachi stood in its place on the work table, its pestle leaning on the rim and the chopsticks laid beside it. */
  private onTable(): void {
    this.suri.bowl.position.copy(BOWL_HOME);
    this.suri.bowl.rotation.set(0, 0, 0);
    this.stored = false;
    this.doorWant = 0;
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

  private sticksGrip(out: Vector3): Vector3 {
    return out.set(0, SAIBASHI_GRIP, 0).applyQuaternion(this.sticks.quaternion).add(this.sticks.position);
  }

  /** The left door's handle (world). */
  private handle(out: Vector3): Vector3 {
    if (!this.door) return out.copy(CUPBOARD_HOME);
    return this.door.getWorldPosition(out).add(this.tmp2.set(SINK_WIDTH / 4 - 0.08, 0, -0.02));
  }

  /** The door slides open or shut toward what it wants. */
  private updateDoor(delta: number): void {
    if (!this.door || this.doorOpen === this.doorWant) return;
    const step = delta / DOOR_SECONDS;
    this.doorOpen = this.doorOpen < this.doorWant ? Math.min(this.doorWant, this.doorOpen + step) : Math.max(this.doorWant, this.doorOpen - step);
    this.door.position.copy(this.doorHome).setX(this.doorHome.x + DOOR_SLIDE * this.doorOpen);
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
    console.log('[Tamago] the eggs are in: mix with the chopsticks till frothy');
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
    if (step > ROUND_STEP || !this.overBowl(g, 0.3) || this.mix !== stage) return;
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
      }
    }
    if (this.state === 'turning') {
      this.turnT += delta;
      const t = Math.min(1, this.turnT / TURN_SECONDS);
      egg.quaternion.setFromAxisAngle(this.tmp.set(1, 0, 0), Math.PI * t);
      egg.position.y = EGG_HEIGHT / 2 + 0.0006 + Math.sin(Math.PI * t) * 0.07;
      if (t >= 1) {
        egg.position.y = EGG_HEIGHT / 2 + 0.0006;
        this.state = 'second';
        this.progress = 0;
        playPut();
        coach.done('turnEgg');
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
      : this.mix === 'eggs' ? `Tamago: mix till frothy ${Math.round(this.whisked * 100)}%`
      : this.onBurner < 0 ? 'Tamago: frothy. The pan onto a burner'
      : 'Tamago: frothy. Pour it into the pan'
      : !this.wanted || this.onBurner < 0
      ? ''
      : this.state === 'none' ? 'Tamago: pour the batter'
      : this.state === 'first' ? (this.progress >= 1 ? 'Tamago: turn it over' : `Tamago: first side ${pct}%`)
      : this.state === 'second' ? `Tamago: other side ${pct}%`
      : this.state === 'done' ? 'Tamago: done, flame off'
      : '';
    if (text !== this.labelText) {
      this.labelText = text;
      if (text) setSpriteText(this.label, text);
    }
    // Shown only if the player wants the figures on the work.
    this.label.visible = !!text && display.status;
    if (!this.label.visible) return;
    if (mixing) this.label.position.copy(this.suri.bowl.position).add(this.tmp2.set(0, 0.3, -0.04));
    else this.label.position.copy(this.pan.position).add(this.tmp2.set(0, 0.2, 0.06));
  }

  private publish(): void {
    tamago.panHeld = this.panHand !== null;
    tamago.eggHeld = this.eggHand !== null;
    tamago.pestleHeld = this.pestleHand !== null;
    tamago.sticksHeld = this.sticksHand !== null;
    tamago.bowlHeld = this.bowlHand !== null;
    let next: TamagoNext | null = null;
    const free = this.freeBurner();
    if (this.active && this.wanted && this.state !== 'cased') {
      if (this.eggHand !== null) next = 'case';
      else if (this.panHand !== null) next = 'place';
      else if (this.bowlHand !== null) next = this.stored ? 'suribachi' : 'pour';
      else if (this.mix === 'ground') next = 'eggs';
      else if (this.mix === 'none') next = this.stored ? (this.doorOpen > 0.8 ? 'suribachi' : 'cupboard') : 'makings';
      else if (this.mix === 'scallop') next = 'grind';
      else if (this.mix === 'eggs') next = 'whisk';
      else if (this.onBurner < 0) next = free >= 0 ? 'pan' : null;
      else if (this.state === 'none') next = 'pour';
      else if (this.state === 'first' && this.progress >= 1) next = 'turn';
      else if (this.state === 'done') next = 'out';
      else next = 'bake';
    }
    tamago.next = next;
    range.panTarget = this.state === 'pouring' || this.state === 'first' || this.state === 'turning' || this.state === 'second' ? 1 : 0;
    if (!this.active) return;
    this.suri.bowl.getWorldPosition(tamago.bowlAt).add(this.tmp.set(0, SURIBACHI_FLOOR + 0.03, 0));
    this.rim(tamago.rimAt);
    this.pestleGrip(tamago.pestleAt);
    this.sticksGrip(tamago.sticksAt);
    this.handle(tamago.doorAt);
    tamago.tableAt.copy(BOWL_HOME).add(this.tmp.set(0, SURIBACHI_TOP, 0));
    tamago.packAt.copy(this.eggPack.position).add(this.tmp.set(0, 0.04, 0));
    this.grip(tamago.gripAt);
    tamago.panAt.copy(this.pan.position).add(this.tmp.set(0, EGG_HEIGHT + 0.01, 0));
    if (free >= 0) tamago.burnerAt.copy(range.burners[free].at).setY(GRATE_Y + 0.03);
    if (this.caseItem) this.caseItem.getWorldPosition(tamago.caseAt);
    tamago.say =
      next === 'pan' ? 'The tamago pan: off its hook by the handle, onto a free burner'
      : next === 'place' ? 'Onto a free burner'
      : next === 'cupboard' ? 'The suribachi is in the cupboard under the sink: slide the left door open by its handle'
      : next === 'suribachi' ? (this.bowlHand !== null ? 'Onto the work table, at its back corner' : 'The suribachi out of the cupboard by its rim, onto the work table')
      : next === 'makings' ? 'The scallops and eggs from the ice box: the scallops into the suribachi on the work table'
      : next === 'grind' ? 'Grind the scallops to a paste: the pestle round and round in the suribachi'
      : next === 'eggs' ? 'Tap the pack of eggs: they go into the suribachi'
      : next === 'whisk' ? 'Mix the eggs in till frothy: the chopsticks round and round'
      : next === 'pour' ? (this.bowlHand !== null ? 'Over the pan: pour it in' : 'The batter is frothy: the suribachi by its front rim, poured into the pan')
      : next === 'turn' ? 'The first side is done: turn it over (lift the pan by its handle)'
      : next === 'out' ? 'The tamago is done: flame off, out of the pan, into the case'
      : next === 'case' ? 'Into the case'
      : next === 'bake' ? 'The tamago bakes slowly on a low flame'
      : '';
  }

  /** The bar opens: the pan back on its hook, what was in it gone. */
  private clearAway(): void {
    this.cleared = true;
    for (const side of [this.panHand, this.liftHand?.side ?? null, this.eggHand, this.pestleHand, this.sticksHand, this.bowlHand]) if (side !== null) chef.hands[side].holding = Held.None;
    this.panHand = this.eggHand = null;
    this.pestleHand = this.sticksHand = this.bowlHand = null;
    this.setOut(false);
    this.liftHand = null;
    this.egg.egg.visible = false;
    if (this.batter) this.batter.visible = false;
    this.label.visible = false;
    this.hang();
    this.wanted = false;
  }
}
