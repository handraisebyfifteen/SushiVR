import {
  CanvasTexture,
  createSystem,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  type Sprite,
  Vector3,
} from '@iwsdk/core';
import { debugLines } from './debug.js';
import { COLOR_HINT, glowObject } from './feedback.js';
import { chef, day, prep, type Side, staff, tea } from './game-state.js';
import { hands } from './hands.js';
import { CUSTOMER_SEAT_Z, END_WALL_X, STAFF_BUTTONS_Y, STAFF_BUTTONS_Z, TSUKEDAI_CHEF_Z } from './layout.js';
import { ledger, yen } from './ledger.js';
import { phoneApi } from './phone-system.js';
import { GAZE_CONE_DEG, gazeOff, GazePinch } from './gaze.js';
import { heldOut, POINT_ACROSS_DEG, POINT_LATCH_SECONDS, pointOff } from './pointing.js';
import { BOOKS_SHEET_HEIGHT, BOOKS_SHEET_WIDTH } from './scene-assets/shop-props.scene-asset.js';
import { playPress } from './sfx.js';
import { stations } from './station-system.js';
import { teaApi } from './tea-system.js';
import { Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { WAGE_COOK, WAGE_PART_TIMER } from './tuning.js';

const SHEET_W = 512;
const SHEET_H = Math.round((SHEET_W * BOOKS_SHEET_HEIGHT) / BOOKS_SHEET_WIDTH);
const NOTICE_SECONDS = 10;
const WORD_SECONDS = 2.5;

type Target = 'phone' | 'cook' | 'partTimer' | 'urn';
const TARGETS: readonly Target[] = ['phone', 'cook', 'partTimer', 'urn'];
/** Each target's rough radius, for looking at it (eye tracking). */
const TARGET_RADIUS: Record<Target, number> = { phone: 0.1, cook: 0.04, partTimer: 0.04, urn: 0.08 };

/**
 * The office corner (帳場) on the aisle's right end wall, out of the
 * customers' way: the black telephone on its shelf, the staff call buttons
 * and the day's books. All are out of reach from the seat: point at one
 * with the index finger and pinch.
 *  - The phone (during the prep, before the order): the handset comes up and
 *    the fish shop is called (src/phone-system.ts).
 *  - A staff button: the cook (during the prep) or the part-timer (the prep
 *    and the service) is called in, or let off; its lamp stays lit while
 *    they are on. Nobody works unless called: the hardest way is to call
 *    nobody and pay no wages.
 *  - The hot-water urn under the phone (during service, when a customer asks
 *    for tea and the part-timer is not on): a cup is poured, out of the
 *    customers' sight, and set down at hand (src/tea-system.ts).
 *  - The books on the wall over the phone keep the day's takings, the fish
 *    shop's bill and the wages up to date; when the last customer has left
 *    they are the day's final books, and a word over the counter says so.
 */
export class OfficeSystem extends createSystem({}) {
  private time = 0;
  private readonly lastPointed: [number, number] = [-10, -10];
  private readonly pointedAt: [Target | null, Target | null] = [null, null];
  private glowing: Target | null = null;
  private readonly gazePinch = new GazePinch<Target>();
  private buttons: Record<'cook' | 'partTimer', { button: Object3D; lamp: Mesh; off: Material } | null> = { cook: null, partTimer: null };
  private urn: Object3D | null = null;
  private readonly lampOn = new MeshStandardMaterial({ color: '#FFC46B', emissive: '#FF9A2E', emissiveIntensity: 1.6, roughness: 0.3 });
  private word!: Sprite;
  private wordTime = 0;
  private sheet: { canvas: HTMLCanvasElement; texture: CanvasTexture } | null = null;
  private drawn = '';
  private notice!: Sprite;
  private noticeTime = 0;
  private readonly head = new Vector3();

  init(): void {
    this.notice = makeTextSprite('Closed: the books are by the phone', { width: 0.6 });
    this.notice.name = 'ClosedNotice';
    this.notice.visible = false;
    this.notice.position.set(0, 1.45, (TSUKEDAI_CHEF_Z + CUSTOMER_SEAT_Z) / 2);
    this.world.createTransformEntity(this.notice);
    this.word = makeTextSprite(' ', { width: 0.4 });
    this.word.name = 'StaffWord';
    this.word.visible = false;
    this.word.position.set(END_WALL_X - 0.2, STAFF_BUTTONS_Y + 0.2, STAFF_BUTTONS_Z);
    this.world.createTransformEntity(this.word);
    debugLines.push(() => {
      const state = day.closed ? 'closed' : day.closing ? 'last orders' : chef.open ? 'open' : 'prep';
      const crew = [staff.cook ? 'cook' : '', staff.partTimer ? 'part-timer' : ''].filter(Boolean).join('+') || 'nobody';
      return `Money: sales ${yen(ledger.sales)} (${ledger.paid}) costs ${yen(ledger.costTotal())} profit ${yen(ledger.profit())} | asked ${crew} | ${state}`;
    });
  }

  update(delta: number): void {
    this.time += delta;
    if (!this.sheet) this.find();
    if (!this.buttons.cook) this.findButtons();
    if (this.noticeTime > 0) {
      this.noticeTime -= delta;
      if (this.noticeTime <= 0) this.notice.visible = false;
    }
    if (this.wordTime > 0) {
      this.wordTime -= delta;
      if (this.wordTime <= 0) this.word.visible = false;
    }
    this.updateBooks();
    this.updatePointing();
    this.updateLamps();
  }

  private enabled(t: Target): boolean {
    if (t === 'phone') return phoneApi.ready();
    if (t === 'urn') return chef.open && !!this.urn && tea.wanted && tea.cup === 'none' && !staff.partTimer;
    if (!this.buttons[t] || day.closed) return false;
    return t === 'cook' ? prep.active : prep.active || chef.open;
  }

  private where(t: Target): Vector3 {
    if (t === 'urn') return tea.urnAt;
    return t === 'phone' ? staff.phoneAt : t === 'cook' ? staff.cookButtonAt : staff.partTimerButtonAt;
  }

  /** Point at the phone or a staff button and pinch: the nearest one pointed at, within the latch, is pressed. */
  private updatePointing(): void {
    let glow: Target | null = null;
    let pressed = false;
    this.player.head.getWorldPosition(this.head);
    for (const side of [chef.netaSide, chef.riceSide] as Side[]) {
      const hand = hands.all[side];
      if (!hand.tracked || chef.hands[side].holding !== Held.None) continue;
      // Only with the hand held out pointing (a pinch at work on the board is not a call).
      if (!heldOut(hand, this.head)) {
        if (hand.pinchStart) this.pointedAt[side] = null;
        continue;
      }
      let best: Target | null = null;
      let off: number = POINT_ACROSS_DEG;
      for (const t of TARGETS) {
        if (!this.enabled(t)) continue;
        const o = pointOff(hand, this.where(t));
        if (o < off) {
          off = o;
          best = t;
        }
      }
      if (best) {
        this.pointedAt[side] = best;
        this.lastPointed[side] = this.time;
        glow = best;
      }
      // The pinch bends the index finger: it counts if it pointed just before.
      const chosen = this.pointedAt[side];
      if (!hand.pinchStart || !chosen || this.time - this.lastPointed[side] > POINT_LATCH_SECONDS) continue;
      this.pointedAt[side] = null;
      if (!this.enabled(chosen)) continue;
      this.press(chosen);
      pressed = true;
      glow = null;
      break;
    }
    // Eye tracking (the glasses): look at one and pinch with an empty hand.
    const seen = this.gazed();
    if (pressed) this.gazePinch.cancel();
    else {
      if (seen) glow = seen;
      const chosen = this.gazePinch.update(seen);
      if (chosen && this.enabled(chosen)) {
        this.press(chosen);
        glow = null;
      }
    }
    if (glow !== this.glowing) {
      if (this.glowing) this.glowTarget(this.glowing, false);
      if (glow) this.glowTarget(glow, true);
      this.glowing = glow;
    }
  }

  private press(t: Target): void {
    playPress();
    if (t === 'phone') phoneApi.call();
    else if (t === 'urn') teaApi.pour();
    else this.ask(t);
  }

  /** The target the eyes are on, if any (the nearest to the gaze). */
  private gazed(): Target | null {
    let best: Target | null = null;
    let off = GAZE_CONE_DEG;
    for (const t of TARGETS) {
      if (!this.enabled(t)) continue;
      const o = gazeOff(this.player, this.where(t), TARGET_RADIUS[t]);
      if (o < off) {
        off = o;
        best = t;
      }
    }
    return best;
  }

  private glowTarget(t: Target, on: boolean): void {
    const object = t === 'phone' ? stations.get(StationKind.Phone)?.entity.object3D : t === 'urn' ? this.urn : this.buttons[t]?.button;
    if (object) glowObject(object, on ? COLOR_HINT : null);
  }

  /** A staff button pressed: called in for the jobs of the day, or let off. */
  private ask(who: 'cook' | 'partTimer'): void {
    const on = !staff[who];
    staff[who] = on;
    const cook = who === 'cook';
    const job = cook ? 'Cook: leave the fish to me' : chef.open ? 'Part-timer: I will see to the customers' : 'Part-timer: I will clean up';
    setSpriteText(this.word, on ? job : cook ? 'Cook: all right' : 'Part-timer: all right');
    this.word.visible = true;
    this.wordTime = WORD_SECONDS;
    const wage = cook ? WAGE_COOK : WAGE_PART_TIMER;
    const work = cook ? 'takes the fish left in the ice box' : chef.open ? 'shows customers in and brings tea' : 'cleans up after the prep';
    console.log(`[Staff] ${cook ? 'the cook' : 'the part-timer'} ${on ? `is called in (${yen(wage)}/h): ${work}` : 'is let off'}`);
  }

  /** Each lamp is lit while that one is on. */
  private updateLamps(): void {
    for (const who of ['cook', 'partTimer'] as const) {
      const b = this.buttons[who];
      if (!b) continue;
      const want = staff[who] ? this.lampOn : b.off;
      if (b.lamp.material !== want) b.lamp.material = want;
    }
  }

  /** The call board comes with the scene: find its buttons and lamps, and where the buttons are. */
  private findButtons(): void {
    const scene = this.world.scene;
    this.urn = scene.getObjectByName('TeaUrn') ?? null;
    const cook = scene.getObjectByName('CookButton');
    const partTimer = scene.getObjectByName('PartTimerButton');
    const cookLamp = scene.getObjectByName('CookLamp') as Mesh | undefined;
    const partTimerLamp = scene.getObjectByName('PartTimerLamp') as Mesh | undefined;
    if (!cook || !partTimer || !cookLamp || !partTimerLamp) return;
    cook.updateWorldMatrix(true, false);
    partTimer.updateWorldMatrix(true, false);
    cook.getWorldPosition(staff.cookButtonAt);
    partTimer.getWorldPosition(staff.partTimerButtonAt);
    this.buttons.cook = { button: cook, lamp: cookLamp, off: cookLamp.material as Material };
    this.buttons.partTimer = { button: partTimer, lamp: partTimerLamp, off: partTimerLamp.material as Material };
  }

  /** The books board comes with the scene: give its sheet a page once it is there. */
  private find(): void {
    // A placed asset's root takes the scene node's name: find it by a part with its own name.
    const sheet = this.world.scene.getObjectByName('BooksSheet');
    if (!sheet) return;
    const canvas = document.createElement('canvas');
    canvas.width = SHEET_W;
    canvas.height = SHEET_H;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const page = new Mesh(new PlaneGeometry(BOOKS_SHEET_WIDTH * 0.96, BOOKS_SHEET_HEIGHT * 0.96), new MeshStandardMaterial({ map: texture, roughness: 0.9 }));
    page.name = 'BooksPage';
    // The plane faces +Z; the board's front is -Z.
    page.rotation.y = Math.PI;
    page.position.set(0, -0.015, -0.0145);
    sheet.parent!.add(page);
    this.sheet = { canvas, texture };
  }

  // ---- the day's books ---------------------------------------------------------------

  /** Redrawn only when a figure changes (a sale, a bill, a wage), and once more when the day is over. */
  private updateBooks(): void {
    if (!this.sheet) return;
    const key = `${ledger.sales}|${ledger.paid}|${ledger.costTotal()}|${ledger.costs.length}|${day.closed}`;
    if (key === this.drawn) return;
    this.drawn = key;
    if (day.closed) {
      this.notice.visible = true;
      this.noticeTime = NOTICE_SECONDS;
      console.log(`[Day] closed: sales ${yen(ledger.sales)}, costs ${yen(ledger.costTotal())}, profit ${yen(ledger.profit())}`);
    }
    const rows: Array<[string, number]> = [[`Sales (${ledger.paid} served)`, ledger.sales]];
    // The fish shop's bill first, then the wages.
    const costs = [...ledger.costs].sort((a, b) => Number(a.minutes > 0) - Number(b.minutes > 0));
    for (const c of costs) rows.push([c.minutes ? `${c.label}, ${c.minutes} min` : c.label, -c.yen]);
    const ctx = this.sheet.canvas.getContext('2d')!;
    ctx.fillStyle = '#F7F3EA';
    ctx.fillRect(0, 0, SHEET_W, SHEET_H);
    // Ruled lines, as in a ledger book.
    ctx.strokeStyle = '#C9D4E0';
    ctx.lineWidth = 2;
    for (let y = 120; y < SHEET_H - 20; y += 52) {
      ctx.beginPath();
      ctx.moveTo(20, y + 26);
      ctx.lineTo(SHEET_W - 20, y + 26);
      ctx.stroke();
    }
    ctx.fillStyle = '#2B2118';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(day.closed ? "Today's books: closed" : "Today's books", SHEET_W / 2, 54);
    let y = 120;
    for (const [label, n] of rows) {
      ctx.textAlign = 'right';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = n < 0 ? '#A3242E' : '#2B2118';
      const value = yen(n);
      ctx.fillText(value, SHEET_W - 24, y);
      // The label shrinks to fit beside the figure.
      const room = SHEET_W - 48 - ctx.measureText(value).width - 16;
      let px = 26;
      ctx.font = `${px}px sans-serif`;
      while (px > 16 && ctx.measureText(label).width > room) ctx.font = `${--px}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#2B2118';
      ctx.fillText(label, 24, y);
      y += 52;
    }
    const profit = ledger.profit();
    ctx.fillStyle = '#2B2118';
    ctx.fillRect(24, y - 22, SHEET_W - 48, 3);
    y += 14;
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(profit < 0 ? 'Loss' : 'Profit', 24, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = profit < 0 ? '#A3242E' : '#2E6B2E';
    ctx.fillText(yen(profit), SHEET_W - 24, y);
    if (day.closed) {
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#5B5348';
      ctx.fillText('Thank you for today. Reload for a new day.', SHEET_W / 2, SHEET_H - 30);
    }
    this.sheet.texture.needsUpdate = true;
  }
}
