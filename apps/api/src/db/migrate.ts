import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Db } from './connection.js';

/** Directory holding NNN_name.sql files. Resolved next to this module in both src/ (tsx) and dist/ (copied at build). */
export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

export interface AppliedMigration { name: string; applied_at: string }

/**
 * Applies every `NNN_*.sql` in `dir` (sorted by filename) that is not yet recorded in `_migrations`,
 * each inside its own transaction. Returns the names applied in this run.
 */
export function runMigrations(db: Db, dir: string = DEFAULT_MIGRATIONS_DIR): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(db.all<AppliedMigration>('SELECT name, applied_at FROM _migrations').map((r) => r.name));
  const files = readdirSync(dir)
    .filter((f) => /^\d{3,}_.+\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b));
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.run('INSERT INTO _migrations (name, applied_at) VALUES ($name, $applied_at)', { name: file, applied_at: new Date().toISOString() });
    });
    ran.push(file);
  }
  return ran;
}

export function appliedMigrations(db: Db): AppliedMigration[] {
  return db.all<AppliedMigration>('SELECT name, applied_at FROM _migrations ORDER BY name');
}
