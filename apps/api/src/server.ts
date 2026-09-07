import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { tokenConfigFromEnv } from './auth.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { PACKAGE_ROOT, dbPathFromEnv, loadDotEnv, packageVersion } from './env.js';
import { errorBody } from './errors.js';
import { spaStatic } from './static.js';

loadDotEnv();

const tokens = tokenConfigFromEnv();           // throws with a clear message when misconfigured
const dbPath = dbPathFromEnv();
const db = openDatabase(dbPath);
const applied = runMigrations(db);
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';

const staticEnv = process.env.OMEGA_STATIC_DIR;
const staticDir = staticEnv && staticEnv.trim() !== ''
  ? (isAbsolute(staticEnv) ? staticEnv : resolve(process.cwd(), staticEnv))
  : resolve(PACKAGE_ROOT, '../web/dist');
const serveStaticSite = existsSync(resolve(staticDir, 'index.html'));

const app = createApp({ db, tokens, version: packageVersion() });
if (serveStaticSite) {
  app.use('*', spaStatic(staticDir));
} else {
  app.get('/', (c) => c.json({ ok: true, message: 'omega api — no static site configured (build @omega/web or set OMEGA_STATIC_DIR)', api: '/api/v1' }));
}
app.notFound((c) => c.json(errorBody('not_found', `No route for ${c.req.method} ${c.req.path}`), 404));

const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`[api] listening on http://${info.address}:${info.port}`);
  console.log(`[api] database ${dbPath}${applied.length ? ` (applied migrations: ${applied.join(', ')})` : ''}`);
  console.log(`[api] read token ${tokens.read ? 'configured' : 'not configured'}; static ${serveStaticSite ? staticDir : 'disabled'}`);
});

function shutdown(signal: string): void {
  console.log(`[api] ${signal}: shutting down`);
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
