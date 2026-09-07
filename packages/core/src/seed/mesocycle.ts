import type { Mesocycle, MesocycleWeek } from '../types.js';

/** Stable id so re-seeding is idempotent. */
export const SEED_MESOCYCLE_ID = '0000a001-0000-4000-8000-000000000001';

/**
 * Spec §9.2 — 6 weeks: 5 accumulation (set_delta 0,1,2,3,3; RIR 3,3,2,2,1) + week 6 deload
 * (volume_multiplier 0.5, RIR 4–5). `start_date` is supplied at seed time and should be the
 * FIRST TRAINING DAY of the microcycle (a Saturday for these templates): mesocycle weeks and
 * volume weeks are 7-day blocks from this date, so Sat/Sun/Wed stay in one week.
 */
export function buildSeedMesocycle(start_date: string): { mesocycle: Mesocycle; weeks: MesocycleWeek[] } {
  const mesocycle: Mesocycle = {
    id: SEED_MESOCYCLE_ID,
    name: 'Return to training — block 1',
    start_date,
    planned_weeks: 6,
    deload_week: 6,
    status: 'active',
    notes: 'Returning from ~4 weeks off. Restart loads ~70% of prior working weight, +10%/week.',
  };
  const accumulation: Array<[number, number]> = [
    [0, 3], [1, 3], [2, 2], [3, 2], [3, 1],
  ];
  const weeks: MesocycleWeek[] = accumulation.map(([set_delta, rir], i) => ({
    mesocycle_id: SEED_MESOCYCLE_ID,
    week_number: i + 1,
    is_deload: false,
    set_delta,
    rir_target_low: rir,
    rir_target_high: rir,
    volume_multiplier: 1.0,
  }));
  weeks.push({
    mesocycle_id: SEED_MESOCYCLE_ID,
    week_number: 6,
    is_deload: true,
    set_delta: 0,
    rir_target_low: 4,
    rir_target_high: 5,
    volume_multiplier: 0.5,
  });
  return { mesocycle, weeks };
}
