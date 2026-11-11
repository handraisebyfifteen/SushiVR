/**
 * What the shop shows the player (表示の設定), chosen on the display board
 * (src/display-board-system.ts) and kept in the browser. The owner,
 * 2026-11-10: a player who knows the tools by now can turn their names off,
 * or keep only the neta's.
 *
 *  - Neta names: the name over the case item a hand is at.
 *  - Neta zoom: the items behind an open door, twice life size, with names.
 *  - Front / back / office names: a name over each tool and vessel at the
 *    counter, in the back row, and around the phone and the food shelf;
 *    always, only on the one a hand is at (or points at), or never.
 *  - Master's steps: what comes next, his pointing and the see-through hands.
 *  - Master's words: his word on a mistake, and "Good." / "Again.".
 *  - Hint rings: the ring on the place a hand can use next.
 *  - Status: the figures on the work (a pot's heat, the rice, the tamago, the timers).
 */

export type NameLevel = 'always' | 'chosen' | 'off';

export interface DisplaySettings {
  netaNames: boolean;
  netaZoom: boolean;
  frontNames: NameLevel;
  backNames: NameLevel;
  officeNames: NameLevel;
  masterSteps: boolean;
  masterWords: boolean;
  hintRings: boolean;
  status: boolean;
}

export type DisplayKey = keyof DisplaySettings;

const DEFAULTS: DisplaySettings = {
  netaNames: true,
  netaZoom: true,
  frontNames: 'chosen',
  backNames: 'chosen',
  officeNames: 'chosen',
  masterSteps: true,
  masterWords: true,
  hintRings: true,
  status: true,
};

/** The board's rows, top to bottom (in-game text is English). */
export const DISPLAY_ROWS: ReadonlyArray<{ key: DisplayKey; label: string }> = [
  { key: 'netaNames', label: 'Neta names' },
  { key: 'netaZoom', label: 'Neta zoom' },
  { key: 'frontNames', label: 'Tool names: counter' },
  { key: 'backNames', label: 'Tool names: back row' },
  { key: 'officeNames', label: 'Names: phone, shelf' },
  { key: 'masterSteps', label: "Master's next step" },
  { key: 'masterWords', label: "Master's words" },
  { key: 'hintRings', label: 'Hint rings' },
  { key: 'status', label: 'Heat, timers, progress' },
];

const LEVELS: readonly NameLevel[] = ['always', 'chosen', 'off'];
const KEY = 'sushi-vr.display';

function load(): DisplaySettings {
  const out = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<DisplayKey, unknown>>;
    for (const k of Object.keys(DEFAULTS) as DisplayKey[]) {
      const v = saved[k];
      if (typeof DEFAULTS[k] === 'boolean' ? typeof v === 'boolean' : LEVELS.includes(v as NameLevel)) {
        (out as Record<DisplayKey, unknown>)[k] = v;
      }
    }
  } catch {
    /* nothing saved, or storage unavailable: the defaults */
  }
  return out;
}

/** The live settings; read them every frame (plain fields, no cost). */
export const display: DisplaySettings & { version: number } = { ...load(), version: 0 };

/** The next value of a row: on and off, or always, chosen, off. */
export function cycleDisplay(key: DisplayKey): void {
  const v = display[key];
  if (typeof v === 'boolean') (display as Record<DisplayKey, unknown>)[key] = !v;
  else (display as Record<DisplayKey, unknown>)[key] = LEVELS[(LEVELS.indexOf(v) + 1) % LEVELS.length];
  display.version++;
  try {
    const save: Partial<DisplaySettings> = {};
    for (const k of Object.keys(DEFAULTS) as DisplayKey[]) (save as Record<DisplayKey, unknown>)[k] = display[k];
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: the choice lasts this visit */
  }
}

/** A row's value as the board writes it. */
export function displayValueText(key: DisplayKey): string {
  const v = display[key];
  if (typeof v === 'boolean') return v ? 'ON' : 'OFF';
  return v === 'always' ? 'ALWAYS' : v === 'chosen' ? 'WHEN CHOSEN' : 'OFF';
}
