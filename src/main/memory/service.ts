import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Assertion, EvidenceEvent, MemoryChange, MemoryView, ScopeHandle } from '../../shared/harness';
import { always, changeSchema, HarnessError, personalLabel } from '../../shared/harness';
import type { KernelRepository, PrivacyFence } from '../storage/repository';
import type { IngressDecision, PolicyKernel } from '../runtime/policy';
import { canonical, codePointSlice, locateQuote } from '../runtime/semantics';
import { hasCredentials } from '../runtime/redaction';

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
  /** Required only for a host-bound current owner projection; never a global grant. */
  authorizesOwnerProjection?: boolean;
}
export const currentOwnerChangeSchema = changeSchema.omit({ targetId: true, expectedRevision: true, unresolvedTime: true }).extend({
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
  /** Host-only plan for the same review; raw mixed source remains non-inferable. */
  currentOwnerProjection?: {
    parentEventId: string; parentContentVersion: number; parentSubject: 'mixed'; parentWorld: 'real'; proposedEvidenceId: string;
    statement: { quote: string; start: number; end: number };
    recordingRequest: { quote: string; start: number; end: number };
  };
  /** Host-resolved exact target only, never caller/model asserted ownership. */
  existingAssertion?: {
    id: string; revision: number; subjectId: string; worldId: string; predicate: string;
    kind: Assertion['kind']; strength: Assertion['strength']; status: Assertion['status']; text: string;
    conditions: Assertion['conditions']; temporal: Assertion['temporal'];
    sourceQuotes: { eventId: string; contentVersion: number; quote: string; start: number; end: number }[];
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
    receivedAt?: string;
    textLength?: number;
    coverage?: 'complete' | 'excerpt';
  }>;
  anchors?: Array<{
    id: string;
    kind: 'assertion' | 'work' | 'entity' | 'frame';
    text: string;
    predicate?: string;
    conditions?: unknown;
    status?: string;
  }>;
  conditions?: Array<{ id: string; text: string; sourceId?: string }>;
  current?: {
    eventId: string;
    focusText: string;
    sourceExcerpt: string;
    tailText?: string;
    tailStart?: number;
    textLength: number;
  };
}
export interface ExtractionSpan {
  id: string;
  start: number;
  end: number;
  text: string;
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
  paused = false;
  constructor(
    readonly repo: KernelRepository,
    readonly policy: PolicyKernel,
  ) {}
  private clip(value: string, max = 600) {
    const text = value.trim();
    if (Array.from(text).length <= max) return text;
    return codePointSlice(text, 0, max) + '…';
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
    const prior = event.sessionId
      ? this.repo
          .sessionEvidence(handle, event.sessionId, 8)
          .filter((candidate) => candidate.id !== event.id && candidate.status === 'active')
          .slice(0, 6)
          .map((candidate) => ({
            id: candidate.id,
            speaker: candidate.speaker,
            text: this.clip(candidate.text, 420),
            subjectId: candidate.subjectId,
            worldId: candidate.worldId,
            authority: candidate.authority,
            receivedAt: candidate.receivedAt,
          }))
      : [];
    const priorEvents = [
      ...(supplied?.priorEvents || [])
        .filter(
          (candidate) =>
            (!candidate.subjectId || candidate.subjectId === event.subjectId) &&
            (!candidate.worldId || candidate.worldId === event.worldId),
        )
        .slice(0, 6)
        .map((candidate) => ({
          ...candidate,
          text: this.clip(candidate.text, 420),
        })),
      ...prior,
    ].filter((candidate, index, all) => all.findIndex((item) => item.id === candidate.id) === index);

    const assertions = this.repo
      .lexicalAssertions(handle, this.clip(event.text, 6000), 12)
      .filter((assertion) => assertion.status === 'active')
      .slice(0, 8);
    const assertionAnchors = assertions.map((assertion) => ({
      id: assertion.id,
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
      ...(supplied?.anchors || []).slice(0, 8).map((anchor) => ({ ...anchor, text: this.clip(anchor.text, 260) })),
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
      priorEvents,
      anchors,
      conditions,
      ...(supplied?.current ? { current: supplied.current } : {}),
    };
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
      throw new HarnessError('missing_unit', '数值必须保留单位。');
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
      parentEventId: parent.id, parentContentVersion: parent.contentVersion, parentSubject: 'mixed', parentWorld: 'real',
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
      const assertion = this.commitVerified(scope, change, evidence, status, this.repo.epoch);
      this.repo.markSpans(scope, evidence.id, 'candidate_emitted');
      this.repo.indexEvidence(scope, evidence.id);
      this.repo.markSpans(handle, parent.id, 'quote_or_hypothesis');
      this.repo.completeOperation(operationKey, 'ADD_CURRENT_OWNER', { id: assertion.id, requestHash, projectionId });
      return assertion;
    });
  }
  private validateCandidateSource(handle: ScopeHandle, event: EvidenceEvent, predicate: string) {
    const current = this.repo.evidence(handle, event.id);
    if (!current || current.status !== 'active')
      throw new HarnessError('source_suppressed', '原始来源已不可用，不能恢复旧理解。');
    if (canonical(current) !== canonical(event))
      throw new HarnessError('source_version_conflict', '审核期间原文或适用范围发生变化，请重读来源。');
    if ([current.id, ...current.roots].some(id =>
      this.repo.db.prepare("SELECT 1 FROM h_source_restrictions WHERE event_id=? AND predicate IN (?, '*')").get(id, predicate)
      || this.repo.db.prepare("SELECT 1 FROM h_source_restrictions x JOIN h_evidence_roots r ON r.event_id=x.event_id WHERE r.root_id=? AND x.predicate IN (?, '*') LIMIT 1").get(id, predicate)))
      throw new HarnessError('source_suppressed', '这个旧来源的相关理解已停止使用，不能重新提取。');
  }
  async propose(
    handle: ScopeHandle,
    raw: unknown,
    signal: AbortSignal = new AbortController().signal,
    options: { trustedControl?: boolean; review?: SemanticReview; reviewContext?: MemoryContext } = {},
  ): Promise<Assertion> {
    const epoch = this.repo.epoch;
    let change = changeSchema.parse(raw);
    try {
      const scope = this.policy.require(handle, 'memory:write');
      const duplicate = this.repo.operation<{ id: string }>('memory:' + change.idempotencyKey);
      if (duplicate) {
        const prior = this.repo.assertion(handle, duplicate.id);
        if (prior) return prior;
      }
      if (!scope.infer || scope.retention !== 'purpose_scoped')
        throw new HarnessError('inference_forbidden', '这段内容不用于长期记忆。');
      const event = this.repo.evidence(handle, change.eventId);
      if (!event) throw new HarnessError('evidence_forbidden', '找不到有权使用的原始证据。');
      this.validateCandidateSource(handle, event, change.predicate);
      const location = locateQuote(event.text, change.sourceQuote);
      if (codePointSlice(event.text, location.start, location.end) !== change.sourceQuote)
        throw new HarnessError('locator_mismatch', '原文定位核验失败。');
      if (change.operation !== 'ADD' && !change.targetId) {
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
      const oldTarget = change.targetId ? this.repo.assertion(handle, change.targetId) : undefined;
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
      const { existingAssertion: _untrustedTarget, proposedRetirement: _untrustedRetirement, currentOwnerProjection: _untrustedProjection, ...providedContext } = options.reviewContext || {};
      const reviewContext: MemoryContext = { ...providedContext };
      if (oldTarget) {
        const sourceQuotes = this.repo.db.prepare('SELECT event_id,start_cp,end_cp FROM h_assertion_evidence WHERE assertion_id=? ORDER BY rowid DESC LIMIT 1')
          .all(oldTarget.id).flatMap(row => {
            if (row.start_cp === null || row.end_cp === null) return [];
            const source = this.repo.evidence(handle, String(row.event_id));
            if (!source) return [];
            const start = Number(row.start_cp), end = Number(row.end_cp);
            return [{ eventId: source.id, contentVersion: source.contentVersion, quote: codePointSlice(source.text, start, end), start, end }];
          });
        reviewContext.existingAssertion = { id: oldTarget.id, revision: oldTarget.revision, subjectId: oldTarget.subjectId, worldId: oldTarget.worldId,
          predicate: oldTarget.predicate, kind: oldTarget.kind, strength: oldTarget.strength, status: oldTarget.status, text: oldTarget.text,
          conditions: oldTarget.conditions, temporal: oldTarget.temporal, sourceQuotes };
        if (retirement) reviewContext.proposedRetirement = retirement;
      }
      if (!options.trustedControl && !review && this.reviewer)
        review = await this.reviewer(change, event, signal, reviewContext);
      signal.throwIfAborted();
      this.policy.validate(handle);
      if (change.operation === 'SUPPORT' && !options.trustedControl && review?.retention !== 'allowed')
        throw new HarnessError('support_unverified', '新增来源的长期用途未核实，没有把它附为有效支持。');
      const existingTarget = !!change.targetId && !!this.repo.assertion(handle, change.targetId);
      const status = this.semanticGate(change, event, review, options.trustedControl, existingTarget);
      if (scope.privacyEpoch !== epoch)
        throw new HarnessError('stale_scope', '资料范围已改变，候选不再提交。');
      return this.commitVerified(handle, change, event, status, epoch);
    } catch (error) {
      const code = error instanceof HarnessError ? error.code : 'invalid_candidate';
      if (code !== 'memory_not_needed') this.rejected.push({ eventId: change.eventId, code });
      if (code === 'stale_scope') {
        this.staleCommits.push({ eventId: change.eventId, epoch });
      }
      throw error;
    }
  }
  private commitVerified(
    handle: ScopeHandle,
    change: MemoryChange,
    event: EvidenceEvent,
    status: 'active' | 'candidate',
    epoch: number,
  ): Assertion {
    const scope = this.policy.require(handle, 'memory:write'),
      location = locateQuote(event.text, change.sourceQuote);
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
      evidenceIds: [event.id],
      label: { ...event.label },
      verification: status === 'active' ? 'verified' : 'pending',
    };
    // Full supporting sentence survives into context even when display text is shorter.
    if (
      /但是|但|如果|除非|只有|仅|不|没|单位|因为/.test(change.sourceQuote) &&
      !assertion.text.includes(change.sourceQuote)
    )
      assertion.text = change.sourceQuote;
    this.repo.write(() => {
      this.policy.validate(handle);
      // Review is asynchronous. A correction may have stopped this source
      // without changing the privacy epoch or this proposal's target revision.
      this.validateCandidateSource(handle, event, change.predicate);
      if (change.operation === 'SUPPORT' && old) {
        const roots = new Set(old.evidenceIds.flatMap((id) => this.repo.evidence(handle, id)?.roots || []));
        if (event.roots.every((r) => roots.has(r))) {
          this.repo.completeOperation('memory:' + change.idempotencyKey, 'SUPPORT', { id: old.id });
          assertion = old;
          return;
        }
        assertion = {
          ...old,
          revision: old.revision + 1,
          evidenceIds: [...new Set([...old.evidenceIds, event.id])],
        };
      }
      if (change.operation === 'ADD_EXCEPTION' && old) {
        assertion.id = randomUUID();
        assertion.revision = 1;
        this.repo.saveAssertion(handle, assertion, undefined, [{ eventId: event.id, ...location }]);
        this.repo.saveAssertion(
          handle,
          { ...old, revision: old.revision + 1, exceptionIds: [...old.exceptionIds, assertion.id] },
          old.revision,
        );
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
        assertion.id = randomUUID();
        assertion.revision = 1;
        this.repo.saveAssertion(handle, assertion, undefined, [{ eventId: event.id, ...location }]);
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
        this.repo.saveAssertion(handle, assertion, old?.revision, [{ eventId: event.id, ...location }]);
      }
      if (old) {
        if (['CORRECT', 'RETRACT', 'EXPIRE', 'REFINE', 'SUPERSEDE'].includes(change.operation))
          for (const oldEvent of old.evidenceIds)
            if (oldEvent !== event.id)
              this.repo.db
                .prepare('INSERT OR REPLACE INTO h_source_restrictions VALUES(?,?,?,?)')
                .run(oldEvent, old.predicate, change.operation, event.id);
        this.repo.invalidate(old.id, 'understanding_' + change.operation.toLowerCase());
      }
      this.repo.completeOperation('memory:' + change.idempotencyKey, change.operation, { id: assertion.id });
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
    return assertion;
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
    if (!event.label.infer || event.speaker !== 'user' || event.status !== 'active') {
      this.repo.markSpans(handle, eventId, 'quote_or_hypothesis');
      return;
    }
    if (!this.extractor) return; // Explicit pending coverage remains visible; no guessed success.
    const workerBase = this.workerContext(handle, event, suppliedContext);
    for (const span of this.repo
      .spans(handle, eventId)
      // A failed span is an explicit terminal marker for this drain.  A later
      // user action or recovery job may requeue it deliberately; do not create
      // an implicit retry loop merely because the worker runs again.
      .filter((s) => ['pending', 'needs_context'].includes(s.status))) {
      signal.throwIfAborted();
      try {
        const focusText = codePointSlice(event.text, span.start, span.end),
          text = codePointSlice(
          event.text,
          Math.max(0, span.start - 300),
          Math.min(Array.from(event.text).length, span.end + 300),
          ),
          eventLength = Array.from(event.text).length,
          tailStart = Math.max(0, eventLength - 1200),
          context: MemoryContext = {
            ...workerBase,
            current: {
              eventId: event.id,
              focusText: this.clip(focusText, 2200),
              sourceExcerpt: this.clip(text, 2600),
              // Only the final span receives the protected suffix. This
              // avoids attributing a tail constraint to every earlier chunk.
              ...(span.end >= tailStart
                ? { tailText: codePointSlice(event.text, tailStart, eventLength), tailStart }
                : {}),
              textLength: eventLength,
            },
          };

        const extracted = await this.extractor(
          event,
          { id: span.id, start: span.start, end: span.end, text, context },
          signal,
        );
        if (extracted.formatRepair === 'recovered')
          this.extractionDiagnostics.push({
            eventId: event.id,
            spanId: span.id,
            status: 'format_repaired',
            attempts: 2,
          });
        this.policy.validate(handle);
        let failed = false, retained = 0, originalOnly = 0;
        for (const proposal of extracted.changes) {
          try {
            await this.propose(handle, { ...proposal, eventId: event.id }, signal, { reviewContext: context });
            retained++;
          } catch (error) {
            if (signal.aborted || (error instanceof HarnessError && error.code === 'stale_scope'))
              throw error;
            if (error instanceof HarnessError && error.code === 'memory_not_needed') { originalOnly++; continue; }
            failed = true;
          }
        }
        this.repo.markSpans(handle, eventId, failed ? 'needs_context' : originalOnly && !retained ? 'no_personal_fact' : extracted.status, [span.id]);
      } catch (error) {
        if (signal.aborted) throw error;
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
    this.repo.write(() => {
      this.repo.saveAssertion(
        scope,
        { ...old, status: 'inactive', revision: old.revision + 1 },
        old.revision,
      );
      for (const source of old.evidenceIds)
        this.repo.db
          .prepare('INSERT OR REPLACE INTO h_source_restrictions VALUES(?,?,?,NULL)')
          .run(source, old.predicate, 'DEACTIVATE');
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
        !this.repo.assertion(scope, id) &&
        !this.repo.evidence(scope, id) &&
        !this.repo.work(scope).some((w) => w.id === id)
      )
        throw new HarnessError('target_missing', '请选择明确的现有内容来删除。');
    const spans = ids
      .flatMap((id) =>
        this.repo.db
          .prepare(
            'SELECT ae.event_id,e.version,ae.start_cp,ae.end_cp FROM h_assertion_evidence ae JOIN h_evidence e ON e.id=ae.event_id WHERE assertion_id=?',
          )
          .all(id),
      )
      .filter((row) => row.start_cp !== null && row.end_cp !== null)
      .map((row) => ({
        eventId: String(row.event_id),
        contentVersion: Number(row.version),
        start: Number(row.start_cp),
        end: Number(row.end_cp),
      }));
    for (const span of [...spans]) {
      const row = this.repo.db.prepare('SELECT payload FROM h_evidence WHERE id=?').get(span.eventId),
        event = row ? (JSON.parse(String(row.payload)) as EvidenceEvent) : undefined;
      if (event?.locator?.kind === 'text' && event.parentEventId)
        spans.push({
          eventId: event.parentEventId,
          contentVersion: event.locator.contentVersion,
          start: event.locator.startCodePoint + span.start,
          end: Math.min(event.locator.startCodePoint + span.end, event.locator.endCodePoint),
        });
    }
    const fence = this.repo.establishFence({ kind: 'delete', objectIds: ids, sourceIds, spans: [...spans, ...controlSpans], ...conversationDeletion });
    this.policy.signalBarrier();
    this.repo.cleanupFence(fence);
    this.repo.checkpointPrivacy();
    return {
      epoch: fence.epoch,
      deletedObjectIds: ids,
      sourceIds,
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
