import { Box3, createSystem, type Object3D, type Sprite, Vector3 } from '@iwsdk/core';
import { display, type NameLevel } from './display-settings.js';
import { chef, prep } from './game-state.js';
import { GAZE_CONE_DEG, gazeOff } from './gaze.js';
import { hands } from './hands.js';
import { heldOut, POINT_ACROSS_DEG, pointOff } from './pointing.js';
import { Held } from './sushi-components.js';
import { makeTextSprite } from './text-sprites.js';

type Group = 'front' | 'back' | 'office';

interface TagDef {
  /** The object's name in the scene: a placed node's name, or a prop's root name. */
  name: string;
  label: string;
  group: Group;
  /** A work surface the hands are over all the time: named only on "always". */
  surface?: boolean;
}

/** The names, by where they are (in-game text is English). */
const DEFS: readonly TagDef[] = [
  // The counter, before the chef.
  { name: 'Cutting Board', label: 'Cutting board', group: 'front', surface: true },
  { name: 'Knife (yanagiba)', label: 'Knife (yanagiba)', group: 'front' },
  { name: 'Knife Holder', label: 'Knife holder', group: 'front' },
  { name: 'Wet Cloth', label: 'Wet cloth', group: 'front' },
  { name: 'Tezu Bowl', label: 'Tezu (hand water)', group: 'front' },
  { name: 'Wasabi Dish', label: 'Wasabi', group: 'front' },
  { name: 'Nori Box', label: 'Nori', group: 'front' },
  { name: 'Kitchen Paper Box', label: 'Kitchen paper', group: 'front' },
  { name: 'Makisu', label: 'Makisu (rolling mat)', group: 'front' },
  { name: 'Ice Box (styrofoam)', label: 'Ice box', group: 'front' },
  { name: 'Rice Tub (ohitsu)', label: 'Rice tub (ohitsu)', group: 'front' },
  { name: 'Trash Bin', label: 'Trash bin', group: 'front' },
  { name: 'Geta', label: 'Geta (serving board)', group: 'front' },
  // The back row, behind the chef.
  { name: 'Sink (basin zone)', label: 'Sink', group: 'back' },
  { name: 'Hand Soap', label: 'Hand soap', group: 'back' },
  { name: 'Hand Towel', label: 'Hand towel', group: 'back' },
  { name: 'Work Table (stainless)', label: 'Work table', group: 'back', surface: true },
  { name: 'Gas Range (four burners, oven)', label: 'Gas range', group: 'back', surface: true },
  { name: 'Menu Board (Japanese plaques)', label: 'Menu board', group: 'back', surface: true },
  { name: 'RiceCooker', label: 'Rice cooker', group: 'back' },
  { name: 'Hangiri', label: 'Hangiri (mixing tub)', group: 'back' },
  { name: 'Shamoji', label: 'Shamoji (paddle)', group: 'back' },
  { name: 'Awasezu', label: 'Awasezu (sushi vinegar)', group: 'back' },
  { name: 'PotSeaEel', label: 'Sea eel pot', group: 'back' },
  { name: 'PotKanpyo', label: 'Kanpyo pot', group: 'back' },
  { name: 'PotOctopus', label: 'Octopus pot', group: 'back' },
  { name: 'PotAbalone', label: 'Abalone pot', group: 'back' },
  { name: 'TamagoPan', label: 'Tamago pan', group: 'back' },
  { name: 'Suribachi', label: 'Suribachi (mortar)', group: 'back' },
  { name: 'Surikogi', label: 'Surikogi (pestle)', group: 'back' },
  { name: 'EggBowl', label: 'Eggs', group: 'back' },
  { name: 'Zaru', label: 'Zaru (basket)', group: 'back' },
  { name: 'CureTray', label: 'Tray', group: 'back' },
  { name: 'SaltBowl', label: 'Salt', group: 'back' },
  { name: 'VinegarPot', label: 'Vinegar', group: 'back' },
  { name: 'WaterBowl', label: 'Water', group: 'back' },
  { name: 'KitchenTimer', label: 'Timer', group: 'back' },
  { name: 'FishBox', label: 'Fish box', group: 'back' },
  // The office corner and the food shelf (pointed at from the stool).
  { name: 'Telephone', label: 'Telephone', group: 'office' },
  { name: "Day's Books Board", label: "Day's books", group: 'office' },
  { name: 'Tea Station (urn, powdered tea, cups)', label: 'Hot water, tea', group: 'office' },
  { name: 'Dish Cabinet (glass doors)', label: 'Dish cabinet', group: 'office', surface: true },
  { name: 'BottleSoysauce', label: 'Soy sauce', group: 'office' },
  { name: 'BottleMirin', label: 'Mirin', group: 'office' },
  { name: 'BottleSake', label: 'Sake', group: 'office' },
  { name: 'BottleRicevinegar', label: 'Rice vinegar', group: 'office' },
  { name: 'JarSalt', label: 'Salt', group: 'office' },
  { name: 'JarSugar', label: 'Sugar', group: 'office' },
  { name: 'RiceSack', label: 'Rice', group: 'office' },
];

/** A tag's width (m): small at hand, larger across the room. */
const WIDTH: Record<Group, number> = { front: 0.12, back: 0.14, office: 0.2 };
/** How far over the object's top the name floats. */
const LIFT = 0.04;
/** A hand counts as at an object within this much of its box (above: it hovers over it). */
const NEAR_SIDE = 0.04;
const NEAR_ABOVE = 0.15;
const NEAR_BELOW = 0.03;
/** A zone with no shape of its own (the sink's basin): this round. */
const ZONE_RADIUS = 0.12;
/** A chosen name stays this long after the hand moves on, so it does not flicker. */
const LINGER = 0.3;
/** Looking again for props that come later (a day's cure, the tamago tools). */
const FIND_EVERY = 1;
const FIND_FOR = 30;

interface Tag {
  def: TagDef;
  object: Object3D;
  sprite: Sprite;
  /** The object's box around its origin (world axes), when found. */
  lo: Vector3;
  hi: Vector3;
  until: number;
}

const tmp = new Vector3();
const box = new Box3();

/**
 * Names over the shop's tools and vessels (src/display-settings.ts): per
 * place (the counter, the back row, the office corner), always, only over
 * the one an empty hand is at (or points at, across the room, or the eyes
 * are on, on the glasses), or never.
 */
export class NameTagSystem extends createSystem({}) {
  private readonly tags: Tag[] = [];
  private readonly found = new Set<Object3D>();
  private time = 0;
  private nextFind = 0;
  private readonly head = new Vector3();
  private readonly at = new Vector3();

  private make(def: TagDef, object: Object3D): Tag {
    const sprite = makeTextSprite(def.label, { width: WIDTH[def.group] });
    sprite.name = `NameTag_${def.label}`;
    sprite.visible = false;
    this.world.createTransformEntity(sprite);
    const tag: Tag = { def, object, sprite, lo: new Vector3(), hi: new Vector3(), until: 0 };
    object.updateWorldMatrix(true, true);
    object.getWorldPosition(tmp);
    box.setFromObject(object);
    if (box.isEmpty()) {
      tag.lo.set(-ZONE_RADIUS, 0, -ZONE_RADIUS);
      tag.hi.set(ZONE_RADIUS, 0.05, ZONE_RADIUS);
    } else {
      tag.lo.copy(box.min).sub(tmp);
      tag.hi.copy(box.max).sub(tmp);
    }
    return tag;
  }

  /** Finds the named objects the scene has now (props come at different times). */
  private find(): void {
    const wanted = new Map<string, TagDef>();
    for (const def of DEFS) wanted.set(def.name, def);
    this.world.scene.traverse((o) => {
      const def = wanted.get(o.name);
      if (!def || this.found.has(o)) return;
      this.found.add(o);
      this.tags.push(this.make(def, o));
    });
  }

  update(delta: number): void {
    this.time += delta;
    if (this.time >= this.nextFind && this.time < FIND_FOR) {
      this.nextFind = this.time + FIND_EVERY;
      this.find();
    }
    this.player.head.getWorldPosition(this.head);
    for (let side = 0; side < 2; side++) this.choose(side);
    for (const tag of this.tags) {
      const level = this.level(tag.def.group);
      const shown = level !== 'off' && this.where(tag) && (level === 'always' || tag.until > this.time);
      tag.sprite.visible = shown;
      if (shown) tag.sprite.position.set(this.at.x + (tag.lo.x + tag.hi.x) / 2, this.at.y + tag.hi.y + LIFT, this.at.z + (tag.lo.z + tag.hi.z) / 2);
    }
  }

  private level(group: Group): NameLevel {
    return group === 'front' ? display.frontNames : group === 'back' ? display.backNames : display.officeNames;
  }

  /** Leaves the tag's object's place in `at`; false if it is not in the shop now (hidden). */
  private where(tag: Tag): boolean {
    const object = tag.object;
    for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
    object.getWorldPosition(this.at);
    return true;
  }

  /** The name this hand chooses: what an empty hand is at, or what it points at (the eyes too). */
  private choose(side: number): void {
    const hand = hands.all[side];
    if (!hand?.tracked || chef.hands[side].holding !== Held.None || prep.carrying[side]) return;
    let best: Tag | null = null;
    let bestD = Infinity;
    const pointing = heldOut(hand, this.head);
    for (const tag of this.tags) {
      const group = tag.def.group;
      if (this.level(group) !== 'chosen' || tag.def.surface || !this.where(tag)) continue;
      let d: number;
      if (group === 'office') {
        // Out of reach: pointed at with the hand held out, or looked at.
        const pointed = pointing ? pointOff(hand, this.at) : Infinity;
        const looked = side === 0 ? gazeOff(this.player, this.at, 0.05) : Infinity;
        d = pointed < POINT_ACROSS_DEG ? pointed : looked < GAZE_CONE_DEG ? looked : Infinity;
      } else {
        if (pointing) continue;
        const g = hand.grasp;
        const x = g.x - this.at.x;
        const y = g.y - this.at.y;
        const z = g.z - this.at.z;
        const inside =
          x > tag.lo.x - NEAR_SIDE && x < tag.hi.x + NEAR_SIDE &&
          z > tag.lo.z - NEAR_SIDE && z < tag.hi.z + NEAR_SIDE &&
          y > tag.lo.y - NEAR_BELOW && y < tag.hi.y + NEAR_ABOVE;
        if (!inside) continue;
        d = Math.hypot(x - (tag.lo.x + tag.hi.x) / 2, z - (tag.lo.z + tag.hi.z) / 2);
      }
      if (d < bestD) {
        bestD = d;
        best = tag;
      }
    }
    if (best) best.until = this.time + LINGER;
  }
}
