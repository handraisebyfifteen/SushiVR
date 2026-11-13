import { Group } from '@iwsdk/core';
import { createFlame, createKnobMark, createNet, createPot, ingredientLook, POT_SPECS, type PotId, searBelly } from './lib/range-look.js';
import { createHangiri, createPitcher, createShamoji, riceGeometry } from './lib/shari-look.js';

/**
 * Inspection only (not placed in the scene): the morning's back-row work
 * laid out on a 1 m strip. Front row: the hangiri with cut shari, the
 * shamoji with a scoop on it, the awasezu bowl pouring. Back row: the four
 * pots with what simmers in them (two raw, two cooked), a flame under one,
 * and the grill net with the bonito belly on its skewers, half seared.
 */
export function createBackRowPreview(): Group {
  const root = new Group();
  root.name = 'BackRowPreview';
  const hangiri = createHangiri();
  const rice = hangiri.getObjectByName('Rice') as import('@iwsdk/core').Mesh;
  rice.geometry = riceGeometry('spread', 0.8);
  rice.visible = true;
  hangiri.position.set(-0.3, 0, 0.15);
  const shamoji = createShamoji();
  shamoji.getObjectByName('Lump')!.visible = true;
  shamoji.position.set(0.02, 0.01, 0.28);
  shamoji.rotation.y = 0.4;
  const pitcher = createPitcher();
  pitcher.position.set(0.25, 0, 0.18);
  pitcher.rotation.x = -0.6;
  const stream = pitcher.getObjectByName('Stream')!;
  stream.visible = true;
  stream.scale.y = 0.12;
  stream.position.set(0, 0.07, -0.07);
  root.add(hangiri, shamoji, pitcher);
  const ids: PotId[] = ['Octopus', 'SeaEel', 'Hamaguri', 'Abalone'];
  ids.forEach((id, i) => {
    const pot = createPot(id);
    pot.position.set(-0.42 + i * 0.25, 0, -0.2);
    const look = ingredientLook(id);
    look.root.position.y = POT_SPECS[id].depth - look.top * 0.6;
    if (i % 2) for (const t of look.tints) t.material.color.copy(t.cooked);
    pot.add(look.root);
    if (i === 0) {
      pot.getObjectByName('Bubbles')!.visible = true;
      const flame = createFlame();
      flame.visible = true;
      flame.position.y = -0.02;
      pot.add(flame);
    }
    root.add(pot);
  });
  const net = createNet();
  net.position.set(0.5, 0.02, 0.1);
  const belly = searBelly();
  belly.skewers.visible = true;
  belly.sear[0].opacity = 0.8;
  belly.sear[1].opacity = 0.6;
  belly.root.position.set(0.5, 0.024, 0.1);
  const knob = createKnobMark();
  knob.position.set(0.5, 0.05, -0.2);
  knob.rotation.z = Math.PI / 2;
  root.add(net, belly.root, knob);
  return root;
}
