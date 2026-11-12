import { createSystem, type Object3D, Vector3 } from '@iwsdk/core';
import { chef, cupboard, type CupboardSide, prep } from './game-state.js';
import { hands } from './hands.js';
import { SINK_WIDTH } from './layout.js';
import { playPick } from './sfx.js';
import { Held } from './sushi-components.js';

/** The doors slide this far to open their half, in this time. */
const SLIDE = SINK_WIDTH / 2 - 0.02;
const SECONDS = 0.5;
const HANDLE_PICK = 0.07;
const SIDES: readonly CupboardSide[] = ['left', 'right'];

/** The cupboard under the sink (src/cupboard-system.ts): its doors, from the other systems. */
export const cupboardApi = {
  /** Slide a door open (the other shuts: they share the opening), or shut both. */
  open: (_side: CupboardSide | 'none'): void => {},
  /** How far that half is open, 0..1. */
  openness: (_side: CupboardSide): number => 0,
};

/**
 * The cupboard under the sink (the owner: 「流し台の下の物置でいいんじゃない？鍋もコメも」):
 * two sliding doors on the sink unit's near face, the left one running in
 * the outer groove. A pinch on a door's handle slides it open over the other
 * (so only one half is open at a time; a pinch on an open door's handle
 * shuts it). The suribachi lives in the left half (src/tamago-system.ts),
 * the range's pots in the right (src/range-system.ts).
 */
export class CupboardSystem extends createSystem({}) {
  private readonly doors: Record<CupboardSide, Object3D | null> = { left: null, right: null };
  private readonly homes: Record<CupboardSide, Vector3> = { left: new Vector3(), right: new Vector3() };
  private readonly open: Record<CupboardSide, number> = { left: 0, right: 0 };
  private want: CupboardSide | 'none' = 'none';
  private found = false;
  private readonly tmp = new Vector3();
  private readonly off = new Vector3();
  private readonly aim = new Vector3();

  init(): void {
    cupboardApi.open = (side) => {
      this.want = side;
    };
    cupboardApi.openness = (side) => this.open[side];
  }

  update(delta: number): void {
    if (!this.found && prep.active) this.find();
    if (!this.found) return;
    if (!prep.active && this.want !== 'none') this.want = 'none';
    if (prep.active) for (const side of [0, 1] as const) this.updateHand(side);
    for (const side of SIDES) {
      const target = this.want === side ? 1 : 0;
      if (this.open[side] !== target) {
        const step = delta / SECONDS;
        this.open[side] = this.open[side] < target ? Math.min(target, this.open[side] + step) : Math.max(target, this.open[side] - step);
        const door = this.doors[side]!;
        door.position.copy(this.homes[side]).setX(this.homes[side].x + (side === 'left' ? SLIDE : -SLIDE) * this.open[side]);
      }
    }
    cupboard.open = this.want;
    for (const side of SIDES) this.handle(side, side === 'left' ? cupboard.leftHandleAt : cupboard.rightHandleAt);
  }

  /** The doors, in the placed sink unit (by name). */
  private find(): void {
    const left = this.world.scene.getObjectByName('DoorL') ?? null;
    const right = this.world.scene.getObjectByName('DoorR') ?? null;
    if (!left || !right) return;
    this.doors.left = left;
    this.doors.right = right;
    this.homes.left.copy(left.position);
    this.homes.right.copy(right.position);
    this.found = true;
  }

  /** A door's handle (world): on its panel's inner end, toward the middle. */
  private handle(side: CupboardSide, out: Vector3): Vector3 {
    const door = this.doors[side]!;
    return door.getWorldPosition(out).add(this.off.set((side === 'left' ? 1 : -1) * (SINK_WIDTH / 4 - 0.08), 0, -0.02));
  }

  /** A pinch on a handle (judged where the fingers were before they closed): that door opens, or shuts if it is the open one. */
  private updateHand(side: 0 | 1): void {
    const hand = hands.all[side];
    if (!hand?.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None || prep.carrying[side]) return;
    hand.pinchPoint(this.aim);
    for (const s of SIDES) {
      if (this.aim.distanceTo(this.handle(s, this.tmp)) > HANDLE_PICK) continue;
      this.want = this.want === s ? 'none' : s;
      playPick();
      console.log(`[Cupboard] the ${s} door ${this.want === 'none' ? 'shut' : 'open'}`);
      return;
    }
  }
}
