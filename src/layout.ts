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
/** Length of the chef's room between its end walls. */
export const ROOM_LENGTH = 3.0;

// --- heights ---
/** The customer floor is one step below the chef floor. */
export const STEP_HEIGHT = 0.2;
export const WORK_COUNTER_TOP = 0.75;
export const TSUKEDAI_TOP = 0.78;
/** Customer counter height above the customer floor. */
export const CUSTOMER_COUNTER_HEIGHT = 0.75;
export const SINK_TOP = 0.8;
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
export const CABINET_WIDTH = 0.7;
export const CABINET_DEPTH = 0.4;
export const CABINET_HEIGHT = 1.8;
export const CABINET_GAP = 0.03;
/** Stainless work table, then a commercial gas range, on the sink's right (seen facing the sink). */
export const WORKTABLE_WIDTH = 0.4;
/** Gas range: four burners over an oven with a side cupboard on each side. */
export const RANGE_WIDTH = 0.7;
/** Height of the range's top frame (the grates sit just above it). */
export const RANGE_HEIGHT = 0.8;
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
/** Glass-door dish cabinet, in the same row as the sink, against the back wall. */
export const CABINET_X = SINK_UNIT_X + SINK_WIDTH / 2 + CABINET_GAP + CABINET_WIDTH / 2;
export const CABINET_Z = BACK_WALL_Z - CABINET_DEPTH / 2;
export const WORKTABLE_X = SINK_UNIT_X - SINK_WIDTH / 2 - BACK_ROW_GAP - WORKTABLE_WIDTH / 2;
export const STOVE_X = WORKTABLE_X - WORKTABLE_WIDTH / 2 - BACK_ROW_GAP - RANGE_WIDTH / 2;

type Vec3 = [number, number, number];
export interface NodeLayout {
  position: Vec3;
  /** Station zone fields to write into the node's Station component. */
  station?: { width?: number; depth?: number; height?: number };
}

const SAKU_Z = NETA_CASE_Z + 0.03;
const SAKU_Y = TSUKEDAI_TOP + 0.055;
const DISH_Z = MANAITA_Z - 0.1;

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
  'wasabi-dish': { position: [0.24, MANAITA_TOP, DISH_Z] },
  'tezu-bowl': { position: [0.4, MANAITA_TOP, DISH_Z] },
  knife: { position: [0.57, WORK_COUNTER_TOP, MANAITA_Z + 0.03] },
  'wet-cloth': { position: [0.66, WORK_COUNTER_TOP, MANAITA_NEAR_Z - 0.06] },
  ledge: { position: [0, 0, TSUKEDAI_CHEF_Z - TSUKEDAI_DEPTH / 2] },
  'neta-case': {
    position: [0, TSUKEDAI_TOP, NETA_CASE_Z],
    station: { depth: NETA_CASE_DEPTH },
  },
  'saku-tuna': { position: [-0.28, SAKU_Y, SAKU_Z] },
  'saku-white': { position: [0, SAKU_Y, SAKU_Z] },
  'saku-silver': { position: [0.28, SAKU_Y, SAKU_Z] },
  geta: { position: [0, TSUKEDAI_TOP, GETA_Z] },
  'customer-counter': {
    position: [0, -STEP_HEIGHT, TSUKEDAI_CUSTOMER_Z - CUSTOMER_COUNTER_DEPTH / 2],
  },
  'sink-unit': { position: [SINK_UNIT_X, 0, SINK_UNIT_Z] },
  sink: {
    position: [SINK_BASIN_X, SINK_TOP, SINK_ZONE_Z],
    station: { width: SINK_BASIN_WIDTH, depth: SINK_ZONE_DEPTH },
  },
  soap: {
    position: [SINK_BASIN_X - SINK_BASIN_WIDTH / 2 - SINK_END_STRIP / 2, SINK_TOP, BACK_ROW_Z + 0.045],
  },
  towel: { position: [SINK_BASIN_X + SINK_BASIN_WIDTH / 2 + 0.12, SINK_TOP, BACK_ROW_Z + 0.08] },
  'dish-cabinet': { position: [CABINET_X, 0, CABINET_Z] },
  'work-table': { position: [WORKTABLE_X, 0, SINK_UNIT_Z] },
  'gas-stove': { position: [STOVE_X, 0, SINK_UNIT_Z] },
  eaves: { position: [0, 0, EAVES_Z] },
  'itaba-room': { position: [0, 0, 0] },
};
