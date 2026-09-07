/**
 * Rest timer state machine. Pure: every function takes `now` (a `Date.now()` value) so the
 * countdown is a wall-clock delta rather than a tick count — it survives the tab being
 * backgrounded, the screen locking, or a reload (state is persisted by the caller).
 */
export interface TimerState {
  /** Absolute end time (ms since epoch). */
  ends_at: number;
  /** Absolute start time, for progress bars. */
  started_at: number;
  /** Total seconds as originally planned (+ extensions). */
  total_seconds: number;
  /** Label shown in the bar, e.g. the exercise name. */
  label: string | null;
  /** Set once the finish has been announced (beep / vibration), so it fires exactly once. */
  announced: boolean;
}

export function startTimer(now: number, seconds: number, label: string | null = null): TimerState {
  const s = Math.max(0, Math.round(seconds));
  return { ends_at: now + s * 1000, started_at: now, total_seconds: s, label, announced: false };
}

export function extendTimer(t: TimerState, seconds: number): TimerState {
  return { ...t, ends_at: t.ends_at + seconds * 1000, total_seconds: t.total_seconds + seconds, announced: false };
}

/** Seconds left, possibly negative once elapsed (never NaN). */
export function remainingSeconds(t: TimerState, now: number): number {
  return (t.ends_at - now) / 1000;
}

export function isFinished(t: TimerState, now: number): boolean {
  return now >= t.ends_at;
}

/** 0..1 fraction elapsed. */
export function progress(t: TimerState, now: number): number {
  const total = t.ends_at - t.started_at;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (now - t.started_at) / total));
}

/** A timer is stale (should be discarded on reload) after it has been finished for longer than this. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

export function isStale(t: TimerState, now: number): boolean {
  return now - t.ends_at > STALE_AFTER_MS;
}

/** Whether the finish needs announcing; returns the state with `announced` set if so. */
export function announceIfDue(t: TimerState, now: number): { due: boolean; state: TimerState } {
  if (t.announced || !isFinished(t, now)) return { due: false, state: t };
  return { due: true, state: { ...t, announced: true } };
}
