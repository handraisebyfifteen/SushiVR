import { Box3, createSystem, Group, type Object3D, type Sprite, Vector3 } from '@iwsdk/core';
import { coach, type Grade } from './coach.js';
import { debugLines } from './debug.js';
import { COLOR_DONE, feedback } from './feedback.js';
import { fishOrder, fractionOf, kohadaSaltMinutes, todaysMaterials } from './fish-order.js';
import { chef, cure, type CureNext, prep } from './game-state.js';
import { hands } from './hands.js';
import {
  BACK_ROW_Z,
  KOHADA_TRAY_D,
  KOHADA_TRAY_W,
  KOHADA_TRAY_X,
  KOHADA_TRAY_Z,
  SABA_TRAY_D,
  SABA_TRAY_W,
  SABA_TRAY_X,
  SABA_TRAY_Z,
  SALT_BOWL_X,
  SALT_BOWL_Z,
  SINK_BASIN_X,
  SINK_FRONT_RIM,
  SINK_TOP,
  VINEGAR_X,
  VINEGAR_Z,
} from './layout.js';
import { NETA, type NetaId } from './menu.js';
import type { PrepId } from './prep.js';
import { cureApi, prepApi } from './prep-api.js';
import { createSaltBowl, createTray, createVinegarBottle, SALT_OPACITY, VINEGAR_NECK } from './scene-assets/lib/cure-look.js';
import { createWaterStream } from './scene-assets/lib/fillet-look.js';
import { playDone, playPick, playPut } from './sfx.js';
import { overStation, stations } from './station-system.js';
import { CaseItem, Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import {
  CURE_MINUTE_SECONDS,
  CURE_RINSE_SECONDS,
  KOHADA_VINEGAR_MINUTES,
  PREP_YIELD_LOSS,
  SABA_SALT_MINUTES,
  SABA_VINEGAR_MINUTES,
  SALT_PINCHES,
  VINEGAR_POUR_SECONDS,
} from './tuning.js';

type TrayId = 'Kohada' | 'Saba';
const TRAYS: readonly TrayId[] = ['Saba', 'Kohada'];
type State = 'empty' | 'laid' | 'salted' | 'rinsed' | 'vinegar' | 'done';
type Side = 0 | 1;

interface Tray {
  id: TrayId;
  neta: NetaId;
  group: Group;
  home: Vector3;
  W: number;
  D: number;
  salt: Object3D;
  vinegar: Object3D;
  label: Sprite;
  labelText: string;
  parts: Object3D[];
  /** Each part's place in the tray (tray-local), to put them back. */
  laidAt: Vector3[];
  state: State;
  /** Shop minutes in the salt or the vinegar so far. */
  minutes: number;
  pinches: number;
  rinse: number;
  pour: number;
  saltGrade: Grade | null;
  vinegarGrade: Grade | null;
  /** Ordered today (on its way, or already here). */
  coming: boolean;
}

/** Minutes before a tray's time when the master calls the chef over to be ready. */
const CURE_READY_MINUTES = 6;
/** A pinch this close takes salt, the tray's rim, the bottle's neck (generous: the pinch point moves as the fingers close). */
const TAKE = 0.1;
/** The tap's water falls here (world): over the basin's front, in front of the wash board's spout. */
const TAP = new Vector3(SINK_BASIN_X, SINK_TOP + 0.21, BACK_ROW_Z + SINK_FRONT_RIM + 0.08);
const UNDER_TAP = 0.13;

/**
 * The full difficulty's curing (締め), the owner's shop: on the drainboard
 * beside the sink, the kohada's tray in front and the saba's behind, the salt
 * bowl and the vinegar bottle beside them. Each fish, once filleted (the
 * saba) or opened (the kohada), is laid in its tray (src/prep-cut-system.ts
 * hands it over), then:
 *  1. salted: a pinch of salt from the bowl, the fingers opened over the
 *     tray, a few times (the saba is buried in it);
 *  2. left in the salt: kohada about 40 minutes, five more or less with the
 *     day's size (the fish shop says it); saba 2-3 hours. Shop minutes run
 *     at one a second; a label over the tray counts them;
 *  3. rinsed: the tray's front rim pinched, carried under the tap and held
 *     there till the salt is gone, then let go (it goes back);
 *  4. vinegared: the bottle pinched at its neck and held over the tray till
 *     it is poured; kohada 20 minutes, saba 30;
 *  5. taken out (a pinch over the fish) and let go over the case.
 * How near the salt and the vinegar came to their times grades it, and a
 * poor grade costs pieces, as a crooked cut does.
 */
export class CureSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private trays: Tray[] = [];
  private bowl: Group | null = null;
  private bottle: Group | null = null;
  private readonly bottleHome = new Vector3(VINEGAR_X, SINK_TOP, VINEGAR_Z);
  private water: Object3D | null = null;
  private built = false;
  private readonly saltIn: [boolean, boolean] = [false, false];
  private trayHand: { side: Side; tray: Tray; offset: Vector3 } | null = null;
  private bottleHand: { side: Side; offset: Vector3 } | null = null;
  private fishHand: { side: Side; tray: Tray; holder: Group; offset: Vector3 } | null = null;
  private holder!: Group;
  private readonly caseItems = new Map<NetaId, Object3D>();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly box = new Box3();

  init(): void {
    this.holder = this.world.createTransformEntity().object3D as Group;
    this.holder.name = 'CureHeld';
    this.cleanupFuncs.push(this.queries.items.subscribe('qualify', (e) => this.seeItem(e.getValue(CaseItem, 'neta') as NetaId, e.object3D)));
    for (const e of this.queries.items.entities) this.seeItem(e.getValue(CaseItem, 'neta') as NetaId, e.object3D);
    cureApi.lay = (id, parts, at) => this.lay(id, parts, at);
    cureApi.trayAt = (id, out) => {
      const tray = this.trays.find((t) => t.id === id);
      if (!tray) return false;
      out.copy(tray.home).add(this.tmp.set(0, 0.02, 0));
      return true;
    };
    debugLines.push(() =>
      this.built && prep.active
        ? `Cure: ${this.trays.map((t) => `${t.id} ${t.state}${t.state === 'salted' || t.state === 'vinegar' ? ` ${Math.floor(t.minutes)}min` : ''}`).join(' | ')} | next ${cure.next ?? '-'} ${cure.tray}`
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
    const make = (id: TrayId, x: number, z: number, W: number, D: number): Tray => {
      const group = createTray(W, D);
      group.position.set(x, SINK_TOP, z);
      this.world.createTransformEntity(group);
      const label = makeTextSprite(' ', { width: 0.26 });
      label.visible = false;
      label.position.set(x, SINK_TOP + 0.16, z);
      this.world.createTransformEntity(label);
      return {
        id, neta: id === 'Kohada' ? 'Kohada' : 'CuredMackerel', group, home: group.position.clone(), W, D,
        salt: group.getObjectByName('Salt')!, vinegar: group.getObjectByName('Vinegar')!, label, labelText: '',
        parts: [], laidAt: [], state: 'empty', minutes: 0, pinches: 0, rinse: 0, pour: 0, saltGrade: null, vinegarGrade: null,
        coming: today.includes(id),
      };
    };
    this.trays = [make('Kohada', KOHADA_TRAY_X, KOHADA_TRAY_Z, KOHADA_TRAY_W, KOHADA_TRAY_D), make('Saba', SABA_TRAY_X, SABA_TRAY_Z, SABA_TRAY_W, SABA_TRAY_D)];
    this.bowl = createSaltBowl();
    this.bowl.position.set(SALT_BOWL_X, SINK_TOP, SALT_BOWL_Z);
    this.world.createTransformEntity(this.bowl);
    this.bottle = createVinegarBottle();
    this.bottle.position.copy(this.bottleHome);
    this.world.createTransformEntity(this.bottle);
    this.water = createWaterStream(TAP.y - SINK_TOP - 0.02);
    this.water.position.copy(TAP);
    this.water.visible = false;
    this.world.createTransformEntity(this.water);
    console.log(`[Cure] the drainboard is set: ${this.trays.filter((t) => t.coming).map((t) => t.id.toLowerCase()).join(' and ')}`);
  }

  /** Into its tray: the parts keep their layout, centred and fitted on the tray's floor. */
  private lay(id: PrepId, parts: Object3D[], at: Vector3): boolean {
    const tray = this.trays.find((t) => t.id === id);
    if (!tray || tray.state !== 'empty') return false;
    if (Math.abs(at.x - tray.home.x) > tray.W / 2 + 0.06 || Math.abs(at.z - tray.home.z) > tray.D / 2 + 0.06 || at.y > tray.home.y + 0.35) return false;
    this.box.makeEmpty();
    for (const p of parts) {
      p.visible = true;
      this.box.expandByObject(p, true);
    }
    const centre = this.box.getCenter(new Vector3());
    const size = this.box.getSize(new Vector3());
    const fit = Math.min(1, (tray.W - 0.014) / Math.max(0.01, size.x), (tray.D - 0.014) / Math.max(0.01, size.z));
    const floor = this.box.min.y;
    tray.parts = parts;
    tray.laidAt = [];
    for (const p of parts) {
      tray.group.attach(p);
      // Tray-local: about the tray's middle, squeezed to fit, resting on its floor.
      const local = tray.group.worldToLocal(centre.clone());
      p.position.x = (p.position.x - local.x) * fit;
      p.position.z = (p.position.z - local.z) * fit;
      p.position.y += 0.0016 - (tray.group.worldToLocal(this.tmp.set(0, floor, 0)).y);
      tray.laidAt.push(p.position.clone());
    }
    tray.state = 'laid';
    playPut();
    feedback.flash(StationKind.Sink, COLOR_DONE);
    coach.done('layCure');
    console.log(`[Cure] the ${id.toLowerCase()} are in their tray: salt them`);
    return true;
  }

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
    if (!this.trays.length) {
      this.publish();
      return;
    }
    const minutes = delta / CURE_MINUTE_SECONDS;
    for (const tray of this.trays) if (tray.state === 'salted' || tray.state === 'vinegar') tray.minutes += minutes;
    for (const side of [0, 1] as const) this.updateHand(side);
    this.updateTray(delta);
    this.updateBottle(delta);
    this.updateFish();
    for (const tray of this.trays) this.updateLabel(tray);
    this.publish();
  }

  /** A pinch starting: salt from the bowl, the tray's rim, the bottle's neck, the fish out of the vinegar. A pinch ending: salt sprinkled. */
  private updateHand(side: Side): void {
    const hand = hands.all[side];
    if (!hand?.tracked) return;
    const at = hand.grasp;
    if (hand.pinchEnd && this.saltIn[side]) {
      this.saltIn[side] = false;
      const tray = this.trays.find((t) => t.state === 'laid' && this.over(t, at, 0.3));
      if (tray) this.sprinkle(tray);
      return;
    }
    if (!hand.pinchStart || chef.hands[side].holding !== Held.None || !chef.facingBack) return;
    if (this.bowl && this.trays.some((t) => t.state === 'laid') && at.distanceTo(this.tmp.copy(this.bowl.position).add(this.tmp2.set(0, 0.03, 0))) < TAKE) {
      this.saltIn[side] = true;
      playPick();
      return;
    }
    if (!this.trayHand) {
      for (const tray of this.trays) {
        if (tray.state !== 'salted') continue;
        if (at.distanceTo(this.rim(tray, this.tmp)) < TAKE) {
          this.trayHand = { side, tray, offset: tray.group.position.clone().sub(at) };
          chef.hands[side].holding = Held.Saku;
          playPick();
          return;
        }
      }
    }
    if (this.bottle && !this.bottleHand && this.trays.some((t) => t.state === 'rinsed') && at.distanceTo(this.tmp.copy(this.bottleHome).add(this.tmp2.set(0, VINEGAR_NECK - 0.02, 0))) < TAKE) {
      this.bottleHand = { side, offset: this.bottle.position.clone().sub(at) };
      chef.hands[side].holding = Held.Saku;
      playPick();
      return;
    }
    if (!this.fishHand) {
      const tray = this.trays.find((t) => t.state === 'vinegar' && this.over(t, at, 0.1));
      if (tray) this.takeOut(side, tray);
    }
  }

  /** Over a tray's floor (within its sides, up to `high` above it). */
  private over(tray: Tray, at: Vector3, high: number): boolean {
    return Math.abs(at.x - tray.home.x) < tray.W / 2 + 0.02 && Math.abs(at.z - tray.home.z) < tray.D / 2 + 0.02 && at.y > tray.home.y - 0.02 && at.y < tray.home.y + high;
  }

  private rim(tray: Tray, out: Vector3): Vector3 {
    return out.copy(tray.group.position).add(this.tmp2.set(0, 0.026, tray.D / 2));
  }

  private sprinkle(tray: Tray): void {
    tray.pinches++;
    const need = SALT_PINCHES[tray.id];
    tray.salt.visible = true;
    const material = (tray.salt as unknown as { material: { opacity: number } }).material;
    material.opacity = SALT_OPACITY * Math.min(1, tray.pinches / need);
    playPut();
    if (tray.pinches < need) return;
    tray.state = 'salted';
    tray.minutes = 0;
    coach.done('saltCure');
    console.log(`[Cure] the ${tray.id.toLowerCase()} are salted (${this.saltWords(tray)})`);
  }

  /** The tray in a hand: it follows; held under the tap long enough, the salt is washed off; let go, it goes back. */
  private updateTray(delta: number): void {
    const h = this.trayHand;
    if (this.water) this.water.visible = false;
    if (!h) return;
    const hand = hands.all[h.side];
    const tray = h.tray;
    // Let go only when the fingers open (a hand lost for a moment, in a turn's blink, keeps hold).
    if (!hand?.tracked) return;
    if (hand.pinchEnd) {
      tray.group.position.copy(tray.home);
      this.trayHand = null;
      chef.hands[h.side].holding = Held.None;
      playPut();
      return;
    }
    tray.group.position.copy(hand.grasp).add(h.offset);
    const under = Math.hypot(tray.group.position.x - TAP.x, tray.group.position.z - TAP.z) < UNDER_TAP && tray.group.position.y < TAP.y;
    if (!under || tray.state !== 'salted') return;
    if (this.water) this.water.visible = true;
    tray.rinse += delta;
    const material = (tray.salt as unknown as { material: { opacity: number } }).material;
    material.opacity = SALT_OPACITY * Math.max(0, 1 - tray.rinse / CURE_RINSE_SECONDS);
    if (tray.rinse < CURE_RINSE_SECONDS) return;
    tray.salt.visible = false;
    tray.saltGrade = this.gradeSalt(tray);
    console.log(`[Cure] the ${tray.id.toLowerCase()} rinsed after ${Math.round(tray.minutes)} min in the salt: ${tray.saltGrade}`);
    tray.state = 'rinsed';
    tray.minutes = 0;
    playDone();
    coach.done('rinseCure');
  }

  /** The bottle in a hand: over a rinsed tray it tips and pours; poured long enough, the fish are in vinegar. Let go, it stands back. */
  private updateBottle(delta: number): void {
    const h = this.bottleHand;
    const bottle = this.bottle;
    if (!h || !bottle) return;
    const hand = hands.all[h.side];
    if (!hand?.tracked) return;
    if (hand.pinchEnd) {
      bottle.position.copy(this.bottleHome);
      bottle.rotation.set(0, 0, 0);
      this.bottleHand = null;
      chef.hands[h.side].holding = Held.None;
      playPut();
      return;
    }
    bottle.position.copy(hand.grasp).add(h.offset);
    const tray = this.trays.find((t) => t.state === 'rinsed' && Math.abs(bottle.position.x - t.home.x) < t.W / 2 + 0.06 && Math.abs(bottle.position.z - t.home.z) < t.D / 2 + 0.06);
    bottle.rotation.z = tray ? 1.9 : 0;
    if (!tray) return;
    tray.pour += delta;
    tray.vinegar.visible = true;
    tray.vinegar.scale.y = Math.min(1, tray.pour / VINEGAR_POUR_SECONDS);
    if (tray.pour < VINEGAR_POUR_SECONDS) return;
    tray.state = 'vinegar';
    tray.minutes = 0;
    playDone();
    coach.done('vinegarCure');
    console.log(`[Cure] the ${tray.id.toLowerCase()} are in the vinegar (${this.vinegarMinutes(tray)} min)`);
  }

  /** Out of the vinegar: the fish come up in the hand, graded on their time in it. */
  private takeOut(side: Side, tray: Tray): void {
    const hand = hands.all[side];
    tray.vinegarGrade = this.gradeVinegar(tray);
    console.log(`[Cure] the ${tray.id.toLowerCase()} out after ${Math.round(tray.minutes)} min in the vinegar: ${tray.vinegarGrade}`);
    this.holder.position.copy(hand.grasp);
    for (const p of tray.parts) this.holder.attach(p);
    this.fishHand = { side, tray, holder: this.holder, offset: new Vector3() };
    chef.hands[side].holding = Held.Saku;
    playPick();
  }

  /** The fish in a hand follow it; let go over the case they are stocked, elsewhere they go back in the vinegar. */
  private updateFish(): void {
    const h = this.fishHand;
    if (!h) return;
    const hand = hands.all[h.side];
    const tray = h.tray;
    if (!hand?.tracked) return;
    if (!hand.pinchEnd) {
      h.holder.position.copy(hand.grasp);
      return;
    }
    this.fishHand = null;
    chef.hands[h.side].holding = Held.None;
    if (overStation(hand.grasp, StationKind.NetaCase)) {
      this.stock(tray);
      return;
    }
    tray.parts.forEach((p, i) => {
      tray.group.add(p);
      p.position.copy(tray.laidAt[i]);
    });
    playPut();
  }

  private stock(tray: Tray): void {
    for (const p of tray.parts) p.visible = false;
    tray.vinegar.visible = false;
    tray.state = 'done';
    const full = Math.round(NETA[tray.neta].stock * fractionOf(tray.id));
    const loss = PREP_YIELD_LOSS[tray.saltGrade ?? 'Good'] + PREP_YIELD_LOSS[tray.vinegarGrade ?? 'Good'];
    const stock = Math.max(Math.ceil(full / 2), full - loss);
    prepApi.stock(tray.neta, stock);
    feedback.flash(StationKind.NetaCase, COLOR_DONE);
    playDone();
    coach.done('cureOut');
    console.log(`[Cure] the ${tray.id.toLowerCase()} are in the case: salt ${tray.saltGrade}, vinegar ${tray.vinegarGrade} (${stock} of ${full})`);
    prepApi.taskDone(tray.id);
  }

  /** The salt's aim: the kohada's day time, the saba's 2-3 hours (its middle, for the master). */
  private saltAim(tray: Tray): number {
    return tray.id === 'Kohada' ? kohadaSaltMinutes() : (SABA_SALT_MINUTES[0] + SABA_SALT_MINUTES[1]) / 2;
  }

  private vinegarMinutes(tray: Tray): number {
    return tray.id === 'Kohada' ? KOHADA_VINEGAR_MINUTES : SABA_VINEGAR_MINUTES;
  }

  /** Kohada within 3 minutes of their time is right; saba anywhere in its 2-3 hours. */
  private gradeSalt(tray: Tray): Grade {
    const m = tray.minutes;
    const off = tray.id === 'Kohada' ? Math.abs(m - kohadaSaltMinutes()) : Math.max(0, SABA_SALT_MINUTES[0] - m, m - SABA_SALT_MINUTES[1]);
    const [e, g, p] = tray.id === 'Kohada' ? [3, 6, 10] : [0, 15, 30];
    return off <= e ? 'Excellent' : off <= g ? 'Good' : off <= p ? 'Poor' : 'Bad';
  }

  private gradeVinegar(tray: Tray): Grade {
    const off = Math.abs(tray.minutes - this.vinegarMinutes(tray));
    const [e, g, p] = tray.id === 'Kohada' ? [3, 6, 10] : [4, 8, 12];
    return off <= e ? 'Excellent' : off <= g ? 'Good' : off <= p ? 'Poor' : 'Bad';
  }

  private saltWords(tray: Tray): string {
    if (tray.id === 'Saba') return 'saba: 2-3 hours';
    const size = fishOrder.kohadaSize < 0 ? 'small' : fishOrder.kohadaSize > 0 ? 'large' : 'middling';
    return `kohada, ${size}: about ${kohadaSaltMinutes()} min`;
  }

  /** Over each tray at work: what it is in and for how long (shop minutes). */
  private updateLabel(tray: Tray): void {
    const m = Math.floor(tray.minutes);
    const name = tray.id === 'Kohada' ? 'Kohada' : 'Saba';
    const text =
      tray.state === 'salted' ? `${name}: salt ${m} min` : tray.state === 'vinegar' ? `${name}: vinegar ${m} min` : tray.state === 'laid' ? `${name}: salt ${tray.pinches}/${SALT_PINCHES[tray.id]}` : '';
    if (text === tray.labelText) return;
    tray.labelText = text;
    tray.label.visible = !!text;
    if (text) setSpriteText(tray.label, text);
  }

  /** What the drainboard wants next, for the master and practice mode. */
  private publish(): void {
    cure.saltHeld = this.saltIn[0] || this.saltIn[1];
    cure.trayHeld = !!this.trayHand;
    cure.bottleHeld = !!this.bottleHand;
    cure.fishHeld = !!this.fishHand;
    let next: CureNext | null = null;
    let tray: Tray | undefined;
    if (this.fishHand) {
      next = 'case';
      tray = this.fishHand.tray;
    } else if (this.trayHand) {
      tray = this.trayHand.tray;
      next = tray.state === 'salted' ? 'rinse' : 'back';
    } else if (this.bottleHand) {
      next = 'vinegar';
      tray = this.trays.find((t) => t.state === 'rinsed');
    } else if (cure.saltHeld) {
      next = 'salt';
      tray = this.trays.find((t) => t.state === 'laid');
    } else {
      for (const id of TRAYS) {
        const t = this.trays.find((x) => x.id === id);
        if (!t) continue;
        let n: CureNext | null = null;
        if (t.state === 'laid') n = 'salt';
        else if (t.state === 'salted') n = this.timed(t.minutes, this.saltAim(t), 'rinse');
        else if (t.state === 'rinsed') n = 'vinegar';
        else if (t.state === 'vinegar') n = this.timed(t.minutes, this.vinegarMinutes(t), 'out');
        if (n && (!next || this.rank(n) > this.rank(next))) {
          next = n;
          tray = t;
        }
      }
    }
    cure.next = next;
    cure.tray = tray?.id ?? '';
    cure.wanted = !!next && next !== 'wait' && next !== 'case';
    cure.left = tray ? Math.ceil((tray.state === 'salted' ? this.saltAim(tray) : this.vinegarMinutes(tray)) - tray.minutes) : 0;
    cure.say = '';
    if (tray) {
      tray.group.getWorldPosition(cure.trayAt);
      cure.trayAt.y += 0.02;
      this.rim(tray, cure.rimAt);
      const left = Math.max(0, Math.ceil((tray.state === 'salted' ? this.saltAim(tray) : this.vinegarMinutes(tray)) - tray.minutes));
      const name = tray.id === 'Kohada' ? 'kohada' : 'saba';
      cure.say =
        next === 'salt' ? `Salt the ${name}: a pinch from the bowl, over the tray (${tray.pinches + 1} of ${SALT_PINCHES[tray.id]})`
        : next === 'rinse' ? `The ${name} have had their salt (${this.saltWords(tray)}): rinse it off under the tap`
        : next === 'back' ? 'Put the tray back'
        : next === 'vinegar' ? `Pour the vinegar over the ${name}`
        : next === 'out' ? `The ${name} are done: out of the vinegar, into the case`
        : next === 'case' ? `Into the case`
        : next === 'soon' ? `Get ready: the ${name} come out of the ${tray.state === 'salted' ? 'salt' : 'vinegar'} in ${left} min`
        : `The ${name}: about ${left} min more`;
      const item = this.caseItems.get(tray.neta);
      if (item) item.getWorldPosition(cure.caseAt);
    }
    if (this.bowl) cure.bowlAt.copy(this.bowl.position).add(this.tmp.set(0, 0.03, 0));
    cure.bottleAt.copy(this.bottleHome).add(this.tmp.set(0, VINEGAR_NECK - 0.02, 0));
    cure.tapAt.copy(TAP).add(this.tmp.set(0, -0.12, 0));
  }

  /** Its time: due (the action), close (get ready at the drainboard: a few minutes before), or not yet. */
  private timed(minutes: number, aim: number, due: CureNext): CureNext {
    return minutes >= aim ? due : minutes >= aim - CURE_READY_MINUTES ? 'soon' : 'wait';
  }

  /** Which of two trays' wants comes first: one due, then one close, then waiting. */
  private rank(n: CureNext): number {
    return n === 'wait' ? 0 : n === 'soon' ? 1 : 2;
  }

  /** The bar opens: the drainboard is cleared. */
  private clearAway(): void {
    this.built = false;
    for (const t of this.trays) {
      t.group.visible = false;
      t.label.visible = false;
    }
    if (this.bowl) this.bowl.visible = false;
    if (this.bottle) this.bottle.visible = false;
    if (this.water) this.water.visible = false;
    this.trays = [];
    // Kept from re-building: nothing is delivered after the opening.
    this.built = true;
  }
}
