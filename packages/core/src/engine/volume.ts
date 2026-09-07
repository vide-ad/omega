import type { Exercise, ExerciseMuscleCredit, MuscleGroupKey, MuscleVolumeTarget, SetLog } from '../types.js';
import { MUSCLE_GROUP_KEYS } from '../types.js';
import { dateOf, isoWeekKey } from './dates.js';

/** Spec §4 / §5.1 — a hard set is a working set with RIR ≤ 4; null RIR is assumed to be 2. */
export const HARD_SET_MAX_RIR = 4;
export const ASSUMED_RIR_WHEN_NULL = 2;

export function isHardSet(s: Pick<SetLog, 'is_warmup' | 'rir'>): boolean {
  if (s.is_warmup) return false;
  return (s.rir ?? ASSUMED_RIR_WHEN_NULL) <= HARD_SET_MAX_RIR;
}

export interface VolumeSetInput {
  set: Pick<SetLog, 'id' | 'is_warmup' | 'rir' | 'side' | 'completed_at' | 'workout_exercise_id'>;
  exercise_id: string;
}

export type VolumeStatus = 'under' | 'in_range' | 'over' | 'no_target';

export interface MuscleWeekVolume {
  muscle_group_key: MuscleGroupKey;
  sets: number;                      // fractional hard sets
  min_sets: number | null;
  max_sets: number | null;
  status: VolumeStatus;
}

export interface WeekVolume {
  week: string;                      // e.g. 2026-W37
  muscles: MuscleWeekVolume[];
}

export function classifyVolume(sets: number, target: Pick<MuscleVolumeTarget, 'min_sets' | 'max_sets' | 'active'> | undefined): VolumeStatus {
  if (!target || !target.active) return 'no_target';
  if (sets < target.min_sets) return 'under';
  if (sets > target.max_sets) return 'over';
  return 'in_range';
}

/**
 * Effective hard-set count per (workout_exercise). Bilateral sets count 1 each; for unilateral
 * exercises a left and a right set together count as one (spec §4), i.e. (left + right) / 2.
 */
export function effectiveHardSets(sets: readonly Pick<SetLog, 'is_warmup' | 'rir' | 'side'>[], isUnilateral: boolean): number {
  let bilateral = 0, left = 0, right = 0;
  for (const s of sets) {
    if (!isHardSet(s)) continue;
    if (s.side === 'left') left++;
    else if (s.side === 'right') right++;
    else bilateral++;
  }
  return isUnilateral ? bilateral + (left + right) / 2 : bilateral + left + right;
}

/**
 * Spec §4 — weekly per-muscle hard-set tallies for every ISO week present in `sets`
 * (plus any weeks listed in `ensureWeeks`, so the current week appears even when empty).
 */
export function weeklyVolume(
  inputs: readonly VolumeSetInput[],
  exercises: readonly Pick<Exercise, 'id' | 'is_unilateral'>[],
  credits: readonly ExerciseMuscleCredit[],
  targets: readonly MuscleVolumeTarget[],
  ensureWeeks: readonly string[] = [],
): WeekVolume[] {
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const creditsByEx = new Map<string, ExerciseMuscleCredit[]>();
  for (const c of credits) {
    const arr = creditsByEx.get(c.exercise_id) ?? [];
    arr.push(c);
    creditsByEx.set(c.exercise_id, arr);
  }
  const targetByMuscle = new Map(targets.map((t) => [t.muscle_group_key, t]));

  // group sets by week → workout_exercise
  const byWeek = new Map<string, Map<string, { exercise_id: string; sets: VolumeSetInput['set'][] }>>();
  for (const w of ensureWeeks) byWeek.set(w, new Map());
  for (const { set, exercise_id } of inputs) {
    const week = isoWeekKey(dateOf(set.completed_at));
    const wk = byWeek.get(week) ?? new Map();
    byWeek.set(week, wk);
    const g = wk.get(set.workout_exercise_id) ?? { exercise_id, sets: [] };
    g.sets.push(set);
    wk.set(set.workout_exercise_id, g);
  }

  const out: WeekVolume[] = [];
  for (const [week, groups] of [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const tally = new Map<MuscleGroupKey, number>();
    for (const g of groups.values()) {
      const ex = exById.get(g.exercise_id);
      const n = effectiveHardSets(g.sets, ex?.is_unilateral ?? false);
      if (n === 0) continue;
      for (const c of creditsByEx.get(g.exercise_id) ?? []) {
        tally.set(c.muscle_group_key, (tally.get(c.muscle_group_key) ?? 0) + n * c.credit);
      }
    }
    const muscles: MuscleWeekVolume[] = MUSCLE_GROUP_KEYS.map((k) => {
      const t = targetByMuscle.get(k);
      const sets = Math.round((tally.get(k) ?? 0) * 100) / 100;
      return { muscle_group_key: k, sets, min_sets: t?.active ? t.min_sets : null, max_sets: t?.active ? t.max_sets : null, status: classifyVolume(sets, t) };
    });
    out.push({ week, muscles });
  }
  return out;
}
