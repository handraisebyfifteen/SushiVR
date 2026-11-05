import { createSystem, type Object3D, Vector3 } from '@iwsdk/core';
import { chef, progress } from './game-state.js';
import { hands } from './hands.js';
import { stations } from './station-system.js';
import { Held, StationKind } from './sushi-components.js';

/** The rice hand counts as reaching for the tub within this horizontal radius, below this height above the rice. */
const REACH_RADIUS = 0.32;
const REACH_ABOVE = 0.45;
/** How far the lid slides aside (outward, away from the chef) and lifts to clear the rim. */
const SLIDE = 0.26;
const LIFT = 0.02;
const LID_SPEED = 12;
/** The lid closes this long after the hand has gone. */
const CLOSE_DELAY = 0.25;

/**
 * The ohitsu's lid works by itself, like the neta case doors: it slides
 * aside as the empty rice hand reaches down to the tub, and closes the
 * moment the rice is taken (or the hand goes away), keeping the rice warm
 * and moist. Purely a look: the rice rule itself is in NigiriSystem.
 */
export class RiceTubSystem extends createSystem({}) {
  private lid: Object3D | null = null;
  private readonly closed = new Vector3();
  private open = 0;
  private away = CLOSE_DELAY;
  private hadRice = false;

  update(delta: number): void {
    if (!this.findLid()) return;
    const tub = stations.get(StationKind.RiceTub)!;
    const hand = hands.all[chef.riceSide];
    let near = false;
    if (hand?.tracked && !chef.facingBack && chef.hands[chef.riceSide].holding === Held.None && !progress.hasRice) {
      const dx = hand.palm.x - tub.pos.x;
      const dz = hand.palm.z - tub.pos.z;
      near = dx * dx + dz * dz < REACH_RADIUS * REACH_RADIUS && hand.palm.y < tub.pos.y + REACH_ABOVE;
    }
    // Rice in hand: close at once rather than after the delay.
    const justTook = progress.hasRice && !this.hadRice;
    this.hadRice = progress.hasRice;
    this.away = near ? 0 : justTook ? CLOSE_DELAY : this.away + delta;
    const target = this.away < CLOSE_DELAY ? 1 : 0;
    this.open += (target - this.open) * Math.min(1, delta * LID_SPEED);
    if (Math.abs(target - this.open) < 0.002) this.open = target;
    this.lid!.position.set(this.closed.x + SLIDE * this.open, this.closed.y + LIFT * Math.min(1, this.open * 3), this.closed.z);
  }

  private findLid(): boolean {
    if (this.lid) return true;
    const lid = stations.get(StationKind.RiceTub)?.entity.object3D?.getObjectByName('Lid');
    if (!lid) return false;
    this.lid = lid;
    this.closed.copy(lid.position);
    return true;
  }
}
