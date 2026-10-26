import { useEffect, useMemo, useRef } from 'react';
import { z } from 'zod';
import { materialQuoteReferenceSchema, MATERIAL_LIMITS } from '../shared/materials';
import { noteQuoteReferenceSchema } from '../shared/notes';
import { agendaReferenceSchema } from '../shared/agenda';
import { studyFocusRefSchema } from '../shared/study-presentation';
import { sourceBookmarkAddress, sourceBookmarkReferenceSchema } from '../shared/source-bookmark';
import { materialDocumentAddressSchema } from './materials/material-document-transfer';

const id = z.string().min(1).max(160), pixel = z.number().finite().min(0).max(100_000_000);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/), revision = z.number().int().positive();
const materialReturnSchema = z.object({
  resourceId: materialQuoteReferenceSchema.shape.resourceId,
  sha256,
  page: z.number().int().min(1).max(MATERIAL_LIMITS.pages),
  offset: z.number().int().nonnegative().max(MATERIAL_LIMITS.textCodePoints),
  view: z.enum(['text', 'page']),
  zoom: z.number().finite().min(25).max(400), scrollTop: pixel,
  selection: materialQuoteReferenceSchema.optional(),
}).strict().refine(value => !value.selection || value.selection.resourceId === value.resourceId && value.selection.sha256 === value.sha256
  && (value.selection.page === undefined || value.selection.page === value.page));
const noteReturnSchema = z.object({
  id: z.union([noteQuoteReferenceSchema.shape.id, z.literal('new')]),
  revision: revision.optional(), sha256: sha256.optional(),
  selection: noteQuoteReferenceSchema.optional(), scrollTop: pixel.optional(), pageTop: pixel.optional(),
}).strict().refine(value => value.id === 'new' ? !value.selection
  : !!value.revision && !!value.sha256 && (!value.selection || value.selection.id === value.id
    && value.selection.revision === value.revision && value.selection.sha256 === value.sha256));

/** This is a bookmark made only of addresses and viewing conditions. Strict
 * schemas reject copied drafts, source bodies, action receipts and grants. */
export const workspaceReturnAddressSchema = z.object({
  sessionId: id.optional(),
  view: z.enum(['chat', 'materials', 'notes', 'agenda', 'keep']),
  keep: z.object({ selectedKey: z.string().min(1).max(1000), writing: z.boolean() }).strict().optional(),
  readingPane: z.enum(['reader', 'chat']).optional(),
  message: z.object({ id, offset: z.number().finite().min(-100_000).max(100_000) }).strict().optional(),
  composer: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative(),
    direction: z.enum(['forward', 'backward', 'none']).optional(), focused: z.boolean().optional() }).strict().refine(value => value.end >= value.start).optional(),
  quote: sourceBookmarkReferenceSchema.transform(sourceBookmarkAddress).optional(),
  material: materialReturnSchema.optional(),
  materialDocument: materialDocumentAddressSchema.optional(),
  study: z.object({ messageId: id, focus: studyFocusRefSchema,
    question: pixel.optional(), manuscript: pixel.optional(), atEnd: z.boolean().optional() }).strict().optional(),
  note: noteReturnSchema.optional(),
  agenda: z.object({ record: agendaReferenceSchema, timeZone: z.string().min(1).max(100),
    trial: z.object({ proposedStart: z.string().datetime({ offset: true }),
      durationMinutes: z.number().int().min(1).max(1440).nullable().optional() }).strict().optional() }).strict().optional(),
}).strict().refine(value => !(value.message || value.study) || !!value.sessionId);
export type WorkspaceReturnAddress = z.infer<typeof workspaceReturnAddressSchema>;
export type WorkspaceReturnCheckpoint = WorkspaceReturnAddress & { savedAt: number };
export type MaterialReturnAddress = NonNullable<WorkspaceReturnAddress['material']>;
export type StudyReturnAddress = NonNullable<WorkspaceReturnAddress['study']>;
export type NoteReturnAddress = NonNullable<WorkspaceReturnAddress['note']>;
export type AgendaReturnAddress = NonNullable<WorkspaceReturnAddress['agenda']>;
const storageKey = 'zaichang.workspace-return.v1';
// A process-local invalidation counter must cancel live writes. The two
// durable epochs identify the same original owners when the app reopens.
const durableBoundary = (value: string) => /^\d+:\d+:\d+$/.test(value) ? value.split(':').slice(0, 2).join(':') : value;
function load(boundaryKey: string): WorkspaceReturnCheckpoint | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (stored?.version !== 1 || stored.boundary !== durableBoundary(boundaryKey)
      || typeof stored.savedAt !== 'number' || !Number.isFinite(stored.savedAt)) return;
    const parsed = workspaceReturnAddressSchema.safeParse(stored.address);
    if (parsed.success) return { ...parsed.data, savedAt: stored.savedAt };
  } catch { /* Original owners remain available without this bookmark. */ }
}

/** Native owners still decide whether an address can be opened. Reading this
 * bookmark restores neither a source permission nor an old proposal approval. */
export function useWorkspaceReturn({ boundaryKey, enabled = true }: { boundaryKey: string; enabled?: boolean }) {
  const context = useRef({ boundaryKey, enabled }); context.current = { boundaryKey, enabled };
  const previousBoundary = useRef<string | undefined>(enabled ? boundaryKey : undefined), pending = useRef<WorkspaceReturnCheckpoint | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const owner = useMemo(() => {
    const current = () => context.current.enabled && context.current.boundaryKey === boundaryKey;
    const changedBoundary = () => {
      if (previousBoundary.current === undefined) { previousBoundary.current = boundaryKey; return; }
      if (previousBoundary.current === boundaryKey) return;
      previousBoundary.current = boundaryKey; pending.current = undefined;
      try { localStorage.removeItem(storageKey); } catch { /* The in-window address is cleared too. */ }
    };
    const flush = () => {
      if (timer.current) clearTimeout(timer.current); timer.current = undefined;
      if (!current() || !pending.current) return;
      const { savedAt, ...address } = pending.current;
      try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, boundary: durableBoundary(boundaryKey), savedAt, address })); pending.current = undefined; }
      catch { /* Keep the address in this window if local preferences fail. */ }
    };
    return {
      read(): WorkspaceReturnCheckpoint | undefined {
        if (!current()) return;
        changedBoundary();
        const address = pending.current || load(boundaryKey);
        return address ? structuredClone(address) : undefined;
      },
      remember(value: WorkspaceReturnAddress | WorkspaceReturnCheckpoint): boolean {
        if (!current()) return false;
        changedBoundary();
        const { savedAt: _savedAt, ...address } = value as WorkspaceReturnCheckpoint;
        const parsed = workspaceReturnAddressSchema.safeParse(address);
        if (!parsed.success) return false;
        pending.current = { ...parsed.data, savedAt: Date.now() };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 160);
        return true;
      },
      /** Remove only the bookmark. Drafts, sources and business objects stay
       * with their owners; ignoring it creates no task or notification. */
      forget() {
        if (!current()) return;
        if (timer.current) clearTimeout(timer.current); timer.current = undefined;
        pending.current = undefined;
        try { localStorage.removeItem(storageKey); } catch { /* This window still dismisses it. */ }
      },
      flush,
    };
  }, [boundaryKey]);
  useEffect(() => {
    owner.read();
    const hide = () => { if (document.hidden) owner.flush(); };
    window.addEventListener('pagehide', owner.flush); window.addEventListener('beforeunload', owner.flush);
    document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('pagehide', owner.flush); window.removeEventListener('beforeunload', owner.flush);
      document.removeEventListener('visibilitychange', hide); owner.flush(); };
  }, [owner]);
  return owner;
}
