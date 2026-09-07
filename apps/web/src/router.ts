/**
 * Tiny hash router. Routes are `#/path/:param`. Pure matching lives in `matchRoute` so it can be
 * unit-tested; `useRoute` wires it to `hashchange`.
 */
import { useEffect, useState } from 'react';

export type RouteName = 'home' | 'session' | 'workout' | 'readiness' | 'volume' | 'history' | 'settings' | 'not_found';

export interface Route {
  name: RouteName;
  params: Record<string, string>;
  path: string;
}

const ROUTES: Array<{ name: RouteName; pattern: string }> = [
  { name: 'home', pattern: '/' },
  { name: 'session', pattern: '/session/:id' },
  { name: 'workout', pattern: '/workout/:id' },
  { name: 'readiness', pattern: '/readiness' },
  { name: 'volume', pattern: '/volume' },
  { name: 'history', pattern: '/history' },
  { name: 'settings', pattern: '/settings' },
];

export function normalizeHash(hash: string): string {
  let p = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!p.startsWith('/')) p = '/' + p;
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

export function matchRoute(hash: string): Route {
  const path = normalizeHash(hash);
  const segs = path.split('/').filter(Boolean);
  for (const r of ROUTES) {
    const pat = r.pattern.split('/').filter(Boolean);
    if (pat.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pat.length; i++) {
      const p = pat[i] ?? '';
      const s = segs[i] ?? '';
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(s);
      else if (p !== s) { ok = false; break; }
    }
    if (ok) return { name: r.name, params, path };
  }
  return { name: 'not_found', params: {}, path };
}

export function navigate(path: string, replace = false): void {
  const target = '#' + (path.startsWith('/') ? path : '/' + path);
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => matchRoute(typeof window === 'undefined' ? '/' : window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(matchRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    onChange();
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
