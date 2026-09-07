import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { CardioSession, ReadinessResponse } from '@omega/core';
import { addDays } from '@omega/core';
import * as repo from '../db/repos/index.js';
import { notFound, validationError } from '../errors.js';
import type { AppContext } from '../services/context.js';
import { today } from '../services/context.js';
import { recentlyTrained, rollingMedians, upsertReadiness, withSoreness } from '../services/readiness.js';
import { cardioCreateSchema, parseOptionalDate, readinessUpsertSchema } from '../validation.js';
import { body, param, type Env } from './shared.js';

export function readinessRoutes(ctx: AppContext): Hono<Env> {
  const { db } = ctx;
  const r = new Hono<Env>();

  r.get('/readiness', (c) => {
    const t = today(ctx);
    const to = parseOptionalDate(c.req.query('to'), 'to') ?? t;
    const from = parseOptionalDate(c.req.query('from'), 'from') ?? addDays(to, -30);
    if (from > to) throw validationError('from must be on or before to');
    const res: ReadinessResponse = {
      items: repo.listReadiness(db, from, to).map((l) => withSoreness(db, l)),
      rolling: rollingMedians(db, t),
      recently_trained: recentlyTrained(ctx),
    };
    return c.json(res);
  });

  r.post('/readiness', async (c) => {
    const input = await body(c, readinessUpsertSchema);
    if (input.soreness) {
      const seen = new Set<string>();
      for (const s of input.soreness) {
        if (seen.has(s.muscle_group_key)) throw validationError(`duplicate soreness entry for ${s.muscle_group_key}`);
        seen.add(s.muscle_group_key);
      }
    }
    const { log, created } = upsertReadiness(db, input as Parameters<typeof upsertReadiness>[1]);
    return c.json(log, created ? 201 : 200);
  });

  r.get('/cardio', (c) => {
    const from = parseOptionalDate(c.req.query('from'), 'from');
    const to = parseOptionalDate(c.req.query('to'), 'to');
    return c.json({ items: repo.listCardio(db, from, to) });
  });

  r.post('/cardio', async (c) => {
    const input = await body(c, cardioCreateSchema);
    if (input.id) {
      const existing = repo.getCardio(db, input.id);
      if (existing) return c.json(existing, 200);
    }
    const session: CardioSession = { ...input, id: input.id ?? randomUUID() } as CardioSession;
    repo.insertCardio(db, session);
    return c.json(repo.getCardio(db, session.id), 201);
  });

  r.delete('/cardio/:id', (c) => {
    if (!repo.deleteCardio(db, param(c, 'id'))) throw notFound('cardio session', c.req.param('id'));
    return c.body(null, 204);
  });

  return r;
}
