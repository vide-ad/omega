import type { Mesocycle, MesocycleWeek } from '@omega/core';
import { formatDate, mesocycleWeekNumber } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';

export interface AppContext {
  db: Db;
  /** Injectable clock; tests pin it so "today"-relative endpoints are deterministic. */
  now: () => Date;
}

export function today(ctx: AppContext): string {
  return formatDate(ctx.now());
}

export function nowIso(ctx: AppContext): string {
  return ctx.now().toISOString();
}

export interface ResolvedWeek {
  mesocycle: Mesocycle | null;
  week_number: number | null;
  week: MesocycleWeek | null;
}

/** The active mesocycle's week for `date` (week null outside the block). */
export function resolveWeek(db: Db, date: string, mesocycle: Mesocycle | null = repo.getActiveMesocycle(db)): ResolvedWeek {
  if (!mesocycle) return { mesocycle: null, week_number: null, week: null };
  const week_number = mesocycleWeekNumber(mesocycle, date);
  const week = week_number === null ? null : repo.getWeek(db, mesocycle.id, week_number);
  return { mesocycle, week_number, week };
}

/** The week a stored workout belongs to: its own mesocycle/week when recorded, else the active block's week for its date. */
export function weekForWorkout(db: Db, w: { mesocycle_id: string | null; week_number: number | null; date: string }): MesocycleWeek | null {
  if (w.mesocycle_id && w.week_number !== null) return repo.getWeek(db, w.mesocycle_id, w.week_number);
  return resolveWeek(db, w.date).week;
}
