import { z } from 'zod';

const id = z.string().min(1).max(160);
const sourceNames: Record<string, string> = {
  'campus:local': '导入的校园资料', 'campus:zju-account': '浙大账号里的资料',
  'map:local': '校园地图', 'weather:open-meteo': '天气预报', 'current': '这次带来的内容',
  'web:public': '公开网页', 'local-agenda': '本机安排', 'notes:self': '自己的笔记',
  'history:self': '聊过的事', 'profile:self': '关于你的理解', 'work:self': '一起商量的事',
};
export const attentionSourceName = (source: string) => sourceNames[source] || (source.startsWith('file:') ? '你带来的文件' : '其他已允许的资料');
export const attentionListInput = z.object({
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).strict();
export const attentionChangeInput = z.object({
  id,
  expectedRevision: z.number().int().positive(),
  expectedControlVersion: z.string().regex(/^[a-f0-9]{64}$/),
  operation: z.enum(['pause', 'resume', 'stop', 'revise']),
  ruleId: id.optional(),
  ruleRevision: z.number().int().positive().optional(),
  changes: z.object({
    sources: z.array(id).min(1).max(8),
    until: z.string().datetime({ offset: true }).nullable(),
  }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.operation === 'resume' ? !value.ruleId || !value.ruleRevision : value.ruleId !== undefined || value.ruleRevision !== undefined)
    context.addIssue({ code: 'custom', message: '请选择这次要解除的暂停。' });
  if (value.operation === 'revise' ? !value.changes : value.changes !== undefined)
    context.addIssue({ code: 'custom', path: ['changes'], message: '修改约定时，请保留这次选择的资料和结束时间。' });
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
  sourceBoundary: string[];
  until: string | null;
  channel: 'in_app' | 'local_notification';
  pauseRules: { id: string; revision: number; until: string | null; resumable: boolean }[];
  canPause: boolean;
  canStop: boolean;
  canRevise: boolean;
  availableSources: string[];
  /** A derived mandate cannot extend past its still active parent. */
  maximumUntil: string | null;
  unavailableReason?: 'source_permission' | 'parent_inactive' | 'permission_retracted';
}
export interface AttentionControlPage { items: AttentionControlItem[]; nextCursor: string | null }
export type AttentionListInput = z.input<typeof attentionListInput>;
export type AttentionChangeInput = z.infer<typeof attentionChangeInput>;
