import { validationError } from './errors.js';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function parseLimit(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw validationError('limit must be a positive integer');
  return Math.min(n, MAX_LIMIT);
}

/** Cursor = base64url of the JSON sort key of the last row on the previous page. */
export function encodeCursor(key: unknown): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

export function decodeCursor<T>(raw: string | undefined, check: (v: unknown) => v is T): T | undefined {
  if (raw === undefined || raw === '') return undefined;
  try {
    const v: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!check(v)) throw new Error('shape');
    return v;
  } catch {
    throw validationError('cursor is invalid');
  }
}

/** Trims a `limit + 1` result set to a page and computes the next cursor from the last row. */
export function paginate<T>(rows: T[], limit: number, key: (row: T) => unknown): { items: T[]; next_cursor: string | null } {
  const items = rows.length > limit ? rows.slice(0, limit) : rows;
  const next_cursor = rows.length > limit ? encodeCursor(key(items[items.length - 1]!)) : null;
  return { items, next_cursor };
}
