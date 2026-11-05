import type { Entity, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { JudgeKind } from '../game-state.js';
import type { HandReader } from '../hand-reader.js';
import type { NetaId, PieceKind } from '../menu.js';
import type { PieceResult } from '../scoring.js';

/**
 * What every kind of piece shares, owned by PieceSystem: the piece group
 * and its rice, the wasabi dab, the beat and its judging, and the state the
 * master and the score read. The core also carries, places and serves a
 * finished piece; each kind (an Assembly) builds it up to Done.
 */
export interface PieceCore {
  readonly entity: Entity;
  /** Everything of the piece in progress hangs off this group (yaw = pieceYaw). */
  readonly piece: Group;
  readonly rice: Mesh<SphereGeometry, MeshStandardMaterial>;
  readonly wasabiBlob: Mesh;
  /** World position of the piece this frame (after layout). */
  readonly focus: Vector3;
  /** Where a cut slice lies on the board. */
  readonly netaOnBoard: Vector3;
  kind: PieceKind | null;
  stage: string;
  netaId: NetaId;
  /** A topping exists (slice cut or taken, gunkan wrapped): the freshness clock runs. */
  hasNeta: boolean;
  /** The piece rests on the neta hand's fingers. */
  netaHeld: boolean;
  hasRice: boolean;
  wasabi: 'none' | 'finger' | 'neta';
  /** Slot 0: the rice (beat 2); 1-3: the kind's own timed touches. */
  readonly judges: JudgeKind[];
  cutAge: number;
  skinRight: boolean;
  pieceYaw: number;
  boardWasDirty: boolean;
  setStage(stage: string): void;
  judge(slot: number): JudgeKind;
  startMetronome(beats: number): void;
  /** Claims the piece for a kind (its first ingredient); false if another kind is in progress. */
  begin(kind: PieceKind): boolean;
  /**
   * Wasabi with the rice hand's index finger: down to the dish (only when
   * `canTake`), then to where the assembly's wasabiTarget says.
   */
  updateWasabi(riceHand: HandReader, canTake: boolean): void;
}

export interface Assembly {
  readonly kind: PieceKind;
  /** Judged beats: the rice (slot 0) and this kind's own touches. */
  readonly judgeSlots: number;
  /** Stages before Done (Done, Carried and Placed are the core's). */
  update(delta: number): void;
  /** Places this kind's meshes in the piece; true once the rice sits on the piece (not on the rice hand). */
  layout(): boolean;
  /** Where a wasabi dab lands now (world); false if not now. */
  wasabiTarget(out: Vector3): boolean;
  /** The beat ring sits on the rice hand (true) or on the piece. */
  ringOnHand(): boolean;
  /** Station hints for this kind's next step. */
  hints(): void;
  /** Fills this kind's part of the score (right item, orientation...). */
  score(r: PieceResult): void;
  reset(): void;
  /** Writes this kind's progress fields for the master. */
  publish(): void;
  describe(): string;
}

/** Heading helpers (degrees). */
export function normYaw(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Difference between two headings as lines (direction ignored), -90..90. */
export function lineDiff(a: number, b: number): number {
  let d = (a - b) % 180;
  if (d > 90) d -= 180;
  if (d < -90) d += 180;
  return d;
}
