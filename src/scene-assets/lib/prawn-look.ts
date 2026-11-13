import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { taperedTube } from './neta-paint.js';

/**
 * The kuruma-ebi worked to order in service (src/prawn-system.ts; the
 * user's shop): live from the case, boiled on a skewer for about ten
 * seconds, or served raw, peeled. Runtime meshes, not manifest assets.
 */

/** A whole prawn lies straight along Z: its head at -Z (away from the chef), its tail fan at +Z, back up. */
export const PRAWN_LENGTH = 0.12;
const HEAD_AT = -PRAWN_LENGTH / 2;
const TAIL_AT = PRAWN_LENGTH / 2;
/** Where the head joins the body. */
const NECK_AT = HEAD_AT + 0.035;

/** A colour that changes as the prawn boils (raw to cooked). */
export interface PrawnTint {
  material: MeshStandardMaterial;
  raw: Color;
  cooked: Color;
}

export interface WholePrawn {
  root: Group;
  /** The shell and the head: pulled off together when it is peeled. */
  shell: Group;
  /** The peeled body with its tail fan (hidden until the shell is off). */
  meat: Group;
  tints: PrawnTint[];
}

function tint(raw: string, cooked: string, roughness: number, opacity = 1): PrawnTint {
  const material = new MeshStandardMaterial({ color: raw, roughness, transparent: opacity < 1, opacity });
  return { material, raw: new Color(raw), cooked: new Color(cooked) };
}

/** Radius of the body at z (thick behind the head, thin at the tail). */
function bodyRadius(z: number): number {
  const t = (z - NECK_AT) / (TAIL_AT - 0.008 - NECK_AT);
  return 0.0095 - 0.005 * Math.max(0, Math.min(1, t));
}

/** A tube along the body, arched a little (its back up). */
function bodyTube(scale: number): ReturnType<typeof taperedTube> {
  const path: Vector3[] = [];
  const radii: number[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const z = NECK_AT + ((TAIL_AT - 0.008 - NECK_AT) * i) / n;
    path.push(new Vector3(0, 0.009 + 0.003 * Math.sin((Math.PI * i) / n), z));
    radii.push(bodyRadius(z) * scale);
  }
  return taperedTube(path, radii, 10, 0.85);
}

/** Thin bands round the body (the stripes): raw dark grey, boiled red. */
function bands(group: Group, material: MeshStandardMaterial, scale: number): void {
  for (let i = 0; i < 6; i++) {
    const z = NECK_AT + 0.008 + i * 0.011;
    const r = bodyRadius(z) * scale;
    const ring = new Mesh(new TorusGeometry(r * 1.01, 0.0011, 4, 14), material);
    ring.position.set(0, 0.009 + 0.003 * Math.sin((Math.PI * (z - NECK_AT)) / (TAIL_AT - 0.008 - NECK_AT)), z);
    group.add(ring);
  }
}

export function createWholePrawn(): WholePrawn {
  const shellTint = tint('#A39C90', '#F1E2D4', 0.45);
  const bandTint = tint('#3F3A46', '#D8432C', 0.45);
  const meatTint = tint('#E2D6D2', '#F5EDE6', 0.5, 0.92);
  const meatBand = tint('#C4B0BA', '#D9472F', 0.5);
  const tailTint = tint('#4A6075', '#D23A26', 0.4);
  const root = new Group();
  root.name = 'Prawn';
  // The shell: the body, its bands, the head and its feelers.
  const shell = new Group();
  shell.name = 'PrawnShell';
  shell.add(new Mesh(bodyTube(1), shellTint.material));
  bands(shell, bandTint.material, 1);
  const head = new Mesh(new SphereGeometry(1, 12, 8).scale(0.011, 0.01, 0.019), shellTint.material);
  head.position.set(0, 0.01, HEAD_AT + 0.019);
  const rostrum = new Mesh(new CylinderGeometry(0.0006, 0.0018, 0.03, 5).rotateX(Math.PI / 2), bandTint.material);
  rostrum.position.set(0, 0.014, HEAD_AT - 0.008);
  shell.add(head, rostrum);
  for (const s of [-1, 1]) {
    const feeler = new Mesh(new CylinderGeometry(0.0004, 0.0004, 0.07, 3).rotateX(Math.PI / 2), bandTint.material);
    feeler.position.set(s * 0.006, 0.008, HEAD_AT - 0.03);
    feeler.rotation.y = s * 0.25;
    shell.add(feeler);
  }
  // The peeled body: a little thinner, its stripes showing through; the tail fan stays on.
  const meat = new Group();
  meat.name = 'PrawnMeat';
  meat.add(new Mesh(bodyTube(0.86), meatTint.material));
  bands(meat, meatBand.material, 0.86);
  meat.visible = false;
  const tail = new Mesh(new SphereGeometry(1, 10, 4).scale(0.012, 0.0018, 0.012), tailTint.material);
  tail.position.set(0, 0.006, TAIL_AT - 0.006);
  root.add(shell, meat, tail);
  return { root, shell, meat, tints: [shellTint, bandTint, meatTint, meatBand, tailTint] };
}

/** A bamboo skewer lying along Z, its grip end (a flat knob) at +Z, the point at the origin. */
export const SKEWER_LENGTH = 0.17;
export function createPrawnSkewer(): Group {
  const bamboo = new MeshStandardMaterial({ color: '#D9C28C', roughness: 0.7 });
  const g = new Group();
  g.name = 'PrawnSkewer';
  const stick = new Mesh(new CylinderGeometry(0.0014, 0.0007, SKEWER_LENGTH, 6).rotateX(-Math.PI / 2), bamboo);
  stick.position.z = SKEWER_LENGTH / 2;
  const knob = new Mesh(new BoxGeometry(0.006, 0.003, 0.018), bamboo);
  knob.position.z = SKEWER_LENGTH - 0.009;
  g.add(stick, knob);
  return g;
}

/** The pot of water kept on the boil through service, on a one-burner gas cooker: origin on the counter. */
export const PRAWN_POT_RADIUS = 0.075;
/** The water's surface over the counter. */
export const PRAWN_WATER_Y = 0.135;
export function createPrawnPot(): Group {
  const root = new Group();
  root.name = 'PrawnPot';
  const cooker = new Mesh(new BoxGeometry(0.2, 0.07, 0.22), new MeshStandardMaterial({ color: '#3A3D42', roughness: 0.5, metalness: 0.3 }));
  cooker.position.y = 0.035;
  const R = PRAWN_POT_RADIUS;
  const H = 0.085;
  const wall = [[0.001, 0], [R - 0.006, 0], [R, 0.006], [R, H], [R + 0.003, H + 0.002], [R - 0.003, H], [R - 0.003, 0.004], [0.001, 0.004]].map(([r, y]) => new Vector2(r, y));
  const pot = new Mesh(new LatheGeometry(wall, 28), new MeshStandardMaterial({ color: '#C9CDD1', roughness: 0.32, metalness: 0.75 }));
  pot.position.y = 0.075;
  const water = new Mesh(new CircleGeometry(R - 0.004, 24).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: '#B9CCD3', roughness: 0.05, transparent: true, opacity: 0.75 }));
  water.position.y = PRAWN_WATER_Y;
  const flame = new Mesh(
    new TorusGeometry(0.045, 0.006, 4, 20).rotateX(Math.PI / 2),
    new MeshBasicMaterial({ color: '#4F8BFF', transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }),
  );
  flame.position.y = 0.073;
  flame.name = 'Flame';
  const bubbles = new Group();
  bubbles.name = 'Bubbles';
  const bubble = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.1, transparent: true, opacity: 0.6 });
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const r = 0.012 + (i % 3) * 0.018;
    const b = new Mesh(new SphereGeometry(0.003 + (i % 2) * 0.002, 6, 4), bubble);
    b.position.set(Math.sin(a) * r, PRAWN_WATER_Y + 0.001, Math.cos(a) * r);
    bubbles.add(b);
  }
  root.add(cooker, pot, water, flame, bubbles);
  return root;
}

/** The bowl of ice water beside the pot, where a boiled prawn is plunged to firm it: origin on the counter. */
export const ICE_BOWL_RADIUS = 0.062;
/** The water's surface over the counter. */
export const ICE_WATER_Y = 0.042;
export function createIceBowl(): Group {
  const root = new Group();
  root.name = 'PrawnIceBowl';
  const R = ICE_BOWL_RADIUS;
  const H = 0.055;
  const wall = [[0.001, 0], [R * 0.6, 0], [R * 0.85, H * 0.35], [R, H], [R + 0.003, H + 0.002], [R - 0.003, H], [R * 0.84, H * 0.38], [R * 0.58, 0.003], [0.001, 0.003]].map(([r, y]) => new Vector2(r, y));
  root.add(new Mesh(new LatheGeometry(wall, 28), new MeshStandardMaterial({ color: '#D4D8DC', roughness: 0.25, metalness: 0.8 })));
  const water = new Mesh(new CircleGeometry(R * 0.93, 24).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: '#CFE3EA', roughness: 0.05, transparent: true, opacity: 0.6 }));
  water.position.y = ICE_WATER_Y;
  root.add(water);
  const ice = new MeshStandardMaterial({ color: '#F2F8FA', roughness: 0.15, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 6; i++) {
    const a = i * 1.9 + 0.4;
    const r = 0.02 + (i % 3) * 0.012;
    const cube = new Mesh(new BoxGeometry(0.016, 0.014, 0.016), ice);
    cube.position.set(Math.sin(a) * r, ICE_WATER_Y + 0.002, Math.cos(a) * r);
    cube.rotation.set(0.3 * i, 0.7 * i, 0.2 * i);
    root.add(cube);
  }
  return root;
}
