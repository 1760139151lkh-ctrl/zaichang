import type { EvidenceEvent } from './harness';
import { REHEARSAL_SOURCE_CONTEXT_MEANING } from './relationship-rehearsal';

export const SHARED_CREATION_SOURCE_CONTEXT_MEANING = 'sourceContext.kind=shared_creation表示宿主在本条入站时，按当时生效的来源范围核过同一对话的真实共同作品或作品取景引用；它只保留作品地址和活动身份，不含旧正文，不授权读取、保存、采纳、位置使用或执行，也不证明整条新话都是虚构。区分本人此刻真实的创作愿望、评论、修改和管理交流，与作品中的叙述者、角色台词、想象事件。作品里的第一人称、路线、来到某地、答应或决定，不能提成本人的生平、实际到达、承诺、偏好或行动委托；公共地图作为取景也不证明本人位置。初次想写故事是真实创作愿望，不因作品题材把本人整个请求改成虚构主体；已有引用同样不能把整轮硬设为real。混合的独立现实自述仍按原话、明确用途和原许可逐片段核对，不能整条跳过，也不能从故事补足事实或记录许可。不确定某句属于作品还是现实，保留未知并沿现有needs_context/original_only处理。作品本身可沿原章地址回读，不能复制为人物理解。新原话明确退出、换题、限定来源、拒读旧文或拒绝留存时，仍以本条新限制为准；旧引用不延长托付。';

/** Select semantic methods from actual source metadata, never from words in
 * the user's prose or a guessed neighboring activity. */
export function sourceContextGuidance(...contexts: (EvidenceEvent['sourceContext'])[]): string[] {
  const kinds = new Set(contexts.map(context => context?.kind));
  return [
    ...(kinds.has('relationship_rehearsal') ? [REHEARSAL_SOURCE_CONTEXT_MEANING] : []),
    ...(kinds.has('shared_creation') ? [SHARED_CREATION_SOURCE_CONTEXT_MEANING] : []),
  ];
}
