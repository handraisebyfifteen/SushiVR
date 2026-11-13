import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Euler,
  LatheGeometry,
  type Material,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { NETA, type NetaId, type Pattern } from '../../menu.js';
import { bevelBox, LoftSurface, type TubeSection } from './hardsurface.js';
import { makeNetaMaterial, type NetaMaterial, NetaPattern } from './neta-material.js';
import { flat, paint, patterned, seeded, taperedTube, weld } from './neta-paint.js';

/**
 * How every neta looks, built from its look values in src/menu.ts. The
 * shapes carry few triangles; the neta material (neta-material.ts) paints
 * the fat streaks, skin, spots and bands per pixel, so they stay sharp.
 *
 * Block shapes (saku, sheet, tentacle, shell, block) are one body lying
 * along +X from its uncut end at x = 0, so slicing shortens it from the far
 * end. Piece shapes are one piece centred on the origin, lying flat with its
 * length along Z (head end toward -Z), plus an arrangement that stacks the
 * pieces in the case from the back (first) to the front (last), so the
 * pieces nearest the chef go first.
 */

/** Saku length (along X) and the case depth an arrangement may use. */
export const SAKU_LENGTH = 0.13;
export const CASE_ITEM_DEPTH = 0.135;

export type Dims = [number, number, number];

const SAKU_PATTERN: Partial<Record<Pattern, number>> = {
  plain: NetaPattern.SakuPlain,
  fatLight: NetaPattern.FatLight,
  fatHeavy: NetaPattern.FatHeavy,
  skinSilver: NetaPattern.SkinSilver,
  yellowLine: NetaPattern.YellowLine,
  bloodLine: NetaPattern.BloodLine,
  mackerel: NetaPattern.Mackerel,
};

/** A box with softly rounded edges, exactly L x H x W, from x = 0, y = 0, centred in z. */
export function roundedBlock(L: number, H: number, W: number, r: number): BufferGeometry {
  const g = bevelBox(L, H, W, r, r, 2);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
  g.scale(L / (b.max.x - b.min.x), H / (b.max.y - b.min.y), W / (b.max.z - b.min.z));
  g.translate(L / 2, H / 2, 0);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- blocks

function sakuBody(id: NetaId): { geometry: BufferGeometry; pattern: number; dims: Dims } {
  const W = NETA[id].look.width - 0.006;
  const H = 0.028;
  return {
    geometry: patterned(roundedBlock(SAKU_LENGTH, H, W, 0.003)),
    pattern: SAKU_PATTERN[NETA[id].look.pattern] ?? NetaPattern.SakuPlain,
    dims: [SAKU_LENGTH, H, W],
  };
}

function sheetBody(id: NetaId): { geometry: BufferGeometry; pattern: number; dims: Dims } {
  const W = NETA[id].look.width - 0.006;
  return { geometry: patterned(roundedBlock(SAKU_LENGTH, 0.012, W, 0.002)), pattern: NetaPattern.Squid, dims: [SAKU_LENGTH, 0.012, W] };
}

/** Octopus: one boiled leg (the shader gives maroon skin and a cream underside), with suckers. */
function tentacleBody(): { geometry: BufferGeometry; pattern: number; dims: Dims } {
  const path: Vector3[] = [];
  const radii: number[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = 0.0185 - 0.0125 * t ** 0.8;
    const curl = Math.max(0, t - 0.6) ** 2 * 0.3;
    path.push(new Vector3(t * 0.12, r * 0.75, Math.sin(t * Math.PI) * 0.004 + curl));
    radii.push(r);
  }
  const parts: Array<BufferGeometry | [BufferGeometry, Matrix4]> = [patterned(taperedTube(path, radii, 12, 0.75))];
  const sucker = flat(new SphereGeometry(0.0042, 6, 4), '#E9C9C0');
  for (let i = 0; i < 9; i++) {
    const k = Math.round((0.06 + i * 0.1) * steps);
    const r = radii[k];
    const s = 0.55 + 0.45 * (1 - k / steps);
    parts.push([sucker, new Matrix4().makeScale(s, s * 0.6, s).setPosition(path[k].x, path[k].y - r * 0.55, path[k].z + (i % 2 ? 0.5 : -0.5) * r)]);
  }
  return { geometry: weld(parts), pattern: NetaPattern.Octopus, dims: [0.12, 0.0185, 0.037] };
}

/** Abalone, simmered whole: an oval dome. */
function shellBody(id: NetaId): { geometry: BufferGeometry; pattern: number; dims: Dims } {
  const L = 0.095;
  const W = NETA[id].look.width - 0.006;
  const g = new SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(L / 2, 0.024, W / 2);
  g.translate(L / 2, 0, 0);
  return { geometry: patterned(g), pattern: NetaPattern.Abalone, dims: [L, 0.024, W] };
}

/** Tamago: a yellow block in thin layers, browned top and bottom. */
function blockBody(id: NetaId): { geometry: BufferGeometry; pattern: number; dims: Dims } {
  const W = NETA[id].look.width - 0.006;
  return { geometry: patterned(roundedBlock(0.12, 0.032, W, 0.0025)), pattern: NetaPattern.Tamago, dims: [0.12, 0.032, W] };
}

// ---------------------------------------------------------------- pieces

/** Narrows a flat piece toward its tail (+Z) and curves its ends down. */
function shape(g: BufferGeometry, length: number, taper: number, bend: number): BufferGeometry {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getZ(i) / length + 0.5; // 0 head .. 1 tail
    pos.setX(i, pos.getX(i) * (1 - taper * t));
    const u = pos.getZ(i) / (length / 2);
    pos.setY(i, pos.getY(i) - bend * u * u);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function filletPiece(id: NetaId): BufferGeometry {
  return patterned(shape(new BoxGeometry(0.028, 0.006, 0.072, 3, 1, 10), 0.072, 0.4, 0.003));
}

function prawnPiece(id: NetaId): BufferGeometry {
  const L = 0.062;
  const tail = paint(new BoxGeometry(0.02, 0.003, 0.014, 3, 1, 2), (p, _n, out) => {
    out.set(NETA[id].look.color2);
    if (p.z > 0.004) out.multiplyScalar(0.6);
  });
  return weld([
    patterned(shape(new BoxGeometry(0.034, 0.005, L, 3, 1, 10), L, 0.45, 0.002)),
    [tail, new Matrix4().makeTranslation(0, 0.001, L / 2 + 0.005)],
  ]);
}

/** A live kuruma-ebi in the case: curled a little, head and body round, its tail fan flat (the stripes are the pattern's). */
function wholePrawnPiece(): BufferGeometry {
  const path: Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    path.push(new Vector3(Math.sin(t * 2.2) * 0.009, 0.0075 + 0.002 * Math.sin(t * Math.PI), -0.034 + t * 0.064));
    radii.push(t < 0.3 ? 0.0085 : 0.0085 - 0.005 * ((t - 0.3) / 0.7));
  }
  const tail = flat(new SphereGeometry(1, 8, 4).scale(0.009, 0.0016, 0.008), '#4A6075');
  return weld([patterned(taperedTube(path, radii, 10, 0.85)), [tail, new Matrix4().makeTranslation(Math.sin(2.2) * 0.009, 0.004, 0.034)]]);
}

function shrimpPiece(): BufferGeometry {
  const path: Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const r = 0.0062 - 0.0034 * t;
    path.push(new Vector3(Math.sin(t * Math.PI) * 0.006, r * 0.65, -0.027 + t * 0.054));
    radii.push(r);
  }
  const tail = flat(new SphereGeometry(1, 6, 4).scale(0.005, 0.0015, 0.004), '#D8432D');
  return weld([patterned(taperedTube(path, radii, 8, 0.65)), [tail, new Matrix4().makeTranslation(0, 0.002, 0.03)]]);
}

function scallopPiece(): BufferGeometry {
  return patterned(new SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.017, 0.009, 0.015));
}

function tonguePiece(): BufferGeometry {
  return patterned(shape(new BoxGeometry(0.03, 0.005, 0.058, 3, 1, 10), 0.058, 0.55, 0.003));
}

/** Squid legs (geso), opened flat: four legs side by side, suckers underneath, joined at the head end. */
function gesoPiece(): BufferGeometry {
  const parts: Array<BufferGeometry | [BufferGeometry, Matrix4]> = [];
  for (let i = 0; i < 4; i++) {
    const path: Vector3[] = [];
    const radii: number[] = [];
    const x0 = (i - 1.5) * 0.0062;
    for (let k = 0; k <= 7; k++) {
      const t = k / 7;
      path.push(new Vector3(x0 * (1 + 0.5 * t) + Math.sin(t * 3 + i) * 0.0012, 0.0024, -0.026 + t * 0.054));
      radii.push(0.0034 - 0.0022 * t);
    }
    parts.push(flat(taperedTube(path, radii, 6, 0.6), i % 2 ? '#EADFD3' : '#E4D6C9'));
  }
  const sucker = flat(new SphereGeometry(0.0011, 4, 3), '#C99C8C');
  for (let i = 0; i < 4; i++) {
    for (let k = 1; k < 7; k++) {
      parts.push([sucker, new Matrix4().makeTranslation((i - 1.5) * 0.0062 * (1 + (0.5 * k) / 7), 0.0006, -0.026 + (k / 7) * 0.054)]);
    }
  }
  return weld(parts);
}

function eelPiece(): BufferGeometry {
  return patterned(shape(new BoxGeometry(0.034, 0.008, 0.085, 2, 1, 8), 0.085, 0.25, 0.003));
}

/** One halved, seasoned fried-tofu pouch lying flat, as they are stacked in the case. */
function pouchPiece(): BufferGeometry {
  // Soaked halves lie flat and soft, so a pile of ten stays low.
  return pillow(0.0192, 0.0024, 0.014, 0.65);
}

/**
 * The inari in the hand, lying along Z like a nigiri: the opened pouch,
 * the same pouch filled plump (a Kanto-style tawara), the rice showing in
 * its open mouth (+Z end), and the mouth folded shut.
 */
export function inariShapes(): { open: BufferGeometry; plump: BufferGeometry; rice: BufferGeometry; fold: BufferGeometry } {
  return {
    open: pillow(0.019, 0.0045, 0.03, 0.7),
    plump: pillow(0.019, 0.0135, 0.031, 0.5),
    rice: paint(new SphereGeometry(1, 12, 8).scale(0.0145, 0.0095, 0.003), (_p, _n, out) => out.set('#F6F2EA')).translate(0, 0.0125, 0.03),
    // The mouth folded under at the +Z end: a soft lip of pouch.
    fold: pillow(0.0175, 0.011, 0.0045, 0.6).translate(0, 0.001, 0.029),
  };
}

/**
 * A soft pouch: a sphere pushed toward a rounded box (squareness 0 = box,
 * 1 = ellipsoid), half-sizes x, y, z, resting on y = 0 with a flattened
 * bottom and the gentle wrinkles of simmered fried tofu.
 */
function pillow(hx: number, hy: number, hz: number, squareness: number): BufferGeometry {
  const g = new SphereGeometry(1, 28, 18);
  const pos = g.getAttribute('position');
  const e = 0.35 + 0.65 * squareness;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const sx = Math.sign(v.x) * Math.abs(v.x) ** e;
    const sy = Math.sign(v.y) * Math.abs(v.y) ** (e * 1.2);
    const sz = Math.sign(v.z) * Math.abs(v.z) ** e;
    const wrinkle = 1 + 0.035 * Math.sin(v.x * 23 + v.z * 9) * Math.sin(v.z * 17 - v.y * 5);
    let y = sy * hy * wrinkle + hy * 0.85;
    if (y < 0.0005) y = 0.0005;
    pos.setXYZ(i, sx * hx * wrinkle, y, sz * hz * wrinkle);
  }
  g.computeVertexNormals();
  return patterned(g);
}

/** Uni lobe length, width and height: a soft tongue, about three times as long as it is wide. */
export const UNI_LOBE: Dims = [0.024, 0.0078, 0.0125];

/** One uni lobe: a slightly curved, tapering tongue lying along X, centred, resting at y = 0. */
function uniLobe(): BufferGeometry {
  const [L, H, W] = UNI_LOBE;
  const path: Vector3[] = [];
  const radii: number[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Plump all along, rounding off at both ends.
    const r = (W / 2) * (0.35 + 0.65 * Math.sin(Math.PI * t) ** 0.35);
    path.push(new Vector3(-L / 2 + t * L, (H / 2) * 0.9, Math.sin(Math.PI * t) * 0.0012));
    radii.push(r);
  }
  return patterned(taperedTube(path, radii, 10, H / W));
}

function roeBead(): BufferGeometry {
  return patterned(new SphereGeometry(0.003, 8, 6).translate(0, 0.003, 0));
}

function stickPiece(): BufferGeometry {
  return patterned(roundedBlock(0.115, 0.009, 0.011, 0.0015).rotateY(Math.PI / 2).translate(0, 0, 0.0575));
}

/** Kanpyo: a bundle of three wavy ribbons (plain colours). */
function ribbonBundle(id: NetaId): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const g = new BoxGeometry(0.011, 0.0016, 0.115, 1, 1, 14);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) + 0.0012 + k * 0.0021 + 0.0012 * Math.sin(pos.getZ(i) * 110 + k * 2));
      pos.setX(i, pos.getX(i) + (k - 1) * 0.0012);
    }
    g.computeVertexNormals();
    const c = k === 1 ? NETA[id].look.color2 : NETA[id].look.color;
    parts.push(paint(g, (p, _n, out) => {
      out.set(c);
      out.multiplyScalar(0.92 + 0.08 * Math.sin(p.z * 900 + k));
    }));
  }
  return weld(parts);
}

function pasteDab(id: NetaId): BufferGeometry {
  return flat(new SphereGeometry(1, 10, 5).scale(0.0062, 0.003, 0.0062).translate(0, 0.0072, 0), NETA[id].look.color);
}

/** Shiso: a serrated leaf, slightly cupped. */
function leafPiece(): BufferGeometry {
  const g = new BoxGeometry(0.042, 0.0012, 0.062, 6, 1, 10);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getZ(i) / 0.031;
    const half = Math.sqrt(Math.max(0.02, 1 - t * t)) * (t < 0 ? 1 + 0.15 * t : 1);
    pos.setX(i, pos.getX(i) * half * (1 + 0.07 * Math.sin(t * 38)));
    pos.setY(i, pos.getY(i) + 0.0018 * (1 - (pos.getX(i) / 0.021) ** 2));
  }
  g.computeVertexNormals();
  return patterned(g);
}

// ---------------------------------------------------------------- containers

/** A shallow wooden tray (uni, ikura), front edge at z = 0. */
/** The uni's ori: a thin white-wood board with a low rim all round, front edge at z = 0. */
function trayGeometry(id: NetaId, depth: number): BufferGeometry {
  const wood = NETA[id].look.color2;
  const w = NETA[id].look.width - 0.004;
  const rim = 0.007;
  const box = (bw: number, bh: number, bd: number, x: number, y: number, z: number): [BufferGeometry, Matrix4] => [
    flat(new BoxGeometry(bw, bh, bd), wood),
    new Matrix4().makeTranslation(x, y, z),
  ];
  return weld([
    box(w, 0.003, depth, 0, 0.0015, -depth / 2),
    box(w, rim, 0.0025, 0, rim / 2, -0.00125),
    box(w, rim, 0.0025, 0, rim / 2, -depth + 0.00125),
    box(0.0025, rim, depth, -w / 2 + 0.00125, rim / 2, -depth / 2),
    box(0.0025, rim, depth, w / 2 - 0.00125, rim / 2, -depth / 2),
  ]);
}

/** The inari pouches' nakago: a stainless insert pan, front edge at z = 0, with a small lip. */
const PAN_DEPTH = 0.064;
const PAN_HEIGHT = 0.034;
const PAN_FLOOR = 0.0015;
function insertPan(id: NetaId): BufferGeometry {
  const w = NETA[id].look.width - 0.003;
  const t = 0.0012;
  const steel = '#C9CDD2';
  const box = (bw: number, bh: number, bd: number, x: number, y: number, z: number): [BufferGeometry, Matrix4] => [
    flat(new BoxGeometry(bw, bh, bd), steel),
    new Matrix4().makeTranslation(x, y, z),
  ];
  return weld([
    box(w - 0.004, t, PAN_DEPTH - 0.004, 0, t / 2, -PAN_DEPTH / 2),
    box(w, PAN_HEIGHT, t, 0, PAN_HEIGHT / 2, -t / 2),
    box(w, PAN_HEIGHT, t, 0, PAN_HEIGHT / 2, -PAN_DEPTH + t / 2),
    box(t, PAN_HEIGHT, PAN_DEPTH, -w / 2 + t / 2, PAN_HEIGHT / 2, -PAN_DEPTH / 2),
    box(t, PAN_HEIGHT, PAN_DEPTH, w / 2 - t / 2, PAN_HEIGHT / 2, -PAN_DEPTH / 2),
    // The rolled lip round the top.
    box(w + 0.003, 0.0015, 0.003, 0, PAN_HEIGHT, -0.0015),
    box(w + 0.003, 0.0015, 0.003, 0, PAN_HEIGHT, -PAN_DEPTH + 0.0015),
    box(0.003, 0.0015, PAN_DEPTH, -w / 2 - 0.0015, PAN_HEIGHT, -PAN_DEPTH / 2),
    box(0.003, 0.0015, PAN_DEPTH, w / 2 + 0.0015, PAN_HEIGHT, -PAN_DEPTH / 2),
  ]);
}

/** The simmering broth in the pan, a little below the top layer of pouches. */
function broth(id: NetaId): BufferGeometry {
  const w = NETA[id].look.width - 0.006;
  return flat(new BoxGeometry(w, 0.0008, PAN_DEPTH - 0.004), '#5E3812').translate(0, 0.019, -PAN_DEPTH / 2);
}

/**
 * Salmon roe's bowl: a small, wide, shallow bowl of rustic white stoneware
 * (speckled glaze, bare rim and foot), centred at z = ROE_BOWL_Z. It has its
 * own material (containerMaterial).
 */
export const ROE_BOWL_Z = -0.045;
const ROE_BOWL_TOP = 0.0225;
/** The bowl's inside as (height, radius), bottom to rim. */
const ROE_BOWL_INSIDE: Array<[number, number]> = [[0.006, 0], [0.0068, 0.011], [0.013, 0.0195], [0.0212, 0.0258], [ROE_BOWL_TOP, 0.0272]];
function roeBowlInside(y: number): number {
  for (let i = 1; i < ROE_BOWL_INSIDE.length; i++) {
    const [y0, r0] = ROE_BOWL_INSIDE[i - 1];
    const [y1, r1] = ROE_BOWL_INSIDE[i];
    if (y <= y1) return r0 + ((r1 - r0) * Math.max(0, y - y0)) / (y1 - y0);
  }
  return ROE_BOWL_INSIDE[ROE_BOWL_INSIDE.length - 1][1];
}
function roeBowl(): BufferGeometry {
  // Up the outside from the foot, over the rim, down the inside, so every face looks outward.
  const profile = [
    [0.0, 0.0], [0.009, 0.0], [0.0095, 0.0028], [0.0125, 0.004], [0.02, 0.0095], [0.0262, 0.0175], [0.0278, 0.0215],
    [0.0272, ROE_BOWL_TOP], [0.0258, 0.0212], [0.0195, 0.013], [0.011, 0.0068], [0.0, 0.006],
  ].map(([r, y]) => new Vector2(r, y));
  const g = new LatheGeometry(profile, 32);
  g.computeVertexNormals();
  return patterned(g).translate(0, 0, ROE_BOWL_Z);
}

/**
 * The tool that goes with a topping: a small wooden spatula for uni, a
 * spoon for salmon roe. Bowl or blade at the origin, handle toward +Z.
 */
export function toolGeometry(id: NetaId): BufferGeometry | null {
  const wood = '#D8B98A';
  if (id === 'Uni') {
    const blade = new BoxGeometry(0.018, 0.0018, 0.034, 2, 1, 4);
    const pos = blade.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      // Narrower toward the handle.
      const t = pos.getZ(i) / 0.034 + 0.5;
      pos.setX(i, pos.getX(i) * (1 - 0.55 * t));
    }
    blade.computeVertexNormals();
    return weld([
      flat(blade, wood),
      [flat(new BoxGeometry(0.006, 0.0035, 0.06), '#C9A56B'), new Matrix4().makeTranslation(0, 0.001, 0.046)],
    ]);
  }
  if (id === 'Ikura') {
    const bowl = new SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.012, 0.0055, 0.0095);
    return weld([
      flat(bowl, wood),
      [flat(new BoxGeometry(0.005, 0.003, 0.05), '#C9A56B'), new Matrix4().makeTranslation(0, 0.002, 0.034)],
    ]);
  }
  return null;
}

function plumDish(id: NetaId): BufferGeometry {
  return flat(new CylinderGeometry(0.02, 0.017, 0.007, 18), NETA[id].look.color2).translate(0, 0.0035, -0.025);
}

// ---------------------------------------------------------------- arrangements

const q = new Quaternion();
const e = new Euler();
const one = new Vector3(1, 1, 1);

function place(x: number, y: number, z: number, rx = 0, ry = 0): Matrix4 {
  return new Matrix4().compose(new Vector3(x, y, z), q.setFromEuler(e.set(rx, ry, 0)), one);
}

/**
 * Pieces overlapping like tiles from the back of the case to the front:
 * the first is furthest back, the last nearest the chef (on top).
 */
function shingle(count: number, length: number, pitch: number, cols = 1, colPitch = 0): Matrix4[] {
  const rows = Math.ceil(count / cols);
  const out: Matrix4[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    out.push(place((col - (cols - 1) / 2) * colPitch, 0.003 + row * 0.0009, -length / 2 - (rows - 1 - row) * pitch, 0.07));
  }
  return out;
}

/** Sticks or bundles in three columns, two layers (top layer last). */
function stack(count: number, length: number, colPitch: number, layer: number): Matrix4[] {
  const out: Matrix4[] = [];
  for (let i = 0; i < count; i++) out.push(place((i % 3 - 1) * colPitch, Math.floor(i / 3) * layer, -length / 2 - 0.004));
  return out;
}

// ---------------------------------------------------------------- the look of one case item

export interface CaseLook {
  /** One block (sliced on the board) or one piece shown per instance. */
  geometry: BufferGeometry;
  /** Instance placements, back to front; null for a single block. */
  matrices: Matrix4[] | null;
  /** Instances per unit of stock (two uni lobes, ten roe beads a serving). */
  perUnit: number;
  /** Tray or dish under the pieces, if any. */
  container: BufferGeometry | null;
  /** The spatula or spoon resting in the tray, if any (taken out while in use). */
  tool: BufferGeometry | null;
  /** Liquid the pieces sit in (the inari pouches' simmering broth), if any. */
  liquid: BufferGeometry | null;
  /** Shader pattern and the sizes it is drawn to. */
  pattern: number;
  dims: Dims;
}

const looks = new Map<NetaId, CaseLook>();

function pieces(geometry: BufferGeometry, matrices: Matrix4[], pattern: number, dims: Dims, perUnit = 1, container: BufferGeometry | null = null): CaseLook {
  return { geometry, matrices, perUnit, container, pattern, dims, tool: null, liquid: null };
}

export function caseLook(id: NetaId): CaseLook {
  const cached = looks.get(id);
  if (cached) return cached;
  const def = NETA[id];
  const n = def.stock;
  const rnd = seeded(`${id}-arrange`);
  let look: CaseLook;
  switch (def.look.shape) {
    case 'saku': look = { ...sakuBody(id), matrices: null, perUnit: 1, container: null, tool: null, liquid: null }; break;
    case 'sheet': look = { ...sheetBody(id), matrices: null, perUnit: 1, container: null, tool: null, liquid: null }; break;
    case 'tentacle': look = { ...tentacleBody(), matrices: null, perUnit: 1, container: null, tool: null, liquid: null }; break;
    case 'shell': look = { ...shellBody(id), matrices: null, perUnit: 1, container: null, tool: null, liquid: null }; break;
    case 'block': look = { ...blockBody(id), matrices: null, perUnit: 1, container: null, tool: null, liquid: null }; break;
    case 'fillets':
      look = pieces(filletPiece(id), shingle(n, 0.072, 0.0085), def.look.pattern === 'spots' ? NetaPattern.Kohada : NetaPattern.Aji, [0.072, 0.006, 0.028]);
      break;
    case 'prawns': look = pieces(prawnPiece(id), shingle(n, 0.074, 0.011), NetaPattern.Prawn, [0.062, 0.005, 0.034]); break;
    case 'wholePrawns': look = pieces(wholePrawnPiece(), shingle(n, 0.07, 0.016), NetaPattern.Prawn, [0.07, 0.008, 0.034]); break;
    case 'shrimps': look = pieces(shrimpPiece(), shingle(n, 0.06, 0.012, 3, 0.0135), NetaPattern.SweetShrimp, [0.054, 0.006, 0.012]); break;
    case 'halves': look = pieces(scallopPiece(), shingle(n, 0.03, 0.0125), NetaPattern.Scallop, [0.03, 0.009, 0.034]); break;
    case 'tongues':
      look = pieces(tonguePiece(), shingle(n, 0.058, 0.0125), def.look.pattern === 'tip' ? NetaPattern.Cockle : NetaPattern.ArkShell, [0.058, 0.005, 0.03]);
      break;
    case 'eels': look = pieces(eelPiece(), shingle(n, 0.085, 0.0065), NetaPattern.SeaEel, [0.085, 0.008, 0.034]); break;
    case 'legs': look = pieces(gesoPiece(), shingle(n, 0.056, 0.011), NetaPattern.Squid, [0.056, 0.005, 0.03]); break;
    case 'pouches': {
      // Straight from the pack into a small stainless insert pan (nakago),
      // broth and all: the pouches in one loose pile, the top ones above the
      // broth; the top one is taken first.
      const m: Matrix4[] = [];
      for (let i = 0; i < n; i++) {
        m.push(place((rnd() - 0.5) * 0.0016, PAN_FLOOR + i * 0.0034, -PAN_DEPTH / 2 + (rnd() - 0.5) * 0.008, 0.06 * (rnd() - 0.5), (rnd() - 0.5) * 0.16));
      }
      look = pieces(pouchPiece(), m, NetaPattern.Pouch, [0.026, 0.019, 0.042], 1, insertPan(id));
      look.liquid = broth(id);
      break;
    }
    case 'urchin': {
      // Lobes laid the same way in two columns across the ori, each row
      // overlapping the one behind like scales; three lobes a gunkan.
      const m: Matrix4[] = [];
      const perUnit = 3;
      const count = n * perUnit;
      const rows = Math.ceil(count / 2);
      const pitch = 0.088 / rows;
      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        m.push(place((col - 0.5) * 0.026, 0.004 + row * 0.0004, -0.009 - (rows - 1 - row) * pitch, 0.18, 0.35 + (rnd() - 0.5) * 0.12));
      }
      look = pieces(uniLobe(), m, NetaPattern.Uni, UNI_LOBE, perUnit, trayGeometry(id, 0.1));
      look.tool = toolGeometry(id);
      break;
    }
    case 'roe': {
      // In the bowl almost to the rim, nearly level: bottom layer first, each
      // layer filled from the middle out, so servings come off the top.
      const m: Matrix4[] = [];
      const count = n * 10;
      const ring: Array<[number, number]> = [];
      for (let layer = 0, k = 0; k < count && layer < 8; layer++) {
        const y = 0.009 + layer * 0.005;
        const radius = y < ROE_BOWL_TOP ? roeBowlInside(y) - 0.0034 : roeBowlInside(ROE_BOWL_TOP) - 0.0034 - (y - ROE_BOWL_TOP) * 2.2;
        if (radius <= 0) break;
        const shift = (layer % 2) * 0.003;
        ring.length = 0;
        for (let x = -radius - 0.006; x <= radius + 0.006; x += 0.006) {
          for (let z = -radius - 0.006; z <= radius + 0.006; z += 0.006) {
            const bx = x + shift + (rnd() - 0.5) * 0.001;
            const bz = z + shift + (rnd() - 0.5) * 0.001;
            if (bx * bx + bz * bz <= radius * radius) ring.push([bx, bz]);
          }
        }
        ring.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
        for (const [bx, bz] of ring) {
          if (k >= count) break;
          m.push(place(bx, y, ROE_BOWL_Z + bz));
          k++;
        }
      }
      look = pieces(roeBead(), m, NetaPattern.Roe, [0.006, 0.006, 0.006], 10, roeBowl());
      look.tool = toolGeometry(id);
      break;
    }
    case 'sticks':
      look = pieces(stickPiece(), stack(n, 0.115, 0.0125, 0.0095), def.look.pattern === 'core' ? NetaPattern.Cucumber : NetaPattern.Stick, [0.115, 0.009, 0.011]);
      break;
    case 'ribbons': look = pieces(ribbonBundle(id), stack(n, 0.115, 0.0135, 0.0075), NetaPattern.Stick, [0.115, 0.006, 0.011]); break;
    case 'paste': {
      const m: Matrix4[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        m.push(place(Math.cos(a) * 0.0105, 0, -0.025 + Math.sin(a) * 0.0105));
      }
      look = pieces(pasteDab(id), m, NetaPattern.Stick, [0.012, 0.006, 0.012], 1, plumDish(id));
      break;
    }
    case 'leaves': {
      const m: Matrix4[] = [];
      for (let i = 0; i < n; i++) m.push(place(0, 0.0015 + i * 0.0014, -0.036, 0, (rnd() - 0.5) * 0.25));
      look = pieces(leafPiece(), m, NetaPattern.Leaf, [0.062, 0.003, 0.042]);
      break;
    }
  }
  looks.set(id, look);
  return look;
}

const materials = new Map<NetaId, NetaMaterial>();
let nori: NetaMaterial | null = null;
let stoneware: NetaMaterial | null = null;
let steel: Material | null = null;
let liquid: Material | null = null;

/** Nori (gunkan band and strip), seen from both sides. */
export function noriMaterial(): NetaMaterial {
  nori ??= makeNetaMaterial('Nori', NetaPattern.Nori, '#16241B', '#16241B', [0, 0, 0], 3.1, 0.45, true);
  return nori;
}

/** The material for an item's container when it is not the item's own (the roe's stoneware bowl). */
export function containerMaterial(id: NetaId): Material | null {
  if (id === 'InariAge') {
    steel ??= new MeshStandardMaterial({ color: '#C9CDD2', roughness: 0.28, metalness: 0.8 });
    return steel;
  }
  if (id !== 'Ikura') return null;
  stoneware ??= makeNetaMaterial('Stoneware', NetaPattern.Stoneware, '#ECE6DA', '#9E8C74', [0.0278, ROE_BOWL_TOP, 0], 7.3, 0.35);
  return stoneware;
}

/** Roll radius (a hosomaki, about 2.6 cm across) and the filling's radius in its cut face. */
export const MAKI_RADIUS = 0.013;
const MAKI_FILLING_RADIUS = 0.0045;
/** A 中太 (the tekka: the half sheet rolled 縦), about 4.7 cm across, its core the slice and the trimmings. */
export const MAKI_RADIUS_THICK = 0.0235;
const MAKI_FILLING_RADIUS_THICK = 0.011;
/** The colour each filling shows in a roll's cut face. */
const FACE_COLOR: Partial<Record<NetaId, string>> = {
  Kanpyo: '#8C5E2E',
  TunaStick: '#B3202C',
  Cucumber: '#7FA65A',
  Takuan: '#F2D23C',
  UmePaste: '#A3242E',
  Shiso: '#3E7A2E',
};
const rolls = new Map<string, NetaMaterial>();

/** The material of a roll with these fillings (nori outside, the fillings in the cut face); a 中太's face is bigger, with a bigger core. */
export function makiMaterial(fillings: readonly NetaId[], thick = false): NetaMaterial {
  const key = `${thick ? 'chu:' : ''}${fillings.join('+')}`;
  let m = rolls.get(key);
  if (!m) {
    const c2 = FACE_COLOR[fillings[0]] ?? '#888888';
    const c3 = fillings[1] ? (FACE_COLOR[fillings[1]] ?? c2) : undefined;
    const radii: [number, number, number] = thick ? [1, MAKI_RADIUS_THICK, MAKI_FILLING_RADIUS_THICK] : [1, MAKI_RADIUS, MAKI_FILLING_RADIUS];
    m = makeNetaMaterial(`Roll_${key}`, NetaPattern.MakiRoll, '#16241B', c2, radii, 4.2, 0.4, false, c3);
    rolls.set(key, m);
  }
  return m;
}

/** A roll segment: a unit length along X (scale x to the length), of this radius (a hosomaki's by default), capped. */
export function makiSegmentGeometry(radius = MAKI_RADIUS): BufferGeometry {
  return patterned(new CylinderGeometry(radius, radius, 1, 24, 1).rotateZ(Math.PI / 2));
}

/** A filling as it is laid on the rice, along X: sticks and ribbons end to end, a line of plum paste, two shiso leaves. */
export function fillingOnRice(id: NetaId): BufferGeometry {
  const look = caseLook(id);
  const g = look.geometry;
  const turn = new Matrix4().makeRotationY(Math.PI / 2);
  if (id === 'UmePaste') return g.clone().applyMatrix4(new Matrix4().makeScale(9, 0.7, 0.5)).translate(0, -0.0045, 0);
  const a = new Matrix4().multiplyMatrices(new Matrix4().makeTranslation(-0.048, 0, 0), turn);
  const b = new Matrix4().multiplyMatrices(new Matrix4().makeTranslation(0.048, 0, 0), turn);
  return weld([
    [g, a],
    [g, b],
  ]);
}

/** The glossy material of a liquid (the inari broth). */
export function liquidMaterial(): Material {
  liquid ??= new MeshStandardMaterial({ color: '#5E3812', roughness: 0.08, metalness: 0 });
  return liquid;
}

/** The one material of a neta (case item, slices and served pieces share it). */
export function lookMaterial(id: NetaId): NetaMaterial {
  let m = materials.get(id);
  if (!m) {
    const def = NETA[id];
    const look = caseLook(id);
    m = makeNetaMaterial(id, look.pattern, def.look.color, def.look.color2, look.dims, seeded(id)() * 20, def.look.gloss);
    materials.set(id, m);
  }
  return m;
}

/**
 * A neta's material for a bigger cut of it (a prep material): the case
 * item's pattern and colours, sized to that cut's own L x H x W.
 */
export function prepMaterial(id: NetaId, dims: Dims): NetaMaterial {
  const def = NETA[id];
  return makeNetaMaterial(`${id}-prep`, caseLook(id).pattern, def.look.color, def.look.color2, dims, seeded(id)() * 20, def.look.gloss);
}

/** True for the block shapes that are sliced on the board. */
export function isBlock(id: NetaId): boolean {
  return caseLook(id).matrices === null;
}

/** Full length (along X) of a block item: what a whole saku, leg, abalone or tamago measures. */
export function blockLength(id: NetaId): number {
  return caseLook(id).dims[0];
}

// ---------------------------------------------------------------- the topping of a nigiri

export interface SliceLook {
  geometry: BufferGeometry;
  material: NetaMaterial;
  /**
   * True for a slice cut from a fish saku: built in the saku's axes (length
   * along X, skin side +Z) so the pattern matches; the nigiri turns it a
   * quarter turn (and mirrors it for the skin side).
   */
  blockAxes: boolean;
}

const slices = new Map<NetaId, SliceLook>();

/** A nigiri slice of a saku (the user's shop's normal size for lean tuna): length and thickness (m). */
const SLICE_LENGTH = 0.075;
const SLICE_THICK = 0.006;

/**
 * A slice of a saku for a nigiri: a soft-edged slab along X (head end -X),
 * its bottom on y = 0, easing a little thinner toward the tail, its ends
 * rounded off like a cut slice. Many stations along it, so it bends
 * smoothly over the shari (src/scene-assets/lib/nigiri-form.ts).
 */
function sliceSlab(L: number, th: number, W: number): BufferGeometry {
  const r = 0.003;
  const n = 24;
  const sections: TubeSection[] = [];
  const alongs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const z = -L / 2 + (L * i) / n;
    const thick = th * (1 - 0.22 * (i / n));
    const fromEnd = L / 2 - Math.abs(z);
    const end = fromEnd >= r ? 1 : Math.max(0.6, Math.sqrt(1 - ((r - fromEnd) / r) ** 2));
    sections.push({ z, halfW: (W / 2) * (0.9 + 0.1 * end), hUp: (thick / 2) * end, hDown: (thick / 2) * end, cy: thick / 2, power: 3.2 });
    alongs.push(z);
  }
  return LoftSurface.tube(sections).build(alongs, 20, true).rotateY(Math.PI / 2);
}

/** What a nigiri's topping looks like for this neta (case pieces are their own topping). */
export function sliceLook(id: NetaId): SliceLook {
  const cached = slices.get(id);
  if (cached) return cached;
  const def = NETA[id];
  const look = caseLook(id);
  const W = def.look.width - 0.006;
  const phase = seeded(id)() * 20;
  let slice: SliceLook;
  switch (def.look.shape) {
    case 'saku':
    case 'sheet': {
      // About 3 cm wide, 5-7 mm thick; bottom on y = 0, the top shows the full colour.
      const th = def.look.shape === 'sheet' ? 0.005 : SLICE_THICK;
      const w = Math.min(0.031, Math.max(0.026, def.look.width - 0.009));
      slice = {
        geometry: patterned(sliceSlab(SLICE_LENGTH, th, w)),
        material: makeNetaMaterial(`${id}_slice`, look.pattern, def.look.color, def.look.color2, [SLICE_LENGTH, th, w], phase, def.look.gloss),
        blockAxes: true,
      };
      break;
    }
    case 'tentacle':
    case 'shell': {
      // Octopus: cream flesh with a maroon rim; abalone: amber with a dark rim.
      const octopus = def.look.shape === 'tentacle';
      slice = {
        geometry: patterned(shape(new BoxGeometry(0.032, 0.006, 0.07, 3, 1, 10), 0.07, 0.35, 0.002)),
        material: makeNetaMaterial(
          `${id}_slice`,
          NetaPattern.ArkShell,
          octopus ? def.look.color2 : def.look.color,
          octopus ? def.look.color : def.look.color2,
          [0.07, 0.006, 0.032],
          phase,
          def.look.gloss,
        ),
        blockAxes: false,
      };
      break;
    }
    case 'block':
      slice = {
        geometry: patterned(roundedBlock(0.07, 0.016, 0.03, 0.002).translate(-0.035, -0.008, 0).rotateY(Math.PI / 2)),
        material: lookMaterial(id),
        blockAxes: false,
      };
      break;
    case 'shrimps': {
      const one = look.geometry;
      slice = {
        geometry: weld([
          [one, new Matrix4().makeTranslation(-0.0075, 0, 0)],
          [one, new Matrix4().makeTranslation(0.0075, 0, 0)],
        ]),
        material: lookMaterial(id),
        blockAxes: false,
      };
      break;
    }
    default:
      slice = { geometry: look.geometry, material: lookMaterial(id), blockAxes: false };
  }
  slices.set(id, slice);
  return slice;
}
