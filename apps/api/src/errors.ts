import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import type { ApiError, ApiErrorCode } from '@omega/core';

const STATUS: Record<ApiErrorCode, ContentfulStatusCode> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 400,
  conflict: 409,
  internal: 500,
};

export class ApiHttpError extends Error {
  readonly code: ApiErrorCode;
  readonly status: ContentfulStatusCode;
  readonly details: unknown;
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiHttpError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const notFound = (what: string, id?: string) => new ApiHttpError('not_found', id ? `${what} ${id} not found` : `${what} not found`);
export const validationError = (message: string, details?: unknown) => new ApiHttpError('validation_error', message, details);
export const conflict = (message: string, details?: unknown) => new ApiHttpError('conflict', message, details);

export function errorBody(code: ApiErrorCode, message: string, details?: unknown): ApiError {
  const err: ApiError['error'] = { code, message };
  if (details !== undefined) err.details = details;
  return { error: err };
}

/** Hono `onError` handler: typed errors keep their status, zod failures are 400, everything else is a logged 500. */
export function handleError(err: unknown, c: Context): Response {
  if (err instanceof ApiHttpError) return c.json(errorBody(err.code, err.message, err.details), err.status);
  if (err instanceof ZodError) return c.json(errorBody('validation_error', 'Request failed validation', err.issues), 400);
  if (err instanceof SyntaxError) return c.json(errorBody('validation_error', 'Malformed JSON body'), 400);
  // Hono's own HTTPException (e.g. body too large) carries a status.
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500;
  if (status >= 400 && status < 500) return c.json(errorBody('validation_error', (err as Error).message || 'Bad request'), status as ContentfulStatusCode);
  console.error('[api] unhandled error', err);
  return c.json(errorBody('internal', 'Internal server error'), 500);
}
