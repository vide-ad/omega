import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Paginated, SetLog, Workout, WorkoutListItem } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';
import { notFound, validationError } from '../errors.js';
import { decodeCursor, paginate, parseLimit } from '../pagination.js';
import { afterSetChange, finalizeWorkout, refreshProgressionForWorkout } from '../services/compromise.js';
import type { AppContext } from '../services/context.js';
import { nowIso, today } from '../services/context.js';
import { loadConstraintContext, refreshProgressionState, slotForWorkoutExercise } from '../services/prescription.js';
import { addExerciseToWorkout, createWorkout, workoutDetail } from '../services/workouts.js';
import { parseBool, parseOptionalDate, setCreateSchema, setPatchSchema, workoutCreateSchema, workoutExerciseAddSchema, workoutPatchSchema } from '../validation.js';
import { body, param, type Env } from './shared.js';

const isCursor = (v: unknown): v is { date: string; id: string } =>
  typeof v === 'object' && v !== null && typeof (v as { date?: unknown }).date === 'string' && typeof (v as { id?: unknown }).id === 'string';

function mustGetWorkout(db: Db, id: string): Workout {
  const w = repo.getWorkout(db, id);
  if (!w) throw notFound('workout', id);
  return w;
}

/**
 * Set-level rules from docs/API.md. An AMRAP set is forced to RIR 0 and to observed, because going to
 * failure is an observation whatever the client sent. Side must match the exercise's laterality.
 */
export function normaliseSet(db: Db, s: SetLog): SetLog {
  const we = repo.getWorkoutExercise(db, s.workout_exercise_id);
  if (!we) throw notFound('workout_exercise', s.workout_exercise_id);
  const exercise = repo.getExercise(db, we.exercise_id);
  if (!exercise) throw notFound('exercise', we.exercise_id);
  if (exercise.is_unilateral && s.side === 'bilateral') throw validationError(`${exercise.name} is unilateral: side must be left or right`, { field: 'side' });
  if (!exercise.is_unilateral && s.side !== 'bilateral') throw validationError(`${exercise.name} is bilateral: side must be 'bilateral'`, { field: 'side' });
  const rir_observed = s.rir_observed ?? true;
  return s.is_amrap ? { ...s, rir: 0, rir_observed: true } : { ...s, rir_observed };
}

export function workoutRoutes(ctx: AppContext): Hono<Env> {
  const { db } = ctx;
  const r = new Hono<Env>();

  r.get('/workouts', (c) => {
    const q = c.req.query();
    const limit = parseLimit(q.limit);
    const rows = repo.listWorkouts(db, {
      from: parseOptionalDate(q.from, 'from'), to: parseOptionalDate(q.to, 'to'), exercise_id: q.exercise_id || undefined, limit,
      before: decodeCursor(q.cursor, isCursor),
    });
    const includeSets = parseBool(q.include_sets) ?? false;
    const page = paginate(rows, limit, (w) => ({ date: w.date, id: w.id }));
    const res: Paginated<WorkoutListItem> = {
      items: page.items.map((w) => (includeSets ? { ...w, sets: repo.listSetsForWorkout(db, w.id) } : w)),
      next_cursor: page.next_cursor,
    };
    return c.json(res);
  });

  r.get('/workouts/:id', (c) => c.json(workoutDetail(db, mustGetWorkout(db, param(c, 'id')))));

  r.post('/workouts', async (c) => {
    const input = await body(c, workoutCreateSchema);
    const { detail, created } = createWorkout(db, input);
    return c.json(detail, created ? 201 : 200);
  });

  r.patch('/workouts/:id', async (c) => {
    const existing = mustGetWorkout(db, param(c, 'id'));
    const input = await body(c, workoutPatchSchema);
    let w: Workout = { ...existing, ...input };
    db.transaction(() => {
      repo.updateWorkout(db, w);
      if ('completed_at' in input) w = finalizeWorkout(db, w);
    });
    return c.json(workoutDetail(db, repo.getWorkout(db, w.id)!));
  });

  r.delete('/workouts/:id', (c) => {
    const w = mustGetWorkout(db, param(c, 'id'));
    const exerciseIds = repo.listWorkoutExercises(db, w.id).map((x) => x.exercise_id);
    db.transaction(() => {
      repo.deleteWorkout(db, w.id);
      // The cache derived from history must forget this session.
      const cc = loadConstraintContext(db);
      const t = today(ctx);
      for (const id of exerciseIds) {
        const exercise = repo.getExercise(db, id);
        if (!exercise) continue;
        const slot = repo.latestTemplateExerciseFor(db, id);
        refreshProgressionState(db, exercise, slot ?? { base_sets: 3, is_priority: false, rep_low: exercise.default_rep_low, rep_high: exercise.default_rep_high, rir_target: exercise.default_rir_target, last_set_amrap: false }, null, t, cc);
      }
    });
    return c.body(null, 204);
  });

  r.post('/workouts/:id/exercises', async (c) => {
    const w = mustGetWorkout(db, param(c, 'id'));
    const input = await body(c, workoutExerciseAddSchema);
    const { detail, created } = addExerciseToWorkout(db, w, input);
    return c.json(detail, created ? 201 : 200);
  });

  r.delete('/workouts/:id/exercises/:weid', (c) => {
    const w = mustGetWorkout(db, param(c, 'id'));
    const weid = param(c, 'weid');
    const we = repo.getWorkoutExercise(db, weid);
    // A second delete of the same exercise is a 404, not a 500. Same for an id from another workout.
    if (!we || we.workout_id !== w.id) throw notFound('workout_exercise', weid);
    const exercise = repo.getExercise(db, we.exercise_id);
    db.transaction(() => {
      repo.deleteWorkoutExercise(db, we.id);   // set_logs cascade on the FK
      // The progression cache is derived from history, and this session's history just changed.
      if (exercise) {
        const slot = repo.latestTemplateExerciseFor(db, exercise.id);
        refreshProgressionState(db, exercise, slot ?? { base_sets: 3, is_priority: false, rep_low: exercise.default_rep_low, rep_high: exercise.default_rep_high, rir_target: exercise.default_rir_target, last_set_amrap: false }, null, today(ctx), loadConstraintContext(db));
      }
      // Removing an exercise can change whether the session counts as compromised.
      const workout = repo.getWorkout(db, w.id);
      if (workout && workout.completed_at !== null) finalizeWorkout(db, workout);
    });
    return c.body(null, 204);
  });

  r.post('/workouts/:id/sets', async (c) => {
    const w = mustGetWorkout(db, param(c, 'id'));
    const input = await body(c, setCreateSchema);
    if (input.id) {
      const existing = repo.getSet(db, input.id);
      if (existing) return c.json(existing, 200);
    }
    const we = repo.getWorkoutExercise(db, input.workout_exercise_id);
    if (!we || we.workout_id !== w.id) throw notFound('workout_exercise', input.workout_exercise_id);
    const set = normaliseSet(db, { ...input, id: input.id ?? randomUUID(), completed_at: input.completed_at ?? nowIso(ctx) } as SetLog);
    db.transaction(() => {
      repo.insertSet(db, set);
      afterSetChange(db, set.workout_exercise_id);
    });
    return c.json(repo.getSet(db, set.id), 201);
  });

  r.patch('/sets/:id', async (c) => {
    const existing = repo.getSet(db, param(c, 'id'));
    if (!existing) throw notFound('set', c.req.param('id'));
    const input = await body(c, setPatchSchema);
    const set = normaliseSet(db, { ...existing, ...input });
    db.transaction(() => {
      repo.updateSet(db, set);
      afterSetChange(db, set.workout_exercise_id);
    });
    return c.json(repo.getSet(db, set.id));
  });

  r.delete('/sets/:id', (c) => {
    const existing = repo.getSet(db, param(c, 'id'));
    if (!existing) throw notFound('set', c.req.param('id'));
    db.transaction(() => {
      repo.deleteSet(db, existing.id);
      afterSetChange(db, existing.workout_exercise_id);
    });
    return c.body(null, 204);
  });

  return r;
}

// Re-exported for tests/other modules that need to refresh after bulk edits.
export { refreshProgressionForWorkout, slotForWorkoutExercise };
