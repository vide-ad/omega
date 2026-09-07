import { describe, expect, it } from 'vitest';
import type { PreviousPerformance } from '@omega/core';
import { fmtClock, fmtKg, fmtPrevious } from './format.js';

const prev = (sets: PreviousPerformance['sets']): PreviousPerformance => ({ workout_id: 'w', date: '2026-09-01', sets });

describe('format', () => {
  it('formats a clock', () => {
    expect(fmtClock(90)).toBe('1:30');
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(-5)).toBe('0:00');
    expect(fmtClock(59.2)).toBe('1:00');
    expect(fmtClock(600)).toBe('10:00');
  });

  it('formats kg', () => {
    expect(fmtKg(null)).toBe('—');
    expect(fmtKg(42)).toBe('42 kg');
    expect(fmtKg(44.5)).toBe('44.5 kg');
  });

  it('formats the previous-session line, ignoring warmups', () => {
    const p = prev([
      { set_index: 1, side: 'bilateral', weight_kg: 20, reps: 10, rir: null, is_warmup: true, is_amrap: false },
      { set_index: 2, side: 'bilateral', weight_kg: 42, reps: 10, rir: 2, is_warmup: false, is_amrap: false },
      { set_index: 3, side: 'bilateral', weight_kg: 42, reps: 10, rir: 2, is_warmup: false, is_amrap: false },
      { set_index: 4, side: 'bilateral', weight_kg: 42, reps: 9, rir: 2, is_warmup: false, is_amrap: false },
    ]);
    expect(fmtPrevious(p)).toBe('Last: 42 kg × 10, 10, 9 @ RIR 2');
  });

  it('handles unilateral sides, null RIR and no previous', () => {
    expect(fmtPrevious(null)).toBeNull();
    expect(fmtPrevious(prev([]))).toBeNull();
    const p = prev([
      { set_index: 1, side: 'left', weight_kg: 12, reps: 10, rir: null, is_warmup: false, is_amrap: false },
      { set_index: 1, side: 'right', weight_kg: 12, reps: 9, rir: null, is_warmup: false, is_amrap: false },
    ]);
    expect(fmtPrevious(p, true)).toBe('Last: 12 kg × L 10 / R 9');
  });
});
