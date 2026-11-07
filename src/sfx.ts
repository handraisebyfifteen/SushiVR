/**
 * Sound effects synthesized with the Web Audio API (no audio files).
 * The context is created lazily; browsers only allow audio after a user
 * action, and entering VR counts as one.
 */
let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = ac.sampleRate * 0.5;
  noiseBuffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** Rustle of a hand digging into the rice tub: filtered noise with a wobble. */
export function playRustle(): void {
  const ac = context();
  if (!ac) return;
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.Q.value = 0.8;
  const gain = ac.createGain();
  const t = ac.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.25, t + 0.05);
  gain.gain.linearRampToValueAtTime(0.1, t + 0.2);
  gain.gain.linearRampToValueAtTime(0.3, t + 0.3);
  gain.gain.linearRampToValueAtTime(0, t + 0.45);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.5);
}

/** Short tone: a metronome tick, or a brighter chime for a good judgement. */
export function playTone(frequency: number, seconds = 0.08, volume = 0.15): void {
  const ac = context();
  if (!ac) return;
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  const gain = ac.createGain();
  const t = ac.currentTime;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + seconds);
}

/** A short wooden clack that marks the master's word. */
export function playClack(): void {
  const ac = context();
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1400;
  filter.Q.value = 6;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.08);
  playTone(620, 0.06, 0.08);
}

/** A tone gliding from one pitch to another, starting `delay` seconds from now. */
function glide(from: number, to: number, seconds: number, volume: number, delay = 0, type: OscillatorType = 'sine'): void {
  const ac = context();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + seconds + 0.01);
}

/*
 * Hands have no vibration to say an action took, so every take, put, press
 * and result has a short sound (Meta's hand design guides ask for this).
 * They are quiet and short, so a busy moment does not turn into noise.
 */

/** Something taken in hand: a short rising blip. */
export function playPick(): void {
  glide(880, 1320, 0.05, 0.05);
}

/** Something set down or let go: a short falling blip. */
export function playPut(): void {
  glide(740, 470, 0.06, 0.05);
}

/** Something far pressed by pointing (the phone, a call button, the urn, the noren): two quick notes. */
export function playPress(): void {
  glide(1175, 1175, 0.05, 0.05);
  glide(1568, 1568, 0.07, 0.045, 0.06);
}

/** A step done right (the green flash): a soft high chime. */
export function playDone(): void {
  glide(1760, 1760, 0.09, 0.035);
}

/** A warning (the amber flash): a low, short buzz. */
export function playWarn(): void {
  glide(240, 190, 0.14, 0.06, 0, 'triangle');
}

/** The bill paid: three bright notes. */
export function playCoin(): void {
  glide(1319, 1319, 0.06, 0.05);
  glide(1760, 1760, 0.06, 0.05, 0.07);
  glide(2093, 2093, 0.12, 0.05, 0.14);
}
