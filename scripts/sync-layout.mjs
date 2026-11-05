/**
 * Moves the scene nodes listed in src/layout.ts (SCENE_LAYOUT) to the
 * positions computed from its constants, and writes their station zone sizes.
 * Usage: npm run layout
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('src/layout.ts', root), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
const layout = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const scenePath = new URL('public/scenes/main.iwsdk.scene.json', root);
const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
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

const missing = Object.keys(layout.SCENE_LAYOUT).filter((id) => !seen.has(id));
writeFileSync(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
console.log(`layout: updated ${seen.size} scene nodes`);
if (missing.length) console.warn(`layout: not in the scene yet: ${missing.join(', ')}`);
