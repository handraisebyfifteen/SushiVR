import { Color, createSystem, Group, Matrix4, type Object3D, Quaternion, type Sprite, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { debugLines } from './debug.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { fractionOf, todaysMaterials } from './fish-order.js';
import { chef, prep, range, tamago, type TamagoNext } from './game-state.js';
import { hands } from './hands.js';
import { BACK_ROW_Z, NET_HOOK_Y, NET_HOOK_Z, RANGE_HEIGHT, ROOM_END_X, SINK_TOP, WALL_THICKNESS, WORKTABLE_X } from './layout.js';
import { NETA } from './menu.js';
import { prepApi, tamagoApi } from './prep-api.js';
import {
  createEggBowl,
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
/** The batter in the suribachi: empty, the surimi in (grinding), ground, the eggs in (mixing), frothy, poured. */
type Mix = 'none' | 'surimi' | 'ground' | 'eggs' | 'mixed' | 'poured';

/** The suribachi's place: the work table's back corner on the sink's side, clear of the hangiri and the rice tub; the eggs beside it. */
const BOWL_HOME = new Vector3(WORKTABLE_X + 0.205, SINK_TOP, BACK_ROW_Z + 0.42);
const EGGS_HOME = new Vector3(WORKTABLE_X + 0.055, SINK_TOP, BACK_ROW_Z + 0.48);
/** A pinch this close takes the pestle (by its grip), the bowl of eggs, the suribachi (by its front rim). */
const PESTLE_PICK = 0.08;
const EGGS_PICK = 0.09;
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
 * The full difficulty's tamago (厚焼き with surimi, the owner's shop). The
 * batter is made in the shop in the suribachi on the work table (the
 * owner): when tamago was ordered (the surimi and the eggs come in the ice
 * box):
 *  a. the surimi and eggs from the ice box, let go over the suribachi: the
 *     surimi goes in, the bowl of eggs is set down beside it;
 *  b. the pestle by its grip, round and round till the surimi is smooth;
 *  c. the bowl of eggs, let go over the suribachi: the eggs in;
 *  d. the pestle round and round again till the batter is frothy.
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
  private eggBowl!: Group;
  private mix: Mix = 'none';
  /** How far the surimi is ground, and the batter mixed (1: smooth, frothy). */
  private ground = 0;
  private whisked = 0;
  private pestleHand: Side | null = null;
  private eggsHand: Side | null = null;
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

  init(): void {
    this.active = PREP_STAGE >= 3;
    this.cleanupFuncs.push(
      this.queries.items.subscribe('qualify', (e) => {
        if (e.getValue(CaseItem, 'neta') === 'Tamago') this.caseItem = e.object3D ?? null;
      }),
    );
    for (const e of this.queries.items.entities) if (e.getValue(CaseItem, 'neta') === 'Tamago') this.caseItem = e.object3D ?? null;
    tamagoApi.ready = () => this.active && this.wanted && this.mix === 'none';
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
    this.eggBowl = createEggBowl();
    for (const o of [this.suri.bowl, this.pestle, this.eggBowl]) {
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
        this.setOut(this.wanted);
      }
      this.publish();
      return;
    }
    for (const side of SIDES) this.updateHand(side);
    this.updatePestle();
    this.updateEggs();
    this.updateBowl();
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
    if (this.pestleHand !== null || this.eggsHand !== null || this.bowlHand !== null) return;
    const g = hand.grasp;
    if ((this.mix === 'surimi' || this.mix === 'eggs') && g.distanceTo(this.pestleGrip(this.tmp)) < PESTLE_PICK) {
      this.pestleHand = side;
      this.lastHand.copy(g);
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    if (this.mix === 'ground' && g.distanceTo(this.tmp.copy(this.eggBowl.position).add(this.tmp2.set(0, 0.04, 0))) < EGGS_PICK) {
      this.eggsHand = side;
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    if (this.mix === 'mixed' && this.onBurner >= 0 && this.state === 'none' && g.distanceTo(this.rim(this.tmp)) < RIM_PICK) {
      this.bowlHand = side;
      this.bowlOffset.copy(this.suri.bowl.position).sub(g);
      // The pestle is laid aside for the pour.
      this.pestle.visible = false;
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

  /** The suribachi and its pestle out on the work table (empty), or put away. */
  private setOut(out: boolean): void {
    this.suri.bowl.position.copy(BOWL_HOME);
    this.suri.bowl.rotation.set(0, 0, 0);
    this.suri.bowl.visible = out;
    this.pestle.visible = out;
    this.eggBowl.visible = false;
    for (const m of [this.suri.lumpy, this.suri.smooth, this.suri.batter, this.suri.froth]) m.visible = false;
    this.restPestle();
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

  /** The surimi and eggs (from the ice box) let go over the suribachi: the surimi in, the eggs set down beside it. */
  private makingsIn(root: Object3D, at: Vector3): boolean {
    if (!this.active || !this.wanted || this.mix !== 'none' || !this.overBowl(at, 0.45)) return false;
    root.visible = false;
    this.mix = 'surimi';
    this.ground = 0;
    this.showSurimi();
    this.eggBowl.position.copy(EGGS_HOME);
    this.eggBowl.visible = true;
    playPut();
    coach.done('potIn');
    console.log('[Tamago] the surimi is in the suribachi, the eggs beside it: grind it smooth with the pestle');
    return true;
  }

  /** The pestle in a hand: its tip on the floor under the hand, the stick up through it; going round grinds, then mixes. */
  private updatePestle(): void {
    const side = this.pestleHand;
    if (side === null) return;
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    const g = hand.grasp;
    if (hand.pinchEnd) {
      this.pestleHand = null;
      chef.hands[side].holding = Held.None;
      this.restPestle();
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
    this.pestle.position.copy(this.tip);
    this.pestle.quaternion.setFromUnitVectors(UP, this.dir);
    // Round and round over the bowl: the hand's way counts (not a jump, as when it is lost a moment).
    const step = Math.hypot(g.x - this.lastHand.x, g.z - this.lastHand.z);
    this.lastHand.copy(g);
    if (step > ROUND_STEP || !this.overBowl(g, 0.3)) return;
    if (this.mix === 'surimi') {
      this.ground = Math.min(1, this.ground + step / TAMAGO_GRIND_TRAVEL);
      this.showSurimi();
      if (this.ground < 1) return;
      this.mix = 'ground';
      playDone();
      coach.done('grindTamago');
      console.log('[Tamago] the surimi is ground smooth: the eggs in');
    } else if (this.mix === 'eggs') {
      this.whisked = Math.min(1, this.whisked + step / TAMAGO_WHISK_TRAVEL);
      this.showBatter();
      if (this.whisked < 1) return;
      this.mix = 'mixed';
      playDone();
      coach.done('grindTamago');
      console.log('[Tamago] the batter is frothy: the pan on a burner, then pour it in');
    }
  }

  /** The surimi as it is ground: the lumps sink away, the smooth paste spreads over the floor. */
  private showSurimi(): void {
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

  /** The bowl of eggs in a hand: let go over the suribachi, the eggs go in; elsewhere it goes back beside it. */
  private updateEggs(): void {
    const side = this.eggsHand;
    if (side === null) return;
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    this.eggBowl.position.copy(hand.grasp).add(this.tmp.set(0, -0.035, 0));
    if (!hand.pinchEnd) return;
    this.eggsHand = null;
    chef.hands[side].holding = Held.None;
    if (!this.overBowl(hand.grasp, 0.35)) {
      this.eggBowl.position.copy(EGGS_HOME);
      playPut();
      return;
    }
    // The bowl is done with: put away.
    this.eggBowl.visible = false;
    this.suri.smooth.visible = this.suri.lumpy.visible = false;
    this.suri.batter.visible = this.suri.froth.visible = true;
    this.mix = 'eggs';
    this.whisked = 0;
    this.showBatter();
    playPut();
    coach.done('eggsTamago');
    console.log('[Tamago] the eggs are in: mix with the pestle till frothy');
  }

  /** The suribachi in a hand, by its rim: let go over the pan on its burner, it tips and pours; elsewhere it goes back to its place. */
  private updateBowl(): void {
    const side = this.bowlHand;
    if (side === null) return;
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    this.suri.bowl.position.copy(hand.grasp).add(this.bowlOffset);
    if (!hand.pinchEnd) return;
    this.bowlHand = null;
    chef.hands[side].holding = Held.None;
    if (this.pourInto(hand.grasp)) return;
    this.suri.bowl.position.copy(BOWL_HOME);
    this.pestle.visible = true;
    this.restPestle();
    playPut();
  }

  /** The suribachi let go over the pan on its burner: it tips and pours (then is put away with its pestle). */
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
      ? this.mix === 'surimi' ? `Tamago: grind the surimi ${Math.round(this.ground * 100)}%`
      : this.mix === 'ground' ? 'Tamago: the eggs in'
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
    tamago.eggBowlHeld = this.eggsHand !== null;
    tamago.bowlHeld = this.bowlHand !== null;
    let next: TamagoNext | null = null;
    const free = this.freeBurner();
    if (this.active && this.wanted && this.state !== 'cased') {
      if (this.eggHand !== null) next = 'case';
      else if (this.panHand !== null) next = 'place';
      else if (this.bowlHand !== null) next = 'pour';
      else if (this.eggsHand !== null || this.mix === 'ground') next = 'eggs';
      else if (this.mix === 'none') next = 'makings';
      else if (this.mix === 'surimi') next = 'grind';
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
    tamago.eggBowlAt.copy(this.eggBowl.position).add(this.tmp.set(0, 0.04, 0));
    this.grip(tamago.gripAt);
    tamago.panAt.copy(this.pan.position).add(this.tmp.set(0, EGG_HEIGHT + 0.01, 0));
    if (free >= 0) tamago.burnerAt.copy(range.burners[free].at).setY(GRATE_Y + 0.03);
    if (this.caseItem) this.caseItem.getWorldPosition(tamago.caseAt);
    tamago.say =
      next === 'pan' ? 'The tamago pan: off its hook by the handle, onto a free burner'
      : next === 'place' ? 'Onto a free burner'
      : next === 'makings' ? 'The surimi and eggs from the ice box: the surimi into the suribachi on the work table'
      : next === 'grind' ? 'Grind the surimi smooth: the pestle round and round in the suribachi'
      : next === 'eggs' ? 'The eggs into the suribachi'
      : next === 'whisk' ? 'Mix the eggs in till frothy: the pestle round and round'
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
    for (const side of [this.panHand, this.liftHand?.side ?? null, this.eggHand, this.pestleHand, this.eggsHand, this.bowlHand]) if (side !== null) chef.hands[side].holding = Held.None;
    this.panHand = this.eggHand = null;
    this.pestleHand = this.eggsHand = this.bowlHand = null;
    this.setOut(false);
    this.liftHand = null;
    this.egg.egg.visible = false;
    if (this.batter) this.batter.visible = false;
    this.label.visible = false;
    this.hang();
    this.wanted = false;
  }
}
