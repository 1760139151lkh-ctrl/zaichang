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
  fromBundle: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(), toBundle: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  pointer: z.string().max(500).optional(), fields: z.array(field).max(40).optional(),
  offset: z.number().int().min(0).max(1000000).default(0), limit: z.number().int().min(1).max(50).default(8),
  refresh: z.boolean().default(false), academicYear: z.string().regex(/^20\d{2}-20\d{2}$/).optional(), term: z.enum(['1', '2']).optional(),
}).strict();
export type CampusQuery = z.infer<typeof campusQueryInput>;
const grants: Partial<Record<(typeof campusResources)[number], string>> = {
  grades: 'campus:grades:read', retakes: 'campus:grades:read', gpa_semesters: 'campus:gpa:read', gpa_overall: 'campus:gpa:read', gpa_cumulative: 'campus:gpa:read',
  reservations: 'campus:reservations:read', reservation_violations: 'campus:reservations:read', card_accounts: 'campus:card:read', transactions: 'campus:transactions:read', student_profile: 'campus:profile:read', roles: 'campus:profile:read',
};
export const normalizedRoots: Record<(typeof campusResources)[number], string> = {
  classes: '/normalized/occurrences', courses: '/normalized/courses', exams: '/normalized/exams', grades: '/normalized/transcript/grades', gpa_semesters: '/normalized/transcript/semesters', gpa_overall: '/normalized/transcript/overall_', gpa_cumulative: '/normalized/transcript/cumulative_by_semester_all_attempts', retakes: '/normalized/transcript/repeat_groups', projects: '/normalized/practice/items', practice_summary: '/normalized/practice/official_summary', todos: '/normalized/todos', activities: '/normalized/activities', holidays: '/normalized/calendar', calendar_pending: '/normalized/schedule_quality/pending_calendar_events', cancelled_classes: '/normalized/schedule_quality/cancelled_by_calendar', source_status: '/normalized/field_dictionary', reservations: '/normalized/items', reservation_violations: '/normalized/items', card_accounts: '/normalized/items', transactions: '/normalized/items', student_profile: '/normalized/items', roles: '/normalized/items',
};

export function validateCampusQuery(raw: unknown) {
  const input = campusQueryInput.parse(raw);
  if (!['resources', 'schema'].includes(input.operation) && !input.resource && !input.spec) throw new HarnessError('resource_required', '先选择具体资源，不能默认读取所有个人资料。');
  if (input.operation === 'schema' && !input.model) throw new HarnessError('model_required', '请选择要了解的字段模型。');
  if (input.operation === 'select' && !input.spec) throw new HarnessError('query_required', '组合查询需要具体spec。');
  if (input.spec && input.resource && input.spec.resource !== input.resource) throw new HarnessError('resource_mismatch', '声明资源与查询资源不一致。');
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
    if (!input.pointer.startsWith(root) || (!root.endsWith('_') && input.pointer !== root && !input.pointer.startsWith(root + '/')) || input.pointer.split('/').some(segment => sensitive.test(segment)))
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
  return [...new Set([...selected].flatMap(item => grants[item] ? [grants[item]!] : []))];
}
