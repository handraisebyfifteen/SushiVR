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
npm run layout      # move scene nodes after changing src/layout.ts
```

## How to play (hand tracking)

You are the chef at a small sushi bar, seated, using only your hands. The
right hand is the rice hand and the left hand is the neta (fish) hand; a
single constant (`CHEF_LEFT_HANDED` in `src/tuning.ts`) swaps them.

**Around you** (a Showa-era sushi bar): the kitchen floor is one step above
the customer side. You sit in the middle of a 1 m chef's aisle. In front of
you is the 1 m cutting board (36 cm deep) on a stainless cold table, with the wasabi dish and tezu bowl
(vinegar water) side by side at its right-back corner (pinch to move either;
the spot is remembered), the nori box at its left-back corner, the bamboo
mat (makisu) rolled up at its left edge (it lies open in front of you while
a roll is ordered), and the knife and wet cloth on the right. Beyond the board the
raised tsukedai (30 cm) carries the 1.5 m glass neta case (see below) and,
in front of the case, the serving stand (geta); the lower
customer counter (40 cm) lies beyond it. Over the tsukedai a light tiled
eave on timber posts, left over from the sushi-stall days, carries a short
plain noren and four paper lanterns. The rice tub (ohitsu) sits low on your
right, out of your usual view; its lid slides aside as your hand reaches in
and closes once you have the rice. Behind you are the prep sink with its faucet, the soap and a hand
towel hanging on a bar under the sink's front edge; on the sink's right
stand a stainless work table and a four-burner gas range with an oven, and
on its left a glass-door dish cabinet against the back wall. The kitchen
doorway, with its noren and the brighter kitchen beyond, is at the
left end of the aisle. Fluorescent work lights hang over the board and the
sink.

**The neta case** holds 29 items, left to right: tamago, abalone, octopus,
squid, flounder, striped jack, young yellowtail, bonito, lean / medium fatty
/ fatty tuna, gizzard shad (kohada), horse mackerel, cured mackerel, prawn,
sweet shrimp, scallop, ark shell, egg cockle, sea eel and the inari pouches,
then, at the right end, sea urchin, salmon roe and the roll fillings (tuna
sticks, cucumber, gourd strips, pickled radish, plum paste, shiso). The left
(neta) hand takes the neta; the right-end items are the right hand's (the
uni, its lobes laid in overlapping rows on a white-wood ori with a small
wooden spatula, and the salmon roe in a small rustic stoneware bowl with a spoon,
for gunkan, and the roll fillings). Five sliding doors open by themselves
for either hand. As a hand reaches in, the item nearest the fingers glows
with its name (amber if it is the other hand's), and the items behind the
open door float twice life size above the case, each named, so the close
neighbours are easy to tell apart. Twenty of them make nigiri: twelve are
cut from a block (the tuna, bonito, white fish, cured mackerel, squid,
octopus, abalone, tamago) and get a slice shorter with every cut; eight are
ready-cut and taken one piece at a time (sweet shrimp two at a time). When
one is used up it is sold out: its place is empty and nobody orders it (the
coming prep mode restocks). Counts and order are in `src/menu.ts`.

**Turn around**: look far to the left and hold for a second. The view blinks
and the bar turns 180 degrees. Do the same to turn back. Turning is blocked
while you hold fish, rice, the knife or a finished piece (the wet cloth is
fine: it gets washed at the sink).

**Opening**: turn to the sink, pinch the soap pump, rub both hands under the
faucet, then put both hands on the towel hanging under the sink and grip it
(two fists). Service starts when your hands are dry. During
service wash with water only; soap now would make the food smell of it.

**One order** (the card above the customer shows a picture of the item, its
name and whether wasabi is wanted):

1. Left hand: reach to the case; the glass door in front of the item under
   your fingers slides open by itself. Pinch the ordered block and set it
   on the board; the door closes once you have taken it. A wrong one glows
   amber; pinch it back into the case (the door opens for it again). A
   ready-cut piece (kohada, prawn, shellfish, eel...) comes straight onto
   your fingers instead: go on at step 4; a wrong one is not taken. A hand
   that needs washing cannot touch the fish. While a door is open the order
   ticket shows on the machine housing at the left end.
2. Right hand: make a fist on the knife. With the left palm resting on the
   block, draw the blade toward you along the white guide line at its cut
   end: one slice, and the block, a slice shorter, goes back to the case.
   Wipe the blade on the wet cloth before opening your hand to put it down.
3. Left hand: pinch the slice; it rests on your fingers.
4. Right hand: dip in the tezu bowl (beat 1), reach down to the rice tub on
   your right and come back up (beat 2, judged). Without tezu nothing comes
   back. A fist rounds the rice.
5. If wasabi is ordered: on the way up from the tub, keep the rice in your
   other fingers and bring the right index finger down to the wasabi dish,
   then touch the slice. Wasabi can only be taken while holding the rice.
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

**The master**: an older chef in white Japanese-style work clothes and a
navy apron stands at your left and helps with the basic process, without
text walls. If you stop making progress on a step, he says
what comes next in two or three words above the place to act (with a wooden
clack) and points at it. If you stay stuck, see-through blue hands show the
motion in a loop until you start it yourself. A mistake gets a word right
away (for example "Not that fish"). After a serve he nods, says "Good." for
an excellent piece, or shakes his head with "Again." for a bad one. Once you
have done a step three times he stays quiet about it. The timings are in
`src/tuning.ts` (`MASTER_*`).

**A gunkan** (sea urchin or salmon roe):

1. Right hand: tezu and rice as for a nigiri (steps 4).
2. Left hand: pinch a nori strip from the nori box; it lies on your fingers.
3. Bring the palms together: the nori wraps the rice.
4. If wasabi is ordered: the right index finger to the wasabi dish, then onto
   the rice.
5. Right hand: reach to the case's right end and pinch the tool (the
   wooden spatula on the uni's ori, the spoon in the roe bowl); let go over
   the gunkan and the topping is on (three uni lobes laid lengthwise, or a
   spoonful of roe). A wrong topping is not taken.
6. Pinch it onto the geta and hold a fist to serve, as for a nigiri. The
   nori softens, so freshness runs from the wrap; a gunkan has no head end,
   so any heading is fine.

**An inari** (Kanto style, a plump tawara with its mouth folded under):

1. Right hand: tezu and rice as for a nigiri.
2. Left hand: pinch a seasoned pouch from the case (they sit in a stainless
   insert pan, straight from the pack with their broth); it lies open on
   your fingers.
3. Bring the palms together: the rice goes into the pouch.
4. Make a fist with the left hand on the beat: the mouth folds shut.
5. Onto the geta and serve. No wasabi.

**A roll** (hosomaki: gourd strips, tuna, cucumber, pickled radish, plum and
shiso, plum and cucumber):

1. Left hand: pinch a half sheet of nori from the nori box and let go over
   the mat.
2. Right hand: tezu and rice as for a nigiri, then sweep the open hand side
   to side over the nori (twice across) to spread the rice.
3. If wasabi is ordered: the index finger from the dish onto the rice.
4. Right hand: lay the filling from the case's right end along the middle
   (plum and shiso: shiso, then plum; plum and cucumber: plum, then
   cucumber).
5. Both hands at the near edge of the mat push it away: rolled. Both fists
   together on the beat: squeezed firm.
6. Grip the knife and, with the left hand steadying the roll, draw the blade
   along the white line three times. The first stroke halves the roll and
   the halves lie side by side. The gourd roll is cut into six (cut both
   halves into thirds); the others into eight (halve, lay the four side by
   side, halve again). Wipe and put the knife down.
7. Pinch the pieces (they stand cut face up) onto the geta and serve.

**Serving etiquette**: the first piece for a new customer goes straight
across the geta; the customer reaches for it and shows which hand they use.
From then on place pieces diagonally, head end (the thick end of the slice)
toward the customer, sloping from the customer's upper left to lower right
for a right-handed guest and mirrored for a left-handed one. A slice with a
skin edge (bonito, striped jack, cured mackerel) shows it on the customer's
right when cut at the guide line.

**Scoring**: each piece is graded Excellent / Good / Poor / Bad from the four
timed beats, the right item, wasabi, orientation, hospitality (handedness),
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

Practice mode (desktop emulator, `npm run dev` only): press P in the running
app to play from the keyboard. Dragging the mouse looks around, holding T
looks far left to turn around, and each number or letter key performs one
step of the work, from the opening wash through the saku, the knife and the
nigiri to serving; the keys are listed on a small panel in view. For the
case: 4 takes what was ordered, 5 takes the selected neta, 6 (Shift+6 back)
steps through the neta, 7 makes the customer order the selected one, and 8
restocks the whole case. For a gunkan, Z takes a nori strip, H wraps, and 4
on a sea urchin or salmon roe order puts the topping on. For an inari, 4
takes a pouch, H fills it and Space folds it shut on the beat. For a roll,
Z lays the nori on the mat, U spreads the rice, 4 lays the next filling, I
rolls, Space squeezes, and X (knife in hand) makes the next cut. A key only
moves the emulated hands to a place and makes the gesture there; the game
judges it exactly as it judges real hands, so mistakes still count. The timed
gestures happen when you act: hold L to reach into the rice tub and let go on
the beat, and press Space on the beat for each of the three touches. Q and E
turn a carried piece 45 degrees. Press P again to hand control back to the
emulator.

## Project layout

| Path | Purpose |
| --- | --- |
| `iwsdk.config.json` | Project authority: active scene, asset/component modules, XR and world features |
| `src/index.ts` | App entry point: `World.create()` and system registration |
| `src/menu.ts` | The menu and the neta case: every item, how it is prepared, which hand takes it, how many pieces a block or tray gives, its look, and the case order |
| `src/layout.ts` | Every bar dimension (counter depths, aisle width, heights, the reach model); run `npm run layout` after editing |
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
