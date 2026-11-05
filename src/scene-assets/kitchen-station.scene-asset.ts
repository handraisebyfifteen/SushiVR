import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  type InstancedMesh,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Vector2,
} from '@iwsdk/core';
import {
  BACK_ROW_DEPTH,
  RANGE_HEIGHT,
  RANGE_WIDTH,
  SINK_TOP,
  WORKTABLE_WIDTH,
} from '../layout.js';
import { type BoxPart, boxBatch, instances, mergeGeometries } from './lib/batch.js';

/**
 * Beside the sink (seen facing it, on its right): a stainless work table and
 * a gas stove, as in a Showa-era sushi bar's back row.
 *
 * - work-table: a stainless table with a backsplash and an undershelf
 *   carrying a wooden sushi tub (hangiri). Two draw calls.
 * - gas-stove: a floor-standing commercial gas range in stainless steel:
 *   four burners under cast-iron grates, a back guard, a dark control panel
 *   with five knobs over a rail, an oven in the middle with a bar handle and
 *   a cupboard door on each side, on short feet; white tiles on the wall
 *   behind, an aluminium pot and a kettle on the front burners. No brand or
 *   lettering. Five draw calls.
 *
 * Both are decoration only (no stations). Origins at floor contact, centre
 * of the footprint; the front faces -Z (toward the aisle) and the back sits
 * against the back wall. Sizes come from src/layout.ts.
 */

/** White base colours: each instance supplies its own colour. */
const metal = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.32, metalness: 0.6 });
const enamel = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.4 });
const iron = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.7, metalness: 0.3 });
const tubWood = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.65 });
const aluminium = new MeshStandardMaterial({ color: '#C9CDD1', roughness: 0.35, metalness: 0.75 });

const STEEL = '#C9CDD2';
const STEEL_DARK = '#8E949A';
const unitCylinder = new CylinderGeometry(1, 1, 1, 24, 1);

type Tinted<T> = Array<[T, string]>;

function tintedBoxes(name: string, material: MeshStandardMaterial, parts: Tinted<BoxPart>): InstancedMesh {
  const mesh = boxBatch(name, material, parts.map(([p]) => p));
  const c = new Color();
  parts.forEach(([, hex], i) => mesh.setColorAt(i, c.set(hex)));
  mesh.instanceColor!.needsUpdate = true;
  return mesh;
}

/** Instanced unit cylinders: radius r, height h, centre (x, y, z), optional X tilt. */
function tintedCylinders(
  name: string,
  material: MeshStandardMaterial,
  parts: Tinted<{ r: number; h: number; x: number; y: number; z: number; rx?: number }>,
): InstancedMesh {
  const mats = parts.map(([p]) =>
    new Matrix4()
      .makeRotationX(p.rx ?? 0)
      .premultiply(new Matrix4().makeTranslation(p.x, p.y, p.z))
      .multiply(new Matrix4().makeScale(p.r, p.h, p.r)),
  );
  const mesh = instances(name, unitCylinder, material, mats);
  const c = new Color();
  parts.forEach(([, hex], i) => mesh.setColorAt(i, c.set(hex)));
  mesh.instanceColor!.needsUpdate = true;
  return mesh;
}

export function createWorkTable(): Group {
  const root = new Group();
  root.name = 'WorkTable';
  const W = WORKTABLE_WIDTH;
  const D = BACK_ROW_DEPTH;
  const T = SINK_TOP;
  const steel: Tinted<BoxPart> = [
    [{ w: W, h: 0.03, d: D, x: 0, y: T - 0.015, z: 0 }, STEEL],
    [{ w: W, h: 0.045, d: 0.02, x: 0, y: T - 0.02, z: -D / 2 - 0.008 }, STEEL],
    [{ w: W, h: 0.12, d: 0.03, x: 0, y: T + 0.06, z: D / 2 - 0.015 }, STEEL],
    [{ w: W - 0.06, h: 0.05, d: 0.02, x: 0, y: T - 0.055, z: -D / 2 + 0.03 }, STEEL_DARK],
    [{ w: W - 0.06, h: 0.02, d: D - 0.08, x: 0, y: 0.18, z: 0 }, STEEL],
    // Two stacked stainless trays on the top.
    [{ w: 0.3, h: 0.025, d: 0.22, x: 0, y: T + 0.0125, z: 0.06 }, '#B4BAC0'],
    [{ w: 0.28, h: 0.025, d: 0.2, x: 0, y: T + 0.0375, z: 0.06 }, '#C2C8CE'],
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      steel.push([{ w: 0.035, h: T - 0.03, d: 0.035, x: sx * (W / 2 - 0.03), y: (T - 0.03) / 2, z: sz * (D / 2 - 0.04) }, STEEL_DARK]);
    }
  }
  root.add(tintedBoxes('WorkTableSteel', metal, steel));
  // A three-sho gas rice cooker on the undershelf: aluminium drum on a dark
  // burner base, a domed lid with a knob, and the gas tap at the front.
  const y0 = 0.19;
  root.add(
    tintedCylinders('RiceCooker', metal, [
      [{ r: 0.165, h: 0.05, x: 0, y: y0 + 0.025, z: 0 }, '#2E3033'],
      [{ r: 0.155, h: 0.2, x: 0, y: y0 + 0.15, z: 0 }, '#C6CBD0'],
      [{ r: 0.162, h: 0.012, x: 0, y: y0 + 0.25, z: 0 }, '#AEB4BA'],
      [{ r: 0.148, h: 0.03, x: 0, y: y0 + 0.27, z: 0 }, '#D2D6DA'],
      [{ r: 0.03, h: 0.025, x: 0, y: y0 + 0.297, z: 0 }, '#1E1F21'],
      [{ r: 0.014, h: 0.03, x: 0.07, y: y0 + 0.03, z: -0.17, rx: Math.PI / 2 }, '#B23A2E'],
    ]),
  );
  // The shari-kiri tools hung on the wall above the table: the hangiri (a
  // wide, shallow cypress tub with copper hoops) on its edge, the rice paddle
  // and the fan beside it.
  const wallZ = D / 2 - 0.05;
  const hy = T + 0.33;
  root.add(
    tintedCylinders('Hangiri', tubWood, [
      [{ r: 0.2, h: 0.08, x: 0, y: hy, z: wallZ, rx: Math.PI / 2 }, '#D8B27A'],
      [{ r: 0.184, h: 0.004, x: 0, y: hy, z: wallZ - 0.04, rx: Math.PI / 2 }, '#C49A62'],
      [{ r: 0.203, h: 0.012, x: 0, y: hy, z: wallZ - 0.022, rx: Math.PI / 2 }, '#B8703A'],
      [{ r: 0.203, h: 0.012, x: 0, y: hy, z: wallZ + 0.022, rx: Math.PI / 2 }, '#B8703A'],
    ]),
    tintedBoxes('ShariTools', tubWood, [
      // Paddle (shamoji): blade and handle.
      [{ w: 0.07, h: 0.11, d: 0.008, x: -0.16, y: T + 0.2, z: wallZ - 0.07 }, '#E2C79A'],
      [{ w: 0.024, h: 0.13, d: 0.01, x: -0.16, y: T + 0.32, z: wallZ - 0.07 }, '#D9BC8C'],
      // Fan (uchiwa): face and handle.
      [{ w: 0.2, h: 0.18, d: 0.004, x: 0.17, y: T + 0.24, z: wallZ - 0.07, rz: 0.08 }, '#E8E2D2'],
      [{ w: 0.016, h: 0.13, d: 0.008, x: 0.172, y: T + 0.1, z: wallZ - 0.068 }, '#9A7448'],
    ]),
  );
  return root;
}

export function createGasStove(): Group {
  const root = new Group();
  root.name = 'GasRange';
  const RW = RANGE_WIDTH;
  const D = BACK_ROW_DEPTH;
  const RH = RANGE_HEIGHT;
  const CD = D - 0.03;
  const zf = 0.015 - CD / 2; // front face of the body
  const CHROME = '#D9DCE0';
  const doorBottom = 0.11;
  const doorTop = RH - 0.2;
  const sideW = 0.14;
  const edge = 0.008;
  const ovenW = RW - 2 * sideW - 4 * edge;
  const sideX = RW / 2 - edge - sideW / 2;

  // --- stainless body, top, back guard, rail, doors and handles ---
  const steel: Tinted<BoxPart> = [
    [{ w: RW, h: RH - 0.07, d: CD, x: 0, y: 0.06 + (RH - 0.07) / 2, z: 0.015 }, '#C3C8CD'],
    [{ w: RW, h: 0.012, d: CD, x: 0, y: RH - 0.006, z: 0.015 }, '#B9BEC3'],
    [{ w: RW - 0.05, h: 0.004, d: CD - 0.12, x: 0, y: RH + 0.001, z: 0 }, '#2E3033'],
    [{ w: RW, h: 0.11, d: 0.03, x: 0, y: RH + 0.055, z: D / 2 - 0.03 }, STEEL],
    [{ w: RW, h: 0.05, d: 0.012, x: 0, y: RH - 0.035, z: zf - 0.006 }, STEEL],
    [{ w: RW, h: 0.022, d: 0.035, x: 0, y: RH - 0.18, z: zf - 0.017 }, CHROME],
    [{ w: sideW, h: doorTop - doorBottom, d: 0.012, x: -sideX, y: (doorTop + doorBottom) / 2, z: zf - 0.006 }, '#BCC1C6'],
    [{ w: sideW, h: doorTop - doorBottom, d: 0.012, x: sideX, y: (doorTop + doorBottom) / 2, z: zf - 0.006 }, '#BCC1C6'],
    [{ w: 0.012, h: 0.09, d: 0.014, x: -(sideX - sideW / 2 + 0.025), y: 0.47, z: zf - 0.02 }, CHROME],
    [{ w: 0.012, h: 0.09, d: 0.014, x: sideX - sideW / 2 + 0.025, y: 0.47, z: zf - 0.02 }, CHROME],
    // Oven: door, pressed panel, bar handle on two standoffs, kick plate below.
    [{ w: ovenW, h: 0.4, d: 0.014, x: 0, y: 0.39, z: zf - 0.007 }, '#C6CBD0'],
    [{ w: ovenW - 0.08, h: 0.26, d: 0.004, x: 0, y: 0.37, z: zf - 0.016 }, '#B3B8BD'],
    [{ w: ovenW - 0.08, h: 0.018, d: 0.018, x: 0, y: 0.56, z: zf - 0.045 }, CHROME],
    [{ w: 0.014, h: 0.014, d: 0.03, x: -(ovenW / 2 - 0.05), y: 0.56, z: zf - 0.028 }, CHROME],
    [{ w: 0.014, h: 0.014, d: 0.03, x: ovenW / 2 - 0.05, y: 0.56, z: zf - 0.028 }, CHROME],
    [{ w: ovenW, h: 0.06, d: 0.012, x: 0, y: 0.14, z: zf - 0.006 }, '#B5BABF'],
  ];
  // Dark seams between the cupboard doors and the oven, and under the rail.
  for (const s of [-1, 1]) {
    steel.push([{ w: 0.005, h: doorTop - doorBottom, d: 0.014, x: s * (ovenW / 2 + edge), y: (doorTop + doorBottom) / 2, z: zf - 0.006 }, '#5E6368']);
  }
  steel.push([{ w: RW, h: 0.005, d: 0.014, x: 0, y: doorTop + 0.003, z: zf - 0.006 }, '#5E6368']);
  root.add(tintedBoxes('RangeSteel', metal, steel));

  // --- painted: dark control panel, a blank rating plate, wall tiles ---
  const painted: Tinted<BoxPart> = [
    [{ w: RW - 0.01, h: 0.09, d: 0.01, x: 0, y: RH - 0.115, z: zf - 0.005 }, '#1F4444'],
    // Blank rating plate on the cupboard door that is on the right when facing the range.
    [{ w: 0.05, h: 0.035, d: 0.002, x: -sideX, y: 0.2, z: zf - 0.013 }, '#E8E8E4'],
    [{ w: RW + 0.02, h: 0.6, d: 0.008, x: 0, y: RH + 0.3, z: D / 2 - 0.004 }, '#EEEDE6'],
  ];
  for (let i = -3; i <= 3; i++) {
    painted.push([{ w: 0.004, h: 0.6, d: 0.003, x: i * 0.1, y: RH + 0.3, z: D / 2 - 0.0095 }, '#BDBAB0']);
  }
  for (let j = 1; j <= 5; j++) {
    painted.push([{ w: RW + 0.02, h: 0.004, d: 0.003, x: 0, y: RH + j * 0.1, z: D / 2 - 0.0095 }, '#BDBAB0']);
  }
  root.add(tintedBoxes('RangePainted', enamel, painted));

  // --- round parts: feet, burner heads and caps, knobs with chrome skirts, oven ignition port ---
  const burners: Array<[number, number]> = [];
  for (const bx of [-0.165, 0.165]) for (const bz of [-0.1, 0.1]) burners.push([bx, bz]);
  const round: Tinted<{ r: number; h: number; x: number; y: number; z: number; rx?: number }> = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      round.push([{ r: 0.02, h: 0.06, x: sx * (RW / 2 - 0.05), y: 0.03, z: sz * (D / 2 - 0.07) }, '#1E1E20']);
    }
  }
  for (const [bx, bz] of burners) {
    round.push([{ r: 0.05, h: 0.02, x: bx, y: RH + 0.012, z: bz }, '#2A2B2D']);
    round.push([{ r: 0.036, h: 0.008, x: bx, y: RH + 0.026, z: bz }, '#55585C']);
  }
  for (const kx of [-0.26, -0.13, 0, 0.13, 0.26]) {
    round.push([{ r: 0.026, h: 0.006, x: kx, y: RH - 0.115, z: zf - 0.013, rx: Math.PI / 2 }, CHROME]);
    round.push([{ r: 0.02, h: 0.03, x: kx, y: RH - 0.115, z: zf - 0.028, rx: Math.PI / 2 }, '#141414']);
  }
  round.push([{ r: 0.012, h: 0.006, x: 0, y: 0.14, z: zf - 0.013, rx: Math.PI / 2 }, '#111111']);
  root.add(tintedCylinders('RangeRound', iron, round));

  // --- cast-iron grates: a square ring per burner (they touch into one field per side) ---
  const g = 0.1;
  const gy = RH + 0.035;
  const IRON = '#26272A';
  const grate: Tinted<BoxPart> = [];
  for (const [bx, bz] of burners) {
    grate.push([{ w: 2 * g, h: 0.016, d: 0.014, x: bx, y: gy, z: bz - g }, IRON]);
    grate.push([{ w: 2 * g, h: 0.016, d: 0.014, x: bx, y: gy, z: bz + g }, IRON]);
    grate.push([{ w: 0.014, h: 0.016, d: 2 * g, x: bx - g, y: gy, z: bz }, IRON]);
    grate.push([{ w: 0.014, h: 0.016, d: 2 * g, x: bx + g, y: gy, z: bz }, IRON]);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const k = 0.035 / Math.SQRT2;
        grate.push([{ w: 0.07, h: 0.016, d: 0.01, x: bx + sx * (g - k), y: gy, z: bz + sz * (g - k), ry: Math.atan2(sz, -sx) }, IRON]);
        grate.push([{ w: 0.014, h: 0.03, d: 0.014, x: bx + sx * g, y: RH + 0.015, z: bz + sz * g }, IRON]);
      }
    }
  }
  root.add(tintedBoxes('RangeGrates', iron, grate));

  // --- aluminium kettle (front right) and lidded pot (front left): one mesh ---
  const gt = gy + 0.008;
  const at = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
  const kettleProfile = [
    [0.001, 0], [0.085, 0], [0.092, 0.015], [0.09, 0.055], [0.075, 0.095],
    [0.045, 0.118], [0.03, 0.124], [0.001, 0.126],
  ].map(([r, y]) => new Vector2(r, y));
  const [kx, kz] = [0.165, -0.1];
  const [px, pz] = [-0.165, -0.1];
  const cookware = mergeGeometries([
    [new LatheGeometry(kettleProfile, 24), at(kx, gt, kz)],
    [new CylinderGeometry(0.007, 0.014, 0.11, 8), at(kx - 0.095, gt + 0.075, kz).multiply(new Matrix4().makeRotationZ(0.9))],
    [new TorusGeometry(0.06, 0.006, 6, 18, Math.PI), at(kx, gt + 0.126, kz).multiply(new Matrix4().makeRotationY(Math.PI / 2))],
    [new CylinderGeometry(0.012, 0.014, 0.015, 12), at(kx, gt + 0.132, kz)],
    [new CylinderGeometry(0.1, 0.095, 0.085, 24), at(px, gt + 0.0425, pz)],
    [new CylinderGeometry(0.102, 0.102, 0.006, 24), at(px, gt + 0.088, pz)],
    [new CylinderGeometry(0.012, 0.012, 0.015, 12), at(px, gt + 0.098, pz)],
    [new BoxGeometry(0.02, 0.015, 0.15), at(px, gt + 0.06, pz - 0.175).multiply(new Matrix4().makeRotationX(0.15))],
  ]);
  const pots = new Mesh(cookware, aluminium);
  pots.name = 'Cookware';
  root.add(pots);
  return root;
}
