import { CanvasTexture, Sprite, SpriteMaterial } from '@iwsdk/core';
import { MENU, type MenuId, NETA, type NetaDef } from './menu.js';

/**
 * Order cards: a small picture of the ordered item drawn from its look in
 * src/menu.ts (the neta's colours and pattern on rice, a gunkan, a pouch or
 * a roll), its English name on up to two lines, and whether it comes with
 * wasabi. One card above the customer, one ticket on the neta case; each
 * keeps its canvas and is redrawn when the order changes.
 */

const W = 384;
const H = 192;

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The neta lying on top: its colour plus the pattern that tells it apart. */
function drawTopping(ctx: CanvasRenderingContext2D, def: NetaDef, x: number, y: number, w: number, h: number): void {
  const { color, color2, pattern } = def.look;
  ctx.save();
  round(ctx, x, y, w, h, h * 0.45);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = color2;
  ctx.strokeStyle = color2;
  switch (pattern) {
    case 'fatLight':
    case 'fatHeavy': {
      ctx.lineWidth = pattern === 'fatHeavy' ? 5 : 3;
      const n = pattern === 'fatHeavy' ? 7 : 4;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(x + ((i + 0.5) * w) / n - 12, y + h);
        ctx.quadraticCurveTo(x + ((i + 0.5) * w) / n, y + h / 2, x + ((i + 0.5) * w) / n + 14, y);
        ctx.stroke();
      }
      break;
    }
    case 'skinSilver':
    case 'yellowLine':
    case 'mackerel':
      ctx.fillRect(x, y + h * 0.62, w, h * 0.38);
      if (pattern === 'yellowLine') {
        ctx.fillStyle = '#E3C13B';
        ctx.fillRect(x, y + h * 0.76, w, 3);
      } else {
        ctx.strokeStyle = '#3D4A57';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.moveTo(x + (i * w) / 6, y + h * 0.66);
          ctx.lineTo(x + (i * w) / 6 + 10, y + h);
          ctx.stroke();
        }
      }
      break;
    case 'bloodLine':
      ctx.fillRect(x, y + h * 0.55, w, h * 0.18);
      break;
    case 'spots':
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.arc(x + 10 + (i * (w - 20)) / 8, y + h * (i % 2 ? 0.35 : 0.6), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'stripes':
      for (let i = 0; i < 5; i++) ctx.fillRect(x + ((i + 0.3) * w) / 5, y, w / 12, h);
      break;
    case 'tip':
      ctx.fillRect(x + w * 0.55, y, w * 0.45, h);
      break;
    case 'rim':
      ctx.lineWidth = 6;
      round(ctx, x, y, w, h, h * 0.45);
      ctx.stroke();
      break;
    case 'glaze':
    case 'layers':
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y + (i * h) / 4);
        ctx.lineTo(x + w, y + (i * h) / 4);
        ctx.stroke();
      }
      break;
    case 'core':
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, h * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

/** A small picture of the item, in the box x, y, w, h. */
function drawItem(ctx: CanvasRenderingContext2D, item: MenuId, x: number, y: number, w: number, h: number): void {
  const m = MENU[item];
  const rice = '#F6F2EA';
  if (m.kind === 'nigiri') {
    ctx.fillStyle = rice;
    round(ctx, x + w * 0.08, y + h * 0.42, w * 0.84, h * 0.48, h * 0.22);
    ctx.fill();
    drawTopping(ctx, NETA[m.neta[0]], x, y + h * 0.12, w, h * 0.46);
  } else if (m.kind === 'gunkan') {
    ctx.fillStyle = '#1E2A22';
    round(ctx, x + w * 0.1, y + h * 0.3, w * 0.8, h * 0.6, 10);
    ctx.fill();
    ctx.fillStyle = NETA[m.neta[0]].look.color;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(x + w * (0.2 + (i % 5) * 0.15), y + h * (0.26 + Math.floor(i / 5) * 0.1), h * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (m.kind === 'inari') {
    ctx.fillStyle = NETA[m.neta[0]].look.color;
    round(ctx, x + w * 0.05, y + h * 0.25, w * 0.9, h * 0.6, h * 0.28);
    ctx.fill();
  } else {
    // A roll's cut face: nori ring, rice, the filling(s) in the middle.
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) * 0.45;
    ctx.fillStyle = '#1E2A22';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rice;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
    ctx.fill();
    m.neta.forEach((n, i) => {
      ctx.fillStyle = NETA[n].look.color;
      ctx.beginPath();
      ctx.arc(cx + (i - (m.neta.length - 1) / 2) * r * 0.45, cy, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/** Splits a name into at most two lines that fit the width, shrinking the font only if a word will not fit. */
function drawName(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, width: number): void {
  let px = 38;
  const words = name.split(' ');
  let lines: string[] = [];
  for (; px >= 24; px -= 2) {
    ctx.font = `bold ${px}px sans-serif`;
    lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= width)) break;
  }
  ctx.fillStyle = '#2B2118';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, x, y + i * (px + 6)));
}

function draw(canvas: HTMLCanvasElement, item: MenuId, wasabi: boolean): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#FBF7EE';
  round(ctx, 4, 4, W - 8, H - 8, 18);
  ctx.fill();
  ctx.strokeStyle = '#7A5A3A';
  ctx.lineWidth = 4;
  ctx.stroke();
  drawItem(ctx, item, 18, 24, 140, 140);
  drawName(ctx, MENU[item].name, 172, 62, W - 190);
  // Wasabi: a green dab, or a grey one struck through.
  const wx = 190;
  const wy = 150;
  ctx.fillStyle = wasabi ? '#6B9E3A' : '#B9B4AA';
  ctx.beginPath();
  ctx.arc(wx, wy, 13, 0, Math.PI * 2);
  ctx.fill();
  if (!wasabi) {
    ctx.strokeStyle = '#5B5348';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(wx - 15, wy + 15);
    ctx.lineTo(wx + 15, wy - 15);
    ctx.stroke();
  }
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = '#5B5348';
  ctx.textAlign = 'left';
  ctx.fillText(wasabi ? 'wasabi' : 'no wasabi', wx + 24, wy + 1);
}

/** A card sprite `width` metres wide (redraw it with redrawOrderCard). */
export function makeOrderCard(item: MenuId, wasabi: boolean, width: number): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  draw(canvas, item, wasabi);
  const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), depthTest: false, transparent: true }));
  sprite.scale.set(width, (width * H) / W, 1);
  sprite.renderOrder = 900;
  sprite.name = 'OrderCard';
  return sprite;
}

export function redrawOrderCard(sprite: Sprite, item: MenuId, wasabi: boolean): void {
  const texture = sprite.material.map as CanvasTexture;
  draw(texture.image as HTMLCanvasElement, item, wasabi);
  texture.needsUpdate = true;
}
