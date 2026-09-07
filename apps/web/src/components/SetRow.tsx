import type { SetLog } from '@omega/core';
import type { RowKey, SetDraft } from '../lib/session.js';
import { fmtNum } from '../lib/format.js';
import { PainButton } from './PainButton.js';
import { RirChips, RirNudge } from './RirControl.js';

function rowLabel(row: RowKey): string {
  return row.side === 'bilateral' ? String(row.set_index) : `${row.set_index}${row.side === 'left' ? 'L' : 'R'}`;
}

export interface SetRowProps {
  row: RowKey;
  draft: SetDraft;
  onChange: (d: SetDraft) => void;
  onSubmit: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  mode: 'log' | 'edit';
  busy?: boolean;
  error?: string | null;
  showAmrap: boolean;
  unit: string;
}

/** Editable row: weight, reps, one-tap RIR, pain, warmup, AMRAP, and the big ✓. */
export function SetRow(p: SetRowProps) {
  const d = p.draft;
  const up = (patch: Partial<SetDraft>) => p.onChange({ ...d, ...patch });
  const toggleAmrap = () => up(d.is_amrap ? { is_amrap: false } : { is_amrap: true, rir: 0, is_warmup: false });
  const toggleWarmup = () => up(d.is_warmup ? { is_warmup: false } : { is_warmup: true, is_amrap: false });
  return (
    <div className={`setrow ${p.mode === 'edit' ? 'setrow-edit' : ''} ${d.is_warmup ? 'setrow-warmup' : ''}`}>
      <div className="setrow-line">
        <span className="setrow-idx" aria-label={`Set ${rowLabel(p.row)}`}>{rowLabel(p.row)}</span>
        <label className="setrow-input">
          <input
            type="text"
            inputMode="decimal"
            enterKeyHint="next"
            value={d.weight_kg}
            placeholder="kg"
            aria-label="Weight in kg"
            onChange={(e) => up({ weight_kg: e.target.value })}
            onFocus={(e) => e.target.select()}
          />
          <span className="setrow-unit">{p.unit}</span>
        </label>
        <span className="setrow-x">×</span>
        <label className="setrow-input setrow-input-reps">
          <input
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            value={d.reps}
            placeholder="reps"
            aria-label="Reps"
            onChange={(e) => up({ reps: e.target.value.replace(/[^\d]/g, '') })}
            onFocus={(e) => e.target.select()}
          />
          <span className="setrow-unit">reps</span>
        </label>
        <button type="button" className="btn-log" disabled={p.busy} onClick={p.onSubmit} aria-label={p.mode === 'edit' ? 'Save set' : 'Log set'}>
          {p.mode === 'edit' ? 'Save' : '✓'}
        </button>
      </div>
      <div className="setrow-line setrow-line2">
        <RirChips value={d.rir} onChange={(rir) => up({ rir })} disabled={d.is_amrap} />
      </div>
      <div className="setrow-line setrow-line3">
        <RirNudge value={d.rir} onChange={(rir) => up({ rir })} disabled={d.is_amrap} />
        <PainButton value={d.pain_severity} onChange={(pain_severity) => up({ pain_severity })} />
        <button type="button" className={`btn-toggle ${d.is_warmup ? 'btn-toggle-on' : ''}`} aria-pressed={d.is_warmup} onClick={toggleWarmup} title="Warm-up set (excluded from volume and progression)">W</button>
        {(p.showAmrap || d.is_amrap) && (
          <button type="button" className={`btn-toggle ${d.is_amrap ? 'btn-toggle-on btn-toggle-amrap' : ''}`} aria-pressed={d.is_amrap} onClick={toggleAmrap} title="AMRAP — as many reps as possible (RIR 0)">AMRAP</button>
        )}
        {!p.showAmrap && !d.is_amrap && (
          <button type="button" className="btn-toggle btn-toggle-ghost" onClick={toggleAmrap} title="Make this an AMRAP set">A</button>
        )}
        <span className="grow" />
        {p.mode === 'edit' && p.onDelete && <button type="button" className="btn btn-sm btn-danger" onClick={p.onDelete}>Delete</button>}
        {p.mode === 'edit' && p.onCancel && <button type="button" className="btn btn-sm" onClick={p.onCancel}>Cancel</button>}
      </div>
      {d.pain_severity !== 'none' && (
        <div className="setrow-line">
          <input
            type="text"
            className={`pain-note pain-note-${d.pain_severity}`}
            value={d.pain_note}
            placeholder="Where / what? (optional)"
            aria-label="Pain note"
            onChange={(e) => up({ pain_note: e.target.value })}
          />
        </div>
      )}
      {p.error && <div className="setrow-error" role="alert">{p.error}</div>}
    </div>
  );
}

/** A logged set, compact. Tap to edit (unless read-only). */
export function LoggedSetRow(props: { row: RowKey; set: SetLog; onTap?: () => void; unit: string }) {
  const s = props.set;
  const body = (
    <>
      <span className="setrow-idx">{rowLabel(props.row)}</span>
      <span className="logged-main">
        <strong>{fmtNum(s.weight_kg)}</strong> <span className="muted">{props.unit}</span> × <strong>{s.reps}</strong>
        {s.is_amrap ? <span className="muted"> AMRAP</span> : s.rir === null ? <span className="muted"> RIR —</span> : <span className="muted"> @ RIR {fmtNum(s.rir)}</span>}
        {s.tempo && <span className="muted small"> {s.tempo}</span>}
      </span>
      {s.is_warmup && <span className="tag">W</span>}
      {s.pain_severity !== 'none' && <span className={`tag tag-pain pain-${s.pain_severity}`} title={s.pain_note ?? undefined}>{s.pain_severity === 'stop' ? 'STOP' : s.pain_severity}</span>}
      <span className="logged-check" aria-hidden="true">✓</span>
    </>
  );
  if (!props.onTap) return <div className="logged">{body}</div>;
  return <button type="button" className="logged logged-tap" onClick={props.onTap} aria-label={`Edit set ${rowLabel(props.row)}`}>{body}</button>;
}
