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

Sit at the counter. Everything is within arm's reach; no controllers are used.
A glowing ring marks the station where your hand can act next. A small ring under
a palm shows that hand's state: grey needs washing, yellow needs the towel, blue
is wet from the tezu bowl. No ring means the hand is clean and dry.

The steps follow the order a sushi chef actually works:

1. **Wash**: put both hands in the basin (far left) and squeeze a fist three times.
2. **Dry**: squeeze a fist twice on the towel (far right) with each hand.
3. **Tezu**: dip an open hand in the small bowl of vinegar water. Rice will not
   stick to a wet hand. Taking rice with a dry hand flashes amber and nothing happens.
4. **Rice**: make a fist inside the rice tub with the wet hand. A rice ball sits in
   your palm; squeezing rounds it.
5. **Open the neta box**: pinch the lid with the other hand. You touched something
   that is not food, so that hand now needs the towel before it touches the fish.
6. **Neta**: pinch a tuna slice from the tray. It rests on that palm.
7. **Wasabi**: touch the wasabi dish with the index finger of the rice hand, then
   touch the neta with it.
8. **Join**: bring the palms together with the rice hand open. The rice settles
   onto the neta.
9. **Shape**: squeeze a fist three times with either hand while the hands are
   together. The piece turns over on the second squeeze so the neta is on top.
10. **Serve**: pinch the finished nigiri off the palm, release it on the serving
    stand (geta), then hold a fist over the stand for one second to confirm. The
    sushi slides away to the customer. Serving cannot be undone, which is why it
    needs a long press.

Each piece needs tezu again, and the neta box closes between pieces. After every
three pieces, rice grains have built up on your hands and both need washing again.

Gesture rules: **pinch** picks up small items and confirms. **Fist** squeezes and
rubs, and a **long fist** confirms irreversible actions. There is no cursor; where
your hand is decides what it can do. Mistakes flash amber on the station involved
and light up the station that fixes them.

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
