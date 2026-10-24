import { useSyncExternalStore } from 'react';

const storageKey = 'zaichang.focus-session.v1';
export interface FocusSession {
  id: string;
  status: 'idle' | 'running' | 'paused' | 'ended';
  elapsedMs: number;
  startedAt?: string;
  changedAt?: string;
  recovered?: boolean;
  storageUnavailable?: boolean;
}

// A local clock only. It never infers activity, touches Study/Work, or sends
// model requests. The saved checkpoint excludes time after this process ends.
let current: FocusSession = { id: '', status: 'idle', elapsedMs: 0 };
let initialized = false, segmentAt = 0, segmentElapsed = 0, ticks = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, ...current }));
    if (current.storageUnavailable) { current = { ...current, storageUnavailable: false }; notify(); }
  } catch {
    if (!current.storageUnavailable) { current = { ...current, storageUnavailable: true }; notify(); }
  }
}
function update() {
  if (current.status !== 'running') return;
  current = { ...current, elapsedMs: segmentElapsed + Math.max(0, performance.now() - segmentAt) };
  notify();
}
function stopTimer() { if (timer) clearInterval(timer); timer = undefined; }
function startTimer() {
  stopTimer(); segmentElapsed = current.elapsedMs; segmentAt = performance.now(); ticks = 0;
  timer = setInterval(() => { update(); if (++ticks % 5 === 0) save(); }, 1000);
}
function initialize() {
  if (initialized) return;
  initialized = true;
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (value?.version === 1 && typeof value.id === 'string'
      && ['running', 'paused', 'ended'].includes(value.status)
      && typeof value.elapsedMs === 'number' && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0) {
      current = { id: value.id, status: value.status === 'running' ? 'paused' : value.status,
        elapsedMs: value.elapsedMs,
        ...(typeof value.startedAt === 'string' ? { startedAt: value.startedAt } : {}),
        ...(typeof value.changedAt === 'string' ? { changedAt: value.changedAt } : {}),
        ...(value.status === 'running' ? { recovered: true } : {}) };
      if (value.status === 'running') save();
    }
  } catch { current = { ...current, storageUnavailable: true }; }
  const checkpoint = () => { update(); save(); };
  window.addEventListener('pagehide', checkpoint);
  window.addEventListener('beforeunload', checkpoint);
}
const snapshot = () => { initialize(); return current; };
const subscribe = (listener: () => void) => { initialize(); listeners.add(listener); return () => { listeners.delete(listener); }; };

export const focusSession = {
  get: snapshot,
  start() {
    initialize();
    if (current.status === 'running' || current.status === 'paused') return;
    const now = new Date().toISOString();
    current = { id: crypto.randomUUID(), status: 'running', elapsedMs: 0, startedAt: now, changedAt: now };
    startTimer(); save(); notify();
  },
  pause() {
    initialize(); if (current.status !== 'running') return;
    update(); stopTimer(); current = { ...current, status: 'paused', changedAt: new Date().toISOString() };
    save(); notify();
  },
  resume() {
    initialize(); if (current.status !== 'paused') return;
    current = { ...current, status: 'running', changedAt: new Date().toISOString(), recovered: false };
    startTimer(); save(); notify();
  },
  end() {
    initialize(); if (!['running', 'paused'].includes(current.status)) return;
    update(); stopTimer(); current = { ...current, status: 'ended', changedAt: new Date().toISOString(), recovered: false };
    save(); notify(); return current;
  },
  clear() {
    initialize(); stopTimer(); current = { id: '', status: 'idle', elapsedMs: 0 };
    try { localStorage.removeItem(storageKey); } catch { current.storageUnavailable = true; }
    notify();
  },
};

export function useFocusSession() { return useSyncExternalStore(subscribe, snapshot, snapshot); }
