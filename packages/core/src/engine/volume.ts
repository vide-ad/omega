import type { Exercise, ExerciseMuscleCredit, Mesocycle, MuscleGroupKey, MuscleVolumeTarget, SetLog } from '../types.js';
import { MUSCLE_GROUP_KEYS } from '../types.js';
import { weekWindowFor, type WeekWindow } from './mesocycle.js';

/** Spec §4 / §5.1 — a hard set is a working set with effective RIR ≤ 4; AMRAP ⇒ 0, null ⇒ assumed 2. */
export const HARD_SET_MAX_RIR = 4;
export const ASSUMED_RIR_WHEN_NULL = 2;

export function effectiveRir(s: Pick<SetLog, 'rir' | 'is_amrap'>): number {
  if (s.is_amrap) return 0;
  return s.rir ?? ASSUMED_RIR_WHEN_NULL;
}

export function isHardSet(s: Pick<SetLog, 'is_warmup' | 'rir' | 'is_amrap'>): boolean {
  if (s.is_warmup) return false;
  return effectiveRir(s) <= HARD_SET_MAX_RIR;
}

export interface VolumeSetInput {
  set: Pick<SetLog, 'id' | 'is_warmup' | 'rir' | 'is_amrap' | 'side' | 'set_index' | 'workout_exercise_id'>;
  exercise_id: string;
  /** The workout's calendar date (spec: weeks are assigned by Workout.date, not by set timestamps). */
  date: string;
}

export type VolumeStatus = 'under' | 'in_range' | 'over' | 'no_target';

export interface MuscleWeekVolume {
  muscle_group_key: MuscleGroupKey;
  sets: number;                      // fractional hard sets
  min_sets: number | null;
  max_sets: number | null;
  status: VolumeStatus;
}

export interface WeekVolume extends WeekWindow {
  /** True when `end` is today or later (the week is still being trained). */
  partial: boolean;
  muscles: MuscleWeekVolume[];
}

export function classifyVolume(sets: number, target: Pick<MuscleVolumeTarget, 'min_sets' | 'max_sets' | 'active'> | undefined): VolumeStatus {
  if (!target || !target.active) return 'no_target';
  if (sets < target.min_sets) return 'under';
  if (sets > target.max_sets) return 'over';
  return 'in_range';
}

/**
 * Effective hard-set count for one workout_exercise. Bilateral sets count 1 each. For unilateral
 * exercises, left/right sets sharing a `set_index` form one pair that counts 1.0 when the pair's
 * minimum effective RIR ≤ 4; a pair with only one side logged still counts 1.0 (spec §4).
 */
export function effectiveHardSets(sets: readonly Pick<SetLog, 'is_warmup' | 'rir' | 'is_amrap' | 'side' | 'set_index'>[], isUnilateral: boolean): number {
  if (!isUnilateral) return sets.filter(isHardSet).length;
  const pairs = new Map<number, number>(); // set_index → min effective rir
  for (const s of sets) {
    if (s.is_warmup) continue;
    const r = effectiveRir(s);
    const cur = pairs.get(s.set_index);
    pairs.set(s.set_index, cur === undefined ? r : Math.min(cur, r));
  }
  let n = 0;
  for (const r of pairs.values()) if (r <= HARD_SET_MAX_RIR) n++;
  return n;
}

export interface WeeklyVolumeOptions {
  /** Active mesocycle, for block-anchored weeks. */
  mesocycle?: Pick<Mesocycle, 'id' | 'start_date' | 'planned_weeks'> | null;
  /** Today, used for `partial` and to make sure the current week is present even when empty. */
  today?: string;
  /** Extra dates whose weeks must appear even when empty. */
  ensureDates?: readonly string[];
}

/** Spec §4 — weekly per-muscle hard-set tallies, one entry per week present in the inputs (plus ensured weeks). */
export function weeklyVolume(
  inputs: readonly VolumeSetInput[],
  exercises: readonly Pick<Exercise, 'id' | 'is_unilateral'>[],
  credits: readonly ExerciseMuscleCredit[],
  targets: readonly MuscleVolumeTarget[],
  opts: WeeklyVolumeOptions = {},
): WeekVolume[] {
  const meso = opts.mesocycle ?? null;
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const creditsByEx = new Map<string, ExerciseMuscleCredit[]>();
  for (const c of credits) {
    const arr = creditsByEx.get(c.exercise_id) ?? [];
    arr.push(c);
    creditsByEx.set(c.exercise_id, arr);
  }
  const targetByMuscle = new Map(targets.map((t) => [t.muscle_group_key, t]));

  const windows = new Map<string, WeekWindow>();
  const byWeek = new Map<string, Map<string, { exercise_id: string; sets: VolumeSetInput['set'][] }>>();
  const ensure = (date: string) => {
    const w = weekWindowFor(date, meso);
    if (!windows.has(w.key)) { windows.set(w.key, w); byWeek.set(w.key, new Map()); }
    return w.key;
  };
  for (const d of opts.ensureDates ?? []) ensure(d);
  if (opts.today) ensure(opts.today);
  for (const { set, exercise_id, date } of inputs) {
    const key = ensure(date);
    const wk = byWeek.get(key)!;
    const g = wk.get(set.workout_exercise_id) ?? { exercise_id, sets: [] };
    g.sets.push(set);
    wk.set(set.workout_exercise_id, g);
  }

  const out: WeekVolume[] = [];
  const ordered = [...windows.values()].sort((a, b) => a.start.localeCompare(b.start));
  for (const w of ordered) {
    const tally = new Map<MuscleGroupKey, number>();
    for (const g of byWeek.get(w.key)!.values()) {
      const n = effectiveHardSets(g.sets, exById.get(g.exercise_id)?.is_unilateral ?? false);
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
    out.push({ ...w, partial: opts.today ? w.end >= opts.today : false, muscles });
  }
  return out;
}
