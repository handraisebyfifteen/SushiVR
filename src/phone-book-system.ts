import {
  CanvasTexture,
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { cycleDisplay, display, DISPLAY_ROWS, type DisplayKey, displayValueText } from './display-settings.js';
import { fishOrder, type Supplier } from './fish-order.js';
import { fishOrderApi } from './fish-order-system.js';
import { chef, holdingAnything, prep, staff } from './game-state.js';
import { handedness, setLeftHanded } from './handedness.js';
import { hands } from './hands.js';
import { officeApi } from './office-system.js';
import { canAskCookRice, noriSheetsLeft, orderWords, pantry, pantryOn, riceText } from './pantry.js';
import { pantryApi } from './pantry-system.js';
import { phoneApi } from './phone-system.js';
import { playPress } from './sfx.js';
import { stations } from './station-system.js';
import { Held, StationKind } from './sushi-components.js';
import { NORI_PER_PACK, RICE_SACK_KG } from './tuning.js';

/**
 * The play mode as the phone's Settings shows it. The mode system fills
 * these in (its choices, labels and when they may change); the card only
 * reads them, so the modes can change without touching the card.
 */
export interface PlayModeChoice {
  id: string;
  label: string;
}
export const playModeSource = {
  choices: (): readonly PlayModeChoice[] => [
    { id: 'easy', label: 'Easy' },
    { id: 'full', label: 'Full' },
  ],
  current: (): string => fishOrder.difficulty,
  choose: (id: string): void => {
    if (id !== fishOrder.difficulty) fishOrderApi.toggle();
  },
  /** Changes only in the morning, before the fish shop is called. */
  canChange: (): boolean => fishOrderApi.canSwitch(),
};

type Page = 'lines' | 'settings' | 'display' | 'rice' | 'cookRice';
export type PhoneRowId =
  | 'fish'
  | 'greengrocer'
  | 'riceShop'
  | 'cook'
  | 'cookRice'
  | 'partTimer'
  | 'settings'
  | 'hangUp'
  | 'playMode'
  | 'hands'
  | 'display'
  | 'back'
  | 'riceSacks'
  | 'noriPacks'
  | 'riceCall'
  | 'cook1'
  | 'cook15'
  | DisplayKey;

/** The most the card orders at once: sacks of rice, packs of nori. */
const MAX_SACKS = 3;
const MAX_PACKS = 5;

interface Row {
  id: PhoneRowId;
  label: string;
  value: string;
  enabled: boolean;
}

/** The card: this wide, a header and up to this many lines of this height (m). */
const W = 0.26;
const HEADER = 0.045;
const ROW_H = 0.03;
const MAX_ROWS = 10;
const H = HEADER + MAX_ROWS * ROW_H;
const PX_PER_M = 2600;
/** Where the card stands: over the board's middle, its top this high, leaning back. */
const CARD_UP = 0.4;
const CARD_BACK = -0.02;
const CARD_LEAN = -0.25;
/** A pinch counts this close to the card's face (m), and not again for this long. */
const PINCH_DEPTH = 0.06;
const PINCH_GAP = 0.35;

const INK = '#2B2118';
const PAPER = '#F3EDDC';
const FADED = '#A89F8E';
const LIT = '#FFE08A';

/** What other systems (the practice keys, the master) may ask of the card. */
export const phoneBookApi = {
  /** World point of a line on the card now (false if it is not shown). */
  rowAt: (_id: PhoneRowId, _out: Vector3): boolean => false,
};

/**
 * The phone book (電話帳): the shop deals with the outside, and its settings,
 * by telephone (the owner, 2026-11-10). Pointing at the phone and pinching
 * lifts the handset (src/office-system.ts, src/phone-system.ts), and this
 * card comes up within reach over the board. A pinch on a line calls it:
 * the fish shop and the greengrocer (the morning, before their orders; the
 * greengrocer only on the full difficulty), the rice shop (its rice and
 * nori, full only, any time: src/pantry.ts), the cook and the part-timer
 * (called in or let off; they took the wall's call buttons' place; during
 * service on full the cook is asked to cook more rice instead), the settings (the play mode and the hands, in the morning; the
 * display, any time) and hanging up. Lines that cannot be used now are faded.
 */
export class PhoneBookSystem extends createSystem({}) {
  private card!: Group;
  private mesh!: Mesh;
  private canvas!: HTMLCanvasElement;
  private texture!: CanvasTexture;
  private page: Page = 'lines';
  private rows: Row[] = [];
  private hover = -1;
  private drawn = '';
  private wasOpen = false;
  private lastPinch = -10;
  private time = 0;
  private readonly local = new Vector3();

  init(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(W * PX_PER_M);
    this.canvas.height = Math.round(H * PX_PER_M);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    // The plane hangs from its top edge, so a shorter page shows only the top of the canvas.
    this.mesh = new Mesh(
      new PlaneGeometry(W, H).translate(0, -H / 2, 0),
      new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.mesh.name = 'PhoneBookCard';
    this.mesh.renderOrder = 940;
    this.card = this.world.createTransformEntity().object3D as Group;
    this.card.name = 'PhoneBook';
    this.card.add(this.mesh);
    this.card.visible = false;
    phoneBookApi.rowAt = (id, out) => {
      if (!this.card.visible) return false;
      const i = this.rows.findIndex((r) => r.id === id);
      if (i < 0) return false;
      out.set(0, -HEADER - (i + 0.5) * ROW_H, 0);
      this.card.localToWorld(out);
      return true;
    };
  }

  update(delta: number): void {
    this.time += delta;
    const open = phoneApi.book;
    // Away from the stool (turned round, at the back row) the call ends.
    if (open && (chef.at !== 'seat' || chef.facingBack)) {
      phoneApi.hangUp();
      return;
    }
    if (open && !this.wasOpen) this.page = 'lines';
    this.wasOpen = open;
    this.card.visible = open;
    if (!open) return;
    this.place();
    this.build();
    this.hover = -1;
    for (let side = 0; side < 2; side++) {
      const row = this.rowUnder(side, false);
      if (row >= 0) this.hover = row;
      if (!hands.all[side].pinchStart || this.time - this.lastPinch <= PINCH_GAP) continue;
      // The line the pinch was aimed at: closing the fingers moves the grasp point.
      const aimed = this.rowUnder(side, true);
      if (aimed < 0) continue;
      this.lastPinch = this.time;
      this.choose(this.rows[aimed]);
      this.build();
      break;
    }
    this.draw();
  }

  /** Over the board's middle, leaning back toward the chef. */
  private place(): void {
    const board = stations.get(StationKind.CuttingBoard);
    if (!board) return;
    this.card.position.set(board.pos.x, board.pos.y + CARD_UP, board.pos.z + CARD_BACK);
    this.card.rotation.set(CARD_LEAN, 0, 0);
    this.card.updateMatrixWorld(true);
  }

  /** The line under this hand's grasp point, or where its pinch was aimed (an empty hand at the card's face), or -1. */
  private rowUnder(side: number, aimed: boolean): number {
    const hand = hands.all[side];
    if (!hand?.tracked || chef.hands[side].holding !== Held.None) return -1;
    if (aimed) hand.pinchPoint(this.local);
    else this.local.copy(hand.grasp);
    this.card.worldToLocal(this.local);
    if (Math.abs(this.local.z) > PINCH_DEPTH || Math.abs(this.local.x) > W / 2) return -1;
    const i = Math.floor((-this.local.y - HEADER) / ROW_H);
    return i >= 0 && i < this.rows.length ? i : -1;
  }

  /** The lines of the page as things are now. */
  private build(): void {
    const rows: Row[] = [];
    if (this.page === 'lines') {
      rows.push({ id: 'fish', label: 'Fish shop', value: this.shopValue('fish'), enabled: phoneApi.canDial('fish') });
      rows.push({ id: 'greengrocer', label: 'Greengrocer', value: this.shopValue('greengrocer'), enabled: phoneApi.canDial('greengrocer') });
      rows.push({ id: 'riceShop', label: 'Rice shop (rice, nori)', value: pantryOn() ? (pantry.comingIn > 0 ? 'on its way' : '>') : 'comes as usual', enabled: pantryOn() });
      if (pantryOn() && chef.open) {
        const s = Math.ceil(pantry.cookLeft);
        rows.push({ id: 'cookRice', label: 'Cook: more rice', value: pantry.cookLeft > 0 ? `cooking ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '>', enabled: pantry.cookLeft <= 0 });
      } else {
        rows.push({ id: 'cook', label: 'Cook', value: staff.cook ? 'IN: let off' : 'call in', enabled: officeApi.canAsk('cook') });
      }
      rows.push({ id: 'partTimer', label: 'Part-timer', value: staff.partTimer ? 'IN: let off' : 'call in', enabled: officeApi.canAsk('partTimer') });
      rows.push({ id: 'settings', label: 'Settings', value: '>', enabled: true });
      rows.push({ id: 'hangUp', label: 'Hang up', value: '', enabled: true });
    } else if (this.page === 'settings') {
      const current = playModeSource.current();
      const mode = playModeSource.choices().find((c) => c.id === current);
      rows.push({ id: 'playMode', label: 'Play mode', value: mode?.label ?? current, enabled: playModeSource.canChange() });
      rows.push({ id: 'hands', label: 'Hands', value: handedness.left ? 'Left-handed' : 'Right-handed', enabled: this.canChangeHands() });
      rows.push({ id: 'display', label: 'Display', value: '>', enabled: true });
      rows.push({ id: 'back', label: 'Back', value: '', enabled: true });
    } else if (this.page === 'rice') {
      const coming = pantry.comingIn > 0;
      rows.push({ id: 'riceSacks', label: `Rice (${RICE_SACK_KG} kg sack)`, value: `x${pantry.wantSacks}`, enabled: !coming });
      rows.push({ id: 'noriPacks', label: `Nori (${NORI_PER_PACK} sheets)`, value: `x${pantry.wantPacks}`, enabled: !coming });
      rows.push({ id: 'riceCall', label: 'Call and order', value: coming ? 'on its way' : '', enabled: phoneApi.canDialRice() });
      rows.push({ id: 'back', label: 'Back', value: '', enabled: true });
    } else if (this.page === 'cookRice') {
      rows.push({ id: 'cook1', label: '1 sho', value: '', enabled: canAskCookRice(1) });
      rows.push({ id: 'cook15', label: '1.5 sho', value: '', enabled: canAskCookRice(1.5) });
      rows.push({ id: 'back', label: 'Back', value: '', enabled: true });
    } else {
      for (const r of DISPLAY_ROWS) rows.push({ id: r.key, label: r.label, value: displayValueText(r.key), enabled: true });
      rows.push({ id: 'back', label: 'Back', value: '', enabled: true });
    }
    this.rows = rows;
  }

  /** A shop's line: whether it was called today (on easy the greengrocer's things come anyway). */
  private shopValue(who: Supplier): string {
    if (fishOrder.ordering && fishOrder.calling === who) return 'ON THE LINE';
    if (who === 'greengrocer' && fishOrder.difficulty !== 'full') return 'comes as usual';
    const done = who === 'fish' ? prep.ordered : fishOrder.greensOrdered;
    return done ? 'ordered' : '';
  }

  /** The hands change in the morning, before the call, with nothing held (src/handedness.ts). */
  private canChangeHands(): boolean {
    return fishOrderApi.canSwitch() && !holdingAnything();
  }

  private choose(row: Row): void {
    if (!row.enabled) return;
    playPress();
    switch (row.id) {
      case 'fish':
      case 'greengrocer':
        phoneApi.dial(row.id);
        return;
      case 'cook':
      case 'partTimer':
        officeApi.ask(row.id);
        return;
      case 'riceShop':
        this.page = 'rice';
        return;
      case 'riceSacks':
        pantry.wantSacks = (pantry.wantSacks + 1) % (MAX_SACKS + 1);
        pantry.version++;
        return;
      case 'noriPacks':
        pantry.wantPacks = (pantry.wantPacks + 1) % (MAX_PACKS + 1);
        pantry.version++;
        return;
      case 'riceCall':
        console.log(`[Phone] dialling the rice shop: ${orderWords(pantry.wantSacks, pantry.wantPacks)}`);
        phoneApi.dialRice();
        return;
      case 'cookRice':
        this.page = 'cookRice';
        return;
      case 'cook1':
      case 'cook15':
        pantryApi.askCook(row.id === 'cook1' ? 1 : 1.5);
        phoneApi.hangUp();
        return;
      case 'settings':
        this.page = 'settings';
        return;
      case 'hangUp':
        phoneApi.hangUp();
        return;
      case 'playMode': {
        const choices = playModeSource.choices();
        const i = choices.findIndex((c) => c.id === playModeSource.current());
        playModeSource.choose(choices[(i + 1) % choices.length].id);
        return;
      }
      case 'hands':
        setLeftHanded(!handedness.left);
        console.log(`[Phone] settings: ${handedness.left ? 'left' : 'right'}-handed`);
        return;
      case 'display':
        this.page = 'display';
        return;
      case 'back':
        this.page = this.page === 'display' ? 'settings' : 'lines';
        return;
      default:
        cycleDisplay(row.id);
        console.log(`[Phone] display: ${row.id} ${displayValueText(row.id)}`);
    }
  }

  /** The header's small note: what is in stock, on the rice pages. */
  private note(): string {
    if (this.page === 'rice') return `have: rice ${riceText()}, nori ${noriSheetsLeft()}`;
    if (this.page === 'cookRice') return `rice in the sack: ${riceText()}`;
    return 'pinch a line';
  }

  /** Redrawn only when a line or the lit line changes. */
  private draw(): void {
    let key = `${this.page}|${this.hover}|${display.version}|${this.note()}`;
    for (const r of this.rows) key += `|${r.value}${r.enabled ? 1 : 0}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const ctx = this.canvas.getContext('2d')!;
    const px = PX_PER_M;
    const cw = this.canvas.width;
    const shown = HEADER + this.rows.length * ROW_H;
    ctx.clearRect(0, 0, cw, this.canvas.height);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, cw, shown * px);
    ctx.strokeStyle = '#8C7B5A';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, cw - 4, shown * px - 4);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'left';
    const title = { lines: 'Telephone', settings: 'Settings', display: 'Settings: display', rice: 'Rice shop', cookRice: 'Cook: rice' }[this.page];
    ctx.fillText(title, 22, (HEADER / 2) * px);
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = FADED;
    ctx.fillText(this.note(), cw - 22, (HEADER / 2) * px + 4);
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      const top = (HEADER + i * ROW_H) * px;
      const h = ROW_H * px;
      if (i === this.hover && r.enabled) {
        ctx.fillStyle = LIT;
        ctx.fillRect(6, top + 3, cw - 12, h - 6);
      }
      ctx.strokeStyle = '#C9BC9C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, top);
      ctx.lineTo(cw - 14, top);
      ctx.stroke();
      ctx.fillStyle = r.enabled ? INK : FADED;
      ctx.textAlign = 'right';
      ctx.font = '34px sans-serif';
      const valueW = r.value ? ctx.measureText(r.value).width + 24 : 0;
      ctx.fillText(r.value, cw - 22, top + h / 2);
      // The name shrinks to fit beside its value.
      ctx.textAlign = 'left';
      let font = 40;
      ctx.font = `bold ${font}px sans-serif`;
      while (font > 24 && ctx.measureText(r.label).width > cw - 44 - valueW) ctx.font = `bold ${--font}px sans-serif`;
      ctx.fillText(r.label, 22, top + h / 2);
    }
    // Only the page's own height shows.
    const frac = shown / H;
    this.mesh.scale.y = frac;
    this.texture.repeat.set(1, frac);
    this.texture.offset.set(0, 1 - frac);
    this.texture.needsUpdate = true;
  }
}
