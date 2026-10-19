import { REHEARSAL_SOURCE_CONTEXT_MEANING, rehearsalInteractionSchema, type RehearsalInteraction } from '../../shared/relationship-rehearsal';
import type { ScopeHandle, WorkSourceRef } from '../../shared/harness';
import type { RelationshipRehearsalService, RehearsalAdmission } from './relationship-rehearsal';

/** Adopt this reference after the new input's source limits are known and
 * before its owner body enters context. Ingress already kept source identity
 * and infer:false; an untrusted address never grants a read, fact or action. */
export function admitRehearsalIngress(service: RelationshipRehearsalService, handle: ScopeHandle,
  sessionId: string, raw: RehearsalInteraction | undefined,
  options: { allowCrossSession: boolean; permits?: (source: WorkSourceRef) => boolean }) {
  if (!raw) return undefined;
  const input = rehearsalInteractionSchema.parse(raw);
  return { input, ...service.admit(handle, sessionId, input, options.allowCrossSession, options.permits) };
}

export function rehearsalIngressMethod(admission: RehearsalAdmission) {
  return {
    type: 'relationship_rehearsal', currentInput: admission.kind,
    simulationIsActualExchange: false, userInputIsContextualReference: true, otherSpeechIsAssistantSimulation: true,
    inputKindIsNotSemanticDecision: true, sourceIdentityMeaning: REHEARSAL_SOURCE_CONTEXT_MEANING,
    method: '你仍是负责这段交流的同一位助手。当前原句可能是在试说、指出“他不会这样说”、调整自己的意思，或想先停下/直接整理；按完整原话自然理解，不用另一个导演、人物标签或固定轮数。先保住本人愿意表达的意思，不教他赢对话。试演他人的一句只作为一种可能回应，明确放在试演画面里；别把它当真实来信、他人的内心或关系事实。可以停在还不知道怎么接的位置；不必把对方演到迅速理解或认同，更不能为一个顺利结局替本人编好下一句。本人台词只保存这次实际试说的原话，不能替本人编一条再当成他已说过。需要时respond；他觉得不对就alternative/adjust；不想继续演可立即collect或pause。只有真正有帮助才另作短旁白，不逐轮评分或点评；开场语由这次真实交流决定，不重复固定教学口号。整理的文字仍是未发送的草稿，继续使用原prepare_release与原披露边界，不自动发消息、改约定或记人物事实。',
  };
}
