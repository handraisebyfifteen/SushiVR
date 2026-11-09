import { BufferAttribute, BufferGeometry, type Object3D, Vector3 } from '@iwsdk/core';

/**
 * The nigiri's shapes (the user's shop): the shari is a funagata (舟形), a
 * flat bottom, a gently domed top and ends that taper, 29 g (the owner,
 * 2026-11-10; about 6.5 x 2.9 x 2.4 cm, 31 cm3 of mesh); the neta (7-8 cm
 * long, 3 cm wide, 5-7 mm thick for lean tuna, about 19 g: shari 6 to neta
 * 4) drapes over it. The shari is shaped through the work: a loose lump from
 * the tub, rounded in the fist, then each of the three touches presses it
 * closer to the finished form, and the neta settles over it as it does.
 *
 * Shapes are computed on the CPU into one geometry per piece (no allocation
 * while shaping). A shaped geometry keeps its finished shape (or the flat
 * slice) in `aRest`, which the neta material samples instead of the moving
 * position, so the grain stays put on the surface while it is pressed.
 */

/** The finished shari: half length (along the neta), half width, height (m). */
export const SHARI_HALF_LENGTH = 0.0325;
export const SHARI_HALF_WIDTH = 0.0145;
export const SHARI_HEIGHT = 0.024;

/** One step of the shaping: half length a, half width b, height h; the ends' height (share of h), the flat bottom, the taper, the lumps. */
interface ShariStage {
  a: number;
  b: number;
  h: number;
  base: number;
  flat: number;
  taper: number;
  lump: number;
}

/** 0 loose from the tub, 1 rounded in the fist, 2 after touch 1, 3 after touch 2, 4 finished (touch 3). */
const STAGES: readonly ShariStage[] = [
  { a: 0.0221, b: 0.0195, h: 0.0336, base: 0.5, flat: 0, taper: 0, lump: 0.16 },
  { a: 0.0273, b: 0.017, h: 0.03, base: 0.46, flat: 0.25, taper: 0.1, lump: 0.08 },
  { a: 0.0302, b: 0.0158, h: 0.0262, base: 0.45, flat: 0.75, taper: 0.14, lump: 0.045 },
  { a: 0.0317, b: 0.0149, h: 0.0247, base: 0.46, flat: 0.92, taper: 0.18, lump: 0.02 },
  { a: SHARI_HALF_LENGTH, b: SHARI_HALF_WIDTH, h: SHARI_HEIGHT, base: 0.48, flat: 1, taper: 0.2, lump: 0.006 },
];
export const SHARI_FINISHED = STAGES.length - 1;

const RINGS = 20;
const SEGMENTS = 32;

const spow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The shaping parameters at a stage, fractional stages blend the two around them. */
function stageAt(stage: number, out: ShariStage): ShariStage {
  const s = Math.min(SHARI_FINISHED, Math.max(0, stage));
  const i = Math.min(SHARI_FINISHED - 1, Math.floor(s));
  const t = s - i;
  const p = STAGES[i];
  const q = STAGES[i + 1];
  out.a = lerp(p.a, q.a, t);
  out.b = lerp(p.b, q.b, t);
  out.h = lerp(p.h, q.h, t);
  out.base = lerp(p.base, q.base, t);
  out.flat = lerp(p.flat, q.flat, t);
  out.taper = lerp(p.taper, q.taper, t);
  out.lump = lerp(p.lump, q.lump, t);
  return out;
}

/** Smooth lumps of a hand-made ball: a few waves over the direction, fixed per piece by the seed. */
function lumps(x: number, y: number, z: number, seed: number): number {
  return (
    0.5 * Math.sin(5.1 * x + 1.7 * y + seed) +
    0.3 * Math.sin(3.3 * z - 4.2 * x + 2.1 * seed) +
    0.2 * Math.sin(6.7 * y + 2.9 * z + 3.7 * seed)
  );
}

/** Where a unit direction of the ball goes at a stage: along X, flat bottom on y = 0. */
function shariPoint(x: number, y: number, z: number, s: ShariStage, seed: number, out: Vector3): Vector3 {
  const k = 1 + s.lump * lumps(x, y, z, seed);
  // Rounded ends, a full body (an oval seen from above, not a lens).
  const X = s.a * spow(x, 0.8) * k;
  const Z = s.b * spow(z, 0.8) * (1 - s.taper * x * x) * k;
  const baseH = s.base * s.h;
  let Y: number;
  if (y >= 0) {
    // A long, gentle top (the boat's keel, upside down).
    Y = baseH + (s.h - baseH) * y ** 0.65 * (1 - 0.3 * s.taper * x * x) * k;
  } else {
    // A round underside while loose; pressed, a flat bottom with a rounded edge.
    const round = baseH * (1 + y);
    const pressed = baseH * smooth(-lerp(1, 0.32, s.flat), 0, y);
    Y = lerp(round, pressed, s.flat);
  }
  return out.set(X, Y, Z);
}

/** A ball with no seam (one vertex per ring point, one per pole), so recomputed normals stay smooth. */
function ballDirections(): Float32Array {
  const dirs: number[] = [0, 1, 0];
  for (let r = 1; r < RINGS; r++) {
    const lat = Math.PI / 2 - (r * Math.PI) / RINGS;
    for (let s = 0; s < SEGMENTS; s++) {
      const lon = (s * Math.PI * 2) / SEGMENTS;
      dirs.push(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
    }
  }
  dirs.push(0, -1, 0);
  return new Float32Array(dirs);
}

function ballIndex(): number[] {
  const index: number[] = [];
  const ring = (r: number, s: number) => 1 + (r - 1) * SEGMENTS + (s % SEGMENTS);
  const south = 1 + (RINGS - 1) * SEGMENTS;
  for (let s = 0; s < SEGMENTS; s++) index.push(0, ring(1, s + 1), ring(1, s));
  for (let r = 1; r < RINGS - 1; r++) {
    for (let s = 0; s < SEGMENTS; s++) {
      const a = ring(r, s);
      const b = ring(r, s + 1);
      const c = ring(r + 1, s);
      const d = ring(r + 1, s + 1);
      index.push(a, b, c, b, d, c);
    }
  }
  for (let s = 0; s < SEGMENTS; s++) index.push(south, ring(RINGS - 1, s), ring(RINGS - 1, s + 1));
  return index;
}

const DIRS = ballDirections();
const INDEX = ballIndex();
const tmpStage: ShariStage = { ...STAGES[0] };
const tmpV = new Vector3();

/**
 * A shari for one piece: its geometry (bottom centre at the origin, long
 * along X) and its shaping. `shape(stage)` reshapes it in place; the neta
 * material's pattern attributes (colour, aFlat) are set once.
 */
export class Shari {
  readonly geometry = new BufferGeometry();
  private readonly pos: BufferAttribute;
  private seed = 1.3;
  /** The stage shown now, and its height. */
  stage = -1;
  height = 0;

  constructor() {
    const n = DIRS.length / 3;
    this.pos = new BufferAttribute(new Float32Array(n * 3), 3);
    this.geometry.setAttribute('position', this.pos);
    this.geometry.setAttribute('normal', new BufferAttribute(new Float32Array(n * 3), 3));
    this.geometry.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    this.geometry.setAttribute('aFlat', new BufferAttribute(new Float32Array(n), 1));
    // The grain follows the finished shape, so it stays on the rice as it is pressed.
    const rest = new Float32Array(n * 3);
    stageAt(SHARI_FINISHED, tmpStage);
    for (let i = 0; i < n; i++) {
      shariPoint(DIRS[i * 3], DIRS[i * 3 + 1], DIRS[i * 3 + 2], tmpStage, 0, tmpV);
      rest[i * 3] = tmpV.x;
      rest[i * 3 + 1] = tmpV.y;
      rest[i * 3 + 2] = tmpV.z;
    }
    this.geometry.setAttribute('aRest', new BufferAttribute(rest, 3));
    this.geometry.setIndex(INDEX);
    this.geometry.name = 'Shari';
    this.shape(0);
  }

  /** A new ball from the tub: new lumps. */
  reseed(seed: number): void {
    this.seed = seed;
    this.stage = -1;
  }

  /** Reshape to a stage (0 loose ... 4 finished; fractions blend). */
  shape(stage: number): void {
    if (Math.abs(stage - this.stage) < 1e-4) return;
    this.stage = stage;
    const s = stageAt(stage, tmpStage);
    const p = this.pos.array as Float32Array;
    const n = DIRS.length / 3;
    for (let i = 0; i < n; i++) {
      shariPoint(DIRS[i * 3], DIRS[i * 3 + 1], DIRS[i * 3 + 2], s, this.seed, tmpV);
      p[i * 3] = tmpV.x;
      p[i * 3 + 1] = tmpV.y;
      p[i * 3 + 2] = tmpV.z;
    }
    this.height = s.h;
    this.pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();
  }
}

/** Stiff toppings bend less over the shari (tamago, abalone, scallop); the rest drape fully. Keyed by the case look's shape. */
export const TOPPING_STIFFNESS: Partial<Record<string, number>> = { block: 0.25, shell: 0.55, halves: 0.6 };

/** How low (m) the neta's tips may hang: this far above the shari's bottom (about its ends' height). */
const TIP_CLEARANCE = 0.0084;
/** How far its sides fall over the shari's width at full drape. */
const SIDE_FALL = 0.0035;

/**
 * The neta's drop along its length at full drape, relative to its middle:
 * over the shari it follows the finished dome, past the shari's ends it
 * keeps falling, easing off so the tips hang just above the bottom.
 */
function dropAlong(u: number): number {
  const a = SHARI_HALF_LENGTH * 0.98;
  // The neta rests on the dome, not hugging its very ends.
  const k = 0.85 * SHARI_HEIGHT * (1 - STAGES[SHARI_FINISHED].base);
  const raw = k * (u / a) ** 2;
  if (Math.abs(u) <= a) return raw;
  const atEnd = k;
  const room = SHARI_HEIGHT - TIP_CLEARANCE - atEnd;
  return atEnd + room * (1 - Math.exp(-(raw - atEnd) / room));
}

/**
 * A topping that bends over the shari: its own copy of the slice geometry
 * (bent in place), the flat slice it came from, the axis it is long along
 * (local X or Z), and its height range. Bending turns the slice's authored
 * normals with the surface, so its shading is kept.
 */
export class Drape {
  readonly geometry: BufferGeometry;
  private readonly rest: Float32Array;
  private readonly restNormals: Float32Array;
  private readonly alongX: boolean;
  private readonly halfWidth: number;
  /** Lowest and highest point of the flat slice (local y). */
  readonly minY: number;
  readonly maxY: number;
  /** The bend shown now: 0 flat, 1 fully over the finished shari, negative cupped upward (in the palm). */
  amount = 0;

  constructor(source: BufferGeometry) {
    this.geometry = source.clone();
    this.geometry.name = 'NetaDraped';
    const pos = this.geometry.getAttribute('position');
    const nor = this.geometry.getAttribute('normal');
    this.rest = new Float32Array(pos.array as ArrayLike<number>);
    this.restNormals = new Float32Array(nor.array as ArrayLike<number>);
    this.geometry.setAttribute('aRest', new BufferAttribute(new Float32Array(this.rest), 3));
    this.geometry.computeBoundingBox();
    const b = this.geometry.boundingBox!;
    this.alongX = b.max.x - b.min.x >= b.max.z - b.min.z;
    this.halfWidth = Math.max(1e-3, (this.alongX ? b.max.z - b.min.z : b.max.x - b.min.x) / 2);
    this.minY = b.min.y;
    this.maxY = b.max.y;
  }

  /** True when it is long along local Z (the shari is then turned to lie along it). */
  get alongZ(): boolean {
    return !this.alongX;
  }

  /** Bend by `amount` (stiff toppings pass a smaller one). */
  bend(amount: number): void {
    if (Math.abs(amount - this.amount) < 1e-4) return;
    this.amount = amount;
    const pos = this.geometry.getAttribute('position') as BufferAttribute;
    const nor = this.geometry.getAttribute('normal') as BufferAttribute;
    const p = pos.array as Float32Array;
    const n = nor.array as Float32Array;
    const r = this.rest;
    const rn = this.restNormals;
    const e = 1e-4;
    const ui = this.alongX ? 0 : 2;
    const vi = this.alongX ? 2 : 0;
    for (let i = 0; i < pos.count; i++) {
      const o = i * 3;
      const u = r[o + ui];
      const v = r[o + vi];
      const w = v / this.halfWidth;
      const drop = dropAlong(u) + SIDE_FALL * w * w;
      p[o] = r[o];
      p[o + 1] = r[o + 1] - amount * drop;
      p[o + 2] = r[o + 2];
      // Turn the normal with the surface: along the length, then across it.
      const phi = Math.atan((amount * (dropAlong(u + e) - dropAlong(u - e))) / (2 * e));
      const psi = Math.atan((amount * 2 * SIDE_FALL * w) / this.halfWidth);
      const cu = Math.cos(phi);
      const su = Math.sin(phi);
      const cv = Math.cos(psi);
      const sv = Math.sin(psi);
      const nu = rn[o + ui] * cu + rn[o + 1] * su;
      const ny1 = -rn[o + ui] * su + rn[o + 1] * cu;
      n[o + ui] = nu;
      n[o + vi] = rn[o + vi] * cv + ny1 * sv;
      n[o + 1] = -rn[o + vi] * sv + ny1 * cv;
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

/** A served copy of a piece shares its working geometries: give it its own, freed with it (releasePiece). */
export function ownPieceGeometry(piece: Object3D): void {
  piece.traverse((o) => {
    const mesh = o as Object3D & { isMesh?: boolean; geometry?: BufferGeometry };
    if (!mesh.isMesh || !mesh.geometry) return;
    if (mesh.name !== 'Shari' && mesh.name !== 'Neta') return;
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.userData = { ownGeometry: true };
  });
}

/** Frees the geometries a served copy owns (ownPieceGeometry), before the copy is disposed. */
export function releasePiece(piece: Object3D | null | undefined): void {
  piece?.traverse((o) => {
    const mesh = o as Object3D & { isMesh?: boolean; geometry?: BufferGeometry };
    if (mesh.isMesh && mesh.geometry?.userData.ownGeometry) mesh.geometry.dispose();
  });
}
