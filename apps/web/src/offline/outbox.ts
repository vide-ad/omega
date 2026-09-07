/**
 * Outbox logic (docs/API.md "Offline model"), written as pure functions over injected stores so it
 * can be unit-tested without IndexedDB. Browser wiring (Dexie, online/visibility events) lives in
 * `sync.ts`.
 *
 * Model:
 *  - A mutation is enqueued as an `OutboxOp` and applied optimistically to every cached entity it
 *    touches (`applyOp`). Because creates carry client UUIDs, `applyOp` is an idempotent upsert, so
 *    it is also safe to re-apply pending ops over a fresh server response (`applyPending`).
 *  - `replay` sends ops in `created_at` order. A network failure stops the run (retry later); a
 *    5xx is treated the same; a 4xx is a *rejected* op: it is kept, marked with `last_error`, and
 *    the run stops so the failure is surfaced (sync badge) rather than looping.
 */
import type {
  Paginated, ReadinessResponse, ReadinessUpsert, ReadinessWithSoreness, SetCreate, SetLog, SetPatch,
  WorkoutDetail, WorkoutListItem, WorkoutPatch,
} from '@omega/core';

export type OutboxMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface OutboxOp {
  op_id: string;
  method: OutboxMethod;
  /** Path relative to `/api/v1`, e.g. `/workouts/<id>/sets`. */
  path: string;
  body: unknown;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

export interface OutboxStore {
  /** All queued ops, oldest first. */
  list(): Promise<OutboxOp[]>;
  put(op: OutboxOp): Promise<void>;
  update(op_id: string, patch: Partial<OutboxOp>): Promise<void>;
  remove(op_id: string): Promise<void>;
  count(): Promise<number>;
}

export interface CacheStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export type SendResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; kind: 'network'; error: string }
  | { ok: false; kind: 'http'; status: number; error: string };

export type Sender = (op: OutboxOp) => Promise<SendResult>;

// ---------------------------------------------------------------------------
// Cache keys
// ---------------------------------------------------------------------------

export const cacheKeys = {
  currentMesocycle: 'mesocycles:current',
  templates: 'templates',
  workout: (id: string) => `workout:${id}`,
  workoutsRange: (from: string, to: string) => `workouts:range:${from}:${to}`,
  workoutsHistory: 'workouts:history',
  volume: (weeks: number) => `volume:${weeks}`,
  readiness: 'readiness:recent',
  muscleGroups: 'muscle-groups',
} as const;

// ---------------------------------------------------------------------------
// Optimistic application
// ---------------------------------------------------------------------------

const RE_SET_CREATE = /^\/workouts\/([^/]+)\/sets$/;
const RE_SET = /^\/sets\/([^/]+)$/;
const RE_WORKOUT = /^\/workouts\/([^/]+)$/;

export type OpKind =
  | { kind: 'set_create'; workout_id: string; body: SetCreate & { id: string } }
  | { kind: 'set_patch'; set_id: string; body: SetPatch }
  | { kind: 'set_delete'; set_id: string }
  | { kind: 'workout_patch'; workout_id: string; body: WorkoutPatch }
  | { kind: 'readiness_upsert'; body: ReadinessUpsert & { id: string } }
  | { kind: 'other' };

export function classifyOp(op: OutboxOp): OpKind {
  let m: RegExpExecArray | null;
  if (op.method === 'POST' && (m = RE_SET_CREATE.exec(op.path))) {
    return { kind: 'set_create', workout_id: m[1] ?? '', body: op.body as SetCreate & { id: string } };
  }
  if (op.method === 'PATCH' && (m = RE_SET.exec(op.path))) return { kind: 'set_patch', set_id: m[1] ?? '', body: op.body as SetPatch };
  if (op.method === 'DELETE' && (m = RE_SET.exec(op.path))) return { kind: 'set_delete', set_id: m[1] ?? '' };
  if (op.method === 'PATCH' && (m = RE_WORKOUT.exec(op.path))) return { kind: 'workout_patch', workout_id: m[1] ?? '', body: op.body as WorkoutPatch };
  if (op.method === 'POST' && op.path === '/readiness') return { kind: 'readiness_upsert', body: op.body as ReadinessUpsert & { id: string } };
  return { kind: 'other' };
}

/** Which cache-key prefixes an op can affect (so the caller can scan only those). */
export function affectedPrefixes(op: OutboxOp): string[] {
  switch (classifyOp(op).kind) {
    case 'set_create':
    case 'set_patch':
    case 'set_delete':
      return ['workout:', 'workouts:'];
    case 'workout_patch':
      return ['workout:', 'workouts:'];
    case 'readiness_upsert':
      return ['readiness:'];
    default:
      return [];
  }
}

function isWorkoutDetail(v: unknown): v is WorkoutDetail {
  return !!v && typeof v === 'object' && 'workout' in v && 'exercises' in v && Array.isArray((v as WorkoutDetail).exercises);
}
function isWorkoutList(v: unknown): v is Paginated<WorkoutListItem> {
  return !!v && typeof v === 'object' && Array.isArray((v as Paginated<unknown>).items);
}
function isReadiness(v: unknown): v is ReadinessResponse {
  return !!v && typeof v === 'object' && Array.isArray((v as ReadinessResponse).items) && 'recently_trained' in v;
}

function setFromCreate(body: SetCreate & { id: string }, created_at: string): SetLog {
  return {
    id: body.id,
    workout_exercise_id: body.workout_exercise_id,
    set_index: body.set_index,
    side: body.side,
    is_warmup: body.is_warmup,
    is_amrap: body.is_amrap,
    weight_kg: body.weight_kg,
    reps: body.reps,
    rir: body.rir,
    tempo: body.tempo,
    rest_taken_seconds: body.rest_taken_seconds,
    pain_severity: body.pain_severity,
    pain_note: body.pain_note,
    media_id: body.media_id,
    completed_at: body.completed_at ?? created_at,
  };
}

/**
 * Apply one op to one cached value. Returns the same reference when nothing changed.
 * Idempotent: applying the same op twice yields the same value.
 */
export function applyOp(key: string, value: unknown, op: OutboxOp): unknown {
  const k = classifyOp(op);
  switch (k.kind) {
    case 'set_create': {
      if (key !== cacheKeys.workout(k.workout_id) || !isWorkoutDetail(value)) return value;
      const set = setFromCreate(k.body, op.created_at);
      let changed = false;
      const exercises = value.exercises.map((ex) => {
        if (ex.workout_exercise.id !== set.workout_exercise_id) return ex;
        changed = true;
        const idx = ex.sets.findIndex((s) => s.id === set.id);
        const sets = idx >= 0 ? ex.sets.map((s, i) => (i === idx ? set : s)) : [...ex.sets, set];
        return { ...ex, sets };
      });
      return changed ? { ...value, exercises } : value;
    }
    case 'set_patch': {
      if (!key.startsWith('workout:') || !isWorkoutDetail(value)) return value;
      let changed = false;
      const exercises = value.exercises.map((ex) => {
        if (!ex.sets.some((s) => s.id === k.set_id)) return ex;
        changed = true;
        return { ...ex, sets: ex.sets.map((s) => (s.id === k.set_id ? { ...s, ...k.body } : s)) };
      });
      return changed ? { ...value, exercises } : value;
    }
    case 'set_delete': {
      if (!key.startsWith('workout:') || !isWorkoutDetail(value)) return value;
      let changed = false;
      const exercises = value.exercises.map((ex) => {
        if (!ex.sets.some((s) => s.id === k.set_id)) return ex;
        changed = true;
        return { ...ex, sets: ex.sets.filter((s) => s.id !== k.set_id) };
      });
      return changed ? { ...value, exercises } : value;
    }
    case 'workout_patch': {
      if (key === cacheKeys.workout(k.workout_id) && isWorkoutDetail(value)) {
        return { ...value, workout: { ...value.workout, ...k.body } };
      }
      if (key.startsWith('workouts:') && isWorkoutList(value)) {
        if (!value.items.some((w) => w.id === k.workout_id)) return value;
        return { ...value, items: value.items.map((w) => (w.id === k.workout_id ? { ...w, ...k.body } : w)) };
      }
      return value;
    }
    case 'readiness_upsert': {
      if (!key.startsWith('readiness:') || !isReadiness(value)) return value;
      const { soreness, ...rest } = k.body;
      const row: ReadinessWithSoreness = { ...rest, id: k.body.id, soreness: soreness ?? [] };
      const idx = value.items.findIndex((r) => r.date === row.date || r.id === row.id);
      const items = idx >= 0 ? value.items.map((r, i) => (i === idx ? { ...r, ...row } : r)) : [row, ...value.items];
      return { ...value, items };
    }
    default:
      return value;
  }
}

/** Apply every pending op (in order) to a single value — used over fresh server responses. */
export function applyPending(key: string, value: unknown, ops: readonly OutboxOp[]): unknown {
  let v = value;
  for (const op of ops) v = applyOp(key, v, op);
  return v;
}

/** Apply an op to every cached entity it can touch. Returns the keys that changed. */
export async function applyOpToCache(cache: CacheStore, op: OutboxOp): Promise<string[]> {
  const changed: string[] = [];
  for (const prefix of affectedPrefixes(op)) {
    for (const key of await cache.keys(prefix)) {
      const before = await cache.get(key);
      if (before === undefined) continue;
      const after = applyOp(key, before, op);
      if (after !== before) {
        await cache.set(key, after);
        changed.push(key);
      }
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Enqueue / replay
// ---------------------------------------------------------------------------

export interface Stores { outbox: OutboxStore; cache: CacheStore }

export interface EnqueueInput {
  op_id: string;
  method: OutboxMethod;
  path: string;
  body?: unknown;
  created_at: string;
}

/** Queue a mutation and apply it optimistically. Returns the op and the cache keys it changed. */
export async function enqueue(stores: Stores, input: EnqueueInput): Promise<{ op: OutboxOp; changed: string[] }> {
  const op: OutboxOp = {
    op_id: input.op_id,
    method: input.method,
    path: input.path,
    body: input.body ?? null,
    created_at: input.created_at,
    attempts: 0,
    last_error: null,
  };
  await stores.outbox.put(op);
  const changed = await applyOpToCache(stores.cache, op);
  return { op, changed };
}

export interface ReplayReport {
  sent: number;
  remaining: number;
  /** Why the run stopped early, if it did. */
  stopped: null | 'network' | 'server' | 'rejected';
  /** The op that was rejected with a 4xx (kept in the queue for the user to retry or discard). */
  rejected: OutboxOp | null;
  last_error: string | null;
}

/**
 * Send queued ops in order. Stops at the first failure; see the module comment for the policy.
 * `onSent` lets the caller react per op (e.g. refresh a cache) — it must not throw.
 */
export async function replay(stores: Stores, send: Sender, onSent?: (op: OutboxOp, body: unknown) => Promise<void> | void): Promise<ReplayReport> {
  const ops = await stores.outbox.list();
  const report: ReplayReport = { sent: 0, remaining: ops.length, stopped: null, rejected: null, last_error: null };
  for (const op of ops) {
    const res = await send(op);
    if (res.ok) {
      await stores.outbox.remove(op.op_id);
      report.sent++;
      report.remaining--;
      if (onSent) await onSent(op, res.body);
      continue;
    }
    const attempts = op.attempts + 1;
    if (res.kind === 'network') {
      await stores.outbox.update(op.op_id, { attempts, last_error: res.error });
      report.stopped = 'network';
      report.last_error = res.error;
      break;
    }
    const msg = `${res.status}: ${res.error}`;
    await stores.outbox.update(op.op_id, { attempts, last_error: msg });
    report.last_error = msg;
    if (res.status >= 500) {
      report.stopped = 'server';
    } else {
      report.stopped = 'rejected';
      report.rejected = { ...op, attempts, last_error: msg };
    }
    break;
  }
  return report;
}

/** Drop an op that the server rejected (after the user has seen it). */
export async function discard(stores: Stores, op_id: string): Promise<void> {
  await stores.outbox.remove(op_id);
}

// ---------------------------------------------------------------------------
// In-memory stores (tests and the fallback when IndexedDB is unavailable)
// ---------------------------------------------------------------------------

export function memoryStores(): Stores & { dump(): { outbox: OutboxOp[]; cache: Map<string, unknown> } } {
  const outbox = new Map<string, OutboxOp>();
  const cache = new Map<string, unknown>();
  let seq = 0;
  const order = new Map<string, number>();
  return {
    outbox: {
      async list() {
        return [...outbox.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || (order.get(a.op_id) ?? 0) - (order.get(b.op_id) ?? 0));
      },
      async put(op) { outbox.set(op.op_id, op); if (!order.has(op.op_id)) order.set(op.op_id, seq++); },
      async update(id, patch) { const cur = outbox.get(id); if (cur) outbox.set(id, { ...cur, ...patch }); },
      async remove(id) { outbox.delete(id); },
      async count() { return outbox.size; },
    },
    cache: {
      async get(key) { return cache.get(key); },
      async set(key, value) { cache.set(key, value); },
      async keys(prefix) { return [...cache.keys()].filter((k) => k.startsWith(prefix)); },
      async delete(key) { cache.delete(key); },
    },
    dump: () => ({ outbox: [...outbox.values()], cache }),
  };
}
