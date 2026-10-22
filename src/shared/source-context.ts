import type { EvidenceEvent } from './harness';
import { REHEARSAL_SOURCE_CONTEXT_MEANING } from './relationship-rehearsal';

export const SHARED_CREATION_SOURCE_CONTEXT_MEANING = `这条话带着sourceContext.kind=shared_creation：宿主在它到来时，已按当时的来源范围核过同一对话中的真实共同作品或取景引用。这份标记带来作品地址和活动身份，旧正文仍在原来的所有者那里；读取、保存、采纳、位置使用与执行，各有自己的许可。

想请你把本人正在做的事和作品里发生的事都读清楚。此刻想写故事、评论、修改或管理作品，是本人真实的创作交流；叙述者的第一人称、人物台词、想象中的路线、到达、答应和决定，则属于作品中的生活。公共地图也可以只是故事取景，本人的现实位置、经历、偏好、承诺和行动托付仍有各自依据。作品题材与这个标记都只是语境线索，一条话也可能同时含真实请求和虚构内容。

独立的现实自述可以按原话、明确用途和原有许可逐片段理解，故事自身保有故事的身份。某句归属还不清楚时，保留未知，现有needs_context/original_only路径可承接这一点。作品可以沿原章地址回读，人物理解与记录许可则来自各自的真实片段。本人新说的退出、换题、限源、拒读旧文或拒绝留存，同样表达眼前的选择；旧引用保留历史来处，没有延长托付的效力。`;

export const INTERACTIVE_PROGRAM_SOURCE_CONTEXT_MEANING = `sourceContext.kind=interactive_program带来本次交流所指的真实交互作品与节点地址，宿主已在这条话到来时核过它们。旧正文保留在原来源，过去的许可也有原来的边界；这份引用帮助认出对象。

局部输入、曲线、演算、拖动、点选和试改条件，表达的是这次作品中的假设或探索。本人的经历、长期偏好、已接受决定、掌握程度和实际业务结果，各有独立的现实依据。想请你同时照顾当句的其他意思：本人可能在讲真实情况、想修改作品，也可能要退出或另提一件事。这些都能沿现有语义方法和精确原话分别理解，作品数值与本人事实各保留自己的身份。

当前明确的限源、拒读旧文、拒绝留存和取消表达眼前的选择。需要原规格或绑定资料时，仍能沿当前真实来源回读；整库读取、外发和业务动作则继续使用它们自己的许可。`;

/** Select semantic methods from actual source metadata, never from words in
 * the user's prose or a guessed neighboring activity. */
export function sourceContextGuidance(...contexts: (EvidenceEvent['sourceContext'])[]): string[] {
  const kinds = new Set(contexts.map(context => context?.kind));
  return [
    ...(kinds.has('relationship_rehearsal') ? [REHEARSAL_SOURCE_CONTEXT_MEANING] : []),
    ...(kinds.has('shared_creation') ? [SHARED_CREATION_SOURCE_CONTEXT_MEANING] : []),
    ...(kinds.has('interactive_program') ? [INTERACTIVE_PROGRAM_SOURCE_CONTEXT_MEANING] : []),
  ];
}
