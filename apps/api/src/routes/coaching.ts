import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { ExerciseConstraint, Injury, InjuryWithConstraints, MuscleVolumeTarget, ProgressionSummaryItem, VolumeResponse } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';
import { notFound, validationError } from '../errors.js';
import type { AppContext } from '../services/context.js';
import { resolveWeek, today } from '../services/context.js';
import { loadConstraintContext } from '../services/prescription.js';
import { computeProgression, progressionDetail, progressionExercises } from '../services/progression.js';
import { buildSummary } from '../services/summary.js';
import { volumeWeeks } from '../services/volume.js';
import { constraintCreateSchema, constraintPatchSchema, injuryCreateSchema, injuryPatchSchema, injuryStatusSchema, muscleKeySchema, parseWeeks, volumeTargetPutSchema } from '../validation.js';
import { body, param, type Env } from './shared.js';

function withConstraints(db: Db, i: Injury): InjuryWithConstraints {
  return { ...i, constraints: repo.listConstraints(db, i.id) };
}

function checkConstraintTarget(db: Db, c: Pick<ExerciseConstraint, 'exercise_id' | 'movement_pattern'>): void {
  if (c.exercise_id === null && c.movement_pattern === null) throw validationError('exercise_id or movement_pattern is required');
  if (c.exercise_id !== null && !repo.getExercise(db, c.exercise_id)) throw notFound('exercise', c.exercise_id);
}

export function coachingRoutes(ctx: AppContext): Hono<Env> {
  const { db } = ctx;
  const r = new Hono<Env>();

  // --- reads ---------------------------------------------------------------

  r.get('/volume', (c) => {
    const weeks = parseWeeks(c.req.query('weeks'));
    const res: VolumeResponse = { weeks: volumeWeeks(db, today(ctx), weeks), targets: repo.listTargets(db) };
    return c.json(res);
  });

  r.get('/progression', (c) => {
    const t = today(ctx);
    const rw = resolveWeek(db, t);
    const cc = loadConstraintContext(db);
    const templateId = c.req.query('template_id') || undefined;
    if (templateId && !repo.getTemplate(db, templateId)) throw notFound('template', templateId);
    const items: ProgressionSummaryItem[] = progressionExercises(db).map((e) => computeProgression(db, e, t, rw, cc, templateId).item);
    return c.json({ items });
  });

  r.get('/progression/:exercise_id', (c) => {
    const exercise = repo.getExercise(db, param(c, 'exercise_id'));
    if (!exercise) throw notFound('exercise', c.req.param('exercise_id'));
    const templateId = c.req.query('template_id') || undefined;
    if (templateId && !repo.getTemplate(db, templateId)) throw notFound('template', templateId);
    const t = today(ctx);
    return c.json(progressionDetail(db, computeProgression(db, exercise, t, resolveWeek(db, t), loadConstraintContext(db), templateId)));
  });

  r.get('/summary', (c) => c.json(buildSummary(ctx, parseWeeks(c.req.query('weeks')))));

  r.get('/injuries', (c) => {
    const raw = c.req.query('status');
    let status: Injury['status'] | undefined;
    if (raw) {
      const p = injuryStatusSchema.safeParse(raw);
      if (!p.success) throw validationError('status must be active, monitoring or resolved');
      status = p.data;
    }
    return c.json({ items: repo.listInjuries(db, status).map((i) => withConstraints(db, i)) });
  });

  r.get('/injuries/:id', (c) => {
    const i = repo.getInjury(db, param(c, 'id'));
    if (!i) throw notFound('injury', c.req.param('id'));
    return c.json(withConstraints(db, i));
  });

  // --- writes --------------------------------------------------------------

  r.get('/volume-targets', (c) => c.json({ items: repo.listTargets(db) }));

  r.put('/volume-targets/:muscle_group_key', async (c) => {
    const key = muscleKeySchema.safeParse(param(c, 'muscle_group_key'));
    if (!key.success) throw notFound('muscle group', c.req.param('muscle_group_key'));
    const input = await body(c, volumeTargetPutSchema);
    const t: MuscleVolumeTarget = { muscle_group_key: key.data as MuscleVolumeTarget['muscle_group_key'], ...input };
    repo.upsertTarget(db, t);
    return c.json(repo.getTarget(db, t.muscle_group_key));
  });

  r.post('/injuries', async (c) => {
    const input = await body(c, injuryCreateSchema);
    if (input.id) {
      const existing = repo.getInjury(db, input.id);
      if (existing) return c.json(withConstraints(db, existing), 200);
    }
    const injury: Injury = { ...input, id: input.id ?? randomUUID() };
    repo.insertInjury(db, injury);
    return c.json(withConstraints(db, injury), 201);
  });

  r.patch('/injuries/:id', async (c) => {
    const existing = repo.getInjury(db, param(c, 'id'));
    if (!existing) throw notFound('injury', c.req.param('id'));
    const input = await body(c, injuryPatchSchema);
    const injury: Injury = { ...existing, ...input };
    if (injury.status === 'resolved' && injury.resolved_at === null && input.resolved_at === undefined) injury.resolved_at = today(ctx);
    repo.updateInjury(db, injury);
    return c.json(withConstraints(db, injury));
  });

  r.post('/injuries/:id/constraints', async (c) => {
    const injury = repo.getInjury(db, param(c, 'id'));
    if (!injury) throw notFound('injury', c.req.param('id'));
    const input = await body(c, constraintCreateSchema);
    if (input.id) {
      const existing = repo.getConstraint(db, input.id);
      if (existing) return c.json(existing, 200);
    }
    const constraint: ExerciseConstraint = { ...input, id: input.id ?? randomUUID(), injury_id: injury.id } as ExerciseConstraint;
    checkConstraintTarget(db, constraint);
    repo.insertConstraint(db, constraint);
    return c.json(repo.getConstraint(db, constraint.id), 201);
  });

  r.patch('/constraints/:id', async (c) => {
    const existing = repo.getConstraint(db, param(c, 'id'));
    if (!existing) throw notFound('constraint', c.req.param('id'));
    const input = await body(c, constraintPatchSchema);
    const constraint: ExerciseConstraint = { ...existing, ...input } as ExerciseConstraint;
    checkConstraintTarget(db, constraint);
    repo.updateConstraint(db, constraint);
    return c.json(repo.getConstraint(db, constraint.id));
  });

  r.delete('/constraints/:id', (c) => {
    if (!repo.deleteConstraint(db, param(c, 'id'))) throw notFound('constraint', c.req.param('id'));
    return c.body(null, 204);
  });

  return r;
}
