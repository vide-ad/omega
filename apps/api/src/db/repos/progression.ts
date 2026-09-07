import type { MuscleVolumeTarget, ProgressionState } from '@omega/core';
import type { Db, Row } from '../connection.js';
import { bool, num, numOrNull, str, strOrNull } from '../mappers.js';

export function rowToState(r: Row): ProgressionState {
  return {
    exercise_id: str(r.exercise_id),
    working_weight_kg: num(r.working_weight_kg),
    baseline_e1rm: numOrNull(r.baseline_e1rm),
    baseline_set_id: strOrNull(r.baseline_set_id),
    last_progressed_at: strOrNull(r.last_progressed_at),
    consecutive_stalls: num(r.consecutive_stalls),
    updated_at: str(r.updated_at),
  };
}

const S_COLS = 'exercise_id, working_weight_kg, baseline_e1rm, baseline_set_id, last_progressed_at, consecutive_stalls, updated_at';

export function getState(db: Db, exerciseId: string): ProgressionState | null {
  const r = db.get(`SELECT ${S_COLS} FROM progression_state WHERE exercise_id = $id`, { id: exerciseId });
  return r ? rowToState(r) : null;
}

export function listStates(db: Db): ProgressionState[] {
  return db.all(`SELECT ${S_COLS} FROM progression_state`).map(rowToState);
}

export function statesByExercise(db: Db): Map<string, ProgressionState> {
  return new Map(listStates(db).map((s) => [s.exercise_id, s]));
}

export function upsertState(db: Db, s: ProgressionState): void {
  db.run(`INSERT INTO progression_state (${S_COLS}) VALUES ($exercise_id, $working_weight_kg, $baseline_e1rm, $baseline_set_id, $last_progressed_at, $consecutive_stalls, $updated_at)
    ON CONFLICT(exercise_id) DO UPDATE SET working_weight_kg = excluded.working_weight_kg, baseline_e1rm = excluded.baseline_e1rm, baseline_set_id = excluded.baseline_set_id,
      last_progressed_at = excluded.last_progressed_at, consecutive_stalls = excluded.consecutive_stalls, updated_at = excluded.updated_at`, { ...s });
}

/** Seed helper: creates the starting-load row only when none exists, so re-seeding never overwrites a live working weight. */
export function insertStartingLoadIfAbsent(db: Db, exerciseId: string, workingWeightKg: number, updatedAt: string): boolean {
  return db.run(`INSERT INTO progression_state (${S_COLS}) VALUES ($exercise_id, $working_weight_kg, NULL, NULL, NULL, 0, $updated_at)
    ON CONFLICT(exercise_id) DO NOTHING`, { exercise_id: exerciseId, working_weight_kg: workingWeightKg, updated_at: updatedAt }).changes > 0;
}

// --- volume targets ---------------------------------------------------------

export function rowToTarget(r: Row): MuscleVolumeTarget {
  return {
    muscle_group_key: str(r.muscle_group_key) as MuscleVolumeTarget['muscle_group_key'],
    min_sets: num(r.min_sets),
    max_sets: num(r.max_sets),
    priority: str(r.priority) as MuscleVolumeTarget['priority'],
    active: bool(r.active),
  };
}

export function listTargets(db: Db): MuscleVolumeTarget[] {
  return db.all('SELECT muscle_group_key, min_sets, max_sets, priority, active FROM muscle_volume_targets ORDER BY rowid').map(rowToTarget);
}

export function getTarget(db: Db, key: string): MuscleVolumeTarget | null {
  const r = db.get('SELECT muscle_group_key, min_sets, max_sets, priority, active FROM muscle_volume_targets WHERE muscle_group_key = $key', { key });
  return r ? rowToTarget(r) : null;
}

export function upsertTarget(db: Db, t: MuscleVolumeTarget): void {
  db.run(`INSERT INTO muscle_volume_targets (muscle_group_key, min_sets, max_sets, priority, active) VALUES ($muscle_group_key, $min_sets, $max_sets, $priority, $active)
    ON CONFLICT(muscle_group_key) DO UPDATE SET min_sets = excluded.min_sets, max_sets = excluded.max_sets, priority = excluded.priority, active = excluded.active`, { ...t });
}
