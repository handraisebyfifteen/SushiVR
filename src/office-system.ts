import {
  CanvasTexture,
  createSystem,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  type Sprite,
  Vector3,
} from '@iwsdk/core';
import { debugLines } from './debug.js';
import { dayTally } from './day-tally.js';
import { fishOrder } from './fish-order.js';
import { COLOR_HINT, glowObject } from './feedback.js';
import { chef, cure, day, prep, type Side, staff, tea } from './game-state.js';
import { hands } from './hands.js';
import { CUSTOMER_SEAT_Z, TSUKEDAI_CHEF_Z } from './layout.js';
import { phoneApi } from './phone-system.js';
import { GAZE_CONE_DEG, gazeOff, GazePinch } from './gaze.js';
import { heldOut, POINT_ACROSS_DEG, POINT_LATCH_SECONDS, pointOff } from './pointing.js';
import { BOOKS_SHEET_HEIGHT, BOOKS_SHEET_WIDTH } from './scene-assets/shop-props.scene-asset.js';
import { playPress } from './sfx.js';
import { averagePoints, CLEAR_POINTS, finishStage, stage, stageWords } from './stage.js';
import { stations } from './station-system.js';
import { teaApi } from './tea-system.js';
import { Held, StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';

const SHEET_W = 512;
const SHEET_H = Math.round((SHEET_W * BOOKS_SHEET_HEIGHT) / BOOKS_SHEET_WIDTH);
const NOTICE_SECONDS = 10;
const WORD_SECONDS = 2.5;

type Target = 'phone' | 'urn';
const TARGETS: readonly Target[] = ['phone', 'urn'];
/** Each target's rough radius, for looking at it (eye tracking). */
const TARGET_RADIUS: Record<Target, number> = { phone: 0.1, urn: 0.08 };
/** A staff member's answer shows this far over the phone (they answer on it). */
const WORD_OVER_PHONE = 0.32;

/** Who can be called in: the cook (the prep) or the part-timer (the prep and the service). */
export type Worker = 'cook' | 'partTimer';

/** The staff, called in or let off from the phone book (src/phone-book-system.ts). */
export const officeApi = {
  canAsk: (_who: Worker): boolean => false,
  ask: (_who: Worker): void => undefined,
};

/** The grades a served piece gets (src/scoring.ts), in the order the board lists them, and each one's ink. */
const GRADES = ['Excellent', 'Good', 'Poor', 'Bad'] as const;
const GRADE_INK: Record<(typeof GRADES)[number], string> = { Excellent: '#2E6B2E', Good: '#2B2118', Poor: '#2B2118', Bad: '#A3242E' };

/** Draws one line of text, its font shrunk (down to 14 px) until it fits the width. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, px: number): void {
  ctx.font = `${px}px sans-serif`;
  while (px > 14 && ctx.measureText(text).width > width) ctx.font = `${--px}px sans-serif`;
  ctx.fillText(text, x, y);
}

/** One line of the results: its label on the left, its number on the right in `ink`. */
function figureRow(ctx: CanvasRenderingContext2D, label: string, n: number, ink: string, y: number, px: number): void {
  const value = String(n);
  ctx.textAlign = 'right';
  ctx.font = `bold ${px}px sans-serif`;
  ctx.fillStyle = ink;
  ctx.fillText(value, SHEET_W - 24, y);
  // The label shrinks to fit beside the figure.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#2B2118';
  fitText(ctx, label, 24, y, SHEET_W - 48 - ctx.measureText(value).width - 16, px);
}

/**
 * The office corner (帳場) on the aisle's right end wall, out of the
 * customers' way: the black telephone on its shelf and the day's results.
 * Both are out of reach from the seat: point at one with the index finger
 * and pinch.
 *  - The phone (any time): the handset comes up with the phone book
 *    (src/phone-system.ts, src/phone-book-system.ts): the fish shop, the
 *    staff and the settings are all called from it.
 *  - The staff, on the phone: the cook (during the prep) or the part-timer
 *    (the prep and the service) is called in, or let off; they answer on
 *    the phone. Nobody works unless called (there are no wages: the game
 *    has no money): the hardest way is to call nobody.
 *  - The hot-water urn under the phone (during service, when a customer asks
 *    for tea and the part-timer is not on): a cup is poured, out of the
 *    customers' sight, and set down at hand (src/tea-system.ts).
 *  - The board on the wall over the phone keeps the day's results up to
 *    date: the pieces served and how many of each grade, and (full) what
 *    was thrown out this morning; when the last customer has left they are
 *    the day's final results, and a word over the counter says so. It shows
 *    the difficulty (easy or full, src/fish-order.ts), chosen in the
 *    phone's settings.
 */
export class OfficeSystem extends createSystem({}) {
  private time = 0;
  private readonly lastPointed: [number, number] = [-10, -10];
  private readonly pointedAt: [Target | null, Target | null] = [null, null];
  private glowing: Target | null = null;
  private readonly gazePinch = new GazePinch<Target>();
  private urn: Object3D | null = null;
  private word!: Sprite;
  private wordTime = 0;
  private sheet: { canvas: HTMLCanvasElement; texture: CanvasTexture } | null = null;
  private drawn = '';
  private notice!: Sprite;
  private noticeTime = 0;
  private readonly head = new Vector3();

  init(): void {
    this.notice = makeTextSprite("Closed: the day's results are by the phone", { width: 0.6 });
    this.notice.name = 'ClosedNotice';
    this.notice.visible = false;
    this.notice.position.set(0, 1.45, (TSUKEDAI_CHEF_Z + CUSTOMER_SEAT_Z) / 2);
    this.world.createTransformEntity(this.notice);
    this.word = makeTextSprite(' ', { width: 0.4 });
    this.word.name = 'StaffWord';
    this.word.visible = false;
    this.world.createTransformEntity(this.word);
    officeApi.canAsk = (who) => !day.closed && (who === 'cook' ? prep.active : prep.active || chef.open);
    officeApi.ask = (who) => {
      if (officeApi.canAsk(who)) this.ask(who);
    };
    debugLines.push(() => {
      const state = day.closed ? 'closed' : day.closing ? 'last orders' : chef.open ? 'open' : 'prep';
      const crew = [staff.cook ? 'cook' : '', staff.partTimer ? 'part-timer' : ''].filter(Boolean).join('+') || 'nobody';
      return `Day: served ${dayTally.served} | asked ${crew} | ${state}`;
    });
  }

  update(delta: number): void {
    this.time += delta;
    if (!this.sheet) this.find();
    if (!this.urn) this.urn = this.world.scene.getObjectByName('TeaUrn') ?? null;
    if (this.noticeTime > 0) {
      this.noticeTime -= delta;
      if (this.noticeTime <= 0) this.notice.visible = false;
    }
    if (this.wordTime > 0) {
      this.wordTime -= delta;
      if (this.wordTime <= 0) this.word.visible = false;
    }
    this.updateResults();
    this.updatePointing();
  }

  private enabled(t: Target): boolean {
    // The office corner is worked from the stool (from the back row a point at the board could line up with it).
    if (chef.at !== 'seat') return false;
    if (t === 'phone') return phoneApi.ready();
    return chef.open && !!this.urn && tea.wanted && tea.cup === 'none' && !staff.partTimer;
  }

  private where(t: Target): Vector3 {
    return t === 'urn' ? tea.urnAt : staff.phoneAt;
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
    else teaApi.pour();
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
    const object = t === 'phone' ? stations.get(StationKind.Phone)?.entity.object3D : this.urn;
    if (object) glowObject(object, on ? COLOR_HINT : null);
  }

  /** A staff member's answer, over the phone (they answer on it). */
  private tell(words: string): void {
    setSpriteText(this.word, words);
    this.word.position.copy(staff.phoneAt);
    this.word.position.y += WORD_OVER_PHONE;
    this.word.visible = true;
    this.wordTime = WORD_SECONDS;
  }

  /** A staff line chosen on the phone: called in for the jobs of the day, or let off. */
  private ask(who: Worker): void {
    const on = !staff[who];
    staff[who] = on;
    const cook = who === 'cook';
    const job = cook ? 'Cook: leave the fish to me' : chef.open ? 'Part-timer: I will see to the customers' : 'Part-timer: I will clean up';
    this.tell(on ? job : cook ? 'Cook: all right' : 'Part-timer: all right');
    const work = cook ? 'takes the fish left in the ice box' : chef.open ? 'shows customers in and brings tea' : 'cleans up after the prep';
    console.log(`[Staff] ${cook ? 'the cook' : 'the part-timer'} ${on ? `is called in: ${work}` : 'is let off'}`);
  }

  /** The results board (the books-board asset) comes with the scene: give its sheet a page once it is there. */
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

  // ---- the day's results ------------------------------------------------------------

  /** Redrawn only when a figure changes (a piece served, the difficulty, the morning), and once more when the day is over. */
  private updateResults(): void {
    if (!this.sheet) return;
    const full = fishOrder.difficulty === 'full';
    const key = `${dayTally.served}|${day.closed}|${fishOrder.difficulty}|${fishOrder.day}|${fishOrder.spoiled.length}|${stage.version}|${prep.done}|${cure.grades.length}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const staged = stage.on || stage.prep;
    // A prep stage's grades: the curing's times as they come out, and the cuts once all is done.
    const grades = stage.prep ? { ...prep.cutGrades } : dayTally.grades;
    if (stage.prep) for (const g of cure.grades) grades[g.grade]++;
    const graded = stage.prep ? GRADES.reduce((n, g) => n + grades[g], 0) : dayTally.served;
    // A prep stage with nothing graded (the octopus, the tamago, the shari) is cleared by finishing it.
    const points = stage.prep && graded === 0 ? (prep.done ? 100 : 0) : averagePoints(grades);
    if (stage.prep && prep.done && !stage.over) {
      // Everything of the stage is made and put away: the stage is over (no cleaning, no opening).
      day.closed = true;
      this.drawn = '';
    }
    if (day.closed && staged && !stage.over) {
      // The stage's last customer has left: its points are final (a clear unlocks the next).
      finishStage(points);
      setSpriteText(
        this.notice,
        stage.clear ? `${stage.title} ${stage.id} clear! ${points} points` : `${points} points: ${CLEAR_POINTS} to clear`,
        { color: stage.clear ? '#FFD86B' : '#ffffff' },
      );
      this.notice.visible = true;
      // It stays up: the phone is the way on.
      this.noticeTime = Infinity;
      console.log(`[Stage] ${stage.prep ? 'prep ' : ''}${stage.id} over: ${points} points, ${stage.clear ? 'clear' : 'not cleared'}`);
    } else if (day.closed && !staged) {
      this.notice.visible = true;
      this.noticeTime = NOTICE_SECONDS;
      console.log(`[Day] closed: ${dayTally.served} served (${GRADES.map((g) => `${g} ${dayTally.grades[g]}`).join(', ')})`);
    }
    // This morning's waste (full): what was past its days, as a count.
    let thrown = 0;
    if (full) for (const s of fishOrder.spoiled) thrown += s.count;
    const kinds = thrown ? new Set(fishOrder.spoiled.map((s) => s.neta)).size : 0;

    const ctx = this.sheet.canvas.getContext('2d')!;
    ctx.fillStyle = '#F7F3EA';
    ctx.fillRect(0, 0, SHEET_W, SHEET_H);
    ctx.fillStyle = '#2B2118';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';
    const title = staged ? `${stage.title} ${stage.id}` : full ? `Day ${fishOrder.day} results` : "Today's results";
    ctx.fillText(day.closed ? (staged ? `${title}: ${stage.clear ? 'CLEAR' : 'not yet'}` : `${title}: closed`) : title, SHEET_W / 2, 50);
    // The difficulty, chosen in the phone's settings.
    ctx.fillStyle = '#5B5348';
    fitText(ctx, staged ? `${stageWords()}. Clear at ${CLEAR_POINTS} points` : full ? 'Full: the case carries over, you order' : 'Easy: the usual comes, the cook fills the rest', SHEET_W / 2, 88, SHEET_W - 40, 20);
    // The pieces served, underlined; then each grade on a ruled line.
    let y = 150;
    figureRow(ctx, stage.prep ? 'Graded (cuts, curing)' : 'Served', graded, '#2B2118', y, 34);
    ctx.fillStyle = '#2B2118';
    ctx.fillRect(24, y + 28, SHEET_W - 48, 3);
    y += 78;
    ctx.strokeStyle = '#C9D4E0';
    ctx.lineWidth = 2;
    for (const g of GRADES) {
      ctx.beginPath();
      ctx.moveTo(20, y + 24);
      ctx.lineTo(SHEET_W - 20, y + 24);
      ctx.stroke();
      figureRow(ctx, g, grades[g], GRADE_INK[g], y, 28);
      y += 50;
    }
    if (staged) {
      // The stage's points so far: the grades averaged (Excellent 100, Good 75, Poor 40, Bad 0).
      figureRow(ctx, 'Points (average)', points, points >= CLEAR_POINTS ? '#2E6B2E' : '#A3242E', y + 6, 30);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5B5348';
    if (thrown) {
      fitText(ctx, `Thrown out this morning: ${kinds} item${kinds > 1 ? 's' : ''}, ${thrown} piece${thrown > 1 ? 's' : ''}`, SHEET_W / 2, y + 10, SHEET_W - 40, 22);
    }
    if (day.closed) {
      if (!staged) fitText(ctx, full ? 'Thank you. The case is kept.' : 'Thank you for today.', SHEET_W / 2, SHEET_H - 56, SHEET_W - 32, 22);
      fitText(ctx, staged ? 'Point at the phone and pinch to go on.' : 'Point at the phone and pinch for the next day.', SHEET_W / 2, SHEET_H - 26, SHEET_W - 32, 22);
    }
    this.sheet.texture.needsUpdate = true;
  }
}
