import {
  type Entity,
  type InstancedMesh,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Sprite,
  createSystem,
  Vector3,
} from '@iwsdk/core';
import { COLOR_READY, COLOR_WARN, glowObject } from './feedback.js';
import { caseLabel, fishOrder } from './fish-order.js';
import { caseStock, chef, type HeldKind, service } from './game-state.js';
import { hands } from './hands.js';
import { heldOut } from './pointing.js';
import {
  NETA_CASE_DEPTH,
  NETA_CASE_HEIGHT,
  NETA_CASE_WIDTH,
  NETA_DOOR_COUNT,
  NETA_DOOR_PITCH,
  NETA_HOUSING_WIDTH,
} from './layout.js';
import { NETA, type NetaId } from './menu.js';
import { stations } from './station-system.js';
import { CaseItem, Held, StationKind } from './sushi-components.js';
import { makeOrderCard, redrawOrderCard } from './order-card.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { ENABLED_KINDS } from './tuning.js';

/** Seconds-ish time constant of the door slide (higher is snappier). */
const DOOR_SPEED = 12;
/** A door this far open lets a hand reach in (0 closed, 1 open). */
const REACH_OPEN = 0.7;
/** In front of the doors (toward the chef) and above the case floor where a hand counts as reaching in. */
const REACH_FRONT = 0.14;
const REACH_INSIDE = 0.12;
const REACH_BOTTOM = 0.02;
const REACH_TOP = 0.34;
/** The doors close this long after the hand has left. */
const CLOSE_DELAY = 0.3;
/** A new item must be this much nearer (along the case) than the hovered one to take over (no flicker at the seams). */
const HOVER_HYSTERESIS = 0.01;
/**
 * A pinch takes what was glowing this long before it closed: closing the
 * fingers moves the pinch point a few centimetres, which at this spacing
 * would otherwise pick the neighbour.
 */
const PINCH_LATCH = 0.15;
/** Frames of hover history kept per hand (enough for PINCH_LATCH at 120 fps). */
const HISTORY = 32;
/** LED strip brightness: always on, brighter while a door is open. */
const LED_REST = 0.6;
const LED_OPEN = 1.8;
/** Case-local X of the glass part (right of the housing), where the doors are. */
const GLASS_LEFT = -NETA_CASE_WIDTH / 2 + NETA_HOUSING_WIDTH;
const GLASS_RIGHT = NETA_CASE_WIDTH / 2;
/** Order ticket on the machine housing at the case's left end (case-local). */
const TICKET_X = -NETA_CASE_WIDTH / 2 + NETA_HOUSING_WIDTH / 2;
const TICKET_Y = NETA_CASE_HEIGHT * 0.6;
const N = NETA_DOOR_COUNT;
/** Block items that are sliced (they shorten); the rest show one instance per piece. */
const BLOCK_PREP = 'saku';
/** Whether the rice hand's items are in use yet: uni and roe with gunkan, the fillings with rolls. */
function itemLive(prep: string): boolean {
  if (prep === 'scoop') return ENABLED_KINDS.includes('gunkan');
  if (prep === 'filling') return ENABLED_KINDS.includes('maki');
  return true;
}

const tmp = new Vector3();

/**
 * Door state shared with the cutting system: how open each door is, which
 * way it slid, and whether a point in the case is behind an open door.
 */
export const caseDoors = {
  open: new Array<number>(N).fill(0),
  /** +1 = slid right over its right neighbour, -1 = left. */
  dir: new Array<number>(N).fill(-1),
  object: null as Object3D | null,
  /** Door index (0..N-1, left to right) in front of a case-local x. */
  slotOf(localX: number): number {
    return Math.max(0, Math.min(N - 1, Math.floor((localX - GLASS_LEFT) / NETA_DOOR_PITCH)));
  },
  /** True when the door in front of this world point is open far enough, and no other door has slid over it. */
  isOpenAt(point: Vector3): boolean {
    if (!this.object) return true;
    this.object.worldToLocal(tmp.copy(point));
    const slot = this.slotOf(tmp.x);
    if (this.open[slot] < REACH_OPEN) return false;
    for (let i = 0; i < N; i++) {
      if (i !== slot && this.open[i] > 0.3 && i + this.dir[i] === slot) return false;
    }
    return true;
  },
};

/**
 * What the hands are about to take from the case, and taking it. The
 * CaseItem component's `remaining` is the stock; everything else follows it.
 */
export const caseApi = {
  /** Per hand (0 left, 1 right): the case item its pinch would take, or null. */
  hovered: [null, null] as [Entity | null, Entity | null],
  /** Per hand: true when that hand may take the hovered item (its door is open and it is that hand's kind of item). */
  ready: [false, false],
  /** Per hand: the hovered item belongs to the other hand. */
  wrongHand: [false, false],
  neta(entity: Entity): NetaId {
    return entity.getValue(CaseItem, 'neta') as NetaId;
  },
  /** Units left (slices, pieces, servings). */
  stock(entity: Entity): number {
    return entity.getValue(CaseItem, 'remaining') ?? 0;
  },
  /** Takes n units (slices, pieces, servings). False, and nothing taken, if fewer are left. */
  consume(entity: Entity, n: number): boolean {
    const left = entity.getValue(CaseItem, 'remaining') ?? 0;
    if (left < n) return false;
    entity.setValue(CaseItem, 'remaining', left - n);
    return true;
  },
  /** Every case item back to full (the coming prep mode's job; a dev key for now). */
  restockAll: (): void => undefined,
  /** What a pinch by this hand takes: the item that glowed just before the fingers closed. */
  chosen: (_side: number): Entity | null => null,
  /** Whether this hand may take that item now. */
  check(side: number, item: Entity): 'ok' | 'wrongHand' | 'shut' {
    const def = NETA[this.neta(item)];
    const mine = def.hand === 'neta' ? side === chef.netaSide : side === chef.riceSide;
    if (!mine) return 'wrongHand';
    item.object3D!.getWorldPosition(tmp2);
    return caseDoors.isOpenAt(tmp2) ? 'ok' : 'shut';
  },
};
const tmp2 = new Vector3();

/** What a hand may carry while it opens a door (taking something, or putting a saku back). */
function canOpenWith(holding: HeldKind): boolean {
  return holding === Held.None || holding === Held.Saku;
}

/** Zoom over an open door: items shown twice life size above the case, tilted toward the chef. */
const ZOOM_SCALE = 2;
const ZOOM_Y = NETA_CASE_HEIGHT + 0.06;
const ZOOM_TILT = 0.6;
/** Item names in the zoom: one label per item behind a door (a door covers up to 7). */
const ZOOM_LABELS = 8;
/** The name over the item a hand is at (wider while the order is taken: stock and order too). */
const TAG_WIDTH = 0.13;
const TAG_WIDTH_ORDERING = 0.26;
/** The item under the fingers rises this much out of the zoom. */
const ZOOM_LIFT = 0.025;

interface Visual {
  body: Object3D | null;
  inst: InstancedMesh | null;
  perUnit: number;
  container: boolean;
  last: number;
}

/**
 * The neta case: its chef-side sliding doors, which item each hand is about
 * to take, the stock on show, and the zoom.
 *
 * Doors open by themselves: when either hand comes up to the case, the door
 * in front of the item it is reaching for slides over a neighbour. Taking
 * something (or putting a saku back) closes it again, as does the hand
 * leaving. With both hands at the case, each door slides away from the
 * other hand's door; where that is impossible (neighbouring doors at an end
 * of the case) the hand that came second waits.
 *
 * Choosing: the item nearest the pinch point along the case glows white
 * with its name above it, or amber when it is the other hand's (the left
 * hand takes the neta, the right hand the uni, roe and roll fillings).
 *
 * Stock: a saku is as long as the slices it has left, a tray shows the
 * pieces left; at zero the item is gone (sold out).
 *
 * Zoom: while a door is open, the items behind it float twice life size
 * above the case, tilted toward the chef, each with its name, the one under
 * the fingers glowing too. The order ticket shows on the machine housing.
 */
export class NetaCaseSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private doors: Object3D[] = [];
  private closedX: number[] = [];
  /** Per hand: the door it asks for, the door it was given (-1 none). */
  private readonly request = [-1, -1];
  private readonly granted = [-1, -1];
  private readonly reaching = [false, false];
  /** False after a take or a return, until that hand has left the front of the case. */
  private readonly armed = [true, true];
  private readonly lastHolding: HeldKind[] = [Held.None, Held.None];
  private readonly away = [CLOSE_DELAY, CLOSE_DELAY];
  /** Direction chosen for a door when it was granted (applied once it is closed). */
  private readonly nextDir = new Array<number>(N).fill(-1);
  private readonly visuals = new Map<Entity, Visual>();
  private readonly glowed: [Entity | null, Entity | null] = [null, null];
  private readonly tags: Sprite[] = [];
  private readonly tagVersion = [-1, -1];
  private zoomVersion = -1;
  private readonly local = new Vector3();
  private readonly headAt = new Vector3();
  private readonly itemLocal = new Vector3();
  private readonly itemPos = new Vector3();
  private led: MeshStandardMaterial | null = null;
  private ticket: Sprite | null = null;
  private ticketItem = '';
  private ticketWasabi = false;
  private zoom!: Object3D;
  private zoomDoor = -1;
  private zoomHover: Entity | null = null;
  private readonly zoomClones = new Map<Entity, Object3D>();
  private readonly zoomLabels: Sprite[] = [];
  private time = 0;
  /** Per hand, a ring of (time, hovered item) for the pinch latch. */
  private readonly historyTime = [new Float64Array(HISTORY), new Float64Array(HISTORY)];
  private readonly historyItem: Array<Array<Entity | null>> = [new Array(HISTORY).fill(null), new Array(HISTORY).fill(null)];
  private readonly historyHead = [0, 0];

  init(): void {
    caseApi.chosen = (side) => this.chosen(side);
    caseApi.restockAll = () => {
      for (const e of this.queries.items.entities) e.setValue(CaseItem, 'remaining', NETA[caseApi.neta(e)].stock);
    };
    for (let side = 0; side < 2; side++) {
      const tag = makeTextSprite(' ', { width: TAG_WIDTH });
      tag.name = `CaseTag${side}`;
      tag.visible = false;
      this.world.createTransformEntity(tag);
      this.tags.push(tag);
    }
    this.zoom = this.world.createTransformEntity().object3D!;
    this.zoom.name = 'CaseZoom';
    this.zoom.visible = false;
    for (let i = 0; i < ZOOM_LABELS; i++) {
      const label = makeTextSprite(' ', { width: 0.13 });
      label.visible = false;
      this.zoom.add(label);
      this.zoomLabels.push(label);
    }
  }

  update(delta: number): void {
    this.time += delta;
    if (!this.findDoors()) return;
    this.refreshStock();
    this.player.head.getWorldPosition(this.headAt);
    for (let side = 0; side < 2; side++) {
      this.readHand(side, delta);
      const head = (this.historyHead[side] + 1) % HISTORY;
      this.historyHead[side] = head;
      this.historyTime[side][head] = this.time;
      this.historyItem[side][head] = caseApi.hovered[side];
    }
    for (let side = 0; side < 2; side++) this.grant(side);

    const k = Math.min(1, delta * DOOR_SPEED);
    let mostOpen = 0;
    for (let i = 0; i < N; i++) {
      const target = i === this.granted[0] || i === this.granted[1] ? 1 : 0;
      // A door picks its slide direction only while shut, so it never jumps.
      if (caseDoors.open[i] < 0.01) caseDoors.dir[i] = this.nextDir[i];
      caseDoors.open[i] += (target - caseDoors.open[i]) * k;
      if (Math.abs(target - caseDoors.open[i]) < 0.002) caseDoors.open[i] = target;
      this.doors[i].position.x = this.closedX[i] + caseDoors.dir[i] * NETA_DOOR_PITCH * caseDoors.open[i];
      mostOpen = Math.max(mostOpen, caseDoors.open[i]);
    }
    if (this.led) this.led.emissiveIntensity = LED_REST + (LED_OPEN - LED_REST) * mostOpen;
    for (let side = 0; side < 2; side++) this.updateChoice(side);
    this.updateZoom();
    this.updateTicket(mostOpen);
  }

  /** The item this hand hovered PINCH_LATCH ago (if it hovered one then), else what it hovers now. */
  private chosen(side: number): Entity | null {
    // Only a hand that is at the case takes from it (a pinch elsewhere is something else).
    if (!this.reaching[side]) return null;
    const times = this.historyTime[side];
    const items = this.historyItem[side];
    for (let k = 0; k < HISTORY; k++) {
      const i = (this.historyHead[side] - k + HISTORY) % HISTORY;
      if (this.time - times[i] >= PINCH_LATCH) return items[i] ?? caseApi.hovered[side];
    }
    return caseApi.hovered[side];
  }

  /** Shows each item's stock (saku length, pieces on the tray) and publishes it. */
  private refreshStock(): void {
    for (const entity of this.queries.items.entities) {
      const object = entity.object3D;
      if (!object) continue;
      const neta = caseApi.neta(entity);
      const left = entity.getValue(CaseItem, 'remaining') ?? 0;
      caseStock[neta] = left;
      let v = this.visuals.get(entity);
      if (!v) {
        const body = object.getObjectByName('Body') ?? null;
        const inst = body && (body as InstancedMesh).isInstancedMesh ? (body as InstancedMesh) : null;
        v = { body, inst, perUnit: (inst?.userData.perUnit as number | undefined) ?? 1, container: !!object.getObjectByName('Container'), last: -1 };
        this.visuals.set(entity, v);
      }
      if (v.last === left) continue;
      v.last = left;
      const def = NETA[neta];
      if (v.inst) {
        v.inst.count = Math.min(v.inst.instanceMatrix.count, left * v.perUnit);
        object.visible = left > 0 || v.container;
      } else if (v.body) {
        // A saku shortens from its far (cut) end; the end at the origin stays put.
        v.body.scale.x = Math.max(0.06, left / def.stock);
        object.visible = left > 0;
      }
    }
  }

  /** Is this hand in front of the doors, what is it reaching for, which door does it ask for? */
  private readHand(side: number, delta: number): void {
    const hand = hands.all[side];
    const holding = chef.hands[side].holding;
    let reaching = false;
    let slot = -1;
    let hovered: Entity | null = null;
    // A hand held out pointing (at the noren, the customer, the phone) passes over the case: it is not reaching in.
    if (hand?.tracked && !chef.facingBack && canOpenWith(holding) && !heldOut(hand, this.headAt)) {
      this.local.copy(hand.grasp);
      caseDoors.object!.worldToLocal(this.local);
      const doorZ = this.doors[0].position.z;
      reaching =
        this.local.x > GLASS_LEFT && this.local.x < GLASS_RIGHT &&
        this.local.y > REACH_BOTTOM && this.local.y < REACH_TOP &&
        this.local.z > doorZ - REACH_INSIDE && this.local.z < doorZ + REACH_FRONT;
      if (reaching) {
        slot = caseDoors.slotOf(this.local.x);
        if (holding === Held.None) {
          hovered = this.nearestItem(side, this.local.x);
          if (hovered) slot = caseDoors.slotOf(this.itemLocal.x);
        }
      }
    }
    this.reaching[side] = reaching;
    caseApi.hovered[side] = hovered;
    // Taking something (empty -> holding) or putting a saku back (holding ->
    // empty) in front of the case closes the door until the hand goes away.
    if (reaching && holding !== this.lastHolding[side]) this.armed[side] = false;
    this.lastHolding[side] = holding;
    if (reaching) {
      this.away[side] = 0;
      this.request[side] = this.armed[side] ? slot : -1;
    } else {
      this.away[side] += delta;
      if (this.away[side] >= CLOSE_DELAY) {
        this.request[side] = -1;
        this.armed[side] = true;
      }
    }
  }

  /**
   * The in-stock item at home in the case nearest along the case to a
   * case-local x (with a little hysteresis); leaves its case-local position
   * in itemLocal.
   */
  private nearestItem(side: number, x: number): Entity | null {
    const current = caseApi.hovered[side];
    let best: Entity | null = null;
    let bestD = 0.05;
    let currentD = Infinity;
    for (const entity of this.queries.items.entities) {
      const object = entity.object3D;
      if (!object) continue;
      const def = NETA[caseApi.neta(entity)];
      if (!itemLive(def.prep)) continue;
      // While the fish shop takes the order, a sold-out item can be pointed out too.
      if (!fishOrder.ordering && (!object.visible || (entity.getValue(CaseItem, 'remaining') ?? 0) < def.perPiece)) continue;
      object.getWorldPosition(this.itemPos);
      caseDoors.object!.worldToLocal(this.itemPos);
      // Only items at home (a saku on the board is not in the case).
      if (Math.abs(this.itemPos.z) > NETA_CASE_DEPTH / 2 + 0.02 || this.itemPos.y > 0.12) continue;
      const d = Math.abs(this.itemPos.x - x);
      if (entity === current) currentD = d;
      if (d < bestD) {
        bestD = d;
        best = entity;
      }
    }
    if (current && currentD < Infinity && currentD <= bestD + HOVER_HYSTERESIS) best = current;
    if (best) {
      best.object3D!.getWorldPosition(this.itemLocal);
      caseDoors.object!.worldToLocal(this.itemLocal);
    }
    return best;
  }

  /** Give a hand its door unless that would cover the other hand's door. */
  private grant(side: number): void {
    const want = this.request[side];
    if (want === this.granted[side]) return;
    const other = this.granted[1 - side];
    if (want < 0 || other < 0 || want === other) {
      if (want >= 0 && other < 0) this.nextDir[want] = want === 0 ? 1 : -1;
      this.granted[side] = want;
      return;
    }
    // Slide away from the other hand's door; at an end of the case there is
    // only one way, and if that covers the other door this hand waits.
    let dir = want < other ? -1 : 1;
    if (want + dir < 0 || want + dir >= N) dir = -dir;
    const otherCovers = caseDoors.open[other] > 0.01 && other + caseDoors.dir[other] === want;
    if (want + dir === other || otherCovers) {
      this.granted[side] = -1;
      return;
    }
    this.nextDir[want] = dir;
    this.granted[side] = want;
  }

  /** Glow and name for what this hand is about to take; whether it may. */
  private updateChoice(side: number): void {
    const item = caseApi.hovered[side];
    const ordering = fishOrder.ordering;
    let mine = false;
    if (item) {
      const def = NETA[caseApi.neta(item)];
      // Ordering, either hand points out anything.
      mine = ordering || (def.hand === 'neta' ? side === chef.netaSide : side === chef.riceSide);
      item.object3D!.getWorldPosition(this.itemPos);
    }
    caseApi.wrongHand[side] = !!item && !mine;
    caseApi.ready[side] = !!item && mine && !ordering && caseDoors.isOpenAt(this.itemPos);
    const tag = this.tags[side];
    const version = ordering ? fishOrder.version : -1;
    if (item !== this.glowed[side] || version !== this.tagVersion[side]) {
      const old = this.glowed[side];
      if (old?.object3D && old !== this.glowed[1 - side]) glowObject(old.object3D, null);
      if (item?.object3D) {
        glowObject(item.object3D, mine ? COLOR_READY : COLOR_WARN);
        const neta = caseApi.neta(item);
        const text = ordering ? caseLabel(neta, caseApi.stock(item), true) : NETA[neta].name;
        setSpriteText(tag, text, { color: mine ? '#ffffff' : '#F2B134' });
        // Ordering, the tag carries the stock and the order: wider.
        const w = ordering ? TAG_WIDTH_ORDERING : TAG_WIDTH;
        tag.scale.set(w, w / 4, 1);
      }
      this.glowed[side] = item;
      this.tagVersion[side] = version;
    }
    tag.visible = !!item;
    if (item) {
      tag.position.copy(this.itemPos);
      tag.position.y += 0.075 + side * 0.03;
    }
  }

  /** The zoom over the open door, rebuilt when the door changes; the hovered item glows in it too. */
  private updateZoom(): void {
    let door = -1;
    for (let i = 0; i < 2 && door < 0; i++) {
      const side = i === 0 ? chef.netaSide : chef.riceSide;
      const g = this.granted[side];
      if (g >= 0 && this.reaching[side] && caseDoors.open[g] > 0.5) door = g;
    }
    const version = fishOrder.ordering ? fishOrder.version : -1;
    if (door !== this.zoomDoor || version !== this.zoomVersion) {
      this.buildZoom(door);
      this.zoomDoor = door;
      this.zoomVersion = version;
      this.zoomHover = null;
    }
    this.zoom.visible = door >= 0;
    if (door < 0) return;
    const hovered = caseApi.hovered[chef.netaSide] ?? caseApi.hovered[chef.riceSide];
    if (hovered !== this.zoomHover) {
      const old = this.zoomHover ? this.zoomClones.get(this.zoomHover) : undefined;
      if (old) {
        glowObject(old, null);
        old.position.y = 0;
      }
      const clone = hovered ? this.zoomClones.get(hovered) : undefined;
      if (clone?.parent === this.zoom && hovered) {
        clone.position.y = ZOOM_LIFT;
        const mine = NETA[caseApi.neta(hovered)].hand === 'neta' ? !!caseApi.hovered[chef.netaSide] : !!caseApi.hovered[chef.riceSide];
        glowObject(clone, mine ? COLOR_READY : COLOR_WARN);
      }
      this.zoomHover = hovered;
    }
  }

  private buildZoom(door: number): void {
    for (const clone of this.zoomClones.values()) if (clone.parent === this.zoom) this.zoom.remove(clone);
    for (const label of this.zoomLabels) label.visible = false;
    if (door < 0) return;
    const caseObject = caseDoors.object!;
    const slotLeft = GLASS_LEFT + door * NETA_DOOR_PITCH;
    const centre = slotLeft + NETA_DOOR_PITCH / 2;
    const frontZ = NETA_CASE_DEPTH / 2 - 0.025;
    this.zoom.position.set(centre, ZOOM_Y, frontZ);
    caseObject.localToWorld(this.zoom.position);
    caseObject.getWorldQuaternion(this.zoom.quaternion);
    this.zoom.rotateX(ZOOM_TILT);
    let n = 0;
    const ordering = fishOrder.ordering;
    for (const entity of this.queries.items.entities) {
      const object = entity.object3D;
      if (!object || (!object.visible && !ordering)) continue;
      object.getWorldPosition(this.itemPos);
      caseObject.worldToLocal(this.itemPos);
      if (this.itemPos.x < slotLeft || this.itemPos.x >= slotLeft + NETA_DOOR_PITCH) continue;
      if (Math.abs(this.itemPos.z) > NETA_CASE_DEPTH / 2 + 0.02 || this.itemPos.y > 0.12) continue;
      if (!object.visible) {
        // Sold out, while the order is taken: only its label, where it would lie.
        if (n < ZOOM_LABELS) {
          const label = this.zoomLabels[n];
          setSpriteText(label, caseLabel(caseApi.neta(entity), 0, false));
          label.position.set((this.itemPos.x - centre) * ZOOM_SCALE, 0.012, 0.035 + (n % 2) * 0.04);
          label.visible = true;
        }
        n++;
        continue;
      }
      let clone = this.zoomClones.get(entity);
      if (!clone) {
        clone = object.clone(true);
        clone.name = `Zoom_${caseApi.neta(entity)}`;
        this.zoomClones.set(entity, clone);
      }
      // Same stock as the real item.
      const body = object.getObjectByName('Body');
      const cloneBody = clone.getObjectByName('Body');
      if (body && cloneBody) {
        cloneBody.scale.copy(body.scale);
        if ((body as InstancedMesh).isInstancedMesh) (cloneBody as InstancedMesh).count = (body as InstancedMesh).count;
      }
      clone.position.set((this.itemPos.x - centre) * ZOOM_SCALE, 0, (this.itemPos.z - frontZ) * ZOOM_SCALE);
      clone.quaternion.copy(object.quaternion);
      clone.scale.setScalar(ZOOM_SCALE);
      clone.visible = true;
      this.zoom.add(clone);
      if (n < ZOOM_LABELS) {
        const label = this.zoomLabels[n];
        const neta = caseApi.neta(entity);
        setSpriteText(label, ordering ? caseLabel(neta, caseApi.stock(entity), false) : NETA[neta].name);
        label.position.set(clone.position.x, 0.012, 0.035 + (n % 2) * 0.04);
        label.visible = true;
      }
      n++;
    }
  }

  /** The order ticket, on the housing at the left end while a door is open. */
  private updateTicket(mostOpen: number): void {
    const order = service.order;
    const item = order?.item ?? '';
    const wasabi = !!order?.wasabi;
    if (item !== this.ticketItem || wasabi !== this.ticketWasabi) {
      this.ticketItem = item;
      this.ticketWasabi = wasabi;
      if (order && this.ticket) redrawOrderCard(this.ticket, order.item, order.wasabi);
      else if (order) {
        this.ticket = makeOrderCard(order.item, order.wasabi, 0.15);
        caseDoors.object!.add(this.ticket);
      }
    }
    if (this.ticket) {
      this.ticket.visible = !!order && mostOpen > 0.3;
      this.ticket.position.set(TICKET_X, TICKET_Y, NETA_CASE_DEPTH / 2 + 0.01);
    }
  }

  private findDoors(): boolean {
    if (this.doors.length === N) return true;
    const info = stations.get(StationKind.NetaCase);
    const object = info?.entity.object3D;
    if (!object) return false;
    const found: Object3D[] = [];
    for (let i = 0; i < N; i++) {
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
