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
| `src/scene-assets/counter.scene-asset.ts` | `counter` (procedural counter body) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `cutting-board` (procedural tsukedai) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `geta` (procedural serving stand) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `rice-tub` (procedural ohitsu with rice mound) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `neta-tray` (procedural tray with tuna slices) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/nigiri-system.ts` | Runtime meshes: rice ball, tuna slice, highlight rings, serve progress bar (primitives) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |

## Removed assets

The following IWSDK starter sample assets were removed on 2026-11-05 and are no
longer part of the project (they remain in git history before that date):

- `public/audio/chime.mp3` (starter sound)
- `public/ui/welcome.uikitml`, `label-grab.uikitml`, `label-select.uikitml`, `label-spin.uikitml` (starter UI panels)
- `src/scene-assets/studio.scene-asset.ts`, `decor.scene-asset.ts` (starter floor, stage, plinths, graphite pieces, furniture)
- Remote glTF `robot` loaded from `@iwsdk/example-assets` on jsDelivr (starter robot)

## Framework

The app is built on the [Immersive Web SDK (IWSDK)](https://iwsdk.dev) by Meta
Platforms, Inc., distributed under the MIT License. IWSDK and its npm
dependencies (Three.js, uikit, and others) are installed via `package.json` and
are not listed per-file above; see each package's own license in `node_modules`.
