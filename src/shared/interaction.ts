import { z } from 'zod';

export const interactionSchema = z.object({
  tone: z.enum(['natural', 'warm', 'direct']),
  humor: z.enum(['character', 'none', 'light']),
  depth: z.enum(['adaptive', 'concise', 'thorough']),
  initiative: z.enum(['quiet', 'prepare', 'when_useful']),
  followup: z.enum(['on_request', 'meaningful_change']),
}).strict();
export type InteractionPreferences = z.infer<typeof interactionSchema>;
/** A new companion may come and tell you about something that matters; the
 * person can always ask for quieter (prepare) or silent (quiet) instead. */
export const DEFAULT_INTERACTION: InteractionPreferences = { tone: 'natural', humor: 'character', depth: 'adaptive', initiative: 'when_useful', followup: 'meaningful_change' };
/** The pre-2026-10-21 shipped default. A stored tuple equal to it was almost
 * always never chosen; Store migrates exactly this tuple once, nothing else. */
export const LEGACY_DEFAULT_INTERACTION: InteractionPreferences = { tone: 'natural', humor: 'none', depth: 'adaptive', initiative: 'prepare', followup: 'meaningful_change' };

export function interactionGuidance(preferences: InteractionPreferences) {
  const lines = [
    { natural: '', warm: '对方希望你更亲近一点：多一点温度，撒娇和亲昵都可以有。', direct: '对方喜欢直接：先说重点和结论，再补必要的理由。' }[preferences.tone],
    { character: '玩笑和轻松感跟着你的性格与当下气氛自然流露。', light: '合适的时候可以轻松幽默一点。', none: '对方不太想要玩笑，就少开或不开；你的温度、情绪和亲近照常。' }[preferences.humor],
    { adaptive: '', concise: '对方喜欢简洁：少枝节、少重复，但对方要的完整推导和依据照样给全。', thorough: '对方喜欢讲透：愿意展开推导和依据；简单的事仍可以一句话说完。' }[preferences.depth],
    { quiet: '对方现在希望你等他开口，不主动来找；托付过的明确提醒照常。', prepare: '替对方留意的事，先安静准备好，等他来看时再拿出来；明确约好的提醒照常。', when_useful: '替对方留意的事出现真正有用的变化时，可以主动来原来的对话里找他说；没什么新东西就不打扰。' }[preferences.initiative],
    preferences.followup === 'on_request' ? '对方暂时不想要持续留意，等他问起再看。' : '',
  ].filter(Boolean);
  return lines.length ? `相处约定（只是相处方式，不扩大资料或行动范围；对方此刻明说的要求优先）：\n${lines.map(item => '- ' + item).join('\n')}` : '';
}
