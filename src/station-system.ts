import { createSystem, type Entity, Grabbed, Vector3 } from '@iwsdk/core';
import { Station, StationKind } from './sushi-components.js';

export type Kind = (typeof StationKind)[keyof typeof StationKind];

export interface StationInfo {
  entity: Entity;
  /** World position of the station surface (origin + authored height). */
  pos: Vector3;
  radius: number;
  halfW: number;
  halfD: number;
}

/** Live station table, refreshed every frame; keyed by station kind. */
export const stations = new Map<Kind, StationInfo>();

/** Vertical band (m) above a station surface in which a hand counts as over it. */
const ZONE_HEIGHT = 0.3;
const ZONE_BELOW = 0.05;
const STORAGE_PREFIX = 'sushi-vr.station.';

/** True when a hand point is above the station surface, inside its zone. */
export function overStation(point: Vector3, kind: Kind): boolean {
  const s = stations.get(kind);
  if (!s) return false;
  const dx = point.x - s.pos.x;
  const dz = point.z - s.pos.z;
  if (s.halfW > 0) {
    if (Math.abs(dx) > s.halfW || Math.abs(dz) > s.halfD) return false;
  } else if (dx * dx + dz * dz > s.radius * s.radius) {
    return false;
  }
  return point.y > s.pos.y - ZONE_BELOW && point.y < s.pos.y + ZONE_HEIGHT;
}

/**
 * Keeps the station table current and remembers where the player moved the
 * movable props (wasabi dish, tezu bowl) so they come back to the same spot.
 */
export class StationSystem extends createSystem({
  stations: { required: [Station] },
  held: { required: [Station, Grabbed] },
}) {
  init(): void {
    this.cleanupFuncs.push(
      this.queries.stations.subscribe('qualify', (entity) => this.restore(entity)),
      this.queries.held.subscribe('disqualify', (entity) => this.remember(entity)),
    );
    // Scene entities may already exist when this system starts.
    for (const entity of this.queries.stations.entities) this.restore(entity);
  }

  update(): void {
    for (const entity of this.queries.stations.entities) {
      const object = entity.object3D;
      if (!object) continue;
      const kind = entity.getValue(Station, 'kind') as Kind;
      let info = stations.get(kind);
      if (!info) {
        info = { entity, pos: new Vector3(), radius: 0, halfW: 0, halfD: 0 };
        stations.set(kind, info);
      }
      object.getWorldPosition(info.pos);
      info.pos.y += entity.getValue(Station, 'height') ?? 0;
      info.radius = entity.getValue(Station, 'radius') ?? 0.12;
      info.halfW = (entity.getValue(Station, 'width') ?? 0) / 2;
      info.halfD = (entity.getValue(Station, 'depth') ?? 0) / 2;
    }
  }

  private key(entity: Entity): string | null {
    if (!entity.getValue(Station, 'movable')) return null;
    return STORAGE_PREFIX + entity.getValue(Station, 'kind');
  }

  private restore(entity: Entity): void {
    const key = this.key(entity);
    const object = entity.object3D;
    if (!key || !object) return;
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return;
      const [x, y, z] = JSON.parse(saved) as number[];
      if ([x, y, z].every(Number.isFinite)) object.position.set(x, y, z);
    } catch {
      /* storage unavailable: keep the authored position */
    }
  }

  private remember(entity: Entity): void {
    const key = this.key(entity);
    const object = entity.object3D;
    if (!key || !object) return;
    // Released props settle onto the cutting board, inside its edges.
    const board = stations.get(StationKind.CuttingBoard);
    const p = object.position;
    if (board) {
      const margin = 0.06;
      p.x = Math.min(board.pos.x + board.halfW - margin, Math.max(board.pos.x + margin - board.halfW, p.x));
      p.z = Math.min(board.pos.z + board.halfD - margin, Math.max(board.pos.z + margin - board.halfD, p.z));
      p.y = board.pos.y;
    }
    object.rotation.set(0, 0, 0);
    try {
      localStorage.setItem(key, JSON.stringify([p.x, p.y, p.z]));
    } catch {
      /* storage unavailable: nothing to remember */
    }
    console.log(`[Station] ${entity.getValue(Station, 'kind')} moved to`, p.x.toFixed(3), p.y.toFixed(3), p.z.toFixed(3));
  }
}
