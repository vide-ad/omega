/**
 * Browser wiring for the outbox: Dexie-backed stores, a single-flight replay loop, and the
 * triggers (online, visibilitychange → visible, after every enqueue when online).
 * Emits `cache` events (keys changed) and `status` events so screens can re-read.
 */
import { api, ApiError, isNetworkError } from '../api/client.js';
import { uuid } from '../lib/uuid.js';
import {
  applyOpToCache, discard as discardOp, enqueue, memoryStores, replay,
  type OutboxMethod, type OutboxOp, type ReplayReport, type SendResult, type Stores,
} from './outbox.js';

let stores: Stores | null = null;

export function getStores(): Stores {
  if (stores) return stores;
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
    // Lazy import keeps Dexie out of unit tests that only touch the pure module.
    // (Dynamic import is not awaited here; db.ts is a static import in practice — see main.tsx.)
    stores = dexieStores ?? memoryStores();
  } catch {
    stores = memoryStores();
  }
  return stores;
}

let dexieStores: Stores | null = null;
/** Called once from main.tsx with the Dexie stores so the pure module never imports Dexie. */
export function installStores(s: Stores): void {
  dexieStores = s;
  stores = s;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface SyncStatus {
  pending: number;
  replaying: boolean;
  online: boolean;
  last_error: string | null;
  /** An op the server rejected with a 4xx; blocks everything behind it until retried or discarded. */
  rejected: OutboxOp | null;
  last_synced_at: string | null;
  last_report: ReplayReport | null;
}

type CacheListener = (keys: string[]) => void;
type StatusListener = (s: SyncStatus) => void;
const cacheListeners = new Set<CacheListener>();
const statusListeners = new Set<StatusListener>();

export function onCacheChange(fn: CacheListener): () => void {
  cacheListeners.add(fn);
  return () => cacheListeners.delete(fn);
}
export function onSyncStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

function emitCache(keys: string[]): void {
  if (keys.length === 0) return;
  for (const fn of cacheListeners) { try { fn(keys); } catch { /* listener error must not break sync */ } }
}

let status: SyncStatus = {
  pending: 0, replaying: false, online: typeof navigator === 'undefined' ? true : navigator.onLine,
  last_error: null, rejected: null, last_synced_at: null, last_report: null,
};

export function getSyncStatus(): SyncStatus { return status; }

async function refreshStatus(patch: Partial<SyncStatus> = {}): Promise<void> {
  const s = getStores();
  const pending = await s.outbox.count();
  status = { ...status, ...patch, pending, online: typeof navigator === 'undefined' ? true : navigator.onLine };
  if (pending === 0) status = { ...status, rejected: null, last_error: patch.last_error ?? null };
  for (const fn of statusListeners) { try { fn(status); } catch { /* ignore */ } }
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export interface MutationInput { method: OutboxMethod; path: string; body?: unknown }

/**
 * Queue a mutation, apply it optimistically, notify screens, and kick a replay if online.
 * Resolves as soon as the op is durably queued — never waits for the network.
 */
export async function enqueueMutation(input: MutationInput): Promise<OutboxOp> {
  const { op, changed } = await enqueue(getStores(), {
    op_id: uuid(), method: input.method, path: input.path, body: input.body, created_at: new Date().toISOString(),
  });
  emitCache(changed);
  await refreshStatus();
  if (status.online) void replayNow();
  return op;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

const sender = async (op: OutboxOp): Promise<SendResult> => {
  try {
    const body = await (op.method === 'DELETE'
      ? api.del<unknown>(op.path)
      : op.method === 'POST' ? api.post<unknown>(op.path, op.body)
      : op.method === 'PUT' ? api.put<unknown>(op.path, op.body)
      : api.patch<unknown>(op.path, op.body));
    return { ok: true, status: 200, body };
  } catch (e) {
    if (isNetworkError(e)) return { ok: false, kind: 'network', error: e.message };
    if (e instanceof ApiError) {
      // A DELETE of something already gone, or a POST that already exists, is success for our purposes.
      if (op.method === 'DELETE' && e.status === 404) return { ok: true, status: 404, body: null };
      return { ok: false, kind: 'http', status: e.status, error: `${e.code} — ${e.message}` };
    }
    return { ok: false, kind: 'network', error: e instanceof Error ? e.message : String(e) };
  }
};

let inflight: Promise<ReplayReport | null> | null = null;
let rerun = false;
const drainedListeners = new Set<() => void>();

/** Fires after a replay run that emptied the queue (screens refetch to pick up server-computed fields). */
export function onOutboxDrained(fn: () => void): () => void {
  drainedListeners.add(fn);
  return () => drainedListeners.delete(fn);
}

export function replayNow(): Promise<ReplayReport | null> {
  if (inflight) { rerun = true; return inflight; }
  inflight = (async () => {
    let report: ReplayReport | null = null;
    try {
      do {
        rerun = false;
        const s = getStores();
        if ((await s.outbox.count()) === 0) break;
        await refreshStatus({ replaying: true });
        report = await replay(s, sender, async (op) => {
          // Bake the confirmed op into the cache once more (no-op if already applied) so a
          // concurrent network fetch that raced ahead of the replay does not drop it.
          emitCache(await applyOpToCache(s.cache, op));
        });
        const patch: Partial<SyncStatus> = {
          replaying: false, last_report: report, last_error: report.last_error, rejected: report.rejected,
        };
        if (report.sent > 0) patch.last_synced_at = new Date().toISOString();
        await refreshStatus(patch);
        if (report.remaining === 0 && report.sent > 0) {
          for (const fn of drainedListeners) { try { fn(); } catch { /* ignore */ } }
        }
      } while (rerun);
    } catch (e) {
      await refreshStatus({ replaying: false, last_error: e instanceof Error ? e.message : String(e) });
    } finally {
      inflight = null;
    }
    return report;
  })();
  return inflight;
}

export async function discardOutboxOp(op_id: string): Promise<void> {
  await discardOp(getStores(), op_id);
  await refreshStatus({ rejected: null, last_error: null });
  if (status.online) void replayNow();
}

export async function listOutbox(): Promise<OutboxOp[]> {
  return getStores().outbox.list();
}

/** Install online / visibility triggers. Idempotent. */
let installed = false;
export function installSyncTriggers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('online', () => { void refreshStatus(); void replayNow(); });
  window.addEventListener('offline', () => { void refreshStatus(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void replayNow();
  });
  void refreshStatus();
  if (navigator.onLine) void replayNow();
}
