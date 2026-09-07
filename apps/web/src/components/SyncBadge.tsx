import { useSyncStatus } from '../hooks/useSyncStatus.js';
import { navigate } from '../router.js';

/** Compact outbox indicator in the top bar: hidden when idle, count when pending, red when an op was rejected. */
export function SyncBadge() {
  const s = useSyncStatus();
  if (s.pending === 0 && !s.rejected) return null;
  const tone = s.rejected ? 'pill-red' : 'pill-blue';
  const label = s.rejected ? 'sync error' : `${s.pending} queued${s.replaying ? '…' : ''}`;
  return (
    <button type="button" className={`pill ${tone} pill-tap`} onClick={() => navigate('/settings')} title="Open sync status">
      {label}
    </button>
  );
}
