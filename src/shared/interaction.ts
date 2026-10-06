import { z } from 'zod';

export const interactionSchema = z.object({
  tone: z.enum(['natural', 'warm', 'direct']),
  humor: z.enum(['none', 'light']),
  depth: z.enum(['adaptive', 'concise', 'thorough']),
  initiative: z.enum(['quiet', 'prepare', 'when_useful']),
  followup: z.enum(['on_request', 'meaningful_change']),
}).strict();
export type InteractionPreferences = z.infer<typeof interactionSchema>;
export const DEFAULT_INTERACTION: InteractionPreferences = { tone: 'natural', humor: 'none', depth: 'adaptive', initiative: 'prepare', followup: 'meaningful_change' };

export function interactionGuidance(preferences: InteractionPreferences) {
  const tone = { natural: '清楚、温和、直接', warm: '亲切，避免奉承与虚假亲密', direct: '直接指出重点，保持尊重' }[preferences.tone];
  const depth = { adaptive: '按当前问题的需要展开', concise: '少枝节、少重复，仍保留用户要求的完整论证与查证', thorough: '愿意充分展开推导与依据；简单事实仍可短答' }[preferences.depth];
  return `用户希望的沟通方式：${tone}；${preferences.humor === 'light' ? '合适时可以轻松幽默' : '不主动加入玩笑'}；${depth}。主动偏好为${preferences.initiative}，跟进偏好为${preferences.followup}。这些只是待遇与打扰约定，不扩大资料或行动权限；当前明确要求优先，公开稿件按实际受众和任务。`;
}
