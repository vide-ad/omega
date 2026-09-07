import { describe, expect, it } from 'vitest';
import type { ExerciseConstraint, MesocycleWeek, SetLog } from '../types.js';
import { e1rm } from './e1rm.js';
import { addDays, daysBetween, isoWeekEnd, isoWeekKey, isoWeekStart } from './dates.js';
import { mesocycleWeekNumber, rampedTargetSets } from './mesocycle.js';
import { activeConstraintsFor, foldConstraints } from './constraints.js';
import { exerciseCompromisedReasons, musclesTrained, rollingMedianRhr, workoutCompromisedReasons } from './compromised.js';
import { effectiveHardSets, isHardSet, weeklyVolume } from './volume.js';
import { prescribe, roundToIncrement, type ExerciseSessionRecord } from './progression.js';

describe('e1rm', () => {
  it('matches spec formula', () => {
    expect(e1rm(100, 10, 0)).toBeCloseTo(133.33, 2);
    expect(e1rm(60, 8, 2)).toBeCloseTo(80, 5);
  });
});

describe('dates', () => {
  it('ISO weeks', () => {
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01'); // Thursday
    expect(isoWeekKey('2026-09-07')).toBe('2026-W37'); // Monday
    expect(isoWeekKey('2026-09-13')).toBe('2026-W37'); // Sunday of same week
    expect(isoWeekKey('2026-09-14')).toBe('2026-W38');
    expect(isoWeekKey('2027-01-03')).toBe('2026-W53'); // Sunday, belongs to previous ISO year
    expect(isoWeekKey('2027-01-04')).toBe('2027-W01');
    expect(isoWeekStart('2026-09-12')).toBe('2026-09-07');
    expect(isoWeekEnd('2026-09-12')).toBe('2026-09-13');
  });
  it('arithmetic', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(daysBetween('2026-09-01', '2026-09-22')).toBe(21);
  });
});

describe('mesocycle', () => {
  const meso = { start_date: '2026-09-07', planned_weeks: 6 };
  it('week numbers', () => {
    expect(mesocycleWeekNumber(meso, '2026-09-06')).toBeNull();
    expect(mesocycleWeekNumber(meso, '2026-09-07')).toBe(1);
    expect(mesocycleWeekNumber(meso, '2026-09-13')).toBe(1);
    expect(mesocycleWeekNumber(meso, '2026-09-14')).toBe(2);
    expect(mesocycleWeekNumber(meso, '2026-10-18')).toBe(6);
    expect(mesocycleWeekNumber(meso, '2026-10-19')).toBeNull();
  });
  const wk = (o: Partial<MesocycleWeek>): MesocycleWeek => ({ mesocycle_id: 'm', week_number: 1, is_deload: false, set_delta: 0, rir_target_low: 2, rir_target_high: 2, volume_multiplier: 1, ...o });
  it('set ramp §5.6', () => {
    expect(rampedTargetSets({ base_sets: 4, is_priority: true }, wk({ set_delta: 3 }))).toBe(7);
    expect(rampedTargetSets({ base_sets: 4, is_priority: false }, wk({ set_delta: 3 }))).toBe(4);
    expect(rampedTargetSets({ base_sets: 3, is_priority: true }, wk({ is_deload: true, volume_multiplier: 0.5 }))).toBe(2); // 1.5 rounds up
    expect(rampedTargetSets({ base_sets: 4, is_priority: true }, wk({ is_deload: true, volume_multiplier: 0.5 }))).toBe(2);
    expect(rampedTargetSets({ base_sets: 1, is_priority: false }, wk({ volume_multiplier: 0.5 }))).toBe(1); // floor at 1
    expect(rampedTargetSets({ base_sets: 3, is_priority: true }, null)).toBe(3);
  });
});

const c = (o: Partial<ExerciseConstraint>): ExerciseConstraint => ({
  id: 'c1', injury_id: 'inj', exercise_id: null, movement_pattern: null, max_weight_kg: null, min_reps: null,
  required_tempo: null, requires_clearance: false, blocked: false, note: null, ...o,
});

describe('constraints', () => {
  const injuries = [{ id: 'inj', status: 'active' as const }, { id: 'old', status: 'resolved' as const }];
  it('matches by pattern or exercise, ignores resolved injuries', () => {
    const cs = [
      c({ id: 'p', movement_pattern: 'elbow_flexion' }),
      c({ id: 'x', exercise_id: 'ex1' }),
      c({ id: 'r', injury_id: 'old', movement_pattern: 'elbow_flexion' }),
    ];
    expect(activeConstraintsFor({ id: 'ex1', movement_pattern: 'squat' }, cs, injuries).map((x) => x.id)).toEqual(['x']);
    expect(activeConstraintsFor({ id: 'ex2', movement_pattern: 'elbow_flexion' }, cs, injuries).map((x) => x.id)).toEqual(['p']);
    expect(activeConstraintsFor({ id: 'ex3', movement_pattern: 'squat' }, cs, injuries)).toEqual([]);
  });
  it('folds to the most restrictive', () => {
    const env = foldConstraints([c({ max_weight_kg: 10, min_reps: 12, note: 'a' }), c({ max_weight_kg: 5, min_reps: 15, required_tempo: '3-0-3-0', note: 'b' })]);
    expect(env).toEqual({ blocked: false, requires_clearance: false, max_weight_kg: 5, min_reps: 15, required_tempo: '3-0-3-0', notes: ['a', 'b'] });
  });
});

describe('compromised §5.2', () => {
  const hist = [64, 62, 63, 61, 65, 62, 63].map((v, i) => ({ date: addDays('2026-09-01', i), resting_hr: v }));
  const base = { date: '2026-09-12', soreness: [], readinessHistory: hist, musclesTrained: new Set(['quads' as const]), week: null };
  const readiness = (o: Partial<Parameters<typeof workoutCompromisedReasons>[0]['readiness'] & object>) => ({
    id: 'r', date: '2026-09-12', bodyweight_kg: null, resting_hr: null, sleep_hours: null, sleep_quality: null, stress: null, motivation: null, manual_compromised: false, notes: null, ...o,
  });
  it('median excludes today', () => {
    expect(rollingMedianRhr(hist, '2026-09-12')).toBe(63);
    expect(rollingMedianRhr([...hist, { date: '2026-09-12', resting_hr: 90 }], '2026-09-12')).toBe(63);
    expect(rollingMedianRhr([], '2026-09-12')).toBeNull();
  });
  it('fires each rule', () => {
    expect(workoutCompromisedReasons({ ...base, readiness: null })).toEqual([]);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ manual_compromised: true }) })).toEqual(['manual']);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ resting_hr: 70 }) })).toEqual([]);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ resting_hr: 71 }) })).toEqual(['resting_hr']);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ resting_hr: 80 }), readinessHistory: [] })).toEqual([]); // no history → no median
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ sleep_hours: 5.4 }) })).toEqual(['sleep']);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ sleep_hours: 5.5 }) })).toEqual([]);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({}), soreness: [{ readiness_id: 'r', muscle_group_key: 'quads', rating: 4 }] })).toEqual(['soreness']);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({}), soreness: [{ readiness_id: 'r', muscle_group_key: 'biceps', rating: 5 }] })).toEqual([]);
    expect(workoutCompromisedReasons({ ...base, readiness: null, week: { is_deload: true } })).toEqual(['deload']);
  });
  it('muscles trained uses credit ≥ 0.5', () => {
    const credits = [
      { exercise_id: 'a', muscle_group_key: 'quads' as const, credit: 1, role: 'primary' as const },
      { exercise_id: 'a', muscle_group_key: 'spinal_erectors' as const, credit: 0.25, role: 'secondary' as const },
    ];
    expect([...musclesTrained(['a'], credits)]).toEqual(['quads']);
  });
  it('exercise-level: pain or constraint', () => {
    expect(exerciseCompromisedReasons([{ pain_severity: 'niggle' }], [])).toEqual([]);
    expect(exerciseCompromisedReasons([{ pain_severity: 'moderate' }], [])).toEqual(['pain']);
    expect(exerciseCompromisedReasons([{ pain_severity: 'none' }], [c({})])).toEqual(['constraint']);
  });
});

let setSeq = 0;
function mkSet(o: Partial<SetLog> & { reps: number; weight_kg: number }): SetLog {
  setSeq += 1;
  return {
    id: `s${setSeq}`, workout_exercise_id: 'we', set_index: setSeq, side: 'bilateral', is_warmup: false, is_amrap: false,
    rir: 2, tempo: null, rest_taken_seconds: null, pain_severity: 'none', pain_note: null, media_id: null,
    completed_at: '2026-09-12T10:00:00.000Z', ...o,
  };
}

describe('volume §4', () => {
  it('hard set threshold with null RIR assumed 2', () => {
    expect(isHardSet({ is_warmup: false, rir: 4 })).toBe(true);
    expect(isHardSet({ is_warmup: false, rir: 5 })).toBe(false);
    expect(isHardSet({ is_warmup: false, rir: null })).toBe(true);
    expect(isHardSet({ is_warmup: true, rir: 0 })).toBe(false);
  });
  it('unilateral pairs L+R as one set', () => {
    const sets = [
      mkSet({ reps: 10, weight_kg: 10, side: 'left' }), mkSet({ reps: 10, weight_kg: 10, side: 'right' }),
      mkSet({ reps: 10, weight_kg: 10, side: 'left' }), mkSet({ reps: 10, weight_kg: 10, side: 'right' }),
      mkSet({ reps: 10, weight_kg: 10, side: 'left' }),
    ];
    expect(effectiveHardSets(sets, true)).toBe(2.5);
    expect(effectiveHardSets(sets, false)).toBe(5);
  });
  it('tallies credits per ISO week and classifies', () => {
    const exercises = [{ id: 'sq', is_unilateral: false }, { id: 'chin', is_unilateral: false }];
    const credits = [
      { exercise_id: 'sq', muscle_group_key: 'quads' as const, credit: 1, role: 'primary' as const },
      { exercise_id: 'sq', muscle_group_key: 'glutes' as const, credit: 0.5, role: 'secondary' as const },
      { exercise_id: 'chin', muscle_group_key: 'lats' as const, credit: 1, role: 'primary' as const },
      { exercise_id: 'chin', muscle_group_key: 'biceps' as const, credit: 0.5, role: 'secondary' as const },
    ];
    const targets = [
      { muscle_group_key: 'quads' as const, min_sets: 15, max_sets: 20, priority: 'priority' as const, active: true },
      { muscle_group_key: 'glutes' as const, min_sets: 1, max_sets: 1, priority: 'maintenance' as const, active: true },
      { muscle_group_key: 'biceps' as const, min_sets: 12, max_sets: 15, priority: 'priority' as const, active: true },
    ];
    const inputs = [
      ...[1, 2, 3, 4].map(() => ({ set: mkSet({ reps: 8, weight_kg: 60, workout_exercise_id: 'we-sq' }), exercise_id: 'sq' })),
      { set: mkSet({ reps: 8, weight_kg: 60, workout_exercise_id: 'we-sq', is_warmup: true }), exercise_id: 'sq' },
      { set: mkSet({ reps: 8, weight_kg: 60, workout_exercise_id: 'we-sq', rir: 5 }), exercise_id: 'sq' },
      ...[1, 2, 3].map(() => ({ set: mkSet({ reps: 8, weight_kg: 0, workout_exercise_id: 'we-chin' }), exercise_id: 'chin' })),
      { set: mkSet({ reps: 8, weight_kg: 60, workout_exercise_id: 'we-sq2', completed_at: '2026-09-15T10:00:00.000Z' }), exercise_id: 'sq' },
    ];
    const weeks = weeklyVolume(inputs, exercises, credits, targets, ['2026-W39']);
    expect(weeks.map((w) => w.week)).toEqual(['2026-W37', '2026-W38', '2026-W39']);
    const w37 = Object.fromEntries(weeks[0]!.muscles.map((m) => [m.muscle_group_key, m]));
    expect(w37.quads!.sets).toBe(4);
    expect(w37.quads!.status).toBe('under');
    expect(w37.glutes!.sets).toBe(2);
    expect(w37.glutes!.status).toBe('over');
    expect(w37.lats!.sets).toBe(3);
    expect(w37.lats!.status).toBe('no_target');
    expect(w37.biceps!.sets).toBe(1.5);
    expect(weeks[1]!.muscles.find((m) => m.muscle_group_key === 'quads')!.sets).toBe(1);
    expect(weeks[2]!.muscles.every((m) => m.sets === 0)).toBe(true);
  });
});

describe('progression §5.5', () => {
  const exercise = { id: 'bench', name: 'Bench', weight_increment_kg: 2.5, is_unilateral: false };
  const template = { base_sets: 3, is_priority: false, rep_low: 8, rep_high: 10, rir_target: 2 };
  const week = (o: Partial<MesocycleWeek> = {}): MesocycleWeek => ({ mesocycle_id: 'm', week_number: 2, is_deload: false, set_delta: 1, rir_target_low: 2, rir_target_high: 2, volume_multiplier: 1, ...o });

  function session(date: string, weight: number, reps: number[], o: { rir?: (number | null)[]; compromised?: boolean; pain?: boolean; target_rir?: number; id?: string } = {}): ExerciseSessionRecord {
    return {
      workout: { id: o.id ?? `w-${date}`, date, is_compromised: o.compromised ?? false },
      workout_exercise: { id: `we-${date}`, target_rep_low: 8, target_rep_high: 10, target_rir: o.target_rir ?? 2, target_sets: 3, suggested_weight_kg: weight },
      sets: reps.map((r, i) => mkSet({ reps: r, weight_kg: weight, rir: o.rir ? o.rir[i]! : 2, pain_severity: o.pain && i === 0 ? 'moderate' : 'none', completed_at: `${date}T10:00:00.000Z` })),
    };
  }
  const base = { exercise, template, week: null, constraints: [], state: null, today: '2026-09-19' };

  it('first_time with no history and no state → null weight', () => {
    const r = prescribe({ ...base, history: [] });
    expect(r.prescription.reason).toBe('first_time');
    expect(r.prescription.suggested_weight_kg).toBeNull();
    expect(r.prescription.flags).toContain('first_time');
    expect(r.prescription.target_sets).toBe(3);
    expect(r.prescription.target_rir).toBe(2);
  });

  it('first_time uses a seeded working weight (restart loads §9.5)', () => {
    const state = { exercise_id: 'bench', working_weight_kg: 42, baseline_e1rm: null, baseline_set_id: null, last_progressed_at: null, consecutive_stalls: 0, updated_at: '' };
    const r = prescribe({ ...base, history: [], state });
    expect(r.prescription.reason).toBe('first_time');
    expect(r.prescription.suggested_weight_kg).toBe(42);
  });

  it('first_time when the only history has no RIR', () => {
    const r = prescribe({ ...base, history: [session('2026-09-12', 42, [10, 10, 10], { rir: [null, null, null] })] });
    expect(r.prescription.reason).toBe('first_time');
    expect(r.prescription.suggested_weight_kg).toBe(42); // falls back to the last weight lifted
    expect(r.prescription.rationale).toContain('no_rir');
  });

  it('progress_load when all sets ≥ rep_high and mean RIR ≥ target', () => {
    const r = prescribe({ ...base, history: [session('2026-09-12', 42, [10, 10, 10], { rir: [2, 2, 3] })] });
    expect(r.prescription.reason).toBe('progress_load');
    expect(r.prescription.suggested_weight_kg).toBe(44.5);
    expect(r.prescription.target_rep_low).toBe(8);
    expect(r.prescription.target_reps_by_set).toBeNull();
    expect(r.next_state.last_progressed_at).toBe('2026-09-19');
    expect(r.next_state.consecutive_stalls).toBe(0);
    expect(r.based_on_workout_id).toBe('w-2026-09-12');
  });

  it('consolidate when reps are there but RIR below target', () => {
    const r = prescribe({ ...base, history: [session('2026-09-12', 42, [10, 10, 10], { rir: [1, 1, 0] })] });
    expect(r.prescription.reason).toBe('consolidate');
    expect(r.prescription.suggested_weight_kg).toBe(42);
  });

  it('AMRAP set with null RIR counts as RIR 0', () => {
    const rec = session('2026-09-12', 42, [10, 10, 12], { rir: [2, 2, null] });
    const sets = [...rec.sets];
    sets[2] = { ...sets[2]!, is_amrap: true };
    const r = prescribe({ ...base, history: [{ ...rec, sets }] });
    expect(r.prescription.reason).toBe('consolidate'); // mean (2+2+0)/3 = 1.33 < 2
  });

  it('progress_reps when some sets below rep_high: +1 per set, capped at rep_high', () => {
    const r = prescribe({ ...base, history: [session('2026-09-12', 42, [10, 9, 8])] });
    expect(r.prescription.reason).toBe('progress_reps');
    expect(r.prescription.suggested_weight_kg).toBe(42);
    expect(r.prescription.target_reps_by_set).toEqual([10, 10, 9]);
  });

  it('single miss below rep_low is progress_reps with a warning; two consecutive → regress_load', () => {
    const one = prescribe({ ...base, history: [session('2026-09-12', 60, [8, 7, 6])] });
    expect(one.prescription.reason).toBe('progress_reps');
    expect(one.prescription.rationale).toContain('second consecutive miss');
    const two = prescribe({ ...base, history: [session('2026-09-12', 60, [8, 7, 6]), session('2026-09-15', 60, [8, 6, 6])] });
    expect(two.prescription.reason).toBe('regress_load');
    expect(two.prescription.suggested_weight_kg).toBe(55); // 54 → nearest 2.5 = 55
    expect(two.next_state.consecutive_stalls).toBe(1);
    expect(two.prescription.flags).not.toContain('stall_review');
  });

  it('regress always lands strictly below the previous weight', () => {
    const r = prescribe({ ...base, exercise: { ...exercise, weight_increment_kg: 5 }, history: [session('2026-09-12', 20, [7, 7, 7]), session('2026-09-15', 20, [7, 7, 7])] });
    expect(r.prescription.suggested_weight_kg).toBe(15); // 18 rounds to 20 → step down one increment
  });

  it('stall_review flag at 3 consecutive stalls', () => {
    const state = { exercise_id: 'bench', working_weight_kg: 60, baseline_e1rm: null, baseline_set_id: null, last_progressed_at: null, consecutive_stalls: 2, updated_at: '' };
    const r = prescribe({ ...base, state, history: [session('2026-09-12', 60, [8, 7, 6]), session('2026-09-15', 60, [8, 6, 6])] });
    expect(r.prescription.reason).toBe('regress_load');
    expect(r.prescription.flags).toContain('stall_review');
    expect(r.next_state.consecutive_stalls).toBe(3);
  });

  it('compromised sessions are excluded in both directions and trigger repeat_after_compromised', () => {
    const hist = [
      session('2026-09-12', 42, [10, 10, 10]),                               // qualifying → would progress to 44.5
      session('2026-09-15', 44.5, [6, 5, 5], { compromised: true }),         // bad night; a miss that must not count
    ];
    const r = prescribe({ ...base, history: hist });
    expect(r.prescription.reason).toBe('repeat_after_compromised');
    expect(r.prescription.suggested_weight_kg).toBe(44.5);
    expect(r.prescription.rationale).toContain('workout_compromised');
    expect(r.next_state.consecutive_stalls).toBe(0);
    expect(r.next_state.last_progressed_at).toBeNull(); // not a new progression event
  });

  it('pain flag makes the exercise non-qualifying', () => {
    const hist = [session('2026-09-12', 42, [10, 10, 10]), session('2026-09-15', 44.5, [10, 10, 10], { pain: true })];
    const r = prescribe({ ...base, history: hist });
    expect(r.prescription.reason).toBe('repeat_after_compromised');
    expect(r.prescription.rationale).toContain('pain');
  });

  it('deload week suppresses progression and halves sets', () => {
    const r = prescribe({ ...base, week: week({ week_number: 6, is_deload: true, set_delta: 0, rir_target_low: 4, rir_target_high: 5, volume_multiplier: 0.5 }), history: [session('2026-09-12', 42, [10, 10, 10])] });
    expect(r.prescription.reason).toBe('deload');
    expect(r.prescription.suggested_weight_kg).toBe(42);
    expect(r.prescription.target_sets).toBe(2);
    expect(r.prescription.target_rir).toBe(4);
  });

  it('week RIR target governs the prescribed target; comparison uses the session\'s own target', () => {
    // Week 5 prescribed RIR 1; user hit RIR 1 → should progress, not consolidate against the template's 2.
    const r = prescribe({ ...base, week: week({ week_number: 5, rir_target_low: 1, rir_target_high: 1, set_delta: 3 }), history: [session('2026-09-12', 42, [10, 10, 10], { rir: [1, 1, 1], target_rir: 1 })] });
    expect(r.prescription.reason).toBe('progress_load');
    expect(r.prescription.target_rir).toBe(1);
    expect(r.prescription.target_sets).toBe(3); // not priority → no delta
  });

  it('set ramp applies to priority exercises', () => {
    const r = prescribe({ ...base, template: { ...template, is_priority: true }, week: week({ set_delta: 3 }), history: [] });
    expect(r.prescription.target_sets).toBe(6);
  });

  it('bodyweight exercise (increment 0) progresses reps instead of load', () => {
    const r = prescribe({ ...base, exercise: { ...exercise, weight_increment_kg: 0 }, history: [session('2026-09-12', 0, [10, 10, 10])] });
    expect(r.prescription.reason).toBe('progress_reps');
    expect(r.prescription.target_reps_by_set).toEqual([11, 11, 11]);
    expect(r.prescription.target_rep_high).toBe(11);
  });

  it('constrained: caps weight, raises reps, surfaces notes, suppresses progression', () => {
    const cs = [c({ movement_pattern: 'elbow_flexion', max_weight_kg: 5, min_reps: 15, required_tempo: '3-0-3-0', note: 'Rehab phase.' })];
    const r = prescribe({ ...base, exercise: { ...exercise, id: 'curl' }, constraints: cs, history: [session('2026-09-12', 8, [15, 15, 15])] });
    expect(r.prescription.reason).toBe('constrained');
    expect(r.prescription.suggested_weight_kg).toBe(5);
    expect(r.prescription.target_rep_low).toBe(15);
    expect(r.prescription.target_rep_high).toBe(15);
    expect(r.prescription.required_tempo).toBe('3-0-3-0');
    expect(r.prescription.constraint_notes).toEqual(['Rehab phase.']);
    expect(r.prescription.flags).toContain('constrained');
  });

  it('requires_clearance → no weight, flagged', () => {
    const cs = [c({ movement_pattern: 'vertical_pull', requires_clearance: true, note: 'Confirm with physio.' })];
    const r = prescribe({ ...base, constraints: cs, history: [session('2026-09-12', 10, [8, 8, 8])] });
    expect(r.prescription.reason).toBe('constrained');
    expect(r.prescription.suggested_weight_kg).toBeNull();
    expect(r.prescription.flags).toEqual(expect.arrayContaining(['constrained', 'requires_clearance']));
    expect(r.prescription.constraint_notes).toEqual(['Confirm with physio.']);
  });

  it('blocked → excluded', () => {
    const r = prescribe({ ...base, constraints: [c({ blocked: true })], history: [] });
    expect(r.prescription.flags).toContain('blocked');
    expect(r.prescription.suggested_weight_kg).toBeNull();
  });

  it('baseline e1RM is the best qualifying set in the 21-day window, with provenance', () => {
    const old = session('2026-08-20', 50, [10, 10, 10]);      // 30 days ago → outside window
    const good = session('2026-09-05', 42, [10, 10, 10]);
    const comp = session('2026-09-10', 60, [10, 10, 10], { compromised: true }); // would be higher but excluded
    const last = session('2026-09-12', 44.5, [8, 8, 8]);
    const r = prescribe({ ...base, history: [old, good, comp, last] });
    const expected = Math.max(e1rm(42, 10, 2), e1rm(44.5, 8, 2)); // 59.33 from `last`, beating 58.8 from `good`
    expect(r.next_state.baseline_e1rm).toBeCloseTo(expected, 2);
    expect(r.next_state.baseline_set_id).toBe(last.sets[0]!.id);
    expect(good.sets[0]!.id).not.toBe(last.sets[0]!.id);
  });

  it('warmup sets are ignored everywhere', () => {
    const rec = session('2026-09-12', 42, [10, 10, 10]);
    const r = prescribe({ ...base, history: [{ ...rec, sets: [...rec.sets, mkSet({ reps: 3, weight_kg: 20, is_warmup: true, rir: 8 })] }] });
    expect(r.prescription.reason).toBe('progress_load');
  });

  it('roundToIncrement', () => {
    expect(roundToIncrement(54, 2.5)).toBe(55);
    expect(roundToIncrement(53.7, 2.5)).toBe(52.5);
    expect(roundToIncrement(13.5, 1)).toBe(14);
    expect(roundToIncrement(13.333, 0)).toBe(13.33);
  });
});
