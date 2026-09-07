import type { ExerciseConstraint, Injury } from '@omega/core';
import type { Db, Row } from '../connection.js';
import { bool, numOrNull, str, strOrNull } from '../mappers.js';

export function rowToInjury(r: Row): Injury {
  return {
    id: str(r.id),
    name: str(r.name),
    region: str(r.region),
    status: str(r.status) as Injury['status'],
    started_at: str(r.started_at),
    resolved_at: strOrNull(r.resolved_at),
    notes: strOrNull(r.notes),
    physio_notes: strOrNull(r.physio_notes),
  };
}

export function rowToConstraint(r: Row): ExerciseConstraint {
  return {
    id: str(r.id),
    injury_id: str(r.injury_id),
    exercise_id: strOrNull(r.exercise_id),
    movement_pattern: strOrNull(r.movement_pattern) as ExerciseConstraint['movement_pattern'],
    max_weight_kg: numOrNull(r.max_weight_kg),
    min_reps: numOrNull(r.min_reps),
    required_tempo: strOrNull(r.required_tempo),
    requires_clearance: bool(r.requires_clearance),
    blocked: bool(r.blocked),
    note: strOrNull(r.note),
  };
}

const INJURY_COLS = 'id, name, region, status, started_at, resolved_at, notes, physio_notes';
const CONSTRAINT_COLS = 'id, injury_id, exercise_id, movement_pattern, max_weight_kg, min_reps, required_tempo, requires_clearance, blocked, note';

export function getInjury(db: Db, id: string): Injury | null {
  const r = db.get(`SELECT ${INJURY_COLS} FROM injuries WHERE id = $id`, { id });
  return r ? rowToInjury(r) : null;
}

export function listInjuries(db: Db, status?: Injury['status'] | 'live'): Injury[] {
  if (status === 'live') return db.all(`SELECT ${INJURY_COLS} FROM injuries WHERE status != 'resolved' ORDER BY started_at DESC, id`).map(rowToInjury);
  if (status) return db.all(`SELECT ${INJURY_COLS} FROM injuries WHERE status = $status ORDER BY started_at DESC, id`, { status }).map(rowToInjury);
  return db.all(`SELECT ${INJURY_COLS} FROM injuries ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'monitoring' THEN 1 ELSE 2 END, started_at DESC, id`).map(rowToInjury);
}

export function upsertInjury(db: Db, i: Injury): void {
  db.run(`INSERT INTO injuries (${INJURY_COLS}) VALUES ($id, $name, $region, $status, $started_at, $resolved_at, $notes, $physio_notes)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, region = excluded.region, status = excluded.status, started_at = excluded.started_at,
      resolved_at = excluded.resolved_at, notes = excluded.notes, physio_notes = excluded.physio_notes`, { ...i });
}

export function insertInjury(db: Db, i: Injury): void {
  db.run(`INSERT INTO injuries (${INJURY_COLS}) VALUES ($id, $name, $region, $status, $started_at, $resolved_at, $notes, $physio_notes)`, { ...i });
}

export function updateInjury(db: Db, i: Injury): void {
  db.run(`UPDATE injuries SET name = $name, region = $region, status = $status, started_at = $started_at, resolved_at = $resolved_at,
    notes = $notes, physio_notes = $physio_notes WHERE id = $id`, { ...i });
}

export function getConstraint(db: Db, id: string): ExerciseConstraint | null {
  const r = db.get(`SELECT ${CONSTRAINT_COLS} FROM exercise_constraints WHERE id = $id`, { id });
  return r ? rowToConstraint(r) : null;
}

export function listConstraints(db: Db, injuryId?: string): ExerciseConstraint[] {
  if (injuryId) return db.all(`SELECT ${CONSTRAINT_COLS} FROM exercise_constraints WHERE injury_id = $id ORDER BY rowid`, { id: injuryId }).map(rowToConstraint);
  return db.all(`SELECT ${CONSTRAINT_COLS} FROM exercise_constraints ORDER BY rowid`).map(rowToConstraint);
}

export function upsertConstraint(db: Db, c: ExerciseConstraint): void {
  db.run(`INSERT INTO exercise_constraints (${CONSTRAINT_COLS}) VALUES ($id, $injury_id, $exercise_id, $movement_pattern, $max_weight_kg, $min_reps,
    $required_tempo, $requires_clearance, $blocked, $note)
    ON CONFLICT(id) DO UPDATE SET injury_id = excluded.injury_id, exercise_id = excluded.exercise_id, movement_pattern = excluded.movement_pattern,
      max_weight_kg = excluded.max_weight_kg, min_reps = excluded.min_reps, required_tempo = excluded.required_tempo,
      requires_clearance = excluded.requires_clearance, blocked = excluded.blocked, note = excluded.note`, { ...c });
}

export function insertConstraint(db: Db, c: ExerciseConstraint): void {
  db.run(`INSERT INTO exercise_constraints (${CONSTRAINT_COLS}) VALUES ($id, $injury_id, $exercise_id, $movement_pattern, $max_weight_kg, $min_reps,
    $required_tempo, $requires_clearance, $blocked, $note)`, { ...c });
}

export function updateConstraint(db: Db, c: ExerciseConstraint): void {
  db.run(`UPDATE exercise_constraints SET exercise_id = $exercise_id, movement_pattern = $movement_pattern, max_weight_kg = $max_weight_kg,
    min_reps = $min_reps, required_tempo = $required_tempo, requires_clearance = $requires_clearance, blocked = $blocked, note = $note WHERE id = $id`,
    { ...c, injury_id: undefined });
}

export function deleteConstraint(db: Db, id: string): boolean {
  return db.run('DELETE FROM exercise_constraints WHERE id = $id', { id }).changes > 0;
}
