import {
  BoxGeometry,
  createSystem,
  type Entity,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Sprite,
  Vector3,
} from '@iwsdk/core';
import { COLOR_HINT, glowObject } from './feedback.js';
import { caseStock, chef, day, type Order, prep, service, type Side, staff, tea } from './game-state.js';
import { hands } from './hands.js';
import { ledger, yen } from './ledger.js';
import { GAZE_CONE_DEG, gazeOff, GazePinch } from './gaze.js';
import { heldOut, POINT_ACROSS_DEG, POINT_LATCH_SECONDS, pointOff } from './pointing.js';

/** Looking at the customer: the head and shoulders (eye tracking). */
const CHECK_LOOK_RADIUS = 0.18;
import { releasePiece } from './scene-assets/lib/nigiri-form.js';
import { playCoin } from './sfx.js';
import { MENU, type MenuId, NETA, pairRest } from './menu.js';
import type { Score } from './scoring.js';
import { stations } from './station-system.js';
import { Bar, Customer, CustomerState, Held, StationKind } from './sushi-components.js';
import { makeOrderCard, redrawOrderCard } from './order-card.js';
import { type IconKind, makeIconSprite, makeTextSprite, setSpriteText } from './text-sprites.js';
import { CUSTOMER_SEAT_Z, ENTRANCE_X, ENTRANCE_Z, STEP_HEIGHT } from './layout.js';
import {
  ENABLED_KINDS,
  LEFT_HANDED_CUSTOMER_RATIO,
  MAX_ORDERS_PER_CUSTOMER,
  ORDERS_PER_CUSTOMER,
  PRICE,
  RESULT_SECONDS,
  TEA_PATIENCE_SECONDS,
  TEA_REQUEST_RATIO,
  WALK_PACE,
} from './tuning.js';
import { TurnSystem } from './turn-system.js';

const REACH_SECONDS = 0.8;
const RETURN_SECONDS = 0.6;
const SAY_SECONDS = 2.5;
/** Where the customer sits: just beyond the customer counter, on the customer floor (one step below the chef's). */
const SEAT = new Vector3(0, -STEP_HEIGHT, CUSTOMER_SEAT_Z);
/** The way in from the shop's entrance: just inside the door, round behind the seat's left, to the seat. */
const DOOR = new Vector3(ENTRANCE_X + 0.25, -STEP_HEIGHT, ENTRANCE_Z + 0.35);
const TURN = new Vector3(SEAT.x - 0.45, -STEP_HEIGHT, SEAT.z - 0.4);
const FIRST_LEG = DOOR.distanceTo(TURN);
const WAY_LENGTH = FIRST_LEG + TURN.distanceTo(SEAT);
const NO_PENALTIES: readonly IconKind[] = [];
const HAND_REST_X = 0.17;
const ALL_ICONS: IconKind[] = ['rhythm', 'fish', 'wasabi', 'orientation', 'hand', 'fresh', 'hygiene', 'board', 'soap', 'knife'];

/**
 * How the nigiri system hands a served piece (its own entity) to the
 * customer: what it is, or null when it is not what was ordered.
 */
export const customerApi = {
  serve: (_score: Score, _piece: Entity, _item: MenuId | null): void => undefined,
};

/**
 * A menu item to order: weighted by how often it is ordered, among the kinds
 * on the menu now and only while everything it needs is in the case. With
 * the whole case sold out, anything on the menu.
 */
function pickOrder(): MenuId {
  const ids = (Object.keys(MENU) as MenuId[]).filter((id) => ENABLED_KINDS.includes(MENU[id].kind));
  const inStock = ids.filter((id) => MENU[id].neta.every((n) => caseStock[n] >= NETA[n].perPiece));
  const pool = inStock.length ? inStock : ids;
  let r = Math.random() * pool.reduce((sum, id) => sum + MENU[id].weight, 0);
  for (const id of pool) {
    r -= MENU[id].weight;
    if (r <= 0) return id;
  }
  return pool[pool.length - 1];
}

/**
 * One customer at a time, as an abstract figure (sphere head, box body, two
 * hand cubes) across the counter. They come in at the shop's entrance and
 * walk to the seat (shown in by the part-timer when called in). The order
 * shows above the head as a card: fish color plus a wasabi mark. When a
 * piece is served the customer reaches with the dominant hand (revealing
 * it), eats, and the result and the running bill appear above the head for
 * a few seconds. Each customer comes in with a few orders in mind: an
 * Excellent piece makes them order one more, a Poor one one fewer, a Bad one
 * and they want the bill. A piece that is not what they ordered is sent back,
 * not billed, and made again. Now and then they ask for tea (src/tea-system.ts);
 * left waiting too long, they order one fewer. When done they say "Check,
 * please": the chef points at them and pinches, they pay the bill and walk
 * out. Then the next customer comes, sometimes left-handed. Once the noren
 * is taken in, the seated customer's order is the last; when they have paid
 * and left, the day is over.
 */
export class CustomerSystem extends createSystem({}) {
  private entity!: Entity;
  private figure!: Group;
  private handL!: Mesh;
  private handR!: Mesh;
  private orderCard: Sprite | null = null;
  private cardItem = '';
  private cardWasabi = false;
  /** The one order object shared through service.order (no allocation per frame). */
  private readonly order: Order = { item: 'LeanTunaNigiri', wasabi: false };
  private gradeSprites = new Map<string, Sprite>();
  private moneySprite!: Sprite;
  /** The rest of a bonito pair, ordered next without counting as a new order. */
  private pairNext: MenuId | null = null;
  private icons = new Map<IconKind, Sprite>();
  private resultGroup!: Group;
  private resultTime = 0;
  /** 'closed' until the bar opens (the morning prep): nobody is seated. */
  private phase: 'closed' | 'door' | 'entering' | 'waiting' | 'reaching' | 'returning' | 'paying' | 'leaving' = 'waiting';
  private t = 0;
  private clock = 0;
  /** How far along the way in they are (0 at the door). */
  private walkS = WAY_LENGTH;
  /** What they have had, on the bill until they pay. */
  private readonly tab: MenuId[] = [];
  private bill = 0;
  /** This customer will ask for tea after the first piece; has asked; how long they have waited. */
  private teaPlanned = false;
  private teaAsked = false;
  private teaWait = 0;
  /** A word over the head: "Tea, please", "Check, please", a thank-you. */
  private words!: Sprite;
  private wordsText = '';
  private sayText = '';
  private sayColor = '#ffffff';
  private sayTime = 0;
  private head!: Mesh;
  private readonly lastPointed: [number, number] = [-10, -10];
  private glowing = false;
  private readonly gazePinch = new GazePinch<true>();
  private readonly eye = new Vector3();
  private piece: Entity | null = null;
  private readonly getaPos = new Vector3();
  private readonly handRest = new Vector3();
  private readonly tmp = new Vector3();

  init(): void {
    const skin = new MeshStandardMaterial({ color: '#E8C9A8', roughness: 0.8 });
    const cloth = new MeshStandardMaterial({ color: '#3D5A80', roughness: 0.9 });
    this.figure = new Group();
    this.figure.name = 'Customer';
    const head = new Mesh(new SphereGeometry(0.1, 16, 12), skin);
    head.name = 'Head';
    this.head = head;
    head.position.y = 1.2;
    const torso = new Mesh(new BoxGeometry(0.36, 0.4, 0.18), cloth);
    torso.name = 'Torso';
    torso.position.y = 0.95;
    this.handL = new Mesh(new BoxGeometry(0.06, 0.04, 0.08), skin);
    this.handL.name = 'HandLeft'; // the customer's left is the chef's right (+x)
    this.handL.position.set(HAND_REST_X, 0.77, 0.25);
    this.handR = new Mesh(new BoxGeometry(0.06, 0.04, 0.08), skin);
    this.handR.name = 'HandRight';
    this.handR.position.set(-HAND_REST_X, 0.77, 0.25);
    this.figure.add(head, torso, this.handL, this.handR);
    this.figure.position.copy(SEAT);
    this.resultGroup = new Group();
    this.resultGroup.name = 'Result';
    this.resultGroup.position.y = 1.62;
    this.resultGroup.visible = false;
    for (const grade of ['Excellent', 'Good', 'Poor', 'Bad']) {
      const sprite = makeTextSprite(grade, { color: grade === 'Bad' ? '#F2B134' : '#ffffff', width: 0.3 });
      sprite.visible = false;
      this.resultGroup.add(sprite);
      this.gradeSprites.set(grade, sprite);
    }
    this.moneySprite = makeTextSprite(' ', { width: 0.34 });
    this.moneySprite.name = 'Money';
    this.moneySprite.position.y = 0.075;
    this.resultGroup.add(this.moneySprite);
    for (const kind of ALL_ICONS) {
      const sprite = makeIconSprite(kind);
      sprite.visible = false;
      this.resultGroup.add(sprite);
      this.icons.set(kind, sprite);
    }
    this.figure.add(this.resultGroup);
    this.words = makeTextSprite(' ', { width: 0.3 });
    this.words.name = 'Words';
    this.words.visible = false;
    this.figure.add(this.words);

    this.entity = this.world.createTransformEntity(this.figure);
    this.entity.addComponent(Customer, {});
    if (prep.active && !chef.open) {
      this.phase = 'closed';
      this.figure.visible = false;
    } else {
      this.newCustomer(true);
    }
    customerApi.serve = (score, piece, item) => this.serve(score, piece, item);
  }

  private newCustomer(first: boolean): void {
    const e = this.entity;
    e.setValue(Customer, 'leftHanded', Math.random() < LEFT_HANDED_CUSTOMER_RATIO);
    e.setValue(Customer, 'handKnown', false);
    e.setValue(Customer, 'eaten', 0);
    e.setValue(Customer, 'orders', ORDERS_PER_CUSTOMER);
    e.setValue(Customer, 'ordersDone', 0);
    this.pairNext = null;
    e.setValue(Customer, 'lastGrade', '');
    e.setValue(Customer, 'state', CustomerState.Waiting);
    this.newOrder();
    service.customerHandKnown = false;
    service.eatenByCustomer = 0;
    service.check = false;
    this.tab.length = 0;
    this.bill = 0;
    this.teaPlanned = Math.random() < TEA_REQUEST_RATIO;
    this.teaAsked = false;
    this.teaWait = 0;
    tea.wanted = false;
    this.figure.visible = true;
    if (first) {
      this.phase = 'waiting';
      this.walkS = WAY_LENGTH;
    } else {
      // In at the entrance: they wait there to be shown in.
      this.phase = 'door';
      this.t = 0;
      this.walkS = 0;
    }
    this.placeOnWay(this.walkS, 0);
    console.log(`[Customer] new customer, ${e.getValue(Customer, 'leftHanded') ? 'left' : 'right'}-handed`);
  }

  private newOrder(): void {
    const item = pickOrder();
    this.entity.setValue(Customer, 'item', item);
    this.entity.setValue(Customer, 'wasabi', MENU[item].wasabi === 'ask' && Math.random() < 0.5);
    console.log(`[Customer] orders ${MENU[item].name}${this.entity.getValue(Customer, 'wasabi') ? ' with wasabi' : ''}`);
  }

  /** The component is the source of truth, so a test can edit the order. */
  private syncOrder(): void {
    const item = this.entity.getValue(Customer, 'item') as MenuId;
    const wasabi = !!this.entity.getValue(Customer, 'wasabi');
    service.customerLeftHanded = !!this.entity.getValue(Customer, 'leftHanded');
    service.customerHandKnown = !!this.entity.getValue(Customer, 'handKnown');
    service.eatenByCustomer = this.entity.getValue(Customer, 'eaten') ?? 0;
    this.order.item = item;
    this.order.wasabi = wasabi;
    service.order = this.phase === 'waiting' ? this.order : null;
    if (item !== this.cardItem || wasabi !== this.cardWasabi) {
      this.cardItem = item;
      this.cardWasabi = wasabi;
      if (this.orderCard) {
        redrawOrderCard(this.orderCard, item, wasabi);
      } else {
        this.orderCard = makeOrderCard(item, wasabi, 0.26);
        this.orderCard.position.y = 1.45;
        this.figure.add(this.orderCard);
      }
    }
    if (this.orderCard) this.orderCard.visible = this.phase === 'waiting';
  }

  private serve(score: Score, piece: Entity, item: MenuId | null): void {
    if (this.phase !== 'waiting') {
      releasePiece(piece.object3D);
      piece.dispose({ disposeResources: false });
      return;
    }
    const e = this.entity;
    const done = e.getValue(Customer, 'ordersDone') ?? 0;
    const orders = e.getValue(Customer, 'orders') ?? ORDERS_PER_CUSTOMER;
    if (!item) {
      // Not what was ordered: sent back unpaid, to be made again.
      releasePiece(piece.object3D);
      piece.object3D?.removeFromParent();
      piece.dispose({ disposeResources: false });
      e.setValue(Customer, 'orders', Math.max(done + 1, orders - 1));
      this.showResult(null, score.penalties, 'Not my order', '#F2B134');
      console.log(`[Customer] sent back: not ${MENU[this.order.item].name}`);
      return;
    }
    // On the bill, paid at the check.
    const price = PRICE[item];
    this.tab.push(item);
    this.bill += price;
    this.piece = piece;
    this.phase = 'reaching';
    this.t = 0;
    const geta = stations.get(StationKind.Geta);
    if (geta) this.getaPos.copy(geta.pos).add(this.tmp.set(0, 0.02, 0));
    this.figure.worldToLocal(this.getaPos);
    e.setValue(Customer, 'state', CustomerState.Reaching);
    // The other half of a bonito pair comes next, as the same order.
    this.pairNext = pairRest(this.order.item, item);
    // How the piece was made decides how many more they order.
    const counted = done + (this.pairNext ? 0 : 1);
    let next = orders;
    if (score.grade === 'Excellent') next = Math.min(MAX_ORDERS_PER_CUSTOMER, orders + 1);
    else if (score.grade === 'Poor') next = Math.max(counted, orders - 1);
    else if (score.grade === 'Bad') next = counted;
    e.setValue(Customer, 'orders', next);
    if (score.grade === 'Bad') this.pairNext = null;
    this.showResult(score.grade, score.penalties, `+${yen(price)}  bill ${yen(this.bill)}`, '#FFD86B');
    const bar = this.world.getSystem(TurnSystem)?.barEntity;
    if (bar) bar.setValue(Bar, 'served', (bar.getValue(Bar, 'served') ?? 0) + 1);
    console.log(
      `[Customer] served ${MENU[item].name}: ${score.grade}, ${yen(price)} on the bill (${yen(this.bill)}); ${score.penalties.join(',') || 'nothing to improve'}; orders ${counted}/${next}`,
    );
  }

  /** The grade (none for a piece sent back or the check), what to improve, and a line of money or words. */
  private showResult(grade: string | null, penalties: readonly IconKind[], words: string, color: string, last = grade ?? 'Sent back'): void {
    setSpriteText(this.moneySprite, words, { color });
    for (const [g, sprite] of this.gradeSprites) sprite.visible = g === grade;
    let i = 0;
    const n = penalties.length;
    for (const [kind, sprite] of this.icons) {
      const shown = penalties.includes(kind);
      sprite.visible = shown;
      if (shown) {
        sprite.position.set((i - (n - 1) / 2) * 0.06, -0.09, 0);
        i++;
      }
    }
    this.resultGroup.visible = true;
    this.resultTime = RESULT_SECONDS;
    this.entity.setValue(Customer, 'lastGrade', last);
  }

  /** A short word over the head (a thank-you, no tea after all). */
  private say(text: string, color: string): void {
    this.sayText = text;
    this.sayColor = color;
    this.sayTime = SAY_SECONDS;
  }

  /** On the way in from the door, distance s along it, facing the way they walk (seated: the bar). */
  private placeOnWay(s: number, dir: number): void {
    const first = s <= FIRST_LEG;
    const a = first ? DOOR : TURN;
    const b = first ? TURN : SEAT;
    const k = first ? s / FIRST_LEG : (s - FIRST_LEG) / (WAY_LENGTH - FIRST_LEG);
    this.figure.position.lerpVectors(a, b, Math.min(1, Math.max(0, k)));
    if (dir) {
      this.tmp.subVectors(b, a).multiplyScalar(dir);
      this.figure.rotation.y = Math.atan2(this.tmp.x, this.tmp.z);
    } else {
      this.figure.rotation.y = 0;
    }
  }

  /** Done: with something on the bill they ask for the check, otherwise they just go. */
  private finish(): void {
    tea.wanted = false;
    if (!this.tab.length) return this.leave();
    this.phase = 'paying';
    this.entity.setValue(Customer, 'state', CustomerState.Paying);
    service.check = true;
    console.log(`[Customer] check, please: ${yen(this.bill)}`);
  }

  /** The chef pointed at them and pinched: the bill is paid. */
  private checkout(): void {
    let total = 0;
    for (const item of this.tab) total += ledger.sale(item);
    playCoin();
    this.tab.length = 0;
    this.bill = 0;
    this.showResult(null, NO_PENALTIES, `Paid ${yen(total)}  today ${yen(ledger.sales)}`, '#FFD86B', 'Paid');
    const bar = this.world.getSystem(TurnSystem)?.barEntity;
    if (bar) bar.setValue(Bar, 'sales', ledger.sales);
    console.log(`[Customer] paid the check: ${yen(total)} (today ${yen(ledger.sales)})`);
    this.leave();
  }

  private leave(): void {
    service.check = false;
    this.phase = 'leaving';
    this.t = 0;
    this.walkS = WAY_LENGTH;
    this.entity.setValue(Customer, 'state', CustomerState.Leaving);
  }

  /** Point at the customer waiting for the check and pinch (the pinch bends the finger: a point just before counts). */
  private updateCheck(): boolean {
    this.player.head.getWorldPosition(this.eye);
    let pointing = false;
    let paid = false;
    for (const side of [chef.netaSide, chef.riceSide] as Side[]) {
      const hand = hands.all[side];
      if (!hand.tracked || chef.hands[side].holding !== Held.None) continue;
      if (!heldOut(hand, this.eye)) {
        if (hand.pinchStart) this.lastPointed[side] = -10;
        continue;
      }
      if (pointOff(hand, service.customerAt) < POINT_ACROSS_DEG) {
        pointing = true;
        this.lastPointed[side] = this.clock;
      }
      if (hand.pinchStart && this.clock - this.lastPointed[side] <= POINT_LATCH_SECONDS) paid = true;
    }
    // Eye tracking (the glasses): look at the customer and pinch with an empty hand.
    const seen = gazeOff(this.player, service.customerAt, CHECK_LOOK_RADIUS) < GAZE_CONE_DEG;
    if (paid) this.gazePinch.cancel();
    else if (this.gazePinch.update(seen ? true : null)) paid = true;
    this.glow((pointing || seen) && !paid);
    return paid;
  }

  private glow(on: boolean): void {
    if (on === this.glowing) return;
    this.glowing = on;
    glowObject(this.figure, on ? COLOR_HINT : null);
  }

  /** The tea: thanked for when it comes; given up on after a while, with one order fewer. */
  private updateTea(delta: number): void {
    if (tea.justServed) {
      tea.justServed = false;
      if (tea.wanted) {
        tea.wanted = false;
        this.say('Thank you', '#ffffff');
        console.log('[Customer] thanks for the tea');
      }
    }
    if (!tea.wanted) return;
    this.teaWait += delta;
    if (this.teaWait < TEA_PATIENCE_SECONDS) return;
    tea.wanted = false;
    const e = this.entity;
    const done = e.getValue(Customer, 'ordersDone') ?? 0;
    const orders = e.getValue(Customer, 'orders') ?? ORDERS_PER_CUSTOMER;
    e.setValue(Customer, 'orders', Math.max(done + 1, orders - 1));
    this.say('No tea, then', '#F2B134');
    console.log('[Customer] no tea came: one order fewer');
  }

  /** The word over the head, redrawn only when it changes. */
  private updateWords(delta: number): void {
    if (this.sayTime > 0) this.sayTime -= delta;
    let text = '';
    let color = '#ffffff';
    if (this.phase === 'paying') {
      text = 'Check, please';
      color = '#FFD86B';
    } else if (this.sayTime > 0) {
      text = this.sayText;
      color = this.sayColor;
    } else if (tea.wanted) {
      text = 'Tea, please';
    }
    if (text === this.wordsText) return;
    this.wordsText = text;
    this.words.visible = !!text;
    if (!text) return;
    setSpriteText(this.words, text, { color });
    // The check where the order card was; the tea beside it.
    if (this.phase === 'paying') this.words.position.set(0, 1.45, 0);
    else this.words.position.set(0.3, 1.32, 0);
  }

  private dominantHand(): Mesh {
    return this.entity.getValue(Customer, 'leftHanded') ? this.handL : this.handR;
  }

  update(delta: number): void {
    this.clock += delta;
    if (this.phase === 'closed') {
      service.order = null;
      service.check = false;
      staff.guestAtDoor = false;
      if (!chef.open || day.closing) return;
      // Open: the first customer comes in at the entrance.
      this.newCustomer(false);
    }
    this.syncOrder();
    this.head.getWorldPosition(service.customerAt);
    if (this.resultTime > 0) {
      this.resultTime -= delta;
      if (this.resultTime <= 0) this.resultGroup.visible = false;
    }
    const hand = this.dominantHand();
    this.handRest.set(hand === this.handL ? HAND_REST_X : -HAND_REST_X, 0.77, 0.25);
    this.t += delta;
    this.updateTea(delta);
    switch (this.phase) {
      case 'door': {
        if (day.closing) {
          // The noren is in: nobody more is seated today.
          this.closeDay('nobody seated');
          break;
        }
        // Shown in by the part-timer when called in; otherwise they walk in on their own.
        staff.guestAtDoor = true;
        if (staff.partTimer && !staff.guideReady) break;
        staff.guestAtDoor = false;
        staff.guideReady = false;
        this.phase = 'entering';
        break;
      }
      case 'entering': {
        this.walkS = Math.min(WAY_LENGTH, this.walkS + WALK_PACE * delta);
        const seated = this.walkS >= WAY_LENGTH;
        this.placeOnWay(this.walkS, seated ? 0 : 1);
        if (seated) this.phase = 'waiting';
        break;
      }
      case 'reaching': {
        const k = Math.min(1, this.t / REACH_SECONDS);
        hand.position.lerpVectors(this.handRest, this.getaPos, k);
        if (k >= 1) {
          if (this.piece) {
            // The served copy shares its materials (and slice looks) with the case: keep them; its own shari and neta go.
            releasePiece(this.piece.object3D);
            this.piece.object3D?.removeFromParent();
            this.piece.dispose({ disposeResources: false });
            this.piece = null;
          }
          this.phase = 'returning';
          this.t = 0;
          this.entity.setValue(Customer, 'state', CustomerState.Eating);
          this.entity.setValue(Customer, 'handKnown', true);
          this.entity.setValue(Customer, 'eaten', (this.entity.getValue(Customer, 'eaten') ?? 0) + 1);
        }
        break;
      }
      case 'returning': {
        const k = Math.min(1, this.t / RETURN_SECONDS);
        hand.position.lerpVectors(this.getaPos, this.handRest, k);
        if (k >= 1) {
          const e = this.entity;
          if (this.pairNext) {
            // The bonito's other half, same wasabi.
            e.setValue(Customer, 'item', this.pairNext);
            this.pairNext = null;
            this.phase = 'waiting';
            e.setValue(Customer, 'state', CustomerState.Waiting);
            console.log(`[Customer] and the ${MENU[e.getValue(Customer, 'item') as MenuId].name.toLowerCase()}`);
            break;
          }
          const done = (e.getValue(Customer, 'ordersDone') ?? 0) + 1;
          e.setValue(Customer, 'ordersDone', done);
          if (done >= (e.getValue(Customer, 'orders') ?? ORDERS_PER_CUSTOMER) || day.closing) {
            console.log(`[Customer] done after ${done} orders${day.closing ? ' (last orders)' : ''}`);
            this.finish();
          } else {
            this.newOrder();
            this.phase = 'waiting';
            e.setValue(Customer, 'state', CustomerState.Waiting);
            if (this.teaPlanned && !this.teaAsked) {
              // After the first piece, some ask for tea.
              this.teaAsked = true;
              this.teaWait = 0;
              tea.wanted = true;
              console.log('[Customer] tea, please');
            }
          }
        }
        break;
      }
      case 'paying':
        if (this.updateCheck()) this.checkout();
        break;
      case 'leaving': {
        this.walkS = Math.max(0, this.walkS - WALK_PACE * delta);
        this.placeOnWay(this.walkS, -1);
        if (this.walkS <= 0) {
          this.resultGroup.visible = false;
          tea.clear = true;
          if (day.closing) this.closeDay('the last customer has left');
          else this.newCustomer(false);
        }
        break;
      }
    }
    this.updateWords(delta);
  }

  /** Out of the door for the day: the books are closed. */
  private closeDay(why: string): void {
    this.phase = 'closed';
    this.figure.visible = false;
    this.resultGroup.visible = false;
    staff.guestAtDoor = false;
    service.check = false;
    tea.wanted = false;
    tea.clear = true;
    day.closed = true;
    console.log(`[Customer] ${why}: closed for the day`);
  }
}
