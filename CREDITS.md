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
| `src/scene-assets/counter.scene-asset.ts` | `counter` (procedural stainless cold table under the manaita: three doors with bar pulls, machine compartment with louvred vent and a blank temperature display, dark plinth; no branding) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `ledge` (procedural raised serving step) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `customer-counter` (procedural customer counter, one step lower) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `cutting-board` (procedural 1 m manaita) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `geta` (procedural serving stand) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `neta-case` (procedural refrigerated showcase: stainless base, green floor, front and top glass sloped for a view in, LED strip, compressor housing, 1.5 m long with five chef-side sliding glass doors with pull handles on two rails) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `rice-tub` (procedural ohitsu: cypress tub with two copper hoops, rice, a lid with a handle, on a low dark-wood stand) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/case-items.scene-asset.ts`, `src/scene-assets/lib/neta-look.ts`, `src/scene-assets/lib/neta-paint.ts`, `src/scene-assets/lib/neta-material.ts` | `case-*` (29 neta-case items from `src/menu.ts`: fish saku, squid sheet, octopus leg, abalone, tamago, ready-cut fillets, prawns, sweet shrimp, shellfish and eel, inari pouches in their broth in a stainless insert pan, uni lobes in overlapping rows on a white-wood ori with a small wooden spatula, salmon roe in a small rustic stoneware bowl with a spoon, roll fillings; gunkan with a tall textured nori band; fat, skin and spot patterns computed per pixel in a code-only shader, no textures) and the nigiri toppings built from them | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-06 |
| `src/scene-assets/lib/hardsurface.ts` | Geometry helpers (`bevelBox` for the rounded saku and tamago blocks), copied unchanged from the IWSDK build-model skill template | IWSDK project template (`.agents/skills/iwsdk-build-model/assets/hardsurface.ts.template`) | Meta Platforms, Inc. | MIT (copyright notice kept in the file) | Yes | Keep the notice | 2026-11-06 |
| `src/scene-assets/counter.scene-asset.ts` | `knife` (procedural yanagiba) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `wet-cloth` (procedural fukin) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `tezu-bowl` (procedural vinegar-water bowl) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `wasabi-dish` (procedural dish with wasabi mound) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/counter.scene-asset.ts` | `nori-box` (procedural nori tin: lacquered red tin with gold lines, its lid hinged at the back, a white perforated plate inside and the nori on it; no lettering, no branding) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-09 |
| `src/scene-assets/counter.scene-asset.ts` | `makisu` (procedural bamboo rolling mat, laid out or rolled up) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-06 |
| `src/scene-assets/wash-station.scene-asset.ts` | `sink-unit` (procedural stainless prep sink: sliding-door cabinet, drainboard, front-set basin, backsplash, long faucet) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/dish-cabinet.scene-asset.ts` | `dish-cabinet` (procedural glass-door dish cabinet with plates and bowls) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/eaves.scene-asset.ts` | `eaves` (procedural tiled eave on timber posts, plain noren, paper lanterns; instanced) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/shop-props.scene-asset.ts` | `trash-bin` (lidded plastic bin), `paper-box` (kitchen-paper box), `phone` (black dial telephone), `food-shelf` (open shelf: soy sauce, mirin, sake and rice vinegar bottles and salt and sugar jars with blank paper labels, tins, boxes and a rice sack), `entrance` (plastered wall, lattice sliding door, indigo noren on a bamboo pole), `phone-shelf` (small wooden wall shelf on brackets), `books-board` (wooden board with a paper sheet under a brass clip), `staff-buttons` (wooden call board with two brass-ringed round buttons bearing a cook and a part-timer silhouette, and a pilot lamp over each); all procedural, no branding | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-06 |
| `src/scene-assets/menu-board.scene-asset.ts` | `menu-board` (row of plain wooden plaques in a dark frame); procedural, no lettering in the model | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-06 |
| `src/menu-board-system.ts` | The menu board's lettering (item names in Japanese, no prices) drawn on canvas at runtime with the device's own Japanese serif font; no font file is shipped | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-06 |
| `src/scene-assets/ice-box.scene-asset.ts` | `ice-box` (procedural styrofoam box packed with crushed ice, for the morning prep) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-06 |
| `src/scene-assets/kitchen-station.scene-asset.ts` | `work-table` (procedural stainless work table, 65 cm wide, with a gas rice cooker underneath and the hangiri and paddle on the wall above) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/kitchen-station.scene-asset.ts` | `gas-stove` (procedural commercial gas range: four burners, oven, side cupboards, wall tiles, pot and kettle; no branding) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/itaba-room.scene-asset.ts` | `itaba-room` (procedural chef's room: walls, ceiling, fluorescent fixtures, kitchen doorway with a long indigo noren, unlit kitchen beyond, floor light spill, the passage to the customer room with a long indigo noren) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/wash-station.scene-asset.ts` | `soap` (procedural soap pump bottle) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/scene-assets/wash-station.scene-asset.ts` | `towel` (procedural hand towel hanging over a small stainless bar on the sink cabinet) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/turn-system.ts` | Runtime mesh: blink sphere for the turn-around transition (primitive) |
| `src/piece-system.ts`, `src/assembly/nigiri.ts`, `src/assembly/gunkan.ts`, `src/assembly/inari.ts`, `src/assembly/maki.ts` | Runtime meshes: rice ball, the nigiri topping (each neta's own shape and material from `neta-look.ts`), the gunkan's nori strip and band with the uni or roe topping, the spatula or spoon in the hand, the inari pouch (open, filled, folded shut), the roll's nori sheet, spread rice, fillings, roll pieces with their cut faces (computed per pixel) and cut guide, wasabi dab, beat rings, serve-hold bar; judgement words drawn on canvas |
| `src/customer-system.ts` | Runtime meshes: customer figure (sphere, boxes) and result icons drawn on canvas; the price paid drawn on canvas with the browser default font |
| `src/staff-system.ts` | Runtime meshes: the cook and the part-timer as plain figures (sphere head, boxes; cook's cap, apron, a wrapped fish to carry) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-06 |
| `src/office-system.ts` | The day's books on the books board, the closing word and the staff's replies, drawn on canvas with the browser default font (no font or image file); the call buttons' lit lamp material | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-06 |
| `src/scene-assets/tea-station.scene-asset.ts` | `tea-station` (procedural low wooden cabinet with a hot-water urn, a can of powdered tea and two stacked tea cups) and the tall tea cup built for each serving; no branding | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-07 |
| `src/gaze.ts` | Eye tracking (look and pinch) for the far targets; reads IWSDK's gaze pose, no assets of its own | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-07 |
| `src/shari-system.ts`, `src/scene-assets/lib/shari-look.ts` | Runtime meshes: the hangiri (cypress tub with copper hoops) and the rice in it (turned out, then cut and spread), the shamoji with a scoop of shari, the bowl of awasezu and its pour, the rice cooker's flame and word | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-08 |
| `src/range-system.ts`, `src/scene-assets/lib/range-look.ts` | Runtime meshes: the four pots with their liquids and bubbles, the burners' flames and knob marks, the grill net, the prepared octopus, conger eels, abalone and gourd strips (raw to cooked), the bonito belly on three skewers with its sear on each face, and the pots' words | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-08 |
| `src/scene-assets/back-row-preview.scene-asset.ts` | `back-row-preview` (inspection only, not placed: the shari and range pieces laid out) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-08 |
| `src/place-system.ts`, `src/far-choice.ts`, `src/prep-api.ts` | Stepping between the stool and the back row, choosing far targets (pointing or gaze), the prep systems' shared calls; no assets of their own | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-08 |
| `src/prep-cut-system.ts`, `src/scene-assets/lib/fillet-look.ts` | Runtime meshes for stage 4: a whole striped jack and a whole flounder lofted from sections (painted skin, scale sheen, eyes, fins, the bone frame, the guts) and cut into the pieces three- and five-piece filleting needs; their fillets laid flesh up (saku, engawa, skin, belly bones, pin bones); a hamachi half in its wrapping; the wash board, the fish shop's long box on ice, the scaler, the deba, the tweezers and the tap's water | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-08 |
| `src/cure-system.ts`, `src/scene-assets/lib/cure-look.ts`, `src/scene-assets/lib/fillet-look.ts` | Runtime meshes for the full difficulty's curing: eight whole kohada (painted skin with its dots, heads, guts, scale sheen), a steel bowl of crushed ice, and the kohada opened flat (butterflied: pale flesh with the backbone's line on top, silver skin with its dark back beneath) with their backbones; a whole saba (the striped jack's sections with its own banded skin) and its two fillets; the stainless tray and the round bamboo basket (a generated basket-weave texture) with their salt sheets (a generated speckle texture, whitened by vertex alpha where salt falls), the white enamel vinegar container with its dark blue rim, the steel bowl of water, two small kitchen timers, the salt bowl, the fish box's low wooden stand, the tap's water; the trays' words | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-09 |
| `src/label-system.ts` | The food shelf's seasoning labels (Salt, Sugar, Soy sauce, Mirin, Sake, Rice vinegar), drawn in English on canvases at runtime with the device's own sans-serif font; no font file shipped | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-09 |
| `src/tamago-system.ts`, `src/scene-assets/lib/tamago-look.ts` | Runtime meshes for the full difficulty's tamago: a square copper tamago pan (tinned inside, wooden handle on a copper socket), the thick omelette block that sets and browns face by face, the steel bowl of batter under wrap; the pan's words | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-09 |
| `src/fish-order.ts`, `src/fish-order-system.ts` | The difficulty sign, the order slip and the case's labels while ordering (text drawn on canvases); no assets of their own | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-09 |
| `src/scene-assets/shop-props.scene-asset.ts` (`createTrashBin`, reused) | A second trash bin by the sink for the washing's scraps (runtime instance of the existing bin) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-08 |
| `src/scene-assets/whole-fish-preview.scene-asset.ts` | `whole-fish-preview` (inspection only, not placed: the stage 4 fish whole and filleted) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-08 |
| `src/tea-system.ts` | Runtime tea cup (from the tea-station module) carried and served; no assets of its own | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-07 |
| `src/scene-assets/lib/nigiri-form.ts` | The shari's shapes through the shaping (loose lump to a finished funagata) and the neta's drape over it, computed procedurally at runtime; rice grains drawn by the neta shader (`src/scene-assets/lib/neta-material.ts`, pattern Shari) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-07 |
| `src/scene-assets/nigiri-stages.scene-asset.ts` | `nigiri-stages` (inspection only, not placed: the shari at each shaping step and five finished nigiri side by side) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-07 |
| `src/order-card.ts` | Order card above the customer and order ticket on the neta case: a small picture of the item, its English name and the wasabi mark, drawn on canvas with the browser default font (no font or image file) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-06 |
| `src/cutting-system.ts` | Runtime mesh: cut guide line (primitive) |
| `src/prep-cut-system.ts`, `src/scene-assets/lib/prep-look.ts` | Runtime meshes: the morning prep's materials (tuna belly with its skin in three zones, bonito half with skins, blood lines and neck, whole squid with body, fins, guts, head and legs, opened legs and sheet with its skin), their paper and plastic wrapping, the kitchen-paper sheet, the cut guide line, and the prep summary drawn on canvas |
| `src/phone-system.ts`, `src/opening-system.ts` | Speech line of the fish shop drawn on canvas with the browser default font; no other assets |
| `src/feedback.ts` | Runtime meshes: station highlight rings and frames (primitives) |
| `src/master-system.ts` | Runtime meshes: master figure in Japanese-style work clothes (sphere, cylinder, boxes; crossed collar, sash, apron, sleeves) and see-through ghost hands (boxes); his words and the turn arrow drawn on canvas with the browser default font | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/sfx.ts` | Sounds synthesized with the Web Audio API at runtime, including the master's wooden clack (no audio files) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/debug-hud-system.ts` | Debug-only labels and status panel drawn on canvas with the browser default font (no font file) | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/neta-case-system.ts` | Runtime sprites: item name tags and the zoom's labels drawn on canvas with the browser default font (no font file); the zoom over an open door reuses the case items' own meshes; door slide and LED brightness animated in code | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |
| `src/practice-system.ts` | Development-only practice mode: key guide panel drawn on canvas with the browser default font (no font file); not in production builds | Original (this project) | by fifteen | MIT (see `LICENSE`) | Yes | No | 2026-11-05 |

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
