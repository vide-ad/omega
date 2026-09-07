/**
 * Short beep via a Web Audio oscillator. iOS only lets audio start inside a user gesture, so
 * `unlockAudio()` is wired to the first touch/click (main.tsx) and resumes the context there.
 */
let ctx: AudioContext | null = null;
let unlocked = false;

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try { ctx = new Ctor(); } catch { ctx = null; }
  return ctx;
}

/** Call from a user gesture. Idempotent. */
export function unlockAudio(): void {
  const c = getContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => undefined);
  if (!unlocked) {
    // Play a silent buffer so Safari marks the context as user-activated.
    try {
      const buf = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start(0);
      unlocked = true;
    } catch { /* ignore */ }
  }
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

/** Two short tones. Silent (no throw) when audio is unavailable. */
export function beep(): void {
  const c = getContext();
  if (!c) return;
  const play = () => {
    try {
      const t0 = c.currentTime;
      for (let i = 0; i < 2; i++) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 0 ? 880 : 1175;
        gain.gain.setValueAtTime(0.0001, t0 + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.22 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.18);
        osc.connect(gain).connect(c.destination);
        osc.start(t0 + i * 0.22);
        osc.stop(t0 + i * 0.22 + 0.2);
      }
    } catch { /* ignore */ }
  };
  if (c.state === 'suspended') void c.resume().then(play).catch(() => undefined);
  else play();
}

export function vibrate(pattern: number | number[]): void {
  try {
    const n = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof n.vibrate === 'function') n.vibrate(pattern);
  } catch { /* ignore */ }
}
