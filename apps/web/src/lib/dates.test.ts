import { describe, expect, it } from 'vitest';
import { formatDateShort, localDateString, weekLabel } from './dates.js';

describe('dates', () => {
  it('formats local calendar dates without timezone drift', () => {
    expect(localDateString(new Date(2026, 8, 7, 23, 59))).toBe('2026-09-07');
    expect(localDateString(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
    expect(formatDateShort('2026-09-07')).toBe('Mon 7 Sep');
    expect(formatDateShort('garbage')).toBe('garbage');
  });
  it('labels ISO weeks', () => {
    expect(weekLabel('2026-W37')).toBe('W37');
    expect(weekLabel('2026-W05')).toBe('W5');
  });
});
