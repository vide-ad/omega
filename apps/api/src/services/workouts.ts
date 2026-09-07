import { randomUUID } from 'node:crypto';
import type { Exercise, Prescription, Workout, WorkoutDetail, WorkoutExercise, WorkoutExerciseDetail } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';
import { conflict, notFound, validationError } from '../errors.js';
import { resolveWeek, weekForWorkout } from './context.js';
import { defaultSlot, historyFor, loadConstraintContext, prescribeFor, type TemplateSlot } from './prescription.js';

/** Copies an engine prescription onto a workout_exercises row. */
export function rowFromPrescription(base: { id: string; workout_id: string; exercise_id: string; order: number; rest_seconds: number; notes: string | null }, p: Prescription): WorkoutExercise {
  return {
    ...base,
    target_sets: p.target_sets,
    target_rep_low: p.target_rep_low,
    target_rep_high: p.target_rep_high,
    target_rir: p.target_rir,
    suggested_weight_kg: p.suggested_weight_kg,
    target_reps_by_set: p.target_reps_by_set,
    target_tempo: p.target_tempo,
    last_set_amrap: p.last_set_amrap,
    reason: p.reason,
    rationale: p.rationale,
    flags: p.flags,
    constraint_notes: p.constraint_notes,
    based_on_workout_id: p.based_on_workout_id,
    is_compromised: false,
  };
}

export interface CreateWorkoutInput { id?: string; template_id: string; date: string }

/**
 * POST /workouts: instantiates the template's current version for `date`, resolves the mesocycle week,
 * links that day's readiness log, runs the engine per template exercise and stores each prescription.
 * Blocked exercises are omitted and returned separately.
 */
export function createWorkout(db: Db, input: CreateWorkoutInput): { detail: WorkoutDetail; created: boolean } {
  if (input.id) {
    const existing = repo.getWorkout(db, input.id);
    if (existing) return { detail: workoutDetail(db, existing), created: false };
  }
  const template = repo.getTemplate(db, input.template_id);
  if (!template) throw notFound('template', input.template_id);
  const slots = repo.listTemplateExercises(db, template.id, template.version);
  const { mesocycle, week_number, week } = resolveWeek(db, input.date);
  const readiness = repo.getReadinessByDate(db, input.date);
  const cc = loadConstraintContext(db);
  const id = input.id ?? randomUUID();

  const omitted: WorkoutDetail['omitted'] = [];
  db.transaction(() => {
    const workout: Workout = {
      id,
      template_id: template.id,
      template_version: template.version,
      mesocycle_id: week_number !== null && mesocycle ? mesocycle.id : null,
      week_number,
      date: input.date,
      started_at: null,
      completed_at: null,
      readiness_id: readiness ? readiness.id : null,
      session_rpe: null,
      notes: null,
      is_compromised: false,
    };
    repo.insertWorkout(db, workout);
    let order = 0;
    for (const te of slots) {
      const exercise = repo.getExercise(db, te.exercise_id);
      if (!exercise) continue;
      const r = prescribeFor(db, { exercise, slot: te, week, today: input.date, cc, history: historyFor(db, exercise.id, { upToDate: input.date, excludeWorkoutId: id }) });
      if (r.prescription.omit) { omitted.push({ exercise, prescription: r.prescription }); continue; }
      order += 1;
      repo.insertWorkoutExercise(db, rowFromPrescription({ id: randomUUID(), workout_id: id, exercise_id: exercise.id, order, rest_seconds: te.rest_seconds, notes: te.notes }, r.prescription));
      repo.upsertState(db, r.next_state);
    }
  });
  const workout = repo.getWorkout(db, id)!;
  return { detail: { ...workoutDetail(db, workout), omitted }, created: true };
}

export interface AddExerciseInput {
  id?: string;
  exercise_id: string;
  order?: number;
  target_sets?: number;
  target_rep_low?: number;
  target_rep_high?: number;
  target_rir?: number;
  rest_seconds?: number;
  notes?: string | null;
  is_priority?: boolean;
  last_set_amrap?: boolean;
}

/** POST /workouts/:id/exercises — ad-hoc add; the engine still runs, seeded from the latest template slot or the exercise defaults. */
export function addExerciseToWorkout(db: Db, workout: Workout, input: AddExerciseInput): { detail: WorkoutExerciseDetail; created: boolean } {
  if (input.id) {
    const existing = repo.getWorkoutExercise(db, input.id);
    if (existing) {
      if (existing.workout_id !== workout.id) throw conflict(`workout_exercise ${input.id} belongs to another workout`);
      return { detail: exerciseDetail(db, workout, existing), created: false };
    }
  }
  const exercise = repo.getExercise(db, input.exercise_id);
  if (!exercise) throw notFound('exercise', input.exercise_id);
  if (input.target_rep_low !== undefined && input.target_rep_high !== undefined && input.target_rep_high < input.target_rep_low) {
    throw validationError('target_rep_high must be ≥ target_rep_low');
  }
  const base = repo.latestTemplateExerciseFor(db, exercise.id) ?? { ...defaultSlot(exercise), rest_seconds: exercise.default_rest_seconds, notes: null };
  const slot: TemplateSlot = {
    base_sets: input.target_sets ?? base.base_sets,
    is_priority: input.is_priority ?? base.is_priority,
    rep_low: input.target_rep_low ?? base.rep_low,
    rep_high: input.target_rep_high ?? base.rep_high,
    rir_target: input.target_rir ?? base.rir_target,
    last_set_amrap: input.last_set_amrap ?? base.last_set_amrap,
  };
  const cc = loadConstraintContext(db);
  const r = prescribeFor(db, { exercise, slot, week: weekForWorkout(db, workout), today: workout.date, cc, history: historyFor(db, exercise.id, { upToDate: workout.date, excludeWorkoutId: workout.id }) });
  if (r.prescription.omit) throw conflict(`${exercise.name} is blocked by an active injury constraint`, r.prescription);
  const id = input.id ?? randomUUID();
  const row = rowFromPrescription({
    id, workout_id: workout.id, exercise_id: exercise.id,
    order: input.order ?? repo.maxWorkoutExerciseOrder(db, workout.id) + 1,
    rest_seconds: input.rest_seconds ?? base.rest_seconds,
    notes: input.notes ?? null,
  }, r.prescription);
  // Explicit set/RIR overrides win over the mesocycle ramp (the user asked for exactly this); rep
  // targets were fed to the engine through the slot, so its constraint-clamped output is final.
  if (input.target_sets !== undefined) row.target_sets = input.target_sets;
  if (input.target_rir !== undefined) row.target_rir = input.target_rir;
  db.transaction(() => {
    repo.insertWorkoutExercise(db, row);
    repo.upsertState(db, r.next_state);
  });
  return { detail: exerciseDetail(db, workout, repo.getWorkoutExercise(db, id)!), created: true };
}

export function exerciseDetail(db: Db, workout: Workout, we: WorkoutExercise, exercise: Exercise | null = repo.getExercise(db, we.exercise_id)): WorkoutExerciseDetail {
  if (!exercise) throw notFound('exercise', we.exercise_id);
  const prev = repo.previousPerformance(db, we.exercise_id, workout.date, workout.id);
  return {
    workout_exercise: we,
    exercise,
    prescription: repo.prescriptionOf(we),
    previous: prev ? {
      workout_id: prev.workout_id,
      date: prev.date,
      sets: prev.sets.map((s) => ({ set_index: s.set_index, side: s.side, weight_kg: s.weight_kg, reps: s.reps, rir: s.rir, is_warmup: s.is_warmup, is_amrap: s.is_amrap })),
    } : null,
    sets: repo.listSets(db, we.id),
  };
}

export function workoutDetail(db: Db, workout: Workout): WorkoutDetail {
  return {
    workout,
    template_name: workout.template_id ? repo.templateNameForVersion(db, workout.template_id, workout.template_version) : null,
    exercises: repo.listWorkoutExercises(db, workout.id).map((we) => exerciseDetail(db, workout, we)),
    omitted: [],
  };
}
