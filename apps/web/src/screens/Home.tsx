import { useEffect, useState } from 'react';
import type { CurrentMesocycle, Paginated, ReadinessResponse, TemplateWithExercises, VolumeResponse, WorkoutDetail, WorkoutListItem } from '@omega/core';
import { api, isNetworkError } from '../api/client.js';
import { VolumeBar } from '../components/VolumeBar.js';
import { Card, ErrorBox, Pill, Spinner } from '../components/ui.js';
import { useCachedGet } from '../hooks/useCachedGet.js';
import { formatDateLong, today } from '../lib/dates.js';
import { uuid } from '../lib/uuid.js';
import { writeCache } from '../offline/cache.js';
import { cacheKeys } from '../offline/outbox.js';
import { navigate } from '../router.js';

export function HomeScreen(props: { setFromCache: (b: boolean) => void }) {
  const date = today();
  const meso = useCachedGet<CurrentMesocycle | null>(cacheKeys.currentMesocycle, '/mesocycles/current', { notFoundAsNull: true });
  const templates = useCachedGet<{ items: TemplateWithExercises[] }>(cacheKeys.templates, '/templates?archived=false');
  const todays = useCachedGet<Paginated<WorkoutListItem>>(cacheKeys.workoutsRange(date, date), `/workouts?from=${date}&to=${date}`);
  const readiness = useCachedGet<ReadinessResponse>(`readiness:day:${date}`, `/readiness?from=${date}&to=${date}`);
  const volume = useCachedGet<VolumeResponse>(cacheKeys.volume(1), '/volume?weeks=1');
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const anyCache = meso.fromCache || templates.fromCache || todays.fromCache || readiness.fromCache || volume.fromCache;
  // Report to the shell so the top bar can show the offline pill.
  const { setFromCache } = props;
  useEffect(() => { setFromCache(anyCache); }, [anyCache, setFromCache]);

  const inProgress = (todays.data?.items ?? []).filter((w) => !w.completed_at);
  const doneToday = (todays.data?.items ?? []).filter((w) => !!w.completed_at);
  const readyToday = readiness.data?.items.find((r) => r.date === date) ?? null;
  const week = volume.data?.weeks[volume.data.weeks.length - 1];
  const priority = week ? week.muscles.filter((m) => m.min_sets !== null).sort((a, b) => (b.max_sets ?? 0) - (a.max_sets ?? 0)).slice(0, 6) : [];

  const start = async (t: TemplateWithExercises) => {
    setStarting(t.id);
    setStartError(null);
    try {
      const detail = await api.post<WorkoutDetail>('/workouts', { id: uuid(), template_id: t.id, date });
      await writeCache(cacheKeys.workout(detail.workout.id), detail);
      navigate(`/session/${detail.workout.id}`);
    } catch (e) {
      setStartError(isNetworkError(e)
        ? 'Starting a session needs a connection (the server runs the progression engine). Resume an existing session or try again when online.'
        : e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="screen">
      <div className="home-date">
        <div className="home-today">{formatDateLong(date)}</div>
        {meso.loading && meso.data === undefined ? <Spinner /> : meso.data ? (
          <div className="home-meso">
            <span>{meso.data.mesocycle.name}</span>
            {meso.data.week_number !== null ? <Pill tone={meso.data.is_deload ? 'amber' : 'green'}>Week {meso.data.week_number}{meso.data.is_deload ? ' · deload' : ''}</Pill> : <Pill>outside block</Pill>}
            {meso.data.week && !meso.data.is_deload && <span className="muted small">RIR {meso.data.week.rir_target_low}–{meso.data.week.rir_target_high} · +{meso.data.week.set_delta} sets</span>}
          </div>
        ) : meso.error ? <ErrorBox error={meso.error} onRetry={() => void meso.reload()}>Could not load the mesocycle.</ErrorBox> : <div className="muted">No active mesocycle.</div>}
      </div>

      {inProgress.map((w) => (
        <Card key={w.id} className="card-accent" onClick={() => navigate(`/session/${w.id}`)}>
          <div className="card-title">Resume {w.template_name ?? 'session'}</div>
          <div className="muted small">{w.set_count} sets logged · in progress</div>
        </Card>
      ))}

      <Card onClick={() => navigate('/readiness')} className={readyToday ? '' : 'card-attention'}>
        <div className="card-title">Morning readiness</div>
        {readyToday ? (
          <div className="muted small">
            Logged{readyToday.bodyweight_kg !== null ? ` · ${readyToday.bodyweight_kg} kg` : ''}{readyToday.resting_hr !== null ? ` · RHR ${readyToday.resting_hr}` : ''}{readyToday.sleep_hours !== null ? ` · ${readyToday.sleep_hours} h sleep` : ''}{readyToday.manual_compromised ? ' · rough day' : ''}
          </div>
        ) : <div className="muted small">Not logged today — 20 seconds, tap to fill in.</div>}
      </Card>

      <h2 className="h2">Start a session</h2>
      {startError && <div className="notice notice-red">{startError}</div>}
      {templates.loading && templates.data === undefined ? <Spinner /> : templates.error && !templates.data ? (
        <ErrorBox error={templates.error} onRetry={() => void templates.reload()}>Could not load templates.</ErrorBox>
      ) : (
        <div className="template-list">
          {(templates.data?.items ?? []).slice().sort((a, b) => a.order - b.order).map((t) => (
            <button key={t.id} type="button" className="btn btn-big btn-template" disabled={starting !== null} onClick={() => void start(t)}>
              <span className="btn-template-name">{t.name}</span>
              <span className="muted small">{t.day_label ?? ''}{t.day_label ? ' · ' : ''}{t.exercises.length} exercises{doneToday.some((w) => w.template_id === t.id) ? ' · done today' : ''}</span>
              {starting === t.id && <span className="muted small">starting…</span>}
            </button>
          ))}
        </div>
      )}

      <h2 className="h2">This week <button type="button" className="link" onClick={() => navigate('/volume')}>all muscles ›</button></h2>
      {week ? (
        <div className="volume-strip">
          {priority.map((m) => <VolumeBar key={m.muscle_group_key} m={m} compact />)}
        </div>
      ) : volume.loading ? <Spinner /> : <div className="muted small">No volume data.</div>}
    </div>
  );
}
