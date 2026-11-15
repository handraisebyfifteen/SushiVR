import { MENU, type MenuId } from './menu.js';
import type { PrepId } from './prep.js';

/**
 * The nigiri stages (握りステージ; the owner's design memo, 2026-11-10): the
 * way in for a new player. A stage starts at the counter with the case full
 * and the shari in the ohitsu: wash the hands and the first customer is
 * already seated. The world's number is the number of customers (world 1:
 * one customer); each world has four stages, the menu growing from a
 * quarter of the neta to all of it. When the last customer has left, the
 * pieces' grades are averaged (Excellent 100, Good 75, Poor 40, Bad 0); 65
 * or more clears the stage and unlocks the next.
 *
 * The prep stages (仕込みステージ) teach the morning's work one thing at a
 * time: the stage's fish is already delivered, and the stage is over when
 * all of it is made and put away. The cuts' grades and the curing's time
 * grades are averaged the same way; a stage with nothing graded (the
 * octopus, the tamago, the shari) is cleared by finishing it.
 *
 * The third game is the shop (実務): the whole day, from the morning prep to
 * closing (easy or full, src/fish-order.ts). All are open from the start.
 *
 * Which game and which stage are saved in the browser and read once, as the
 * page loads: a change (the phone's settings) takes a restart, which the
 * phone does itself. Pure state: no World, no DOM beyond localStorage.
 */

export const WORLDS = 3;
export const STEPS = 4;
export const CLEAR_POINTS = 65;
const GRADE_POINTS = { Excellent: 100, Good: 75, Poor: 40, Bad: 0 } as const;

/**
 * The menu, in the order a new hand learns it: first the neta that are only
 * cut and pressed (or taken as they are); then the rest of the tuna, the
 * white fish and other plain neta; then the cured fish, the shellfish and
 * the gunkan; last everything else (the pair, tsume, the prawns to order,
 * the rolls).
 */
const BASIC: readonly MenuId[] = ['LeanTunaNigiri', 'SquidNigiri', 'TamagoNigiri', 'YellowtailNigiri', 'OctopusNigiri', 'ScallopNigiri'];
const PLAIN: readonly MenuId[] = ['MediumFattyTunaNigiri', 'FattyTunaNigiri', 'FlounderNigiri', 'StripedJackNigiri', 'SweetShrimpNigiri', 'HorseMackerelNigiri'];
const SKILLED: readonly MenuId[] = ['KohadaNigiri', 'CuredMackerelNigiri', 'EngawaNigiri', 'GesoNigiri', 'ArkShellNigiri', 'CockleNigiri', 'UniGunkan', 'IkuraGunkan', 'Inari'];
const MENUS: readonly (readonly MenuId[])[] = [
  BASIC,
  [...BASIC, ...PLAIN],
  [...BASIC, ...PLAIN, ...SKILLED],
  Object.keys(MENU) as MenuId[],
];
const MENU_WORDS = ['basic neta', 'more neta', 'cured fish, shellfish, gunkan', 'the whole menu'] as const;

/** The prep stages have two worlds of four. */
export const PREP_WORLDS = 2;

interface PrepStage {
  words: string;
  /** What the fish shop has brought (each in its largest amount). */
  materials: readonly PrepId[];
  /** The rice is cooked and made into shari in this stage. */
  rice: boolean;
}

/** The owner's order (2026-11-15): the white fish first, the cured fish third; the shari on its own; the last is all of it. */
const WHITE: readonly PrepId[] = ['StripedJack', 'Yellowtail', 'Flounder'];
const PREP_STAGES: Readonly<Record<string, PrepStage>> = {
  '1-1': { words: 'white fish', materials: WHITE, rice: false },
  '1-2': { words: 'tuna', materials: ['TunaBelly'], rice: false },
  '1-3': { words: 'kohada and saba, cured', materials: ['Kohada', 'Saba'], rice: false },
  '1-4': { words: 'tamago', materials: ['Tamago'], rice: false },
  '2-1': { words: 'aji and squid', materials: ['Aji', 'Squid'], rice: false },
  '2-2': { words: 'octopus', materials: ['Octopus'], rice: false },
  '2-3': { words: 'shari', materials: [], rice: true },
  '2-4': { words: 'the whole prep', materials: [...WHITE, 'TunaBelly', 'Kohada', 'Saba', 'Tamago', 'Aji', 'Squid', 'Octopus'], rice: true },
};

export type Game = 'stages' | 'prep' | 'shop';

interface Saved {
  game: Game;
  /** The nigiri stage to play next, as "world-step". */
  at: string;
  /** The prep stage to play next. */
  prepAt: string;
  /** Each cleared stage's best points (a prep stage's under "p" and its id). */
  cleared: Record<string, number>;
}

const KEY = 'sushi-vr.stage';

function load(): Saved {
  const fresh: Saved = { game: 'stages', at: '1-1', prepAt: '1-1', cleared: {} };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (!s) return fresh;
    return {
      game: s.game === 'shop' || s.game === 'prep' ? s.game : 'stages',
      at: typeof s.at === 'string' && parse(s.at, WORLDS) ? s.at : '1-1',
      prepAt: typeof s.prepAt === 'string' && parse(s.prepAt, PREP_WORLDS) ? s.prepAt : '1-1',
      cleared: s.cleared && typeof s.cleared === 'object' ? s.cleared : {},
    };
  } catch {
    return fresh;
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Private windows may refuse: the game still runs, it only forgets.
  }
}

function parse(id: string, worlds: number): { world: number; step: number } | null {
  const m = /^(\d)-(\d)$/.exec(id);
  if (!m) return null;
  const world = Number(m[1]);
  const step = Number(m[2]);
  return world >= 1 && world <= worlds && step >= 1 && step <= STEPS ? { world, step } : null;
}

const saved = load();
/** This page load's kind of stage (null: the shop). */
const kind: 'stages' | 'prep' | null = saved.game === 'shop' ? null : saved.game;
const worlds = kind === 'prep' ? PREP_WORLDS : WORLDS;
const now = parse(kind === 'prep' ? saved.prepAt : saved.at, worlds) ?? { world: 1, step: 1 };
/** A stage's key among the cleared ones. */
const key = (id: string, k = kind): string => (k === 'prep' ? `p${id}` : id);

/** This page load's game: fixed until the next restart. */
export const stage = {
  /** A nigiri stage is being played. */
  on: kind === 'stages',
  /** A prep stage is being played (neither: the shop's whole day). */
  prep: kind === 'prep',
  /** "Stage" or "Prep stage", as the board and the notice name it. */
  title: kind === 'prep' ? 'Prep stage' : 'Stage',
  world: now.world,
  step: now.step,
  id: `${now.world}-${now.step}`,
  /** Customers who have left so far. */
  customersDone: 0,
  /** The stage is over: its points, and whether they clear it. */
  over: false,
  points: 0,
  clear: false,
  /** Bumped on every change the board or the phone shows. */
  version: 0,
};

/** What this stage's customers may order. */
export function stageMenu(): readonly MenuId[] {
  return MENUS[stage.step - 1];
}

/** "1 customer, basic neta"; a prep stage: "white fish". */
export function stageWords(): string {
  if (stage.prep) return PREP_STAGES[stage.id].words;
  return `${stage.world} customer${stage.world > 1 ? 's' : ''}, ${MENU_WORDS[stage.step - 1]}`;
}

/** A prep stage's delivery (empty otherwise). */
export function stageMaterials(): readonly PrepId[] {
  return stage.prep ? PREP_STAGES[stage.id].materials : [];
}

/** The rice is part of this prep stage. */
export function stageRice(): boolean {
  return stage.prep && PREP_STAGES[stage.id].rice;
}

/** The pieces' grades, averaged (0 with none served). */
export function averagePoints(grades: Readonly<Record<keyof typeof GRADE_POINTS, number>>): number {
  let n = 0;
  let sum = 0;
  for (const g of Object.keys(GRADE_POINTS) as (keyof typeof GRADE_POINTS)[]) {
    n += grades[g];
    sum += grades[g] * GRADE_POINTS[g];
  }
  return n ? Math.round(sum / n) : 0;
}

/** A customer has left: true when that was the stage's last. */
export function customerLeft(): boolean {
  stage.customersDone++;
  return stage.customersDone >= stage.world;
}

function idAfter(id: string, max = worlds): string | null {
  const p = parse(id, max);
  if (!p) return null;
  if (p.step < STEPS) return `${p.world}-${p.step + 1}`;
  return p.world < max ? `${p.world + 1}-1` : null;
}

/** The stage after this one (null after the last). */
export function nextStageId(): string | null {
  return idAfter(stage.id);
}

/** The last customer has left: the points are final; a clear is kept and the next stage is the one to play. */
export function finishStage(points: number): void {
  if (stage.over) return;
  stage.over = true;
  stage.points = points;
  stage.clear = points >= CLEAR_POINTS;
  if (stage.clear) {
    saved.cleared[key(stage.id)] = Math.max(saved.cleared[key(stage.id)] ?? 0, points);
    if (stage.prep) saved.prepAt = nextStageId() ?? stage.id;
    else saved.at = nextStageId() ?? stage.id;
  }
  save();
  stage.version++;
}

/** Open to play: the first stage of its kind, and the one after each cleared stage. */
function unlocked(id: string, k: 'stages' | 'prep'): boolean {
  if (id === '1-1') return true;
  const max = k === 'prep' ? PREP_WORLDS : WORLDS;
  for (const done of Object.keys(saved.cleared)) {
    if ((k === 'prep') !== done.startsWith('p')) continue;
    const doneId = k === 'prep' ? done.slice(1) : done;
    if (doneId === id || idAfter(doneId, max) === id) return true;
  }
  return false;
}

/** The game the next restart starts. */
export function savedGame(): Game {
  return saved.game;
}

/** The stage the next restart starts (the saved game's kind; the nigiri one for the shop). */
export function savedStageId(): string {
  return saved.game === 'prep' ? saved.prepAt : saved.at;
}

export function setGame(game: Game): void {
  saved.game = game;
  save();
  stage.version++;
}

/** Steps the stage to play next through the unlocked ones, round again. */
export function cycleStage(): void {
  if (saved.game === 'shop') return;
  const k = saved.game;
  const max = k === 'prep' ? PREP_WORLDS : WORLDS;
  const open: string[] = [];
  for (let w = 1; w <= max; w++) for (let s = 1; s <= STEPS; s++) if (unlocked(`${w}-${s}`, k)) open.push(`${w}-${s}`);
  const next = open[(open.indexOf(savedStageId()) + 1) % open.length] ?? '1-1';
  if (k === 'prep') saved.prepAt = next;
  else saved.at = next;
  save();
  stage.version++;
}

/** Opens every stage (a test tool, src/practice-system.ts): each not yet cleared counts as cleared at the clear line. */
export function unlockAll(): void {
  for (let w = 1; w <= WORLDS; w++) for (let st = 1; st <= STEPS; st++) saved.cleared[`${w}-${st}`] ??= CLEAR_POINTS;
  for (let w = 1; w <= PREP_WORLDS; w++) for (let st = 1; st <= STEPS; st++) saved.cleared[`p${w}-${st}`] ??= CLEAR_POINTS;
  save();
  stage.version++;
}

/** A cleared stage's best points (of the saved game's kind), or null. */
export function bestPoints(id: string): number | null {
  return saved.cleared[key(id, saved.game === 'prep' ? 'prep' : 'stages')] ?? null;
}

/** Starts what is saved: the page loads again (in a headset, enter VR once more). */
export function restart(): void {
  location.reload();
}
