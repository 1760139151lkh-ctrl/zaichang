import { createHash, randomUUID } from 'node:crypto';
import { sourceContextGuidance } from '../../shared/source-context';
import type { ScopeHandle } from '../../shared/harness';
import type {
  Assertion,
  AssistantWorkSource,
  InteractiveProgramSource,
  InitialContextComposition,
  ContextContract,
  ContextPack,
  EvidenceBundle,
  EvidenceEvent,
  Need,
  NeedResult,
  PlanningMaterialProvenance,
  TypedValue,
  WorkRecord,
  WorkSourceBinding,
  WorkSourceRef,
  CampusReadingAddress,
  CampusSavedReadingProof,
  CampusReadingSelector,
  ReleaseSource,
  MemoryReferenceContext,
  MaterialNavigationProof,
} from '../../shared/harness';
import { always, HarnessError, interactiveProgramSourceSchema, planningMaterialProvenanceSchema } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel, IngressDecision } from './policy';
import type { CapabilityBroker, CapabilityResult } from '../capabilities/broker';
import type { DomainService } from '../storage/domains';
import type { WorkService } from './work';
import { canonical, dateInZone, dayBounds, evaluateCondition } from './semantics';
import { redactCredentials } from './redaction';
import type { ModelWireMessage, ProviderMetadata } from '../provider';
import { protocolBodyFingerprint, validatedProtocolCoverage, type ProtocolHistoryCoverage } from './protocol-history-coverage';
import type { ProviderReceipt } from '../../shared/harness';
import { usageCost } from './model-usage';
import type { Completion } from '../provider';
import { projectMapModelResult } from './map-model-view';
import { projectCampusModelResult } from './campus-model-view';
import { expandRecallBundle, fuseRecallMethods, matchesVisibleQuery, multiQueryRecall, projectHistoricalEvidence, recallQueries, type EvidenceProjection, type RecallOptions } from '../memory/retrieval';
import { buildContinuityIndex } from './continuity';
import { EvidenceBrowser } from '../memory/browse';
import { mergeProvidedObjectVersions } from './evidence-images';
import type { InvestigationFrontierService, InvestigationSession } from './investigation-frontier';
import type { SemanticRecallService, SemanticRecallResult } from '../memory/semantic-recall';
import type { PersonalMethodSources } from '../../shared/personal-method';
import type { CampusSensitiveRead } from '../../shared/campus-academic';
import type { NoteSourceProof } from '../../shared/notes-source';
import { workoutObservationSources, workoutSourceProofSchema, type WorkoutSourceProof } from '../../shared/workout-source';
import { spatialSourceProofSchema, type SpatialSourceProof } from '../../shared/spatial-source';
import type { CampusSnapshotProof } from '../capabilities/campus-saved-source';
import { campusQueryOnSnapshot, campusQueryContinuation, campusQueryGrants, majorGpaFields, majorGpaPointer, validateCampusQuery } from '../capabilities/campus-query';
import type { MaterialReadNavigation } from '../materials/service';

export interface LifeContinuityContext {
  data: Record<string, unknown>;
  records: WorkRecord[];
  bindings: WorkSourceBinding[];
  learningProcessVersions?: { id: string; revision: number }[];
}
/** Scheduling only: supplied by the current foreground host's typed work
 * reference. It grants no source read and is not a model/Bridge parameter. */
export interface InitialContextOptions {
  currentWorkFirst?: true;
  /** Typed foreground navigation only; a match is selected exclusively from
   * the existing permitted, completed history window. This grants no read. */
  currentProgramMessageId?: string;
}

const SEMANTIC_LOCAL_WORK_BYTES = 4_000_000;

function grams(text: string) {
  const p = Array.from(text.toLowerCase()),
    out = new Set<string>();
  for (let i = 0; i < p.length - 1; i++)
    if (!/[\s，。！？、；：]/.test(p[i] + p[i + 1])) out.add(p[i] + p[i + 1]);
  return out;
}
function lexical(query: string, text: string) {
  const a = grams(query),
    b = grams(text);
  let score = 0;
  for (const g of a) if (b.has(g)) score++;
  return score;
}
export class ContextCompiler {
  private readonly evidenceBrowser = new EvidenceBrowser();
  // Addresses and opaque identity proofs only. The original bodies remain
  // with their existing owner and the run's ordinary delivered observations.
  private readonly providedEvidenceReads = new WeakMap<ContextPack, Map<string, {
    binding: string; ranges: (WorkSourceRef & { sourceSha256: string })[];
    restrictions: ReturnType<KernelRepository['sourceRestrictionSnapshot']>;
  }>>();
  private providerMetadata?: ProviderMetadata;
  private workSourceOwner?: (handle: ScopeHandle, record: Pick<WorkRecord, 'id' | 'revision' | 'sourceBinding'>) => {
    sourceBinding: WorkSourceBinding; sourceMaterial?: import('../../shared/method-work-help').MethodHelpMaterialIdentity;
    noteSources?: NoteSourceProof[]; problemIdentitySha256?: string;
  } | undefined;
  private continuityRefresh?: () => void;
  private lifeContinuity?: (ingress: IngressDecision, sessionId: string, signal: AbortSignal) => Promise<LifeContinuityContext | undefined>;
  private campusReadingOwner?: { capture: (proof: CampusSnapshotProof) => CampusSavedReadingProof | undefined;
    state: (proof: CampusSavedReadingProof) => 'same_saved_head' | 'historical_snapshot' | 'unavailable';
    resource: (domain: string) => string | undefined };
  private materialReadingOwner?: (scope: ScopeHandle, read: unknown, sessionId: string) => MaterialReadNavigation | undefined;
  constructor(
    readonly repo: KernelRepository,
    readonly policy: PolicyKernel,
    readonly broker: CapabilityBroker,
    readonly domains: DomainService,
    readonly work: WorkService,
    readonly semanticRecall?: SemanticRecallService,
  ) {}
  /** Bind only non-secret protocol facts; payloads and credentials never enter the receipt. */
  setProviderMetadata(metadata?: ProviderMetadata) {
    this.providerMetadata = metadata
  }
  setContinuityRefresh(refresh: () => void) {
    this.continuityRefresh = refresh;
  }
  setLifeContinuity(provider: NonNullable<ContextCompiler['lifeContinuity']>) {
    this.lifeContinuity = provider;
  }
  setCampusReadingOwner(owner: NonNullable<ContextCompiler['campusReadingOwner']>) { this.campusReadingOwner = owner; }
  setMaterialReadingOwner(owner: NonNullable<ContextCompiler['materialReadingOwner']>) { this.materialReadingOwner = owner; }
  setWorkSourceOwner(owner: NonNullable<ContextCompiler['workSourceOwner']>) { this.workSourceOwner = owner; }
  recordMaterialNavigationSources(pack: ContextPack | undefined, sources: MaterialNavigationProof[]) {
    if (!pack || !sources.length) return;
    if (!this.repo.materialNavigationSourcesReadable(pack.contract.scope, sources))
      throw new HarnessError('material_navigation_changed', '原材料地址的一处来由已改变，需要回到当前原件再确认。');
    pack.receipt.materialNavigationSources = [...new Map([...(pack.receipt.materialNavigationSources || []), ...sources]
      .map(source => [canonical(source), structuredClone(source)])).values()];
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...sources.map(source => source.sourceEventId)])];
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'history:self', ...sources.map(source => 'file:' + source.sourceEventId)])];
    this.recordObjects(pack, sources.map(source => ({ id: source.sourceEventId, revision: source.sourceContentVersion })), 'evidence');
    // Source dependencies only; no document read, pixel request or exact
    // original-body range is recorded by a navigation projection.
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Address metadata only. Its purpose is qualified by the caller; neither a
   * prior host access nor this projection supplies a document body or pixels. */
  restoreMaterialReading(pack: ContextPack, readScope: ScopeHandle, sessionId: string, messageIds?: string[]) {
    if (!this.materialReadingOwner) return;
    const candidates = this.repo.conversationMaterialReadCandidates(readScope, sessionId, { messageIds,
      excludeIds: pack.evidence.map(event => event.id), limit: messageIds ? 6 : 1 });
    type Item = MaterialReadNavigation & { messageId: string; receiptId: string; messageCreatedAt: string; messageOrdinal: number;
      sessionId: string; replyState?: MemoryReferenceContext['replyState'] };
    const items: Item[] = [];
    for (const candidate of candidates) for (const read of candidate.reads) {
      const navigation = this.materialReadingOwner(readScope, read, sessionId);
      if (!navigation) continue;
      items.push({ ...navigation, messageId: candidate.messageId, receiptId: candidate.receiptId, messageCreatedAt: candidate.messageCreatedAt,
        messageOrdinal: candidate.messageOrdinal, sessionId, ...(candidate.replyState ? { replyState: candidate.replyState } : {}) });
    }
    if (!items.length) return;
    this.recordMaterialNavigationSources(pack, items.map(item => ({ messageId: item.messageId, sessionId,
      receiptId: item.receiptId, accessSha256: item.accessSha256, resourceId: item.resourceId,
      sha256: item.source.sha256, version: item.source.version, sourceEventId: item.source.sourceEventId,
      sourceContentVersion: item.source.contentVersion, parentEventId: item.source.parentEventId, metadataOnly: true })));
    const prior = pack.data.materialReading as { items?: Item[] } | undefined;
    const combined = [...new Map([...(prior?.items || []), ...items].map(item => [canonical({
      messageId: item.messageId, resourceId: item.resourceId, source: item.source, priorAccess: item.priorAccess,
    }), item])).values()];
    const latest = combined.reduce((last, item) => item.messageOrdinal > last.messageOrdinal ? item : last);
    const latestItems = combined.filter(item => item.messageId === latest.messageId);
    const orderKnown = latestItems.every(item => Number.isSafeInteger(item.priorAccess.readOrdinal))
      && new Set(latestItems.map(item => item.priorAccess.readOrdinal)).size === latestItems.length;
    const mostRecent = orderKnown ? latestItems.reduce((last, item) => item.priorAccess.readOrdinal! > last.priorAccess.readOrdinal! ? item : last) : undefined;
    const value = { items: combined, latestReplyWithAccess: { messageId: latest.messageId,
      messageCreatedAt: latest.messageCreatedAt, accessOrder: orderKnown ? 'recorded' : 'unknown' },
      ...(mostRecent ? { mostRecentAccess: { resourceId: mostRecent.resourceId, source: mostRecent.source,
        priorAccess: mostRecent.priorAccess } } : {}),
      meaning: '找回了这段对话所用材料的原地址与旧位置，正文和页面图可沿各自入口打开。先看看最近那条回复是在接哪份材料。'
        + (orderKnown ? '那一轮最后查看的位置也已留下，可以从那里接着读。' : '那一轮的查看先后没有记全，停在哪里还不确定，可以结合原回复再接回。') };
    pack.data.materialReading = value;
    const bytes = Buffer.byteLength(canonical({ items }));
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += Math.ceil(bytes / 2.5);
    return value;
  }
  /** These are actual tool reads; no claim that their rows were understood or
   * that a later page has been read. The message remains their source owner. */
  recordCampusReading(pack: ContextPack, result: CapabilityResult, capability: string, input: unknown) {
    if (!this.campusReadingOwner || result.sourceId !== 'campus:zju-account'
      || !['campus.query', 'campus.lookup', 'campus.overview'].includes(capability)) return;
    const data = result.data as Record<string, any> | undefined;
    const request = input as Record<string, unknown> | undefined;
    const singleObject = capability === 'campus.query' && request?.operation === 'read' && request.resource === 'gpa_overall'
      && request.pointer === majorGpaPointer && data?.recordKind === 'major_gpa' && data.pointer === majorGpaPointer
      && data.data && typeof data.data === 'object' && !Array.isArray(data.data) && data.recordRead !== false;
    if (!['fresh', 'partial', 'stale'].includes(result.status)) {
      if (Array.isArray(data?.records) && data.records.length) {
        pack.receipt.campusReadingIncomplete = true;
        this.repo.saveReceipt(pack.contract.scope, pack.receipt);
      }
      return;
    }
    const readOrdinal = Array.isArray(data?.records) || singleObject ? (pack.receipt.campusReadingReadCount || 0) + 1 : undefined;
    if (readOrdinal !== undefined) pack.receipt.campusReadingReadCount = readOrdinal;
    if (!data?.snapshotProof || !Array.isArray(data.records) && !singleObject) {
      if (data?.recordRead === false
        || capability === 'campus.query' && ['resources', 'schema'].includes((input as { operation?: string })?.operation || '')) {
        pack.receipt.campusReadingAddresses ||= [];
        pack.receipt.campusReadingSources ||= [];
      } else pack.receipt.campusReadingIncomplete = true;
      this.repo.saveReceipt(pack.contract.scope, pack.receipt);
      return;
    }
    // A later metadata lookup must not erase an earlier result whose exact
    // source cannot be rechecked. Exact reads below discharge this call only.
    const previousIncomplete = pack.receipt.campusReadingIncomplete;
    pack.receipt.campusReadingIncomplete = true;
    const snapshot = this.campusReadingOwner.capture(data.snapshotProof);
    if (!snapshot) { this.repo.saveReceipt(pack.contract.scope, pack.receipt); return; }
    pack.receipt.campusReadingSources = [...new Map([...(pack.receipt.campusReadingSources || []), snapshot]
      .map(proof => [canonical(proof), proof])).values()];
    try {
      let args = this.broker.validateArguments(capability, input) as Record<string, any>;
      if (args.bundleId && args.bundleId !== snapshot.bundleId) return;
      args = { ...args, bundleId: snapshot.bundleId, expectedSnapshotVersion: snapshot.version, refresh: false };
      if (singleObject) {
        const query = validateCampusQuery(args);
        if (snapshot.resource !== 'gpa_overall' || data.resource !== snapshot.resource || data.bundle_id !== snapshot.bundleId
          || data.offset !== null || data.total_items !== null || data.next_offset !== null
          || data.truncated_for_model === true || data.nested_values_truncated === true
          || canonical(data.selectedFields) !== canonical(query.fields)) return;
        const pinned = campusQueryOnSnapshot(query, data), contract = this.broker.describe(capability)?.capabilityContract;
        if (!pinned || pinned.evaluation.paging !== 'fixed_conditions' || !contract || Buffer.byteLength(canonical(pinned.arguments)) > 16000) return;
        const address: CampusReadingAddress = { sourceId: 'campus:zju-account', snapshot,
          read: { capability: 'campus.query', arguments: pinned.arguments }, object: { kind: 'major_gpa' },
          evaluation: pinned.evaluation, observedAt: this.repo.clock.now(), readOrdinal, contract };
        pack.receipt.campusReadingAddresses = [...(pack.receipt.campusReadingAddresses || [])
          .filter(old => canonical(old.read) !== canonical(address.read)), address].slice(-6);
        if (!previousIncomplete) delete pack.receipt.campusReadingIncomplete;
        return;
      }
      let evaluation: CampusReadingAddress['evaluation'];
      let next: CampusReadingAddress['next'];
      const offset = data.offset, expectedOffset = args.spec?.offset ?? args.offset ?? 0;
      const nextOffset = data.next_offset !== undefined ? data.next_offset : data.nextOffset;
      const total = data.total_matches ?? data.total;
      if (data.truncated_for_model === true || data.nested_values_truncated === true
        || data.records.some((row: unknown) => !row || typeof row !== 'object' || Array.isArray(row))
        || !Number.isSafeInteger(offset) || offset < 0 || offset !== expectedOffset
        || !Number.isSafeInteger(total) || total < offset + data.records.length
        || (nextOffset === null ? total !== offset + data.records.length
          : !data.records.length || !Number.isSafeInteger(nextOffset) || nextOffset !== offset + data.records.length || nextOffset >= total)) return;
      if (capability === 'campus.query') {
        const query = validateCampusQuery(args);
        if (!['quick', 'select', 'read'].includes(query.operation) || (query.resource || query.spec?.resource) !== snapshot.resource) return;
        const pinned = campusQueryOnSnapshot(query, data);
        if (!pinned) return;
        args = pinned.arguments; evaluation = pinned.evaluation;
        const page = campusQueryContinuation(query, data);
        if (page) next = { capability: page.capability, arguments: page.arguments };
      } else {
        if (this.campusReadingOwner.resource(args.domain) !== snapshot.resource) return;
        if (args.domain === 'courses' && Array.isArray(data.recordSelection?.filters))
          args = this.broker.validateArguments(capability, { ...args, filters: data.recordSelection.filters }) as Record<string, any>;
        let fixed = true;
        const interval = data.timeInterval;
        const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
        if (args.at) { if (instant(interval?.from)) args.at = interval.from; else fixed = false; }
        else if (args.window || args.from || args.to) {
          if ((args.window || args.from) && !instant(interval?.from) || (args.window || args.to) && !instant(interval?.to)) fixed = false;
          else { delete args.window; if (instant(interval?.from)) args.from = interval.from; if (instant(interval?.to)) args.to = interval.to; }
        }
        const dynamic = new Set(['ongoing', 'ended', 'minutes_from_now']);
        if ((args.filters || []).some((filter: string) => dynamic.has(filter.split(':')[0].split('.').at(-1)!))
          || typeof args.sort === 'string' && args.sort.split(',').some((part: string) => dynamic.has(part.trim().replace(/^-/, '').split('.').at(-1)!))) fixed = false;
        evaluation = { ...(instant(data.evaluatedAt) ? { at: data.evaluatedAt } : {}), paging: fixed ? 'fixed_conditions' : 'evaluation_dependent',
          dynamicValues: ['schedule', 'exams'].includes(args.domain) && (!args.fields || args.fields.some((field: string) => dynamic.has(field.split('.').at(-1)!))) };
        if (fixed && Number.isSafeInteger(nextOffset) && nextOffset > offset && nextOffset <= 10000)
          next = { capability: 'campus.lookup', arguments: this.broker.validateArguments(capability, { ...args, offset: nextOffset }) as Record<string, unknown> };
      }
      const contract = this.broker.describe(capability)?.capabilityContract;
      if (!contract || Buffer.byteLength(canonical(args)) > 16000) return;
      const address: CampusReadingAddress = { sourceId: 'campus:zju-account', snapshot,
        read: { capability: capability as 'campus.query' | 'campus.lookup', arguments: args }, ...(next ? { next } : {}),
        page: { offset, returned: data.records.length, nextOffset: Number.isSafeInteger(nextOffset) ? nextOffset : null },
        evaluation, observedAt: this.repo.clock.now(), readOrdinal, contract };
      pack.receipt.campusReadingAddresses = [...(pack.receipt.campusReadingAddresses || [])
        .filter(old => canonical(old.read) !== canonical(address.read)), address].slice(-6);
      if (!previousIncomplete) delete pack.receipt.campusReadingIncomplete;
    } catch { /* No exact, validated address is preferable to guessed paging. */ }
    finally { this.repo.saveReceipt(pack.contract.scope, pack.receipt); }
  }
  restoreCampusReading(pack: ContextPack, historyScope: ScopeHandle, sessionId: string, messageIds: string[]) {
    const scope = this.policy.validate(pack.contract.scope);
    if (!this.campusReadingOwner || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
      || !scope.sources.includes('campus:zju-account') || !this.policy.can(pack.contract.scope, 'campus:read')) return;
    const pages: Record<string, unknown>[] = [];
    for (const item of this.repo.conversationCampusReadingAddresses(historyScope, sessionId, messageIds)) {
      try {
        const address = item.address as CampusReadingAddress;
        if (!address || address.sourceId !== 'campus:zju-account' || !address.read || !['campus.query', 'campus.lookup'].includes(address.read.capability)
          || Buffer.byteLength(canonical(address)) > 24000) continue;
        const described = this.broker.describe(address.read.capability);
        if (!described || canonical(described.capabilityContract) !== canonical(address.contract)) continue;
        const args = this.broker.validateArguments(address.read.capability, address.read.arguments) as Record<string, any>;
        const page = address.page, singleObject = address.object?.kind === 'major_gpa';
        if (singleObject) {
          const query = address.read.capability === 'campus.query' ? validateCampusQuery(args) : undefined;
          if (page || address.next || query?.operation !== 'read' || query.resource !== 'gpa_overall' || query.pointer !== majorGpaPointer) continue;
        } else if (!page || address.object || !Number.isSafeInteger(page.offset) || page.offset < 0
          || !Number.isSafeInteger(page.returned) || page.returned < 0
          || (args.spec?.offset ?? args.offset ?? 0) !== page.offset
          || page.nextOffset !== null && (!Number.isSafeInteger(page.nextOffset) || !page.returned || page.nextOffset !== page.offset + page.returned)) continue;
        if ((address.read.capability === 'campus.query' ? args.resource || args.spec?.resource
          : this.campusReadingOwner.resource(args.domain)) !== address.snapshot.resource) continue;
        const grants = campusQueryGrants(validateCampusQuery(address.read.capability === 'campus.query' ? args
          : { operation: 'quick', resource: address.snapshot.resource }));
        if (grants.some(grant => !this.policy.can(pack.contract.scope, grant))) continue;
        const state = this.campusReadingOwner.state(address.snapshot);
        if (state === 'unavailable' || args.bundleId !== address.snapshot.bundleId || args.expectedSnapshotVersion !== address.snapshot.version) continue;
        let next: CampusReadingAddress['next'];
        if (address.next && page && address.evaluation?.paging === 'fixed_conditions' && address.next.capability === address.read.capability) {
          const nextArgs = this.broker.validateArguments(address.next.capability, address.next.arguments) as Record<string, any>;
          const base = (value: Record<string, any>) => ({ ...value, offset: 0, ...(value.spec ? { spec: { ...value.spec, offset: 0 } } : {}) });
          const nextOffset = nextArgs.spec?.offset ?? nextArgs.offset;
          if (nextArgs.bundleId !== address.snapshot.bundleId || nextArgs.expectedSnapshotVersion !== address.snapshot.version
            || !Number.isSafeInteger(nextOffset) || nextOffset !== page.nextOffset || nextOffset !== page.offset + page.returned
            || nextOffset <= page.offset || canonical(base(args)) !== canonical(base(nextArgs))) continue;
          next = { capability: address.next.capability, arguments: nextArgs };
        }
        pages.push({ messageId: item.messageId, messageCreatedAt: item.messageCreatedAt, messageOrdinal: item.messageOrdinal,
          observedAt: address.observedAt, ...(Number.isSafeInteger(address.readOrdinal) && address.readOrdinal! > 0 ? { readOrdinal: address.readOrdinal } : {}),
          sourceId: address.sourceId, snapshot: { bundleId: address.snapshot.bundleId,
          version: address.snapshot.version, state, collectedAt: address.snapshot.collectedAt },
          ...(singleObject ? { object: address.object } : { page: address.page }), evaluation: address.evaluation,
          ...(address.evaluation?.paging === 'fixed_conditions' ? { read: address.read, ...(next ? { next } : {}) } : { status: 'evaluation_dependent',
            meaning: '这份查询会随当时的时间改变筛选或排序，接下去需要按原条件重新查一遍。' }) });
      } catch { /* Old or malformed contracts do not reopen a source. */ }
    }
    if (!pages.length) return;
    const latestReply = pages.reduce((latest, page) => Number(page.messageOrdinal) > Number(latest.messageOrdinal) ? page : latest);
    const latestReads = pages.filter(page => page.messageId === latestReply.messageId);
    const orderKnown = latestReads.every(page => Number.isSafeInteger(page.readOrdinal))
      && new Set(latestReads.map(page => page.readOrdinal)).size === latestReads.length;
    const latest = orderKnown ? latestReads.reduce((last, page) => Number(page.readOrdinal) > Number(last.readOrdinal) ? page : last) : undefined;
    const value = { pages: pages.slice(-6), latestReplyWithReads: { messageId: latestReply.messageId,
      messageOrdinal: latestReply.messageOrdinal, messageCreatedAt: latestReply.messageCreatedAt, withinReplyOrder: orderKnown ? 'recorded' : 'unknown' },
      ...(latest ? { mostRecentRead: { messageId: latest.messageId, readOrdinal: latest.readOrdinal, observedAt: latest.observedAt,
        ...(latest.object ? { object: latest.object } : { page: latest.page }) } } : {}),
      meaning: '找回了前面实际读过的校园资料地址，按原回复先后留下。先接最近那条回复正在谈的内容：read打开当时那页或那份汇总，分页资料有next可继续，单份汇总保留原来选的项目。'
        + (orderKnown ? '最近那一轮最后读取的位置已单独留下；这是此前读到的位置，这轮的正文还要沿地址打开。' : '最近那一轮的逐次先后没有记全，停在哪里还不确定，可以先读原回复确认。') };
    if (canonical(pack.data.campusReading) === canonical(value)) return value;
    pack.data.campusReading = value;
    const bytes = Buffer.byteLength(canonical(value)); pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += Math.ceil(bytes / 2.5);
    return value;
  }
  /** A current-purpose navigation read can find an original owner address
   * without admitting the old sensitive reply or any of its grade values. */
  restoreCampusReadingNavigation(pack: ContextPack, handle: ScopeHandle, sessionId: string, selector: CampusReadingSelector) {
    if (!this.campusReadingOwner) return;
    const candidates = this.repo.conversationCampusReadingNavigation(handle, sessionId, selector);
    const items: Record<string, any>[] = [], sources: CampusSavedReadingProof[] = [];
    for (const candidate of candidates) {
      try {
        const address = candidate.address as CampusReadingAddress;
        if (!address || address.sourceId !== 'campus:zju-account' || address.object?.kind !== 'major_gpa'
          || address.page || address.next || address.read?.capability !== 'campus.query'
          || address.evaluation?.paging !== 'fixed_conditions' || Buffer.byteLength(canonical(address)) > 24000) continue;
        const contract = this.broker.describe('campus.query')?.capabilityContract;
        if (!contract || canonical(contract) !== canonical(address.contract)) continue;
        const args = validateCampusQuery(this.broker.validateArguments('campus.query', address.read.arguments));
        const snapshot: CampusSavedReadingProof = { ...address.snapshot, navigation: candidate.navigation };
        if (args.operation !== 'read' || args.resource !== selector.resource || args.pointer !== majorGpaPointer
          || args.bundleId !== snapshot.bundleId || args.expectedSnapshotVersion !== snapshot.version) continue;
        const state = this.campusReadingOwner.state(snapshot);
        if (state === 'unavailable' || this.repo.verifyCampusReadingProofs?.(handle, [snapshot]) !== true) continue;
        sources.push(snapshot);
        items.push({ messageId: candidate.messageId, messageCreatedAt: candidate.messageCreatedAt,
          messageOrdinal: candidate.messageOrdinal, observedAt: address.observedAt,
          ...(Number.isSafeInteger(address.readOrdinal) ? { readOrdinal: address.readOrdinal } : {}),
          sourceId: address.sourceId, object: address.object, metadataOnly: true,
          snapshot: { bundleId: snapshot.bundleId, version: snapshot.version, state, collectedAt: snapshot.collectedAt },
          availableFields: majorGpaFields,
          read: { capability: 'campus.query', arguments: args } });
      } catch { /* An invalid original address never falls back to latest. */ }
    }
    if (!items.length) return;
    this.recordCampusSourceProofs(pack, sources);
    const orderKnown = items.every(item => Number.isSafeInteger(item.readOrdinal) && item.readOrdinal > 0)
      && new Set(items.map(item => item.readOrdinal)).size === items.length;
    const latest = orderKnown ? items.reduce((last, item) => item.readOrdinal > last.readOrdinal ? item : last) : undefined;
    const reply = items[0];
    const value = { pages: items, metadataOnly: true,
      latestReplyWithReads: { messageId: reply.messageId, messageOrdinal: reply.messageOrdinal,
        messageCreatedAt: reply.messageCreatedAt, withinReplyOrder: orderKnown ? 'recorded' : 'unknown' },
      ...(latest ? { mostRecentRead: { messageId: latest.messageId, readOrdinal: latest.readOrdinal,
        observedAt: latest.observedAt, object: latest.object } } : {}),
      meaning: '找回了这段对话当时用的主修汇总地址和所选项目，具体成绩与旧回复正文仍在原处。沿read打开同一版本，按眼前的问题选择需要的项目即可；这是一份单独汇总。' };
    pack.data.campusReading = value;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'history:self'])];
    pack.receipt.budget.readBytes += Buffer.byteLength(canonical(candidates));
    pack.receipt.budget.estimatedTokens += Math.ceil(Buffer.byteLength(canonical(value)) / 2.5);
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  }
  /** The main model chooses additional evidence; no word list creates needs. */
  initialNeeds(_contract: ContextContract, _text: string): Need[] { return []; }
  async compile(
    ingress: IngressDecision, currentEvents: EvidenceEvent[], signal: AbortSignal,
    additionalNeeds: Need[] = [], acquire = false, sessionId?: string, options: InitialContextOptions = {},
  ): Promise<ContextPack> {
    signal.throwIfAborted();
    const contract = ingress.contract, scope = this.policy.validate(contract.scope);
    const currentWorkFirst = options.currentWorkFirst === true && !scope.child && scope.audience === 'self';
    // A hypothetical continuation can refer to what this same user just said
    // in this thread. Read only that transcript, never their ambient profile,
    // and never override explicit UI/source restrictions.
    const canReadHistory = this.policy.can(contract.scope, 'evidence:read');
    const historyScope = ingress.threadContextAllowed && canReadHistory ? this.policy.hostScope({ sources: ['current', 'history:self'], subjectId: scope.principalId, worldId: 'real', purposes: scope.purposes, audience: 'self', grants: ['evidence:read'], retention: scope.retention, infer: false }) : contract.scope;
    const historyCandidates = sessionId && canReadHistory && (!ingress.requiresReadPurpose || ingress.threadContextAllowed) ? this.repo.conversationHistory(historyScope, sessionId, currentEvents.map(e => e.id), ingress.threadContextAllowed ? 6 : 12) : [];
    // This repository window contains currently readable saved messages;
    // interrupted public prefixes retain their partial/unknown state.
    // Preserve the nearest help and the exact typed origin without
    // guessing relevance or treating a completed reply as a fulfilled promise.
    const assistantHistory = historyCandidates.filter(message => message.role === 'assistant');
    const recentHelp = assistantHistory.at(-1);
    const programOrigin = assistantHistory.find(message => message.id === options.currentProgramMessageId);
    const protectedAssistantIds = new Set([recentHelp?.id, programOrigin?.id].filter((id): id is string => !!id));
    const history = historyCandidates;
    const historyProjection = (provided: typeof history) => {
      const ids = new Set(provided.map(message => message.id));
      const historyIndex = assistantHistory.filter(message => !ids.has(message.id) && !protectedAssistantIds.has(message.id)).map(message => ({ id: message.id, role: message.role, createdAt: message.createdAt,
        codePoints: Array.from(message.content).length, bodyProvided: false,
        ...(message.replyState ? { replyState: message.replyState } : {}),
        read: { tool: 'read_assistant_history', arguments: { id: message.id, offset: 0, limit: 1600 } } }));
      const carryover = new Map<string, { identities: ('recent_assistant_help' | 'current_program_origin')[]; messageId: string;
        bodyProvided: boolean; status: 'provided_complete_reply' | 'provided_partial_reply' | 'not_in_permitted_completed_window';
        read: { tool: 'read_assistant_history'; arguments: { id: string; offset: number; limit: number } } }>();
      for (const [identity, id] of [['recent_assistant_help', recentHelp?.id], ['current_program_origin', options.currentProgramMessageId]] as const) {
        if (!id) continue;
        const prior = carryover.get(id);
        if (prior) { prior.identities.push(identity); continue; }
        const bodyProvided = protectedAssistantIds.has(id) && ids.has(id);
        carryover.set(id, { identities: [identity], messageId: id, bodyProvided,
          status: bodyProvided ? assistantHistory.find(message => message.id === id)?.replyState ? 'provided_partial_reply' : 'provided_complete_reply'
            : 'not_in_permitted_completed_window',
          read: { tool: 'read_assistant_history', arguments: { id, offset: 0, limit: 1600 } } });
      }
      return { historyIndex, historyCarryover: [...carryover.values()],
        historyCoverage: { scope: 'permitted_recent_conversation_window', userBodiesProvided: provided.filter(message => message.role === 'user').length,
          assistantBodiesProvided: provided.filter(message => message.role === 'assistant').length,
          assistantBodiesDeferred: assistantHistory.filter(message => !ids.has(message.id)).length, moreMayExist: true,
          meaning: '这里带着最近这一段对话的原话，更早的助手回复留着地址，可用read_assistant_history接回。事情实际办到哪里，可以沿当时的行动再核对。' } };
    };
    const historyOrganization = currentWorkFirst ? { ...historyProjection(history),
      contextOrganization: { mode: 'current_work_first',
        meaning: '先理解这句话和对方指着的那件作品，其余前情照常可用。' } } : {};
    const recentObservations = sessionId && history.length && canReadHistory && !ingress.requiresReadPurpose && scope.sources.includes('history:self')
      ? this.repo.sessionExternalObservations(contract.scope, sessionId, contract.now) : [];
    const observationSummaries = recentObservations.map(event => ({ id: event.id, sourceId: event.sourceId, authority: event.authority, receivedAt: event.receivedAt, text: event.text,
      meaning: '这里接回了这段对话相关的近期外部观察，每条保留当时看到什么、何时看到和从哪里来。对方后来怎样看、接下来想怎么做，可以接着听他说。' }));
    const currentMatter = sessionId && canReadHistory && !ingress.requiresReadPurpose && contract.enhancements?.currentMatter !== false && scope.sources.includes('work:self') ? this.repo.currentMatter(contract.scope, sessionId) : null;
    const continuity = !ingress.requiresReadPurpose ? buildContinuityIndex(this.repo, contract, sessionId, this.continuityRefresh) : undefined;
    const preparedMaterials = continuity?.preparedMaterials || [], openThreads = continuity?.openThreads || [], planningIntents = continuity?.planningIntents || [];
    const continuityData: Record<string, unknown> = { ...(preparedMaterials.length ? { preparedMaterials } : {}), ...(openThreads.length ? { openThreads } : {}),
      ...(planningIntents.length ? { planningIntents } : {}),
      ...(continuity ? { continuityCoverage: continuity.coverage } : {}) };
    const discovered = this.broker.discover(contract.scope);
    const capabilityDirectory = { items: discovered.slice(0, 24).map(item => ({ name: item.name, sourceId: item.sourceId, displayName: item.displayName,
      effect: item.effect, connected: item.connection.connected })), more: discovered.length > 24,
      browse: { tool: 'look_up', arguments: { source: 'capability', offset: 0, limit: 24 } },
      meaning: '先列出手边的一部分做法，browse可打开完整目录，也能在look_up里按用途找。每项保留来源当前的连接情况；想看具体读法，用它的名称加describeOnly展开，再沿look_up读资料。保存或调整事情沿原行动继续。' };
    const sourceContextMeaning = sourceContextGuidance(...currentEvents.map(event => event.sourceContext), ...history.map(message => message.sourceContext));
    let life: LifeContinuityContext | undefined;
    const initial = { current: ingress.authoredText, attachments: currentEvents.filter(e => e.speaker === 'external'), history, ...historyOrganization, sourceContextMeaning,
      ...(observationSummaries.length ? { recentObservations: observationSummaries } : {}), currentMatter, ...continuityData, capabilityDirectory };
    if (this.lifeContinuity && sessionId && !ingress.requiresReadPurpose && scope.retention === 'purpose_scoped') {
      const offered = await this.lifeContinuity(ingress, sessionId, signal);
      signal.throwIfAborted(); this.policy.validate(contract.scope);
      if (offered) {
        life = offered;
        Object.assign(continuityData, offered.data);
      }
    }
    const text = canonical({ ...initial, ...continuityData });
    const estimatedTokens = Math.ceil(Array.from(text).length / 1.4);
    // The repository physically selected these permitted history bodies.
    // Deferring their model projection does not refund that byte charge.
    const readBytes = Math.max(Buffer.byteLength(text), currentWorkFirst
      ? Buffer.byteLength(canonical({ ...initial, ...continuityData, history: historyCandidates })) : 0);
    const evidenceIds = [...new Set([...currentEvents.map(e => e.id), ...history.filter(m => m.role === 'user').map(m => m.id), ...recentObservations.map(e => e.id), ...(continuity?.providedEvidenceIds || [])])];
    const receipt: ContextPack['receipt'] = {
      mechanismUses: { prefetch: 0, currentMatter: Number(!!currentMatter), repairRejudge: 0, closure: 0 },
      id: randomUUID(), runId: contract.id, contractRevision: contract.revision,
      policyRevision: contract.policyRevision, privacyEpoch: contract.privacyEpoch,
      watermarks: this.repo.watermarks(), providedEvidenceIds: evidenceIds,
      providedSourceIds: [...new Set([...currentEvents.map(e => e.sourceId), ...(history.length ? ['history:self'] : []), ...recentObservations.map(e => e.sourceId), ...(continuity?.providedSourceIds || []), ...(preparedMaterials.length || openThreads.length || planningIntents.length || currentMatter ? ['work:self'] : [])])],
      providedObjectVersions: mergeProvidedObjectVersions([...currentEvents.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })),
        ...history.flatMap(message => message.role === 'user' && Number.isSafeInteger(message.contentVersion) && message.contentVersion! > 0
          ? [{ id: message.id, revision: message.contentVersion!, kind: 'evidence' as const }] : []),
        ...recentObservations.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })), ...(continuity?.providedObjectVersions || []), ...(currentMatter ? [{ id: currentMatter.id, revision: currentMatter.revision, kind: 'work' as const }, ...currentMatter.optionPlaces.map(option => ({ id: option.id, revision: option.revision, kind: 'work' as const }))] : [])],
        ref => ref.kind + ':' + ref.id + (ref.kind === 'evidence' ? ':' + ref.revision : '')),
      needResults: [], excludedReasonCounts: Object.fromEntries(contract.excludedReasons.map(reason => [reason, 1])),
      providerVersion: this.providerMetadata ? `${this.providerMetadata.protocol}/${this.providerMetadata.protocolVersion}` : 'unknown',
      ...(this.providerMetadata ? { provider: { ...this.providerMetadata, limits: { ...this.providerMetadata.limits } } } : {}),
      toolAttempts: [], campusSensitiveReads: [], releaseSources: [], coverage: 'conditional', budget: { estimatedTokens, readBytes },
    };
    const pack: ContextPack = {
      contract, bundles: [], assertions: [], evidence: currentEvents, needs: [], receipt,
      currentText: ingress.authoredText,
      data: {
        scope: { subject: scope.subjectId, world: scope.worldId, purpose: contract.purpose, audience: scope.audience, memoryMode: contract.memoryMode, retention: contract.retention },
        time: { now: contract.now, timeZone: contract.timeZone, localDate: dateInZone(contract.now, contract.timeZone),
          local: new Intl.DateTimeFormat('zh-CN', { timeZone: contract.timeZone, dateStyle: 'full', timeStyle: 'long', hour12: false }).format(new Date(contract.now)),
          meaning: '日期和钟面按所写时区表示，UTC记录与它是同一时刻。' },
        situation: { asOf: contract.now, timeZone: contract.timeZone, versions: this.repo.watermarks(),
          currentStatements: currentEvents.filter(event => event.speaker === 'user').map(event => ({ evidenceId: event.id, version: event.contentVersion })),
          coverage: { calendar: 'not_queried', campus: 'not_queried', location: 'not_queried', weather: 'not_queried', energy: 'unknown' },
          read: '日程、校园、位置、天气这轮还没查，需要哪样可直接查。要把安排、承诺和目标放在一起看，可用situation.read看最多31天；想试一份具体安排可用planning.preview。今天有多少精力，留给对方自己说。' },
        history, ...historyOrganization, ...(observationSummaries.length ? { recentObservations: observationSummaries } : {}), ...(ingress.threadContextAllowed ? { historyUse: '这段对话前面说过的话仍可帮你理解眼前的假设；假设里的事按假设来聊。这次接回的是同一对话，长期画像和其他会话仍在原处。' } : {}), currentSources: currentEvents.map(e => ({ id: e.id, sourceId: e.sourceId, authority: e.authority, text: e.text,
          ...(e.sourceContext ? { sourceContext: e.sourceContext } : {}) })),
        sourceContextMeaning,
        currentMatter, ...continuityData, capabilityDirectory,
        currentFacts: {}, correctionOverlay: [], workState: [], needs: [],
        coverage: receipt.coverage,
        limitations: [],
      },
    };
    if (sessionId) {
      const ids = history.map(message => message.id);
      this.recordWorkSourceBindings(pack, this.repo.conversationWorkSourceBindings(historyScope, sessionId, ids));
      this.recordPlanningProvenance(pack, this.repo.conversationPlanningProvenance(historyScope, sessionId, ids));
      this.recordHistoricalAssertions(pack, this.repo.conversationHistoricalAssertionVersions(historyScope, sessionId, ids));
      this.recordLearningProcesses(pack, this.repo.conversationLearningProcessVersions(historyScope, sessionId, ids));
      this.recordReflectiveLetterSources(pack, this.repo.conversationReflectiveLetterSources(historyScope, sessionId, ids));
      this.recordAssistantWorkSources(pack, this.repo.conversationAssistantWorkSources(historyScope, sessionId, ids));
      this.recordReleaseSources(pack, this.repo.conversationReleaseSources(historyScope, sessionId, ids));
      this.recordPersonalMethodSources(pack, this.repo.conversationPersonalMethodSources(historyScope, sessionId, ids));
      this.recordNoteSources(pack, this.repo.conversationNoteSources(historyScope, sessionId, ids));
      this.recordWorkoutSources(pack, this.repo.conversationWorkoutSources(historyScope, sessionId, ids));
      this.recordSpatialSources(pack, this.repo.conversationSpatialSources(historyScope, sessionId, ids));
      this.recordMaterialNavigationSources(pack, this.repo.conversationMaterialNavigationSources(historyScope, sessionId, ids));
      this.recordImageSourceVersions(pack, this.repo.conversationImageSourceVersions(historyScope, sessionId, ids));
      this.recordCampusSensitiveReads(pack, this.repo.conversationCampusSensitiveReads(historyScope, sessionId, ids));
      this.recordCampusReadingSources(pack, historyScope, sessionId, ids);
      this.recordInteractiveProgramSources(pack, this.repo.conversationInteractiveProgramSources(historyScope, sessionId, ids));
      this.restoreCampusReading(pack, historyScope, sessionId, ids);
      if (!ingress.requiresReadPurpose && ingress.ownerHistoryAllowed && contract.memoryMode !== 'none'
        && contract.memoryMode !== 'current_sources_only') this.restoreMaterialReading(pack, contract.scope, sessionId);
    }
    if (currentMatter) this.recordWorkSources(pack, [currentMatter.id, ...currentMatter.optionPlaces.map(option => option.id)]
      .flatMap(id => this.repo.work(contract.scope, undefined, id)));
    if (life) {
      this.recordWorkSources(pack, life.records);
      this.recordWorkSourceBindings(pack, life.bindings);
      if (life.learningProcessVersions?.length) this.recordLearningProcesses(pack, life.learningProcessVersions);
    }
    this.recordInitialComposition(pack, 'compiler');
    if (acquire && additionalNeeds.length) await this.expand(pack, additionalNeeds, signal);
    return pack;
  }
  /** One bounded numeric projection in the existing receipt. This does not
   * alter read accounting, source adoption, or the model's budget. */
  recordInitialComposition(pack: ContextPack, stage: InitialContextComposition['stage'] = 'ready_for_main') {
    const serialized = this.serialize(pack), data = JSON.parse(serialized) as Record<string, unknown>;
    const costs = (value: unknown) => { const text = canonical(value); return {
      bytes: Buffer.byteLength(text), estimatedTokens: Math.ceil(Array.from(text).length / 1.4),
    }; };
    const categories: { category: InitialContextComposition['groups'][number]['category']; keys: readonly string[] }[] = [
      { category: 'current_originals', keys: ['currentSources', 'currentRequest'] },
      { category: 'history', keys: ['history', 'historyIndex', 'historyCarryover', 'historyCoverage', 'historyUse', 'volatileConversationHistory'] },
      { category: 'observations', keys: ['recentObservations'] },
      { category: 'continuity', keys: ['currentMatter', 'preparedMaterials', 'openThreads', 'planningIntents', 'continuityCoverage', 'campusReading', 'materialReading'] },
      { category: 'capabilities', keys: ['capabilityDirectory'] },
      { category: 'focused_work', keys: ['currentWorkspace', 'currentPreparation', 'currentPreparationUnavailable', 'currentAgenda', 'currentAgendaUnavailable', 'currentInteractive', 'currentInteractiveUnavailable', 'currentNote', 'currentNoteUnavailable', 'currentMapRoute', 'currentMapRouteUnavailable',
        'currentConversationQuote', 'currentConversationQuoteUnavailable',
        'currentLetter', 'currentLetterUnavailable', 'currentStudy', 'currentCuriosity', 'currentCuriosityUnavailable',
        'currentCompanion', 'currentRehearsal', 'currentRehearsalUnavailable', 'currentCampusReference', 'currentSelection', 'currentSelectionUnavailable'] },
      { category: 'presentation_guidance', keys: ['availableScenes', 'presentationLibrary', 'interactiveProgram', 'currentInteractivePrograms'] },
    ];
    const assigned = new Set<string>();
    const groups: InitialContextComposition['groups'] = categories.map(({ category, keys }) => {
      const entries = keys.filter(key => Object.hasOwn(data, key)).map(key => { assigned.add(key); return [key, data[key]]; });
      return { category, ...(entries.length ? costs(Object.fromEntries(entries)) : { bytes: 0, estimatedTokens: 0 }) };
    });
    groups.push({ category: 'other', ...costs(Object.fromEntries(Object.entries(data).filter(([key]) => !assigned.has(key)))) });
    const history = Array.isArray(data.history) ? data.history as { role?: unknown }[] : [];
    const organization = pack.data.contextOrganization as { mode?: unknown } | undefined;
    const currentWorkFirst = organization?.mode === 'current_work_first';
    const historyCoverage = pack.data.historyCoverage as { assistantBodiesDeferred?: number } | undefined;
    pack.receipt.initialComposition = { strategy: currentWorkFirst ? 'current_work_first' : 'standard', stage, groups,
      serialized: { bytes: Buffer.byteLength(serialized), estimatedTokens: Math.ceil(Array.from(serialized).length / 1.4) },
      accounted: { readBytes: pack.receipt.budget.readBytes, estimatedTokens: pack.receipt.budget.estimatedTokens },
      history: { userBodies: history.filter(message => message.role === 'user').length,
        assistantBodies: history.filter(message => message.role === 'assistant').length,
        deferredAssistantBodies: historyCoverage?.assistantBodiesDeferred ?? (Array.isArray(data.historyIndex) ? data.historyIndex.length : 0) },
      deferred: { ambientContinuity: false, recentObservations: false, capabilityDescriptions: false } };
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Second layer: model-activated, scoped candidates; original search remains independent. */
  includeVerifiedConversation(pack: ContextPack, sessionId: string, currentIds: string[], verifiedMaterialScope?: ScopeHandle) {
    const targetScope = this.policy.validate(pack.contract.scope), readScope = verifiedMaterialScope || pack.contract.scope;
    const scope = this.policy.validate(readScope);
    if ((!verifiedMaterialScope && !['relevant', 'session_only'].includes(pack.contract.memoryMode)) || targetScope.audience !== 'self' || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real' || !scope.sources.includes('history:self') || !this.policy.can(readScope, 'evidence:read'))
      throw new HarnessError('history_scope', '本轮范围不允许读取先前对话。');
    const recent = this.repo.conversationHistory(readScope, sessionId, currentIds, 5);
    const anchor = pack.contract.enhancements?.prefetch === false ? null
      : this.repo.conversationAnchor(readScope, sessionId, pack.currentText, [...currentIds, ...recent.map(message => message.id)]);
    const history = anchor ? [anchor, ...recent] : recent;
    const currentMatter = scope.sources.includes('work:self') && pack.contract.enhancements?.currentMatter !== false ? this.repo.currentMatter(readScope, sessionId) : null;
    const observations = this.repo.sessionExternalObservations(readScope, sessionId, pack.contract.now)
      .filter(event => !pack.receipt.providedEvidenceIds.includes(event.id));
    const recentObservations = observations.map(event => ({ id: event.id, sourceId: event.sourceId, authority: event.authority, receivedAt: event.receivedAt, text: event.text,
      meaning: '这是这段对话相关的近期外部观察，保留当时实际看到的内容。对方的想法和接下来要做什么，接着按他自己的表达来。' }));
    const sourceContextMeaning = sourceContextGuidance(...pack.evidence.map(event => event.sourceContext), ...history.map(message => message.sourceContext));
    const text = canonical({ history, currentMatter, recentObservations, sourceContextMeaning }), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
    pack.data.history = history;
    pack.data.sourceContextMeaning = sourceContextMeaning;
    pack.data.currentMatter = currentMatter;
    if (recentObservations.length) pack.data.recentObservations = recentObservations;
    pack.data.historyUse = '按当前原话的实际用途，这里接回了同一对话近期的材料，其他对话和人物画像没有随这一步展开。先前的方案保留当时的商量状态，是否选定要看本人真正作过的选择。即使当前事项目录为空，已经提供的同对话原话也仍是可用背景；其中具体的选项或地点名称，可以帮助你按眼前问题找到公开资料里的稳定对象，让对方省下重新报名称的负担。旧助手的某段具体路线有时没有进入这次材料，新查到的路线则有这次实际取得的依据；两者各有自己的来处。你可以据此作有条件的比较，确实有会改变结果的歧义时，再和本人说清那一处区别。当前明确的排除与纠正，说明这次想沿哪个方向继续。前情里谈到的每个人各有自己的事实、偏好与约定；共同讨论过的地点是候选位置，本人或他人实际在哪里还需要各自的依据。';
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...history.filter(message => message.role === 'user').map(message => message.id), ...observations.map(event => event.id)])];
    if (history.length || observations.length) pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...(history.length ? ['history:self'] : []), ...observations.map(event => event.sourceId)])];
    for (const ref of [...history.flatMap(message => message.role === 'user' && Number.isSafeInteger(message.contentVersion) && message.contentVersion! > 0
      ? [{ id: message.id, revision: message.contentVersion!, kind: 'evidence' as const }] : []),
      ...observations.map(event => ({ id: event.id, revision: event.contentVersion, kind: 'evidence' as const }))])
      if (!pack.receipt.providedObjectVersions.some(previous => previous.kind === ref.kind && previous.id === ref.id && previous.revision === ref.revision))
        pack.receipt.providedObjectVersions.push(ref);
    if (currentMatter) {
      pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'work:self'])];
      pack.receipt.providedObjectVersions.push({ id: currentMatter.id, revision: currentMatter.revision, kind: 'work' }, ...currentMatter.optionPlaces.map(option => ({ id: option.id, revision: option.revision, kind: 'work' as const })));
      if (pack.receipt.mechanismUses) pack.receipt.mechanismUses.currentMatter = 1;
      this.recordWorkSources(pack, [currentMatter.id, ...currentMatter.optionPlaces.map(option => option.id)]
        .flatMap(id => this.repo.work(readScope, undefined, id)));
    }
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    this.recordWorkSourceBindings(pack, this.repo.conversationWorkSourceBindings(readScope, sessionId, history.map(message => message.id)));
    this.recordPlanningProvenance(pack, this.repo.conversationPlanningProvenance(readScope, sessionId, history.map(message => message.id)));
    this.recordHistoricalAssertions(pack, this.repo.conversationHistoricalAssertionVersions(readScope, sessionId, history.map(message => message.id)));
    this.recordLearningProcesses(pack, this.repo.conversationLearningProcessVersions(readScope, sessionId, history.map(message => message.id)));
    this.recordReflectiveLetterSources(pack, this.repo.conversationReflectiveLetterSources(readScope, sessionId, history.map(message => message.id)));
    this.recordAssistantWorkSources(pack, this.repo.conversationAssistantWorkSources(readScope, sessionId, history.map(message => message.id)));
    this.recordReleaseSources(pack, this.repo.conversationReleaseSources(readScope, sessionId, history.map(message => message.id)));
    this.recordPersonalMethodSources(pack, this.repo.conversationPersonalMethodSources(readScope, sessionId, history.map(message => message.id)));
    this.recordNoteSources(pack, this.repo.conversationNoteSources(readScope, sessionId, history.map(message => message.id)));
    this.recordWorkoutSources(pack, this.repo.conversationWorkoutSources(readScope, sessionId, history.map(message => message.id)));
    this.recordSpatialSources(pack, this.repo.conversationSpatialSources(readScope, sessionId, history.map(message => message.id)));
    this.recordMaterialNavigationSources(pack, this.repo.conversationMaterialNavigationSources(readScope, sessionId, history.map(message => message.id)));
    this.recordImageSourceVersions(pack, this.repo.conversationImageSourceVersions(readScope, sessionId, history.map(message => message.id)));
    this.recordCampusSensitiveReads(pack, this.repo.conversationCampusSensitiveReads(readScope, sessionId, history.map(message => message.id)));
    this.recordCampusReadingSources(pack, readScope, sessionId, history.map(message => message.id));
    this.recordInteractiveProgramSources(pack, this.repo.conversationInteractiveProgramSources(readScope, sessionId, history.map(message => message.id)));
    const campusReading = this.restoreCampusReading(pack, readScope, sessionId, history.map(message => message.id));
    const materialReading = this.restoreMaterialReading(pack, pack.contract.scope, sessionId, history.map(message => message.id));
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return { status: history.length || observations.length ? 'fresh' : 'not_found', count: history.length, observationCount: observations.length,
      ...(campusReading ? { campusReading } : {}), ...(materialReading ? { materialReading } : {}) };
  }

  /** Production search may add local semantic discoveries. The existing sync
   * lexical/browse entry remains available to callers which do not request it. */
  async prefetchWithSemantic(pack: ContextPack, query: string, at = pack.contract.now, offset = 0, limit = 8, hardOffset = 0,
    sourceProjection?: EvidenceProjection, recall: RecallOptions = {},
    investigation?: { service: InvestigationFrontierService; session: InvestigationSession; readCoordinates?: 'projection' | 'source' },
    options: { signal: AbortSignal; projectRanges?: (event: EvidenceEvent) => readonly { start: number; end: number }[];
      projectionKey?: string; coordinateBase?: (event: EvidenceEvent) => number;
      sourceRelatedAllowed?: boolean } = { signal: new AbortController().signal }) {
    options.signal.throwIfAborted();
    const scope = this.policy.validate(pack.contract.scope);
    if (!Number.isFinite(Date.parse(at))) throw new HarnessError('invalid_time', '检索时间不合法。');
    if (recall.mode !== 'browse' && (recall.cursor || recall.sourceIds || recall.receivedFrom || recall.receivedBefore))
      throw new HarnessError('browse_mode_required', '来源、收到时间和浏览游标只用于mode=browse。');
    if ((recall.mode === 'browse' || recall.mode === 'scan') && (recall.semanticSnapshot || recall.semanticOffset !== undefined || recall.semanticWindowCursor))
      throw new HarnessError('semantic_search_required', '语义候选分页只用于普通search；原文浏览游标仍走原入口。');
    if (recall.semanticWindowCursor && (offset || recall.semanticSnapshot || recall.semanticOffset))
      throw new HarnessError('semantic_window_invalid', '较早候选窗口有自己的起点offset=0；这次请求同时带着旧排名或窗口内位置，地址没有对应上。');
    let semantic: SemanticRecallResult | undefined;
    if (this.semanticRecall && (!recall.mode || recall.mode === 'search')
      && (offset === 0 || !!recall.semanticSnapshot)
      && (scope.sources.includes('history:self') || scope.sources.includes('profile:self')) && this.policy.can(pack.contract.scope, 'evidence:read')) {
      semantic = await this.semanticRecall.search(pack.contract.scope, recallQueries(query, recall.relatedQueries), {
        signal: options.signal, projectRanges: options.projectRanges, projectionKey: options.projectionKey,
        // A local-inference work bound for embedding passages, not a delivery
        // gate: what is found is still read back through the original source.
        maxReadBytes: SEMANTIC_LOCAL_WORK_BYTES,
        maxRows: pack.contract.budget.maxRows, offset: recall.semanticOffset || 0, limit: 51, rankingId: recall.semanticSnapshot,
        windowCursor: recall.semanticWindowCursor,
        onReadBytes: bytes => {
          options.signal.throwIfAborted(); this.policy.validate(pack.contract.scope);
          pack.receipt.budget.readBytes += bytes;
          this.repo.saveReceipt(pack.contract.scope, pack.receipt);
        },
      });
      options.signal.throwIfAborted(); this.policy.validate(pack.contract.scope);
    }
    return this.prefetch(pack, query, at, offset, limit, hardOffset, sourceProjection, recall, investigation,
      semantic ? { result: semantic, coordinateBase: options.coordinateBase } : undefined, options);
  }
  prefetch(pack: ContextPack, query: string, at = pack.contract.now, offset = 0, limit = 8, hardOffset = 0,
    sourceProjection?: EvidenceProjection, recall: RecallOptions = {},
    investigation?: { service: InvestigationFrontierService; session: InvestigationSession; readCoordinates?: 'projection' | 'source' },
    semantic?: { result: SemanticRecallResult; coordinateBase?: (event: EvidenceEvent) => number },
    discovery: { sourceRelatedAllowed?: boolean;
      projectRanges?: (event: EvidenceEvent) => readonly { start: number; end: number }[] } = {}) {
    const scope = this.policy.validate(pack.contract.scope), time = Date.parse(at);
    const profileAllowed = this.repo.personalMemoryReadable(pack.contract.scope);
    if (!Number.isFinite(time)) throw new HarnessError('invalid_time', '检索时间不合法。');
    if (!scope.grants.includes('evidence:read'))
      return { status: 'forbidden', bundles: [], reason: '本轮不允许读取个人原文和理解。' };
    if (recall.mode !== 'browse' && (recall.cursor || recall.sourceIds || recall.receivedFrom || recall.receivedBefore))
      throw new HarnessError('browse_mode_required', '来源、收到时间和浏览游标只用于mode=browse；未按普通关键词检索忽略这些限制。');
    if (recall.mode === 'browse') {
      if (offset || hardOffset) throw new HarnessError('browse_cursor_required', '原文浏览用cursor继续，不使用offset分页。');
      if (!this.policy.can(pack.contract.scope, 'evidence:read'))
        return { status: 'forbidden', originals: [], reason: '本轮不允许读取原文。' };
      const seed = investigation?.service.resolveBrowse(investigation.session, pack.contract.scope, recall.cursor);
      const { value, position } = this.evidenceBrowser.pageWithPosition(this.repo, pack.contract.scope, recall,
        Math.max(1, Math.min(limit, 20)), sourceProjection, pack.contract.budget.maxRows, seed, investigation?.readCoordinates,
        discovery.projectRanges ? event => {
          const ranges = discovery.projectRanges!(event);
          return ranges.length === 1 ? ranges[0] : undefined;
        } : undefined);
      value.originals = value.originals.map(original => {
        const address = position.originals.find(ref => ref.eventId === original.id && ref.contentVersion === original.contentVersion);
        const sourceRelated = address && this.sourceRelatedRead(pack, [{ eventId: original.id,
          contentVersion: original.contentVersion, start: address.sourceStart,
          end: address.sourceStart + address.previewEnd }], discovery.sourceRelatedAllowed);
        return { ...original, ...(sourceRelated ? { sourceRelated } : {}) };
      });
      const serialized = canonical(value), bytes = Buffer.byteLength(serialized), tokens = Math.ceil(Array.from(serialized).length / 1.4);
      pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...value.originals.map(event => event.id)])];
      pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...value.originals.map(event => event.sourceId)])];
      const versions = value.originals.map(event => ({ id: event.id, revision: event.contentVersion, kind: 'evidence' as const }));
      pack.receipt.providedObjectVersions = mergeProvidedObjectVersions([...pack.receipt.providedObjectVersions, ...versions]);
      pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
      pack.data.retrievedContext = value;
      this.repo.saveReceipt(pack.contract.scope, pack.receipt);
      // A budget-admitted page is only a host candidate. ToolRegistry stages
      // it after the final, safe result has a real Hermes tool-call identity.
      investigation?.service.rememberBrowse(value, position);
      return value;
    }
    if (!scope.sources.includes('history:self') && !profileAllowed)
      return { status: 'forbidden', bundles: [], reason: '本轮资料范围不包括个人历史和记忆。' };
    if (recall.mode === 'scan' && !profileAllowed)
      return { status: 'forbidden', bundles: [], reason: '本轮范围不允许浏览个人理解候选。' };
    const queries = recallQueries(query, recall.relatedQueries);
    const options = { at, verified: true };
    const scan = recall.mode === 'scan';
    const multi = !scan && queries.length > 1 ? multiQueryRecall(this.repo, pack.contract.scope, queries, at, offset, limit, hardOffset,
      profileAllowed, scope.sources.includes('history:self')) : undefined;
    const scanPage = scan ? this.repo.assertions(pack.contract.scope, { ...options, offset, limit: limit + 1 }) : [];
    const soft = !multi && !scan && profileAllowed ? this.repo.lexicalAssertionPage(pack.contract.scope, query, { ...options, strength: 'non_hard', offset, limit }) : { items: [], total: 0 };
    const hard = !multi && !scan && profileAllowed ? this.repo.lexicalAssertionPage(pack.contract.scope, query, { ...options, strength: 'hard', offset: hardOffset, limit: 8 }) : { items: [], total: 0 };
    // Strength controls priority within relevant candidates, not universal
    // applicability. Unrelated hard preferences must not enter every question.
    const selected = scan ? scanPage.slice(0, limit) : multi?.selected || [...hard.items, ...soft.items];
    const bundles = selected.flatMap(assertion => {
      const bundle = expandRecallBundle(this.repo, pack.contract.scope, assertion, at, sourceProjection);
      return bundle ? [bundle] : [];
    });
    const semanticActive = semantic && !semantic.result.restartRequired && ['fresh', 'partial'].includes(semantic.result.status);
    const rawPage = multi ? semanticActive ? multi.rawRanking : multi.raw : !scan && scope.sources.includes('history:self')
      ? this.repo.lexicalEvidence(pack.contract.scope, query, semanticActive ? 51 : limit + 1, semanticActive ? 0 : offset) : [];
    const lexicalRaw = (semanticActive ? rawPage : rawPage.slice(0, limit)).flatMap(original => {
      const historical = projectHistoricalEvidence(this.repo, pack.contract.scope, original, sourceProjection);
      if (!historical) return [];
      if (historical.text === original.text) return [historical];
      // Do not reveal even a search hit solely because the hidden part matched.
      return queries.some(value => matchesVisibleQuery(value, historical.text)) ? [historical] : [];
    });
    const semanticRaw = semanticActive ? semantic.result.items.flatMap(item => {
      const event = this.repo.evidence(pack.contract.scope, item.eventId);
      if (!event || event.contentVersion !== item.contentVersion || !this.repo.availableInferenceRanges(event)
        .some(range => range.start <= item.matchedRange.start && range.end >= item.matchedRange.end)
        || Array.from(event.text).slice(item.startCodePoint, item.endCodePoint).join('') !== item.preview)
        throw new HarnessError('semantic_source_changed', '候选原话的范围已改变，需要从当前来源重新检索。');
      const base = semantic.coordinateBase?.(event) || 0;
      if (item.matchedRange.start < base) throw new HarnessError('semantic_projection_invalid', '候选地址不在当前原文片段内。');
      return [{ id: event.id, contentVersion: event.contentVersion, sourceId: event.sourceId, receivedAt: event.receivedAt,
        authority: event.authority, ...(event.sourceContext ? { sourceContext: event.sourceContext } : {}), text: item.preview, preview: item.preview, previewOnly: true as const, excerptOnly: true,
        use: 'candidate_requires_original_read', restrictions: [] as ReturnType<KernelRepository['historicalEvidence']>['restrictions'],
        sourceRange: { start: item.startCodePoint, end: item.endCodePoint }, matchedRange: item.matchedRange,
        read: { tool: 'read_evidence', arguments: { id: event.id, offset: item.matchedRange.start - base,
          limit: Math.min(1200, item.matchedRange.end - item.matchedRange.start) } }, rankingOnly: true }];
    }) : [];
    const originalRanking = semanticActive ? fuseRecallMethods<(typeof lexicalRaw)[number] | (typeof semanticRaw)[number]>([lexicalRaw, semanticRaw]) : lexicalRaw;
    const selectedRaw = semanticActive ? originalRanking.slice(offset, offset + limit) : lexicalRaw;
    const raw = selectedRaw.map(event => {
      let ref: WorkSourceRef | undefined;
      if ('sourceRange' in event && event.sourceRange) ref = { eventId: event.id,
        contentVersion: event.contentVersion, start: event.sourceRange.start, end: event.sourceRange.end };
      else {
        const original = this.repo.evidence(pack.contract.scope, event.id);
        if (original) {
          const ranges = event.text === original.text ? [{ start: 0, end: Array.from(original.text).length }]
            : discovery.projectRanges?.(original) || [];
          const matching = ranges.filter(range => Array.from(original.text).slice(range.start, range.end).join('') === event.text);
          if (matching.length === 1) ref = { eventId: event.id, contentVersion: event.contentVersion, ...matching[0] };
        }
      }
      const sourceRelated = ref && this.sourceRelatedRead(pack, [ref], discovery.sourceRelatedAllowed);
      return { ...event, ...(ref ? { sourceRange: { start: ref.start, end: ref.end } } : {}),
        ...(sourceRelated ? { sourceRelated } : {}) };
    });
    const searchRead = (arguments_: Record<string, unknown>) => ({ tool: 'search_context',
      arguments: { ...(!sourceProjection ? { query, relatedQueries: recall.relatedQueries } : {}), ...arguments_ },
      ...(sourceProjection ? { reuseCurrentQuery: true,
        meaning: '接着刚才的搜索继续即可，原来的关键词与相关说法仍沿用，其余内容照这个入口填写。' } : {}) });
    // Old wording can be the only search clue. Follow its exact correction link
    // to the current source without reviving the superseded assertion.
    const correctionIds = [...new Set(raw.flatMap(event => event.restrictions.flatMap(restriction => restriction.replacementEventId ? [restriction.replacementEventId] : [])))];
    const correctionFollowups = correctionIds.slice(0, 16).flatMap(id => {
      if (raw.some(event => event.id === id)) return [];
      const event = this.repo.evidence(pack.contract.scope, id);
      const view = event && projectHistoricalEvidence(this.repo, pack.contract.scope, event, sourceProjection);
      return view ? [view] : [];
    });
    const value = { status: bundles.length || raw.length ? 'fresh' : semantic && semantic.result.status !== 'not_found' ? 'partial' : 'not_found', bundles, originals: raw, correctionFollowups,
      sourceContextMeaning: sourceContextGuidance(...raw.map(event => event.sourceContext),
        ...correctionFollowups.map(event => event.sourceContext), ...bundles.flatMap(bundle => bundle.sources.map(event => event.sourceContext))),
      coverage: { candidatesOnly: true, at,
        retrieval: scan ? 'model_candidate_scan' : semanticActive ? 'local_semantic_and_lexical' : queries.length > 1 ? 'model_multi_query_rrf' : 'lexical',
        ...(!sourceProjection ? { queries } : {}),
        nextOffset: scan ? scanPage.length > limit ? offset + limit : null : semanticActive
          ? originalRanking.length > offset + limit || (multi ? multi.nextOffset !== null : soft.total > offset + limit) ? offset + limit : null
          : multi ? multi.nextOffset : soft.total > offset + limit || rawPage.length > limit ? offset + limit : null,
        nextHardOffset: scan ? null : multi ? multi.nextHardOffset : hard.total > hardOffset + 8 ? hardOffset + 8 : null,
        hardTotal: scan ? null : sourceProjection ? bundles.filter(bundle => bundle.assertions[0].strength === 'hard').length : multi?.hardTotal ?? hard.total,
        hardTotalCoverage: scan || sourceProjection ? 'visible_page' : multi ? 'ranking_window' : 'all_candidates',
        ...(semanticActive ? { rankingWindow: { perLexicalQuery: 51, lexicalQueryCount: queries.length, semanticWindow: 51,
          fusion: 'method_heads_then_rrf', lexicalQueriesCollapsed: true,
          candidateWindowOnly: true }, queryContinuations: sourceProjection ? [] : multi?.queryContinuations || [],
          ...(!multi && rawPage.length === 51 ? { lexicalContinuation: searchRead({ mode: 'search', at, offset: 51, hardOffset: 0, limit }) } : {}) }
          : multi ? { rankingWindow: multi.rankingWindow, queryContinuations: sourceProjection ? [] : multi.queryContinuations } : {}),
        vectorSearch: semantic ? { status: semantic.result.status, methodId: semantic.result.methodId,
          rankingId: semantic.result.rankingId, restartRequired: semantic.result.restartRequired,
          ...semantic.result.coverage, indexGap: semantic.result.indexGap,
          ...(semantic.result.nextWindowCursor ? { nextWindow: searchRead({ mode: 'search', at, offset: 0, hardOffset: 0,
            limit, semanticOffset: 0, semanticWindowCursor: semantic.result.nextWindowCursor }) } : {}),
          ...(semantic.result.nextOffset === null || !semantic.result.rankingId ? {} : { read: searchRead({
            mode: 'search', at, offset: 0, hardOffset: 0, limit,
            semanticSnapshot: semantic.result.rankingId, semanticOffset: semantic.result.nextOffset }) }),
          meaning: '这里把意思相近的线索排在前面，沿片段的原文地址可读到实际说法与条件。结果也留下这次找过的范围，方便判断还要往哪里翻。' } : 'not_connected', hardConstraintsSeparate: !scan,
        correctionFollowupsComplete: correctionIds.length <= 16 && correctionIds.every(id => raw.some(event => event.id === id) || correctionFollowups.some(event => event.id === id)),
        guidance: '先看看这些线索和眼前的问题怎样相连。标作original_text的文字是这次实际带来的原文，旁边留着读到的范围；预览沿read打开正文。还想找时可补同义说法、另一种语言或相关条件，也可用scan逐页看看。继续当前合并结果用coverage.read；按意思相近的顺序翻用vectorSearch.read，更早一批用nextWindow；按原词继续找用lexicalContinuation或queryContinuations。带reuseCurrentQuery的入口沿用刚才的关键词。没找到时可换线索，或接着翻尚未读到的部分。',
        historicalOriginals: '局部更正后的原文仍可以帮助了解当时怎样说。restrictions标明其中已更正或停止用于原有理解的范围，其他片段则保留各自的语境和依据。' } };
    if (semanticActive && semantic.result.rankingId && value.coverage.nextOffset !== null)
      Object.assign(value.coverage, { read: searchRead({ mode: 'search',
        at, offset: value.coverage.nextOffset, hardOffset: value.coverage.nextHardOffset || 0, limit,
        semanticSnapshot: semantic.result.rankingId, semanticOffset: recall.semanticOffset || 0 }) });
    const bytes = Buffer.byteLength(canonical(value)), tokens = Math.ceil(Array.from(canonical(value)).length / 1.4);
    pack.assertions = [...new Map([...pack.assertions, ...bundles.flatMap(b => b.assertions)].map(a => [a.id, a])).values()];
    // A semantic preview depends on the exact original range used to derive
    // its rank. Same-version correction/retraction must also stop later reuse.
    this.recordWorkSourceBindings(pack, raw.flatMap(event => 'matchedRange' in event && event.rankingOnly
      ? [this.repo.resolveWorkSourceBinding(pack.contract.scope, [{ eventId: event.id, contentVersion: event.contentVersion,
        start: event.matchedRange.start, end: event.matchedRange.end }])] : []));
    const ids = [...raw.map(e => e.id), ...correctionFollowups.map(e => e.id), ...bundles.flatMap(b => b.sources.map(e => e.id))];
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...ids])];
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...raw.map(e => e.sourceId), ...correctionFollowups.map(e => e.sourceId), ...bundles.flatMap(b => b.sources.map(e => e.sourceId))])];
    const versions = [...pack.assertions.map(a => ({ id: a.id, revision: a.revision, kind: 'assertion' as const })),
      ...raw.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })),
      ...correctionFollowups.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })),
      ...bundles.flatMap(bundle => bundle.sources.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })))];
    pack.receipt.providedObjectVersions = mergeProvidedObjectVersions([...pack.receipt.providedObjectVersions, ...versions]);
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    pack.data.retrievedContext = value;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  }
  prefetchForMatter(pack: ContextPack, matter: WorkRecord, currentText: string) {
    // Opening one matter is not permission to search every personal transcript
    // for words in its title. Only its explicit evidence links are automatic;
    // the agent can request a separate, purpose-checked search if needed.
    if (matter.sourceBinding) return this.prefetchBoundWork(pack, matter);
    const originals = matter.evidenceIds.slice(-4).flatMap(id => {
      const event = this.repo.evidence(pack.contract.scope, id);
      return event && projectHistoricalEvidence(this.repo, pack.contract.scope, event) ? [event] : [];
    });
    const candidates = { status: originals.length ? 'fresh' : 'not_found', bundles: [], originals,
      coverage: { candidatesOnly: true, at: pack.contract.now, nextOffset: null, nextHardOffset: null, hardTotal: 0,
        vectorSearch: 'not_requested_for_matter_links', automaticScope: 'matter_evidence_links_only' } };
    const value = { ...candidates, matterOriginals: originals, originalCoverage: 'bounded_related_originals',
      meaning: '先接回这件事直接关联的原话，看看当时的条件如今还合不合适。还需要其他事的背景时，可以围绕眼前的问题继续找。' };
    const bytes = Buffer.byteLength(canonical(value)), tokens = Math.ceil(Array.from(canonical(value)).length / 1.4);
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...originals.map(event => event.id)])];
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...originals.map(event => event.sourceId)])];
    this.recordWorkSources(pack, [matter]);
    pack.data.retrievedContext = value;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  }
  private prefetchBoundWork(pack: ContextPack, matter: WorkRecord) {
    const fragments = this.repo.readWorkSources(pack.contract.scope, matter);
    this.recordWorkSources(pack, [matter]);
    const offered = fragments.slice(-4), originals: Record<string, unknown>[] = [];
    const address = (fragment: typeof fragments[number], end = fragment.end) => ({ id: fragment.eventId,
      eventId: fragment.eventId, contentVersion: fragment.contentVersion, sourceId: fragment.sourceId,
      sourceRange: { start: fragment.start, end }, boundRange: { start: fragment.start, end: fragment.end }, excerptOnly: true });
    const valueFor = (rows: Record<string, unknown>[]) => ({ status: rows.length ? 'fresh' : 'partial', bundles: [], originals: rows,
      matterOriginals: rows, originalCoverage: 'exact_bound_fragments',
      coverage: { candidatesOnly: true, automaticScope: 'exact_work_source_ranges_only', returned: rows.length,
        totalBoundFragments: fragments.length, complete: fragments.length === rows.length && rows.every((row, index) =>
          (row.sourceRange as { end: number }).end === offered[index].end),
        unread: fragments.filter(fragment => !rows.some(row => row.eventId === fragment.eventId
          && (row.sourceRange as { start: number; end: number }).start === fragment.start
          && (row.sourceRange as { end: number }).end === fragment.end)).map(fragment => {
            const supplied = rows.find(row => row.eventId === fragment.eventId && (row.sourceRange as { start: number }).start === fragment.start);
            const offset = supplied ? (supplied.sourceRange as { end: number }).end : fragment.start;
            return { ...address(fragment), nextOffset: offset,
              read: { tool: 'read_evidence', id: fragment.eventId, offset, limit: Math.min(20000, fragment.end - offset) } };
          }) },
      meaning: '这里是这件事所连原话中的实际片段，sourceRange记着这次读到哪里，boundRange记着原引用范围，位置按原文字符计。还有没读的部分时，沿留下的入口继续，看当时是否还有别的条件。' });
    for (const fragment of offered) {
      originals.push({ ...address(fragment), text: fragment.text });
    }
    const value = valueFor(originals);
    const serialized = canonical(value);
    pack.receipt.budget.readBytes += Buffer.byteLength(serialized);
    pack.receipt.budget.estimatedTokens += Math.ceil(Array.from(serialized).length / 1.4);
    pack.data.retrievedContext = value;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  }
  async expand(pack: ContextPack, needs: Need[], signal: AbortSignal) {
    this.policy.validate(pack.contract.scope);
    for (const need of needs) {
      if (pack.needs.some((n) => n.key === need.key)) continue;
      const result = need.capability
        ? await this.broker.invoke(pack.contract.scope, need.capability, need.args, signal)
        : undefined;
      pack.needs.push({
        id: need.id,
        key: need.key,
        capability: need.capability,
        status: result?.status || 'unknown',
        evidenceIds: [],
        value: result?.data,
        reason: result?.reason || '缺少当前事实',
        fetchedAt: result?.fetchedAt,
      });
      if (result?.data)
        pack.receipt.providedSourceIds = [
          ...new Set([...(pack.receipt.providedSourceIds || []), result.sourceId]),
        ];
    }
    if (pack.needs.some((n) => !['fresh', 'known_absent'].includes(n.status)))
      pack.receipt.coverage = 'conditional';
    pack.receipt.needResults = pack.needs.map((n) => ({ key: n.key, status: n.status }));
    pack.data.needs = pack.needs;
    pack.data.coverage = pack.receipt.coverage;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return pack;
  }
  /** Record the actual endpoint/mode used by a model call without retaining payloads. */
  recordObjects(pack: ContextPack | undefined, records: { id: string; revision: number }[], kind: 'assertion' | 'work' | 'agenda' | 'evidence') {
    if (!pack) return;
    for (const record of records) {
      const previous = pack.receipt.providedObjectVersions.find(value => value.id === record.id && value.kind === kind);
      if (previous) {
        if (previous.imageSha256 && previous.revision !== record.revision)
          throw new HarnessError('image_changed', '这次原话版本与已采用的原图不同，需要重新读取。');
        if (previous.revision !== record.revision) {
          delete previous.sourceBinding; delete previous.sourceMaterial;
          delete previous.noteSources; delete previous.problemIdentitySha256;
        }
        previous.revision = record.revision;
      }
      else pack.receipt.providedObjectVersions.push({ id: record.id, revision: record.revision, kind });
    }
  }
  recordHistoricalAssertions(pack: ContextPack, refs: { id: string; revision: number }[]) {
    if (!this.repo.historicalAssertionsReadable(pack.contract.scope, refs))
      throw new HarnessError('memory_history_changed', '这段旧理解所依据的资料已有变化，这次没有继续接入先前的正文。');
    if (refs.length) pack.receipt.historicalAssertionVersions = [...new Map([
      ...(pack.receipt.historicalAssertionVersions || []), ...refs,
    ].map(ref => [ref.id + ':' + ref.revision, ref])).values()];
  }
  recordLearningProcesses(pack: ContextPack, refs: { id: string; revision: number }[]) {
    if (refs.some(ref => !this.repo.learningProcessReadable(pack.contract.scope, ref.id, ref.revision)))
      throw new HarnessError('learning_process_changed', '这份学习过程的来由已有变化，这次没有继续接入先前的记录。');
    if (refs.length) pack.receipt.learningProcessVersions = [...new Map([
      ...(pack.receipt.learningProcessVersions || []), ...refs,
    ].map(ref => [ref.id + ':' + ref.revision, ref])).values()];
  }
  /** A read address proposes navigation; it does not discover or adopt a work record. */
  private sourceRelatedRead(pack: ContextPack, refs: WorkSourceRef[], allowed = false) {
    if (!allowed || !refs.length || refs.length > 8) return;
    const scope = this.policy.validate(pack.contract.scope);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read')) return;
    try {
      const binding = this.repo.resolveWorkSourceBinding(pack.contract.scope, refs);
      return { tool: 'restore_collaboration', arguments: { type: 'source_related', sourceRefs: binding.refs },
        meaning: '找到了一些与刚才这段原话有关的事项入口，沿各自地址可打开正文，看看是不是正在接的那件事。' };
    } catch (error) {
      if (!(error instanceof HarnessError)) throw error;
    }
  }
  private evidenceReadBinding(pack: ContextPack) {
    const scope = this.policy.validate(pack.contract.scope);
    return canonical({ contract: pack.contract, scope,
      current: createHash('sha256').update(pack.currentText).digest('hex'),
      currentEvidence: pack.evidence.map(event => ({ id: event.id, version: event.contentVersion,
        text: createHash('sha256').update(event.text).digest('hex'), sourceContext: event.sourceContext })) });
  }
  private rememberEvidenceRead(pack: ContextPack, observationId: unknown, ranges: WorkSourceRef[]) {
    if (typeof observationId !== 'string' || !ranges.length) return;
    const proved = ranges.flatMap(ref => {
      const event = this.repo.evidence(pack.contract.scope, ref.eventId);
      return event && event.contentVersion === ref.contentVersion && ref.start >= 0 && ref.end > ref.start
        && ref.end <= Array.from(event.text).length ? [{ ...ref,
          sourceSha256: createHash('sha256').update(canonical(event)).digest('hex') }] : [];
    });
    if (!proved.length) return;
    const snapshot = this.repo.sourceRestrictionSnapshot(pack.contract.scope), ids = new Set(proved.map(ref => ref.eventId));
    const entries = this.providedEvidenceReads.get(pack) || new Map();
    entries.set(observationId, { binding: this.evidenceReadBinding(pack), ranges: proved,
      restrictions: new Map([...snapshot].filter(([id]) => ids.has(id))) });
    this.providedEvidenceReads.set(pack, entries);
  }
  /** Repeating already delivered original text adds no new reading purpose.
   * The owner, body, range and active restrictions are still checked now; the
   * normal read path performs and accounts for the actual delivery again. */
  reuseProvidedEvidenceRead(pack: ContextPack | undefined, delivered: ReadonlySet<string> | undefined,
    eventId: string, offset: number, limit: number,
    projection?: { contentVersion: number; quote: string; sourceStart: number; sourceEnd: number }) {
    if (!pack || !delivered?.size || !Number.isSafeInteger(offset) || !Number.isSafeInteger(limit) || offset < 0 || limit < 1) return;
    if (!this.policy.can(pack.contract.scope, 'evidence:read')) return;
    const entries = this.providedEvidenceReads.get(pack), event = entries && this.repo.evidence(pack.contract.scope, eventId);
    if (!entries || !event || event.locator?.kind === 'file') return;
    if (projection && (!Number.isSafeInteger(projection.sourceStart) || !Number.isSafeInteger(projection.sourceEnd)
      || projection.sourceStart < 0 || projection.sourceEnd <= projection.sourceStart || projection.sourceEnd > Array.from(event.text).length
      || projection.contentVersion !== event.contentVersion
      || Array.from(event.text).slice(projection.sourceStart, projection.sourceEnd).join('') !== projection.quote)) return;
    const origin = projection?.sourceStart || 0, total = projection ? projection.sourceEnd - projection.sourceStart : Array.from(event.text).length;
    if (offset >= total) return;
    const start = origin + offset, end = origin + Math.min(total, offset + limit), binding = this.evidenceReadBinding(pack);
    const digest = createHash('sha256').update(canonical(event)).digest('hex'), restrictions = this.repo.sourceRestrictionSnapshot(pack.contract.scope);
    const currentRestriction = restrictions.get(event.id);
    if (currentRestriction?.wholeSource) return;
    const ranges = [...entries].flatMap(([observationId, proof]) => !delivered.has(observationId) || proof.binding !== binding
      || currentRestriction?.metadata !== proof.restrictions.get(event.id)?.metadata ? [] : proof.ranges
        .filter(ref => ref.eventId === event.id && ref.contentVersion === event.contentVersion && ref.sourceSha256 === digest)
        .map(ref => ({ ...ref, observationId }))).sort((a, b) => a.start - b.start || b.end - a.end);
    let covered = start;
    const observations = new Set<string>();
    for (const range of ranges) {
      if (range.start > covered) break;
      if (range.end <= covered) continue;
      covered = range.end; observations.add(range.observationId);
      if (covered >= end) return { kind: 'same_run_provided_original' as const, observationIds: [...observations],
        sourceRange: { eventId, contentVersion: event.contentVersion, start, end } };
    }
  }
  /** Final model-visible evidence reads share the same ledger as capability
   * reads. A preview never enters this path and a withheld result has no read
   * coverage for a later investigation acknowledgement. */
  recordEvidenceRead(pack: ContextPack, raw: unknown, safe: unknown, eventId: string, sourceRelatedAllowed = false): unknown {
    const scope = this.policy.validate(pack.contract.scope);
    const event = this.repo.evidence(pack.contract.scope, eventId)
      || (scope.currentEventIds.includes(eventId) ? pack.evidence.find(value => value.id === eventId) : undefined);
    if (!event) throw new HarnessError('evidence_forbidden', '这段原文的当前读取范围已经改变。');
    const original = raw as { id?: unknown; version?: unknown; text?: unknown; coverage?: { start?: unknown; end?: unknown; total?: unknown };
      projection?: { kind?: unknown; sourceStart?: unknown; sourceEnd?: unknown; originalContentVersion?: unknown } };
    const result = safe as Record<string, unknown>;
    const coverage = original.coverage, projection = original.projection;
    const hasBody = original.id === event.id && original.version === event.contentVersion && typeof original.text === 'string'
      && result.text === original.text && coverage && Number.isSafeInteger(coverage.start) && Number.isSafeInteger(coverage.end)
      && Number.isSafeInteger(coverage.total) && Number(coverage.start) >= 0 && Number(coverage.end) >= Number(coverage.start)
      && Number(coverage.end) <= Number(coverage.total);
    let ranges: { eventId: string; contentVersion: number; start: number; end: number }[] = [];
    if (hasBody) {
      const projected = projection?.kind === 'attention_authorization_quote';
      if (projected && (!Number.isSafeInteger(projection.sourceStart) || !Number.isSafeInteger(projection.sourceEnd)
        || projection.originalContentVersion !== event.contentVersion || Number(projection.sourceStart) < 0
        || Number(projection.sourceEnd) - Number(projection.sourceStart) !== Number(coverage.total)))
        throw new HarnessError('evidence_changed', '原文片段的来源定位已经改变。');
      if (!projected && Number(coverage.total) !== Array.from(event.text).length)
        throw new HarnessError('evidence_changed', '原文长度在读取后发生变化，请重新读取。');
      const start = Number(coverage.start) + (projected ? Number(projection!.sourceStart) : 0);
      const end = Number(coverage.end) + (projected ? Number(projection!.sourceStart) : 0);
      if (Array.from(event.text).slice(start, end).join('') !== original.text)
        throw new HarnessError('evidence_changed', '原文在读取后发生变化，请按当前来源重新读取。');
      if (end > start) ranges = [{ eventId: event.id, contentVersion: event.contentVersion, start, end }];
    }
    const sourceRelated = this.sourceRelatedRead(pack, ranges, sourceRelatedAllowed);
    const value: Record<string, unknown> = { ...result,
      sourceId: typeof result.sourceId === 'string' && result.sourceId ? result.sourceId : event.sourceId,
      ...(event.sourceContext ? { sourceContext: event.sourceContext, sourceContextMeaning: sourceContextGuidance(event.sourceContext) } : {}),
      ...(typeof original.text === 'string' ? { actualReadRanges: ranges } : {}),
      ...(sourceRelated ? { sourceRelated } : {}) };
    const serialized = canonical(value);
    const withheld = value.status === 'unknown';
    const bytes = Math.max(Buffer.byteLength(canonical(raw)), Buffer.byteLength(serialized)),
      tokens = Math.ceil(Array.from(serialized).length / 1.4);
    const budget = pack.receipt.budget;
    budget.readBytes += bytes;
    budget.estimatedTokens += tokens;
    if (withheld) {
      this.repo.saveReceipt(pack.contract.scope, pack.receipt);
      return value;
    }
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, event.id])];
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), event.sourceId])];
    pack.receipt.providedObjectVersions = mergeProvidedObjectVersions([...pack.receipt.providedObjectVersions,
      { id: event.id, revision: event.contentVersion, kind: 'evidence' as const }]);
    this.rememberEvidenceRead(pack, result.observationId, ranges);
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  }
  /** Search can deliver original text as well as discovery previews. Describe
   * only bodies that survived final redaction unchanged, with their original
   * coordinates. This does not acknowledge a browse frontier or judge a claim. */
  recordSearchEvidenceRead(pack: ContextPack, raw: unknown, safe: unknown): unknown {
    const scope = this.policy.validate(pack.contract.scope);
    const contexts = new Map<string, boolean>();
    const original = raw as Record<string, any>, result = safe as Record<string, any>;
    if (!original || !result || ['unknown', 'failed', 'forbidden', 'stale', 'conflict'].includes(String(result.status))) return safe;
    const describe = (source: Record<string, any> | undefined, provided: Record<string, any>) => {
      // Browse/semantic previews retain their existing candidate contract and
      // exact frontier identity; they are never promoted into original reads.
      if (!source || source.previewOnly || typeof source.text !== 'string' || typeof provided.text !== 'string') return provided;
      const { conversationContext: _previousNavigation, ...located } = provided;
      const event = typeof source.id === 'string' ? this.repo.evidence(pack.contract.scope, source.id) : undefined;
      const total = event ? Array.from(event.text).length : 0;
      const range = source.sourceRange || (event && source.text === event.text ? { start: 0, end: total } : undefined);
      const exact = event && source.contentVersion === event.contentVersion && provided.id === event.id
        && provided.contentVersion === event.contentVersion && provided.text === source.text
        && range && Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end)
        && range.start >= 0 && range.end > range.start && range.end <= total
        && Array.from(event.text).slice(range.start, range.end).join('') === source.text;
      if (!exact) return { ...located, bodyCoverage: { kind: 'transformed_or_unlocated_text', complete: false }, actualReadRanges: [] };
      const ref: WorkSourceRef = { eventId: event.id, contentVersion: event.contentVersion, start: range.start, end: range.end };
      const key = canonical(ref);
      if (!contexts.has(key)) contexts.set(key, !!event.sessionId && scope.sources.includes('history:self')
        && this.repo.hasAssistantHistoryContext(pack.contract.scope, ref));
      return { ...located, sourceRange: { start: ref.start, end: ref.end },
        bodyCoverage: { kind: 'original_text', complete: ref.start === 0 && ref.end === total,
          providedCodePoints: ref.end - ref.start }, actualReadRanges: [ref],
        ...(contexts.get(key) ? { conversationContext: {
          tool: 'read_assistant_history', arguments: { aroundSource: ref, limit: 1200 },
          meaning: '这段原话附近还留着助手回复，可以沿这个位置读回来。原话前的问题与后来的解释分开放着，接回时再看看各自在说什么。' } } : {}) };
    };
    const value = { ...result,
      ...(Array.isArray(result.originals) ? { originals: result.originals.map((item: Record<string, any>, index: number) => describe(original.originals?.[index], item)) } : {}),
      ...(Array.isArray(result.correctionFollowups) ? { correctionFollowups: result.correctionFollowups.map((item: Record<string, any>, index: number) => describe(original.correctionFollowups?.[index], item)) } : {}),
      ...(Array.isArray(result.bundles) ? { bundles: result.bundles.map((bundle: Record<string, any>, index: number) => ({ ...bundle,
        ...(Array.isArray(bundle.sources) ? { sources: bundle.sources.map((item: Record<string, any>, sourceIndex: number) => describe(original.bundles?.[index]?.sources?.[sourceIndex], item)) } : {}) })) } : {}) };
    const before = canonical(safe), after = canonical(value);
    pack.receipt.budget.readBytes += Math.max(0, Buffer.byteLength(after) - Buffer.byteLength(before));
    pack.receipt.budget.estimatedTokens += Math.max(0, Math.ceil(Array.from(after).length / 1.4) - Math.ceil(Array.from(before).length / 1.4));
    if (pack.data.retrievedContext === raw) pack.data.retrievedContext = value;
    this.rememberEvidenceRead(pack, result.observationId, [
      ...(value.originals || []), ...(value.correctionFollowups || []), ...(value.bundles || []).flatMap(bundle => bundle.sources || []),
    ].flatMap(source => !source.previewOnly && source.bodyCoverage?.kind === 'original_text' ? source.actualReadRanges || [] : []));
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  }
  /** A title/specification inherits every actual bound source, even when
   * only some of its exact original fragments were expanded for the model. */
  recordWorkSources(pack: ContextPack | undefined, records: Pick<WorkRecord, 'id' | 'revision' | 'sourceBinding'>[]) {
    if (!pack) return;
    const assistantWorkSources = this.repo.workAssistantWorkSources(pack.contract.scope, records);
    const noteSources = this.repo.workNoteSources(pack.contract.scope, records);
    this.recordObjects(pack, records, 'work');
    const bindings = records.flatMap(record => {
      const snapshot = this.workSourceOwner?.(pack.contract.scope, record);
      const binding = snapshot?.sourceBinding || this.repo.workSourceVersionBinding(pack.contract.scope, record.id, record.revision);
      const version = pack.receipt.providedObjectVersions.find(value => value.kind === 'work' && value.id === record.id && value.revision === record.revision);
      if (!binding || !version) return [];
      version.sourceBinding = structuredClone(binding);
      if (snapshot?.sourceMaterial) version.sourceMaterial = structuredClone(snapshot.sourceMaterial);
      else delete version.sourceMaterial;
      if (snapshot?.noteSources) version.noteSources = structuredClone(snapshot.noteSources);
      else delete version.noteSources;
      if (snapshot?.problemIdentitySha256) version.problemIdentitySha256 = snapshot.problemIdentitySha256;
      else delete version.problemIdentitySha256;
      return [binding];
    });
    if (records.length) pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'work:self'])];
    this.recordWorkSourceBindings(pack, [...records.flatMap(record => record.sourceBinding ? [record.sourceBinding] : []), ...bindings]);
    this.recordAssistantWorkSources(pack, assistantWorkSources);
    this.recordNoteSources(pack, noteSources);
    this.recordWorkoutSources(pack, this.repo.workWorkoutSources(pack.contract.scope, records));
    this.recordSpatialSources(pack, this.repo.workSpatialSources(pack.contract.scope, records));
    this.recordMaterialNavigationSources(pack, this.repo.workMaterialNavigationSources(pack.contract.scope, records));
  }
  /** History and adopted child reports inherit only exact host source addresses.
   * Ordinary method edits or stops do not rewrite their historical meaning. */
  recordWorkSourceBindings(pack: ContextPack | undefined, bindings: WorkSourceBinding[]) {
    if (!pack || !bindings.length) return;
    if (!this.repo.workBindingsReadable(pack.contract.scope, bindings))
      throw new HarnessError('work_source_changed', '这个方法或事项依靠的原话已改变或停止使用，这次没有继续接入先前的文字。');
    for (const binding of bindings) this.recordSourceBinding(pack, binding);
    pack.receipt.workSourceBindings = [...new Map([...(pack.receipt.workSourceBindings || []), ...bindings]
      .map(binding => [canonical(binding), structuredClone(binding)])).values()];
  }
  recordReflectiveLetterSources(pack: ContextPack | undefined, sources: NonNullable<ContextPack['receipt']['reflectiveLetterSources']>) {
    if (!pack || !sources.length) return;
    if (sources.some(source => !this.repo.verifyReflectiveLetterSources?.(pack.contract.scope, source)))
      throw new HarnessError('letter_source_changed', '来信中一处来由已经变化，先回到现在允许展开的内容。');
    this.recordWorkSourceBindings(pack, sources.map(source => source.binding));
    pack.receipt.reflectiveLetterSources = [...new Map([...(pack.receipt.reflectiveLetterSources || []), ...sources]
      .map(source => [canonical(source), structuredClone(source)])).values()];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Original work addresses support supplied prose or metadata. Recording an
   * address never claims the whole saved chapter was read or acknowledged. */
  recordAssistantWorkSources(pack: ContextPack | undefined, sources: AssistantWorkSource[]) {
    if (!pack || !sources.length) return;
    const combined = this.repo.compactAssistantWorkSources(pack.contract.scope,
      [...new Map([...(pack.receipt.assistantWorkSources || []), ...sources]
        .map(source => [canonical(source), structuredClone(source)])).values()]);
    if (!this.repo.assistantWorkSourcesReadable(pack.contract.scope, combined))
      throw new HarnessError('assistant_work_changed', '这份作品或共做页的一处来由已有变化，这次没有继续接入先前的正文；原页面保留现在可读的内容。');
    this.recordWorkSourceBindings(pack, this.repo.assistantWorkSourceBindings(pack.contract.scope, combined));
    pack.receipt.assistantWorkSources = combined;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'history:self'])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Notebook documents remain independent original sources; this records
   * actual delivered ranges without treating their contents as personal facts. */
  recordNoteSources(pack: ContextPack | undefined, sources: NoteSourceProof[]) {
    if (!pack || !sources.length) return;
    const combined = [...new Map([...(pack.receipt.noteSources || []), ...sources]
      .map(source => [canonical(source), structuredClone(source)])).values()];
    if (combined.length > 256) throw new HarnessError('note_source_budget', '这组独立笔记片段超过了本轮能同时保留的来源数量，本次没有把它合入，也没有截掉原来源。');
    if (!this.repo.noteSourcesReadable(pack.contract.scope, combined))
      throw new HarnessError('note_source_changed', '这份笔记的原版本目前已不可读，这次没有继续接入先前的正文；现在可读的版本仍归原笔记。');
    pack.receipt.noteSources = combined;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'notes:self'])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** A delivered workout snapshot stays historical through new GPS samples,
   * but its exact local owner identity follows an explicit deletion. */
  recordWorkoutSources(pack: ContextPack | undefined, sources: WorkoutSourceProof[]) {
    if (!pack || !sources.length) return;
    const combined = [...new Map([...(pack.receipt.workoutSources || []), ...sources]
      .map(source => [canonical(source), workoutSourceProofSchema.parse(source)])).values()];
    if (combined.length > 256) throw new HarnessError('workout_source_budget', '这次已经带入了很多独立运动记录，先缩小要继续看的范围。');
    if (!this.repo.workoutSourcesReadable(pack.contract.scope, combined))
      throw new HarnessError('workout_source_changed', '那次运动已被移除，先前读到的摘要不再用于这次交流。');
    pack.receipt.workoutSources = combined;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'workout:self'])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Carry only the exact endpoint proof actually supplied by its host owner.
   * Binding lifecycle metadata does not grant access to the original words. */
  recordSpatialSources(pack: ContextPack | undefined, sources: SpatialSourceProof[]) {
    if (!pack) return;
    const combined = [...new Map([...(pack.receipt.spatialSources || []), ...sources]
      .map(source => [canonical(source), structuredClone(source)])).values()];
    if (!combined.length) { delete pack.data.spatialBindingChanges; return; }
    if (combined.some(source => !spatialSourceProofSchema.safeParse(source).success)
      || !this.repo.spatialSourcesReadable(pack.contract.scope, combined))
      throw new HarnessError('spatial_source_changed', '这段地图关系所依据的地点或选择已经变化，先前结果目前不能继续使用。');
    const changes = combined.flatMap(source => {
      if (source.origin.kind !== 'binding') return [];
      const current = this.repo.spatialBindingRecords(pack.contract.scope, source.origin.id, true)[0];
      if (!current || current.revision === source.origin.revision) return [];
      return [{ id: current.id, usedRevision: source.origin.revision,
        currentRevision: current.revision, currentStatus: current.status,
        ...(typeof current.data.role === 'string' ? { role: current.data.role } : {}),
        ...(typeof current.data.alias === 'string' ? { alias: current.data.alias } : {}),
        read: { tool: 'manage_space', arguments: { operation: 'read', bindingId: current.id } } }];
    });
    if (changes.length) pack.data.spatialBindingChanges = { items: [...new Map(changes.map(change => [canonical(change), change])).values()],
      meaning: '有些地点叫法或对应关系后来改过，这里并排留下当时和现在的版本与状态。旧版本可接回那时的路线，沿read能看看现在怎样；原话和具体坐标仍在各自的来源里。' };
    else delete pack.data.spatialBindingChanges;
    pack.receipt.spatialSources = combined;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'map:local'])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  recordImageSourceVersions(pack: ContextPack | undefined, versions: ContextPack['receipt']['providedObjectVersions']) {
    if (!pack || !versions.length) return;
    const images = versions.filter(ref => ref.kind === 'evidence' && ref.imageSha256 !== undefined);
    if (!this.repo.imageSourceVersionsReadable(pack.contract.scope, images))
      throw new HarnessError('image_changed', '这段内容所依据的原图已变化，没有继续采用旧像素结果。');
    pack.receipt.providedObjectVersions = mergeProvidedObjectVersions([...pack.receipt.providedObjectVersions, ...images]);
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...images.map(ref => ref.id)])];
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...images.flatMap(ref => {
      const event = this.repo.evidence(pack.contract.scope, ref.id);
      return event ? [event.sourceId] : [];
    })])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Actual supplied historical text retains its original draft owner. Current
   * business reuse is checked separately when a new draft adopts the address. */
  recordReleaseSources(pack: ContextPack | undefined, sources: ReleaseSource[]) {
    if (!pack || !sources.length) return;
    const combined = [...new Map([...(pack.receipt.releaseSources || []), ...sources].map(source => [canonical(source), structuredClone(source)])).values()];
    if (this.repo.verifyReleaseSources?.(pack.contract.scope, combined, false, { checked: new Map() }) !== true)
      throw new HarnessError('release_source_changed', '这段稿件前情的一处原来源已变化，本次没有继续采用旧正文。');
    pack.receipt.releaseSources = combined;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'history:self'])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Actual history/child adoption carries original program addresses. This
   * is dependency metadata, never an assertion that DSL or bound data was read. */
  recordInteractiveProgramSources(pack: ContextPack | undefined, sources: InteractiveProgramSource[]) {
    if (!pack || !sources.length) return;
    const combined = [...new Map([...(pack.receipt.interactiveProgramSources || []), ...sources]
      .map(source => { const checked = interactiveProgramSourceSchema.parse(source); return [canonical(checked), checked] as const; })).values()];
    if (combined.length > 32) throw new HarnessError('interactive_source_budget', '这组独立交互来源超过了本轮能同时保留的数量，本次没有把它合入，也没有裁掉原来源。');
    if (this.repo.verifyInteractiveProgramSources?.(pack.contract.scope, combined) !== true)
      throw new HarnessError('interactive_source_changed', '这份交互作品或它的来由已有变化，这次没有继续接入先前的内容。');
    pack.receipt.interactiveProgramSources = structuredClone(combined);
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'history:self'])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Adopt a delivered notebook result and its proof in one transaction, so a
   * rejected range cannot remain in model-visible needs without provenance. */
  recordNoteTool(pack: ContextPack, result: CapabilityResult, capability: string, invocationScopeId: string,
    sources: NoteSourceProof[], modelView: unknown = result) {
    const bytes = Buffer.byteLength(canonical(result)), staged: ContextPack = { ...pack, receipt: structuredClone(pack.receipt),
      needs: structuredClone(pack.needs), data: { ...pack.data } };
    try {
      this.repo.write(() => {
        this.recordTool(staged, result, capability, invocationScopeId, modelView, undefined, true);
        this.recordNoteSources(staged, sources);
      });
      staged.data.needs = staged.needs;
      pack.receipt = staged.receipt; pack.needs = staged.needs; pack.data = staged.data;
    } catch (error) {
      pack.receipt.budget.readBytes += bytes; pack.receipt.coverage = 'blocked';
      try { this.repo.saveReceipt(pack.contract.scope, pack.receipt); } catch (problem) { if (!(problem instanceof HarnessError)) throw problem; }
      throw error;
    }
  }
  /** Carry the original assistance/anchor proof with supplied method prose.
   * A normal method revision does not replace this historical source basis. */
  recordPersonalMethodSources(pack: ContextPack | undefined, sources: PersonalMethodSources[]) {
    if (!pack || !sources.length) return;
    const combined = [...new Map([...(pack.receipt.personalMethodSources || []), ...sources]
      .map(source => [canonical(source), structuredClone(source)])).values()];
    if (combined.some(source => this.repo.verifyPersonalMethodSources?.(pack.contract.scope, source) !== true))
      throw new HarnessError('method_source_changed', '这个方法当时借用的帮助或原话已有变化，这次没有继续接入先前的文字；原来源保留现在仍可读的部分。');
    this.recordWorkSourceBindings(pack, sources.flatMap(source => [
      ...(source.methodBinding ? [source.methodBinding] : []),
      ...(source.workAssistance || []).map(help => help.sourceBinding),
      ...source.anchors.map(anchor => anchor.sourceBinding),
      ...source.assistance.map(assistance => this.repo.resolveWorkSourceBinding(pack.contract.scope, assistance.sourceRefs)),
    ]));
    pack.receipt.personalMethodSources = combined;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  recordCampusSensitiveReads(pack: ContextPack | undefined, reads: CampusSensitiveRead[]) {
    if (!pack || !reads.length) return;
    const combined = [...new Map([...(pack.receipt.campusSensitiveReads || []), ...reads].map(read => [canonical(read), structuredClone(read)])).values()];
    if (this.repo.verifyCampusSensitiveReads?.(pack.contract.scope, combined) !== true)
      throw new HarnessError('campus_purpose_changed', '这份成绩资料不在本轮已核清的用途内，未继续采用旧正文。');
    pack.receipt.campusSensitiveReads = combined;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  recordCampusReadingSources(pack: ContextPack, handle: ScopeHandle, sessionId: string, messageIds: string[]) {
    const sources = this.repo.conversationCampusReadingSources(handle, sessionId, messageIds);
    this.recordCampusSourceProofs(pack, sources);
  }
  recordCampusSourceProofs(pack: ContextPack | undefined, sources: CampusSavedReadingProof[], incomplete = false) {
    if (!pack || !sources.length && !incomplete) return;
    const combined = [...new Map([...(pack.receipt.campusReadingSources || []), ...sources].map(proof => [canonical(proof), proof])).values()];
    if (this.repo.verifyCampusReadingProofs?.(pack.contract.scope, combined) !== true)
      throw new HarnessError('campus_history_changed', '原来的校园资料与现在可读的来源没有对应上，先回当前资料再接着看。');
    pack.receipt.campusReadingSources = combined;
    if (incomplete) pack.receipt.campusReadingIncomplete = true;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'campus:zju-account'])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** A sensitive read adopts body and its current-purpose proof together.
   * A failed source/budget admission keeps only its physical read charge. */
  recordCampusTool(pack: ContextPack, result: CapabilityResult, capability: string, invocationScopeId: string,
    reads: () => CampusSensitiveRead[], modelView: unknown = projectCampusModelResult(capability, result), hostRead = false) {
    const bytes = Buffer.byteLength(canonical(result)), staged: ContextPack = { ...pack, receipt: structuredClone(pack.receipt),
      needs: structuredClone(pack.needs), data: { ...pack.data } };
    try {
      this.repo.write(() => {
        this.recordTool(staged, result, capability, invocationScopeId, modelView, undefined, hostRead);
        this.recordCampusSensitiveReads(staged, reads());
      });
      staged.data.needs = staged.needs;
      pack.receipt = staged.receipt; pack.needs = staged.needs; pack.data = staged.data;
    } catch (error) {
      pack.receipt.budget.readBytes += bytes; pack.receipt.coverage = 'blocked';
      try { this.repo.saveReceipt(pack.contract.scope, pack.receipt); } catch (problem) { if (!(problem instanceof HarnessError)) throw problem; }
      throw error;
    }
  }
  recordSourceBinding(pack: ContextPack | undefined, binding: NonNullable<WorkRecord['sourceBinding']>) {
    if (!pack) return;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...binding.sourceIds])];
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...binding.refs.map(ref => ref.eventId)])];
    for (const ref of binding.refs) {
      const previous = pack.receipt.providedObjectVersions.find(value => value.kind === 'evidence' && value.id === ref.eventId);
      if (previous) {
        if (previous.imageSha256 && previous.revision !== ref.contentVersion)
          throw new HarnessError('image_changed', '已采用的原图版本与这段来源不同，没有替换原依赖。');
        previous.revision = ref.contentVersion;
      }
      else pack.receipt.providedObjectVersions.push({ id: ref.eventId, revision: ref.contentVersion, kind: 'evidence' });
    }
  }
  recordPlanningAdoption(pack: ContextPack | undefined, value: unknown, record?: Pick<WorkRecord, 'id' | 'revision' | 'sourceBinding'>) {
    const adoption = value as { status?: string; retained?: { work?: { recordVersions: { id: string; revision: number }[] }[];
      boundaries?: { recordVersions: { id: string; revision: number }[] }[] }; attemptBasis?: { sourceBinding: NonNullable<WorkRecord['sourceBinding']> }[] } | undefined;
    if (!pack || !adoption) return;
    if (record?.sourceBinding) {
      const provenance = planningMaterialProvenanceSchema.parse({ intentId: record.id, intentRevision: record.revision,
        sourceBinding: record.sourceBinding, attemptBasis: adoption.attemptBasis || [] });
      this.recordPlanningProvenance(pack, [provenance]);
    }
    if (adoption.status === 'not_checked') return;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'local-agenda'])];
    for (const attempt of adoption.attemptBasis || []) this.recordSourceBinding(pack, attempt.sourceBinding);
    this.recordObjects(pack, [...(adoption.retained?.work || []), ...(adoption.retained?.boundaries || [])].flatMap(row => row.recordVersions), 'agenda');
  }
  recordPlanningProvenance(pack: ContextPack | undefined, values: PlanningMaterialProvenance[]) {
    if (!pack || !values.length) return;
    for (const value of values) {
      this.recordSourceBinding(pack, value.sourceBinding);
      for (const attempt of value.attemptBasis) this.recordSourceBinding(pack, attempt.sourceBinding);
    }
    pack.receipt.planningProvenance = [...new Map([...(pack.receipt.planningProvenance || []), ...values]
      .map(item => [canonical(item), item])).values()];
  }
  private recordDomainObjects(pack: ContextPack, records: any[]) {
    for (const record of records) {
      if (!record || !Number.isSafeInteger(record.revision) || record.revision < 1
        || ['id', 'sourceId', 'domain', 'institutionId', 'termId'].some(key => typeof record[key] !== 'string' || !record[key])) continue;
      const ref = { kind: 'domain' as const, id: record.id as string, revision: record.revision as number,
        sourceId: record.sourceId as string, domain: record.domain as string,
        institutionId: record.institutionId as string, termId: record.termId as string };
      const previous = pack.receipt.providedObjectVersions.find(value => value.kind === 'domain' && value.id === ref.id
        && value.sourceId === ref.sourceId && value.domain === ref.domain && value.institutionId === ref.institutionId && value.termId === ref.termId);
      if (previous) previous.revision = ref.revision;
      else pack.receipt.providedObjectVersions.push(ref);
    }
  }
  recordModelUsage(pack: ContextPack | undefined, usage: Completion['usage'], phase: string, responseModel?: string,
    failure?: { code: string; requestMaxOutputTokens?: number }) {
    if (!pack) return;
    const cost = usageCost(usage);
    const actualModel = typeof responseModel === 'string' && responseModel.length > 0 && responseModel.length <= 160 ? responseModel : undefined;
    const errorCode = failure && /^[a-zA-Z0-9_.:-]{1,80}$/.test(failure.code) ? failure.code : undefined;
    const requestMaxOutputTokens = failure && Number.isSafeInteger(failure.requestMaxOutputTokens)
      && Number(failure.requestMaxOutputTokens) > 0 ? failure.requestMaxOutputTokens : undefined;
    (pack.receipt.modelUsage ||= []).push({ phase, ...(actualModel ? { responseModel: actualModel } : {}),
      ...(failure ? { status: 'failed' as const, ...(errorCode ? { errorCode } : {}),
        ...(requestMaxOutputTokens !== undefined ? { requestMaxOutputTokens } : {}) } : {}),
      inputTokens: usage?.prompt_tokens ?? null, cachedInputTokens: usage?.prompt_cache_hit_tokens ?? null,
      outputTokens: usage?.completion_tokens ?? null, usdMin: cost?.usdMin ?? null, usdMax: cost?.usdMax ?? null });
    if (actualModel && pack.receipt.provider) pack.receipt.provider.observedResponseModels = [...new Set([
      ...(pack.receipt.provider.observedResponseModels || []), actualModel,
    ])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  recordProviderRequest(
    pack: ContextPack | undefined,
    metadata: ProviderMetadata | undefined,
    mode: { thinking: 'enabled' | 'disabled'; strict: boolean; tools: boolean },
  ) {
    if (!pack || !metadata) return;
    const previous = pack.receipt.provider;
    const thinking = previous?.requestModes?.thinking;
    const strict = previous?.requestModes?.strict;
    const provider: ProviderReceipt = {
      ...metadata,
      observedEndpoints: [
        ...new Set([...(previous?.observedEndpoints || []), metadata.endpoint]),
      ],
      ...(previous?.observedResponseModels?.length ? { observedResponseModels: [...previous.observedResponseModels] } : {}),
      capabilities: {
        ...metadata.capabilities,
        modalities: [...metadata.capabilities.modalities],
      },
      limits: {
        ...metadata.limits,
      },
      requestModes: {
        thinking:
          thinking && thinking !== mode.thinking
            ? 'mixed'
            : (thinking || mode.thinking),
        strict: strict !== undefined && strict !== mode.strict ? 'mixed' : (strict ?? mode.strict),
        tools: Boolean(previous?.requestModes?.tools || mode.tools),
      },
    };
    pack.receipt.provider = provider;
    pack.receipt.providerVersion = `${provider.protocol}/${provider.protocolVersion}`;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  recordTool(pack: ContextPack, result: CapabilityResult, capability: string, invocationScopeId = pack.contract.scope.id,
    modelView: unknown = projectCampusModelResult(capability, projectMapModelResult(capability, result)), attemptId?: string, hostRead = false) {
    this.policy.validate(pack.contract.scope);
    if (capability === 'workout.current') this.recordWorkoutSources(pack, workoutObservationSources(result));
    const attempt = this.broker.invocations
      .filter((i) => i.scopeId === invocationScopeId && i.capability === capability && (!attemptId || i.id === attemptId))
      .at(-1);
    if (attempt && !pack.receipt.toolAttempts.some(value => value.id === attempt.id))
      pack.receipt.toolAttempts.push({ id: attempt.id, capability, status: result.status, version: attempt.version, cache: attempt.cache });
    const serialized = canonical(result), bytes = Buffer.byteLength(serialized);
    // A multi-leg read records each physical result, but sends one aggregate
    // observation. null means this raw leg adds no separate model message.
    const modelSerialized = modelView === null ? '' : canonical(modelView), tokens = Math.ceil(Array.from(modelSerialized).length / 1.4);
    pack.receipt.budget.readBytes += bytes;
    pack.receipt.budget.estimatedTokens += tokens;
    const modelResult = projectCampusModelResult(capability, projectMapModelResult(capability, result));
    const modelData = modelView && typeof modelView === 'object' && 'data' in modelView
      ? (modelView as CapabilityResult).data : modelResult.data;
    const data = result.data as Record<string, any> | undefined;
    if (capability.startsWith('materials.') && modelData && typeof modelData === 'object') {
      const material = modelData as { source?: any; items?: { source?: any }[] };
      const scope = this.policy.validate(pack.contract.scope);
      // Temporary attachments live only among this pack's current events.
      // Reusing that exact admitted event keeps the normal material receipt
      // without asking SQLite to persist or rediscover a temporary original.
      const originalEvent = (id: string) => this.repo.evidence(pack.contract.scope, id)
        || (scope.retention === 'session_only' && scope.currentEventIds.includes(id) ? pack.evidence.find(event => event.id === id
          && event.ownerId === scope.principalId && event.workspaceId === scope.workspaceId
          && event.label.retention === 'session_only' && event.status === 'active' && !this.repo.hasFence(event.id, event.sourceId)) : undefined);
      for (const source of [material.source, ...(Array.isArray(material.items) ? material.items.map(item => item.source) : [])]) {
        if (source?.kind !== 'user_selected_file' || typeof source.sourceEventId !== 'string') continue;
        const event = originalEvent(source.sourceEventId);
        if (!event || event.contentVersion !== source.contentVersion)
          throw new HarnessError('material_changed', '文件来源在读取时有了变化，请重新寻找当前原文。');
        const originals = [event, ...(Array.isArray(source.roots) ? source.roots.filter((id: unknown) => typeof id === 'string' && id !== event.id)
          .flatMap((id: string) => { const root = originalEvent(id); return root ? [root] : []; }) : [])];
        pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...originals.map(original => original.id)])];
        pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...originals.map(original => original.sourceId)])];
        this.recordObjects(pack, originals.map(original => ({ id: original.id, revision: original.contentVersion })), 'evidence');
      }
    }
    const recordAgenda = (items: any[]) => this.recordObjects(pack, items.filter(item => item && typeof (item.sourceActionId || item.seriesId || item.id) === 'string')
      .map(item => ({ id: item.sourceActionId || item.seriesId || item.id, revision: item.revision || 1 })), 'agenda');
    if (capability === 'local.agenda.read' && Array.isArray(data?.items)) recordAgenda(data.items);
    if (capability === 'planning.replan' && data?.record) {
      this.recordWorkSources(pack, [data.record]);
      this.recordPlanningAdoption(pack, data.adoptionEvidence, data.record);
    }
    if (['planning.draft', 'planning.replan', 'planning.compare', 'situation.read'].includes(capability) && data?.campusCalendar?.sourceId === 'campus:zju-account')
      pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), data.campusCalendar.sourceId])];
    if (['planning.draft', 'planning.replan'].includes(capability) && Array.isArray(data?.sourceRevisions))
      this.recordObjects(pack, data.sourceRevisions.filter((row: any) => typeof row.occurrenceId === 'string' && Number.isSafeInteger(Number(row.sourceVersion)) && Number(row.sourceVersion) > 0)
        .map((row: any) => ({ id: row.sourceId, revision: Number(row.sourceVersion) })), 'agenda');
    if (capability === 'planning.preview') recordAgenda([
      ...(Array.isArray(data?.busy) ? data.busy : []), ...(Array.isArray(data?.pending) ? data.pending : []),
      ...(Array.isArray(data?.acceptedMovable) ? data.acceptedMovable : []),
      ...(Array.isArray(data?.alternatives) ? data.alternatives.flatMap((option: any) => option.before ? [option.before] : []) : []),
    ]);
    if (capability === 'planning.compare') {
      recordAgenda(Array.isArray(data?.baseline) ? data.baseline : []);
      for (const branch of Array.isArray(data?.branches) ? data.branches : []) {
        recordAgenda(Array.isArray(branch.preserved) ? branch.preserved : []);
        recordAgenda(Array.isArray(branch.changes) ? branch.changes.map((change: any) => change.before).filter(Boolean) : []);
        if (Array.isArray(branch.draft?.sourceRevisions)) this.recordObjects(pack, branch.draft.sourceRevisions
          .filter((row: any) => typeof row.sourceId === 'string' && Number.isSafeInteger(Number(row.sourceVersion)) && Number(row.sourceVersion) > 0)
          .map((row: any) => ({ id: row.sourceId, revision: Number(row.sourceVersion) })), 'agenda');
      }
    }
    if (capability === 'situation.read') {
      if (Array.isArray(data?.localAgenda?.items)) recordAgenda(data.localAgenda.items);
      this.recordObjects(pack, [...(Array.isArray(data?.goals) ? data.goals : []), ...(Array.isArray(data?.commitments) ? data.commitments : [])]
        .filter(item => typeof item.id === 'string' && Number.isSafeInteger(item.revision)), 'work');
      this.recordDomainObjects(pack, (Array.isArray(data?.campus) ? data.campus : [])
        .flatMap((group: any) => Array.isArray(group.records) ? group.records.map((record: any) => ({ ...record, domain: record.domain || group.domain })) : []));
    }
    if (capability === 'campus.imported_lookup' && Array.isArray(data?.materialVersions))
      this.recordDomainObjects(pack, data.materialVersions.filter((record: any) => record.kind === 'domain'));
    if (result.data) {
      pack.receipt.providedSourceIds = [
        ...new Set([...(pack.receipt.providedSourceIds || []), result.sourceId]),
      ];
      if (capability === 'evidence.search')
        for (const entry of (result.data as any).results || [])
          if (typeof entry.id === 'string' && this.repo.evidence(pack.contract.scope, entry.id))
            pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, entry.id])];
    }
    const key =
      capability === 'campus.lookup'
        ? (result.data as any)?.domain || 'campus'
        : capability === 'weather.lookup'
          ? 'weather'
          : capability;
    const existing = pack.needs.find((n) => n.key === key || n.capability === capability);
    if (existing) {
      existing.status = result.status;
      existing.value = modelData;
      existing.reason = result.reason;
      existing.fetchedAt = result.fetchedAt;
      existing.coverage = result.coverage;
    } else
      pack.needs.push({
        id: key,
        key,
        capability,
        status: result.status,
        evidenceIds: [],
        value: modelData,
        reason: result.reason,
        fetchedAt: result.fetchedAt,
        coverage: result.coverage,
      });
    pack.receipt.needResults = pack.needs.map((n) => ({ key: n.key, status: n.status }));
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  includeVolatileConversation(pack: ContextPack, dialogue: { id: string; role: 'user' | 'assistant'; content: string; sourceContext?: EvidenceEvent['sourceContext'] }[]) {
    const scope = this.policy.validate(pack.contract.scope);
    if (scope.retention !== 'session_only' || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real' || !scope.sources.includes('history:self') || !this.policy.can(pack.contract.scope, 'evidence:read')) throw new HarnessError('history_scope', '本轮范围不允许使用临时前情。');
    const recent = dialogue.slice(-6), text = canonical(recent), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
    pack.data.volatileConversationHistory = recent.map(message => ({ ...message, origin: 'current_conversation_memory_only', persisted: false, authority: 'historical_context_not_current_delegation' }));
    pack.data.sourceContextMeaning = [...new Set([
      ...(Array.isArray(pack.data.sourceContextMeaning) ? pack.data.sourceContextMeaning : []),
      ...sourceContextGuidance(...recent.map(message => message.sourceContext)),
    ])];
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    return { status: 'included' };
  }
  serializeForContinuation(pack: ContextPack, retained: ModelWireMessage[], coverage: ProtocolHistoryCoverage[] = []) {
    if (!retained.length || pack.contract.audience !== 'self') return this.serialize(pack);
    const history = Array.isArray(pack.data.history) ? pack.data.history as { id: string; role: string; content: string }[] : [];
    const proven = validatedProtocolCoverage(retained, coverage);
    const reused = history.filter(item => proven.some(proof => proof.id === item.id && proof.role === item.role
      && proof.contentFingerprint === protocolBodyFingerprint(item.content)));
    const remaining = history.filter(item => !reused.includes(item));
    const data: ContextPack['data'] = { ...pack.data, history: remaining };
    const directory = pack.data.capabilityDirectory as { items?: Record<string, unknown>[]; more?: boolean; meaning?: string } | undefined;
    const retainedTexts = retained.flatMap(message => typeof message.content === 'string' ? [message.content]
      : Array.isArray(message.content) ? message.content.flatMap(part => part.type === 'text' ? [part.text] : []) : []);
    if (directory?.items && retainedTexts.some(text => text.includes(canonical(directory)))) {
      data.capabilityDirectory = { ...directory, items: directory.items.map(({ description: _description, ...item }) => item), meaning: '完整说明前面已经给过；这里只更新这一轮各提供方能否工作。' };
    }
    if (reused.length) {
      data.historyReused = reused.map(({ content, ...metadata }) => ({ ...metadata, bodyProvided: 'retained_protocol',
        bodyLocation: proven.some(proof => proof.id === metadata.id && proof.role === metadata.role
          && proof.contentFingerprint === protocolBodyFingerprint(content) && proof.representation !== 'host_reference_history')
          ? 'original_role_messages' : 'host_history_reference' }));
      data.historyReuse = '这些消息的完整正文前面已经给过，沿原消息或所列历史位置就能接着读。它们保留当时谁说的、从哪里来和回复状态，接话时仍放回当时的语境里。';
    }
    return this.serialize({ ...pack, data });
  }
  serialize(pack: ContextPack) {
    this.policy.validate(pack.contract.scope);
    // Public/group drafting receives a release brief and explicitly allowed
    // projection only. Never serialize the authored event, speech acts,
    // history bundles or private work state into this model boundary.
    if (pack.contract.audience !== 'self') {
      return redactCredentials(
        canonical({
          scope: {
            audience: pack.contract.audience,
            purpose: pack.contract.purpose,
            memoryMode: pack.contract.memoryMode,
            retention: pack.contract.retention,
          },
          time: pack.data.time,
          interactionMode: pack.data.interactionMode,
          releaseSpec: pack.data.releaseSpec,
          availabilityProjection: pack.data.availabilityProjection,
          coverage: pack.receipt.coverage,
          limitations: pack.data.limitations,
        }),
      );
    }
    if (pack.receipt.coverage === 'blocked')
      return redactCredentials(
        canonical({
          scope: pack.data.scope,
          time: pack.data.time,
          currentRequest: pack.currentText,
          coverage: 'blocked',
          limitations: pack.data.limitations,
          missing: pack.receipt.needResults,
        }),
      );
    return redactCredentials(canonical(pack.data));
  }
}
