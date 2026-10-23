import { createHash, randomUUID } from 'node:crypto';
import type { CampusGpaScale, CampusRecord, CampusScene } from '../../shared/scenes';
import { campusQueryContinuation, validateCampusQuery } from '../capabilities/campus-query';

const text = (value: unknown, max = 400): string | undefined => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const object = (value: unknown): Record<string, unknown> | undefined => !!value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
// select(fields=['gpa.fivePoint']) returns that exact dotted field name. quick
// returns the original nested object. Both are the connector's named fields.
const named = (value: Record<string, unknown>, path: string): unknown => Object.hasOwn(value, path) ? value[path]
  : path.split('.').reduce<unknown>((at, part) => object(at)?.[part], value);
const scales: CampusGpaScale[] = ['fivePoint', 'fourPoint', 'fourPointLegacy', 'hundredPoint'];
const policyNames: Record<string, string> = { all_attempts: '全部修读', first_attempt: '首次修读', highest_attempt: '最高成绩', repository_first_response: '来源首条记录' };
const domains = new Set(['grades', 'gpa_semesters', 'gpa_overall', 'gpa_cumulative']);
export const isAcademicCampus = (scene: CampusScene) => domains.has(scene.domain);

/** Display only the actual normalized grade/transcript fields. In particular,
 * this does not recompute GPA, choose retakes, fill missing values with zero,
 * merge semesters, or promote an analytical policy to a school decision. */
export function campusAcademicSnapshot(result: { status: string; sourceId: string; data?: unknown; fetchedAt?: string;
  expiresAt?: string; coverage?: { complete?: boolean } }, capability: string, raw: unknown, now: string): CampusScene | undefined {
  const request = object(raw), data = object(result.data), query = capability === 'campus.query';
  if (!request || !data || result.sourceId !== 'campus:zju-account' || !['fresh', 'partial', 'stale'].includes(result.status)) return;
  const spec = object(request.spec), requested = query ? request.resource || spec?.resource : request.domain;
  const domain = requested === 'gpa' ? 'gpa_overall' : requested;
  if (typeof domain !== 'string' || !domains.has(domain) || !Array.isArray(data.records)) return;
  if (query && (!['quick', 'select'].includes(String(request.operation)) || spec?.operation && spec.operation !== 'select'
    || spec?.join || Array.isArray(spec?.resources) && spec.resources.length || Array.isArray(spec?.metrics) && spec.metrics.length
    || Array.isArray(spec?.group_by) && spec.group_by.length)) return;
  if (!query && (capability !== 'campus.lookup' || data.origin !== 'zju_account')) return;
  if (data.resource && data.resource !== requested && data.resource !== domain || data.domain && data.domain !== requested && data.domain !== domain) return;
  const rows: CampusRecord[] = [], usedIds = new Set<string>();
  for (const [index, value] of data.records.slice(0, 100).entries()) {
    const record = object(value); if (!record) continue;
    const originalId = text(record.id, 240), term = text(record.semester_id, 80), through = text(record.through_semester, 80), policy = text(record.policy, 120);
    const naturalKey = domain === 'grades' ? originalId : domain === 'gpa_semesters' ? term : domain === 'gpa_cumulative' ? through : policy;
    const base = text(naturalKey, 160) || `returned-row:${index}`;
    const id = usedIds.has(base) ? `${index}:${base}` : base; usedIds.add(id);
    const credit = number(record.credit);
    if (domain === 'grades') {
      const title = text(record.name, 200); if (!title) continue;
      const original = text(record.original, 100) ?? null, point = number(record.fivePoint);
      rows.push({ id, title, ...(originalId ? { sourceRecordId: originalId } : {}), ...(term ? { term } : {}),
        ...(credit === null ? {} : { credit }), grade: { original, fivePoint: point,
          ...Object.fromEntries((['fourPoint', 'fourPointLegacy', 'hundredPoint'] as const).filter(field => Object.hasOwn(record, field)).map(field => [field, number(record[field])])),
          included: typeof record.gpaIncluded === 'boolean' ? record.gpaIncluded : null,
          ...(text(record.gpa_exclusion_reason, 600) ? { exclusionReason: text(record.gpa_exclusion_reason, 600) } : {}),
          ...(text(record.course_code, 100) ? { courseCode: text(record.course_code, 100) } : {}),
          ...(text(record.hundredPoint_kind, 100) ? { hundredPointKind: text(record.hundredPoint_kind, 100) } : {}),
          ...(Array.isArray(record.quality_issues) ? { qualityIssues: record.quality_issues.flatMap(issue => text(issue, 200) ? [text(issue, 200)!] : []).slice(0, 20) } : {}) } });
      continue;
    }
    const values = Object.fromEntries(scales.filter(scale => object(record.gpa) && Object.hasOwn(object(record.gpa)!, scale)
      || Object.hasOwn(record, `gpa.${scale}`)).map(scale => [scale, number(named(record, `gpa.${scale}`))]));
    if (!Object.keys(values).length) continue;
    rows.push({ id, title: domain === 'gpa_semesters' ? term || '来源未标学期' : domain === 'gpa_cumulative'
      ? through ? `截至 ${through}` : '来源未标累计范围' : policy ? policyNames[policy] || policy : '来源未标口径',
      ...(term ? { term } : {}), gpa: { values, denominator: number(record.gpa_credit_denominator),
        ...(count(record.eligible_attempts) === undefined ? {} : { eligibleAttempts: count(record.eligible_attempts) }),
        ...(count(record.counted_attempts) === undefined ? {} : { countedAttempts: count(record.counted_attempts) }),
        ...(Array.isArray(record.excluded_attempts) ? { excludedAttempts: record.excluded_attempts.length } : {}),
        ...(Array.isArray(record.incomplete_attempts) ? { incompleteAttempts: record.incomplete_attempts.length } : {}),
        ...(typeof record.complete === 'boolean' ? { complete: record.complete } : {}),
        ...(typeof record.source_complete === 'boolean' ? { sourceComplete: record.source_complete } : {}),
        ...(policy ? { policy } : domain !== 'gpa_overall' ? { policy: 'all_attempts' } : {}),
        ...(text(record.formula, 500) ? { formula: text(record.formula, 500) } : {}), ...(through ? { throughTerm: through } : {}) } });
  }
  if (!rows.length) return;
  const total = count(data.total_matches ?? data.total), rowTerms = [...new Set(rows.flatMap(row => row.term || row.gpa?.throughTerm || []))],
    term = rowTerms.length === 1 ? rowTerms[0] : undefined;
  const nextOffset = data.next_offset ?? data.nextOffset, offset = count(nextOffset);
  let next: Record<string, unknown> | undefined;
  if (query) {
    try { next = campusQueryContinuation(validateCampusQuery(request), data)?.arguments; }
    catch { /* An invalid original query is not a new read address. */ }
  } else if (offset !== undefined && offset > (count(request.offset) || 0)) next = { ...request, offset, refresh: false };
  const fetchedAt = text(result.fetchedAt, 100) && Number.isFinite(Date.parse(result.fetchedAt!)) ? result.fetchedAt! : '';
  return { kind: 'campus', id: randomUUID(), revision: 1, createdAt: now, domain: domain as CampusScene['domain'],
    source: { sourceId: result.sourceId, fetchedAt, expiresAt: result.expiresAt,
      version: createHash('sha256').update(JSON.stringify({ sourceId: result.sourceId, fetchedAt, data })).digest('hex'), coverage: result.coverage },
    sourceLabel: '浙江大学校园资料', origin: 'zju_account', records: rows, ...(term ? { term } : {}), ...(total === undefined ? {} : { total }),
    complete: result.coverage?.complete === true && rows.length === data.records.length && nextOffset == null && (total === undefined || total === rows.length),
    requiredGrants: ['campus:read', domain === 'grades' ? 'campus:grades:read' : 'campus:gpa:read'],
    academicDisplay: { mode: rows.length === 1 ? 'detail' : 'table', scale: scales.find(scale => rows.some(row => row.gpa
      ? Object.hasOwn(row.gpa.values, scale) : row.grade && Object.hasOwn(row.grade, scale))) || 'fivePoint' }, resultStatus: result.status as 'fresh' | 'partial' | 'stale',
    academicRead: { capability: query ? 'campus.query' : 'campus.lookup', arguments: { ...request, refresh: false,
      ...(query && typeof data.bundle_id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(data.bundle_id) ? { bundleId: data.bundle_id } : {}) } },
    ...(data.snapshotProof ? { academicSnapshotProof: data.snapshotProof } : {}),
    ...(next ? { continuation: { capability: query ? 'campus.query' : 'campus.lookup', arguments: next } } : {}) };
}
