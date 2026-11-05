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
