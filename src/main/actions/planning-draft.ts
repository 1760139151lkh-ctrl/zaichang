import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Action } from '../../shared/types';
import { HarnessError } from '../../shared/harness';
import { calendarDate } from '../../shared/calendar';
import { expandAgenda } from './calendar';
import { addDate, dateInZone, canonical } from '../runtime/semantics';
import { planningDayBounds } from './planning-days';
import type { PlanningRetainedContext, RetainedBoundaryCoverage } from './planning-intent-contract';

const instant = z.string().datetime({ offset: true });
const minutes = z.number().int().min(0).max(1440);
const id = z.string().min(1).max(160);
const windowSchema = z.object({ start: instant, end: instant }).strict();
const duration = z.object({ min: minutes, max: minutes }).strict();
const condition = z.object({ condition: z.string().min(1).max(300), status: z.enum(['satisfied', 'unknown', 'unavailable']), sourceId: id.optional(), sourceVersion: z.string().max(160).optional() }).strict();
const taskSchema = z.object({
  id, title: z.string().min(1).max(160), detail: z.string().max(1200).default(''),
  durationMinutes: duration.describe('剩余工作量区间；按max留位，min不是允许省略的工作。估时未知时先补证，不默填。'),
  splittable: z.boolean().default(false), minimumChunkMinutes: z.number().int().min(1).max(1440).optional(),
  maximumChunkMinutes: z.number().int().min(1).max(1440).optional().describe('本次选择的单段工作上限，非医学建议；只有splittable=true才可拆段，段间按restMinutes保留休息，不减少总工作量。未提供则不强制打断连续思考。'),
  dependsOn: z.array(id).max(30).default([]), earliestStart: instant.optional(), deadline: instant.optional(),
  allowedWindows: z.array(windowSchema).max(64).optional(), preferredWindows: z.array(windowSchema).max(32).default([]),
  placeId: id.optional(), effort: z.enum(['low', 'medium', 'high']).optional(),
  priority: z.number().int().min(0).max(10).default(0).describe('本次明确选择的优先顺序，不是人格/价值评分。'),
  setupMinutes: minutes.default(0), cleanupMinutes: minutes.default(0),
  conditions: z.array(condition).max(12).default([]), sourceId: id.optional(), sourceVersion: z.string().max(160).optional(),
}).strict();

export const planningDraftInput = z.object({
  from: instant, to: instant, timeZone: z.string().max(100).default('Asia/Shanghai'),
  scheduleWindows: z.array(windowSchema).max(64).optional().describe('本次整体用于安排的时间范围，含新增工作、准备收尾、转场和休息；不把间隙猜成睡眠或忙碌。省略沿用整个核查窗口试算，但不证明本人现实可安排；空数组明确不新增占用。任务allowedWindows可进一步限制任务/资源。'),
  tasks: z.array(taskSchema).max(30), completedTaskIds: z.array(id).max(100).default([]),
  busy: z.array(z.object({ start: instant, end: instant.nullable(), sourceId: id, sourceVersion: z.string().max(160).optional(), title: z.string().max(160).optional(), placeId: id.optional() }).strict()).max(500).default([]),
  sourceCoverage: z.array(z.object({ sourceId: id.describe('user-declared/current只表示本次明确自述，不替代外部连接器的覆盖。'), status: z.enum(['complete', 'partial', 'not_checked']), sourceVersion: z.string().max(160).optional(), reason: z.string().max(300).optional() }).strict()).max(30).default([]).describe('各条分别说明本次纳入来源的实际覆盖。current或user-declared对应当前原话给出的任务、窗口与条件，complete表示这份已提供内容在本次试排里完整纳入，并不证明未读外部安排为空或可用。local-agenda只说明本机记录；仅有它或省略本字段，会保留其他来源未声明的条件。原有外部partial/not_checked与真实未知条件仍属于各自来源，当前自述不能代替或抹去它们。'),
  conditions: z.array(condition).max(20).default([]),
  protectedWindows: z.array(windowSchema.extend({ reason: z.string().min(1).max(300) }).strict()).max(64).default([]),
  restMinutes: z.number().int().min(0).max(120).default(10).describe('两个工作段之间额外保留的休息，不抵扣通勤；用户可调整，非医学规则。'),
  transitionMinutes: duration.default({ min: 0, max: 0 }).describe('每次进入/离开边界的默认转换成本，明确地点对成本优先。'),
  travelTimes: z.array(z.object({ fromPlaceId: id, toPlaceId: id, minutes: duration, sourceId: id, sourceVersion: z.string().max(160).optional() }).strict()).max(200).default([]),
  startPlaceId: id.optional(), endPlaceId: id.optional(),
  maxScheduledMinutes: z.number().int().min(0).max(44640).default(240).describe('本次窗口的工作量上限；默认有限预算不是对用户能力的判断。'),
  reserveMinutes: z.number().int().min(0).max(44640).default(30).describe('本次窗口至少保留的自由时间，不创建待办或完成义务。'),
  dailyBudgets: z.array(z.object({
    date: calendarDate,
    maxScheduledMinutes: z.number().min(0).max(44640).optional().describe('该本地日期内本次新增净工作分钟上限，与窗口总上限同时生效；不含已有承诺、准备收尾、转场或休息，也不冒充全天工作总量。跨午夜恢复时可保留小数分钟。'),
    reserveMinutes: z.number().int().min(0).max(44640).optional().describe('该本地日期与本次窗口交集内，扣除已有忙碌、保护窗口及新增完整占用后至少留下的空白；不默认睡眠或现实空闲。'),
  }).strict().refine(value => value.maxScheduledMinutes !== undefined || value.reserveMinutes !== undefined, '每日预算需要工作上限或保留空白。')).max(32).default([]).describe('仅本次明确选择的逐日限制，按timeZone的自然日计算，跨午夜按真实分钟拆账；没有列出的日期不添加默认限制。'),
  energyWindows: z.array(windowSchema.extend({ capacity: z.enum(['low', 'medium', 'high']), sourceId: id, sourceVersion: z.string().max(160).optional() }).strict()).max(64).default([]),
}).strict();

type Input = z.infer<typeof planningDraftInput>;
type Task = Input['tasks'][number];
type Interval = { start: number; end: number };
type PlanningDay = Interval & { date: string; budget?: Input['dailyBudgets'][number] };
type Occupied = Interval & { id: string; kind: 'fixed' | 'protected' | 'task' | 'support'; title?: string; placeId?: string; unknownEnd?: boolean;
  retained?: boolean; taskId?: string; segment?: number; workId?: string };
type Cost = { minutes: number; minMinutes: number; unknown: string[]; sources: string[] };
type Transfer = Interval & { fromId: string | null; toId: string | null; travel: Cost; restMinutes: number;
  fromWorkId?: string; toWorkId?: string; fromTaskId?: string; toTaskId?: string; fromSegment?: number; toSegment?: number; fromPlaceId?: string; toPlaceId?: string };
type Candidate = { start: number; end: number; reservedStart: number; reservedEnd: number; before: Cost; after: Cost; restBefore: number; restAfter: number; preferred: boolean; unknown: string[] };
const minute = 60000;
const maxSegments = 256;
const iso = (time: number) => new Date(time).toISOString();
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const unique = (items: string[]) => [...new Set(items)];
const overlap = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Includes additions/deletions and actual payload, not only the revision of a moved object. */
export function calendarPlanFingerprint(items: Action[]) {
  return hash([...items].sort((a, b) => a.id.localeCompare(b.id)));
}
export function assertDraftCalendarCurrent(items: Action[], expectedFingerprint: string) {
  if (calendarPlanFingerprint(items) !== expectedFingerprint) throw new HarnessError('planning_stale', '日历在方案生成后已变化，请重新核查整个方案窗口，尚未写入。');
}

function asInterval(value: { start: string; end: string }, label: string): Interval {
  const start = Date.parse(value.start), end = Date.parse(value.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new HarnessError('planning_window', `${label}的起止范围无效。`);
  return { start, end };
}
function merge(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const item of [...intervals].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = result.at(-1);
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else result.push({ ...item });
  }
  return result;
}
function freeIntervals(occupied: Interval[], bounds: Interval): Interval[] {
  const result: Interval[] = [];
  let cursor = bounds.start;
  for (const item of merge(occupied.filter(item => overlap(item, bounds)))) {
    if (item.start > cursor) result.push({ start: cursor, end: Math.min(item.start, bounds.end) });
    cursor = Math.max(cursor, item.end);
  }
  if (cursor < bounds.end) result.push({ start: cursor, end: bounds.end });
  return result;
}
function intersect(a: Interval, b: Interval): Interval | undefined {
  const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
  return end > start ? { start, end } : undefined;
}
const intervalMinutes = (interval: Interval, bounds: Interval) => Math.max(0, Math.min(interval.end, bounds.end) - Math.max(interval.start, bounds.start)) / minute;
const workMinutesIn = (work: Interval[], bounds: Interval) => work.reduce((sum, value) => sum + intervalMinutes(value, bounds), 0);
const inBounds = (intervals: Interval[], bounds: Interval) => intervals.flatMap(value => { const clipped = intersect(value, bounds); return clipped ? [clipped] : []; });
const freeWithin = (occupied: Interval[], domain: Interval[], bounds: Interval) => inBounds(domain, bounds).flatMap(value => freeIntervals(occupied, value));
const totalMinutes = (intervals: Interval[]) => intervals.reduce((sum, value) => sum + (value.end - value.start) / minute, 0);
const freeMinutesIn = (occupied: Interval[], bounds: Interval, domain: Interval[]) => totalMinutes(freeWithin(occupied, domain, bounds));

function scheduleDomain(input: Input, bounds: Interval) {
  return input.scheduleWindows === undefined ? [bounds] : inBounds(merge(input.scheduleWindows.map(value => asInterval(value, '可安排窗口'))), bounds);
}

function planningDays(input: Input, bounds: Interval): PlanningDay[] {
  if (new Set(input.dailyBudgets.map(value => value.date)).size !== input.dailyBudgets.length)
    throw new HarnessError('planning_day_budget', '同一本地日期提供了多份预算，请先统一本次选择。');
  const result: PlanningDay[] = [];
  const lastDate = dateInZone(iso(bounds.end - 1), input.timeZone);
  for (let date = dateInZone(iso(bounds.start), input.timeZone); date <= lastDate; date = addDate(date, 1)) {
    const day = planningDayBounds(date, input.timeZone), clipped = intersect(bounds, { start: Date.parse(day.from), end: Date.parse(day.to) });
    if (clipped) result.push({ ...clipped, date, budget: input.dailyBudgets.find(value => value.date === date) });
  }
  if (input.dailyBudgets.some(value => !result.some(day => day.date === value.date)))
    throw new HarnessError('planning_day_budget', '每日预算日期不在本次时区和规划窗口内，请核对日期。');
  return result;
}

/** The largest contiguous productive prefix allowed by every declared day cap. */
function dailyWorkCapacity(start: number, length: number, days: PlanningDay[], work: Interval[]) {
  let end = start + length * minute;
  for (const day of days) {
    if (day.budget?.maxScheduledMinutes === undefined || start >= day.end || end <= day.start) continue;
    const available = Math.max(0, day.budget.maxScheduledMinutes - workMinutesIn(work, day));
    if (intervalMinutes({ start, end }, day) > available) end = Math.min(end, Math.max(start, day.start) + available * minute);
  }
  return Math.max(0, Math.floor((end - start) / minute + 1e-8));
}
function validateInput(input: Input) {
  const bounds = asInterval({ start: input.from, end: input.to }, '规划');
  if (bounds.end - bounds.start > 31 * 86400000) throw new HarnessError('planning_window', '一次多任务规划最多覆盖31天，请分段保留真实条件。');
  try { new Intl.DateTimeFormat('en', { timeZone: input.timeZone }); } catch { throw new HarnessError('time_zone', '规划时区不合法。'); }
  if (new Set(input.tasks.map(task => task.id)).size !== input.tasks.length) throw new HarnessError('planning_task_id', '任务ID重复，不能区分计划与依赖。');
  if (input.tasks.some(task => input.completedTaskIds.includes(task.id))) throw new HarnessError('planning_task_state', '同一任务不能同时声明待排和已完成。');
  for (const value of [input.transitionMinutes, ...input.tasks.map(task => task.durationMinutes), ...input.travelTimes.map(item => item.minutes)])
    if (value.max < value.min) throw new HarnessError('planning_duration', '时长上界不能小于下界。');
  for (const task of input.tasks) {
    if (task.durationMinutes.min < 1 || task.minimumChunkMinutes && task.minimumChunkMinutes > task.durationMinutes.max) throw new HarnessError('planning_duration', '任务时长须为正，最小分段不能超过总时长上界。');
    if (task.maximumChunkMinutes && task.maximumChunkMinutes < (task.minimumChunkMinutes || (task.splittable ? Math.min(30, task.durationMinutes.max) : 1)))
      throw new HarnessError('planning_chunk', '单段工作上限小于最小分段，请按本次真实偏好调整，不能默默缩短有效学习块。');
    if (task.earliestStart && task.deadline && Date.parse(task.deadline) <= Date.parse(task.earliestStart)) throw new HarnessError('planning_window', '任务截止须晚于最早开始。');
    for (const value of [...task.allowedWindows || [], ...task.preferredWindows]) asInterval(value, '任务窗口');
  }
  for (const value of [...input.protectedWindows, ...input.energyWindows]) asInterval(value, '保护或精力窗口');
  for (const value of input.busy) if (value.end) asInterval({ start: value.start, end: value.end }, '外部忙碌区间');
  const pairs = input.travelTimes.map(item => `${item.fromPlaceId}\0${item.toPlaceId}`);
  if (new Set(pairs).size !== pairs.length) throw new HarnessError('planning_travel', '同一有向地点对提供了冲突的多份转换成本，请先统一本次采用的版本。');
  return bounds;
}

function travelCost(input: Input, from: string | undefined, to: string | undefined): Cost {
  if (from && to && from === to) return { minutes: 0, minMinutes: 0, unknown: [], sources: [] };
  const known = from && to ? input.travelTimes.find(item => item.fromPlaceId === from && item.toPlaceId === to) : undefined;
  if (known) return { minutes: known.minutes.max, minMinutes: known.minutes.min, unknown: known.sourceVersion ? [] : ['地点转换依据未提供版本，采用前须重新核查。'], sources: [known.sourceId] };
  return { minutes: input.transitionMinutes.max, minMinutes: input.transitionMinutes.min,
    unknown: from || to ? ['地点间移动尚无完整的有向路线依据，当前使用声明的默认转换成本。'] : [], sources: [] };
}

function sourceIssues(input: Input, issues: unknown[]): string[] {
  const declared = input.sourceCoverage.filter(value => value.sourceId !== 'local-agenda');
  return unique([
    ...(!declared.length ? ['其他日程来源未声明覆盖；本地空白不证明现实空闲。'] : declared.filter(value => value.status !== 'complete').map(value => value.reason || `${value.sourceId}尚未完整覆盖。`)),
    ...input.conditions.filter(value => value.status !== 'satisfied').map(value => value.condition),
    ...(issues.length ? ['本地日历存在未知结束时间或无法展开的具体实例。'] : []),
    ...input.busy.filter(value => !value.sourceVersion).map(value => `${value.sourceId}忙碌区间没有版本，采用前须核查。`),
    ...input.energyWindows.filter(value => !value.sourceVersion).map(value => `${value.sourceId}精力依据没有版本，采用前须核查当次状态。`),
  ]);
}

function dependencyCycles(tasks: Task[]): Set<string> {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const visited = new Set<string>(), visiting: string[] = [], cycles = new Set<string>();
  const visit = (taskId: string) => {
    const cycleAt = visiting.indexOf(taskId);
    if (cycleAt >= 0) { for (const value of visiting.slice(cycleAt)) cycles.add(value); return; }
    if (visited.has(taskId)) return;
    visiting.push(taskId);
    for (const dependency of byId.get(taskId)?.dependsOn || []) if (byId.has(dependency)) visit(dependency);
    visiting.pop(); visited.add(taskId);
  };
  for (const task of tasks) visit(task.id);
  return cycles;
}

function boundaryRequirements(input: Input, left: Occupied | undefined, right: Occupied | undefined, bounds: Interval, coverage: RetainedBoundaryCoverage[]) {
  const fromPlaceId = left ? left.placeId : input.startPlaceId, toPlaceId = right ? right.placeId : input.endPlaceId;
  const travel = travelCost(input, fromPlaceId, toPlaceId), rest = left?.kind === 'task' && right?.kind === 'task' ? input.restMinutes : 0;
  const start = Math.max(bounds.start, left?.end ?? bounds.start), end = Math.min(bounds.end, right?.start ?? bounds.end);
  const endpointMatches = (workId: string | undefined, taskId: string | undefined, endpoint: Occupied | undefined) =>
    endpoint?.kind === 'task' ? !!(workId && workId === endpoint.workId || taskId && taskId === endpoint.taskId) : !workId && !taskId;
  // New writes use the clipped gap above. Verified saved support keeps its
  // original geometry, including future seconds before the aligned new horizon.
  const covered = coverage.filter(value => Date.parse(value.start) >= (left?.end ?? -Infinity) && Date.parse(value.end) <= (right?.start ?? Infinity)
    && endpointMatches(value.fromWorkId, value.fromTaskId, left) && endpointMatches(value.toWorkId, value.toTaskId, right));
  const restCovered = covered.reduce((sum, value) => sum + value.restMinutes, 0);
  const travelCovered = covered.filter(value => value.fromPlaceId === fromPlaceId && value.toPlaceId === toPlaceId).reduce((sum, value) => sum + value.travelMinutes, 0);
  return { start, end, travel: { ...travel, minutes: Math.max(0, travel.minutes - travelCovered), minMinutes: Math.max(0, travel.minMinutes - travelCovered) },
    restMinutes: Math.max(0, rest - restCovered) };
}

/** Reserve each shared boundary once. Stored support stays occupied and only
 * supplies exact coverage; it never becomes a fictitious intermediate place. */
function transferReservations(input: Input, occupied: Occupied[], bounds: Interval, domain: Interval[], coverage: RetainedBoundaryCoverage[]): Transfer[] | undefined {
  const sequence = occupied.filter(value => value.kind !== 'protected' && value.kind !== 'support').sort((a, b) => a.start - b.start || a.end - b.end);
  const result: Transfer[] = [];
  for (let index = 0; index <= sequence.length; index++) {
    const left = sequence[index - 1], right = sequence[index];
    if (left?.kind !== 'task' && right?.kind !== 'task') continue;
    const { start, end, travel, restMinutes } = boundaryRequirements(input, left, right, bounds, coverage);
    const length = (travel.minutes + restMinutes) * minute;
    if (!length) continue;
    if (end < start) return undefined;
    const gaps = freeWithin(occupied.filter(value => value.kind === 'protected' || value.kind === 'support'), domain, { start, end });
    const free = [...gaps].reverse().find(value => value.end - value.start >= length);
    if (!free) return undefined;
    result.push({ start: free.end - length, end: free.end, fromId: left?.id || null, toId: right?.id || null, travel, restMinutes,
      ...(left?.workId ? { fromWorkId: left.workId } : {}), ...(right?.workId ? { toWorkId: right.workId } : {}),
      ...(left?.taskId ? { fromTaskId: left.taskId, fromSegment: left.segment } : {}), ...(right?.taskId ? { toTaskId: right.taskId, toSegment: right.segment } : {}),
      ...((left ? left.placeId : input.startPlaceId) ? { fromPlaceId: left ? left.placeId : input.startPlaceId } : {}),
      ...((right ? right.placeId : input.endPlaceId) ? { toPlaceId: right ? right.placeId : input.endPlaceId } : {}) });
  }
  return result;
}

function candidates(task: Task, remaining: number, workBudget: number, earliest: number, input: Input, occupied: Occupied[], bounds: Interval, days: PlanningDay[], work: Interval[], domain: Interval[], coverage: RetainedBoundaryCoverage[]): Candidate[] {
  const taskBounds = { start: Math.max(bounds.start, earliest, task.earliestStart ? Date.parse(task.earliestStart) : bounds.start), end: Math.min(bounds.end, task.deadline ? Date.parse(task.deadline) : bounds.end) };
  const allowed = task.allowedWindows === undefined ? [taskBounds] : merge(task.allowedWindows.map(value => asInterval(value, '任务窗口'))).flatMap(value => { const intersection = intersect(value, taskBounds); return intersection ? [intersection] : []; });
  const levels = { low: 1, medium: 2, high: 3 };
  const energy = input.energyWindows.map(value => ({ ...asInterval(value, '精力窗口'), ...value, start: Date.parse(value.start), end: Date.parse(value.end) }));
  const unsuitable = task.effort ? energy.filter(value => levels[value.capacity] < levels[task.effort!]) : [];
  const free = freeWithin([...occupied, ...unsuitable], domain, taskBounds);
  const preferences = task.preferredWindows.map(value => asInterval(value, '偏好窗口'));
  const result: Candidate[] = [];
  for (const gap of free) {
    const previous = occupied.filter(value => value.end <= gap.start && value.kind !== 'protected' && value.kind !== 'support').sort((a, b) => b.end - a.end)[0];
    const next = occupied.filter(value => value.start >= gap.end && value.kind !== 'protected' && value.kind !== 'support').sort((a, b) => a.start - b.start)[0];
    const placeholder: Occupied = { id: 'candidate', kind: 'task', taskId: task.id, start: gap.start, end: gap.end, placeId: task.placeId };
    const entering = boundaryRequirements(input, previous, { ...placeholder, end: gap.start }, bounds, coverage);
    const leaving = boundaryRequirements(input, { ...placeholder, start: gap.end }, next, bounds, coverage);
    const before = entering.travel, after = leaving.travel, restBefore = entering.restMinutes, restAfter = leaving.restMinutes;
    const earliestCore = gap.start + (before.minutes + restBefore + task.setupMinutes) * minute;
    const latestCore = gap.end - (after.minutes + restAfter + task.cleanupMinutes) * minute;
    for (const valid of allowed) {
      // A declared availability window includes preparation and cleanup, not only productive minutes.
      const usable = intersect({ start: earliestCore, end: latestCore }, { start: valid.start + task.setupMinutes * minute, end: valid.end - task.cleanupMinutes * minute });
      if (!usable) continue;
      // Include preferred starts and boundaries of known energy; all choices are checked again below.
      const dayStarts = input.dailyBudgets.length ? days.flatMap(day => [day.start, day.end,
        ...(day.budget?.maxScheduledMinutes !== undefined ? [day.end - Math.max(0, day.budget.maxScheduledMinutes - workMinutesIn(work, day)) * minute] : [])])
        .filter(value => value >= usable.start && value < usable.end) : [];
      const starts = unique([String(usable.start), ...preferences.filter(value => overlap(value, usable)).map(value => String(Math.max(usable.start, value.start))), ...energy.filter(value => overlap(value, usable)).map(value => String(Math.max(usable.start, value.start))), ...dayStarts.map(String)]).map(Number);
      for (const start of starts) {
        const capacity = Math.floor((usable.end - start) / minute);
        let length = task.splittable ? Math.min(remaining, capacity, workBudget, task.maximumChunkMinutes ?? Infinity) : remaining;
        const dailyCapacity = dailyWorkCapacity(start, length, days, work);
        if (task.splittable) length = Math.min(length, dailyCapacity);
        else if (dailyCapacity < length) continue;
        const minimum = task.minimumChunkMinutes || (task.splittable ? Math.min(30, task.durationMinutes.max) : task.durationMinutes.max);
        if (task.splittable && remaining > length && remaining - length < minimum) length = remaining - minimum;
        if (length < minimum || length > capacity) continue;
        const end = start + length * minute;
        const knownEnergy = task.effort ? merge(energy.filter(value => levels[value.capacity] >= levels[task.effort!]).map(value => ({ start: value.start, end: value.end }))).some(value => value.start <= start && value.end >= end) : true;
        result.push({ start, end, reservedStart: start - task.setupMinutes * minute, reservedEnd: end + task.cleanupMinutes * minute,
          before, after, restBefore, restAfter, preferred: preferences.some(value => value.start <= start && value.end >= end),
          unknown: unique([...before.unknown, ...after.unknown, ...task.conditions.filter(value => value.status === 'unknown').map(value => value.condition), ...(knownEnergy ? [] : ['这段时间的可用精力尚无当前自述依据，安排仍待确认。'])]) });
      }
    }
  }
  return result.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.unknown.length - b.unknown.length || a.start - b.start || b.end - a.end);
}

/** Constructive, bounded and read-only: failure to place is not a proof of global infeasibility. */
export function draftCalendarPlan(items: Action[], raw: unknown, retained?: PlanningRetainedContext) {
  const input = planningDraftInput.parse(raw), bounds = validateInput(input);
  const days = planningDays(input, bounds), domain = scheduleDomain(input, bounds);
  const retainedRecordIds = new Set([...(retained?.work || []), ...(retained?.boundaries || [])].flatMap(value => value.recordIds));
  const coverage = retained?.boundaries || [];
  for (const value of [...(retained?.work || []), ...coverage]) {
    if (!value.recordIds.length || value.recordVersions.length !== value.recordIds.length || value.recordVersions.some(version => {
      const row = items.find(item => item.id === version.id);
      return !value.recordIds.includes(version.id) || !row || row.done || row.planning?.state !== 'accepted' || (row.revision || 1) !== version.revision;
    })) throw new HarnessError('planning_retained_changed', '原已保存占用已变化或缺少当前版本，未生成新方案。');
  }
  // Only accepted time commitments constrain a plan, including their unresolved
  // occurrences. Look outside the window for transfers crossing its edges.
  const expansion = expandAgenda(items.filter(item => !item.done && (!item.planning || item.planning.state === 'accepted')
    && (!item.kind || ['event', 'time_block'].includes(item.kind))), iso(bounds.start - 1440 * minute), iso(bounds.end + 1440 * minute), input.timeZone);
  const issues = [...expansion.issues];
  const occupied: Occupied[] = [];
  const localSources: { sourceId: string; sourceVersion: string; occurrenceId: string }[] = [];
  for (const row of expansion.items) {
    const item = row as unknown as Action & { occurrenceId: string; endsAt?: string | null; dateBounds?: { from: string; to: string } };
    if (retainedRecordIds.has(item.id)) { localSources.push({ sourceId: item.id, sourceVersion: String(item.revision || 1), occurrenceId: item.occurrenceId }); continue; }
    if (item.planning && item.planning.state !== 'accepted' || item.kind && !['event', 'time_block'].includes(item.kind)) continue;
    const allDay = item.allDayDate ? planningDayBounds(item.allDayDate, item.timeZone || input.timeZone) : undefined;
    const start = Date.parse(allDay?.from || item.startsAt || '');
    if (!Number.isFinite(start)) continue;
    const unknownEnd = !allDay && !item.durationMinutes;
    const end = allDay ? Date.parse(allDay.to) : item.durationMinutes ? start + item.durationMinutes * minute : bounds.end;
    // The numeric end only reserves conservative accounting space. Keep the
    // original uncertainty so a view never presents it as an observed end.
    occupied.push({ id: item.occurrenceId, kind: 'fixed', title: item.title, start, end, placeId: item.planning?.placeId, ...(unknownEnd ? { unknownEnd: true } : {}) });
    if (unknownEnd && start < bounds.end && !issues.some(issue => issue.status === 'unknown_end' && issue.id === item.id && Date.parse(String(issue.startsAt)) === start))
      issues.push({ id: item.id, occurrenceId: item.occurrenceId, status: 'unknown_end', startsAt: iso(start) });
    localSources.push({ sourceId: item.id, sourceVersion: String(item.revision || 1), occurrenceId: item.occurrenceId });
  }
  // Unknown-duration occurrences preceding the requested window are reported as issues, not items.
  for (const issue of expansion.issues) if (issue.status === 'unknown_end' && typeof issue.startsAt === 'string') {
    const item = items.find(value => value.id === issue.id);
    if (item && (!item.planning || item.planning.state === 'accepted') && (!item.kind || ['event', 'time_block'].includes(item.kind))) occupied.push({ id: String(issue.id), kind: 'fixed', title: item.title, start: Date.parse(issue.startsAt), end: bounds.end, placeId: item.planning?.placeId, unknownEnd: true });
  }
  for (const value of input.busy) occupied.push({ id: value.sourceId, kind: 'fixed', title: value.title, start: Date.parse(value.start), end: value.end ? Date.parse(value.end) : bounds.end, placeId: value.placeId, ...(value.end === null ? { unknownEnd: true } : {}) });
  for (const value of retained?.work || []) occupied.push({ ...asInterval({ start: value.reservedStart, end: value.reservedEnd }, '已保存工作'), id: value.id,
    kind: 'task', retained: true, workId: value.id, taskId: value.taskId, segment: value.segment, placeId: value.placeId,
    title: items.find(item => value.recordIds.includes(item.id))?.title || '已保存的工作安排' });
  for (const value of coverage) occupied.push({ ...asInterval(value, '已保存边界'), id: value.id, kind: 'support', retained: true, title: '已保存的转场与休息' });
  const protectedWindows = input.protectedWindows.flatMap(value => inBounds(domain, asInterval(value, '保护窗口'))
    .map(window => ({ start: iso(window.start), end: iso(window.end), reason: value.reason })));
  for (const [index, value] of protectedWindows.entries()) occupied.push({ ...asInterval(value, '保护窗口'), id: `protected:${index}`, kind: 'protected' });
  const baseOccupied = occupied.map(value => ({ ...value }));
  const initialFreeMinutes = freeMinutesIn(occupied, bounds, domain);
  const baseUnknown = sourceIssues(input, issues);
  if (input.busy.some(value => value.end === null)) baseUnknown.push('外部忙碌区间存在未知结束，按窗口结束保守占用。');
  if (input.scheduleWindows !== undefined && input.protectedWindows.some(value => {
    const requested = intersect(asInterval(value, '保护窗口'), bounds);
    return requested && totalMinutes(inBounds(domain, requested)) < (requested.end - requested.start) / minute - 1e-8;
  })) baseUnknown.push('部分保护时间不在本次可安排范围内，未纳入本方案的采用单位；原请求没有改成已保存，需另行处理或调整范围。');
  const cycles = dependencyCycles(input.tasks), completed = new Set(input.completedTaskIds);
  const byId = new Map(input.tasks.map(value => [value.id, value])), finished = new Map<string, number>((retained?.scheduledTasks || []).map(value => [value.taskId, Date.parse(value.reservedEnd)]));
  const blocks: { taskId: string; title: string; start: string; end: string; durationMinutes: number; reservedStart: string; reservedEnd: string; placeId?: string; segment: number; preferred: boolean; conditions: string[]; travelBefore: Cost; travelAfter: Cost; restBeforeMinutes: number; restAfterMinutes: number }[] = [];
  const unscheduled: { taskId: string; title: string; remainingMinutes: number; code: string; reason: string; dependencyIds?: string[] }[] = [];
  const fail = (task: Task, remaining: number, code: string, reason: string, dependencyIds?: string[]) => unscheduled.push({ taskId: task.id, title: task.title, remainingMinutes: remaining, code, reason, ...(dependencyIds ? { dependencyIds } : {}) });
  let workMinutes = 0;
  const pending = [...input.tasks].sort((a, b) => b.priority - a.priority || (a.deadline ? Date.parse(a.deadline) : bounds.end) - (b.deadline ? Date.parse(b.deadline) : bounds.end) || a.id.localeCompare(b.id));
  while (pending.length) {
    const index = pending.findIndex(task => cycles.has(task.id) || task.dependsOn.every(value => completed.has(value) || finished.has(value) || !pending.some(other => other.id === value)));
    const task = pending.splice(index >= 0 ? index : 0, 1)[0];
    const missing = task.dependsOn.filter(value => !byId.has(value) && !completed.has(value) && !finished.has(value));
    const blocked = task.dependsOn.filter(value => !completed.has(value) && !finished.has(value));
    if (cycles.has(task.id)) { fail(task, task.durationMinutes.max, 'dependency_cycle', '前置任务形成环，请澄清真实先后关系。', task.dependsOn); continue; }
    if (missing.length) { fail(task, task.durationMinutes.max, 'dependency_missing', '前置任务未提供，也没有已完成依据。', missing); continue; }
    if (blocked.length) { fail(task, task.durationMinutes.max, 'dependency_unplaced', '前置任务尚未完整安排，本次没有把后续工作提前。', blocked); continue; }
    const unavailable = [...input.conditions, ...task.conditions].filter(value => value.status === 'unavailable');
    if (unavailable.length) { fail(task, task.durationMinutes.max, 'condition_unavailable', unavailable.map(value => value.condition).join('；')); continue; }
    if (!task.splittable && task.maximumChunkMinutes && task.durationMinutes.max > task.maximumChunkMinutes) {
      fail(task, task.durationMinutes.max, 'split_permission_required', '总工作量超过本次单段上限，但任务尚未允许拆分；保留完整工作量，需调整上限或明确允许拆段。'); continue;
    }
    let remaining = task.durationMinutes.max, lastEnd = Math.max(bounds.start, ...task.dependsOn.map(value => finished.get(value) || bounds.start)), segment = 0;
    while (remaining > 0) {
      if (blocks.length >= maxSegments) { fail(task, remaining, 'segment_limit', '本次方案已达到256个工作段的计算上限；保留剩余工作量，请缩短规划窗口或选择更长的有效工作段。'); break; }
      if (workMinutes >= input.maxScheduledMinutes) { fail(task, remaining, 'budget_or_reserve', '已达到本次工作量上限，保留其余任务而不追加追赶义务。'); break; }
      const scheduledWork = blocks.map(block => ({ start: Date.parse(block.start), end: Date.parse(block.end) }));
      const options = candidates(task, remaining, input.maxScheduledMinutes - workMinutes, lastEnd, input, occupied, bounds, days, scheduledWork, domain, coverage);
      if (!options.length) { fail(task, remaining, 'no_placement_found', `在本次可安排范围、当前承诺、任务窗口、精力限制、连续时长${input.dailyBudgets.length ? '、每日工作预算' : ''}和转换成本下，本次构造没有找到可用位置；这不是全局无解证明。`); break; }
      const fits = (value: Candidate) => {
        const length = (value.end - value.start) / minute;
        const projectedOccupied: Occupied[] = [...occupied, { start: value.reservedStart, end: value.reservedEnd, id: `${task.id}:${segment + 1}`, kind: 'task', taskId: task.id, segment: segment + 1, placeId: task.placeId }];
        const transfers = transferReservations(input, projectedOccupied, bounds, domain, coverage);
        if (!transfers) return { fits: false, freeDeficit: Infinity };
        const projected = freeMinutesIn([...projectedOccupied, ...transfers], bounds, domain);
        const dailyDeficit = Math.max(0, ...days.filter(day => day.budget).flatMap(day => [
          (day.budget!.reserveMinutes ?? 0) - freeMinutesIn([...projectedOccupied, ...transfers], day, domain),
          day.budget!.maxScheduledMinutes === undefined ? 0 : workMinutesIn([...scheduledWork, value], day) - day.budget!.maxScheduledMinutes,
        ]));
        return { fits: workMinutes + length <= input.maxScheduledMinutes && projected >= input.reserveMinutes && dailyDeficit <= 1e-8,
          freeDeficit: Math.max(0, input.reserveMinutes - projected, workMinutes + length - input.maxScheduledMinutes, dailyDeficit) };
      };
      let candidate: Candidate | undefined;
      for (const option of options) {
        const check = fits(option);
        if (check.fits) { candidate = option; break; }
        if (!task.splittable || !Number.isFinite(check.freeDeficit)) continue;
        const minimum = task.minimumChunkMinutes || Math.min(30, task.durationMinutes.max);
        if (input.dailyBudgets.length) {
          const resized = (length: number) => ({ ...option, end: option.start + length * minute, reservedEnd: option.start + (length + task.cleanupMinutes) * minute });
          if (!fits(resized(minimum)).fits) continue;
          // A bounded prefix search can free several local dates, unlike simply
          // subtracting one day's deficit from the tail of a multi-day block.
          let low = minimum, high = Math.floor((option.end - option.start) / minute);
          while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (fits(resized(middle)).fits) low = middle; else high = middle - 1;
          }
          if (remaining > low && remaining - low < minimum) low = remaining - minimum;
          if (low >= minimum && fits(resized(low)).fits) { candidate = resized(low); break; }
          continue;
        }
        let length = (option.end - option.start) / minute - Math.ceil(check.freeDeficit);
        if (remaining > length && remaining - length < minimum) length = remaining - minimum;
        if (length < minimum) continue;
        const shorter = { ...option, end: option.start + length * minute, reservedEnd: option.start + (length + task.cleanupMinutes) * minute };
        if (fits(shorter).fits) { candidate = shorter; break; }
      }
      if (!candidate) { fail(task, remaining, 'budget_or_reserve', '本次窗口或每日工作量上限、保留空白不足以容纳这一段；未把休息和自由时间填满。'); break; }
      const length = (candidate.end - candidate.start) / minute;
      blocks.push({ taskId: task.id, title: task.title, start: iso(candidate.start), end: iso(candidate.end), durationMinutes: length,
        reservedStart: iso(candidate.reservedStart), reservedEnd: iso(candidate.reservedEnd), ...(task.placeId ? { placeId: task.placeId } : {}), segment: ++segment,
        preferred: candidate.preferred, conditions: candidate.unknown, travelBefore: candidate.before, travelAfter: candidate.after, restBeforeMinutes: candidate.restBefore, restAfterMinutes: candidate.restAfter });
      occupied.push({ start: candidate.reservedStart, end: candidate.reservedEnd, id: `${task.id}:${segment}`, kind: 'task', taskId: task.id, segment, placeId: task.placeId });
      workMinutes += length; remaining -= length; lastEnd = candidate.reservedEnd;
    }
    if (remaining === 0) finished.set(task.id, lastEnd);
  }
  blocks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const remainingTransfers = transferReservations(input, occupied, bounds, domain, coverage);
  if (!remainingTransfers && retained?.work.length)
    throw new HarnessError('planning_retained_boundary_unfit', '当前范围无法容纳已保存工作的必要转场或休息；原占用保留，需要先调整条件，未省略边界生成新方案。');
  const transfers = remainingTransfers || [];
  // Inserting a task changes neighbours; expose the final boundaries, never stale candidate routes.
  const sequence = occupied.filter(value => value.kind !== 'protected' && value.kind !== 'support').sort((a, b) => a.start - b.start || a.end - b.end);
  for (const block of blocks) {
    const index = sequence.findIndex(value => value.kind === 'task' && !value.retained && value.taskId === block.taskId && value.segment === block.segment);
    const previous = sequence[index - 1], next = sequence[index + 1];
    const entering = boundaryRequirements(input, previous, sequence[index], bounds, coverage), leaving = boundaryRequirements(input, sequence[index], next, bounds, coverage);
    block.travelBefore = entering.travel; block.travelAfter = leaving.travel;
    block.restBeforeMinutes = entering.restMinutes; block.restAfterMinutes = leaving.restMinutes;
    block.conditions = unique([...block.conditions.filter(value => !value.startsWith('地点')), ...block.travelBefore.unknown, ...block.travelAfter.unknown]);
  }
  const daySummaries = days.map(day => {
    const scheduledMinutes = workMinutesIn(blocks.map(block => ({ start: Date.parse(block.start), end: Date.parse(block.end) })), day);
    const eligible = inBounds(domain, day), eligibleMinutes = totalMinutes(eligible);
    const freeMinutes = freeMinutesIn([...occupied, ...transfers], day, domain), initialFreeMinutes = freeMinutesIn(baseOccupied, day, domain);
    const reserveShortfallMinutes = Math.max(0, (day.budget?.reserveMinutes ?? 0) - freeMinutes);
    return { date: day.date, from: iso(day.start), to: iso(day.end), timeZone: input.timeZone,
      budget: day.budget || null, scheduledMinutes, initialFreeMinutes, freeMinutes,
      eligibleWindows: eligible.map(value => ({ start: iso(value.start), end: iso(value.end) })), eligibleMinutes,
      outsideScopeMinutes: Math.max(0, (day.end - day.start) / minute - eligibleMinutes), occupiedMinutes: eligibleMinutes - freeMinutes,
      reserveShortfallMinutes, status: reserveShortfallMinutes > 1e-8 ? 'existing_commitments_exceed_reserve' : 'within_declared_budget',
      meaning: '工作分钟仅计本次新增净工作，跨本地午夜拆账；占用和空白仅在本次可安排范围内核算，已扣除已有承诺、保护、准备收尾及共享转场休息。范围之外未纳入安排，不能当作空闲、忙碌、睡眠或可用精力。' };
  });
  const allUnknown = unique([...baseUnknown, ...blocks.flatMap(value => value.conditions),
    ...(freeMinutesIn([...occupied, ...transfers], bounds, domain) + 1e-8 < input.reserveMinutes
      ? ['本次可安排范围扣除完整占用后，无法留下原要求的总空白；需要先调整范围、原安排或留白要求。'] : []),
    ...daySummaries.filter(day => day.reserveShortfallMinutes > 1e-8).map(day => `${day.date}本次可安排范围扣除已有占用和保护后，无法留下本次要求的空白；没有自动扩大范围或移动承诺，须调整范围、原安排或本次留白要求。`)]);
  const calendarFingerprint = calendarPlanFingerprint(items);
  const sourceRevisions = [...localSources, ...[
    ...input.busy, ...input.travelTimes, ...input.energyWindows, ...input.tasks.filter(value => value.sourceId),
    ...input.sourceCoverage.filter(value => !['local-agenda', 'user-declared', 'current'].includes(value.sourceId)),
    ...input.conditions.filter(value => value.sourceId), ...input.tasks.flatMap(value => value.conditions.filter(condition => condition.sourceId)),
  ].map(value => ({ sourceId: value.sourceId!, sourceVersion: value.sourceVersion || null, occurrenceId: null }))];
  return {
    window: { from: input.from, to: input.to, timeZone: input.timeZone },
    scheduleCoverage: { mode: input.scheduleWindows === undefined ? 'horizon_only' : 'provided_windows',
      windows: domain.map(value => ({ start: iso(value.start), end: iso(value.end) })),
      meaning: input.scheduleWindows === undefined ? '未提供本次整体可安排窗口，仅沿整个核查范围试算；日历未登记占用不证明本人现实可安排。' : '仅使用本次提供窗口与核查范围的交集，含新增工作、准备收尾、转场和休息；范围外未纳入，不推断作息或空闲，也不产生保护事件。' },
    strategy: 'dependency_ready_priority_deadline_constructive', optimality: 'not_claimed', limits: { maxWorkSegments: maxSegments },
    calendarFingerprint, planFingerprint: hash({ input, calendarFingerprint }), sourceRevisions,
    sourceCoverage: [{ sourceId: 'local-agenda', status: issues.length === 0 ? 'complete' : 'partial', reason: '仅本机已接受且占用时间的具体实例，不证明所有现实承诺或精力。' }, ...input.sourceCoverage.filter(value => value.sourceId !== 'local-agenda')],
    effectivePreferences: { restMinutes: input.restMinutes, transitionMinutes: input.transitionMinutes, maxScheduledMinutes: input.maxScheduledMinutes, reserveMinutes: input.reserveMinutes, dailyBudgets: input.dailyBudgets,
      taskRhythms: input.tasks.filter(task => task.maximumChunkMinutes !== undefined || task.minimumChunkMinutes !== undefined).map(task => ({ taskId: task.id, splittable: task.splittable, minimumChunkMinutes: task.minimumChunkMinutes ?? (task.splittable ? Math.min(30, task.durationMinutes.max) : task.durationMinutes.max), maximumChunkMinutes: task.maximumChunkMinutes ?? null })) },
    blocks, unscheduled, fixedCommitments: baseOccupied.filter(value => value.kind === 'fixed' || value.retained).map(value => ({ ...value, start: iso(value.start), end: iso(value.end) })),
    protectedWindows, transitions: transfers.map(value => ({ ...value, start: iso(value.start), end: iso(value.end) })),
    freeWindows: freeWithin([...occupied, ...transfers], domain, bounds).map(value => ({ start: iso(value.start), end: iso(value.end), minutes: (value.end - value.start) / minute, meaning: '本次可安排范围内保留完整占用后的空白，不包含未纳入的时段；现实可用性仍取决于声明的来源与条件。' })),
    initialFreeMinutes, scheduledMinutes: workMinutes, daySummaries, conditions: allUnknown, issues,
    feasibility: !blocks.length && unscheduled.length ? 'no_plan_constructed' : allUnknown.length ? 'conditional' : unscheduled.length ? 'partial_for_declared_sources' : 'verified_for_declared_sources',
    completeness: unscheduled.length ? 'partial' : 'all_tasks_placed', accepted: false, applied: false,
    acceptanceProposals: blocks.map(block => ({ taskId: block.taskId, segment: block.segment, dependsOn: byId.get(block.taskId)!.dependsOn,
      capability: 'local.agenda.save', arguments: { title: block.title, detail: byId.get(block.taskId)!.detail, kind: 'time_block', startsAt: block.start, durationMinutes: block.durationMinutes, timeZone: input.timeZone, planning: { state: 'accepted', flexibility: 'movable', ...(block.placeId ? { placeId: block.placeId } : {}) } },
      applied: false, requiresAuthorization: true, requiresPlanRevalidation: true,
    })),
    acceptanceContract: '这些是待用户选择或已有适用授权的动作参数，不是已保存安排。采用前核查完整日历指纹和外部来源版本、重新验证全体计划；依赖顺序执行既有save/change，失败须报告真实部分结果。',
  };
}
