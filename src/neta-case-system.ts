import {
  type Entity,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Sprite,
  createSystem,
  Vector3,
} from '@iwsdk/core';
import { COLOR_READY, glowObject } from './feedback.js';
import { chef, FISH_COLOR, FISH_LABEL, type FishKind, service } from './game-state.js';
import { hands } from './hands.js';
import { NETA_CASE_DEPTH, NETA_CASE_HEIGHT, NETA_SLOT_PITCH } from './layout.js';
import { stations } from './station-system.js';
import { Fish, Held, Saku, StationKind } from './sushi-components.js';
import { makeOrderTicket, makeTextSprite } from './text-sprites.js';

/** Seconds-ish time constant of the door slide (higher is snappier). */
const DOOR_SPEED = 12;
/** A door this far open lets a hand reach in (0 closed, 1 open). */
const REACH_OPEN = 0.7;
/** In front of the doors (toward the chef) and above the case floor where the neta hand counts as reaching in. */
const REACH_FRONT = 0.14;
const REACH_INSIDE = 0.12;
const REACH_BOTTOM = 0.02;
const REACH_TOP = 0.34;
/** The doors close this long after the hand has left. */
const CLOSE_DELAY = 0.3;
/** The neta hand's pinch point this close to a saku marks it as the one a pinch takes (as in the cutting system). */
const PICK_DISTANCE = 0.12;
/** LED strip brightness: always on, brighter while a door is open. */
const LED_REST = 0.6;
const LED_OPEN = 1.8;
/** Order ticket on the machine housing (case-local): the housing spans x -0.6..-0.44. */
const TICKET_X = -0.52;
const TICKET_Y = NETA_CASE_HEIGHT * 0.6;

const tmp = new Vector3();

/**
 * Door state shared with the cutting system: how open each slot's door is,
 * and whether a point in the case (a saku) is behind an open door.
 */
export const caseDoors = {
  open: [0, 0, 0],
  object: null as Object3D | null,
  /** Slot index (0..2) of a case-local x. */
  slotOf(localX: number): number {
    return Math.max(0, Math.min(2, Math.round(localX / NETA_SLOT_PITCH) + 1));
  },
  /** True when the door in front of this world point is open far enough to reach in. */
  isOpenAt(point: Vector3): boolean {
    if (!this.object) return true;
    this.object.worldToLocal(tmp.copy(point));
    return this.open[this.slotOf(tmp.x)] >= REACH_OPEN;
  },
};

/**
 * The neta case's chef-side sliding doors open by themselves: when the neta
 * hand comes up to the case, the door in front of it slides over its
 * neighbour. Taking a saku (or putting one back) closes it again, as does
 * the hand leaving. Keeping the case shut keeps the fish cold.
 *
 * While a door is open the case comes into focus: the LED strip brightens,
 * the saku a pinch would take glows white with its name above it, and the
 * current order ticket shows on the chef side of the machine housing at the
 * case's left end, like a slip clipped there (clear of the saku names and
 * the master's words above the fish).
 */
export class NetaCaseSystem extends createSystem({
  saku: { required: [Saku] },
}) {
  private doors: Object3D[] = [];
  private closedX: number[] = [];
  /** Slot whose door the hand has asked for, or -1. */
  private wanted = -1;
  /** False after a take or a return, until the hand has left the front of the case. */
  private armed = true;
  private lastHolding: string = Held.None;
  private away = 0;
  private readonly local = new Vector3();
  private readonly sakuPos = new Vector3();
  private led: MeshStandardMaterial | null = null;
  private hovered: Entity | null = null;
  private tags = new Map<FishKind, Sprite>();
  private ticket: Sprite | null = null;
  private ticketKey = '';

  update(delta: number): void {
    if (!this.findDoors()) return;
    const side = chef.netaSide;
    const hand = hands.all[side];
    const holding = chef.hands[side].holding;

    let reaching = false;
    let slot = -1;
    if (hand?.tracked && !chef.facingBack && (holding === Held.None || holding === Held.Saku)) {
      this.local.copy(hand.grasp);
      caseDoors.object!.worldToLocal(this.local);
      const halfSpan = 1.5 * NETA_SLOT_PITCH;
      const doorZ = this.doors[0].position.z;
      reaching =
        Math.abs(this.local.x) < halfSpan &&
        this.local.y > REACH_BOTTOM && this.local.y < REACH_TOP &&
        this.local.z > doorZ - REACH_INSIDE && this.local.z < doorZ + REACH_FRONT;
      if (reaching) slot = caseDoors.slotOf(this.local.x);
    }

    // Taking a saku (empty -> holding) or putting one back (holding -> empty)
    // in front of the case closes the door until the hand goes away.
    if (reaching && holding !== this.lastHolding) this.armed = false;
    this.lastHolding = holding;

    if (reaching) {
      this.away = 0;
      this.wanted = this.armed ? slot : -1;
    } else {
      this.away += delta;
      if (this.away >= CLOSE_DELAY) {
        this.wanted = -1;
        this.armed = true;
      }
    }

    const k = Math.min(1, delta * DOOR_SPEED);
    for (let i = 0; i < 3; i++) {
      const target = i === this.wanted ? 1 : 0;
      caseDoors.open[i] += (target - caseDoors.open[i]) * k;
      if (Math.abs(target - caseDoors.open[i]) < 0.002) caseDoors.open[i] = target;
      // Outer doors slide toward the middle, the middle one to the right.
      const dir = i === 2 ? -1 : 1;
      this.doors[i].position.x = this.closedX[i] + dir * NETA_SLOT_PITCH * caseDoors.open[i];
    }
    this.updateFocus(reaching && holding === Held.None);
  }

  /** LED, the saku a pinch would take, and the order ticket, while a door is open. */
  private updateFocus(choosing: boolean): void {
    let mostOpen = 0;
    for (let i = 0; i < 3; i++) mostOpen = Math.max(mostOpen, caseDoors.open[i]);
    if (this.led) this.led.emissiveIntensity = LED_REST + (LED_OPEN - LED_REST) * mostOpen;

    // The saku nearest the pinch point, behind an open door.
    let best: Entity | null = null;
    if (choosing) {
      const grasp = hands.all[chef.netaSide].grasp;
      let bestD = PICK_DISTANCE;
      for (const entity of this.queries.saku.entities) {
        const object = entity.object3D;
        if (!object) continue;
        object.getWorldPosition(this.sakuPos);
        const d = this.sakuPos.distanceTo(grasp);
        if (d < bestD && caseDoors.isOpenAt(this.sakuPos)) {
          bestD = d;
          best = entity;
        }
      }
    }
    if (best !== this.hovered) {
      if (this.hovered?.object3D) glowObject(this.hovered.object3D, null);
      if (best?.object3D) glowObject(best.object3D, COLOR_READY);
      for (const tag of this.tags.values()) tag.visible = false;
      this.hovered = best;
    }
    if (best?.object3D) {
      const tag = this.tagFor(best.getValue(Saku, 'fish') as FishKind);
      best.object3D.getWorldPosition(tag.position);
      tag.position.y += 0.075;
      tag.visible = true;
    }

    // The order ticket, on the housing at the left end while a door is open.
    const order = service.order;
    const key = order ? `${order.fish}|${order.wasabi}` : '';
    if (key !== this.ticketKey) {
      this.ticketKey = key;
      if (this.ticket) {
        this.ticket.removeFromParent();
        this.ticket.material.map?.dispose();
        this.ticket.material.dispose();
        this.ticket = null;
      }
      if (order) {
        this.ticket = makeOrderTicket(FISH_LABEL[order.fish], FISH_COLOR[order.fish], order.fish === Fish.Silver, order.wasabi);
        caseDoors.object!.add(this.ticket);
      }
    }
    if (this.ticket) {
      this.ticket.visible = mostOpen > 0.3;
      this.ticket.position.set(TICKET_X, TICKET_Y, NETA_CASE_DEPTH / 2 + 0.01);
    }
  }

  private tagFor(fish: FishKind): Sprite {
    let tag = this.tags.get(fish);
    if (!tag) {
      tag = makeTextSprite(FISH_LABEL[fish], { width: 0.13 });
      tag.name = `SakuTag_${fish}`;
      tag.visible = false;
      this.world.createTransformEntity(tag);
      this.tags.set(fish, tag);
    }
    return tag;
  }

  private findDoors(): boolean {
    if (this.doors.length === 3) return true;
    const info = stations.get(StationKind.NetaCase);
    const object = info?.entity.object3D;
    if (!object) return false;
    const found: Object3D[] = [];
    for (let i = 0; i < 3; i++) {
      const door = object.getObjectByName(`Door${i}`);
      if (!door) return false;
      found.push(door);
    }
    this.doors = found;
    this.closedX = found.map((d) => d.position.x);
    caseDoors.object = object;
    const led = object.getObjectByName('LedStrip') as Mesh | undefined;
    if (led) {
      // Own copy, so brightening it does not touch any other mesh.
      this.led = (led.material as MeshStandardMaterial).clone();
      led.material = this.led;
    }
    return true;
  }
}
