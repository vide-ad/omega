/**
 * Keep the screen on during a session (`navigator.wakeLock`, Safari 16.4+). The lock is released
 * by the OS whenever the page is hidden, so it is re-requested on `visibilitychange`.
 */
import { useEffect } from 'react';

type WakeLockSentinelLike = { release(): Promise<void>; addEventListener?: (t: 'release', fn: () => void) => void };
type NavWithWakeLock = Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } };

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as NavWithWakeLock;
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinel = await nav.wakeLock!.request('screen');
        sentinel.addEventListener?.('release', () => { sentinel = null; });
      } catch { sentinel = null; }
    };
    const onVisible = () => { if (document.visibilityState === 'visible' && !sentinel) void request(); };
    document.addEventListener('visibilitychange', onVisible);
    void request();
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel) void sentinel.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
