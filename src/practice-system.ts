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
import { chef } from './game-state.js';
import type { HandReader } from './hand-reader.js';
import { hands } from './hands.js';
import { SEATED_EYE_HEIGHT } from './layout.js';
import { type Kind, stations } from './station-system.js';
import { Held, StationKind } from './sushi-components.js';

/**
 * Practice mode (development only): play the bar from the keyboard in the
 * desktop emulator (IWER). P switches it on and off. While it is on, this
 * system drives the emulated headset and hands directly, the same way the
 * emulator's remote control does, so every game rule runs unchanged: a key
 * only moves a hand to a place and makes a gesture there, and the game judges
 * that motion as it would judge a real hand.
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
interface EmuHand {
  poseId: string;
  updatePinchValue(value: number): void;
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
  kind: 'move' | 'rub' | 'pinch' | 'pose' | 'wait';
  /** move/rub: a world point (a station), or null for the hand's rest spot. */
  at?: Vector3 | null;
  /** Added to `at` in the chef's frame (x right, y up, z forward is -z). */
  offset?: Vector3;
  anchor?: Anchor;
  seconds?: number;
  /** pinch: 0..1. */
  value?: number;
  /** pose: an emulator hand pose id ('default', 'fist', ...). */
  pose?: string;
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

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const move = (at: Vector3 | null, offset: Vector3, anchor: Anchor, seconds: number): Step => ({
  kind: 'move', at, offset, anchor, seconds,
});
const rest = (seconds = 0.35): Step => ({ kind: 'move', at: null, offset: v(0, 0, 0), anchor: 'grasp', seconds });
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
const wait = (seconds: number): Step => ({ kind: 'wait', seconds });
/** Washing (hands, or the cloth with them) leaves both hands clean and waiting for the towel. */
const washedJustNow = () => chef.hands.every((h) => h.needsTowel && !h.needsWash);

/** Where each hand waits, in the chef's frame (grasp point): low, in front, off the board. */
const REST: [Vector3, Vector3] = [v(-0.15, 0.98, -0.2), v(0.15, 0.98, -0.2)];
const SHOULDER_X = 0.18;
/** Pinch point offsets from the wrist before the hand is first measured (chef's frame). */
const DEFAULT_OFFSET: Record<Anchor, Vector3> = {
  palm: v(0, -0.02, -0.06),
  grasp: v(0, -0.03, -0.11),
  tip: v(0, -0.03, -0.17),
};
const FINGER_PITCH = -0.35;
const LOOK_PITCH_DEG = -22;
const HEAD_TURN_RATE_DEG = 320;
const TURN_LOOK_DEG = 88;

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
  readonly sentWrist = new Vector3(Number.NaN, 0, 0);
  sentYaw = Number.NaN;
  sentPinch = -1;
  sentPose = '';
  /** The verb's `until` value when the key was pressed (true: rub the full time). */
  untilAtStart = false;

  constructor(readonly side: 0 | 1) {}

  get busy(): boolean {
    return this.index < this.steps.length;
  }
}

export class PracticeSystem extends createSystem({}) {
  private on = false;
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
    if (!down || e.repeat) return;
    switch (e.code) {
      case 'Digit1':
        this.soap();
        break;
      case 'Digit2':
        this.washHands();
        break;
      case 'Digit3':
        this.towel();
        break;
      case 'KeyC':
        this.cloth();
        break;
      case 'KeyV':
        this.wipeBoard();
        break;
      case 'KeyB':
        this.rinseCloth();
        break;
      default:
        return;
    }
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
        d.sentPinch = -1;
        d.sentPose = '';
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

  // ---- verbs (each queues one motion; the game judges it) ------------------------

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
      rest(),
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
        move(at, v(x, 0.12, 0), 'palm', 0.2),
        rub(at, v(x, 0.12, 0), 'palm', 1.0, 0.035, 2.5, washedJustNow, side * Math.PI),
        move(at, v(x, 0.36, 0), 'palm', 0.2),
        rest(),
      ]);
    }
  }

  private towel(): void {
    const side = this.freeHand();
    const at = this.reachable(StationKind.Towel);
    if (side === null || !at) return;
    this.run(side, 'Drying on the towel', [
      move(at, v(0, 0.36, 0), 'palm', 0.35),
      move(at, v(0, 0.04, 0), 'palm', 0.2),
      rub(at, v(0, 0.04, 0), 'palm', 1.1, 0.035, 2.5, () => !chef.hands[0].needsTowel && !chef.hands[1].needsTowel),
      move(at, v(0, 0.36, 0), 'palm', 0.2),
      rest(),
    ]);
  }

  /** C: take the wet cloth with the right hand, or put it back. */
  private cloth(): void {
    const d = this.driver[1];
    if (d.busy) return this.say('Right hand is busy');
    if (chef.hands[1].holding === Held.Cloth) {
      this.run(1, 'Cloth put back', [pinch(0), wait(0.1), rest()]);
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
      rest(),
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
      rest(),
    ]);
  }

  private rinseCloth(): void {
    if (!this.clothInHand()) return;
    const at = this.reachable(StationKind.Sink);
    if (!at) return;
    this.run(1, 'Rinsing the cloth', [
      move(at, v(0.05, 0.36, 0), 'grasp', 0.35),
      move(at, v(0.05, 0.1, 0), 'grasp', 0.2),
      rub(at, v(0.05, 0.1, 0), 'grasp', 1.1, 0.04, 2.5, washedJustNow),
      move(at, v(0.05, 0.36, 0), 'grasp', 0.2),
      rest(),
    ]);
  }

  // ---- verb helpers ----------------------------------------------------------------

  private say(text: string): void {
    this.status = text;
  }

  private run(side: 0 | 1, label: string, steps: Step[]): void {
    const d = this.driver[side];
    d.steps = steps;
    d.index = 0;
    d.t = 0;
    d.start.copy(d.point);
    d.untilAtStart = !!steps.find((step) => step.until)?.until?.();
    this.status = label;
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
    this.a.copy(info.pos);
    this.player.worldToLocal(this.a);
    if (this.a.z > 0.1) {
      this.say('Out of reach: turn around first (hold T)');
      return null;
    }
    return info.pos.clone();
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
        this.nextStep(d);
        continue;
      }
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
          const k = Math.min(1, d.t / Math.max(seconds, 1e-3));
          d.point.lerpVectors(d.start, this.goal, k * k * (3 - 2 * k));
        } else {
          const swing = Math.sin(d.t * (s.hz ?? 2) * Math.PI * 2 + (s.phase ?? 0)) * (s.amp ?? 0.03);
          d.point.copy(this.goal);
          d.point.x += swing;
        }
      }
      if (d.t < seconds) break;
      this.nextStep(d);
    }

    if (d.pinch !== d.sentPinch) {
      hand.updatePinchValue(d.pinch);
      d.sentPinch = d.pinch;
    }
    if (d.pose !== d.sentPose) {
      hand.poseId = d.pose;
      d.sentPose = d.pose;
    }

    // Fingers point from the shoulder toward the work, tipped a little down.
    const sx = d.side === 0 ? -SHOULDER_X : SHOULDER_X;
    const yaw = Math.max(-1.4, Math.min(1.4, Math.atan2(-(d.point.x - sx), -(d.point.z - 0.06))));
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
  }

  /** The rig-space goal of a move/rub step. */
  private stepGoal(d: DriverHand, s: Step, out: Vector3): void {
    if (!s.at) {
      out.copy(REST[d.side]);
      return;
    }
    out.copy(s.at);
    this.player.worldToLocal(out);
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
    this.canvas.width = 640;
    this.canvas.height = 360;
    this.texture = new CanvasTexture(this.canvas);
    this.panel = new Mesh(
      new PlaneGeometry(0.26, 0.14625),
      new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.panel.name = 'PracticePanel';
    this.panel.renderOrder = 950;
    this.panel.position.set(-0.2, -0.17, -0.42);
    this.panel.visible = false;
    this.world.camera.add(this.panel);
  }

  private drawPanel(): void {
    const left = chef.hands[0].holding;
    const right = chef.hands[1].holding;
    const key = `${this.status}|${left}|${right}|${chef.open}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(20,18,16,0.82)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#FFF6E0';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('PRACTICE  (P: exit)', 20, 42);
    ctx.font = 'bold 27px sans-serif';
    const lines = [
      'Drag: look    T (hold): turn around',
      '1 soap    2 wash hands    3 towel',
      'C wet cloth (take / put back)',
      'V wipe the board    B rinse the cloth',
      `L: ${left}   R: ${right}   Bar ${chef.open ? 'open' : 'closed'}`,
    ];
    lines.forEach((line, i) => ctx.fillText(line, 20, 92 + i * 40));
    ctx.fillStyle = '#8fd3ff';
    ctx.font = 'bold 27px sans-serif';
    ctx.fillText(`> ${this.status}`, 20, 92 + lines.length * 40 + 10);
    this.texture.needsUpdate = true;
  }
}
