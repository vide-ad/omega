import type { CurrentMesocycle, SetLog } from '@omega/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import {
  EX, SEED_MESOCYCLE_ID, SEED_TEMPLATES, SEED_INJURY_ID, seedExerciseId,
  type ExerciseDetail, type MesocycleWithWeeks, type Paginated, type ExerciseWithCredits, type ProgressionDetail,
  type ReadinessResponse, type SummaryResponse, type TemplateWithExercises, type VolumeResponse, type WorkoutDetail, type WorkoutExerciseDetail,
} from '@omega/core';
import { createApp } from './app.js';
import { Db } from './db/connection.js';
import { DEFAULT_MIGRATIONS_DIR as MIGRATIONS_DIR, runMigrations } from './db/migrate.js';
import type { Env } from './routes/shared.js';
import { seedDatabase } from './seed.js';

const WRITE = 'test-write-token-0123456789';
const READ = 'test-read-token-0123456789';
const START = '2026-09-12'; // Saturday: seed mesocycle start / Day 1
const DAY1 = SEED_TEMPLATES[0]!.id;
const DAY2 = SEED_TEMPLATES[1]!.id;
const DAY3 = SEED_TEMPLATES[2]!.id;
const ex = (name: string) => seedExerciseId(name);

interface Res<T = unknown> { status: number; body: T; headers: Headers }

function makeApp(nowIso = '2026-09-13T12:00:00.000Z') {
  const db = new Db(new DatabaseSync(':memory:'));
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  const now = () => new Date(nowIso);
  seedDatabase(db, { start_date: START, now });
  const app = createApp({ db, tokens: { write: WRITE, read: READ }, now, version: 'test' });
  return { app, db };
}

async function call<T = unknown>(app: Hono<Env>, method: string, path: string, body?: unknown, token: string | null = WRITE): Promise<Res<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(`/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T, headers: res.headers };
}

const byName = (d: WorkoutDetail, name: string): WorkoutExerciseDetail => {
  const e = d.exercises.find((x) => x.exercise.name === name);
  if (!e) throw new Error(`exercise ${name} not in workout`);
  return e;
};

describe('health and auth', () => {
  const { app } = makeApp();
  it('GET /api/health is unauthenticated', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: 'test' });
  });
  it('401 without a token, with a bad token, and with a token in the query string', async () => {
    expect((await call(app, 'GET', '/templates', undefined, null)).status).toBe(401);
    expect((await call(app, 'GET', '/templates', undefined, 'nope')).status).toBe(401);
    const q = await app.request(`/api/v1/templates?token=${WRITE}&access_token=${WRITE}`);
    expect(q.status).toBe(401);
    const body = await q.json();
    expect(body.error.code).toBe('unauthorized');
  });
  it('read token: 200 on GET, 403 on mutations; write token: 200', async () => {
    expect((await call(app, 'GET', '/templates', undefined, READ)).status).toBe(200);
    const forbidden = await call<{ error: { code: string } }>(app, 'POST', '/workouts', { template_id: DAY1, date: START }, READ);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('forbidden');
    expect((await call(app, 'PUT', '/volume-targets/quads', { min_sets: 1, max_sets: 2, priority: 'priority' }, READ)).status).toBe(403);
    expect((await call(app, 'GET', '/templates', undefined, WRITE)).status).toBe(200);
  });
  it('CORS preflight is answered without auth', async () => {
    const res = await app.request('/api/v1/workouts', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' } });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
  });
  it('unknown ids are 404 not_found, bad bodies are 400 validation_error', async () => {
    const nf = await call<{ error: { code: string } }>(app, 'GET', '/workouts/does-not-exist');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('not_found');
    const bad = await call<{ error: { code: string; details: unknown[] } }>(app, 'POST', '/workouts', { template_id: DAY1, date: '2026-13-45' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_error');
    expect(Array.isArray(bad.body.error.details)).toBe(true);
    const malformed = await app.request('/api/v1/workouts', { method: 'POST', headers: { Authorization: `Bearer ${WRITE}`, 'content-type': 'application/json' }, body: '{not json' });
    expect(malformed.status).toBe(400);
    const route = await call<{ error: { code: string } }>(app, 'GET', '/nothing-here');
    expect(route.status).toBe(404);
  });
});

describe('seeded library', () => {
  const { app } = makeApp();
  it('GET /templates returns the three seed templates at version 1 with exercises', async () => {
    const res = await call<{ items: TemplateWithExercises[] }>(app, 'GET', '/templates');
    expect(res.status).toBe(200);
    expect(res.body.items.map((t) => [t.name, t.version, t.exercises.length])).toEqual([
      ['Day 1 — Quad + Pull', 1, 7], ['Day 2 — Push + Isolation', 1, 7], ['Day 3 — Full body top-up', 1, 8],
    ]);
    expect(res.body.items[0]!.exercises[0]!.exercise.name).toBe(EX.BACK_SQUAT);
  });
  it('GET /exercises filters and paginates with a cursor', async () => {
    const quads = await call<Paginated<ExerciseWithCredits>>(app, 'GET', '/exercises?muscle=quads');
    expect(quads.body.items.length).toBeGreaterThan(3);
    expect(quads.body.items.every((e) => e.credits.some((c) => c.muscle_group_key === 'quads'))).toBe(true);
    const p1 = await call<Paginated<ExerciseWithCredits>>(app, 'GET', '/exercises?limit=5');
    expect(p1.body.items).toHaveLength(5);
    expect(p1.body.next_cursor).toBeTypeOf('string');
    const p2 = await call<Paginated<ExerciseWithCredits>>(app, 'GET', `/exercises?limit=5&cursor=${encodeURIComponent(p1.body.next_cursor!)}`);
    expect(p2.body.items).toHaveLength(5);
    expect(new Set([...p1.body.items, ...p2.body.items].map((e) => e.id)).size).toBe(10);
    expect(p2.body.items[0]!.name >= p1.body.items[4]!.name).toBe(true);
    const bad = await call(app, 'GET', '/exercises?cursor=%%%');
    expect(bad.status).toBe(400);
  });
  it('GET /exercises/:id includes credits and active constraints', async () => {
    const curl = await call<ExerciseDetail>(app, 'GET', `/exercises/${ex(EX.INCLINE_DB_CURL)}`);
    expect(curl.status).toBe(200);
    expect(curl.body.uses_bodyweight).toBe(false);
    expect(curl.body.credits.map((c) => c.muscle_group_key)).toContain('biceps');
    expect(curl.body.active_constraints).toHaveLength(1);
    expect(curl.body.active_constraints[0]!.max_weight_kg).toBe(5);
  });
  it('POST /exercises creates once and is idempotent on id', async () => {
    const body = { id: 'aaaaaaaa-1111-4222-8333-444444444444', name: 'Cable Row (test)', equipment: 'cable', movement_pattern: 'horizontal_pull', default_rep_low: 10, default_rep_high: 12, default_rir_target: 2, default_rest_seconds: 90, weight_increment_kg: 2.5, credits: [{ muscle_group_key: 'upper_back', credit: 1, role: 'primary' }] };
    const a = await call<ExerciseWithCredits>(app, 'POST', '/exercises', body);
    expect(a.status).toBe(201);
    expect(a.body.credits).toHaveLength(1);
    const b = await call<ExerciseWithCredits>(app, 'POST', '/exercises', body);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    const patched = await call<ExerciseWithCredits>(app, 'PATCH', `/exercises/${a.body.id}`, { cues: 'squeeze', credits: [{ muscle_group_key: 'lats', credit: 1, role: 'primary' }, { muscle_group_key: 'biceps', credit: 0.5, role: 'secondary' }] });
    expect(patched.status).toBe(200);
    expect(patched.body.cues).toBe('squeeze');
    expect(patched.body.credits).toHaveLength(2);
  });
  it('GET /mesocycles/current reports week 1 of the seed block', async () => {
    const cur = await call<{ mesocycle: MesocycleWithWeeks; week_number: number; is_deload: boolean }>(app, 'GET', '/mesocycles/current');
    expect(cur.status).toBe(200);
    expect(cur.body.mesocycle.id).toBe(SEED_MESOCYCLE_ID);
    expect(cur.body.mesocycle.weeks).toHaveLength(6);
    expect(cur.body.week_number).toBe(1);
    expect(cur.body.is_deload).toBe(false);
  });
  it('GET /muscle-groups, /volume-targets and PUT /volume-targets/:key', async () => {
    expect((await call<{ items: unknown[] }>(app, 'GET', '/muscle-groups')).body.items).toHaveLength(19);
    expect((await call<{ items: unknown[] }>(app, 'GET', '/volume-targets')).body.items).toHaveLength(15);
    const put = await call<{ min_sets: number; active: boolean }>(app, 'PUT', '/volume-targets/forearms', { min_sets: 2, max_sets: 6, priority: 'maintenance' });
    expect(put.status).toBe(200);
    expect(put.body.min_sets).toBe(2);
    expect((await call(app, 'PUT', '/volume-targets/nope', { min_sets: 2, max_sets: 6, priority: 'maintenance' })).status).toBe(404);
  });
});

describe('Day 1 → sets → completion → volume → week 2', () => {
  const { app } = makeApp();
  const workoutId = 'bbbbbbbb-1111-4222-8333-000000000001';
  let day1: WorkoutDetail;

  beforeAll(async () => {
    const res = await call<WorkoutDetail>(app, 'POST', '/workouts', { id: workoutId, template_id: DAY1, date: START });
    expect(res.status).toBe(201);
    day1 = res.body;
  });

  it('instantiates 7 exercises with the expected first prescriptions', () => {
    expect(day1.exercises).toHaveLength(7);
    expect(day1.omitted).toEqual([]);
    expect(day1.workout.week_number).toBe(1);
    expect(day1.workout.mesocycle_id).toBe(SEED_MESOCYCLE_ID);
    expect(day1.template_name).toBe('Day 1 — Quad + Pull');

    const squat = byName(day1, EX.BACK_SQUAT);
    expect(day1.exercises[0]!.exercise.name).toBe(EX.BACK_SQUAT);
    expect(squat.workout_exercise.reason).toBe('first_time');
    expect(squat.workout_exercise.suggested_weight_kg).toBeNull();
    expect(squat.workout_exercise.target_rir).toBe(3); // week 1 RIR target clamps the template's 2 up to 3
    expect(squat.prescription?.reason).toBe('first_time');
    expect(squat.previous).toBeNull();

    const bench = byName(day1, EX.BENCH);
    expect(bench.workout_exercise.reason).toBe('first_time');
    expect(bench.workout_exercise.suggested_weight_kg).toBe(42.5);

    const chin = byName(day1, EX.WEIGHTED_CHIN_UP);
    expect(chin.workout_exercise.reason).toBe('requires_clearance');
    expect(chin.workout_exercise.suggested_weight_kg).toBeNull();
    expect(chin.workout_exercise.constraint_notes).toHaveLength(1);

    // Amendment A4: a constraint stops the engine, so the curl gets no weight. It stays in the
    // session and shows the physio's rep floor, tempo and note as information. David sets the weight.
    const curl = byName(day1, EX.INCLINE_DB_CURL);
    expect(curl.workout_exercise.reason).toBe('constrained');
    expect(curl.workout_exercise.flags).toContain('constrained');
    expect(curl.workout_exercise.suggested_weight_kg).toBeNull();
    expect(curl.workout_exercise.target_rep_low).toBe(15);
    expect(curl.workout_exercise.target_tempo).toBe('3-0-3-0');
    expect(curl.workout_exercise.constraint_notes).toHaveLength(1);
    expect(curl.workout_exercise.rationale).toContain('no more than 5 kg');
  });

  it('week 1 target_sets equal the template base_sets', async () => {
    const tpl = await call<TemplateWithExercises>(app, 'GET', `/templates/${DAY1}`);
    for (const te of tpl.body.exercises) {
      const we = day1.exercises.find((x) => x.exercise.id === te.exercise_id)!.workout_exercise;
      expect(we.target_sets).toBe(te.base_sets);
      expect(we.rest_seconds).toBe(te.rest_seconds);
    }
  });

  it('re-POSTing the same workout id returns 200 and no duplicate', async () => {
    const again = await call<WorkoutDetail>(app, 'POST', '/workouts', { id: workoutId, template_id: DAY1, date: START });
    expect(again.status).toBe(200);
    expect(again.body.workout.id).toBe(workoutId);
    const list = await call<Paginated<unknown>>(app, 'GET', '/workouts');
    expect(list.body.items).toHaveLength(1);
  });

  it('logs sets idempotently, forces RIR 0 on AMRAP and validates side', async () => {
    const bench = byName(day1, EX.BENCH).workout_exercise.id;
    const setIds = ['cccccccc-1111-4222-8333-000000000001', 'cccccccc-1111-4222-8333-000000000002', 'cccccccc-1111-4222-8333-000000000003'];
    for (const [i, id] of setIds.entries()) {
      const res = await call<{ id: string }>(app, 'POST', `/workouts/${workoutId}/sets`, { id, workout_exercise_id: bench, set_index: i + 1, weight_kg: 42.5, reps: 10, rir: 3 });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(id);
    }
    const replay = await call<{ id: string }>(app, 'POST', `/workouts/${workoutId}/sets`, { id: setIds[0], workout_exercise_id: bench, set_index: 1, weight_kg: 42.5, reps: 10, rir: 3 });
    expect(replay.status).toBe(200);
    const detail = await call<WorkoutDetail>(app, 'GET', `/workouts/${workoutId}`);
    expect(byName(detail.body, EX.BENCH).sets).toHaveLength(3);

    const wheel = byName(day1, EX.AB_WHEEL).workout_exercise.id;
    const amrap = await call<{ rir: number }>(app, 'POST', `/workouts/${workoutId}/sets`, { workout_exercise_id: wheel, set_index: 1, weight_kg: 0, reps: 12, rir: 3, is_amrap: true });
    expect(amrap.status).toBe(201);
    expect(amrap.body.rir).toBe(0);

    const badSide = await call<{ error: { code: string } }>(app, 'POST', `/workouts/${workoutId}/sets`, { workout_exercise_id: bench, set_index: 4, side: 'left', weight_kg: 42.5, reps: 10, rir: 3 });
    expect(badSide.status).toBe(400);
    expect(badSide.body.error.code).toBe('validation_error');
    const wrongWorkout = await call(app, 'POST', '/workouts/does-not-exist/sets', { workout_exercise_id: bench, set_index: 4, weight_kg: 42.5, reps: 10, rir: 3 });
    expect(wrongWorkout.status).toBe(404);

    const sets = await call<{ items: Array<{ set_count: number; sets?: unknown[] }> }>(app, 'GET', '/workouts?include_sets=true');
    expect(sets.body.items[0]!.set_count).toBe(4);
    expect(sets.body.items[0]!.sets).toHaveLength(4);
  });

  it('PATCH /sets and DELETE /sets', async () => {
    const wheelSets = byName((await call<WorkoutDetail>(app, 'GET', `/workouts/${workoutId}`)).body, EX.AB_WHEEL).sets;
    const patched = await call<{ reps: number; pain_severity: string }>(app, 'PATCH', `/sets/${wheelSets[0]!.id}`, { reps: 14, pain_severity: 'niggle' });
    expect(patched.status).toBe(200);
    expect(patched.body.reps).toBe(14);
    expect((await call(app, 'DELETE', `/sets/${wheelSets[0]!.id}`)).status).toBe(204);
    expect((await call(app, 'DELETE', `/sets/${wheelSets[0]!.id}`)).status).toBe(404);
  });

  it('completing the workout leaves it uncompromised', async () => {
    const res = await call<WorkoutDetail>(app, 'PATCH', `/workouts/${workoutId}`, { completed_at: '2026-09-12T11:30:00.000Z', session_rpe: 7 });
    expect(res.status).toBe(200);
    expect(res.body.workout.completed_at).toBe('2026-09-12T11:30:00.000Z');
    expect(res.body.workout.session_rpe).toBe(7);
    expect(res.body.workout.is_compromised).toBe(false);
    expect(res.body.exercises.every((e) => e.workout_exercise.is_compromised === false)).toBe(true);
  });

  it('GET /volume tallies the bench sets into chest_mid 3 / triceps 1.5 / delts_front 1.5', async () => {
    const res = await call<VolumeResponse>(app, 'GET', '/volume?weeks=4');
    expect(res.status).toBe(200);
    expect(res.body.targets).toHaveLength(15);
    const week = res.body.weeks.find((w) => w.key === `meso:${SEED_MESOCYCLE_ID}:1`);
    expect(week).toBeDefined();
    expect(week!.start).toBe(START);
    expect(week!.mesocycle_week).toBe(1);
    const m = Object.fromEntries(week!.muscles.map((x) => [x.muscle_group_key, x]));
    expect(m.chest_mid!.sets).toBe(3);
    expect(m.chest_mid!.status).toBe('under');
    expect(m.triceps!.sets).toBe(1.5);
    expect(m.delts_front!.sets).toBe(1.5);
    expect(m.delts_front!.status).toBe('no_target');
    expect(res.body.weeks[res.body.weeks.length - 1]!.key).toBe(week!.key); // current week is present and last
    expect(res.body.weeks.length).toBeGreaterThanOrEqual(4);
  });

  it('GET /readiness reports recently trained muscles and rolling medians', async () => {
    const res = await call<ReadinessResponse>(app, 'GET', '/readiness');
    expect(res.status).toBe(200);
    expect(res.body.recently_trained).toEqual(expect.arrayContaining(['chest_mid', 'triceps', 'delts_front']));
    expect(res.body.recently_trained).not.toContain('quads');
    expect(res.body.rolling).toEqual({ rhr_median_30d: null, bodyweight_median_30d: null });
  });

  it('GET /progression shows bench progressing to 45', async () => {
    const detail = await call<ProgressionDetail>(app, 'GET', `/progression/${ex(EX.BENCH)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.next.reason).toBe('progress_load');
    expect(detail.body.next.suggested_weight_kg).toBe(45);
    expect(detail.body.state?.working_weight_kg).toBe(45);
    expect(detail.body.last_qualifying_date).toBe(START);
    expect(detail.body.history).toHaveLength(1);
    expect(detail.body.history[0]).toMatchObject({ workout_id: workoutId, qualifying: true, weight_kg: 42.5, reps: [10, 10, 10], mean_rir: 3 });
    expect(detail.body.history[0]!.prescription?.reason).toBe('first_time');
    const list = await call<{ items: Array<{ exercise: { id: string } }> }>(app, 'GET', '/progression');
    expect(list.body.items.map((i) => i.exercise.id)).toContain(ex(EX.BENCH));
    expect(list.body.items.map((i) => i.exercise.id)).toContain(ex(EX.MACHINE_CURL)); // state row only
  });

  it('a second Day 1 a week later is week 2: bench progress_load 45, squat 5 sets', async () => {
    const res = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY1, date: '2026-09-19' });
    expect(res.status).toBe(201);
    expect(res.body.workout.week_number).toBe(2);
    const bench = byName(res.body, EX.BENCH);
    expect(bench.workout_exercise.reason).toBe('progress_load');
    expect(bench.workout_exercise.suggested_weight_kg).toBe(45);
    expect(bench.workout_exercise.based_on_workout_id).toBe(workoutId);
    expect(bench.workout_exercise.target_rir).toBe(3);
    expect(bench.previous?.workout_id).toBe(workoutId);
    expect(bench.previous?.sets).toHaveLength(3);
    const squat = byName(res.body, EX.BACK_SQUAT);
    expect(squat.workout_exercise.target_sets).toBe(5);
    expect(squat.workout_exercise.reason).toBe('first_time');
    // No sets were ever logged for the squat, so completing week 1 cached a working weight of 0.
    // That must not be fed back as a starting load: the user still has to enter one.
    expect(squat.workout_exercise.suggested_weight_kg).toBeNull();
    expect(byName(res.body, EX.CABLE_LATERAL_RAISE).workout_exercise.target_sets).toBe(5);
    expect(byName(res.body, EX.BENCH).workout_exercise.target_sets).toBe(3); // not priority
  });

  it('GET /workouts lists newest first with cursors', async () => {
    const p1 = await call<Paginated<{ date: string }>>(app, 'GET', '/workouts?limit=1');
    expect(p1.body.items[0]!.date).toBe('2026-09-19');
    expect(p1.body.next_cursor).toBeTypeOf('string');
    const p2 = await call<Paginated<{ date: string }>>(app, 'GET', `/workouts?limit=1&cursor=${encodeURIComponent(p1.body.next_cursor!)}`);
    expect(p2.body.items[0]!.date).toBe(START);
    expect(p2.body.next_cursor).toBeNull();
    const filtered = await call<Paginated<{ date: string }>>(app, 'GET', `/workouts?exercise_id=${ex(EX.BENCH)}&from=2026-09-13`);
    expect(filtered.body.items).toHaveLength(1);
  });

  it('GET /summary returns the composite the coach reads first', async () => {
    const res = await call<SummaryResponse>(app, 'GET', '/summary?weeks=4');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['adherence', 'cardio', 'generated_at', 'injuries', 'mesocycle', 'pain_flags', 'progression', 'readiness', 'volume', 'window_weeks'].sort());
    expect(res.body.window_weeks).toBe(4);
    expect(res.body.mesocycle?.week_number).toBe(1);
    expect(res.body.adherence.completed_sessions).toBe(1);
    expect(res.body.adherence.by_week.find((w) => w.week === `meso:${SEED_MESOCYCLE_ID}:1`)?.planned).toBe(3);
    expect(res.body.injuries).toHaveLength(1);
    expect(res.body.injuries[0]!.constraints).toHaveLength(2);
    const bench = res.body.progression.find((p) => p.exercise_id === ex(EX.BENCH));
    expect(bench?.next_reason).toBe('progress_load');
    expect(bench?.working_weight_kg).toBe(45);
    expect(res.body.readiness.compromised_sessions).toBe(0);
  });

  it('DELETE /workouts cascades sets', async () => {
    const list = await call<Paginated<{ id: string; date: string }>>(app, 'GET', '/workouts');
    const week2 = list.body.items.find((w) => w.date === '2026-09-19')!;
    expect((await call(app, 'DELETE', `/workouts/${week2.id}`)).status).toBe(204);
    expect((await call(app, 'GET', `/workouts/${week2.id}`)).status).toBe(404);
    expect((await call<Paginated<unknown>>(app, 'GET', '/workouts')).body.items).toHaveLength(1);
  });
});

describe('readiness and compromised sessions', () => {
  const { app } = makeApp();

  it('sleep 4h logged before the session compromises the completed workout', async () => {
    const r = await call<{ id: string; date: string; soreness: unknown[] }>(app, 'POST', '/readiness', { date: '2026-09-13', sleep_hours: 4, resting_hr: 60 });
    expect(r.status).toBe(201);
    expect(r.body.soreness).toEqual([]);
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY2, date: '2026-09-13' });
    expect(w.status).toBe(201);
    expect(w.body.workout.readiness_id).toBe(r.body.id);
    expect(w.body.workout.is_compromised).toBe(false); // computed at completion
    const done = await call<WorkoutDetail>(app, 'PATCH', `/workouts/${w.body.workout.id}`, { completed_at: '2026-09-13T11:00:00.000Z' });
    expect(done.body.workout.is_compromised).toBe(true);
  });

  it('readiness logged after completion relinks and recomputes; re-POST is an upsert by date', async () => {
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY3, date: '2026-09-16' });
    expect(w.body.workout.readiness_id).toBeNull();
    const done = await call<WorkoutDetail>(app, 'PATCH', `/workouts/${w.body.workout.id}`, { completed_at: '2026-09-16T11:00:00.000Z' });
    expect(done.body.workout.is_compromised).toBe(false);
    const r1 = await call<{ id: string }>(app, 'POST', '/readiness', { date: '2026-09-16', manual_compromised: true });
    expect(r1.status).toBe(201);
    const after = await call<WorkoutDetail>(app, 'GET', `/workouts/${w.body.workout.id}`);
    expect(after.body.workout.readiness_id).toBe(r1.body.id);
    expect(after.body.workout.is_compromised).toBe(true);
    const r2 = await call<{ id: string; manual_compromised: boolean; soreness: Array<{ muscle_group_key: string }> }>(app, 'POST', '/readiness', { date: '2026-09-16', manual_compromised: false, soreness: [{ muscle_group_key: 'quads', rating: 5 }] });
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(r1.body.id);
    expect(r2.body.soreness).toEqual([{ muscle_group_key: 'quads', rating: 5 }]);
    const again = await call<WorkoutDetail>(app, 'GET', `/workouts/${w.body.workout.id}`);
    expect(again.body.workout.is_compromised).toBe(false);
    // Soreness ≥ 4 on quads compromises the quad exercises only (exercise level).
    expect(byName(again.body, EX.HACK_SQUAT).workout_exercise.is_compromised).toBe(true);
    expect(byName(again.body, EX.LEG_EXTENSION).workout_exercise.is_compromised).toBe(true);
    expect(byName(again.body, EX.RDL).workout_exercise.is_compromised).toBe(false);
    const list = await call<ReadinessResponse>(app, 'GET', '/readiness?from=2026-09-01&to=2026-09-30');
    expect(list.body.items.map((i) => i.date)).toEqual(['2026-09-16', '2026-09-13']);
  });

  it('pain moderate on a set compromises that exercise', async () => {
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY2, date: '2026-09-20' });
    const press = byName(w.body, EX.INCLINE_DB_PRESS).workout_exercise.id;
    await call(app, 'POST', `/workouts/${w.body.workout.id}/sets`, { workout_exercise_id: press, set_index: 1, weight_kg: 20, reps: 10, rir: 2, pain_severity: 'moderate', pain_note: 'elbow' });
    const done = await call<WorkoutDetail>(app, 'PATCH', `/workouts/${w.body.workout.id}`, { completed_at: '2026-09-20T11:00:00.000Z' });
    expect(byName(done.body, EX.INCLINE_DB_PRESS).workout_exercise.is_compromised).toBe(true);
    expect(byName(done.body, EX.LEG_PRESS).workout_exercise.is_compromised).toBe(false);
    const summary = await call<SummaryResponse>(makeApp('2026-09-21T12:00:00.000Z').app, 'GET', '/summary');
    expect(summary.status).toBe(200);
  });
});

describe('templates are versioned', () => {
  const { app } = makeApp();
  it('PATCH with exercises creates version 2 and keeps version 1 rows; metadata-only does not bump', async () => {
    const v1 = await call<TemplateWithExercises>(app, 'GET', `/templates/${DAY1}`);
    const meta = await call<TemplateWithExercises>(app, 'PATCH', `/templates/${DAY1}`, { day_label: 'Sat' });
    expect(meta.status).toBe(200);
    expect(meta.body.version).toBe(1);
    expect(meta.body.day_label).toBe('Sat');
    const v2 = await call<TemplateWithExercises>(app, 'PATCH', `/templates/${DAY1}`, {
      exercises: [
        { exercise_id: ex(EX.BACK_SQUAT), base_sets: 4, rep_low: 6, rep_high: 8, rir_target: 2, rest_seconds: 180, is_priority: true },
        { exercise_id: ex(EX.BENCH), base_sets: 4 },
      ],
    });
    expect(v2.status).toBe(200);
    expect(v2.body.version).toBe(2);
    expect(v2.body.exercises).toHaveLength(2);
    expect(v2.body.exercises[1]!.rep_low).toBe(8); // defaulted from the exercise
    expect(v2.body.exercises.every((e) => e.template_version === 2)).toBe(true);
    const old = await call<TemplateWithExercises>(app, 'GET', `/templates/${DAY1}?version=1`);
    expect(old.body.version).toBe(1);
    expect(old.body.exercises).toHaveLength(7);
    expect(old.body.exercises.map((e) => e.id).sort()).toEqual(v1.body.exercises.map((e) => e.id).sort());
    const latest = await call<{ items: TemplateWithExercises[] }>(app, 'GET', '/templates');
    expect(latest.body.items.find((t) => t.id === DAY1)?.version).toBe(2);
    expect((await call(app, 'GET', `/templates/${DAY1}?version=9`)).status).toBe(404);
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY1, date: START });
    expect(w.body.workout.template_version).toBe(2);
    expect(w.body.exercises).toHaveLength(2);
  });
  it('POST /templates creates version 1 and is idempotent', async () => {
    const body = { id: 'dddddddd-1111-4222-8333-000000000001', name: 'Arms', exercises: [{ exercise_id: ex(EX.OVERHEAD_CABLE_TRICEPS), base_sets: 3 }] };
    const a = await call<TemplateWithExercises>(app, 'POST', '/templates', body);
    expect(a.status).toBe(201);
    expect(a.body.version).toBe(1);
    expect((await call(app, 'POST', '/templates', body)).status).toBe(200);
  });
});

describe('ad-hoc exercises, unilateral sides, blocked constraints', () => {
  const { app } = makeApp();
  it('adds a unilateral exercise and enforces left/right', async () => {
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY3, date: '2026-09-16' });
    const add = await call<WorkoutExerciseDetail>(app, 'POST', `/workouts/${w.body.workout.id}/exercises`, { exercise_id: ex(EX.BULGARIAN_SPLIT_SQUAT), target_sets: 2 });
    expect(add.status).toBe(201);
    expect(add.body.prescription?.reason).toBe('first_time');
    expect(add.body.workout_exercise.target_sets).toBe(2);
    expect(add.body.workout_exercise.order).toBe(9);
    const bad = await call(app, 'POST', `/workouts/${w.body.workout.id}/sets`, { workout_exercise_id: add.body.workout_exercise.id, set_index: 1, weight_kg: 10, reps: 10, rir: 2 });
    expect(bad.status).toBe(400);
    const left = await call(app, 'POST', `/workouts/${w.body.workout.id}/sets`, { workout_exercise_id: add.body.workout_exercise.id, set_index: 1, side: 'left', weight_kg: 10, reps: 10, rir: 2 });
    expect(left.status).toBe(201);
    const detail = await call<WorkoutDetail>(app, 'GET', `/workouts/${w.body.workout.id}`);
    expect(detail.body.exercises).toHaveLength(9);
  });
  it('a blocked constraint omits the exercise from new sessions', async () => {
    const c = await call<{ id: string }>(app, 'POST', `/injuries/${SEED_INJURY_ID}/constraints`, { exercise_id: ex(EX.HACK_SQUAT), blocked: true, note: 'knee flare' });
    expect(c.status).toBe(201);
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY3, date: '2026-09-23' });
    expect(w.body.exercises.map((e) => e.exercise.name)).not.toContain(EX.HACK_SQUAT);
    expect(w.body.omitted).toHaveLength(1);
    expect(w.body.omitted[0]!.exercise.name).toBe(EX.HACK_SQUAT);
    expect(w.body.omitted[0]!.prescription.reason).toBe('blocked');
    const adHoc = await call<{ error: { code: string } }>(app, 'POST', `/workouts/${w.body.workout.id}/exercises`, { exercise_id: ex(EX.HACK_SQUAT) });
    expect(adHoc.status).toBe(409);
    expect((await call(app, 'DELETE', `/constraints/${c.body.id}`)).status).toBe(204);
    const injuries = await call<{ items: Array<{ constraints: unknown[] }> }>(app, 'GET', '/injuries?status=active');
    expect(injuries.body.items[0]!.constraints).toHaveLength(2);
  });
  it('clearing the chin-up constraint moves it off the clearance hold, but it is still constrained', async () => {
    const injuries = await call<{ items: Array<{ constraints: Array<{ id: string; requires_clearance: boolean }> }> }>(app, 'GET', '/injuries');
    const chin = injuries.body.items[0]!.constraints.find((c) => c.requires_clearance)!;
    const patched = await call<{ cleared_at: string | null }>(app, 'PATCH', `/constraints/${chin.id}`, { cleared_at: '2026-09-24T00:00:00.000Z' });
    expect(patched.body.cleared_at).toBe('2026-09-24T00:00:00.000Z');
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY1, date: '2026-09-26' });
    // Clearing is not removing. The constraint is still active, so under A4 the engine still declines
    // to pick a weight rather than falling through to first_time as it did before.
    const chinUp = byName(w.body, EX.WEIGHTED_CHIN_UP).workout_exercise;
    expect(chinUp.reason).toBe('constrained');
    expect(chinUp.suggested_weight_kg).toBeNull();
  });
});

describe('DELETE /workouts/:id/exercises/:weid', () => {
  const { app } = makeApp();

  it('removes the exercise, cascades its sets, and is a 404 the second time', async () => {
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY1, date: '2026-09-12' });
    const workoutId = w.body.workout.id;
    const before = w.body.exercises.length;
    const target = byName(w.body, EX.LEG_EXTENSION).workout_exercise;

    const s1 = await call<SetLog>(app, 'POST', `/workouts/${workoutId}/sets`, { workout_exercise_id: target.id, set_index: 1, weight_kg: 40, reps: 12, rir: 2 });
    const s2 = await call<SetLog>(app, 'POST', `/workouts/${workoutId}/sets`, { workout_exercise_id: target.id, set_index: 2, weight_kg: 40, reps: 12, rir: 2 });
    expect(s1.status).toBe(201);
    expect(s2.status).toBe(201);

    const del = await call(app, 'DELETE', `/workouts/${workoutId}/exercises/${target.id}`);
    expect(del.status).toBe(204);

    const after = await call<WorkoutDetail>(app, 'GET', `/workouts/${workoutId}`);
    expect(after.body.exercises).toHaveLength(before - 1);
    expect(after.body.exercises.map((e) => e.exercise.name)).not.toContain(EX.LEG_EXTENSION);
    // The sets went with it rather than being orphaned.
    expect(after.body.exercises.flatMap((e) => e.sets).map((x) => x.id)).not.toContain(s1.body.id);
    expect((await call(app, 'GET', `/workouts/${workoutId}?include_sets=true`)).status).toBe(200);

    // Idempotent in the sense the brief asks for: a repeat is a clean 404, not an odd error.
    const again = await call<{ error: { code: string } }>(app, 'DELETE', `/workouts/${workoutId}/exercises/${target.id}`);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('not_found');
  });

  it('404s for an unknown workout, an unknown exercise, and one belonging to another workout', async () => {
    const a = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY1, date: '2026-09-19' });
    const b = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY2, date: '2026-09-20' });
    const inA = a.body.exercises[0]!.workout_exercise.id;

    expect((await call(app, 'DELETE', `/workouts/${a.body.workout.id}/exercises/does-not-exist`)).status).toBe(404);
    expect((await call(app, 'DELETE', '/workouts/does-not-exist/exercises/' + inA)).status).toBe(404);
    // An exercise id from workout A must not be deletable through workout B.
    expect((await call(app, 'DELETE', `/workouts/${b.body.workout.id}/exercises/${inA}`)).status).toBe(404);
    expect((await call<WorkoutDetail>(app, 'GET', `/workouts/${a.body.workout.id}`)).body.exercises.map((e) => e.workout_exercise.id)).toContain(inA);
  });

  it('needs write scope', async () => {
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY2, date: '2026-09-21' });
    const weid = w.body.exercises[0]!.workout_exercise.id;
    const res = await call(app, 'DELETE', `/workouts/${w.body.workout.id}/exercises/${weid}`, undefined, READ);
    expect(res.status).toBe(403);
  });

  it('removing a painful exercise from a completed session clears the session-level compromise it caused', async () => {
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY1, date: '2026-09-13' });
    const workoutId = w.body.workout.id;
    const target = byName(w.body, EX.LEG_EXTENSION).workout_exercise;
    await call(app, 'POST', `/workouts/${workoutId}/sets`, { workout_exercise_id: target.id, set_index: 1, weight_kg: 40, reps: 12, rir: 2, pain_severity: 'moderate' });
    await call(app, 'PATCH', `/workouts/${workoutId}`, { completed_at: '2026-09-13T12:00:00.000Z' });
    const done = await call<WorkoutDetail>(app, 'GET', `/workouts/${workoutId}`);
    expect(byName(done.body, EX.LEG_EXTENSION).workout_exercise.is_compromised).toBe(true);

    expect((await call(app, 'DELETE', `/workouts/${workoutId}/exercises/${target.id}`)).status).toBe(204);
    const after = await call<WorkoutDetail>(app, 'GET', `/workouts/${workoutId}`);
    expect(after.body.exercises.map((e) => e.exercise.name)).not.toContain(EX.LEG_EXTENSION);
    expect(after.body.workout.completed_at).toBe('2026-09-13T12:00:00.000Z');
  });
});

describe('rir_observed (amendment A1)', () => {
  it('the migration reads existing rows as observed, since they predate the field', () => {
    // Stage a database as it stood before 002: apply 001 only, then write set rows the old way.
    // Foreign keys stay off here so the fixture is three set rows and nothing else.
    const db = new Db(new DatabaseSync(':memory:', { enableForeignKeyConstraints: false }));
    db.exec(readFileSync(join(MIGRATIONS_DIR, '001_initial.sql'), 'utf8'));
    const row = (id: string, rir: string, amrap = 0) =>
      db.exec(`INSERT INTO set_logs (id, workout_exercise_id, set_index, weight_kg, reps, rir, is_amrap, completed_at)
               VALUES ('${id}', 'we1', 1, 42.5, 10, ${rir}, ${amrap}, '2026-09-01T10:00:00.000Z')`);
    row('real', '2');       // a genuinely recorded effort value
    row('blank', 'NULL');   // nothing recorded
    row('amrap', '0', 1);   // taken to failure

    const applied = runMigrations(db);
    expect(applied).toContain('002_rir_observed.sql');

    const observed = (id: string) => db.get<{ rir_observed: number }>('SELECT rir_observed FROM set_logs WHERE id = $id', { id })!.rir_observed;
    // The point of the backfill: real history keeps progressing rather than being frozen by a field
    // that did not exist when it was written.
    expect(observed('real')).toBe(1);
    expect(observed('amrap')).toBe(1);
    // A row with no effort value observed nothing. It changes no behaviour either way, since a null
    // RIR is excluded from the effort mean regardless.
    expect(observed('blank')).toBe(0);
  });

  it('defaults to true on create, stores false when the client says so, and survives a round trip', async () => {
    const { app } = makeApp();
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY1, date: '2026-09-12' });
    const wid = w.body.workout.id;
    const weid = byName(w.body, EX.BENCH).workout_exercise.id;

    const omitted = await call<SetLog>(app, 'POST', `/workouts/${wid}/sets`, { workout_exercise_id: weid, set_index: 1, weight_kg: 42.5, reps: 10, rir: 3 });
    expect(omitted.body.rir_observed).toBe(true);

    const assumed = await call<SetLog>(app, 'POST', `/workouts/${wid}/sets`, { workout_exercise_id: weid, set_index: 2, weight_kg: 42.5, reps: 10, rir: 3, rir_observed: false });
    expect(assumed.body.rir_observed).toBe(false);

    const reread = await call<WorkoutDetail>(app, 'GET', `/workouts/${wid}`);
    const sets = byName(reread.body, EX.BENCH).sets;
    expect(sets.find((x) => x.id === assumed.body.id)!.rir_observed).toBe(false);
    expect(sets.find((x) => x.id === omitted.body.id)!.rir_observed).toBe(true);

    // A patch can correct it either way.
    const fixed = await call<SetLog>(app, 'PATCH', `/sets/${assumed.body.id}`, { rir: 4, rir_observed: true });
    expect(fixed.body.rir_observed).toBe(true);
    expect(fixed.body.rir).toBe(4);
  });

  it('an AMRAP set is forced to RIR 0 and observed, even when the client sends false', async () => {
    const { app } = makeApp();
    const w = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY1, date: '2026-09-12' });
    const wid = w.body.workout.id;
    const weid = byName(w.body, EX.BENCH).workout_exercise.id;
    const amrap = await call<SetLog>(app, 'POST', `/workouts/${wid}/sets`, { workout_exercise_id: weid, set_index: 1, weight_kg: 42.5, reps: 14, rir: 3, is_amrap: true, rir_observed: false });
    expect(amrap.body.rir).toBe(0);
    expect(amrap.body.rir_observed).toBe(true);
  });

  // The whole point of items 1 and 4 together. Until the column existed, the effort test could never
  // fire in production because every row read as observed.
  it('an untouched effort default no longer adds weight to the bar, end to end', async () => {
    const assumedRun = async (rirObserved: boolean) => {
      const { app } = makeApp();
      const first = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY1, date: '2026-09-12' });
      const wid = first.body.workout.id;
      const bench = byName(first.body, EX.BENCH).workout_exercise;
      expect(bench.suggested_weight_kg).toBe(42.5);
      expect(bench.target_rir).toBe(3);
      // Three sets at the top of the range, reporting exactly the target effort.
      for (const i of [1, 2, 3]) {
        await call(app, 'POST', `/workouts/${wid}/sets`, { workout_exercise_id: bench.id, set_index: i, weight_kg: 42.5, reps: 10, rir: 3, rir_observed: rirObserved });
      }
      await call(app, 'PATCH', `/workouts/${wid}`, { completed_at: '2026-09-12T12:00:00.000Z' });
      const next = await call<WorkoutDetail>(app, 'POST', '/workouts', { template_id: DAY1, date: '2026-09-19' });
      return byName(next.body, EX.BENCH).workout_exercise;
    };

    const observed = await assumedRun(true);
    expect(observed.reason).toBe('progress_load');
    expect(observed.suggested_weight_kg).toBe(45);

    const assumed = await assumedRun(false);
    expect(assumed.reason).toBe('consolidate');
    expect(assumed.suggested_weight_kg).toBe(42.5);
    expect(assumed.rationale).toMatch(/how hard/i);
  });
});

describe('mesocycles, cardio, injuries', () => {
  const { app } = makeApp();
  it('POST /mesocycles with status active demotes the seed block', async () => {
    const weeks = [1, 2, 3, 4].map((n) => ({ week_number: n, is_deload: n === 4, set_delta: n === 4 ? 0 : n - 1, rir_target_low: n === 4 ? 4 : 2, rir_target_high: n === 4 ? 5 : 2, volume_multiplier: n === 4 ? 0.5 : 1 }));
    const bad = await call(app, 'POST', '/mesocycles', { name: 'Block 2', start_date: '2026-10-24', planned_weeks: 4, deload_week: 5, weeks });
    expect(bad.status).toBe(400);
    const res = await call<MesocycleWithWeeks>(app, 'POST', '/mesocycles', { name: 'Block 2', start_date: '2026-10-24', planned_weeks: 4, deload_week: 4, status: 'active', weeks });
    expect(res.status).toBe(201);
    expect(res.body.weeks).toHaveLength(4);
    const all = await call<{ items: MesocycleWithWeeks[] }>(app, 'GET', '/mesocycles');
    expect(all.body.items.find((m) => m.id === SEED_MESOCYCLE_ID)?.status).toBe('complete');
    // Block 2 is active but has not started on 2026-09-13: the contract returns the block with a null week,
    // and 404 only when no block is active at all.
    const current = await call<CurrentMesocycle>(app, 'GET', '/mesocycles/current');
    expect(current.status).toBe(200);
    expect(current.body.mesocycle.id).toBe(res.body.id);
    expect(current.body.week_number).toBeNull();
    expect(current.body.week).toBeNull();
    expect(current.body.is_deload).toBe(false);
    const patched = await call<MesocycleWithWeeks>(app, 'PATCH', `/mesocycles/${res.body.id}`, { notes: 'hi' });
    expect(patched.body.notes).toBe('hi');
  });
  it('cardio create/list/delete', async () => {
    const a = await call<{ id: string }>(app, 'POST', '/cardio', { id: 'eeeeeeee-1111-4222-8333-000000000001', date: '2026-09-13', type: 'run', duration_minutes: 30, zone_minutes: { z2: 20, z3: 10 } });
    expect(a.status).toBe(201);
    expect((await call(app, 'POST', '/cardio', { id: a.body.id, date: '2026-09-13', type: 'run', duration_minutes: 30 })).status).toBe(200);
    const list = await call<{ items: unknown[] }>(app, 'GET', '/cardio?from=2026-09-01&to=2026-09-30');
    expect(list.body.items).toHaveLength(1);
    const summary = await call<SummaryResponse>(app, 'GET', '/summary');
    expect(summary.body.cardio).toEqual({ sessions: 1, minutes: 30, zone_minutes: { z2: 20, z3: 10 } });
    expect((await call(app, 'DELETE', `/cardio/${a.body.id}`)).status).toBe(204);
  });
  it('injury create/patch', async () => {
    const a = await call<{ id: string; status: string; constraints: unknown[] }>(app, 'POST', '/injuries', { name: 'Left knee', region: 'left knee', started_at: '2026-09-10' });
    expect(a.status).toBe(201);
    const resolved = await call<{ status: string; resolved_at: string | null }>(app, 'PATCH', `/injuries/${a.body.id}`, { status: 'resolved' });
    expect(resolved.body.resolved_at).toBe('2026-09-13');
    expect((await call<{ items: unknown[] }>(app, 'GET', '/injuries?status=resolved')).body.items).toHaveLength(1);
  });
});

describe('seed is idempotent', () => {
  it('re-seeding keeps the block start and does not reset a working weight', () => {
    const { db } = makeApp();
    db.run('UPDATE progression_state SET working_weight_kg = 50 WHERE exercise_id = $id', { id: ex(EX.BENCH) });
    const s = seedDatabase(db);
    expect(s.mesocycle_start).toBe(START);
    expect(s.mesocycle_start_source).toBe('existing');
    expect(s.starting_loads_inserted).toBe(0);
    expect(db.get<{ w: number }>('SELECT working_weight_kg AS w FROM progression_state WHERE exercise_id = $id', { id: ex(EX.BENCH) })?.w).toBe(50);
    expect(db.get<{ c: number }>('SELECT count(*) AS c FROM exercises')?.c).toBeGreaterThan(30);
    const moved = seedDatabase(db, { start_date: '2026-09-19' });
    expect(moved.mesocycle_start_source).toBe('explicit');
  });
});
