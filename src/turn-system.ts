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
import { Bar } from './sushi-components.js';

/** Head yaw to the left (degrees) that starts a turn. */
export const TURN_YAW_DEG = 60;
/** Seconds the head must stay turned before the bar rotates. */
export const TURN_HOLD_SECONDS = 0.5;
/** The head must come back within this yaw (degrees) before another turn can start. */
const REARM_YAW_DEG = 30;
/** Blink: seconds to fade to black, to hold black, and to fade back in. */
const BLINK_CLOSE_SECONDS = 0.18;
const BLINK_HOLD_SECONDS = 0.08;
const BLINK_OPEN_SECONDS = 0.22;

type Phase = 'idle' | 'closing' | 'hold' | 'opening';

/**
 * Turning around without leaving the stool: look far to the left and hold.
 * The view blinks to black and the whole bar is rotated 180 degrees around the
 * player's head, so the washing station behind the chef is now in front.
 * The same gesture turns back. Rotating the player rig instead of the scene
 * keeps every station where the scene authored it.
 */
export class TurnSystem extends createSystem({
  bar: { required: [Bar] },
}) {
  private blink!: Mesh<SphereGeometry, MeshBasicMaterial>;
  private phase: Phase = 'idle';
  private t = 0;
  private holdTime = 0;
  private armed = true;
  private barEntity!: Entity;
  /** Current head yaw relative to the rig, degrees; positive = left. */
  yawDeg = 0;

  private readonly q = new Quaternion();
  private readonly qRig = new Quaternion();
  private readonly fwd = new Vector3();
  private readonly headBefore = new Vector3();
  private readonly headAfter = new Vector3();

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

    if (this.phase === 'idle') {
      if (!this.armed && Math.abs(this.yawDeg) < REARM_YAW_DEG) this.armed = true;
      const looking = this.armed && this.yawDeg > TURN_YAW_DEG;
      this.holdTime = looking ? this.holdTime + delta : 0;
      if (this.holdTime >= TURN_HOLD_SECONDS) {
        this.holdTime = 0;
        this.armed = false;
        this.phase = 'closing';
        this.t = 0;
        this.blink.visible = true;
      }
      return;
    }

    this.t += delta;
    const m = this.blink.material;
    if (this.phase === 'closing') {
      m.opacity = Math.min(1, this.t / BLINK_CLOSE_SECONDS);
      if (this.t >= BLINK_CLOSE_SECONDS) {
        this.rotateBar();
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

  /** Head direction in rig space, as a yaw angle: 0 = forward, +90 = left. */
  private headYawDeg(): number {
    const cam = this.world.camera;
    cam.getWorldQuaternion(this.q);
    this.fwd.set(0, 0, -1).applyQuaternion(this.q);
    this.player.getWorldQuaternion(this.qRig);
    this.fwd.applyQuaternion(this.qRig.invert());
    return (Math.atan2(-this.fwd.x, -this.fwd.z) * 180) / Math.PI;
  }

  /** Rotate the rig half a turn around the head, so the head stays in place. */
  private rotateBar(): void {
    const cam = this.world.camera;
    cam.getWorldPosition(this.headBefore);
    this.player.rotateY(Math.PI);
    this.player.updateMatrixWorld(true);
    cam.getWorldPosition(this.headAfter);
    this.player.position.x += this.headBefore.x - this.headAfter.x;
    this.player.position.z += this.headBefore.z - this.headAfter.z;
    this.player.updateMatrixWorld(true);

    const facingBack = !this.barEntity.getValue(Bar, 'facingBack');
    this.barEntity.setValue(Bar, 'facingBack', facingBack);
    this.barEntity.setValue(Bar, 'turns', (this.barEntity.getValue(Bar, 'turns') ?? 0) + 1);
    console.log(`[Turn] now facing ${facingBack ? 'the washing station' : 'the bar'}`);
  }
}
