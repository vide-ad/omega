/**
 * App-wide rest timer. State is a wall-clock `ends_at` (lib/timer.ts) persisted to localStorage,
 * so it survives backgrounding, screen lock and reloads. The finish is announced once
 * (vibration + beep); on `visibilitychange` → visible the remaining time is recomputed.
 */
import { useEffect, useState } from 'react';
import { beep, vibrate } from '../lib/audio.js';
import { announceIfDue, extendTimer, isFinished, isStale, startTimer, type TimerState } from '../lib/timer.js';

const KEY = 'omega.timer';
/** How long the "rest over" state stays on screen before the bar clears itself. */
const LINGER_MS = 15_000;

type Listener = (t: TimerState | null) => void;
const listeners = new Set<Listener>();
let state: TimerState | null = load();

function load(): TimerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TimerState;
    if (typeof t.ends_at !== 'number' || isStale(t, Date.now())) return null;
    return t;
  } catch { return null; }
}

function persist(): void {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

function set(next: TimerState | null): void {
  state = next;
  persist();
  for (const fn of listeners) fn(state);
}

export function getTimer(): TimerState | null { return state; }

export function startRest(seconds: number, label: string | null = null): void {
  set(startTimer(Date.now(), seconds, label));
}

export function extendRest(seconds = 30): void {
  if (!state) return;
  // Extending after the finish restarts from now rather than from a time in the past.
  const now = Date.now();
  const base = isFinished(state, now) ? { ...state, ends_at: now, started_at: now, total_seconds: 0 } : state;
  set(extendTimer(base, seconds));
}

export function skipRest(): void { set(null); }

/** Called by the ticker and on visibility changes: announce once, clear once it has lingered. */
export function tick(now = Date.now()): void {
  if (!state) return;
  const a = announceIfDue(state, now);
  if (a.due) {
    set(a.state);
    vibrate([200, 100, 200, 100, 400]);
    beep();
    return;
  }
  if (isFinished(state, now) && now - state.ends_at > LINGER_MS) set(null);
}

let ticker: number | null = null;
function ensureTicker(): void {
  if (ticker !== null || typeof window === 'undefined') return;
  ticker = window.setInterval(() => tick(), 250);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
}

export function useRestTimer(): { timer: TimerState | null; now: number } {
  const [timer, setTimer] = useState<TimerState | null>(state);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    ensureTicker();
    listeners.add(setTimer);
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => { listeners.delete(setTimer); window.clearInterval(id); };
  }, []);
  return { timer, now };
}
