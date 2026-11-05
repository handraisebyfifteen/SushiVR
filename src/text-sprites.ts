import { CanvasTexture, Sprite, SpriteMaterial } from '@iwsdk/core';

/**
 * Small text and icon sprites drawn on a canvas with the browser's default
 * font and plain shapes, so the app ships no font or image files.
 */

export function makeTextSprite(
  text: string,
  options: { color?: string; background?: string; width?: number; fontPx?: number } = {},
): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
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

/** Order card: a tile in the fish's color plus a wasabi mark (dot, or dot with a slash). */
export function makeOrderSprite(fishColor: string, wasabi: boolean): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = fishColor;
  ctx.fillRect(10, 12, 52, 40);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 12, 52, 40);
  ctx.fillStyle = wasabi ? '#6B9E3A' : '#BBBBBB';
  ctx.beginPath();
  ctx.arc(94, 32, 14, 0, Math.PI * 2);
  ctx.fill();
  if (!wasabi) {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(80, 46);
    ctx.lineTo(108, 18);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(0.16, 0.08, 1);
  sprite.renderOrder = 900;
  sprite.name = 'OrderCard';
  return sprite;
}

/** A curved arrow pointing to the viewer's left: "look left to turn around". */
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

/**
 * Order ticket shown inside the neta case while a door is open: the fish as
 * a tile with its look (stripes for the silver-skinned fish, a pink tint and
 * outline for white fish), its English name, and whether wasabi goes on.
 */
export function makeOrderTicket(fishName: string, fishColor: string, striped: boolean, wasabi: boolean): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,252,244,0.96)';
  ctx.fillRect(0, 0, 384, 160);
  ctx.strokeStyle = '#2B2622';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 380, 156);
  // Fish tile.
  ctx.fillStyle = fishColor;
  ctx.fillRect(18, 28, 120, 104);
  if (striped) {
    ctx.fillStyle = '#3F5266';
    for (let i = 0; i < 5; i++) ctx.fillRect(26 + i * 23, 28, 9, 104);
  }
  ctx.strokeStyle = '#2B2622';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 28, 120, 104);
  // Name and wasabi.
  ctx.fillStyle = '#1E1A17';
  ctx.textBaseline = 'middle';
  let fontPx = 40;
  ctx.font = `bold ${fontPx}px sans-serif`;
  const room = 384 - 160 - 14;
  const measured = ctx.measureText(fishName).width;
  if (measured > room) {
    fontPx = Math.floor((fontPx * room) / measured);
    ctx.font = `bold ${fontPx}px sans-serif`;
  }
  ctx.fillText(fishName, 160, 58);
  ctx.fillStyle = wasabi ? '#4F7F25' : '#8A8A8A';
  ctx.beginPath();
  ctx.arc(176, 112, 13, 0, Math.PI * 2);
  ctx.fill();
  if (!wasabi) {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(163, 125);
    ctx.lineTo(189, 99);
    ctx.stroke();
  }
  ctx.fillStyle = '#1E1A17';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(wasabi ? 'Wasabi' : 'No wasabi', 200, 113);
  const texture = new CanvasTexture(canvas);
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(0.15, 0.0625, 1);
  sprite.renderOrder = 905;
  sprite.name = 'OrderTicket';
  return sprite;
}
