import type { Exercise, ExerciseConstraint, ExerciseSessionRecord, Injury, MesocycleWeek, PrescribeResult, TemplateExercise } from '@omega/core';
import { activeConstraintsFor, prescribe } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';

export type TemplateSlot = Pick<TemplateExercise, 'base_sets' | 'is_priority' | 'rep_low' | 'rep_high' | 'rir_target' | 'last_set_amrap'>;

/** Injury/constraint context loaded once per request. */
export interface ConstraintContext {
  injuries: Injury[];
  constraints: ExerciseConstraint[];
}

export function loadConstraintContext(db: Db): ConstraintContext {
  return { injuries: repo.listInjuries(db), constraints: repo.listConstraints(db) };
}

export function constraintsFor(exercise: Exercise, cc: ConstraintContext): ExerciseConstraint[] {
  return activeConstraintsFor(exercise, cc.constraints, cc.injuries);
}

/** Engine history for an exercise: every prior workout_exercise with sets and parent workout fields. */
export function historyFor(db: Db, exerciseId: string, opts: { upToDate?: string; excludeWorkoutId?: string } = {}): ExerciseSessionRecord[] {
  return repo.exerciseHistory(db, exerciseId, opts).map((h) => ({ workout: h.workout, workout_exercise: h.workout_exercise, sets: h.sets }));
}

/** A slot built from the exercise's own defaults, for exercises that appear in no template. */
export function defaultSlot(exercise: Exercise): TemplateSlot {
  return {
    base_sets: 3,
    is_priority: false,
    rep_low: exercise.default_rep_low,
    rep_high: exercise.default_rep_high,
    rir_target: exercise.default_rir_target,
    last_set_amrap: false,
  };
}

export interface PrescribeForOptions {
  exercise: Exercise;
  slot: TemplateSlot;
  week: MesocycleWeek | null;
  today: string;
  cc: ConstraintContext;
  history: ExerciseSessionRecord[];
}

/** Runs the engine with the API's standard input assembly (starting load from progression_state). */
export function prescribeFor(db: Db, o: PrescribeForOptions): PrescribeResult {
  const state = repo.getState(db, o.exercise.id);
  return prescribe({
    exercise: o.exercise,
    template: o.slot,
    week: o.week,
    history: o.history,
    constraints: constraintsFor(o.exercise, o.cc),
    // A cached working weight of 0 means "never established" (the engine's own fallback), not
    // "start at 0 kg" — an exercise with no history must still prompt for a starting load.
    starting_load_kg: state && state.working_weight_kg > 0 ? state.working_weight_kg : null,
    today: o.today,
  });
}

/**
 * Refreshes the progression_state cache for an exercise as of `today` (all history up to and
 * including that date). Used after a session completes or its readiness/sets change.
 */
export function refreshProgressionState(db: Db, exercise: Exercise, slot: TemplateSlot, week: MesocycleWeek | null, todayDate: string, cc: ConstraintContext): void {
  const r = prescribeFor(db, { exercise, slot, week, today: todayDate, cc, history: historyFor(db, exercise.id, { upToDate: todayDate }) });
  repo.upsertState(db, r.next_state);
}

/** The slot a stored workout_exercise was prescribed from: its template version's row, else the latest slot, else the row itself. */
export function slotForWorkoutExercise(db: Db, workout: { template_id: string | null; template_version: number | null }, we: { exercise_id: string; target_sets: number; target_rep_low: number; target_rep_high: number; target_rir: number; last_set_amrap: boolean }): TemplateSlot {
  if (workout.template_id && workout.template_version !== null) {
    const te = repo.templateExerciseInVersion(db, workout.template_id, workout.template_version, we.exercise_id);
    if (te) return te;
  }
  const latest = repo.latestTemplateExerciseFor(db, we.exercise_id);
  if (latest) return latest;
  return { base_sets: we.target_sets, is_priority: false, rep_low: we.target_rep_low, rep_high: we.target_rep_high, rir_target: we.target_rir, last_set_amrap: we.last_set_amrap };
}
