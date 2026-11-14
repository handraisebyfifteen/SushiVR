/**
 * Pause and resume. While the headset shows something over the game (its
 * menu, a system dialog) or the game is not shown at all (the headset taken
 * off, the browser tab hidden), no game time passes: src/index.ts runs no
 * systems, so every timer, flame and waiting customer stands still, and the
 * frame after a gap never sees more than MAX_STEP of time at once.
 *
 * Hands come back a moment after the game does: until then a hand that is
 * not seen keeps what it held (src/hand-reader.ts).
 */
export const pause = {
  /** No game time is passing now. */
  on: false,
  /** performance.now() when the game last went on again (0: never paused). */
  resumedAt: 0,
};

/** The most game time one frame may carry (s): a long frame or a gap is cut to this. */
export const MAX_STEP = 0.1;
/** After going on again, a hand not yet seen keeps its hold this long (ms). */
export const RESUME_GRACE_MS = 3000;
