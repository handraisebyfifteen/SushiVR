import { CanvasTexture, createSystem, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { MENU_BOARD } from './menu.js';
import { MENU_PLAQUE_FACE_Z, MENU_PLAQUE_HEIGHT, MENU_PLAQUE_PITCH } from './scene-assets/menu-board.scene-asset.js';

/** Pixels per plaque across, and the canvas height that keeps the letters square. */
const COL = 96;
const ROWS = Math.round((COL * MENU_PLAQUE_HEIGHT) / MENU_PLAQUE_PITCH);
const FONT = '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif CJK JP", "Noto Serif JP", serif';

/** The name runs from this far below the plaque's top, over at most this much of its height (pixels). */
const TOP = 24;
const SPAN = ROWS - 2 * TOP;
const MAX_SIZE = 76;

/**
 * Writes the menu board (お品書き): each plaque's name in Japanese, top
 * down, in black on the wood. No prices on the plaques: the game has no
 * money (the check is the cashier's, off-screen). Short names are spaced
 * out down the plaque. The lettering uses the device's own Japanese serif
 * font (no font file is shipped); it is one canvas over all the plaques,
 * drawn once.
 */
export class MenuBoardSystem extends createSystem({}) {
  private done = false;

  update(): void {
    if (this.done) return;
    // A placed asset's root takes the scene node's name: find it by its frame.
    const board = this.world.scene.getObjectByName('MenuBoardFrame')?.parent;
    if (!board) return;
    this.done = true;
    const n = MENU_BOARD.length;
    const canvas = document.createElement('canvas');
    canvas.width = n * COL;
    canvas.height = ROWS;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1A120C';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    MENU_BOARD.forEach(({ ja }, i) => {
      // Read right to left: the first plaque is the rightmost column.
      const cx = (n - 1 - i + 0.5) * COL;
      const name = [...ja];
      const size = Math.min(MAX_SIZE, Math.floor(SPAN / name.length));
      const step = Math.min(size * 1.5, SPAN / name.length);
      ctx.font = `bold ${size}px ${FONT}`;
      name.forEach((ch, k) => ctx.fillText(ch, cx, TOP + step * k + size / 2));
    });
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const letters = new Mesh(
      new PlaneGeometry(n * MENU_PLAQUE_PITCH, MENU_PLAQUE_HEIGHT),
      new MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 0.7 }),
    );
    letters.name = 'MenuLettering';
    // The plane faces +Z; the board's front is -Z (its right end, seen from the front, is then the canvas's right).
    letters.rotation.y = Math.PI;
    letters.position.z = MENU_PLAQUE_FACE_Z - 0.0008;
    board.add(letters);
    console.log(`[Menu] the menu board is written: ${n} plaques`);
  }
}
