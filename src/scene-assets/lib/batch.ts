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
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const m = new Matrix4();
  for (const p of parts) {
    const g = new BoxGeometry(1, 1, 1).applyMatrix4(partMatrix(p, m));
    const base = pos.length / 3;
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
    uv.push(...(g.getAttribute('uv').array as Float32Array));
    for (const i of g.getIndex()!.array) index.push(base + i);
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
