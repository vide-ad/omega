import { Hono } from 'hono';
import { bearerAuth, tokenConfigFromEnv, type TokenConfig } from './auth.js';
import type { Db } from './db/connection.js';
import { errorBody, handleError } from './errors.js';
import { coachingRoutes } from './routes/coaching.js';
import { exerciseRoutes } from './routes/exercises.js';
import { mesocycleRoutes } from './routes/mesocycles.js';
import { readinessRoutes } from './routes/readiness.js';
import type { Env } from './routes/shared.js';
import { templateRoutes } from './routes/templates.js';
import { workoutRoutes } from './routes/workouts.js';
import type { AppContext } from './services/context.js';

export interface CreateAppOptions {
  db: Db;
  /** Defaults to OMEGA_TOKEN_WRITE / OMEGA_TOKEN_READ from the environment. */
  tokens?: TokenConfig;
  /** Clock used for "today"; injectable for tests. */
  now?: () => Date;
  /** Reported by GET /api/health. */
  version?: string;
}

export const API_PREFIX = '/api/v1';

/** CORS for the API: any origin, the two headers the PWA/coach send, preflight answered here. */
function cors(): import('hono').MiddlewareHandler<Env> {
  return async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Max-Age', '86400');
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    await next();
  };
}

/** Builds the API (mounted at /api/v1 plus GET /api/health). Static hosting lives in server.ts. */
export function createApp(opts: CreateAppOptions): Hono<Env> {
  const ctx: AppContext = { db: opts.db, now: opts.now ?? (() => new Date()) };
  const tokens = opts.tokens ?? tokenConfigFromEnv();
  const version = opts.version ?? '0.1.0';

  const app = new Hono<Env>();
  app.onError(handleError);
  app.use('/api/*', cors());
  app.get('/api/health', (c) => c.json({ ok: true, version }));

  const v1 = new Hono<Env>();
  v1.use('*', bearerAuth(tokens));
  v1.route('/', exerciseRoutes(ctx));
  v1.route('/', templateRoutes(ctx));
  v1.route('/', mesocycleRoutes(ctx));
  v1.route('/', workoutRoutes(ctx));
  v1.route('/', readinessRoutes(ctx));
  v1.route('/', coachingRoutes(ctx));
  v1.notFound((c) => c.json(errorBody('not_found', `No route for ${c.req.method} ${c.req.path}`), 404));
  app.route(API_PREFIX, v1);

  app.notFound((c) => c.json(errorBody('not_found', `No route for ${c.req.method} ${c.req.path}`), 404));
  return app;
}
