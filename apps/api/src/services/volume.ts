import type { WeekVolume } from '@omega/core';
import { addDays, weekWindowFor, weeklyVolume } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';

/**
 * GET /volume: per-week per-muscle hard sets for the last `weeks` weeks ending in the week containing
 * `today`, block-anchored inside the active mesocycle (docs/ENGINE-RULES.md). Empty weeks are present.
 */
export function volumeWeeks(db: Db, todayDate: string, weeks: number): WeekVolume[] {
  const mesocycle = repo.getActiveMesocycle(db);
  const ensureDates: string[] = [];
  let earliest = weekWindowFor(todayDate, mesocycle).start;
  for (let i = 0; i < weeks; i++) {
    const d = addDays(todayDate, -7 * i);
    ensureDates.push(d);
    const w = weekWindowFor(d, mesocycle);
    if (w.start < earliest) earliest = w.start;
  }
  const latest = weekWindowFor(todayDate, mesocycle).end;
  const inputs = repo.setsForWorkoutsBetween(db, earliest, latest).map((r) => ({ set: r.set, exercise_id: r.exercise_id, date: r.workout_date }));
  const exercises = repo.listAllExercises(db, { includeArchived: true }).map((e) => ({ id: e.id, is_unilateral: e.is_unilateral }));
  return weeklyVolume(inputs, exercises, repo.listCredits(db), repo.listTargets(db), { mesocycle, today: todayDate, ensureDates });
}
