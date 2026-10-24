import { createHash } from 'node:crypto';
import { HarnessError, type ScopeHandle, type WorkRecord } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from './work';
import type { PlanningMaterialProvenance } from '../actions/planning-intent-contract';
import type { NoteSourceProof } from '../../shared/notes-source';
import { workoutSourceObjectId, type WorkoutSourceProof } from '../../shared/workout-source';

export interface HelpRecordInput {
  responseId?: string;
  opportunityId?: string;
  /** A newly prepared artifact belongs to this exact opportunity revision.
   * Reusing an existing artifact keeps its original help record instead. */
  preparationRevision?: number;
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
  noteSources?: NoteSourceProof[];
  workoutSources?: WorkoutSourceProof[];
}
export type HelpContactEvent = 'displayed' | 'opened' | 'conversation_published' | 'submitted_to_os' | 'provider_delivered' | 'seen' | 'submission_started' | 'unknown';

/** Records our own interventions and observable consequences, never inferred
 * satisfaction or a new personality trait. Uses the existing scoped work store. */
export class CooperationService {
  /** The attention owner keeps source-free fulfilment metadata on its rule,
   * in the same transaction as this actual observation or channel receipt. */
  onContact?: (handle: ScopeHandle, record: WorkRecord, event: HelpContactEvent) => void;
  constructor(readonly repo: KernelRepository, readonly work: WorkService) {}

  record(handle: ScopeHandle, input: HelpRecordInput) {
    if (input.preparationRevision !== undefined && (!input.opportunityId || input.responseId
      || !Number.isSafeInteger(input.preparationRevision) || input.preparationRevision < 1))
      throw new HarnessError('help_preparation_version', '这份准备还没有对应的实际修订。');
    const origin = input.responseId || (input.preparationRevision === undefined ? input.opportunityId
      : `${input.opportunityId}@${input.preparationRevision}`);
    const id = 'help:' + createHash('sha256').update(`${origin}\0${input.matterId}`).digest('hex');
    const old = this.repo.work(handle, undefined, id)[0];
    if (old) return old;
    if (!input.responseId && !input.opportunityId) throw new HarnessError('help_result_required', '帮助记录必须对应实际回复或已处理机会。');
    if (input.planningProvenance && !this.repo.planningMaterialReadable(handle, input.planningProvenance))
      throw new HarnessError('planning_material_changed', '帮助所依据的规划材料已改变，没有保存旧内容。');
    if (input.noteSources && !this.repo.noteSourcesReadable(handle, input.noteSources))
      throw new HarnessError('note_source_changed', '这次帮助引用的一页笔记现在读不到了。');
    if (input.workoutSources && !this.repo.workoutSourcesReadable(handle, input.workoutSources))
      throw new HarnessError('workout_source_changed', '这次帮助所看的运动记录已经移除，先前摘要没有继续保存成准备。');
    const record = this.work.create(handle, 'feedback', input.title, {
      type: 'cooperation_record', sessionId: input.sessionId, matterId: input.matterId,
      sourceIds: (input.sourceIds || []).filter(source => !['current', 'history:self'].includes(source)),
      ...(input.planningProvenance ? { materialPlanningContractVersion: 1, planningProvenance: JSON.parse(JSON.stringify(input.planningProvenance)) } : {}),
      ...(input.requiredGrants ? { materialGrantContractVersion: 1, requiredGrants: [...new Set(input.requiredGrants)] } : {}),
      ...(input.noteSources ? { materialNoteContractVersion: 1, noteSources: structuredClone(input.noteSources) } : {}),
      ...(input.workoutSources ? { materialWorkoutContractVersion: 1, workoutSources: structuredClone(input.workoutSources) } : {}),
      responseId: input.responseId || null, opportunityId: input.opportunityId || null,
      ...(input.preparationRevision === undefined ? {} : { preparationRevision: input.preparationRevision }),
      reason: input.reason, actionDescription: input.actionDescription, basisFingerprint: input.basisFingerprint,
      basisIds: input.basisIds || [], resultRefs: input.resultRefs || [],
      generatedAt: this.repo.clock.now(), displayedAt: null, submittedAt: null, openedAt: null, deliveredAt: null, seenAt: null, deliveryStatus: 'not_submitted',
      explicitResponse: null, observedOutcome: null, satisfaction: 'unknown',
      feedbackMeaning: '生成、显示、系统提交、用户打开、明确反馈和现实结果分别记录；沉默不代表任何评价。',
    }, { id, status: 'generated', evidenceIds: input.evidenceIds });
    for (const evidenceId of input.evidenceIds) this.repo.addDependency(handle, { consumerId: id, producerId: evidenceId, producerRevision: 0, sensitivity: 'privacy', invalidation: 'block' });
    for (const source of input.workoutSources || []) this.repo.addDependency(handle, { consumerId: id,
      producerId: workoutSourceObjectId(source.workoutId), producerRevision: 0, sensitivity: 'privacy', invalidation: 'block' });
    if (input.responseId) this.repo.addDependency(handle, { consumerId: id, producerId: input.responseId, producerRevision: 0, sensitivity: 'privacy', invalidation: 'block' });
    // A revision of an interpretation does not erase what was actually said.
    // Privacy deletion still follows the original evidence dependency.
    return record;
  }

  history(handle: ScopeHandle, matterId: string, limit = 8) {
    return this.repo.workData(handle, ['cooperation_record'], { matterId, limit: Math.min(24, limit), respectSourceBindings: true });
  }

  /** Display/dispatch limits look through the whole readable ledger. Later
   * unshown drafts must not crowd an earlier intervention out of a short page. */
  interventions(handle: ScopeHandle, matterId: string) {
    const records: WorkRecord[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = this.repo.workData(handle, ['cooperation_record'], { matterId, offset, limit: 100, respectSourceBindings: true });
      records.push(...page.filter(record => record.data.displayedAt || record.data.openedAt || record.data.submittedAt || record.data.conversationPublishedAt || record.data.deliveryUnknownAt || record.data.deliveryAttemptedAt));
      if (page.length < 100) return records;
    }
  }

  /** Called with the durable submission intent, before crossing the channel.
   * This is a pending attempt, never proof of OS acceptance or of reading. */
  submissionStarted(handle: ScopeHandle, id: string, expectedRevision: number) {
    const record = this.repo.work(handle, undefined, id)[0];
    if (!record || record.data.type !== 'cooperation_record') throw new HarnessError('help_missing', '没有这条帮助记录。');
    return this.repo.write(() => {
      const next = record.data.deliveryAttemptedAt ? record : this.work.update(handle, id, expectedRevision,
        { data: { ...record.data, deliveryAttemptedAt: this.repo.clock.now() } });
      this.onContact?.(handle, next, 'submission_started');
      return next;
    });
  }

  /** Local conversation publication is independent of OS submission, actual
   * viewport exposure and opening. Never reuse a previous response receipt. */
  publishConversation(handle: ScopeHandle, id: string, messageId: string) {
    const record = this.repo.work(handle, undefined, id)[0];
    if (!record || record.data.type !== 'cooperation_record' || record.data.responseId || record.data.conversationPublishedAt)
      throw new HarnessError('help_publication_changed', '这次帮助已经交付或不能继续，没有复制旧交付记录。');
    return this.repo.write(() => {
      const next = this.work.update(handle, record.id, record.revision, { data: { ...record.data,
        responseId: messageId, conversationPublishedAt: this.repo.clock.now(),
      } });
      this.onContact?.(handle, next, 'conversation_published');
      return next;
    });
  }

  exposure(handle: ScopeHandle, id: string, expectedRevision: number, kind: 'displayed' | 'opened' | 'submitted') {
    const record = this.repo.work(handle, undefined, id)[0];
    if (!record || record.data.type !== 'cooperation_record') throw new HarnessError('help_missing', '没有这条帮助记录。');
    const field = kind === 'displayed' ? 'displayedAt' : kind === 'opened' ? 'openedAt' : 'submittedAt';
    return this.repo.write(() => {
      const next = record.data[field] ? record : this.work.update(handle, id, expectedRevision, { status: kind, data: { ...record.data, [field]: this.repo.clock.now() } });
      this.onContact?.(handle, next, kind === 'submitted' ? 'submitted_to_os' : kind);
      return next;
    });
  }

  delivery(handle: ScopeHandle, id: string, expectedRevision: number, status: 'submitted_to_os' | 'provider_delivered' | 'seen' | 'unknown') {
    const record = this.repo.work(handle, undefined, id)[0];
    if (!record || record.data.type !== 'cooperation_record') throw new HarnessError('help_missing', '没有这条帮助记录。');
    const now = this.repo.clock.now();
    return this.repo.write(() => {
      const next = this.work.update(handle, id, expectedRevision, { data: { ...record.data, deliveryStatus: status,
        ...(status === 'unknown' ? { deliveryUnknownAt: now } : { submittedAt: record.data.submittedAt || now }),
        ...(['provider_delivered', 'seen'].includes(status) ? { deliveredAt: record.data.deliveredAt || now } : {}),
        ...(status === 'seen' ? { seenAt: record.data.seenAt || now } : {}),
      } });
      this.onContact?.(handle, next, status);
      return next;
    });
  }

  feedback(handle: ScopeHandle, record: WorkRecord, input: { eventId: string; quote: string; response: string }) {
    const event = this.repo.evidence(handle, input.eventId);
    if (!event || event.speaker !== 'user' || !event.text.includes(input.quote)) throw new HarnessError('feedback_evidence', '明确反馈需要用户原话；沉默和采纳不能代替。');
    return this.work.update(handle, record.id, record.revision, { evidenceIds: [...new Set([...record.evidenceIds, event.id])],
      data: { ...record.data, explicitResponse: { ...input, at: this.repo.clock.now() }, satisfaction: 'not_inferred_from_response' } });
  }
}
