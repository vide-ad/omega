/**
 * The only place the app talks HTTP. Reads `{ baseUrl, token }` from localStorage (Settings screen).
 * `baseUrl` defaults to '' (same origin) so the PWA served by @omega/api works with no setup.
 */
import type { ApiError as ApiErrorBody, ApiErrorCode } from '@omega/core';

export const SETTINGS_KEYS = { baseUrl: 'omega.baseUrl', token: 'omega.token' } as const;

export interface ApiSettings { baseUrl: string; token: string }

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode etc. */ }
}

export function getSettings(): ApiSettings {
  return {
    baseUrl: (lsGet(SETTINGS_KEYS.baseUrl) ?? '').replace(/\/+$/, ''),
    token: lsGet(SETTINGS_KEYS.token) ?? '',
  };
}

export function saveSettings(s: ApiSettings): void {
  lsSet(SETTINGS_KEYS.baseUrl, s.baseUrl.trim().replace(/\/+$/, ''));
  lsSet(SETTINGS_KEYS.token, s.token.trim());
}

/** The server answered with an error envelope (or a non-JSON non-2xx). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'unknown';
  readonly details: unknown;
  constructor(status: number, code: ApiErrorCode | 'unknown', message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** No response at all: offline, DNS, CORS, timeout. Safe to retry. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export function isNetworkError(e: unknown): e is NetworkError {
  return e instanceof NetworkError;
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  timeoutMs?: number;
  /** When true, `path` is used as-is instead of being prefixed with `/api/v1`. */
  absolute?: boolean;
  signal?: AbortSignal;
}

export const V1 = '/api/v1';

/** Resolve an API-relative path (`/workouts`) to a full URL. */
export function resolveUrl(path: string, absolute = false): string {
  const { baseUrl } = getSettings();
  return `${baseUrl}${absolute ? path : V1 + path}`;
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.name === 'AbortError' ? 'Request timed out' : e.message;
  return String(e);
}

/**
 * Perform a request. Throws `NetworkError` when no response was obtained and `ApiError` for any
 * non-2xx status. Returns `undefined` for 204.
 */
export async function request<T>(method: HttpMethod, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const { token } = getSettings();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? (method === 'GET' ? 10_000 : 20_000));
  if (opts.signal) opts.signal.addEventListener('abort', () => controller.abort(), { once: true });

  let res: Response;
  try {
    res = await fetch(resolveUrl(path, opts.absolute), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (e) {
    throw new NetworkError(describeError(e));
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  if (!res.ok) {
    const env = (json as Partial<ApiErrorBody> | null)?.error;
    throw new ApiError(res.status, env?.code ?? 'unknown', env?.message ?? `${res.status} ${res.statusText || 'error'}`, env?.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  post: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>('POST', path, body, opts),
  patch: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>('PATCH', path, body, opts),
  put: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>('PUT', path, body, opts),
  del: <T = void>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, undefined, opts),
};

/** `GET /api/health` — the only unauthenticated route. */
export function health(): Promise<{ ok: boolean; version?: string }> {
  return request<{ ok: boolean; version?: string }>('GET', '/api/health', undefined, { absolute: true, timeoutMs: 6_000 });
}
