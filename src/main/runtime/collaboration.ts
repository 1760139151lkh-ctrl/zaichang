import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, type ScopeHandle, type WorkRecord } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from './work';
import type { ActionRuntime } from '../actions/runtime';
import type { BasisService } from './basis';
import { canonical, codePointSlice } from './semantics';
import { resolveRetainedSourceQuote, resolveSourceQuote, resolveUniqueQuoteRange } from './source-quote';
import type { OwnedArtifactProof, OwnedArtifactReference } from './study-companion';

const citation = z.object({
  eventId: z.string().max(160), quote: z.string().min(1).max(4000),
  contentVersion: z.number().int().positive().optional(),
  start: z.number().int().nonnegative().optional().describe('quote在原文中的绝对Unicode码点起点；重复引文须给完整真实位置，或扩大逐字quote使其唯一。'),
  end: z.number().int().positive().optional(),
}).strict().superRefine((source, context) => {
  if (['contentVersion', 'start', 'end'].some(field => Object.hasOwn(source, field))
    && (source.contentVersion === undefined || source.start === undefined || source.end === undefined || source.end <= source.start))
    context.addIssue({ code: 'custom', path: ['start'], message: '原话位置需要完整的contentVersion/start/end，且end须晚于start；不完整位置不能重新寻找。' });
});
const supportedText = z.object({ text: z.string().max(1200), source: citation }).strict();
export const collaborationInput = z.object({
  operation: z.enum(['frame', 'request', 'progress', 'repair', 'withdraw', 'choose', 'experience']),
  selectedOptionId: z.string().max(160).nullable().optional().describe('choose记下本人这轮明确选定的已有方案ID；撤销选择时为null。找回、比较、询问和助手建议仍是商量过程。这一步只留下选择，日程和实际行动各自继续办理。'),
  id: z.string().max(160).optional(), expectedRevision: z.number().int().positive().optional(),
  expectedOptionRevision: z.number().int().positive().optional().describe('choose时刚读到的方案版本；即使这轮不留聊天，单独保留业务选择时也沿这份版本对应。'),
  source: citation.optional(),
  title: z.string().min(1).max(160).optional(),
  expectedResult: z.string().max(1600).optional(),
  kind: z.enum(['answer', 'action', 'artifact']).optional().describe('在当前回复里完成的说明、比较、讲题或一起续写是answer；明确另要独立稿件、或要留下可续用的学习纸等作品是artifact；改变日历、提醒、发送等实际业务状态是action。按这次想得到的结果理解。'),
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
  experience: z.object({
    kind: z.enum(['rejection', 'attempt_report', 'outcome_report', 'reassessment']).describe('只记录用户原话中的当时理由或报告。打算尝试不等于已经尝试，助手建议不等于实际结果；报告没有升级为外部核实。'),
    optionId: z.string().min(1).max(160), expectedOptionRevision: z.number().int().positive(),
    validWhen: z.string().min(1).max(1000).optional().describe('source.quote中逐字引用的适用条件；没有明确条件时省略，不概括或猜成永久偏好。'),
    stopWhen: z.string().min(1).max(1000).optional().describe('source.quote中逐字引用的停止或重新考虑条件；未知时省略。'),
    recheckAt: z.string().datetime({ offset: true }).nullable().optional().describe('助手建议的重评时间元数据，不是用户承诺或实际发生时间；不创建提醒。没有合适时点时省略。'),
    reassesses: z.string().min(1).max(160).optional().describe('reassessment必须指向同一事项、同一方案的已有经验ID；新报告不自动证明旧条件已失效。'),
  }).strict().optional(),
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
    if (!evidence || evidence.speaker !== 'user')
      throw new HarnessError('unsupported_evidence', '这项记录没有对应的用户原话。');
    const resolved = resolveSourceQuote(evidence, source);
    if (!resolved) throw new HarnessError('unsupported_evidence', '这段原话还没对到唯一的位置，或原文已经变了。可以多带几句原话，或沿原来的完整版本和起止位置重新找。');
    return { event: evidence, source: resolved };
  }

  private experienceSource(scope: ScopeHandle, source: z.infer<typeof citation>) {
    this.work.policy.require(scope, 'evidence:read');
    const { event, source: resolved } = this.cite(scope, source), range = { start: resolved.start, end: resolved.end };
    const now = Date.parse(this.repo.clock.now());
    if (this.repo.sourceRestrictions(scope, event.id).some(restriction =>
      (!restriction.effectiveFrom || Date.parse(restriction.effectiveFrom) <= now) &&
      (restriction.predicate === '*' || restriction.rangeUnknown || restriction.ranges.some(span =>
        span.contentVersion !== event.contentVersion || span.start < range.end && span.end > range.start))))
      throw new HarnessError('experience_source_changed', '这段原话对应的理解已被更正，不能再次记成当前理由；无关片段仍可使用。');
    return { event, range };
  }

  private experiences(scope: ScopeHandle, frame: WorkRecord) {
    this.work.policy.require(scope, 'evidence:read');
    const entries = Array.isArray(frame.data.decisionExperiences) ? frame.data.decisionExperiences : [];
    return entries.flatMap(value => {
      const entry = value as Record<string, any>, source = entry.source as { eventId: string; contentVersion: number; start: number; end: number; quoteSha256?: string };
      // Check the original scope before returning any quote, option title or
      // condition. An unreadable old source is not recoverable from this copy.
      if (!source || typeof source.eventId !== 'string') return [];
      const event = this.repo.evidence(scope, source.eventId);
      if (!event) return [];
      const option = typeof entry.optionId === 'string' ? this.repo.work(scope, undefined, entry.optionId)[0] : undefined;
      if (!option || !(frame.data.optionIds as string[] || []).includes(option.id)) return [];
      const pointer = { id: entry.id, kind: entry.kind, optionId: entry.optionId, optionRevision: entry.optionRevision,
        reportedAt: entry.reportedAt, recordedAt: entry.recordedAt, ...(entry.reassesses ? { reassesses: entry.reassesses } : {}),
        requiresReassessment: true, verifiedOutcome: false };
      if (source.contentVersion !== event.contentVersion || !Number.isInteger(source.start) || !Number.isInteger(source.end)
        || source.start < 0 || source.end <= source.start || source.end > Array.from(event.text).length)
        return [{ ...pointer, reviewReason: 'source_changed', meaning: '还能认出有过这段经历，但原文或位置已经变了，这次没有展开当时的理由、条件和结果。' }];
      const quote = codePointSlice(event.text, source.start, source.end);
      // Partial forgetting deliberately retains the source version and masks
      // only the deleted span. A locator must not reclassify that mask as a
      // fresh user report, nor suppress another intact span in the same event.
      if (!source.quoteSha256 || source.quoteSha256 !== createHash('sha256').update(quote).digest('hex'))
        return [{ ...pointer, reviewReason: 'source_changed', meaning: '这段原话已删除或改变，现在只留下这段经历的地址，当时的正文、理由和条件都没有带回来。' }];
      let reviewReason = 'current_conditions_unverified';
      try { this.experienceSource(scope, { eventId: event.id, quote, contentVersion: source.contentVersion, start: source.start, end: source.end }); }
      catch (error) {
        if (!(error instanceof HarnessError) || error.code !== 'experience_source_changed') throw error;
        return [{ ...pointer, reviewReason: 'source_changed', meaning: '本人后来更正过这段话的意思，这次只带回经历的地址，旧理由和条件先不带进来。' }];
      }
      if (option.revision !== entry.optionRevision) reviewReason = 'option_changed';
      else if (typeof entry.recheckAt === 'string' && Date.parse(entry.recheckAt) <= Date.parse(this.repo.clock.now())) reviewReason = 'recheck_due';
      const condition = (span: unknown) => {
        const range = span as { start?: number; end?: number } | null;
        return range && Number.isInteger(range.start) && Number.isInteger(range.end) && range.start! >= source.start && range.end! <= source.end
          ? codePointSlice(event.text, range.start!, range.end!) : null;
      };
      return [{ ...pointer, source: { ...source, quote }, reportedText: quote, validWhen: condition(entry.validWhen), stopWhen: condition(entry.stopWhen),
        recheckAt: entry.recheckAt ?? null, reviewTimeOrigin: 'assistant_proposed_recheck', observation: 'user_report', currentOptionRevision: option.revision, currentOptionStatus: option.status, reviewReason,
        meaning: reviewReason === 'option_changed'
          ? '这是你当时说过的理由、条件和经过。方案后来变了，先看看变的是哪一处，再一起判断原来的理由还适不适合；日程和实际行动仍留在原处。'
          : reviewReason === 'recheck_due'
            ? '到了先前提议回看这件事的时候。当时的理由、条件和经过都在这里，可以结合眼前的新情况再商量；实际结果仍看原记录。'
            : '这是你当时说过的理由、条件和经过，按当时的处境留下。今天是否有了变化，继续听眼前的话、看实际记录；还没有新消息时，原来的理由也值得认真看。' }];
    });
  }

  restore(scope: ScopeHandle, sessionId: string, query = '', offset = 0, limit = 8, relation: { relatedTo?: string; relatedOffset?: number } = {}) {
    this.work.policy.require(scope, 'evidence:read');
    const selected = relation.relatedTo ? this.repo.work(scope, undefined, relation.relatedTo).filter(record => record.data.type === 'collaboration_frame' || record.kind === 'goal') : undefined;
    const { items, total, nextOffset } = selected ? { items: selected, total: selected.length, nextOffset: null } : this.repo.collaborationPage(scope, sessionId, query, offset, limit);
    const optionIds = new Set(items.flatMap(record => Array.isArray(record.data.optionIds) ? record.data.optionIds : []));
    const basisUses = items.filter(record => record.kind === 'episode' || record.kind === 'goal').flatMap(record => this.basis?.read(scope, record.id) || []);
    const projected: WorkRecord[] = items.map(record => {
      if (record.data.type !== 'collaboration_frame') return record;
      const experiences = this.experiences(scope, record);
      return { ...record, data: { ...record.data,
        historicalInterpretations: Array.isArray(record.data.tentativeUnderstanding) ? record.data.tentativeUnderstanding : [], tentativeUnderstanding: [],
        interpretationUse: '这些是当时一起商量出的理解，所借的依据也一同带回了。今天是什么处境、想怎样做，继续接眼前这句话。',
        rejectionUse: '这里留着当时为什么不选、在什么条件下不选的原话。有些旧记录还没找到对应的现有方案，可以先留白；今天条件变了，想法也可以重新商量。',
        decisionExperiences: experiences,
        decisionExperienceCoverage: { returned: experiences.length,
          meaning: '这里展开了这次还能读到的同一方案经历。有的原话这次读不到，只留下了可辨认的位置；当时的留白就先留着。原来的记录逐条保留，存满时会说明哪一步还没添进去。' },
      } };
    });
    const relatedOptions = [...optionIds].flatMap(id => this.repo.work(scope, undefined, String(id)))
      .filter(record => record.data.type !== 'planning_intent');
    const parents = projected.filter(record => record.data.type === 'collaboration_frame' || record.kind === 'goal').map(record => record.id);
    const related = this.repo.relatedWorkPage(scope, parents, relation.relatedOffset || 0, limit);
    return { status: total ? 'fresh' : 'not_found', items: projected, basisUses, relatedOptions, relatedRecords: related.items, nextOffset,
      relatedCoverage: { parentIds: parents, totalMatches: related.total, nextOffset: related.nextOffset, complete: related.nextOffset === null,
        meaning: related.nextOffset === null
          ? '这次能找到的相关记录已翻到这里，各自留着原来的来处。接着商量可以从这些前情起步，日程和对外行动仍保持原样。'
          : '这些记录都连着眼前这件事，后面还有一页可以继续翻。先把前情读清，再接这次的想法；日程和对外行动仍保持原样。' },
      decisionState: { recordedDecisions: projected.flatMap(record => Array.isArray(record.data.decisions) ? record.data.decisions : []), acceptedOptionIds: relatedOptions.filter(option => option.status === 'accepted').map(option => option.id),
        selectedOptionIds: projected.flatMap(record => typeof record.data.selectedOptionId === 'string' ? [record.data.selectedOptionId] : []),
        meaning: '这里留着过去的决定和当时所指的方案。找回来或继续比较，先说明现在在谈哪一件；今天选不选，继续听本人这次的意思。你可以带着自己的判断一起商量，也让建议和本人已经作出的决定各留在原来的位置。' },
      coverage: { complete: nextOffset === null, totalMatches: total, returned: items.length,
        meaning: nextOffset === null ? '这次找到的记录已翻到这一页。相关原话若还需要更完整的前后文，可以沿各自来处继续读。'
          : '这里先带回一页找到的记录，后面还有同一范围的内容可以接着翻。各段原话也留着自己的来处。' } };
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
        throw new HarnessError('source_forbidden', '这份事项或方案用过的资料，这次还不能打开。');
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
    if (args.operation === 'experience') this.work.policy.require(scope, 'evidence:read');
    if (!args.source) throw new HarnessError('source_required', '需要指向原话，不能把建议自动变成你的任务。');
    const { event: evidence, source } = this.cite(scope, args.source);
    args.source = source;
    const old = args.id ? this.repo.work(scope, undefined, args.id)[0] : undefined;
    if (args.id && (!old || !['collaboration_frame', 'request_item'].includes(String(old.data.type)))) throw new HarnessError('work_missing', '没有找到本次相关事项。');
    if (old && args.expectedRevision !== old.revision) throw new HarnessError('version_conflict', '事项已改变，需要先读取当前版本。');
    if (args.operation === 'experience') {
      if (!old || old.data.type !== 'collaboration_frame' || !args.experience)
        throw new HarnessError('experience_required', '先读取同一事项和已有方案，再留下当时的理由或报告。');
      const input = args.experience, option = this.repo.work(scope, undefined, input.optionId)[0];
      if (!option || !['option', 'plan'].includes(option.kind) || !(old.data.optionIds as string[] || []).includes(option.id)
        || option.ownerId !== old.ownerId || option.workspaceId !== old.workspaceId || option.subjectId !== old.subjectId || option.worldId !== old.worldId
        || (typeof option.data.episodeId === 'string' || typeof option.data.matterId === 'string') && option.data.episodeId !== old.id && option.data.matterId !== old.id)
        throw new HarnessError('option_scope', '这个方案不属于当前事项，未保存它的经历。');
      if (option.revision !== input.expectedOptionRevision) throw new HarnessError('version_conflict', '方案已变化，需要先读取当前版本。');
      const history = Array.isArray(old.data.decisionExperiences) ? old.data.decisionExperiences : [];
      const previous = input.reassesses ? history.find(value => (value as Record<string, any>).id === input.reassesses) as Record<string, any> | undefined : undefined;
      if (input.kind === 'reassessment' && !previous || input.reassesses && (!previous || previous.optionId !== option.id))
        throw new HarnessError('experience_reference', '重新考虑需要指向同一事项、同一方案的已有经历。');
      if (input.kind !== 'reassessment' && input.reassesses)
        throw new HarnessError('experience_reference', '只有重新考虑记录可以关联旧理由；结果报告不能覆盖旧经历。');
      const { event, range } = this.experienceSource(scope, args.source);
      const legacyId = 'experience:' + createHash('sha256').update(`${old.id}\0${option.id}\0${input.kind}\0${event.id}\0${event.contentVersion}\0${args.source.quote}`).digest('hex');
      const sameLegacy = history.find(value => {
        const entry = value as Record<string, any>, source = entry.source;
        return entry.id === legacyId && source?.eventId === event.id && source.contentVersion === event.contentVersion
          && source.start === range.start && source.end === range.end;
      }) as Record<string, any> | undefined;
      const id = sameLegacy?.id || 'experience:' + createHash('sha256').update(`${legacyId}\0${range.start}\0${range.end}`).digest('hex');
      const conditionRange = (text: string | undefined) => {
        if (!text) return null;
        const local = resolveUniqueQuoteRange(args.source!.quote, text);
        if (!local) throw new HarnessError('experience_condition_source', '适用和停止条件须在选定用户原话中有唯一的逐字位置；请扩大条件引文，未知条件可以留空。');
        return { start: range.start + local.start, end: range.start + local.end };
      };
      const entry = { id, kind: input.kind, optionId: option.id, optionRevision: option.revision,
        source: { eventId: event.id, ...range, contentVersion: event.contentVersion, receivedAt: event.receivedAt,
          quoteSha256: createHash('sha256').update(args.source.quote).digest('hex') },
        reportedAt: event.receivedAt,
        validWhen: conditionRange(input.validWhen), stopWhen: conditionRange(input.stopWhen),
        recheckAt: input.recheckAt ?? null, reviewTimeOrigin: 'assistant_proposed_recheck',
        ...(input.reassesses ? { reassesses: input.reassesses } : {}), observation: 'user_report', verifiedOutcome: false,
      };
      const duplicate = history.find(value => (value as Record<string, any>).id === id) as Record<string, any> | undefined;
      if (duplicate) {
        const { recordedAt: _recordedAt, ...prior } = duplicate;
        if (canonical(prior) !== canonical(entry)) throw new HarnessError('experience_conflict', '同一段经历的条件或关联已经不同，未覆盖旧记录；新的说明请使用新的用户原话并关联重评。');
        return old;
      }
      if (history.length >= 64) throw new HarnessError('experience_capacity', '这件事已有64条经历，原来的理由和条件都还在；未覆盖或截掉旧记录，本次没有保存。');
      // The frame keeps only locators, never a second copy of private quotes
      // or conditions. Losing one report must not make unrelated work unreadable.
      return this.work.update(scope, old.id, old.revision, {
        data: { ...old.data, decisionExperiences: [...history, { ...entry, recordedAt: this.repo.clock.now() }] } });
    }
    if (args.operation === 'choose') {
      if (!old || old.data.type !== 'collaboration_frame' || args.selectedOptionId === undefined) throw new HarnessError('choice_required', '先读取当前事项及其方案，再指定选择。');
      const selectedOptionId = args.selectedOptionId;
      const option = args.selectedOptionId === null ? undefined : this.repo.work(scope, undefined, args.selectedOptionId)[0];
      if (args.selectedOptionId !== null && (!option || !(old.data.optionIds as string[] || []).includes(option.id) || !['option', 'plan'].includes(option.kind) || ['rejected', 'blocked', 'stale', 'cancelled'].includes(option.status))) throw new HarnessError('choice_missing', '这个方案已改变或不属于当前事项。');
      if (option && args.expectedOptionRevision !== undefined && option.revision !== args.expectedOptionRevision)
        throw new HarnessError('version_conflict', '这个方案刚刚变过，先看看现在的内容，再决定怎样继续。');
      return this.repo.write(() => {
        this.repo.invalidate(old.id, 'selection_changed');
        return this.work.update(scope, old.id, old.revision, { status: 'active', evidenceIds: [...new Set([...old.evidenceIds, evidence.id])], data: { ...old.data,
          selectedOptionId, selection: { optionId: selectedOptionId, optionRevision: option?.revision ?? null, sourceEventId: evidence.id, selectedAt: this.repo.clock.now(), actualBusinessEffects: false },
        } });
      });
    }
    if (args.operation === 'frame') {
      if (!args.frame) throw new HarnessError('frame_required', '共同理解内容未提供。');
      const sources = [evidence.id];
      for (const item of [...args.frame.confirmedFacts, ...args.frame.decisions, ...args.frame.rejectedOptions]) {
        const { event, source } = this.cite(scope, item.source);
        sources.push(event.id); item.source = source;
      }
      const pointers = Object.fromEntries(['optionIds', 'lastDisplayedOptionIds', 'referencedOptionId', 'focusSequence', 'decisionExperiences'].filter(key => old?.data[key] !== undefined).map(key => [key, old!.data[key]]));
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
      const legacyId = 'request:' + createHash('sha256').update(`${evidence.id}\0${args.source.quote}\0${args.expectedResult}`).digest('hex');
      const id = 'request:' + createHash('sha256').update(`${legacyId}\0${source.contentVersion}\0${source.start}\0${source.end}`).digest('hex');
      const existing = this.requests(scope, sessionId).find(record => record.id === id || record.id === legacyId
        && canonical(resolveRetainedSourceQuote(evidence, record.data.source)) === canonical(source));
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
        throw new HarnessError('receipt_required', '还没找到这项操作确实办成的记录。');
      // Receipt existence is necessary; exact request/parameter correspondence
      // is still checked against the final answer before closing the request.
      return this.work.update(scope, old.id, old.revision, { evidenceIds: requestEvidence, data: { ...revisedRequest, state: 'in_progress', proposedResultRefs: [args.actionId] } });
    }
    if (!args.status || !args.reason) throw new HarnessError('request_state_missing', '未完成项需要具体状态和原因。');
    return this.work.update(scope, old.id, old.revision, { status: args.status, evidenceIds: requestEvidence, ...(args.title ? { title: args.title } : {}), data: { ...revisedRequest, state: args.status, reason: args.reason } });
  }

  /** Called only by the host's final review, never an acting-model tool. */
  finalize(scope: ScopeHandle, record: WorkRecord, state: 'answered' | 'succeeded', responseId: string, actionIds: string[] = [], resolution: {
    kind?: 'answer' | 'action' | 'artifact'; basisQuote?: string; artifactIds?: string[];
    artifacts?: import('../../shared/types').ReleaseArtifact[];
    ownedArtifacts?: OwnedArtifactReference[];
    ownedArtifactProofs?: OwnedArtifactProof[];
  } = {}) {
    let kind = String(record.data.requestKind), data = record.data;
    if (resolution.kind && resolution.kind !== kind) {
      const saved = record.data.source as { eventId?: unknown } | undefined;
      const event = typeof saved?.eventId === 'string' ? this.repo.evidence(scope, saved.eventId) : undefined;
      const retained = event && resolveRetainedSourceQuote(event, saved);
      if (!retained) throw new HarnessError('classification_evidence', '原请求依据的版本或位置已变化，未沿旧文字重新定位。');
      const { source } = this.cite(scope, retained);
      const local = resolution.basisQuote && resolveUniqueQuoteRange(source.quote, resolution.basisQuote);
      if (!local) throw new HarnessError('classification_evidence', '请求类别的修正需要在原请求片段中有唯一位置的逐字依据。');
      const correctionSource = { ...source, quote: resolution.basisQuote!, start: source.start + local.start, end: source.start + local.end };
      this.cite(scope, correctionSource);
      data = { ...data, requestKind: resolution.kind,
        classificationCorrection: { from: kind, to: resolution.kind, quote: correctionSource.quote, source: correctionSource } };
      kind = resolution.kind;
    }
    if (kind === 'action' && state === 'answered') return this.work.update(scope, record.id, record.revision, { status: 'unfulfilled', data: { ...data, state: 'unfulfilled', reason: '本次已说明情况，尚未核实操作完成。', resultRefs: [responseId] } });
    if (kind === 'action' && (state !== 'succeeded' || !actionIds.length || actionIds.some(id => !this.actions.receipts(scope, id).some(receipt => receipt.status === 'confirmed_success'))))
      throw new HarnessError('receipt_required', '这项操作还缺确实办成的记录，先留在尚未完成的地方。');
    const artifacts = (resolution.artifactIds || []).map(id => resolution.artifacts?.find(artifact => artifact.id === id && artifact.privacyEpoch === this.repo.epoch && record.evidenceIds.includes(artifact.sourceMessageId)));
    const ownedArtifacts = [...new Map((resolution.ownedArtifacts || []).map(reference =>
      [canonical(reference), reference])).values()].map(reference => {
      const proof = resolution.ownedArtifactProofs?.find(value => value.reference.owner === reference.owner
        && value.reference.id === reference.id && value.reference.revision === reference.revision);
      if (!proof) throw new HarnessError('artifact_required', '这份成果还没回到原来的保存位置核对，先找回实际留下的那一版。');
      proof.assertCurrent();
      const saved = data.source as { eventId?: unknown } | undefined;
      const event = typeof saved?.eventId === 'string' ? this.repo.evidence(scope, saved.eventId) : undefined;
      const request = event && resolveRetainedSourceQuote(event, saved);
      const source = proof.reference.requestSource;
      // An old paper from another request cannot satisfy a new save merely
      // because its title or subject looks similar. The owner must retain the
      // actual save's user source, covering this request's exact source span.
      if (!request || source.eventId !== request.eventId || source.contentVersion !== request.contentVersion
        || source.start > request.start || source.end < request.end
        || !proof.reference.sourceBinding.refs.some(ref => canonical(ref) === canonical(source)))
        throw new HarnessError('artifact_request_source', '这份成果还没对到这次想保存的那段原话，先沿本次请求核对。');
      return { owner: reference.owner, id: reference.id, revision: reference.revision };
    });
    if (kind === 'artifact' && (artifacts.some(artifact => !artifact) || !artifacts.length && !ownedArtifacts.length))
      throw new HarnessError('artifact_required', '成稿请求还没有对到实际保存并交付的那份内容。');
    const finalState = kind === 'action' ? state : 'answered';
    return this.work.update(scope, record.id, record.revision, { status: finalState, data: { ...data, state: finalState,
      ...(ownedArtifacts.length ? { ownedArtifactRefs: ownedArtifacts } : {}),
      resultRefs: [responseId, ...actionIds, ...artifacts.filter(Boolean).map(artifact => `artifact:${artifact!.id}@${artifact!.revision}`),
        ...ownedArtifacts.map(reference => `owned:${reference.owner}:${reference.id}@${reference.revision}`)] } });
  }
}
