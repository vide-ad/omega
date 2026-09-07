import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.js';
import { unlockAudio } from './lib/audio.js';
import { dexieCacheStore, dexieOutboxStore } from './offline/db.js';
import { installStores, installSyncTriggers } from './offline/sync.js';
import './styles.css';

installStores({ cache: dexieCacheStore, outbox: dexieOutboxStore });
installSyncTriggers();

// iOS needs a user gesture before audio will play; unlock on the first tap anywhere.
const unlock = () => { unlockAudio(); document.removeEventListener('touchend', unlock); document.removeEventListener('click', unlock); };
document.addEventListener('touchend', unlock, { passive: true });
document.addEventListener('click', unlock);

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
