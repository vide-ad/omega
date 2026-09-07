import type { Prescription, SetLog, Workout, WorkoutExercise } from '@omega/core';
import type { Db, Row } from '../connection.js';
import { bool, jsonOrNull, num, numOrNull, str, strOrNull, toJson } from '../mappers.js';

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

export interface WorkoutExerciseRow extends WorkoutExercise {
  prescription: Prescription | null;
  based_on_workout_id: string | null;
}

export function rowToWorkoutExercise(r: Row): WorkoutExerciseRow {
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
    prescription: jsonOrNull<Prescription>(r.prescription),
    based_on_workout_id: strOrNull(r.based_on_workout_id),
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
    tempo: strOrNull(r.tempo),
    rest_taken_seconds: numOrNull(r.rest_taken_seconds),
    pain_severity: str(r.pain_severity) as SetLog['pain_severity'],
    pain_note: strOrNull(r.pain_note),
    media_id: strOrNull(r.media_id),
    completed_at: str(r.completed_at),
  };
}

const W_COLS = 'id, template_id, template_version, mesocycle_id, week_number, date, started_at, completed_at, readiness_id, session_rpe, notes, is_compromised';
const WE_COLS = 'id, workout_id, exercise_id, "order", target_sets, target_rep_low, target_rep_high, target_rir, suggested_weight_kg, rest_seconds, notes, prescription, based_on_workout_id';
const SET_COLS = 'id, workout_exercise_id, set_index, side, is_warmup, is_amrap, weight_kg, reps, rir, tempo, rest_taken_seconds, pain_severity, pain_note, media_id, completed_at';

export function workoutCols(alias: string): string {
  return W_COLS.split(', ').map((c) => `${alias}.${c}`).join(', ');
}
export function setCols(alias: string): string {
  return SET_COLS.split(', ').map((c) => `${alias}.${c}`).join(', ');
}

// --- workouts ---------------------------------------------------------------

export function getWorkout(db: Db, id: string): Workout | null {
  const r = db.get(`SELECT ${W_COLS} FROM workouts WHERE id = $id`, { id });
  return r ? rowToWorkout(r) : null;
}

export function insertWorkout(db: Db, w: Workout): void {
  db.run(`INSERT INTO workouts (${W_COLS}) VALUES ($id, $template_id, $template_version, $mesocycle_id, $week_number, $date, $started_at, $completed_at,
    $readiness_id, $session_rpe, $notes, $is_compromised)`, { ...w });
}

export function updateWorkout(db: Db, w: Workout): void {
  db.run(`UPDATE workouts SET template_id = $template_id, template_version = $template_version, mesocycle_id = $mesocycle_id, week_number = $week_number,
    date = $date, started_at = $started_at, completed_at = $completed_at, readiness_id = $readiness_id, session_rpe = $session_rpe, notes = $notes,
    is_compromised = $is_compromised WHERE id = $id`, { ...w });
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

// --- workout exercises ------------------------------------------------------

export function getWorkoutExercise(db: Db, id: string): WorkoutExerciseRow | null {
  const r = db.get(`SELECT ${WE_COLS} FROM workout_exercises WHERE id = $id`, { id });
  return r ? rowToWorkoutExercise(r) : null;
}

export function listWorkoutExercises(db: Db, workoutId: string): WorkoutExerciseRow[] {
  return db.all(`SELECT ${WE_COLS} FROM workout_exercises WHERE workout_id = $id ORDER BY "order", id`, { id: workoutId }).map(rowToWorkoutExercise);
}

export function insertWorkoutExercise(db: Db, we: WorkoutExerciseRow): void {
  db.run(`INSERT INTO workout_exercises (${WE_COLS}) VALUES ($id, $workout_id, $exercise_id, $order, $target_sets, $target_rep_low, $target_rep_high,
    $target_rir, $suggested_weight_kg, $rest_seconds, $notes, $prescription, $based_on_workout_id)`,
    { ...we, prescription: toJson(we.prescription) });
}

export function maxWorkoutExerciseOrder(db: Db, workoutId: string): number {
  return num(db.get<{ m: number | null }>('SELECT max("order") AS m FROM workout_exercises WHERE workout_id = $id', { id: workoutId })?.m ?? 0);
}

/**
 * Every workout_exercise for an exercise, with the parent workout, for the progression engine.
 * `beforeDate` (inclusive) / `excludeWorkoutId` scope the history to sessions prior to the one being built.
 */
export interface ExerciseHistoryRow {
  workout: Workout;
  workout_exercise: WorkoutExerciseRow;
  sets: SetLog[];
}

export function exerciseHistory(db: Db, exerciseId: string, opts: { upToDate?: string; excludeWorkoutId?: string } = {}): ExerciseHistoryRow[] {
  const where: string[] = ['x.exercise_id = $exercise_id'];
  const params: Record<string, string> = { exercise_id: exerciseId };
  if (opts.upToDate) { where.push('w.date <= $upTo'); params.upTo = opts.upToDate; }
  if (opts.excludeWorkoutId) { where.push('w.id != $exclude'); params.exclude = opts.excludeWorkoutId; }
  const rows = db.all(`SELECT ${workoutCols('w')},
      x.id AS x_id, x.workout_id AS x_workout_id, x.exercise_id AS x_exercise_id, x."order" AS x_order, x.target_sets AS x_target_sets,
      x.target_rep_low AS x_target_rep_low, x.target_rep_high AS x_target_rep_high, x.target_rir AS x_target_rir,
      x.suggested_weight_kg AS x_suggested_weight_kg, x.rest_seconds AS x_rest_seconds, x.notes AS x_notes, x.prescription AS x_prescription,
      x.based_on_workout_id AS x_based_on_workout_id
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
  return db.all(`SELECT ${SET_COLS} FROM set_logs WHERE workout_exercise_id = $id ORDER BY set_index, completed_at, id`, { id: workoutExerciseId }).map(rowToSet);
}

export function listSetsForWorkout(db: Db, workoutId: string): SetLog[] {
  return db.all(`SELECT ${setCols('s')} FROM set_logs s JOIN workout_exercises x ON x.id = s.workout_exercise_id
    WHERE x.workout_id = $id ORDER BY x."order", s.set_index, s.completed_at, s.id`, { id: workoutId }).map(rowToSet);
}

export function insertSet(db: Db, s: SetLog): void {
  db.run(`INSERT INTO set_logs (${SET_COLS}) VALUES ($id, $workout_exercise_id, $set_index, $side, $is_warmup, $is_amrap, $weight_kg, $reps, $rir, $tempo,
    $rest_taken_seconds, $pain_severity, $pain_note, $media_id, $completed_at)`, { ...s });
}

export function updateSet(db: Db, s: SetLog): void {
  db.run(`UPDATE set_logs SET set_index = $set_index, side = $side, is_warmup = $is_warmup, is_amrap = $is_amrap, weight_kg = $weight_kg, reps = $reps,
    rir = $rir, tempo = $tempo, rest_taken_seconds = $rest_taken_seconds, pain_severity = $pain_severity, pain_note = $pain_note, media_id = $media_id,
    completed_at = $completed_at WHERE id = $id`, { ...s, workout_exercise_id: undefined });
}

export function deleteSet(db: Db, id: string): boolean {
  return db.run('DELETE FROM set_logs WHERE id = $id', { id }).changes > 0;
}

/** Sets completed at or after `sinceIso`, with their exercise id (for volume accounting / recently-trained). */
export interface SetWithExercise { set: SetLog; exercise_id: string; workout_id: string; workout_date: string }

export function setsCompletedSince(db: Db, sinceIso: string, untilIso?: string): SetWithExercise[] {
  const rows = db.all(`SELECT ${setCols('s')}, x.exercise_id AS exercise_id, x.workout_id AS workout_id, w.date AS workout_date
    FROM set_logs s JOIN workout_exercises x ON x.id = s.workout_exercise_id JOIN workouts w ON w.id = x.workout_id
    WHERE s.completed_at >= $since ${untilIso ? 'AND s.completed_at <= $until' : ''} ORDER BY s.completed_at`, untilIso ? { since: sinceIso, until: untilIso } : { since: sinceIso });
  return rows.map((r) => ({ set: rowToSet(r), exercise_id: str(r.exercise_id), workout_id: str(r.workout_id), workout_date: str(r.workout_date) }));
}

export interface PainFlagRow { date: string; exercise_id: string; exercise_name: string; severity: SetLog['pain_severity']; note: string | null; completed_at: string }

export function painFlagsSince(db: Db, fromDate: string): PainFlagRow[] {
  return db.all(`SELECT w.date AS date, x.exercise_id AS exercise_id, e.name AS exercise_name, s.pain_severity AS severity, s.pain_note AS note, s.completed_at AS completed_at
    FROM set_logs s JOIN workout_exercises x ON x.id = s.workout_exercise_id JOIN workouts w ON w.id = x.workout_id JOIN exercises e ON e.id = x.exercise_id
    WHERE s.pain_severity != 'none' AND w.date >= $from ORDER BY w.date DESC, s.completed_at DESC`, { from: fromDate })
    .map((r) => ({ date: str(r.date), exercise_id: str(r.exercise_id), exercise_name: str(r.exercise_name), severity: str(r.severity) as SetLog['pain_severity'], note: strOrNull(r.note), completed_at: str(r.completed_at) }));
}

/** Most recent other session of `exerciseId` (dated on or before `date`, excluding `workoutId`) that has at least one logged set. */
export function previousPerformance(db: Db, exerciseId: string, date: string, workoutId: string): { workout_id: string; date: string; sets: SetLog[] } | null {
  const r = db.get<{ id: string; workout_id: string; date: string }>(`SELECT x.id AS id, w.id AS workout_id, w.date AS date
    FROM workout_exercises x JOIN workouts w ON w.id = x.workout_id
    WHERE x.exercise_id = $exercise_id AND w.id != $workout_id AND w.date <= $date
      AND EXISTS (SELECT 1 FROM set_logs s WHERE s.workout_exercise_id = x.id)
    ORDER BY w.date DESC, w.id DESC LIMIT 1`, { exercise_id: exerciseId, workout_id: workoutId, date });
  if (!r) return null;
  return { workout_id: r.workout_id, date: r.date, sets: listSets(db, r.id) };
}
