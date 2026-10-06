import { z } from 'zod';
import type { DeepSeekClient, ToolSpec } from '../provider';
import { structuredResult } from './structured-result';

const wire = z.object({
  restrictionQuote: z.string().min(1).max(1200).describe('原话中支持当前这一项限制的逐字片段，不加入提案自带的期限。'),
  hasOwnEnd: z.boolean().describe('这项限制本身具有明确结束条件；同句另一项临时限制的期限不自动适用。'),
  matchesUntil: z.boolean().describe('拟保存的until准确对应这一项限制的明确结束条件，包括当前时间和时区。'),
  endQuote: z.string().max(1200).nullable(),
  reason: z.string().min(1).max(600),
}).strict();

export interface AttentionExpiryVerdict { approved: boolean; restrictionQuote: string; reason: string }

/** A restriction is applied immediately; only its automatic relaxation needs proof. */
export async function verifyAttentionExpiry(original: string, proposed: unknown, complete: DeepSeekClient['complete'], signal: AbortSignal): Promise<AttentionExpiryVerdict> {
  const { $schema: _, ...parameters } = z.toJSONSchema(wire);
  const tool: ToolSpec = { type: 'function', function: { name: 'verify_attention_expiry', description: '核对这一项限制是否被明确允许在拟定时刻自动解除，不核准新的提醒或业务动作。', parameters } };
  const schema = wire.superRefine((value, context) => {
    if (!original.includes(value.restrictionQuote)) context.addIssue({ code: 'custom', path: ['restrictionQuote'], message: 'Quote the current original exactly, not the proposed rule.' });
    if (value.hasOwnEnd && (!value.endQuote || !original.includes(value.endQuote))) context.addIssue({ code: 'custom', path: ['endQuote'], message: 'An explicit end requires an exact original quote.' });
  });
  const value = await structuredResult({ schema, tool, complete, signal, failureCode: 'attention_expiry_unknown', failureMessage: '尚未核清这项限制的自动结束时间。', options: { thinking: 'enabled', maxOutputTokens: 4096, phase: 'verification' }, messages: [
    { role: 'system', content: '你只审查限制未来何时自动解除。当前限制仍应生效，不用把限制判成日历操作或要求用户再次确认。original是唯一授权；proposed中的rule/title/until都是待审提案，不能用提案新增的时限证明其自身。先逐项区分对象和结束条件，再判断当前这一项是否有自己的明确终点。并列限制可以具有不同的持续性；一个分句的期限不能因为相邻或同属一个话题就自动传播。若时间修饰的归属有歧义，hasOwnEnd=false，不作有利于恢复主动打扰的推断。明确对这一项设定的临时结束条件应保留，不能把所有限制永久化。restrictionQuote引用支持当前限制的最小完整原话，不增写时间。hasOwnEnd与matchesUntil分别判断；结束条件不明确或until解析不符时，不批准这个自动恢复时间。原话中的相对日期可结合宿主当前时间与时区解析，不要求逐字写出ISO时间。只调用指定工具。' },
    { role: 'user', content: JSON.stringify({ original, proposed }) },
  ] });
  return { approved: value.hasOwnEnd && value.matchesUntil, restrictionQuote: value.restrictionQuote, reason: value.reason };
}
