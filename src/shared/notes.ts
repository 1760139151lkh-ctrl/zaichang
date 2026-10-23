import { z } from 'zod';

export const NOTE_LIMITS = { title: 160, body: 200_000, page: 16_000, list: 100 } as const;
/** The string limits count Unicode code points. A supplementary point can use
 * two JSON \uXXXX escapes; include the existing mutation quote and envelope. */
export const NOTE_ARGUMENT_CHARACTERS = 12 * (NOTE_LIMITS.body + NOTE_LIMITS.title + 2000) + 1024;
const noteId = z.string().regex(/^note-[a-f0-9-]{36}$/);
const revision = z.number().int().positive();
/** A selection in a saved notebook revision, independent of an assistant
 * Scene. The owner re-reads it; display text and draft edits grant no access. */
export const notebookQuoteReferenceSchema = z.object({
  noteId,
  revision,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  start: z.number().int().nonnegative().max(NOTE_LIMITS.body),
  end: z.number().int().positive().max(NOTE_LIMITS.body),
}).strict().refine(value => value.end > value.start && value.end - value.start <= 1200,
  '选一小段已保存的笔记，再接着聊。');
export type NotebookQuoteReference = z.infer<typeof notebookQuoteReferenceSchema>;
export interface NotebookQuote { reference: NotebookQuoteReference; title: string; text: string }
export const noteListSchema = z
  .object({
    query: z.string().max(500).default('').describe('按标题或正文作字面匹配；空字符串列出所选范围中的全部笔记。'),
    state: z.enum(['active', 'deleted']).default('active').describe('列表范围：active 为未删除的笔记，deleted 为回收站；助手的读取范围只有未删除的笔记。'),
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
    /** Original address only; opening it rechecks the MaterialService owner.
     * The user's deliberately kept note remains a notebook document. */
    material?: import('./materials').MaterialQuoteReference & { name: string };
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

/** A selection in the current saved notebook document, not an assistant Scene
 * or a copied client string. Offsets count Unicode code points. */
export const noteQuoteReferenceSchema = z.object({
  id: noteId,
  revision,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  start: z.number().int().nonnegative().max(NOTE_LIMITS.body),
  end: z.number().int().positive().max(NOTE_LIMITS.body),
}).strict().refine(value => value.end > value.start && value.end - value.start <= 4000,
  '选一小段笔记，再接着聊。');
export type NoteQuoteReference = z.infer<typeof noteQuoteReferenceSchema>;
/** Display text is returned by the notebook owner; send accepts only its address. */
export interface NoteQuote extends NoteQuoteReference { title: string; text: string }
export function noteQuoteAddress(quote: NoteQuoteReference): NoteQuoteReference {
  return { id: quote.id, revision: quote.revision, sha256: quote.sha256, start: quote.start, end: quote.end };
}

export interface NotesBridge {
  notesQuote(input: NotebookQuoteReference): Promise<NotebookQuote>;
  notesList(input?: z.input<typeof noteListSchema>): Promise<NoteList>;
  notesRead(input: z.input<typeof noteReadSchema>): Promise<NotePage>;
  notesCreate(input: z.input<typeof noteCreateSchema>): Promise<NoteMutation>;
  notesUpdate(input: z.input<typeof noteUpdateSchema>): Promise<NoteMutation>;
  notesChangeState(input: z.input<typeof noteStateSchema>): Promise<NoteMutation>;
  notesUndo(input: z.input<typeof noteUndoSchema>): Promise<NoteMutation>;
  notesHistory(input: z.input<typeof noteHistorySchema>): Promise<NoteHistory>;
  notesQuote(input: NoteQuoteReference): Promise<NoteQuote>;
}
