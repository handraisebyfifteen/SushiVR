import {
  BoxGeometry,
  CylinderGeometry,
  createSystem,
  DoubleSide,
  type Entity,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  type Sprite,
  Vector3,
} from '@iwsdk/core';
import { coach, type Grade, type MistakeKey, type StepKey, type StockWarning } from './coach.js';
import { debugLines } from './debug.js';
import { fishOrder } from './fish-order.js';
import { chef, cupboard, cure, holdingAnything, nakago, nakagoWanted, orderKind, orderNeta, type Place, prep, progress, range, service, shari, sharpen, sharpenWanted, staff, tamago, tea } from './game-state.js';
import { BACK_ROW_Z, DRAIN_SPOT_X, FOOD_SHELF_X, FOOD_SHELF_Z, RANGE_HEIGHT, SINK_BASIN_X, SINK_TOP, STOVE_X, WORKTABLE_X } from './layout.js';
import { handedness, sideSign, sideX } from './handedness.js';
import { hands } from './hands.js';
import { CORE_FROM, MENU, NETA } from './menu.js';
import { playClack } from './sfx.js';
import { type Kind, overStation, stations } from './station-system.js';
import { type BoxPart, mergeGeometries, partMatrix } from './scene-assets/lib/batch.js';
import { CaseItem, Held, Master, StationKind } from './sushi-components.js';
import { makeTextSprite, makeTurnArrowSprite } from './text-sprites.js';
import {
  MASTER_DEMO_DELAY_SECONDS,
  MASTER_FIRST_HINT_SECONDS,
  MASTER_HINT_IDLE_SECONDS,
  MASTER_LEARNED_COUNT,
  MASTER_POSITION,
  MASTER_WORD_SECONDS,
  TEMPO_MS,
} from './tuning.js';
import { display } from './display-settings.js';

/** Fixed words for each step; takeSaku and place depend on the order. */
const STEP_WORDS: Record<StepKey, string> = {
  turnBack: 'Turn around: behind you',
  turnFront: 'Turn back to the bar',
  soap: 'Soap first',
  washHands: 'Rub under the tap',
  towel: 'Dry your hands',
  takeCloth: 'Rinse the cloth',
  wipeBoard: 'Wipe the board',
  rinseCloth: 'Rinse the cloth',
  takeSaku: 'Take the fish',
  returnSaku: 'Put it back',
  holdKnife: 'Grip the knife',
  cut: 'Pull along the line',
  wipeKnife: 'Wipe the blade',
  putKnife: 'Set the knife down',
  takeNeta: 'Pick up the slice',
  tezu: 'Tezu first',
  rice: 'Rice: low right',
  wasabi: 'Dab the wasabi',
  join: 'Hands together',
  touch1: 'Press on the beat',
  flip: 'Push and roll',
  touch2: 'Pinch on the beat',
  rotate: 'Turn it clockwise',
  touch3: 'Pinch on the beat',
  place: 'Geta: on the diagonal',
  serve: 'Hold a fist',
  shapeShari: 'Squeeze the rice',
  setShari: 'Rice on the board, near side',
  takeNori: 'Take a nori strip',
  pinNori: 'Nori end on the rice, a finger on it',
  wrapNori: 'Round it, pull a little, let go',
  spoonTopping: 'Spoon it on',
  takeAge: 'Take an inari pouch',
  stuffAge: 'Hands together: fill it',
  closeAge: 'Fist on the beat: fold',
  layNori: 'Nori on the mat',
  spreadRice: 'Spread the rice',
  placeFilling: 'Lay the filling',
  rollMaki: 'Push to roll',
  squeezeRoll: 'Both fists on the beat',
  cutRoll: 'Cut on the line',
  callFishShop: 'Call the fish shop',
  orderFish: 'Order: pinch what the case needs, then point at the phone',
  stepDrain: 'Step to the drainboard beside the sink',
  layCure: 'Into its tray on the drainboard',
  saltCure: 'Salt them till fairly white: pinches from the bowl, over the bare parts',
  rinseCure: 'Rinse the salt off: the tray under the tap',
  vinegarCure: 'The fish on: into the water, onto the basket, into the vinegar',
  cureOut: 'Out of the vinegar, into the case',
  waitCure: 'Get ready at the drainboard',
  panOn: 'The tamago pan: off its hook, onto a free burner',
  stepShelf: 'Step to the food shelf by the end wall',
  saltTamago: 'A pinch of salt from the jar on the food shelf, over the suribachi',
  sugarTamago: 'A teaspoon of sugar from its jar on the food shelf, over the suribachi',
  cupboardTamago: 'The cupboard under the sink: slide its door open',
  suribachiOut: 'The suribachi from the cupboard, onto the work table',
  grindTamago: 'The pestle round and round in the suribachi',
  eggsTamago: 'Tap the pack of eggs: the eggs into the suribachi',
  whiskTamago: 'The chopsticks round and round in the suribachi',
  pourTamago: 'The batter into the pan: the suribachi by its rim',
  oilPan: 'Oil the hot pan: the oil pot',
  turnEgg: 'Chopsticks in hand, flick the handle up',
  lidTamago: 'Flame off: the lid onto the tamago',
  pressLid: 'Press the lid down once',
  turnOutTamago: 'Raise the handle: out onto the lid',
  wipePan: 'Wipe the pan: kitchen paper',
  eggOut: 'The tamago: from its lid into the case',
  takeMaterial: 'Take it from the ice',
  cutPrep: 'Along the line',
  pullPrep: 'Pull it off',
  wipePaper: 'Pat it dry with paper',
  stockSaku: 'Into the case',
  discardScrap: 'Scraps in the trash',
  liftBoard: 'Lift the board',
  washBoard: 'Wash it under the tap',
  leanBoard: 'Stand it to drain',
  returnBoard: 'Board back on the counter',
  hangNoren: 'Point at the noren, pinch',
  wetStone: 'Wet the stone in the basin',
  sharpen: 'Draw the edge along the stone',
  rinseKnife: 'Rinse the blade',
  binPack: "The anago's empty pack into the trash",
  takeNakago: 'Take an empty insert from the pile',
  washNakago: 'Wash the insert under the tap',
  dryNakago: "Dry it with the cloth on the sink's edge",
  rackNakago: "Stack it upside down on the sink's end",
  stepTable: 'Point at the work table, pinch',
  stepRange: 'Point at the range, pinch',
  stepSink: 'Point at the sink, pinch',
  scaleFish: 'Scaler: scrape tail to head',
  turnFish: 'Pinch it, lift: turn it over',
  rinseFish: 'Wash it under the tap',
  holdDeba: 'Take the deba: a fist',
  putDeba: 'Deba back: open the hand',
  pullPins: 'Tweezers: pull the pin bones',
  putTool: 'Put it back: let go',
  stepSeat: 'Point at the board, pinch',
  lightRice: 'Light the rice: point, pinch',
  turnOutRice: 'Rice into the hangiri: point, pinch',
  pourAwasezu: 'Awasezu over the rice',
  cutShari: 'Cut it through with the paddle',
  bringTub: 'Bring the ohitsu over',
  scoopShari: 'Scoop it into the ohitsu',
  returnTub: 'Ohitsu back to its stand',
  cupboardPot: 'The cupboard under the sink: slide its right door open',
  potFromCupboard: 'Its pot from the cupboard, onto its burner',
  potIn: 'Into its pot',
  turnKnob: 'Turn the knob',
  potOut: 'Out of the pot, into the case',
  hangNet: 'Net on a free burner',
  skewer: 'Skewers through the skin side',
  searTurn: 'Turn it with the skewers',
  chillBelly: 'Onto the ice',
  unskewer: 'Pull the skewers out',
  bellyBoard: 'Belly onto the board',
  bellyNet: 'Onto the net, skin down',
  toCase: 'Into the case',
  check: 'The check: point at them, pinch',
  makeTea: 'Tea: point at the urn, pinch',
  serveTea: 'Tea: onto the tsukedai',
};

const MISTAKE_WORDS: Record<MistakeKey, string> = {
  needSoap: 'Soap first',
  soapInService: 'No soap now',
  washFirst: 'Wash first',
  wrongItem: 'Not that one',
  wrongHand: 'Other hand',
  knifeUnwiped: 'Wipe the blade',
  dullEdge: 'The edge caught: draw it again',
};

/** The stock running low (full mode, src/pantry-system.ts): said once as it happens, over the ohitsu or the nori tin. */
const WARNING_WORDS: Record<StockWarning, string> = {
  shariLow: 'The shari is getting low',
  shariOut: 'Shari nearly out: cook more',
  riceLow: 'Rice is low: call the rice shop',
  noriLow: 'Nori is low: call the rice shop',
};

/** Steps that happen on the piece in the chef's hands: words go above the piece. */
const PIECE_STEPS = new Set<StepKey>([
  'join', 'touch1', 'flip', 'touch2', 'rotate', 'touch3', 'wasabi', 'pinNori', 'wrapNori', 'stuffAge', 'closeAge',
  'spreadRice', 'rollMaki', 'squeezeRoll',
]);
const TURN_STEPS = new Set<StepKey>(['turnBack', 'turnFront']);

const GESTURE_SECONDS = 0.9;
const WORD_LIFT = 0.17;
const FACE_TURN_RATE = 4;
/** The master's sleeves (square, metres) and hands (wrist to fingertips). */
const SLEEVE_WIDTH = 0.085;
const HAND_LENGTH = 0.09;
const UNIT_BOX = new BoxGeometry(1, 1, 1);

const ghostMaterial = new MeshBasicMaterial({
  color: '#4FB8FF',
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
  side: DoubleSide,
});

function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * A see-through hand built from boxes, palm down with fingers along local -Z
 * and its origin at the palm center. Fingers curl for a fist; thumb and index
 * close for a pinch. The left hand is the right hand mirrored.
 */
class GhostHand {
  readonly root = new Group();
  private readonly fingers: Group[] = [];
  private readonly thumb = new Group();

  constructor(name: string, mirror: boolean) {
    this.root.name = name;
    const palm = new Mesh(new BoxGeometry(0.075, 0.022, 0.085), ghostMaterial);
    palm.name = 'Palm';
    this.root.add(palm);
    for (let i = 0; i < 4; i++) {
      const knuckle = new Group();
      knuckle.position.set(-0.027 + i * 0.018, 0, -0.0425);
      const length = i === 3 ? 0.055 : 0.07;
      const finger = new Mesh(new BoxGeometry(0.015, 0.015, length), ghostMaterial);
      finger.name = 'Finger';
      finger.position.z = -length / 2;
      knuckle.add(finger);
      this.root.add(knuckle);
      this.fingers.push(knuckle);
    }
    this.thumb.position.set(-0.04, -0.004, 0.005);
    const thumbMesh = new Mesh(new BoxGeometry(0.016, 0.016, 0.06), ghostMaterial);
    thumbMesh.name = 'Thumb';
    thumbMesh.position.z = -0.03;
    this.thumb.add(thumbMesh);
    this.root.add(this.thumb);
    // A little larger than life so it reads at arm's length.
    this.root.scale.set(mirror ? -1.15 : 1.15, 1.15, 1.15);
    this.root.renderOrder = 850;
    this.root.visible = false;
  }

  /** curl 0..1 = open..fist, pinch 0..1, point = index stays straight. */
  pose(at: Vector3, yaw: number, curl: number, pinch: number, point = false): void {
    this.root.visible = true;
    this.root.position.copy(at);
    this.root.rotation.set(0, yaw, 0);
    for (let i = 0; i < 4; i++) {
      const c = i === 0 ? (point ? 0 : Math.max(curl, pinch * 0.55)) : curl;
      this.fingers[i].rotation.x = -c * 1.5;
    }
    this.thumb.rotation.set(-pinch * 0.4 - curl * 0.3, 0.6 - pinch * 0.55 - curl * 0.4, 0);
  }

  hide(): void {
    this.root.visible = false;
  }
}

/**
 * The master: an older chef standing beside you who shows the basic process
 * without a wall of text.
 *  - When you are stuck on a step, he says what comes next in two or three
 *    words above the place to act, with a wooden clack, and points at it.
 *  - If you stay stuck, see-through hands show the motion in a loop.
 *  - When you make a mistake, he says a word about it right away.
 *  - After a serve he nods ("Good.") or shakes his head ("Again.").
 *  - Once a step has been done a few times he stays quiet about it.
 * He reads the game through the shared progress snapshot and the coach
 * channel, and never changes the game state himself.
 */
/** What the master is asking for now (practice mode's Tab does it). */
export const masterApi = { step: null as StepKey | null };

export class MasterSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private entity!: Entity;
  private figure!: Group;
  private head!: Group;
  private handR!: Mesh;
  private sleeveR!: Mesh;
  private ghosts!: [GhostHand, GhostHand];
  private arrow!: Sprite;
  private words = new Map<string, Sprite>();
  private shownWord: Sprite | null = null;
  private wordTime = 0;
  private wordFollowsStep = false;
  private readonly wordAt = new Vector3();

  private step: StepKey | null = null;
  private idle = 0;
  private hintGiven = false;
  private demo = false;
  private demoTime = 0;
  /** Successes per step; taking from the case is counted per neta (where each one sits is learned one by one). */
  private successes = new Map<string, number>();
  private totalSuccesses = 0;
  private lastSaid = '';
  private gesture: 'none' | 'nod' | 'shake' = 'none';
  private gestureTime = 0;
  private facing = 0;
  private syncTime = 0;

  private readonly target = new Vector3();
  private readonly tmp = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly c = new Vector3();
  private readonly off = new Vector3();
  private readonly q = new Quaternion();
  private readonly handRestL = new Vector3(-0.2, 0.98, -0.1);
  private readonly handRestR = new Vector3(0.2, 0.98, -0.1);
  private readonly handPoint = new Vector3(0.16, 1.32, -0.34);
  private readonly shoulderL = new Vector3(-0.215, 1.4, -0.01);
  private readonly shoulderR = new Vector3(0.215, 1.4, -0.01);
  private readonly up = new Vector3(0, 1, 0);
  private readonly armDir = new Vector3();

  init(): void {
    const skin = new MeshStandardMaterial({ color: '#E3C3A0', roughness: 0.8 });
    const white = new MeshStandardMaterial({ color: '#F2EFE8', roughness: 0.9 });
    const navy = new MeshStandardMaterial({ color: '#23304A', roughness: 0.8 });
    this.figure = new Group();
    this.figure.name = 'Master';
    this.head = new Group();
    this.head.position.y = 1.55;
    const face = new Mesh(new SphereGeometry(0.1, 16, 12), skin);
    face.name = 'Head';
    const headband = new Mesh(new CylinderGeometry(0.103, 0.103, 0.03, 20, 1), navy);
    headband.name = 'Headband';
    headband.position.y = 0.04;
    this.head.add(face, headband);

    // Japanese-style work clothes. The figure faces -Z, so its right is +X.
    // The left sleeve hangs at rest and is welded into the white body; the
    // right sleeve follows the pointing hand every frame.
    const sleeveLen = this.armPose(this.shoulderL, this.handRestL, this.a, this.q);
    const sleeveL = new Matrix4().compose(this.a, this.q, this.tmp.set(SLEEVE_WIDTH, sleeveLen, SLEEVE_WIDTH));
    const whiteParts: BoxPart[] = [
      { w: 0.38, h: 0.62, d: 0.2, x: 0, y: 1.14, z: 0 }, // top, to the hips
      { w: 0.13, h: 0.82, d: 0.15, x: -0.08, y: 0.42, z: 0 }, // trousers
      { w: 0.13, h: 0.82, d: 0.15, x: 0.08, y: 0.42, z: 0 },
    ];
    const body = new Mesh(
      mergeGeometries([...whiteParts.map((p): [BoxGeometry, Matrix4] => [UNIT_BOX, partMatrix(p)]), [UNIT_BOX, sleeveL]]),
      white,
    );
    body.name = 'Clothes';
    // Crossed collar worn the living way: the wearer's left panel over the
    // right, so it reads as a "y" from the front. Then the sash, the long
    // apron and the sandals.
    const navyParts: BoxPart[] = [
      { w: 0.035, h: 0.35, d: 0.012, x: 0.03, y: 1.295, z: -0.106, rz: 0.475 },
      { w: 0.035, h: 0.12, d: 0.01, x: 0.025, y: 1.395, z: -0.103, rz: -0.43 },
      { w: 0.39, h: 0.05, d: 0.21, x: 0, y: 0.97, z: 0 },
      { w: 0.36, h: 0.56, d: 0.012, x: 0, y: 0.68, z: -0.112 },
      { w: 0.11, h: 0.04, d: 0.24, x: -0.08, y: 0.02, z: -0.03 },
      { w: 0.11, h: 0.04, d: 0.24, x: 0.08, y: 0.02, z: -0.03 },
    ];
    const trim = new Mesh(mergeGeometries(navyParts.map((p): [BoxGeometry, Matrix4] => [UNIT_BOX, partMatrix(p)])), navy);
    trim.name = 'Apron';

    const handGeometry = new BoxGeometry(0.06, HAND_LENGTH, 0.045);
    const handL = new Mesh(handGeometry, skin);
    handL.name = 'HandLeft';
    handL.position.copy(this.handRestL);
    handL.quaternion.copy(this.q);
    this.handR = new Mesh(handGeometry, skin);
    this.handR.name = 'HandRight';
    this.handR.position.copy(this.handRestR);
    this.sleeveR = new Mesh(new BoxGeometry(SLEEVE_WIDTH, 1, SLEEVE_WIDTH), white);
    this.sleeveR.name = 'SleeveRight';
    this.updateRightArm();
    this.figure.add(this.head, body, trim, handL, this.sleeveR, this.handR);
    this.figure.position.set(MASTER_POSITION[0], MASTER_POSITION[1], MASTER_POSITION[2]);
    this.entity = this.world.createTransformEntity(this.figure);
    this.entity.addComponent(Master, {});

    this.ghosts = [new GhostHand('GhostHandLeft', true), new GhostHand('GhostHandRight', false)];
    for (const ghost of this.ghosts) this.world.createTransformEntity(ghost.root);

    this.arrow = makeTurnArrowSprite();
    this.arrow.visible = false;
    this.world.createTransformEntity(this.arrow);

    debugLines.push(() => {
      const learned = this.step ? (this.successes.get(this.learnKey(this.step)) ?? 0) : 0;
      return `Master: ${this.step ?? '-'} done ${learned}/${MASTER_LEARNED_COUNT} idle ${this.idle.toFixed(1)}s demo ${this.demo ? 'on' : 'off'} said "${this.lastSaid}"`;
    });
  }

  update(delta: number): void {
    this.readEvents();

    const step = this.computeStep();
    masterApi.step = step;
    if (step !== this.step) {
      this.step = step;
      this.idle = 0;
      this.hintGiven = false;
      this.demo = false;
      this.demoTime = 0;
      if (this.wordFollowsStep) this.hideWord();
    }

    // Off in the phone's settings, he shows no next step (no word, no pointing, no see-through hands).
    const quiet = !step || this.learned(step) || !display.masterSteps;
    if (quiet) {
      this.idle = 0;
      this.demo = false;
      if (!display.masterSteps && this.wordFollowsStep && this.shownWord) this.hideWord();
    } else {
      this.idle += delta;
      const wait = this.totalSuccesses === 0 ? MASTER_FIRST_HINT_SECONDS : MASTER_HINT_IDLE_SECONDS;
      if (coach.nudged) this.idle = Math.max(this.idle, wait);
      if (this.idle >= wait && !this.hintGiven) {
        this.hintGiven = true;
        this.say(this.stepWord(step!), true);
      }
      if (this.idle >= wait + MASTER_DEMO_DELAY_SECONDS && !this.demo) {
        this.demo = true;
        this.demoTime = 0;
        this.say(this.stepWord(step!), true);
      }
    }
    coach.nudged = false;

    this.updateWord(delta);
    this.updateDemo(delta);
    this.updateFigure(delta);
    this.sync(delta);
  }

  // ---- events --------------------------------------------------------------

  private readEvents(): void {
    for (const key of coach.doneSteps) {
      const learnKey = this.learnKey(key);
      const n = (this.successes.get(learnKey) ?? 0) + 1;
      this.successes.set(learnKey, n);
      this.totalSuccesses++;
      if (key === this.step) {
        this.idle = 0;
        this.demo = false;
      }
    }
    coach.doneSteps.length = 0;

    for (const m of coach.mistakes) {
      // His word only if the player wants it (src/display-settings.ts); the head shake stays.
      if (display.masterWords) {
        this.anchorAtStation(m.at);
        this.say(MISTAKE_WORDS[m.key], false);
      }
      this.startGesture('shake');
    }
    coach.mistakes.length = 0;

    // The stock running low: his word only if the player wants it (no gesture).
    for (const w of coach.warnings) {
      if (!display.masterWords) continue;
      this.anchorAtStation(w.at);
      this.say(WARNING_WORDS[w.key], false);
    }
    coach.warnings.length = 0;

    if (coach.servedGrade) {
      this.react(coach.servedGrade);
      coach.servedGrade = null;
    }
  }

  private react(grade: Grade): void {
    const geta = stations.get(StationKind.Geta);
    if (geta) this.wordAt.copy(geta.pos).add(this.tmp.set(0, 0.25, 0));
    else this.inFrontOfChef(this.wordAt, 0.55, -0.1);
    if (grade === 'Excellent') {
      this.startGesture('nod');
      if (display.masterWords) this.say('Good.', false);
    } else if (grade === 'Good') {
      this.startGesture('nod');
    } else if (grade === 'Bad') {
      this.startGesture('shake');
      if (display.masterWords) this.say('Again.', false);
    }
  }

  // ---- which step comes next ------------------------------------------------

  private computeStep(): StepKey | null {
    const [L, R] = chef.hands;
    const back = chef.facingBack;

    if (progress.clothHeld) {
      if (chef.clothDirty) return back ? 'rinseCloth' : 'turnBack';
      if (!back && chef.boardDirt > 0) return 'wipeBoard';
      return back ? 'turnFront' : null;
    }
    // The morning prep starts with the call to the fish shop (the phone in the office corner, pointed at).
    if (prep.active && fishOrder.ordering) return 'orderFish';
    if (prep.active && !prep.ordered && !holdingAnything()) return 'callFishShop';
    // In service, a batch of rice the chef cooks himself (full; src/shari-system.ts): its steps till the ohitsu is back on its stand.
    const batch = !prep.active && shari.step !== 'done' ? this.serviceShariStep(back) : null;
    if (!holdingAnything()) {
      if ((L.needsWash || R.needsWash || L.needsTowel || R.needsTowel) && chef.at !== 'seat') return this.goTo('seat', 'back', back, 'turnBack');
      if (L.needsWash || R.needsWash) {
        if (!back) return 'turnBack';
        return !chef.open && !chef.soaped ? 'soap' : 'washHands';
      }
      if (L.needsTowel || R.needsTowel) return back ? 'towel' : 'turnBack';
      if (chef.clothDirty) return back ? 'turnFront' : 'takeCloth';
      // In the prep, prepStep says which way to face (the back row has its own work).
      if (back && !prep.active && !batch) return 'turnFront';
    }
    // The morning prep, before the bar opens.
    if (prep.active) return this.prepStep(back);
    if (batch) return batch;
    if (!chef.open || back) return null;
    // Customer care between pieces: the check, and the tea when the part-timer is not there to make it.
    if (chef.hands.some((h) => h.holding === Held.Tea)) return 'serveTea';
    if (progress.kind === null && !progress.sakuOnBoard && !progress.knifeHeld && !progress.hasNeta && !progress.hasRice) {
      if (service.check) return 'check';
      if (tea.cup === 'atHand') return 'serveTea';
      if (tea.wanted && tea.cup === 'none' && !staff.partTimer) return 'makeTea';
    }
    // A roll uses the knife too: its own recipe decides about the knife.
    if ((progress.kind ?? orderKind()) === 'maki') return this.makiStep();

    if (progress.knifeHeld) {
      if (progress.hasNeta) return chef.knifeDirty ? 'wipeKnife' : 'putKnife';
      return progress.sakuOnBoard && !progress.sakuWrong ? 'cut' : 'putKnife';
    }
    if ((progress.kind ?? orderKind()) === 'gunkan') return this.gunkanStep();
    if ((progress.kind ?? orderKind()) === 'inari') return this.inariStep();
    if (!progress.hasNeta) {
      if (progress.sakuOnBoard) return progress.sakuWrong ? 'returnSaku' : 'holdKnife';
      if (chef.boardDirt > 0 && progress.stage === 'None' && !progress.hasRice) return 'wipeBoard';
      return service.order ? 'takeSaku' : null;
    }
    switch (progress.stage) {
      case 'None':
        return 'takeNeta';
      case 'Neta':
      case 'Rice':
        if (!progress.hasRice) return chef.hands[chef.riceSide].wet ? 'rice' : 'tezu';
        if (service.order?.wasabi && progress.wasabi !== 'neta') return 'wasabi';
        return 'join';
      case 'Joined':
        return 'touch1';
      case 'Touched1':
        return 'flip';
      case 'Flipped':
        return 'touch2';
      case 'Touched2':
        return 'rotate';
      case 'Rotated':
        return 'touch3';
      case 'Done':
      case 'Carried':
        return 'place';
      case 'Placed':
        return 'serve';
    }
    return null;
  }

  /** The morning prep: a material from the ice box onto the board, its cuts, then each saku into the case. */
  /** The prep steps done facing the sink: washing the board and letting it drain. */
  private prepWantsBack(): boolean {
    return prep.next === 'washBoard' || prep.next === 'leanBoard' || prep.next === 'dryBoard' || (prep.next === 'liftBoard' && prep.boardAt.z > 0) || prep.where === 'sink';
  }

  /** The knife's morning edge, once the board is back: the knife from its box, the stone wetted in the basin, the strokes, the rinse, then the wipe at the bar. */
  private sharpenStep(back: boolean): StepKey {
    if (!progress.knifeHeld) return this.goTo('seat', 'front', back, 'holdKnife');
    if (!sharpen.stoneWet) return this.goTo('sink', 'back', back, 'wetStone');
    if (!sharpen.doneToday) return this.goTo('sink', 'back', back, 'sharpen');
    if (!sharpen.rinsed) return this.goTo('sink', 'back', back, 'rinseKnife');
    return this.goTo('seat', 'front', back, chef.knifeDirty ? 'wipeKnife' : 'putKnife');
  }

  /** The empties: the anago's pack into the trash (at the bar); then the inserts one at a time from the pile (from the stool), washed at the sink under the other hand, dried with the cloth from the sink's edge in that hand, stacked on the sink's end. */
  private nakagoStep(back: boolean): StepKey {
    if (nakago.held === null) return this.atIceBox(back, nakago.pack ? 'binPack' : 'takeNakago');
    if (nakago.heldKind === 'pack') return this.goTo('seat', 'front', back, 'binPack');
    return this.goTo('sink', 'back', back, !nakago.washed ? 'washNakago' : !nakago.dried ? 'dryNakago' : 'rackNakago');
  }

  /** The morning prep: the fish from the ice, its work, the saku into the case, the scraps out, the board washed, the noren. */
  private prepStep(back: boolean): StepKey | null {
    // Before the noren: the knife's edge (the knife stays in hand through it, and comes back to the bar after).
    if (sharpenWanted() || !sharpen.rinsed || (sharpen.doneToday && progress.knifeHeld && chef.at !== 'seat')) return this.sharpenStep(back);
    // The tamago's first side done: whatever is in hand is put down first (its face down goes on browning), then the range.
    if (tamago.next === 'turn') {
      if (prep.debaHeld) return 'putDeba';
      if (prep.scalerHeld || prep.tweezersHeld) return 'putTool';
      if (progress.knifeHeld) return chef.knifeDirty ? 'wipeKnife' : 'putKnife';
    }
    // A pot in hand (from the cupboard under the sink) goes onto its burner first. A pot still in the
    // cupboard is fetched in backRowStep, after a flame that wants turning: the practice's range key
    // turns the knob first too, and asking for the pot here sent the two to and fro between the sink and the range.
    if (range.potHeld) return this.goTo('range', 'back', back, 'potFromCupboard');
    // The emptied inserts (中子) the range's ingredients came in: once all are in their pots, washed and stacked before the fish under them.
    if (nakagoWanted()) return this.nakagoStep(back);
    // The whole fish's tools go back once their work is done: the deba at the sink, the scaler and the tweezers anywhere.
    if (prep.debaHeld) return prep.next === 'cut' && prep.where === 'sink' ? this.goTo('sink', 'back', back, 'cutPrep') : 'putDeba';
    if ((prep.scalerHeld && prep.next !== 'scale') || (prep.tweezersHeld && prep.next !== 'pins')) return 'putTool';
    if (progress.knifeHeld) {
      if (prep.next === 'cut' && prep.where === 'board') return 'cutPrep';
      return chef.knifeDirty ? 'wipeKnife' : 'putKnife';
    }
    const cured = this.cureStep(back);
    if (cured) return cured;
    const row = this.backRowStep(back);
    if (row) return row;
    const boardWork =
      prep.next === 'take' || prep.next === 'cut' || prep.next === 'pull' || prep.next === 'wipe' || prep.next === 'stock' || prep.next === 'discard' ||
      prep.next === 'scale' || prep.next === 'turn' || prep.next === 'rinse' || prep.next === 'pins';
    if (!boardWork) {
      const belly = this.bellyStep(back);
      if (belly) return belly;
    }
    // The board's work is done from the stool, facing the bar; the board's washing facing the sink.
    const front = (step: StepKey): StepKey => this.goTo('seat', 'front', back, step);
    const sink = (step: StepKey): StepKey => this.goTo('seat', 'back', back, step);
    // Stage 4's washing (水洗い), standing at the sink.
    const atSink = (step: StepKey): StepKey => this.goTo('sink', 'back', back, step);
    if (prep.where === 'sink') {
      switch (prep.next) {
        case 'take':
          // The fish box stands at the drainboard's foot (the full difficulty's curing is on the drainboard).
          return prep.takeFrom === 'fish' && !prep.materialHeld ? this.goTo('drain', 'back', back, 'takeMaterial') : atSink('takeMaterial');
        case 'cut':
          return atSink('holdDeba');
        case 'pull':
          return atSink('pullPrep');
        case 'scale':
          return atSink('scaleFish');
        case 'turn':
          return atSink('turnFish');
        case 'rinse':
          return atSink('rinseFish');
        case 'discard':
          return atSink('discardScrap');
      }
    }
    switch (prep.next) {
      case 'turn':
        return front('turnFish');
      case 'pins':
        return front('pullPins');
      case 'take':
        return front('takeMaterial');
      case 'cut':
        return front('holdKnife');
      case 'pull':
        return front('pullPrep');
      case 'wipe':
        return front('wipePaper');
      case 'stock':
        // A fish to cure goes to its tray on the drainboard (picked up at the board first).
        if (prep.stockTo === 'cure') return prep.productHeld ? this.goTo('drain', 'back', back, 'layCure') : front('layCure');
        return front('stockSaku');
      case 'discard':
        return front('discardScrap');
      case 'liftBoard':
        return prep.boardAt.z > 0 ? sink('liftBoard') : front('liftBoard');
      case 'washBoard':
        return sink('washBoard');
      case 'leanBoard':
        return sink('leanBoard');
      case 'dryBoard':
        return null;
      case 'returnBoard':
        return front('returnBoard');
      case 'noren':
        return front('hangNoren');
    }
    if (chef.at !== 'seat') return this.goTo('seat', 'front', back, 'turnFront');
    return back ? 'turnFront' : null;
  }

  /**
   * The step itself when the chef is at `place` facing the right way, or how
   * to get there: turned round, point at the work table or the range; back
   * from there, facing the bar, point at the board.
   */
  private goTo(place: Place, facing: 'back' | 'front', back: boolean, step: StepKey): StepKey {
    if (chef.at !== place) {
      if (place === 'seat') return back ? 'turnFront' : 'stepSeat';
      return back ? (place === 'table' ? 'stepTable' : place === 'sink' ? 'stepSink' : place === 'drain' ? 'stepDrain' : place === 'shelf' ? 'stepShelf' : 'stepRange') : 'turnBack';
    }
    if (facing === 'back') return back ? step : 'turnBack';
    return back ? 'turnFront' : step;
  }

  /** The ice box is in reach from the stool and from the range, facing the bar. */
  private atIceBox(back: boolean, step: StepKey): StepKey {
    // A left-handed chef's ice box is at the counter's right end, out of reach from the back row: from the stool.
    if (handedness.left && chef.at !== 'seat') return back ? 'turnFront' : 'stepSeat';
    if (chef.at === 'table') return back ? 'stepRange' : 'turnBack';
    if (chef.at === 'sink' || chef.at === 'drain') return back ? 'turnFront' : 'stepSeat';
    return back ? 'turnFront' : step;
  }

  /**
   * The full difficulty's curing on the drainboard (src/cure-system.ts): what
   * is in a hand of it first, then the salt, the rinse and the vinegar when
   * their time has come; it waits while the prep has something in a hand.
   */
  private cureStep(back: boolean): StepKey | null {
    const next = cure.next;
    if (!next || next === 'wait') return null;
    const held = cure.saltHeld || cure.trayHeld || cure.fishHeld;
    if (!held && (prep.carrying[0] || prep.carrying[1] || prep.materialHeld)) return null;
    const at = (step: StepKey): StepKey => this.goTo('drain', 'back', back, step);
    switch (next) {
      case 'bed':
      case 'salt':
        return at('saltCure');
      case 'rinse':
      case 'back':
        return at('rinseCure');
      case 'move':
        return at('vinegarCure');
      case 'out':
        return at('cureOut');
      case 'case':
        return this.goTo('seat', 'front', back, 'cureOut');
      case 'soon':
        return at('waitCure');
    }
    return null;
  }

  /**
   * The back row's work in the prep, before the board's: what is in a hand
   * first, then a flame that wants turning (the eel near the boil, a pot
   * done), the rice cooker (lit early, it takes time), the range's
   * ingredients into their pots, what is done out of them, and the shari.
   */
  private backRowStep(back: boolean): StepKey | null {
    // A flame wanting a turn comes first (the eel near the boil, a pot done): one free hand will do.
    const handFree = chef.hands.some((h) => h.holding === Held.None);
    if (handFree && range.burners.some((b) => b.want === 'knob')) return this.goTo('range', 'back', back, 'turnKnob');
    const shariHeld = this.shariHeldStep(back);
    if (shariHeld) return shariHeld;
    // The tamago's scallops go to the suribachi on the work table; the rest to their pots on the range.
    if (prep.next === 'pot') return this.goTo(prep.onBoard === 'Tamago' ? 'table' : 'range', 'back', back, 'potIn');
    if (tamago.panHeld) return this.goTo('range', 'back', back, 'panOn');
    if (tamago.eggHeld) return this.goTo('seat', 'front', back, 'eggOut');
    if (tamago.pestleHeld) return this.goTo('table', 'back', back, 'grindTamago');
    if (tamago.sticksHeld) return this.goTo('table', 'back', back, 'whiskTamago');
    if (tamago.jarHeld) return this.goTo('table', 'back', back, tamago.next === 'sugar' ? 'sugarTamago' : 'saltTamago');
    // The oil pot and the lid go to the pan; the chopsticks stay there for the toss; a sheet of paper wipes the pan.
    if (tamago.oilHeld) return this.goTo('range', 'back', back, 'oilPan');
    if (tamago.lidHeld) return this.goTo('range', 'back', back, 'lidTamago');
    if (tamago.flipSticksHeld && tamago.next === 'turn') return this.goTo('range', 'back', back, 'turnEgg');
    if (tamago.next === 'wipe' && chef.hands.some((h) => h.holding === Held.Paper)) return this.goTo('range', 'back', back, 'wipePan');
    // The suribachi in hand: from the cupboard to the work table, or (with the batter) to the pan.
    if (tamago.bowlHeld) return this.goTo(tamago.next === 'suribachi' ? 'table' : 'range', 'back', back, tamago.next === 'suribachi' ? 'suribachiOut' : 'pourTamago');
    if (range.netHeld) return this.goTo('range', 'back', back, 'hangNet');
    if (range.ingHeld) return this.goTo('seat', 'front', back, 'toCase');
    if (range.bellyHeld) {
      switch (range.belly) {
        case 'ice':
        case 'chilled':
          return this.goTo('seat', 'front', back, 'bellyBoard');
        case 'skewered':
          return this.goTo('range', 'back', back, 'bellyNet');
        case 'net':
          return this.atIceBox(back, 'chillBelly');
        case 'free':
          return this.goTo('seat', 'front', back, 'toCase');
      }
    }
    if (holdingAnything()) return null;
    // The tamago's pan onto its burner before its batter comes out of the ice; turned (before the rice: the face down goes on browning); out when done.
    if (tamago.next === 'pan' || tamago.next === 'turn' || tamago.next === 'lid' || tamago.next === 'press' || tamago.next === 'turnOut') {
      const key = { pan: 'panOn', turn: 'turnEgg', lid: 'lidTamago', press: 'pressLid', turnOut: 'turnOutTamago' } as const;
      return this.goTo('range', 'back', back, key[tamago.next]);
    }
    // The oil from the food shelf (the pan hot); the paper from its box at the bar to wipe the pan; the cooled tamago from its lid on the work table.
    if (tamago.next === 'oil') return this.goTo('shelf', 'back', back, 'oilPan');
    if (tamago.next === 'wipe') return this.goTo('seat', 'front', back, 'wipePan');
    if (tamago.next === 'out') return this.goTo('table', 'back', back, 'eggOut');
    // The suribachi from the cupboard under the sink onto the work table; the batter made in it there: ground, the eggs in, mixed; then taken to the pan.
    if (tamago.next === 'cupboard') return this.goTo('sink', 'back', back, 'cupboardTamago');
    if (tamago.next === 'suribachi') return this.goTo('sink', 'back', back, 'suribachiOut');
    if (tamago.next === 'grind') return this.goTo('table', 'back', back, 'grindTamago');
    if (tamago.next === 'salt' || tamago.next === 'sugar') return this.goTo('shelf', 'back', back, tamago.next === 'salt' ? 'saltTamago' : 'sugarTamago');
    if (tamago.next === 'whisk') return this.goTo('table', 'back', back, 'whiskTamago');
    if (tamago.next === 'eggs') return this.goTo('table', 'back', back, 'eggsTamago');
    if (tamago.next === 'pour') return this.goTo('table', 'back', back, 'pourTamago');
    if (shari.step === 'light' || shari.step === 'turnOut') return this.goTo('table', 'back', back, shari.step === 'light' ? 'lightRice' : 'turnOutRice');
    // Its pot comes out of the cupboard under the sink onto its burner before the ingredient is taken.
    if (range.potHeld) return this.goTo('range', 'back', back, 'potFromCupboard');
    if (prep.next === 'take' && prep.takeToPot && prep.takeId !== 'Tamago' && range.burners.find((b) => b.id === prep.takeId)?.stored) {
      return this.goTo('sink', 'back', back, cupboard.open === 'right' ? 'potFromCupboard' : 'cupboardPot');
    }
    if (prep.next === 'take' && prep.takeToPot) return this.atIceBox(back, 'takeMaterial');
    if (range.burners.some((b) => b.want === 'take')) return this.goTo('range', 'back', back, 'potOut');
    return this.shariWorkStep(back);
  }

  /** The shari's tools in a hand: the ohitsu, the paddle, the awasezu. */
  private shariHeldStep(back: boolean): StepKey | null {
    if (shari.tubHeld) return shari.step === 'return' || shari.step === 'done' ? this.goTo('seat', 'front', back, 'returnTub') : this.goTo('table', 'back', back, 'bringTub');
    if (shari.shamojiHeld) {
      if (shari.step === 'cut') return this.goTo('table', 'back', back, 'cutShari');
      if (shari.step === 'scoop') return this.goTo('table', 'back', back, shari.tubOnTable ? 'scoopShari' : 'bringTub');
    }
    if (shari.awasezuHeld && shari.step === 'vinegar') return this.goTo('table', 'back', back, 'pourAwasezu');
    return null;
  }

  /** The shari's next step after the rice is turned out: the awasezu, the cutting, the scooping, the ohitsu back. */
  private shariWorkStep(back: boolean): StepKey | null {
    switch (shari.step) {
      case 'vinegar':
        return this.goTo('table', 'back', back, 'pourAwasezu');
      case 'cut':
        return this.goTo('table', 'back', back, 'cutShari');
      case 'scoop':
        return shari.tubOnTable ? this.goTo('table', 'back', back, 'scoopShari') : this.goTo('seat', 'front', back, 'bringTub');
      case 'return':
        return this.goTo('table', 'back', back, 'returnTub');
    }
    return null;
  }

  /** A batch of rice the chef cooks himself in service (full): the morning's shari steps; while it cooks and steams, the bar. */
  private serviceShariStep(back: boolean): StepKey | null {
    const held = this.shariHeldStep(back);
    if (held) return held;
    if (holdingAnything()) return null;
    if (shari.step === 'turnOut') return this.goTo('table', 'back', back, 'turnOutRice');
    const work = this.shariWorkStep(back);
    if (work) return work;
    return chef.at !== 'seat' ? (back ? 'turnFront' : 'stepSeat') : null;
  }

  /** The bonito belly after the saku-taking: skewers on the board, the net, the ice, paper, the case. */
  private bellyStep(back: boolean): StepKey | null {
    switch (range.belly) {
      case 'ice':
      case 'chilled':
        return this.atIceBox(back, 'bellyBoard');
      case 'board':
        return this.goTo('seat', 'front', back, 'skewer');
      case 'skewered':
        if (range.netOn < 0) return range.burners.some((b) => b.state === 'out' && !b.pan) ? this.goTo('range', 'back', back, 'hangNet') : null;
        return this.goTo('seat', 'front', back, 'bellyNet');
      case 'net':
        return range.bellySeared ? this.goTo('range', 'back', back, 'chillBelly') : this.goTo('range', 'back', back, 'searTurn');
      case 'wet':
        return this.goTo('seat', 'front', back, 'wipePaper');
      case 'patted':
        return this.goTo('seat', 'front', back, 'unskewer');
      case 'free':
        return this.goTo('seat', 'front', back, 'toCase');
    }
    return null;
  }

  /** A gunkan: rice, a nori strip, wrap, wasabi if ordered, the topping, then the geta. */
  private gunkanStep(): StepKey | null {
    if (progress.sakuOnBoard) return 'returnSaku';
    if (progress.stage === 'Done' || progress.stage === 'Carried') return 'place';
    if (progress.stage === 'Placed') return 'serve';
    if (!progress.wrapped) {
      // Made on the board: the shari shaped and set down, then the nori round it.
      if (!progress.shariDown) {
        if (!progress.hasRice) return chef.hands[chef.riceSide].wet ? 'rice' : 'tezu';
        return progress.shaped ? 'setShari' : 'shapeShari';
      }
      // The strip's end on the shari, a finger on it, then round (二点留め).
      return !progress.noriHeld ? 'takeNori' : progress.noriPinned ? 'wrapNori' : 'pinNori';
    }
    if (service.order?.wasabi && progress.wasabi !== 'neta') return 'wasabi';
    return progress.topped ? null : 'spoonTopping';
  }

  /** An inari: rice, a pouch from the case, fill it, fold it shut on the beat, then the geta. */
  private inariStep(): StepKey | null {
    if (progress.sakuOnBoard) return 'returnSaku';
    if (progress.stage === 'Done' || progress.stage === 'Carried') return 'place';
    if (progress.stage === 'Placed') return 'serve';
    if (!progress.stuffed) {
      if (!progress.hasRice) return chef.hands[chef.riceSide].wet ? 'rice' : 'tezu';
      return progress.ageHeld ? 'stuffAge' : 'takeAge';
    }
    return progress.closed ? null : 'closeAge';
  }

  /** The ordered roll's next filling is cut from a saku on the board (the tekka's tuna) and is not cut yet. */
  private coreNext(): boolean {
    const order = service.order;
    if (!order || MENU[order.item].kind !== 'maki') return false;
    const next = MENU[order.item].neta[progress.fillings];
    return !!next && !!CORE_FROM[next] && !progress.coreOnBoard && !progress.coreHeld;
  }

  /** A roll: nori on the mat, rice, spread, wasabi, fillings (the tekka's cut from the lean tuna), roll, squeeze, the cuts, then the geta. */
  private makiStep(): StepKey | null {
    if (progress.sakuOnBoard && !progress.knifeHeld && !this.coreNext()) return 'returnSaku';
    const stage = progress.stage;
    if (stage === 'Done' || stage === 'Carried') {
      if (progress.knifeHeld) return chef.knifeDirty ? 'wipeKnife' : 'putKnife';
      return 'place';
    }
    if (stage === 'Placed') return 'serve';
    if (!progress.matNori) return progress.knifeHeld ? 'putKnife' : 'layNori';
    if (progress.spread < 1) {
      if (!progress.hasRice) return chef.hands[chef.riceSide].wet ? 'rice' : 'tezu';
      return 'spreadRice';
    }
    const needed = service.order ? MENU[service.order.item].neta.length : 1;
    if (service.order?.wasabi && progress.wasabi !== 'neta' && progress.fillings === 0) return 'wasabi';
    if (progress.fillings < needed) {
      const next = service.order ? MENU[service.order.item].neta[progress.fillings] : undefined;
      if (next && CORE_FROM[next]) {
        // The tekka's core: the lean tuna to the board, one slice, the knife away, the slice onto the mat.
        if (progress.coreHeld) return 'placeFilling';
        if (progress.coreOnBoard) return progress.knifeHeld ? (chef.knifeDirty ? 'wipeKnife' : 'putKnife') : 'takeNeta';
        if (!progress.sakuOnBoard) return 'takeSaku';
        return progress.knifeHeld ? 'cut' : 'holdKnife';
      }
      return 'placeFilling';
    }
    if (!progress.rolled) return 'rollMaki';
    if (!progress.squeezed) return 'squeezeRoll';
    if (progress.cutsDone < progress.cutsNeeded) return progress.knifeHeld ? 'cutRoll' : 'holdKnife';
    return null;
  }

  /** The next filling for the roll on order, if any. */
  private nextFilling(): (typeof MENU)[keyof typeof MENU]['neta'][number] | null {
    const order = service.order;
    if (!order || MENU[order.item].kind !== 'maki') return null;
    return MENU[order.item].neta[progress.fillings] ?? null;
  }

  private learned(step: StepKey): boolean {
    return (this.successes.get(this.learnKey(step)) ?? 0) >= MASTER_LEARNED_COUNT;
  }

  /** The step, or for taking from the case the step and the ordered neta. */
  private learnKey(step: StepKey): string {
    if (step !== 'takeSaku') return step;
    const neta = orderNeta();
    return neta ? `takeSaku:${neta}` : step;
  }

  private stepWord(step: StepKey): string {
    const neta = orderNeta();
    if (step === 'takeSaku' && neta) return `Take the ${NETA[neta].name.toLowerCase()}`;
    if (step === 'spoonTopping' && neta) return `${neta === 'Uni' ? 'Spatula' : 'Spoon'} on the ${NETA[neta].name.toLowerCase()}`;
    const filling = step === 'placeFilling' ? this.nextFilling() : null;
    if (filling) return `Lay the ${NETA[filling].name.toLowerCase()}`;
    if (step === 'place' && (progress.kind ?? orderKind()) !== 'nigiri') return 'Onto the geta';
    if (step === 'place') return service.customerHandKnown ? 'Geta: on the diagonal' : 'Geta: straight across';
    // A cut or a pull in the prep says which one (Cut off the skin side, Off with the bag...).
    if ((step === 'cutPrep' || step === 'pullPrep' || step === 'scaleFish' || step === 'turnFish' || step === 'rinseFish' || step === 'pullPins') && prep.say) return prep.say;
    if ((step === 'saltCure' || step === 'rinseCure' || step === 'vinegarCure' || step === 'cureOut' || step === 'waitCure') && cure.say) return cure.say;
    if ((step === 'panOn' || step === 'turnEgg' || step === 'eggOut' || step === 'oilPan' || step === 'lidTamago' || step === 'pressLid' || step === 'turnOutTamago' || step === 'wipePan' || step === 'cupboardTamago' || step === 'suribachiOut' || step === 'saltTamago' || step === 'sugarTamago' || step === 'grindTamago' || step === 'eggsTamago' || step === 'whiskTamago' || step === 'pourTamago') && tamago.say) return tamago.say;
    if (step === 'potIn' && prep.onBoard === 'Tamago' && tamago.next === 'makings') return tamago.say;
    return STEP_WORDS[step];
  }

  /** The station a step happens at (for pointing, words and the demo). */
  private stepStation(step: StepKey): Kind | null {
    switch (step) {
      case 'soap':
        return StationKind.Soap;
      case 'washHands':
      case 'rinseCloth':
        return StationKind.Sink;
      case 'towel':
        return StationKind.Towel;
      case 'takeCloth':
      case 'wipeKnife':
        return StationKind.WetCloth;
      case 'wipeBoard':
      case 'cut':
      case 'takeNeta':
        return StationKind.CuttingBoard;
      case 'takeSaku':
      case 'returnSaku':
      case 'spoonTopping':
      case 'takeAge':
      case 'placeFilling':
        return StationKind.NetaCase;
      case 'layNori':
      case 'spreadRice':
      case 'rollMaki':
      case 'squeezeRoll':
      case 'cutRoll':
        return StationKind.Makisu;
      case 'takeNori':
        return StationKind.NoriBox;
      case 'setShari':
        return StationKind.CuttingBoard;
      case 'takeMaterial':
      case 'takeNakago':
        return StationKind.IceBox;
      case 'binPack':
        return nakago.held !== null ? StationKind.TrashBin : StationKind.IceBox;
      case 'washNakago':
      case 'dryNakago':
        return StationKind.Sink;
      case 'rackNakago':
        return StationKind.Whetstone;
      case 'callFishShop':
        return StationKind.Phone;
      case 'orderFish':
        return StationKind.NetaCase;
      case 'stepDrain':
      case 'layCure':
      case 'saltCure':
      case 'rinseCure':
      case 'vinegarCure':
      case 'waitCure':
        return StationKind.Sink;
      case 'cureOut':
        return cure.fishHeld ? StationKind.NetaCase : StationKind.Sink;
      case 'eggOut':
        return tamago.eggHeld ? StationKind.NetaCase : null;
      case 'wipePan':
        return chef.hands.some((h) => h.holding === Held.Paper) ? null : StationKind.PaperBox;
      case 'wipePaper':
        return StationKind.PaperBox;
      case 'discardScrap':
        return StationKind.TrashBin;
      case 'liftBoard':
      case 'returnBoard':
        return StationKind.CuttingBoard;
      case 'washBoard':
      case 'leanBoard':
        return StationKind.Sink;
      case 'cutPrep':
      case 'pullPrep':
      case 'turnFish':
        return prep.where === 'sink' ? StationKind.Sink : StationKind.CuttingBoard;
      case 'scaleFish':
      case 'rinseFish':
      case 'holdDeba':
      case 'putDeba':
        return StationKind.Sink;
      case 'pullPins':
        return StationKind.CuttingBoard;
      case 'stockSaku':
        return StationKind.NetaCase;
      case 'holdKnife':
      case 'putKnife':
        return StationKind.Knife;
      case 'tezu':
        return StationKind.Tezu;
      case 'rice':
        return StationKind.RiceTub;
      case 'wasabi':
        return StationKind.Wasabi;
      case 'place':
      case 'serve':
        return StationKind.Geta;
      default:
        return null;
    }
  }

  /** Where the word for a step floats, written into `out`. */
  private stepWordAt(step: StepKey, out: Vector3): void {
    if (TURN_STEPS.has(step)) {
      this.inFrontOfChef(out, 0.55, -0.12);
      return;
    }
    if (PIECE_STEPS.has(step)) {
      out.copy(progress.pieceAt).add(this.tmp.set(0, 0.14, 0));
      return;
    }
    switch (step) {
      case 'takeSaku':
      case 'spoonTopping':
      case 'takeAge':
        if (this.orderedSakuAt(out)) {
          out.y += 0.15;
          return;
        }
        break;
      case 'returnSaku':
      case 'cut':
        out.copy(progress.sakuAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'cutRoll':
        out.copy(progress.guideAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'takeMaterial':
        out.copy(prep.boxAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'cutPrep':
        out.copy(prep.guideAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'pullPrep':
      case 'scaleFish':
      case 'turnFish':
        out.copy(prep.materialAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'rinseFish':
        out.copy(prep.rinseAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'pullPins':
        out.copy(prep.pinsAt[0] ?? prep.materialAt).add(this.tmp.set(0, 0.12, 0));
        return;
      case 'holdDeba':
      case 'putDeba':
        out.copy(prep.debaAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'putTool':
        out.copy(prep.scalerHeld ? prep.scalerAt : prep.tweezersAt).add(this.tmp.set(0, 0.12, 0));
        return;
      case 'stepSink':
        out.set(SINK_BASIN_X, SINK_TOP + 0.3, BACK_ROW_Z + 0.15);
        return;
      case 'stepShelf':
        out.set(FOOD_SHELF_X - 0.1, 1.1, FOOD_SHELF_Z);
        return;
      case 'saltTamago':
        out.copy(tamago.jarHeld ? tamago.bowlAt : tamago.saltAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'sugarTamago':
        out.copy(tamago.jarHeld ? tamago.bowlAt : tamago.sugarAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'stepDrain':
        out.set(DRAIN_SPOT_X, SINK_TOP + 0.3, BACK_ROW_Z + 0.15);
        return;
      case 'layCure':
        out.copy(prep.productHeld ? prep.slotAt : prep.productAt).add(this.tmp.set(0, 0.18, 0));
        return;
      case 'saltCure':
        out.copy(cure.saltAt).add(this.tmp.set(0, 0.2, 0));
        return;
      case 'rinseCure':
      case 'waitCure':
        out.copy(cure.trayAt).add(this.tmp.set(0, 0.22, 0));
        return;
      case 'vinegarCure':
        out.copy(cure.fishHeld ? cure.dropAt : cure.fishAt).add(this.tmp.set(0, 0.2, 0));
        return;
      case 'cureOut':
        out.copy(cure.fishHeld ? cure.caseAt : cure.fishAt).add(this.tmp.set(0, 0.2, 0));
        return;
      case 'stockSaku':
        out.copy(prep.slotAt).add(this.tmp.set(0, 0.18, 0));
        return;
      case 'discardScrap':
        out.copy(prep.scrapAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'wipePaper':
        out.copy(range.belly === 'wet' ? range.bellyAt : prep.materialAt).add(this.tmp.set(0, 0.15, 0));
        return;
      // The back row.
      case 'stepTable':
        out.set(WORKTABLE_X, SINK_TOP + 0.3, BACK_ROW_Z + 0.15);
        return;
      case 'stepRange':
        out.set(STOVE_X, RANGE_HEIGHT + 0.35, BACK_ROW_Z + 0.15);
        return;
      case 'stepSeat': {
        const board = stations.get(StationKind.CuttingBoard);
        if (board) {
          out.copy(board.pos).add(this.tmp.set(0, 0.25, 0));
          return;
        }
        break;
      }
      case 'lightRice':
      case 'turnOutRice':
        out.copy(shari.cookerAt).setY(SINK_TOP + 0.22);
        return;
      case 'pourAwasezu':
        out.copy(shari.awasezuHeld ? shari.hangiriAt : shari.awasezuAt).add(this.tmp.set(0, 0.22, 0));
        return;
      case 'cutShari':
      case 'scoopShari':
        out.copy(shari.hangiriAt).add(this.tmp.set(0, 0.25, 0));
        return;
      case 'bringTub':
        out.copy(shari.tubHeld ? shari.tubTableAt : shari.tubHomeAt).add(this.tmp.set(0, 0.25, 0));
        return;
      case 'returnTub':
        out.copy(shari.tubHeld ? shari.tubHomeAt : shari.tubTableAt).add(this.tmp.set(0, 0.25, 0));
        return;
      case 'potIn':
        out.copy(prep.slotAt).add(this.tmp.set(0, 0.25, 0));
        return;
      case 'turnKnob':
      case 'potOut': {
        const b = range.burners.find((x) => x.want === (step === 'turnKnob' ? 'knob' : 'take'));
        if (b) {
          if (step === 'turnKnob') out.copy(b.knobAt).add(this.tmp.set(0, 0.12, -0.06));
          else out.copy(b.at).add(this.tmp.set(0, 0.25, 0));
          return;
        }
        break;
      }
      case 'panOn':
        out.copy(tamago.panHeld ? tamago.burnerAt : tamago.gripAt).add(this.tmp.set(0, 0.2, 0));
        return;
      case 'turnEgg':
        out.copy(tamago.gripAt).add(this.tmp.set(0, 0.18, 0));
        return;
      case 'grindTamago':
        out.copy(tamago.pestleHeld ? tamago.bowlAt : tamago.pestleAt).add(this.tmp.set(0, 0.18, 0));
        return;
      case 'cupboardPot':
        out.copy(cupboard.rightHandleAt).add(this.tmp.set(0, 0.12, 0));
        break;
      case 'potFromCupboard': {
        const b = range.burners.find((x) => x.id === prep.takeId);
        if (b) out.copy(range.potHeld ? b.at : b.potAt).add(this.tmp.set(0, 0.15, 0));
        break;
      }
      case 'cupboardTamago':
        out.copy(cupboard.leftHandleAt).add(this.tmp.set(0, 0.12, 0));
        break;
      case 'suribachiOut':
        out.copy(tamago.bowlHeld ? tamago.tableAt : tamago.rimAt).add(this.tmp.set(0, 0.18, 0));
        break;
      case 'whiskTamago':
        out.copy(tamago.sticksHeld ? tamago.bowlAt : tamago.sticksAt).add(this.tmp.set(0, 0.18, 0));
        break;
      case 'takeNakago':
      case 'binPack':
        if (nakago.held === null) {
          out.copy(nakago.at).add(this.tmp.set(0, 0.15, 0));
          return;
        }
        break;
      case 'dryNakago':
        out.copy(nakago.clothHeld === null ? nakago.clothAt : nakago.at).add(this.tmp.set(0, 0.14, 0));
        return;
      case 'rackNakago':
        out.copy(nakago.rackAt).add(this.tmp.set(0, 0.2, 0));
        return;
      case 'eggsTamago':
        out.copy(tamago.packAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'pourTamago':
        out.copy(tamago.bowlHeld ? tamago.panAt : tamago.rimAt).add(this.tmp.set(0, 0.2, 0));
        return;
      case 'eggOut':
        out.copy(tamago.eggHeld ? tamago.caseAt : tamago.eggAt).add(this.tmp.set(0, 0.2, 0));
        return;
      case 'oilPan':
        out.copy(tamago.oilHeld ? tamago.panAt : tamago.oilAt).add(this.tmp.set(0, 0.18, 0));
        return;
      case 'lidTamago':
        out.copy(tamago.lidHeld ? tamago.panAt : tamago.lidAt).add(this.tmp.set(0, 0.18, 0));
        return;
      case 'pressLid':
        out.copy(tamago.lidAt).add(this.tmp.set(0, 0.18, 0));
        return;
      case 'turnOutTamago':
        out.copy(tamago.gripAt).add(this.tmp.set(0, 0.18, 0));
        return;
      case 'wipePan':
        if (chef.hands.some((h) => h.holding === Held.Paper)) {
          out.copy(tamago.panAt).add(this.tmp.set(0, 0.18, 0));
          return;
        }
        break;
      case 'hangNet': {
        const free = range.netHeld ? range.burners.find((x) => x.state === 'out' && !x.net) : undefined;
        out.copy(free ? free.at : range.netAt).add(this.tmp.set(0, 0.22, 0));
        return;
      }
      case 'skewer':
      case 'unskewer':
        out.copy(range.ringsAt).add(this.tmp.set(0, 0.18, 0));
        return;
      case 'searTurn':
        out.copy(range.bellyAt).add(this.tmp.set(0, 0.22, 0));
        return;
      case 'chillBelly':
      case 'bellyBoard':
      case 'bellyNet': {
        const kind = step === 'chillBelly' ? StationKind.IceBox : step === 'bellyBoard' ? StationKind.CuttingBoard : null;
        const to = kind ? stations.get(kind)?.pos : range.netAt;
        out.copy(range.bellyHeld && to ? to : range.bellyAt).add(this.tmp.set(0, 0.22, 0));
        return;
      }
      case 'toCase':
        if ((range.ingHeld || range.bellyHeld) && this.netaAt(range.caseNeta, out)) {
          out.y += 0.15;
          return;
        }
        out.copy(range.bellyAt).add(this.tmp.set(0, 0.22, 0));
        return;
      case 'liftBoard':
        out.copy(prep.boardAt).add(this.tmp.set(0, 0.2, 0));
        return;
      case 'hangNoren':
        out.copy(prep.norenAt).add(this.tmp.set(0, 0.5, 0));
        return;
      case 'check':
        out.copy(service.customerAt).add(this.tmp.set(0, 0.42, 0));
        return;
      case 'makeTea':
        out.copy(tea.urnAt).add(this.tmp.set(0, 0.2, 0));
        return;
      case 'serveTea':
        out.copy(tea.cup === 'held' ? tea.serveAt : tea.cupAt).add(this.tmp.set(0, 0.2, 0));
        return;
      case 'placeFilling':
        if (this.netaAt(this.nextFilling(), out)) {
          out.y += 0.15;
          return;
        }
        break;
      case 'takeNeta':
        out.copy(progress.sliceAt).add(this.tmp.set(0, 0.15, 0));
        return;
      case 'rice': {
        const tezu = stations.get(StationKind.Tezu);
        if (tezu) {
          out.copy(tezu.pos).add(this.tmp.set(sideX(-0.05), 0.2, 0.08));
          return;
        }
        break;
      }
    }
    const kind = this.stepStation(step);
    const info = kind ? stations.get(kind) : undefined;
    if (info) {
      out.copy(info.pos);
      out.y += kind === StationKind.Geta ? 0.22 : WORD_LIFT;
      return;
    }
    this.inFrontOfChef(out, 0.55, -0.12);
  }

  /** A point ahead of the chef along the rig's facing (not the head's). */
  private inFrontOfChef(out: Vector3, distance: number, drop: number): void {
    this.player.head.getWorldPosition(out);
    this.player.getWorldQuaternion(this.q);
    this.tmp.set(0, 0, -distance).applyQuaternion(this.q);
    out.add(this.tmp);
    out.y += drop;
  }

  /** Where a neta is in the case. */
  private netaAt(neta: string | null, out: Vector3): boolean {
    if (!neta) return false;
    for (const entity of this.queries.items.entities) {
      if (entity.getValue(CaseItem, 'neta') === neta && entity.object3D) {
        entity.object3D.getWorldPosition(out);
        return true;
      }
    }
    return false;
  }

  /** Where the ordered neta is in the case. */
  private orderedSakuAt(out: Vector3): boolean {
    const neta = orderNeta();
    for (const entity of this.queries.items.entities) {
      if (entity.getValue(CaseItem, 'neta') === neta && entity.object3D) {
        entity.object3D.getWorldPosition(out);
        return true;
      }
    }
    return false;
  }

  // ---- words ---------------------------------------------------------------

  private wordSprite(text: string): Sprite {
    let sprite = this.words.get(text);
    if (!sprite) {
      sprite = makeTextSprite(text, { color: '#FFF6E0', background: 'rgba(25,22,20,0.78)', width: 0.24 });
      sprite.name = `MasterWord_${text}`;
      sprite.visible = false;
      this.world.createTransformEntity(sprite);
      this.words.set(text, sprite);
    }
    return sprite;
  }

  /**
   * Show a word. followsStep: placed by the current step each frame;
   * otherwise it stays at `wordAt`, which the caller sets first.
   */
  private say(text: string, followsStep: boolean): void {
    if (this.shownWord) this.shownWord.visible = false;
    this.shownWord = this.wordSprite(text);
    this.shownWord.visible = true;
    this.wordFollowsStep = followsStep;
    this.wordTime = MASTER_WORD_SECONDS;
    this.lastSaid = text;
    playClack();
    console.log(`[Master] "${text}"`);
  }

  private anchorAtStation(kind: Kind | null): void {
    const info = kind ? stations.get(kind) : undefined;
    if (info) this.wordAt.copy(info.pos).add(this.tmp.set(0, WORD_LIFT + 0.05, 0));
    else this.inFrontOfChef(this.wordAt, 0.55, -0.1);
  }

  private hideWord(): void {
    if (this.shownWord) this.shownWord.visible = false;
    this.shownWord = null;
    this.wordTime = 0;
    this.arrow.visible = false;
  }

  private updateWord(delta: number): void {
    if (!this.shownWord) return;
    // The word stays up for as long as the demo runs.
    if (!(this.demo && this.wordFollowsStep)) this.wordTime -= delta;
    if (this.wordTime <= 0) {
      this.hideWord();
      return;
    }
    if (this.wordFollowsStep && this.step) this.stepWordAt(this.step, this.wordAt);
    this.shownWord.position.copy(this.wordAt);
    const fade = Math.min(1, this.wordTime / 0.4);
    this.shownWord.material.opacity = fade;

    const turning = this.wordFollowsStep && this.step !== null && TURN_STEPS.has(this.step);
    this.arrow.visible = turning;
    if (turning) {
      // The arrow sits left of the word and slides further left.
      this.player.getWorldQuaternion(this.q);
      const slide = 0.16 + 0.04 * ((performance.now() / 700) % 1);
      this.tmp.set(-slide, 0, 0).applyQuaternion(this.q);
      this.arrow.position.copy(this.wordAt).add(this.tmp);
    }
  }

  // ---- ghost hands -----------------------------------------------------------

  private updateDemo(delta: number): void {
    const [gL, gR] = this.ghosts;
    const step = this.step;
    if (!this.demo || !step) {
      gL.hide();
      gR.hide();
      return;
    }
    // While the player is already trying at the right place, get out of the way.
    const kind = this.stepStation(step);
    if (kind && kind !== StationKind.RiceTub) {
      for (const hand of hands.all) {
        if (hand.tracked && (overStation(hand.palm, kind) || overStation(hand.grasp, kind))) {
          gL.hide();
          gR.hide();
          return;
        }
      }
    }
    this.demoTime += delta;
    const rice = this.ghosts[chef.riceSide];
    const neta = this.ghosts[chef.netaSide];
    const other = rice === gR ? gL : gR;
    other.hide();
    if (!this.playDemo(step, rice, neta)) {
      gL.hide();
      gR.hide();
    }
  }

  // Small path helpers; all write into scratch vectors, nothing is allocated.

  private stationPos(kind: Kind): Vector3 | null {
    return stations.get(kind)?.pos ?? null;
  }

  private phase(period: number): number {
    return (this.demoTime % period) / period;
  }

  /** from -> to, eased, into `tmp`. */
  private go(k: number, from: Vector3, to: Vector3): Vector3 {
    return this.tmp.lerpVectors(from, to, smooth(k));
  }

  /** from -> to over the first half, back over the second. */
  private there(k: number, from: Vector3, to: Vector3): Vector3 {
    return k < 0.5 ? this.go(k * 2, from, to) : this.go((k - 0.5) * 2, to, from);
  }

  /** Where the neta hand holds the slice, in front of the chef. */
  private netaHold(out: Vector3): Vector3 {
    const board = this.stationPos(StationKind.CuttingBoard);
    if (board) out.copy(board).add(this.off.set(sideX(-0.1), 0.19, 0.07));
    else out.set(sideX(-0.1), 0.96, -0.2);
    return out;
  }

  /** 1 on each beat of the running metronome, 0 between. */
  private beatCurl(): number {
    const origin = progress.beatOrigin;
    const k = origin > 0 ? ((performance.now() - origin) % TEMPO_MS) / TEMPO_MS : this.phase(1);
    return k < 0.14 || k > 0.9 ? 1 : 0;
  }

  /** Loops the motion for one step. Returns false when there is nothing to show. */
  private playDemo(step: StepKey, rice: GhostHand, neta: GhostHand): boolean {
    const back = chef.facingBack;
    const yaw = back ? Math.PI : 0;
    const side = back ? -1 : 1; // the chef's right, in world x
    // The rice (knife) hand's side across: the right, a left-handed chef's left (src/handedness.ts).
    const hs = sideSign();
    const { a, b, c, off } = this;

    switch (step) {
      case 'soap': {
        const soap = this.stationPos(StationKind.Soap);
        if (!soap) return false;
        const k = this.phase(1.6);
        a.copy(soap).add(off.set(0, 0.14, 0));
        b.copy(soap).add(off.set(0, 0.02, 0));
        rice.pose(this.there(k, a, b), yaw, 0, k > 0.35 && k < 0.65 ? 1 : 0);
        return true;
      }
      case 'wetStone': {
        // The free hand takes the stone to the basin and lets it go there.
        const stone = this.stationPos(StationKind.Whetstone);
        const sink = this.stationPos(StationKind.Sink);
        if (!stone || !sink) return false;
        const k = this.phase(2);
        if (k < 0.3) neta.pose(a.copy(stone).add(off.set(0, 0.1 - k * 0.2, 0)), yaw, 0, k > 0.2 ? 1 : 0);
        else neta.pose(this.there((k - 0.3) / 0.7, a.copy(stone).add(off.set(0, 0.04, 0)), b.copy(sink).add(off.set(0, 0.02, 0))), yaw, 0, k < 0.9 ? 1 : 0);
        return true;
      }
      case 'sharpen': {
        // The knife hand draws the blade back and forth along the stone (the blade runs ahead of the palm); the other hand presses it down.
        const stone = this.stationPos(StationKind.Whetstone);
        if (!stone) return false;
        const s = Math.sin(this.phase(1.4) * Math.PI * 2) * 0.07;
        rice.pose(a.copy(stone).add(off.set(0, 0.06, -0.14 + s)), yaw, 1, 0);
        neta.pose(b.copy(stone).add(off.set(-0.04 * hs, 0.05, s * 0.5 - 0.02)), yaw, 0.2, 0);
        return true;
      }
      case 'rinseKnife': {
        // The blade into the basin for a moment.
        const sink = this.stationPos(StationKind.Sink);
        if (!sink) return false;
        rice.pose(a.copy(sink).add(off.set(0, 0.08, -0.1)), yaw, 1, 0);
        return true;
      }
      case 'washHands': {
        const sink = this.stationPos(StationKind.Sink);
        if (!sink) return false;
        const s = Math.sin(this.phase(1.2) * Math.PI * 2) * 0.05;
        // At the rim, just into the basin, where the hands wash.
        rice.pose(a.copy(sink).add(off.set(0.06 * side * hs, 0.01, s)), yaw, 0, 0);
        neta.pose(b.copy(sink).add(off.set(-0.06 * side * hs, 0.01, -s)), yaw, 0, 0);
        return true;
      }
      case 'towel': {
        // Both hands on the front of the hanging towel, gripping and letting go.
        const towel = this.stationPos(StationKind.Towel);
        if (!towel) return false;
        const curl = 0.5 + 0.5 * Math.sin(this.phase(1.2) * Math.PI * 2);
        const toward = back ? -0.035 : 0.035; // from the towel toward the chef
        rice.pose(a.copy(towel).add(off.set(0.06 * side * hs, 0.11, toward)), yaw, curl, 0);
        neta.pose(b.copy(towel).add(off.set(-0.06 * side * hs, 0.11, toward)), yaw, curl, 0);
        return true;
      }
      case 'rinseCloth': {
        const sink = this.stationPos(StationKind.Sink);
        if (!sink) return false;
        const s = Math.sin(this.phase(1.2) * Math.PI * 2) * 0.06;
        rice.pose(a.copy(sink).add(off.set(0, 0, s)), yaw, 0, 1);
        return true;
      }
      case 'takeCloth': {
        const cloth = this.stationPos(StationKind.WetCloth);
        if (!cloth) return false;
        const k = this.phase(1.6);
        a.copy(cloth).add(off.set(0, 0.13, 0));
        b.copy(cloth).add(off.set(0, 0.02, 0));
        rice.pose(this.there(k, a, b), yaw, 0, k > 0.4 ? 1 : 0);
        return true;
      }
      case 'wipeBoard': {
        const cloth = this.stationPos(StationKind.WetCloth);
        const board = this.stationPos(StationKind.CuttingBoard);
        if (!cloth || !board) return false;
        const k = this.phase(3);
        if (k < 0.25) {
          a.copy(cloth).add(off.set(0, 0.12, 0));
          b.copy(cloth).add(off.set(0, 0.02, 0));
          rice.pose(this.go(k * 4, a, b), yaw, 0, k > 0.18 ? 1 : 0);
        } else {
          const w = (k - 0.25) * Math.PI * 4;
          rice.pose(a.copy(board).add(off.set(0.25 * Math.sin(w), 0.03, 0.04 * Math.cos(w))), yaw, 0, 1);
        }
        return true;
      }
      case 'takeSaku':
      case 'returnSaku': {
        const board = this.stationPos(StationKind.CuttingBoard);
        if (!board) return false;
        // From the case to the board; returning runs from the board to the case.
        if (step === 'takeSaku') {
          if (!this.orderedSakuAt(a)) return false;
          b.copy(board).add(off.set(-0.12 * hs, 0, 0));
        } else {
          a.copy(progress.sakuAt);
          b.copy(progress.sakuHome);
        }
        a.y += 0.05;
        b.y += 0.05;
        const k = this.phase(2.4);
        if (k < 0.3) {
          c.copy(a).add(off.set(0, 0.08, 0));
          neta.pose(this.go(k / 0.3, c, a), yaw, 0, k > 0.22 ? 1 : 0);
        } else if (k < 0.8) {
          c.copy(a).lerp(b, 0.5);
          c.y += 0.1;
          const kk = (k - 0.3) / 0.5;
          neta.pose(kk < 0.5 ? this.go(kk * 2, a, c) : this.go((kk - 0.5) * 2, c, b), yaw, 0, 1);
        } else {
          neta.pose(b, yaw, 0, 0);
        }
        return true;
      }
      case 'holdKnife':
      case 'putKnife': {
        const knife = this.stationPos(StationKind.Knife);
        if (!knife) return false;
        const k = this.phase(1.6);
        // The handle, out of the knife box toward the chef.
        a.copy(knife).add(off.set(0, 0.16, 0.12));
        b.copy(knife).add(off.set(0, 0.06, 0.12));
        const closed = k > 0.45;
        rice.pose(this.there(k, a, b), yaw, (step === 'holdKnife') === closed ? 1 : 0, 0);
        return true;
      }
      case 'cut': {
        const saku = progress.sakuAt;
        neta.pose(a.copy(saku).add(off.set(0, 0.06, 0)), yaw, 0.1, 0);
        // The blade reaches 15 cm ahead of the fist: draw the fist back along the guide.
        b.copy(saku).add(off.set(0.075 * hs, 0.06, 0.09));
        c.copy(saku).add(off.set(0.075 * hs, 0.06, 0.22));
        rice.pose(this.go(this.phase(2) * 1.4, b, c), yaw, 1, 0);
        return true;
      }
      case 'wipeKnife': {
        const cloth = this.stationPos(StationKind.WetCloth);
        if (!cloth) return false;
        const s = Math.sin(this.phase(1) * Math.PI * 2) * 0.04;
        rice.pose(a.copy(cloth).add(off.set(0, 0.06, 0.12 + s)), yaw, 1, 0);
        return true;
      }
      case 'takeNeta': {
        const k = this.phase(1.8);
        a.copy(progress.sliceAt).add(off.set(0, 0.1, 0));
        b.copy(progress.sliceAt).add(off.set(0, 0.02, 0));
        if (k < 0.45) neta.pose(this.go(k / 0.45, a, b), yaw, 0, k > 0.35 ? 1 : 0);
        else neta.pose(this.go((k - 0.45) / 0.55, b, this.netaHold(c)), yaw, 0, k < 0.85 ? 1 : 0);
        return true;
      }
      case 'tezu': {
        const tezu = this.stationPos(StationKind.Tezu);
        if (!tezu) return false;
        a.copy(tezu).add(off.set(0, 0.13, 0.02));
        b.copy(tezu).add(off.set(0, 0, 0.02));
        rice.pose(this.there(this.phase(1.6), a, b), yaw, 0, 0);
        return true;
      }
      case 'rice': {
        const tub = this.stationPos(StationKind.RiceTub);
        if (!tub) return false;
        const k = this.phase(1.8);
        a.set(0.3 * hs, 0.92, -0.2);
        rice.pose(this.there(k, a, b.copy(tub)), yaw, k > 0.4 && k < 0.6 ? 0.6 : 0.1, 0);
        return true;
      }
      case 'wasabi': {
        const dish = this.stationPos(StationKind.Wasabi);
        if (!dish) return false;
        // The index tip sits about 11 cm ahead of the palm center.
        a.copy(dish).add(off.set(0.027 * hs, 0.03, 0.11));
        b.copy(progress.pieceAt).add(off.set(0.027 * hs, 0.03, 0.11));
        rice.pose(this.there(this.phase(2), a, b), yaw, 1, 0, true);
        neta.pose(this.netaHold(c), yaw, 0, 0);
        return true;
      }
      case 'takeNori': {
        const box = this.stationPos(StationKind.NoriBox);
        if (!box) return false;
        const k = this.phase(1.8);
        a.copy(box).add(off.set(0, 0.1, 0));
        b.copy(box).add(off.set(0, 0.02, 0));
        // Pinched, it goes over to the shari on the board.
        c.copy(progress.pieceAt).add(off.set(0, 0.06, 0));
        if (k < 0.45) neta.pose(this.go(k / 0.45, a, b), yaw, 0, k > 0.35 ? 1 : 0);
        else neta.pose(this.go((k - 0.45) / 0.55, b, c), yaw, 0, 1);
        return true;
      }
      case 'shapeShari': {
        // One squeeze of the rice in the hand.
        a.set(0.3 * hs, 0.92, -0.2);
        const k = this.phase(1.2);
        rice.pose(a, yaw, k > 0.35 && k < 0.75 ? 1 : 0.1, 0);
        return true;
      }
      case 'setShari': {
        // The shaped rice down onto the board, on the rice hand's side.
        const board = this.stationPos(StationKind.CuttingBoard);
        if (!board) return false;
        a.set(0.3 * hs, 0.92, -0.2);
        b.copy(board).add(off.set(0.12 * hs, 0.03, 0.06));
        rice.pose(this.there(this.phase(1.8), a, b), yaw, 0.1, 0);
        return true;
      }
      case 'pinNori': {
        // The strip's end down to the shari's near end (下部; the shari lies
        // lengthwise), then the rice hand's index finger on it (the tip ~11 cm
        // ahead of the palm).
        const k = this.phase(2);
        a.copy(progress.pieceAt).add(off.set(-0.03 * hs, 0.08, 0.05));
        b.copy(progress.pieceAt).add(off.set(-0.03 * hs, 0.02, 0.05));
        neta.pose(this.go(Math.min(1, k / 0.35), a, b), yaw, 0, 1);
        a.set(0.3 * hs, 0.92, -0.2);
        c.copy(progress.pieceAt).add(off.set(0.027 * hs, 0.03, 0.025 + 0.11));
        rice.pose(this.go(Math.max(0, Math.min(1, (k - 0.35) / 0.35)), a, c), yaw, 1, 0, true);
        return true;
      }
      case 'wrapNori': {
        // The finger holds the end while the strip goes once round, the far
        // tip (頂点) and on over its start, then the last end a small pull
        // out ("ピン"), let go.
        const k = this.phase(2.4);
        const start = Math.atan2(-0.03 * hs, 0.05);
        const turn = start + Math.min(1, k / 0.7) * Math.PI * 2 * 1.42;
        const r = 0.045 + (k > 0.72 ? Math.min(1, (k - 0.72) / 0.08) * 0.02 : 0);
        a.copy(progress.pieceAt).add(off.set(Math.sin(turn) * r, 0.02, Math.cos(turn) * r));
        neta.pose(a, yaw, 0, k < 0.86 ? 1 : 0);
        c.copy(progress.pieceAt).add(off.set(0.027 * hs, 0.03 + (k > 0.4 ? 0.05 : 0), 0.025 + 0.11));
        rice.pose(c, yaw, 1, 0, true);
        return true;
      }
      case 'spoonTopping': {
        // The rice hand: pinch the spoon in the tray, carry it over the gunkan, let go.
        if (!this.orderedSakuAt(a)) return false;
        a.y += 0.04;
        b.copy(progress.pieceAt).add(off.set(0, 0.05, 0));
        const k = this.phase(2.4);
        if (k < 0.3) {
          c.copy(a).add(off.set(0, 0.08, 0));
          rice.pose(this.go(k / 0.3, c, a), yaw, 0, k > 0.22 ? 1 : 0);
        } else if (k < 0.8) {
          c.copy(a).lerp(b, 0.5);
          c.y += 0.1;
          const kk = (k - 0.3) / 0.5;
          rice.pose(kk < 0.5 ? this.go(kk * 2, a, c) : this.go((kk - 0.5) * 2, c, b), yaw, 0, 1);
        } else {
          rice.pose(b, yaw, 0, 0);
        }
        neta.pose(this.netaHold(c), yaw, 0, 0);
        return true;
      }
      case 'takeAge': {
        // The neta hand: into the case for a pouch, back to where it holds the piece.
        if (!this.orderedSakuAt(a)) return false;
        a.y += 0.03;
        b.copy(a).add(off.set(0, 0.08, 0.04));
        const k = this.phase(2);
        if (k < 0.45) neta.pose(this.go(k / 0.45, b, a), yaw, 0, k > 0.35 ? 1 : 0);
        else neta.pose(this.go((k - 0.45) / 0.55, a, this.netaHold(c)), yaw, 0, k < 0.85 ? 1 : 0);
        return true;
      }
      case 'closeAge':
        // The hand holding the pouch closes into a fist on the beat.
        neta.pose(this.netaHold(a), yaw, this.beatCurl(), 0);
        return true;
      case 'layNori': {
        // The neta hand: a half sheet from the nori box onto the mat.
        const box = this.stationPos(StationKind.NoriBox);
        const mat = this.stationPos(StationKind.Makisu);
        if (!box || !mat) return false;
        a.copy(box).add(off.set(0, 0.03, 0));
        b.copy(mat).add(off.set(0, 0.05, 0));
        const k = this.phase(2.2);
        if (k < 0.3) neta.pose(this.go(k / 0.3, c.copy(a).add(off.set(0, 0.08, 0.03)), a), yaw, 0, k > 0.22 ? 1 : 0);
        else if (k < 0.8) neta.pose(this.go((k - 0.3) / 0.5, a, b), yaw, 0, 1);
        else neta.pose(b, yaw, 0, 0);
        return true;
      }
      case 'spreadRice': {
        // The rice hand, open and flat, sweeping side to side over the nori.
        const mat = this.stationPos(StationKind.Makisu);
        if (!mat) return false;
        const s = Math.sin(this.phase(1.2) * Math.PI * 2) * 0.07;
        rice.pose(a.copy(mat).add(off.set(s, 0.035, 0.02)), yaw, 0, 0);
        return true;
      }
      case 'placeFilling': {
        // The rice hand: the filling from the case, laid along the middle of the rice.
        if (!this.netaAt(this.nextFilling(), a)) return false;
        a.y += 0.03;
        b.copy(progress.pieceAt).add(off.set(0, 0.05, 0));
        const k = this.phase(2.4);
        if (k < 0.3) rice.pose(this.go(k / 0.3, c.copy(a).add(off.set(0, 0.08, 0.03)), a), yaw, 0, k > 0.22 ? 1 : 0);
        else if (k < 0.8) rice.pose(this.go((k - 0.3) / 0.5, a, b), yaw, 0, 1);
        else rice.pose(b, yaw, 0, 0);
        return true;
      }
      case 'rollMaki': {
        // Both hands at the near edge of the mat push it away.
        const mat = this.stationPos(StationKind.Makisu);
        if (!mat) return false;
        const k = smooth(this.phase(1.6));
        const z = 0.08 - k * 0.12;
        neta.pose(a.copy(mat).add(off.set(-0.06 * hs, 0.04, z)), yaw, 0.2 + 0.4 * k, 0);
        rice.pose(b.copy(mat).add(off.set(0.06 * hs, 0.04, z)), yaw, 0.2 + 0.4 * k, 0);
        return true;
      }
      case 'squeezeRoll': {
        const at = progress.pieceAt;
        neta.pose(a.copy(at).add(off.set(-0.05 * hs, 0.04, 0.02)), yaw, this.beatCurl(), 0);
        rice.pose(b.copy(at).add(off.set(0.05 * hs, 0.04, 0.02)), yaw, this.beatCurl(), 0);
        return true;
      }
      case 'takeMaterial':
      case 'stockSaku': {
        const board = this.stationPos(StationKind.CuttingBoard);
        if (!board) return false;
        if (step === 'takeMaterial') {
          a.copy(prep.boxAt);
          b.copy(prep.slotAt).add(off.set(0, 0.03, 0));
        } else {
          a.copy(prep.productAt);
          b.copy(prep.slotAt).add(off.set(0, 0.04, 0));
        }
        a.y += 0.02;
        const k = this.phase(2.4);
        if (k < 0.3) {
          c.copy(a).add(off.set(0, 0.08, 0));
          neta.pose(this.go(k / 0.3, c, a), yaw, 0, k > 0.22 ? 1 : 0);
        } else if (k < 0.8) {
          c.copy(a).lerp(b, 0.5);
          c.y += 0.1;
          const kk = (k - 0.3) / 0.5;
          neta.pose(kk < 0.5 ? this.go(kk * 2, a, c) : this.go((kk - 0.5) * 2, c, b), yaw, 0, 1);
        } else {
          neta.pose(b, yaw, 0, 0);
        }
        return true;
      }
      case 'cutPrep': {
        const g = prep.guideAt;
        // Toward the chef: +Z at the manaita, -Z at the sink.
        const dz = prep.where === 'sink' ? -1 : 1;
        neta.pose(a.copy(prep.materialAt).add(off.set(-0.06 * dz * hs, 0.04, 0)), yaw, 0.1, 0);
        // The blade reaches 15 cm ahead of the fist: draw the fist back along the line.
        b.copy(g).add(off.set(0, 0.05, 0.09 * dz));
        c.copy(g).add(off.set(0, 0.05, 0.22 * dz));
        rice.pose(this.go(this.phase(2) * 1.4, b, c), yaw, 1, 0);
        return true;
      }
      case 'pullPrep': {
        // The neta hand holds the body; the rice hand pinches the legs and draws them out toward the chef.
        neta.pose(a.copy(prep.pullNeta), yaw, 0, 1);
        const k = this.phase(2);
        b.copy(prep.pullRice);
        c.copy(prep.pullRice).add(off.set(0.03 * hs, 0.03, 0.12));
        rice.pose(k < 0.25 ? b : this.go(Math.min(1, (k - 0.25) / 0.5), b, c), yaw, 0, k > 0.15 && k < 0.8 ? 1 : 0);
        return true;
      }
      case 'cutRoll': {
        const g = progress.guideAt;
        neta.pose(a.copy(progress.pieceAt).add(off.set(-0.06 * hs, 0.05, 0)), yaw, 0.1, 0);
        // The blade reaches 15 cm ahead of the fist: draw the fist back across the guide.
        b.copy(g).add(off.set(0, 0.05, 0.09));
        c.copy(g).add(off.set(0, 0.05, 0.22));
        rice.pose(this.go(this.phase(2) * 1.4, b, c), yaw, 1, 0);
        return true;
      }
      case 'stuffAge':
      case 'join': {
        this.netaHold(a);
        neta.pose(a, yaw, 0, 0);
        b.copy(a).add(off.set(0.25 * hs, 0.06, 0));
        c.copy(a).add(off.set(0.07 * hs, 0.03, 0));
        rice.pose(this.there(this.phase(1.6), b, c), yaw, 0, 0);
        return true;
      }
      case 'touch1': {
        this.netaHold(a);
        neta.pose(a, yaw, 0.2, 0);
        rice.pose(b.copy(a).add(off.set(0.05 * hs, 0.05, 0)), yaw, this.beatCurl(), 0);
        return true;
      }
      case 'flip': {
        const k = this.phase(1.4);
        this.netaHold(a);
        b.copy(a).add(off.set(0, 0, -0.06));
        neta.pose(this.go(k, a, b), yaw, smooth(k) * 0.5, 0);
        return true;
      }
      case 'touch2':
      case 'touch3':
        rice.pose(a.copy(progress.pieceAt).add(off.set(0.03 * hs, 0.04, 0.03)), yaw, 0, this.beatCurl());
        return true;
      case 'rotate': {
        const turn = (Math.PI / 2) * smooth(this.phase(1.6) * 1.3);
        rice.pose(a.copy(progress.pieceAt).add(off.set(0.02 * hs, 0.04, 0.02)), yaw - turn * hs, 0, 1);
        return true;
      }
      case 'place': {
        const geta = this.stationPos(StationKind.Geta);
        if (!geta) return false;
        const k = this.phase(2.6);
        a.copy(progress.pieceAt).add(off.set(0, 0.03, 0));
        b.copy(geta).add(off.set(0, 0.06, 0));
        c.copy(a).lerp(b, 0.5);
        c.y = Math.max(a.y, b.y) + 0.18;
        const placedYaw = service.customerHandKnown
          ? yaw + (service.customerLeftHanded ? -1 : 1) * (Math.PI / 4)
          : yaw + Math.PI / 2;
        if (k < 0.45) rice.pose(this.go(k / 0.45, a, c), yaw, 0, 1);
        else if (k < 0.85) rice.pose(this.go((k - 0.45) / 0.4, c, b), placedYaw, 0, 1);
        else rice.pose(b, placedYaw, 0, 0);
        return true;
      }
      case 'serve': {
        const geta = this.stationPos(StationKind.Geta);
        if (!geta) return false;
        rice.pose(a.copy(geta).add(off.set(0, 0.07, 0.05)), yaw, this.phase(1.4) > 0.2 ? 1 : 0, 0);
        return true;
      }
      default:
        return false;
    }
  }

  // ---- the master's own body ---------------------------------------------------

  private startGesture(kind: 'nod' | 'shake'): void {
    this.gesture = kind;
    this.gestureTime = GESTURE_SECONDS;
  }

  private updateFigure(delta: number): void {
    // Face the place the step happens (or the board).
    const kind = this.step ? this.stepStation(this.step) : null;
    const info = kind ? stations.get(kind) : stations.get(StationKind.CuttingBoard);
    if (this.step && PIECE_STEPS.has(this.step)) this.target.copy(progress.pieceAt);
    else if (info) this.target.copy(info.pos);
    else this.target.set(0, 0.8, -0.3);
    const dx = this.target.x - this.figure.position.x;
    const dz = this.target.z - this.figure.position.z;
    const want = Math.atan2(-dx, -dz);
    let diff = want - this.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facing += diff * Math.min(1, delta * FACE_TURN_RATE);
    this.figure.rotation.y = this.facing;

    // Point with the near hand while speaking or demonstrating.
    const pointing = this.shownWord !== null || this.demo;
    const hand = this.handR;
    this.a.copy(pointing ? this.handPoint : this.handRestR);
    hand.position.lerp(this.a, Math.min(1, delta * 6));
    this.updateRightArm();

    // Nod or shake.
    this.head.rotation.set(0, 0, 0);
    if (this.gestureTime > 0) {
      this.gestureTime -= delta;
      const k = 1 - this.gestureTime / GESTURE_SECONDS;
      const wave = Math.sin(k * Math.PI * 4) * (1 - k);
      if (this.gesture === 'nod') this.head.rotation.x = wave * 0.35;
      else this.head.rotation.y = wave * 0.45;
    }
  }

  /** The right sleeve runs from the shoulder to the wrist; the hand lines up with it. */
  private updateRightArm(): void {
    this.sleeveR.scale.y = this.armPose(this.shoulderR, this.handR.position, this.sleeveR.position, this.sleeveR.quaternion);
    this.handR.quaternion.copy(this.sleeveR.quaternion);
  }

  /**
   * Pose a unit-height sleeve from `shoulder` toward `hand` (both figure-local),
   * ending at the wrist. Writes the sleeve centre and rotation; returns its length.
   */
  private armPose(shoulder: Vector3, hand: Vector3, outPos: Vector3, outQuat: Quaternion): number {
    const dir = this.armDir.subVectors(hand, shoulder);
    const reach = dir.length();
    dir.multiplyScalar(1 / Math.max(reach, 1e-4));
    outQuat.setFromUnitVectors(this.up, dir);
    const length = Math.max(0.05, reach - HAND_LENGTH / 2);
    outPos.copy(shoulder).addScaledVector(dir, length / 2);
    return length;
  }

  private sync(delta: number): void {
    this.syncTime += delta;
    if (this.syncTime < 0.2) return;
    this.syncTime = 0;
    const e = this.entity;
    e.setValue(Master, 'step', this.step ?? '');
    e.setValue(Master, 'idle', this.idle);
    e.setValue(Master, 'lastSaid', this.lastSaid);
    e.setValue(Master, 'demo', this.demo);
    let learned = 0;
    for (const n of this.successes.values()) if (n >= MASTER_LEARNED_COUNT) learned++;
    e.setValue(Master, 'learnedSteps', learned);
  }
}
