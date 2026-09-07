import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

/** Values accepted by the Db helpers; booleans and undefined are normalised before binding. */
export type Bindable = SQLInputValue | boolean | undefined;
export type Params = Record<string, Bindable>;
export type Row = Record<string, SQLInputValue>;

function normalise(v: Bindable): SQLInputValue {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function normaliseParams(p: Params): Record<string, SQLInputValue> {
  const out: Record<string, SQLInputValue> = {};
  for (const [k, v] of Object.entries(p)) out[k] = normalise(v);
  return out;
}

/**
 * Thin wrapper over node:sqlite's DatabaseSync: caches prepared statements, normalises
 * parameter values and offers a transaction helper. Named parameters use `$name` in SQL and
 * bare keys in the params object.
 */
export class Db {
  readonly raw: DatabaseSync;
  private readonly cache = new Map<string, StatementSync>();
  private depth = 0;

  constructor(raw: DatabaseSync) {
    this.raw = raw;
  }

  private stmt(sql: string): StatementSync {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  run(sql: string, params: Params = {}): { changes: number } {
    const r = this.stmt(sql).run(normaliseParams(params));
    return { changes: Number(r.changes) };
  }

  get<T extends object = Row>(sql: string, params: Params = {}): T | undefined {
    return this.stmt(sql).get(normaliseParams(params)) as T | undefined;
  }

  all<T extends object = Row>(sql: string, params: Params = {}): T[] {
    return this.stmt(sql).all(normaliseParams(params)) as T[];
  }

  /** Runs `fn` inside a transaction (savepoints when nested). Rolls back on throw. */
  transaction<T>(fn: () => T): T {
    const name = `sp${this.depth}`;
    if (this.depth === 0) this.raw.exec('BEGIN IMMEDIATE');
    else this.raw.exec(`SAVEPOINT ${name}`);
    this.depth += 1;
    try {
      const out = fn();
      this.depth -= 1;
      if (this.depth === 0) this.raw.exec('COMMIT');
      else this.raw.exec(`RELEASE ${name}`);
      return out;
    } catch (err) {
      this.depth -= 1;
      if (this.depth === 0) this.raw.exec('ROLLBACK');
      else this.raw.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
      throw err;
    }
  }

  close(): void {
    this.cache.clear();
    this.raw.close();
  }
}

/**
 * Opens (creating if necessary) the SQLite database at `path` (`:memory:` for tests),
 * enabling WAL journaling and foreign-key enforcement.
 */
export function openDatabase(path: string): Db {
  if (path !== ':memory:') {
    const abs = resolve(path);
    mkdirSync(dirname(abs), { recursive: true });
    path = abs;
  }
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA busy_timeout = 5000');
  return new Db(raw);
}

/** In-memory database with migrations applied by the caller; convenience for tests. */
export function openMemoryDatabase(): Db {
  return openDatabase(':memory:');
}
