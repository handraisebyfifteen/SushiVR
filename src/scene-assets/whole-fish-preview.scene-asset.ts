import { Group, type Object3D } from '@iwsdk/core';
import { createSaltBowl, createTray, createVinegarBottle, kohadaRow } from './lib/cure-look.js';
import { flounder, hamachiHalf, stripedJack, wholeSaba } from './lib/fillet-look.js';

/**
 * Stage 4's fish for inspection (asset preview only, not placed in the
 * scene): each row a fish, whole on the left and as it lies once filleted on
 * the right (the fillets laid flesh up, their skin, belly bones and pin
 * bones still on). Rows: the striped jack, the flounder dark side up, the
 * flounder white side up, the hamachi half (unwrapped, and in its wrapping),
 * the saba (whole, and filleted for curing), the eight kohada (whole, and
 * opened, half with their backbone still in), and the drainboard's tray
 * (salted, and in vinegar), salt bowl and vinegar bottle.
 */
function show(root: Object3D, names: (name: string) => boolean | null): Object3D {
  root.traverse((o) => {
    if (o === root || !o.name) return;
    const v = names(o.name);
    if (v !== null) o.visible = v;
  });
  return root;
}

const WHOLE = new Set(['Head', 'FilletTop', 'FilletBottom', 'TopBack', 'TopBelly', 'BotBack', 'BotBelly', 'ScalesTop', 'ScalesBottom']);
/** The filleted view: the whole fish's pieces gone, the bone and every laid-out part shown. */
const filleted = (name: string) => (WHOLE.has(name) ? false : name === 'Guts' || name === 'Fish' ? null : true);

export function createWholeFishPreview(): Group {
  const root = new Group();
  root.name = 'WholeFishPreview';
  const place = (o: Object3D, x: number, z: number) => {
    o.position.set(x, 0, z);
    root.add(o);
  };
  place(stripedJack().root, 0, -0.32);
  place(show(stripedJack().root, filleted), 0.8, -0.32);
  place(flounder().root, 0, 0);
  place(show(flounder().root, filleted), 0.8, 0);
  const white = flounder();
  const fish = white.root.getObjectByName('Fish')!;
  fish.rotation.x = Math.PI;
  fish.position.y = white.turnable!.thickness;
  place(white.root, 0, 0.3);
  place(show(hamachiHalf().root, (n) => (n === 'Paper' || n === 'Plastic' ? false : null)), 0, 0.55);
  place(hamachiHalf().root, 0.8, 0.55);
  place(wholeSaba().root, 0, 0.85);
  place(show(wholeSaba().root, filleted), 0.8, 0.85);
  place(kohadaRow().root, 0, 1.15);
  const opened = kohadaRow().root;
  opened.traverse((o) => {
    const m = /^K(\d)(Open|Spine)?$/.exec(o.name);
    if (m) o.visible = m[2] === 'Open' || (m[2] === 'Spine' && Number(m[1]) % 2 === 0);
    if (o.name === 'Heads0' || o.name === 'Heads1' || o.name === 'Scales') o.visible = false;
  });
  place(opened, 0.45, 1.15);
  const salted = createTray(0.21, 0.19);
  salted.getObjectByName('Salt')!.visible = true;
  place(salted, 0.85, 1.15);
  const sour = createTray(0.27, 0.15);
  sour.getObjectByName('Vinegar')!.visible = true;
  place(sour, 0.85, 1.42);
  place(createSaltBowl(), 0.4, 1.42);
  place(createVinegarBottle(), 0.55, 1.42);
  return root;
}
