import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, type ScopeHandle, type WorkRecord } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from './work';
import type { ActionRuntime } from '../actions/runtime';
import type { BasisService } from './basis';

const citation = z.object({ eventId: z.string().max(160), quote: z.string().min(1).max(4000) }).strict();
const supportedText = z.object({ text: z.string().max(1200), source: citation }).strict();
export const collaborationInput = z.object({
  operation: z.enum(['frame', 'request', 'progress', 'repair', 'withdraw', 'choose']),
  selectedOptionId: z.string().max(160).nullable().optional().describe('choose专用：用户本轮明确采用的现有稳定方案ID；明确撤销选择时为null。找回、比较、询问或助手建议不能算采用。只更新当前事项的选择，不登记日程或对外执行。'),
  id: z.string().max(160).optional(), expectedRevision: z.number().int().positive().optional(),
  expectedOptionRevision: z.number().int().positive().optional().describe('choose时已读方案的版本；不保存聊天的独立业务选择必须提交。'),
  source: citation.optional(),
  title: z.string().min(1).max(160).optional(),
  expectedResult: z.string().max(1600).optional(),
  kind: z.enum(['answer', 'action', 'artifact']).optional().describe('说明、比较是answer；拟稿等可交付内容是artifact；真实改变外部/本地业务状态才是action。'),
  frame: z.object({
    question: z.string().max(1200),
    confirmedFacts: z.array(supportedText).max(12),
    decisions: z.array(supportedText).max(12),
    tentativeUnderstanding: z.array(z.string().max(1200)).max(12),
    participation: z.array(z.string().max(600)).max(8),
    rejectedOptions: z.array(z.object({ title: z.string().max(300), reason: z.string().max(800), validWhen: z.string().max(600), source: citation }).strict()).max(12),
    nextStep: z.string().max(1000).nullable(),
  }).strict().optional(),
  status: z.enum(['in_progress', 'waiting_user', 'waiting_external', 'unfulfilled']).optional(),
  reason: z.string().max(1000).optional(),
  actionId: z.string().max(160).optional(),
  affectedIds: z.array(z.string().max(160)).max(24).optional(),
}).strict();
export const independentChoiceInput = z.object({
  operation: z.literal('choose'), id: z.string().min(1).max(160), expectedRevision: z.number().int().positive(),
  selectedOptionId: z.string().min(1).max(160), expectedOptionRevision: z.number().int().positive(), source: citation,
}).strict();
export type RequestState = 'pending' | 'in_progress' | 'waiting_user' | 'waiting_external' | 'answered' | 'succeeded' | 'unfulfilled' | 'withdrawn';

/** Open collaboration content uses the existing scoped WorkService and writer. */
export class CollaborationService {
  constructor(private repo: KernelRepository, private work: WorkService, private actions: ActionRuntime, private basis?: BasisService) {}

  private cite(scope: ScopeHandle, source: z.infer<typeof citation>) {
    const evidence = this.repo.evidence(scope, source.eventId);
    if (!evidence || evidence.speaker !== 'user' || !evidence.text.includes(source.quote))
      throw new HarnessError('unsupported_evidence', '这项记录没有对应的用户原话。');
    return evidence;
  }

  restore(scope: ScopeHandle, sessionId: string, query = '', offset = 0, limit = 8, relation: { relatedTo?: string; relatedOffset?: number } = {}) {
    const selected = relation.relatedTo ? this.repo.work(scope, undefined, relation.relatedTo).filter(record => record.data.type === 'collaboration_frame' || record.kind === 'goal') : undefined;
    const { items, total, nextOffset } = selected ? { items: selected, total: selected.length, nextOffset: null } : this.repo.collaborationPage(scope, sessionId, query, offset, limit);
    const optionIds = new Set(items.flatMap(record => Array.isArray(record.data.optionIds) ? record.data.optionIds : []));
    const basisUses = items.filter(record => record.kind === 'episode' || record.kind === 'goal').flatMap(record => this.basis?.read(scope, record.id) || []);
    const projected = items.map(record => {
      if (record.data.type !== 'collaboration_frame' || !Array.isArray(record.data.tentativeUnderstanding) || !record.data.tentativeUnderstanding.length) return record;
      return { ...record, data: { ...record.data, historicalInterpretations: record.data.tentativeUnderstanding, tentativeUnderstanding: [], interpretationUse: '这些是当时的解释，尚未证明现在适用。依据当前原话与basisUses重评；不要从旧解释推定今天的状态。' } };
    });
    const relatedOptions = [...optionIds].flatMap(id => this.repo.work(scope, undefined, String(id)));
    const parents = projected.filter(record => record.data.type === 'collaboration_frame' || record.kind === 'goal').map(record => record.id);
    const related = this.repo.relatedWorkPage(scope, parents, relation.relatedOffset || 0, limit);
    return { status: total ? 'fresh' : 'not_found', items: projected, basisUses, relatedOptions, relatedRecords: related.items, nextOffset,
      relatedCoverage: { parentIds: parents, totalMatches: related.total, nextOffset: related.nextOffset, complete: related.nextOffset === null,
        meaning: '这些是当前事项关联的工作记录及当前版本，不等于新增日程或外部动作。需要后页时以relatedTo指定事项并传relatedOffset；不同事项和已失效来源不在此范围。' },
      decisionState: { recordedDecisions: projected.flatMap(record => Array.isArray(record.data.decisions) ? record.data.decisions : []), acceptedOptionIds: relatedOptions.filter(option => option.status === 'accepted').map(option => option.id),
        selectedOptionIds: projected.flatMap(record => typeof record.data.selectedOptionId === 'string' ? [record.data.selectedOptionId] : []),
        meaning: '这是恢复时已有的决定记录。本轮明确的新选择以用户原话为准；找回、聚焦某一方案或要求继续比较本身不等于采用。可以给出倾向性建议，但不能以用户口吻替其定案。' },
      coverage: { complete: nextOffset === null, totalMatches: total, returned: items.length, meaning: 'This page covers matching scoped working records; use nextOffset for remaining matches. It is not a complete conversation archive.' } };
  }

  requests(scope: ScopeHandle, sessionId: string, openOnly = false) {
    return this.repo.requestItems(scope, sessionId, openOnly);
  }

  /** The ephemeral source was verified in memory. Keep existing legitimate
   * evidence and only the independent choice; no new quotation/evidence row. */
  chooseIndependent(scope: ScopeHandle, id: string, revision: number, optionId: string, optionRevision: number) {
    const frame = this.repo.work(scope, 'episode', id)[0], option = this.repo.work(scope, undefined, optionId)[0];
    if (!frame || frame.data.type !== 'collaboration_frame' || frame.status !== 'active' || frame.revision !== revision
      || !option || option.revision !== optionRevision) throw new HarnessError('version_conflict', '事项或方案已变化，未保存旧选择。');
    const declaresParent = typeof option.data.episodeId === 'string' || typeof option.data.matterId === 'string';
    if (!(frame.data.optionIds as string[] || []).includes(option.id) || !['option', 'plan'].includes(option.kind)
      || declaresParent && option.data.episodeId !== frame.id && option.data.matterId !== frame.id || ['rejected', 'blocked', 'stale', 'cancelled'].includes(option.status))
      throw new HarnessError('choice_missing', '这个方案不属于当前可用事项，未保存选择。');
    const permitted = new Set(this.repo.scope(scope).sources.filter(source => source !== 'current'));
    for (const record of [frame, option]) if (Object.hasOwn(record.data, 'sourceIds')) {
      const sources = record.data.sourceIds;
      if (!Array.isArray(sources) || sources.some(source => typeof source !== 'string' || !permitted.has(source)))
        throw new HarnessError('source_forbidden', '这份事项或方案依赖的来源不在当前许可内。');
    }
    return this.repo.write(() => {
      this.repo.invalidate(frame.id, 'selection_changed');
      return this.work.update(scope, frame.id, frame.revision, { data: { ...frame.data, selectedOptionId: option.id,
        selection: { optionId: option.id, optionRevision: option.revision, selectedAt: this.repo.clock.now(),
          authorization: 'verified_independent_business_choice', currentConversationRetained: false, actualBusinessEffects: false },
      } });
    });
  }

  update(scope: ScopeHandle, sessionId: string, input: z.infer<typeof collaborationInput>) {
    const args = collaborationInput.parse(input);
    if (!args.source) throw new HarnessError('source_required', '需要指向原话，不能把建议自动变成你的任务。');
    const evidence = this.cite(scope, args.source);
    const old = args.id ? this.repo.work(scope, undefined, args.id)[0] : undefined;
    if (args.id && (!old || !['collaboration_frame', 'request_item'].includes(String(old.data.type)))) throw new HarnessError('work_missing', '没有找到本次相关事项。');
    if (old && args.expectedRevision !== old.revision) throw new HarnessError('version_conflict', '事项已改变，需要先读取当前版本。');
    if (args.operation === 'choose') {
      if (!old || old.data.type !== 'collaboration_frame' || args.selectedOptionId === undefined) throw new HarnessError('choice_required', '先读取当前事项及其方案，再指定选择。');
      const selectedOptionId = args.selectedOptionId;
      const option = args.selectedOptionId === null ? undefined : this.repo.work(scope, undefined, args.selectedOptionId)[0];
      if (args.selectedOptionId !== null && (!option || !(old.data.optionIds as string[] || []).includes(option.id) || !['option', 'plan'].includes(option.kind) || ['rejected', 'blocked', 'stale', 'cancelled'].includes(option.status))) throw new HarnessError('choice_missing', '这个方案已改变或不属于当前事项。');
      return this.repo.write(() => {
        this.repo.invalidate(old.id, 'selection_changed');
        return this.work.update(scope, old.id, old.revision, { status: 'active', evidenceIds: [...new Set([...old.evidenceIds, evidence.id])], data: { ...old.data,
          selectedOptionId, selection: { optionId: selectedOptionId, sourceEventId: evidence.id, selectedAt: this.repo.clock.now(), actualBusinessEffects: false },
        } });
      });
    }
    if (args.operation === 'frame') {
      if (!args.frame) throw new HarnessError('frame_required', '共同理解内容未提供。');
      const sources = [evidence.id];
      for (const item of [...args.frame.confirmedFacts, ...args.frame.decisions, ...args.frame.rejectedOptions]) sources.push(this.cite(scope, item.source).id);
      const pointers = Object.fromEntries(['optionIds', 'lastDisplayedOptionIds', 'referencedOptionId', 'focusSequence'].filter(key => old?.data[key] !== undefined).map(key => [key, old!.data[key]]));
      const selection = old?.data.selection as { sourceEventId?: string } | undefined;
      if (selection?.sourceEventId && this.repo.evidence(scope, selection.sourceEventId)) {
        pointers.selectedOptionId = old!.data.selectedOptionId; pointers.selection = selection; sources.push(selection.sourceEventId);
      } else if ((old?.data.selection as { authorization?: string; optionId?: string })?.authorization === 'verified_independent_business_choice'
        && (old!.data.selection as { optionId?: string }).optionId === old!.data.selectedOptionId) {
        pointers.selectedOptionId = old!.data.selectedOptionId; pointers.selection = old!.data.selection;
      }
      const data = { ...pointers, type: 'collaboration_frame', sessionId, sessionIds: [...new Set([...(Array.isArray(old?.data.sessionIds) ? old.data.sessionIds : []), sessionId])], ...args.frame, source: { ...args.source, receivedAt: evidence.receivedAt, contentVersion: evidence.contentVersion } };
      return old ? this.work.update(scope, old.id, old.revision, { data, status: 'active', title: args.title || old.title, evidenceIds: [...new Set(sources)] })
        : this.work.create(scope, 'episode', args.title || args.frame.question.slice(0, 160), data, { status: 'active', evidenceIds: [...new Set(sources)] });
    }
    if (args.operation === 'request') {
      if (!args.title || !args.kind || !args.expectedResult) throw new HarnessError('request_incomplete', '请求还缺少具体要得到的结果。');
      if (args.status && !args.reason) throw new HarnessError('request_state_missing', '未完成项需要说明具体原因。');
      const id = 'request:' + createHash('sha256').update(`${evidence.id}\0${args.source.quote}\0${args.expectedResult}`).digest('hex');
      const existing = this.requests(scope, sessionId).find(record => record.id === id);
      if (existing) return existing;
      return this.work.create(scope, 'task', args.title, {
        type: 'request_item', sessionId, sessionIds: [sessionId], requestKind: args.kind, source: { ...args.source, receivedAt: evidence.receivedAt, contentVersion: evidence.contentVersion },
        expectedResult: args.expectedResult, state: args.status || 'pending', ...(args.reason ? { reason: args.reason } : {}), resultRefs: [],
      }, { id, status: args.status || 'pending', evidenceIds: [evidence.id] });
    }
    if (!old) throw new HarnessError('work_missing', '请先读取要更新的事项。');
    if (args.operation === 'repair') {
      const correctionSource = args.source, correctionReason = args.reason;
      if (!correctionSource || !correctionReason) throw new HarnessError('repair_reason_missing', '还没有指明被纠正的解释。');
      return this.repo.write(() => {
        this.repo.invalidate(old.id, 'user_correction');
        for (const id of args.affectedIds || []) {
          const affected = this.repo.work(scope, undefined, id)[0];
          if (!affected && !this.actions.get(scope, id))
            throw new HarnessError('repair_scope', '被影响对象不在当前范围内。');
          this.repo.invalidate(id, 'user_correction');
          // A corrected option must not remain selectable while the shared
          // matter awaits revalidation. Independent actions retain their own
          // approval and result state.
          if (affected && ['option', 'plan'].includes(affected.kind) && Array.isArray(old.data.optionIds)
            && old.data.optionIds.includes(id) && !['stale', 'rejected', 'cancelled'].includes(affected.status))
            this.work.update(scope, id, affected.revision, { status: 'stale' });
        }
        return this.work.update(scope, old.id, old.revision, { status: 'needs_review', data: { ...old.data, sessionId, tentativeUnderstanding: [], nextStep: null, decisionsNeedRevalidation: true, repair: { source: correctionSource, reason: correctionReason, at: this.repo.clock.now() }, state: 'in_progress' }, evidenceIds: [...new Set([...old.evidenceIds, evidence.id])] });
      });
    }
    if (args.operation === 'withdraw') {
      this.repo.invalidate(old.id, 'request_withdrawn');
      return this.work.update(scope, old.id, old.revision, { status: 'withdrawn', data: { ...old.data, state: 'withdrawn', reason: args.reason || args.source.quote } });
    }
    if (old.data.type === 'collaboration_frame') {
      if (!args.reason || !args.status) throw new HarnessError('progress_required', '事项进展需要说明当前变化。');
      const options = new Set(Array.isArray(old.data.optionIds) ? old.data.optionIds : []);
      return this.repo.write(() => {
        for (const id of args.affectedIds || []) {
          const option = this.repo.work(scope, undefined, id)[0];
          if (!option || !options.has(id)) throw new HarnessError('option_scope', '要重评的方案不属于这个事项。');
          this.work.update(scope, option.id, option.revision, { status: option.status === 'rejected' ? 'needs_review' : option.status,
            data: { ...option.data, reassessment: { reason: args.reason!, source: args.source!, at: this.repo.clock.now() }, adoptionUnchanged: true } });
        }
        return this.work.update(scope, old.id, old.revision, { status: 'active', evidenceIds: [...new Set([...old.evidenceIds, evidence.id])],
          data: { ...old.data, latestProgress: { source: args.source!, reason: args.reason!, at: this.repo.clock.now() }, nextStep: args.reason!, decisionsNeedRevalidation: !!args.affectedIds?.length } });
      });
    }
    if (old.data.type !== 'request_item') throw new HarnessError('request_required', '该对象不是明确请求。');
    const revisedRequest = args.expectedResult ? {
      ...old.data, expectedResult: args.expectedResult,
      source: { ...args.source, receivedAt: evidence.receivedAt, contentVersion: evidence.contentVersion },
      sourceHistory: [...(Array.isArray(old.data.sourceHistory) ? old.data.sourceHistory : []), old.data.source].slice(-8),
      ...(args.kind ? { requestKind: args.kind } : {}),
    } : old.data;
    const requestEvidence = [...new Set([...old.evidenceIds, evidence.id])];
    if (args.actionId) {
      const action = this.actions.get(scope, args.actionId);
      const receipts = this.actions.receipts(scope, args.actionId);
      if (!action || action.status !== 'succeeded' || !receipts.some(receipt => receipt.status === 'confirmed_success'))
        throw new HarnessError('receipt_required', '没有已核实的完成回执。');
      // Receipt existence is necessary; exact request/parameter correspondence
      // is still checked against the final answer before closing the request.
      return this.work.update(scope, old.id, old.revision, { evidenceIds: requestEvidence, data: { ...revisedRequest, state: 'in_progress', proposedResultRefs: [args.actionId] } });
    }
    if (!args.status || !args.reason) throw new HarnessError('request_state_missing', '未完成项需要具体状态和原因。');
    return this.work.update(scope, old.id, old.revision, { status: args.status, evidenceIds: requestEvidence, ...(args.title ? { title: args.title } : {}), data: { ...revisedRequest, state: args.status, reason: args.reason } });
  }

  /** Called only by the host's final review, never an acting-model tool. */
  finalize(scope: ScopeHandle, record: WorkRecord, state: 'answered' | 'succeeded', responseId: string, actionIds: string[] = [], resolution: { kind?: 'answer' | 'action' | 'artifact'; basisQuote?: string; artifactIds?: string[]; artifacts?: import('../../shared/types').ReleaseArtifact[] } = {}) {
    let kind = String(record.data.requestKind), data = record.data;
    if (resolution.kind && resolution.kind !== kind) {
      const source = record.data.source as { eventId: string; quote: string };
      if (!resolution.basisQuote || !source.quote.includes(resolution.basisQuote)) throw new HarnessError('classification_evidence', '请求类别的修正没有原话依据。');
      this.cite(scope, { eventId: source.eventId, quote: resolution.basisQuote });
      data = { ...data, requestKind: resolution.kind, classificationCorrection: { from: kind, to: resolution.kind, quote: resolution.basisQuote } };
      kind = resolution.kind;
    }
    if (kind === 'action' && state === 'answered') return this.work.update(scope, record.id, record.revision, { status: 'unfulfilled', data: { ...data, state: 'unfulfilled', reason: '本次已说明情况，尚未核实操作完成。', resultRefs: [responseId] } });
    if (kind === 'action' && (state !== 'succeeded' || !actionIds.length || actionIds.some(id => !this.actions.receipts(scope, id).some(receipt => receipt.status === 'confirmed_success'))))
      throw new HarnessError('receipt_required', '动作请求没有核实的回执，不能标为办成。');
    const artifacts = (resolution.artifactIds || []).map(id => resolution.artifacts?.find(artifact => artifact.id === id && artifact.privacyEpoch === this.repo.epoch && record.evidenceIds.includes(artifact.sourceMessageId)));
    if (kind === 'artifact' && (!artifacts.length || artifacts.some(artifact => !artifact))) throw new HarnessError('artifact_required', '成稿请求没有实际可交付的稿件。');
    const finalState = kind === 'action' ? state : 'answered';
    return this.work.update(scope, record.id, record.revision, { status: finalState, data: { ...data, state: finalState, resultRefs: [responseId, ...actionIds, ...artifacts.filter(Boolean).map(artifact => `artifact:${artifact!.id}@${artifact!.revision}`)] } });
  }
}
