import { useEffect, useState } from 'react';
import { getSyncStatus, onSyncStatus, type SyncStatus } from '../offline/sync.js';

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState<SyncStatus>(getSyncStatus);
  useEffect(() => onSyncStatus(setS), []);
  return s;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
