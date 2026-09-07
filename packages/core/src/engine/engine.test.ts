import { describe, expect, it } from 'vitest';
import type { ExerciseConstraint, MesocycleWeek, SetLog } from '../types.js';
import { e1rm } from './e1rm.js';
import { addDays, daysBetween, isoWeekEnd, isoWeekKey, isoWeekStart } from './dates.js';
import { clampTargetRir, mesocycleWeekNumber, rampedTargetSets, weekWindowFor } from './mesocycle.js';
import { activeConstraintsFor, foldConstraints } from './constraints.js';
import { exerciseCompromisedReasons, musclesTrained, rollingMedianRhr, workoutCompromisedReasons } from './compromised.js';
import { effectiveHardSets, isHardSet, weeklyVolume } from './volume.js';
import { derivedStalls, floorToIncrement, prescribe, roundToIncrement, toWorkUnits, type ExerciseSessionRecord } from './progression.js';

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
  const meso = { id: 'm1', start_date: '2026-09-12', planned_weeks: 6 }; // Saturday
  it('week numbers', () => {
    expect(mesocycleWeekNumber(meso, '2026-09-11')).toBeNull();
    expect(mesocycleWeekNumber(meso, '2026-09-12')).toBe(1);
    expect(mesocycleWeekNumber(meso, '2026-09-16')).toBe(1); // Wednesday of the same block
    expect(mesocycleWeekNumber(meso, '2026-09-19')).toBe(2);
    expect(mesocycleWeekNumber(meso, '2026-10-23')).toBe(6);
    expect(mesocycleWeekNumber(meso, '2026-10-24')).toBeNull();
  });
  it('week windows are block-anchored inside a mesocycle, ISO outside', () => {
    expect(weekWindowFor('2026-09-16', meso)).toEqual({ key: 'meso:m1:1', start: '2026-09-12', end: '2026-09-18', mesocycle_week: 1 });
    expect(weekWindowFor('2026-09-20', meso)).toEqual({ key: 'meso:m1:2', start: '2026-09-19', end: '2026-09-25', mesocycle_week: 2 });
    expect(weekWindowFor('2026-09-10', meso)).toEqual({ key: '2026-W37', start: '2026-09-07', end: '2026-09-13', mesocycle_week: null });
    expect(weekWindowFor('2026-09-16', null).key).toBe('2026-W38');
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
  it('RIR target clamps into the week range', () => {
    expect(clampTargetRir(2, wk({ rir_target_low: 3, rir_target_high: 3 }))).toBe(3);
    expect(clampTargetRir(1, wk({ rir_target_low: 3, rir_target_high: 3 }))).toBe(3);
    expect(clampTargetRir(2, wk({ rir_target_low: 1, rir_target_high: 1 }))).toBe(1);
    expect(clampTargetRir(2, wk({ rir_target_low: 4, rir_target_high: 5 }))).toBe(4);
    expect(clampTargetRir(2, wk({ rir_target_low: 1, rir_target_high: 3 }))).toBe(2);
    expect(clampTargetRir(2, null)).toBe(2);
  });
});

const c = (o: Partial<ExerciseConstraint>): ExerciseConstraint => ({
  id: 'c1', injury_id: 'inj', exercise_id: null, movement_pattern: null, max_weight_kg: null, min_reps: null,
  required_tempo: null, requires_clearance: false, cleared_at: null, blocked: false, note: null, ...o,
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
  it('folds to the most restrictive and tracks clearance', () => {
    const env = foldConstraints([c({ max_weight_kg: 10, min_reps: 12, note: 'a' }), c({ max_weight_kg: 5, min_reps: 15, required_tempo: '3-0-3-0', note: 'b' })]);
    expect(env).toEqual({ blocked: false, awaiting_clearance: false, max_weight_kg: 5, min_reps: 15, required_tempo: '3-0-3-0', notes: ['a', 'b'] });
    expect(foldConstraints([c({ requires_clearance: true })]).awaiting_clearance).toBe(true);
    expect(foldConstraints([c({ requires_clearance: true, cleared_at: '2026-10-01T00:00:00.000Z' })]).awaiting_clearance).toBe(false);
  });
});

describe('compromised §5.2', () => {
  const hist = [64, 62, 63, 61, 65, 62, 63].map((v, i) => ({ date: addDays('2026-09-01', i), resting_hr: v }));
  const base = { date: '2026-09-12', readinessHistory: hist, week: null };
  const readiness = (o: { manual_compromised?: boolean; resting_hr?: number | null; sleep_hours?: number | null }) => ({
    manual_compromised: false, resting_hr: null, sleep_hours: null, ...o,
  });
  it('median excludes today and needs 7 readings', () => {
    expect(rollingMedianRhr(hist, '2026-09-12')).toBe(63);
    expect(rollingMedianRhr([...hist, { date: '2026-09-12', resting_hr: 90 }], '2026-09-12')).toBe(63);
    expect(rollingMedianRhr(hist.slice(0, 6), '2026-09-12')).toBeNull();
    expect(rollingMedianRhr([], '2026-09-12')).toBeNull();
  });
  it('fires each session-level rule', () => {
    expect(workoutCompromisedReasons({ ...base, readiness: null })).toEqual([]);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ manual_compromised: true }) })).toEqual(['manual']);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ resting_hr: 70 }) })).toEqual([]);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ resting_hr: 71 }) })).toEqual(['resting_hr']);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ resting_hr: 80 }), readinessHistory: hist.slice(0, 3) })).toEqual([]); // too few readings
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ sleep_hours: 5.4 }) })).toEqual(['sleep']);
    expect(workoutCompromisedReasons({ ...base, readiness: readiness({ sleep_hours: 5.5 }) })).toEqual([]);
    expect(workoutCompromisedReasons({ ...base, readiness: null, week: { is_deload: true } })).toEqual(['deload']);
  });
  it('muscles trained uses credit ≥ 0.5', () => {
    const credits = [
      { exercise_id: 'a', muscle_group_key: 'quads' as const, credit: 1, role: 'primary' as const },
      { exercise_id: 'a', muscle_group_key: 'spinal_erectors' as const, credit: 0.25, role: 'secondary' as const },
    ];
    expect([...musclesTrained(['a'], credits)]).toEqual(['quads']);
  });
  it('exercise-level: pain or soreness on a trained muscle', () => {
    const credits = [{ muscle_group_key: 'quads' as const, credit: 1 }, { muscle_group_key: 'spinal_erectors' as const, credit: 0.25 }];
    expect(exerciseCompromisedReasons([{ pain_severity: 'niggle' }], [], credits)).toEqual([]);
    expect(exerciseCompromisedReasons([{ pain_severity: 'moderate' }], [], credits)).toEqual(['pain']);
    expect(exerciseCompromisedReasons([{ pain_severity: 'none' }], [{ muscle_group_key: 'quads', rating: 4 }], credits)).toEqual(['soreness']);
    expect(exerciseCompromisedReasons([{ pain_severity: 'none' }], [{ muscle_group_key: 'spinal_erectors', rating: 5 }], credits)).toEqual([]); // 0.25 credit is not "trained"
    expect(exerciseCompromisedReasons([{ pain_severity: 'none' }], [{ muscle_group_key: 'biceps', rating: 5 }], credits)).toEqual([]);
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
  it('hard set threshold: null RIR assumed 2, AMRAP is 0', () => {
    expect(isHardSet({ is_warmup: false, rir: 4, is_amrap: false })).toBe(true);
    expect(isHardSet({ is_warmup: false, rir: 5, is_amrap: false })).toBe(false);
    expect(isHardSet({ is_warmup: false, rir: null, is_amrap: false })).toBe(true);
    expect(isHardSet({ is_warmup: false, rir: 6, is_amrap: true })).toBe(true);
    expect(isHardSet({ is_warmup: true, rir: 0, is_amrap: false })).toBe(false);
  });
  it('unilateral pairs by set_index count as one set', () => {
    const sets = [
      mkSet({ reps: 10, weight_kg: 10, side: 'left', set_index: 1 }), mkSet({ reps: 10, weight_kg: 10, side: 'right', set_index: 1 }),
      mkSet({ reps: 10, weight_kg: 10, side: 'left', set_index: 2 }), mkSet({ reps: 10, weight_kg: 10, side: 'right', set_index: 2, rir: 5 }),
      mkSet({ reps: 10, weight_kg: 10, side: 'left', set_index: 3 }),
      mkSet({ reps: 10, weight_kg: 10, side: 'left', set_index: 4, rir: 5 }), mkSet({ reps: 10, weight_kg: 10, side: 'right', set_index: 4, rir: 5 }),
    ];
    expect(effectiveHardSets(sets, true)).toBe(3); // pair 2 counts (min rir 2), single-sided pair 3 counts, pair 4 too easy
    expect(effectiveHardSets(sets, false)).toBe(4); // 7 sets, 3 at RIR 5
  });
  it('tallies credits per block week and classifies', () => {
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
    const meso = { id: 'm1', start_date: '2026-09-12', planned_weeks: 6 };
    const inputs = [
      ...[1, 2, 3, 4].map(() => ({ set: mkSet({ reps: 8, weight_kg: 60, workout_exercise_id: 'we-sq' }), exercise_id: 'sq', date: '2026-09-12' })),
      { set: mkSet({ reps: 8, weight_kg: 60, workout_exercise_id: 'we-sq', is_warmup: true }), exercise_id: 'sq', date: '2026-09-12' },
      { set: mkSet({ reps: 8, weight_kg: 60, workout_exercise_id: 'we-sq', rir: 5 }), exercise_id: 'sq', date: '2026-09-12' },
      ...[1, 2, 3].map(() => ({ set: mkSet({ reps: 8, weight_kg: 0, workout_exercise_id: 'we-chin' }), exercise_id: 'chin', date: '2026-09-12' })),
      { set: mkSet({ reps: 8, weight_kg: 60, workout_exercise_id: 'we-sq2' }), exercise_id: 'sq', date: '2026-09-16' }, // Wednesday: same block week
      { set: mkSet({ reps: 8, weight_kg: 60, workout_exercise_id: 'we-sq3' }), exercise_id: 'sq', date: '2026-09-19' }, // next block week
    ];
    const weeks = weeklyVolume(inputs, exercises, credits, targets, { mesocycle: meso, today: '2026-09-27' });
    expect(weeks.map((w) => w.key)).toEqual(['meso:m1:1', 'meso:m1:2', 'meso:m1:3']);
    const w1 = Object.fromEntries(weeks[0]!.muscles.map((m) => [m.muscle_group_key, m]));
    expect(w1.quads!.sets).toBe(5);
    expect(w1.quads!.status).toBe('under');
    expect(w1.glutes!.sets).toBe(2.5);
    expect(w1.glutes!.status).toBe('over');
    expect(w1.lats!.sets).toBe(3);
    expect(w1.lats!.status).toBe('no_target');
    expect(w1.biceps!.sets).toBe(1.5);
    expect(weeks[0]!.partial).toBe(false);
    expect(weeks[1]!.muscles.find((m) => m.muscle_group_key === 'quads')!.sets).toBe(1);
    expect(weeks[2]!.muscles.every((m) => m.sets === 0)).toBe(true);
    expect(weeks[2]!.partial).toBe(true);
  });
});

describe('progression §5.5', () => {
  const exercise = { id: 'bench', name: 'Bench', weight_increment_kg: 2.5, is_unilateral: false };
  const template = { base_sets: 3, is_priority: false, rep_low: 8, rep_high: 10, rir_target: 2, last_set_amrap: false };
  const week = (o: Partial<MesocycleWeek> = {}): MesocycleWeek => ({ mesocycle_id: 'm', week_number: 2, is_deload: false, set_delta: 1, rir_target_low: 2, rir_target_high: 2, volume_multiplier: 1, ...o });

  interface SessOpts { rir?: (number | null)[]; compromised?: boolean; exerciseCompromised?: boolean; pain?: boolean; target_rir?: number; range?: [number, number]; reason?: ExerciseSessionRecord['workout_exercise']['reason']; completed?: boolean; amrapLast?: boolean }
  function session(date: string, weight: number, reps: number[], o: SessOpts = {}): ExerciseSessionRecord {
    return {
      workout: { id: `w-${date}`, date, is_compromised: o.compromised ?? false, completed_at: (o.completed ?? true) ? `${date}T11:00:00.000Z` : null },
      workout_exercise: {
        id: `we-${date}`, target_rep_low: o.range?.[0] ?? 8, target_rep_high: o.range?.[1] ?? 10, target_rir: o.target_rir ?? 2, target_sets: 3,
        suggested_weight_kg: weight, reason: o.reason ?? null, is_compromised: o.exerciseCompromised ?? false,
      },
      sets: reps.map((r, i) => mkSet({
        reps: r, weight_kg: weight, set_index: i + 1, rir: o.rir ? o.rir[i]! : 2, is_amrap: !!o.amrapLast && i === reps.length - 1,
        pain_severity: o.pain && i === 0 ? 'moderate' : 'none', completed_at: `${date}T10:00:00.000Z`,
      })),
    };
  }
  const base = { exercise, template, week: null, constraints: [], starting_load_kg: null, today: '2026-09-19' };

  it('first_time with no history and no starting load → null weight', () => {
    const r = prescribe({ ...base, history: [] });
    expect(r.prescription.reason).toBe('first_time');
    expect(r.prescription.suggested_weight_kg).toBeNull();
    expect(r.prescription.target_sets).toBe(3);
    expect(r.prescription.target_rir).toBe(2);
    expect(r.prescription.omit).toBe(false);
  });

  it('first_time uses the starting load rounded to the increment (§9.5: 42 → 42.5)', () => {
    const r = prescribe({ ...base, history: [], starting_load_kg: 42 });
    expect(r.prescription.reason).toBe('first_time');
    expect(r.prescription.suggested_weight_kg).toBe(42.5);
  });

  it('first_time when the only history has no RIR: repeats the weight lifted', () => {
    const r = prescribe({ ...base, history: [session('2026-09-12', 42.5, [10, 10, 10], { rir: [null, null, null] })] });
    expect(r.prescription.reason).toBe('first_time');
    expect(r.prescription.suggested_weight_kg).toBe(42.5);
    expect(r.prescription.rationale).toContain('no_rir');
  });

  it('an unfinished session dated today does not count; a past unfinished one does', () => {
    const r = prescribe({ ...base, history: [session('2026-09-19', 42.5, [10, 10, 10], { completed: false })] });
    expect(r.prescription.reason).toBe('first_time');
    const r2 = prescribe({ ...base, history: [session('2026-09-12', 42.5, [10, 10, 10], { completed: false })] });
    expect(r2.prescription.reason).toBe('progress_load');
  });

  it('progress_load when all sets ≥ rep_high and mean RIR ≥ target', () => {
    const r = prescribe({ ...base, history: [session('2026-09-12', 42.5, [10, 10, 10], { rir: [2, 2, 3] })] });
    expect(r.prescription.reason).toBe('progress_load');
    expect(r.prescription.suggested_weight_kg).toBe(45);
    expect(r.prescription.target_rep_low).toBe(8);
    expect(r.prescription.target_reps_by_set).toBeNull();
    expect(r.next_state.last_progressed_at).toBe('2026-09-19');
    expect(r.next_state.consecutive_stalls).toBe(0);
    expect(r.prescription.based_on_workout_id).toBe('w-2026-09-12');
  });

  it('off-grid weight still adds exactly one increment (42 + 2.5 = 44.5)', () => {
    const r = prescribe({ ...base, history: [session('2026-09-12', 42, [10, 10, 10])] });
    expect(r.prescription.suggested_weight_kg).toBe(44.5);
  });

  it('consolidate when reps are there but RIR below target', () => {
    const r = prescribe({ ...base, history: [session('2026-09-12', 42.5, [10, 10, 10], { rir: [1, 1, 0] })] });
    expect(r.prescription.reason).toBe('consolidate');
    expect(r.prescription.suggested_weight_kg).toBe(42.5);
  });

  it('AMRAP sets are excluded from the mean-RIR test but count for reps', () => {
    const ok = prescribe({ ...base, history: [session('2026-09-12', 42.5, [10, 10, 14], { rir: [2, 2, null], amrapLast: true })] });
    expect(ok.prescription.reason).toBe('progress_load'); // mean over non-AMRAP = 2
    const short = prescribe({ ...base, history: [session('2026-09-12', 42.5, [10, 10, 7], { rir: [2, 2, 0], amrapLast: true })] });
    expect(short.prescription.reason).toBe('progress_reps'); // AMRAP reps below rep_high
    const onlyAmrap = prescribe({ ...base, history: [session('2026-09-12', 42.5, [12], { rir: [0], amrapLast: true })] });
    expect(onlyAmrap.prescription.reason).toBe('progress_load'); // no non-AMRAP sets → RIR condition satisfied
  });

  it('progress_reps when some sets below rep_high: +1 per set, capped at rep_high, extra sets at rep_low', () => {
    const r = prescribe({ ...base, week: week({ set_delta: 1 }), template: { ...template, is_priority: true }, history: [session('2026-09-12', 42.5, [10, 9, 8])] });
    expect(r.prescription.reason).toBe('progress_reps');
    expect(r.prescription.suggested_weight_kg).toBe(42.5);
    expect(r.prescription.target_sets).toBe(4);
    expect(r.prescription.target_reps_by_set).toEqual([10, 10, 9, 8]);
  });

  it('single miss below rep_low is progress_reps with a warning; two consecutive → regress_load', () => {
    const one = prescribe({ ...base, history: [session('2026-09-12', 60, [8, 7, 6])] });
    expect(one.prescription.reason).toBe('progress_reps');
    expect(one.prescription.rationale).toContain('second consecutive miss');
    const two = prescribe({ ...base, history: [session('2026-09-12', 60, [8, 7, 6], { reason: 'progress_reps' }), session('2026-09-15', 60, [8, 6, 6])] });
    expect(two.prescription.reason).toBe('regress_load');
    expect(two.prescription.suggested_weight_kg).toBe(55); // 54 → nearest 2.5 = 55
    expect(two.next_state.consecutive_stalls).toBe(1);
    expect(two.prescription.flags).not.toContain('stall_review');
  });

  it('two misses with a non-qualifying session between them still count as consecutive', () => {
    const hist = [
      session('2026-09-08', 60, [8, 7, 6]),
      session('2026-09-11', 60, [8, 8, 8], { compromised: true }),
      session('2026-09-15', 60, [8, 6, 6]),
    ];
    expect(prescribe({ ...base, history: hist }).prescription.reason).toBe('regress_load');
  });

  it('regress always lands strictly below the previous weight', () => {
    const r = prescribe({ ...base, exercise: { ...exercise, weight_increment_kg: 5 }, history: [session('2026-09-12', 20, [7, 7, 7]), session('2026-09-15', 20, [7, 7, 7])] });
    expect(r.prescription.suggested_weight_kg).toBe(15); // 18 rounds to 20 → step down one increment
  });

  it('stalls are derived from stored reasons; stall_review at 3', () => {
    const hist = [
      session('2026-08-20', 65, [10, 10, 10], { reason: 'progress_load' }),
      session('2026-08-24', 62.5, [7, 7, 7], { reason: 'regress_load' }),
      session('2026-08-28', 62.5, [7, 7, 7], { reason: 'progress_reps' }),
      session('2026-09-01', 60, [7, 7, 7], { reason: 'regress_load' }),
      session('2026-09-12', 60, [8, 7, 6], { reason: 'progress_reps' }),
      session('2026-09-15', 60, [8, 6, 6], { reason: 'progress_reps' }),
    ];
    const r = prescribe({ ...base, history: hist });
    expect(r.prescription.reason).toBe('regress_load');
    expect(r.prescription.flags).toContain('stall_review');
    expect(r.next_state.consecutive_stalls).toBe(3);
    expect(r.next_state.last_progressed_at).toBe('2026-08-20');
  });
  it('derivedStalls helper', () => {
    expect(derivedStalls([])).toBe(0);
  });

  it('compromised sessions are excluded in both directions and trigger repeat_after_compromised', () => {
    const hist = [
      session('2026-09-12', 42.5, [10, 10, 10]),                             // qualifying → would progress to 45
      session('2026-09-15', 45, [6, 5, 5], { compromised: true }),           // bad night; a miss that must not count
    ];
    const r = prescribe({ ...base, history: hist });
    expect(r.prescription.reason).toBe('repeat_after_compromised');
    expect(r.prescription.suggested_weight_kg).toBe(45);
    expect(r.prescription.rationale).toContain('workout_compromised');
    expect(r.next_state.consecutive_stalls).toBe(0);
    expect(r.next_state.last_progressed_at).toBeNull(); // not a new progression event
  });

  it('pain flag and exercise-level soreness make the exercise non-qualifying', () => {
    const pain = prescribe({ ...base, history: [session('2026-09-12', 42.5, [10, 10, 10]), session('2026-09-15', 45, [10, 10, 10], { pain: true })] });
    expect(pain.prescription.reason).toBe('repeat_after_compromised');
    expect(pain.prescription.rationale).toContain('pain');
    const sore = prescribe({ ...base, history: [session('2026-09-12', 42.5, [10, 10, 10]), session('2026-09-15', 45, [10, 10, 10], { exerciseCompromised: true })] });
    expect(sore.prescription.rationale).toContain('exercise_compromised');
  });

  it('deload week suppresses progression, halves sets, clamps RIR to 4, and turns AMRAP off', () => {
    const r = prescribe({ ...base, template: { ...template, last_set_amrap: true }, week: week({ week_number: 6, is_deload: true, set_delta: 0, rir_target_low: 4, rir_target_high: 5, volume_multiplier: 0.5 }), history: [session('2026-09-12', 42.5, [10, 10, 10])] });
    expect(r.prescription.reason).toBe('deload');
    expect(r.prescription.suggested_weight_kg).toBe(42.5);
    expect(r.prescription.target_sets).toBe(2);
    expect(r.prescription.target_rir).toBe(4);
    expect(r.prescription.last_set_amrap).toBe(false);
  });

  it('performance is judged against the session\'s own targets, prescription uses the current template', () => {
    // Week 5 prescribed RIR 1; user hit RIR 1 → progress, not consolidate against the template's 2.
    const r = prescribe({ ...base, week: week({ week_number: 5, rir_target_low: 1, rir_target_high: 1, set_delta: 3 }), history: [session('2026-09-12', 42.5, [10, 10, 10], { rir: [1, 1, 1], target_rir: 1 })] });
    expect(r.prescription.reason).toBe('progress_load');
    expect(r.prescription.target_rir).toBe(1);
    // Chin-up done at 8–10 on Day 3 (all 10s), now instantiated on Day 1 with 6–8 → progress, and the rationale says so.
    const chin = prescribe({ ...base, template: { ...template, rep_low: 6, rep_high: 8 }, history: [session('2026-09-16', 10, [10, 10, 10], { range: [8, 10] })] });
    expect(chin.prescription.reason).toBe('progress_load');
    expect(chin.prescription.target_rep_low).toBe(6);
    expect(chin.prescription.rationale).toContain("Today's range is 6–8");
  });

  it('set ramp applies to priority exercises and RIR follows the week', () => {
    const r = prescribe({ ...base, template: { ...template, is_priority: true }, week: week({ set_delta: 3, rir_target_low: 3, rir_target_high: 3 }), history: [] });
    expect(r.prescription.target_sets).toBe(6);
    expect(r.prescription.target_rir).toBe(3);
  });

  it('unloadable exercise (increment 0) progresses reps uncapped and is flagged', () => {
    const r = prescribe({ ...base, exercise: { ...exercise, weight_increment_kg: 0 }, history: [session('2026-09-12', 0, [10, 10, 10])] });
    expect(r.prescription.reason).toBe('progress_reps');
    expect(r.prescription.target_reps_by_set).toEqual([11, 11, 11]);
    expect(r.prescription.target_rep_high).toBe(11);
    expect(r.prescription.flags).toContain('unloadable');
  });

  it('unilateral: left/right pairs share a set_index; reps = min, rir = mean', () => {
    const uni = { ...exercise, id: 'bss', is_unilateral: true };
    const rec: ExerciseSessionRecord = {
      workout: { id: 'w1', date: '2026-09-12', is_compromised: false, completed_at: '2026-09-12T11:00:00.000Z' },
      workout_exercise: { id: 'we1', target_rep_low: 8, target_rep_high: 10, target_rir: 2, target_sets: 3, suggested_weight_kg: 10, reason: null, is_compromised: false },
      sets: [
        mkSet({ reps: 10, weight_kg: 10, side: 'left', set_index: 1, rir: 2 }), mkSet({ reps: 10, weight_kg: 10, side: 'right', set_index: 1, rir: 2 }),
        mkSet({ reps: 10, weight_kg: 10, side: 'left', set_index: 2, rir: 2 }), mkSet({ reps: 9, weight_kg: 10, side: 'right', set_index: 2, rir: 1 }),
      ],
    };
    const units = toWorkUnits(rec.sets, true);
    expect(units.map((u) => u.reps)).toEqual([10, 9]);
    expect(units[1]!.rir).toBe(1.5);
    const r = prescribe({ ...base, exercise: uni, history: [rec] });
    expect(r.prescription.reason).toBe('progress_reps');
    expect(r.prescription.target_reps_by_set).toEqual([10, 10, 8]);
  });

  it('constrained exercises progress normally but are clamped (cap floored to increment, min reps, tempo, notes)', () => {
    const cs = [c({ movement_pattern: 'elbow_flexion', max_weight_kg: 5, min_reps: 15, required_tempo: '3-0-3-0', note: 'Rehab phase.' })];
    const curl = { ...exercise, id: 'curl', weight_increment_kg: 2 };
    const first = prescribe({ ...base, exercise: curl, template: { ...template, rep_low: 10, rep_high: 12 }, constraints: cs, history: [], starting_load_kg: null });
    expect(first.prescription.reason).toBe('first_time');
    expect(first.prescription.suggested_weight_kg).toBe(4); // starts at the cap, floored to the 2 kg grid
    expect(first.prescription.target_rep_low).toBe(15);
    expect(first.prescription.target_rep_high).toBe(15);
    expect(first.prescription.target_tempo).toBe('3-0-3-0');
    expect(first.prescription.flags).toContain('constrained');
    expect(first.prescription.constraint_notes).toEqual(['Rehab phase.']);
    // Hit 15s at RIR 2 on 4 kg → rule says +2 = 6 kg, clamp holds it at 4 kg and says so.
    const next = prescribe({ ...base, exercise: curl, template: { ...template, rep_low: 10, rep_high: 12 }, constraints: cs, history: [session('2026-09-12', 4, [15, 15, 15], { range: [15, 15] })] });
    expect(next.prescription.reason).toBe('progress_load');
    expect(next.prescription.suggested_weight_kg).toBe(4);
    expect(next.prescription.rationale).toContain('capped');
    // Raise the cap to 6 → the same history now progresses to 6.
    const raised = prescribe({ ...base, exercise: curl, template: { ...template, rep_low: 10, rep_high: 12 }, constraints: [c({ ...cs[0]!, max_weight_kg: 6 })], history: [session('2026-09-12', 4, [15, 15, 15], { range: [15, 15] })] });
    expect(raised.prescription.suggested_weight_kg).toBe(6);
  });

  it('requires_clearance → stays in session with no weight; cleared → caps still apply', () => {
    const cs = [c({ movement_pattern: 'vertical_pull', requires_clearance: true, max_weight_kg: 10, note: 'Confirm with physio.' })];
    const r = prescribe({ ...base, constraints: cs, history: [session('2026-09-12', 10, [10, 10, 10])] });
    expect(r.prescription.reason).toBe('requires_clearance');
    expect(r.prescription.suggested_weight_kg).toBeNull();
    expect(r.prescription.omit).toBe(false);
    expect(r.prescription.constraint_notes).toEqual(['Confirm with physio.']);
    const cleared = prescribe({ ...base, constraints: [c({ ...cs[0]!, cleared_at: '2026-09-18T00:00:00.000Z' })], history: [session('2026-09-12', 10, [10, 10, 10])] });
    expect(cleared.prescription.reason).toBe('progress_load');
    expect(cleared.prescription.suggested_weight_kg).toBe(10); // 12.5 capped to 10
    expect(cleared.prescription.flags).toContain('constrained');
  });

  it('blocked → omitted', () => {
    const r = prescribe({ ...base, constraints: [c({ blocked: true })], history: [] });
    expect(r.prescription.reason).toBe('blocked');
    expect(r.prescription.omit).toBe(true);
    expect(r.prescription.suggested_weight_kg).toBeNull();
  });

  it('baseline e1RM is the best qualifying set in the 21-day window, with provenance', () => {
    const old = session('2026-08-20', 50, [10, 10, 10]);      // 30 days ago → outside window
    const good = session('2026-09-05', 42, [10, 10, 10]);
    const comp = session('2026-09-10', 60, [10, 10, 10], { compromised: true }); // would be higher but excluded
    const last = session('2026-09-12', 44.5, [8, 8, 8]);
    const r = prescribe({ ...base, history: [old, good, comp, last] });
    const expected = Math.max(e1rm(42, 10, 2), e1rm(44.5, 8, 2)); // 59.33 from `last`
    expect(r.next_state.baseline_e1rm).toBeCloseTo(expected, 2);
    expect(r.next_state.baseline_set_id).toBe(last.sets[0]!.id);
    expect(good.sets[0]!.id).not.toBe(last.sets[0]!.id);
  });

  it('warmup sets are ignored everywhere', () => {
    const rec = session('2026-09-12', 42.5, [10, 10, 10]);
    const r = prescribe({ ...base, history: [{ ...rec, sets: [...rec.sets, mkSet({ reps: 3, weight_kg: 20, is_warmup: true, rir: 8, set_index: 0 })] }] });
    expect(r.prescription.reason).toBe('progress_load');
  });

  it('per-set targets never exceed the sets prescribed today', () => {
    // Last time the user ran 6 sets; today's template prescribes 3.
    const r = prescribe({ ...base, history: [session('2026-09-12', 42.5, [10, 9, 8, 8, 8, 8])] });
    expect(r.prescription.target_sets).toBe(3);
    expect(r.prescription.target_reps_by_set).toEqual([10, 10, 9]);
    const unloadable = prescribe({ ...base, exercise: { ...exercise, weight_increment_kg: 0 }, history: [session('2026-09-12', 0, [10, 10, 10, 10, 15])] });
    expect(unloadable.prescription.target_reps_by_set).toEqual([11, 11, 11]);
    expect(unloadable.prescription.target_rep_high).toBe(11); // not widened by the dropped 16
  });

  it('the rationale always names the weight actually prescribed', () => {
    const cs = [c({ movement_pattern: 'elbow_flexion', max_weight_kg: 5, note: 'Rehab phase.' })];
    const curl = { ...exercise, id: 'curl', weight_increment_kg: 2 };
    const first = prescribe({ ...base, exercise: curl, constraints: cs, history: [] });
    expect(first.prescription.suggested_weight_kg).toBe(4);
    expect(first.prescription.rationale).toContain('starting at the 4 kg cap');
    expect(first.prescription.rationale).not.toContain('5 kg cap');
    // A hold that gets clamped must not tell the user to hold the pre-clamp weight.
    const held = prescribe({ ...base, exercise: curl, constraints: cs, history: [session('2026-09-12', 6, [10, 10, 10], { rir: [0, 0, 0] })] });
    expect(held.prescription.reason).toBe('consolidate');
    expect(held.prescription.suggested_weight_kg).toBe(4);
    expect(held.prescription.rationale).toContain('hold 4 kg');
  });

  it('repeat_after_compromised does not carry a stale stall count', () => {
    const hist = [
      session('2026-09-08', 60, [8, 7, 6], { reason: 'progress_reps' }),
      session('2026-09-12', 60, [8, 6, 6], { reason: 'progress_reps' }),
      session('2026-09-15', 55, [8, 8, 8], { compromised: true }),
    ];
    const r = prescribe({ ...base, history: hist });
    expect(r.prescription.reason).toBe('repeat_after_compromised');
    expect(r.next_state.consecutive_stalls).toBe(0);
    expect(r.prescription.rationale).not.toContain('Stall count');
    const direct = prescribe({ ...base, history: hist.slice(0, 2) });
    expect(direct.prescription.reason).toBe('regress_load');
    expect(direct.prescription.rationale).toContain('Stall count 1');
  });

  it('same-date sessions resolve deterministically regardless of input order', () => {
    const good = { ...session('2026-09-12', 42.5, [10, 10, 10]), workout: { id: 'w-a', date: '2026-09-12', is_compromised: false, completed_at: '2026-09-12T09:00:00.000Z' } };
    const bad = { ...session('2026-09-12', 45, [6, 5, 5], { compromised: true }), workout: { id: 'w-b', date: '2026-09-12', is_compromised: true, completed_at: '2026-09-12T18:00:00.000Z' } };
    const forward = prescribe({ ...base, history: [good, bad] });
    const reversed = prescribe({ ...base, history: [bad, good] });
    expect(forward.prescription.reason).toBe('repeat_after_compromised'); // the later session is the compromised one
    expect(reversed.prescription).toEqual(forward.prescription);
  });

  it('rounding helpers', () => {
    expect(roundToIncrement(54, 2.5)).toBe(55);
    expect(roundToIncrement(53.7, 2.5)).toBe(52.5);
    expect(roundToIncrement(13.5, 1)).toBe(14);
    expect(roundToIncrement(13.333, 0)).toBe(13.33);
    expect(floorToIncrement(5, 2)).toBe(4);
    expect(floorToIncrement(5, 2.5)).toBe(5);
    expect(floorToIncrement(4.99, 2.5)).toBe(2.5);
  });
});
