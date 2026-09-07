/**
 * Network-first read with cache fallback for screens. Re-reads the cache when an outbox op
 * touches `key`, refetches when the outbox drains (server-computed fields) and when the app
 * comes back to the foreground.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cachedGet, readCache, type CachedGetOptions } from '../offline/cache.js';
import { onCacheChange, onOutboxDrained } from '../offline/sync.js';

export interface CachedState<T> {
  data: T | undefined;
  fromCache: boolean;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

export function useCachedGet<T>(key: string | null, path: string, opts: Pick<CachedGetOptions, 'notFoundAsNull' | 'timeoutMs'> = {}): CachedState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(key !== null);
  const [error, setError] = useState<Error | null>(null);
  const alive = useRef(true);
  const seq = useRef(0);
  const notFoundAsNull = opts.notFoundAsNull ?? false;
  const timeoutMs = opts.timeoutMs;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reload = useCallback(async () => {
    if (!key) return;
    const my = ++seq.current;
    setLoading(true);
    // Paint the cached value immediately so the screen is never blank while the network is slow.
    try {
      const cached = await readCache<T>(key);
      if (alive.current && my === seq.current && cached !== undefined) setData((d) => (d === undefined ? cached : d));
    } catch { /* ignore */ }
    try {
      const r = await cachedGet<T>(key, path, { notFoundAsNull, timeoutMs });
      if (!alive.current || my !== seq.current) return;
      setData(r.data);
      setFromCache(r.fromCache);
      setError(r.fromCache ? r.error : null);
    } catch (e) {
      if (!alive.current || my !== seq.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (alive.current && my === seq.current) setLoading(false);
    }
  }, [key, path, notFoundAsNull, timeoutMs]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!key) return;
    return onCacheChange((keys) => {
      if (!keys.includes(key)) return;
      void readCache<T>(key).then((v) => { if (alive.current && v !== undefined) setData(v); });
    });
  }, [key]);

  useEffect(() => onOutboxDrained(() => { void reload(); }), [reload]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    const onOnline = () => { void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [reload]);

  return { data, fromCache, loading, error, reload };
}
