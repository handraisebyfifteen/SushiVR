import type { NetaId } from './menu.js';

/**
 * The morning prep (仕込み), before every service: what is prepared, from
 * what, and which case items it fills. Values only (no imports but types).
 *
 * Saku-taking (柵取り) happens on the itaba manaita: each material comes out
 * of the ice box, lies on the board with its length toward the chef and is
 * cut along guide lines, each one drawn toward the chef. Every saku it gives
 * goes into the case, where one saku fills that item. Simmering (煮る,
 * 炊く, 煮切る) on the gas range and filleting whole white fish come in
 * later stages; until a stage is built, its items start the day full.
 */
export type PrepKind = 'block' | 'squid' | 'fillet3' | 'fillet5' | 'simmer';

export interface PrepTask {
  name: string;
  /** The build stage that brings it in (PREP_STAGE in src/tuning.ts). */
  stage: 1 | 2 | 3;
  kind: PrepKind;
  /** The case items it fills, in the order its saku lie on the board, left to right. */
  makes: readonly NetaId[];
}

export const PREP = {
  // Stage 1: saku-taking on the manaita.
  /** A belly cut (1/8 or 1/16 of the fish) from the tuna dealer: fatty, medium fatty and lean. */
  TunaBelly: { name: 'Tuna belly', stage: 1, kind: 'block', makes: ['FattyTuna', 'MediumFattyTuna', 'LeanTuna'] },
  /** A bonito quarter (節), kept that way: the blood line comes off and the rest is the saku. */
  BonitoLoin: { name: 'Bonito loin', stage: 1, kind: 'block', makes: ['Bonito'] },
  /** A whole squid: legs pulled out of the body, the body cut open into a sheet. */
  Squid: { name: 'Squid', stage: 1, kind: 'squid', makes: ['Squid'] },
  // Stage 2: the gas range (prepared already; from putting it in the pot).
  /** 炊く on a high flame. */
  Octopus: { name: 'Octopus', stage: 2, kind: 'simmer', makes: ['Octopus'] },
  /** 煮る, held at 90 degrees so it does not fall apart. */
  SeaEel: { name: 'Conger eel', stage: 2, kind: 'simmer', makes: ['SeaEel'] },
  /** 煮切る: until the liquid is gone. */
  Kanpyo: { name: 'Gourd strips', stage: 2, kind: 'simmer', makes: ['Kanpyo'] },
  Abalone: { name: 'Abalone', stage: 2, kind: 'simmer', makes: ['Abalone'] },
  // Stage 3: whole white fish, filleted in the shop.
  Flounder: { name: 'Flounder', stage: 3, kind: 'fillet5', makes: ['Flounder'] },
  StripedJack: { name: 'Striped jack', stage: 3, kind: 'fillet3', makes: ['StripedJack'] },
  Yellowtail: { name: 'Young yellowtail', stage: 3, kind: 'fillet3', makes: ['Yellowtail'] },
} as const satisfies Record<string, PrepTask>;

export type PrepId = keyof typeof PREP;

/** The saku-taking materials, in the ice box from right (nearest the board) to left. */
export const ICE_BOX_ORDER: readonly PrepId[] = ['TunaBelly', 'BonitoLoin', 'Squid'];

/** The tasks of the stages built so far. */
export function prepTasks(stage: number): PrepId[] {
  return (Object.keys(PREP) as PrepId[]).filter((id) => PREP[id].stage <= stage);
}

/** True when this case item is filled by a prep task of the stages built so far. */
export function isPrepped(neta: NetaId, stage: number): boolean {
  return prepTasks(stage).some((id) => (PREP[id].makes as readonly NetaId[]).includes(neta));
}
