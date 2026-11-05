import { BoxGeometry, createSystem, type Entity, Mesh, MeshBasicMaterial, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { COLOR_DONE, COLOR_WARN, feedback, glowObject } from './feedback.js';
import { chef, type FishKind, progress, service } from './game-state.js';
import { hands, RubTracker } from './hands.js';
import { pieceApi } from './nigiri-system.js';
import { type Kind, overStation, stations } from './station-system.js';
import { Held, Saku, StationKind } from './sushi-components.js';
import { BOARD_DIRT_PER_CUT, CUT_STROKE, RUB_WIPE_KNIFE } from './tuning.js';

/** Where a saku rests on the board (left of center) and the slice lands (to its right). */
const SAKU_BOARD_X = -0.12;
const SLICE_OFFSET_X = 0.17;
const SAKU_HALF_LENGTH = 0.11;
const SAKU_HALF_DEPTH = 0.04;
/** Guide line sits at this x offset from the saku center (its right end). */
const GUIDE_X = 0.075;
const BLADE_REACH = 0.15;
const PICK_DISTANCE = 0.12;

/**
 * Taking a saku from the case, cutting one slice with the yanagiba, and
 * keeping the knife clean.
 *  - Neta hand pinches a saku in the case (hand must not need washing) and
 *    sets it on the board; a saku that does not match the order glows amber
 *    and can be pinched back into the case.
 *  - Rice hand makes a fist on the knife to hold it; letting go puts it back.
 *  - With the neta hand resting on the saku, draw the blade toward you along
 *    the guide line: one slice is cut, the saku returns to the case.
 *  - Wipe the blade on the wet cloth before putting it down.
 */
export class CuttingSystem extends createSystem({
  saku: { required: [Saku] },
}) {
  private homes = new Map<Entity, Vector3>();
  private held: Entity | null = null;
  private onBoard: Entity | null = null;
  private knife: Entity | null = null;
  private knifeHome = new Vector3();
  private knifeHomeRotY = 0;
  private knifeHeld = false;
  private guide!: Mesh<BoxGeometry, MeshBasicMaterial>;
  private cutStartZ: number | null = null;
  private wipeRub = new RubTracker();
  private readonly blade = new Vector3();
  private readonly sakuPos = new Vector3();
  private readonly tmp = new Vector3();

  init(): void {
    this.guide = new Mesh(
      new BoxGeometry(0.006, 0.003, 0.11),
      new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }),
    );
    this.guide.name = 'CutGuide';
    this.guide.visible = false;
    this.world.createTransformEntity(this.guide);
  }

  update(): void {
    for (const entity of this.queries.saku.entities) {
      if (!this.homes.has(entity) && entity.object3D) {
        this.homes.set(entity, entity.object3D.position.clone());
      }
    }
    const knifeInfo = stations.get(StationKind.Knife);
    if (knifeInfo && !this.knife) {
      this.knife = knifeInfo.entity;
      this.knife.object3D!.getWorldPosition(this.knifeHome);
      this.knifeHomeRotY = this.knife.object3D!.rotation.y;
    }
    this.updateSaku();
    this.updateKnife();
    this.updateHints();
    this.publish();
  }

  /** Share where the saku and knife are, for the master. */
  private publish(): void {
    progress.knifeHeld = this.knifeHeld;
    progress.sakuOnBoard = this.onBoard !== null;
    progress.sakuWrong =
      this.onBoard !== null && !!service.order && service.order.fish !== this.sakuFish(this.onBoard);
    if (this.onBoard) {
      this.onBoard.object3D!.getWorldPosition(progress.sakuAt);
      const home = this.homes.get(this.onBoard);
      if (home) progress.sakuHome.copy(home);
    }
  }

  private sakuFish(entity: Entity): FishKind {
    return entity.getValue(Saku, 'fish') as FishKind;
  }

  private nearestSaku(point: Vector3): Entity | null {
    let best: Entity | null = null;
    let bestD = PICK_DISTANCE;
    for (const entity of this.queries.saku.entities) {
      const object = entity.object3D;
      if (!object) continue;
      object.getWorldPosition(this.tmp);
      const d = this.tmp.distanceTo(point);
      if (d < bestD) {
        bestD = d;
        best = entity;
      }
    }
    return best;
  }

  private updateSaku(): void {
    const side = chef.netaSide;
    const hand = hands.all[side];
    const state = chef.hands[side];
    if (!this.held) {
      if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None) return;
      const saku = this.nearestSaku(hand.grasp);
      if (!saku) return;
      if (state.needsWash) {
        feedback.flash(StationKind.NetaCase, COLOR_WARN);
        coach.mistake('washFirst', StationKind.NetaCase);
        console.log('[Cutting] wash your hand before touching the fish');
        return;
      }
      this.held = saku;
      state.holding = Held.Saku;
      glowObject(saku.object3D!, null);
      if (this.onBoard === saku) this.onBoard = null;
      return;
    }
    const object = this.held.object3D!;
    if (hand.tracked) object.position.copy(hand.grasp);
    if (!hand.pinchEnd && hand.tracked) return;

    // Let go: into the case or onto the board.
    state.holding = Held.None;
    if (overStation(hand.grasp, StationKind.NetaCase)) {
      const fish = this.sakuFish(this.held);
      if (service.order && service.order.fish !== fish) coach.done('returnSaku');
      this.returnHome(this.held);
    } else {
      if (this.onBoard && this.onBoard !== this.held) this.returnHome(this.onBoard);
      const board = stations.get(StationKind.CuttingBoard)!;
      object.position.set(board.pos.x + SAKU_BOARD_X, board.pos.y, board.pos.z);
      this.onBoard = this.held;
      const fish = this.sakuFish(this.held);
      if (service.order && service.order.fish !== fish) {
        glowObject(object, COLOR_WARN);
        feedback.flash(StationKind.CuttingBoard, COLOR_WARN);
        coach.mistake('wrongFish', StationKind.CuttingBoard);
        console.log(`[Cutting] ${fish} is not what was ordered`);
      } else {
        coach.done('takeSaku');
        feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
      }
    }
    this.held = null;
  }

  private returnHome(saku: Entity): void {
    const home = this.homes.get(saku);
    if (home) saku.object3D!.position.copy(home);
    glowObject(saku.object3D!, null);
    if (this.onBoard === saku) this.onBoard = null;
  }

  private updateKnife(): void {
    if (!this.knife) return;
    const side = chef.riceSide;
    const hand = hands.all[side];
    const state = chef.hands[side];
    const knifeObject = this.knife.object3D!;

    if (!this.knifeHeld) {
      this.guide.visible = false;
      if (hand.tracked && hand.fistStart && state.holding === Held.None && overStation(hand.palm, StationKind.Knife)) {
        this.knifeHeld = true;
        state.holding = Held.Knife;
        this.cutStartZ = null;
        coach.done('holdKnife');
        console.log('[Cutting] knife in hand');
      }
      return;
    }

    // Held: the handle sits in the palm, the blade runs along the fingers.
    if (hand.tracked) {
      knifeObject.position.copy(hand.palm);
      knifeObject.rotation.y = (hand.yawDeg * Math.PI) / 180 + Math.PI / 2;
    }
    this.blade.copy(hand.palm).addScaledVector(hand.fingerDir, BLADE_REACH);

    // Wipe on the wet cloth: any part of the blade passing over it counts.
    const onCloth = this.bladeOver(StationKind.WetCloth, 0.1);
    if (this.wipeRub.update(this.blade, onCloth && chef.knifeDirty) >= RUB_WIPE_KNIFE) {
      chef.knifeDirty = false;
      this.wipeRub.reset();
      feedback.flash(StationKind.WetCloth, COLOR_DONE);
      coach.done('wipeKnife');
      console.log('[Cutting] knife wiped');
    }

    // Cutting: neta hand on the saku, blade drawn toward the chef over it.
    const saku = this.onBoard;
    if (saku && !pieceApi.hasNeta()) {
      saku.object3D!.getWorldPosition(this.sakuPos);
      this.guide.visible = true;
      this.guide.position.set(this.sakuPos.x + GUIDE_X, this.sakuPos.y + 0.045, this.sakuPos.z);
      const other = hands.all[chef.netaSide];
      const holdingDown =
        other.tracked &&
        Math.hypot(other.palm.x - this.sakuPos.x, other.palm.z - this.sakuPos.z) < 0.13 &&
        other.palm.y < this.sakuPos.y + 0.15;
      const overSaku =
        Math.abs(this.blade.x - this.sakuPos.x) < SAKU_HALF_LENGTH &&
        Math.abs(this.blade.z - this.sakuPos.z) < SAKU_HALF_DEPTH + CUT_STROKE + 0.04 &&
        this.blade.y < this.sakuPos.y + 0.1;
      if (holdingDown && overSaku) {
        if (this.cutStartZ === null) this.cutStartZ = this.blade.z;
        if (this.blade.z - this.cutStartZ >= CUT_STROKE) this.cut(saku);
      } else {
        this.cutStartZ = null;
      }
    } else {
      this.guide.visible = false;
    }

    if (hand.fistEnd || !hand.tracked) {
      // Put down: back to its place beside the board.
      knifeObject.position.copy(this.knifeHome);
      knifeObject.rotation.y = this.knifeHomeRotY;
      this.knifeHeld = false;
      state.holding = Held.None;
      this.guide.visible = false;
      if (chef.knifeDirty) {
        chef.knifeUnwiped = true;
        feedback.flash(StationKind.Knife, COLOR_WARN);
        coach.mistake('knifeUnwiped', StationKind.Knife);
        console.log('[Cutting] knife put down without wiping');
      } else if (pieceApi.hasNeta()) {
        coach.done('putKnife');
      }
    }
  }

  /** True when the blade segment (palm to tip) passes within `radius` of the station, at blade height. */
  private bladeOver(kind: Kind, radius: number): boolean {
    const info = stations.get(kind);
    if (!info) return false;
    const hand = hands.all[chef.riceSide];
    const ax = hand.palm.x, az = hand.palm.z;
    const bx = this.blade.x, bz = this.blade.z;
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((info.pos.x - ax) * dx + (info.pos.z - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t - info.pos.x;
    const cz = az + dz * t - info.pos.z;
    const y = hand.palm.y;
    return cx * cx + cz * cz < radius * radius && y > info.pos.y - 0.05 && y < info.pos.y + 0.2;
  }

  private cut(saku: Entity): void {
    const fish = this.sakuFish(saku);
    // Cutting at the right end (the guide) leaves the skin edge on the customer's right.
    const skinRight = hands.all[chef.riceSide].palm.x > this.sakuPos.x;
    this.tmp.set(this.sakuPos.x + SLICE_OFFSET_X, this.sakuPos.y, this.sakuPos.z);
    pieceApi.cut(fish, skinRight, this.tmp);
    this.returnHome(saku);
    chef.knifeDirty = true;
    chef.boardDirt = Math.min(1, chef.boardDirt + BOARD_DIRT_PER_CUT);
    this.cutStartZ = null;
    feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
    coach.done('cut');
    console.log(`[Cutting] cut one slice of ${fish}${skinRight ? '' : ' (skin on the wrong side)'}`);
  }

  private updateHints(): void {
    if (!chef.open) return;
    if (this.held) return;
    if (service.order && !this.onBoard && !pieceApi.hasNeta()) feedback.hints.add(StationKind.NetaCase);
    if (this.onBoard && !this.knifeHeld && !pieceApi.hasNeta()) feedback.hints.add(StationKind.Knife);
    if (this.onBoard && this.knifeHeld && !pieceApi.hasNeta()) feedback.hints.add(StationKind.CuttingBoard);
    if (this.knifeHeld && chef.knifeDirty) feedback.hints.add(StationKind.WetCloth);
  }
}
