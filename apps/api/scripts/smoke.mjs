// End-to-end smoke test against a real server process: seeds a throwaway database, boots
// src/server.ts via tsx, then walks health → templates → workout → set → summary.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'omega-smoke-'));
const port = Number(process.env.PORT ?? 8791);
const env = {
  ...process.env,
  OMEGA_DB_PATH: join(dir, 'smoke.db'),
  OMEGA_TOKEN_WRITE: process.env.OMEGA_TOKEN_WRITE ?? 'smoke-write-token-0123456789',
  OMEGA_TOKEN_READ: process.env.OMEGA_TOKEN_READ ?? 'smoke-read-token-0123456789',
  PORT: String(port),
};
const tsx = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const run = (args) => new Promise((res, rej) => {
  const p = spawn(tsx, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${args.join(' ')} exited ${code}`))));
});

const base = `http://127.0.0.1:${port}`;
const auth = { Authorization: `Bearer ${env.OMEGA_TOKEN_WRITE}`, 'content-type': 'application/json' };
const api = async (method, path, body) => {
  const r = await fetch(`${base}/api/v1${path}`, { method, headers: auth, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};

let server;
try {
  await run(['src/cli/seed.ts']);
  server = spawn(tsx, ['src/server.ts'], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log('health', await (await fetch(`${base}/api/health`)).json());
  const templates = await api('GET', '/templates');
  console.log('templates', templates.status, templates.body.items.map((t) => `${t.name} v${t.version} (${t.exercises.length})`));
  const meso = await api('GET', '/mesocycles');
  const start = meso.body.items[0].start_date;
  const w = await api('POST', '/workouts', { template_id: templates.body.items[0].id, date: start });
  console.log('workout', w.status, w.body.workout.id, 'week', w.body.workout.week_number);
  for (const e of w.body.exercises) console.log(`  ${e.exercise.name}: ${e.workout_exercise.reason} ${e.workout_exercise.suggested_weight_kg ?? '—'} kg × ${e.workout_exercise.target_sets} sets ${e.workout_exercise.target_rep_low}–${e.workout_exercise.target_rep_high} @RIR ${e.workout_exercise.target_rir}`);
  const bench = w.body.exercises.find((e) => e.exercise.name === 'Flat Barbell Bench Press');
  const set = await api('POST', `/workouts/${w.body.workout.id}/sets`, { workout_exercise_id: bench.workout_exercise.id, set_index: 1, weight_kg: 42.5, reps: 10, rir: 3 });
  console.log('set', set.status, set.body.id);
  const summary = await api('GET', '/summary?weeks=4');
  console.log('summary', summary.status, Object.keys(summary.body).join(', '));
  console.log('SMOKE OK');
} finally {
  server?.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true });
}
