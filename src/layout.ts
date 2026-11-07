/**
 * Sushi bar layout: every structural dimension in one place (meters).
 *
 * Coordinates: the player's head is at x = 0, z = 0 and the chef floor is
 * y = 0. The player faces -Z (toward the customers); +X is the player's right.
 *
 * Side view, from the customer side toward the chef:
 *
 *   customer counter | tsukedai | manaita ........ player ........ | sink, cabinet | back wall
 *        0.40        |   0.30   |  0.36  |<-------- aisle 1.0 -------->|     0.55
 *
 * The aisle is measured from the tsukedai's chef-side edge to the face of the
 * back row. The manaita lies inside it, against the tsukedai, on the chef's
 * work counter; the player is at PLAYER_ACROSS_AISLE of the aisle (0.5 = middle).
 *
 * After changing a number, run `npm run layout` so the scene nodes in
 * public/scenes/main.iwsdk.scene.json move to match. The models read these
 * constants directly.
 *
 * Keep this module import-free: scripts/sync-layout.mjs loads it on its own.
 */

// --- depths, along Z ---
export const CUSTOMER_COUNTER_DEPTH = 0.4;
export const TSUKEDAI_DEPTH = 0.3;
export const MANAITA_DEPTH = 0.36;
export const MANAITA_WIDTH = 1.0;
export const MANAITA_THICKNESS = 0.02;
/** Work counter depth beyond the manaita on the chef side (room for the knife and cloth). */
export const WORK_COUNTER_LIP = 0.04;
/** Chef aisle: tsukedai edge to the face of the sink and cabinet row. */
export const AISLE_WIDTH = 1.0;
/** Where the player is across the aisle: 0 = at the tsukedai, 0.5 = middle, 1 = at the sink. */
export const PLAYER_ACROSS_AISLE = 0.5;
/** Depth of the back row (sink unit); the back wall stands right behind it. */
export const BACK_ROW_DEPTH = 0.55;
/** On the tsukedai: the neta case on the chef side, the geta in front of it. */
export const NETA_CASE_DEPTH = 0.19;
export const GETA_DEPTH = 0.1;

// --- lengths, along X ---
/** Length of the counters, the tsukedai and the eaves. */
export const BAR_LENGTH = 1.8;
/** Neta case: outer length along the bar, and the machine housing at its left end. */
export const NETA_CASE_WIDTH = 1.5;
export const NETA_HOUSING_WIDTH = 0.12;
/** Sliding glass doors on the chef side, side by side across the glass part. */
export const NETA_DOOR_COUNT = 5;
/** Length of the chef's room between its end walls. */
export const ROOM_LENGTH = 3.0;

// --- heights ---
/** The customer floor is one step below the chef floor. */
export const STEP_HEIGHT = 0.2;
export const WORK_COUNTER_TOP = 0.75;
export const TSUKEDAI_TOP = 0.78;
/** Customer counter height above the customer floor. */
export const CUSTOMER_COUNTER_HEIGHT = 0.75;
export const SINK_TOP = 0.85;
export const CEILING_HEIGHT = 2.4;

// --- eaves (hisashi) over the tsukedai ---
/** Underside of the eaves beam: a little above a standing chef's head. */
export const EAVES_HEIGHT = 1.95;
/** Roof depth (front to back) and how much higher its back edge is than its front. */
export const EAVES_DEPTH = 0.6;
export const EAVES_RISE = 0.2;
/** Gap between the roof's back edge and the tsukedai's chef-side edge (toward the chef). */
export const EAVES_BACK_OVERLAP = 0.04;
export const NOREN_LENGTH = 0.32;
export const NOREN_PANELS = 5;
export const LANTERN_COUNT = 4;
/** Lantern size and how far it hangs below the beam. */
export const LANTERN_WIDTH = 0.17;
export const LANTERN_HEIGHT = 0.24;
export const LANTERN_DROP = 0.1;
/** Where along the eaves the lanterns hang: 0 = back edge (chef side), 1 = front edge. */
export const LANTERN_ALONG = 0.65;
export const TILE_PITCH = 0.06;

// --- back row, along X ---
export const SINK_WIDTH = 1.1;
/** Basin centre X: straight behind the player, so both hands reach it. */
export const SINK_BASIN_X = 0;
export const SINK_BASIN_WIDTH = 0.45;
export const SINK_BASIN_DEPTH = 0.34;
/** Rim between the sink's front face and the basin. */
export const SINK_FRONT_RIM = 0.04;
/** Top strip on the basin's right (seen facing the sink) that holds the soap. */
export const SINK_END_STRIP = 0.125;
/** Hand towel: hung over a small bar on the sink cabinet front, just under the counter lip. */
export const TOWEL_BAR_Y = SINK_TOP - 0.065;
/** From the bar down to the bottom hem of the towel's front panel. */
export const TOWEL_DROP = 0.205;
/** How far the towel bar stands off the cabinet front. */
export const TOWEL_STANDOFF = 0.035;
export const CABINET_WIDTH = 0.7;
export const CABINET_DEPTH = 0.4;
export const CABINET_HEIGHT = 1.8;
export const CABINET_GAP = 0.03;
/** Stainless work table, then a commercial gas range, on the sink's right (seen facing the sink). */
export const WORKTABLE_WIDTH = 0.4;
/** Gas range: four burners over an oven with a side cupboard on each side. */
export const RANGE_WIDTH = 0.7;
/** Height of the range's top frame (the grates sit just above it): level with the sink. */
export const RANGE_HEIGHT = SINK_TOP;
export const BACK_ROW_GAP = 0.01;
/** Kitchen doorway in the end wall on the player's left (-X), centred on the aisle. */
export const KITCHEN_DOOR_WIDTH = 0.8;
export const KITCHEN_DOOR_HEIGHT = 1.85;
export const KITCHEN_DEPTH = 0.9;
export const WALL_THICKNESS = 0.06;

// --- the seated player's body, for the reach check ---
export const SEATED_EYE_HEIGHT = 1.25;
export const SHOULDER_BELOW_EYES = 0.23;
export const SHOULDER_BEHIND_EYES = 0.06;
export const SHOULDER_HALF_WIDTH = 0.18;
/** Shoulder joint to palm centre with the arm straight (average adult). */
export const ARM_REACH = 0.62;

// --- derived lines (do not edit; change the numbers above) ---
export const TSUKEDAI_CHEF_Z = -AISLE_WIDTH * PLAYER_ACROSS_AISLE;
export const TSUKEDAI_CUSTOMER_Z = TSUKEDAI_CHEF_Z - TSUKEDAI_DEPTH;
export const CUSTOMER_COUNTER_FAR_Z = TSUKEDAI_CUSTOMER_Z - CUSTOMER_COUNTER_DEPTH;
export const BACK_ROW_Z = TSUKEDAI_CHEF_Z + AISLE_WIDTH;
export const BACK_WALL_Z = BACK_ROW_Z + BACK_ROW_DEPTH;
export const WORK_COUNTER_DEPTH = MANAITA_DEPTH + WORK_COUNTER_LIP;
export const MANAITA_Z = TSUKEDAI_CHEF_Z + MANAITA_DEPTH / 2;
export const MANAITA_NEAR_Z = TSUKEDAI_CHEF_Z + MANAITA_DEPTH;
export const MANAITA_TOP = WORK_COUNTER_TOP + MANAITA_THICKNESS;
export const NETA_CASE_Z = TSUKEDAI_CHEF_Z - NETA_CASE_DEPTH / 2;
/** Glass part of the neta case (right of the housing), centred on the player: case origin X. */
export const NETA_GLASS_WIDTH = NETA_CASE_WIDTH - NETA_HOUSING_WIDTH;
export const NETA_CASE_X = -NETA_HOUSING_WIDTH / 2;
export const NETA_DOOR_PITCH = NETA_GLASS_WIDTH / NETA_DOOR_COUNT;
/** Case floor top (where the case items stand) and the line their chef-side ends sit on, just inside the doors. */
export const NETA_FLOOR_Y = TSUKEDAI_TOP + 0.054;
export const NETA_FRONT_Z = NETA_CASE_Z + NETA_CASE_DEPTH / 2 - 0.025;
/** Space kept clear at each end of the glass part, and between the neta hand's items and the rice hand's. */
const NETA_END_MARGIN = 0.008;
export const NETA_ZONE_GAP = 0.014;

/**
 * X centres of the case items, left to right, spread evenly over the glass
 * part (which is centred on the player). `zoneStart` is the index of the
 * first rice-hand item, where a wider gap goes. Throws if they do not fit.
 */
export function caseItemXs(widths: readonly number[], zoneStart = -1): number[] {
  const left = -NETA_GLASS_WIDTH / 2 + NETA_END_MARGIN;
  const usable = NETA_GLASS_WIDTH - 2 * NETA_END_MARGIN - (zoneStart > 0 ? NETA_ZONE_GAP : 0);
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total > usable) throw new Error(`case items need ${total.toFixed(3)} m but the case has ${usable.toFixed(3)} m`);
  const gap = widths.length > 1 ? (usable - total) / (widths.length - 1) : 0;
  const xs: number[] = [];
  let x = left;
  widths.forEach((w, i) => {
    if (i === zoneStart) x += NETA_ZONE_GAP;
    xs.push(x + w / 2);
    x += w + gap;
  });
  return xs;
}
export const GETA_Z = TSUKEDAI_CUSTOMER_Z + GETA_DEPTH / 2 + 0.005;
export const CUSTOMER_SEAT_Z = CUSTOMER_COUNTER_FAR_Z - 0.065;
export const EAVES_Z = TSUKEDAI_CHEF_Z - TSUKEDAI_DEPTH / 2;
export const ROOM_END_X = ROOM_LENGTH / 2;
export const AISLE_CENTER_Z = TSUKEDAI_CHEF_Z + AISLE_WIDTH / 2;
/** Sink unit centre X, so that its basin sits at SINK_BASIN_X. */
export const SINK_UNIT_X = SINK_BASIN_X - SINK_BASIN_WIDTH / 2 - SINK_END_STRIP + SINK_WIDTH / 2;
export const SINK_UNIT_Z = BACK_ROW_Z + BACK_ROW_DEPTH / 2;
/** Washing zone: the basin plus its front rim, measured from the sink's front face. */
export const SINK_ZONE_DEPTH = SINK_FRONT_RIM + SINK_BASIN_DEPTH;
export const SINK_ZONE_Z = BACK_ROW_Z + SINK_ZONE_DEPTH / 2;
/** Front face of the sink cabinet (its body is inset 2 cm behind the counter edge). */
export const SINK_CABINET_FRONT_Z = BACK_ROW_Z + 0.02;
/** Glass-door dish cabinet, in the same row as the sink, against the back wall. */
export const CABINET_X = SINK_UNIT_X + SINK_WIDTH / 2 + CABINET_GAP + CABINET_WIDTH / 2;
export const CABINET_Z = BACK_WALL_Z - CABINET_DEPTH / 2;
export const WORKTABLE_X = SINK_UNIT_X - SINK_WIDTH / 2 - BACK_ROW_GAP - WORKTABLE_WIDTH / 2;
export const STOVE_X = WORKTABLE_X - WORKTABLE_WIDTH / 2 - BACK_ROW_GAP - RANGE_WIDTH / 2;

type Vec3 = [number, number, number];
export interface NodeLayout {
  position: Vec3;
  /** Station zone fields to write into the node's Station component. */
  station?: { width?: number; depth?: number; height?: number; radius?: number; below?: number };
}

/** Neta case height to the top glass (a real case is about 27 cm). */
export const NETA_CASE_HEIGHT = 0.27;
const DISH_Z = MANAITA_Z - 0.1;

/** The styrofoam ice box of the morning's materials: on the counter, left of the board. */
export const ICE_BOX_WIDTH = 0.34;
export const ICE_BOX_DEPTH = 0.32;
export const ICE_BOX_HEIGHT = 0.13;
/** Top of the ice bed inside, where the materials lie (box-local y). */
export const ICE_BOX_ICE_TOP = 0.075;
export const ICE_BOX_WALL = 0.02;
export const ICE_BOX_X = -MANAITA_WIDTH / 2 - 0.02 - ICE_BOX_WIDTH / 2;
export const ICE_BOX_Z = MANAITA_Z + 0.03;

/** The trash bin at the chef's left foot (opposite the rice tub), just clear of the cold table. */
export const TRASH_BIN_X = -0.36;
export const TRASH_BIN_Z = TSUKEDAI_CHEF_Z + WORK_COUNTER_DEPTH + 0.14;
export const TRASH_BIN_TOP = 0.42;
/**
 * The rice tub (ohitsu) on a low stand at the chef's right, between knee and
 * waist (the user's shop): under the counter, out of the customers' sight,
 * yet high enough for the headset's cameras to see the hand going in (hands
 * down by the thighs are not tracked). RICE_TUB_TOP is the rice surface.
 */
export const RICE_TUB_X = 0.48;
export const RICE_TUB_Z = 0.12;
export const RICE_TUB_TOP = 0.6;
/** The kitchen paper box on the board's back edge, between the nori box and the work. */
export const PAPER_BOX_X = -0.2;
/**
 * The office corner (帳場) on the aisle's right end wall (seen from the bar;
 * the left wall seen from the customers), out of the customers' way: the
 * food shelf toward the front, and toward the back, by the dish cabinet, the
 * day's books on the wall over the black telephone on its shelf. All face
 * the aisle (-X); the phone is out of reach from the seat: it is pointed at.
 */
export const END_WALL_X = ROOM_END_X - WALL_THICKNESS / 2;
export const FOOD_SHELF_X = END_WALL_X - 0.18;
export const FOOD_SHELF_Z = AISLE_CENTER_Z - 0.1;
/** The phone and the books, between the food shelf and the dish cabinet. */
export const OFFICE_BACK_Z = AISLE_CENTER_Z + 0.5;
export const PHONE_SHELF_Y = 1.0;
export const BOOKS_BOARD_Y = 1.5;
/**
 * The staff call board: two buttons (the cook, the part-timer) on the wall
 * over the food shelf. Pointed at from the seat like the phone, so the
 * buttons stand well apart across the wall (see src/pointing.ts).
 */
export const STAFF_BUTTONS_Y = 1.78;
export const STAFF_BUTTONS_Z = FOOD_SHELF_Z - 0.17;
/**
 * The tea things (お茶), made out of the customers' sight: a low cabinet
 * under the phone, hidden from the seats behind the food shelf, with the
 * hot-water urn, the powdered tea and the cups. Pointed at, like the phone.
 */
export const TEA_STATION_Z = OFFICE_BACK_Z - 0.01;
/** Where a cup the chef makes is set down at hand: the stainless strip right of the board, past the cloth. */
export const TEA_CUP_X = 0.68;
export const TEA_CUP_Z = TSUKEDAI_CHEF_Z + 0.1;
/** Where the tea goes before the customer: the tsukedai's front strip, right of the geta. */
export const TEA_SERVE_X = 0.24;
/** The long noren (長のれん) in the kitchen doorway and in the passage to the customer room at the bar's right end. */
export const LONG_NOREN_LENGTH = 1.45;
/** The menu board (お品書き) high on the back wall over the sink, the work table and the range, clear of the dish cabinet. */
export const MENU_BOARD_X = -0.36;
export const MENU_BOARD_Y = 1.81;
/** The shop's entrance, beyond the customer's seat on the left, facing the bar. */
export const ENTRANCE_X = -0.8;
export const ENTRANCE_Z = CUSTOMER_SEAT_Z - 1.1;

/** Scene node id -> where `npm run layout` puts it. Nodes not listed are left alone. */
export const SCENE_LAYOUT: Record<string, NodeLayout> = {
  'chef-platform': {
    position: [0, 0, (TSUKEDAI_CUSTOMER_Z + BACK_WALL_Z + WALL_THICKNESS) / 2],
  },
  counter: { position: [0, 0, TSUKEDAI_CHEF_Z + WORK_COUNTER_DEPTH / 2] },
  'cutting-board': {
    position: [0, WORK_COUNTER_TOP, MANAITA_Z],
    station: { width: MANAITA_WIDTH, depth: MANAITA_DEPTH - 0.02, height: MANAITA_THICKNESS },
  },
  // Back row of the board, just left of the tezu bowl: easy to see in VR.
  'wasabi-dish': { position: [0.24, MANAITA_TOP, DISH_Z] },
  'tezu-bowl': { position: [0.4, MANAITA_TOP, DISH_Z] },
  // Back-left corner of the board, for the neta hand (gunkan nori).
  'nori-box': { position: [-0.38, MANAITA_TOP, DISH_Z] },
  // Left of centre, toward the chef, where both hands reach it (rolled up at the board's left edge when not in use).
  makisu: { position: [-0.2, MANAITA_TOP, MANAITA_Z + 0.07], station: { width: 0.24, depth: 0.22, height: 0.004 } },
  'paper-box': { position: [PAPER_BOX_X, MANAITA_TOP, DISH_Z], station: { radius: 0.08, height: 0.06 } },
  'trash-bin': { position: [TRASH_BIN_X, 0, TRASH_BIN_Z], station: { radius: 0.14, height: TRASH_BIN_TOP } },
  'rice-tub': { position: [RICE_TUB_X, RICE_TUB_TOP, RICE_TUB_Z] },
  // The phone's body, 11 cm out from the wall, on its shelf.
  phone: { position: [END_WALL_X - 0.11, PHONE_SHELF_Y, OFFICE_BACK_Z], station: { radius: 0.12, height: 0.12 } },
  'phone-shelf': { position: [END_WALL_X, PHONE_SHELF_Y, OFFICE_BACK_Z] },
  'books-board': { position: [END_WALL_X, BOOKS_BOARD_Y, OFFICE_BACK_Z] },
  'staff-buttons': { position: [END_WALL_X, STAFF_BUTTONS_Y, STAFF_BUTTONS_Z] },
  'tea-station': { position: [END_WALL_X, 0, TEA_STATION_Z] },
  'menu-board': { position: [MENU_BOARD_X, MENU_BOARD_Y, BACK_WALL_Z] },
  'food-shelf': { position: [FOOD_SHELF_X, 0, FOOD_SHELF_Z] },
  entrance: { position: [ENTRANCE_X, -STEP_HEIGHT, ENTRANCE_Z] },
  'ice-box': {
    position: [ICE_BOX_X, WORK_COUNTER_TOP, ICE_BOX_Z],
    station: { width: ICE_BOX_WIDTH - 2 * ICE_BOX_WALL, depth: ICE_BOX_DEPTH - 2 * ICE_BOX_WALL, height: ICE_BOX_ICE_TOP },
  },
  knife: { position: [0.57, WORK_COUNTER_TOP, MANAITA_Z + 0.03] },
  'wet-cloth': { position: [0.66, WORK_COUNTER_TOP, MANAITA_NEAR_Z - 0.06] },
  ledge: { position: [0, 0, TSUKEDAI_CHEF_Z - TSUKEDAI_DEPTH / 2] },
  'neta-case': {
    position: [NETA_CASE_X, TSUKEDAI_TOP, NETA_CASE_Z],
    station: { width: NETA_CASE_WIDTH, depth: NETA_CASE_DEPTH },
  },
  geta: { position: [0, TSUKEDAI_TOP, GETA_Z] },
  'customer-counter': {
    position: [0, -STEP_HEIGHT, TSUKEDAI_CUSTOMER_Z - CUSTOMER_COUNTER_DEPTH / 2],
  },
  'sink-unit': { position: [SINK_UNIT_X, 0, SINK_UNIT_Z] },
  sink: {
    position: [SINK_BASIN_X, SINK_TOP, SINK_ZONE_Z],
    // Hands wash down inside the basin, so the zone reaches 15 cm below the rim.
    station: { width: SINK_BASIN_WIDTH, depth: SINK_ZONE_DEPTH, below: 0.15 },
  },
  soap: {
    position: [SINK_BASIN_X - SINK_BASIN_WIDTH / 2 - SINK_END_STRIP / 2, SINK_TOP, BACK_ROW_Z + 0.045],
  },
  towel: {
    // Straight below the basin (clear of the left door's handle), so both hands reach it alike.
    position: [SINK_BASIN_X - 0.03, TOWEL_BAR_Y - TOWEL_DROP, SINK_CABINET_FRONT_Z - TOWEL_STANDOFF],
    station: { radius: 0.12, height: 0 },
  },
  'dish-cabinet': { position: [CABINET_X, 0, CABINET_Z] },
  'work-table': { position: [WORKTABLE_X, 0, SINK_UNIT_Z] },
  'gas-stove': { position: [STOVE_X, 0, SINK_UNIT_Z] },
  eaves: { position: [0, 0, EAVES_Z] },
  'itaba-room': { position: [0, 0, 0] },
};
