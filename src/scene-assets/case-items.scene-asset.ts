import { Group, InstancedMesh, Mesh, type Object3D } from '@iwsdk/core';
import { CASE_ORDER, caseAssetId, type NetaId } from '../menu.js';
import { caseLook, lookMaterial } from './lib/neta-look.js';

/**
 * One item in the neta case, built from its entry in src/menu.ts.
 *
 * Origin: on the case floor. Block items (saku, squid sheet, octopus leg,
 * abalone, tamago) lie along +X from their uncut end at the origin; the
 * scene turns them so that end faces the chef. Piece items (fillets,
 * shrimp, shellfish, eel, pouches, fillings) and the uni and roe trays run
 * from the origin away from the chef (-Z), the last piece nearest the chef.
 *
 * The `Body` child is what NetaCaseSystem shortens (blocks) or counts down
 * (an InstancedMesh, one instance per piece; `userData.perUnit` instances
 * per unit of stock).
 */
export function createCaseItem(id: NetaId): Group {
  const look = caseLook(id);
  const material = lookMaterial(id);
  const root = new Group();
  root.name = `Case_${id}`;
  let body: Mesh;
  if (look.matrices) {
    const inst = new InstancedMesh(look.geometry, material, look.matrices.length);
    look.matrices.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingBox();
    inst.computeBoundingSphere();
    inst.userData.perUnit = look.perUnit;
    body = inst;
  } else {
    body = new Mesh(look.geometry, material);
  }
  body.name = 'Body';
  root.add(body);
  if (look.container) {
    const container = new Mesh(look.container, material);
    container.name = 'Container';
    root.add(container);
  }
  return root;
}

/** Manifest entries for every case item: { 'case-lean-tuna': Object3D, ... }. */
export function caseItemAssets(): Record<string, Object3D> {
  const out: Record<string, Object3D> = {};
  for (const id of CASE_ORDER) out[caseAssetId(id)] = createCaseItem(id);
  return out;
}
