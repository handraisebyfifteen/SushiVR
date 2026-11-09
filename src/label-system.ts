import { CanvasTexture, createSystem, type Mesh, MeshStandardMaterial, SRGBColorSpace } from '@iwsdk/core';

/** A label's canvas: wide enough for a word or two at a readable size. */
const W = 256;
const H = 128;

/**
 * Writes the shop's paper labels: any mesh in the scene named `Label:<text>`
 * (the food shelf's seasonings, src/scene-assets/shop-props.scene-asset.ts)
 * gets <text> drawn on it in dark ink on paper, once, after the level has
 * loaded. In English, as all in-game text but the menu board. The assets
 * leave the label blank paper (the editor shows it so); the canvas is drawn
 * here, at runtime, where the page has a DOM.
 */
export class LabelSystem extends createSystem({}) {
  private done = false;
  private waited = 0;

  update(delta: number): void {
    if (this.done) return;
    this.waited += delta;
    const labels: Mesh[] = [];
    this.world.scene.traverse((o) => {
      if (o.name.startsWith('Label:') && (o as Mesh).isMesh) labels.push(o as Mesh);
    });
    // The level's assets come in a moment after the start; give up looking after a while.
    if (!labels.length) {
      if (this.waited > 10) this.done = true;
      return;
    }
    this.done = true;
    for (const mesh of labels) mesh.material = this.paper(mesh.name.slice('Label:'.length));
    console.log(`[Labels] ${labels.length} written`);
  }

  private paper(text: string): MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#F3EDDC';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#8C7B5A';
    g.lineWidth = 4;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.fillStyle = '#2A2118';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 54;
    do {
      g.font = `bold ${size}px "Helvetica Neue", Arial, sans-serif`;
      size -= 2;
    } while (g.measureText(text).width > W - 28 && size > 18);
    g.fillText(text, W / 2, H / 2 + 2);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    return new MeshStandardMaterial({ map, roughness: 0.85 });
  }
}
