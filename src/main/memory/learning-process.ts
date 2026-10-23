import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, workSourceRefSchema, type ScopeHandle, type WorkRecord, type WorkSourceRef } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from '../runtime/work';
import { canonical, codePointSlice } from '../runtime/semantics';

const id = z.string().min(1).max(160);
const span = { contentVersion: z.number().int().positive(), start: z.number().int().nonnegative(), end: z.number().int().positive() };
const citation = z.object({ eventId: id, ...span, quote: z.string().min(1).max(4000) }).strict()
  .refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start, '原话范围无效');
const locator = z.object({ eventId: id, ...span, quoteSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const assistantCitation = z.object({ kind: z.literal('assistant_message'), messageId: id,
  start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1).max(4000) }).strict()
  .refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start, '助手材料范围无效');
const assistantLocator = z.object({ kind: z.literal('assistant_message'), messageId: id,
  start: z.number().int().nonnegative(), end: z.number().int().positive(), contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRefs: z.array(workSourceRefSchema).min(1).max(32) }).strict()
  .refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start, '助手材料范围无效');
const aidKind = z.enum(['hint', 'worked_example', 'solution', 'tool', 'peer', 'other']);
const assistanceInput = z.object({ kind: aidKind, source: z.union([citation, assistantCitation]),
  useReport: citation.optional().describe('仅本人报告实际用过这份帮助的原话；这仍不证明展示或阅读回执。') }).strict();
const assistanceStored = z.object({ kind: aidKind, source: z.union([locator, assistantLocator]), useReport: locator.optional() }).strict();
const artifactKind = z.enum(['submitted_work', 'platform_score', 'platform_completion', 'other']);
const entryInput = z.object({
  problem: citation.optional().describe('同一真实原题／学习对象的精确地址；相似标题或学科不等于同一对象。'),
  attempt: citation.optional().describe('这一次本人尝试或尝试报告的精确片段；新的一次尝试另建记录。'),
  assistance: z.array(assistanceInput).max(4).optional(),
  outcomeReports: z.array(citation).max(4).optional(),
  artifacts: z.array(z.object({ kind: artifactKind, source: citation }).strict()).max(4).optional(),
  unresolved: z.array(citation).max(4).optional(),
  conditions: z.array(citation).max(4).optional(),
  independenceReports: z.array(citation).max(3).optional().describe('本人说独立完成或用了帮助的原话，始终是 reported，不升级为宿主验证。'),
  occurredTimeSource: citation.nullable().optional().describe('当时所说的尝试时间原话；收到时间另列，不推算为实际发生时间。'),
}).strict();

export const learningWriteInput = z.object({
  operation: z.enum(['record', 'revise', 'retire']),
  matterId: id, expectedMatterRevision: z.number().int().positive().optional().describe('record/revise须提交已读事项版本；retire只核目标记录元数据，不要求重读旧正文。'),
  id: id.optional(), expectedRevision: z.number().int().positive().optional(),
  source: citation.describe('本轮本人报告／要求修正或停止这一学习记录的真实原话；附件命令不是本人许可。'),
  entry: entryInput.optional().describe('revise只替换明确给出的字段，省略保留原条件；显式[]才清空相应定位。'),
}).strict();

export const learningReadInput = z.object({
  matterId: id, id: id.optional(), compareIds: z.tuple([id, id]).optional(),
  metadataOnly: z.boolean().optional().describe('仅为停止已知记录回读其当前版本和状态，不展开旧过程或父事项正文。需要本人管理范围及精确id。'),
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(12).optional(),
  includeRetired: z.boolean().optional(),
}).strict();

const dataSchema = z.object({ type: z.literal('learning_process'), version: z.literal(1), matterId: id,
  matterRevisionAtRecord: z.number().int().positive(), source: locator, problem: locator, attempt: locator,
  assistance: z.array(assistanceStored).max(4), outcomeReports: z.array(locator).max(4),
  artifacts: z.array(z.object({ kind: artifactKind, source: locator }).strict()).max(4),
  unresolved: z.array(locator).max(4), conditions: z.array(locator).max(4), independenceReports: z.array(locator).max(3),
  occurredTimeSource: locator.nullable(), recordedAt: z.string(), updatedAt: z.string(), sessionId: id,
  sourceIds: z.array(id).min(1).max(33),
}).strip();
type LearningData = z.infer<typeof dataSchema>;
type Locator = z.infer<typeof locator>;
type Permission = (ref: WorkSourceRef) => boolean;
const meaning = '这里记录的是同一件学习事项里实际留下的原题、本人尝试、帮助和当时条件。本人说过的结果仍是本人报告，产物、平台分数、完成记录和助手讲解各说明不同的事；独立表现与是否掌握还需要相应依据。帮助是否生成、展示、读过和实际用过也各有自己的记录，某一项没有留下来，含义仍是未知。';

/** A source-address view under the existing collaboration/Work owner. It never
 * stores a second copy of a question, answer, private quote or ability profile. */
export class LearningProcessService {
  constructor(readonly repo: KernelRepository, readonly work: WorkService) {}

  private scope(handle: ScopeHandle, write = false) {
    const scope = this.work.policy.require(handle, write ? 'work:write' : 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || write && (scope.child || scope.retention !== 'purpose_scoped'))
      throw new HarnessError('learning_scope', '当前范围不能保存或读取本人的学习过程。');
    return scope;
  }

  private cite(handle: ScopeHandle, raw: z.infer<typeof citation>, user = false): Locator {
    const input = citation.parse(raw), event = this.repo.evidence(handle, input.eventId);
    if (!event || event.contentVersion !== input.contentVersion || codePointSlice(event.text, input.start, input.end) !== input.quote
      || user && (event.speaker !== 'user' || event.authority !== 'user_statement'))
      throw new HarnessError('learning_source_changed', '学习过程需要当前可读的精确原话；本人报告不能由助手或外部记录代替。');
    this.repo.resolveWorkSourceBinding(handle, [{ eventId: event.id, contentVersion: event.contentVersion, start: input.start, end: input.end }]);
    return { eventId: event.id, contentVersion: event.contentVersion, start: input.start, end: input.end,
      quoteSha256: createHash('sha256').update(input.quote).digest('hex') };
  }

  private quotedRefs(data: LearningData): Locator[] {
    return [data.source, data.problem, data.attempt, ...data.assistance.flatMap(aid => [
      ...('eventId' in aid.source ? [aid.source] : []), ...(aid.useReport ? [aid.useReport] : [])]),
    ...data.outcomeReports, ...data.artifacts.map(item => item.source), ...data.unresolved, ...data.conditions,
    ...data.independenceReports, ...(data.occurredTimeSource ? [data.occurredTimeSource] : [])];
  }

  private refs(data: LearningData): WorkSourceRef[] {
    const refs = [...this.quotedRefs(data).map(({ quoteSha256: _hash, ...ref }) => ref),
      ...data.assistance.flatMap(aid => 'kind' in aid.source ? aid.source.sourceRefs : [])];
    return [...new Map(refs.map(ref => [canonical(ref), ref])).values()];
  }

  private current(handle: ScopeHandle, recordId: string, permits?: Permission) {
    const record = this.repo.work(handle, 'experience', recordId)[0];
    if (!record || record.data.type !== 'learning_process' || !['recorded', 'retired'].includes(record.status)) return;
    const parsed = dataSchema.safeParse(record.data);
    if (!parsed.success || this.refs(parsed.data).some(ref => permits?.(ref) === false)) return;
    if (!record.sourceBinding) return;
    try {
      if (canonical(record.sourceBinding) !== canonical(this.repo.resolveWorkSourceBinding(handle, this.refs(parsed.data)))) return;
      for (const aid of parsed.data.assistance) if ('kind' in aid.source) {
        const original = this.repo.learningAssistantSource(handle, aid.source, { historicalWork: true });
        if (!original || original.contentSha256 !== aid.source.contentSha256
          || canonical(original.sourceRefs) !== canonical(aid.source.sourceRefs)) return;
      }
    } catch (error) {
      if (error instanceof HarnessError) return;
      throw error;
    }
    for (const ref of this.quotedRefs(parsed.data)) {
      const event = this.repo.evidence(handle, ref.eventId);
      if (!event || event.contentVersion !== ref.contentVersion
        || createHash('sha256').update(codePointSlice(event.text, ref.start, ref.end)).digest('hex') !== ref.quoteSha256) return;
    }
    return { record, data: parsed.data };
  }

  assertCurrent(handle: ScopeHandle, recordId: string, revision: number, permits?: Permission) {
    this.scope(handle);
    const current = this.current(handle, recordId, permits);
    if (!current || current.record.revision !== revision)
      throw new HarnessError('learning_process_changed', '刚读的学习过程或某处来源已变化，也可能已停止使用；手上的版本与现在可读的内容不再对应。原入口仍可核对当前状态。');
  }

  save(handle: ScopeHandle, sessionId: string, raw: z.infer<typeof learningWriteInput>) {
    const args = learningWriteInput.parse(raw), scope = this.scope(handle, true);
    const source = this.cite(handle, args.source, true), sourceEvent = this.repo.evidence(handle, source.eventId)!;
    if (!scope.currentEventIds.includes(source.eventId) || sourceEvent.kind !== 'user_message')
      throw new HarnessError('current_source_required', '学习记录的变化需要本轮本人原话，不能把附件内容当作保留或修订许可。');
    return this.repo.write(() => {
      if (args.operation === 'retire') {
        if (!args.id || !args.expectedRevision || args.entry) throw new HarnessError('learning_address', '停止记录需要其准确ID和版本，不替换旧过程。');
        const old = this.repo.sourcedWorkMetadata(handle, args.id);
        if (!old || old.type !== 'learning_process' || old.kind !== 'experience' || old.matterId !== args.matterId)
          throw new HarnessError('learning_missing', '没有找到这件事的学习记录。');
        return this.repo.transitionSourcedWork(handle, { id: args.id, expectedRevision: args.expectedRevision, matterId: args.matterId, status: 'retired',
          transition: { operation: 'retire', source } });
      }
      const matter = this.repo.work(handle, 'episode', args.matterId)[0];
      if (!matter || matter.data.type !== 'collaboration_frame' || matter.revision !== args.expectedMatterRevision)
        throw new HarnessError('revision_conflict', '这件共同学习事项已变化，请先恢复其当前版本。');
      if (!['active', 'needs_review'].includes(matter.status)) throw new HarnessError('learning_matter_inactive', '这件事已结束；读取旧过程不会重新开启记录。');
      const previous = args.id ? this.current(handle, args.id) : undefined;
      if (args.operation === 'revise' && (!previous || previous.data.matterId !== matter.id || previous.record.revision !== args.expectedRevision)
        || args.operation === 'record' && (args.id || args.expectedRevision))
        throw new HarnessError('learning_revision', '修订先读取同一学习记录的准确版本；新的一次尝试另建记录。');
      if (previous && previous.record.status !== 'recorded') throw new HarnessError('learning_inactive', '这份过程记录已经停止；回读和修订不能重新启用它。');
      if (!args.entry || args.operation === 'record' && (!args.entry.problem || !args.entry.attempt))
        throw new HarnessError('learning_attempt_required', '需要实际原题和这一次尝试的原话地址，不能以课程标题或一句掌握判断代替。');
      const before = previous?.data, input = args.entry;
      const list = (items: z.infer<typeof citation>[] | undefined, old: Locator[] | undefined, user = false) =>
        items === undefined ? old || [] : [...new Map(items.map(item => {
          const ref = this.cite(handle, item, user);
          return [canonical(ref), ref] as const;
        })).values()];
      const data: LearningData = { type: 'learning_process', version: 1, matterId: matter.id, matterRevisionAtRecord: matter.revision,
        source, problem: input.problem ? this.cite(handle, input.problem) : before!.problem,
        attempt: input.attempt ? this.cite(handle, input.attempt, true) : before!.attempt,
        assistance: input.assistance === undefined ? before?.assistance || [] : input.assistance.map(aid => {
          const aidSource = 'kind' in aid.source ? (() => {
            const original = this.repo.learningAssistantSource(handle, aid.source, { historicalWork: true });
            if (!original || codePointSlice(original.text, aid.source.start, aid.source.end) !== aid.source.quote)
              throw new HarnessError('learning_assistance_source', '这份帮助的原消息或依据目前没有对应上。本人若曾说过实际用过怎样的帮助，那段原话也有自己的报告身份；是否展示、读过则各有实际留下的记录。');
            return { kind: 'assistant_message' as const, messageId: original.id, start: aid.source.start, end: aid.source.end,
              contentSha256: original.contentSha256, sourceRefs: original.sourceRefs };
          })() : this.cite(handle, aid.source);
          return { kind: aid.kind, source: aidSource, ...(aid.useReport ? { useReport: this.cite(handle, aid.useReport, true) } : {}) };
        }),
        outcomeReports: list(input.outcomeReports, before?.outcomeReports, true),
        artifacts: input.artifacts === undefined ? before?.artifacts || [] : input.artifacts.map(item => ({ kind: item.kind, source: this.cite(handle, item.source) })),
        unresolved: list(input.unresolved, before?.unresolved, true), conditions: list(input.conditions, before?.conditions),
        independenceReports: list(input.independenceReports, before?.independenceReports, true),
        occurredTimeSource: input.occurredTimeSource === undefined ? before?.occurredTimeSource || null : input.occurredTimeSource === null ? null : this.cite(handle, input.occurredTimeSource, true),
        recordedAt: before?.recordedAt || this.repo.clock.now(), updatedAt: this.repo.clock.now(), sessionId, sourceIds: [],
      };
      const binding = this.repo.resolveWorkSourceBinding(handle, this.refs(data));
      data.sourceIds = [...new Set([...binding.sourceIds, ...(data.assistance.some(aid => 'kind' in aid.source) ? ['history:self'] : [])])].sort();
      dataSchema.parse(data);
      const recordId = previous?.record.id || 'learning:' + createHash('sha256').update(canonical({ matterId: matter.id, problem: data.problem, attempt: data.attempt })).digest('hex');
      for (const aid of data.assistance) if ('kind' in aid.source) {
        const original = this.repo.learningAssistantSource(handle, aid.source, { historicalWork: true });
        if (!original) throw new HarnessError('learning_assistance_source', '这份帮助的原消息或依据已有变化，手上的材料没有与现在可读的内容对应上；原消息的读取地址还能用来了解当前状态。');
        if (original.learningProcessIds?.includes(recordId))
          throw new HarnessError('learning_assistance_cycle', '这段助手材料本身参考过正在更新的学习记录，把两者接在一起会形成相互依赖。更早实际提供帮助的原消息，以及本人关于用过帮助的原话，各有独立的来处，可以帮助找清这次过程。');
      }
      const duplicate = !previous && this.current(handle, recordId);
      if (duplicate) {
        if (duplicate.record.status !== 'recorded') throw new HarnessError('learning_inactive', '这一次尝试的记录已经停止；再次提到不会恢复它。');
        const { recordedAt: _oldTime, updatedAt: _oldUpdate, sessionId: _oldSession, matterRevisionAtRecord: _oldMatterRevision, ...oldData } = duplicate.data;
        const { recordedAt: _newTime, updatedAt: _newUpdate, sessionId: _newSession, matterRevisionAtRecord: _newMatterRevision, ...newData } = data;
        if (canonical(oldData) !== canonical(newData)) throw new HarnessError('learning_duplicate', '这一次尝试已有记录；补充或纠正请按其准确版本revise，没有覆盖已有条件。');
        return duplicate.record;
      }
      const record: WorkRecord = { id: recordId, kind: 'experience', ownerId: scope.principalId, workspaceId: scope.workspaceId,
        subjectId: scope.subjectId, worldId: scope.worldId, revision: (previous?.record.revision || 0) + 1,
        status: previous?.record.status || 'recorded', title: '学习尝试与当时条件',
        evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], sourceBinding: binding,
        label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false },
        data: data as WorkRecord['data'] };
      this.work.saveLearningProcess(handle, record, previous?.record.revision);
      if (previous) this.repo.invalidate(record.id, 'learning_process_revised');
      for (const ref of binding.refs) this.repo.addDependency(handle, { consumerId: record.id, producerId: ref.eventId,
        producerRevision: ref.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
      for (const aid of data.assistance) if ('kind' in aid.source)
        this.repo.addDependency(handle, { consumerId: record.id, producerId: aid.source.messageId,
          producerRevision: 1, sensitivity: 'privacy', invalidation: 'block' });
      return record;
    });
  }

  private original(handle: ScopeHandle, ref: Locator) {
    const event = this.repo.evidence(handle, ref.eventId)!;
    return { ...ref, sourceId: event.sourceId, speaker: event.speaker, authority: event.authority, sourceKind: event.kind, receivedAt: event.receivedAt,
      preview: codePointSlice(event.text, ref.start, Math.min(ref.end, ref.start + 180)), previewOnly: true,
      read: { tool: 'read_evidence', arguments: { id: ref.eventId, offset: ref.start, limit: Math.min(1200, ref.end - ref.start) } } };
  }

  private project(handle: ScopeHandle, value: { record: WorkRecord; data: LearningData }) {
    const { record, data } = value, original = (ref: Locator) => this.original(handle, ref);
    return { id: record.id, revision: record.revision, status: record.status, matterId: data.matterId,
      recordedAt: data.recordedAt, updatedAt: data.updatedAt, recordSource: original(data.source), problem: original(data.problem),
      attempt: { source: original(data.attempt), observation: 'user_report', independentlyObserved: false },
      assistance: data.assistance.map(aid => ({ kind: aid.kind,
        source: 'eventId' in aid.source ? original(aid.source) : { ...aid.source, speaker: 'assistant', authority: 'model_derivative',
          read: { tool: 'read_assistant_history', arguments: { id: aid.source.messageId, offset: aid.source.start, limit: Math.min(1200, aid.source.end - aid.source.start) } } },
        generated: 'eventId' in aid.source ? this.repo.evidence(handle, aid.source.eventId)!.speaker === 'assistant' ? true : 'not_established' : true,
        displayed: 'unknown', readByLearner: 'unknown', actualUse: aid.useReport ? 'user_reported' : 'unknown',
        ...(aid.useReport ? { useReport: original(aid.useReport) } : {}) })),
      outcomeReports: data.outcomeReports.map(ref => ({ source: original(ref), observation: 'user_report', externallyVerified: false })),
      artifacts: data.artifacts.map(item => {
        const event = this.repo.evidence(handle, item.source.eventId)!;
        return { kind: item.kind, source: original(item.source), sourceRecordOnly: true,
          observation: event.kind === 'file_import' ? 'imported_record' : event.speaker === 'user' ? 'user_report'
            : event.speaker === 'external' ? 'external_record' : 'model_derivative',
          externallyVerified: false, authorship: 'not_established', independentPerformance: 'not_established', mastery: 'not_established' };
      }),
      unresolved: data.unresolved.map(original), conditions: data.conditions.map(original),
      independenceReports: data.independenceReports.map(ref => ({ source: original(ref), observation: 'user_report', independentlyVerified: false })),
      time: { actualAttemptTime: 'not_established', originalTimeStatement: data.occurredTimeSource ? original(data.occurredTimeSource) : null,
        receivedAt: this.repo.evidence(handle, data.attempt.eventId)!.receivedAt, receivedTimeIsAttemptTime: false },
      coverage: { assistanceHistory: 'not_established', conditionsComplete: 'not_established', independentPerformance: 'not_established', mastery: 'not_established' },
    };
  }

  read(handle: ScopeHandle, raw: z.infer<typeof learningReadInput>, permits?: Permission) {
    this.scope(handle);
    const args = learningReadInput.parse(raw);
    if (args.metadataOnly) {
      if (!args.id || args.compareIds) throw new HarnessError('learning_read_address', '管理元数据只读取一条准确记录。');
      const metadata = this.repo.sourcedWorkMetadata(handle, args.id);
      const current = metadata?.type === 'learning_process' && metadata.kind === 'experience' && metadata.matterId === args.matterId ? metadata : undefined;
      return { status: current ? 'fresh' : 'not_found', matterId: args.matterId,
        ...(current ? { control: { id: current.id, revision: current.revision, status: current.status } } : {}),
        records: [] as WorkRecord[], meaning: '只读取已知学习记录的管理元数据，用于按当前版本停止；没有展开旧正文，也没有恢复任何学习或来源使用。' };
    }
    if (args.id && args.compareIds || args.compareIds && args.compareIds[0] === args.compareIds[1])
      throw new HarnessError('learning_read_address', '精确读取与两次尝试对照分别使用；一次记录不能与自身比较成长。');
    const limit = args.limit || 6, offset = args.offset || 0;
    const selected = args.compareIds || (args.id ? [args.id] : undefined);
    const records = selected ? selected.flatMap(recordId => this.repo.workData(handle, ['learning_process'], { id: recordId, matterId: args.matterId, limit: 1 }))
      : this.repo.workData(handle, ['learning_process'], { matterId: args.matterId, statuses: args.includeRetired ? undefined : ['recorded'], offset, limit: limit + 1 });
    const page = selected ? records : records.slice(0, limit), values = page.flatMap(record => {
      const current = this.current(handle, record.id, permits);
      return current && current.data.matterId === args.matterId && (args.includeRetired || current.record.status !== 'retired') ? [current] : [];
    });
    const nextOffset = !selected && records.length > limit ? offset + limit : null;
    let comparison: Record<string, unknown> | undefined;
    if (args.compareIds) {
      const ordered = args.compareIds.map(recordId => values.find(value => value.record.id === recordId));
      const sameOrigin = (left: Locator, right: Locator) => {
        const a = this.repo.evidence(handle, left.eventId), b = this.repo.evidence(handle, right.eventId);
        return !!a && !!b && this.repo.sameSourceOrigin(a, left, b, right);
      };
      const [left, right] = ordered;
      if (!left || !right) comparison = { status: 'not_available', growthEstablished: false, reason: '一侧当前不可读，不用缺失记录证明没有尝试或没有帮助。' };
      else {
        const sameProblem = sameOrigin(left.data.problem, right.data.problem);
        const sameAttemptReport = sameOrigin(left.data.attempt, right.data.attempt);
        const covers = (a: Locator[], b: Locator[]) => a.every(ref => b.some(other => sameOrigin(ref, other)));
        const sameConditions = left.data.conditions.length > 0 && right.data.conditions.length > 0
          && covers(left.data.conditions, right.data.conditions) && covers(right.data.conditions, left.data.conditions);
        comparison = { status: sameAttemptReport ? 'same_attempt_report' : sameProblem ? 'same_problem_process_view' : 'comparability_not_established', ids: args.compareIds,
          sameProblemOrigin: sameProblem, recordedConditions: sameConditions ? 'same_original_conditions' : 'comparability_not_established',
          attemptSources: sameAttemptReport ? 'same_original_report' : 'separate_original_reports', twoIndependentAttemptsEstablished: false,
          conditionsComplete: 'not_established', chronologicalAttemptOrder: 'not_established', assistanceHistoryComplete: 'not_established',
          growthEstablished: false, independentPerformance: 'not_established', mastery: 'not_established',
          meaning: sameAttemptReport ? '两条记录来自同一次尝试报告，因此目前看到的是同一份报告的关系，尚没有两次真实尝试或成长的独立依据。'
            : sameProblem && sameConditions ? '这里可以对照同一原题及已记录条件下的两份尝试报告、帮助和产物。报告地址不同，独立表现、条件与帮助是否完整，以及是否成长或掌握，仍各有待相应材料支持。'
            : '这里并排放着有来源的过程，题目来源或已记录条件尚未对上。原题和当时条件能帮助理解它们怎样比较，分数、次数或一次卡顿本身只说明其中一部分。' };
      }
    }
    return { status: values.length ? 'fresh' : 'not_found', matterId: args.matterId, items: values.map(value => this.project(handle, value)),
      ...(comparison ? { comparison } : {}), coverage: { nextOffset, complete: nextOffset === null,
        meaning: '本页覆盖的是当前可读范围内这件事的一部分。没有展开的尝试、帮助和条件仍可能存在；这里是预览，精确原话地址可以继续读到相应内容。',
        ...(nextOffset === null ? {} : { read: { tool: 'read_learning', arguments: { ...args, offset: nextOffset } } }) }, meaning,
      records: values.map(value => value.record) };
  }
}
