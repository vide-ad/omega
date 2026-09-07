/**
 * Pure helpers for the active-session screen: which set rows to show, how to prefill a draft,
 * how to turn a draft into a `SetCreate`, and the end-of-session summary. No React, no I/O.
 */
import type { PainSeverity, PreviousPerformance, SetCreate, SetLog, SetSide, WorkoutDetail, WorkoutExerciseDetail } from '@omega/core';
import { effectiveHardSets, modeWeight } from '@omega/core';

export interface RowKey { set_index: number; side: SetSide }

export function rowId(r: RowKey): string {
  return `${r.set_index}:${r.side}`;
}

/** What the user is typing for one not-yet-logged (or being-edited) row. */
export interface SetDraft {
  weight_kg: string;      // raw input text
  reps: string;           // raw input text
  rir: number | null;
  is_warmup: boolean;
  is_amrap: boolean;
  pain_severity: PainSeverity;
  pain_note: string;
}

export const PAIN_CYCLE: readonly PainSeverity[] = ['none', 'niggle', 'moderate', 'stop'];

export function nextPain(p: PainSeverity): PainSeverity {
  const i = PAIN_CYCLE.indexOf(p);
  return PAIN_CYCLE[(i + 1) % PAIN_CYCLE.length] ?? 'none';
}

export function sidesFor(ex: Pick<WorkoutExerciseDetail, 'exercise'>): SetSide[] {
  return ex.exercise.is_unilateral ? ['left', 'right'] : ['bilateral'];
}

/** Number of set indices to show: planned sets ± user adjustments, never fewer than what is logged, never below 1. */
export function rowCount(ex: WorkoutExerciseDetail, extra: number): number {
  const maxLogged = ex.sets.reduce((m, s) => Math.max(m, s.set_index), 0);
  return Math.max(ex.workout_exercise.target_sets + extra, maxLogged, 1);
}

/** All rows for an exercise in display order (set 1 L, set 1 R, set 2 L, ...). */
export function rowsFor(ex: WorkoutExerciseDetail, extra: number): RowKey[] {
  const n = rowCount(ex, extra);
  const sides = sidesFor(ex);
  const out: RowKey[] = [];
  for (let i = 1; i <= n; i++) for (const side of sides) out.push({ set_index: i, side });
  return out;
}

/** The logged set occupying a row, if any. */
export function loggedSet(ex: Pick<WorkoutExerciseDetail, 'sets'>, row: RowKey): SetLog | undefined {
  return ex.sets.find((s) => s.set_index === row.set_index && s.side === row.side);
}

/** Can the last set index be removed? Only when no set is logged at that index. */
export function canRemoveLastRow(ex: WorkoutExerciseDetail, extra: number): boolean {
  const n = rowCount(ex, extra);
  if (n <= 1) return false;
  return !ex.sets.some((s) => s.set_index === n);
}

function previousWeight(prev: PreviousPerformance | null): number | null {
  if (!prev) return null;
  const working = prev.sets.filter((s) => !s.is_warmup);
  return modeWeight(working.length ? working : prev.sets);
}

/** Per-set rep target from the stored prescription (falls back to the standalone object, then the range low). */
export function targetRepsFor(ex: WorkoutExerciseDetail, set_index: number): number {
  const we = ex.workout_exercise;
  const byset = we.target_reps_by_set ?? ex.prescription?.target_reps_by_set ?? null;
  return byset?.[set_index - 1] ?? we.target_rep_low;
}

/**
 * Prefill for an unlogged row (spec §7: weight from the suggestion or the previous set, reps from
 * `target_reps_by_set[i]` else `target_rep_low`, RIR = target, AMRAP on the last planned set when
 * the prescription says so — AMRAP forces RIR 0).
 */
export function defaultDraft(ex: WorkoutExerciseDetail, row: RowKey): SetDraft {
  const we = ex.workout_exercise;
  const logged = [...ex.sets].sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  const lastWorking = logged.find((s) => !s.is_warmup);
  const weight = lastWorking?.weight_kg ?? we.suggested_weight_kg ?? previousWeight(ex.previous);
  const isLastPlanned = row.set_index === we.target_sets;
  const amrap = (we.last_set_amrap || (ex.prescription?.last_set_amrap ?? false)) && isLastPlanned;
  return {
    weight_kg: weight === null ? (ex.exercise.uses_bodyweight ? '0' : '') : String(weight),
    reps: String(targetRepsFor(ex, row.set_index)),
    rir: amrap ? 0 : we.target_rir,
    is_warmup: false,
    is_amrap: amrap,
    pain_severity: 'none',
    pain_note: '',
  };
}

export function draftFromSet(s: SetLog): SetDraft {
  return {
    weight_kg: String(s.weight_kg),
    reps: String(s.reps),
    rir: s.is_amrap ? 0 : s.rir,
    is_warmup: s.is_warmup,
    is_amrap: s.is_amrap,
    pain_severity: s.pain_severity,
    pain_note: s.pain_note ?? '',
  };
}

export type DraftResult<T> = { ok: true; value: T } | { ok: false; error: string };

function parseWeight(text: string, usesBodyweight: boolean): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return usesBodyweight ? 0 : null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseReps(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/** Validate a draft and build the `SetCreate` body. `id` is the client UUID (idempotent replay). */
export function draftToSetCreate(
  ex: WorkoutExerciseDetail,
  row: RowKey,
  draft: SetDraft,
  ids: { id: string; completed_at: string; rest_taken_seconds: number | null },
): DraftResult<SetCreate & { id: string }> {
  const weight = parseWeight(draft.weight_kg, ex.exercise.uses_bodyweight);
  if (weight === null) return { ok: false, error: 'Enter a weight (kg)' };
  const reps = parseReps(draft.reps);
  if (reps === null) return { ok: false, error: 'Enter whole reps' };
  const rir = draft.is_amrap ? 0 : draft.rir;
  if (rir !== null && (rir < 0 || rir > 10)) return { ok: false, error: 'RIR must be 0–10' };
  return {
    ok: true,
    value: {
      id: ids.id,
      workout_exercise_id: ex.workout_exercise.id,
      set_index: row.set_index,
      side: row.side,
      is_warmup: draft.is_warmup,
      is_amrap: draft.is_amrap,
      weight_kg: weight,
      reps,
      rir,
      tempo: ex.workout_exercise.target_tempo ?? ex.prescription?.target_tempo ?? null,
      rest_taken_seconds: ids.rest_taken_seconds,
      pain_severity: draft.pain_severity,
      pain_note: draft.pain_severity === 'none' ? null : (draft.pain_note.trim() || null),
      media_id: null,
      completed_at: ids.completed_at,
    },
  };
}

/** The editable fields of an existing set as a PATCH body (only what the row can change). */
export function draftToSetPatch(ex: WorkoutExerciseDetail, draft: SetDraft): DraftResult<Pick<SetLog, 'weight_kg' | 'reps' | 'rir' | 'is_warmup' | 'is_amrap' | 'pain_severity' | 'pain_note'>> {
  const weight = parseWeight(draft.weight_kg, ex.exercise.uses_bodyweight);
  if (weight === null) return { ok: false, error: 'Enter a weight (kg)' };
  const reps = parseReps(draft.reps);
  if (reps === null) return { ok: false, error: 'Enter whole reps' };
  return {
    ok: true,
    value: {
      weight_kg: weight,
      reps,
      rir: draft.is_amrap ? 0 : draft.rir,
      is_warmup: draft.is_warmup,
      is_amrap: draft.is_amrap,
      pain_severity: draft.pain_severity,
      pain_note: draft.pain_severity === 'none' ? null : (draft.pain_note.trim() || null),
    },
  };
}

export interface SessionSummary {
  sets_logged: number;
  working_sets: number;
  hard_sets: number;
  exercises_touched: number;
  exercises_total: number;
  pain_flags: number;
}

/** Spec §7 finish summary: sets logged and hard sets (engine definition, unilateral pairs count once). */
export function sessionSummary(d: WorkoutDetail): SessionSummary {
  const out: SessionSummary = { sets_logged: 0, working_sets: 0, hard_sets: 0, exercises_touched: 0, exercises_total: d.exercises.length, pain_flags: 0 };
  for (const ex of d.exercises) {
    out.sets_logged += ex.sets.length;
    out.working_sets += ex.sets.filter((s) => !s.is_warmup).length;
    out.hard_sets += effectiveHardSets(ex.sets, ex.exercise.is_unilateral);
    if (ex.sets.length > 0) out.exercises_touched++;
    out.pain_flags += ex.sets.filter((s) => s.pain_severity !== 'none').length;
  }
  return out;
}

/** The set index + side that should get focus next: the first unlogged row. */
export function nextRow(ex: WorkoutExerciseDetail, extra: number): RowKey | null {
  return rowsFor(ex, extra).find((r) => !loggedSet(ex, r)) ?? null;
}

/** Seconds of rest actually taken before a set that is being logged now, from the last set logged in the session. */
export function restTakenSeconds(d: WorkoutDetail, nowIso: string): number | null {
  let last: string | null = null;
  for (const ex of d.exercises) for (const s of ex.sets) if (!last || s.completed_at > last) last = s.completed_at;
  if (!last) return null;
  const secs = Math.round((new Date(nowIso).getTime() - new Date(last).getTime()) / 1000);
  if (!Number.isFinite(secs) || secs < 0) return null;
  // Anything over an hour is a break, not a rest interval.
  return secs > 3600 ? null : secs;
}
