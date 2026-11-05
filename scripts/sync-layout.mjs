/**
 * Moves the scene nodes listed in src/layout.ts (SCENE_LAYOUT) to the
 * positions computed from its constants, writes their station zone sizes,
 * and lays out the neta case: one node per item in src/menu.ts (CASE_ORDER),
 * created, moved or removed to match. Prints how far a seated chef must lean
 * to reach each case item.
 * Usage: npm run layout            (writes the scene)
 *        npm run layout -- --check (writes nothing; exits 1 if the scene would change)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const root = new URL('../', import.meta.url);
async function load(path) {
  const source = readFileSync(new URL(path, root), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const layout = await load('src/layout.ts');
const menu = await load('src/menu.ts');
const check = process.argv.includes('--check');

const scenePath = new URL('public/scenes/main.iwsdk.scene.json', root);
const before = readFileSync(scenePath, 'utf8');
const scene = JSON.parse(before);
const round = (v) => Math.round(v * 10000) / 10000;
const seen = new Set();

function visit(nodes) {
  for (const node of nodes ?? []) {
    const entry = layout.SCENE_LAYOUT[node.id];
    if (entry) {
      seen.add(node.id);
      node.transform = { ...(node.transform ?? {}), position: entry.position.map(round) };
      if (entry.station) {
        const station = node.components?.Station;
        if (!station) throw new Error(`${node.id} has no Station component`);
        for (const [k, v] of Object.entries(entry.station)) station[k] = round(v);
      }
    }
    visit(node.children);
  }
}
visit(scene.nodes);

// --- the neta case items ---
const BLOCKS = new Set(['saku', 'sheet', 'tentacle', 'shell', 'block']);
const order = menu.CASE_ORDER;
const zoneStart = order.findIndex((id) => menu.NETA[id].hand === 'rice');
const xs = layout.caseItemXs(order.map((id) => menu.NETA[id].look.width), zoneStart);
const caseNodes = order.map((id, i) => {
  const def = menu.NETA[id];
  const nodeId = menu.caseAssetId(id);
  const transform = { position: [xs[i], layout.NETA_FLOOR_Y, layout.NETA_FRONT_Z].map(round) };
  // Blocks lie along +X from their uncut end: turn that end toward the chef.
  if (BLOCKS.has(def.look.shape)) transform.rotationDeg = [0, 90, 0];
  return {
    id: nodeId,
    name: `Case: ${def.name}`,
    content: { type: 'asset', asset: nodeId, castShadow: false, receiveShadow: true },
    transform,
    components: { CaseItem: { neta: id, remaining: def.stock } },
  };
});
const isCaseNode = (n) => n.id.startsWith('case-') || n.id.startsWith('saku-');
const kept = scene.nodes.filter((n) => !isCaseNode(n));
const at = kept.findIndex((n) => n.id === 'neta-case');
if (at < 0) throw new Error('no neta-case node');
kept.splice(at + 1, 0, ...caseNodes);
scene.nodes = kept;

const after = `${JSON.stringify(scene, null, 2)}\n`;
const missing = Object.keys(layout.SCENE_LAYOUT).filter((id) => !seen.has(id));
if (missing.length) console.warn(`layout: not in the scene yet: ${missing.join(', ')}`);

// --- reach report: grasp point at the chef-side end of each item ---
const shoulderY = layout.SEATED_EYE_HEIGHT - layout.SHOULDER_BELOW_EYES;
const reach = layout.ARM_REACH + 0.09; // palm to the pinch point
const doorEdge = (k) => -layout.NETA_GLASS_WIDTH / 2 + k * layout.NETA_DOOR_PITCH;
console.log('case item            x       door hand  lean');
order.forEach((id, i) => {
  const def = menu.NETA[id];
  const sx = (def.hand === 'neta' ? -1 : 1) * layout.SHOULDER_HALF_WIDTH;
  const d = Math.hypot(xs[i] - sx, layout.NETA_FLOOR_Y + 0.02 - shoulderY, layout.NETA_FRONT_Z - 0.02 - layout.SHOULDER_BEHIND_EYES);
  const lean = d - reach;
  const door = Math.min(layout.NETA_DOOR_COUNT - 1, Math.floor((xs[i] + layout.NETA_GLASS_WIDTH / 2) / layout.NETA_DOOR_PITCH));
  let stile = '';
  for (let k = 1; k < layout.NETA_DOOR_COUNT; k++) if (Math.abs(xs[i] - doorEdge(k)) < 0.012) stile = '  (on a door edge)';
  console.log(`${id.padEnd(18)} ${xs[i].toFixed(3).padStart(7)}  ${door}    ${def.hand.padEnd(4)}  ${lean > 0 ? `${(lean * 100).toFixed(0)} cm` : 'ok'}${stile}`);
});

if (check) {
  const changed = after !== before;
  console.log(changed ? 'layout: the scene is out of date (run npm run layout)' : 'layout: the scene is up to date');
  process.exit(changed ? 1 : 0);
}
writeFileSync(scenePath, after);
console.log(`layout: updated ${seen.size} scene nodes and ${caseNodes.length} case items`);
