import { useState, type ReactNode } from 'react';

export interface ChipOption<T extends string | number> { value: T; label?: string }

/** One-tap chip row (RIR, 1–5 ratings, week selector). Never a modal. */
export function ChipRow<T extends string | number>(props: {
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  return (
    <div className={`chips ${props.size === 'sm' ? 'chips-sm' : ''}`} role="radiogroup" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          className={`chip ${props.value === o.value ? 'chip-on' : ''}`}
          disabled={props.disabled}
          onClick={() => props.onChange(o.value)}
        >
          {o.label ?? String(o.value)}
        </button>
      ))}
    </div>
  );
}

export function Collapsible(props: { title: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  const [open, setOpen] = useState(props.open ?? false);
  return (
    <div className={`collapsible ${props.className ?? ''}`}>
      <button type="button" className="collapsible-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="collapsible-caret">{open ? '▾' : '▸'}</span>
        <span className="collapsible-title">{props.title}</span>
      </button>
      {open && <div className="collapsible-body">{props.children}</div>}
    </div>
  );
}

export function Pill(props: { tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue'; children: ReactNode; title?: string }) {
  return <span className={`pill pill-${props.tone ?? 'neutral'}`} title={props.title}>{props.children}</span>;
}

export function ErrorBox(props: { error: unknown; onRetry?: () => void; children?: ReactNode }) {
  const msg = props.error instanceof Error ? props.error.message : String(props.error);
  return (
    <div className="error-box" role="alert">
      <div>{props.children ?? 'Something went wrong.'}</div>
      <div className="muted small">{msg}</div>
      {props.onRetry && <button type="button" className="btn btn-sm" onClick={props.onRetry}>Retry</button>}
    </div>
  );
}

export function Spinner(props: { label?: string }) {
  return <div className="spinner muted" aria-busy="true">{props.label ?? 'Loading…'}</div>;
}

export function Card(props: { children: ReactNode; className?: string; onClick?: () => void; as?: 'div' | 'button' }) {
  if (props.as === 'button' || props.onClick) {
    return <button type="button" className={`card card-tap ${props.className ?? ''}`} onClick={props.onClick}>{props.children}</button>;
  }
  return <div className={`card ${props.className ?? ''}`}>{props.children}</div>;
}

export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}{props.hint && <span className="muted small"> {props.hint}</span>}</span>
      {props.children}
    </label>
  );
}
