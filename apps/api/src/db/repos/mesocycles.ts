import type { Mesocycle, MesocycleWeek } from '@omega/core';
import type { Db, Row } from '../connection.js';
import { bool, num, str, strOrNull } from '../mappers.js';

export function rowToMesocycle(r: Row): Mesocycle {
  return {
    id: str(r.id),
    name: str(r.name),
    start_date: str(r.start_date),
    planned_weeks: num(r.planned_weeks),
    deload_week: num(r.deload_week),
    status: str(r.status) as Mesocycle['status'],
    notes: strOrNull(r.notes),
  };
}

export function rowToWeek(r: Row): MesocycleWeek {
  return {
    mesocycle_id: str(r.mesocycle_id),
    week_number: num(r.week_number),
    is_deload: bool(r.is_deload),
    set_delta: num(r.set_delta),
    rir_target_low: num(r.rir_target_low),
    rir_target_high: num(r.rir_target_high),
    volume_multiplier: num(r.volume_multiplier),
  };
}

const MESO_COLS = 'id, name, start_date, planned_weeks, deload_week, status, notes';
const WEEK_COLS = 'mesocycle_id, week_number, is_deload, set_delta, rir_target_low, rir_target_high, volume_multiplier';

export function getMesocycle(db: Db, id: string): Mesocycle | null {
  const r = db.get(`SELECT ${MESO_COLS} FROM mesocycles WHERE id = $id`, { id });
  return r ? rowToMesocycle(r) : null;
}

export function listMesocycles(db: Db): Mesocycle[] {
  return db.all(`SELECT ${MESO_COLS} FROM mesocycles ORDER BY start_date DESC, id`).map(rowToMesocycle);
}

/** The active block (most recently started if several are marked active). */
export function getActiveMesocycle(db: Db): Mesocycle | null {
  const r = db.get(`SELECT ${MESO_COLS} FROM mesocycles WHERE status = 'active' ORDER BY start_date DESC, id LIMIT 1`);
  return r ? rowToMesocycle(r) : null;
}

export function listWeeks(db: Db, mesocycleId: string): MesocycleWeek[] {
  return db.all(`SELECT ${WEEK_COLS} FROM mesocycle_weeks WHERE mesocycle_id = $id ORDER BY week_number`, { id: mesocycleId }).map(rowToWeek);
}

export function getWeek(db: Db, mesocycleId: string, weekNumber: number): MesocycleWeek | null {
  const r = db.get(`SELECT ${WEEK_COLS} FROM mesocycle_weeks WHERE mesocycle_id = $id AND week_number = $w`, { id: mesocycleId, w: weekNumber });
  return r ? rowToWeek(r) : null;
}

export function insertMesocycle(db: Db, m: Mesocycle): void {
  db.run(`INSERT INTO mesocycles (${MESO_COLS}) VALUES ($id, $name, $start_date, $planned_weeks, $deload_week, $status, $notes)`, { ...m });
}

export function upsertMesocycle(db: Db, m: Mesocycle): void {
  db.run(`INSERT INTO mesocycles (${MESO_COLS}) VALUES ($id, $name, $start_date, $planned_weeks, $deload_week, $status, $notes)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, start_date = excluded.start_date, planned_weeks = excluded.planned_weeks,
      deload_week = excluded.deload_week, status = excluded.status, notes = excluded.notes`, { ...m });
}

export function updateMesocycle(db: Db, m: Mesocycle): void {
  db.run(`UPDATE mesocycles SET name = $name, start_date = $start_date, planned_weeks = $planned_weeks, deload_week = $deload_week, status = $status,
    notes = $notes WHERE id = $id`, { ...m });
}

export function upsertWeek(db: Db, w: MesocycleWeek): void {
  db.run(`INSERT INTO mesocycle_weeks (${WEEK_COLS}) VALUES ($mesocycle_id, $week_number, $is_deload, $set_delta, $rir_target_low, $rir_target_high, $volume_multiplier)
    ON CONFLICT(mesocycle_id, week_number) DO UPDATE SET is_deload = excluded.is_deload, set_delta = excluded.set_delta,
      rir_target_low = excluded.rir_target_low, rir_target_high = excluded.rir_target_high, volume_multiplier = excluded.volume_multiplier`, { ...w });
}

export function replaceWeeks(db: Db, mesocycleId: string, weeks: ReadonlyArray<Omit<MesocycleWeek, 'mesocycle_id'>>): void {
  db.run('DELETE FROM mesocycle_weeks WHERE mesocycle_id = $id', { id: mesocycleId });
  for (const w of weeks) upsertWeek(db, { ...w, mesocycle_id: mesocycleId });
}

/** API: activating a block demotes every other active block to `complete`. */
export function demoteOtherActive(db: Db, exceptId: string): void {
  db.run(`UPDATE mesocycles SET status = 'complete' WHERE status = 'active' AND id != $id`, { id: exceptId });
}
