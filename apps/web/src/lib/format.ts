import type { PreviousPerformance, WorkoutExerciseDetail } from '@omega/core';
import { modeWeight } from '@omega/core';

export function fmtKg(w: number | null | undefined): string {
  if (w === null || w === undefined) return '—';
  return `${Math.round(w * 100) / 100} kg`;
}

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString();
}

/** `mm:ss` from a (possibly fractional or negative) number of seconds. */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Target line: `4 × 6–8 @ RIR 2`, or `3 × 10, 11, 11 @ RIR 1` when the engine set per-set targets. */
export function fmtTarget(ex: WorkoutExerciseDetail): string {
  const we = ex.workout_exercise;
  const byset = we.target_reps_by_set ?? ex.prescription?.target_reps_by_set;
  const reps = byset && byset.length > 0 ? byset.join(', ') : `${we.target_rep_low}–${we.target_rep_high}`;
  return `${we.target_sets} × ${reps} @ RIR ${we.target_rir}`;
}

/**
 * Previous-session line for the exercise header, e.g. `Last: 42 kg × 10, 10, 9 @ RIR 2`.
 * Uses working sets only; for unilateral exercises reps are shown per side (`L 10, 10 / R 10, 9`).
 */
export function fmtPrevious(prev: PreviousPerformance | null, unilateral = false): string | null {
  if (!prev) return null;
  const working = prev.sets.filter((s) => !s.is_warmup).sort((a, b) => a.set_index - b.set_index);
  if (working.length === 0) return null;
  const weight = modeWeight(working);
  const rirs = working.map((s) => (s.rir ?? (s.is_amrap ? 0 : null))).filter((r): r is number => r !== null);
  const rir = rirs.length ? Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10 : null;
  let reps: string;
  if (unilateral && working.some((s) => s.side !== 'bilateral')) {
    const L = working.filter((s) => s.side === 'left').map((s) => s.reps).join(', ');
    const R = working.filter((s) => s.side === 'right').map((s) => s.reps).join(', ');
    reps = `L ${L || '—'} / R ${R || '—'}`;
  } else {
    reps = working.map((s) => s.reps).join(', ');
  }
  return `Last: ${weight === null ? '—' : fmtNum(weight)} kg × ${reps}${rir === null ? '' : ` @ RIR ${fmtNum(rir)}`}`;
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
