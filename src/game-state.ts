import { Vector3 } from '@iwsdk/core';
import { MENU, type MenuId, NETA, type NetaId, type PieceKind } from './menu.js';
import { Held, Judge } from './sushi-components.js';
import { CHEF_LEFT_HANDED } from './tuning.js';

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
  facingBack: false,
  /** Side index of the rice hand and the neta hand. */
  riceSide: (CHEF_LEFT_HANDED ? 0 : 1) as Side,
  netaSide: (CHEF_LEFT_HANDED ? 1 : 0) as Side,
};

/** True while a hand carries food, the knife or the finished piece (the wet cloth and the board may travel to the sink). */
export function holdingAnything(): boolean {
  return chef.hands.some((h) => h.holding !== Held.None && h.holding !== Held.Cloth && h.holding !== Held.Dish && h.holding !== Held.Board);
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
 * Where the current piece stands, written each frame by the cutting, nigiri
 * and hygiene systems so the master can tell which step comes next.
 */
export const progress = {
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
  /** Gunkan: a nori strip is on the neta hand, the rice is wrapped, the topping is on. */
  noriHeld: false,
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
};

/** What the morning prep asks for next (for the master, practice and hints). */
export type PrepNext =
  | 'call'
  | 'wait'
  | 'take'
  | 'cut'
  | 'pull'
  | 'wipe'
  | 'stock'
  | 'discard'
  | 'liftBoard'
  | 'washBoard'
  | 'leanBoard'
  | 'dryBoard'
  | 'returnBoard'
  | 'noren';

/** The morning prep (仕込み), from the start of the day until the bar opens. */
export const prep = {
  active: true,
  /** The fish shop has been called, and its delivery (the ice box) has arrived. */
  ordered: false,
  delivered: false,
  /** Every prep task is finished. */
  done: false,
  /** Scraps still on the board or in a hand (thrown away before opening). */
  scrapsLeft: 0,
  /** The board has been washed at the sink, dried and put back. */
  boardWashed: false,
  /** The hands were washed (soap) after the prep and cleaning. */
  washedAfter: false,
  /** What the next step says (the master's word for a cut or a pull). */
  say: '',
  /** The next guide line runs across the board (X) instead of toward the chef, or flat along the board (a shave). */
  guideAcross: false,
  guideLow: false,
  /** Burners still lit (the gas range, a later stage): the bar does not open with the fire on. */
  burnersOn: 0,
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
};

/** Cleaning is done after the prep: no scraps, the board washed and back, the knife wiped and down. */
export function prepCleaned(): boolean {
  return prep.done && prep.scrapsLeft === 0 && prep.boardWashed && !progress.knifeHeld && !chef.knifeDirty;
}

/** The noren may be hung out: prep and cleaning done, hands washed after, the fire out (or there was no prep). */
export function prepReady(): boolean {
  return !prep.active || (prepCleaned() && prep.washedAfter && prep.burnersOn === 0);
}

/** The kind of the current order (nigiri, gunkan...), or null. */
export function orderKind(): PieceKind | null {
  return service.order ? MENU[service.order.item].kind : null;
}

/** The neta of the current order's first ingredient (the topping of a nigiri). */
export function orderNeta(): NetaId | null {
  return service.order ? MENU[service.order.item].neta[0] : null;
}

/**
 * Units left in the neta case per neta (slices, pieces or servings), kept
 * current by NetaCaseSystem from the CaseItem components.
 */
export const caseStock = Object.fromEntries(Object.keys(NETA).map((id) => [id, 0])) as Record<NetaId, number>;
