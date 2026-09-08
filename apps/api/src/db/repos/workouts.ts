import type { Prescription, PrescriptionFlag, PrescriptionReason, SetLog, Workout, WorkoutExercise } from '@omega/core';
import type { Db, Row } from '../connection.js';
import { bool, json, jsonOrNull, num, numOrNull, str, strOrNull, toJson, omit } from '../mappers.js';

export function rowToWorkout(r: Row): Workout {
  return {
    id: str(r.id),
    template_id: strOrNull(r.template_id),
    template_version: numOrNull(r.template_version),
    mesocycle_id: strOrNull(r.mesocycle_id),
    week_number: numOrNull(r.week_number),
    date: str(r.date),
    started_at: strOrNull(r.started_at),
    completed_at: strOrNull(r.completed_at),
    readiness_id: strOrNull(r.readiness_id),
    session_rpe: numOrNull(r.session_rpe),
    notes: strOrNull(r.notes),
    is_compromised: bool(r.is_compromised),
  };
}

export function rowToWorkoutExercise(r: Row): WorkoutExercise {
  return {
    id: str(r.id),
    workout_id: str(r.workout_id),
    exercise_id: str(r.exercise_id),
    order: num(r.order),
    target_sets: num(r.target_sets),
    target_rep_low: num(r.target_rep_low),
    target_rep_high: num(r.target_rep_high),
    target_rir: num(r.target_rir),
    suggested_weight_kg: numOrNull(r.suggested_weight_kg),
    rest_seconds: num(r.rest_seconds),
    notes: strOrNull(r.notes),
    target_reps_by_set: jsonOrNull<number[]>(r.target_reps_by_set),
    target_tempo: strOrNull(r.target_tempo),
    last_set_amrap: bool(r.last_set_amrap),
    reason: strOrNull(r.reason) as PrescriptionReason | null,
    rationale: strOrNull(r.rationale),
    flags: json<PrescriptionFlag[]>(r.flags, []),
    constraint_notes: json<string[]>(r.constraint_notes, []),
    based_on_workout_id: strOrNull(r.based_on_workout_id),
    is_compromised: bool(r.is_compromised),
  };
}

/** The stored prescription as a standalone object, or null for ad-hoc rows that never went through the engine. */
export function prescriptionOf(we: WorkoutExercise): Prescription | null {
  if (we.reason === null) return null;
  return {
    exercise_id: we.exercise_id,
    suggested_weight_kg: we.suggested_weight_kg,
    target_sets: we.target_sets,
    target_rep_low: we.target_rep_low,
    target_rep_high: we.target_rep_high,
    target_rir: we.target_rir,
    target_reps_by_set: we.target_reps_by_set,
    target_tempo: we.target_tempo,
    last_set_amrap: we.last_set_amrap,
    reason: we.reason,
    rationale: we.rationale ?? '',
    flags: we.flags,
    constraint_notes: we.constraint_notes,
    based_on_workout_id: we.based_on_workout_id,
    omit: false,
  };
}

export function rowToSet(r: Row): SetLog {
  return {
    id: str(r.id),
    workout_exercise_id: str(r.workout_exercise_id),
    set_index: num(r.set_index),
    side: str(r.side) as SetLog['side'],
    is_warmup: bool(r.is_warmup),
    is_amrap: bool(r.is_amrap),
    weight_kg: num(r.weight_kg),
    reps: num(r.reps),
    rir: numOrNull(r.rir),
    rir_observed: bool(r.rir_observed),
    tempo: strOrNull(r.tempo),
    rest_taken_seconds: numOrNull(r.rest_taken_seconds),
    pain_severity: str(r.pain_severity) as SetLog['pain_severity'],
    pain_note: strOrNull(r.pain_note),
    media_id: strOrNull(r.media_id),
    completed_at: str(r.completed_at),
  };
}

const W_COL_NAMES = ['id', 'template_id', 'template_version', 'mesocycle_id', 'week_number', 'date', 'started_at', 'completed_at', 'readiness_id', 'session_rpe', 'notes', 'is_compromised'] as const;
const WE_COL_NAMES = ['id', 'workout_id', 'exercise_id', 'order', 'target_sets', 'target_rep_low', 'target_rep_high', 'target_rir', 'suggested_weight_kg', 'rest_seconds', 'notes',
  'target_reps_by_set', 'target_tempo', 'last_set_amrap', 'reason', 'rationale', 'flags', 'constraint_notes', 'based_on_workout_id', 'is_compromised'] as const;
const SET_COL_NAMES = ['id', 'workout_exercise_id', 'set_index', 'side', 'is_warmup', 'is_amrap', 'weight_kg', 'reps', 'rir', 'rir_observed', 'tempo', 'rest_taken_seconds', 'pain_severity', 'pain_note', 'media_id', 'completed_at'] as const;

const q = (c: string) => (c === 'order' ? '"order"' : c);
const W_COLS = W_COL_NAMES.map(q).join(', ');
const WE_COLS = WE_COL_NAMES.map(q).join(', ');
const SET_COLS = SET_COL_NAMES.map(q).join(', ');

export function workoutCols(alias: string): string {
  return W_COL_NAMES.map((c) => `${alias}.${q(c)}`).join(', ');
}
export function setCols(alias: string): string {
  return SET_COL_NAMES.map((c) => `${alias}.${q(c)}`).join(', ');
}

function bindWorkoutExercise(we: WorkoutExercise) {
  return { ...we, target_reps_by_set: toJson(we.target_reps_by_set), flags: JSON.stringify(we.flags), constraint_notes: JSON.stringify(we.constraint_notes) };
}

// --- workouts ---------------------------------------------------------------

export function getWorkout(db: Db, id: string): Workout | null {
  const r = db.get(`SELECT ${W_COLS} FROM workouts WHERE id = $id`, { id });
  return r ? rowToWorkout(r) : null;
}

export function insertWorkout(db: Db, w: Workout): void {
  db.run(`INSERT INTO workouts (${W_COLS}) VALUES (${W_COL_NAMES.map((c) => `$${c}`).join(', ')})`, { ...w });
}

export function updateWorkout(db: Db, w: Workout): void {
  db.run(`UPDATE workouts SET template_id = $template_id, template_version = $template_version, mesocycle_id = $mesocycle_id, week_number = $week_number,
    date = $date, started_at = $started_at, completed_at = $completed_at, readiness_id = $readiness_id, session_rpe = $session_rpe, notes = $notes,
    is_compromised = $is_compromised WHERE id = $id`, { ...w });
}

export function setWorkoutCompromised(db: Db, id: string, isCompromised: boolean): void {
  db.run('UPDATE workouts SET is_compromised = $c WHERE id = $id', { id, c: isCompromised });
}

export function deleteWorkout(db: Db, id: string): boolean {
  return db.run('DELETE FROM workouts WHERE id = $id', { id }).changes > 0;
}

export interface WorkoutListFilter {
  from?: string;
  to?: string;
  exercise_id?: string;
  limit: number;
  /** Exclusive upper bound on (date, id) — list is newest first. */
  before?: { date: string; id: string };
}

export interface WorkoutListRow extends Workout {
  template_name: string | null;
  exercise_count: number;
  set_count: number;
}

/** Newest first; returns up to `limit + 1` rows so the caller can detect a next page. */
export function listWorkouts(db: Db, f: WorkoutListFilter): WorkoutListRow[] {
  const where: string[] = [];
  const params: Record<string, string | number> = { limit: f.limit + 1 };
  if (f.from) { where.push('w.date >= $from'); params.from = f.from; }
  if (f.to) { where.push('w.date <= $to'); params.to = f.to; }
  if (f.exercise_id) { where.push('EXISTS (SELECT 1 FROM workout_exercises x WHERE x.workout_id = w.id AND x.exercise_id = $exercise_id)'); params.exercise_id = f.exercise_id; }
  if (f.before) { where.push('(w.date < $b_date OR (w.date = $b_date AND w.id < $b_id))'); params.b_date = f.before.date; params.b_id = f.before.id; }
  const rows = db.all(`SELECT ${workoutCols('w')},
      COALESCE(tv.name, t.name) AS template_name,
      (SELECT count(*) FROM workout_exercises x WHERE x.workout_id = w.id) AS exercise_count,
      (SELECT count(*) FROM set_logs s JOIN workout_exercises x ON x.id = s.workout_exercise_id WHERE x.workout_id = w.id) AS set_count
    FROM workouts w
    LEFT JOIN workout_templates t ON t.id = w.template_id
    LEFT JOIN template_versions tv ON tv.template_id = w.template_id AND tv.version = w.template_version
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY w.date DESC, w.id DESC LIMIT $limit`, params);
  return rows.map((r) => ({ ...rowToWorkout(r), template_name: strOrNull(r.template_name), exercise_count: num(r.exercise_count), set_count: num(r.set_count) }));
}

/** Workouts with `date` in [from, to] (inclusive), oldest first. */
export function listWorkoutsBetween(db: Db, from: string, to: string): Workout[] {
  return db.all(`SELECT ${W_COLS} FROM workouts WHERE date >= $from AND date <= $to ORDER BY date, id`, { from, to }).map(rowToWorkout);
}

export function listWorkoutsOnDate(db: Db, date: string): Workout[] {
  return db.all(`SELECT ${W_COLS} FROM workouts WHERE date = $date ORDER BY id`, { date }).map(rowToWorkout);
}

/** Points every workout on `date` at the readiness log `readinessId` (null unlinks). */
export function relinkReadiness(db: Db, date: string, readinessId: string | null): void {
  db.run('UPDATE workouts SET readiness_id = $rid WHERE date = $date', { rid: readinessId, date });
}

// --- workout exercises ------------------------------------------------------

export function getWorkoutExercise(db: Db, id: string): WorkoutExercise | null {
  const r = db.get(`SELECT ${WE_COLS} FROM workout_exercises WHERE id = $id`, { id });
  return r ? rowToWorkoutExercise(r) : null;
}

export function listWorkoutExercises(db: Db, workoutId: string): WorkoutExercise[] {
  return db.all(`SELECT ${WE_COLS} FROM workout_exercises WHERE workout_id = $id ORDER BY "order", id`, { id: workoutId }).map(rowToWorkoutExercise);
}

export function insertWorkoutExercise(db: Db, we: WorkoutExercise): void {
  db.run(`INSERT INTO workout_exercises (${WE_COLS}) VALUES (${WE_COL_NAMES.map((c) => `$${c}`).join(', ')})`, bindWorkoutExercise(we));
}

/** Sets cascade from the FK on set_logs.workout_exercise_id, so this removes the exercise's log too. */
export function deleteWorkoutExercise(db: Db, id: string): boolean {
  return db.run('DELETE FROM workout_exercises WHERE id = $id', { id }).changes > 0;
}

export function setWorkoutExerciseCompromised(db: Db, id: string, isCompromised: boolean): void {
  db.run('UPDATE workout_exercises SET is_compromised = $c WHERE id = $id', { id, c: isCompromised });
}

export function maxWorkoutExerciseOrder(db: Db, workoutId: string): number {
  return num(db.get<{ m: number | null }>('SELECT max("order") AS m FROM workout_exercises WHERE workout_id = $id', { id: workoutId })?.m ?? 0);
}

/** Exercise ids that appear in at least one workout (for the progression list). */
export function exerciseIdsWithHistory(db: Db): Set<string> {
  return new Set(db.all<{ exercise_id: string }>('SELECT DISTINCT exercise_id FROM workout_exercises').map((r) => r.exercise_id));
}

export interface ExerciseHistoryRow {
  workout: Workout;
  workout_exercise: WorkoutExercise;
  sets: SetLog[];
}

/**
 * Every workout_exercise for an exercise with its parent workout and sets, newest first — the
 * engine's `history`. `upToDate` (inclusive) / `excludeWorkoutId` scope it to sessions prior to
 * the one being built.
 */
export function exerciseHistory(db: Db, exerciseId: string, opts: { upToDate?: string; excludeWorkoutId?: string } = {}): ExerciseHistoryRow[] {
  const where: string[] = ['x.exercise_id = $exercise_id'];
  const params: Record<string, string> = { exercise_id: exerciseId };
  if (opts.upToDate) { where.push('w.date <= $upTo'); params.upTo = opts.upToDate; }
  if (opts.excludeWorkoutId) { where.push('w.id != $exclude'); params.exclude = opts.excludeWorkoutId; }
  const rows = db.all(`SELECT ${workoutCols('w')}, ${WE_COL_NAMES.map((c) => `x.${q(c)} AS x_${c}`).join(', ')}
    FROM workout_exercises x JOIN workouts w ON w.id = x.workout_id
    WHERE ${where.join(' AND ')} ORDER BY w.date DESC, w.id DESC, x."order"`, params);
  const out: ExerciseHistoryRow[] = [];
  for (const r of rows) {
    const xr: Row = {};
    for (const [k, v] of Object.entries(r)) if (k.startsWith('x_')) xr[k.slice(2)] = v;
    const we = rowToWorkoutExercise(xr);
    out.push({ workout: rowToWorkout(r), workout_exercise: we, sets: listSets(db, we.id) });
  }
  return out;
}

// --- sets -------------------------------------------------------------------

export function getSet(db: Db, id: string): SetLog | null {
  const r = db.get(`SELECT ${SET_COLS} FROM set_logs WHERE id = $id`, { id });
  return r ? rowToSet(r) : null;
}

export function listSets(db: Db, workoutExerciseId: string): SetLog[] {
  return db.all(`SELECT ${SET_COLS} FROM set_logs WHERE workout_exercise_id = $id ORDER BY set_index, side, completed_at, id`, { id: workoutExerciseId }).map(rowToSet);
}

export function listSetsForWorkout(db: Db, workoutId: string): SetLog[] {
  return db.all(`SELECT ${setCols('s')} FROM set_logs s JOIN workout_exercises x ON x.id = s.workout_exercise_id
    WHERE x.workout_id = $id ORDER BY x."order", s.set_index, s.side, s.completed_at, s.id`, { id: workoutId }).map(rowToSet);
}

export function insertSet(db: Db, s: SetLog): void {
  db.run(`INSERT INTO set_logs (${SET_COLS}) VALUES (${SET_COL_NAMES.map((c) => `$${c}`).join(', ')})`, { ...s, rir_observed: s.rir_observed ?? true });
}

export function updateSet(db: Db, s: SetLog): void {
  db.run(`UPDATE set_logs SET set_index = $set_index, side = $side, is_warmup = $is_warmup, is_amrap = $is_amrap, weight_kg = $weight_kg, reps = $reps,
    rir = $rir, rir_observed = $rir_observed, tempo = $tempo, rest_taken_seconds = $rest_taken_seconds, pain_severity = $pain_severity, pain_note = $pain_note, media_id = $media_id,
    completed_at = $completed_at WHERE id = $id`, omit({ ...s, rir_observed: s.rir_observed ?? true }, 'workout_exercise_id'));
}

export function deleteSet(db: Db, id: string): boolean {
  return db.run('DELETE FROM set_logs WHERE id = $id', { id }).changes > 0;
}

export interface SetWithExercise { set: SetLog; exercise_id: string; workout_id: string; workout_date: string }

/** Sets of workouts dated in [from, to] with their exercise id and workout date (volume accounting). */
export function setsForWorkoutsBetween(db: Db, from: string, to: string): SetWithExercise[] {
  const rows = db.all(`SELECT ${setCols('s')}, x.exercise_id AS exercise_id, x.workout_id AS workout_id, w.date AS workout_date
    FROM set_logs s JOIN workout_exercises x ON x.id = s.workout_exercise_id JOIN workouts w ON w.id = x.workout_id
    WHERE w.date >= $from AND w.date <= $to ORDER BY w.date, w.id, x."order", s.set_index`, { from, to });
  return rows.map((r) => ({ set: rowToSet(r), exercise_id: str(r.exercise_id), workout_id: str(r.workout_id), workout_date: str(r.workout_date) }));
}

/** Sets completed at or after `sinceIso` (recently-trained muscles). */
export function setsCompletedSince(db: Db, sinceIso: string): SetWithExercise[] {
  const rows = db.all(`SELECT ${setCols('s')}, x.exercise_id AS exercise_id, x.workout_id AS workout_id, w.date AS workout_date
    FROM set_logs s JOIN workout_exercises x ON x.id = s.workout_exercise_id JOIN workouts w ON w.id = x.workout_id
    WHERE s.completed_at >= $since ORDER BY s.completed_at`, { since: sinceIso });
  return rows.map((r) => ({ set: rowToSet(r), exercise_id: str(r.exercise_id), workout_id: str(r.workout_id), workout_date: str(r.workout_date) }));
}

export interface PainFlagRow { date: string; exercise_id: string; exercise_name: string; severity: SetLog['pain_severity']; note: string | null }

export function painFlagsBetween(db: Db, from: string, to: string): PainFlagRow[] {
  return db.all(`SELECT w.date AS date, x.exercise_id AS exercise_id, e.name AS exercise_name, s.pain_severity AS severity, s.pain_note AS note
    FROM set_logs s JOIN workout_exercises x ON x.id = s.workout_exercise_id JOIN workouts w ON w.id = x.workout_id JOIN exercises e ON e.id = x.exercise_id
    WHERE s.pain_severity != 'none' AND w.date >= $from AND w.date <= $to ORDER BY w.date DESC, s.completed_at DESC`, { from, to })
    .map((r) => ({ date: str(r.date), exercise_id: str(r.exercise_id), exercise_name: str(r.exercise_name), severity: str(r.severity) as SetLog['pain_severity'], note: strOrNull(r.note) }));
}

/** Most recent other session of `exerciseId` dated on or before `date` (excluding `workoutId`) that has at least one logged set. */
export function previousPerformance(db: Db, exerciseId: string, date: string, workoutId: string): { workout_id: string; date: string; sets: SetLog[] } | null {
  const r = db.get<{ id: string; workout_id: string; date: string }>(`SELECT x.id AS id, w.id AS workout_id, w.date AS date
    FROM workout_exercises x JOIN workouts w ON w.id = x.workout_id
    WHERE x.exercise_id = $exercise_id AND w.id != $workout_id AND w.date <= $date
      AND EXISTS (SELECT 1 FROM set_logs s WHERE s.workout_exercise_id = x.id)
    ORDER BY w.date DESC, w.id DESC LIMIT 1`, { exercise_id: exerciseId, workout_id: workoutId, date });
  if (!r) return null;
  return { workout_id: r.workout_id, date: r.date, sets: listSets(db, r.id) };
}
