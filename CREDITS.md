# Credits

Every asset shipped with Sushi VR is listed here. **When you add an asset
(3D model, texture, image, audio, font, or anything else), add a row to this
table in the same change.** If the origin of a file cannot be determined, write
`UNKNOWN` in the Source column rather than guessing.

Column meanings:

- **File**: path in this repository, or the module that produces the asset.
- **Asset name**: the manifest ID (`src/assets.ts`) or a human-readable name.
- **Source (URL)**: where the asset came from. `Original (this project)` means it
  was authored in this repository.
- **License**: license the asset is distributed under.
- **Commercial use**: whether the license permits commercial use.
- **Attribution required**: whether the license requires credit in the app or docs.
- **Date added**: ISO date (YYYY-MM-DD) the row was added.

| File | Asset name | Source (URL) | Author | License | Commercial use | Attribution required | Date added |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/scene-assets/room.scene-asset.ts` | `room-floor` (procedural floor plane) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/room.scene-asset.ts` | `chef-platform` (procedural raised kitchen floor) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `counter` (procedural chef counter) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `ledge` (procedural raised serving step) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `customer-counter` (procedural customer counter, one step lower) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `cutting-board` (procedural 1 m manaita) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `geta` (procedural serving stand) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `neta-case` (procedural refrigerated showcase: stainless base, green floor, sloped glass, compressor housing) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `saku-tuna`, `saku-white`, `saku-silver` (procedural fish blocks) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `knife` (procedural yanagiba) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `wet-cloth` (procedural fukin) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `tezu-bowl` (procedural vinegar-water bowl) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `wasabi-dish` (procedural dish with wasabi mound) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/wash-station.scene-asset.ts` | `sink-unit` (procedural stainless prep sink: sliding-door cabinet, drainboard, basin, backsplash, faucet, dish cabinet above) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/wash-station.scene-asset.ts` | `soap` (procedural soap pump bottle) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/wash-station.scene-asset.ts` | `towel` (procedural folded hand towel) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/turn-system.ts` | Runtime mesh: blink sphere for the turn-around transition (primitive) |
| `src/nigiri-system.ts` | Runtime meshes: rice ball, fish slice, wasabi dab, beat rings, serve-hold bar; judgement words drawn on canvas |
| `src/customer-system.ts` | Runtime meshes: customer figure (sphere, boxes), order card and result icons drawn on canvas |
| `src/cutting-system.ts` | Runtime mesh: cut guide line (primitive) |
| `src/feedback.ts` | Runtime meshes: station highlight rings and frames (primitives) |
| `src/master-system.ts` | Runtime meshes: master figure (sphere, cylinder, boxes) and see-through ghost hands (boxes); his words and the turn arrow drawn on canvas with the browser default font | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/sfx.ts` | Sounds synthesized with the Web Audio API at runtime, including the master's wooden clack (no audio files) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/debug-hud-system.ts` | Debug-only labels and status panel drawn on canvas with the browser default font (no font file) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |

## Removed assets

The following IWSDK starter sample assets were removed on 2026-11-05 and are no
longer part of the project (they remain in git history before that date):

- `public/audio/chime.mp3` (starter sound)
- `public/ui/welcome.uikitml`, `label-grab.uikitml`, `label-select.uikitml`, `label-spin.uikitml` (starter UI panels)
- `src/scene-assets/studio.scene-asset.ts`, `decor.scene-asset.ts` (starter floor, stage, plinths, graphite pieces, furniture)
- Remote glTF `robot` loaded from `@iwsdk/example-assets` on jsDelivr (starter robot)

The Part 2/3 rice tub, neta tray and neta-box lid meshes were replaced on
2026-11-05 by the sushi-bar layout above (`src/nigiri-system.ts` removed).

## Framework

The app is built on the [Immersive Web SDK (IWSDK)](https://iwsdk.dev) by Meta
Platforms, Inc., distributed under the MIT License. IWSDK and its npm
dependencies (Three.js, uikit, and others) are installed via `package.json` and
are not listed per-file above; see each package's own license in `node_modules`.
