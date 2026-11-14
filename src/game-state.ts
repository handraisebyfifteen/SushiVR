import { Vector3 } from '@iwsdk/core';
import { CORE_FROM, FROM_CASE, MENU, type MenuId, NETA, type NetaId, type PieceKind } from './menu.js';
import { DULL_CATCH_MAX, DULL_CATCH_MIN, KNIFE_DULL, KNIFE_WEAR_PER_CUT } from './tuning.js';
import { Held, Judge } from './sushi-components.js';
import { handedness, onHandsChanged } from './handedness.js';
import { stage } from './stage.js';

export type HeldKind = (typeof Held)[keyof typeof Held];
export type JudgeKind = (typeof Judge)[keyof typeof Judge];
export type Side = 0 | 1; // 0 = left hand, 1 = right hand

/** One hand's hygiene and what it carries. */
export interface HandState {
  dirt: number;
  needsWash: boolean;
  needsTowel: boolean;
  wet: boolean;
  holding: HeldKind;
}

export type Place = 'seat' | 'table' | 'range' | 'sink' | 'drain' | 'shelf';

/** Plain game state shared by the systems (fast to read every frame). */
export const chef = {
  hands: [
    { dirt: 0, needsWash: true, needsTowel: false, wet: false, holding: Held.None },
    { dirt: 0, needsWash: true, needsTowel: false, wet: false, holding: Held.None },
  ] as [HandState, HandState],
  /** Soap is on the hands (opening wash) or was used during service. */
  soaped: false,
  soapDuringService: false,
  open: false,
  boardDirt: 0,
  clothDirty: false,
  knifeDirty: false,
  /** Set by the knife system when the knife is put down dirty; consumed per piece. */
  knifeUnwiped: false,
  /** The edge: 1 freshly sharpened, worn by every cut (src/sharpen-system.ts); the morning starts with yesterday's wear. */
  knifeSharp: stage.on ? 1 : 0.6,
  /** A cut was made with a worn edge; consumed per piece. */
  knifeDull: false,
  facingBack: false,
  /** Where the chef is: on the stool at the bar, or a step back at the work table or the range (the morning prep). */
  at: 'seat' as Place,
  /** Side index of the rice hand and the neta hand (swapped for a left-handed chef, src/handedness.ts). */
  riceSide: (handedness.left ? 0 : 1) as Side,
  netaSide: (handedness.left ? 1 : 0) as Side,
};

onHandsChanged(() => {
  chef.riceSide = handedness.left ? 0 : 1;
  chef.netaSide = handedness.left ? 1 : 0;
});

/** True while a hand carries food, the knife or the finished piece (the wet cloth and the board may travel to the sink). */
export function holdingAnything(): boolean {
  return chef.hands.some((h) => h.holding !== Held.None && h.holding !== Held.Cloth && h.holding !== Held.DryCloth && h.holding !== Held.Dish && h.holding !== Held.Board);
}

/** The current order; null while no customer is seated. */
export interface Order {
  item: MenuId;
  wasabi: boolean;
}
export const service = {
  order: null as Order | null,
  /** Handedness of the seated customer and whether the chef has seen it yet. */
  customerLeftHanded: false,
  customerHandKnown: false,
  /** Pieces already eaten by the seated customer. */
  eatenByCustomer: 0,
};

/**
 * The customer's tea (お茶), asked for now and then and made out of the
 * customers' sight at the office corner (src/tea-system.ts): by the
 * part-timer when called in, otherwise by the chef, who points at the urn
 * and then sets the cup on the tsukedai.
 */
export const tea = {
  /** The seated customer asked for tea and has not had it. */
  wanted: false,
  /**
   * The cup: none; being poured at the urn by the chef; waiting at hand;
   * held; the part-timer's (poured at the office, then carried out); served
   * before the customer.
   */
  cup: 'none' as 'none' | 'pouring' | 'atHand' | 'held' | 'partTimer' | 'served',
  /** The cup has just been set before the customer (the customer thanks, then clears this). */
  justServed: false,
  /** The customer has left: the cup is cleared away (the tea system clears this). */
  clear: false,
  /** The urn (to point at), the cup, and the spot on the tsukedai before the customer (world). */
  urnAt: new Vector3(),
  cupAt: new Vector3(),
  serveAt: new Vector3(),
};

/**
 * Where the current piece stands, written each frame by the cutting, nigiri
 * and hygiene systems so the master can tell which step comes next.
 */
export const progress = {
  /** The nigiri in progress takes tsume (anago, hamaguri), and whether the brush has put it on. */
  tsumeWanted: false,
  tsume: false,
  sakuOnBoard: false,
  /** The saku on the board is not the ordered fish. */
  sakuWrong: false,
  knifeHeld: false,
  clothHeld: false,
  /** The kind of piece in progress, null until its first ingredient (a slice, a nori strip...). */
  kind: null as PieceKind | null,
  stage: 'None' as string,
  hasNeta: false,
  netaHeld: false,
  /**
   * Gunkan (made on the board): the rice in the hand has had its squeeze, the
   * shari is on the board, a nori strip is in the neta hand's pinch, the rice
   * is wrapped, the topping is on.
   */
  shaped: false,
  shariDown: false,
  noriHeld: false,
  /** The rice hand's finger holds the gunkan strip's end on the shari (two-point wrap). */
  noriPinned: false,
  wrapped: false,
  topped: false,
  /** Inari: the pouch is on the neta hand, the rice is in it, its mouth is folded shut. */
  ageHeld: false,
  stuffed: false,
  closed: false,
  /** Rolls: nori on the mat, how far the rice is spread (0..1), fillings on, rolled, squeezed, cuts made of cuts needed. */
  matNori: false,
  spread: 0,
  fillings: 0,
  rolled: false,
  squeezed: false,
  cutsDone: 0,
  cutsNeeded: 0,
  /** Where the next cut of the roll goes (world), and the middle of the roll or mat. */
  guideAt: new Vector3(),
  hasRice: false,
  wasabi: 'none' as 'none' | 'finger' | 'neta',
  /** performance.now() of the current metronome's first beat, 0 when none. */
  beatOrigin: 0,
  sakuAt: new Vector3(),
  /** The case slot of the saku on the board. */
  sakuHome: new Vector3(),
  sliceAt: new Vector3(),
  pieceAt: new Vector3(),
  /** Rolls whose core is cut in service (the tekka): the slice lies on the board (at sliceAt), or is on the neta hand. */
  coreOnBoard: false,
  coreHeld: false,
};

/** What the morning prep asks for next (for the master, practice and hints). */
export type PrepNext =
  | 'call'
  | 'wait'
  | 'take'
  | 'cut'
  | 'pull'
  | 'wipe'
  /** The hamaguri cooling on the board: nothing to do but wait. */
  | 'cool'
  /** The tsume brush over the opened hamaguri. */
  | 'tsume'
  | 'scale'
  | 'turn'
  | 'rinse'
  | 'pins'
  | 'stock'
  | 'pot'
  | 'discard'
  | 'liftBoard'
  | 'washBoard'
  | 'leanBoard'
  | 'dryBoard'
  | 'returnBoard'
  | 'noren';

/** The morning prep (仕込み), from the start of the day until the bar opens. */
export const prep = {
  /** A nigiri stage (src/stage.ts) has no morning: it starts at the counter. */
  active: !stage.on,
  /** The fish shop has been called, and its delivery (the ice box) has arrived. */
  ordered: false,
  delivered: false,
  /** Every prep task is finished. */
  done: stage.on,
  /** Scraps still on the board or in a hand (thrown away before opening). */
  scrapsLeft: 0,
  /** Each hand (left, right) carries something of the prep: the fish from the ice box, a scrap, a sheet of paper. */
  carrying: [false, false] as [boolean, boolean],
  /** The board has been washed at the sink, dried and put back. */
  boardWashed: false,
  /** Something was cut on the board this morning (a board nobody used needs no wash). */
  boardUsed: false,
  /** The hands were washed (soap) after the prep and cleaning. */
  washedAfter: false,
  /** What the next step says (the master's word for a cut or a pull). */
  say: '',
  /** The next guide line runs across the board (X) instead of toward the chef, or flat along the board (a shave). */
  guideAcross: false,
  guideLow: false,
  /** Burners still lit (the gas range): the bar does not open with the fire on. */
  burnersOn: 0,
  /** Something of the range's work lies on the board (the bonito belly): no fish goes on it meanwhile. */
  boardBusy: false,
  /** The next thing to take from the ice box goes into a pot on the range (not onto the board). */
  takeToPot: false,
  /** The id of the next material to take (PrepId; '' when none). */
  takeId: '',
  tasksDone: 0,
  tasksTotal: 0,
  next: null as PrepNext | null,
  /** The material on the board ('' when none). */
  onBoard: '',
  /** World points for the next action: the material to take from the ice box... */
  boxAt: new Vector3(),
  /** ...the middle of the material on the board, the middle of the next guide line and its length... */
  materialAt: new Vector3(),
  guideAt: new Vector3(),
  guideLength: 0,
  /** ...the two parts the hands pull apart (neta hand, rice hand)... */
  pullNeta: new Vector3(),
  pullRice: new Vector3(),
  /** ...and the next saku to stock and its place in the case. */
  productAt: new Vector3(),
  slotAt: new Vector3(),
  /** The next scrap to throw away and the trash bin; the paper box; the board while it is being washed. */
  scrapAt: new Vector3(),
  trashAt: new Vector3(),
  paperAt: new Vector3(),
  boardAt: new Vector3(),
  boardHome: new Vector3(),
  /** The noren at the entrance, hung inside until the bar opens. */
  norenAt: new Vector3(),
  // Stage 4: the whole fish, washed at the sink (水洗い).
  /** Where the next step is done: on the manaita, or on the wash board at the sink. */
  where: 'board' as 'board' | 'sink',
  /** Where the next material to take lies, and where it goes. */
  takeFrom: 'ice' as 'ice' | 'fish' | 'wash',
  takeTo: 'board' as 'board' | 'wash' | 'pot',
  /** A hand carries a material (from a box or the wash board). */
  materialHeld: false,
  /** Where the next product goes (the case, the ice, its curing tray), and a hand carries it. */
  stockTo: 'case' as 'case' | 'ice' | 'cure',
  productHeld: false,
  /** Something at the sink wants the chef there (a fish to wash, its scraps). */
  sinkWanted: false,
  /** A fish lies on the wash board over the basin: hands there are working on it, not washing. */
  washBusy: false,
  /** The wash board's middle, the spot to rub under the tap, the sink's trash bin. */
  washAt: new Vector3(),
  rinseAt: new Vector3(),
  sinkBinAt: new Vector3(),
  /** The tools' grips and whether each is in a hand: the scaler, the deba (sink), the tweezers (board). */
  scalerAt: new Vector3(),
  debaAt: new Vector3(),
  tweezersAt: new Vector3(),
  scalerHeld: false,
  debaHeld: false,
  tweezersHeld: false,
  /** The pin bones still in the fillet (world tips), for the tweezers. */
  pinsAt: [] as Vector3[],
};

/** The shari of the day (src/shari-system.ts): cooked, vinegared and cut on the work table, then into the ohitsu. */
export type ShariStep = 'light' | 'cooking' | 'steaming' | 'turnOut' | 'vinegar' | 'cut' | 'scoop' | 'return' | 'done';
export const shari = {
  step: 'light' as ShariStep,
  /** Seconds left on the flame or steaming. */
  left: 0,
  /** The ohitsu stands on the work table (brought for the scooping); a hand holds it. */
  tubOnTable: false,
  tubHeld: false,
  scoops: 0,
  /** A scoop of shari is on the paddle. */
  loaded: false,
  /** The ohitsu holds the day's shari (the bar's rice comes from it). */
  inTub: false,
  /** World points: the cooker's gas tap, the hangiri's middle, the awasezu bowl, the paddle's grip, the ohitsu at home and on the table. */
  cookerAt: new Vector3(),
  hangiriAt: new Vector3(),
  awasezuAt: new Vector3(),
  shamojiAt: new Vector3(),
  tubHomeAt: new Vector3(),
  tubTableAt: new Vector3(),
  /** The paddle is in a hand; the awasezu is in a hand. */
  shamojiHeld: false,
  awasezuHeld: false,
};

/** One pot on the range (src/range-system.ts), or the grill net. */
export interface BurnerView {
  id: string;
  /** 0 off, 1 low, 2 medium, 3 high. */
  level: number;
  temp: number;
  liquid: number;
  state: 'empty' | 'cooking' | 'done' | 'out';
  /** Its pot is in the cupboard under the sink (full difficulty: it comes out when its ingredient is next), and where to take it by (world). */
  stored: boolean;
  potAt: Vector3;
  /** The grill net is on this burner (its pot put away). */
  net: boolean;
  /** The tamago's square pan is on this burner (full difficulty). */
  pan: boolean;
  /** What is wanted of it next, for the master and practice ('' when nothing): its ingredient in, the knob to `target`, it out. */
  want: '' | 'put' | 'knob' | 'take';
  target: number;
  /** The pot's middle (or the net's), and the knob's face (world). */
  at: Vector3;
  knobAt: Vector3;
}

/** What the curing on the drainboard (src/cure-system.ts) wants next, and of which tray. */
export type CureNext = 'bed' | 'salt' | 'rinse' | 'back' | 'move' | 'out' | 'case' | 'soon' | 'wait';

/**
 * The full difficulty's curing (締め) on the drainboard: the kohada salted
 * on both sides on a bamboo basket, rinsed in a bowl of water, drained, the
 * saba salted in its tray and rinsed under the tap; then each into the one
 * enamel container of vinegar. Published by src/cure-system.ts each frame.
 */
export const cure = {
  /** Something there wants the chef (salt, a rinse, the fish moved on, taking them out). */
  wanted: false,
  next: null as CureNext | null,
  /** Which fish it is about ('Kohada' or 'Saba'). */
  tray: '',
  /** Its words for the master: "Salt them: about 45 min, they are large". */
  say: '',
  /** Shop minutes until the fish's time (salt or vinegar), as a guide. */
  left: 0,
  /** World points: the basket or tray, its rim, where salt is still wanted, the salt bowl, the vinegar container, the tap. */
  trayAt: new Vector3(),
  rimAt: new Vector3(),
  saltAt: new Vector3(),
  bowlAt: new Vector3(),
  potAt: new Vector3(),
  tapAt: new Vector3(),
  /** Where the fish are to be taken up now, and where they go next. */
  fishAt: new Vector3(),
  dropAt: new Vector3(),
  /** The case item the cured fish go to. */
  caseAt: new Vector3(),
  /** A hand holds the salt, the basket or tray, the fish (on to the next place, or to the case). */
  saltHeld: false,
  trayHeld: false,
  fishHeld: false,
  /** Asked for: skip the shop's time ahead to where the next time's Good begins (the timer's pinch), or to the time itself (practice mode). */
  skip: null as 'good' | 'aim' | null,
  /** Each time's grade this morning, as the fish came out of the salt or the vinegar (for the result). */
  grades: [] as Array<{ fish: string; stage: 'salt' | 'vinegar'; grade: 'Excellent' | 'Good' | 'Poor' | 'Bad'; minutes: number; aim: number }>,
};

/** The range in the morning prep: four pots, then the net for the bonito belly. */
export const range = {
  burners: [] as BurnerView[],
  /** The bonito belly's sear: where it is in its work. */
  belly: 'none' as 'none' | 'ice' | 'board' | 'skewered' | 'net' | 'chilling' | 'chilled' | 'wet' | 'patted' | 'free' | 'done',
  /** Every face seared enough; a hand holds it. */
  bellySeared: false,
  bellyHeld: false,
  /** The belly's middle; the skewers' rings (where they are pinched). */
  bellyAt: new Vector3(),
  ringsAt: new Vector3(),
  /** The face of the belly down on the net (0 skin, 1-3 round). */
  bellyFace: 0,
  netAt: new Vector3(),
  /** The burner the net is on (-1: on its hook); a hand holds it. */
  netOn: -1,
  netHeld: false,
  /** Something cooked is in a hand on its way to the case (its case item). */
  ingHeld: false,
  /** A hand holds a pot (from the cupboard under the sink to its burner). */
  potHeld: false,
  caseNeta: '',
  /** That item's place in the case (world); for the hamaguri, their spot on the board. */
  caseAt: new Vector3(),
  /** What is in the hand goes onto the board, not into the case (the hamaguri, to cool and be worked there). */
  toBoard: false,
  /** The belly's face down on the net has had its sear. */
  faceDone: false,
  /** The burner the tamago's pan is on (-1: on its hook), and the flame it wants (0 off, 1 low). */
  panOn: -1,
  panTarget: 0,
};

export type CupboardSide = 'left' | 'right';
/** The cupboard under the sink (src/cupboard-system.ts): which half is open, and where each door's handle is (world). */
export const cupboard = {
  open: 'none' as CupboardSide | 'none',
  leftHandleAt: new Vector3(),
  rightHandleAt: new Vector3(),
};

/** What the tamago (full difficulty, src/tamago-system.ts) wants next. */
export type TamagoNext = 'cupboard' | 'suribachi' | 'makings' | 'grind' | 'eggs' | 'salt' | 'sugar' | 'whisk' | 'pan' | 'place' | 'heat' | 'oil' | 'pour' | 'bake' | 'turn' | 'lid' | 'press' | 'turnOut' | 'cool' | 'wipe' | 'out' | 'case';

/**
 * The full difficulty's tamago (厚焼き): the suribachi from the cupboard under
 * the sink onto the work table, the batter made in it (the scallops ground
 * with the pestle, the eggs tapped in from their pack, mixed with chopsticks
 * till frothy), the square pan onto a free burner, the batter poured, baked
 * on a low flame, turned once, out into the case. Published by
 * src/tamago-system.ts each frame.
 */
export const tamago = {
  next: null as TamagoNext | null,
  /** Its words for the master. */
  say: '',
  /** World points: the suribachi's place on the work table, the suribachi's middle (over its floor), its front rim, the pestle's grip, the chopsticks' grip, the pack of eggs. */
  tableAt: new Vector3(),
  bowlAt: new Vector3(),
  rimAt: new Vector3(),
  pestleAt: new Vector3(),
  sticksAt: new Vector3(),
  /** The salt and sugar jars' grips (on the food shelf, or in hand). */
  saltAt: new Vector3(),
  sugarAt: new Vector3(),
  packAt: new Vector3(),
  /** A hand holds the pestle (grinding), the chopsticks (mixing), the suribachi (from the cupboard, or to pour). */
  pestleHeld: false,
  sticksHeld: false,
  /** A hand holds the salt or sugar jar. */
  jarHeld: false,
  bowlHeld: false,
  /** The oil pot's knob (on the food shelf, or in hand); the lid's bar (on its hook, in hand, on the pan); the tamago (in the pan or on its lid). */
  oilAt: new Vector3(),
  lidAt: new Vector3(),
  eggAt: new Vector3(),
  /** A hand holds the oil pot, the lid, the chopsticks at the range (for the toss). */
  oilHeld: false,
  lidHeld: false,
  flipSticksHeld: false,
  /** World points: the handle's grip (on the hook or on the burner), the pan's middle, a free burner, the case item. */
  gripAt: new Vector3(),
  panAt: new Vector3(),
  burnerAt: new Vector3(),
  caseAt: new Vector3(),
  /** A hand holds the pan (to a burner), or the baked tamago (to the case). */
  panHeld: false,
  eggHeld: false,
};

/**
 * The cook and the part-timer (src/staff-system.ts). Nobody is out in the
 * bar by default: during the prep the chef calls one in with their button
 * on the office wall (src/office-system.ts), and they come out of the
 * kitchen for the job and go back when it is done. The cook takes the fish
 * still in the ice box, the part-timer does the cleaning once the prep is
 * done. They are simply called in or not: there are no wages (the game has
 * no money).
 */
export const staff = {
  /** Asked to work today. */
  cook: false,
  partTimer: false,
  /** Where the office's call buttons and the phone's handset are (world), for pointing at them. */
  cookButtonAt: new Vector3(),
  partTimerButtonAt: new Vector3(),
  phoneAt: new Vector3(),
  /** The cook stands at the ice box, ready to take a fish; the fish he is on ('' when none); fish left in the box. */
  cookReady: false,
  cookOn: '',
  boxLeft: 0,
  /** Cleaning wants doing (prep done, scraps or an unwashed board, the board at home); the part-timer is at the board; under way. */
  cleanupWanted: false,
  partTimerReady: false,
  cleaning: false,
  /** A customer waits at the entrance to be shown in; the part-timer has come to the door for them. */
  guestAtDoor: false,
  guideReady: false,
};

/** The end of the day: the noren taken in (last orders), then the last customer gone. */
export const day = {
  /** Seconds since the bar opened. */
  openFor: 0,
  closing: false,
  closed: false,
};

/** The knife's edge wears with a cut; worn past KNIFE_DULL, the cut marks the piece. */
export function wearKnife(): void {
  chef.knifeSharp = Math.max(0, chef.knifeSharp - KNIFE_WEAR_PER_CUT);
  if (chef.knifeSharp < KNIFE_DULL) chef.knifeDull = true;
}

/** A stroke with a dull edge catches in the flesh (the slice stays on): at random, more often the duller the edge (the owner: a dull knife should hurt a little). */
export function edgeCatches(): boolean {
  if (chef.knifeSharp >= KNIFE_DULL) return false;
  const dullness = 1 - chef.knifeSharp / KNIFE_DULL;
  return Math.random() < DULL_CATCH_MIN + (DULL_CATCH_MAX - DULL_CATCH_MIN) * dullness;
}

/** The whetstone at the sink (包丁研ぎ, src/sharpen-system.ts). */
export const sharpen = {
  /** Wetted in the basin (it dries overnight). */
  stoneWet: false,
  /** Sharpened this morning: the bar may open. */
  doneToday: false,
  /** The blade was rinsed after the stone (then it is wiped). */
  rinsed: true,
  /** The strokes so far, 0..1, while the blade is on the stone. */
  progress: 0,
};

/**
 * The fish shop's inserts (中子) the range's ingredients come in, and the
 * anago's pack (src/nakago-system.ts): emptied into the pots, the pack into
 * the trash; the inserts one at a time, washed at the sink under the other
 * hand, dried with the cloth from the sink's front edge, stacked upside down
 * on the sink's end strip.
 */
export const nakago = {
  /** The dry cloth's grip (world, hanging on the sink's front edge), and the hand it is in. */
  clothAt: new Vector3(),
  clothHeld: null as Side | null,
  /** Delivered today and not yet dealt with (inserts to wash and stack, the pack to throw out). */
  left: 0,
  /** Every ingredient that came in one is in its pot (none left in the box or in a hand): the empties can go. */
  ready: false,
  /** The anago's pack is still to be thrown out. */
  pack: false,
  /** An insert (or the pack) is in this hand. */
  held: null as Side | null,
  heldKind: null as 'nakago' | 'pack' | null,
  /** The held insert's state. */
  washed: false,
  dried: false,
  /** The next thing to pinch (the pack, or the pile's top insert; the held one's middle while in hand), world; where the washed inserts go (the sink's end strip), for hints and practice. */
  at: new Vector3(),
  rackAt: new Vector3(),
};
/** The empty inserts want washing: once every ingredient that came in one is in its pot, before the fish under them. */
export function nakagoWanted(): boolean {
  return prep.active && nakago.left > 0 && (nakago.held !== null || nakago.ready);
}
/** The knife wants the stone: in the morning, once the board is washed and back (the scraps gone), before the noren. */
export function sharpenWanted(): boolean {
  return prep.active && !sharpen.doneToday && prep.done && prep.scrapsLeft === 0 && prep.boardWashed && nakago.left === 0;
}

/** Cleaning is done after the prep: no scraps, the board washed and back, the knife wiped and down. */
export function prepCleaned(): boolean {
  return prep.done && prep.scrapsLeft === 0 && prep.boardWashed && nakago.left === 0 && !progress.knifeHeld && !chef.knifeDirty;
}

/** The noren may be hung out: prep and cleaning done, hands washed after, the fire out (or there was no prep). */
export function prepReady(): boolean {
  return !prep.active || (prepCleaned() && prep.washedAfter && prep.burnersOn === 0 && sharpen.doneToday);
}

/** The kind of the current order (nigiri, gunkan...), or null. */
export function orderKind(): PieceKind | null {
  return service.order ? MENU[service.order.item].kind : null;
}

/** The order takes this neta as its topping (either one, for a pair of pieces); true with no order. */
export function orderTakes(neta: NetaId): boolean {
  if (!service.order) return true;
  const m = MENU[service.order.item];
  // A roll takes the saku its core is cut from (the tekka: the lean tuna).
  if (m.kind === 'maki') return m.neta.some((n) => CORE_FROM[n] === neta);
  if (FROM_CASE[m.neta[0]] === neta) return true;
  return m.pair ? m.neta.includes(neta) : m.neta[0] === neta;
}

/** The neta of the current order's first ingredient (the topping of a nigiri; for a roll whose core is cut in service, the saku it is cut from). */
export function orderNeta(): NetaId | null {
  if (!service.order) return null;
  const n = MENU[service.order.item].neta[0];
  return FROM_CASE[n] ?? CORE_FROM[n] ?? n;
}

/**
 * Units left in the neta case per neta (slices, pieces or servings), kept
 * current by NetaCaseSystem from the CaseItem components.
 */
export const caseStock = Object.fromEntries(Object.keys(NETA).map((id) => [id, 0])) as Record<NetaId, number>;

/** The tsume pot and its brush on the counter (src/tsume-system.ts), for the master, practice and hints. */
export const tsume = {
  /** The brush's grip (world): in its pot, or in the hand. */
  gripAt: new Vector3(),
  /** The pot's middle (world). */
  potAt: new Vector3(),
  /** The hand holding the brush, or -1. */
  held: -1 as -1 | Side,
};

/** The kuruma-ebi's work at the board (src/prawn-system.ts), for the master and practice. */
export type PrawnNext = 'board' | 'skewer' | 'pot' | 'boil' | 'out' | 'chill' | 'cold' | 'iceOut' | 'unskewer' | 'peel' | 'hand' | null;
export const prawn = {
  next: null as PrawnNext,
  /** Boiled (the order) or peeled raw. */
  boil: true,
  /** The prawn's middle, its head end, the skewer's grip end (world). */
  at: new Vector3(),
  headAt: new Vector3(),
  skewerAt: new Vector3(),
  /** Its spot on the board, the water's surface in the pot and in the ice-water bowl (world). */
  boardAt: new Vector3(),
  potAt: new Vector3(),
  bowlAt: new Vector3(),
  /** Seconds in the boiling water, and then in the ice water, so far. */
  boilT: 0,
  chillT: 0,
  /** The last boiled prawn's grade (read when the nigiri is served). */
  lastBoil: null as 'Excellent' | 'Good' | 'Poor' | 'Bad' | null,
};
