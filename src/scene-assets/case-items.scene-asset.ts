import { Color, Group, InstancedMesh, Mesh, type Object3D } from '@iwsdk/core';
import { CASE_ORDER, caseAssetId, type NetaId } from '../menu.js';
import { caseLook, containerMaterial, lookMaterial, ROE_BOWL_Z } from './lib/neta-look.js';
import { seeded } from './lib/neta-paint.js';

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
 * per unit of stock). The uni tray holds a small wooden spatula and the roe
 * tray a spoon (`Tool`), taken out while the rice hand uses it.
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
    if (id === 'Uni') {
      // Each lobe its own shade, from pale yellow to deep orange, as uni comes.
      const rnd = seeded('uni-shades');
      const tint = new Color();
      for (let i = 0; i < look.matrices.length; i++) {
        const k = rnd();
        inst.setColorAt(i, tint.setRGB(1, 1.02 - 0.24 * k, 1.05 - 0.5 * k));
      }
      inst.instanceColor!.needsUpdate = true;
    }
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
    const container = new Mesh(look.container, containerMaterial(id) ?? material);
    container.name = 'Container';
    root.add(container);
  }
  if (look.tool) {
    // The spatula lies on the uni, its handle ending at the ori's front rim;
    // the spoon stands in the roe, its handle over the bowl's rim toward the
    // chef. Both stay clear of the doors.
    const tool = new Mesh(look.tool, material);
    tool.name = 'Tool';
    if (id === 'Ikura') {
      tool.position.set(0.004, 0.026, ROE_BOWL_Z - 0.006);
      tool.rotation.set(-0.22, -0.1, 0);
    } else {
      tool.position.set(0.01, 0.014, -0.078);
      tool.rotation.y = -0.08;
    }
    root.add(tool);
  }
  return root;
}

/** Manifest entries for every case item: { 'case-lean-tuna': Object3D, ... }. */
export function caseItemAssets(): Record<string, Object3D> {
  const out: Record<string, Object3D> = {};
  for (const id of CASE_ORDER) out[caseAssetId(id)] = createCaseItem(id);
  return out;
}
