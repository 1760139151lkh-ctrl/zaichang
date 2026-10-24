import { z } from 'zod';
import { materialQuoteReferenceSchema, materialTargetSchema } from './materials';
import { noteQuoteReferenceSchema } from './notes';

export const conversationBookmarkReferenceSchema = z.object({
  sessionId: z.string().min(1).max(160), messageId: z.string().min(1).max(160),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), contentVersion: z.number().int().positive().optional(),
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
}).strict().refine(value => value.end > value.start && value.end - value.start <= 4000, '拿起原话里的一小段，再放到纸边。');
export type ConversationBookmarkReference = z.infer<typeof conversationBookmarkReferenceSchema>;

/** A paper carried between existing owners. Its saved/drag form is an address,
 * with no copied body, path or learning fact. A pending material's live native
 * target is stripped by sourceBookmarkAddress before drag or persistence. */
export const sourceBookmarkReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('material'), reference: materialQuoteReferenceSchema,
    target: materialTargetSchema.optional() }).strict(),
  z.object({ kind: z.literal('notebook'), reference: noteQuoteReferenceSchema }).strict(),
  z.object({ kind: z.literal('conversation'), reference: conversationBookmarkReferenceSchema }).strict(),
]);
export type SourceBookmarkReference = z.infer<typeof sourceBookmarkReferenceSchema>;
export interface SourceBookmarkPreview {
  reference: SourceBookmarkReference;
  title: string;
  text: string;
  page?: number;
  locator?: Extract<import('./search').LocalSearchLocator, { kind: 'conversation' }>;
}
export const SOURCE_BOOKMARK_MIME = 'application/x-zaichang-source-bookmark';
export const sourceBookmarkKeepSchema = z.object({ bookmark: sourceBookmarkReferenceSchema,
  annotation: z.string().max(4000).optional() }).strict();
export type SourceBookmarkKeepInput = z.infer<typeof sourceBookmarkKeepSchema>;
export function sourceBookmarkAddress(value: SourceBookmarkReference): SourceBookmarkReference {
  return value.kind === 'material' ? { kind: 'material', reference: value.reference } : value;
}
