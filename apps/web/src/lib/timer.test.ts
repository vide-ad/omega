import { describe, expect, it } from 'vitest';
import { announceIfDue, extendTimer, isFinished, isStale, progress, remainingSeconds, startTimer } from './timer.js';

describe('rest timer', () => {
  it('counts down as a wall-clock delta', () => {
    const t = startTimer(1_000_000, 90, 'Squat');
    expect(remainingSeconds(t, 1_000_000)).toBe(90);
    expect(remainingSeconds(t, 1_000_000 + 30_000)).toBe(60);
    expect(isFinished(t, 1_000_000 + 89_999)).toBe(false);
    expect(isFinished(t, 1_000_000 + 90_000)).toBe(true);
    // backgrounded for 10 minutes: elapsed, negative remaining, still finite
    expect(remainingSeconds(t, 1_000_000 + 600_000)).toBe(-510);
  });

  it('extends by +30s and re-arms the announcement', () => {
    let t = startTimer(0, 60);
    t = { ...t, announced: true };
    t = extendTimer(t, 30);
    expect(t.total_seconds).toBe(90);
    expect(remainingSeconds(t, 0)).toBe(90);
    expect(t.announced).toBe(false);
  });

  it('announces exactly once', () => {
    const t = startTimer(0, 10);
    expect(announceIfDue(t, 5_000).due).toBe(false);
    const a = announceIfDue(t, 10_000);
    expect(a.due).toBe(true);
    expect(announceIfDue(a.state, 11_000).due).toBe(false);
  });

  it('reports progress and staleness', () => {
    const t = startTimer(0, 100);
    expect(progress(t, 50_000)).toBeCloseTo(0.5);
    expect(progress(t, 500_000)).toBe(1);
    expect(isStale(t, 100_000 + 60_000)).toBe(false);
    expect(isStale(t, 100_000 + 31 * 60_000)).toBe(true);
  });
});
