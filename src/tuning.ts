/**
 * Every gameplay number that may need adjusting on a real headset lives here.
 * Distances are meters, times are seconds unless the name says ms.
 */

import type { PieceKind } from './menu.js';

/** Swap the rice hand and the neta hand for a left-handed chef. */
export const CHEF_LEFT_HANDED = false;

// --- menu ---
/** Kinds of piece the customers order (inari and maki follow in later steps). */
export const ENABLED_KINDS: readonly PieceKind[] = ['nigiri', 'gunkan'];

// --- customers ---
export const LEFT_HANDED_CUSTOMER_RATIO = 0.3;
export const PIECES_PER_CUSTOMER = 3;
/** Seconds the result stays above the customer after a piece is eaten. */
export const RESULT_SECONDS = 4;

// --- hygiene ---
/** Pieces made before the hands need washing (dirt reaches 1). */
export const PIECES_PER_WASH = 5;
/** Board dirt added by one cut and by one nigiri (board needs a wipe at 1). */
export const BOARD_DIRT_PER_CUT = 0.35;
export const BOARD_DIRT_PER_NIGIRI = 0.35;
/** Rub distance (total palm travel) needed for each cleaning action. */
export const RUB_WASH_HANDS = 0.5;
export const RUB_WASH_CLOTH = 0.4;
export const RUB_WIPE_BOARD = 0.4;
export const RUB_WIPE_KNIFE = 0.08;

// --- cutting ---
/** Knife travel toward the chef, over the guide, that completes a cut. */
export const CUT_STROKE = 0.1;
/** Seconds after cutting during which a slice keeps full freshness, and when it reaches zero. */
export const FRESH_SECONDS = 90;
export const STALE_SECONDS = 240;

// --- nigiri gestures ---
/** Palm-to-palm distance at which the rice is set onto the neta. */
export const JOIN_DISTANCE = 0.1;
/** Pinch distance to the piece for shaping touches and picking it up. */
export const TOUCH_DISTANCE = 0.09;
/** The index fingertip takes wasabi only this close above the dish (passing high over it does not). */
export const WASABI_TOUCH_HEIGHT = 0.035;
/** Flip: the neta hand pushes forward this far while its fingers curl this much more. */
export const FLIP_PUSH_DISTANCE = 0.04;
export const FLIP_CURL_DELTA = 0.2;
export const FLIP_WINDOW_SECONDS = 0.5;
/** Turn: clockwise hand rotation (degrees) while pinching that spins the piece. */
export const ROTATE_DEG = 60;
export const SERVE_HOLD_SECONDS = 1.0;

// --- rhythm ---
export const TEMPO_MS = 1000;
export const JUDGE_EXCELLENT_MS = 150;
export const JUDGE_GOOD_MS = 300;
export const JUDGE_POOR_MS = 450;

// --- orientation and hospitality ---
export const ORIENTATION_TOLERANCE_DEG = 20;
/** Diagonal (degrees of yaw) for a right-handed customer; mirrored for left-handed. */
export const DIAGONAL_DEG = 45;

// --- turning around ---
export const TURN_YAW_DEG = 75;
export const TURN_HOLD_SECONDS = 1.0;

// --- master (the guide who shows the basic process) ---
/** Seconds without progress before the master says the next step. */
export const MASTER_HINT_IDLE_SECONDS = 8;
/** Shorter wait before the very first hint of a session. */
export const MASTER_FIRST_HINT_SECONDS = 3;
/** Further seconds without progress before the ghost hands show the motion. */
export const MASTER_DEMO_DELAY_SECONDS = 6;
/** Seconds a word stays above the station. */
export const MASTER_WORD_SECONDS = 3;
/** Successes after which the master stays quiet about a step. */
export const MASTER_LEARNED_COUNT = 3;
/** Where the master stands: beside the chef on the left, inside the counter. */
export const MASTER_POSITION: [number, number, number] = [-0.72, 0, -0.02];
