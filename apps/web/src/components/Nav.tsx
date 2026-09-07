import type { ReactNode } from 'react';
import type { RouteName } from '../router.js';
import { navigate } from '../router.js';
import { SyncBadge } from './SyncBadge.js';

export function TopBar(props: { title: ReactNode; back?: string; right?: ReactNode; fromCache?: boolean }) {
  return (
    <header className="topbar">
      {props.back !== undefined ? (
        <button type="button" className="topbar-back" aria-label="Back" onClick={() => navigate(props.back ?? '/')}>‹</button>
      ) : <span className="topbar-spacer" />}
      <h1 className="topbar-title">{props.title}</h1>
      <div className="topbar-right">
        {props.fromCache && <span className="pill pill-amber" title="Showing cached data — the API could not be reached">offline</span>}
        <SyncBadge />
        {props.right}
      </div>
    </header>
  );
}

const TABS: Array<{ name: RouteName; path: string; label: string; icon: string }> = [
  { name: 'home', path: '/', label: 'Home', icon: '⌂' },
  { name: 'readiness', path: '/readiness', label: 'Ready', icon: '☀' },
  { name: 'volume', path: '/volume', label: 'Volume', icon: '▥' },
  { name: 'history', path: '/history', label: 'History', icon: '≡' },
  { name: 'settings', path: '/settings', label: 'Settings', icon: '⚙' },
];

export function BottomNav(props: { active: RouteName }) {
  return (
    <nav className="bottomnav" aria-label="Primary">
      {TABS.map((t) => (
        <button
          key={t.name}
          type="button"
          className={`bottomnav-tab ${props.active === t.name ? 'bottomnav-on' : ''}`}
          aria-current={props.active === t.name ? 'page' : undefined}
          onClick={() => navigate(t.path)}
        >
          <span className="bottomnav-icon" aria-hidden="true">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
