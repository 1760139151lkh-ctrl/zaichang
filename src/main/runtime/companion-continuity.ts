import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  COMPANION_CONTINUITY_MEANING, companionManageInput, companionReadInput, companionKindSchema,
  type CompanionManageInput, type CompanionPersonaAnchor, type CompanionThreadCue, type ConversationMethodCue,
} from '../../shared/companion-continuity';
import { HarnessError, workSourceRefSchema, type ScopeHandle, type WorkRecord, type WorkSourceRef } from '../../shared/harness';
import type { PersonaState } from '../../shared/persona';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from './work';
import type { PersonalMethodService } from './personal-methods';
import { canonical, codePointSlice } from './semantics';

const id = z.string().min(1).max(160);
const locator = z.object({ eventId: id, contentVersion: z.number().int().positive(),
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
  quoteSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
  .refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start, '相处原话位置无效。');
const replyLocator = z.object({ messageId: id, start: z.number().int().nonnegative(), end: z.number().int().positive(),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/), sourceRefs: z.array(workSourceRefSchema).min(1).max(32) }).strict();
const personaAnchor = z.object({ revision: z.number().int().nonnegative(), presetId: z.string().max(60), name: z.string().max(60) }).strict();
const companionData = z.object({
  version: z.literal(1), kind: companionKindSchema, source: locator, topic: locator,
  phrase: locator.optional(), meaning: locator.optional(), conditions: z.array(locator).max(4),
  replyTarget: replyLocator.optional(), turns: z.array(locator).min(1).max(16),
  persona: personaAnchor, recordedAt: z.string(), updatedAt: z.string(),
}).strict();
type CompanionData = z.infer<typeof companionData>;
type Locator = z.infer<typeof locator>;
type Citation = Extract<CompanionManageInput, { operation: 'remember' }>['source'];
export interface CompanionSession { sessionId: string; ephemeral: boolean; persona: PersonaState }
export interface CompanionReadScope { sessionId: string; allowCrossSession: boolean; persona: PersonaState }
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex');
const anchor = (persona: PersonaState): CompanionPersonaAnchor => ({ revision: persona.revision, presetId: persona.core.presetId, name: persona.core.name });

/** Source-addressed conversational continuity in the existing collaboration
 * frame owner. No mood/affinity store, scheduler or second model is created. */
export class CompanionContinuityService {
  constructor(readonly repo: KernelRepository, readonly work: WorkService, readonly methods: PersonalMethodService) {}

  private scope(handle: ScopeHandle, write = false) {
    const scope = this.work.policy.require(handle, write ? 'work:write' : 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || write && (scope.child || scope.retention !== 'purpose_scoped'))
      throw new HarnessError('companion_scope', '这次不能保存或回读本人的相处线索。');
    return scope;
  }
  private cite(handle: ScopeHandle, citation: Citation, current = false): Locator {
    const scope = this.scope(handle, current), event = this.repo.evidence(handle, citation.eventId);
    if (!event || event.speaker !== 'user' || event.authority !== 'user_statement' || event.parentEventId
      || !['user_message', 'user_control'].includes(event.kind) || event.contentVersion !== citation.contentVersion
      || codePointSlice(event.text, citation.start, citation.end) !== citation.quote
      || current && !scope.currentEventIds.includes(event.id))
      throw new HarnessError('companion_source', '请沿本人真实说过的那段原话继续，不能把角色例句或助手建议当成共同经历。');
    const ref = { eventId: event.id, contentVersion: event.contentVersion, start: citation.start, end: citation.end };
    this.repo.resolveWorkSourceBinding(handle, [ref]);
    return { ...ref, quoteSha256: fingerprint(citation.quote) };
  }
  private refs(data: CompanionData): WorkSourceRef[] {
    const refs = [data.source, data.topic, ...(data.phrase ? [data.phrase] : []), ...(data.meaning ? [data.meaning] : []),
      ...data.conditions, ...data.turns].map(({ quoteSha256: _hash, ...ref }) => ref);
    return [...new Map(refs.map(ref => [canonical(ref), ref])).values()];
  }
  private belongs(record: WorkRecord, options: CompanionReadScope) {
    return options.allowCrossSession || record.data.sessionId === options.sessionId
      || Array.isArray(record.data.sessionIds) && record.data.sessionIds.includes(options.sessionId);
  }
  private candidates(handle: ScopeHandle, options: CompanionReadScope, page: {
    id?: string; query?: string; includeInactive?: boolean; offset: number; limit: number;
  }) {
    // Select only owner-scoped thread identities before opening a source-bound
    // body. Ordinary task frames cannot crowd pure conversational threads out.
    const words = [...new Set((page.query || '').normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean))];
    if (words.length > 16) throw new HarnessError('invalid_query', '先从一个话题或共同说法找起。');
    const rows = this.repo.workArtifactRecords(handle, 'companion_continuity', {
      ...(page.id ? { id: page.id } : {}), ...(!options.allowCrossSession ? { sessionId: options.sessionId } : {}),
      offset: page.offset, limit: page.limit,
    });
    const statuses = page.includeInactive ? ['active', 'paused', 'closed'] : ['active'];
    const selected = rows.filter(record => statuses.includes(record.status) && (!words.length || words.some(word =>
      (record.title + ' ' + JSON.stringify(record.data)).normalize('NFKC').toLowerCase().includes(word))));
    return { ids: selected.map(record => record.id), candidateRows: rows.length,
      nextOffset: rows.length === page.limit ? page.offset + rows.length : null };
  }
  private current(handle: ScopeHandle, recordId: string, options?: CompanionReadScope) {
    const record = this.repo.workArtifactRecords(handle, 'companion_continuity', { id: recordId, limit: 1 })[0];
    if (!record || record.kind !== 'episode' || !record.sourceBinding || options && !this.belongs(record, options)) return;
    const parsed = companionData.safeParse(record.data.companion);
    if (!parsed.success) return;
    const data = parsed.data;
    try {
      if (canonical(record.sourceBinding) !== canonical(this.repo.resolveWorkSourceBinding(handle, this.refs(data)))) return;
      for (const source of [data.source, data.topic, ...(data.phrase ? [data.phrase] : []), ...(data.meaning ? [data.meaning] : []), ...data.conditions, ...data.turns]) {
        const event = this.repo.evidence(handle, source.eventId);
        if (!event || event.speaker !== 'user' || event.contentVersion !== source.contentVersion
          || fingerprint(codePointSlice(event.text, source.start, source.end)) !== source.quoteSha256) return;
      }
    } catch (error) {
      if (error instanceof HarnessError) return;
      throw error;
    }
    return { record, data };
  }
  private original(handle: ScopeHandle, source: Locator) {
    const event = this.repo.evidence(handle, source.eventId);
    if (!event || event.contentVersion !== source.contentVersion
      || fingerprint(codePointSlice(event.text, source.start, source.end)) !== source.quoteSha256)
      throw new HarnessError('companion_changed', '那段话已经变化，先从现在仍能读到的内容接起。');
    return { eventId: event.id, sourceId: event.sourceId, contentVersion: event.contentVersion, start: source.start, end: source.end,
      quote: codePointSlice(event.text, source.start, source.end), receivedAt: event.receivedAt, speaker: 'user' as const,
      read: { tool: 'read_evidence', id: event.id, offset: source.start, limit: Math.min(1200, source.end - source.start) } };
  }
  private personaRelation(stored: CompanionPersonaAnchor, current: PersonaState): CompanionThreadCue['personaRelation'] {
    return stored.revision === current.revision ? 'same_configuration'
      : stored.presetId === current.core.presetId ? 'edited_configuration' : 'different_role';
  }

  manage(handle: ScopeHandle, session: CompanionSession, raw: unknown) {
    const args = companionManageInput.parse(raw), scope = this.scope(handle, true);
    if (session.ephemeral) throw new HarnessError('companion_retention', '这次内容只留在当前聊天里，可以照着相处，没有保存成下次的线索。');
    const source = this.cite(handle, args.source, true);
    return this.repo.write(() => {
      const operationId = args.operation === 'remember'
        ? 'companion-record:' + fingerprint(canonical({ owner: scope.principalId, workspace: scope.workspaceId, input: args })) : undefined;
      const repeated = operationId ? this.repo.operation<{ id: string; revision: number }>(operationId) : undefined;
      if (repeated) {
        const existing = this.current(handle, repeated.id);
        return { id: repeated.id, revision: existing?.record.revision ?? repeated.revision,
          status: existing?.record.status || 'unavailable', repeated: true, taskCreated: false, scheduleChanged: false,
          records: existing ? [existing.record] : [],
          meaning: '这段原话已经留过入口，没有重复创建或重新开启已经放下的话题。' };
      }
      if (args.operation === 'pause' || args.operation === 'close') {
        // A known thread can be put aside without reopening its old private
        // body. This matches metadata-only stopping of existing personal work.
        const meta = this.repo.sourcedWorkMetadata(handle, args.id);
        const marker = this.repo.db.prepare("SELECT json_extract(payload,'$.data.companion.version') AS version FROM h_work WHERE id=?").get(args.id);
        if (!meta || meta.type !== 'collaboration_frame' || meta.kind !== 'episode' || Number(marker?.version) !== 1)
          throw new HarnessError('companion_missing', '没有找到要放下的这段话题。');
        if (meta.revision !== args.expectedRevision) throw new HarnessError('revision_conflict', '这段话题已经变化，先看现在的版本。');
        const status = args.operation === 'pause' ? 'paused' : 'closed', revision = meta.revision + 1, now = this.repo.clock.now();
        this.repo.db.prepare(`UPDATE h_work SET status=?,revision=?,payload=json_set(payload,'$.status',?,'$.revision',?,
          '$.data.updatedAt',?,'$.data.companion.updatedAt',?) WHERE id=? AND revision=?`)
          .run(status, revision, status, revision, now, now, meta.id, meta.revision);
        this.repo.outbox('work_changed', meta.id);
        this.repo.invalidate(meta.id, 'companion_thread_' + status);
        return { id: meta.id, revision, status, taskCreated: false, scheduleChanged: false, records: [] as WorkRecord[] };
      }
      const old = args.operation === 'remember' ? undefined : this.current(handle, args.id);
      if (args.operation !== 'remember' && (!old || old.record.revision !== args.expectedRevision))
        throw new HarnessError('revision_conflict', '这段话题或原话已经变化，不能沿旧副本接续。');
      const now = this.repo.clock.now();
      let data: CompanionData, title: string;
      if (args.operation === 'resume') {
        const turns = [...old!.data.turns];
        if (!turns.some(ref => canonical(ref) === canonical(source))) turns.push(source);
        if (turns.length > 16) throw new HarnessError('companion_capacity', '这段话题已有不少来回，原来的话都保留着；可以从这次的新话题另留一个入口。');
        data = { ...old!.data, source, turns, updatedAt: now };
        title = old!.record.title;
      } else {
        if (args.operation !== 'remember' && args.operation !== 'revise')
          throw new HarnessError('companion_operation', '这次变更没有可保存的相处内容。');
        const entry = args.entry;
        const replyTarget = entry.replyTarget ? (() => {
          const reply = this.repo.learningAssistantSource(handle, entry.replyTarget!);
          if (!reply) throw new HarnessError('companion_reply', '这句话暂时无法沿真实回复回读；可以只留下你自己的表达需要，不补造助手曾说过什么。');
          return { messageId: reply.id, start: entry.replyTarget!.start, end: entry.replyTarget!.end,
            contentSha256: reply.contentSha256, sourceRefs: reply.sourceRefs };
        })() : undefined;
        data = { version: 1, kind: entry.kind, source, topic: this.cite(handle, entry.topic),
          ...(entry.phrase ? { phrase: this.cite(handle, entry.phrase) } : {}),
          ...(entry.meaning ? { meaning: this.cite(handle, entry.meaning) } : {}),
          conditions: entry.conditions.map(condition => this.cite(handle, condition)),
          ...(replyTarget ? { replyTarget } : {}), turns: [source],
          persona: old?.data.persona || anchor(session.persona), recordedAt: old?.data.recordedAt || now, updatedAt: now };
        title = entry.label;
      }
      companionData.parse(data);
      const binding = this.repo.resolveWorkSourceBinding(handle, this.refs(data));
      const recordId = old?.record.id || 'companion:' + randomUUID();
      const record: WorkRecord = { ownerId: scope.principalId, workspaceId: scope.workspaceId, subjectId: scope.subjectId, worldId: scope.worldId,
        label: old?.record.label || { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false },
        id: recordId, kind: 'episode', revision: old ? old.record.revision + 1 : 1,
        status: old && args.operation === 'revise' ? old.record.status : 'active', title,
        evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], sourceBinding: binding,
        data: { ...(old?.record.data || {}), type: 'collaboration_frame', sessionId: session.sessionId,
          sessionIds: [...new Set([...(Array.isArray(old?.record.data.sessionIds) ? old.record.data.sessionIds as string[] : []), session.sessionId])],
          question: title, nextStep: null, companion: data, recordedAt: old?.record.data.recordedAt || now, updatedAt: now,
          sourceIds: binding.sourceIds, requiredGrants: binding.requiredGrants } };
      this.repo.saveSourcedWork(handle, record, old?.record.revision);
      if (operationId) this.repo.completeOperation(operationId, 'companion_thread', { id: record.id, revision: record.revision });
      if (old) this.repo.invalidate(record.id, 'companion_thread_changed');
      return { id: record.id, revision: record.revision, status: record.status, kind: data.kind,
        records: [record],
        taskCreated: false, scheduleChanged: false, personaChanged: false,
        read: { tool: 'restore_collaboration', type: 'companion', id: record.id, expectedRevision: record.revision },
        meaning: COMPANION_CONTINUITY_MEANING };
    });
  }

  assertCurrent(handle: ScopeHandle, recordId: string, revision: number) {
    this.scope(handle);
    const current = this.current(handle, recordId);
    if (!current || current.record.revision !== revision) throw new HarnessError('companion_changed', '这段相处线索的依据已经变化，需要从当前原话重新接起。');
    return current.record;
  }

  restore(handle: ScopeHandle, raw: unknown, options: CompanionReadScope) {
    this.scope(handle);
    const input = companionReadInput.parse(raw);
    const page = this.candidates(handle, options, input), rows = page.ids;
    const providedRecords: WorkRecord[] = [], assistantSourceBindings: WorkRecord['sourceBinding'][] = [];
    const items = rows.flatMap(recordId => {
      const current = this.current(handle, recordId, options);
      if (!current) return [];
      const { record } = current;
      if (input.expectedRevision !== undefined && current.record.revision !== input.expectedRevision)
        throw new HarnessError('revision_conflict', '这段话题已变化，先读现在的版本。');
      const { data } = current, target = data.replyTarget;
      const reply = target ? this.repo.learningAssistantSource(handle, target) : undefined;
      if (reply && canonical(reply.sourceRefs) !== canonical(target!.sourceRefs))
        throw new HarnessError('companion_changed', '反馈所指的旧回复依据已变化，不能拿旧文字解释现在。');
      if (reply) assistantSourceBindings.push(this.repo.resolveWorkSourceBinding(handle, reply.sourceRefs));
      providedRecords.push(current.record);
      return [{ id: record.id, revision: record.revision, status: record.status, kind: data.kind, title: record.title,
        personaAtStart: data.persona, personaRelation: this.personaRelation(data.persona, options.persona),
        source: this.original(handle, data.source), topic: this.original(handle, data.topic),
        ...(data.phrase ? { phrase: this.original(handle, data.phrase), adoption: 'user_used_or_explicitly_adopted' as const } : {}),
        ...(data.meaning ? { meaningSource: this.original(handle, data.meaning) } : {}),
        conditions: data.conditions.map(source => this.original(handle, source)), turns: data.turns.map(source => this.original(handle, source)),
        replyTarget: reply ? { messageId: reply.id, start: target!.start, end: target!.end,
          quote: codePointSlice(reply.text, target!.start, target!.end), authority: 'assistant_history_not_user_fact',
          read: { tool: 'read_assistant_history', arguments: { id: reply.id, offset: target!.start, limit: Math.min(1200, target!.end - target!.start) } } }
          : target ? { status: 'unavailable', meaning: '仍保留用户自己的反馈；旧回复当前不可回读，不从副本补回，也不推断它的具体内容。' } : null,
        updatedAt: data.updatedAt, participation: 'optional_conversation_not_an_obligation', meaning: COMPANION_CONTINUITY_MEANING }];
    });
    return { items, nextOffset: page.nextOffset,
      coverage: { bounded: true, returned: items.length, candidateRows: page.candidateRows, enumerationComplete: page.nextOffset === null,
        meaning: '这一页只筛已允许的共同事项；候选页为空仍可能有后续页，不证明过去没有聊过。' },
      // Host-only provenance: account the displayed view, record these sources,
      // then omit these internal records from the model-facing payload.
      providedRecords, assistantSourceBindings: assistantSourceBindings.filter((binding): binding is NonNullable<typeof binding> => !!binding) };
  }

  index(handle: ScopeHandle, options: CompanionReadScope & { limit?: number }) {
    this.scope(handle);
    const limit = Math.min(4, Math.max(1, options.limit || 3));
    const page = this.candidates(handle, options, { offset: 0, limit: 100 }), rows = page.ids;
    const selected = rows.flatMap(recordId => {
      const current = this.current(handle, recordId, options);
      return current ? [current] : [];
    }).sort((a, b) => (Date.parse(b.data.updatedAt) || 0) - (Date.parse(a.data.updatedAt) || 0));
    const picked = selected.slice(0, limit), threads: CompanionThreadCue[] = picked.map(({ record, data }) => ({
      id: record.id, revision: record.revision, kind: data.kind, title: record.title, updatedAt: data.updatedAt,
      fromCurrentConversation: record.data.sessionId === options.sessionId || Array.isArray(record.data.sessionIds) && record.data.sessionIds.includes(options.sessionId),
      personaRelation: this.personaRelation(data.persona, options.persona),
      read: { tool: 'restore_collaboration', type: 'companion', id: record.id, expectedRevision: record.revision },
    }));
    const availableMethods = this.methods.catalog(handle, { usage: 'conversation', ...(!options.allowCrossSession ? { sessionId: options.sessionId } : {}) });
    const selectedMethods = availableMethods.slice(0, limit), methods: ConversationMethodCue[] = selectedMethods.map(method => ({
      id: method.id, revision: method.personalMethod!.revision, name: method.name, usage: 'conversation', read: { tool: 'read_skill', id: method.id },
    }));
    const methodRecords = selectedMethods.flatMap(method => this.repo.workData(handle, ['personal_method'], {
      id: method.personalMethod!.workId, revision: method.personalMethod!.revision, limit: 1, respectSourceBindings: true }));
    return { threads, methods, meaning: COMPANION_CONTINUITY_MEANING,
      coverage: { scope: options.allowCrossSession ? 'permitted_workspace' : 'current_conversation', bounded: true,
        moreMayExist: page.nextOffset !== null || selected.length > picked.length || availableMethods.length > selectedMethods.length,
        read: { tool: 'restore_collaboration', type: 'companion', offset: 0, limit: 6 } },
      providedRecords: [...picked.map(item => item.record), ...methodRecords] };
  }
}
