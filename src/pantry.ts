import { stage } from './stage.js';
import { fishOrder } from './fish-order.js';
import { chef, day, prep, shari } from './game-state.js';
import type { PieceKind } from './menu.js';
import {
  DELIVERY_SECONDS,
  GUNKAN_STRIPS_PER_SHEET,
  HOSOMAKI_SHARI_GRAMS,
  INARI_SHARI_GRAMS,
  NORI_PER_PACK,
  RICE_COOK_SECONDS,
  RICE_KG_PER_SHO,
  RICE_SACK_KG,
  RICE_STEAM_SECONDS,
  SHARI_GRAMS,
  SHARI_PER_SHO_GRAMS,
  START_NORI_SHEETS,
  START_RICE_SACKS,
} from './tuning.js';

/**
 * The shop's rice and nori, on the full mode only (the owner, 2026-11-11):
 * the raw rice in the sack, the nori in the tin and the shari in the ohitsu
 * go down as the work uses them, and the rice shop (米屋, its nori too)
 * brings more when it is called (src/phone-book-system.ts). No prices.
 *  - A cook is 1 or 1.5 sho (1 sho = 1.5 kg of raw rice). A day takes 1 to
 *    3 sho: 1 is a very slow day, 3 a very busy one. In the morning the chef
 *    cooks (src/shari-system.ts). During service more is cooked by the
 *    chef's choice: by himself at the work table, the morning's steps again
 *    (src/shari-system.ts), or by the cook, asked on the phone
 *    (src/pantry-system.ts). There is one cooker: one batch at a time.
 *  - A nigiri or a gunkan takes SHARI_GRAMS of shari, a hosomaki 90 g, an
 *    inari 30 g; a gunkan a strip of nori (a sixth of a sheet), a roll a
 *    half sheet.
 *  - The rice and the nori keep from day to day (saved at the day's close,
 *    in their own key, apart from the shop's case); the shari does not: the
 *    ohitsu starts each morning empty.
 * On the other modes nothing runs out.
 */
export const pantry = {
  /** Raw rice in the sack (sho). */
  riceSho: 0,
  /** Nori in the tin (sheets; a gunkan's strip is a sixth of one). */
  noriSheets: 0,
  /** Shari in the ohitsu (g). */
  tubGrams: 0,
  /** What the card will order when the rice shop is called: sacks of rice, packs of nori. */
  wantSacks: 1,
  wantPacks: 1,
  /** Ordered and on its way: seconds until it comes (0: nothing coming), and what comes. */
  comingIn: 0,
  comingSacks: 0,
  comingPacks: 0,
  /** The cook is cooking more rice (service): seconds left, and how much. */
  cookLeft: 0,
  cookSho: 0,
  /** Bumped on every change (for redrawing). */
  version: 0,
};

const KEY = 'sushi-vr.pantry';

/** A sack of rice in sho. */
export const SACK_SHO = RICE_SACK_KG / RICE_KG_PER_SHO;
/** The cook's job during service: the cooker, the steaming and the shari-kiri (seconds). */
export const COOK_JOB_SECONDS = RICE_COOK_SECONDS + RICE_STEAM_SECONDS + 25;

const SHARI_FOR: Record<PieceKind, number> = {
  nigiri: SHARI_GRAMS,
  gunkan: SHARI_GRAMS,
  maki: HOSOMAKI_SHARI_GRAMS,
  inari: INARI_SHARI_GRAMS,
};
const NORI_FOR = { gunkan: 1 / GUNKAN_STRIPS_PER_SHEET, maki: 0.5 } as const;

/** Whether the rice and nori run out now (the full mode). */
export function pantryOn(): boolean {
  // A prep stage has no stock to mind.
  return fishOrder.difficulty === 'full' && !stage.prep;
}

/** The morning: the sack and the tin as the last day left them (a new shop starts with its first stock); the ohitsu empty. */
export function loadPantry(): void {
  // Day 1 is a new shop (src/fish-order.ts): what an old one left is not carried in.
  const saved = fishOrder.day > 1 ? readSaved() : null;
  pantry.riceSho = typeof saved?.riceSho === 'number' ? saved.riceSho : START_RICE_SACKS * SACK_SHO;
  pantry.noriSheets = typeof saved?.noriSheets === 'number' ? saved.noriSheets : START_NORI_SHEETS;
  pantry.tubGrams = 0;
  pantry.comingIn = pantry.comingSacks = pantry.comingPacks = 0;
  pantry.cookLeft = pantry.cookSho = 0;
  pantry.version++;
}

function readSaved(): { riceSho?: unknown; noriSheets?: unknown } | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as { riceSho?: unknown; noriSheets?: unknown } | null;
  } catch {
    return null;
  }
}

/** The day is over: the rice and the nori keep for tomorrow (what is on its way comes with them). */
export function savePantry(): void {
  const riceSho = pantry.riceSho + (pantry.comingIn > 0 ? pantry.comingSacks * SACK_SHO : 0);
  const noriSheets = pantry.noriSheets + (pantry.comingIn > 0 ? pantry.comingPacks * NORI_PER_PACK : 0);
  try {
    localStorage.setItem(KEY, JSON.stringify({ riceSho, noriSheets }));
  } catch {
    // No storage (a private window): tomorrow starts with a new shop's stock.
  }
}

// ---- rice -----------------------------------------------------------------------

/** Measures out this much raw rice for a cook; false (nothing taken) if the sack has not got it. */
export function cookRice(sho: number): boolean {
  if (!pantryOn()) return true;
  if (pantry.riceSho < sho - 1e-6) return false;
  pantry.riceSho = Math.max(0, pantry.riceSho - sho);
  pantry.version++;
  return true;
}

/** The shari of a cook goes into the ohitsu. */
export function addShari(sho: number): void {
  if (!pantryOn()) return;
  pantry.tubGrams += sho * SHARI_PER_SHO_GRAMS;
  pantry.version++;
}

/** Nigiri the ohitsu still holds. */
export function shariPieces(): number {
  return Math.floor(pantry.tubGrams / SHARI_GRAMS + 1e-6);
}

/** A hand can take rice from the ohitsu (always, off the full mode). */
export function canTakeRice(): boolean {
  return !pantryOn() || pantry.tubGrams >= SHARI_GRAMS - 1e-6;
}

/** A piece's shari is used: from the ohitsu, by its kind. */
export function useShari(kind: PieceKind): void {
  if (!pantryOn()) return;
  pantry.tubGrams = Math.max(0, pantry.tubGrams - SHARI_FOR[kind]);
  pantry.version++;
}

// ---- nori -------------------------------------------------------------------------

export function canTakeNori(kind: keyof typeof NORI_FOR): boolean {
  return !pantryOn() || pantry.noriSheets >= NORI_FOR[kind] - 1e-6;
}

/** A gunkan's strip or a roll's half sheet is used. */
export function useNori(kind: keyof typeof NORI_FOR): void {
  if (!pantryOn()) return;
  pantry.noriSheets = Math.max(0, pantry.noriSheets - NORI_FOR[kind]);
  pantry.version++;
}

/** Whole sheets in the tin. */
export function noriSheetsLeft(): number {
  return Math.floor(pantry.noriSheets + 1e-6);
}

// ---- the rice shop ------------------------------------------------------------------

/** The rice shop can be called: the full mode, something on the card, and nothing already on its way. */
export function canOrderPantry(): boolean {
  return pantryOn() && pantry.comingIn <= 0 && pantry.wantSacks + pantry.wantPacks > 0;
}

/** The call: the card's order is on its way. Returns the shop's words. */
export function placePantryOrder(): string {
  pantry.comingSacks = pantry.wantSacks;
  pantry.comingPacks = pantry.wantPacks;
  pantry.comingIn = DELIVERY_SECONDS;
  pantry.version++;
  return `Rice shop: ${orderWords(pantry.comingSacks, pantry.comingPacks)}. Right away!`;
}

/** It comes: into the sack and the tin. */
export function deliverPantry(): void {
  pantry.riceSho += pantry.comingSacks * SACK_SHO;
  pantry.noriSheets += pantry.comingPacks * NORI_PER_PACK;
  pantry.comingIn = 0;
  pantry.version++;
}

/** "a sack of rice and 2 packs of nori" */
export function orderWords(sacks: number, packs: number): string {
  const rice = sacks ? `${sacks} sack${sacks > 1 ? 's' : ''} of rice` : '';
  const nori = packs ? `${packs * NORI_PER_PACK} sheets of nori` : '';
  return rice && nori ? `${rice} and ${nori}` : rice || nori;
}

/** The sack, as the card and the warnings say it. */
export function riceText(): string {
  return `${(Math.floor(pantry.riceSho * 10 + 1e-6) / 10).toFixed(1)} sho`;
}

// ---- the cook's rice (service) ----------------------------------------------------

/** The cook can be asked to cook this much now: the full mode, the cooker free (the cook not cooking, nor the chef), and the rice in the sack. */
export function canAskCookRice(sho: number): boolean {
  return pantryOn() && pantry.cookLeft <= 0 && shari.step === 'done' && pantry.riceSho >= sho - 1e-6;
}

/**
 * The chef may cook a batch himself in service (full): the bar open and the
 * cooker free, or his batch already on (until the ohitsu is back on its
 * stand). The work table is then in reach from the stool.
 */
export function chefRiceInService(): boolean {
  if (!pantryOn() || prep.active || !chef.open || day.closed) return false;
  return shari.step !== 'done' || pantry.cookLeft <= 0;
}
