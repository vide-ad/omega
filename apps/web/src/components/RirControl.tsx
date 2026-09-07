import { ChipRow } from './ui.js';

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5].map((v) => ({ value: v }));

export function clampRir(v: number): number {
  return Math.max(0, Math.min(10, v));
}

/** Spec §7: RIR is one tap — chips 0–5 with the target pre-selected. AMRAP pins it to 0. */
export function RirChips(props: { value: number | null; onChange: (v: number) => void; disabled?: boolean }) {
  const v = props.value;
  return (
    <div className={`rir ${props.disabled ? 'rir-off' : ''}`}>
      <span className="rir-label">RIR</span>
      <ChipRow options={RIR_OPTIONS} value={v !== null && v <= 5 ? v : null} onChange={props.onChange} disabled={props.disabled} size="sm" ariaLabel="Reps in reserve" />
      {v !== null && v > 5 && <span className="chip chip-on" aria-label={`RIR ${v}`}>{v}</span>}
    </div>
  );
}

/** −/+ nudges for the RIR value (kept off the chip line so the chips stay thumb-sized on a 375px screen). */
export function RirNudge(props: { value: number | null; onChange: (v: number) => void; disabled?: boolean }) {
  const v = props.value;
  const nudge = (d: number) => props.onChange(clampRir((v ?? 0) + d));
  return (
    <div className="rir-nudge" aria-label="Adjust RIR">
      <button type="button" className="btn-nudge" aria-label="RIR minus one" disabled={props.disabled || v === null || v <= 0} onClick={() => nudge(-1)}>−</button>
      <span className="rir-nudge-val">{props.disabled ? '0' : v === null ? '—' : v}</span>
      <button type="button" className="btn-nudge" aria-label="RIR plus one" disabled={props.disabled || (v ?? 0) >= 10} onClick={() => nudge(1)}>+</button>
    </div>
  );
}
