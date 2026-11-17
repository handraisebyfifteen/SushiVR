import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Euler,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { prepMaterial } from './neta-look.js';
import { paint, patterned, taperedTube, weld } from './neta-paint.js';
import { at, box, cap, eye, named, plate, scalesMaterial, shell, type Sta } from './fillet-look.js';
import type { PrepMaterialLook, PrepStep } from './prep-look.js';

/**
 * The full difficulty's curing (締め), the owner's shop: kohada and saba
 * salted in stainless trays (バット), rinsed, then soaked in vinegar in
 * enamel containers kept for it, on the drainboard beside the sink, on the
 * day.
 *
 * The kohada, the owner's way: eight small whole fish, loose on the wash
 * board (not laid out in rows), and a bowl of ice beside them. Many of the
 * same fish are done a stage at a time, each fish on its own (a sushi bar's
 * small space): each fish to the middle, head left and belly toward the
 * chef, its head cut off, and onto the ice; once every head is off, each
 * from the ice, its dorsal fin cut off, its belly cut off, then the guts
 * out with the knife's tip (the owner: a kohada is not slit); then all washed and back
 * on the ice. On the board the same: every fish opened from the belly
 * (腹開き), then every backbone shaved out; eight, one a piece (丸づけ). Then
 * the eight go to their tray together. Runtime meshes (src/prep-cut-system.ts,
 * src/cure-system.ts); the whole-fish-preview asset shows them.
 */

/** A kohada about 12 cm long (scaled by the day's size), lying on its side, bottom at y = 0. */
const KOHADA: Sta[] = [
  { x: -0.06, w: 0.003, t: 0.002 },
  { x: -0.053, w: 0.009, t: 0.0042 },
  { x: -0.042, w: 0.0145, t: 0.0056 },
  { x: -0.026, w: 0.0185, t: 0.0066 },
  { x: -0.004, w: 0.02, t: 0.0069 },
  { x: 0.018, w: 0.017, t: 0.006 },
  { x: 0.036, w: 0.0115, t: 0.0042 },
  { x: 0.049, w: 0.0065, t: 0.0026 },
  { x: 0.055, w: 0.004, t: 0.002 },
];
/** The head comes off behind the gill (and the dark spot there). */
const GILL = -0.036;
export const KOHADA_FISH = 8;

// Root-local places (a fish by its origin, its middle when whole): every fish lies head left, belly toward the chef
// (+Z); the owner: fish are laid head left (a left-handed chef's the other way).
/** Where each fish is worked, one at a time: the middle, toward the chef. */
const SPOT = new Vector3(0, 0, 0.03);
/** The bowl of ice on the left; the fish lie on the ice. */
const BOWL_X = -0.165;
const ICE_TOP = 0.03;
/** The whole fish, loose on the right (a few over the others); later the gutted ones, and on the board the opened ones. */
const heapAt = (i: number, s: number): Vector3 => new Vector3(0.13 + (i >= 4 ? 0.02 : 0), i >= 4 ? 0.011 * s : 0, -0.075 + (i % 4) * 0.05 + (i >= 4 ? 0.02 : 0));
const iceAt = (i: number): Vector3 => new Vector3(BOWL_X - 0.0125 + ((((i * 37) % 5) - 2) * 0.004), ICE_TOP + (i >> 2) * 0.009 + (i % 4) * 0.0015, -0.033 + (i % 4) * 0.022);
/** Cut-off heads, bellies (with the guts) and dorsal fins, pushed behind the work (heads and fins by their fish's origin). */
const headAt = (i: number): Vector3 => new Vector3(-0.02 + (i % 4) * 0.009, 0, -0.098 + (i >> 2) * 0.012);
/** Where each fish's guts go once they are out (a small heap behind the bellies). */
const innardsAt = (i: number, s: number): Vector3 => new Vector3(0.012 + (i % 4) * 0.006, 0.004 * s + (i >> 2) * 0.004, -0.112 + (i >> 2) * 0.009 + (i % 4) * 0.002);
const gutAt = (i: number, s: number): Vector3 => new Vector3(0.035 + (i % 4) * 0.005, 0.0055 * s + (i % 4) * 0.0012 + (i >> 2) * 0.004, -0.1 + (i >> 2) * 0.011 + (i % 4) * 0.003);
const finAt = (i: number): Vector3 => new Vector3(0.085 + (i % 4) * 0.006, -0.0057 + i * 0.0004, -0.074 + (i >> 2) * 0.008);

/** The belly's cut (the owner: cut off, the guts with it): from behind the gill, slanting out to the belly edge before the vent. */
const bellyCut = (x: number): number => 0.0105 + Math.max(0, x - 0.002) * 0.6;
/** Where the belly's cut comes out at the edge (fish-local x). */
const BELLY_END = 0.013;
/** The dorsal fin's outline: along the back (x) and out from its edge; its last ray runs on as a thread (the kohada's). */
const DORSAL: ReadonlyArray<[number, number]> = [[-0.013, -0.0015], [-0.0122, 0.0035], [-0.009, 0.0068], [-0.003, 0.0074], [0.005, 0.006], [0.016, 0.0052], [0.027, 0.005], [0.027, 0.0043], [0.012, 0.001], [0.012, -0.0015]];
const finColor = '#6F7C84';
const cavity = new Color('#9C6F68');

/** Clamps a whole fish's skin to the belly's cut (each vertex past it onto the flat cut face). */
function cutBelly(g: BufferGeometry): BufferGeometry {
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k);
    if (x < BELLY_END + 0.002 && p.getZ(k) > bellyCut(x)) p.setZ(k, bellyCut(x));
  }
  g.computeVertexNormals();
  return g;
}

/** The guts (taken out after the belly: the owner): a small dark red-brown knot; middle at the origin. */
function gutsPiece(): BufferGeometry {
  return paint(new SphereGeometry(1, 10, 6).scale(0.013, 0.0042, 0.0035), (q, _n, out) => out.set(0.42 + q.y * 20, 0.2, 0.17));
}

/** The cut belly: a sliver between the cut and the belly edge, its skin silver-white, the cut side flesh; middle at the origin. */
function bellyPiece(): BufferGeometry {
  const st: Sta[] = [];
  for (let k = 0; k <= 6; k++) {
    const x = GILL + ((BELLY_END - GILL) * k) / 6;
    const s = at(KOHADA, x);
    st.push({ x, w: Math.max(0.0004, (s.w - bellyCut(x)) / 2), t: s.t * 0.85 });
  }
  const g = weld([shell(st, 0, Math.PI * 2, 12), cap(st[0], 0, Math.PI * 2, 12, new Vector3(-1, 0, 0))]);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = Math.min(BELLY_END, Math.max(GILL, p.getX(k)));
    p.setZ(k, p.getZ(k) + (at(KOHADA, x).w + bellyCut(x)) / 2);
  }
  g.computeVertexNormals();
  const piece = paint(g, (q, _n, out) => {
    const x = Math.min(BELLY_END, Math.max(GILL, q.x));
    const mid = (at(KOHADA, x).w + bellyCut(x)) / 2;
    out.copy(q.z < mid - 0.0008 ? fleshPink : kBelly);
  });
  const c = at(KOHADA, (GILL + BELLY_END) / 2);
  return piece.translate(-(GILL + BELLY_END) / 2, -c.t * 0.85, -(c.w + bellyCut(c.x)) / 2);
}
/** On the board: opened (backbone still in) in a row, overlapping, on the right; done the same on the left (the owner lays them so, as on the basket). */
const openedAt = (i: number): Vector3 => new Vector3(0.143, i * 0.0009, -0.08 + i * 0.02);
const doneAt = (i: number): Vector3 => new Vector3(-0.17, i * 0.0009, -0.08 + i * 0.02);

const kBack = new Color('#4C6573');
const kDot = new Color('#1E2A31');
const kSide = new Color('#C3CED4');
const kBelly = new Color('#EEF1F2');
/** Rows of small dark dots along the blue back, a silver side and a white belly; the black spot behind the gill. */
function kohadaSkin(p: Vector3, _n: Vector3, out: Color): Color {
  const u = p.z / Math.max(0.003, at(KOHADA, p.x).w);
  if (u < -0.35) {
    out.copy(kBack);
    if (Math.sin(p.x * 1500) > 0.55 && Math.abs(Math.sin(u * 9)) > 0.6) out.lerp(kDot, 0.8);
  } else if (u < 0.2) out.copy(kBack).lerp(kSide, Math.min(1, (u + 0.35) / 0.3));
  else out.copy(kSide).lerp(kBelly, Math.min(1, (u - 0.2) / 0.4));
  if (Math.hypot(p.x - (GILL + 0.006), p.z + 0.006) < 0.0035) out.copy(kDot);
  return out;
}

/** An opened kohada's half-width along it (from the cut head end): widest a third along, narrowing to the tail. */
const OPEN_HALF: ReadonlyArray<[number, number]> = [[0, 0.021], [0.1, 0.025], [0.3, 0.027], [0.55, 0.023], [0.75, 0.015], [0.9, 0.008], [1, 0.0095]];
export const OPEN_THICKNESS = 0.003;
const fleshPink = new Color('#E9D6C9');
const boneLine = new Color('#CDAE9F');
const kSilver = new Color('#CBD5D9');
const kBand = new Color('#2F414B');
/**
 * A kohada opened from the belly (腹開き), L long from its cut head end (the
 * origin) toward +X, lying flat from y = 0 to OPEN_THICKNESS: the flesh on
 * top (pale pink, the backbone's line down the middle), the skin beneath
 * (silver, the dark blue back down the middle with its rows of dots, as it
 * shows once laid skin up).
 */
function openedKohada(L: number): BufferGeometry {
  const half = (u: number): number => {
    let k = 0;
    while (k < OPEN_HALF.length - 2 && u > OPEN_HALF[k + 1][0]) k++;
    const [u0, w0] = OPEN_HALF[k];
    const [u1, w1] = OPEN_HALF[k + 1];
    return w0 + ((w1 - w0) * (u - u0)) / (u1 - u0);
  };
  const face = (up: boolean): BufferGeometry => {
    const g = new PlaneGeometry(1, 1, 16, 10).rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const u = p.getX(k) + 0.5;
      p.setXYZ(k, u * L, up ? OPEN_THICKNESS : 0, p.getZ(k) * 2 * half(u));
    }
    g.computeVertexNormals();
    return g;
  };
  return paint(weld([face(true), face(false)]), (p, n, out) => {
    const across = Math.abs(p.z) / Math.max(0.004, half(p.x / L));
    if (n.y > 0) {
      out.copy(fleshPink);
      if (across < 0.12) out.lerp(boneLine, 0.6);
      return;
    }
    out.copy(kSilver);
    if (across < 0.22) out.copy(kBand);
    else if (across < 0.5) {
      out.copy(kBand).lerp(kSilver, (across - 0.22) / 0.28);
      if (Math.sin(p.x * 1400) > 0.5 && Math.sin(across * 40) > 0.3) out.lerp(kDot, 0.7);
    }
  });
}

function translated(g: BufferGeometry, p: Vector3, scale: number): [BufferGeometry, Matrix4] {
  return [g, new Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new Matrix4().makeScale(scale, scale, scale))];
}

const bowlSteel = new MeshStandardMaterial({ color: '#C8CDD1', metalness: 0.65, roughness: 0.3, side: DoubleSide });
const iceMaterial = new MeshStandardMaterial({ color: '#E2F0F6', roughness: 0.12, transparent: true, opacity: 0.88 });

/** A steel bowl heaped with crushed ice, its foot at y = 0, its middle at the origin. */
function iceBowl(): Group {
  const g = new Group();
  const profile = [new Vector2(0.001, 0), new Vector2(0.045, 0), new Vector2(0.06, 0.014), new Vector2(0.068, 0.038), new Vector2(0.071, 0.056), new Vector2(0.075, 0.058)];
  g.add(new Mesh(new LatheGeometry(profile, 28), bowlSteel));
  const chunks: Array<[BufferGeometry, Matrix4]> = [];
  const cube = new BoxGeometry(1, 1, 1);
  let seed = 11;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed % 10000) / 10000;
  };
  for (let k = 0; k < 46; k++) {
    const y = 0.006 + rnd() * (ICE_TOP - 0.01);
    const r = (0.045 + (0.022 * y) / 0.04) * Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    const size = 0.009 + rnd() * 0.008;
    const m = new Matrix4().compose(
      new Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
      new Quaternion().setFromEuler(new Euler(rnd() * 3, rnd() * 3, rnd() * 3)),
      new Vector3(size, size * 0.8, size),
    );
    chunks.push([cube, m]);
  }
  g.add(new Mesh(weld(chunks), iceMaterial));
  return g;
}

/**
 * Eight whole kohada (the day's size: 0.92 small, 1 middling, 1.08 large)
 * and the bowl of ice, with their steps: at the sink the scales off, every
 * head (each fish to the middle, then onto the ice), every dorsal fin and
 * belly cut off (the guts with it), all washed and back on the ice; on the
 * board every fish opened,
 * then every backbone out. The opened eight go to the kohada's tray
 * together.
 */
export function kohadaRow(size = 1): PrepMaterialLook {
  const root = new Group();
  root.name = 'Kohada';
  const mat = prepMaterial('Kohada', [0.085, 0.0035, 0.036]);
  const s = size;
  const head = KOHADA.filter((st) => st.x <= GILL + 1e-6);
  const body = KOHADA.filter((st) => st.x >= GILL - 1e-6);
  const hs = at(KOHADA, -0.048);
  const headGeo = weld([
    paint(shell(head, 0, Math.PI * 2, 18), kohadaSkin),
    patterned(cap(head[head.length - 1], 0, Math.PI * 2, 18, new Vector3(1, 0, 0))),
    [eye(0.0032, new Vector3(0, 1, 0), '#D8CFA8'), new Matrix4().makeTranslation(-0.048, hs.t * 1.8, -0.002)],
  ]);
  const tail = paint(new CylinderGeometry(0.0001, 0.009, 0.014, 4, 1).rotateZ(Math.PI / 2).scale(1, 0.12, 1).translate(0.061, 0.002, 0), (_p, _n, out) => out.set('#8E9AA0'));
  const bodyGeo = weld([paint(shell(body, 0, Math.PI * 2, 18), kohadaSkin), patterned(cap(body[0], 0, Math.PI * 2, 18, new Vector3(-1, 0, 0))), tail]);
  const scalesGeo = shell(body.slice(0, -1), 0, Math.PI * 2, 14, 0.0006);
  const bellyGeo = bellyPiece();
  const innardsGeo = gutsPiece();
  const finGeo = plate(DORSAL.map(([x, dz]): [number, number] => [x, -at(KOHADA, x).w - dz]), 0.0067, finColor);
  // The body with its belly cut off: the flat cut face flesh, the body cavity showing along its middle.
  const trimGeo = weld([
    paint(cutBelly(shell(body, 0, Math.PI * 2, 18)), (p, n, out) => {
      if (p.x < BELLY_END + 0.002 && p.z >= bellyCut(p.x) - 1e-6) out.copy(Math.abs(p.y - at(KOHADA, p.x).t) < 0.0022 ? cavity : fleshPink);
      else kohadaSkin(p, n, out);
    }),
    patterned(cutBelly(cap(body[0], 0, Math.PI * 2, 18, new Vector3(-1, 0, 0)))),
    tail,
  ]);
  const L = 0.086;
  const openGeo = openedKohada(L);
  const spineGeo = paint(
    taperedTube(Array.from({ length: 6 }, (_, k) => new Vector3((k / 5) * (L - 0.01), 0.0042, 0)), [0.0011, 0.001, 0.0009, 0.0008, 0.0006, 0.0004], 6, 1),
    (_p, _n, out) => out.set('#E6DED2'),
  );
  const T = 2 * 0.0069 * s;
  const N = KOHADA_FISH;
  const fishes = Array.from({ length: N }, (_, i) => i);
  // Each fish's parts, placed by its origin; where each one is now, as the steps move it.
  const now = fishes.map((i) => heapAt(i, s));
  const scales: Array<[BufferGeometry, Matrix4]> = [];
  const spines: Array<[BufferGeometry, Matrix4]> = [];
  for (const i of fishes) {
    const p = now[i];
    const add = (geo: BufferGeometry, name: string, dx: number, visible: boolean, scaleY = s): void => {
      const mesh = named(new Mesh(geo, mat), name, visible);
      mesh.position.set(p.x + dx * s, p.y, p.z);
      mesh.scale.set(s, scaleY, s);
      root.add(mesh);
    };
    add(bodyGeo, `K${i}`, 0, true);
    add(trimGeo, `K${i}Trim`, 0, false);
    add(finGeo, `F${i}`, 0, true);
    add(headGeo, `H${i}`, 0, true);
    add(openGeo, `K${i}Open`, GILL, false, 1);
    add(spineGeo, `K${i}Spine`, GILL + 0.005, false, 1);
    const belly = named(new Mesh(bellyGeo, mat), `B${i}`, false);
    belly.position.copy(gutAt(i, s));
    root.add(belly);
    const gut = named(new Mesh(innardsGeo, mat), `G${i}`, false);
    gut.position.copy(innardsAt(i, s));
    root.add(gut);
    scales.push(translated(scalesGeo, p, s));
    spines.push([spineGeo, new Matrix4().makeTranslation(0, 0.0012 * (i % 4), 0.004 * i)]);
  }
  const bowl = iceBowl();
  bowl.name = 'Bowl';
  bowl.position.set(BOWL_X, 0, 0);
  bowl.visible = false;
  root.add(bowl);
  root.add(named(new Mesh(weld(fishes.map((i) => translated(headGeo, headAt(i), s))), mat), 'HeadPile', false));
  // The cut bellies, the guts and the dorsal fins, in one pile.
  root.add(named(new Mesh(weld([...fishes.map((i) => translated(bellyGeo, gutAt(i, s), 1)), ...fishes.map((i) => translated(innardsGeo, innardsAt(i, s), 1)), ...fishes.map((i) => translated(finGeo, finAt(i), s))]), mat), 'GutsPile', false));
  root.add(named(new Mesh(weld(scales), scalesMaterial()), 'Scales'));
  const pile = named(new Mesh(weld(spines), mat), 'Spines', false);
  pile.position.set(0.2, 0, -0.03);
  root.add(pile);
  type Shift = [string, number, number, number];
  /** Each fish's dorsal fin still on it. */
  const finOn = fishes.map(() => true);
  /** Fish i to a place (its body whole or trimmed, opened flesh and backbone; its fin while on, its head too while it has one). */
  const move = (i: number, to: Vector3, withHead = false): Shift[] => {
    const d = to.clone().sub(now[i]);
    now[i] = to.clone();
    return [`K${i}`, `K${i}Trim`, `K${i}Open`, `K${i}Spine`, ...(finOn[i] ? [`F${i}`] : []), ...(withHead ? [`H${i}`] : [])].map((n): Shift => [n, d.x, d.z, d.y]);
  };
  const all = (prefix: string, suffix = ''): string[] => fishes.map((i) => `${prefix}${i}${suffix}`);
  const steps: PrepStep[] = [{ kind: 'scale', part: 'Scales', show: ['Bowl'], shift: move(0, SPOT, true), say: 'Scaler: the scales off, tail to head', sink: true }];
  // Every head first: each fish in the middle, the head off behind the gill, the fish onto the ice.
  for (const i of fishes) {
    const last = i === N - 1;
    const h = headAt(i).sub(now[i]);
    steps.push({
      kind: 'cut', axis: 'z', at: SPOT.x + GILL * s, mid: SPOT.z, len: 0.05,
      shift: [[`H${i}`, h.x, h.z, h.y], ...move(i, iceAt(i)), ...(last ? move(0, SPOT) : move(i + 1, SPOT, true))],
      ...(last ? { hide: all('H'), show: ['HeadPile'], scrap: ['HeadPile'] } : {}),
      say: `Head off behind the gill, onto the ice (${i + 1} of ${N})`, sink: true,
    });
  }
  // Then each off the ice in turn (the owner: fin, belly, guts; a kohada is not slit): its dorsal fin cut off along
  // the back, its belly cut off, slanting from behind the gill to the edge, then the guts scraped out of the cavity
  // with the knife's tip; the trimmed ones on the right.
  for (const i of fishes) {
    const last = i === N - 1;
    const f = finAt(i).sub(now[i]);
    finOn[i] = false;
    steps.push({
      kind: 'cut', axis: 'x', at: SPOT.z - 0.0195 * s, mid: SPOT.x + 0.004 * s, len: 0.04 * s,
      shift: [[`F${i}`, f.x, f.z, f.y]],
      say: `The dorsal fin off along the back (${i + 1} of ${N})`, sink: true,
    });
    steps.push({
      kind: 'cut', axis: 'x', at: SPOT.z + 0.012 * s, mid: SPOT.x + ((GILL + BELLY_END) / 2) * s, len: (BELLY_END - GILL + 0.006) * s,
      hide: [`K${i}`], show: [`K${i}Trim`, `B${i}`],
      say: `The belly cut off (${i + 1} of ${N})`, sink: true,
    });
    steps.push({
      kind: 'cut', axis: 'x', at: SPOT.z + 0.006 * s, mid: SPOT.x + (GILL + 0.014) * s, len: 0.024 * s, low: true,
      hide: last ? [...all('B'), ...all('G'), ...all('F')] : [],
      show: last ? ['GutsPile'] : [`G${i}`],
      shift: [...move(i, heapAt(i, s)), ...(last ? [] : move(i + 1, SPOT))],
      ...(last ? { scrap: ['GutsPile'] } : {}),
      say: `The guts out with the knife's tip (${i + 1} of ${N})`, sink: true,
    });
  }
  // Washed together, then back on the ice (the first one to the middle for the board).
  steps.push({
    kind: 'rinse', at: new Vector3(0.14, T, 0), shift: [...move(0, SPOT), ...fishes.slice(1).flatMap((i) => move(i, iceAt(i)))],
    say: 'Wash them under the tap, then back on the ice', sink: true,
  });
  // On the board: every fish opened from the belly (each off the ice to the middle, opened onto the right), then every backbone out.
  const mid = SPOT.x + (GILL + L / 2) * s;
  for (const i of fishes) {
    const last = i === N - 1;
    steps.push({
      kind: 'cut', axis: 'x', at: SPOT.z + 0.011 * s, mid, len: L * s, hide: [`K${i}Trim`, ...(last ? ['Bowl'] : [])], show: [`K${i}Open`, `K${i}Spine`],
      shift: [...move(i, openedAt(i)), ...(last ? move(0, SPOT) : move(i + 1, SPOT))],
      say: `Open it from the belly (${i + 1} of ${N})`,
    });
  }
  for (const i of fishes) {
    const last = i === N - 1;
    steps.push({
      kind: 'cut', axis: 'x', at: SPOT.z, mid, len: (L - 0.006) * s, low: true, hide: [`K${i}Spine`],
      shift: [...move(i, doneAt(i)), ...(last ? [] : move(i + 1, SPOT))],
      ...(last ? { show: ['Spines'], scrap: ['Spines'] } : {}),
      say: `Shave the backbone out (${i + 1} of ${N})`,
    });
  }
  const open = all('K', 'Open');
  return {
    root,
    length: 0.47,
    halfWidth: 0.12,
    top: T,
    alongX: true,
    boardAt: [-0.06, 0.02],
    pileAt: [0.32, 0.14],
    // Taken from the wash board by the bowl (the fish on its ice).
    takeAt: [BOWL_X, 0],
    steps,
    // Taken up by the front one of the done (the first part gives the pick point), clear of the tweezers on the board's back row.
    products: [{ parts: [open[N - 1], ...open.slice(0, N - 1)], neta: 'Kohada', dest: 'cure' }],
  };
}

// ---------------------------------------------------------------- the drainboard's things

const steel = new MeshStandardMaterial({ color: '#C8CDD1', metalness: 0.65, roughness: 0.32 });
const wood = new MeshStandardMaterial({ color: '#B08A5E', roughness: 0.8 });
const ceramic = new MeshStandardMaterial({ color: '#E9E4DA', roughness: 0.45 });
const vinegarColor = new MeshStandardMaterial({ color: '#E9D79A', roughness: 0.15, transparent: true, opacity: 0.5, depthWrite: false });
/** White enamel (琺瑯): glossy, seen from inside too; its rim's dark blue line. */
const enamel = new MeshStandardMaterial({ color: '#F3F1EA', roughness: 0.22, side: DoubleSide });
const enamelRim = new MeshStandardMaterial({ color: '#22324F', roughness: 0.3 });
/** The bowl's wall, seen from inside too (it is open). */
const ceramicInside = new MeshStandardMaterial({ color: '#E9E4DA', roughness: 0.45, side: DoubleSide });

/** Salt grains: a small repeating speckle (deterministic), multiplied into the salt's alpha. */
function saltGrain(): DataTexture {
  const N = 32;
  const data = new Uint8Array(N * N * 4);
  let seed = 7;
  for (let k = 0; k < N * N; k++) {
    seed = (seed * 16807) % 2147483647;
    const v = 150 + ((seed >> 8) % 106);
    data.set([v, v, v, 255], k * 4);
  }
  const t = new DataTexture(data, N, N);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
const grain = saltGrain();

/** The salt cells' size: each pinch whitens the cells under it (src/cure-system.ts). */
const SALT_CELL = 0.01;

/**
 * A sheet of salt cells, W by D (or a disc W across, when `round`), lying
 * flat: each cell white as far as salt has fallen on it (vertex alpha, 0 at
 * first). On a round one the cells outside the disc never take salt
 * (userData.mask: 1 in, 0 out).
 */
function saltSheet(W: number, D: number, name: string, round = false): Mesh {
  const geo = new PlaneGeometry(W, D, Math.round(W / SALT_CELL), Math.round(D / SALT_CELL)).rotateX(-Math.PI / 2);
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 4).fill(1);
  for (let k = 3; k < colors.length; k += 4) colors[k] = 0;
  geo.setAttribute('color', new BufferAttribute(colors, 4));
  const mask = new Uint8Array(n).fill(1);
  if (round) for (let k = 0; k < n; k++) if (Math.hypot(geo.attributes.position.getX(k), geo.attributes.position.getZ(k)) > W / 2) mask[k] = 0;
  const map = grain.clone();
  map.repeat.set(W / 0.03, D / 0.03);
  const salt = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, alphaMap: map, roughness: 0.95, transparent: true, depthWrite: false }));
  salt.userData.mask = mask;
  return named(salt, name);
}

/**
 * A stainless tray (バット), W along X by D along Z, origin at its floor's
 * middle. Its 'Salt' is a sheet of cells over the fish (src/cure-system.ts
 * lifts it to lie just over whatever is laid in the tray).
 */
export function createTray(W: number, D: number): Group {
  const g = new Group();
  g.name = 'CureTray';
  const h = 0.028;
  const t = 0.0015;
  g.add(box(W, t, D, steel, 'TrayFloor'));
  g.add(box(W, h, t, steel, 'TrayFront', 0, h / 2, D / 2));
  g.add(box(W, h, t, steel, 'TrayBack', 0, h / 2, -D / 2));
  g.add(box(t, h, D, steel, 'TrayLeft', -W / 2, h / 2, 0));
  g.add(box(t, h, D, steel, 'TrayRight', W / 2, h / 2, 0));
  const salt = saltSheet(W - 0.008, D - 0.008, 'Salt');
  salt.position.y = 0.012;
  g.add(salt);
  return g;
}

/** Woven bamboo: a small basket-weave of two straw tones (deterministic). */
function bambooWeave(): DataTexture {
  const N = 16;
  const data = new Uint8Array(N * N * 4);
  const a = [217, 196, 142];
  const b = [184, 154, 92];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const over = ((x >> 2) + (y >> 2)) % 2 === 0 ? x % 4 !== 0 : y % 4 !== 0;
      const c = over ? a : b;
      data.set([c[0], c[1], c[2], 255], (y * N + x) * 4);
    }
  }
  const t = new DataTexture(data, N, N);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
const weave = bambooWeave();

/**
 * A round flat bamboo basket (平ざる), D across, origin at its floor's middle:
 * the kohada are laid on it, skin up, in a ring, and salted on both sides
 * (the owner: salt on the basket, the fish laid, salt over them). 'SaltBed'
 * is the basket's own salt, 'Salt' the salt over the fish.
 */
export function createZaru(D: number): Group {
  const g = new Group();
  g.name = 'Zaru';
  const R = D / 2;
  const floorMap = weave.clone();
  floorMap.repeat.set(D / 0.012, D / 0.012);
  const straw = new MeshStandardMaterial({ map: floorMap, roughness: 0.85, side: DoubleSide });
  const floor = new Mesh(new CylinderGeometry(R - 0.02, R - 0.022, 0.003, 40).translate(0, 0.0015, 0), straw);
  g.add(named(floor, 'ZaruFloor'));
  const wall = new LatheGeometry([new Vector2(R - 0.021, 0.003), new Vector2(R - 0.01, 0.009), new Vector2(R - 0.003, 0.016), new Vector2(R, 0.02)], 40);
  g.add(named(new Mesh(wall, straw), 'ZaruSide'));
  g.add(named(new Mesh(new TorusGeometry(R, 0.0045, 6, 48).rotateX(Math.PI / 2).translate(0, 0.02, 0), new MeshStandardMaterial({ color: '#A88A50', roughness: 0.75 })), 'ZaruRim'));
  const bed = saltSheet(D - 0.04, D - 0.04, 'SaltBed', true);
  bed.position.y = 0.0035;
  g.add(bed);
  const top = saltSheet(D - 0.03, D - 0.03, 'Salt', true);
  top.position.y = 0.01;
  g.add(top);
  return g;
}

/** A steel bowl of water, R across its rim, origin at its foot (in the sink: the salt washed off the kohada). */
export function createWaterBowl(R = 0.08): Group {
  const g = new Group();
  g.name = 'WaterBowl';
  const profile = [new Vector2(0.001, 0), new Vector2(R * 0.62, 0), new Vector2(R * 0.82, 0.014), new Vector2(R * 0.95, 0.038), new Vector2(R, 0.058), new Vector2(R + 0.004, 0.06)];
  g.add(named(new Mesh(new LatheGeometry(profile, 32), bowlSteel), 'Bowl'));
  const water = new MeshStandardMaterial({ color: '#BFD8E2', roughness: 0.05, transparent: true, opacity: 0.4, depthWrite: false });
  g.add(named(new Mesh(new CylinderGeometry(R * 0.93, R * 0.62, 0.042, 32).translate(0, 0.022, 0), water), 'Water'));
  return g;
}

/**
 * A small kitchen timer (white, a grey-green display, three buttons), its
 * back at the origin and its face toward +Z: on the dish cabinet's side
 * facing the sink, out of the customers' sight. The digits are a text sprite
 * (src/cure-system.ts) at TIMER_FACE.
 */
export const TIMER_FACE = new Vector3(0, 0.008, 0.02);
export function createKitchenTimer(): Group {
  const g = new Group();
  g.name = 'KitchenTimer';
  const white = new MeshStandardMaterial({ color: '#F2F2EE', roughness: 0.4 });
  const lcd = new MeshStandardMaterial({ color: '#A9B5A0', roughness: 0.3 });
  const key = new MeshStandardMaterial({ color: '#9EA4A8', roughness: 0.5 });
  g.add(box(0.07, 0.07, 0.018, white, 'TimerBody', 0, 0, 0.009));
  g.add(box(0.054, 0.024, 0.002, lcd, 'TimerScreen', 0, 0.008, 0.0185));
  for (let k = 0; k < 3; k++) g.add(box(0.014, 0.008, 0.004, key, `TimerKey${k}`, -0.018 + k * 0.018, -0.018, 0.019));
  return g;
}

/**
 * The vinegar's container: white enamel (ホーロー), kept for vinegar only (the
 * owner), W by D and `h` deep, its dark blue rim line; the vinegar stands in
 * it from the start. Origin at its floor's middle.
 */
export function createVinegarPot(W: number, D: number, h = 0.055): Group {
  const g = new Group();
  g.name = 'VinegarPot';
  const t = 0.0018;
  g.add(box(W, t, D, enamel, 'PotFloor'));
  g.add(box(W, h, t, enamel, 'PotFront', 0, h / 2, D / 2));
  g.add(box(W, h, t, enamel, 'PotBack', 0, h / 2, -D / 2));
  g.add(box(t, h, D, enamel, 'PotLeft', -W / 2, h / 2, 0));
  g.add(box(t, h, D, enamel, 'PotRight', W / 2, h / 2, 0));
  const r = 0.004;
  g.add(box(W + 0.002, r, t + 0.002, enamelRim, 'RimFront', 0, h - r / 2, D / 2));
  g.add(box(W + 0.002, r, t + 0.002, enamelRim, 'RimBack', 0, h - r / 2, -D / 2));
  g.add(box(t + 0.002, r, D + 0.002, enamelRim, 'RimLeft', -W / 2, h - r / 2, 0));
  g.add(box(t + 0.002, r, D + 0.002, enamelRim, 'RimRight', W / 2, h - r / 2, 0));
  const depth = Math.min(0.036, h - 0.012);
  g.add(box(W - 0.004, depth, D - 0.004, vinegarColor, 'Vinegar', 0, t + depth / 2));
  return g;
}

/** The salt bowl: a small white bowl heaped with coarse salt, origin at its foot. */
export function createSaltBowl(): Group {
  const g = new Group();
  g.name = 'SaltBowl';
  const bowl = new Mesh(new CylinderGeometry(0.036, 0.024, 0.032, 20, 1, true).translate(0, 0.016, 0), ceramicInside);
  g.add(named(bowl, 'Bowl'));
  g.add(named(new Mesh(new CylinderGeometry(0.024, 0.024, 0.003, 20).translate(0, 0.0015, 0), ceramic), 'BowlFoot'));
  const heap = paint(new SphereGeometry(0.033, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).translate(0, 0.022, 0), (p, _n, out) =>
    out.set('#FAFAF7').multiplyScalar(0.92 + 0.08 * Math.sin(p.x * 1200 + p.z * 900)),
  );
  g.add(named(new Mesh(heap, new MeshStandardMaterial({ vertexColors: true, roughness: 1 })), 'SaltHeap'));
  return g;
}

/** A low wooden stand (すのこ台) for the fish box, origin at the floor; its top at `height`. */
export function createFishStand(W: number, D: number, height: number): Group {
  const g = new Group();
  g.name = 'FishStand';
  for (let k = 0; k < 5; k++) g.add(box(W, 0.018, D / 5 - 0.012, wood, `Slat${k}`, 0, height - 0.009, -D / 2 + (D / 5) * (k + 0.5)));
  for (const sx of [-1, 1]) {
    g.add(box(0.04, height - 0.018, D - 0.02, wood, sx < 0 ? 'LegLeft' : 'LegRight', sx * (W / 2 - 0.03), (height - 0.018) / 2, 0));
  }
  return g;
}
