import { createHash, randomUUID } from 'node:crypto';
import { weatherOutput } from '../capabilities/weather';
import { airQualityOutput } from '../capabilities/air-quality';
import type { EnvironmentScene, PlanningBlock, PlanningScene, SceneSource } from '../../shared/scenes';
import { dateInZone } from './semantics';
import { planningDayBounds } from '../actions/planning-days';

type Result = { status: string; sourceId: string; data?: unknown; fetchedAt?: string; expiresAt?: string; coverage?: unknown };
const text = (value: unknown, max = 400): string | undefined => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
const instant = (value: unknown): value is string => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const rows = (value: unknown): Record<string, any>[] => Array.isArray(value) ? value.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
const messages = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(item => text(item, 1200) ? [text(item, 1200)!] : []) : [];
function source(result: Result): SceneSource {
  return { sourceId: result.sourceId, fetchedAt: instant(result.fetchedAt) ? result.fetchedAt : '',
    ...(instant(result.expiresAt) ? { expiresAt: result.expiresAt } : {}), coverage: result.coverage,
    version: createHash('sha256').update(JSON.stringify({ sourceId: result.sourceId, fetchedAt: result.fetchedAt, data: result.data })).digest('hex') };
}

/** Only host planning results enter this projection. It has no save/action endpoint. */
export function planningSnapshot(result: Result, capability: string, input: unknown, now: string): PlanningScene | undefined {
  if (!['planning.preview', 'planning.draft'].includes(capability) || result.sourceId !== 'local-agenda' || !['fresh', 'partial'].includes(result.status)) return;
  const data = result.data as Record<string, any> | undefined;
  const args = input as Record<string, any> | undefined;
  if (!data || data.applied !== false || !instant(data.window?.from) || !instant(data.window?.to) || Date.parse(data.window.to) <= Date.parse(data.window.from) || !text(data.window.timeZone, 100)) return;
  try { new Intl.DateTimeFormat('en', { timeZone: data.window.timeZone }); } catch { return; }
  const readWindows = (value: unknown, from: string, to: string) => {
    if (!Array.isArray(value) || value.length > 64) return null;
    const windows: { start: string; end: string }[] = [];
    for (const row of value) {
      if (!row || !instant(row.start) || !instant(row.end) || Date.parse(row.end) <= Date.parse(row.start)
        || Date.parse(row.start) < Date.parse(from) || Date.parse(row.end) > Date.parse(to)
        || windows.length && Date.parse(row.start) <= Date.parse(windows.at(-1)!.end)) return null;
      windows.push({ start: new Date(row.start).toISOString(), end: new Date(row.end).toISOString() });
    }
    return windows;
  };
  let scheduleCoverage: PlanningScene['scheduleCoverage'];
  if (data.scheduleCoverage !== undefined) {
    const value = data.scheduleCoverage;
    const windows = readWindows(value?.windows, data.window.from, data.window.to);
    if (!windows || !['provided_windows', 'horizon_only'].includes(value?.mode) || !text(value.meaning, 1200)) return;
    if (value.mode === 'horizon_only' && (windows.length !== 1 || Date.parse(windows[0].start) !== Date.parse(data.window.from)
      || Date.parse(windows[0].end) !== Date.parse(data.window.to))) return;
    scheduleCoverage = { mode: value.mode, windows, meaning: value.meaning };
  }
  const blocks: PlanningBlock[] = [];
  const add = (kind: PlanningBlock['kind'], label: string, start: unknown, end: unknown, details: Partial<PlanningBlock> = {}) => {
    if (!instant(start) || end !== null && !instant(end) || end !== null && Date.parse(end as string) <= Date.parse(start)) return;
    if (Date.parse(start) >= Date.parse(data.window.to) || end !== null && Date.parse(end as string) <= Date.parse(data.window.from)) return;
    blocks.push({ ...details, id: `${kind}:${blocks.length}`, kind, label, start, end: end as string | null });
  };
  const sourceCoverage = rows(data.sourceCoverage).flatMap(row => text(row.sourceId, 160) && text(row.status, 80)
    ? [{ sourceId: row.sourceId as string, status: row.status as string, ...(text(row.reason) ? { reason: row.reason as string } : {}) }] : []);
  const externalSources = [...rows(data.sourceRevisions).filter(row => row.occurrenceId == null),
    ...rows(args?.busy), ...rows(args?.travelTimes), ...rows(args?.energyWindows), ...rows(args?.conditions),
    ...rows(args?.tasks), ...rows(args?.tasks).flatMap(task => rows(task.conditions)),
    ...sourceCoverage.filter(row => row.status !== 'not_checked')];
  const requiredSourceIds = [...new Set(externalSources.flatMap(row => text(row.sourceId, 160) && !['current', 'user-declared', 'local-agenda'].includes(row.sourceId) ? [row.sourceId as string] : []))];
  const conditions = [...messages(data.conditions), ...rows(data.conditions).filter(row => row.status !== 'satisfied').flatMap(row => text(row.condition) ? [row.condition as string] : []),
    ...sourceCoverage.filter(row => row.status !== 'complete').map(row => row.reason || `${row.sourceId} 的覆盖尚不完整。`),
    ...(capability === 'planning.preview' && !rows(args?.sourceCoverage).length ? ['其他日程来源尚未声明覆盖，日历留白不能证明现实空闲。'] : []),
    ...(rows(data.issues).length ? ['有未展开或结束时间未知的安排，留白须结合原记录核对。'] : [])];
  const draft = capability === 'planning.draft';
  const minuteValue = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 44640;
  const daySummaries: NonNullable<PlanningScene['daySummaries']> = [];
  for (const day of rows(data.daySummaries)) {
    if (!text(day.date, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !instant(day.from) || !instant(day.to)
      || Date.parse(day.to) <= Date.parse(day.from) || Date.parse(day.from) < Date.parse(data.window.from) || Date.parse(day.to) > Date.parse(data.window.to)
      || !['scheduledMinutes', 'initialFreeMinutes', 'occupiedMinutes', 'freeMinutes', 'reserveShortfallMinutes'].every(key => minuteValue(day[key]))
      || !['within_declared_budget', 'existing_commitments_exceed_reserve'].includes(day.status)) continue;
    let eligibility: Pick<NonNullable<PlanningScene['daySummaries']>[number], 'eligibleWindows' | 'eligibleMinutes' | 'outsideScopeMinutes'> = {};
    try {
      const bounds = planningDayBounds(day.date, data.window.timeZone);
      if (dateInZone(day.from, data.window.timeZone) !== day.date || Date.parse(day.from) < Date.parse(bounds.from) || Date.parse(day.to) > Date.parse(bounds.to)) continue;
      const dayMinutes = (Date.parse(day.to) - Date.parse(day.from)) / 60000;
      if (['scheduledMinutes', 'initialFreeMinutes', 'occupiedMinutes', 'freeMinutes'].some(key => day[key] > dayMinutes + .001)) continue;
      if (scheduleCoverage) {
        const windows = readWindows(day.eligibleWindows, day.from, day.to);
        if (!windows || !minuteValue(day.eligibleMinutes) || !minuteValue(day.outsideScopeMinutes)) continue;
        const expected = scheduleCoverage.windows.flatMap(window => {
          const start = Math.max(Date.parse(window.start), Date.parse(day.from)), end = Math.min(Date.parse(window.end), Date.parse(day.to));
          return end > start ? [{ start: new Date(start).toISOString(), end: new Date(end).toISOString() }] : [];
        });
        const eligibleMinutes = windows.reduce((sum, window) => sum + (Date.parse(window.end) - Date.parse(window.start)) / 60000, 0);
        if (JSON.stringify(expected) !== JSON.stringify(windows) || Math.abs(eligibleMinutes - day.eligibleMinutes) > .001
          || Math.abs(dayMinutes - eligibleMinutes - day.outsideScopeMinutes) > .001
          || Math.abs(day.freeMinutes + day.occupiedMinutes - eligibleMinutes) > .001
          || ['scheduledMinutes', 'initialFreeMinutes'].some(key => day[key] > eligibleMinutes + .001)) continue;
        eligibility = { eligibleWindows: windows, eligibleMinutes, outsideScopeMinutes: day.outsideScopeMinutes };
      }
    } catch { continue; }
    const budget = day.budget && typeof day.budget === 'object' ? {
      ...(minuteValue(day.budget.maxScheduledMinutes) ? { maxScheduledMinutes: day.budget.maxScheduledMinutes as number } : {}),
      ...(minuteValue(day.budget.reserveMinutes) ? { reserveMinutes: day.budget.reserveMinutes as number } : {}),
    } : null;
    daySummaries.push({ date: day.date, from: day.from, to: day.to,
      ...eligibility,
      scheduledMinutes: day.scheduledMinutes, initialFreeMinutes: day.initialFreeMinutes, occupiedMinutes: day.occupiedMinutes,
      freeMinutes: day.freeMinutes, reserveShortfallMinutes: day.reserveShortfallMinutes, status: day.status,
      budget: budget && Object.keys(budget).length ? budget : null });
  }
  if (rows(data.daySummaries).length) {
    daySummaries.sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
    const complete = daySummaries.length === rows(data.daySummaries).length && new Set(daySummaries.map(day => day.date)).size === daySummaries.length
      && Date.parse(daySummaries[0]?.from) === Date.parse(data.window.from) && Date.parse(daySummaries.at(-1)?.to || '') === Date.parse(data.window.to)
      && daySummaries.every((day, index) => !index || Date.parse(day.from) === Date.parse(daySummaries[index - 1].to));
    if (!complete) {
      daySummaries.length = 0;
      conditions.push('按天的范围还没对齐；先保留原来的完整时段继续商量。');
    }
  }
  if (draft) {
    for (const row of rows(data.fixedCommitments)) {
      const unknownEnd = row.unknownEnd === true || rows(data.issues).some(issue => issue.status === 'unknown_end' && issue.id === row.id && Date.parse(issue.startsAt) === Date.parse(row.start))
        || rows(args?.busy).some(item => item.end === null && item.sourceId === row.id && Date.parse(item.start) === Date.parse(row.start));
      add('busy', text(row.title, 160) || '已有安排', row.start, unknownEnd ? null : row.end,
        { ...(text(row.placeId, 160) ? { placeId: row.placeId } : {}), ...(unknownEnd ? { reason: '结束时间未知；规划保守地留到本次窗口结束。' } : {}) });
    }
    for (const row of rows(data.blocks)) {
      const planRefs = rows(data.acceptanceProposals).filter(unit => unit.kind === 'work' && unit.taskId === row.taskId && unit.segment === row.segment)
        .flatMap(unit => text(unit.arguments?.planRef?.planId, 160) && text(unit.arguments?.planRef?.blockId, 160) ? [{ planId: unit.arguments.planRef.planId as string, blockId: unit.arguments.planRef.blockId as string }] : []);
      const details: Partial<PlanningBlock> = { ...(text(row.placeId, 160) ? { placeId: row.placeId } : {}), ...(text(row.taskId, 160) ? { taskId: row.taskId } : {}), ...(planRefs.length ? { planRefs } : {}) };
      add('setup', '准备', row.reservedStart, row.start, details);
      add('work', text(row.title, 160) || '待商量的安排', row.start, row.end, details);
      add('cleanup', '收尾', row.end, row.reservedEnd, details);
    }
    for (const row of rows(data.transitions)) add('transition', row.travel?.minutes && row.restMinutes ? '转场与休息' : row.travel?.minutes ? '转场' : '休息', row.start, row.end,
      row.travel?.minutes && row.restMinutes ? { reason: `转场 ${Number(row.travel.minutes)} 分钟，休息 ${Number(row.restMinutes)} 分钟。` } : {});
    for (const row of rows(data.protectedWindows)) add('protected', '留白', row.start, row.end, { ...(text(row.reason) ? { reason: row.reason } : {}) });
    for (const row of rows(data.freeWindows)) add('free', '尚未安排', row.start, row.end, { ...(text(row.meaning) ? { reason: row.meaning } : {}) });
  } else {
    for (const row of [...rows(data.busy), ...rows(args?.busy)]) add('busy', text(row.title, 160) || '已有安排', row.start, row.end);
    for (const row of rows(data.windows)) add('free', '可商量的时间', row.start, row.end, {
      ...(Number.isFinite(row.usableMinutes?.min) && Number.isFinite(row.usableMinutes?.max) ? { usableMinutes: { min: row.usableMinutes.min, max: row.usableMinutes.max } } : {}),
      reason: '按已读取日程计算；可用分钟已扣去两侧转换，未证明现实空闲。',
    });
    for (const row of rows(data.alternatives)) conditions.push(...messages(row.unknown), ...messages(row.violations));
  }
  // Existing commitments remain calendar context. Every new reservation and
  // every displayed free interval must obey the same host scheduling domain.
  if (scheduleCoverage && blocks.some(block => block.kind !== 'busy' && (block.end === null
    || !scheduleCoverage!.windows.some(window => Date.parse(block.start) >= Date.parse(window.start)
      && Date.parse(block.end!) <= Date.parse(window.end))))) return;
  if (daySummaries.length) {
    const original = blocks.splice(0);
    for (const block of original) {
      if (block.end === null) { blocks.push(block); continue; }
      for (const day of daySummaries) {
        const start = Math.max(Date.parse(block.start), Date.parse(day.from));
        const end = Math.min(Date.parse(block.end || data.window.to), Date.parse(day.to));
        if (end <= start) continue;
        const clipped = start !== Date.parse(block.start) || end !== Date.parse(block.end || data.window.to);
        blocks.push({ ...block, id: clipped ? `${block.id}:${day.date}` : block.id,
          start: new Date(start).toISOString(), end: block.end === null ? null : new Date(end).toISOString(),
          ...(clipped ? { originalRange: { start: block.start, end: block.end } } : {}) });
      }
    }
  }
  blocks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  const adoption = data.adoption && typeof data.adoption === 'object' && text(data.adoption.status, 100)
    && Number.isInteger(data.adoption.totalSteps) && Number.isInteger(data.adoption.completedSteps)
    ? { status: data.adoption.status as string, blockers: messages(data.adoption.blockers), totalSteps: data.adoption.totalSteps as number, completedSteps: data.adoption.completedSteps as number } : undefined;
  const snapshotSource = source(result);
  if (instant(data.expiresAt) && (!snapshotSource.expiresAt || Date.parse(data.expiresAt) < Date.parse(snapshotSource.expiresAt))) snapshotSource.expiresAt = data.expiresAt;
  return { kind: 'planning', id: randomUUID(), revision: 1, createdAt: now, source: snapshotSource, mode: draft ? 'draft' : 'preview',
    window: { from: data.window.from, to: data.window.to, timeZone: data.window.timeZone }, blocks, requiredSourceIds, sourceCoverage,
    ...(scheduleCoverage ? { scheduleCoverage } : {}),
    ...(daySummaries.length ? { daySummaries } : {}),
    conditions: [...new Set(conditions)], unscheduled: rows(data.unscheduled).map(row => ({ title: text(row.title, 160) || text(row.taskId, 160) || '未安排的事', reason: text(row.reason, 1200) || text(row.message, 1200) || '这次尚未排入。' })),
    ...(adoption ? { adoption } : {}), ...(text(data.planId, 160) ? { planId: data.planId as string } : {}), ...(instant(data.expiresAt) ? { expiresAt: data.expiresAt } : {}), applied: false };
}

/** Hourly weather and air use separate scenes: unequal intervals/sources are never silently merged. */
export function environmentSnapshot(result: Result, capability: string, now: string): EnvironmentScene | undefined {
  if (result.sourceId !== 'weather:open-meteo' || !['fresh', 'partial'].includes(result.status)) return;
  const weather = capability === 'weather.lookup' ? weatherOutput.safeParse(result.data) : undefined;
  const air = capability === 'air_quality.lookup' ? airQualityOutput.safeParse(result.data) : undefined;
  const data = weather?.success ? weather.data : air?.success ? air.data : undefined;
  if (!data || !instant(data.window.from) || !instant(data.window.to)) return;
  const hourly = weather?.success ? weather.data.hourly : undefined;
  if (weather?.success && !hourly) return;
  const samples: EnvironmentScene['samples'] = hourly ? hourly.time.flatMap((at, index) => instant(at) ? [{ id: at, at,
    temperatureC: hourly.temperature_2m[index] ?? null, precipitationProbability: hourly.precipitation_probability[index] ?? null,
    precipitationMm: hourly.precipitation[index] ?? null, precipitationIntervalStart: hourly.precipitationIntervalStart[index], weatherCode: hourly.weather_code[index] ?? null }] : [])
    : air!.success ? air!.data.samples.flatMap(row => instant(row.at) ? [{ id: row.at, at: row.at, pm2_5: row.pm2_5, pm10: row.pm10, usAqi: row.us_aqi, europeanAqi: row.european_aqi }] : []) : [];
  if (!samples.length || new Set(samples.map(row => row.id)).size !== samples.length) return;
  return { kind: 'environment', id: randomUUID(), revision: 1, createdAt: now, source: source(result),
    domain: hourly ? 'weather' : 'air_quality', location: data.location, timeZone: data.timeZone,
    window: { from: data.window.from, to: data.window.to, complete: data.window.complete }, samples,
    limitations: data.limitations, forecastIssuedAt: null, userLocation: false };
}
