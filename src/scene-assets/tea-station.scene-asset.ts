import { CylinderGeometry, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, TorusGeometry } from '@iwsdk/core';
import { mergeBoxes, mergeGeometries } from './lib/batch.js';

/**
 * The tea things (お茶) of the office corner, and the cup itself. A sushi
 * bar's tea (あがり) is powdered green tea (粉茶) in a tall cup, hot water
 * from an urn (給湯器), made out of the customers' sight.
 */

const cabinetWood = new MeshStandardMaterial({ color: '#7A5838', roughness: 0.75 });
const cabinetDark = new MeshStandardMaterial({ color: '#4E3826', roughness: 0.8 });
const urnBody = new MeshStandardMaterial({ color: '#E9E4D8', roughness: 0.35 });
const urnTop = new MeshStandardMaterial({ color: '#5B5F63', roughness: 0.4 });
const canGreen = new MeshStandardMaterial({ color: '#3F6B3A', roughness: 0.45, metalness: 0.2 });
const canLid = new MeshStandardMaterial({ color: '#2E2E2E', roughness: 0.4, metalness: 0.3 });
const ceramic = new MeshStandardMaterial({ color: '#E6DFCF', roughness: 0.3, side: DoubleSide });
const band = new MeshStandardMaterial({ color: '#2C3E66', roughness: 0.35 });
const greenTea = new MeshStandardMaterial({ color: '#8FA63A', roughness: 0.15 });

/** A sushi bar's tall tea cup (寿司湯呑み): radius at the rim and the foot, and height. */
export const YUNOMI_RIM = 0.042;
export const YUNOMI_FOOT = 0.035;
export const YUNOMI_HEIGHT = 0.105;

const cupWall = new CylinderGeometry(YUNOMI_RIM, YUNOMI_FOOT, YUNOMI_HEIGHT, 24, 1, true).translate(0, YUNOMI_HEIGHT / 2, 0);
const cupFloor = new CylinderGeometry(YUNOMI_FOOT, YUNOMI_FOOT, 0.008, 24).translate(0, 0.004, 0);
const cupBand = new CylinderGeometry(0.0405, 0.0395, 0.016, 24, 1, true).translate(0, YUNOMI_HEIGHT * 0.68, 0);
const teaSurface = new CylinderGeometry(0.039, 0.039, 0.002, 24).translate(0, YUNOMI_HEIGHT - 0.02, 0);

/**
 * One cup, its foot at the origin; with tea in it (a green surface just
 * under the rim) or empty. Built fresh for each cup the chef or the
 * part-timer makes (src/tea-system.ts); the geometry is shared.
 */
export function createYunomi(withTea: boolean): Group {
  const root = new Group();
  root.name = 'Yunomi';
  const wall = new Mesh(mergeGeometries([[cupWall, new Matrix4()], [cupFloor, new Matrix4()]]), ceramic);
  wall.name = 'CupWall';
  const stripe = new Mesh(cupBand, band);
  stripe.name = 'CupBand';
  root.add(wall, stripe);
  if (withTea) {
    const tea = new Mesh(teaSurface, greenTea);
    tea.name = 'Tea';
    root.add(tea);
  }
  return root;
}

/**
 * A low wooden cabinet against the wall under the phone, with the tea
 * things on top: the hot-water urn at the back ('TeaUrn', its push pad on
 * the lid), a green can of powdered tea and two cups stacked at the front.
 * Origin: floor, wall contact at the cabinet's middle; front -Z; 0.32 wide,
 * 0.3 deep, the cabinet 0.5 high and the urn's lid at 0.78.
 */
export function createTeaStation(): Group {
  const root = new Group();
  root.name = 'TeaStation';
  const H = 0.5;
  const cabinet = new Mesh(mergeBoxes([
    { w: 0.32, h: H - 0.02, d: 0.3, x: 0, y: (H - 0.02) / 2, z: -0.15 },
    { w: 0.34, h: 0.02, d: 0.31, x: 0, y: H - 0.01, z: -0.155 },
  ]), cabinetWood);
  cabinet.name = 'TeaCabinet';
  // Two sliding doors' panels and their finger pulls on the front.
  const doors = new Mesh(mergeBoxes([
    { w: 0.145, h: 0.38, d: 0.006, x: -0.075, y: 0.24, z: -0.302 },
    { w: 0.145, h: 0.38, d: 0.006, x: 0.075, y: 0.24, z: -0.302 },
  ]), cabinetDark);
  doors.name = 'TeaCabinetDoors';
  root.add(cabinet, doors);

  // The urn: a tall cream body under a grey lid with a handle and the push pad, the spout at the front.
  const urn = new Group();
  urn.name = 'TeaUrn';
  urn.position.set(-0.06, H, -0.13);
  const body = new Mesh(new CylinderGeometry(0.085, 0.09, 0.22, 28).translate(0, 0.11, 0), urnBody);
  body.name = 'UrnBody';
  const top = new Mesh(mergeGeometries([
    [new CylinderGeometry(0.075, 0.086, 0.04, 28), new Matrix4().makeTranslation(0, 0.24, 0)],
    [new CylinderGeometry(0.028, 0.028, 0.012, 20), new Matrix4().makeTranslation(0, 0.265, 0)],
    [new TorusGeometry(0.06, 0.008, 8, 20, Math.PI), new Matrix4().makeTranslation(0, 0.255, 0)],
    [mergeBoxes([{ w: 0.03, h: 0.025, d: 0.05, x: 0, y: 0.17, z: -0.095 }]), new Matrix4()],
  ]), urnTop);
  top.name = 'UrnLid';
  urn.add(body, top);

  // The powdered tea in its can, and two cups stacked, at the front.
  const can = new Mesh(new CylinderGeometry(0.034, 0.034, 0.1, 20).translate(0.095, H + 0.05, -0.235), canGreen);
  can.name = 'TeaCan';
  const lid = new Mesh(new CylinderGeometry(0.035, 0.035, 0.016, 20).translate(0.095, H + 0.108, -0.235), canLid);
  lid.name = 'TeaCanLid';
  const stack = new Group();
  stack.name = 'CupStack';
  for (let i = 0; i < 2; i++) {
    const cup = createYunomi(false);
    cup.position.set(0.1, H + i * 0.03, -0.12);
    stack.add(cup);
  }
  root.add(urn, can, lid, stack);
  return root;
}
