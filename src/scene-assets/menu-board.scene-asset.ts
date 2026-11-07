import { Group, Mesh, MeshStandardMaterial } from '@iwsdk/core';
import { MENU_BOARD } from '../menu.js';
import { type BoxPart, mergeBoxes } from './lib/batch.js';
import { seeded } from './lib/neta-paint.js';

/** One plaque's pitch and height, and how far its face stands off the wall (for the system's lettering). */
export const MENU_PLAQUE_PITCH = 0.065;
export const MENU_PLAQUE_HEIGHT = 0.3;
export const MENU_PLAQUE_FACE_Z = -0.026;
const FRAME = 0.035;

const frameWood = new MeshStandardMaterial({ color: '#4A3020', roughness: 0.7 });
const plaqueWood = new MeshStandardMaterial({ color: '#D9BE8C', roughness: 0.75 });
const plaqueWoodDark = new MeshStandardMaterial({ color: '#CBAE7A', roughness: 0.75 });

/** Board-local x of plaque i (the first at the right end as seen from the front). */
export function menuPlaqueX(i: number): number {
  return -((MENU_BOARD.length * MENU_PLAQUE_PITCH) / 2 - (i + 0.5) * MENU_PLAQUE_PITCH);
}

/**
 * The menu board (お品書き): a row of tall wooden plaques side by side in a
 * dark frame, one per menu item (MENU_BOARD in src/menu.ts), the first on
 * the right as seen from the front (it is read right to left). Two slightly
 * different woods alternate at random. The lettering is written on at
 * runtime (src/menu-board-system.ts). Origin: wall contact at the board's
 * middle; front -Z.
 */
export function createMenuBoard(): Group {
  const root = new Group();
  root.name = 'MenuBoard';
  const n = MENU_BOARD.length;
  const w = n * MENU_PLAQUE_PITCH;
  const W = w + 2 * FRAME;
  const H = MENU_PLAQUE_HEIGHT + 2 * FRAME;
  const frame: BoxPart[] = [
    { w: W, h: H, d: 0.012, x: 0, y: 0, z: -0.006 },
    { w: W, h: FRAME, d: 0.035, x: 0, y: (H - FRAME) / 2, z: -0.0175 },
    { w: W, h: FRAME, d: 0.035, x: 0, y: -(H - FRAME) / 2, z: -0.0175 },
    { w: FRAME, h: H - 2 * FRAME, d: 0.035, x: (W - FRAME) / 2, y: 0, z: -0.0175 },
    { w: FRAME, h: H - 2 * FRAME, d: 0.035, x: -(W - FRAME) / 2, y: 0, z: -0.0175 },
  ];
  const f = new Mesh(mergeBoxes(frame), frameWood);
  // Named for the system that letters the board (a placed asset's root takes the scene node's name).
  f.name = 'MenuBoardFrame';
  const rnd = seeded('menu-board');
  const light: BoxPart[] = [];
  const dark: BoxPart[] = [];
  for (let i = 0; i < n; i++) {
    // The first plaque at the right end as seen from the front (-X).
    const part = { w: MENU_PLAQUE_PITCH - 0.004, h: MENU_PLAQUE_HEIGHT - 0.004, d: 0.014, x: menuPlaqueX(i), y: 0, z: -0.019 };
    (rnd() < 0.5 ? light : dark).push(part);
  }
  const a = new Mesh(mergeBoxes(light), plaqueWood);
  a.name = 'Plaques';
  const b = new Mesh(mergeBoxes(dark), plaqueWoodDark);
  b.name = 'PlaquesDark';
  root.add(f, a, b);
  return root;
}
