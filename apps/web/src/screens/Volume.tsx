import { useEffect, useMemo, useState } from 'react';
import type { VolumeResponse, WeekVolume } from '@omega/core';
import { VolumeBar } from '../components/VolumeBar.js';
import { ErrorBox, Spinner } from '../components/ui.js';
import { useCachedGet } from '../hooks/useCachedGet.js';
import { formatDateShort } from '../lib/dates.js';
import { cacheKeys } from '../offline/outbox.js';

export function weekTitle(w: WeekVolume): string {
  const range = `${formatDateShort(w.start)} – ${formatDateShort(w.end)}`;
  return w.mesocycle_week !== null ? `Week ${w.mesocycle_week} · ${range}` : range;
}

export function VolumeScreen(props: { setFromCache: (b: boolean) => void }) {
  const q = useCachedGet<VolumeResponse>(cacheKeys.volume(4), '/volume?weeks=4');
  const weeks = useMemo(() => q.data?.weeks ?? [], [q.data]);
  const [selected, setSelected] = useState<string | null>(null);
  const { setFromCache } = props;
  useEffect(() => { setFromCache(q.fromCache); }, [q.fromCache, setFromCache]);
  useEffect(() => {
    if (weeks.length && (selected === null || !weeks.some((w) => w.key === selected))) setSelected(weeks[weeks.length - 1]?.key ?? null);
  }, [weeks, selected]);
  const week = weeks.find((w) => w.key === selected) ?? null;

  const ordered = useMemo(() => {
    if (!week) return [];
    const rank = { over: 0, under: 1, in_range: 2, no_target: 3 } as const;
    return week.muscles.slice().sort((a, b) => rank[a.status] - rank[b.status] || (b.max_sets ?? 0) - (a.max_sets ?? 0) || b.sets - a.sets);
  }, [week]);
  const withTarget = ordered.filter((m) => m.status !== 'no_target');
  const noTarget = ordered.filter((m) => m.status === 'no_target' && m.sets > 0);

  return (
    <div className="screen">
      {q.loading && q.data === undefined && <Spinner />}
      {q.error && q.data === undefined && <ErrorBox error={q.error} onRetry={() => void q.reload()}>Could not load volume.</ErrorBox>}
      {weeks.length > 0 && (
        <div className="week-select" role="tablist">
          {weeks.map((w) => (
            <button key={w.key} type="button" role="tab" aria-selected={w.key === selected} className={`chip ${w.key === selected ? 'chip-on' : ''}`} onClick={() => setSelected(w.key)}>
              {w.mesocycle_week !== null ? `Wk ${w.mesocycle_week}` : formatDateShort(w.start).slice(4)}{w.partial ? ' •' : ''}
            </button>
          ))}
        </div>
      )}
      {week && (
        <>
          <div className="week-title">{weekTitle(week)}{week.partial && <span className="muted small"> · in progress</span>}</div>
          <div className="legend muted small"><span className="lg lg-under">under</span><span className="lg lg-in_range">in range</span><span className="lg lg-over">over</span><span className="lg lg-no_target">no target</span></div>
          <div className="volume-list">
            {withTarget.map((m) => <VolumeBar key={m.muscle_group_key} m={m} />)}
          </div>
          {noTarget.length > 0 && (
            <>
              <h3 className="h3 muted">No target</h3>
              <div className="volume-list">{noTarget.map((m) => <VolumeBar key={m.muscle_group_key} m={m} />)}</div>
            </>
          )}
        </>
      )}
      <div className="bottom-space" />
    </div>
  );
}
