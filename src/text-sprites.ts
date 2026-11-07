import { CanvasTexture, Sprite, SpriteMaterial } from '@iwsdk/core';

/**
 * Small text and icon sprites drawn on a canvas with the browser's default
 * font and plain shapes, so the app ships no font or image files.
 */

type TextOptions = { color?: string; background?: string; width?: number; fontPx?: number };

function drawText(canvas: HTMLCanvasElement, text: string, options: TextOptions): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  let fontPx = options.fontPx ?? 72;
  ctx.font = `bold ${fontPx}px sans-serif`;
  // Shrink long words so they fit the canvas.
  const measured = ctx.measureText(text).width;
  if (measured > canvas.width - 32) {
    fontPx = Math.floor((fontPx * (canvas.width - 32)) / measured);
    ctx.font = `bold ${fontPx}px sans-serif`;
  }
  ctx.fillStyle = options.color ?? '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

/** Redraws a sprite made by makeTextSprite with new text (same canvas, no new texture). */
export function setSpriteText(sprite: Sprite, text: string, options: TextOptions = {}): void {
  const texture = sprite.material.map as CanvasTexture | null;
  if (!texture) return;
  drawText(texture.image as HTMLCanvasElement, text, options);
  texture.needsUpdate = true;
  sprite.name = `Text_${text}`;
}

export function makeTextSprite(text: string, options: TextOptions = {}): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  drawText(canvas, text, options);
  const texture = new CanvasTexture(canvas);
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  const w = options.width ?? 0.16;
  sprite.scale.set(w, w / 4, 1);
  sprite.renderOrder = 900;
  sprite.name = `Text_${text}`;
  return sprite;
}

export type IconKind =
  | 'rhythm'
  | 'fish'
  | 'wasabi'
  | 'orientation'
  | 'hand'
  | 'fresh'
  | 'hygiene'
  | 'knife'
  | 'board'
  | 'soap';

/** 64x64 glyphs for penalty reasons, drawn with canvas shapes only. */
export function makeIconSprite(kind: IconKind): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(40,20,20,0.85)';
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#F2B134';
  ctx.fillStyle = '#F2B134';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  switch (kind) {
    case 'rhythm': // a note
      ctx.beginPath();
      ctx.arc(26, 42, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(33, 42);
      ctx.lineTo(33, 16);
      ctx.lineTo(44, 20);
      ctx.stroke();
      break;
    case 'fish': // a fish outline
      ctx.beginPath();
      ctx.ellipse(28, 32, 14, 8, 0, 0, Math.PI * 2);
      ctx.moveTo(42, 32);
      ctx.lineTo(52, 24);
      ctx.lineTo(52, 40);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'wasabi': // a green mound with a cross
      ctx.fillStyle = '#6B9E3A';
      ctx.beginPath();
      ctx.ellipse(32, 36, 14, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(18, 18);
      ctx.lineTo(46, 46);
      ctx.stroke();
      break;
    case 'orientation': // a curved arrow
      ctx.beginPath();
      ctx.arc(32, 32, 14, Math.PI * 0.2, Math.PI * 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(44, 14);
      ctx.lineTo(46, 26);
      ctx.lineTo(34, 24);
      ctx.closePath();
      ctx.fill();
      break;
    case 'hand': // a palm with fingers
      ctx.fillRect(22, 30, 20, 18);
      for (let i = 0; i < 4; i++) ctx.fillRect(22 + i * 5, 16, 3.5, 16);
      ctx.fillRect(14, 30, 8, 4);
      break;
    case 'fresh': // a clock
      ctx.beginPath();
      ctx.arc(32, 32, 15, 0, Math.PI * 2);
      ctx.moveTo(32, 32);
      ctx.lineTo(32, 20);
      ctx.moveTo(32, 32);
      ctx.lineTo(41, 36);
      ctx.stroke();
      break;
    case 'hygiene': // a drop
      ctx.beginPath();
      ctx.moveTo(32, 14);
      ctx.bezierCurveTo(44, 30, 46, 40, 32, 50);
      ctx.bezierCurveTo(18, 40, 20, 30, 32, 14);
      ctx.fill();
      break;
    case 'knife': // a blade
      ctx.beginPath();
      ctx.moveTo(14, 44);
      ctx.lineTo(44, 18);
      ctx.lineTo(50, 24);
      ctx.lineTo(24, 46);
      ctx.closePath();
      ctx.fill();
      break;
    case 'board': // a board with specks
      ctx.strokeRect(14, 22, 36, 22);
      ctx.fillRect(22, 30, 4, 4);
      ctx.fillRect(34, 34, 4, 4);
      ctx.fillRect(40, 27, 4, 4);
      break;
    case 'soap': // a bottle
      ctx.fillRect(24, 26, 16, 24);
      ctx.fillRect(29, 16, 6, 10);
      ctx.fillRect(29, 14, 14, 4);
      break;
  }
  const texture = new CanvasTexture(canvas);
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(0.05, 0.05, 1);
  sprite.renderOrder = 901;
  sprite.name = `Icon_${kind}`;
  return sprite;
}

/** A curved arrow pointing to the viewer's left: "turn around" (to the sink behind). */
export function makeTurnArrowSprite(): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = '#FFF6E0';
  ctx.fillStyle = '#FFF6E0';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(70, 70, 38, Math.PI * 1.05, Math.PI * 1.95, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(14, 74);
  ctx.lineTo(44, 74);
  ctx.lineTo(30, 46);
  ctx.closePath();
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(0.08, 0.08, 1);
  sprite.renderOrder = 902;
  sprite.name = 'TurnArrow';
  return sprite;
}

