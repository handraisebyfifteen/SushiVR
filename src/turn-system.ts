import {
  BackSide,
  createSystem,
  type Entity,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { coach } from './coach.js';
import { chef } from './game-state.js';
import { Bar } from './sushi-components.js';
import { FACING_BACK_DEG, FACING_FRONT_DEG } from './tuning.js';
/** Looking almost straight up or down, the head gives no clear direction: the facing is kept. */
const MIN_LEVEL = 0.2;
/** Blink (the practice turn): seconds to fade to black, to hold black, and to fade back in. */
const BLINK_CLOSE_SECONDS = 0.18;
const BLINK_HOLD_SECONDS = 0.08;
const BLINK_OPEN_SECONDS = 0.22;

type Phase = 'idle' | 'closing' | 'hold' | 'opening';

/**
 * Which way the chef faces: the bar, or the back row behind (the sink, the
 * work table and range, the office corner). In the headset the whole room
 * is all around, so the chef simply turns round on the stool; the facing
 * follows the head, with a wide band between (60 to 120 degrees off the
 * bar) where it is kept, so a look to the side (the office corner, the
 * range) changes nothing.
 *
 * Practice mode on the desktop turns with a key instead (turnAround): the
 * view blinks and the player rig is rotated half a turn around the head,
 * which keeps every station where the scene authored it.
 */
export class TurnSystem extends createSystem({
  bar: { required: [Bar] },
}) {
  private blink!: Mesh<SphereGeometry, MeshBasicMaterial>;
  private phase: Phase = 'idle';
  private action: (() => void) | null = null;
  private t = 0;
  barEntity!: Entity;
  /** Current head yaw relative to the rig, degrees; positive = left. */
  yawDeg = 0;

  private readonly q = new Quaternion();
  private readonly qRig = new Quaternion();
  private readonly fwd = new Vector3();
  private readonly headBefore = new Vector3();

  init(): void {
    this.blink = new Mesh(
      new SphereGeometry(0.25, 12, 8),
      new MeshBasicMaterial({
        color: '#000000',
        side: BackSide,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.blink.name = 'Blink';
    this.blink.renderOrder = 1000;
    this.blink.visible = false;
    this.world.camera.add(this.blink);

    this.barEntity = this.world.createTransformEntity();
    this.barEntity.object3D!.name = 'Bar';
    this.barEntity.addComponent(Bar, {});
  }

  update(delta: number): void {
    this.yawDeg = this.headYawDeg();
    this.updateFacing();
    if (this.phase === 'idle') return;

    this.t += delta;
    const m = this.blink.material;
    if (this.phase === 'closing') {
      m.opacity = Math.min(1, this.t / BLINK_CLOSE_SECONDS);
      if (this.t >= BLINK_CLOSE_SECONDS) {
        const act = this.action;
        this.action = null;
        act?.();
        this.phase = 'hold';
        this.t = 0;
      }
    } else if (this.phase === 'hold') {
      m.opacity = 1;
      if (this.t >= BLINK_HOLD_SECONDS) {
        this.phase = 'opening';
        this.t = 0;
      }
    } else {
      m.opacity = Math.max(0, 1 - this.t / BLINK_OPEN_SECONDS);
      if (this.t >= BLINK_OPEN_SECONDS) {
        this.phase = 'idle';
        this.blink.visible = false;
      }
    }
  }

  /** Practice mode's turn: the view blinks and the rig turns half round about the head. */
  turnAround(): void {
    this.blinkThen(() => this.rotateBar());
  }

  /** The view blinks (eyes shut a moment) and `act` runs while it is dark: a turn, or a step to another place. */
  blinkThen(act: () => void): boolean {
    if (this.phase !== 'idle') return false;
    this.action = act;
    this.phase = 'closing';
    this.t = 0;
    this.blink.visible = true;
    return true;
  }

  /** The facing, from where the head looks in the room: past 120 degrees off the bar the back row, within 60 the bar. */
  private updateFacing(): void {
    this.player.head.getWorldQuaternion(this.q);
    this.fwd.set(0, 0, -1).applyQuaternion(this.q);
    if (Math.hypot(this.fwd.x, this.fwd.z) < MIN_LEVEL) return;
    const off = Math.abs((Math.atan2(-this.fwd.x, -this.fwd.z) * 180) / Math.PI);
    const back = chef.facingBack ? off > FACING_FRONT_DEG : off > FACING_BACK_DEG;
    if (back === chef.facingBack) return;
    chef.facingBack = back;
    coach.done(back ? 'turnBack' : 'turnFront');
    this.barEntity.setValue(Bar, 'facingBack', back);
    this.barEntity.setValue(Bar, 'turns', (this.barEntity.getValue(Bar, 'turns') ?? 0) + 1);
    console.log(`[Turn] now facing ${back ? 'the washing station' : 'the bar'}`);
  }

  /** Head direction in rig space, as a yaw angle: 0 = forward, +90 = left. */
  private headYawDeg(): number {
    // The rig's head group follows the viewer pose; it is the reliable source.
    this.player.head.getWorldQuaternion(this.q);
    this.fwd.set(0, 0, -1).applyQuaternion(this.q);
    this.player.getWorldQuaternion(this.qRig);
    this.fwd.applyQuaternion(this.qRig.invert());
    return (Math.atan2(-this.fwd.x, -this.fwd.z) * 180) / Math.PI;
  }

  /** Rotate the rig half a turn around the head, so the head stays in place. */
  private rotateBar(): void {
    this.player.head.getWorldPosition(this.headBefore);
    if (!Number.isFinite(this.headBefore.x) || !Number.isFinite(this.headBefore.z)) {
      console.warn('[Turn] head position unavailable; turn skipped');
      return;
    }
    // A half turn about Y negates the head's horizontal offset from the rig
    // origin, so shifting the rig by twice that offset keeps the head put.
    // (Computed directly: forcing updateMatrixWorld here would also update
    // the audio listener mid-frame, which can throw.)
    this.player.rotateY(Math.PI);
    this.player.position.x += 2 * (this.headBefore.x - this.player.position.x);
    this.player.position.z += 2 * (this.headBefore.z - this.player.position.z);
    // The facing follows on the next frame, from the head.
  }
}
