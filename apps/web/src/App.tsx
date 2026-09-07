import { useEffect, useState, type ReactNode } from 'react';
import { BottomNav, TopBar } from './components/Nav.js';
import { RestTimerBar } from './components/RestTimerBar.js';
import { navigate, useRoute } from './router.js';
import { HistoryScreen } from './screens/History.js';
import { HomeScreen } from './screens/Home.js';
import { ReadinessScreen } from './screens/Readiness.js';
import { SessionScreen } from './screens/Session.js';
import { SettingsScreen } from './screens/Settings.js';
import { VolumeScreen } from './screens/Volume.js';
import { getSettings } from './api/client.js';

const TITLES = { home: 'Omega', readiness: 'Morning readiness', volume: 'Weekly volume', history: 'History', settings: 'Settings', not_found: 'Not found', session: 'Session', workout: 'Workout' } as const;

export function App() {
  const route = useRoute();
  const [fromCache, setFromCache] = useState(false);
  useEffect(() => { setFromCache(false); }, [route.path]);
  // First run with no token: land on Settings so the user can connect.
  useEffect(() => {
    if (route.name === 'home' && !getSettings().token && !sessionStorage.getItem('omega.visitedSettings')) {
      sessionStorage.setItem('omega.visitedSettings', '1');
      navigate('/settings', true);
    }
  }, [route.name]);

  if (route.name === 'session' || route.name === 'workout') {
    return <SessionScreen key={route.params.id} id={route.params.id ?? ''} readOnly={route.name === 'workout'} />;
  }

  let body: ReactNode;
  switch (route.name) {
    case 'home': body = <HomeScreen setFromCache={setFromCache} />; break;
    case 'readiness': body = <ReadinessScreen setFromCache={setFromCache} />; break;
    case 'volume': body = <VolumeScreen setFromCache={setFromCache} />; break;
    case 'history': body = <HistoryScreen setFromCache={setFromCache} />; break;
    case 'settings': body = <SettingsScreen />; break;
    default: body = <div className="screen"><div className="muted">Nothing at {route.path}.</div></div>;
  }
  return (
    <>
      <TopBar title={TITLES[route.name]} fromCache={fromCache} />
      {body}
      <RestTimerBar />
      <BottomNav active={route.name} />
    </>
  );
}
