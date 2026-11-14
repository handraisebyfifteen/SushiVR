import { pause, RESUME_GRACE_MS } from './pause.js';
import { Matrix4, Vector3, type XRInputManager } from '@iwsdk/core';

export type Handedness = 'left' | 'right';

/**
 * Reads one tracked hand each frame and derives the two gestures this app
 * uses: pinch (thumb tip touching index tip) and fist (fingers curled into
 * the palm). Also exposes the palm point (where a held rice ball sits) and
 * the grasp point (between thumb and index, where a pinched item sits).
 *
 * Joint transforms come from IWSDK's hand adapter relative to the grip space;
 * they are converted to world space here. No allocation per frame.
 */

const SQUEEZE_JOINTS: ReadonlyArray<readonly [string, string]> = [
  ['middle-finger-tip', 'middle-finger-phalanx-proximal'],
  ['ring-finger-tip', 'ring-finger-phalanx-proximal'],
  ['pinky-finger-tip', 'pinky-finger-phalanx-proximal'],
];
/** Tip-to-knuckle distance (m) treated as fully open / fully closed. */
const CURL_OPEN_DISTANCE = 0.075;
const CURL_CLOSED_DISTANCE = 0.035;
const FIST_ON = 0.8;
const FIST_OFF = 0.55;
const PINCH_ON = 0.85;
const PINCH_OFF = 0.6;
/**
 * A hand the headset loses for less than this keeps its last pose, pinch and
 * fist. Hand tracking drops a hand now and then (one hand hiding the other
 * while shaping a piece, a fast move), and every pinch would otherwise let
 * go of what it holds (Meta's hand design guides ask apps to decide this).
 * Longer than this, the hand is gone and lets go.
 */
export const LOST_GRACE_MS = 400;

/** Frames of grasp history kept (a few hundred ms at 72-90 fps). */
const GRASP_RING = 24;
/** The fingers move the grasp point as they close: a pinch is judged where it was this long before. */
export const PINCH_LOOKBACK_MS = 150;

export class HandReader {
  readonly palm = new Vector3();
  readonly grasp = new Vector3();
  /** Index fingertip: used to dab wasabi. */
  readonly indexTip = new Vector3();
  readonly wrist = new Vector3();
  /** The grasp point over the last frames (a ring), for pinchPoint. */
  private readonly graspRing = new Float32Array(GRASP_RING * 3);
  private readonly graspTime = new Float64Array(GRASP_RING);
  private graspHead = 0;
  /** Unit vector from the wrist toward the knuckles, projected flat. */
  readonly fingerDir = new Vector3(0, 0, -1);
  /** Heading of fingerDir in degrees: 0 = forward (-Z), +90 = left. */
  yawDeg = 0;
  tracked = false;
  /** 0 = open hand, 1 = closed fist. */
  curl = 0;
  fist = false;
  fistStart = false;
  fistEnd = false;
  pinch = false;
  pinchStart = false;
  pinchEnd = false;

  /** When the hand went missing (ms, performance.now), -1 while it is seen. */
  private lostAt = -1;
  private jointIndex = new Map<string, number>();
  private indexedCount = -1;
  private readonly mat = new Matrix4();
  private readonly a = new Vector3();
  private readonly b = new Vector3();

  constructor(
    readonly handedness: Handedness,
    private readonly xr: XRInputManager,
  ) {}

  /**
   * Where the pinch was aimed: the grasp point PINCH_LOOKBACK_MS before (or
   * the oldest kept), since closing the fingers moves it by some centimetres.
   */
  pinchPoint(out: Vector3, lookbackMs = PINCH_LOOKBACK_MS): Vector3 {
    const want = performance.now() - lookbackMs;
    let best = this.graspHead;
    for (let k = 0; k < GRASP_RING; k++) {
      const i = (this.graspHead - k + GRASP_RING) % GRASP_RING;
      if (this.graspTime[i] === 0) break;
      best = i;
      if (this.graspTime[i] <= want) break;
    }
    return out.set(this.graspRing[best * 3], this.graspRing[best * 3 + 1], this.graspRing[best * 3 + 2]);
  }

  update(): void {
    const adapter = this.xr.visualAdapters.hand[this.handedness];
    const joints = adapter.jointTransforms;
    const grip = adapter.gripSpace;
    this.fistStart = this.fistEnd = this.pinchStart = this.pinchEnd = false;
    if (!joints || !grip || adapter.jointSpaces.length === 0) {
      if (this.tracked) {
        // Lost only for a moment: hold the last pose and grip.
        const now = performance.now();
        // A pause is not time lost: the grace starts again when the game goes on, and is longer then.
        if (this.lostAt < 0 || this.lostAt < pause.resumedAt) this.lostAt = now;
        const grace = pause.resumedAt > 0 && now - pause.resumedAt < RESUME_GRACE_MS ? RESUME_GRACE_MS : LOST_GRACE_MS;
        if (now - this.lostAt < grace) return;
        this.lostAt = -1;
        this.tracked = false;
        this.fistEnd = this.fist;
        this.pinchEnd = this.pinch;
        this.fist = this.pinch = false;
        this.curl = 0;
      }
      return;
    }
    this.tracked = true;
    this.lostAt = -1;
    if (this.indexedCount !== adapter.jointSpaces.length) {
      this.jointIndex.clear();
      adapter.jointSpaces.forEach((space, i) =>
        this.jointIndex.set(space.jointName, i),
      );
      this.indexedCount = adapter.jointSpaces.length;
    }
    grip.updateWorldMatrix(true, false);

    // Palm: between the middle-finger metacarpal and its knuckle.
    this.jointWorld('middle-finger-metacarpal', joints, grip.matrixWorld, this.a);
    this.jointWorld('middle-finger-phalanx-proximal', joints, grip.matrixWorld, this.b);
    this.palm.addVectors(this.a, this.b).multiplyScalar(0.5);

    // Grasp: between thumb tip and index tip.
    this.jointWorld('thumb-tip', joints, grip.matrixWorld, this.a);
    this.jointWorld('index-finger-tip', joints, grip.matrixWorld, this.b);
    this.grasp.addVectors(this.a, this.b).multiplyScalar(0.5);
    this.graspHead = (this.graspHead + 1) % GRASP_RING;
    this.graspRing[this.graspHead * 3] = this.grasp.x;
    this.graspRing[this.graspHead * 3 + 1] = this.grasp.y;
    this.graspRing[this.graspHead * 3 + 2] = this.grasp.z;
    this.graspTime[this.graspHead] = performance.now();
    this.indexTip.copy(this.b);

    this.jointWorld('wrist', joints, grip.matrixWorld, this.wrist);
    this.jointWorld('middle-finger-phalanx-proximal', joints, grip.matrixWorld, this.a);
    this.a.sub(this.wrist);
    this.a.y = 0;
    if (this.a.lengthSq() > 1e-6) {
      this.fingerDir.copy(this.a).normalize();
      this.yawDeg = (Math.atan2(-this.fingerDir.x, -this.fingerDir.z) * 180) / Math.PI;
    }

    // Curl: how close the three outer fingertips are to their knuckles.
    let curl = 0;
    for (const [tip, knuckle] of SQUEEZE_JOINTS) {
      this.jointWorld(tip, joints, grip.matrixWorld, this.a);
      this.jointWorld(knuckle, joints, grip.matrixWorld, this.b);
      const d = this.a.distanceTo(this.b);
      const t = (CURL_OPEN_DISTANCE - d) / (CURL_OPEN_DISTANCE - CURL_CLOSED_DISTANCE);
      curl += Math.min(1, Math.max(0, t));
    }
    this.curl = curl / SQUEEZE_JOINTS.length;

    const wasFist = this.fist;
    this.fist = wasFist ? this.curl > FIST_OFF : this.curl > FIST_ON;
    this.fistStart = this.fist && !wasFist;
    this.fistEnd = !this.fist && wasFist;

    const strength = adapter.getPinchStrength();
    const select = this.xr.getSelectState(this.handedness).active;
    const wasPinch = this.pinch;
    this.pinch = select || (wasPinch ? strength > PINCH_OFF : strength > PINCH_ON);
    this.pinchStart = this.pinch && !wasPinch;
    this.pinchEnd = !this.pinch && wasPinch;
  }

  private jointWorld(
    name: string,
    joints: Float32Array,
    gripWorld: Matrix4,
    out: Vector3,
  ): void {
    const index = this.jointIndex.get(name);
    if (index === undefined) {
      out.set(0, -10, 0);
      return;
    }
    this.mat.fromArray(joints, index * 16);
    out.setFromMatrixPosition(this.mat).applyMatrix4(gripWorld);
  }
}
