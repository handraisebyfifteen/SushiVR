import type { NetaId } from './menu.js';

/**
 * The morning prep (仕込み), before every service: what is prepared, from
 * what, and which case items it fills. Values only (no imports but types).
 *
 * Saku-taking (柵取り) happens on the itaba manaita: each material comes out
 * of the ice box, lies on the board with its length toward the chef and is
 * cut along guide lines, each one drawn toward the chef. Every saku it gives
 * goes into the case, where its saku fill that item. Simmering (煮る,
 * 炊く, 煮切る) and searing on the gas range came with stage 3. Stage 4
 * brings the mid-sized fish whole (the user's shop): washed at the back sink
 * (水洗い: scales, head, guts) on a wash board, then filleted on the manaita,
 * the striped jack in three pieces (三枚おろし) and the flounder in five
 * (五枚おろし, its engawa served too). Big fish are bought as only what the
 * case takes: the hamachi comes as a half (its form will follow the season
 * later: big in winter, semi-big in summer). Stage 2 turned the score into
 * money.
 */
export type PrepKind = 'block' | 'squid' | 'fillet3' | 'fillet5' | 'half' | 'simmer' | 'kohada';

export interface PrepTask {
  name: string;
  /** The build stage that brings it in (PREP_STAGE in src/tuning.ts). */
  stage: 1 | 2 | 3 | 4;
  kind: PrepKind;
  /** The case items it fills, in the order its saku lie on the board, left to right. */
  makes: readonly NetaId[];
  /** Delivered in the long fish box on the sink's drainboard (stage 4), not the ice box by the board. */
  fishBox?: boolean;
  /** Not bought on its own: part of another material's work (the bonito belly comes with the half). */
  from?: string;
  /** Prepped only on the full difficulty (on easy its case item is readied by the cook). */
  hard?: boolean;
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
  BonitoBelly: { name: 'Bonito belly', stage: 3, kind: 'simmer', makes: ['BonitoBelly'], from: 'BonitoHalf' },
  // Stage 3: the gas range (prepared already; from putting it in the pot).
  /** 炊く on a high flame. */
  Octopus: { name: 'Octopus', stage: 3, kind: 'simmer', makes: ['Octopus'] },
  /** 煮る, held at 90 degrees so it does not fall apart. */
  SeaEel: { name: 'Conger eel', stage: 3, kind: 'simmer', makes: ['SeaEel'] },
  /** 煮切る: until the liquid is gone. */
  Kanpyo: { name: 'Gourd strips', stage: 3, kind: 'simmer', makes: ['Kanpyo'] },
  Abalone: { name: 'Abalone', stage: 3, kind: 'simmer', makes: ['Abalone'] },
  // Stage 4: the fish box at the sink (filleted in the shop).
  /** A whole flounder: washed at the sink, then five pieces on the board (four saku and the engawa). */
  Flounder: { name: 'Flounder', stage: 4, kind: 'fillet5', makes: ['Flounder', 'Engawa'], fishBox: true },
  /** A whole striped jack: washed at the sink, then three pieces on the board (two fillets, four saku). */
  StripedJack: { name: 'Striped jack', stage: 4, kind: 'fillet3', makes: ['StripedJack'], fishBox: true },
  /** A hamachi half (半身): no washing; belly bones, pin bones, skin, then back and belly saku. */
  Yellowtail: { name: 'Hamachi half', stage: 4, kind: 'half', makes: ['Yellowtail'], fishBox: true },
  // The full difficulty's own (the owner's shop): cured on the day, on the drainboard beside the sink.
  /** Eight whole kohada: washed, each opened from the belly and its backbone out (丸づけ, one a piece), salted then vinegared. */
  Kohada: { name: 'Kohada', stage: 4, kind: 'kohada', makes: ['Kohada'], fishBox: true, hard: true },
  /** A whole saba: washed, three pieces, belly and pin bones; the fillets salted 2-3 hours, then vinegared (skin on: it is peeled when served). */
  Saba: { name: 'Saba', stage: 4, kind: 'fillet3', makes: ['CuredMackerel'], fishBox: true, hard: true },
  /** 厚焼き with surimi, baked in the shop (the owner): the mixed batter poured into the square pan, a low flame, turned once. */
  Tamago: { name: 'Tamago batter', stage: 3, kind: 'simmer', makes: ['Tamago'], hard: true },
} as const satisfies Record<string, PrepTask>;

export type PrepId = keyof typeof PREP;

/** What the fish shop's ice box holds: the saku-taking fish, and over them the range's prepared ingredients (they come out first). */
export const ICE_BOX_ORDER: readonly PrepId[] = ['TunaBelly', 'BonitoHalf', 'Squid', 'Octopus', 'SeaEel', 'Abalone', 'Kanpyo', 'Tamago'];
/** The long fish box at the sink's foot, bottom first: the flounder flat on the ice, the jack and the hamachi half over it, then the saba and the row of kohada (full). */
export const FISH_BOX_ORDER: readonly PrepId[] = ['Flounder', 'StripedJack', 'Yellowtail', 'Saba', 'Kohada'];

/** The tasks of the stages built so far (with the full difficulty's own, or without). */
export function prepTasks(stage: number, full = true): PrepId[] {
  return (Object.keys(PREP) as PrepId[]).filter((id) => {
    const task: PrepTask = PREP[id];
    return task.stage <= stage && (full || !task.hard);
  });
}
