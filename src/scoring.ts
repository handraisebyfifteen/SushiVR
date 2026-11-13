import type { IconKind } from './text-sprites.js';
import { Judge } from './sushi-components.js';
import type { JudgeKind } from './game-state.js';
import type { MenuId } from './menu.js';

/** Everything known about one served piece, judged together at serving time. */
export interface PieceResult {
  /** Every timed beat of this piece (the rice, then the kind's own touches). */
  judges: readonly JudgeKind[];
  itemOk: boolean;
  /** What was made, when it is not simply the order (one piece of a bonito pair). */
  served: MenuId | null;
  wasabiOk: boolean;
  /** Tsume brushed on where it belongs (anago, hamaguri), and nowhere else. */
  tsumeOk: boolean;
  /** A boiled kuruma-ebi's boil (about ten seconds), or null. */
  prawnBoil: 'Excellent' | 'Good' | 'Poor' | 'Bad' | null;
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
  /** Cut with a worn edge (the knife not sharpened). */
  knifeDull: boolean;
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
 * 100 points: rhythm 30, right item 15, wasabi 10, orientation 15 (head 6,
 * angle 6, skin 3), hospitality 10, freshness 10, hygiene 10. Serving with
 * unwashed hands also costs 20 more (food-poisoning risk). A dirty board,
 * soap during service and an unwiped knife each cost 5. The anago or the
 * hamaguri without its tsume (or tsume where none goes) costs 10; a prawn
 * boiled well off its ten seconds 5 (Poor) or 15 (Bad).
 */
export function scorePiece(r: PieceResult): Score {
  const penalties: IconKind[] = [];
  let score = 0;
  const rhythm = r.judges.length ? r.judges.reduce((sum, j) => sum + JUDGE_POINTS[j], 0) / r.judges.length : 100;
  score += (rhythm / 100) * 30;
  if (rhythm < 70) penalties.push('rhythm');
  if (r.itemOk) score += 15;
  else penalties.push('fish');
  if (r.wasabiOk) score += 10;
  else penalties.push('wasabi');
  if (!r.tsumeOk) {
    score -= 10;
    penalties.push('tsume');
  }
  // The prawn under- or over-boiled: raw in the middle, or tough.
  if (r.prawnBoil === 'Poor' || r.prawnBoil === 'Bad') {
    score -= r.prawnBoil === 'Bad' ? 15 : 5;
    penalties.push('boil');
  }
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
  if (r.knifeDull) {
    // A worn edge tears the cut face.
    score -= 10;
    if (!penalties.includes('knife')) penalties.push('knife');
  }
  score += hygiene;
  score = Math.max(0, Math.round(score));
  const grade = score >= 85 ? 'Excellent' : score >= 65 ? 'Good' : score >= 40 ? 'Poor' : 'Bad';
  return { score, grade, penalties };
}
