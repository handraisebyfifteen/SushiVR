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
import { caseStock, chef, type Order, prep, service } from './game-state.js';
import { MENU, type MenuId, NETA } from './menu.js';
import type { Score } from './scoring.js';
import { stations } from './station-system.js';
import { Bar, Customer, CustomerState, StationKind } from './sushi-components.js';
import { makeOrderCard, redrawOrderCard } from './order-card.js';
import { type IconKind, makeIconSprite, makeTextSprite } from './text-sprites.js';
import { CUSTOMER_SEAT_Z, STEP_HEIGHT } from './layout.js';
import { ENABLED_KINDS, LEFT_HANDED_CUSTOMER_RATIO, PIECES_PER_CUSTOMER, RESULT_SECONDS } from './tuning.js';
import { TurnSystem } from './turn-system.js';

const REACH_SECONDS = 0.8;
const RETURN_SECONDS = 0.6;
const LEAVE_SECONDS = 1.0;
/** Customer floor is one step (0.2 m) below the chef's platform. */
/** Where the customer sits: just beyond the customer counter, on the lower floor. */
const SEAT = new Vector3(0, -STEP_HEIGHT, CUSTOMER_SEAT_Z);
const HAND_REST_X = 0.17;
const ALL_ICONS: IconKind[] = ['rhythm', 'fish', 'wasabi', 'orientation', 'hand', 'fresh', 'hygiene', 'board', 'soap', 'knife'];

/** How the nigiri system hands a served piece (its own entity) to the customer. */
export const customerApi = {
  serve: (_score: Score, _piece: Entity): void => undefined,
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
 * hand cubes) across the counter. The order shows above the head as a card:
 * fish color plus a wasabi mark. When a piece is served the customer reaches
 * with the dominant hand (revealing it), eats, and the result appears above
 * the head for a few seconds. After enough pieces the customer leaves and the
 * next one arrives, sometimes left-handed.
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
  private icons = new Map<IconKind, Sprite>();
  private resultGroup!: Group;
  private resultTime = 0;
  /** 'closed' until the bar opens (the morning prep): nobody is seated. */
  private phase: 'closed' | 'waiting' | 'reaching' | 'returning' | 'leaving' | 'arriving' = 'waiting';
  private t = 0;
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
    for (const kind of ALL_ICONS) {
      const sprite = makeIconSprite(kind);
      sprite.visible = false;
      this.resultGroup.add(sprite);
      this.icons.set(kind, sprite);
    }
    this.figure.add(this.resultGroup);

    this.entity = this.world.createTransformEntity(this.figure);
    this.entity.addComponent(Customer, {});
    if (prep.active && !chef.open) {
      this.phase = 'closed';
      this.figure.visible = false;
    } else {
      this.newCustomer(true);
    }
    customerApi.serve = (score, piece) => this.serve(score, piece);
  }

  private newCustomer(first: boolean): void {
    const e = this.entity;
    e.setValue(Customer, 'leftHanded', Math.random() < LEFT_HANDED_CUSTOMER_RATIO);
    e.setValue(Customer, 'handKnown', false);
    e.setValue(Customer, 'eaten', 0);
    e.setValue(Customer, 'lastGrade', '');
    e.setValue(Customer, 'state', CustomerState.Waiting);
    this.newOrder();
    service.customerHandKnown = false;
    service.eatenByCustomer = 0;
    if (!first) {
      this.phase = 'arriving';
      this.t = 0;
      this.figure.position.set(SEAT.x - 1.0, SEAT.y, SEAT.z);
    }
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

  private serve(score: Score, piece: Entity): void {
    if (this.phase !== 'waiting') {
      piece.dispose({ disposeResources: false });
      return;
    }
    this.piece = piece;
    this.phase = 'reaching';
    this.t = 0;
    const geta = stations.get(StationKind.Geta);
    if (geta) this.getaPos.copy(geta.pos).add(this.tmp.set(0, 0.02, 0));
    this.figure.worldToLocal(this.getaPos);
    this.entity.setValue(Customer, 'state', CustomerState.Reaching);
    this.showResult(score);
    const bar = this.world.getSystem(TurnSystem)?.barEntity;
    if (bar) {
      bar.setValue(Bar, 'served', (bar.getValue(Bar, 'served') ?? 0) + 1);
      bar.setValue(Bar, 'totalScore', (bar.getValue(Bar, 'totalScore') ?? 0) + score.score);
    }
    console.log(`[Customer] served: ${score.grade} (${score.score}) ${score.penalties.join(',') || 'no penalties'}`);
  }

  private showResult(score: Score): void {
    for (const [grade, sprite] of this.gradeSprites) sprite.visible = grade === score.grade;
    let i = 0;
    const n = score.penalties.length;
    for (const [kind, sprite] of this.icons) {
      const shown = score.penalties.includes(kind);
      sprite.visible = shown;
      if (shown) {
        sprite.position.set((i - (n - 1) / 2) * 0.06, -0.09, 0);
        i++;
      }
    }
    this.resultGroup.visible = true;
    this.resultTime = RESULT_SECONDS;
    this.entity.setValue(Customer, 'lastGrade', score.grade);
  }

  private dominantHand(): Mesh {
    return this.entity.getValue(Customer, 'leftHanded') ? this.handL : this.handR;
  }

  update(delta: number): void {
    if (this.phase === 'closed') {
      service.order = null;
      if (!chef.open) return;
      // Open: the first customer walks in.
      this.figure.visible = true;
      this.newCustomer(false);
    }
    this.syncOrder();
    if (this.resultTime > 0) {
      this.resultTime -= delta;
      if (this.resultTime <= 0) this.resultGroup.visible = false;
    }
    const hand = this.dominantHand();
    this.handRest.set(hand === this.handL ? HAND_REST_X : -HAND_REST_X, 0.77, 0.25);
    this.t += delta;
    switch (this.phase) {
      case 'reaching': {
        const k = Math.min(1, this.t / REACH_SECONDS);
        hand.position.lerpVectors(this.handRest, this.getaPos, k);
        if (k >= 1) {
          if (this.piece) {
            // The served copy shares its meshes' geometry and materials with the case: keep them.
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
          if ((this.entity.getValue(Customer, 'eaten') ?? 0) >= PIECES_PER_CUSTOMER) {
            this.phase = 'leaving';
            this.t = 0;
            this.entity.setValue(Customer, 'state', CustomerState.Leaving);
            console.log('[Customer] leaving');
          } else {
            this.newOrder();
            this.phase = 'waiting';
            this.entity.setValue(Customer, 'state', CustomerState.Waiting);
          }
        }
        break;
      }
      case 'leaving': {
        const k = Math.min(1, this.t / LEAVE_SECONDS);
        this.figure.position.set(SEAT.x + k * 1.0, SEAT.y, SEAT.z);
        if (k >= 1) {
          this.resultGroup.visible = false;
          this.newCustomer(false);
        }
        break;
      }
      case 'arriving': {
        const k = Math.min(1, this.t / LEAVE_SECONDS);
        this.figure.position.set(SEAT.x - (1 - k) * 1.0, SEAT.y, SEAT.z);
        if (k >= 1) this.phase = 'waiting';
        break;
      }
    }
  }
}
