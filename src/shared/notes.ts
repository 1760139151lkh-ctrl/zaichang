import { z } from 'zod';

export const NOTE_LIMITS = { title: 160, body: 200_000, page: 16_000, list: 100 } as const;
/** The string limits count Unicode code points. A supplementary point can use
 * two JSON \uXXXX escapes; include the existing mutation quote and envelope. */
export const NOTE_ARGUMENT_CHARACTERS = 12 * (NOTE_LIMITS.body + NOTE_LIMITS.title + 2000) + 1024;
const noteId = z.string().regex(/^note-[a-f0-9-]{36}$/);
const revision = z.number().int().positive();
export const noteListSchema = z
  .object({
    query: z.string().max(500).default(''),
    state: z.enum(['active', 'deleted']).default('active'),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().positive().max(NOTE_LIMITS.list).default(40),
  })
  .strict();
export const noteCreateSchema = z
  .object({
    title: z.string().max(NOTE_LIMITS.title).default(''),
    body: z.string().max(NOTE_LIMITS.body),
  })
  .strict()
  .refine((value) => !!value.title.trim() || !!value.body.trim(), '笔记内容不能为空。');
export const noteUpdateSchema = z
  .object({
    id: noteId,
    expectedRevision: revision,
    title: z.string().max(NOTE_LIMITS.title),
    body: z.string().max(NOTE_LIMITS.body),
  })
  .strict()
  .refine((value) => !!value.title.trim() || !!value.body.trim(), '笔记内容不能为空。');
export const noteStateSchema = z
  .object({ id: noteId, expectedRevision: revision, state: z.enum(['active', 'deleted']) })
  .strict();
export const noteUndoSchema = z
  .object({ id: noteId, expectedRevision: revision, targetRevision: revision })
  .strict();
export const noteReadSchema = z
  .object({
    id: noteId,
    revision: revision.optional(),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().positive().max(NOTE_LIMITS.page).default(NOTE_LIMITS.page),
  })
  .strict();
export const noteHistorySchema = z
  .object({
    id: noteId,
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().positive().max(NOTE_LIMITS.list).default(30),
  })
  .strict();

/** Times below describe this local document, never an inferred event in its text. */
export interface NoteMetadata {
  id: string;
  revision: number;
  title: string;
  state: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  ownerId: string;
  workspaceId: string;
  subjectId: string | null;
  source: {
    kind: 'user_note' | 'legacy' | 'unknown';
    via: 'notebook' | 'conversation' | 'unknown';
    eventId?: string;
  };
  /** A note may quote another person or describe fiction; no subject is inferred. */
  effectiveAt: string | null;
  coverage: 'document_only' | 'unknown';
  purposes: ['user_notebook'];
  attachmentLocators: { resourceId: string; name: string }[];
  sha256: string;
}
export interface NoteDocument extends NoteMetadata {
  body: string;
}
export interface NoteSummary extends NoteMetadata {
  preview: string;
  bodyLength: number;
}
export interface NotePage {
  note: NoteMetadata;
  body: string;
  offset: number;
  end: number;
  total: number;
  hasMore: boolean;
}
export interface NoteList {
  items: NoteSummary[];
  total: number;
  offset: number;
  hasMore: boolean;
}
export interface NoteVersion {
  revision: number;
  sha256: string;
  title: string;
  updatedAt: string;
  state: NoteMetadata['state'];
  operation: 'create' | 'edit' | 'delete' | 'restore' | 'undo';
  restoredFrom?: number;
}
export interface NoteHistory {
  items: NoteVersion[];
  total: number;
  hasMore: boolean;
}
export type NoteMutation =
  | { status: 'saved'; note: NoteDocument; previousRevision?: number; reused?: true }
  | { status: 'conflict'; current: NoteDocument };

export interface NotesBridge {
  notesList(input?: z.input<typeof noteListSchema>): Promise<NoteList>;
  notesRead(input: z.input<typeof noteReadSchema>): Promise<NotePage>;
  notesCreate(input: z.input<typeof noteCreateSchema>): Promise<NoteMutation>;
  notesUpdate(input: z.input<typeof noteUpdateSchema>): Promise<NoteMutation>;
  notesChangeState(input: z.input<typeof noteStateSchema>): Promise<NoteMutation>;
  notesUndo(input: z.input<typeof noteUndoSchema>): Promise<NoteMutation>;
  notesHistory(input: z.input<typeof noteHistorySchema>): Promise<NoteHistory>;
}
