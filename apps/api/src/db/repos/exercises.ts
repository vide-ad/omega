import type { Exercise, ExerciseMuscleCredit, MuscleGroup } from '@omega/core';
import type { Db, Row } from '../connection.js';
import { bool, json, num, str, strOrNull, toJson } from '../mappers.js';

export function rowToExercise(r: Row): Exercise {
  return {
    id: str(r.id),
    name: str(r.name),
    aliases: json<string[]>(r.aliases, []),
    equipment: str(r.equipment) as Exercise['equipment'],
    movement_pattern: str(r.movement_pattern) as Exercise['movement_pattern'],
    is_unilateral: bool(r.is_unilateral),
    lengthened_bias: bool(r.lengthened_bias),
    default_rep_low: num(r.default_rep_low),
    default_rep_high: num(r.default_rep_high),
    default_rir_target: num(r.default_rir_target),
    default_rest_seconds: num(r.default_rest_seconds),
    weight_increment_kg: num(r.weight_increment_kg),
    demo_video_url: strOrNull(r.demo_video_url),
    cues: strOrNull(r.cues),
    archived: bool(r.archived),
    created_at: str(r.created_at),
  };
}

export function rowToCredit(r: Row): ExerciseMuscleCredit {
  return {
    exercise_id: str(r.exercise_id),
    muscle_group_key: str(r.muscle_group_key) as ExerciseMuscleCredit['muscle_group_key'],
    credit: num(r.credit),
    role: str(r.role) as ExerciseMuscleCredit['role'],
  };
}

const EXERCISE_COL_NAMES = ['id', 'name', 'aliases', 'equipment', 'movement_pattern', 'is_unilateral', 'lengthened_bias', 'default_rep_low', 'default_rep_high',
  'default_rir_target', 'default_rest_seconds', 'weight_increment_kg', 'demo_video_url', 'cues', 'archived', 'created_at'] as const;
const EXERCISE_COLS = EXERCISE_COL_NAMES.join(', ');
/** Column list qualified with a table alias, e.g. `e.id, e.name, ...`. */
export function exerciseCols(alias: string): string {
  return EXERCISE_COL_NAMES.map((c) => `${alias}.${c}`).join(', ');
}

export function getExercise(db: Db, id: string): Exercise | null {
  const r = db.get(`SELECT ${EXERCISE_COLS} FROM exercises WHERE id = $id`, { id });
  return r ? rowToExercise(r) : null;
}

export function listAllExercises(db: Db, opts: { includeArchived?: boolean } = {}): Exercise[] {
  const where = opts.includeArchived ? '' : 'WHERE archived = 0';
  return db.all(`SELECT ${EXERCISE_COLS} FROM exercises ${where} ORDER BY name, id`).map(rowToExercise);
}

export interface ExerciseListFilter {
  muscle?: string;
  pattern?: string;
  archived?: boolean;
  q?: string;
  limit: number;
  /** Exclusive lower bound on (name, id), from the cursor. */
  after?: { name: string; id: string };
}

export function listExercises(db: Db, f: ExerciseListFilter): Exercise[] {
  const where: string[] = [];
  const params: Record<string, string | number> = { limit: f.limit + 1 };
  if (f.muscle) {
    where.push('EXISTS (SELECT 1 FROM exercise_muscle_credits c WHERE c.exercise_id = e.id AND c.muscle_group_key = $muscle)');
    params.muscle = f.muscle;
  }
  if (f.pattern) { where.push('e.movement_pattern = $pattern'); params.pattern = f.pattern; }
  if (f.archived !== undefined) { where.push('e.archived = $archived'); params.archived = f.archived ? 1 : 0; }
  if (f.q) {
    where.push('(e.name LIKE $q COLLATE NOCASE OR e.aliases LIKE $q COLLATE NOCASE)');
    params.q = `%${f.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  }
  if (f.after) {
    where.push('(e.name > $after_name OR (e.name = $after_name AND e.id > $after_id))');
    params.after_name = f.after.name;
    params.after_id = f.after.id;
  }
  const sql = `SELECT ${exerciseCols('e')} FROM exercises e
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.name, e.id LIMIT $limit`;
  return db.all(sql, params).map(rowToExercise);
}

export function insertExercise(db: Db, e: Exercise): void {
  db.run(`INSERT INTO exercises (${EXERCISE_COLS}) VALUES ($id, $name, $aliases, $equipment, $movement_pattern, $is_unilateral, $lengthened_bias,
    $default_rep_low, $default_rep_high, $default_rir_target, $default_rest_seconds, $weight_increment_kg, $demo_video_url, $cues, $archived, $created_at)`,
    { ...e, aliases: JSON.stringify(e.aliases) });
}

export function upsertExercise(db: Db, e: Exercise): void {
  db.run(`INSERT INTO exercises (${EXERCISE_COLS}) VALUES ($id, $name, $aliases, $equipment, $movement_pattern, $is_unilateral, $lengthened_bias,
    $default_rep_low, $default_rep_high, $default_rir_target, $default_rest_seconds, $weight_increment_kg, $demo_video_url, $cues, $archived, $created_at)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, aliases = excluded.aliases, equipment = excluded.equipment,
      movement_pattern = excluded.movement_pattern, is_unilateral = excluded.is_unilateral, lengthened_bias = excluded.lengthened_bias,
      default_rep_low = excluded.default_rep_low, default_rep_high = excluded.default_rep_high, default_rir_target = excluded.default_rir_target,
      default_rest_seconds = excluded.default_rest_seconds, weight_increment_kg = excluded.weight_increment_kg,
      demo_video_url = COALESCE(exercises.demo_video_url, excluded.demo_video_url), cues = COALESCE(exercises.cues, excluded.cues)`,
    { ...e, aliases: JSON.stringify(e.aliases) });
}

export function updateExercise(db: Db, e: Exercise): void {
  db.run(`UPDATE exercises SET name = $name, aliases = $aliases, equipment = $equipment, movement_pattern = $movement_pattern,
    is_unilateral = $is_unilateral, lengthened_bias = $lengthened_bias, default_rep_low = $default_rep_low, default_rep_high = $default_rep_high,
    default_rir_target = $default_rir_target, default_rest_seconds = $default_rest_seconds, weight_increment_kg = $weight_increment_kg,
    demo_video_url = $demo_video_url, cues = $cues, archived = $archived WHERE id = $id`,
    { ...e, aliases: JSON.stringify(e.aliases), created_at: undefined });
}

export function listCredits(db: Db, exerciseId?: string): ExerciseMuscleCredit[] {
  if (exerciseId) {
    return db.all('SELECT exercise_id, muscle_group_key, credit, role FROM exercise_muscle_credits WHERE exercise_id = $id ORDER BY credit DESC, muscle_group_key', { id: exerciseId }).map(rowToCredit);
  }
  return db.all('SELECT exercise_id, muscle_group_key, credit, role FROM exercise_muscle_credits ORDER BY exercise_id, credit DESC, muscle_group_key').map(rowToCredit);
}

export function creditsByExercise(db: Db): Map<string, ExerciseMuscleCredit[]> {
  const m = new Map<string, ExerciseMuscleCredit[]>();
  for (const c of listCredits(db)) {
    const arr = m.get(c.exercise_id) ?? [];
    arr.push(c);
    m.set(c.exercise_id, arr);
  }
  return m;
}

export function replaceCredits(db: Db, exerciseId: string, credits: ReadonlyArray<Omit<ExerciseMuscleCredit, 'exercise_id'>>): void {
  db.run('DELETE FROM exercise_muscle_credits WHERE exercise_id = $id', { id: exerciseId });
  for (const c of credits) {
    db.run('INSERT INTO exercise_muscle_credits (exercise_id, muscle_group_key, credit, role) VALUES ($exercise_id, $muscle_group_key, $credit, $role)',
      { exercise_id: exerciseId, muscle_group_key: c.muscle_group_key, credit: c.credit, role: c.role });
  }
}

export function upsertCredit(db: Db, c: ExerciseMuscleCredit): void {
  db.run(`INSERT INTO exercise_muscle_credits (exercise_id, muscle_group_key, credit, role) VALUES ($exercise_id, $muscle_group_key, $credit, $role)
    ON CONFLICT(exercise_id, muscle_group_key) DO UPDATE SET credit = excluded.credit, role = excluded.role`, { ...c });
}

export function listMuscleGroups(db: Db): MuscleGroup[] {
  return db.all('SELECT key, display_name, region FROM muscle_groups ORDER BY rowid').map((r) => ({
    key: str(r.key) as MuscleGroup['key'], display_name: str(r.display_name), region: str(r.region) as MuscleGroup['region'],
  }));
}

export function upsertMuscleGroup(db: Db, m: MuscleGroup): void {
  db.run(`INSERT INTO muscle_groups (key, display_name, region) VALUES ($key, $display_name, $region)
    ON CONFLICT(key) DO UPDATE SET display_name = excluded.display_name, region = excluded.region`, { ...m });
}

export { toJson };
