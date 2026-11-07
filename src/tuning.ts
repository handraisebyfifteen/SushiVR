/**
 * Every gameplay number that may need adjusting on a real headset lives here.
 * Distances are meters, times are seconds unless the name says ms.
 */

import type { Grade } from './coach.js';
import type { MenuId, PieceKind } from './menu.js';
import type { PrepId } from './prep.js';

/** Swap the rice hand and the neta hand for a left-handed chef. */
export const CHEF_LEFT_HANDED = false;

// --- menu ---
/** Kinds of piece the customers order. */
export const ENABLED_KINDS: readonly PieceKind[] = ['nigiri', 'gunkan', 'inari', 'maki'];

// --- prep (仕込み), before service ---
/** 'easy' fills every case item that is not prepped; 'full' (a later stage) keeps what is left. */
export const DIFFICULTY: 'easy' | 'full' = 'easy';
/** Prep stages built so far (src/prep.ts); the items of later stages start the day full. */
export const PREP_STAGE = 1;
/** Blade off the guide line (average over the stroke) for each grade of a prep cut. */
export const PREP_CUT_EXCELLENT = 0.006;
export const PREP_CUT_GOOD = 0.012;
export const PREP_CUT_POOR = 0.02;
/** Seconds from the call to the fish shop until its delivery is on the counter. */
export const DELIVERY_SECONDS = 8;
/** Seconds a washed board stands against the sink before it can go back. */
export const BOARD_DRY_SECONDS = 10;
/** How far apart the hands must pull to draw the squid's legs out of its body. */
export const SQUID_PULL_DISTANCE = 0.08;
/** Slices a saku loses for each prep cut below Excellent (a crooked cut wastes flesh). */
export const PREP_YIELD_LOSS: Record<Grade, number> = { Excellent: 0, Good: 1, Poor: 2, Bad: 3 };

// --- money (yen) ---
/**
 * What the customer pays per order: one nigiri, gunkan or inari, or one
 * roll. Agreed with the shop owner (a town sushi bar, a la carte). A bonito
 * order with no part named is two pieces, back and belly, each paid as one.
 */
export const PRICE: Record<MenuId, number> = {
  LeanTunaNigiri: 350,
  MediumFattyTunaNigiri: 600,
  FattyTunaNigiri: 800,
  BonitoPair: 600,
  BonitoNigiri: 300,
  BonitoBellyNigiri: 300,
  FlounderNigiri: 400,
  StripedJackNigiri: 500,
  YellowtailNigiri: 350,
  CuredMackerelNigiri: 300,
  KohadaNigiri: 300,
  HorseMackerelNigiri: 300,
  SquidNigiri: 300,
  GesoNigiri: 200,
  OctopusNigiri: 300,
  PrawnNigiri: 600,
  SweetShrimpNigiri: 350,
  AbaloneNigiri: 900,
  ArkShellNigiri: 500,
  ScallopNigiri: 400,
  CockleNigiri: 450,
  SeaEelNigiri: 450,
  TamagoNigiri: 150,
  UniGunkan: 900,
  IkuraGunkan: 600,
  Inari: 150,
  KanpyoRoll: 500,
  TunaRoll: 900,
  CucumberRoll: 400,
  PickleRoll: 400,
  UmeShisoRoll: 450,
  UmeCucumberRoll: 450,
};
/** The fish shop's bill for each material it delivers (everything delivered is paid for, sold or not). */
export const FISH_SHOP_PRICE: Partial<Record<PrepId, number>> = { TunaBelly: 5000, BonitoHalf: 1000, Squid: 800 };
/** Hourly wages: the cook (prep) and the part-timer (cleaning). */
export const WAGE_COOK = 2000;
export const WAGE_PART_TIMER = 1300;
/**
 * Shop minutes each job takes when it is left to someone else (paid by the
 * hour; the game runs these faster). On the easy difficulty the cook readies
 * every case item the chef does not prep.
 */
export const COOK_MINUTES_PER_CASE_ITEM = 3;
export const COOK_MINUTES: Partial<Record<PrepId, number>> = { TunaBelly: 20, BonitoHalf: 20, Squid: 15 };
export const CLEANUP_MINUTES = 30;
/** Real seconds the cook takes over one material, and the part-timer over the cleaning. */
export const COOK_SECONDS = 10;
export const CLEANUP_SECONDS = 8;
/** Seconds after opening before the noren can be taken in again (closing). */
export const CLOSE_AFTER_SECONDS = 5;

// --- customers ---
export const LEFT_HANDED_CUSTOMER_RATIO = 0.3;
/**
 * Orders a customer comes in with, and at most: an Excellent piece brings one
 * more order, a Poor one or a wrong item one fewer, a Bad one and they ask
 * for the bill. (A bonito order of back and belly counts as one order.)
 */
export const ORDERS_PER_CUSTOMER = 3;
export const MAX_ORDERS_PER_CUSTOMER = 6;
/** Seconds the result stays above the customer after a piece is eaten. */
export const RESULT_SECONDS = 4;
/** Walking pace (m/s) of the customer and the staff. */
export const WALK_PACE = 0.9;

// --- customer care: the tea and the check ---
/** How often a customer asks for tea (お茶), once they have eaten their first piece. */
export const TEA_REQUEST_RATIO = 0.5;
/** How long they wait for it: unserved by then, they order one fewer. */
export const TEA_PATIENCE_SECONDS = 45;
/** Pouring a cup at the urn (the chef's or the part-timer's). */
export const TEA_POUR_SECONDS = 2;
/** The part-timer's minutes, for wages: a cup of tea, showing a customer to the seat. */
export const TEA_MINUTES = 3;
export const SEAT_MINUTES = 1;

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

// --- rolls (hosomaki) ---
/** Total sideways palm travel over the nori (two sweeps) that spreads the rice. */
export const SPREAD_DISTANCE = 0.32;
/** Both palms push forward this far over the mat (within ROLL_WINDOW_SECONDS) to roll it. */
export const ROLL_PUSH_DISTANCE = 0.06;
export const ROLL_WINDOW_SECONDS = 0.8;
/** Both fists close within this many seconds of each other: the squeeze. */
export const SQUEEZE_SYNC_SECONDS = 0.3;

// --- rhythm ---
export const TEMPO_MS = 1000;
export const JUDGE_EXCELLENT_MS = 150;
export const JUDGE_GOOD_MS = 300;
export const JUDGE_POOR_MS = 450;

// --- orientation and hospitality ---
export const ORIENTATION_TOLERANCE_DEG = 20;
/** Diagonal (degrees of yaw) for a right-handed customer; mirrored for left-handed. */
export const DIAGONAL_DEG = 45;

// --- turning around (in the headset, the chef just turns round on the stool) ---
/** The head this far (degrees) off the bar faces the back row; back within this, the bar again. */
export const FACING_BACK_DEG = 120;
export const FACING_FRONT_DEG = 60;

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
