import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, workSourceRefSchema, type ScopeHandle, type WorkRecord, type WorkSourceRef, type WorkSourceBinding } from '../../shared/harness';
import { methodHelpMaterialIdentitySchema, type MethodHelpMaterialIdentity } from '../../shared/method-work-help';
import { studyCompanionInput, studyModeSchema, type StudyCompanionInput, type StudyCompanionView,
  type StudyOrigin, type StudyMode, type studyCitationSchema, type studyPacketInput, type studyProblemInput } from '../../shared/study-companion';
import type { KernelRepository } from '../storage/repository';
import type { MaterialService } from '../materials/service';
import type { WorkService } from './work';
import { explorableStudySchema } from '../../shared/explorable-study';
import { canonical, codePointSlice } from './semantics';

type Citation = z.infer<typeof studyCitationSchema>;
type Packet = z.infer<typeof studyPacketInput>;
type ProblemInput = z.infer<typeof studyProblemInput>;
interface Observation { tool: string; toolCallId?: string; result: unknown; requestedArguments?: unknown }
export interface StudyCompanionContext {
  sessionId?: string;
  /** Set by the host when this run may only inspect its current conversation. */
  restrictToSessionId?: string;
  observations?: readonly Observation[];
  signal?: AbortSignal;
  permits?: (ref: WorkSourceRef) => boolean;
  historyOffset?: number;
  historyLimit?: number;
  /** Host presentation only. Reuse this one complete owner/material check to
   * lay out all existing learner lines; never exposed as a model tool flag. */
  allAttempts?: boolean;
}
const id = z.string().min(1).max(160);
const ref = workSourceRefSchema;
const sourceFile = { resourceId: id, sha256: z.string(), version: z.number().int().positive(),
  sourceEventId: id, contentVersion: z.number().int().positive(), sourceId: id, name: z.string(),
  originObservationId: id, sourceRefs: z.array(ref).min(1).max(4) };
const storedProblem = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('evidence'), ref }).strict(),
  z.object({ kind: z.literal('material_text'), ...sourceFile, page: z.number().int().positive().optional(),
    start: z.number().int().nonnegative(), end: z.number().int().positive(), quoteSha256: z.string() }).strict(),
  z.object({ kind: z.literal('material_page'), ...sourceFile, page: z.number().int().positive(), description: z.string(),
    crop: z.json().nullable() }).strict(),
]);
const storedStep = z.object({ id, kind: z.enum(['question', 'hint', 'explanation', 'example', 'practice']),
  title: z.string().optional(), text: z.string(), nextMove: z.string(), mode: studyModeSchema,
  exploration: explorableStudySchema.optional(),
  source: ref, supports: z.array(ref).max(8), providedAt: z.string() }).strict();
const stateSchema = z.object({ type: z.literal('study_companion'), version: z.literal(1), matterId: id,
  matterRevisionAtOpen: z.number().int().positive(), sessionId: id, source: ref, problem: storedProblem,
  mode: studyModeSchema, focus: z.string(), nextStart: z.string(), lastSource: ref,
  attempts: z.array(z.object({ id, source: ref }).strict()).max(32), steps: z.array(storedStep).max(24),
  modeSource: ref, stopPoint: z.object({ text: z.string(), at: z.string(), source: ref }).strict().optional(),
  closure: z.object({ note: z.string(), at: z.string(), source: ref }).strict().optional(),
  createdAt: z.string(), updatedAt: z.string() }).strip();
type StudyState = z.infer<typeof stateSchema>;
type StoredProblem = z.infer<typeof storedProblem>;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const signalFor = (context: StudyCompanionContext) => context.signal || new AbortController().signal;
const sameRef = (left: WorkSourceRef, right: WorkSourceRef) => canonical(left) === canonical(right);
const meaning = '这是这一道题的可接续陪学纸。你的尝试与助手的教学内容分开；提供过提示、看过讲解或收好这一页，都不证明独立完成或掌握。当前帮助方式只属于这次学习，不生成能力标签、成绩或日程。';

/** The existing Work owner holds the teaching artifact. The main model writes
 * one requested teaching move at a time; no hidden solution deck, second tutor
 * agent, mastery database, or automatic study schedule is created here. */
export class StudyCompanionService {
  private readonly sourceReads = new WeakMap<object, { scopeId: string; id: string; revision: number;
    sourceBinding: WorkSourceBinding; sourceMaterial?: MethodHelpMaterialIdentity }>();
  constructor(readonly repo: KernelRepository, readonly work: WorkService,
    readonly materials: Pick<MaterialService, 'invoke' | 'visual'> & Partial<Pick<MaterialService, 'retainedTextIdentityCurrent'>>) {}

  /** Only the actual object returned after get's asynchronous owner read can
   * freeze a typed version. Metadata indexes and cloned records have no mark. */
  sourceVersionSnapshot(handle: ScopeHandle, record: Pick<WorkRecord, 'id' | 'revision' | 'sourceBinding'>) {
    const read = this.sourceReads.get(record);
    if (!read || read.scopeId !== handle.id || read.id !== record.id || read.revision !== record.revision
      || canonical(read.sourceBinding) !== canonical(record.sourceBinding)) return;
    this.scope(handle);
    const f = this.repo.filter(handle), row = this.repo.db.prepare(`SELECT r.revision,json_extract(r.payload,'$.sourceBinding') AS binding
      FROM h_work r WHERE ${f.sql} AND r.id=? AND json_extract(r.payload,'$.data.type')='study_companion'`)
      .get(...f.params, record.id);
    if (!row || row.revision !== read.revision || canonical(JSON.parse(String(row.binding))) !== canonical(read.sourceBinding)
      || !this.verifyFrozenSources(handle, read)) return;
    return { sourceBinding: structuredClone(read.sourceBinding),
      ...(read.sourceMaterial ? { sourceMaterial: structuredClone(read.sourceMaterial) } : {}) };
  }

  private sourceMaterial(handle: ScopeHandle, problem: Record<string, unknown>) {
    if (problem.kind === 'evidence') return;
    return methodHelpMaterialIdentitySchema.parse({ resourceId: problem.resourceId, sha256: problem.sha256, version: problem.version,
      sourceEventId: problem.sourceEventId, contentVersion: problem.contentVersion,
      parentEventId: this.repo.evidence(handle, String(problem.sourceEventId))?.parentEventId,
      interpretation: problem.kind === 'material_text' ? 'retained_text_layer' : 'retained_file_lifetime_only' });
  }

  /** Legacy replies may recheck their still-identical owner version. This is
   * a current eligibility check, never a backfilled historical receipt. */
  currentSourceVersion(handle: ScopeHandle, value: { id: string; revision: number }) {
    try {
      this.scope(handle);
      const f = this.repo.filter(handle), row = this.repo.db.prepare(`SELECT r.revision,json_extract(r.payload,'$.sourceBinding') AS binding,
        json_remove(json_extract(r.payload,'$.data.problem'),'$.description') AS problem
        FROM h_work r WHERE ${f.sql} AND r.id=? AND json_extract(r.payload,'$.data.type')='study_companion'`)
        .get(...f.params, value.id);
      if (!row || row.revision !== value.revision || !row.binding) return;
      const sourceMaterial = this.sourceMaterial(handle, JSON.parse(String(row.problem)));
      const snapshot = { sourceBinding: JSON.parse(String(row.binding)) as WorkSourceBinding, ...(sourceMaterial ? { sourceMaterial } : {}) };
      if (this.verifyFrozenSources(handle, { id: value.id, ...snapshot })) return snapshot;
    } catch (error) {
      if (error instanceof HarnessError || error instanceof z.ZodError || error instanceof SyntaxError) return;
      throw error;
    }
  }

  /** Historical assistance uses its frozen sources and immutable problem
   * identity. Later attempts are not read or substituted for those sources. */
  verifyFrozenSources(handle: ScopeHandle, value: { id: string; sourceBinding: WorkSourceBinding; sourceMaterial?: MethodHelpMaterialIdentity }) {
    try {
      this.scope(handle);
      if (this.repo.hasFence(value.id) || !this.repo.workBindingsReadable(handle, [value.sourceBinding])) return false;
      const f = this.repo.filter(handle), row = this.repo.db.prepare(`SELECT json_extract(r.payload,'$.data.matterId') AS matter_id,
        json_extract(r.payload,'$.data.source') AS source,
        json_remove(json_extract(r.payload,'$.data.problem'),'$.description') AS problem
        FROM h_work r WHERE ${f.sql} AND r.id=? AND json_extract(r.payload,'$.data.type')='study_companion'`)
        .get(...f.params, value.id);
      if (!row || this.repo.hasFence(String(row.matter_id)) || !this.repo.db.prepare(`SELECT 1 FROM h_work r WHERE ${f.sql}
        AND r.id=? AND json_extract(r.payload,'$.data.type')='collaboration_frame'`).get(...f.params, String(row.matter_id))) return false;
      const problem = JSON.parse(String(row.problem)) as Record<string, unknown>;
      const source = workSourceRefSchema.parse(JSON.parse(String(row.source)));
      const identity = problem.kind === 'evidence' ? workSourceRefSchema.parse(problem.ref)
        : { resourceId: problem.resourceId, version: problem.version, page: problem.page ?? null,
          ...(problem.kind === 'material_text' ? { start: problem.start, end: problem.end } : { crop: problem.crop }) };
      if (value.id !== 'study:' + sha(canonical({ matterId: row.matter_id, source, problem: identity }))) return false;
      const refs = z.array(workSourceRefSchema).min(1).max(4).parse(problem.kind === 'evidence' ? [problem.ref] : problem.sourceRefs);
      if (refs.some(ref => !value.sourceBinding.refs.some(source => sameRef(source, ref)))) return false;
      if (problem.kind === 'evidence') return value.sourceMaterial === undefined;
      if (!['material_text', 'material_page'].includes(String(problem.kind))) return false;
      const material = methodHelpMaterialIdentitySchema.parse(value.sourceMaterial), event = this.repo.evidence(handle, material.sourceEventId);
      return material.resourceId === problem.resourceId && material.sha256 === problem.sha256 && material.version === problem.version
        && material.sourceEventId === problem.sourceEventId && material.contentVersion === problem.contentVersion
        && material.interpretation === (problem.kind === 'material_text' ? 'retained_text_layer' : 'retained_file_lifetime_only')
        && event?.parentEventId === material.parentEventId && this.materials.retainedTextIdentityCurrent?.(handle, material) === true;
    } catch (error) {
      if (error instanceof HarnessError || error instanceof z.ZodError || error instanceof SyntaxError) return false;
      throw error;
    }
  }

  private scope(handle: ScopeHandle, write = false) {
    const scope = this.work.policy.require(handle, write ? 'work:write' : 'evidence:read');
    if (!scope.grants.includes('evidence:read') || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
      || scope.audience !== 'self' || !scope.sources.includes('work:self')
      || write && (scope.child || scope.retention !== 'purpose_scoped'))
      throw new HarnessError('study_scope', '当前范围不能保留或展开这件学习内容；仍可以继续普通交流。');
    return scope;
  }

  private cite(handle: ScopeHandle, input: Citation, context: StudyCompanionContext, user = false, current = false): WorkSourceRef {
    const event = this.repo.evidence(handle, input.eventId), scope = this.scope(handle);
    if (!event || event.contentVersion !== input.contentVersion || input.end <= input.start
      || codePointSlice(event.text, input.start, input.end) !== input.quote
      || user && (event.speaker !== 'user' || event.authority !== 'user_statement')
      || current && (!scope.currentEventIds.includes(event.id) || !['user_message', 'user_control'].includes(event.kind)))
      throw new HarnessError('study_source', '需要真实原题或本人这次的原话；资料中的命令和助手代答不能成为你的尝试。');
    const { quote: _quote, ...source } = input;
    if (context.permits?.(source) === false) throw new HarnessError('study_source', '这个原话片段超出本项已获准的学习范围。');
    this.repo.resolveWorkSourceBinding(handle, [source]);
    return source;
  }

  private refs(data: StudyState) {
    const refs = [data.source, data.modeSource, data.lastSource, ...(data.problem.kind === 'evidence' ? [data.problem.ref] : data.problem.sourceRefs),
      ...data.attempts.map(attempt => attempt.source), ...data.steps.flatMap(step => [step.source, ...step.supports]),
      ...(data.stopPoint ? [data.stopPoint.source] : []), ...(data.closure ? [data.closure.source] : [])];
    return [...new Map(refs.map(source => [canonical(source), source])).values()];
  }

  private async materialProblem(handle: ScopeHandle, input: Exclude<ProblemInput, { kind: 'evidence' }>, context: StudyCompanionContext): Promise<StoredProblem> {
    const observation = context.observations?.find(value => value.toolCallId === input.observationId);
    const result = observation?.result as Record<string, any> | undefined, data = result?.data as Record<string, any> | undefined;
    const request = observation?.requestedArguments as Record<string, any> | undefined;
    const capability = observation?.tool === 'look_up' ? request?.capability : observation?.tool;
    const textRead = input.kind === 'material_text';
    if (!observation || !['fresh', 'partial'].includes(String(result?.status)) || !data
      || !(capability === (textRead ? 'materials.read' : 'materials.observe') || textRead && observation.tool === 'read_evidence')
      || data.resourceId !== input.resourceId || (data.page ?? null) !== (input.page ?? null)
      || data.source?.kind !== 'user_selected_file' || typeof data.source.sourceEventId !== 'string')
      throw new HarnessError('study_material_unread', '先读实际题目片段或观察实际页图，再把它放到陪学纸；文件目录和描述不代表题目已读。');
    const source = data.source, event = this.repo.evidence(handle, source.sourceEventId);
    if (!event || event.sourceId !== source.sourceId || event.contentVersion !== source.contentVersion
      || event.locator?.kind !== 'file' || event.locator.artifactId !== input.resourceId)
      throw new HarnessError('study_material_changed', '这份原题文件的来源已经改变，请回到当前文件重新读取。');
    const sourceRef = { eventId: event.id, contentVersion: event.contentVersion, start: 0, end: Array.from(event.text).length };
    if (context.permits?.(sourceRef) === false) throw new HarnessError('study_material_scope', '这份文件超出本项可用范围。');
    this.repo.resolveWorkSourceBinding(handle, [sourceRef]);
    const base = { resourceId: input.resourceId, sha256: String(source.sha256), version: Number(source.version),
      sourceEventId: event.id, contentVersion: event.contentVersion, sourceId: event.sourceId,
      name: String(source.name || '学习资料'), originObservationId: input.observationId, sourceRefs: [sourceRef] };
    let problem: StoredProblem;
    if (textRead) {
      const coverage = data.coverage;
      if (typeof data.text !== 'string' || !['decoded_original_preserved_newlines', 'pdf_text_layer'].includes(data.extraction)
        || !Number.isSafeInteger(coverage?.start) || !Number.isSafeInteger(coverage?.end)
        || input.start < coverage.start || input.end > coverage.end || input.end <= input.start
        || codePointSlice(data.text, input.start - coverage.start, input.end - coverage.start) !== input.quote)
        throw new HarnessError('study_material_range', '题目位置不在刚才实际读到的原文片段内；请回读那一页或缩小到已读范围。');
      problem = { kind: 'material_text', ...base, ...(input.page ? { page: input.page } : {}),
        start: input.start, end: input.end, quoteSha256: sha(input.quote) };
    } else {
      if (typeof data.observationId !== 'string') throw new HarnessError('study_material_unread', '这页还没有真实图像观察，请先打开原页。');
      this.materials.visual(handle, data.observationId);
      problem = { kind: 'material_page', ...base, page: input.page, description: input.description, crop: data.crop || null };
    }
    await this.problemView(handle, problem, context);
    return problem;
  }

  private async problemView(handle: ScopeHandle, problem: StoredProblem, context: StudyCompanionContext): Promise<StudyCompanionView['problem']> {
    const signal = signalFor(context); signal.throwIfAborted();
    if (problem.kind === 'evidence') {
      const event = this.repo.evidence(handle, problem.ref.eventId);
      if (!event || event.contentVersion !== problem.ref.contentVersion) throw new HarnessError('study_problem_changed', '原题现在不可读，请回到当前题目继续。');
      return { display: codePointSlice(event.text, problem.ref.start, problem.ref.end), origin: { kind: 'evidence',
        sourceId: event.sourceId, ...problem.ref, interpretation: 'original_excerpt',
        read: { tool: 'read_evidence', arguments: { id: event.id, offset: problem.ref.start, limit: problem.ref.end - problem.ref.start } } } };
    }
    const value = await this.materials.invoke(handle, 'materials.describe', { resourceId: problem.resourceId }, signal);
    signal.throwIfAborted(); this.scope(handle);
    const source = value?.data?.source;
    if (!source || source.resourceId !== problem.resourceId || source.sha256 !== problem.sha256 || source.version !== problem.version
      || source.sourceEventId !== problem.sourceEventId || source.contentVersion !== problem.contentVersion)
      throw new HarnessError('study_material_changed', '原题文件现在不可核对；没有从旧陪学纸恢复它的正文。');
    const origin: StudyOrigin = { kind: problem.kind, sourceId: problem.sourceId, resourceId: problem.resourceId,
      name: problem.name, ...(problem.page ? { page: problem.page } : {}),
      read: { tool: 'look_up', arguments: { source: 'capability', capability: problem.kind === 'material_text' ? 'materials.read' : 'materials.observe',
        arguments: { resourceId: problem.resourceId, ...(problem.page ? { page: problem.page } : {}),
          ...(problem.kind === 'material_text' ? { offset: problem.start, limit: problem.end - problem.start } : { crop: problem.crop }) } } } };
    if (problem.kind === 'material_page') return { display: problem.description, origin: { ...origin, interpretation: 'assistant_page_description' } };
    const read = await this.materials.invoke(handle, 'materials.read', { resourceId: problem.resourceId,
      ...(problem.page ? { page: problem.page } : {}), offset: problem.start, limit: problem.end - problem.start }, signal);
    signal.throwIfAborted(); this.scope(handle);
    if (typeof read?.data?.text !== 'string' || read.data.coverage?.start !== problem.start || read.data.coverage?.end !== problem.end
      || sha(read.data.text) !== problem.quoteSha256) throw new HarnessError('study_problem_changed', '原题片段现在不可完整核对，请重新读取实际题目。');
    return { display: read.data.text, origin: { ...origin, start: problem.start, end: problem.end, interpretation: 'original_excerpt' } };
  }

  private packet(handle: ScopeHandle, input: Packet, source: WorkSourceRef, mode: StudyMode, context: StudyCompanionContext): StudyState['steps'][number] {
    if (mode === 'small_hint' && !['question', 'hint'].includes(input.kind))
      throw new HarnessError('study_hint_boundary', '当前只给一点提示；先保留发现过程，需要讲解或例子时再随本轮请求切换。');
    if (mode !== 'explain' && input.kind === 'explanation')
      throw new HarnessError('study_hint_boundary', '完整讲解属于直讲方式；先按用户当前选择切换方式。');
    return { id: randomUUID(), kind: input.kind, ...(input.title ? { title: input.title } : {}), text: input.text,
      ...(input.exploration ? { exploration: input.exploration } : {}),
      nextMove: input.nextMove, mode, source, supports: (input.supports || []).map(value => this.cite(handle, value, context)), providedAt: this.repo.clock.now() };
  }

  private save(handle: ScopeHandle, record: WorkRecord, data: StudyState, expectedRevision?: number) {
    const refs = this.refs(data);
    if (refs.length > 32) throw new HarnessError('study_sheet_full', '这一页已经连着较多原题和尝试；可以从现在这一步另起一张，原来的过程仍保留。');
    const binding = this.repo.resolveWorkSourceBinding(handle, refs);
    const next: WorkRecord = { ...record, revision: (expectedRevision || 0) + 1,
      sourceBinding: binding, evidenceIds: [...new Set(binding.refs.map(source => source.eventId))], data: data as WorkRecord['data'] };
    this.repo.write(() => {
      this.repo.saveSourcedWork(handle, next, expectedRevision);
      for (const source of binding.refs) this.repo.addDependency(handle, { consumerId: next.id, producerId: source.eventId,
        producerRevision: source.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
      const matter = this.repo.work(handle, 'episode', data.matterId)[0];
      if (!matter || matter.data.type !== 'collaboration_frame' || !['active', 'needs_review'].includes(matter.status)
        || expectedRevision === undefined && matter.revision !== data.matterRevisionAtOpen)
        throw new HarnessError('study_matter_changed', '原共同事项在读取材料期间已经变化；请回到当前事项再继续，没有重开旧工作。');
    });
    return next;
  }

  async get(handle: ScopeHandle, recordId: string, context: StudyCompanionContext = {}) {
    this.scope(handle); signalFor(context).throwIfAborted();
    const record = this.repo.workArtifactRecords(handle, 'study_companion', { id: recordId, limit: 1 })[0];
    if (!record || !['active', 'parked', 'closed'].includes(record.status)) return;
    const parsed = stateSchema.safeParse(record.data);
    if (!parsed.success || !record.sourceBinding || context.restrictToSessionId && parsed.data.sessionId !== context.restrictToSessionId
      || this.refs(parsed.data).some(source => context.permits?.(source) === false)) return;
    const data = parsed.data, matter = this.repo.work(handle, 'episode', parsed.data.matterId)[0];
    if (!matter || matter.data.type !== 'collaboration_frame') return;
    const current = this.repo.resolveWorkSourceBinding(handle, this.refs(data));
    if (canonical(current) !== canonical(record.sourceBinding)) return;
    const problem = await this.problemView(handle, data.problem, context);
    signalFor(context).throwIfAborted(); this.scope(handle);
    const latest = this.repo.workArtifactRecords(handle, 'study_companion', { id: record.id, limit: 1 })[0];
    if (!latest || latest.revision !== record.revision) throw new HarnessError('study_changed', '这张陪学纸刚有了变化，请从现在的步骤接着。');
    const parentNow = this.repo.work(handle, 'episode', data.matterId)[0];
    if (!parentNow || parentNow.data.type !== 'collaboration_frame') throw new HarnessError('study_matter_changed', '原共同事项现在不可读，未恢复旧的陪学内容。');
    const parentActive = ['active', 'needs_review'].includes(parentNow.status);
    const historyOffset = context.historyOffset ?? 0, historyLimit = context.historyLimit ?? 4;
    if (!Number.isSafeInteger(historyOffset) || historyOffset < 0 || !Number.isSafeInteger(historyLimit) || historyLimit < 1 || historyLimit > 8)
      throw new HarnessError('study_address', '陪学纸的历史位置无效，请从当前这一步读取。');
    const historyPage = <T>(values: T[]) => values.slice(Math.max(0, values.length - historyOffset - historyLimit), Math.max(0, values.length - historyOffset));
    const attempts = (context.allAttempts ? data.attempts : historyPage(data.attempts)).map(attempt => {
      const event = this.repo.evidence(handle, attempt.source.eventId)!;
      return { id: attempt.id, text: codePointSlice(event.text, attempt.source.start, attempt.source.end),
        origin: 'user_report' as const, source: attempt.source, receivedAt: event.receivedAt };
    });
    const projectStep = ({ source: _source, supports: _supports, ...step }: StudyState['steps'][number]) => ({ ...step, origin: 'assistant_generated' as const });
    const steps = historyPage(data.steps).map(projectStep), latestStep = data.steps[data.steps.length - 1];
    const nextHistory = (!context.allAttempts && data.attempts.length > historyOffset + historyLimit
      || data.steps.length > historyOffset + historyLimit) ? historyOffset + historyLimit : null;
    const projection: StudyCompanionView = { id: record.id, revision: record.revision, matterId: data.matterId, title: record.title,
      status: record.status as StudyCompanionView['status'], mode: data.mode, focus: data.focus, problem, attempts, steps,
      ...(latestStep ? { currentStep: projectStep(latestStep) } : {}), nextStart: data.nextStart,
      historyCoverage: { attempts: { returned: attempts.length, total: data.attempts.length }, steps: { returned: steps.length, total: data.steps.length },
        nextOffset: nextHistory, ...(nextHistory === null ? {} : { read: { tool: 'study_companion',
          arguments: { operation: 'read', id: record.id, historyOffset: nextHistory, historyLimit } } }) },
      ...(data.stopPoint ? { stopPoint: { text: data.stopPoint.text, at: data.stopPoint.at } } : {}), sourceBinding: current,
      ...(data.closure ? { closure: { text: data.closure.note, at: data.closure.at } } : {}),
      interaction: { actions: record.status === 'closed' || !parentActive ? [] : [
        { id: 'try', label: '我来试一步', request: '我想从当前这一步自己试试，先别透露后面的解法。' },
        { id: 'hint', label: '再给一点提示', request: '只给能让我推进一点的小提示，别一起透露后面的突破口。' },
        { id: 'example', label: '换个例子讲', request: '围绕现在这个卡点换一个例子解释，再回到我的原题。' },
        { id: 'explain', label: '直接讲清楚', request: '这次请直接把这里讲清楚，不用坚持之前的小提示方式。' },
      ], meaning: '操作只把当前这张纸和这一步带回正常对话；不表示完成、掌握或接受安排。' }, updatedAt: data.updatedAt, meaning };
    const sourceMaterial = this.sourceMaterial(handle, data.problem);
    this.sourceReads.set(record, { scopeId: handle.id, id: record.id, revision: record.revision, sourceBinding: structuredClone(current),
      ...(sourceMaterial ? { sourceMaterial } : {}) });
    return { record, projection };
  }

  async read(handle: ScopeHandle, input: Extract<StudyCompanionInput, { operation: 'read' }>, context: StudyCompanionContext = {}) {
    this.scope(handle);
    if (input.id && input.matterId || !input.id && !input.matterId || input.id && input.offset
      || !input.id && (input.historyOffset !== undefined || input.historyLimit !== undefined))
      throw new HarnessError('study_address', '精确读取一张陪学纸用id，寻找同一事项下的纸用matterId和分页。');
    const offset = input.offset || 0, limit = input.limit || 6;
    const rows = this.repo.workArtifactRecords(handle, 'study_companion', { ...(input.id ? { id: input.id } : { matterId: input.matterId }),
      ...(context.restrictToSessionId ? { sessionId: context.restrictToSessionId } : {}), offset, limit: input.id ? 1 : limit + 1 });
    const page = input.id ? rows : rows.slice(0, limit), values: NonNullable<Awaited<ReturnType<StudyCompanionService['get']>>>[] = [];
    const unavailable: { id: string; reason: string }[] = [];
    for (const record of page) {
      try {
        const value = await this.get(handle, record.id,
          { ...context, historyOffset: input.historyOffset, historyLimit: input.historyLimit });
        if (value) values.push(value); else unavailable.push({ id: record.id, reason: 'owner_not_available' });
      } catch (error) {
        // One unavailable file must not hide another independent paper. Global
        // cancellation/scope failures still abort the entire delivery.
        if (input.id || !(error instanceof HarnessError)
          || !(error.code.startsWith('material_') || error.code.startsWith('study_material_')
            || error.code === 'study_problem_changed' || error.code === 'study_changed')) throw error;
        unavailable.push({ id: record.id, reason: error.code });
      }
    }
    signalFor(context).throwIfAborted(); this.scope(handle);
    return { status: values.length ? 'fresh' : page.length ? 'unavailable' : 'not_found', items: values.map(value => value.projection),
      records: values.map(value => value.record), unavailable, coverage: { nextOffset: !input.id && rows.length > limit ? offset + limit : null,
        complete: rows.length <= limit, someUnavailable: values.length < page.length }, meaning };
  }

  /** Small initial-context addresses. No PDF, problem text, answer, teaching
   * step or nextStart is opened here; get/read owns the asynchronous recovery. */
  index(handle: ScopeHandle, options: StudyCompanionContext & { limit?: number } = {}) {
    this.scope(handle);
    const limit = Math.min(4, Math.max(1, options.limit ?? 2)), scan = Math.min(100, limit * 4 + 1);
    const rows = this.repo.workArtifactRecords(handle, 'study_companion', {
      ...(options.restrictToSessionId ? { sessionId: options.restrictToSessionId } : {}), limit: scan,
    });
    const available = rows.flatMap(record => {
      const parsed = stateSchema.safeParse(record.data);
      if (!parsed.success || !['active', 'parked'].includes(record.status)
        || this.refs(parsed.data).some(source => options.permits?.(source) === false)) return [];
      const matter = this.repo.work(handle, 'episode', parsed.data.matterId)[0];
      if (!matter || matter.data.type !== 'collaboration_frame' || !['active', 'needs_review'].includes(matter.status)) return [];
      return [{ record, matterId: parsed.data.matterId }];
    });
    const selected = available.slice(0, limit);
    return { items: selected.map(({ record, matterId }) => ({ id: record.id, revision: record.revision, matterId,
      status: record.status, read: { tool: 'study_companion', arguments: { operation: 'read', id: record.id } },
      availability: 'requires_owner_read' as const })), records: selected.map(value => value.record),
      moreMayExist: rows.length === scan || available.length > selected.length,
      meaning: '这里只给陪学纸地址；题目、图像与教学内容须沿read异步复核，不据索引声称已读、已完成或掌握。' };
  }

  /** Body-free UI identity before new-input restrictions have been parsed.
   * This does not open a problem, attempt, teaching step or material. */
  referenceIdentity(handle: ScopeHandle, recordId: string, revision: number, context: { restrictToSessionId: string }) {
    this.scope(handle);
    const scope = this.repo.scope(handle), filter = this.repo.filter(handle), parent = this.repo.filter(handle, 'f');
    const row = this.repo.db.prepare(`SELECT r.id,f.id AS matter_id FROM h_work r JOIN h_work f ON f.id=json_extract(r.payload,'$.data.matterId')
      WHERE ${filter.sql} AND ${parent.sql} AND r.id=? AND r.revision=?
      AND r.kind='experience' AND json_extract(r.payload,'$.data.type')='study_companion'
      AND f.kind='episode' AND json_extract(f.payload,'$.data.type')='collaboration_frame'
      AND json_type(r.payload,'$.sourceBinding')='object'
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.sourceBinding.sourceIds') src
        WHERE src.type!='text' OR src.value NOT IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.sourceBinding.requiredGrants') permission
        WHERE permission.type!='text' OR permission.value NOT IN (SELECT value FROM json_each(?)))
      AND json_extract(r.payload,'$.data.sessionId')=?`).get(...filter.params, ...parent.params, recordId, revision,
        JSON.stringify(scope.sources), JSON.stringify(scope.grants), context.restrictToSessionId);
    if (!row || this.repo.hasFence(recordId) || this.repo.hasFence(String(row.matter_id)))
      throw new HarnessError('study_reference_missing', '这张陪学纸不在当前对话的这一处。');
    return { origin: 'study_companion' as const };
  }

  /** Synchronous adoption check after get/execute has already recovered the
   * actual material asynchronously. This does not claim another material read. */
  assertCurrent(handle: ScopeHandle, recordId: string, revision: number, context: StudyCompanionContext = {}): void {
    this.scope(handle); signalFor(context).throwIfAborted();
    const record = this.repo.workArtifactRecords(handle, 'study_companion', { id: recordId,
      ...(context.restrictToSessionId ? { sessionId: context.restrictToSessionId } : {}), limit: 1 })[0];
    const parsed = stateSchema.safeParse(record?.data);
    if (!record || record.revision !== revision || !['active', 'parked', 'closed'].includes(record.status)
      || !parsed.success || !record.sourceBinding || this.refs(parsed.data).some(source => context.permits?.(source) === false)
      || canonical(record.sourceBinding) !== canonical(this.repo.resolveWorkSourceBinding(handle, this.refs(parsed.data))))
      throw new HarnessError('study_changed', '刚读取的陪学内容或来源已变化，未采用旧步骤。');
    const matter = this.repo.work(handle, 'episode', parsed.data.matterId)[0];
    if (!matter || matter.data.type !== 'collaboration_frame') throw new HarnessError('study_matter_changed', '原共同事项已不可读，未采用旧陪学内容。');
  }

  async execute(handle: ScopeHandle, raw: StudyCompanionInput, context: StudyCompanionContext) {
    const input = studyCompanionInput.parse(raw), signal = signalFor(context); signal.throwIfAborted();
    if (input.operation === 'read') return this.read(handle, input, context);
    const scope = this.scope(handle, true), source = this.cite(handle, input.source, context, true, true);
    if (!context.sessionId) throw new HarnessError('study_session', '陪学纸需要保留在当前真实对话中。');
    let record: WorkRecord, data: StudyState, previousRevision: number | undefined;
    if (input.operation === 'open') {
      const matter = this.repo.work(handle, 'episode', input.matterId)[0];
      if (!matter || matter.data.type !== 'collaboration_frame' || matter.revision !== input.expectedMatterRevision
        || !['active', 'needs_review'].includes(matter.status)) throw new HarnessError('study_matter', '先沿当前真实学习事项打开这张纸，再接题目和尝试。');
      const problem: StoredProblem = input.problem.kind === 'evidence'
        ? { kind: 'evidence', ref: this.cite(handle, input.problem.source, context) }
        : await this.materialProblem(handle, input.problem, context);
      const identity = problem.kind === 'evidence' ? problem.ref : { resourceId: problem.resourceId, version: problem.version,
        page: problem.page ?? null, ...(problem.kind === 'material_text' ? { start: problem.start, end: problem.end } : { crop: problem.crop }) };
      const recordId = 'study:' + sha(canonical({ matterId: matter.id, source, problem: identity }));
      const existing = await this.get(handle, recordId, context);
      if (existing) return { status: 'fresh', items: [existing.projection], records: [existing.record], reused: true, meaning };
      const now = this.repo.clock.now();
      data = { type: 'study_companion', version: 1, matterId: matter.id, matterRevisionAtOpen: matter.revision, sessionId: context.sessionId,
        source, problem, mode: input.mode, modeSource: source, lastSource: source, focus: input.focus, nextStart: input.nextStart,
        attempts: input.attempt ? [{ id: randomUUID(), source: this.cite(handle, input.attempt, context, true) }] : [],
        steps: input.packet ? [this.packet(handle, input.packet, source, input.mode, context)] : [], createdAt: now, updatedAt: now };
      record = { id: recordId, kind: 'experience', ownerId: scope.principalId, workspaceId: scope.workspaceId, subjectId: scope.subjectId,
        worldId: scope.worldId, revision: 1, status: 'active', title: input.title, evidenceIds: [],
        label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false }, data: {} };
    } else {
      const existing = await this.get(handle, input.id, context);
      if (!existing || existing.record.revision !== input.expectedRevision) throw new HarnessError('study_changed', '这张陪学纸已变化或现在不可读，请先接回当前版本。');
      record = existing.record; previousRevision = record.revision; data = stateSchema.parse(record.data);
      if (record.status === 'closed') throw new HarnessError('study_closed', '这张纸已经收好了；回读不重新开启，新的探索可以另起一张。');
      if (input.operation === 'respond') {
        if (!input.mode && !input.attempt && !input.packet && input.focus === undefined && input.nextStart === undefined)
          throw new HarnessError('study_response_empty', '这一步需要实际尝试、当前帮助或一个新的起点。');
        if (input.mode) { data.mode = input.mode; data.modeSource = source; }
        if (input.attempt) { const attempt = this.cite(handle, input.attempt, context, true);
          if (!data.attempts.some(value => sameRef(value.source, attempt))) data.attempts.push({ id: randomUUID(), source: attempt }); }
        if (input.packet) {
          if (data.steps.length >= 24) throw new HarnessError('study_sheet_full', '这一页已经有很多步；可以保留现在的起点，换张纸接着想，旧过程不会被截掉。');
          data.steps.push(this.packet(handle, input.packet, source, data.mode, context));
        }
        if (input.focus !== undefined) data.focus = input.focus;
        if (input.nextStart !== undefined) data.nextStart = input.nextStart;
        delete data.stopPoint; record = { ...record, status: 'active' };
      } else if (input.operation === 'park') {
        data.nextStart = input.nextStart; data.stopPoint = { text: input.nextStart, at: this.repo.clock.now(), source };
        record = { ...record, status: 'parked' };
      } else {
        data.closure = { note: input.note || '这张陪学纸先收好。', at: this.repo.clock.now(), source };
        record = { ...record, status: 'closed' };
      }
      data.updatedAt = this.repo.clock.now(); data.lastSource = source;
    }
    data = stateSchema.parse(data); signal.throwIfAborted(); this.scope(handle, true);
    const saved = this.save(handle, record, data, previousRevision), result = await this.get(handle, saved.id, context);
    if (!result) throw new HarnessError('study_changed', '这一步已经记录，但当前来源暂不能完整展开；请从原事项重新读取。');
    return { status: 'fresh', items: [result.projection], records: [result.record], meaning };
  }
}
