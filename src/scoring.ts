import type { IconKind } from './text-sprites.js';
import { Judge } from './sushi-components.js';
import type { JudgeKind } from './game-state.js';

/** Everything known about one served piece, judged together at serving time. */
export interface PieceResult {
  judges: [JudgeKind, JudgeKind, JudgeKind, JudgeKind];
  fishOk: boolean;
  wasabiOk: boolean;
  headOk: boolean;
  angleOk: boolean;
  skinOk: boolean;
  hospitalityOk: boolean;
  /** 1 = just cut, 0 = stale. */
  freshness: number;
  handsDirty: boolean;
  boardDirty: boolean;
  soapDuringService: boolean;
  knifeUnwiped: boolean;
}

export interface Score {
  score: number;
  grade: 'Excellent' | 'Good' | 'Poor' | 'Bad';
  penalties: IconKind[];
}

const JUDGE_POINTS: Record<JudgeKind, number> = {
  [Judge.None]: 0,
  [Judge.Excellent]: 100,
  [Judge.Good]: 70,
  [Judge.Poor]: 40,
  [Judge.Bad]: 10,
};

/**
 * 100 points: rhythm 30, right fish 15, wasabi 10, orientation 15 (head 6,
 * angle 6, skin 3), hospitality 10, freshness 10, hygiene 10. Serving with
 * unwashed hands also costs 20 more (food-poisoning risk). A dirty board,
 * soap during service and an unwiped knife each cost 5.
 */
export function scorePiece(r: PieceResult): Score {
  const penalties: IconKind[] = [];
  let score = 0;
  const rhythm = r.judges.reduce((sum, j) => sum + JUDGE_POINTS[j], 0) / r.judges.length;
  score += (rhythm / 100) * 30;
  if (rhythm < 70) penalties.push('rhythm');
  if (r.fishOk) score += 15;
  else penalties.push('fish');
  if (r.wasabiOk) score += 10;
  else penalties.push('wasabi');
  if (r.headOk) score += 6;
  if (r.angleOk) score += 6;
  if (r.skinOk) score += 3;
  if (!r.headOk || !r.angleOk || !r.skinOk) penalties.push('orientation');
  if (r.hospitalityOk) score += 10;
  else penalties.push('hand');
  score += 10 * r.freshness;
  if (r.freshness < 0.99) penalties.push('fresh');
  let hygiene = 10;
  if (r.handsDirty) {
    hygiene = -20;
    penalties.push('hygiene');
  }
  if (r.boardDirty) {
    hygiene -= 5;
    penalties.push('board');
  }
  if (r.soapDuringService) {
    hygiene -= 5;
    penalties.push('soap');
  }
  if (r.knifeUnwiped) {
    hygiene -= 5;
    penalties.push('knife');
  }
  score += hygiene;
  score = Math.max(0, Math.round(score));
  const grade = score >= 85 ? 'Excellent' : score >= 65 ? 'Good' : score >= 40 ? 'Poor' : 'Bad';
  return { score, grade, penalties };
}
