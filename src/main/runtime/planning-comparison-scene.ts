import { z } from 'zod';
import { HarnessError, workSourceBindingSchema, type ScopeHandle, type WorkRecord, type WorkSourceBinding, type WorkSourceRef } from '../../shared/harness';
import type { PlanningScene } from '../../shared/scenes';
import { planningTrialConditionSchema, type PlanningComparisonView, type PlanningTrialObservation } from '../../shared/planning-conversation';
import type { VerifiedDiscussionFocus } from '../../shared/discussion-scene';
import type { RuntimeCoordinator, RunSession } from './coordinator';
import { planningSnapshot } from './scene-projections';
import { expandAgenda } from '../actions/calendar';
import { calendarCommitment } from '../actions/planning';
import { planningBranchUsable, removesCalendarOccupancy } from '../actions/planning-comparison';
import { canonical, codePointSlice, dateInZone, resolveLocalTime } from './semantics';

const id = z.string().min(1).max(160);
export const planningComparisonPresentationInput = z.object({ matterId: id, optionIds: z.array(id).min(2).max(4), comparisonId: id.optional() }).strict();
const basisSchema = z.object({ comparisonId: id, matterId: id, optionId: id, optionRevision: z.number().int().positive(),
  sourceBinding: workSourceBindingSchema, title: z.string().min(1).max(400).optional(), intent: z.string().max(1200).optional(),
  selected: z.boolean().optional() }).strict();
type Host = Pick<RuntimeCoordinator, 'repo' | 'policy' | 'planningConversation' | 'planning'>;

/** The caller owns one final presentation budget/receipt admission. This factory
 * returns unstaged scenes and source proofs; it does not publish or remember. */
export async function createPlanningComparisonPresentation(host: Host, session: RunSession,
  raw: z.infer<typeof planningComparisonPresentationInput>, signal: AbortSignal) {
  const input = planningComparisonPresentationInput.parse(raw), handle = session.ingress.contract.scope;
  signal.throwIfAborted();
  const scope = host.policy.require(handle, 'evidence:read');
  if (scope.child || session.background || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
    || scope.audience !== 'self' || !scope.sources.includes('local-agenda') || !scope.sources.includes('work:self'))
    throw new HarnessError('planning_comparison_presentation', '在当前本人的交流里比较这些办法，后台准备不会自行展开画面。');
  if (new Set(input.optionIds).size !== input.optionIds.length)
    throw new HarnessError('planning_comparison_identity', '同一份办法不能换两个位置当作两种选择。');
  const permits = (ref: WorkSourceRef) => {
    try {
      host.repo.resolveWorkSourceBinding(handle, [ref]);
      const view = session.attentionEvidenceViews?.[ref.eventId];
      if (!view) return true;
      const event = host.repo.evidence(handle, ref.eventId);
      return !!event && event.contentVersion === ref.contentVersion && view.contentVersion === ref.contentVersion
        && view.sourceStart <= ref.start && view.sourceEnd >= ref.end
        && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
    } catch (error) { if (error instanceof HarnessError) return false; throw error; }
  };
  const options = { ...(session.ingress.contract.memoryMode === 'relevant' ? {} : { sessionId: session.sessionId }), permits };
  const addresses = input.optionIds.map(optionId => host.planningConversation.describe(handle, { matterId: input.matterId, optionId }, options));
  const first = addresses[0], now = host.repo.clock.now();
  if (addresses.some(address => canonical(address.window) !== canonical(first.window)))
    throw new HarnessError('planning_comparison_window', '这几份办法讨论的日期范围不同，先在同一范围重新推演。');
  const campus = await host.planning.readCampus(scope, first.window.from, first.window.to, signal);
  signal.throwIfAborted(); host.policy.validate(handle);
  const items = host.repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload)));
  const records = new Map<string, WorkRecord>(), bindings = new Map<string, WorkSourceBinding>(), scenes: PlanningScene[] = [];
  const branches: PlanningComparisonView['branches'] = [];
  let comparisonId = input.comparisonId;
  const signatures = new Set<string>();
  for (const optionId of input.optionIds) {
    const read = host.planningConversation.read(handle, items, { matterId: input.matterId, optionId }, options, campus);
    const record = read.records.find(value => value.id === optionId)!, branch = read.branch;
    const actualComparisonId = typeof record.data.comparisonId === 'string' ? record.data.comparisonId : undefined;
    if (!actualComparisonId || comparisonId && comparisonId !== actualComparisonId)
      throw new HarnessError('planning_comparison_identity', '这些办法不是同一次共同推演；先把当前取舍放到同一真实基线再比较。');
    comparisonId = actualComparisonId;
    if (!branch?.draft || !planningBranchUsable(branch))
      throw new HarnessError('planning_comparison_changed', '这几版中的原安排已经改变或尚不能完整接上；先沿同一商量重看，不重放旧的可行画面。');
    const signature = canonical({ blocks: branch.draft.blocks.map(({ preferred: _preferred, ...block }) => block), fixed: branch.draft.fixedCommitments,
      protected: branch.draft.protectedWindows, free: branch.draft.freeWindows, unscheduled: branch.draft.unscheduled });
    if (signatures.has(signature)) throw new HarnessError('planning_comparison_identity', '当前两版已经变成同一种安排，先找出另一种真实取舍。');
    signatures.add(signature);
    const basis = basisSchema.parse({ comparisonId, matterId: input.matterId, optionId,
      optionRevision: record.revision, sourceBinding: record.sourceBinding, title: branch.title, intent: branch.intent, selected: read.selected });
    const conditions = [...branch.draft.conditions, ...branch.issues,
      '这是一种如果这样安排的推演；尚未答应的活动没有变成现实承诺，点选只用来接着商量。',
      ...(read.externalFactsRequireRecheck ? ['部分外部条件来自之前的商量；还要按当前来源重新核对，不把日历留白当作现实一定有空。'] : [])];
    // Reuse the full draft projector so setup, cleanup, transfers, rest and day
    // summaries survive. No process ticket or planRef is manufactured for it.
    const scene = planningSnapshot({ status: 'fresh', sourceId: 'local-agenda', fetchedAt: now,
      data: { ...branch.draft, conditions, acceptanceProposals: [], accepted: false, applied: false },
      coverage: { complete: false, hypothetical: true, planningComparison: basis } }, 'planning.draft', branch.draftRequest, now);
    if (!scene) throw new HarnessError('planning_comparison_scene', '完整时间范围还没有对齐，先保留这次商量，不删掉准备或未知来拼画面。');
    scene.mode = 'preview';
    delete scene.planId; delete scene.continuation; delete scene.adoption;
    for (const block of scene.blocks) {
      delete block.planRefs;
      if (block.kind === 'free') block.label = '留给自己';
      if (campus && block.kind === 'busy' && !block.sourceObjectId) {
        const full = block.originalRange || block;
        // The old planner keeps the source bucket for external busy rows. Rejoin
        // only this exact host projection to its current campus occurrence;
        // repeated/ambiguous rows retain no cross-branch identity.
        const rows = branch.draft.fixedCommitments.filter(row => row.id === campus.sourceId && row.title === block.label
          && Date.parse(row.start) === Date.parse(full.start) && (row.unknownEnd ? full.end === null : !!full.end && Date.parse(row.end) === Date.parse(full.end)));
        const occurrences = campus.items.filter(item => item.title === block.label && Date.parse(item.start) === Date.parse(full.start)
          && (item.end === null ? full.end === null : !!full.end && Date.parse(item.end) === Date.parse(full.end)));
        if (rows.length === 1 && occurrences.length === 1) block.sourceObjectId = occurrences[0].id;
      }
    }
    for (const change of branch.changes) {
      if (!change.after || change.cancelled) continue;
      const step = branch.steps.find(value => value.targetId === change.targetId);
      const selectedDate = step?.arguments.occurrenceDate;
      const before = expandAgenda([change.before], branch.draft.window.from, branch.draft.window.to, branch.draft.window.timeZone).items;
      const after = expandAgenda([change.after], branch.draft.window.from, branch.draft.window.to, branch.draft.window.timeZone).items;
      const range = (occurrence: Record<string, unknown> | undefined) => {
        const day = occurrence?.dateBounds as { from?: string; to?: string } | undefined;
        const start = typeof occurrence?.startsAt === 'string' ? occurrence.startsAt : day?.from;
        const end = typeof occurrence?.endsAt === 'string' ? occurrence.endsAt : day?.to || null;
        return typeof start === 'string' ? { start, end } : undefined;
      };
      for (const occurrence of after.filter(value => !selectedDate || value.originalDate === selectedDate)) {
        const original = before.find(value => value.occurrenceId === occurrence.occurrenceId);
        const previous = range(original), projected = range(occurrence);
        if (!previous || !projected) continue;
        const changed = Date.parse(previous.start) !== Date.parse(projected.start);
        for (const block of scene.blocks.filter(value => value.sourceObjectId === occurrence.occurrenceId))
          block.comparisonChange = calendarCommitment(change.before).state !== 'accepted' && calendarCommitment(change.after).state === 'accepted'
            ? { kind: 'added' } : { kind: changed ? 'moved' : 'changed', before: previous };
      }
    }
    for (const addition of branch.additions) for (const block of scene.blocks)
      if (block.sourceObjectId === `comparison:${branch.id}:${addition.id}`) block.comparisonChange = { kind: 'added' };
    // The owner records actual parameter sources. A merely not_checked source
    // or an unknown condition is not an extra read permission for this picture.
    scene.requiredSourceIds = [...new Set(['work:self', ...record.sourceBinding!.sourceIds,
      ...(Array.isArray(record.data.sourceIds) ? record.data.sourceIds.filter((value): value is string => typeof value === 'string') : [])])];
    scenes.push(scene);
    branches.push({ branchId: branch.id, title: branch.title, intent: branch.intent, optionRef: { id: optionId, revision: record.revision },
      sceneRef: { id: scene.id, revision: scene.revision }, planId: null, hypothetical: true, feasibility: branch.feasibility,
      issues: branch.issues, metrics: branch.metrics,
      ...(branch.workRhythms.length ? { workRhythms: branch.workRhythms } : {}),
      removed: branch.changes.filter(removesCalendarOccupancy).map(value => ({ id: value.targetId, title: value.before.title,
        ...(value.occurrenceDate ? { occurrenceDate: value.occurrenceDate } : {}) })),
      unscheduled: branch.draft.unscheduled.map(value => ({ title: value.title, reason: value.reason })) });
    for (const source of read.bindings) bindings.set(canonical(source), source);
    for (const value of read.records) records.set(value.id, value);
  }
  const frame = records.get(input.matterId)!;
  const comparison: PlanningComparisonView = { comparisonId: comparisonId!, matterId: frame.id, matterRevision: frame.revision,
    window: first.window, sourceIds: [...new Set(scenes.flatMap(scene => [scene.source.sourceId, ...scene.requiredSourceIds]))],
    ...(first.bindings[0] ? { sourceBinding: first.bindings[0] } : {}), branches, selectionMeaning: 'continue_discussion_not_execution' };
  signal.throwIfAborted(); host.policy.validate(handle);
  return { scenes, comparison, records: [...records.values()], bindings: [...bindings.values()] };
}

/** Historical what-if pictures keep their meaning when an ordinary host link
 * advances. Current selection/adoption still rereads the exact option version. */
export function assertPlanningComparisonSceneReadable(host: Pick<RuntimeCoordinator, 'repo' | 'policy'>,
  handle: ScopeHandle, scene: PlanningScene) {
  const coverage = scene.source.coverage as { planningComparison?: unknown } | undefined;
  if (!coverage?.planningComparison) return;
  host.policy.validate(handle);
  const basis = basisSchema.parse(coverage.planningComparison);
  if (!host.repo.workBindingsReadable(handle, [basis.sourceBinding]))
    throw new HarnessError('planning_comparison_source', '这幅旧推演的原话现在不能继续带回，未从画面副本恢复。');
  const option = host.repo.work(handle, 'option', basis.optionId)[0];
  if (!option || option.data.type !== 'planning_alternative' || option.data.matterId !== basis.matterId)
    throw new HarnessError('planning_comparison_source', '原办法已不在当前可读范围，未把旧画面当作新的方案。');
}

export function resolvePlanningComparisonSelection(host: Pick<RuntimeCoordinator, 'repo' | 'policy'>,
  handle: ScopeHandle, scene: PlanningScene, optionId: string): VerifiedDiscussionFocus & {
    planningReference: { comparisonId: string; viewedRevision: number; currentRevision: number; historicalReference: boolean };
  } {
  assertPlanningComparisonSceneReadable(host, handle, scene);
  const coverage = scene.source.coverage as { planningComparison?: unknown } | undefined;
  const basis = basisSchema.parse(coverage?.planningComparison);
  if (basis.optionId !== optionId) throw new HarnessError('selection_target', '这幅推演里不是这一份办法，请重新选择。');
  const option = host.repo.work(handle, 'option', optionId)[0], frame = host.repo.work(handle, 'episode', basis.matterId)[0];
  if (!option || !frame || frame.data.type !== 'collaboration_frame' || option.data.type !== 'planning_alternative'
    || option.data.matterId !== frame.id || !Array.isArray(frame.data.optionIds) || !frame.data.optionIds.includes(option.id))
    throw new HarnessError('planning_comparison_source', '原来的商量现在不可读，未借旧画面恢复来源或采用权。');
  const historical = option.revision !== basis.optionRevision;
  const label = basis.title || (historical ? '那时一起看过的这一版' : option.title);
  return { target: { kind: 'discussion_option', optionId }, matter: { id: frame.id, revision: frame.revision }, label,
    ...(basis.title && basis.selected !== undefined ? { branch: { id: optionId, revision: basis.optionRevision,
      title: basis.title, kind: 'option' as const, status: historical ? 'historical_reference' : option.status,
      rationale: basis.intent ?? null, selected: basis.selected, sourceRefs: structuredClone(basis.sourceBinding.refs) } } : {}),
    sourceBinding: structuredClone(basis.sourceBinding), planningReference: { comparisonId: basis.comparisonId,
      viewedRevision: basis.optionRevision, currentRevision: option.revision, historicalReference: historical },
    meaning: '用户指向这幅当时推演里的一个办法，准备接着商量。可以谈原来的取舍，不代表现在仍然可行、已经选择或授权执行；采用前按currentRevision回读原owner和真实安排，不复活旧票据。' };
}

/** The selected original scene supplies the date, zone, object and full work
 * length. A gesture only proposes a new time; it is neither authored prose nor
 * a feasibility result, calendar change or revived adoption ticket. */
export function resolvePlanningTrial(host: Pick<RuntimeCoordinator, 'repo' | 'policy'>,
  handle: ScopeHandle, scene: PlanningScene, blockId: string, raw: unknown) {
  const trial = planningTrialConditionSchema.parse(raw);
  const coverage = scene.source.coverage as { planningComparison?: unknown } | undefined;
  const basis = basisSchema.safeParse(coverage?.planningComparison);
  const block = scene.blocks.find(value => value.id === blockId);
  const movable = block && (block.kind === 'work' && !!block.taskId
    || block.kind === 'busy' && !!block.sourceObjectId && ['moved', 'added'].includes(block.comparisonChange?.kind || ''));
  if (scene.mode !== 'preview' || !basis.success || !block || !movable || !block.end || block.originalRange)
    throw new HarnessError('selection_target', '这处暂时不能整段试挪；请在当前比较里选择完整、结束时间明确的提议，原安排仍保留。');
  const discussion = resolvePlanningComparisonSelection(host, handle, scene, basis.data.optionId);
  const day = dateInZone(block.start, scene.window.timeZone);
  const resolution = 'localTime' in trial ? resolveLocalTime(`${day}T${trial.localTime}`, scene.window.timeZone) : undefined;
  if (resolution && resolution.status !== 'resolved')
    throw new HarnessError('selection_target', '这次试放时刻在原时区里不存在或有两种对应，先确认具体时刻，未猜测或改变安排。');
  const proposed = Date.parse('proposedStart' in trial ? trial.proposedStart : resolution!.instants[0]);
  const duration = Date.parse(block.end) - Date.parse(block.start), end = proposed + duration;
  if (!(duration > 0) || !Number.isFinite(proposed) || !Number.isFinite(end)
    || proposed < Date.parse(scene.window.from) || end > Date.parse(scene.window.to)
    || dateInZone(new Date(proposed).toISOString(), scene.window.timeZone) !== day
    || dateInZone(new Date(end - 1).toISOString(), scene.window.timeZone) !== day)
    throw new HarnessError('selection_target', '这次试放没有把原来完整时长留在同一天的商量范围内；先改时间或继续说明条件，未缩短工作量。');
  const observation: PlanningTrialObservation = { origin: 'ui_trial_condition', status: 'hypothetical_not_evaluated',
    originalStart: block.start, originalEnd: block.end,
    proposedStart: new Date(proposed).toISOString(), proposedEnd: new Date(end).toISOString(),
    durationMinutes: duration / 60000, timeZone: scene.window.timeZone, executionAuthorized: false };
  const clock = new Date(proposed).toLocaleTimeString('zh-CN', { timeZone: scene.window.timeZone,
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return { observation, discussion, label: `${block.label} → ${clock}，仍${observation.durationMinutes}分钟（试放）` };
}
