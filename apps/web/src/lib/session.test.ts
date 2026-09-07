import { describe, expect, it } from 'vitest';
import type { SetLog, WorkoutDetail, WorkoutExerciseDetail } from '@omega/core';
import {
  canRemoveLastRow, defaultDraft, draftToSetCreate, draftToSetPatch, loggedSet, nextPain, nextRow, restTakenSeconds,
  rowCount, rowsFor, sessionSummary,
} from './session.js';

function exDetail(over: Partial<WorkoutExerciseDetail['workout_exercise']> = {}, exOver: Partial<WorkoutExerciseDetail['exercise']> = {}, sets: SetLog[] = []): WorkoutExerciseDetail {
  return {
    workout_exercise: {
      id: 'we1', workout_id: 'w1', exercise_id: 'e1', order: 1, target_sets: 3, target_rep_low: 8, target_rep_high: 10,
      target_rir: 2, suggested_weight_kg: 42.5, rest_seconds: 150, notes: null, target_reps_by_set: null, target_tempo: null,
      last_set_amrap: false, reason: 'progress_load', rationale: 'x', flags: [], constraint_notes: [], based_on_workout_id: null,
      is_compromised: false, ...over,
    },
    exercise: {
      id: 'e1', name: 'Bench', aliases: [], equipment: 'barbell', movement_pattern: 'horizontal_press', is_unilateral: false,
      lengthened_bias: false, default_rep_low: 8, default_rep_high: 10, default_rir_target: 2, default_rest_seconds: 150,
      weight_increment_kg: 2.5, uses_bodyweight: false, demo_video_url: null, cues: null, archived: false, created_at: '2026-01-01T00:00:00.000Z',
      ...exOver,
    },
    prescription: null,
    previous: null,
    sets,
  };
}

function set(over: Partial<SetLog>): SetLog {
  return {
    id: 's', workout_exercise_id: 'we1', set_index: 1, side: 'bilateral', is_warmup: false, is_amrap: false, weight_kg: 42.5,
    reps: 10, rir: 2, tempo: null, rest_taken_seconds: null, pain_severity: 'none', pain_note: null, media_id: null,
    completed_at: '2026-09-07T10:00:00.000Z', ...over,
  };
}

describe('rows', () => {
  it('shows planned sets, grows with logged sets, never below 1', () => {
    const ex = exDetail();
    expect(rowCount(ex, 0)).toBe(3);
    expect(rowCount(ex, 2)).toBe(5);
    expect(rowCount(ex, -5)).toBe(1);
    const withSets = exDetail({}, {}, [set({ id: 'a', set_index: 4 })]);
    expect(rowCount(withSets, -1)).toBe(4);
  });

  it('expands unilateral exercises into L/R rows sharing a set_index', () => {
    const ex = exDetail({ target_sets: 2 }, { is_unilateral: true });
    expect(rowsFor(ex, 0)).toEqual([
      { set_index: 1, side: 'left' }, { set_index: 1, side: 'right' },
      { set_index: 2, side: 'left' }, { set_index: 2, side: 'right' },
    ]);
  });

  it('finds the logged set for a row and the next empty row', () => {
    const ex = exDetail({}, {}, [set({ id: 'a', set_index: 1 })]);
    expect(loggedSet(ex, { set_index: 1, side: 'bilateral' })?.id).toBe('a');
    expect(loggedSet(ex, { set_index: 2, side: 'bilateral' })).toBeUndefined();
    expect(nextRow(ex, 0)).toEqual({ set_index: 2, side: 'bilateral' });
    const full = exDetail({ target_sets: 1 }, {}, [set({ id: 'a' })]);
    expect(nextRow(full, 0)).toBeNull();
  });

  it('only lets the last row go when nothing is logged there', () => {
    expect(canRemoveLastRow(exDetail(), 0)).toBe(true);
    expect(canRemoveLastRow(exDetail({ target_sets: 1 }), 0)).toBe(false);
    expect(canRemoveLastRow(exDetail({}, {}, [set({ set_index: 3 })]), 0)).toBe(false);
  });
});

describe('drafts', () => {
  it('prefills from the suggestion, target reps and target RIR', () => {
    const d = defaultDraft(exDetail(), { set_index: 1, side: 'bilateral' });
    expect(d).toMatchObject({ weight_kg: '42.5', reps: '8', rir: 2, is_warmup: false, is_amrap: false, pain_severity: 'none' });
  });

  it('uses target_reps_by_set and the last logged working weight', () => {
    const ex = exDetail({ target_reps_by_set: [10, 11, 11] }, {}, [set({ id: 'w', is_warmup: true, weight_kg: 20 }), set({ id: 'a', weight_kg: 45, completed_at: '2026-09-07T10:05:00.000Z' })]);
    const d = defaultDraft(ex, { set_index: 2, side: 'bilateral' });
    expect(d.weight_kg).toBe('45');
    expect(d.reps).toBe('11');
    // beyond the by-set targets → rep_low
    expect(defaultDraft(ex, { set_index: 5, side: 'bilateral' }).reps).toBe('8');
  });

  it('turns on AMRAP (RIR 0) for the last planned set when prescribed', () => {
    const ex = exDetail({ last_set_amrap: true });
    expect(defaultDraft(ex, { set_index: 2, side: 'bilateral' }).is_amrap).toBe(false);
    const last = defaultDraft(ex, { set_index: 3, side: 'bilateral' });
    expect(last.is_amrap).toBe(true);
    expect(last.rir).toBe(0);
  });

  it('falls back to the previous session weight, then blank (0 for bodyweight)', () => {
    const ex = exDetail({ suggested_weight_kg: null });
    ex.previous = { workout_id: 'w0', date: '2026-09-01', sets: [{ set_index: 1, side: 'bilateral', weight_kg: 40, reps: 10, rir: 2, is_warmup: false, is_amrap: false }] };
    expect(defaultDraft(ex, { set_index: 1, side: 'bilateral' }).weight_kg).toBe('40');
    expect(defaultDraft(exDetail({ suggested_weight_kg: null }), { set_index: 1, side: 'bilateral' }).weight_kg).toBe('');
    expect(defaultDraft(exDetail({ suggested_weight_kg: null }, { uses_bodyweight: true }), { set_index: 1, side: 'bilateral' }).weight_kg).toBe('0');
  });

  it('validates and builds a SetCreate with the tempo from the prescription', () => {
    const ex = exDetail({ target_tempo: '3-0-3-0' });
    const base = defaultDraft(ex, { set_index: 1, side: 'bilateral' });
    const r = draftToSetCreate(ex, { set_index: 1, side: 'bilateral' }, { ...base, weight_kg: '5', reps: '15', pain_severity: 'niggle', pain_note: ' tingle ' }, { id: 'id1', completed_at: '2026-09-07T10:00:00.000Z', rest_taken_seconds: 90 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ id: 'id1', workout_exercise_id: 'we1', set_index: 1, side: 'bilateral', weight_kg: 5, reps: 15, rir: 2, tempo: '3-0-3-0', rest_taken_seconds: 90, pain_severity: 'niggle', pain_note: 'tingle' });
    expect(draftToSetCreate(ex, { set_index: 1, side: 'bilateral' }, { ...base, weight_kg: '' }, { id: 'x', completed_at: 't', rest_taken_seconds: null })).toMatchObject({ ok: false });
    expect(draftToSetCreate(ex, { set_index: 1, side: 'bilateral' }, { ...base, reps: '9.5' }, { id: 'x', completed_at: 't', rest_taken_seconds: null })).toMatchObject({ ok: false });
    // decimal comma, AMRAP forces rir 0, pain note dropped when pain is none
    const a = draftToSetCreate(ex, { set_index: 1, side: 'bilateral' }, { ...base, weight_kg: '42,5', is_amrap: true, rir: 3, pain_note: 'ignored' }, { id: 'x', completed_at: 't', rest_taken_seconds: null });
    if (a.ok) expect(a.value).toMatchObject({ weight_kg: 42.5, rir: 0, pain_note: null });
  });

  it('builds a patch body', () => {
    const ex = exDetail();
    const p = draftToSetPatch(ex, { weight_kg: '40', reps: '9', rir: 1, is_warmup: false, is_amrap: false, pain_severity: 'none', pain_note: '' });
    expect(p).toEqual({ ok: true, value: { weight_kg: 40, reps: 9, rir: 1, is_warmup: false, is_amrap: false, pain_severity: 'none', pain_note: null } });
  });

  it('cycles pain', () => {
    expect(nextPain('none')).toBe('niggle');
    expect(nextPain('stop')).toBe('none');
  });
});

describe('summary', () => {
  const detail = (): WorkoutDetail => ({
    workout: { id: 'w1', template_id: 't', template_version: 1, mesocycle_id: null, week_number: null, date: '2026-09-07', started_at: null, completed_at: null, readiness_id: null, session_rpe: null, notes: null, is_compromised: false },
    template_name: 'Day 1',
    exercises: [
      exDetail({}, {}, [set({ id: 'a', is_warmup: true, rir: null }), set({ id: 'b', set_index: 2 }), set({ id: 'c', set_index: 3, rir: 5 })]),
      exDetail({ id: 'we2' }, { id: 'e2', is_unilateral: true }, [
        set({ id: 'd', workout_exercise_id: 'we2', side: 'left', rir: 1, pain_severity: 'niggle', completed_at: '2026-09-07T10:10:00.000Z' }),
        set({ id: 'e', workout_exercise_id: 'we2', side: 'right', rir: 4, completed_at: '2026-09-07T10:11:00.000Z' }),
      ]),
      exDetail({ id: 'we3' }, { id: 'e3' }),
    ],
    omitted: [],
  });

  it('counts sets, working sets, hard sets (pairs once) and pain flags', () => {
    expect(sessionSummary(detail())).toEqual({ sets_logged: 5, working_sets: 4, hard_sets: 2, exercises_touched: 2, exercises_total: 3, pain_flags: 1 });
  });

  it('measures rest taken from the most recent set', () => {
    expect(restTakenSeconds(detail(), '2026-09-07T10:12:30.000Z')).toBe(90);
    expect(restTakenSeconds(detail(), '2026-09-07T12:12:30.000Z')).toBeNull();
    expect(restTakenSeconds({ ...detail(), exercises: [] }, '2026-09-07T10:12:30.000Z')).toBeNull();
  });
});
