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
  /** Host continuation constraint; ordinary historical drafts keep their original semantics. */
  futureOnly?: boolean;
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

  /** The caller receives the original remaining units, never model-retyped parameters. */
  proposal(scope: ScopeData, currentItems: Action[], planId: string) {
    const ticket = this.ticket(planId);
    this.validateScope(ticket, scope); this.validateIntent(ticket, scope, planId);
    const units = ticket.units.slice(ticket.applied.length);
    if (!units.length) throw new HarnessError('planning_complete', '这份方案的步骤已经采用，当前日历保留着实际记录。');
    this.validateSave(scope, units[0].arguments.planRef, units[0].arguments, currentItems);
    return { planId, expiresAt: new Date(ticket.expiresAt).toISOString(), units: units.map(unit => {
      const block = unit.kind === 'work' ? ticket.output.blocks.find(value => value.taskId === unit.taskId && value.segment === unit.segment) : undefined;
      return { ...structuredClone(unit), ...(block ? { work: { start: block.start, end: block.end, minutes: block.durationMinutes,
        setupMinutes: (Date.parse(block.start) - Date.parse(block.reservedStart)) / minute,
        cleanupMinutes: (Date.parse(block.reservedEnd) - Date.parse(block.end)) / minute } } : {}) };
    }) };
  }

  bindIntent(scope: ScopeData, planId: string, context: PlanningHostContext) {
    const ticket = this.ticket(planId); this.validateScope(ticket, scope);
    if (!ticket.hostContext && (ticket.hasPreparations || ticket.applied.length || ticket.progressUncertain))
      throw new HarnessError('planning_intent_prepared', '这份方案已经准备或采用过动作，它们仍属于当时的依据。新意图可以从当前日历另起一份方案，原动作不会因此改换归属。');
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

  prepare(scope: ScopeData, items: Action[], raw: unknown, hostContext?: PlanningHostContext, campus?: PlanningCampusConstraints | null,
    options: { futureOnly?: boolean } = {}) {
    const now = this.now();
    this.prune(now);
    if (scope.worldId !== 'real' || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.child || !scope.sources.includes('local-agenda'))
      throw new HarnessError('planning_scope', '日程方案需要本人的真实世界本地日历读取范围。');
    if (hostContext && calendarPlanFingerprint(items) !== hostContext.allocationBasis.calendarFingerprint)
      throw new HarnessError('planning_stale', '当前日历与恢复采用依据不一致，未生成新票据。');
    const input = planningDraftInput.parse(raw);
    if (campus && !this.campusCurrent(scope, campus))
      throw new HarnessError('planning_campus_changed', '校园安排的保存快照或读取范围已经改变，本次没有沿用旧快照试算。当前允许读取的安排可以为接下来的试算提供依据。');
    const currentInput = campus ? planningDraftInput.parse({ ...input, busy: [...input.busy, ...campus.busy],
      sourceCoverage: [...input.sourceCoverage, campus.coverage] }) : input;
    const output = draftCalendarPlan(items, currentInput, hostContext?.retained), planId = randomUUID();
    const units = this.units(planId, input, output);
    const sources = this.sourceRevisions(input);
    const ticket: Ticket = { scope: structuredClone(scope), input, output, units, sources, createdAt: new Date(now).toISOString(),
      expiresAt: Math.min(now + ttl, Date.parse(scope.expiresAt)), fingerprint: output.calendarFingerprint,
      itemDigests: digestItems(items), applied: [], ...(hostContext ? { hostContext: structuredClone(hostContext) } : {}), ...(campus ? { campus } : {}),
      ...(options.futureOnly ? { futureOnly: true } : {}) };
    if (!Number.isFinite(ticket.expiresAt) || ticket.expiresAt <= now) throw new HarnessError('planning_expired', '当前读取范围已过期或有效期无法确认，本次没有建立可采用的票据；新的日程读取范围可以支持下一次试算。');
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
      acceptanceContract: '这份草案还没有写入日历。acceptanceProposals给出按order衔接的完整保存单位，planRef把每一步连回本次试算；其中工作占用含准备和清理，转场、休息和保护留白也有各自的占用。沿既有授权入口采用时，宿主会逐项核对原参数、当前日历、身份、策略、有效期与来源版本，再分别提交事务，因此可能有部分已保存、部分尚未保存的结果。条件改变后，旧票据可能已不再支持后续步骤，当前真实安排能作为重新试算的起点；应用重启也会使票据失效。你可以结合这次的结果和眼前的意愿继续商量或采用，具体怎样解释由你判断；草案本身没有带来新的执行授权。',
    };
  }

  /** Reject common copies that strip their planRef; invoke for every ordinary local save too. */
  assertNoDetachedProposal(scope: ScopeData, raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const args = raw as Record<string, unknown>;
    if (args.planRef !== undefined) { planningPlanRefSchema.parse(args.planRef); return; } // The normal plan guard validates a supplied reference.
    const key = this.proposalKey(args);
    if (key && [...this.recentProposals.values()].some(value => sameOwner(value.owner, scope) && value.keys.has(key)))
      throw new HarnessError('planning_reference_required', '这个安排与本次规划草案中的提议一致，但缺少连回原试算的planRef。原保存单位的完整参数与引用一起承担占用检查；旧草案失效后，当前日历可以支持新的试算，本次没有把脱离引用的副本保存。');
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
      throw new HarnessError('planning_stale', '日历在本方案上一步之后已经变化，本次没有沿旧票据继续提交。此前成功保存的步骤仍在各自的真实记录中；接下来的安排可以从当前日历重新试算。');
    }
    const next = ticket.units[ticket.applied.length];
    if (!next || next.blockId !== ref.blockId) throw new HarnessError('planning_order', '这一步已经采用，或不是方案当前衔接的下一步。原顺序包含准备、转场、休息与保护占用，它们共同构成这份安排，本次没有按另一顺序提交。');
    if (canonical(args) !== canonical(next.arguments)) throw new HarnessError('planning_parameters_changed', '本次保存参数与试算过的完整占用不同，原票据尚不能支持这组参数。当前想法与日历可以作为新方案的依据。');
    if ((ticket.hostContext || ticket.futureOnly) && Date.parse(next.arguments.startsAt) < this.now()) {
      if (ticket.futureOnly) ticket.invalidatedReason = 'continuation_started';
      throw new HarnessError(ticket.hostContext ? 'planning_intent_past' : 'planning_continuation_past', '这段占用已经开始或过去，本次没有把它作为未来安排提交。时间经过本身还说明不了做了多少；当前进展与仍可安排的未来范围能帮助继续规划。');
    }
    return { planId: ref.planId, blockId: ref.blockId, status: 'validated', atomic: false,
      completedSteps: ticket.applied.length, totalSteps: ticket.units.length, nextOrder: ticket.applied.length + 1 };
  }

  /** Call only after the outer SQLite transaction successfully commits. Failure must not erase its success receipt. */
  committed(rawRef: unknown, currentItems: Action[]) {
    const ref = planningPlanRefSchema.parse(rawRef), ticket = this.ticket(ref.planId);
    const unit = ticket.units[ticket.applied.length];
    if (!unit || unit.blockId !== ref.blockId) throw new HarnessError('planning_order', '本次回报的步骤与方案账本当前等待的步骤不一致，这份账本尚不能说明它的采用结果，当前日历保留着实际保存情况。');
    const current = digestItems(currentItems);
    const matches = currentItems.filter(item => !ticket.itemDigests.has(item.id) && Object.entries(unit.arguments)
      .every(([key, value]) => canonical((item as unknown as Record<string, unknown>)[key]) === canonical(value)));
    // A concurrent change after a successful commit invalidates the remaining plan,
    // but must not hide the exact step that is already present in the real calendar.
    if (matches.length === 1) ticket.applied.push({ blockId: ref.blockId, recordId: matches[0].id });
    else ticket.progressUncertain = true;
    if (current.size !== ticket.itemDigests.size + 1 || [...ticket.itemDigests].some(([id, value]) => current.get(id) !== value)) {
      ticket.invalidatedReason = 'commit_mismatch';
      throw new HarnessError('planning_commit_mismatch', '日历提交后的变化超出了本步骤，票据已停止支持后续采用。能够精确对应的本步成功记录仍保留，其他变化也以当前真实日历为准，这些结果可以作为重新试算的起点。');
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
      reason: '这份本进程票据目前不存在，应用重启也会使它消失，所以保存了几步、总共有几步仍是未知。当前真实日历可以提供已保存记录，票据缺失本身没有说明保存量为零。' };
    const expired = ticket.expiresAt <= this.now();
    const status = expired ? 'expired' : ticket.invalidatedReason ? 'invalidated' : ticket.applied.length === ticket.units.length ? 'applied' : ticket.applied.length ? 'partially_applied' : 'not_applied';
    const result = { planId: ref.planId, status, progressKnown: !ticket.progressUncertain, completedStepsIsLowerBound: !!ticket.progressUncertain, atomic: false,
      completedSteps: ticket.applied.length, totalSteps: ticket.units.length, applied: structuredClone(ticket.applied),
      nextBlockId: expired || ticket.invalidatedReason ? null : ticket.units[ticket.applied.length]?.blockId || null,
      reason: expired ? '方案票据已过期，已保存记录仍各有其真实状态；后续安排的依据是当前日历和新试算，不再是这张票据。' : ticket.invalidatedReason || null };
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
      try { this.validateScope(ticket, scope); this.validateIntent(ticket, scope, planId); } catch { ledgerReadable = false; boundaryReason = '原票据所需的意图、来源或读取范围已变化，或本次无法确认其继续适用。这份结果只包含当前允许回读的日历记录，旧来源与原草案没有随之恢复。'; }
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
    const nextUnit = known?.units[known.applied.length];
    const nextStarted = !!(known?.hostContext || known?.futureOnly) && !!nextUnit && Date.parse(nextUnit.arguments.startsAt) < now;
    const resumable = !!known && !expired && !known.invalidatedReason && !known.progressUncertain && !changed.length && !duplicates.length && !unrecorded.length && !calendarChanged && !blockers.length && !nextStarted;
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
      remainingRequest, blockers: [...blockers, ...(calendarChanged ? ['日历已有其他变化，原票据与当前安排不再一致，后续采用需要新的试算依据。'] : []), ...(expired ? ['原票据已过期。'] : []),
        ...(nextStarted ? ['下一段占用已经开始或过去，它已不是可直接接上的未来安排；实际进展与未来范围仍有待了解。'] : []), ...(boundaryReason ? [boundaryReason] : [])],
      applied: false, atomic: false,
      recoveryContract: '这份结果来自当前日历回读，本次没有写入。observed列出实际读到的记录；没有可读的完整票据时，总步骤、已保存步骤与遗漏仍可能未知，空列表也不能替缺失的账本证明从未保存。nextProposal若存在，是当前票据仍支持衔接的一步，实际保存仍经过原有授权与逐步复核；票据过期、变化或重启后，旧参数本身已不具备继续采用的效力。remainingRequest若存在，只是从原请求扣除精确已保存净工作一次后的重算起点，延续原工作量、已保存安排、依赖时间和预算；其中的时间、来源与现实条件还属于原请求，并非这次重新取得的事实。它为null时，现有信息还不足以可靠地算出这份余量。你可以结合当前进展与意愿继续帮助，需要新方案时，当前时间、日历和可读来源能为planning.draft提供新的依据。已安排的时间仍是安排，事情是否做完另有其事实。',
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
      throw new HarnessError('planning_manifest_budget', '本方案的完整采用清单超过当前持久预算，本次尚未保留这份清单，也没有留下截断的副本作为完整证明。');
    return result;
  }
  private proposalKey(args: Record<string, unknown>) {
    if (typeof args.title !== 'string' || typeof args.startsAt !== 'string' || !Number.isFinite(Date.parse(args.startsAt))) return undefined;
    return createHash('sha256').update(canonical({ title: args.title.trim(), startsAt: Date.parse(args.startsAt), kind: args.kind || 'time_block' })).digest('hex');
  }
  private prune(now: number) { for (const [key, value] of this.tickets) if (value.expiresAt <= now) this.tickets.delete(key); }
  private ticket(id: string) {
    const ticket = this.tickets.get(id);
    if (!ticket) throw new HarnessError('planning_ticket_missing', '这份方案票据目前不存在，应用重启也会使它失效。旧参数已没有这张票据的支持；当前日历仍可为新方案提供真实起点。');
    if (ticket.expiresAt <= this.now()) { this.tickets.delete(id); throw new HarnessError('planning_expired', '方案票据已过期，后续安排需要新试算的依据；这次失效不会撤销此前成功保存的步骤。'); }
    if (ticket.invalidatedReason) throw new HarnessError('planning_stale', '这份票据已停止支持后续采用，当前真实日历与现有意愿可以支持重新规划；此前保存结果仍以其实际记录为准。');
    return ticket;
  }
  private validateScope(ticket: Ticket, scope: ScopeData) {
    if (!sameOwner(ticket.scope, scope) || scope.child || scope.retention === 'session_only')
      throw new HarnessError('planning_scope', '方案所属身份、世界或保留策略不允许当前保存。');
    if (scope.privacyEpoch !== ticket.scope.privacyEpoch || scope.policyRevision !== ticket.scope.policyRevision || ticket.scope.sources.some(source => !scope.sources.includes(source)))
      throw new HarnessError('planning_policy_changed', '当前读取范围或隐私策略已与原票据不同，这份票据尚不能支持本次采用；当前许可范围能为新的方案提供依据。');
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
        if (!this.campusPort?.current(scope, ticket.campus)) blockers.push('校园安排的保存快照、账号或读取范围已改变，原快照已不能支持后续采用；当前可读的校园安排与已保存的本人日历能为新试算提供依据。');
      } catch { blockers.push('学校安排这次还没能核清，继续按原方案办理前需要看看当前记录。'); }
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
            blockers.push('校园来源的当前保存版本还无法确认与原依据一致，后续试算仍缺少当前可读的校园记录。');
        } catch { blockers.push('学校资料的当前保存版本还没能核清，需要先接上现在这份记录。'); }
        continue;
      }
      let current: string | number | null | undefined;
      if (checked.has(source.sourceId)) current = checked.get(source.sourceId);
      else {
        try { current = this.currentSourceVersion?.(source.sourceId, scope); } catch { current = undefined; }
        checked.set(source.sourceId, current);
      }
      if (current === undefined || current === null) blockers.push(`来源 ${source.sourceId} 的当前版本尚不能复验，不能采用依赖该来源的方案。`);
      else if (String(current) !== source.sourceVersion) blockers.push(`来源 ${source.sourceId} 的版本已经改变，原版本已不能支持后续采用，当前可读内容能为新的规划提供依据。`);
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
        if (!Number.isInteger(durationMinutes) || durationMinutes < 1) throw new HarnessError('planning_precision', '方案中有不足整分钟的占用，现有日历的整分钟精度还无法完整保存它。原占用没有被截短，时间边界对齐后的新试算可以提供可保存的单位。');
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
