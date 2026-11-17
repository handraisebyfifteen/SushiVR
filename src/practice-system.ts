import {
  CanvasTexture,
  createSystem,
  Euler,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { type BurnerView, chef, cupboard, cure, holdingAnything, nakago, nakagoWanted, orderKind, orderNeta, type Place, prep, progress, range, prawn, service, shari, sharpen, staff, tamago, tea, tsume } from './game-state.js';
import type { HandReader } from './hand-reader.js';
import { handedness, setLeftHanded, sideSign, sideX } from './handedness.js';
import { hands } from './hands.js';
import { SEATED_EYE_HEIGHT, SINK_TOP } from './layout.js';
import { masterApi } from './master-system.js';
import { placeApi } from './place-system.js';
import { KNOB_HOLD, KNOB_STEP } from './range-system.js';
import { CASE_ORDER, CORE_FROM, FROM_CASE, MENU, type MenuId, menuFor, NETA, type NetaId } from './menu.js';
import { caseApi } from './neta-case-system.js';
import { fishOrder, orderOf, resetShop, sizesOf, supplierOf } from './fish-order.js';
import { fishOrderApi } from './fish-order-system.js';
import { type Kind, stations } from './station-system.js';
import { CaseItem, Customer, Held, NigiriStage, Piece, StationKind } from './sushi-components.js';
import { TurnSystem } from './turn-system.js';
import { AWASEZU_SECONDS, CURE_RINSE_SECONDS, OCTOPUS_DIP_SECONDS, SHARI_SCOOPS } from './tuning.js';
import { chefRiceInService, pantry } from './pantry.js';
import { phoneBookApi, type PhoneRowId } from './phone-book-system.js';
import { phoneApi } from './phone-system.js';
import { unlockAll } from './stage.js';

/**
 * Practice mode (development only): play the bar from the keyboard in the
 * desktop emulator (IWER). P switches it on and off. While it is on, this
 * system drives the emulated headset and hands directly, the same way the
 * emulator's remote control does, so every game rule runs unchanged: a key
 * only moves a hand to a place and makes a gesture there, and the game judges
 * that motion as it would judge a real hand. Timed gestures (the rice, the
 * three touches) happen the moment the key is pressed or let go, so the
 * rhythm is still the player's.
 *
 * Hands are pinned by the wrist; each frame the wrist target is corrected by
 * the measured offset from the wrist to the point that matters (palm, pinch
 * point or fingertip), so a step can switch between them without a jump.
 *
 * Not part of production builds: src/index.ts imports it only in dev.
 */

// ---- the slice of IWER's emulated device this system uses ------------------

interface EmuVector {
  set(x: number, y: number, z: number): unknown;
}
interface EmuQuaternion {
  set(x: number, y: number, z: number, w: number): unknown;
}
type EmuFinger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
interface EmuHand {
  poseId: string;
  updatePinchValue(value: number): void;
  setFingerPose(finger: EmuFinger, poseId: string, weight?: number): void;
  clearFingerPoses(finger?: EmuFinger): void;
  setPin(pin: { anchor: string; target: ArrayLike<number>; wristRotation?: ArrayLike<number> } | null): void;
  /** False: the headset has lost the hand (as real hand tracking does now and then). */
  connected: boolean;
  /** Where the hand is (XR origin), for the emulator's own controls. */
  position: EmuVector;
}
interface EmuDevice {
  controlMode: 'manual' | 'programmatic';
  primaryInputMode: 'controller' | 'hand';
  position: EmuVector;
  quaternion: EmuQuaternion;
  hands: { left: EmuHand; right: EmuHand };
  /** As the headset reports it: 'visible', or 'visible-blurred' while its menu is over the game. */
  visibilityState: string;
  updateVisibilityState(state: string): void;
}

function emulatedDevice(): EmuDevice | null {
  return ((window as unknown as { IWER_DEVICE?: EmuDevice }).IWER_DEVICE) ?? null;
}

// ---- steps -------------------------------------------------------------------

/** Which point of the hand a step places: what the game checks for that action. */
type Anchor = 'palm' | 'grasp' | 'tip';

interface Step {
  kind: 'move' | 'rub' | 'pinch' | 'pose' | 'wait' | 'hold';
  /** move/rub: a world point, captured when the key is pressed. */
  at?: Vector3;
  /** move/rub: a point in the chef's frame instead (x right, y up, -z forward). */
  local?: Vector3;
  /** Added to the point in the chef's frame. */
  offset?: Vector3;
  anchor?: Anchor;
  seconds?: number;
  /** pinch: 0..1. */
  value?: number;
  /** pose: an emulator hand pose id ('default', 'open', 'fist', 'point'). */
  pose?: string;
  /** move: turn the hand to this heading (degrees, 0 = fingers forward, + = left); null = natural. */
  yaw?: number | null;
  /** move: turn the hand by this many degrees (negative = clockwise seen from above). */
  yawBy?: number;
  /** move: curl the middle, ring and little fingers this far toward a fist (0..1). */
  curl?: number;
  /** rub: side-to-side amplitude (m), frequency (Hz) and phase (rad). */
  amp?: number;
  hz?: number;
  phase?: number;
  /**
   * rub: stops early once this turns true (the game has counted the rub), so
   * the hand does not keep going and trigger the same check a second time.
   */
  until?: () => boolean;
}

type MoveOptions = Pick<Step, 'yaw' | 'yawBy' | 'curl'>;

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
/** A right-handed waypoint (chef's frame or world) for the chef there is: mirrored across x = 0 for a left-handed chef. */
const sideV = (p: Vector3) => (handedness.left ? v(-p.x, p.y, p.z) : p);
const ZERO = v(0, 0, 0);
const move = (at: Vector3, offset: Vector3, anchor: Anchor, seconds: number, options: MoveOptions = {}): Step => ({
  kind: 'move', at, offset, anchor, seconds, ...options,
});
/** Move to a point in the chef's frame. */
const moveLocal = (local: Vector3, anchor: Anchor, seconds: number, options: MoveOptions = {}): Step => ({
  kind: 'move', local, offset: ZERO, anchor, seconds, ...options,
});
const rub = (
  at: Vector3,
  offset: Vector3,
  anchor: Anchor,
  seconds: number,
  amp: number,
  hz: number,
  until: () => boolean,
  phase = 0,
): Step => ({ kind: 'rub', at, offset, anchor, seconds, amp, hz, phase, until });
const pinch = (value: number): Step => ({ kind: 'pinch', value });
const pose = (id: string): Step => ({ kind: 'pose', pose: id });
const wait = (seconds: number): Step => ({ kind: 'wait', seconds });
/** Stay put until the key is let go (the verb then replaces the steps). */
const hold = (): Step => ({ kind: 'hold' });
/** Washing (hands, or the cloth with them) leaves both hands clean and waiting for the towel. */
const washedJustNow = () => chef.hands.every((h) => h.needsTowel && !h.needsWash);

/** Where each hand waits, in the chef's frame (grasp point): low, in front, off the board. */
const REST: [Vector3, Vector3] = [v(-0.15, 0.98, -0.2), v(0.15, 0.98, -0.2)];
/** Where the neta hand holds the slice while the piece is made (palm, chef's frame). */
const WORK = v(-0.06, 1.0, -0.27);
/** Where the rice hand holds the knife between cuts (palm, chef's frame). */
const KNIFE_READY = v(0.22, 0.93, -0.18);
/** A carried piece is let go here, from the geta's surface: above the case's glass, over its far half (inside the geta's zone, short of the geta itself). */
const GETA_LET_GO = v(0, 0.32, 0.11);
/** The rice tub, low on the right (world, facing the bar): down in it, and back up out of it. */
const TUB_DOWN = v(0.4, 0.55, 0.02);
const TUB_WAY = v(0.36, 0.8, -0.06);
const TUB_UP = v(0.3, 0.88, -0.14);
const SHOULDER_X = 0.18;
const STEP_LABEL: Record<string, string> = { stepTable: 'Step to the work table', stepRange: 'Step to the range', stepSink: 'Step to the sink', stepDrain: 'Step to the drainboard', stepShelf: 'Step to the food shelf', stepSeat: 'Back to the stool' };
/** Pinch point offsets from the wrist before the hand is first measured (chef's frame). */
const DEFAULT_OFFSET: Record<Anchor, Vector3> = {
  palm: v(0, -0.02, -0.06),
  grasp: v(0, -0.03, -0.11),
  tip: v(0, -0.03, -0.17),
};
const CURL_FINGERS: EmuFinger[] = ['middle', 'ring', 'pinky'];
const FINGER_PITCH = -0.35;
/** How fast a hand turns over to hold the neta or rice palm up (rad per second: half a turn in 0.3 s). */
const ROLL_RATE = 10;
const LOOK_PITCH_DEG = -22;
const HEAD_TURN_RATE_DEG = 320;
const HEADING_STEP_DEG = 45;
/** Where the emulator's hands start (seated, resting just over the board): either side, height, forward. */
const EMU_HAND_X = 0.16;
const EMU_HAND_Y = 0.93;
const EMU_HAND_Z = -0.3;
/**
 * Shaky hands (the ` key), to try the game against hand tracking without a
 * headset: a slow wobble and a quick jitter of the hands (metres), a wobble
 * of their heading (degrees), and short losses of a hand, more often while
 * the hands are together (one hides the other from the cameras).
 */
const SHAKE_WOBBLE = 0.006;
const SHAKE_JITTER = 0.002;
const SHAKE_YAW = (3 * Math.PI) / 180;
const LOSS_PER_SECOND = 0.03;
const LOSS_PER_SECOND_TOGETHER = 0.15;
const TOGETHER_DISTANCE = 0.12;
const LOSS_MIN_SECONDS = 0.1;
const LOSS_MAX_SECONDS = 0.5;

/** A small seeded random (mulberry32), so a shaky run can be repeated. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** What can be ordered from the case, in case order (what 6 steps through): nigiri neta, gunkan toppings, the inari pouch, roll fillings; then the roll cores cut in service (the tekka's tuna), to order their rolls. */
const NIGIRI_NETA: readonly NetaId[] = [
  ...CASE_ORDER.filter((id) => ['saku', 'piece', 'scoop', 'age', 'filling'].includes(NETA[id].prep)),
  ...(Object.keys(CORE_FROM) as NetaId[]),
];

class DriverHand {
  steps: Step[] = [];
  index = 0;
  t = 0;
  anchor: Anchor = 'grasp';
  pinch = 0;
  pose = 'default';
  /** Rig-space point of the current anchor, now and where the current move began. */
  readonly point = new Vector3();
  readonly start = new Vector3();
  /** Heading of the fingers (degrees, chef's frame); `yawFixed` holds it, else it follows the reach. */
  yawDeg = 0;
  yawStart = 0;
  yawFixed = false;
  /** Finger curl toward a fist (0..1), now and where the current move began. */
  curl = 0;
  curlStart = 0;
  /** Turn of the hand about its fingers (rad): 0 palm down, π palm up. */
  roll = 0;
  readonly sentWrist = new Vector3(Number.NaN, 0, 0);
  sentYaw = Number.NaN;
  sentRoll = Number.NaN;
  sentPinch = -1;
  sentPose = '';
  sentCurl = 0;
  /** The verb's `until` value when the key was pressed (true: rub the full time). */
  untilAtStart = false;

  constructor(readonly side: 0 | 1) {}

  get busy(): boolean {
    return this.index < this.steps.length;
  }

  get holding(): boolean {
    return this.steps[this.index]?.kind === 'hold';
  }
}

export class PracticeSystem extends createSystem({
  items: { required: [CaseItem] },
  customer: { required: [Customer] },
  nigiri: { required: [Piece] },
}) {
  private on = false;
  /** Index into NIGIRI_NETA of the neta 5 takes and 7 orders. */
  private selected = NIGIRI_NETA.indexOf('LeanTuna');
  private device: EmuDevice | null = null;
  private driver: [DriverHand, DriverHand] = [new DriverHand(0), new DriverHand(1)];
  private lookYaw = 0;
  private lookPitch = LOOK_PITCH_DEG;
  private headYaw = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private status = 'Ready';
  private panel!: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private canvas!: HTMLCanvasElement;
  private texture!: CanvasTexture;
  private drawn = '';
  /** Piece heading while it is carried: the game's heading at pick-up plus the hand's turn since. */
  private carried = false;
  private headingAtPickup = 0;
  private handYawAtPickup = 0;
  private heading = 0;

  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly q = new Quaternion();
  private readonly qRig = new Quaternion();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly goal = new Vector3();
  private readonly wrist = new Vector3();
  private readonly noisy = new Vector3();
  /** Shaky hands: on, the clock, the random, and per hand its wobble phases, the end of a loss and the losses so far. */
  private shaky = false;
  /** The emulator is set up once, at the start: hands, and seated at the bar (it comes up standing with controllers). */
  private handsChosen = false;
  private clock = 0;
  private random = seededRandom(1);
  private readonly shake = [0, 1].map((i) => ({ phase: [0.3 + i, 1.9 + i, 4.1 + i, 2.7 + i], lostUntil: 0, losses: 0 }));
  private readonly pinArray = [0, 0, 0];
  private readonly rotArray = [0, 0, 0, 1];

  init(): void {
    this.buildPanel();
    const onKeyDown = (e: KeyboardEvent) => this.onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => this.onKey(e, false);
    const onDown = (e: PointerEvent) => {
      if (!this.on || e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.lookYaw -= (e.clientX - this.lastX) * 0.25;
      this.lookPitch = Math.max(-70, Math.min(60, this.lookPitch - (e.clientY - this.lastY) * 0.25));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const onUp = () => {
      this.dragging = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    this.cleanupFuncs.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (this.on) this.setOn(false);
    });
  }

  update(delta: number): void {
    // The emulator comes up standing (eyes at 1.6 m, hands at chest height) with controllers;
    // this bar is worked seated, with the hands alone.
    if (!this.handsChosen) {
      const emu = emulatedDevice();
      if (emu) {
        this.handsChosen = true;
        if (emu.primaryInputMode !== 'hand') emu.primaryInputMode = 'hand';
        // Seated: eyes at the seated height, looking down at the board; both hands resting just over it.
        emu.position.set(0, SEATED_EYE_HEIGHT, 0);
        this.euler.set((LOOK_PITCH_DEG * Math.PI) / 180, 0, 0, 'YXZ');
        this.q.setFromEuler(this.euler);
        emu.quaternion.set(this.q.x, this.q.y, this.q.z, this.q.w);
        emu.hands.left.position.set(-EMU_HAND_X, EMU_HAND_Y, EMU_HAND_Z);
        emu.hands.right.position.set(EMU_HAND_X, EMU_HAND_Y, EMU_HAND_Z);
        console.log('[Practice] the emulator is set to hands, seated at the bar');
      }
    }
    if (!this.on || !this.device) return;
    const device = this.device;
    // The emulator's own tools hand control back when they finish; keep it.
    if (device.controlMode !== 'programmatic') device.controlMode = 'programmatic';

    // Head: seated, looking where the mouse says.
    const want = this.lookYaw;
    const step = HEAD_TURN_RATE_DEG * delta;
    this.headYaw += Math.max(-step, Math.min(step, want - this.headYaw));
    this.euler.set((this.lookPitch * Math.PI) / 180, (this.headYaw * Math.PI) / 180, 0, 'YXZ');
    this.q.setFromEuler(this.euler);
    device.position.set(0, SEATED_EYE_HEIGHT, 0);
    device.quaternion.set(this.q.x, this.q.y, this.q.z, this.q.w);

    this.clock += delta;
    // The curing runs in the shop's real time: the driver skips each wait to its time.
    if (cure.next === 'wait' || cure.next === 'soon') cure.skip = 'aim';
    if (range.burners.some((b) => b.id === 'Octopus' && b.state === 'cooking' && b.level === 3 && b.temp >= 99.5)) range.skip = 'aim';
    this.updateShake(delta, device);
    for (const d of this.driver) this.updateHand(d, delta, d.side === 0 ? device.hands.left : device.hands.right);
    this.trackHeading();
    this.drawPanel();
  }

  // ---- keys --------------------------------------------------------------------

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyP' && e.shiftKey) {
      // Shift+P: the headset's menu comes up over the game, and goes again (a test of pause and resume, src/pause.ts).
      const emu = emulatedDevice();
      if (down && !e.repeat && emu) {
        const open = emu.visibilityState === 'visible';
        emu.updateVisibilityState(open ? 'visible-blurred' : 'visible');
        console.log(`[Practice] the headset's menu ${open ? 'opened' : 'closed'} (test)`);
      }
      return;
    }
    if (e.code === 'KeyP') {
      if (down && !e.repeat) this.setOn(!this.on);
      return;
    }
    if (!this.on) return;
    if (e.code === 'Backquote') {
      if (down && !e.repeat) {
        this.shaky = !this.shaky;
        // Shift+` starts from another seed, for another run of losses.
        this.random = seededRandom(e.shiftKey ? 1 + Math.floor(performance.now()) : 1);
        for (const s of this.shake) s.losses = 0;
        this.status = this.shaky ? 'Shaky hands on: wobble and short losses' : 'Shaky hands off';
        console.log(`[Practice] shaky hands ${this.shaky ? 'on' : 'off'}`);
      }
      return;
    }
    if (e.code === 'KeyD' && e.shiftKey) {
      // Shift+D: the edge worn down to nearly nothing, to try a dull knife (test).
      if (down && !e.repeat) {
        chef.knifeSharp = 0.1;
        chef.knifeDull = true;
        this.status = 'The edge worn down (test): strokes may catch';
        console.log('[Practice] the edge worn down to 0.10 (test)');
      }
      return;
    }
    if (e.code === 'KeyT') {
      // The headset turns round on the stool; the keyboard blinks and turns the bar half round.
      if (down && !e.repeat) {
        this.world.getSystem(TurnSystem)?.turnAround();
        this.status = 'Turning around';
      }
      return;
    }
    if (e.code === 'KeyL') {
      // Held: down in the rice tub. Let go: back up (beat 2 is judged then).
      if (!e.repeat) (down ? this.riceDown() : this.riceUp());
      e.preventDefault();
      return;
    }
    if (!down || e.repeat) return;
    const caseKeys: Record<string, () => void> = {
      Digit4: () => {
        const order = service.order;
        if (order && MENU[order.item].kind === 'maki') {
          const next = MENU[order.item].neta[progress.fillings];
          if (!next) return this.say('Every filling is on: roll it (I)');
          const from = CORE_FROM[next];
          if (!from) return this.placeFilling(next);
          // The tekka's core: the lean tuna to the board, one slice (K, X), the slice onto the mat (N).
          if (progress.coreHeld || progress.coreOnBoard) return this.say('The core is cut: lay it on the mat (N)');
          if (progress.sakuOnBoard) return this.say('Cut a slice for the core (K, X)');
          if (progress.spread < 1) return this.say('Spread the rice first (U)');
          return this.takeSaku(from);
        }
        const neta = orderNeta();
        if (neta) this.takeSaku(neta);
        else this.say('No order yet');
      },
      // Shift+5: every stage open, and the phone's settings step the stage to play next (test).
      Digit5: () => {
        if (!e.shiftKey) return this.takeSaku(NIGIRI_NETA[this.selected]);
        unlockAll();
        this.phoneLine(['settings', 'stage'], 'Phone: settings, the stage (all open)');
      },
      Digit6: () => this.select(e.shiftKey ? -1 : 1),
      // Shift+7: the phone's first line after a stage or a day (next stage, try again, next day).
      Digit7: () => (e.shiftKey ? this.phoneLine(['goOn'], 'Phone: go on') : this.orderSelected()),
      Digit8: () => {
        if (e.shiftKey) {
          // The full difficulty's shop starts again from day 1 (an empty case) at the next reload.
          resetShop();
          return this.say('Full: a new shop from day 1 (reload)');
        }
        caseApi.restockAll();
        this.say('Case restocked');
      },
      Digit9: () => (e.shiftKey ? this.phoneLine(['settings', 'game'], 'Phone: settings, the game (stages or the shop)') : this.prepCarry()),
      Digit0: () => (e.shiftKey ? this.phoneLine(['settings', 'restart'], 'Phone: settings, start') : this.pullPrep()),
      Minus: () => (e.shiftKey ? this.phoneLine(['greengrocer'], 'Phone: the greengrocer') : this.paperWipe()),
      Equal: () => (e.shiftKey ? this.phoneLine(['settings', 'playMode'], 'Phone: settings, play mode') : this.callFishShop()),
      BracketLeft: () => (e.shiftKey ? this.phoneLine(['riceShop', 'riceCall'], 'Phone: the rice shop') : this.boardStep()),
      BracketRight: () => (e.shiftKey ? this.phoneLine(['cookRice', 'cook1'], 'Phone: the cook, 1 sho of rice') : this.hangNoren()),
      Semicolon: () => (e.shiftKey ? this.phoneLine(['settings', 'hands'], 'Phone: settings, hands') : this.askStaff('cook')),
      Quote: () => (e.shiftKey ? this.phoneLine(['settings', 'display', 'frontNames'], 'Phone: tool names, counter') : this.askStaff('partTimer')),
      Comma: () => (e.shiftKey ? this.askTea() : this.pourTea()),
      Period: () => this.serveTea(),
      KeyA: () => this.shariKey(),
      Enter: () => this.rangeKey(),
      Slash: () => this.stepKey(),
      Tab: () => this.masterKey(),
    };
    const caseKey = caseKeys[e.code];
    if (caseKey) {
      caseKey();
      e.preventDefault();
      return;
    }
    const verbs: Record<string, () => void> = {
      Digit1: () => this.soap(),
      Digit2: () => this.washHands(),
      Digit3: () => this.towel(),
      KeyC: () => this.cloth(),
      KeyV: () => this.wipeBoard(),
      KeyB: () => this.rinseCloth(),
      KeyR: () => this.returnSaku(),
      KeyK: () => (e.shiftKey ? this.changeHands() : this.knife()),
      KeyX: () => this.cut(),
      KeyD: () => this.sharpenKey(),
      KeyW: () => this.wipeBlade(),
      KeyN: () => this.takeNeta(),
      KeyJ: () => this.tezu(),
      KeyY: () => this.wasabi(),
      KeyH: () => this.join(),
      KeyZ: () => this.takeNori(),
      KeyU: () => this.spreadRice(),
      KeyI: () => this.rollMaki(),
      Space: () => this.touch(),
      KeyF: () => this.flip(),
      KeyG: () => this.halfTurn(),
      KeyM: () => this.carry(),
      KeyQ: () => this.turnPiece(HEADING_STEP_DEG),
      KeyE: () => this.turnPiece(-HEADING_STEP_DEG),
      KeyS: () => this.serve(),
    };
    const verb = verbs[e.code];
    if (!verb) return;
    verb();
    e.preventDefault();
  }

  private setOn(on: boolean): void {
    const device = emulatedDevice();
    if (on && !device) {
      console.warn('[Practice] no emulated device (IWER) on this page');
      return;
    }
    this.on = on;
    this.panel.visible = on;
    this.dragging = false;
    if (!on && device) {
      // Off: no shaking, and any hand lost by it is back.
      this.shaky = false;
      this.shake.forEach((s, side) => {
        if (s.lostUntil > 0) (side === 0 ? device.hands.left : device.hands.right).connected = true;
        s.lostUntil = 0;
      });
    }
    if (on) {
      this.device = device;
      device!.controlMode = 'programmatic';
      device!.primaryInputMode = 'hand';
      this.headYaw = this.lookYaw = 0;
      this.lookPitch = LOOK_PITCH_DEG;
      for (const d of this.driver) {
        d.steps = [];
        d.index = 0;
        d.anchor = 'grasp';
        d.point.copy(REST[d.side]);
        d.pinch = 0;
        d.pose = 'default';
        d.curl = 0;
        d.yawFixed = false;
        d.sentPinch = -1;
        d.sentPose = '';
        d.sentCurl = 0;
        d.sentWrist.set(Number.NaN, 0, 0);
      }
      this.status = 'Practice mode on';
      console.log('[Practice] on');
    } else if (this.device) {
      for (const hand of [this.device.hands.left, this.device.hands.right]) {
        hand.setPin(null);
        hand.updatePinchValue(0);
        hand.poseId = 'default';
      }
      this.device.controlMode = 'manual';
      this.device = null;
      console.log('[Practice] off');
    }
  }

  // ---- verbs: hygiene ----------------------------------------------------------

  private soap(): void {
    const side = this.freeHand();
    const at = this.reachable(StationKind.Soap);
    if (side === null || !at) return;
    this.run(side, 'Soap pump', [
      move(at, v(0, 0.12, 0), 'palm', 0.35),
      move(at, v(0, 0.03, 0), 'palm', 0.15),
      pinch(1),
      wait(0.15),
      pinch(0),
      wait(0.05),
      move(at, v(0, 0.12, 0), 'palm', 0.15),
      this.rest(side),
    ]);
  }

  private washHands(): void {
    const at = this.reachable(StationKind.Sink);
    if (!at) return;
    if (this.driver[0].busy || this.driver[1].busy) return this.say('Hands are busy');
    if (chef.hands[0].holding !== Held.None || chef.hands[1].holding !== Held.None) {
      return this.say('Put things down first');
    }
    for (const side of [0, 1] as const) {
      const x = side === 0 ? -0.07 : 0.07;
      this.run(side, 'Washing hands', [
        move(at, v(x, 0.36, 0), 'palm', 0.35),
        // Down into the basin, under the faucet: chest-to-belly height for a seated chef.
        move(at, v(x, -0.06, 0), 'palm', 0.25),
        rub(at, v(x, -0.06, 0), 'palm', 1.4, 0.035, 2.5, washedJustNow, side * Math.PI),
        move(at, v(x, 0.36, 0), 'palm', 0.2),
        this.rest(side),
      ]);
    }
  }

  /** 3: both hands onto the towel hanging under the sink, then two fists to dry them. */
  private towel(): void {
    const at = this.reachable(StationKind.Towel);
    if (!at) return;
    if (this.driver[0].busy || this.driver[1].busy) return this.say('Hands are busy');
    if (chef.hands[0].holding !== Held.None || chef.hands[1].holding !== Held.None) {
      return this.say('Put things down first');
    }
    for (const side of [0, 1] as const) {
      // In the chef's frame the towel is ahead (-z); its front face is toward the chef (+z).
      const x = side === 0 ? -0.06 : 0.06;
      this.run(side, 'Gripping the towel', [
        move(at, v(x, 0.2, 0.14), 'palm', 0.35),
        move(at, v(x, 0.11, 0.035), 'palm', 0.2),
        pose('fist'),
        wait(0.35),
        pose('default'),
        move(at, v(x, 0.2, 0.14), 'palm', 0.2),
        this.rest(side),
      ]);
    }
  }

  /** C: take the wet cloth with the right hand, or put it back. */
  private cloth(): void {
    const d = this.driver[1];
    if (d.busy) return this.say('Right hand is busy');
    if (chef.hands[1].holding === Held.Cloth) {
      this.run(1, 'Cloth put back', [pinch(0), wait(0.1), this.rest(1)]);
      return;
    }
    if (chef.hands[1].holding !== Held.None) return this.say('Right hand is holding something');
    const at = this.reachable(StationKind.WetCloth);
    if (!at) return;
    this.run(1, 'Cloth taken', [
      move(at, v(0, 0.12, 0), 'grasp', 0.35),
      move(at, v(0, 0.03, 0), 'grasp', 0.15),
      pinch(1),
      wait(0.15),
      move(at, v(0, 0.12, 0), 'grasp', 0.2),
      this.rest(1),
    ]);
  }

  private wipeBoard(): void {
    if (!this.clothInHand()) return;
    const at = this.reachable(StationKind.CuttingBoard);
    if (!at) return;
    this.run(1, 'Wiping the board', [
      move(at, v(0.15, 0.1, 0), 'grasp', 0.3),
      move(at, v(0.15, 0.04, 0), 'grasp', 0.15),
      rub(at, v(0.15, 0.04, 0), 'grasp', 1.0, 0.12, 1.4, () => chef.boardDirt === 0),
      move(at, v(0.15, 0.1, 0), 'grasp', 0.2),
      this.rest(1),
    ]);
  }

  private rinseCloth(): void {
    if (!this.clothInHand()) return;
    const at = this.reachable(StationKind.Sink);
    if (!at) return;
    this.run(1, 'Rinsing the cloth', [
      move(at, v(0.05, 0.36, 0), 'grasp', 0.35),
      move(at, v(0.05, -0.04, 0), 'grasp', 0.25),
      rub(at, v(0.05, -0.04, 0), 'grasp', 1.6, 0.04, 2.5, washedJustNow),
      move(at, v(0.05, 0.36, 0), 'grasp', 0.2),
      this.rest(1),
    ]);
  }

  // ---- verbs: saku and knife -------------------------------------------------------

  /** Z: the neta hand takes nori from the nori box: a strip for a gunkan, or a half sheet laid on the mat for a roll. */
  private takeNori(): void {
    const side = chef.netaSide;
    if (!this.ready(side, Held.None)) return;
    const box = this.reachable(StationKind.NoriBox);
    if (!box) return;
    if (orderKind() === 'maki') {
      const mat = this.reachable(StationKind.Makisu);
      if (!mat) return;
      this.run(side, 'Nori on the mat (then J, L, U to spread the rice)', [
        move(box, v(0, 0.1, 0.02), 'grasp', 0.35),
        move(box, v(0, 0.02, 0), 'grasp', 0.2),
        pinch(1),
        wait(0.12),
        move(box, v(0, 0.1, 0), 'grasp', 0.2),
        move(mat, v(0, 0.06, 0), 'grasp', 0.35),
        move(mat, v(0, 0.02, 0), 'grasp', 0.15),
        pinch(0),
        wait(0.1),
        this.rest(side),
      ]);
      return;
    }
    // A gunkan is made on the board, the strip two-point wrapped (二点留め):
    // its end to the shari's near side, the rice hand's index finger on it,
    // the strip once round and on over it, a small pull out, let go.
    if (!progress.shariDown) return this.say('Shari on the board first (J, hold L, Space to squeeze, H to set it down)');
    const rice = chef.riceSide;
    if (this.driver[rice].busy || chef.hands[rice].holding !== Held.None) return this.say('Rice hand is busy');
    const shari = progress.pieceAt.clone();
    const s = sideX(-1);
    const a0 = Math.atan2(s * 0.03, 0.05);
    const round = Math.PI * 2 * 1.45;
    const steps = [
      move(box, v(0, 0.1, 0.02), 'grasp', 0.35),
      move(box, v(0, 0.02, 0), 'grasp', 0.2),
      pinch(1),
      wait(0.12),
      move(box, v(0, 0.1, 0), 'grasp', 0.2),
      move(shari, v(s * 0.03, 0.08, 0.05), 'grasp', 0.35),
      move(shari, v(s * 0.03, 0.02, 0.05), 'grasp', 0.15),
      wait(0.6),
    ];
    for (let i = 1; i <= 14; i++) {
      const t = a0 + (i / 14) * round;
      steps.push(move(shari, v(Math.sin(t) * 0.045, 0.02, Math.cos(t) * 0.045), 'grasp', 0.1));
    }
    steps.push(move(shari, v(Math.sin(a0 + round) * 0.065, 0.02, Math.cos(a0 + round) * 0.065), 'grasp', 0.12), wait(0.1), pinch(0), wait(0.1), this.rest(side));
    this.run(side, 'Nori: end on the shari, round, a small pull (then Y for wasabi, 4 for the topping)', steps);
    // The rice hand's index finger holds the end until the strip is most of the way round.
    this.run(rice, 'A finger on the nori\'s end', [
      wait(1.25),
      move(shari, v(0, 0.018, 0.025), 'tip', 0.25),
      wait(1.6),
      move(shari, v(sideX(0.06), 0.1, 0.08), 'tip', 0.2),
      this.rest(rice),
    ]);
  }

  /** 4 / 5 for uni or roe: the rice hand spoons it from the tray onto the gunkan on the neta hand. */
  private spoonTopping(neta: NetaId, at: Vector3): void {
    const side = chef.riceSide;
    if (!progress.wrapped) return this.say('Wrap the shari on the board first (J, L, Space, H, then Z)');
    if (this.driver[side].busy || chef.hands[side].holding !== Held.None) return this.say('Rice hand is busy');
    const piece = progress.pieceAt.clone();
    this.run(side, `Spooning the ${NETA[neta].name.toLowerCase()}`, [
      move(at, v(0, 0.1, 0.03), 'grasp', 0.35),
      move(at, v(0, 0.015, -0.015), 'grasp', 0.2),
      wait(0.2),
      pinch(1),
      wait(0.12),
      move(at, v(0, 0.12, 0.03), 'grasp', 0.2),
      move(piece, v(0, 0.08, 0), 'grasp', 0.35),
      move(piece, v(0, 0.04, 0), 'grasp', 0.15),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  /** U: the open rice hand sweeps the rice out over the nori on the mat. */
  private spreadRice(): void {
    const side = chef.riceSide;
    if (!progress.matNori) return this.say('Nori on the mat first (Z)');
    if (!progress.hasRice) return this.say('Take rice first (J, then hold L)');
    if (this.driver[side].busy) return this.say('Rice hand is busy');
    const mat = this.reachable(StationKind.Makisu);
    if (!mat) return;
    this.run(side, 'Spreading the rice', [
      pose('open'),
      move(mat, v(0, 0.06, 0.02), 'palm', 0.3),
      move(mat, v(0, 0.03, 0.02), 'palm', 0.15),
      rub(mat, v(0, 0.03, 0.02), 'palm', 2.2, 0.07, 1.1, () => progress.spread >= 1),
      pose('default'),
      this.rest(side),
    ]);
  }

  /** 4 on a roll order: the rice hand lays the next filling along the rice. */
  private placeFilling(neta: NetaId): void {
    const side = chef.riceSide;
    if (progress.spread < 1) return this.say('Spread the rice first (U)');
    if (this.driver[side].busy || chef.hands[side].holding !== Held.None) return this.say('Rice hand is busy');
    const at = this.sakuAt(neta);
    if (!at) return;
    const mat = progress.pieceAt.clone();
    this.run(side, `Laying the ${NETA[neta].name.toLowerCase()}`, [
      move(at, v(0, 0.1, 0.03), 'grasp', 0.35),
      move(at, v(0, 0.015, -0.015), 'grasp', 0.2),
      wait(0.2),
      pinch(1),
      wait(0.12),
      move(at, v(0, 0.12, 0.03), 'grasp', 0.2),
      move(mat, v(0, 0.07, 0), 'grasp', 0.35),
      move(mat, v(0, 0.025, 0), 'grasp', 0.15),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  /** I: both hands at the near edge of the mat push it away: rolled. */
  private rollMaki(): void {
    if (progress.fillings < 1) return this.say('Lay the filling first (4)');
    if (this.driver[0].busy || this.driver[1].busy) return this.say('Hands are busy');
    const mat = progress.pieceAt.clone();
    for (const side of [chef.netaSide, chef.riceSide] as const) {
      const x = (side === chef.netaSide ? -0.06 : 0.06) * sideSign();
      this.run(side, 'Rolling: both fists on the beat (Space)', [
        move(mat, v(x, 0.06, 0.08), 'palm', 0.3),
        move(mat, v(x, 0.035, 0.08), 'palm', 0.15),
        move(mat, v(x, 0.035, -0.02), 'palm', 0.35),
        wait(0.2),
      ]);
    }
  }

  /** 6 / Shift+6: the next or previous neta for 5 and 7. */
  private select(step: number): void {
    this.selected = (this.selected + step + NIGIRI_NETA.length) % NIGIRI_NETA.length;
    const neta = NIGIRI_NETA[this.selected];
    const from = CORE_FROM[neta];
    this.say(from ? `Selected: ${NETA[neta].name} (cut from the ${NETA[from].name.toLowerCase()}, ${this.stockOf(from)} left)` : `Selected: ${NETA[neta].name} (${this.stockOf(neta)} left)`);
  }

  /** 7: the customer orders the selected neta (to try every one); on the phone to the fish shop (full), it is pinched in the case to order it. */
  private orderSelected(): void {
    const neta = NIGIRI_NETA[this.selected];
    if (fishOrder.ordering) return this.pinchCase(neta, `Ordering: ${NETA[neta].name.toLowerCase()}`);
    const prep = NETA[neta].prep;
    // A roll filling orders the roll that starts with it (shiso: ume-shiso, plum: ume-kyu).
    const roll = (Object.keys(MENU) as MenuId[]).find((id) => MENU[id].kind === 'maki' && MENU[id].neta[0] === neta);
    // The live kuruma-ebi: boiled and raw by turns.
    const worked = (Object.keys(FROM_CASE) as NetaId[]).filter((n) => FROM_CASE[n] === neta);
    if (worked.length) this.workedTurn++;
    const topping = worked.length ? worked[this.workedTurn % worked.length] : neta;
    const item = prep === 'filling' ? (roll ?? null) : menuFor(prep === 'scoop' ? 'gunkan' : prep === 'age' ? 'inari' : 'nigiri', [topping]);
    const customer = this.queries.customer.entities.values().next().value;
    if (!item || !customer) return;
    customer.setValue(Customer, 'item', item);
    customer.setValue(Customer, 'wasabi', NETA[neta].prep === 'saku' && neta !== 'Tamago');
    this.say(`Ordered: ${NETA[topping].name}`);
  }
  private workedTurn = 1;

  private stockOf(neta: NetaId): number {
    for (const entity of this.queries.items.entities) {
      if (entity.getValue(CaseItem, 'neta') === neta) return entity.getValue(CaseItem, 'remaining') ?? 0;
    }
    return 0;
  }

  /**
   * 4 / 5: the neta hand reaches into the case for that neta: a saku is laid
   * on the board, a ready-cut piece comes straight onto the fingers.
   */
  private takeSaku(neta: NetaId): void {
    if (NETA[neta].prep === 'scoop') {
      const at = this.sakuAt(neta);
      if (at) this.spoonTopping(neta, at);
      return;
    }
    const side = chef.netaSide;
    if (!this.ready(side, Held.None)) return;
    const at = this.sakuAt(neta);
    const board = this.reachable(StationKind.CuttingBoard);
    if (!at || !board) return;
    const name = NETA[neta].name.toLowerCase();
    if (NETA[neta].prep === 'piece' || NETA[neta].prep === 'age') {
      this.run(side, `Taking the ${name}`, [
        move(at, v(0, 0.1, 0.03), 'grasp', 0.35),
        move(at, v(0, 0.015, -0.015), 'grasp', 0.2),
        wait(0.2),
        pinch(1),
        wait(0.12),
        pinch(0),
        this.rest(side),
      ]);
      return;
    }
    this.run(side, `Taking the ${name}`, [
      move(at, v(0, 0.1, 0.03), 'grasp', 0.35),
      move(at, v(0, 0.015, -0.015), 'grasp', 0.2),
      wait(0.2),
      pinch(1),
      wait(0.12),
      move(at, v(0, 0.14, 0), 'grasp', 0.2),
      move(board, v(sideX(-0.12), 0.12, 0), 'grasp', 0.35),
      move(board, v(sideX(-0.12), 0.05, 0), 'grasp', 0.15),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  /** R: the neta hand puts the saku on the board back in its slot in the case. */
  private returnSaku(): void {
    const side = chef.netaSide;
    if (!progress.sakuOnBoard) return this.say('No saku on the board');
    if (!this.ready(side, Held.None)) return;
    const at = progress.sakuAt.clone();
    const home = progress.sakuHome.clone();
    this.run(side, 'Saku back in the case', [
      move(at, v(0, 0.1, 0), 'grasp', 0.3),
      move(at, v(0, 0.01, 0), 'grasp', 0.15),
      pinch(1),
      wait(0.12),
      move(at, v(0, 0.14, 0), 'grasp', 0.2),
      move(home, v(0, 0.12, 0), 'grasp', 0.35),
      move(home, v(0, 0.06, 0), 'grasp', 0.15),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  /** K: the rice hand closes on the knife handle, or opens to put the knife down. */
  private knife(): void {
    const side = chef.riceSide;
    const d = this.driver[side];
    if (d.busy) return this.say('Rice hand is busy');
    if (chef.hands[side].holding === Held.Knife) {
      this.run(side, chef.knifeDirty ? 'Knife put down (not wiped!)' : 'Knife put down', [
        pose('default'),
        wait(0.1),
        this.rest(side, null),
      ]);
      return;
    }
    if (chef.hands[side].holding !== Held.None) return this.say('Rice hand is holding something');
    const at = this.reachable(StationKind.Knife);
    if (!at) return;
    this.run(side, 'Knife in hand', [
      // The handle stands out of the knife box toward the chef, 12 cm from the knife's origin.
      move(at, v(0, 0.14, 0.12), 'palm', 0.35, { yaw: 0 }),
      move(at, v(0, 0.06, 0.12), 'palm', 0.15),
      pose('fist'),
      wait(0.12),
      moveLocal(sideV(KNIFE_READY), 'palm', 0.3),
    ]);
  }

  /** X: neta hand on the saku, blade drawn toward the chef along the guide line. */
  private cut(): void {
    const rice = chef.riceSide;
    const neta = chef.netaSide;
    // In the prep the deba cuts too (the whole fish at the sink).
    const blade = chef.hands[rice].holding === Held.Knife || (prep.active && chef.hands[rice].holding === Held.Deba);
    if (!blade) return this.say('Hold the knife first (K)');
    if (progress.kind === 'maki' && !progress.sakuOnBoard) return this.cutRoll();
    if (prep.active) return this.cutPrep();
    if (!progress.sakuOnBoard) return this.say('Put a saku on the board first (4 or 5)');
    if (progress.kind === 'maki' ? progress.coreOnBoard || progress.coreHeld : progress.hasNeta) return this.say('A slice is already cut');
    if (this.driver[rice].busy || !this.ready(neta, Held.None)) return;
    const saku = progress.sakuAt.clone();
    // The blade runs 0.15 m ahead of the palm; draw it from just beyond the saku to past its near edge.
    const guide = v(saku.x + sideX(0.075), saku.y, saku.z);
    this.run(neta, 'Hand on the saku', [
      move(saku, v(0, 0.06, 0), 'palm', 0.3),
      wait(1.25),
      this.rest(neta),
    ]);
    this.run(rice, 'Cutting', [
      wait(0.3),
      move(guide, v(0, 0.18, 0.09), 'palm', 0.3, { yaw: 0 }),
      move(guide, v(0, 0.06, 0.09), 'palm', 0.15),
      move(guide, v(0, 0.06, 0.23), 'palm', 0.5),
      move(guide, v(0, 0.18, 0.23), 'palm', 0.15),
      moveLocal(sideV(KNIFE_READY), 'palm', 0.3),
    ]);
  }

  /** 9 in the morning prep: a fish from the ice to the board, a saku into the case (or on the ice), a scrap into the trash. */
  private prepCarry(): void {
    if (!prep.active) return this.say('The prep is over: the bar is open');
    const side = chef.netaSide;
    const next = prep.next;
    if ((next === 'take' && prep.takeToPot) || next === 'pot') return this.say('That one goes into its pot on the range: Enter');
    if (next !== 'take' && next !== 'stock' && next !== 'discard') {
      return this.say(next === 'cut' ? 'Cut it first (K, X)' : next === 'pull' ? 'Pull it off first (0)' : next === 'wipe' ? 'Pat it dry first (-)' : next ? 'Its work first (Tab)' : 'Nothing to carry');
    }
    // Stage 4: the whole fish's wash board and the scraps there are at the sink; their box at the drainboard's foot.
    const fromBox = next === 'take' && prep.takeFrom === 'fish' && !prep.materialHeld;
    if (prep.where === 'sink' && !this.reachPlace(fromBox ? 'drain' : 'sink', 'back')) return;
    // A fish to cure: picked up at the board, carried to its tray on the drainboard.
    if (next === 'stock' && prep.stockTo === 'cure') {
      if (!prep.productHeld) {
        if (!this.reachPlace('seat', 'front')) return;
        return this.pickHold(side, prep.productAt.clone(), 'Up, for its tray');
      }
      if (!this.reachPlace('drain', 'back', (1 - side) as 0 | 1)) return;
      if (!this.ready(side, Held.Saku)) return;
      return this.dropAt(side, prep.slotAt.clone().add(v(0, 0.03, 0)), 'Into the tray');
    }
    if (next === 'take' && prep.materialHeld) {
      // Carried from the sink: down on the wash board, or onto the manaita from the stool.
      if (prep.where === 'board' && !this.reachPlace('seat', 'front', (1 - side) as 0 | 1)) return;
      if (!this.ready(side, Held.Saku)) return;
      return this.dropAt(side, prep.slotAt.clone().add(v(0, 0.02, 0)), prep.takeTo === 'wash' ? 'Onto the wash board' : 'Onto the board');
    }
    if (!this.ready(side, Held.None)) return;
    if (next === 'take' && prep.takeFrom !== 'ice' && prep.takeTo === 'board') {
      // From the sink to the manaita: taken up here, carried there next.
      return this.pickHold(side, prep.boxAt.clone(), prep.takeFrom === 'wash' ? 'The washed fish in hand' : 'The fish in hand');
    }
    let from: Vector3;
    let to: Vector3;
    let label: string;
    if (next === 'take' && prep.takeTo === 'wash') {
      from = prep.boxAt.clone();
      to = prep.washAt.clone().add(v(0, 0.06, 0));
      label = 'From the fish box to the wash board';
    } else if (next === 'take') {
      const board = this.reachable(StationKind.CuttingBoard);
      if (!board) return;
      from = prep.boxAt.clone();
      to = board.add(v(0, 0.08, 0.06));
      label = 'From the ice box to the board';
    } else if (next === 'stock') {
      from = prep.productAt.clone();
      to = prep.slotAt.clone().add(v(0, 0.05, 0));
      label = 'Into its place';
    } else {
      from = prep.scrapAt.clone();
      to = prep.trashAt.clone().add(v(0, 0.12, 0));
      label = 'Into the trash';
    }
    this.run(side, label, [
      move(from, v(0, 0.1, 0.03), 'grasp', 0.35),
      move(from, v(0, 0.004, 0), 'grasp', 0.2),
      wait(0.25),
      pinch(1),
      wait(0.12),
      move(from, v(0, 0.14, 0), 'grasp', 0.25),
      move(to, v(0, 0.08, 0.03), 'grasp', 0.4),
      move(to, v(0, 0, 0), 'grasp', 0.2),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  // ---- the curing on the drainboard (the full difficulty) -------------------------------

  /** Tab: a pinch of salt from the bowl, the fingers opened over the tray. */
  private saltCure(): void {
    if (!this.reachPlace('drain', 'back')) return;
    const side = this.sideOf(cure.bowlAt);
    if (!this.ready(side, Held.None)) return;
    const bowl = cure.bowlAt.clone();
    // Over the bare part of the salt (where a pinch whitens the most).
    const tray = cure.saltAt.clone();
    this.run(side, 'A pinch of salt, over the bare part', [
      pinch(0),
      move(bowl, v(0, 0.06, 0), 'grasp', 0.3),
      move(bowl, v(0, 0.005, 0), 'grasp', 0.2),
      wait(0.2),
      pinch(1),
      wait(0.12),
      move(tray, v(0, 0.1, 0), 'grasp', 0.35),
      wait(0.1),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  /** Tab: the tray by its front rim, under the tap till the salt is off, and back. */
  private rinseCure(): void {
    if (!this.reachPlace('drain', 'back')) return;
    const side = chef.riceSide;
    if (!this.ready(side, Held.None)) return;
    const rim = cure.rimAt.clone();
    // The tray hangs from the hand by its rim: its middle under the spout.
    const under = cure.tapAt.clone().add(v(0, 0.03, rim.z - cure.trayAt.z));
    this.run(side, 'The tray under the tap', [
      pinch(0),
      move(rim, v(0, 0.05, 0.04), 'grasp', 0.3),
      move(rim, v(0, 0, 0), 'grasp', 0.2),
      wait(0.2),
      pinch(1),
      wait(0.12),
      move(under, v(0, 0, 0), 'grasp', 0.5),
      wait(CURE_RINSE_SECONDS + 0.5),
      move(rim, v(0, 0.01, 0), 'grasp', 0.5),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  /** Tab: the fish on to their next place (the bowl of water, the clean basket, the vinegar): lifted where they are, let go there. */
  private vinegarCure(): void {
    if (!this.reachPlace('drain', 'back')) return;
    const side = chef.netaSide;
    if (cure.fishHeld) return this.dropAt(side, cure.dropAt.clone(), 'Let go there');
    if (!this.ready(side, Held.None)) return;
    this.pickHold(side, cure.fishAt.clone(), 'The fish, on');
  }

  /** Tab: out of the vinegar (a pinch over them), then over the case, facing the bar. */
  private cureOut(): void {
    const side = chef.netaSide;
    if (cure.fishHeld) {
      if (!this.reachPlace('seat', 'front', (1 - side) as 0 | 1)) return;
      if (this.driver[side].busy) return this.say('Hands are busy');
      return this.run(side, 'Into the case', [move(cure.caseAt.clone(), v(0, 0.1, 0.02), 'grasp', 0.5), move(cure.caseAt.clone(), v(0, 0.04, 0), 'grasp', 0.2), pinch(0), wait(0.1), this.rest(side)]);
    }
    if (!this.reachPlace('drain', 'back')) return;
    if (!this.ready(side, Held.None)) return;
    this.pickHold(side, cure.fishAt.clone(), 'Out of the vinegar');
  }

  /** 0 in the morning prep: the neta hand holds the fish, the rice hand pulls off the wrapping, the legs or the skin. */
  private pullPrep(): void {
    if (!prep.active || prep.next !== 'pull') return this.say('Nothing to pull off');
    const neta = chef.netaSide;
    const rice = chef.riceSide;
    if (!this.ready(neta, Held.None) || !this.ready(rice, Held.None)) return;
    const hold = prep.pullNeta.clone();
    const grip = prep.pullRice.clone();
    this.run(neta, 'Holding it down', [move(hold, v(0, 0.08, 0), 'grasp', 0.3), move(hold, v(0, 0, 0), 'grasp', 0.15), wait(0.25), pinch(1), wait(1.4), pinch(0), wait(0.1), this.rest(neta)]);
    this.run(rice, prep.say || 'Pulling it off', [
      move(grip, v(0, 0.08, 0.02), 'grasp', 0.3),
      move(grip, v(0, 0, 0), 'grasp', 0.15),
      wait(0.35),
      pinch(1),
      wait(0.15),
      move(grip, v(sideX(0.03), 0.04, 0.18), 'grasp', 0.6),
      wait(0.1),
      pinch(0),
      wait(0.1),
      this.rest(rice),
    ]);
  }

  /** X in the morning prep: the neta hand steadies the fish; the blade is drawn along the line (toward the chef, across, or flat along the board). */
  private cutPrep(): void {
    const rice = chef.riceSide;
    const neta = chef.netaSide;
    if (prep.next !== 'cut') return this.say(prep.next === 'take' ? 'Put a fish on the board first (9)' : 'Nothing to cut now');
    if (this.driver[rice].busy || this.driver[neta].busy) return this.say('Hands are busy');
    const material = prep.materialAt.clone();
    const g = prep.guideAt.clone();
    this.run(neta, 'Hand on the fish', [move(material, v(sideX(-0.07), 0.04, -0.03), 'palm', 0.3), wait(1.35), this.rest(neta)]);
    if (prep.guideAcross) {
      // Fingers to the left, the blade 15 cm ahead of the palm. A cut: the blade on its edge, drawn from the right down
      // to the lower left (the owner: the stroke of a sword or a bat). A shave (skin, backbone): flat along the board, right to left.
      const low = prep.guideLow;
      const [y0, y1] = low ? [0.004, 0.004] : [0.095, 0.045];
      this.run(rice, prep.say || 'Cutting across', [
        wait(0.3),
        move(g, v(sideX(0.25), 0.2, 0), 'palm', 0.3, { yaw: 90 * sideSign() }),
        move(g, v(sideX(0.24), y0, 0), 'palm', 0.15),
        move(g, v(sideX(0.06), y1, 0), 'palm', 0.5),
        move(g, v(sideX(0.06), 0.18, 0), 'palm', 0.15),
        moveLocal(sideV(KNIFE_READY), 'palm', 0.3, { yaw: 0 }),
      ]);
      return;
    }
    // Along the line: drawn toward the chef, going down into the cut as it comes.
    const [y0, y1] = prep.guideLow ? [0.004, 0.004] : [0.09, 0.045];
    this.run(rice, prep.say || 'Cutting along the line', [
      wait(0.3),
      move(g, v(0, 0.2, 0.09), 'palm', 0.3, { yaw: 0 }),
      move(g, v(0, y0, 0.09), 'palm', 0.15),
      move(g, v(0, y1, 0.23), 'palm', 0.5),
      move(g, v(0, 0.18, 0.23), 'palm', 0.15),
      moveLocal(sideV(KNIFE_READY), 'palm', 0.3),
    ]);
  }

  // ---- stage 4: the whole fish (Tab drives these) ----------------------------------------

  /** The scaler: taken from the soap strip, scraped back and forth over the fish until its scales are off, let go. */
  private scaleFish(): void {
    if (prep.next !== 'scale') return this.say('Nothing to scale now');
    if (!this.reachPlace('sink', 'back')) return;
    const side = chef.riceSide;
    if (!this.ready(side, prep.scalerHeld ? Held.Scaler : Held.None)) return;
    const tool = prep.scalerAt.clone();
    const fish = prep.materialAt.clone();
    const steps: Step[] = [];
    if (!prep.scalerHeld) steps.push(pinch(0), move(tool, v(0, 0.08, 0), 'grasp', 0.35), move(tool, v(0, 0.004, 0), 'grasp', 0.2), wait(0.25), pinch(1), wait(0.15));
    steps.push(
      move(fish, v(0, 0.03, 0), 'grasp', 0.4),
      move(fish, v(0, 0.005, 0), 'grasp', 0.15),
      rub(fish, v(0, 0.005, 0), 'grasp', 6, 0.1, 1.6, () => prep.next !== 'scale'),
      pinch(0),
      wait(0.1),
      this.rest(side),
    );
    this.run(side, prep.say || 'Scaling', steps);
  }

  /** The fish pinched and lifted a little: it rolls over. */
  private turnFish(): void {
    if (prep.next !== 'turn') return this.say('Nothing to turn now');
    if (prep.where === 'sink' ? !this.reachPlace('sink', 'back') : !this.reachPlace('seat', 'front')) return;
    const side = chef.netaSide;
    if (!this.ready(side, Held.None)) return;
    const at = prep.pullNeta.clone();
    this.run(side, prep.say || 'Turning it over', [
      pinch(0),
      move(at, v(0, 0.06, 0), 'grasp', 0.3),
      move(at, v(0, 0.002, 0), 'grasp', 0.2),
      wait(0.25),
      pinch(1),
      wait(0.15),
      move(at, v(0, 0.09, 0), 'grasp', 0.35),
      wait(0.1),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  /** A hand rubs the belly cavity under the running tap. */
  private rinseFish(): void {
    if (prep.next !== 'rinse') return this.say('Nothing to rinse now');
    if (!this.reachPlace('sink', 'back')) return;
    const side = this.freeHand();
    if (side === null) return;
    const at = prep.rinseAt.clone();
    this.run(side, prep.say || 'Washing it', [
      move(at, v(0, 0.05, 0), 'grasp', 0.3),
      move(at, v(0, 0.01, 0), 'grasp', 0.2),
      rub(at, v(0, 0.01, 0), 'grasp', 4, 0.04, 2, () => prep.next !== 'rinse'),
      this.rest(side),
    ]);
  }

  /** The deba at the sink: a fist on its handle takes it; opened, it goes back. */
  private deba(): void {
    const side = chef.riceSide;
    if (this.driver[side].busy) return this.say('Rice hand is busy');
    if (chef.hands[side].holding === Held.Deba) {
      this.run(side, 'Deba put back', [pose('default'), wait(0.1), this.rest(side, null)]);
      return;
    }
    if (!this.reachPlace('sink', 'back')) return;
    if (chef.hands[side].holding !== Held.None) return this.say('Rice hand is holding something');
    const at = prep.debaAt.clone();
    this.run(side, 'Deba in hand', [
      move(at, v(0, 0.1, 0.02), 'palm', 0.35, { yaw: 0 }),
      move(at, v(0, 0.02, 0), 'palm', 0.15),
      pose('fist'),
      wait(0.12),
      moveLocal(sideV(KNIFE_READY), 'palm', 0.3),
    ]);
  }

  /** The tweezers: taken from the board's back row, the tips down to each pin bone and up, then put back. */
  private pullPins(): void {
    if (prep.next !== 'pins') return this.say('No pin bones to pull now');
    if (!this.reachPlace('seat', 'front')) return;
    const side = chef.riceSide;
    if (!this.ready(side, prep.tweezersHeld ? Held.Tweezers : Held.None)) return;
    const tool = prep.tweezersAt.clone();
    const steps: Step[] = [];
    if (!prep.tweezersHeld) steps.push(pinch(0), move(tool, v(0, 0.06, 0), 'grasp', 0.3), move(tool, v(0, 0.004, 0), 'grasp', 0.2), wait(0.25), pinch(1), wait(0.15));
    for (const p of prep.pinsAt.map((x) => x.clone())) {
      steps.push(move(p, v(0, 0.03, 0), 'grasp', 0.3), move(p, v(0, 0.002, 0), 'grasp', 0.15), wait(0.1), move(p, v(0, 0.045, 0), 'grasp', 0.25));
    }
    steps.push(pinch(0), wait(0.1), this.rest(side));
    this.run(side, prep.say || 'Pulling the pin bones', steps);
  }

  /** The scaler or the tweezers let go: back to its place. */
  private putTool(): void {
    const side = this.handWith(Held.Scaler) ?? this.handWith(Held.Tweezers);
    if (side === null) return this.say('No tool in hand');
    if (this.driver[side].busy) return this.say('Hands are busy');
    this.run(side, 'Back in its place', [pinch(0), wait(0.1), this.rest(side)]);
  }

  /** - with the hamaguri opened on the board: the tsume brush from its pot, stroked over them, let go (it goes back into its pot). */
  private tsumeBrush(): void {
    if (prep.next !== 'tsume') return this.say('Nothing to brush');
    const side = chef.riceSide;
    if (!this.ready(side, Held.None)) return;
    const grip = tsume.gripAt.clone();
    const work = prep.materialAt.clone();
    // The brush leans toward the chef: its tip 12 cm below the grip and 5 cm out beyond it.
    const over = v(0, 0.125, 0.053);
    this.run(side, 'Tsume on', [
      move(grip, v(0, 0.06, 0.02), 'grasp', 0.3),
      move(grip, v(0, 0, 0), 'grasp', 0.15),
      wait(0.2),
      pinch(1),
      wait(0.12),
      move(work, v(0, 0.2, 0.053), 'grasp', 0.4),
      move(work, over, 'grasp', 0.15),
      rub(work, over, 'grasp', 3, 0.05, 2, () => prep.next !== 'tsume'),
      move(work, v(0, 0.2, 0.053), 'grasp', 0.2),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  /** - in the morning prep: a sheet of kitchen paper, rubbed over the fish, then into the trash. */
  private paperWipe(): void {
    if (prep.next === 'tsume') return this.tsumeBrush();
    if (prep.next !== 'wipe') return this.say('Nothing to pat dry');
    const side = chef.riceSide;
    if (!this.ready(side, Held.None)) return;
    const box = prep.paperAt.clone();
    const fish = prep.materialAt.clone();
    const trash = prep.trashAt.clone();
    this.run(side, 'Patting it dry', [
      move(box, v(0, 0.08, 0), 'grasp', 0.3),
      move(box, v(0, 0.01, 0), 'grasp', 0.15),
      wait(0.25),
      pinch(1),
      wait(0.12),
      move(fish, v(0, 0.06, 0), 'grasp', 0.35),
      move(fish, v(0, 0.02, 0), 'grasp', 0.15),
      rub(fish, v(0, 0.02, 0), 'grasp', 3, 0.05, 2, () => prep.next !== 'wipe'),
      move(trash, v(0, 0.12, 0), 'grasp', 0.45),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  // ---- the back row in the morning prep: the shari (A), the range (D), stepping (/) ----------------

  /** Tab : do what the master asks for now (one motion), whatever it is. */
  private masterKey(): void {
    const step = masterApi.step;
    if (!step) return this.say('The master asks nothing now');
    const target = (id: string) => placeApi.targets().find((t) => t.id === id);
    switch (step) {
      case 'turnBack':
      case 'turnFront':
        this.world.getSystem(TurnSystem)?.turnAround();
        return this.say('Turning around');
      case 'soap':
        return this.soap();
      case 'washHands':
        return this.washHands();
      case 'towel':
        return this.towel();
      case 'callFishShop':
      case 'phoneOn':
        return this.callFishShop();
      case 'orderFish':
        return this.orderFish();
      case 'takeMaterial':
        return prep.takeToPot ? this.rangeKey() : this.prepCarry();
      case 'stockSaku':
      case 'discardScrap':
        return this.prepCarry();
      case 'pullPrep':
        return this.pullPrep();
      case 'wipePaper':
        return range.belly === 'wet' ? this.bellyKey() : this.paperWipe();
      case 'coolClams':
        return this.say('The clams are cooling: wait');
      case 'brushTsume':
        return this.tsumeBrush();
      case 'tsumePiece':
        return this.tsumeOnPiece();
      case 'prawnBoard':
      case 'skewerPrawn':
      case 'prawnPot':
      case 'prawnBoil':
      case 'prawnOut':
      case 'prawnIce':
      case 'prawnCold':
      case 'prawnIceOut':
      case 'prawnUnskewer':
      case 'peelPrawn':
      case 'prawnFingers':
        return this.prawnKey();
      case 'holdKnife':
      case 'putKnife':
        return this.knife();
      case 'wipeKnife':
        return this.wipeBlade();
      case 'cutPrep':
        return this.cut();
      case 'liftBoard':
      case 'washBoard':
      case 'leanBoard':
      case 'returnBoard':
        return this.boardStep();
      case 'binPack':
      case 'takeNakago':
      case 'washNakago':
      case 'dryNakago':
      case 'rackNakago':
        return this.nakagoKey();
      case 'wetStone':
      case 'sharpen':
      case 'rinseKnife':
        return this.sharpenKey();
      case 'hangNoren':
        return this.hangNoren();
      case 'scaleFish':
        return this.scaleFish();
      case 'turnFish':
        return this.turnFish();
      case 'rinseFish':
        return this.rinseFish();
      case 'holdDeba':
      case 'putDeba':
        return this.deba();
      case 'pullPins':
        return this.pullPins();
      case 'putTool':
        return this.putTool();
      case 'layCure':
        return this.prepCarry();
      case 'saltCure':
        return this.saltCure();
      case 'rinseCure':
        return this.rinseCure();
      case 'vinegarCure':
        return this.vinegarCure();
      case 'cureOut':
        return this.cureOut();
      case 'waitCure':
        // At the drainboard already: wait there for the time.
        if (!this.reachPlace('drain', 'back')) return;
        return this.say(`Waiting at the drainboard: ${cure.left} min`);
      case 'stepTable':
      case 'stepRange':
      case 'stepSink':
      case 'stepDrain':
      case 'stepShelf':
      case 'stepSeat': {
        const t = target(step === 'stepTable' ? 'table' : step === 'stepRange' ? 'range' : step === 'stepSink' ? 'sink' : step === 'stepDrain' ? 'drain' : step === 'stepShelf' ? 'shelf' : 'board');
        if (!t) return this.say('Cannot step there now');
        // The hand on its side, unless that one is holding something.
        const near = this.sideOf(t.at);
        const hand = chef.hands[near].holding === Held.None ? near : ((1 - near) as 0 | 1);
        return this.pointAt(t.at.clone(), STEP_LABEL[step], hand);
      }
      case 'lightRice':
      case 'turnOutRice':
      case 'pourAwasezu':
      case 'cutShari':
      case 'bringTub':
      case 'scoopShari':
      case 'returnTub':
        return this.shariKey();
      case 'panOn':
      case 'turnEgg':
      case 'eggOut':
      case 'cupboardPot':
      case 'potFromCupboard':
        return this.rangeKey();
      case 'saltTamago':
      case 'sugarTamago':
      case 'cupboardTamago':
      case 'suribachiOut':
      case 'grindTamago':
      case 'eggsTamago':
      case 'whiskTamago':
      case 'pourTamago':
      case 'oilPan':
      case 'lidTamago':
      case 'pressLid':
      case 'turnOutTamago':
      case 'wipePan':
        return this.tamagoKey();
      case 'potIn':
      case 'turnKnob':
      case 'potOut':
      case 'hangNet':
      case 'skewer':
      case 'searTurn':
      case 'chillBelly':
      case 'unskewer':
      case 'bellyBoard':
      case 'bellyNet':
      case 'toCase':
      case 'clamsBoard':
        return this.rangeKey();
      case 'rollToBoard':
        return this.rollToBoard();
      default:
        return this.say(`Tab does not do "${step}": use its own key`);
    }
  }

  /** / : step where the head looks: turned round, the work table or the range; back at the bar, the board (to sit down). */
  private stepKey(): void {
    const targets = placeApi.targets();
    if (!targets.length) return this.say(prep.active ? 'Turn around (T) to step to the work table or the range' : 'The bar is open');
    this.player.head.getWorldPosition(this.a);
    let best = targets[0];
    let bestOff = Infinity;
    for (const t of targets) {
      const local = this.player.worldToLocal(t.at.clone());
      const off = Math.abs(Math.atan2(-local.x, -local.z) * 57.3 - this.headYaw);
      if (off < bestOff) {
        bestOff = off;
        best = t;
      }
    }
    this.pointAt(best.at.clone(), best.id === 'board' ? 'Back to the stool' : `Step to the ${best.id === 'table' ? 'work table' : best.id === 'sink' ? 'sink' : best.id === 'shelf' ? 'food shelf' : 'range'}`);
  }

  /** The hand holding this, if one does. */
  private handWith(kind: string): 0 | 1 | null {
    for (const side of [1, 0] as const) if (chef.hands[side].holding === kind) return side;
    return null;
  }

  /** At `place` facing the right way: true. Otherwise one move toward it (a turn, or a step pointed with `hand`) and false. */
  private reachPlace(place: Place, facing: 'back' | 'front', hand?: 0 | 1): boolean {
    if (chef.at !== place) {
      const wantBack = place !== 'seat';
      if (chef.facingBack !== wantBack) {
        this.world.getSystem(TurnSystem)?.turnAround();
        this.say('Turning around');
        return false;
      }
      const t = placeApi.targets().find((x) => x.id === (place === 'seat' ? 'board' : place));
      if (!t) {
        console.log(`[Practice] no step target for ${place}: at ${chef.at}, facingBack ${chef.facingBack}, targets ${placeApi.targets().map((x) => x.id).join('/')}`);
        this.say('Cannot step there now');
        return false;
      }
      this.pointAt(t.at.clone(), place === 'seat' ? 'Back to the stool' : STEP_LABEL[place === 'table' ? 'stepTable' : place === 'range' ? 'stepRange' : place === 'sink' ? 'stepSink' : place === 'shelf' ? 'stepShelf' : 'stepDrain'], hand);
      return false;
    }
    if (chef.facingBack !== (facing === 'back')) {
      this.world.getSystem(TurnSystem)?.turnAround();
      this.say('Turning around');
      return false;
    }
    return true;
  }

  /** The ice box is in reach from the stool or the range, facing the bar. */
  private reachIceBox(hand?: 0 | 1): boolean {
    // A left-handed chef's ice box is at the counter's right end, out of reach from the back row: from the stool.
    if (handedness.left) return this.reachPlace('seat', 'front', hand);
    if (chef.at === 'table') return this.reachPlace('range', 'front', hand);
    return this.reachPlace(chef.at, 'front', hand);
  }

  /** Shift+K: change hands (the morning, before the call, nothing held), as the handedness setting does. */
  private changeHands(): void {
    if (!fishOrderApi.canSwitch() || holdingAnything()) return this.say('Hands change in the morning, before the call, with nothing held');
    setLeftHanded(!handedness.left);
    this.say(`${handedness.left ? 'Left' : 'Right'}-handed`);
    console.log(`[Practice] ${handedness.left ? 'left' : 'right'}-handed`);
  }

  /** Take something and keep it in the hand, lifted. */
  private pickHold(side: 0 | 1, at: Vector3, label: string, lift = v(0, 0.12, 0)): void {
    if (!this.ready(side, Held.None)) return;
    this.run(side, label, [
      // Fingers open first: a pinch left closed by a miss would not start a new one.
      pinch(0),
      move(at, v(0, 0.08, 0.03), 'grasp', 0.35),
      move(at, v(0, 0.004, 0), 'grasp', 0.2),
      wait(0.25),
      pinch(1),
      wait(0.12),
      move(at, lift, 'grasp', 0.3),
    ]);
  }

  /** Let go of what the hand holds over a point. */
  private dropAt(side: 0 | 1, to: Vector3, label: string): void {
    if (this.driver[side].busy) return this.say('Hands are busy');
    this.run(side, label, [move(to, v(0, 0.08, 0), 'grasp', 0.45), move(to, v(0, 0.01, 0), 'grasp', 0.2), pinch(0), wait(0.1), this.rest(side)]);
  }

  /** The side a point is on (the hand to use for it). */
  private sideOf(at: Vector3): 0 | 1 {
    return this.player.worldToLocal(at.clone()).x > 0 ? 1 : 0;
  }

  /** A : the next step of the shari, at the work table (stepping there and back, and turning, as needed). */
  private shariKey(): void {
    if (shari.step === 'done') {
      // In service (full) the chef may cook another batch himself: to the work table, then point at the cooker (1 sho).
      if (!chefRiceInService()) return this.say(pantry.cookLeft > 0 ? 'The cook is cooking the rice' : 'The shari is in the ohitsu');
      if (!this.reachPlace('table', 'back')) return;
      return this.pointAt(shari.cookerAt.clone(), 'Light the rice cooker: 1 sho more');
    }
    const tub = this.handWith(Held.Ohitsu);
    if (tub !== null) {
      const other = (1 - tub) as 0 | 1;
      if (shari.step === 'return') {
        if (!this.reachPlace('seat', 'front', other)) return;
        return this.dropAt(tub, shari.tubHomeAt.clone().add(v(0, 0.05, 0)), 'Ohitsu back on its stand');
      }
      if (!this.reachPlace('table', 'back', other)) return;
      return this.dropAt(tub, shari.tubTableAt.clone().add(v(0, 0.05, 0)), 'Ohitsu onto the work table');
    }
    const side = chef.riceSide;
    switch (shari.step) {
      case 'light':
      case 'turnOut':
        if (!this.reachPlace('table', 'back')) return;
        return this.pointAt(shari.cookerAt.clone(), shari.step === 'light' ? 'Light the rice cooker' : 'Turn the rice out into the hangiri');
      case 'cooking':
      case 'steaming':
        return this.say(`Rice ${shari.step}: ${Math.ceil(shari.left)} s (meanwhile the fish)`);
      case 'vinegar': {
        if (!this.reachPlace('table', 'back') || !this.ready(side, Held.None)) return;
        const bowl = shari.awasezuAt.clone();
        return this.run(side, 'Awasezu over the rice', [
          move(bowl, v(0, 0.06, -0.02), 'grasp', 0.35, { yaw: 0 }),
          move(bowl, v(0, 0, 0), 'grasp', 0.2),
          wait(0.25),
          pinch(1),
          wait(0.12),
          move(shari.hangiriAt.clone(), v(0, 0.22, 0), 'grasp', 0.5),
          wait(AWASEZU_SECONDS + 0.4),
          move(bowl, v(0, 0.06, 0), 'grasp', 0.5),
          move(bowl, v(0, 0.01, 0), 'grasp', 0.15),
          pinch(0),
          wait(0.1),
          this.rest(side),
        ]);
      }
      case 'cut': {
        if (!this.reachPlace('table', 'back') || !this.ready(side, Held.None)) return;
        const grip = shari.shamojiAt.clone();
        const h = shari.hangiriAt;
        // The blade dips 5 cm below the grip, 12 cm on: the grip so that the blade is in the rice's middle.
        const at = v(h.x, SINK_TOP + 0.12, h.z - 0.122);
        return this.run(side, 'Cutting the shari', [
          move(grip, v(0, 0.06, -0.02), 'grasp', 0.35, { yaw: 0 }),
          move(grip, v(0, 0, 0), 'grasp', 0.2),
          wait(0.25),
          pinch(1),
          wait(0.12),
          move(at, v(0, 0.06, 0), 'grasp', 0.35),
          move(at, v(0, 0, 0), 'grasp', 0.2),
          rub(at, v(0, 0, 0), 'grasp', 8, 0.08, 1.4, () => shari.step !== 'cut'),
          move(grip, v(0, 0.06, 0), 'grasp', 0.4),
          move(grip, v(0, 0, 0), 'grasp', 0.15),
          pinch(0),
          wait(0.1),
          this.rest(side),
        ]);
      }
      case 'scoop': {
        if (!shari.tubOnTable) {
          // Fetch the ohitsu from its stand by the stool (its near rim).
          if (!this.reachPlace('seat', 'front')) return;
          const home = shari.tubHomeAt;
          const rim = v(home.x - sideX(0.14), home.y + 0.04, home.z - 0.04);
          return this.pickHold(side, rim, 'Taking the ohitsu (its lid stays)');
        }
        if (!this.reachPlace('table', 'back') || !this.ready(side, Held.None)) return;
        const grip = shari.shamojiAt.clone();
        const h = shari.hangiriAt;
        const t = shari.tubTableAt;
        const inRice = v(h.x, SINK_TOP + 0.03 + 0.048, h.z - 0.122);
        const overTub = v(t.x, t.y + 0.05 + 0.048, t.z - 0.122);
        const steps = [move(grip, v(0, 0.06, -0.02), 'grasp', 0.35, { yaw: 0 }), move(grip, v(0, 0, 0), 'grasp', 0.2), wait(0.25), pinch(1), wait(0.12)];
        for (let i = shari.scoops; i < SHARI_SCOOPS; i++) {
          steps.push(move(inRice, v(0, 0.05, 0), 'grasp', 0.3), move(inRice, v(0, 0, 0), 'grasp', 0.2), wait(0.12));
          steps.push(move(overTub, v(0, 0.05, 0), 'grasp', 0.35), move(overTub, v(0, 0, 0), 'grasp', 0.15), wait(0.15));
        }
        steps.push(move(grip, v(0, 0.06, 0), 'grasp', 0.4), move(grip, v(0, 0, 0), 'grasp', 0.15), pinch(0), wait(0.1), this.rest(side));
        return this.run(side, 'Scooping the shari into the ohitsu', steps);
      }
      case 'return': {
        if (!this.reachPlace('table', 'back')) return;
        const t = shari.tubTableAt;
        return this.pickHold(side, v(t.x, t.y + 0.04, t.z - 0.15), 'Taking the full ohitsu');
      }
    }
  }

  /** Enter : the next thing at the range (stepping and turning as needed): a knob, an ingredient into its pot or out to the case, the net, the bonito belly. */
  private rangeKey(): void {
    if (!prep.active) return this.say('The bar is open');
    const held = this.handWith(Held.Saku);
    const net = this.handWith(Held.Net);
    // A flame wanting a turn comes first, with whichever hand is free.
    const knob = range.burners.find((b) => b.want === 'knob');
    const free = chef.hands[chef.riceSide].holding === Held.None ? chef.riceSide : chef.hands[chef.netaSide].holding === Held.None ? chef.netaSide : null;
    if (knob && free !== null) {
      const other = (1 - free) as 0 | 1;
      if (!this.reachPlace('range', 'back', chef.hands[other].holding === Held.None ? undefined : free)) return;
      return this.turnKnob(knob, free);
    }
    if (net !== null) {
      const free = range.burners.find((b) => b.state === 'out' && !b.net && !b.pan);
      if (!this.reachPlace('range', 'back', (1 - net) as 0 | 1)) return;
      return free ? this.dropAt(net, free.at.clone().setY(free.at.y - 0.02), 'Net onto the burner') : this.say('No burner free yet');
    }
    if (held !== null) {
      const other = (1 - held) as 0 | 1;
      // The tamago's pan or the baked tamago in hand: the tamago's own key.
      if (tamago.panHeld || tamago.eggHeld || tamago.oilHeld || tamago.lidHeld || tamago.flipSticksHeld) return this.tamagoKey();
      // A pot from the cupboard under the sink: onto its burner.
      if (range.potHeld) {
        const b = range.burners.find((x) => x.id === prep.takeId);
        if (!b) return;
        if (!this.reachPlace('range', 'back', other)) return;
        return this.dropAt(held, b.at.clone().add(v(0, 0.1, 0)), 'The pot onto its burner');
      }
      if (prep.next === 'pot') {
        // The tamago's scallops go into the suribachi on the work table.
        const tamagoIn = prep.onBoard === 'Tamago';
        if (!this.reachPlace(tamagoIn ? 'table' : 'range', 'back', other)) return;
        if (prep.onBoard === 'Octopus' && range.octopus === 'wait') return this.say('The water is not boiling yet');
        if (prep.onBoard === 'Octopus' && range.octopus === 'dip') {
          // Its leg tips into the boiling water till they curl; the next press lets it go.
          if (this.driver[held].busy) return this.say('Hands are busy');
          const to = hands.all[held].grasp.clone().add(range.dipOff);
          return this.run(held, 'Dipping the leg tips', [move(to, v(0, 0.12, 0), 'grasp', 0.45), move(to, v(0, 0, 0), 'grasp', 0.3), wait(OCTOPUS_DIP_SECONDS + 0.8)]);
        }
        return this.dropAt(held, prep.slotAt.clone().add(v(0, 0.08, 0)), tamagoIn ? 'Into the suribachi' : 'Into its pot');
      }
      if (range.ingHeld || (range.bellyHeld && range.belly === 'free')) {
        if (!this.reachPlace('seat', 'front', other)) return;
        return this.dropAt(held, range.caseAt.clone().add(v(0, 0.04, -0.04)), 'Into the case');
      }
      if (range.bellyHeld) {
        if (range.belly === 'skewered') {
          if (!this.reachPlace('range', 'back', other)) return;
          return this.dropAt(held, range.netAt.clone().add(v(0, 0.02, 0)), 'Onto the net, skin down');
        }
        if (range.belly === 'net') {
          if (!this.reachIceBox(other)) return;
          const ice = stations.get(StationKind.IceBox);
          return ice ? this.dropAt(held, ice.pos.clone().add(v(0, 0.06, 0)), 'Onto the ice') : undefined;
        }
        if (!this.reachPlace('seat', 'front', other)) return;
        const board = stations.get(StationKind.CuttingBoard);
        return board ? this.dropAt(held, board.pos.clone().add(v(sideX(-0.2), 0.02, 0)), 'Onto the board') : undefined;
      }
    }
    if (held !== null || net !== null) return this.say('Hands are full');
    // The tamago's pan, turn and out come first (as the master has it); then a pot still in the cupboard before its ingredient is taken.
    const tamagoFirst = tamago.next === 'pan' || tamago.next === 'place' || tamago.next === 'turn' || tamago.next === 'lid' || tamago.next === 'press' || tamago.next === 'turnOut' || tamago.next === 'out' || tamago.next === 'case';
    if (tamagoFirst) return this.tamagoKey();
    const stored = prep.next === 'take' && prep.takeToPot && prep.takeId !== 'Tamago' ? range.burners.find((b) => b.id === prep.takeId && b.stored) : undefined;
    if (stored) {
      // Its pot first: the cupboard's right door, then the pot by its middle.
      const side = chef.riceSide;
      if (!this.reachPlace('sink', 'back')) return;
      if (!this.ready(side, Held.None)) return;
      if (cupboard.open !== 'right') {
        const h = cupboard.rightHandleAt.clone();
        return this.run(side, 'The cupboard door', [move(h, v(0, 0, -0.08), 'grasp', 0.4), move(h, v(0, 0, -0.01), 'grasp', 0.2), wait(0.2), pinch(1), wait(0.15), pinch(0), wait(0.1), this.rest(side)]);
      }
      return this.pickHold(side, stored.potAt.clone(), 'The pot from the cupboard', v(0, 0.08, -0.15));
    }
    if (prep.next === 'take' && prep.takeToPot) {
      if (!this.reachIceBox()) return;
      const box = prep.boxAt.clone();
      return this.pickHold(this.sideOf(box), box, 'From the ice, for its pot');
    }
    const done = range.burners.find((b) => b.want === 'take');
    if (done) {
      if (!this.reachPlace('range', 'back')) return;
      return this.pickHold(this.sideOf(done.at), done.at.clone(), 'Out of the pot');
    }
    return this.bellyKey();
  }

  /**
   * The tamago (full): the batter in the suribachi (the pestle round and
   * round, the eggs in, round again), the pan off its hook onto a free
   * burner, the batter poured, turned once by its handle, out into the case.
   */
  private tamagoKey(): void {
    if (!prep.active) return this.say('The bar is open');
    const side = chef.riceSide;
    if (tamago.pestleHeld) return this.say('Going round with the pestle');
    if (tamago.sticksHeld) return this.say('Going round with the chopsticks');
    if (tamago.jarHeld) {
      const held = this.handWith(Held.Saku) ?? side;
      if (!this.reachPlace('table', 'back', (1 - held) as 0 | 1)) return;
      return this.dropAt(held, tamago.bowlAt.clone().add(v(0, 0.14, 0)), tamago.next === 'sugar' ? 'A teaspoon of sugar' : 'A pinch of salt');
    }
    if (tamago.next === 'salt' || tamago.next === 'sugar') {
      // The jar from the food shelf by the end wall.
      if (!this.reachPlace('shelf', 'back')) return;
      return this.pickHold(side, (tamago.next === 'salt' ? tamago.saltAt : tamago.sugarAt).clone(), tamago.next === 'salt' ? 'The salt jar' : 'The sugar jar', v(0, 0.08, -0.1));
    }
    if (tamago.bowlHeld) {
      const held = this.handWith(Held.Saku) ?? side;
      if (tamago.next === 'suribachi') {
        // From the cupboard to its place on the work table.
        if (!this.reachPlace('table', 'back', (1 - held) as 0 | 1)) return;
        return this.dropAt(held, tamago.tableAt.clone().add(v(0, 0.1, 0)), 'The suribachi onto the work table');
      }
      if (!this.reachPlace('range', 'back', (1 - held) as 0 | 1)) return;
      return this.dropAt(held, tamago.panAt.clone().add(v(0, 0.12, 0)), 'Poured into the pan');
    }
    // The oil pot in hand: over the hot pan (the oil round it, the rest back into the pot); the lid: onto the tamago.
    if (tamago.oilHeld || tamago.lidHeld) {
      const held = this.handWith(Held.Saku) ?? side;
      if (!this.reachPlace('range', 'back', (1 - held) as 0 | 1)) return;
      return tamago.oilHeld
        ? this.dropAt(held, tamago.panAt.clone().add(v(0, 0.1, 0)), 'Oil round the hot pan')
        : this.dropAt(held, tamago.panAt.clone().add(v(0, 0.035, 0)), 'The lid on the tamago');
    }
    if (tamago.flipSticksHeld) return this.say('Tossing it over');
    if (tamago.next === 'oil') {
      // The oil pot from the food shelf (the oil is a seasoning).
      if (!this.reachPlace('shelf', 'back')) return;
      return this.pickHold(side, tamago.oilAt.clone(), 'The oil pot', v(0, 0.08, -0.1));
    }
    if (tamago.next === 'heat') return this.say('The pan heats on a medium flame');
    if (tamago.next === 'cool') return this.say('It cools a little on the lid');
    if (tamago.next === 'wipe') {
      // A sheet from the paper box at the bar, then round inside the hot pan, then into the trash.
      const paper = this.handWith(Held.Paper);
      if (paper === null) {
        if (!this.reachPlace('seat', 'front')) return;
        return this.pickHold(side, prep.paperAt.clone(), 'A sheet of kitchen paper', v(0, 0.1, 0));
      }
      if (!this.reachPlace('range', 'back', (1 - paper) as 0 | 1)) return;
      const pan = tamago.panAt.clone();
      return this.run(paper, 'Wiping the pan (no soap on the copper)', [
        move(pan, v(0, 0.02, 0), 'grasp', 0.35),
        rub(pan, v(0, -0.01, 0), 'grasp', 3, 0.05, 2, () => tamago.next !== 'wipe'),
        move(prep.trashAt.clone(), v(0, 0.12, 0), 'grasp', 0.6),
        pinch(0),
        wait(0.1),
        this.rest(paper),
      ]);
    }
    if (tamago.next === 'cupboard') {
      // The cupboard under the sink: a pinch on its door's handle slides it open.
      if (!this.reachPlace('sink', 'back')) return;
      if (!this.ready(side, Held.None)) return;
      const h = cupboard.leftHandleAt.clone();
      return this.run(side, 'The cupboard door', [move(h, v(0, 0, -0.08), 'grasp', 0.4), move(h, v(0, 0, -0.01), 'grasp', 0.2), wait(0.2), pinch(1), wait(0.15), pinch(0), wait(0.1), this.rest(side)]);
    }
    if (tamago.next === 'suribachi') {
      if (!this.reachPlace('sink', 'back')) return;
      return this.pickHold(side, tamago.rimAt.clone(), 'The suribachi from the cupboard', v(0, 0.08, -0.15));
    }
    if (tamago.next === 'grind' || tamago.next === 'whisk') {
      if (!this.reachPlace('table', 'back')) return;
      if (!this.ready(side, Held.None)) return;
      const grip = (tamago.next === 'grind' ? tamago.pestleAt : tamago.sticksAt).clone();
      const c = tamago.bowlAt.clone();
      const steps = [pinch(0), move(grip, v(0, 0.04, -0.03), 'grasp', 0.3), move(grip, v(0, 0, 0), 'grasp', 0.2), wait(0.2), pinch(1), wait(0.15)];
      // Round and round over the floor's middle, eight rounds.
      for (let k = 0; k <= 8 * 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        steps.push(move(c, v(Math.cos(a) * 0.05, 0.12, Math.sin(a) * 0.05), 'grasp', 0.08));
      }
      steps.push(pinch(0), wait(0.1), this.rest(side));
      return this.run(side, tamago.next === 'grind' ? 'Grinding the scallops' : 'Mixing till frothy', steps);
    }
    if (tamago.next === 'eggs') {
      // A tap on the pack of eggs: they go in (the cracking is skipped).
      if (!this.reachPlace('table', 'back')) return;
      if (!this.ready(side, Held.None)) return;
      const at = tamago.packAt.clone();
      return this.run(side, 'Tap the pack of eggs', [move(at, v(0, 0.08, 0), 'grasp', 0.4), move(at, v(0, 0.01, 0), 'grasp', 0.2), wait(0.15), pinch(1), wait(0.15), pinch(0), wait(0.1), this.rest(side)]);
    }
    if (tamago.next === 'pour') {
      if (!this.reachPlace('table', 'back')) return;
      return this.pickHold(side, tamago.rimAt.clone(), 'The suribachi, by its rim');
    }
    if (tamago.panHeld) {
      if (!this.reachPlace('range', 'back', (1 - side) as 0 | 1)) return;
      return this.dropAt(side, tamago.burnerAt.clone().add(v(0, 0.06, 0)), 'The pan onto the burner');
    }
    if (tamago.eggHeld) {
      const held = this.handWith(Held.Saku) ?? side;
      if (!this.reachPlace('seat', 'front', (1 - held) as 0 | 1)) return;
      return this.dropAt(held, tamago.caseAt.clone().add(v(0, 0.04, -0.04)), 'Into the case');
    }
    if (tamago.next === 'out') {
      // The cooled tamago from its lid on the work table.
      if (!this.reachPlace('table', 'back')) return;
      return this.pickHold(side, tamago.eggAt.clone(), 'From the lid');
    }
    if (!this.reachPlace('range', 'back')) return;
    if (tamago.next === 'pan') return this.pickHold(side, tamago.gripAt.clone(), 'The tamago pan, by its handle', v(0, 0.05, -0.05));
    if (tamago.next === 'lid') return this.pickHold(side, tamago.lidAt.clone(), 'The lid, by its bar', v(0, 0.06, -0.06));
    if (tamago.next === 'press') {
      if (!this.ready(side, Held.None)) return;
      const lid = tamago.lidAt.clone();
      return this.run(side, 'Pressing the lid down', [
        pinch(0),
        pose('open'),
        move(lid, v(0, 0.12, 0), 'palm', 0.35),
        move(lid, v(0, 0.015, 0), 'palm', 0.25),
        wait(0.3),
        move(lid, v(0, 0.12, 0), 'palm', 0.2),
        pose('default'),
        this.rest(side),
      ]);
    }
    if (tamago.next === 'turnOut') {
      if (!this.ready(side, Held.None)) return;
      const grip = tamago.gripAt.clone();
      return this.run(side, 'Turning it out onto the lid', [
        pinch(0),
        move(grip, v(0, 0.04, -0.03), 'grasp', 0.3),
        move(grip, v(0, 0, 0), 'grasp', 0.2),
        wait(0.2),
        pinch(1),
        wait(0.15),
        move(grip, v(0, 0.1, 0), 'grasp', 0.4),
        wait(1.2),
        move(grip, v(0, 0.01, 0), 'grasp', 0.3),
        pinch(0),
        wait(0.1),
        this.rest(side),
      ]);
    }
    if (tamago.next !== 'turn') return this.say('The tamago bakes');
    // The toss, like fried rice: the chopsticks in the rice hand, the handle in the neta hand flicked up.
    const stickHand = chef.riceSide;
    const panHand = chef.netaSide;
    if (!this.ready(stickHand, Held.None) || !this.ready(panHand, Held.None)) return;
    const sticks = tamago.sticksAt.clone();
    const grip = tamago.gripAt.clone();
    this.run(stickHand, 'The chopsticks', [
      pinch(0),
      move(sticks, v(0, 0.04, -0.03), 'grasp', 0.3),
      move(sticks, v(0, 0, 0), 'grasp', 0.2),
      wait(0.2),
      pinch(1),
      wait(0.15),
      move(sticks, v(-0.05, 0.06, 0), 'grasp', 0.3),
      wait(2.2),
      pinch(0),
      wait(0.1),
      this.rest(stickHand),
    ]);
    this.run(panHand, 'Tossing it over', [
      pinch(0),
      wait(1.3),
      move(grip, v(0, 0.04, -0.03), 'grasp', 0.25),
      move(grip, v(0, 0, 0), 'grasp', 0.2),
      wait(0.2),
      pinch(1),
      wait(0.15),
      move(grip, v(0, 0.11, 0), 'grasp', 0.08),
      wait(0.9),
      move(grip, v(0, 0.01, 0), 'grasp', 0.3),
      pinch(0),
      wait(0.1),
      this.rest(panHand),
    ]);
  }

  /** One knob, with this hand: a tap lights it on high or puts it out; kept pinched it turns down a notch at a time (high, medium, low). */
  private turnKnob(knob: BurnerView, side: 0 | 1): void {
    if (!this.ready(side, Held.None)) return;
    const at = knob.knobAt.clone();
    const names = ['off', 'low', 'medium', 'high'];
    const tap = knob.target === 0 || knob.level === 0 || knob.target > knob.level;
    const notches = tap ? 0 : knob.level - knob.target;
    const hold = tap ? 0.15 : KNOB_HOLD + KNOB_STEP * (notches - 1) + 0.2;
    this.run(side, `Knob (${knob.id}): ${tap ? (knob.level === 0 ? 'light it, high' : 'off') : `down to ${names[knob.target]}`}`, [
      move(at, v(0, 0.04, 0.05), 'grasp', 0.35),
      move(at, v(0, 0.01, -0.01), 'grasp', 0.2),
      wait(0.2),
      pinch(1),
      wait(hold),
      pinch(0),
      wait(0.35),
      move(at, v(0, 0.04, 0.06), 'grasp', 0.2),
      this.rest(side),
    ]);
  }

  /** The bonito belly's next step (Enter): from the ice, skewers, the net, a turn, the ice, paper, skewers out, the case. */
  private bellyKey(): void {
    const rings = range.ringsAt.clone();
    const side = chef.riceSide;
    switch (range.belly) {
      case 'none':
        return this.say(range.burners.some((b) => b.state === 'cooking') ? 'Pots simmering' : 'Nothing at the range now');
      case 'ice':
      case 'chilled':
        if (!this.reachIceBox()) return;
        return this.pickHold(chef.riceSide, range.bellyAt.clone(), 'The belly from the ice');
      case 'board':
      case 'patted': {
        if (!this.reachPlace('seat', 'front') || !this.ready(side, Held.None)) return;
        const into = range.belly === 'board';
        return this.run(side, into ? 'Skewers in through the skin side' : 'Pulling the skewers out', [
          move(rings, v(0, 0.04, 0.02), 'grasp', 0.35),
          move(rings, v(0, 0, 0), 'grasp', 0.2),
          wait(0.25),
          pinch(1),
          wait(0.12),
          move(rings, v(0, 0, into ? -0.17 : 0.17), 'grasp', 0.9),
          pinch(0),
          wait(0.1),
          this.rest(side),
        ]);
      }
      case 'skewered':
        if (range.netOn < 0) {
          if (!range.burners.some((b) => b.state === 'out')) return this.say('The net needs a free burner: finish a pot first');
          if (!this.reachPlace('range', 'back')) return;
          return this.pickHold(this.sideOf(range.netAt), range.netAt.clone(), 'The net from its hook');
        }
        if (!this.reachPlace('seat', 'front')) return;
        return this.pickHold(side, range.bellyAt.clone(), 'The belly, by its skewers');
      case 'net': {
        if (!this.reachPlace('range', 'back') || !this.ready(side, Held.None)) return;
        if (range.bellySeared) return this.pickHold(this.sideOf(rings), rings, 'Off the net', v(0, 0.12, -0.04));
        if (!range.faceDone) return this.say('Searing: wait for this side');
        return this.run(this.sideOf(rings), 'A quarter turn', [
          move(rings, v(0, 0.04, 0), 'grasp', 0.3),
          move(rings, v(0, 0, 0), 'grasp', 0.2),
          wait(0.2),
          pinch(1),
          wait(0.15),
          pinch(0),
          wait(0.35),
          this.rest(this.sideOf(rings)),
        ]);
      }
      case 'chilling':
        return this.say('Chilling on the ice');
      case 'wet': {
        if (!this.reachPlace('seat', 'front') || !this.ready(side, Held.None)) return;
        const box = prep.paperAt.clone();
        const fish = range.bellyAt.clone();
        return this.run(side, 'Patting it dry', [
          move(box, v(0, 0.08, 0), 'grasp', 0.3),
          move(box, v(0, 0.01, 0), 'grasp', 0.15),
          wait(0.25),
          pinch(1),
          wait(0.12),
          move(fish, v(0, 0.05, 0), 'grasp', 0.35),
          move(fish, v(0, 0.02, 0), 'grasp', 0.15),
          rub(fish, v(0, 0.02, 0), 'grasp', 3, 0.04, 2, () => range.belly !== 'wet'),
          move(prep.trashAt.clone(), v(0, 0.12, 0), 'grasp', 0.45),
          pinch(0),
          wait(0.1),
          this.rest(side),
        ]);
      }
      case 'free':
        if (!this.reachPlace('seat', 'front')) return;
        return this.pickHold(side, range.bellyAt.clone(), 'The belly, for the case');
      case 'done':
        return this.say(range.burners.some((b) => b.state === 'cooking' || b.state === 'done') ? 'Pots still on the range' : 'The range work is done');
    }
  }

  /** = : point at the telephone in the office corner (the aisle's right end) and pinch: the fish shop is called. */
  /** = : point at the phone (the phone book comes up), then = again pinches its fish shop line. */
  private callFishShop(): void {
    this.phoneLine(['fish'], 'Phone: the fish shop');
  }

  /**
   * A line of the phone book (src/phone-book-system.ts), one key press a
   * step: with the book shut, point at the phone; then pinch the deepest
   * line of the path the card shows now (or Back, to get there).
   */
  private phoneLine(path: PhoneRowId[], label: string): void {
    if (!phoneApi.book) return this.pointAt(staff.phoneAt, 'Pointing at the phone');
    const at = new Vector3();
    for (let i = path.length - 1; i >= 0; i--) {
      if (phoneBookApi.rowAt(path[i], at)) return this.pinchCard(at, `${label} (${path[i]})`);
    }
    if (phoneBookApi.rowAt('back', at)) this.pinchCard(at, 'Phone: back');
  }

  /**
   * Pinch a point on the phone book's card, from just in front of it, with
   * the nearer empty hand. The card reads where the pinch was aimed
   * (HandReader.pinchPoint), so the hand rests on the line a moment first.
   */
  private pinchCard(at: Vector3, label: string): void {
    const side: 0 | 1 = this.player.worldToLocal(at.clone()).x > 0 ? 1 : 0;
    if (!this.ready(side, Held.None)) return;
    this.run(side, label, [move(at, v(0, 0, 0.01), 'grasp', 0.4), wait(0.25), pinch(1), wait(0.15), pinch(0), wait(0.1), this.rest(side)]);
  }

  /**
   * Tab while the fish shop is on the line (full): each case item under half
   * is pinched until its order is the full amount; then a point at the
   * phone ends the call.
   */
  private orderFish(): void {
    const want = this.orderWanted();
    if (!want) return this.pointAt(staff.phoneAt, 'Pointing at the phone: that is all');
    this.pinchCase(want, `Ordering: ${NETA[want].name.toLowerCase()}`);
  }

  /** A pinch on a case item (sold out or not), by the hand of its side of the case. */
  private pinchCase(neta: NetaId, label: string): void {
    const side = NETA[neta].hand === 'neta' ? chef.netaSide : chef.riceSide;
    if (!this.ready(side, Held.None)) return;
    let at: Vector3 | null = null;
    for (const entity of this.queries.items.entities) {
      if (entity.getValue(CaseItem, 'neta') !== neta || !entity.object3D) continue;
      at = entity.object3D.getWorldPosition(new Vector3());
    }
    if (!at) return this.say(`No ${NETA[neta].name} in the case`);
    this.run(side, label, [
      move(at, v(0, 0.1, 0.03), 'grasp', 0.35),
      move(at, v(0, 0.015, -0.015), 'grasp', 0.2),
      wait(0.2),
      pinch(1),
      wait(0.12),
      pinch(0),
      this.rest(side),
    ]);
  }

  /** A case item under half whose order is not yet its full amount. */
  private orderWanted(): NetaId | null {
    for (const entity of this.queries.items.entities) {
      const neta = entity.getValue(CaseItem, 'neta') as NetaId;
      const id = orderOf(neta);
      // Only the shop on the line's own things.
      if ((entity.getValue(CaseItem, 'remaining') ?? 0) * 2 >= NETA[neta].stock || supplierOf(id) !== fishOrder.calling) continue;
      const sizes = sizesOf(id);
      const at = fishOrder.lines.get(id);
      if (at === sizes.length - 1) continue;
      return neta;
    }
    return null;
  }

  /** [ : the board — lift it, wash it at the sink, stand it to drain, lift it again, put it back. T turns around between. */
  private boardStep(): void {
    const neta = chef.netaSide;
    const rice = chef.riceSide;
    const next = prep.next;
    if (next === 'liftBoard') {
      if (!this.ready(neta, Held.None)) return;
      const leaning = prep.boardAt.z > 0;
      const at = prep.boardAt.clone().add(leaning ? v(0, 0, 0) : v(0, 0.022, 0.17));
      this.run(neta, 'Lifting the board (then T to turn)', [
        move(at, v(0, 0.08, 0.03), 'grasp', 0.35),
        move(at, v(0, 0, 0), 'grasp', 0.2),
        wait(0.25),
        pinch(1),
        wait(0.15),
        moveLocal(v(-0.12, 1.0, -0.28), 'grasp', 0.4),
        hold(),
      ]);
      return;
    }
    if (next === 'washBoard') {
      const sink = this.reachable(StationKind.Sink);
      if (!sink) return;
      this.run(neta, 'Board over the sink', [move(sink, v(0.12, 0.06, -0.05), 'grasp', 0.4), hold()]);
      this.run(rice, 'Scrubbing it under the tap', [
        move(sink, v(-0.05, 0.02, 0), 'palm', 0.4),
        rub(sink, v(-0.05, 0.02, 0), 'palm', 3, 0.06, 2, () => prep.next !== 'washBoard'),
        this.rest(rice),
      ]);
      return;
    }
    if (next === 'leanBoard') {
      this.run(neta, 'Standing it to drain', [pinch(0), wait(0.1), this.rest(neta)]);
      return;
    }
    if (next === 'dryBoard') return this.say('It is draining: wait a little');
    if (next === 'returnBoard') {
      const home = prep.boardHome.clone().add(v(0, 0.06, 0.17));
      this.run(neta, 'Board back on the counter', [move(home, v(0, 0.05, 0), 'grasp', 0.4), move(home, v(0, 0, 0), 'grasp', 0.2), pinch(0), wait(0.1), this.rest(neta)]);
      return;
    }
    this.say('Nothing to do with the board now');
  }

  /** ] : point at the noren at the entrance and pinch: hung out, the bar opens. */
  private hangNoren(): void {
    this.pointAt(prep.norenAt, 'Pointing at the noren');
  }

  /** ; and ': the cook's or the part-timer's line on the phone book, to call them in or let them off (a press a step). */
  private askStaff(who: 'cook' | 'partTimer'): void {
    this.phoneLine([who], `Phone: the ${who === 'cook' ? 'cook' : 'part-timer'}`);
  }

  /** Shift+, (practice only): the seated customer asks for tea now. */
  private askTea(): void {
    if (!service.order || tea.wanted) return this.say(tea.wanted ? 'Tea is already asked for' : 'No customer waiting');
    tea.wanted = true;
    this.say('The customer asks for tea (practice)');
  }

  /** , : tea asked for, nobody else to make it: point at the urn under the phone and pinch. */
  private pourTea(): void {
    if (!tea.wanted) return this.say('Nobody has asked for tea');
    if (staff.partTimer) return this.say('The part-timer brings the tea');
    if (tea.cup !== 'none') return this.say('The tea is made: carry it (.)');
    this.pointAt(tea.urnAt, 'Pointing at the urn');
  }

  /** . : the cup at hand, right of the board, over the case and down onto the tsukedai before the customer. */
  private serveTea(): void {
    if (tea.cup !== 'atHand') return this.say(tea.cup === 'pouring' ? 'Pouring: wait a moment' : 'No cup at hand (, to pour one)');
    const side: 0 | 1 = 1;
    if (!this.ready(side, Held.None)) return;
    const cup = tea.cupAt.clone();
    const to = tea.serveAt.clone();
    this.run(side, 'Tea onto the tsukedai', [
      move(cup, v(0, 0.16, 0.03), 'grasp', 0.35),
      move(cup, v(0, 0.06, 0), 'grasp', 0.2),
      wait(0.2),
      pinch(1),
      wait(0.12),
      move(cup, v(0, 0.22, 0), 'grasp', 0.25),
      move(to, v(0, 0.4, 0.05), 'grasp', 0.45),
      move(to, v(0, 0.08, 0), 'grasp', 0.3),
      pinch(0),
      wait(0.1),
      move(to, v(0, 0.35, 0.05), 'grasp', 0.25),
      this.rest(side),
    ]);
  }

  /** Out from the shoulder toward something far, index finger pointing, then a pinch: the hand on that side. */
  private pointAt(target: Vector3, label: string, hand?: 0 | 1): void {
    const right = hand !== undefined ? hand === 1 : this.player.worldToLocal(target.clone()).x > 0;
    const side: 0 | 1 = right ? 1 : 0;
    if (!this.ready(side, Held.None)) return;
    const shoulder = this.player.localToWorld(v(right ? SHOULDER_X : -SHOULDER_X, 1.02, 0.06));
    // The arm well out (a near target, the customer, still has the fingertip clear of the head), the fingertip short of a target near at hand.
    const reach = Math.min(0.55, Math.max(0.42, target.clone().sub(shoulder).setY(0).length() - 0.3));
    const toward = target.clone().sub(shoulder).setY(0).normalize().multiplyScalar(reach).add(shoulder);
    toward.y = 1.08;
    // Pointed across the body, the hand still goes well out from the head (the game wants it held out).
    const head = this.player.localToWorld(v(0, SEATED_EYE_HEIGHT, 0));
    const out = toward.clone().sub(head).setY(0);
    if (out.length() < 0.5) toward.copy(head).add(out.setLength(0.5)).setY(1.08);
    // The fingers turned toward it from where the hand is (0 = forward, + = left, in the chef's frame).
    const local = this.player.worldToLocal(target.clone()).sub(this.player.worldToLocal(toward.clone()));
    const yaw = (Math.atan2(-local.x, -local.z) * 180) / Math.PI;
    this.run(side, label, [move(toward, v(0, 0, 0), 'grasp', 0.4, { yaw }), pose('point'), wait(0.5), pinch(1), wait(0.15), pinch(0), pose('default'), wait(0.1), this.rest(side)]);
  }

  /** X on a roll: the neta hand steadies the roll, the blade is drawn across the next guide line. */
  /** Tab: the squeezed roll pinched off the mat and laid on the bare board, to be cut there. */
  private rollToBoard(): void {
    const neta = chef.netaSide;
    if (!this.ready(neta, Held.None)) return;
    const roll = progress.pieceAt.clone();
    const spot = progress.rollSpot.clone();
    this.run(neta, 'The roll onto the board', [
      pinch(0),
      move(roll, v(0, 0.06, 0), 'grasp', 0.35),
      move(roll, v(0, 0.012, 0), 'grasp', 0.2),
      wait(0.2),
      pinch(1),
      wait(0.12),
      move(roll, v(0, 0.08, 0), 'grasp', 0.25),
      move(spot, v(0, 0.08, 0), 'grasp', 0.4),
      move(spot, v(0, 0.015, 0), 'grasp', 0.2),
      pinch(0),
      wait(0.1),
      this.rest(neta),
    ]);
  }

  private cutRoll(): void {
    const rice = chef.riceSide;
    const neta = chef.netaSide;
    if (!progress.squeezed) return this.say('Roll and squeeze it first (I, Space)');
    if (!progress.rollOnBoard) return this.say('Off the mat onto the board first (Tab)');
    if (progress.cutsDone >= progress.cutsNeeded) return this.say('All cut: put the knife down (W, K), carry it (M)');
    if (this.driver[rice].busy || this.driver[neta].busy) return this.say('Hands are busy');
    const roll = progress.pieceAt.clone();
    const guide = progress.guideAt.clone();
    this.run(neta, 'Hand on the roll', [move(roll, v(sideX(-0.07), 0.04, 0), 'palm', 0.3), wait(1.25), this.rest(neta)]);
    this.run(rice, `Cut ${progress.cutsDone + 1} of ${progress.cutsNeeded}`, [
      wait(0.3),
      move(guide, v(0, 0.18, 0.09), 'palm', 0.3, { yaw: 0 }),
      move(guide, v(0, 0.05, 0.09), 'palm', 0.15),
      move(guide, v(0, 0.05, 0.23), 'palm', 0.5),
      move(guide, v(0, 0.18, 0.23), 'palm', 0.15),
      moveLocal(sideV(KNIFE_READY), 'palm', 0.3),
    ]);
  }

  /** W: wipe the blade on the wet cloth before putting the knife down. */
  private wipeBlade(): void {
    const side = chef.riceSide;
    if (chef.hands[side].holding !== Held.Knife) return this.say('Hold the knife first (K)');
    if (this.driver[side].busy) return this.say('Rice hand is busy');
    const at = this.reachable(StationKind.WetCloth);
    if (!at) return;
    this.run(side, 'Wiping the blade', [
      move(at, v(0, 0.16, 0.1), 'palm', 0.3, { yaw: 0 }),
      move(at, v(0, 0.08, 0.1), 'palm', 0.15),
      rub(at, v(0, 0.08, 0.1), 'palm', 0.8, 0.04, 2, () => !chef.knifeDirty),
      move(at, v(0, 0.16, 0.1), 'palm', 0.15),
      moveLocal(sideV(KNIFE_READY), 'palm', 0.3),
    ]);
  }

  // ---- verbs: the nigiri ------------------------------------------------------------

  /** N: the neta hand picks the slice up; it rests on the fingers in front of the chef. */
  private takeNeta(): void {
    const side = chef.netaSide;
    if (progress.kind === 'maki') return this.layCore();
    if (!progress.hasNeta || progress.netaHeld) return this.say('Cut a slice first (X)');
    if (!this.ready(side, Held.None)) return;
    const at = progress.sliceAt.clone();
    this.run(side, 'Neta on the hand', [
      move(at, v(0, 0.1, 0), 'grasp', 0.3),
      move(at, v(0, 0.02, 0), 'grasp', 0.15),
      pinch(1),
      wait(0.12),
      pinch(0),
      moveLocal(sideV(WORK), 'palm', 0.35),
    ]);
  }

  /** N for a roll whose core is cut in service (the tekka): the neta hand takes the slice from the board and lays it on the mat. */
  private layCore(): void {
    const side = chef.netaSide;
    if (!progress.coreOnBoard) return this.say(progress.coreHeld ? 'The core is on the hand' : 'Cut the core first (4, K, X)');
    if (!this.ready(side, Held.None)) return;
    const at = progress.sliceAt.clone();
    const mat = progress.pieceAt.clone();
    this.run(side, 'Laying the core', [
      move(at, v(0, 0.1, 0), 'grasp', 0.3),
      move(at, v(0, 0.02, 0), 'grasp', 0.15),
      pinch(1),
      wait(0.12),
      move(at, v(0, 0.12, 0), 'grasp', 0.2),
      move(mat, v(0, 0.07, 0), 'grasp', 0.35),
      move(mat, v(0, 0.025, 0), 'grasp', 0.15),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  /** D, facing the sink: the stone wetted in the basin (free hand), the blade stroked on it under the other hand (knife hand), then rinsed. */
  /** The fish shop's empties (Tab): the anago's pack into the trash; then each insert from the pile, held under the tap while the other hand scrubs, dried with a sheet of paper, stacked on the sink's end. */
  private nakagoKey(): void {
    const neta = chef.netaSide;
    const rice = chef.riceSide;
    if (nakago.held === null) {
      if (!nakagoWanted()) return this.say('No empties to deal with yet');
      if (!this.reachable(StationKind.IceBox) || !this.ready(neta, Held.None)) return;
      const at = nakago.at;
      this.run(neta, nakago.pack ? "The anago's empty pack" : 'An empty insert from the pile', [
        move(at, v(0, 0.12, 0.03), 'grasp', 0.35),
        move(at, v(0, 0.015, 0.03), 'grasp', 0.2),
        pinch(1),
        wait(0.12),
        move(at, v(0, 0.2, 0.08), 'grasp', 0.25),
      ]);
      return;
    }
    const side = nakago.held;
    const other = side === neta ? rice : neta;
    if (nakago.heldKind === 'pack') {
      // The trash bin at the chef's foot, from the stool.
      if (!this.reachPlace('seat', 'front', side)) return;
      if (this.driver[side].busy) return;
      this.run(side, 'The pack into the trash', [move(prep.trashAt.clone(), v(0, 0.15, 0), 'grasp', 0.6), pinch(0), wait(0.1), this.rest(side)]);
      return;
    }
    if (!nakago.washed) {
      const sink = this.reachable(StationKind.Sink);
      if (!sink) return;
      if (this.driver[side].busy || !this.ready(other, Held.None)) return;
      // The insert held over the basin's middle; the other hand scrubs beside it (offsets in the chef's frame, +z toward the chef).
      this.run(side, 'The insert under the tap', [move(sink, v(0, 0.14, 0), 'grasp', 0.4, { yaw: 0 }), wait(4.2)]);
      this.run(other, 'Scrubbing the insert', [
        wait(0.4),
        move(sink, v(sideX(0.06), 0.1, 0.08), 'palm', 0.3),
        rub(sink, v(sideX(0.06), 0.08, 0.08), 'palm', 3.4, 0.07, 2, () => nakago.washed),
        this.rest(other),
      ]);
      return;
    }
    if (!nakago.dried) {
      // The insert held over the basin; the other hand takes the dry cloth from the sink's front edge, rubs the insert, and lets it go (it hangs back).
      const sink = this.reachable(StationKind.Sink);
      if (!sink) return;
      if (this.driver[side].busy) return;
      if (nakago.clothHeld !== null && nakago.clothHeld !== other) return this.say('The cloth is in the wrong hand');
      if (nakago.clothHeld === null ? !this.ready(other, Held.None) : this.driver[other].busy) return;
      const cloth = nakago.clothAt.clone();
      const take = nakago.clothHeld === other ? [] : [pinch(0), move(cloth, v(0, 0.06, 0.05), 'grasp', 0.4), move(cloth, v(0, 0.004, 0), 'grasp', 0.25), wait(0.2), pinch(1), wait(0.12)];
      // The insert hangs under its hand: its middle sits about 0.1 above the basin's middle.
      this.run(side, 'The insert held at the sink', [move(sink, v(0, 0.14, 0), 'grasp', 0.4, { yaw: 0 }), wait(5.2)]);
      this.run(other, 'Drying the insert with the cloth', [
        ...take,
        move(sink, v(0, 0.1, 0.03), 'grasp', 0.4),
        rub(sink, v(0, 0.09, 0.03), 'grasp', 3, 0.05, 2, () => nakago.dried),
        pinch(0),
        wait(0.1),
        this.rest(other),
      ]);
      return;
    }
    if (!this.reachable(StationKind.Sink) || this.driver[side].busy) return;
    const rack = nakago.rackAt;
    this.run(side, "Stacking it on the sink's end", [
      move(rack, v(0, 0.22, 0.04), 'grasp', 0.4),
      move(rack, v(0, 0.14, 0.04), 'grasp', 0.2),
      pinch(0),
      wait(0.12),
      this.rest(side),
    ]);
  }

  private sharpenKey(): void {
    const stone = this.reachable(StationKind.Whetstone);
    const sink = this.reachable(StationKind.Sink);
    if (!stone || !sink) return;
    const rice = chef.riceSide;
    const neta = chef.netaSide;
    if (!sharpen.stoneWet) {
      if (!this.ready(neta, Held.None)) return;
      this.run(neta, 'Wetting the stone', [
        move(stone, v(0, 0.1, 0), 'grasp', 0.3),
        move(stone, v(0, 0.045, 0), 'grasp', 0.15),
        pinch(1),
        wait(0.12),
        move(stone, v(0, 0.12, 0), 'grasp', 0.2),
        move(sink, v(0, 0.08, 0), 'grasp', 0.4),
        move(sink, v(0, -0.02, 0), 'grasp', 0.2),
        wait(0.15),
        pinch(0),
        wait(0.1),
        this.rest(neta),
      ]);
      return;
    }
    if (chef.hands[rice].holding !== Held.Knife) return this.say('Hold the knife first (K)');
    if (this.driver[rice].busy || !this.ready(neta, Held.None)) return;
    if (!sharpen.rinsed) {
      // The palm this side of the basin's middle: the blade runs on ahead of it (offsets are in the chef's frame, +z toward the chef).
      this.run(rice, 'Rinsing the blade', [
        move(sink, v(0, 0.12, 0.1), 'palm', 0.3, { yaw: 0 }),
        move(sink, v(0, 0.02, 0.1), 'palm', 0.2),
        wait(0.9),
        move(sink, v(0, 0.15, 0.1), 'palm', 0.2),
      ]);
      return;
    }
    if (chef.knifeSharp >= 1) return this.say('The edge is fresh: rinse it if it is not (D), then wipe it (W)');
    this.run(neta, 'Pressing the blade', [move(stone, v(sideX(-0.04), 0.05, -0.02), 'palm', 0.3), wait(3.8), this.rest(neta)]);
    // The palm this side of the stone, the blade (15 cm on along the fingers) over it, swung side to side.
    this.run(rice, 'Stroking the edge', [
      wait(0.3),
      move(stone, v(0, 0.08, 0.22), 'palm', 0.3, { yaw: 0 }),
      move(stone, v(0, 0.03, 0.22), 'palm', 0.15),
      rub(stone, v(0, 0.03, 0.14), 'palm', 3, 0.08, 2, () => chef.knifeSharp >= 1),
      move(stone, v(0, 0.12, 0.22), 'palm', 0.2),
    ]);
  }

  /** J: the rice hand dips in the tezu (beat 1 starts here). */
  private tezu(): void {
    const side = chef.riceSide;
    if (!this.ready(side, Held.None)) return;
    const at = this.reachable(StationKind.Tezu);
    if (!at) return;
    // Come in from the right and in front, so the fingertip never passes over
    // the wasabi dish beside the bowl (that would pick wasabi up).
    this.run(side, 'Tezu', [
      pose('open'),
      move(at, v(0.13, 0.16, 0.12), 'palm', 0.25),
      move(at, v(0, 0.12, 0), 'palm', 0.15),
      move(at, v(0, 0.03, 0), 'palm', 0.15),
      wait(0.1),
      move(at, v(0, 0.12, 0), 'palm', 0.15),
      move(at, v(0.13, 0.16, 0.12), 'palm', 0.15),
      pose('default'),
      this.rest(side),
    ]);
  }

  /** L down: the rice hand reaches into the tub and stays there. */
  private riceDown(): void {
    const side = chef.riceSide;
    if (chef.facingBack) return this.say('Turn back to the bar first (T)');
    if (!this.ready(side, Held.None)) return;
    this.run(side, 'In the rice tub: let go of L on the beat', [
      move(sideV(TUB_WAY), ZERO, 'palm', 0.2),
      move(sideV(TUB_DOWN), ZERO, 'palm', 0.2),
      hold(),
    ]);
  }

  /** L up: back out of the tub at once (judged on this beat). */
  private riceUp(): void {
    const side = chef.riceSide;
    const d = this.driver[side];
    if (!d.busy || !d.steps.some((s) => s.kind === 'hold')) return;
    this.run(side, 'Rice', [move(sideV(TUB_UP), ZERO, 'palm', 0.05), this.rest(side)]);
  }

  /** Y: the rice hand's index finger takes wasabi from the dish and dabs it on the neta. */
  private wasabi(): void {
    const side = chef.riceSide;
    const roll = progress.kind === 'maki';
    const gunkan = progress.kind === 'gunkan';
    if (roll && progress.spread < 1) return this.say('Spread the rice first (U)');
    if (gunkan && !progress.wrapped) return this.say('Nori round the shari first (Z)');
    if (!roll && !gunkan && !progress.netaHeld) return this.say('Take the neta first (N)');
    if (!roll && !gunkan && !progress.hasRice) return this.say('Take rice first: wasabi comes on the way up (J, then hold L)');
    if (this.driver[side].busy) return this.say('Rice hand is busy');
    const dish = this.reachable(StationKind.Wasabi);
    if (!dish) return;
    const neta = progress.pieceAt.clone();
    this.run(side, 'Wasabi', [
      pose('point'),
      move(dish, v(0, 0.1, 0), 'tip', 0.3),
      move(dish, v(0, 0.01, 0), 'tip', 0.15),
      wait(0.1),
      move(dish, v(0, 0.1, 0), 'tip', 0.15),
      move(neta, v(0, 0.07, 0), 'tip', 0.3),
      move(neta, v(0, 0.012, 0), 'tip', 0.15),
      wait(0.1),
      move(neta, v(0, 0.07, 0), 'tip', 0.15),
      pose('default'),
      this.rest(side),
    ]);
  }

  /** H: palms together: the rice goes onto the neta. The rice hand stays for the touches. */
  private join(): void {
    const side = chef.riceSide;
    if (orderKind() === 'gunkan' && !progress.shariDown) return this.setShari();
    if (!progress.netaHeld) return this.say('Take the neta first (N)');
    if (!progress.hasRice) return this.say('Take rice first (J, then hold L)');
    if (this.driver[side].busy) return this.say('Rice hand is busy');
    const at = progress.pieceAt.clone();
    const label = progress.ageHeld
        ? 'Hands together: fill the pouch, then Space on the beat to fold it'
        : 'Hands together: touch on the beat (Space)';
    this.run(side, label, [
      move(at, v(0, 0.12, 0), 'palm', 0.3),
      move(at, v(0, 0.045, 0), 'palm', 0.2),
    ]);
  }

  /** H for a gunkan: the shaped shari down on the board's near half, on the rice hand's side (made there, not in the palm). */
  private setShari(): void {
    const side = chef.riceSide;
    if (!progress.hasRice) return this.say('Take rice first (J, then hold L)');
    if (!progress.shaped) return this.say('Squeeze the rice first (Space)');
    if (this.driver[side].busy) return this.say('Rice hand is busy');
    const board = this.reachable(StationKind.CuttingBoard);
    if (!board) return;
    this.run(side, 'Shari on the board (then Z: nori round it)', [
      move(board, v(sideX(0.12), 0.1, 0.06), 'palm', 0.3),
      move(board, v(sideX(0.12), 0.025, 0.06), 'palm', 0.2),
      wait(0.1),
      move(board, v(sideX(0.12), 0.1, 0.06), 'palm', 0.2),
      this.rest(side),
    ]);
  }

  /** Space: the timed touch for this moment of the piece (fist, then two pinches); for a gunkan, the one squeeze that shapes the rice. */
  private touch(): void {
    const side = chef.riceSide;
    const stage = progress.stage;
    const d = this.driver[side];
    if (orderKind() === 'gunkan' && !progress.shariDown && progress.hasRice) {
      if (d.busy) return this.say('Rice hand is busy');
      this.run(side, 'Shaped: set it on the board (H)', [pose('fist'), wait(0.2), pose('default')]);
      return;
    }
    if (stage === NigiriStage.Joined) {
      if (d.busy) return this.say('Rice hand is busy');
      const at = progress.pieceAt.clone();
      this.run(side, 'Touch 1: now flip (F)', [
        pose('fist'),
        wait(0.2),
        pose('default'),
        move(at, v(sideX(0.02), 0.045, 0), 'grasp', 0.25),
      ]);
    } else if (stage === NigiriStage.Flipped || stage === NigiriStage.Rotated) {
      if (d.busy) return this.say('Rice hand is busy');
      // The roll moved the piece forward: a quick step onto it first (80 ms), then the pinch.
      const at = progress.pieceAt.clone();
      this.run(side, stage === NigiriStage.Flipped ? 'Touch 2: now the half turn (G)' : 'Touch 3: done, carry it (M)', [
        move(at, v(0, 0.012, 0), 'grasp', 0.08),
        pinch(1),
        wait(0.15),
        pinch(0),
      ]);
    } else if (stage === 'Rolled') {
      // A roll: both fists together on the beat.
      if (this.driver[0].busy || this.driver[1].busy) return this.say('Hands are busy');
      for (const s of [0, 1] as const) this.run(s, 'Squeezed: knife (K), then cut on the line (X)', [pose('fist'), wait(0.2), pose('default')]);
    } else if (stage === 'Stuffed') {
      // Inari: the hand holding the pouch makes a fist on the beat.
      const neta = chef.netaSide;
      if (this.driver[neta].busy) return this.say('Neta hand is busy');
      this.run(neta, 'Folded shut: carry it (M)', [pose('fist'), wait(0.2), pose('default')]);
    } else {
      this.say('Nothing to touch now');
    }
  }

  /** F: the neta hand pushes forward while the fingers curl: the piece rolls over. */
  private flip(): void {
    const side = chef.netaSide;
    if (progress.stage !== NigiriStage.Touched1) return this.say('Flip comes after touch 1');
    if (this.driver[side].busy) return this.say('Neta hand is busy');
    this.run(side, 'Flip: touch on the beat (Space)', [
      pose('open'),
      wait(0.08),
      moveLocal(v(sideX(WORK.x), WORK.y, WORK.z - 0.06), 'palm', 0.25, { curl: 0.55 }),
      moveLocal(sideV(WORK), 'palm', 0.3, { curl: 0 }),
      pose('default'),
    ]);
  }

  /** G: pinch the piece and turn the hand clockwise: it spins half a turn. */
  private halfTurn(): void {
    const side = chef.riceSide;
    if (progress.stage !== NigiriStage.Touched2) return this.say('The half turn comes after touch 2');
    if (this.driver[side].busy) return this.say('Rice hand is busy');
    const at = progress.pieceAt.clone();
    this.run(side, 'Half turn: touch on the beat (Space)', [
      move(at, v(sideX(0.02), 0.045, 0), 'grasp', 0.1),
      pinch(1),
      wait(0.08),
      move(at, v(sideX(0.02), 0.045, 0), 'grasp', 0.45, { yawBy: -80 * sideSign() }),
      pinch(0),
      wait(0.1),
      move(at, v(sideX(0.02), 0.045, 0), 'grasp', 0.25, { yaw: null }),
    ]);
  }

  /** M: pick the finished piece up and hold it over the geta; press again to let go. */
  private carry(): void {
    const rice = chef.riceSide;
    const d = this.driver[rice];
    if (d.busy) return this.say('Rice hand is busy');
    const geta = this.reachable(StationKind.Geta);
    if (!geta) return;
    if (chef.hands[rice].holding === Held.Sushi) {
      this.run(rice, 'On the geta: serve with S', [
        pinch(0),
        wait(0.1),
        move(geta, v(0, 0.4, 0.16), 'grasp', 0.2),
        this.rest(rice, null),
      ]);
      return;
    }
    if (progress.stage !== NigiriStage.Done) return this.say('Finish the piece first (touch 3)');
    const at = progress.pieceAt.clone();
    this.run(rice, 'Carrying: Q / E to turn it, M to let go', [
      move(at, v(0, 0.02, 0), 'grasp', 0.15, { yawBy: 0 }),
      pinch(1),
      wait(0.12),
      move(at, v(0, 0.12, 0), 'grasp', 0.25),
      // In from above, over the case's glass, and held over its far half: as far as a seated chef reaches (GETA_ZONE_* in layout.ts).
      move(geta, v(0, 0.38, 0.16), 'grasp', 0.4),
      move(geta, GETA_LET_GO, 'grasp', 0.3),
    ]);
    // The neta hand is free once the piece is lifted off it.
    this.run(chef.netaSide, 'Carrying: Q / E to turn it, M to let go', [wait(0.35), this.rest(chef.netaSide)]);
  }

  /** Q / E: turn the carried piece 45 degrees left or right. */
  private turnPiece(by: number): void {
    const rice = chef.riceSide;
    if (chef.hands[rice].holding !== Held.Sushi) return this.say('Carry the piece first (M)');
    const d = this.driver[rice];
    if (d.busy) return this.say('Rice hand is busy');
    const geta = this.reachable(StationKind.Geta);
    if (!geta) return;
    this.run(rice, by > 0 ? 'Turned left' : 'Turned right', [move(geta, GETA_LET_GO, 'grasp', 0.2, { yawBy: by })]);
  }

  /** Tab on an anago or hamaguri nigiri on the geta: the tsume brush from its pot, one short stroke over the piece, let go (back into its pot). */
  private tsumeOnPiece(): void {
    if (!progress.tsumeWanted || progress.tsume) return this.say('No tsume wanted');
    const side = chef.riceSide;
    if (!this.ready(side, Held.None)) return;
    const grip = tsume.gripAt.clone();
    const piece = progress.pieceAt.clone();
    // The brush leans toward the chef: its tip 12 cm below the grip and 5 cm out beyond it.
    const over = v(0, 0.128, 0.053);
    this.run(side, 'Tsume on the piece', [
      move(grip, v(0, 0.06, 0.02), 'grasp', 0.3),
      move(grip, v(0, 0, 0), 'grasp', 0.15),
      wait(0.2),
      pinch(1),
      wait(0.12),
      move(piece, v(0, 0.2, 0.053), 'grasp', 0.45),
      move(piece, over, 'grasp', 0.15),
      rub(piece, over, 'grasp', 2, 0.02, 1, () => progress.tsume),
      move(piece, v(0, 0.2, 0.053), 'grasp', 0.2),
      pinch(0),
      wait(0.1),
      this.rest(side),
    ]);
  }

  /** Tab on the kuruma-ebi at the board (src/prawn-system.ts): its next step, boiled or raw. */
  private prawnKey(): void {
    const neta = chef.netaSide;
    const rice = chef.riceSide;
    const grip = prawn.skewerAt.clone();
    const pot = prawn.potAt.clone();
    const bowl = prawn.bowlAt.clone();
    const board = prawn.boardAt.clone();
    const body = prawn.at.clone();
    const head = prawn.headAt.clone();
    // Take a part in the fingers: down onto it, pinch.
    const take = (at: Vector3): Step[] => [move(at, v(0, 0.03, 0), 'grasp', 0.35), move(at, v(0, 0, 0), 'grasp', 0.15), wait(0.15), pinch(1), wait(0.1)];
    switch (prawn.next) {
      case 'board': {
        const side = chef.hands[neta].holding === Held.Saku ? neta : rice;
        return this.run(side, 'The prawn onto the board', [move(board, v(0, 0.06, 0), 'grasp', 0.45), pinch(0), wait(0.1), this.rest(side)]);
      }
      case 'skewer':
        if (!this.ready(rice, Held.None)) return;
        return this.run(rice, 'Skewering it', [...take(grip), move(grip, v(0, 0, -0.11), 'grasp', 0.6), pinch(0), wait(0.1), this.rest(rice)]);
      case 'pot': {
        if (chef.hands[neta].holding === Held.Saku) return this.run(neta, 'Into the pot', [move(pot, v(0, 0.08, 0.06), 'grasp', 0.5), pinch(0), wait(0.1), this.rest(neta)]);
        if (!this.ready(neta, Held.None)) return;
        return this.run(neta, 'Into the pot', [...take(grip), move(pot, v(0, 0.12, 0.08), 'grasp', 0.6), move(pot, v(0, 0.05, 0.08), 'grasp', 0.2), pinch(0), wait(0.1), this.rest(neta)]);
      }
      case 'boil':
        return this.say(`Boiling: ${prawn.boilT.toFixed(0)} of about 10 s`);
      case 'out':
        if (!this.ready(neta, Held.None)) return;
        return this.run(neta, 'Out of the pot, into the ice water', [...take(grip), move(bowl, v(0, 0.1, 0.06), 'grasp', 0.5), move(bowl, v(0, 0.04, 0.06), 'grasp', 0.2), pinch(0), wait(0.1), this.rest(neta)]);
      case 'chill': {
        if (chef.hands[neta].holding === Held.Saku) return this.run(neta, 'Into the ice water', [move(bowl, v(0, 0.06, 0.06), 'grasp', 0.5), pinch(0), wait(0.1), this.rest(neta)]);
        if (!this.ready(neta, Held.None)) return;
        return this.run(neta, 'Into the ice water', [...take(grip), move(bowl, v(0, 0.1, 0.06), 'grasp', 0.5), move(bowl, v(0, 0.04, 0.06), 'grasp', 0.2), pinch(0), wait(0.1), this.rest(neta)]);
      }
      case 'cold':
        return this.say(`In the ice water: ${prawn.chillT.toFixed(0)} s`);
      case 'iceOut':
        if (!this.ready(neta, Held.None)) return;
        return this.run(neta, 'Out of the ice, onto the board', [...take(grip), move(board, v(0, 0.08, 0.1), 'grasp', 0.5), move(board, v(0, 0.04, 0.1), 'grasp', 0.2), pinch(0), wait(0.1), this.rest(neta)]);
      case 'unskewer':
        if (!this.ready(rice, Held.None)) return;
        return this.run(rice, 'The skewer out', [...take(grip), move(grip, v(0, 0.01, 0.09), 'grasp', 0.5), pinch(0), wait(0.1), this.rest(rice)]);
      case 'peel':
        if (!this.ready(neta, Held.None) || !this.ready(rice, Held.None)) return;
        this.run(neta, 'Holding the prawn', [...take(body), wait(1.6), pinch(0), wait(0.1), this.rest(neta)]);
        this.run(rice, 'Peeling it', [wait(0.7), ...take(head), move(head, v(0, 0.03, -0.1), 'grasp', 0.45), pinch(0), wait(0.1), this.rest(rice)]);
        return;
      case 'hand':
        if (!this.ready(neta, Held.None)) return;
        return this.run(neta, 'Onto the fingers', [...take(body), pinch(0), wait(0.1), this.rest(neta)]);
    }
  }

  /** S: hold a fist over the geta for a moment to serve. */
  private serve(): void {
    const side = chef.riceSide;
    if (progress.stage !== NigiriStage.Placed) return this.say('Put the piece on the geta first (M)');
    if (!this.ready(side, Held.None)) return;
    const geta = this.reachable(StationKind.Geta);
    if (!geta) return;
    this.run(side, 'Serving', [
      move(geta, v(0, 0.08, 0.02), 'palm', 0.3),
      pose('fist'),
      wait(1.3),
      pose('default'),
      move(geta, v(0, 0.2, 0.05), 'palm', 0.2),
      this.rest(side),
    ]);
  }

  // ---- verb helpers ----------------------------------------------------------------

  private say(text: string): void {
    this.status = text;
    console.log(`[Practice] ${text}`);
  }

  /** Back to the rest spot; `yaw` null also lets the heading follow the reach again. */
  private rest(side: 0 | 1, yaw?: null): Step {
    return moveLocal(REST[side], 'grasp', 0.35, yaw === null ? { yaw: null } : {});
  }

  private run(side: 0 | 1, label: string, steps: Step[]): void {
    const d = this.driver[side];
    d.steps = steps;
    d.index = 0;
    d.t = 0;
    d.start.copy(d.point);
    d.yawStart = d.yawDeg;
    d.curlStart = d.curl;
    d.untilAtStart = !!steps.find((step) => step.until)?.until?.();
    this.status = label;
    console.log(`[Practice] ${label}`);
  }

  /** True when that hand is idle and holds `holding`; otherwise says why not. */
  private ready(side: 0 | 1, holding: string): boolean {
    if (this.driver[side].busy) {
      this.say(`${side === chef.riceSide ? 'Rice' : 'Neta'} hand is busy`);
      return false;
    }
    if (chef.hands[side].holding !== holding) {
      this.say(`${side === chef.riceSide ? 'Rice' : 'Neta'} hand is holding ${chef.hands[side].holding}`);
      return false;
    }
    return true;
  }

  /** The right hand if it is idle and empty, else the left, else none. */
  private freeHand(): 0 | 1 | null {
    for (const side of [1, 0] as const) {
      if (!this.driver[side].busy && chef.hands[side].holding === Held.None) return side;
    }
    this.say('Both hands are busy');
    return null;
  }

  private clothInHand(): boolean {
    if (this.driver[1].busy) {
      this.say('Right hand is busy');
      return false;
    }
    if (chef.hands[1].holding !== Held.Cloth) {
      this.say('Take the cloth first (C)');
      return false;
    }
    return true;
  }

  /** A station's surface point, if it is in front of the chef (not behind). */
  private reachable(kind: Kind): Vector3 | null {
    const info = stations.get(kind);
    if (!info) {
      this.say(`No ${kind} in this scene`);
      return null;
    }
    if (!this.inFront(info.pos)) return null;
    return info.pos.clone();
  }

  private inFront(point: Vector3): boolean {
    this.a.copy(point);
    this.player.worldToLocal(this.a);
    if (this.a.z > 0.1) {
      this.say('Out of reach: turn around first (T)');
      return false;
    }
    return true;
  }

  /** Where that neta is now in the case (its end nearest the chef). */
  private sakuAt(neta: NetaId): Vector3 | null {
    for (const entity of this.queries.items.entities) {
      if (entity.getValue(CaseItem, 'neta') !== neta || !entity.object3D) continue;
      if ((entity.getValue(CaseItem, 'remaining') ?? 0) < NETA[neta].perPiece) {
        this.say(`${NETA[neta].name}: sold out (8 restocks)`);
        return null;
      }
      const at = new Vector3();
      entity.object3D.getWorldPosition(at);
      return this.inFront(at) ? at : null;
    }
    this.say(`No ${NETA[neta].name} in the case`);
    return null;
  }

  /** While the piece is carried, its heading follows the hand from where it was picked up. */
  private trackHeading(): void {
    const carried = progress.stage === NigiriStage.Carried;
    const reader = hands.all[chef.riceSide];
    if (carried && !this.carried) {
      const entity = this.queries.nigiri.entities.values().next().value;
      this.headingAtPickup = entity ? (entity.getValue(Piece, 'yawDeg') ?? 0) : 0;
      this.handYawAtPickup = reader?.yawDeg ?? 0;
    }
    this.carried = carried;
    if (carried && reader) {
      let h = (this.headingAtPickup + reader.yawDeg - this.handYawAtPickup) % 360;
      if (h > 180) h -= 360;
      if (h <= -180) h += 360;
      this.heading = Math.round(h);
    }
  }

  // ---- per-frame hand driving -----------------------------------------------------

  private updateHand(d: DriverHand, delta: number, hand: EmuHand): void {
    // Advance the current step (zero-time steps run in the same frame).
    while (d.busy) {
      const s = d.steps[d.index];
      if (s.kind === 'pinch') {
        d.pinch = s.value ?? 0;
        this.nextStep(d);
        continue;
      }
      if (s.kind === 'pose') {
        d.pose = s.pose ?? 'default';
        d.curl = d.curlStart = 0; // a pose resets the finger blends
        this.nextStep(d);
        continue;
      }
      if (s.kind === 'hold') break;
      d.t += delta;
      const seconds = s.seconds ?? 0;
      // A rub that the game has already counted (even on the way in) ends now.
      if (s.kind === 'rub' && s.until && !d.untilAtStart && s.until()) {
        this.nextStep(d);
        continue;
      }
      if (s.kind === 'move' || s.kind === 'rub') {
        if (s.anchor && s.anchor !== d.anchor) {
          // Same hand, another point of it: start from where that point is now.
          d.anchor = s.anchor;
          this.measured(d, this.a);
          d.start.copy(this.a);
          d.point.copy(this.a);
        }
        this.stepGoal(d, s, this.goal);
        if (s.kind === 'move') {
          const k0 = Math.min(1, d.t / Math.max(seconds, 1e-3));
          const k = k0 * k0 * (3 - 2 * k0);
          d.point.lerpVectors(d.start, this.goal, k);
          if (s.yawBy !== undefined) {
            d.yawFixed = true;
            d.yawDeg = d.yawStart + s.yawBy * k;
          } else if (typeof s.yaw === 'number') {
            d.yawFixed = true;
            d.yawDeg = d.yawStart + (s.yaw - d.yawStart) * k;
          } else if (s.yaw === null) {
            d.yawFixed = false;
          }
          if (s.curl !== undefined) d.curl = d.curlStart + (s.curl - d.curlStart) * k;
        } else {
          const swing = Math.sin(d.t * (s.hz ?? 2) * Math.PI * 2 + (s.phase ?? 0)) * (s.amp ?? 0.03);
          d.point.copy(this.goal);
          d.point.x += swing;
        }
      }
      if (d.t < seconds) break;
      this.nextStep(d);
    }

    if (d.pose !== d.sentPose) {
      hand.poseId = d.pose;
      d.sentPose = d.pose;
      d.sentCurl = 0;
    }
    if (Math.abs(d.curl - d.sentCurl) > 0.02 || (d.curl === 0 && d.sentCurl !== 0)) {
      if (d.curl === 0) hand.clearFingerPoses();
      else for (const finger of CURL_FINGERS) hand.setFingerPose(finger, 'fist', d.curl);
      d.sentCurl = d.curl;
    }
    if (d.pinch !== d.sentPinch) {
      hand.updatePinchValue(d.pinch);
      d.sentPinch = d.pinch;
    }

    // Fingers point from the shoulder toward the work, tipped a little down,
    // unless a step has set the heading (the knife, the half turn, the carry).
    if (!d.yawFixed) {
      const sx = d.side === 0 ? -SHOULDER_X : SHOULDER_X;
      d.yawDeg = (Math.max(-1.4, Math.min(1.4, Math.atan2(-(d.point.x - sx), -(d.point.z - 0.06)))) * 180) / Math.PI;
    }
    let yaw = (d.yawDeg * Math.PI) / 180;
    const shake = this.shake[d.side];
    if (this.shaky) yaw += SHAKE_YAW * Math.sin(0.9 * this.clock + shake.phase[3]);
    // Holding the neta or the rice: the hand turns over, palm up, as a chef holds them.
    const holding = chef.hands[d.side].holding;
    const wantRoll = holding === Held.Neta || holding === Held.Rice ? Math.PI : 0;
    const rollStep = ROLL_RATE * delta;
    d.roll += Math.max(-rollStep, Math.min(rollStep, wantRoll - d.roll));
    this.euler.set(FINGER_PITCH, yaw, d.roll, 'YXZ');
    this.q.setFromEuler(this.euler);

    // Wrist = anchor target minus the measured wrist-to-anchor offset.
    const reader = d.side === 0 ? hands.left : hands.right;
    if (reader?.tracked) {
      this.anchorOf(reader, d.anchor, this.b);
      this.b.sub(reader.wrist); // world offset
      this.player.getWorldQuaternion(this.qRig);
      this.b.applyQuaternion(this.qRig.invert()); // to the rig's frame
    } else {
      this.b.copy(DEFAULT_OFFSET[d.anchor]).applyQuaternion(this.q);
    }
    // Shaky hands: the tracked point wobbles about where the hand means to be.
    this.noisy.copy(d.point);
    if (this.shaky) {
      const t = this.clock;
      const p = shake.phase;
      this.noisy.x += SHAKE_WOBBLE * Math.sin(1.3 * t + p[0]) + SHAKE_JITTER * (this.random() * 2 - 1);
      this.noisy.y += SHAKE_WOBBLE * Math.sin(1.7 * t + p[1]) + SHAKE_JITTER * (this.random() * 2 - 1);
      this.noisy.z += SHAKE_WOBBLE * Math.sin(1.1 * t + p[2]) + SHAKE_JITTER * (this.random() * 2 - 1);
    }
    this.wrist.copy(this.noisy).sub(this.b);

    const moved = Number.isNaN(d.sentWrist.x) || d.sentWrist.distanceToSquared(this.wrist) > 1e-6;
    if (moved || Math.abs(yaw - d.sentYaw) > 0.005 || Math.abs(d.roll - d.sentRoll) > 0.005) {
      // setPin copies its arrays, so it is only called while the hand moves.
      this.pinArray[0] = this.wrist.x;
      this.pinArray[1] = this.wrist.y;
      this.pinArray[2] = this.wrist.z;
      this.rotArray[0] = this.q.x;
      this.rotArray[1] = this.q.y;
      this.rotArray[2] = this.q.z;
      this.rotArray[3] = this.q.w;
      hand.setPin({ anchor: 'wrist', target: this.pinArray, wristRotation: this.rotArray });
      d.sentWrist.copy(this.wrist);
      d.sentYaw = yaw;
      d.sentRoll = d.roll;
    }
  }

  /** Shaky hands: now and then the emulator loses a hand for a moment (more often with the hands together). */
  private updateShake(delta: number, device: EmuDevice): void {
    const left = hands.left;
    const right = hands.right;
    const together = !!left?.tracked && !!right?.tracked && left.palm.distanceTo(right.palm) < TOGETHER_DISTANCE;
    for (const side of [0, 1] as const) {
      const s = this.shake[side];
      const hand = side === 0 ? device.hands.left : device.hands.right;
      if (s.lostUntil > 0) {
        if (this.shaky && this.clock < s.lostUntil) continue;
        hand.connected = true;
        s.lostUntil = 0;
        continue;
      }
      if (!this.shaky || this.random() >= (together ? LOSS_PER_SECOND_TOGETHER : LOSS_PER_SECOND) * delta) continue;
      const seconds = LOSS_MIN_SECONDS + (LOSS_MAX_SECONDS - LOSS_MIN_SECONDS) * this.random();
      s.lostUntil = this.clock + seconds;
      s.losses++;
      hand.connected = false;
      console.log(`[Practice] shaky: the ${side === 0 ? 'left' : 'right'} hand is lost for ${seconds.toFixed(2)} s${together ? ' (hands together)' : ''}`);
    }
  }

  private nextStep(d: DriverHand): void {
    d.index++;
    d.t = 0;
    d.start.copy(d.point);
    d.yawStart = d.yawDeg;
    d.curlStart = d.curl;
  }

  /** The rig-space goal of a move/rub step. */
  private stepGoal(_d: DriverHand, s: Step, out: Vector3): void {
    if (s.local) {
      out.copy(s.local);
    } else if (s.at) {
      out.copy(s.at);
      this.player.worldToLocal(out);
    }
    if (s.offset) out.add(s.offset);
  }

  /** Where the hand's current anchor is now, in the rig's frame. */
  private measured(d: DriverHand, out: Vector3): void {
    const reader = d.side === 0 ? hands.left : hands.right;
    if (reader?.tracked) {
      this.anchorOf(reader, d.anchor, out);
      this.player.worldToLocal(out);
    } else {
      out.copy(d.point);
    }
  }

  private anchorOf(reader: HandReader, anchor: Anchor, out: Vector3): Vector3 {
    return out.copy(anchor === 'palm' ? reader.palm : anchor === 'tip' ? reader.indexTip : reader.grasp);
  }

  // ---- key guide ------------------------------------------------------------------

  private buildPanel(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 720;
    this.canvas.height = 804;
    this.texture = new CanvasTexture(this.canvas);
    this.panel = new Mesh(
      new PlaneGeometry(0.27, 0.283),
      new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.panel.name = 'PracticePanel';
    this.panel.renderOrder = 950;
    this.panel.position.set(-0.24, 0.1, -0.42);
    this.panel.visible = false;
    this.world.camera.add(this.panel);
  }

  private drawPanel(): void {
    const left = chef.hands[0].holding;
    const right = chef.hands[1].holding;
    const heading = progress.stage === NigiriStage.Carried ? `   Heading ${this.heading}` : '';
    const lost = this.shake[0].losses + this.shake[1].losses;
    const shaky = this.shaky ? `   Shaky (lost ${lost})` : '';
    const key = `${this.status}|${left}|${right}|${chef.open}|${progress.stage}|${heading}|${shaky}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(20,18,16,0.82)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#FFF6E0';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('PRACTICE  (P: exit)', 20, 42);
    ctx.font = 'bold 24px sans-serif';
    const lines = [
      'Drag: look     T: turn around     ` shaky hands (test)',
      '1 soap  2 wash  3 towel  C cloth  V wipe  B rinse',
      '4 take the order  5 selected  6 next  7 order it  8 restock  R back',
      'K knife   X cut   W wipe the blade   D sharpen (at the sink)',
      'N neta   J tezu   L hold, let go on the beat: rice',
      'Y wasabi   H hands   Z nori   U spread   I roll',
      'Space touch on the beat   F flip   G half turn',
      'M carry / let go   Q E turn 45   S serve',
      'Prep: 9 carry  0 pull off  X cut  - paper  [ board  ] noren',
      "Phone (a press a step): = fish shop  Shift+- greengrocer  ; cook  ' part-timer",
      "  Shift+= play mode  Shift+; hands  Shift+' tool names  ] noren in: close",
      '  Shift+5 stage (all open)  Shift+7 go on  Shift+9 game (stages / shop)  Shift+0 start it  Shift+P headset menu',
      '  Shift+[ rice shop (rice, nori)  Shift+] cook: 1 sho more (service, full)',
      ', tea urn (Shift: ask for tea)   . tea to the tsukedai',
      "Back row: A shari  Enter range  / step  Tab: the master's step",
      `L ${left}  R ${right}  ${chef.open ? 'Open' : 'Closed'}  ${progress.stage}${heading}${shaky}`,
    ];
    lines.forEach((line, i) => ctx.fillText(line, 20, 90 + i * 44));
    ctx.fillStyle = '#8fd3ff';
    ctx.font = 'bold 25px sans-serif';
    ctx.fillText(`> ${this.status}`, 20, 90 + lines.length * 44 + 8);
    this.texture.needsUpdate = true;
  }
}
