import { z } from 'zod';

const id = z.string().min(1).max(160);
export const attentionListInput = z.object({
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).strict();
export const attentionChangeInput = z.object({
  id,
  expectedRevision: z.number().int().positive(),
  expectedControlVersion: z.string().regex(/^[a-f0-9]{64}$/),
  operation: z.enum(['pause', 'resume', 'stop']),
  ruleId: id.optional(),
  ruleRevision: z.number().int().positive().optional(),
}).strict().superRefine((value, context) => {
  if (value.operation === 'resume' ? !value.ruleId || !value.ruleRevision : value.ruleId !== undefined || value.ruleRevision !== undefined)
    context.addIssue({ code: 'custom', message: '请选择这次要解除的暂停。' });
});

/** Native private controls only. No original quote, model context, or prepared body. */
export interface AttentionControlItem {
  id: string;
  title: string;
  sessionId?: string;
  revision: number;
  controlVersion: string;
  status: 'active' | 'paused' | 'ended' | 'expired' | 'unavailable';
  sources: string[];
  until: string | null;
  channel: 'in_app' | 'local_notification';
  pauseRules: { id: string; revision: number; until: string | null; resumable: boolean }[];
  canPause: boolean;
  canStop: boolean;
  unavailableReason?: 'source_permission' | 'parent_inactive';
}
export interface AttentionControlPage { items: AttentionControlItem[]; nextCursor: string | null }
export type AttentionListInput = z.input<typeof attentionListInput>;
export type AttentionChangeInput = z.infer<typeof attentionChangeInput>;
