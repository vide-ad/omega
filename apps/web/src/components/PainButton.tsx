import type { PainSeverity } from '@omega/core';
import { nextPain } from '../lib/session.js';

export const PAIN_LABEL: Record<PainSeverity, string> = { none: 'pain', niggle: 'niggle', moderate: 'moderate', stop: 'STOP' };

/** One tap per set, four states, colour coded (spec §7). */
export function PainButton(props: { value: PainSeverity; onChange: (p: PainSeverity) => void; compact?: boolean }) {
  return (
    <button
      type="button"
      className={`btn-pain pain-${props.value}`}
      aria-label={`Pain: ${PAIN_LABEL[props.value]} (tap to change)`}
      onClick={() => props.onChange(nextPain(props.value))}
    >
      {props.compact ? '●' : PAIN_LABEL[props.value]}
    </button>
  );
}
