import { createSystem, type Entity, type Mesh, type MeshStandardMaterial, type Object3D, type Sprite, Vector3 } from '@iwsdk/core';
import { coach, type Grade } from './coach.js';
import { debugLines } from './debug.js';
import { COLOR_DONE, COLOR_WARN, feedback } from './feedback.js';
import { type BurnerView, chef, prep, range, type Side } from './game-state.js';
import { hands, RubTracker } from './hands.js';
import { MANAITA_TOP, MANAITA_Z, NET_HOOK_Y, NET_HOOK_Z, RANGE_HEIGHT, ROOM_END_X, SINK_UNIT_Z, STOVE_X, WALL_THICKNESS } from './layout.js';
import { NETA, type NetaId } from './menu.js';
import { prepApi, rangeApi } from './prep-api.js';
import type { PrepId } from './prep.js';
import {
  BELLY_FACES,
  BELLY_LENGTH,
  BELLY_RINGS_Z,
  createFlame,
  createKnobMark,
  createNet,
  createPot,
  POT_SPECS,
  type PotId,
  type SearBelly,
  searBelly,
  type Tint,
} from './scene-assets/lib/range-look.js';
import { playDone, playPick, playPress, playPut, playWarn } from './sfx.js';
import { overStation, stations } from './station-system.js';
import { CaseItem, Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import {
  ABALONE_REDUCE_SECONDS,
  CHILL_SECONDS,
  EEL_BAND,
  EEL_BOIL_BAD,
  EEL_BOIL_POOR,
  EEL_SECONDS,
  HEAT_RATE,
  KANPYO_REDUCE_SECONDS,
  LOW_FLAME_TEMP,
  OCTOPUS_OVER_BAD,
  OCTOPUS_OVER_POOR,
  OCTOPUS_SECONDS,
  POT_START_TEMP,
  PREP_STAGE,
  PREP_YIELD_LOSS,
  REDUCED_LEVEL,
  RUB_WIPE_BOARD,
  SCORCH_SECONDS,
  SEAR_BURN_FACTOR,
  SEAR_SIDE_SECONDS,
  SEAR_SKIN_SECONDS,
  SKEWER_DISTANCE,
} from './tuning.js';

/** On the range (range-local x, z): the eel's wide pan back right and the gourd strips front right (seen facing it), the abalone back left, the octopus front left. */
const LAYOUT: Record<PotId, { bx: number; bz: number; knob: number }> = {
  SeaEel: { bx: -0.165, bz: 0.1, knob: -0.26 },
  Kanpyo: { bx: -0.165, bz: -0.1, knob: -0.13 },
  Octopus: { bx: 0.165, bz: -0.1, knob: 0.13 },
  Abalone: { bx: 0.165, bz: 0.1, knob: 0.26 },
};
const POTS: readonly PotId[] = ['Octopus', 'SeaEel', 'Kanpyo', 'Abalone'];
/** The grates' top, where a pot or the net stands. */
const GRATE_Y = RANGE_HEIGHT + 0.043;
const KNOB_Y = RANGE_HEIGHT - 0.115;
const KNOB_Z = SINK_UNIT_Z - 0.245 - 0.032;
/** A pinch this close to a knob turns it (the nearest one: they are 13 cm apart, nothing else is pinched down there). */
const KNOB_PICK = 0.09;
/**
 * A knob: a short pinch lights it on high, or puts it out. Kept pinched, it
 * turns down a notch (high, medium, low) after KNOB_HOLD and then every
 * KNOB_STEP; it stops at low. (Steady under hand tracking: nothing hangs
 * on how far the fingers move.)
 */
export const KNOB_HOLD = 0.35;
export const KNOB_STEP = 0.6;
const KNOB_ANGLE = [0, -Math.PI, (-3 * Math.PI) / 4, -Math.PI / 2];
const LEVEL_NAME = ['off', 'low', 'medium', 'high'];
/** Sear speed on the down face by flame level. */
const SEAR_RATE = [0, 0.25, 0.5, 1];
const SIDES: readonly Side[] = [0, 1];

interface Burner {
  id: PotId;
  pot: Object3D;
  liquidMesh: Mesh;
  bubbles: Object3D;
  flame: Mesh;
  mark: Mesh;
  label: Sprite;
  labelText: string;
  level: number;
  temp: number;
  liquid: number;
  state: BurnerView['state'];
  ing: Object3D | null;
  tints: Tint[];
  progress: number;
  /** Seconds boiled past done (octopus), boiling (eel), dry on the flame (reduced). */
  over: number;
  centre: Vector3;
  knob: Vector3;
  view: BurnerView;
}

type Carried = { kind: 'ing'; b: Burner } | { kind: 'net' } | { kind: 'belly' };

/**
 * The gas range in the morning prep (stage 3), from putting things in the
 * pot (the user's shop): the prepared octopus, conger eel, abalone and
 * gourd strips come in the fish shop's ice box; each goes into its own pot
 * on the range, and each burner's knob sets its flame (a pinch on the knob
 * moves it one click: off, high, medium, low, off).
 *  - Octopus: 炊く, at a rolling boil on a high flame; boiled on too long
 *    after it is done, it toughens.
 *  - Conger eel: 煮る with the broth held at 90 degrees (the thermometer
 *    over the pan); boiling breaks it up.
 *  - Gourd strips, abalone: 煮切る, boiled until the liquid is gone, then
 *    the flame off before they scorch.
 *  - Done and the flame off, each is taken out and let go over the case.
 *  - The bonito belly from the saku-taking waits on the ice: on the board
 *    the skewers go in through the skin side, then onto the grill net
 *    (taken from its hook by the range and set on a burner whose pot is
 *    done) skin down; pinch the skewers' rings to turn it a quarter, so each
 *    face sears (the skin chars, the sides change colour); then back on the
 *    ice to chill, on the board patted dry with paper, the skewers pulled
 *    out, into the case.
 * Every burner must be off before the bar opens.
 */
export class RangeSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private readonly burners: Burner[] = [];
  private readonly caseItems = new Map<NetaId, Entity>();
  private readonly carried: [Carried | null, Carried | null] = [null, null];
  private readonly offset = [new Vector3(), new Vector3()];
  private net!: Mesh;
  private readonly netHook = new Vector3(-ROOM_END_X + WALL_THICKNESS / 2 + 0.012, NET_HOOK_Y - 0.1, NET_HOOK_Z);
  private belly: SearBelly | null = null;
  private readonly sear = [0, 0, 0, 0];
  private chillLeft = 0;
  /** The skewers' bundle lying beside the belly on the board, before they go in. */
  private bundle: Object3D | null = null;
  private ringPinch: { side: Side; from: Vector3; palmY: number; mode: 'in' | 'out' | 'turn' } | null = null;
  private knobGrab: { side: Side; b: Burner; held: number; steps: number } | null = null;
  private readonly rub = new RubTracker(true);
  private cookware: Object3D | null = null;
  private active = false;
  private cleared = false;
  /** Where the belly lies on the board: right of the middle, clear of the paper box and the dishes at the back. */
  private readonly boardSpot = new Vector3(0.05, MANAITA_TOP, MANAITA_Z - 0.02);
  private readonly iceSpot = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();

  init(): void {
    this.cleanupFuncs.push(this.queries.items.subscribe('qualify', (e) => this.caseItems.set(e.getValue(CaseItem, 'neta') as NetaId, e)));
    for (const e of this.queries.items.entities) this.caseItems.set(e.getValue(CaseItem, 'neta') as NetaId, e);
    this.active = prep.active && PREP_STAGE >= 3;
    rangeApi.putIn = (id, root, at) => this.putIn(id, root, at);
    rangeApi.potAt = (id, out) => {
      const b = this.burners.find((x) => x.id === id);
      if (!b) return false;
      out.copy(b.centre);
      return true;
    };
    rangeApi.bellyOnIce = (at) => this.bellyOnIce(at);
    rangeApi.bellyByCook = () => {
      range.belly = 'done';
      if (this.belly) this.belly.root.visible = false;
    };
    if (!this.active) return;
    for (const id of POTS) this.burners.push(this.buildBurner(id));
    range.burners = this.burners.map((b) => b.view);
    this.net = createNet();
    this.world.createTransformEntity(this.net);
    this.hangNet();
    debugLines.push(() =>
      prep.active
        ? `Range: ${this.burners.map((b) => `${b.id} ${b.state} ${LEVEL_NAME[b.level]} ${Math.round(b.temp)}° ${Math.round(100 * b.liquid)}%`).join(' | ')} | belly ${range.belly}${range.belly === 'net' ? ` face ${range.bellyFace} ${this.sear.map((x) => x.toFixed(1)).join('/')}` : ''}`
        : '',
    );
  }

  private buildBurner(id: PotId): Burner {
    const { bx, bz, knob } = LAYOUT[id];
    const pot = createPot(id);
    pot.position.set(STOVE_X + bx, GRATE_Y, SINK_UNIT_Z + bz);
    this.world.createTransformEntity(pot);
    const flame = createFlame();
    flame.position.set(STOVE_X + bx, RANGE_HEIGHT + 0.03, SINK_UNIT_Z + bz);
    this.world.createTransformEntity(flame);
    const mark = createKnobMark();
    mark.position.set(STOVE_X + knob, KNOB_Y, KNOB_Z - 0.002);
    mark.rotation.y = Math.PI;
    this.world.createTransformEntity(mark);
    const label = makeTextSprite(' ', { width: 0.2 });
    label.position.set(STOVE_X + bx, GRATE_Y + POT_SPECS[id].height + 0.12, SINK_UNIT_Z + bz - 0.04);
    label.visible = false;
    this.world.createTransformEntity(label);
    const centre = new Vector3(STOVE_X + bx, GRATE_Y + POT_SPECS[id].depth, SINK_UNIT_Z + bz);
    const knobAt = new Vector3(STOVE_X + knob, KNOB_Y, KNOB_Z);
    const view: BurnerView = { id, level: 0, temp: POT_START_TEMP, liquid: 1, state: 'empty', net: false, want: '', target: 0, at: centre.clone(), knobAt: knobAt.clone() };
    return {
      id, pot, flame, mark, label, labelText: '',
      liquidMesh: pot.getObjectByName('Liquid') as Mesh,
      bubbles: pot.getObjectByName('Bubbles')!,
      level: 0, temp: POT_START_TEMP, liquid: 1, state: 'empty', ing: null, tints: [], progress: 0, over: 0,
      centre, knob: knobAt, view,
    };
  }

  update(delta: number): void {
    if (!this.active) return;
    if (!prep.active) {
      if (!this.cleared) this.clearAway();
      return;
    }
    this.cookware ??= this.findCookware();
    if (this.cookware) this.cookware.visible = false;
    for (const side of SIDES) {
      this.updateCarried(side);
      this.updatePick(side);
    }
    this.updateKnob(delta);
    for (const b of this.burners) this.simmer(b, delta);
    this.updateBelly(delta);
    this.publish();
  }

  private findCookware(): Object3D | null {
    let found: Object3D | null = null;
    this.world.scene.traverse((o) => {
      if (!found && o.name === 'Cookware') found = o;
    });
    return found;
  }

  // ---- the ingredients into their pots ------------------------------------------------

  /** A prepared ingredient let go: into its own pot when over it and the pot is waiting. */
  private putIn(id: PrepId, root: Object3D, at: Vector3): boolean {
    const b = this.burners.find((x) => x.id === id);
    if (!b) return false;
    if (b.state !== 'empty' || !this.overPot(b, at, 0.06)) {
      const other = this.burners.find((x) => x.state === 'empty' && this.overPot(x, at, 0.03));
      if (other) {
        playWarn();
        console.log(`[Range] that is the ${other.id === 'SeaEel' ? 'conger eel' : other.id.toLowerCase()}'s pot`);
      }
      return false;
    }
    b.ing = root;
    b.tints = (root.userData.tints as Tint[] | undefined) ?? [];
    b.state = 'cooking';
    b.progress = 0;
    b.over = 0;
    this.seat(b);
    playPut();
    coach.done('potIn');
    console.log(`[Range] the ${this.name(b)} ${b.id === 'Kanpyo' ? 'are' : 'is'} in the pot`);
    return true;
  }

  /** The ingredient sits in its pot (on the floor once the liquid boils down). */
  private seat(b: Burner): void {
    if (!b.ing) return;
    const top = (b.ing.userData.top as number | undefined) ?? 0.02;
    const y = GRATE_Y + 0.004 + Math.max(0, Math.min(POT_SPECS[b.id].depth - top * 0.6, POT_SPECS[b.id].depth * b.liquid - top * 0.4));
    b.ing.position.set(b.centre.x, y, b.centre.z);
  }

  private overPot(b: Burner, at: Vector3, margin: number): boolean {
    const r = POT_SPECS[b.id].radius + margin;
    const dx = at.x - b.centre.x;
    const dz = at.z - b.centre.z;
    return dx * dx + dz * dz < r * r && at.y > GRATE_Y && at.y < GRATE_Y + POT_SPECS[b.id].height + 0.3;
  }

  private name(b: Burner): string {
    return b.id === 'SeaEel' ? 'conger eel' : b.id === 'Kanpyo' ? 'gourd strips' : b.id.toLowerCase();
  }

  // ---- heat -------------------------------------------------------------------------

  /** One burner a frame: the heat, what it does to what is in the pot, and how it looks. */
  private simmer(b: Burner, delta: number): void {
    const hasPot = b.state !== 'out';
    if (hasPot) {
      // Off it cools; low settles at 90; medium and high bring it to the boil.
      if (b.level === 0) b.temp = Math.max(25, b.temp + HEAT_RATE[0] * delta);
      else if (b.level === 1) b.temp += Math.sign(LOW_FLAME_TEMP - b.temp) * Math.min(Math.abs(LOW_FLAME_TEMP - b.temp), (b.temp < LOW_FLAME_TEMP ? HEAT_RATE[1] : 0.8) * delta);
      else b.temp = Math.min(100, b.temp + HEAT_RATE[b.level] * delta);
    }
    const boiling = hasPot && b.level >= 2 && b.temp >= 99.5;
    if (b.state === 'cooking' || b.state === 'done') this.cook(b, delta, boiling);
    // Looks: the flame, the bubbles, the liquid's level, the colour of what cooks.
    b.flame.visible = b.level > 0;
    if (b.flame.visible) b.flame.scale.set(1, (0.35 + 0.22 * b.level) * (0.9 + 0.1 * Math.sin(performance.now() * 0.04 + b.centre.x * 30)), 1);
    b.mark.rotation.z = KNOB_ANGLE[b.level];
    if (hasPot) {
      const spec = POT_SPECS[b.id];
      b.liquidMesh.visible = b.liquid > 0.02;
      b.liquidMesh.position.y = Math.max(0.006, spec.depth * b.liquid);
      b.bubbles.visible = boiling && b.liquid > 0.02;
      if (b.bubbles.visible) b.bubbles.position.y = 0.002 * Math.sin(performance.now() * 0.05 + b.centre.z * 40);
      if (b.ing && b.state !== 'out' && !this.carried.some((c) => c?.kind === 'ing' && c.b === b)) this.seat(b);
    }
    this.label(b);
  }

  /** What the heat does: progress toward done, and the harm of too much. */
  private cook(b: Burner, delta: number, boiling: boolean): void {
    let done = false;
    let cookedness = 0;
    if (b.id === 'Octopus') {
      if (boiling && b.level === 3) {
        if (b.state === 'done') b.over += delta;
        else b.progress += delta;
      }
      done = b.progress >= OCTOPUS_SECONDS;
      cookedness = b.progress / OCTOPUS_SECONDS;
    } else if (b.id === 'SeaEel') {
      if (b.temp >= EEL_BAND[0] && b.temp <= EEL_BAND[1]) b.progress += delta;
      if (b.temp >= 99.5) b.over += delta;
      done = b.progress >= EEL_SECONDS;
      cookedness = b.progress / EEL_SECONDS;
    } else {
      // Boiled down: high twice as fast as medium; dry on the flame, it scorches.
      if (boiling || (b.liquid < REDUCED_LEVEL && b.level >= 2)) b.liquid = Math.max(0, b.liquid - (delta / (b.id === 'Kanpyo' ? KANPYO_REDUCE_SECONDS : ABALONE_REDUCE_SECONDS)) * (b.level === 3 ? 1 : 0.5));
      if (b.liquid <= 0 && b.level > 0) b.over += delta;
      done = b.liquid <= REDUCED_LEVEL;
      cookedness = 1 - b.liquid;
    }
    const scorched = (b.id === 'Kanpyo' || b.id === 'Abalone') && b.over > SCORCH_SECONDS;
    for (const t of b.tints) {
      t.material.color.copy(t.raw).lerp(t.cooked, scorched ? 1 : Math.min(1, cookedness));
      if (scorched) t.material.color.multiplyScalar(0.55);
    }
    if (done && b.state === 'cooking') {
      b.state = 'done';
      playDone();
      console.log(`[Range] the ${this.name(b)} ${b.id === 'Kanpyo' ? 'are' : 'is'} done: the flame off, then out into the case`);
    }
  }

  private grade(b: Burner): Grade {
    if (b.id === 'Octopus') return b.over > OCTOPUS_OVER_BAD ? 'Bad' : b.over > OCTOPUS_OVER_POOR ? 'Poor' : 'Excellent';
    if (b.id === 'SeaEel') return b.over > EEL_BOIL_BAD ? 'Bad' : b.over > EEL_BOIL_POOR ? 'Poor' : b.over > 0.5 ? 'Good' : 'Excellent';
    // Dry on the flame: a moment is nothing, then it catches, then it scorches.
    return b.over > SCORCH_SECONDS ? 'Bad' : b.over > SCORCH_SECONDS / 2 ? 'Poor' : b.over > 1 ? 'Good' : 'Excellent';
  }

  /** The word over each pot: the eel's thermometer, the octopus's boil, the liquid left. */
  private label(b: Burner): void {
    let text = '';
    if (b.state === 'cooking' || b.state === 'done' || (b.state === 'empty' && b.level > 0)) {
      const t = `${Math.round(b.temp)}°C`;
      if (b.id === 'SeaEel') {
        text = b.temp >= 99.5 ? `${t} boiling!` : b.state === 'done' ? `${t} done` : `${t} eel ${Math.round((100 * b.progress) / EEL_SECONDS)}%`;
      } else if (b.id === 'Octopus') {
        text = b.state === 'done' ? (b.level > 0 ? 'Done: flame off' : 'Done') : b.temp >= 99.5 && b.level === 3 ? `Boiling ${Math.round((100 * b.progress) / OCTOPUS_SECONDS)}%` : `${t}`;
      } else {
        text = b.over > SCORCH_SECONDS ? 'Scorched' : b.state === 'done' ? (b.level > 0 ? 'Liquid gone: off!' : 'Done') : `Liquid ${Math.round(100 * b.liquid)}%`;
      }
    }
    if (text === b.labelText) return;
    b.labelText = text;
    b.label.visible = text !== '';
    if (text) setSpriteText(b.label, text);
  }

  // ---- hands: knobs, taking out, the net, the belly -----------------------------------------

  private updatePick(side: Side): void {
    const hand = hands.all[side];
    if (!hand?.tracked || !hand.pinchStart || this.carried[side] || this.knobGrab?.side === side || chef.hands[side].holding !== Held.None || prep.carrying[side]) return;
    const g = hand.grasp;
    // A knob (the nearest within reach of the pinch): one click along.
    let near: Burner | null = null;
    let nearest = KNOB_PICK;
    for (const b of this.burners) {
      const d = g.distanceTo(b.knob);
      if (d < nearest) {
        nearest = d;
        near = b;
      }
    }
    if (near) {
      this.knobGrab = { side, b: near, held: 0, steps: 0 };
      return;
    }
    if (this.belly && this.pickBelly(side, g)) return;
    // What is done comes out of its pot, with the flame off.
    for (const b of this.burners) {
      if (b.state !== 'done' || !b.ing) continue;
      const dx = g.x - b.centre.x;
      const dz = g.z - b.centre.z;
      if (dx * dx + dz * dz > (POT_SPECS[b.id].radius + 0.02) ** 2 || g.y < GRATE_Y || g.y > GRATE_Y + POT_SPECS[b.id].height + 0.08) continue;
      if (b.level > 0) {
        feedback.flash(StationKind.NetaCase, COLOR_WARN);
        playWarn();
        console.log(`[Range] put out the flame under the ${this.name(b)} first`);
        return;
      }
      this.hold(side, { kind: 'ing', b }, b.ing.position);
      return;
    }
    // The grill net, from its hook or off an empty burner.
    if (range.belly !== 'net' && g.distanceTo(this.net.position) < 0.12) {
      if (range.netOn >= 0) this.burners[range.netOn].view.net = false;
      range.netOn = -1;
      this.hold(side, { kind: 'net' }, this.net.position);
    }
  }

  /** A knob in the fingers: kept pinched it turns down a notch at a time; let go quickly, it is lit on high or put out. */
  private updateKnob(delta: number): void {
    const k = this.knobGrab;
    if (!k) return;
    const hand = hands.all[k.side];
    k.held += delta;
    const want = k.held < KNOB_HOLD ? 0 : 1 + Math.floor((k.held - KNOB_HOLD) / KNOB_STEP);
    while (k.steps < want) {
      k.steps++;
      // Off lights on high first; then down toward low.
      k.b.level = k.b.level === 0 ? 3 : Math.max(1, k.b.level - 1);
      playPress();
    }
    if (hand.tracked && !hand.pinchEnd) return;
    this.knobGrab = null;
    if (k.steps === 0) {
      k.b.level = k.b.level === 0 ? 3 : 0;
      playPress();
    }
    coach.done('turnKnob');
    console.log(`[Range] ${k.b.view.net ? 'the net' : this.possessive(k.b)} flame: ${LEVEL_NAME[k.b.level]}`);
  }

  private possessive(b: Burner): string {
    return b.id === 'Kanpyo' ? "the gourd strips'" : `the ${this.name(b)}'s`;
  }

  private hold(side: Side, c: Carried, at: Vector3): void {
    this.carried[side] = c;
    if (c.kind === 'net') range.netHeld = true;
    if (c.kind === 'ing') {
      range.ingHeld = true;
      range.caseNeta = c.b.id;
    }
    if (c.kind === 'belly') range.caseNeta = 'BonitoBelly';
    this.caseItems.get(range.caseNeta as NetaId)?.object3D?.getWorldPosition(range.caseAt);
    chef.hands[side].holding = c.kind === 'net' ? Held.Net : Held.Saku;
    this.offset[side].copy(at).sub(hands.all[side].grasp);
    playPick();
  }

  /** A pinch on the belly or its skewers' rings: lift it, push the skewers in or pull them out, or turn it on the net. */
  private pickBelly(side: Side, g: Vector3): boolean {
    const belly = this.belly!;
    const onRings = g.distanceTo(range.ringsAt) < 0.09;
    // Anywhere along it (it lies along Z, 20 cm long).
    const b = range.bellyAt;
    const onBody = Math.abs(g.x - b.x) < 0.08 && Math.abs(g.z - b.z) < BELLY_LENGTH / 2 + 0.02 && g.y > b.y - 0.05 && g.y < b.y + 0.08;
    if (!onRings && !onBody) return false;
    if (chef.hands[side].needsWash && (range.belly === 'ice' || range.belly === 'board')) {
      feedback.flash(StationKind.IceBox, COLOR_WARN);
      coach.mistake('washFirst', StationKind.IceBox);
      console.log('[Range] wash your hands before touching the fish');
      return true;
    }
    switch (range.belly) {
      case 'board':
        if (!onRings) return false;
        this.ringPinch = { side, from: g.clone(), palmY: hands.all[side].palm.y, mode: 'in' };
        return true;
      case 'patted':
        if (!onRings) return false;
        this.ringPinch = { side, from: g.clone(), palmY: hands.all[side].palm.y, mode: 'out' };
        return true;
      case 'net':
        this.ringPinch = { side, from: g.clone(), palmY: hands.all[side].palm.y, mode: 'turn' };
        return true;
      case 'ice':
      case 'skewered':
      case 'chilled':
      case 'free':
        this.hold(side, { kind: 'belly' }, belly.root.position);
        range.bellyHeld = true;
        return true;
      default:
        return false;
    }
  }

  private updateCarried(side: Side): void {
    const c = this.carried[side];
    if (!c) return;
    const hand = hands.all[side];
    const at = this.tmp.copy(hand.grasp).add(this.offset[side]);
    if (hand.tracked) {
      if (c.kind === 'ing') c.b.ing!.position.copy(at);
      else if (c.kind === 'net') {
        this.net.position.copy(at);
        this.net.rotation.set(0, 0, 0);
      } else this.belly!.root.position.copy(at);
    }
    if (hand.tracked && !hand.pinchEnd) return;
    this.carried[side] = null;
    chef.hands[side].holding = Held.None;
    range.netHeld = this.carried.some((x) => x?.kind === 'net');
    range.ingHeld = this.carried.some((x) => x?.kind === 'ing');
    const g = hand.grasp;
    if (c.kind === 'ing') this.releaseIngredient(c.b, g);
    else if (c.kind === 'net') this.releaseNet(g);
    else {
      range.bellyHeld = false;
      this.releaseBelly(g);
    }
  }

  private releaseIngredient(b: Burner, at: Vector3): void {
    if (!this.overCase(at)) {
      this.seat(b);
      return;
    }
    const grade = this.grade(b);
    const neta = b.id as NetaId;
    const full = NETA[neta].stock;
    const stock = Math.max(Math.ceil(full / 2), full - PREP_YIELD_LOSS[grade]);
    prepApi.stock(neta, stock);
    b.ing!.visible = false;
    b.ing = null;
    this.putAway(b);
    feedback.flash(StationKind.NetaCase, COLOR_DONE);
    playPut();
    coach.done('potOut');
    console.log(`[Range] the ${this.name(b)} ${b.id === 'Kanpyo' ? 'are' : 'is'} in the case: ${grade} (${stock} of ${full})`);
    prepApi.taskDone(b.id);
  }

  /** Over the case, or just short of its place in it (its slot is at the case's near edge). */
  private overCase(at: Vector3): boolean {
    return overStation(at, StationKind.NetaCase) || (at.distanceTo(range.caseAt) < 0.1 && at.y > range.caseAt.y - 0.03);
  }

  /** Its pot is done with: put away, the burner free (for the net). */
  private putAway(b: Burner): void {
    b.state = 'out';
    b.pot.visible = false;
    b.label.visible = false;
    b.labelText = '';
  }

  private releaseNet(at: Vector3): void {
    for (const [i, b] of this.burners.entries()) {
      if (b.state !== 'out' || Math.hypot(at.x - b.centre.x, at.z - b.centre.z) > 0.13 || at.y > GRATE_Y + 0.35) continue;
      this.net.position.set(b.centre.x, GRATE_Y + 0.002, b.centre.z);
      b.view.net = true;
      range.netOn = i;
      playPut();
      coach.done('hangNet');
      console.log(`[Range] the net is on the ${b.id === 'Octopus' || b.id === 'Abalone' ? 'left' : 'right'} ${LAYOUT[b.id].bz < 0 ? 'front' : 'back'} burner`);
      return;
    }
    this.hangNet();
  }

  private hangNet(): void {
    this.net.position.copy(this.netHook);
    this.net.rotation.set(0, 0, Math.PI / 2);
    range.netOn = -1;
  }

  // ---- the bonito belly: skewers, the net, the ice, paper ---------------------------------

  /** Back on the ice after the saku-taking: it waits there to be skewered and seared. */
  private bellyOnIce(at: Vector3): void {
    if (!this.active) return;
    if (!this.belly) {
      this.belly = searBelly();
      this.world.createTransformEntity(this.belly.root);
    }
    this.iceSpot.copy(at);
    this.belly.root.position.copy(at);
    this.belly.root.visible = true;
    this.skewersAt(0);
    this.belly.skewers.visible = false;
    range.belly = 'ice';
    console.log('[Range] the bonito belly waits on the ice for its skewers and the net');
  }

  /** The skewers pushed in this far (0: just started into the skin at the near end, 1: right through). */
  private skewersAt(s: number): void {
    const k = this.belly!.skewers;
    k.position.z = (1 - s) * SKEWER_DISTANCE;
  }

  private releaseBelly(at: Vector3): void {
    const b = this.belly!;
    const state = range.belly;
    const toBoard = () => {
      b.root.position.copy(this.boardSpot);
      b.root.rotation.y = 0;
      b.body.rotation.z = 0;
    };
    const boardFree = overStation(at, StationKind.CuttingBoard) && !prep.onBoard;
    if (state === 'ice') {
      if (boardFree) {
        toBoard();
        range.belly = 'board';
        b.skewers.visible = true;
        this.skewersAt(0);
        playPut();
        console.log('[Range] the belly on the board: push the skewers in through the skin side');
      } else b.root.position.copy(this.iceSpot);
    } else if (state === 'skewered') {
      if (range.netOn >= 0 && Math.hypot(at.x - this.net.position.x, at.z - this.net.position.z) < 0.13 && at.y < this.net.position.y + 0.35) {
        b.root.position.set(this.net.position.x, this.net.position.y + 0.003, this.net.position.z);
        // Its rings toward the chef, who faces the range.
        b.root.rotation.y = Math.PI;
        range.belly = 'net';
        range.bellyFace = 0;
        b.body.rotation.z = 0;
        playPut();
        console.log('[Range] the belly on the net, skin down: sear it, turning it with the skewers');
      } else toBoard();
    } else if (state === 'net' || state === 'chilled' || state === 'free') {
      if (state === 'net' && overStation(at, StationKind.IceBox)) {
        b.root.position.copy(this.iceSpot);
        b.root.rotation.y = 0;
        b.body.rotation.z = 0;
        range.belly = 'chilling';
        this.chillLeft = CHILL_SECONDS;
        playPut();
        coach.done('chillBelly');
        console.log(`[Range] the seared belly chills on the ice${range.bellySeared ? '' : ' (not seared all round)'}`);
      } else if (state === 'chilled' && boardFree) {
        toBoard();
        range.belly = 'wet';
        this.rub.reset();
        playPut();
        console.log('[Range] chilled: pat it dry with paper');
      } else if (state === 'free' && this.overCase(at)) {
        this.stockBelly();
      } else if (state === 'net') {
        b.root.position.set(this.net.position.x, this.net.position.y + 0.003, this.net.position.z);
      } else if (state === 'chilled') {
        b.root.position.copy(this.iceSpot);
      } else toBoard();
    }
  }

  private updateBelly(delta: number): void {
    const b = this.belly;
    if (!b) return;
    this.updateRings();
    if (range.belly === 'net' && range.netOn >= 0) {
      const level = this.burners[range.netOn].level;
      const f = range.bellyFace;
      this.sear[f] += SEAR_RATE[level] * delta;
      range.faceDone = this.sear[f] >= this.need(f);
      this.showSear();
      const seared = this.sear.every((x, i) => x >= this.need(i));
      if (seared && !range.bellySeared) {
        playDone();
        console.log('[Range] seared all round: onto the ice');
      }
      range.bellySeared = seared;
    }
    if (range.belly === 'chilling') {
      this.chillLeft -= delta;
      if (this.chillLeft <= 0) {
        range.belly = 'chilled';
        playDone();
        console.log('[Range] chilled: onto the board to dry it');
      }
    }
    if (range.belly === 'wet') {
      for (const side of SIDES) {
        if (!prepApi.paperIn(side)) continue;
        const g = hands.all[side].grasp;
        const over = Math.abs(g.x - b.root.position.x) < 0.06 && Math.abs(g.z - b.root.position.z) < BELLY_LENGTH / 2 + 0.02 && g.y < b.root.position.y + 0.08;
        if (this.rub.update(g, over) < RUB_WIPE_BOARD) continue;
        prepApi.usePaper(side);
        range.belly = 'patted';
        playDone();
        coach.done('wipePaper');
        console.log('[Range] patted dry: pull the skewers out');
        break;
      }
    }
  }

  private need(face: number): number {
    return face === 0 ? SEAR_SKIN_SECONDS : SEAR_SIDE_SECONDS;
  }

  /** Each face's sear as it shows: the skin chars dark, the sides go pale; burnt, they go dark brown. */
  private showSear(): void {
    const b = this.belly!;
    for (let i = 0; i < 4; i++) {
      const m = b.sear[i] as MeshStandardMaterial;
      const k = this.sear[i] / this.need(i);
      m.opacity = Math.min(0.92, k * 0.92);
      if (i > 0 && k > SEAR_BURN_FACTOR) m.color.set('#4A2A1C');
    }
  }

  /** A pinch on the rings: pushed in, pulled out, or (on the net) a quarter turn, or lifted off. */
  private updateRings(): void {
    const p = this.ringPinch;
    if (!p) return;
    const hand = hands.all[p.side];
    const moved = this.tmp2.copy(hand.grasp).sub(p.from);
    if (p.mode === 'in' || p.mode === 'out') {
      const along = p.mode === 'in' ? -moved.z : moved.z;
      const s = Math.max(0, Math.min(1, along / SKEWER_DISTANCE));
      this.skewersAt(p.mode === 'in' ? s : 1 - s);
      if (s >= 1) {
        this.ringPinch = null;
        if (p.mode === 'in') {
          range.belly = 'skewered';
          coach.done('skewer');
          console.log('[Range] skewered through the skin side: onto the net');
        } else {
          this.belly!.skewers.visible = false;
          range.belly = 'free';
          coach.done('unskewer');
          console.log('[Range] the skewers are out: into the case');
        }
        playDone();
        return;
      }
      if (hand.tracked && !hand.pinchEnd) return;
      this.ringPinch = null;
      return;
    }
    // On the net: raised, it is lifted off; let go where it was, a quarter turn.
    if (hand.palm.y - p.palmY > 0.06 && hand.tracked && !hand.pinchEnd) {
      this.ringPinch = null;
      this.hold(p.side, { kind: 'belly' }, this.belly!.root.position);
      range.bellyHeld = true;
      return;
    }
    if (hand.tracked && !hand.pinchEnd) return;
    this.ringPinch = null;
    range.bellyFace = (range.bellyFace + 1) % 4;
    this.belly!.body.rotation.z = (-range.bellyFace * Math.PI) / 2;
    playPress();
    coach.done('searTurn');
    console.log(`[Range] turned: the ${BELLY_FACES[range.bellyFace]} side down`);
  }

  private stockBelly(): void {
    const burnt = this.sear.filter((x, i) => x > this.need(i) * SEAR_BURN_FACTOR).length;
    const under = this.sear.filter((x, i) => x < this.need(i)).length;
    const grade: Grade = burnt >= 2 ? 'Bad' : burnt === 1 || under >= 2 ? 'Poor' : under === 1 ? 'Good' : 'Excellent';
    const full = NETA.BonitoBelly.stock;
    const stock = Math.max(Math.ceil(full / 2), full - PREP_YIELD_LOSS[grade]);
    prepApi.stock('BonitoBelly', stock);
    this.belly!.root.visible = false;
    range.belly = 'done';
    feedback.flash(StationKind.NetaCase, COLOR_DONE);
    playPut();
    coach.done('stockSaku');
    console.log(`[Range] the seared bonito belly is in the case: ${grade} (${stock} of ${full})`);
    prepApi.taskDone('BonitoBelly');
  }

  // ---- what the others see --------------------------------------------------------------

  private publish(): void {
    let lit = 0;
    for (const [i, b] of this.burners.entries()) {
      if (b.level > 0) lit++;
      // Not coming today (not ordered, or done in the back by the cook): its pot is not needed.
      if (b.state === 'empty' && !prepApi.potWanted(b.id)) this.putAway(b);
      let target = 0;
      let want: BurnerView['want'] = '';
      if (b.state === 'cooking') target = b.id === 'SeaEel' ? (b.temp < EEL_BAND[0] - 1 ? 3 : 1) : 3;
      if (b.state === 'out' && range.netOn === i && range.belly === 'net' && !range.bellySeared) target = 3;
      if (b.level !== target) want = 'knob';
      else if (b.state === 'empty') want = 'put';
      else if (b.state === 'done') want = 'take';
      const v = b.view;
      v.level = b.level;
      v.temp = b.temp;
      v.liquid = b.liquid;
      v.state = b.state;
      v.want = want;
      v.target = target;
    }
    prep.burnersOn = lit;
    range.netAt.copy(this.net.position);
    const belly = this.belly;
    if (belly) {
      range.bellyAt.copy(belly.root.position).add(this.tmp.set(0, 0.015, 0));
      const along = BELLY_RINGS_Z + belly.skewers.position.z;
      const ry = belly.root.rotation.y;
      range.ringsAt.copy(belly.root.position).add(this.tmp.set(Math.sin(ry) * along, 0.015, Math.cos(ry) * along));
    }
    prep.boardBusy = range.belly === 'board' || range.belly === 'skewered' || range.belly === 'wet' || range.belly === 'patted' || range.belly === 'free';
  }

  /** The bar is open: the pots, the net and their words are put away, the range's own pot and kettle back on. */
  private clearAway(): void {
    this.cleared = true;
    for (const b of this.burners) {
      b.level = 0;
      for (const o of [b.pot, b.flame, b.label]) o.visible = false;
      if (b.ing) b.ing.visible = false;
    }
    if (this.net) this.net.visible = false;
    if (this.belly) this.belly.root.visible = false;
    prep.burnersOn = 0;
    this.cookware ??= this.findCookware();
    if (this.cookware) this.cookware.visible = true;
  }
}
