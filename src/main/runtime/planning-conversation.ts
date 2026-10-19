import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, type ScopeHandle, type WorkRecord, type WorkSourceRef } from '../../shared/harness';
import type { Action } from '../../shared/types';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from './work';
import type { ActionRuntime } from '../actions/runtime';
import type { PlanningApplicationService } from '../actions/planning-application';
import type { PlanningCampusConstraints } from '../actions/planning-campus';
import { compareCalendarPlans, comparisonSteps, alternativeDraft, describeWorkRhythms, planningBranchUsable, planningComparisonInput, planningComparisonView } from '../actions/planning-comparison';
import { draftCalendarPlan } from '../actions/planning-draft';
import { projectCalendarChange } from '../actions/calendar';
import { canonical } from './semantics';
import { resolveRetainedSourceQuote } from './source-quote';

const id = z.string().min(1).max(160);
const stepId = z.string().min(1).max(200);
export const planningConversationReadInput = z.object({ matterId: id, optionId: id,
  expectedRevision: z.number().int().positive().optional(), planId: z.string().uuid().optional() }).strict();
const actionRefSchema = z.object({ stepId, actionId: id, actionRevision: z.number().int().positive() }).strict();
export const planningConversationContinueInput = planningConversationReadInput.extend({
  actionRefs: z.array(actionRefSchema).max(20).optional()
    .describe('原行动工具实际返回的动作ID与修订，明确对应本商量的stepId；只是读取地址，宿主仍核原动作、回执与当前日历，不凭同参或模型声明计成功。'),
}).strict();
export interface PlanningConversationContext {
  sessionId: string;
  matterId: string;
  expectedMatterRevision: number;
  sourceRefs: WorkSourceRef[];
  /** Host-observed parameter sources, never a model's asserted permission. */
  dependentSourceIds: string[];
}
export interface PlanningConversationReadOptions {
  /** Host supplies this when cross-session memory has not been admitted. */
  sessionId?: string;
  permits?: (ref: WorkSourceRef) => boolean;
}
const baselineSchema = z.array(z.object({ id, revision: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(2000);
const storedSchema = z.object({ type: z.literal('planning_alternative'), version: z.literal(1), matterId: id,
  sessionId: id, sessionIds: z.array(id), comparisonId: id, branchId: id, input: planningComparisonInput,
  baseline: baselineSchema, stepOrder: z.array(stepId).max(20), sourceIds: z.array(id), requiredGrants: z.array(z.string()),
  continuationActionRefs: z.array(actionRefSchema).max(20).optional(),
  sourceAttribution: z.enum(['declared_ranges', 'contains_legacy_event_ranges']).optional(),
  continuationPlanId: z.string().uuid().optional(), recordedAt: z.string(), updatedAt: z.string() }).strip();
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const grantFor = (source: string) => source === 'profile:self' ? 'memory:read' : source === 'map:local' ? 'map:read'
  : source === 'weather:open-meteo' ? 'weather:read' : source.startsWith('campus:') ? 'campus:read' : 'evidence:read';
const fieldsMatch = (expected: Record<string, any>, actual: Record<string, any>) =>
  Object.entries(expected).every(([key, value]) => canonical(value) === canonical(actual[key]));
const calendarContent = (item: Action) => {
  const { revision: _revision, effectActionId: _effect, approvalDigest: _approval, calendarChange: _change, saved: _saved, ...content } = item;
  return content;
};

/** Conversation memory uses the existing frame and its ordinary option IDs.
 * This service never dispatches actions or owns another calendar/ticket loop. */
export class PlanningConversationService {
  constructor(readonly repo: KernelRepository, readonly work: WorkService,
    readonly planning: PlanningApplicationService, readonly actions: ActionRuntime) {}

  private scope(handle: ScopeHandle, persistent = false) {
    const scope = this.work.policy.require(handle, persistent ? 'work:write' : 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('local-agenda') || persistent && (scope.child || scope.retention !== 'purpose_scoped' || !scope.sources.includes('work:self')))
      throw new HarnessError('planning_conversation_scope', '这次商量需要本人当前允许的日历范围；保留方案还需要原工作事项的保存范围。');
    return scope;
  }

  private withCampus(handle: ScopeHandle, raw: unknown, campus?: PlanningCampusConstraints | null) {
    const input = planningComparisonInput.parse(raw), scope = this.scope(handle);
    if (campus && !this.planning.campusCurrent(scope, campus))
      throw new HarnessError('planning_campus_changed', '校园安排的保存快照已改变，先回读再比较。');
    return campus ? planningComparisonInput.parse({ ...input, draft: { ...input.draft,
      busy: [...input.draft.busy.filter(value => value.sourceId !== campus.sourceId), ...campus.busy],
      sourceCoverage: [...input.draft.sourceCoverage.filter(value => value.sourceId !== campus.sourceId), campus.coverage] } }) : input;
  }

  compare(handle: ScopeHandle, items: Action[], raw: unknown, campus?: PlanningCampusConstraints | null) {
    return compareCalendarPlans(items, this.withCampus(handle, raw, campus));
  }

  /** Original frame citation proof, reused by foreground receipt admission.
   * Whole-event legacy protection remains distinguishable from exact support. */
  matterSources(handle: ScopeHandle, matterId: string, expectedRevision?: number) {
    const scope = this.scope(handle);
    const frame = scope.sources.includes('work:self') ? this.repo.work(handle, 'episode', matterId)[0] : undefined;
    if (!frame || frame.data.type !== 'collaboration_frame' || expectedRevision !== undefined && frame.revision !== expectedRevision)
      throw new HarnessError('planning_conversation_matter', '原商量的来源或当前版本还没有对齐。');
    let sourceAttribution: 'declared_ranges' | 'contains_legacy_event_ranges' = 'declared_ranges';
    let matterRefs = frame.sourceBinding?.refs;
    if (!matterRefs) {
      // Read only citations this owner actually declares. Never recursively
      // guess source-shaped fields or upgrade a privacy closure into a precise
      // semantic relation merely because its whole event is currently legal.
      let completeDeclarations = !!frame.data.source && ['confirmedFacts', 'decisions', 'rejectedOptions'].every(key => Array.isArray(frame.data[key]))
        && !(Array.isArray(frame.data.decisionExperiences) && frame.data.decisionExperiences.length) && !frame.data.selection && !frame.data.repair;
      const citations: unknown[] = [frame.data.source, ...['confirmedFacts', 'decisions', 'rejectedOptions'].flatMap(key =>
        Array.isArray(frame.data[key]) ? frame.data[key].map(item => item && typeof item === 'object' && !Array.isArray(item) ? item.source : undefined) : [])];
      const declared: WorkSourceRef[] = [];
      for (const raw of citations) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { completeDeclarations = false; continue; }
        const citation = raw as Record<string, unknown>;
        if (typeof citation.eventId !== 'string' || typeof citation.quote !== 'string') { completeDeclarations = false; continue; }
        const event = this.repo.evidence(handle, citation.eventId);
        const resolved = event && resolveRetainedSourceQuote(event, citation);
        if (!resolved) throw new HarnessError('work_source_changed', '原商量已声明的引文、版本或位置改变，不能回退整事件为旧正文换来源。');
        declared.push({ eventId: resolved.eventId, contentVersion: resolved.contentVersion, start: resolved.start, end: resolved.end });
      }
      if (completeDeclarations && declared.length && frame.evidenceIds.every(eventId => declared.some(ref => ref.eventId === eventId))) matterRefs = declared;
      else sourceAttribution = 'contains_legacy_event_ranges';
    }
    matterRefs ||= frame.evidenceIds.map(eventId => {
      const event = this.repo.evidence(handle, eventId);
      if (!event) throw new HarnessError('work_source_changed', '原商量的依据已不可读，未用新一句话为旧内容换来源。');
      return { eventId, contentVersion: event.contentVersion, start: 0, end: Array.from(event.text).length };
    });
    return { refs: matterRefs, attribution: sourceAttribution };
  }

  offer(handle: ScopeHandle, items: Action[], raw: unknown, context: PlanningConversationContext, campus?: PlanningCampusConstraints | null) {
    const scope = this.scope(handle, true), input = this.withCampus(handle, raw, campus);
    const frame = this.repo.work(handle, 'episode', context.matterId)[0];
    if (!frame || frame.data.type !== 'collaboration_frame' || frame.revision !== context.expectedMatterRevision
      || !['active', 'needs_review'].includes(frame.status))
      throw new HarnessError('planning_conversation_matter', '先恢复同一件商量的当前版本，再把新的办法接进来。');
    // Carry the original owner's actual declared addresses, never only a new
    // short request that could leave an old copied condition without its source.
    const { refs: matterRefs, attribution: sourceAttribution } = this.matterSources(handle, frame.id, frame.revision);
    const completeRefs = [...new Map([...context.sourceRefs, ...matterRefs].map(ref => [canonical(ref), ref])).values()];
    const binding = this.repo.resolveWorkSourceBinding(handle, completeRefs);
    if (!binding.refs.some(ref => scope.currentEventIds.includes(ref.eventId)
      && this.repo.evidence(handle, ref.eventId)?.speaker === 'user'))
      throw new HarnessError('planning_conversation_source', '保留这次商量需要本轮本人原话，旧方案或附件命令不会自行授予保留。');
    const sourceIds = [...new Set([...binding.sourceIds, 'local-agenda', ...context.dependentSourceIds,
      ...(campus ? [campus.coverage.sourceId] : [])])].sort();
    const requiredGrants = [...new Set(['evidence:read', ...sourceIds.map(grantFor)])].sort();
    const parameterSources = [...input.draft.busy, ...input.draft.sourceCoverage.filter(value => value.status !== 'not_checked'), ...input.draft.travelTimes,
      ...input.draft.energyWindows, ...input.draft.conditions.filter(value => value.status !== 'unknown'), ...input.draft.tasks,
      ...input.draft.tasks.flatMap(task => task.conditions.filter(value => value.status !== 'unknown'))].flatMap(value => value.sourceId ? [value.sourceId] : [])
      .filter(source => !['current', 'user-declared'].includes(source));
    if (sourceIds.some(source => !scope.sources.includes(source) && !binding.sourceIds.includes(source))
      || parameterSources.some(source => !sourceIds.includes(source)) || requiredGrants.some(grant => !scope.grants.includes(grant)))
      throw new HarnessError('planning_conversation_source', '方案实际借用的来源不在本次范围内，未复制进工作记录。');
    const comparison = compareCalendarPlans(items, input);
    if (!comparison.coverage.meaningfulComparison)
      return { status: 'needs_distinct_alternatives' as const, comparison, records: [] as WorkRecord[], bindings: [binding],
        meaning: '还没有两种实质不同的完整安排；保留已算出的缺口，继续提出另一种真实取舍，没有换标题凑数。' };
    const baseline = baselineSchema.parse(items.map(item => ({ id: item.id, revision: item.revision || 1, sha256: hash(item) })));
    return this.repo.write(() => {
      const current = this.repo.work(handle, 'episode', frame.id)[0];
      if (!current || current.revision !== frame.revision)
        throw new HarnessError('revision_conflict', '商量事项刚刚改变，没有覆盖别处的进展。');
      const currentBinding = this.repo.resolveWorkSourceBinding(handle, binding.refs);
      if (canonical(currentBinding) !== canonical(binding)) throw new HarnessError('work_sources_changed', '商量的原话已变化。');
      const now = this.repo.clock.now(), comparisonId = randomUUID();
      const options = comparison.branches.filter(planningBranchUsable).map(branch => {
        const record: WorkRecord = { id: randomUUID(), kind: 'option', revision: 1, status: 'candidate', title: branch.title,
          ownerId: scope.principalId, workspaceId: scope.workspaceId, subjectId: scope.subjectId, worldId: scope.worldId,
          evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], sourceBinding: binding,
          label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false },
          data: JSON.parse(JSON.stringify({ type: 'planning_alternative', version: 1, matterId: frame.id,
            sessionId: context.sessionId, sessionIds: [context.sessionId], comparisonId, branchId: branch.id, input, baseline,
            stepOrder: branch.steps.map(step => step.id), sourceIds, requiredGrants, sourceAttribution, recordedAt: now, updatedAt: now })) };
        this.repo.saveSourcedWork(handle, record);
        return record;
      });
      const optionIds = [...new Set([...(Array.isArray(current.data.optionIds) ? current.data.optionIds.filter((value): value is string => typeof value === 'string') : []), ...options.map(option => option.id)])];
      const next: WorkRecord = { ...current, revision: current.revision + 1, data: { ...current.data, optionIds,
        lastPlanningComparisonId: comparisonId, updatedAt: now } };
      if (next.sourceBinding) this.repo.saveSourcedWork(handle, next, current.revision);
      else this.repo.saveWork(handle, next, current.revision);
      return { status: 'available' as const, matterId: frame.id, matterRevision: next.revision, comparisonId,
        comparisonView: planningComparisonView(comparison, { comparisonId, matterId: frame.id, matterRevision: next.revision,
          sourceIds, sourceBinding: binding, options: options.map(option => ({ id: option.id, revision: option.revision, branchId: String(option.data.branchId) })) }),
        alternatives: comparison.branches.map(branch => {
          const option = options.find(value => value.data.branchId === branch.id);
          return { branchId: branch.id, feasibility: branch.feasibility,
            changes: branch.changes.map(change => ({ targetId: change.targetId, expectedRevision: change.expectedRevision,
              title: change.before.title, operation: change.operation, ...(change.occurrenceDate ? { occurrenceDate: change.occurrenceDate } : {}),
              ...(change.cancelled !== undefined ? { cancelled: change.cancelled } : {}) })),
            preserved: branch.preserved, activities: branch.additions,
            ...(option ? { optionId: option.id, optionRevision: option.revision,
              read: { tool: 'read_planning_alternative', arguments: { matterId: next.id, optionId: option.id, expectedRevision: option.revision } } } : {}) };
        }),
        coverage: { ...comparison.coverage, timelineBodyDelivered: false,
          meaning: '本次返回同一商量的准确方案地址、真实差异和未排原因。完整占用仍在原owner中，由read_planning_alternative或present_view按预算展开；没有把两份日账和正文重复塞进目录，也没有把目录当作完整正文已读。' },
        records: [next, ...options], bindings: [binding], calendarChanged: false, executionAuthorized: false,
        meaning: '这些办法接在原来的商量里；没有接受方案、写日历或形成新的长期偏好。可以点一版继续谈，明确采用仍走原动作边界。' };
    });
  }

  private option(handle: ScopeHandle, raw: unknown, options: PlanningConversationReadOptions = {}) {
    const scope = this.scope(handle), input = planningConversationReadInput.parse(raw);
    if (!scope.sources.includes('work:self')) throw new HarnessError('planning_conversation_scope', '本次范围不包括之前的商量。');
    const record = this.repo.work(handle, 'option', input.optionId)[0], frame = this.repo.work(handle, 'episode', input.matterId)[0];
    const parsed = storedSchema.safeParse(record?.data);
    if (!record || !record.sourceBinding || !frame || frame.data.type !== 'collaboration_frame' || !parsed.success
      || parsed.data.matterId !== frame.id || !Array.isArray(frame.data.optionIds) || !frame.data.optionIds.includes(record.id)
      || parsed.data.sourceIds.some(source => !scope.sources.includes(source) && !record.sourceBinding!.sourceIds.includes(source))
      || parsed.data.requiredGrants.some(grant => !scope.grants.includes(grant)))
      throw new HarnessError('planning_conversation_missing', '这份办法或它的实际来源现在不可读，没有从旧副本恢复。');
    if (record.sourceBinding.refs.some(ref => options.permits?.(ref) === false)
      || frame.sourceBinding?.refs.some(ref => options.permits?.(ref) === false))
      throw new HarnessError('planning_conversation_scope', '这份完整办法依赖获准片段之外的原话，没有把局部授权扩成整条消息。');
    if (options.sessionId && !parsed.data.sessionIds.includes(options.sessionId) && parsed.data.sessionId !== options.sessionId
      && frame.data.sessionId !== options.sessionId && !(Array.isArray(frame.data.sessionIds) && frame.data.sessionIds.includes(options.sessionId)))
      throw new HarnessError('planning_conversation_scope', '当前仅恢复本会话的商量，没有读取其他会话的办法。');
    if (input.expectedRevision !== undefined && record.revision !== input.expectedRevision)
      throw new HarnessError('revision_conflict', '这份办法已更新，先读它的当前版本。');
    const alternative = parsed.data.input.alternatives.find(value => value.id === parsed.data.branchId);
    if (!alternative) throw new HarnessError('planning_conversation_missing', '原方案规格缺少这条分支，没有补造步骤。');
    return { input, scope, record, frame, data: parsed.data, alternative };
  }

  describe(handle: ScopeHandle, raw: unknown, options: PlanningConversationReadOptions = {}) {
    const value = this.option(handle, raw, options);
    return { matterId: value.frame.id, optionId: value.record.id, revision: value.record.revision,
      window: { from: value.data.input.draft.from, to: value.data.input.draft.to, timeZone: value.data.input.draft.timeZone },
      hasContinuation: !!value.data.continuationPlanId, records: [value.frame, value.record], bindings: [value.record.sourceBinding!] };
  }

  read(handle: ScopeHandle, items: Action[], raw: unknown, options: PlanningConversationReadOptions = {}, campus?: PlanningCampusConstraints | null) {
    const value = this.option(handle, raw, options), { record, frame, data } = value;
    const current = this.withCampus(handle, data.input, campus);
    // A single original option remains readable when today's constraints make
    // it equivalent to another one. Only the comparison de-duplicates views;
    // it must not erase the addressed owner's calculation or step identities.
    const comparison = compareCalendarPlans(items, { ...current,
      alternatives: [value.alternative, ...current.alternatives.filter(branch => branch.id !== data.branchId)] });
    return { matterId: frame.id, optionId: record.id, revision: record.revision, status: record.status,
      selected: frame.data.selectedOptionId === record.id, calendarChanged: !sameBaseline(items, data.baseline),
      externalFactsRequireRecheck: data.sourceIds.some(source => !['history:self', 'work:self', 'local-agenda', ...(campus ? [campus.sourceId] : [])].includes(source)),
      branch: comparison.branches.find(branch => branch.id === data.branchId) || null,
      continuation: { actionRefs: data.continuationActionRefs || [], ...(data.continuationPlanId ? { planId: data.continuationPlanId } : {}) },
      records: [frame, record], bindings: [record.sourceBinding!], applied: false,
      meaning: '这是同一商量的当前回读。过去理由和选择不替代今天的意愿；点选不授予行动，原安排改变后须继续商量。' };
  }

  continue(handle: ScopeHandle, items: Action[], raw: unknown, campus?: PlanningCampusConstraints | null, options: PlanningConversationReadOptions = {}) {
    const { actionRefs: suppliedRefs, ...address } = planningConversationContinueInput.parse(raw);
    const value = this.option(handle, address, options), { input: request, scope, frame, data, alternative } = value;
    let record = value.record;
    if (scope.child || !['active', 'needs_review'].includes(frame.status) || ['rejected', 'cancelled', 'stale', 'blocked'].includes(record.status))
      throw new HarnessError('planning_conversation_inactive', '这件事或这份办法当前不能继续采用；仍可按原话重新商量。');
    if (request.planId && request.planId !== data.continuationPlanId)
      throw new HarnessError('planning_conversation_plan', '这个规划编号不是本份商量实际生成的后续方案，没有把别的进展接进来。');
    if (data.continuationPlanId && suppliedRefs?.some(ref => !(data.continuationActionRefs || []).some(previous => canonical(previous) === canonical(ref))))
      throw new HarnessError('planning_conversation_action_reference', '后续方案已经沿这些原动作生成，新的动作引用须另行接着商量，不能补签旧采用。');
    if (data.continuationPlanId) return { status: 'continue_existing_plan', matterId: frame.id, optionId: record.id, revision: record.revision,
      remaining: this.planning.recover(scope, items, { planId: data.continuationPlanId }), records: [frame, record], bindings: [record.sourceBinding!],
      actionRefs: data.continuationActionRefs || [],
      applied: false, atomic: false, meaning: '沿原规划器回读真实已保存步骤；没有重建执行票据或把保存量说成完成量。' };
    const declaredSteps = comparisonSteps(data.input, alternative);
    if (data.stepOrder.length !== declaredSteps.length || new Set(data.stepOrder).size !== data.stepOrder.length
      || data.stepOrder.some(id => !declaredSteps.some(step => step.id === id)))
      throw new HarnessError('planning_conversation_steps', '原完整顺序缺少真实步骤，先重新商量，不猜造执行顺序。');
    const steps = data.stepOrder.map((id, index) => ({ ...declaredSteps.find(step => step.id === id)!, order: index + 1 }));
    const actions = this.actions.list(handle);
    if (suppliedRefs && (new Set(suppliedRefs.map(ref => ref.stepId)).size !== suppliedRefs.length
      || new Set(suppliedRefs.map(ref => ref.actionId)).size !== suppliedRefs.length))
      throw new HarnessError('planning_conversation_action_reference', '每一步需对应一个准确的原动作；不能重复归给两步或用多条同参记录猜结果。');
    const linked = new Map((data.continuationActionRefs || []).map(ref => [ref.stepId, ref]));
    for (const ref of suppliedRefs || []) {
      const step = steps.find(value => value.id === ref.stepId), action = this.actions.get(handle, ref.actionId);
      if (!step || !action || action.revision !== ref.actionRevision || action.capability !== step.capability
        || !fieldsMatch(step.arguments, action.arguments) || action.arguments.createNew === true)
        throw new HarnessError('planning_conversation_action_reference', '原动作、当前修订、来源或完整参数没有对上这一步；先沿inspect_action读取实际结果，没有按同参签成功。');
      linked.set(ref.stepId, ref);
    }
    const actionRefs = [...linked.values()];
    if (new Set(actionRefs.map(ref => ref.actionId)).size !== actionRefs.length
      || actionRefs.some(ref => !steps.some(step => step.id === ref.stepId)))
      throw new HarnessError('planning_conversation_action_reference', '原动作引用不属于这份完整步骤，未将另一个动作重复计入。');
    const observedIds = new Set<string>(), changedIds = new Set(alternative.changes.map(change => change.targetId));
    const observations = steps.map(step => {
      const candidates = actions.filter(action => action.capability === step.capability
        && fieldsMatch(step.arguments, action.arguments) && action.arguments.createNew !== true);
      const ref = linked.get(step.id), currentAction = ref ? this.actions.get(handle, ref.actionId) : undefined;
      const valid = currentAction && ref && currentAction.revision === ref.actionRevision && currentAction.capability === step.capability
        && fieldsMatch(step.arguments, currentAction.arguments) && currentAction.arguments.createNew !== true;
      const action = valid ? currentAction : undefined;
      const confirmed = !!action && action.status === 'succeeded'
        && this.actions.receipts(handle, action.id).some(receipt => receipt.status === 'confirmed_success');
      let current: Action | undefined, applied = false;
      if (confirmed && action?.compensation?.applied) {
        if (step.kind === 'addition') {
          current = items.find(item => item.id === action.compensation!.targetId && item.effectActionId === action.id);
          applied = !!current && fieldsMatch(step.arguments, current as unknown as Record<string, any>)
            && (current.revision || 1) === action.compensation.expectedRevision;
        } else {
          const previous = action.compensation.previous as unknown as Action | null;
          current = items.find(item => item.id === step.targetId);
          const original = data.baseline.find(item => item.id === step.targetId);
          if (previous && original?.sha256 === hash(previous)) {
            if (step.arguments.operation === 'delete') applied = !current;
            else {
              const projected = projectCalendarChange(previous, step.arguments, data.input.draft.timeZone);
              applied = !!current && current.effectActionId === action.id
                && (current.revision || 1) === action.compensation.expectedRevision
                && canonical(calendarContent(current)) === canonical(calendarContent(projected));
            }
          }
        }
      }
      if (applied && current) observedIds.add(current.id);
      const target = step.targetId ? items.find(item => item.id === step.targetId) : undefined;
      const unmodified = step.kind === 'addition' || !!target && data.baseline.find(item => item.id === target.id)?.sha256 === hash(target);
      const uncertain = !!ref && (!action || ['dispatching', 'outcome_unknown', 'unresolved', 'cancel_requested'].includes(action.status));
      const pending = !!action && ['proposed', 'awaiting_approval', 'approved'].includes(action.status);
      const missingReference = !ref && !!candidates.length;
      const status = applied ? 'applied' as const : uncertain ? 'unknown' as const : pending ? 'pending' as const
        : missingReference ? 'needs_action_reference' as const : action && action.status !== 'failed_confirmed' ? 'changed' as const
        : unmodified ? 'not_applied' as const : 'changed' as const;
      const visible = candidates.slice(0, 8);
      return { id: step.id, order: step.order, status,
        ...(ref ? { actionRef: ref, inspectLinked: { tool: 'inspect_action', arguments: { id: ref.actionId } } } : {}),
        candidateActions: visible.map(action => ({ id: action.id, revision: action.revision, status: action.status,
          inspect: { tool: 'inspect_action', arguments: { id: action.id } } })),
        candidateCoverage: { complete: candidates.length <= visible.length, returned: visible.length },
        proposal: { ...step, invoke: { tool: step.kind === 'change' ? 'change_local_action' : 'prepare_action', arguments: step.arguments } },
        ...(current ? { recordId: current.id, recordRevision: current.revision || 1 } : {}) };
    });
    const unrelatedChanges = data.baseline.filter(original => !changedIds.has(original.id)
      && !items.some(item => item.id === original.id && hash(item) === original.sha256)).map(value => value.id);
    const additions = items.filter(item => !data.baseline.some(original => original.id === item.id) && !observedIds.has(item.id));
    const complete = observations.every(value => value.status === 'applied');
    const needsReview = observations.some(value => !['applied', 'not_applied'].includes(value.status)) || !!unrelatedChanges.length || !!additions.length;
    const next = !needsReview ? observations.find(value => value.status === 'not_applied') : undefined;
    // Persist only exact addresses in this existing option. Every later read
    // rechecks the original Action owner; no outcome or success total is saved.
    if (suppliedRefs?.length && canonical(actionRefs) !== canonical(data.continuationActionRefs || []) && scope.grants.includes('work:write')) {
      this.scope(handle, true);
      const nextRecord: WorkRecord = { ...record, revision: record.revision + 1,
        data: { ...record.data, continuationActionRefs: actionRefs, updatedAt: this.repo.clock.now() } };
      this.repo.saveSourcedWork(handle, nextRecord, record.revision); record = nextRecord;
    }
    const continuation = { tool: 'continue_planning', arguments: { matterId: frame.id, optionId: record.id,
      expectedRevision: record.revision, ...(actionRefs.length ? { actionRefs } : {}) } };
    const common = { matterId: frame.id, optionId: record.id, revision: record.revision, observations,
      actionRefs, continue: continuation,
      completedSteps: observations.filter(value => value.status === 'applied').length, totalSteps: steps.length,
      unrelatedChangedIds: unrelatedChanges, unexpectedRecords: additions.map(item => ({ id: item.id, revision: item.revision || 1,
        ...(item.planRef ? { recover: { capability: 'planning.recover', arguments: { planId: item.planRef.planId } } } : {}) })),
      records: [frame, record], bindings: [record.sourceBinding!], applied: false, atomic: false, executionAuthorized: false };
    if (needsReview) return { ...common, status: 'continue_discussion', nextProposal: null, remaining: null,
      meaning: '有些真实结果或安排已变化，先接着这件事商量；成功部分保留，未知结果沿inspect核查，不把未完成部分盲重发。' };
    if (!complete) return { ...common, status: common.completedSteps ? 'partially_applied' : 'ready_to_discuss',
      nextProposal: next?.proposal || null, remaining: null,
      meaning: '按顺序给原动作提议，每一步仍核当前授权。看中这一版不等于批准；已经成功的步骤不重做，也不冒称整组原子完成。' };
    const draft = alternativeDraft(data.input, alternative);
    // Campus rows already in the stored comparison are a past calculation,
    // not fresh facts. The host passes the current snapshot to the old planner.
    const freshDraft = campus ? { ...draft, busy: draft.busy.filter(value => value.sourceId !== campus.coverage.sourceId),
      sourceCoverage: draft.sourceCoverage.filter(value => value.sourceId !== campus.coverage.sourceId) } : draft;
    this.scope(handle, true);
    if (data.sourceIds.includes('campus:zju-account') && !campus)
      return { ...common, status: 'continue_discussion', nextProposal: null, remaining: null,
        meaning: '原商量借用了校园安排，先按当前允许范围回读同一窗口，再续排；已经完成的原动作仍保留。' };
    if (alternative.taskPreferences.some(preference => preference.rhythm)) {
      const currentDraft = campus ? { ...freshDraft, busy: [...freshDraft.busy, ...campus.busy],
        sourceCoverage: [...freshDraft.sourceCoverage, campus.coverage] } : freshDraft;
      const projected = draftCalendarPlan(items, currentDraft);
      const workRhythms = describeWorkRhythms(data.input, alternative, projected);
      if (workRhythms.some(rhythm => !rhythm.complete || !rhythm.matchesRequest))
        return { ...common, status: 'continue_discussion', nextProposal: null, remaining: null, workRhythms,
          unscheduled: projected.unscheduled,
          meaning: '原动作已成功的部分保留；按当前现实还没把这份完整工作排成刚才选的节奏，先接着商量，没有用少做一点冒充采用同一版，也没有另建旧票据。' };
    }
    const remaining = this.planning.prepare(scope, items, freshDraft, undefined, campus);
    const workRhythms = describeWorkRhythms(data.input, alternative, remaining);
    const nextRecord: WorkRecord = { ...record, revision: record.revision + 1,
      data: { ...record.data, continuationPlanId: remaining.planId, updatedAt: this.repo.clock.now() } };
    this.repo.saveSourcedWork(handle, nextRecord, record.revision);
    return { ...common, status: 'ready_for_remaining_plan', revision: nextRecord.revision,
      records: [frame, nextRecord], nextProposal: null, remaining,
      ...(workRhythms.length ? { workRhythms } : {}),
      continue: { tool: 'continue_planning', arguments: { matterId: frame.id, optionId: record.id,
        expectedRevision: nextRecord.revision, planId: remaining.planId } },
      meaning: '原对象和拟参加活动的真实步骤已核对，剩余工作沿同一规划器在当前日历上试算。继续采用完整planRef及准备休息单位；新的方案仍不是完成或执行授权。' };
  }
}

// Address/hash metadata detects whether a stored comparison still has its
// original baseline without retaining another private calendar body.
function sameBaseline(items: Action[], values: z.infer<typeof baselineSchema>) {
  return items.length === values.length && values.every(value => items.some(item => item.id === value.id && hash(item) === value.sha256));
}
