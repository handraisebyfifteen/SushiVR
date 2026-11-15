# Sushi VR

A sushi-restaurant simulator for WebXR, built for the Meta VR Start Developer
Competition 2026. It runs in the browser of a VR headset such as Meta Quest with
no installation: open the URL and start making sushi.

> A seated sushi counter where you make and serve one nigiri at a time using
> hand tracking only. Built and tested in the desktop emulator; not yet tested
> on a headset.

## Three games

- **Nigiri stages** (the game a new player starts in, `src/stage.ts`): you sit
  down, wash your hands, and the first customer is already seated. The case is
  full and the shari is in the ohitsu. The world's number is the number of
  customers (worlds 1 to 3), and each world has four stages whose menu grows:
  basic neta, more neta, then cured fish, shellfish and gunkan, then the whole
  menu. When the last customer has left, the grades of the pieces are averaged
  (Excellent 100, Good 75, Poor 40, Bad 0). 65 points or more clears the stage
  and opens the next. The board by the phone shows the points.
- **Prep stages** (`src/stage.ts`): the morning's work, one thing at a time.
  The stage's fish is delivered as it starts, and the stage is over when all of
  it is made and put away (no cleaning, no opening). Two worlds of four stages:
  1-1 white fish (striped jack, hamachi, flounder), 1-2 tuna, 1-3 kohada and
  saba (salted and vinegared, on kitchen timers), 1-4 tamago, 2-1 aji and
  squid, 2-2 octopus, 2-3 the shari, 2-4 all of it together. The grades of the
  cuts and of the curing times are averaged the same way, and 65 points clear
  the stage; a stage with nothing graded (the tamago, the octopus, the shari)
  is cleared by finishing it.
- **The shop** (the whole day): the morning prep, the service and the closing,
  easy or full, as described below.

To go on after a stage or a day, point at the phone and pinch: the card's first
line is "Next stage", "Try again" or "Next day". The phone's Settings choose the
game (nigiri stages, prep stages, the shop) and the stage ("Start" loads the page again; in a headset, enter VR once
more).

**Pause.** While the headset's menu is over the game, or the headset is off,
no game time passes (`src/pause.ts`): customers do not lose patience, timers
and flames stand still, a "Paused" sign shows, and what the hands held is still
held when you come back.

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
the spot is remembered; the wasabi's dish is kept turned over except while
the bar is open), the nori tin (red, its lid opening as your hand comes
near) and a box of kitchen paper at its left-back corner, the styrofoam ice box of the morning's fish on the counter
beside the board's left end (put away once the bar opens), a trash bin at
your left foot, the bamboo
mat (makisu) rolled up at its left edge (it lies open in front of you while
a roll is ordered), and the knife and wet cloth on the right. Beyond the board the
raised tsukedai (30 cm) carries the 1.5 m glass neta case (see below) and,
in front of the case, the serving stand (geta); the lower
customer counter (40 cm) lies beyond it. Over the tsukedai a light tiled
eave on timber posts, left over from the sushi-stall days, carries a short
plain noren and four paper lanterns. The rice tub (ohitsu) sits on a low
stand at your right, between knee and waist, under the counter where the
customers do not see it (high enough for the headset to see your hand go
in); its lid slides aside as your hand reaches in
and closes once you have the rice. Behind you are the prep sink with its faucet, the soap and a hand
towel hanging on a bar under the sink's front edge; on the sink's right
stand a stainless work table, wide enough for the hangiri with the ohitsu
beside it (a three-sho gas rice cooker underneath, the hangiri and paddle
hung on the wall above), and a four-burner gas range with an oven, its
grill net hung on the end wall beside it; on the sink's left a glass-door
dish cabinet against the back wall.
High on the back wall over the sink and the range hangs the menu board, a
row of wooden plaques with each item's name in Japanese (the one place
with Japanese text). The office corner, out of
the customers' way, is on the aisle's right end wall: an open food shelf
(the seasonings out where they can be told apart, labelled: soy sauce,
mirin, sake, rice vinegar, salt, sugar) with the staff call board over it (two round buttons, the cook and the
part-timer), and between it and the dish cabinet a black dial telephone on
a small shelf under the board of the day's results. Beside it, at the bar's right end, the
passage to the customer room hangs a long indigo noren, so the office shows
only a little from the seats. The shop's entrance, a lattice door with its
noren, is beyond the customer's seat. The kitchen doorway, with its long
indigo noren and the brighter kitchen showing through it, is at the left end of the aisle; the cook
and the part-timer come out of it when called. Fluorescent work lights
hang over the board and the sink.

**The neta case** holds 32 items, left to right: tamago, abalone, octopus,
squid, squid legs (geso), flounder, striped jack, young yellowtail, bonito
back and belly, lean / medium fatty
/ fatty tuna, gizzard shad (kohada), horse mackerel, cured mackerel, prawn,
sweet shrimp, scallop, ark shell, egg cockle, sea eel, hamaguri (煮はま) and the inari pouches,
then, at the right end, sea urchin, salmon roe and the roll fillings (cucumber,
gourd strips (bought simmered), pickled radish, plum paste, shiso; the tekka roll's tuna is cut
from the lean tuna saku to order). The left
(neta) hand takes the neta; the right-end items are the right hand's (the
uni, its lobes laid in overlapping rows on a white-wood ori with a small
wooden spatula, and the salmon roe in a small rustic stoneware bowl with a spoon,
for gunkan, and the roll fillings). Five sliding doors open by themselves
for either hand. As a hand reaches in, the item nearest the fingers glows
with its name (amber if it is the other hand's), and the items behind the
open door float twice life size above the case, each named, so the close
neighbours are easy to tell apart. Twenty-five of them make nigiri:
fourteen are cut from a block (the tuna, bonito back and belly, white fish
and the flounder's engawa, cured mackerel, squid, octopus, abalone, tamago)
and get a slice shorter with every cut; nine are ready-cut and taken one
piece at a time (sweet shrimp two at a time); the kuruma-ebi is kept live
and worked to order, boiled or raw (below). When
one is used up it is sold out: its place is empty and nobody orders it until
the next morning's prep. Counts and order are in `src/menu.ts`.

**Turn around**: the whole room is there all around you, so just turn round
on the stool to face the back row (the sink, the work table and range, the
office corner). The game takes the facing from where your head looks: more
than about 120 degrees off the bar is the back row, back within 60 degrees
the bar again, and a look to the side (the office corner, the range)
changes nothing (`FACING_BACK_DEG` and `FACING_FRONT_DEG` in
`src/tuning.ts`).

**A step to the back row** (the morning prep): the work table and the
range are a step away from the stool, and the sink too while there is a
whole fish to wash (from the stool only the basin's front edge is in
reach). Turned round, point at one of them and pinch: the view blinks and
you stand in front of it (from the range the ice box is in reach too,
turned to the bar). Point at the other
one to move along, or turn to the bar and point at the board to sit down
again. Once the bar opens you are back on the stool (`src/place-system.ts`).

**The morning prep** (仕込み): every day starts before opening, with no
customer yet. The ohitsu starts empty. What the case holds depends on the
difficulty, shown on a wooden sign on the office wall (between the phone and
the call buttons) until you call the fish shop; point at it and pinch to
change it (it is remembered):

- **Easy**: the case items you prep start empty, the rest full (the cook
  readied them). Every day starts afresh.
- **Full** (本格): the case keeps what is left from day to day (saved in
  the browser when the day closes; day 1 starts empty). You check the case
  and order what it needs. Only tuna and cooked things (anago, tamago,
  octopus, abalone, hamaguri, the gourd strips, the inari pouches) keep overnight;
  uni and ikura two business days, the garnishes three; the rest of
  yesterday's is out of the case in the morning, with a word over the case.
  The garnishes and pickles (cucumber, shiso, pickled radish, plum paste)
  come from the greengrocer with the delivery, topped up apart:
  they are not ordered on the phone. There is no money in the game:
  nothing has a price and nothing is paid, so an order is limited only by
  the amounts each thing comes in, and the cook and the part-timer are
  simply called in or not. A ready-made item's full case is four servings
  (four prawns, four ark shells, four cockles), the scallops a pack of
  nine (one a piece, ordered by the pack only), the inari pouches a set of
  twelve, the sweet shrimp a sheet of eighteen (six by three, nine pieces
  of two).

**Rice and nori** (full only; `src/pantry.ts`): they run out with use and
are kept from day to day (saved in the browser). Day 1 starts with one
10 kg sack of raw rice and 30 sheets of nori. The numbers are provisional.

- The rice is cooked 1 or 1.5 sho at a time (1 sho = 1.5 kg of raw rice,
  out of the sack), and 1 sho makes about 3.3 kg of shari, some 170
  nigiri. With too little in the sack the cooker is not lit.
- The bar takes its shari from the ohitsu: 19 g for a nigiri or a gunkan,
  90 g for a roll (the tekka too), 30 g for an inari. An empty ohitsu
  gives nothing.
- Nori: a gunkan strip is a sixth of a sheet (6切り), a roll a half sheet.
- More rice during the service, the chef's choice. Either cook it
  yourself: step to the work table and light the cooker again (1 or 1.5
  sho), then the morning's steps (the hangiri, the awasezu, the paddle,
  the ohitsu); while the ohitsu is at the work table, the bar has no
  rice. Or call the cook on the phone (1 or 1.5 sho, done in about 80
  s). There is one cooker: while one batch is on, the phone's cook rows
  read "cooking" (the cook's) or "cooker in use" (your own).
- The rice shop is on the phone: sacks of rice and packs of 10 sheets of
  nori (at most 3 sacks and 5 packs a call), delivered a few seconds
  later.
- Signs warn over the ohitsu and the nori tin: the ohitsu yellow under
  about 40 pieces and red under about 10, the sack under 1 sho, the nori
  under 10 sheets. The master says each once as it happens ("The shari is
  getting low", "Shari nearly out: cook more", "Rice is low: call the rice
  shop", "Nori is low: call the rice shop"); not the ohitsu's while more
  rice is already cooking.

Time runs faster than in a shop, and the work runs side by side: the rice
and the pots go on first, the fish is cut while they cook.

1. Point at the black telephone in the office corner (on your right, out
   of reach) and pinch: its handset comes up. On easy the fish shop brings
   "the usual". On full the handset stays up while you order: reach into
   the case (the doors open, each item shows its name and stock, sold-out
   items too) and pinch an item to order it; each pinch steps it to the
   next amount and then back to none. A prep item orders its material (any
   tuna orders a tuna belly, 1/16 or 1/8; the hamachi comes as a quarter or
   a half; the rest one each), the others come ready to serve, half or a
   full case. The slip over the case's left end lists the order. Point
   at the phone again to end the call. Only what was ordered comes (ready
   items go straight into the case; `src/fish-order.ts`). A few seconds
   later its styrofoam box is on
   the counter left of the board (once everything in it is prepped, the
   empty box is put away). Turn round to the sink behind you and wash
   your hands meanwhile: the fish is not touched with unwashed hands.
   Anything far away (the phone, the call buttons, the tea urn, the noren,
   the work table and the range) is pointed at
   with the hand held out and the other fingers curled, then a pinch. A
   hand held out like that passes over the neta case without opening its
   doors or taking from it.
2. The rice: step to the work table, point at the gas rice cooker under it
   and pinch (on full, one of the two marks beside it: 1 or 1.5 sho). It cooks, goes out by itself and steams (a word over the
   table counts it down).
3. The range: on top in the ice box lie the octopus, the conger eel and the
   abalone, prepared by the fish shop, and the live hamaguri in a net bag
   (the gourd strips are bought ready simmered: no prep). Take each (either
   hand) and let go over its own pot on the range (step to the range; from
   there the ice box is in reach, turned to the bar). Each burner has a knob
   on the range's front: a short pinch lights it on high or puts it out;
   keep pinching and it turns down a notch at a time (high, medium, low).
   The octopus and the abalone come in the fish shop's
   stainless inserts (中子); the eel is bought opened, in a pack (a white
   foam tray). Once all four are in their pots, the empty inserts pile up
   in the box and are dealt with one at a time: first the eel's pack, which
   is pinched and dropped in the trash bin at your foot; then each insert,
   pinched from the top of the pile (from the stool), turned to the sink,
   held over the basin and scrubbed with the other hand, then dried with
   the cloth that hangs on the sink's front edge (that hand pinches it,
   rubs the insert, and lets it go: it hangs back), and let go on the
   sink's end strip by the whetstone, where it stacks upside down. The
   master asks for this before the fish
   under them, and the bar does not open with them left (the part-timer's
   cleanup covers them).
   - Octopus: 炊く, at a rolling boil on a high flame. Boiled on long after it
     is done, it toughens.
   - Conger eel: 煮る with the broth held at 90 degrees (the word over the
     pan is its thermometer): bring it up on high, then turn it down to low
     before it boils. Boiling breaks the eel up.
   - Abalone: 煮切る, boiled until the liquid is gone (the word over the
     pot counts it down), then the flame off before it scorches.
   - Hamaguri: boiled on a high flame till the shells open (the lids lift
     as they cook), then the flame off: boiled on, they toughen. Take them
     out of their broth (it stays in the pot for the soup) and let go over
     the board, not the case. Hot from the pot, they lie there a little to
     cool (8 seconds); then, worked like a fish: pull them out of the
     shells (both hands, as the squid's legs), one stroke of the knife down
     the middle opens them, pull the guts out, and brush tsume over them:
     the tsume pot stands on the counter right of the board, its brush in
     it; pinch the brush by its handle, stroke it over the clams, let go
     (it goes back into the pot). Then the opened clams go into the case;
     the shells and guts into the trash. If the board is in use, the clams
     wait in their pot with the flame off.
   When one is done, put its flame out, take it out of the pot and let go
   over the case (step back to the board). Its pot goes back into the
   cupboard under the sink. On the full difficulty every pot starts in that
   cupboard (its right half, behind the right sliding door): before an
   ingredient is taken from the ice box, pinch the right door's handle,
   take its pot by the top and let go over its burner.
   - Tamago (full difficulty only; the shop's way: 厚焼き with scallop, made
     and baked in the shop): the batter is made in the suribachi (すり鉢),
     which lives in the cupboard under the sink. Pinch the handle of the
     cupboard's left door to slide it open, take the suribachi by its rim
     (its pestle and chopsticks ride in it) and let go over the work table:
     it stands at the table's back corner by the sink. Take the scallops
     and eggs from the ice box and let go over the suribachi: the scallops
     go in and the pack of eggs is set beside it. Pinch the pestle (すりこぎ)
     and go round and round till the scallops are a paste; tap the pack of
     eggs and they go in (the cracking is skipped). A pinch of salt and a
     teaspoon of sugar go in before the mixing: step to the food shelf by
     the end wall, take the salt jar, let go over the suribachi; the same
     with the sugar jar. Then pinch the cooking chopsticks (菜箸) and go
     round till the batter is frothy. The square
     copper tamago pan hangs on the end wall beside the net, its wooden lid
     (木蓋) in it as a set. Take the pan by its handle and let go over a
     burner whose pot is put away, and heat it on a medium flame. When it
     is hot, oil it (油返し): the oil pot stands on the food shelf with the
     seasonings; let it go over the hot pan and the oil goes round it, the
     rest back into the pot. Pinch the suribachi's front rim and let go over
     the pan to pour it (a green "Ready" floats over the pan once it is hot
     enough, until the batter is in): a hot, oiled pan sizzles (a cold or dry one makes
     the tamago stick). Turn the flame down low (higher bakes faster but
     scorches the face down). When the first side is set, toss it over like
     fried rice: the chopsticks (left on the pan's rim) in one hand, the
     handle in the other, a quick flick up (tossed too soon, it breaks).
     When the other side is done too, put the flame out, take the lid from
     its hook by its bar, let it go over the pan onto the tamago, and press
     it down once with an open palm to square it. Then raise the handle:
     pan and lid turn over together and the tamago comes out on the lid on
     the work table. Let it cool a little there (15 s), then pinch it and
     let go over the case. Wipe the pan while it is hot with a sheet of
     kitchen paper (no soap on the copper): it goes back on its hook with
     its lid. The times are a guide, not a grade; a scorched face, a stuck
     or a broken tamago costs a couple of pieces (`src/tamago-system.ts`).
4. The fish: left hand, pinch a fish in the box (the one on top first) and
   let go over the board. Each one is wrapped in paper inside a plastic bag:
   hold it with the left hand, pinch the wrapping with the right and pull it
   off, twice. Then, with the left hand steadying it, grip the knife and
   draw it along each white line: toward you along the fish, across it, or
   flat along the board to shave off skin. The knife stands on its edge and
   is drawn from the right down to the lower left (the shop's way: the
   stroke of a sword or a bat); it lies flat only to shave skin or a
   backbone.
   - Tuna belly (a 1/8 or 1/16 cut from the tuna dealer): cut off the skin
     side, then split it into fatty, medium fatty and lean.
   - Bonito half: split it along the blood line into back and belly. The
     back loses its blood line and has its skin shaved off (pulling it would
     split the flesh); the belly loses the hard skin at the neck and its
     blood line, then goes back on the ice to be seared (step 7).
   - Squid: pull the legs out of the body, cut off the guts, open the legs
     flat and the body; peel the body's skin off by hand (pull, as with the
     wrapping) and pat it dry with a sheet from the kitchen-paper box.
   Pinch each saku and let go over the case: it fills its place (the squid
   legs are geso). What comes off (wrapping, skin, blood line, guts, used
   paper) stays on the board's right: drop it in the trash bin at your left
   foot, whose lid opens as your hand comes near.
5. The whole fish (the shop's way: mid-sized fish come whole, big ones only
   as much as the case takes): a striped jack and a flounder, and a hamachi
   half, in a long box on a low stand at the sink's foot, in front of the
   dish cabinet. Turn round, point at the drainboard (the sink's far end, on
   your left) to stand in front of it and take a fish from the box, then
   point at the sink to stand at it.
   - Washing (水洗い): lay a fish on the wash board across the basin. Pinch
     the scaler on the strip right of the basin and scrape it over the fish
     again and again until the scales are off; pinch the fish and lift it a
     little to turn it over, and scale that side. Grip the deba beside the
     scaler with a fist and cut off the head (the jack's belly is opened
     too), pull the guts out with the right hand while the left holds the
     fish, then rub the belly clean under the tap. The head and guts go in
     the trash bin by the sink.
   - Filleting: carry the washed fish back to the board. The jack in three
     pieces (三枚おろし): belly toward you, cut along the belly and the back
     to the bone, lift the fillet off; turn it, the same again; the bone is
     thrown out. The flounder in five (五枚おろし), dark side up: down the
     middle to the bone and along the fins on both edges, the back and
     belly fillets lifted; turned, the same on the white side.
   - Each fillet: the belly bones shaved off, the pin bones pulled with the
     tweezers (on the board's back row: pinch them, touch a bone with the
     tips and lift), the skin pulled off with the knife (mid-sized fish are
     skinned before the saku), then split into back and belly saku; the
     flounder's fillets have their engawa cut off instead. The hamachi half:
     unwrapped, belly bones, pin bones, skin, then back and belly.
   - Then the moisture off (the shop's way: white fish is ready once it is
     dry): a sheet from the kitchen-paper box, patted over the saku.
   Every saku and engawa goes into the case.
   - On the full difficulty, the kohada and the saba too (the shop's way:
     cured on the day). The kohada come whole, eight a day, one a piece
     (丸づけ). They lie loose on the wash board's right, a bowl of ice on its
     left (not laid out in rows). Many of the same fish are done a stage at a
     time (a small bar's way of working): the scales off, then each fish in
     turn to the middle, its head cut off (each on its own, never a row at
     once) and onto the ice; once every head is off, each from the ice, its
     dorsal fin cut off along the back, its belly cut off, then the guts
     out with the knife's tip (a kohada is not slit); all washed and back on the ice. On the
     board, every fish opened from the belly first, then every backbone
     shaved out, laid in a row, overlapping. Fish lie head left for the head
     to come off, then head right (belly still toward you) to be filleted
     on the board, for every whole fish (a left-handed chef's the other
     way). The
     saba is washed and filleted like the jack, belly and pin bones out, its
     skin kept (it is peeled when served).
     The salt, both sides: the kohada on the round bamboo basket (平ざる) on
     the drainboard beside the sink. Salt the basket first (pinch salt from
     the bowl, open the fingers over it: where it falls turns white), lay the
     opened kohada on it skin up in a row, overlapping, then salt them over
     till fairly
     white. The saba goes into its stainless tray and is salted till white.
     Leave them: the kohada about 40 minutes, five more or less with the
     day's size (the fish shop says it on the phone), the saba 2-3 hours. A
     minute here is a second; two kitchen timers on the dish cabinet's side
     (facing the sink, out of the customers' sight) count them down and beep
     at zero. The kohada then go into the bowl of water in the sink, which
     takes the salt off; meanwhile the basket is rinsed under the tap (pinch
     its front rim, hold it under the tap, let go); then the kohada back on
     the clean basket in a row, overlapping, to drain, and on into the
     vinegar. The water and the drain are steps, not timed. The saba's
     tray is rinsed under the tap. One enamel container of vinegar (kept for
     vinegar) stands at the back: the kohada first (20 minutes), then the
     saba (30); lift the fish and let go over it, then out of it and over
     the case. What is done with (the basket, the tray) is put away. The
     times are the shop's guide and the master tells them; shops differ, so
     no time costs pieces (`src/cure-system.ts`). A few minutes before a
     fish's time the master calls you over to be ready.
   - The aji too (full): washed and filleted in three like the jack, belly
     and pin bones out. Its tray comes out when the fillets are ready (where
     the vinegar stands, or where a basket or tray has been put away): salt
     it till white, 3 minutes on its own kitchen timer, rinse the salt off
     under the tap, then lift the fillets and let go over the case. No
     vinegar.
6. The shari (the shop's way: rice vinegar made ahead, no fanning): when the
   rice is done, point at the cooker again and pinch: it is turned out into
   the hangiri on the work table. Take the bowl of awasezu and hold it over
   the rice to pour it on; take the paddle and cut through the rice, back and
   forth. Then bring the ohitsu from its stand by the stool (its lid stays on
   the stand) and set it on the table beside the hangiri, scoop the shari
   into it with the paddle (six scoops), and carry it back to its stand. The
   bar's rice comes from it; the hangiri and paddle go back on the wall.
7. The bonito belly: from the ice onto the board. Pinch the rings of the
   skewers lying at its near end and push them in, through the skin side.
   Take the grill net from its hook beside the range and set it on a burner
   whose pot is done, then the belly on the net, skin down, and light the
   burner on high. Pinch the skewers' rings to turn it a quarter: each face
   sears in turn, the skin until it chars, the sides until their colour
   changes. Lift it off by its skewers onto the ice to chill; then on the
   board pat it dry with paper, pull the skewers out toward you and let it
   go over the case.
8. Clean up: wipe and put the knife down; pinch the board's near edge, turn
   around, wash it under the faucet (rub it with the other hand), let go
   over the sink to stand it up to drain, then after a moment take it back
   to the counter. Every burner must be off. Wash your hands with soap.
   Then the knife's morning edge: take the knife, turn around, pinch the
   whetstone on the sink's end strip and let it go in the basin (it comes
   back dark, wetted), press the blade with the other hand and draw it back
   and forth along the stone (the blade point over the stone), then dip the
   blade in the basin to rinse off the slurry, turn back and wipe it, and put
   it down. The edge wears with every cut (about 45 cuts from fresh to none);
   a piece cut with a dull knife loses points, and a dull edge catches in the
   flesh at random: the stroke does not take the slice off and you draw the
   blade again (the owner: a dull knife should hurt a little). Sharpening
   between the prep and the service is a must; an evening sharpening before
   closing is up to you. Finally point at the noren hanging inside the shop's entrance (beyond the
   customer's seat) and pinch: it is hung outside, the bar is open and the
   first customer walks in.

Your cuts are graded (how close to the line): a crooked cut wastes flesh,
so the saku gives fewer slices to serve. What comes off the range is graded
too (a tough octopus, a broken eel, tough hamaguri, a scorched abalone, a belly burnt or
seared on one side only give fewer pieces). When the prep is done, the
pieces it gave show over the board (no grade words: shops differ in their
prep).

**Staff** (plain figures, in the kitchen until called): nobody works unless
called. During the prep, point at a button on the office's call board and
pinch to call that one in (again to let them off); its lamp stays lit while
they are on. The cook (white coat)
walks to the ice box, takes each fish still in it into the
kitchen and brings it out as full saku in the case (the range's ingredients
come out cooked, and the bonito belly of a half he cut comes out seared);
the shari stays the chef's own. The part-timer (apron)
comes to the board once the prep is done, throws out the
scraps and washes the board. There are no wages: they are simply called in
or not. On the easy difficulty the cook has also readied every case item
you do not prep.

**Opening**: turn to the sink, pinch the soap pump, rub both hands under the
faucet, then put both hands on the towel hanging under the sink and grip it
(two fists). After the prep and the cleaning, this wash lets you hang the noren.
During service wash with water only; soap now would make the food smell of it.

**One order** (the card above the customer shows a picture of the item, its
name and whether wasabi is wanted):

1. Left hand: reach to the case; the glass door in front of the item under
   your fingers slides open by itself. Pinch the ordered block and set it
   on the board; the door closes once you have taken it. A wrong one glows
   amber; pinch it back into the case (the door opens for it again). A
   ready-cut piece (kohada, shellfish, eel...) comes straight onto
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
   back. The rice comes up as a loose lump; a fist rounds it.
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

   The shari is shaped through the work, the way the shop's owner shapes it:
   a funagata (舟形: a flat bottom, a gently domed top, ends rounding off),
   about 19 g (5.6 x 2.5 x 2.1 cm). Touch 1 presses the top (its future bottom)
   flat, touch 2 sets the form and lays the neta over it, touch 3 evens it
   into the finished piece. The neta (7.5 x 3 cm, 6 mm thick for a saku
   slice) lies along the shari and drapes over it; stiff toppings (tamago,
   abalone, scallop) bend less. The shapes are in
   `src/scene-assets/lib/nigiri-form.ts`; the `nigiri-stages` asset lays them
   out side by side for inspection.
12. Pinch it, carry it over the case and let go on the geta. Turn your hand
    while carrying to set its heading. The geta is a little beyond a seated
    chef's straight arm, so letting go above the case's far half (coming in
    from above, over the glass) counts: the piece lands on the geta
    (`GETA_ZONE_*` in `src/layout.ts`; `npm run layout` prints the reach).
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

**A gunkan** (sea urchin or salmon roe) is made on the cutting board, not in
the palm:

1. Right hand: tezu and rice as for a nigiri (steps 4), then make a fist
   once to shape it.
2. Lower the right hand onto the near half of the cutting board (your side):
   the shaped shari is set down there (loose rice is not; squeeze it
   first, and not on the far half).
3. The nori, two-point wrapped (二点留め). Left hand: pinch a nori strip
   (6切り: a sheet cut in six, 3.5 x 19 cm) from the nori tin and bring it
   down to the shari, which lies lengthwise (its long side pointing away
   from you): the strip's end goes to its near end (下部). Put the right
   index finger on that end to hold it. Take the left hand once round the
   shari: the strip curls round the far tip (頂点, a soft click) and comes
   back on over its start. Lift the finger only when
   it is most of the way round (sooner, the strip springs off). At the
   end, pull the last end a little outward (taut, ping), then let go. Let
   go loose, the band sags round the rice and the piece scores lower.
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

**A roll** (hosomaki: gourd strips, cucumber, pickled radish, plum and
shiso, plum and cucumber; and the tekka, a medium-thick roll):

1. Left hand: pinch a half sheet of nori from the nori tin and let go over
   the mat.
2. Right hand: tezu and rice as for a nigiri, then sweep the open hand side
   to side over the nori (twice across) to spread the rice.
3. If wasabi is ordered: the index finger from the dish onto the rice.
4. Right hand: lay the filling from the case's right end along the middle
   (plum and shiso: shiso, then plum; plum and cucumber: plum, then
   cucumber). The tekka roll is a 中太 (medium-thick): its half sheet lies
   縦, long side away from you, and its core is not a case item: left hand,
   take the lean tuna saku to the board, cut one slice (it stands for the
   slice and the trimmings), wipe and put the knife down, then lay the slice
   along the middle of the rice with the left hand.
5. Both hands at the near edge of the mat push it away: rolled. Both fists
   together on the beat: squeezed firm.
6. Grip the knife and, with the left hand steadying the roll, draw the blade
   along the white line three times. The first stroke halves the roll and
   the halves lie side by side. The gourd roll is cut into six (cut both
   halves into thirds); the others into eight (halve, lay the four side by
   side, halve again); the tekka into four (halve, lay the halves side by
   side, halve again). Wipe and put the knife down.
7. Pinch the pieces (they stand cut face up) onto the geta and serve.

**Serving etiquette**: the first piece for a new customer goes straight
across the geta; the customer reaches for it and shows which hand they use.
From then on place pieces diagonally, head end (the thick end of the slice)
toward the customer, sloping from the customer's upper left to lower right
for a right-handed guest and mirrored for a left-handed one. A slice with a
skin edge (bonito, striped jack, cured mackerel) shows it on the customer's
right when cut at the guide line.

**Grades**: every piece served (a roll is one order) is graded Excellent /
Good / Poor / Bad from the four timed beats, wasabi, the tsume (see below),
orientation, hospitality (handedness), freshness since the cut, and hygiene (unwashed
hands, a dirty board, soap during service, an unwiped knife); the grade
and small icons for what to improve appear above the customer. The grade
decides how much more they order: a customer comes in with three orders in
mind, an Excellent piece brings one more (up to six), a Poor one one fewer,
and after a Bad one they order no more. A piece that is not what was
ordered is sent back ("Not my order") and made again. A bonito order with
no part named is two pieces, back and belly, one after the other.

**Tsume** (the shop's way): the anago and the hamaguri nigiri get a
little tsume, no wasabi. With the piece finished (on the fingers or on
the geta), pinch the brush by its handle from the tsume pot on the
counter right of the board, give the piece one short stroke, and let go
(the brush goes back into its pot); the neta takes a dark gloss. Served
without it (or with tsume on anything else) the piece loses 10 points and
shows the tsume mark. In practice mode, Tab does it.

**Kuruma-ebi** (the shop's way): the case holds them live, and each order
says boiled or raw. Take one from the case with the left hand and let go
over the board. Boiled: a bamboo skewer lies in line behind its tail;
pinch the skewer's flat end and push it away along the belly (it keeps
the prawn straight). Take it by the skewer and let go over the pot of
water kept on the boil on the counter left of the board; after about ten
seconds a Ready sign comes up over the pot: take it out by the skewer and
let go over the bowl of ice water beside the pot (nearer the board) to
firm it; after a few seconds (a soft chime) take it out onto the board and
draw the skewer back out toward you. Raw: no skewer, no pot.
Then, either way, peel it: the left hand pinches the body, the right hand
pinches the head and pulls it away with the shell (the tail fan stays
on). A pinch with the left hand takes it onto your fingers, and the nigiri
goes on as usual. Boiled well short of ten seconds (raw in the middle) or
well past it (tough), the piece loses 5 or 15 points and shows the pot
mark. In practice mode, Tab does each step; 7 on the prawn orders it
boiled and raw by turns.

**No money**: this is a simulator, not a management game. There are no
prices, bills or wages, and the check (お勘定) is done by a cashier,
off-screen: when the customer has had the last piece they say "Thank you!"
and walk out by the entrance, and the next customer comes in there.

**Tea** (お茶): now and then a customer asks for tea after the first piece.
It is powdered green tea from the hot-water urn on the low cabinet under
the telephone, made out of the customers' sight. With nobody called in,
you make it: point at the urn and pinch, and after a moment the cup is set
down at hand on the stainless strip right of the board; pinch it, carry it
over the case and let go above the tsukedai, and it stands before the
customer. Left waiting too long, they order one fewer.

**The part-timer in service**: called in with their button, the part-timer
keeps to the office corner behind the long noren and comes out through it to show each
new customer in from the entrance and to bring the tea when it is asked for.
The board and the cloth stay the chef's own: the chef's work and hygiene.

**Closing**: point at the noren outside the entrance and pinch to take it
in. The seated customer's order is the last; once they have left, the day's
results on the board over the telephone are final (a word over the counter
says so): the pieces served and how many of each grade, and on full what
was thrown out this morning (how many items and pieces were past their
days). Reload the page for a new day (on full, the next day, with what the
case kept).

**Hygiene**: every piece leaves rice and fish oil on your hands; after five
they need washing. Moving a dish also makes that hand need washing. Wipe the
board with the wet cloth after serving, then wash the cloth at the sink,
which washes your hands too. Everything a hand can act on is marked with a
soft ring; mistakes flash amber.

Debug overlay: add `?debug=1` to the URL to show station names and a status
panel (hands, hygiene, order, piece). During `npm run dev` the D key toggles
it and the O key opens the bar with clean hands. Neither key exists in
production builds, and nothing shows without the flag.

The game is worked with the hands alone (hand tracking). With controllers in
hand and no hands seen, a word in front of you says so. The desktop emulator
comes up standing (eyes at 1.6 m, hands at chest height) with controllers, so
in `npm run dev` it is set up at the start for this bar: hands, eyes at the
seated height looking down at the board, both hands resting over it (its
input mode button, the hand icon, still switches back and forth).

Practice mode (desktop emulator, `npm run dev` only): press P in the running
app to play from the keyboard. Dragging the mouse looks around, T turns
around (the view blinks and the bar turns half round, standing in for
turning round on the stool), and each number or letter key performs one
step of the work, from the opening wash through the saku, the knife and the
nigiri to serving; the keys are listed on a small panel in view. For the
case: 4 takes what was ordered, 5 takes the selected neta, 6 (Shift+6 back)
steps through the neta, 7 makes the customer order the selected one, and 8
restocks the whole case. In the morning prep, = points at the telephone,
9 carries the next fish to the board, a saku into the case or a
scrap into the trash, 0 pulls off the wrapping, the legs or the skin, X
(knife in hand) cuts along the line, - pats the squid or the white fish dry with paper (or brushes the tsume over the opened hamaguri), [ does
the next step with the board (lift, wash, stand, lift, put back; T turns
around between), ] points at the noren and pinches (to open, and again to
close), ; and ' point at the cook's and the part-timer's call buttons, = at the phone, Shift+= at the difficulty sign, Tab (on the phone, full) orders every case item under half, a full amount, then ends the call, Shift+8 starts the full difficulty's shop again from day 1 (at the next reload), Shift+K changes hands (left- or right-handed; the morning, before the call); O skips the prep and opens the bar. At the back row, A does the
next step of the shari (in service on full, with the cooker free, it
lights another batch of 1 sho and goes on through its steps) and Enter the next thing at the range (a knob, an
ingredient into its pot or out to the case, the net, the bonito belly),
each stepping there and turning as needed; / steps to where you look (the
work table, the range, the sink, or back to the board), and Tab does
whatever the master is asking for (the whole fish's work too: the scaler,
turning it over, the deba, rinsing, the tweezers). For a gunkan, Space squeezes the rice, H sets it on the board, Z wraps a nori strip round it (the right index finger holding its end), and 4
on a sea urchin or salmon roe order puts the topping on. For an inari, 4
takes a pouch, H fills it and Space folds it shut on the beat. For a roll,
Z lays the nori on the mat, U spreads the rice, 4 lays the next filling, I
rolls, Space squeezes, and X (knife in hand) makes the next cut. A key only
moves the emulated hands to a place and makes the gesture there; the game
judges it exactly as it judges real hands, so mistakes still count. The timed
gestures happen when you act: hold L to reach into the rice tub and let go on
the beat, and press Space on the beat for each of the three touches. Q and E
turn a carried piece 45 degrees. Press P again to hand control back to the
emulator. The \` key turns on shaky hands (Shift+\` with another seed): the
hands wobble and now and then the headset loses one for a moment, more often
with the hands together, to try the game against hand tracking without a
headset. Shift+D wears the edge down to nearly nothing, to try a dull knife
(strokes catch at random; draw again).

**Hand tracking**: Meta's hand design guides set the tolerances. A hand the
headset loses for under 0.4 s keeps its pose and grip (`LOST_GRACE_MS` in
`src/hand-reader.ts`), so one hand briefly hiding the other while shaping a
piece does not drop it. With no vibration in the hands, every take, put
down, press and result has a short synthesized sound (`src/sfx.ts`).

**Eye tracking (Meta VR Glasses)**: on a device that tracks the eyes, what
is pointed at can also be chosen by looking at it and pinching, with either
empty hand: the telephone, the call buttons, the tea urn and the noren.
It glows while looked at, as when pointed at. A
pinch that takes something up at hand (neta, the cup, fish from the ice box)
is work, not a choice (`src/gaze.ts`). Quest 3 and 3S have no eye tracking:
there, only pointing. The glasses' view is narrower (37° to each side, 25°
up, 43° down): looking down at the board, the case's two ends, the knife,
the cloth, the ice box and the rice tub are outside it, and the head turns to
them. To try the glasses in the emulator, set `dev.emulator.device` in
`iwsdk.config.json` to `metaVRGlasses` (it is `metaQuest3`).

## Project layout

| Path | Purpose |
| --- | --- |
| `iwsdk.config.json` | Project authority: active scene, asset/component modules, XR and world features |
| `src/index.ts` | App entry point: `World.create()` and system registration |
| `src/menu.ts` | The menu and the neta case: every item, how it is prepared, which hand takes it, how many pieces a block or tray gives, its look, and the case order |
| `src/prep.ts` | The morning prep: each task, what it is made from and which case items it fills |
| `src/fish-order.ts` | The difficulty, the fish shop's order (amounts) and the case kept from day to day |
| `src/fish-order-system.ts` | The morning's case stock, ordering from the case, the order slip, the difficulty sign, the day's close |
| `src/place-system.ts` | Where the chef stands: the stool, or a step back at the work table or the range |
| `src/shari-system.ts` | The shari: the gas rice cooker, the hangiri, the awasezu, the paddle, the ohitsu |
| `src/range-system.ts` | The gas range: the pots, their knobs and heat, the hamaguri out onto the board, and the bonito belly on skewers |
| `src/tsume-system.ts` | The tsume pot and its brush on the counter right of the board |
| `src/prawn-system.ts` | The kuruma-ebi to order: on the board, the skewer, the pot on the boil, the ice water, peeling, onto the fingers |
| `src/tamago-system.ts` | The full difficulty's tamago: the suribachi from the cupboard under the sink, the scallops ground in it, the eggs tapped in, mixed with chopsticks till frothy; the square pan from its hook onto a burner, heated and oiled, the batter poured, baked low, tossed once with the chopsticks, the lid pressed on and the tamago turned out onto it, cooled, into the case, the pan wiped with paper |
| `src/scene-assets/lib/fillet-look.ts` | Stage 4's fish (a whole striped jack and flounder, a hamachi half), their fillets and filleting steps, and the sink's tools (wash board, fish box, scaler, deba, tweezers) |
| `src/tuning.ts` | Every gameplay number: timings, tolerances, what keeps from day to day |
| `src/day-tally.ts` | The day's results: the pieces served and how many of each grade (shown on the board by the telephone; there is no money) |
| `src/layout.ts` | Every bar dimension (counter depths, aisle width, heights, the reach model); run `npm run layout` after editing |
| `src/assets.ts` | Asset catalog shared by the runtime and the editor |
| `src/components.ts` | Component catalog shared by the runtime and the editor |
| `src/scene-assets/` | 3D models built in code (no external model files) |
| `public/scenes/` | Scene composition (JSON) |
| `public/ui/` | UI panels (`.uikitml`) |

## Design constraints

- All in-game text is English, except the menu board's plaques (Japanese,
  as in a real shop; the shop owner's choice).
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
