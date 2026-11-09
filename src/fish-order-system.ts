import { CanvasTexture, createSystem, type Entity, Sprite, SpriteMaterial } from '@iwsdk/core';
import { debugLines } from './debug.js';
import {
  closeDay,
  fishOrder,
  fromGreengrocer,
  fundsNow,
  greensYen,
  isMaterial,
  morningStock,
  noteAdded,
  orderedSize,
  orderOf,
  orderRoom,
  orderTotal,
  priceOf,
  setDifficulty,
  sizesOf,
  startDay,
  cycleOrder,
} from './fish-order.js';
import { day, prep } from './game-state.js';
import { hands } from './hands.js';
import { END_WALL_X, MODE_SIGN_Y, MODE_SIGN_Z, NETA_CASE_HEIGHT, NETA_CASE_WIDTH, NETA_HOUSING_WIDTH } from './layout.js';
import { ledger, yen } from './ledger.js';
import { NETA, type NetaId } from './menu.js';
import { caseApi, caseDoors } from './neta-case-system.js';
import { playPress } from './sfx.js';
import { CaseItem } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { COOK_MINUTES_PER_CASE_ITEM } from './tuning.js';

const SLIP_W = 512;
const SLIP_H = 640;
/** The order slip over the case's left end (case-local), as wide as it is in metres. */
const SLIP_X = -NETA_CASE_WIDTH / 2 + NETA_HOUSING_WIDTH / 2;
const SLIP_Y = NETA_CASE_HEIGHT + 0.2;
const SLIP_WIDTH = 0.22;
const NOTICE_SECONDS = 8;

/** How the office corner and the practice keys change the difficulty. */
export const fishOrderApi = {
  /** The difficulty may change now: the morning, before the call. */
  canSwitch: (): boolean => prep.active && !prep.ordered && !fishOrder.ordering,
  toggle: (): void => undefined,
};

const SIGN_WOOD = '#6B4A2B';

/**
 * The difficulty and the order (src/fish-order.ts) in the shop:
 *  - the case's stock in the morning: on easy the prepped items start
 *    empty and the rest full; on full, what yesterday left (less what is
 *    past its days, thrown out with a word);
 *  - while the fish shop is on the line (full), a pinch on a case item steps
 *    its order through its amounts and back to none; the slip over the
 *    case's left end lists the order and its price;
 *  - on delivery (full), the ready items ordered go into the case, billed;
 *    on easy, the order books the cook's wages for the case items;
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
  private sign!: Sprite;
  private signDrawn = '';
  private wasOrdered = false;
  private wasDelivered = false;
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

    this.sign = makeTextSprite(' ', { width: 0.3, background: SIGN_WOOD });
    this.sign.name = 'ModeSign';
    this.sign.position.set(END_WALL_X - 0.05, MODE_SIGN_Y, MODE_SIGN_Z);
    fishOrder.signAt.copy(this.sign.position);
    this.world.createTransformEntity(this.sign);

    this.notice = makeTextSprite(' ', { width: 0.5 });
    this.notice.name = 'CaseNotice';
    this.notice.visible = false;
    this.world.createTransformEntity(this.notice);
    this.tellSpoiled();

    debugLines.push(() => {
      const lines = [...fishOrder.lines].map(([id, at]) => sizesOf(id)[at].name).join(', ');
      const mode = fishOrder.difficulty === 'full' ? `full, day ${fishOrder.day}, funds ${yen(fundsNow())}` : 'easy';
      return `Order: ${mode}${fishOrder.ordering ? ' | on the phone' : ''}${lines ? ` | ${lines} (${yen(orderTotal())})` : ''}`;
    });
  }

  /** A case item from the scene: remembered, and given the morning's stock. */
  private see(entity: Entity): void {
    const neta = entity.getValue(CaseItem, 'neta') as NetaId;
    this.items.set(neta, entity);
    if (prep.active && !prep.ordered) this.morning(neta, entity);
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
    this.say(fishOrder.difficulty === 'full' ? `Full: day ${fishOrder.day}, funds ${yen(fishOrder.morningFunds)}. Check the case, then call and order` : 'Easy: the usual comes, the cook fills the rest');
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
    this.updateSign();
    if (fishOrder.ordering) this.takeOrder();
    this.slip.visible = fishOrder.ordering;
    if (fishOrder.ordering && this.drawn !== fishOrder.version) this.drawSlip();

    if (prep.ordered && !this.wasOrdered) {
      this.wasOrdered = true;
      if (fishOrder.difficulty === 'easy') {
        // Everything the chef does not prep, the cook has readied: wages.
        const items = [...this.items.keys()].filter((n) => !isMaterial(orderOf(n))).length;
        ledger.wage('cook', `case items (${items})`, items * COOK_MINUTES_PER_CASE_ITEM);
      }
    }
    if (prep.delivered && !this.wasDelivered) {
      this.wasDelivered = true;
      if (fishOrder.difficulty === 'full') this.deliverReady();
    }
    if (day.closed && !this.saved) {
      this.saved = true;
      if (fishOrder.difficulty === 'full') {
        closeDay((neta) => this.items.get(neta)?.getValue(CaseItem, 'remaining') ?? 0);
        console.log(`[Order] day ${fishOrder.day} closed: the case is kept for tomorrow`);
      }
    }
  }

  /** The sign shows the difficulty while it may change (the morning, before the call); it lights when pointed at. */
  private updateSign(): void {
    const shown = fishOrderApi.canSwitch();
    this.sign.visible = shown;
    if (!shown) return;
    const mode = fishOrder.difficulty === 'full' ? `Full, day ${fishOrder.day}` : 'Easy';
    const key = `${mode}|${fishOrder.signHover}`;
    if (key === this.signDrawn) return;
    this.signDrawn = key;
    setSpriteText(this.sign, `${mode}: point to change`, { background: SIGN_WOOD, color: fishOrder.signHover ? '#FFE08A' : '#FFFFFF' });
  }

  /** A pinch on a case item while the shop is on the line: its order steps on. */
  private takeOrder(): void {
    for (let side = 0; side < 2; side++) {
      const hand = hands.all[side];
      if (!hand?.tracked || !hand.pinchStart) continue;
      const item = caseApi.chosen(side);
      if (!item) continue;
      const neta = caseApi.neta(item);
      if (fromGreengrocer(neta)) {
        // Not the fish shop's: the greengrocer brings it.
        playPress();
        console.log(`[Order] ${NETA[neta].name}: the greengrocer brings it`);
        continue;
      }
      const id = orderOf(neta);
      const size = cycleOrder(id);
      playPress();
      if (size && orderRoom() < 0) {
        // No borrowing: the fish shop takes no more than the shop can pay.
        fishOrder.lines.delete(id);
        fishOrder.version++;
        this.say(`Fish shop: That's more than the shop has (${yen(Math.max(0, orderRoom()))} left to spend)`);
        console.log(`[Order] ${NETA[neta].name}: ${size.name} is over the shop's money (funds ${yen(fundsNow())}) | total ${yen(orderTotal())}`);
        continue;
      }
      console.log(`[Order] ${NETA[neta].name}: ${size ? `${size.name} (${yen(priceOf(id, size))})` : 'none'} | total ${yen(orderTotal())}`);
    }
  }

  /** The ready items ordered go into the case (the fish shop's bill for each); the greengrocer tops up its own. */
  private deliverReady(): void {
    const greens: string[] = [];
    let greenYen = 0;
    // Kept aside when the call began; none today if the shop could not pay it then.
    for (const [neta, item] of this.items) {
      if (!fromGreengrocer(neta) || !fishOrder.greens) continue;
      const full = NETA[neta].stock;
      const left = item.getValue(CaseItem, 'remaining') ?? 0;
      if (left >= full) continue;
      item.setValue(CaseItem, 'remaining', full);
      noteAdded(neta, full - left);
      greenYen += greensYen(neta, left);
      greens.push(`${NETA[neta].name.toLowerCase()} x${full - left}`);
    }
    if (greens.length) {
      ledger.add('Greengrocer', greenYen, 0);
      console.log(`[Order] the greengrocer topped up: ${greens.join(', ')} (${yen(greenYen)})`);
    }
    for (const [id] of fishOrder.lines) {
      if (isMaterial(id)) continue;
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
      ledger.fishShop(priceOf(neta, size));
      console.log(`[Order] delivered ready: ${size.name}`);
    }
  }

  /** The order slip: each line and its price, the total, and how to end the call. */
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
    ctx.fillText('Order', SLIP_W / 2, 40);
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#5B5348';
    ctx.fillText('Pinch a case item: more, then none', SLIP_W / 2, 80);
    let y = 128;
    const rows = [...fishOrder.lines];
    const shown = rows.slice(0, 11);
    for (const [id, at] of shown) {
      const size = sizesOf(id)[at];
      const price = yen(priceOf(id, size));
      ctx.textAlign = 'right';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = '#2B2118';
      ctx.fillText(price, SLIP_W - 22, y);
      const room = SLIP_W - 44 - ctx.measureText(price).width - 12;
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
    ctx.fillRect(22, SLIP_H - 108, SLIP_W - 44, 3);
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Total', 22, SLIP_H - 76);
    ctx.textAlign = 'right';
    ctx.fillText(yen(orderTotal()), SLIP_W - 22, SLIP_H - 76);
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5B5348';
    // No borrowing: what the shop's money still allows (the greengrocer's top-up is kept aside).
    const greens = fishOrder.greens ? `, greengrocer ${yen(fishOrder.greens)}` : '';
    ctx.fillText(`Funds ${yen(fundsNow())}${greens}: ${yen(Math.max(0, orderRoom()))} left`, SLIP_W / 2, SLIP_H - 42);
    ctx.font = '22px sans-serif';
    ctx.fillText('Point at the phone to end the call', SLIP_W / 2, SLIP_H - 16);
    this.slipTexture.needsUpdate = true;
  }
}
