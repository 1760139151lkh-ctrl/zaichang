import { useEffect, useState } from 'react';

export interface Appearance {
  theme: 'system' | 'light' | 'dark';
  readingScale: number;
  density: 'comfortable' | 'compact';
}
const key = 'zaichang.appearance.v1';
const defaults: Appearance = { theme: 'system', readingScale: 1, density: 'comfortable' };
export function readAppearance(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : 'system',
      readingScale: [1, 1.15, 1.3].includes(value.readingScale) ? value.readingScale : 1,
      density: value.density === 'compact' ? 'compact' : 'comfortable',
    };
  } catch {
    return { ...defaults };
  }
}
function applyAppearance(value: Appearance) {
  document.documentElement.dataset.theme =
    value.theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : value.theme;
  document.documentElement.dataset.density = value.density;
  document.documentElement.style.setProperty('--reading-scale', String(value.readingScale));
}
export function initializeAppearance() {
  applyAppearance(readAppearance());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () =>
    applyAppearance(readAppearance()),
  );
}
export function useAppearance() {
  const [value, setValue] = useState(readAppearance);
  useEffect(() => {
    const changed = () => setValue(readAppearance());
    window.addEventListener('appearance-change', changed);
    return () => window.removeEventListener('appearance-change', changed);
  }, []);
  return [
    value,
    (patch: Partial<Appearance>) => {
      const next = { ...readAppearance(), ...patch };
      localStorage.setItem(key, JSON.stringify(next));
      applyAppearance(next);
      window.dispatchEvent(new Event('appearance-change'));
    },
  ] as const;
}
