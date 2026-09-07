/**
 * Idempotent seed from @omega/core (spec §9). Safe to re-run:
 *  - library rows (muscle groups, exercises, credits, targets, templates, injury, constraints) are upserted;
 *  - the mesocycle keeps its existing start_date unless a start is passed explicitly;
 *  - progression_state starting loads are inserted only when absent (a live working weight is never reset);
 *  - a granted constraint clearance is never revoked.
 */
import {
  MUSCLE_GROUPS, SEED_CONSTRAINTS, SEED_EXERCISES, SEED_INJURY, SEED_MESOCYCLE_ID, SEED_MUSCLE_CREDITS, SEED_RESTART_LOADS,
  SEED_TEMPLATES, SEED_TEMPLATE_EXERCISES, VOLUME_TARGETS, addDays, buildSeedMesocycle, formatDate,
} from '@omega/core';
import type { Db } from './db/connection.js';
import * as repo from './db/repos/index.js';

export interface SeedOptions {
  /** Mesocycle start (first training day, a Saturday). Explicit values always win; otherwise an existing block keeps its start. */
  start_date?: string;
  /** Clock for the default start and for `updated_at`. */
  now?: () => Date;
}

export interface SeedSummary {
  mesocycle_start: string;
  mesocycle_start_source: 'explicit' | 'existing' | 'next_saturday';
  exercises: number;
  credits: number;
  templates: number;
  template_exercises: number;
  starting_loads_inserted: number;
}

/** The next Saturday on or after `date` (YYYY-MM-DD, UTC). */
export function nextSaturday(date: string): string {
  const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return addDays(date, (6 - dow + 7) % 7);
}

export function seedDatabase(db: Db, opts: SeedOptions = {}): SeedSummary {
  const now = opts.now ?? (() => new Date());
  const nowIso = now().toISOString();
  const today = formatDate(now());

  return db.transaction(() => {
    for (const m of MUSCLE_GROUPS) repo.upsertMuscleGroup(db, m);
    for (const e of SEED_EXERCISES) repo.upsertExercise(db, e);
    for (const c of SEED_MUSCLE_CREDITS) repo.upsertCredit(db, c);
    for (const t of VOLUME_TARGETS) repo.upsertTarget(db, t);

    const existing = repo.getMesocycle(db, SEED_MESOCYCLE_ID);
    let start: string;
    let source: SeedSummary['mesocycle_start_source'];
    if (opts.start_date) { start = opts.start_date; source = 'explicit'; }
    else if (existing) { start = existing.start_date; source = 'existing'; }
    else { start = nextSaturday(today); source = 'next_saturday'; }
    const { mesocycle, weeks } = buildSeedMesocycle(start);
    if (existing) {
      // Keep the user's status/notes; only re-anchor when asked to.
      repo.updateMesocycle(db, { ...existing, start_date: start, planned_weeks: mesocycle.planned_weeks, deload_week: mesocycle.deload_week });
    } else {
      repo.insertMesocycle(db, mesocycle);
      repo.demoteOtherActive(db, mesocycle.id);
    }
    for (const w of weeks) repo.upsertWeek(db, w);

    for (const t of SEED_TEMPLATES) repo.upsertTemplate(db, t, nowIso);
    for (const te of SEED_TEMPLATE_EXERCISES) repo.upsertTemplateExercise(db, te);

    repo.upsertInjury(db, SEED_INJURY);
    for (const c of SEED_CONSTRAINTS) repo.upsertConstraint(db, c);

    let inserted = 0;
    for (const s of SEED_RESTART_LOADS) {
      if (repo.insertStartingLoadIfAbsent(db, s.exercise_id, s.working_weight_kg, nowIso)) inserted++;
    }

    return {
      mesocycle_start: start,
      mesocycle_start_source: source,
      exercises: SEED_EXERCISES.length,
      credits: SEED_MUSCLE_CREDITS.length,
      templates: SEED_TEMPLATES.length,
      template_exercises: SEED_TEMPLATE_EXERCISES.length,
      starting_loads_inserted: inserted,
    };
  });
}
