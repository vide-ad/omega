import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { TemplateExercise, TemplateWithExercises, WorkoutTemplate } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';
import { notFound, validationError } from '../errors.js';
import type { AppContext } from '../services/context.js';
import { nowIso } from '../services/context.js';
import { parseBool, templateCreateSchema, templatePatchSchema } from '../validation.js';
import { body, param, type Env } from './shared.js';
import type { z } from 'zod';

type SlotInput = z.infer<typeof import('../validation.js').templateExerciseInputSchema>;

function templateWithExercises(db: Db, t: WorkoutTemplate, version = t.version): TemplateWithExercises {
  const exercises = repo.listTemplateExercises(db, t.id, version).map((te) => {
    const exercise = repo.getExercise(db, te.exercise_id);
    if (!exercise) throw notFound('exercise', te.exercise_id);
    return { ...te, exercise };
  });
  const snapshot = version === t.version ? null : db.get<{ name: string; day_label: string | null }>('SELECT name, day_label FROM template_versions WHERE template_id = $id AND version = $v', { id: t.id, v: version });
  return { ...t, ...(snapshot ? { name: snapshot.name, day_label: snapshot.day_label } : {}), version, exercises };
}

/** Builds template_exercises rows for a version, filling unspecified prescriptions from the exercise defaults. */
function buildSlots(db: Db, templateId: string, version: number, inputs: SlotInput[]): TemplateExercise[] {
  return inputs.map((s, i) => {
    const exercise = repo.getExercise(db, s.exercise_id);
    if (!exercise) throw notFound('exercise', s.exercise_id);
    const rep_low = s.rep_low ?? exercise.default_rep_low;
    const rep_high = s.rep_high ?? Math.max(exercise.default_rep_high, rep_low);
    if (rep_high < rep_low) throw validationError(`rep_high must be ≥ rep_low for ${exercise.name}`, { index: i });
    return {
      id: randomUUID(),
      template_id: templateId,
      template_version: version,
      exercise_id: exercise.id,
      order: s.order ?? i + 1,
      base_sets: s.base_sets,
      is_priority: s.is_priority,
      rep_low,
      rep_high,
      rir_target: s.rir_target ?? exercise.default_rir_target,
      rest_seconds: s.rest_seconds ?? exercise.default_rest_seconds,
      last_set_amrap: s.last_set_amrap,
      notes: s.notes,
    };
  });
}

export function templateRoutes(ctx: AppContext): Hono<Env> {
  const { db } = ctx;
  const r = new Hono<Env>();

  r.get('/templates', (c) => {
    const archived = parseBool(c.req.query('archived'));
    return c.json({ items: repo.listTemplates(db, archived).map((t) => templateWithExercises(db, t)) });
  });

  r.get('/templates/:id', (c) => {
    const t = repo.getTemplate(db, param(c, 'id'));
    if (!t) throw notFound('template', c.req.param('id'));
    const raw = c.req.query('version');
    let version = t.version;
    if (raw !== undefined && raw !== '') {
      version = Number(raw);
      if (!Number.isInteger(version) || version < 1) throw validationError('version must be a positive integer');
      if (version !== t.version && !repo.versionExists(db, t.id, version)) throw notFound(`template ${t.id} version`, String(version));
    }
    return c.json(templateWithExercises(db, t, version));
  });

  r.post('/templates', async (c) => {
    const input = await body(c, templateCreateSchema);
    if (input.id) {
      const existing = repo.getTemplate(db, input.id);
      if (existing) return c.json(templateWithExercises(db, existing), 200);
    }
    if (input.mesocycle_id && !repo.getMesocycle(db, input.mesocycle_id)) throw notFound('mesocycle', input.mesocycle_id);
    const t: WorkoutTemplate = {
      id: input.id ?? randomUUID(),
      name: input.name,
      day_label: input.day_label,
      order: input.order ?? repo.listTemplates(db).length + 1,
      version: 1,
      mesocycle_id: input.mesocycle_id,
      archived: false,
    };
    db.transaction(() => {
      repo.insertTemplate(db, t, nowIso(ctx));
      for (const te of buildSlots(db, t.id, 1, input.exercises)) repo.insertTemplateExercise(db, te);
    });
    return c.json(templateWithExercises(db, t), 201);
  });

  /** With `exercises`: a new version (old rows untouched). Metadata-only: edited in place, no bump. */
  r.patch('/templates/:id', async (c) => {
    const existing = repo.getTemplate(db, param(c, 'id'));
    if (!existing) throw notFound('template', c.req.param('id'));
    const input = await body(c, templatePatchSchema);
    if (input.mesocycle_id && !repo.getMesocycle(db, input.mesocycle_id)) throw notFound('mesocycle', input.mesocycle_id);
    const { exercises, ...fields } = input;
    const bump = exercises !== undefined;
    const t: WorkoutTemplate = { ...existing, ...fields, version: bump ? existing.version + 1 : existing.version };
    db.transaction(() => {
      repo.updateTemplate(db, t, nowIso(ctx));
      if (exercises) for (const te of buildSlots(db, t.id, t.version, exercises)) repo.insertTemplateExercise(db, te);
    });
    return c.json(templateWithExercises(db, t));
  });

  return r;
}
