import type { Mesocycle, MesocycleWeek, TemplateExercise } from '../types.js';
import { daysBetween } from './dates.js';

/**
 * Week number (1-indexed) of `date` within a mesocycle, or null if outside it.
 * Weeks are 7-day blocks from `start_date`; seed data starts mesocycles on a Monday so
 * these line up with ISO weeks used by volume accounting.
 */
export function mesocycleWeekNumber(meso: Pick<Mesocycle, 'start_date' | 'planned_weeks'>, date: string): number | null {
  const days = daysBetween(meso.start_date, date);
  if (days < 0) return null;
  const week = Math.floor(days / 7) + 1;
  return week > meso.planned_weeks ? null : week;
}

/**
 * Spec §5.6 — `base_sets + (is_priority ? set_delta : 0)`, then × volume_multiplier, rounded
 * half-up (so a 3-set exercise on a 0.5 deload → 2 sets). Never below 1.
 */
export function rampedTargetSets(te: Pick<TemplateExercise, 'base_sets' | 'is_priority'>, week: MesocycleWeek | null): number {
  if (!week) return te.base_sets;
  const sets = te.base_sets + (te.is_priority ? week.set_delta : 0);
  return Math.max(1, Math.round(sets * week.volume_multiplier));
}
