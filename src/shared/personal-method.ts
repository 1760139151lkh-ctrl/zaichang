import { z } from 'zod';
import { workSourceBindingSchema, workSourceRefSchema } from './harness';
import { methodWorkHelpProofSchema } from './method-work-help';

const id = z.string().min(1).max(160);
export const personalMethodConditionsSchema = z.object({
  when: z.string().min(1).max(1200),
  adaptToCurrent: z.string().min(1).max(1200),
  avoidWhen: z.string().max(1200).optional(),
}).strict();
export type PersonalMethodConditions = z.infer<typeof personalMethodConditionsSchema>;

export const methodAssistanceInputSchema = z.object({ messageId: id,
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
  quote: z.string().min(1).max(12000),
}).strict().refine(value => value.end > value.start, '需要真实助手帮助的原文位置。');
export const methodWorkAnchorInputSchema = z.object({ id, revision: z.number().int().positive(),
  kind: z.enum(['collaboration_frame', 'learning_process']),
}).strict();

export const personalMethodSourcesSchema = z.object({ version: z.literal(1),
  methodBinding: workSourceBindingSchema.optional(),
  workAssistance: z.array(methodWorkHelpProofSchema).max(16).default([]),
  assistance: z.array(z.object({ messageId: id, start: z.number().int().nonnegative(), end: z.number().int().positive(),
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/), sourceRefs: z.array(workSourceRefSchema).min(1).max(32),
  }).strict()).max(16),
  anchors: z.array(z.object({ id, revision: z.number().int().positive(),
    kind: z.enum(['collaboration_frame', 'learning_process']), matterId: id,
    sourceBinding: workSourceBindingSchema,
  }).strict()).max(16),
}).strict();
export type PersonalMethodSources = z.infer<typeof personalMethodSourcesSchema>;
