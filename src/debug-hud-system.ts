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
import { hands } from './hands.js';
import { Bar, Saku, Station } from './sushi-components.js';
import { TurnSystem } from './turn-system.js';

/** Label text per station kind (English only, shown with ?debug=1). */
const STATION_LABELS: Record<string, string> = {
  CuttingBoard: 'Cutting board',
  NetaCase: 'Neta case',
  Geta: 'Geta',
  Knife: 'Knife',
  WetCloth: 'Wet cloth',
  Tezu: 'Tezu',
  Wasabi: 'Wasabi',
  RiceTub: 'Rice tub (ohitsu)',
  Basin: 'Basin',
  Soap: 'Hand soap',
  Towel: 'Hand towel',
};
const SAKU_LABELS: Record<string, string> = {
  Tuna: 'Tuna',
  White: 'White fish',
  Silver: 'Silver-skinned fish',
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
  saku: { required: [Saku] },
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
      };
      window.addEventListener('keydown', onKey);
      this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
    }
    // Scene entities may already exist when this system starts, so label
    // the current matches as well as any that qualify later.
    const labelStation = (entity: Entity) =>
      this.addLabel(
        entity,
        STATION_LABELS[entity.getValue(Station, 'kind') as string] ?? '?',
        LABEL_LIFT + (entity.getValue(Station, 'height') ?? 0),
      );
    const labelSaku = (entity: Entity) =>
      this.addLabel(entity, SAKU_LABELS[entity.getValue(Saku, 'fish') as string] ?? '?', 0.07);
    this.cleanupFuncs.push(
      this.queries.stations.subscribe('qualify', labelStation),
      this.queries.saku.subscribe('qualify', labelSaku),
    );
    for (const entity of this.queries.stations.entities) labelStation(entity);
    for (const entity of this.queries.saku.entities) labelSaku(entity);

    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 200;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.panel = new Mesh(
      new PlaneGeometry(0.24, 0.094),
      new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, side: DoubleSide }),
    );
    this.panel.name = 'DebugPanel';
    this.panel.renderOrder = 950;
    this.panel.position.set(-0.3, -0.2, -0.55);
    this.panel.visible = debug.enabled;
    this.world.camera.add(this.panel);

    const turn = this.world.getSystem(TurnSystem);
    debugLines.push(
      () => {
        const bar = this.queries.bar.entities.values().next().value as Entity | undefined;
        const back = bar?.getValue(Bar, 'facingBack') ? 'washing station' : 'bar';
        return `Facing: ${back}  head yaw ${turn ? turn.yawDeg.toFixed(0) : '?'} deg`;
      },
      () => this.handLine('L', hands.left),
      () => this.handLine('R', hands.right),
    );
  }

  private handLine(tag: string, h: typeof hands.left): string {
    if (!h.tracked) return `${tag}: not tracked`;
    const g = h.fist ? 'fist' : h.pinch ? 'pinch' : 'open';
    return `${tag}: ${g}  curl ${h.curl.toFixed(2)}`;
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
    ctx.font = '28px monospace';
    ctx.fillStyle = '#d8ffd8';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, 12, 12 + i * 34));
    this.texture.needsUpdate = true;
  }
}
