import { BufferAttribute, BufferGeometry, Color, Matrix4, Vector3 } from '@iwsdk/core';

/**
 * Small geometry kit for the neta: vertex-colour painting (patterns without
 * textures), welding painted parts into one geometry, a tapered tube for
 * curved pieces, and a seeded random so every build is identical in the app
 * and the editor. Nothing here touches the DOM or keeps state.
 *
 * The `aFlat` attribute tells the neta material (neta-material.ts) which
 * vertices keep their own colour (1) and which get the per-pixel pattern (0).
 */

const tmpP = new Vector3();
const tmpN = new Vector3();
const tmpC = new Color();

/** Deterministic random in [0, 1) from a string seed (mulberry32 on a string hash). */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setFlat(geometry: BufferGeometry, value: number): void {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('aFlat', new BufferAttribute(new Float32Array(count).fill(value), 1));
}

/** A part that takes the neta's per-pixel pattern. */
export function patterned(geometry: BufferGeometry): BufferGeometry {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  setFlat(geometry, 0);
  return geometry;
}

/** A plain-coloured part: fn(position, normal, out) is called once per vertex. */
export function paint(
  geometry: BufferGeometry,
  fn: (p: Vector3, n: Vector3, out: Color) => void,
): BufferGeometry {
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    tmpP.fromBufferAttribute(pos, i);
    tmpN.fromBufferAttribute(nor, i);
    tmpC.setRGB(1, 1, 1);
    fn(tmpP, tmpN, tmpC);
    colors[i * 3] = tmpC.r;
    colors[i * 3 + 1] = tmpC.g;
    colors[i * 3 + 2] = tmpC.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  setFlat(geometry, 1);
  return geometry;
}

/** One flat colour for a whole part. */
export function flat(geometry: BufferGeometry, color: Color | string): BufferGeometry {
  const c = typeof color === 'string' ? new Color(color) : color;
  return paint(geometry, (_p, _n, out) => out.copy(c));
}

/** Welds painted parts (position, normal, color; indexed or not), each optionally placed by a matrix. */
export function weld(parts: Array<BufferGeometry | [BufferGeometry, Matrix4]>): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const flags: number[] = [];
  const index: number[] = [];
  for (const part of parts) {
    const g = Array.isArray(part) ? part[0].clone().applyMatrix4(part[1]) : part;
    const base = pos.length / 3;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const c = g.getAttribute('color');
    const f = g.getAttribute('aFlat');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      if (c) col.push(c.getX(i), c.getY(i), c.getZ(i));
      else col.push(1, 1, 1);
      flags.push(f ? f.getX(i) : 0);
    }
    const idx = g.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) index.push(base + idx.getX(i));
    else for (let i = 0; i < p.count; i++) index.push(base + i);
    if (Array.isArray(part)) g.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  out.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  out.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  out.setAttribute('aFlat', new BufferAttribute(new Float32Array(flags), 1));
  out.setIndex(index);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/**
 * A tube along a path of points with a radius per point (tapering), ends
 * capped. `flatten` squashes the cross-section vertically (1 = round).
 */
export function taperedTube(
  path: Vector3[],
  radii: number[],
  radial = 10,
  flatten = 1,
): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const index: number[] = [];
  const up = new Vector3(0, 1, 0);
  const t = new Vector3();
  const side = new Vector3();
  const lift = new Vector3();
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    t.subVectors(b, a).normalize();
    side.crossVectors(t, up).normalize();
    lift.crossVectors(side, t).normalize();
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);
      const nx = side.x * cx + lift.x * cy;
      const ny = side.y * cx + lift.y * cy;
      const nz = side.z * cx + lift.z * cy;
      const r = radii[i];
      pos.push(path[i].x + side.x * cx * r + lift.x * cy * r * flatten,
        path[i].y + side.y * cx * r + lift.y * cy * r * flatten,
        path[i].z + side.z * cx * r + lift.z * cy * r * flatten);
      nor.push(nx, ny, nz);
    }
  }
  const ring = radial + 1;
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      const b = a + ring;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // End caps: a centre vertex fanned to each end ring.
  for (const end of [0, path.length - 1]) {
    const centre = pos.length / 3;
    const p = path[end];
    const dir = end === 0 ? -1 : 1;
    const q = path[end === 0 ? 1 : end - 1];
    t.subVectors(p, q).normalize().multiplyScalar(end === 0 ? 1 : 1);
    pos.push(p.x, p.y, p.z);
    nor.push(t.x, t.y, t.z);
    const start = pos.length / 3;
    for (let j = 0; j <= radial; j++) {
      const k = end * ring + j;
      pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
      nor.push(t.x, t.y, t.z);
    }
    for (let j = 0; j < radial; j++) {
      if (dir > 0) index.push(centre, start + j, start + j + 1);
      else index.push(centre, start + j + 1, start + j);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setIndex(index);
  return g;
}

/** Mixes `b` into `out` by t (0..1), in place. */
export function mix(out: Color, b: Color, t: number): Color {
  return out.lerp(b, Math.max(0, Math.min(1, t)));
}
