import { useEffect, useMemo, useRef } from 'react';

export interface StudyReadingPosition {
  question: number;
  manuscript: number;
  questionLeft?: number;
  manuscriptLeft?: number;
  atEnd: boolean;
}
interface Address extends StudyReadingPosition {
  sessionId: string;
  studyId: string;
  ownerRevision: number;
  touchedAt: number;
}
const storageKey = 'zaichang.study-reading.v1';
const persistedBoundary = (value: string) => /^\d+:\d+:\d+$/.test(value) ? value.split(':').slice(0, 2).join(':') : value;
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
function position(value: unknown): StudyReadingPosition | undefined {
  if (!value || typeof value !== 'object') return;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.question !== 'number' || !Number.isFinite(candidate.question) || candidate.question < 0 || candidate.question > 100_000_000
    || typeof candidate.manuscript !== 'number' || !Number.isFinite(candidate.manuscript) || candidate.manuscript < 0 || candidate.manuscript > 100_000_000
    || typeof candidate.atEnd !== 'boolean') return;
  const horizontal = (coordinate: unknown) => coordinate === undefined ? 0
    : typeof coordinate === 'number' && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 100_000_000 ? coordinate : undefined;
  const questionLeft = horizontal(candidate.questionLeft), manuscriptLeft = horizontal(candidate.manuscriptLeft);
  if (questionLeft === undefined || manuscriptLeft === undefined) return;
  return { question: candidate.question, manuscript: candidate.manuscript, questionLeft, manuscriptLeft, atEnd: candidate.atEnd };
}
function load(boundaryKey: string): Address[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!value || value.version !== 1 || value.boundary !== persistedBoundary(boundaryKey) || !Array.isArray(value.entries)) return [];
    return value.entries.flatMap((entry: unknown) => {
      const viewing = position(entry);
      if (!viewing) return [];
      const address = entry as Record<string, unknown>;
      return id(address.sessionId) && id(address.studyId) && Number.isInteger(address.ownerRevision) && Number(address.ownerRevision) > 0
        && typeof address.touchedAt === 'number' && Number.isFinite(address.touchedAt)
        ? [{ ...viewing, sessionId: address.sessionId, studyId: address.studyId, ownerRevision: Number(address.ownerRevision), touchedAt: address.touchedAt }] : [];
    }).slice(0, 64);
  } catch { return []; }
}

/** Scroll addresses only. The Study owner is reopened and checked normally;
 * a revision may keep its viewing position, never old help or a selection. */
export function useStudyReadingPosition({ sessionId, studyId, ownerRevision, boundaryKey, enabled = true }: {
  sessionId: string;
  studyId: string;
  ownerRevision: number;
  boundaryKey: string;
  enabled?: boolean;
}) {
  const current = useRef({ sessionId, studyId, ownerRevision, boundaryKey, enabled });
  current.current = { sessionId, studyId, ownerRevision, boundaryKey, enabled };
  const liveBoundary = useRef(boundaryKey), pending = useRef<Address | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const address = useMemo(() => {
    const valid = () => current.current.enabled && current.current.boundaryKey === boundaryKey
      && current.current.sessionId === sessionId && current.current.studyId === studyId;
    const resetBoundary = () => {
      if (liveBoundary.current === boundaryKey) return;
      liveBoundary.current = boundaryKey; pending.current = undefined;
      try { localStorage.removeItem(storageKey); } catch { /* The live address is cleared too. */ }
    };
    const flush = () => {
      if (timer.current) clearTimeout(timer.current); timer.current = undefined;
      if (!valid() || !pending.current) return;
      const entry = pending.current;
      if (entry.sessionId !== sessionId || entry.studyId !== studyId) return;
      resetBoundary();
      // Merge with the latest other-paper addresses, so multiple Study views
      // do not replace one another's current position with an older cache.
      const entries = [entry, ...load(boundaryKey).filter(item => item.sessionId !== sessionId || item.studyId !== studyId)].slice(0, 64);
      try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, boundary: persistedBoundary(boundaryKey), entries })); pending.current = undefined; }
      catch { /* The current paper keeps its in-window position. */ }
    };
    return {
      restore(): StudyReadingPosition | undefined {
        if (!valid()) return;
        resetBoundary();
        const entry = pending.current?.sessionId === sessionId && pending.current.studyId === studyId ? pending.current
          : load(boundaryKey).find(item => item.sessionId === sessionId && item.studyId === studyId);
        return position(entry);
      },
      save(value: StudyReadingPosition) {
        const viewing = position(value);
        if (!valid() || !viewing || !id(sessionId) || !id(studyId) || !Number.isInteger(current.current.ownerRevision) || current.current.ownerRevision < 1) return;
        resetBoundary(); pending.current = { ...viewing, sessionId, studyId, ownerRevision: current.current.ownerRevision, touchedAt: Date.now() };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 160);
      },
      flush,
    };
  }, [sessionId, studyId, boundaryKey]);
  useEffect(() => {
    address.restore();
    const hide = () => { if (document.hidden) address.flush(); };
    window.addEventListener('pagehide', address.flush); document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('pagehide', address.flush); document.removeEventListener('visibilitychange', hide); address.flush(); };
  }, [address]);
  return address;
}
