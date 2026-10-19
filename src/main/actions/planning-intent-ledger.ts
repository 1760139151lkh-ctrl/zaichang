import { createHash } from 'node:crypto';
import type { EffectAction } from '../../shared/harness';
import { addDate, canonical, dateInZone } from '../runtime/semantics';
import { calendarPlanFingerprint, planningDraftInput } from './planning-draft';
import { planningDayBounds } from './planning-days';
import { expandAgenda } from './calendar';
import { planningIntentSpecSchema, type PlanningAdoptionInput, type PlanningAdoptionProjection, type PlanningAttemptRecord,
  type PlanningDraftRequest, type PlanningIntentSpec, type PlanningManifestUnit, type PlanningRefreshRequirement,
  type PlanningReplanMaterialization, type PlanningRetainedContext, type PlanningUnitObservation } from './planning-intent-contract';

const minute = 60000;
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const iso = (value: number) => new Date(value).toISOString();
const emptyRetained = (): PlanningRetainedContext => ({ work: [], boundaries: [], scheduledTasks: [] });
const unique = <T>(values: T[]) => [...new Map(values.map(value => [canonical(value), value])).values()];
const validRange = (start: string, end: string) => Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) && Date.parse(end) > Date.parse(start);
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

/** Persist the interpretation and its envelope, never a stale copy of current facts. */
export function normalizePlanningIntentSpec(raw: PlanningDraftRequest): PlanningIntentSpec {
  const input = planningDraftInput.parse(raw);
  const { busy, energyWindows, travelTimes, sourceCoverage, conditions, tasks, completedTaskIds, ...request } = input;
  const requiredRefresh: PlanningRefreshRequirement[] = [];
  const source = (kind: PlanningRefreshRequirement['kind'], value: { sourceId?: string; sourceVersion?: string }, taskId?: string) => {
    requiredRefresh.push({ kind, ...(value.sourceId ? { sourceId: value.sourceId, sourceVersion: value.sourceVersion ?? null } : {}), ...(taskId ? { taskId } : {}) });
  };
  for (const value of busy) source('busy', value);
  for (const value of energyWindows) source('energy', value);
  for (const value of travelTimes) source('travel', value);
  for (const value of sourceCoverage) if (!['local-agenda', 'current', 'user-declared'].includes(value.sourceId) || value.status !== 'complete') source('source_coverage', value);
  const coverageMode = sourceCoverage.some(value => ['current', 'user-declared'].includes(value.sourceId) && value.status === 'complete')
    && sourceCoverage.every(value => value.status === 'complete') ? 'retained_local_interpretation' : 'unestablished';
  if (coverageMode === 'unestablished' && !requiredRefresh.some(value => value.kind === 'source_coverage')) requiredRefresh.push({ kind: 'source_coverage' });
  const retainCondition = (value: typeof conditions[number], taskId?: string) => requiredRefresh.push({ kind: 'condition', condition: value.condition,
    ...(taskId ? { taskId } : {}), ...(value.sourceId ? { sourceId: value.sourceId, sourceVersion: value.sourceVersion ?? null } : {}) });
  conditions.forEach(value => retainCondition(value));
  const staticTasks = tasks.map(({ sourceId, sourceVersion, conditions: taskConditions, ...task }) => {
    if (sourceId) source('task_source', { sourceId, sourceVersion }, task.id);
    taskConditions.forEach(value => retainCondition(value, task.id));
    return task;
  });
  completedTaskIds.forEach(taskId => requiredRefresh.push({ kind: 'completion', taskId }));
  return planningIntentSpecSchema.parse({ version: 1, interpretation: 'model_interpretation_with_method_defaults',
    request: { ...request, tasks: staticTasks, completedTaskIds: [] }, requiredRefresh: unique(requiredRefresh), coverageMode });
}

const actionDigest = (action: EffectAction) => hash({ capability: action.capability, capabilityContract: action.capabilityContract,
  arguments: action.arguments, audience: action.audience, revision: action.revision, worldId: action.worldId,
  validUntil: action.validUntil, dependencies: action.dependencies });

/** The caller supplies one complete, currently authorized snapshot. Opaque links are
 * registered in the preparation transaction; their absence alone is not a receipt. */
export function projectPlanningAdoption(input: PlanningAdoptionInput): PlanningAdoptionProjection {
  const result: PlanningAdoptionProjection = { status: 'ready', reasons: [], observations: [], retained: emptyRetained(),
    taskMinutes: [], dailyMinutes: [], allocatedMinutes: 0, calendarFingerprint: calendarPlanFingerprint(input.calendar) };
  const review = (reason: string) => { result.status = 'needs_review'; result.reasons.push(reason); };
  const now = Date.parse(input.now), request = input.spec.request;
  if (!Number.isFinite(now)) { review('当前时间无法核对，不能计算剩余安排。'); return result; }
  const seenAttempts = new Map<string, PlanningAttemptRecord>();
  const observations = new Map<string, PlanningUnitObservation>();
  const key = (planId: string, blockId: string) => `${planId}\0${blockId}`;
  const recordOwners = new Map<string, string>(), actionOwners = new Map<string, string>();
  const attempts: PlanningAttemptRecord[] = [];
  const previousSpecs: PlanningAttemptRecord[] = [];
  for (const attempt of input.attempts) {
    const previous = seenAttempts.get(attempt.planId);
    if (previous) { if (canonical(previous) !== canonical(attempt)) review('同一规划身份存在冲突的持久记录。'); continue; }
    seenAttempts.set(attempt.planId, attempt);
    const observed = input.links.some(value => value.planId === attempt.planId) || input.calendar.some(value => value.planRef?.planId === attempt.planId);
    if (attempt.intentId !== input.intentId) {
      if (observed) review('已有采用记录不属于当前意图规格，不能自动映射剩余工作量。');
      continue;
    }
    if (attempt.specDigest !== input.specDigest) {
      if (observed) previousSpecs.push(attempt);
      continue;
    }
    if (attempt.manifest.version !== 1 || attempt.manifest.planId !== attempt.planId || attempt.manifest.timeZone !== request.timeZone) {
      review('规划记录的身份、版本或时区无法核对。'); continue;
    }
    attempts.push(attempt);
  }
  for (const link of input.links) if (!seenAttempts.has(link.planId)) review('存在缺少原规划记录的动作关联，不能推断未保存。');

  const observe = (planId: string, unit: PlanningManifestUnit): PlanningUnitObservation => {
    const base = { planId, blockId: unit.blockId };
    const fail = (status: PlanningUnitObservation['status'], reason: string, extra: Partial<PlanningUnitObservation> = {}) => ({ ...base, status, reason, ...extra });
    const links = unique(input.links.filter(value => value.planId === planId && value.blockId === unit.blockId));
    const rows = input.calendar.filter(value => value.planRef?.planId === planId && value.planRef.blockId === unit.blockId);
    if (rows.length > 1 || new Set(links.map(value => value.actionId)).size > 1) return fail('duplicate', '同一采用单位存在多个日历对象或动作关联。');
    if (!links.length) {
      if (rows.length || input.actions.some(value => canonical(value.arguments.planRef) === canonical({ planId, blockId: unit.blockId })))
        return fail('unavailable', '已观察到业务对象或动作，但缺少原子保存的关联证明。');
      return { ...base, status: 'never_prepared' };
    }
    const extra = { actionId: links[0].actionId };
    const actions = input.actions.filter(value => value.id === extra.actionId);
    if (actions.length !== 1) return fail('unavailable', '原动作的当前证明不可用。', extra);
    const action = actions[0], args = action.arguments;
    // Revising the same action keeps its immutable older links. Only its
    // currently exact revision can prove the eventual saved invocation.
    const link = links.find(value => value.actionRevision === action.revision && value.actionDigest === action.digest);
    if (!link || actionDigest(action) !== action.digest)
      return fail('changed', '原动作版本或完整参数签名已经改变。', extra);
    if (action.capability !== 'local.agenda.save' || action.effect !== 'local_write' || action.simulated || action.worldId !== 'real' || action.audience !== 'self'
      || !action.capabilityContract || action.capabilityContract.capabilityName !== action.capability)
      return fail('unavailable', '原动作不是可核对的真实本地保存。', extra);
    if (!validRange(unit.start, unit.end) || !Number.isInteger((Date.parse(unit.end) - Date.parse(unit.start)) / minute)
      || !unit.argumentKeys.length || new Set(unit.argumentKeys).size !== unit.argumentKeys.length
      || canonical([...unit.argumentKeys].sort()) !== canonical(Object.keys(args).sort()) || hash(args) !== unit.argumentsDigest
      || canonical(args.planRef) !== canonical({ planId, blockId: unit.blockId }) || Date.parse(String(args.startsAt)) !== Date.parse(unit.start)
      || args.durationMinutes !== (Date.parse(unit.end) - Date.parse(unit.start)) / minute)
      return fail('changed', '采用单位与原动作的完整占用参数不一致。', extra);
    if (action.status === 'cancelled' && action.reason === 'cancelled_before_dispatch' && !action.compensation
      && !input.actionAttempts.some(value => value.actionId === action.id) && !input.receipts.some(value => value.actionId === action.id)
      && !rows.length && !input.calendar.some(value => value.id === action.id || value.effectActionId === action.id))
      return { ...base, ...extra, status: 'not_adopted', reason: '宿主已在派发前明确取消，并重新核实没有任何派发或业务保存证明。' };
    if (action.status !== 'succeeded') return fail(['awaiting_approval', 'approved', 'dispatching', 'outcome_unknown', 'unresolved', 'cancel_requested', 'cancellation_unknown'].includes(action.status)
      ? 'pending' : 'unavailable', '原动作尚无确定可用的成功状态，须沿原动作核查。', extra);
    const successes = unique(input.receipts.filter(value => value.actionId === action.id && value.status === 'confirmed_success' && value.localStatus === 'local_saved'));
    if (successes.length > 1) return fail('duplicate', '原动作存在多份成功提交证明，不能重复计算。', extra);
    const receipt = successes[0];
    if (!receipt || !receipt.externalRecordId || receipt.sourceId !== action.sourceId || !Number.isFinite(Date.parse(receipt.observedAt)))
      return fail('unavailable', '缺少指向真实日历对象的本地成功回执。', extra);
    const dispatches = input.actionAttempts.filter(value => value.id === receipt.attemptId);
    if (dispatches.length !== 1 || dispatches[0].actionId !== action.id || dispatches[0].idempotencyKey !== action.idempotencyKey || dispatches[0].status !== 'succeeded')
      return fail('unavailable', '成功回执缺少一致的真实派发记录。', extra);
    const undo = action.compensation;
    if (!undo?.applied || undo.targetId !== receipt.externalRecordId || !Number.isSafeInteger(undo.expectedRevision) || undo.expectedRevision < 1)
      return fail('unavailable', '原保存对象及成功写入版本无法核对。', extra);
    const current = input.calendar.filter(value => value.id === receipt.externalRecordId);
    const saved = { ...extra, recordId: receipt.externalRecordId, recordRevision: undo.expectedRevision };
    if (!current.length) return fail('deleted', '已成功保存的日历对象现在不存在。', saved);
    if (current.length !== 1) return fail('duplicate', '成功回执对应多个当前对象。', saved);
    const row = current[0];
    if (row.done) return fail('done_marked', '日历对象已标记完成；这不能自动折算为任务进展。', saved);
    if (!Number.isSafeInteger(row.revision) || !Number.isSafeInteger(input.calendarRevisions[row.id]) || input.calendarRevisions[row.id] < 1)
      return fail('unavailable', '当前日历对象的版本或修订高水位不可用。', saved);
    if (row.revision !== undo.expectedRevision || input.calendarRevisions[row.id] !== undo.expectedRevision || row.effectActionId !== action.id
      || row.approvalDigest !== action.digest || row.saved !== true || row.planning?.state !== 'accepted'
      || canonical(row.planRef) !== canonical({ planId, blockId: unit.blockId })
      || hash(Object.fromEntries(unit.argumentKeys.map(name => [name, (row as unknown as Record<string, unknown>)[name]]))) !== unit.argumentsDigest)
      return fail('changed', '当前日历对象、参数或版本已不同于原成功保存。', saved);
    const owner = key(planId, unit.blockId);
    if (recordOwners.has(row.id) && recordOwners.get(row.id) !== owner || actionOwners.has(action.id) && actionOwners.get(action.id) !== owner)
      return fail('duplicate', '同一实际对象或动作被多个采用单位引用。', saved);
    recordOwners.set(row.id, owner); actionOwners.set(action.id, owner);
    if (Date.parse(unit.start) < now) return fail('partial', '已保存占用已经开始或过去，不能把时间经过当作工作进展。', saved);
    return { ...base, ...saved, status: 'intact' };
  };
  const unallocated = (status: PlanningUnitObservation['status'] | undefined) => status === 'never_prepared' || status === 'not_adopted';
  for (const attempt of previousSpecs) {
    const { planId, manifest } = attempt, ids = new Set(manifest.units.map(unit => unit.blockId));
    const completeManifest = manifest.version === 1 && manifest.planId === planId && ids.size === manifest.units.length
      && !input.links.some(value => value.planId === planId && !ids.has(value.blockId))
      && !input.calendar.some(value => value.planRef?.planId === planId && !ids.has(value.planRef.blockId));
    const previous = completeManifest ? manifest.units.map(unit => observe(planId, unit)) : [];
    result.observations.push(...previous);
    // A different specification cannot inherit adopted work. A host-proven
    // cancellation of every prepared unit, however, has no work to inherit.
    if (!completeManifest || !previous.some(value => value.status === 'not_adopted') || previous.some(value => !unallocated(value.status)))
      review('已有采用记录不属于当前意图规格，且不能证明其准备单位均在派发前取消；不能自动映射剩余工作量。');
  }

  for (const attempt of attempts) {
    const { manifest, planId } = attempt;
    const ids = new Set<string>();
    for (const unit of manifest.units) {
      const identity = key(planId, unit.blockId);
      if (ids.has(unit.blockId)) { review('规划记录含重复采用单位。'); continue; }
      ids.add(unit.blockId);
      const observation = observe(planId, unit);
      result.observations.push(observation); observations.set(identity, observation);
      if (observation.status !== 'intact' && !unallocated(observation.status)) review(`${observation.reason}（${unit.blockId}）`);
    }
    if (input.links.some(value => value.planId === planId && !ids.has(value.blockId)) || input.calendar.some(value => value.planRef?.planId === planId && !ids.has(value.planRef.blockId)))
      review('存在原规划单位之外的动作关联或日历对象。');
  }

  const recordVersions = (planId: string, unitIds: string[]) => unitIds.map(id => observations.get(key(planId, id))!)
    .map(value => ({ id: value.recordId!, revision: value.recordRevision! }));
  const complete = (planId: string, ids: string[]) => ids.length > 0 && ids.every(id => observations.get(key(planId, id))?.status === 'intact');
  const tiles = (planId: string, ids: string[], start: string, end: string) => {
    const manifest = seenAttempts.get(planId)!.manifest, units = ids.map(id => manifest.units.find(unit => unit.blockId === id));
    if (!validRange(start, end) || new Set(ids).size !== ids.length || units.some(unit => !unit || !validRange(unit.start, unit.end))) return false;
    const sorted = (units as PlanningManifestUnit[]).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return sorted.length > 0 && Date.parse(sorted[0].start) === Date.parse(start) && Date.parse(sorted.at(-1)!.end) === Date.parse(end)
      && sorted.every((unit, index) => index === 0 || Date.parse(sorted[index - 1].end) === Date.parse(unit.start));
  };
  const groupIds = new Set<string>(), boundaryIds = new Set<string>(), unitGroups = new Set<string>(), unitBoundaries = new Set<string>();
  for (const { planId, manifest } of attempts) {
    for (const group of manifest.groups) {
      if (groupIds.has(group.id)) { review('不同工作组重复使用同一身份。'); continue; }
      groupIds.add(group.id);
      const task = request.tasks.find(value => value.id === group.taskId);
      const groupUnits = manifest.units.filter(unit => unit.groupId === group.id);
      if (!task || !Number.isSafeInteger(group.segment) || group.segment < 1 || !validRange(group.start, group.end)
        || !Number.isSafeInteger(group.durationMinutes) || group.durationMinutes < 1 || group.durationMinutes !== (Date.parse(group.end) - Date.parse(group.start)) / minute
        || Date.parse(group.reservedStart) > Date.parse(group.start) || Date.parse(group.reservedEnd) < Date.parse(group.end)
        || !tiles(planId, group.unitIds, group.reservedStart, group.reservedEnd)
        || canonical(groupUnits.map(value => value.blockId).sort()) !== canonical([...group.unitIds].sort()) || groupUnits.some(value => value.kind !== 'work')) {
        review('工作组的完整占用、净工作范围或任务归属无法核对。'); continue;
      }
      for (const id of group.unitIds) {
        const identity = key(planId, id);
        if (unitGroups.has(identity)) review('同一采用单位被多个工作组引用。');
        unitGroups.add(identity);
      }
      if (!complete(planId, group.unitIds)) {
        if (group.unitIds.some(id => !unallocated(observations.get(key(planId, id))?.status))) review('工作组只保留了部分占用或证明，不能扣减净工作量。');
        continue;
      }
      if (Date.parse(group.reservedStart) < now || Date.parse(group.reservedStart) < Date.parse(request.from) || Date.parse(group.reservedEnd) > Date.parse(request.to)) {
        review('工作组不再是原规划范围内完整的未来占用。'); continue;
      }
      const versions = recordVersions(planId, group.unitIds);
      result.retained.work.push({ id: group.id, taskId: group.taskId, segment: group.segment, start: group.start, end: group.end,
        reservedStart: group.reservedStart, reservedEnd: group.reservedEnd, durationMinutes: group.durationMinutes,
        recordIds: versions.map(value => value.id), recordVersions: versions, ...(group.placeId ? { placeId: group.placeId } : {}) });
    }
    for (const boundary of manifest.boundaries) {
      if (boundaryIds.has(boundary.id)) { review('不同休息或转场边界重复使用同一身份。'); continue; }
      boundaryIds.add(boundary.id);
      const units = manifest.units.filter(unit => unit.boundaryId === boundary.id);
      if (!Number.isFinite(boundary.restMinutes) || !Number.isFinite(boundary.travelMinutes) || boundary.restMinutes < 0 || boundary.travelMinutes < 0
        || !tiles(planId, boundary.unitIds, boundary.start, boundary.end) || (Date.parse(boundary.end) - Date.parse(boundary.start)) / minute !== boundary.restMinutes + boundary.travelMinutes
        || canonical(units.map(value => value.blockId).sort()) !== canonical([...boundary.unitIds].sort()) || units.some(value => value.kind !== 'transition')) {
        review('休息或转场的完整边界无法核对。'); continue;
      }
      for (const id of boundary.unitIds) {
        const identity = key(planId, id);
        if (unitBoundaries.has(identity)) review('同一采用单位被多个休息或转场边界引用。');
        unitBoundaries.add(identity);
      }
      if (!complete(planId, boundary.unitIds)) {
        if (boundary.unitIds.some(id => !unallocated(observations.get(key(planId, id))?.status))) review('休息或转场边界只保留了部分占用或证明。');
        continue;
      }
      const versions = recordVersions(planId, boundary.unitIds), { unitIds: _unitIds, ...coverage } = boundary;
      result.retained.boundaries.push({ ...coverage, recordIds: versions.map(value => value.id), recordVersions: versions });
    }
    if (manifest.units.some(unit => unit.kind === 'work' && !unitGroups.has(key(planId, unit.blockId)))) review('存在未归属完整工作组的净工作采用单位。');
    if (manifest.units.some(unit => unit.kind === 'transition' && !unitBoundaries.has(key(planId, unit.blockId)))) review('存在未归属完整边界的休息或转场采用单位。');
  }
  const occupied = attempts.flatMap(attempt => attempt.manifest.units.filter(unit => observations.get(key(attempt.planId, unit.blockId))?.status === 'intact'))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  let lastEnd = -Infinity;
  for (const unit of occupied) {
    if (Date.parse(unit.start) < lastEnd) review('已采用工作的完整占用、休息、转场或保护时间互相重叠，须核对实际安排。');
    lastEnd = Math.max(lastEnd, Date.parse(unit.end));
  }
  if (occupied.length) {
    const ownRecords = new Set(result.observations.filter(value => value.status === 'intact').map(value => value.recordId!));
    const otherCalendar = input.calendar.filter(value => !ownRecords.has(value.id) && !value.done
      && (!value.planning || value.planning.state === 'accepted') && (!value.kind || ['event', 'time_block'].includes(value.kind)));
    try {
      const from = occupied[0].start, to = iso(lastEnd), expansion = expandAgenda(otherCalendar, from, to, request.timeZone);
      if (expansion.issues.length) review('其他当前日历占用无法完整展开，不能确认原已安排工作及边界仍无冲突。');
      for (const row of expansion.items) {
        const dateBounds = typeof row.allDayDate === 'string' ? planningDayBounds(row.allDayDate, String(row.timeZone || request.timeZone))
          : row.dateBounds as { from: string; to: string } | undefined;
        const start = dateBounds?.from || String(row.startsAt || ''), startTime = Date.parse(start);
        const end = dateBounds?.to || (typeof row.durationMinutes === 'number' ? iso(startTime + row.durationMinutes * minute) : to);
        if (!Number.isFinite(startTime) || !validRange(start, end)) { review('当前日历存在无法核对的占用范围。'); continue; }
        if (occupied.some(unit => overlaps(unit, { start, end }))) review('其他当前日历安排与已采用的工作、休息、转场或保护占用冲突。');
      }
    } catch {
      review('其他当前日历的时间边界无法核对，须重新读取后再规划。');
    }
  }
  const work = result.retained.work.sort((a, b) => Date.parse(a.reservedStart) - Date.parse(b.reservedStart) || a.id.localeCompare(b.id));
  const retainedIds = new Set(work.map(value => value.id));
  for (const { manifest } of attempts) if (new Set(manifest.allocationBasis.groupIds).size !== manifest.allocationBasis.groupIds.length
    || manifest.allocationBasis.groupIds.some(id => !retainedIds.has(id) || manifest.groups.some(group => group.id === id)))
    review('重算所依据的原已安排工作组已缺失、改变或重复。');
  for (const task of request.tasks) {
    const groups = work.filter(value => value.taskId === task.id);
    if (!groups.length) continue;
    const minutes = groups.reduce((sum, value) => sum + value.durationMinutes, 0), reservedEnd = iso(Math.max(...groups.map(value => Date.parse(value.reservedEnd))));
    if (minutes > task.durationMinutes.max) review('已安排净工作超过原任务工作量，不能自动扣减。');
    result.taskMinutes.push({ taskId: task.id, minutes, reservedEnd });
    if (minutes === task.durationMinutes.max) result.retained.scheduledTasks.push({ taskId: task.id, reservedEnd });
    result.allocatedMinutes += minutes;
  }
  const daily = new Map<string, number>();
  for (const group of work) {
    const last = dateInZone(iso(Date.parse(group.end) - 1), request.timeZone);
    for (let date = dateInZone(group.start, request.timeZone); date <= last; date = addDate(date, 1)) {
      const bounds = planningDayBounds(date, request.timeZone);
      const minutes = Math.max(0, Math.min(Date.parse(group.end), Date.parse(bounds.to)) - Math.max(Date.parse(group.start), Date.parse(bounds.from))) / minute;
      if (minutes > 0) daily.set(date, (daily.get(date) || 0) + minutes);
    }
  }
  result.dailyMinutes = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, minutes]) => ({ date, minutes }));
  if (result.allocatedMinutes > request.maxScheduledMinutes) review('已安排净工作超过原规划总预算。');
  for (const budget of request.dailyBudgets) if (budget.maxScheduledMinutes !== undefined && (daily.get(budget.date) || 0) > budget.maxScheduledMinutes + 1e-8)
    review('已安排净工作超过原规划逐日预算。');
  result.reasons = [...new Set(result.reasons)];
  return result;
}

/** Start from the original envelope once. Adopted work stays scheduled, never completed. */
export function materializePlanningIntent(spec: PlanningIntentSpec, adoption: PlanningAdoptionProjection, options: { now: string }): PlanningReplanMaterialization {
  const retained = structuredClone(adoption.retained), requiredRefresh = structuredClone(spec.requiredRefresh);
  const finish = (status: PlanningReplanMaterialization['status'], reasons: string[], request: PlanningDraftRequest | null = null): PlanningReplanMaterialization =>
    ({ status, request, retained, reasons: [...new Set(reasons)], requiredRefresh });
  if (adoption.status !== 'ready') return finish('needs_review', adoption.reasons);
  if (spec.request.completedTaskIds.length && !requiredRefresh.some(value => value.kind === 'completion'))
    spec.request.completedTaskIds.forEach(taskId => requiredRefresh.push({ kind: 'completion', taskId }));
  if (spec.coverageMode !== 'retained_local_interpretation' && !requiredRefresh.some(value => value.kind === 'source_coverage')) requiredRefresh.push({ kind: 'source_coverage' });
  if (requiredRefresh.length) return finish('required_refresh', ['原规划包含需要当前重新读取的事实、条件或完成依据。']);
  const original = structuredClone(spec.request), now = Date.parse(options.now);
  if (!Number.isFinite(now)) return finish('needs_review', ['当前时间无法核对。']);
  const from = Math.max(Date.parse(original.from), Math.ceil(now / minute) * minute), to = Date.parse(original.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return finish('no_future_domain', ['原规划范围已没有未来时间，不能自动平移日期。']);
  // Alignment limits new writes. A saved reservation can legitimately begin
  // in the few future seconds before that aligned lower bound.
  if (retained.work.some(value => Date.parse(value.reservedStart) < now) || retained.boundaries.some(value => Date.parse(value.start) < now))
    return finish('needs_review', ['已采用占用不再完整位于本次未来范围，须重新核对当前进展。']);
  const clip = <T extends { start: string; end: string }>(values: T[]): T[] => values.flatMap(value => {
    const start = Math.max(from, Date.parse(value.start)), end = Math.min(to, Date.parse(value.end));
    return end > start ? [{ ...value, start: iso(start), end: iso(end) }] : [];
  });
  const scheduleWindows = original.scheduleWindows === undefined ? undefined : clip(original.scheduleWindows);
  if (scheduleWindows?.length === 0) return finish('no_future_domain', ['原声明的可安排时窗已没有未来交集；空时窗不扩成整个日期范围。']);
  const tasks: PlanningDraftRequest['tasks'] = [];
  for (const task of original.tasks) {
    const allocation = adoption.taskMinutes.find(value => value.taskId === task.id), allocated = allocation?.minutes || 0;
    if (allocated > task.durationMinutes.max || allocated < 0) return finish('needs_review', ['已安排净工作与原任务工作量不一致。']);
    if (allocated === task.durationMinutes.max) continue;
    const max = task.durationMinutes.max - allocated;
    if (task.minimumChunkMinutes && max < task.minimumChunkMinutes) return finish('needs_review', ['剩余净工作不足原最小连续时长，不能默默修改原约束。']);
    const earliest = allocation ? Math.max(task.earliestStart ? Date.parse(task.earliestStart) : from, Date.parse(allocation.reservedEnd)) : undefined;
    if (earliest !== undefined && task.deadline && earliest >= Date.parse(task.deadline)) return finish('needs_review', ['已安排工作之后的余量无法继续满足原任务期限。']);
    tasks.push({ ...task, durationMinutes: { min: Math.max(1, task.durationMinutes.min - allocated), max }, conditions: [],
      ...(earliest === undefined ? {} : { earliestStart: iso(earliest) }),
      ...(task.allowedWindows === undefined ? {} : { allowedWindows: clip(task.allowedWindows) }), preferredWindows: clip(task.preferredWindows) });
  }
  const maxScheduledMinutes = original.maxScheduledMinutes - adoption.allocatedMinutes;
  if (maxScheduledMinutes < 0) return finish('needs_review', ['已安排净工作超过原总预算。']);
  const firstDate = dateInZone(iso(from), original.timeZone), lastDate = dateInZone(iso(to - 1), original.timeZone);
  const dailyBudgets = original.dailyBudgets.filter(value => value.date >= firstDate && value.date <= lastDate).map(value => ({ ...value,
    ...(value.maxScheduledMinutes === undefined ? {} : { maxScheduledMinutes: value.maxScheduledMinutes - (adoption.dailyMinutes.find(day => day.date === value.date)?.minutes || 0) }) }));
  if (dailyBudgets.some(value => value.maxScheduledMinutes !== undefined && value.maxScheduledMinutes < -1e-8)) return finish('needs_review', ['已安排净工作超过原逐日预算。']);
  const request = planningDraftInput.parse({ ...original, from: iso(from), to: original.to, tasks, completedTaskIds: [],
    ...(scheduleWindows === undefined ? {} : { scheduleWindows }), protectedWindows: clip(original.protectedWindows),
    dailyBudgets: dailyBudgets.map(value => ({ ...value, ...(value.maxScheduledMinutes === undefined ? {} : { maxScheduledMinutes: Math.max(0, value.maxScheduledMinutes) }) })),
    maxScheduledMinutes, busy: [], travelTimes: [], energyWindows: [], conditions: [], sourceCoverage: [{ sourceId: 'user-declared', status: 'complete',
      reason: '仍有合法原话来源的保留规划解释与方法默认值所述约束；不是新查的外部事实、精力或全部现实承诺，本机实际日历另行读取。' }] });
  return finish('ready', [], request);
}
