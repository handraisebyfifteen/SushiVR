import { createSystem, type Entity, Vector3 } from '@iwsdk/core';
import { debug } from './debug.js';
import { chef } from './game-state.js';
import { MANAITA_TOP } from './layout.js';
import { hands } from './hands.js';
import { Held, Station, StationKind } from './sushi-components.js';

export type Kind = (typeof StationKind)[keyof typeof StationKind];
const ALL_KINDS = Object.values(StationKind) as Kind[];

export interface StationInfo {
  entity: Entity;
  /** World position of the station surface (origin + authored height). */
  pos: Vector3;
  radius: number;
  halfW: number;
  halfD: number;
  /** Depth below the surface that still counts as over the station. */
  below: number;
}

/** Live station table, refreshed every frame; keyed by station kind. */
export const stations = new Map<Kind, StationInfo>();

/** Vertical band (m) above a station surface in which a hand counts as over it. */
const ZONE_HEIGHT = 0.3;
/** Bump the version when authored positions change, so old saved spots are ignored. */
const STORAGE_PREFIX = 'sushi-vr.station.v6.';
/** A pinch this close to a movable dish picks it up (closer than a saku pick). */
const DISH_PICK_DISTANCE = 0.06;

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
  return point.y > s.pos.y - s.below && point.y < s.pos.y + ZONE_HEIGHT;
}

/**
 * Keeps the station table current, lets the player pinch and move the
 * movable props (wasabi dish, tezu bowl), and remembers where they were put
 * so they come back to the same spot. Moving a dish is touching something
 * that is not food, so that hand then needs washing.
 */
export class StationSystem extends createSystem({
  stations: { required: [Station] },
}) {
  private heldDish: Entity | null = null;
  private heldSide = 0;

  init(): void {
    this.cleanupFuncs.push(
      this.queries.stations.subscribe('qualify', (entity) => this.restore(entity)),
    );
    // Scene entities may already exist when this system starts.
    for (const entity of this.queries.stations.entities) this.restore(entity);
  }

  update(): void {
    this.updateDish();
    if (debug.enabled) this.probeReach();
    for (const entity of this.queries.stations.entities) {
      const object = entity.object3D;
      if (!object) continue;
      const kind = entity.getValue(Station, 'kind') as Kind;
      let info = stations.get(kind);
      if (!info) {
        info = { entity, pos: new Vector3(), radius: 0, halfW: 0, halfD: 0, below: 0.05 };
        stations.set(kind, info);
      }
      object.getWorldPosition(info.pos);
      info.pos.y += entity.getValue(Station, 'height') ?? 0;
      info.radius = entity.getValue(Station, 'radius') ?? 0.12;
      info.halfW = (entity.getValue(Station, 'width') ?? 0) / 2;
      info.halfD = (entity.getValue(Station, 'depth') ?? 0) / 2;
      info.below = entity.getValue(Station, 'below') ?? 0.05;
    }
  }

  private updateDish(): void {
    if (!this.heldDish) {
      for (let i = 0; i < 2; i++) {
        const hand = hands.all[i];
        if (!hand?.tracked || !hand.pinchStart || chef.hands[i].holding !== Held.None) continue;
        for (const entity of this.queries.stations.entities) {
          if (!entity.getValue(Station, 'movable') || !entity.object3D) continue;
          entity.object3D.getWorldPosition(this.tmp);
          if (hand.grasp.distanceTo(this.tmp) > DISH_PICK_DISTANCE) continue;
          this.heldDish = entity;
          this.heldSide = i;
          chef.hands[i].holding = Held.Dish;
          if (!chef.hands[i].needsWash) {
            chef.hands[i].needsWash = true;
            console.log(`[Station] ${i === 0 ? 'left' : 'right'} hand touched a dish: needs washing`);
          }
          break;
        }
        if (this.heldDish) break;
      }
      return;
    }
    const hand = hands.all[this.heldSide];
    const object = this.heldDish.object3D!;
    if (hand.tracked) {
      object.position.copy(hand.grasp);
      object.position.y = Math.max(object.position.y - 0.03, MANAITA_TOP);
    }
    if (hand.pinchEnd || !hand.tracked) {
      this.remember(this.heldDish);
      chef.hands[this.heldSide].holding = Held.None;
      this.heldDish = null;
    }
  }

  private readonly tmp = new Vector3();
  private readonly palmMask = [0, 0];
  private readonly tipMask = [0, 0];

  /**
   * Debug only: logs which stations each hand's palm, and its pinch point or
   * index fingertip, are over whenever that changes, with the palm's world
   * position, so reach can be checked from the console.
   */
  private probeReach(): void {
    for (let i = 0; i < 2; i++) {
      const hand = hands.all[i];
      let palm = 0;
      let tip = 0;
      if (hand?.tracked) {
        for (let k = 0; k < ALL_KINDS.length; k++) {
          const kind = ALL_KINDS[k];
          if (overStation(hand.palm, kind)) palm |= 1 << k;
          if (overStation(hand.grasp, kind) || overStation(hand.indexTip, kind)) tip |= 1 << k;
        }
      }
      if (palm === this.palmMask[i] && tip === this.tipMask[i]) continue;
      this.palmMask[i] = palm;
      this.tipMask[i] = tip;
      const names = (mask: number) => ALL_KINDS.filter((_, k) => mask & (1 << k)).join(',') || 'none';
      const p = hand.palm;
      console.log(
        `[Reach] ${i === 0 ? 'left' : 'right'} palm:${names(palm)} tip:${names(tip)} at ${p.x.toFixed(3)} ${p.y.toFixed(3)} ${p.z.toFixed(3)}`,
      );
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
