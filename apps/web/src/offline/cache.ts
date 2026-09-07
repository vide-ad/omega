/**
 * Network-first reads with cache fallback. Every successful response is stored in the `cache`
 * table (after re-applying any pending outbox ops so optimistic edits are never lost), and served
 * from there when the network fails. `fromCache` lets the UI show the "offline" pill.
 */
import { api, ApiError, isNetworkError, type RequestOptions } from '../api/client.js';
import { applyPending, type Stores } from './outbox.js';
import { getStores } from './sync.js';

export interface CachedResult<T> {
  data: T;
  fromCache: boolean;
  /** The network error when data came from cache (for diagnostics). */
  error: Error | null;
}

export interface CachedGetOptions extends RequestOptions {
  /** Treat a 404 as a valid `null` value (e.g. `/mesocycles/current` with no active block). */
  notFoundAsNull?: boolean;
  stores?: Stores;
}

export async function cachedGet<T>(key: string, path: string, opts: CachedGetOptions = {}): Promise<CachedResult<T>> {
  const stores = opts.stores ?? getStores();
  try {
    let data: T;
    try {
      data = await api.get<T>(path, opts);
    } catch (e) {
      if (opts.notFoundAsNull && e instanceof ApiError && e.status === 404) data = null as T;
      else throw e;
    }
    const pending = await stores.outbox.list();
    const merged = pending.length ? (applyPending(key, data, pending) as T) : data;
    await stores.cache.set(key, merged);
    return { data: merged, fromCache: false, error: null };
  } catch (e) {
    // Only fall back to the cache when we got no answer (offline/timeouts) or the server is down;
    // an auth or validation error must surface.
    const fallbackable = isNetworkError(e) || (e instanceof ApiError && e.status >= 500);
    if (!fallbackable) throw e;
    const cached = await stores.cache.get(key);
    if (cached === undefined) throw e;
    return { data: cached as T, fromCache: true, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/** Read straight from the cache (used after optimistic updates). `undefined` when absent. */
export async function readCache<T>(key: string, stores: Stores = getStores()): Promise<T | undefined> {
  const v = await stores.cache.get(key);
  return v as T | undefined;
}

export async function writeCache(key: string, value: unknown, stores: Stores = getStores()): Promise<void> {
  await stores.cache.set(key, value);
}
