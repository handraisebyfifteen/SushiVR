import {
  BoxGeometry,
  createSystem,
  type Entity,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  type Sprite,
  Vector3,
} from '@iwsdk/core';
import { FISH_COLOR, type FishKind, service } from './game-state.js';
import type { Score } from './scoring.js';
import { stations } from './station-system.js';
import { Bar, Customer, CustomerState, Fish, StationKind } from './sushi-components.js';
import { type IconKind, makeIconSprite, makeOrderSprite, makeTextSprite } from './text-sprites.js';
import { CUSTOMER_SEAT_Z, STEP_HEIGHT } from './layout.js';
import { LEFT_HANDED_CUSTOMER_RATIO, PIECES_PER_CUSTOMER, RESULT_SECONDS } from './tuning.js';
import { TurnSystem } from './turn-system.js';

const REACH_SECONDS = 0.8;
const RETURN_SECONDS = 0.6;
const LEAVE_SECONDS = 1.0;
/** Customer floor is one step (0.2 m) below the chef's platform. */
/** Where the customer sits: just beyond the customer counter, on the lower floor. */
const SEAT = new Vector3(0, -STEP_HEIGHT, CUSTOMER_SEAT_Z);
const HAND_REST_X = 0.17;
const ALL_ICONS: IconKind[] = ['rhythm', 'fish', 'wasabi', 'orientation', 'hand', 'fresh', 'hygiene', 'board', 'soap', 'knife'];

/** How the nigiri system hands a served piece to the customer. */
export const customerApi = {
  serve: (_score: Score, _piece: Object3D): void => undefined,
};

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
  private cardKey = '';
  private gradeSprites = new Map<string, Sprite>();
  private icons = new Map<IconKind, Sprite>();
  private resultGroup!: Group;
  private resultTime = 0;
  private phase: 'waiting' | 'reaching' | 'returning' | 'leaving' | 'arriving' = 'waiting';
  private t = 0;
  private piece: Object3D | null = null;
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
    this.newCustomer(true);
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
    const fishes = Object.values(Fish) as FishKind[];
    this.entity.setValue(Customer, 'fish', fishes[Math.floor(Math.random() * fishes.length)]);
    this.entity.setValue(Customer, 'wasabi', Math.random() < 0.5);
  }

  /** The component is the source of truth, so a test can edit the order. */
  private syncOrder(): void {
    const fish = this.entity.getValue(Customer, 'fish') as FishKind;
    const wasabi = !!this.entity.getValue(Customer, 'wasabi');
    service.customerLeftHanded = !!this.entity.getValue(Customer, 'leftHanded');
    service.customerHandKnown = !!this.entity.getValue(Customer, 'handKnown');
    service.eatenByCustomer = this.entity.getValue(Customer, 'eaten') ?? 0;
    service.order = this.phase === 'waiting' ? { fish, wasabi } : null;
    const key = `${fish}:${wasabi}`;
    if (key !== this.cardKey) {
      this.cardKey = key;
      if (this.orderCard) this.figure.remove(this.orderCard);
      this.orderCard = makeOrderSprite(FISH_COLOR[fish], wasabi);
      this.orderCard.position.y = 1.42;
      this.figure.add(this.orderCard);
    }
    if (this.orderCard) this.orderCard.visible = this.phase === 'waiting';
  }

  private serve(score: Score, piece: Object3D): void {
    if (this.phase !== 'waiting') return;
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
            this.piece.visible = false;
            this.piece.removeFromParent();
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
