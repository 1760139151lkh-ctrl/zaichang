import { z } from 'zod';
import { HarnessError, type KnowledgeStatus } from '../../shared/harness';
import { TIYI_MODULES, TIYI_SOURCE_ID, TIYI_PUBLIC_RULE_REFERENCES, type TiyiModuleResource, type TiyiObservation, type TiyiReadArgs, type TiyiResource } from '../../shared/tiyi';
import type { TiyiAdapter } from '../tiyiAdapter';
import type { PolicyKernel } from '../runtime/policy';
import type { CapabilityBroker, CapabilityDefinition, CapabilityResult, CapabilityProvider, InvocationContext } from './broker';

export const TIYI_READ_GRANT = 'campus:tiyi:read';

const moduleDescriptions: Record<TiyiModuleResource, string> = {
  study_records: '查看学校修学记录入口和当前能打开的内容。个人记录是否已加载会随结果一同说明。',
  exercise: '查看本人的课外锻炼流水与学校审核状态，可能包含历年记录。summary/statistics可看学校计次，record_detail可看单次配速和用时；精细路线保留在本机。',
  notices: '看看学校体艺活动预告和首页通知，包括活动时间、安排与报名入口。',
  teams: '查看运动队入口；mine查看本人队伍，attendance查看考勤页。',
  westward: '查看西迁活动入口和当前内容；需要重新登录时会带回学校的回复。',
  counselling: '查看辅导站入口；subpage=records打开考勤页与学校提供的学期选项。',
  counts: '查看学校次数查询入口与学期选项。有效锻炼次数、实践积分和刷卡流水会保留各自名称。',
  venues: '看看学校有哪些场馆、所选日期有哪些时段，也可查本人订单、同伴和培训。先从目录选venueSiteId，再带searchDate查当天；reservation和art_reservation分别查看体育与艺术场地。这里返回可选时段与价格。',
  fitness_attendance: '查看身体素质课考勤入口和学校这次返回的内容。',
  training: '看看学校培训课程的班次、时间和费用。',
  fitness: '查看体测入口；results看成绩页，schedule看预约日历，feedback看已有反馈页。',
  competitions: '查看本人的比赛入口与学校当前发布的内容。个人记录是否已加载会随结果说明。',
  classes: '查看本人所选学期的体育课程。course_terms提供学校学年和学期，attendance可继续看逐次考勤。返回内容保留课程摘要、每次上课日期与签到状态，便于分清已经发生的出勤和后续课程安排。',
  venue_entries: '查看场馆出入记录入口与学校学期选项，保留入场流水的时间和状态。',
  feedback: '查看学校意见反馈入口和已有反馈。',
  venue_live: '看看学校场地实况页，人数等信息附学校这次回复的时间。',
  graduation_courses: '查看体测与锻炼课入口及其学期选项。个人成绩是否已加载会随结果说明。',
  graduation_report: '打开毕业体艺报告入口，返回当前可读的文字与报告图片地址，并说明这次实际读到了哪部分。',
  codoon: '查看学校提供的咕咚运动入口；连接咕咚需要在它自己的页面完成授权。',
};

const subpages: Partial<Record<TiyiModuleResource, readonly NonNullable<TiyiReadArgs['subpage']>[]>> = {
  teams: ['mine', 'attendance'], counselling: ['records'], fitness: ['results', 'schedule', 'feedback'],
  venues: ['mine', 'orders', 'buddies', 'training', 'reservation', 'art_reservation'],
};
const extraResources = ['profile', 'menus', 'terms', 'summary', 'records', 'record_detail', 'statistics', 'rules', 'course_terms', 'courses', 'attendance'] as const;
const resourceNames = ['profile', ...TIYI_MODULES.map(item => item.resource), ...extraResources] as const;
const reference = z.string().min(1).max(160).regex(/^[^\r\n\0]+$/);
const pageFields = {
  refresh: z.boolean().default(false).describe('默认先看本机最近取得的同项资料，没有时再向学校查询。true重新查询；沿snapshotId续读时保持false。'),
  snapshotId: z.string().regex(/^[a-f0-9]{32}$/).optional().describe('刚才返回的本机记录编号，继续阅读时沿用。'),
  pointer: z.string().max(2048).optional().describe('刚才那份记录给出的正文地址，与snapshotId一起继续查看。'),
  offset: z.number().int().min(0).max(1000000).default(0).describe('从原记录继续的位置；列表按条、文字按Unicode码点计数。下一页入口会带好snapshotId和pointer。'),
  limit: z.number().int().min(1).max(50).default(8).describe('本次展开的条数；原始来源仍完整保存在本机，下一页继续读同一份。'),
};
const queryFields = {
  venueSiteId: reference.optional().describe('学校场馆目录给出的原场地ID；与searchDate同供，连接器会在同模式目录重新核对。'),
  searchDate: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/).refine(value => {
    const day = new Date(value + 'T00:00:00Z');
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
  }, '请使用有效的学校当地日期。').optional().describe('学校当地日期，Asia/Shanghai时区、YYYY-MM-DD格式。与venueSiteId一起查看那天的场地时段。'),
  upstreamPage: z.number().int().min(0).max(100000).optional().describe('向学校查订单或培训列表的第几页，从0开始；下一页入口会带好页码。展开已保存记录则用snapshotId和offset。'),
  schoolYear: reference.optional().describe('学校course_terms返回的schoolYear原值，与termId一起选择体育课程学期。'),
  termId: reference.optional().describe('学校course_terms返回的termId原值。'),
  courseId: reference.optional().describe('本人所选学期课程列表中的courseId，只用于逐次attendance。'),
  recordId: reference.optional().describe('本人运动流水中的sportId，只用于record_detail；连接器会核实属于本人。'),
  begin: z.number().int().nonnegative().safe().optional().describe('statistics起点，Unix毫秒；学校时区Asia/Shanghai。'),
  end: z.number().int().nonnegative().safe().optional().describe('statistics终点，Unix毫秒，与begin间隔不超过两年。'),
  period: z.enum(['WEEK', 'MONTH', 'TERM']).optional().describe('学校statistics按周、月或学期统计，具体起止时间另填begin和end。'),
  validStatus: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional().describe('statistics采用的学校审核状态原值-1/0/1，含义可结合rules和原记录说明查看。'),
  subpage: z.enum(['results', 'schedule', 'feedback', 'records', 'mine', 'attendance', 'orders', 'buddies', 'training', 'reservation', 'art_reservation']).optional(),
};
export const tiyiReadInput = z.object({ resource: z.enum(resourceNames), ...pageFields, ...queryFields }).strict();
const output = z.record(z.string(), z.json());
const venueSelectionSchema = z.object({
  resource: z.literal('venues'), subpage: z.enum(['reservation', 'art_reservation']),
  directoryPointer: z.enum(['/response/data', '/directoryResponse/data']), venueMapField: z.literal('venueInfo'),
  siteMapField: z.literal('venueSiteInfo'), idField: z.literal('id'), dateFormat: z.literal('YYYY-MM-DD'),
  timeZone: z.literal('Asia/Shanghai'),
}).strict();

// Raw replies remain with the local connector. This projection is the model
// boundary, including fixed-snapshot reads, nested objects and page addresses.
const privateField = /token|secret|password|passwd|cookie|authorization|credential|ticket|session|^raw(?:response|bytes)?$|^bodyb64$/i;
const identityField = /^(?:user(?:name|id|no)?|uid|xh|xm|yhm|zgh|sno|student(?:id|no|number|name|num)?|realname|truename|nickname|姓名|学号|身份证(?:号)?|phone(?:number)?|mobile(?:number)?|tel(?:ephone)?|email(?:address)?|account|acctid|custid|card(?:id|no|number)?|bankacc|identity(?:id|no)?|idcard|cert(?:ificate)?(?:no|number)?|imei|deviceid|address|photo|avatar)$/i;
const locationField = /^(?:lat(?:itude)?|lon(?:gitude)?|lng|coordinates?(?:tr)?|coordinatestr|gps|track|trajectory|routePoints|positionList|locations?|sportsList|jsonsports|mapPoints)$/i;
const profileIdentityField = /^(?:name|id|birth|birthday|birthDate)$/i;
const venuePrivateField = /^(?:userphone|orderuid|orderuserid|ordername|doorpwd|ordernocode|ordercode|ordercodelist|buddyno|lockcode)$/i;
const protectedField = (field: string) => {
  const key = field.replace(/[-_]/g, '');
  return privateField.test(key) || identityField.test(key) || venuePrivateField.test(key) || locationField.test(key);
};
const safePointer = (pointer: string) => (pointer === '' || pointer.startsWith('/')) && !pointer.split('/').some(part => protectedField(part.replace(/~1/g, '/').replace(/~0/g, '~')));

function publicText(value: string): string {
  return value.replace(/https?:\/\/[^\s<>"']+/gi, text => {
    try {
      const url = new URL(text);
      url.username = ''; url.password = ''; url.hash = '';
      for (const key of [...url.searchParams.keys()]) if (protectedField(key)) url.searchParams.delete(key);
      return url.toString();
    } catch { return '[学校地址]'; }
  }).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[已隐藏登录信息]');
}

function project(value: unknown, budget: { remaining: number; bytes: number; omitted: boolean; profile: boolean }, depth = 0): unknown {
  if (budget.remaining-- <= 0 || depth > 18) { budget.omitted = true; return undefined; }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    const text = publicText(value), bytes = Buffer.byteLength(text);
    if (bytes > budget.bytes) { budget.omitted = true; return undefined; }
    budget.bytes -= bytes;
    return text;
  }
  if (Array.isArray(value)) {
    const result = [];
    for (const item of value) {
      const next = project(item, budget, depth + 1);
      if (next === undefined) { budget.omitted = true; break; }
      result.push(next);
    }
    return result;
  }
  if (!value || typeof value !== 'object') return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (protectedField(key) || budget.profile && profileIdentityField.test(key)) continue;
    budget.bytes -= Buffer.byteLength(key);
    if (budget.bytes < 0) { budget.omitted = true; break; }
    if (key === 'pointer' && (typeof item !== 'string' || !safePointer(item))) continue;
    if (key === 'children' && Array.isArray(item)) {
      result[key] = item.filter(child => child && typeof child === 'object' && typeof child.pointer === 'string' && safePointer(child.pointer))
        .map(child => project(child, budget, depth + 1)).filter(child => child !== undefined);
      continue;
    }
    const next = project(item, budget, depth + 1);
    if (next !== undefined) result[key] = next;
  }
  return result;
}

function validateRead(args: TiyiReadArgs): TiyiReadArgs {
  if (args.pointer !== undefined && (!args.snapshotId || !safePointer(args.pointer)
    || args.resource === 'profile' && args.pointer.split('/').some(part => profileIdentityField.test(part))))
    throw new HarnessError('tiyi_pointer_forbidden', '请沿这份体艺记录提供的正文地址继续，身份、登录信息和精细位置只留在本机。');
  if (args.offset && !args.snapshotId) throw new HarnessError('tiyi_snapshot_required', '继续下一页时需要刚才那份体艺记录；这样不会把两次查询拼在一起。');
  const filters = ['schoolYear', 'termId', 'courseId', 'recordId', 'begin', 'end', 'period', 'validStatus', 'subpage', 'upstreamPage', 'venueSiteId', 'searchDate'] as const;
  if (args.snapshotId) {
    if (args.refresh || filters.some(key => args[key] !== undefined))
      throw new HarnessError('tiyi_snapshot_parameters', '续读会保留原来的学期和查询范围；要换条件，请另开一次查询。');
    return args;
  }
  const schoolPage = args.resource === 'training' || args.resource === 'venues' && ['orders', 'training'].includes(args.subpage || '');
  const venueSelection = args.resource === 'venues' && (!args.subpage || ['reservation', 'art_reservation'].includes(args.subpage));
  const allowed = new Set<string>(args.resource === 'statistics' ? ['begin', 'end', 'period', 'validStatus']
    : ['courses', 'classes', 'attendance'].includes(args.resource) ? ['schoolYear', 'termId', ...(args.resource === 'attendance' ? ['courseId'] : [])]
      : args.resource === 'record_detail' ? ['recordId'] : subpages[args.resource as TiyiModuleResource] ? ['subpage'] : []);
  if (schoolPage) allowed.add('upstreamPage');
  if (venueSelection) { allowed.add('venueSiteId'); allowed.add('searchDate'); }
  if (filters.some(key => args[key] !== undefined && !allowed.has(key)))
    throw new HarnessError('tiyi_unused_parameters', '这项查询不使用刚才的筛选条件，请按该项的说明查询；学校时间统计、运动详情和体育课程各有自己的入口。');
  if (venueSelection && (args.venueSiteId !== undefined) !== (args.searchDate !== undefined))
    throw new HarnessError('tiyi_venue_selection', '先看学校场馆目录，再把原场地ID和想看的学校当地日期一起带上。');
  if (['courses', 'classes', 'attendance'].includes(args.resource) && (!args.schoolYear || !args.termId))
    throw new HarnessError('tiyi_term_required', '先查看体艺课程学期，再按学校提供的学年和学期读取课程。');
  if (args.resource === 'attendance' && !args.courseId)
    throw new HarnessError('tiyi_course_required', '请先从本人的体育课程中选出这门课，再查看逐次考勤。');
  if (args.resource === 'record_detail' && !args.recordId)
    throw new HarnessError('tiyi_record_required', '请先查看本人的锻炼流水，再沿其中的运动记录打开详情。');
  if (args.resource === 'statistics' && (args.begin === undefined || args.end === undefined || !args.period || args.end < args.begin || args.end - args.begin > 730 * 86400000))
    throw new HarnessError('tiyi_statistics_range', '学校统计需要明确的起止时间和周、月或学期口径，时间范围不能超过两年。');
  if (args.subpage && !subpages[args.resource as TiyiModuleResource]?.includes(args.subpage))
    throw new HarnessError('tiyi_subpage_unknown', '这项体艺功能没有这个子页面，请按它提供的入口继续。');
  return args;
}

function sourceChildren(observation: TiyiObservation) {
  const value = observation.data, root = observation.coverage.pointer ?? '';
  if (!observation.snapshotId || !value || typeof value !== 'object') return [];
  const originalChildren = !Array.isArray(value) && (observation.coverage.navigationOnly || (value as { navigationOnly?: unknown }).navigationOnly === true
    || Object.keys(value).length === 1) && Array.isArray((value as { children?: unknown }).children)
    ? (value as { children: { pointer?: unknown; kind?: unknown; count?: unknown }[] }).children : undefined;
  // A connector directory is synthetic; its children already point into the
  // real response. Appending /children would invent a nonexistent source path.
  if (originalChildren) return originalChildren.filter(child => child && typeof child.pointer === 'string' && safePointer(child.pointer))
    .slice(0, 12).map(child => ({ pointer: child.pointer as string,
      kind: typeof child.kind === 'string' ? child.kind.slice(0, 30) : 'unknown',
      sourceReference: { sourceId: TIYI_SOURCE_ID, resource: observation.resource, snapshotId: observation.snapshotId, pointer: child.pointer as string } }));
  return Object.entries(value).filter(([key]) => !protectedField(key) && !(observation.resource === 'profile' && profileIdentityField.test(key)))
    .slice(0, 12).map(([key, child]) => {
    const segment = Array.isArray(value) ? String((observation.coverage.offset ?? 0) + Number(key)) : key;
    const pointer = root + '/' + segment.replace(/~/g, '~0').replace(/\//g, '~1');
    return { pointer, kind: Array.isArray(child) ? 'array' : child === null ? 'null' : typeof child,
      ...(Array.isArray(child) || typeof child === 'string' ? { size: child.length } : {}),
      sourceReference: { sourceId: TIYI_SOURCE_ID, resource: observation.resource, snapshotId: observation.snapshotId, pointer } };
  });
}

function resultOf(observation: TiyiObservation, capability: string, args: TiyiReadArgs): CapabilityResult {
  const budget = { remaining: 3000, bytes: 70000, omitted: false, profile: args.resource === 'profile' };
  const projected = observation.data === undefined ? undefined : project(observation.data, budget);
  const payload = budget.omitted ? undefined : projected;
  const source = observation.coverage;
  const venueSelection = args.resource === 'venues' ? venueSelectionSchema.safeParse(source.venueSelection) : undefined;
  const venueSource = venueSelection?.success === true;
  const page = source.kind === 'official_page';
  const catalog = source.kind === 'catalog';
  const navigationOnly = source.navigationOnly === true || !!payload && typeof payload === 'object' && !Array.isArray(payload)
    && ((payload as { navigationOnly?: unknown }).navigationOnly === true
      || Object.keys(payload).length === 1 && Array.isArray((payload as { children?: unknown }).children));
  const explicitlyNonPersonal = venueSource || !!observation.data && typeof observation.data === 'object' && !Array.isArray(observation.data)
    && (observation.data as { recordRead?: unknown }).recordRead === false;
  const venueDataRead = venueSource && !budget.omitted && !navigationOnly && !page && !catalog
    && observation.data !== undefined && !observation.error;
  const recordRead = !explicitlyNonPersonal && !page && !catalog && !navigationOnly && !budget.omitted && observation.data !== undefined && !observation.error;
  const hasSource = observation.data !== undefined && !!observation.snapshotId;
  const complete = source.complete && !budget.omitted && !page && !catalog && !navigationOnly;
  const status: KnowledgeStatus = observation.status === 'auth_required' ? 'not_connected'
    : observation.status === 'unavailable' ? 'failed'
      : observation.status === 'saved' ? complete ? 'stale' : 'partial'
        : !complete ? 'partial' : 'fresh';
  const next = source.next && safePointer(source.next.pointer || '') ? {
    tool: 'look_up', arguments: { source: 'capability', capability,
      arguments: { ...(capability === 'tiyi.read' ? { resource: args.resource } : {}), snapshotId: source.next.snapshotId,
        offset: source.next.offset, ...(source.next.pointer !== undefined ? { pointer: source.next.pointer } : {}), limit: args.limit ?? 8 } },
  } : undefined;
  const schoolNext = source.upstreamNext && tiyiReadInput.safeParse({ ...source.upstreamNext, refresh: true, limit: args.limit ?? 8 });
  const schoolContinuation = schoolNext && schoolNext.success && schoolNext.data.resource === args.resource ? {
    tool: 'look_up', arguments: { source: 'capability', capability: 'tiyi.read', arguments: validateRead(schoolNext.data) },
    meaning: '继续向学校查询列表的下一页；期间列表可能更新。要继续展开刚才保存的内容，沿原snapshotId和pointer读取。',
  } : undefined;
  return {
    status, sourceId: TIYI_SOURCE_ID, observedAt: observation.observedAt, fetchedAt: observation.fetchedAt,
    ...(hasSource && !budget.omitted ? { delivery: { kind: 'page' as const, complete: true as const } } : {}),
    data: { resource: args.resource, source: '浙江大学体艺本人账号', recordRead, ...(venueDataRead ? { venueDataRead: true } : {}), ...(payload !== undefined ? { content: payload } : {}),
      ...(venueSource ? { personalRecordRead: false } : {}),
      ...(observation.snapshotId ? { snapshotId: observation.snapshotId } : {}),
      sourceCoverage: { ...source, complete, scope: 'returned_response',
        meaning: page ? '学校页面已经打开，个人数据的部分眼下尚未读到。'
          : catalog ? '这是学校提供的功能目录，还没有读取目录下的个人记录。'
            : '这里是学校这次返回的内容，范围和后续页列在同一份结果里。' },
      ...(next ? { continuation: next } : {}),
      ...(schoolContinuation ? { schoolContinuation } : {}),
      ...(venueSelection?.success && observation.snapshotId ? { venueSelection: {
        ...venueSelection.data,
        directoryRead: { tool: 'look_up', arguments: { source: 'capability', capability: 'tiyi.read',
          arguments: { resource: 'venues', snapshotId: observation.snapshotId, pointer: venueSelection.data.directoryPointer, limit: args.limit ?? 8 } } },
        timesQuery: { capability: 'tiyi.read', resource: 'venues', subpage: venueSelection.data.subpage,
          requiredFields: ['venueSiteId', 'searchDate'] },
        meaning: '从目录挑一个场地，带上它的id和学校当地日期，就能看看当天有哪些时段。这里还没有预留场地。',
      } } : {}),
      ...(observation.snapshotId && source.pointer !== undefined && safePointer(source.pointer) ? {
        sourceReference: { sourceId: TIYI_SOURCE_ID, resource: args.resource, snapshotId: observation.snapshotId, pointer: source.pointer },
      } : {}),
      ...(budget.omitted || navigationOnly ? { navigationRequired: true,
        ...(budget.omitted ? { sourceNavigation: sourceChildren(observation) } : {}),
        meaning: '这项内容较多，沿下面的子项可以接着打开正文。' } : {}),
      ...(observation.error ? { error: { code: observation.error.code, ...(observation.error.httpStatus ? { httpStatus: observation.error.httpStatus } : {}) } } : {}),
      meaning: budget.omitted || navigationOnly ? '正文还没展开完，可以沿同一份记录的入口接着看。'
        : venueDataRead ? '学校的场馆目录或当天时段已带回，包含这次查询的空闲、容量、占用和使用条件；选中的时段还没有预留。'
        : page ? '学校入口页已打开，个人数据还没读到；这一步暂时看不到个人记录。'
        : recordRead ? '这是学校这次返回的体艺内容，汇总、运动流水和审核状态保留着学校各自的名称。'
          : '这次还没拿到个人体艺内容，学校回复和连接情况在原因中。',
    },
    coverage: { complete, scope: `体艺 ${args.resource}；本次学校响应的当前页` },
    ...(observation.error?.message ? { reason: publicText(observation.error.message).slice(0, 500) }
      : page ? { reason: '读到了学校页面正文，页面内另行加载的个人记录还没有取得。' }
        : budget.omitted ? { reason: '还有正文没有展开，请沿同一份记录继续读取。' }
          : observation.status === 'saved' ? { reason: '这是本机保存的学校记录，采集时间见来源；需要当前情况时可重新查询。' } : {}),
    simulated: false,
  };
}

function definition(name: string, label: string, description: string, input: z.ZodType): CapabilityDefinition {
  return { name, displayName: label, description, version: '2', input, output, effect: 'read',
    requiredScopes: name === 'tiyi.catalog' ? ['campus:read'] : ['campus:read', TIYI_READ_GRANT], subjects: ['self'], worlds: ['real'], timeoutMs: 90000,
    maxBytes: 120000, supportsIdempotency: false, supportsInspect: false, supportsCancel: false };
}

/** Register the existing connector with the original broker; no alternate loop. */
export function registerTiyi(broker: CapabilityBroker, policy: PolicyKernel, getAdapter: () => TiyiAdapter | undefined): void {
  const capabilities = TIYI_MODULES.map(module => definition(`tiyi.${module.resource}`, `浙大体艺·${module.label}`, moduleDescriptions[module.resource],
    z.object({ ...pageFields,
      ...(module.resource === 'classes' ? { schoolYear: queryFields.schoolYear, termId: queryFields.termId } : {}),
      ...(subpages[module.resource] ? { subpage: z.enum(subpages[module.resource] as [string, ...string[]]).optional() } : {}),
      ...(['venues', 'training'].includes(module.resource) ? { upstreamPage: queryFields.upstreamPage } : {}),
      ...(module.resource === 'venues' ? { venueSiteId: queryFields.venueSiteId, searchDate: queryFields.searchDate } : {}),
    }).strict()));
  capabilities.push(definition('tiyi.catalog', '浙大体艺查询目录', '看看本机有哪些体艺查询入口，以及学期、统计和详情怎样继续打开。账号当前开放哪些项目可另查menus。', z.object({}).strict()));
  capabilities.push(definition('tiyi.read', '浙大体艺学期、记录与统计', '查看学校菜单、学期、本人资料与体艺内容。summary看运动汇总，records看流水，record_detail看单次详情，statistics按时间统计，rules看规则，course_terms看课程学期，courses看体育课，attendance看逐次考勤。也可选择目录里的十九项入口；后续页沿snapshotId和pointer继续。', tiyiReadInput));
  const check = (ctx: InvocationContext, records = true) => {
    ctx.signal.throwIfAborted();
    const scope = policy.validate(ctx.scope);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self')
      throw new HarnessError('scope_mismatch', '个人体艺记录只在本人的私下对话中读取；对外内容需另行选择要分享的部分。');
    for (const grant of records ? ['campus:read', TIYI_READ_GRANT] : ['campus:read']) policy.require(ctx.scope, grant);
    if (!scope.sources.includes(TIYI_SOURCE_ID)) throw new HarnessError('source_forbidden', '这次允许读取的资料中没有体艺记录。');
  };
  const provider: CapabilityProvider = {
    manifest: { id: 'zju-tiyi', version: '2', trust: 'bundled_reviewed', sourceId: TIYI_SOURCE_ID, capabilities,
      egressHosts: ['zjuam.zju.edu.cn', 'www.tyys.zju.edu.cn', 'tyys.zju.edu.cn', 'webvpn.zju.edu.cn'], platforms: ['win32'], simulated: false,
      offline: 'read_cache', license: 'Project source; school services retain their own rights; signing compatibility remains a local separately supplied component' },
    connectionStatus: name => {
      if (name === 'tiyi.catalog') return { connected: true };
      const state = getAdapter()?.describe();
      return { connected: !!state?.configured && (state.credentialsConfigured || state.sessionSaved),
        ...(state?.reason ? { reason: state.reason } : !state ? { reason: '这台电脑尚未配置体艺连接；查询目录仍可查看。' } : {}), entry: '校园连接·浙大体艺' };
    },
    invoke: async (name, raw, ctx) => {
      check(ctx, name !== 'tiyi.catalog');
      if (name === 'tiyi.catalog') return {
        status: 'fresh', sourceId: TIYI_SOURCE_ID, simulated: false,
        data: { catalogOnly: true, recordRead: false, connection: { configured: getAdapter()?.describe().configured === true,
          reason: getAdapter()?.describe().reason ?? (getAdapter() ? null : '这台电脑尚未配置体艺连接。') },
          modules: TIYI_MODULES.map(module => ({ ...module,
          capability: `tiyi.${module.resource}`, description: moduleDescriptions[module.resource],
          ...(subpages[module.resource] ? { subpages: [...subpages[module.resource]!] } : {}),
          describe: { tool: 'look_up', arguments: { source: 'capability', capability: `tiyi.${module.resource}`, describeOnly: true } },
        })), supportingResources: [...extraResources], publicRuleReferences: [...TIYI_PUBLIC_RULE_REFERENCES],
          meaning: '这里列着本机的体艺查询入口。选中一项后，可以看看学校为这个账号返回了什么。',
          schoolSubmissionAvailable: false },
        coverage: { complete: true, scope: '本机十九项体艺查询用法' },
      };
      const resource = name === 'tiyi.read' ? raw.resource : name.slice('tiyi.'.length);
      const args = validateRead({ ...raw, resource });
      const adapter = getAdapter();
      if (!adapter) return { status: 'not_connected', sourceId: TIYI_SOURCE_ID, simulated: false,
        reason: '这台电脑尚未配置体艺连接；先在校园连接中保存账号和本机体艺组件，再继续这项查询。',
        coverage: { complete: false, scope: `体艺 ${resource}` } };
      let observation: TiyiObservation;
      try { observation = await adapter.read(args, ctx.signal); }
      catch (error) {
        check(ctx);
        // The adapter's process boundary already replaces raw Python, network
        // and filesystem failures with bounded public messages.
        throw new HarnessError('tiyi_read_failed', error instanceof Error ? publicText(error.message).slice(0, 500)
          : '本机体艺连接程序没有完成这次查询，请检查连接设置后重试。');
      }
      check(ctx);
      return resultOf(observation, name, args);
    },
  };
  broker.register(provider, { reviewed: true, source: 'bundled Tiyi read-only connector review' });
}
