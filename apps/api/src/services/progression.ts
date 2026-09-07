import type { Exercise, Prescription, ProgressionDetail, ProgressionSummaryItem, SessionAnalysis, WorkoutExercise } from '@omega/core';
import { ROLLING_WINDOW_DAYS, analyzeSession, daysBetween } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';
import type { ResolvedWeek } from './context.js';
import { defaultSlot, prescribeFor, type ConstraintContext } from './prescription.js';

export interface ProgressionComputation {
  item: ProgressionSummaryItem;
  analyses: SessionAnalysis[];   // newest first
  next: Prescription;
}

/** Runs the engine for `today` and analyses every stored session of the exercise. */
export function computeProgression(db: Db, exercise: Exercise, todayDate: string, rw: ResolvedWeek, cc: ConstraintContext, templateId?: string): ProgressionComputation {
  const slot = repo.latestTemplateExerciseFor(db, exercise.id, templateId) ?? repo.latestTemplateExerciseFor(db, exercise.id) ?? defaultSlot(exercise);
  const rows = repo.exerciseHistory(db, exercise.id, { upToDate: todayDate });
  const r = prescribeFor(db, { exercise, slot, week: rw.week, today: todayDate, cc, history: rows });
  const analyses = rows
    .map((h) => analyzeSession(h, exercise.is_unilateral, todayDate))
    .sort((a, b) => b.record.workout.date.localeCompare(a.record.workout.date) || b.record.workout.id.localeCompare(a.record.workout.id));
  const lastQualifying = analyses.find((a) => a.done && a.qualifying);
  const inWindow = analyses.filter((a) => a.units.length > 0 && a.done && daysBetween(a.record.workout.date, todayDate) <= ROLLING_WINDOW_DAYS);
  const item: ProgressionSummaryItem = {
    exercise: { id: exercise.id, name: exercise.name, movement_pattern: exercise.movement_pattern },
    state: repo.getState(db, exercise.id),
    next: r.prescription,
    last_qualifying_date: lastQualifying ? lastQualifying.record.workout.date : null,
    sessions_in_window: inWindow.length,
  };
  return { item, analyses, next: r.prescription };
}

export function progressionDetail(db: Db, comp: ProgressionComputation): ProgressionDetail {
  return {
    ...comp.item,
    history: comp.analyses.map((a) => ({
      workout_id: a.record.workout.id,
      date: a.record.workout.date,
      qualifying: a.qualifying,
      non_qualifying_reason: a.non_qualifying_reason,
      weight_kg: a.weight_kg,
      reps: a.reps,
      mean_rir: a.mean_rir === null ? null : Math.round(a.mean_rir * 100) / 100,
      best_e1rm: a.best_e1rm === null ? null : Math.round(a.best_e1rm * 100) / 100,
      prescription: repo.prescriptionOf(a.record.workout_exercise as WorkoutExercise),
    })),
  };
}

/** Exercises that show up in GET /progression: non-archived, with at least one session or a state row. */
export function progressionExercises(db: Db): Exercise[] {
  const withHistory = repo.exerciseIdsWithHistory(db);
  const withState = new Set(repo.listStates(db).map((s) => s.exercise_id));
  return repo.listAllExercises(db).filter((e) => withHistory.has(e.id) || withState.has(e.id));
}
