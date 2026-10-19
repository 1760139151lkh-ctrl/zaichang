import { z } from 'zod';

const id = z.string().min(1).max(160);
const revision = z.number().int().positive();
export const curiosityFocusSchema = z.object({ field: z.enum(['opening', 'experience', 'firstMove']),
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
}).strict().refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start);
export type CuriosityFocus = z.infer<typeof curiosityFocusSchema>;
export const curiosityChapterAddressSchema = z.object({ messageId: id, sceneId: id, sceneRevision: revision }).strict();
export type CuriosityChapterAddress = z.infer<typeof curiosityChapterAddressSchema>;
export const curiosityHistoryReadSchema = curiosityChapterAddressSchema.extend({
  field: z.enum(['opening', 'experience', 'firstMove']).default('experience'),
  offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(4000).default(2400),
}).strict();
export const curiosityHistoryCatalogSchema = z.object({
  matterId: id.optional(), ownerId: id.optional(), query: z.string().max(300).optional(),
  order: z.enum(['oldest', 'newest']).default('oldest'), limit: z.number().int().min(1).max(12).default(4),
  cursor: z.object({ createdAt: z.string().min(1), messageId: id, sceneIndex: z.number().int().nonnegative() }).strict().optional(),
}).strict();
export const sharedCreationReadInput = z.union([curiosityHistoryReadSchema,
  curiosityHistoryCatalogSchema.extend({ operation: z.literal('history') }).strict()]);
/** Temporary conversation reference only. No content, source permission,
 * preference or acceptance can be supplied through the UI address. */
export const curiosityFollowupReferenceSchema = z.object({
  id, revision, matterId: id, matterRevision: revision, focus: curiosityFocusSchema.optional(),
  chapter: curiosityChapterAddressSchema.optional(),
}).strict();
export type CuriosityFollowupReference = z.infer<typeof curiosityFollowupReferenceSchema>;
