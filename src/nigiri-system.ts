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
import { NigiriGame, NigiriStep, Station, StationKind } from './sushi-components.js';

type Step = (typeof NigiriStep)[keyof typeof NigiriStep];
type Kind = (typeof StationKind)[keyof typeof StationKind];

/** Squeezes needed before the rice counts as shaped. */
const SQUEEZES_TO_SHAPE = 3;
/** Seconds a fist must be held over the geta to confirm serving. */
const SERVE_HOLD_SECONDS = 1.0;
/** Seconds the served sushi slides away before the loop resets. */
const SERVE_ANIM_SECONDS = 0.6;
/** Vertical band (m) above a station surface in which a hand counts as over it. */
const ZONE_HEIGHT = 0.3;

const RICE_LOOSE = new Vector3(1, 1, 1);
const RICE_SHAPED = new Vector3(1.25, 0.55, 0.75);
const TUNA_OFFSET = 0.02;

const COLOR_IDLE = new Color('#8fd3ff');
const COLOR_READY = new Color('#ffffff');
const COLOR_DONE = new Color('#7CFC8C');

/**
 * The nigiri workflow, driven by hand tracking only:
 *   fist in the rice tub -> rice in palm -> squeeze (fist) x3 to shape ->
 *   open hand over the board -> pinch tuna from the tray -> release it on the
 *   rice -> pinch the nigiri -> release on the geta -> hold a fist over the
 *   geta to serve. Highlight rings show where the hand can act.
 */
export class NigiriSystem extends createSystem({
  stations: { required: [Station] },
  game: { required: [NigiriGame] },
}) {
  private hands!: [HandReader, HandReader];
  private rice!: Mesh<SphereGeometry, MeshStandardMaterial>;
  private tuna!: Mesh<BoxGeometry, MeshStandardMaterial>;
  private bar!: Mesh<BoxGeometry, MeshBasicMaterial>;
  private rings!: Map<Kind, Mesh<RingGeometry, MeshBasicMaterial>>;
  private gameEntity!: Entity;
  private stationPos = new Map<Kind, Vector3>();
  private holder: HandReader | null = null;
  private squeezes = 0;
  private shaped = false;
  private holdTime = 0;
  private flashTime = 0;
  private flashKind: Kind | null = null;
  private serveTime = 0;
  private readonly tmp = new Vector3();
  private readonly serveFrom = new Vector3();

  init(): void {
    const xr = this.input.xr;
    this.hands = [new HandReader('left', xr), new HandReader('right', xr)];

    const riceMat = new MeshStandardMaterial({ color: '#F6F2EA', roughness: 0.9 });
    this.rice = new Mesh(new SphereGeometry(0.03, 16, 12), riceMat);
    this.rice.name = 'Shari';
    this.rice.visible = false;
    this.world.createTransformEntity(this.rice);

    const tunaMat = new MeshStandardMaterial({ color: '#C8333A', roughness: 0.5 });
    this.tuna = new Mesh(new BoxGeometry(0.075, 0.012, 0.04), tunaMat);
    this.tuna.name = 'Tuna';
    this.tuna.visible = false;
    this.world.createTransformEntity(this.tuna);

    this.bar = new Mesh(
      new BoxGeometry(0.2, 0.012, 0.012),
      new MeshBasicMaterial({ color: COLOR_DONE }),
    );
    this.bar.name = 'ServeProgress';
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
    }

    this.gameEntity = this.world.createTransformEntity();
    this.gameEntity.object3D!.name = 'NigiriGame';
    this.gameEntity.addComponent(NigiriGame, {});
  }

  update(delta: number): void {
    this.refreshStations();
    for (const hand of this.hands) hand.update();

    const step = this.gameEntity.getValue(NigiriGame, 'step') as Step;
    switch (step) {
      case NigiriStep.Idle:
        this.updateIdle();
        break;
      case NigiriStep.HoldRice:
        this.updateHoldRice();
        break;
      case NigiriStep.RiceOnBoard:
        this.updateRiceOnBoard();
        break;
      case NigiriStep.HoldNeta:
        this.updateHoldNeta();
        break;
      case NigiriStep.NigiriOnBoard:
        this.updateNigiriOnBoard();
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
    this.updateFeedback(delta);
  }

  // ---- steps -------------------------------------------------------------

  private updateIdle(): void {
    const hand = this.findHand((h) => h.fistStart && this.over(h.palm, StationKind.RiceTub));
    if (!hand) return;
    this.holder = hand;
    this.squeezes = 0;
    this.shaped = false;
    this.rice.scale.copy(RICE_LOOSE);
    this.rice.visible = true;
    this.setStep(NigiriStep.HoldRice);
  }

  private updateHoldRice(): void {
    const hand = this.holder!;
    if (hand.tracked) this.rice.position.copy(hand.palm);
    if (hand.fistStart) {
      this.squeezes = Math.min(SQUEEZES_TO_SHAPE, this.squeezes + 1);
      this.gameEntity.setValue(NigiriGame, 'squeezes', this.squeezes);
      const t = this.squeezes / SQUEEZES_TO_SHAPE;
      this.rice.scale.lerpVectors(RICE_LOOSE, RICE_SHAPED, t);
      this.rice.material.emissive.set(COLOR_READY);
      this.rice.material.emissiveIntensity = 0.6;
      if (this.squeezes >= SQUEEZES_TO_SHAPE && !this.shaped) {
        this.shaped = true;
        this.gameEntity.setValue(NigiriGame, 'shaped', true);
      }
    }
    // Open hand over the board places the shaped rice.
    if (this.shaped && !hand.fist && hand.curl < 0.3 && this.over(hand.palm, StationKind.CuttingBoard)) {
      this.placeOnStation(this.rice, StationKind.CuttingBoard, 0.0165);
      this.holder = null;
      this.flash(StationKind.CuttingBoard);
      this.setStep(NigiriStep.RiceOnBoard);
    }
  }

  private updateRiceOnBoard(): void {
    const hand = this.findHand((h) => h.pinchStart && this.over(h.grasp, StationKind.NetaTray));
    if (!hand) return;
    this.holder = hand;
    this.tuna.visible = true;
    this.tuna.position.copy(hand.grasp);
    this.setStep(NigiriStep.HoldNeta);
  }

  private updateHoldNeta(): void {
    const hand = this.holder!;
    if (hand.tracked) this.tuna.position.copy(hand.grasp);
    if (!hand.pinchEnd) return;
    this.holder = null;
    if (this.over(hand.grasp, StationKind.CuttingBoard)) {
      this.tuna.position.copy(this.rice.position);
      this.tuna.position.y += TUNA_OFFSET;
      this.flash(StationKind.CuttingBoard);
      this.setStep(NigiriStep.NigiriOnBoard);
    } else {
      this.tuna.visible = false; // dropped: back to the tray
      this.setStep(NigiriStep.RiceOnBoard);
    }
  }

  private updateNigiriOnBoard(): void {
    const hand = this.findHand((h) => h.pinchStart && this.over(h.grasp, StationKind.CuttingBoard));
    if (!hand) return;
    this.holder = hand;
    this.setStep(NigiriStep.HoldNigiri);
  }

  private updateHoldNigiri(): void {
    const hand = this.holder!;
    if (hand.tracked) this.moveNigiri(hand.grasp);
    if (!hand.pinchEnd) return;
    this.holder = null;
    if (this.over(hand.grasp, StationKind.Geta)) {
      this.placeOnStation(this.rice, StationKind.Geta, 0.0165);
      this.moveNigiri(this.rice.position);
      this.flash(StationKind.Geta);
      this.setStep(NigiriStep.OnGeta);
    } else {
      this.placeOnStation(this.rice, StationKind.CuttingBoard, 0.0165);
      this.moveNigiri(this.rice.position);
      this.setStep(NigiriStep.NigiriOnBoard);
    }
  }

  private updateOnGeta(delta: number): void {
    // Pinching it again takes it back (serving is not confirmed yet).
    const back = this.findHand((h) => h.pinchStart && this.over(h.grasp, StationKind.Geta));
    if (back) {
      this.holder = back;
      this.holdTime = 0;
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
      this.flash(StationKind.Geta);
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
    this.moveNigiri(this.tmp);
    const s = 1 - t * t;
    this.rice.scale.set(RICE_SHAPED.x * s, RICE_SHAPED.y * s, RICE_SHAPED.z * s);
    this.tuna.scale.setScalar(Math.max(0.001, s));
    if (t >= 1) {
      this.rice.visible = this.tuna.visible = false;
      this.tuna.scale.setScalar(1);
      this.squeezes = 0;
      this.shaped = false;
      const served = (this.gameEntity.getValue(NigiriGame, 'served') ?? 0) + 1;
      this.gameEntity.setValue(NigiriGame, 'served', served);
      this.gameEntity.setValue(NigiriGame, 'squeezes', 0);
      this.gameEntity.setValue(NigiriGame, 'shaped', false);
      this.setStep(NigiriStep.Idle);
    }
  }

  // ---- helpers -----------------------------------------------------------

  private setStep(step: Step): void {
    this.gameEntity.setValue(NigiriGame, 'step', step);
    console.log(`[Nigiri] ${step}`);
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
    }
  }

  private stationRadius(kind: Kind): number {
    for (const entity of this.queries.stations.entities) {
      if (entity.getValue(Station, 'kind') === kind) {
        return entity.getValue(Station, 'radius') ?? 0.14;
      }
    }
    return 0.14;
  }

  /** True when a hand point is above the station surface, inside its radius. */
  private over(point: Vector3, kind: Kind): boolean {
    const pos = this.stationPos.get(kind)!;
    const dx = point.x - pos.x;
    const dz = point.z - pos.z;
    const r = this.stationRadius(kind);
    if (dx * dx + dz * dz > r * r) return false;
    return point.y > pos.y - 0.05 && point.y < pos.y + ZONE_HEIGHT;
  }

  private placeOnStation(mesh: Mesh, kind: Kind, lift: number): void {
    const pos = this.stationPos.get(kind)!;
    mesh.position.set(pos.x, pos.y + lift, pos.z);
  }

  private moveNigiri(position: Vector3): void {
    this.rice.position.copy(position);
    this.tuna.position.copy(position);
    this.tuna.position.y += TUNA_OFFSET;
  }

  private flash(kind: Kind): void {
    this.flashKind = kind;
    this.flashTime = 0.35;
  }

  /** Which station the current step can act on, for the highlight rings. */
  private activeStation(step: Step): Kind | null {
    switch (step) {
      case NigiriStep.Idle:
        return StationKind.RiceTub;
      case NigiriStep.HoldRice:
        return this.shaped ? StationKind.CuttingBoard : null;
      case NigiriStep.RiceOnBoard:
        return StationKind.NetaTray;
      case NigiriStep.HoldNeta:
      case NigiriStep.HoldNigiri:
        return step === NigiriStep.HoldNeta ? StationKind.CuttingBoard : StationKind.Geta;
      case NigiriStep.NigiriOnBoard:
        return StationKind.CuttingBoard;
      case NigiriStep.OnGeta:
        return StationKind.Geta;
      default:
        return null;
    }
  }

  private updateFeedback(delta: number): void {
    const step = this.gameEntity.getValue(NigiriGame, 'step') as Step;
    const active = this.activeStation(step);
    this.flashTime = Math.max(0, this.flashTime - delta);

    for (const [kind, ring] of this.rings) {
      const pos = this.stationPos.get(kind)!;
      ring.position.set(pos.x, pos.y + 0.004, pos.z);
      const r = this.stationRadius(kind);
      ring.scale.setScalar(r / 0.12);
      const flashing = this.flashKind === kind && this.flashTime > 0;
      if (flashing) {
        ring.visible = true;
        ring.material.color.copy(COLOR_DONE);
        ring.material.opacity = this.flashTime / 0.35;
        continue;
      }
      if (kind !== active) {
        ring.visible = false;
        continue;
      }
      // Hand over the active station: bright. Otherwise a soft hint.
      const hand = this.findHand((h) => this.over(h.palm, kind) || this.over(h.grasp, kind));
      ring.visible = true;
      ring.material.color.copy(hand ? COLOR_READY : COLOR_IDLE);
      ring.material.opacity = hand ? 0.95 : 0.45;
    }

    // Rice squeeze glow fades back out.
    const m = this.rice.material;
    if (m.emissiveIntensity > 0) {
      m.emissiveIntensity = Math.max(0, m.emissiveIntensity - delta * 2.5);
    }

    // Serve progress bar above the geta while a fist is held there.
    const progress = this.gameEntity.getValue(NigiriGame, 'holdProgress') ?? 0;
    if (step === NigiriStep.OnGeta && progress > 0) {
      const pos = this.stationPos.get(StationKind.Geta)!;
      this.bar.visible = true;
      this.bar.position.set(pos.x, pos.y + 0.12, pos.z);
      this.bar.scale.x = Math.max(0.01, progress);
    } else {
      this.bar.visible = false;
    }
  }
}
