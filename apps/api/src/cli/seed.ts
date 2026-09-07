import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { dbPathFromEnv, loadDotEnv } from '../env.js';
import { seedDatabase } from '../seed.js';
import { dateSchema } from '../validation.js';

loadDotEnv();

let start: string | undefined;
for (const arg of process.argv.slice(2)) {
  const m = /^--start=(.+)$/.exec(arg);
  if (m) {
    const parsed = dateSchema.safeParse(m[1]);
    if (!parsed.success) { console.error(`[seed] --start must be YYYY-MM-DD, got ${m[1]}`); process.exit(1); }
    start = parsed.data;
    if (new Date(`${start}T00:00:00.000Z`).getUTCDay() !== 6) console.warn(`[seed] warning: ${start} is not a Saturday; the seed templates expect the block to start on the first training day (Sat).`);
  } else if (arg === '--help' || arg === '-h') {
    console.log('usage: seed [--start=YYYY-MM-DD]   (default: next Saturday on/after today; an existing block keeps its start)');
    process.exit(0);
  } else {
    console.error(`[seed] unknown argument ${arg}`); process.exit(1);
  }
}

const path = dbPathFromEnv();
const db = openDatabase(path);
try {
  runMigrations(db);
  const s = seedDatabase(db, { start_date: start });
  console.log(`[seed] ${path}`);
  console.log(`[seed] mesocycle start ${s.mesocycle_start} (${s.mesocycle_start_source.replace('_', ' ')})`);
  console.log(`[seed] ${s.exercises} exercises, ${s.credits} muscle credits, ${s.templates} templates (${s.template_exercises} slots), ${s.starting_loads_inserted} starting loads inserted`);
} finally {
  db.close();
}
