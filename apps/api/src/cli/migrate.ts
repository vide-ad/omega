import { openDatabase } from '../db/connection.js';
import { appliedMigrations, runMigrations } from '../db/migrate.js';
import { dbPathFromEnv, loadDotEnv } from '../env.js';

loadDotEnv();
const path = dbPathFromEnv();
const db = openDatabase(path);
try {
  const ran = runMigrations(db);
  console.log(`[migrate] ${path}: ${ran.length ? `applied ${ran.join(', ')}` : 'up to date'}`);
  for (const m of appliedMigrations(db)) console.log(`  ${m.name}  (${m.applied_at})`);
} finally {
  db.close();
}
