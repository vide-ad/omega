import { useEffect } from 'react';
import type { Paginated, WorkoutListItem } from '@omega/core';
import { Card, ErrorBox, Pill, Spinner } from '../components/ui.js';
import { useCachedGet } from '../hooks/useCachedGet.js';
import { formatDateShort } from '../lib/dates.js';
import { cacheKeys } from '../offline/outbox.js';
import { navigate } from '../router.js';

export function HistoryScreen(props: { setFromCache: (b: boolean) => void }) {
  const q = useCachedGet<Paginated<WorkoutListItem>>(cacheKeys.workoutsHistory, '/workouts?limit=60');
  const { setFromCache } = props;
  useEffect(() => { setFromCache(q.fromCache); }, [q.fromCache, setFromCache]);
  const items = q.data?.items ?? [];
  return (
    <div className="screen">
      {q.loading && q.data === undefined && <Spinner />}
      {q.error && q.data === undefined && <ErrorBox error={q.error} onRetry={() => void q.reload()}>Could not load history.</ErrorBox>}
      {q.data && items.length === 0 && <div className="muted">No workouts yet.</div>}
      {items.map((w) => (
        <Card key={w.id} onClick={() => navigate(w.completed_at ? `/workout/${w.id}` : `/session/${w.id}`)}>
          <div className="history-row">
            <div>
              <div className="card-title">{w.template_name ?? 'Ad-hoc session'}</div>
              <div className="muted small">{formatDateShort(w.date)}{w.week_number !== null ? ` · week ${w.week_number}` : ''} · {w.set_count} sets · {w.exercise_count} exercises</div>
            </div>
            <div className="history-pills">
              {!w.completed_at && <Pill tone="blue">in progress</Pill>}
              {w.is_compromised && <Pill tone="amber">compromised</Pill>}
              {w.session_rpe !== null && <Pill>RPE {w.session_rpe}</Pill>}
            </div>
          </div>
        </Card>
      ))}
      <div className="bottom-space" />
    </div>
  );
}
