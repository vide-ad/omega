import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Mesocycle, MesocycleWithWeeks } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';
import { notFound, validationError } from '../errors.js';
import type { AppContext } from '../services/context.js';
import { today } from '../services/context.js';
import { currentMesocycle } from '../services/summary.js';
import { mesocycleCreateSchema, mesocyclePatchSchema } from '../validation.js';
import { body, param, type Env } from './shared.js';

function withWeeks(db: Db, m: Mesocycle): MesocycleWithWeeks {
  return { ...m, weeks: repo.listWeeks(db, m.id) };
}

export function mesocycleRoutes(ctx: AppContext): Hono<Env> {
  const { db } = ctx;
  const r = new Hono<Env>();

  r.get('/mesocycles', (c) => c.json({ items: repo.listMesocycles(db).map((m) => withWeeks(db, m)) }));

  r.get('/mesocycles/current', (c) => {
    const cur = currentMesocycle(db, today(ctx));
    if (!cur) throw notFound('active mesocycle');
    return c.json(cur);
  });

  r.get('/mesocycles/:id', (c) => {
    const m = repo.getMesocycle(db, param(c, 'id'));
    if (!m) throw notFound('mesocycle', c.req.param('id'));
    return c.json(withWeeks(db, m));
  });

  r.post('/mesocycles', async (c) => {
    const input = await body(c, mesocycleCreateSchema);
    if (input.id) {
      const existing = repo.getMesocycle(db, input.id);
      if (existing) return c.json(withWeeks(db, existing), 200);
    }
    const { weeks, id: suppliedId, ...fields } = input;
    const m: Mesocycle = { id: suppliedId ?? randomUUID(), ...fields };
    db.transaction(() => {
      repo.insertMesocycle(db, m);
      repo.replaceWeeks(db, m.id, weeks);
      if (m.status === 'active') repo.demoteOtherActive(db, m.id);
    });
    return c.json(withWeeks(db, m), 201);
  });

  r.patch('/mesocycles/:id', async (c) => {
    const existing = repo.getMesocycle(db, param(c, 'id'));
    if (!existing) throw notFound('mesocycle', c.req.param('id'));
    const input = await body(c, mesocyclePatchSchema);
    const { weeks, ...fields } = input;
    const m: Mesocycle = { ...existing, ...fields };
    if (m.deload_week > m.planned_weeks) throw validationError('deload_week must be ≤ planned_weeks');
    if (weeks) {
      const nums = weeks.map((w) => w.week_number).sort((a, b) => a - b);
      if (nums.length !== m.planned_weeks || nums.some((n, i) => n !== i + 1)) throw validationError(`weeks must cover week_number 1..${m.planned_weeks} exactly once`);
    } else if (fields.planned_weeks !== undefined && repo.listWeeks(db, m.id).length !== m.planned_weeks) {
      throw validationError('planned_weeks changed: supply the full weeks array');
    }
    db.transaction(() => {
      repo.updateMesocycle(db, m);
      if (weeks) repo.replaceWeeks(db, m.id, weeks);
      if (m.status === 'active') repo.demoteOtherActive(db, m.id);
    });
    return c.json(withWeeks(db, m));
  });

  return r;
}
