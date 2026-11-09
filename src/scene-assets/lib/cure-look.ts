import { type BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import { prepMaterial } from './neta-look.js';
import { paint, patterned, taperedTube, weld } from './neta-paint.js';
import { at, box, cap, eye, named, sakuBlock, scalesMaterial, shell, type Sta } from './fillet-look.js';
import type { PrepMaterialLook, PrepStep } from './prep-look.js';

/**
 * The full difficulty's curing (締め), the owner's shop: kohada and saba
 * salted, rinsed, then soaked in vinegar on the drainboard beside the sink,
 * each in its stainless tray (バット), on the day.
 *
 * The kohada: eight small whole fish, two rows of four, lying along X (head
 * on the chef's left, belly toward the chef) like the stage 4 fish. Washed
 * at the sink as a row: scaled, the heads off a row at a time (the guts come
 * with them), rinsed. On the board each is opened from the belly (腹開き)
 * and its backbone shaved out: eight times, one a piece (丸づけ). Then the
 * eight go to their tray together. Runtime meshes (src/prep-cut-system.ts,
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
/** The two rows (X) and the four fish of each (Z), root-local. The right row lies the other way round, heads out, so every head and gut falls at an outer end. */
const COLS = [-0.072, 0.072];
const FACING = [1, -1];
const ROWS = [-0.069, -0.023, 0.023, 0.069];

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

function translated(g: BufferGeometry, x: number, z: number, scale: number, dir = 1): [BufferGeometry, Matrix4] {
  return [g, new Matrix4().makeTranslation(x, 0, z).multiply(new Matrix4().makeRotationY(dir > 0 ? 0 : Math.PI)).multiply(new Matrix4().makeScale(scale, scale, scale))];
}

export const KOHADA_FISH = COLS.length * ROWS.length;

/**
 * Eight whole kohada (the day's size: 0.92 small, 1 middling, 1.08 large),
 * with their steps: at the sink the row is scaled, the heads come off a row
 * at a time, the guts are pulled, and it is rinsed; on the board each is
 * opened from the belly and its backbone shaved out. The opened eight go to
 * the kohada's tray together.
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
  const gutsGeo = paint(new SphereGeometry(1, 10, 6).scale(0.012, 0.004, 0.005), (p, _n, out) => out.set(p.x > 0.004 ? '#A88F4E' : '#6E2A23'));
  const L = 0.086;
  const openGeo = sakuBlock(L, 0.0035, 0.036, { tail: 0.7 });
  const spineGeo = paint(
    taperedTube(Array.from({ length: 6 }, (_, k) => new Vector3((k / 5) * (L - 0.01), 0.0042, 0)), [0.0011, 0.001, 0.0009, 0.0008, 0.0006, 0.0004], 6, 1),
    (_p, _n, out) => out.set('#E6DED2'),
  );
  const heads: Array<Array<[BufferGeometry, Matrix4]>> = COLS.map(() => []);
  const guts: Array<Array<[BufferGeometry, Matrix4]>> = COLS.map(() => []);
  const scales: Array<[BufferGeometry, Matrix4]> = [];
  const spines: Array<[BufferGeometry, Matrix4]> = [];
  const steps: PrepStep[] = [];
  const open: string[] = [];
  let i = 0;
  COLS.forEach((x0, c) => {
    const d = FACING[c];
    const yaw = d > 0 ? 0 : Math.PI;
    for (const z0 of ROWS) {
      heads[c].push(translated(headGeo, x0, z0, s, d));
      guts[c].push([gutsGeo, new Matrix4().makeTranslation(x0 + d * (GILL + 0.012) * s, 0.0055 * s, z0 + d * 0.008 * s)]);
      scales.push(translated(scalesGeo, x0, z0, s, d));
      const fish = named(new Mesh(bodyGeo, mat), `K${i}`);
      fish.position.set(x0, 0, z0);
      fish.rotation.y = yaw;
      fish.scale.setScalar(s);
      root.add(fish);
      const opened = named(new Mesh(openGeo, mat), `K${i}Open`, false);
      opened.position.set(x0 + d * GILL * s, 0, z0);
      opened.rotation.y = yaw;
      opened.scale.set(s, 1, s);
      root.add(opened);
      const spine = named(new Mesh(spineGeo, mat), `K${i}Spine`, false);
      spine.position.set(x0 + d * (GILL + 0.005) * s, 0, z0);
      spine.rotation.y = yaw;
      spine.scale.set(s, 1, 1);
      root.add(spine);
      spines.push([spineGeo, new Matrix4().makeTranslation(0, 0.0012 * (i % 4), 0.004 * i)]);
      const mid = x0 + d * (GILL + L / 2) * s;
      const n = i + 1;
      steps.push(
        { kind: 'cut', axis: 'x', at: z0 + d * 0.011 * s, mid, len: L * s, hide: [`K${i}`], show: [`K${i}Open`, `K${i}Spine`], say: `Open it from the belly (${n} of ${KOHADA_FISH})` },
        {
          kind: 'cut', axis: 'x', at: z0, mid, len: (L - 0.006) * s, low: true, hide: [`K${i}Spine`],
          ...(n === KOHADA_FISH ? { show: ['Spines'], scrap: ['Spines'] } : {}),
          say: `Shave the backbone out (${n} of ${KOHADA_FISH})`,
        },
      );
      open.push(`K${i}Open`);
      i++;
    }
  });
  COLS.forEach((_, c) => {
    root.add(named(new Mesh(weld(heads[c]), mat), `Heads${c}`));
    root.add(named(new Mesh(weld(guts[c]), mat), `Guts${c}`, false));
  });
  root.add(named(new Mesh(weld(scales), scalesMaterial()), 'Scales'));
  const pile = named(new Mesh(weld(spines), mat), 'Spines', false);
  pile.position.set(0.2, 0, -0.03);
  root.add(pile);
  const T = 2 * 0.0069 * s;
  const sink: PrepStep[] = [
    { kind: 'scale', part: 'Scales', say: 'Scaler: scrape the row, tail to head', sink: true },
    { kind: 'cut', axis: 'z', at: COLS[0] + GILL * s, mid: 0, len: 0.19, shift: [['Heads0', -0.02, 0]], scrap: ['Heads0'], show: ['Guts0'], say: 'Heads off: one row', sink: true },
    { kind: 'cut', axis: 'z', at: COLS[1] - GILL * s, mid: 0, len: 0.19, shift: [['Heads1', 0.02, 0]], scrap: ['Heads1'], show: ['Guts1'], say: 'And the other row', sink: true },
    {
      kind: 'pull', netaAt: new Vector3(0.03, T, 0), riceAt: new Vector3(COLS[0] + (GILL + 0.012) * s, T, 0), parts: ['Guts0', 'Guts1'],
      shift: [['Guts0', -0.03, 0], ['Guts1', 0.03, 0]], scrap: ['Guts0', 'Guts1'], say: 'Pull the guts out', sink: true,
    },
    { kind: 'rinse', at: new Vector3(0, T, 0.02), say: 'Wash them under the tap', sink: true },
  ];
  return {
    root,
    length: 0.27,
    halfWidth: 0.1,
    top: T,
    alongX: true,
    boardAt: [0.1, 0.02],
    pileAt: [0.32, 0.14],
    takeAt: [0, 0],
    steps: [...sink, ...steps],
    // Taken up by a fish in the front row (the first part gives the pick point), clear of the tweezers on the board's back row.
    products: [{ parts: [open[3], ...open.filter((_, k) => k !== 3)], neta: 'Kohada', dest: 'cure' }],
  };
}

// ---------------------------------------------------------------- the drainboard's things

const steel = new MeshStandardMaterial({ color: '#C8CDD1', metalness: 0.65, roughness: 0.32 });
const wood = new MeshStandardMaterial({ color: '#B08A5E', roughness: 0.8 });
const ceramic = new MeshStandardMaterial({ color: '#E9E4DA', roughness: 0.45 });
const glass = new MeshStandardMaterial({ color: '#D9E2D2', roughness: 0.08, transparent: true, opacity: 0.45, depthWrite: false });
const vinegarColor = new MeshStandardMaterial({ color: '#E9D79A', roughness: 0.15, transparent: true, opacity: 0.55, depthWrite: false });
const labelPaper = new MeshStandardMaterial({ color: '#F1E9D6', roughness: 0.9 });
/** The bowl's wall, seen from inside too (it is open). */
const ceramicInside = new MeshStandardMaterial({ color: '#E9E4DA', roughness: 0.45, side: DoubleSide });
/** Salt laid over the fish: white, its opacity how much is on (0..1). */
export const SALT_OPACITY = 0.9;

/** A stainless tray (バット), W along X by D along Z, origin at its floor's middle. */
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
  // The salt over the fish and the vinegar round them, shown in their turn.
  const salt = new Mesh(
    paint(box(W - 0.01, 0.002, D - 0.01, steel, 'x').geometry.clone(), (p, _n, out) => out.set('#FFFFFF').multiplyScalar(0.9 + 0.1 * Math.sin(p.x * 900) * Math.sin(p.z * 700))),
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, transparent: true, opacity: SALT_OPACITY, depthWrite: false }),
  );
  salt.position.y = 0.012;
  g.add(named(salt, 'Salt', false));
  const vinegar = box(W - 0.006, 0.012, D - 0.006, vinegarColor, 'Vinegar', 0, 0.0075);
  vinegar.visible = false;
  g.add(vinegar);
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

/** The rice vinegar's bottle (an 1.8 l issho-bin cut short), origin at its foot; its pour point at the neck's top. */
export const VINEGAR_NECK = 0.24;
export function createVinegarBottle(): Group {
  const g = new Group();
  g.name = 'VinegarBottle';
  g.add(named(new Mesh(new CylinderGeometry(0.038, 0.038, 0.17, 20).translate(0, 0.085, 0), glass), 'Glass'));
  g.add(named(new Mesh(new CylinderGeometry(0.036, 0.036, 0.13, 20).translate(0, 0.066, 0), vinegarColor), 'Liquid'));
  g.add(named(new Mesh(new CylinderGeometry(0.014, 0.038, 0.05, 20).translate(0, 0.195, 0), glass), 'Shoulder'));
  g.add(named(new Mesh(new CylinderGeometry(0.0125, 0.0125, 0.03, 14).translate(0, 0.225, 0), glass), 'Neck'));
  g.add(named(new Mesh(new CylinderGeometry(0.0135, 0.0135, 0.012, 14).translate(0, 0.236, 0), steel), 'Cap'));
  g.add(named(new Mesh(new CylinderGeometry(0.0385, 0.0385, 0.07, 20, 1, true).translate(0, 0.09, 0), labelPaper), 'Label'));
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
