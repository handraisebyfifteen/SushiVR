import { Group, type Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { createChopsticks, createEggPack, createPestle, createSuribachi, createTamagoPan, SURIBACHI_FLOOR, SURIBACHI_RIM, SURIBACHI_TOP, tamagoMakings } from './lib/tamago-look.js';

/**
 * The full difficulty's tamago tools for inspection (asset preview only, not
 * placed in the scene), left to right: the scallops and eggs as they come in
 * the ice box; the suribachi with the scallops in pieces and its pestle at
 * rest against the rim; the scallops ground to a paste; the batter frothy with
 * the chopsticks laid beside it; the pack of eggs; the square copper pan with
 * a baked tamago in it.
 */
export function createTamagoToolsPreview(): Group {
  const root = new Group();
  root.name = 'TamagoToolsPreview';
  const place = (o: Object3D, x: number, name?: string) => {
    o.position.set(x, 0, 0);
    if (name) o.name = name;
    root.add(o);
  };
  place(tamagoMakings().root, -0.3, 'Makings');
  const states: Array<[string, (s: ReturnType<typeof createSuribachi>) => void]> = [
    ['SuribachiLumps', (s) => (s.lumpy.visible = true)],
    ['SuribachiGround', (s) => (s.smooth.visible = true)],
    [
      'SuribachiFrothy',
      (s) => {
        s.batter.visible = s.froth.visible = true;
        s.frothMat.opacity = 0.9;
        s.batterMat.color.set('#F2CF6A');
      },
    ],
  ];
  states.forEach(([name, set], i) => {
    const s = createSuribachi();
    set(s);
    place(s.bowl, -0.07 + i * 0.22, name);
  });
  // The pestle at rest in the first: its tip on the floor, leaning on the rim toward the chef's right (as the system lays it).
  const pestle = createPestle();
  const tip = new Vector3(-0.07 - 0.026, SURIBACHI_FLOOR + 0.003, 0.026);
  const dir = new Vector3(-0.07 + SURIBACHI_RIM * 0.7, SURIBACHI_TOP + 0.013, -SURIBACHI_RIM * 0.7).sub(tip).normalize();
  pestle.position.copy(tip);
  pestle.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
  root.add(pestle);
  // The chopsticks laid beside the frothy one, as the system lays them.
  const sticks = createChopsticks();
  sticks.position.set(-0.07 + 2 * 0.22 + SURIBACHI_RIM + 0.03, 0.004, -0.1);
  sticks.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(0.12, 0.02, 1).normalize());
  root.add(sticks);
  place(createEggPack(), 0.55, 'Eggs');
  const { pan, egg } = createTamagoPan();
  egg.egg.visible = true;
  place(pan, 0.82, 'Pan');
  return root;
}
