/**
 * The core screen (spec §7). `readOnly` turns it into the history detail view.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkoutDetail, WorkoutPatch } from '@omega/core';
import { ExerciseCard } from '../components/ExerciseCard.js';
import { RestTimerBar } from '../components/RestTimerBar.js';
import { TopBar } from '../components/Nav.js';
import { ChipRow, ErrorBox, Pill, Spinner } from '../components/ui.js';
import { useCachedGet } from '../hooks/useCachedGet.js';
import { getTimer, startRest } from '../hooks/useRestTimer.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { formatDateShort } from '../lib/dates.js';
import { draftToSetCreate, draftToSetPatch, restTakenSeconds, rowId, sessionSummary, type RowKey, type SetDraft } from '../lib/session.js';
import { uuid } from '../lib/uuid.js';
import { cacheKeys } from '../offline/outbox.js';
import { enqueueMutation } from '../offline/sync.js';
import { navigate } from '../router.js';

const RPE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ value: v }));

export function SessionScreen(props: { id: string; readOnly: boolean }) {
  const key = cacheKeys.workout(props.id);
  const q = useCachedGet<WorkoutDetail>(key, `/workouts/${props.id}`);
  const d = q.data;
  const completed = !!d?.workout.completed_at;
  const readOnly = props.readOnly || completed;
  useWakeLock(!readOnly && d !== undefined);

  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [extra, setExtra] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string>('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [notesDirty, setNotesDirty] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (!d || notesDirty) return;
    setNotes(d.workout.notes ?? '');
    setRpe(d.workout.session_rpe);
  }, [d, notesDirty]);

  // Record started_at the first time the session is opened (once per mount).
  const startedSent = useRef(false);
  useEffect(() => {
    if (!d || readOnly || d.workout.started_at || startedSent.current) return;
    startedSent.current = true;
    void enqueueMutation({ method: 'PATCH', path: `/workouts/${d.workout.id}`, body: { started_at: new Date().toISOString() } satisfies WorkoutPatch });
  }, [d, readOnly]);

  // Drafts are keyed `<workout_exercise_id>:<set_index>:<side>` so two exercises never share a row draft.
  const onDraft = useCallback((weId: string, row: RowKey, draft: SetDraft) => {
    setDrafts((ds) => ({ ...ds, [`${weId}:${rowId(row)}`]: draft }));
  }, []);

  const logSet = useCallback(async (weId: string, row: RowKey, draft: SetDraft): Promise<string | null> => {
    if (!d) return 'Session not loaded';
    const ex = d.exercises.find((e) => e.workout_exercise.id === weId);
    if (!ex) return 'Exercise not found';
    const nowIso = new Date().toISOString();
    const timer = getTimer();
    const rest = timer ? Math.max(0, Math.round((Date.now() - timer.started_at) / 1000)) : restTakenSeconds(d, nowIso);
    const r = draftToSetCreate(ex, row, draft, { id: uuid(), completed_at: nowIso, rest_taken_seconds: rest });
    if (!r.ok) return r.error;
    setBusy(true);
    try {
      await enqueueMutation({ method: 'POST', path: `/workouts/${d.workout.id}/sets`, body: r.value });
      setDrafts((ds) => { const { [`${weId}:${rowId(row)}`]: _gone, ...rest2 } = ds; void _gone; return rest2; });
      startRest(ex.workout_exercise.rest_seconds, ex.exercise.name);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setBusy(false);
    }
  }, [d]);

  const patchSet = useCallback(async (weId: string, setId: string, draft: SetDraft): Promise<string | null> => {
    if (!d) return 'Session not loaded';
    const ex = d.exercises.find((e) => e.workout_exercise.id === weId);
    if (!ex) return 'Exercise not found';
    const r = draftToSetPatch(ex, draft);
    if (!r.ok) return r.error;
    setBusy(true);
    try {
      await enqueueMutation({ method: 'PATCH', path: `/sets/${setId}`, body: r.value });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setBusy(false);
    }
  }, [d]);

  const deleteSet = useCallback(async (setId: string) => {
    await enqueueMutation({ method: 'DELETE', path: `/sets/${setId}` });
  }, []);

  const saveNotes = useCallback(async () => {
    if (!d) return;
    await enqueueMutation({ method: 'PATCH', path: `/workouts/${d.workout.id}`, body: { notes: notes.trim() || null, session_rpe: rpe } satisfies WorkoutPatch });
    setNotesDirty(false);
  }, [d, notes, rpe]);

  const finish = useCallback(async () => {
    if (!d) return;
    const s = sessionSummary(d);
    if (s.sets_logged === 0 && !window.confirm('No sets logged. Finish anyway?')) return;
    setFinishError(null);
    try {
      await enqueueMutation({
        method: 'PATCH',
        path: `/workouts/${d.workout.id}`,
        body: { completed_at: new Date().toISOString(), notes: notes.trim() || null, session_rpe: rpe } satisfies WorkoutPatch,
      });
      setNotesDirty(false);
      setShowSummary(true);
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : String(e));
    }
  }, [d, notes, rpe]);

  const summary = useMemo(() => (d ? sessionSummary(d) : null), [d]);

  if (!d) {
    return (
      <>
        <TopBar title="Session" back={props.readOnly ? '/history' : '/'} />
        <div className="screen">
          {q.loading ? <Spinner label="Loading session…" /> : q.error ? <ErrorBox error={q.error} onRetry={() => void q.reload()}>Could not load this workout.</ErrorBox> : <div className="muted">Not found.</div>}
        </div>
      </>
    );
  }

  const title = d.template_name ?? 'Session';
  return (
    <>
      <TopBar
        title={<span>{title}<span className="muted small"> · {formatDateShort(d.workout.date)}</span></span>}
        back={props.readOnly ? '/history' : '/'}
        fromCache={q.fromCache}
      />
      <div className={`screen ${readOnly ? '' : 'screen-session'}`}>
        <div className="session-meta">
          {d.workout.week_number !== null && <Pill>Week {d.workout.week_number}</Pill>}
          {d.workout.is_compromised && <Pill tone="amber" title="Readiness or deload made this session non-qualifying for progression">compromised</Pill>}
          {completed && <Pill tone="green">completed</Pill>}
          {summary && <span className="muted small">{summary.sets_logged} sets · {summary.hard_sets} hard</span>}
        </div>

        {(showSummary || (completed && !props.readOnly)) && summary && (
          <div className="card card-accent summary">
            <div className="card-title">Session complete</div>
            <div className="summary-grid">
              <div><strong>{summary.sets_logged}</strong><span className="muted small">sets logged</span></div>
              <div><strong>{summary.hard_sets}</strong><span className="muted small">hard sets</span></div>
              <div><strong>{summary.exercises_touched}/{summary.exercises_total}</strong><span className="muted small">exercises</span></div>
              {summary.pain_flags > 0 && <div><strong className="pain-text">{summary.pain_flags}</strong><span className="muted small">pain flags</span></div>}
            </div>
            <button type="button" className="btn btn-big" onClick={() => navigate('/')}>Home</button>
          </div>
        )}

        {d.exercises.slice().sort((a, b) => a.workout_exercise.order - b.workout_exercise.order).map((ex) => {
          const weId = ex.workout_exercise.id;
          const exDrafts: Record<string, SetDraft> = {};
          for (const [k, v] of Object.entries(drafts)) if (k.startsWith(`${weId}:`)) exDrafts[k.slice(weId.length + 1)] = v;
          return (
            <ExerciseCard
              key={weId}
              ex={ex}
              extraRows={extra[weId] ?? 0}
              onExtraRows={(n) => setExtra((e) => ({ ...e, [weId]: n }))}
              drafts={exDrafts}
              onDraft={(row, draft) => onDraft(weId, row, draft)}
              onLog={(row, draft) => logSet(weId, row, draft)}
              onPatch={(setId, draft) => patchSet(weId, setId, draft)}
              onDelete={deleteSet}
              readOnly={readOnly}
              busy={busy}
            />
          );
        })}

        {d.omitted.length > 0 && (
          <section className="omitted">
            <h3 className="h3 muted">Excluded by injury constraint</h3>
            {d.omitted.map((o) => (
              <div key={o.exercise.id} className="omitted-row">
                <span>{o.exercise.name}</span>
                <span className="muted small">{o.prescription.rationale}</span>
                {o.prescription.constraint_notes.map((n, i) => <span key={i} className="muted small">⚠ {n}</span>)}
              </div>
            ))}
          </section>
        )}

        <section className="session-notes">
          <label className="field">
            <span className="field-label">Session notes</span>
            <textarea value={notes} rows={2} readOnly={readOnly} placeholder="How did it go?" onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }} />
          </label>
          <div className="field">
            <span className="field-label">Session RPE (1–10)</span>
            <ChipRow options={RPE_OPTIONS} value={rpe} onChange={(v) => { setRpe(v); setNotesDirty(true); }} disabled={readOnly} ariaLabel="Session RPE" />
          </div>
          {!readOnly && notesDirty && <button type="button" className="btn btn-sm" onClick={() => void saveNotes()}>Save notes</button>}
        </section>

        {!readOnly && (
          <div className="finish">
            {finishError && <div className="notice notice-red">{finishError}</div>}
            <button type="button" className="btn btn-big btn-primary" onClick={() => void finish()}>Finish session</button>
          </div>
        )}
        <div className="bottom-space" />
      </div>
      {!readOnly && <RestTimerBar />}
    </>
  );
}
