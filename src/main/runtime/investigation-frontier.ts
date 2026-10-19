import { createHash, randomUUID } from 'node:crypto';
import { HarnessError, type ScopeHandle, type WorkRecord } from '../../shared/harness';
import type { KernelRepository, SourceRestrictionSnapshot } from '../storage/repository';
import type { HostBrowsePosition, HostBrowseSeed } from '../memory/browse';
import type { PolicyKernel } from './policy';
import { canonical, codePointSlice } from './semantics';
import { resolveSourceQuote } from './source-quote';

export type { HostBrowsePosition, HostBrowseSeed } from '../memory/browse';
interface SourceAddress { eventId: string; contentVersion: number; sourceId: string; start: number; end: number; restriction: string }
type ReadBy = 'parent_original' | 'worker_report';
export interface OriginalReadAddress {
  eventId: string; contentVersion: number; sourceId: string;
  provided: { start: number; end: number }; total: number; nextOffset: number | null;
  projection?: { kind: 'attention_authorization_quote'; sourceStart: number; sourceEnd: number };
  sourceAddress?: SourceAddress;
  readBy?: ReadBy;
}
export interface InvestigationSession {
  runId: string; opportunityId: string; opportunityRevision: number; mandateId: string; mandateRevision: number;
  scope: ScopeHandle; tokens: string[]; eligible: string[];
}
export interface DeliveryTicket { id: string; runId: string; tokens: string[]; kind: 'parent' | 'worker'; actorScopeId: string; deliveries: { token: string; readBy: ReadBy }[] }
interface Binding { session: InvestigationSession; boundary: string; authority: SourceAddress; tickets: Map<string, DeliveryTicket> }
interface ListedOriginal { source: SourceAddress; total: number; sourceStart: number; previewEnd: number; previewReadBy?: ReadBy }
interface Batch { id: string; runId: string; observationId: string; refs: SourceAddress[]; after?: HostBrowseSeed; read?: OriginalReadAddress; listed?: ListedOriginal[] }
interface Ledger {
  version: 1; kind: 'browse' | 'original'; boundary: string; generation: number; sourceIds: string[];
  authority: SourceAddress; acked?: HostBrowseSeed; complete: boolean; pending: Batch[];
  body?: OriginalReadAddress; ranges?: { start: number; end: number; readBy?: ReadBy }[];
  refs: SourceAddress[]; lastCommitId?: string;
  enumeration?: { before: number; after: number; readBy: ReadBy }[];
  listed?: ListedOriginal[];
}
interface Stored { id: string; revision: number; value: Ledger }
interface Token { rowId: string; batchId: string; generation: number; observationId: string; resultDigest: string; scopeId: string; session: InvestigationSession; workerSeen?: boolean; eligibleBy?: ReadBy }
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const sourceGrant = (source: string) => source === 'profile:self' ? 'memory:read' : source === 'map:local' ? 'map:read'
  : source === 'weather:open-meteo' ? 'weather:read' : source.startsWith('campus:') ? 'campus:read' : 'evidence:read';

/** Addresses belong to the original opportunity. This is neither a transcript
 * checkpoint nor an execution queue: each return requires a fresh scoped read. */
export class InvestigationFrontierService {
  private bindings = new WeakMap<InvestigationSession, Binding>();
  private sessions = new Map<string, Set<InvestigationSession>>();
  private candidates = new WeakMap<object, HostBrowsePosition>();
  private cursors = new Map<string, { runId: string; rowId: string; boundary: string; seed?: HostBrowseSeed }>();
  private tokens = new Map<string, Token>();
  constructor(readonly repo: KernelRepository, readonly policy: PolicyKernel) {
    repo.onPrivacyCleanup(() => { this.cursors.clear(); this.tokens.clear(); });
  }

  bind(scope: ScopeHandle, runId: string, opportunity: WorkRecord): InvestigationSession {
    const current = this.repo.work(scope, undefined, opportunity.id)[0];
    if (!current || current.revision !== opportunity.revision || current.data.type !== 'help_opportunity')
      throw new HarnessError('investigation_changed', '调查机会已变化，需要读取当前版本。');
    const mandate = this.repo.work(scope, undefined, String(current.data.bindingId))[0];
    if (!mandate) throw new HarnessError('investigation_changed', '调查的原托付已不可读取。');
    const rawSource = mandate.data.source as { eventId?: unknown } | undefined;
    const event = typeof rawSource?.eventId === 'string' ? this.repo.evidence(scope, rawSource.eventId) : undefined;
    const source = event && resolveSourceQuote(event, rawSource);
    if (!event || event.speaker !== 'user' || event.authority !== 'user_statement' || !source)
      throw new HarnessError('investigation_authority', '调查须绑定仍可读取、版本与位置准确的托付片段；重复的旧引文不能猜测位置恢复。');
    const authority = this.address(scope, event.id, source.contentVersion, source.start, source.end);
    if (!this.repo.availableInferenceRanges(event).some(range => range.start <= authority.start && range.end >= authority.end))
      throw new HarnessError('investigation_authority', '托付原话的使用已停止，不能恢复旧调查。');
    const session: InvestigationSession = { runId, opportunityId: current.id, opportunityRevision: current.revision,
      mandateId: mandate.id, mandateRevision: mandate.revision, scope, tokens: [], eligible: [] };
    this.bindings.set(session, { session, authority, boundary: this.boundary(scope, current, mandate, authority), tickets: new Map() });
    const group = this.sessions.get(runId) || new Set(); group.add(session); this.sessions.set(runId, group);
    this.validate(session, scope);
    return session;
  }

  private boundary(handle: ScopeHandle, opportunity: WorkRecord, mandate: WorkRecord, authority: SourceAddress) {
    const scope = this.policy.validate(handle);
    return digest({ principal: scope.principalId, workspace: scope.workspaceId, subject: scope.subjectId, world: scope.worldId,
      audience: scope.audience, purposes: [...scope.purposes].sort(), authority,
      mandate: { id: mandate.id, type: mandate.data.type, source: mandate.data.source, rule: mandate.data.rule, governingRule: mandate.data.governingRule,
        sources: mandate.data.sources, until: mandate.data.until, channel: mandate.data.channel, matterId: mandate.data.matterId },
      opportunity: { id: opportunity.id, bindingId: opportunity.data.bindingId, fingerprint: opportunity.data.fingerprint,
        noveltyKey: opportunity.data.noveltyKey, category: opportunity.data.category, facts: opportunity.data.facts,
        scope: opportunity.data.scope, expiresAt: opportunity.data.expiresAt } });
  }

  private validate(session: InvestigationSession, handle: ScopeHandle) {
    const binding = this.bindings.get(session);
    if (!binding) throw new HarnessError('investigation_missing', '没有当前宿主调查绑定。');
    const root = this.policy.validate(session.scope), scope = this.policy.validate(handle);
    if ((['principalId', 'workspaceId', 'subjectId', 'worldId', 'audience', 'retention'] as const).some(key => root[key] !== scope[key])
      || (['sources', 'currentEventIds', 'purposes', 'grants'] as const).some(key => scope[key].some(value => !root[key].includes(value))))
      throw new HarnessError('investigation_scope', '续读范围不能超出当前托付。');
    const opportunity = this.repo.work(session.scope, undefined, session.opportunityId)[0], mandate = this.repo.work(session.scope, undefined, session.mandateId)[0];
    if (!opportunity || !mandate || mandate.status !== 'active' || !['candidate', 'waiting'].includes(opportunity.status)
      || (opportunity.data.scope as { epoch?: number } | undefined)?.epoch !== this.repo.epoch
      || Date.parse(String(opportunity.data.expiresAt)) <= Date.parse(this.repo.clock.now())
      || mandate.data.until && Date.parse(String(mandate.data.until)) <= Date.parse(this.repo.clock.now())
      || this.boundary(session.scope, opportunity, mandate, binding.authority) !== binding.boundary
      || !this.readable(session.scope, binding.authority))
      throw new HarnessError('investigation_changed', '托付、来源或机会已停止、过期或改变，旧调查不能续用。');
    const ancestors = new Set<string>();
    let parent: WorkRecord | undefined = mandate;
    while (parent && !ancestors.has(parent.id)) {
      ancestors.add(parent.id);
      parent = typeof parent.data.matterId === 'string' ? this.repo.work(session.scope, undefined, parent.data.matterId)[0] : undefined;
    }
    for (const row of this.repo.db.prepare(`SELECT payload FROM h_work WHERE owner=? AND workspace=? AND status='active'
      AND json_extract(payload,'$.data.type')='attention_rule'`).all(scope.principalId, scope.workspaceId)) {
      const rule = JSON.parse(String(row.payload)) as WorkRecord;
      if (!['pause', 'stop'].includes(String(rule.data.operation)) || rule.data.until && Date.parse(String(rule.data.until)) <= Date.parse(this.repo.clock.now())) continue;
      const objectId = (opportunity.data.facts as { objectId?: string } | undefined)?.objectId;
      const applies = rule.data.targetOpportunityId ? rule.data.targetOpportunityId === opportunity.id
        || !!objectId && rule.data.targetObjectId === objectId && ancestors.has(String(rule.data.targetBindingId))
        : !rule.data.matterId || ancestors.has(String(rule.data.matterId));
      if (applies) throw new HarnessError('investigation_paused', '这项调查当前已暂停或停止，定位保留但不继续读取。');
    }
    return { binding, scope };
  }

  private address(handle: ScopeHandle, eventId: string, version: number, start: number, end: number): SourceAddress {
    const event = this.repo.evidence(handle, eventId);
    if (!event || event.contentVersion !== version || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start < 0 || end < start || end > Array.from(event.text).length)
      throw new HarnessError('investigation_source_changed', '原文地址已变化，需要按当前来源重新读取。');
    const restriction = this.repo.sourceRestrictionSnapshot(handle).get(event.id);
    if (restriction?.wholeSource) throw new HarnessError('investigation_source_changed', '原来源已停止使用。');
    return { eventId, contentVersion: version, sourceId: event.sourceId, start, end, restriction: digest(restriction?.metadata ?? null) };
  }
  private readable(handle: ScopeHandle, address: SourceAddress) {
    try { return canonical(this.address(handle, address.eventId, address.contentVersion, address.start, address.end)) === canonical(address); }
    catch { return false; }
  }
  private load(session: InvestigationSession, id: string): Stored | undefined {
    const scope = this.policy.validate(session.scope);
    const row = this.repo.db.prepare('SELECT id,revision,payload FROM h_investigation_frontiers WHERE id=? AND opportunity_id=? AND owner=? AND workspace=?')
      .get(id, session.opportunityId, scope.principalId, scope.workspaceId);
    return row ? { id: String(row.id), revision: Number(row.revision), value: JSON.parse(String(row.payload)) as Ledger } : undefined;
  }
  private rows(session: InvestigationSession): Stored[] {
    const scope = this.policy.validate(session.scope);
    return this.repo.db.prepare('SELECT id,revision,payload FROM h_investigation_frontiers WHERE opportunity_id=? AND owner=? AND workspace=? ORDER BY rowid')
      .all(session.opportunityId, scope.principalId, scope.workspaceId)
      .map(row => ({ id: String(row.id), revision: Number(row.revision), value: JSON.parse(String(row.payload)) as Ledger }));
  }
  private permitted(handle: ScopeHandle, ledger: Ledger) {
    const scope = this.policy.validate(handle);
    return ledger.sourceIds.every(source => scope.grants.includes(sourceGrant(source)) && (scope.sources.includes(source)
      || ledger.kind === 'original' && scope.sources.includes('current')
        && ledger.refs.filter(ref => ref.sourceId === source).every(ref => scope.currentEventIds.includes(ref.eventId))));
  }
  private save(session: InvestigationSession, row: Stored) {
    const body = row.value.body, original = body ? this.bodyRef(session.scope, body) : undefined;
    row.value.refs = [row.value.authority, ...row.value.pending.flatMap(batch => batch.refs),
      ...(row.value.listed || []).map(value => value.source),
      ...(body && original ? (row.value.ranges || [body.provided]).map(range => ({ ...original,
        start: range.start + (body.projection?.sourceStart || 0), end: range.end + (body.projection?.sourceStart || 0) })) : [])];
    const payload = canonical(row.value), scope = this.policy.validate(session.scope);
    const others = Number(this.repo.db.prepare('SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) AS bytes FROM h_investigation_frontiers WHERE opportunity_id=? AND id!=?')
      .get(session.opportunityId, row.id)?.bytes || 0);
    if (Buffer.byteLength(payload) + others > 262144)
      throw new HarnessError('investigation_storage_budget', '未完成的调查地址已达到存储预算；位置没有移动，请先处理已保留的续读。');
    if (!row.revision) this.repo.db.prepare('INSERT INTO h_investigation_frontiers VALUES(?,?,?,?,?,?)')
      .run(row.id, session.opportunityId, scope.principalId, scope.workspaceId, 1, payload);
    else if (!Number(this.repo.db.prepare('UPDATE h_investigation_frontiers SET revision=revision+1,payload=? WHERE id=? AND revision=?')
      .run(payload, row.id, row.revision).changes)) throw new HarnessError('investigation_revision', '调查位置已变化，没有覆盖其他进度。');
  }
  private bodyRef(handle: ScopeHandle, address: OriginalReadAddress) {
    if (address.sourceAddress) return address.sourceAddress;
    const start = address.provided.start + (address.projection?.sourceStart || 0), end = address.provided.end + (address.projection?.sourceStart || 0);
    return this.address(handle, address.eventId, address.contentVersion, start, end);
  }

  resumeEntries(session: InvestigationSession, handle = session.scope, options: { projectedEvidenceIds?: string[]; browseResume?: boolean } = {}): Record<string, unknown>[] {
    const { binding } = this.validate(session, handle), entries: Record<string, unknown>[] = [];
    for (const row of this.rows(session)) {
      const value = row.value;
      if (value.boundary !== binding.boundary || !this.permitted(handle, value)) continue;
      if (value.kind === 'browse' && value.acked) {
        const entry: Record<string, unknown> = { kind: 'original_browse', pending: value.pending.length > 0, previewOnly: true,
          fixedSnapshot: true, complete: value.complete && !value.pending.length, fullOriginalCoverage: 'not_established', continuation: 'original_background_review',
          enumerationReadBy: [...new Set((value.enumeration || []).map(range => range.readBy))],
          ...(options.browseResume === false ? { reason: '这个位置由原后台调查以新范围续读；当前对话可另按当前用途浏览，未授予旧调查采纳权。' } : {}) };
        if (options.browseResume !== false && (!value.complete || value.pending.length)) {
          const cursor = randomUUID();
          this.cursors.set(cursor, { runId: session.runId, rowId: row.id, boundary: binding.boundary, seed: { ...value.acked, frontierId: row.id, generation: value.generation + 1 } });
          entry.read = { tool: 'search_context', arguments: { query: '继续本项获准调查的原文定位', mode: 'browse', cursor, limit: 8 } };
        }
        entries.push(entry);
      }
      for (const original of value.listed || []) {
        if (!this.readable(handle, original.source)) continue;
        const base = options.projectedEvidenceIds?.includes(original.source.eventId) ? 0 : original.sourceStart;
        entries.push({ kind: 'listed_original', eventId: original.source.eventId, contentVersion: original.source.contentVersion,
          previewOnly: true, previewReadBy: original.previewReadBy ?? 'not_established', fullOriginalCoverage: 'not_established',
          sourceRange: { start: original.sourceStart, end: original.sourceStart + original.total },
          read: { tool: 'read_evidence', arguments: { id: original.source.eventId, offset: base, limit: Math.max(1, Math.min(1200, original.total)) } } });
      }
      for (const read of [...(value.body ? [value.body] : []), ...value.pending.flatMap(batch => batch.read ? [batch.read] : [])]) {
        if (!this.readable(handle, this.bodyRefSafely(handle, read))) continue;
        const committed = read === value.body, legacy = committed && !read.readBy;
        const provided = (value.ranges || []).filter(range => range.readBy === 'parent_original' || range.readBy === 'worker_report');
        const ranges = this.merge(provided);
        let firstGap = 0;
        for (const range of ranges) { if (range.start > firstGap) break; firstGap = Math.max(firstGap, range.end); }
        const nextOffset = firstGap < read.total ? firstGap : null;
        const base = read.projection && !options.projectedEvidenceIds?.includes(read.eventId) ? read.projection.sourceStart : 0;
        const acknowledged = this.merge(provided), complete = acknowledged.length === 1 && acknowledged[0].start === 0 && acknowledged[0].end >= read.total;
        entries.push({ kind: 'original_read', eventId: read.eventId, contentVersion: read.contentVersion, readBy: read.readBy ?? (legacy ? 'legacy_unknown' : 'not_acknowledged'),
          providedRanges: provided,
          ...(legacy ? { previouslyRecordedRange: read.provided, recordedRanges: (value.ranges || []).filter(range => !range.readBy), actorCoverage: 'not_established' }
            : read.readBy ? { previouslyProvided: read.provided } : { pendingReadRange: read.provided }),
          pendingCoverage: value.pending.flatMap(batch => batch.read ? [batch.read.provided] : []),
          sourceRange: { start: read.provided.start + (read.projection?.sourceStart || 0), end: read.provided.end + (read.projection?.sourceStart || 0) },
          complete, coverageMeaning: 'acknowledged_investigation_ranges_only',
          coverageByReader: (['parent_original', 'worker_report'] as const).map(readBy => {
            const actorRanges = this.merge(provided.filter(range => range.readBy === readBy));
            return { readBy, ranges: actorRanges, complete: actorRanges.length === 1 && actorRanges[0].start === 0 && actorRanges[0].end >= read.total };
          }),
          reread: { tool: 'read_evidence', arguments: { id: read.eventId, offset: base + read.provided.start, limit: Math.max(1, read.provided.end - read.provided.start) } },
          continue: nextOffset === null ? null : { tool: 'read_evidence', arguments: { id: read.eventId, offset: base + nextOffset, limit: Math.min(1200, read.total - nextOffset) } } });
      }
    }
    return entries;
  }
  private bodyRefSafely(handle: ScopeHandle, address: OriginalReadAddress): SourceAddress {
    try { return this.bodyRef(handle, address); }
    catch { return { eventId: address.eventId, contentVersion: address.contentVersion, sourceId: address.sourceId, start: -1, end: -1, restriction: '' }; }
  }

  resolveBrowse(session: InvestigationSession, handle: ScopeHandle, cursor?: string): HostBrowseSeed | undefined {
    if (!cursor) return undefined;
    const ref = this.cursors.get(cursor);
    if (!ref) return undefined;
    const { binding } = this.validate(session, handle), row = this.load(session, ref.rowId);
    if (ref.runId !== session.runId || !row || row.value.boundary !== binding.boundary || ref.boundary !== binding.boundary || !this.permitted(handle, row.value))
      throw new HarnessError('investigation_scope', '这份续读不在当前完整来源范围内，旧位置没有移动。');
    return ref.seed ? structuredClone(ref.seed) : undefined;
  }
  rememberBrowse(result: unknown, position: HostBrowsePosition) {
    if (result && typeof result === 'object') this.candidates.set(result, structuredClone(position));
  }

  stageOutput(session: InvestigationSession, handle: ScopeHandle, tool: string, observationId: string, rawResult: unknown, finalResult: unknown, readBaseline?: SourceRestrictionSnapshot) {
    if (!observationId || !finalResult || typeof finalResult !== 'object') return;
    const result = finalResult as Record<string, any>;
    if (['unknown', 'failed', 'forbidden', 'error'].includes(String(result.status))) return;
    if (!readBaseline) return;
    const { binding } = this.validate(session, handle);
    if (session.tokens.some(id => { const token = this.tokens.get(id); return token?.observationId === observationId
      && (token.scopeId !== handle.id || token.resultDigest !== digest(finalResult)); }))
      throw new HarnessError('investigation_observation_conflict', '两个调查使用了相同观察标识，不能混合确认。');
    const position = tool === 'search_context' && rawResult && typeof rawResult === 'object' ? this.candidates.get(rawResult) : undefined;
    let row: Stored, batch: Batch, replacementIndex: number | undefined;
    if (position) {
      if (!Array.isArray(result.originals) || !result.coverage || result.coverage.retrieval !== 'source_browse') return;
      if (canonical((rawResult as Record<string, unknown>).originals) !== canonical(result.originals))
        throw new HarnessError('investigation_output_changed', '原文预览经过清洗，不能据旧预览推进持久位置。');
      const ref = position.requestCursor ? this.cursors.get(position.requestCursor) : undefined;
      const id = position.start.frontierId || ref?.rowId || randomUUID(), existing = this.load(session, id);
      const generation = position.start.generation ?? existing?.value.generation ?? 1;
      row = existing || { id, revision: 0, value: { version: 1, kind: 'browse', boundary: binding.boundary, authority: binding.authority,
        generation, sourceIds: position.start.sourceIds, acked: position.start, complete: false, pending: [], refs: [] } };
      if (row.value.boundary !== binding.boundary || !this.permitted(handle, row.value)) throw new HarnessError('investigation_scope', '原文续读范围已变化。');
      if (generation > row.value.generation) { row.value.pending = []; row.value.generation = generation; }
      if (generation !== row.value.generation) throw new HarnessError('investigation_revision', '旧调查批次已被当前重读替代。');
      const previous = row.value.pending.at(-1)?.after || row.value.acked;
      if (!previous || previous.snapshot !== position.start.snapshot || previous.before !== position.start.before)
        throw new HarnessError('investigation_gap', '原文续读不连续，尚未跳过中间位置。');
      const listed = position.originals.map(original => ({ source: this.address(handle, original.eventId, original.contentVersion,
        original.sourceStart, original.sourceStart + original.total), total: original.total, sourceStart: original.sourceStart, previewEnd: original.previewEnd }));
      batch = { id: randomUUID(), runId: session.runId, observationId, after: position.end, listed,
        refs: listed.map(original => original.source) };
      row.value.complete = position.complete;
    } else if (tool === 'read_evidence' && typeof result.id === 'string' && Number.isSafeInteger(result.version)
      && result.coverage && Number.isSafeInteger(result.coverage.start) && Number.isSafeInteger(result.coverage.end) && Number.isSafeInteger(result.coverage.total)) {
      const raw = rawResult as Record<string, any> | undefined;
      if (!raw || typeof result.text !== 'string' || raw.text !== result.text || !Array.isArray(result.actualReadRanges) || result.actualReadRanges.length !== 1) return;
      const event = this.repo.evidence(handle, result.id);
      if (!event || event.contentVersion !== result.version) throw new HarnessError('investigation_source_changed', '刚读的原文已经改变。');
      const coverage = result.coverage, projection = result.projection?.kind === 'attention_authorization_quote' ? result.projection : undefined;
      if (coverage.start < 0 || coverage.end < coverage.start || coverage.end > coverage.total || coverage.total < 0
        || coverage.total !== (projection ? projection.sourceEnd - projection.sourceStart : Array.from(event.text).length)
        || projection && (!Number.isSafeInteger(projection.sourceStart) || !Number.isSafeInteger(projection.sourceEnd)
          || projection.originalContentVersion !== event.contentVersion || projection.sourceStart < 0 || projection.sourceEnd > Array.from(event.text).length))
        throw new HarnessError('investigation_address', '原文实际覆盖地址不合法，位置未保存。');
      const range = result.actualReadRanges[0], sourceStart = coverage.start + (projection?.sourceStart || 0), sourceEnd = coverage.end + (projection?.sourceStart || 0);
      if (range.eventId !== event.id || range.contentVersion !== event.contentVersion || range.start !== sourceStart || range.end !== sourceEnd
        || codePointSlice(event.text, sourceStart, sourceEnd) !== result.text)
        throw new HarnessError('investigation_address', '原文实际提供的正文与覆盖地址不一致。');
      const read: OriginalReadAddress = { eventId: event.id, contentVersion: event.contentVersion, sourceId: event.sourceId,
        provided: { start: coverage.start, end: coverage.end }, total: coverage.total,
        nextOffset: coverage.end < coverage.total ? coverage.end : null,
        ...(projection ? { projection: { kind: 'attention_authorization_quote', sourceStart: projection.sourceStart, sourceEnd: projection.sourceEnd } } : {}) };
      const source = this.bodyRef(handle, read), id = 'original:' + digest([session.opportunityId, source.eventId, source.contentVersion, read.projection || null]);
      read.sourceAddress = source;
      row = this.load(session, id) || { id, revision: 0, value: { version: 1, kind: 'original', boundary: binding.boundary,
        authority: binding.authority, generation: 1, sourceIds: [event.sourceId], complete: false, pending: [], refs: [] } };
      if (row.value.boundary !== binding.boundary) throw new HarnessError('investigation_changed', '这份原文续读属于旧托付版本。');
      if (row.value.refs.some(ref => !this.readable(handle, ref))) {
        row.value.pending = []; row.value.body = undefined; row.value.ranges = undefined; row.value.generation++;
      }
      batch = { id: randomUUID(), runId: session.runId, observationId, refs: [source], read };
      const replaced = row.value.pending.flatMap((prior, index) => prior.runId !== session.runId && prior.read && prior.read.provided.start >= read.provided.start
        && prior.read.provided.end <= read.provided.end ? [index] : []);
      if (replaced.length) {
        replacementIndex = replaced[0];
        row.value.pending = row.value.pending.filter((_, index) => !replaced.includes(index));
      }
    } else return;
    if (batch.refs.some(ref => readBaseline.get(ref.eventId)?.wholeSource
      || digest(readBaseline.get(ref.eventId)?.metadata ?? null) !== ref.restriction))
      throw new HarnessError('investigation_source_changed', '来源限制在实际读取后改变，旧输出没有保存为新基线。');
    if (row.value.pending.some(prior => prior.runId === session.runId && prior.observationId === observationId)) return;
    if (replacementIndex === undefined) row.value.pending.push(batch);
    else row.value.pending.splice(replacementIndex, 0, batch);
    this.repo.write(() => this.save(session, row));
    // Starting a fresh replay deliberately retires the prior generation's
    // in-memory delivery handles. Old tool messages cannot acknowledge the
    // replacement pages, and must not poison their later provider request.
    const retired = new Set(session.tokens.filter(id => {
      const token = this.tokens.get(id);
      return token?.rowId === row.id && token.generation !== row.value.generation;
    }));
    for (const id of retired) this.tokens.delete(id);
    session.tokens = session.tokens.filter(id => !retired.has(id));
    session.eligible = session.eligible.filter(id => !retired.has(id));
    const token = randomUUID();
    this.tokens.set(token, { rowId: row.id, batchId: batch.id, generation: row.value.generation, observationId, resultDigest: digest(finalResult), scopeId: handle.id, session });
    session.tokens.push(token);
    if (position?.nextCursor) this.cursors.set(position.nextCursor, { runId: session.runId, rowId: row.id, boundary: binding.boundary });
  }

  prepareDelivery(session: InvestigationSession, handle: ScopeHandle, observationIds: string[], approvedWorkerObservationIds: string[] = []): DeliveryTicket {
    const direct = new Set(observationIds), workers = new Set(approvedWorkerObservationIds), deliveries: DeliveryTicket['deliveries'] = [];
    for (const id of session.tokens) {
      const token = this.tokens.get(id);
      if (token?.session !== session) continue;
      if (token.scopeId === session.scope.id && direct.has(token.observationId)) deliveries.push({ token: id, readBy: 'parent_original' });
      else if (token.scopeId !== session.scope.id && token.workerSeen && workers.has(token.observationId)) deliveries.push({ token: id, readBy: 'worker_report' });
    }
    return this.ticket(session, handle, 'parent', deliveries.map(value => value.token), deliveries);
  }
  prepareWorkerDelivery(session: InvestigationSession, handle: ScopeHandle, observationIds: string[]): DeliveryTicket {
    const ids = new Set(observationIds), tokens = session.tokens.filter(id => {
      const token = this.tokens.get(id); return token?.session === session && token.scopeId === handle.id
        && token.scopeId !== session.scope.id && ids.has(token.observationId);
    });
    return this.ticket(session, handle, 'worker', tokens, []);
  }
  private ticket(session: InvestigationSession, handle: ScopeHandle, kind: DeliveryTicket['kind'], tokens: string[], deliveries: DeliveryTicket['deliveries']): DeliveryTicket {
    const ticket: DeliveryTicket = { id: randomUUID(), runId: session.runId, tokens, kind, actorScopeId: handle.id, deliveries };
    if (tokens.length) {
      const { binding } = this.validate(session, handle);
      for (const id of tokens) this.validateToken(session, handle, id);
      binding.tickets.set(ticket.id, ticket);
    }
    return ticket;
  }
  private validateToken(session: InvestigationSession, handle: ScopeHandle, id: string) {
    const token = this.tokens.get(id), row = token?.session === session ? this.load(session, token.rowId) : undefined;
    const batch = row?.value.pending.find(value => value.id === token?.batchId);
    if (!token || !row || token.generation !== row.value.generation || !batch || !this.permitted(handle, row.value)
      || batch.refs.some(ref => !this.readable(handle, ref)))
      throw new HarnessError('investigation_source_changed', '调查材料在父采纳前已改变，旧位置没有确认。');
    return { token, row, batch };
  }
  providerSucceeded(session: InvestigationSession, handle: ScopeHandle, ticket: DeliveryTicket) {
    if (!ticket.tokens.length) return;
    const { binding } = this.validate(session, handle);
    if (binding.tickets.get(ticket.id) !== ticket || ticket.runId !== session.runId || ticket.kind !== 'parent'
      || ticket.actorScopeId !== handle.id || handle.id !== session.scope.id)
      throw new HarnessError('investigation_delivery', '父采纳不是本次真实交付。');
    for (const id of ticket.tokens) this.validateToken(session, handle, id);
    for (const delivery of ticket.deliveries) this.tokens.get(delivery.token)!.eligibleBy = delivery.readBy;
    session.eligible = [...new Set([...session.eligible, ...ticket.tokens])];
    binding.tickets.delete(ticket.id);
  }
  workerProviderSucceeded(session: InvestigationSession, handle: ScopeHandle, ticket: DeliveryTicket) {
    if (!ticket.tokens.length) return;
    const { binding } = this.validate(session, handle);
    if (binding.tickets.get(ticket.id) !== ticket || ticket.runId !== session.runId || ticket.kind !== 'worker'
      || ticket.actorScopeId !== handle.id || handle.id === session.scope.id)
      throw new HarnessError('investigation_delivery', '子调查读取不是该工作者的真实交付。');
    for (const id of ticket.tokens) this.validateToken(session, handle, id);
    for (const id of ticket.tokens) this.tokens.get(id)!.workerSeen = true;
    binding.tickets.delete(ticket.id);
  }
  ackInTransaction(session: InvestigationSession, handle: ScopeHandle, commitId: string) {
    if (!session.eligible.length) return;
    this.validate(session, handle);
    const eligible = new Map<string, Set<string>>();
    for (const id of session.eligible) {
      const { token } = this.validateToken(session, handle, id);
      if (!token.eligibleBy) throw new HarnessError('investigation_delivery', '调查没有完成真实父采纳。');
      const values = eligible.get(token.rowId) || new Set(); values.add(token.batchId); eligible.set(token.rowId, values);
    }
    this.repo.write(() => {
      const acknowledged = new Set<string>();
      for (const [id, accepted] of eligible) {
        const row = this.load(session, id)!;
        const replayed = this.merge(row.value.pending.flatMap(batch => accepted.has(batch.id) && batch.read ? [batch.read.provided] : []));
        if (row.value.kind === 'original') {
          const remaining: Batch[] = [];
          for (const batch of row.value.pending) {
            if (accepted.has(batch.id) && batch.read) {
              const token = session.eligible.map(id => this.tokens.get(id)).find(value => value?.batchId === batch.id)!;
              row.value.body = { ...batch.read, readBy: token.eligibleBy };
              row.value.ranges = this.mergeCoverage([...(row.value.ranges || []), { ...batch.read.provided, readBy: token.eligibleBy }]);
              acknowledged.add(batch.id);
            } else if (batch.read && batch.runId !== session.runId) {
              // A previously unacknowledged large page can be reread in
              // smaller requests across several runs. Save only each actual
              // adopted range and retain every untouched address as pending.
              const fragments = this.subtract(batch.read.provided, replayed);
              if (!fragments.length) acknowledged.add(batch.id);
              for (const [index, provided] of fragments.entries()) {
                const origin = batch.read.projection?.sourceStart || 0;
                const source = { ...this.bodyRef(session.scope, batch.read), start: provided.start + origin, end: provided.end + origin };
                remaining.push({ ...batch, id: index ? randomUUID() : batch.id, refs: [source],
                  read: { ...batch.read, provided, sourceAddress: source, nextOffset: provided.end < batch.read.total ? provided.end : null } });
              }
            } else remaining.push(batch);
          }
          row.value.pending = remaining;
          const coverage = this.merge((row.value.ranges || []).filter(range => !!range.readBy));
          row.value.complete = coverage.length === 1 && coverage[0].start === 0 && coverage[0].end >= (row.value.body?.total || 0);
          row.value.lastCommitId = commitId;
          this.save(session, row);
          continue;
        }
        while (row.value.pending.length && accepted.has(row.value.pending[0].id)) {
          const batch = row.value.pending.shift()!;
          acknowledged.add(batch.id);
          const token = session.eligible.map(id => this.tokens.get(id)).find(value => value?.batchId === batch.id)!;
          if (batch.after) {
            const before = row.value.acked!.before, last = row.value.enumeration?.at(-1);
            if (last && last.readBy === token.eligibleBy && last.after === before) last.after = batch.after.before;
            else (row.value.enumeration ||= []).push({ before, after: batch.after.before, readBy: token.eligibleBy! });
            row.value.acked = batch.after;
            for (const original of batch.listed || []) {
              const item = { ...original, previewReadBy: token.eligibleBy };
              const key = canonical(item), listed = row.value.listed ||= [];
              if (!listed.some(prior => canonical(prior) === key)) listed.push(item);
            }
          }
        }
        row.value.lastCommitId = commitId;
        this.save(session, row);
      }
      this.repo.afterCommit(() => {
        const removed = new Set(session.tokens.filter(id => { const token = this.tokens.get(id); return !!token && acknowledged.has(token.batchId); }));
        for (const id of removed) this.tokens.delete(id);
        session.tokens = session.tokens.filter(id => !removed.has(id));
        session.eligible = session.eligible.filter(id => !removed.has(id));
      });
    });
  }
  private merge(values: { start: number; end: number }[]) {
    const ranges: { start: number; end: number }[] = [];
    for (const value of values.sort((a, b) => a.start - b.start)) {
      const previous = ranges.at(-1);
      if (previous && previous.end >= value.start) previous.end = Math.max(previous.end, value.end);
      else ranges.push({ ...value });
    }
    return ranges;
  }
  private subtract(value: { start: number; end: number }, covered: { start: number; end: number }[]) {
    let remaining = [{ ...value }];
    for (const range of covered) remaining = remaining.flatMap(part => range.end <= part.start || range.start >= part.end ? [part]
      : [...(range.start > part.start ? [{ start: part.start, end: range.start }] : []), ...(range.end < part.end ? [{ start: range.end, end: part.end }] : [])]);
    return remaining;
  }
  private mergeCoverage(values: { start: number; end: number; readBy?: ReadBy }[]) {
    return ([undefined, 'parent_original', 'worker_report'] as const).flatMap(readBy =>
      this.merge(values.filter(value => value.readBy === readBy)).map(range => ({ ...range, ...(readBy ? { readBy } : {}) })));
  }
  discardRun(runId: string) {
    for (const session of this.sessions.get(runId) || []) {
      for (const id of session.tokens) this.tokens.delete(id);
      this.bindings.delete(session);
    }
    this.sessions.delete(runId);
    for (const [id, cursor] of this.cursors) if (cursor.runId === runId) this.cursors.delete(id);
  }
}
