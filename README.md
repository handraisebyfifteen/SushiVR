# Sushi VR

A sushi-restaurant simulator for WebXR, built for the Meta VR Start Developer
Competition 2026. It runs in the browser of a VR headset such as Meta Quest with
no installation: open the URL and start making sushi.

> Work in progress. The first playable slice is in: a seated sushi counter
> where you make and serve one nigiri at a time using hand tracking only.

Read this in Japanese: [README.ja.md](README.ja.md)

## Getting started

Node.js 22.12 or newer is required (see [`.nvmrc`](.nvmrc)).

```sh
npm install
npm run dev
```

This starts the managed development browser. You do not need a headset to try
it: the built-in emulator (IWER) lets you simulate a VR session, controllers,
and hand tracking from your desktop. Use the Runtime / Editor toggle in the
browser window to switch between the running app and the scene editor.

Other useful commands:

```sh
npm run typecheck   # TypeScript type check
npm run build       # production build into dist/
npm run preview     # serve the production build locally
```

## How to play (hand tracking)

The full sushi-bar flow (orders, cutting to order, nigiri with rhythm timing,
serving etiquette and scoring) is being rebuilt in parts. This build contains
the bar layout and the two things that work everywhere in it:

- **Layout** (seated, no controllers): the 1 m cutting board in front of you with
  the wasabi dish (left) and tezu bowl (right) at its back edge, the knife and
  wet cloth to the right, the glass neta case with three fish blocks beyond the
  board, and the customer counter with the serving stand (geta) behind that.
  The rice tub is low on your right, out of view. The washing station (basin,
  soap, hand towel) is behind you.
- **Turn around**: look far to the left and hold for half a second. The view
  blinks and the bar turns 180 degrees, so the washing station is in front of
  you. Do the same to turn back. You never leave the stool.
- **Move the small dishes**: pinch the wasabi dish or the tezu bowl to move it
  along the board. It settles on the board where you let go and is remembered
  for next time.

Debug overlay: add `?debug=1` to the URL to show station names and a status
panel (facing, hand gestures). During `npm run dev` the D key toggles it too.
Neither appears in production builds without the flag.

## Project layout

| Path | Purpose |
| --- | --- |
| `iwsdk.config.json` | Project authority: active scene, asset/component modules, XR and world features |
| `src/index.ts` | App entry point: `World.create()` and system registration |
| `src/assets.ts` | Asset catalog shared by the runtime and the editor |
| `src/components.ts` | Component catalog shared by the runtime and the editor |
| `src/scene-assets/` | 3D models built in code (no external model files) |
| `public/scenes/` | Scene composition (JSON) |
| `public/ui/` | UI panels (`.uikitml`) |

## Design constraints

- All in-game text is English.
- No real company, brand, or product names.
- No external 3D models, images, audio, or fonts; geometry is built from
  primitives in code.
- Targets 60 fps or better on a Meta Quest headset.
- Every asset is tracked in [CREDITS.md](CREDITS.md).

## Built with

- [IWSDK (Immersive Web SDK)](https://iwsdk.dev), Meta's WebXR framework
- Three.js, Vite, TypeScript

## License

[MIT](LICENSE). Files generated from IWSDK templates include a copyright notice
from Meta Platforms, Inc.

---

by fifteen
