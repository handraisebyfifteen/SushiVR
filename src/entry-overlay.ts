/**
 * The way in. An HTML layer over the 3D view (not part of the VR scene):
 *
 * - Where the browser can start a VR session (the Meta Quest browser, or the
 *   desktop emulator in development): an "Enter VR" button at the bottom of
 *   the page. The Quest browser also offers its own button (the world's XR
 *   offer in iwsdk.config.json); this one is there in case that offer is not
 *   shown or is dismissed, and after leaving VR. It hides while in VR.
 * - Anywhere else (a PC or phone browser): a card saying this is played in a
 *   VR headset, with the page's address in large type and a QR code for it.
 *   The card can be closed to look at the shop on the flat screen.
 */
import { VisibilityState, type World } from '@iwsdk/core';

/** The public address shown on the card and in its QR code. */
const SITE = 'sushi-vr.vercel.app';

/**
 * The QR code for https://sushi-vr.vercel.app (version 3, 29 x 29 modules,
 * error correction M), one row per string, as hex digits: bit 1 = a dark
 * module, the leftmost module in the highest bit, 3 padding bits at the end.
 * Generated once with the `qrcode` npm package (1.5.4) and checked by
 * decoding a screenshot of the card; regenerate it if the address changes.
 */
const QR_ROWS = [
  'fe31fbf8', '82600a08', 'bae2aae8', 'bad8e2e8', 'bac77ae8', '828fca08', 'feaaabf8', '008d3000',
  'be4343e0', '39f1bf88', '62102680', '486a9050', '36a0cc60', '61cf1f88', 'ef9fab60', 'a5ed2890',
  '67234160', 'f9619ba8', '9ec021a0', 'a432bf90', 'aab8afb8', '00c778f8', 'fe67dae0', '829d7888',
  'bad30fb8', 'baf9a960', 'bace3bf0', '82068d50', 'fef8a6e0',
];
const QR_SIZE = 29;
/** Light margin around the code, in modules (the standard asks for 4). */
const QR_QUIET = 4;

const STYLE = `
.sv-entry { position: fixed; inset: 0; z-index: 10; pointer-events: none;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #f4efe6; }
.sv-entry * { box-sizing: border-box; }
.sv-entry-enter { position: absolute; left: 50%; bottom: 32px; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: auto;
  width: max-content; max-width: calc(100vw - 32px); }
.sv-entry-enter button { font: inherit; font-size: 24px; font-weight: 700; letter-spacing: 0.02em;
  min-height: 64px; padding: 0 44px; border: 0; border-radius: 32px; cursor: pointer;
  background: #c8432b; color: #fff; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45); }
.sv-entry-enter button:hover { background: #d9553c; }
.sv-entry-enter button:disabled { background: #7a4a40; cursor: default; }
.sv-entry-enter p { margin: 0; padding: 4px 12px; border-radius: 12px; font-size: 15px;
  text-align: center; background: rgba(20, 16, 12, 0.72); }
.sv-entry-shade { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: 16px; overflow-y: auto; pointer-events: auto; background: rgba(12, 10, 8, 0.55); }
.sv-entry-card { width: 100%; max-width: 420px; margin: auto; padding: 28px 24px 20px; border-radius: 16px;
  text-align: center; background: #1d1813; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55); }
.sv-entry-card h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: 0.04em; }
.sv-entry-card p { margin: 0; font-size: 16px; line-height: 1.45; color: #d9d0c2; }
.sv-entry-card .sv-entry-lead { margin-bottom: 18px; }
.sv-entry-card .sv-entry-url { margin: 8px 0 16px; font-size: 26px; font-weight: 700; color: #fff;
  overflow-wrap: anywhere; user-select: all; }
.sv-entry-card svg { display: block; width: 168px; height: 168px; margin: 0 auto 10px; border-radius: 6px; }
.sv-entry-card .sv-entry-small { font-size: 14px; color: #b3a898; }
.sv-entry-card button { font: inherit; font-size: 15px; margin-top: 18px; padding: 10px 22px;
  border: 1px solid #6b5f50; border-radius: 22px; cursor: pointer; background: transparent; color: #f4efe6; }
.sv-entry-card button:hover { background: #2c251d; }
`;

/** Adds the way in to the page: the Enter VR button or the open-in-a-headset card. */
export async function mountEntryOverlay(world: World): Promise<void> {
  const root = document.createElement('div');
  root.className = 'sv-entry';
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  document.body.appendChild(root);

  if (await canEnterVR()) root.appendChild(enterButton(world));
  else root.appendChild(headsetCard());
}

async function canEnterVR(): Promise<boolean> {
  try {
    return (await navigator.xr?.isSessionSupported('immersive-vr')) === true;
  } catch {
    return false;
  }
}

function enterButton(world: World): HTMLElement {
  const box = document.createElement('div');
  box.className = 'sv-entry-enter';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Enter VR';
  const note = document.createElement('p');
  note.textContent = 'Played with your hands: set the controllers down.';
  box.append(button, note);

  let retry = 0;
  button.addEventListener('click', () => {
    if (world.session) return;
    button.disabled = true;
    world.launchXR();
    // If the session does not start (refused, or the headset is busy), let the button be pressed again.
    window.clearTimeout(retry);
    retry = window.setTimeout(() => (button.disabled = false), 4000);
  });
  // Shown only outside VR; back again when the session ends.
  world.visibilityState.subscribe((state) => {
    const outside = state === VisibilityState.NonImmersive;
    box.style.display = outside ? '' : 'none';
    if (outside) button.disabled = false;
  });
  return box;
}

function headsetCard(): HTMLElement {
  const shade = document.createElement('div');
  shade.className = 'sv-entry-shade';
  const card = document.createElement('div');
  card.className = 'sv-entry-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Play Sushi VR in a VR headset');

  const title = document.createElement('h1');
  title.textContent = 'Sushi VR';
  const lead = document.createElement('p');
  lead.className = 'sv-entry-lead';
  lead.textContent = 'A sushi counter you work with your own hands, in a VR headset.';
  const ask = document.createElement('p');
  ask.textContent = 'Open this page in the Meta Quest browser:';
  const url = document.createElement('p');
  url.className = 'sv-entry-url';
  url.textContent = SITE;
  const scan = document.createElement('p');
  scan.className = 'sv-entry-small';
  scan.textContent = 'Type the address, or scan the code. Hands only: no controllers needed.';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'See the shop on this screen';
  close.addEventListener('click', () => shade.remove());

  card.append(title, lead, ask, url, qrCode(), scan, close);
  shade.appendChild(card);
  return shade;
}

/** The QR code as an SVG: dark modules on a light square with its quiet margin. */
function qrCode(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const side = QR_SIZE + QR_QUIET * 2;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `${-QR_QUIET} ${-QR_QUIET} ${side} ${side}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `QR code for ${SITE}`);
  const light = document.createElementNS(ns, 'rect');
  light.setAttribute('x', String(-QR_QUIET));
  light.setAttribute('y', String(-QR_QUIET));
  light.setAttribute('width', String(side));
  light.setAttribute('height', String(side));
  light.setAttribute('fill', '#fff');
  let d = '';
  QR_ROWS.forEach((row, y) => {
    const bits = parseInt(row, 16);
    for (let x = 0; x < QR_SIZE; x++) {
      if ((bits >>> (31 - x)) & 1) d += `M${x} ${y}h1v1h-1z`;
    }
  });
  const dark = document.createElementNS(ns, 'path');
  dark.setAttribute('d', d);
  dark.setAttribute('fill', '#000');
  svg.append(light, dark);
  return svg;
}
