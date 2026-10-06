import { z } from 'zod';
import type { CampusMapAdapter } from '../mapService';
import { CAMPUS_ACCOUNT_SOURCE_ID, type ZjuAdapter, type CampusDomain } from '../zjuAdapter';
import type { DomainService } from '../storage/domains';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from '../runtime/policy';
import type { CapabilityBroker, CapabilityDefinition, CapabilityProvider, CapabilityResult } from './broker';
import { HarnessError, type KnowledgeStatus } from '../../shared/harness';
import { calendarFieldsSchema, localCalendarChangeSchema } from '../../shared/calendar';
import { expandAgenda } from '../actions/calendar';
import { campusQueryInput, validateCampusQuery, requireCampusQueryScope } from './campus-query';

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
    academicYear: z.string().regex(/^20\d{2}-20\d{2}$/).optional(),
    term: z.enum(['1', '2']).optional(),
    query: z.string().max(100).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    at: z.string().datetime({ offset: true }).optional(),
    timeMode: z.enum(['overlap', 'starts', 'contained']).optional(),
    fields: z
      .array(z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/))
      .max(24)
      .optional(),
    filters: z.array(z.string().max(160)).max(6).optional(),
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
  })
  .strict();
const campusImportOutput = z
  .object({
    domain: z.string(),
    records: z.array(jsonObject),
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
    value?.coverage?.complete === false ||
    value?.completeness?.complete === false
  )
    return 'unknown';
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
) {
  const register = (provider: CapabilityProvider) =>
    broker.register(provider, { reviewed: true, source: 'bundled source review' });
  register({
    manifest: manifest('local-agenda', 'local-agenda', [
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
        { description: '按日期范围读取本地未完成安排。不填query可读取该时段全部有日期安排；query只对标题作逐字包含筛选，不解析日期、星期或事项类型。带query的空结果只说明标题不匹配，不能证明该日期没有安排。' },
      ),
    ]),
    invoke: (name, args, ctx) => {
      if (name === 'local.agenda.save' || name === 'local.agenda.change')
        throw new HarnessError('transaction_required', '本地安排必须由受控事务提交。');
      policy.validate(ctx.scope);
      const items = repo.db
        .prepare('SELECT payload FROM agenda')
        .all()
        .map((r) => JSON.parse(String(r.payload)))
        .filter((a) => !a.done && (!args.query || a.title.includes(args.query)));
      if (args.from || args.to) {
        if (!args.from || !args.to) throw new HarnessError('time_window', '按时间查询需要明确起止范围。');
        const expanded = expandAgenda(items, args.from, args.to, args.timeZone || 'Asia/Shanghai');
        const titleFilter = args.query ? `; title contains ${JSON.stringify(args.query)}` : '; no title filter';
        return { status: expanded.status, sourceId: 'local-agenda', data: { items: expanded.items, issues: expanded.issues }, coverage: { complete: expanded.coverage.complete, scope: `dated occurrences from ${args.from} to ${args.to}; undated tasks excluded${titleFilter}` }, fetchedAt: repo.clock.now(), simulated: false };
      }
      return {
        status: items.length ? 'fresh' : 'known_absent',
        sourceId: 'local-agenda',
        data: { items },
        coverage: { complete: true, scope: `unfinished local agenda${args.query ? `; title contains ${JSON.stringify(args.query)}` : '; no title filter'}` },
        fetchedAt: repo.clock.now(),
        simulated: false,
      };
    },
  });
  register({
    manifest: manifest('campus-read', CAMPUS_ACCOUNT_SOURCE_ID, [
      base('campus.query', campusQueryInput, jsonObject, ['campus:read'], {
        displayName: '校园资源、字段与组合查询', description: 'resources发现可读类别，schema查字段；quick/select支持完整相关分页、关联、汇总、冲突、转场和空档；read回读规范化原对象，history/diff比较快照。查询只读，不预约、支付或选退课；总量、分母、覆盖、原始状态与观察时间分别保留。', timeoutMs: 90000, maxBytes: 140000,
      }),
      base(
        'campus.lookup',
        campusInput,
        campusAccountOutput,
        ['campus:read'],
        { timeoutMs: 90000 },
      ),
      base('campus.overview', campusOverviewInput, jsonObject, ['campus:read'], {
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
          },
          fetchedAt: snapshotAt,
          expiresAt:
            snapshotAt && Number.isFinite(Date.parse(snapshotAt))
              ? new Date(Date.parse(snapshotAt) + 300000).toISOString()
              : undefined,
          coverage: {
            complete: result.coverage?.complete === true || result.completeness?.complete === true,
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
        { subjects: ['self', 'other', 'fictional'] },
      ),
      base('map.route', routeInput, jsonObject, ['map:read'], { subjects: ['self', 'other', 'fictional'] }),
      base('map.location_status', z.object({}).strict(), jsonObject, ['map:read']),
    ]),
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
            ? { matches: publicMap.search(args.query, args.limit) }
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
    manifest: manifest(
      'weather',
      'weather:open-meteo',
      [
        base(
          'weather.lookup',
          z
            .object({
              days: z.number().int().min(1).max(7).default(3),
              location: z.literal('Hangzhou').default('Hangzhou'),
            })
            .strict(),
          z
            .object({
              location: z.string(),
              timeZone: z.string(),
              forecast: z
                .object({
                  time: z.array(z.string()),
                  weather_code: z.array(z.number()),
                  temperature_2m_max: z.array(z.number()),
                  temperature_2m_min: z.array(z.number()),
                  precipitation_probability_max: z.array(z.number()),
                })
                .strict(),
            })
            .strict(),
          ['weather:read'],
        ),
      ],
      ['api.open-meteo.com'],
    ),
    invoke: async (_name, args, ctx) => {
      if (!connections.weatherEnabled())
        return {
          status: 'forbidden',
          sourceId: 'weather:open-meteo',
          reason: '天气查询未开启。',
          simulated: false,
        };
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({
        latitude: '30.2741',
        longitude: '120.1551',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        timezone: 'Asia/Shanghai',
        forecast_days: String(args.days),
      }).toString();
      const response = await ctx.request(url.toString());
      if (!response.ok) throw new HarnessError('weather_failed', '天气服务未完成查询。');
      const data = (await response.json()) as any;
      return {
        status: 'fresh',
        sourceId: 'weather:open-meteo',
        data: { location: '杭州城市参考坐标（非用户定位）', timeZone: 'Asia/Shanghai', forecast: data.daily },
        fetchedAt: repo.clock.now(),
        expiresAt: new Date(Date.parse(repo.clock.now()) + 1800000).toISOString(),
        coverage: {
          complete: true,
          scope: 'Hangzhou forecast for ' + args.days + ' days',
          until: data.daily?.time?.at(-1),
        },
        simulated: false,
      };
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
        })),
      },
      fetchedAt: repo.clock.now(),
      simulated: false,
    }),
  });
}
