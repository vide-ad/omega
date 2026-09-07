import { randomUUID } from 'node:crypto';
import type { MuscleGroupKey, ReadinessLog, ReadinessWithSoreness, SorenessEntry } from '@omega/core';
import { musclesTrained, rollingMedian } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';
import { finalizeWorkout } from './compromise.js';
import type { AppContext } from './context.js';
import { addDays } from '@omega/core';

export function withSoreness(db: Db, r: ReadinessLog): ReadinessWithSoreness {
  return { ...r, soreness: repo.listSoreness(db, r.id).map((s) => ({ muscle_group_key: s.muscle_group_key, rating: s.rating })) };
}

export type ReadinessInput = Omit<ReadinessLog, 'id'> & { id?: string; soreness?: Array<Pick<SorenessEntry, 'muscle_group_key' | 'rating'>> };

/**
 * POST /readiness: upsert by date. Afterwards every workout on that date is (re)linked to the log and,
 * when completed, has its compromise caches and progression state recomputed.
 */
export function upsertReadiness(db: Db, input: ReadinessInput): { log: ReadinessWithSoreness; created: boolean } {
  const { soreness, id: suppliedId, ...fields } = input;
  const byDate = repo.getReadinessByDate(db, fields.date);
  const byId = suppliedId ? repo.getReadiness(db, suppliedId) : null;
  const existing = byDate ?? byId;
  const id = existing ? existing.id : (suppliedId ?? randomUUID());
  const log: ReadinessLog = { id, ...fields };
  db.transaction(() => {
    if (existing) {
      if (byId && byDate && byId.id !== byDate.id) {
        // The client-side id points at another day's log; the date wins and the stray row is folded away.
        repo.relinkReadiness(db, byId.date, null);
        db.run('DELETE FROM readiness_logs WHERE id = $id', { id: byId.id });
      }
      repo.updateReadiness(db, log);
    } else {
      repo.insertReadiness(db, log);
    }
    if (soreness !== undefined || !existing) repo.replaceSoreness(db, id, soreness ?? []);
    repo.relinkReadiness(db, fields.date, id);
    for (const w of repo.listWorkoutsOnDate(db, fields.date)) {
      if (w.completed_at !== null) finalizeWorkout(db, { ...w, readiness_id: id });
    }
  });
  return { log: withSoreness(db, repo.getReadiness(db, id)!), created: !existing };
}

export interface RollingMedians { rhr_median_30d: number | null; bodyweight_median_30d: number | null }

/** 30-day medians including today's reading (core's rollingMedian excludes its `date`, so it is asked as of tomorrow). */
export function rollingMedians(db: Db, todayDate: string): RollingMedians {
  const logs = repo.listAllReadiness(db);
  const asOf = addDays(todayDate, 1);
  const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  return {
    rhr_median_30d: round(rollingMedian(logs, (l) => l.resting_hr, asOf, 30)),
    bodyweight_median_30d: round(rollingMedian(logs, (l) => l.bodyweight_kg, asOf, 30)),
  };
}

/** Muscles with credit ≥ 0.5 in exercises whose sets were completed in the last 48 hours. */
export function recentlyTrained(ctx: AppContext): MuscleGroupKey[] {
  const since = new Date(ctx.now().getTime() - 48 * 3_600_000).toISOString();
  const ids = [...new Set(repo.setsCompletedSince(ctx.db, since).map((s) => s.exercise_id))];
  if (ids.length === 0) return [];
  return [...musclesTrained(ids, repo.listCredits(ctx.db))];
}
