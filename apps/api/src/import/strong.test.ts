import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { EX, SEED_TEMPLATES, seedExerciseId, type WorkoutDetail } from '@omega/core';
import { createApp } from '../app.js';
import { Db } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import * as repo from '../db/repos/index.js';
import { seedDatabase } from '../seed.js';
import { applyImport, parseDurationSeconds, parseStrongCsv, planImport, rirFromRpe, stableId, StrongParseError } from './strong.js';

const FIXTURE = readFileSync(join(import.meta.dirname, 'fixtures/strong-sample.csv'), 'utf8');
const NOW = () => new Date('2026-09-12T12:00:00.000Z');
const WRITE = 'test-write-token-0123456789';

function freshDb(): Db {
  const db = new Db(new DatabaseSync(':memory:'));
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  seedDatabase(db, { start_date: '2026-09-12', now: NOW });
  return db;
}

function plan(db: Db, extra?: Record<string, string>) {
  return planImport(parseStrongCsv(FIXTURE), { exercises: repo.listAllExercises(db, { includeArchived: true }), extraMapping: extra, now: NOW });
}

describe('parseStrongCsv', () => {
  it('reads by column name and keeps Set Order as text', () => {
    const rows = parseStrongCsv(FIXTURE);
    expect(rows).toHaveLength(16);
    expect(rows[0]).toMatchObject({ line: 2, date: '2017-07-14 02:37:37', workout_name: 'Evening Workout', duration: '1h 36m', exercise_name: 'Bench Press (Barbell)', set_order: '1', weight: 61.23, reps: 5, rpe: null });
    // Point 1 of the spec: a warm up is "W", not NaN.
    expect(rows[3]!.set_order).toBe('W');
    expect(rows.map((r) => r.set_order)).toContain('D');
    expect(rows.map((r) => r.set_order)).toContain('F');
    // Stray whitespace in workout names is trimmed.
    expect(rows[3]!.workout_name).toBe('Day 1');
    expect(rows[14]!.workout_name).toBe('Push / Isolation : DAY 2');
    // The one RPE in the fixture.
    expect(rows[8]!.rpe).toBe(8);
  });

  it('accepts the other layouts Strong has shipped, and refuses an unknown column', () => {
    const newer = FIXTURE.replace('Duration', 'Workout Duration');
    expect(parseStrongCsv(newer)[0]!.duration).toBe('1h 36m');
    const older = FIXTURE.replace(/^(.*)$/m, '$1,Notes,Workout Notes').replace(/\n(20[^\n]*)/g, '\n$1,,');
    expect(parseStrongCsv(older)).toHaveLength(16);
    expect(() => parseStrongCsv(FIXTURE.replace('RPE', 'Effort'))).toThrow(StrongParseError);
    expect(() => parseStrongCsv(FIXTURE.replace('Set Order,', ''))).toThrow(/Missing column/);
    expect(() => parseStrongCsv('')).toThrow(/empty/);
  });

  it('handles CRLF, a BOM and quoted commas', () => {
    const crlf = '\uFEFF' + FIXTURE.replace(/\n/g, '\r\n').replace('"Evening Workout"', '"Evening, Workout"');
    const rows = parseStrongCsv(crlf);
    expect(rows).toHaveLength(16);
    expect(rows[0]!.workout_name).toBe('Evening, Workout');
  });

  it('helpers', () => {
    expect(parseDurationSeconds('1h 36m')).toBe(5760);
    expect(parseDurationSeconds('58m')).toBe(3480);
    expect(parseDurationSeconds('2h')).toBe(7200);
    expect(parseDurationSeconds('soon')).toBeNull();
    expect(parseDurationSeconds(null)).toBeNull();
    expect(rirFromRpe(8)).toBe(2);
    expect(rirFromRpe(10)).toBe(0);
    expect(rirFromRpe(6.5)).toBe(4);
    expect(stableId('a', 1)).toBe(stableId('a', 1));
    expect(stableId('a', 1)).not.toBe(stableId('a', 2));
    expect(stableId('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('planImport against the fixture', () => {
  it('reproduces every edge case in docs/STRONG-IMPORT.md', () => {
    const db = freshDb();
    const p = plan(db);
    // 16 rows: 1 cardio row, 1 exact duplicate collapsed, so 14 sets across 4 strength sessions.
    expect(p.counts).toEqual({ rows: 16, sessions: 4, sets: 14, warmups: 2, effort_values: 1, cardio: 1 });
    expect(p.duplicates_collapsed).toBe(1);
    expect(p.skipped).toEqual([]);

    // Point 5: reps 0 with distance and seconds goes to cardio, never to set_logs. Distance is metres.
    expect(p.cardio).toHaveLength(1);
    expect(p.cardio[0]).toMatchObject({ date: '2026-09-01', type: 'row', duration_minutes: 8, distance_km: 2, strong_name: 'Rowing (Machine)' });

    // Sessions key on the timestamp. 1 September holds a morning row and an evening curl session, and
    // the row is cardio, so one strength session lands on that date with the timestamp preserved.
    expect(p.sessions.map((s) => s.date)).toEqual(['2017-07-14', '2019-11-30', '2026-08-31', '2026-09-01']);
    expect(p.sessions[3]!.started_at).toBe('2026-09-01T19:31:08.000Z');
    // Two sessions on one day would get two ids.
    expect(stableId('workout', '2026-09-01 07:02:44')).not.toBe(stableId('workout', '2026-09-01 19:31:08'));
  });
});

describe('sessions, sets, mapping and the unmapped', () => {
  it('maps the seen names, creates archived entries for the rest, and marks bodyweight', () => {
    const db = freshDb();
    const p = plan(db);
    const used = Object.fromEntries(p.mappings_used.map((m) => [m.strong_name, m.omega_name]));
    expect(used).toEqual({
      'Bench Press (Barbell)': 'Flat Barbell Bench Press',
      'Chin Up': 'Weighted Chin-Up',
      'Squat (Barbell)': 'Barbell Back Squat',
      'Ab Wheel': 'Ab Wheel Rollout',
      'Preacher Curl (Machine)': 'Preacher Curl',
    });
    expect(p.new_exercises).toEqual([]);
    // An unmapped name becomes an archived exercise with the Strong name and no credits, and says so.
    const p2 = planImport(parseStrongCsv(FIXTURE.replace(/Chin Up/g, 'Pull Up (Assisted)')), { exercises: repo.listAllExercises(db), now: NOW });
    expect(p2.new_exercises).toHaveLength(1);
    const ne = p2.new_exercises[0]!;
    expect(ne.strong_name).toBe('Pull Up (Assisted)');
    expect(ne.exercise).toMatchObject({ name: 'Pull Up (Assisted)', archived: true, equipment: 'bodyweight', movement_pattern: 'other' });
    expect(ne.exercise.cues).toMatch(/no muscle credits/);
    // Point 4: every working weight 0 on the 2017 row, but 5 kg on the 2026 one, so not bodyweight-only overall.
    expect(ne.set_count).toBe(2);
    // --map overrides the table.
    const p3 = plan(db, { 'Ab Wheel': 'Cable Crunch' });
    expect(p3.mappings_used.find((m) => m.strong_name === 'Ab Wheel')!.omega_name).toBe('Cable Crunch');
    // A mapping to a name not in the library skips the rows with a reason rather than inventing an exercise.
    const p4 = plan(db, { 'Ab Wheel': 'Nope' });
    expect(p4.skipped.some((s) => /not in the library/.test(s.reason))).toBe(true);
  });

  it('sets: warmups flagged, drop and failure sets are ordinary, weights kept as written, effort from RPE', () => {
    const db = freshDb();
    const p = plan(db);
    const aug31 = p.sessions.find((s) => s.date === '2026-08-31')!;
    const bench = aug31.exercises.find((e) => e.strong_name === 'Bench Press (Barbell)')!;
    expect(bench.sets.map((s) => [s.strong_set_order, s.set_index, s.is_warmup, s.weight_kg, s.reps, s.rir, s.rir_observed])).toEqual([
      ['1', 1, false, 52.5, 10, 2, true],     // RPE 8 becomes RIR 2, observed
      ['D', 2, false, 40, 12, null, false],   // drop set, ordinary working set, no effort
      ['F', 3, false, 40, 6, null, false],    // failure set likewise
    ]);
    const squat = aug31.exercises.find((e) => e.strong_name === 'Squat (Barbell)')!;
    expect(squat.sets.map((s) => [s.is_warmup, s.weight_kg])).toEqual([[true, 20], [false, 25], [false, 25]]);
    // Point 3: the converted-from-pounds era is kept as the kilograms it already is, not rounded.
    const jul17 = p.sessions.find((s) => s.date === '2017-07-14')!;
    expect(jul17.exercises[0]!.sets.map((s) => s.weight_kg)).toEqual([61.23, 43.09]);
    // Duration parsed into completed_at.
    expect(jul17.started_at).toBe('2017-07-14T02:37:37.000Z');
    expect(jul17.completed_at).toBe('2017-07-14T04:13:37.000Z');
    // The duplicate preacher curl row collapsed to one set.
    const sep1 = p.sessions.find((s) => s.date === '2026-09-01')!;
    expect(sep1.exercises[0]!.sets).toHaveLength(1);
  });
});

describe('applyImport', () => {
  it('writes sessions, sets, cardio and is idempotent on a re-run', () => {
    const db = freshDb();
    const p = plan(db);
    const r1 = applyImport(db, p, NOW);
    expect(r1).toMatchObject({ sessions_written: 4, sets_written: 14, cardio_written: 1, exercises_created: 0, sessions_already_present: 0 });
    expect(r1.progression_refreshed).toBe(5);
    const r2 = applyImport(db, plan(db), NOW);
    expect(r2).toMatchObject({ sessions_written: 0, sets_written: 0, cardio_written: 0, sessions_already_present: 4 });
    expect(db.get<{ c: number }>('SELECT count(*) AS c FROM set_logs')?.c).toBe(14);
    expect(db.get<{ c: number }>('SELECT count(*) AS c FROM cardio_sessions')?.c).toBe(1);
    // Imported workouts are loose history: no template, no block, completed, dated by the Strong timestamp.
    const w = repo.listWorkoutsBetween(db, '2026-08-31', '2026-08-31')[0]!;
    expect(w).toMatchObject({ template_id: null, mesocycle_id: null, week_number: null, date: '2026-08-31', is_compromised: false });
    expect(w.completed_at).toBe('2026-08-31T11:34:02.000Z');
    expect(w.notes).toContain('Quads / Pull : DAY 1');
  });

  async function day1After(db: Db): Promise<(name: string) => WorkoutDetail['exercises'][number]['workout_exercise']> {
    const app = createApp({ db, tokens: { write: WRITE, read: null }, now: NOW, version: 'test' });
    const res = await app.request('/api/v1/workouts', { method: 'POST', headers: { Authorization: `Bearer ${WRITE}`, 'content-type': 'application/json' }, body: JSON.stringify({ template_id: SEED_TEMPLATES[0]!.id, date: '2026-09-12' }) });
    expect(res.status).toBe(201);
    const detail = (await res.json()) as WorkoutDetail;
    return (name: string) => detail.exercises.find((e) => e.exercise.name === name)!.workout_exercise;
  }

  it('issue 12: with the seeded restart loads gone, the bench reads the imported session and names its date', async () => {
    // The real file's three RPE rows sit in 2022 and 2023, so David's last bench has no effort value and
    // is non-qualifying. Blank the fixture's RPE to reproduce that.
    const noEffort = parseStrongCsv(FIXTURE.replace(/,8\n/, ',\n'));
    const db = freshDb();
    applyImport(db, planImport(noEffort, { exercises: repo.listAllExercises(db), now: NOW }), NOW);
    const by = await day1After(db);
    const bench = by(EX.BENCH);
    expect(bench.reason).toBe('first_time');
    expect(bench.rationale).toContain('2026-08-31');
    expect(bench.rationale).not.toContain('stored starting load');
    // Non-qualifying because no effort was recorded, and the rationale says so plainly.
    expect(bench.rationale).toContain('no_rir');
    // Stage C1 repeats the session's modal weight. On 31 August that is 40 kg, not 52.5, because the
    // drop set and the failure set were both at 40 and the spec imports them as ordinary working sets.
    // That is the engine doing what the rulebook says with the data the spec says to give it, and it
    // is on the record for chalk rather than hidden by a friendlier fixture.
    expect(bench.suggested_weight_kg).toBe(40);
    // Point 2 in practice: nine years of history cannot progress load. The squat repeats 25.
    expect(by(EX.BACK_SQUAT).suggested_weight_kg).toBe(25);
    // An exercise with no imported history still reads "set a starting load".
    const legExt = by(EX.LEG_EXTENSION);
    expect(legExt.reason).toBe('first_time');
    expect(legExt.suggested_weight_kg).toBeNull();
    expect(legExt.rationale).toContain('Set a starting load');
    // A constrained exercise gets no weight regardless of what was imported (A4).
    expect(by(EX.INCLINE_DB_CURL).suggested_weight_kg).toBeNull();
  });

  it('an RPE on the last session makes it qualify, and the engine then judges it', async () => {
    // The fixture as chalk wrote it carries RPE 8 on the 31 August bench top set. One observed effort
    // value is enough for a session to qualify, so the engine reads it rather than falling back to C1.
    const db = freshDb();
    applyImport(db, plan(db), NOW);
    const by = await day1After(db);
    const bench = by(EX.BENCH);
    expect(bench.reason).toBe('progress_reps');   // 10, 12, 6 against a default range of 8 to 10
    expect(bench.suggested_weight_kg).toBe(40);    // modal weight, skewed by the drop and failure sets
    expect(bench.based_on_workout_id).toBe(stableId('workout', '2026-08-31 10:14:02'));
  });

  it('a seeded starting load left in the cache by an older build no longer overrides real history', () => {
    const db = freshDb();
    repo.insertStartingLoadIfAbsent(db, seedExerciseId(EX.BENCH), 42, NOW().toISOString());
    applyImport(db, plan(db), NOW);
    // The cache is rebuilt from history alone. 42 is gone, and what stands is the session's modal weight.
    expect(repo.getState(db, seedExerciseId(EX.BENCH))?.working_weight_kg).toBe(40);
  });
});
