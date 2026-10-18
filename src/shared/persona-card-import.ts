import { z } from 'zod';
import { personaCoreSchema, personaPreset } from './persona';

const cardSchema = z.object({
  spec: z.literal('chara_card_v2'),
  spec_version: z.literal('2.0'),
  data: z.object({
    name: z.string().trim().min(1).max(60),
    description: z.string().max(4000),
    personality: z.string().max(1000),
    scenario: z.string().max(900),
  }).passthrough(),
}).passthrough();

/**
 * A deliberately limited text conversion, not a full Character Card V2 player.
 * Returns a reviewable draft only. Never executes macros, imports assets, writes
 * settings, injects external system prompts, or activates a lorebook.
 */
export function previewPersonaCharacterCard(text: string) {
  if (text.length > 200_000) throw new Error('角色卡过大，请使用仅包含文字设定的 JSON。');
  let card: z.infer<typeof cardSchema>;
  try {
    card = cardSchema.parse(JSON.parse(text));
  } catch {
    throw new Error('无法转换角色卡。请选择 Character Card V2 JSON，并检查名字、描述、性格和虚构场景的长度。');
  }
  const included = new Set(['name', 'description', 'personality', 'scenario']);
  const ignoredFields = Object.keys(card.data).filter(key => !included.has(key)).sort();
  const core = personaCoreSchema.parse({
    ...personaPreset('custom'),
    name: card.data.name,
    identity: '从外部角色卡文字转换的虚构角色；不是使用者的个人资料或真实共同经历',
    description: card.data.description,
    voice: card.data.personality,
    fictionalBackstory: card.data.scenario ? `角色卡中的虚构场景，不是现实记忆：${card.data.scenario}` : '',
  });
  return {
    format: 'character-card-v2-text-preview' as const,
    reviewRequired: true as const,
    core,
    includedFields: [...included],
    ignoredFields,
    warnings: [
      '这是文字设定草稿，审阅并保存前不会修改当前角色。',
      '外部 system_prompt、post_history_instructions、角色书、扩展代码和宏不执行，也不替换在场的事实与权限规则。',
      '开场白和示例对话没有作为真实聊天或记忆导入；需要时在对应事实场景中编辑例句。',
      '此转换不保留全部 V2 字段；原角色卡不受修改，不宣称支持完整 V2 播放或无损往返。',
    ],
  };
}
