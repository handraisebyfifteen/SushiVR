import { createSystem, type Material, type Mesh, MeshStandardMaterial, type Object3D, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { knifeApi } from './cutting-system.js';
import { COLOR_DONE, feedback } from './feedback.js';
import { fishOrder } from './fish-order.js';
import { chef, sharpen, sharpenWanted } from './game-state.js';
import { hands, RubTracker } from './hands.js';
import { playDone, playPick, playPut } from './sfx.js';
import { overStation, stations } from './station-system.js';
import { Held, StationKind } from './sushi-components.js';
import { RINSE_BLADE_SECONDS, RUB_SHARPEN } from './tuning.js';

/** The stone's wet look: the placed stone's own mesh takes it (the asset's material is the dry one). */
const wetStone = new MeshStandardMaterial({ color: '#6F4426', roughness: 0.55 });

/**
 * The knife's edge (包丁研ぎ; the user: before and after the day's work, one
 * stone). The whetstone lies on the sink's end strip. Standing at the sink:
 *  1 a free hand pinches the stone, lets it go in the basin: wetted (the
 *    stone darkens; it dries overnight);
 *  2 with the knife in hand, the other hand pressing the blade down on the
 *    stone, the blade is drawn back and forth along the stone: enough travel
 *    and the edge is back (chef.knifeSharp 1);
 *  3 the stone's slurry: the blade into the basin for a moment (rinsed),
 *    then wiped on the cloth at the bar as after a cut.
 * The edge wears with every cut (src/game-state.ts wearKnife); a worn edge
 * marks the pieces it cuts. The bar does not open before the morning's
 * sharpening (prepReady).
 */
export class SharpenSystem extends createSystem({}) {
  private readonly rub = new RubTracker(true);
  private readonly tmp = new Vector3();
  private readonly home = new Vector3();
  private homeSet = false;
  private stoneHand: 0 | 1 | null = null;
  private rinsing = 0;
  private lastDay = -1;
  private stoneMesh: Mesh | null = null;
  private dryMaterial: Material | Material[] | null = null;

  update(delta: number): void {
    const info = stations.get(StationKind.Whetstone);
    const stone = info?.entity.object3D;
    if (!info || !stone) return;
    if (!this.homeSet) {
      stone.getWorldPosition(this.home);
      this.homeSet = true;
      this.stoneMesh = (stone.getObjectByName('Stone') as Mesh | undefined) ?? null;
      this.dryMaterial = this.stoneMesh?.material ?? null;
    }
    // A new day: the stone has dried overnight; the knife wants its morning sharpening.
    if (fishOrder.day !== this.lastDay) {
      this.lastDay = fishOrder.day;
      sharpen.stoneWet = false;
      sharpen.doneToday = false;
      sharpen.rinsed = true;
      this.look();
    }
    this.updateStone(stone);
    this.updateStrokes(info.pos);
    this.updateRinse(delta);
    if (sharpenWanted() || !sharpen.rinsed) this.hints();
  }

  /** The stone's look: dark while wet. */
  private look(): void {
    if (this.stoneMesh && this.dryMaterial) this.stoneMesh.material = sharpen.stoneWet ? wetStone : this.dryMaterial;
  }

  /** A pinch on the stone takes it; let go in the basin, it comes back wetted; elsewhere, just back. */
  private updateStone(stone: Object3D): void {
    if (this.stoneHand === null) {
      for (const side of [0, 1] as const) {
        const hand = hands.all[side];
        if (!hand.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None) continue;
        if (!overStation(hand.grasp, StationKind.Whetstone)) continue;
        this.stoneHand = side;
        chef.hands[side].holding = Held.Stone;
        playPick();
        console.log('[Sharpen] the stone in hand');
        return;
      }
      return;
    }
    const hand = hands.all[this.stoneHand];
    if (hand.tracked) stone.position.copy(hand.grasp).add(this.tmp.set(0, -0.03, 0));
    if (hand.tracked && !hand.pinchEnd) return;
    chef.hands[this.stoneHand].holding = Held.None;
    this.stoneHand = null;
    const inBasin = overStation(hand.grasp, StationKind.Sink);
    stone.position.copy(this.home);
    playPut();
    if (inBasin && !sharpen.stoneWet) {
      sharpen.stoneWet = true;
      this.look();
      feedback.flash(StationKind.Whetstone, COLOR_DONE);
      coach.done('wetStone');
      console.log('[Sharpen] the stone wetted in the basin');
    } else {
      console.log('[Sharpen] the stone put back');
    }
  }

  /** The blade drawn along the wet stone under the other hand's press: enough travel restores the edge. */
  private updateStrokes(at: Vector3): void {
    if (!knifeApi.held || this.stoneHand !== null) {
      this.rub.reset();
      sharpen.progress = 0;
      return;
    }
    const blade = knifeApi.blade;
    const other = hands.all[chef.netaSide];
    const pressing = other.tracked && Math.hypot(other.palm.x - at.x, other.palm.z - at.z) < 0.16 && other.palm.y < at.y + 0.16;
    const over = sharpen.stoneWet && overStation(blade, StationKind.Whetstone);
    const travelled = this.rub.update(blade, over && pressing);
    sharpen.progress = over && pressing ? Math.min(1, travelled / RUB_SHARPEN) : 0;
    if (travelled < RUB_SHARPEN) return;
    this.rub.reset();
    sharpen.progress = 0;
    chef.knifeSharp = 1;
    chef.knifeDull = false;
    // The stone's slurry on the blade: rinse it, then wipe it.
    chef.knifeDirty = true;
    sharpen.rinsed = false;
    sharpen.doneToday = true;
    feedback.flash(StationKind.Whetstone, COLOR_DONE);
    coach.done('sharpen');
    playDone();
    console.log('[Sharpen] the edge is back: rinse the blade, then wipe it');
  }

  /** After the stone, the blade into the basin for a moment. */
  private updateRinse(delta: number): void {
    if (!knifeApi.held || sharpen.rinsed || !overStation(knifeApi.blade, StationKind.Sink)) {
      this.rinsing = 0;
      return;
    }
    this.rinsing += delta;
    if (this.rinsing < RINSE_BLADE_SECONDS) return;
    this.rinsing = 0;
    sharpen.rinsed = true;
    feedback.flash(StationKind.Sink, COLOR_DONE);
    coach.done('rinseKnife');
    console.log('[Sharpen] blade rinsed: wipe it dry');
  }

  private hints(): void {
    if (!sharpen.stoneWet) feedback.hints.add(StationKind.Whetstone);
    else if (!knifeApi.held) feedback.hints.add(StationKind.Knife);
    else feedback.hints.add(sharpen.rinsed ? StationKind.Whetstone : StationKind.Sink);
  }
}
