import { createHash, randomUUID } from 'node:crypto';
import { HarnessError, type EvidenceEvent, type ScopeData, type ScopeHandle } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import { canonical, codePointSlice } from '../runtime/semantics';
import { EMBEDDING_CONTRACT, LocalEmbeddingError } from './embedding-contract';
import type { LocalEmbeddingRuntime } from './embedding-runtime';
import { recallQueries } from './retrieval';
import { saveSemanticChunks, semanticChunkMetadata, semanticChunkVector, semanticCoverage,
  type SemanticChunk, type SemanticChunkMetadata, type SemanticRange } from './semantic-store';

export interface SemanticRecallOptions {
  signal?: AbortSignal;
  /** Original Unicode coordinates, supplied by the host; never inferred from a quote. */
  projectRanges?: (event: EvidenceEvent) => readonly SemanticRange[] | undefined;
  /** Host identity of the exact projection, including its source version/ranges. */
  projectionKey?: string;
  maxReadBytes: number;
  /** Host result/context reservation when this page is a private fusion window. */
  reserveReadBytes?: number;
  maxRows: number;
  offset?: number;
  limit?: number;
  /** Required after the first page; freezes rank addresses while indexing grows. */
  rankingId?: string;
  /** Next source/chunk enumeration window, independent of within-window rank pages. */
  windowCursor?: string;
  sourceIds?: string[];
  receivedFrom?: string;
  receivedBefore?: string;
  /** Charge the original shared budget immediately, including interrupted work.
   * chargedReadBytes in the result is diagnostic and must not be charged again. */
  onReadBytes?: (bytes: number) => void;
}
export interface SemanticRecallItem {
  id: string;
  eventId: string;
  contentVersion: number;
  sourceId: string;
  receivedAt: string;
  preview: string;
  previewOnly: true;
  sourceStart: number;
  startCodePoint: number;
  endCodePoint: number;
  matchedRange: SemanticRange;
  readEvidence: { eventId: string; contentVersion: number; start: number; end: number };
  semanticScore: number;
  rankingOnly: true;
}
export interface SemanticIndexGap {
  reason: 'index_scan_pending' | 'index_budget' | 'index_busy' | 'candidate_window'
    | 'unindexed_range' | 'invalid_vector' | 'runtime_unavailable' | 'source_changed'
    | 'ranking_snapshot_required' | 'ranking_snapshot_changed' | 'index_read_only' | 'window_snapshot_changed';
  eventId?: string;
  contentVersion?: number;
  start?: number;
  end?: number;
  code?: string;
}
export interface SemanticRecallResult {
  status: 'fresh' | 'partial' | 'not_found' | 'not_connected' | 'forbidden';
  methodId: string;
  items: SemanticRecallItem[];
  nextOffset: number | null;
  rankingId: string | null;
  nextWindowCursor: string | null;
  restartRequired: boolean;
  chargedReadBytes: number;
  indexGap: SemanticIndexGap[];
  coverage: {
    /** Opaque process-local identifier; not a global evidence sequence. */
    snapshot: string;
    indexing: 'permitted' | 'read_only';
    indexScanComplete: boolean;
    indexComplete: boolean;
    newerSourcesPending: boolean;
    scannedSources: number;
    eligibleSources: number;
    indexedSources: number;
    processedSourcesInSnapshot: number;
    candidateEvents: number;
    candidateChunks: number;
    candidateWindowOnly: boolean;
    windowOrdinal: number;
    windowRanking: 'within_window_only';
    moreMayExist: boolean;
    candidateEventLimit: number;
    candidateChunkLimit: number;
    gapDetailsTruncated: boolean;
    meaning: string;
  };
}

interface IndexPosition {
  id: string;
  snapshot: number;
  before: number;
  complete: boolean;
  processed: number;
  expiresAt: number;
  busy: boolean;
  repairBefore?: number;
  catalogueHash?: string;
}
interface SourceBaseline { eventId: string; contentVersion: number; textHash: string; rangesHash: string }
interface Admitted { event: EvidenceEvent; ranges: SemanticRange[] }
interface Candidate { event: EvidenceEvent; address: SemanticChunkMetadata; score: number }
interface RankingSnapshot {
  binding: string;
  queryHash: string;
  catalogueHash: string;
  expiresAt: number;
  candidates: (SemanticChunkMetadata & { score: number })[];
  sources: SourceBaseline[];
  indexGap: SemanticIndexGap[];
  coverage: SemanticRecallResult['coverage'];
  nextWindowCursor: string | null;
}
interface CandidateWindowPosition {
  snapshot: number;
  before: number;
  ordinal: number;
  pending?: { eventId: string; sequence: number; contentVersion: number; afterStart: number; afterEnd: number };
}
interface CandidateWindowSnapshot {
  binding: string;
  queryHash: string;
  sourceCatalogueHash: string;
  chunkCatalogueHash: string;
  expiresAt: number;
  position: CandidateWindowPosition;
  indexGap: SemanticIndexGap[];
  coverage: SemanticRecallResult['coverage'];
}
const CANDIDATE_EVENTS = 4096;
const CANDIDATE_CHUNKS = 16_384;
const GAP_DETAILS = 12;
const PREVIEW_POINTS = 160;
const WINDOW_GUIDANCE = '排名仅限本候选窗口；nextWindowCursor继续旧来源，rankingId只分页本窗口，不能当成全库相关性排序。';
export const SEMANTIC_INDEX_CHECKPOINT_PREFIX = 'semantic_index_checkpoint:';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const signature = (value: unknown) => hash(canonical(value));
const placeholders = (values: readonly unknown[]) => values.map(() => '?').join(',') || 'NULL';
const sourceReadGrant = (source: string) => source === 'profile:self' ? 'memory:read'
  : source.startsWith('campus:') ? 'campus:read' : 'evidence:read';
const contains = (ranges: readonly SemanticRange[], range: SemanticRange) =>
  ranges.some(allowed => range.start >= allowed.start && range.end <= allowed.end && range.end > range.start);

function ranges(value: readonly SemanticRange[], length: number) {
  const result: SemanticRange[] = [];
  for (const range of [...value].sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
      || range.start < 0 || range.end <= range.start || range.end > length)
      throw new HarnessError('semantic_projection_invalid', '原文候选缺少合法的精确来源范围。');
    const last = result.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else result.push({ start: range.start, end: range.end });
  }
  return result;
}
function intersection(left: readonly SemanticRange[], right: readonly SemanticRange[]) {
  return left.flatMap(a => right.flatMap(b => {
    const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
    return end > start ? [{ start, end }] : [];
  }));
}
function vectorNorm(vector: Float32Array) {
  if (!(vector instanceof Float32Array) || vector.length !== EMBEDDING_CONTRACT.dimensions
    || vector.some(value => !Number.isFinite(value)))
    throw new HarnessError('semantic_vector_invalid', '本地候选向量不符合固定方法。');
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || !norm) throw new HarnessError('semantic_vector_invalid', '本地候选向量无法归一化。');
  return norm;
}
function cosine(left: Float32Array, right: Float32Array, leftNorm: number) {
  const rightNorm = vectorNorm(right);
  let dot = 0;
  for (let index = 0; index < left.length; index++) dot += left[index] * right[index];
  return Math.max(-1, Math.min(1, dot / (leftNorm * rightNorm)));
}
/** Exact UTF-8 budget, preserving the original Unicode coordinates. */
function passagePrefix(event: EvidenceEvent, range: SemanticRange, maxBytes: number) {
  const points = Array.from(codePointSlice(event.text, range.start, range.end));
  let bytes = 0, length = 0;
  for (const point of points) {
    const next = Buffer.byteLength(point);
    if (bytes + next > maxBytes || length >= EMBEDDING_CONTRACT.maxCodePointsPerRequest) break;
    bytes += next; length++;
  }
  return { text: points.slice(0, length).join(''), startCodePoint: range.start, endCodePoint: range.start + length, bytes };
}
function sourceBaseline(source: Admitted): SourceBaseline {
  return { eventId: source.event.id, contentVersion: source.event.contentVersion,
    textHash: hash(source.event.text), rangesHash: signature(source.ranges) };
}
function recallItem(event: EvidenceEvent, address: SemanticChunkMetadata, score: number): SemanticRecallItem {
  const end = Math.min(address.end, address.start + PREVIEW_POINTS);
  return { id: event.id, eventId: event.id, contentVersion: event.contentVersion, sourceId: event.sourceId,
    receivedAt: event.receivedAt, preview: codePointSlice(event.text, address.start, end), previewOnly: true,
    sourceStart: address.start, startCodePoint: address.start, endCodePoint: end, matchedRange: { start: address.start, end: address.end },
    readEvidence: { eventId: event.id, contentVersion: event.contentVersion, start: address.start, end: address.end },
    semanticScore: score, rankingOnly: true };
}

/** A bounded local candidate arm over the original evidence owner. The index
 * contains no copied bodies, no facts, and no independent agent/background loop.
 * Index continuation is unrelated to browse/read frontier consumption or ACK. */
export class SemanticRecallService {
  private readonly positions = new Map<string, IndexPosition>();
  private readonly rankings = new Map<string, RankingSnapshot>();
  private readonly windows = new Map<string, CandidateWindowSnapshot>();
  constructor(readonly repo: KernelRepository, readonly runtime: LocalEmbeddingRuntime) {}

  /** An address is not a saved scope or authority. The caller has already
   * computed today's exact index binding and will re-admit every visited row. */
  private restorePosition(binding: string, watermark: number, now: number): IndexPosition | undefined {
    let value: unknown;
    try { value = this.repo.getMeta<unknown>(SEMANTIC_INDEX_CHECKPOINT_PREFIX + binding); }
    catch { return; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const checkpoint = value as Record<string, unknown>;
    const { snapshot, before, processed, complete, catalogueHash, at } = checkpoint;
    if (typeof snapshot !== 'number' || !Number.isSafeInteger(snapshot) || snapshot < 0 || snapshot > watermark
      || typeof before !== 'number' || !Number.isSafeInteger(before) || before < 0 || before > snapshot + 1
      || typeof processed !== 'number' || !Number.isSafeInteger(processed) || processed < 0
      || typeof complete !== 'boolean' || typeof catalogueHash !== 'string' || !/^[a-f0-9]{64}$/.test(catalogueHash)
      || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return;
    return { id: randomUUID(), snapshot, before, processed, complete, catalogueHash, busy: false, expiresAt: now + 30 * 60_000 };
  }

  private scopeBinding(scope: ScopeData, currentEventIds = scope.currentEventIds) {
    return signature({ principal: scope.principalId, workspace: scope.workspaceId, subject: scope.subjectId,
      world: scope.worldId, audience: scope.audience, retention: scope.retention, infer: scope.infer,
      child: scope.child,
      epoch: scope.privacyEpoch, revision: scope.policyRevision, sources: [...scope.sources].sort(),
      current: [...currentEventIds].sort(), purposes: [...scope.purposes].sort(), grants: [...scope.grants].sort() });
  }
  private eligible(scope: ScopeData, event: EvidenceEvent) {
    const grant = scope.currentEventIds.includes(event.id) ? 'evidence:read' : sourceReadGrant(event.sourceId);
    return scope.audience === 'self'
      && scope.subjectId === scope.principalId && scope.worldId === 'real'
      && event.ownerId === scope.principalId && event.workspaceId === scope.workspaceId
      && event.subjectId === scope.principalId && event.worldId === 'real'
      && event.label.audience === 'self' && event.label.retention === 'purpose_scoped' && event.label.infer
      && event.speaker === 'user' && event.authority === 'user_statement'
      && (event.kind === 'user_message' || event.kind === 'user_control') && event.status !== 'deleted'
      && scope.purposes.includes(event.label.purpose) && scope.grants.includes(grant)
      && (scope.currentEventIds.includes(event.id) || scope.sources.includes(event.sourceId));
  }
  private admit(handle: ScopeHandle, eventId: string, options: SemanticRecallOptions): Admitted | undefined {
    const event = this.repo.evidence(handle, eventId), scope = this.repo.scope(handle);
    if (!event || !this.eligible(scope, event)) return;
    const length = Array.from(event.text).length;
    const legal = ranges(this.repo.availableInferenceRanges(event), length);
    const allowed = options.projectRanges ? ranges(options.projectRanges(event) || [], length) : legal;
    const selected = ranges(intersection(legal, allowed), length);
    return selected.length ? { event, ranges: selected } : undefined;
  }
  private chunks(source: Admitted) {
    return semanticChunkMetadata(this.repo.db, source.event.id, EMBEDDING_CONTRACT.methodId).filter(chunk =>
      chunk.contentVersion === source.event.contentVersion && chunk.dimensions === EMBEDDING_CONTRACT.dimensions
      && Number.isSafeInteger(chunk.start) && Number.isSafeInteger(chunk.end)
      && contains(source.ranges, chunk) && hash(codePointSlice(source.event.text, chunk.start, chunk.end)) === chunk.textSha256);
  }

  async search(handle: ScopeHandle, queryInput: string[], options: SemanticRecallOptions): Promise<SemanticRecallResult> {
    options.signal?.throwIfAborted();
    if (!Number.isSafeInteger(options.maxReadBytes) || options.maxReadBytes < 0
      || options.reserveReadBytes !== undefined && (!Number.isSafeInteger(options.reserveReadBytes) || options.reserveReadBytes < 0)
      || !Number.isSafeInteger(options.maxRows) || options.maxRows < 0
      || options.offset !== undefined && (!Number.isSafeInteger(options.offset) || options.offset < 0)
      || options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1))
      throw new HarnessError('semantic_budget_invalid', '本地候选范围或共享读取预算不合法。');
    if (options.projectRanges && !options.projectionKey)
      throw new HarnessError('semantic_projection_invalid', '受限原文候选需要宿主绑定的精确范围版本。');
    for (const time of [options.receivedFrom, options.receivedBefore])
      if (time !== undefined && !Number.isFinite(Date.parse(time))) throw new HarnessError('invalid_time', '原文候选的收到时间不合法。');
    if (options.receivedFrom && options.receivedBefore && Date.parse(options.receivedFrom) >= Date.parse(options.receivedBefore))
      throw new HarnessError('invalid_time', '原文候选的开始时间须早于结束时间。');
    const scope = this.repo.scope(handle), originalBinding = this.scopeBinding(scope);
    // Read-only investigations and temporary conversations may query legal
    // existing candidates. Only the original persistent owner scope may add or
    // repair derived vectors; a transient query vector is never persisted.
    const canIndex = scope.infer && scope.retention === 'purpose_scoped' && !scope.child;
    const limit = Math.min(51, options.limit ?? 8), offset = options.offset ?? 0;
    if (options.windowCursor && (offset || options.rankingId))
      throw new HarnessError('semantic_window_invalid', '候选窗口续接须使用offset=0且不带排名分页标识。');
    const queries = recallQueries(queryInput[0] || '', queryInput.slice(1));
    const indexGap: SemanticIndexGap[] = [];
    let gapDetailsTruncated = false, chargedReadBytes = 0;
    const addGap = (gap: SemanticIndexGap) => {
      if (indexGap.some(existing => canonical(existing) === canonical(gap))) return;
      if (indexGap.length < GAP_DETAILS) indexGap.push(gap); else gapDetailsTruncated = true;
    };
    const result: SemanticRecallResult = { status: 'partial', methodId: EMBEDDING_CONTRACT.methodId, items: [], nextOffset: null,
      rankingId: null, nextWindowCursor: null, restartRequired: false,
      chargedReadBytes: 0, indexGap, coverage: { snapshot: '', indexing: canIndex ? 'permitted' : 'read_only',
        indexScanComplete: false, indexComplete: false,
        newerSourcesPending: false, scannedSources: 0, eligibleSources: 0, indexedSources: 0, processedSourcesInSnapshot: 0,
        candidateEvents: 0, candidateChunks: 0, candidateWindowOnly: false, windowOrdinal: 0, windowRanking: 'within_window_only',
        moreMayExist: true, candidateEventLimit: CANDIDATE_EVENTS,
        candidateChunkLimit: CANDIDATE_CHUNKS, gapDetailsTruncated: false,
        meaning: '仅为当前许可原文的候选排名；索引覆盖不证明条件齐备，未命中不证明没有记忆。预览须继续read_evidence。'
          + (canIndex ? '' : '本轮仅读取既存索引，未扫描或补齐全部原文索引，覆盖保持未知。') } };
    const finish = () => {
      result.chargedReadBytes = chargedReadBytes; result.coverage.gapDetailsTruncated = gapDetailsTruncated;
      return result;
    };
    if (scope.audience !== 'self'
      || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
      || !scope.grants.some(grant => ['evidence:read', 'memory:read', 'campus:read'].includes(grant))) {
      result.status = 'forbidden'; return finish();
    }
    const sourceIds = [...new Set(options.sourceIds ?? scope.sources.filter(source => source !== 'current'))].sort();
    if (sourceIds.some(source => source === 'current' || !scope.sources.includes(source)))
      throw new HarnessError('source_forbidden', '本轮不允许从所选来源取得原文候选。');
    // Current-only scopes use their real event source without widening the SQL
    // scope filter to any sibling message from the same source.
    if (!options.sourceIds && scope.grants.includes('evidence:read')) for (const id of scope.currentEventIds) {
      const event = this.repo.evidence(handle, id);
      if (event && !sourceIds.includes(event.sourceId)) sourceIds.push(event.sourceId);
    }
    sourceIds.sort();
    const baseline = this.repo.sourceRestrictionSnapshot(handle);
    const bindingParts = { sources: sourceIds, receivedFrom: options.receivedFrom,
      receivedBefore: options.receivedBefore, projection: options.projectionKey || 'full-legal-ranges',
      restrictions: [...baseline].sort(([left], [right]) => left.localeCompare(right)), method: EMBEDDING_CONTRACT.methodId };
    // Rankings remain bound to the exact turn. Index continuation may ignore a
    // current ID only when the same selected persistent source and its own read
    // grant already admit that event without the current-ID exception. Every
    // extra current-only authority, and the exact projection, stays in the key.
    const binding = signature({ scope: originalBinding, ...bindingParts });
    const extraCurrentIds = scope.currentEventIds.filter(id => {
      const event = this.repo.evidence(handle, id);
      return !event || event.sourceId === 'current' || !scope.sources.includes(event.sourceId)
        || !sourceIds.includes(event.sourceId) || !scope.grants.includes('evidence:read')
        || !scope.grants.includes(sourceReadGrant(event.sourceId));
    });
    const indexBinding = signature({ scope: this.scopeBinding(scope, extraCurrentIds), ...bindingParts });
    const now = Date.parse(this.repo.clock.now()), watermark = this.repo.getMeta<number>('received_seq', 0);
    if (canIndex) for (const [key, cursor] of this.positions)
      if (!cursor.busy && cursor.expiresAt <= now) this.positions.delete(key);
    const previousPosition = canIndex ? this.positions.get(indexBinding) ?? this.restorePosition(indexBinding, watermark, now) : undefined;
    let position: IndexPosition = previousPosition || { id: randomUUID(), snapshot: watermark, before: watermark + 1,
      complete: false, processed: 0, expiresAt: now + 30 * 60_000, busy: false };
    if (canIndex && !this.positions.has(indexBinding)) {
      while (this.positions.size >= 64) {
        const disposable = [...this.positions].find(([, cursor]) => !cursor.busy);
        if (!disposable) break;
        this.positions.delete(disposable[0]);
      }
      if (this.positions.size < 64) this.positions.set(indexBinding, position);
    }
    result.coverage.snapshot = position.id;
    const used = new Map<string, SourceBaseline>();
    const guard = () => {
      options.signal?.throwIfAborted();
      if (this.scopeBinding(this.repo.scope(handle)) !== originalBinding
        || this.repo.sourceRestrictionsChanged(handle, baseline, [...used.keys()]))
        throw new HarnessError('semantic_source_changed', '原文使用范围已改变，旧本地候选已停止。');
      for (const prior of used.values()) {
        const current = this.admit(handle, prior.eventId, options);
        if (!current || current.event.contentVersion !== prior.contentVersion || hash(current.event.text) !== prior.textHash
          || signature(current.ranges) !== prior.rangesHash)
          throw new HarnessError('semantic_source_changed', '原文或精确许可片段已改变，旧本地候选已停止。');
      }
    };
    const checkpoint = (update: Partial<Pick<IndexPosition, 'before' | 'processed' | 'complete'>> = {}) => {
      if (!canIndex) return;
      const next = { ...position, ...update }, key = SEMANTIC_INDEX_CHECKPOINT_PREFIX + indexBinding;
      if (position.repairBefore !== undefined) {
        next.before = Math.max(next.before, position.repairBefore); next.complete = false;
      }
      this.repo.write(() => {
        guard();
        this.repo.setMeta(key, { snapshot: next.snapshot, before: next.before, processed: next.processed,
          complete: next.complete, catalogueHash: next.catalogueHash, at: this.repo.clock.now() });
        // Keep this checkpoint and the 63 most recently used independent keys.
        // No TTL: reopening the product must not repeatedly starve old originals.
        this.repo.db.prepare(`DELETE FROM h_meta WHERE key IN (SELECT key FROM h_meta WHERE key GLOB ? AND key!=?
          ORDER BY CASE WHEN json_valid(value) THEN json_extract(value,'$.at') ELSE '' END DESC,key DESC LIMIT -1 OFFSET 63)`)
          .run(SEMANTIC_INDEX_CHECKPOINT_PREFIX + '*', key);
      });
      Object.assign(position, { before: next.before, processed: next.processed, complete: next.complete });
    };
    const remember = (source: Admitted) => {
      const prior = used.get(source.event.id), next = sourceBaseline(source);
      if (prior && canonical(prior) !== canonical(next))
        throw new HarnessError('semantic_source_changed', '原文候选不能为旧处理重设来源基线。');
      used.set(source.event.id, next);
    };
    const use = (source: Admitted) => { remember(source); guard(); };
    // This is a local inference read, not evidence already supplied to the main
    // model. Reserve result/context space before spending the shared allowance.
    const outputReserve = Math.min(options.maxReadBytes, Math.max(4096, options.reserveReadBytes ?? 4096 + limit * 1536));
    const queryBytes = queries.reduce((total, query) => total + Buffer.byteLength(query), 0);
    const charge = (bytes: number) => { options.onReadBytes?.(bytes); chargedReadBytes += bytes; };
    const readableSources = sourceIds.filter(source => scope.grants.includes(sourceReadGrant(source)));
    const readableCurrent = scope.grants.includes('evidence:read') ? scope.currentEventIds : [];
    const sql = () => {
      const filter = this.repo.filter(handle);
      return { text: `${filter.sql} AND r.status IN ('active','redacted') AND r.infer=1 AND r.retain='purpose_scoped'
        AND r.audience='self' AND r.world='real' AND r.subject=r.owner
        AND json_extract(r.payload,'$.speaker')='user' AND json_extract(r.payload,'$.authority')='user_statement'
        AND json_extract(r.payload,'$.kind') IN ('user_message','user_control')
        AND r.source IN (${placeholders(sourceIds)})
        AND (r.source IN (${placeholders(readableSources)}) OR r.id IN (${placeholders(readableCurrent)}))
        ${options.receivedFrom ? 'AND julianday(r.received_at)>=julianday(?)' : ''}
        ${options.receivedBefore ? 'AND julianday(r.received_at)<julianday(?)' : ''}`,
      params: [...filter.params, ...sourceIds, ...readableSources, ...readableCurrent,
        ...(options.receivedFrom ? [options.receivedFrom] : []), ...(options.receivedBefore ? [options.receivedBefore] : [])] };
    };
    // An address-only catalogue detects newly admitted/removed originals while
    // paging a frozen ranking. It never loads bodies or reveals a global count.
    const catalogueHash = () => {
      const filter = sql(), digest = createHash('sha256');
      for (const row of this.repo.db.prepare(`SELECT r.id,r.version,r.seq FROM h_evidence r WHERE ${filter.text} ORDER BY r.seq`)
        .iterate(...filter.params)) digest.update(canonical([row.id, row.version, row.seq]));
      return digest.digest('hex');
    };
    const currentCatalogue = catalogueHash();
    if (position.catalogueHash === undefined) position.catalogueHash = currentCatalogue;
    else if (canIndex && !options.rankingId && !options.windowCursor && !offset && !position.busy && position.complete && position.catalogueHash !== currentCatalogue) {
      position = { id: randomUUID(), snapshot: watermark, before: watermark + 1, complete: false, processed: 0,
        expiresAt: now + 30 * 60_000, busy: false, catalogueHash: currentCatalogue };
      this.positions.set(indexBinding, position);
      result.coverage.snapshot = position.id;
    }
    for (const [id, snapshot] of this.rankings) if (snapshot.expiresAt <= now) this.rankings.delete(id);
    for (const [id, snapshot] of this.windows) if (snapshot.expiresAt <= now) this.windows.delete(id);
    const queryHash = signature(queries);
    // Only current, exactly projected legal ranges contribute to this identity.
    // Changes in another source's vector index cannot invalidate this cursor.
    // No vector is loaded, ranked or copied while forming either directory.
    const candidateDirectory = () => {
      const filter = sql(), sources = createHash('sha256'), chunks = createHash('sha256');
      for (const row of this.repo.db.prepare(`SELECT r.id FROM h_evidence r WHERE ${filter.text} ORDER BY r.seq`)
        .iterate(...filter.params)) {
        const source = this.admit(handle, String(row.id), options);
        if (!source) continue;
        sources.update(canonical([source.event.id, source.event.contentVersion, source.event.sequence, source.ranges]));
        for (const chunk of this.chunks(source)) chunks.update(canonical(chunk));
      }
      return { sources: sources.digest('hex'), chunks: chunks.digest('hex') };
    };
    let windowSeed: CandidateWindowPosition | undefined;
    let priorWindow: CandidateWindowSnapshot | undefined;
    let ownsPosition = false;
    try {
      if (options.rankingId || offset > 0) {
        const snapshot = options.rankingId && this.rankings.get(options.rankingId);
        if (!snapshot || snapshot.binding !== binding || snapshot.queryHash !== queryHash
          || snapshot.catalogueHash !== catalogueHash()) {
          result.restartRequired = true;
          addGap({ reason: options.rankingId ? 'ranking_snapshot_changed' : 'ranking_snapshot_required' });
          return finish();
        }
        const currentSources = new Map<string, Admitted>();
        const currentChunks = new Map<string, Set<string>>();
        for (const prior of snapshot.sources) {
          const current = this.admit(handle, prior.eventId, options);
          if (!current || canonical(sourceBaseline(current)) !== canonical(prior))
            throw new HarnessError('semantic_source_changed', '排名所用的原文或范围已改变，请从第一页重开。');
          used.set(prior.eventId, prior);
          currentSources.set(prior.eventId, current);
          currentChunks.set(prior.eventId, new Set(this.chunks(current).map(chunk => canonical(chunk))));
        }
        for (const candidate of snapshot.candidates) {
          const { score: _score, ...address } = candidate;
          if (address.methodId !== EMBEDDING_CONTRACT.methodId || !currentChunks.get(address.eventId)?.has(canonical(address)))
            throw new HarnessError('semantic_source_changed', '排名所用的原文索引已改变，请从第一页重开。');
        }
        guard();
        result.rankingId = options.rankingId!;
        result.nextWindowCursor = snapshot.nextWindowCursor;
        result.coverage = { ...snapshot.coverage };
        indexGap.push(...snapshot.indexGap.map(gap => ({ ...gap })));
        gapDetailsTruncated = snapshot.coverage.gapDetailsTruncated;
        result.items = snapshot.candidates.slice(offset, offset + limit).map(candidate =>
          recallItem(currentSources.get(candidate.eventId)!.event, candidate, candidate.score));
        result.nextOffset = snapshot.candidates.length > offset + limit ? offset + limit : null;
        result.coverage.moreMayExist = !snapshot.coverage.indexComplete || result.nextWindowCursor !== null || result.nextOffset !== null;
        result.status = indexGap.length || gapDetailsTruncated ? 'partial' : result.items.length ? 'fresh' : 'not_found';
        guard();
        return finish();
      }
      if (options.windowCursor) {
        priorWindow = this.windows.get(options.windowCursor);
        if (!priorWindow || priorWindow.binding !== binding || priorWindow.queryHash !== queryHash) {
          result.restartRequired = true; addGap({ reason: 'window_snapshot_changed' }); return finish();
        }
        const directory = candidateDirectory(); guard();
        if (priorWindow.sourceCatalogueHash !== directory.sources || priorWindow.chunkCatalogueHash !== directory.chunks) {
          result.restartRequired = true; addGap({ reason: 'window_snapshot_changed' }); return finish();
        }
        windowSeed = { ...priorWindow.position, ...(priorWindow.position.pending ? { pending: { ...priorWindow.position.pending } } : {}) };
        result.coverage = { ...priorWindow.coverage, candidateEvents: 0, candidateChunks: 0, scannedSources: 0,
          eligibleSources: 0, indexedSources: 0, candidateWindowOnly: true, windowOrdinal: windowSeed.ordinal };
        indexGap.push(...priorWindow.indexGap.map(gap => ({ ...gap })));
        gapDetailsTruncated = priorWindow.coverage.gapDetailsTruncated;
      }
      const description = await this.runtime.describe(); guard();
      if (description.methodId !== EMBEDDING_CONTRACT.methodId || description.dimensions !== EMBEDDING_CONTRACT.dimensions
        || ['files_missing', 'failed', 'closed'].includes(description.state)) {
        addGap({ reason: 'runtime_unavailable', code: description.failureCode || description.state });
        result.status = 'not_connected'; return finish();
      }
      if (!queries.length || queries.some(query => Array.from(query).length > EMBEDDING_CONTRACT.maxCodePointsPerRequest)
        || queryBytes + outputReserve > options.maxReadBytes) {
        addGap({ reason: 'index_budget' }); return finish();
      }
      const vectors: { vector: Float32Array; norm: number }[] = [];
      for (const query of queries) {
        guard(); charge(Buffer.byteLength(query));
        const embedded = await this.runtime.embedQuery(query, { signal: options.signal }); guard();
        if (embedded.methodId !== EMBEDDING_CONTRACT.methodId) throw new HarnessError('semantic_vector_invalid', '本地查询方法不一致。');
        vectors.push({ vector: embedded.vector, norm: vectorNorm(embedded.vector) });
      }
      if (!options.windowCursor && !canIndex) addGap({ reason: 'index_read_only' });
      else if (!options.windowCursor && position.busy) addGap({ reason: 'index_busy' });
      else if (!options.windowCursor) {
        position.busy = true; ownsPosition = true;
        const rowLimit = Math.min(options.maxRows, 200);
        while (!position.complete && result.coverage.scannedSources < rowLimit) {
          guard();
          // A concurrent candidate read can rewind a corrupt derived row.
          // Its durable checkpoint is already applied; consume that address
          // under this fresh scope before allowing ordinary forward progress.
          if (position.repairBefore !== undefined && position.before >= position.repairBefore) delete position.repairBefore;
          const filter = sql();
          const row = this.repo.db.prepare(`SELECT r.id,r.seq FROM h_evidence r WHERE ${filter.text}
            AND r.seq<=? AND r.seq<? ORDER BY r.seq DESC LIMIT 1`).get(...filter.params, position.snapshot, position.before);
          if (!row) { checkpoint({ complete: true }); break; }
          result.coverage.scannedSources++;
          const source = this.admit(handle, String(row.id), options);
          if (!source) { checkpoint({ before: Number(row.seq), processed: position.processed + 1 }); continue; }
          result.coverage.eligibleSources++;
          remember(source);
          const coverage = semanticCoverage(source.ranges, this.chunks(source));
          if (!coverage.complete) {
            const allowance = options.maxReadBytes - chargedReadBytes - outputReserve;
            const passage = passagePrefix(source.event, coverage.gaps[0], allowance);
            if (!passage.text) { addGap({ reason: 'index_budget' }); break; }
            use(source); charge(passage.bytes);
            const embedded = await this.runtime.embedPassage({ text: passage.text, startCodePoint: passage.startCodePoint,
              endCodePoint: passage.endCodePoint }, { signal: options.signal }); guard();
            const selected = { start: passage.startCodePoint, end: passage.endCodePoint };
            if (embedded.methodId !== EMBEDDING_CONTRACT.methodId || !embedded.coverage.complete
              || embedded.coverage.start !== selected.start || embedded.coverage.end !== selected.end)
              throw new HarnessError('semantic_vector_invalid', '本地原文分片覆盖不一致。');
            const chunks: SemanticChunk[] = embedded.chunks.map(chunk => {
              if (!contains([selected], { start: chunk.startCodePoint, end: chunk.endCodePoint })
                || !Number.isSafeInteger(chunk.tokenCount) || chunk.tokenCount < 1 || chunk.tokenCount > EMBEDDING_CONTRACT.maxTokens
                || hash(codePointSlice(source.event.text, chunk.startCodePoint, chunk.endCodePoint)) !== chunk.textHash)
                throw new HarnessError('semantic_vector_invalid', '本地原文分片地址或摘要不一致。');
              vectorNorm(chunk.vector);
              return { eventId: source.event.id, contentVersion: source.event.contentVersion, start: chunk.startCodePoint,
                end: chunk.endCodePoint, textSha256: chunk.textHash, methodId: embedded.methodId, vector: chunk.vector };
            });
            if (!semanticCoverage([selected], chunks).complete) throw new HarnessError('semantic_vector_invalid', '本地原文分片存在未报告缺口。');
            this.repo.write(() => {
              guard();
              saveSemanticChunks(this.repo.db, { eventId: source.event.id, contentVersion: source.event.contentVersion,
                methodId: embedded.methodId, chunks });
              checkpoint();
            });
            result.coverage.indexedSources++;
            // Retain the unconsumed row when a range or body remains. The next
            // search resumes its actual missing coordinates, not newest N.
            const current = this.admit(handle, source.event.id, options);
            if (!current || !semanticCoverage(current.ranges, this.chunks(current)).complete) break;
          }
          checkpoint({ before: Number(row.seq), processed: position.processed + 1 });
        }
      }
      guard();
      if (!options.windowCursor) {
        result.coverage.indexScanComplete = position.complete;
        result.coverage.processedSourcesInSnapshot = position.processed;
        result.coverage.newerSourcesPending = catalogueHash() !== position.catalogueHash;
        if (!position.complete || result.coverage.newerSourcesPending) addGap({ reason: 'index_scan_pending' });
      }
      const directoryBefore = candidateDirectory(); guard();
      if (priorWindow && (priorWindow.sourceCatalogueHash !== directoryBefore.sources
        || priorWindow.chunkCatalogueHash !== directoryBefore.chunks))
        throw new HarnessError('semantic_window_changed', '候选窗口的合法来源或片段集合已改变，请重新开始检索。');
      const seed: CandidateWindowPosition = windowSeed || { snapshot: watermark, before: watermark + 1, ordinal: 0 };
      const nextPosition: CandidateWindowPosition = { ...seed, ...(seed.pending ? { pending: { ...seed.pending } } : {}) };
      result.coverage.windowOrdinal = seed.ordinal;
      const filter = sql();
      // SQL scope, exact projection and current hashes precede both window
      // limits and vector loading. Rejected fragments consume no candidate slot.
      const rows = this.repo.db.prepare(`SELECT r.id,r.seq FROM h_evidence r WHERE ${filter.text}
        AND r.seq<=? AND r.seq<?
        AND EXISTS(SELECT 1 FROM h_semantic_chunks c WHERE c.event_id=r.id AND c.method_id=?)
        ORDER BY r.seq DESC`).iterate(...filter.params, seed.snapshot, seed.before, EMBEDDING_CONTRACT.methodId);
      const candidates: Candidate[] = [], rankedSources: SourceBaseline[] = [];
      const corrupt: (SemanticChunkMetadata & { sequence: number })[] = [];
      let hasNextWindow = false;
      for (const row of rows) {
        const source = this.admit(handle, String(row.id), options);
        if (seed.pending && Number(row.seq) === seed.pending.sequence
          && (!source || source.event.id !== seed.pending.eventId || source.event.contentVersion !== seed.pending.contentVersion))
          throw new HarnessError('semantic_window_changed', '候选窗口的原文断点已改变，请重新开始检索。');
        const allChunks = source ? this.chunks(source) : [];
        const chunks = seed.pending && source?.event.id === seed.pending.eventId
          ? allChunks.filter(chunk => chunk.start > seed.pending!.afterStart
            || chunk.start === seed.pending!.afterStart && chunk.end > seed.pending!.afterEnd) : allChunks;
        if (!source || !chunks.length) {
          nextPosition.before = Number(row.seq); delete nextPosition.pending; continue;
        }
        remember(source);
        if (result.coverage.candidateEvents >= CANDIDATE_EVENTS || result.coverage.candidateChunks >= CANDIDATE_CHUNKS) {
          // This is a real, permitted look-ahead; it remains unconsumed.
          nextPosition.before = source.event.sequence + 1; delete nextPosition.pending;
          hasNextWindow = true; break;
        }
        rankedSources.push(sourceBaseline(source));
        result.coverage.candidateEvents++;
        for (const gap of semanticCoverage(source.ranges, allChunks).gaps)
          addGap({ reason: 'unindexed_range', eventId: source.event.id, contentVersion: source.event.contentVersion, ...gap });
        let best: Candidate | undefined;
        for (let index = 0; index < chunks.length; index++) {
          const chunk = chunks[index];
          result.coverage.candidateChunks++;
          let vector: Float32Array | undefined;
          try { vector = semanticChunkVector(this.repo.db, chunk); }
          catch (error) {
            if (!(error instanceof HarnessError) || error.code !== 'semantic_vector_invalid') throw error;
          }
          if (!vector) {
            addGap({ reason: 'invalid_vector', eventId: source.event.id, contentVersion: chunk.contentVersion, start: chunk.start, end: chunk.end });
            if (canIndex && !options.windowCursor) corrupt.push({ ...chunk, sequence: source.event.sequence });
          } else {
            const score = Math.max(...vectors.map(query => cosine(query.vector, vector, query.norm)));
            if (!best || score > best.score || score === best.score && chunk.start < best.address.start)
              best = { event: source.event, address: chunk, score };
          }
          if (result.coverage.candidateChunks >= CANDIDATE_CHUNKS && index + 1 < chunks.length) {
            nextPosition.before = source.event.sequence + 1;
            nextPosition.pending = { eventId: source.event.id, sequence: source.event.sequence,
              contentVersion: source.event.contentVersion, afterStart: chunk.start, afterEnd: chunk.end };
            hasNextWindow = true; break;
          }
        }
        if (best) candidates.push(best);
        if (hasNextWindow) break;
        nextPosition.before = source.event.sequence; delete nextPosition.pending;
        // At an exact boundary continue only to a real legal look-ahead, so the
        // last source/chunk does not manufacture an empty next-window cursor.
      }
      // Close the read iterator before changing disposable corrupt rows. A
      // continued window is strictly read-only even when its caller can index.
      if (corrupt.length) this.repo.write(() => {
        guard();
        for (const chunk of corrupt) {
          const current = this.admit(handle, chunk.eventId, options);
          if (!current || current.event.contentVersion !== chunk.contentVersion || !contains(current.ranges, chunk)
            || hash(codePointSlice(current.event.text, chunk.start, chunk.end)) !== chunk.textSha256)
            throw new HarnessError('semantic_source_changed', '原文候选已改变，未修改旧索引。');
          this.repo.db.prepare(`DELETE FROM h_semantic_chunks WHERE event_id=? AND content_version=?
            AND start_cp=? AND end_cp=? AND text_sha256=? AND method_id=?`)
            .run(chunk.eventId, chunk.contentVersion, chunk.start, chunk.end, chunk.textSha256, chunk.methodId);
          position.repairBefore = Math.max(position.repairBefore || 0, chunk.sequence + 1);
        }
        checkpoint({ complete: false, before: Math.max(position.before, position.repairBefore!) });
        result.coverage.indexScanComplete = false;
      });
      const directoryAfter = candidateDirectory(); guard();
      if (priorWindow && (priorWindow.sourceCatalogueHash !== directoryAfter.sources
        || priorWindow.chunkCatalogueHash !== directoryAfter.chunks))
        throw new HarnessError('semantic_window_changed', '候选窗口的合法来源或片段集合已改变，请重新开始检索。');
      result.coverage.candidateWindowOnly = seed.ordinal > 0 || hasNextWindow;
      if (result.coverage.candidateWindowOnly) addGap({ reason: 'candidate_window' });
      candidates.sort((a, b) => b.score - a.score || b.event.sequence - a.event.sequence || a.event.id.localeCompare(b.event.id));
      result.items = candidates.slice(offset, offset + limit).map(({ event, address, score }) => recallItem(event, address, score));
      result.nextOffset = candidates.length > offset + limit ? offset + limit : null;
      const sourceIndexComplete = priorWindow ? priorWindow.coverage.indexComplete
        : position.complete && !result.coverage.newerSourcesPending;
      result.coverage.indexComplete = sourceIndexComplete
        && !indexGap.some(gap => gap.reason !== 'candidate_window') && !gapDetailsTruncated;
      if (hasNextWindow) {
        result.nextWindowCursor = randomUUID();
        while (this.windows.size >= 32) this.windows.delete(this.windows.keys().next().value!);
      }
      result.coverage.moreMayExist = !result.coverage.indexComplete || result.nextWindowCursor !== null || result.nextOffset !== null;
      if (!result.coverage.meaning.endsWith(WINDOW_GUIDANCE)) result.coverage.meaning += WINDOW_GUIDANCE;
      result.status = indexGap.length || gapDetailsTruncated ? 'partial' : result.items.length ? 'fresh' : 'not_found';
      const rankingCatalogue = catalogueHash();
      guard();
      if (result.nextWindowCursor) this.windows.set(result.nextWindowCursor, { binding, queryHash,
        sourceCatalogueHash: directoryAfter.sources, chunkCatalogueHash: directoryAfter.chunks, expiresAt: now + 30 * 60_000,
        position: { ...nextPosition, ordinal: seed.ordinal + 1 }, indexGap: indexGap.map(gap => ({ ...gap })),
        coverage: { ...result.coverage, gapDetailsTruncated } });
      result.rankingId = randomUUID();
      while (this.rankings.size >= 32) this.rankings.delete(this.rankings.keys().next().value!);
      this.rankings.set(result.rankingId, { binding, queryHash, catalogueHash: rankingCatalogue, expiresAt: now + 30 * 60_000,
        candidates: candidates.map(candidate => ({ ...candidate.address, score: candidate.score })), sources: rankedSources,
        indexGap: indexGap.map(gap => ({ ...gap })), coverage: { ...result.coverage, gapDetailsTruncated }, nextWindowCursor: result.nextWindowCursor });
      return finish();
    } catch (error) {
      options.signal?.throwIfAborted();
      // A rejected worker await still crosses the same source boundary. Keep
      // the original baseline; do not report an old runtime error past a stop.
      try { guard(); } catch (current) { error = current; }
      result.items = []; result.nextOffset = null; result.rankingId = null; result.nextWindowCursor = null;
      const changed = error instanceof HarnessError && ['semantic_source_changed', 'semantic_window_changed', 'stale_scope', 'scope_expired'].includes(error.code);
      const budgetExceeded = error instanceof HarnessError && ['read_budget', 'memory_budget', 'context_budget'].includes(error.code);
      if (changed) {
        result.restartRequired = true;
        indexGap.length = 0; gapDetailsTruncated = false;
        result.coverage.scannedSources = result.coverage.eligibleSources = result.coverage.indexedSources = 0;
        result.coverage.candidateEvents = result.coverage.candidateChunks = result.coverage.processedSourcesInSnapshot = 0;
        result.coverage.indexComplete = result.coverage.indexScanComplete = false;
        result.coverage.moreMayExist = true;
      }
      addGap({ reason: changed ? 'source_changed' : budgetExceeded ? 'index_budget' : 'runtime_unavailable',
        code: error instanceof LocalEmbeddingError || error instanceof HarnessError ? error.code : 'semantic_unavailable' });
      result.status = changed || budgetExceeded || error instanceof LocalEmbeddingError && error.code === 'embedding_busy' ? 'partial' : 'not_connected';
      return finish();
    } finally {
      if (ownsPosition) {
        try {
          if (position.repairBefore !== undefined) {
            checkpoint({ complete: false, before: Math.max(position.before, position.repairBefore) });
            delete position.repairBefore;
          }
        } finally {
          position.busy = false; position.expiresAt = Date.parse(this.repo.clock.now()) + 30 * 60_000;
        }
      }
    }
  }
}
