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
import { chef, holdingAnything } from './game-state.js';
import { Bar } from './sushi-components.js';
import { TURN_HOLD_SECONDS, TURN_YAW_DEG } from './tuning.js';
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
 * keeps every station where the scene authored it. While the chef holds
 * anything (saku, knife, neta, rice, sushi, cloth) no turn happens.
 */
export class TurnSystem extends createSystem({
  bar: { required: [Bar] },
}) {
  private blink!: Mesh<SphereGeometry, MeshBasicMaterial>;
  private phase: Phase = 'idle';
  private t = 0;
  private holdTime = 0;
  private armed = true;
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

    if (this.phase === 'idle') {
      if (!this.armed && Math.abs(this.yawDeg) < REARM_YAW_DEG) this.armed = true;
      // Nothing in the hands: a chef carrying fish, rice or the knife stays put.
      const looking = this.armed && !holdingAnything() && this.yawDeg > TURN_YAW_DEG;
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

    const facingBack = !this.barEntity.getValue(Bar, 'facingBack');
    chef.facingBack = facingBack;
    this.barEntity.setValue(Bar, 'facingBack', facingBack);
    this.barEntity.setValue(Bar, 'turns', (this.barEntity.getValue(Bar, 'turns') ?? 0) + 1);
    console.log(`[Turn] now facing ${facingBack ? 'the washing station' : 'the bar'}`);
  }
}
