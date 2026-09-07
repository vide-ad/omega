import type { MuscleWeekVolume } from '@omega/core';
import { MUSCLE_GROUPS } from '@omega/core';
import { fmtNum } from '../lib/format.js';

const NAME = new Map(MUSCLE_GROUPS.map((m) => [m.key, m.display_name]));

/** Bar with min/max markers; colour by status (under=amber, in_range=green, over=red, no_target=grey). */
export function VolumeBar(props: { m: MuscleWeekVolume; compact?: boolean }) {
  const { m } = props;
  const max = m.max_sets ?? null;
  // Scale so the max target sits at ~75% of the bar, leaving room to show "over".
  const scale = max && max > 0 ? max / 0.75 : Math.max(m.sets, 1) / 0.75;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const range = m.min_sets === null || max === null ? '—' : `${m.min_sets}–${max}`;
  return (
    <div className={`vol ${props.compact ? 'vol-compact' : ''} vol-${m.status}`}>
      <div className="vol-head">
        <span className="vol-name">{NAME.get(m.muscle_group_key) ?? m.muscle_group_key}</span>
        <span className="vol-num"><strong>{fmtNum(m.sets)}</strong><span className="muted"> / {range}</span></span>
      </div>
      <div className="vol-track" aria-hidden="true">
        <div className="vol-fill" style={{ width: pct(m.sets) }} />
        {m.min_sets !== null && <div className="vol-mark" style={{ left: pct(m.min_sets) }} />}
        {max !== null && <div className="vol-mark vol-mark-max" style={{ left: pct(max) }} />}
      </div>
    </div>
  );
}
