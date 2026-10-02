/* Bank UI sound effects.
 *
 * Each slot plays html/sounds/<name>.ogg (or .mp3/.wav) when that file exists;
 * otherwise a quiet synthesised stand-in. Drop recordings into web/public/sounds/
 * (or html/sounds/ after a build) to replace any of them without touching code.
 * Sources and licences: web/public/sounds/CREDITS.txt */

export type SoundName =
  | 'tap' // any button press
  | 'keypad' // ATM / PIN key
  | 'counter' // note counter running (deposits, withdrawals)
  | 'chime' // success
  | 'error' // rejected action
  | 'cardIn' // card into ATM slot
  | 'cardOut' // card ejected
  | 'printer' // receipt printing
  | 'open' // UI opens
  | 'close' // UI closes
  | 'toggle'; // switch flipped

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let settings = { enabled: true, volume: 0.5 };
const files = new Map<SoundName, AudioBuffer | null | 'loading'>();

/**
 * Per-slot mix for the shipped recordings: they come from different libraries at
 * very different loudness. gain multiplies the master volume; offset skips lead-in
 * silence; length cuts long takes (with a short fade) - all in seconds.
 * ponytail: tuned by measured RMS, not by ear - nudge these after a listen in-game.
 */
const TUNE: Partial<Record<SoundName, { gain?: number; offset?: number; length?: number }>> = {
  tap: { gain: 0.25 },
  toggle: { gain: 0.3 },
  chime: { gain: 0.45 },
  error: { gain: 0.5 },
  open: { gain: 0.3 },
  close: { gain: 0.3 },
  keypad: { gain: 1 },
  counter: { gain: 1.3, length: 1.6 },
  printer: { gain: 1, offset: 0.3, length: 2.2 },
  cardIn: { gain: 1.8 },
  cardOut: { gain: 1.8 },
};

export function configureSound(s: { enabled: boolean; volume: number }) {
  settings = { enabled: s.enabled, volume: Math.min(Math.max(s.volume, 0), 1) };
  if (master) master.gain.value = settings.volume * 0.6;
}

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = settings.volume * 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

async function load(name: SoundName) {
  files.set(name, 'loading');
  for (const ext of ['ogg', 'mp3', 'wav']) {
    try {
      const res = await fetch(`./sounds/${name}.${ext}`);
      if (!res.ok) continue;
      // Dev servers answer missing files with index.html; decoding that throws, which is fine.
      files.set(name, await audio().decodeAudioData(await res.arrayBuffer()));
      return;
    } catch {
      // try the next extension
    }
  }
  files.set(name, null);
}

/** Fetch every recording up front so the first play has no delay. */
export function preloadSounds() {
  (Object.keys(SYNTH) as SoundName[]).forEach((n) => files.has(n) || load(n));
}

export function play(name: SoundName, opts: { duration?: number } = {}) {
  if (!settings.enabled || settings.volume <= 0) return;
  try {
    const ac = audio();
    const file = files.get(name);
    if (file && file !== 'loading') {
      const t = TUNE[name] ?? {};
      const src = ac.createBufferSource();
      src.buffer = file;
      const g = ac.createGain();
      const gain = t.gain ?? 1;
      g.gain.value = gain;
      src.connect(g).connect(master!);
      const length = opts.duration ?? t.length;
      const now = ac.currentTime;
      src.start(now, t.offset ?? 0);
      if (length) {
        // Fade the tail instead of a hard cut, so a trimmed counter winds down.
        g.gain.setValueAtTime(gain, now + Math.max(length - 0.25, 0));
        g.gain.linearRampToValueAtTime(0.0001, now + length);
        src.stop(now + length + 0.02);
      }
      return;
    }
    if (!files.has(name)) load(name);
    SYNTH[name](ac, master!, opts.duration);
  } catch {
    // Audio is decoration; never let it break a flow.
  }
}

/* ---------- synthesised stand-ins ---------- */

type Synth = (ac: AudioContext, out: AudioNode, duration?: number) => void;

let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

/** Short band-passed noise burst: ticks, clicks, paper flicks. */
function burst(ac: AudioContext, out: AudioNode, at: number, freq: number, len: number, gain: number, q = 2) {
  const src = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  src.connect(bp).connect(g).connect(out);
  src.start(at, Math.random() * 0.5);
  src.stop(at + len + 0.02);
}

function tone(ac: AudioContext, out: AudioNode, at: number, freq: number, len: number, gain: number, type: OscillatorType = 'sine') {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + len + 0.02);
}

/** A low motor hum under mechanical sounds. */
function motor(ac: AudioContext, out: AudioNode, at: number, len: number, freq: number, gain: number) {
  const o = ac.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 380;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.08);
  g.gain.setValueAtTime(gain, at + len - 0.12);
  g.gain.linearRampToValueAtTime(0, at + len);
  o.connect(lp).connect(g).connect(out);
  o.start(at);
  o.stop(at + len + 0.05);
}

function sweep(ac: AudioContext, out: AudioNode, at: number, from: number, to: number, len: number, gain: number) {
  const src = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.5;
  bp.frequency.setValueAtTime(from, at);
  bp.frequency.exponentialRampToValueAtTime(to, at + len);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + len * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  src.connect(bp).connect(g).connect(out);
  src.start(at);
  src.stop(at + len + 0.02);
}

const SYNTH: Record<SoundName, Synth> = {
  tap: (ac, out) => burst(ac, out, ac.currentTime, 3200, 0.025, 0.18, 4),
  toggle: (ac, out) => {
    const t = ac.currentTime;
    burst(ac, out, t, 2600, 0.02, 0.16, 5);
    burst(ac, out, t + 0.05, 3400, 0.02, 0.12, 5);
  },
  keypad: (ac, out) => tone(ac, out, ac.currentTime, 1250, 0.09, 0.08, 'triangle'),
  // Note counter: motor spin-up with fast paper flicks riding on it.
  counter: (ac, out, duration = 1.4) => {
    const t = ac.currentTime;
    motor(ac, out, t, duration, 92, 0.05);
    const rate = 22;
    for (let i = 0; i < duration * rate; i++) {
      const at = t + 0.06 + i / rate + Math.random() * 0.008;
      burst(ac, out, at, 2200 + Math.random() * 900, 0.03, 0.12, 1.4);
    }
  },
  chime: (ac, out) => {
    const t = ac.currentTime;
    tone(ac, out, t, 1318.5, 1.1, 0.07);
    tone(ac, out, t, 2637, 0.5, 0.015);
    tone(ac, out, t + 0.12, 1760, 1.3, 0.07);
    tone(ac, out, t + 0.12, 3520, 0.5, 0.012);
  },
  error: (ac, out) => {
    const t = ac.currentTime;
    tone(ac, out, t, 330, 0.16, 0.06, 'triangle');
    tone(ac, out, t + 0.14, 247, 0.22, 0.06, 'triangle');
  },
  cardIn: (ac, out) => {
    const t = ac.currentTime;
    sweep(ac, out, t, 1400, 420, 0.38, 0.14);
    tone(ac, out, t + 0.38, 110, 0.07, 0.12);
    burst(ac, out, t + 0.38, 900, 0.04, 0.12, 2);
    motor(ac, out, t + 0.42, 0.35, 70, 0.03);
  },
  cardOut: (ac, out) => {
    const t = ac.currentTime;
    motor(ac, out, t, 0.35, 70, 0.03);
    sweep(ac, out, t + 0.3, 420, 1400, 0.32, 0.12);
    burst(ac, out, t + 0.62, 1800, 0.03, 0.1, 3);
  },
  // Thermal receipt printer: stepper whine plus line feeds, then the tear.
  printer: (ac, out) => {
    const t = ac.currentTime;
    motor(ac, out, t, 1.1, 150, 0.035);
    for (let i = 0; i < 18; i++) burst(ac, out, t + 0.05 + i * 0.055, 1700, 0.035, 0.07, 3);
    sweep(ac, out, t + 1.12, 3000, 1200, 0.14, 0.1);
  },
  open: (ac, out) => sweep(ac, out, ac.currentTime, 300, 1800, 0.32, 0.05),
  close: (ac, out) => sweep(ac, out, ac.currentTime, 1800, 300, 0.26, 0.04),
};
