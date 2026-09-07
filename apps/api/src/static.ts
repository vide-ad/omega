import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { MiddlewareHandler } from 'hono';
import type { Env } from './routes/shared.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

export function contentTypeFor(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** Cache policy: hashed Vite assets are immutable; the SPA shell, service worker and manifest must always revalidate. */
function cacheControl(relPath: string): string {
  const base = relPath.split('/').pop() ?? '';
  if (base === 'sw.js' || base === 'index.html' || base.endsWith('.webmanifest')) return 'no-cache';
  if (relPath.startsWith('assets/')) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

/**
 * Serves `root` for any non-/api GET/HEAD with an SPA fallback to index.html. Path traversal is
 * rejected by resolving inside `root`. sw.js gets a Service-Worker-Allowed header for the whole scope.
 */
export function spaStatic(root: string): MiddlewareHandler<Env> {
  const absRoot = resolve(root);
  const index = join(absRoot, 'index.html');
  return async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();
    if (c.req.path.startsWith('/api')) return next();
    let rel: string;
    try { rel = decodeURIComponent(c.req.path); } catch { return c.text('Bad request', 400); }
    rel = normalize(rel).replace(/^([/\\])+/, '');
    let file = resolve(absRoot, rel);
    if (file !== absRoot && !file.startsWith(absRoot + sep)) return c.text('Forbidden', 403);
    let st = existsSync(file) ? statSync(file) : null;
    if (st?.isDirectory()) { file = join(file, 'index.html'); st = existsSync(file) ? statSync(file) : null; }
    if (!st || !st.isFile()) {
      // SPA fallback: only for navigations (no extension), never for missing assets.
      if (extname(rel) !== '' || !existsSync(index)) return next();
      file = index; st = statSync(index); rel = 'index.html';
    }
    const relForCache = file.slice(absRoot.length + 1).split(sep).join('/');
    c.header('Content-Type', contentTypeFor(file));
    c.header('Content-Length', String(st.size));
    c.header('Cache-Control', cacheControl(relForCache));
    if (relForCache === 'sw.js') c.header('Service-Worker-Allowed', '/');
    if (c.req.method === 'HEAD') return c.body(null, 200);
    return c.body(Readable.toWeb(createReadStream(file)) as ReadableStream, 200);
  };
}
