import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import type { CampusMapAdapter } from '../mapService';
import type { TiyiAdapter } from '../tiyiAdapter';
import type { WorkoutSummaryOwner } from './workout';
import { CAMPUS_ACCOUNT_SOURCE_ID, type ZjuAdapter, type CampusDomain } from '../zjuAdapter';
import type { DomainService } from '../storage/domains';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from '../runtime/policy';
import type { CapabilityBroker, CapabilityDefinition, CapabilityProvider, CapabilityResult } from './broker';
import { HarnessError, type KnowledgeStatus } from '../../shared/harness';
import { calendarFieldsSchema, localCalendarChangeSchema } from '../../shared/calendar';
import { expandAgenda, localStamp } from '../actions/calendar';
import { campusQueryInput, validateCampusQuery, requireCampusQueryScope, campusQueryContinuation, campusLookupReadsCourseGrades, examCourseRecordsPointer } from './campus-query';
import { calendarCommitment, planningPreviewInput, previewCalendarPlan, planningDraftInput } from '../actions/planning';
import { planningRecoveryInput, type PlanningApplicationService } from '../actions/planning-application';
import { readCampusPlanningConstraints, campusConstraintSummary } from '../actions/planning-campus';
import { planningIntentReplanInput, type PlanningIntentService } from '../runtime/planning-intents';
import { compareCalendarPlans, planningComparisonInput, planningComparisonView } from '../actions/planning-comparison';
import { weatherInput, weatherOutput, weatherRequest, weatherResult } from './weather';
import { airQualityInput, airQualityOutput, airQualityRequest, airQualityResult } from './air-quality';
import { dateInZone, dayBounds } from '../runtime/semantics';
import { projectMapSearchPoint } from '../runtime/map-model-view';

export interface BuiltinConnections {
  map?: CampusMapAdapter;
  campus?: ZjuAdapter;
  tiyi?: TiyiAdapter;
  workout?: WorkoutSummaryOwner;
  weatherEnabled: () => boolean;
}
const jsonObject = z.record(z.string(), z.json());
function projectWalkingSearchPoint(point: Parameters<typeof projectMapSearchPoint>[0]) {
  const projected = projectMapSearchPoint(point);
  // Search delivers place and walking facts. The complete map retains its
  // rendering prescriptions, approximate volumes and visual audit notes.
  const fields = ['id', 'displayName', 'aliases', 'kind', 'scope', 'graphNodeId', 'roadReference',
    'source', 'geometryStatus', 'historicalReference', 'undergroundStation', 'entrances', 'accessSummary',
    'accessReviewBasis', 'nearbyRoadReferences', 'coordinate', 'coordinateMeaning', 'officialIds', 'legacyIds', 'sourceCorrection'];
  const accessCount = point.accessCandidates?.length ?? point.entrances.filter(entrance => entrance.connected).length;
  return { ...Object.fromEntries(fields.flatMap(key => projected[key] !== undefined ? [[key, projected[key]]] : [])),
    walkingEndpoint: {
      role: point.kind === 'water' ? 'browse_only' : point.undergroundStation ? 'station_entrance'
        : point.roadReference ? 'road_point' : accessCount ? 'place_with_access_candidates' : 'place_reference_only',
      hasAccessCandidates: accessCount > 0,
      meaning: point.kind === 'water' ? '这里标的是水面；步行路线可以另外选附近的桥或道路点。'
        : !accessCount ? '当前资料还没有给出可用接入，具体原因与附近道路点保留在结果中。'
          : point.undergroundStation ? '步行路线按已记录地铁出入口计算，进站和站内换乘另算。'
            : '接入方式、估计距离和通行条件见所列入口与候选，具体走法由路线返回。',
    },
  };
}
const campusDomains = [
  'schedule',
  'courses',
  'learning_courses',
  'exams',
  'assignments',
  'grades',
  'gpa',
  'gpa_semesters',
  'gpa_cumulative',
  'retakes',
  'practice',
  'projects',
  'activities',
  'sports',
  'reservations',
  'reservation_violations',
  'card',
  'transactions',
  'profile',
  'roles',
  'calendar_pending',
  'cancelled_classes',
  'holidays',
  'source_status',
  'places',
  'rules',
] as const;
export const campusInput = z
  .object({
    domain: z.enum(campusDomains).describe('要读的资料类别。单学期课程与成绩用filters选择来源中的semester_id；academicYear/term选择采集时期。sports会带回体育资料的可读入口，导入的旧体育材料用campus.imported_lookup。'),
    courseId: z.string().regex(/^\d{1,32}$/).optional(),
    academicYear: z.string().regex(/^20\d{2}-20\d{2}$/).optional().describe('选择采集快照的学年；其中课程和成绩仍可能跨多个学期，行范围另看semester_id筛选。'),
    term: z.enum(['1', '2']).optional().describe('选择采集快照的学期；单学期课程/成绩使用filters的semester_id:eq:来源中的学期ID。成绩呈现也可用同源Scene的campusDisplay.semesterId。'),
    query: z.string().max(100).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    at: z.string().datetime({ offset: true }).optional(),
    timeMode: z.enum(['overlap', 'starts', 'contained']).optional(),
    fields: z
      .array(z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/))
      .max(24)
      .optional(),
    filters: z.array(z.string().max(160)).max(6).optional().describe('按来源字段筛选，格式field:operator:value，多项条件同时满足。单学期用semester_id:eq:原记录里的学期ID，返回的清单与画面会一起采用这份筛选。'),
    sort: z.string().max(100).optional(),
    offset: z.number().int().min(0).max(10000).optional(),
    bundleId: z.string().regex(/^[a-f0-9]{32}$/).optional().describe('沿原读取地址继续同一快照；与refresh是不同查询。'),
    expectedSnapshotVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    window: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(50).default(12),
    refresh: z.boolean().default(false).describe('通常读已保存资料。确需更新时填true，学业资料会沿同账号、同学期已有资料更新相关部分；缺少可接续的旧资料时会说明缺口。翻下一页保持false，保留上一页的资料地址。'),
  })
  .strict();
const campusOverviewInput = z
  .object({
    refresh: z.boolean().default(false).describe('true重新采集整份学业资料，其中包括成绩；includeSensitiveDomains选择这次展示的类别。'),
    includeSensitiveDomains: z.boolean().default(false),
    academicYear: z.string().regex(/^20\d{2}-20\d{2}$/).optional(),
    term: z.enum(['1', '2']).optional(),
  })
  .strict();
const campusAuthentication = z.object({
  mode: z.enum(['saved_snapshot', 'live_session']), accountBinding: z.literal('current_local_account'),
  ssoCheck: z.enum(['not_performed', 'performed', 'reused']),
  verifiedAt: z.string().optional(), lastSsoVerifiedAt: z.string().optional(),
}).strict();
const campusAccountOutput = z
  .object({
    domain: z.string(),
    records: z.array(jsonObject),
    conflicts: z.array(jsonObject).optional(),
    source: z.string(),
    institutionId: z.string(),
    termId: z.string(),
    termIdMeaning: z.literal('snapshot_collection_period').optional(),
    recordSelection: z.object({ filters: z.array(z.string()), sort: z.string().optional(),
      semester: z.enum(['no_semester_predicate', 'semester_predicate_provided']) }).strict().optional(),
    courseRecords: jsonObject.optional(),
    live: z.boolean(),
    origin: z.literal('zju_account'),
    authenticated: z.boolean(),
    authentication: campusAuthentication.optional(),
    total: z.number().int().nonnegative().optional(),
    cached: z.boolean(),
    snapshotAt: z.string().optional(),
    bundleId: z.string().optional(),
    nextOffset: z.number().int().nonnegative().nullable().optional(),
    offset: z.number().int().nonnegative().optional(),
    unknownTimeRecords: z.number().int().nonnegative().optional(),
    sourceCoverage: jsonObject.optional(),
    timeInterval: jsonObject.optional(),
    evaluatedAt: z.string().optional(),
    snapshotProof: jsonObject.optional(),
    snapshotProofs: z.array(jsonObject).optional(),
    truncated_for_model: z.boolean().optional(),
    nested_values_truncated: z.boolean().optional(),
  })
  .strict();
const campusNavigationOutput = z.object({
  kind: z.literal('navigation_required'), domain: z.string(), recordRead: z.literal(false),
  resource: z.string().optional(), bundleId: z.string().optional(), offset: z.number().int().nonnegative().optional(),
  expectedSnapshotVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  total: z.number().int().nonnegative().optional(), authentication: campusAuthentication.optional(),
  snapshotProof: jsonObject.optional(), truncated_for_model: z.boolean().optional(), nested_values_truncated: z.boolean().optional(),
}).strict();
const campusImportOutput = z
  .object({
    domain: z.string(),
    records: z.array(jsonObject),
    materialVersions: z.array(jsonObject).optional(),
    conflicts: z.array(jsonObject).optional(),
    source: z.string(),
    institutionId: z.string(),
    termId: z.string(),
    live: z.literal(false),
    origin: z.literal('legacy_import'),
    authenticated: z.literal(false),
    total: z.number().int().nonnegative().optional(),
    totalMeaning: z.enum(['matching_retained_records', 'matching_records_within_source_limit']).optional(),
    offset: z.number().int().nonnegative().optional(),
    nextOffset: z.number().int().nonnegative().nullable().optional(),
    snapshotVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    continuation: jsonObject.optional(),
    sourceRead: z.object({ limit: z.literal(6000), returned: z.number().int().nonnegative(), limitReached: z.boolean(), meaning: z.string() }).strict().optional(),
    truncated_for_model: z.boolean().optional(),
    cached: z.literal(true),
    snapshotAt: z.string().optional(),
  })
  .strict();
export const localActionInput = z
  .object({
    ...calendarFieldsSchema.shape,
    title: z.string().min(1).max(160),
    detail: z.string().max(1500).default('').describe('安排需要的补充内容，照对方实际交代的填写；没有时留空。'),
    startsAt: z.string().datetime({ offset: true }).optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    demo: z.boolean().optional(),
    planRef: z.object({ planId: z.string().min(1).max(160), blockId: z.string().min(1).max(160) }).strict().optional().describe('沿planning.draft的原安排保存时，复制它返回的完整地址。'),
  })
  .strict();
const base = (
  name: string,
  input: z.ZodType,
  output: z.ZodType,
  requiredScopes: string[],
  extra: Partial<CapabilityDefinition> = {},
): CapabilityDefinition => ({
  name,
  version: '1',
  input,
  output,
  effect: 'read',
  requiredScopes,
  subjects: ['self'],
  worlds: ['real', 'scenario'],
  timeoutMs: 15000,
  maxBytes: 80000,
  supportsIdempotency: false,
  supportsInspect: false,
  supportsCancel: false,
  cacheScope: 'equivalent',
  ...extra,
});
const manifest = (
  id: string,
  sourceId: string,
  capabilities: CapabilityDefinition[],
  egressHosts: string[] = [],
): CapabilityProvider['manifest'] => ({
  id,
  sourceId,
  version: '1',
  capabilities,
  egressHosts,
  platforms: ['*'],
  simulated: false,
  trust: 'bundled_reviewed',
  offline: 'read_cache',
  license: 'project-owned adapter; underlying sources retain original licenses',
});
function statusOf(value: any): KnowledgeStatus {
  if (value?.status === 'conflict') return 'conflict';
  if (value?.stale || value?.freshness?.stale) return 'stale';
  if (value?.status === 'forbidden' || value?.status === 'auth_required') return 'forbidden';
  if (value?.status === 'unavailable' || value?.status === 'unsupported') return 'unsupported';
  if (value?.status === 'error' || value?.status === 'failed') return 'failed';
  if (value?.status === 'conflict') return 'conflict';
  if (
    value?.status === 'partial' || value?.status === 'navigate_required' ||
    ['ok', 'fresh'].includes(String(value?.status)) && (value?.coverage?.complete === false || value?.completeness?.complete === false)
  )
    return 'partial';
  return ['ok', 'fresh'].includes(String(value?.status))
    ? 'fresh'
    : value?.status === 'not_found'
      ? 'not_found'
      : 'unknown';
}
function sourceObservationAt(value: any): string | undefined {
  const mapped = value?.coverage?.source_fetched_at;
  const candidates = [
    value?.fetched_at,
    value?.collected_at,
    ...(mapped && typeof mapped === 'object' ? Object.values(mapped) : []),
  ]
    .filter((item): item is string => typeof item === 'string' && Number.isFinite(Date.parse(item)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return candidates[0];
}
/** Only a successful page of a complete, source-bound connector query gets
 * a page-delivery mark. An empty partial/auth response is not such a page. */
function campusPageCoordinates(result: any, expectedOffset: number): boolean {
  return !(!Array.isArray(result.records) || result.records.some((row: unknown) => !row || typeof row !== 'object' || Array.isArray(row))
    || !Number.isSafeInteger(result.offset) || result.offset !== expectedOffset
    || result.offset < 0
    || !Number.isSafeInteger(result.total_matches) || result.total_matches < result.offset + result.records.length
    || result.next_offset === null && result.total_matches !== result.offset + result.records.length
    || result.next_offset !== null && (!Number.isSafeInteger(result.next_offset)
      || result.next_offset !== result.offset + result.records.length || result.next_offset <= result.offset || result.next_offset >= result.total_matches));
}
function campusPageDelivery(campus: ZjuAdapter, result: any, expectedOffset: number): CapabilityResult['delivery'] {
  if (result.status !== 'ok' || result.coverage?.complete !== true || result.completeness?.complete === false
    || result.nested_values_truncated === true || result.truncated_for_model === true
    || Array.isArray(result.coverage.issues) && result.coverage.issues.length
    || !campusPageCoordinates(result, expectedOffset)
    || !result.snapshotProof || result.snapshotProof.bundleId !== result.bundle_id
    || result.snapshotProof.resource !== result.resource || !campus.captureReadingProof?.(result.snapshotProof)) return;
  return { kind: 'page', complete: true };
}
function examCourseRecordsNavigation(campus: ZjuAdapter, result: any) {
  const proof = result.snapshotProof;
  if (result.recordKind === 'exam_course_record' || !['ok', 'partial'].includes(result.status)
    || !proof || proof.resource !== 'exams' || proof.bundleId !== result.bundle_id || !campus.captureReadingProof(proof)) return;
  return { recordRead: false, model: 'exam_course_record',
    read: { capability: 'campus.query', arguments: { operation: 'read', resource: 'exams',
      bundleId: proof.bundleId, expectedSnapshotVersion: proof.version, pointer: examCourseRecordsPointer,
      offset: 0, limit: 8, refresh: false } },
    meaning: '还有一份按课程保存的考试资料，可能能找到没写考试时间的科目。沿这个地址打开，它有自己的分页与科目范围；旧资料里若缺这一部分，读取时会说明。' };
}
export function calendarLocalTimes(item: Record<string, unknown>, fallbackTimeZone: string): Record<string, unknown> {
  const timeZone = typeof item.timeZone === 'string' ? item.timeZone : fallbackTimeZone;
  if (typeof item.startsAt !== 'string') return item.allDayDate ? { ...item, timeZone } : item;
  const endsAt = typeof item.endsAt === 'string' ? item.endsAt : item.endsAt !== null && typeof item.durationMinutes === 'number'
    ? new Date(Date.parse(item.startsAt) + item.durationMinutes * 60000).toISOString() : undefined;
  return { ...item, timeZone, localStartsAt: localStamp(item.startsAt, timeZone), localEndsAt: endsAt ? localStamp(endsAt, timeZone) : null };
}
function safeRecord(value: unknown, depth = 0, truncated?: { value: boolean }): any {
  if (depth > 12) { if (truncated) truncated.value = true; return null; }
  if (Array.isArray(value)) {
    if (value.length > 100 && truncated) truncated.value = true;
    return value.slice(0, 100).map((v) => safeRecord(v, depth + 1, truncated));
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/^(?:password|secret|token|ticket|cookie|authorization|credential|raw_response|data_path|body_b64|email|phone|mobile|account|sno|xh|yhm|xm|zgh|custid|custmemberid|acctid|cardid|bankacc|cert|schcode|yktschoolcode)$/i.test(key) &&
            !/(身份证|学号|手机号|邮箱)/.test(key),
        )
        .map(([k, v]) => [k, safeRecord(v, depth + 1, truncated)]),
    );
  if (typeof value === 'string' && value.length > 4000 && truncated) truncated.value = true;
  return typeof value === 'string' ? value.slice(0, 4000) : value;
}

const sensitiveCampusGrant: Partial<Record<(typeof campusDomains)[number], string>> = {
  grades: 'campus:grades:read',
  gpa: 'campus:gpa:read',
  gpa_semesters: 'campus:gpa:read',
  gpa_cumulative: 'campus:gpa:read',
  retakes: 'campus:grades:read',
  reservations: 'campus:reservations:read',
  reservation_violations: 'campus:reservations:read',
  card: 'campus:card:read',
  transactions: 'campus:transactions:read',
  profile: 'campus:profile:read',
  roles: 'campus:profile:read',
};
export function registerBuiltins(
  broker: CapabilityBroker,
  policy: PolicyKernel,
  repo: KernelRepository,
  domains: DomainService,
  connections: BuiltinConnections,
  planning: PlanningApplicationService,
  planningIntents?: PlanningIntentService,
) {
  const register = (provider: CapabilityProvider) =>
    broker.register(provider, { reviewed: true, source: 'bundled source review' });
  const campusScopeCurrent = (scope: ReturnType<PolicyKernel['validate']>) => scope.principalId === repo.identity.principalId
    && scope.workspaceId === repo.identity.workspaceId && scope.subjectId === scope.principalId && scope.worldId === 'real' && scope.audience === 'self'
    && scope.privacyEpoch === repo.epoch && scope.policyRevision === repo.policyRevision && Date.parse(scope.expiresAt) > Date.parse(repo.clock.now())
    && scope.sources.includes(CAMPUS_ACCOUNT_SOURCE_ID) && scope.grants.includes('campus:read');
  planning.setCampusPort({
    read: async (scope, from, to, signal) => {
      if (!campusScopeCurrent(scope) || !connections.campus) return null;
      return readCampusPlanningConstraints(connections.campus, scope, from, to, signal, () => {
        if (!campusScopeCurrent(scope)) throw new HarnessError('planning_campus_scope_changed', '学校资料这次能读的范围刚刚变了，安排所用的条件需要跟着重新看。');
      });
    },
    current: (scope, snapshot) => campusScopeCurrent(scope) && !!connections.campus?.describe().available && snapshot.proofs.length > 0
      && snapshot.proofs.every(proof => connections.campus!.isCurrentSnapshot(proof)),
    currentVersion: (scope, version) => campusScopeCurrent(scope) && !!connections.campus?.describe().available
      && connections.campus.isCurrentSnapshotVersion(version),
  });
  register({
    manifest: manifest('situation', 'current', [base('situation.read', z.object({
      from: z.string().datetime({ offset: true }).describe('一起查看安排的起点，to在其后，最多看31天。'), to: z.string().datetime({ offset: true }).describe('这次一起查看的终点。'), timeZone: z.string().max(100).default('Asia/Shanghai'),
      limit: z.number().int().min(1).max(20).default(8).describe('每类先带回多少条；结果会留下还有多少内容和资料来由。'),
    }).strict(), jsonObject, ['evidence:read'], { version: '3', timeoutMs: 90000, worlds: ['real'], displayName: '一起看看近日安排', description: '把最多31天里的已存安排、已经答应的事、当前目标与可读校园安排放在一起，方便商量接下来怎么过。校园已连接时会接回原资料，必要时补齐缺少的学期；每项保留当地时间、来源与还没看全的部分。精力和意愿等对方来说。只想看某份课表或考试时，直接用campus.lookup或campus.query读原清单，返回的画面地址可直接展示。' })]),
    invoke: async (_name, args, ctx) => {
      const scope = policy.validate(ctx.scope), now = repo.clock.now();
      if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self') throw new HarnessError('situation_scope', '这里接的是本人私下商量的真实安排；其他人的安排或假设情节可以在各自的事项里继续谈。');
      if (Date.parse(args.to) <= Date.parse(args.from) || Date.parse(args.to) - Date.parse(args.from) > 31 * 86400000) throw new HarnessError('time_window', '这次需要明确从什么时候看到什么时候，结束放在开始之后；一次可看31天，更长的日子可以分段接着看。');
      const campusSnapshot = await planning.readCampus(scope, args.from, args.to, ctx.signal);
      policy.validate(ctx.scope);
      const campusCalendar = campusSnapshot ? { ...campusConstraintSummary(campusSnapshot),
        items: campusSnapshot.busy.slice(0, args.limit).map(item => calendarLocalTimes({ startsAt: item.start, endsAt: item.end,
          title: item.title, sourceId: item.sourceId, sourceVersion: item.sourceVersion, meaning: '这是学校保存资料里的安排，实际出席与本人日历另有记录。' }, args.timeZone)),
        truncated: campusSnapshot.busy.length > args.limit, totalKnownScheduledItems: campusSnapshot.busy.length } : null;
      const mayReadAgenda = scope.sources.includes('local-agenda');
      const agenda = mayReadAgenda ? repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload))) : [];
      const local = mayReadAgenda ? expandAgenda(agenda, args.from, args.to, args.timeZone) : undefined;
      const localItems = (local?.items || []).map(item => calendarLocalTimes(item, args.timeZone));
      const work = scope.sources.includes('work:self') ? repo.work(ctx.scope) : [];
      const evidence = (ids: string[]) => ids.flatMap(id => { const source = repo.evidence(ctx.scope, id); return source ? [{ id: source.id, sourceId: source.sourceId, version: source.contentVersion, receivedAt: source.receivedAt, authority: source.authority }] : []; });
      const goals = work.filter(item => item.kind === 'goal' && item.status === 'active').slice(0, args.limit).map(item => ({ id: item.id, revision: item.revision, title: item.title, status: item.status, data: item.data, sources: evidence(item.evidenceIds) }));
      const commitments = work.filter(item => item.kind === 'commitment' && (['accepted', 'confirmed'].includes(item.status) || item.data.accepted === true) && !['cancelled', 'closed', 'stale', 'blocked'].includes(item.status)).slice(0, args.limit).map(item => ({ id: item.id, revision: item.revision, title: item.title, status: item.status, data: item.data, sources: evidence(item.evidenceIds) }));
      const mayReadCampus = scope.grants.includes('campus:read') && scope.sources.some(source => ['campus:local', CAMPUS_ACCOUNT_SOURCE_ID].includes(source));
      const storedCampusScope = campusSnapshot ? policy.narrow(ctx.scope, { sources: scope.sources.filter(source => source !== CAMPUS_ACCOUNT_SOURCE_ID) }) : ctx.scope;
      const campus = mayReadCampus && (!campusSnapshot || scope.sources.includes('campus:local')) ? ['schedule', 'exams'].map(domain => {
        const result = domains.resolve(storedCampusScope, domain, { from: args.from, to: args.to, limit: args.limit + 1 });
        return { domain, status: result.status, completeForWindow: false, truncated: result.records.length > args.limit,
          records: result.records.filter(record => !campusSnapshot || record.sourceId !== CAMPUS_ACCOUNT_SOURCE_ID)
            .slice(0, args.limit).map(record => ({ ...record, value: safeRecord(calendarLocalTimes(record.value, args.timeZone)) })),
          meaning: '这里接回了这次可读的已存记录。还想核对临时调课或完整课次时，可以沿校园原资料继续查。' };
      }) : [];
      const acceptedLocal = localItems.filter(item => calendarCommitment(item as any).state === 'accepted');
      const acceptedDated = acceptedLocal.filter(item => calendarCommitment(item as any).occupiesTime).map(item => ({ ...item, sourceId: 'local-agenda' }));
      const schoolDated = campusSnapshot ? campusSnapshot.busy.map(item => ({ startsAt: item.start, endsAt: item.end,
        title: item.title, sourceId: item.sourceId, sourceVersion: item.sourceVersion })) : [];
      const storedDated = campus.flatMap(domain => domain.records.filter(record => record.value.status !== 'cancelled' && typeof record.value.startsAt === 'string').map(record => ({ ...record.value, id: record.id, revision: record.revision, sourceId: record.sourceId, sourceStatus: record.status, fetchedAt: record.fetchedAt })));
      const nextInWindow = (items: Record<string, unknown>[]) => items.filter(item => typeof item.startsAt === 'string'
        && Date.parse(item.startsAt) >= Math.max(Date.parse(now), Date.parse(args.from)))
        .sort((a, b) => Date.parse(String(a.startsAt)) - Date.parse(String(b.startsAt)))[0] || null;
      const next = nextInWindow(acceptedDated), nextKnownScheduledItem = nextInWindow([...acceptedDated, ...schoolDated, ...storedDated]);
      const data = { now, timeZone: args.timeZone, window: { from: args.from, to: args.to }, nextAcceptedCommitment: next,
        localAgenda: { status: mayReadAgenda ? local!.status : 'not_read', items: localItems.slice(0, args.limit), truncated: !!local && local.items.length > args.limit, issues: local?.issues.map(item => calendarLocalTimes(item, args.timeZone)) || [], sourceId: 'local-agenda' },
        goals, commitments, campus, campusCalendar, nextKnownScheduledItem,
        coverage: { localAgenda: mayReadAgenda ? 'local_registered_occurrences_only' : 'not_in_scope', work: scope.sources.includes('work:self') ? 'bounded_authorized_records' : 'not_in_scope',
          campus: campusSnapshot ? 'current_saved_account_snapshot_not_live_confirmation' : mayReadCampus ? 'stored_records_only_not_live_complete' : 'not_in_scope', notes: 'not_read', location: 'not_read', weather: 'not_read', energy: 'unknown' },
        unknown: ['空白处是这次资料里没列安排的时间，其他约定还要一起看。', '今天有多少精力、想怎么过，等对方说。', '下一项取自刚才读到的安排，其他来源若有更早的事，继续读时再接上。'] };
      return { status: 'fresh', sourceId: 'current', data: JSON.parse(JSON.stringify(data)), fetchedAt: now, coverage: { complete: false, scope: 'bounded allowed local situation; omitted sources remain unknown' }, simulated: false };
    },
  });
  register({
    manifest: manifest('local-agenda', 'local-agenda', [
      base('planning.compare', planningComparisonInput, jsonObject, ['evidence:read'], { version: '2', timeoutMs: 90000, cacheScope: 'handle',
        displayName: '一起商量几种安排', description: '用同一份日历和校园资料试2–4种过法，看看各自保住了什么、挪动了什么、还剩什么。工作总量、原本的拆分条件、准备收尾、转场、休息和留白都会一起算；taskPreferences.rhythm可比较连续做与分段做。结果给出真实差别与未排完的工作，眼前仍是一场比较，决定采用后再保存。' }),
      base('planning.draft', planningDraftInput, jsonObject, ['evidence:read'], { version: '2', timeoutMs: 90000, displayName: '排一份照顾周全的草案', description: '把事情按期限、前后依赖、完整工作时长和可拆分条件试排，连准备、收尾、转场、休息与留白一起留好。可读的校园课程、考试和校历会自动接进来。结果说明排得下什么、什么还放不下；想采用时沿acceptanceProposals与原planRef继续。中途安排变了可重新试算，已经保存的部分会留下。' }),
      base('planning.recover', planningRecoveryInput, jsonObject, ['evidence:read'], { version: '1', cacheScope: 'handle', worlds: ['real'], displayName: '接着安排未完成的计划', description: '沿原planId看看哪些安排已经保存、哪些还能接着办，以及哪里变了需要重新商量。这里先核对实际结果，已经办好的会保留，剩下的沿返回入口继续。' }),
      ...(planningIntents ? [base('planning.replan', planningIntentReplanInput, jsonObject, ['evidence:read'], { version: '2', timeoutMs: 90000, cacheScope: 'handle', worlds: ['real'], displayName: '接着商量保留的规划', description: '沿已读规划的id与expectedRevision，带着原来要照顾的条件、目前的日历和已保存部分重新试排。可读的校园资料会一起核对。返回新的草案地址，并保留当时用了哪些资料、后来办到哪里和仍没弄清的地方；接着采用新草案即可。' })] : []),
      base('planning.preview', planningPreviewInput, jsonObject, ['evidence:read'], { version: '1', displayName: '看看怎样调整更合适', description: '在当前日历里试最多三种调整，保留固定约定，也看已经答应但能挪动的安排。返回每种方案的冲突、需要补问的条件和连回原对象的修改提议。这里先试放，真正决定这样改时沿原本地行动保存。' }),
      base('local.agenda.change', localCalendarChangeSchema, z.object({}).strict(), ['local:write'], { effect: 'local_write', worlds: ['real'], supportsIdempotency: true, supportsInspect: true, supportsCancel: true, displayName: '调整原来的安排', description: '沿原对象和版本修改、删除安排，或只改重复安排中的这一次。结果保留实际变化，也能沿原记录核对与撤回。' }),
      base('local.agenda.save', localActionInput, z.object({}).strict(), ['local:write'], {
        effect: 'local_write',
        worlds: ['real'],
        supportsIdempotency: true,
        supportsInspect: true,
        supportsCancel: true,
        displayName: '保存这份安排', description: '把已经说清的安排存进本地日历，保留原日期、提醒时刻与补充内容。采用整份规划时沿它的planRef保存，结果可回读，也能撤回。',
      }),
      base(
        'local.agenda.read',
        z.object({ query: z.string().max(100).optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), timeZone: z.string().max(100).optional() }).strict(),
        z.object({ items: z.array(jsonObject), issues: z.array(jsonObject).optional() }).strict(),
        ['evidence:read'],
        { version: '2', displayName: '翻看已存安排', description: '按起止日期看本地未完成安排，每次重复安排会展开成当天的实例，带当地时间与时区。query只找标题里含这段文字的项；想看整个时段就留空。结束时间没写的仍留空，待定与冲突会随结果一起带回。' },
      ),
    ]),
    invoke: async (name, args, ctx) => {
      if (name === 'local.agenda.save' || name === 'local.agenda.change')
        throw new HarnessError('transaction_required', '保存安排沿prepare_action继续；已存安排的修改沿原行动办理，这样实际结果和撤回入口都能留在同一处。');
      policy.validate(ctx.scope);
      if (name === 'planning.compare') {
        const scope = policy.validate(ctx.scope), input = planningComparisonInput.parse(args);
        if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self' || !scope.sources.includes('local-agenda'))
          throw new HarnessError('planning_scope', '这次还没有读到本人日历，暂时算不出真实空档；可以先接回当前允许的日历，再比较这几种安排。');
        const campus = await planning.readCampus(scope, input.draft.from, input.draft.to, ctx.signal);
        ctx.signal.throwIfAborted(); policy.validate(ctx.scope);
        if (campus && !planning.campusCurrent(scope, campus))
          throw new HarnessError('planning_campus_changed', '比较期间学校安排更新了，可以重新读一遍，再用同一份当前资料比较这几种过法。');
        const items = repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload)));
        const currentInput = campus ? { ...input, draft: { ...input.draft, busy: [...input.draft.busy, ...campus.busy],
          sourceCoverage: [...input.draft.sourceCoverage, campus.coverage] } } : input;
        const comparison = compareCalendarPlans(items, currentInput), comparisonId = randomUUID();
        const data = { ...comparison, comparisonId, comparisonView: planningComparisonView(comparison, { comparisonId,
          sourceIds: ['local-agenda', ...(campus ? [campus.sourceId] : [])] }), ...(campus ? { campusCalendar: campusConstraintSummary(campus) } : {}) };
        return { status: 'fresh', sourceId: 'local-agenda', data: JSON.parse(JSON.stringify(data)), fetchedAt: repo.clock.now(),
          coverage: { complete: false, scope: 'declared alternatives on one current local agenda and permitted saved campus snapshot; not all possible life choices' }, simulated: false };
      }
      if (name === 'planning.preview' || name === 'planning.draft' || name === 'planning.recover' || name === 'planning.replan') {
        const campus = name === 'planning.draft' ? await planning.readCampus(policy.validate(ctx.scope), args.from, args.to, ctx.signal) : null;
        policy.validate(ctx.scope);
        const items = repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload)));
        const data = name === 'planning.draft' ? planning.prepare(policy.validate(ctx.scope), items, args, undefined, campus) : name === 'planning.recover' ? planning.recover(policy.validate(ctx.scope), items, args)
          : name === 'planning.replan' ? await planningIntents!.replanWithCampus(ctx.scope, args, ctx.signal) : previewCalendarPlan(items, args);
        return { status: 'fresh', sourceId: 'local-agenda', data: JSON.parse(JSON.stringify(data)), fetchedAt: repo.clock.now(),
          coverage: { complete: name === 'planning.preview' && 'issues' in data && data.issues.length === 0, scope: 'local calendar arithmetic only; external coverage and energy remain explicit conditions' }, simulated: false };
      }
      const items = repo.db
        .prepare('SELECT payload FROM agenda')
        .all()
        .map((r) => JSON.parse(String(r.payload)))
        .filter((a) => !a.done && (!args.query || a.title.includes(args.query)));
      if (args.from || args.to) {
        if (!args.from || !args.to) throw new HarnessError('time_window', '按时间查询需要明确起止范围。');
        const expanded = expandAgenda(items, args.from, args.to, args.timeZone || 'Asia/Shanghai');
        const titleFilter = args.query ? `; title contains ${JSON.stringify(args.query)}` : '; no title filter';
        return { status: expanded.status, sourceId: 'local-agenda', data: { items: expanded.items.map(item => calendarLocalTimes(item, args.timeZone || 'Asia/Shanghai')), issues: expanded.issues.map(item => calendarLocalTimes(item, args.timeZone || 'Asia/Shanghai')) }, coverage: { complete: expanded.coverage.complete, scope: `dated occurrences from ${args.from} to ${args.to}; undated tasks excluded${titleFilter}` }, fetchedAt: repo.clock.now(), simulated: false };
      }
      return {
        status: items.length ? 'fresh' : 'known_absent',
        sourceId: 'local-agenda',
        data: { items: items.map(item => calendarLocalTimes(item, args.timeZone || 'Asia/Shanghai')) },
        coverage: { complete: true, scope: `unfinished local agenda${args.query ? `; title contains ${JSON.stringify(args.query)}` : '; no title filter'}` },
        fetchedAt: repo.clock.now(),
        simulated: false,
      };
    },
  });
  register({
    manifest: manifest('campus-read', CAMPUS_ACCOUNT_SOURCE_ID, [
      base('campus.query', campusQueryInput, jsonObject, ['campus:read'], {
        version: '9', displayName: '细查课程、成绩和绩点', description: '查本人课程、课表、考试、逐科成绩、各学期与总绩点、实践等原资料。resources看看有哪些资料，schema看来源字段，quick/select做筛选、关联与汇总；continuation接着同一份查询翻页，read打开原对象，history/diff看后来变化。没写时间的考试还可沿exam_course_record地址查课程记录；主修GPA沿同份资料的major地址读。结果保留学分、原分数、修读次数、计入政策与分母，各种GPA分别看。实践和跑步各有统计入口。账号核对方式、资料保存时间与缺项也会带回，方便判断还要查哪里。', timeoutMs: 90000, maxBytes: 140000,
      }),
      base(
        'campus.lookup',
        campusInput,
        z.union([campusAccountOutput, campusNavigationOutput, z.object({ kind: z.literal('capability_assessment'), domain: z.enum(campusDomains), recordRead: z.literal(false),
          requestedMeasures: z.array(z.string()), catalog: jsonObject }).strict()]),
        ['campus:read'],
        { version: '15', timeoutMs: 90000, displayName: '本人校园资料', description: '按类别翻本人课程、课表、考试、成绩、绩点、实践和已有校园记录。成绩可按课程名与filters筛选，单学期沿来源中的学期ID选择。考试逐场清单外，还有courseRecords地址可查没写时间的课程记录，两份清单分别翻页。暂未对应记录的类别会带回可读资料目录，实际读取情况另列。每份结果保留修读口径、分母、统计期、下一页和资料时间；实践学分与体育打卡次数各查各的来源。' },
      ),
      base('campus.overview', campusOverviewInput, jsonObject, ['campus:read'], {
        version: '5',
        timeoutMs: 90000,
        maxBytes: 140000,
        displayName: '看看校园资料有哪些', description: '查看所选采集时期的校园资料概览与各类读取入口。通常接回已存资料；refresh会重新采集整份学业资料，includeSensitiveDomains选择这次带回哪些类别。想看具体课程、考试或成绩时，沿相应清单继续读。',
      }),
    ]),
    connectionStatus: () => {
      const status = connections.campus?.describe();
      const connected = !!status?.available && status.credentialsConfigured !== false;
      return { connected, ...(status?.reason ? { reason: status.reason } : !connected ? { reason: '尚未连接校园账号' } : {}), entry: '连接与偏好 → 校园资料' };
    },
    invoke: async (name, args, ctx) => {
      const sourceId = CAMPUS_ACCOUNT_SOURCE_ID;
      const connector = connections.campus?.describe();
      if (!connections.campus || !connector?.available)
        return {
          status: 'not_connected',
          sourceId,
          reason: connector?.reason || '还没有连接浙大校园账号，可以在“连接与偏好 → 校园资料”登录；已有导入材料可从campus.imported_lookup继续读。',
          simulated: false,
        };
      if (name === 'campus.query') {
        const query = validateCampusQuery(args);
        requireCampusQueryScope(policy, ctx.scope, query);
        const result = await connections.campus.query(query, ctx.signal, { allowAcademicSync:
          ['campus:grades:read', 'campus:gpa:read', 'campus:profile:read'].every(grant => policy.can(ctx.scope, grant)) });
        policy.validate(ctx.scope);
        const sourceStatus = result.status === 'unavailable' ? 'not_connected' : statusOf(result);
        const paged = result.next_offset != null || (query.spec?.offset ?? query.offset) > 0;
        const exactRows = result.truncated_for_model !== true && result.nested_values_truncated !== true
          && (!Array.isArray(result.records) || campusPageCoordinates(result, query.spec?.offset ?? query.offset));
        const status: KnowledgeStatus = sourceStatus === 'fresh' && (paged || !exactRows) ? 'partial' : sourceStatus;
        const continuation = exactRows ? campusQueryContinuation(query, result) : undefined;
        const observedAt = sourceObservationAt(result);
        const delivery = campusPageDelivery(connections.campus, result, query.spec?.offset ?? query.offset);
        const courseRecords = examCourseRecordsNavigation(connections.campus, result);
        return { status, sourceId, data: JSON.parse(JSON.stringify({ ...result, ...(continuation ? { continuation } : {}),
          ...(courseRecords ? { courseRecords } : {}) })), fetchedAt: observedAt, reason: result.reason,
          ...(delivery ? { delivery } : {}),
          coverage: { complete: result.status !== 'navigate_required' && exactRows && result.coverage?.complete === true && !paged,
            scope: query.resource || query.spec?.resource || 'capability_metadata' }, simulated: false };
      }
      if (name === 'campus.lookup' && args.domain === 'sports') {
        const assessment = (await connections.campus.read({ domain: 'sports' }, ctx.signal)).data;
        policy.validate(ctx.scope);
        if (assessment.kind !== 'capability_assessment') return { status: statusOf(assessment), sourceId,
          reason: assessment.reason, simulated: false, coverage: { complete: false, scope: 'connector_catalog_only' } };
        return { status: 'unsupported', sourceId,
          data: { kind: assessment.kind, domain: assessment.domain, recordRead: assessment.recordRead,
            requestedMeasures: assessment.requestedMeasures, catalog: assessment.catalog }, simulated: false,
          coverage: { complete: false, scope: 'connector_catalog_only' } };
      }
      if (connector.credentialsConfigured === false)
        return {
          status: 'forbidden',
          sourceId,
          reason: '校园账号还没登录，可以在“连接与偏好 → 校园资料”接上；已有导入材料可从campus.imported_lookup继续读。',
          simulated: false,
        };
      if (name === 'campus.overview') {
        if (args.includeSensitiveDomains) {
          for (const grant of [
            'campus:grades:read',
            'campus:gpa:read',
            'campus:reservations:read',
            'campus:card:read',
            'campus:transactions:read',
            'campus:profile:read',
          ]) policy.require(ctx.scope, grant);
        }
        const result = await connections.campus.fullContext(
          {
            refresh: args.refresh,
            includeSensitiveDomains: args.includeSensitiveDomains,
            academicYear: args.academicYear,
            term: args.term,
          },
          ctx.signal, { allowAcademicSync: ['campus:grades:read', 'campus:gpa:read', 'campus:profile:read'].every(grant => policy.can(ctx.scope, grant)) },
        );
        policy.validate(ctx.scope);
        const batches = Array.isArray(result?.batches) ? result.batches : [];
        const domains = batches
          .filter((batch: any) => batch.scope !== 'academic')
          .map((batch: any) => {
            const data = batch.data || {};
            return {
              domain: String(batch.scope),
              status: String(data.status || 'unknown'),
              total: typeof data.total_matches === 'number' ? data.total_matches : undefined,
              records: (Array.isArray(data.records) ? data.records : [])
                .slice(0, 4)
                .map((record: any) => safeRecord(record)),
              fetchedAt: sourceObservationAt(data),
              ...(data.authentication ? { authentication: data.authentication } : {}),
              complete: data.coverage?.complete === true || data.completeness?.complete === true,
              issues: Array.isArray(data.coverage?.issues) ? data.coverage.issues.slice(0, 8) : undefined,
            };
          });
        const overviewSnapshotAt = domains
          .map((domain: any) => domain.fetchedAt)
          .filter((item: unknown): item is string => typeof item === 'string' && Number.isFinite(Date.parse(item)))
          .sort((a: string, b: string) => Date.parse(a) - Date.parse(b))[0];
        return {
          status: statusOf(result),
          sourceId,
          data: JSON.parse(
            JSON.stringify(
              safeRecord({
                origin: 'zju_account',
                authenticated: result?.authentication?.mode === 'live_session',
                ...(result?.authentication ? { authentication: result.authentication } : {}),
                refreshed: Boolean(result?.refreshed),
                snapshotAt: overviewSnapshotAt,
                domains,
                missingDomains: result?.missingScopes || [],
                incompleteDomains: result?.incompleteScopes || [],
                source: '浙江大学本人账号',
              }),
            ),
          ),
          fetchedAt: overviewSnapshotAt,
          expiresAt: overviewSnapshotAt
            ? new Date(Date.parse(overviewSnapshotAt) + 300000).toISOString()
            : undefined,
          coverage: {
            complete: result?.status === 'ok',
            scope: args.includeSensitiveDomains ? 'all supported account domains' : 'supported non-sensitive account domains',
          },
          reason: result?.reason,
          simulated: false,
        };
      }
      const grant = sensitiveCampusGrant[args.domain as (typeof campusDomains)[number]];
      if (grant) policy.require(ctx.scope, grant);
      if (campusLookupReadsCourseGrades(args)) policy.require(ctx.scope, 'campus:grades:read');
      if (!['places', 'rules'].includes(args.domain)) {
        const wrapped = (await connections.campus!.read(
          {
            domain: args.domain as CampusDomain,
            query: args.query,
            courseId: args.courseId,
            academicYear: args.academicYear,
            term: args.term,
            from: args.from,
            to: args.to,
            at: args.at,
            timeMode: args.timeMode,
            fields: args.fields,
            filters: args.filters,
            sort: args.sort,
            offset: args.offset,
            bundleId: args.bundleId,
            expectedSnapshotVersion: args.expectedSnapshotVersion,
            window: args.window,
            limit: args.limit,
            refresh: args.refresh,
          },
          ctx.signal, { allowAcademicSync: ['campus:grades:read', 'campus:gpa:read', 'campus:profile:read'].every(grant => policy.can(ctx.scope, grant)) },
        )) as any;
        const result = wrapped?.data && typeof wrapped.data === 'object' ? wrapped.data : wrapped;
        const snapshotAt = sourceObservationAt(result);
        policy.validate(ctx.scope);
        if (result.status === 'navigate_required') return {
          status: 'partial', sourceId, data: {
            kind: 'navigation_required', domain: args.domain, recordRead: false,
            ...(typeof result.resource === 'string' ? { resource: result.resource } : {}),
            ...(typeof result.bundle_id === 'string' ? { bundleId: result.bundle_id } : {}),
            ...(typeof result.expectedSnapshotVersion === 'string' ? { expectedSnapshotVersion: result.expectedSnapshotVersion } : {}),
            ...(Number.isSafeInteger(result.offset) && result.offset >= 0 ? { offset: result.offset } : {}),
            ...(Number.isSafeInteger(result.total_matches) && result.total_matches >= 0 ? { total: result.total_matches } : {}),
            ...(result.authentication ? { authentication: result.authentication } : {}),
            ...(result.snapshotProof ? { snapshotProof: result.snapshotProof } : {}),
            ...(result.truncated_for_model === true ? { truncated_for_model: true } : {}),
            ...(result.nested_values_truncated === true ? { nested_values_truncated: true } : {}),
          }, fetchedAt: snapshotAt, coverage: { complete: false, scope: args.domain }, reason: result.reason, simulated: false,
        };
        const records = result.records || result.result || [];
        const truncated = { value: result.truncated_for_model === true };
        const deliveredRecords = (Array.isArray(records) ? records : [records])
          .map((record: any) => safeRecord(record, 0, truncated))
          .filter((record: any) => record && typeof record === 'object' && !Array.isArray(record));
        if (Array.isArray(records) && deliveredRecords.length !== records.length) truncated.value = true;
        const contentTruncated = truncated.value || result.nested_values_truncated === true;
        const delivery = campusPageDelivery(connections.campus!, { ...result, truncated_for_model: truncated.value }, args.offset || 0);
        const courseRecords = examCourseRecordsNavigation(connections.campus!, result);
        return {
          status: statusOf(contentTruncated && result.status === 'ok' ? { ...result, status: 'partial' } : result),
          sourceId,
          ...(delivery ? { delivery } : {}),
          data: {
            domain: args.domain,
            records: deliveredRecords,
            ...(truncated.value ? { truncated_for_model: true } : {}),
            ...(result.nested_values_truncated === true ? { nested_values_truncated: true } : {}),
            source: '浙江大学本人账号',
            institutionId: 'zju',
            termId: String(result.semester_id || 'unspecified'),
            termIdMeaning: 'snapshot_collection_period' as const,
            recordSelection: result.recordSelection || { filters: args.filters || [], ...(args.sort ? { sort: args.sort } : {}),
              semester: (args.filters || []).some((filter: string) => filter.split(':')[0].trim() === 'semester_id')
                ? 'semester_predicate_provided' as const : 'no_semester_predicate' as const },
            ...(courseRecords ? { courseRecords } : {}),
            live: args.refresh,
            origin: 'zju_account',
            authenticated: result.authentication ? result.authentication.mode === 'live_session'
              : connector.authStatus === 'verified' || !!result.authenticated_at,
            ...(result.authentication ? { authentication: result.authentication } : {}),
            total: typeof result.total_matches === 'number' ? result.total_matches : undefined,
            cached: !args.refresh,
            snapshotAt,
            ...(typeof result.bundle_id === 'string' ? { bundleId: result.bundle_id } : {}),
            ...(result.next_offset !== undefined ? { nextOffset: result.next_offset } : {}),
            ...(Number.isSafeInteger(result.offset) && result.offset >= 0 ? { offset: result.offset } : {}),
            ...(typeof result.unknown_time_records === 'number' ? { unknownTimeRecords: result.unknown_time_records } : {}),
            ...(result.coverage ? { sourceCoverage: result.coverage } : {}),
            ...(result.time_interval ? { timeInterval: result.time_interval } : {}),
            ...(typeof result.evaluated_at === 'string' ? { evaluatedAt: result.evaluated_at } : {}),
            ...(result.snapshotProof ? { snapshotProof: result.snapshotProof } : {}),
            ...(result.snapshotProofs ? { snapshotProofs: result.snapshotProofs } : {}),
          },
          fetchedAt: snapshotAt,
          expiresAt:
            snapshotAt && Number.isFinite(Date.parse(snapshotAt))
              ? new Date(Date.parse(snapshotAt) + 300000).toISOString()
              : undefined,
          coverage: {
            complete: !contentTruncated && (result.coverage?.complete === true || result.completeness?.complete === true)
              && result.next_offset == null && (result.offset ?? args.offset ?? 0) === 0,
            scope: args.domain,
          },
          reason: result.reason || result.error?.message,
          simulated: false,
        };
      }
      const catalog = await connections.campus.query({ operation: 'resources', offset: 0, limit: 50, refresh: false }, ctx.signal);
      policy.validate(ctx.scope);
      return { status: 'unsupported', sourceId,
        data: { kind: 'capability_assessment', domain: args.domain, recordRead: false, requestedMeasures: [], catalog },
        coverage: { complete: false, scope: 'connector_catalog_only' }, simulated: false };
    },
  });
  // A legacy import remains available only for explicit offline migration. It
  // has a different source ID and is never selected when the account skill is
  // configured, so it cannot masquerade as a current ZJU account result.
  register({
    manifest: manifest('campus-import', 'campus:local', [
      base('campus.imported_lookup', campusInput.extend({
        expectedSnapshotVersion: z.string().regex(/^[a-f0-9]{64}$/).optional().describe('续页复制原结果的snapshotVersion，资料或筛选范围改变时从第一页重新读取。'),
      }), campusImportOutput, ['campus:read'], { version: '2', displayName: '翻看导入的校园材料', description: '读这台电脑上导入的旧课次、考试、体育、地点或规则。日期和关键词可筛选，下一页沿原资料版本继续；来源与保存时间随结果带回。当前账号里的课程、成绩和GPA可另用campus.lookup或campus.query查。' }),
    ]),
    connectionStatus: () => ({ connected: !!repo.getMeta('campus_import_metadata'), reason: '这里读的是这台电脑上导入的校园材料，账号资料另有入口。' }),
    invoke: async (_name, args, ctx) => {
      const metadata = repo.getMeta<{ institutionId: string; termId: string; source: string; updatedAt?: string }>(
        'campus_import_metadata',
      );
      if (!metadata)
        return {
          status: 'unsupported',
          sourceId: 'campus:local',
          reason: '这台电脑上还没有导入校园材料。若校园账号已连接，可以沿campus.lookup或campus.query查；对方手头的学校页面或导出材料也可接着看。',
          simulated: false,
        };
      const importedDomain = args.domain === 'practice' || args.domain === 'sports' ? 'sports' : args.domain;
      if (!['schedule', 'exams', 'sports', 'places', 'rules'].includes(importedDomain)) return {
        status: 'unsupported', sourceId: 'campus:local', simulated: false,
        coverage: { complete: false, scope: args.domain },
        reason: '这份导入材料只有课次、考试、体育、地点和规则。其他学业资料可沿campus.lookup或campus.query查账号来源。',
      };
      const result = domains.resolve(ctx.scope, importedDomain, {
        institutionId: metadata.institutionId,
        termId: metadata.termId,
        from: args.from,
        to: args.to,
        query: args.query,
        limit: 6000,
      });
      const sourceLimitReached = result.records.length >= 6000;
      const snapshotVersion = createHash('sha256').update(JSON.stringify({
        metadata, domain: args.domain, from: args.from || null, to: args.to || null, query: args.query || null,
        records: result.records.map(record => ({ id: record.id, sourceId: record.sourceId, revision: record.revision,
          evidenceId: record.evidenceId, fetchedAt: record.fetchedAt, status: record.status })),
      })).digest('hex');
      const offset = args.offset || 0;
      if (args.expectedSnapshotVersion && args.expectedSnapshotVersion !== snapshotVersion || offset > 0 && !args.expectedSnapshotVersion)
        return { status: 'conflict', sourceId: 'campus:local', simulated: false,
          coverage: { complete: false, scope: args.domain },
          reason: args.expectedSnapshotVersion
            ? '导入资料或这次筛选的范围已经变了，可以从第一页重新接着看。'
            : '续页还缺原资料版本。先从第一页取得snapshotVersion，沿那一页留下的地址继续。' };
      let records = result.records;
      if (args.from)
        records = records.filter(
          (r) => !r.value.endsAt || Date.parse(String(r.value.endsAt)) > Date.parse(args.from),
        );
      if (args.to)
        records = records.filter(
          (r) => !r.value.startsAt || Date.parse(String(r.value.startsAt)) < Date.parse(args.to),
        );
      if (args.query) records = records.filter((r) => JSON.stringify(r.value).includes(args.query));
      const page = records.slice(offset, offset + args.limit), nextOffset = offset + page.length < records.length ? offset + page.length : null;
      const truncated = { value: false };
      const deliveredRecords = page.map(record => safeRecord(record.value, 0, truncated));
      const status = result.status === 'conflict' ? 'conflict' : records.length ? 'stale' : sourceLimitReached ? 'partial' : 'not_found';
      return {
        status,
        sourceId: 'campus:local',
        data: {
          domain: args.domain,
          records: deliveredRecords,
          materialVersions: page.map(record => ({ kind: 'domain', id: record.id, revision: record.revision, sourceId: record.sourceId,
            domain: record.domain, institutionId: record.institutionId, termId: record.termId })),
          conflicts: result.conflicts.map((g) => ({ id: g[0].id, sources: g.map((r) => r.sourceId) })),
          source: metadata.source,
          institutionId: metadata.institutionId,
          termId: metadata.termId,
          live: false,
          origin: 'legacy_import',
          authenticated: false,
          total: records.length,
          totalMeaning: sourceLimitReached ? 'matching_records_within_source_limit' : 'matching_retained_records',
          offset, nextOffset, snapshotVersion,
          ...(nextOffset !== null ? { continuation: { tool: 'look_up', arguments: { source: 'capability', capability: 'campus.imported_lookup',
            arguments: { domain: args.domain, ...(args.from ? { from: args.from } : {}), ...(args.to ? { to: args.to } : {}),
              ...(args.query ? { query: args.query } : {}), offset: nextOffset, limit: args.limit, expectedSnapshotVersion: snapshotVersion, refresh: false } } } } : {}),
          sourceRead: { limit: 6000, returned: result.records.length, limitReached: sourceLimitReached,
            meaning: sourceLimitReached
              ? '先取到了6000条已存材料，total数的是这批里符合筛选的记录。续页接着看这批；想找更远的记录，可以缩小日期或关键词范围。'
              : 'total数的是符合这次筛选的已存记录，本页打开其中一段。资料保存时间随结果带回，想看后来变化可以再查账号来源。' },
          ...(truncated.value ? { truncated_for_model: true } : {}),
          cached: true,
          snapshotAt: metadata.updatedAt,
        },
        fetchedAt: metadata.updatedAt || records[0]?.fetchedAt,
        coverage: { complete: !sourceLimitReached && !truncated.value && offset === 0 && nextOffset === null, scope: args.domain },
        reason: '这里是离线导入的校园资料，保存时间随记录留着；账号资料另有读取入口。',
        simulated: false,
      };
    },
  });
  const place = z.object({ kind: z.enum(['place', 'node']), id: z.string().min(1).max(100) }).strict();
  const routeInput = z
    .object({
      from: z.union([place, z.object({ kind: z.literal('current') }).strict()]).optional(),
      to: place.optional(),
      avoidStairs: z.boolean().optional(),
      allowConditional: z.boolean().optional(),
      version: z.string().optional(),
    })
    .strict();
  register({
    manifest: manifest('spatial', 'map:local', [
      base('map.overview', z.object({}).strict(), jsonObject, ['map:read'], {
        subjects: ['self', 'other', 'fictional'],
        displayName: '看看校园地图', description: '看当前公共校园地图的范围、资料版本和可找的地点类型，再沿map.search查具体地点。',
      }),
      base(
        'map.search',
        z
          .object({ query: z.string().min(1).max(100), limit: z.number().int().min(1).max(10).default(5) })
          .strict(),
        z.object({ matches: z.array(jsonObject) }).strict(),
        ['map:read'],
        { version: '4', subjects: ['self', 'other', 'fictional'], displayName: '找校园里的地方', description: '按平常叫法、已有别名或类别找地点，可加当前地图范围。结果留下地点、入口、接入条件与原资料地址；湖面或区域还会列附近独立命名、能接到路网的可选落点。可以明确说明选哪处来试算，交map.route看路，再随对方想去的位置调整。' },
      ),
      base('map.route', routeInput, jsonObject, ['map:read'], { subjects: ['self', 'other', 'fictional'], displayName: '看看这段路怎么走', description: '沿地图找到的地点或路网节点试算路线，保留原起终点、方向和入口条件。路线算好后会分别列出已记录道路和估计接入，可先带着这些条件展开这一版走法。确实缺少接入时，结果会留下可继续核对的候选入口。' }),
      base('map.location_status', z.object({}).strict(), jsonObject, ['map:read'], { displayName: '看看地图当前的定位情况', description: '查看公共地图目前保留的定位状态与原因，需要具体起点时可继续找地点或接回本人刚说的位置。' }),
    ]),
    connectionStatus: () => ({ connected: !!connections.map && connections.map.overview().version !== 'unavailable', reason: connections.map ? undefined : '地图数据尚未装配。' }),
    invoke: (name, args) => {
      if (!connections.map)
        return {
          status: 'unsupported',
          sourceId: 'map:local',
          reason: '地图数据尚未装配。',
          simulated: false,
        };
      const publicMap=connections.map.publicView?.() || connections.map;
      const value =
        name === 'map.overview'
          ? publicMap.overview()
          : name === 'map.search'
            ? { matches: publicMap.search(args.query, args.limit).map(point => {
              const nearby = publicMap.nearbyWalkablePlaces(point.id);
              return { ...projectWalkingSearchPoint(point), ...(nearby.length ? { nearbyWalkablePlaces: nearby.map(candidate => ({
                ...candidate, point: projectWalkingSearchPoint(candidate.point),
                meaning: '这是附近另一处有自己名字和出处的落点，所列距离是两处参考点间的直线。桥名来自已记录的道路；选这处试路时，它会成为新的终点，走多少路再由map.route算。',
              })) } : {}) };
            }) }
            : name === 'map.route'
              ? publicMap.route(args)
              : publicMap.locationStatus();
      const v = value as any,
        status: KnowledgeStatus =
          name === 'map.route' && v.status === 'ready' && (v.distance?.connectorM>0 || v.segments?.some((s:any)=>s.conditions?.length)) ? 'partial' : name === 'map.route' && v.status !== 'ready' && v.status !== 'ok' && v.status !== 'success'
            ? Array.isArray(v.conditionalOrigins) && v.conditionalOrigins.length ? 'partial' : 'unknown'
            : name === 'map.location_status'
              ? 'unknown'
              : 'fresh';
      return {
        status,
        sourceId: 'map:local',
        data: JSON.parse(JSON.stringify(value)),
        fetchedAt: repo.clock.now(),
        coverage: {
          complete: name !== 'map.route' || status === 'fresh',
          scope: 'Shared public ground facts, recorded entrances and explicitly estimated access',
        },
        reason: name === 'map.route' && status === 'partial' ? v.status==='ready'
          ? v.routeBasis === 'recorded_network_with_estimates' && !v.segments?.some((segment: any) => segment.conditions?.length)
            ? `已记录道路这一段已经算好，可以先看这份带接入估计的路线。两端共约${Math.round(v.distance?.connectorM || 0)}米是估计接入，门口、楼内和当天通行仍需现场核对。`
            : v.reason
          : '还缺从原起点接到路网的那一段。候选入口之间已有道路可看，可以先核对从哪个入口出发。' : v.reason,
        simulated: false,
      };
    },
  });
  register({
    manifest: manifest('weather', 'weather:open-meteo', [
      base('weather.lookup', weatherInput, weatherOutput, ['weather:read'], {
        version: '5', displayName: '看看那时的天气', description: '按公开地点查当地今天起七天的预报。date看一天，from/to看具体小时；结果保留原预报、当地时区、资料时间和缺测。日统计也会写明实际统计时段，想看某几小时的雨风就沿小时资料判断。场地是否开放另查场馆来源。',
      }),
      base('air_quality.lookup', airQualityInput, airQualityOutput, ['weather:read'], {
        version: '2', displayName: '看看那里的空气预报', description: '按公开地点查PM2.5、PM10及美国、欧洲两种AQI预报，默认未来24小时，也可选当地今天起五天里的时段。结果会写明预报地点、时段与指数制式，方便结合当天实际感受商量出门安排。',
      }),
    ], ['api.open-meteo.com', 'air-quality-api.open-meteo.com']),
    connectionStatus: () => ({ connected: connections.weatherEnabled(), reason: connections.weatherEnabled() ? undefined : '天气查询还没开启，可以在连接与偏好里打开。' }),
    invoke: async (name, args, ctx) => {
      if (!connections.weatherEnabled()) return { status: 'forbidden', sourceId: 'weather:open-meteo', reason: '天气查询还没开启，可以在连接与偏好里打开；已经查到的路线和安排仍可接着看。', simulated: false };
      if (name === 'air_quality.lookup') {
        const query = airQualityRequest(args, repo.clock.now()), response = await ctx.request(query.url.toString());
        if (!response.ok) throw new HarnessError('air_quality_failed', `空气质量来源这次没有返回预报（HTTP ${response.status}），已有的天气和路线仍可接着看；稍后可沿同一地点与时段再查。`);
        const now = repo.clock.now(), result = airQualityResult(query, await response.json(), now);
        return { status: result.complete ? 'fresh' : 'partial', sourceId: 'weather:open-meteo', data: result.data,
          fetchedAt: now, expiresAt: new Date(Date.parse(now) + 1800000).toISOString(), simulated: false,
          coverage: { complete: result.complete, scope: 'Public-reference CAMS forecast; US and European indices only', until: query.to },
          ...(result.complete ? {} : { reason: '这段时间有些小时还缺数据，已拿到的小时值保留在结果里。可以先看已有部分，或换一个较短时段继续查。' }) };
      }
      const query = weatherRequest(args, repo.clock.now()), response = await ctx.request(query.url.toString());
      if (!response.ok) throw new HarnessError('weather_failed', `天气来源这次没有返回预报（HTTP ${response.status}），已有路线和安排仍可接着看；稍后可沿同一地点与时段再查。`);
      const observedAt = repo.clock.now(), result = weatherResult(query, await response.json(), observedAt);
      return { status: result.complete ? 'fresh' : 'partial', sourceId: 'weather:open-meteo', data: result.data,
        fetchedAt: observedAt, expiresAt: new Date(Math.min(Date.parse(observedAt) + 1800000, Date.parse(dayBounds(dateInZone(observedAt, query.location.timeZone), query.location.timeZone).to))).toISOString(),
        coverage: { complete: result.complete, scope: `${query.location.label}; ${query.from} to ${query.to}; ${query.hourly ? 'hourly' : 'daily'} forecast`, until: query.to }, simulated: false,
        ...(result.complete ? {} : { reason: '这份预报还有缺测或时段未对齐的地方，具体位置随结果留下。想看某几小时的变化，可以沿小时资料继续查。' }) };
    },
  });
  register({
    manifest: manifest('evidence', 'history:self', [
      base(
        'evidence.search',
        z.object({ query: z.string().min(1).max(100) }).strict(),
        z.object({ results: z.array(jsonObject) }).strict(),
        ['evidence:read'],
        { displayName: '找回说过的原话', description: '按文字查已保存的原话，带回原文、说话来由、版本和时间。后来更正或停止使用的部分也会留下说明，接话时可以连同当时的条件一起看。' },
      ),
    ]),
    invoke: (_name, args, ctx) => ({
      status: 'fresh',
      sourceId: 'history:self',
      data: {
        results: repo.searchEvidence(ctx.scope, args.query).map((e) => ({
          id: e.id,
          text: e.text,
          sourceId: e.sourceId,
          contentVersion: e.contentVersion,
          receivedAt: e.receivedAt,
          authority: e.authority,
          use: repo.sourceRestrictions(ctx.scope, e.id).length ? 'historical_only' : 'source_evidence',
          restrictions: repo.sourceRestrictions(ctx.scope, e.id),
        })),
      },
      fetchedAt: repo.clock.now(),
      simulated: false,
    }),
  });
}
