import { createHash, randomUUID } from 'node:crypto';
import type { PlanningBlock, PlanningScene } from '../../shared/scenes';
import { calendarDate } from '../../shared/calendar';
import { planningDayBounds } from '../actions/planning-days';
import { addDate, dateInZone } from './semantics';

type AgendaResult = { status: string; sourceId: string; data?: unknown; fetchedAt?: string; coverage?: { complete?: boolean; scope?: string } };
const instant = (value: unknown): value is string => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const rows = (value: unknown): Record<string, any>[] => Array.isArray(value) ? value.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];

/** A direct projection of the bounded calendar read. Never calls a planner or invents free time. */
export function agendaSnapshot(result: AgendaResult, input: unknown, now: string): PlanningScene | undefined {
  if (result.sourceId !== 'local-agenda' || !['fresh', 'partial', 'known_absent'].includes(result.status)) return;
  const args = input as Record<string, any> | undefined, data = result.data as Record<string, any> | undefined;
  if (!args || !data || !Array.isArray(data.items) || rows(data.items).length !== data.items.length || !instant(args.from) || !instant(args.to)
    || Date.parse(args.to) <= Date.parse(args.from) || Date.parse(args.to) - Date.parse(args.from) > 31 * 86400000 || data.items.length > 400) return;
  const zone = args.timeZone || 'Asia/Shanghai';
  if (!text(zone, 100)) return;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { return; }
  const days: NonNullable<PlanningScene['agendaRead']>['days'] = [];
  for (let date = dateInZone(args.from, zone), count = 0; count < 33; date = addDate(date, 1), count++) {
    const bounds = planningDayBounds(date, zone);
    if (Date.parse(bounds.from) >= Date.parse(args.to)) break;
    const from = Math.max(Date.parse(bounds.from), Date.parse(args.from)), to = Math.min(Date.parse(bounds.to), Date.parse(args.to));
    if (to > from) days.push({ date, from: new Date(from).toISOString(), to: new Date(to).toISOString() });
  }
  if (!days.length || Date.parse(days.at(-1)!.to) !== Date.parse(args.to)) return;
  const blocks: PlanningBlock[] = [], identities = new Set<string>();
  for (const row of rows(data.items)) {
    if (!text(row.id, 160) || !text(row.occurrenceId, 400) || !text(row.title, 160) || row.done === true) return;
    if (identities.has(row.occurrenceId)) return;
    identities.add(row.occurrenceId);
    const revision = row.revision === undefined ? 1 : row.revision;
    if (!Number.isSafeInteger(revision) || revision < 1) return;
    const sourceZone = row.timeZone || zone;
    if (!text(sourceZone, 100)) return;
    try { new Intl.DateTimeFormat('en', { timeZone: sourceZone }); } catch { return; }
    const allDay = row.allDayDate !== undefined ? calendarDate.safeParse(row.allDayDate) : undefined;
    if (allDay && !allDay.success) return;
    const bounds = allDay?.success ? planningDayBounds(allDay.data, sourceZone) : undefined;
    const start = bounds?.from || row.startsAt, end = bounds?.to || row.endsAt;
    if (!instant(start) || end !== null && !instant(end) || end !== null && Date.parse(end) <= Date.parse(start)) return;
    if (Date.parse(start) >= Date.parse(args.to) || end !== null && Date.parse(end) <= Date.parse(args.from)) continue;
    const state = row.planning?.state === undefined ? 'registered' : row.planning.state;
    if (!['invitation', 'wish', 'proposed', 'accepted', 'registered'].includes(state)) return;
    const kind = row.kind;
    if (kind !== undefined && !['event', 'todo', 'deadline', 'reminder', 'time_block'].includes(kind)) return;
    const record: NonNullable<PlanningBlock['agendaRecord']> = { id: row.id, revision, occurrenceId: row.occurrenceId,
      state, timeZone: sourceZone, ...(kind ? { kind } : {}), ...(allDay?.success ? { allDayDate: allDay.data } : {}),
      ...(calendarDate.safeParse(row.originalDate).success ? { occurrenceDate: row.originalDate } : {}) };
    for (const day of days) {
      if (end === null && day.date !== dateInZone(new Date(Math.max(Date.parse(start), Date.parse(args.from))).toISOString(), zone)) continue;
      const partStart = Math.max(Date.parse(start), Date.parse(day.from));
      const partEnd = end === null ? null : Math.min(Date.parse(end), Date.parse(day.to));
      if (partStart >= Date.parse(day.to) || partEnd !== null && partEnd <= partStart) continue;
      const clipped = partStart !== Date.parse(start) || partEnd !== null && partEnd !== Date.parse(end);
      blocks.push({ id: `agenda:${row.occurrenceId}:${day.date}`, sourceObjectId: row.occurrenceId, kind: 'busy', label: row.title,
        start: new Date(partStart).toISOString(), end: partEnd === null ? null : new Date(partEnd).toISOString(), agendaRecord: record,
        ...(text(row.planning?.placeId, 160) ? { placeId: row.planning.placeId } : {}),
        ...(text(row.detail, 1500) ? { reason: row.detail } : {}),
        ...(clipped ? { originalRange: { start, end } } : {}) });
    }
  }
  blocks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  const issues = rows(data.issues), conditions = issues.map(row => row.status === 'unknown_end'
    ? `${instant(row.startsAt) ? new Date(row.startsAt).toLocaleString('zh-CN', { timeZone: zone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' 开始的' : ''}记录结束时间未知，不能据此断定后续空闲。`
    : row.status === 'ambiguous' ? '有重复实例的本地时刻存在歧义，尚未展开。'
      : row.status === 'nonexistent' ? '有重复实例的本地时刻不存在，尚未展开。'
        : '有记录未能完整展开，请回读原安排核对。');
  if (result.coverage?.complete !== true && !conditions.length) conditions.push('这次读取覆盖不完整，未显示的部分仍需核对。');
  if (args.query) conditions.push(`本次只显示标题逐字包含「${args.query}」的记录，未匹配不代表当天没有安排。`);
  return { kind: 'planning', mode: 'agenda', id: randomUUID(), revision: 1, createdAt: now,
    source: { sourceId: result.sourceId, fetchedAt: instant(result.fetchedAt) ? result.fetchedAt : '', coverage: result.coverage,
      version: createHash('sha256').update(JSON.stringify({ data: result.data, input, status: result.status, coverage: result.coverage, fetchedAt: result.fetchedAt })).digest('hex') },
    window: { from: args.from, to: args.to, timeZone: zone },
    agendaRead: { days, complete: result.coverage?.complete === true, ...(args.query ? { titleQuery: args.query } : {}) },
    blocks, requiredSourceIds: [], sourceCoverage: [{ sourceId: result.sourceId, status: result.coverage?.complete === true ? 'complete' : 'partial',
      reason: '仅本机未完成且有日期的已登记记录；不包括未注明日期的待办，也不证明现实空闲。' }],
    conditions: [...new Set(conditions)], unscheduled: [], applied: false };
}
