/** Spec §7: the 20-second morning form. Upserts today's readiness log. */
import { useEffect, useMemo, useState } from 'react';
import type { MuscleGroupKey, ReadinessResponse, ReadinessUpsert } from '@omega/core';
import { MUSCLE_GROUPS } from '@omega/core';
import { ChipRow, ErrorBox, Field, Spinner } from '../components/ui.js';
import { useCachedGet } from '../hooks/useCachedGet.js';
import { formatDateLong, today } from '../lib/dates.js';
import { uuid } from '../lib/uuid.js';
import { cacheKeys } from '../offline/outbox.js';
import { enqueueMutation } from '../offline/sync.js';
import { navigate } from '../router.js';

const FIVE = [1, 2, 3, 4, 5].map((v) => ({ value: v }));
const NAME = new Map(MUSCLE_GROUPS.map((m) => [m.key, m.display_name]));

interface Form {
  bodyweight_kg: string;
  resting_hr: string;
  sleep_hours: string;
  sleep_quality: number | null;
  stress: number | null;
  motivation: number | null;
  manual_compromised: boolean;
  notes: string;
  soreness: Partial<Record<MuscleGroupKey, number>>;
}

const EMPTY: Form = { bodyweight_kg: '', resting_hr: '', sleep_hours: '', sleep_quality: null, stress: null, motivation: null, manual_compromised: false, notes: '', soreness: {} };

function num(text: string, integer = false): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return integer ? Math.round(n) : Math.round(n * 100) / 100;
}

export function ReadinessScreen(props: { setFromCache: (b: boolean) => void }) {
  const date = today();
  const q = useCachedGet<ReadinessResponse>(cacheKeys.readiness, '/readiness');
  const existing = q.data?.items.find((r) => r.date === date) ?? null;
  const [form, setForm] = useState<Form>(EMPTY);
  const [seeded, setSeeded] = useState(false);
  const [extraMuscles, setExtraMuscles] = useState<MuscleGroupKey[]>([]);
  const [picker, setPicker] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setFromCache } = props;
  useEffect(() => { setFromCache(q.fromCache); }, [q.fromCache, setFromCache]);

  useEffect(() => {
    if (seeded || q.data === undefined) return;
    setSeeded(true);
    if (!existing) return;
    const soreness: Form['soreness'] = {};
    for (const s of existing.soreness) soreness[s.muscle_group_key] = s.rating;
    setForm({
      bodyweight_kg: existing.bodyweight_kg === null ? '' : String(existing.bodyweight_kg),
      resting_hr: existing.resting_hr === null ? '' : String(existing.resting_hr),
      sleep_hours: existing.sleep_hours === null ? '' : String(existing.sleep_hours),
      sleep_quality: existing.sleep_quality,
      stress: existing.stress,
      motivation: existing.motivation,
      manual_compromised: existing.manual_compromised,
      notes: existing.notes ?? '',
      soreness,
    });
    setExtraMuscles(existing.soreness.map((s) => s.muscle_group_key).filter((k) => !(q.data?.recently_trained ?? []).includes(k)));
  }, [seeded, q.data, existing]);

  const muscles = useMemo(() => {
    const base = q.data?.recently_trained ?? [];
    return [...base, ...extraMuscles.filter((k) => !base.includes(k))];
  }, [q.data, extraMuscles]);
  const remaining = MUSCLE_GROUPS.filter((m) => !muscles.includes(m.key));

  const up = (patch: Partial<Form>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); };
  const setSore = (k: MuscleGroupKey, rating: number) => up({ soreness: { ...form.soreness, [k]: form.soreness[k] === rating ? undefined : rating } });

  const save = async () => {
    setError(null);
    const body: ReadinessUpsert & { id: string } = {
      id: existing?.id ?? uuid(),
      date,
      bodyweight_kg: num(form.bodyweight_kg),
      resting_hr: num(form.resting_hr, true),
      sleep_hours: num(form.sleep_hours),
      sleep_quality: form.sleep_quality,
      stress: form.stress,
      motivation: form.motivation,
      manual_compromised: form.manual_compromised,
      notes: form.notes.trim() || null,
      soreness: (Object.entries(form.soreness) as Array<[MuscleGroupKey, number | undefined]>)
        .filter((e): e is [MuscleGroupKey, number] => typeof e[1] === 'number')
        .map(([muscle_group_key, rating]) => ({ muscle_group_key, rating })),
    };
    try {
      await enqueueMutation({ method: 'POST', path: '/readiness', body });
      setSaved(true);
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="screen">
      <div className="muted">{formatDateLong(date)}{existing ? ' · already logged, editing' : ''}</div>
      {q.loading && q.data === undefined && <Spinner />}
      {q.error && q.data === undefined && <ErrorBox error={q.error} onRetry={() => void q.reload()}>Could not load readiness. You can still save; it will sync later.</ErrorBox>}

      <div className="readiness-grid">
        <Field label="Bodyweight" hint="kg">
          <input type="text" inputMode="decimal" value={form.bodyweight_kg} placeholder={q.data?.rolling.bodyweight_median_30d?.toString() ?? 'kg'} onChange={(e) => up({ bodyweight_kg: e.target.value })} />
        </Field>
        <Field label="Resting HR" hint="bpm">
          <input type="text" inputMode="numeric" value={form.resting_hr} placeholder={q.data?.rolling.rhr_median_30d?.toString() ?? 'bpm'} onChange={(e) => up({ resting_hr: e.target.value })} />
        </Field>
        <Field label="Sleep" hint="hours">
          <input type="text" inputMode="decimal" value={form.sleep_hours} placeholder="7.5" onChange={(e) => up({ sleep_hours: e.target.value })} />
        </Field>
      </div>

      <div className="field"><span className="field-label">Sleep quality</span><ChipRow options={FIVE} value={form.sleep_quality} onChange={(v) => up({ sleep_quality: v })} ariaLabel="Sleep quality" /></div>
      <div className="field"><span className="field-label">Stress</span><ChipRow options={FIVE} value={form.stress} onChange={(v) => up({ stress: v })} ariaLabel="Stress" /></div>
      <div className="field"><span className="field-label">Motivation</span><ChipRow options={FIVE} value={form.motivation} onChange={(v) => up({ motivation: v })} ariaLabel="Motivation" /></div>

      <button type="button" className={`btn btn-toggle-row ${form.manual_compromised ? 'btn-toggle-on' : ''}`} aria-pressed={form.manual_compromised} onClick={() => up({ manual_compromised: !form.manual_compromised })}>
        <span>Rough day</span>
        <span className="muted small">marks today's session as compromised — progression ignores it</span>
      </button>

      <h2 className="h2">Soreness <span className="muted small">muscles trained in the last 48 h</span></h2>
      {muscles.length === 0 && <div className="muted small">Nothing trained recently.</div>}
      {muscles.map((k) => (
        <div key={k} className="field field-row">
          <span className="field-label">{NAME.get(k) ?? k}</span>
          <ChipRow options={FIVE} value={form.soreness[k] ?? null} onChange={(v) => setSore(k, v)} size="sm" ariaLabel={`${NAME.get(k)} soreness`} />
        </div>
      ))}
      {picker ? (
        <div className="picker">
          {remaining.map((m) => (
            <button key={m.key} type="button" className="chip" onClick={() => { setExtraMuscles((x) => [...x, m.key]); setPicker(false); }}>{m.display_name}</button>
          ))}
          <button type="button" className="chip" onClick={() => setPicker(false)}>cancel</button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setPicker(true)}>+ Add muscle</button>
      )}

      <Field label="Notes">
        <input type="text" value={form.notes} placeholder="optional" onChange={(e) => up({ notes: e.target.value })} />
      </Field>

      {error && <div className="notice notice-red">{error}</div>}
      <button type="button" className="btn btn-big btn-primary" onClick={() => void save()}>{saved ? 'Saved ✓' : 'Save'}</button>
      <div className="bottom-space" />
    </div>
  );
}
