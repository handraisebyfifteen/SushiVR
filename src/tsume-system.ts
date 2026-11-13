import { BoxGeometry, CircleGeometry, createSystem, CylinderGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, Vector2, Vector3 } from '@iwsdk/core';
import { chef, type Side, tsume } from './game-state.js';
import { hands } from './hands.js';
import { onHandsChanged, sideX } from './handedness.js';
import { MANAITA_Z, WORK_COUNTER_TOP } from './layout.js';
import { tsumeApi } from './prep-api.js';
import { playPick, playPut } from './sfx.js';
import { Held } from './sushi-components.js';

/** The pot on the counter right of the board (seen by a right-handed chef), at the back, clear of the knife box and the cloth. */
const POT_X = 0.57;
const POT_Z = MANAITA_Z - 0.1;
const POT_RADIUS = 0.038;
const POT_HEIGHT = 0.065;
/** The tsume's surface in the pot, and where the brush's tip rests in it. */
const TSUME_Y = 0.05;
/** The brush: bristles, ferrule and handle along its +Y from the tip; it leans this far toward the chef. */
const BRISTLES = 0.035;
const HANDLE = 0.13;
const LEAN = 0.42;
/** Its grip, up the handle from the tip, and how near a pinch must come to take it. */
const GRIP = 0.13;
const PICK = 0.06;
const SIDES: readonly Side[] = [0, 1];

/**
 * The tsume (煮ツメ) in its small pot, the brush (刷毛) standing in it: on
 * the counter beside the board, in the prep and in service. A pinch by the
 * handle takes the brush (loaded: it rests in the tsume); let go, it goes
 * back into its pot. What it is stroked over is for the others to judge:
 * the hamaguri on the board in the prep (src/prep-cut-system.ts), the anago
 * and hamaguri nigiri in service (src/piece-system.ts).
 */
export class TsumeSystem extends createSystem({}) {
  private readonly pot = new Group();
  private readonly brush = new Group();
  private readonly home = new Vector3();
  private readonly offset = new Vector3();
  private readonly tmp = new Vector3();
  private readonly pinchAt = new Vector3();

  init(): void {
    const glaze = new MeshStandardMaterial({ color: '#3B2416', roughness: 0.35 });
    const R = POT_RADIUS;
    const H = POT_HEIGHT;
    const wall = [[0.001, 0], [R - 0.006, 0], [R, 0.01], [R, H - 0.006], [R - 0.004, H], [R - 0.008, H], [R - 0.006, H - 0.008], [R - 0.006, 0.008], [0.001, 0.008]].map(
      ([r, y]) => new Vector2(r, y),
    );
    const body = new Mesh(new LatheGeometry(wall, 24), glaze);
    body.name = 'TsumePot';
    const sauce = new Mesh(new CircleGeometry(R - 0.006, 20).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: '#2A1408', roughness: 0.12 }));
    sauce.position.y = TSUME_Y;
    sauce.name = 'Tsume';
    this.pot.add(body, sauce);
    this.pot.name = 'TsumePotGroup';
    // The brush, its tip at the origin: dark bristles soaked in tsume, a brass ferrule, a pale wooden handle.
    const bristles = new Mesh(new BoxGeometry(0.024, BRISTLES, 0.007).translate(0, BRISTLES / 2, 0), new MeshStandardMaterial({ color: '#3A2210', roughness: 0.3 }));
    const ferrule = new Mesh(new BoxGeometry(0.026, 0.012, 0.009).translate(0, BRISTLES + 0.006, 0), new MeshStandardMaterial({ color: '#B08A4A', roughness: 0.35, metalness: 0.6 }));
    const handle = new Mesh(new CylinderGeometry(0.0045, 0.006, HANDLE, 8).translate(0, BRISTLES + 0.012 + HANDLE / 2, 0), new MeshStandardMaterial({ color: '#D8C29A', roughness: 0.6 }));
    this.brush.add(bristles, ferrule, handle);
    this.brush.name = 'TsumeBrush';
    // Leaning out of the pot toward the chef, its handle within reach.
    this.brush.rotation.x = LEAN;
    this.world.createTransformEntity(this.pot);
    this.world.createTransformEntity(this.brush);
    this.place();
    this.cleanupFuncs.push(onHandsChanged(() => this.place()));
    tsumeApi.brushIn = (side) => tsume.held === side;
    tsumeApi.tipAt = (side, out) => {
      if (tsume.held !== side) return false;
      out.copy(this.brush.position);
      return true;
    };
  }

  /** At home: the pot on the counter (on the chef's own side), the brush in it. */
  private place(): void {
    this.pot.position.set(sideX(POT_X), WORK_COUNTER_TOP, POT_Z);
    tsume.potAt.copy(this.pot.position).add(this.tmp.set(0, TSUME_Y, 0));
    this.home.copy(tsume.potAt).add(this.tmp.set(0, -0.012, 0));
    if (tsume.held < 0) this.brush.position.copy(this.home);
    this.gripOf(tsume.gripAt);
  }

  /** The grip (world), up the handle from the tip. */
  private gripOf(out: Vector3): Vector3 {
    return out.set(0, GRIP, 0).applyQuaternion(this.brush.quaternion).add(this.brush.position);
  }

  update(): void {
    const side = tsume.held;
    if (side !== -1) {
      const hand = hands.all[side];
      if (hand.tracked) this.brush.position.copy(hand.grasp).add(this.offset);
      this.gripOf(tsume.gripAt);
      if (hand.tracked && !hand.pinchEnd) return;
      // Let go anywhere: back into its pot.
      tsume.held = -1;
      chef.hands[side].holding = Held.None;
      this.brush.position.copy(this.home);
      this.gripOf(tsume.gripAt);
      playPut();
      console.log('[Tsume] the brush is back in the pot');
      return;
    }
    for (const s of SIDES) {
      const hand = hands.all[s];
      if (!hand.tracked || !hand.pinchStart || chef.hands[s].holding !== Held.None) continue;
      if (hand.pinchPoint(this.pinchAt).distanceTo(tsume.gripAt) > PICK) continue;
      tsume.held = s;
      chef.hands[s].holding = Held.Brush;
      // Held at its grip: it hangs from the pinch as it stood.
      this.offset.copy(this.brush.position).sub(tsume.gripAt);
      playPick();
      console.log(`[Tsume] the brush in the ${s === 0 ? 'left' : 'right'} hand`);
      return;
    }
  }
}
