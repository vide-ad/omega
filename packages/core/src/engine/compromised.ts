import type { ExerciseConstraint, ExerciseMuscleCredit, MesocycleWeek, MuscleGroupKey, ReadinessLog, SetLog, SorenessEntry } from '../types.js';
import { daysBetween } from './dates.js';

export const RHR_MEDIAN_WINDOW_DAYS = 30;
export const RHR_DELTA_THRESHOLD = 7;
export const SLEEP_HOURS_THRESHOLD = 5.5;
export const SORENESS_THRESHOLD = 4;
/** A muscle counts as "trained in the session" if any exercise credits it at or above this. */
export const TRAINED_MUSCLE_MIN_CREDIT = 0.5;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * 30-day rolling median of resting HR from readiness logs dated in `(date - 30d, date)`,
 * excluding `date` itself so today's reading is compared against history, not against itself.
 */
export function rollingMedianRhr(logs: readonly Pick<ReadinessLog, 'date' | 'resting_hr'>[], date: string, windowDays = RHR_MEDIAN_WINDOW_DAYS): number | null {
  const vals = logs
    .filter((l) => l.resting_hr !== null && l.date < date && daysBetween(l.date, date) <= windowDays)
    .map((l) => l.resting_hr as number);
  return median(vals);
}

export type CompromisedReason = 'manual' | 'resting_hr' | 'sleep' | 'soreness' | 'deload';

export interface WorkoutCompromisedInput {
  date: string;
  readiness: ReadinessLog | null;
  soreness: readonly SorenessEntry[];                 // entries for that readiness log
  readinessHistory: readonly Pick<ReadinessLog, 'date' | 'resting_hr'>[]; // for the RHR median
  /** Muscle groups trained in this session (see `musclesTrained`). */
  musclesTrained: ReadonlySet<MuscleGroupKey>;
  week: Pick<MesocycleWeek, 'is_deload'> | null;
}

/** Spec §5.2 — session-level compromise. Returns every reason that fired (empty = not compromised). */
export function workoutCompromisedReasons(input: WorkoutCompromisedInput): CompromisedReason[] {
  const reasons: CompromisedReason[] = [];
  const r = input.readiness;
  if (r?.manual_compromised) reasons.push('manual');
  if (r?.resting_hr !== null && r?.resting_hr !== undefined) {
    const med = rollingMedianRhr(input.readinessHistory, input.date);
    if (med !== null && r.resting_hr > med + RHR_DELTA_THRESHOLD) reasons.push('resting_hr');
  }
  if (r?.sleep_hours !== null && r?.sleep_hours !== undefined && r.sleep_hours < SLEEP_HOURS_THRESHOLD) reasons.push('sleep');
  if (input.soreness.some((s) => s.rating >= SORENESS_THRESHOLD && input.musclesTrained.has(s.muscle_group_key))) reasons.push('soreness');
  if (input.week?.is_deload) reasons.push('deload');
  return reasons;
}

export function isWorkoutCompromised(input: WorkoutCompromisedInput): boolean {
  return workoutCompromisedReasons(input).length > 0;
}

/** Muscles with credit ≥ TRAINED_MUSCLE_MIN_CREDIT across the given exercise ids. */
export function musclesTrained(exerciseIds: readonly string[], credits: readonly ExerciseMuscleCredit[]): Set<MuscleGroupKey> {
  const ids = new Set(exerciseIds);
  const out = new Set<MuscleGroupKey>();
  for (const c of credits) if (ids.has(c.exercise_id) && c.credit >= TRAINED_MUSCLE_MIN_CREDIT) out.add(c.muscle_group_key);
  return out;
}

export type ExerciseCompromisedReason = 'pain' | 'constraint';

/** Spec §5.2 — exercise-level compromise: a moderate/stop pain flag on any set, or an applicable active constraint. */
export function exerciseCompromisedReasons(sets: readonly Pick<SetLog, 'pain_severity'>[], applicableConstraints: readonly ExerciseConstraint[]): ExerciseCompromisedReason[] {
  const reasons: ExerciseCompromisedReason[] = [];
  if (sets.some((s) => s.pain_severity === 'moderate' || s.pain_severity === 'stop')) reasons.push('pain');
  if (applicableConstraints.length > 0) reasons.push('constraint');
  return reasons;
}

export function isExerciseCompromised(sets: readonly Pick<SetLog, 'pain_severity'>[], applicableConstraints: readonly ExerciseConstraint[]): boolean {
  return exerciseCompromisedReasons(sets, applicableConstraints).length > 0;
}
