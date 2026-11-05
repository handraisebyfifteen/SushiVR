import { BoxGeometry, Group, Matrix4, MeshStandardMaterial } from '@iwsdk/core';
import {
  BAR_LENGTH,
  EAVES_BACK_OVERLAP,
  EAVES_DEPTH,
  EAVES_HEIGHT,
  EAVES_RISE,
  EAVES_Z,
  LANTERN_ALONG,
  LANTERN_COUNT,
  LANTERN_DROP,
  LANTERN_HEIGHT,
  LANTERN_WIDTH,
  NOREN_LENGTH,
  NOREN_PANELS,
  TILE_PITCH,
  TSUKEDAI_CHEF_Z,
} from '../layout.js';
import { type BoxPart, boxBatch, instances, mergeBoxes } from './lib/batch.js';

/**
 * Eaves (hisashi) over the tsukedai: the light lean-to roof left over from
 * the sushi stall (yatai) days. Two timber posts at the ends of the bar carry
 * a beam; rafters run from the beam back to the room's header wall, under a
 * roof board covered with a row of long tiles. A short plain noren hangs from
 * the front edge and paper lanterns (andon) hang from the roof,
 * toward the customer side.
 *
 * Origin: chef floor (y = 0) on the post line, which the scene puts at the
 * tsukedai's centre line (layout EAVES_Z). The roof slopes down toward -Z
 * (the customers). Draw calls: timber, tiles, noren, lantern frames, lantern
 * paper: five in all, because every repeated part is an instance.
 */

const timber = new MeshStandardMaterial({ color: '#6E4C30', roughness: 0.75 });
const tile = new MeshStandardMaterial({ color: '#4A4F56', roughness: 0.55, metalness: 0.15 });
const noren = new MeshStandardMaterial({ color: '#24365A', roughness: 1.0 });
const lanternWood = new MeshStandardMaterial({ color: '#3B2A1E', roughness: 0.5 });
/** Lantern paper only looks lit (emissive); it is not a light source. */
const lanternPaper = new MeshStandardMaterial({
  color: '#FFF1D6',
  emissive: '#FFB04A',
  emissiveIntensity: 1.3,
  roughness: 0.9,
});

const ROOF_WIDTH = BAR_LENGTH + 0.3;
const TILE_T = 0.014;
const BOARD_T = 0.018;
const RAFTER_H = 0.04;
const BEAM_H = 0.12;

export function createEaves(): Group {
  const root = new Group();
  root.name = 'Eaves';

  // Roof line in local coordinates: back edge near the chef, front edge
  // toward the customers, EAVES_RISE lower.
  const zBack = TSUKEDAI_CHEF_Z + EAVES_BACK_OVERLAP - EAVES_Z;
  const zFront = zBack - EAVES_DEPTH;
  const yBack = EAVES_HEIGHT + BEAM_H + 0.13;
  const yFront = yBack - EAVES_RISE;
  const theta = Math.atan2(EAVES_RISE, EAVES_DEPTH);
  const L = Math.hypot(EAVES_RISE, EAVES_DEPTH);
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  /** A point `s` down the slope from the back edge, `below` under the roof top. */
  const at = (s: number, below: number): [number, number] => [
    yBack - s * sin - below * cos,
    zBack - s * cos + below * sin,
  ];
  const slope = (w: number, h: number, len: number, x: number, s: number, below: number): BoxPart => {
    const [y, z] = at(s, below);
    return { w, h, d: len, x, y, z, rx: -theta };
  };

  // --- timber frame: posts, beam, back ledger, rafters, roof board, fascia, noren rod ---
  const postX = BAR_LENGTH / 2 + 0.06;
  const wood: BoxPart[] = [
    { w: 0.09, h: EAVES_HEIGHT + 0.05, d: 0.09, x: -postX, y: (EAVES_HEIGHT + 0.05) / 2, z: 0 },
    { w: 0.09, h: EAVES_HEIGHT + 0.05, d: 0.09, x: postX, y: (EAVES_HEIGHT + 0.05) / 2, z: 0 },
    { w: ROOF_WIDTH - 0.1, h: BEAM_H, d: 0.09, x: 0, y: EAVES_HEIGHT + BEAM_H / 2, z: 0 },
    slope(ROOF_WIDTH, 0.05, 0.04, 0, 0.03, TILE_T + BOARD_T + 0.025),
    slope(ROOF_WIDTH, BOARD_T, L, 0, L / 2, TILE_T + BOARD_T / 2),
  ];
  const rafters = 9;
  for (let i = 0; i < rafters; i++) {
    const x = -ROOF_WIDTH / 2 + 0.06 + (i * (ROOF_WIDTH - 0.12)) / (rafters - 1);
    wood.push(slope(0.035, RAFTER_H, L + 0.02, x, L / 2, TILE_T + BOARD_T + RAFTER_H / 2));
  }
  wood.push({ w: ROOF_WIDTH, h: 0.07, d: 0.02, x: 0, y: yFront - 0.05, z: zFront + 0.005 });
  const rodY = yFront - 0.1;
  const rodZ = zFront + 0.03;
  wood.push({ w: BAR_LENGTH + 0.16, h: 0.022, d: 0.022, x: 0, y: rodY, z: rodZ });
  for (const sx of [-1, 1]) {
    wood.push({ w: 0.02, h: 0.06, d: 0.02, x: sx * (BAR_LENGTH / 2 + 0.05), y: rodY + 0.03, z: rodZ });
  }
  root.add(boxBatch('EavesTimber', timber, wood));

  // --- tiles: alternating flat and raised rows down the slope, plus ridge and eave edge ---
  const tiles: BoxPart[] = [];
  const count = Math.round(ROOF_WIDTH / TILE_PITCH);
  for (let i = 0; i < count; i++) {
    const x = -ROOF_WIDTH / 2 + TILE_PITCH * (i + 0.5);
    tiles.push(
      i % 2 === 0
        ? slope(TILE_PITCH - 0.006, TILE_T, L + 0.03, x, L / 2 + 0.015, TILE_T / 2)
        : slope(TILE_PITCH * 0.55, TILE_T + 0.014, L + 0.03, x, L / 2 + 0.015, TILE_T / 2 - 0.007),
    );
  }
  tiles.push(slope(ROOF_WIDTH + 0.04, 0.04, 0.06, 0, 0.03, -0.012));
  tiles.push(slope(ROOF_WIDTH + 0.04, 0.03, 0.035, 0, L + 0.02, TILE_T / 2));
  root.add(boxBatch('RoofTiles', tile, tiles));

  // --- noren: plain panels with slits, hung from the rod at the front edge ---
  const span = BAR_LENGTH + 0.1;
  const slit = 0.015;
  const panelW = (span - slit * (NOREN_PANELS - 1)) / NOREN_PANELS;
  const panel = new BoxGeometry(panelW, NOREN_LENGTH, 0.004);
  const panelMats: Matrix4[] = [];
  for (let i = 0; i < NOREN_PANELS; i++) {
    const x = -span / 2 + panelW / 2 + i * (panelW + slit);
    const m = new Matrix4().makeRotationX(0.03);
    m.setPosition(x, rodY - 0.012 - NOREN_LENGTH / 2, rodZ);
    panelMats.push(m);
  }
  root.add(instances('Noren', panel, noren, panelMats));

  // --- paper lanterns: one frame shape and one paper box, instanced along the beam ---
  const W = LANTERN_WIDTH;
  const H = LANTERN_HEIGHT;
  const e = W / 2 - 0.007;
  const frameParts: BoxPart[] = [
    { w: 0.006, h: LANTERN_DROP, d: 0.006, x: 0, y: LANTERN_DROP / 2, z: 0 },
    { w: W * 0.7, h: 0.012, d: 0.012, x: 0, y: 0.004, z: 0 },
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      frameParts.push({ w: 0.014, h: H + 0.02, d: 0.014, x: sx * e, y: -H / 2, z: sz * e });
    }
  }
  for (const [y, t] of [[-0.008, 0.016], [-H * 0.55, 0.008], [-H + 0.008, 0.016]] as const) {
    for (const s of [-1, 1]) {
      frameParts.push({ w: W, h: t, d: 0.012, x: 0, y, z: s * e });
      frameParts.push({ w: 0.012, h: t, d: W, x: s * e, y, z: 0 });
    }
  }
  const frame = mergeBoxes(frameParts);
  const paper = new BoxGeometry(W - 0.012, H - 0.03, W - 0.012).translate(0, -H / 2, 0);
  // Cords hang from the roof board's underside, between the rafters.
  const lanternZ = zBack - EAVES_DEPTH * LANTERN_ALONG;
  const [underY] = at((zBack - lanternZ) / cos, TILE_T + BOARD_T);
  const topY = underY - LANTERN_DROP;
  const lanternMats: Matrix4[] = [];
  for (let k = 0; k < LANTERN_COUNT; k++) {
    const x = -BAR_LENGTH / 2 + (BAR_LENGTH * (k + 0.5)) / LANTERN_COUNT;
    lanternMats.push(new Matrix4().makeTranslation(x, topY, lanternZ));
  }
  root.add(instances('LanternFrames', frame, lanternWood, lanternMats));
  root.add(instances('LanternPaper', paper, lanternPaper, lanternMats));
  return root;
}
