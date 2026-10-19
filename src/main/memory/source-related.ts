import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, workSourceBindingSchema, workSourceRefSchema,
  type ScopeHandle, type WorkRecord, type WorkSourceBinding, type WorkSourceRef } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import { canonical, codePointSlice } from '../runtime/semantics';

export const sourceRelatedInput = z.object({
  sourceRefs: z.array(workSourceRefSchema).min(1).max(8).optional(),
  sourceCursor: z.string().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(20).optional(),
}).strict().refine(value => !!value.sourceRefs || !!value.sourceCursor, '需要当前原文地址或来源关联目录的继续位置。');

export interface SourceRelatedOptions {
  /** Omitted only when the caller has explicitly admitted cross-session use. */
  sessionId?: string;
  projectionKey?: string;
  permits?: (ref: WorkSourceRef) => boolean;
  maxRows: number;
  canRead?: (tool: string) => boolean;
  /** Reuse the original owner's current qualification, never a directory's
   * second schema. Required before publishing a personal-method read link. */
  canReadRecord?: (record: WorkRecord) => boolean;
}
type OwnerRead =
  | { tool: 'restore_collaboration'; arguments: { relatedTo: string } | { type: 'planning_intent'; id: string } }
  | { tool: 'read_learning'; arguments: { matterId: string; id: string } }
  | { tool: 'read_planning_alternative'; arguments: { matterId: string; optionId: string; expectedRevision: number } }
  | { tool: 'read_skill'; arguments: { id: string } };
interface Candidate {
  id: string;
  revision: number;
  kind: WorkRecord['kind'];
  type: string;
  status: string;
  relation: 'exact_source_overlap' | 'declared_evidence_id';
  sourceCoverage: 'exact_range' | 'whole_event_range_unknown';
  matchedRefs?: WorkSourceRef[];
  read: OwnerRead;
}
interface Position {
  binding: string;
  sources: string;
  refs: WorkSourceRef[];
  snapshot: number;
  before: number;
  expiresAt: number;
}
interface SourceProof { bindings: WorkSourceBinding[]; refs: WorkSourceRef[] }
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const overlaps = (left: WorkSourceRef, right: WorkSourceRef) => left.eventId === right.eventId
  && left.contentVersion === right.contentVersion && left.start < right.end && left.end > right.start;
const member = (record: WorkRecord, sessionId: string) => record.data.sessionId === sessionId
  || Array.isArray(record.data.sessionIds) && record.data.sessionIds.includes(sessionId);

/** A disposable directory over the original Work owner. Its cursors contain
 * addresses and hashes only; finding a candidate never resumes its state,
 * copies its body, establishes semantic identity, or grants an action. */
export class SourceRelatedService {
  private readonly cursors = new Map<string, Position>();
  constructor(readonly repo: KernelRepository) {}

  private ownerRead(record: WorkRecord, options: SourceRelatedOptions): OwnerRead | undefined {
    let read: OwnerRead | undefined;
    if (record.kind === 'goal' || record.kind === 'episode' && record.data.type === 'collaboration_frame')
      read = { tool: 'restore_collaboration', arguments: { relatedTo: record.id } };
    else if (record.kind === 'experience' && record.data.type === 'learning_process' && record.status === 'recorded'
      && typeof record.data.matterId === 'string' && record.data.matterId)
      read = { tool: 'read_learning', arguments: { matterId: record.data.matterId, id: record.id } };
    else if (record.kind === 'recipe_candidate' && record.data.type === 'personal_method' && record.status === 'active'
      && record.sourceBinding)
      read = { tool: 'read_skill', arguments: { id: 'personal:' + record.id } };
    else if (record.kind === 'option' && record.data.type === 'planning_alternative' && record.sourceBinding
      && typeof record.data.matterId === 'string' && record.data.matterId)
      read = { tool: 'read_planning_alternative', arguments: { matterId: record.data.matterId, optionId: record.id, expectedRevision: record.revision } };
    else if (record.kind === 'plan' && record.data.type === 'planning_intent' && record.sourceBinding
      && ['active', 'paused', 'retired'].includes(record.status))
      read = { tool: 'restore_collaboration', arguments: { type: 'planning_intent', id: record.id } };
    return read && options.canRead?.(read.tool) !== false ? read : undefined;
  }

  private sourceProof(handle: ScopeHandle, record: WorkRecord, options: SourceRelatedOptions): SourceProof | undefined {
    try {
      if (record.sourceBinding !== undefined) {
        const parsed = workSourceBindingSchema.safeParse(record.sourceBinding);
        if (!parsed.success || parsed.data.refs.some(ref => options.permits?.(ref) === false)) return;
        const current = this.repo.resolveWorkSourceBinding(handle, parsed.data.refs);
        return canonical(current) === canonical(parsed.data) ? { bindings: [current], refs: current.refs } : undefined;
      }
      // With no exact attribution, every declared source must be wholly legal.
      // A quote-only authorization cannot expose another matter from its tail.
      const refs: WorkSourceRef[] = [];
      for (const eventId of [...new Set(record.evidenceIds)]) {
        const event = this.repo.evidence(handle, eventId);
        if (!event) return;
        const ref = { eventId, contentVersion: event.contentVersion, start: 0, end: Array.from(event.text).length };
        if (!ref.end || options.permits?.(ref) === false) return;
        refs.push(ref);
      }
      const bindings: WorkSourceBinding[] = [];
      for (let index = 0; index < refs.length; index += 32)
        bindings.push(this.repo.resolveWorkSourceBinding(handle, refs.slice(index, index + 32)));
      return { bindings, refs };
    } catch (error) {
      if (error instanceof HarnessError) return;
      throw error;
    }
  }

  private sessionProof(handle: ScopeHandle, record: WorkRecord, options: SourceRelatedOptions) {
    if (!options.sessionId || member(record, options.sessionId)) return { records: [] as WorkRecord[], bindings: [] as WorkSourceBinding[] };
    const parentIds = [...new Set([record.data.matterId, record.data.episodeId].filter((value): value is string => typeof value === 'string' && !!value))];
    for (const parentId of parentIds) {
      const parent = this.repo.work(handle, undefined, parentId)[0];
      if (!parent || !(parent.kind === 'goal' || parent.kind === 'episode' && parent.data.type === 'collaboration_frame')
        || !member(parent, options.sessionId)) continue;
      const proof = this.sourceProof(handle, parent, options);
      if (proof) return { records: [parent], bindings: proof.bindings };
    }
    return undefined;
  }

  page(handle: ScopeHandle, raw: z.infer<typeof sourceRelatedInput>, options: SourceRelatedOptions) {
    const scope = this.repo.scope(handle);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read'))
      throw new HarnessError('source_related_scope', '当前范围不能从原文查找本人的工作记录。');
    if (!Number.isSafeInteger(options.maxRows) || options.maxRows < 0
      || options.sessionId !== undefined && (!options.sessionId || options.sessionId.length > 160)
      || options.permits && !options.projectionKey)
      throw new HarnessError('source_related_scope', '来源关联目录缺少有效的宿主范围或读取预算。');
    const input = sourceRelatedInput.parse(raw), now = Date.parse(this.repo.clock.now());
    for (const [id, position] of this.cursors) if (position.expiresAt <= now) this.cursors.delete(id);
    const prior = input.sourceCursor ? this.cursors.get(input.sourceCursor) : undefined;
    if (input.sourceCursor && !prior)
      throw new HarnessError('source_related_cursor_expired', '来源关联目录的位置已过期或进程已重启，请从当前原文地址重新查找。');
    const queryBinding = this.repo.resolveWorkSourceBinding(handle, input.sourceRefs || prior!.refs);
    if (queryBinding.refs.some(ref => options.permits?.(ref) === false))
      throw new HarnessError('source_related_scope', '原文地址超出本项获准的精确片段，未读取关联目录。');
    const binding = digest({ principal: scope.principalId, workspace: scope.workspaceId, subject: scope.subjectId, world: scope.worldId,
      audience: scope.audience, retention: scope.retention, infer: scope.infer, child: scope.child,
      epoch: scope.privacyEpoch, policy: scope.policyRevision, current: [...scope.currentEventIds].sort(),
      sources: [...scope.sources].sort(), purposes: [...scope.purposes].sort(), grants: [...scope.grants].sort(),
      sessionId: options.sessionId ?? null, projection: options.projectionKey ?? null,
      recordQualification: !!options.canReadRecord,
      tools: ['restore_collaboration', 'read_learning', 'read_skill', 'read_planning_alternative'].map(tool => [tool, options.canRead?.(tool) !== false]) });
    const sources = digest({ queryBinding, originals: queryBinding.refs.map(ref => {
      const event = this.repo.evidence(handle, ref.eventId);
      if (!event || event.contentVersion !== ref.contentVersion)
        throw new HarnessError('source_related_source_changed', '原文地址已变化，没有继续旧的关联目录。');
      return { ref, text: digest(codePointSlice(event.text, ref.start, ref.end)), legal: this.repo.availableInferenceRanges(event) };
    }) });
    if (prior && (prior.binding !== binding || prior.sources !== sources || canonical(prior.refs) !== canonical(queryBinding.refs)))
      throw new HarnessError('source_related_cursor_changed', '原文、会话或许可范围已改变，请从当前原文地址重新查找。');
    const limit = input.limit || 8, maxRows = Math.min(options.maxRows, 200);
    const items: Candidate[] = [], records = new Map<string, WorkRecord>(), bindings = new Map<string, WorkSourceBinding>([[canonical(queryBinding), queryBinding]]);
    let before = prior?.before, snapshot = prior?.snapshot, scanned = 0, complete = false;
    // Old cursors are immutable. A rejected output page can retry its original
    // cursor; only the returned nextCursor points beyond admitted candidates.
    while (scanned < maxRows && items.length < limit && !complete) {
      const batch = this.repo.sourceRelatedWorkPage(handle, { sourceRefs: queryBinding.refs, snapshot, before,
        limit: Math.min(20, maxRows - scanned), sessionId: options.sessionId });
      snapshot = batch.snapshot;
      if (!batch.items.length) { complete = true; break; }
      for (let index = 0; index < batch.items.length; index++) {
        const { record, order } = batch.items[index];
        before = order; scanned++;
        const read = this.ownerRead(record, options), proof = read && this.sourceProof(handle, record, options);
        const session = proof && this.sessionProof(handle, record, options);
        const qualified = read && proof && session && (record.kind === 'recipe_candidate' && record.data.type === 'personal_method'
          ? options.canReadRecord?.(record) === true : options.canReadRecord?.(record) !== false);
        if (read && proof && session && qualified) {
          const hasBinding = record.sourceBinding !== undefined;
          // Older planning options may have inherited a whole-event privacy
          // closure from a legacy frame. A legal closure does not locate the
          // related thought inside it. Only the owner can attest exact ranges.
          const exact = hasBinding && (record.data.type !== 'planning_alternative' || record.data.sourceAttribution === 'declared_ranges');
          const matchedRefs = hasBinding ? proof.refs.flatMap(ref => queryBinding.refs.flatMap(query => overlaps(ref, query)
            ? [{ eventId: ref.eventId, contentVersion: ref.contentVersion, start: Math.max(ref.start, query.start), end: Math.min(ref.end, query.end) }] : [])) : [];
          if (!hasBinding || matchedRefs.length) {
            items.push({ id: record.id, revision: record.revision, kind: record.kind, type: typeof record.data.type === 'string' ? record.data.type : record.kind,
              status: record.status, relation: exact ? 'exact_source_overlap' : 'declared_evidence_id',
              sourceCoverage: exact ? 'exact_range' : 'whole_event_range_unknown', ...(exact ? { matchedRefs } : {}), read });
            records.set(record.id, record);
            for (const parent of session.records) records.set(parent.id, parent);
            for (const source of [...proof.bindings, ...session.bindings]) bindings.set(canonical(source), source);
          }
        }
        if (items.length === limit) { complete = batch.exhausted && index === batch.items.length - 1; break; }
      }
      if (items.length < limit) complete = batch.exhausted;
    }
    if (snapshot === undefined) {
      const initial = this.repo.sourceRelatedWorkPage(handle, { sourceRefs: queryBinding.refs, limit: 0, sessionId: options.sessionId });
      snapshot = initial.snapshot; before = snapshot + 1;
      complete = initial.exhausted;
    }
    let nextCursor: string | null = null;
    if (!complete) {
      nextCursor = randomUUID();
      // Keep the request cursor available even when rejected pages fill the
      // bounded cache. No retry consumes or mutates its previous address.
      while (this.cursors.size >= 64) {
        const disposable = [...this.cursors.keys()].find(id => id !== input.sourceCursor);
        if (!disposable) break;
        this.cursors.delete(disposable);
      }
      this.cursors.set(nextCursor, { binding, sources, refs: structuredClone(queryBinding.refs), snapshot,
        before: before ?? snapshot + 1, expiresAt: now + 30 * 60_000 });
    }
    const status: 'fresh' | 'partial' | 'not_found' = items.length ? 'fresh' : nextCursor ? 'partial' : 'not_found';
    const value = { status, items,
      coverage: { nextCursor, complete, scanned,
        ...(nextCursor ? { read: { tool: 'restore_collaboration', arguments: { type: 'source_related', sourceCursor: nextCursor, limit } } } : {}),
        meaning: '只枚举当前许可和会话范围内、已声明来源关系的候选记录。精确交叠不证明同一事项或当前适用；旧记录的整条原文关联范围未知。目录不是正文、全部历史、已读回执或采用，沿各原入口重新读取当前版本。空partial页仍可按nextCursor继续。' } };
    return { value, records: [...records.values()], bindings: [...bindings.values()] };
  }
}
