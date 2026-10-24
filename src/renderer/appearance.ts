import { useEffect, useState } from 'react';

export const APPEARANCE_PALETTES = [
  { id: 'apricot', name: '暖杏' },
  { id: 'mist', name: '晨雾蓝' },
  { id: 'violet', name: '暮色紫' },
  { id: 'rain', name: '夜雨暖金' },
] as const;
export type AppearancePalette = (typeof APPEARANCE_PALETTES)[number]['id'];

export interface Appearance {
  theme: 'system' | 'light' | 'dark';
  palette: AppearancePalette;
  readingScale: number;
  density: 'comfortable' | 'compact';
}
const key = 'zaichang.appearance.v1';
const defaults: Appearance = { theme: 'system', palette: 'apricot', readingScale: 1, density: 'comfortable' };
export function readAppearance(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : 'system',
      palette: APPEARANCE_PALETTES.some(item => item.id === value.palette) ? value.palette : defaults.palette,
      readingScale: [1, 1.15, 1.3].includes(value.readingScale) ? value.readingScale : 1,
      density: value.density === 'compact' ? 'compact' : 'comfortable',
    };
  } catch {
    return { ...defaults };
  }
}
function applyAppearance(value: Appearance) {
  document.documentElement.dataset.palette = value.palette;
  document.documentElement.dataset.theme =
    value.theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : value.theme;
  document.documentElement.dataset.density = value.density;
  document.documentElement.style.setProperty('--reading-scale', String(value.readingScale));
}
/** Applies a setting's local preview. Closing or cancelling the setting reads
 * the current saved choice again, including changes from another window. */
export function previewAppearance(patch: Partial<Appearance>) {
  applyAppearance({ ...readAppearance(), ...patch });
  return () => applyAppearance(readAppearance());
}
export function initializeAppearance() {
  applyAppearance(readAppearance());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyAppearance(readAppearance());
    window.dispatchEvent(new Event('appearance-change'));
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    applyAppearance(readAppearance());
    window.dispatchEvent(new Event('appearance-change'));
  });
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
    (patch: Partial<Appearance>, expectedPalette?: AppearancePalette) => {
      const current = readAppearance();
      if (expectedPalette !== undefined && current.palette !== expectedPalette) {
        window.dispatchEvent(new Event('appearance-change'));
        throw new Error('色彩刚在另一处换过。试看的样子还在，先看看新的选择吧。');
      }
      const next = { ...current, ...patch };
      localStorage.setItem(key, JSON.stringify(next));
      applyAppearance(next);
      window.dispatchEvent(new Event('appearance-change'));
    },
  ] as const;
}
