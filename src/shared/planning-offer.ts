import { z } from 'zod';

/** An immutable projection of an existing host ticket, bound into an action digest. */
export const planningOfferSchema = z.object({
  planId: z.string().uuid(),
  expiresAt: z.string().datetime({ offset: true }),
  units: z.array(z.object({
    actionId: z.string().min(1).max(160),
    blockId: z.string().min(1).max(160),
    kind: z.enum(['work', 'transition', 'protected']),
    work: z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }),
      minutes: z.number().positive(), setupMinutes: z.number().nonnegative(), cleanupMinutes: z.number().nonnegative() }).strict().optional(),
    arguments: z.object({
      title: z.string().min(1).max(160), detail: z.string().max(1500),
      kind: z.literal('time_block'), startsAt: z.string().datetime({ offset: true }),
      durationMinutes: z.number().int().positive(), timeZone: z.string().min(1),
      planning: z.object({ state: z.literal('accepted'), flexibility: z.enum(['fixed', 'movable']), placeId: z.string().optional() }).strict(),
      planRef: z.object({ planId: z.string().uuid(), blockId: z.string().min(1).max(160) }).strict(),
    }).strict(),
  }).strict()).min(1),
}).strict();
export type PlanningOffer = z.infer<typeof planningOfferSchema>;
export interface PlanningOfferProgress {
  status: 'ready' | 'saving' | 'saved' | 'partially_saved' | 'recompute_required' | 'stopped' | 'unknown';
  total: number;
  saved: number;
  present: number;
  changed: number;
  reason?: string;
}
