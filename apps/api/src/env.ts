import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/api — the package root, whether running from src/ (tsx) or dist/ (node). */
export const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Loads KEY=VALUE pairs from a `.env` file into process.env without overriding values that are
 * already set. Supports `#` comments, blank lines, an optional `export ` prefix and single/double quotes.
 */
export function loadDotEnv(path: string = resolve(process.cwd(), '.env')): string[] {
  if (!existsSync(path)) return [];
  const loaded: string[] = [];
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    let value = m[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    if (process.env[key] === undefined) { process.env[key] = value; loaded.push(key); }
  }
  return loaded;
}

export function dbPathFromEnv(): string {
  return process.env.OMEGA_DB_PATH && process.env.OMEGA_DB_PATH.trim() !== '' ? process.env.OMEGA_DB_PATH : './data/omega.db';
}

export function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
