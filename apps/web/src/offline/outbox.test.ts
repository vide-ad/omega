import { describe, expect, it } from 'vitest';
import type { Paginated, ReadinessResponse, SetCreate, WorkoutDetail, WorkoutListItem } from '@omega/core';
import {
  applyOp, applyPending, cacheKeys, classifyOp, discard, enqueue, memoryStores, replay, type OutboxOp, type SendResult,
} from './outbox.js';

const WID = 'w-1';
const WEID = 'we-1';

function detail(): WorkoutDetail {
  return {
    workout: {
      id: WID, template_id: 't', template_version: 1, mesocycle_id: 'm', week_number: 1, date: '2026-09-07',
      started_at: null, completed_at: null, readiness_id: null, session_rpe: null, notes: null, is_compromised: false,
    },
    template_name: 'Day 1',
    exercises: [{
      workout_exercise: {
        id: WEID, workout_id: WID, exercise_id: 'e1', order: 1, target_sets: 3, target_rep_low: 8, target_rep_high: 10,
        target_rir: 2, suggested_weight_kg: 42, rest_seconds: 150, notes: null,
      },
      exercise: {
        id: 'e1', name: 'Bench', aliases: [], equipment: 'barbell', movement_pattern: 'horizontal_press', is_unilateral: false,
        lengthened_bias: false, default_rep_low: 8, default_rep_high: 10, default_rir_target: 2, default_rest_seconds: 150,
        weight_increment_kg: 2.5, demo_video_url: null, cues: null, archived: false, created_at: '2026-01-01T00:00:00.000Z',
      },
      prescription: null,
      previous: null,
      sets: [],
    }],
  };
}

function setBody(id: string, set_index: number, extra: Partial<SetCreate> = {}): SetCreate & { id: string } {
  return {
    id, workout_exercise_id: WEID, set_index, side: 'bilateral', is_warmup: false, is_amrap: false, weight_kg: 42, reps: 10,
    rir: 2, tempo: null, rest_taken_seconds: null, pain_severity: 'none', pain_note: null, media_id: null,
    completed_at: '2026-09-07T10:00:00.000Z', ...extra,
  };
}

function op(partial: Partial<OutboxOp> & Pick<OutboxOp, 'op_id' | 'method' | 'path'>): OutboxOp {
  return { body: null, created_at: '2026-09-07T10:00:00.000Z', attempts: 0, last_error: null, ...partial };
}

describe('classifyOp', () => {
  it('recognises the mutation shapes the app queues', () => {
    expect(classifyOp(op({ op_id: '1', method: 'POST', path: `/workouts/${WID}/sets` })).kind).toBe('set_create');
    expect(classifyOp(op({ op_id: '1', method: 'PATCH', path: '/sets/s1' })).kind).toBe('set_patch');
    expect(classifyOp(op({ op_id: '1', method: 'DELETE', path: '/sets/s1' })).kind).toBe('set_delete');
    expect(classifyOp(op({ op_id: '1', method: 'PATCH', path: `/workouts/${WID}` })).kind).toBe('workout_patch');
    expect(classifyOp(op({ op_id: '1', method: 'POST', path: '/readiness' })).kind).toBe('readiness_upsert');
    expect(classifyOp(op({ op_id: '1', method: 'POST', path: '/cardio' })).kind).toBe('other');
  });
});

describe('applyOp', () => {
  it('appends a created set to the right exercise, idempotently', () => {
    const create = op({ op_id: 'o1', method: 'POST', path: `/workouts/${WID}/sets`, body: setBody('s1', 1) });
    const once = applyOp(cacheKeys.workout(WID), detail(), create) as WorkoutDetail;
    expect(once.exercises[0]?.sets.map((s) => s.id)).toEqual(['s1']);
    const twice = applyOp(cacheKeys.workout(WID), once, create) as WorkoutDetail;
    expect(twice.exercises[0]?.sets).toHaveLength(1);
    // a different workout's cache is untouched (same reference)
    const other = detail();
    expect(applyOp(cacheKeys.workout('w-2'), other, create)).toBe(other);
  });

  it('patches and deletes sets by id across cached workouts', () => {
    const base = applyOp(cacheKeys.workout(WID), detail(), op({ op_id: 'o1', method: 'POST', path: `/workouts/${WID}/sets`, body: setBody('s1', 1) }));
    const patched = applyOp(cacheKeys.workout(WID), base, op({ op_id: 'o2', method: 'PATCH', path: '/sets/s1', body: { reps: 12, rir: 0 } })) as WorkoutDetail;
    expect(patched.exercises[0]?.sets[0]).toMatchObject({ id: 's1', reps: 12, rir: 0, weight_kg: 42 });
    const deleted = applyOp(cacheKeys.workout(WID), patched, op({ op_id: 'o3', method: 'DELETE', path: '/sets/s1' })) as WorkoutDetail;
    expect(deleted.exercises[0]?.sets).toHaveLength(0);
    // unknown set id → untouched
    expect(applyOp(cacheKeys.workout(WID), deleted, op({ op_id: 'o4', method: 'DELETE', path: '/sets/nope' }))).toBe(deleted);
  });

  it('patches a workout in its detail and in list caches', () => {
    const patch = op({ op_id: 'o1', method: 'PATCH', path: `/workouts/${WID}`, body: { completed_at: '2026-09-07T11:00:00.000Z', session_rpe: 7 } });
    const d = applyOp(cacheKeys.workout(WID), detail(), patch) as WorkoutDetail;
    expect(d.workout.completed_at).toBe('2026-09-07T11:00:00.000Z');
    expect(d.workout.session_rpe).toBe(7);
    const list: Paginated<WorkoutListItem> = { items: [{ ...detail().workout, template_name: 'Day 1', exercise_count: 1, set_count: 0 }], next_cursor: null };
    const l = applyOp(cacheKeys.workoutsRange('2026-09-07', '2026-09-07'), list, patch) as Paginated<WorkoutListItem>;
    expect(l.items[0]?.completed_at).toBe('2026-09-07T11:00:00.000Z');
  });

  it('upserts readiness by date', () => {
    const r: ReadinessResponse = { items: [], rolling: { rhr_median_30d: null, bodyweight_median_30d: null }, recently_trained: ['quads'] };
    const body = { id: 'r1', date: '2026-09-07', bodyweight_kg: 80, resting_hr: 50, sleep_hours: 7, sleep_quality: 4, stress: 2, motivation: 4, manual_compromised: false, notes: null, soreness: [{ muscle_group_key: 'quads', rating: 3 }] };
    const a = applyOp(cacheKeys.readiness, r, op({ op_id: 'o1', method: 'POST', path: '/readiness', body })) as ReadinessResponse;
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ id: 'r1', bodyweight_kg: 80, soreness: [{ muscle_group_key: 'quads', rating: 3 }] });
    const b = applyOp(cacheKeys.readiness, a, op({ op_id: 'o2', method: 'POST', path: '/readiness', body: { ...body, bodyweight_kg: 81 } })) as ReadinessResponse;
    expect(b.items).toHaveLength(1);
    expect(b.items[0]?.bodyweight_kg).toBe(81);
  });

  it('applyPending replays every pending op over a fresh server response', () => {
    const ops = [
      op({ op_id: 'o1', method: 'POST', path: `/workouts/${WID}/sets`, body: setBody('s1', 1), created_at: '2026-09-07T10:00:00.000Z' }),
      op({ op_id: 'o2', method: 'POST', path: `/workouts/${WID}/sets`, body: setBody('s2', 2), created_at: '2026-09-07T10:03:00.000Z' }),
      op({ op_id: 'o3', method: 'PATCH', path: '/sets/s1', body: { reps: 9 }, created_at: '2026-09-07T10:04:00.000Z' }),
    ];
    // server already has s1 (a previous partial replay) — still exactly two sets afterwards
    const server = detail();
    server.exercises[0]!.sets.push({ ...setBody('s1', 1), completed_at: '2026-09-07T10:00:00.000Z' });
    const v = applyPending(cacheKeys.workout(WID), server, ops) as WorkoutDetail;
    expect(v.exercises[0]?.sets.map((s) => [s.id, s.reps])).toEqual([['s1', 9], ['s2', 10]]);
  });
});

describe('enqueue + replay', () => {
  it('enqueues, applies optimistically, and replays in order', async () => {
    const stores = memoryStores();
    await stores.cache.set(cacheKeys.workout(WID), detail());
    const r1 = await enqueue(stores, { op_id: 'o1', method: 'POST', path: `/workouts/${WID}/sets`, body: setBody('s1', 1), created_at: '2026-09-07T10:00:00.000Z' });
    expect(r1.changed).toEqual([cacheKeys.workout(WID)]);
    await enqueue(stores, { op_id: 'o2', method: 'PATCH', path: '/sets/s1', body: { reps: 11 }, created_at: '2026-09-07T10:01:00.000Z' });
    const cached = (await stores.cache.get(cacheKeys.workout(WID))) as WorkoutDetail;
    expect(cached.exercises[0]?.sets[0]?.reps).toBe(11);
    expect(await stores.outbox.count()).toBe(2);

    const sent: string[] = [];
    const report = await replay(stores, async (o) => { sent.push(o.op_id); return { ok: true, status: 201, body: null }; });
    expect(sent).toEqual(['o1', 'o2']);
    expect(report).toMatchObject({ sent: 2, remaining: 0, stopped: null, rejected: null });
    expect(await stores.outbox.count()).toBe(0);
  });

  it('stops on a network failure and keeps every op for a later retry', async () => {
    const stores = memoryStores();
    await enqueue(stores, { op_id: 'o1', method: 'POST', path: `/workouts/${WID}/sets`, body: setBody('s1', 1), created_at: '2026-09-07T10:00:00.000Z' });
    await enqueue(stores, { op_id: 'o2', method: 'POST', path: `/workouts/${WID}/sets`, body: setBody('s2', 2), created_at: '2026-09-07T10:01:00.000Z' });
    let calls = 0;
    const report = await replay(stores, async (): Promise<SendResult> => { calls++; return { ok: false, kind: 'network', error: 'Failed to fetch' }; });
    expect(calls).toBe(1);
    expect(report).toMatchObject({ sent: 0, remaining: 2, stopped: 'network', last_error: 'Failed to fetch' });
    const ops = await stores.outbox.list();
    expect(ops.map((o) => [o.op_id, o.attempts, o.last_error])).toEqual([['o1', 1, 'Failed to fetch'], ['o2', 0, null]]);
  });

  it('stops on a 4xx, surfaces the rejected op, and does not loop', async () => {
    const stores = memoryStores();
    await enqueue(stores, { op_id: 'o1', method: 'POST', path: `/workouts/${WID}/sets`, body: setBody('s1', 1), created_at: '2026-09-07T10:00:00.000Z' });
    await enqueue(stores, { op_id: 'o2', method: 'PATCH', path: '/sets/s1', body: { reps: 9 }, created_at: '2026-09-07T10:01:00.000Z' });
    const send = async (o: OutboxOp): Promise<SendResult> =>
      o.op_id === 'o1' ? { ok: false, kind: 'http', status: 422, error: 'validation_error' } : { ok: true, status: 200, body: null };
    const report = await replay(stores, send);
    expect(report.stopped).toBe('rejected');
    expect(report.rejected?.op_id).toBe('o1');
    expect(report.sent).toBe(0);
    expect(await stores.outbox.count()).toBe(2);
    // a second run hits the same wall (no infinite loop, attempts climb)
    const again = await replay(stores, send);
    expect(again.stopped).toBe('rejected');
    expect((await stores.outbox.list())[0]?.attempts).toBe(2);
    // discarding the bad op unblocks the rest
    await discard(stores, 'o1');
    const after = await replay(stores, send);
    expect(after).toMatchObject({ sent: 1, remaining: 0, stopped: null });
  });

  it('treats 5xx as retryable (stops, keeps ops, no rejected op)', async () => {
    const stores = memoryStores();
    await enqueue(stores, { op_id: 'o1', method: 'PATCH', path: `/workouts/${WID}`, body: { notes: 'x' }, created_at: '2026-09-07T10:00:00.000Z' });
    const report = await replay(stores, async () => ({ ok: false, kind: 'http', status: 503, error: 'unavailable' }));
    expect(report).toMatchObject({ stopped: 'server', rejected: null, remaining: 1 });
  });

  it('orders by created_at, then insertion', async () => {
    const stores = memoryStores();
    await enqueue(stores, { op_id: 'late', method: 'PATCH', path: `/workouts/${WID}`, body: {}, created_at: '2026-09-07T10:05:00.000Z' });
    await enqueue(stores, { op_id: 'early', method: 'PATCH', path: `/workouts/${WID}`, body: {}, created_at: '2026-09-07T10:00:00.000Z' });
    await enqueue(stores, { op_id: 'early2', method: 'PATCH', path: `/workouts/${WID}`, body: {}, created_at: '2026-09-07T10:00:00.000Z' });
    const sent: string[] = [];
    await replay(stores, async (o) => { sent.push(o.op_id); return { ok: true, status: 200, body: null }; });
    expect(sent).toEqual(['early', 'early2', 'late']);
  });
});
