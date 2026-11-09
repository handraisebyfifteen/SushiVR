import type { MenuId } from './menu.js';
import { PRICE, WAGE_COOK, WAGE_PART_TIMER } from './tuning.js';

/**
 * The day's books (帳場): what the customers paid, and what went out to the
 * fish shop and in wages. Money is earned, never docked: a well-made piece
 * brings another order, a careless one fewer (src/customer-system.ts).
 * Events are rare (one per order or job), so the small arrays cost nothing
 * per frame.
 */

export type Worker = 'cook' | 'partTimer';

export interface CostLine {
  /** Shown in the day's summary, e.g. "Cook: saku-taking". */
  label: string;
  yen: number;
  /** Shop minutes worked, for wages. */
  minutes: number;
}

const WAGE: Record<Worker, number> = { cook: WAGE_COOK, partTimer: WAGE_PART_TIMER };
const WHO: Record<Worker, string> = { cook: 'Cook', partTimer: 'Part-timer' };

export const ledger = {
  /** Paid by the customers, and how many orders that was (a bonito pair is two pieces, two payments). */
  sales: 0,
  paid: 0,
  /** What went out: the fish shop, then wages, one line per kind of job. */
  costs: [] as CostLine[],
  /** The pieces served today by grade (Excellent, Good, Poor, Bad). */
  grades: {} as Record<string, number>,
  /** Bumped on each grade (the books redraw). */
  graded: 0,

  /** A customer pays for one piece (or roll) of `item`; returns the yen. */
  sale(item: MenuId): number {
    const yen = PRICE[item];
    this.sales += yen;
    this.paid++;
    return yen;
  },

  /** A piece served, and how well it was made. */
  grade(grade: string): void {
    this.grades[grade] = (this.grades[grade] ?? 0) + 1;
    this.graded++;
  },

  /** The fish shop's bill for one delivered material (one line for the whole delivery). */
  fishShop(yen: number): void {
    this.add('Fish shop', yen, 0);
  },

  /** Wages for a job done by someone else, by the hour. */
  wage(who: Worker, job: string, minutes: number): void {
    this.add(`${WHO[who]}: ${job}`, wageYen(who, minutes), minutes);
  },

  add(label: string, yen: number, minutes: number): void {
    const line = this.costs.find((c) => c.label === label);
    if (line) {
      line.yen += yen;
      line.minutes += minutes;
    } else {
      this.costs.push({ label, yen, minutes });
    }
  },

  costTotal(): number {
    return this.costs.reduce((sum, c) => sum + c.yen, 0);
  },

  profit(): number {
    return this.sales - this.costTotal();
  },
};

/** What a job of so many shop minutes costs in wages. */
export function wageYen(who: Worker, minutes: number): number {
  return Math.round((WAGE[who] * minutes) / 60);
}

/** ¥1,234 (or -¥1,234). */
export function yen(n: number): string {
  const s = `¥${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
  return n < 0 ? `-${s}` : s;
}
