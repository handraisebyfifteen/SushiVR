import { type BufferGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { NetaId } from '../../menu.js';
import type { PrepId } from '../../prep.js';
import { type Dims, prepMaterial, roundedBlock } from './neta-look.js';
import { flat, patterned, taperedTube, weld } from './neta-paint.js';

/**
 * The saku-taking materials as they come out of the ice box, and the cuts
 * they take. Each is a group lying with its length along Z (toward the
 * chef), centred on its origin, bottom at y = 0; its parts are named
 * meshes. A cut is a guide line along Z at local x, drawn toward the chef.
 * Runtime meshes (src/prep-cut-system.ts), built from the same per-pixel
 * neta materials as the case.
 */

export type PrepStep =
  /** A cut along Z at local x (over z0 +- len / 2). It may push a part aside, free a scrap, or swap a part for another. */
  | { kind: 'cut'; x: number; z0: number; len: number; shift?: [string, number]; scrap?: string; swap?: [string, string] }
  /** Both hands pinch (the neta hand the first part, the rice hand the second) and pull them apart: the second is a scrap. */
  | { kind: 'pull'; netaPart: string; ricePart: string; netaAt: Vector3; riceAt: Vector3 };

export interface PrepMaterialLook {
  root: Group;
  /** Length along Z, half its width across, and its highest top. */
  length: number;
  halfWidth: number;
  top: number;
  steps: PrepStep[];
  /** The parts that are saku once cut, and the case item each fills. */
  products: Array<{ part: string; neta: NetaId }>;
}

/** A block of one neta lying along Z, centred at (cx, cz), from y = 0. */
function block(name: string, neta: NetaId, L: number, H: number, W: number, cx: number, cz = 0): Mesh {
  const dims: Dims = [L, H, W];
  const mesh = new Mesh(patterned(roundedBlock(L, H, W, 0.004)), prepMaterial(neta, dims));
  // The pattern runs along the geometry's X: turn the mesh so X lies along -Z.
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(cx, 0, cz + L / 2);
  mesh.name = name;
  return mesh;
}

/** A belly cut of tuna: fatty (the belly side), medium fatty and lean, side by side. */
function tunaBelly(): PrepMaterialLook {
  const L = 0.2;
  const W = 0.044;
  const root = new Group();
  root.name = 'TunaBelly';
  root.add(
    block('FattyTuna', 'FattyTuna', L, 0.034, W, -W),
    block('MediumFattyTuna', 'MediumFattyTuna', L, 0.041, W, 0),
    block('LeanTuna', 'LeanTuna', L, 0.047, W, W),
  );
  return {
    root,
    length: L,
    halfWidth: 1.5 * W,
    top: 0.047,
    steps: [
      { kind: 'cut', x: -W / 2, z0: 0, len: L, shift: ['FattyTuna', -0.012] },
      { kind: 'cut', x: W / 2, z0: 0, len: L, shift: ['LeanTuna', 0.012] },
    ],
    products: [
      { part: 'FattyTuna', neta: 'FattyTuna' },
      { part: 'MediumFattyTuna', neta: 'MediumFattyTuna' },
      { part: 'LeanTuna', neta: 'LeanTuna' },
    ],
  };
}

const bloodLine = new MeshStandardMaterial({ color: '#4A1015', roughness: 0.45 });

/** A bonito quarter loin (節): silver skin on the outer side, the dark blood line along the inner edge. */
function bonitoLoin(): PrepMaterialLook {
  const L = 0.22;
  const root = new Group();
  root.name = 'BonitoLoin';
  const loin = block('Bonito', 'Bonito', L, 0.04, 0.05, 0.008);
  const chiai = new Mesh(roundedBlock(L - 0.01, 0.032, 0.013, 0.004), bloodLine);
  chiai.rotation.y = Math.PI / 2;
  chiai.position.set(-0.0245, 0, (L - 0.01) / 2);
  chiai.name = 'BloodLine';
  root.add(loin, chiai);
  return {
    root,
    length: L,
    halfWidth: 0.033,
    top: 0.04,
    steps: [{ kind: 'cut', x: -0.0175, z0: 0, len: L, scrap: 'BloodLine' }],
    products: [{ part: 'Bonito', neta: 'Bonito' }],
  };
}

const squidSkin = new MeshStandardMaterial({ color: '#FFFFFF', vertexColors: true, roughness: 0.32 });

/** A whole squid: the body (mantle) with its fins toward the far end, the head and legs at the near end. */
function squid(): PrepMaterialLook {
  const root = new Group();
  root.name = 'Squid';
  const bodyFar = -0.13;
  const bodyNear = 0.04;
  // Body: a flattened tube, open at the near end, tapering to a point.
  const path: Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    path.push(new Vector3(0, 0.017, bodyNear + (bodyFar - bodyNear) * t));
    radii.push(0.026 * Math.sqrt(Math.max(0.02, 1 - t ** 2.2)));
  }
  const mantle = flat(taperedTube(path, radii, 14, 0.62), '#EFE5DA');
  const fin = flat(roundedBlock(0.055, 0.003, 0.03, 0.001), '#E6D8CB');
  const body = new Mesh(
    weld([
      mantle,
      [fin, new Matrix4().makeRotationY(-Math.PI / 2 + 0.35).setPosition(0.012, 0.016, -0.07)],
      [fin, new Matrix4().makeRotationY(-Math.PI / 2 - 0.35).setPosition(-0.012, 0.016, -0.07)],
    ]),
    squidSkin,
  );
  body.name = 'Body';
  // Head and legs: a small head, eight arms and two long tentacles fanning toward the chef.
  const parts: Array<BufferGeometry | [BufferGeometry, Matrix4]> = [];
  const head = flat(new SphereGeometry(1, 12, 8), '#E2CFC2');
  parts.push([head, new Matrix4().makeScale(0.017, 0.012, 0.016).setPosition(0, 0.013, bodyNear + 0.012)]);
  for (let i = 0; i < 10; i++) {
    const long = i >= 8;
    const spread = ((long ? (i - 8.5) * 2 : i - 3.5) / 3.5) * 0.5;
    const len = long ? 0.095 : 0.06;
    const arm: Vector3[] = [];
    const ar: number[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      arm.push(new Vector3(Math.sin(spread) * len * t, 0.006 + 0.004 * (1 - t), bodyNear + 0.024 + Math.cos(spread) * len * t));
      ar.push(0.0045 * (1 - 0.7 * t));
    }
    parts.push(flat(taperedTube(arm, ar, 6, 0.8), long ? '#D9C0B0' : '#DDC6B7'));
  }
  const legs = new Mesh(weld(parts), squidSkin);
  legs.name = 'Legs';
  // Cut open, the body lies flat as one sheet: the saku.
  const sheetL = bodyNear - bodyFar - 0.01;
  const sheet = block('Sheet', 'Squid', sheetL, 0.01, 0.075, 0, (bodyNear + bodyFar) / 2);
  sheet.visible = false;
  root.add(body, legs, sheet);
  return {
    root,
    length: 0.26,
    halfWidth: 0.04,
    top: 0.03,
    steps: [
      { kind: 'pull', netaPart: 'Body', ricePart: 'Legs', netaAt: new Vector3(0, 0.03, -0.05), riceAt: new Vector3(0, 0.015, bodyNear + 0.03) },
      { kind: 'cut', x: 0, z0: (bodyNear + bodyFar) / 2, len: bodyNear - bodyFar, swap: ['Body', 'Sheet'] },
    ],
    products: [{ part: 'Sheet', neta: 'Squid' }],
  };
}

/** The look and cuts of a saku-taking material, built fresh (one per day). */
export function prepMaterialLook(id: PrepId): PrepMaterialLook | null {
  switch (id) {
    case 'TunaBelly':
      return tunaBelly();
    case 'BonitoLoin':
      return bonitoLoin();
    case 'Squid':
      return squid();
    default:
      return null;
  }
}
