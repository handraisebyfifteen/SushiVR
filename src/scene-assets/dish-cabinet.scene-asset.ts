import { Color, CylinderGeometry, Group, Matrix4, MeshStandardMaterial } from '@iwsdk/core';
import { CABINET_DEPTH, CABINET_HEIGHT, CABINET_WIDTH } from '../layout.js';
import { type BoxPart, boxBatch, instances } from './lib/batch.js';

/**
 * Glass-door dish cabinet (shokki-dana) against the back wall, in the same
 * row as the sink: a wooden carcass with a cupboard of sliding wooden doors
 * below a waist shelf, and sliding glass doors above with two shelves of
 * plates and bowls showing through.
 *
 * Origin: floor contact, centre of the footprint. The front faces -Z (toward
 * the aisle). Draw calls: wood, glass, plates, bowls (colours per instance).
 */

/** White base colours: each instance supplies its own colour. */
const wood = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.6 });
const ceramic = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.35 });
const glass = new MeshStandardMaterial({
  color: '#DCE8E4',
  roughness: 0.05,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
});

const KEYAKI = '#8A5A30';
const KEYAKI_DARK = '#5E3A1D';
const KEYAKI_LIGHT = '#A06C3C';
const INNER = '#B88452';

export function createDishCabinet(): Group {
  const root = new Group();
  root.name = 'DishCabinet';
  const W = CABINET_WIDTH;
  const H = CABINET_HEIGHT;
  const D = CABINET_DEPTH;
  const front = -D / 2;
  const waist = 0.86;
  const upperBottom = waist + 0.015;
  const upperTop = H - 0.035;
  const upperH = upperTop - upperBottom;
  const shelves = [upperBottom + upperH * 0.36, upperBottom + upperH * 0.7];

  const parts: Array<[BoxPart, string]> = [
    [{ w: 0.03, h: H, d: D, x: -W / 2 + 0.015, y: H / 2, z: 0 }, KEYAKI],
    [{ w: 0.03, h: H, d: D, x: W / 2 - 0.015, y: H / 2, z: 0 }, KEYAKI],
    [{ w: W + 0.03, h: 0.035, d: D + 0.025, x: 0, y: H - 0.0175, z: -0.0125 }, KEYAKI_DARK],
    [{ w: W - 0.02, h: 0.06, d: D - 0.03, x: 0, y: 0.03, z: 0.015 }, KEYAKI_DARK],
    [{ w: W - 0.06, h: H - 0.1, d: 0.012, x: 0, y: H / 2, z: D / 2 - 0.006 }, INNER],
    [{ w: W, h: 0.03, d: D + 0.02, x: 0, y: waist, z: -0.01 }, KEYAKI_DARK],
  ];
  for (const y of shelves) parts.push([{ w: W - 0.06, h: 0.018, d: D - 0.05, x: 0, y, z: 0.01 }, INNER]);
  // Sliding doors: wooden below, glass in thin wooden frames above, on two tracks.
  const doorW = W / 2 - 0.015;
  const lowerH = waist - 0.075;
  const panes: BoxPart[] = [];
  [-1, 1].forEach((s, i) => {
    const x = s * (W / 4 - 0.008);
    const z = front + 0.012 + i * 0.02;
    parts.push([{ w: doorW, h: lowerH, d: 0.018, x, y: 0.06 + lowerH / 2, z }, KEYAKI_LIGHT]);
    parts.push([{ w: 0.012, h: 0.07, d: 0.006, x: -s * (doorW / 2 - 0.04), y: 0.5, z: z - 0.011 }, KEYAKI_DARK]);
    const fy = upperBottom + upperH / 2;
    const bar = 0.022;
    parts.push([{ w: doorW, h: bar, d: 0.02, x, y: upperBottom + bar / 2, z }, KEYAKI]);
    parts.push([{ w: doorW, h: bar, d: 0.02, x, y: upperTop - bar / 2, z }, KEYAKI]);
    parts.push([{ w: bar, h: upperH, d: 0.02, x: x - doorW / 2 + bar / 2, y: fy, z }, KEYAKI]);
    parts.push([{ w: bar, h: upperH, d: 0.02, x: x + doorW / 2 - bar / 2, y: fy, z }, KEYAKI]);
    parts.push([{ w: doorW - 2 * bar, h: 0.012, d: 0.012, x, y: fy, z }, KEYAKI]);
    panes.push({ w: doorW - 2 * bar, h: upperH - 2 * bar, d: 0.004, x, y: fy, z });
  });
  const woodMesh = boxBatch('CabinetWood', wood, parts.map(([p]) => p));
  const c = new Color();
  parts.forEach(([, hex], i) => woodMesh.setColorAt(i, c.set(hex)));
  woodMesh.instanceColor!.needsUpdate = true;
  root.add(woodMesh);
  root.add(boxBatch('CabinetGlass', glass, panes));

  // Dishes: plate stacks on the waist shelf and the top shelf, bowls in the middle.
  const plateGeo = new CylinderGeometry(0.075, 0.06, 0.012, 20, 1);
  const bowlGeo = new CylinderGeometry(0.05, 0.03, 0.045, 18, 1);
  const plates: Matrix4[] = [];
  const plateColors: string[] = [];
  const stack = (x: number, y: number, n: number, color: string, scale = 1) => {
    for (let k = 0; k < n; k++) {
      plates.push(new Matrix4().makeScale(scale, 1, scale).setPosition(x, y + 0.006 + k * 0.013, 0.02));
      plateColors.push(color);
    }
  };
  stack(-0.17, upperBottom, 5, '#F4F1EA');
  stack(0.06, upperBottom, 4, '#2F4A7A');
  stack(-0.12, shelves[1] + 0.009, 3, '#8FA88A', 0.8);
  stack(0.14, shelves[1] + 0.009, 4, '#F4F1EA', 0.8);
  const bowls: Matrix4[] = [];
  const bowlColors: string[] = [];
  ['#F4F1EA', '#2F4A7A', '#7A4A2A', '#F4F1EA'].forEach((hex, i) => {
    bowls.push(new Matrix4().makeTranslation(-0.21 + i * 0.14, shelves[0] + 0.009 + 0.0225, 0.02));
    bowlColors.push(hex);
  });
  const plateMesh = instances('Plates', plateGeo, ceramic, plates);
  plateColors.forEach((hex, i) => plateMesh.setColorAt(i, c.set(hex)));
  plateMesh.instanceColor!.needsUpdate = true;
  const bowlMesh = instances('Bowls', bowlGeo, ceramic, bowls);
  bowlColors.forEach((hex, i) => bowlMesh.setColorAt(i, c.set(hex)));
  bowlMesh.instanceColor!.needsUpdate = true;
  root.add(plateMesh, bowlMesh);
  return root;
}
