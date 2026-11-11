import type { Kind } from './station-system.js';

/**
 * The master's ears: gameplay systems report what just happened here, and
 * the master system reads it once per frame. Events are rare (one per action),
 * so pushing to small arrays costs nothing per frame.
 */

/** One step of the basic process, in the order a chef works. */
export type StepKey =
  | 'turnBack'
  | 'turnFront'
  | 'soap'
  | 'washHands'
  | 'towel'
  | 'takeCloth'
  | 'wipeBoard'
  | 'rinseCloth'
  | 'takeSaku'
  | 'returnSaku'
  | 'holdKnife'
  | 'cut'
  | 'wipeKnife'
  | 'putKnife'
  | 'takeNeta'
  | 'tezu'
  | 'rice'
  | 'wasabi'
  | 'join'
  | 'touch1'
  | 'flip'
  | 'touch2'
  | 'rotate'
  | 'touch3'
  | 'place'
  | 'serve'
  // gunkan
  | 'takeNori'
  | 'wrapNori'
  | 'spoonTopping'
  // inari
  | 'takeAge'
  | 'stuffAge'
  | 'closeAge'
  // rolls
  | 'layNori'
  | 'spreadRice'
  | 'placeFilling'
  | 'rollMaki'
  | 'squeezeRoll'
  | 'cutRoll'
  // morning prep
  | 'callFishShop'
  | 'orderFish'
  | 'stepDrain'
  | 'layCure'
  | 'saltCure'
  | 'rinseCure'
  | 'vinegarCure'
  | 'cureOut'
  | 'waitCure'
  | 'panOn'
  | 'cupboardTamago'
  | 'suribachiOut'
  | 'grindTamago'
  | 'eggsTamago'
  | 'whiskTamago'
  | 'pourTamago'
  | 'turnEgg'
  | 'eggOut'
  | 'takeMaterial'
  | 'cutPrep'
  | 'pullPrep'
  | 'wipePaper'
  | 'stockSaku'
  | 'discardScrap'
  | 'liftBoard'
  | 'washBoard'
  | 'leanBoard'
  | 'returnBoard'
  | 'hangNoren'
  // the back row: stepping there, the shari, the range
  | 'stepTable'
  | 'stepRange'
  | 'stepSink'
  | 'stepSeat'
  | 'lightRice'
  | 'turnOutRice'
  | 'pourAwasezu'
  | 'cutShari'
  | 'bringTub'
  | 'scoopShari'
  | 'returnTub'
  | 'potIn'
  | 'turnKnob'
  | 'potOut'
  | 'hangNet'
  | 'skewer'
  | 'searTurn'
  | 'chillBelly'
  | 'unskewer'
  | 'bellyBoard'
  | 'bellyNet'
  | 'toCase'
  // stage 4: the whole fish
  | 'scaleFish'
  | 'turnFish'
  | 'rinseFish'
  | 'holdDeba'
  | 'putDeba'
  | 'pullPins'
  | 'putTool'
  // customer care
  | 'check'
  | 'makeTea'
  | 'serveTea';

/** Mistakes the master corrects with a word, whatever has been learned. */
export type MistakeKey = 'needSoap' | 'soapInService' | 'washFirst' | 'wrongItem' | 'wrongHand' | 'knifeUnwiped';

export type Grade = 'Excellent' | 'Good' | 'Poor' | 'Bad';

export const coach = {
  doneSteps: [] as StepKey[],
  mistakes: [] as Array<{ key: MistakeKey; at: Kind | null }>,
  /** The player tried something that did nothing (e.g. rice with a dry hand). */
  nudged: false,
  servedGrade: null as Grade | null,

  done(key: StepKey): void {
    this.doneSteps.push(key);
  },
  mistake(key: MistakeKey, at: Kind | null = null): void {
    this.mistakes.push({ key, at });
  },
  nudge(): void {
    this.nudged = true;
  },
  served(grade: Grade): void {
    this.servedGrade = grade;
  },
};
