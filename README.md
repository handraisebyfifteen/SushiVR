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

You are the chef at a small sushi bar, seated, using only your hands. The
right hand is the rice hand and the left hand is the neta (fish) hand; a
single constant (`CHEF_LEFT_HANDED` in `src/tuning.ts`) swaps them.

**Around you**: the 1 m cutting board, with the wasabi dish and tezu bowl
(vinegar water) at its right-back corner (pinch to move them; the spot is
remembered), the knife and wet cloth on the right, the glass neta case with
three fish blocks (saku) beyond the board, and the customer counter with the
serving stand (geta) behind it. The rice tub is low on your right, out of
sight. A stainless prep sink with its faucet, the soap and the hand towel are behind you, with a dish cabinet above the sink.

**Turn around**: look far to the left and hold for a second. The view blinks
and the bar turns 180 degrees. Do the same to turn back. Turning is blocked
while you hold fish, rice, the knife or a finished piece (the wet cloth is
fine: it gets washed at the sink).

**Opening**: turn to the sink, pinch the soap pump, rub both hands under the
faucet, then rub the towel. Service starts when your hands are dry. During
service wash with water only; soap now would make the food smell of it.

**One order** (the card above the customer shows the fish color and whether
wasabi is wanted):

1. Left hand: pinch the ordered saku in the case and set it on the board. A
   wrong one glows amber; pinch it back into the case. A hand that needs
   washing cannot touch the fish.
2. Right hand: make a fist on the knife. With the left palm resting on the
   saku, draw the blade toward you along the white guide line: one slice.
   Wipe the blade on the wet cloth before opening your hand to put it down.
3. Left hand: pinch the slice; it rests on your fingers.
4. Right hand: dip in the tezu bowl (beat 1), reach down to the rice tub on
   your right and come back up (beat 2, judged). Without tezu nothing comes
   back. A fist rounds the rice.
5. If wasabi is ordered: touch the wasabi dish with the right index finger,
   then the slice.
6. Bring the palms together: the rice settles on the neta. A ring now
   shrinks to a target ring on every beat.
7. Touch 1: right fist on the beat.
8. Push the left hand gently forward while curling its fingers: the piece
   rolls over, neta on top.
9. Touch 2: pinch the piece on the beat.
10. Keep pinching and turn the hand clockwise: the piece spins half a turn.
11. Touch 3: pinch on the beat. The piece is done.
12. Pinch it, carry it over the case and let go on the geta. Turn your hand
    while carrying to set its heading.
13. Hold a fist over the geta for a second to serve.

**Serving etiquette**: the first piece for a new customer goes straight
across the geta; the customer reaches for it and shows which hand they use.
From then on place pieces diagonally, head end (the thick end of the slice)
toward the customer, sloping from the customer's upper left to lower right
for a right-handed guest and mirrored for a left-handed one. Silver-skinned
fish shows its skin edge on the customer's right when cut at the guide line.

**Scoring**: each piece is graded Excellent / Good / Poor / Bad from the four
timed beats, the right fish, wasabi, orientation, hospitality (handedness),
freshness since the cut, and hygiene (unwashed hands, a dirty board, soap
during service, an unwiped knife). The grade and small icons for any
penalties appear above the customer. After a few pieces the customer leaves
and the next one sits down.

**Hygiene**: every piece leaves rice and fish oil on your hands; after five
they need washing. Moving a dish also makes that hand need washing. Wipe the
board with the wet cloth after serving, then wash the cloth at the sink,
which washes your hands too. Everything a hand can act on is marked with a
soft ring; mistakes flash amber.

Debug overlay: add `?debug=1` to the URL to show station names and a status
panel (hands, hygiene, order, piece). During `npm run dev` the D key toggles
it and the O key opens the bar with clean hands. Neither key exists in
production builds, and nothing shows without the flag.

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
