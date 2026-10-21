import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { CampusMapAdapter } from '../mapService';
import { CAMPUS_ACCOUNT_SOURCE_ID, type ZjuAdapter, type CampusDomain } from '../zjuAdapter';
import type { DomainService } from '../storage/domains';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from '../runtime/policy';
import type { CapabilityBroker, CapabilityDefinition, CapabilityProvider, CapabilityResult } from './broker';
import { HarnessError, type KnowledgeStatus } from '../../shared/harness';
import { calendarFieldsSchema, localCalendarChangeSchema } from '../../shared/calendar';
import { expandAgenda, localStamp } from '../actions/calendar';
import { campusQueryInput, validateCampusQuery, requireCampusQueryScope } from './campus-query';
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
  weatherEnabled: () => boolean;
}
const jsonObject = z.record(z.string(), z.json());
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
    domain: z.enum(campusDomains),
    courseId: z.string().regex(/^\d{1,32}$/).optional(),
    academicYear: z.string().regex(/^20\d{2}-20\d{2}$/).optional().describe('选择采集快照的学年；该快照的成绩可能含多个既往学期，不等于按semester_id筛成绩行。'),
    term: z.enum(['1', '2']).optional().describe('选择采集快照的学期；单学期成绩请再用filters的semester_id:eq:真实学期ID筛选，或用真实Scene的campusDisplay.semesterId。'),
    query: z.string().max(100).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    at: z.string().datetime({ offset: true }).optional(),
    timeMode: z.enum(['overlap', 'starts', 'contained']).optional(),
    fields: z
      .array(z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/))
      .max(24)
      .optional(),
    filters: z.array(z.string().max(160)).max(6).optional().describe('规范字段精确筛选，格式field:operator:value，多项AND；如semester_id:eq:YYYY-YYYY-2（ID必须来自真实记录）。不能只在回答中挑出9门却呈现未筛的19门Scene。'),
    sort: z.string().max(100).optional(),
    offset: z.number().int().min(0).max(10000).optional(),
    window: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(50).default(12),
    refresh: z.boolean().default(false),
  })
  .strict();
const campusOverviewInput = z
  .object({
    refresh: z.boolean().default(false),
    includeSensitiveDomains: z.boolean().default(false),
    academicYear: z.string().regex(/^20\d{2}-20\d{2}$/).optional(),
    term: z.enum(['1', '2']).optional(),
  })
  .strict();
const campusAccountOutput = z
  .object({
    domain: z.string(),
    records: z.array(jsonObject),
    conflicts: z.array(jsonObject).optional(),
    source: z.string(),
    institutionId: z.string(),
    termId: z.string(),
    live: z.boolean(),
    origin: z.literal('zju_account'),
    authenticated: z.boolean(),
    total: z.number().int().nonnegative().optional(),
    cached: z.boolean(),
    snapshotAt: z.string().optional(),
    bundleId: z.string().optional(),
    nextOffset: z.number().int().nonnegative().nullable().optional(),
    offset: z.number().int().nonnegative().optional(),
    unknownTimeRecords: z.number().int().nonnegative().optional(),
    sourceCoverage: jsonObject.optional(),
    snapshotProof: jsonObject.optional(),
    snapshotProofs: z.array(jsonObject).optional(),
  })
  .strict();
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
    cached: z.literal(true),
    snapshotAt: z.string().optional(),
  })
  .strict();
export const localActionInput = z
  .object({
    ...calendarFieldsSchema.shape,
    title: z.string().min(1).max(160),
    detail: z.string().max(1500).default('').describe('仅保存用户明确提供且业务对象确实需要的补充内容；没有补充内容时省略或传空字符串，不写“用户要求登记”等内部说明。'),
    startsAt: z.string().datetime({ offset: true }).optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    demo: z.boolean().optional(),
    planRef: z.object({ planId: z.string().min(1).max(160), blockId: z.string().min(1).max(160) }).strict().optional().describe('采用planning.draft返回的具体保存单位时完整保留；宿主再次核对参数、日历、权限、顺序和有效期。'),
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
  if (value?.stale || value?.freshness?.stale) return 'stale';
  if (value?.status === 'forbidden' || value?.status === 'auth_required') return 'forbidden';
  if (value?.status === 'unavailable' || value?.status === 'unsupported') return 'unsupported';
  if (value?.status === 'error' || value?.status === 'failed') return 'failed';
  if (value?.status === 'conflict') return 'conflict';
  if (
    value?.status === 'partial' ||
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
function calendarLocalTimes(item: Record<string, unknown>, fallbackTimeZone: string): Record<string, unknown> {
  const timeZone = typeof item.timeZone === 'string' ? item.timeZone : fallbackTimeZone;
  if (typeof item.startsAt !== 'string') return item.allDayDate ? { ...item, timeZone } : item;
  const endsAt = typeof item.endsAt === 'string' ? item.endsAt : item.endsAt !== null && typeof item.durationMinutes === 'number'
    ? new Date(Date.parse(item.startsAt) + item.durationMinutes * 60000).toISOString() : undefined;
  return { ...item, timeZone, localStartsAt: localStamp(item.startsAt, timeZone), localEndsAt: endsAt ? localStamp(endsAt, timeZone) : null };
}
function safeRecord(value: unknown, depth = 0): any {
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => safeRecord(v, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/^(?:password|secret|token|ticket|cookie|authorization|credential|raw_response|data_path|body_b64|email|phone|mobile|account|sno|xh|yhm|xm|zgh|custid|custmemberid|acctid|cardid|bankacc|cert|schcode|yktschoolcode)$/i.test(key) &&
            !/(身份证|学号|手机号|邮箱)/.test(key),
        )
        .map(([k, v]) => [k, safeRecord(v, depth + 1)]),
    );
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
        if (!campusScopeCurrent(scope)) throw new HarnessError('planning_campus_scope_changed', '校园资料读取范围已改变，未采用旧约束。');
      });
    },
    current: (scope, snapshot) => campusScopeCurrent(scope) && !!connections.campus?.describe().available && snapshot.proofs.length > 0
      && snapshot.proofs.every(proof => connections.campus!.isCurrentSnapshot(proof)),
    currentVersion: (scope, version) => campusScopeCurrent(scope) && !!connections.campus?.describe().available
      && connections.campus.isCurrentSnapshotVersion(version),
  });
  register({
    manifest: manifest('situation', 'current', [base('situation.read', z.object({
      from: z.string().datetime({ offset: true }).describe('跨来源比较所需窗口的起点，to必须在其后且跨度不超过31天；不是整学期原课表查询。'), to: z.string().datetime({ offset: true }).describe('本次综合窗口终点，与from最多相隔31天。'), timeZone: z.string().max(100).default('Asia/Shanghai'),
      limit: z.number().int().min(1).max(20).default(8).describe('各类结果的有界摘录数，不能据此宣称全学期课程完整；它也不会去除来源证明与覆盖说明。'),
    }).strict(), jsonObject, ['evidence:read'], { version: '3', timeoutMs: 90000, worlds: ['real'], displayName: '读取有界当前情境', description: '只在需要跨来源比较时，按最长31天的明确时间窗汇合当前范围允许的本地安排、已接受承诺、有效目标与校园保存快照。单独查看原课表、课程或考试，直接用campus.lookup或campus.query按真实学期、日期、分页读取，其真实sceneRef可交present_view；本工具不是原课表阅读的前置，也不签发课表Scene。已连接并获准时沿原连接器默认读取，可能完成认证或补齐缺少的学期快照，再分页核对课程、考试与校历例外，不必用户重录。日期实例附localStartsAt/localEndsAt和timeZone，未知结束为null。学校计划与本人接受的本地安排分别显示，源采集完整不保证未来不变。未读取、未覆盖和已知空白分开，日历空不证明现实空闲或精力充足。' })]),
    invoke: async (_name, args, ctx) => {
      const scope = policy.validate(ctx.scope), now = repo.clock.now();
      if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self') throw new HarnessError('situation_scope', '个人情境只在本人的现实私有范围内读取。');
      if (Date.parse(args.to) <= Date.parse(args.from) || Date.parse(args.to) - Date.parse(args.from) > 31 * 86400000) throw new HarnessError('time_window', '情境读取须给出有效时间窗，单次不超过31天。');
      const campusSnapshot = await planning.readCampus(scope, args.from, args.to, ctx.signal);
      policy.validate(ctx.scope);
      const campusCalendar = campusSnapshot ? { ...campusConstraintSummary(campusSnapshot),
        items: campusSnapshot.busy.slice(0, args.limit).map(item => calendarLocalTimes({ startsAt: item.start, endsAt: item.end,
          title: item.title, sourceId: item.sourceId, sourceVersion: item.sourceVersion, meaning: '学校快照中的计划安排，不是实际出席或新的日历采用。' }, args.timeZone)),
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
          meaning: '只汇合已存且当前可读的具体来源记录；这次读取不触发联网同步，不能证明学校全量课次、例外或临时变化已覆盖。' };
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
        unknown: ['日历空白不证明现实空闲，仍须核查相关来源覆盖。', '没有本人当前自述时，可用精力、意愿和情绪保持未知。', 'nextAcceptedCommitment仅是当前已读记录中下一项；未读来源仍可能有更早安排。'] };
      return { status: 'fresh', sourceId: 'current', data: JSON.parse(JSON.stringify(data)), fetchedAt: now, coverage: { complete: false, scope: 'bounded allowed local situation; omitted sources remain unknown' }, simulated: false };
    },
  });
  register({
    manifest: manifest('local-agenda', 'local-agenda', [
      base('planning.compare', planningComparisonInput, jsonObject, ['evidence:read'], { version: '2', timeoutMs: 90000, cacheScope: 'handle',
        displayName: '一起商量几种安排', description: '在同一真实日历和原任务条件下比较2–4个完整生活分支。主助手提出各自要保留的东西、原对象改动、尚未接受的拟参加活动和本次任务偏重。同一份工作可以通过taskPreferences.rhythm试连续做或按更短上限拆开做，原本允许拆分才可拆，不缩总时长、不放宽原单段上限。宿主复用原preview/draft计算逐段准备收尾、转场休息、留白与未排任务，workRhythms给真实段落和准备收尾成本，不做人格评分；未排完不能冒充同工作量完整另一版。同结果不会换标题凑数。校园来源获准且可读时读取同一保存快照作为各分支约束。比较只读，邀请仅在相应分支中假设参加，不变成现实承诺；不创建执行planId或写日历。' }),
      base('planning.draft', planningDraftInput, jsonObject, ['evidence:read'], { version: '2', timeoutMs: 90000, displayName: '编排多任务日程草案', description: '只读构造有依赖、期限、可拆分时长、精力、准备清理、转场休息和保护留白的草案；返回未排任务及原因。当前范围允许且已连接时，宿主自动读取同一保存快照的课程、考试与校历例外作为约束，不必把课表手工复制进busy或本机日历。保存快照不是实时确认、出席或本人一定有空。不会替用户接受或自动写日历。采用时按acceptanceProposals顺序完整保留planRef及参数；日历、校园快照或未知条件变化会阻断旧票据，重新试算保留已成功步骤。' }),
      base('planning.recover', planningRecoveryInput, jsonObject, ['evidence:read'], { version: '1', cacheScope: 'handle', worlds: ['real'], displayName: '接着安排未完成的计划', description: '按planId只读核对真实日历里已保存的步骤和当前票据；区分可继续、已经变化、已过期和重启后须重算，避免重复创建已成功的安排。不恢复旧授权，不直接提交。' }),
      ...(planningIntents ? [base('planning.replan', planningIntentReplanInput, jsonObject, ['evidence:read'], { version: '2', timeoutMs: 90000, cacheScope: 'handle', worlds: ['real'], displayName: '接着商量保留的规划', description: '按已读intent id与expectedRevision，回读有来源的原规格、当前日历和真实采用凭据，保留原范围与预算并用同一规划器重新试算。校园来源获准且可读时重新核对保存快照。返回新planId和短票据；不持久修改意图、不复活旧批准，不把已安排当完成。来源、采用或过去进度不明时保留具体缺口。' })] : []),
      base('planning.preview', planningPreviewInput, jsonObject, ['evidence:read'], { version: '1', displayName: '比较可行时段与安排修改', description: '读本地具体日历实例并复用区间计算，比较最多三个方案。固定承诺、可移动已接受块均保留；邀请、愿望、未接受方案不当成硬承诺。空白不等于现实空闲。返回原对象ID/revision绑定的save/change提议和冲突、天气/资源等未知；只读不提交，实际采用通过现有本地动作授权入口。' }),
      base('local.agenda.change', localCalendarChangeSchema, z.object({}).strict(), ['local:write'], { effect: 'local_write', worlds: ['real'], supportsIdempotency: true, supportsInspect: true, supportsCancel: true, description: '按对象版本修改、删除本地安排或更改单个重复实例；事务执行并支持受版本保护的撤销。' }),
      base('local.agenda.save', localActionInput, z.object({}).strict(), ['local:write'], {
        effect: 'local_write',
        worlds: ['real'],
        supportsIdempotency: true,
        supportsInspect: true,
        supportsCancel: true,
      }),
      base(
        'local.agenda.read',
        z.object({ query: z.string().max(100).optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), timeZone: z.string().max(100).optional() }).strict(),
        z.object({ items: z.array(jsonObject), issues: z.array(jsonObject).optional() }).strict(),
        ['evidence:read'],
        { version: '2', description: '按日期范围读取本地未完成安排。日期实例附localStartsAt/localEndsAt和timeZone，保留原始UTC事实，未知结束为null。不填query可读取该时段全部有日期安排；query只对标题作逐字包含筛选，不解析日期、星期或事项类型。带query的空结果只说明标题不匹配，不能证明该日期没有安排。' },
      ),
    ]),
    invoke: async (name, args, ctx) => {
      if (name === 'local.agenda.save' || name === 'local.agenda.change')
        throw new HarnessError('transaction_required', '本地安排必须由受控事务提交。');
      policy.validate(ctx.scope);
      if (name === 'planning.compare') {
        const scope = policy.validate(ctx.scope), input = planningComparisonInput.parse(args);
        if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self' || !scope.sources.includes('local-agenda'))
          throw new HarnessError('planning_scope', '生活安排比较需要本人当前允许的日历范围。');
        const campus = await planning.readCampus(scope, input.draft.from, input.draft.to, ctx.signal);
        ctx.signal.throwIfAborted(); policy.validate(ctx.scope);
        if (campus && !planning.campusCurrent(scope, campus))
          throw new HarnessError('planning_campus_changed', '校园安排快照已变化，先回读再比较。');
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
        displayName: '校园资源、字段与组合查询', description: '查询本人课程、课表、考试、逐科成绩、各学期与总GPA/绩点、实践等原资料。resources发现可读类别，schema查字段；quick/select支持相关分页、关联、汇总、冲突、转场和空档；read回读规范化原对象，history/diff比较快照。成绩保留所有修读、学分、原分数与计入状态；GPA各制式、全修读/首次/最高政策、分母与完整性分开，不以缺失作零。查询只读，不预约、支付或选退课。snapshotProof只说明真实来源快照，不把旧观察变成实时确认。', timeoutMs: 90000, maxBytes: 140000,
      }),
      base(
        'campus.lookup',
        campusInput,
        campusAccountOutput,
        ['campus:read'],
        { version: '2', timeoutMs: 90000, displayName: '本人校园资料', description: '按领域读取本人课程/课表/考试、成绩、GPA/学期绩点、实践与已有校园记录；真实分页或覆盖不完整保留partial和已有记录，不当成没有资料。成绩与GPA逐次核具体用途，保留源采集时间、修读口径、分母和缺失范围。只读，不办理预约、选课或支付。' },
      ),
      base('campus.overview', campusOverviewInput, jsonObject, ['campus:read'], {
        version: '2',
        timeoutMs: 90000,
        maxBytes: 140000,
      }),
    ]),
    connectionStatus: () => {
      const status = connections.campus?.describe();
      return { connected: !!status?.available && status.credentialsConfigured !== false, reason: status?.reason || '尚未连接校园账号', entry: '连接与偏好 → 校园资料' };
    },
    invoke: async (name, args, ctx) => {
      const sourceId = CAMPUS_ACCOUNT_SOURCE_ID;
      const connector = connections.campus?.describe();
      if (!connections.campus || !connector?.available)
        return {
          status: 'not_connected',
          sourceId,
          reason: connector?.reason || '还没有连接浙大校园账号。',
          simulated: false,
        };
      if (name === 'campus.query') {
        const query = validateCampusQuery(args);
        requireCampusQueryScope(policy, ctx.scope, query);
        const result = await connections.campus.query(query, ctx.signal);
        policy.validate(ctx.scope);
        const status: KnowledgeStatus = result.status === 'ok' ? 'fresh' : result.status === 'partial' || result.status === 'navigate_required' ? 'partial' : result.status === 'auth_required' ? 'forbidden' : result.status === 'unavailable' ? 'not_connected' : result.status === 'error' ? 'failed' : 'unknown';
        const observedAt = sourceObservationAt(result);
        return { status, sourceId, data: JSON.parse(JSON.stringify(result)), fetchedAt: observedAt, reason: result.reason,
          coverage: { complete: result.coverage?.complete === true && result.next_offset == null, scope: query.resource || query.spec?.resource || 'capability_metadata' }, simulated: false };
      }
      if (connector.credentialsConfigured === false)
        return {
          status: 'forbidden',
          sourceId,
          reason: '请先在校园资料中登录浙大账号。',
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
          ctx.signal,
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
                authenticated: connector.authStatus === 'verified' || !!result?.authenticatedAt,
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
      if (!['places', 'rules'].includes(args.domain)) {
        const wrapped = (await connections.campus!.read(
          {
            domain: args.domain as CampusDomain,
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
            window: args.window,
            limit: args.limit,
            refresh: args.refresh,
          },
          ctx.signal,
        )) as any;
        const result = wrapped?.data && typeof wrapped.data === 'object' ? wrapped.data : wrapped;
        const snapshotAt = sourceObservationAt(result);
        policy.validate(ctx.scope);
        const records = result.records || result.result || [];
        return {
          status: statusOf(result),
          sourceId,
          data: {
            domain: args.domain,
            records: (Array.isArray(records) ? records : [records])
              .map((r: any) => safeRecord(r))
              .filter((r: any) => r && typeof r === 'object' && !Array.isArray(r)),
            source: '浙江大学本人账号',
            institutionId: 'zju',
            termId: String(result.semester_id || 'unspecified'),
            live: args.refresh,
            origin: 'zju_account',
            authenticated: connector.authStatus === 'verified' || !!result.authenticated_at,
            total: typeof result.total_matches === 'number' ? result.total_matches : undefined,
            cached: !args.refresh,
            snapshotAt,
            ...(typeof result.bundle_id === 'string' ? { bundleId: result.bundle_id } : {}),
            ...(result.next_offset !== undefined ? { nextOffset: result.next_offset } : {}),
            ...(Number.isSafeInteger(result.offset) && result.offset >= 0 ? { offset: result.offset } : {}),
            ...(typeof result.unknown_time_records === 'number' ? { unknownTimeRecords: result.unknown_time_records } : {}),
            ...(result.coverage ? { sourceCoverage: result.coverage } : {}),
            ...(result.snapshotProof ? { snapshotProof: result.snapshotProof } : {}),
            ...(result.snapshotProofs ? { snapshotProofs: result.snapshotProofs } : {}),
          },
          fetchedAt: snapshotAt,
          expiresAt:
            snapshotAt && Number.isFinite(Date.parse(snapshotAt))
              ? new Date(Date.parse(snapshotAt) + 300000).toISOString()
              : undefined,
          coverage: {
            complete: (result.coverage?.complete === true || result.completeness?.complete === true) && result.next_offset == null,
            scope: args.domain,
          },
          reason: result.reason || result.error?.message,
          simulated: false,
        };
      }
      return {
        status: 'unsupported',
        sourceId,
        reason: '这个类别还不能从浙大账号读取；没有改用本地导入资料冒充。',
        simulated: false,
      };
    },
  });
  // A legacy import remains available only for explicit offline migration. It
  // has a different source ID and is never selected when the account skill is
  // configured, so it cannot masquerade as a current ZJU account result.
  register({
    manifest: manifest('campus-import', 'campus:local', [
      base('campus.imported_lookup', campusInput, campusImportOutput, ['campus:read']),
    ]),
    connectionStatus: () => ({ connected: !!repo.getMeta('campus_import_metadata'), reason: '只读已导入的离线快照；它不代表当前校园账号。' }),
    invoke: async (_name, args, ctx) => {
      const metadata = repo.getMeta<{ institutionId: string; termId: string; source: string; updatedAt?: string }>(
        'campus_import_metadata',
      );
      if (!metadata)
        return {
          status: 'unsupported',
          sourceId: 'campus:local',
          reason: '没有离线快照；请登录浙大账号读取本人资料。',
          simulated: false,
        };
      const importedDomain = args.domain === 'practice' || args.domain === 'sports' ? 'sports' : args.domain;
      if (!['schedule', 'exams', 'sports', 'places', 'rules'].includes(importedDomain)) return {
        status: 'unsupported', sourceId: 'campus:local', simulated: false,
        coverage: { complete: false, scope: args.domain },
        reason: '这份本地导入只包含课次、考试、体育、地点和规则；未提供这一类别，不能据此判断该类别没有记录。',
      };
      const result = domains.resolve(ctx.scope, importedDomain, {
        institutionId: metadata.institutionId,
        termId: metadata.termId,
        from: args.from,
        to: args.to,
        query: args.query,
        limit: 6000,
      });
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
      const status = result.status === 'conflict' ? 'conflict' : records.length ? 'stale' : 'not_found';
      return {
        status,
        sourceId: 'campus:local',
        data: {
          domain: args.domain,
          records: records.slice(0, args.limit).map((r) => safeRecord(r.value)),
          materialVersions: records.slice(0, args.limit).map(record => ({ kind: 'domain', id: record.id, revision: record.revision, sourceId: record.sourceId,
            domain: record.domain, institutionId: record.institutionId, termId: record.termId })),
          conflicts: result.conflicts.map((g) => ({ id: g[0].id, sources: g.map((r) => r.sourceId) })),
          source: metadata.source,
          institutionId: metadata.institutionId,
          termId: metadata.termId,
          live: false,
          origin: 'legacy_import',
          authenticated: false,
          total: records.length,
          cached: true,
          snapshotAt: metadata.updatedAt,
        },
        fetchedAt: metadata.updatedAt || records[0]?.fetchedAt,
        coverage: { complete: result.records.length <= args.limit, scope: args.domain },
        reason: '这是本地离线快照，不是当前浙大账号查询。',
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
      }),
      base(
        'map.search',
        z
          .object({ query: z.string().min(1).max(100), limit: z.number().int().min(1).max(10).default(5) })
          .strict(),
        z.object({ matches: z.array(jsonObject) }).strict(),
        ['map:read'],
        { version: '3', subjects: ['self', 'other', 'fictional'], description: '按自然地点名、既有别名或类别检索当前公共地图；可带当前地图标题中的范围限定，范围不是新增地点别名。无匹配先核范围/已有别名，不要求用户背内部名称或猜ID。候选保留公共参考坐标、入口、全部接入候选ID/条件分组与对应来源；摘要不是已选择路线，详细接入由map.route核，完整几何仍在原地图，不是本人位置。' },
      ),
      base('map.route', routeInput, jsonObject, ['map:read'], { subjects: ['self', 'other', 'fictional'] }),
      base('map.location_status', z.object({}).strict(), jsonObject, ['map:read']),
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
            ? { matches: publicMap.search(args.query, args.limit).map(projectMapSearchPoint) }
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
        reason: name === 'map.route' && status === 'partial' ? v.status==='ready' ? '道路段与接入估计分开；虚线接入、条件门点和楼内通行未现场确认，不能将候选路线当作保证可达。' : '原起点到路网的连接仍未知；conditionalOrigins只说明候选入口之间的已记录路段。' : v.reason,
        simulated: false,
      };
    },
  });
  register({
    manifest: manifest('weather', 'weather:open-meteo', [
      base('weather.lookup', weatherInput, weatherOutput, ['weather:read'], {
        version: '3', displayName: '地点与时间窗天气预报', description: '按杭州、紫金港公共参考地点或明确公开参考坐标查询，不读取设备定位、不发送私人坐标。date查当地单日；from/to查小时覆盖并保留日级预报；只覆盖当地今天起七天。缺测为null，获取时间不是发布时间，校园分钟级天气与场地开放仍未知。缓存区分完整地点、时区和时间窗。',
      }),
      base('air_quality.lookup', airQualityInput, airQualityOutput, ['weather:read'], {
        version: '1', displayName: '公共参考地点空气质量预报', description: '按公开参考地点查询未来小时PM2.5、PM10、US AQI与European AQI，默认未来24小时。沿既有环境查询许可，不读取设备GPS；不同AQI制式不可混称中国官方AQI，预报不等于校园实测或个人运动安全保证。',
      }),
    ], ['api.open-meteo.com', 'air-quality-api.open-meteo.com']),
    connectionStatus: () => ({ connected: connections.weatherEnabled(), reason: connections.weatherEnabled() ? undefined : '天气查询未开启。' }),
    invoke: async (name, args, ctx) => {
      if (!connections.weatherEnabled()) return { status: 'forbidden', sourceId: 'weather:open-meteo', reason: '天气查询未开启。', simulated: false };
      if (name === 'air_quality.lookup') {
        const query = airQualityRequest(args, repo.clock.now()), response = await ctx.request(query.url.toString());
        if (!response.ok) throw new HarnessError('air_quality_failed', '空气质量服务未完成查询。');
        const now = repo.clock.now(), result = airQualityResult(query, await response.json(), now);
        return { status: result.complete ? 'fresh' : 'partial', sourceId: 'weather:open-meteo', data: result.data,
          fetchedAt: now, expiresAt: new Date(Date.parse(now) + 1800000).toISOString(), simulated: false,
          coverage: { complete: result.complete, scope: 'Public-reference CAMS forecast; US and European indices only', until: query.to },
          ...(result.complete ? {} : { reason: '来源有缺测或小时覆盖不足，不能当作完整时段结论。' }) };
      }
      const query = weatherRequest(args, repo.clock.now()), response = await ctx.request(query.url.toString());
      if (!response.ok) throw new HarnessError('weather_failed', '天气服务未完成查询。');
      const observedAt = repo.clock.now(), result = weatherResult(query, await response.json(), observedAt);
      return { status: result.complete ? 'fresh' : 'partial', sourceId: 'weather:open-meteo', data: result.data,
        fetchedAt: observedAt, expiresAt: new Date(Math.min(Date.parse(observedAt) + 1800000, Date.parse(dayBounds(dateInZone(observedAt, query.location.timeZone), query.location.timeZone).to))).toISOString(),
        coverage: { complete: result.complete, scope: `${query.location.label}; ${query.from} to ${query.to}; ${query.hourly ? 'hourly' : 'daily'} forecast`, until: query.to }, simulated: false,
        ...(result.complete ? {} : { reason: '来源有缺测或未覆盖全部窗口，null和未覆盖部分保持未知。' }) };
    },
  });
  register({
    manifest: manifest('evidence', 'history:self', [
      base(
        'evidence.search',
        z.object({ query: z.string().min(1).max(100) }).strict(),
        z.object({ results: z.array(jsonObject) }).strict(),
        ['evidence:read'],
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
