import { BoxGeometry, createSystem, type Entity, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import { coach } from './coach.js';
import { COLOR_DONE, COLOR_WARN, feedback, glowObject } from './feedback.js';
import { chef, orderKind, orderTakes, prep, progress, service, wearKnife } from './game-state.js';
import { homePose, type Pose, sideSign, sideX } from './handedness.js';
import { hands, RubTracker } from './hands.js';
import { NETA, type NetaId } from './menu.js';
import { caseApi } from './neta-case-system.js';
import { pieceApi } from './piece-system.js';
import { blockLength } from './scene-assets/lib/neta-look.js';
import { type Kind, overStation, stations } from './station-system.js';
import { CaseItem, Held, StationKind } from './sushi-components.js';
import { BOARD_DIRT_PER_CUT, CUT_STROKE, RUB_WIPE_KNIFE } from './tuning.js';

/** Where a saku's uncut end rests on the board (left of centre); it runs to the right. */
const SAKU_BOARD_LEFT = -0.2;
/** The slice lands this far right of the cut end. */
const SLICE_GAP = 0.06;
/** Half the width of a saku across the board, plus some slack for the blade. */
const SAKU_HALF_DEPTH = 0.025;
/** One slice is cut this far in from the saku's cut end (where the guide line shows). */
const SLICE_THICKNESS = 0.012;
const BLADE_REACH = 0.15;
/** A pinch this close to the saku lying on the board picks it up again. */
const PICK_DISTANCE = 0.1;

/** The knife, for the roll: whether the rice hand holds it and where its blade tip is (world). */
export const knifeApi = {
  held: false,
  blade: new Vector3(),
  /** The cut now wants the blade laid flat (a shave: skin, backbone); otherwise it stands on its edge. */
  flat: false,
};

/**
 * Taking from the neta case, cutting one slice with the yanagiba, and
 * keeping the knife clean.
 *  - The neta hand pinches what glows in the case (the hand must not need
 *    washing). A saku is set on the board; one that does not match the
 *    order glows amber and can be pinched back into the case. A ready-cut
 *    piece (kohada, prawn, shellfish, eel...) goes straight onto the
 *    fingers, so the wrong one is simply not taken.
 *  - The rice hand makes a fist on the knife to hold it; letting go puts it back.
 *  - With the neta hand resting on the saku, draw the blade toward you along
 *    the guide line at the saku's cut end: one slice is cut, the saku is a
 *    slice shorter and goes back to the case.
 *  - Wipe the blade on the wet cloth before putting it down.
 */
export class CuttingSystem extends createSystem({
  items: { required: [CaseItem] },
}) {
  private homes = new Map<Entity, { position: Vector3; quaternion: Quaternion }>();
  private held: Entity | null = null;
  private onBoard: Entity | null = null;
  private knife: Entity | null = null;
  /** Where the knife is put down: beside the board on the knife hand's side (src/handedness.ts). */
  private readonly knifeRest: Pose = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3() };
  private readonly sakuRest: Pose = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3() };
  private knifeHeld = false;
  private guide!: Mesh<BoxGeometry, MeshBasicMaterial>;
  private cutStartZ: number | null = null;
  private wipeRub = new RubTracker();
  private readonly blade = new Vector3();
  /** The saku on the board: its uncut end, its centre and its cut end (world). */
  private readonly sakuPos = new Vector3();
  private readonly sakuMid = new Vector3();
  private sakuEndX = 0;
  private readonly tmp = new Vector3();
  private readonly flat = new Quaternion();

  init(): void {
    this.guide = new Mesh(
      new BoxGeometry(0.006, 0.003, 0.08),
      new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }),
    );
    this.guide.name = 'CutGuide';
    this.guide.visible = false;
    this.world.createTransformEntity(this.guide);
    this.queries.items.subscribe('qualify', (entity) => {
      const object = entity.object3D;
      if (object) this.homes.set(entity, { position: object.position.clone(), quaternion: object.quaternion.clone() });
    });
  }

  update(): void {
    for (const entity of this.queries.items.entities) {
      if (!this.homes.has(entity) && entity.object3D) {
        this.homes.set(entity, { position: entity.object3D.position.clone(), quaternion: entity.object3D.quaternion.clone() });
      }
    }
    const knifeInfo = stations.get(StationKind.Knife);
    if (knifeInfo && !this.knife) this.knife = knifeInfo.entity;
    if (this.onBoard) this.measureSaku(this.onBoard);
    this.updateTake();
    this.updateKnife();
    this.updateHints();
    this.publish();
  }

  /** Share where the saku and knife are, for the master. */
  private publish(): void {
    progress.knifeHeld = this.knifeHeld;
    progress.sakuOnBoard = this.onBoard !== null;
    progress.sakuWrong = this.onBoard !== null && !orderTakes(caseApi.neta(this.onBoard));
    if (this.onBoard) {
      progress.sakuAt.copy(this.sakuMid);
      if (homePose(this.onBoard.object3D!, this.sakuRest)) progress.sakuHome.copy(this.sakuRest.position);
      else {
        const home = this.homes.get(this.onBoard);
        if (home) progress.sakuHome.copy(home.position);
      }
    }
  }

  /**
   * The saku's ends on the board: it lies along +X from its uncut end (-X
   * for a left-handed chef, who cuts at its left end), as long as the
   * slices it has left.
   */
  private measureSaku(saku: Entity): void {
    const object = saku.object3D!;
    object.getWorldPosition(this.sakuPos);
    const body = object.getObjectByName('Body');
    const length = blockLength(caseApi.neta(saku)) * (body ? body.scale.x : 1) * sideSign();
    this.sakuEndX = this.sakuPos.x + length;
    this.sakuMid.set(this.sakuPos.x + length / 2, this.sakuPos.y, this.sakuPos.z);
  }

  /** Taking from the case with the neta hand, carrying a saku, setting it on the board or back. */
  private updateTake(): void {
    const side = chef.netaSide;
    const hand = hands.all[side];
    const state = chef.hands[side];
    // The morning prep fills the case (src/prep-cut-system.ts); nothing is taken from it yet.
    if (prep.active) return;
    // The rice hand reaching for the neta hand's items: say so.
    const rice = hands.all[chef.riceSide];
    if (rice.tracked && rice.pinchStart) {
      const item = caseApi.chosen(chef.riceSide);
      if (item && caseApi.check(chef.riceSide, item) === 'wrongHand') this.wrongHand(item);
    }

    if (!this.held) {
      if (!hand.tracked || !hand.pinchStart || state.holding !== Held.None) return;
      // The saku on the board, picked up again.
      if (this.onBoard && hand.grasp.distanceTo(this.sakuMid) < PICK_DISTANCE && pieceApi.sliceWanted()) {
        this.held = this.onBoard;
        this.onBoard = null;
        state.holding = Held.Saku;
        glowObject(this.held.object3D!, null);
        return;
      }
      const item = caseApi.chosen(side);
      if (!item) return;
      const check = caseApi.check(side, item);
      if (check === 'wrongHand') return this.wrongHand(item);
      if (check === 'shut') return;
      if (state.needsWash) {
        feedback.flash(StationKind.NetaCase, COLOR_WARN);
        coach.mistake('washFirst', StationKind.NetaCase);
        console.log('[Cutting] wash your hand before touching the fish');
        return;
      }
      const neta = caseApi.neta(item);
      const def = NETA[neta];
      if (def.prep === 'piece') return this.takePiece(item, neta);
      if (def.prep === 'age') return this.takeAge(item);
      if (def.prep !== 'saku') return;
      this.held = item;
      state.holding = Held.Saku;
      glowObject(item.object3D!, null);
      return;
    }
    const object = this.held.object3D!;
    if (hand.tracked) object.position.copy(hand.grasp);
    if (!hand.pinchEnd && hand.tracked) return;

    // Let go: into the case or onto the board.
    state.holding = Held.None;
    const neta = caseApi.neta(this.held);
    if (overStation(hand.grasp, StationKind.NetaCase)) {
      if (!orderTakes(neta)) coach.done('returnSaku');
      this.returnHome(this.held);
    } else {
      if (this.onBoard && this.onBoard !== this.held) this.returnHome(this.onBoard);
      const board = stations.get(StationKind.CuttingBoard)!;
      // Lengthwise on the board, cut end toward the knife hand (to the right; a left-handed chef's lies mirrored).
      object.position.set(board.pos.x + sideX(SAKU_BOARD_LEFT), board.pos.y, board.pos.z);
      object.quaternion.copy(this.flat);
      object.scale.x = Math.abs(object.scale.x) * sideSign();
      this.onBoard = this.held;
      this.measureSaku(this.held);
      if (!orderTakes(neta)) {
        glowObject(object, COLOR_WARN);
        feedback.flash(StationKind.CuttingBoard, COLOR_WARN);
        coach.mistake('wrongItem', StationKind.CuttingBoard);
        console.log(`[Cutting] ${neta} is not what was ordered`);
      } else {
        coach.done('takeSaku');
        feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
      }
    }
    this.held = null;
  }

  /** A ready-cut piece straight onto the neta hand's fingers, if it is what was ordered. */
  private takePiece(item: Entity, neta: NetaId): void {
    if (pieceApi.hasNeta()) return;
    if (!orderTakes(neta)) {
      glowObject(item.object3D!, COLOR_WARN);
      feedback.flash(StationKind.NetaCase, COLOR_WARN);
      coach.mistake('wrongItem', StationKind.NetaCase);
      console.log(`[Cutting] ${neta} is not what was ordered`);
      return;
    }
    if (!caseApi.consume(item, NETA[neta].perPiece)) return;
    pieceApi.take(neta);
    coach.done('takeSaku');
    feedback.flash(StationKind.NetaCase, COLOR_DONE);
    console.log(`[Cutting] took a piece of ${neta} (${item.getValue(CaseItem, 'remaining')} left)`);
  }

  /** An inari pouch onto the neta hand, if an inari was ordered. */
  private takeAge(item: Entity): void {
    if (pieceApi.hasNeta()) return;
    if (service.order && orderKind() !== 'inari') {
      glowObject(item.object3D!, COLOR_WARN);
      feedback.flash(StationKind.NetaCase, COLOR_WARN);
      coach.mistake('wrongItem', StationKind.NetaCase);
      console.log('[Cutting] no inari was ordered');
      return;
    }
    if (caseApi.stock(item) < 1 || !pieceApi.takeAge()) return;
    caseApi.consume(item, 1);
    feedback.flash(StationKind.NetaCase, COLOR_DONE);
  }

  private wrongHand(item: Entity | null): void {
    if (item?.object3D) feedback.flash(StationKind.NetaCase, COLOR_WARN);
    coach.mistake('wrongHand', StationKind.NetaCase);
    console.log('[Cutting] the other hand takes that');
  }

  private returnHome(saku: Entity): void {
    const home = this.homes.get(saku);
    const object = saku.object3D!;
    // Its place in the case, for the chef's hand (src/handedness.ts); as first seen, failing that.
    if (homePose(object, this.sakuRest)) {
      object.position.copy(this.sakuRest.position);
      object.quaternion.copy(this.sakuRest.quaternion);
      object.scale.copy(this.sakuRest.scale);
    } else if (home) {
      object.position.copy(home.position);
      object.quaternion.copy(home.quaternion);
      object.scale.x = Math.abs(object.scale.x);
    }
    glowObject(saku.object3D!, null);
    if (this.onBoard === saku) this.onBoard = null;
  }

  private updateKnife(): void {
    knifeApi.held = this.knifeHeld;
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

    // Held: the handle sits in the palm, the blade runs along the fingers, on its edge (laid flat for a shave).
    if (hand.tracked) {
      knifeObject.position.copy(hand.palm);
      knifeObject.rotation.set(knifeApi.flat ? 0 : Math.PI / 2, (hand.yawDeg * Math.PI) / 180 + Math.PI / 2, 0, 'YXZ');
    }
    this.blade.copy(hand.palm).addScaledVector(hand.fingerDir, BLADE_REACH);
    knifeApi.blade.copy(this.blade);

    // Wipe on the wet cloth: any part of the blade passing over it counts.
    const onCloth = this.bladeOver(StationKind.WetCloth, 0.1);
    if (this.wipeRub.update(this.blade, onCloth && chef.knifeDirty) >= RUB_WIPE_KNIFE) {
      chef.knifeDirty = false;
      this.wipeRub.reset();
      feedback.flash(StationKind.WetCloth, COLOR_DONE);
      coach.done('wipeKnife');
      console.log('[Cutting] knife wiped');
    }

    // Cutting: neta hand on the saku, blade drawn toward the chef across its cut end.
    const saku = this.onBoard;
    if (saku && pieceApi.sliceWanted()) {
      const s = sideSign();
      const guideX = s * Math.max(s * this.sakuMid.x, s * (this.sakuEndX - s * SLICE_THICKNESS));
      this.guide.visible = true;
      this.guide.position.set(guideX, this.sakuPos.y + 0.04, this.sakuPos.z);
      const other = hands.all[chef.netaSide];
      const holdingDown =
        other.tracked &&
        Math.hypot(other.palm.x - this.sakuMid.x, other.palm.z - this.sakuMid.z) < 0.13 &&
        other.palm.y < this.sakuPos.y + 0.15;
      const overSaku =
        (this.blade.x - this.sakuPos.x) * s > -0.01 && (this.blade.x - this.sakuEndX) * s < 0.03 &&
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
      if (homePose(knifeObject, this.knifeRest)) {
        knifeObject.position.copy(this.knifeRest.position);
        knifeObject.quaternion.copy(this.knifeRest.quaternion);
        knifeObject.scale.copy(this.knifeRest.scale);
      }
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
    const neta = caseApi.neta(saku);
    // Cutting at the knife hand's end (the guide) leaves the skin edge on the customer's right.
    const skinRight = (hands.all[chef.riceSide].palm.x - this.sakuMid.x) * sideSign() > 0;
    this.tmp.set(this.sakuEndX + sideSign() * SLICE_GAP, this.sakuPos.y, this.sakuPos.z);
    pieceApi.cut(neta, skinRight, this.tmp);
    caseApi.consume(saku, 1);
    this.returnHome(saku);
    chef.knifeDirty = true;
    wearKnife();
    chef.boardDirt = Math.min(1, chef.boardDirt + BOARD_DIRT_PER_CUT);
    this.cutStartZ = null;
    feedback.flash(StationKind.CuttingBoard, COLOR_DONE);
    coach.done('cut');
    console.log(`[Cutting] cut one slice of ${neta}${skinRight ? '' : ' (skin on the wrong side)'}, ${saku.getValue(CaseItem, 'remaining')} left`);
  }

  private updateHints(): void {
    if (!chef.open) return;
    if (this.held) return;
    if (orderKind() === 'nigiri' && !this.onBoard && !pieceApi.hasNeta()) feedback.hints.add(StationKind.NetaCase);
    if (this.onBoard && !this.knifeHeld && pieceApi.sliceWanted()) feedback.hints.add(StationKind.Knife);
    if (this.onBoard && this.knifeHeld && pieceApi.sliceWanted()) feedback.hints.add(StationKind.CuttingBoard);
    if (this.knifeHeld && chef.knifeDirty) feedback.hints.add(StationKind.WetCloth);
  }
}
