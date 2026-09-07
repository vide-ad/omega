import type { Mesocycle, MesocycleWeek, TemplateExercise } from '../types.js';
import { addDays, daysBetween, isoWeekEnd, isoWeekKey, isoWeekStart } from './dates.js';

/** Round half-up (JS Math.round is half-up for positives, but be explicit). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

/**
 * Week number (1-indexed) of `date` within a mesocycle, or null if outside it.
 * Weeks are 7-day blocks from `start_date`. Anchor `start_date` on the first training day of the
 * microcycle (Saturday for the seed templates) so a Sat/Sun/Wed week stays in one block.
 */
export function mesocycleWeekNumber(meso: Pick<Mesocycle, 'start_date' | 'planned_weeks'>, date: string): number | null {
  const days = daysBetween(meso.start_date, date);
  if (days < 0) return null;
  const week = Math.floor(days / 7) + 1;
  return week > meso.planned_weeks ? null : week;
}

export interface WeekWindow {
  key: string;             // "2026-W37" (ISO) or "meso:<id>:3" (block week)
  start: string;           // inclusive date
  end: string;             // inclusive date
  mesocycle_week: number | null;
}

/**
 * The week `date` belongs to for volume accounting: a 7-day block anchored at the active
 * mesocycle's start when the date falls inside it, otherwise the ISO week (spec §4 as amended
 * by the audit: the Sat/Sun/Wed microcycle would otherwise straddle two ISO weeks).
 */
export function weekWindowFor(date: string, meso: Pick<Mesocycle, 'id' | 'start_date' | 'planned_weeks'> | null): WeekWindow {
  if (meso) {
    const n = mesocycleWeekNumber(meso, date);
    if (n !== null) {
      const start = addDays(meso.start_date, (n - 1) * 7);
      return { key: `meso:${meso.id}:${n}`, start, end: addDays(start, 6), mesocycle_week: n };
    }
  }
  return { key: isoWeekKey(date), start: isoWeekStart(date), end: isoWeekEnd(date), mesocycle_week: null };
}

/**
 * Spec §5.6 — `base_sets + (is_priority ? set_delta : 0)`, then × volume_multiplier, rounded
 * half-up (so a 3-set exercise on a 0.5 deload → 2 sets). Never below 1.
 */
export function rampedTargetSets(te: Pick<TemplateExercise, 'base_sets' | 'is_priority'>, week: MesocycleWeek | null): number {
  if (!week) return te.base_sets;
  const sets = te.base_sets + (te.is_priority ? week.set_delta : 0);
  return Math.max(1, roundHalfUp(sets * week.volume_multiplier));
}

/** Effort target for a session: the template value clamped into the mesocycle week's RIR range. */
export function clampTargetRir(templateRir: number, week: Pick<MesocycleWeek, 'rir_target_low' | 'rir_target_high'> | null): number {
  if (!week) return templateRir;
  const lo = Math.min(week.rir_target_low, week.rir_target_high);
  const hi = Math.max(week.rir_target_low, week.rir_target_high);
  return Math.min(hi, Math.max(lo, templateRir));
}
