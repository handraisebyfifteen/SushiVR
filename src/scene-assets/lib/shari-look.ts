import {
  type BufferGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from '@iwsdk/core';
import { mergeGeometries } from './batch.js';
import { makeNetaMaterial, NetaPattern } from './neta-material.js';
import { patterned } from './neta-paint.js';

/**
 * Shari-kiri (シャリ切り) on the back work table, the shop's way: the rice
 * from the gas rice cooker turned out into the hangiri, the awasezu (rice
 * vinegar, made ahead) poured over, cut through with the shamoji, then
 * scooped into the ohitsu brought beside it. No fanning.
 *
 * Runtime meshes (src/shari-system.ts); the `back-row-preview` asset lays
 * them out for inspection. Origins at the bottom (table contact) unless
 * said otherwise.
 */

/** Hangiri (飯台): a shallow cypress tub with two copper hoops, about 1 shaku 1 sun across. */
export const HANGIRI_RADIUS = 0.17;
export const HANGIRI_HEIGHT = 0.065;
/** The rice in it: turned out as the pot's cake, then cut and spread. */
export const RICE_MOUND_HEIGHT = 0.075;
export const RICE_SPREAD_HEIGHT = 0.032;

const cypress = new MeshStandardMaterial({ color: '#D8B27A', roughness: 0.62 });
const cypressInside = new MeshStandardMaterial({ color: '#E2C08C', roughness: 0.7 });
const copper = new MeshStandardMaterial({ color: '#B8703A', roughness: 0.38, metalness: 0.65 });
const paddleWood = new MeshStandardMaterial({ color: '#E2C79A', roughness: 0.6 });
const enamel = new MeshStandardMaterial({ color: '#F2F0EA', roughness: 0.25 });
const enamelRim = new MeshStandardMaterial({ color: '#2F4E73', roughness: 0.3 });
const vinegar = new MeshStandardMaterial({ color: '#E8D9A8', roughness: 0.05, transparent: true, opacity: 0.75 });

let riceMaterial: Material | null = null;
/** Cooked rice in bulk: the shari's grain pattern, sized for a tub of it (the plain variant: these shapes do not deform). */
export function bulkRiceMaterial(): Material {
  riceMaterial ??= makeNetaMaterial('shari-bulk', NetaPattern.Shari, '#F4F0E7', '#DCD2BF', [0.3, 0.08, 0.3], 0.7, 0.35);
  return riceMaterial;
}

const at = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);

/** The hangiri: `Tub` (wall, floor), `Hoops`, and `Rice` (shaped by riceGeometry). */
export function createHangiri(): Group {
  const root = new Group();
  root.name = 'Hangiri';
  const R = HANGIRI_RADIUS;
  const H = HANGIRI_HEIGHT;
  // Out along the floor, up the outside, over the rim, down the inside (LatheGeometry's normals face outward this way).
  const wall = [
    [0.001, 0], [R - 0.01, 0], [R, 0.004], [R + 0.002, H * 0.5], [R, H], [R - 0.012, H], [R - 0.012, 0.012],
  ].map(([r, y]) => new Vector2(r, y));
  const tub = new Mesh(new LatheGeometry(wall, 40), cypress);
  tub.name = 'Tub';
  const floor = new Mesh(new CylinderGeometry(R - 0.012, R - 0.012, 0.004, 40), cypressInside);
  floor.position.y = 0.012;
  floor.name = 'Floor';
  const hoop = new TorusGeometry(R + 0.004, 0.0035, 6, 48);
  const flat = new Matrix4().makeRotationX(Math.PI / 2);
  const hoops = new Mesh(
    mergeGeometries([
      [hoop, at(0, H * 0.28, 0).multiply(flat)],
      [hoop, at(0, H * 0.72, 0).multiply(flat)],
    ]),
    copper,
  );
  hoops.name = 'Hoops';
  const rice = new Mesh(riceGeometry('mound', 1), bulkRiceMaterial());
  rice.name = 'Rice';
  rice.position.y = 0.014;
  rice.visible = false;
  root.add(tub, floor, hoops, rice);
  return root;
}

/**
 * The rice in the hangiri. 'mound': just turned out of the cooker's pot, a
 * cake with rounded shoulders. 'spread': cut through and laid out over the
 * floor. `fill` (0..1) is what is left of it as it is scooped out.
 */
export function riceGeometry(state: 'mound' | 'spread', fill: number): BufferGeometry {
  const f = Math.max(0.05, Math.min(1, fill));
  const pts: Array<[number, number]> =
    state === 'mound'
      ? [[0.001, RICE_MOUND_HEIGHT], [0.06, RICE_MOUND_HEIGHT - 0.004], [0.095, RICE_MOUND_HEIGHT - 0.016], [0.112, RICE_MOUND_HEIGHT * 0.55], [0.118, 0.012], [0.124, 0]]
      : [[0.001, RICE_SPREAD_HEIGHT * f], [0.07, RICE_SPREAD_HEIGHT * f * 0.96], [0.12, RICE_SPREAD_HEIGHT * f * 0.85], [0.145, RICE_SPREAD_HEIGHT * f * 0.55 + 0.004], [HANGIRI_RADIUS - 0.014, 0]];
  // From the rim up to the top (outward-facing normals); patterned: the shari material draws its grains per pixel from it.
  return patterned(new LatheGeometry(pts.reverse().map(([r, y]) => new Vector2(r, y)), 36));
}

/** Shamoji: a wooden rice paddle. Origin at the grip on the handle; the blade points along -Z, flat side up. */
export function createShamoji(): Group {
  const root = new Group();
  root.name = 'Shamoji';
  const blade = new Mesh(new CylinderGeometry(0.042, 0.042, 0.007, 20), paddleWood);
  blade.scale.set(1, 1, 1.25);
  blade.position.set(0, 0, -0.14);
  blade.name = 'Blade';
  const handle = new Mesh(
    mergeGeometries([
      [new CylinderGeometry(0.011, 0.013, 0.12, 10).rotateX(Math.PI / 2), at(0, 0, -0.03)],
      [new CylinderGeometry(0.018, 0.012, 0.03, 10).rotateX(Math.PI / 2), at(0, 0, -0.095)],
    ]),
    paddleWood,
  );
  handle.scale.set(1.25, 0.55, 1);
  handle.name = 'Handle';
  const lump = new Mesh(riceLumpGeometry(), bulkRiceMaterial());
  lump.position.set(0, 0.012, -0.145);
  lump.name = 'Lump';
  lump.visible = false;
  root.add(blade, handle, lump);
  return root;
}

/** A scoop of shari on the paddle. */
export function riceLumpGeometry(): BufferGeometry {
  const g = new SphereGeometry(0.03, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.55, 1.1);
  return patterned(g);
}

/** The awasezu in a katakuchi (a lipped bowl): `Bowl`, `Vinegar`, and `Stream` (shown while it pours from the lip at -Z). */
export function createPitcher(): Group {
  const root = new Group();
  root.name = 'Awasezu';
  const profile = [[0.001, 0], [0.045, 0], [0.058, 0.02], [0.064, 0.06], [0.066, 0.075], [0.06, 0.075], [0.058, 0.06], [0.052, 0.022], [0.04, 0.006], [0.001, 0.006]].map(
    ([r, y]) => new Vector2(r, y),
  );
  const bowl = new Mesh(new LatheGeometry(profile, 28), enamel);
  bowl.name = 'Bowl';
  const rim = new Mesh(new TorusGeometry(0.063, 0.003, 6, 32).rotateX(Math.PI / 2), enamelRim);
  rim.position.y = 0.075;
  rim.name = 'Rim';
  const lip = new Mesh(new CylinderGeometry(0.016, 0.022, 0.03, 10, 1, true, Math.PI * 0.5, Math.PI).rotateX(-1.2), enamel);
  lip.position.set(0, 0.068, -0.068);
  lip.name = 'Lip';
  const surface = new Mesh(new CylinderGeometry(0.058, 0.058, 0.002, 28), vinegar);
  surface.position.y = 0.055;
  surface.name = 'Vinegar';
  const stream = new Mesh(new CylinderGeometry(0.004, 0.006, 1, 8), vinegar);
  stream.geometry.translate(0, -0.5, 0);
  stream.name = 'Stream';
  stream.visible = false;
  root.add(bowl, rim, lip, surface, stream);
  return root;
}
