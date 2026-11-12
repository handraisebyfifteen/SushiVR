/**
 * Every gameplay number that may need adjusting on a real headset lives here.
 * Distances are meters, times are seconds unless the name says ms.
 */

import type { Grade } from './coach.js';
import type { NetaId, PieceKind } from './menu.js';

// --- menu ---
/** Kinds of piece the customers order. */
export const ENABLED_KINDS: readonly PieceKind[] = ['nigiri', 'gunkan', 'inari', 'maki'];

// --- prep (仕込み), before service ---
/**
 * The difficulty a new player starts on (chosen in the phone's settings
 * each morning, before the call; remembered). 'easy': the fish
 * shop brings the usual and the cook fills every case item that is not
 * prepped. 'full' (本格): the case keeps what is left from day to day, and
 * the chef checks it and orders by item and amount (src/fish-order.ts).
 */
export const START_DIFFICULTY: 'easy' | 'full' = 'easy';
/** Prep stages built so far (src/prep.ts); the items of later stages start the day full. */
export const PREP_STAGE = 4;
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
// --- stage 4: whole fish, washed at the sink (水洗い), then filleted on the board ---
/** Scaler travel over one side of a fish (scraped tail to head, again and again) to clear its scales. */
export const SCALE_RUB = 0.7;
/** Rubbing the belly cavity under the tap to wash it clean. */
export const RINSE_RUB = 0.45;
/** How high the fish is lifted to turn it over. */
export const TURN_LIFT = 0.05;
/** The tweezers' tip this close to a pin bone grips it; lifted this far, the bone comes out. */
export const PIN_GRIP = 0.025;
export const PIN_PULL = 0.02;

// --- the full difficulty's curing (締め) on the drainboard (src/cure-system.ts) ---
/**
 * Real seconds for one shop minute of curing: the shop's real time (the
 * design memo of 2026-11-10). The chef skips ahead by pinching a kitchen
 * timer: to where the next time's Good begins.
 */
export const CURE_MINUTE_SECONDS = 60;
/** Kohada (the owner): salt 40 min. The day's size no longer moves it (one target, so the time can be graded). */
export const KOHADA_SALT_MINUTES = 40;
export const KOHADA_SIZE_MINUTES = 0;
/** Saba (the owner: 2-3 hours): salt 2 hours. */
export const SABA_SALT_MINUTES = 120;
/** The vinegar (the owner, 2026-11-10): 20 min for every fish. */
export const VINEGAR_MINUTES = 20;
/**
 * A time's grade: how far off its target the fish came out, as a share of
 * the target (provisional). Early is under-cured, late is salty or firm.
 */
export const TIME_EXCELLENT = 0.05;
export const TIME_GOOD = 0.1;
export const TIME_POOR = 0.2;
/**
 * The timer's skip on a long time (this many minutes or more: the kohada's
 * and the saba's salt) lands this many real seconds before its Excellent
 * begins; on a short one (the aji's salt, the vinegar) where its Good begins.
 */
export const SKIP_LONG_MINUTES = 30;
export const SKIP_LEAD_SECONDS = 20;
/**
 * Salting (the owner: till it is fairly white): each pinch whitens the salt
 * within this radius of where the fingers open (most at the middle); the tray
 * is salted once this share of it is white. Then seconds under the tap.
 */
export const SALT_RADIUS = 0.065;
export const SALT_PER_PINCH = 1;
export const SALT_COVER = 0.8;
export const CURE_RINSE_SECONDS = 1.2;
// The kohada's bowl of water and the drain on the basket have no times: they are steps of the work (the owner).

// --- the full difficulty's tamago (厚焼き) on the range (src/tamago-system.ts) ---
/** Real seconds each side bakes on a low flame (the first, then the other after the one turn). */
export const TAMAGO_SIDE_SECONDS: readonly [number, number] = [36, 18];
/** By flame (off, low, medium, high): how fast it bakes, and how fast its face down browns (on low, golden as it is done). */
export const TAMAGO_BAKE_RATE: readonly number[] = [0, 1, 1.5, 2];
export const TAMAGO_BROWN_RATE: readonly number[] = [0, 1, 2.2, 3.5];
/** A face browned past this is scorched (1 is golden); seconds the batter takes to pour. */
export const TAMAGO_SCORCHED = 1.8;
export const TAMAGO_POUR_SECONDS = 1.2;
/** The tamago's batter in the suribachi (the owner: the scallops ground, the eggs in, mixed with chopsticks till frothy): how far the hand goes round with the pestle (metres, about 6 and 5 rounds). */
export const TAMAGO_GRIND_TRAVEL = 1.8;
export const TAMAGO_WHISK_TRAVEL = 1.4;
/** The copper pan's heat (0 cold .. 1 hot) per second by flame level (off cools it): a medium flame heats it for the oil in about 5 s. */
export const TAMAGO_HEAT_RATE: readonly number[] = [-0.05, 0.04, 0.1, 0.16];
/** Hot enough to take the oil (油返し), and for the batter to sizzle (a colder or dry pan, the tamago sticks). */
export const TAMAGO_OIL_HEAT = 0.5;
export const TAMAGO_POUR_HEAT = 0.5;
/** The toss: the handle flicked up at least this fast (m/s), the chopsticks in the other hand. */
export const TAMAGO_FLIP_SPEED = 0.6;
/** Tossed before the first side is this far baked, the tamago breaks. */
export const TAMAGO_TURN_READY = 0.8;
/** Seconds the turned-out tamago cools on its lid before it goes into the case. */
export const TAMAGO_COOL_SECONDS = 15;

// --- the full difficulty's case, the greengrocer, the staff (the game has no money) ---
/**
 * The full difficulty, where the case carries over. The owner: only tuna and
 * cooked things (anago, tamago, octopus...) may be kept from day to day;
 * everything else is for the day it came, and what is left is out the next
 * morning. The greengrocer's garnishes (ツマ) have days of their own (KEEP_DAYS).
 */
export const KEPT_OVERNIGHT: readonly NetaId[] = [
  'FattyTuna', 'MediumFattyTuna', 'LeanTuna', 'TunaStick',
  'SeaEel', 'Tamago', 'Octopus', 'Abalone', 'Kanpyo', 'InariAge',
];
/**
 * Days that differ (the owner, 2026-11-10): uni and ikura last two business
 * days, the day they came and the next; the garnishes "中2日", read as the
 * day they came and two more (to confirm).
 */
export const KEEP_DAYS: Partial<Record<NetaId, number>> = { Uni: 2, Ikura: 2, Cucumber: 3, Shiso: 3, Takuan: 3, UmePaste: 3 };
/**
 * The garnish vegetables and pickles (ツマもの) come straight from the
 * greengrocer (the owner), not with the fish shop's order: on the full
 * difficulty the greengrocer is called on its own line of the phone book
 * and ordered from like the fish shop (the owner, 2026-11-10); on easy they
 * come as usual each morning.
 */
export const GREENGROCER: readonly NetaId[] = ['Cucumber', 'Shiso', 'Takuan', 'UmePaste'];
/** Real seconds the cook takes over one material, and the part-timer over the cleaning. */
export const COOK_SECONDS = 10;
export const CLEANUP_SECONDS = 8;
// --- the back row in the morning prep: shari and the range (time runs faster) ---
/** The gas rice cooker: seconds on the flame (it goes out by itself), then steaming (蒸らし) with the lid on. */
export const RICE_COOK_SECONDS = 40;
export const RICE_STEAM_SECONDS = 15;
/** Seconds the awasezu pours while the bowl is held over the hangiri. */
export const AWASEZU_SECONDS = 1.5;
/** How far (m) the shamoji travels through the rice to cut the vinegar in. */
/** One piece's shari, nigiri or gunkan (the owner: 19 g); the shari's form is sized to it in src/scene-assets/lib/nigiri-form.ts. */
export const SHARI_GRAMS = 19;
export const SHARI_CUT_DISTANCE = 1.4;
/** Scoops of shari from the hangiri into the ohitsu. */
export const SHARI_SCOOPS = 6;
// --- the rice and nori stock (full mode only; src/pantry.ts) ---
/** Raw rice: 1 sho weighs 1.5 kg; the rice shop's sack is 10 kg (about 6.7 sho). */
export const RICE_KG_PER_SHO = 1.5;
export const RICE_SACK_KG = 10;
/** Shari from 1 sho of raw rice (cooked to about 2.1 times its weight, the awasezu in): about 170 nigiri at 19 g. */
export const SHARI_PER_SHO_GRAMS = 3300;
/** A hosomaki's shari and an inari's (the owner, 2026-11-11: 90 g a roll, 30 g a piece). */
export const HOSOMAKI_SHARI_GRAMS = 90;
export const INARI_SHARI_GRAMS = 30;
/** A sheet of nori cuts into this many gunkan strips (the user's shop: 六切り, a sixth each; a roll takes a half sheet); the rice shop's nori comes 10 sheets at a time. */
export const GUNKAN_STRIPS_PER_SHEET = 6;
export const NORI_PER_PACK = 10;
/** A new shop's first stock: sacks of rice, sheets of nori. */
export const START_RICE_SACKS = 1;
export const START_NORI_SHEETS = 30;
/** Warnings: the ohitsu yellow at this many nigiri left and red at this; the sack under this (sho); the nori tin under this (sheets). */
export const TUB_LOW_PIECES = 40;
export const TUB_OUT_PIECES = 10;
export const RICE_LOW_SHO = 1;
export const NORI_LOW_SHEETS = 10;
/** The broth and water start warm (°C); each flame level's heating, °C a second (low settles at its own level). */
export const POT_START_TEMP = 60;
export const HEAT_RATE: readonly number[] = [-0.6, 1.5, 2.5, 4];
/** Where a low flame holds the broth (°C): the conger eel's 90. */
export const LOW_FLAME_TEMP = 90;
/** The conger eel simmers at 90 degrees: seconds within this band; boiling breaks it (seconds of boil for Poor, Bad). */
export const EEL_BAND: readonly [number, number] = [85, 95];
export const EEL_SECONDS = 30;
export const EEL_BOIL_POOR = 4;
export const EEL_BOIL_BAD = 10;
/** The octopus is cooked (炊く) at a rolling boil on a high flame; boiled on past it, it toughens (seconds for Poor, Bad). */
export const OCTOPUS_SECONDS = 20;
export const OCTOPUS_OVER_POOR = 10;
export const OCTOPUS_OVER_BAD = 25;
/** Simmered until the liquid is gone (煮切る): seconds to boil it all off on a high flame (a medium one takes half as fast again). */
export const KANPYO_REDUCE_SECONDS = 18;
export const ABALONE_REDUCE_SECONDS = 30;
/** The liquid counts as gone below this; left on the flame dry this long, it scorches. */
export const REDUCED_LEVEL = 0.08;
export const SCORCH_SECONDS = 8;
/** Searing the bonito belly on the net (seconds on a high flame per face); a face left this many times over burns. */
export const SEAR_SKIN_SECONDS = 6;
export const SEAR_SIDE_SECONDS = 2.5;
export const SEAR_BURN_FACTOR = 2.2;
/** Seconds the seared belly chills on the ice. */
export const CHILL_SECONDS = 6;
/** How far (m) the skewers are slid through the belly, and pulled back out. */
export const SKEWER_DISTANCE = 0.1;

/** Seconds after opening before the noren can be taken in again (closing). */
export const CLOSE_AFTER_SECONDS = 5;

// --- customers ---
export const LEFT_HANDED_CUSTOMER_RATIO = 0.3;
/**
 * Orders a customer comes in with, and at most: an Excellent piece brings one
 * more order, a Poor one or a wrong item one fewer, after a Bad one they
 * order no more. (A bonito order of back and belly counts as one order.)
 */
export const ORDERS_PER_CUSTOMER = 3;
export const MAX_ORDERS_PER_CUSTOMER = 6;
/** Seconds the result stays above the customer after a piece is eaten. */
export const RESULT_SECONDS = 4;
/** Walking pace (m/s) of the customer and the staff. */
export const WALK_PACE = 0.9;

// --- customer care: the tea ---
/** How often a customer asks for tea (お茶), once they have eaten their first piece. */
export const TEA_REQUEST_RATIO = 0.5;
/** How long they wait for it: unserved by then, they order one fewer. */
export const TEA_PATIENCE_SECONDS = 45;
/** Pouring a cup at the urn (the chef's or the part-timer's). */
export const TEA_POUR_SECONDS = 2;

// --- hygiene ---
/** Pieces made before the hands need washing (dirt reaches 1). */
export const PIECES_PER_WASH = 5;
/** Board dirt added by one cut and by one nigiri (board needs a wipe at 1). */
export const BOARD_DIRT_PER_CUT = 0.35;
export const BOARD_DIRT_PER_NIGIRI = 0.35;
/** Rub distance (total palm travel) needed for each cleaning action. */
export const RUB_WASH_HANDS = 0.5;
export const RUB_WASH_CLOTH = 0.4;
/** The other hand's scrubbing travel (m) that washes one of the fish shop's inserts held under the tap (one insert at a time). */
export const RUB_WASH_NAKAGO = 0.3;
/** The cloth hand's travel (m) over a washed insert that dries it (the owner: used, washed and the water off is clean). */
export const RUB_DRY_NAKAGO = 0.25;
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

/**
 * The knife's edge (包丁研ぎ): how much each cut wears it (1 = freshly
 * sharpened), below what it marks the pieces it cuts, how far the blade
 * travels on the stone to restore it, and how long the blade is rinsed.
 */
export const KNIFE_WEAR_PER_CUT = 1 / 45;
export const KNIFE_DULL = 0.35;
export const KNIFE_SHARP_ENOUGH = 0.9;
export const RUB_SHARPEN = 1.2;
export const RINSE_BLADE_SECONDS = 0.5;
/**
 * A dull edge (below KNIFE_DULL) catches in the flesh at random: the stroke
 * does not take the slice off and the blade is drawn again (the owner,
 * 2026-11-12: 「切れ味悪くなるとランダムで一回で切り身取れなくなるとか」). The chance
 * per stroke, at the dull line and with the edge gone; never twice on one cut.
 */
export const DULL_CATCH_MIN = 0.25;
export const DULL_CATCH_MAX = 0.6;
