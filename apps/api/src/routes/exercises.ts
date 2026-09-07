import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Exercise, ExerciseDetail, ExerciseWithCredits, Paginated } from '@omega/core';
import * as repo from '../db/repos/index.js';
import { notFound, validationError } from '../errors.js';
import { decodeCursor, paginate, parseLimit } from '../pagination.js';
import type { AppContext } from '../services/context.js';
import { nowIso } from '../services/context.js';
import { constraintsFor, loadConstraintContext } from '../services/prescription.js';
import { exerciseCreateSchema, exercisePatchSchema, muscleKeySchema, movementPatternSchema, parseBool } from '../validation.js';
import { body, param, type Env } from './shared.js';

function withCredits(db: AppContext['db'], e: Exercise): ExerciseWithCredits {
  return { ...e, credits: repo.listCredits(db, e.id) };
}

function validateCredits(credits: ReadonlyArray<{ muscle_group_key: string }>): void {
  const seen = new Set<string>();
  for (const c of credits) {
    if (seen.has(c.muscle_group_key)) throw validationError(`duplicate credit for ${c.muscle_group_key}`);
    seen.add(c.muscle_group_key);
  }
}

const isCursor = (v: unknown): v is { name: string; id: string } =>
  typeof v === 'object' && v !== null && typeof (v as { name?: unknown }).name === 'string' && typeof (v as { id?: unknown }).id === 'string';

export function exerciseRoutes(ctx: AppContext): Hono<Env> {
  const { db } = ctx;
  const r = new Hono<Env>();

  r.get('/muscle-groups', (c) => c.json({ items: repo.listMuscleGroups(db) }));

  r.get('/exercises', (c) => {
    const q = c.req.query();
    const muscle = q.muscle ? muscleKeySchema.safeParse(q.muscle) : null;
    if (muscle && !muscle.success) throw validationError('muscle is not a known muscle group key');
    const pattern = q.pattern ? movementPatternSchema.safeParse(q.pattern) : null;
    if (pattern && !pattern.success) throw validationError('pattern is not a known movement pattern');
    const limit = parseLimit(q.limit);
    const rows = repo.listExercises(db, {
      muscle: muscle?.data, pattern: pattern?.data, archived: parseBool(q.archived), q: q.q?.trim() || undefined, limit,
      after: decodeCursor(q.cursor, isCursor),
    });
    const page = paginate(rows, limit, (e) => ({ name: e.name, id: e.id }));
    const res: Paginated<ExerciseWithCredits> = { items: page.items.map((e) => withCredits(db, e)), next_cursor: page.next_cursor };
    return c.json(res);
  });

  r.get('/exercises/:id', (c) => {
    const e = repo.getExercise(db, param(c, 'id'));
    if (!e) throw notFound('exercise', c.req.param('id'));
    const res: ExerciseDetail = { ...withCredits(db, e), active_constraints: constraintsFor(e, loadConstraintContext(db)) };
    return c.json(res);
  });

  r.post('/exercises', async (c) => {
    const input = await body(c, exerciseCreateSchema);
    if (input.id) {
      const existing = repo.getExercise(db, input.id);
      if (existing) return c.json(withCredits(db, existing), 200);
    }
    validateCredits(input.credits);
    const { credits, id: suppliedId, ...fields } = input;
    const e: Exercise = { id: suppliedId ?? randomUUID(), created_at: nowIso(ctx), ...fields } as Exercise;
    db.transaction(() => {
      repo.insertExercise(db, e);
      repo.replaceCredits(db, e.id, credits as Parameters<typeof repo.replaceCredits>[2]);
    });
    return c.json(withCredits(db, e), 201);
  });

  r.patch('/exercises/:id', async (c) => {
    const existing = repo.getExercise(db, param(c, 'id'));
    if (!existing) throw notFound('exercise', c.req.param('id'));
    const input = await body(c, exercisePatchSchema);
    const { credits, ...fields } = input;
    const merged: Exercise = { ...existing, ...fields } as Exercise;
    if (merged.default_rep_high < merged.default_rep_low) throw validationError('default_rep_high must be ≥ default_rep_low');
    if (credits) validateCredits(credits);
    db.transaction(() => {
      repo.updateExercise(db, merged);
      if (credits) repo.replaceCredits(db, merged.id, credits as Parameters<typeof repo.replaceCredits>[2]);
    });
    return c.json(withCredits(db, merged));
  });

  return r;
}
