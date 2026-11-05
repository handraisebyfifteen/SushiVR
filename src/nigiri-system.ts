import {
  BoxGeometry,
  Color,
  createSystem,
  type Entity,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { HandReader } from './hand-reader.js';
import {
  Hand,
  HandState,
  NigiriGame,
  NigiriStep,
  Station,
  StationKind,
  WasabiState,
} from './sushi-components.js';

type Step = (typeof NigiriStep)[keyof typeof NigiriStep];
type Kind = (typeof StationKind)[keyof typeof StationKind];
type HState = (typeof HandState)[keyof typeof HandState];
type Wasabi = (typeof WasabiState)[keyof typeof WasabiState];

/** Squeezes (with the rice on the neta) before the nigiri counts as shaped. */
const SQUEEZES_TO_SHAPE = 3;
/** The squeeze on which the piece is turned over, neta on top. */
const FLIP_AT_SQUEEZE = 2;
/** Fist squeezes with both hands in the basin to finish washing. */
const WASH_SQUEEZES = 3;
/** Fist squeezes on the towel to dry one hand. */
const WIPE_SQUEEZES = 2;
/** Pieces served before rice grains build up and hands must be washed again. */
const PIECES_PER_WASH = 3;
/** Seconds a fist must be held over the geta to confirm serving. */
const SERVE_HOLD_SECONDS = 1.0;
/** Seconds the served sushi slides away before the loop resets. */
const SERVE_ANIM_SECONDS = 0.6;
const LID_ANIM_SECONDS = 0.3;
const FLASH_SECONDS = 0.35;
/** Vertical band (m) above a station surface in which a hand counts as over it. */
const ZONE_HEIGHT = 0.3;
/** Palm-to-palm distance (m) at which the rice is set onto the neta. */
const JOIN_DISTANCE = 0.1;
/** Grasp-to-palm distance (m) at which a pinch picks the nigiri off the other hand. */
const PICK_DISTANCE = 0.09;
/** Fingertip-to-neta distance (m) at which wasabi is dabbed on. */
const DAB_DISTANCE = 0.05;

const RICE_LOOSE = new Vector3(1, 1, 1);
const RICE_SHAPED = new Vector3(1.25, 0.55, 0.75);
const NETA_LIFT = 0.012;
const LAYER = 0.02;

const COLOR_IDLE = new Color('#8fd3ff');
const COLOR_READY = new Color('#ffffff');
const COLOR_DONE = new Color('#7CFC8C');
const COLOR_WARN = new Color('#F2B134');
const COLOR_UNWASHED = new Color('#8C8C8C');
const COLOR_WIPE = new Color('#F2D35B');
const COLOR_WET = new Color('#5FB8FF');

const HAND_NAMES = [Hand.Left, Hand.Right] as const;
const HAND_FIELDS = ['leftHand', 'rightHand'] as const;

/**
 * The nigiri workflow, driven by hand tracking only, in the order a sushi
 * chef works:
 *   wash both hands (basin) -> dry (towel) -> dip the rice hand in tezu ->
 *   fist in the rice tub -> other hand opens the neta box lid (then wipes) ->
 *   pinch a neta slice onto that palm -> dab wasabi with the index finger ->
 *   bring the palms together: rice lands on the neta -> squeeze x3 (the
 *   piece turns over on the 2nd) -> pinch the nigiri with the free hand ->
 *   release on the geta -> hold a fist over the geta to serve.
 * Highlight rings show where a hand can act; small rings under each palm
 * show its cleanliness. Mistakes flash amber and point at the fix.
 */
export class NigiriSystem extends createSystem({
  stations: { required: [Station] },
  game: { required: [NigiriGame] },
}) {
  private hands!: [HandReader, HandReader];
  private handState: [HState, HState] = [HandState.Unwashed, HandState.Unwashed];
  private wipeSqueezes: [number, number] = [0, 0];
  private washSqueezes = 0;
  private inTezu: [boolean, boolean] = [false, false];

  private rice!: Mesh<SphereGeometry, MeshStandardMaterial>;
  private tuna!: Mesh<BoxGeometry, MeshStandardMaterial>;
  private wasabiBlob!: Mesh<SphereGeometry, MeshStandardMaterial>;
  private lid!: Mesh<BoxGeometry, MeshStandardMaterial>;
  private bar!: Mesh<BoxGeometry, MeshBasicMaterial>;
  private rings!: Map<Kind, Mesh<RingGeometry, MeshBasicMaterial>>;
  private handRings!: [Mesh<RingGeometry, MeshBasicMaterial>, Mesh<RingGeometry, MeshBasicMaterial>];
  private gameEntity!: Entity;
  private stationPos = new Map<Kind, Vector3>();
  private stationRadius = new Map<Kind, number>();
  private active = new Map<Kind, boolean>();

  private riceHand: HandReader | null = null;
  private netaHand: HandReader | null = null;
  private carrier: HandReader | null = null;
  private wasabi: Wasabi = WasabiState.None;
  private lidOpen = false;
  private lidT = 0;
  private lidJustOpened = false;
  private squeezes = 0;
  private shaped = false;
  private flipped = false;
  private holdTime = 0;
  private flashTime = 0;
  private flashKind: Kind | null = null;
  private flashColor: Color = COLOR_DONE;
  private serveTime = 0;
  private readonly tmp = new Vector3();
  private readonly serveFrom = new Vector3();

  init(): void {
    const xr = this.input.xr;
    this.hands = [new HandReader('left', xr), new HandReader('right', xr)];

    this.rice = new Mesh(
      new SphereGeometry(0.03, 16, 12),
      new MeshStandardMaterial({ color: '#F6F2EA', roughness: 0.9 }),
    );
    this.rice.name = 'Shari';
    this.rice.visible = false;
    this.world.createTransformEntity(this.rice);

    this.tuna = new Mesh(
      new BoxGeometry(0.075, 0.012, 0.04),
      new MeshStandardMaterial({ color: '#C8333A', roughness: 0.5 }),
    );
    this.tuna.name = 'Tuna';
    this.tuna.visible = false;
    this.world.createTransformEntity(this.tuna);

    this.wasabiBlob = new Mesh(
      new SphereGeometry(0.008, 10, 8),
      new MeshStandardMaterial({ color: '#6B9E3A', roughness: 0.8 }),
    );
    this.wasabiBlob.name = 'WasabiDab';
    this.wasabiBlob.visible = false;
    this.world.createTransformEntity(this.wasabiBlob);

    this.lid = new Mesh(
      new BoxGeometry(0.21, 0.012, 0.15),
      new MeshStandardMaterial({ color: '#2A2424', roughness: 0.35 }),
    );
    this.lid.name = 'NetaLid';
    this.world.createTransformEntity(this.lid);

    this.bar = new Mesh(
      new BoxGeometry(0.2, 0.012, 0.012),
      new MeshBasicMaterial({ color: COLOR_DONE }),
    );
    this.bar.name = 'Progress';
    this.bar.visible = false;
    this.world.createTransformEntity(this.bar);

    this.rings = new Map();
    for (const kind of Object.values(StationKind)) {
      const ring = new Mesh(
        new RingGeometry(0.11, 0.13, 32),
        new MeshBasicMaterial({ color: COLOR_IDLE, transparent: true, opacity: 0.8 }),
      );
      ring.name = `Ring_${kind}`;
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.world.createTransformEntity(ring);
      this.rings.set(kind, ring);
      this.stationPos.set(kind, new Vector3(0, -10, 0));
      this.stationRadius.set(kind, 0.14);
      this.active.set(kind, false);
    }

    const makeHandRing = (name: string) => {
      const ring = new Mesh(
        new RingGeometry(0.028, 0.038, 24),
        new MeshBasicMaterial({ color: COLOR_UNWASHED, transparent: true, opacity: 0.85 }),
      );
      ring.name = name;
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.world.createTransformEntity(ring);
      return ring;
    };
    this.handRings = [makeHandRing('HandRing_left'), makeHandRing('HandRing_right')];

    this.gameEntity = this.world.createTransformEntity();
    this.gameEntity.object3D!.name = 'NigiriGame';
    this.gameEntity.addComponent(NigiriGame, {});
  }

  update(delta: number): void {
    this.refreshStations();
    for (const hand of this.hands) hand.update();
    this.lidJustOpened = false;

    this.updateHygiene();

    const step = this.gameEntity.getValue(NigiriGame, 'step') as Step;
    switch (step) {
      case NigiriStep.Idle:
        this.updateIdle();
        break;
      case NigiriStep.HoldRice:
        this.updateHoldRice();
        break;
      case NigiriStep.HoldBoth:
        this.updateHoldBoth();
        break;
      case NigiriStep.Shaping:
        this.updateShaping();
        break;
      case NigiriStep.NigiriInHand:
        this.updateNigiriInHand();
        break;
      case NigiriStep.HoldNigiri:
        this.updateHoldNigiri();
        break;
      case NigiriStep.OnGeta:
        this.updateOnGeta(delta);
        break;
      case NigiriStep.Serving:
        this.updateServing(delta);
        break;
    }
    this.updateLid(delta);
    this.updateFeedback(delta);
  }

  // ---- hygiene: basin, towel, tezu, neta box lid --------------------------

  private updateHygiene(): void {
    const [left, right] = this.hands;

    // Washing needs both hands in the basin; each squeeze counts.
    const bothInBasin =
      left.tracked && right.tracked && !this.holding(left) && !this.holding(right) &&
      this.over(left.palm, StationKind.Basin) && this.over(right.palm, StationKind.Basin);
    if (bothInBasin && (left.fistStart || right.fistStart)) {
      this.washSqueezes++;
      if (this.washSqueezes >= WASH_SQUEEZES) {
        this.washSqueezes = 0;
        this.setHandState(0, HandState.NeedsWipe);
        this.setHandState(1, HandState.NeedsWipe);
        this.flash(StationKind.Basin, COLOR_DONE);
      }
    }

    for (let i = 0; i < 2; i++) {
      const hand = this.hands[i];
      if (!hand.tracked || this.holding(hand)) {
        this.inTezu[i] = false;
        continue;
      }
      const state = this.handState[i];

      // Towel: squeeze on it to dry. Rice grains need the basin, not the towel.
      if (hand.fistStart && this.over(hand.palm, StationKind.Towel)) {
        if (state === HandState.Unwashed) {
          this.flash(StationKind.Towel, COLOR_WARN);
        } else if (state === HandState.NeedsWipe) {
          this.wipeSqueezes[i]++;
          if (this.wipeSqueezes[i] >= WIPE_SQUEEZES) {
            this.wipeSqueezes[i] = 0;
            this.setHandState(i, HandState.Clean);
            this.flash(StationKind.Towel, COLOR_DONE);
          }
        } else {
          this.setHandState(i, HandState.Clean);
        }
      }

      // Tezu: an open hand dipped in the bowl gets wet (only a clean hand).
      const tezuNow = this.over(hand.palm, StationKind.Tezu) && hand.curl < 0.5;
      if (tezuNow && !this.inTezu[i]) {
        if (state === HandState.Clean) {
          this.setHandState(i, HandState.Wet);
          this.flash(StationKind.Tezu, COLOR_DONE);
        } else if (state !== HandState.Wet) {
          this.flash(StationKind.Tezu, COLOR_WARN);
        }
      }
      this.inTezu[i] = tezuNow;

      // Neta box lid: pinching it opens it, and the hand is no longer clean.
      if (!this.lidOpen && hand.pinchStart && this.over(hand.grasp, StationKind.NetaTray)) {
        this.lidOpen = true;
        this.lidJustOpened = true;
        this.gameEntity.setValue(NigiriGame, 'lidOpen', true);
        if (state === HandState.Clean || state === HandState.Wet) {
          this.setHandState(i, HandState.NeedsWipe);
        }
      }
    }
  }

  // ---- steps -------------------------------------------------------------

  private updateIdle(): void {
    for (let i = 0; i < 2; i++) {
      const hand = this.hands[i];
      if (!hand.tracked || !hand.fistStart || !this.over(hand.palm, StationKind.RiceTub)) continue;
      if (this.handState[i] !== HandState.Wet) {
        this.flash(StationKind.RiceTub, COLOR_WARN); // rice would stick to a dry hand
        return;
      }
      this.riceHand = hand;
      this.gameEntity.setValue(NigiriGame, 'riceHand', HAND_NAMES[i]);
      this.rice.scale.copy(RICE_LOOSE);
      this.rice.position.copy(hand.palm);
      this.rice.visible = true;
      this.flash(StationKind.RiceTub, COLOR_DONE);
      this.setStep(NigiriStep.HoldRice);
      return;
    }
  }

  private updateHoldRice(): void {
    const rice = this.riceHand!;
    if (rice.tracked) this.rice.position.copy(rice.palm);
    if (rice.fistStart) this.glowRice();

    const other = this.other(rice);
    const i = this.hands.indexOf(other);
    if (!other.tracked || !other.pinchStart || this.lidJustOpened) return;
    if (!this.lidOpen || !this.over(other.grasp, StationKind.NetaTray)) return;
    const state = this.handState[i];
    if (state !== HandState.Clean && state !== HandState.Wet) {
      this.flash(StationKind.NetaTray, COLOR_WARN);
      return;
    }
    this.netaHand = other;
    this.tuna.visible = true;
    this.placeNeta(other.palm);
    this.flash(StationKind.NetaTray, COLOR_DONE);
    this.setStep(NigiriStep.HoldBoth);
  }

  private updateHoldBoth(): void {
    const rice = this.riceHand!;
    const neta = this.netaHand!;
    if (rice.tracked) this.rice.position.copy(rice.palm);
    if (neta.tracked) this.placeNeta(neta.palm);
    if (rice.fistStart) this.glowRice();

    if (this.wasabi === WasabiState.None) {
      if (rice.tracked && this.over(rice.indexTip, StationKind.Wasabi)) {
        this.setWasabi(WasabiState.OnFinger);
        this.wasabiBlob.visible = true;
        this.flash(StationKind.Wasabi, COLOR_DONE);
      }
    } else if (this.wasabi === WasabiState.OnFinger) {
      this.wasabiBlob.position.copy(rice.indexTip);
      if (rice.indexTip.distanceTo(this.tuna.position) < DAB_DISTANCE) {
        this.setWasabi(WasabiState.OnNeta);
        this.glowRice();
      }
    } else {
      this.wasabiBlob.position.copy(this.tuna.position);
      this.wasabiBlob.position.y += 0.008;
      // Palms together, rice hand open: the rice settles onto the neta.
      if (
        rice.tracked && neta.tracked && !rice.fist &&
        rice.palm.distanceTo(neta.palm) < JOIN_DISTANCE
      ) {
        this.wasabiBlob.visible = false;
        this.squeezes = 0;
        this.flipped = false;
        this.gameEntity.setValue(NigiriGame, 'squeezes', 0);
        this.glowRice();
        this.setStep(NigiriStep.Shaping);
      }
    }
  }

  private updateShaping(): void {
    const neta = this.netaHand!;
    const rice = this.riceHand!;
    if (neta.tracked) this.layoutNigiri(neta.palm);
    const together = rice.tracked && rice.palm.distanceTo(neta.palm) < JOIN_DISTANCE + 0.05;
    if (!together || !(rice.fistStart || neta.fistStart)) return;

    this.squeezes = Math.min(SQUEEZES_TO_SHAPE, this.squeezes + 1);
    this.gameEntity.setValue(NigiriGame, 'squeezes', this.squeezes);
    this.rice.scale.lerpVectors(RICE_LOOSE, RICE_SHAPED, this.squeezes / SQUEEZES_TO_SHAPE);
    this.glowRice();
    if (this.squeezes >= FLIP_AT_SQUEEZE) this.flipped = true;
    if (this.squeezes >= SQUEEZES_TO_SHAPE) {
      this.shaped = true;
      this.gameEntity.setValue(NigiriGame, 'shaped', true);
      this.setStep(NigiriStep.NigiriInHand);
    }
  }

  private updateNigiriInHand(): void {
    const neta = this.netaHand!;
    if (neta.tracked) this.layoutNigiri(neta.palm);
    const other = this.other(neta);
    if (!other.tracked || !other.pinchStart) return;
    if (other.grasp.distanceTo(neta.palm) > PICK_DISTANCE) return;
    this.carrier = other;
    this.setStep(NigiriStep.HoldNigiri);
  }

  private updateHoldNigiri(): void {
    const hand = this.carrier!;
    if (hand.tracked) this.layoutNigiri(hand.grasp);
    if (!hand.pinchEnd) return;
    this.carrier = null;
    if (this.over(hand.grasp, StationKind.Geta)) {
      const pos = this.stationPos.get(StationKind.Geta)!;
      this.tmp.set(pos.x, pos.y + 0.0165, pos.z);
      this.layoutNigiri(this.tmp);
      this.flash(StationKind.Geta, COLOR_DONE);
      this.setStep(NigiriStep.OnGeta);
    } else {
      // Dropped elsewhere: it goes back onto the neta hand.
      this.setStep(NigiriStep.NigiriInHand);
    }
  }

  private updateOnGeta(delta: number): void {
    // Pinching it again takes it back (serving is not confirmed yet).
    const back = this.findHand((h) => h.pinchStart && this.over(h.grasp, StationKind.Geta));
    if (back) {
      this.carrier = back;
      this.holdTime = 0;
      this.gameEntity.setValue(NigiriGame, 'holdProgress', 0);
      this.setStep(NigiriStep.HoldNigiri);
      return;
    }
    const confirming = this.findHand((h) => h.fist && this.over(h.palm, StationKind.Geta));
    this.holdTime = confirming ? this.holdTime + delta : 0;
    const progress = Math.min(1, this.holdTime / SERVE_HOLD_SECONDS);
    this.gameEntity.setValue(NigiriGame, 'holdProgress', progress);
    if (progress >= 1) {
      this.holdTime = 0;
      this.serveTime = 0;
      this.serveFrom.copy(this.rice.position);
      this.flash(StationKind.Geta, COLOR_DONE);
      this.gameEntity.setValue(NigiriGame, 'holdProgress', 0);
      this.setStep(NigiriStep.Serving);
    }
  }

  private updateServing(delta: number): void {
    this.serveTime += delta;
    const t = Math.min(1, this.serveTime / SERVE_ANIM_SECONDS);
    this.tmp.copy(this.serveFrom);
    this.tmp.z -= 0.25 * t;
    this.tmp.y += 0.05 * Math.sin(t * Math.PI);
    this.layoutNigiri(this.tmp);
    const s = 1 - t * t;
    this.rice.scale.set(RICE_SHAPED.x * s, RICE_SHAPED.y * s, RICE_SHAPED.z * s);
    this.tuna.scale.setScalar(Math.max(0.001, s));
    if (t < 1) return;

    this.rice.visible = this.tuna.visible = false;
    this.tuna.scale.setScalar(1);
    this.rice.scale.copy(RICE_LOOSE);
    const served = (this.gameEntity.getValue(NigiriGame, 'served') ?? 0) + 1;
    this.gameEntity.setValue(NigiriGame, 'served', served);
    this.resetPiece();

    // The rice hand needs tezu again; after several pieces, both need washing.
    if (served % PIECES_PER_WASH === 0) {
      this.setHandState(0, HandState.Unwashed);
      this.setHandState(1, HandState.Unwashed);
    } else {
      for (let i = 0; i < 2; i++) {
        if (this.handState[i] === HandState.Wet) this.setHandState(i, HandState.Clean);
      }
    }
    // The neta box is closed again between pieces to keep the fish fresh.
    this.lidOpen = false;
    this.gameEntity.setValue(NigiriGame, 'lidOpen', false);
    this.setStep(NigiriStep.Idle);
  }

  // ---- helpers -----------------------------------------------------------

  private resetPiece(): void {
    this.riceHand = this.netaHand = this.carrier = null;
    this.squeezes = 0;
    this.shaped = false;
    this.flipped = false;
    this.wasabiBlob.visible = false;
    this.setWasabi(WasabiState.None);
    this.gameEntity.setValue(NigiriGame, 'riceHand', Hand.None);
    this.gameEntity.setValue(NigiriGame, 'squeezes', 0);
    this.gameEntity.setValue(NigiriGame, 'shaped', false);
  }

  private setStep(step: Step): void {
    this.gameEntity.setValue(NigiriGame, 'step', step);
    console.log(`[Nigiri] ${step}`);
  }

  private setHandState(i: number, state: HState): void {
    if (this.handState[i] === state) return;
    this.handState[i] = state;
    this.gameEntity.setValue(NigiriGame, HAND_FIELDS[i], state);
    console.log(`[Nigiri] ${HAND_NAMES[i]} hand ${state}`);
  }

  private setWasabi(state: Wasabi): void {
    this.wasabi = state;
    this.gameEntity.setValue(NigiriGame, 'wasabi', state);
  }

  private other(hand: HandReader): HandReader {
    return hand === this.hands[0] ? this.hands[1] : this.hands[0];
  }

  /** True while this hand carries rice, neta or the nigiri. */
  private holding(hand: HandReader): boolean {
    return hand === this.riceHand || hand === this.netaHand || hand === this.carrier;
  }

  private findHand(test: (h: HandReader) => boolean): HandReader | null {
    for (const hand of this.hands) {
      if (hand.tracked && test(hand)) return hand;
    }
    return null;
  }

  /** Cache each station's world surface position (origin + authored height). */
  private refreshStations(): void {
    for (const entity of this.queries.stations.entities) {
      const object = entity.object3D;
      if (!object) continue;
      const kind = entity.getValue(Station, 'kind') as Kind;
      const pos = this.stationPos.get(kind);
      if (!pos) continue;
      object.getWorldPosition(pos);
      pos.y += entity.getValue(Station, 'height') ?? 0;
      this.stationRadius.set(kind, entity.getValue(Station, 'radius') ?? 0.14);
    }
  }

  /** True when a hand point is above the station surface, inside its radius. */
  private over(point: Vector3, kind: Kind): boolean {
    const pos = this.stationPos.get(kind)!;
    const dx = point.x - pos.x;
    const dz = point.z - pos.z;
    const r = this.stationRadius.get(kind)!;
    if (dx * dx + dz * dz > r * r) return false;
    return point.y > pos.y - 0.05 && point.y < pos.y + ZONE_HEIGHT;
  }

  /** Neta slice resting on a palm. */
  private placeNeta(palm: Vector3): void {
    this.tuna.position.copy(palm);
    this.tuna.position.y += NETA_LIFT;
  }

  /** Rice and neta stacked at a point: neta under the rice until flipped. */
  private layoutNigiri(at: Vector3): void {
    if (this.flipped) {
      this.rice.position.copy(at);
      this.rice.position.y += NETA_LIFT;
      this.tuna.position.copy(this.rice.position);
      this.tuna.position.y += LAYER;
    } else {
      this.placeNeta(at);
      this.rice.position.copy(this.tuna.position);
      this.rice.position.y += LAYER;
    }
  }

  private glowRice(): void {
    this.rice.material.emissive.set(COLOR_READY);
    this.rice.material.emissiveIntensity = 0.6;
  }

  private flash(kind: Kind, color: Color): void {
    this.flashKind = kind;
    this.flashColor = color;
    this.flashTime = FLASH_SECONDS;
  }

  private updateLid(delta: number): void {
    const target = this.lidOpen ? 1 : 0;
    const step = delta / LID_ANIM_SECONDS;
    this.lidT = this.lidT < target ? Math.min(target, this.lidT + step) : Math.max(target, this.lidT - step);
    const pos = this.stationPos.get(StationKind.NetaTray)!;
    const t = this.lidT;
    this.lid.position.set(pos.x, pos.y + 0.03 + 0.03 * t, pos.z - 0.17 * t);
  }

  /** Which stations a hand can act on now, for the highlight rings. */
  private computeActive(step: Step): void {
    for (const kind of this.active.keys()) this.active.set(kind, false);
    const [l, r] = this.handState;
    const unwashed = l === HandState.Unwashed || r === HandState.Unwashed;
    const needsWipe = l === HandState.NeedsWipe || r === HandState.NeedsWipe;
    if (unwashed) this.active.set(StationKind.Basin, true);
    if (needsWipe) this.active.set(StationKind.Towel, true);

    switch (step) {
      case NigiriStep.Idle:
        if (unwashed || needsWipe) break;
        if (l === HandState.Wet || r === HandState.Wet) this.active.set(StationKind.RiceTub, true);
        else this.active.set(StationKind.Tezu, true);
        break;
      case NigiriStep.HoldRice:
        if (!needsWipe) this.active.set(StationKind.NetaTray, true);
        break;
      case NigiriStep.HoldBoth:
        if (this.wasabi === WasabiState.None) this.active.set(StationKind.Wasabi, true);
        break;
      case NigiriStep.HoldNigiri:
      case NigiriStep.OnGeta:
        this.active.set(StationKind.Geta, true);
        break;
    }
  }

  private updateFeedback(delta: number): void {
    const step = this.gameEntity.getValue(NigiriGame, 'step') as Step;
    this.computeActive(step);
    this.flashTime = Math.max(0, this.flashTime - delta);

    for (const [kind, ring] of this.rings) {
      const pos = this.stationPos.get(kind)!;
      ring.position.set(pos.x, pos.y + 0.004, pos.z);
      ring.scale.setScalar(this.stationRadius.get(kind)! / 0.12);
      const flashing = this.flashKind === kind && this.flashTime > 0;
      if (flashing) {
        ring.visible = true;
        ring.material.color.copy(this.flashColor);
        ring.material.opacity = this.flashTime / FLASH_SECONDS;
        continue;
      }
      if (!this.active.get(kind)) {
        ring.visible = false;
        continue;
      }
      // Hand over the active station: bright. Otherwise a soft hint.
      const hand = this.findHand((h) => this.over(h.palm, kind) || this.over(h.grasp, kind));
      ring.visible = true;
      ring.material.color.copy(hand ? COLOR_READY : COLOR_IDLE);
      ring.material.opacity = hand ? 0.95 : 0.45;
    }

    // Cleanliness ring under each palm (hidden when clean).
    for (let i = 0; i < 2; i++) {
      const hand = this.hands[i];
      const ring = this.handRings[i];
      const state = this.handState[i];
      if (!hand.tracked || state === HandState.Clean) {
        ring.visible = false;
        continue;
      }
      ring.visible = true;
      ring.position.copy(hand.palm);
      ring.position.y -= 0.015;
      ring.material.color.copy(
        state === HandState.Unwashed ? COLOR_UNWASHED : state === HandState.NeedsWipe ? COLOR_WIPE : COLOR_WET,
      );
    }

    // Rice squeeze glow fades back out.
    const m = this.rice.material;
    if (m.emissiveIntensity > 0) {
      m.emissiveIntensity = Math.max(0, m.emissiveIntensity - delta * 2.5);
    }

    // One progress bar: serving hold, washing, or wiping.
    const serve = this.gameEntity.getValue(NigiriGame, 'holdProgress') ?? 0;
    let barKind: Kind | null = null;
    let progress = 0;
    if (step === NigiriStep.OnGeta && serve > 0) {
      barKind = StationKind.Geta;
      progress = serve;
    } else if (this.washSqueezes > 0) {
      barKind = StationKind.Basin;
      progress = this.washSqueezes / WASH_SQUEEZES;
    } else if (this.wipeSqueezes[0] > 0 || this.wipeSqueezes[1] > 0) {
      barKind = StationKind.Towel;
      progress = Math.max(this.wipeSqueezes[0], this.wipeSqueezes[1]) / WIPE_SQUEEZES;
    }
    if (barKind) {
      const pos = this.stationPos.get(barKind)!;
      this.bar.visible = true;
      this.bar.position.set(pos.x, pos.y + 0.12, pos.z);
      this.bar.scale.x = Math.max(0.01, progress);
    } else {
      this.bar.visible = false;
    }
  }
}
