import { Group, Mesh } from '@iwsdk/core';
import { NETA, type NetaId } from '../menu.js';
import { sliceLook } from './lib/neta-look.js';
import { makeNetaMaterial, NetaPattern, restMaterial } from './lib/neta-material.js';
import { Drape, SHARI_FINISHED, SHARI_HALF_LENGTH, SHARI_HALF_WIDTH, SHARI_HEIGHT, Shari, TOPPING_STIFFNESS } from './lib/nigiri-form.js';

/**
 * Inspection only (not placed in the shop): the nigiri's shapes laid out
 * side by side. Back row (-Z): the shari at each step, loose from the tub,
 * rounded in the fist, after touch 1, after touch 2, finished. Front row:
 * finished pieces of a few toppings, as the game builds them
 * (src/assembly/nigiri.ts). Origin: the table; pieces stand on y = 0.
 */
const SHOWN: readonly NetaId[] = ['LeanTuna', 'MediumFattyTuna', 'Kohada', 'Prawn', 'Tamago'];
const PITCH = 0.085;

export function createNigiriStages(): Group {
  const root = new Group();
  root.name = 'NigiriStages';
  const rice = restMaterial(makeNetaMaterial('shari-preview', NetaPattern.Shari, '#F4F0E7', '#DCD2BF', [SHARI_HALF_LENGTH * 2, SHARI_HEIGHT, SHARI_HALF_WIDTH * 2], 0.7, 0.3));
  for (let i = 0; i <= SHARI_FINISHED; i++) {
    const shari = new Shari();
    shari.reseed(2.4);
    shari.shape(i);
    const mesh = new Mesh(shari.geometry, rice);
    mesh.name = `ShariStage${i}`;
    mesh.position.set((i - SHARI_FINISHED / 2) * PITCH, 0, -0.06);
    root.add(mesh);
  }
  SHOWN.forEach((id, i) => {
    const piece = new Group();
    piece.name = `Nigiri_${id}`;
    piece.position.set((i - (SHOWN.length - 1) / 2) * PITCH, 0, 0.06);
    const shari = new Shari();
    shari.reseed(3.1 + i);
    shari.shape(SHARI_FINISHED);
    const look = sliceLook(id);
    const drape = new Drape(look.geometry);
    drape.bend(TOPPING_STIFFNESS[NETA[id].look.shape] ?? 1);
    const yaw = look.blockAxes ? -Math.PI / 2 : 0;
    const base = new Mesh(shari.geometry, rice);
    base.name = 'Shari';
    base.rotation.set(0, drape.alongZ ? yaw - Math.PI / 2 : yaw, 0, 'YXZ');
    const neta = new Mesh(drape.geometry, restMaterial(look.material));
    neta.name = 'Neta';
    neta.rotation.set(0, yaw, 0);
    neta.position.y = shari.height - drape.minY - 0.0008;
    piece.add(base, neta);
    root.add(piece);
  });
  return root;
}
