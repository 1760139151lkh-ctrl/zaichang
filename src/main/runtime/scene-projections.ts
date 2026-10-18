import { createHash, randomUUID } from 'node:crypto';
import { weatherOutput } from '../capabilities/weather';
import { airQualityOutput } from '../capabilities/air-quality';
import type { EnvironmentScene, PlanningBlock, PlanningScene, SceneSource } from '../../shared/scenes';

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
    ...(!rows(args?.sourceCoverage).length ? ['其他日程来源尚未声明覆盖，日历留白不能证明现实空闲。'] : []),
    ...(rows(data.issues).length ? ['有未展开或结束时间未知的安排，留白须结合原记录核对。'] : [])];
  const draft = capability === 'planning.draft';
  if (draft) {
    for (const row of rows(data.fixedCommitments)) {
      const unknownEnd = rows(data.issues).some(issue => issue.status === 'unknown_end' && issue.startsAt === row.start)
        || rows(args?.busy).some(item => item.end === null && item.sourceId === row.id && item.start === row.start);
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
      { reason: `转场 ${Number(row.travel?.minutes) || 0} 分钟，休息 ${Number(row.restMinutes) || 0} 分钟。` });
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
  blocks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  const adoption = data.adoption && typeof data.adoption === 'object' && text(data.adoption.status, 100)
    && Number.isInteger(data.adoption.totalSteps) && Number.isInteger(data.adoption.completedSteps)
    ? { status: data.adoption.status as string, blockers: messages(data.adoption.blockers), totalSteps: data.adoption.totalSteps as number, completedSteps: data.adoption.completedSteps as number } : undefined;
  const snapshotSource = source(result);
  if (instant(data.expiresAt) && (!snapshotSource.expiresAt || Date.parse(data.expiresAt) < Date.parse(snapshotSource.expiresAt))) snapshotSource.expiresAt = data.expiresAt;
  return { kind: 'planning', id: randomUUID(), revision: 1, createdAt: now, source: snapshotSource, mode: draft ? 'draft' : 'preview',
    window: { from: data.window.from, to: data.window.to, timeZone: data.window.timeZone }, blocks, requiredSourceIds, sourceCoverage,
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
