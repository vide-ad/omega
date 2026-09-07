import type { Workout } from '@omega/core';
import { exerciseCompromisedReasons, workoutCompromisedReasons } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';
import { weekForWorkout } from './context.js';
import { loadConstraintContext, refreshProgressionState, slotForWorkoutExercise, type ConstraintContext } from './prescription.js';

/**
 * Recomputes and stores `workout.is_compromised` (session rules: manual flag, RHR vs 30-day median,
 * sleep, deload) and every `workout_exercise.is_compromised` (pain moderate/stop on a set, soreness ≥ 4
 * on a trained muscle) per docs/ENGINE-RULES.md. Returns the updated workout.
 */
export function recomputeWorkoutCompromise(db: Db, workout: Workout): Workout {
  const readiness = repo.getReadinessByDate(db, workout.date);
  const week = weekForWorkout(db, workout);
  const sessionReasons = workoutCompromisedReasons({
    date: workout.date,
    readiness,
    readinessHistory: repo.listAllReadiness(db),
    week,
  });
  const isCompromised = sessionReasons.length > 0;
  repo.setWorkoutCompromised(db, workout.id, isCompromised);

  const soreness = repo.listSorenessByDate(db, workout.date);
  for (const we of repo.listWorkoutExercises(db, workout.id)) {
    const reasons = exerciseCompromisedReasons(repo.listSets(db, we.id), soreness, repo.listCredits(db, we.exercise_id));
    repo.setWorkoutExerciseCompromised(db, we.id, reasons.length > 0);
  }
  return { ...workout, is_compromised: isCompromised, readiness_id: readiness ? readiness.id : workout.readiness_id };
}

/** Re-runs the engine for every exercise in the workout with `today` = the workout date, refreshing progression_state. */
export function refreshProgressionForWorkout(db: Db, workout: Workout, cc: ConstraintContext = loadConstraintContext(db)): void {
  const week = weekForWorkout(db, workout);
  for (const we of repo.listWorkoutExercises(db, workout.id)) {
    const exercise = repo.getExercise(db, we.exercise_id);
    if (!exercise) continue;
    refreshProgressionState(db, exercise, slotForWorkoutExercise(db, workout, we), week, workout.date, cc);
  }
}

/** Completion (or a readiness change on the workout's date): recompute the compromise caches, then refresh progression. */
export function finalizeWorkout(db: Db, workout: Workout): Workout {
  const updated = recomputeWorkoutCompromise(db, workout);
  refreshProgressionForWorkout(db, updated);
  return updated;
}

/** After a set changes on a completed workout: refresh that exercise's compromise cache and progression state. */
export function afterSetChange(db: Db, workoutExerciseId: string): void {
  const we = repo.getWorkoutExercise(db, workoutExerciseId);
  if (!we) return;
  const workout = repo.getWorkout(db, we.workout_id);
  if (!workout || workout.completed_at === null) return;
  const reasons = exerciseCompromisedReasons(repo.listSets(db, we.id), repo.listSorenessByDate(db, workout.date), repo.listCredits(db, we.exercise_id));
  repo.setWorkoutExerciseCompromised(db, we.id, reasons.length > 0);
  const exercise = repo.getExercise(db, we.exercise_id);
  if (!exercise) return;
  refreshProgressionState(db, exercise, slotForWorkoutExercise(db, workout, we), weekForWorkout(db, workout), workout.date, loadConstraintContext(db));
}
