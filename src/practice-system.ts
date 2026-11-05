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
import { chef, orderNeta, progress } from './game-state.js';
import type { HandReader } from './hand-reader.js';
import { hands } from './hands.js';
import { SEATED_EYE_HEIGHT } from './layout.js';
import { CASE_ORDER, menuFor, NETA, type NetaId } from './menu.js';
import { caseApi } from './neta-case-system.js';
import { type Kind, stations } from './station-system.js';
import { CaseItem, Customer, Held, NigiriStage, Piece, StationKind } from './sushi-components.js';

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
}
interface EmuDevice {
  controlMode: 'manual' | 'programmatic';
  primaryInputMode: 'controller' | 'hand';
  position: EmuVector;
  quaternion: EmuQuaternion;
  hands: { left: EmuHand; right: EmuHand };
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
/** The rice tub, low on the right (world, facing the bar): down in it, and back up out of it. */
const TUB_DOWN = v(0.4, 0.55, 0.02);
const TUB_WAY = v(0.36, 0.8, -0.06);
const TUB_UP = v(0.3, 0.88, -0.14);
const SHOULDER_X = 0.18;
/** Pinch point offsets from the wrist before the hand is first measured (chef's frame). */
const DEFAULT_OFFSET: Record<Anchor, Vector3> = {
  palm: v(0, -0.02, -0.06),
  grasp: v(0, -0.03, -0.11),
  tip: v(0, -0.03, -0.17),
};
const CURL_FINGERS: EmuFinger[] = ['middle', 'ring', 'pinky'];
const FINGER_PITCH = -0.35;
const LOOK_PITCH_DEG = -22;
const HEAD_TURN_RATE_DEG = 320;
const TURN_LOOK_DEG = 88;
const HEADING_STEP_DEG = 45;
/** What can be ordered from the case, in case order (what 6 steps through): nigiri neta, gunkan toppings, the inari pouch. */
const NIGIRI_NETA: readonly NetaId[] = CASE_ORDER.filter((id) => ['saku', 'piece', 'scoop', 'age'].includes(NETA[id].prep));

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
  readonly sentWrist = new Vector3(Number.NaN, 0, 0);
  sentYaw = Number.NaN;
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
  private turnHeld = false;
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
    if (!this.on || !this.device) return;
    const device = this.device;
    // The emulator's own tools hand control back when they finish; keep it.
    if (device.controlMode !== 'programmatic') device.controlMode = 'programmatic';

    // Head: seated, looking where the mouse says, or far left while T is held.
    const want = this.turnHeld ? TURN_LOOK_DEG : this.lookYaw;
    const step = HEAD_TURN_RATE_DEG * delta;
    this.headYaw += Math.max(-step, Math.min(step, want - this.headYaw));
    this.euler.set((this.lookPitch * Math.PI) / 180, (this.headYaw * Math.PI) / 180, 0, 'YXZ');
    this.q.setFromEuler(this.euler);
    device.position.set(0, SEATED_EYE_HEIGHT, 0);
    device.quaternion.set(this.q.x, this.q.y, this.q.z, this.q.w);

    for (const d of this.driver) this.updateHand(d, delta, d.side === 0 ? device.hands.left : device.hands.right);
    this.trackHeading();
    this.drawPanel();
  }

  // ---- keys --------------------------------------------------------------------

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyP') {
      if (down && !e.repeat) this.setOn(!this.on);
      return;
    }
    if (!this.on) return;
    if (e.code === 'KeyT') {
      this.turnHeld = down;
      if (down && !e.repeat) this.status = 'Looking far left: hold to turn around';
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
        const neta = orderNeta();
        if (neta) this.takeSaku(neta);
        else this.say('No order yet');
      },
      Digit5: () => this.takeSaku(NIGIRI_NETA[this.selected]),
      Digit6: () => this.select(e.shiftKey ? -1 : 1),
      Digit7: () => this.orderSelected(),
      Digit8: () => {
        caseApi.restockAll();
        this.say('Case restocked');
      },
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
      KeyK: () => this.knife(),
      KeyX: () => this.cut(),
      KeyW: () => this.wipeBlade(),
      KeyN: () => this.takeNeta(),
      KeyJ: () => this.tezu(),
      KeyY: () => this.wasabi(),
      KeyH: () => this.join(),
      KeyZ: () => this.takeNori(),
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
    this.turnHeld = false;
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

  /** Z: the neta hand takes a nori strip from the nori box (a gunkan begins). */
  private takeNori(): void {
    const side = chef.netaSide;
    if (!this.ready(side, Held.None)) return;
    const box = this.reachable(StationKind.NoriBox);
    if (!box) return;
    this.run(side, 'A nori strip (then H to wrap the rice)', [
      move(box, v(0, 0.1, 0.02), 'grasp', 0.35),
      move(box, v(0, 0.02, 0), 'grasp', 0.2),
      pinch(1),
      wait(0.12),
      pinch(0),
      this.rest(side),
    ]);
  }

  /** 4 / 5 for uni or roe: the rice hand spoons it from the tray onto the gunkan on the neta hand. */
  private spoonTopping(neta: NetaId, at: Vector3): void {
    const side = chef.riceSide;
    if (!progress.wrapped) return this.say('Wrap the rice in nori first (Z, J, L, H)');
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

  /** 6 / Shift+6: the next or previous neta for 5 and 7. */
  private select(step: number): void {
    this.selected = (this.selected + step + NIGIRI_NETA.length) % NIGIRI_NETA.length;
    const neta = NIGIRI_NETA[this.selected];
    this.say(`Selected: ${NETA[neta].name} (${this.stockOf(neta)} left)`);
  }

  /** 7: the customer orders the selected neta (to try every one). */
  private orderSelected(): void {
    const neta = NIGIRI_NETA[this.selected];
    const prep = NETA[neta].prep;
    const item = menuFor(prep === 'scoop' ? 'gunkan' : prep === 'age' ? 'inari' : 'nigiri', [neta]);
    const customer = this.queries.customer.entities.values().next().value;
    if (!item || !customer) return;
    customer.setValue(Customer, 'item', item);
    customer.setValue(Customer, 'wasabi', NETA[neta].prep === 'saku' && neta !== 'Tamago');
    this.say(`Ordered: ${NETA[neta].name}`);
  }

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
      move(board, v(-0.12, 0.12, 0), 'grasp', 0.35),
      move(board, v(-0.12, 0.05, 0), 'grasp', 0.15),
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
      move(at, v(0, 0.12, 0.02), 'palm', 0.35, { yaw: 0 }),
      move(at, v(0, 0.04, 0.02), 'palm', 0.15),
      pose('fist'),
      wait(0.12),
      moveLocal(KNIFE_READY, 'palm', 0.3),
    ]);
  }

  /** X: neta hand on the saku, blade drawn toward the chef along the guide line. */
  private cut(): void {
    const rice = chef.riceSide;
    const neta = chef.netaSide;
    if (chef.hands[rice].holding !== Held.Knife) return this.say('Hold the knife first (K)');
    if (!progress.sakuOnBoard) return this.say('Put a saku on the board first (4 or 5)');
    if (progress.hasNeta) return this.say('A slice is already cut');
    if (this.driver[rice].busy || !this.ready(neta, Held.None)) return;
    const saku = progress.sakuAt.clone();
    // The blade runs 0.15 m ahead of the palm; draw it from just beyond the saku to past its near edge.
    const guide = v(saku.x + 0.075, saku.y, saku.z);
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
      moveLocal(KNIFE_READY, 'palm', 0.3),
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
      moveLocal(KNIFE_READY, 'palm', 0.3),
    ]);
  }

  // ---- verbs: the nigiri ------------------------------------------------------------

  /** N: the neta hand picks the slice up; it rests on the fingers in front of the chef. */
  private takeNeta(): void {
    const side = chef.netaSide;
    if (!progress.hasNeta || progress.netaHeld) return this.say('Cut a slice first (X)');
    if (!this.ready(side, Held.None)) return;
    const at = progress.sliceAt.clone();
    this.run(side, 'Neta on the hand', [
      move(at, v(0, 0.1, 0), 'grasp', 0.3),
      move(at, v(0, 0.02, 0), 'grasp', 0.15),
      pinch(1),
      wait(0.12),
      pinch(0),
      moveLocal(WORK, 'palm', 0.35),
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
    if (chef.facingBack) return this.say('Turn back to the bar first (hold T)');
    if (!this.ready(side, Held.None)) return;
    this.run(side, 'In the rice tub: let go of L on the beat', [
      move(TUB_WAY, ZERO, 'palm', 0.2),
      move(TUB_DOWN, ZERO, 'palm', 0.2),
      hold(),
    ]);
  }

  /** L up: back out of the tub at once (judged on this beat). */
  private riceUp(): void {
    const side = chef.riceSide;
    const d = this.driver[side];
    if (!d.busy || !d.steps.some((s) => s.kind === 'hold')) return;
    this.run(side, 'Rice', [move(TUB_UP, ZERO, 'palm', 0.05), this.rest(side)]);
  }

  /** Y: the rice hand's index finger takes wasabi from the dish and dabs it on the neta. */
  private wasabi(): void {
    const side = chef.riceSide;
    if (!progress.netaHeld) return this.say('Take the neta first (N)');
    if (!progress.hasRice) return this.say('Take rice first: wasabi comes on the way up (J, then hold L)');
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
    if (!progress.netaHeld) return this.say('Take the neta first (N)');
    if (!progress.hasRice) return this.say('Take rice first (J, then hold L)');
    if (this.driver[side].busy) return this.say('Rice hand is busy');
    const at = progress.pieceAt.clone();
    const label = progress.noriHeld
      ? 'Hands together: the nori wraps the rice'
      : progress.ageHeld
        ? 'Hands together: fill the pouch, then Space on the beat to fold it'
        : 'Hands together: touch on the beat (Space)';
    this.run(side, label, [
      move(at, v(0, 0.12, 0), 'palm', 0.3),
      move(at, v(0, 0.045, 0), 'palm', 0.2),
    ]);
  }

  /** Space: the timed touch for this moment of the piece (fist, then two pinches). */
  private touch(): void {
    const side = chef.riceSide;
    const stage = progress.stage;
    const d = this.driver[side];
    if (stage === NigiriStage.Joined) {
      if (d.busy) return this.say('Rice hand is busy');
      const at = progress.pieceAt.clone();
      this.run(side, 'Touch 1: now flip (F)', [
        pose('fist'),
        wait(0.2),
        pose('default'),
        move(at, v(0.02, 0.045, 0), 'grasp', 0.25),
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
      moveLocal(v(WORK.x, WORK.y, WORK.z - 0.06), 'palm', 0.25, { curl: 0.55 }),
      moveLocal(WORK, 'palm', 0.3, { curl: 0 }),
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
      move(at, v(0.02, 0.045, 0), 'grasp', 0.1),
      pinch(1),
      wait(0.08),
      move(at, v(0.02, 0.045, 0), 'grasp', 0.45, { yawBy: -80 }),
      pinch(0),
      wait(0.1),
      move(at, v(0.02, 0.045, 0), 'grasp', 0.25, { yaw: null }),
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
        move(geta, v(0, 0.15, 0.08), 'grasp', 0.2),
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
      move(geta, v(0, 0.3, 0.1), 'grasp', 0.4),
      move(geta, v(0, 0.07, 0), 'grasp', 0.3),
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
    this.run(rice, by > 0 ? 'Turned left' : 'Turned right', [move(geta, v(0, 0.07, 0), 'grasp', 0.2, { yawBy: by })]);
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
      this.say('Out of reach: turn around first (hold T)');
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
    const yaw = (d.yawDeg * Math.PI) / 180;
    this.euler.set(FINGER_PITCH, yaw, 0, 'YXZ');
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
    this.wrist.copy(d.point).sub(this.b);

    const moved = Number.isNaN(d.sentWrist.x) || d.sentWrist.distanceToSquared(this.wrist) > 1e-6;
    if (moved || Math.abs(yaw - d.sentYaw) > 0.005) {
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
    this.canvas.height = 540;
    this.texture = new CanvasTexture(this.canvas);
    this.panel = new Mesh(
      new PlaneGeometry(0.27, 0.2025),
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
    const key = `${this.status}|${left}|${right}|${chef.open}|${progress.stage}|${heading}`;
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
      'Drag: look     T (hold): turn around',
      '1 soap  2 wash  3 towel  C cloth  V wipe  B rinse',
      '4 take the order  5 selected  6 next  7 order it  8 restock  R back',
      'K knife   X cut   W wipe the blade',
      'N neta   J tezu   L hold, let go on the beat: rice',
      'Y wasabi   H hands together   Z nori (gunkan)',
      'Space touch on the beat   F flip   G half turn',
      'M carry / let go   Q E turn 45   S serve',
      `L ${left}  R ${right}  ${chef.open ? 'Open' : 'Closed'}  ${progress.stage}${heading}`,
    ];
    lines.forEach((line, i) => ctx.fillText(line, 20, 90 + i * 44));
    ctx.fillStyle = '#8fd3ff';
    ctx.font = 'bold 25px sans-serif';
    ctx.fillText(`> ${this.status}`, 20, 90 + lines.length * 44 + 8);
    this.texture.needsUpdate = true;
  }
}
