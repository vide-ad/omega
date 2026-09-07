import { useEffect, useState } from 'react';
import type { CurrentMesocycle } from '@omega/core';
import { api, ApiError, getSettings, health, saveSettings } from '../api/client.js';
import { Field } from '../components/ui.js';
import { useOnline, useSyncStatus } from '../hooks/useSyncStatus.js';
import { clearAllLocalData } from '../offline/db.js';
import { discardOutboxOp, listOutbox, replayNow } from '../offline/sync.js';
import type { OutboxOp } from '../offline/outbox.js';

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function SettingsScreen() {
  const [baseUrl, setBaseUrl] = useState(() => getSettings().baseUrl);
  const [token, setToken] = useState(() => getSettings().token);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; msg: string }>({ state: 'idle', msg: '' });
  const sync = useSyncStatus();
  const online = useOnline();
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [showOps, setShowOps] = useState(false);

  useEffect(() => { void listOutbox().then(setOps); }, [sync.pending, sync.replaying]);

  const save = () => {
    saveSettings({ baseUrl, token });
    setSavedAt(Date.now());
    setTest({ state: 'idle', msg: '' });
  };

  const runTest = async () => {
    saveSettings({ baseUrl, token });
    setTest({ state: 'running', msg: 'Checking /api/health…' });
    try {
      const h = await health();
      if (!h.ok) throw new Error('health returned ok=false');
      setTest({ state: 'running', msg: `Server up (v${h.version ?? '?'}). Checking auth…` });
      try {
        const m = await api.get<CurrentMesocycle>('/mesocycles/current');
        setTest({ state: 'ok', msg: `Connected · v${h.version ?? '?'} · active block "${m.mesocycle.name}"${m.week_number !== null ? ` week ${m.week_number}` : ''}` });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setTest({ state: 'ok', msg: `Connected · v${h.version ?? '?'} · no active mesocycle` });
        else throw e;
      }
    } catch (e) {
      const msg = e instanceof ApiError
        ? (e.status === 401 ? 'Server reachable but the token was rejected (401).' : e.status === 403 ? 'Token is read-only (403) — logging needs the write token.' : `${e.status} ${e.message}`)
        : e instanceof Error ? `Cannot reach the API: ${e.message}` : String(e);
      setTest({ state: 'fail', msg });
    }
  };

  return (
    <div className="screen">
      <h2 className="h2">API</h2>
      <Field label="Base URL" hint="blank = same origin">
        <input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={baseUrl} placeholder="https://omega.example.com" onChange={(e) => setBaseUrl(e.target.value)} />
      </Field>
      <Field label="Token" hint="write token for logging">
        <input type="password" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={token} placeholder="OMEGA_TOKEN_WRITE" onChange={(e) => setToken(e.target.value)} />
      </Field>
      <div className="row">
        <button type="button" className="btn" onClick={save}>Save</button>
        <button type="button" className="btn" disabled={test.state === 'running'} onClick={() => void runTest()}>Test connection</button>
        {savedAt && <span className="muted small">saved</span>}
      </div>
      {test.state !== 'idle' && <div className={`notice ${test.state === 'ok' ? 'notice-green' : test.state === 'fail' ? 'notice-red' : ''}`}>{test.msg}</div>}

      <h2 className="h2">Sync</h2>
      <div className="card">
        <div className="row"><span>Network</span><span className={online ? 'ok-text' : 'pain-text'}>{online ? 'online' : 'offline'}</span></div>
        <div className="row"><span>Queued changes</span><span>{sync.pending}{sync.replaying ? ' (sending…)' : ''}</span></div>
        <div className="row"><span>Last synced</span><span className="muted small">{sync.last_synced_at ? new Date(sync.last_synced_at).toLocaleString() : '—'}</span></div>
        {sync.last_error && <div className="row"><span>Last error</span><span className="pain-text small">{sync.last_error}</span></div>}
        {sync.rejected && (
          <div className="notice notice-red">
            <div>The server rejected a change ({sync.rejected.method} {sync.rejected.path}). Everything behind it is waiting.</div>
            <div className="small muted">{sync.rejected.last_error}</div>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => void replayNow()}>Retry</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => { if (window.confirm('Discard this change? It will not reach the server.')) void discardOutboxOp(sync.rejected!.op_id); }}>Discard it</button>
            </div>
          </div>
        )}
        <div className="row">
          <button type="button" className="btn btn-sm" disabled={sync.replaying || sync.pending === 0} onClick={() => void replayNow()}>Retry now</button>
          {ops.length > 0 && <button type="button" className="btn btn-sm" onClick={() => setShowOps((s) => !s)}>{showOps ? 'Hide' : 'Show'} queue</button>}
        </div>
        {showOps && ops.map((o) => (
          <div key={o.op_id} className="small muted op-row">{o.method} {o.path} · {new Date(o.created_at).toLocaleTimeString()}{o.attempts ? ` · ${o.attempts} attempts` : ''}{o.last_error ? ` · ${o.last_error}` : ''}</div>
        ))}
      </div>

      <h2 className="h2">Install</h2>
      <div className="card small">
        {isStandalone() ? <div className="ok-text">Installed — running as an app.</div> : isIos() ? (
          <ol className="install-steps">
            <li>Open this page in <strong>Safari</strong> (not an in-app browser).</li>
            <li>Tap <strong>Share</strong> (the square with an arrow).</li>
            <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
            <li>Launch <strong>Omega</strong> from the home screen; it works offline and syncs when connected.</li>
          </ol>
        ) : <div className="muted">On iPhone: open in Safari → Share → Add to Home Screen. On Android/desktop Chrome use the browser's Install option.</div>}
      </div>

      <h2 className="h2">Local data</h2>
      <button type="button" className="btn btn-sm btn-danger" onClick={() => { if (window.confirm('Clear the local cache and any unsent changes?')) void clearAllLocalData().then(() => window.location.reload()); }}>Clear local data</button>
      <div className="bottom-space" />
    </div>
  );
}
