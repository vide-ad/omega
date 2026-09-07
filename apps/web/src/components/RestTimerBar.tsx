import { extendRest, skipRest, useRestTimer } from '../hooks/useRestTimer.js';
import { fmtClock } from '../lib/format.js';
import { isFinished, progress, remainingSeconds } from '../lib/timer.js';

/** Fixed bottom bar: mm:ss countdown computed from `ends_at`, +30s, skip. */
export function RestTimerBar() {
  const { timer, now } = useRestTimer();
  if (!timer) return null;
  const done = isFinished(timer, now);
  const remaining = remainingSeconds(timer, now);
  return (
    <div className={`timerbar ${done ? 'timerbar-done' : ''}`} role="timer" aria-live={done ? 'assertive' : 'off'}>
      <div className="timerbar-progress" style={{ width: `${progress(timer, now) * 100}%` }} />
      <div className="timerbar-row">
        <div className="timerbar-main">
          <span className="timerbar-clock">{done ? 'GO' : fmtClock(remaining)}</span>
          <span className="timerbar-label muted">{done ? `rest over${timer.label ? ` · ${timer.label}` : ''}` : (timer.label ?? 'rest')}</span>
        </div>
        <button type="button" className="btn" onClick={() => extendRest(30)}>+30s</button>
        <button type="button" className="btn" onClick={skipRest}>{done ? 'OK' : 'Skip'}</button>
      </div>
    </div>
  );
}
