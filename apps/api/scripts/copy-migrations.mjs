// Copies src/db/migrations/*.sql next to the compiled migrate.js so `node dist/server.js` finds them.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'src/db/migrations');
const to = resolve(root, 'dist/db/migrations');
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true, filter: (p) => !/\.(ts|js)$/.test(p) || p === from });
console.log(`[build] copied migrations to ${to}`);
