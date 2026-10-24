import { z } from 'zod';

export const LOCAL_SEARCH_LIMITS = { query: 200, page: 24, snippet: 180, sessions: 24 } as const;
export const localSearchKindSchema = z.enum(['conversation', 'note', 'material']);
export type LocalSearchKind = z.infer<typeof localSearchKindSchema>;
const objectId = z.string().min(1).max(180);
export const localSearchSchema = z.object({
  query: z.string().max(LOCAL_SEARCH_LIMITS.query).transform(value => value.trim()),
  kinds: z.array(localSearchKindSchema).min(1).max(3).optional(),
  /** An explicit conversation-only subset; an empty selection never means all. */
  sessionIds: z.array(objectId).min(1).max(LOCAL_SEARCH_LIMITS.sessions).optional(),
  limit: z.number().int().min(1).max(LOCAL_SEARCH_LIMITS.page).default(18),
  cursor: z.string().uuid().optional(),
}).strict().refine(value => !value.sessionIds || !value.kinds || value.kinds.every(kind => kind === 'conversation'), {
  message: '选定对话后，只在这些对话里寻找。', path: ['kinds'],
});
const position = z.number().int().nonnegative().max(20_000_000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const range = { offset: position, end: position, field: z.enum(['title', 'body']) };
/** Offsets count Unicode code points, including when the source contains emoji.
 * Locators contain no paths, access keys, model scope or copied source text. */
export const localSearchLocatorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('conversation'), sessionId: objectId, messageId: objectId, contentHash: hash, ...range }).strict(),
  z.object({ kind: z.literal('note'), noteId: z.string().regex(/^note-[a-f0-9-]{36}$/), revision: z.number().int().positive(), ...range }).strict(),
  z.object({ kind: z.literal('material'), resourceId: z.string().regex(/^material-[a-f0-9-]{36}$/), sha256: hash,
    page: z.number().int().min(1).max(200).optional(), ...range }).strict(),
]).refine(value => value.end >= value.offset);
export type LocalSearchLocator = z.infer<typeof localSearchLocatorSchema>;
export interface LocalSearchHit {
  id: string;
  kind: LocalSearchKind;
  title: string;
  snippet: string;
  /** The matching range within snippet, in Unicode code points. */
  match: { start: number; end: number };
  locator: LocalSearchLocator;
  updatedAt?: string;
  role?: 'user' | 'assistant';
}
export interface LocalSearchWarning {
  kind: LocalSearchKind;
  code: 'unavailable' | 'text_layer_only';
  message: string;
  resourceId?: string;
}
export interface LocalSearchPage {
  items: LocalSearchHit[];
  nextCursor: string | null;
  /** False when more remains to search or a source could not be fully read. */
  complete: boolean;
  warnings: LocalSearchWarning[];
  privacyEpoch: number;
  policyRevision: number;
  sourceBoundary?: number;
}
export interface LocalSearchBridge {
  searchLocal(input: z.input<typeof localSearchSchema>): Promise<LocalSearchPage>;
  searchResolve(locator: LocalSearchLocator): Promise<LocalSearchLocator>;
  searchCancel(): Promise<void>;
}
