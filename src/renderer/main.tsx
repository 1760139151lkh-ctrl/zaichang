import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/noto-sans-sc';
import './design-system.css';
import { initializeAppearance } from './appearance';
import { CompanionProvider, initializeCompanion } from './companion';
import './workspace-scenes.css';
import './coherent-desk.css';
import { DictationProvider } from './voice/DictationProvider';
import { DictationFieldFeedback } from './voice/VoiceInput';
import './voice/voice-input.css';
// KaTeX's bundled font-display:block briefly erased inline formulae on the
// first return to a conversation. Keep readable glyphs while local fonts load.
document.fonts.forEach(font => {
  if (font.family.replaceAll('"', '').startsWith('KaTeX_')) {
    font.display = 'swap';
    void font.load().catch(() => {});
  }
});
initializeAppearance();
initializeCompanion();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CompanionProvider><DictationProvider><App /><DictationFieldFeedback /></DictationProvider></CompanionProvider>
  </React.StrictMode>,
);
