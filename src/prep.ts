import type { NetaId } from './menu.js';

/**
 * The morning prep (仕込み), before every service: what is prepared, from
 * what, and which case items it fills. Values only (no imports but types).
 *
 * Saku-taking (柵取り) happens on the itaba manaita: each material comes out
 * of the ice box, lies on the board with its length toward the chef and is
 * cut along guide lines, each one drawn toward the chef. Every saku it gives
 * goes into the case, where one saku fills that item. Simmering (煮る,
 * 炊く, 煮切る) and searing on the gas range (stage 3) and filleting whole
 * white fish (stage 4) come later; until a stage is built, its items start
 * the day full. Stage 2 turns the score into money.
 */
export type PrepKind = 'block' | 'squid' | 'fillet3' | 'fillet5' | 'simmer';

export interface PrepTask {
  name: string;
  /** The build stage that brings it in (PREP_STAGE in src/tuning.ts). */
  stage: 1 | 2 | 3 | 4;
  kind: PrepKind;
  /** The case items it fills, in the order its saku lie on the board, left to right. */
  makes: readonly NetaId[];
}

export const PREP = {
  // Stage 1: saku-taking on the manaita.
  /** A belly cut (1/8 or 1/16 of the fish) from the tuna dealer: fatty, medium fatty and lean. */
  TunaBelly: { name: 'Tuna belly', stage: 1, kind: 'block', makes: ['FattyTuna', 'MediumFattyTuna', 'LeanTuna'] },
  /**
   * A bonito half (半身), skin on: split along the blood line into the back
   * and the belly. The back is skinned (shaved, not pulled: it splits) and
   * loses its blood line; the belly loses the hard skin at the neck and its
   * blood line, then waits on ice to have its skin side seared (stage 3).
   */
  BonitoHalf: { name: 'Bonito half', stage: 1, kind: 'block', makes: ['Bonito'] },
  /** A whole squid, taken apart: legs and body both opened flat, the body skinned and patted dry. */
  Squid: { name: 'Squid', stage: 1, kind: 'squid', makes: ['Squid', 'Geso'] },
  /** The bonito belly, seared on the skin side, chilled on ice and drained (on the range). */
  BonitoBelly: { name: 'Bonito belly', stage: 3, kind: 'simmer', makes: ['BonitoBelly'] },
  // Stage 3: the gas range (prepared already; from putting it in the pot).
  /** 炊く on a high flame. */
  Octopus: { name: 'Octopus', stage: 3, kind: 'simmer', makes: ['Octopus'] },
  /** 煮る, held at 90 degrees so it does not fall apart. */
  SeaEel: { name: 'Conger eel', stage: 3, kind: 'simmer', makes: ['SeaEel'] },
  /** 煮切る: until the liquid is gone. */
  Kanpyo: { name: 'Gourd strips', stage: 3, kind: 'simmer', makes: ['Kanpyo'] },
  Abalone: { name: 'Abalone', stage: 3, kind: 'simmer', makes: ['Abalone'] },
  // Stage 4: whole white fish, filleted in the shop.
  Flounder: { name: 'Flounder', stage: 4, kind: 'fillet5', makes: ['Flounder'] },
  StripedJack: { name: 'Striped jack', stage: 4, kind: 'fillet3', makes: ['StripedJack'] },
  Yellowtail: { name: 'Young yellowtail', stage: 4, kind: 'fillet3', makes: ['Yellowtail'] },
} as const satisfies Record<string, PrepTask>;

export type PrepId = keyof typeof PREP;

/** The saku-taking materials, in the ice box from right (nearest the board) to left. */
export const ICE_BOX_ORDER: readonly PrepId[] = ['TunaBelly', 'BonitoHalf', 'Squid'];

/** The tasks of the stages built so far. */
export function prepTasks(stage: number): PrepId[] {
  return (Object.keys(PREP) as PrepId[]).filter((id) => PREP[id].stage <= stage);
}

/** True when this case item is filled by a prep task of the stages built so far. */
export function isPrepped(neta: NetaId, stage: number): boolean {
  return prepTasks(stage).some((id) => (PREP[id].makes as readonly NetaId[]).includes(neta));
}
