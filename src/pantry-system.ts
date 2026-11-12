import { createSystem, type Sprite, Vector3 } from '@iwsdk/core';
import { debugLines } from './debug.js';
import { COLOR_DONE, feedback } from './feedback.js';
import { fishOrder } from './fish-order.js';
import { chef, day, prep, shari } from './game-state.js';
import {
  addShari,
  canAskCookRice,
  COOK_JOB_SECONDS,
  cookRice,
  deliverPantry,
  loadPantry,
  noriSheetsLeft,
  orderWords,
  pantry,
  pantryOn,
  riceText,
  savePantry,
  shariPieces,
} from './pantry.js';
import { playDone } from './sfx.js';
import { stations } from './station-system.js';
import { StationKind } from './sushi-components.js';
import { makeTextSprite, setSpriteText } from './text-sprites.js';
import { NORI_LOW_SHEETS, RICE_LOW_SHO, TUB_LOW_PIECES, TUB_OUT_PIECES } from './tuning.js';

const YELLOW = '#FFD54A';
const RED = '#FF6B5A';
const WHITE = '#FFFFFF';
const WORD_SECONDS = 4;

/** What the phone book asks of the rice: the cook cooks more during service. */
export const pantryApi = {
  askCook: (_sho: number): void => undefined,
};

interface Word {
  sprite: Sprite;
  text: string;
  color: string;
}

/**
 * The rice and nori day by day (src/pantry.ts, full mode only): the morning
 * stock is loaded and the evening's saved, the rice shop's delivery comes,
 * the cook's rice is cooked during service, and the warnings stand over
 * the ohitsu (its shari, the sack's rice) and the nori tin when they run
 * low: yellow early, red when the ohitsu is nearly out.
 */
export class PantrySystem extends createSystem({}) {
  private mode = '';
  private day = -1;
  private saved = false;
  private tubWord!: Word;
  private riceWord!: Word;
  private noriWord!: Word;
  private said!: Sprite;
  private saidTime = 0;
  private readonly tmp = new Vector3();

  init(): void {
    const word = (name: string, width: number): Word => {
      const sprite = makeTextSprite(' ', { width });
      sprite.name = name;
      sprite.visible = false;
      this.world.createTransformEntity(sprite);
      return { sprite, text: '', color: '' };
    };
    this.tubWord = word('ShariWarning', 0.2);
    this.riceWord = word('RiceWarning', 0.26);
    this.noriWord = word('NoriWarning', 0.2);
    this.said = makeTextSprite(' ', { width: 0.42 });
    this.said.name = 'PantryWord';
    this.said.visible = false;
    this.world.createTransformEntity(this.said);
    pantryApi.askCook = (sho) => this.askCook(sho);
    debugLines.push(() =>
      pantryOn()
        ? `Pantry: rice ${riceText()} | nori ${pantry.noriSheets.toFixed(2)} | ohitsu ${Math.round(pantry.tubGrams)} g (${shariPieces()} pcs)${pantry.cookLeft > 0 ? ` | cook ${Math.ceil(pantry.cookLeft)}s` : ''}${pantry.comingIn > 0 ? ` | coming ${orderWords(pantry.comingSacks, pantry.comingPacks)}` : ''}`
        : '',
    );
  }

  update(delta: number): void {
    if (this.saidTime > 0) {
      this.saidTime -= delta;
      if (this.saidTime <= 0) this.said.visible = false;
    }
    if (!pantryOn()) {
      this.mode = fishOrder.difficulty;
      this.hideWords();
      return;
    }
    // A new morning (or the mode just changed to full): the stock as the last day left it.
    if (this.mode !== fishOrder.difficulty || this.day !== fishOrder.day) {
      this.mode = fishOrder.difficulty;
      this.day = fishOrder.day;
      this.saved = false;
      loadPantry();
      console.log(`[Pantry] day ${fishOrder.day}: rice ${riceText()}, nori ${noriSheetsLeft()} sheets`);
    }
    if (pantry.comingIn > 0) {
      pantry.comingIn -= delta;
      if (pantry.comingIn <= 0) this.deliver();
    }
    if (pantry.cookLeft > 0) {
      pantry.cookLeft -= delta;
      if (pantry.cookLeft <= 0) this.cookDone();
    }
    if (day.closed && !this.saved) {
      this.saved = true;
      savePantry();
      console.log(`[Pantry] day ${fishOrder.day} closed: rice ${riceText()}, nori ${noriSheetsLeft()} sheets kept`);
    }
    this.warnings();
  }

  // ---- the rice shop's delivery, the cook's rice ---------------------------------------

  private deliver(): void {
    const words = orderWords(pantry.comingSacks, pantry.comingPacks);
    deliverPantry();
    this.say("Rice shop's here! Rice in the sack, nori in the tin.");
    console.log(`[Pantry] the rice shop's delivery: ${words} (rice ${riceText()}, nori ${noriSheetsLeft()} sheets)`);
  }

  private askCook(sho: number): void {
    if (!canAskCookRice(sho) || !cookRice(sho)) return;
    pantry.cookSho = sho;
    pantry.cookLeft = COOK_JOB_SECONDS;
    pantry.version++;
    this.say(`Cook: ${sho} sho of rice, right away.`);
    console.log(`[Pantry] the cook is cooking ${sho} sho (rice left ${riceText()})`);
  }

  private cookDone(): void {
    pantry.cookLeft = 0;
    addShari(pantry.cookSho);
    feedback.flash(StationKind.RiceTub, COLOR_DONE);
    playDone();
    this.say('Cook: fresh shari in the ohitsu.');
    console.log(`[Pantry] the cook's shari is in the ohitsu (${shariPieces()} pieces)`);
  }

  private say(text: string): void {
    const board = stations.get(StationKind.CuttingBoard);
    if (!board) return;
    setSpriteText(this.said, text);
    this.said.position.copy(board.pos).add(this.tmp.set(0, 0.3, 0.05));
    this.said.visible = true;
    this.saidTime = WORD_SECONDS;
  }

  // ---- the warnings ---------------------------------------------------------------------

  private warnings(): void {
    const working = !day.closed && (prep.active || chef.open);
    // The ohitsu: once the day's shari is in it.
    let tub = '';
    let tubColor = WHITE;
    if (working && shari.inTub) {
      const left = shariPieces();
      if (pantry.cookLeft > 0 && left <= TUB_LOW_PIECES) {
        const s = Math.ceil(pantry.cookLeft);
        tub = `Shari: ${left} left. Cook's rice in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        tubColor = left <= TUB_OUT_PIECES ? RED : YELLOW;
      } else if (left <= TUB_OUT_PIECES) {
        tub = left ? `Shari: ${left} left! Cook more` : 'The ohitsu is empty! Cook more';
        tubColor = RED;
      } else if (left <= TUB_LOW_PIECES) {
        tub = `Shari low: ${left} left`;
        tubColor = YELLOW;
      }
    }
    let rice = '';
    if (working && pantry.riceSho < RICE_LOW_SHO - 1e-6) {
      rice = pantry.comingIn > 0 && pantry.comingSacks > 0 ? `Rice: ${riceText()}. The rice shop is coming` : `Rice: ${riceText()} left. Call the rice shop`;
    }
    let nori = '';
    if (working && pantry.noriSheets < NORI_LOW_SHEETS - 1e-6) {
      nori = pantry.comingIn > 0 && pantry.comingPacks > 0 ? `Nori: ${noriSheetsLeft()}. Coming` : `Nori: ${noriSheetsLeft()} left. Call the rice shop`;
    }
    const tubAt = stations.get(StationKind.RiceTub)?.pos;
    const tinAt = stations.get(StationKind.NoriBox)?.pos;
    this.show(this.tubWord, tub, tubColor, tubAt, 0.3);
    this.show(this.riceWord, rice, YELLOW, tubAt, tub ? 0.36 : 0.3);
    this.show(this.noriWord, nori, YELLOW, tinAt, 0.16);
  }

  private show(word: Word, text: string, color: string, at: Vector3 | undefined, lift: number): void {
    word.sprite.visible = text !== '' && !!at;
    if (!word.sprite.visible || !at) return;
    word.sprite.position.copy(at).add(this.tmp.set(0, lift, 0));
    if (text === word.text && color === word.color) return;
    word.text = text;
    word.color = color;
    setSpriteText(word.sprite, text, { color });
  }

  private hideWords(): void {
    this.tubWord.sprite.visible = this.riceWord.sprite.visible = this.noriWord.sprite.visible = false;
  }
}
