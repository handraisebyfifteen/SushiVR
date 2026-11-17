import { stage, stageRice } from './stage.js';
import { createSystem, Group, type Mesh, type Object3D, type Sprite, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { debugLines } from './debug.js';
import { type FarTarget, FarChooser } from './far-choice.js';
import { COLOR_DONE, COLOR_HINT, feedback, glowObject } from './feedback.js';
import { chef, day, prep, shari, type Side } from './game-state.js';
import { onHandsChanged } from './handedness.js';
import { hands, RubTracker } from './hands.js';
import { AWASEZU_X, AWASEZU_Z, BACK_ROW_Z, HANGIRI_X, HANGIRI_Z, SINK_TOP, SINK_UNIT_Z, TUB_ON_TABLE_X, TUB_ON_TABLE_Z, WORKTABLE_X } from './layout.js';
import { prepApi } from './prep-api.js';
import { createFlame } from './scene-assets/lib/range-look.js';
import {
  createHangiri,
  createPitcher,
  createShamoji,
  HANGIRI_HEIGHT,
  HANGIRI_RADIUS,
  RICE_MOUND_HEIGHT,
  RICE_SPREAD_HEIGHT,
  riceGeometry,
} from './scene-assets/lib/shari-look.js';
import { playDone, playPick, playPress, playPut, playRustle } from './sfx.js';
import { stations } from './station-system.js';
import { Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { AWASEZU_SECONDS, RICE_COOK_SECONDS, RICE_SOAK_SECONDS, RICE_STEAM_SECONDS, SHARI_CUT_DISTANCE, SHARI_SCOOPS } from './tuning.js';
import { display } from './display-settings.js';
import { addShari, chefRiceInService, cookRice, pantry, pantryOn, riceText } from './pantry.js';
import { SHARI_PER_SHO_GRAMS } from './tuning.js';

/** The rice surface sits this far above the ohitsu's floor (its tub reaches 12 cm below the rim's rice line). */
const TUB_DEPTH = 0.12;
const TUB_RADIUS = 0.16;
/** A pinch this close takes the paddle (at its grip) or the awasezu bowl (the nearer). */
const PICK_RADIUS = 0.09;
/** The paddle's blade middle, from the grip along it; it dips this much (radians) in the hand. */
const BLADE_REACH = 0.14;
const PADDLE_PITCH = -0.35;
const SIDES: readonly Side[] = [0, 1];

type Carried = 'shamoji' | 'awasezu' | 'tub';
/** The cooker, pointed at to put the rice in, to light it and to turn it out: on the full mode, as the rice goes in, two amounts stand over it (1 sho, 1.5 sho; src/pantry.ts). */
type CookerId = 'cooker' | 'cooker15';
/** The two amounts stand this far apart (m) to either side of the cooker, far enough apart to point at one. */
const AMOUNT_APART = 0.15;
/** The ohitsu looks full with this much shari in it (1.5 sho). */
const TUB_FULL_GRAMS = 1.5 * SHARI_PER_SHO_GRAMS;

/**
 * Shari-kiri in the morning prep, at the back work table (the shop's way):
 *  - point at the gas rice cooker under the table (standing at the table)
 *    and pinch to put the rice in with its water: it soaks (浸水) as long
 *    as it will steam; soaked, point and pinch again to light it; it
 *    cooks, goes out by itself, and steams;
 *  - point and pinch again to turn the rice out into the hangiri;
 *  - take the bowl of awasezu (rice vinegar, made ahead) and hold it over
 *    the rice to pour it on;
 *  - take the paddle and cut through the rice, back and forth;
 *  - bring the ohitsu from its stand by the stool (its lid stays on the
 *    stand) and set it on the table beside the hangiri;
 *  - scoop the shari into it with the paddle, a scoop at a time, then carry
 *    it back to its stand. No fanning.
 * The ohitsu starts the day empty; the bar's rice comes from it. On the
 * full mode the rice is measured out of the sack as it goes in to soak: 1
 * or 1.5 sho, pointed at over it (src/pantry.ts); the ohitsu's shari then
 * goes down as the bar uses it. In service (full) the chef may cook another
 * batch himself (the cook can be asked instead, src/pantry-system.ts): from
 * the work table the same steps again, the tools down off the wall; the
 * ohitsu serves from its stand till it is fetched for the scooping.
 */
export class ShariSystem extends createSystem({}) {
  private hangiri!: Group;
  private rice!: Mesh;
  private shamoji!: Group;
  private lump!: Object3D;
  private awasezu!: Group;
  private stream!: Object3D;
  private vinegar!: Object3D;
  private flame!: Mesh;
  private label!: Sprite;
  private labelText = '';
  private readonly chooser = new FarChooser<CookerId>();
  private readonly cooker: FarTarget<CookerId> = { id: 'cooker', at: new Vector3(WORKTABLE_X, 0.34, SINK_UNIT_Z - 0.16), radius: 0.16 };
  private readonly cooker15: FarTarget<CookerId> = { id: 'cooker15', at: new Vector3(WORKTABLE_X + AMOUNT_APART, 0.34, SINK_UNIT_Z - 0.16), radius: 0.12 };
  private readonly targets: FarTarget<CookerId>[] = [];
  /** The two amounts' words over the cooker (full); the sack's "not enough" word, for a while. */
  private amount1!: Sprite;
  private amount15!: Sprite;
  private short = 0;
  /** This morning's cook (sho), whether its rice is already out of the sack, and how full the ohitsu was last drawn. */
  private batch = 1;
  private measured = false;
  /** A batch the chef is cooking himself in service (full). */
  private serviceBatch = false;
  private drawnFill = -1;
  private glowing = false;
  private cookerObject: Object3D | null = null;
  private wallTools: Object3D[] = [];
  /** The ohitsu: its root (the stand stays), the part that is carried, its rice and lid. */
  private tubRoot: Object3D | null = null;
  private carry: Group | null = null;
  private tubRice: Object3D | null = null;
  private lid: Object3D | null = null;
  private readonly lidClosed = new Vector3();
  private readonly carried: [Carried | null, Carried | null] = [null, null];
  private readonly offset = [new Vector3(), new Vector3()];
  private readonly rub = new RubTracker(true);
  private poured = 0;
  private spread = false;
  private finished = false;
  private readonly shamojiHome = new Vector3(HANGIRI_X, SINK_TOP + HANGIRI_HEIGHT + 0.008, HANGIRI_Z - HANGIRI_RADIUS - 0.05);
  private readonly awasezuHome = new Vector3(AWASEZU_X, SINK_TOP, AWASEZU_Z);
  private readonly blade = new Vector3();
  private readonly head = new Vector3();
  private readonly tmp = new Vector3();

  init(): void {
    // The ohitsu's stand crosses over with the chef's hands (src/handedness.ts).
    this.cleanupFuncs.push(onHandsChanged(() => this.tubRoot?.getWorldPosition(shari.tubHomeAt)));
    this.hangiri = createHangiri();
    this.hangiri.position.set(HANGIRI_X, SINK_TOP, HANGIRI_Z);
    this.rice = this.hangiri.getObjectByName('Rice') as Mesh;
    this.shamoji = createShamoji();
    this.lump = this.shamoji.getObjectByName('Lump')!;
    this.awasezu = createPitcher();
    this.stream = this.awasezu.getObjectByName('Stream')!;
    this.vinegar = this.awasezu.getObjectByName('Vinegar')!;
    this.flame = createFlame(0.15, 18);
    this.flame.position.set(WORKTABLE_X, 0.215, SINK_UNIT_Z);
    this.label = makeTextSprite(' ', { width: 0.24 });
    this.label.name = 'RiceCookerWord';
    this.label.position.set(WORKTABLE_X, SINK_TOP + 0.1, BACK_ROW_Z + 0.02);
    this.label.visible = false;
    this.amount1 = makeTextSprite('1 sho', { width: 0.1 });
    this.amount1.name = 'RiceAmount1';
    this.amount15 = makeTextSprite('1.5 sho', { width: 0.1 });
    this.amount15.name = 'RiceAmount15';
    this.amount1.visible = this.amount15.visible = false;
    for (const o of [this.hangiri, this.shamoji, this.awasezu, this.flame, this.label, this.amount1, this.amount15]) this.world.createTransformEntity(o);
    this.restShamoji();
    this.restAwasezu();
    shari.hangiriAt.set(HANGIRI_X, SINK_TOP + 0.04, HANGIRI_Z);
    shari.awasezuAt.set(AWASEZU_X, SINK_TOP + 0.06, AWASEZU_Z);
    shari.tubTableAt.set(TUB_ON_TABLE_X, SINK_TOP + TUB_DEPTH, TUB_ON_TABLE_Z);
    shari.cookerAt.copy(this.cooker.at);
    debugLines.push(() =>
      prep.active || this.serviceBatch ? `Shari: ${shari.step}${shari.left > 0 && (shari.step === 'soaking' || shari.step === 'cooking' || shari.step === 'steaming') ? ` ${Math.ceil(shari.left)}s` : ''} | scoops ${shari.scoops} | ohitsu ${shari.tubOnTable ? 'on the table' : shari.tubHeld ? 'in hand' : 'home'} | at ${chef.at}` : '',
    );
  }

  update(delta: number): void {
    if (!this.findTub()) return;
    // The bar opened before the shari was in (the prep skipped); a batch of the chef's own left when the day closed (the cook sees to it).
    if (!prep.active && !this.finished && (!this.serviceBatch || day.closed || !pantryOn())) this.finish(true);
    // A prep stage without the rice: the shari is not its work.
    if (stage.prep && !stageRice() && !this.finished) this.finish(true);
    if (this.finished) {
      this.followStock();
      this.offerCooker(delta);
      return;
    }
    if (this.serviceBatch) this.followStock();
    this.findWallTools();
    this.updateCooker(delta);
    for (const side of SIDES) {
      this.updateCarried(side, delta);
      this.updatePick(side);
    }
    this.updateWork();
    shari.shamojiAt.copy(this.shamoji.position);
    shari.shamojiHeld = this.carried.includes('shamoji');
    shari.awasezuHeld = this.carried.includes('awasezu');
    shari.tubHeld = this.carried.includes('tub');
    // In service the bar has no rice while its ohitsu is off its stand.
    if (this.serviceBatch) shari.inTub = !shari.tubHeld && !shari.tubOnTable;
    this.hints();
  }

  // ---- the ohitsu and the tools on the wall ---------------------------------------

  /** The ohitsu's tub, hoops and rice go into one group that can be carried; its lid and stand stay apart. */
  private findTub(): boolean {
    if (this.carry) return true;
    const root = stations.get(StationKind.RiceTub)?.entity.object3D;
    const tub = root?.getObjectByName('Tub');
    const lid = root?.getObjectByName('Lid');
    if (!root || !tub || !lid) return false;
    this.tubRoot = root;
    this.carry = new Group();
    this.carry.name = 'OhitsuCarried';
    root.add(this.carry);
    for (const name of ['Tub', 'Rice', 'Hoops']) {
      const o = root.getObjectByName(name);
      if (o) this.carry.add(o);
    }
    this.tubRice = this.carry.getObjectByName('Rice') ?? null;
    this.lid = lid;
    this.lidClosed.copy(lid.position);
    root.getWorldPosition(shari.tubHomeAt);
    if (prep.active) {
      // The day starts with the ohitsu empty.
      this.setTubFill(0);
      shari.inTub = false;
    } else {
      shari.inTub = true;
    }
    return true;
  }

  /** The hangiri and the paddle hang on the wall when not in use; in the morning they are down on the table. */
  private findWallTools(): void {
    if (this.wallTools.length) return;
    this.world.scene.traverse((o) => {
      if (o.name === 'Hangiri' && o !== this.hangiri && !this.hangiri.getObjectById(o.id)) this.wallTools.push(o);
      if (o.name === 'ShariTools') this.wallTools.push(o);
      if (o.name === 'RiceCooker') this.cookerObject = o;
    });
    for (const o of this.wallTools) o.visible = false;
  }

  /** The ohitsu's rice goes down as the bar uses it (full; src/pantry.ts), and up as a batch in service is scooped in. */
  private followStock(): void {
    if (!pantryOn()) return;
    const scooped = this.serviceBatch ? (this.batch * SHARI_PER_SHO_GRAMS * shari.scoops) / SHARI_SCOOPS : 0;
    const fill = Math.min(1, (pantry.tubGrams + scooped) / TUB_FULL_GRAMS);
    if (Math.abs(fill - this.drawnFill) < 0.01) return;
    this.drawnFill = fill;
    this.setTubFill(fill);
  }

  private setTubFill(fill: number): void {
    if (!this.tubRice) return;
    this.tubRice.visible = fill > 0.01;
    this.tubRice.position.y = 0.005 - (TUB_DEPTH - 0.012) * (1 - fill);
  }

  // ---- the gas rice cooker -----------------------------------------------------

  private updateCooker(delta: number): void {
    if (shari.step === 'soaking' || shari.step === 'cooking' || shari.step === 'steaming') {
      shari.left -= delta;
      if (shari.left <= 0) {
        if (shari.step === 'soaking') {
          shari.step = 'light';
          playDone();
          console.log('[Shari] the rice has soaked: light the cooker');
        } else if (shari.step === 'cooking') {
          shari.step = 'steaming';
          shari.left = RICE_STEAM_SECONDS;
          this.flame.visible = false;
          console.log('[Shari] the cooker has gone out by itself: steaming');
        } else {
          shari.step = 'turnOut';
          playDone();
          console.log('[Shari] the rice is done: turn it out into the hangiri');
        }
      }
    }
    if (this.flame.visible) this.flame.scale.y = 0.85 + 0.15 * Math.sin(performance.now() * 0.03);
    if (this.short > 0) this.short -= delta;
    this.say(
      this.short > 0 && shari.step === 'soak'
        ? `Rice: ${riceText()} in the sack. Call the rice shop`
        : shari.step === 'soaking'
          ? `Soaking: ${Math.ceil(shari.left)} s`
          : shari.step === 'light'
            ? 'Soaked: light it'
            : shari.step === 'cooking'
          ? `Rice cooking: ${Math.ceil(shari.left)} s`
          : shari.step === 'steaming'
            ? `Steaming: ${Math.ceil(shari.left)} s`
            : shari.step === 'turnOut'
              ? 'Rice is done'
              : '',
    );
    // Standing at the table, turned to it: point at the cooker (or look) and pinch.
    // On full, as the rice goes in, the two amounts: 1 sho to the left of the cooker, 1.5 sho to its right.
    const atCooker = chef.at === 'table' && chef.facingBack && (shari.step === 'soak' || shari.step === 'light' || shari.step === 'turnOut');
    const chosen = this.pickCooker(delta, atCooker, atCooker && shari.step === 'soak' && pantryOn());
    if (!chosen) return;
    if (shari.step === 'soak') {
      this.soakRice(chosen === 'cooker15' ? 1.5 : 1);
    } else if (shari.step === 'light') {
      this.lightCooker();
    } else {
      shari.step = 'vinegar';
      this.rice.geometry = riceGeometry('mound', 1);
      this.rice.visible = true;
      playRustle();
      coach.done('turnOutRice');
      console.log('[Shari] the rice is in the hangiri: pour the awasezu over it');
    }
  }

  /** The cooker's far target (and on full, as the rice goes in, the two amounts beside it): the one chosen this frame. */
  private pickCooker(delta: number, atCooker: boolean, amounts: boolean): CookerId | null {
    this.targets.length = 0;
    this.cooker.at.x = WORKTABLE_X - (amounts ? AMOUNT_APART : 0);
    shari.cookerAt.copy(this.cooker.at);
    if (atCooker) this.targets.push(this.cooker);
    if (amounts) this.targets.push(this.cooker15);
    this.amount1.visible = this.amount15.visible = amounts;
    if (amounts) {
      this.amount1.position.set(this.cooker.at.x, SINK_TOP + 0.05, SINK_UNIT_Z - 0.2);
      this.amount15.position.set(this.cooker15.at.x, SINK_TOP + 0.05, SINK_UNIT_Z - 0.2);
    }
    this.player.head.getWorldPosition(this.head);
    const chosen = this.targets.length ? this.chooser.update(delta, this.player, this.head, this.targets) : null;
    if (!this.targets.length) this.chooser.reset();
    const glow = !chosen && this.chooser.hovered !== null;
    if (glow !== this.glowing && this.cookerObject) glowObject(this.cookerObject, glow ? COLOR_HINT : null);
    this.glowing = glow;
    if (chosen) playPress();
    return chosen;
  }

  /** This much rice into the cooker with its water, to soak; on full it is measured out of the sack (not enough, and none goes in). */
  private soakRice(sho: number): boolean {
    if (!cookRice(sho)) {
      this.short = 4;
      console.log(`[Shari] not enough rice in the sack for ${sho} sho (${riceText()})`);
      return false;
    }
    this.batch = sho;
    this.measured = true;
    this.amount1.visible = this.amount15.visible = false;
    shari.step = 'soaking';
    shari.left = RICE_SOAK_SECONDS;
    coach.done('soakRice');
    console.log(`[Shari] the rice is in the cooker, soaking${pantryOn() ? `: ${sho} sho (rice left ${riceText()})` : ''}`);
    return true;
  }

  /** Soaked: the cooker lit. */
  private lightCooker(): void {
    shari.step = 'cooking';
    shari.left = RICE_COOK_SECONDS;
    this.flame.visible = true;
    coach.done('lightRice');
    console.log('[Shari] the rice cooker is lit');
  }

  /** In service (full), standing at the work table turned to it with the cooker free: the chef may put another batch in himself, 1 or 1.5 sho. */
  private offerCooker(delta: number): void {
    if (this.short > 0) this.short -= delta;
    const offer = chefRiceInService() && chef.at === 'table' && chef.facingBack;
    this.say(offer && this.short > 0 ? `Rice: ${riceText()} in the sack. Call the rice shop` : '');
    if (!offer && !this.targets.length) return;
    const chosen = this.pickCooker(delta, offer, offer);
    if (!chosen || !this.soakRice(chosen === 'cooker15' ? 1.5 : 1)) return;
    // The morning's tools come down off the wall again; the ohitsu stays on its stand (and serves) till it is fetched.
    this.finished = false;
    this.serviceBatch = true;
    shari.scoops = 0;
    shari.loaded = false;
    this.poured = 0;
    this.spread = false;
    this.rub.reset();
    this.vinegar.visible = true;
    this.rice.visible = false;
    this.lump.visible = false;
    this.restShamoji();
    this.restAwasezu();
    this.hangiri.visible = this.shamoji.visible = this.awasezu.visible = true;
    for (const o of this.wallTools) o.visible = false;
    console.log(`[Shari] a batch of the chef's own in service: ${this.batch} sho`);
  }

  private say(text: string): void {
    // Shown only if the player wants the figures on the work.
    this.label.visible = text !== '' && display.status;
    if (text === this.labelText) return;
    this.labelText = text;
    if (text) setSpriteText(this.label, text);
  }

  // ---- taking and carrying ---------------------------------------------------------

  private updatePick(side: Side): void {
    const hand = hands.all[side];
    if (!hand?.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None || this.carried[side] || prep.carrying[side]) return;
    const g = hand.grasp;
    let what: Carried | null = null;
    const dPaddle = this.carried.includes('shamoji') ? Infinity : g.distanceTo(this.shamoji.position);
    const dBowl = this.carried.includes('awasezu') ? Infinity : this.tmp.copy(this.awasezu.position).setY(this.awasezu.position.y + 0.06).distanceTo(g);
    // Both in reach (they lie 12 cm apart): the one the work wants now.
    if (dPaddle < PICK_RADIUS && dBowl < PICK_RADIUS) what = shari.step === 'vinegar' ? 'awasezu' : 'shamoji';
    else if (Math.min(dPaddle, dBowl) < PICK_RADIUS) what = dPaddle < dBowl ? 'shamoji' : 'awasezu';
    else if (!this.carried.includes('tub') && this.tubWanted() && this.nearTub(g)) what = 'tub';
    if (!what) return;
    this.carried[side] = what;
    chef.hands[side].holding = what === 'shamoji' ? Held.Shamoji : what === 'awasezu' ? Held.Awasezu : Held.Ohitsu;
    const at = what === 'shamoji' ? this.shamoji.position : what === 'awasezu' ? this.awasezu.position : this.carry!.getWorldPosition(this.tmp);
    this.offset[side].copy(at).sub(g);
    if (what === 'shamoji') this.offset[side].set(0, 0, 0);
    if (what === 'tub') {
      // The lid stays behind on the stand.
      if (!shari.tubOnTable) this.lid!.position.set(this.lidClosed.x, this.lidClosed.y - TUB_DEPTH - 0.05, this.lidClosed.z);
      shari.tubOnTable = false;
    }
    playPick();
    console.log(`[Shari] took the ${what === 'tub' ? 'ohitsu' : what === 'shamoji' ? 'paddle' : 'awasezu'}`);
  }

  /** The ohitsu is taken up while the shari is being made; in service only once its batch is cut (till then the bar takes its rice from it). */
  private tubWanted(): boolean {
    if (this.serviceBatch) return shari.step === 'scoop' || shari.step === 'return';
    return shari.step !== 'done';
  }

  /** A pinch on the ohitsu: at its rim, wherever it stands. */
  private nearTub(p: Vector3): boolean {
    this.carry!.getWorldPosition(this.tmp);
    const dx = p.x - this.tmp.x;
    const dz = p.z - this.tmp.z;
    return dx * dx + dz * dz < (TUB_RADIUS + 0.05) ** 2 && Math.abs(p.y - (this.tmp.y + 0.04)) < 0.09;
  }

  private updateCarried(side: Side, delta: number): void {
    const what = this.carried[side];
    if (!what) return;
    const hand = hands.all[side];
    const g = hand.grasp;
    if (hand.tracked) {
      if (what === 'shamoji') {
        const yaw = (hand.yawDeg * Math.PI) / 180;
        this.shamoji.position.copy(g);
        this.shamoji.rotation.set(PADDLE_PITCH, yaw, 0, 'YXZ');
        const c = Math.cos(PADDLE_PITCH);
        this.blade.set(-c * Math.sin(yaw), Math.sin(PADDLE_PITCH), -c * Math.cos(yaw)).multiplyScalar(BLADE_REACH).add(g);
      } else if (what === 'awasezu') {
        this.awasezu.position.copy(g).add(this.offset[side]);
        this.pour(delta);
      } else {
        this.tubTo(this.tmp.copy(g).add(this.offset[side]));
      }
    }
    if (hand.tracked && !hand.pinchEnd) return;
    this.carried[side] = null;
    chef.hands[side].holding = Held.None;
    playPut();
    if (what === 'shamoji') {
      if (shari.loaded) {
        shari.loaded = false;
        this.lump.visible = false;
      }
      this.restShamoji();
    } else if (what === 'awasezu') {
      this.restAwasezu();
    } else {
      this.putTub(g);
    }
  }

  /** The awasezu bowl over the rice tips and pours. */
  private pour(delta: number): void {
    const over = shari.step === 'vinegar' && this.overHangiri(this.awasezu.position, 0.03) && this.awasezu.position.y < SINK_TOP + 0.45;
    // Its lip faces away from the chef (+Z): tipped that way, it pours from the lip straight down.
    this.awasezu.rotation.x = over ? 0.95 : 0;
    this.stream.visible = over;
    if (!over) return;
    const riceTop = SINK_TOP + 0.014 + RICE_MOUND_HEIGHT;
    this.stream.position.set(0, 0.07, -0.075);
    this.stream.scale.y = Math.max(0.02, this.awasezu.position.y - 0.02 - riceTop);
    this.stream.rotation.x = 0.95;
    this.poured += delta;
    if (this.poured < AWASEZU_SECONDS) return;
    shari.step = 'cut';
    this.vinegar.visible = false;
    this.stream.visible = false;
    this.awasezu.rotation.x = 0;
    playDone();
    coach.done('pourAwasezu');
    console.log('[Shari] awasezu on: cut it through with the paddle');
  }

  private overHangiri(p: Vector3, margin: number): boolean {
    const dx = p.x - HANGIRI_X;
    const dz = p.z - HANGIRI_Z;
    return dx * dx + dz * dz < (HANGIRI_RADIUS - margin) ** 2 && p.y > SINK_TOP;
  }

  /** The ohitsu's tub (with its rice) to a world point (its rice line). */
  private tubTo(world: Vector3): void {
    const local = this.tubRoot!.worldToLocal(this.tmp.copy(world));
    this.carry!.position.copy(local);
  }

  /** Let go: set down on the work table beside the hangiri, or back on its stand; anywhere else it goes back where it was. */
  private putTub(at: Vector3): void {
    const dt = Math.hypot(at.x - TUB_ON_TABLE_X, at.z - TUB_ON_TABLE_Z);
    const dh = Math.hypot(at.x - shari.tubHomeAt.x, at.z - shari.tubHomeAt.z);
    if (dt < 0.2 && at.y > SINK_TOP - 0.05 && at.y < SINK_TOP + 0.45) {
      this.tubTo(shari.tubTableAt);
      shari.tubOnTable = true;
      coach.done('bringTub');
      console.log('[Shari] the ohitsu is on the work table');
      return;
    }
    if (dh > 0.3) console.log('[Shari] the ohitsu goes back on its stand');
    this.carry!.position.set(0, 0, 0);
    this.lid!.position.copy(this.lidClosed);
    shari.tubOnTable = false;
    if (shari.step === 'return') {
      shari.step = 'done';
      shari.inTub = true;
      coach.done('returnTub');
      feedback.flash(StationKind.RiceTub, COLOR_DONE);
      playDone();
      console.log(this.serviceBatch ? "[Shari] the ohitsu is back on its stand with the new batch" : '[Shari] the ohitsu is back on its stand, full: the shari is ready');
      this.finish(false);
    }
  }

  // ---- the paddle: cutting the rice, scooping it into the ohitsu ------------------------

  private riceTop(): number {
    const fill = 1 - shari.scoops / SHARI_SCOOPS;
    return SINK_TOP + 0.014 + (this.spread ? RICE_SPREAD_HEIGHT * fill : RICE_MOUND_HEIGHT);
  }

  private updateWork(): void {
    const held = this.carried.includes('shamoji');
    if (!held) {
      this.rub.reset();
      return;
    }
    const inRice = this.overHangiri(this.blade, 0.02) && this.blade.y < this.riceTop() + 0.03;
    if (shari.step === 'cut') {
      const d = this.rub.update(this.blade, inRice);
      if (d >= SHARI_CUT_DISTANCE / 2 && !this.spread) {
        this.spread = true;
        this.rice.geometry = riceGeometry('spread', 1);
        playRustle();
      }
      if (d < SHARI_CUT_DISTANCE) return;
      this.rub.reset();
      shari.step = 'scoop';
      playDone();
      coach.done('cutShari');
      console.log(`[Shari] cut through: ${shari.tubOnTable ? 'scoop it into the ohitsu' : 'bring the ohitsu over'}`);
      return;
    }
    if (shari.step !== 'scoop') return;
    if (!shari.loaded && inRice) {
      shari.loaded = true;
      this.lump.visible = true;
      playRustle();
      return;
    }
    if (!shari.loaded || !shari.tubOnTable) return;
    const dx = this.blade.x - TUB_ON_TABLE_X;
    const dz = this.blade.z - TUB_ON_TABLE_Z;
    if (dx * dx + dz * dz > (TUB_RADIUS - 0.02) ** 2 || this.blade.y > SINK_TOP + TUB_DEPTH + 0.14) return;
    shari.loaded = false;
    this.lump.visible = false;
    shari.scoops++;
    const fill = 1 - shari.scoops / SHARI_SCOOPS;
    this.rice.geometry = riceGeometry('spread', fill);
    this.rice.visible = fill > 0.01;
    // In service the scoops go on top of what the ohitsu still holds (followStock).
    if (this.serviceBatch) this.drawnFill = -1;
    else this.setTubFill(shari.scoops / SHARI_SCOOPS);
    playPut();
    coach.done('scoopShari');
    console.log(`[Shari] a scoop into the ohitsu (${shari.scoops}/${SHARI_SCOOPS})`);
    if (shari.scoops < SHARI_SCOOPS) return;
    shari.step = 'return';
    playDone();
    console.log('[Shari] all in: carry the ohitsu back to its stand');
  }

  // ---- done ----------------------------------------------------------------------

  /** The shari is in the ohitsu (or the prep was skipped, or the day closed on a batch in service): the hangiri and the paddle are washed and hung back up. */
  private finish(skipped: boolean): void {
    this.finished = true;
    // On full the ohitsu's shari is counted: the morning's cook (its rice already measured out, even if the prep was cut short), or (the prep skipped before the cooker was lit) a sho the cook made.
    if (!skipped || this.measured) addShari(this.batch);
    else if (cookRice(1)) addShari(1);
    this.drawnFill = -1;
    for (const side of SIDES) {
      if (!this.carried[side]) continue;
      this.carried[side] = null;
      chef.hands[side].holding = Held.None;
    }
    this.carry?.position.set(0, 0, 0);
    this.lid?.position.copy(this.lidClosed);
    this.setTubFill(1);
    shari.inTub = true;
    shari.tubOnTable = false;
    shari.step = 'done';
    for (const o of [this.hangiri, this.shamoji, this.awasezu, this.flame, this.label, this.amount1, this.amount15]) o.visible = false;
    this.findWallTools();
    for (const o of this.wallTools) o.visible = true;
    if (this.glowing && this.cookerObject) glowObject(this.cookerObject, null);
    if (!skipped && !this.serviceBatch) prepApi.taskDone('Shari');
    if (this.serviceBatch) console.log(`[Shari] the batch is in: ohitsu ${Math.round(pantry.tubGrams)} g`);
    this.serviceBatch = false;
  }

  private restShamoji(): void {
    this.shamoji.position.copy(this.shamojiHome);
    // Across the hangiri's near rim, the blade inside it, the handle toward the chef.
    this.shamoji.rotation.set(0, Math.PI, 0);
  }

  private restAwasezu(): void {
    this.awasezu.position.copy(this.awasezuHome);
    this.awasezu.rotation.set(0, Math.PI, 0);
    this.stream.visible = false;
  }

  private hints(): void {
    if (shari.step === 'turnOut' || shari.step === 'light' || shari.step === 'soak') return;
    if (shari.step === 'scoop' && !shari.tubOnTable && !shari.tubHeld) feedback.hints.add(StationKind.RiceTub);
  }
}
