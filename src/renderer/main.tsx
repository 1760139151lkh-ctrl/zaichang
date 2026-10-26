import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/noto-sans-sc';
import './design-system.css';
import { initializeAppearance } from './appearance';
import { CompanionProvider, initializeCompanion } from './companion';
import './workspace-scenes.css';
initializeAppearance();
initializeCompanion();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CompanionProvider><App /></CompanionProvider>
  </React.StrictMode>,
);
