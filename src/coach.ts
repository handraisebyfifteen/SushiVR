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
  | 'cutRoll';

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
