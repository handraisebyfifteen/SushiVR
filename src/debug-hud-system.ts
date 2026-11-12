import {
  CanvasTexture,
  createSystem,
  DoubleSide,
  type Entity,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
} from '@iwsdk/core';
import { debug, debugLines } from './debug.js';
import { chef, prep, service } from './game-state.js';
import { hands } from './hands.js';
import { HygieneSystem } from './hygiene-system.js';
import { PieceSystem } from './piece-system.js';
import { MENU, NETA } from './menu.js';
import { caseApi } from './neta-case-system.js';
import type { Kind } from './station-system.js';
import { Bar, CaseItem, Station } from './sushi-components.js';
import { TurnSystem } from './turn-system.js';

/** Label text per station kind (English only, shown with ?debug=1). */
/** Every station kind has a label (a new kind without one is a type error, not a "?" in the overlay). */
const STATION_LABELS: Record<Kind, string> = {
  CuttingBoard: 'Cutting board',
  NetaCase: 'Neta case',
  Geta: 'Geta',
  Knife: 'Knife',
  KnifeHolder: 'Knife holder',
  WetCloth: 'Wet cloth',
  Tezu: 'Tezu',
  Wasabi: 'Wasabi',
  RiceTub: 'Rice tub (ohitsu)',
  Sink: 'Sink',
  Whetstone: 'Whetstone',
  Soap: 'Hand soap',
  Towel: 'Hand towel',
  NoriBox: 'Nori',
  Makisu: 'Makisu',
  IceBox: 'Ice box (morning fish)',
  TrashBin: 'Trash bin',
  PaperBox: 'Kitchen paper',
  Phone: 'Telephone',
};
const LABEL_LIFT = 0.1;
const PANEL_REFRESH_SECONDS = 0.2;

/**
 * Text is drawn with the browser's own default font onto a canvas and used as
 * a texture, so the app ships no font file.
 */
function makeLabel(text: string): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 52px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(0.16, 0.03, 1);
  sprite.renderOrder = 900;
  sprite.name = `Label_${text}`;
  return sprite;
}

/**
 * Debug overlay (only with `?debug=1`): a name above every station and saku,
 * and a status panel at the lower left of the view listing the current state,
 * both hands and what they hold. Hidden entirely otherwise.
 */
export class DebugHudSystem extends createSystem({
  stations: { required: [Station] },
  bar: { required: [Bar] },
}) {
  private labels = new Map<Entity, Sprite>();
  private panel!: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private texture!: CanvasTexture;
  private sinceRefresh = 0;
  private lastText = '';

  init(): void {
    if (import.meta.env.DEV) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'd' || e.key === 'D') this.setEnabled(!debug.enabled);
        // Dev shortcut: open the bar with clean hands, skipping the opening wash.
        if (e.key === 'o' || e.key === 'O') {
          for (const h of chef.hands) {
            h.needsWash = h.needsTowel = h.wet = false;
            h.dirt = 0;
          }
          chef.open = true;
          if (prep.active) {
            prep.active = false;
            prep.done = true;
            caseApi.restockAll();
          }
          console.log('[Debug] bar opened by shortcut');
        }
      };
      window.addEventListener('keydown', onKey);
      this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
    }
    // Scene entities may already exist when this system starts, so label
    // the current matches as well as any that qualify later.
    const labelStation = (entity: Entity) =>
      this.addLabel(
        entity,
        STATION_LABELS[entity.getValue(Station, 'kind') as Kind] ?? '?',
        LABEL_LIFT + (entity.getValue(Station, 'height') ?? 0),
      );
    this.cleanupFuncs.push(
      this.queries.stations.subscribe('qualify', labelStation),
    );
    for (const entity of this.queries.stations.entities) labelStation(entity);

    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 300;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.panel = new Mesh(
      new PlaneGeometry(0.34, 0.2),
      new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, side: DoubleSide }),
    );
    this.panel.name = 'DebugPanel';
    this.panel.renderOrder = 950;
    this.panel.position.set(-0.3, -0.22, -0.55);
    this.panel.visible = debug.enabled;
    this.world.camera.add(this.panel);

    const turn = this.world.getSystem(TurnSystem);
    debugLines.push(
      () => {
        const bar = this.queries.bar.entities.values().next().value as Entity | undefined;
        const back = bar?.getValue(Bar, 'facingBack') ? 'washing station' : 'bar';
        return `Facing: ${back}  head yaw ${turn ? turn.yawDeg.toFixed(0) : '?'} deg`;
      },
      () => this.handLine('L', hands.left, 0),
      () => this.handLine('R', hands.right, 1),
      () => {
        const hygiene = this.world.getSystem(HygieneSystem);
        return `Open: ${chef.open ? 'yes' : 'no'}  board dirt ${chef.boardDirt.toFixed(2)}  cloth ${chef.clothDirty ? 'dirty' : 'clean'}  knife ${chef.knifeDirty ? 'dirty' : 'clean'}  rub ${hygiene ? (hygiene.rubProgress * 100).toFixed(0) : 0}%`;
      },
      () => {
        const o = service.order;
        return `Order: ${o ? `${MENU[o.item].name} ${o.wasabi ? 'with' : 'no'} wasabi` : '-'}  customer ${service.customerLeftHanded ? 'left' : 'right'}-handed${service.customerHandKnown ? '' : ' (unknown)'} eaten ${service.eatenByCustomer}`;
      },
      () => this.world.getSystem(PieceSystem)?.describe() ?? '',
      () => {
        // The case: what each hand is about to take and how many are left (case items are too close to label).
        const part = (side: number) => {
          const e = caseApi.hovered[side];
          if (!e) return '-';
          return `${NETA[caseApi.neta(e)].name} ${e.getValue(CaseItem, 'remaining')} left${caseApi.wrongHand[side] ? ' (other hand)' : caseApi.ready[side] ? '' : ' (door shut)'}`;
        };
        return `Case: L ${part(0)}  R ${part(1)}`;
      },
    );
  }

  private handLine(tag: string, h: typeof hands.left, side: 0 | 1): string {
    const s = chef.hands[side];
    const hygiene = s.needsWash ? 'needs wash' : s.needsTowel ? 'needs towel' : s.wet ? 'wet' : 'clean';
    if (!h.tracked) return `${tag}: not tracked  ${hygiene} dirt ${s.dirt.toFixed(1)} holds ${s.holding}`;
    const g = h.fist ? 'fist' : h.pinch ? 'pinch' : 'open';
    return `${tag}: ${g} curl ${h.curl.toFixed(2)} yaw ${h.yawDeg.toFixed(0)}  ${hygiene} dirt ${s.dirt.toFixed(1)} holds ${s.holding}`;
  }

  private addLabel(entity: Entity, text: string, lift: number): void {
    const object = entity.object3D;
    if (!object || this.labels.has(entity)) return;
    const sprite = makeLabel(text);
    sprite.position.y = lift;
    sprite.visible = debug.enabled;
    object.add(sprite);
    this.labels.set(entity, sprite);
  }

  private setEnabled(on: boolean): void {
    debug.enabled = on;
    this.panel.visible = on;
    for (const sprite of this.labels.values()) sprite.visible = on;
    console.log(`[Debug] overlay ${on ? 'on' : 'off'}`);
  }

  update(delta: number): void {
    if (!debug.enabled) return;
    this.sinceRefresh += delta;
    if (this.sinceRefresh < PANEL_REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    const lines = debugLines.map((f) => f());
    const text = lines.join('\n');
    if (text === this.lastText) return;
    this.lastText = text;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = '26px monospace';
    ctx.fillStyle = '#d8ffd8';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, 12, 10 + i * 32));
    this.texture.needsUpdate = true;
  }
}
