import type { ExerciseMuscleCredit, MesocycleWeek, MuscleGroupKey, ReadinessLog, SetLog, SorenessEntry } from '../types.js';
import { daysBetween } from './dates.js';

export const RHR_MEDIAN_WINDOW_DAYS = 30;
export const RHR_MEDIAN_MIN_READINGS = 7;
export const RHR_DELTA_THRESHOLD = 7;
export const SLEEP_HOURS_THRESHOLD = 5.5;
export const SORENESS_THRESHOLD = 4;
/** A muscle counts as "trained" by an exercise if the exercise credits it at or above this. */
export const TRAINED_MUSCLE_MIN_CREDIT = 0.5;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Rolling median over readiness logs dated in [date − windowDays, date − 1] (today excluded so a
 * reading is compared against history, not itself). Returns null with fewer than `minReadings`.
 */
export function rollingMedian<T extends Pick<ReadinessLog, 'date'>>(
  logs: readonly T[],
  pick: (l: T) => number | null,
  date: string,
  windowDays = RHR_MEDIAN_WINDOW_DAYS,
  minReadings = 1,
): number | null {
  const vals: number[] = [];
  for (const l of logs) {
    if (l.date >= date || daysBetween(l.date, date) > windowDays) continue;
    const v = pick(l);
    if (v !== null) vals.push(v);
  }
  return vals.length < minReadings ? null : median(vals);
}

export function rollingMedianRhr(logs: readonly Pick<ReadinessLog, 'date' | 'resting_hr'>[], date: string, windowDays = RHR_MEDIAN_WINDOW_DAYS, minReadings = RHR_MEDIAN_MIN_READINGS): number | null {
  return rollingMedian(logs, (l) => l.resting_hr, date, windowDays, minReadings);
}

export type CompromisedReason = 'manual' | 'resting_hr' | 'sleep' | 'deload';

export interface WorkoutCompromisedInput {
  date: string;
  readiness: Pick<ReadinessLog, 'manual_compromised' | 'resting_hr' | 'sleep_hours'> | null;
  readinessHistory: readonly Pick<ReadinessLog, 'date' | 'resting_hr'>[]; // for the RHR median
  week: Pick<MesocycleWeek, 'is_deload'> | null;
}

/**
 * Spec §5.2 session-level compromise (soreness moved to exercise level, see below, so sore biceps
 * do not invalidate squat progression). No readiness log for the day ⇒ readiness criteria are false.
 */
export function workoutCompromisedReasons(input: WorkoutCompromisedInput): CompromisedReason[] {
  const reasons: CompromisedReason[] = [];
  const r = input.readiness;
  if (r?.manual_compromised) reasons.push('manual');
  if (r && r.resting_hr !== null) {
    const med = rollingMedianRhr(input.readinessHistory, input.date);
    if (med !== null && r.resting_hr > med + RHR_DELTA_THRESHOLD) reasons.push('resting_hr');
  }
  if (r && r.sleep_hours !== null && r.sleep_hours < SLEEP_HOURS_THRESHOLD) reasons.push('sleep');
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

export type ExerciseCompromisedReason = 'pain' | 'soreness';

/**
 * Exercise-level compromise: a moderate/stop pain flag on any set, or soreness ≥ 4 (on that day's
 * readiness log) for a muscle this exercise trains (credit ≥ 0.5).
 */
export function exerciseCompromisedReasons(
  sets: readonly Pick<SetLog, 'pain_severity'>[],
  soreness: readonly Pick<SorenessEntry, 'muscle_group_key' | 'rating'>[],
  exerciseCredits: readonly Pick<ExerciseMuscleCredit, 'muscle_group_key' | 'credit'>[],
): ExerciseCompromisedReason[] {
  const reasons: ExerciseCompromisedReason[] = [];
  if (sets.some((s) => s.pain_severity === 'moderate' || s.pain_severity === 'stop')) reasons.push('pain');
  const trained = new Set(exerciseCredits.filter((c) => c.credit >= TRAINED_MUSCLE_MIN_CREDIT).map((c) => c.muscle_group_key));
  if (soreness.some((s) => s.rating >= SORENESS_THRESHOLD && trained.has(s.muscle_group_key))) reasons.push('soreness');
  return reasons;
}

export function isExerciseCompromised(
  sets: readonly Pick<SetLog, 'pain_severity'>[],
  soreness: readonly Pick<SorenessEntry, 'muscle_group_key' | 'rating'>[],
  exerciseCredits: readonly Pick<ExerciseMuscleCredit, 'muscle_group_key' | 'credit'>[],
): boolean {
  return exerciseCompromisedReasons(sets, soreness, exerciseCredits).length > 0;
}
