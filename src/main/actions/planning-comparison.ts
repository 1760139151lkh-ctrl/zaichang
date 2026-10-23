import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Action } from '../../shared/types';
import { HarnessError, type WorkSourceBinding } from '../../shared/harness';
import type { PlanningComparisonView, PlanningWorkRhythm } from '../../shared/planning-conversation';
import { localCalendarChangeSchema } from '../../shared/calendar';
import { canonical } from '../runtime/semantics';
import { expandAgenda, normalizeCalendarInput, projectCalendarChange } from './calendar';
import { calendarCommitment, previewCalendarPlan } from './planning';
import { calendarPlanFingerprint, draftCalendarPlan, planningDraftInput } from './planning-draft';

const id = z.string().min(1).max(160);
const instant = z.string().datetime({ offset: true });
const window = z.object({ start: instant, end: instant }).strict();
const workRhythm = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('continuous') }).strict(),
  z.object({ kind: z.literal('split'), maximumChunkMinutes: z.number().int().min(1).max(1440) }).strict(),
]).describe('本分支试做同一份完整工作：连续做不放宽原单段上限；分段仅用于原本允许拆分的任务，以更短上限构造真实多段，准备收尾仍逐段保留。不形成长期偏好或日历保护。');
const activity = z.object({
  id, title: z.string().min(1).max(160), detail: z.string().max(1200).default(''),
  startsAt: instant, durationMinutes: z.number().int().min(1).max(1440),
  kind: z.enum(['event', 'time_block']).default('event'), placeId: id.optional(),
  state: z.enum(['invitation', 'wish', 'proposed']).default('proposed')
    .describe('原本尚未接受的活动。仅在这一分支里计算如果参加的占用，不改变现实承诺。'),
}).strict();
export const planningAlternativeInput = z.object({
  id, title: z.string().min(1).max(160), intent: z.string().min(1).max(1200),
  changes: z.array(localCalendarChangeSchema).max(12).default([]),
  additions: z.array(activity).max(8).default([]),
  taskPreferences: z.array(z.object({ taskId: id, priority: z.number().int().min(0).max(10).optional(),
    preferredWindows: z.array(window).max(32).optional(), rhythm: workRhythm.optional() }).strict()).max(30).default([]),
  additionalProtectedWindows: z.array(window.extend({ reason: z.string().min(1).max(300) }).strict()).max(32).default([])
    .describe('仅表达本次确实要商量保留的时段，仍未接受或创建日历保护。不能为凑分段虚构保护窗口；连续/分段选择用taskPreferences.rhythm，原任务窗口与工作量照旧。'),
}).strict();
export const planningComparisonInput = z.object({
  draft: planningDraftInput,
  preserveActionIds: z.array(id).max(100).default([]).describe('本次商量明确不动的原安排；分支不能删除或修改这些对象。'),
  alternatives: z.array(planningAlternativeInput).min(2).max(4),
}).strict();
export type PlanningComparisonInput = z.infer<typeof planningComparisonInput>;
export type PlanningAlternativeInput = z.infer<typeof planningAlternativeInput>;
export type PlanningDraftRequest = z.infer<typeof planningDraftInput>;
export interface PlanningComparisonStep {
  id: string;
  order: number;
  kind: 'change' | 'addition';
  capability: 'local.agenda.change' | 'local.agenda.save';
  arguments: Record<string, any>;
  targetId?: string;
  expectedRevision?: number;
  beforeState?: string;
  requiresAuthorization: true;
}
export interface PlanningComparisonBranch {
  id: string;
  title: string;
  intent: string;
  draftRequest: PlanningDraftRequest;
  draft: ReturnType<typeof draftCalendarPlan> | null;
  changes: { targetId: string; expectedRevision: number; operation: string; occurrenceDate?: string; cancelled?: boolean; before: Action; after: Action | null }[];
  additions: { id: string; state: string; title: string; start: string; end: string; hypothetical: true }[];
  preserved: { id: string; revision: number; title: string }[];
  steps: PlanningComparisonStep[];
  checks: ReturnType<typeof previewCalendarPlan>['alternatives'];
  metrics: { changedObjects: number; removedObjects: number; proposedActivities: number; scheduledMinutes: number;
    unscheduledTasks: number; longestWorkMinutes: number; largestFreeWindowMinutes: number; occupiedMinutes: number };
  feasibility: string;
  issues: string[];
  workRhythms: PlanningWorkRhythm[];
  accepted: false;
  applied: false;
}
export function removesCalendarOccupancy(change: PlanningComparisonBranch['changes'][number]) {
  return !change.after || !!change.cancelled
    || calendarCommitment(change.before).state === 'accepted' && calendarCommitment(change.after).state !== 'accepted';
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const unique = <T>(items: T[], key: (item: T) => string) => [...new Map(items.map(item => [key(item), item])).values()];
const reserved = (item: Action) => item.startsAt && item.durationMinutes
  ? { start: item.startsAt, end: new Date(Date.parse(item.startsAt) + item.durationMinutes * 60000).toISOString() } : null;

export function comparisonSteps(input: PlanningComparisonInput, alternative: PlanningAlternativeInput): PlanningComparisonStep[] {
  return [
    ...alternative.changes.map((change, index) => ({ id: 'change:' + change.targetId, order: index + 1,
      kind: 'change' as const, capability: 'local.agenda.change' as const, arguments: structuredClone(change),
      targetId: change.targetId, expectedRevision: change.expectedRevision, requiresAuthorization: true as const })),
    ...alternative.additions.map((value, index) => ({ id: 'addition:' + value.id, order: alternative.changes.length + index + 1,
      kind: 'addition' as const, capability: 'local.agenda.save' as const,
      arguments: normalizeCalendarInput({ title: value.title, detail: value.detail, kind: value.kind,
        startsAt: value.startsAt, durationMinutes: value.durationMinutes, timeZone: input.draft.timeZone,
        planning: { state: 'accepted' as const, flexibility: 'fixed' as const, ...(value.placeId ? { placeId: value.placeId } : {}) } }, input.draft.timeZone),
      beforeState: value.state, requiresAuthorization: true as const })),
  ];
}

/** Each alternative can vary proposed trade-offs, never silently shrink work,
 * remove a prerequisite, relax a deadline, or borrow an undeclared time window. */
export function alternativeDraft(input: PlanningComparisonInput, alternative: PlanningAlternativeInput): PlanningDraftRequest {
  if (new Set(alternative.taskPreferences.map(value => value.taskId)).size !== alternative.taskPreferences.length
    || alternative.taskPreferences.some(value => !input.draft.tasks.some(task => task.id === value.taskId)))
    throw new HarnessError('planning_comparison_task', '分支引用了不存在或重复的任务，未改写原工作量或条件。');
  return planningDraftInput.parse({ ...input.draft,
    tasks: input.draft.tasks.map(task => {
      const preference = alternative.taskPreferences.find(value => value.taskId === task.id);
      const rhythm = preference?.rhythm;
      if (rhythm?.kind === 'continuous' && task.maximumChunkMinutes !== undefined && task.maximumChunkMinutes < task.durationMinutes.max)
        throw new HarnessError('planning_comparison_rhythm', `「${task.title}」原单段上限不足以连着做完，先商量原限制，不能在比较时放宽。`);
      if (rhythm?.kind === 'split' && (!task.splittable
        || rhythm.maximumChunkMinutes >= task.durationMinutes.max
        || rhythm.maximumChunkMinutes > (task.maximumChunkMinutes ?? task.durationMinutes.max)
        || rhythm.maximumChunkMinutes < (task.minimumChunkMinutes ?? Math.min(30, task.durationMinutes.max))))
        throw new HarnessError('planning_comparison_rhythm', `「${task.title}」的分段需原本允许拆开，并保留原最小段长与单段上限；总工作量不变。`);
      return { ...task, ...(preference?.priority !== undefined ? { priority: preference.priority } : {}),
        ...(preference?.preferredWindows !== undefined ? { preferredWindows: preference.preferredWindows } : {}),
        ...(rhythm?.kind === 'continuous' ? { splittable: false } : {}),
        ...(rhythm?.kind === 'split' ? { maximumChunkMinutes: rhythm.maximumChunkMinutes } : {}) };
    }),
    protectedWindows: [...input.draft.protectedWindows, ...alternative.additionalProtectedWindows] });
}

/** Per-task placement facts only. The original planner retains the day ledger,
 * shared rest/transfers and all preparation; no cognitive cost is invented. */
export function describeWorkRhythms(input: PlanningComparisonInput, alternative: PlanningAlternativeInput,
  draft: Pick<ReturnType<typeof draftCalendarPlan>, 'blocks'>): PlanningWorkRhythm[] {
  return alternative.taskPreferences.flatMap(preference => {
    if (!preference.rhythm) return [];
    const task = input.draft.tasks.find(value => value.id === preference.taskId)!;
    const segments = draft.blocks.filter(block => block.taskId === task.id).map(block => ({
      start: block.start, end: block.end, workMinutes: block.durationMinutes,
      setupMinutes: (Date.parse(block.start) - Date.parse(block.reservedStart)) / 60000,
      cleanupMinutes: (Date.parse(block.reservedEnd) - Date.parse(block.end)) / 60000,
    }));
    const scheduledMinutes = segments.reduce((sum, segment) => sum + segment.workMinutes, 0);
    const requested = preference.rhythm;
    return [{ taskId: task.id, title: task.title, requested, requestedMinutes: task.durationMinutes.max,
      scheduledMinutes, segments, setupCleanupMinutes: segments.reduce((sum, segment) => sum + segment.setupMinutes + segment.cleanupMinutes, 0),
      complete: scheduledMinutes === task.durationMinutes.max,
      matchesRequest: requested.kind === 'continuous' ? segments.length === 1
        : segments.length >= 2 && segments.every(segment => segment.workMinutes <= requested.maximumChunkMinutes) }];
  });
}

export function planningBranchUsable(branch: PlanningComparisonBranch) {
  return !!branch.draft && branch.feasibility !== 'not_feasible'
    && branch.draft.completeness === 'all_tasks_placed' && !branch.draft.unscheduled.length
    && branch.workRhythms.every(rhythm => rhythm.complete && rhythm.matchesRequest);
}

/** Read-only projections of existing calendar changes and conditional activities.
 * The accepted flag inside a hypothetical copy is used solely for arithmetic. */
function projectAlternative(items: Action[], input: PlanningComparisonInput, alternative: PlanningAlternativeInput) {
  if (new Set(alternative.changes.map(change => change.targetId)).size !== alternative.changes.length
    || new Set(alternative.additions.map(value => value.id)).size !== alternative.additions.length)
    throw new HarnessError('planning_comparison_identity', '同一分支重复修改原对象或重复声明活动，无法区分完整方案。');
  if (alternative.changes.some(change => input.preserveActionIds.includes(change.targetId)))
    throw new HarnessError('planning_comparison_preserve', '这个分支改变了本次明确要保留的安排，请换一个取舍。');
  let projected = structuredClone(items);
  const changes: PlanningComparisonBranch['changes'] = [];
  for (const change of alternative.changes) {
    if (change.operation !== 'change_occurrence' && (change.occurrenceDate || change.cancelled !== undefined))
      throw new HarnessError('planning_comparison_occurrence', '具体发生日期和取消这一次只能用于change_occurrence，不能作为普通更新的无效旁路。');
    const before = items.find(item => item.id === change.targetId);
    if (!before || (before.revision || 1) !== change.expectedRevision)
      throw new HarnessError('revision_conflict', '分支引用的原安排已改变，需要先回读当前版本。');
    const originalWindow = expandAgenda([before], input.draft.from, input.draft.to, input.draft.timeZone);
    if (before.done || !originalWindow.items.length && !originalWindow.issues.length)
      throw new HarnessError('planning_comparison_window', '这个原安排不在本次生活窗口中，未把窗口外或已完成事项混入重排。');
    if (change.operation === 'change_occurrence' && !originalWindow.items.some(row => row.originalDate === change.occurrenceDate)
      && !originalWindow.issues.some(row => row.date === change.occurrenceDate))
      throw new HarnessError('planning_comparison_window', '要改的具体这一次不在本次范围内；系列里另一次出现不代表可以把窗口外那次混进来。');
    if (change.changes?.done !== undefined)
      throw new HarnessError('planning_comparison_completion', '重新安排不能把任务改成已完成或抹掉真实完成状态。');
    // A recurring series is larger than this bounded conversation. Its real
    // occurrence can be changed without pretending the rest was assessed.
    if (before.recurrence && change.operation !== 'change_occurrence')
      throw new HarnessError('planning_comparison_series', '本次只比较具体发生的一次；改变整个重复系列须另行核对其完整范围。');
    const after = change.operation === 'delete' ? null : projectCalendarChange(before, change, input.draft.timeZone);
    if (after && canonical(after) === canonical(before))
      throw new HarnessError('planning_comparison_no_change', '这个修改没有改变原安排，请保留它而不是生成重复动作。');
    const previousDuration = change.operation === 'change_occurrence'
      ? before.exceptions?.find(value => value.onDate === change.occurrenceDate)?.durationMinutes ?? before.durationMinutes : before.durationMinutes;
    if (after && change.changes?.durationMinutes !== undefined && change.changes.durationMinutes !== previousDuration)
      throw new HarnessError('planning_comparison_duration', '这个分支改变了原安排的完整时长；请先按原话另行商量工作量或准备休息，不能在重排时静默缩短。');
    if (after && change.cancelled !== true) {
      const occurrences = expandAgenda([after], input.draft.from, input.draft.to, input.draft.timeZone).items
        .filter(row => change.operation !== 'change_occurrence' || row.originalDate === change.occurrenceDate);
      const complete = occurrences.length > 0 && occurrences.every(row => {
        const day = row.dateBounds as { from?: string; to?: string } | undefined;
        const start = typeof row.startsAt === 'string' ? row.startsAt : day?.from;
        const end = typeof row.endsAt === 'string' ? row.endsAt : day?.to;
        return !!start && Date.parse(start) >= Date.parse(input.draft.from) && (!end || Date.parse(end) <= Date.parse(input.draft.to));
      });
      if (!complete) throw new HarnessError('planning_comparison_window', '移动后的完整这一次没有落在本次商量范围内，请先扩大窗口，不把窗口外占用藏起来换取可行。');
    }
    projected = projected.filter(item => item.id !== before.id);
    if (after) projected.push(after);
    changes.push({ targetId: before.id, expectedRevision: before.revision || 1, operation: change.operation,
      ...(change.occurrenceDate ? { occurrenceDate: change.occurrenceDate } : {}), ...(change.cancelled !== undefined ? { cancelled: change.cancelled } : {}), before, after });
  }
  const additions = alternative.additions.map(value => {
    const start = Date.parse(value.startsAt), end = start + value.durationMinutes * 60000;
    if (start < Date.parse(input.draft.from) || end > Date.parse(input.draft.to))
      throw new HarnessError('planning_comparison_window', '拟参加的活动不在本次商量范围内，请扩大真实范围后再比较。');
    const arguments_ = normalizeCalendarInput({ title: value.title, detail: value.detail, kind: value.kind,
      startsAt: value.startsAt, durationMinutes: value.durationMinutes, timeZone: input.draft.timeZone,
      planning: { state: 'accepted' as const, flexibility: 'fixed' as const, ...(value.placeId ? { placeId: value.placeId } : {}) } }, input.draft.timeZone);
    const projection: Action = { ...arguments_, id: 'comparison:' + alternative.id + ':' + value.id, done: false };
    if (items.some(item => item.id === projection.id))
      throw new HarnessError('planning_comparison_identity', '拟议活动与已有对象标识冲突，未覆盖原安排。');
    projected.push(projection);
    return { input: value, projection, arguments: arguments_ };
  });
  return { projected, changes, additions };
}

/** Complete alternatives share one actual agenda and the same original task
 * specification. Semantic value judgements stay with the main assistant. */
export function compareCalendarPlans(items: Action[], raw: unknown) {
  const input = planningComparisonInput.parse(raw);
  if (new Set(input.alternatives.map(value => value.id)).size !== input.alternatives.length)
    throw new HarnessError('planning_comparison_identity', '比较方案需要各自稳定且不同的标识。');
  if (input.preserveActionIds.some(id => !items.some(item => item.id === id)))
    throw new HarnessError('planning_comparison_preserve', '要保留的原安排已不在当前日历中，请先核对。');
  const branches: PlanningComparisonBranch[] = [], duplicates: { id: string; sameAs: string }[] = [];
  const results = new Map<string, string>();
  for (const alternative of input.alternatives) {
    const draftRequest = alternativeDraft(input, alternative);
    try {
      const projected = projectAlternative(items, input, alternative), checks: PlanningComparisonBranch['checks'] = [];
      const preview = { from: input.draft.from, to: input.draft.to, timeZone: input.draft.timeZone,
        busy: input.draft.busy.map(({ start, end, sourceId, sourceVersion }) => ({ start, end, sourceId, ...(sourceVersion ? { sourceVersion } : {}) })),
        sourceCoverage: input.draft.sourceCoverage.map(({ sourceId, status, reason }) => ({ sourceId, status, ...(reason ? { reason } : {}) })),
        conditions: input.draft.conditions.map(({ condition, status, sourceId }) => ({ condition, status, ...(sourceId ? { sourceId } : {}) })),
        transitionMinutes: input.draft.transitionMinutes };
      for (const [index, change] of alternative.changes.entries()) {
        const target = projected.changes[index];
        const others = projected.projected.filter(item => item.id !== change.targetId);
        checks.push(...previewCalendarPlan([...others, target.before], { ...preview,
          alternatives: [{ label: alternative.title, change }] }).alternatives);
      }
      for (const addition of projected.additions)
        checks.push(...previewCalendarPlan(projected.projected.filter(item => item.id !== addition.projection.id), {
          ...preview, alternatives: [{ label: addition.input.title, save: addition.arguments }] }).alternatives);
      const constructed = draftCalendarPlan(projected.projected, draftRequest);
      const draft = { ...constructed, acceptanceProposals: [] as typeof constructed.acceptanceProposals,
        acceptanceContract: '这里只比较完整占用，不提供可摘走工作核心的保存参数。前置原动作真实完成后，continue_planning沿原规划器生成带planRef的完整准备、工作和休息保存单位。' };
      const workRhythms = describeWorkRhythms(input, alternative, draft);
      const rhythmIssues = workRhythms.filter(rhythm => !rhythm.complete || !rhythm.matchesRequest).map(rhythm =>
        `「${rhythm.title}」这次${rhythm.requested.kind === 'continuous' ? '连续做' : '拆开做'}只构造出${rhythm.scheduledMinutes}/${rhythm.requestedMinutes}分钟${rhythm.matchesRequest ? '' : '，段落还未符合这次选择'}；先继续商量，不把不同工作量当作两种完整过法，也不证明全局无解。`);
      // Final feasibility alone does not make every intermediate edit safe.
      // Move an occupying original first; a cyclic swap needs another proposal,
      // rather than presenting sequential actions as an atomic calendar write.
      const moving = new Set(alternative.changes.map(change => change.targetId));
      const dependencies = new Map(alternative.changes.map(change => {
        const originalCheck = previewCalendarPlan(items, { ...preview, alternatives: [{ label: alternative.title, change }] }).alternatives[0];
        return [change.targetId, new Set(originalCheck.conflicts.flatMap(conflict => moving.has(conflict.objectId)
          && conflict.objectId !== change.targetId ? [conflict.objectId] : []))] as const;
      }));
      const ordered: string[] = [], waiting = new Set(alternative.changes.map(change => change.targetId));
      while (waiting.size) {
        const ready = [...waiting].find(id => [...dependencies.get(id)!].every(dependency => !waiting.has(dependency)));
        if (!ready) break;
        ordered.push(ready); waiting.delete(ready);
      }
      const sequencingIssues = waiting.size ? ['这些原安排互相占着下一处位置，逐项移动会出现中间冲突；需要先商量一个真实临时落点或换一版，不把它说成整组原子修改。'] : [];
      const steps = comparisonSteps(input, alternative).sort((left, right) => {
        const position = (step: PlanningComparisonStep) => step.kind === 'change' ? ordered.indexOf(step.targetId!) : ordered.length + step.order;
        return position(left) - position(right);
      }).map((step, index) => ({ ...step, order: index + 1 }));
      const signature = hash({ calendar: projected.projected.map(item => ({ ...item,
        ...(item.id.startsWith('comparison:') ? { id: undefined } : {}) })).sort((a, b) => canonical(a).localeCompare(canonical(b))),
        blocks: draft.blocks.map(({ preferred: _preferred, ...block }) => block),
        protectedWindows: draft.protectedWindows, freeWindows: draft.freeWindows, unscheduled: draft.unscheduled });
      const sameAs = results.get(signature);
      if (sameAs) { duplicates.push({ id: alternative.id, sameAs }); continue; }
      results.set(signature, alternative.id);
      const changed = new Set(projected.changes.map(value => value.targetId));
      const originalOccurrences = expandAgenda(items.filter(item => !item.done), input.draft.from, input.draft.to, input.draft.timeZone);
      const visibleOriginals = new Set([...originalOccurrences.items.map(item => String(item.id)), ...originalOccurrences.issues.map(item => String(item.id))]);
      const violations = unique(checks.flatMap(check => check.violations), value => value);
      const unknown = unique(checks.flatMap(check => check.unknown), value => value);
      const occupiedMinutes = draft.daySummaries.reduce((sum, day) => sum + day.occupiedMinutes, 0);
      branches.push({ id: alternative.id, title: alternative.title, intent: alternative.intent, draftRequest, draft,
        changes: projected.changes, additions: projected.additions.map(value => ({ id: value.input.id, state: value.input.state,
          title: value.input.title, start: value.projection.startsAt!, end: reserved(value.projection)!.end, hypothetical: true as const })),
        preserved: items.filter(item => visibleOriginals.has(item.id) && !changed.has(item.id) && !item.done && calendarCommitment(item).state === 'accepted')
          .map(item => ({ id: item.id, revision: item.revision || 1, title: item.title })), steps, checks,
        metrics: { changedObjects: projected.changes.length, removedObjects: projected.changes.filter(removesCalendarOccupancy).length,
          proposedActivities: projected.additions.length, scheduledMinutes: draft.scheduledMinutes, unscheduledTasks: draft.unscheduled.length,
          longestWorkMinutes: Math.max(0, ...draft.blocks.map(value => value.durationMinutes)),
          largestFreeWindowMinutes: Math.max(0, ...draft.freeWindows.map(value => value.minutes)), occupiedMinutes },
        workRhythms,
        feasibility: violations.length || sequencingIssues.length ? 'not_feasible' : rhythmIssues.length ? 'requested_rhythm_not_constructed' : unknown.length ? 'conditional' : draft.feasibility,
        issues: unique([...violations, ...sequencingIssues, ...rhythmIssues, ...unknown, ...draft.conditions], value => value), accepted: false, applied: false });
    } catch (error) {
      if (!(error instanceof HarnessError)) throw error;
      branches.push({ id: alternative.id, title: alternative.title, intent: alternative.intent, draftRequest, draft: null,
        changes: [], additions: [], preserved: [], steps: [], checks: [], workRhythms: [],
        metrics: { changedObjects: 0, removedObjects: 0, proposedActivities: 0, scheduledMinutes: 0,
          unscheduledTasks: 0, longestWorkMinutes: 0, largestFreeWindowMinutes: 0, occupiedMinutes: 0 },
        feasibility: 'not_constructed', issues: [error.message], accepted: false, applied: false });
    }
  }
  const baseline = expandAgenda(items.filter(item => !item.done), input.draft.from, input.draft.to, input.draft.timeZone);
  return { window: { from: input.draft.from, to: input.draft.to, timeZone: input.draft.timeZone },
    baseline: { calendarFingerprint: calendarPlanFingerprint(items), occurrences: baseline.items, issues: baseline.issues },
    preserveActionIds: input.preserveActionIds, branches, duplicates,
    coverage: { requestedBranches: input.alternatives.length, distinctBranches: branches.filter(branch => branch.draft).length,
      usableBranches: branches.filter(planningBranchUsable).length,
      meaningfulComparison: branches.filter(planningBranchUsable).length >= 2,
      meaning: '分支共用真实日历与原任务条件；同结果不换标题凑数。每一支是在比较如果这样安排，不是已接受的生活、最优解或新的行动许可。' },
    accepted: false as const, applied: false as const,
    continuation: '可以按分支或具体时段继续商量。明确采用后，先沿原动作逐项处理已有安排和拟参加活动，再按真实更新后的日历续排；部分成功仍回到同一商量，不冒称整组原子完成。' };
}
export type PlanningComparison = ReturnType<typeof compareCalendarPlans>;

export function planningComparisonView(comparison: PlanningComparison, context: {
  comparisonId: string; matterId?: string; matterRevision?: number; sourceIds?: string[]; sourceBinding?: WorkSourceBinding;
  options?: { branchId: string; id: string; revision: number }[];
}): PlanningComparisonView {
  return { comparisonId: context.comparisonId, ...(context.matterId ? { matterId: context.matterId, matterRevision: context.matterRevision } : {}),
    window: comparison.window, sourceIds: context.sourceIds || ['local-agenda'], ...(context.sourceBinding ? { sourceBinding: context.sourceBinding } : {}),
    branches: comparison.branches.map(branch => {
      const option = context.options?.find(value => value.branchId === branch.id);
      return { branchId: branch.id, title: branch.title, intent: branch.intent,
        ...(option ? { optionRef: { id: option.id, revision: option.revision } } : {}), planId: null, hypothetical: true,
        feasibility: branch.feasibility, issues: branch.issues, metrics: branch.metrics,
        ...(branch.workRhythms.length ? { workRhythms: branch.workRhythms } : {}),
        removed: branch.changes.filter(removesCalendarOccupancy).map(value => ({ id: value.targetId, title: value.before.title,
          ...(value.occurrenceDate ? { occurrenceDate: value.occurrenceDate } : {}) })),
        unscheduled: branch.draft?.unscheduled.map(value => ({ title: value.title, reason: value.reason })) || [] };
    }), selectionMeaning: 'continue_discussion_not_execution' };
}
