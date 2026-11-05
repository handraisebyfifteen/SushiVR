import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Euler,
  InstancedMesh,
  type Material,
  Matrix4,
  Quaternion,
  Vector3,
} from '@iwsdk/core';

/**
 * Draw-call helpers for procedural architecture. A box part is a size, a
 * centre and an optional rotation (radians, XYZ order).
 *
 * - `boxBatch` draws many boxes of one material as instances of a single unit
 *   cube: one draw call however many boxes there are.
 * - `mergeBoxes` welds boxes into one geometry, so a compound shape (a lantern
 *   frame) can itself be instanced with `InstancedMesh`.
 */
export interface BoxPart {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

const unitBox = new BoxGeometry(1, 1, 1);
const tmpPos = new Vector3();
const tmpScale = new Vector3();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();

export function partMatrix(p: BoxPart, out = new Matrix4()): Matrix4 {
  tmpPos.set(p.x, p.y, p.z);
  tmpScale.set(p.w, p.h, p.d);
  tmpQuat.setFromEuler(tmpEuler.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0));
  return out.compose(tmpPos, tmpQuat, tmpScale);
}

/** Instanced unit cubes; non-uniform scale keeps box normals correct. */
export function boxBatch(name: string, material: Material, parts: BoxPart[]): InstancedMesh {
  return instances(name, unitBox, material, parts.map((p) => partMatrix(p)));
}

/** One shared geometry placed by a list of matrices, as a single InstancedMesh. */
export function instances(
  name: string,
  geometry: BufferGeometry,
  material: Material,
  matrices: Matrix4[],
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}

/** Boxes welded into one indexed geometry. */
export function mergeBoxes(parts: BoxPart[]): BufferGeometry {
  return mergeGeometries(parts.map((p): [BufferGeometry, Matrix4] => [unitBox, partMatrix(p)]));
}

/** Any geometries (position, normal, uv; indexed or not), each placed by a matrix, welded into one. */
export function mergeGeometries(parts: Array<[BufferGeometry, Matrix4]>): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (const [source, matrix] of parts) {
    const g = source.clone().applyMatrix4(matrix);
    const base = pos.length / 3;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const t = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
    }
    const idx = g.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) index.push(base + idx.getX(i));
    else for (let i = 0; i < p.count; i++) index.push(base + i);
    g.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  out.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  out.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  out.setIndex(index);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}
