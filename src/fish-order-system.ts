import { CanvasTexture, createSystem, type Entity, Sprite, SpriteMaterial } from '@iwsdk/core';
import { debugLines } from './debug.js';
import {
  closeDay,
  fishOrder,
  isMaterial,
  morningStock,
  noteAdded,
  orderedSize,
  orderOf,
  setDifficulty,
  sizesOf,
  startDay,
  cycleOrder,
  type Supplier,
  SUPPLIER_NAME,
  supplierOf,
} from './fish-order.js';
import { day, prep } from './game-state.js';
import { hands } from './hands.js';
import { NETA_CASE_HEIGHT, NETA_CASE_WIDTH, NETA_HOUSING_WIDTH } from './layout.js';
import { NETA, type NetaId } from './menu.js';
import { caseApi, caseDoors } from './neta-case-system.js';
import { playPress } from './sfx.js';
import { stage } from './stage.js';
import { CaseItem } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';

const SLIP_W = 512;
const SLIP_H = 640;
/** The order slip over the case's left end (case-local), as wide as it is in metres. */
const SLIP_X = -NETA_CASE_WIDTH / 2 + NETA_HOUSING_WIDTH / 2;
const SLIP_Y = NETA_CASE_HEIGHT + 0.2;
const SLIP_WIDTH = 0.22;
const NOTICE_SECONDS = 8;

/** How the phone's settings (src/phone-book-system.ts) and the practice keys change the difficulty. */
export const fishOrderApi = {
  /** The difficulty may change now: the morning, before the call. */
  canSwitch: (): boolean => prep.active && !prep.ordered && !fishOrder.greensOrdered && !fishOrder.ordering,
  toggle: (): void => undefined,
};

/**
 * The difficulty and the order (src/fish-order.ts) in the shop:
 *  - the case's stock in the morning: on easy the prepped items start
 *    empty and the rest full; on full, what yesterday left (less what is
 *    past its days, thrown out with a word);
 *  - while the fish shop is on the line (full), a pinch on a case item steps
 *    its order through its amounts and back to none; the slip over the
 *    case's left end lists the order (items only: the game has no money);
 *  - on delivery (full), the ready items ordered go into the case;
 *  - when the day closes (full), what is left in the case is kept for the
 *    next day.
 */
export class FishOrderSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private readonly items = new Map<NetaId, Entity>();
  private slip!: Sprite;
  private slipCanvas!: HTMLCanvasElement;
  private slipTexture!: CanvasTexture;
  private drawn = -1;
  private notice!: Sprite;
  private noticeTime = 0;
  private wasDelivered = false;
  private wasGreensDelivered = false;
  private saved = false;

  init(): void {
    if (fishOrder.difficulty === 'full') startDay();
    this.cleanupFuncs.push(this.queries.items.subscribe('qualify', (e) => this.see(e)));
    for (const e of this.queries.items.entities) this.see(e);
    fishOrderApi.toggle = () => this.toggle();

    this.slipCanvas = document.createElement('canvas');
    this.slipCanvas.width = SLIP_W;
    this.slipCanvas.height = SLIP_H;
    this.slipTexture = new CanvasTexture(this.slipCanvas);
    this.slip = new Sprite(new SpriteMaterial({ map: this.slipTexture, depthTest: false, transparent: true }));
    this.slip.scale.set(SLIP_WIDTH, (SLIP_WIDTH * SLIP_H) / SLIP_W, 1);
    this.slip.renderOrder = 900;
    this.slip.name = 'OrderSlip';
    this.slip.visible = false;
    this.world.createTransformEntity(this.slip);

    this.notice = makeTextSprite(' ', { width: 0.5 });
    this.notice.name = 'CaseNotice';
    this.notice.visible = false;
    this.world.createTransformEntity(this.notice);
    this.tellSpoiled();

    debugLines.push(() => {
      const lines = [...fishOrder.lines].map(([id, at]) => sizesOf(id)[at].name).join(', ');
      const mode = fishOrder.difficulty === 'full' ? `full, day ${fishOrder.day}` : 'easy';
      return `Order: ${mode}${fishOrder.ordering ? ' | on the phone' : ''}${lines ? ` | ${lines}` : ''}`;
    });
  }

  /** A case item from the scene: remembered, and given the morning's stock. */
  private see(entity: Entity): void {
    const neta = entity.getValue(CaseItem, 'neta') as NetaId;
    this.items.set(neta, entity);
    if (prep.active && !prep.ordered) this.morning(neta, entity);
    // A nigiri stage starts with the case full.
    else if (stage.on) entity.setValue(CaseItem, 'remaining', NETA[neta].stock);
  }

  private morning(neta: NetaId, entity: Entity): void {
    const stock = fishOrder.difficulty === 'full' ? morningStock(neta) : isMaterial(orderOf(neta)) ? 0 : NETA[neta].stock;
    entity.setValue(CaseItem, 'remaining', stock);
  }

  private toggle(): void {
    if (!fishOrderApi.canSwitch()) return;
    setDifficulty(fishOrder.difficulty === 'easy' ? 'full' : 'easy');
    if (fishOrder.difficulty === 'full') startDay();
    for (const [neta, entity] of this.items) this.morning(neta, entity);
    fishOrder.version++;
    console.log(`[Order] difficulty: ${fishOrder.difficulty}${fishOrder.difficulty === 'full' ? `, day ${fishOrder.day}` : ''}`);
    this.say(fishOrder.difficulty === 'full' ? `Full: day ${fishOrder.day}. Check the case, then call and order` : 'Easy: the usual comes, the cook fills the rest');
    if (fishOrder.difficulty === 'full') this.tellSpoiled();
  }

  /** Past its days this morning: it is out of the case (one word for all of it). */
  private tellSpoiled(): void {
    if (fishOrder.difficulty !== 'full' || !fishOrder.spoiled.length) return;
    const what = fishOrder.spoiled.map((s) => `${NETA[s.neta].name.toLowerCase()} x${s.count} (day ${s.day})`).join(', ');
    console.log(`[Order] past its days, out of the case: ${what}`);
    const kinds = new Set(fishOrder.spoiled.map((s) => s.neta)).size;
    this.say(`Not kept from yesterday: ${kinds} item${kinds > 1 ? 's' : ''} out of the case`);
  }

  private say(text: string): void {
    setSpriteText(this.notice, text);
    if (caseDoors.object) {
      this.notice.position.set(0, NETA_CASE_HEIGHT + 0.12, 0);
      caseDoors.object.localToWorld(this.notice.position);
    }
    this.notice.visible = true;
    this.noticeTime = NOTICE_SECONDS;
  }

  update(delta: number): void {
    if (this.noticeTime > 0) {
      this.noticeTime -= delta;
      if (this.noticeTime <= 0) this.notice.visible = false;
    }
    if (fishOrder.ordering) this.takeOrder();
    this.slip.visible = fishOrder.ordering;
    if (fishOrder.ordering && this.drawn !== fishOrder.version) this.drawSlip();

    if (prep.delivered && !this.wasDelivered) {
      this.wasDelivered = true;
      if (fishOrder.difficulty === 'full') this.deliverReady('fish');
    }
    if (fishOrder.greensDelivered && !this.wasGreensDelivered) {
      this.wasGreensDelivered = true;
      this.deliverReady('greengrocer');
    }
    if (day.closed && !this.saved) {
      this.saved = true;
      if (fishOrder.difficulty === 'full') {
        closeDay((neta) => this.items.get(neta)?.getValue(CaseItem, 'remaining') ?? 0);
        console.log(`[Order] day ${fishOrder.day} closed: the case is kept for tomorrow`);
      }
    }
  }

  /** A pinch on a case item while a shop is on the line: its order steps on (the other shop's items are not theirs). */
  private takeOrder(): void {
    const shop = SUPPLIER_NAME[fishOrder.calling];
    for (let side = 0; side < 2; side++) {
      const hand = hands.all[side];
      if (!hand?.tracked || !hand.pinchStart) continue;
      const item = caseApi.chosen(side);
      if (!item) continue;
      const neta = caseApi.neta(item);
      const id = orderOf(neta);
      playPress();
      if (supplierOf(id) !== fishOrder.calling) {
        this.say(`${shop}: That's the ${fishOrder.calling === 'fish' ? "greengrocer's" : "fish shop's"}, not ours`);
        console.log(`[Order] ${NETA[neta].name}: not the ${shop.toLowerCase()}'s`);
        continue;
      }
      const size = cycleOrder(id);
      console.log(`[Order] ${shop}, ${NETA[neta].name}: ${size ? size.name : 'none'}`);
    }
  }

  /** One shop's ready items, as ordered, go into the case (the fish shop's prep materials come in the ice box). */
  private deliverReady(supplier: Supplier): void {
    for (const [id] of fishOrder.lines) {
      if (isMaterial(id) || supplierOf(id) !== supplier) continue;
      const neta = id as NetaId;
      const size = orderedSize(neta)!;
      const item = this.items.get(neta);
      const full = NETA[neta].stock;
      const n = Math.round(full * size.frac);
      if (item) {
        const left = item.getValue(CaseItem, 'remaining') ?? 0;
        const now = Math.min(full, left + n);
        item.setValue(CaseItem, 'remaining', now);
        noteAdded(neta, now - left);
      }
      console.log(`[Order] delivered ready (${SUPPLIER_NAME[supplier].toLowerCase()}): ${size.name}`);
    }
  }

  /** The order slip: each line (items only, no prices), and how to end the call. */
  private drawSlip(): void {
    this.drawn = fishOrder.version;
    if (caseDoors.object) {
      this.slip.position.set(SLIP_X, SLIP_Y, 0);
      caseDoors.object.localToWorld(this.slip.position);
    }
    const ctx = this.slipCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, SLIP_W, SLIP_H);
    ctx.fillStyle = 'rgba(247,243,234,0.94)';
    ctx.fillRect(0, 0, SLIP_W, SLIP_H);
    ctx.strokeStyle = '#2B2118';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, SLIP_W - 4, SLIP_H - 4);
    ctx.fillStyle = '#2B2118';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(`Order: ${SUPPLIER_NAME[fishOrder.calling].toLowerCase()}`, SLIP_W / 2, 40);
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#5B5348';
    ctx.fillText('Pinch a case item: more, then none', SLIP_W / 2, 80);
    let y = 128;
    const rows = [...fishOrder.lines].filter(([id]) => supplierOf(id) === fishOrder.calling);
    const shown = rows.slice(0, 12);
    ctx.fillStyle = '#2B2118';
    for (const [id, at] of shown) {
      const size = sizesOf(id)[at];
      const room = SLIP_W - 44;
      let px = 26;
      ctx.font = `${px}px sans-serif`;
      while (px > 15 && ctx.measureText(size.name).width > room) ctx.font = `${--px}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(size.name, 22, y);
      y += 34;
    }
    if (rows.length > shown.length) {
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`and ${rows.length - shown.length} more`, 22, y);
    }
    if (!rows.length) {
      ctx.font = 'italic 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#5B5348';
      ctx.fillText('Nothing yet', SLIP_W / 2, y);
    }
    ctx.fillStyle = '#2B2118';
    ctx.fillRect(22, SLIP_H - 52, SLIP_W - 44, 3);
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5B5348';
    ctx.fillText('Point at the phone to end the call', SLIP_W / 2, SLIP_H - 24);
    this.slipTexture.needsUpdate = true;
  }
}
