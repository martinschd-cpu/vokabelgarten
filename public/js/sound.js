// Kleine Töne mit der Web Audio API, ganz ohne Audiodateien. Abschaltbar.

let ctx = null;
let enabled = true;

export function setSoundEnabled(value) {
  enabled = !!value;
}

function audio() {
  if (!ctx) {
    const AC = self.AudioContext || self.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, duration, { type = 'sine', gain = 0.12 } = {}) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

const SOUNDS = {
  correct: () => {
    tone(660, 0, 0.15);
    tone(880, 0.1, 0.25);
  },
  almost: () => {
    tone(587, 0, 0.18, { type: 'triangle' });
    tone(659, 0.12, 0.22, { type: 'triangle' });
  },
  wrong: () => tone(392, 0, 0.3, { type: 'triangle', gain: 0.08 }),
  done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3)),
  tap: () => tone(1200, 0, 0.05, { gain: 0.04 }),
};

export function play(name) {
  if (!enabled) return;
  try {
    SOUNDS[name]?.();
  } catch {
    // Ton ist nur Beiwerk
  }
}
