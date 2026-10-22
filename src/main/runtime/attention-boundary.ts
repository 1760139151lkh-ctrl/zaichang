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
  const tool: ToolSpec = { type: 'function', function: { name: 'verify_attention_expiry', description: '帮助伙伴理解这一项限制自己的结束条件，以及拟定的自动解除时刻是否相符；提醒和业务动作仍有各自的约定。', parameters } };
  const schema = wire.superRefine((value, context) => {
    if (!original.includes(value.restrictionQuote)) context.addIssue({ code: 'custom', path: ['restrictionQuote'], message: '这段引文与本人这次的原话不一致，尚未绑定这项限制。' });
    if (value.hasOwnEnd && (!value.endQuote || !original.includes(value.endQuote))) context.addIssue({ code: 'custom', path: ['endQuote'], message: '这项结束条件还缺少本人原话中对应的完整片段。' });
  });
  const value = await structuredResult({ schema, tool, complete, signal, failureCode: 'attention_expiry_unknown', failureMessage: '尚未核清这项限制的自动结束时间。', options: { thinking: 'enabled', maxOutputTokens: 4096, phase: 'verification' }, messages: [
    { role: 'system', content: '这次想请你帮助伙伴看清一项限制自己的结束条件。眼前的限制已经生效；正在核对的是将来何时可以自动解除，与日历操作和重新确认是不同的事。original是本人这次的原话，proposed中的rule、title和until是伙伴正在考虑的解释，提案自己写下的期限还不是本人依据。\n原句里可能有几项并列约定，各有对象和持续时间。例如“今晚先别提醒运动，以后别因为我焦虑就催我”：今晚的期限属于前一项，后一项仍可以持续；这只是帮助理解的例子，实际判断回到original。时间修饰归属还不清楚时，hasOwnEnd可以是false，给对方留着原有的安静；若本人确实为这一项说了临时终点，也照原意保留下来。\nrestrictionQuote带回支持本项限制的最小完整原话，endQuote对应它自己的结束条件。hasOwnEnd说明这一项有没有明确终点，matchesUntil说明拟定时刻是否与那个终点一致；两者分开判断，尚不明确或解析不符的自动恢复时刻就先留待理解。相对日期可以结合宿主当前时间与时区理解，本人不必说成ISO格式。用这里的结构把你的理解交给伙伴，宿主再沿原来源和实际版本处理。' },
    { role: 'user', content: JSON.stringify({ original, proposed }) },
  ] });
  return { approved: value.hasOwnEnd && value.matchesUntil, restrictionQuote: value.restrictionQuote, reason: value.reason };
}
