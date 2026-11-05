import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from '@iwsdk/core';
import { ICE_BOX_DEPTH, ICE_BOX_HEIGHT, ICE_BOX_ICE_TOP, ICE_BOX_WALL, ICE_BOX_WIDTH } from '../layout.js';
import { boxBatch, type BoxPart, mergeBoxes } from './lib/batch.js';
import { seeded } from './lib/neta-paint.js';

const styrofoam = new MeshStandardMaterial({ color: '#F1F0EA', roughness: 0.97 });
const ice = new MeshStandardMaterial({ color: '#D3E4EC', roughness: 0.16, metalness: 0 });

/**
 * The styrofoam box (発泡スチロール) the morning's fish arrive in, packed
 * with crushed ice. The materials lie on the ice (runtime meshes, see
 * src/prep-cut-system.ts). Origin: bottom centre, on the counter; the open
 * top faces up, the long side faces the chef.
 */
export function createIceBox(): Group {
  const W = ICE_BOX_WIDTH;
  const D = ICE_BOX_DEPTH;
  const H = ICE_BOX_HEIGHT;
  const t = ICE_BOX_WALL;
  const root = new Group();
  root.name = 'IceBox';

  // Thick foam walls with a slightly thicker rim band, like a moulded box.
  const lip = 0.008;
  const walls = new Mesh(
    mergeBoxes([
      { w: W, h: 0.015, d: D, x: 0, y: 0.0075, z: 0 },
      { w: W, h: H, d: t, x: 0, y: H / 2, z: D / 2 - t / 2 },
      { w: W, h: H, d: t, x: 0, y: H / 2, z: -D / 2 + t / 2 },
      { w: t, h: H, d: D - 2 * t, x: W / 2 - t / 2, y: H / 2, z: 0 },
      { w: t, h: H, d: D - 2 * t, x: -W / 2 + t / 2, y: H / 2, z: 0 },
      // Moulded band just under the rim, outside.
      { w: W + lip, h: 0.014, d: lip, x: 0, y: H - 0.012, z: D / 2 + lip / 2 - 0.002 },
      { w: W + lip, h: 0.014, d: lip, x: 0, y: H - 0.012, z: -D / 2 - lip / 2 + 0.002 },
      { w: lip, h: 0.014, d: D, x: W / 2 + lip / 2 - 0.002, y: H - 0.012, z: 0 },
      { w: lip, h: 0.014, d: D, x: -W / 2 - lip / 2 + 0.002, y: H - 0.012, z: 0 },
    ]),
    styrofoam,
  );
  walls.name = 'Box';

  // The packed ice: a bed, then loose chunks scattered over its top.
  const innerW = W - 2 * t;
  const innerD = D - 2 * t;
  const bedTop = ICE_BOX_ICE_TOP - 0.008;
  const bed = new Mesh(new BoxGeometry(innerW, bedTop - 0.015, innerD), ice);
  bed.name = 'IceBed';
  bed.position.y = 0.015 + (bedTop - 0.015) / 2;
  const rand = seeded('ice-box');
  const chunks: BoxPart[] = [];
  for (let i = 0; i < 90; i++) {
    const s = 0.012 + rand() * 0.014;
    chunks.push({
      w: s,
      h: s * (0.6 + rand() * 0.4),
      d: s * (0.7 + rand() * 0.5),
      x: (rand() - 0.5) * (innerW - s),
      y: bedTop + (rand() - 0.3) * 0.006,
      z: (rand() - 0.5) * (innerD - s),
      rx: rand() * Math.PI,
      ry: rand() * Math.PI,
      rz: rand() * Math.PI,
    });
  }
  const loose = boxBatch('IceChunks', ice, chunks);
  root.add(walls, bed, loose);
  return root;
}
