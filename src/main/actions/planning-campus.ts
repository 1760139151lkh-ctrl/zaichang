import { createHash } from 'node:crypto';
import { HarnessError, type ScopeData } from '../../shared/harness';
import type { ZjuAdapter } from '../zjuAdapter';
import type { CampusSnapshotProof } from '../capabilities/campus-saved-source';
import { validateCampusQuery, type CampusQuery } from '../capabilities/campus-query';
import { canonical, dateInZone } from '../runtime/semantics';
import type { PlanningDraftRequest } from './planning-intent-contract';
import type { CampusScheduleBlock, CampusScheduleQuality } from '../../shared/campus-calendar';

export interface PlanningCampusConstraints {
  sourceId: 'campus:zju-account'; version: string; proofs: CampusSnapshotProof[];
  busy: PlanningDraftRequest['busy']; coverage: PlanningDraftRequest['sourceCoverage'][number];
  items: CampusScheduleBlock[]; scheduleQuality: CampusScheduleQuality[];
  issues: string[]; cancelledCount: number; pendingCount: number;
}
export interface PlanningCampusPort {
  read(scope: ScopeData, from: string, to: string, signal: AbortSignal): Promise<PlanningCampusConstraints | null>;
  current(scope: ScopeData, snapshot: PlanningCampusConstraints): boolean;
  currentVersion(scope: ScopeData, version: string): boolean;
}
export function campusConstraintSummary(campus: PlanningCampusConstraints) {
  return { sourceId: campus.sourceId, version: campus.version, readOnly: true, live: false,
    coverage: campus.coverage, snapshots: campus.proofs.map(proof => ({ bundleId: proof.bundleId, resource: proof.resource, version: proof.version, selection: proof.selection,
      collectedAt: proof.collectedAt, sourceFetchedAt: proof.sourceFetchedAt, coverage: proof.coverage, original: proof.original })),
    scheduleQuality: campus.scheduleQuality,
    cancelledCount: campus.cancelledCount, pendingCount: campus.pendingCount, issues: campus.issues,
    meaning: '课程和考试只作为当前保存快照的时间约束；没有复制进本机日历，不代表出席，也不证明剩余时段本人有空。校历校核状态与未来调课风险仍保留，快照改变须重新试算。' };
}
const sourceId = 'campus:zju-account' as const;
const instant = (raw: unknown): string | undefined => typeof raw === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)
  && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : undefined;

/** Use the connector's academic-year/long-term convention for the requested
 * window, then let its real calendar coverage retain any inter-term gaps. */
function academicWindows(from: string, to: string) {
  const end = Date.parse(to), result: { from: string; to: string; academicYear: string; term: '1' | '2' }[] = [];
  for (let cursor = Date.parse(from); cursor < end;) {
    const date = dateInZone(new Date(cursor).toISOString(), 'Asia/Shanghai'), year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
    const startYear = month >= 8 ? year : year - 1, term = month >= 8 || month === 1 ? '1' : '2';
    const boundary = Date.UTC(startYear + 1, term === '1' ? 1 : 7, 1) - 8 * 3600000;
    const next = Math.min(end, boundary);
    result.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString(), academicYear: `${startYear}-${startYear + 1}`, term });
    cursor = next;
  }
  return result;
}

/** Consume the connector's normalized records. Campus occurrences remain
 * constraints of the same planner, never copied into the local calendar. */
export async function readCampusPlanningConstraints(adapter: ZjuAdapter, scope: ScopeData, from: string, to: string,
  signal: AbortSignal, validate: () => void): Promise<PlanningCampusConstraints | null> {
  if (!scope.sources.includes(sourceId) || !scope.grants.includes('campus:read') || !adapter.describe().available) return null;
  if (!(Date.parse(to) > Date.parse(from)) || Date.parse(to) - Date.parse(from) > 32 * 86400000)
    throw new HarnessError('planning_campus_window', '校园安排需要有效的有界时间窗，请一次查看至多32天。');
  const proofs: CampusSnapshotProof[] = [], issues: string[] = [], scheduleQuality: CampusScheduleQuality[] = [];
  const groups = new Map<string, Record<string, any>[]>();
  const firstDate = dateInZone(from, 'Asia/Shanghai'), lastDate = dateInZone(new Date(Date.parse(to) - 1).toISOString(), 'Asia/Shanghai');
  const inDateWindow = (row: Record<string, any>) => {
    const date = [row.date, row.original_date, row.actual_date, row.dateLabel]
      .find(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
    return !date || date >= firstDate && date <= lastDate;
  };
  for (const window of academicWindows(from, to)) {
    let bundleId: string | undefined;
    const load = async (resource: 'classes' | 'exams' | 'cancelled_classes' | 'calendar_pending', spec: NonNullable<CampusQuery['spec']>) => {
      const records: Record<string, any>[] = [];
      let offset = 0;
      while (true) {
        signal.throwIfAborted(); validate();
        const result = await adapter.query(validateCampusQuery({ operation: 'select', resource, bundleId, academicYear: window.academicYear,
          term: window.term, offset, limit: 50, spec: { ...spec, resource, operation: 'select', offset, limit: 50 } }), signal);
        signal.throwIfAborted(); validate();
        const proof = result.snapshotProof as CampusSnapshotProof | undefined;
        if (!proof || proof.resource !== resource || !adapter.isCurrentSnapshot(proof) || bundleId && proof.bundleId !== bundleId) {
          issues.push(`${resource}没有可复核的同一校园快照；未把缺少资料当作没有安排。`); break;
        }
        bundleId ||= proof.bundleId;
        if (!proofs.some(value => value.version === proof.version && value.resource === proof.resource)) proofs.push(proof);
        const rows = Array.isArray(result.records) ? result.records : Array.isArray(result.result) ? result.result : [];
        records.push(...rows.filter((row: unknown) => !!row && typeof row === 'object' && !Array.isArray(row)));
        if (typeof result.unknown_time_records === 'number' && result.unknown_time_records > 0)
          issues.push(`${resource}存在未能定位时刻的记录，当前窗口仍有未核清的安排。`);
        if (!['ok', 'fresh', 'not_found'].includes(String(result.status)) || result.coverage?.complete !== true)
          issues.push(`${resource}仅覆盖本次保存快照中的部分记录，当前未读范围仍未知。`);
        const next = result.next_offset;
        if (next == null) {
          if (typeof result.total_matches === 'number' && offset + rows.length < result.total_matches)
            issues.push(`${resource}还有未读取记录，未省略后声明完整。`);
          break;
        }
        if (!Number.isSafeInteger(next) || next <= offset || records.length >= 2000) {
          issues.push(`${resource}的完整分页超出本次安排读取边界，需要缩小范围后继续；没有截尾当作完整。`); break;
        }
        offset = next;
      }
      return records;
    };
    for (const resource of ['classes', 'exams', 'cancelled_classes', 'calendar_pending'] as const) {
      const timed = resource === 'classes' || resource === 'exams';
      const records = await load(resource, { resource, ...(timed ? { time: { from: window.from, to: window.to, mode: 'overlap' as const } } : {}) });
      // The connector's overlap query treats a missing end as an instant.
      // Read these exact same-source rows too, so a prior start cannot vanish
      // before the planner conservatively preserves its unknown end.
      if (timed) records.push(...await load(resource, { resource, where: { field: 'endTime', op: 'missing' } }));
      groups.set(resource, [...(groups.get(resource) || []), ...records]);
    }
    const classes = proofs.find(proof => proof.resource === 'classes' && proof.bundleId === bundleId);
    if (classes) {
      signal.throwIfAborted(); validate();
      try {
        const quality = await adapter.readPlanningQuality(classes, signal);
        signal.throwIfAborted(); validate();
        scheduleQuality.push({ bundleId: classes.bundleId, ...quality });
        if (quality.status !== 'ok' || !quality.generatedAllResolvableRules || quality.unresolvedRuleCount > 0)
          issues.push('校园快照有未能展开的课程规则或日程生成质量尚未读全，不能据此确认空档。');
      } catch (error) {
        signal.throwIfAborted(); validate();
        if (!adapter.isCurrentSnapshot(classes)) throw error;
        scheduleQuality.push({ bundleId: classes.bundleId, status: 'unavailable' });
        issues.push('当前不能回读校园快照的日程生成质量，未把未展开的课次当作空档。');
      }
    } else issues.push('尚未取得课程快照的日程生成质量，不能确认完整空档。');
  }
  signal.throwIfAborted(); validate();
  if (proofs.some(proof => !adapter.isCurrentSnapshot(proof)))
    throw new HarnessError('planning_campus_changed', '读取途中校园快照或账号已改变，这次旧结果没有交付，请重新读取。');
  const cancellationKey = (rule: unknown, date: unknown) => typeof rule === 'string' && typeof date === 'string' ? canonical([rule, date]) : undefined;
  const cancelledRows = groups.get('cancelled_classes') || [];
  const cancelled = new Set(cancelledRows.flatMap(row => {
    const key = cancellationKey(row.session_uid, row.original_date); return key ? [key] : [];
  }));
  const cancellationsInWindow = new Set(cancelledRows.filter(inDateWindow).map(row => canonical([row.session_uid, row.original_date])));
  const pending = [...new Map((groups.get('calendar_pending') || []).filter(inDateWindow).map(row => [canonical(row), row])).values()];
  if (pending.length) issues.push('校园快照仍有待公布或无法落到精确时刻的安排；不能把未给时间当作可用空档。');
  const itemMap = new Map<string, CampusScheduleBlock>();
  for (const [resource, records] of groups) {
    if (resource !== 'classes' && resource !== 'exams') continue;
    for (const row of records) {
      const start = instant(row.startTime), end = instant(row.endTime);
      if (start && (Date.parse(start) >= Date.parse(to) || end && Date.parse(end) <= Date.parse(from))) continue;
      const cancelledKey = cancellationKey(row.fromUid || row.session_uid || row.uid, row.original_date || (start ? dateInZone(start, 'Asia/Shanghai') : undefined));
      if (row.status === 'cancelled' || row.status === 'canceled' || resource === 'classes' && cancelledKey && cancelled.has(cancelledKey)) {
        if (inDateWindow(row)) cancellationsInWindow.add(cancelledKey || canonical([resource, row.uid, row.id, start]));
        continue;
      }
      if (!start) { issues.push(`${resource}存在未能定位开始时刻的安排，不能据此确认空档。`); continue; }
      if (end && Date.parse(end) <= Date.parse(start)) { issues.push(`${resource}存在不能核对的起止时间。`); continue; }
      if (!end) issues.push(`${resource}存在结束时刻未知的安排，按本次窗口末端保守保留。`);
      const title = typeof (row.summary || row.name) === 'string' ? String(row.summary || row.name).slice(0, 160) : resource === 'classes' ? '课程安排' : '考试安排';
      const identity = [row.uid || row.id || null, row.fromUid || row.session_uid || null, row.type || null, title, start, end || null, row.dateLabel || null, row.location || null];
      const id = 'campus:' + createHash('sha256').update(canonical([resource, identity])).digest('hex');
      itemMap.set(id, { id, kind: resource === 'classes' ? 'class' : 'exam', title, start, end: end || null,
        ...(typeof row.location === 'string' && row.location ? { location: row.location.slice(0, 300) } : {}),
        ...(typeof row.time_precision === 'string' ? { timePrecision: row.time_precision.slice(0, 80) } : {}) });
    }
  }
  const version = adapter.bindPlanningSnapshots(proofs);
  if (proofs.length && !version) throw new HarnessError('planning_campus_changed', '校园保存快照已经改变，请重新读取后试算。');
  const currentVersion = version || createHash('sha256').update(canonical([])).digest('hex');
  const reasons = [...new Set(issues)], items = [...itemMap.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  return { sourceId, version: currentVersion, proofs, items, scheduleQuality,
    busy: items.map(item => ({ start: item.start, end: item.end, sourceId, sourceVersion: currentVersion, title: item.title })), issues: reasons,
    cancelledCount: cancellationsInWindow.size, pendingCount: pending.length,
    coverage: { sourceId, sourceVersion: currentVersion, status: reasons.length ? 'partial' : 'complete',
      reason: reasons.length ? '校园安排还有覆盖或时间未核清，须先补齐；没有把缺少资料当作空档。'
        : '仅为本人账号当前保存快照内的课程、考试和校历例外；不是出席记录、实时校方确认或本人一定有空。' } };
}
