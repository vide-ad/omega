/**
 * IndexedDB via Dexie (docs/API.md "Offline model"):
 *   cache  — read cache of API responses, keyed by a logical key (e.g. `workout:<id>`)
 *   outbox — queued mutations replayed in order when online
 */
import Dexie, { type EntityTable } from 'dexie';
import type { CacheStore, OutboxOp, OutboxStore } from './outbox.js';

export interface CacheRow { key: string; value: unknown; updated_at: string }

export class OmegaDB extends Dexie {
  cache!: EntityTable<CacheRow, 'key'>;
  outbox!: EntityTable<OutboxOp, 'op_id'>;
  constructor() {
    super('omega');
    this.version(1).stores({
      cache: 'key, updated_at',
      outbox: 'op_id, created_at',
    });
  }
}

export const db = new OmegaDB();

export const dexieCacheStore: CacheStore = {
  async get(key) {
    const row = await db.cache.get(key);
    return row ? row.value : undefined;
  },
  async set(key, value) {
    await db.cache.put({ key, value, updated_at: new Date().toISOString() });
  },
  async keys(prefix) {
    return db.cache.where('key').startsWith(prefix).primaryKeys();
  },
  async delete(key) {
    await db.cache.delete(key);
  },
};

export const dexieOutboxStore: OutboxStore = {
  async list() {
    // created_at is an ISO timestamp; ties are broken by op_id insertion order below.
    const ops = await db.outbox.orderBy('created_at').toArray();
    return ops;
  },
  async put(op) {
    await db.outbox.put(op);
  },
  async update(op_id, patch) {
    await db.outbox.update(op_id, patch);
  },
  async remove(op_id) {
    await db.outbox.delete(op_id);
  },
  async count() {
    return db.outbox.count();
  },
};

export async function clearAllLocalData(): Promise<void> {
  await db.transaction('rw', db.cache, db.outbox, async () => {
    await db.cache.clear();
    await db.outbox.clear();
  });
}
