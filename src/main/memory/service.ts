import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Assertion, AssertionCitation, EvidenceEvent, MemoryChange, MemoryReferenceContext, MemoryView, ScopeHandle } from '../../shared/harness';
import { always, assertionSchema, changeSchema, HarnessError, personalLabel, workSourceBindingSchema } from '../../shared/harness';
import type { KernelRepository, MemoryContextDirectoryPosition, MemoryContextScope, PrivacyFence, ReviewedSourceRestriction } from '../storage/repository';
import type { IngressDecision, PolicyKernel } from '../runtime/policy';
import { canonical, codePointSlice, locateQuote } from '../runtime/semantics';
import { hasCredentials } from '../runtime/redaction';
import { ProviderError } from '../provider';
import type { PersonalMethodOwnership, PersonalMethodService } from '../runtime/personal-methods';
import { personalMethodInput } from '../runtime/personal-methods';
import { activeContextRequests, advanceMemoryContextDirectory, buildMemoryContext, canonicalContextRequests, containsContextRange, contextBrowseSchema, contextRequestSchema, contextRequestSignature, memoryContextAttemptSignature, memoryContextIdentity,
  validateMemoryContextSnapshot, MEMORY_CONTEXT_METHOD, type ContextBrowseDirection, type ContextRequest, type ContextRequestResult, type MemorySourceDirectory, type MemorySourceWindow } from './context-windows';

export interface SemanticReview {
  supported: boolean;
  preservesSubject: boolean;
  preservesWorld: boolean;
  preservesTime: boolean;
  preservesConditions: boolean;
  reason: string;
  retention?: 'allowed' | 'restricted' | 'unknown';
  temporalType?: 'stable' | 'temporary' | 'future' | 'unknown';
  derivation?: 'retain_new' | 'maintain_existing' | 'original_only' | 'needs_context';
  futureUse?: string | null;
  useScope?: string | null;
  preservesUseScope?: boolean;
  allSourcesSupportClaim?: boolean;
  supportSetComplete?: boolean;
  sourceReviews?: { eventId: string; contentVersion: number; start: number; end: number; supported: boolean }[];
  /** A whole candidate belongs to this already accepted procedural choice,
   * rather than an independent fact about the person. */
  personalMethodOwner?: string | null;
  /** Required only for a host-bound current owner projection; never a global grant. */
  authorizesOwnerProjection?: boolean;
  preservesReferenceContext?: boolean;
  referenceReviews?: { messageId: string; start: number; end: number; contentSha256: string; supported: boolean }[];
}
export interface MemoryChangeReceipt {
  operation?: MemoryChange['operation']; requestedOperation?: MemoryChange['operation']; outcome: 'new_revision' | 'existing_receipt';
  current: { id: string; revision: number; status: Assertion['status']; verification: Assertion['verification'] };
  source?: NonNullable<ReturnType<KernelRepository['citationMetadata']>>;
  previous?: { id: string; revision: number; kind: Assertion['kind']; status: Assertion['status']; verification: Assertion['verification'];
    sources: NonNullable<ReturnType<KernelRepository['citationMetadata']>>[];
    sourceCoverage: 'complete' | 'incomplete' };
  interpretationOfPastAccuracy: 'not_established_by_revision';
  meaning: string;
}
export interface PersonalMethodReconciliationReview {
  sameProceduralMethod: boolean; allVersionsOnlyMethod: boolean; conditionChangePreservesOtherSteps: boolean;
  independentPersonalFacts: boolean; reason: string;
}
export const currentOwnerChangeSchema = changeSchema.omit({ targetId: true, expectedRevision: true, unresolvedTime: true,
  supports: true, referenceContexts: true, sourceStartCodePoint: true, sourceEndCodePoint: true }).extend({
  operation: z.literal('ADD'), subject: z.literal('self'), world: z.literal('source_world'),
  kind: z.enum(['explicit_fact', 'explicit_preference', 'current_state']), sourceQuote: z.string().min(1).max(4000),
  sourceContentVersion: z.number().int().positive(), recordingQuote: z.string().min(1).max(2000),
}).strict();
export type CurrentOwnerChange = z.infer<typeof currentOwnerChangeSchema>;
/**
 * Bounded shared context for asynchronous semantic workers.
 *
 * This is intentionally a small, source-backed projection rather than a
 * second memory store.  Callers may provide assistant turns/frames that are
 * not durable evidence; the service still validates the scope before adding
 * repository-derived context and never writes this projection to memory.
 */
export interface MemoryContext {
  /** Exact accepted method-choice receipts; addresses only, not another copy
   * of the method or a claim about the person's preferences. */
  personalMethodOwners?: PersonalMethodOwnership[];
  methodVersion?: string;
  sourceSignature?: string;
  sourceDirectory?: MemorySourceDirectory[];
  sourceWindows?: MemorySourceWindow[];
  contextRequestResults?: ContextRequestResult[];
  contextPreviewByteTarget?: number;
  contextBytes?: number;
  /** Host-only progress address; omitted from the model request. */
  contextDirectoryPosition?: MemoryContextDirectoryPosition;
  sourceScanCoverage?: { bounded: true; beforeComplete: boolean; laterComplete: boolean; maxScannedPerDirection: number; meaning: string;
    continuations?: { direction: ContextBrowseDirection; request: { contextBrowse: ContextBrowseDirection[] } }[] };
  referenceCoverage?: { id: string; textLength: number; contentSha256?: string; provided: boolean; requestable: false;
    replyState?: MemoryReferenceContext['replyState'] }[];
  /** Host-resolved support, never inferred from arbitrary context or accepted from a caller. */
  hostSupportSet?: {
    citations: { eventId: string; contentVersion: number; quote: string; start: number; end: number; role: AssertionCitation['role'] }[];
    sources: EvidenceEvent[];
    complete: boolean;
  };
  /** Host-verified wording which resolves a user's reply; never personal evidence. */
  hostReferenceContexts?: { reference: MemoryReferenceContext; text: string }[];
  /** Host-only plan for the same review; raw mixed source remains non-inferable. */
  currentOwnerProjection?: {
    parentEventId: string; parentContentVersion: number; parentSubject: 'mixed' | 'contextual'; parentWorld: 'real'; proposedEvidenceId: string;
    statement: { quote: string; start: number; end: number };
    recordingRequest: { quote: string; start: number; end: number };
  };
  /** Host-resolved exact target only, never caller/model asserted ownership. */
  existingAssertion?: {
    id: string; revision: number; subjectId: string; worldId: string; predicate: string;
    kind: Assertion['kind']; strength: Assertion['strength']; status: Assertion['status']; text: string;
    conditions: Assertion['conditions']; temporal: Assertion['temporal'];
    sourceQuotes: { eventId: string; contentVersion: number; quote: string; start: number; end: number;
      speaker?: EvidenceEvent['speaker']; authority?: EvidenceEvent['authority']; receivedAt?: string; sequence?: number }[];
    sourceCoverage?: 'complete' | 'incomplete';
    referenceContexts?: { reference: MemoryReferenceContext; text: string }[];
  };
  /** Host's actual immediate retirement; validity describes the old content. */
  proposedRetirement?: {
    targetId: string; targetRevision: number; status: 'expired'; timing: 'immediate';
    temporal: Assertion['temporal']; preservesPlannedInterval: boolean;
  };
  priorEvents?: Array<{
    id: string;
    speaker: 'user' | 'assistant' | 'external';
    text: string;
    subjectId?: string;
    worldId?: string;
    authority?: string;
    replyState?: MemoryReferenceContext['replyState'];
    sourceContext?: EvidenceEvent['sourceContext'];
    receivedAt?: string;
    textLength?: number;
    coverage?: 'complete' | 'excerpt';
    contentVersion?: number;
    sequence?: number;
    rangeStart?: number;
    rangeEnd?: number;
    relation?: 'current' | 'before' | 'later_clarification';
  }>;
  anchors?: Array<{
    id: string;
    revision?: number;
    kind: 'assertion' | 'work' | 'entity' | 'frame';
    text: string;
    predicate?: string;
    conditions?: unknown;
    status?: string;
  }>;
  conditions?: Array<{ id: string; text: string; sourceId?: string }>;
  current?: {
    eventId: string;
    sourceContext?: EvidenceEvent['sourceContext'];
    focusText: string;
    sourceExcerpt: string;
    tailText?: string;
    tailStart?: number;
    textLength?: number;
    contentVersion?: number;
    sequence?: number;
    focusRange?: { start: number; end: number };
    sourceExcerptStart?: number;
    sourceExcerptEnd?: number;
  };
}
export interface ExtractionSpan {
  id: string;
  start: number;
  end: number;
  text: string;
  textStart?: number;
  textEnd?: number;
  context?: MemoryContext;
}
export type MemoryReviewer = (
  proposal: MemoryChange,
  evidence: EvidenceEvent,
  signal: AbortSignal,
  context?: MemoryContext,
) => Promise<SemanticReview>;
export interface ExtractionResult {
  changes: MemoryChange[];
  status: 'candidate_emitted' | 'no_personal_fact' | 'needs_context' | 'quote_or_hypothesis';
  /** At most one structured-output repair may be attempted by a model adapter. */
  formatRepair?: 'none' | 'recovered';
  contextRequests?: ContextRequest[];
  contextBrowse?: ContextBrowseDirection[];
}
export type Extractor = (
  event: EvidenceEvent,
  span: ExtractionSpan,
  signal: AbortSignal,
) => Promise<ExtractionResult>;

export class MemoryService {
  readonly rejected: { eventId: string; code: string }[] = [];
  readonly staleCommits: { eventId: string; epoch: number }[] = [];
  /** Non-sensitive extraction protocol diagnostics; source/model payloads are never retained. */
  readonly extractionDiagnostics: {
    eventId: string;
    spanId: string;
    status: 'format_repaired' | 'failed';
    attempts: number;
  }[] = [];
  reviewer?: MemoryReviewer;
  extractor?: Extractor;
  personalMethodOwner?: Pick<PersonalMethodService, 'ownership' | 'recoverSavedOwnership'>;
  methodReconciliationReviewer?: (proposal: unknown, signal: AbortSignal) => Promise<PersonalMethodReconciliationReview>;
  paused = false;
  constructor(
    readonly repo: KernelRepository,
    readonly policy: PolicyKernel,
  ) {}

  /** Repair only the fully attributable old duplication of one saved method
   * and one condition amendment. This is a present repair, never retroactive
   * approval of the amendment or a general source-unblocking operation. */
  async reconcilePersonalMethod(handle: ScopeHandle, input: { legacySave: unknown; methodId: string; expectedMethodRevision: number;
    assertionId: string; expectedAssertionRevision: number }, signal: AbortSignal = new AbortController().signal) {
    const legacy = personalMethodInput.parse(input.legacySave);
    if (legacy.operation !== 'save' || !this.personalMethodOwner || !this.methodReconciliationReviewer)
      throw new HarnessError('method_reconciliation_unavailable', '当时的完整来由还没能核清，先保留原来的记录。');
    const owners = this.personalMethodOwner.recoverSavedOwnership(handle, legacy);
    const owner = owners.find(item => item.methodId === input.methodId && item.legacyOperationId);
    if (!owner) throw new HarnessError('method_reconciliation_proof', '这份方法没有对应到原先那次真实保存。');
    const inspect = () => {
      const scope = this.policy.require(handle, 'memory:write'); this.policy.require(handle, 'work:write');
      if (!scope.infer || scope.child || scope.audience !== 'self' || scope.subjectId !== scope.principalId
        || scope.worldId !== 'real' || scope.retention !== 'purpose_scoped')
        throw new HarnessError('method_reconciliation_scope', '现在还不能整理这份本人的帮法，原记录先留着。');
      const currentOwner = this.personalMethodOwner!.ownership(handle, [owner.source]).find(value => value.receiptId === owner.receiptId);
      if (!currentOwner || this.repo.hasFence(input.methodId.slice('personal:'.length), 'work:self'))
        throw new HarnessError('method_reconciliation_proof', '那份方法已经放下了，没有重新打开旧内容。');
      const filter = this.repo.filter(handle), row = this.repo.db.prepare(`SELECT r.payload FROM h_work r WHERE ${filter.sql}
        AND r.id=? AND r.kind='recipe_candidate' AND json_extract(r.payload,'$.data.type')='personal_method'`)
        .get(...filter.params, input.methodId.slice('personal:'.length));
      if (!currentOwner || !row || this.repo.hasFence(input.methodId.slice('personal:'.length), 'work:self'))
        throw new HarnessError('method_reconciliation_proof', '原方法或它的来由已经放下了，没有重新打开。');
      const method = JSON.parse(String(row.payload)) as import('../../shared/harness').WorkRecord;
      const parsed = personalMethodInput.parse({ operation: 'save', method: method.data.method, source: legacy.source });
      if (parsed.operation !== 'save' || method.status !== 'active' || method.revision !== input.expectedMethodRevision
        || method.revision !== owner.methodRevision + 1 || this.repo.verifyPersonalMethodSources?.(handle, method.data.methodSources) !== true)
        throw new HarnessError('method_reconciliation_changed', '现在的方法和这次要核对的那一版不同，先保留现状。');
      const { conditions: oldConditions, ...oldSteps } = legacy.method;
      const { conditions: newConditions, ...newSteps } = parsed.method;
      if (canonical(oldSteps) !== canonical(newSteps) || canonical(oldConditions) === canonical(newConditions))
        throw new HarnessError('method_reconciliation_scope', '这次还不只是适用条件的误会，原步骤需要另行看清。');
      const binding = workSourceBindingSchema.parse(method.sourceBinding);
      const initialRefs = [owner.source, ...legacy.supports.map(({ quote: _quote, ...ref }) => ref),
        ...legacy.assistance.flatMap(source => {
          const original = this.repo.personalMethodAssistantSource(handle, source);
          if (!original) throw new HarnessError('method_reconciliation_source', '当时真正给过的帮助现在翻不到了。');
          return original.sourceRefs;
        })];
      const initial = [...new Map(initialRefs.map(ref => [canonical(ref), ref])).values()];
      const newRefs = binding.refs.filter(ref => !initial.some(prior => canonical(prior) === canonical(ref)));
      if (newRefs.length !== 1 || initial.some(ref => !binding.refs.some(current => canonical(current) === canonical(ref))))
        throw new HarnessError('method_reconciliation_source', '这份方法还牵着其他来由，没有只按一次条件修改来修复。');
      const amendment = newRefs[0];
      const source = this.repo.evidence(handle, amendment.eventId);
      if (!source || !['active', 'redacted'].includes(source.status) || source.speaker !== 'user' || source.authority !== 'user_statement'
        || source.parentEventId || source.contentVersion !== amendment.contentVersion)
        throw new HarnessError('method_reconciliation_source', '当时改条件的那句话现在不完整，先保留原记录。');
      for (const ref of binding.refs) if (!this.repo.citationMetadata(handle, { ...ref, role: 'support' }))
        throw new HarnessError('method_reconciliation_source', '一处原话已经撤回或变化，没有重开旧内容。');
      const current = this.repo.assertion(handle, input.assertionId);
      if (!current || current.revision !== input.expectedAssertionRevision || current.revision !== 2 || current.status !== 'active')
        throw new HarnessError('method_reconciliation_changed', '那份重复的理解已有变化，先保留现在的记录。');
      const versions = this.repo.db.prepare('SELECT revision,payload FROM h_assertion_versions WHERE id=? ORDER BY revision')
        .all(current.id).map(version => assertionSchema.parse(JSON.parse(String(version.payload))));
      const citations = this.repo.db.prepare(`SELECT assertion_revision,event_id,content_version,start_cp,end_cp,role
        FROM h_assertion_citations WHERE assertion_id=? ORDER BY assertion_revision,event_id,start_cp,end_cp`).all(current.id);
      if (versions.length !== 2 || versions.some((version, index) => version.revision !== index + 1 || version.status !== 'active'
        || version.ownerId !== scope.principalId || version.workspaceId !== scope.workspaceId || version.subjectId !== scope.principalId
        || version.worldId !== 'real' || version.predicate !== current.predicate || version.referenceContexts?.length)
        || citations.length !== 2 || citations.some((citation, index) => Number(citation.assertion_revision) !== index + 1
          || citation.role !== 'primary' || Number(citation.content_version) !== (index ? amendment.contentVersion : owner.source.contentVersion)
          || citation.event_id !== (index ? amendment.eventId : owner.source.eventId)
          || !Number.isSafeInteger(citation.start_cp) || !Number.isSafeInteger(citation.end_cp)
          || Number(citation.start_cp) < (index ? amendment.start : owner.source.start)
          || Number(citation.end_cp) > (index ? amendment.end : owner.source.end)
          || Number(citation.end_cp) <= Number(citation.start_cp)))
        throw new HarnessError('method_reconciliation_proof', '旧理解还混着其他事实或来由，不能把它当成同一份帮法移开。');
      const oldCitation = citations[0], newCitation = citations[1];
      const log = this.repo.db.prepare('SELECT * FROM h_assertion_revision_log WHERE assertion_id=? ORDER BY revision').all(current.id);
      const originalLog = log.find(item => Number(item.revision) === 1);
      const correction = log.find(item => Number(item.revision) === 2);
      if (log.length !== 2 || !originalLog || originalLog.operation !== 'ADD' || originalLog.previous_revision !== null
        || originalLog.cause_event_id !== owner.source.eventId || Number(originalLog.cause_version) !== owner.source.contentVersion
        || Number(originalLog.cause_start) !== Number(oldCitation.start_cp) || Number(originalLog.cause_end) !== Number(oldCitation.end_cp)
        || !correction || correction.operation !== 'CORRECT' || Number(correction.previous_revision) !== 1
        || correction.cause_event_id !== amendment.eventId || Number(correction.cause_version) !== amendment.contentVersion
        || Number(correction.cause_start) !== Number(newCitation.start_cp) || Number(correction.cause_end) !== Number(newCitation.end_cp))
        throw new HarnessError('method_reconciliation_proof', '旧更正的办理过程没有完全对上，先不改变它的限制。');
      const restriction = this.repo.db.prepare('SELECT * FROM h_source_restrictions WHERE event_id=? AND predicate=?')
        .get(owner.source.eventId, current.predicate);
      const spans = this.repo.db.prepare('SELECT * FROM h_source_restriction_spans WHERE event_id=? AND predicate=?')
        .all(owner.source.eventId, current.predicate);
      if (!restriction || restriction.operation !== 'CORRECT' || restriction.replacement_event_id !== amendment.eventId
        || spans.length !== 1 || Number(spans[0].content_version) !== owner.source.contentVersion
        || Number(spans[0].start_cp) !== Number(oldCitation.start_cp) || Number(spans[0].end_cp) !== Number(oldCitation.end_cp)
        || spans[0].effective_from !== versions[1].temporal.recordedFrom
        || !(Date.parse(String(correction.committed_at)) >= Date.parse(versions[1].temporal.recordedFrom)))
        throw new HarnessError('method_reconciliation_proof', '那条限制还不能精确归到这次重复更正，没有移开它。');
      const competing = this.repo.db.prepare(`SELECT 1 FROM h_assertion_citations c JOIN h_assertion_versions v
        ON v.id=c.assertion_id AND v.revision=c.assertion_revision WHERE c.event_id=? AND c.assertion_id!=?
        AND json_extract(v.payload,'$.predicate')=? LIMIT 1`).get(owner.source.eventId, current.id, current.predicate);
      if (competing) throw new HarnessError('method_reconciliation_proof', '同一处限制还关乎另一项理解，先保留各自的来由。');
      for (const ref of binding.refs) for (const stopped of this.repo.sourceRestrictions(handle, ref.eventId)) {
        if (stopped.ranges.length && !stopped.ranges.some(range => range.contentVersion === ref.contentVersion
          && range.start < ref.end && range.end > ref.start)) continue;
        if (ref.eventId !== owner.source.eventId || stopped.predicate !== current.predicate || stopped.operation !== 'CORRECT'
          || stopped.replacementEventId !== amendment.eventId || stopped.rangeUnknown)
          throw new HarnessError('method_reconciliation_source', '这份方法另有真实的停止或更正，原限制会留下。');
      }
      return { owner: currentOwner, method: { id: method.id, revision: method.revision, binding, old: legacy.method, current: parsed.method },
        amendment: { ...amendment, quote: codePointSlice(source.text, amendment.start, amendment.end) }, current, versions, citations,
        restriction, spans, log };
    };
    const snapshot = inspect(), digest = createHash('sha256').update(canonical(snapshot)).digest('hex');
    const review = await this.methodReconciliationReviewer(snapshot, signal);
    signal.throwIfAborted();
    if (!review.sameProceduralMethod || !review.allVersionsOnlyMethod || !review.conditionChangePreservesOtherSteps || review.independentPersonalFacts)
      throw new HarnessError('method_reconciliation_unknown', '这些内容还不能只归作同一份帮法，原来的记录都先留下。');
    try { return this.repo.write(() => {
      const fresh = inspect();
      if (createHash('sha256').update(canonical(fresh)).digest('hex') !== digest)
        throw new HarnessError('method_reconciliation_changed', '核对期间原记录刚有变化，没有沿旧内容修复。');
      const now = this.repo.clock.now(), predicate = fresh.current.predicate;
      this.repo.db.prepare('DELETE FROM h_source_restriction_spans WHERE event_id=? AND predicate=?').run(owner.source.eventId, predicate);
      this.repo.db.prepare(`DELETE FROM h_source_restrictions WHERE event_id=? AND predicate=? AND operation='CORRECT'
        AND replacement_event_id=?`).run(owner.source.eventId, predicate, fresh.amendment.eventId);
      const retired: Assertion = { ...fresh.current, revision: fresh.current.revision + 1, status: 'retracted',
        temporal: { ...fresh.current.temporal, recordedFrom: now, recordedTo: now } };
      const locators = [{ eventId: fresh.amendment.eventId, contentVersion: fresh.amendment.contentVersion,
        start: Number(fresh.citations[1].start_cp), end: Number(fresh.citations[1].end_cp), role: 'primary' as const }];
      this.repo.saveAssertion(handle, retired, fresh.current.revision, locators);
      this.repo.noteAssertionRevision(handle, { id: retired.id, revision: retired.revision }, { operation: 'personal_method_owner_reconcile',
        causeEventId: fresh.amendment.eventId, causeContentVersion: fresh.amendment.contentVersion,
        causeStart: fresh.amendment.start, causeEnd: fresh.amendment.end });
      this.repo.refreshSourceConstraints();
      if (!this.repo.workBindingsReadable(handle, [fresh.method.binding]) || this.repo.hasFence(fresh.method.id, 'work:self')
        || !this.personalMethodOwner!.ownership(handle, [owner.source]).some(value => value.receiptId === owner.receiptId))
        throw new HarnessError('method_reconciliation_source', '修复后仍有一处来由不能使用，已保留原状。');
      const receiptId = 'method-owner-reconcile:' + createHash('sha256').update(canonical({ digest, now })).digest('hex');
      this.repo.completeOperation(receiptId, 'personal_method_reconciliation', { at: now, methodId: input.methodId,
        methodRevision: fresh.method.revision, assertionId: retired.id, previousAssertionRevision: fresh.current.revision,
        assertionRevision: retired.revision, legacyOperationId: owner.legacyOperationId, ownerReceiptId: owner.receiptId,
        source: owner.source, amendment: { eventId: fresh.amendment.eventId, contentVersion: fresh.amendment.contentVersion,
          start: fresh.amendment.start, end: fresh.amendment.end }, removedCorrection: { predicate, snapshotDigest: digest },
        review: { sameProceduralMethod: review.sameProceduralMethod, allVersionsOnlyMethod: review.allVersionsOnlyMethod,
          conditionChangePreservesOtherSteps: review.conditionChangePreservesOtherSteps, independentPersonalFacts: review.independentPersonalFacts,
          digest: createHash('sha256').update(canonical(review)).digest('hex') }, restoresPastApproval: false });
      this.repo.invalidate(retired.id, 'personal_method_owner_reconciled');
      this.repo.outbox('work_changed', fresh.method.id);
      return { repaired: true, receiptId, methodId: input.methodId, methodRevision: fresh.method.revision,
        duplicateAssertion: { id: retired.id, revision: retired.revision, status: retired.status }, restoresPastApproval: false };
    }); } catch (error) {
      // Source constraint refresh also updates repository-local bookkeeping.
      // Rebuild it only after write() has rolled back a failed reconciliation.
      this.repo.refreshSourceConstraints();
      throw error;
    }
  }
  private clip(value: string, max = 600) {
    const text = value.trim();
    if (Array.from(text).length <= max) return text;
    return codePointSlice(text, 0, max) + '…';
  }
  /** Resource exhaustion is deferred work, never a verdict on the source. */
  private retryableInterruption(error: unknown) {
    return error instanceof HarnessError && error.code === 'memory_budget'
      || error instanceof ProviderError && error.retryable
      || error instanceof Error && error.name === 'TimeoutError';
  }
  private contextTerms(value: string) {
    const normalized = value.normalize('NFKC').toLowerCase(),
      terms = new Set<string>();
    for (const token of normalized.match(/[a-z0-9_]+|[\u4e00-\u9fff]+/g) || []) {
      if (/^[a-z0-9_]+$/.test(token)) {
        if (token.length > 1) terms.add(token);
        continue;
      }
      const points = Array.from(token);
      for (let i = 0; i < points.length - 1; i++) terms.add(points[i] + points[i + 1]);
    }
    return terms;
  }
  private relatedScore(query: Set<string>, value: string) {
    let score = 0;
    for (const term of this.contextTerms(value)) if (query.has(term)) score++;
    return score;
  }
  /** Build a bounded worker view while the caller's ScopeHandle is still live. */
  private workerContext(handle: ScopeHandle, event: EvidenceEvent, supplied?: MemoryContext): MemoryContext {
    const query = this.contextTerms(this.clip(event.text, 6000));
    const assertions = this.repo.personalMemoryReadable(handle) ? this.repo
      .lexicalAssertions(handle, this.clip(event.text, 6000), 12)
      .filter((assertion) => assertion.status === 'active')
      .slice(0, 8) : [];
    const assertionAnchors = assertions.map((assertion) => ({
      id: assertion.id,
      revision: assertion.revision,
      kind: 'assertion' as const,
      predicate: assertion.predicate,
      text: this.clip(assertion.text, 260),
      conditions: assertion.conditions,
      status: assertion.status,
    }));
    const workAnchors = this.repo
      .work(handle)
      .filter((record) => !['cancelled', 'closed'].includes(record.status))
      .map((record) => ({ record, score: this.relatedScore(query, record.title) }))
      .filter(({ record, score }) => score > 0 || (record.data as any)?.sessionId === event.sessionId)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ record }) => ({
        id: record.id,
        kind: 'work' as const,
        text: this.clip(record.title, 260),
        status: record.status,
      }));
    const anchors = [
      ...(supplied?.anchors || []).filter(anchor => anchor.kind !== 'assertion' || this.repo.personalMemoryReadable(handle))
        .slice(0, 8).map((anchor) => ({ ...anchor, text: this.clip(anchor.text, 260) })),
      ...assertionAnchors,
      ...workAnchors,
    ].filter((anchor, index, all) => all.findIndex((item) => item.id === anchor.id) === index).slice(0, 12);
    const conditions = [
      ...(supplied?.conditions || []).slice(0, 8).map((condition) => ({
        ...condition,
        text: this.clip(condition.text, 220),
      })),
      ...assertions
        .filter((assertion) => canonical(assertion.conditions) !== canonical(always))
        .map((assertion) => ({
          id: assertion.id,
          sourceId: assertion.id,
          text: this.clip(canonical(assertion.conditions), 220),
        })),
    ].filter((condition, index, all) => all.findIndex((item) => item.id === condition.id) === index).slice(0, 12);
    return {
      anchors,
      conditions,
      personalMethodOwners: this.personalMethodOwner?.ownership(handle, [{ eventId: event.id,
        contentVersion: event.contentVersion, start: 0, end: Array.from(event.text).length }]) || [],
    };
  }
  private contextScope(handle: ScopeHandle, eventId: string, binding?: MemoryContextScope) {
    if (!binding) return handle;
    const current = this.policy.validate(handle);
    if (!Array.isArray(binding.sources) || !Array.isArray(binding.currentEventIds) || !Array.isArray(binding.purposes) || !Array.isArray(binding.grants))
      return this.policy.narrow(handle, { sources: [], currentEventIds: current.currentEventIds.includes(eventId) ? [eventId] : [], grants: current.grants.filter(grant => ['evidence:read', 'memory:write'].includes(grant)) });
    if (binding.principalId !== current.principalId || binding.workspaceId !== current.workspaceId || binding.subjectId !== current.subjectId
      || binding.worldId !== current.worldId || binding.audience !== current.audience || binding.retention !== current.retention)
      throw new HarnessError('memory_context_scope', '原整理范围与当前资料归属不一致，旧前情没有恢复。');
    return this.policy.narrow(handle, { sources: current.sources.filter(source => binding.sources.includes(source)),
      currentEventIds: current.currentEventIds.filter(id => binding.currentEventIds.includes(id)),
      purposes: current.purposes.filter(purpose => binding.purposes.includes(purpose)),
      grants: current.grants.filter(grant => binding.grants.includes(grant)), infer: current.infer && binding.infer });
  }
  private contextBinding(handle: ScopeHandle): MemoryContextScope {
    const scope = this.policy.validate(handle);
    const { principalId, workspaceId, subjectId, worldId, audience, retention, infer, sources, currentEventIds, purposes, grants } = scope;
    return { principalId, workspaceId, subjectId, worldId, audience, retention, infer,
      sources: [...sources], currentEventIds: [...currentEventIds], purposes: [...purposes], grants: [...grants] };
  }
  /** Selection and process use the same admitted context identity and scope intersection. */
  nextPendingMemory(eventId?: string) {
    if (this.paused) return;
    for (const row of this.repo.memoryRecoveryCandidates(eventId)) {
      const id = String(row.id), host = this.policy.hostScope({ currentEventIds: [id], purposes: [String(row.purpose)] });
      for (const span of this.repo.spans(host, id).filter(span => ['pending', 'needs_context'].includes(span.status))) {
        try {
          const progress = this.repo.memoryContextProgress(host, span.id);
          // A legacy/unattempted row has no captured ambient-read permission.
          const scope = this.contextScope(host, id, progress?.scopeBinding || { ...this.contextBinding(host), sources: [], currentEventIds: [id] });
          if (!this.policy.can(scope, 'evidence:read') || !this.policy.can(scope, 'memory:write')) continue;
          const event = this.repo.evidence(scope, id);
          if (!event || !event.label.infer || span.contentVersion !== event.contentVersion) continue;
          const position = progress?.sourceVersion === event.contentVersion && progress.methodVersion === MEMORY_CONTEXT_METHOD
            ? progress.directoryPosition : undefined;
          const requests = activeContextRequests(this.repo, scope, event, progress?.sourceVersion === event.contentVersion
            ? progress.requests.filter(request => contextRequestSchema.safeParse(request).success) : [], position);
          const identity = memoryContextIdentity(this.repo, scope, event, requests, position);
          if (span.status === 'pending' || progress?.methodVersion !== MEMORY_CONTEXT_METHOD || progress.attemptSignature !== identity.generation)
            return { row, scope, contextSignature: identity.generation };
        } catch (error) {
          if (!(error instanceof HarnessError)) throw error;
        }
      }
    }
  }
  private isolatedContextDependent(text: string, context: MemoryContext) {
    const compact = text.trim().replace(/[，。！？、；：,.!?;\s]+/g, '');
    if (!compact || Array.from(compact).length > 18) return false;
    // Only a genuinely elliptical response is deferred.  A complete clause
    // such as “今天不想跑，只代表今天” contains a negation but is not
    // context-dependent merely because that token appears in the middle.
    if (!/^(?:可以|不行|不可以|不要|不能|没|不|但|不过|周末|以后|现在|继续|这个|那个|它|同意|不同意|好|行|是的|对)/.test(compact))
      return false;
    return !(context.priorEvents?.length || context.anchors?.length || context.conditions?.length);
  }
  private semanticGate(
    change: MemoryChange,
    event: EvidenceEvent,
    review?: SemanticReview,
    trustedControl = false,
    existingTarget = false,
  ): 'active' | 'candidate' {
    if (event.speaker !== 'user' || event.authority !== 'user_statement' || !event.label.infer)
      throw new HarnessError('not_personal_evidence', '引用、模型输出或受限用途不能成为本人理解。');
    if (change.subject === 'other' || change.subject === 'fictional' || change.world === 'hypothetical')
      throw new HarnessError('not_self_reality', '代问与假设不能写入现实个人理解。');
    if (change.subject === 'self' && event.subjectId !== event.ownerId)
      throw new HarnessError('subject_mismatch', '这段证据的主体不是本人，不能改变其归属。');
    const quote = change.sourceQuote;
    if (hasCredentials(quote + '\n' + change.text)) throw new HarnessError('restricted_retention', '凭据不能存入个人理解。');
    // Missing fields remain compatible with legacy single-source reviews.
    // An explicit negative verdict never becomes support via that fallback,
    // including the current-owner path which calls this gate directly.
    if (review?.allSourcesSupportClaim === false || review?.supportSetComplete === false
      || review?.sourceReviews?.some(citation => citation.supported === false))
      throw new HarnessError('support_set_unknown', '这段引用还不足以支持完整理解。', 'never', {
        rejectedDimensions: ['allSourcesSupportClaim', 'supportSetComplete', 'sourceReviews'], explanation: review.reason,
      });
    if (review?.retention === 'restricted') throw new HarnessError('restricted_retention', '这项内容不适合存入普通长期理解。');
    if (!trustedControl) {
      if (!review || !['retain_new', 'maintain_existing', 'original_only', 'needs_context'].includes(review.derivation || '')
        || typeof review.preservesUseScope !== 'boolean' || !(review.futureUse === null || typeof review.futureUse === 'string')
        || !(review.useScope === null || typeof review.useScope === 'string'))
        throw new HarnessError('derivation_unknown', '尚未核清这项理解的派生用途与适用范围，没有新增断言。');
      if (review.derivation === 'needs_context')
        throw new HarnessError('derivation_unknown', '派生或维护的依据仍待澄清，没有提交这项理解变化。');
      const maintenance = existingTarget && change.operation !== 'ADD';
      if (!maintenance) {
        if (review.derivation === 'original_only') throw new HarnessError('memory_not_needed', '原文足以支持当前交流，无需新增人物理解。');
        if (review.derivation !== 'retain_new' || !review.futureUse?.trim() || !review.useScope?.trim())
          throw new HarnessError('derivation_unknown', '没有明确可支持的后续用途与范围，没有新增断言。');
      }
      // Existing status retirement does not assert a new use scope. Repairs
      // that change content still must preserve their actual applicability.
      if ((!maintenance || !['RETRACT', 'EXPIRE', 'DISPUTE'].includes(change.operation)) && !review.preservesUseScope)
        throw new HarnessError('use_scope_rejected', '这项理解的适用范围超出来源，未提交。');
    }
    const expiresExisting = existingTarget && change.operation === 'EXPIRE';
    if (!expiresExisting && (review?.temporalType === 'temporary' || change.kind === 'current_state') && !change.validTo && !change.unresolvedTime)
      throw new HarnessError('missing_expiry', '临时状态需要期限或明确的待确认时间。');
    if (!expiresExisting && review?.temporalType === 'future' && !change.validFrom && !change.unresolvedTime)
      throw new HarnessError('missing_future_scope', '未来变化需要生效时间或待确认标记。');
    if (change.value.type === 'quantity' && (!change.value.unit || !change.value.dimension))
      throw new HarnessError('missing_unit', '这项数值还缺单位或量纲，暂时无法和原话准确对应。');
    const quantified = [...quote.matchAll(/(\d+(?:\.\d+)?)\s*(公里|千米|km|次数|次|分钟|小时|元)/g)];
    if (change.value.type === 'quantity' && quantified.length) {
      const quantity = change.value;
      const units: Record<string, string[]> = {
        公里: ['km'],
        千米: ['km'],
        km: ['km'],
        次: ['count', '次'],
        次数: ['count', '次'],
        分钟: ['minute', 'minutes', 'min', '分钟'],
        小时: ['hour', 'hours', 'h', '小时'],
        元: ['CNY', '元'],
      };
      if (!quantified.some((m) => Number(m[1]) === quantity.value && units[m[2]].includes(quantity.unit)))
        throw new HarnessError('unit_mismatch', '原文中的数值或单位与候选不符。');
    }
    if (
      review &&
      !(
        review.supported &&
        review.preservesSubject &&
        review.preservesWorld &&
        review.preservesTime &&
        review.preservesConditions
      )
    )
      throw new HarnessError('semantic_rejected', '语义核验未通过，未保存为有效理解。', 'never', {
        rejectedDimensions: ['supported', 'preservesSubject', 'preservesWorld', 'preservesTime', 'preservesConditions'].filter(key => review[key as keyof SemanticReview] === false),
        explanation: review.reason,
      });
    if (change.kind === 'inferred_hypothesis' || change.unresolvedTime) return 'candidate';
    if (trustedControl || (review && review.retention === 'allowed')) return 'active';
    return 'candidate';
  }
  private expiryPlan(change: MemoryChange, old: Assertion, now: string): NonNullable<MemoryContext['proposedRetirement']> {
    const temporal: Assertion['temporal'] = { validFrom: change.validFrom, validTo: change.validTo,
      precision: change.unresolvedTime ? 'unresolved' : change.validTo ? 'interval' : 'instant',
      recordedFrom: now, recordedTo: now, unresolvedExpression: change.unresolvedTime };
    const preservesPlannedInterval = !!temporal.validFrom && !!temporal.validTo
      && Date.parse(temporal.validTo) <= Date.parse(temporal.validFrom);
    return { targetId: old.id, targetRevision: old.revision + 1, status: 'expired', timing: 'immediate', preservesPlannedInterval,
      temporal: preservesPlannedInterval ? { ...old.temporal, recordedFrom: now, recordedTo: now } : temporal };
  }
  private currentOwnerParent(ingress: IngressDecision, input: CurrentOwnerChange) {
    const scope = this.policy.require(ingress.contract.scope, 'memory:write');
    this.policy.require(ingress.contract.scope, 'evidence:read');
    if (this.paused || !this.policy.canProposeCurrentOwner(ingress))
      throw new HarnessError('owner_projection_forbidden', '当前范围不能另行保存本人片段。');
    if (!scope.currentEventIds.includes(input.eventId)) throw new HarnessError('event_not_current', '记忆提案须来自本轮本人原话。');
    const parent = this.repo.evidence(ingress.contract.scope, input.eventId);
    if (!parent || parent.kind !== 'user_message' || parent.speaker !== 'user' || parent.authority !== 'user_statement'
      || parent.ownerId !== scope.principalId || parent.subjectId !== scope.principalId || parent.worldId !== 'real'
      || parent.status !== 'active' || parent.label.infer || parent.label.retention !== 'purpose_scoped'
      || parent.label.audience !== 'self' || parent.label.sensitivity === 'restricted' || parent.text !== ingress.authoredText)
      throw new HarnessError('owner_projection_forbidden', '这不是本轮可核验的本人原始陈述。');
    if (parent.contentVersion !== input.sourceContentVersion) throw new HarnessError('source_version_conflict', '本轮原文已有新版本，未保存理解。');
    if (this.repo.hasFence(parent.id, parent.sourceId) || parent.roots.some(root => this.repo.hasFence(root))
      || [parent.id, ...parent.roots].some(id => this.repo.db.prepare("SELECT 1 FROM h_source_restrictions WHERE event_id=? AND predicate IN (?, '*')").get(id, input.predicate)
        || this.repo.db.prepare("SELECT 1 FROM h_source_restrictions x JOIN h_evidence_roots r ON r.event_id=x.event_id WHERE r.root_id=? AND x.predicate IN (?, '*') LIMIT 1").get(id, input.predicate)))
      throw new HarnessError('source_suppressed', '这段来源已删除或停止使用，不能重新提取。');
    return parent;
  }
  /** Explicit current owner ADD only; no inferred evidence is persisted before review. */
  async proposeCurrentOwner(ingress: IngressDecision, raw: unknown, signal: AbortSignal): Promise<Assertion> {
    const input = currentOwnerChangeSchema.parse(raw), parent = this.currentOwnerParent(ingress, input);
    const handle = ingress.contract.scope, contractId = ingress.contract.id, contractRevision = ingress.contract.revision;
    const boundQuote = (quote: string) => {
      const first = parent.text.indexOf(quote);
      if (first < 0 || parent.text.indexOf(quote, first + 1) !== -1)
        throw new HarnessError('projection_quote_invalid', '片段须在本轮原文中有唯一、连续的逐字位置。');
      return { quote, ...locateQuote(parent.text, quote) };
    };
    const statement = boundQuote(input.sourceQuote), recordingRequest = boundQuote(input.recordingQuote);
    const projectionHash = createHash('sha256').update(canonical({ parent: parent.id, version: parent.contentVersion, statement, recordingRequest })).digest('hex');
    const projectionId = 'owner:' + projectionHash, operationKey = 'owner-projection:' + projectionHash;
    const { sourceContentVersion: _version, recordingQuote: _permission, ...claim } = input;
    const change = changeSchema.parse({ ...claim, eventId: projectionId, idempotencyKey: operationKey });
    const requestHash = createHash('sha256').update(canonical(change)).digest('hex');
    const revalidate = () => {
      signal.throwIfAborted(); this.policy.validate(handle);
      if (ingress.contract.scope !== handle || ingress.contract.id !== contractId || ingress.contract.revision !== contractRevision)
        throw new HarnessError('stale_scope', '本轮资料使用范围已改变。');
      const current = this.currentOwnerParent(ingress, input);
      if (canonical(current) !== canonical(parent)) throw new HarnessError('source_version_conflict', '审核期间原文发生变化，未保存理解。');
    };
    const readCommittedRetry = () => {
      const duplicate = this.repo.operation<{ id: string; requestHash: string; projectionId: string }>(operationKey);
      if (!duplicate) return undefined;
      revalidate();
      if (duplicate.requestHash !== requestHash || duplicate.projectionId !== projectionId)
        throw new HarnessError('projection_conflict', '同一原文片段已有不同提案，未重复保存。');
      const scope = this.policy.currentOwnerProjectionScope(handle, parent.id, projectionId, duplicate.id);
      const prior = this.repo.assertion(scope, duplicate.id);
      if (!prior) throw new HarnessError('source_suppressed', '原记录已不可用，不能用重试恢复它。');
      return prior;
    };
    const prior = readCommittedRetry();
    if (prior) return prior;
    if (!this.reviewer) throw new HarnessError('owner_projection_unknown', '本人片段的记录范围尚未核验，没有新增记忆。');
    const review = await this.reviewer(change, parent, signal, { currentOwnerProjection: {
      parentEventId: parent.id, parentContentVersion: parent.contentVersion, parentSubject: parent.sourceContext ? 'contextual' : 'mixed', parentWorld: 'real',
      proposedEvidenceId: projectionId, statement, recordingRequest,
    } });
    revalidate();
    if (typeof review.authorizesOwnerProjection !== 'boolean' || review.retention !== 'allowed' || !review.temporalType || review.temporalType === 'unknown')
      throw new HarnessError('owner_projection_unknown', '本人归属、记录许可或适用范围尚未核清，没有新增记忆。');
    if (!review.authorizesOwnerProjection) throw new HarnessError('owner_projection_rejected', '当前原话不支持把所选片段记录为本人的现实理解。');
    const projected: EvidenceEvent = { ...parent, id: projectionId, sequence: 0, text: input.sourceQuote,
      roots: [...new Set([parent.id, ...parent.roots])], parentEventId: parent.id, contentVersion: 1,
      locator: { kind: 'text', eventId: parent.id, contentVersion: parent.contentVersion, startCodePoint: statement.start, endCodePoint: statement.end },
      label: { ...parent.label, infer: true } };
    const status = this.semanticGate(change, projected, review);
    if (status !== 'active') throw new HarnessError('owner_projection_unknown', '这段内容尚不能成为有效理解，没有新增记忆。');
    return this.repo.write(() => {
      revalidate();
      const raced = readCommittedRetry();
      if (raced) return raced;
      const scope = this.policy.currentOwnerProjectionScope(handle, parent.id, projectionId);
      const evidence = this.repo.ingest(scope, projected);
      this.validateCandidateSource(scope, parent, recordingRequest);
      const assertion = this.commitVerified(scope, change, evidence, status, this.repo.epoch, [{
        eventId: parent.id, contentVersion: parent.contentVersion, start: recordingRequest.start, end: recordingRequest.end, role: 'authorization',
      }]);
      this.repo.markSpans(scope, evidence.id, 'candidate_emitted');
      this.repo.indexEvidence(scope, evidence.id);
      this.repo.markSpans(handle, parent.id, 'quote_or_hypothesis');
      this.repo.completeOperation(operationKey, 'ADD_CURRENT_OWNER', { id: assertion.id, requestHash, projectionId });
      return assertion;
    });
  }
  private validateCandidateSource(handle: ScopeHandle, event: EvidenceEvent, location: { start: number; end: number }) {
    this.repo.refreshSourceConstraints();
    const current = this.repo.evidence(handle, event.id);
    if (!current || current.status === 'deleted')
      throw new HarnessError('source_suppressed', '原始来源已不可用，不能恢复旧理解。');
    if (canonical(current) !== canonical(event))
      throw new HarnessError('source_version_conflict', '审核期间原文或适用范围发生变化，请重读来源。');
    if (!this.repo.citationReadable(handle, { eventId: current.id, contentVersion: current.contentVersion, ...location, role: 'primary' }, true))
      throw new HarnessError('source_suppressed', '这段原文或其真实来源已经删除、更正或停止使用，本次没有重新提取；无关的精确片段仍可使用。');
  }
  private primaryRange(event: EvidenceEvent, change: MemoryChange) {
    if (change.sourceContentVersion !== undefined && change.sourceContentVersion !== event.contentVersion)
      throw new HarnessError('source_version_conflict', '原文版本已变化，请重新定位。');
    const start = change.sourceStartCodePoint, end = change.sourceEndCodePoint;
    if ((start === undefined) !== (end === undefined)) throw new HarnessError('locator_mismatch', '原文定位需要完整起止位置。');
    if (start !== undefined && end !== undefined) {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start
        || end > Array.from(event.text).length || codePointSlice(event.text, start, end) !== change.sourceQuote)
        throw new HarnessError('locator_mismatch', '当前原文定位与逐字引文不符。');
      return { start, end };
    }
    const offset = event.text.indexOf(change.sourceQuote);
    if (offset >= 0 && event.text.indexOf(change.sourceQuote, offset + 1) >= 0)
      throw new HarnessError('ambiguous_source_quote', '同一句原文有多个位置，请给出准确字符范围。');
    return locateQuote(event.text, change.sourceQuote);
  }
  private requestIdentity(change: MemoryChange, event: EvidenceEvent) {
    const { idempotencyKey: _key, expectedRevision: _revision, ...request } = change;
    const range = this.primaryRange(event, change);
    return createHash('sha256').update(canonical({ ...request, sourceContentVersion: event.contentVersion,
      sourceStartCodePoint: range.start, sourceEndCodePoint: range.end,
      supports: change.supports?.length ? [...change.supports].sort((a, b) => canonical(a).localeCompare(canonical(b))) : undefined })).digest('hex');
  }
  private resolveSupportSet(handle: ScopeHandle, change: MemoryChange, event: EvidenceEvent, old?: Assertion) {
    const scope = this.policy.validate(handle), location = this.primaryRange(event, change);
    const citations = [{ eventId: event.id, contentVersion: event.contentVersion, quote: change.sourceQuote, ...location, role: 'primary' as AssertionCitation['role'] }];
    const sources = new Map([[event.id, event]]);
    if (change.supports?.length) this.policy.require(handle, 'evidence:read');
    for (const support of change.supports || []) {
      const source = this.repo.evidence(handle, support.eventId);
      if (!source || source.ownerId !== event.ownerId || source.workspaceId !== event.workspaceId
        || source.subjectId !== scope.subjectId || source.worldId !== scope.worldId || source.speaker !== 'user'
        || source.authority !== 'user_statement' || !source.label.infer || source.label.retention !== 'purpose_scoped')
        throw new HarnessError('support_forbidden', '支持片段不是当前范围内可保留的同主体用户原话。');
      if (source.contentVersion !== support.contentVersion) throw new HarnessError('source_version_conflict', '支持原文版本已变化。');
      if (!Number.isSafeInteger(support.startCodePoint) || !Number.isSafeInteger(support.endCodePoint)
        || support.startCodePoint < 0 || support.endCodePoint <= support.startCodePoint
        || support.endCodePoint > Array.from(source.text).length
        || codePointSlice(source.text, support.startCodePoint, support.endCodePoint) !== support.quote)
        throw new HarnessError('locator_mismatch', '支持片段的Unicode定位与完整引文不符。');
      if (hasCredentials(support.quote)) throw new HarnessError('restricted_retention', '凭据不能存入个人理解的支持集。');
      this.validateCandidateSource(handle, source, { start: support.startCodePoint, end: support.endCodePoint });
      citations.push({ eventId: source.id, contentVersion: source.contentVersion, quote: support.quote,
        start: support.startCodePoint, end: support.endCodePoint, role: 'support' });
      sources.set(source.id, source);
    }
    let complete = true;
    if (old && ['SUPPORT', 'REFINE', 'ADD_EXCEPTION'].includes(change.operation)) {
      for (const citation of this.repo.assertionCitations(handle, old.id)) {
        const source = this.repo.evidence(handle, citation.eventId);
        if (!source || citation.contentVersion !== source.contentVersion || citation.start === undefined || citation.end === undefined) { complete = false; continue; }
        if (!this.repo.citationReadable(handle, citation, true))
          throw new HarnessError('source_suppressed', '已有理解的支持片段已变化，请先重新核对。');
        citations.push({ eventId: source.id, contentVersion: source.contentVersion,
          quote: codePointSlice(source.text, citation.start, citation.end), start: citation.start, end: citation.end,
          role: citation.role === 'authorization' ? 'authorization' : 'support' });
        sources.set(source.id, source);
      }
    }
    return { citations: citations.filter((citation, index, all) => all.findIndex(value =>
      canonical([value.eventId, value.contentVersion, value.start, value.end]) === canonical([citation.eventId, citation.contentVersion, citation.start, citation.end])) === index),
      sources: [...sources.values()], complete };
  }
  private resolveReferenceContexts(handle: ScopeHandle, change: MemoryChange, event: EvidenceEvent,
    old: Assertion | undefined, context: MemoryContext) {
    const inherited = change.operation === 'SUPPORT' || change.referenceContexts === undefined;
    const requested = inherited ? old?.referenceContexts || [] : change.referenceContexts || [];
    return [...new Map(requested.map(input => {
      const prior = old?.referenceContexts?.find(reference => reference.messageId === input.messageId
        && reference.start === input.start && reference.end === input.end);
      if (inherited && prior) {
        const resolved = this.repo.resolveMemoryReferenceContext(handle, prior, prior);
        if (!resolved) throw new HarnessError('memory_reference_changed', '旧理解所依赖的原问句或来源已改变。');
        return [canonical(resolved.reference), resolved] as const;
      }
      const provided = context.referenceCoverage?.find(reference => reference.id === input.messageId && reference.provided);
      const turn = context.priorEvents?.find(turn => turn.id === input.messageId && turn.speaker === 'assistant' && turn.relation === 'before');
      if (!event.sessionId || !provided?.contentSha256 || !turn || input.start < 0 || input.end <= input.start
        || input.end > Array.from(turn.text).length
        || canonical(turn.replyState || null) !== canonical(provided.replyState || null)
        || createHash('sha256').update(turn.text).digest('hex') !== provided.contentSha256)
        throw new HarnessError('memory_reference_unread', '需要本次实际提供的先前问句，才能确定这句答复所指的意思。');
      const resolved = this.repo.resolveMemoryReferenceContext(handle, { ...input, sessionId: event.sessionId });
      if (!resolved || resolved.reference.contentSha256 !== provided.contentSha256
        || canonical(resolved.reference.replyState || null) !== canonical(provided.replyState || null))
        throw new HarnessError('memory_reference_changed', '原问句缺少当前可核的原消息或来源证明。');
      return [canonical(resolved.reference), resolved] as const;
    })).values()];
  }
  async propose(
    handle: ScopeHandle,
    raw: unknown,
    signal: AbortSignal = new AbortController().signal,
    options: { trustedControl?: boolean; review?: SemanticReview; reviewContext?: MemoryContext;
      onChangeReceipt?: (receipt: MemoryChangeReceipt) => void } = {},
  ): Promise<Assertion> {
    const epoch = this.repo.epoch;
    let change = changeSchema.parse(raw);
    try {
      const scope = this.policy.require(handle, 'memory:write');
      if (!scope.infer || scope.retention !== 'purpose_scoped')
        throw new HarnessError('inference_forbidden', '这段内容不用于长期记忆。');
      const event = this.repo.evidence(handle, change.eventId);
      if (!event) throw new HarnessError('evidence_forbidden', '找不到有权使用的原始证据。');
      const location = this.primaryRange(event, change);
      this.validateCandidateSource(handle, event, location);
      if (codePointSlice(event.text, location.start, location.end) !== change.sourceQuote)
        throw new HarnessError('locator_mismatch', '原文定位核验失败。');
      const requestHash = this.requestIdentity(change, event);
      if (options.review && options.reviewContext && (options.reviewContext.priorEvents?.length || options.reviewContext.anchors?.length
        || options.reviewContext.conditions?.length || options.reviewContext.current)
        && !change.supports?.length && (options.review.allSourcesSupportClaim !== true || options.review.supportSetComplete !== true))
        throw new HarnessError('support_set_unknown', '这些前情还没有作为明确的支持片段核对，眼下不足以确认这项理解。');
      const duplicate = this.repo.operation<{ id: string; requestHash?: string }>('memory:' + change.idempotencyKey);
      if (duplicate) {
        if (!options.trustedControl && !this.repo.personalMemoryReadable(handle))
          throw new HarnessError('memory_read_forbidden', '当前没有读取既有个人理解的许可。');
        const { idempotencyKey: _key, eventId: _event, expectedRevision: _revision, sourceContentVersion: _version,
          sourceStartCodePoint: _start, sourceEndCodePoint: _end, supports: _supports, ...legacy } = change;
        const provenLegacy = !change.supports?.length && change.idempotencyKey.startsWith(`extract:${event.id}:${event.contentVersion}:`)
          && change.idempotencyKey.endsWith(':v2:' + createHash('sha256').update(canonical(legacy)).digest('hex'));
        if (duplicate.requestHash !== requestHash && !(duplicate.requestHash === undefined && provenLegacy))
          throw new HarnessError('idempotency_conflict', '同一提交标识的来源或内容不同，没有复用旧回执。');
        const prior = this.repo.assertion(handle, duplicate.id);
        if (prior) {
          options.onChangeReceipt?.(this.changeReceipt(handle, change, event, location, prior, undefined, [], false));
          return prior;
        }
      }
      if (change.operation !== 'ADD' && !change.targetId) {
        if (!options.trustedControl && !this.repo.personalMemoryReadable(handle))
          throw new HarnessError('memory_read_forbidden', '当前没有读取既有个人理解的许可。');
        const matching = this.repo
          .assertions(handle, {
            statuses: ['active', 'candidate', 'disputed', 'inactive'],
            predicate: change.predicate,
          })
          .filter((a) => canonical(a.conditions) === canonical(change.conditions));
        if (matching.length === 1)
          change = { ...change, targetId: matching[0].id, expectedRevision: matching[0].revision };
        else if (!matching.length && change.operation === 'SUPERSEDE')
          change = { ...change, operation: 'ADD' };
        else throw new HarnessError('ambiguous_target', '没有唯一对应的旧理解，需要确认具体对象。');
      }
      let review = options.review;
      if (change.targetId && !options.trustedControl && !this.repo.personalMemoryReadable(handle))
        throw new HarnessError('memory_read_forbidden', '当前没有读取既有个人理解的许可。');
      const oldTarget = change.targetId ? this.repo.assertion(handle, change.targetId) : undefined;
      if (oldTarget && change.expectedRevision !== undefined && change.expectedRevision !== oldTarget.revision) {
        this.repo.conflicts.push({ objectId: oldTarget.id, expected: change.expectedRevision, actual: oldTarget.revision });
        throw new HarnessError('revision_conflict', '这条理解已有新版本，先接回现在的内容。');
      }
      // The schema permits an unknown revision. Bind that omission to the
      // exact target now being independently reviewed, then keep the normal
      // transactional revision check. An explicitly stale revision stays stale.
      if (oldTarget && change.expectedRevision === undefined)
        change = { ...change, expectedRevision: oldTarget.revision };
      if (oldTarget && change.operation === 'SUPPORT') {
        if (oldTarget.kind === 'legacy_unverified')
          throw new HarnessError('support_unverified', '旧导入理解需先核实内容，不能只增加来源来确认。');
        // SUPPORT adds evidence to the old claim. Review exactly that claim,
        // rather than one set of fields and then writing a different one.
        change = { ...change, predicate: oldTarget.predicate, value: oldTarget.value, text: oldTarget.text,
          kind: oldTarget.kind, strength: oldTarget.strength, conditions: oldTarget.conditions,
          validFrom: oldTarget.temporal.validFrom, validTo: oldTarget.temporal.validTo,
          unresolvedTime: oldTarget.temporal.unresolvedExpression };
      }
      // CORRECT already retains these bounds in the writer. Review that same
      // proposed time interval rather than rejecting an omitted restatement.
      // Conditions are never inherited here: changing them remains explicit.
      if (oldTarget && change.operation === 'CORRECT')
        change = { ...change, validFrom: change.validFrom || oldTarget.temporal.validFrom,
          validTo: change.validTo || oldTarget.temporal.validTo };
      const retirement = oldTarget && change.operation === 'EXPIRE' ? this.expiryPlan(change, oldTarget, this.repo.clock.now()) : undefined;
      if (retirement)
        change = { ...change, validFrom: retirement.temporal.validFrom, validTo: retirement.temporal.validTo,
          unresolvedTime: retirement.temporal.unresolvedExpression };
      const { existingAssertion: _untrustedTarget, proposedRetirement: _untrustedRetirement, currentOwnerProjection: _untrustedProjection,
        hostReferenceContexts: _untrustedReferences,
        personalMethodOwners: _untrustedMethodOwners,
        hostSupportSet: _untrustedSupports, ...providedContext } = options.reviewContext || {};
      const hostSupportSet = this.resolveSupportSet(handle, change, event, oldTarget);
      const hostReferenceContexts = this.resolveReferenceContexts(handle, change, event, oldTarget, providedContext);
      const methodRefs = hostSupportSet.citations.map(({ eventId, contentVersion, start, end }) => ({ eventId, contentVersion, start, end }));
      const personalMethodOwners = this.personalMethodOwner?.ownership(handle, methodRefs) || [];
      const reviewContext: MemoryContext = { ...providedContext, hostSupportSet, hostReferenceContexts, personalMethodOwners };
      let previousCitations: AssertionCitation[] = [];
      if (oldTarget) {
        const oldCitations = this.repo.assertionCitations(handle, oldTarget.id);
        previousCitations = oldCitations;
        const sourceQuotes = oldCitations.flatMap(citation => {
            const source = this.repo.evidence(handle, citation.eventId);
            if (!source || source.contentVersion !== citation.contentVersion || citation.start === undefined || citation.end === undefined) return [];
            return [{ eventId: source.id, contentVersion: source.contentVersion, speaker: source.speaker,
              authority: source.authority, receivedAt: source.receivedAt, sequence: source.sequence,
              quote: codePointSlice(source.text, citation.start, citation.end), start: citation.start, end: citation.end }];
          });
        reviewContext.existingAssertion = { id: oldTarget.id, revision: oldTarget.revision, subjectId: oldTarget.subjectId, worldId: oldTarget.worldId,
          predicate: oldTarget.predicate, kind: oldTarget.kind, strength: oldTarget.strength, status: oldTarget.status, text: oldTarget.text,
          conditions: oldTarget.conditions, temporal: oldTarget.temporal, sourceQuotes,
          sourceCoverage: sourceQuotes.length === oldCitations.length ? 'complete' : 'incomplete',
          referenceContexts: (oldTarget.referenceContexts || []).map(reference => {
            const resolved = this.repo.resolveMemoryReferenceContext(handle, reference, reference);
            if (!resolved) throw new HarnessError('memory_reference_changed', '旧理解所依赖的原问句已不可读。');
            return resolved;
          }) };
        if (retirement) reviewContext.proposedRetirement = retirement;
      }
      if (!options.trustedControl && !review && this.reviewer)
        review = await this.reviewer(change, event, signal, reviewContext);
      signal.throwIfAborted();
      this.policy.validate(handle);
      const currentMethodOwners = this.personalMethodOwner?.ownership(handle, methodRefs) || [];
      if (canonical(currentMethodOwners) !== canonical(personalMethodOwners))
        throw new HarnessError('memory_context_changed', '刚才一起留下的帮法已经变化，先按现在那一份继续整理。');
      if (!options.trustedControl && personalMethodOwners.length) {
        if (review?.personalMethodOwner === undefined)
          throw new HarnessError('method_ownership_unknown', '这段话里有已经留下的帮法，其他独立的意思还需要分清。');
        if (review.personalMethodOwner !== null) {
          if (!personalMethodOwners.some(owner => owner.receiptId === review!.personalMethodOwner))
            throw new HarnessError('method_ownership_unknown', '这份帮法的来由和刚才核对的内容没有对上，先留在原处。');
          throw new HarnessError('memory_not_needed', '这份帮法已经在原来的方法里留好，其他独立的事实仍可分别理解。');
        }
      }
      if (hostReferenceContexts.length || oldTarget?.referenceContexts?.length) {
        const key = (value: { messageId: string; start: number; end: number; contentSha256: string }) =>
          canonical([value.messageId, value.start, value.end, value.contentSha256]);
        const expected = hostReferenceContexts.map(value => key(value.reference));
        const checked = review?.referenceReviews || [];
        const keys = checked.map(key);
        if (review?.preservesReferenceContext !== true || checked.length !== expected.length
          || new Set(keys).size !== expected.length || checked.some((value, index) => !value.supported || !expected.includes(keys[index])))
          throw new HarnessError('reference_context_unknown', '这段问答的指代还不够清楚，暂时没有记成长期理解。');
      }
      const suppliedContextText = !!(options.review && (providedContext.priorEvents?.length || providedContext.anchors?.length || providedContext.conditions?.length || providedContext.current));
      const needsCompleteReview = !!change.supports?.length || (!options.review && hostSupportSet.citations.length > 1) || suppliedContextText
        || review?.allSourcesSupportClaim !== undefined || review?.supportSetComplete !== undefined || review?.sourceReviews !== undefined;
      if (needsCompleteReview) {
        const keys = hostSupportSet.citations.map(citation => canonical([citation.eventId, citation.contentVersion, citation.start, citation.end]));
        const checked = review?.sourceReviews || [];
        if (!hostSupportSet.complete || review?.allSourcesSupportClaim !== true || review.supportSetComplete !== true
          || checked.length !== keys.length || checked.some(citation => !citation.supported
            || !keys.includes(canonical([citation.eventId, citation.contentVersion, citation.start, citation.end])))
          || new Set(checked.map(citation => canonical([citation.eventId, citation.contentVersion, citation.start, citation.end]))).size !== keys.length)
          throw new HarnessError('support_set_unknown', '跨来源条件尚未逐项核清；线索不能代替已声明的支持片段。');
      }
      if (change.operation === 'SUPPORT' && !options.trustedControl && review?.retention !== 'allowed')
        throw new HarnessError('support_unverified', '新增来源的长期用途未核实，没有把它附为有效支持。');
      const existingTarget = !!change.targetId && !!this.repo.assertion(handle, change.targetId);
      const status = this.semanticGate(change, event, review, options.trustedControl, existingTarget);
      if (scope.privacyEpoch !== epoch)
        throw new HarnessError('stale_scope', '资料范围已改变，候选不再提交。');
      const value = this.commitVerified(handle, change, event, status, epoch, [], reviewContext, requestHash);
      const revised = !oldTarget || value.id !== oldTarget.id || value.revision !== oldTarget.revision;
      options.onChangeReceipt?.(this.changeReceipt(handle, change, event, location, value, oldTarget, previousCitations, revised));
      return value;
    } catch (error) {
      const code = error instanceof HarnessError ? error.code : 'invalid_candidate';
      if (code !== 'memory_not_needed') this.rejected.push({ eventId: change.eventId, code });
      if (code === 'stale_scope') {
        this.staleCommits.push({ eventId: change.eventId, epoch });
      }
      throw error;
    }
  }
  private changeReceipt(handle: ScopeHandle, change: MemoryChange, event: EvidenceEvent,
    location: { start: number; end: number }, value: Assertion, previous: Assertion | undefined, citations: AssertionCitation[], applied: boolean): MemoryChangeReceipt {
    const sources = citations.flatMap(citation => {
      const metadata = this.repo.citationMetadata(handle, citation);
      return metadata ? [metadata] : [];
    });
    const source = this.repo.citationMetadata(handle, { eventId: event.id, contentVersion: event.contentVersion,
      ...location, role: 'primary' });
    return { ...(applied ? { operation: change.operation } : { requestedOperation: change.operation }), outcome: applied ? 'new_revision' : 'existing_receipt',
      current: { id: value.id, revision: value.revision, status: value.status, verification: value.verification },
      ...(source ? { source } : {}),
      ...(previous ? { previous: { id: previous.id, revision: previous.revision, kind: previous.kind,
        status: previous.status, verification: previous.verification, sources,
        sourceCoverage: sources.length === citations.length ? 'complete' : 'incomplete' } } : {}),
      interpretationOfPastAccuracy: 'not_established_by_revision',
      meaning: '这是依据当前原话维护理解的回执。previous.sources保留当时来源的发言身份、收到时间和原地址，source是这次原话；这里只列元数据，正文是否读到仍看实际读取。更新本身没有判断过去是谁记错或误读，也不把后来重想、澄清或现实变化自动归成任何一方的旧失误。可以比较原陈述与后来原话，再决定怎样承接；旧来源的历史身份与现在适用性分开，撤源和遗忘仍立即生效。' };
  }
  private commitVerified(
    handle: ScopeHandle,
    change: MemoryChange,
    event: EvidenceEvent,
    status: 'active' | 'candidate',
    epoch: number,
    authorizations: { eventId: string; contentVersion: number; start: number; end: number; role: 'authorization' }[] = [],
    extractionContext?: MemoryContext,
    requestHash?: string,
  ): Assertion {
    const scope = this.policy.require(handle, 'memory:write'),
      location = this.primaryRange(event, change);
    if (scope.privacyEpoch !== epoch) throw new HarnessError('stale_scope', '资料范围已改变。');
    this.repo.fault?.('before_candidate_commit');
    const old = change.targetId ? this.repo.assertion(handle, change.targetId) : undefined;
    if (change.operation !== 'ADD' && !old)
      throw new HarnessError('target_missing', '要修改的理解不存在或不可用。');
    if (old && old.revision !== change.expectedRevision) {
      this.repo.conflicts.push({
        objectId: old.id,
        expected: change.expectedRevision || 0,
        actual: old.revision,
      });
      throw new HarnessError('revision_conflict', '这条理解已有新版本，请重读后修改。');
    }
    if (old && ['CORRECT', 'SUPERSEDE', 'REFINE', 'ADD_EXCEPTION'].includes(change.operation)) {
      const newest = Math.max(...old.evidenceIds.map((id) => this.repo.evidence(handle, id)?.sequence || 0));
      if (event.sequence < newest)
        throw new HarnessError('older_source_update', '较旧的来源不能覆盖之后的明确更新。');
    }
    const now = this.repo.clock.now();
    const supportSet = this.resolveSupportSet(handle, change, event, old);
    if (!supportSet.complete) throw new HarnessError('support_set_unknown', '旧支持片段缺少可核验定位，请先补齐来源。');
    const citations = [...supportSet.citations, ...authorizations];
    const operationHash = requestHash || this.requestIdentity(change, event);
    let assertion: Assertion = {
      id: old?.id || randomUUID(),
      ownerId: scope.principalId,
      workspaceId: scope.workspaceId,
      subjectId: scope.subjectId,
      worldId: scope.worldId,
      revision: old ? old.revision + 1 : 1,
      predicate: change.predicate,
      value: change.value,
      text: change.text,
      kind: change.kind,
      strength: status === 'active' ? change.strength : 'unconfirmed',
      conditions: change.conditions,
      exceptionIds: old?.exceptionIds || [],
      temporal: {
        validFrom: change.validFrom,
        validTo: change.validTo,
        precision: change.unresolvedTime ? 'unresolved' : change.validTo ? 'interval' : 'instant',
        recordedFrom: now,
        unresolvedExpression: change.unresolvedTime,
      },
      status,
      evidenceIds: [...new Set(supportSet.citations.filter(citation => citation.role !== 'authorization').map(citation => citation.eventId))],
      ...(extractionContext?.hostReferenceContexts?.length
        ? { referenceContexts: extractionContext.hostReferenceContexts.map(context => context.reference) } : {}),
      label: { ...event.label },
      verification: status === 'active' ? 'verified' : 'pending',
    };
    // The independently reviewed wording carries the resolved meaning. Exact
    // user quotations remain in the citation owner; replacing the meaning with
    // an elliptical reply would lose its referent and break later retrieval.
    this.repo.write(() => {
      this.policy.validate(handle);
      validateMemoryContextSnapshot(this.repo, handle, event, extractionContext, !!change.supports?.length);
      if (extractionContext?.personalMethodOwners) {
        const refs = (extractionContext.hostSupportSet?.citations || []).map(({ eventId, contentVersion, start, end }) => ({ eventId, contentVersion, start, end }));
        if (canonical(this.personalMethodOwner?.ownership(handle, refs) || []) !== canonical(extractionContext.personalMethodOwners))
          throw new HarnessError('memory_context_changed', '这份帮法刚有变化，其他独立的意思先按现在的来由再看一遍。');
      }
      // Capture locators before saveAssertion replaces the old evidence links.
      const oldLocators = old ? this.repo.assertionCitations(handle, old.id) : [];
      // Review is asynchronous. A correction may have stopped this source
      // without changing the privacy epoch or this proposal's target revision.
      this.validateCandidateSource(handle, event, location);
      const currentSupports = this.resolveSupportSet(handle, change, event, old);
      if (canonical(currentSupports) !== canonical(supportSet)) throw new HarnessError('source_version_conflict', '审核后的支持片段或范围发生变化。');
      // Only the host's exact existing-target locators may carry their old
      // source-use receipt through validation. A proposal cannot supply one;
      // the new revision receives its own receipt only after semantic commit.
      const writeCitations = citations.map(citation => {
        const prior = oldLocators.find(value => value.eventId === citation.eventId && value.contentVersion === citation.contentVersion
          && value.start === citation.start && value.end === citation.end);
        return { ...citation, ...(prior?.restrictionReceipt ? { restrictionReceipt: prior.restrictionReceipt } : {}) };
      });
      const restrictionBaseline = this.repo.citationReviewBaseline(handle, [...citations, ...oldLocators]);
      const installedRestrictions: ReviewedSourceRestriction[] = [];
      const reviewedRevisions: { id: string; revision: number }[] = [];
      if (change.operation === 'SUPPORT' && old) {
        const alreadySupported = citations.every(citation => oldLocators.some(prior => {
          if (prior.role === 'authorization' && citation.role !== 'authorization') return false;
          if (canonical([prior.eventId, prior.contentVersion, prior.start, prior.end])
            === canonical([citation.eventId, citation.contentVersion, citation.start, citation.end])) return true;
          const currentSource = supportSet.sources.find(source => source.id === citation.eventId);
          const previousSource = this.repo.evidence(handle, prior.eventId);
          return currentSource && previousSource && citation.start !== undefined && citation.end !== undefined
            && prior.start !== undefined && prior.end !== undefined && this.repo.sameSourceOrigin(currentSource,
              { start: citation.start, end: citation.end }, previousSource, { start: prior.start, end: prior.end });
        }));
        if (alreadySupported) {
          this.repo.completeOperation('memory:' + change.idempotencyKey, 'SUPPORT', { id: old.id, requestHash: operationHash });
          assertion = old;
          return;
        }
        assertion = {
          ...old,
          revision: old.revision + 1,
          evidenceIds: [...new Set([...old.evidenceIds, ...assertion.evidenceIds])],
        };
      }
      if (change.operation === 'ADD_EXCEPTION' && old) {
        assertion.id = randomUUID();
        assertion.revision = 1;
        this.repo.saveAssertion(handle, assertion, undefined, writeCitations);
        this.repo.saveAssertion(
          handle,
          { ...old, revision: old.revision + 1, exceptionIds: [...old.exceptionIds, assertion.id] },
          old.revision,
        );
        reviewedRevisions.push({ id: old.id, revision: old.revision + 1 });
        this.repo.addDependency(handle, {
          consumerId: old.id,
          producerId: assertion.id,
          producerRevision: assertion.revision,
          sensitivity: 'hard',
          invalidation: 'revalidate',
        });
      } else if (change.operation === 'SUPERSEDE' && old) {
        if (!change.validFrom) throw new HarnessError('change_date_missing', '现实变化需要明确生效日期。');
        const prior = {
          ...old,
          revision: old.revision + 1,
          temporal: { ...old.temporal, validTo: change.validFrom },
        };
        this.repo.saveAssertion(handle, prior, old.revision);
        reviewedRevisions.push({ id: prior.id, revision: prior.revision });
        assertion.id = randomUUID();
        assertion.revision = 1;
        this.repo.saveAssertion(handle, assertion, undefined, writeCitations);
      } else {
        if (change.operation === 'CORRECT' && old)
          assertion.temporal = {
            ...assertion.temporal,
            validFrom: change.validFrom || old.temporal.validFrom,
            validTo: change.validTo || old.temporal.validTo,
          };
        if (change.operation === 'DISPUTE') assertion.status = 'disputed';
        if (change.operation === 'EXPIRE' && old) {
          assertion.status = 'expired';
          assertion.temporal = this.expiryPlan(change, old, now).temporal;
        }
        if (change.operation === 'RETRACT') assertion.status = 'retracted';
        this.repo.saveAssertion(handle, assertion, old?.revision, writeCitations);
      }
      if (old) {
        if (['CORRECT', 'RETRACT', 'EXPIRE', 'REFINE', 'SUPERSEDE'].includes(change.operation))
          installedRestrictions.push(...this.repo.restrictCitationOrigins(handle, oldLocators.filter(citation => citation.role !== 'authorization'),
            old.predicate, change.operation, event.id, change.operation === 'SUPERSEDE' ? change.validFrom! : now, true));
      }
      reviewedRevisions.push({ id: assertion.id, revision: assertion.revision });
      this.repo.recordReviewedCitationUse(handle, reviewedRevisions, restrictionBaseline, installedRestrictions);
      for (const ref of reviewedRevisions) this.repo.noteAssertionRevision(handle, ref, {
        operation: change.operation, causeEventId: event.id, causeContentVersion: event.contentVersion,
        causeStart: location.start, causeEnd: location.end,
        ...(old && old.id !== assertion.id ? { relatedAssertionId: ref.id === old.id ? assertion.id : old.id } : {}),
      });
      if (old) this.repo.invalidate(old.id, 'understanding_' + change.operation.toLowerCase());
      this.repo.completeOperation('memory:' + change.idempotencyKey, change.operation, { id: assertion.id, requestHash: operationHash });
      this.repo.db
        .prepare('INSERT OR REPLACE INTO h_proposals VALUES(?,?,?,?,?,?)')
        .run(
          change.idempotencyKey,
          event.id,
          epoch,
          'committed',
          null,
          JSON.stringify({
            operation: change.operation,
            targetId: assertion.id,
            eventId: event.id,
            actor: scope.child ? 'delegate' : 'parent',
          }),
        );
    });
    const stored = this.repo.db.prepare('SELECT payload FROM h_assertions WHERE id=? AND owner=? AND workspace=?')
      .get(assertion.id, scope.principalId, scope.workspaceId);
    if (!stored) throw new HarnessError('source_suppressed', '提交期间依据已经失效，没有恢复旧理解。');
    return JSON.parse(String(stored.payload)) as Assertion;
  }
  async process(
    handle: ScopeHandle,
    eventId: string,
    signal: AbortSignal = new AbortController().signal,
    suppliedContext?: MemoryContext,
  ) {
    if (this.paused) return;
    const event = this.repo.evidence(handle, eventId);
    if (!event) return;
    if (!event.label.infer || event.speaker !== 'user' || event.status === 'deleted') {
      this.repo.markSpans(handle, eventId, 'quote_or_hypothesis');
      return;
    }
    if (!this.extractor) return; // Explicit pending coverage remains visible; no guessed success.
    for (const span of this.repo
      .spans(handle, eventId)
      // A failed span is an explicit terminal marker for this drain.  A later
      // user action or recovery job may requeue it deliberately; do not create
      // an implicit retry loop merely because the worker runs again.
      .filter((s) => s.contentVersion === event.contentVersion && ['pending', 'needs_context'].includes(s.status))) {
      signal.throwIfAborted();
      const saved = this.repo.memoryContextProgress(handle, span.id);
      const scope = this.contextScope(handle, eventId, saved?.scopeBinding);
      const directoryPosition = saved?.sourceVersion === event.contentVersion && saved.methodVersion === MEMORY_CONTEXT_METHOD
        ? saved.directoryPosition : undefined;
      const requests = activeContextRequests(this.repo, scope, event, saved?.sourceVersion === event.contentVersion
        ? saved.requests.filter(request => contextRequestSchema.safeParse(request).success) : [], directoryPosition);
      const identity = memoryContextIdentity(this.repo, scope, event, requests, directoryPosition);
      if (span.status === 'needs_context' && saved?.methodVersion === MEMORY_CONTEXT_METHOD && saved.attemptSignature === identity.generation) continue;
      let context: MemoryContext | undefined;
      const remember = (nextRequests = requests, attemptSignature = context?.sourceSignature
         ? memoryContextAttemptSignature(context.sourceSignature, requests) : identity.generation, results = context?.contextRequestResults || [],
         nextDirectoryPosition = directoryPosition) => {
        this.repo.recordMemoryContext(scope, event.id, span.id, { sourceVersion: event.contentVersion, methodVersion: MEMORY_CONTEXT_METHOD,
          attemptSignature, sourceSignature: context?.sourceSignature || identity.sourceSignature,
          contextWatermark: context?.sourceDirectory ? Math.max(event.sequence, ...context.sourceDirectory.map(source => source.sequence)) : identity.contextWatermark,
          requestSignature: contextRequestSignature(nextRequests), requests: nextRequests, requestResults: results, scopeBinding: this.contextBinding(scope),
          directoryPosition: nextDirectoryPosition });
      };
      try {
        // A saved attempt is not an ACK. A process exit during hydration,
        // generation or candidate review leaves this generation unfinished.
        // Only an actual needs_context result suppresses an idle retry.
        this.repo.markSpans(scope, eventId, 'pending', [span.id]);
        context = buildMemoryContext(this.repo, scope, event, span, this.workerContext(scope, event, suppliedContext), requests, directoryPosition);
        remember();
        validateMemoryContextSnapshot(this.repo, scope, event, context);
        const own = context.sourceDirectory?.find(source => source.eventId === event.id);
        if (!own?.allowedRanges.some(range => range.start < span.end && range.end > span.start)) {
          this.repo.markSpans(scope, eventId, 'quote_or_hypothesis', [span.id]);
          continue;
        }
        if (own.allowedRanges.some(range => {
          const needed = { start: Math.max(range.start, span.start), end: Math.min(range.end, span.end) };
          return needed.end > needed.start && !containsContextRange(own.providedRanges, needed);
        })) throw new HarnessError('memory_context_budget', '本片段的合法正文尚未完整提供，不能把未处理部分记为完成。');
        const extracted = await this.extractor(
          event,
          { id: span.id, start: span.start, end: span.end, text: context.current?.sourceExcerpt || '',
            textStart: context.current?.sourceExcerptStart, textEnd: context.current?.sourceExcerptEnd, context },
          signal,
        );
        if (extracted.formatRepair === 'recovered')
          this.extractionDiagnostics.push({
            eventId: event.id,
            spanId: span.id,
            status: 'format_repaired',
            attempts: 2,
          });
        this.policy.validate(scope);
        validateMemoryContextSnapshot(this.repo, scope, event, context);
        if (extracted.contextRequests?.length || extracted.contextBrowse?.length || extracted.status === 'needs_context') {
          // A clarification arriving during the model call has not been read by it.
          validateMemoryContextSnapshot(this.repo, scope, event, context, true);
          const next = [...requests], results: ContextRequestResult[] = [];
          let expanded = false;
          for (const [index, raw] of (extracted.contextRequests || []).entries()) {
            const checked = contextRequestSchema.safeParse(raw), request = checked.success ? checked.data : undefined;
            const source = request && context.sourceDirectory?.find(source => source.eventId === request.eventId);
            let status: ContextRequestResult['status'] = !request ? 'invalid_range' : !source ? 'not_admitted'
              : source.contentVersion !== request.contentVersion ? 'version_changed'
                : !containsContextRange(source.allowedRanges, request) ? 'invalid_range' : 'provided';
            if (request && status === 'provided') {
              const candidate = canonicalContextRequests([...next, request]);
              next.splice(0, next.length, ...candidate);
              const hydrated = buildMemoryContext(this.repo, scope, event, span, this.workerContext(scope, event, suppliedContext), next, directoryPosition);
              const indexInNext = next.findIndex(item => canonical(item) === canonical(request));
              status = hydrated.contextRequestResults?.[indexInNext]?.status || 'budget_exceeded';
              if (status === 'provided' && !containsContextRange(source!.providedRanges, request)) expanded = true;
            }
            results.push({ index, status });
          }
          validateMemoryContextSnapshot(this.repo, scope, event, context);
          const canonicalNext = canonicalContextRequests(next);
          const planned = buildMemoryContext(this.repo, scope, event, span, this.workerContext(scope, event, suppliedContext), canonicalNext, directoryPosition);
          expanded = false;
          for (const [index, raw] of (extracted.contextRequests || []).entries()) {
            const checked = contextRequestSchema.safeParse(raw);
            if (!checked.success) continue;
            const at = canonicalNext.findIndex(request => canonical(request) === canonical(checked.data));
            if (at < 0) continue;
            results[index] = { index, status: planned.contextRequestResults?.[at]?.status || 'budget_exceeded' };
            const source = context.sourceDirectory?.find(source => source.eventId === checked.data.eventId);
            if (results[index].status === 'provided' && source && !containsContextRange(source.providedRanges, checked.data)) expanded = true;
          }
          const nextDirectoryPosition = advanceMemoryContextDirectory(this.repo, scope, event, canonicalNext, directoryPosition,
            contextBrowseSchema.parse(extracted.contextBrowse || []));
          // Only additional legal text or a real next directory page earns a
          // new generation. Repeated/invalid requests do not spin the worker.
          remember(canonicalNext, memoryContextAttemptSignature(context.sourceSignature!, expanded
            && contextRequestSignature(canonicalNext) !== contextRequestSignature(requests) ? requests : canonicalNext), planned.contextRequestResults || [], nextDirectoryPosition);
          this.repo.markSpans(scope, eventId, 'needs_context', [span.id]);
          continue;
        }
        let failed = false, retained = 0, originalOnly = 0;
        for (const proposal of extracted.changes) {
          try {
            validateMemoryContextSnapshot(this.repo, scope, event, context, !!proposal.supports?.length);
            await this.propose(scope, { ...proposal, eventId: event.id }, signal, { reviewContext: context });
            retained++;
          } catch (error) {
            if (signal.aborted || this.retryableInterruption(error) || (error instanceof HarnessError && error.code === 'stale_scope'))
              throw error;
            if (error instanceof HarnessError && error.code === 'memory_not_needed') { originalOnly++; continue; }
            failed = true;
          }
        }
        this.repo.markSpans(scope, eventId, failed ? 'needs_context' : originalOnly && !retained ? 'no_personal_fact' : extracted.status, [span.id]);
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof HarnessError && ['memory_context_changed', 'memory_context_budget'].includes(error.code)) {
          remember();
          this.repo.markSpans(scope, eventId, 'needs_context', [span.id]);
          continue;
        }
        if (this.retryableInterruption(error)) {
          // Some candidates in this span may already be committed. Their
          // content-bound idempotency keys make the resumed pass safe.
          // Stop now: spending the same exhausted budget on every later span
          // would turn an operational interruption into permanent data loss.
          this.repo.markSpans(scope, eventId, 'pending', [span.id]);
          throw error;
        }
        if (error instanceof HarnessError && error.code === 'invalid_semantic_json')
          this.extractionDiagnostics.push({
            eventId: event.id,
            spanId: span.id,
            status: 'failed',
            attempts: 2,
          });
        try {
          this.repo.markSpans(handle, eventId, 'failed', [span.id]);
        } catch {}
        if (error instanceof HarnessError && error.code === 'stale_scope') throw error;
      }
    }
  }
  async drain(signal: AbortSignal = new AbortController().signal) {
    if (this.paused) return;
    const handle = this.policy.hostScope({
      expiresAt: new Date(Date.parse(this.repo.clock.now()) + 240000).toISOString(),
    });
    for (const job of this.repo.pending('extract')) await this.process(handle, String(job.object_id), signal);
    for (const job of this.repo.pending('index_evidence'))
      this.repo.indexEvidence(handle, String(job.object_id));
  }
  saveControl(
    text: string,
    id?: string,
    options: {
      operation?: MemoryChange['operation'];
      validFrom?: string;
      validTo?: string;
      conditions?: Assertion['conditions'];
      expectedRevision?: number;
    } = {},
  ): MemoryView {
    const eventId = randomUUID(),
      handle = this.policy.hostScope({ currentEventIds: [eventId] });
    const old = id ? this.repo.assertion(handle, id) : undefined;
    const event = this.repo.ingest(handle, {
      id: eventId,
      workspaceId: this.repo.identity.workspaceId,
      ownerId: this.repo.identity.principalId,
      subjectId: this.repo.identity.principalId,
      worldId: 'real',
      sourceId: 'profile:self',
      contentVersion: 1,
      text,
      speaker: 'user',
      kind: 'user_control',
      authority: 'user_statement',
      roots: [eventId],
      label: { ...personalLabel },
      receivedAt: this.repo.clock.now(),
      status: 'active',
    });
    const change = changeSchema.parse({
      operation: id ? options.operation || 'CORRECT' : 'ADD',
      targetId: id,
      expectedRevision: options.expectedRevision ?? old?.revision,
      eventId: event.id,
      sourceQuote: text,
      predicate: old?.predicate || 'preference.explicit',
      value: { type: 'text', value: text },
      text,
      kind:
        old && old.kind !== 'legacy_unverified' && old.kind !== 'inferred_hypothesis'
          ? old.kind
          : 'explicit_preference',
      strength: old?.strength === 'hard' ? 'hard' : 'soft',
      conditions: options.conditions || old?.conditions || always,
      validFrom: options.validFrom,
      validTo: options.validTo,
      idempotencyKey: 'control:' + event.id,
    });
    const status = this.semanticGate(change, event, undefined, true, !!old);
    const value = this.commitVerified(handle, change, event, status, this.repo.epoch);
    this.repo.markSpans(handle, event.id, 'candidate_emitted');
    this.repo.indexEvidence(handle, event.id);
    const view = this.view(handle, value);
    this.repo.write(() => this.repo.setMeta('policy_revision', this.repo.policyRevision + 1));
    this.policy.signalBarrier();
    return view;
  }
  view(handle: ScopeHandle, assertion: Assertion): MemoryView {
    const source = assertion.evidenceIds.map((id) => this.repo.evidence(handle, id)).find(Boolean);
    return {
      id: assertion.id,
      text: assertion.text,
      quote: source?.text || '旧记录：原文尚未核实',
      createdAt: assertion.temporal.recordedFrom,
      status: assertion.status,
      kind: assertion.kind,
      revision: assertion.revision,
      verification: assertion.verification,
      conditions: canonical(assertion.conditions),
      validFrom: assertion.temporal.validFrom,
      validTo: assertion.temporal.validTo,
      evidenceIds: assertion.evidenceIds,
    };
  }
  views() {
    const handle = this.policy.hostScope();
    return this.repo
      .assertions(handle, {
        statuses: ['active', 'candidate', 'disputed', 'inactive', 'expired'],
        limit: 500,
      })
      .map((a) => this.view(handle, a));
  }
  deactivate(id: string) {
    const scope = this.policy.hostScope(),
      old = this.repo.assertion(scope, id);
    if (!old) return;
    const citations = this.repo.assertionCitations(scope, old.id);
    this.repo.write(() => {
      this.repo.saveAssertion(
        scope,
        { ...old, status: 'inactive', revision: old.revision + 1 },
        old.revision,
      );
      this.repo.restrictCitationOrigins(scope, citations.filter(citation => citation.role !== 'authorization'), old.predicate, 'DEACTIVATE', null, this.repo.clock.now());
      this.repo.invalidate(id, 'understanding_deactivated');
      this.repo.setMeta('policy_revision', this.repo.policyRevision + 1);
    });
    this.policy.signalBarrier();
  }
  forget(ids: string[], sourceIds: string[] = [], controlSpans: { eventId: string; contentVersion: number; start: number; end: number }[] = [], conversationDeletion?: Pick<PrivacyFence, 'preservedLocalAgenda' | 'deletedConversationIds'>) {
    const scope = this.policy.hostScope();
    for (const id of ids)
      if (
        !this.repo.hasFence(id) &&
        !this.repo.db.prepare(`SELECT 1 FROM h_assertions WHERE id=? AND owner=? AND workspace=?
          UNION ALL SELECT 1 FROM h_work WHERE id=? AND owner=? AND workspace=?`)
          .get(id, this.repo.identity.principalId, this.repo.identity.workspaceId, id, this.repo.identity.principalId, this.repo.identity.workspaceId) &&
        !this.repo.evidence(scope, id) && !this.repo.assistantHistory(scope, { id, limit: 1 }).some(message => message.id === id)
      )
        throw new HarnessError('target_missing', '请选择明确的现有内容来删除。');
    const currentLocators = ids
      .flatMap((id) =>
        this.repo.db
          .prepare(
            'SELECT event_id,content_version AS version,start_cp,end_cp FROM h_assertion_citations WHERE assertion_id=?',
          )
          .all(id).map(row => ({ assertionId: id, event_id: row.event_id, version: row.version,
            start_cp: row.start_cp, end_cp: row.end_cp })),
      );
    const spans = currentLocators
      .filter((row) => row.version !== null && row.start_cp !== null && row.end_cp !== null)
      .map((row) => ({
        eventId: String(row.event_id),
        contentVersion: Number(row.version),
        start: Number(row.start_cp),
        end: Number(row.end_cp),
      }));
    const erasure = this.repo.sourceErasure([...spans, ...controlSpans], currentLocators
      .filter(locator => locator.version === null || locator.start_cp === null || locator.end_cp === null).map(locator => String(locator.event_id)));
    // Whole conversation deletion keeps its explicitly selected source scope;
    // forgetting a fact traces only that fact's origin and its known copies.
    const deletedSources = new Set([...sourceIds, ...erasure.sourceIds]);
    const intentOnly = ids.length > 0 && !sourceIds.length && !controlSpans.length && ids.every(id =>
      this.repo.db.prepare("SELECT 1 FROM h_work WHERE id=? AND owner=? AND workspace=? AND json_extract(payload,'$.data.type')='planning_intent' AND json_type(payload,'$.sourceBinding')='object'")
        .get(id, this.repo.identity.principalId, this.repo.identity.workspaceId));
    const fence = this.repo.establishFence({ kind: 'delete', objectIds: ids, sourceIds: [...deletedSources], spans: erasure.spans,
      // Removing a nonexecuting intention leaves separately accepted business
      // records intact. Ordinary fact/source erasure keeps its deletion contract.
      ...(intentOnly ? { preservedLocalAgenda: this.repo.confirmedAgendaReferences() } : {}), ...conversationDeletion });
    this.policy.signalBarrier();
    this.repo.cleanupFence(fence);
    this.repo.checkpointPrivacy();
    return {
      epoch: fence.epoch,
      deletedObjectIds: ids,
      sourceIds: [...deletedSources],
      backupBarrier: true,
      externalCopiesRetracted: false,
    };
  }
  migrateLegacy() {
    if (this.repo.getMeta('legacy_migrated', false)) return;
    const db = this.repo.db,
      host = this.policy.hostScope();
    this.repo.write(() => {
      for (const row of db
        .prepare("SELECT * FROM messages WHERE role='user' ORDER BY created_at,rowid")
        .all()) {
        const mid = String(row.id),
          scope = this.policy.hostScope({ currentEventIds: [mid] });
        const text = String(row.content);
        if (/不保存|仅本轮/.test(text)) continue;
        this.repo.ingest(scope, {
          id: mid,
          ownerId: this.repo.identity.principalId,
          workspaceId: this.repo.identity.workspaceId,
          subjectId: this.repo.identity.principalId,
          worldId: 'real',
          sourceId: 'history:self',
          contentVersion: 1,
          text,
          speaker: 'user',
          kind: 'user_message',
          authority: 'user_statement',
          roots: [mid],
          label: { ...personalLabel, infer: false, retention: 'history_no_inference' },
          receivedAt: String(row.created_at),
          status: 'active',
        });
        this.repo.indexEvidence(scope, mid);
      }
      for (const row of db.prepare('SELECT * FROM memories ORDER BY created_at').all()) {
        const text = String(row.text),
          quote = String(row.quote),
          id = String(row.id),
          created = Number.isFinite(Date.parse(String(row.created_at)))
            ? new Date(String(row.created_at)).toISOString()
            : this.repo.clock.now();
        const source = this.repo.searchEvidence(host, quote, 2).find((e) => e.text.includes(quote));
        const assertion: Assertion = {
          id,
          ownerId: this.repo.identity.principalId,
          workspaceId: this.repo.identity.workspaceId,
          subjectId: this.repo.identity.principalId,
          worldId: 'real',
          revision: 1,
          predicate: 'legacy.preference',
          value: { type: 'text', value: text },
          text,
          kind: 'legacy_unverified',
          strength: 'unconfirmed',
          conditions: always,
          exceptionIds: [],
          temporal: { precision: 'unresolved', recordedFrom: created },
          status: 'candidate',
          evidenceIds: source ? [source.id] : [],
          label: { ...personalLabel },
          verification: source ? 'pending' : 'unverified',
        };
        this.repo.saveAssertion(
          host,
          assertion,
          undefined,
          source ? [{ eventId: source.id, ...locateQuote(source.text, quote) }] : [],
        );
      }
      this.repo.setMeta('legacy_migrated', true);
      this.repo.db
        .prepare('INSERT OR IGNORE INTO h_migrations VALUES(?,?,?,?)')
        .run(
          'legacy-memory-v1',
          1,
          this.repo.clock.now(),
          JSON.stringify({ summary: 'derived_not_evidence', obligations: 'not_commitments' }),
        );
    });
  }
}
