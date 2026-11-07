import {
  BoxGeometry,
  Color,
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
} from '@iwsdk/core';
import { chef } from './game-state.js';
import { hands } from './hands.js';
import { playDone, playPick, playPut, playWarn } from './sfx.js';
import { type Kind, overStation, stations } from './station-system.js';
import { Held, StationKind } from './sushi-components.js';

export const COLOR_HINT = new Color('#8fd3ff');
export const COLOR_READY = new Color('#ffffff');
export const COLOR_DONE = new Color('#7CFC8C');
export const COLOR_WARN = new Color('#F2B134');
const FLASH_SECONDS = 0.4;
/** The same result sound is not repeated sooner than this (ms). */
const SOUND_GAP_MS = 120;
let lastSoundAt = -1e9;

/** Shared feedback channel: systems hint where to act and flash results. */
export const feedback = {
  /** Stations a hand can act on this frame (cleared after drawing). */
  hints: new Set<Kind>(),
  flashKind: null as Kind | null,
  flashColor: COLOR_DONE,
  flashTime: 0,
  flash(kind: Kind, color: Color): void {
    this.flashKind = kind;
    this.flashColor = color;
    this.flashTime = FLASH_SECONDS;
    // Hands have no vibration: a result is heard as well as seen.
    const now = performance.now();
    if (now - lastSoundAt < SOUND_GAP_MS) return;
    lastSoundAt = now;
    if (color === COLOR_WARN) playWarn();
    else if (color === COLOR_DONE) playDone();
  },
};

const cloned = new WeakSet<Mesh>();

/** Tint an object (and its children) with an emissive glow, or clear it. */
export function glowObject(object: Object3D, color: Color | null): void {
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    let material = mesh.material as MeshStandardMaterial;
    if (!material.isMeshStandardMaterial) return;
    if (!cloned.has(mesh)) {
      material = material.clone();
      mesh.material = material;
      cloned.add(mesh);
    }
    if (color) {
      material.emissive.copy(color);
      material.emissiveIntensity = 0.5;
    } else {
      material.emissiveIntensity = 0;
    }
  });
}

/**
 * Draws the station highlights: a soft ring (or frame, for box zones) on the
 * stations a hand can use next, bright while a hand is over one, and a short
 * green or amber flash for results. Runs after the gameplay systems.
 */
export class FeedbackSystem extends createSystem({}) {
  private marks = new Map<Kind, { group: Group; material: MeshBasicMaterial }>();
  /** What each hand held last frame, so a take or a put is heard. */
  private readonly held: string[] = [Held.None, Held.None];

  init(): void {
    for (const kind of Object.values(StationKind)) {
      const material = new MeshBasicMaterial({ color: COLOR_HINT, transparent: true, opacity: 0.6 });
      const group = new Group();
      group.name = `Mark_${kind}`;
      group.visible = false;
      this.world.createTransformEntity(group);
      this.marks.set(kind, { group, material });
    }
  }

  private build(kind: Kind): void {
    const mark = this.marks.get(kind)!;
    const info = stations.get(kind)!;
    if (info.halfW > 0) {
      const w = info.halfW * 2;
      const d = info.halfD * 2;
      const t = 0.012;
      const edges: Array<[number, number, number, number]> = [
        [w + t, t, 0, -info.halfD],
        [w + t, t, 0, info.halfD],
        [t, d + t, -info.halfW, 0],
        [t, d + t, info.halfW, 0],
      ];
      for (const [ew, ed, x, z] of edges) {
        const edge = new Mesh(new BoxGeometry(ew, 0.004, ed), mark.material);
        edge.position.set(x, 0, z);
        mark.group.add(edge);
      }
    } else {
      const ring = new Mesh(new RingGeometry(info.radius * 0.85, info.radius, 32), mark.material);
      ring.rotation.x = -Math.PI / 2;
      mark.group.add(ring);
    }
  }

  update(delta: number): void {
    feedback.flashTime = Math.max(0, feedback.flashTime - delta);
    // A take or a put is heard (the rice has its own rustle in the tub).
    for (let side = 0; side < 2; side++) {
      const now: string = chef.hands[side].holding;
      const was = this.held[side];
      if (now === was) continue;
      this.held[side] = now;
      if (was === Held.None && now !== Held.Rice) playPick();
      else if (now === Held.None && was !== Held.Rice) playPut();
    }
    for (const [kind, mark] of this.marks) {
      const info = stations.get(kind);
      if (!info) {
        mark.group.visible = false;
        continue;
      }
      if (mark.group.children.length === 0) this.build(kind);
      mark.group.position.set(info.pos.x, info.pos.y + 0.004, info.pos.z);
      const flashing = feedback.flashKind === kind && feedback.flashTime > 0;
      if (flashing) {
        mark.group.visible = true;
        mark.material.color.copy(feedback.flashColor);
        mark.material.opacity = 0.3 + 0.7 * (feedback.flashTime / FLASH_SECONDS);
        continue;
      }
      if (!feedback.hints.has(kind)) {
        mark.group.visible = false;
        continue;
      }
      let over = false;
      for (const hand of hands.all) {
        if (hand.tracked && (overStation(hand.palm, kind) || overStation(hand.grasp, kind))) over = true;
      }
      mark.group.visible = true;
      mark.material.color.copy(over ? COLOR_READY : COLOR_HINT);
      mark.material.opacity = over ? 0.9 : 0.45;
    }
    feedback.hints.clear();
  }
}
