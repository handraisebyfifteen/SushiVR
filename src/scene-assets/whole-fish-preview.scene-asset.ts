import { Group, type Mesh, type Object3D } from '@iwsdk/core';
import { createKitchenTimer, createSaltBowl, createVinegarPot, createWaterBowl, createZaru, kohadaRow } from './lib/cure-look.js';
import { flounder, hamachiHalf, stripedJack, wholeSaba } from './lib/fillet-look.js';

/**
 * Stage 4's fish for inspection (asset preview only, not placed in the
 * scene): each row a fish, whole on the left and as it lies once filleted on
 * the right (the fillets laid flesh up, their skin, belly bones and pin
 * bones still on). Rows: the striped jack, the flounder dark side up, the
 * flounder white side up, the hamachi half (unwrapped, and in its wrapping),
 * the saba (whole, and filleted for curing), the eight kohada (whole and
 * loose beside their bowl of ice, and opened, half with their backbone
 * still in; behind them, headless with the dorsal fin and belly cut off,
 * the cut bellies and fins piled), and the drainboard's things: the bamboo basket (its salt half
 * on), the enamel vinegar container, the bowl of water, the salt bowl and a
 * kitchen timer.
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
  // The eight loose, beside their bowl of ice (as on the wash board).
  const loose = kohadaRow().root;
  loose.getObjectByName('Bowl')!.visible = true;
  place(loose, 0, 1.15);
  const opened = kohadaRow().root;
  opened.traverse((o) => {
    const m = /^K(\d)(Open|Spine)?$/.exec(o.name);
    if (m) o.visible = m[2] === 'Open' || (m[2] === 'Spine' && Number(m[1]) % 2 === 0);
    if (/^[HF]\d$/.test(o.name) || o.name === 'Scales') o.visible = false;
  });
  place(opened, 0.45, 1.15);
  // Headless, the dorsal fin and the belly cut off (the guts with it): the trimmed fish, the cut bellies and fins piled behind.
  const trimmed = kohadaRow().root;
  trimmed.name = 'KohadaTrimmed';
  loose.name = 'KohadaWhole';
  trimmed.traverse((o) => {
    if (/^(K\d|H\d|F\d|Scales)$/.test(o.name)) o.visible = false;
    if (/^K\dTrim$/.test(o.name) || o.name === 'GutsPile') o.visible = true;
  });
  place(trimmed, 0, 1.7);
  // The basket with its salt half on (the front half white), the vinegar container, the bowl of water, the salt bowl, a timer.
  const zaru = createZaru(0.21);
  const salt = zaru.getObjectByName('SaltBed') as Mesh;
  const pos = salt.geometry.attributes.position;
  const color = salt.geometry.attributes.color;
  for (let k = 0; k < pos.count; k++) color.setW(k, pos.getZ(k) > -0.01 ? 1 : 0.25);
  place(zaru, 0.85, 1.15);
  place(createVinegarPot(0.25, 0.14), 0.85, 1.42);
  place(createWaterBowl(0.08), 0.55, 1.42);
  place(createSaltBowl(), 0.4, 1.42);
  place(createKitchenTimer(), 0.25, 1.42);
  return root;
}
