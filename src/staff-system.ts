import { BoxGeometry, CylinderGeometry, createSystem, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import { chef, day, prep, staff, tea } from './game-state.js';
import {
  AISLE_CENTER_Z,
  BAR_LENGTH,
  CUSTOMER_SEAT_Z,
  EAVES_Z,
  ENTRANCE_X,
  ENTRANCE_Z,
  ICE_BOX_X,
  ROOM_END_X,
  STEP_HEIGHT,
  TSUKEDAI_CUSTOMER_Z,
  WALL_THICKNESS,
} from './layout.js';
import { ledger } from './ledger.js';
import { teaApi } from './tea-system.js';
import { SEAT_MINUTES, TEA_POUR_SECONDS, WALK_PACE } from './tuning.js';

type Who = 'cook' | 'partTimer';

const PACE = WALK_PACE;
/** The aisle's left end wall (the kitchen doorway's), inside face. */
const END_X = -ROOM_END_X + WALL_THICKNESS / 2;
/** In the kitchen, out of sight behind the doorway's noren. */
const KITCHEN_X = END_X - 0.35;
/** Shown once this far out of the kitchen (just behind the noren). */
const SHOWN_FROM_X = -ROOM_END_X - 0.12;
/** The part-timer's walk runs behind the chef's seat, in front of the back row. */
const LANE_Z = AISLE_CENTER_Z + 0.36;
/**
 * During service the part-timer keeps to the office corner (帳場), behind the
 * long noren of the passage at the bar's right end, and comes out through
 * it onto the customer floor: to the entrance to show a customer in, or to
 * the customer's side with a cup of tea.
 */
const PASSAGE_X = (BAR_LENGTH / 2 + 0.105 + ROOM_END_X) / 2;
const NOREN_SIDE = new Vector3(PASSAGE_X, 0, EAVES_Z - 0.07);
const STEP_DOWN = new Vector3(PASSAGE_X - 0.1, -STEP_HEIGHT, TSUKEDAI_CUSTOMER_Z - 0.25);
const BY_CUSTOMER = new Vector3(0.5, -STEP_HEIGHT, CUSTOMER_SEAT_Z - 0.12);
const BY_DOOR = new Vector3(ENTRANCE_X + 0.5, -STEP_HEIGHT, ENTRANCE_Z + 0.5);

interface Path {
  points: Vector3[];
  length: number;
  /** Which way they face when stopped at its far end (null: as they walked). */
  endYaw: number | null;
}

function path(points: Vector3[], endYaw: number | null): Path {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);
  return { points, length, endYaw };
}

/** Out to the customer's side (facing the counter), out to the door, and with a customer from the door to the seat. */
const TEA_WAY = path([NOREN_SIDE, STEP_DOWN, BY_CUSTOMER], Math.PI);
const DOOR_WAY = path([NOREN_SIDE, STEP_DOWN, BY_DOOR], null);
const LEAD_WAY = path([BY_DOOR, BY_CUSTOMER], Math.PI);

interface Figure {
  who: Who;
  root: Group;
  body: Group;
  carry: Mesh | null;
  /** The hand a cup is carried in. */
  hand: Mesh;
  /** The way they walk now (the prep's: from the kitchen to where they work), and how far along it they are. */
  way: Path;
  s: number;
}

/** The part-timer's work during service: none (at the office), pouring tea, out with it, to the door, showing a customer in, back. */
type ServiceJob = 'none' | 'pour' | 'tea' | 'toDoor' | 'lead' | 'back';

const skin = new MeshStandardMaterial({ color: '#E8C9A8', roughness: 0.8 });

/**
 * The cook and the part-timer as plain figures (a sphere head, box body,
 * like the customer). Nobody is out in the bar unless called: the chef
 * calls one in with their button in the office corner (src/office-system.ts),
 * and they come out of the kitchen doorway for the job and go back when it
 * is done:
 *  - the cook (white coat and cap) walks to the ice box, takes the next fish
 *    into the kitchen, and its saku come out into the case
 *    (src/prep-cut-system.ts), and comes back for the next while any is left;
 *  - the part-timer (navy, brown apron) comes to the board once the prep is
 *    done, throws out the scraps and washes the board (src/opening-system.ts).
 *    Once the bar is open the part-timer keeps to the office corner, behind the long
 *    noren of the passage at the bar's right end, and comes out through it:
 *    to the entrance to show each new customer in, and with a cup of tea
 *    when a customer asks for one (src/tea-system.ts).
 * Each is paid for the minutes of work done (src/ledger.ts).
 */
export class StaffSystem extends createSystem({}) {
  private figures: Figure[] = [];
  private readonly tmp = new Vector3();
  /** The part-timer: at the office for service (once the bar is open), and the job there. */
  private service = false;
  private job: ServiceJob = 'none';
  private pourLeft = 0;

  init(): void {
    this.figures = [this.make('cook'), this.make('partTimer')];
  }

  private make(who: Who): Figure {
    const cook = who === 'cook';
    const cloth = new MeshStandardMaterial({ color: cook ? '#EFEDE6' : '#2F3A4A', roughness: 0.9 });
    const root = new Group();
    root.name = cook ? 'Cook' : 'PartTimer';
    const body = new Group();
    const head = new Mesh(new SphereGeometry(0.095, 16, 12), skin);
    head.position.y = 1.55;
    const torso = new Mesh(new BoxGeometry(0.34, 0.5, 0.2), cloth);
    torso.position.y = 1.15;
    const legs = new Mesh(new BoxGeometry(0.28, 0.9, 0.17), new MeshStandardMaterial({ color: cook ? '#D9D6CC' : '#26262A', roughness: 0.9 }));
    legs.position.y = 0.45;
    const handL = new Mesh(new BoxGeometry(0.06, 0.04, 0.08), skin);
    handL.position.set(0.15, 0.95, -0.12);
    const handR = handL.clone();
    handR.position.x = -0.15;
    body.add(head, torso, legs, handL, handR);
    let carry: Mesh | null = null;
    if (cook) {
      // A white cook's cap, and the wrapped fish he carries to the kitchen.
      const cap = new Mesh(new CylinderGeometry(0.085, 0.09, 0.08, 16), cloth);
      cap.position.y = 1.64;
      carry = new Mesh(new BoxGeometry(0.22, 0.07, 0.11), new MeshStandardMaterial({ color: '#E8E2D2', roughness: 0.9 }));
      carry.position.set(0, 0.99, -0.16);
      carry.visible = false;
      body.add(cap, carry);
    } else {
      // A brown apron over the front.
      const apron = new Mesh(new BoxGeometry(0.3, 0.62, 0.01), new MeshStandardMaterial({ color: '#6B4F35', roughness: 0.9 }));
      apron.position.set(0, 0.95, -0.106);
      body.add(apron);
    }
    root.add(body);
    // Both keep clear of the master (beside the chef on the left): the cook along the front of the
    // aisle to the ice box's end; the part-timer behind the chef to the board's right.
    const way = cook
      ? path([new Vector3(KITCHEN_X, 0, AISLE_CENTER_Z - 0.2), new Vector3(END_X + 0.17, 0, AISLE_CENTER_Z - 0.38), new Vector3(ICE_BOX_X - 0.33, 0, AISLE_CENTER_Z - 0.3)], 0)
      : path([
          new Vector3(KITCHEN_X, 0, AISLE_CENTER_Z + 0.1),
          new Vector3(END_X + 0.05, 0, AISLE_CENTER_Z + 0.15),
          new Vector3(END_X + 0.27, 0, AISLE_CENTER_Z + 0.45),
          new Vector3(END_X + 0.47, 0, LANE_Z),
          new Vector3(0.84, 0, LANE_Z),
          new Vector3(0.84, 0, AISLE_CENTER_Z + 0.12),
        ], 0);
    const f: Figure = { who, root, body, carry, hand: handL, way, s: 0 };
    this.world.createTransformEntity(root);
    this.place(f, 0);
    return f;
  }

  update(delta: number): void {
    const [cook, partTimer] = this.figures;
    this.walk(cook, delta, this.target(cook));
    if (!this.service && chef.open && partTimer.s <= 0) {
      // The bar is open: the part-timer keeps to the office corner from now on.
      this.service = true;
      partTimer.way = TEA_WAY;
      partTimer.s = 0;
    }
    if (this.service) this.updateService(partTimer, delta);
    else this.walk(partTimer, delta, this.target(partTimer));
    staff.cookReady = cook.s >= cook.way.length && staff.cook && !staff.cookOn;
    staff.partTimerReady = !this.service && partTimer.s >= partTimer.way.length;
  }

  /** Service: from the office out through the noren to show a customer in or bring tea, and back. */
  private updateService(f: Figure, delta: number): void {
    const on = staff.partTimer && !day.closed;
    switch (this.job) {
      case 'none':
        if (on && staff.guestAtDoor && !staff.guideReady) {
          this.job = 'toDoor';
          f.way = DOOR_WAY;
          f.s = 0;
        } else if (on && tea.wanted && tea.cup === 'none') {
          // Poured at the office, out of sight.
          this.job = 'pour';
          this.pourLeft = TEA_POUR_SECONDS;
          tea.cup = 'partTimer';
        }
        break;
      case 'pour':
        this.pourLeft -= delta;
        if (this.pourLeft <= 0) {
          this.job = 'tea';
          f.way = TEA_WAY;
          f.s = 0;
          teaApi.partTimerTakes();
        }
        break;
      case 'tea':
        if (this.walk(f, delta, f.way.length)) {
          teaApi.partTimerPlaces();
          this.job = 'back';
        }
        break;
      case 'toDoor':
        if (!staff.partTimer) {
          this.job = 'back';
          break;
        }
        if (this.walk(f, delta, f.way.length)) {
          // At the door: the customer follows them in.
          staff.guideReady = true;
          this.job = 'lead';
          f.way = LEAD_WAY;
          f.s = 0;
        }
        break;
      case 'lead':
        if (this.walk(f, delta, f.way.length)) {
          ledger.wage('partTimer', 'showing in', SEAT_MINUTES);
          console.log('[Staff] the part-timer has shown the customer in');
          this.job = 'back';
          f.way = TEA_WAY;
          f.s = TEA_WAY.length;
        }
        break;
      case 'back':
        if (this.walk(f, delta, 0)) this.job = 'none';
        break;
    }
    if (this.job === 'tea') {
      f.hand.getWorldPosition(tea.cupAt);
      tea.cupAt.y -= 0.03;
    }
    // Out of sight at the office, behind the noren, unless out on a job.
    f.root.visible = this.job !== 'none' && this.job !== 'pour';
  }

  /** How far along their way each one should be now: at work, or in the kitchen. */
  private target(f: Figure): number {
    if (f.who === 'cook') {
      if (staff.cookOn) return 0;
      const fetch = staff.cook && prep.active && prep.delivered && staff.boxLeft > 0;
      return fetch ? f.way.length : 0;
    }
    return (staff.partTimer && prep.active && staff.cleanupWanted) || staff.cleaning ? f.way.length : 0;
  }

  /** A step toward distance `to` along their way; true once there. */
  private walk(f: Figure, delta: number, to: number): boolean {
    const step = PACE * delta;
    const moving = Math.abs(to - f.s) > 1e-4;
    const back = to < f.s;
    f.s = back ? Math.max(to, f.s - step) : Math.min(to, f.s + step);
    if (f.carry) f.carry.visible = !!staff.cookOn;
    this.place(f, moving ? (back ? -1 : 1) : 0);
    if (f.who === 'cook' || !this.service) f.root.visible = f.root.position.x > SHOWN_FROM_X;
    return Math.abs(to - f.s) <= 1e-4;
  }

  /** At distance s along their way, facing the way they walk (stopped at its far end: as the way says). */
  private place(f: Figure, dir: number): void {
    const points = f.way.points;
    let left = f.s;
    let i = 1;
    for (; i < points.length - 1; i++) {
      const seg = points[i].distanceTo(points[i - 1]);
      if (left <= seg) break;
      left -= seg;
    }
    const a = points[i - 1];
    const b = points[i];
    f.root.position.lerpVectors(a, b, Math.min(1, left / Math.max(1e-6, a.distanceTo(b))));
    if (dir !== 0) {
      this.tmp.subVectors(b, a).multiplyScalar(dir);
      f.body.rotation.y = Math.atan2(-this.tmp.x, -this.tmp.z);
    } else if (f.s >= f.way.length && f.way.endYaw !== null) {
      f.body.rotation.y = f.way.endYaw;
    }
  }
}
