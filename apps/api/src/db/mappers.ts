/** Row ↔ domain conversions shared by the repositories. */

export function bool(v: unknown): boolean {
  return v === 1 || v === true || v === 1n;
}

export function num(v: unknown): number {
  return typeof v === 'bigint' ? Number(v) : (v as number);
}

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return num(v);
}

export function str(v: unknown): string {
  return v as string;
}

export function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : (v as string);
}

export function json<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  try {
    return JSON.parse(v as string) as T;
  } catch {
    return fallback;
  }
}

export function jsonOrNull<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  try {
    return JSON.parse(v as string) as T;
  } catch {
    return null;
  }
}

export function toJson(v: unknown): string | null {
  return v === null || v === undefined ? null : JSON.stringify(v);
}
