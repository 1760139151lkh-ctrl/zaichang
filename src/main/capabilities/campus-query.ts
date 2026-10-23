import { z } from 'zod';
import { HarnessError } from '../../shared/harness';
import type { PolicyKernel } from '../runtime/policy';
import type { ScopeHandle } from '../../shared/harness';

export const campusResources = ['classes', 'courses', 'exams', 'grades', 'gpa_semesters', 'gpa_overall', 'gpa_cumulative', 'retakes', 'projects', 'practice_summary', 'todos', 'activities', 'holidays', 'calendar_pending', 'cancelled_classes', 'source_status', 'reservations', 'reservation_violations', 'card_accounts', 'transactions', 'student_profile', 'roles'] as const;
const resource = z.enum(campusResources);
const field = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,100}$/);
const sensitive = /^(password|passwd|secret|token|ticket|cookie|authorization|credential|raw_response|body_b64|email|phone|mobile|account|student.?id|student.?no|card.?no|identity.?id|sno|xh|yhm|xm|zgh|custid|acctid|cardid|bankacc|cert)$/i;
const where = z.record(z.string(), z.json()).describe('筛选DSL：单项用{field,op,value}，字段名取自schema；op为eq/ne/in/not_in/contains/starts_with/ends_with/length_gt/length_eq/gt/gte/lt/lte/missing/exists。and或or的值为条件数组，not的值为条件对象；any/all的值为{field,where}。不支持把字段名直接当对象键。');
const sort = z.array(z.union([field, z.object({ field, descending: z.boolean().optional() }).strict()])).max(12);
export const campusSelectSchema = z.object({
  resource, resources: z.array(resource).max(5).optional(),
  operation: z.enum(['select', 'aggregate', 'conflicts', 'transitions', 'gaps']).optional(),
  time: z.object({ from: z.string().max(50).optional(), to: z.string().max(50).optional(), at: z.string().max(50).optional(), window: z.string().max(40).optional(), mode: z.enum(['overlap', 'starts', 'contained']).optional(), field: field.optional(), end_field: field.optional() }).strict().optional(),
  where: where.optional(), after_join_where: where.optional(), having: where.optional(),
  join: z.object({ resource, left_on: field, right_on: field, as: field.optional(), kind: z.enum(['left', 'inner']).optional() }).strict().optional(),
  fields: z.array(field).max(40).optional(), group_by: z.array(field).max(8).optional(), distinct: z.array(field).max(8).optional(),
  metrics: z.array(z.object({ op: z.enum(['count', 'count_where', 'fraction', 'count_distinct', 'sum', 'mean', 'median', 'min', 'max', 'first', 'last', 'weighted_mean']), field: field.optional(), weight: field.optional(), where: where.optional().describe('指标内where仅适用于count_where和fraction。sum/mean/weighted_mean等必须用外层spec.where先筛选，不能以指标内where改变分母。'), as: field.optional() }).strict()).max(16).optional(),
  sort: sort.optional(), order_by: sort.optional(), offset: z.number().int().min(0).max(1000000).optional(), limit: z.number().int().min(1).max(100).optional(),
}).strict();
export const campusQueryInput = z.object({
  operation: z.enum(['resources', 'schema', 'quick', 'select', 'read', 'history', 'diff']),
  resource: resource.optional(), model: z.string().regex(/^[a-z_]{1,60}$/).optional().describe('schema操作必填。先从resources返回的模型目录选择规范化模型名；资源名与模型名不一定相同。'),
  spec: campusSelectSchema.optional(),
  bundleId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  expectedSnapshotVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  fromBundle: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(), toBundle: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  pointer: z.string().max(500).optional(), fields: z.array(field).max(40).optional(),
  offset: z.number().int().min(0).max(1000000).default(0).describe('本次分页起点；spec未另填offset时也适用于组合查询。'),
  limit: z.number().int().min(1).max(50).default(8).describe('本次返回条数；spec未另填limit时也适用于组合查询，不截短原始数据。'),
  refresh: z.boolean().default(false).describe('false读取现有快照，不因缺数据启动采集。quick/select的true按根resource相关来源窄刷新，依赖同账号、同学期的当前latest基线；关联资源仍各有实际采集时间。原连接器会在本机读取和归一化旧完整学业快照，宿主一并核这份用途与实际新采集范围。缺基线不全采，固定bundle/version与续页保持false；明确整包更新另用campus.overview。'), academicYear: z.string().regex(/^20\d{2}-20\d{2}$/).optional(), term: z.enum(['1', '2']).optional(),
}).strict();
export type CampusQuery = z.infer<typeof campusQueryInput>;
export const examCourseRecordsPointer = '/normalized/exam_course_records';
const grants: Partial<Record<(typeof campusResources)[number], string>> = {
  grades: 'campus:grades:read', retakes: 'campus:grades:read', gpa_semesters: 'campus:gpa:read', gpa_overall: 'campus:gpa:read', gpa_cumulative: 'campus:gpa:read',
  reservations: 'campus:reservations:read', reservation_violations: 'campus:reservations:read', card_accounts: 'campus:card:read', transactions: 'campus:transactions:read', student_profile: 'campus:profile:read', roles: 'campus:profile:read',
};
export const normalizedRoots: Record<(typeof campusResources)[number], string> = {
  classes: '/normalized/occurrences', courses: '/normalized/courses', exams: '/normalized/exams', grades: '/normalized/transcript/grades', gpa_semesters: '/normalized/transcript/semesters', gpa_overall: '/normalized/transcript/overall_', gpa_cumulative: '/normalized/transcript/cumulative_by_semester_all_attempts', retakes: '/normalized/transcript/repeat_groups', projects: '/normalized/practice/items', practice_summary: '/normalized/practice/official_summary', todos: '/normalized/todos', activities: '/normalized/activities', holidays: '/normalized/calendar', calendar_pending: '/normalized/schedule_quality/pending_calendar_events', cancelled_classes: '/normalized/schedule_quality/cancelled_by_calendar', source_status: '/normalized/field_dictionary', reservations: '/normalized/items', reservation_violations: '/normalized/items', card_accounts: '/normalized/items', transactions: '/normalized/items', student_profile: '/normalized/items', roles: '/normalized/items',
};

export function validateCampusQuery(raw: unknown) {
  const input = campusQueryInput.parse(raw);
  const examCourseRead = input.pointer === examCourseRecordsPointer;
  if (examCourseRead && (input.operation !== 'read' || input.resource !== 'exams'))
    throw new HarnessError('exam_course_read_only', '考试课程原行只沿exams资源的固定read地址读取；它不是考试事件查询或组合查询。');
  if (examCourseRead && (input.fields !== undefined || input.spec !== undefined || input.model !== undefined
    || input.academicYear !== undefined || input.term !== undefined || input.fromBundle !== undefined || input.toBundle !== undefined || input.refresh))
    throw new HarnessError('exam_course_read_parameters', '这个地址按原快照顺序读取完整课程原行，只接受快照、版本、offset和limit；字段、筛选、学期选择或刷新不能缩窄这次读取。');
  if (input.spec && !['quick', 'select'].includes(input.operation))
    throw new HarnessError('query_spec_operation', 'spec用于quick或select；read按原对象指针、diff按顶层fields取用，不能用会被忽略的spec缩窄它们。');
  if (!['resources', 'schema'].includes(input.operation) && !input.resource && !input.spec) throw new HarnessError('resource_required', '先选择具体资源，不能默认读取所有个人资料。');
  if (input.operation === 'schema' && !input.model) throw new HarnessError('model_required', '请选择要了解的字段模型。');
  if (input.operation === 'select' && !input.spec) throw new HarnessError('query_required', '组合查询需要具体spec。');
  if (input.spec && input.resource && input.spec.resource !== input.resource) throw new HarnessError('resource_mismatch', '声明资源与查询资源不一致。');
  if (input.spec?.resources?.length === 1 && input.spec.resources[0] !== input.spec.resource)
    throw new HarnessError('resource_mismatch', 'resources只列一类时须与resource一致；不同资源的组合需要明确列出各资源或关联。');
  if (input.spec) input.spec = { ...input.spec, offset: input.spec.offset ?? input.offset, limit: input.spec.limit ?? input.limit };
  const validateWhere = (expression: any, depth = 0): void => {
    if (expression === undefined || expression === null) return;
    if (depth > 12 || !expression || typeof expression !== 'object' || Array.isArray(expression)) throw new HarnessError('query_filter', '筛选需要条件对象，嵌套不超过12层。');
    const logic = ['and', 'or', 'not', 'any', 'all'].filter(key => key in expression);
    if (logic.length) {
      if (logic.length !== 1 || Object.keys(expression).length !== 1) throw new HarnessError('query_filter', '每层条件只使用一个逻辑组合；多个条件放入and/or数组。');
      const key = logic[0], value = expression[key];
      if (key === 'and' || key === 'or') {
        if (!Array.isArray(value)) throw new HarnessError('query_filter', 'and/or的值必须是条件数组。');
        for (const item of value) validateWhere(item, depth + 1);
      } else if (key === 'not') validateWhere(value, depth + 1);
      else {
        if (!value || typeof value !== 'object' || typeof value.field !== 'string') throw new HarnessError('query_filter', 'any/all需要数组field和子条件where。');
        validateWhere(value.where, depth + 1);
      }
      return;
    }
    if (typeof expression.field !== 'string' || Object.keys(expression).some(key => !['field', 'op', 'value'].includes(key))) throw new HarnessError('query_filter', '单项筛选用{field,op,value}；不要把字段名直接当键。');
    if (!['missing', 'exists', 'eq', 'ne', 'in', 'not_in', 'contains', 'starts_with', 'ends_with', 'length_gt', 'length_eq', 'gt', 'gte', 'lt', 'lte'].includes(expression.op || 'eq')) throw new HarnessError('query_filter', '筛选运算不支持；请使用schema列出的op。');
    if (['in', 'not_in'].includes(expression.op) && !Array.isArray(expression.value)) throw new HarnessError('query_filter', 'in/not_in的value必须是数组。');
  };
  for (const expression of [input.spec?.where, input.spec?.after_join_where, input.spec?.having, ...(input.spec?.metrics || []).map(metric => metric.where)]) validateWhere(expression);
  if (input.spec?.metrics?.some(metric => metric.where !== undefined && !['count_where', 'fraction'].includes(metric.op)))
    throw new HarnessError('query_metric_filter', '这个汇总运算不支持指标内where；请用外层spec.where筛选后汇总，避免分母或计入范围错误。');
  const validateFields = (value: any, depth = 0): void => {
    if (depth > 12) throw new HarnessError('query_depth', '查询条件嵌套过深。');
    if (Array.isArray(value)) { for (const item of value) validateFields(item, depth + 1); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (['field', 'left_on', 'right_on', 'end_field', 'weight'].includes(key) && typeof item === 'string' && item.split('.').some(segment => sensitive.test(segment))) throw new HarnessError('credential_field', '不能查询凭据或身份标识字段。');
      if (['fields', 'group_by', 'distinct', 'sort', 'order_by'].includes(key) && Array.isArray(item) && item.some(field => typeof field === 'string' && field.split('.').some(segment => sensitive.test(segment)))) throw new HarnessError('credential_field', '不能查询凭据或身份标识字段。');
      validateFields(item, depth + 1);
    }
  };
  validateFields(input);
  if (input.operation === 'read') {
    if (!input.bundleId || !input.resource || !input.pointer) throw new HarnessError('navigation_required', '原对象读取需要资源、快照ID和规范化对象指针。');
    const root = normalizedRoots[input.resource];
    if (!examCourseRead && (!input.pointer.startsWith(root) || (!root.endsWith('_') && input.pointer !== root && !input.pointer.startsWith(root + '/')))
      || input.pointer.split('/').some(segment => sensitive.test(segment)))
      throw new HarnessError('pointer_forbidden', '指针不属于当前获准资源；不能通过原始响应导航扩大范围。');
    // Generic source envelopes need endpoint verification before data access.
    if (root === '/normalized/items' || input.resource === 'source_status') throw new HarnessError('pointer_ambiguous', '该资源用quick/select保留真实来源边界；不能用通用指针越过资源校验。');
  }
  if (input.operation === 'diff' && (!input.fromBundle || !input.toBundle || !input.resource)) throw new HarnessError('bundles_required', '比较需要两份真实快照与具体资源。');
  return input;
}

export function requireCampusQueryScope(policy: PolicyKernel, scope: ScopeHandle, input: CampusQuery) {
  policy.require(scope, 'campus:read');
  for (const grant of campusQueryGrants(input)) policy.require(scope, grant);
}
export function campusQueryGrants(input: CampusQuery) {
  if (['resources', 'schema'].includes(input.operation)) return [];
  const selected = new Set([input.resource, input.spec?.resource, ...(input.spec?.resources || []), input.spec?.join?.resource].filter((item): item is (typeof campusResources)[number] => !!item));
  return [...new Set([...selected].flatMap(item => grants[item] ? [grants[item]!] : []).concat(campusQueryReadsCourseGrades(input) ? ['campus:grades:read'] : []))];
}

/** These are actual connector field paths, including relative any/all paths.
 * Values and output aliases are never interpreted as source field names. */
export function campusQueryReadsCourseGrades(input: CampusQuery): boolean {
  if (['resources', 'schema', 'history'].includes(input.operation)) return false;
  const spec = input.spec, root = input.resource || spec?.resource;
  const rootCourses = (spec?.resources || [root]).includes('courses');
  const joinAlias = spec?.join?.resource === 'courses' ? spec.join.as || 'joined' : undefined;
  if (!rootCourses && !joinAlias) return false;
  const pathUsesGrades = (path: string, fullObject = false, transformed = false) => {
    let parts = path.split('.');
    if (transformed && ['conflicts', 'transitions'].includes(spec?.operation || '')) {
      if (!['first', 'second'].includes(parts[0])) return false;
      parts = parts.slice(1);
      if (!parts.length) return fullObject;
    }
    if (rootCourses && ['grade', 'grades'].includes(parts[0])) return true;
    return !!joinAlias && parts[0] === joinAlias && (parts.length === 1 ? fullObject : ['grade', 'grades'].includes(parts[1]));
  };
  const condition = (value: unknown, parent = '', transformed = false): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const object = value as Record<string, any>;
    if (['and', 'or'].some(key => Array.isArray(object[key]) && object[key].some((item: unknown) => condition(item, parent, transformed)))) return true;
    if (object.not && condition(object.not, parent, transformed)) return true;
    for (const key of ['any', 'all']) if (object[key] && typeof object[key].field === 'string') {
      const path = [parent, object[key].field].filter(Boolean).join('.');
      if (pathUsesGrades(path, true, transformed) || condition(object[key].where, path, transformed)) return true;
    }
    return typeof object.field === 'string' && pathUsesGrades([parent, object.field].filter(Boolean).join('.'), !['exists', 'missing'].includes(object.op), transformed);
  };
  if (input.operation === 'read') {
    const parts = input.pointer?.slice(normalizedRoots.courses.length).split('/').filter(Boolean) || [];
    return parts.length <= 1 || ['grade', 'grades'].includes(parts[1]);
  }
  if (!spec) return input.operation === 'diff' && !input.fields?.length
    || (input.fields || []).some(value => pathUsesGrades(value, true));
  if (condition(spec.where) || condition(spec.after_join_where)
    || [...(spec.sort || []), ...(spec.distinct || []), ...(spec.group_by || [])].some(value => pathUsesGrades(typeof value === 'string' ? value : value.field, true))
    || spec.metrics?.some(metric => !!metric.field && pathUsesGrades(metric.field, true) || !!metric.weight && pathUsesGrades(metric.weight, true) || condition(metric.where))
    || spec.time && [spec.time.field, spec.time.end_field].some(value => !!value && pathUsesGrades(value, true))
    || spec.join && (rootCourses && pathUsesGrades(spec.join.left_on, true) || joinAlias && ['grade', 'grades'].includes(spec.join.right_on.split('.')[0]))) return true;
  const operation = spec.operation || 'select';
  if (operation === 'aggregate' || operation === 'gaps') return false;
  return !spec.fields?.length || spec.fields.some(value => pathUsesGrades(value, true, true))
    || condition(spec.having, '', true) || (spec.order_by || []).some(value => pathUsesGrades(typeof value === 'string' ? value : value.field, true, true));
}
export function campusLookupReadsCourseGrades(input: { domain?: string; fields?: string[]; filters?: string[]; sort?: string }) {
  if (input.domain !== 'courses') return false;
  const paths = [...(input.fields || []), ...(input.filters || []).map(value => value.split(':')[0].trim()),
    ...(input.sort || '').split(',').map(value => value.trim().replace(/^-/, ''))].filter(Boolean);
  return campusQueryReadsCourseGrades({ operation: 'quick', resource: 'courses', fields: paths, offset: 0, limit: 1, refresh: false });
}

/** Preserve the evaluated window; relative selectors are not re-evaluated at
 * the next page. Time-derived membership/order needs a new query baseline. */
export function campusQueryOnSnapshot(input: CampusQuery, result: Record<string, any>) {
  const pinned = structuredClone(input), time = pinned.spec?.time, interval = result.time_interval;
  const validTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
  let fixed = true;
  if (time?.at) {
    if (!validTime(interval?.from)) fixed = false;
    else { time.at = interval.from; delete time.from; delete time.to; delete time.window; }
  } else if (time && (time.window || time.from || time.to)) {
    if ((time.window || time.from) && !validTime(interval?.from) || (time.window || time.to) && !validTime(interval?.to)) fixed = false;
    else { delete time.window; if (validTime(interval?.from)) time.from = interval.from;
      if (validTime(interval?.to)) time.to = interval.to; }
  }
  const dynamic = new Set(['ongoing', 'ended', 'minutes_from_now']);
  const hasDynamicField = (value: unknown, fields = false): boolean => {
    if (typeof value === 'string') return fields && dynamic.has(value.split('.').at(-1)!);
    if (Array.isArray(value)) return value.some(item => hasDynamicField(item, fields));
    return !!value && typeof value === 'object' && Object.entries(value).some(([key, child]) =>
      hasDynamicField(child, ['field', 'sort', 'order_by', 'group_by', 'distinct', 'weight'].includes(key)));
  };
  const spec = pinned.spec;
  const dependent = hasDynamicField(spec && { where: spec.where, after_join_where: spec.after_join_where,
    having: spec.having, sort: spec.sort, order_by: spec.order_by, group_by: spec.group_by, distinct: spec.distinct, metrics: spec.metrics })
    || spec?.operation === 'gaps' && !time?.from;
  pinned.refresh = false;
  if (['quick', 'select', 'read'].includes(input.operation)) {
    if (typeof result.bundle_id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(result.bundle_id)
      || input.bundleId && input.bundleId !== result.bundle_id) return;
    pinned.bundleId = result.bundle_id;
    if (typeof result.snapshotProof?.version === 'string') pinned.expectedSnapshotVersion = result.snapshotProof.version;
  }
  return { arguments: validateCampusQuery(pinned), evaluation: {
    ...(validTime(result.evaluated_at) ? { at: result.evaluated_at } : {}),
    paging: fixed && !dependent ? 'fixed_conditions' as const : 'evaluation_dependent' as const,
    dynamicValues: !(input.operation === 'read' && input.resource === 'exams' && input.pointer === examCourseRecordsPointer)
      && ['classes', 'exams'].includes(input.resource || input.spec?.resource || '')
      && (!spec?.fields || hasDynamicField(spec.fields, true)),
  } };
}

/** A next page is the same declared query on the source's actual snapshot,
 * not a request to refresh it or silently start another query. */
export function campusQueryContinuation(input: CampusQuery, result: Record<string, any>) {
  const nextOffset = result.next_offset, currentOffset = input.spec?.offset ?? input.offset;
  if (!['ok', 'partial'].includes(result.status) || !Number.isSafeInteger(nextOffset)
    || nextOffset <= currentOffset || nextOffset > 1000000) return;
  const frozen = campusQueryOnSnapshot(input, result);
  if (!frozen || frozen.evaluation.paging !== 'fixed_conditions') return;
  const next = frozen.arguments;
  next.offset = nextOffset;
  next.refresh = false;
  if (next.spec) next.spec.offset = nextOffset;
  return { capability: 'campus.query' as const, arguments: validateCampusQuery(next),
    meaning: input.operation === 'read' && input.resource === 'exams' && input.pointer === examCourseRecordsPointer
      ? '沿同一版本的考试课程原行继续；课程原行数与逐场考试数分别计数。'
      : input.operation === 'history' ? '沿同一资源目录继续列快照元信息；目录可能新增或变化，这不是固定快照中的个人记录。'
      : input.operation === 'diff' ? '继续比较原来两份指定快照；这里只报告观察差异，不把来源采集时刻当作实际发生时刻。'
      : input.spec?.join || (input.spec?.resources?.length || 0) > 1
      ? '继续同一查询并固定已返回的主快照；关联来源仍由原连接器重新核对，不把主快照当作全部关联来源的版本证明。'
      : '沿已解析的查询条件与同一数据快照继续；页内ongoing等相对当前时刻的显示值仍会重评。已读一页不等于全部读完，翻完也不消除原来源缺口。' };
}
