import { createHash } from 'node:crypto';
import { HarnessError, type ScopeHandle, type WorkRecord } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from './work';
import type { PlanningMaterialProvenance } from '../actions/planning-intent-contract';

export interface HelpRecordInput {
  responseId?: string;
  opportunityId?: string;
  sessionId: string;
  matterId: string;
  title: string;
  reason: string;
  actionDescription: string;
  basisFingerprint: string;
  evidenceIds: string[];
  sourceIds?: string[];
  requiredGrants?: string[];
  basisIds?: string[];
  resultRefs?: string[];
  planningProvenance?: PlanningMaterialProvenance[];
}

/** Records our own interventions and observable consequences, never inferred
 * satisfaction or a new personality trait. Uses the existing scoped work store. */
export class CooperationService {
  constructor(readonly repo: KernelRepository, readonly work: WorkService) {}

  record(handle: ScopeHandle, input: HelpRecordInput) {
    const id = 'help:' + createHash('sha256').update(`${input.responseId || input.opportunityId}\0${input.matterId}`).digest('hex');
    const old = this.repo.work(handle, undefined, id)[0];
    if (old) return old;
    if (!input.responseId && !input.opportunityId) throw new HarnessError('help_result_required', '帮助记录必须对应实际回复或已处理机会。');
    if (input.planningProvenance && !this.repo.planningMaterialReadable(handle, input.planningProvenance))
      throw new HarnessError('planning_material_changed', '帮助所依据的规划材料已改变，没有保存旧内容。');
    const record = this.work.create(handle, 'feedback', input.title, {
      type: 'cooperation_record', sessionId: input.sessionId, matterId: input.matterId,
      sourceIds: (input.sourceIds || []).filter(source => !['current', 'history:self'].includes(source)),
      ...(input.planningProvenance ? { materialPlanningContractVersion: 1, planningProvenance: JSON.parse(JSON.stringify(input.planningProvenance)) } : {}),
      ...(input.requiredGrants ? { materialGrantContractVersion: 1, requiredGrants: [...new Set(input.requiredGrants)] } : {}),
      responseId: input.responseId || null, opportunityId: input.opportunityId || null,
      reason: input.reason, actionDescription: input.actionDescription, basisFingerprint: input.basisFingerprint,
      basisIds: input.basisIds || [], resultRefs: input.resultRefs || [],
      generatedAt: this.repo.clock.now(), displayedAt: null, submittedAt: null, openedAt: null, deliveredAt: null, seenAt: null, deliveryStatus: 'not_submitted',
      explicitResponse: null, observedOutcome: null, satisfaction: 'unknown',
      feedbackMeaning: '生成、显示、系统提交、用户打开、明确反馈和现实结果分别记录；沉默不代表任何评价。',
    }, { id, status: 'generated', evidenceIds: input.evidenceIds });
    for (const evidenceId of input.evidenceIds) this.repo.addDependency(handle, { consumerId: id, producerId: evidenceId, producerRevision: 0, sensitivity: 'privacy', invalidation: 'block' });
    if (input.responseId) this.repo.addDependency(handle, { consumerId: id, producerId: input.responseId, producerRevision: 0, sensitivity: 'privacy', invalidation: 'block' });
    // A revision of an interpretation does not erase what was actually said.
    // Privacy deletion still follows the original evidence dependency.
    return record;
  }

  history(handle: ScopeHandle, matterId: string, limit = 8) {
    return this.repo.workData(handle, ['cooperation_record'], { matterId, limit: Math.min(24, limit), respectSourceBindings: true });
  }

  exposure(handle: ScopeHandle, id: string, expectedRevision: number, kind: 'displayed' | 'opened' | 'submitted') {
    const record = this.repo.work(handle, undefined, id)[0];
    if (!record || record.data.type !== 'cooperation_record') throw new HarnessError('help_missing', '没有这条帮助记录。');
    const field = kind === 'displayed' ? 'displayedAt' : kind === 'opened' ? 'openedAt' : 'submittedAt';
    if (record.data[field]) return record;
    return this.work.update(handle, id, expectedRevision, { status: kind, data: { ...record.data, [field]: this.repo.clock.now() } });
  }

  delivery(handle: ScopeHandle, id: string, expectedRevision: number, status: 'submitted_to_os' | 'provider_delivered' | 'seen' | 'unknown') {
    const record = this.repo.work(handle, undefined, id)[0];
    if (!record || record.data.type !== 'cooperation_record') throw new HarnessError('help_missing', '没有这条帮助记录。');
    const now = this.repo.clock.now();
    return this.work.update(handle, id, expectedRevision, { data: { ...record.data, deliveryStatus: status,
      ...(status === 'unknown' ? { deliveryUnknownAt: now } : { submittedAt: record.data.submittedAt || now }),
      ...(['provider_delivered', 'seen'].includes(status) ? { deliveredAt: record.data.deliveredAt || now } : {}),
      ...(status === 'seen' ? { seenAt: record.data.seenAt || now } : {}),
    } });
  }

  feedback(handle: ScopeHandle, record: WorkRecord, input: { eventId: string; quote: string; response: string }) {
    const event = this.repo.evidence(handle, input.eventId);
    if (!event || event.speaker !== 'user' || !event.text.includes(input.quote)) throw new HarnessError('feedback_evidence', '明确反馈需要用户原话；沉默和采纳不能代替。');
    return this.work.update(handle, record.id, record.revision, { evidenceIds: [...new Set([...record.evidenceIds, event.id])],
      data: { ...record.data, explicitResponse: { ...input, at: this.repo.clock.now() }, satisfaction: 'not_inferred_from_response' } });
  }
}
