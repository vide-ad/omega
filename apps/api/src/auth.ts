import { timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { errorBody } from './errors.js';

export type Scope = 'read' | 'write';

export interface TokenConfig {
  write: string;
  read: string | null;
}

export const MIN_TOKEN_LENGTH = 16;

/**
 * Reads OMEGA_TOKEN_WRITE / OMEGA_TOKEN_READ. Refuses to start without a write token of at least
 * 16 characters unless NODE_ENV=test (spec §6.1: auth exists from day one).
 */
export function tokenConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TokenConfig {
  const write = env.OMEGA_TOKEN_WRITE?.trim() ?? '';
  const read = env.OMEGA_TOKEN_READ?.trim() ?? '';
  const isTest = env.NODE_ENV === 'test';
  if (!isTest) {
    if (write.length === 0) throw new Error('OMEGA_TOKEN_WRITE is not set. Generate one with: openssl rand -hex 32');
    if (write.length < MIN_TOKEN_LENGTH) throw new Error(`OMEGA_TOKEN_WRITE must be at least ${MIN_TOKEN_LENGTH} characters`);
    if (read.length > 0 && read.length < MIN_TOKEN_LENGTH) throw new Error(`OMEGA_TOKEN_READ must be at least ${MIN_TOKEN_LENGTH} characters`);
    if (read.length > 0 && read === write) throw new Error('OMEGA_TOKEN_READ must differ from OMEGA_TOKEN_WRITE');
  }
  return { write, read: read.length > 0 ? read : null };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/** Scope granted by the `Authorization: Bearer` header, or null. Query strings are never consulted. */
export function scopeForRequest(c: Context, tokens: TokenConfig): Scope | null {
  const header = c.req.header('authorization') ?? c.req.header('Authorization');
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const token = m[1]!.trim();
  if (safeEqual(token, tokens.write)) return 'write';
  if (tokens.read !== null && safeEqual(token, tokens.read)) return 'read';
  return null;
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type AuthVariables = { scope: Scope };

/** Bearer middleware per docs/API.md: 401 without a valid token, 403 for a read token on a mutation. */
export function bearerAuth(tokens: TokenConfig): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    const scope = scopeForRequest(c, tokens);
    if (scope === null) {
      c.header('WWW-Authenticate', 'Bearer realm="omega"');
      return c.json(errorBody('unauthorized', 'A valid bearer token is required'), 401);
    }
    if (!READ_METHODS.has(c.req.method) && scope !== 'write') {
      return c.json(errorBody('forbidden', 'This token is read-only'), 403);
    }
    c.set('scope', scope);
    await next();
  };
}
