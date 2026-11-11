/**
 * Every gameplay number that may need adjusting on a real headset lives here.
 * Distances are meters, times are seconds unless the name says ms.
 */

import type { Grade } from './coach.js';
import type { MenuId, NetaId, PieceKind } from './menu.js';
import type { PrepId } from './prep.js';

// --- menu ---
/** Kinds of piece the customers order. */
export const ENABLED_KINDS: readonly PieceKind[] = ['nigiri', 'gunkan', 'inari', 'maki'];

// --- prep (仕込み), before service ---
/**
 * The difficulty a new player starts on (chosen on the books board in the
 * office corner each morning, before the call; remembered). 'easy': the fish
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
  EngawaNigiri: 450,
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
  UniGunkan: 1500,
  IkuraGunkan: 1200,
  Inari: 150,
  KanpyoRoll: 500,
  TunaRoll: 900,
  CucumberRoll: 400,
  PickleRoll: 400,
  UmeShisoRoll: 450,
  UmeCucumberRoll: 450,
};
/**
 * The fish shop's bill for each material it delivers (everything delivered
 * is paid for, sold or not). The owner's prices (2026-11-10): the tuna belly
 * is an eighth, about 12 kg at about ¥600 a kilo (a sixteenth is half); the
 * hamachi a half, eight kohada, one saba; the tamago is its eggs and scallops.
 */
export const FISH_SHOP_PRICE: Partial<Record<PrepId, number>> = {
  TunaBelly: 7200,
  BonitoHalf: 1500,
  Squid: 1500,
  Octopus: 1500,
  SeaEel: 1200,
  Abalone: 5000,
  Kanpyo: 500,
  StripedJack: 2000,
  Flounder: 2500,
  Yellowtail: 2500,
  Kohada: 1600,
  Saba: 800,
  Tamago: 1200,
};
/**
 * The full difficulty: what the fish shop (or, for the greengrocer's items,
 * the greengrocer) charges for a case item it brings ready to serve, for a
 * full case of it (a half is half). The owner (2026-11-10): a full case is
 * what this price buys, four servings ("全部4人前用でこの値段"): four prawns,
 * four of each shell; the inari pouches a set of twelve; sweet shrimp one
 * sheet, eighteen (six by three), nine pieces of two. The menu's case stocks follow (src/menu.ts).
 */
export const READY_PRICE: Partial<Record<NetaId, number>> = {
  Tamago: 500,
  Kohada: 900,
  HorseMackerel: 700,
  CuredMackerel: 900,
  Prawn: 1500,
  SweetShrimp: 800,
  Scallop: 1200,
  ArkShell: 1200,
  Cockle: 1100,
  InariAge: 400,
  Uni: 3000,
  Ikura: 2000,
  TunaStick: 1800,
  Cucumber: 200,
  Takuan: 300,
  UmePaste: 400,
  Shiso: 200,
};
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
 * The full difficulty's shop money (営業モード): it starts at this and
 * carries over from day to day. There is no borrowing: the fish shop takes
 * no more than the shop can pay, and staff are not called in when their
 * wages cannot be paid (the owner, 2026-11-10).
 */
export const START_FUNDS = 500_000;
/** Below this the books warn: about one morning's order. */
export const LOW_FUNDS = 40_000;
/**
 * The garnish vegetables and pickles (ツマもの) come straight from the
 * greengrocer (the owner), not with the fish shop's order: on the full
 * difficulty the greengrocer is called on its own line of the phone book
 * and ordered from like the fish shop (the owner, 2026-11-10); on easy they
 * come as usual each morning.
 */
export const GREENGROCER: readonly NetaId[] = ['Cucumber', 'Shiso', 'Takuan', 'UmePaste'];
/** Hourly wages: the cook (prep) and the part-timer (cleaning). */
export const WAGE_COOK = 2000;
export const WAGE_PART_TIMER = 1300;
/**
 * Shop minutes each job takes when it is left to someone else (paid by the
 * hour; the game runs these faster). On the easy difficulty the cook readies
 * every case item the chef does not prep.
 */
export const COOK_MINUTES_PER_CASE_ITEM = 3;
export const COOK_MINUTES: Partial<Record<PrepId, number>> = {
  TunaBelly: 20,
  BonitoHalf: 20,
  Squid: 15,
  Octopus: 20,
  SeaEel: 40,
  Abalone: 60,
  Kanpyo: 30,
  BonitoBelly: 15,
  StripedJack: 30,
  Flounder: 35,
  Yellowtail: 15,
  Kohada: 80,
  Saba: 40,
  Tamago: 60,
};
export const CLEANUP_MINUTES = 30;
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
