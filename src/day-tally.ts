import type { Grade } from './coach.js';

/**
 * The day's results (the board by the phone, src/office-system.ts): how
 * many pieces were served today and how well each was made. There is no
 * money in the game: the check is the cashier's, off-screen. One event per
 * piece served, so this costs nothing per frame.
 */
export const dayTally = {
  /** The pieces served today (a bonito pair is two); bumped on each, so the board redraws. */
  served: 0,
  /** The pieces served today by grade. */
  grades: { Excellent: 0, Good: 0, Poor: 0, Bad: 0 } as Record<Grade, number>,

  /** A piece served, and how well it was made. */
  grade(grade: Grade): void {
    this.grades[grade]++;
    this.served++;
  },
};
