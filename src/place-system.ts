import { createSystem, type Object3D, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { COLOR_HINT, glowObject } from './feedback.js';
import { type FarTarget, FarChooser } from './far-choice.js';
import { chef, cure, type Place, prep, tamago } from './game-state.js';
import {
  BACK_ROW_Z,
  BACK_SPOT_Z,
  DRAIN_SPOT_X,
  MANAITA_TOP,
  MANAITA_Z,
  RANGE_HEIGHT,
  RANGE_SPOT_X,
  SINK_BASIN_X,
  SINK_SPOT_X,
  SINK_TOP,
  STOVE_X,
  TABLE_SPOT_X,
  WORKTABLE_X,
} from './layout.js';
import { playPress } from './sfx.js';
import { stations } from './station-system.js';
import { StationKind } from './sushi-components.js';
import { TurnSystem } from './turn-system.js';

type Where = Exclude<Place, 'seat'> | 'board';

/** Steps between the stool and the back row, for practice mode and the master. */
export const placeApi = {
  /** Go there now (the view blinks), as a chosen step would. */
  go: (_place: Place): boolean => false,
  /** What may be pointed at to step now, with where it is. */
  targets: (): readonly FarTarget<Where>[] => [],
};

/**
 * Where the chef stands. The bar is worked from the stool; in the morning
 * prep the work table (the shari), the range (the simmering) and, while there
 * is a whole fish to wash, the sink (水洗い) behind it are a step away; on the
 * full difficulty so is the drainboard beside the sink (the fish box at its
 * foot, the curing on it) while there is work there. Turned round, point at the work table or the range and
 * pinch (or look and pinch, on the glasses): the view blinks and you stand
 * in front of it. From there point at the other one to move along, or turn
 * back to the bar and point at the board to sit down again. Once the bar
 * opens the chef is back on the stool.
 */
export class PlaceSystem extends createSystem({}) {
  private readonly chooser = new FarChooser<Where>();
  private readonly seatRig = new Vector3();
  private readonly headNow = new Vector3();
  private readonly spots: Record<Exclude<Place, 'seat'>, Vector3> = {
    table: new Vector3(TABLE_SPOT_X, 0, BACK_SPOT_Z),
    range: new Vector3(RANGE_SPOT_X, 0, BACK_SPOT_Z),
    sink: new Vector3(SINK_SPOT_X, 0, BACK_SPOT_Z),
    drain: new Vector3(DRAIN_SPOT_X, 0, BACK_SPOT_Z),
  };
  private readonly all: Record<Where, FarTarget<Where>> = {
    table: { id: 'table', at: new Vector3(WORKTABLE_X, SINK_TOP + 0.05, BACK_ROW_Z + 0.2), radius: 0.3 },
    range: { id: 'range', at: new Vector3(STOVE_X, RANGE_HEIGHT + 0.08, BACK_ROW_Z + 0.2), radius: 0.3 },
    // The sink and the drainboard are side by side: each is pointed at toward the wall (the tap, the drainboard's back), so it is far enough to point at from the other.
    sink: { id: 'sink', at: new Vector3(SINK_BASIN_X, SINK_TOP + 0.12, BACK_ROW_Z + 0.4), radius: 0.22 },
    drain: { id: 'drain', at: new Vector3(DRAIN_SPOT_X, SINK_TOP + 0.12, BACK_ROW_Z + 0.42), radius: 0.18 },
    board: { id: 'board', at: new Vector3(0, MANAITA_TOP + 0.03, MANAITA_Z), radius: 0.4 },
  };
  private enabled: FarTarget<Where>[] = [];
  private glowing: Where | null = null;
  private objects: Partial<Record<Where, Object3D>> = {};
  private turn: TurnSystem | undefined;

  init(): void {
    placeApi.go = (place) => this.go(place);
    placeApi.targets = () => this.enabled;
  }

  update(delta: number): void {
    this.turn ??= this.world.getSystem(TurnSystem);
    // The bar is open: back on the stool.
    if (!prep.active && chef.at !== 'seat') this.go('seat');
    this.enabled = this.targetsNow();
    this.player.head.getWorldPosition(this.headNow);
    const chosen = this.enabled.length ? this.chooser.update(delta, this.player, this.headNow, this.enabled) : null;
    if (!this.enabled.length) this.chooser.reset();
    const glow = chosen ? null : this.chooser.hovered;
    if (glow !== this.glowing) {
      if (this.glowing) this.glow(this.glowing, false);
      if (glow) this.glow(glow, true);
      this.glowing = glow;
    }
    if (chosen) {
      playPress();
      this.go(chosen === 'board' ? 'seat' : chosen);
    }
  }

  /** Turned round, the work table and the range; back at the bar from the back row, the board (to sit down). */
  private targetsNow(): FarTarget<Where>[] {
    if (!prep.active) return [];
    const out: FarTarget<Where>[] = [];
    if (chef.facingBack) {
      if (chef.at !== 'table') out.push(this.all.table);
      if (chef.at !== 'range') out.push(this.all.range);
      // The sink only while there is a fish to wash there, or the tamago's suribachi to take from the cupboard under it (and not while the hands want washing in it).
      const sink = prep.sinkWanted || tamago.next === 'cupboard' || (tamago.next === 'suribachi' && !tamago.bowlHeld);
      if (chef.at !== 'sink' && sink && !chef.hands.some((h) => h.needsWash)) out.push(this.all.sink);
      // The drainboard while there is curing to do, a fish for its tray, or a fish to take from the box at its foot.
      const drain = cure.wanted || (prep.next === 'take' && prep.takeFrom === 'fish') || (prep.next === 'stock' && prep.stockTo === 'cure');
      if (chef.at !== 'drain' && drain && !chef.hands.some((h) => h.needsWash)) out.push(this.all.drain);
    } else if (chef.at !== 'seat') {
      out.push(this.all.board);
    }
    return out;
  }

  private go(place: Place): boolean {
    if (place === chef.at) return false;
    const act = () => this.moveTo(place);
    if (this.turn?.blinkThen(act)) return true;
    act();
    return true;
  }

  /** The rig moves so the head stands over the spot (the stool's own place is kept to come back to). */
  private moveTo(place: Place): void {
    const p = this.player;
    if (chef.at === 'seat') this.seatRig.copy(p.position);
    if (place === 'seat') {
      p.position.copy(this.seatRig);
    } else {
      p.head.getWorldPosition(this.headNow);
      const spot = this.spots[place];
      p.position.x += spot.x - this.headNow.x;
      p.position.z += spot.z - this.headNow.z;
    }
    chef.at = place;
    this.chooser.reset();
    coach.done(place === 'seat' ? 'stepSeat' : place === 'table' ? 'stepTable' : place === 'sink' ? 'stepSink' : place === 'drain' ? 'stepDrain' : 'stepRange');
    const words: Record<Place, string> = { seat: 'back on the stool at the bar', table: 'at the work table', sink: 'at the sink', drain: 'at the drainboard', range: 'at the range' };
    console.log(`[Place] ${words[place]}`);
  }

  private glow(where: Where, on: boolean): void {
    const object = this.objectOf(where);
    if (object) glowObject(object, on ? COLOR_HINT : null);
  }

  private objectOf(where: Where): Object3D | undefined {
    if (where === 'board') return stations.get(StationKind.CuttingBoard)?.entity.object3D ?? undefined;
    if (!this.objects[where]) {
      const name = where === 'table' ? 'WorkTable' : where === 'sink' || where === 'drain' ? 'SinkUnit' : 'GasRange';
      this.world.scene.traverse((o) => {
        if (!this.objects[where] && o.name === name) this.objects[where] = o;
      });
    }
    return this.objects[where];
  }
}
