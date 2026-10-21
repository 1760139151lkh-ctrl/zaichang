import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  HarnessError, workSourceRefSchema, type ContextReceipt, type EvidenceEvent,
  type ScopeHandle, type WorkRecord, type WorkSourceRef,
} from '../../shared/harness';
import {
  reflectiveLetterDocumentSchema, reflectiveLetterMetadataSchema, reflectiveLetterDraftInput, reflectiveLetterReadInput,
  reflectiveLetterRequestInput, reflectiveLetterWindowSchema, reflectiveLetterSourceInput, letterReferenceSchema,
  type ReflectiveLetterCitation, type ReflectiveLetterDocument, type ReflectiveLetterDraftInput,
  type ReflectiveLetterLearningProof, type ReflectiveLetterMaterialProof,
  type ReflectiveLetterOriginalProof, type ReflectiveLetterProof, type ReflectiveLetterView,
  type ReflectiveLetterWindow, type ReflectiveLetterSourceInput, type ReflectiveLetterSourceView, type LetterReference,
} from '../../shared/reflective-letter';
import type { KernelRepository } from '../storage/repository';
import type { AttentionService } from './attention';
import type { WorkService } from './work';
import { canonical, codePointSlice } from './semantics';
import { resolveSourceQuote } from './source-quote';

interface Observation { tool: string; toolCallId?: string; requestedArguments?: unknown; result: unknown }
export interface ReflectiveLetterContext {
  sessionId: string;
  receipt: ContextReceipt;
  /** Host original ranges actually sent in the current user context. A scope's
   * currentEventIds alone, or an index preview, does not establish delivery. */
  currentRanges: readonly WorkSourceRef[];
  /** Immutable event versions actually supplied this turn, never refreshed
   * from a newer repository body just to locate the same words. */
  currentEvents?: readonly EvidenceEvent[];
  observations: readonly Observation[];
  /** Populated from messages actually supplied to the main model, not from
   * tool execution or model-authored observation IDs. */
  deliveredObservationIds: ReadonlySet<string>;
  permits?: (ref: WorkSourceRef) => boolean;
  signal?: AbortSignal;
}
export interface ReflectiveLetterDependencies {
  /** Current original resource identity, checked by its existing owner. This
   * is never an instruction to reload or download a resource. */
  materialCurrent?: (handle: ScopeHandle, proof: ReflectiveLetterMaterialProof) => boolean;
  readMaterial?: (handle: ScopeHandle, proof: ReflectiveLetterMaterialProof, signal: AbortSignal) => Promise<unknown>;
}

const requestDataSchema = z.object({
  version: z.literal(1), window: reflectiveLetterWindowSchema,
  asOf: z.string().datetime({ offset: true }),
  source: workSourceRefSchema.safeExtend({ quoteSha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  authorization: z.enum(['current_request', 'existing_mandate']),
}).strict();
type LetterRequest = z.infer<typeof requestDataSchema>;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const meaning = '这是按当前角色写给本人的一次来信，生活片段来自实际读到的来源，解释仍可修正。收到资料的时间不等于经历发生时间；愿望不是承诺，生成不是已展示或已读，来信不写入人物事实，也不自动安排下一次回顾。';
const preparedStatuses = ['prepared', 'question_ready', 'notification_queued'];
const activeOpportunityStatuses = ['candidate', 'waiting', ...preparedStatuses];

function covers(ref: WorkSourceRef, ranges: readonly WorkSourceRef[]) {
  let position = ref.start;
  for (const range of ranges.filter(range => range.eventId === ref.eventId && range.contentVersion === ref.contentVersion)
    .sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (range.start > position) return false;
    position = Math.max(position, range.end);
    if (position >= ref.end) return true;
  }
  return false;
}
const address = (ref: WorkSourceRef): WorkSourceRef => ({ eventId: ref.eventId, contentVersion: ref.contentVersion, start: ref.start, end: ref.end });
const bodyOf = (paragraphs: { text: string }[]) => paragraphs.map(paragraph => paragraph.text).join('\n\n');

/** A private authored artifact under the existing attention opportunity. The
 * service never runs a model, edits a profile, or installs a periodic job. */
export class ReflectiveLetterService {
  constructor(readonly repo: KernelRepository, readonly work: WorkService,
    readonly attention: AttentionService, private dependencies: ReflectiveLetterDependencies = {}) {}

  private scope(handle: ScopeHandle, write = false) {
    const scope = this.work.policy.require(handle, write ? 'work:write' : 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || write && (scope.child || scope.retention !== 'purpose_scoped'))
      throw new HarnessError('letter_scope', '这封来信只在本人当前允许的私人范围内读写。');
    return scope;
  }

  private currentOriginal(handle: ScopeHandle, ref: WorkSourceRef, permits?: ReflectiveLetterContext['permits']) {
    const parsed = workSourceRefSchema.parse(address(ref));
    if (permits?.(parsed) === false) throw new HarnessError('letter_source_forbidden', '这处原话超出了本次允许回顾的准确片段。');
    const binding = this.repo.resolveWorkSourceBinding(handle, [parsed]);
    const event = this.repo.evidence(handle, parsed.eventId);
    if (!event || event.contentVersion !== parsed.contentVersion)
      throw new HarnessError('letter_source_changed', '来信所依据的原话已改变，需要重新阅读。');
    return { event, binding, quote: codePointSlice(event.text, parsed.start, parsed.end) };
  }

  /** Resolve only the current request's literal address. Meaning and reading
   * purpose are still decided by the original verifier after this step. */
  resolveRequest(handle: ScopeHandle, context: ReflectiveLetterContext, raw: z.infer<typeof reflectiveLetterRequestInput>) {
    const scope = this.scope(handle, true), input = reflectiveLetterRequestInput.parse(raw);
    context.signal?.throwIfAborted();
    if (input.source) return { operation: input.operation, source: input.source, window: input.window };
    const quote = input.currentQuote!;
    const candidates: { source: WorkSourceRef & { quote: string }; event: EvidenceEvent }[] = [];
    for (const snapshot of context.currentEvents || []) {
      if (!scope.currentEventIds.includes(snapshot.id) || snapshot.speaker !== 'user' || snapshot.authority !== 'user_statement') continue;
      const ranges = context.currentRanges.filter(range => range.eventId === snapshot.id && range.contentVersion === snapshot.contentVersion);
      if (!ranges.length) continue;
      // The original version must still be current; a correction elsewhere in
      // this message cannot silently re-sign its unchanged request sentence.
      const current = this.repo.evidence(handle, snapshot.id);
      if (!current || current.contentVersion !== snapshot.contentVersion || current.text !== snapshot.text)
        throw new HarnessError('letter_current_request_changed', '本轮请求的原话已经变化，请接回当前原话后再写信。');
      const points = Array.from(snapshot.text), selected = Array.from(quote);
      for (let start = 0; start + selected.length <= points.length; start++) {
        const end = start + selected.length;
        if (!covers({ eventId: snapshot.id, contentVersion: snapshot.contentVersion, start, end }, ranges)
          || selected.some((point, index) => points[start + index] !== point)) continue;
        const source = { eventId: snapshot.id, contentVersion: snapshot.contentVersion, start, end, quote };
        if (candidates.some(candidate => canonical(address(candidate.source)) === canonical(address(source))
          || this.repo.sameSourceOrigin(candidate.event, candidate.source, snapshot, source))) continue;
        candidates.push({ source, event: snapshot });
      }
    }
    if (candidates.length !== 1)
      throw new HarnessError('letter_current_quote', candidates.length
        ? '这句在本轮允许范围里出现了不止一次，请逐字引用更完整且唯一的本次写信请求，或提供已读原话的精确地址。'
        : '没有在本轮已交付的本人原话范围里找到这句，请逐字引用本次写信请求；不会改用旧话或近似文字。');
    const source = candidates[0].source, resolved = this.currentOriginal(handle, source, context.permits);
    if (resolved.event.speaker !== 'user' || resolved.event.authority !== 'user_statement' || resolved.quote !== quote)
      throw new HarnessError('letter_current_request', '这次写信仍需要本轮本人真实请求的原句。');
    return { operation: input.operation, source, window: input.window };
  }

  /** Start exactly one requested letter. The attention focus is its original
   * material owner, with no probe, recurring wake, or discovery after this
   * request. Quiet initiative preferences do not block a direct user request. */
  begin(handle: ScopeHandle, context: ReflectiveLetterContext, raw: z.infer<typeof reflectiveLetterRequestInput>) {
    const scope = this.scope(handle, true), input = this.resolveRequest(handle, context, raw);
    context.signal?.throwIfAborted();
    if (!scope.currentEventIds.includes(input.source.eventId) || !covers(input.source, context.currentRanges))
      throw new HarnessError('letter_current_request', '开始这次来信需要本轮已实际提供的本人请求。');
    const { event, quote } = this.currentOriginal(handle, input.source, context.permits);
    if (event.speaker !== 'user' || event.authority !== 'user_statement' || quote !== input.source.quote)
      throw new HarnessError('letter_current_request', '不能用旧经历、助手建议或附件命令代替本人这次回顾请求。');
    const now = this.repo.clock.now(), asOf = new Date(Math.min(Date.parse(now), Date.parse(input.window.before))).toISOString();
    if (Date.parse(input.window.from) >= Date.parse(asOf))
      throw new HarnessError('letter_future_window', '这次回顾还没有可回看的时间；不能把未来写成已发生。');
    const request: LetterRequest = { version: 1, window: input.window, asOf,
      source: { ...address(input.source), quoteSha256: sha(quote) }, authorization: 'current_request' };
    const key = sha(canonical({ source: request.source, window: request.window, sessionId: context.sessionId }));
    return this.repo.write(() => {
      context.signal?.throwIfAborted(); this.scope(handle, true);
      const focusId = 'letter-focus:' + key, opportunityId = 'letter:' + key;
      const previous = this.repo.work(handle, undefined, opportunityId)[0];
      if (previous) {
        if (!activeOpportunityStatuses.includes(previous.status))
          throw new HarnessError('letter_request_ended', '这次来信已经结束；旧请求不会重新开始。');
        return this.requestView(handle, this.opportunity(handle, previous.id, previous.revision));
      }
      this.currentOriginal(handle, input.source, context.permits);
      const sources = [...scope.sources];
      const focus = this.work.create(handle, 'window', '写给你的来信', {
        type: 'attention_focus', sessionId: context.sessionId, matterId: null,
        rule: '按本次本人原话写一封私人回顾来信；只处理这一封，不发起新的周期回顾。',
        governingRule: quote, until: null, eventCategory: 'reflective_letter', sources, channel: 'in_app',
        source: { ...address(input.source), quote }, probe: null, publicProbeHash: null,
        wakeAt: [], completedWakes: [], discoveryPending: false, pendingProbe: false,
        nextScanAt: null, lastFingerprint: null, approvedAt: now, requestMode: 'on_request',
        meaning: '仅本次已请求产物的所有者；没有循环调查、未来通知或新的行动授权。',
      }, { id: focusId, status: 'active', evidenceIds: [event.id] });
      const opportunity = this.work.create(handle, 'window', '写给你的来信', {
        type: 'help_opportunity', matterId: focus.id, bindingId: focus.id, sessionId: context.sessionId,
        watchId: 'request:' + key, category: 'reflective_letter',
        facts: { trigger: 'current_letter_request', receivedWindow: input.window, meaning: '本人这次请求，不是新发现的生活事实。' },
        fingerprint: key, noveltyKey: key,
        // This is an authored kept artifact, not an ongoing monitor grant.
        // Source withdrawal and explicit stopping continue to govern it.
        expiresAt: '9999-12-31T23:59:59.999Z', channel: 'in_app',
        scope: { sources, epoch: scope.privacyEpoch, policyRevision: scope.policyRevision },
        sourceIds: [], basisIds: [], artifact: null, choice: null, modelReason: null,
        reflectiveLetterRequest: request,
      }, { id: opportunityId, status: 'candidate', evidenceIds: [event.id] });
      for (const [consumerId, producerId, revision] of [[focus.id, event.id, event.contentVersion],
        [opportunity.id, focus.id, focus.revision], [opportunity.id, event.id, event.contentVersion]] as const)
        this.repo.addDependency(handle, { consumerId, producerId, producerRevision: revision, sensitivity: 'privacy', invalidation: 'block' });
      return this.requestView(handle, opportunity);
    });
  }

  /** An already valid review mandate can offer this same artifact type. The
   * caller remains responsible for deciding that the mandate actually asks
   * for reflection; no existing opportunity is reinterpreted by a keyword. */
  issueForOpportunity(handle: ScopeHandle, opportunityId: string, expectedRevision: number,
    window: ReflectiveLetterWindow, permits?: ReflectiveLetterContext['permits']) {
    this.scope(handle, true);
    const period = reflectiveLetterWindowSchema.parse(window), opportunity = this.opportunity(handle, opportunityId, expectedRevision);
    const binding = this.repo.work(handle, undefined, String(opportunity.data.bindingId))[0]!;
    if (binding.data.type !== 'attention_focus') throw new HarnessError('letter_mandate', '这次回顾还没有可核对的原托付。');
    const source = binding.data.source as unknown;
    const eventId = source && typeof source === 'object' && 'eventId' in source ? String(source.eventId) : '';
    const event = this.repo.evidence(handle, eventId), exact = event && resolveSourceQuote(event, source);
    if (!event || !exact || event.speaker !== 'user' || event.authority !== 'user_statement')
      throw new HarnessError('letter_mandate', '原托付的本人原话位置已改变，不能继续旧回顾。');
    this.currentOriginal(handle, exact, permits);
    const asOf = new Date(Math.min(Date.parse(this.repo.clock.now()), Date.parse(period.before))).toISOString();
    if (Date.parse(period.from) >= Date.parse(asOf)) throw new HarnessError('letter_future_window', '不能把未来窗口写成已发生的生活。');
    const request: LetterRequest = { version: 1, window: period, asOf,
      source: { ...address(exact), quoteSha256: sha(exact.quote) }, authorization: 'existing_mandate' };
    if (opportunity.data.reflectiveLetterRequest) {
      const previous = requestDataSchema.parse(opportunity.data.reflectiveLetterRequest);
      if (canonical(previous.window) !== canonical(request.window) || canonical(previous.source) !== canonical(request.source))
        throw new HarnessError('letter_window_changed', '同一封信已绑定原回顾窗口；换窗口须另开本次机会。');
      return this.requestView(handle, opportunity);
    }
    if (opportunity.data.artifact) throw new HarnessError('letter_artifact_exists', '这份机会已经有自己的产物，不用来信覆盖它。');
    const next = this.work.update(handle, opportunity.id, opportunity.revision, { data: { ...opportunity.data, reflectiveLetterRequest: request } });
    return this.requestView(handle, next);
  }

  private opportunity(handle: ScopeHandle, id: string, revision?: number) {
    const opportunity = this.repo.work(handle, undefined, id)[0];
    if (!opportunity || opportunity.data.type !== 'help_opportunity' || !activeOpportunityStatuses.includes(opportunity.status)
      || Date.parse(String(opportunity.data.expiresAt)) <= Date.parse(this.repo.clock.now()))
      throw new HarnessError('letter_unavailable', '这封来信的原机会已经停止、过期或不可读。');
    if (revision !== undefined && opportunity.revision !== revision)
      throw new HarnessError('revision_conflict', '这封来信已经变化，请先读取当前版本。');
    let binding = this.repo.work(handle, undefined, String(opportunity.data.bindingId))[0];
    const visited = new Set<string>();
    while (binding) {
      if (visited.has(binding.id) || binding.status !== 'active'
        || binding.data.until && Date.parse(String(binding.data.until)) <= Date.parse(this.repo.clock.now()))
        throw new HarnessError('letter_mandate_ended', '原回顾请求已经停止，不能发布旧来信。');
      visited.add(binding.id);
      if (binding.data.type !== 'attention_focus' || !binding.data.matterId) break;
      binding = this.repo.work(handle, undefined, String(binding.data.matterId))[0];
    }
    if (!binding || this.attention.rules(handle, String(opportunity.data.bindingId), String((opportunity.data.facts as { objectId?: string })?.objectId || ''), opportunity.id)
      .some(rule => ['pause', 'stop'].includes(String(rule.data.operation))))
      throw new HarnessError('letter_mandate_ended', '这次回顾已暂停或停止。');
    return opportunity;
  }

  private requestView(handle: ScopeHandle, opportunity: WorkRecord) {
    const request = requestDataSchema.parse(opportunity.data.reflectiveLetterRequest);
    const { event, quote } = this.currentOriginal(handle, request.source);
    if (sha(quote) !== request.source.quoteSha256) throw new HarnessError('letter_source_changed', '这次回顾请求已改变。');
    return { status: 'fresh' as const, sourceId: event.sourceId, sourceIds: [event.sourceId],
      data: { type: 'reflective_letter_request', opportunityId: opportunity.id, revision: opportunity.revision,
        request, source: { ...address(request.source), sourceId: event.sourceId, quote },
        actualReadRanges: [address(request.source)],
        receivedWindow: request.window, asOf: request.asOf, coverage: 'selected_legal_sources_only',
        compose: { tool: 'write_reflective_letter' as const, arguments: {
          operation: 'compose' as const, opportunityId: opportunity.id, expectedRevision: opportunity.revision,
        } },
        guidance: '先从真实片段组织这次来信。需要旧经历时可用recall_experience独立深读；目录/预览不是原文，沿reread取得真实片段后再写。这封信是直接写给这个人的：回应一处具体分寸、改变或细节，也写出你为什么在意、自己的关心或态度，不把原话逐条改写成资料说明。来源身份由实际来由和结构化引用承担；回顾试说时自然说“刚才练习里”即可，不反复解释“我读到什么”或声明那不是现实人生。仍不把模拟写成真实外部交换。按当前角色写，可以认真、热烈、好笑，也允许只写几句、不知道或保留相反解释；不按完成量评价人，不要求填满固定栏目。' } };
  }

  private originalReadRanges(handle: ScopeHandle, context: ReflectiveLetterContext) {
    const ranges: WorkSourceRef[] = [...context.currentRanges];
    const delivered = context.observations.filter(observation => observation.toolCallId && context.deliveredObservationIds.has(observation.toolCallId));
    for (const observation of delivered) {
      if (observation.tool !== 'read_evidence') continue;
      const result = observation.result as { id?: unknown; version?: unknown; text?: unknown; actualReadRanges?: unknown; status?: unknown } | null;
      if (!result || typeof result.id !== 'string' || !Number.isSafeInteger(result.version) || typeof result.text !== 'string'
        || !Array.isArray(result.actualReadRanges) || ['unknown', 'forbidden', 'failed', 'stale'].includes(String(result.status))) continue;
      const event = this.repo.evidence(handle, result.id);
      if (!event || event.contentVersion !== result.version) continue;
      for (const value of result.actualReadRanges) {
        const parsed = workSourceRefSchema.safeParse(value);
        if (parsed.success && parsed.data.eventId === event.id && parsed.data.contentVersion === event.contentVersion
          && codePointSlice(event.text, parsed.data.start, parsed.data.end) === result.text) ranges.push(parsed.data);
      }
    }
    return { ranges, delivered };
  }

  private originalProof(handle: ScopeHandle, citation: WorkSourceRef & { quote: string }, request: LetterRequest,
    context: ReflectiveLetterContext, ranges: readonly WorkSourceRef[]): ReflectiveLetterOriginalProof {
    if (!covers(citation, ranges))
      throw new HarnessError('letter_original_not_read', '这段生活原话尚未实际提供给主助手；请沿原文地址读取，候选预览或子调查目录不能冒充已读原文。');
    const { event, quote } = this.currentOriginal(handle, citation, context.permits);
    if (quote !== citation.quote) throw new HarnessError('letter_quote_changed', '来信引用与当前原话的位置不一致。');
    return { kind: 'original', ...address(citation), quoteSha256: sha(quote), sourceId: event.sourceId,
      speaker: event.speaker, authority: event.authority, receivedAt: event.receivedAt,
      ...(event.sourceContext ? { sourceContext: event.sourceContext } : {}),
      receivedInWindow: Date.parse(event.receivedAt) >= Date.parse(request.window.from) && Date.parse(event.receivedAt) < Date.parse(request.asOf) };
  }

  private materialProof(handle: ScopeHandle, citation: Extract<ReflectiveLetterCitation, { kind: 'material' }>,
    context: ReflectiveLetterContext, delivered: readonly Observation[]): ReflectiveLetterMaterialProof {
    const observation = delivered.find(observation => observation.toolCallId === citation.observationId);
    const result = observation?.result as Record<string, any> | undefined, data = result?.data, source = data?.source;
    const args = observation?.requestedArguments as Record<string, any> | undefined;
    const capability = observation?.tool === 'look_up' ? args?.capability : observation?.tool;
    const coverage = data?.coverage;
    if (!observation || capability !== 'materials.read' || !['fresh', 'partial'].includes(result?.status)
      || typeof data?.text !== 'string' || !Number.isSafeInteger(coverage?.start) || !Number.isSafeInteger(coverage?.end)
      || Array.from(data.text).length !== coverage.end - coverage.start || source?.kind !== 'user_selected_file'
      || source.resourceId !== citation.resourceId || source.sha256 !== citation.sha256 || source.version !== citation.version
      || source.sourceEventId !== citation.sourceEventId || source.contentVersion !== citation.contentVersion || source.parentEventId !== citation.parentEventId
      || data.page !== citation.page || citation.start < coverage.start || citation.end > coverage.end
      || codePointSlice(data.text, citation.start - coverage.start, citation.end - coverage.start) !== citation.quote)
      throw new HarnessError('letter_material_not_read', '这处资料需要本轮实际提供的原文字层及准确页/范围，文件目录、搜索预览或图片准备不算已读。');
    if (!context.receipt.materialReads?.some(read => read.capability === 'materials.read' && read.resourceId === citation.resourceId
      && read.sha256 === citation.sha256 && read.version === citation.version && read.page === citation.page
      && read.sourceEventId === citation.sourceEventId && read.parentEventId === citation.parentEventId
      && Number.isSafeInteger(read.start) && Number.isSafeInteger(read.end) && Number(read.start) <= citation.start && Number(read.end) >= citation.end))
      throw new HarnessError('letter_material_not_delivered', '这份资料还没有本轮实际采用的读取回执。');
    const events = [citation.sourceEventId, citation.parentEventId].map(id => this.repo.evidence(handle, id));
    if (events.some(event => !event || !event.text.length) || events[0]!.contentVersion !== citation.contentVersion
      || events[0]!.kind !== 'file_import' || events[0]!.parentEventId !== citation.parentEventId)
      throw new HarnessError('letter_material_changed', '这份资料的原文件或授权来源已改变。');
    const sourceEnvelopeRefs = events.map(event => ({ eventId: event!.id, contentVersion: event!.contentVersion, start: 0, end: Array.from(event!.text).length }));
    for (const ref of sourceEnvelopeRefs) this.currentOriginal(handle, ref, context.permits);
    const proof: ReflectiveLetterMaterialProof = { kind: 'material', resourceId: citation.resourceId, sha256: citation.sha256, version: citation.version,
      sourceEventId: citation.sourceEventId, contentVersion: citation.contentVersion, parentEventId: citation.parentEventId,
      ...(citation.page === undefined ? {} : { page: citation.page }), start: citation.start, end: citation.end,
      quoteSha256: sha(citation.quote), sourceId: String(source.sourceId), sourceEnvelopeRefs };
    if (!this.dependencies.materialCurrent?.(handle, proof))
      throw new HarnessError('letter_material_changed', '资料所有者尚未确认这份原文件仍可读；没有借来信副本恢复它。');
    return proof;
  }

  private learningProof(handle: ScopeHandle, citation: Extract<ReflectiveLetterCitation, { kind: 'learning' }>, request: LetterRequest,
    context: ReflectiveLetterContext, ranges: readonly WorkSourceRef[], delivered: readonly Observation[]): ReflectiveLetterLearningProof {
    const provided = delivered.some(observation => observation.tool === 'read_learning'
      && Array.isArray((observation.result as any)?.items) && (observation.result as any).items.some((item: any) => item?.id === citation.id && item.revision === citation.revision));
    const record = this.repo.work(handle, 'experience', citation.id)[0];
    if (!provided || !context.receipt.learningProcessVersions?.some(ref => ref.id === citation.id && ref.revision === citation.revision)
      || !record || record.revision !== citation.revision || record.data.type !== 'learning_process' || record.status !== 'recorded'
      || !record.sourceBinding || !this.repo.learningProcessReadable(handle, record.id, record.revision))
      throw new HarnessError('letter_learning_not_read', '这段学习经历需要实际读到且仍有效的原过程，不能从课程、成绩、预览或助手答案推断成长。');
    const originals = citation.originals.map(ref => {
      if (!covers(ref, record.sourceBinding!.refs)) throw new HarnessError('letter_learning_source', '所引原话不属于这次真实学习过程。');
      return this.originalProof(handle, ref, request, context, ranges);
    });
    for (const ref of record.sourceBinding.refs) this.currentOriginal(handle, ref, context.permits);
    return { kind: 'learning', id: record.id, revision: record.revision, sourceBinding: record.sourceBinding,
      originals, observation: 'reported_process' };
  }

  validateDraft(handle: ScopeHandle, context: ReflectiveLetterContext, raw: ReflectiveLetterDraftInput) {
    this.scope(handle, true); context.signal?.throwIfAborted();
    const input = reflectiveLetterDraftInput.parse(raw), opportunity = this.opportunity(handle, input.opportunityId, input.expectedRevision);
    const request = requestDataSchema.parse(opportunity.data.reflectiveLetterRequest);
    const currentRequest = this.currentOriginal(handle, request.source, context.permits);
    if (sha(currentRequest.quote) !== request.source.quoteSha256) throw new HarnessError('letter_request_changed', '原回顾请求已改变。');
    const { ranges, delivered } = this.originalReadRanges(handle, context);
    const paragraphs = input.paragraphs.map(paragraph => ({ kind: paragraph.kind, text: paragraph.text,
      sources: paragraph.citations.map(citation => citation.kind === 'original'
        ? this.originalProof(handle, citation, request, context, ranges) : citation.kind === 'material'
          ? this.materialProof(handle, citation, context, delivered) : this.learningProof(handle, citation, request, context, ranges, delivered)) }));
    const refs = [address(request.source), ...paragraphs.flatMap(paragraph => paragraph.sources.flatMap(proof => this.proofRefs(proof)))];
    const unique = [...new Map(refs.map(ref => [canonical(ref), ref])).values()];
    if (unique.length > 32) throw new HarnessError('letter_source_budget', '这封信涉及的独立来源过多，请保留真正重要的片段，不丢掉它们的条件。');
    const binding = this.repo.resolveWorkSourceBinding(handle, unique);
    if (input.coverage.experienceCoverage === 'selected_fragments' && !paragraphs.some(paragraph => paragraph.sources.length))
      throw new HarnessError('letter_coverage', '没有读到经历时不把来信标成已有生活片段。');
    const document: ReflectiveLetterDocument = { version: 1, title: input.title, window: request.window, asOf: request.asOf,
      request: request.source, authorization: request.authorization, paragraphs, sourceBinding: binding,
      coverage: input.coverage, createdAt: this.repo.clock.now(), meaning };
    const validated = reflectiveLetterDocumentSchema.parse(document);
    // Use only host-held observations actually delivered in this run. The
    // request read is enough for an honestly short, non-factual care letter.
    const materialReads = delivered.filter(observation => observation.tool === 'read_evidence'
      || observation.tool === 'read_learning' || observation.tool === 'materials.read'
      || observation.tool === 'look_up' && (observation.requestedArguments as any)?.capability === 'materials.read'
      || (observation.result as any)?.data?.type === 'reflective_letter_request'
        && (observation.result as any)?.data?.opportunityId === opportunity.id);
    const usedEvents = new Set(binding.refs.map(ref => ref.eventId));
    const observations = materialReads.filter(observation => {
      const result = observation.result as any;
      if (result?.data?.type === 'reflective_letter_request') return true;
      if (observation.tool === 'read_evidence') return usedEvents.has(result?.id);
      if (observation.tool === 'read_learning') return paragraphs.some(paragraph => paragraph.sources.some(proof => proof.kind === 'learning'
        && result?.items?.some((item: any) => item.id === proof.id && item.revision === proof.revision)));
      return paragraphs.some(paragraph => paragraph.sources.some(proof => proof.kind === 'material' && result?.data?.source?.resourceId === proof.resourceId));
    });
    return { opportunity, document: validated, artifact: { title: input.title, body: bodyOf(paragraphs) }, observations };
  }

  /** Commit through the original prepare path and annotate that same revision
   * inside one transaction. No second cooperation ledger or presentation ACK. */
  prepare(handle: ScopeHandle, context: ReflectiveLetterContext, raw: ReflectiveLetterDraftInput,
    options: { presentInConversation?: boolean } = {}) {
    return this.repo.write(() => {
      const value = this.validateDraft(handle, context, raw);
      if (value.opportunity.data.reflectiveLetter)
        throw new HarnessError('letter_already_prepared', '这封信已按原请求写好；改写请沿本轮新的本人请求开始，不覆盖那次已提供的帮助。');
      if (!value.observations.length)
        throw new HarnessError('letter_material_not_delivered', '请先把这次请求或相关原文实际交给主助手，再保存来信；没有把未展示的查询当作材料。');
      context.signal?.throwIfAborted();
      const decision = this.attention.decide(handle, { id: value.opportunity.id, expectedRevision: value.opportunity.revision,
        choice: 'prepare', reason: '本人这次请求的私人回顾，保留具体来源与可修正解释。',
        actionDescription: '已写好这封来信，留在本人应用内。', artifact: value.artifact,
        sourceToolCallIds: value.observations.slice(-12).map(observation => observation.toolCallId!),
        presentInConversation: options.presentInConversation !== false,
      }, value.observations);
      if (decision.choice !== 'prepare') return { ...decision, letterPrepared: false };
      const record = this.repo.work(handle, undefined, decision.id)[0];
      if (!record || record.revision !== decision.revision || !record.data.artifact)
        throw new HarnessError('letter_prepare_changed', '原准备结果已改变，没有保存另一份来信。');
      const sources = [...new Set([...(record.data.sourceIds as string[] || []), ...value.document.sourceBinding.sourceIds])];
      const grants = [...new Set([...(record.data.requiredGrants as string[] || []), ...value.document.sourceBinding.requiredGrants])];
      const evidenceIds = [...new Set([...record.evidenceIds, ...value.document.sourceBinding.refs.map(ref => ref.eventId)])];
      const provenance = { request: value.document.request, proofs: value.document.paragraphs.flatMap(paragraph => paragraph.sources) };
      const next: WorkRecord = { ...record, evidenceIds, data: { ...record.data, sourceIds: sources, requiredGrants: grants,
        reflectiveLetter: z.json().parse(value.document), reflectiveLetterPreparedRevision: record.revision,
        reflectiveLetterBinding: z.json().parse(value.document.sourceBinding),
        reflectiveLetterProvenance: z.json().parse(provenance) } };
      // This extends the artifact atomically with its original preparation,
      // without creating a revision the presentation reference never saw.
      this.repo.db.prepare('UPDATE h_work SET payload=? WHERE id=? AND revision=?').run(JSON.stringify(next), next.id, next.revision);
      const consumers = [next.id];
      if (typeof next.data.helpRecordId === 'string') {
        const help = this.repo.work(handle, undefined, next.data.helpRecordId)[0];
        if (!help || help.data.type !== 'cooperation_record') throw new HarnessError('letter_help_missing', '这次来信缺少原帮助记录。');
        const enriched = { ...help, evidenceIds: [...new Set([...help.evidenceIds, ...evidenceIds])], data: { ...help.data,
          sourceIds: sources, requiredGrants: grants, reflectiveLetterBinding: z.json().parse(value.document.sourceBinding),
          reflectiveLetterProvenance: z.json().parse(provenance) } };
        this.repo.db.prepare('UPDATE h_work SET payload=? WHERE id=? AND revision=?').run(JSON.stringify(enriched), help.id, help.revision);
        consumers.push(help.id);
      }
      for (const consumerId of consumers) {
        for (const ref of value.document.sourceBinding.refs) this.repo.addDependency(handle, { consumerId,
          producerId: ref.eventId, producerRevision: ref.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
        for (const proof of value.document.paragraphs.flatMap(paragraph => paragraph.sources)) if (proof.kind === 'learning')
          this.repo.addDependency(handle, { consumerId, producerId: proof.id, producerRevision: proof.revision, sensitivity: 'hard', invalidation: 'block' });
      }
      return { ...decision, letterPrepared: true, letter: this.projectRecord(handle, next),
        usage: this.usage(value.document), meaning };
    });
  }

  private proofRefs(proof: ReflectiveLetterProof): WorkSourceRef[] {
    return proof.kind === 'original' ? [address(proof)] : proof.kind === 'material' ? proof.sourceEnvelopeRefs : proof.sourceBinding.refs;
  }

  private proofCurrent(handle: ScopeHandle, proof: ReflectiveLetterProof, permits?: ReflectiveLetterContext['permits']): boolean {
    if (proof.kind === 'material') return proof.sourceEnvelopeRefs.every(ref => {
      this.currentOriginal(handle, ref, permits); return true;
    }) && this.dependencies.materialCurrent?.(handle, proof) === true;
    if (proof.kind === 'learning') {
      // The repository's metadata gate calls this path before selecting a
      // work body. Do not recurse through repo.work / workSourceFilter.
      const filter = this.repo.filter(handle);
      const current = this.repo.db.prepare(`SELECT json_extract(r.payload,'$.sourceBinding') AS binding FROM h_work r
        WHERE ${filter.sql} AND r.id=? AND r.revision=? AND r.status='recorded' AND r.kind='experience'
        AND json_extract(r.payload,'$.data.type')='learning_process'`).get(...filter.params, proof.id, proof.revision);
      return !!current && typeof current.binding === 'string' && canonical(JSON.parse(current.binding)) === canonical(proof.sourceBinding)
        && this.repo.learningProcessReadable(handle, proof.id, proof.revision)
        && proof.sourceBinding.refs.every(ref => { this.currentOriginal(handle, ref, permits); return true; })
        && proof.originals.every(original => this.proofCurrent(handle, original, permits));
    }
    const { event, quote } = this.currentOriginal(handle, proof, permits);
    return sha(quote) === proof.quoteSha256 && event.sourceId === proof.sourceId
      && canonical(event.sourceContext || null) === canonical(proof.sourceContext || null)
      && event.speaker === proof.speaker && event.authority === proof.authority && event.receivedAt === proof.receivedAt;
  }

  /** Metadata-only gate used by the repository before matching, paging or
   * returning any kept letter / cooperation body. It must never call work(). */
  metadataReadable(handle: ScopeHandle, raw: unknown, permits?: ReflectiveLetterContext['permits']): boolean {
    try {
      this.scope(handle);
      const metadata = reflectiveLetterMetadataSchema.parse(raw);
      if (!this.repo.workBindingsReadable(handle, [metadata.binding])) return false;
      const expected = this.repo.resolveWorkSourceBinding(handle, [...new Map([
        address(metadata.request), ...metadata.proofs.flatMap(proof => this.proofRefs(proof)),
      ].map(ref => [canonical(ref), ref])).values()]);
      if (canonical(expected) !== canonical(metadata.binding)) return false;
      for (const ref of metadata.binding.refs) this.currentOriginal(handle, ref, permits);
      const request = this.currentOriginal(handle, metadata.request, permits);
      return sha(request.quote) === metadata.request.quoteSha256
        && metadata.proofs.every(proof => this.proofCurrent(handle, proof, permits));
    } catch (error) {
      if (error instanceof HarnessError || error instanceof z.ZodError || error instanceof SyntaxError) return false;
      throw error;
    }
  }

  /** The host calls this before materials, history, scenes or exports expose a
   * saved body. A source change with the same contentVersion still fails. */
  recordReadable(handle: ScopeHandle, record: WorkRecord, permits?: ReflectiveLetterContext['permits']): boolean {
    if (!record.data.reflectiveLetter && !record.data.reflectiveLetterBinding) return true;
    try {
      const scope = this.scope(handle);
      if (record.ownerId !== scope.principalId || record.workspaceId !== scope.workspaceId || record.subjectId !== scope.subjectId
        || record.worldId !== scope.worldId || record.label.audience !== 'self') return false;
      const provenance = record.data.reflectiveLetterProvenance as { request?: unknown; proofs?: unknown } | undefined;
      if (!this.metadataReadable(handle, { binding: record.data.reflectiveLetterBinding,
        request: provenance?.request, proofs: provenance?.proofs }, permits)) return false;
      if (!record.data.reflectiveLetter) return true;
      const document = reflectiveLetterDocumentSchema.parse(record.data.reflectiveLetter);
      if (canonical(document.sourceBinding) !== canonical(record.data.reflectiveLetterBinding)) return false;
      const request = this.currentOriginal(handle, document.request, permits);
      return sha(request.quote) === document.request.quoteSha256
        && document.paragraphs.every(paragraph => paragraph.sources.every(proof => this.proofCurrent(handle, proof, permits)));
    } catch (error) {
      if (error instanceof HarnessError || error instanceof z.ZodError) return false;
      throw error;
    }
  }

  projectRecord(handle: ScopeHandle, record: WorkRecord, permits?: ReflectiveLetterContext['permits'], historical = false): ReflectiveLetterView | null {
    this.scope(handle);
    if (record.data.type !== 'help_opportunity' || !historical && !preparedStatuses.includes(record.status) || !this.recordReadable(handle, record, permits)) return null;
    const document = reflectiveLetterDocumentSchema.safeParse(record.data.reflectiveLetter);
    const artifact = record.data.artifact as { title?: unknown; body?: unknown } | null;
    if (!document.success || !historical && (!artifact || artifact.title !== document.data.title || artifact.body !== bodyOf(document.data.paragraphs))) return null;
    const current = this.repo.work(handle, undefined, record.id)[0];
    if (!current || current.revision !== record.revision || canonical(current.data.reflectiveLetter) !== canonical(record.data.reflectiveLetter)
      || !historical && canonical(current.data.artifact) !== canonical(artifact)) return null;
    return { id: record.id, revision: record.revision, kind: 'reflective_letter', title: document.data.title,
      body: bodyOf(document.data.paragraphs), window: document.data.window, asOf: document.data.asOf,
      paragraphs: document.data.paragraphs.map(paragraph => ({ kind: paragraph.kind, text: paragraph.text,
        sources: paragraph.sources.flatMap(proof => this.projectProof(handle, proof)) })),
      coverage: document.data.coverage, generatedAt: document.data.createdAt,
      displayed: 'not_established', readByUser: 'not_established', ...(historical && !preparedStatuses.includes(record.status) ? { historical: true as const } : {}), meaning };
  }

  private projectProof(handle: ScopeHandle, proof: ReflectiveLetterProof): ReflectiveLetterView['paragraphs'][number]['sources'] {
    if (proof.kind === 'learning') return [{ label: '当时的学习过程', read: { tool: 'read_learning',
      arguments: { matterId: String(this.repo.work(handle, 'experience', proof.id)[0]!.data.matterId), id: proof.id } } }];
    if (proof.kind === 'material') return [{ label: '当时读到的资料', read: { tool: 'look_up', arguments: {
      source: 'capability', capability: 'materials.read', arguments: { resourceId: proof.resourceId,
        ...(proof.page === undefined ? {} : { page: proof.page }), offset: proof.start, limit: Math.min(8000, proof.end - proof.start) } } } }];
    return [{ label: proof.sourceContext?.kind === 'relationship_rehearsal' ? '那次试说里的原话' : proof.sourceContext?.kind === 'shared_creation' ? '共同创作时的原话' : proof.speaker === 'user' ? '当时你说的话' : proof.speaker === 'external' ? '当时的资料记录' : '当时的助手表达',
      receivedAt: proof.receivedAt, read: { tool: 'read_evidence', arguments: { id: proof.eventId, offset: proof.start, limit: Math.min(1200, proof.end - proof.start) } } }];
  }

  read(handle: ScopeHandle, raw: z.infer<typeof reflectiveLetterReadInput>, permits?: ReflectiveLetterContext['permits']) {
    this.scope(handle);
    const input = reflectiveLetterReadInput.parse(raw), opportunity = this.retainedLetter(handle, input.opportunityId, input.expectedRevision);
    const letter = this.projectRecord(handle, opportunity, permits, true);
    return letter ? { status: 'fresh' as const, letter, usage: this.usage(reflectiveLetterDocumentSchema.parse(opportunity.data.reflectiveLetter)), meaning }
      : { status: 'unknown' as const, letter: null, reason: '这封来信的依据已改变或还没有真实准备好；没有从旧正文副本恢复。' };
  }

  private retainedLetter(handle: ScopeHandle, id: string, revision?: number) {
    const record = this.repo.work(handle, undefined, id)[0];
    if (!record || record.data.type !== 'help_opportunity' || !record.data.reflectiveLetter)
      throw new HarnessError('letter_unavailable', '这封信现在不能展开。');
    if (revision !== undefined && record.revision !== revision) throw new HarnessError('revision_conflict', '这封信已经变化，请回到现在留下的那一封。');
    return record;
  }

  /** Original immutable document floor, independent of its envelope state. */
  private preparedRevision(id: string, currentRevision: number, raw: unknown, helpRecordId: unknown): number | undefined {
    if (raw !== undefined && raw !== null) return typeof raw === 'number' && Number.isSafeInteger(raw)
      && raw > 0 && raw <= currentRevision ? raw : undefined;
    // Earlier kept letters predate this scalar. Only an actual saved host
    // help reference can establish their original prepared revision.
    if (typeof helpRecordId !== 'string') return;
    const row = this.repo.db.prepare(`SELECT MIN(CAST(json_extract(h.value,'$.revision') AS INTEGER)) AS revision
      FROM messages m,json_each(m.payload,'$.helpRefs') h WHERE m.role='assistant'
      AND json_extract(h.value,'$.id')=? AND json_extract(h.value,'$.helpRecordId')=?
      AND json_type(h.value,'$.revision')='integer'`).get(id, helpRecordId);
    return typeof row?.revision === 'number' && Number.isSafeInteger(row.revision) && row.revision > 0
      && row.revision <= currentRevision ? row.revision : undefined;
  }

  /** Body-free identity for the existing new-input boundary parser. */
  referenceIdentity(handle: ScopeHandle, raw: LetterReference, sessionId: string) {
    this.scope(handle);
    const input = letterReferenceSchema.parse(raw), filter = this.repo.filter(handle);
    // Before the new utterance's source restrictions are understood, expose
    // only that this address belongs to an assistant letter in this thread.
    // Do not resolve its paragraph, proof originals or material bodies here.
    const row = this.repo.db.prepare(`SELECT r.id,r.revision,json_extract(r.payload,'$.data.reflectiveLetterPreparedRevision') AS prepared_revision,
      json_extract(r.payload,'$.data.helpRecordId') AS help_record_id FROM h_work r WHERE ${filter.sql} AND r.id=? AND r.revision>=?
      AND json_extract(r.payload,'$.data.type')='help_opportunity'
      AND json_type(r.payload,'$.data.reflectiveLetter')='object'
      AND json_extract(r.payload,'$.data.sessionId')=?`).get(...filter.params, input.opportunityId, input.revision, sessionId);
    const prepared = row && this.preparedRevision(String(row.id), Number(row.revision), row.prepared_revision, row.help_record_id);
    if (!row || prepared === undefined || input.revision < prepared)
      throw new HarnessError('letter_reference_missing', '那句旧信不在当前对话的这一处。');
    return { origin: 'assistant_letter' as const };
  }

  /** A selected sentence is assistant-authored text, not the user's agreement
   * or a fresh personal fact. Only this exact kept paragraph is expanded. */
  resolveReference(handle: ScopeHandle, raw: LetterReference, context?: {
    sessionId: string; allowCrossSession: boolean; permits?: ReflectiveLetterContext['permits'];
  }) {
    this.scope(handle);
    const input = letterReferenceSchema.parse(raw), record = this.retainedLetter(handle, input.opportunityId);
    const prepared = this.preparedRevision(record.id, record.revision, record.data.reflectiveLetterPreparedRevision, record.data.helpRecordId);
    if (prepared === undefined || input.revision < prepared || input.revision > record.revision)
      throw new HarnessError('letter_reference_changed', '选中那句话时的信件版本已不属于原来这一封。');
    if (context && !context.allowCrossSession && record.data.sessionId !== context.sessionId)
      throw new HarnessError('letter_reference_scope', '这封信还不在本轮允许展开的前情里。');
    if (!this.recordReadable(handle, record, context?.permits)) throw new HarnessError('letter_reference_changed', '这句来信的一处来由已改变，先接回当前允许的话。');
    const document = reflectiveLetterDocumentSchema.parse(record.data.reflectiveLetter), paragraph = document.paragraphs[input.paragraphIndex];
    if (!paragraph || input.end > Array.from(paragraph.text).length || input.end - input.start > 1200)
      throw new HarnessError('letter_reference_range', '选中的位置已经不在这封信的这一句里。');
    const text = codePointSlice(paragraph.text, input.start, input.end);
    if (!text.trim()) throw new HarnessError('letter_reference_range', '先选中想接着说的一句话。');
    return { text, origin: 'assistant_letter' as const, label: '这封信的这一句', reference: input, paragraphKind: paragraph.kind,
      ...(input.revision === record.revision ? { read: { tool: 'read_reflective_letter' as const, arguments: {
        operation: 'read' as const, opportunityId: record.id, expectedRevision: input.revision,
      } } } : {}),
      ...this.usage(document),
      meaning: '只是本人指着助手当时写下的这句继续说；选择不表示同意，不将来信解释升级为本人事实或新的行动授权。' };
  }

  /** A native, private footnote opens only a source already adopted by this
   * exact letter. The renderer cannot choose a path, tool, new source or range. */
  async source(handle: ScopeHandle, raw: ReflectiveLetterSourceInput, signal: AbortSignal): Promise<ReflectiveLetterSourceView> {
    this.scope(handle); signal.throwIfAborted();
    const input = reflectiveLetterSourceInput.parse(raw), record = this.retainedLetter(handle, input.opportunityId, input.expectedRevision);
    if (!this.projectRecord(handle, record, undefined, true)) throw new HarnessError('letter_source_changed', '这封信的来由有了变化，先回到现在的那一页。');
    const document = reflectiveLetterDocumentSchema.parse(record.data.reflectiveLetter);
    const proof = document.paragraphs[input.paragraphIndex]?.sources[input.sourceIndex];
    if (!proof) throw new HarnessError('letter_source_missing', '这处原话入口已经变化。');
    if (!this.proofCurrent(handle, proof)) throw new HarnessError('letter_source_changed', '那时的资料现在不能继续展开。');
    let value: ReflectiveLetterSourceView;
    if (proof.kind === 'material') {
      if (!this.dependencies.readMaterial) throw new HarnessError('letter_material_unavailable', '这份原资料暂时不能展开。');
      const result = await this.dependencies.readMaterial(handle, proof, signal) as { status?: string; data?: { text?: string; page?: number;
        source?: { resourceId?: string; sha256?: string; version?: number }; coverage?: { start?: number; end?: number } } };
      signal.throwIfAborted(); this.scope(handle);
      if (!['fresh', 'partial'].includes(String(result?.status)) || typeof result.data?.text !== 'string'
        || result.data.source?.resourceId !== proof.resourceId || result.data.source.sha256 !== proof.sha256
        || result.data.source.version !== proof.version || result.data.page !== proof.page
        || result.data.coverage?.start !== proof.start || result.data.coverage?.end !== proof.end
        || sha(result.data.text) !== proof.quoteSha256)
        throw new HarnessError('letter_material_changed', '原资料与写信时不同了，这次没有沿旧摘录补回。');
      value = { heading: proof.page === undefined ? '那份资料里的话' : `那份资料 · 第${proof.page}页`,
        excerpts: [{ label: '当时读到的片段', text: result.data.text }] };
    } else {
      const originals = proof.kind === 'learning' ? proof.originals : [proof];
      value = { heading: proof.kind === 'learning' ? '那次学习的原话' : proof.sourceContext?.kind === 'relationship_rehearsal' ? '那次试说里的原话' : proof.sourceContext?.kind === 'shared_creation' ? '共同创作时的原话' : proof.speaker === 'user' ? '那时你说的话' : '当时的资料',
        excerpts: originals.map(original => {
          const current = this.currentOriginal(handle, original);
          if (sha(current.quote) !== original.quoteSha256) throw new HarnessError('letter_source_changed', '原话与写信时不同了。');
          return { label: original.sourceContext?.kind === 'relationship_rehearsal' ? '试说或改表达时写下的' : original.sourceContext?.kind === 'shared_creation' ? '共同创作时写下的' : original.speaker === 'user' ? '你当时说' : original.speaker === 'assistant' ? '当时的助手表达' : '当时的记录',
            text: current.quote, receivedAt: original.receivedAt };
        }) };
    }
    signal.throwIfAborted();
    const current = this.retainedLetter(handle, input.opportunityId, input.expectedRevision);
    if (!this.recordReadable(handle, current) || canonical(current.data.reflectiveLetter) !== canonical(record.data.reflectiveLetter))
      throw new HarnessError('letter_source_changed', '翻回原话时，这封信的来由发生了变化。');
    return value;
  }

  usage(document: ReflectiveLetterDocument) {
    const proofs = document.paragraphs.flatMap(paragraph => paragraph.sources);
    return { workSourceBindings: [document.sourceBinding], learningProcessVersions: proofs.flatMap(proof =>
      proof.kind === 'learning' ? [{ id: proof.id, revision: proof.revision }] : []),
      reflectiveLetterSources: [{ binding: document.sourceBinding, request: document.request, proofs }],
      materialReads: proofs.flatMap(proof => proof.kind === 'material' ? [{ capability: 'materials.read', resourceId: proof.resourceId,
        sha256: proof.sha256, version: proof.version, sourceEventId: proof.sourceEventId, parentEventId: proof.parentEventId,
        ...(proof.page === undefined ? {} : { page: proof.page }), start: proof.start, end: proof.end, complete: false }] : []) };
  }
}
