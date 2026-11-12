import { CASE_ORDER, NETA, type NetaId } from './menu.js';
import { FISH_BOX_ORDER, ICE_BOX_ORDER, PREP, type PrepId, type PrepTask } from './prep.js';
import { GREENGROCER, KEEP_DAYS, KEPT_OVERNIGHT, KOHADA_SALT_MINUTES, KOHADA_SIZE_MINUTES, PREP_STAGE, START_DIFFICULTY } from './tuning.js';

/**
 * The difficulty, the fish shop's order and the case from day to day.
 *
 * Easy: the phone call is "the usual" (お任せ): every prep material comes,
 * and the cook fills the case items the chef does not prep. Each day
 * starts afresh.
 *
 * Full (本格, the owner's real way): the case keeps what is left, day to
 * day (saved in the browser when the day closes). In the morning the chef
 * checks it, then calls the fish shop and orders by item and amount: while
 * the shop is on the line, a pinch on a case item cycles its order (a prep
 * material for the items it makes, or the item itself, ready to serve), and
 * a point at the phone again ends the call. Only what was ordered comes.
 * Only tuna and cooked things keep overnight (opened uni and ikura two
 * days); the rest of yesterday's is out in the morning. The garnishes and
 * pickles (ツマ) are the greengrocer's: a call of their own on the phone
 * book (the owner, 2026-11-10), ordered the same way and delivered apart.
 * There is no money in the game (the owner, 2026-11-12): no prices, no
 * bills, no funds; an order is limited only by the amounts each thing comes
 * in.
 *
 * The order is kept in plain functions (startOrder, setLine, cycleOrder,
 * orderNames) so that something other than the chef's pinches (an order
 * placed for the chef) can fill it too.
 */

export type Difficulty = 'easy' | 'full';
/** What is ordered: a prep material, or a case item ready as it comes. */
export type OrderId = PrepId | NetaId;
/** Who brings it: the fish shop, or the greengrocer (the garnishes and pickles). */
export type Supplier = 'fish' | 'greengrocer';
export const SUPPLIER_NAME: Record<Supplier, string> = { fish: 'Fish shop', greengrocer: 'Greengrocer' };

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

/** The greengrocer's, not the fish shop's (its own call on the phone). */
export function fromGreengrocer(neta: NetaId): boolean {
  return GREENGROCER.includes(neta);
}

/** Who brings this. */
export function supplierOf(id: OrderId): Supplier {
  return GREENGROCER.includes(id as NetaId) ? 'greengrocer' : 'fish';
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
  // Only what the case holds (the tekka's tuna is cut from the lean tuna in service, not bought).
  if (!CASE_ORDER.includes(neta)) continue;
  // Ready items only: none a prep task makes (on either difficulty; the module is still loading, so no orderOf here).
  if ((Object.keys(PREP) as PrepId[]).some((id) => PREP[id].stage <= PREP_STAGE && (PREP[id].makes as readonly NetaId[]).includes(neta))) continue;
  const full = NETA[neta].stock;
  // Scallops are bought by the pack (the owner: nine to a pack, one a piece), never a half.
  if (neta === 'Scallop') {
    SIZES.set(neta, [{ name: `${NETA[neta].name} pack x${full}`, frac: 1 }]);
    continue;
  }
  const half = Math.max(1, Math.round(full / 2));
  SIZES.set(neta, [{ name: `${NETA[neta].name} x${half}`, frac: half / full }, { name: `${NETA[neta].name} x${full}`, frac: 1 }]);
}

export function sizesOf(id: OrderId): readonly OrderSize[] {
  return SIZES.get(id) ?? [];
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
  /** A shop is on the line, taking the order (full): `calling` says which. */
  ordering: false,
  calling: 'fish' as Supplier,
  /** The order, both shops': each thing and its amount (an index into its sizes). */
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
  /** The greengrocer has been called today, and has delivered (full). */
  greensOrdered: false,
  greensDelivered: false,
};

export function setDifficulty(d: Difficulty): void {
  fishOrder.difficulty = d;
  write(DIFFICULTY_KEY, d);
}

/** Sets this thing's order to an amount (an index into its sizes), or to none (null). */
export function setLine(id: OrderId, at: number | null): void {
  if (at === null || at < 0 || at >= sizesOf(id).length) fishOrder.lines.delete(id);
  else fishOrder.lines.set(id, at);
  fishOrder.version++;
}

/** Steps this thing's order to its next amount, or back to none; returns the new amount (null: none). */
export function cycleOrder(id: OrderId): OrderSize | null {
  const sizes = sizesOf(id);
  const at = fishOrder.lines.get(id);
  const next = at === undefined ? 0 : at + 1;
  setLine(id, next < sizes.length ? next : null);
  return next < sizes.length ? sizes[next] : null;
}

export function orderedSize(id: OrderId): OrderSize | null {
  const at = fishOrder.lines.get(id);
  return at === undefined ? null : (sizesOf(id)[at] ?? null);
}

/** One shop's lines, as said on the phone and on the slip. */
export function orderNames(supplier: Supplier): string[] {
  const names: string[] = [];
  for (const [id, at] of fishOrder.lines) if (supplierOf(id) === supplier) names.push(sizesOf(id)[at].name);
  return names;
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

/** A shop saved while the game still had money also has a `funds` field: it is ignored. */
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

/** A shop's call begins (full): that shop is on the line, its part of the order empty. */
export function startOrder(supplier: Supplier): void {
  for (const id of [...fishOrder.lines.keys()]) if (supplierOf(id) === supplier) fishOrder.lines.delete(id);
  fishOrder.calling = supplier;
  fishOrder.version++;
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
  // The other shop's item: said so, while this one is on the line.
  const theirs = supplierOf(orderOf(neta));
  if (theirs !== fishOrder.calling) return long ? `${stock}: the ${theirs === 'fish' ? 'fish shop' : 'greengrocer'}'s` : stock;
  const size = orderedSize(orderOf(neta));
  if (!size) return stock;
  return long ? `${stock}: ${size.name}` : `${stock} ✓`;
}
