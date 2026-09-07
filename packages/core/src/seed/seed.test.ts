import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUP_KEYS } from '../types.js';
import {
  MUSCLE_GROUPS, SEED_CONSTRAINTS, SEED_EXERCISES, SEED_MUSCLE_CREDITS,
  SEED_TEMPLATES, SEED_TEMPLATE_EXERCISES, VOLUME_TARGETS, buildSeedMesocycle,
} from './index.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('seed data integrity', () => {
  it('muscle groups cover the full taxonomy exactly once', () => {
    expect(MUSCLE_GROUPS.map((m) => m.key).sort()).toEqual([...MUSCLE_GROUP_KEYS].sort());
  });

  it('exercise ids are unique valid UUIDs and names are unique', () => {
    const ids = SEED_EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(UUID);
    const names = SEED_EXERCISES.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every exercise has exactly one primary credit of 1.0 and credits in (0,1]', () => {
    for (const ex of SEED_EXERCISES) {
      const credits = SEED_MUSCLE_CREDITS.filter((c) => c.exercise_id === ex.id);
      expect(credits.length, ex.name).toBeGreaterThan(0);
      const primaries = credits.filter((c) => c.role === 'primary');
      expect(primaries.length, ex.name).toBe(1);
      expect(primaries[0]!.credit, ex.name).toBe(1);
      for (const c of credits) {
        expect(c.credit).toBeGreaterThan(0);
        expect(c.credit).toBeLessThanOrEqual(1);
        expect(MUSCLE_GROUP_KEYS).toContain(c.muscle_group_key);
      }
    }
  });

  it('spec §3.1 credit examples hold', () => {
    const byName = (n: string) => SEED_EXERCISES.find((e) => e.name === n)!;
    const credit = (n: string, m: string) => SEED_MUSCLE_CREDITS.find((c) => c.exercise_id === byName(n).id && c.muscle_group_key === m)?.credit;
    expect(credit('Weighted Chin-Up', 'lats')).toBe(1);
    expect(credit('Weighted Chin-Up', 'biceps')).toBe(0.5);
    expect(credit('Weighted Chin-Up', 'upper_back')).toBe(0.5);
    expect(credit('Barbell Back Squat', 'quads')).toBe(1);
    expect(credit('Barbell Back Squat', 'glutes')).toBe(0.5);
    expect(credit('Barbell Back Squat', 'adductors')).toBe(0.5);
    expect(credit('Barbell Back Squat', 'spinal_erectors')).toBe(0.25);
    expect(credit('Cable Lateral Raise', 'delts_lateral')).toBe(1);
    expect(credit('Cable Lateral Raise', 'delts_rear')).toBe(0.25);
    expect(credit('Overhead Press', 'delts_front')).toBe(1);
    expect(credit('Overhead Press', 'delts_lateral')).toBe(0.5);
    expect(credit('Overhead Press', 'triceps')).toBe(0.5);
  });

  it('templates reference existing exercises, with orders 1..n and correct row counts (7, 7, 8)', () => {
    const ids = new Set(SEED_EXERCISES.map((e) => e.id));
    for (const t of SEED_TEMPLATES) {
      const rows = SEED_TEMPLATE_EXERCISES.filter((r) => r.template_id === t.id).sort((a, b) => a.order - b.order);
      expect(rows.map((r) => r.order)).toEqual(rows.map((_, i) => i + 1));
      for (const r of rows) expect(ids.has(r.exercise_id), r.id).toBe(true);
    }
    const counts = SEED_TEMPLATES.map((t) => SEED_TEMPLATE_EXERCISES.filter((r) => r.template_id === t.id).length);
    expect(counts).toEqual([7, 7, 8]);
  });

  it('volume targets reference valid muscles with min <= max', () => {
    for (const v of VOLUME_TARGETS) {
      expect(MUSCLE_GROUP_KEYS).toContain(v.muscle_group_key);
      expect(v.min_sets).toBeLessThanOrEqual(v.max_sets);
    }
  });

  it('mesocycle has 6 weeks matching §9.2', () => {
    const { mesocycle, weeks } = buildSeedMesocycle('2026-09-07');
    expect(mesocycle.planned_weeks).toBe(6);
    expect(mesocycle.deload_week).toBe(6);
    expect(weeks.map((w) => w.set_delta)).toEqual([0, 1, 2, 3, 3, 0]);
    expect(weeks.map((w) => w.rir_target_low)).toEqual([3, 3, 2, 2, 1, 4]);
    expect(weeks[5]!.is_deload).toBe(true);
    expect(weeks[5]!.volume_multiplier).toBe(0.5);
    expect(weeks[5]!.rir_target_high).toBe(5);
  });

  it('injury constraints are pattern-level per §9.4', () => {
    expect(SEED_CONSTRAINTS.map((c) => c.movement_pattern)).toEqual(['elbow_flexion', 'vertical_pull']);
    expect(SEED_CONSTRAINTS[0]!.max_weight_kg).toBe(5);
    expect(SEED_CONSTRAINTS[0]!.min_reps).toBe(15);
    expect(SEED_CONSTRAINTS[1]!.requires_clearance).toBe(true);
  });
});
