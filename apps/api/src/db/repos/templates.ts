import type { TemplateExercise, WorkoutTemplate } from '@omega/core';
import type { Db, Row } from '../connection.js';
import { bool, num, str, strOrNull } from '../mappers.js';

export function rowToTemplate(r: Row): WorkoutTemplate {
  return {
    id: str(r.id),
    name: str(r.name),
    day_label: strOrNull(r.day_label),
    order: num(r.order),
    version: num(r.version),
    mesocycle_id: strOrNull(r.mesocycle_id),
    archived: bool(r.archived),
  };
}

export function rowToTemplateExercise(r: Row): TemplateExercise {
  return {
    id: str(r.id),
    template_id: str(r.template_id),
    template_version: num(r.template_version),
    exercise_id: str(r.exercise_id),
    order: num(r.order),
    base_sets: num(r.base_sets),
    is_priority: bool(r.is_priority),
    rep_low: num(r.rep_low),
    rep_high: num(r.rep_high),
    rir_target: num(r.rir_target),
    rest_seconds: num(r.rest_seconds),
    last_set_amrap: bool(r.last_set_amrap),
    notes: strOrNull(r.notes),
  };
}

const TPL_COLS = 'id, name, day_label, "order", version, mesocycle_id, archived';
const TE_COLS = 'id, template_id, template_version, exercise_id, "order", base_sets, is_priority, rep_low, rep_high, rir_target, rest_seconds, last_set_amrap, notes';

export function getTemplate(db: Db, id: string): WorkoutTemplate | null {
  const r = db.get(`SELECT ${TPL_COLS} FROM workout_templates WHERE id = $id`, { id });
  return r ? rowToTemplate(r) : null;
}

export function listTemplates(db: Db, archived?: boolean): WorkoutTemplate[] {
  if (archived === undefined) return db.all(`SELECT ${TPL_COLS} FROM workout_templates ORDER BY "order", name, id`).map(rowToTemplate);
  return db.all(`SELECT ${TPL_COLS} FROM workout_templates WHERE archived = $a ORDER BY "order", name, id`, { a: archived }).map(rowToTemplate);
}

export function countActiveTemplates(db: Db): number {
  return num(db.get<{ c: number }>('SELECT count(*) AS c FROM workout_templates WHERE archived = 0')?.c ?? 0);
}

export function insertTemplate(db: Db, t: WorkoutTemplate, createdAt: string): void {
  db.run(`INSERT INTO workout_templates (${TPL_COLS}) VALUES ($id, $name, $day_label, $order, $version, $mesocycle_id, $archived)`, { ...t });
  snapshotVersion(db, t, createdAt);
}

export function upsertTemplate(db: Db, t: WorkoutTemplate, createdAt: string): void {
  db.run(`INSERT INTO workout_templates (${TPL_COLS}) VALUES ($id, $name, $day_label, $order, $version, $mesocycle_id, $archived)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, day_label = excluded.day_label, "order" = excluded."order",
      mesocycle_id = excluded.mesocycle_id`, { ...t });
  snapshotVersion(db, t, createdAt);
}

/** Records the (name, day_label) of a version so historical workouts can show the name they were created under. */
export function snapshotVersion(db: Db, t: WorkoutTemplate, createdAt: string): void {
  db.run(`INSERT INTO template_versions (template_id, version, name, day_label, created_at) VALUES ($template_id, $version, $name, $day_label, $created_at)
    ON CONFLICT(template_id, version) DO UPDATE SET name = excluded.name, day_label = excluded.day_label`,
    { template_id: t.id, version: t.version, name: t.name, day_label: t.day_label, created_at: createdAt });
}

export function updateTemplate(db: Db, t: WorkoutTemplate, createdAt: string): void {
  db.run(`UPDATE workout_templates SET name = $name, day_label = $day_label, "order" = $order, version = $version, mesocycle_id = $mesocycle_id,
    archived = $archived WHERE id = $id`, { ...t });
  snapshotVersion(db, t, createdAt);
}

export function versionExists(db: Db, templateId: string, version: number): boolean {
  return !!db.get('SELECT 1 AS x FROM template_versions WHERE template_id = $id AND version = $v', { id: templateId, v: version })
    || !!db.get('SELECT 1 AS x FROM template_exercises WHERE template_id = $id AND template_version = $v LIMIT 1', { id: templateId, v: version });
}

export function templateNameForVersion(db: Db, templateId: string, version: number | null): string | null {
  if (version !== null) {
    const r = db.get<{ name: string }>('SELECT name FROM template_versions WHERE template_id = $id AND version = $v', { id: templateId, v: version });
    if (r) return r.name;
  }
  const t = db.get<{ name: string }>('SELECT name FROM workout_templates WHERE id = $id', { id: templateId });
  return t ? t.name : null;
}

export function listTemplateExercises(db: Db, templateId: string, version: number): TemplateExercise[] {
  return db.all(`SELECT ${TE_COLS} FROM template_exercises WHERE template_id = $id AND template_version = $v ORDER BY "order", id`, { id: templateId, v: version })
    .map(rowToTemplateExercise);
}

export function insertTemplateExercise(db: Db, te: TemplateExercise): void {
  db.run(`INSERT INTO template_exercises (${TE_COLS}) VALUES ($id, $template_id, $template_version, $exercise_id, $order, $base_sets, $is_priority,
    $rep_low, $rep_high, $rir_target, $rest_seconds, $last_set_amrap, $notes)`, { ...te });
}

export function upsertTemplateExercise(db: Db, te: TemplateExercise): void {
  db.run(`INSERT INTO template_exercises (${TE_COLS}) VALUES ($id, $template_id, $template_version, $exercise_id, $order, $base_sets, $is_priority,
    $rep_low, $rep_high, $rir_target, $rest_seconds, $last_set_amrap, $notes)
    ON CONFLICT(id) DO UPDATE SET exercise_id = excluded.exercise_id, "order" = excluded."order", base_sets = excluded.base_sets,
      is_priority = excluded.is_priority, rep_low = excluded.rep_low, rep_high = excluded.rep_high, rir_target = excluded.rir_target,
      rest_seconds = excluded.rest_seconds, last_set_amrap = excluded.last_set_amrap, notes = excluded.notes`, { ...te });
}

/** Latest template row (from a non-archived template, latest version) that prescribes this exercise, if any. */
export function latestTemplateExerciseFor(db: Db, exerciseId: string): TemplateExercise | null {
  const r = db.get(`SELECT te.id, te.template_id, te.template_version, te.exercise_id, te."order", te.base_sets, te.is_priority, te.rep_low, te.rep_high,
      te.rir_target, te.rest_seconds, te.last_set_amrap, te.notes
    FROM template_exercises te JOIN workout_templates t ON t.id = te.template_id AND t.version = te.template_version
    WHERE te.exercise_id = $id ORDER BY t.archived, t."order", te."order" LIMIT 1`, { id: exerciseId });
  return r ? rowToTemplateExercise(r) : null;
}
