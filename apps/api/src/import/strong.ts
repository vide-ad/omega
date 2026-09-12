/**
 * Strong CSV importer. Spec: docs/STRONG-IMPORT.md. Three stages, kept apart so the middle one can be
 * tested and printed without a database:
 *
 *   parseStrongCsv   text            -> rows, read by column name, failing loudly on an unknown header
 *   planImport       rows + library  -> everything that would be written, and everything skipped with a reason
 *   applyImport      plan + db       -> the writes, in one transaction, idempotent on a re-run
 *
 * `--dry-run` stops after the plan and prints it. Run it first, always.
 */
import { createHash } from 'node:crypto';
import type { CardioSession, Equipment, Exercise, SetLog, Workout, WorkoutExercise } from '@omega/core';
import type { Db } from '../db/connection.js';
import * as repo from '../db/repos/index.js';
import { defaultSlot, loadConstraintContext, refreshProgressionState } from '../services/prescription.js';
import { STRONG_CARDIO, STRONG_TO_OMEGA } from './strong-mapping.js';

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** The columns the importer reads. Strong has shipped several layouts, so these are matched by name. */
const REQUIRED = ['Date', 'Workout Name', 'Exercise Name', 'Set Order', 'Weight', 'Reps'] as const;
const OPTIONAL = ['Duration', 'Workout Duration', 'Distance', 'Seconds', 'RPE', 'Notes', 'Workout Notes'] as const;

export interface StrongRow {
  line: number;                 // 1-based line in the file, for messages
  date: string;                 // "2026-08-31 10:14:02" as written
  workout_name: string;         // trimmed
  duration: string | null;      // "1h 20m", "58m", or null
  exercise_name: string;        // trimmed
  set_order: string;            // "1", "W", "D", "F" as written
  weight: number;
  reps: number;
  distance: number;
  seconds: number;
  rpe: number | null;
}

export class StrongParseError extends Error {
  constructor(message: string) { super(message); this.name = 'StrongParseError'; }
}

/** RFC 4180 style: quoted fields, doubled quotes inside them, LF or CRLF line endings. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function num(v: string | undefined, fallback = 0): number {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function parseStrongCsv(text: string): StrongRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const headerLine = lines.findIndex((l) => l.trim() !== '');
  if (headerLine === -1) throw new StrongParseError('The file is empty.');
  const header = splitCsvLine(lines[headerLine]!).map((h) => h.trim());
  const known = new Set<string>([...REQUIRED, ...OPTIONAL]);
  const unknown = header.filter((h) => !known.has(h));
  if (unknown.length) throw new StrongParseError(`Unknown column${unknown.length > 1 ? 's' : ''} in the header: ${unknown.join(', ')}. This importer reads by column name and will not guess.`);
  const missing = REQUIRED.filter((h) => !header.includes(h));
  if (missing.length) throw new StrongParseError(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  const col = (name: string) => header.indexOf(name);
  const c = {
    date: col('Date'), workout: col('Workout Name'), duration: header.includes('Duration') ? col('Duration') : col('Workout Duration'),
    exercise: col('Exercise Name'), order: col('Set Order'), weight: col('Weight'), reps: col('Reps'),
    distance: col('Distance'), seconds: col('Seconds'), rpe: col('RPE'),
  };
  const rows: StrongRow[] = [];
  for (let i = headerLine + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;
    const f = splitCsvLine(raw);
    const date = (f[c.date] ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date)) throw new StrongParseError(`Line ${i + 1}: Date "${date}" is not YYYY-MM-DD HH:MM:SS.`);
    const rpeRaw = c.rpe >= 0 ? (f[c.rpe] ?? '').trim() : '';
    rows.push({
      line: i + 1,
      date,
      workout_name: (f[c.workout] ?? '').trim(),
      duration: c.duration >= 0 && (f[c.duration] ?? '').trim() !== '' ? (f[c.duration] ?? '').trim() : null,
      exercise_name: (f[c.exercise] ?? '').trim(),
      set_order: (f[c.order] ?? '').trim(),
      weight: num(f[c.weight]),
      reps: num(f[c.reps]),
      distance: c.distance >= 0 ? num(f[c.distance]) : 0,
      seconds: c.seconds >= 0 ? num(f[c.seconds]) : 0,
      rpe: rpeRaw === '' ? null : num(rpeRaw, NaN),
    });
  }
  return rows;
}

/** "1h 36m" or "58m" or "2h" to seconds. Anything else is null and the session gets no duration. */
export function parseDurationSeconds(s: string | null): number | null {
  if (!s) return null;
  const m = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/.exec(s.trim());
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

/** Strong writes local wall clock time with no zone. Treated as UTC, which keeps the date it shows. */
export function toIso(strongDate: string): string {
  return `${strongDate.replace(' ', 'T')}.000Z`;
}

export function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** Deterministic, UUID shaped, so a re-run writes the same ids and a duplicate row collapses. */
export function stableId(...parts: Array<string | number>): string {
  const h = createHash('sha1').update(parts.join(' ')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface PlannedSet {
  id: string;
  set_index: number;
  is_warmup: boolean;
  weight_kg: number;
  reps: number;
  rir: number | null;
  rir_observed: boolean;
  strong_set_order: string;     // for the report
}

export interface PlannedExercise {
  omega_exercise_id: string;
  omega_name: string;
  strong_name: string;
  auto_created: boolean;
  sets: PlannedSet[];
}

export interface PlannedSession {
  id: string;
  started_at: string;
  completed_at: string;
  date: string;
  workout_name: string;
  exercises: PlannedExercise[];
}

export interface PlannedCardio {
  id: string;
  date: string;
  type: CardioSession['type'];
  duration_minutes: number;
  distance_km: number | null;
  strong_name: string;
}

export interface NewExercise {
  exercise: Exercise;
  strong_name: string;
  set_count: number;
  last_seen: string;
}

export interface SkippedRow { line: number; reason: string }

export interface MappingUsed { strong_name: string; omega_name: string; set_count: number; last_seen: string }

export interface ImportPlan {
  sessions: PlannedSession[];
  cardio: PlannedCardio[];
  new_exercises: NewExercise[];
  mappings_used: MappingUsed[];
  skipped: SkippedRow[];
  duplicates_collapsed: number;
  counts: { rows: number; sessions: number; sets: number; warmups: number; effort_values: number; cardio: number };
}

export interface PlanOptions {
  /** The library as it stands. Matched on exact name for mapped Strong names. */
  exercises: readonly Exercise[];
  /** Extra Strong name to Omega name mappings, layered over the checked-in table. */
  extraMapping?: Readonly<Record<string, string>>;
  /** Clock for created_at on auto-created exercises. */
  now: () => Date;
}

function equipmentFromStrongName(name: string): Equipment {
  const m = /\(([^)]+)\)\s*$/.exec(name);
  const e = (m?.[1] ?? '').toLowerCase();
  if (e.includes('barbell')) return 'barbell';
  if (e.includes('dumbbell')) return 'dumbbell';
  if (e.includes('cable')) return 'cable';
  if (e.includes('machine') || e.includes('smith')) return 'machine';
  if (e.includes('bodyweight') || e.includes('assisted')) return 'bodyweight';
  return 'other';
}

/** Weight is added load on these; 0 is not "no weight". See STRONG-IMPORT point 4. */
function looksBodyweight(rows: readonly StrongRow[]): boolean {
  const working = rows.filter((r) => r.reps > 0);
  return working.length > 0 && working.every((r) => r.weight === 0);
}

/** Strong RPE out of ten to reps in reserve, and it is an observation: a human typed it. */
export function rirFromRpe(rpe: number): number {
  return Math.max(0, Math.min(10, Math.round(10 - rpe)));
}

export function planImport(rows: readonly StrongRow[], o: PlanOptions): ImportPlan {
  const mapping: Record<string, string> = { ...STRONG_TO_OMEGA, ...(o.extraMapping ?? {}) };
  const byName = new Map(o.exercises.map((e) => [e.name, e] as const));
  const skipped: SkippedRow[] = [];
  const created = new Map<string, NewExercise>();
  const mappingsUsed = new Map<string, MappingUsed>();
  const cardio: PlannedCardio[] = [];
  let duplicates = 0, warmups = 0, efforts = 0, setCount = 0;

  // Sessions key on the full timestamp, never the date alone: twelve days hold two sessions.
  const sessions = new Map<string, { started_at: string; duration: string | null; workout_name: string; rows: StrongRow[] }>();
  for (const r of rows) {
    if (r.exercise_name === '') { skipped.push({ line: r.line, reason: 'no exercise name' }); continue; }
    const cardioType = STRONG_CARDIO[r.exercise_name];
    if (cardioType !== undefined || (r.reps === 0 && (r.distance > 0 || r.seconds > 0))) {
      // Timed or distance work is not a strength set and never goes near set_logs.
      const type = cardioType ?? 'other';
      const minutes = r.seconds > 0 ? Math.max(1, Math.round(r.seconds / 60)) : null;
      if (minutes === null) { skipped.push({ line: r.line, reason: `${r.exercise_name}: cardio row with no seconds, nothing to record` }); continue; }
      cardio.push({
        id: stableId('cardio', r.date, r.exercise_name, r.set_order, r.distance, r.seconds),
        date: r.date.slice(0, 10), type, duration_minutes: minutes,
        distance_km: r.distance > 0 ? Math.round(r.distance) / 1000 : null,   // Strong writes metres
        strong_name: r.exercise_name,
      });
      continue;
    }
    if (r.reps === 0) { skipped.push({ line: r.line, reason: `${r.exercise_name}: zero reps and no distance or time` }); continue; }
    if (r.rpe !== null && !Number.isFinite(r.rpe)) { skipped.push({ line: r.line, reason: `${r.exercise_name}: RPE is not a number` }); continue; }
    const key = r.date;
    const s = sessions.get(key) ?? { started_at: toIso(r.date), duration: r.duration, workout_name: r.workout_name, rows: [] };
    s.rows.push(r);
    sessions.set(key, s);
  }

  const planned: PlannedSession[] = [];
  for (const [ts, s] of [...sessions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const durationSeconds = parseDurationSeconds(s.duration);
    const session: PlannedSession = {
      id: stableId('workout', ts),
      started_at: s.started_at,
      // No duration means the session ends when it started. The date is what the engine keys on.
      completed_at: addSeconds(s.started_at, durationSeconds ?? 0),
      date: ts.slice(0, 10),
      workout_name: s.workout_name,
      exercises: [],
    };
    // Exercises in order of first appearance, sets in file order, exact duplicate rows collapsed.
    const byExercise = new Map<string, StrongRow[]>();
    for (const r of s.rows) byExercise.set(r.exercise_name, [...(byExercise.get(r.exercise_name) ?? []), r]);
    for (const [strongName, exRows] of byExercise) {
      const omegaName = mapping[strongName];
      let exercise = omegaName ? byName.get(omegaName) : undefined;
      let autoCreated = false;
      if (omegaName && !exercise) {
        skipped.push(...exRows.map((r) => ({ line: r.line, reason: `${strongName} maps to "${omegaName}", which is not in the library` })));
        continue;
      }
      if (!exercise) {
        // An unmapped name becomes an archived library entry carrying the Strong name, so the history
        // imports and nothing is lost. It has no muscle credits, so it counts for nothing on the volume
        // dashboard, and the cues say so where David will read them.
        const existing = created.get(strongName);
        if (existing) exercise = existing.exercise;
        else {
          const eq = equipmentFromStrongName(strongName);
          exercise = {
            id: stableId('exercise', strongName),
            name: strongName,
            aliases: [],
            equipment: eq,
            movement_pattern: 'other',
            is_unilateral: false,
            lengthened_bias: false,
            default_rep_low: 8,
            default_rep_high: 12,
            default_rir_target: 2,
            default_rest_seconds: 120,
            weight_increment_kg: eq === 'dumbbell' ? 2 : 2.5,
            uses_bodyweight: false,
            demo_video_url: null,
            cues: 'Imported from Strong. It has no muscle credits yet, so it does not count toward weekly volume until someone adds them.',
            archived: true,
            created_at: o.now().toISOString(),
          };
          created.set(strongName, { exercise, strong_name: strongName, set_count: 0, last_seen: ts });
        }
        autoCreated = true;
      } else {
        const mu = mappingsUsed.get(strongName) ?? { strong_name: strongName, omega_name: exercise.name, set_count: 0, last_seen: ts };
        mu.last_seen = ts > mu.last_seen ? ts : mu.last_seen;
        mappingsUsed.set(strongName, mu);
      }
      const seen = new Set<string>();
      const sets: PlannedSet[] = [];
      for (const r of exRows) {
        const id = stableId('set', ts, strongName, r.set_order, r.weight, r.reps, r.distance, r.seconds);
        if (seen.has(id)) { duplicates++; continue; }
        seen.add(id);
        const isWarmup = r.set_order.toUpperCase() === 'W';
        const hasEffort = r.rpe !== null;
        if (isWarmup) warmups++;
        if (hasEffort) efforts++;
        sets.push({
          id, set_index: sets.length + 1, is_warmup: isWarmup, weight_kg: r.weight, reps: r.reps,
          // Nine years with three effort values. A row without one is not an assumption, it is nothing,
          // and it says so: rir null and rir_observed false. See STRONG-IMPORT point 2.
          rir: hasEffort ? rirFromRpe(r.rpe as number) : null,
          rir_observed: hasEffort,
          strong_set_order: r.set_order,
        });
      }
      if (autoCreated) {
        const ne = created.get(strongName)!;
        ne.set_count += sets.length;
        ne.last_seen = ts > ne.last_seen ? ts : ne.last_seen;
        if (!ne.exercise.uses_bodyweight && looksBodyweight(exRows)) ne.exercise.uses_bodyweight = true;
      } else {
        mappingsUsed.get(strongName)!.set_count += sets.length;
      }
      setCount += sets.length;
      session.exercises.push({ omega_exercise_id: exercise.id, omega_name: exercise.name, strong_name: strongName, auto_created: autoCreated, sets });
    }
    if (session.exercises.length) planned.push(session);
  }

  return {
    sessions: planned,
    cardio,
    new_exercises: [...created.values()].sort((a, b) => b.set_count - a.set_count),
    mappings_used: [...mappingsUsed.values()].sort((a, b) => b.set_count - a.set_count),
    skipped,
    duplicates_collapsed: duplicates,
    counts: { rows: rows.length, sessions: planned.length, sets: setCount, warmups, effort_values: efforts, cardio: cardio.length },
  };
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

export interface ApplyResult {
  sessions_written: number;
  sessions_already_present: number;
  sets_written: number;
  cardio_written: number;
  exercises_created: number;
  progression_refreshed: number;
}

/**
 * Writes the plan. Idempotent: a session whose id already exists is left alone, so a re-run on the same
 * file changes nothing. Then refreshes the progression cache for every exercise touched, after clearing
 * any seeded starting load on it, so stage C1 reads the real last session rather than a transcribed guess.
 */
export function applyImport(db: Db, plan: ImportPlan, now: () => Date): ApplyResult {
  const result: ApplyResult = { sessions_written: 0, sessions_already_present: 0, sets_written: 0, cardio_written: 0, exercises_created: 0, progression_refreshed: 0 };
  const touched = new Set<string>();
  db.transaction(() => {
    for (const ne of plan.new_exercises) {
      if (!repo.getExercise(db, ne.exercise.id)) { repo.insertExercise(db, ne.exercise); result.exercises_created++; }
    }
    for (const s of plan.sessions) {
      for (const e of s.exercises) touched.add(e.omega_exercise_id);
      if (repo.getWorkout(db, s.id)) { result.sessions_already_present++; continue; }
      const workout: Workout = {
        id: s.id, template_id: null, template_version: null, mesocycle_id: null, week_number: null,
        date: s.date, started_at: s.started_at, completed_at: s.completed_at, readiness_id: null,
        session_rpe: null, notes: `Imported from Strong. Workout name: ${s.workout_name}.`, is_compromised: false,
      };
      repo.insertWorkout(db, workout);
      s.exercises.forEach((e, i) => {
        const ex = repo.getExercise(db, e.omega_exercise_id)!;
        const working = e.sets.filter((x) => !x.is_warmup);
        // An imported row never went through the engine: reason null, like an ad-hoc exercise.
        const we: WorkoutExercise = {
          id: stableId('we', s.id, e.omega_exercise_id), workout_id: s.id, exercise_id: e.omega_exercise_id, order: i + 1,
          target_sets: Math.max(1, working.length), target_rep_low: ex.default_rep_low, target_rep_high: ex.default_rep_high,
          target_rir: ex.default_rir_target, suggested_weight_kg: null, rest_seconds: ex.default_rest_seconds, notes: null,
          target_reps_by_set: null, target_tempo: null, constraint_max_weight_kg: null, last_set_amrap: false,
          reason: null, rationale: null, flags: [], constraint_notes: [], based_on_workout_id: null, is_compromised: false,
        };
        repo.insertWorkoutExercise(db, we);
        for (const ps of e.sets) {
          const set: SetLog = {
            id: ps.id, workout_exercise_id: we.id, set_index: ps.set_index, side: 'bilateral', is_warmup: ps.is_warmup, is_amrap: false,
            weight_kg: ps.weight_kg, reps: ps.reps, rir: ps.rir, rir_observed: ps.rir_observed, tempo: null, rest_taken_seconds: null,
            pain_severity: 'none', pain_note: null, media_id: null, completed_at: s.completed_at,
          };
          repo.insertSet(db, set);
          result.sets_written++;
        }
      });
      result.sessions_written++;
    }
    for (const c of plan.cardio) {
      if (repo.getCardio(db, c.id)) continue;
      const row: CardioSession = {
        id: c.id, date: c.date, type: c.type, sub_type: null, duration_minutes: c.duration_minutes, distance_km: c.distance_km,
        avg_hr: null, max_hr: null, zone_minutes: null, perceived_effort: null, source: 'import', notes: `Imported from Strong: ${c.strong_name}.`,
      };
      repo.insertCardio(db, row);
      result.cardio_written++;
    }
    // Issue 12. A seeded starting load would win over the imported history in stage C1, so it goes
    // before the cache is rebuilt from what he actually lifted.
    const cc = loadConstraintContext(db);
    const todayDate = now().toISOString().slice(0, 10);
    for (const id of touched) {
      const ex = repo.getExercise(db, id);
      if (!ex) continue;
      repo.deleteState(db, id);
      refreshProgressionState(db, ex, repo.latestTemplateExerciseFor(db, id) ?? defaultSlot(ex), null, todayDate, cc);
      result.progression_refreshed++;
    }
  });
  return result;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function formatPlan(plan: ImportPlan): string {
  const L: string[] = [];
  const c = plan.counts;
  L.push(`${c.rows} rows read. ${c.sessions} sessions, ${c.sets} sets (${c.warmups} warmups), ${c.effort_values} with an effort value, ${c.cardio} cardio rows.`);
  if (plan.duplicates_collapsed) L.push(`${plan.duplicates_collapsed} exact duplicate row${plan.duplicates_collapsed === 1 ? '' : 's'} collapsed.`);
  if (plan.sessions.length) L.push(`Dates ${plan.sessions[0]!.date} to ${plan.sessions[plan.sessions.length - 1]!.date}.`);
  L.push('');
  L.push(`Mappings used (${plan.mappings_used.length}). Check every line. A wrong one merges two histories.`);
  for (const m of plan.mappings_used) L.push(`  ${m.strong_name.padEnd(36)} to ${m.omega_name.padEnd(34)} ${String(m.set_count).padStart(5)} sets, last ${m.last_seen.slice(0, 10)}`);
  L.push('');
  L.push(`Unmapped names (${plan.new_exercises.length}). Each becomes an archived exercise with no muscle credits.`);
  for (const n of plan.new_exercises) L.push(`  ${n.strong_name.padEnd(36)}    ${String(n.set_count).padStart(5)} sets, last ${n.last_seen.slice(0, 10)}${n.exercise.uses_bodyweight ? ', bodyweight' : ''}`);
  const latest = plan.sessions.at(-1)?.date.slice(0, 4);
  if (latest && plan.new_exercises.some((n) => n.last_seen.slice(0, 4) === latest)) {
    L.push('  A name last seen in the most recent year probably belongs to a seeded exercise. Map it with --map before a real run.');
  }
  L.push('');
  L.push(`Skipped rows (${plan.skipped.length}).`);
  for (const s of plan.skipped) L.push(`  line ${String(s.line).padStart(6)}  ${s.reason}`);
  return L.join('\n');
}
