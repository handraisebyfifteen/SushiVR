import { createSystem, type Entity, Euler, type Group, Quaternion, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { COLOR_DONE, feedback } from './feedback.js';
import { chef, nakago, nakagoWanted, prep, type Side } from './game-state.js';
import { hands, RubTracker } from './hands.js';
import { BACK_ROW_Z, ICE_BOX_ICE_TOP, SINK_BASIN_X, SINK_TOP, WHETSTONE_X } from './layout.js';
import { nakagoApi, prepApi } from './prep-api.js';
import type { PrepId } from './prep.js';
import { createDryCloth, createNakago, createPack, NAKAGO_FLOOR, NAKAGO_HEIGHT, PACK_HEIGHT } from './scene-assets/lib/nakago-look.js';
import { playDone, playPick, playPut } from './sfx.js';
import { overStation, stations } from './station-system.js';
import { Held, StationKind } from './sushi-components.js';
import { RUB_DRY_NAKAGO, RUB_WASH_NAKAGO } from './tuning.js';

interface Insert {
  id: PrepId;
  kind: 'nakago' | 'pack';
  root: Group;
  entity: Entity;
  /** Where it lies when not in a hand (world, the underside's middle): its place in the ice box; in the pile once the empties are stacked; on the counter once the box is gone. */
  slot: Vector3;
  height: number;
  washed: boolean;
  dried: boolean;
  /** Stacked on the sink's end (an insert) or thrown out (the pack). */
  done: boolean;
}

/** Nested, in the pile or on the strip: each one this much above the one under it. */
const NEST = 0.012;
/** The dry cloth hangs over the sink's front edge, on the basin's right (world). */
const CLOTH_X = SINK_BASIN_X + 0.14;
/** Its grip: the hanging part's middle, a little in front of the sink. */
const CLOTH_GRIP = new Vector3(0, -0.06, -0.012);

/**
 * The fish shop's inserts (中子, stainless insert pans) the range's prepared
 * ingredients come in, and the anago's pack (the user's shop: bought opened,
 * in a pack). Each lies on top in the ice box under its ingredient. Once every
 * one of them is in its pot, the empty inserts are piled in the box (「普通に
 * 積んである」) and dealt with one at a time (「1個ずつ取れば」): the pack into
 * the trash; an insert pinched from the pile (from the stool), held over the
 * basin while the other hand scrubs, dried with the cloth from the sink's
 * front edge in that hand (「洗って水分取ったら綺麗」), and let go on the
 * sink's end strip by the whetstone, where it stacks upside down. The master
 * asks for this before the fish under them; the bar does not open with them
 * left (prepCleaned); the part-timer's cleanup covers them.
 */
export class NakagoSystem extends createSystem({}) {
  private inserts: Insert[] = [];
  private held: Insert | null = null;
  private cloth: Group | null = null;
  private readonly clothHome = new Vector3(CLOTH_X, SINK_TOP, BACK_ROW_Z);
  private readonly rub = new RubTracker(true);
  private readonly tmp = new Vector3();
  private readonly rig = new Quaternion();
  private readonly flipped = new Quaternion().setFromEuler(new Euler(Math.PI, Math.PI / 2, 0));
  /** The pile's bottom (world, an underside's middle), once the empties are piled. */
  private readonly pileAt = new Vector3();
  private piled = false;
  private boxGone = false;
  /** Inserts stacked on the strip so far today. */
  private racked = 0;

  init(): void {
    nakagoApi.clear = () => this.clear();
    nakagoApi.deliver = (id, slot) => this.deliver(id, slot);
    nakagoApi.byStaff = () => this.byStaff();
    nakago.rackAt.set(WHETSTONE_X, SINK_TOP, BACK_ROW_Z + 0.13);
    nakago.clothAt.copy(this.clothHome).add(CLOTH_GRIP);
  }

  /** A new delivery is being laid out: yesterday's go. */
  private clear(): void {
    for (const i of this.inserts) i.entity.dispose();
    this.inserts = [];
    this.held = null;
    this.piled = false;
    this.boxGone = false;
    this.racked = 0;
    nakago.left = 0;
    nakago.ready = false;
    nakago.pack = false;
    nakago.held = null;
    nakago.heldKind = null;
    nakago.washed = false;
    nakago.dried = false;
  }

  /** The ingredient's spot in the box (world, raised by the floor): its insert (the anago's pack) goes under it. */
  private deliver(id: PrepId, slot: Vector3): void {
    const kind = id === 'SeaEel' ? 'pack' : 'nakago';
    const root = kind === 'pack' ? createPack() : createNakago();
    root.position.copy(slot).sub(this.tmp.set(0, NAKAGO_FLOOR, 0));
    const entity = this.world.createTransformEntity(root);
    this.inserts.push({ id, kind, root, entity, slot: root.position.clone(), washed: false, dried: false, done: false, height: kind === 'pack' ? PACK_HEIGHT : NAKAGO_HEIGHT });
    nakago.left++;
    if (kind === 'pack') nakago.pack = true;
  }

  update(): void {
    if (!this.cloth) {
      this.cloth = createDryCloth();
      this.cloth.position.copy(this.clothHome);
      this.world.createTransformEntity(this.cloth);
    }
    this.updateCloth(this.cloth);
    let left = 0;
    let pack = false;
    let ready = true;
    for (const i of this.inserts) {
      if (i.done) continue;
      left++;
      if (i.kind === 'pack') pack = true;
      if (prepApi.awaitingPot(i.id)) ready = false;
    }
    nakago.left = left;
    nakago.pack = pack;
    if (!left) return;
    nakago.ready = ready;
    this.boxAway();
    this.pile();
    if (this.held === null) this.pick();
    else this.carry(this.held);
    if (nakagoWanted()) this.hints();
  }

  /** The dry cloth: a pinch on it (a free hand) takes it; it hangs under the hand; let go anywhere, it hangs back on the sink's edge. */
  private updateCloth(cloth: Group): void {
    if (nakago.clothHeld === null) {
      for (const side of [0, 1] as const) {
        const hand = hands.all[side];
        if (!hand.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None) continue;
        if (hand.grasp.distanceTo(nakago.clothAt) > 0.09) continue;
        nakago.clothHeld = side;
        chef.hands[side].holding = Held.DryCloth;
        playPick();
        console.log('[Nakago] the dry cloth in hand');
        return;
      }
      return;
    }
    const side = nakago.clothHeld;
    const hand = hands.all[side];
    if (hand.tracked) {
      this.player.getWorldQuaternion(this.rig);
      cloth.position.copy(this.tmp.set(0, 0.02, 0.01)).applyQuaternion(this.rig).add(hand.grasp);
      cloth.quaternion.copy(this.rig);
    }
    if (hand.tracked && !hand.pinchEnd) return;
    chef.hands[side].holding = Held.None;
    nakago.clothHeld = null;
    cloth.position.copy(this.clothHome);
    cloth.quaternion.identity();
    playPut();
    console.log("[Nakago] the dry cloth back on the sink's edge");
  }

  /** The box put away with empties still in it: they are left on the counter where it stood (the pile where the box's middle was, the pack beside it). */
  private boxAway(): void {
    const box = stations.get(StationKind.IceBox);
    if (!box?.entity.object3D || box.entity.object3D.visible || this.boxGone) return;
    this.boxGone = true;
    const y = box.pos.y - ICE_BOX_ICE_TOP;
    this.pileAt.set(box.pos.x + 0.06, y, box.pos.z);
    this.piled = true;
    for (const i of this.inserts) {
      if (i.done || i.kind !== 'pack') continue;
      i.slot.set(box.pos.x - 0.12, y, box.pos.z);
      if (this.held !== i) i.root.position.copy(i.slot);
    }
  }

  /** Once every ingredient is in its pot the empty inserts are piled where the first one lay; the pile is laid again whenever one leaves it or comes back (the last in the list on top). */
  private pile(): void {
    if (!this.piled) {
      if (!nakago.ready) return;
      const first = this.inserts.find((i) => i.kind === 'nakago' && !i.done);
      if (!first) return;
      this.pileAt.copy(first.slot);
      this.piled = true;
    }
    let k = 0;
    for (const i of this.inserts) {
      if (i.done || i.kind !== 'nakago') continue;
      i.slot.set(this.pileAt.x, this.pileAt.y + k * NEST, this.pileAt.z);
      k++;
      if (this.held === i) continue;
      i.root.position.copy(i.slot);
      i.root.quaternion.identity();
    }
  }

  /** The next thing to take: the pack once its anago is in the pot, else the pile's top once the empties are piled. */
  private next(): Insert | null {
    let top: Insert | null = null;
    for (const i of this.inserts) {
      if (i.done) continue;
      if (i.kind === 'pack') {
        if (!prepApi.awaitingPot(i.id)) return i;
        continue;
      }
      if (this.piled) top = i;
    }
    return top;
  }

  /** A pinch on the next empty (a free hand) takes it; its top's middle is published for the master's word and the practice. */
  private pick(): void {
    const i = this.next();
    if (!i) return;
    nakago.at.copy(i.slot).add(this.tmp.set(0, i.height, 0));
    const reach = i.kind === 'pack' ? 0.13 : 0.1;
    for (const side of [0, 1] as const) {
      const hand = hands.all[side];
      if (!hand.tracked || !hand.pinchStart || chef.hands[side].holding !== Held.None) continue;
      if (Math.hypot(hand.grasp.x - i.slot.x, hand.grasp.z - i.slot.z) > reach || Math.abs(hand.grasp.y - nakago.at.y) > 0.1) continue;
      this.held = i;
      nakago.held = side;
      nakago.heldKind = i.kind;
      nakago.washed = i.washed;
      nakago.dried = i.dried;
      chef.hands[side].holding = Held.Nakago;
      this.rub.reset();
      playPick();
      console.log(i.kind === 'pack' ? "[Nakago] the anago's empty pack in hand: into the trash" : `[Nakago] an empty insert in hand (${nakago.left - (nakago.pack ? 1 : 0)} left): ${i.dried ? "to the sink's end" : i.washed ? 'to be dried' : 'to the sink'}`);
      return;
    }
  }

  /** It hangs under the hand. An insert: over the basin, the other hand scrubbing, it is washed; that hand with the dry cloth rubbing it, dried. Let go: the pack over a bin is thrown out; a dried insert on the sink's end is stacked; anything else goes back. */
  private carry(i: Insert): void {
    const side = nakago.held as Side;
    const otherSide: Side = side === 0 ? 1 : 0;
    const hand = hands.all[side];
    const other = hands.all[otherSide];
    if (hand.tracked) {
      this.player.getWorldQuaternion(this.rig);
      i.root.position.copy(i.kind === 'pack' ? this.tmp.set(0, -0.05, 0.06) : this.tmp.set(0, -0.07, 0.03)).applyQuaternion(this.rig).add(hand.grasp);
      i.root.quaternion.copy(this.rig);
    }
    nakago.at.copy(i.root.position).add(this.tmp.set(0, i.height / 2, 0));
    if (i.kind === 'nakago' && !i.washed) {
      const over = overStation(hand.grasp, StationKind.Sink);
      const rubbing = over && other.tracked && overStation(other.palm, StationKind.Sink);
      if (this.rub.update(other.palm, rubbing) >= RUB_WASH_NAKAGO) {
        i.washed = true;
        nakago.washed = true;
        this.rub.reset();
        feedback.flash(StationKind.Sink, COLOR_DONE);
        coach.done('washNakago');
        playDone();
        console.log("[Nakago] the insert is washed: dry it with the cloth on the sink's edge");
      }
    } else if (i.kind === 'nakago' && !i.dried) {
      const near = nakago.clothHeld === otherSide && other.tracked && other.grasp.distanceTo(nakago.at) < 0.14;
      if (this.rub.update(other.grasp, near) >= RUB_DRY_NAKAGO) {
        i.dried = true;
        nakago.dried = true;
        this.rub.reset();
        feedback.flash(StationKind.Sink, COLOR_DONE);
        coach.done('dryNakago');
        playDone();
        console.log("[Nakago] the insert is dry: stack it upside down on the sink's end, by the whetstone");
      }
    }
    if (hand.tracked && !hand.pinchEnd) return;
    chef.hands[side].holding = Held.None;
    this.held = null;
    nakago.held = null;
    nakago.heldKind = null;
    if (i.kind === 'pack') {
      if (overStation(hand.grasp, StationKind.TrashBin) || this.overSinkBin(hand.grasp)) {
        this.thrown(i, true);
        return;
      }
      i.root.position.copy(i.slot);
      i.root.quaternion.identity();
      playPut();
      console.log('[Nakago] the pack put back: it goes in the trash');
      return;
    }
    const at = nakago.rackAt;
    const nearRack = Math.hypot(hand.grasp.x - at.x, hand.grasp.z - at.z) < 0.16 && hand.grasp.y > at.y - 0.05 && hand.grasp.y < at.y + 0.3;
    if (i.dried && nearRack) {
      this.rack(i, true);
      return;
    }
    // Back on the pile, on top: last in the list.
    this.inserts.splice(this.inserts.indexOf(i), 1);
    this.inserts.push(i);
    this.pile();
    playPut();
    console.log(i.dried ? "[Nakago] the dry insert put back on the pile: it goes on the sink's end" : i.washed ? '[Nakago] the washed insert put back on the pile: dry it first' : '[Nakago] the insert put back on the pile: wash it at the sink');
  }

  /** Over the sink's trash bin, when the whole fish's sink is set up (its place is zero otherwise). */
  private overSinkBin(p: Vector3): boolean {
    const bin = prep.sinkBinAt;
    if (bin.lengthSq() === 0) return false;
    return Math.hypot(p.x - bin.x, p.z - bin.z) < 0.15 && p.y > bin.y - 0.05 && p.y < bin.y + 0.3;
  }

  /** The pack into the trash (gone for good). */
  private thrown(i: Insert, byChef: boolean): void {
    i.done = true;
    i.entity.dispose();
    this.inserts.splice(this.inserts.indexOf(i), 1);
    if (byChef) {
      feedback.flash(StationKind.TrashBin, COLOR_DONE);
      coach.done('discardScrap');
      playDone();
    }
    console.log(byChef ? "[Nakago] the anago's pack in the trash" : "[Nakago] the anago's pack thrown out by the part-timer");
  }

  /** One insert upside down on the sink's end strip, on top of those already there. */
  private rack(i: Insert, byChef: boolean): void {
    const at = nakago.rackAt;
    i.done = true;
    i.washed = true;
    i.dried = true;
    i.root.quaternion.copy(this.flipped);
    i.root.position.set(at.x, at.y + this.racked * NEST + i.height, at.z);
    this.racked++;
    if (byChef) {
      feedback.flash(StationKind.Whetstone, COLOR_DONE);
      coach.done('rackNakago');
      playPut();
      console.log(`[Nakago] the insert stacked upside down on the sink's end (${this.racked} there)`);
    }
  }

  /** The part-timer's cleanup: the pack out, every insert washed and stacked. */
  private byStaff(): void {
    if (this.held !== null) {
      chef.hands[nakago.held as Side].holding = Held.None;
      this.held = null;
      nakago.held = null;
      nakago.heldKind = null;
    }
    for (const i of [...this.inserts]) {
      if (i.done) continue;
      if (i.kind === 'pack') this.thrown(i, false);
      else this.rack(i, false);
    }
    nakago.left = 0;
    nakago.pack = false;
    console.log('[Nakago] the inserts washed and stacked by the part-timer');
  }

  private hints(): void {
    if (this.held === null) feedback.hints.add(StationKind.IceBox);
    else if (this.held.kind === 'pack') feedback.hints.add(StationKind.TrashBin);
    else if (this.held.dried) feedback.hints.add(StationKind.Whetstone);
    else feedback.hints.add(StationKind.Sink);
  }
}
