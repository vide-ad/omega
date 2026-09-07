import type { Context } from 'hono';
import { z } from 'zod';
import type { AuthVariables } from '../auth.js';
import { validationError } from '../errors.js';
import { parse } from '../validation.js';

export type Env = { Variables: AuthVariables };

/** Parses the JSON body (empty body = `{}`) and validates it. */
export async function body<T>(c: Context<Env>, schema: z.ZodType<T>): Promise<T> {
  const text = await c.req.text();
  let raw: unknown = {};
  if (text.trim() !== '') {
    try { raw = JSON.parse(text); } catch { throw validationError('Malformed JSON body'); }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw validationError('Body must be a JSON object');
  return parse(schema, raw);
}

export function param(c: Context<Env>, name: string): string {
  const v = c.req.param(name);
  if (!v) throw validationError(`missing path parameter ${name}`);
  return v;
}
