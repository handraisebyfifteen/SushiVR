import { type BufferGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, type Object3D, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { NetaId } from '../../menu.js';
import type { PrepId } from '../../prep.js';
import { type Dims, prepMaterial, roundedBlock } from './neta-look.js';
import { flat, patterned, taperedTube, weld } from './neta-paint.js';
import { kohadaRow } from './cure-look.js';
import { tamagoBatter } from './tamago-look.js';
import { flounder, hamachiHalf, stripedJack, wholeSaba } from './fillet-look.js';
import { ingredientLook } from './range-look.js';

/**
 * The fish of the morning delivery as they come out of the ice box (paper,
 * then plastic, round each), and the work each takes. A material is a group
 * lying with its length along Z (toward the chef), centred on its origin,
 * bottom at y = 0; its parts are named meshes.
 *  - cut: a guide line, along Z (drawn toward the chef) or across it (X).
 *    A low cut is drawn flat along the board, under the flesh (shaving the
 *    skin off).
 *  - pull: the neta hand holds the material, the rice hand pinches a part
 *    and pulls it away (the wrapping, the squid's legs, its skin).
 *  - wipe: a sheet of kitchen paper rubbed over it.
 * What a step frees as scrap stays on the board until it is thrown away.
 * Runtime meshes (src/prep-cut-system.ts), drawn with the case's per-pixel
 * neta materials.
 */

export interface PrepEffect {
  /** Parts moved (root-local dx, dz, and dy when given: onto the ice, off it) when the step is done. */
  shift?: Array<[string, number, number, number?]>;
  /** Parts that become scrap (to be thrown away). */
  scrap?: string[];
  hide?: string[];
  show?: string[];
  /** The fish rolls over about its length (its turnable group). */
  flip?: boolean;
  /** Done on the wash board at the sink (水洗い), not on the manaita. */
  sink?: boolean;
}

/**
 * Root-local points and lines. Stage 4 adds:
 *  - scale: the scaler, held by a pinch, scraped over the fish until the
 *    scales (the named overlay part) are gone.
 *  - turn: the fish pinched at `at` and lifted a little; it rolls over.
 *  - rinse: a hand rubs the belly cavity at `at`, under the running tap.
 *  - pins: the tweezers, held by a pinch, pull each named pin bone out.
 */
export type PrepStep =
  | ({ kind: 'cut'; axis: 'z' | 'x'; at: number; mid: number; len: number; low?: boolean; say: string } & PrepEffect)
  | ({ kind: 'pull'; netaAt: Vector3; riceAt: Vector3; parts: string[]; say: string } & PrepEffect)
  | ({ kind: 'wipe'; say: string } & PrepEffect)
  | ({ kind: 'scale'; part: string; say: string } & PrepEffect)
  | ({ kind: 'turn'; at: Vector3; say: string } & PrepEffect)
  | ({ kind: 'rinse'; at: Vector3; say: string } & PrepEffect)
  | ({ kind: 'pins'; pins: string[]; say: string } & PrepEffect);

export interface PrepProduct {
  /** The parts that go together; the first gives the centre and the length. */
  parts: string[];
  neta: NetaId;
  /** Into its place in the case, back on the ice to wait for the range, or into its tray on the drainboard to be cured (full). */
  dest: 'case' | 'ice' | 'cure';
}

export interface PrepMaterialLook {
  root: Group;
  length: number;
  halfWidth: number;
  /** The flesh's highest top (the guide lines lie on it). */
  top: number;
  steps: PrepStep[];
  products: PrepProduct[];
  /** Lies along X (a whole fish: head on the chef's left, belly toward the chef) instead of toward the chef. */
  alongX?: boolean;
  /** On the manaita, the root this far from the board's centre (x, z), clear of the board's back row. */
  boardAt?: [number, number];
  /** Where its scraps on the board are piled (board-local x, z), clear of its work. */
  pileAt?: [number, number];
  /** Where it is taken up (root-local x, z) when not its near end: the kohada's row by its middle, clear of the heads and guts at both ends. */
  takeAt?: [number, number];
  /** The group that rolls over when the fish is turned, and how thick the fish lies. */
  turnable?: { group: Object3D; thickness: number };
}

const plainMaterials = new Map<string, MeshStandardMaterial>();
function plain(color: string, roughness = 0.5): MeshStandardMaterial {
  const key = `${color}/${roughness}`;
  let m = plainMaterials.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness });
    plainMaterials.set(key, m);
  }
  return m;
}
const paperMaterial = new MeshStandardMaterial({ color: '#F3EFE6', roughness: 0.95 });
const plasticMaterial = new MeshStandardMaterial({ color: '#E4EEF3', roughness: 0.08, transparent: true, opacity: 0.34, depthWrite: false });

/** Turns a block built along X so it lies along Z, centred at (cx, cz), from y0. */
function lay(mesh: Mesh, L: number, cx: number, cz: number, y0: number, name: string): Mesh {
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(cx, y0, cz + L / 2);
  mesh.name = name;
  return mesh;
}
/** Flesh of one neta (its own per-pixel pattern). */
function flesh(name: string, neta: NetaId, L: number, H: number, W: number, cx: number, cz = 0, y0 = 0): Mesh {
  const dims: Dims = [L, H, W];
  return lay(new Mesh(patterned(roundedBlock(L, H, W, 0.004)), prepMaterial(neta, dims)), L, cx, cz, y0, name);
}
/** A plain-coloured part (skin, blood line, scraps). */
function part(name: string, color: string, L: number, H: number, W: number, cx: number, cz = 0, y0 = 0, roughness = 0.5): Mesh {
  return lay(new Mesh(roundedBlock(L, H, W, Math.min(0.003, H / 3, W / 3)), plain(color, roughness)), L, cx, cz, y0, name);
}
/** The fish shop's wrapping: paper round the fish, a plastic bag round that. */
function wrapping(root: Group, L: number, H: number, W: number, cx: number): void {
  root.add(
    lay(new Mesh(roundedBlock(L + 0.012, H + 0.008, W + 0.012, 0.006), paperMaterial), L + 0.012, cx, 0, 0, 'Paper'),
    lay(new Mesh(roundedBlock(L + 0.03, H + 0.018, W + 0.026, 0.01), plasticMaterial), L + 0.03, cx, 0, 0, 'Plastic'),
  );
}
/** The two pulls that unwrap a material: the plastic bag, then the paper. */
function unwrapSteps(L: number, top: number): PrepStep[] {
  return [
    { kind: 'pull', netaAt: new Vector3(0, top + 0.012, -0.03), riceAt: new Vector3(0, top * 0.6, L / 2 + 0.012), parts: ['Plastic'], scrap: ['Plastic'], say: 'Off with the bag' },
    { kind: 'pull', netaAt: new Vector3(0, top + 0.008, -0.03), riceAt: new Vector3(0, top * 0.6, L / 2 + 0.004), parts: ['Paper'], scrap: ['Paper'], say: 'Unwrap the paper' },
  ];
}

/** A belly cut of tuna, skin on the belly side: fatty, medium fatty and lean side by side. */
function tunaBelly(): PrepMaterialLook {
  const L = 0.2;
  const W = 0.044;
  const root = new Group();
  root.name = 'TunaBelly';
  root.add(
    part('Skin', '#8C97A1', L, 0.034, 0.006, -1.5 * W - 0.003, 0, 0, 0.35),
    flesh('FattyTuna', 'FattyTuna', L, 0.034, W, -W),
    flesh('MediumFattyTuna', 'MediumFattyTuna', L, 0.041, W, 0),
    flesh('LeanTuna', 'LeanTuna', L, 0.047, W, W),
  );
  wrapping(root, L, 0.047, 3 * W + 0.006, -0.003);
  return {
    root,
    length: L,
    halfWidth: 0.075,
    top: 0.047,
    steps: [
      ...unwrapSteps(L, 0.047),
      { kind: 'cut', axis: 'z', at: -1.5 * W, mid: 0, len: L, scrap: ['Skin'], say: 'Cut off the skin side' },
      { kind: 'cut', axis: 'z', at: -W / 2, mid: 0, len: L, shift: [['FattyTuna', -0.012, 0]], say: 'Along the line' },
      { kind: 'cut', axis: 'z', at: W / 2, mid: 0, len: L, shift: [['LeanTuna', 0.012, 0]], say: 'Along the line' },
    ],
    products: [
      { parts: ['FattyTuna'], neta: 'FattyTuna', dest: 'case' },
      { parts: ['MediumFattyTuna'], neta: 'MediumFattyTuna', dest: 'case' },
      { parts: ['LeanTuna'], neta: 'LeanTuna', dest: 'case' },
    ],
  };
}

/**
 * A bonito half, skin down: the back (背) on the right, the belly (腹) on the
 * left, the blood line between them; the hard skin round the neck at the
 * belly's far (head) end.
 */
function bonitoHalf(): PrepMaterialLook {
  const L = 0.26;
  const neck = 0.035;
  const root = new Group();
  root.name = 'BonitoHalf';
  const s = 0.004; // skin
  root.add(
    part('SkinBack', '#4E6478', L, s, 0.046, 0.025, 0, 0, 0.35),
    flesh('Back', 'Bonito', L, 0.034, 0.038, 0.029, 0, s),
    part('BloodBack', '#4A1015', L - 0.01, 0.03, 0.008, 0.006, 0, s, 0.45),
    part('SkinBelly', '#A9BAC6', L - neck, s, 0.044, -0.024, neck / 2, 0, 0.35),
    flesh('Belly', 'Bonito', L - neck, 0.026, 0.036, -0.028, neck / 2, s),
    part('BloodBelly', '#4A1015', L - neck - 0.01, 0.024, 0.008, -0.006, neck / 2, s, 0.45),
    part('Neck', '#6E6966', neck, 0.03, 0.044, -0.024, -L / 2 + neck / 2, 0, 0.6),
  );
  wrapping(root, L, 0.038, 0.098, 0);
  const back = ['Back', 'SkinBack', 'BloodBack'];
  const belly = ['Belly', 'SkinBelly', 'BloodBelly', 'Neck'];
  const d = 0.012;
  return {
    root,
    length: L,
    halfWidth: 0.062,
    top: 0.038,
    steps: [
      ...unwrapSteps(L, 0.038),
      {
        kind: 'cut', axis: 'z', at: 0, mid: 0, len: L, say: 'Split back and belly',
        shift: [...back.map((p): [string, number, number] => [p, d, 0]), ...belly.map((p): [string, number, number] => [p, -d, 0])],
      },
      { kind: 'cut', axis: 'z', at: d + 0.01, mid: 0, len: L, scrap: ['BloodBack'], say: 'Off with the blood line' },
      // Shaved, not pulled: pulling the skin splits bonito flesh.
      { kind: 'cut', axis: 'z', at: d + 0.029, mid: 0, len: L, low: true, scrap: ['SkinBack'], say: 'Shave the skin off, flat' },
      { kind: 'cut', axis: 'x', at: -L / 2 + neck, mid: -d - 0.024, len: 0.06, scrap: ['Neck'], say: 'Off with the hard skin' },
      { kind: 'cut', axis: 'z', at: -d - 0.01, mid: neck / 2, len: L - neck, scrap: ['BloodBelly'], say: 'Off with the blood line' },
    ],
    products: [
      { parts: ['Back'], neta: 'Bonito', dest: 'case' },
      { parts: ['Belly', 'SkinBelly'], neta: 'BonitoBelly', dest: 'ice' },
    ],
  };
}

const squidSkin = new MeshStandardMaterial({ color: '#FFFFFF', vertexColors: true, roughness: 0.32 });

/** A whole squid: the body (mantle) with its fins, the guts inside its mouth, the head and legs at the near end. */
function squid(): PrepMaterialLook {
  const root = new Group();
  root.name = 'Squid';
  const far = -0.13;
  const near = 0.04;
  const bodyMid = (far + near) / 2;
  const bodyLen = near - far;
  // Body: a flattened tube, open at the near end, tapering to a point; brownish skin.
  const path: Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    path.push(new Vector3(0, 0.017, near + (far - near) * t));
    radii.push(0.026 * Math.sqrt(Math.max(0.02, 1 - t ** 2.2)));
  }
  const fin = flat(roundedBlock(0.055, 0.003, 0.03, 0.001), '#C9A694');
  const body = new Mesh(
    weld([
      flat(taperedTube(path, radii, 14, 0.62), '#D8BBAA'),
      [fin, new Matrix4().makeRotationY(-Math.PI / 2 + 0.35).setPosition(0.012, 0.016, -0.07)],
      [fin, new Matrix4().makeRotationY(-Math.PI / 2 - 0.35).setPosition(-0.012, 0.016, -0.07)],
    ]),
    squidSkin,
  );
  body.name = 'Body';
  // Head and legs fanning toward the chef; the guts sac behind the head comes out with them.
  const parts: Array<BufferGeometry | [BufferGeometry, Matrix4]> = [];
  parts.push([flat(new SphereGeometry(1, 12, 8), '#E2CFC2'), new Matrix4().makeScale(0.017, 0.012, 0.016).setPosition(0, 0.013, near + 0.012)]);
  for (let i = 0; i < 10; i++) {
    const long = i >= 8;
    const spread = ((long ? (i - 8.5) * 2 : i - 3.5) / 3.5) * 0.5;
    const len = long ? 0.095 : 0.06;
    const arm: Vector3[] = [];
    const ar: number[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      arm.push(new Vector3(Math.sin(spread) * len * t, 0.006 + 0.004 * (1 - t), near + 0.024 + Math.cos(spread) * len * t));
      ar.push(0.0045 * (1 - 0.7 * t));
    }
    parts.push(flat(taperedTube(arm, ar, 6, 0.8), long ? '#D9C0B0' : '#DDC6B7'));
  }
  const legs = new Mesh(weld(parts), squidSkin);
  legs.name = 'Legs';
  const guts = new Mesh(new SphereGeometry(1, 10, 6).scale(0.015, 0.01, 0.022).translate(0, 0.012, near - 0.012), plain('#9C7A3C', 0.4));
  guts.name = 'Guts';
  // Opened: the legs flat (geso), the body as one sheet with its skin over it.
  const aside = 0.085;
  const legsFlat = new Mesh(gesoFlat(), squidSkin);
  legsFlat.name = 'LegsFlat';
  legsFlat.position.set(aside, 0, near + 0.07);
  legsFlat.visible = false;
  const sheet = flesh('Sheet', 'Squid', bodyLen - 0.01, 0.01, 0.075, 0, bodyMid);
  sheet.visible = false;
  const skin = part('BodySkin', '#C59C88', bodyLen - 0.008, 0.002, 0.077, 0, bodyMid, 0.01, 0.4);
  skin.visible = false;
  root.add(body, legs, guts, legsFlat, sheet, skin);
  wrapping(root, 0.27, 0.034, 0.07, 0);
  return {
    root,
    length: 0.27,
    halfWidth: 0.045,
    top: 0.03,
    steps: [
      ...unwrapSteps(0.27, 0.034),
      {
        kind: 'pull', netaAt: new Vector3(0, 0.03, -0.05), riceAt: new Vector3(0, 0.015, near + 0.03), parts: ['Legs', 'Guts'],
        shift: [['Legs', aside, 0.03], ['Guts', aside, 0.03]], say: 'Pull the legs out',
      },
      { kind: 'cut', axis: 'x', at: near + 0.03 + 0.002, mid: aside, len: 0.05, scrap: ['Guts'], say: 'Cut off the guts' },
      { kind: 'cut', axis: 'z', at: aside, mid: near + 0.07, len: 0.09, hide: ['Legs'], show: ['LegsFlat'], say: 'Open the legs flat' },
      { kind: 'cut', axis: 'z', at: 0, mid: bodyMid, len: bodyLen, hide: ['Body'], show: ['Sheet', 'BodySkin'], say: 'Open the body' },
      {
        kind: 'pull', netaAt: new Vector3(-0.02, 0.014, bodyMid - 0.03), riceAt: new Vector3(0.02, 0.013, near - 0.012), parts: ['BodySkin'],
        scrap: ['BodySkin'], say: 'Peel the skin off',
      },
      { kind: 'wipe', say: 'Pat it dry with paper' },
    ],
    products: [
      { parts: ['Sheet'], neta: 'Squid', dest: 'case' },
      { parts: ['LegsFlat'], neta: 'Geso', dest: 'case' },
    ],
  };
}

/** The legs opened out flat: ten legs fanned from a flat head piece, suckers underneath. */
function gesoFlat(): BufferGeometry {
  const parts: Array<BufferGeometry | [BufferGeometry, Matrix4]> = [];
  parts.push(flat(roundedBlock(0.03, 0.006, 0.04, 0.002), '#E6D7CA').rotateY(Math.PI / 2).translate(0, 0, -0.035));
  for (let i = 0; i < 10; i++) {
    const spread = ((i - 4.5) / 4.5) * 0.45;
    const len = i === 0 || i === 9 ? 0.07 : 0.05;
    const arm: Vector3[] = [];
    const ar: number[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      arm.push(new Vector3(Math.sin(spread) * len * t, 0.003, -0.02 + Math.cos(spread) * len * t));
      ar.push(0.004 * (1 - 0.7 * t));
    }
    parts.push(flat(taperedTube(arm, ar, 6, 0.55), i % 2 ? '#EADCCF' : '#E2D2C4'));
  }
  return weld(parts);
}

/**
 * The range's ingredients (stage 3), prepared by the fish shop: no work on
 * the board, they go from the ice straight into their pots (src/range-system.ts
 * reads their colours from root.userData.tints). For the cook, each fills
 * its own case item.
 */
function simmered(id: 'Octopus' | 'SeaEel' | 'Abalone' | 'Kanpyo'): PrepMaterialLook {
  const look = ingredientLook(id);
  look.root.userData.tints = look.tints;
  look.root.userData.top = look.top;
  return {
    root: look.root,
    length: look.halfWidth * 2,
    halfWidth: look.halfWidth,
    top: look.top,
    steps: [],
    products: [{ parts: [], neta: id, dest: 'case' }],
  };
}

/** The look and work of a delivered material, built fresh (one per day); the kohada come in the day's size. */
export function prepMaterialLook(id: PrepId, kohadaSize = 1): PrepMaterialLook | null {
  switch (id) {
    case 'TunaBelly':
      return tunaBelly();
    case 'BonitoHalf':
      return bonitoHalf();
    case 'Squid':
      return squid();
    case 'Octopus':
    case 'SeaEel':
    case 'Abalone':
    case 'Kanpyo':
      return simmered(id);
    case 'StripedJack':
      return stripedJack();
    case 'Flounder':
      return flounder();
    case 'Yellowtail':
      return hamachiHalf();
    case 'Saba':
      return wholeSaba();
    case 'Kohada':
      return kohadaRow(kohadaSize);
    case 'Tamago':
      return tamagoBatter();
    default:
      return null;
  }
}

/** A sheet of kitchen paper (in the hand, then used). */
export function paperSheet(): Mesh {
  const mesh = new Mesh(roundedBlock(0.11, 0.0015, 0.1, 0.0005), paperMaterial);
  mesh.geometry.translate(-0.055, 0, 0);
  mesh.name = 'KitchenPaper';
  return mesh;
}
