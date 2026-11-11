import { Quaternion, Vector3, type Object3D } from '@iwsdk/core';
import { StationKind } from './sushi-components.js';

/**
 * The chef's handedness (利き手). A left-handed chef works the counter
 * mirrored (the owner, 2026-11-10: "勝手を左手用にする"): the knife (a
 * left-handed one) and its cloth, the tezu and the wasabi, the rice tub and
 * the trash bin, and with them everything else on the work counter, change
 * sides, and the neta case's contents are reversed (the user: "ネタケース
 * の中身も逆"), each taken by the opposite hand to a right-handed chef's.
 * The neta case itself, the back row (sink, work table, range) and the
 * dish cabinet stay where they are; what the range uses is carried from
 * the stool (the ice box is out of reach there). The scene is authored right-handed;
 * the mirrored places are worked out at run time from the authored ones.
 * The choice is kept in the browser.
 */
const KEY = 'sushi-vr.handedness';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === 'left';
  } catch {
    return false;
  }
}

export const handedness = {
  left: load(),
  /** Bumped on every change, for systems that keep places. */
  version: 0,
};

export function saveHandedness(): void {
  try {
    localStorage.setItem(KEY, handedness.left ? 'left' : 'right');
  } catch {
    /* storage unavailable: the choice lasts this visit */
  }
}

/** An X on the chef's counter, authored right-handed, for the chef there is. */
export function sideX(x: number): number {
  return handedness.left ? -x : x;
}

/** +1 for a right-handed chef, -1 for a left-handed one. */
export function sideSign(): number {
  return handedness.left ? -1 : 1;
}

/**
 * How a prop crosses over: 'flip' makes it the mirror image of itself
 * (the trash bin's lid then hinges on the outer side, the mat rolls up at
 * the board's other edge), its X scale negated; 'blade' is the same mirror
 * image for the knife (a left-handed yanagiba), written so that the knife
 * keeps it when held (see homePose); 'turn' only moves it across, for the
 * dishes, which are picked up and set down by hand and look alike either
 * way; 'move' moves it across as it is, facing the same way (the case's
 * items: the order is reversed, each item unchanged).
 */
export type CrossOver = 'flip' | 'blade' | 'turn' | 'move';

/** The stations that change sides. */
export const SIDE_PROPS: Partial<Record<string, CrossOver>> = {
  [StationKind.Knife]: 'blade',
  [StationKind.KnifeHolder]: 'flip',
  [StationKind.WetCloth]: 'flip',
  [StationKind.Tezu]: 'turn',
  [StationKind.Wasabi]: 'turn',
  [StationKind.NoriBox]: 'flip',
  [StationKind.PaperBox]: 'flip',
  [StationKind.Makisu]: 'flip',
  [StationKind.IceBox]: 'flip',
  [StationKind.TrashBin]: 'flip',
  [StationKind.RiceTub]: 'flip',
};

export interface Pose {
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

const authored = new Map<Object3D, { pose: Pose; how: CrossOver }>();
/** Half a turn about Z: with a flip of Y it makes the flip of X (see homePose). */
const HALF_TURN_Z = new Quaternion(0, 0, 1, 0);

/** Keep a side prop's authored (right-handed) place, once, before anything moves it. */
export function rememberAuthored(object: Object3D, how: CrossOver): void {
  if (authored.has(object)) return;
  authored.set(object, {
    pose: { position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() },
    how,
  });
}

/**
 * Where a side prop lives for this chef, from its authored place: as
 * authored, or reflected across the chef's centre line (x = 0). A
 * reflection of a rotation (x, y, z, w) is (x, -y, -z, w). A 'turn' prop
 * keeps its own handedness; a 'flip' prop becomes its mirror image, its X
 * scale negated; the knife becomes its mirror image written as half a turn
 * about its own Z with its thickness (Y) flipped, so that held in the
 * hand, where its rotation is set afresh and its scale kept, the blade
 * still runs along the fingers, edge down, its bevel on the other face.
 */
export function homePose(object: Object3D, out: Pose): boolean {
  const entry = authored.get(object);
  if (!entry) return false;
  const { pose, how } = entry;
  out.position.copy(pose.position);
  out.quaternion.copy(pose.quaternion);
  out.scale.copy(pose.scale);
  if (!handedness.left) return true;
  out.position.x = -out.position.x;
  if (how === 'move') return true;
  const q = out.quaternion;
  q.set(q.x, -q.y, -q.z, q.w);
  if (how === 'blade') {
    q.multiply(HALF_TURN_Z);
    out.scale.y = -out.scale.y;
  } else if (how === 'flip') {
    out.scale.x = -out.scale.x;
  }
  return true;
}

const scratch: Pose = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3() };

/** Put a side prop at its home for this chef. */
export function placeHome(object: Object3D): void {
  if (!homePose(object, scratch)) return;
  object.position.copy(scratch.position);
  object.quaternion.copy(scratch.quaternion);
  object.scale.copy(scratch.scale);
}

/** Every side prop seen so far. */
export function sideProps(): IterableIterator<Object3D> {
  return authored.keys();
}

const listeners = new Set<() => void>();

/** Called after every change of hands; returns the unsubscribe. */
export function onHandsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Change hands: kept in the browser, and every listener moves its things across. */
export function setLeftHanded(left: boolean): void {
  if (handedness.left === left) return;
  handedness.left = left;
  handedness.version++;
  saveHandedness();
  console.log(`[Hands] ${left ? 'left' : 'right'}-handed: the counter's props cross over`);
  for (const fn of listeners) fn();
}
