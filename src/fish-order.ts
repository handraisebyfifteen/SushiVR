import { Vector3 } from '@iwsdk/core';
import { NETA, type NetaId } from './menu.js';
import { FISH_BOX_ORDER, ICE_BOX_ORDER, PREP, type PrepId, type PrepTask } from './prep.js';
import { FISH_SHOP_PRICE, GREENGROCER, KEEP_DAYS, KEPT_OVERNIGHT, KOHADA_SALT_MINUTES, KOHADA_SIZE_MINUTES, PREP_STAGE, READY_PRICE, START_DIFFICULTY } from './tuning.js';

/**
 * The difficulty, the fish shop's order and the case from day to day.
 *
 * Easy: the phone call is "the usual" (お任せ): every prep material comes,
 * and the cook fills the case items the chef does not prep (wages). Each day
 * starts afresh.
 *
 * Full (本格, the owner's real way): the case keeps what is left, day to
 * day (saved in the browser when the day closes). In the morning the chef
 * checks it, then calls the fish shop and orders by item and amount: while
 * the shop is on the line, a pinch on a case item cycles its order (a prep
 * material for the items it makes, or the item itself, ready to serve), and
 * a point at the phone again ends the call. Only what was ordered comes, and
 * all of it is billed. Only tuna and cooked things keep overnight (opened uni
 * two days); the rest of yesterday's is out in the morning. The greengrocer
 * tops up the garnishes and pickles with the delivery, billed apart.
 */

export type Difficulty = 'easy' | 'full';
/** What the fish shop sells: a prep material, or a case item ready as it comes. */
export type OrderId = PrepId | NetaId;

export interface OrderSize {
  /** As said on the phone and on the slip: "Tuna belly 1/8", "Sea urchin x8". */
  name: string;
  /** Of a full case's worth (a prep material's whole yield). */
  frac: number;
}

/** A batch of a case item that came on one day (the full difficulty keeps them). */
export interface Lot {
  day: number;
  count: number;
}

/** The prep's materials so far, as the boxes are packed (the full difficulty's own among them). */
export const MATERIALS: readonly PrepId[] = [...ICE_BOX_ORDER, ...FISH_BOX_ORDER].filter((id) => PREP[id].stage <= PREP_STAGE);

/** A prep task that is done today's way: built, and on easy not one of the full difficulty's own. */
function taskLive(id: PrepId): boolean {
  const task: PrepTask = PREP[id];
  return task.stage <= PREP_STAGE && (!task.hard || fishOrder.difficulty === 'full');
}

const DIFFICULTY_KEY = 'sushi-vr.difficulty';
const SHOP_KEY = 'sushi-vr.shop';

/** What a case item is bought as: the material its prep makes it from, or itself. */
export function orderOf(neta: NetaId): OrderId {
  for (const id of Object.keys(PREP) as PrepId[]) {
    const task: PrepTask = PREP[id];
    if (!taskLive(id) || !(task.makes as readonly NetaId[]).includes(neta)) continue;
    return (task.from as PrepId | undefined) ?? id;
  }
  return neta;
}

/** Days a case item keeps: the day it came counts as one. */
export function keepDays(neta: NetaId): number {
  return KEEP_DAYS[neta] ?? (KEPT_OVERNIGHT.includes(neta) ? Infinity : 1);
}

/** The greengrocer's, not the fish shop's (not ordered on the phone). */
export function fromGreengrocer(neta: NetaId): boolean {
  return GREENGROCER.includes(neta);
}

export function isMaterial(id: OrderId): id is PrepId {
  return (MATERIALS as readonly string[]).includes(id) && taskLive(id as PrepId);
}

/** The amounts each thing comes in, smallest first (a pinch steps through them, then back to none). */
const SIZES = new Map<OrderId, OrderSize[]>();
for (const id of MATERIALS) {
  if (id === 'TunaBelly') {
    // The tuna dealer's belly cuts: a sixteenth or an eighth of the fish.
    SIZES.set(id, [{ name: 'Tuna belly 1/16', frac: 0.5 }, { name: 'Tuna belly 1/8', frac: 1 }]);
  } else if (id === 'Kohada') {
    SIZES.set(id, [{ name: 'Kohada x8 (whole)', frac: 1 }]);
  } else if (id === 'Yellowtail') {
    // A big fish is bought as only what the case takes: a quarter or a half.
    SIZES.set(id, [{ name: 'Hamachi quarter', frac: 0.5 }, { name: 'Hamachi half', frac: 1 }]);
  } else {
    SIZES.set(id, [{ name: PREP[id].name, frac: 1 }]);
  }
}
for (const neta of Object.keys(NETA) as NetaId[]) {
  // Ready items only: none a prep task makes (on either difficulty; the module is still loading, so no orderOf here).
  if ((Object.keys(PREP) as PrepId[]).some((id) => PREP[id].stage <= PREP_STAGE && (PREP[id].makes as readonly NetaId[]).includes(neta))) continue;
  const full = NETA[neta].stock;
  const half = Math.max(1, Math.round(full / 2));
  SIZES.set(neta, [{ name: `${NETA[neta].name} x${half}`, frac: half / full }, { name: `${NETA[neta].name} x${full}`, frac: 1 }]);
}

export function sizesOf(id: OrderId): readonly OrderSize[] {
  return SIZES.get(id) ?? [];
}

/** The fish shop's price for that much of it (to the nearest ¥100). */
export function priceOf(id: OrderId, size: OrderSize): number {
  const full = isMaterial(id) ? (FISH_SHOP_PRICE[id] ?? 0) : (READY_PRICE[id as NetaId] ?? 0);
  return Math.round((full * size.frac) / 100) * 100;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse: the game still runs, it only forgets.
  }
}

export const fishOrder = {
  difficulty: (read(DIFFICULTY_KEY) === 'full' || read(DIFFICULTY_KEY) === 'easy' ? read(DIFFICULTY_KEY) : START_DIFFICULTY) as Difficulty,
  /** The full difficulty's day (1 for a new shop). */
  day: 1,
  /** The fish shop is on the line, taking the order (full). */
  ordering: false,
  /** The order: each thing and its amount (an index into its sizes). */
  lines: new Map<OrderId, number>(),
  /** Bumped on every change to the order (the case's labels redraw). */
  version: 0,
  /** What the case held this morning, batch by batch, oldest first (full). */
  lots: new Map<NetaId, Lot[]>(),
  /** Thrown out this morning: past its days (full). */
  spoiled: [] as Array<{ neta: NetaId; count: number; day: number }>,
  /** Units put into each case item today (the prep, deliveries). */
  added: new Map<NetaId, number>(),
  /** The day's kohada: -1 small, 0 middling, +1 large (their salt time follows). */
  kohadaSize: 0,
  /** The difficulty sign in the office corner, pointed at to change it; a hand points at it. */
  signAt: new Vector3(),
  signHover: false,
};

export function setDifficulty(d: Difficulty): void {
  fishOrder.difficulty = d;
  write(DIFFICULTY_KEY, d);
}

/** Steps this thing's order to its next amount, or back to none; returns the new amount (null: none). */
export function cycleOrder(id: OrderId): OrderSize | null {
  const sizes = sizesOf(id);
  const at = fishOrder.lines.get(id);
  const next = at === undefined ? 0 : at + 1;
  fishOrder.version++;
  if (next >= sizes.length) {
    fishOrder.lines.delete(id);
    return null;
  }
  fishOrder.lines.set(id, next);
  return sizes[next];
}

export function orderedSize(id: OrderId): OrderSize | null {
  const at = fishOrder.lines.get(id);
  return at === undefined ? null : (sizesOf(id)[at] ?? null);
}

export function orderTotal(): number {
  let sum = 0;
  for (const [id, at] of fishOrder.lines) sum += priceOf(id, sizesOf(id)[at]);
  return sum;
}

/** Today's prep materials: all of them on easy, what was ordered on full. */
export function todaysMaterials(): PrepId[] {
  return MATERIALS.filter((id) => taskLive(id) && (fishOrder.difficulty === 'easy' || fishOrder.lines.has(id)));
}

/** A material's share of a full yield today (a 1/16 tuna belly gives half of a 1/8). */
export function fractionOf(id: PrepId): number {
  return fishOrder.difficulty === 'easy' ? 1 : (orderedSize(id)?.frac ?? 0);
}

/** Prep tasks today: each material, and the work that comes with one (the bonito belly's sear). */
export function todaysTaskCount(): number {
  const mats = todaysMaterials();
  let n = mats.length;
  for (const id of Object.keys(PREP) as PrepId[]) {
    const task: PrepTask = PREP[id];
    if (taskLive(id) && task.from && (mats as string[]).includes(task.from)) n++;
  }
  return n;
}

/** The day's kohada come small, middling or large (the fish shop says which). */
export function pickKohadaSize(): void {
  fishOrder.kohadaSize = Math.floor(Math.random() * 3) - 1;
}

/** Their salt time: about 40 minutes, 5 more or less with their size (the owner). */
export function kohadaSaltMinutes(): number {
  return KOHADA_SALT_MINUTES + KOHADA_SIZE_MINUTES * fishOrder.kohadaSize;
}

/** Their look's scale. */
export function kohadaScale(): number {
  return 1 + 0.08 * fishOrder.kohadaSize;
}

export function noteAdded(neta: NetaId, n: number): void {
  if (n > 0) fishOrder.added.set(neta, (fishOrder.added.get(neta) ?? 0) + n);
}

interface SavedShop {
  day: number;
  lots: Partial<Record<NetaId, Lot[]>>;
}

function loadShop(): SavedShop | null {
  const raw = read(SHOP_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SavedShop;
    return typeof s.day === 'number' && s.lots ? s : null;
  } catch {
    return null;
  }
}

/** The full difficulty's morning: yesterday's case, less what is past its days. */
export function startDay(): void {
  const saved = loadShop();
  fishOrder.day = saved ? saved.day + 1 : 1;
  fishOrder.lots.clear();
  fishOrder.spoiled.length = 0;
  fishOrder.added.clear();
  if (!saved) return;
  for (const neta of Object.keys(NETA) as NetaId[]) {
    const keep = keepDays(neta);
    const kept: Lot[] = [];
    let room = NETA[neta].stock;
    for (const lot of saved.lots[neta] ?? []) {
      if (lot.count <= 0) continue;
      if (fishOrder.day - lot.day >= keep) {
        fishOrder.spoiled.push({ neta, count: lot.count, day: lot.day });
        continue;
      }
      const count = Math.min(lot.count, room);
      room -= count;
      if (count > 0) kept.push({ day: lot.day, count });
    }
    if (kept.length) fishOrder.lots.set(neta, kept);
  }
}

/** What the case holds this morning (full). */
export function morningStock(neta: NetaId): number {
  return (fishOrder.lots.get(neta) ?? []).reduce((sum, l) => sum + l.count, 0);
}

/**
 * The day is over (full): what is left in the case goes into tomorrow,
 * the oldest used up first.
 */
export function closeDay(left: (neta: NetaId) => number): void {
  const lots: Partial<Record<NetaId, Lot[]>> = {};
  for (const neta of Object.keys(NETA) as NetaId[]) {
    const list = (fishOrder.lots.get(neta) ?? []).map((l) => ({ ...l }));
    const added = fishOrder.added.get(neta) ?? 0;
    if (added > 0) list.push({ day: fishOrder.day, count: added });
    const remaining = left(neta);
    let used = list.reduce((sum, l) => sum + l.count, 0) - remaining;
    if (used < 0) list.push({ day: fishOrder.day, count: -used });
    for (const l of list) {
      const take = Math.min(l.count, Math.max(0, used));
      l.count -= take;
      used -= take;
    }
    const kept = list.filter((l) => l.count > 0);
    if (kept.length) lots[neta] = kept;
  }
  write(SHOP_KEY, JSON.stringify({ day: fishOrder.day, lots } satisfies SavedShop));
}

/** Starts the full difficulty's shop again from day 1 (an empty case). */
export function resetShop(): void {
  write(SHOP_KEY, null);
}

/**
 * A case item's label while the order is taken: its name and stock, and
 * (long form, over the hand) what of it is on order.
 */
export function caseLabel(neta: NetaId, left: number, long: boolean): string {
  const stock = `${NETA[neta].name} ${left}/${NETA[neta].stock}`;
  if (fromGreengrocer(neta)) return long ? `${stock}: the greengrocer's` : stock;
  const size = orderedSize(orderOf(neta));
  if (!size) return stock;
  return long ? `${stock}: ${size.name}` : `${stock} ✓`;
}
