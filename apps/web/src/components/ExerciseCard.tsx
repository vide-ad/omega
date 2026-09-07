import { useState } from 'react';
import type { Exercise, Prescription, WorkoutExerciseDetail } from '@omega/core';
import { fmtKg, fmtPrevious, fmtTarget } from '../lib/format.js';
import { canRemoveLastRow, defaultDraft, draftFromSet, loggedSet, rowId, rowsFor, type RowKey, type SetDraft } from '../lib/session.js';
import { Collapsible, Pill } from './ui.js';
import { LoggedSetRow, SetRow } from './SetRow.js';

const REASON_LABEL: Record<Prescription['reason'], string> = {
  first_time: 'first time — set a starting load',
  requires_clearance: 'needs physio clearance',
  blocked: 'blocked',
  deload: 'deload',
  progress_load: 'load ↑',
  consolidate: 'consolidate',
  progress_reps: 'reps ↑',
  regress_load: 'load ↓',
  repeat_after_compromised: 'repeat (last session compromised)',
};

const FLAG_LABEL: Record<Prescription['flags'][number], string> = {
  constrained: 'constrained',
  unloadable: 'unloadable',
  stall_review: 'stall review',
};

export interface ExerciseCardProps {
  ex: WorkoutExerciseDetail;
  extraRows: number;
  onExtraRows: (n: number) => void;
  drafts: Record<string, SetDraft>;
  onDraft: (row: RowKey, d: SetDraft) => void;
  onLog: (row: RowKey, d: SetDraft) => Promise<string | null>;
  onPatch: (setId: string, d: SetDraft) => Promise<string | null>;
  onDelete: (setId: string) => Promise<void>;
  readOnly: boolean;
  busy: boolean;
}

function unitFor(ex: Exercise): string {
  return ex.uses_bodyweight ? '+kg' : 'kg';
}

export function ExerciseCard(p: ExerciseCardProps) {
  const { ex } = p;
  const we = ex.workout_exercise;
  const reason = we.reason ?? ex.prescription?.reason ?? null;
  const rationale = we.rationale ?? ex.prescription?.rationale ?? null;
  const flags = we.flags.length ? we.flags : (ex.prescription?.flags ?? []);
  const notes = we.constraint_notes.length ? we.constraint_notes : (ex.prescription?.constraint_notes ?? []);
  const tempo = we.target_tempo ?? ex.prescription?.target_tempo ?? null;
  const lastAmrap = we.last_set_amrap || (ex.prescription?.last_set_amrap ?? false);
  const rows = rowsFor(ex, p.extraRows);
  const [editing, setEditing] = useState<string | null>(null);   // set id being edited
  const [editDraft, setEditDraft] = useState<SetDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const prev = fmtPrevious(ex.previous, ex.exercise.is_unilateral);
  const unit = unitFor(ex.exercise);
  const logged = ex.sets.length;
  const attention = reason === 'requires_clearance' || reason === 'first_time';

  const draftFor = (row: RowKey): SetDraft => p.drafts[rowId(row)] ?? defaultDraft(ex, row);

  const submit = async (row: RowKey) => {
    const err = await p.onLog(row, draftFor(row));
    setErrors((e) => ({ ...e, [rowId(row)]: err }));
  };
  const savePatch = async (setId: string) => {
    if (!editDraft) return;
    const err = await p.onPatch(setId, editDraft);
    if (err) setErrors((e) => ({ ...e, [setId]: err }));
    else { setEditing(null); setEditDraft(null); setErrors((e) => ({ ...e, [setId]: null })); }
  };

  return (
    <section className={`exercise ${attention ? 'exercise-attention' : ''}`} aria-labelledby={`ex-${we.id}`}>
      <header className="exercise-head">
        <div className="exercise-title-row">
          <h2 id={`ex-${we.id}`} className="exercise-name">{ex.exercise.name}</h2>
          <span className="muted small">{logged}/{rows.length}</span>
        </div>
        <div className="exercise-target">
          <span>{fmtTarget(ex)}</span>
          {tempo && <span className="tag tag-tempo" title="Required tempo (eccentric-pause-concentric-pause)">tempo {tempo}</span>}
          {lastAmrap && <span className="tag" title="Last set as many reps as possible">last set AMRAP</span>}
          {ex.exercise.is_unilateral && <span className="tag">per side</span>}
        </div>
        <div className="exercise-suggest">
          <span className={`suggest-weight ${we.suggested_weight_kg === null ? 'muted' : ''}`}>
            {we.suggested_weight_kg === null ? 'No load suggested' : `Suggested ${fmtKg(we.suggested_weight_kg)}`}
          </span>
          {reason && (
            <Pill tone={reason === 'requires_clearance' ? 'red' : reason === 'first_time' ? 'amber' : reason === 'progress_load' ? 'green' : reason === 'regress_load' ? 'amber' : 'neutral'}>
              {REASON_LABEL[reason]}
            </Pill>
          )}
          {flags.map((f) => (
            <Pill key={f} tone={f === 'stall_review' ? 'red' : f === 'constrained' ? 'amber' : 'blue'}>{FLAG_LABEL[f]}</Pill>
          ))}
        </div>
        {reason === 'requires_clearance' && (
          <div className="notice notice-red">Held pending physio clearance — no load prescribed. Log sets only if cleared.</div>
        )}
        {reason === 'first_time' && (
          <div className="notice notice-amber">No qualifying history — enter your starting load in the first set; the next session builds on it.</div>
        )}
        {notes.length > 0 && (
          <ul className="constraint-notes">
            {notes.map((n, i) => <li key={i}>⚠ {n}</li>)}
          </ul>
        )}
        {rationale && (
          <Collapsible title="Why this prescription" className="rationale">
            <p className="small">{rationale}</p>
            {we.based_on_workout_id && <p className="small muted">Based on workout {we.based_on_workout_id.slice(0, 8)}…</p>}
          </Collapsible>
        )}
        {prev && <div className="exercise-prev muted">{prev}{ex.previous ? ` · ${ex.previous.date}` : ''}</div>}
        {ex.exercise.cues && <Collapsible title="Cues" className="rationale"><p className="small">{ex.exercise.cues}</p></Collapsible>}
        {we.notes && <div className="small muted">{we.notes}</div>}
      </header>

      <div className="sets">
        {rows.map((row) => {
          const s = loggedSet(ex, row);
          const id = rowId(row);
          if (s) {
            if (!p.readOnly && editing === s.id && editDraft) {
              return (
                <SetRow
                  key={id}
                  row={row}
                  draft={editDraft}
                  onChange={setEditDraft}
                  onSubmit={() => { void savePatch(s.id); }}
                  onDelete={() => { if (window.confirm('Delete this set?')) { void p.onDelete(s.id).then(() => { setEditing(null); setEditDraft(null); }); } }}
                  onCancel={() => { setEditing(null); setEditDraft(null); }}
                  mode="edit"
                  busy={p.busy}
                  error={errors[s.id] ?? null}
                  showAmrap
                  unit={unit}
                />
              );
            }
            return <LoggedSetRow key={id} row={row} set={s} unit={unit} onTap={p.readOnly ? undefined : () => { setEditing(s.id); setEditDraft(draftFromSet(s)); }} />;
          }
          if (p.readOnly) return <div key={id} className="logged logged-empty muted"><span className="setrow-idx">{row.side === 'bilateral' ? row.set_index : `${row.set_index}${row.side === 'left' ? 'L' : 'R'}`}</span>not logged</div>;
          return (
            <SetRow
              key={id}
              row={row}
              draft={draftFor(row)}
              onChange={(d) => p.onDraft(row, d)}
              onSubmit={() => { void submit(row); }}
              mode="log"
              busy={p.busy}
              error={errors[id] ?? null}
              showAmrap={lastAmrap && row.set_index === we.target_sets}
              unit={unit}
            />
          );
        })}
      </div>

      {!p.readOnly && (
        <div className="exercise-actions">
          <button type="button" className="btn btn-sm" onClick={() => p.onExtraRows(p.extraRows + 1)}>+ Add set</button>
          <button type="button" className="btn btn-sm" disabled={!canRemoveLastRow(ex, p.extraRows)} onClick={() => p.onExtraRows(p.extraRows - 1)}>− Remove last</button>
          <span className="grow" />
          <span className="muted small">rest {Math.round(we.rest_seconds)}s</span>
        </div>
      )}
    </section>
  );
}
