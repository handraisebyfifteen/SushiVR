import {
  AdditiveBlending,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { mergeBoxes, mergeGeometries } from './batch.js';
import { prepMaterial, roundedBlock } from './neta-look.js';
import { seeded, taperedTube } from './neta-paint.js';

/**
 * The gas range in the morning prep (stage 3), from putting things in the
 * pot: a pot each for the octopus (炊く, a high flame), the conger eel
 * (煮る, the broth held at 90 degrees), the gourd strips and the abalone
 * (煮切る, until the liquid is gone), and a grill net for searing the
 * bonito belly on skewers (金串) through its skin side. The ingredients
 * come prepared in the fish shop's ice box. Runtime meshes
 * (src/range-system.ts); `back-row-preview` lays them out.
 * Origins at the bottom (grate contact) unless said otherwise.
 */

export type PotId = 'Octopus' | 'SeaEel' | 'Kanpyo' | 'Abalone';

export interface PotSpec {
  radius: number;
  height: number;
  /** The liquid's colour and its depth when full (from the pot's floor). */
  liquid: string;
  depth: number;
  /** One long handle (a yukihira pan) instead of two side handles. */
  longHandle?: boolean;
}

export const POT_SPECS: Record<PotId, PotSpec> = {
  Octopus: { radius: 0.1, height: 0.15, liquid: '#C8D7DD', depth: 0.11 },
  SeaEel: { radius: 0.13, height: 0.065, liquid: '#6B4423', depth: 0.04 },
  Kanpyo: { radius: 0.065, height: 0.07, liquid: '#8A5A26', depth: 0.045, longHandle: true },
  Abalone: { radius: 0.09, height: 0.09, liquid: '#5C3A1A', depth: 0.06 },
};

const aluminium = new MeshStandardMaterial({ color: '#C9CDD1', roughness: 0.32, metalness: 0.75 });
const handleWood = new MeshStandardMaterial({ color: '#5A3B22', roughness: 0.6 });
const steel = new MeshStandardMaterial({ color: '#B9BEC3', roughness: 0.3, metalness: 0.85 });
const bubbleMaterial = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.1, transparent: true, opacity: 0.55 });
const flameMaterial = new MeshBasicMaterial({ color: '#4F8BFF', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false });
const markMaterial = new MeshBasicMaterial({ color: '#F4F4F0' });

const at = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);

/** A pot: `Body`, `Handles`, `Liquid` (its y set by the level), `Bubbles` (shown while it boils). */
export function createPot(id: PotId): Group {
  const s = POT_SPECS[id];
  const root = new Group();
  root.name = `Pot${id}`;
  const R = s.radius;
  const H = s.height;
  const t = 0.003;
  const wall = [[0.001, 0], [R - 0.008, 0], [R, 0.008], [R, H], [R + 0.004, H + 0.003], [R - t, H], [R - t, t + 0.006], [R - t - 0.008, t], [0.001, t]].map(
    ([r, y]) => new Vector2(r, y),
  );
  const body = new Mesh(new LatheGeometry(wall, 32), aluminium);
  body.name = 'Body';
  const handles = s.longHandle
    ? new Mesh(new CylinderGeometry(0.011, 0.013, 0.14, 10).rotateZ(Math.PI / 2).translate(-R - 0.075, H * 0.8, 0), handleWood)
    : new Mesh(
        mergeGeometries([
          [new TorusGeometry(0.02, 0.004, 6, 12, Math.PI), at(R + 0.002, H * 0.8, 0).multiply(new Matrix4().makeRotationY(-Math.PI / 2))],
          [new TorusGeometry(0.02, 0.004, 6, 12, Math.PI), at(-R - 0.002, H * 0.8, 0).multiply(new Matrix4().makeRotationY(Math.PI / 2))],
        ]),
        aluminium,
      );
  handles.name = 'Handles';
  const liquid = new Mesh(
    new CylinderGeometry(R - t - 0.001, R - t - 0.001, 0.002, 32),
    new MeshStandardMaterial({ color: s.liquid, roughness: 0.06, transparent: id === 'Octopus', opacity: id === 'Octopus' ? 0.6 : 1 }),
  );
  liquid.position.y = s.depth;
  liquid.name = 'Liquid';
  const rnd = seeded(`bubbles-${id}`);
  const parts: Array<[BufferGeometry, Matrix4]> = [];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const r = (0.2 + 0.7 * Math.sqrt(rnd())) * (R - 0.01);
    parts.push([new SphereGeometry(0.003 + rnd() * 0.003, 6, 4), at(Math.cos(a) * r, 0.001, Math.sin(a) * r)]);
  }
  const bubbles = new Mesh(mergeGeometries(parts), bubbleMaterial);
  bubbles.name = 'Bubbles';
  bubbles.visible = false;
  liquid.add(bubbles);
  root.add(body, handles, liquid);
  return root;
}

/** A burner's flame: a ring of small blue cones, origin at the burner cap; scale y by the flame. */
export function createFlame(radius = 0.036, count = 12): Mesh {
  const parts: Array<[BufferGeometry, Matrix4]> = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    parts.push([new ConeGeometry(0.006, 0.022, 6).translate(0, 0.011, 0), at(Math.cos(a) * radius, 0, Math.sin(a) * radius)]);
  }
  const mesh = new Mesh(mergeGeometries(parts), flameMaterial);
  mesh.name = 'Flame';
  mesh.visible = false;
  mesh.userData.iwsdkPreviewBounds = 'exclude';
  return mesh;
}

/** A white mark on a knob's face, pointing up when off; turned anticlockwise to light. Origin at the knob's centre, facing -Z. */
export function createKnobMark(): Mesh {
  const g = mergeBoxes([{ w: 0.004, h: 0.016, d: 0.002, x: 0, y: 0.008, z: 0 }]);
  const mesh = new Mesh(g, markMaterial);
  mesh.name = 'KnobMark';
  return mesh;
}

/** A square grill net (網) with a wire frame: 20 cm across, origin at its centre. */
export function createNet(): Mesh {
  const half = 0.1;
  const parts = [] as Array<{ w: number; h: number; d: number; x: number; y: number; z: number }>;
  for (const s of [-1, 1]) {
    parts.push({ w: 2 * half, h: 0.004, d: 0.004, x: 0, y: 0, z: s * half });
    parts.push({ w: 0.004, h: 0.004, d: 2 * half, x: s * half, y: 0, z: 0 });
  }
  for (let i = -4; i <= 4; i++) {
    parts.push({ w: 2 * half, h: 0.0016, d: 0.0016, x: 0, y: 0.002, z: i * 0.022 });
    parts.push({ w: 0.0016, h: 0.0016, d: 2 * half, x: i * 0.022, y: 0.0035, z: 0 });
  }
  const mesh = new Mesh(mergeBoxes(parts), steel);
  mesh.name = 'Net';
  return mesh;
}

// ---------------------------------------------------------------- ingredients

/** A material whose colour runs from raw to cooked as it simmers (the system lerps it). */
export interface Tint {
  material: MeshStandardMaterial;
  raw: Color;
  cooked: Color;
}

export interface IngredientLook {
  root: Group;
  tints: Tint[];
  /** Its height (the pinch point is on top of it). */
  top: number;
  /** Half its size across, for the pick. */
  halfWidth: number;
}

function tint(raw: string, cooked: string, roughness: number): Tint {
  return { material: new MeshStandardMaterial({ color: raw, roughness }), raw: new Color(raw), cooked: new Color(cooked) };
}

/** A block of length L along Z, H high, W wide, centred on the origin in X and Z, bottom at y0. */
function slab(L: number, H: number, W: number, r: number, y0 = 0): BufferGeometry {
  return roundedBlock(L, H, W, r).translate(-L / 2, y0, 0).rotateY(Math.PI / 2);
}

/** A small octopus, salted and washed: the head up, eight legs curling out round it. */
function octopus(): IngredientLook {
  const skin = tint('#7B6A6E', '#8A2E3E', 0.45);
  const rnd = seeded('octopus-legs');
  const parts: Array<[BufferGeometry, Matrix4]> = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rnd() * 0.25;
    const path: Vector3[] = [];
    const radii: number[] = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const reach = 0.018 + 0.055 * u;
      const curl = u > 0.6 ? (u - 0.6) * 2.6 : 0;
      path.push(new Vector3(Math.cos(a + curl) * reach, 0.012 - 0.006 * u + 0.012 * curl * curl, Math.sin(a + curl) * reach));
      radii.push(0.009 * (1 - u) + 0.0018);
    }
    parts.push([taperedTube(path, radii, 8, 0.75), new Matrix4()]);
  }
  parts.push([new SphereGeometry(0.03, 16, 12).scale(1, 0.85, 1.15), at(0, 0.034, 0.008)]);
  const mesh = new Mesh(mergeGeometries(parts), skin.material);
  mesh.name = 'Octopus';
  const root = new Group();
  root.name = 'OctopusPrepared';
  root.add(mesh);
  return { root, tints: [skin], top: 0.06, halfWidth: 0.075 };
}

/** Two conger eels, opened flat (背開き): white flesh up, the dark skin under. */
function seaEel(): IngredientLook {
  const flesh = tint('#EDE3DA', '#A8763E', 0.4);
  const skin = tint('#4A4440', '#3A2A20', 0.35);
  const root = new Group();
  root.name = 'SeaEelPrepared';
  for (const [i, x] of [-0.024, 0.024].entries()) {
    const f = new Mesh(slab(0.21, 0.006, 0.042, 0.002, 0.002), flesh.material);
    f.position.x = x;
    f.name = `Fillet${i}`;
    const s = new Mesh(slab(0.21, 0.002, 0.042, 0.0008), skin.material);
    s.position.x = x;
    s.name = `Skin${i}`;
    root.add(f, s);
  }
  return { root, tints: [flesh, skin], top: 0.008, halfWidth: 0.05 };
}

/** An abalone out of its shell, scrubbed: the cream foot, the dark frilled rim. */
function abalone(): IngredientLook {
  const body = tint('#D9C68E', '#B58E55', 0.35);
  const rim = tint('#4C4A3A', '#4A3520', 0.5);
  const root = new Group();
  root.name = 'AbalonePrepared';
  const foot = new Mesh(new SphereGeometry(0.04, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.6, 0.85), body.material);
  foot.name = 'Foot';
  const frill = new Mesh(new TorusGeometry(0.04, 0.006, 6, 28).rotateX(Math.PI / 2).scale(1.2, 1, 0.85).translate(0, 0.004, 0), rim.material);
  frill.name = 'Rim';
  root.add(foot, frill);
  return { root, tints: [body, rim], top: 0.026, halfWidth: 0.05 };
}

/** Gourd strips (かんぴょう), soaked and salt-rubbed: a coiled bundle of flat ribbons. */
function kanpyo(): IngredientLook {
  const strip = tint('#E6D9B8', '#A0703A', 0.5);
  const path: Vector3[] = [];
  const radii: number[] = [];
  for (let k = 0; k <= 60; k++) {
    const u = k / 60;
    const a = u * Math.PI * 2 * 3;
    const r = 0.026 + 0.012 * Math.sin(u * 9);
    path.push(new Vector3(Math.cos(a) * r, 0.004 + u * 0.016, Math.sin(a) * r));
    radii.push(0.007);
  }
  const mesh = new Mesh(taperedTube(path, radii, 6, 0.22), strip.material);
  mesh.name = 'Strips';
  const root = new Group();
  root.name = 'KanpyoPrepared';
  root.add(mesh);
  return { root, tints: [strip], top: 0.024, halfWidth: 0.045 };
}

/** What goes into each pot, as it comes out of the ice box. */
export function ingredientLook(id: PotId): IngredientLook {
  switch (id) {
    case 'Octopus':
      return octopus();
    case 'SeaEel':
      return seaEel();
    case 'Abalone':
      return abalone();
    case 'Kanpyo':
      return kanpyo();
  }
}

// ---------------------------------------------------------------- the bonito belly on skewers

/** The belly's four faces, in the order they come face down as it is turned: skin, then round. */
export const BELLY_FACES = ['skin', 'right', 'top', 'left'] as const;
export const BELLY_LENGTH = 0.2;
/** The skewers' rings, from the belly's middle along it (pushed right through). */
export const BELLY_RINGS_Z = 0.168;
const BELLY_W = 0.036;
const BELLY_H = 0.03;

export interface SearBelly {
  root: Group;
  /** Turned about Z (its length) a quarter at a time; its centre is on the axis. */
  body: Group;
  /** The sear on each face (BELLY_FACES order): opacity 0 to 1. */
  sear: MeshStandardMaterial[];
  skewers: Group;
}

/**
 * The bonito belly (its skin side down) with three skewers fanned through
 * it just over the skin, their rings out at the near end (+Z) to hold it by.
 * Each face has its own sear: the skin chars, the flesh sides turn pale.
 */
export function searBelly(): SearBelly {
  const root = new Group();
  root.name = 'BonitoBellySkewered';
  const body = new Group();
  body.name = 'Belly';
  const L = BELLY_LENGTH;
  const skinH = 0.004;
  const flesh = new Mesh(slab(L, BELLY_H - skinH, BELLY_W, 0.003, -BELLY_H / 2 + skinH), prepMaterial('BonitoBelly', [L, BELLY_H - skinH, BELLY_W]));
  flesh.name = 'Flesh';
  const skin = new Mesh(slab(L, skinH, BELLY_W, 0.0012, -BELLY_H / 2), new MeshStandardMaterial({ color: '#A9BAC6', roughness: 0.35 }));
  skin.name = 'Skin';
  body.add(flesh, skin);
  const sear: MeshStandardMaterial[] = [];
  const o = 0.0008;
  const faces: Array<[number, number, number, number, number]> = [
    // [w, h, x, y, z-length] of each overlay
    [BELLY_W - 0.002, 0.0012, 0, -BELLY_H / 2 - o, L - 0.004],
    [0.0012, BELLY_H - 0.003, BELLY_W / 2 + o, 0, L - 0.004],
    [BELLY_W - 0.002, 0.0012, 0, BELLY_H / 2 + o, L - 0.004],
    [0.0012, BELLY_H - 0.003, -BELLY_W / 2 - o, 0, L - 0.004],
  ];
  for (const [i, [w, h, x, y, len]] of faces.entries()) {
    const m = new MeshStandardMaterial({ color: i === 0 ? '#1E1612' : '#C9A79A', roughness: 0.8, transparent: true, opacity: 0, depthWrite: false });
    const overlay = new Mesh(mergeBoxes([{ w, h, d: len, x, y, z: 0 }]), m);
    overlay.name = `Sear${BELLY_FACES[i]}`;
    sear.push(m);
    body.add(overlay);
  }
  const skewers = new Group();
  skewers.name = 'Skewers';
  // 26 cm skewers: through, their tips reach the far end and the rings stand 7 cm off the near end.
  for (const [i, spread] of [-0.012, 0, 0.012].entries()) {
    const rod = new Mesh(new CylinderGeometry(0.0018, 0.0018, 0.26, 6).rotateX(Math.PI / 2), steel);
    rod.position.set(spread * 0.5, -BELLY_H / 2 + 0.008, 0.03);
    rod.rotation.y = spread * 1.2;
    const ring = new Mesh(new TorusGeometry(0.008, 0.0016, 5, 12), steel);
    ring.position.set(spread * 0.5 + Math.sin(spread * 1.2) * 0.13, -BELLY_H / 2 + 0.008, BELLY_RINGS_Z);
    rod.name = `Skewer${i}`;
    ring.name = `Ring${i}`;
    skewers.add(rod, ring);
  }
  skewers.visible = false;
  body.add(skewers);
  body.position.y = BELLY_H / 2;
  root.add(body);
  return { root, body, sear, skewers };
}
