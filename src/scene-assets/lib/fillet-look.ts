import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Material,
  Shape,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import type { NetaId } from '../../menu.js';
import { prepMaterial, roundedBlock } from './neta-look.js';
import { paint, patterned, taperedTube, weld } from './neta-paint.js';
import type { PrepMaterialLook, PrepStep } from './prep-look.js';

/**
 * Stage 4's fish (the user's shop: mid-sized fish come whole, big ones as
 * only what the case takes): a whole striped jack (三枚おろし), a whole
 * flounder (五枚おろし, its engawa served) and a hamachi half. Each lies
 * along X, head on the chef's left (-X), belly toward the chef (+Z) on the
 * manaita; at the sink the root is turned round (yaw π) so the head is on
 * the chef's left there too.
 *
 * A whole fish is lofted from sections (lens-shaped, back at -Z, belly at
 * +Z, lying on its side with its bottom on y = 0) inside a 'Fish' group
 * that rolls over about its length when the fish is turned. The body is cut
 * into the pieces the filleting needs: the halves above and below the bone
 * (quarters for the flounder). Skin is painted per vertex; cut faces take
 * the neta's own per-pixel flesh (neta-material.ts). A lifted fillet is a
 * separate set of parts laid flesh up beside the fish: its saku (built like
 * the case's, x 0..L, y 0..H, z across), the skin under them, the belly
 * bones and the pin bones on top. Runtime meshes (src/prep-cut-system.ts);
 * the whole-fish-preview asset shows them.
 */

/** A section along the fish: half its height back to belly (Z) and half its thickness (Y). */
export interface Sta {
  x: number;
  w: number;
  t: number;
}

/** A pin bone's length (it stands out of the flesh by about half of it). */
export const PIN_LENGTH = 0.012;

/** The scales over one side: a sheen that fades as they are scraped off (one material per side, its opacity the scales left). */
export const SCALES_OPACITY = 0.55;
export function scalesMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: '#C7D2D8', roughness: 0.22, metalness: 0.55, transparent: true, opacity: SCALES_OPACITY, depthWrite: false });
  m.name = 'FishScales';
  return m;
}

const tmpA = new Vector3();
const tmpN = new Vector3();

/** The station at x (linear between the given ones). */
export function at(st: Sta[], x: number): Sta {
  if (x <= st[0].x) return st[0];
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i];
    const b = st[i + 1];
    if (x <= b.x) {
      const u = (x - a.x) / (b.x - a.x);
      return { x, w: a.w + (b.w - a.w) * u, t: a.t + (b.t - a.t) * u };
    }
  }
  return st[st.length - 1];
}

/** A point of a section: th = 0 the belly edge (+Z), π/2 the top, π the back edge, 3π/2 the bottom. */
function sect(s: Sta, th: number, out: Vector3, grow = 0): Vector3 {
  const sn = Math.sin(th);
  return out.set(s.x, s.t + (s.t + grow) * Math.sign(sn) * Math.abs(sn) ** 1.25, (s.w + grow) * Math.cos(th));
}

/** Flips the winding if the normal at `vertex` does not face `want`. */
function orient(g: BufferGeometry, vertex: number, want: Vector3): BufferGeometry {
  tmpN.fromBufferAttribute(g.getAttribute('normal'), vertex);
  if (tmpN.dot(want) >= 0) return g;
  const index = g.getIndex()!;
  const a = index.array;
  for (let i = 0; i < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  index.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function indexed(pos: number[], idx: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The skin between angles a..b over the stations (n steps), facing out. */
export function shell(st: Sta[], a: number, b: number, n: number, grow = 0): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const s of st) {
    for (let j = 0; j <= n; j++) {
      sect(s, a + ((b - a) * j) / n, tmpA, grow);
      pos.push(tmpA.x, tmpA.y, tmpA.z);
    }
  }
  const row = n + 1;
  for (let i = 0; i < st.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const k = i * row + j;
      idx.push(k, k + 1, k + row, k + 1, k + row + 1, k + row);
    }
  }
  const g = indexed(pos, idx);
  const mi = Math.floor(st.length / 2);
  const mj = Math.floor(n / 2);
  const s = st[mi];
  sect(s, a + ((b - a) * mj) / n, tmpA, grow);
  return orient(g, mi * row + mj, new Vector3(0, tmpA.y - s.t, tmpA.z));
}

/** A flat face over the stations between two points per station, facing `want`. */
function strip(st: Sta[], edge: (s: Sta, k: 0 | 1, out: Vector3) => Vector3, want: Vector3): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  st.forEach((s, i) => {
    edge(s, 0, tmpA);
    pos.push(tmpA.x, tmpA.y, tmpA.z);
    edge(s, 1, tmpA);
    pos.push(tmpA.x, tmpA.y, tmpA.z);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  });
  return orient(indexed(pos, idx), 2, want);
}

/** An end of a body piece: a fan from (x, t, 0) over the angles a..b, facing `want` (±X). */
export function cap(s: Sta, a: number, b: number, n: number, want: Vector3): BufferGeometry {
  const pos: number[] = [s.x, s.t, 0];
  const idx: number[] = [];
  for (let j = 0; j <= n; j++) {
    sect(s, a + ((b - a) * j) / n, tmpA);
    pos.push(tmpA.x, tmpA.y, tmpA.z);
    if (j > 0) idx.push(0, j, j + 1);
  }
  return orient(indexed(pos, idx), 0, want);
}

/**
 * One piece of the body between angles a..b: its painted skin, and the flesh
 * of its cut faces (the bone plane y = t, and for a quarter the middle
 * plane z = 0), its ends capped.
 */
function bodyPiece(st: Sta[], a: number, b: number, skin: (p: Vector3, n: Vector3, out: Color) => void): BufferGeometry {
  const n = Math.max(4, Math.round(((b - a) / Math.PI) * 14));
  const parts: BufferGeometry[] = [paint(shell(st, a, b, n), skin)];
  const top = Math.sin((a + b) / 2) > 0;
  const quarter = b - a < Math.PI * 0.9;
  const lo = Math.cos(b);
  const hi = Math.cos(a);
  // The bone plane: across the piece's width, facing away from its skin.
  parts.push(patterned(strip(st, (s, k, out) => out.set(s.x, s.t, s.w * (k ? Math.max(lo, hi) : Math.min(lo, hi))), new Vector3(0, top ? -1 : 1, 0))));
  if (quarter) {
    const side = Math.cos((a + b) / 2) > 0 ? -1 : 1;
    parts.push(patterned(strip(st, (s, k, out) => out.set(s.x, k ? s.t + (top ? 1 : -1) * s.t : s.t, 0), new Vector3(0, 0, side))));
  }
  parts.push(patterned(cap(st[0], a, b, n, new Vector3(-1, 0, 0))), patterned(cap(st[st.length - 1], a, b, n, new Vector3(1, 0, 0))));
  return weld(parts);
}

/** A thin fin along one edge (side +1 belly, -1 back) from x0 to x1, in the bone's plane. */
function fringe(st: Sta[], side: 1 | -1, x0: number, x1: number, width: number, color: string): BufferGeometry {
  const rows: Sta[] = [];
  for (let i = 0; i <= 16; i++) rows.push(at(st, x0 + ((x1 - x0) * i) / 16));
  const c = new Color(color);
  const dark = c.clone().multiplyScalar(0.72);
  const ray = (p: Vector3, _n: Vector3, out: Color) => out.copy(c).lerp(dark, 0.5 + 0.5 * Math.sin(p.x * 900));
  const w = (s: Sta) => width * Math.sin(Math.PI * Math.min(1, Math.max(0, (s.x - x0) / (x1 - x0))) * 0.85 + 0.25);
  const edge = (dy: number) => (s: Sta, k: 0 | 1, out: Vector3) => out.set(s.x, s.t + dy, side * (k ? s.w + w(s) : s.w * 0.9));
  return weld([paint(strip(rows, edge(0.0008), new Vector3(0, 1, 0)), ray), paint(strip(rows, edge(-0.0008), new Vector3(0, -1, 0)), ray)]);
}

/** A flat outline (x, z points) made 1.6 mm thick, lying in the plane y. */
export function plate(points: Array<[number, number]>, y: number, color: string, ribs = true): BufferGeometry {
  const shape = new Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  const g = new ExtrudeGeometry(shape, { depth: 0.0016, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y - 0.0008, 0);
  const c = new Color(color);
  const dark = c.clone().multiplyScalar(0.7);
  return paint(g, (p, _n, out) => out.copy(c).lerp(dark, ribs ? 0.5 + 0.5 * Math.sin(Math.atan2(p.z, p.x) * 60) : 0));
}

/** An eye: dark pupil facing `dir`, a pale ring round it. */
export function eye(r: number, dir: Vector3, ring: string): BufferGeometry {
  const pupil = new Color('#111214');
  const iris = new Color(ring);
  return paint(new SphereGeometry(r, 12, 8), (_p, n, out) => out.copy(n.dot(dir) > 0.55 ? pupil : iris));
}

/** A rounded block like a case saku (x 0..L, y 0..H, z ±W/2), tapering toward one end on its outer side. */
export function sakuBlock(L: number, H: number, W: number, opts: { tail?: number; fixed?: 1 | -1; thickEnd?: 'start' | 'end' } = {}): BufferGeometry {
  const g = patterned(roundedBlock(L, H, W, Math.min(0.003, H / 3, W / 4)));
  const tail = opts.tail ?? 1;
  if (tail === 1) return g;
  const fixed = opts.fixed ?? -1;
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    let u = pos.getX(i) / L;
    if (opts.thickEnd === 'end') u = 1 - u;
    const f = 1 - (1 - tail) * Math.max(0, u) ** 1.4;
    const edge = (fixed * W) / 2;
    pos.setY(i, pos.getY(i) * (0.35 + 0.65 * f));
    pos.setZ(i, edge + (pos.getZ(i) - edge) * f);
  }
  g.computeVertexNormals();
  return g;
}

/** A plate built at y = 0 lifted onto the bone plane (each station's middle height). */
function onBonePlane(g: BufferGeometry, st: Sta[]): BufferGeometry {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + at(st, pos.getX(i)).t);
  g.computeVertexNormals();
  return g;
}

export function named<T extends Mesh | Group>(o: T, name: string, visible = true): T {
  o.name = name;
  o.visible = visible;
  return o;
}

// ---------------------------------------------------------------- shared fillet parts

/** A sheet of skin under a lifted fillet (x 0..L around its middle, tapering like it). */
function skinSheet(L: number, W: number, tail: number, skin: (u: number, out: Color) => void): BufferGeometry {
  const g = roundedBlock(L, 0.0025, W, 0.001);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * (1 - (1 - tail) * Math.min(1, Math.max(0, pos.getX(i) / L)) ** 1.4));
  g.computeVertexNormals();
  return paint(g, (p, _n, out) => skin(p.z / (W / 2), out));
}

/** A strip of belly bones (腹骨): a thin white sheet with its rib lines. */
function bellyBones(L: number, W: number): BufferGeometry {
  const white = new Color('#EFE9DF');
  const rib = new Color('#D7CDBF');
  return paint(roundedBlock(L, 0.0028, W, 0.001), (p, _n, out) => out.copy(white).lerp(rib, Math.max(0, Math.sin(p.x * 420)) ** 4));
}

/** A pin bone, standing out of the flesh, leaning toward the head. */
function pinBone(): BufferGeometry {
  const g = new CylinderGeometry(0.0007, 0.0013, PIN_LENGTH, 6, 1);
  g.translate(0, PIN_LENGTH / 2, 0);
  g.rotateZ(0.45);
  return paint(g, (_p, _n, out) => out.set('#F3EFE7'));
}

interface FilletSpec {
  /** Part name suffix (A, B, F1...). */
  id: string;
  /** Middle of the laid-out fillet (root-local x, z) and its length. */
  cx: number;
  cz: number;
  L: number;
  /** The two saku side by side (or one), each W wide and H high, from the middle line outward. */
  saku: Array<{ name: string; neta: NetaId; W: number; H: number; side: 1 | -1; skinOut: boolean }>;
  tail: number;
  skin: (u: number, out: Color) => void;
  bones?: { side: 1 | -1; L: number; W: number };
  pins?: number;
}

/**
 * A fillet laid flesh up beside the fish, hidden until it is lifted: its
 * saku over a sheet of skin, the belly bones near the head end, the pin bones
 * along the middle line in the head half. Returns the meshes it adds.
 */
function filletParts(root: Group, f: FilletSpec, materials: Partial<Record<NetaId, Material>>): void {
  const width = f.saku.reduce((sum, s) => sum + s.W, 0);
  const skinZ = f.cz + f.saku.reduce((sum, s) => sum + (s.side * s.W) / 2, 0);
  const skin = named(new Mesh(skinSheet(f.L + 0.004, width + 0.004, 0.62, f.skin), materials[f.saku[0].neta]!), `Skin${f.id}`, false);
  skin.geometry.translate(-(f.L + 0.004) / 2, 0, 0);
  skin.position.set(f.cx, 0, skinZ);
  root.add(skin);
  let top = 0;
  for (const s of f.saku) {
    // Its +z side (the pattern's skin side) faces out from the middle line, or in toward it.
    const flip = s.skinOut ? s.side < 0 : s.side > 0;
    const g = sakuBlock(f.L, s.H, s.W, { tail: f.tail, fixed: s.skinOut ? -1 : 1, thickEnd: flip ? 'end' : 'start' });
    const mesh = named(new Mesh(g, materials[s.neta]!), s.name, false);
    mesh.rotation.y = flip ? Math.PI : 0;
    mesh.position.set(f.cx + (flip ? f.L / 2 : -f.L / 2), 0.0024, f.cz + (s.side * s.W) / 2);
    root.add(mesh);
    top = Math.max(top, s.H);
  }
  if (f.bones) {
    const b = named(new Mesh(bellyBones(f.bones.L, f.bones.W), materials[f.saku[0].neta]!), `Bones${f.id}`, false);
    const under = f.saku.find((s) => s.side === f.bones!.side) ?? f.saku[0];
    b.position.set(f.cx - f.L / 2 + 0.004, 0.0024 + under.H - 0.0016, f.cz + f.bones.side * (under.W - f.bones.W / 2 - 0.004));
    root.add(b);
  }
  for (let k = 0; k < (f.pins ?? 0); k++) {
    const p = named(new Mesh(pinBone(), materials[f.saku[0].neta]!), `Pin${f.id}${k}`, false);
    p.position.set(f.cx - f.L / 2 + 0.022 + k * 0.016, 0.0024 + top - 0.005, f.cz + 0.0015 * (k % 2 ? 1 : -1));
    root.add(p);
  }
}

/** Names of a fillet's parts (shown when it is lifted). */
function filletNames(f: FilletSpec): string[] {
  const out = [`Skin${f.id}`, ...f.saku.map((s) => s.name)];
  if (f.bones) out.push(`Bones${f.id}`);
  for (let k = 0; k < (f.pins ?? 0); k++) out.push(`Pin${f.id}${k}`);
  return out;
}

const pins = (id: string, n: number) => Array.from({ length: n }, (_, k) => `Pin${id}${k}`);

// ---------------------------------------------------------------- the striped jack (shima-aji), whole

const JACK: Sta[] = [
  { x: -0.17, w: 0.008, t: 0.005 },
  { x: -0.157, w: 0.026, t: 0.012 },
  { x: -0.138, w: 0.041, t: 0.017 },
  { x: -0.11, w: 0.053, t: 0.021 },
  { x: -0.075, w: 0.058, t: 0.024 },
  { x: -0.03, w: 0.057, t: 0.024 },
  { x: 0.02, w: 0.05, t: 0.021 },
  { x: 0.06, w: 0.038, t: 0.017 },
  { x: 0.095, w: 0.023, t: 0.011 },
  { x: 0.118, w: 0.011, t: 0.006 },
  { x: 0.13, w: 0.008, t: 0.0045 },
];
/** The head comes off behind the gill cover. */
const JACK_GILL = -0.11;

const jackBack = new Color('#4E6C77');
const jackUpper = new Color('#93A6AD');
const jackStripe = new Color('#D8B64A');
const jackLower = new Color('#CBD4D8');
const jackBelly = new Color('#EEF1F2');
/** The jack's skin across its flank: u = -1 at the back edge, +1 at the belly. */
function jackSkin(u: number, out: Color): Color {
  if (u < -0.45) return out.copy(jackBack).lerp(jackUpper, Math.max(0, (u + 0.75) / 0.3));
  if (u < -0.14) return out.copy(jackUpper).lerp(jackStripe, Math.max(0, (u + 0.24) / 0.1));
  if (u < 0.04) return out.copy(jackStripe);
  if (u < 0.35) return out.copy(jackStripe).lerp(jackLower, Math.min(1, (u - 0.04) / 0.1));
  return out.copy(jackLower).lerp(jackBelly, Math.min(1, (u - 0.35) / 0.25));
}
const jackFlank = (p: Vector3, _n: Vector3, out: Color) => jackSkin(p.z / Math.max(0.006, at(JACK, p.x).w), out);

/**
 * A whole striped jack (about 1.2 kg, 36 cm), on its side. Washed at the
 * sink: scaled on both sides, the head off behind the gills, the belly
 * opened and the guts out, rinsed under the tap. Then on the board, belly
 * toward the chef: cut along the belly and the back to the bone, the fillet
 * lifted; turned, the same again; the bone thrown out. Each fillet: belly
 * bones shaved off, pin bones pulled with the tweezers, skinned with the
 * knife (the user's shop: mid-sized fish are skinned before the saku), then
 * split into back and belly saku. Four saku, all into the case.
 */
function roundFish(o: RoundFish): PrepMaterialLook {
  const root = new Group();
  root.name = o.name;
  const mat = prepMaterial(o.flesh ?? o.neta, [0.22, 0.017, 0.026]);
  const fish = named(new Group(), 'Fish');
  root.add(fish);
  const head = JACK.filter((s) => s.x <= JACK_GILL + 1e-6);
  const body = JACK.filter((s) => s.x >= JACK_GILL - 1e-6);
  const hs = at(JACK, -0.147);
  const headSkin = (p: Vector3, n: Vector3, out: Color) => {
    o.flank(p, n, out).multiplyScalar(p.x > -0.122 && p.x < -0.114 ? 0.72 : p.x < -0.165 ? 0.8 : 1);
  };
  const headGeo = weld([
    paint(shell(head, 0, Math.PI * 2, 28), headSkin),
    patterned(cap(head[head.length - 1], 0, Math.PI * 2, 28, new Vector3(1, 0, 0))),
    [eye(0.0072, new Vector3(0, 1, 0), '#C9B88A'), new Matrix4().makeTranslation(-0.146, hs.t * 1.86, -0.01)],
    [eye(0.0072, new Vector3(0, -1, 0), '#C9B88A'), new Matrix4().makeTranslation(-0.146, hs.t * 0.14, -0.01)],
  ]);
  fish.add(named(new Mesh(headGeo, mat), 'Head'));
  fish.add(named(new Mesh(bodyPiece(body, 0, Math.PI, o.flank), mat), 'FilletTop'));
  fish.add(named(new Mesh(bodyPiece(body, Math.PI, Math.PI * 2, o.flank), mat), 'FilletBottom'));
  // The bone: the frame between the halves, its spine, the fins and the forked tail.
  const frame: Vector3[] = [];
  const fr: number[] = [];
  for (let x = JACK_GILL + 0.002; x <= 0.13; x += 0.012) {
    const s = at(JACK, x);
    frame.push(new Vector3(x, s.t, -s.w * 0.12));
    fr.push(0.0034 * Math.min(1, s.w / 0.03));
  }
  const plateOutline: Array<[number, number]> = [];
  const jx = (i: number) => JACK_GILL + 0.003 + ((0.127 - JACK_GILL - 0.003) * i) / 16;
  for (let i = 0; i <= 16; i++) plateOutline.push([jx(i), at(JACK, jx(i)).w * 0.82]);
  for (let i = 16; i >= 0; i--) plateOutline.push([jx(i), -at(JACK, jx(i)).w * 0.82]);
  const ty = at(JACK, 0.13).t;
  const boneGeo = weld([
    onBonePlane(plate(plateOutline, 0, '#D8BDB2'), JACK),
    paint(taperedTube(frame, fr, 8, 1), (_p, _n, out) => out.set('#E9E3DA')),
    fringe(JACK, -1, -0.085, 0.118, 0.016, o.fins[0]),
    fringe(JACK, 1, -0.01, 0.118, 0.013, o.fins[1]),
    plate(
      [
        [0.126, -0.008],
        [0.165, -0.034],
        [0.187, -0.046],
        [0.176, -0.012],
        [0.16, 0],
        [0.176, 0.012],
        [0.187, 0.046],
        [0.165, 0.034],
        [0.126, 0.008],
      ],
      ty,
      o.fins[2],
    ),
  ]);
  fish.add(named(new Mesh(boneGeo, mat), 'Bone'));
  const gs = at(JACK, -0.075);
  const guts = new SphereGeometry(1, 12, 8).scale(0.03, 0.011, 0.013);
  const gutsGeo = paint(guts, (p, _n, out) => out.set(p.x > 0.012 ? '#B79A4E' : '#6E2A23'));
  fish.add(named(new Mesh(gutsGeo, mat), 'Guts', false));
  fish.children[fish.children.length - 1].position.set(-0.075, gs.t, gs.w * 0.82);
  fish.add(named(new Mesh(shell(body, 0, Math.PI, 14, 0.0012), scalesMaterial()), 'ScalesTop'));
  fish.add(named(new Mesh(shell(body, Math.PI, Math.PI * 2, 14, 0.0012), scalesMaterial()), 'ScalesBottom'));
  // The two fillets as they will lie, flesh up, left of the fish.
  const materials: Partial<Record<NetaId, Material>> = { [o.neta]: mat };
  const skinOf = (sign: 1 | -1) => (u: number, out: Color) => o.skin(sign * u, out);
  const W = 0.026;
  const A: FilletSpec = {
    id: 'A', cx: -0.27, cz: -0.035, L: 0.22, tail: 0.5, skin: skinOf(-1), pins: 4, bones: { side: -1, L: 0.075, W: 0.009 },
    saku: [
      { name: 'A1', neta: o.neta, W, H: 0.017, side: 1, skinOut: true },
      { name: 'A2', neta: o.neta, W, H: 0.015, side: -1, skinOut: true },
    ],
  };
  const B: FilletSpec = {
    id: 'B', cx: -0.27, cz: 0.045, L: 0.22, tail: 0.5, skin: skinOf(1), pins: 4, bones: { side: 1, L: 0.075, W: 0.009 },
    saku: [
      { name: 'B1', neta: o.neta, W, H: 0.017, side: -1, skinOut: true },
      { name: 'B2', neta: o.neta, W, H: 0.015, side: 1, skinOut: true },
    ],
  };
  filletParts(root, A, materials);
  filletParts(root, B, materials);
  const T = 2 * 0.024;
  const steps: PrepStep[] = [
    // At the sink (水洗い): head on the chef's left, belly toward the chef.
    { kind: 'scale', part: 'ScalesTop', say: 'Scaler: scrape tail to head', sink: true },
    // Rolled over on its length (the head stays left for its cut; the belly is away a moment).
    { kind: 'turn', at: new Vector3(0.07, T, 0), lie: 'over', say: 'Turn it over', sink: true },
    { kind: 'scale', part: 'ScalesBottom', say: 'And the other side', sink: true },
    { kind: 'cut', axis: 'z', at: JACK_GILL, mid: 0, len: 0.13, shift: [['Head', -0.03, 0]], scrap: ['Head'], say: 'Off with the head', sink: true },
    // Turned round, the belly toward the chef again (the owner: a fish is worked belly toward you): the gill end at +X.
    { kind: 'turn', at: new Vector3(0.03, T, 0), lie: 'endOver', say: 'Turn it round: belly toward you', sink: true },
    { kind: 'cut', axis: 'x', at: 0.045, mid: 0.07, len: 0.08, show: ['Guts'], say: 'Open the belly', sink: true },
    {
      kind: 'pull', netaAt: new Vector3(-0.05, T, 0), riceAt: new Vector3(0.075, gs.t, 0.05), parts: ['Guts'],
      shift: [['Guts', 0, 0.025]], scrap: ['Guts'], say: 'Pull the guts out', sink: true,
    },
    { kind: 'rinse', at: new Vector3(0.075, gs.t, 0.045), say: 'Wash it under the tap', sink: true },
    // On the board (三枚おろし): turned over end over end, head right (the board mirrors it), belly toward the chef.
    { kind: 'turn', at: new Vector3(0.03, T, 0), lie: 'up', say: 'Turn it over: belly toward you' },
    { kind: 'cut', axis: 'x', at: 0.036, mid: 0.005, len: 0.2, say: 'Along the belly, to the bone' },
    { kind: 'cut', axis: 'x', at: -0.036, mid: 0.005, len: 0.21, say: 'Along the back, to the bone' },
    {
      kind: 'pull', netaAt: new Vector3(0.09, 0.03, 0), riceAt: new Vector3(-0.05, T, 0.012), parts: ['FilletTop'],
      hide: ['FilletTop'], show: filletNames(A), say: 'Lift the fillet off',
    },
    // End over end: head left now, the belly still toward the chef.
    { kind: 'turn', at: new Vector3(0.03, 0.03, 0), lie: 'endOver', say: 'Turn it over: belly toward you' },
    { kind: 'cut', axis: 'x', at: 0.036, mid: -0.005, len: 0.2, say: 'Along the belly, to the bone' },
    { kind: 'cut', axis: 'x', at: -0.036, mid: -0.005, len: 0.21, say: 'Along the back, to the bone' },
    {
      kind: 'pull', netaAt: new Vector3(-0.09, 0.02, 0), riceAt: new Vector3(0.05, T, 0.012), parts: ['FilletBottom'],
      hide: ['FilletBottom'], show: filletNames(B), scrap: ['Bone'], say: 'Lift it off the bone',
    },
    // Each fillet: belly bones, pin bones; then skin, back and belly (cured whole, the skin stays on).
    bonesStep(A),
    bonesStep(B),
    pinsStep(A),
    pinsStep(B),
    ...(o.cure ? [] : [skinStep(A), skinStep(B), splitStep(A, 'Split into back and belly'), splitStep(B, 'Split into back and belly'), DRY_STEP]),
  ];
  return {
    root,
    length: 0.36,
    halfWidth: 0.07,
    top: T,
    alongX: true,
    boardAt: [0.14, 0.065],
    pileAt: [0.3, 0.15],
    turnable: { group: fish, thickness: T },
    steps,
    products: o.cure
      ? [{ parts: ['A1', 'A2', 'SkinA', 'B1', 'B2', 'SkinB'], neta: o.neta, dest: 'cure' as const }]
      : ['A1', 'A2', 'B1', 'B2'].map((p) => ({ parts: [p], neta: o.neta, dest: 'case' as const })),
  };
}

/** A whole striped jack: four skinned saku, into the case. */
export function stripedJack(): PrepMaterialLook {
  return roundFish({ name: 'StripedJack', neta: 'StripedJack', skin: jackSkin, flank: jackFlank, fins: ['#C9B66C', '#CDB972', '#D2B957'] });
}

/**
 * A whole saba (the full difficulty, the owner's shop): washed and filleted
 * like the jack, belly and pin bones out, the two fillets kept whole with
 * their skin (peeled by hand when served) and laid in the drainboard's tray
 * to be salted 2-3 hours, then vinegared 30 minutes (src/cure-system.ts).
 */
export function wholeSaba(): PrepMaterialLook {
  return roundFish({ name: 'Saba', neta: 'CuredMackerel', flesh: 'Yellowtail', skin: sabaSkin, flank: sabaFlank, fins: ['#4A5C63', '#8A989C', '#3F5058'], cure: true });
}

/**
 * A whole aji (the full difficulty, the owner's shop): washed and filleted
 * like the jack (三枚おろし), belly and pin bones out, the two fillets with
 * their skin laid in a tray and salted 3 minutes, the salt rinsed off, then
 * into the case (src/cure-system.ts).
 */
export function wholeAji(): PrepMaterialLook {
  return shrink(roundFish({ name: 'Aji', neta: 'HorseMackerel', skin: ajiSkin, flank: ajiFlank, fins: ['#7C8A72', '#C8CDBE', '#8E9A6E'], cure: true }), AJI_SCALE);
}

/**
 * The aji beside the striped jack (the owner): about a third of its weight
 * (a jack of 1.2-1.5 kg, an aji of 400-500 g), so about 0.69 of its length.
 */
const AJI_SCALE = Math.cbrt(0.33);

/** A look made smaller all through: its meshes, where its parts lie, and every point and line of its steps. */
function shrink(look: PrepMaterialLook, k: number): PrepMaterialLook {
  look.root.traverse((o) => {
    if (o === look.root) return;
    o.position.multiplyScalar(k);
    const mesh = o as Mesh;
    if (mesh.isMesh) mesh.geometry = mesh.geometry.clone().scale(k, k, k);
  });
  for (const s of look.steps) {
    if (s.kind === 'cut') {
      s.at *= k;
      s.mid *= k;
      s.len *= k;
    } else if (s.kind === 'pull') {
      s.netaAt.multiplyScalar(k);
      s.riceAt.multiplyScalar(k);
    } else if (s.kind === 'turn' || s.kind === 'rinse') s.at.multiplyScalar(k);
    for (const sh of s.shift ?? []) {
      sh[1] *= k;
      sh[2] *= k;
      if (sh[3] !== undefined) sh[3] *= k;
    }
  }
  look.length *= k;
  look.halfWidth *= k;
  look.top *= k;
  if (look.turnable) look.turnable.thickness *= k;
  return look;
}

interface RoundFish {
  name: string;
  neta: NetaId;
  /** The skin across the flank, u -1 back .. +1 belly; and per point on the fish (patterns along it). */
  skin: (u: number, out: Color) => Color;
  flank: (p: Vector3, n: Vector3, out: Color) => Color;
  /** The back fin, the belly fin, the tail. */
  fins: [string, string, string];
  /** Its fillets go to be cured whole (skin on) instead of into saku. */
  cure?: boolean;
  /** Its raw flesh, when unlike the case item's (the saba's is cured there). */
  flesh?: NetaId;
}

const sabaBack = new Color('#2D5866');
const sabaBand = new Color('#14262D');
const sabaSide = new Color('#9DB2B8');
const sabaBelly = new Color('#E6EBEC');
/** The saba's skin: blue-green back, silver flank, white belly. */
function sabaSkin(u: number, out: Color): Color {
  if (u < -0.2) return out.copy(sabaBack);
  if (u < 0.15) return out.copy(sabaBack).lerp(sabaSide, (u + 0.2) / 0.35);
  return out.copy(sabaSide).lerp(sabaBelly, Math.min(1, (u - 0.15) / 0.3));
}
/** On the fish: the back's dark wavy bands (サバの縞) over the skin. */
const sabaFlank = (p: Vector3, _n: Vector3, out: Color): Color => {
  const u = p.z / Math.max(0.006, at(JACK, p.x).w);
  sabaSkin(u, out);
  if (u < -0.25 && Math.sin(p.x * 260 + Math.sin(p.z * 400) * 1.6 + u * 3) > 0.45) out.lerp(sabaBand, 0.75);
  return out;
};

const ajiBack = new Color('#55706A');
const ajiGold = new Color('#C9C08A');
const ajiSide = new Color('#C3CCCB');
const ajiBelly = new Color('#EEF0EC');
const ajiScute = new Color('#8F9A8C');
/** The aji's skin: grey-green back, a yellowish band, silver flank, white belly. */
function ajiSkin(u: number, out: Color): Color {
  if (u < -0.3) return out.copy(ajiBack);
  if (u < -0.08) return out.copy(ajiBack).lerp(ajiGold, (u + 0.3) / 0.22);
  if (u < 0.2) return out.copy(ajiGold).lerp(ajiSide, (u + 0.08) / 0.28);
  return out.copy(ajiSide).lerp(ajiBelly, Math.min(1, (u - 0.2) / 0.3));
}
/** On the fish: the line of scutes (ぜいご) along the flank's middle, toward the tail. */
const ajiFlank = (p: Vector3, _n: Vector3, out: Color): Color => {
  const u = p.z / Math.max(0.006, at(JACK, p.x).w);
  ajiSkin(u, out);
  if (p.x > 0.02 && Math.abs(u + 0.02) < 0.07 && Math.sin(p.x * 900) > -0.2) out.lerp(ajiScute, 0.7);
  return out;
};

// ---------------------------------------------------------------- a fillet's own steps

/** White fish (the user's shop): filleted, then the moisture off with kitchen paper, and it is ready for the case. */
const DRY_STEP: PrepStep = { kind: 'wipe', say: 'Pat the saku dry with paper' };

/** Belly bones (腹骨) shaved off flat, along their strip. */
function bonesStep(f: FilletSpec): PrepStep {
  const b = f.bones!;
  const sakuW = f.saku.find((s) => s.side === b.side)?.W ?? f.saku[0].W;
  const z = f.cz + b.side * (sakuW - b.W / 2 - 0.004);
  return { kind: 'cut', axis: 'x', at: z, mid: f.cx - f.L / 2 + 0.004 + b.L / 2, len: b.L + 0.02, low: true, scrap: [`Bones${f.id}`], say: 'Shave off the belly bones' };
}
function pinsStep(f: FilletSpec): PrepStep {
  return { kind: 'pins', pins: pins(f.id, f.pins ?? 0), say: 'Tweezers: pull the pin bones' };
}
/** The skin pulled off with the knife (皮引き): flat along the board, under the flesh. */
function skinStep(f: FilletSpec): PrepStep {
  const z = f.cz + f.saku.reduce((sum, s) => sum + (s.side * s.W) / 2, 0);
  return { kind: 'cut', axis: 'x', at: z, mid: f.cx, len: f.L, low: true, scrap: [`Skin${f.id}`], say: 'Skin it with the knife' };
}
/** The cut along its middle line: back from belly, or the engawa off the flounder. */
function splitStep(f: FilletSpec, say: string): PrepStep {
  return { kind: 'cut', axis: 'x', at: f.cz, mid: f.cx, len: f.L, shift: f.saku.map((s): [string, number, number] => [s.name, 0, s.side * 0.007]), say };
}

// ---------------------------------------------------------------- the flounder (hirame), whole

const FLAT: Sta[] = [
  { x: -0.175, w: 0.01, t: 0.004 },
  { x: -0.162, w: 0.03, t: 0.008 },
  { x: -0.145, w: 0.048, t: 0.011 },
  { x: -0.125, w: 0.06, t: 0.013 },
  { x: -0.095, w: 0.072, t: 0.0145 },
  { x: -0.055, w: 0.079, t: 0.0155 },
  { x: -0.01, w: 0.079, t: 0.0155 },
  { x: 0.035, w: 0.072, t: 0.0145 },
  { x: 0.075, w: 0.056, t: 0.012 },
  { x: 0.105, w: 0.034, t: 0.008 },
  { x: 0.122, w: 0.016, t: 0.0055 },
  { x: 0.132, w: 0.011, t: 0.0045 },
];
const FLAT_GILL = -0.125;
const flatTop = new Color('#6A5A44');
const flatDark = new Color('#47392A');
const flatLight = new Color('#8D7B5C');
const flatWhite = new Color('#F3EFE9');
const flatBlush = new Color('#E8D8D2');
/** The eyed side: olive brown, darker blotches and pale rings. */
function flounderTop(p: Vector3, out: Color): Color {
  const s = Math.sin(p.x * 160 + Math.sin(p.z * 120) * 1.4) * Math.sin(p.z * 140 + p.x * 35);
  const r = Math.sin(p.x * 97 + p.z * 61) * Math.sin(p.z * 83 - p.x * 47);
  out.copy(flatTop);
  if (s > 0.5) out.lerp(flatDark, Math.min(1, (s - 0.5) * 3));
  else if (r > 0.65) out.lerp(flatLight, Math.min(1, (r - 0.65) * 2.5));
  return out;
}
function flounderBottom(p: Vector3, out: Color): Color {
  const u = Math.abs(p.z) / Math.max(0.01, at(FLAT, p.x).w);
  return out.copy(flatWhite).lerp(flatBlush, Math.max(0, (u - 0.7) / 0.3));
}
const flounderSide = (p: Vector3, _n: Vector3, out: Color) => (p.y >= at(FLAT, p.x).t ? flounderTop(p, out) : flounderBottom(p, out));

/**
 * A whole flounder (about 1 kg, 36 cm), dark (eyed) side up. Washed at the
 * sink: scaled on both sides, the head off with its guts behind it, rinsed.
 * On the board, dark side up: cut down the middle to the bone and along the
 * fins on both edges, the back and belly fillets lifted; turned, the same on
 * the white side; the bone thrown out: five pieces (五枚おろし). Each
 * fillet is skinned with the knife and its engawa (the fin muscle along its
 * edge) cut off; the belly fillets lose their belly bones first. Four saku
 * and four engawa, all into the case.
 */
export function flounder(): PrepMaterialLook {
  const root = new Group();
  root.name = 'Flounder';
  const mat = prepMaterial('Flounder', [0.2, 0.013, 0.044]);
  const engawa = prepMaterial('Engawa', [0.2, 0.007, 0.011]);
  const fish = named(new Group(), 'Fish');
  root.add(fish);
  const head = FLAT.filter((s) => s.x <= FLAT_GILL + 1e-6);
  const body = FLAT.filter((s) => s.x >= FLAT_GILL - 1e-6);
  const headSkin = (p: Vector3, n: Vector3, out: Color) => {
    flounderSide(p, n, out);
    if (p.x > -0.137 && p.x < -0.13 && p.y > at(FLAT, p.x).t) out.multiplyScalar(0.75);
  };
  const e1 = at(FLAT, -0.152);
  const e2 = at(FLAT, -0.139);
  fish.add(
    named(
      new Mesh(
        weld([
          paint(shell(head, 0, Math.PI * 2, 28), headSkin),
          patterned(cap(head[head.length - 1], 0, Math.PI * 2, 28, new Vector3(1, 0, 0))),
          [eye(0.0058, new Vector3(0, 1, 0), '#D9CBA4'), new Matrix4().makeTranslation(-0.152, e1.t * 1.95, -0.006)],
          [eye(0.0058, new Vector3(0, 1, 0), '#D9CBA4'), new Matrix4().makeTranslation(-0.139, e2.t * 1.95, -0.022)],
        ]),
        mat,
      ),
      'Head',
    ),
  );
  const top = (p: Vector3, _n: Vector3, out: Color) => flounderTop(p, out);
  const bottom = (p: Vector3, _n: Vector3, out: Color) => flounderBottom(p, out);
  fish.add(named(new Mesh(bodyPiece(body, 0, Math.PI / 2, top), mat), 'TopBelly'));
  fish.add(named(new Mesh(bodyPiece(body, Math.PI / 2, Math.PI, top), mat), 'TopBack'));
  fish.add(named(new Mesh(bodyPiece(body, Math.PI, Math.PI * 1.5, bottom), mat), 'BotBack'));
  fish.add(named(new Mesh(bodyPiece(body, Math.PI * 1.5, Math.PI * 2, bottom), mat), 'BotBelly'));
  const outline: Array<[number, number]> = [];
  const fx = (i: number) => FLAT_GILL + 0.003 + ((0.129 - FLAT_GILL - 0.003) * i) / 16;
  for (let i = 0; i <= 16; i++) outline.push([fx(i), at(FLAT, fx(i)).w * 0.86]);
  for (let i = 16; i >= 0; i--) outline.push([fx(i), -at(FLAT, fx(i)).w * 0.86]);
  const spine: Vector3[] = [];
  const sr: number[] = [];
  for (let x = FLAT_GILL + 0.002; x <= 0.132; x += 0.012) {
    spine.push(new Vector3(x, at(FLAT, x).t, 0));
    sr.push(0.0028);
  }
  const fan: Array<[number, number]> = [[0.128, -0.008]];
  for (let i = 0; i <= 8; i++) {
    const a = -0.75 + (1.5 * i) / 8;
    fan.push([0.132 + 0.048 * Math.cos(a), 0.044 * Math.sin(a)]);
  }
  fan.push([0.128, 0.008]);
  const boneGeo = weld([
    onBonePlane(plate(outline, 0, '#DCC6BC'), FLAT),
    paint(taperedTube(spine, sr, 8, 1), (_p, _n, out) => out.set('#ECE6DD')),
    fringe(FLAT, -1, -0.165, 0.124, 0.02, '#6B5B44'),
    fringe(FLAT, 1, -0.112, 0.124, 0.018, '#6B5B44'),
    plate(fan, at(FLAT, 0.132).t, '#5F503C'),
  ]);
  fish.add(named(new Mesh(boneGeo, mat), 'Bone'));
  const gs = at(FLAT, -0.112);
  const gutsGeo = paint(new SphereGeometry(1, 12, 8).scale(0.016, 0.007, 0.018), (p, _n, out) => out.set(p.z > 0.006 ? '#B49A52' : '#6B2A24'));
  const guts = named(new Mesh(gutsGeo, mat), 'Guts', false);
  guts.position.set(-0.114, gs.t, 0.03);
  fish.add(guts);
  fish.add(named(new Mesh(shell(body, 0, Math.PI, 14, 0.001), scalesMaterial()), 'ScalesTop'));
  fish.add(named(new Mesh(shell(body, Math.PI, Math.PI * 2, 14, 0.001), scalesMaterial()), 'ScalesBottom'));
  // The four fillets as they will lie, flesh up, left of the fish: each a saku and its engawa over the skin.
  const materials: Partial<Record<NetaId, Material>> = { Flounder: mat, Engawa: engawa };
  const darkSkin = (u: number, out: Color) => flounderTop(tmpA.set(u * 0.3, 0, u * 0.05), out);
  const whiteSkin = (_u: number, out: Color) => out.copy(flatWhite);
  const spec = (id: string, cx: number, near: boolean, skin: (u: number, out: Color) => void, bones: boolean): FilletSpec => ({
    id, cx, cz: near ? 0.0615 : -0.0465, L: 0.2, tail: 0.45, skin,
    bones: bones ? { side: near ? -1 : 1, L: 0.05, W: 0.008 } : undefined,
    saku: [
      { name: id, neta: 'Flounder', W: 0.044, H: 0.013, side: near ? -1 : 1, skinOut: false },
      { name: `E${id.slice(1)}`, neta: 'Engawa', W: 0.011, H: 0.0075, side: near ? 1 : -1, skinOut: true },
    ],
  });
  const F = [spec('F1', -0.5, false, darkSkin, false), spec('F2', -0.5, true, darkSkin, true), spec('F3', -0.27, false, whiteSkin, false), spec('F4', -0.27, true, whiteSkin, true)];
  for (const f of F) filletParts(root, f, materials);
  const T = 2 * 0.0155;
  const steps: PrepStep[] = [
    // At the sink (水洗い).
    { kind: 'scale', part: 'ScalesTop', say: 'Scaler: scrape tail to head', sink: true },
    // Rolled over on its length (the head stays left for its cut; the belly is away a moment).
    { kind: 'turn', at: new Vector3(0.08, T, 0), lie: 'over', say: 'Turn it over', sink: true },
    { kind: 'scale', part: 'ScalesBottom', say: 'And the white side', sink: true },
    { kind: 'cut', axis: 'z', at: FLAT_GILL, mid: 0, len: 0.16, shift: [['Head', -0.03, 0]], scrap: ['Head'], show: ['Guts'], say: 'Off with the head', sink: true },
    // Turned round, the belly toward the chef again: the gill end at +X.
    { kind: 'turn', at: new Vector3(0.03, T, 0), lie: 'endOver', say: 'Turn it round: belly toward you', sink: true },
    {
      kind: 'pull', netaAt: new Vector3(-0.05, T, 0), riceAt: new Vector3(0.114, gs.t, 0.03), parts: ['Guts'],
      shift: [['Guts', 0.02, 0]], scrap: ['Guts'], say: 'Pull the guts out', sink: true,
    },
    { kind: 'rinse', at: new Vector3(0.11, gs.t, 0.02), say: 'Wash it under the tap', sink: true },
    // On the board (五枚おろし): end over end, dark side up, head right (the board mirrors it), belly toward the chef.
    { kind: 'turn', at: new Vector3(0.03, T, 0), lie: 'up', say: 'Dark side up: belly toward you' },
    { kind: 'cut', axis: 'x', at: 0, mid: 0.005, len: 0.24, say: 'Down the middle, to the bone' },
    { kind: 'cut', axis: 'x', at: -0.066, mid: 0, len: 0.22, say: 'Along the fins' },
    { kind: 'cut', axis: 'x', at: 0.064, mid: 0.01, len: 0.2, say: 'Along the fins' },
    {
      kind: 'pull', netaAt: new Vector3(0.07, T, 0.035), riceAt: new Vector3(-0.03, T, -0.035), parts: ['TopBack'],
      hide: ['TopBack'], show: filletNames(F[0]), say: 'Lift the back fillet off',
    },
    {
      kind: 'pull', netaAt: new Vector3(0.08, 0.016, -0.02), riceAt: new Vector3(-0.03, T, 0.035), parts: ['TopBelly'],
      hide: ['TopBelly'], show: filletNames(F[1]), say: 'And the belly fillet',
    },
    // End over end: white side up, head left now, the belly still toward the chef (the back at -Z).
    { kind: 'turn', at: new Vector3(0.03, 0.016, 0), lie: 'endOver', say: 'Turn it over: belly toward you' },
    { kind: 'cut', axis: 'x', at: 0, mid: -0.005, len: 0.24, say: 'Down the middle, to the bone' },
    { kind: 'cut', axis: 'x', at: -0.066, mid: 0, len: 0.22, say: 'Along the fins' },
    { kind: 'cut', axis: 'x', at: 0.064, mid: -0.01, len: 0.2, say: 'Along the fins' },
    {
      kind: 'pull', netaAt: new Vector3(-0.07, 0.016, 0.035), riceAt: new Vector3(0.03, T, -0.035), parts: ['BotBack'],
      hide: ['BotBack'], show: filletNames(F[2]), say: 'Lift the back fillet off',
    },
    {
      kind: 'pull', netaAt: new Vector3(-0.08, 0.012, -0.02), riceAt: new Vector3(0.03, T, 0.035), parts: ['BotBelly'],
      hide: ['BotBelly'], show: filletNames(F[3]), scrap: ['Bone'], say: 'And the belly fillet: off the bone',
    },
    bonesStep(F[1]),
    bonesStep(F[3]),
    ...F.map(skinStep),
    ...F.map((f) => splitStep(f, 'Cut the engawa off')),
    DRY_STEP,
  ];
  return {
    root,
    length: 0.36,
    halfWidth: 0.1,
    top: T,
    alongX: true,
    boardAt: [0.14, 0.065],
    pileAt: [0.3, 0.15],
    turnable: { group: fish, thickness: T },
    steps,
    products: F.flatMap((f) => [
      { parts: [f.id], neta: 'Flounder' as const, dest: 'case' as const },
      { parts: [`E${f.id.slice(1)}`], neta: 'Engawa' as const, dest: 'case' as const },
    ]),
  };
}

// ---------------------------------------------------------------- the hamachi half

const hamaBack = new Color('#5E7A86');
const hamaBand = new Color('#D3B651');
const hamaBelly = new Color('#DCE2E4');
function hamachiSkin(u: number, out: Color): Color {
  if (u < -0.3) return out.copy(hamaBack);
  if (u < 0.05) return out.copy(hamaBack).lerp(hamaBand, (u + 0.3) / 0.35);
  return out.copy(hamaBand).lerp(hamaBelly, Math.min(1, (u - 0.05) / 0.25));
}

const wrapPaper = new MeshStandardMaterial({ color: '#F3EFE6', roughness: 0.95 });
const wrapPlastic = new MeshStandardMaterial({ color: '#E4EEF3', roughness: 0.08, transparent: true, opacity: 0.34, depthWrite: false });

/**
 * A hamachi half (半身), skin down, as the fish shop cuts it: big fish are
 * bought as only what the case takes (the user's shop; its size follows the
 * season later, big in winter and semi-big in summer). Unwrapped, its belly
 * bones are shaved off, its pin bones pulled, its skin taken off with the
 * knife, then it is split along the blood line into the back and belly saku.
 */
export function hamachiHalf(): PrepMaterialLook {
  const root = new Group();
  root.name = 'HamachiHalf';
  const mat = prepMaterial('Yellowtail', [0.32, 0.03, 0.05]);
  const f: FilletSpec = {
    id: '', cx: 0, cz: 0, L: 0.32, tail: 0.4, skin: hamachiSkin, pins: 5, bones: { side: 1, L: 0.1, W: 0.012 },
    saku: [
      { name: 'Back', neta: 'Yellowtail', W: 0.05, H: 0.03, side: -1, skinOut: false },
      { name: 'Belly', neta: 'Yellowtail', W: 0.047, H: 0.022, side: 1, skinOut: false },
    ],
  };
  filletParts(root, f, { Yellowtail: mat });
  root.traverse((o) => (o.visible = true));
  const top = 0.0024 + 0.03;
  const L = 0.32;
  const W = 0.1;
  const paper = named(new Mesh(roundedBlock(L + 0.012, top + 0.008, W + 0.012, 0.006), wrapPaper), 'Paper');
  paper.position.x = -(L + 0.012) / 2;
  const plastic = named(new Mesh(roundedBlock(L + 0.03, top + 0.018, W + 0.026, 0.01), wrapPlastic), 'Plastic');
  plastic.position.x = -(L + 0.03) / 2;
  root.add(paper, plastic);
  return {
    root,
    length: L,
    halfWidth: 0.055,
    top,
    alongX: true,
    boardAt: [0.14, 0.065],
    pileAt: [-0.27, 0.13],
    steps: [
      { kind: 'pull', netaAt: new Vector3(-0.05, top + 0.012, 0), riceAt: new Vector3(L / 2 + 0.012, top * 0.6, 0), parts: ['Plastic'], scrap: ['Plastic'], say: 'Off with the bag' },
      { kind: 'pull', netaAt: new Vector3(-0.05, top + 0.008, 0), riceAt: new Vector3(L / 2 + 0.004, top * 0.6, 0), parts: ['Paper'], scrap: ['Paper'], say: 'Unwrap the paper' },
      bonesStep(f),
      pinsStep(f),
      skinStep(f),
      splitStep(f, 'Split along the blood line: back and belly'),
      DRY_STEP,
    ],
    products: [
      { parts: ['Back'], neta: 'Yellowtail', dest: 'case' },
      { parts: ['Belly'], neta: 'Yellowtail', dest: 'case' },
    ],
  };
}

// ---------------------------------------------------------------- the sink's things (stage 4)

const cypress = new MeshStandardMaterial({ color: '#E2D2AE', roughness: 0.75 });
const styrofoam = new MeshStandardMaterial({ color: '#F3F3F0', roughness: 0.92 });
const ice = new MeshStandardMaterial({ color: '#E3EEF3', roughness: 0.3, metalness: 0.05 });
const steel = new MeshStandardMaterial({ color: '#C9CDD2', roughness: 0.3, metalness: 0.8 });
const darkWood = new MeshStandardMaterial({ color: '#6B4A2E', roughness: 0.6 });
const lightWood = new MeshStandardMaterial({ color: '#C8A36E', roughness: 0.6 });
const horn = new MeshStandardMaterial({ color: '#1E1B19', roughness: 0.4 });
const water = new MeshStandardMaterial({ color: '#BFE3F2', roughness: 0.05, transparent: true, opacity: 0.5, depthWrite: false });

export function box(w: number, h: number, d: number, material: Material, name: string, x = 0, y = h / 2, z = 0): Mesh {
  const m = named(new Mesh(roundedBlock(w, h, d, Math.min(0.004, h / 3, d / 3)), material), name);
  m.position.set(x - w / 2, y - h / 2, z);
  return m;
}

/** The wash board (水洗い用のまな板), laid across the basin's front: origin at its bottom middle. */
export function createWashBoard(width: number, depth: number, thickness: number): Group {
  const root = named(new Group(), 'WashBoard');
  root.add(box(width, thickness, depth, cypress, 'Board'));
  return root;
}

/** The fish shop's long styrofoam box of whole fish on ice: origin at its bottom middle. */
export function createFishBox(width: number, depth: number, height: number, iceTop: number): Group {
  const root = named(new Group(), 'FishBox');
  const wall = 0.02;
  root.add(
    box(width, wall, depth, styrofoam, 'Floor', 0, wall / 2),
    box(width, height, wall, styrofoam, 'WallNear', 0, height / 2, -depth / 2 + wall / 2),
    box(width, height, wall, styrofoam, 'WallFar', 0, height / 2, depth / 2 - wall / 2),
    box(wall, height, depth - 2 * wall, styrofoam, 'WallLeft', -width / 2 + wall / 2, height / 2),
    box(wall, height, depth - 2 * wall, styrofoam, 'WallRight', width / 2 - wall / 2, height / 2),
  );
  const bed = paint(roundedBlock(width - 2 * wall, iceTop - wall, depth - 2 * wall, 0.004), (p, _n, out) =>
    out.set('#E6F0F4').multiplyScalar(0.94 + 0.06 * Math.sin(p.x * 300) * Math.sin(p.z * 260)),
  );
  const iceBed = named(new Mesh(bed, ice), 'Ice');
  iceBed.position.set(-(width - 2 * wall) / 2, wall, 0);
  root.add(iceBed);
  return root;
}

/** The scaler (鱗取り): origin at its grip, the toothed head along -Z, the handle behind (+Z). */
export function createScaler(): Group {
  const root = named(new Group(), 'Scaler');
  const handle = named(new Mesh(new CylinderGeometry(0.009, 0.01, 0.1, 10, 1), lightWood), 'Handle');
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, 0.01, 0.055);
  const head = named(new Mesh(roundedBlock(0.06, 0.012, 0.034, 0.003), steel), 'Head');
  head.rotation.y = Math.PI / 2;
  head.position.set(0, 0.004, 0.0);
  root.add(handle, head);
  for (let i = 0; i < 6; i++) {
    const tooth = new Mesh(roundedBlock(0.003, 0.006, 0.032, 0.0008), steel);
    tooth.position.set(-0.0015, 0.0, -0.008 - i * 0.009);
    root.add(tooth);
  }
  return root;
}

/** The deba (出刃包丁), like the board's knife: origin at the bolster, the blade along +X, lying flat. */
export function createDeba(): Group {
  const root = named(new Group(), 'Deba');
  const outline = new Shape();
  outline.moveTo(0, -0.024);
  outline.lineTo(0.15, -0.024);
  outline.quadraticCurveTo(0.168, -0.022, 0.172, -0.014);
  outline.quadraticCurveTo(0.13, 0.012, 0.0, 0.024);
  outline.lineTo(0, -0.024);
  const blade = new ExtrudeGeometry(outline, { depth: 0.005, bevelEnabled: false });
  blade.rotateX(-Math.PI / 2);
  root.add(named(new Mesh(blade, steel), 'Blade'));
  const handle = named(new Mesh(new CylinderGeometry(0.012, 0.014, 0.12, 10, 1), darkWood), 'Handle');
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-0.07, 0.006, 0.0);
  const bolster = named(new Mesh(new CylinderGeometry(0.013, 0.013, 0.012, 10, 1), horn), 'Bolster');
  bolster.rotation.z = Math.PI / 2;
  bolster.position.set(-0.006, 0.006, 0);
  root.add(handle, bolster);
  return root;
}

/** The tweezers (骨抜き): origin at the tips, the two arms back along -X. */
export function createTweezers(): Group {
  const root = named(new Group(), 'Tweezers');
  for (const s of [-1, 1]) {
    const arm = new Mesh(roundedBlock(0.11, 0.004, 0.006, 0.001), steel);
    arm.position.set(-0.11, 0.002, s * 0.004);
    arm.rotation.y = s * 0.035;
    root.add(arm);
  }
  return root;
}

/** The tap's water: a thin column from the spout down, origin at its top. */
export function createWaterStream(length: number): Mesh {
  const g = new CylinderGeometry(0.004, 0.005, length, 8, 1);
  g.translate(0, -length / 2, 0);
  return named(new Mesh(g, water), 'TapWater');
}
