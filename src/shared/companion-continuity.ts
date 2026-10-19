import { z } from 'zod';

const id = z.string().min(1).max(160);
const range = { start: z.number().int().nonnegative(), end: z.number().int().positive() };
export const companionSourceSchema = z.object({
  eventId: id, contentVersion: z.number().int().positive(), ...range,
  quote: z.string().min(1).max(4000),
}).strict().refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start,
  '相处原话需要完整、有效的Unicode位置。');
export const companionReplySchema = z.object({
  messageId: id, ...range, quote: z.string().min(1).max(2000),
}).strict().refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start,
  '表达反馈需要真实助手回复的准确位置。');

/** These name conversational material, not moods, affinity or task routes. */
export const companionKindSchema = z.enum(['ongoing_topic', 'shared_phrase', 'expression_feedback']);
export type CompanionKind = z.infer<typeof companionKindSchema>;
export const personalMethodUsageSchema = z.enum(['work', 'conversation']);
export type PersonalMethodUsage = z.infer<typeof personalMethodUsageSchema>;
export const companionEntrySchema = z.object({
  kind: companionKindSchema,
  label: z.string().min(1).max(160).describe('供下次找回的简短话题名；不是情绪、亲密程度或人物判断。'),
  topic: companionSourceSchema.describe('这段闲聊、共同说法或反馈本身的用户原话。'),
  phrase: companionSourceSchema.optional().describe('shared_phrase时，用户真实使用或明确采用的共同说法；助手自己提出还不算共同采用。'),
  meaning: companionSourceSchema.optional().describe('用户说明这句话含义或相处需要的原话；没有就留空。'),
  conditions: z.array(companionSourceSchema).max(4).default([]).describe('只引用已说出的适用范围；当天要求不自动变为长期约定。'),
  replyTarget: companionReplySchema.optional().describe('反馈所针对的既有真实助手回复；不接受候选答复、角色例句或未发布内容。'),
}).strict().superRefine((value, context) => {
  if (value.kind === 'shared_phrase' && !value.phrase)
    context.addIssue({ code: 'custom', path: ['phrase'], message: '共同说法需要用户真实采用的原话。' });
  if (value.kind !== 'expression_feedback' && value.replyTarget)
    context.addIssue({ code: 'custom', path: ['replyTarget'], message: '只有表达反馈关联要谈的助手回复。' });
});
export const companionManageInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('remember'), source: companionSourceSchema, entry: companionEntrySchema }).strict(),
  z.object({ operation: z.literal('revise'), id, expectedRevision: z.number().int().positive(),
    source: companionSourceSchema, entry: companionEntrySchema }).strict(),
  z.object({ operation: z.enum(['resume', 'pause', 'close']), id, expectedRevision: z.number().int().positive(),
    source: companionSourceSchema }).strict(),
]);
export type CompanionManageInput = z.infer<typeof companionManageInput>;
export const companionReadInput = z.object({
  id: id.optional(), expectedRevision: z.number().int().positive().optional(),
  query: z.string().max(300).default(''), offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(12).default(6), includeInactive: z.boolean().default(false),
}).strict();
export type CompanionReadInput = z.infer<typeof companionReadInput>;

export interface CompanionPersonaAnchor {
  revision: number;
  presetId: string;
  name: string;
}
export interface CompanionThreadCue {
  id: string;
  revision: number;
  kind: CompanionKind;
  title: string;
  updatedAt: string;
  fromCurrentConversation: boolean;
  personaRelation: 'same_configuration' | 'edited_configuration' | 'different_role';
  read: { tool: 'restore_collaboration'; type: 'companion'; id: string; expectedRevision: number };
}
export interface ConversationMethodCue {
  id: string;
  revision: number;
  name: string;
  usage: 'conversation';
  read: { tool: 'read_skill'; id: string };
}

export const COMPANION_CONTINUITY_MEANING = '这里保留真实聊过的话题、共同用过的说法和用户表达反馈，供自然接话；没有任务、期限或下一步也可以成立。旧话题不要求现在继续，反馈只按原范围使用，不推断情绪、满意、依赖或亲密程度。角色改动不改写真实聊天；不同角色只能说在这里聊过，不能冒充自己经历。长期相处约定沿明确选择的conversation个人方法读取，不自动修改角色核心、排程或后台联系。';
