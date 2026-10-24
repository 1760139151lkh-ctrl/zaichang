import { z } from 'zod';
import { HarnessError } from '../../shared/harness';
import type { PolicyKernel } from '../runtime/policy';
import type { ScopeHandle } from '../../shared/harness';

export const campusResources = ['classes', 'courses', 'exams', 'grades', 'gpa_semesters', 'gpa_overall', 'gpa_cumulative', 'retakes', 'projects', 'practice_summary', 'todos', 'activities', 'holidays', 'calendar_pending', 'cancelled_classes', 'source_status', 'reservations', 'reservation_violations', 'card_accounts', 'transactions', 'student_profile', 'roles'] as const;
const resource = z.enum(campusResources);
const field = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,100}$/);
const sensitive = /^(password|passwd|secret|token|ticket|cookie|authorization|credential|raw_response|body_b64|email|phone|mobile|account|student.?id|student.?no|card.?no|identity.?id|sno|xh|yhm|xm|zgh|custid|acctid|cardid|bankacc|cert)$/i;
const where = z.record(z.string(), z.json()).describe('单项条件写{field,op,value}，字段名取自schema；op可选eq/ne/in/not_in/contains/starts_with/ends_with/length_gt/length_eq/gt/gte/lt/lte/missing/exists。组合条件用and/or加条件数组，not加条件对象，any/all加{field,where}。');
const sort = z.array(z.union([field, z.object({ field, descending: z.boolean().optional() }).strict()])).max(12);
export const campusSelectSchema = z.object({
  resource, resources: z.array(resource).max(5).optional(),
  operation: z.enum(['select', 'aggregate', 'conflicts', 'transitions', 'gaps']).optional(),
  time: z.object({ from: z.string().max(50).optional(), to: z.string().max(50).optional(), at: z.string().max(50).optional(), window: z.string().max(40).optional(), mode: z.enum(['overlap', 'starts', 'contained']).optional(), field: field.optional(), end_field: field.optional() }).strict().optional(),
  where: where.optional(), after_join_where: where.optional(), having: where.optional(),
  join: z.object({ resource, left_on: field, right_on: field, as: field.optional(), kind: z.enum(['left', 'inner']).optional() }).strict().optional(),
  fields: z.array(field).max(40).optional(), group_by: z.array(field).max(8).optional(), distinct: z.array(field).max(8).optional(),
  metrics: z.array(z.object({ op: z.enum(['count', 'count_where', 'fraction', 'count_distinct', 'sum', 'mean', 'median', 'min', 'max', 'first', 'last', 'weighted_mean']), field: field.optional(), weight: field.optional(), where: where.optional().describe('count_where和fraction可在指标内填where；sum、mean、weighted_mean等先用外层spec.where选出参与计算的记录。'), as: field.optional() }).strict()).max(16).optional(),
  sort: sort.optional(), order_by: sort.optional(), offset: z.number().int().min(0).max(1000000).optional(), limit: z.number().int().min(1).max(100).optional(),
}).strict();
export const campusQueryInput = z.object({
  operation: z.enum(['resources', 'schema', 'quick', 'select', 'read', 'history', 'diff'])
    .describe('resources看看资料目录，schema看看所选模型有哪些字段；quick挑出一类记录，select组合条件或汇总，read沿原文地址展开，history找以前保存的版本，diff比较两次保存之间的变化。'),
  resource: resource.optional(), model: z.string().regex(/^[a-z_]{1,60}$/).optional().describe('想查字段写法时填这里。先从resources给出的模型目录选名字；一类资料的名字和它的模型名可能不同。'),
  spec: campusSelectSchema.optional(),
  bundleId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional().describe('刚才那份记录的编号，接着翻页或打开原文时沿用。'),
  expectedSnapshotVersion: z.string().regex(/^[a-f0-9]{64}$/).optional().describe('刚才返回的版本，和记录编号一起沿用，接读同一份内容。'),
  fromBundle: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional().describe('比较时选作较早一份的记录编号，可从history找到。'),
  toBundle: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional().describe('比较时选作较后一份的记录编号。变化只说明两次观察之间发生了什么。'),
  pointer: z.string().max(500).optional().describe('这份记录提供的原文地址，和它的记录编号一起继续展开。'), fields: z.array(field).max(40).optional(),
  offset: z.number().int().min(0).max(1000000).default(0).describe('从刚才停下的位置继续看；组合查询没有另填起点时，也沿这里继续。'),
  limit: z.number().int().min(1).max(50).default(8).describe('这次先展开几条；组合查询没有另填条数时也用这里。其余原文仍在，可以接着翻。'),
  refresh: z.boolean().default(false).describe('默认看已有记录，并保留各份资料的采集时间。想看现在的变化时，quick/select填true重新查询所选资料；同账号、同学期已有的记录会一同保留。接着翻刚才那份记录时保持false，想整体更新可用campus.overview。'), academicYear: z.string().regex(/^20\d{2}-20\d{2}$/).optional(), term: z.enum(['1', '2']).optional(),
}).strict();
export type CampusQuery = z.infer<typeof campusQueryInput>;
export const examCourseRecordsPointer = '/normalized/exam_course_records';
export const campusExamSummaryFields = ['id', 'name', 'semester_id', 'credit', 'type', 'startTime', 'endTime', 'dateLabel', 'location', 'seat', 'time_precision'] as const;
export const campusGpaPolicies = {
  all_attempts: { label: '全部修读', meaning: '保留所有修读记录，再按原计入规则和学分加权；实际计入仍需要可用绩点和正学分。' },
  first_attempt: { label: '首次修读', meaning: '每个同课分组按学期取最早的一次，再按原计入规则和学分加权；同一学期内的修读先后仍不能确定。' },
  highest_attempt: { label: '最高成绩', meaning: '每个同课分组按百分成绩或等级等值取最高一次，各种绩点制式沿用同一次修读；同分或全无可比数值时保留来源顺序中的第一条。' },
  repository_first_response: { label: '来源首条记录', meaning: '每个同课分组取这份资料源记录顺序中的第一条，再按原计入规则和学分加权；这不是第一次修读的时间证明。' },
} as const;
export const majorGpaPointer = '/normalized/transcript/major';
export const majorGpaFields = {
  source_complete: '主修来源这次是否完整；成绩和主修两份来源的具体情况在coverage中',
  gpa: '一个对象，包含fivePoint、fourPoint、fourPointLegacy、hundredPoint四个尺度的加权均值；只选五分均绩时用gpa.fivePoint，而不是整个gpa对象',
  'gpa.fivePoint': '主修匹配记录的五分制加权均值',
  'gpa.fourPoint': '同一主修匹配范围的本机4.3换算均值',
  'gpa.fourPointLegacy': '同一主修匹配范围的4.0封顶换算均值',
  'gpa.hundredPoint': '同一主修匹配范围的百分等值加权均值',
  gpa_credit_denominator: '这些主修记录实际计入的学分分母，与全部课程修读分母分开',
  eligible_attempts: '满足本机计入规则的修读数',
  counted_attempts: '实际有可用绩点和正学分、参与加权的修读数',
  excluded_attempts: '本机分析规则排除的记录标识与原因；仅显式选择时返回',
  incomplete_attempts: '本应计入而缺少可用学分或绩点的记录标识；仅显式选择时返回',
  zero_credit_attempts: '零学分记录标识，不增加分母；仅显式选择时返回',
  earned_credits_sum_attempts: '逐次取得学分相加，重修可能重复',
  complete: '这次主修汇总计算是否完整；成绩和主修两份来源的具体情况在coverage中',
  formula: '原连接器记录的加权公式',
} as const;
export const majorGpaReadFields = ['gpa', 'gpa_credit_denominator', 'eligible_attempts', 'counted_attempts', 'complete', 'source_complete', 'formula'] as const;
const courseSummaryFields = ['key', 'name', 'semester_id', 'credit', 'teachers', 'confirmed', 'online'];

/** A snapshot also contains historical courses joined from grades and exams.
 * Selecting its timetable semester alone does not select those course rows. */
function hasCourseSemesterCondition(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const condition = value as Record<string, unknown>;
  if (condition.field === 'semester_id') return true;
  return ['and', 'or'].some(key => Array.isArray(condition[key]) && condition[key].some(hasCourseSemesterCondition))
    || hasCourseSemesterCondition(condition.not);
}

function requireCourseSemester(value: unknown): string {
  if (typeof value !== 'string' || !/^20\d{2}-20\d{2}-[12]$/.test(value))
    throw new HarnessError('campus_semester_unknown', '这份课程资料没有写明学期，其中还含历年课程；需要补齐学期后再看本学期安排。');
  return value;
}

export function campusCourseLookupFilters(filters: readonly string[] | undefined, semesterId: unknown): string[] {
  const selected = [...(filters || [])];
  if (!selected.some(value => value.split(':', 1)[0].trim() === 'semester_id'))
    selected.push(`semester_id:eq:${requireCourseSemester(semesterId)}`);
  return selected;
}

/** Preserve explicit course-semester choices, including cross-semester ones.
 * A quick query keeps its original narrow projection when a where is added. */
export function campusCourseQueryForSemester(input: CampusQuery, semesterId: unknown): CampusQuery {
  if (!['quick', 'select'].includes(input.operation) || (input.resource || input.spec?.resource) !== 'courses'
    || (input.spec?.resources?.length || 0) > 1
    || [input.spec?.where, input.spec?.after_join_where, input.spec?.having].some(hasCourseSemesterCondition)) return input;
  const semester = requireCourseSemester(semesterId), next = structuredClone(input);
  const selected = next.spec || { resource: 'courses' as const,
    fields: next.fields?.length ? [...next.fields] : [...courseSummaryFields], offset: next.offset, limit: next.limit };
  const condition = { field: 'semester_id', op: 'eq', value: semester };
  next.spec = { ...selected, where: selected.where ? { and: [selected.where, condition] } : condition };
  return validateCampusQuery(next);
}
const grants: Partial<Record<(typeof campusResources)[number], string>> = {
  grades: 'campus:grades:read', retakes: 'campus:grades:read', gpa_semesters: 'campus:gpa:read', gpa_overall: 'campus:gpa:read', gpa_cumulative: 'campus:gpa:read',
  reservations: 'campus:reservations:read', reservation_violations: 'campus:reservations:read', card_accounts: 'campus:card:read', transactions: 'campus:transactions:read', student_profile: 'campus:profile:read', roles: 'campus:profile:read',
};
export const normalizedRoots: Record<(typeof campusResources)[number], string> = {
  classes: '/normalized/occurrences', courses: '/normalized/courses', exams: '/normalized/exams', grades: '/normalized/transcript/grades', gpa_semesters: '/normalized/transcript/semesters', gpa_overall: '/normalized/transcript/overall_', gpa_cumulative: '/normalized/transcript/cumulative_by_semester_all_attempts', retakes: '/normalized/transcript/repeat_groups', projects: '/normalized/practice/items', practice_summary: '/normalized/practice/official_summary', todos: '/normalized/todos', activities: '/normalized/activities', holidays: '/normalized/calendar', calendar_pending: '/normalized/schedule_quality/pending_calendar_events', cancelled_classes: '/normalized/schedule_quality/cancelled_by_calendar', source_status: '/normalized/field_dictionary', reservations: '/normalized/items', reservation_violations: '/normalized/items', card_accounts: '/normalized/items', transactions: '/normalized/items', student_profile: '/normalized/items', roles: '/normalized/items',
};

export function validateCampusQuery(raw: unknown) {
  const input = campusQueryInput.parse(raw);
  if (input.operation === 'quick' && !input.spec && input.resource === 'exams' && !input.fields?.length)
    input.fields = [...campusExamSummaryFields];
  const examCourseRead = input.pointer === examCourseRecordsPointer;
  const majorGpaRead = input.pointer === majorGpaPointer;
  if (majorGpaRead && (input.operation !== 'read' || input.resource !== 'gpa_overall'))
    throw new HarnessError('major_gpa_read_only', '主修汇总沿同一份绩点资料的固定地址读取；它不是新的汇总算法或组合查询。');
  if (majorGpaRead && (input.offset !== 0 || input.spec !== undefined || input.model !== undefined
    || input.academicYear !== undefined || input.term !== undefined || input.fromBundle !== undefined || input.toBundle !== undefined || input.refresh))
    throw new HarnessError('major_gpa_read_parameters', '这份主修汇总按原快照与版本读取；字段只选择已有汇总内容，不另作筛选、学期选择或分页。');
  if (majorGpaRead) {
    input.fields = input.fields?.length ? input.fields : [...majorGpaReadFields];
    if (input.fields.some(name => !Object.hasOwn(majorGpaFields, name)))
      throw new HarnessError('major_gpa_read_fields', '主修汇总只可选择字段说明里的汇总值；这里没有逐科成绩或其它对象。');
  }
  if (examCourseRead && (input.operation !== 'read' || input.resource !== 'exams'))
    throw new HarnessError('exam_course_read_only', '考试课程原行只沿exams资源的固定read地址读取；它不是考试事件查询或组合查询。');
  if (examCourseRead && (input.fields !== undefined || input.spec !== undefined || input.model !== undefined
    || input.academicYear !== undefined || input.term !== undefined || input.fromBundle !== undefined || input.toBundle !== undefined || input.refresh))
    throw new HarnessError('exam_course_read_parameters', '这里按原记录顺序展开考试课程；带上原快照、版本、offset和limit就能继续。需要另选字段或条件时可用quick/select。');
  if (input.spec && !['quick', 'select'].includes(input.operation))
    throw new HarnessError('query_spec_operation', '这一步使用的条件入口不同：quick/select接收spec，read沿原正文地址读取，diff在顶层fields选择比较字段。');
  if (!['resources', 'schema'].includes(input.operation) && !input.resource && !input.spec) throw new HarnessError('resource_required', '先选一项要看的资料，例如课程、考试或成绩。');
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
      if (['field', 'left_on', 'right_on', 'end_field', 'weight'].includes(key) && typeof item === 'string' && item.split('.').some(segment => sensitive.test(segment))) throw new HarnessError('credential_field', '这个字段保留在本机账号连接中；可从schema选择当前可读的课程、成绩等字段。');
      if (['fields', 'group_by', 'distinct', 'sort', 'order_by'].includes(key) && Array.isArray(item) && item.some(field => typeof field === 'string' && field.split('.').some(segment => sensitive.test(segment)))) throw new HarnessError('credential_field', '所选字段中有保留在本机账号连接的内容；可从schema选择当前可读的课程、成绩等字段。');
      validateFields(item, depth + 1);
    }
  };
  validateFields(input);
  if (input.operation === 'read') {
    if (!input.bundleId || !input.resource || !input.pointer) throw new HarnessError('navigation_required', '继续打开原文需要刚才返回的资料项、记录编号和正文地址。');
    const root = normalizedRoots[input.resource];
    if (!examCourseRead && !majorGpaRead && (!input.pointer.startsWith(root) || (!root.endsWith('_') && input.pointer !== root && !input.pointer.startsWith(root + '/')))
      || input.pointer.split('/').some(segment => sensitive.test(segment)))
      throw new HarnessError('pointer_forbidden', '这个正文地址属于另一项资料，请沿当前资料返回的入口继续。');
    // Generic source envelopes need endpoint verification before data access.
    if (root === '/normalized/items' || input.resource === 'source_status') throw new HarnessError('pointer_ambiguous', '这项资料可用quick/select打开，返回内容会保留每项原来的来源。');
  }
  if (input.operation === 'diff' && (!input.fromBundle || !input.toBundle || !input.resource)) throw new HarnessError('bundles_required', '比较需要两份真实快照与具体资源。');
  return input;
}

/** Keep a displayed lookup page on its actual source, including the course
 * predicate added by the adapter. Relative windows become fixed instants;
 * time-dependent membership still needs a new query instead of a next page. */
export function campusLookupOnSnapshot(input: Record<string, any>, result: Record<string, any>) {
  const bundleId = result.bundleId ?? result.bundle_id, proof = result.snapshotProof;
  const resource = input.domain === 'schedule' ? 'classes' : input.domain === 'gpa' ? 'gpa_overall' : input.domain;
  if (typeof bundleId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(bundleId)
    || input.bundleId && input.bundleId !== bundleId || proof?.bundleId !== bundleId
    || proof.sourceId !== 'campus:zju-account' || proof.resource !== resource
    || typeof proof.version !== 'string' || !/^[a-f0-9]{64}$/.test(proof.version)
    || input.expectedSnapshotVersion && input.expectedSnapshotVersion !== proof.version) return;
  const args: Record<string, any> = { ...structuredClone(input), bundleId, expectedSnapshotVersion: proof.version, refresh: false };
  if (args.domain === 'courses' && Array.isArray(result.recordSelection?.filters)
    && result.recordSelection.filters.every((filter: unknown) => typeof filter === 'string'))
    args.filters = [...result.recordSelection.filters];
  const interval = result.timeInterval ?? result.time_interval;
  const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
  let fixed = true;
  if (args.at) { if (instant(interval?.from)) args.at = interval.from; else fixed = false; }
  else if (args.window || args.from || args.to) {
    if ((args.window || args.from) && !instant(interval?.from) || (args.window || args.to) && !instant(interval?.to)) fixed = false;
    else { delete args.window; if (instant(interval?.from)) args.from = interval.from; if (instant(interval?.to)) args.to = interval.to; }
  }
  const dynamic = new Set(['ongoing', 'ended', 'minutes_from_now']);
  if ((args.filters || []).some((filter: string) => dynamic.has(filter.split(':')[0].split('.').at(-1)!))
    || typeof args.sort === 'string' && args.sort.split(',').some((part: string) => dynamic.has(part.trim().replace(/^-/, '').split('.').at(-1)!))) fixed = false;
  return { arguments: args, evaluation: {
    ...(instant(result.evaluatedAt ?? result.evaluated_at) ? { at: result.evaluatedAt ?? result.evaluated_at } : {}),
    paging: fixed ? 'fixed_conditions' as const : 'evaluation_dependent' as const,
    dynamicValues: ['schedule', 'exams'].includes(args.domain) && (!args.fields || args.fields.some((field: string) => dynamic.has(field.split('.').at(-1)!))),
  } };
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
  let pinned: CampusQuery;
  try { pinned = structuredClone(campusCourseQueryForSemester(input, result.semester_id)); }
  catch (error) { if (error instanceof HarnessError && error.code === 'campus_semester_unknown') return; throw error; }
  const time = pinned.spec?.time, interval = result.time_interval;
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
      ? '接着看这份考试资料里的课程原记录；这里按课程条数翻页，每门课下的考试场次另外列出。'
      : input.operation === 'history' ? '接着看这项资料的保存版本目录，目录会随新查询更新。'
      : input.operation === 'diff' ? '接着比较原来选中的两份记录；变化发生在两次观察之间，确切发生时间仍看原文。'
      : input.spec?.join || (input.spec?.resources?.length || 0) > 1
      ? '接着看同一查询的下一页，主记录保持这一版，关联来源会继续核对各自的版本。'
      : '按刚才的条件接着看同一份记录；正在进行等时间状态会按当前时刻更新，原来源缺失的部分仍会标明。' };
}
