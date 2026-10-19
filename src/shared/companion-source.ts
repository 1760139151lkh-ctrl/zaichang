import { z } from 'zod';
import { assistantWorkSourceSchema } from './harness';

const id = z.string().min(1).max(160);
export const companionSourceTargetSchema = z.object({ kind: z.enum(['material', 'attempt']), index: z.number().int().min(0).max(7) }).strict();
const owner = { id, revision: z.number().int().positive(), matterId: id };
export const companionSourceInputSchema = z.object({ ...owner, target: companionSourceTargetSchema,
  snapshot: assistantWorkSourceSchema.optional() }).strict();
export const companionFollowupReferenceSchema = z.object({ kind: z.literal('co_work'), ...owner,
  target: companionSourceTargetSchema.optional(), snapshot: assistantWorkSourceSchema.optional() }).strict();
export type CompanionSourceTarget = z.infer<typeof companionSourceTargetSchema>;
export type CompanionSourceInput = z.infer<typeof companionSourceInputSchema>;
export type CompanionFollowupReference = z.infer<typeof companionFollowupReferenceSchema>;

/** Local owner reading only. A file address must still be opened through the
 * existing native material reader; an address does not prove its contents read. */
export type CompanionSourceView =
  | { kind: 'excerpt'; title: string; text: string; origin: 'user_statement' | 'quotation' | 'assistant_history'; receivedAt?: string }
  | { kind: 'file'; title: string; resourceId: string; sha256: string; version: number;
      mediaType: 'text/plain' | 'text/markdown' | 'application/pdf'; page?: number; offset: number; limit: number };
