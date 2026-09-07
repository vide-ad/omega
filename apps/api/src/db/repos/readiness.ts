import type { CardioSession, ReadinessLog, SorenessEntry } from '@omega/core';
import type { Db, Row } from '../connection.js';
import { bool, jsonOrNull, num, numOrNull, str, strOrNull, toJson } from '../mappers.js';

export function rowToReadiness(r: Row): ReadinessLog {
  return {
    id: str(r.id),
    date: str(r.date),
    bodyweight_kg: numOrNull(r.bodyweight_kg),
    resting_hr: numOrNull(r.resting_hr),
    sleep_hours: numOrNull(r.sleep_hours),
    sleep_quality: numOrNull(r.sleep_quality),
    stress: numOrNull(r.stress),
    motivation: numOrNull(r.motivation),
    manual_compromised: bool(r.manual_compromised),
    notes: strOrNull(r.notes),
  };
}

const R_COLS = 'id, date, bodyweight_kg, resting_hr, sleep_hours, sleep_quality, stress, motivation, manual_compromised, notes';

export function getReadiness(db: Db, id: string): ReadinessLog | null {
  const r = db.get(`SELECT ${R_COLS} FROM readiness_logs WHERE id = $id`, { id });
  return r ? rowToReadiness(r) : null;
}

export function getReadinessByDate(db: Db, date: string): ReadinessLog | null {
  const r = db.get(`SELECT ${R_COLS} FROM readiness_logs WHERE date = $date`, { date });
  return r ? rowToReadiness(r) : null;
}

/** Logs dated in [from, to], newest first. */
export function listReadiness(db: Db, from: string, to: string): ReadinessLog[] {
  return db.all(`SELECT ${R_COLS} FROM readiness_logs WHERE date >= $from AND date <= $to ORDER BY date DESC`, { from, to }).map(rowToReadiness);
}

/** Every log, oldest first (rolling medians). */
export function listAllReadiness(db: Db): ReadinessLog[] {
  return db.all(`SELECT ${R_COLS} FROM readiness_logs ORDER BY date`).map(rowToReadiness);
}

export function insertReadiness(db: Db, r: ReadinessLog): void {
  db.run(`INSERT INTO readiness_logs (${R_COLS}) VALUES ($id, $date, $bodyweight_kg, $resting_hr, $sleep_hours, $sleep_quality, $stress, $motivation, $manual_compromised, $notes)`, { ...r });
}

export function updateReadiness(db: Db, r: ReadinessLog): void {
  db.run(`UPDATE readiness_logs SET date = $date, bodyweight_kg = $bodyweight_kg, resting_hr = $resting_hr, sleep_hours = $sleep_hours, sleep_quality = $sleep_quality,
    stress = $stress, motivation = $motivation, manual_compromised = $manual_compromised, notes = $notes WHERE id = $id`, { ...r });
}

export function listSoreness(db: Db, readinessId: string): SorenessEntry[] {
  return db.all('SELECT readiness_id, muscle_group_key, rating FROM soreness_entries WHERE readiness_id = $id ORDER BY muscle_group_key', { id: readinessId })
    .map((r) => ({ readiness_id: str(r.readiness_id), muscle_group_key: str(r.muscle_group_key) as SorenessEntry['muscle_group_key'], rating: num(r.rating) }));
}

/** Soreness entries of the readiness log dated `date` (empty when no log). */
export function listSorenessByDate(db: Db, date: string): SorenessEntry[] {
  return db.all(`SELECT s.readiness_id, s.muscle_group_key, s.rating FROM soreness_entries s JOIN readiness_logs r ON r.id = s.readiness_id
    WHERE r.date = $date ORDER BY s.muscle_group_key`, { date })
    .map((r) => ({ readiness_id: str(r.readiness_id), muscle_group_key: str(r.muscle_group_key) as SorenessEntry['muscle_group_key'], rating: num(r.rating) }));
}

export function replaceSoreness(db: Db, readinessId: string, entries: ReadonlyArray<Pick<SorenessEntry, 'muscle_group_key' | 'rating'>>): void {
  db.run('DELETE FROM soreness_entries WHERE readiness_id = $id', { id: readinessId });
  for (const e of entries) {
    db.run(`INSERT INTO soreness_entries (readiness_id, muscle_group_key, rating) VALUES ($readiness_id, $muscle_group_key, $rating)
      ON CONFLICT(readiness_id, muscle_group_key) DO UPDATE SET rating = excluded.rating`,
      { readiness_id: readinessId, muscle_group_key: e.muscle_group_key, rating: e.rating });
  }
}

// --- cardio -----------------------------------------------------------------

export function rowToCardio(r: Row): CardioSession {
  return {
    id: str(r.id),
    date: str(r.date),
    type: str(r.type) as CardioSession['type'],
    sub_type: strOrNull(r.sub_type),
    duration_minutes: num(r.duration_minutes),
    distance_km: numOrNull(r.distance_km),
    avg_hr: numOrNull(r.avg_hr),
    max_hr: numOrNull(r.max_hr),
    zone_minutes: jsonOrNull<Record<string, number>>(r.zone_minutes),
    perceived_effort: numOrNull(r.perceived_effort),
    source: str(r.source) as CardioSession['source'],
    notes: strOrNull(r.notes),
  };
}

const C_COLS = 'id, date, type, sub_type, duration_minutes, distance_km, avg_hr, max_hr, zone_minutes, perceived_effort, source, notes';

export function getCardio(db: Db, id: string): CardioSession | null {
  const r = db.get(`SELECT ${C_COLS} FROM cardio_sessions WHERE id = $id`, { id });
  return r ? rowToCardio(r) : null;
}

export function listCardio(db: Db, from?: string, to?: string): CardioSession[] {
  const where: string[] = [];
  const params: Record<string, string> = {};
  if (from) { where.push('date >= $from'); params.from = from; }
  if (to) { where.push('date <= $to'); params.to = to; }
  return db.all(`SELECT ${C_COLS} FROM cardio_sessions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC, id`, params).map(rowToCardio);
}

export function insertCardio(db: Db, c: CardioSession): void {
  db.run(`INSERT INTO cardio_sessions (${C_COLS}) VALUES ($id, $date, $type, $sub_type, $duration_minutes, $distance_km, $avg_hr, $max_hr, $zone_minutes, $perceived_effort, $source, $notes)`,
    { ...c, zone_minutes: toJson(c.zone_minutes) });
}

export function deleteCardio(db: Db, id: string): boolean {
  return db.run('DELETE FROM cardio_sessions WHERE id = $id', { id }).changes > 0;
}
