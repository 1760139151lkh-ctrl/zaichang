import { useEffect, useState } from 'react';
import type { State } from '../shared/types';
import type { CompanionEnvironment, EnvironmentCondition } from '../shared/environment';
export type { EnvironmentCondition } from '../shared/environment';

export const APPEARANCE_PALETTES = [
  { id: 'apricot', name: '暖杏' },
  { id: 'mist', name: '晨雾蓝' },
  { id: 'violet', name: '暮色紫' },
  { id: 'rain', name: '夜雨暖金' },
] as const;
export type AppearancePalette = (typeof APPEARANCE_PALETTES)[number]['id'];
export type AppearanceEnvironmentMode = 'auto' | 'manual';
export interface Appearance {
  /** Legacy callers still select a whole environment through this field. */
  theme: 'system' | 'light' | 'dark';
  palette: AppearancePalette;
  environmentMode: AppearanceEnvironmentMode;
  readingScale: number;
  density: 'comfortable' | 'compact';
}
export type AppearanceExpected = AppearancePalette | Pick<Appearance, 'palette' | 'environmentMode'>;

export type EnvironmentVariant = 'clear-day' | 'overcast-day' | 'rain-day' | 'dry-night' | 'rain-night' | 'twilight' | 'unknown';
const environmentPalettes: Record<Exclude<EnvironmentVariant, 'unknown'>, AppearancePalette> = {
  'clear-day': 'apricot', 'overcast-day': 'mist', 'rain-day': 'mist',
  twilight: 'violet', 'dry-night': 'rain', 'rain-night': 'rain',
};
/** A process-local host projection, never a saved preference or a weather store. */
export type AppearanceEnvironmentObservation = Pick<CompanionEnvironment,
  'weatherEnabled' | 'timeZone' | 'clockTimeZone' | 'status' | 'condition' | 'isDay'
  | 'observedAt' | 'expiresAt' | 'currentAt' | 'sunriseAt' | 'sunsetAt'>;
export interface EffectiveEnvironment {
  mode: AppearanceEnvironmentMode;
  palette: AppearancePalette;
  theme: 'light' | 'dark';
  light: 'morning' | 'dusk' | 'night';
  source: 'manual' | 'weather' | 'time';
  condition: EnvironmentCondition;
  isDay: boolean;
  timeZone: string;
  /** A request for matching artwork, never permission to use other weather. */
  requestedVariant: EnvironmentVariant;
  observedAt?: string;
  expiresAt?: string;
  weatherStatus: AppearanceEnvironmentObservation['status'];
  preview: boolean;
}

const key = 'zaichang.appearance.v1';
const defaultTimeZone = 'Asia/Shanghai';
const defaults: Appearance = { theme: 'system', palette: 'apricot', environmentMode: 'auto', readingScale: 1, density: 'comfortable' };
const palettes = new Set<string>(APPEARANCE_PALETTES.map(item => item.id));
let observation: AppearanceEnvironmentObservation | undefined;
let effective: EffectiveEnvironment | undefined;
let initialized = false;
let clock: ReturnType<typeof setTimeout> | undefined;
let stopHostEvents: (() => void) | undefined;
let hostRevision = 0;
const previews = new Map<symbol, Partial<Appearance>>();

function validTimeZone(value: string | undefined) {
  try {
    if (value) { new Intl.DateTimeFormat('en', { timeZone: value }); return value; }
  } catch { /* Invalid source zones fall back to the declared campus zone. */ }
  return defaultTimeZone;
}
function normalizeAppearance(raw: Partial<Appearance>, legacy = false): Appearance {
  let palette = palettes.has(raw.palette ?? '') ? raw.palette! : defaults.palette;
  const theme = ['system', 'light', 'dark'].includes(raw.theme ?? '') ? raw.theme! : 'system';
  const environmentMode = raw.environmentMode === 'manual' || raw.environmentMode === 'auto'
    ? raw.environmentMode
    : theme === 'system' && palette === 'apricot' ? 'auto' : 'manual';
  // Old independent dark + daytime combinations become a complete night room.
  // Companion/persona/image/placement storage is never read or rewritten here.
  if (legacy && environmentMode === 'manual' && theme === 'dark') palette = 'rain';
  return {
    theme: environmentMode === 'auto' ? 'system' : palette === 'rain' ? 'dark' : 'light',
    palette, environmentMode,
    readingScale: [1, 1.15, 1.3].includes(raw.readingScale ?? 0) ? raw.readingScale! : 1,
    density: raw.density === 'compact' ? 'compact' : 'comfortable',
  };
}
export function readAppearance(): Appearance {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...defaults };
    const value = raw as Partial<Appearance>;
    return normalizeAppearance(value, value.environmentMode === undefined);
  } catch { return { ...defaults }; }
}
function mergeAppearance(current: Appearance, patch: Partial<Appearance>): Appearance {
  const next = { ...current, ...patch };
  if (patch.environmentMode === undefined) {
    if (patch.palette !== undefined) next.environmentMode = 'manual';
    else if (patch.theme !== undefined) {
      next.environmentMode = patch.theme === 'system' ? 'auto' : 'manual';
      if (patch.theme === 'dark') next.palette = 'rain';
      if (patch.theme === 'light' && next.palette === 'rain') next.palette = 'apricot';
    }
  }
  return normalizeAppearance(next);
}
function displayedAppearance() {
  let value = readAppearance();
  for (const patch of previews.values()) value = mergeAppearance(value, patch);
  return value;
}
function localHour(now: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  return Number(parts.find(part => part.type === 'hour')?.value ?? 12)
    + Number(parts.find(part => part.type === 'minute')?.value ?? 0) / 60;
}
/** Shared projection for document surfaces and the room/character scene. */
export function resolveEffectiveEnvironment(value: Appearance, host: AppearanceEnvironmentObservation | undefined, now = Date.now()): EffectiveEnvironment {
  const observedAt = host?.observedAt ? Date.parse(host.observedAt) : NaN;
  const expiresAt = host?.expiresAt ? Date.parse(host.expiresAt) : NaN;
  const currentAt = host?.currentAt ? Date.parse(host.currentAt) : NaN;
  const fresh = host?.weatherEnabled === true && host.status === 'fresh'
    && Number.isFinite(observedAt) && observedAt <= now && Number.isFinite(expiresAt) && expiresAt > now
    && Number.isFinite(currentAt) && currentAt <= now + 60000 && now - currentAt <= 60 * 60000;
  const timeZone = validTimeZone(fresh && value.environmentMode === 'auto' ? host?.timeZone : host?.clockTimeZone);
  const hour = localHour(now, timeZone);
  const night = hour < 6 || hour >= 19;
  const sunsetAt = fresh && host?.sunsetAt ? Date.parse(host.sunsetAt) : NaN;
  const dusk = Number.isFinite(sunsetAt) ? now >= sunsetAt - 90 * 60000 && now < sunsetAt : hour >= 17 && hour < 19;
  const condition = fresh && host.condition ? host.condition : 'unknown';
  const isDay = fresh && typeof host.isDay === 'boolean' ? host.isDay : !night;
  const weatherStatus = host?.weatherEnabled === false ? 'disabled'
    : host?.status === 'fresh' && !fresh ? 'expired' : host?.status ?? 'unavailable';
  if (value.environmentMode === 'manual') return {
    mode: 'manual', palette: value.palette, theme: value.palette === 'rain' ? 'dark' : 'light',
    light: value.palette === 'rain' ? 'night' : value.palette === 'violet' ? 'dusk' : 'morning',
    source: 'manual', condition: 'unknown', isDay: value.palette !== 'rain', timeZone,
    requestedVariant: 'unknown', weatherStatus, preview: previews.size > 0,
  };
  const wet = condition === 'rain' || condition === 'storm';
  let requestedVariant: EnvironmentVariant = 'unknown';
  if (fresh && condition !== 'unknown') requestedVariant = !isDay
    ? wet ? 'rain-night' : condition === 'snow' ? 'unknown' : 'dry-night'
    : wet ? 'rain-day' : condition === 'clear' ? dusk ? 'twilight' : 'clear-day'
      : condition === 'cloudy' || condition === 'fog' ? 'overcast-day' : 'unknown';
  // A reviewed weather variant and its theme describe one room. A second
  // clock-based theme decision must not exclude that variant's own artwork.
  // Unsupported/unknown weather uses the person's declared clock only.
  const fallbackTimeZone = validTimeZone(host?.clockTimeZone);
  const fallbackHour = fallbackTimeZone === timeZone ? hour : localHour(now, fallbackTimeZone);
  const palette: AppearancePalette = requestedVariant !== 'unknown' ? environmentPalettes[requestedVariant]
    : fallbackHour < 6 || fallbackHour >= 19 ? 'rain' : fallbackHour >= 17 ? 'violet' : fallbackHour < 10 ? 'mist' : 'apricot';
  const fromWeather = requestedVariant !== 'unknown';
  return {
    mode: 'auto', palette, theme: palette === 'rain' ? 'dark' : 'light', light: palette === 'rain' ? 'night' : palette === 'violet' ? 'dusk' : 'morning',
    source: fromWeather ? 'weather' : 'time', condition, isDay: fromWeather ? isDay : palette !== 'rain',
    timeZone: fromWeather ? timeZone : fallbackTimeZone, requestedVariant,
    ...(fresh ? { observedAt: host?.observedAt ?? undefined, expiresAt: host?.expiresAt ?? undefined } : {}),
    weatherStatus, preview: previews.size > 0,
  };
}
export function readEffectiveEnvironment(): EffectiveEnvironment {
  return effective ??= resolveEffectiveEnvironment(displayedAppearance(), observation);
}
function applyAppearance() {
  if (!initialized) return;
  const value = displayedAppearance();
  effective = resolveEffectiveEnvironment(value, observation);
  const root = document.documentElement;
  root.dataset.palette = effective.palette;
  root.dataset.theme = effective.theme;
  root.dataset.environmentMode = effective.mode;
  root.dataset.environmentSource = effective.source;
  root.dataset.environmentVariant = effective.requestedVariant;
  root.dataset.density = value.density;
  root.style.setProperty('--reading-scale', String(value.readingScale));
  window.dispatchEvent(new Event('environment-change'));
  if (clock !== undefined) clearTimeout(clock);
  clock = undefined;
  if (value.environmentMode !== 'auto') return;
  const now = Date.now();
  const expiry = observation?.expiresAt ? Date.parse(observation.expiresAt) : NaN;
  // Local time/expiry boundaries only. This callback never requests weather.
  const nextQuarter = 900000 - now % 900000;
  clock = setTimeout(applyAppearance, Number.isFinite(expiry) && expiry > now ? Math.min(nextQuarter, expiry - now) : nextQuarter);
}
/** Host refreshes update the base projection without replacing a preview draft. */
export function updateAppearanceEnvironment(value: AppearanceEnvironmentObservation) {
  observation = { ...value };
  if (initialized) applyAppearance();
  else effective = undefined;
}
/** Every caller owns one overlay; cleanup restores the latest saved/host state. */
export function previewAppearance(patch: Partial<Appearance>) {
  const id = Symbol('appearance-preview');
  previews.set(id, { ...patch });
  applyAppearance();
  return () => { if (previews.delete(id)) applyAppearance(); };
}
export function initializeAppearance() {
  if (initialized) return;
  initialized = true;
  applyAppearance();
  window.addEventListener('storage', storageChanged);
  document.addEventListener('visibilitychange', visibilityChanged);
  const api = window.zaichang;
  if (!api) return;
  const acceptState = (state: State) => {
    hostRevision++;
    const next = state.environment ?? {
      weatherEnabled: state.settings.weatherEnabled,
      timeZone: 'Asia/Shanghai' as const,
      clockTimeZone: state.settings.timeZone ?? defaultTimeZone,
      status: state.settings.weatherEnabled ? 'unavailable' as const : 'disabled' as const,
      condition: 'unknown' as const, isDay: null, observedAt: null, expiresAt: null,
      currentAt: null, sunriseAt: null, sunsetAt: null,
    };
    updateAppearanceEnvironment(state.settings.weatherEnabled ? next : { ...next, weatherEnabled: false, status: 'disabled' });
  };
  stopHostEvents = api.onEvent(event => { if (event.type === 'state') acceptState(event.state); });
  const revision = hostRevision;
  if (api.environment) void api.environment().then(value => {
    if (initialized && revision === hostRevision) updateAppearanceEnvironment(value);
  }).catch(() => {
    if (initialized && revision === hostRevision) void api.state().then(state => {
      if (initialized && revision === hostRevision) acceptState(state);
    }).catch(() => { /* Time-only fallback remains explicit when the host is unavailable. */ });
  });
  else void api.state().then(state => {
    if (initialized && revision === hostRevision) acceptState(state);
  }).catch(() => { /* An older host still gets the declared time-only fallback. */ });
}
function storageChanged(event: StorageEvent) {
  if (event.key !== key && event.key !== null) return;
  applyAppearance();
  window.dispatchEvent(new Event('appearance-change'));
}
function visibilityChanged() { if (!document.hidden) applyAppearance(); }
if (import.meta.hot) import.meta.hot.dispose(() => {
  initialized = false;
  if (clock !== undefined) clearTimeout(clock);
  hostRevision++;
  stopHostEvents?.();
  window.removeEventListener('storage', storageChanged);
  document.removeEventListener('visibilitychange', visibilityChanged);
});
export function useEffectiveEnvironment() {
  const [value, setValue] = useState(readEffectiveEnvironment);
  useEffect(() => {
    const changed = () => setValue(readEffectiveEnvironment());
    window.addEventListener('environment-change', changed);
    changed();
    return () => window.removeEventListener('environment-change', changed);
  }, []);
  return value;
}
export const useAppearanceResolved = useEffectiveEnvironment;
export function useAppearance() {
  const [value, setValue] = useState(readAppearance);
  useEffect(() => {
    const changed = () => setValue(readAppearance());
    window.addEventListener('appearance-change', changed);
    return () => window.removeEventListener('appearance-change', changed);
  }, []);
  return [value, (patch: Partial<Appearance>, expected?: AppearanceExpected) => {
    const current = readAppearance();
    if (expected !== undefined && (typeof expected === 'string'
      ? current.palette !== expected
      : current.palette !== expected.palette || current.environmentMode !== expected.environmentMode)) {
      window.dispatchEvent(new Event('appearance-change'));
      throw new Error('窗边的选择刚在另一处换过。试看的样子还在，先看看新的选择吧。');
    }
    const next = mergeAppearance(current, patch);
    localStorage.setItem(key, JSON.stringify(next));
    applyAppearance();
    window.dispatchEvent(new Event('appearance-change'));
  }] as const;
}
