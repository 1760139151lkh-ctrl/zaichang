import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Action } from '../../shared/types';
import { HarnessError, type ScopeData } from '../../shared/harness';
import { canonical } from '../runtime/semantics';
import { calendarPlanFingerprint, draftCalendarPlan, planningDraftInput } from './planning-draft';
import { planningDayBounds } from './planning-days';
import type { PlanningHostContext, PlanningManifest } from './planning-intent-contract';
import { campusConstraintSummary, type PlanningCampusConstraints, type PlanningCampusPort } from './planning-campus';

export const planningPlanRefSchema = z.object({ planId: z.string().uuid(), blockId: z.string().min(1).max(160) }).strict();
export const planningRecoveryInput = z.object({ planId: z.string().uuid() }).strict();
export type PlanningPlanRef = z.infer<typeof planningPlanRefSchema>;
type Input = z.infer<typeof planningDraftInput>;
type Draft = ReturnType<typeof draftCalendarPlan>;
type SaveArguments = { title: string; detail: string; kind: 'time_block'; startsAt: string; durationMinutes: number; timeZone: string; planning: { state: 'accepted'; flexibility: 'fixed' | 'movable'; placeId?: string }; planRef: PlanningPlanRef };
type Unit = { blockId: string; kind: 'work' | 'transition' | 'protected'; taskId?: string; segment?: number; boundaryIndex?: number; arguments: SaveArguments };
type SourceRevision = { sourceId: string; sourceVersion: string | null };
type Owner = Pick<ScopeData, 'principalId' | 'workspaceId' | 'deviceId' | 'subjectId' | 'worldId' | 'audience'>;
type Ticket = {
  scope: ScopeData; input: Input; output: Draft; units: Unit[]; sources: SourceRevision[];
  createdAt: string;
  expiresAt: number; fingerprint: string; itemDigests: Map<string, string>; applied: { blockId: string; recordId: string }[];
  invalidatedReason?: string;
  progressUncertain?: boolean;
  hasPreparations?: boolean;
  hostContext?: PlanningHostContext;
  campus?: PlanningCampusConstraints;
};
const minute = 60000;
const ttl = 15 * minute;
const sameOwner = (a: Owner, b: Owner) => (['principalId', 'workspaceId', 'deviceId', 'subjectId', 'worldId', 'audience'] as const).every(key => a[key] === b[key]);
const digestItems = (items: Action[]) => new Map(items.map(item => [item.id, canonical(item)]));

/** Short-lived validation ledger. No raw draft, scope or source is persisted. Restart invalidates every ticket. */
export class PlanningApplicationService {
  private readonly tickets = new Map<string, Ticket>();
  // Only owner and irreversible parameter digests survive ticket expiry, bounded to 50 plans in this process.
  // This catches detached copies, not arbitrary semantic rewrites, and intentionally does not survive restart.
  private readonly recentProposals = new Map<string, { owner: Owner; keys: Set<string> }>();
  private intentValidator?: (scope: ScopeData, context: PlanningHostContext, planId: string) => void;
  private campusPort?: PlanningCampusPort;
  constructor(private readonly clock: () => string, private readonly currentSourceVersion?: (sourceId: string, scope: ScopeData) => string | number | null | undefined) {}

  setIntentValidator(validate: (scope: ScopeData, context: PlanningHostContext, planId: string) => void) { this.intentValidator = validate; }
  setCampusPort(port: PlanningCampusPort) { this.campusPort = port; }
  async readCampus(scope: ScopeData, from: string, to: string, signal: AbortSignal) {
    if (scope.worldId !== 'real' || scope.subjectId !== scope.principalId || scope.audience !== 'self' || scope.child) return null;
    return this.campusPort?.read(scope, from, to, signal) || null;
  }
  campusCurrent(scope: ScopeData, snapshot: PlanningCampusConstraints) {
    try { return this.campusPort?.current(scope, snapshot) === true; } catch { return false; }
  }

  /** Internal routing metadata only; never supplies an intent or restores a ticket. */
  hasIntentBinding(planId: string) { return !!this.tickets.get(planId)?.hostContext; }

  exportTicket(scope: ScopeData, planId: string) {
    const ticket = this.ticket(planId);
    this.validateScope(ticket, scope); this.validateIntent(ticket, scope, planId);
    return { planId, input: structuredClone(ticket.input), output: structuredClone(ticket.output),
      manifest: this.manifest(planId, ticket), expiresAt: new Date(ticket.expiresAt).toISOString(),
      hasPreparations: !!ticket.hasPreparations || !!ticket.applied.length || !!ticket.progressUncertain,
      ...(ticket.hostContext ? { intentRef: structuredClone(ticket.hostContext.intent) } : {}) };
  }

  bindIntent(scope: ScopeData, planId: string, context: PlanningHostContext) {
    const ticket = this.ticket(planId); this.validateScope(ticket, scope);
    if (!ticket.hostContext && (ticket.hasPreparations || ticket.applied.length || ticket.progressUncertain))
      throw new HarnessError('planning_intent_prepared', '这份方案已经准备或采用过动作，不能事后归入新意图；请先依据当前日历生成新方案。');
    if (ticket.hostContext && canonical(ticket.hostContext.intent) !== canonical(context.intent))
      throw new HarnessError('planning_intent_binding', '这份方案已经关联不同的意图修订，不能改绑旧票据。');
    const previous = ticket.hostContext; ticket.hostContext = structuredClone(context);
    try { this.validateIntent(ticket, scope, planId); } catch (error) { ticket.hostContext = previous; throw error; }
    this.invalidatePreviousIntentTickets(planId, context);
    return { planId, intent: structuredClone(context.intent) };
  }

  preparationBinding(scope: ScopeData, rawRef: unknown, args: unknown) {
    const ref = planningPlanRefSchema.parse(rawRef), ticket = this.ticket(ref.planId);
    this.validateScope(ticket, scope); this.validateIntent(ticket, scope, ref.planId);
    const unit = ticket.units.find(value => value.blockId === ref.blockId);
    if (!unit || canonical(args) !== canonical(unit.arguments)) throw new HarnessError('planning_parameters_changed', '动作参数不是原host方案的完整保存单位。');
    return ticket.hostContext ? { intentRef: structuredClone(ticket.hostContext.intent), specDigest: ticket.hostContext.intent.specDigest,
      manifest: this.manifest(ref.planId, ticket) } : null;
  }

  /** Called by the real preparation hook; this never records successful adoption. */
  markPrepared(scope: ScopeData, planId: string) {
    const ticket = this.ticket(planId); this.validateScope(ticket, scope);
    ticket.hasPreparations = true;
  }

  prepare(scope: ScopeData, items: Action[], raw: unknown, hostContext?: PlanningHostContext, campus?: PlanningCampusConstraints | null) {
    const now = this.now();
    this.prune(now);
    if (scope.worldId !== 'real' || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.child || !scope.sources.includes('local-agenda'))
      throw new HarnessError('planning_scope', '日程方案需要本人的真实世界本地日历读取范围。');
    if (hostContext && calendarPlanFingerprint(items) !== hostContext.allocationBasis.calendarFingerprint)
      throw new HarnessError('planning_stale', '当前日历与恢复采用依据不一致，未生成新票据。');
    const input = planningDraftInput.parse(raw);
    if (campus && !this.campusCurrent(scope, campus))
      throw new HarnessError('planning_campus_changed', '校园安排的保存快照或读取范围已改变，请重新读取后试算。');
    const currentInput = campus ? planningDraftInput.parse({ ...input, busy: [...input.busy, ...campus.busy],
      sourceCoverage: [...input.sourceCoverage, campus.coverage] }) : input;
    const output = draftCalendarPlan(items, currentInput, hostContext?.retained), planId = randomUUID();
    const units = this.units(planId, input, output);
    const sources = this.sourceRevisions(input);
    const ticket: Ticket = { scope: structuredClone(scope), input, output, units, sources, createdAt: new Date(now).toISOString(),
      expiresAt: Math.min(now + ttl, Date.parse(scope.expiresAt)), fingerprint: output.calendarFingerprint,
      itemDigests: digestItems(items), applied: [], ...(hostContext ? { hostContext: structuredClone(hostContext) } : {}), ...(campus ? { campus } : {}) };
    if (!Number.isFinite(ticket.expiresAt) || ticket.expiresAt <= now) throw new HarnessError('planning_expired', '当前读取范围已经过期，请重新读取日程。');
    while (this.tickets.size >= 50) this.tickets.delete(this.tickets.keys().next().value!);
    this.tickets.set(planId, ticket);
    if (hostContext) this.invalidatePreviousIntentTickets(planId, hostContext);
    const owner: Owner = { principalId: scope.principalId, workspaceId: scope.workspaceId, deviceId: scope.deviceId, subjectId: scope.subjectId, worldId: scope.worldId, audience: scope.audience };
    const keys = new Set(units.map(unit => this.proposalKey(unit.arguments)!));
    for (const block of output.blocks) keys.add(this.proposalKey({ title: block.title, startsAt: block.start, kind: 'time_block' })!);
    while (this.recentProposals.size >= 50) this.recentProposals.delete(this.recentProposals.keys().next().value!);
    this.recentProposals.set(planId, { owner, keys });
    const adoptionBlockers = this.adoptionBlockers(ticket, scope);
    return {
      ...output, planId, expiresAt: new Date(ticket.expiresAt).toISOString(),
      ...(campus ? { campusCalendar: campusConstraintSummary(campus) } : {}),
      adoption: { status: adoptionBlockers.length ? 'blocked' : units.length ? 'ready_for_authorized_steps' : 'nothing_to_apply', blockers: adoptionBlockers,
        atomic: false, completedSteps: 0, totalSteps: units.length, restartBehavior: 'ticket_invalidated_recompute_required' },
      acceptanceProposals: units.map((unit, index) => ({ ...unit, capability: 'local.agenda.save', order: index + 1, applied: false, requiresAuthorization: true, requiresPlanRevalidation: true })),
      acceptanceContract: '仅使用带planRef的精确参数，按order逐项经既有授权与事务保存。准备和清理并入工作占用，转场、休息和保护空白有独立真实占用。整组不是原子提交；每次保存前核查日历、身份、策略、时效与来源版本，任一项变化须重算，并保留明确的部分完成状态。重启后票据失效。',
    };
  }

  /** Reject common copies that strip their planRef; invoke for every ordinary local save too. */
  assertNoDetachedProposal(scope: ScopeData, raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const args = raw as Record<string, unknown>;
    if (args.planRef !== undefined) { planningPlanRefSchema.parse(args.planRef); return; } // The normal plan guard validates a supplied reference.
    const key = this.proposalKey(args);
    if (key && [...this.recentProposals.values()].some(value => sameOwner(value.owner, scope) && value.keys.has(key)))
      throw new HarnessError('planning_reference_required', '这个安排来自本次规划草案，须完整保留planRef与占用参数；旧草案失效时请重新规划。');
  }

  /** Invoke both at preparation and immediately inside the eventual calendar transaction. */
  validateSave(scope: ScopeData, rawRef: unknown, args: unknown, currentItems: Action[]) {
    const ref = planningPlanRefSchema.parse(rawRef), ticket = this.ticket(ref.planId);
    this.validateScope(ticket, scope);
    this.validateIntent(ticket, scope, ref.planId);
    const blockers = this.adoptionBlockers(ticket, scope);
    if (blockers.length) throw new HarnessError('planning_conditions_unverified', blockers.join('；'));
    if (calendarPlanFingerprint(currentItems) !== ticket.fingerprint) {
      ticket.invalidatedReason = 'calendar_changed';
      throw new HarnessError('planning_stale', '日历在本方案上一步之后已变化，请重新规划；已经保存的步骤保留，尚未保存的步骤没有执行。');
    }
    const next = ticket.units[ticket.applied.length];
    if (!next || next.blockId !== ref.blockId) throw new HarnessError('planning_order', '这一步已采用或不符合方案顺序；不能跳过准备、转场、休息或保护占用。');
    if (canonical(args) !== canonical(next.arguments)) throw new HarnessError('planning_parameters_changed', '保存参数与核查过的完整占用不同，请重新生成方案。');
    if (ticket.hostContext && Date.parse(next.arguments.startsAt) < this.now())
      throw new HarnessError('planning_intent_past', '该占用已经开始或过去，请重新核对当前进展并规划未来范围。');
    return { planId: ref.planId, blockId: ref.blockId, status: 'validated', atomic: false,
      completedSteps: ticket.applied.length, totalSteps: ticket.units.length, nextOrder: ticket.applied.length + 1 };
  }

  /** Call only after the outer SQLite transaction successfully commits. Failure must not erase its success receipt. */
  committed(rawRef: unknown, currentItems: Action[]) {
    const ref = planningPlanRefSchema.parse(rawRef), ticket = this.ticket(ref.planId);
    const unit = ticket.units[ticket.applied.length];
    if (!unit || unit.blockId !== ref.blockId) throw new HarnessError('planning_order', '方案采用账本的步骤顺序不一致，请重新核查当前日历。');
    const current = digestItems(currentItems);
    const matches = currentItems.filter(item => !ticket.itemDigests.has(item.id) && Object.entries(unit.arguments)
      .every(([key, value]) => canonical((item as unknown as Record<string, unknown>)[key]) === canonical(value)));
    // A concurrent change after a successful commit invalidates the remaining plan,
    // but must not hide the exact step that is already present in the real calendar.
    if (matches.length === 1) ticket.applied.push({ blockId: ref.blockId, recordId: matches[0].id });
    else ticket.progressUncertain = true;
    if (current.size !== ticket.itemDigests.size + 1 || [...ticket.itemDigests].some(([id, value]) => current.get(id) !== value)) {
      ticket.invalidatedReason = 'commit_mismatch';
      throw new HarnessError('planning_commit_mismatch', '日历提交结果超出本步骤，方案后续采用已停止，请按当前真实日历重算。');
    }
    if (matches.length !== 1) {
      ticket.invalidatedReason = 'commit_mismatch';
      throw new HarnessError('planning_commit_mismatch', '实际保存的占用与方案不一致，方案后续采用已停止。');
    }
    ticket.itemDigests = current;
    ticket.fingerprint = calendarPlanFingerprint(currentItems);
    return { planId: ref.planId, status: ticket.applied.length === ticket.units.length ? 'applied' : 'partially_applied', atomic: false,
      completedSteps: ticket.applied.length, totalSteps: ticket.units.length, applied: structuredClone(ticket.applied),
      nextBlockId: ticket.units[ticket.applied.length]?.blockId || null };
  }

  /** A progress receipt, not permission to write. Unknown/expired ledgers never imply zero completed writes. */
  progress(rawRef: unknown) {
    const ref = planningPlanRefSchema.parse(rawRef), ticket = this.tickets.get(ref.planId);
    if (!ticket) return { planId: ref.planId, status: 'unavailable', progressKnown: false, atomic: false,
      completedSteps: null, totalSteps: null, applied: [], nextBlockId: null,
      reason: '票据不存在或应用已重启；不能据此推断没有保存，须读取真实日历。' };
    const expired = ticket.expiresAt <= this.now();
    const status = expired ? 'expired' : ticket.invalidatedReason ? 'invalidated' : ticket.applied.length === ticket.units.length ? 'applied' : ticket.applied.length ? 'partially_applied' : 'not_applied';
    const result = { planId: ref.planId, status, progressKnown: !ticket.progressUncertain, completedStepsIsLowerBound: !!ticket.progressUncertain, atomic: false,
      completedSteps: ticket.applied.length, totalSteps: ticket.units.length, applied: structuredClone(ticket.applied),
      nextBlockId: expired || ticket.invalidatedReason ? null : ticket.units[ticket.applied.length]?.blockId || null,
      reason: expired ? '方案票据已过期，后续须根据真实日历重算。' : ticket.invalidatedReason || null };
    if (expired) this.tickets.delete(ref.planId);
    return result;
  }

  /** Read the durable calendar after interruption. A stored planRef proves a row exists, never that an entire plan succeeded. */
  recover(scope: ScopeData, currentItems: Action[], raw: unknown) {
    const { planId } = planningRecoveryInput.parse(raw), now = this.now();
    if (scope.worldId !== 'real' || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.child || !scope.sources.includes('local-agenda') || !Number.isFinite(Date.parse(scope.expiresAt)) || Date.parse(scope.expiresAt) <= now)
      throw new HarnessError('planning_scope', '恢复安排需要本人当前有效的真实世界本地日历读取范围。');
    const ticket = this.tickets.get(planId);
    if (ticket && !sameOwner(ticket.scope, scope)) throw new HarnessError('planning_scope', '方案属于另一身份或世界，不能读取或恢复。');
    const observed = currentItems.flatMap(item => {
      const ref = planningPlanRefSchema.safeParse((item as Action & { planRef?: unknown }).planRef);
      return ref.success && ref.data.planId === planId ? [{ recordId: item.id, blockId: ref.data.blockId, title: item.title,
        startsAt: item.startsAt ?? null, durationMinutes: item.durationMinutes ?? null, revision: item.revision ?? 1,
        done: item.done === true, planningState: item.planning?.state ?? 'unknown' }] : [];
    }).sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)) || a.recordId.localeCompare(b.recordId));
    let ledgerReadable = !!ticket, boundaryReason: string | null = null;
    if (ticket) {
      try { this.validateScope(ticket, scope); this.validateIntent(ticket, scope, planId); } catch { ledgerReadable = false; boundaryReason = '方案原有意图或读取范围已改变；仅回读当前允许的真实日历，不恢复旧来源或原草案。'; }
    }
    const known = ledgerReadable ? ticket : undefined;
    const changed = known?.applied.flatMap<{ blockId: string; recordId: string; status: 'missing' | 'changed' }>(applied => {
      const item = currentItems.find(value => value.id === applied.recordId), unit = known.units.find(value => value.blockId === applied.blockId)!;
      if (!item) return [{ ...applied, status: 'missing' as const }];
      if (item.done || item.planning?.state !== 'accepted' || !this.unitMatches(item, unit)) return [{ ...applied, status: 'changed' as const }];
      return [];
    }) ?? [];
    const duplicates = [...new Set(observed.map(value => value.blockId))].filter(blockId => observed.filter(value => value.blockId === blockId).length > 1);
    const unrecorded = known ? observed.filter(value => !known.applied.some(applied => applied.recordId === value.recordId && applied.blockId === value.blockId)).map(value => value.recordId) : [];
    const blockers = known ? this.adoptionBlockers(known, scope) : [];
    const calendarChanged = !!known && calendarPlanFingerprint(currentItems) !== known.fingerprint;
    const expired = !!known && known.expiresAt <= now;
    const resumable = !!known && !expired && !known.invalidatedReason && !known.progressUncertain && !changed.length && !duplicates.length && !unrecorded.length && !calendarChanged && !blockers.length;
    const next = resumable ? known.units[known.applied.length] : undefined;
    // A continuation is computed from exact committed work, not from the number of saved rows: rest and setup are not work.
    const remainingRequest = known && !changed.length && !duplicates.length && !unrecorded.length && !known.progressUncertain ? this.remainingRequest(known) : null;
    return { planId, observed, observedCount: observed.length, calendarFingerprint: calendarPlanFingerprint(currentItems),
      evidence: known ? 'current_calendar_and_process_ledger' : 'current_calendar_only',
      totalSteps: known?.units.length ?? null, completedSteps: known?.applied.length ?? null,
      changedSteps: changed, duplicateBlockIds: duplicates, unrecordedRowIds: unrecorded,
      status: !known ? 'observed_only_recompute_required' : changed.length || duplicates.length || unrecorded.length || known.progressUncertain ? 'review_required' :
        known.applied.length === known.units.length && !calendarChanged ? 'all_steps_present' : next ? 'can_continue_authorized_steps' : 'recompute_required',
      nextProposal: next ? { ...structuredClone(next), capability: 'local.agenda.save', order: known!.applied.length + 1, requiresAuthorization: true, requiresPlanRevalidation: true } : null,
      remainingRequest, blockers: [...blockers, ...(calendarChanged ? ['日历已有其他变化，不能继续采用旧票据。'] : []), ...(expired ? ['原票据已过期。'] : []), ...(boundaryReason ? [boundaryReason] : [])],
      applied: false, atomic: false,
      recoveryContract: '这里是当前真实日历回读，不执行写入。没有完整票据时总步骤与遗漏保持未知；不得重放旧参数。remainingRequest仅是扣除精确已保存工作后的重算起点，保留已保存安排与依赖时间；须更新当前时间和来源，再调用planning.draft。已保存不等于任务完成。',
    };
  }

  private unitMatches(item: Action, unit: Unit) {
    return Object.entries(unit.arguments).every(([key, value]) => canonical((item as unknown as Record<string, unknown>)[key]) === canonical(value));
  }

  private remainingRequest(ticket: Ticket): Input | null {
    const lastApplied = ticket.units[ticket.applied.length - 1];
    // If interruption happened before its rest/transfer, arithmetic on remaining work alone cannot preserve that boundary.
    // Recovery still exposes the exact next unit while its live ticket is valid; after invalidation a fresh plan must repair it.
    if (lastApplied?.kind === 'work' && (ticket.input.restMinutes > 0 || ticket.input.transitionMinutes.max > 0 || ticket.input.travelTimes.length > 0)) return null;
    const acceptedWork = ticket.units.filter(unit => unit.kind === 'work' && ticket.applied.some(applied => applied.blockId === unit.blockId));
    const scheduled = new Map<string, { minutes: number; end: number }>();
    const scheduledBlocks: Draft['blocks'] = [];
    for (const unit of acceptedWork) {
      const block = ticket.output.blocks.find(value => value.taskId === unit.taskId && value.segment === unit.segment)!;
      const previous = scheduled.get(block.taskId) || { minutes: 0, end: 0 };
      // One work segment can have several calendar units when setup/cleanup makes its reservation exceed 24 hours.
      if (acceptedWork.some(other => other !== unit && other.taskId === unit.taskId && other.segment === unit.segment && other.blockId.localeCompare(unit.blockId) < 0)) continue;
      const segmentUnits = ticket.units.filter(other => other.kind === 'work' && other.taskId === unit.taskId && other.segment === unit.segment);
      if (!segmentUnits.every(other => acceptedWork.includes(other))) return null;
      scheduledBlocks.push(block);
      scheduled.set(block.taskId, { minutes: previous.minutes + block.durationMinutes, end: Math.max(previous.end, Date.parse(block.reservedEnd)) });
    }
    const fullyScheduled = new Set(ticket.input.tasks.filter(task => (scheduled.get(task.id)?.minutes || 0) === task.durationMinutes.max).map(task => task.id));
    const tasks = ticket.input.tasks.filter(task => !fullyScheduled.has(task.id)).map(task => {
      const accepted = scheduled.get(task.id), minutes = accepted?.minutes || 0;
      const priorEnds = task.dependsOn.filter(value => fullyScheduled.has(value)).map(value => scheduled.get(value)!.end);
      const prefixEnd = lastApplied ? Date.parse(lastApplied.arguments.startsAt) + lastApplied.arguments.durationMinutes * minute : 0;
      const earliest = Math.max(task.earliestStart ? Date.parse(task.earliestStart) : Date.parse(ticket.input.from), accepted?.end || 0, prefixEnd, ...priorEnds);
      return { ...structuredClone(task), durationMinutes: { min: Math.max(1, task.durationMinutes.min - minutes), max: task.durationMinutes.max - minutes },
        earliestStart: new Date(earliest).toISOString(), dependsOn: task.dependsOn.filter(value => !fullyScheduled.has(value)) };
    });
    if (!tasks.length) return null;
    return { ...structuredClone(ticket.input), tasks,
      dailyBudgets: ticket.input.dailyBudgets.map(budget => {
        if (budget.maxScheduledMinutes === undefined) return structuredClone(budget);
        const bounds = planningDayBounds(budget.date, ticket.input.timeZone);
        const scheduledMinutes = scheduledBlocks.reduce((sum, block) => sum + Math.max(0,
          Math.min(Date.parse(block.end), Date.parse(bounds.to)) - Math.max(Date.parse(block.start), Date.parse(bounds.from))) / minute, 0);
        // Existing adopted work is now calendar busy. It must also consume the
        // original plan's net-work allowance when only the remainder is redrafted.
        return { ...budget, maxScheduledMinutes: Math.max(0, budget.maxScheduledMinutes - scheduledMinutes) };
      }),
      maxScheduledMinutes: Math.max(0, ticket.input.maxScheduledMinutes - [...scheduled.values()].reduce((sum, value) => sum + value.minutes, 0)) };
  }

  private now() {
    const now = Date.parse(this.clock());
    if (!Number.isFinite(now)) throw new HarnessError('planning_clock', '无法核查方案时效，尚未保存。');
    return now;
  }
  private validateIntent(ticket: Ticket, scope: ScopeData, planId: string) {
    if (!ticket.hostContext) return;
    if (!this.intentValidator) throw new HarnessError('planning_intent_validator_missing', '当前未连接持久意图核验，不能采用或导出关联票据。');
    this.intentValidator(scope, ticket.hostContext, planId);
    if (ticket.hostContext.retained.work.some(value => Date.parse(value.reservedStart) < this.now())
      || ticket.hostContext.retained.boundaries.some(value => Date.parse(value.start) < this.now()))
      throw new HarnessError('planning_retained_started', '原已保存占用已经开始或过去，需要先核清实际进展，不能沿旧剩余量采用。');
  }
  private invalidatePreviousIntentTickets(planId: string, context: PlanningHostContext) {
    for (const [id, ticket] of this.tickets) if (id !== planId && ticket.hostContext?.intent.id === context.intent.id)
      ticket.invalidatedReason = 'intent_replanned';
  }

  private manifest(planId: string, ticket: Ticket): PlanningManifest {
    const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
    const groups = ticket.output.blocks.map(block => ({ id: digest({ planId, taskId: block.taskId, segment: block.segment }),
      taskId: block.taskId, segment: block.segment, start: block.start, end: block.end, reservedStart: block.reservedStart, reservedEnd: block.reservedEnd,
      durationMinutes: block.durationMinutes, unitIds: ticket.units.filter(unit => unit.kind === 'work' && unit.taskId === block.taskId && unit.segment === block.segment).map(unit => unit.blockId),
      ...(block.placeId ? { placeId: block.placeId } : {}) }));
    const group = (taskId?: string, segment?: number) => groups.find(value => value.taskId === taskId && value.segment === segment)?.id;
    const boundaries = ticket.output.transitions.map((boundary, index) => ({ id: digest({ planId, boundary: index }),
      start: boundary.start, end: boundary.end, restMinutes: boundary.restMinutes, travelMinutes: boundary.travel.minutes,
      ...(boundary.fromWorkId || group(boundary.fromTaskId, boundary.fromSegment) ? { fromWorkId: boundary.fromWorkId || group(boundary.fromTaskId, boundary.fromSegment) } : {}),
      ...(boundary.toWorkId || group(boundary.toTaskId, boundary.toSegment) ? { toWorkId: boundary.toWorkId || group(boundary.toTaskId, boundary.toSegment) } : {}),
      ...(boundary.fromTaskId ? { fromTaskId: boundary.fromTaskId } : {}), ...(boundary.toTaskId ? { toTaskId: boundary.toTaskId } : {}),
      ...(boundary.fromPlaceId ? { fromPlaceId: boundary.fromPlaceId } : {}), ...(boundary.toPlaceId ? { toPlaceId: boundary.toPlaceId } : {}),
      unitIds: ticket.units.filter(unit => unit.kind === 'transition' && unit.boundaryIndex === index).map(unit => unit.blockId) }));
    const result: PlanningManifest = { version: 1, planId, createdAt: ticket.createdAt,
      timeZone: ticket.input.timeZone, inputDigest: digest(ticket.input), calendarFingerprint: ticket.output.calendarFingerprint,
      allocationBasis: ticket.hostContext?.allocationBasis || { calendarFingerprint: ticket.output.calendarFingerprint, groupIds: [] },
      units: ticket.units.map((unit, index) => ({ blockId: unit.blockId, kind: unit.kind, order: index + 1, start: unit.arguments.startsAt,
        end: new Date(Date.parse(unit.arguments.startsAt) + unit.arguments.durationMinutes * minute).toISOString(),
        argumentKeys: Object.keys(unit.arguments).sort(), argumentsDigest: digest(unit.arguments),
        ...(unit.kind === 'work' ? { groupId: group(unit.taskId, unit.segment) } : {}),
        ...(unit.boundaryIndex !== undefined ? { boundaryId: boundaries[unit.boundaryIndex].id } : {}) })),
      groups, boundaries, sourceVersions: structuredClone(ticket.sources) };
    if (result.units.length > 2048 || Buffer.byteLength(canonical(result), 'utf8') > 256 * 1024)
      throw new HarnessError('planning_manifest_budget', '本方案的完整采用清单超过当前持久预算，未截断或伪称已经保留。');
    return result;
  }
  private proposalKey(args: Record<string, unknown>) {
    if (typeof args.title !== 'string' || typeof args.startsAt !== 'string' || !Number.isFinite(Date.parse(args.startsAt))) return undefined;
    return createHash('sha256').update(canonical({ title: args.title.trim(), startsAt: Date.parse(args.startsAt), kind: args.kind || 'time_block' })).digest('hex');
  }
  private prune(now: number) { for (const [key, value] of this.tickets) if (value.expiresAt <= now) this.tickets.delete(key); }
  private ticket(id: string) {
    const ticket = this.tickets.get(id);
    if (!ticket) throw new HarnessError('planning_ticket_missing', '方案票据不存在或应用已重启，请根据当前日历重新生成方案。');
    if (ticket.expiresAt <= this.now()) { this.tickets.delete(id); throw new HarnessError('planning_expired', '方案核查已过期，请重新生成；已经保存的步骤不受影响。'); }
    if (ticket.invalidatedReason) throw new HarnessError('planning_stale', '方案采用已停止，须依据当前真实日历重新规划。');
    return ticket;
  }
  private validateScope(ticket: Ticket, scope: ScopeData) {
    if (!sameOwner(ticket.scope, scope) || scope.child || scope.retention === 'session_only')
      throw new HarnessError('planning_scope', '方案所属身份、世界或保留策略不允许当前保存。');
    if (scope.privacyEpoch !== ticket.scope.privacyEpoch || scope.policyRevision !== ticket.scope.policyRevision || ticket.scope.sources.some(source => !scope.sources.includes(source)))
      throw new HarnessError('planning_policy_changed', '读取范围或隐私策略已改变，请重新生成方案。');
    if (Date.parse(scope.expiresAt) <= this.now() || !Number.isFinite(Date.parse(scope.expiresAt))) throw new HarnessError('planning_expired', '当前范围已经过期，尚未保存。');
  }
  private sourceRevisions(input: Input): SourceRevision[] {
    return [...input.busy, ...input.travelTimes, ...input.energyWindows, ...input.sourceCoverage.filter(value => !['local-agenda', 'user-declared', 'current'].includes(value.sourceId)), ...input.tasks.filter(value => value.sourceId), ...input.conditions.filter(value => value.sourceId), ...input.tasks.flatMap(value => value.conditions.filter(condition => condition.sourceId))]
      .map(value => ({ sourceId: value.sourceId!, sourceVersion: value.sourceVersion || null }));
  }
  private adoptionBlockers(ticket: Ticket, scope: ScopeData): string[] {
    const blockers = [...ticket.output.conditions];
    if (ticket.campus) {
      try {
        if (!this.campusPort?.current(scope, ticket.campus)) blockers.push('校园安排的保存快照、账号或读取范围已改变，须重新读取并试算；已经保存的本人安排不会重复创建。');
      } catch { blockers.push('当前不能复核校园安排快照，尚未采用旧方案。'); }
    }
    if (!ticket.output.blocks.length && !ticket.hostContext?.retained.work.length)
      blockers.push('本次没有构造出可采用的工作安排。');
    if (scope.retention === 'session_only') blockers.push('本次仅会话保留范围不能写入长期日历。');
    const checked = new Map<string, string | number | null | undefined>();
    for (const source of ticket.sources) {
      if (!scope.sources.includes(source.sourceId)) { blockers.push(`来源 ${source.sourceId} 不在当前读取范围。`); continue; }
      if (source.sourceVersion === null) { blockers.push(`来源 ${source.sourceId} 没有可复验版本。`); continue; }
      if (source.sourceId === 'campus:zju-account') {
        try {
          if (this.campusPort?.currentVersion(scope, source.sourceVersion) !== true)
            blockers.push('校园来源的当前保存版本尚不能复验，须重新读取后试算。');
        } catch { blockers.push('当前不能复核校园来源的保存版本，未采用旧方案。'); }
        continue;
      }
      let current: string | number | null | undefined;
      if (checked.has(source.sourceId)) current = checked.get(source.sourceId);
      else {
        try { current = this.currentSourceVersion?.(source.sourceId, scope); } catch { current = undefined; }
        checked.set(source.sourceId, current);
      }
      if (current === undefined || current === null) blockers.push(`来源 ${source.sourceId} 的当前版本尚不能复验，不能采用依赖该来源的方案。`);
      else if (String(current) !== source.sourceVersion) blockers.push(`来源 ${source.sourceId} 的版本已经改变，请重新读取并规划。`);
    }
    return [...new Set(blockers)];
  }

  private units(planId: string, input: Input, draft: Draft): Unit[] {
    const units: Unit[] = [];
    const add = (blockId: string, kind: Unit['kind'], title: string, detail: string, start: string, end: string, placeId?: string, taskId?: string, segment?: number, boundaryIndex?: number) => {
      const from = Date.parse(start), to = Date.parse(end);
      // The existing save contract accepts at most 24 hours; preserve longer reservations as consecutive units.
      for (let cursor = from, part = 0; cursor < to; part++) {
        const next = Math.min(to, cursor + 1440 * minute), durationMinutes = (next - cursor) / minute;
        if (!Number.isInteger(durationMinutes) || durationMinutes < 1) throw new HarnessError('planning_precision', '方案包含不足整分钟的占用，现有日历无法完整保存，请对齐到整分钟后重算。');
        const id = `${blockId}:${part}`;
        units.push({ blockId: id, kind, ...(taskId ? { taskId, segment } : {}), ...(boundaryIndex !== undefined ? { boundaryIndex } : {}), arguments: {
          title: title.slice(0, 160), detail: detail.slice(0, 1500), kind: 'time_block', startsAt: new Date(cursor).toISOString(), durationMinutes, timeZone: input.timeZone,
          planning: { state: 'accepted', flexibility: kind === 'work' ? 'movable' : 'fixed', ...(placeId ? { placeId } : {}) }, planRef: { planId, blockId: id },
        } });
        cursor = next;
      }
    };
    for (const block of draft.blocks) {
      const task = input.tasks.find(value => value.id === block.taskId)!;
      const reservation = task.setupMinutes || task.cleanupMinutes ? `工作时间 ${block.start} 至 ${block.end}；本占用另含准备 ${task.setupMinutes} 分钟、收尾 ${task.cleanupMinutes} 分钟。` : '';
      add(`work:${input.tasks.indexOf(task)}:${block.segment}`, 'work', block.title, [task.detail, reservation].filter(Boolean).join('\n'), block.reservedStart, block.reservedEnd, block.placeId, block.taskId, block.segment);
    }
    for (const [index, transfer] of draft.transitions.entries()) add(`transition:${index}`, 'transition', transfer.travel.minutes && transfer.restMinutes ? '转场与休息' : transfer.travel.minutes ? '转场' : '休息',
      `保留转场 ${transfer.travel.minutes} 分钟、休息 ${transfer.restMinutes} 分钟。`, transfer.start, transfer.end, undefined, undefined, undefined, index);
    // Merge protection overlaps and omit portions already occupied by accepted commitments.
    const bounds = { start: Date.parse(input.from), end: Date.parse(input.to) };
    const protection = draft.protectedWindows.map(value => ({ start: Math.max(bounds.start, Date.parse(value.start)), end: Math.min(bounds.end, Date.parse(value.end)), reasons: [value.reason] })).filter(value => value.end > value.start).sort((a, b) => a.start - b.start);
    const merged: typeof protection = [];
    for (const value of protection) {
      const previous = merged.at(-1);
      if (previous && value.start <= previous.end) { previous.end = Math.max(previous.end, value.end); previous.reasons.push(...value.reasons); }
      else merged.push({ ...value });
    }
    for (const [index, window] of merged.entries()) {
      let available = [{ start: window.start, end: window.end }];
      for (const fixed of draft.fixedCommitments) {
        const a = Date.parse(fixed.start), b = Date.parse(fixed.end);
        available = available.flatMap(value => b <= value.start || a >= value.end ? [value] : [
          ...(a > value.start ? [{ start: value.start, end: a }] : []), ...(b < value.end ? [{ start: b, end: value.end }] : []),
        ]);
      }
      for (const [part, value] of available.entries()) add(`protected:${index}:${part}`, 'protected', '留白', [...new Set(window.reasons)].join('；'), new Date(value.start).toISOString(), new Date(value.end).toISOString());
    }
    return units.sort((a, b) => Date.parse(a.arguments.startsAt) - Date.parse(b.arguments.startsAt) || a.blockId.localeCompare(b.blockId));
  }
}
