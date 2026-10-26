import { useEffect, useMemo, useRef } from 'react';
import { MATERIAL_LIMITS } from '../shared/materials';

export interface MaterialReadingResource { resourceId: string; sha256: string }
export interface MaterialReadingPosition {
  page: number;
  offset: number;
  view: 'text' | 'page';
  zoom: number;
  scrollTop: number;
}
type Entry = MaterialReadingResource & MaterialReadingPosition & { touchedAt: number };
type Store = { boundary: string; entries: Entry[]; dirty: boolean };
const storageKey = 'zaichang.material-reading.v1';
const maximumEntries = 64;
// The third App boundary component is a process-local invalidation counter.
// It must clear live addresses when it changes, but cannot identify a restart.
const persistedBoundary = (boundary: string) => /^\d+:\d+:\d+$/.test(boundary)
  ? boundary.split(':').slice(0, 2).join(':') : boundary;
const resourceValid = (value: MaterialReadingResource) => /^material-[a-f0-9-]{36}$/.test(value.resourceId)
  && /^[a-f0-9]{64}$/.test(value.sha256);
function position(value: unknown): MaterialReadingPosition | undefined {
  if (!value || typeof value !== 'object') return;
  const item = value as Record<string, unknown>;
  if (!Number.isInteger(item.page) || Number(item.page) < 1 || Number(item.page) > MATERIAL_LIMITS.pages
    || !Number.isInteger(item.offset) || Number(item.offset) < 0 || Number(item.offset) > MATERIAL_LIMITS.textCodePoints
    || !['text', 'page'].includes(String(item.view))
    || typeof item.zoom !== 'number' || !Number.isFinite(item.zoom) || item.zoom < 25 || item.zoom > 400
    || typeof item.scrollTop !== 'number' || !Number.isFinite(item.scrollTop) || item.scrollTop < 0) return;
  return { page: Number(item.page), offset: Number(item.offset), view: item.view as 'text' | 'page',
    zoom: item.zoom, scrollTop: item.scrollTop };
}
function load(boundary: string, key = storageKey): Store {
  const empty: Store = { boundary, entries: [], dirty: false };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return empty;
    const saved = JSON.parse(raw);
    if (saved?.version !== 1 || saved.boundary !== persistedBoundary(boundary) || !Array.isArray(saved.entries)) {
      localStorage.removeItem(key);
      return empty;
    }
    const seen = new Set<string>();
    for (const item of saved.entries) {
      const address = position(item);
      if (!address || typeof item.resourceId !== 'string' || typeof item.sha256 !== 'string'
        || !resourceValid(item) || typeof item.touchedAt !== 'number' || !Number.isFinite(item.touchedAt)
        || item.touchedAt < 0 || seen.has(item.resourceId)) continue;
      seen.add(item.resourceId);
      empty.entries.push({ resourceId: item.resourceId, sha256: item.sha256, ...address, touchedAt: item.touchedAt });
      if (empty.entries.length >= maximumEntries) break;
    }
  } catch { /* Reading remains available when local preferences cannot be read. */ }
  return empty;
}

/** Addresses only. The caller supplies currently readable owner metadata and
 * reopens through materialsRead; this preference never restores source access. */
export function useMaterialReadingPosition({ boundary, readerId }: { boundary: string; readerId?: string }) {
  const positionKey = readerId ? `${storageKey}:${readerId}` : storageKey;
  const currentBoundary = useRef(boundary);
  currentBoundary.current = boundary;
  const currentKey = useRef(positionKey); currentKey.current = positionKey;
  const saved = useRef<Store | undefined>(undefined);
  const savedKey = useRef(positionKey);
  if (savedKey.current !== positionKey) { saved.current = undefined; savedKey.current = positionKey; }
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const positions = useMemo(() => {
    function current() {
      // A delayed page render from an older source boundary cannot write back.
      if (currentBoundary.current !== boundary || currentKey.current !== positionKey) return;
      if (saved.current && saved.current.boundary !== boundary) {
        saved.current = { boundary, entries: [], dirty: false };
        try { localStorage.removeItem(positionKey); } catch { /* Current addresses are cleared in memory too. */ }
      }
      saved.current ||= load(boundary, positionKey);
      return saved.current;
    }
    function flush() {
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = undefined;
      const store = current();
      if (!store?.dirty) return;
      try {
        if (store.entries.length) localStorage.setItem(positionKey,
          JSON.stringify({ version: 1, boundary: persistedBoundary(boundary), entries: store.entries }));
        else localStorage.removeItem(positionKey);
        store.dirty = false;
      } catch { /* Keep the in-window address if preferences cannot be saved. */ }
    }
    function changed(store: Store) {
      store.dirty = true;
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 200);
    }
    function restore(resource: MaterialReadingResource) {
      if (!resourceValid(resource)) return;
      const store = current();
      if (!store) return;
      // A new independent window can inherit its earlier single-reader place;
      // its later writes stay in its own namespace rather than erasing peers.
      const entry = store.entries.find(item => item.resourceId === resource.resourceId)
        || (readerId ? load(boundary).entries.find(item => item.resourceId === resource.resourceId) : undefined);
      if (!entry) return;
      if (entry.sha256 !== resource.sha256) {
        store.entries = store.entries.filter(item => item.resourceId !== resource.resourceId);
        changed(store);
        return;
      }
      return position(entry);
    }
    return {
      restore,
      save(resource: MaterialReadingResource, address: MaterialReadingPosition) {
        const checked = position(address), store = current();
        if (!store || !checked || !resourceValid(resource)) return;
        const previous = store.entries.find(item => item.resourceId === resource.resourceId);
        if (previous?.sha256 === resource.sha256 && previous.page === checked.page && previous.offset === checked.offset
          && previous.view === checked.view && previous.zoom === checked.zoom && previous.scrollTop === checked.scrollTop
          && store.entries[0] === previous) return;
        store.entries = [{ resourceId: resource.resourceId, sha256: resource.sha256, ...checked, touchedAt: Date.now() },
          ...store.entries.filter(item => item.resourceId !== resource.resourceId)].slice(0, maximumEntries);
        changed(store);
      },
      latest<T extends MaterialReadingResource>(resources: readonly T[]): { resource: T; position: MaterialReadingPosition } | undefined {
        const store = current();
        if (!store) return;
        for (const entry of [...store.entries].sort((a, b) => b.touchedAt - a.touchedAt)) {
          const resource = resources.find(item => item.resourceId === entry.resourceId && item.sha256 === entry.sha256);
          if (resource) return { resource, position: position(entry)! };
        }
      },
      /** Call after a successful owner list, including any current pending
       * reference. An initial loading/failed/partial list cannot revoke sources. */
      retain(resources: readonly MaterialReadingResource[]) {
        const store = current();
        if (!store) return;
        const entries = store.entries.filter(entry => resources.some(item => item.resourceId === entry.resourceId && item.sha256 === entry.sha256));
        if (entries.length !== store.entries.length) { store.entries = entries; changed(store); }
      },
      clear() {
        const store = current();
        if (!store) return;
        store.entries = []; store.dirty = true; flush();
      },
      flush,
    };
  }, [boundary, positionKey]);
  useEffect(() => {
    // Load now so a changed boundary clears old addresses even before a file
    // is opened. No file name, quote, pixel, credential or access key is stored.
    positions.latest([]);
    const hiding = () => { if (document.visibilityState === 'hidden') positions.flush(); };
    window.addEventListener('pagehide', positions.flush);
    document.addEventListener('visibilitychange', hiding);
    return () => {
      window.removeEventListener('pagehide', positions.flush);
      document.removeEventListener('visibilitychange', hiding);
      positions.flush();
    };
  }, [positions]);
  return positions;
}
