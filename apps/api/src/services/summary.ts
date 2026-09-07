import type { CurrentMesocycle, SummaryResponse } from '@omega/core';
import { addDays, median } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';
import { resolveWeek, today, type AppContext } from './context.js';
import { loadConstraintContext } from './prescription.js';
import { computeProgression, progressionExercises } from './progression.js';
import { volumeWeeks } from './volume.js';

export function currentMesocycle(db: Db, todayDate: string): CurrentMesocycle | null {
  const rw = resolveWeek(db, todayDate);
  if (!rw.mesocycle) return null;
  return {
    mesocycle: { ...rw.mesocycle, weeks: repo.listWeeks(db, rw.mesocycle.id) },
    week_number: rw.week_number,
    week: rw.week,
    is_deload: rw.week?.is_deload ?? false,
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** GET /summary — the coach's first call. Window = the last `weeks` calendar weeks ending today. */
export function buildSummary(ctx: AppContext, weeks: number): SummaryResponse {
  const { db } = ctx;
  const todayDate = today(ctx);
  const from = addDays(todayDate, -(weeks * 7 - 1));
  const to = todayDate;

  const meso = currentMesocycle(db, todayDate);
  const volume = volumeWeeks(db, todayDate, weeks);

  // Adherence: planned = non-archived templates per week; only weeks inside the active block count when one exists.
  const templatesPerWeek = repo.countActiveTemplates(db);
  const workouts = repo.listWorkoutsBetween(db, volume[0]?.start ?? from, to);
  const by_week = volume.map((w) => {
    const inBlock = meso === null || w.mesocycle_week !== null;
    const completed = workouts.filter((x) => x.completed_at !== null && x.date >= w.start && x.date <= w.end).length;
    return { week: w.key, planned: inBlock ? templatesPerWeek : 0, completed };
  });
  const adherence = {
    planned_sessions: by_week.reduce((a, w) => a + w.planned, 0),
    completed_sessions: by_week.reduce((a, w) => a + w.completed, 0),
    by_week,
  };

  // Progression movement per exercise.
  const rw = resolveWeek(db, todayDate);
  const cc = loadConstraintContext(db);
  const progression = progressionExercises(db).map((exercise) => {
    const comp = computeProgression(db, exercise, todayDate, rw, cc);
    const q = comp.analyses
      .filter((a) => a.qualifying && a.best_e1rm !== null && a.record.workout.date >= from && a.record.workout.date <= to)
      .sort((a, b) => a.record.workout.date.localeCompare(b.record.workout.date));
    const first = q[0]?.best_e1rm ?? null;
    const last = q.length > 1 ? q[q.length - 1]!.best_e1rm : null;
    const e1rm_change_pct = first !== null && last !== null && first > 0 ? round1(((last - first) / first) * 100) : null;
    return {
      exercise_id: exercise.id,
      name: exercise.name,
      working_weight_kg: comp.item.state?.working_weight_kg ?? comp.next.suggested_weight_kg,
      baseline_e1rm: comp.item.state?.baseline_e1rm ?? null,
      e1rm_change_pct,
      consecutive_stalls: comp.item.state?.consecutive_stalls ?? 0,
      next_reason: comp.next.reason,
      flags: comp.next.flags,
    };
  });

  // Readiness trend.
  const logs = repo.listReadiness(db, from, to).sort((a, b) => a.date.localeCompare(b.date));
  const rhr = logs.map((l) => l.resting_hr).filter((v): v is number => v !== null);
  const sleep = logs.map((l) => l.sleep_hours).filter((v): v is number => v !== null);
  const bw = logs.map((l) => l.bodyweight_kg).filter((v): v is number => v !== null);
  const readiness = {
    days_logged: logs.length,
    rhr_median: median(rhr),
    sleep_mean: sleep.length ? round2(sleep.reduce((a, b) => a + b, 0) / sleep.length) : null,
    bodyweight_trend_kg: bw.length > 1 ? round2(bw[bw.length - 1]! - bw[0]!) : null,
    compromised_sessions: workouts.filter((w) => w.completed_at !== null && w.is_compromised && w.date >= from).length,
  };

  // Cardio load.
  const cardioSessions = repo.listCardio(db, from, to);
  const zone_minutes: Record<string, number> = {};
  for (const c of cardioSessions) for (const [z, m] of Object.entries(c.zone_minutes ?? {})) zone_minutes[z] = round1((zone_minutes[z] ?? 0) + m);
  const cardio = { sessions: cardioSessions.length, minutes: round1(cardioSessions.reduce((a, c) => a + c.duration_minutes, 0)), zone_minutes };

  const pain_flags = repo.painFlagsBetween(db, from, to).map((p) => ({ date: p.date, exercise_id: p.exercise_id, exercise_name: p.exercise_name, severity: p.severity, note: p.note }));
  const injuries = repo.listInjuries(db, 'live').map((i) => ({ ...i, constraints: repo.listConstraints(db, i.id) }));

  return {
    generated_at: ctx.now().toISOString(),
    window_weeks: weeks,
    mesocycle: meso,
    volume,
    adherence,
    progression,
    readiness,
    cardio,
    pain_flags,
    injuries,
  };
}
