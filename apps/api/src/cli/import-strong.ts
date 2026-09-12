/**
 * Import a Strong CSV export. Spec: docs/STRONG-IMPORT.md.
 *
 *   pnpm --filter @omega/api import:strong -- --file <path> [--dry-run] [--map <path>]
 *
 * --dry-run prints every mapping it would use, every unmapped name and every skipped row, and writes
 * nothing. Run it first, always. --map is a JSON object of extra Strong name to Omega name mappings.
 */
import { readFileSync } from 'node:fs';
import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import * as repo from '../db/repos/index.js';
import { dbPathFromEnv, loadDotEnv } from '../env.js';
import { applyImport, formatPlan, parseStrongCsv, planImport, StrongParseError } from '../import/strong.js';

loadDotEnv();

let file: string | null = null;
let mapPath: string | null = null;
let dryRun = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === '--file') file = args[++i] ?? null;
  else if (a.startsWith('--file=')) file = a.slice(7);
  else if (a === '--map') mapPath = args[++i] ?? null;
  else if (a.startsWith('--map=')) mapPath = a.slice(6);
  else if (a === '--dry-run') dryRun = true;
  else if (a === '--') continue;   // pnpm passes the separator through on some versions
  else if (a === '--help' || a === '-h') { console.log('usage: import:strong -- --file <path> [--dry-run] [--map <path>]'); process.exit(0); }
  else { console.error(`[import] unknown argument ${a}`); process.exit(1); }
}
if (!file) { console.error('[import] --file is required'); process.exit(1); }

let extraMapping: Record<string, string> = {};
if (mapPath) {
  const parsed: unknown = JSON.parse(readFileSync(mapPath, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || Object.values(parsed).some((v) => typeof v !== 'string')) {
    console.error('[import] --map must be a JSON object of Strong name to Omega name'); process.exit(1);
  }
  extraMapping = parsed as Record<string, string>;
}

const path = dbPathFromEnv();
const db = openDatabase(path);
try {
  runMigrations(db);
  let rows;
  try {
    rows = parseStrongCsv(readFileSync(file, 'utf8'));
  } catch (e) {
    if (e instanceof StrongParseError) { console.error(`[import] ${e.message}`); process.exit(1); }
    throw e;
  }
  const plan = planImport(rows, { exercises: repo.listAllExercises(db, { includeArchived: true }), extraMapping, now: () => new Date() });
  console.log(formatPlan(plan));
  if (dryRun) {
    console.log('\nDry run. Nothing written.');
  } else {
    const r = applyImport(db, plan, () => new Date());
    console.log(`\nWritten to ${path}.`);
    console.log(`${r.sessions_written} sessions and ${r.sets_written} sets written, ${r.sessions_already_present} sessions already present and left alone.`);
    console.log(`${r.cardio_written} cardio sessions written, ${r.exercises_created} archived exercises created, progression cache rebuilt for ${r.progression_refreshed} exercises.`);
  }
} finally {
  db.close();
}
