import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, statSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import type { Store } from './store';
import { campusCourseLookupFilters, campusCourseQueryForSemester, campusExamSummaryFields, campusGpaPolicies, examCourseRecordsPointer, majorGpaFields, majorGpaPointer, majorGpaReadFields, normalizedRoots, validateCampusQuery, type CampusQuery } from './capabilities/campus-query';
import { campusSourceEndpoint, CampusSnapshotProofs, type CampusSnapshotProof } from './capabilities/campus-saved-source';
import { campusSnapshotStructureProgram } from './capabilities/campus-snapshot-structure';
import { HarnessError } from '../shared/harness';

/** Account-backed campus data is kept distinct from legacy JSON imports. */
export const CAMPUS_ACCOUNT_SOURCE_ID = 'campus:zju-account';
export type CampusAuthStatus = 'needs_login' | 'credentials_saved' | 'verified' | 'failed';

export type CampusDomain =
  | 'schedule'
  | 'courses'
  | 'learning_courses'
  | 'exams'
  | 'assignments'
  | 'grades'
  | 'gpa'
  | 'gpa_semesters'
  | 'gpa_cumulative'
  | 'retakes'
  | 'practice'
  | 'sports'
  | 'projects'
  | 'activities'
  | 'reservations'
  | 'reservation_violations'
  | 'card'
  | 'transactions'
  | 'profile'
  | 'roles'
  | 'calendar_pending'
  | 'cancelled_classes'
  | 'holidays'
  | 'source_status';
export type CampusRefreshScope = 'academic' | 'domain';

export interface CampusReadArgs {
  domain: CampusDomain;
  query?: string;
  courseId?: string;
  academicYear?: string;
  term?: '1' | '2';
  window?: string;
  from?: string;
  to?: string;
  at?: string;
  timeMode?: 'overlap' | 'starts' | 'contained';
  fields?: string[];
  filters?: string[];
  sort?: string;
  limit?: number;
  offset?: number;
  bundleId?: string;
  expectedSnapshotVersion?: string;
  refresh?: boolean;
}
export interface CampusRefreshArgs {
  scope: CampusRefreshScope;
  domain?: CampusDomain;
  academicYear?: string;
  term?: '1' | '2';
}
export interface CampusConnectorState {
  configured: boolean;
  available: boolean;
  label: string;
  sourceKind?: 'zju_account';
  authStatus?: CampusAuthStatus;
  lastVerifiedAt?: string;
  catalogued?: number;
  verified?: number;
  blocked?: number;
  credentialsConfigured?: boolean;
  reason?: string;
}

export interface CampusFullContextArgs {
  refresh?: boolean;
  includeSensitiveDomains?: boolean;
  academicYear?: string;
  term?: '1' | '2';
}
/** Host admission for academic acquisition and local normalization of its saved baseline.
 * This is deliberately separate from model query parameters. */
export interface CampusAcquisition { allowAcademicSync: boolean }
export interface CampusAuthentication {
  mode: 'saved_snapshot' | 'live_session'; accountBinding: 'current_local_account';
  ssoCheck: 'not_performed' | 'performed' | 'reused'; verifiedAt?: string; lastSsoVerifiedAt?: string;
}
interface SavedCampusBinding { identity: string; resource: string; versions: { bundleId: string; version: string }[] }

const DOMAIN_RESOURCE: Partial<Record<CampusDomain, string>> = {
  schedule: 'classes',
  courses: 'courses',
  learning_courses: 'records',
  exams: 'exams',
  assignments: 'todos',
  grades: 'grades',
  gpa: 'gpa_overall',
  gpa_semesters: 'gpa_semesters',
  gpa_cumulative: 'gpa_cumulative',
  retakes: 'retakes',
  practice: 'practice_summary',
  projects: 'projects',
  activities: 'activities',
  reservations: 'reservations',
  reservation_violations: 'reservation_violations',
  card: 'card_accounts',
  transactions: 'transactions',
  profile: 'student_profile',
  roles: 'roles',
  calendar_pending: 'calendar_pending',
  cancelled_classes: 'cancelled_classes',
  holidays: 'holidays',
  source_status: 'source_status',
};

const SUMMARY_FIELDS: Partial<Record<CampusDomain, string[]>> = {
  schedule: ['uid', 'summary', 'startTime', 'endTime', 'location', 'teacher', 'rescheduled', 'time_precision'],
  courses: ['key', 'name', 'semester_id', 'credit', 'teachers', 'confirmed', 'online'],
  learning_courses: ['id', 'name', 'course_code', 'credit', 'semester_id', 'start_date', 'end_date', 'study_completeness'],
  exams: [...campusExamSummaryFields],
  assignments: ['id', 'name', 'course', 'deadline', 'status'],
  grades: ['id', 'name', 'course_code', 'repeat_group', 'semester_id', 'credit', 'original', 'fivePoint', 'fourPoint', 'fourPointLegacy', 'hundredPoint', 'hundredPoint_kind', 'major', 'gpaIncluded', 'gpa_exclusion_reason', 'creditIncluded', 'earnedCredit', 'earnedCredit_repository', 'quality_issues'],
  gpa: ['policy', 'gpa', 'gpa_credit_denominator', 'eligible_attempts', 'counted_attempts', 'excluded_attempts', 'incomplete_attempts', 'source_complete', 'complete', 'formula', 'earned_credits_sum_attempts', 'zero_credit_attempts'],
  gpa_semesters: ['semester_id', 'gpa', 'gpa_credit_denominator', 'eligible_attempts', 'counted_attempts', 'excluded_attempts', 'incomplete_attempts', 'source_complete', 'complete', 'formula', 'earned_credits_sum_attempts', 'zero_credit_attempts'],
  gpa_cumulative: ['through_semester', 'gpa', 'gpa_credit_denominator', 'eligible_attempts', 'counted_attempts', 'incomplete_attempts', 'source_complete', 'complete', 'formula', 'earned_credits_sum_attempts', 'zero_credit_attempts'],
  retakes: ['course_group', 'attempt_ids', 'first_attempt_id', 'highest_attempt_id', 'chronology_quality'],
  projects: ['id', 'projectName', 'categoryName', 'score', 'statusLabel', 'approved', 'countsTowardTotal', 'activityStart', 'activityEnd'],
  activities: ['activity_id', 'course_id', 'name', 'type', 'starts_at', 'deadline', 'scores', 'completion'],
  reservations: ['nameMerge', 'startTime', 'endTime', 'statusName', 'record_semantics'],
  reservation_violations: ['nameMerge', 'date', 'statusName'],
  transactions: ['occurred_at', 'resume', 'tranamt', 'amount_unit'],
  card: ['db_balance', 'expdate', 'cardname'],
  profile: ['bmmc', 'xyzyxx', 'yhlx', 'student', 'teacher'],
  roles: ['mrjsmc', 'jsList', 'jsfl'],
  calendar_pending: ['original_date', 'reason', 'date', 'affected_session_uids'],
  cancelled_classes: ['session_uid', 'original_date', 'reason'],
};
export const campusSummaryFields = (domain: CampusDomain): string[] | undefined => SUMMARY_FIELDS[domain]?.slice();
/** The lookup's explicit course-name query must select source rows too. */
export function campusGradeLookupFilters(filters: readonly string[] | undefined, query?: string): string[] {
  const selected = [...(filters || [])], name = query?.trim().replaceAll('(', '（').replaceAll(')', '）');
  const predicate = name ? `name:contains:${name}` : undefined;
  if (predicate && !selected.includes(predicate)) selected.push(predicate);
  return selected;
}
const SAFE_MODEL_FIELDS = new Set([
  ...Object.values(SUMMARY_FIELDS).flat(),
  ...Object.keys(majorGpaFields),
  'date', 'dateLabel', 'title', 'name', 'status', 'source', 'updatedAt', 'fetched_at',
  'startTime', 'endTime', 'location', 'teacher', 'summary', 'deadline', 'credit', 'amount_unit',
]);

const DOMAIN_LABEL: Record<CampusDomain, string> = {
  schedule: '逐次课程',
  courses: '课程与教学班',
  learning_courses: '学在浙大课程',
  exams: '考试安排',
  assignments: '作业与待办',
  grades: '成绩记录',
  gpa: '绩点汇总',
  gpa_semesters: '分学期绩点',
  gpa_cumulative: '累计绩点',
  retakes: '重修记录',
  practice: '二三四课堂记点与学分',
  sports: '体育打卡记录',
  projects: '实践项目',
  activities: '课程活动',
  reservations: '图书馆预约',
  reservation_violations: '预约违约记录',
  card: '校园卡账户',
  transactions: '校园卡流水',
  profile: '学生资料',
  roles: '校园账号角色',
  calendar_pending: '待公布补课日期',
  cancelled_classes: '停课与替代课次',
  holidays: '校历与假期',
  source_status: '数据连接状态',
};

// High-level resources are backed by complete encrypted datasets in the external
// connector. Reading them gives the model a bounded index without mistaking the
// connector's diagnostic endpoint samples for complete personal data.
const FULL_CONTEXT_DOMAINS: CampusDomain[] = [
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
];
const SENSITIVE_DOMAINS = new Set<CampusDomain>([
  'grades', 'gpa', 'gpa_semesters', 'gpa_cumulative', 'retakes',
  'reservations',
  'reservation_violations',
  'card',
  'transactions',
  'profile',
  'roles',
]);
const DIRECT_REFRESH_DOMAINS = new Set<CampusDomain>([
  'reservations',
  'reservation_violations',
  'card',
  'transactions',
  'profile',
  'roles',
]);
const ACADEMIC_RESOURCES = new Set<CampusDomain>([
  'schedule',
  'courses',
  'exams',
  'assignments',
  'grades',
  'gpa',
  'gpa_semesters',
  'gpa_cumulative',
  'retakes',
  'practice',
  'sports',
  'projects',
  'calendar_pending',
  'cancelled_classes',
  'holidays',
  'source_status',
]);

const academicRefreshSources: Record<string, string[]> = {
  classes: ['timetable_first', 'timetable_second', 'calendar'],
  courses: ['timetable_first', 'timetable_second', 'grades', 'major', 'exams', 'calendar'],
  exams: ['exams'], grades: ['grades', 'major'], gpa_overall: ['grades', 'major'],
  gpa_semesters: ['grades', 'major'], gpa_cumulative: ['grades', 'major'], retakes: ['grades', 'major'],
  projects: ['practice', 'practice_profile'], practice_summary: ['practice_profile'], todos: ['todos'],
  holidays: ['calendar'], calendar_pending: ['calendar'], cancelled_classes: ['timetable_first', 'timetable_second', 'calendar'],
};

export function campusAcademicAcquisition(capability: string, input: unknown) {
  if (!input || typeof input !== 'object') return undefined;
  const args = input as { refresh?: boolean; domain?: CampusDomain; operation?: string; resource?: string; spec?: { resource?: string } };
  if (!args.refresh) return undefined;
  const resources = new Set([...ACADEMIC_RESOURCES].map(domain => DOMAIN_RESOURCE[domain]).filter(Boolean));
  if (capability !== 'campus.overview' && !(capability === 'campus.lookup' && !!args.domain && !!DOMAIN_RESOURCE[args.domain] && ACADEMIC_RESOURCES.has(args.domain))
    && !(capability === 'campus.query' && ['quick', 'select'].includes(args.operation || '') && resources.has(args.resource || args.spec?.resource))) return undefined;
  if (capability === 'campus.overview') return { operation: 'complete_academic_acquisition',
    domains: ['courses', 'classes', 'exams', 'grades', 'gpa', 'practice', 'student_major', 'todos', 'academic_calendar'],
    meaning: '这个明确的总览刷新会重新采集整份学业来源，和从保存快照只读某个资源不同。' };
  const resource = capability === 'campus.lookup' ? DOMAIN_RESOURCE[args.domain!] : args.resource || args.spec?.resource;
  return { operation: 'academic_resource_refresh', resource, collectedSources: resource ? academicRefreshSources[resource] || [] : [],
    savedBaselineRequired: true, localNormalization: ['courses', 'classes', 'exams', 'grades', 'gpa', 'practice', 'student_major', 'todos', 'academic_calendar'],
    meaning: '这次只重新采集collectedSources所列的相关来源，沿原快照保存的接口参数取得该来源全部可见分页；成绩、考试等接口的原记录可能跨学期，返回字段或查询时间不会把实际采集范围缩成同一窗口。随后原连接器会在本机读入并重新归一化已有完整学业快照，其中仍包括旧成绩、专业和实践资料。窄采集仍涉及这些旧资料的本机处理，这部分处理也属于本次用途核对。模型收到的仍只是本次资源、字段与相应用途允许的结果，既存敏感资料没有因此获得交给模型的许可。它依赖同账号、同学期且当前latest的可核基线，缺少基线不会改成整包采集。' };
}

function safeRoot(candidate: string | null | undefined): string | null {
  if (!candidate?.trim()) return null;
  const root = path.resolve(candidate.trim());
  if (
    !existsSync(path.join(root, 'scripts', 'zju.py')) ||
    !existsSync(path.join(root, 'references', 'endpoints.json')) ||
    (!existsSync(path.join(root, 'SKILL.md')) && !existsSync(path.join(root, 'upstream.json'))) ||
    !existsSync(path.join(root, 'LICENSE'))
  )
    return null;
  return root;
}

// These are source-field names observed in the skill's authenticated responses.
// Keep ordinary course/exam IDs usable while blocking account, card and identity
// identifiers before anything reaches the model or UI transcript.
const SENSITIVE_FIELD = /^(?:password|passwd|token|ticket|cookie|authorization|synjones|secret|openid|unionid|accesskey|qrcode|qr_code|barcode|voucher|body_b64|student.?no|student.?id|card.?no|card_number|identity.?no|identity.?id|id.?card|phone|mobile|email|account|sno|xh|yhm|xm|zgh|custid|custmemberid|acctid|cardid|bankacc|cert|schcode|yktschoolcode)$/i;

function parseJson(output: string): any {
  const trimmed = output.trim();
  if (!trimmed) throw new Error('连接器没有返回结果。');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('连接器返回的不是有效 JSON。');
  }
}

function modelRecords(domain: CampusDomain | undefined, records: any, truncated?: { value: boolean }): any {
  const clean = sanitize(records, '', 0, truncated);
  if (!Array.isArray(clean)) return clean;
  if (domain === 'practice')
    return clean.map((record) => ({
      second_class_points: record.dektJf,
      third_class_points: record.dsktJf,
      fourth_class_points: record.dsiktJf,
      second_class_credits: record.dektXf,
      third_class_credits: record.dsktXf,
      fourth_class_credits: record.dsiktXf,
      second_class_level: record.dektDj,
      third_class_level: record.dsktDj,
      fourth_class_level: record.dsiktDj,
      second_class_passed: record.dektTg,
      third_class_passed: record.dsktTg,
      fourth_class_passed: record.dsiktTg,
      aesthetic_education_passed: record.myTg,
      labor_education_passed: record.lyTg,
      note: 'points and credits are different measures; null means not supplied by this record',
    }));
  if (domain === 'profile')
    return clean.map((record) => ({
      department: record.bmmc,
      academic_program: record.xyzyxx,
      user_type: record.yhlx,
      is_student: record.student,
      is_teacher: record.teacher,
    }));
  if (domain === 'roles')
    return clean.map((record) => ({
      default_role: record.mrjsmc,
      roles: record.jsList,
      role_category: record.jsfl,
    }));
  if (domain === 'card')
    return clean.map((record) => ({
      balance_raw: record.db_balance,
      balance_unit: 'unverified_source_unit',
      expires_on_raw: record.expdate,
      card_type_name: record.cardname,
    }));
  return clean;
}

function stopProcess(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function compactResult(result: any, domain?: CampusDomain): any {
  if (!result || typeof result !== 'object') return result;
  const output: any = {
    status: result.status,
    fetched_at: result.fetched_at,
    authentication: result.authentication,
    source:
      result.source && typeof result.source === 'object'
        ? { service: result.source.service, evidence: result.source.evidence }
        : result.source,
    validation: result.validation,
    query: result.query,
    returned: result.returned,
    server_returned_count: result.server_returned_count,
    pagination: result.pagination,
    changes: result.changes,
    completeness: result.completeness,
    issues: result.issues,
    empty_result: result.empty_result,
    note: result.note,
    error: result.error,
    retrieved_at: result.retrieved_at,
    stale: result.stale,
    freshness: result.freshness,
    resource: result.resource,
    operation: result.operation,
    evaluated_at: result.evaluated_at,
    time_interval: result.time_interval,
    total_matches: result.total_matches,
    offset: result.offset,
    next_offset: result.next_offset,
    unknown_time_records: result.unknown_time_records,
    coverage: result.coverage,
    metric_quality: result.metric_quality,
    measurement_notes: result.measurement_notes,
    credential_redactions: result.credential_redactions,
    nested_values_truncated: result.nested_values_truncated,
    truncated_for_model: result.truncated_for_model,
    recordRead: result.recordRead,
    reason: result.reason,
    schema_version: result.schema_version,
    snapshotProof: result.snapshotProof,
    snapshotProofs: result.snapshotProofs,
    expectedSnapshotVersion: result.expectedSnapshotVersion,
    semester_id: result.semester_id,
    recordSelection: result.recordSelection,
    policyMeanings: result.policyMeanings,
    counts: result.counts,
    grade_attempts: result.grade_attempts,
    practice_projects: result.practice_projects,
    data_quality: result.data_quality,
    schedule_coverage: result.schedule_coverage,
    sections: result.sections,
    raw_data_preserved: result.raw_data_preserved,
    normalization_error_type: result.normalization_error_type,
    message: result.message,
    requested: result.requested,
    executed: result.executed,
  };
  const truncated = { value: false };
  if ('records' in result) output.records = modelRecords(domain, result.records, truncated);
  if ('results' in result) output.results = sanitize(result.results, '', 0, truncated);
  if ('result' in result) output.result = sanitize(result.result, '', 0, truncated);
  if (domain === 'source_status' && result.resources) output.resources = result.resources;
  if ('normalized' in result) output.normalized = sanitize(result.normalized, '', 0, truncated);
  if ('bundle_id' in result) output.bundle_id = result.bundle_id;
  const safeOutput = sanitize(output, '', 0, truncated);
  if (truncated.value) safeOutput.nested_values_truncated = true;
  const fits = (value: unknown) => Buffer.byteLength(JSON.stringify(value)) <= 56000;
  if (safeOutput.status !== 'navigate_required' && fits(safeOutput)) return safeOutput;
  const rows = safeOutput.records, offset = safeOutput.offset, total = safeOutput.total_matches;
  // Only a real records page has a cursor that can be moved to a shorter,
  // contiguous prefix. Other result shapes keep their original data on disk.
  if (safeOutput.status !== 'navigate_required' && Array.isArray(rows) && rows.every(row => row && typeof row === 'object' && !Array.isArray(row))
    && Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(total) && total >= offset + rows.length
    && (safeOutput.next_offset === null ? total === offset + rows.length
      : rows.length > 0 && safeOutput.next_offset === offset + rows.length && safeOutput.next_offset < total)
    && safeOutput.results === undefined && safeOutput.result === undefined && safeOutput.normalized === undefined) {
    for (let count = rows.length - 1; count > 0; count--) {
      const page = { ...safeOutput, records: rows.slice(0, count), next_offset: offset + count,
        ...(typeof safeOutput.returned === 'number' ? { returned: count } : {}) };
      if (fits(page)) return page;
    }
  }
  return { status: 'navigate_required', recordRead: false, resource: safeOutput.resource,
    authentication: safeOutput.authentication,
    bundle_id: safeOutput.bundle_id, offset, total_matches: total,
    expectedSnapshotVersion: safeOutput.snapshotProof?.version,
    fetched_at: safeOutput.fetched_at, snapshotProof: safeOutput.snapshotProof,
    ...(safeOutput.truncated_for_model === true ? { truncated_for_model: true } : {}),
    ...(safeOutput.nested_values_truncated === true ? { nested_values_truncated: true } : {}),
    reason: safeOutput.reason || safeOutput.message || '本次结果超出单次读取预算，没有交付正文。原资料仍保留，可减少字段或缩小查询范围后从同一位置读取。' };
}

function sanitize(value: any, key = '', depth = 0, truncated?: { value: boolean }): any {
  if (depth > 12) { if (truncated) truncated.value = true; return '[depth limit]'; }
  if (SENSITIVE_FIELD.test(key) || /(身份证|学号|手机号|邮箱)/.test(key)) return '[redacted]';
  if (typeof value === 'string') {
    return value
      .replace(/(token|ticket|code|synjones-auth|password)=[^&\s"<>]+/gi, '$1=[redacted]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted]');
  }
  if (Array.isArray(value)) return value.map(item => sanitize(item, key, depth + 1, truncated));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k, depth + 1, truncated)]));
  return value;
}

export class ZjuAdapter {
  private snapshotProofs = new CampusSnapshotProofs(() => this.root());
  private authInFlight?: Promise<any>;
  private academicInFlight = new Map<string, Promise<any>>();
  private academicBundles = new Map<string, string>();
  private academicBundleStamps = new Map<string, string | undefined>();
  private learningBundles = new Map<string, string>();
  private resolvedPython?: string;

  constructor(
    private store: Store,
    private testPorts: { credentialsConfigured?: () => boolean; python?: string } = {},
  ) {}

  private discoveredRoot(): string | null {
    const stored = safeRoot(this.store.meta<string | null>('zju_source_root', null));
    if (stored) return stored;
    const explicit = safeRoot(process.env.ZAICHANG_ZJU_SOURCE);
    if (explicit) return explicit;
    // Explicit settings retain ownership of a selected connector. The product
    // carries the same reviewed CLI for independent desktop installations;
    // older installed skills remain a migration input rather than a dependency.
    // Test profiles are intentionally isolated from the real account.
    if (process.env.ZAICHANG_TEST === '1') return null;
    const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
      || path.join(path.dirname(process.execPath), 'resources');
    const candidates = [
      path.join(resources, 'zju-runtime'),
      path.resolve(process.cwd(), 'src', 'main', 'integrations', 'zju'),
      path.resolve(process.cwd(), 'dist-electron', 'zju-runtime'),
      path.join(homedir(), '.codex', 'skills', 'zju-student-info'),
      process.env.CODEX_HOME
        ? path.join(path.resolve(process.env.CODEX_HOME), 'skills', 'zju-student-info')
        : '',
      path.resolve(process.cwd(), 'integrations', 'zju-student-info'),
    ];
    for (const candidate of candidates) {
      const discovered = safeRoot(candidate);
      if (discovered) return discovered;
    }
    return null;
  }

  private root(): string | null {
    return this.store.meta<boolean>('zju_source_disabled', false) ? null : this.discoveredRoot();
  }

  connectInstalled(): CampusConnectorState {
    this.store.putMeta('zju_source_disabled', false);
    const root = this.discoveredRoot();
    if (!root) {
      this.store.putMeta('zju_source_disabled', true);
      throw new Error('本机的浙大连接程序暂时不可用。可以重新安装应用，或在连接设置中选择已有目录。');
    }
    return this.describe();
  }

  describe(): CampusConnectorState {
    const root = this.root();
    if (!root)
      return {
        configured: false,
        available: false,
        label: '浙大校园账号',
        sourceKind: 'zju_account',
        authStatus: 'needs_login',
        credentialsConfigured: false,
        reason: '本机的浙大连接程序暂时不可用。可以重新安装应用，或在连接设置中选择已有目录。',
      };
    try {
      const verificationPath = path.join(root, 'references', 'verification-latest.json');
      const verification = existsSync(verificationPath) ? JSON.parse(readFileSync(verificationPath, 'utf8')) : null;
      const credentialsConfigured = this.credentialsConfigured();
      const verifiedMtime = this.store.meta<number | null>('zju_verified_credentials_mtime', null);
      const currentMtime = this.credentialsMtime();
      const mtimeMatches = this.testPorts.credentialsConfigured
        ? true
        : verifiedMtime !== null &&
          verifiedMtime !== undefined &&
          currentMtime !== undefined &&
          verifiedMtime === currentMtime;
      const lastVerifiedAt = mtimeMatches
        ? this.store.meta<string | null>('zju_last_verified_at', null) || undefined
        : undefined;
      const lastAuthError = this.store.meta<string | null>('zju_last_auth_error', null);
      const authStatus: CampusAuthStatus = !credentialsConfigured
        ? 'needs_login'
        : lastVerifiedAt
          ? 'verified'
          : lastAuthError
            ? 'failed'
            : 'credentials_saved';
      return {
        configured: true,
        available: true,
        label: '浙大校园账号',
        sourceKind: 'zju_account',
        authStatus,
        lastVerifiedAt,
        catalogued: Number(verification?.total_catalogued || 0) || undefined,
        verified: Number(verification?.passed || 0) || undefined,
        blocked: Number(verification?.blocked || 0) || undefined,
        credentialsConfigured,
        reason: credentialsConfigured
          ? authStatus === 'verified'
            ? undefined
            : authStatus === 'failed'
              ? '登录信息已保存，但最近一次登录校验没有完成。'
              : '登录信息已保存；现有资料可在本机读取，更新时再校验学校登录。'
          : '还没有在本机保存浙大统一身份认证信息。',
      };
    } catch {
      return {
        configured: true,
        available: true,
        label: '浙大校园账号',
        sourceKind: 'zju_account',
        authStatus: this.credentialsConfigured() ? 'credentials_saved' : 'needs_login',
        credentialsConfigured: this.credentialsConfigured(),
        reason: '浙大连接程序已找到，账号连接状态暂时没能读到。',
      };
    }
  }

  private credentialsConfigured(): boolean {
    if (this.testPorts.credentialsConfigured) return this.testPorts.credentialsConfigured();
    const base = process.env.LOCALAPPDATA;
    return !!base && existsSync(path.join(base, 'CodexZjuStudentInfo', 'credentials.dpapi'));
  }

  private credentialsMtime(): number | undefined {
    if (this.testPorts.credentialsConfigured) return undefined;
    const base = process.env.LOCALAPPDATA;
    if (!base) return undefined;
    try {
      return statSync(path.join(base, 'CodexZjuStudentInfo', 'credentials.dpapi')).mtimeMs;
    } catch {
      return undefined;
    }
  }

  configure(root: string): CampusConnectorState {
    const safe = safeRoot(root);
    if (!safe) throw new Error('所选目录不是可识别的浙大个人信息连接器。');
    this.store.putMeta('zju_source_root', safe);
    this.store.putMeta('zju_source_disabled', false);
    this.store.putMeta('zju_last_verified_at', null);
    this.store.putMeta('zju_last_auth_error', null);
    this.store.putMeta('zju_verified_credentials_mtime', null);
    this.snapshotProofs.clear();
    this.learningBundles.clear();
    this.academicBundles.clear();
    this.academicBundleStamps.clear();
    return this.describe();
  }

  disconnect() {
    this.snapshotProofs.clear();
    this.store.putMeta('zju_source_root', null);
    this.store.putMeta('zju_source_disabled', true);
    this.store.putMeta('zju_last_verified_at', null);
    this.store.putMeta('zju_last_auth_error', null);
    this.store.putMeta('zju_verified_credentials_mtime', null);
    this.learningBundles.clear();
    this.academicBundles.clear();
    this.academicBundleStamps.clear();
  }

  async configureCredentials(): Promise<void> {
    const root = this.root();
    if (!root) throw new Error('请先选择浙大个人信息连接器目录。');
    const python = this.pythonCommand();
    const child = spawn(python, [path.join(root, 'scripts', 'zju.py'), 'credentials', 'set'], {
      cwd: root,
      env: this.childEnv(),
      windowsHide: false,
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { stopProcess(child); reject(new Error('凭据窗口等待超时。')); }, 180_000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('凭据未保存。')); });
    });
    this.store.putMeta('zju_last_verified_at', null);
    this.store.putMeta('zju_last_auth_error', null);
    this.store.putMeta('zju_verified_credentials_mtime', null);
    this.snapshotProofs.clear();
    this.learningBundles.clear();
    this.academicBundles.clear();
    this.academicBundleStamps.clear();
  }

  async forgetCredentials(signal: AbortSignal = new AbortController().signal) {
    const wasDisabled = this.store.meta<boolean>('zju_source_disabled', false);
    if (wasDisabled) this.store.putMeta('zju_source_disabled', false);
    try {
      if (!this.root()) return { status: 'unavailable', reason: '本机的浙大连接程序暂时不可用。' };
      const result = await this.run(['credentials', 'forget'], signal, 20_000);
      if (result?.status === 'ok') {
        this.store.putMeta('zju_last_verified_at', null);
        this.store.putMeta('zju_last_auth_error', null);
        this.store.putMeta('zju_verified_credentials_mtime', null);
        this.snapshotProofs.clear();
        this.learningBundles.clear();
        this.academicBundles.clear();
        this.academicBundleStamps.clear();
      }
      return result;
    } finally {
      if (wasDisabled) this.store.putMeta('zju_source_disabled', true);
    }
  }

  /** Verify the saved account through the skill's SSO flow without returning credentials. */
  async verifyAccount(signal: AbortSignal = new AbortController().signal) {
    const connector = this.describe();
    const authSource = { root: this.root(), identity: this.snapshotProofs.readingSourceIdentity(), mtime: this.credentialsMtime() };
    const sameSource = () => this.root() === authSource.root && this.snapshotProofs.readingSourceIdentity() === authSource.identity
      && this.credentialsMtime() === authSource.mtime;
    const changed = () => ({ status: 'conflict', connector: this.describe(),
      error: { code: 'AUTH_SOURCE_CHANGED', message: '认证期间的账号或连接绑定变了，本次没有为另一份登录信息记录验证结果。' } });
    if (!connector.available)
      return { status: 'unavailable', connector, reason: connector.reason };
    if (!connector.credentialsConfigured)
      return { status: 'auth_required', connector, reason: '请先在本机保存浙大统一身份认证信息。' };
    try {
      const result = await this.run(['auth'], signal, 75_000);
      if (!sameSource()) return changed();
      if (result?.status === 'ok') {
        this.store.putMeta('zju_last_verified_at', new Date().toISOString());
        this.store.putMeta('zju_last_auth_error', null);
        this.store.putMeta('zju_verified_credentials_mtime', authSource.mtime ?? null);
        return { ...result, connector: this.describe(), authentication: 'zju_sso_verified' };
      }
      this.store.putMeta('zju_last_auth_error', String(result?.error?.code || 'AUTH_FAILED').slice(0, 80));
      return { ...result, connector: this.describe() };
    } catch (error) {
      if (signal.aborted) throw error;
      if (!sameSource()) return changed();
      this.store.putMeta('zju_last_auth_error', 'AUTH_FAILED');
      return {
        status: 'error',
        connector: this.describe(),
        error: { code: 'AUTH_FAILED', message: '浙大统一身份认证没有完成，请检查网络或登录信息。' },
      };
    }
  }

  private async ensureAuthenticated(signal: AbortSignal) {
    const connector = this.describe();
    if (!connector.credentialsConfigured)
      return { status: 'auth_required', reason: '请先在本机保存浙大统一身份认证信息。' };
    const verifiedAt = connector.lastVerifiedAt ? Date.parse(connector.lastVerifiedAt) : NaN;
    if (Number.isFinite(verifiedAt) && Date.now() - verifiedAt < 10 * 60_000)
      return { status: 'ok', authenticated_at: connector.lastVerifiedAt,
        authentication: this.liveAuthentication('reused', connector.lastVerifiedAt) };
    if (!this.authInFlight) {
      this.authInFlight = this.verifyAccount(signal).finally(() => {
        this.authInFlight = undefined;
      });
    }
    const result = await this.authInFlight;
    return result?.status === 'ok' ? { ...result, authentication: this.liveAuthentication('performed', this.describe().lastVerifiedAt) } : result;
  }
  private liveAuthentication(ssoCheck: 'performed' | 'reused', verifiedAt?: string): CampusAuthentication {
    return { mode: 'live_session', accountBinding: 'current_local_account', ssoCheck,
      ...(verifiedAt ? { verifiedAt } : {}) };
  }
  private savedAuthentication(): CampusAuthentication {
    const lastSsoVerifiedAt = this.describe().lastVerifiedAt;
    return { mode: 'saved_snapshot', accountBinding: 'current_local_account', ssoCheck: 'not_performed',
      ...(lastSsoVerifiedAt ? { lastSsoVerifiedAt } : {}) };
  }
  /** Only the declared complete-data interface has the reviewed local
   * history/quick semantics. Older CLI adapters retain authentication first. */
  private savedModelContract() {
    const root = this.root();
    if (!root) return false;
    try {
      const file = path.join(root, 'references', 'model-schema.json'), stat = statSync(file);
      if (!stat.isFile() || stat.size > 256000) return false;
      const schema = JSON.parse(readFileSync(file, 'utf8'));
      if (schema?.schema_version !== 2 || !schema.models || typeof schema.models !== 'object' || Array.isArray(schema.models)) return false;
      const required = { course: ['id', 'key', 'semester_id', 'source_refs'], occurrence: ['uid', 'startTime', 'endTime', 'source_refs'],
        exam: ['id', 'startTime', 'endTime', 'source_ref'], grade: ['id', 'semester_id', 'original', 'source_ref'],
        dataset: ['pages', 'records', 'record_refs', 'completeness', 'sha256'] };
      return Object.entries(required).every(([name, fields]) => {
        const model = schema.models[name];
        return model && typeof model === 'object' && !Array.isArray(model)
          && fields.every(field => typeof model[field] === 'string' && model[field].trim().length > 0);
      });
    } catch { return false; }
  }
  private async bindSavedBundles(resource: string, ids: string[], identity: string | undefined, signal: AbortSignal, academicOnly: boolean): Promise<SavedCampusBinding | undefined> {
    if (!identity || !ids.length) return;
    const versions = [...new Set(ids)].map(bundleId => ({ bundleId, version: this.snapshotProofs.readingVersion(bundleId, resource) }));
    if (versions.some(item => !item.version)) return;
    for (const item of versions) {
      const history = await this.savedHistory(signal, entry => entry?.bundle_id === item.bundleId);
      if (!history?.found || academicOnly && history.found.kind !== 'academic'
        || this.snapshotProofs.readingSourceIdentity() !== identity) return;
    }
    const binding: SavedCampusBinding = { identity, resource,
      versions: versions.map(item => ({ bundleId: item.bundleId, version: item.version! })) };
    return this.savedBindingCurrent(binding) ? binding : undefined;
  }
  private savedBindingCurrent(binding: SavedCampusBinding) {
    return this.snapshotProofs.readingSourceIdentity() === binding.identity
      && binding.versions.every(item => this.snapshotProofs.matchesReadingVersion(item.bundleId, binding.resource, item.version));
  }

  /** Prove that a fixed single-resource quick/select can stay on this bundle.
   * The CLI otherwise fills a missing root from its latest related source. */
  private async requireSavedResourceStructure(binding: SavedCampusBinding, bundleId: string, resource: string, signal: AbortSignal) {
    const root = this.root();
    const current = () => {
      signal.throwIfAborted();
      return !!root && this.root() === root && this.savedBindingCurrent(binding)
        && binding.versions.some(item => item.bundleId === bundleId);
    };
    const unavailable = (code: string) => ({ status: 'error', recordRead: false, resource, bundle_id: bundleId,
      error: { code }, reason: '这份固定快照的资源结构尚未能对应，本次没有改读另一份保存资料。' });
    if (!current()) return { status: 'conflict', snapshotChanged: true, recordRead: false,
      reason: '核对资源结构前的账号或保存快照版本已变化，尚未读取这份资料。' };
    const endpoint = campusSourceEndpoint(binding.resource);
    const rootKey = resource === 'source_status' || endpoint ? ''
      : normalizedRoots[resource as keyof typeof normalizedRoots]?.split('/')[2];
    if (rootKey === undefined) return unavailable('SOURCE_UNAVAILABLE');
    let metadata: any;
    try {
      metadata = await this.runPython(root!, ['-I', '-B', '-c', campusSnapshotStructureProgram,
        path.join(root!, 'scripts'), bundleId, resource, rootKey, endpoint || ''], signal, 20000);
    } catch (error) {
      if (signal.aborted) throw error;
      if (!current()) return { status: 'conflict', snapshotChanged: true, recordRead: false,
        reason: '核对资源结构期间的账号或保存快照版本已变化，尚未读取这份资料。' };
      return unavailable('SNAPSHOT_STRUCTURE_UNAVAILABLE');
    }
    if (!current()) return { status: 'conflict', snapshotChanged: true, recordRead: false,
      reason: '核对资源结构期间的账号或保存快照版本已变化，尚未读取这份资料。' };
    if (metadata?.status !== 'ok') return unavailable(['SNAPSHOT_MODULE_SOURCE', 'SNAPSHOT_STRUCTURE_UNKNOWN', 'SNAPSHOT_STRUCTURE_UNAVAILABLE']
      .includes(metadata?.error?.code) ? metadata.error.code : 'SNAPSHOT_STRUCTURE_UNAVAILABLE');
    if (metadata.version !== 1 || metadata.bundleId !== bundleId || metadata.resource !== resource || metadata.rootKey !== rootKey
      || typeof metadata.relatedPresent !== 'boolean' || (metadata.relatedPresent && metadata.relatedKind !== 'object')
      || metadata.relatedOverride !== false)
      return unavailable('SOURCE_UNAVAILABLE');
    if (endpoint) {
      if (metadata.datasetKind !== 'object' || metadata.datasetRecordsKind !== 'array' || metadata.endpointMatches !== true)
        return unavailable('SOURCE_UNAVAILABLE');
    } else if (resource !== 'source_status') {
      const kinds = rootKey === 'calendar' ? ['object', 'null']
        : ['transcript', 'practice', 'schedule_quality'].includes(rootKey) ? ['object'] : ['array'];
      if (metadata.normalizedKind !== 'object' || metadata.rootPresent !== true || !kinds.includes(metadata.rootKind))
        return unavailable('SOURCE_UNAVAILABLE');
    }
    return undefined;
  }

  private childEnv() {
    const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' } as Record<string, string | undefined>;
    // The connector never needs model/API secrets. Do not inherit them into a
    // third-party Python process even though the skill itself does not print env.
    for (const key of [
      'ZAICHANG_PROJECT_DEEPSEEK_KEY',
      'ZAICHANG_TEST_DEEPSEEK_KEY',
      'DEEPSEEK_API_KEY',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GOOGLE_API_KEY',
    ]) delete env[key];
    return env;
  }

  async run(args: string[], signal: AbortSignal, timeoutMs = 45_000): Promise<any> {
    const root = this.root();
    if (!root) return { status: 'unavailable', reason: '浙大个人信息连接器尚未配置。', connector: this.describe() };
    const script = path.join(root, 'scripts', 'zju.py');
    return this.runPython(root, [script, ...args], signal, timeoutMs);
  }

  private async runPython(root: string, args: string[], signal: AbortSignal, timeoutMs: number): Promise<any> {
    signal.throwIfAborted();
    const python = this.pythonCommand();
    const child = spawn(python, args, {
      cwd: root,
      env: this.childEnv(),
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '', stderr = '', settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    const output = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const timer = setTimeout(() => { stopProcess(child); finish(() => reject(new Error('校园连接器超过本轮时间上限，已停止。'))); }, timeoutMs);
      const abort = () => { clearTimeout(timer); stopProcess(child); finish(() => reject(signal.reason || new DOMException('已停止', 'AbortError'))); };
      signal.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', chunk => { stdout += String(chunk); if (stdout.length > 1_200_000) abort(); });
      child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(0, 4000); });
      child.on('error', error => { clearTimeout(timer); signal.removeEventListener('abort', abort); finish(() => reject(error)); });
      child.on('close', code => { clearTimeout(timer); signal.removeEventListener('abort', abort); finish(() => resolve({ code, stdout, stderr })); });
    });
    let parsed: any;
    try { parsed = parseJson(output.stdout); } catch { throw new Error('校园连接器输出异常，请检查其本地 Python 环境。'); }
    if (output.code !== 0 && parsed.status !== 'partial') {
      const error = parsed.error || { code: 'CONNECTOR_ERROR', message: '校园连接器没有完成请求。' };
      return { status: 'error', error, stderr: output.stderr.slice(0, 500), connector: this.describe() };
    }
    return parsed;
  }

  private pythonCommand() {
    if (this.resolvedPython) return this.resolvedPython;
    if (this.testPorts.python) return this.testPorts.python;
    const configured = process.env.ZAICHANG_PYTHON?.trim();
    if (configured) return configured;
    const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
      || path.join(path.dirname(process.execPath), 'resources');
    const interpreter = process.platform === 'win32' ? 'python.exe' : 'bin/python3';
    const runtimeRoots = [process.env.ZAICHANG_RUNTIME_ROOT, path.join(resources, 'hermes-runtime'), process.cwd()];
    for (const root of runtimeRoots) {
      if (!root) continue;
      const bundled = path.join(root, '.runtime', 'python', interpreter);
      if (existsSync(bundled)) return (this.resolvedPython = bundled);
    }
    // The normal Windows launcher is `python`; fall back to `py` for machines
    // where only the launcher is registered. This probe never receives data.
    for (const candidate of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
      const probe = spawnSync(candidate, ['--version'], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 3000,
      });
      if (probe.status === 0) return (this.resolvedPython = candidate);
    }
    return (this.resolvedPython = process.platform === 'win32' ? 'python' : 'python3');
  }

  private async bootstrapAcademic(
    signal: AbortSignal,
    academicYear = this.defaultAcademicYear(),
    term: '1' | '2' = this.defaultTerm(),
  ) {
    const key = `${academicYear}:${term}`;
    let pending = this.academicInFlight.get(key);
    if (!pending) {
      pending = this.run(
        ['academic', '--year', academicYear, '--term', term],
        signal,
        85_000,
      ).finally(() => {
        this.academicInFlight.delete(key);
      });
      this.academicInFlight.set(key, pending);
    }
    const result = await pending;
    if (result?.bundle_id) {
      this.academicBundles.set(`${academicYear}:${term}`, String(result.bundle_id));
      this.academicBundleStamps.set(`${academicYear}:${term}`, this.snapshotProofs.headStamp('classes'));
    }
    return result;
  }

  private async resolveAcademicBundle(
    signal: AbortSignal,
    academicYear = this.defaultAcademicYear(),
    term: '1' | '2' = this.defaultTerm(),
  ): Promise<string | undefined> {
    const key = `${academicYear}:${term}`;
    const cached = this.academicBundles.get(key);
    const headStamp = this.snapshotProofs.headStamp('classes');
    if (cached && this.academicBundleStamps.get(key) === headStamp) {
      const history = await this.savedHistory(signal, entry => entry?.bundle_id === cached && entry.kind === 'academic');
      if (history?.found) return cached;
    }
    const wanted = `${academicYear}-${term}`;
    const history = await this.savedHistory(signal, entry => entry?.kind === 'academic' && String(entry.semester_id || '') === wanted);
    const item = history?.found;
    if (item?.bundle_id) {
      this.academicBundles.set(key, String(item.bundle_id));
      this.academicBundleStamps.set(key, headStamp);
      return String(item.bundle_id);
    }
    // Missing saved data is not permission for a wider fresh collection.
    return undefined;
  }

  /** The installed quick command refreshes only its latest academic baseline.
   * It has no compare-and-swap argument: check the boundary around the call,
   * and never turn an unproved or changed baseline into a current receipt. */
  private async refreshAcademicResource(resource: string, signal: AbortSignal, academicYear: string, term: '1' | '2') {
    const missing = (reason: string, status = 'partial') => ({ status, reason, resource, bundle_id: undefined, refreshHead: undefined, refreshIssues: [] as string[] });
    if (!academicRefreshSources[resource]) return missing('原连接器没有这个资源的窄刷新方法，本次没有改用整包采集。', 'unsupported');
    const identity = this.snapshotProofs.readingSourceIdentity(), head = this.snapshotProofs.headStamp(resource);
    if (!identity || !head) return missing('当前账号的学业快照基线尚无法核对，本次没有刷新或改为完整采集。');
    const latest = await this.run(['quick', 'source_status', '--fields', 'dataset', '--limit', '1'], signal);
    const baselineId = latest?.bundle_id;
    if (!['ok', 'partial'].includes(String(latest?.status)) || !/^[a-f0-9]{32}$/.test(String(baselineId || '')))
      return missing('当前账号还没有可读的latest学业快照，窄刷新尚未开始；首次完整采集另有自己的范围和用途。');
    const before = await this.savedHistory(signal, item => item?.bundle_id === baselineId);
    const semester = `${academicYear}-${term}`;
    if (before?.found?.kind !== 'academic' || before.found.semester_id !== semester)
      return missing('当前latest快照尚未与本次账号和所需学期对应，本次没有刷新别的学期或改为整包采集。');
    if (this.snapshotProofs.readingSourceIdentity() !== identity || this.snapshotProofs.headStamp(resource) !== head)
      return missing('准备刷新时账号或latest基线已经变化，这次没有沿旧基线继续。', 'conflict');
    const refreshed = await this.run(['quick', resource, '--refresh', '--fields', '_resource', '--limit', '1'], signal, 85_000);
    const bundleId = refreshed?.bundle_id;
    if (!['ok', 'partial'].includes(String(refreshed?.status)) || !/^[a-f0-9]{32}$/.test(String(bundleId || '')) || bundleId === baselineId)
      return missing('原资源刷新没有形成可核对的新快照，当前还没有取得这次更新后的资料。');
    const afterHead = this.snapshotProofs.headStamp(resource);
    const after = await this.savedHistory(signal, item => item?.bundle_id === bundleId);
    const current = await this.run(['quick', 'source_status', '--fields', 'dataset', '--limit', '1'], signal);
    if (this.snapshotProofs.readingSourceIdentity() !== identity || !afterHead || this.snapshotProofs.headStamp(resource) !== afterHead
      || after?.found?.kind !== 'academic' || after.found.semester_id !== semester
      || !['ok', 'partial'].includes(String(current?.status)) || current?.bundle_id !== bundleId)
      return missing('刷新后的账号、学期或当前latest未能与本次范围对应，这份结果没有作为当前资料交付。', 'conflict');
    const errors = await this.run(['read', '--bundle', bundleId, '--pointer', '/normalized/data_quality/refresh_errors', '--limit', '20'], signal);
    if (errors?.status !== 'ok' || errors.bundle_id !== bundleId || !Array.isArray(errors.data)
      || errors.data.some((value: unknown) => typeof value !== 'string')
      || this.snapshotProofs.readingSourceIdentity() !== identity || this.snapshotProofs.headStamp(resource) !== afterHead)
      return missing('本次窄刷新的来源完整性或当前基线尚无法核对，未把未明状态说成更新成功。', 'conflict');
    this.academicBundles.set(`${academicYear}:${term}`, bundleId);
    this.academicBundleStamps.set(`${academicYear}:${term}`, afterHead);
    return { status: errors.data.length ? 'partial' : 'ok', resource, bundle_id: bundleId as string, refreshHead: afterHead,
      refreshIssues: errors.data as string[], reason: errors.data.length ? '部分相关来源刷新未完成，新快照保留了带有旧采集时间的资料，缺口仍在。' : undefined };
  }

  private async savedHistory(signal: AbortSignal, matches: (entry: any) => boolean) {
    const items: any[] = [];
    let offset = 0;
    while (items.length < 2000) {
      signal.throwIfAborted();
      const page = await this.run(['history', '--offset', String(offset), '--limit', '100'], signal, 20000);
      if (page?.status !== 'ok' || !Array.isArray(page.items)) return undefined;
      items.push(...page.items);
      const found = items.find(matches), next = page.next_offset;
      if (found || next == null) return { status: 'ok' as const, items, found, exhausted: next == null };
      if (!Number.isSafeInteger(next) || next <= offset || page.items.length === 0) return undefined;
      offset = next;
    }
    return undefined;
  }
  private async currentAccountHasBundle(bundleId: string, signal: AbortSignal) {
    if (!/^[a-f0-9]{32}$/.test(bundleId)) return false;
    const history = await this.savedHistory(signal, item => item?.bundle_id === bundleId);
    return history?.status === 'ok' && history.found?.bundle_id === bundleId;
  }

  private async academicSemester(bundleId: string | undefined, signal: AbortSignal): Promise<string | undefined> {
    if (!bundleId) return undefined;
    const history = await this.savedHistory(signal, item => item?.bundle_id === bundleId && item.kind === 'academic');
    const semester = history?.found?.semester_id;
    return typeof semester === 'string' && /^20\d{2}-20\d{2}-[12]$/.test(semester) ? semester : undefined;
  }

  async capabilities(signal: AbortSignal) {
    const root = this.root();
    if (!root) return { status: 'unavailable', reason: '浙大个人信息连接器尚未配置。', connector: this.describe() };
    try {
      const registry = JSON.parse(readFileSync(path.join(root, 'references', 'endpoints.json'), 'utf8'));
      const endpoints = Array.isArray(registry.endpoints) ? registry.endpoints : [];
      const counts = endpoints.reduce((acc: Record<string, number>, item: any) => { const key = String(item.status || 'unknown'); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
      return { status: this.credentialsConfigured() ? 'ok' : 'auth_required', connector: this.describe(), resources: counts, catalogued: endpoints.length, note: '只读本地连接器目录，没有读取个人记录。' };
    } catch {
      return { status: 'error', connector: this.describe(), reason: '无法读取连接器目录。' };
    }
  }

  /** Complete query/navigation semantics over the installed read-only skill.
   * No model-supplied CLI, directory, endpoint, or authentication material. */
  async query(raw: CampusQuery, signal: AbortSignal, acquisition?: CampusAcquisition): Promise<any> {
    const args = validateCampusQuery(raw), connector = this.describe();
    const examCourseRead = args.operation === 'read' && args.resource === 'exams' && args.pointer === examCourseRecordsPointer;
    const majorGpaRead = args.operation === 'read' && args.resource === 'gpa_overall' && args.pointer === majorGpaPointer;
    const readingIdentity = ['resources', 'schema'].includes(args.operation) ? undefined : this.snapshotProofs.readingSourceIdentity();
    if (args.refresh && (!['quick', 'select'].includes(args.operation) || args.bundleId || args.expectedSnapshotVersion))
      throw new HarnessError('campus_snapshot_request', '刷新需要新的资源查询起点；固定快照、版本和原页导航仍保留原地址，本次没有把它们当作刷新。');
    if (!connector.available) return { status: 'unavailable', reason: connector.reason };
    if (args.operation === 'resources') {
      const result = { ...sanitize(await this.run(['resources'], signal)), hostReadFacets: [{
        source: 'host_adapter', model: 'exam_course_record', resource: 'exams', operation: 'read', pointer: examCourseRecordsPointer,
        requires: ['bundleId'], optional: ['expectedSnapshotVersion', 'offset', 'limit'],
        schema: { tool: 'look_up', arguments: { source: 'capability', capability: 'campus.query', arguments: { operation: 'schema', model: 'exam_course_record' } } },
        meaning: '这是宿主对已保存考试课程原行的读取说明，不是连接器新增的查询资源，也没有读取正文。旧快照可能缺少这个路径；按原数组顺序独立分页，不提供筛选、组合或刷新。',
      }, {
        source: 'host_adapter', model: 'major_gpa', resource: 'gpa_overall', operation: 'read', pointer: majorGpaPointer,
        requires: ['bundleId'], optional: ['expectedSnapshotVersion', 'fields'], defaultFields: [...majorGpaReadFields],
        schema: { tool: 'look_up', arguments: { source: 'capability', capability: 'campus.query', arguments: { operation: 'schema', model: 'major_gpa' } } },
        meaning: '沿同一保存快照读取已确认主修课程的现成汇总。它和全部修读分别保有学分分母，读取时一起核对成绩与主修来源；这里只介绍地址，尚未读到本人均绩。',
      }] };
      const root = this.root();
      if (result.status !== 'ok' || !root) return result;
      try {
        const file = path.join(root, 'references', 'model-schema.json');
        const size = statSync(file);
        if (!size.isFile() || size.size > 256000) throw new Error('schema catalogue size');
        const models: unknown = JSON.parse(readFileSync(file, 'utf8')).models;
        if (!models || typeof models !== 'object' || Array.isArray(models)) throw new Error('schema catalogue shape');
        const entries = Object.entries(models);
        if (!entries.length || entries.length > 100 || entries.some(([name, fields]) => !/^[a-z_]{1,60}$/.test(name)
          || !fields || typeof fields !== 'object' || Array.isArray(fields))) throw new Error('schema catalogue models');
        return { ...result, schemaModels: entries.map(([model]) => ({ model,
          read: { tool: 'look_up', arguments: { source: 'capability', capability: 'campus.query', arguments: { operation: 'schema', model } } },
        })), schemaCatalog: { status: 'available', source: 'installed_connector_model_schema',
          meaning: '这是当前连接器实际提供的字段模型；不是个人记录、查询结果或完整业务覆盖。资源名与字段模型名不一定相同。' } };
      } catch {
        return { ...result, status: 'partial', schemaModels: [], schemaCatalog: { status: 'unavailable',
          reason: '资源目录已读到，但连接器字段模型目录缺失或格式不符；未猜测模型名或读取个人资料。' } };
      }
    }
    if (args.operation === 'schema') {
      if (args.model === 'major_gpa') return { status: 'ok', model: args.model, source: 'host_adapter', recordRead: false,
        resource: 'gpa_overall', pointer: majorGpaPointer, recordKind: 'major_gpa',
        fields: majorGpaFields, defaultFields: [...majorGpaReadFields],
        meaning: '这是保存资料里已确认主修全部修读的分析汇总，不是学校另行给出的正式审核结果。read沿固定对象地址读取所选汇总字段，没有逐行分页；offset为0，fields只选择显示内容，不重算分母。默认不返回排除、缺项和零学分记录的标识。' };
      if (args.model === 'exam_course_record') return { status: 'ok', model: args.model, source: 'host_adapter', recordRead: false,
        resource: 'exams', pointer: examCourseRecordsPointer, recordKind: 'exam_course_record',
        fields: { id: '考试来源中的课程标识；缺失不补写', name: '来源课程名称', credit: '来源学分；缺失不填零',
          semester_id: '该课程原行的学期标识', exams: '这条原行生成的考试对象，可能为零、一或两场；各保留type、时间文字、地点、座位和source_ref，解析不出的时间仍未知',
          source_ref: '这条原行在原考试数据集中的位置',
          schedule_state: 'published仅表示来源有非空考试时间文字并生成对象，不代表官方状态或时间已精确解析；no_exam_time_returned表示该原行没有返回时间文字，不证明不考试' },
        meaning: '这是宿主对当前已存结构的说明，不是CLI已有字段模型或个人记录。read只接受这个精确根数组地址，按offset/limit返回完整原行；total_matches计课程原行，与考试对象数分开。旧快照缺路径与实际空数组分别保留。' };
      const result = sanitize(await this.run(['schema', args.model!], signal));
      return args.model === 'gpa' && result.status === 'ok' ? { ...result, policyMeanings: campusGpaPolicies } : result;
    }
    if (campusAcademicAcquisition('campus.query', args) && !acquisition?.allowAcademicSync)
      return { status: 'forbidden', acquisition: campusAcademicAcquisition('campus.query', args), recordRead: false,
        reason: '本次资源刷新与既存完整学业快照的本机归一化还没有用途准入，尚未采集。已有保存资料仍可用refresh=false按原资源和页地址读取。' };
    const resource = args.resource || args.spec!.resource;
    let bundle = args.bundleId, refreshHead: string | undefined, refreshIssues: string[] = [], resolvedAcademic = false;
    const academic = !['reservations', 'reservation_violations', 'card_accounts', 'transactions', 'student_profile', 'roles', 'activities'].includes(resource);
    const singleResource = !args.spec?.join && (!args.spec?.resources || args.spec.resources.length === 1 && args.spec.resources[0] === resource);
    const savedContract = this.savedModelContract();
    const localCandidate = savedContract && !args.refresh && academic && singleResource && ['quick', 'select', 'read', 'diff'].includes(args.operation);
    const localHistory = savedContract && !args.refresh && args.operation === 'history' && !args.bundleId && !args.fromBundle && !args.toBundle && !!readingIdentity;
    let binding: SavedCampusBinding | undefined;
    if (localCandidate && readingIdentity) {
      if (['quick', 'select'].includes(args.operation) && !bundle) {
        bundle = await this.resolveAcademicBundle(signal, args.academicYear || this.defaultAcademicYear(), args.term || this.defaultTerm());
        resolvedAcademic = !!bundle;
      }
      const ids = args.operation === 'diff' ? [args.fromBundle, args.toBundle] : [bundle];
      if (ids.every((id): id is string => !!id)) binding = await this.bindSavedBundles(resource, ids, readingIdentity, signal, true);
    }
    if (readingIdentity && this.snapshotProofs.readingSourceIdentity() !== readingIdentity)
      return { status: 'forbidden', recordRead: false, reason: '读取前的账号或连接绑定变了，尚未读取个人记录。' };
    let authentication: CampusAuthentication;
    if (binding || localHistory) authentication = this.savedAuthentication();
    else {
      const authenticated = await this.ensureAuthenticated(signal);
      if (authenticated?.status !== 'ok') return { status: authenticated?.status === 'conflict' ? 'conflict' : 'auth_required',
        recordRead: false, reason: authenticated?.status === 'conflict' ? authenticated.error.message : '校园会话尚未完成校验；没有读取这些资料。' };
      authentication = authenticated.authentication;
    }
    if (readingIdentity && this.snapshotProofs.readingSourceIdentity() !== readingIdentity)
      return { status: 'forbidden', recordRead: false, reason: '认证期间的账号或连接绑定变了，尚未读取个人记录。' };
    if (['quick', 'select'].includes(args.operation) && academic && !bundle) {
      if (args.refresh) {
        const refreshed = await this.refreshAcademicResource(resource, signal, args.academicYear || this.defaultAcademicYear(), args.term || this.defaultTerm());
        if (!refreshed.bundle_id) return refreshed;
        bundle = refreshed.bundle_id; refreshHead = refreshed.refreshHead; refreshIssues = refreshed.refreshIssues;
      } else {
        bundle = await this.resolveAcademicBundle(signal, args.academicYear || this.defaultAcademicYear(), args.term || this.defaultTerm());
        resolvedAcademic = !!bundle;
      }
      if (!bundle) return { status: 'partial', reason: '没有取得指定学期的完整快照。' };
    }
    const selected = [...new Set([bundle, args.fromBundle, args.toBundle].filter((id): id is string => !!id))];
    for (const id of selected) if (!(id === bundle && resolvedAcademic) && !binding?.versions.some(item => item.bundleId === id)
      && !await this.currentAccountHasBundle(id, signal))
      return { status: 'forbidden', recordRead: false, reason: '这份快照不在当前连接可核对的账号资料中，尚未读取这份结果。' };
    if (selected.length && readingIdentity) {
      binding ||= await this.bindSavedBundles(resource, selected, readingIdentity, signal, academic);
      if (binding && !this.savedBindingCurrent(binding))
        return { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '选定快照的账号或实际文件版本未能对应，尚未读取另一份资料。' };
    }
    if (examCourseRead && !binding)
      return { status: 'forbidden', recordRead: false, reason: '当前账号与这份保存快照的实际文件版本尚未对应，没有读取考试课程原行。' };
    if (majorGpaRead && !binding)
      return { status: 'forbidden', recordRead: false, reason: '当前账号与这份保存快照的实际版本尚未对应，还没有读取主修均绩。' };
    if (args.expectedSnapshotVersion && (!args.bundleId || !this.snapshotProofs.matchesReadingVersion(args.bundleId, resource, args.expectedSnapshotVersion)))
      return { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '原页的数据版本在读取前已经不再对应，这次没有读取另一个版本来替代。' };
    if (bundle && singleResource && ['quick', 'select'].includes(args.operation)) {
      if (!binding && this.snapshotProofs.readingVersion(bundle, resource))
        return { status: 'forbidden', recordRead: false, resource, bundle_id: bundle,
          reason: '这份实际保存快照尚未与当前账号和资源类别建立绑定，本次没有改读另一份资料。' };
      if (binding) {
        const unavailable = await this.requireSavedResourceStructure(binding, bundle, resource, signal);
        if (unavailable) return { ...unavailable, authentication, read_only: true };
      }
    }
    if (resource === 'courses' && ['quick', 'select'].includes(args.operation))
      Object.assign(args, campusCourseQueryForSemester(args, await this.academicSemester(bundle, signal)));
    let result: any;
    if (args.operation === 'history') {
      result = await this.run(['history', '--offset', String(args.offset), '--limit', String(args.limit)], signal);
      const sourceKind = academic ? 'academic' : resource === 'activities' ? 'learning' : 'source';
      if (Array.isArray(result.items)) result = { ...result, items: result.items.filter((item: any) => item.kind === sourceKind), requested_resource: resource, note: '只列匹配类别的快照元信息；分页仍沿原目录offset，空页不表示后面没有。' };
    } else if (args.operation === 'read') {
      result = await this.run(['read', '--bundle', args.bundleId!, '--pointer', args.pointer!, '--offset', String(args.offset), '--limit', String(args.limit)], signal);
      if (majorGpaRead) {
        const current = () => {
          signal.throwIfAborted();
          return !!binding && this.savedBindingCurrent(binding)
            && (!args.expectedSnapshotVersion || this.snapshotProofs.matchesReadingVersion(args.bundleId!, resource, args.expectedSnapshotVersion));
        };
        const changed = () => ({ status: 'conflict', snapshotChanged: true, recordRead: false,
          reason: '读取时账号或这份保存资料变了，还需要沿现在的版本重新看主修均绩。' });
        if (!current()) return changed();
        if (result.status !== 'ok') {
          const { data: _data, records: _records, ...unread } = sanitize(result);
          return { ...unread, resource, recordKind: 'major_gpa', recordRead: false, authentication, read_only: true };
        }
        const stats = result.data;
        if (result.bundle_id !== args.bundleId || result.pointer !== majorGpaPointer
          || result.nested_values_truncated === true || result.truncated_for_model === true
          || !stats || typeof stats !== 'object' || Array.isArray(stats)
          || !stats.gpa || typeof stats.gpa !== 'object' || Array.isArray(stats.gpa))
          return { status: 'partial', recordRead: false, resource, recordKind: 'major_gpa', bundle_id: args.bundleId,
            reason: '这份主修汇总的内容或完整性还没有对应，不能把它当成零分或完整结果。' };
        const sources: Record<string, { complete?: boolean; fetchedAt?: string; freshness: string; stale?: boolean }> = {};
        const issues: string[] = [];
        for (const dataset of ['grades', 'major']) {
          const pointers = ['completeness', 'collected_at', 'freshness'].map(field => `/datasets/${dataset}/${field}`);
          const metadata = await Promise.all(pointers.map(async pointer => {
            try { return await this.run(['read', '--bundle', args.bundleId!, '--pointer', pointer, '--limit', '1'], signal); }
            catch (error) { if (signal.aborted) throw error; return undefined; }
          }));
          if (!current()) return changed();
          const matches = (value: any, index: number) => value?.status === 'ok' && value.bundle_id === args.bundleId
            && value.pointer === pointers[index] && value.nested_values_truncated !== true && value.truncated_for_model !== true;
          const [completeness, collected, freshness] = metadata;
          const complete = matches(completeness, 0) && typeof completeness.data?.complete === 'boolean' ? completeness.data.complete : undefined;
          const fetchedAt = matches(collected, 1) && typeof collected.data === 'string' && Number.isFinite(Date.parse(collected.data)) ? collected.data : undefined;
          const stale = matches(freshness, 2) && typeof freshness.data?.stale === 'boolean' ? freshness.data.stale : undefined;
          const freshnessAbsent = freshness?.status === 'error' && freshness.error?.code === 'POINTER_NOT_FOUND';
          sources[dataset] = { ...(complete === undefined ? {} : { complete }), ...(fetchedAt ? { fetchedAt } : {}),
            freshness: freshnessAbsent ? 'not_recorded' : stale === undefined ? 'unknown' : stale ? 'cached_after_failed_refresh' : 'recorded_not_stale',
            ...(stale === undefined ? {} : { stale }) };
          if (complete !== true) issues.push(`${dataset}_source_${complete === false ? 'incomplete' : 'quality_unknown'}`);
          if (!fetchedAt) issues.push(`${dataset}_source_time_unknown`);
          if (!freshnessAbsent && stale !== false) issues.push(`${dataset}_source_${stale === true ? 'cached_after_failed_refresh' : 'freshness_unknown'}`);
        }
        if (stats.complete !== true) issues.push('major_gpa_calculation_incomplete');
        if (stats.source_complete !== true) issues.push('major_gpa_source_incomplete');
        const selectedFields = args.fields || [...majorGpaReadFields];
        const projected = Object.fromEntries(selectedFields.flatMap(field => {
          const container = field.startsWith('gpa.') ? stats.gpa : stats, name = field.startsWith('gpa.') ? field.slice(4) : field;
          return Object.hasOwn(container, name) ? [[field, container[name]]] : [];
        }));
        result = { ...result, data: projected, selectedFields, resource, recordKind: 'major_gpa', calculationScope: 'source_confirmed_major_all_attempts',
          status: issues.length ? 'partial' : 'ok', coverage: { complete: issues.length === 0, issues, sources,
            source_fetched_at: Object.fromEntries(Object.entries(sources).flatMap(([name, source]) => source.fetchedAt ? [[name, source.fetchedAt]] : [])) },
          meaning: '这是原连接器按主修来源匹配到的修读记录算出的均绩，有自己的学分分母；成绩与主修两份来源各自保留采集时间和完整性。未匹配到的修读没有据此判为非主修，学校审核所用的权重或课程替代仍要看实际适用规则。' };
      }
      if (examCourseRead) {
        const current = () => {
          signal.throwIfAborted();
          return !!binding && this.savedBindingCurrent(binding)
            && (!args.expectedSnapshotVersion || this.snapshotProofs.matchesReadingVersion(args.bundleId!, resource, args.expectedSnapshotVersion));
        };
        if (!current()) return { status: 'conflict', snapshotChanged: true, recordRead: false,
          reason: '读取期间的账号或保存快照版本变了，这份考试课程原行没有继续交付。' };
        if (result.status === 'ok') {
          const rows = result.data, total = result.total_items, end = args.offset + (Array.isArray(rows) ? rows.length : 0);
          if (result.bundle_id !== args.bundleId || result.pointer !== examCourseRecordsPointer
            || !Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))
            || result.offset !== args.offset || !Number.isSafeInteger(total) || total < end
            || (result.next_offset === null ? end !== total
              : !rows.length || result.next_offset !== end || end >= total))
            return { status: 'partial', recordRead: false, resource, recordKind: 'exam_course_record', bundle_id: args.bundleId,
              reason: '原读取结果的数组或分页位置未能对应，这次没有把它当成空页或完整课程页。' };
          // Fixed metadata pointers cannot attach a different latest bundle.
          // Optional quality failures do not discard an otherwise valid page.
          const readMetadata = async (pointer: string): Promise<{ changed?: true; value?: any }> => {
            if (!current()) return { changed: true };
            let value: any;
            try { value = await this.run(['read', '--bundle', args.bundleId!, '--pointer', pointer, '--limit', '1'], signal); }
            catch (error) { if (signal.aborted) throw error; }
            return current() ? { value } : { changed: true };
          };
          const changed = () => ({ status: 'conflict', snapshotChanged: true, recordRead: false,
            reason: '核对来源质量期间的账号或保存快照版本变了，这份考试课程原行没有继续交付。' });
          const completenessPath = '/datasets/exams/completeness', collectedAtPath = '/datasets/exams/collected_at', freshnessPath = '/datasets/exams/freshness';
          const completeness = await readMetadata(completenessPath);
          if (completeness.changed) return changed();
          const collected = await readMetadata(collectedAtPath);
          if (collected.changed) return changed();
          const freshness = await readMetadata(freshnessPath);
          if (freshness.changed) return changed();
          const matches = (value: any, pointer: string) => value?.status === 'ok' && value.bundle_id === args.bundleId && value.pointer === pointer
            && value.nested_values_truncated !== true && value.truncated_for_model !== true;
          const completeValue = completeness.value?.data, sourceAt = collected.value?.data, freshnessValue = freshness.value?.data;
          const completeKnown = matches(completeness.value, completenessPath) && completeValue && typeof completeValue === 'object'
            && !Array.isArray(completeValue) && typeof completeValue.complete === 'boolean';
          const timeKnown = matches(collected.value, collectedAtPath) && typeof sourceAt === 'string' && Number.isFinite(Date.parse(sourceAt));
          const freshnessAbsent = freshness.value?.status === 'error' && freshness.value.error?.code === 'POINTER_NOT_FOUND';
          const freshnessKnown = matches(freshness.value, freshnessPath) && freshnessValue && typeof freshnessValue === 'object'
            && !Array.isArray(freshnessValue) && typeof freshnessValue.stale === 'boolean';
          const known = completeKnown && timeKnown && (freshnessAbsent || freshnessKnown);
          const issues: string[] = [];
          if (completeKnown && !completeValue.complete) issues.push('one_or_more_source_datasets_incomplete');
          if (freshnessKnown && freshnessValue.stale) issues.push('using_cached_data_after_failed_refresh');
          if (!known) issues.push('exam_source_quality_unknown');
          const { data: _data, total_items: _total, ...page } = result;
          result = { ...page, resource, recordKind: 'exam_course_record', records: rows, total_matches: total,
            status: known && !issues.length ? 'ok' : 'partial',
            coverage: { complete: !!known && !issues.length, issues, source_fetched_at: timeKnown ? { exams: sourceAt } : {}, scope: 'saved_exam_course_records',
              sourceCompleteness: completeKnown ? completeValue.complete ? 'complete' : 'incomplete' : 'unknown',
              sourceFreshness: freshnessAbsent ? 'not_recorded' : freshnessKnown ? freshnessValue.stale ? 'cached_after_failed_refresh' : 'recorded_not_stale' : 'unknown' } };
        } else if (result.status === 'navigate_required') {
          const { data: _data, total_items: total, ...navigation } = result;
          result = { ...navigation, resource, recordKind: 'exam_course_record', recordRead: false,
            ...(Number.isSafeInteger(total) && total >= 0 ? { total_matches: total } : {}) };
        } else {
          // A missing path is the original read failure, even when the caller
          // pinned a valid bundle version. It is neither an empty page nor a
          // snapshot conflict caused by the absence of a success-only proof.
          return { ...sanitize(result), resource, recordKind: 'exam_course_record', recordRead: false, authentication, read_only: true };
        }
      }
    }
    else if (args.operation === 'diff') result = await this.run(['diff', '--from-bundle', args.fromBundle!, '--to-bundle', args.toBundle!, '--resource', resource, '--offset', String(args.offset), '--limit', String(args.limit), ...(args.fields?.length ? ['--fields', args.fields.join(',')] : [])], signal);
    else if (args.operation === 'quick' && !args.spec) result = await this.run(['quick', resource, ...(bundle ? ['--bundle', bundle] : []), '--offset', String(args.offset), '--limit', String(args.limit), ...(args.fields?.length ? ['--fields', args.fields.join(',')] : []), ...(args.refresh && !academic ? ['--refresh'] : [])], signal, args.refresh ? 85000 : 35000);
    else {
      if (args.refresh && !academic) await this.run(['quick', resource, '--refresh', '--limit', '1'], signal, 85000);
      const directory = mkdtempSync(path.join(tmpdir(), 'zaichang-query-')), file = path.join(directory, 'query.json');
      try {
        writeFileSync(file, JSON.stringify({ ...args.spec!, limit: args.spec!.limit || args.limit, offset: args.spec!.offset ?? args.offset }), { encoding: 'utf8', mode: 0o600 });
        result = await this.run(['select', '--spec-file', file, ...(bundle ? ['--bundle', bundle] : [])], signal, 85000);
      } finally { if (existsSync(file)) unlinkSync(file); rmdirSync(directory); }
    }
    if (refreshIssues.length) result = { ...result, status: 'partial', refreshIssues,
      reason: '本次部分来源刷新未完成，结果仍保留其旧采集时间与缺口。',
      coverage: { ...result.coverage, complete: false, issues: [...(result.coverage?.issues || []), 'resource_refresh_incomplete'] } };
    // Related resources can come from separate bundles while the CLI returns
    // only the root bundle ID. Until it identifies every adopted bundle, a
    // root receipt must not claim to version the whole composite result.
    const composite = !!args.spec?.join || (args.spec?.resources?.length || 0) > 1;
    const truncated = { value: false };
    const safe = sanitize(composite ? { ...result, snapshotProofStatus: 'not_issued_composite_sources_unresolved' }
      : await this.withSnapshotProof(result, resource, signal), '', 0, truncated);
    if (truncated.value) safe.nested_values_truncated = true;
    if (refreshHead && this.snapshotProofs.headStamp(resource) !== refreshHead)
      return { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '刷新后当前latest又有变化，本次没有把另一版本当作这次更新的连续结果。' };
    if (readingIdentity && this.snapshotProofs.readingSourceIdentity() !== readingIdentity)
      return { status: 'forbidden', reason: '读取期间的账号或连接绑定变了，这份结果没有继续交付。' };
    if (binding && !this.savedBindingCurrent(binding))
      return { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '选定快照的实际文件版本在读取期间改变，这份结果没有继续交付。' };
    if (args.expectedSnapshotVersion && safe.snapshotProof?.version !== args.expectedSnapshotVersion)
      return { status: 'conflict', bundle_id: bundle, snapshotChanged: true, reason: '原数据版本未能对应；这次没有把新版本当成原来的连续页。' };
    if (safe.status === 'navigate_required' || Buffer.byteLength(JSON.stringify(safe)) > 110000) return { status: 'navigate_required', recordRead: false, resource,
      bundle_id: safe.bundle_id || bundle, offset: args.spec?.offset ?? args.offset,
      snapshotProof: safe.snapshotProof, expectedSnapshotVersion: safe.snapshotProof?.version, total_matches: safe.total_matches, authentication,
      ...(safe.recordKind === 'exam_course_record' ? { recordKind: safe.recordKind } : {}),
      ...(safe.truncated_for_model === true ? { truncated_for_model: true } : {}),
      ...(safe.nested_values_truncated === true ? { nested_values_truncated: true } : {}),
      reason: safe.reason || safe.message || '结果超出单次读取预算，本次没有交付正文。原资料仍保留，可减少字段或limit后从同一位置读取。' };
    return { ...safe, authentication: localHistory && safe.status !== 'ok' ? undefined : authentication,
      read_only: true, observed_change_not_publication_time: args.operation === 'diff' };
  }

  /** Host-only planner/provenance check. Model-supplied hashes are not receipts. */
  isCurrentSnapshot(proof: CampusSnapshotProof) { return this.snapshotProofs.isCurrentSnapshot(proof); }
  captureReadingProof(proof: CampusSnapshotProof) { return this.snapshotProofs.captureReadingProof(proof); }
  readingState(proof: import('../shared/harness').CampusSavedReadingProof) { return this.snapshotProofs.readingState(proof); }
  readingResource(domain: string) { return DOMAIN_RESOURCE[domain as CampusDomain]; }
  isCurrentSnapshotVersion(version: string) { return this.snapshotProofs.isCurrentVersion(version); }
  bindPlanningSnapshots(proofs: CampusSnapshotProof[]) { return this.snapshotProofs.bindSnapshots(proofs); }
  savedSnapshotRevision(): string | null { return this.snapshotProofs.savedRevision(); }

  /** Fixed host projection of the same academic bundle's schedule quality.
   * This does not add an arbitrary pointer or a second query interface. */
  async readPlanningQuality(proof: CampusSnapshotProof, signal: AbortSignal) {
    const validate = () => {
      signal.throwIfAborted();
      if (proof.resource !== 'classes' || !this.isCurrentSnapshot(proof))
        throw new HarnessError('planning_campus_changed', '学校记录的保存版本或账号刚刚变了，需要沿现在的资料重新看这段安排。');
    };
    validate();
    const coverage = await this.run(['read', '--bundle', proof.bundleId, '--pointer', '/normalized/schedule_quality/coverage', '--limit', '1'], signal);
    validate();
    const unresolved = await this.run(['read', '--bundle', proof.bundleId, '--pointer', '/normalized/schedule_quality/unresolved_rules', '--limit', '1'], signal);
    validate();
    if (coverage?.status !== 'ok' || coverage.bundle_id !== proof.bundleId || !coverage.data || typeof coverage.data !== 'object'
      || unresolved?.status !== 'ok' || unresolved.bundle_id !== proof.bundleId || !Number.isSafeInteger(unresolved.total_items) || unresolved.total_items < 0)
      return { status: 'unavailable' as const };
    return { status: 'ok' as const, generatedAllResolvableRules: coverage.data.generated_all_resolvable_rules === true,
      unresolvedRuleCount: Number(unresolved.total_items), calendarOfficiallyCrosschecked: coverage.data.calendar_is_officially_crosschecked === true,
      allFutureDatesFinal: coverage.data.all_future_dates_final === true };
  }

  private async withSnapshotProof(result: any, resource: string, signal: AbortSignal) {
    if (resource === 'gpa_overall' && Array.isArray(result?.records)) {
      const policyMeanings = Object.fromEntries(result.records.flatMap((record: any) =>
        typeof record?.policy === 'string' && Object.hasOwn(campusGpaPolicies, record.policy)
          ? [[record.policy, campusGpaPolicies[record.policy as keyof typeof campusGpaPolicies]]] : []));
      if (Object.keys(policyMeanings).length) result = { ...result, policyMeanings };
    }
    if (!result || !/^[a-f0-9]{32}$/.test(String(result.bundle_id || '')) || !['ok', 'partial', 'navigate_required'].includes(String(result.status))) return result;
    const before = this.snapshotProofs.beforeMetadata(resource);
    if (!before) return result;
    // Reuse the connector's existing current-account metadata API. It does
    // not refresh the network or expose dataset bodies to the signer.
    try {
      const history = await this.savedHistory(signal, item => item?.bundle_id === result.bundle_id);
      signal.throwIfAborted();
      const proof = this.snapshotProofs.issue(result, resource, history, before);
      const saved = Array.isArray(history?.items) ? history.items.find((item: any) => item?.bundle_id === result.bundle_id) : undefined;
      const semester = typeof saved?.semester_id === 'string' && /^\d{4}-\d{4}-[12]$/.test(saved.semester_id) ? saved.semester_id : undefined;
      return proof ? { ...result, ...(result.semester_id === undefined && semester ? { semester_id: semester } : {}),
        snapshotProof: proof, snapshotProofs: [proof] } : result;
    } catch (error) {
      if (signal.aborted) throw error;
      return result;
    }
  }

  async fullContext(args: CampusFullContextArgs, signal: AbortSignal, acquisition?: CampusAcquisition) {
    const connector = this.describe();
    const readingIdentity = this.snapshotProofs.readingSourceIdentity();
    if (!connector.available) return { status: 'unavailable', connector, reason: connector.reason, authentication: undefined };
    if (!connector.credentialsConfigured)
      return { status: 'auth_required', connector, reason: '请先在本机保存浙大统一身份认证信息。', authentication: undefined };
    if (args.refresh && !acquisition?.allowAcademicSync) return { status: 'forbidden', recordRead: false,
      acquisition: campusAcademicAcquisition('campus.overview', args), reason: '这次刷新涉及整份学业来源；当前可继续读取已保存、已准入的资料。', authentication: undefined };
    let authentication: CampusAuthentication | { mode: 'per_resource' } = { mode: 'per_resource' };
    if (args.refresh) {
      const authenticated = await this.ensureAuthenticated(signal);
      if (authenticated?.status !== 'ok') return { status: authenticated?.status === 'conflict' ? 'conflict' : authenticated?.status === 'auth_required' ? 'auth_required' : 'failed',
        connector: this.describe(), reason: authenticated?.status === 'conflict' ? authenticated.error.message : '浙大统一身份认证没有完成，本次没有读取个人资料。', authentication: undefined };
      authentication = authenticated.authentication;
    }
    if (readingIdentity && this.snapshotProofs.readingSourceIdentity() !== readingIdentity)
      return { status: 'forbidden', recordRead: false, reason: '账号或连接绑定已经变化，尚未继续读取校园资料。', authentication: undefined };
    const started = Date.now();
    const batches: any[] = [];
    // Broker capabilities are bounded to 90 seconds. Cached quick queries are
    // normally much faster; a refresh still gets the whole bounded window.
    const budgetMs = 88_000;
    const deadline = Date.now() + budgetMs;
    const fullSignal = AbortSignal.any([signal, AbortSignal.timeout(budgetMs)]);
    const domains = args.includeSensitiveDomains !== true
      ? FULL_CONTEXT_DOMAINS.filter(domain => !SENSITIVE_DOMAINS.has(domain))
      : FULL_CONTEXT_DOMAINS;
    const expectedScopes: string[] = [...(args.refresh ? ['academic'] : []), ...domains];
    let budgetExhausted = false;
    // Academic sync is a single normalized operation. It is only refreshed when the model
    // has an explicit freshness reason; the default path reads the existing encrypted bundle.
    if (args.refresh) {
      try {
        const academic = await this.bootstrapAcademic(
          fullSignal,
          args.academicYear || this.defaultAcademicYear(),
          args.term || this.defaultTerm(),
        );
        batches.push({ scope: 'academic', data: compactResult(academic) });
      } catch (error) {
        if (signal.aborted) throw error;
        batches.push({ scope: 'academic', data: { status: 'partial', error: error instanceof Error ? error.message : '学业资料读取未完成' } });
      }
    }
    // A small bounded fan-out keeps the overview responsive without opening a
    // request storm against the school systems. Results are reassembled in the
    // stable domain order so the model sees one predictable index.
    for (let offset = 0; offset < domains.length; offset += 3) {
      if (signal.aborted) throw signal.reason;
      if (fullSignal.aborted || Date.now() >= deadline) { budgetExhausted = true; break; }
      const chunk = domains.slice(offset, offset + 3);
      const results = await Promise.all(chunk.map(async (domain) => {
        try {
          const shouldRefresh = !!args.refresh && DIRECT_REFRESH_DOMAINS.has(domain);
          const readResult = await this.read(
            {
              domain,
              refresh: shouldRefresh,
              limit: 4,
              academicYear: args.academicYear,
              term: args.term,
            },
            fullSignal, acquisition,
          );
          return { scope: domain, data: compactResult(readResult.data, domain) };
        } catch (error) {
          if (signal.aborted) throw error;
          return { scope: domain, data: { status: 'error', error: error instanceof Error ? error.message : '领域读取失败' } };
        }
      }));
      batches.push(...results);
      if (fullSignal.aborted || Date.now() >= deadline) { budgetExhausted = true; break; }
    }
    const completedScopes = batches.flatMap(batch => {
      const status = String(batch.data?.status || 'ok');
      return ['ok', 'partial'].includes(status)
        ? (Array.isArray(batch.scope) ? batch.scope : [batch.scope])
        : [];
    });
    const missingScopes = expectedScopes.filter(scope => !completedScopes.includes(scope));
    const incompleteScopes = batches.flatMap(batch => {
      const status = String(batch.data?.status || 'ok');
      return status === 'partial' || batch.data?.stale === true || batch.data?.coverage?.complete === false
        ? (Array.isArray(batch.scope) ? batch.scope : [batch.scope])
        : [];
    });
    const batchStatuses = batches.map(batch => String(batch.data?.status || batch.data?.data?.status || 'ok'));
    const hasIncomplete = batches.some(batch => batch.data?.stale === true || batch.data?.freshness?.stale === true || batch.data?.completeness?.complete === false || batch.data?.coverage?.complete === false || batch.data?.data_quality?.all_requested_sources_complete === false);
    const status = budgetExhausted || missingScopes.length || hasIncomplete || batchStatuses.some(s => ['error', 'auth_required', 'unavailable'].includes(s))
      ? 'partial'
      : batchStatuses.includes('partial') ? 'partial' : 'ok';
    if (readingIdentity && this.snapshotProofs.readingSourceIdentity() !== readingIdentity)
      return { status: 'forbidden', recordRead: false, reason: '读取期间的账号或连接绑定变了，分域结果没有继续交付。', authentication: undefined };
    return {
      status,
      connector,
      refreshed: !!args.refresh,
      elapsedMs: Date.now() - started,
      missingScopes,
      incompleteScopes,
      budgetExhausted,
      expectedScopes,
      source: 'zju-student-info complete encrypted datasets via quick/academic',
      origin: 'zju_account',
      authentication,
      lastSsoVerifiedAt: this.describe().lastVerifiedAt,
      batches,
      note: '这是本人浙大账号资料的分类目录；这里先看各类摘要，原始字段和完整分页仍保存在本机，可以沿原地址接着读。',
    };
  }

  private defaultAcademicYear(): string {
    const now = new Date();
    const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return `${start}-${start + 1}`;
  }

  private defaultTerm(): '1' | '2' {
    const month = new Date().getMonth();
    return month >= 7 || month === 0 ? '1' : '2';
  }

  async read(args: CampusReadArgs, signal: AbortSignal, acquisition?: CampusAcquisition) {
    if (args.query?.trim() && args.domain !== 'grades')
      throw new HarnessError('campus_lookup_query_unsupported', '文字检索目前按成绩中的课程名称筛选；这类资料需要按已有字段选择范围，这次没有忽略检索词去读整份资料。');
    const connector = this.describe();
    const readingIdentity = DOMAIN_RESOURCE[args.domain] ? this.snapshotProofs.readingSourceIdentity() : undefined;
    if (!connector.available)
      return {
        domain: args.domain,
        label: DOMAIN_LABEL[args.domain],
        cached: !args.refresh,
        connector,
        data: { status: 'unavailable', reason: connector.reason, origin: 'zju_account' },
      };
    if (!DOMAIN_RESOURCE[args.domain]) {
      const catalog = await this.query({ operation: 'resources', offset: 0, limit: 50, refresh: false }, signal);
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector,
        data: { status: 'unsupported', kind: 'capability_assessment', domain: args.domain, recordRead: false,
          requestedMeasures: ['accepted_checkin_count', 'required_checkin_count', 'counting_period', 'counting_rule'],
          catalog, origin: 'zju_account' } };
    }
    if (campusAcademicAcquisition('campus.lookup', args) && !acquisition?.allowAcademicSync)
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector,
        data: { status: 'forbidden', recordRead: false, acquisition: campusAcademicAcquisition('campus.lookup', args),
          reason: '本次资源刷新与既存完整学业快照的本机归一化还没有用途准入，尚未采集。已有保存资料可以继续按原资源和页地址读取。' } };
    if (!connector.credentialsConfigured)
      return {
        domain: args.domain,
        label: DOMAIN_LABEL[args.domain],
        cached: !args.refresh,
        connector,
        data: { status: 'auth_required', reason: '请先在本机保存浙大统一身份认证信息。', origin: 'zju_account' },
      };
    const resource = DOMAIN_RESOURCE[args.domain];
    if (!resource) throw new Error('该校园资料类别暂未接入。');
    const academicYear = args.academicYear || this.defaultAcademicYear();
    const term = args.term || this.defaultTerm();
    if (args.bundleId && (!/^[a-f0-9]{32}$/.test(args.bundleId) || args.refresh))
      throw new HarnessError('campus_snapshot_request', '固定快照读取和刷新是两种查询；原快照地址保留原版本，刷新会建立新的查询起点。');
    let academicBundle: string | undefined = args.bundleId, binding: SavedCampusBinding | undefined, resolvedAcademic = false;
    if (this.savedModelContract() && !args.refresh && ACADEMIC_RESOURCES.has(args.domain) && readingIdentity) {
      if (!academicBundle) {
        academicBundle = await this.resolveAcademicBundle(signal, academicYear, term);
        resolvedAcademic = !!academicBundle;
      }
      if (academicBundle) binding = await this.bindSavedBundles(resource, [academicBundle], readingIdentity, signal, true);
    }
    if (readingIdentity && this.snapshotProofs.readingSourceIdentity() !== readingIdentity)
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: !args.refresh, connector: this.describe(),
        data: { status: 'forbidden', recordRead: false, reason: '读取前的账号或连接绑定变了，尚未读取个人记录。', origin: 'zju_account' } };
    let authentication: CampusAuthentication;
    if (binding) authentication = this.savedAuthentication();
    else {
      const authenticated = await this.ensureAuthenticated(signal);
      if (authenticated?.status !== 'ok') return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: !args.refresh,
        connector: this.describe(), data: { status: authenticated?.status === 'conflict' ? 'conflict' : authenticated?.status === 'auth_required' ? 'auth_required' : 'failed', recordRead: false,
          reason: authenticated?.status === 'conflict' ? authenticated.error.message : '浙大统一身份认证没有完成，本次没有读取个人资料。', origin: 'zju_account' } };
      authentication = authenticated.authentication;
    }
    if (readingIdentity && this.snapshotProofs.readingSourceIdentity() !== readingIdentity)
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: !args.refresh, connector: this.describe(),
        data: { status: 'forbidden', recordRead: false, reason: '认证期间的账号或连接绑定变了，尚未读取个人记录。', origin: 'zju_account' } };
    if (args.bundleId && (['learning_courses', 'activities'].includes(args.domain) || !await this.currentAccountHasBundle(args.bundleId, signal)))
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector: this.describe(),
        data: { status: 'forbidden', reason: '这个原快照地址未能与当前账号和记录类别对应，本次没有读取其正文。', origin: 'zju_account' } };
    if (args.expectedSnapshotVersion && (!args.bundleId || !this.snapshotProofs.matchesReadingVersion(args.bundleId, resource, args.expectedSnapshotVersion)))
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector,
        data: { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '原页的数据版本在读取前已经不再对应，尚未读取另一个版本来替代。', origin: 'zju_account' } };
    let refreshHead: string | undefined, refreshIssues: string[] = [];
    if (ACADEMIC_RESOURCES.has(args.domain)) {
      if (args.bundleId) {
        academicBundle = args.bundleId;
      } else if (args.refresh) {
        const refreshed = await this.refreshAcademicResource(resource, signal, academicYear, term);
        if (!refreshed.bundle_id) return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false,
          connector: this.describe(), data: { ...refreshed, origin: 'zju_account' } };
        academicBundle = refreshed.bundle_id; refreshHead = refreshed.refreshHead; refreshIssues = refreshed.refreshIssues;
      } else if (!academicBundle) {
        academicBundle = await this.resolveAcademicBundle(signal, academicYear, term);
        resolvedAcademic = !!academicBundle;
      }
      if (!academicBundle)
        return {
          domain: args.domain,
          label: DOMAIN_LABEL[args.domain],
          cached: !args.refresh,
          connector: this.describe(),
          data: {
            status: 'partial',
            reason: `还没有找到 ${academicYear}-${term} 的账号学业资料。`,
            origin: 'zju_account',
          },
        };
    }
    if (academicBundle) {
      if (!resolvedAcademic && !binding?.versions.some(item => item.bundleId === academicBundle)
        && !await this.currentAccountHasBundle(academicBundle, signal))
        return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: !args.refresh, connector: this.describe(),
          data: { status: 'forbidden', recordRead: false, reason: '选定快照不在当前账号资料中，尚未读取其正文。', origin: 'zju_account' } };
      binding ||= await this.bindSavedBundles(resource, [academicBundle], readingIdentity, signal, ACADEMIC_RESOURCES.has(args.domain));
      if (binding && !this.savedBindingCurrent(binding))
        return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: !args.refresh, connector: this.describe(),
          data: { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '选定快照的实际文件版本未能对应，尚未读取另一份资料。', origin: 'zju_account' } };
    }
    let learningBundle: string | undefined;
    if (args.domain === 'activities') {
      if (!args.courseId || !/^\d{1,32}$/.test(args.courseId))
        return {
          domain: args.domain,
          label: DOMAIN_LABEL[args.domain],
          cached: false,
          connector: this.describe(),
          data: {
            status: 'partial',
            error: {
              code: 'COURSE_ID_REQUIRED',
              message: '先读取“学在浙大课程”并选定一门课，才能读取这门课的活动和完成情况。',
            },
            origin: 'zju_account',
          },
        };
      learningBundle = !args.refresh ? this.learningBundles.get(args.courseId) : undefined;
      if (!learningBundle) {
        const learned = await this.run(['learning', '--course-id', args.courseId], signal, 85_000);
        if (!['ok', 'partial'].includes(String(learned?.status)) || !learned?.bundle_id)
          return {
            domain: args.domain,
            label: DOMAIN_LABEL[args.domain],
            cached: false,
            connector: this.describe(),
            data: { ...compactResult(learned, args.domain), origin: 'zju_account' },
          };
        learningBundle = String(learned.bundle_id);
        this.learningBundles.set(args.courseId, learningBundle);
      }
      if (!await this.currentAccountHasBundle(learningBundle, signal))
        return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector: this.describe(),
          data: { status: 'forbidden', recordRead: false, reason: '选定课程快照不在当前账号资料中，尚未读取其正文。', origin: 'zju_account' } };
      binding = await this.bindSavedBundles(resource, [learningBundle], readingIdentity, signal, false);
      const activityPage = await this.run(
        [
          'read',
          '--bundle',
          learningBundle,
          '--pointer',
          '/normalized/activities',
          '--offset',
          String(Math.max(0, args.offset || 0)),
          '--limit',
          String(Math.min(50, Math.max(1, args.limit || 8))),
        ],
        signal,
        35_000,
      );
      const activityRecords = Array.isArray(activityPage?.data) ? activityPage.data : [];
      const activityResult = {
        bundle_id: learningBundle,
        status: activityPage?.status === 'ok' ? 'ok' : activityPage?.status || 'partial',
        resource: 'activities',
        records: activityRecords,
        total_matches: activityPage?.total_items,
        offset: activityPage?.offset,
        next_offset: activityPage?.next_offset,
        coverage: { complete: activityPage?.status === 'ok', scope: `owned course ${args.courseId}` },
        evaluated_at: new Date().toISOString(),
        credential_redactions: activityPage?.credential_redactions,
        nested_values_truncated: false,
      };
      const compactActivities = compactResult(activityResult, args.domain);
      if (readingIdentity && this.snapshotProofs.readingSourceIdentity() !== readingIdentity || binding && !this.savedBindingCurrent(binding))
        return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector: this.describe(),
          data: { status: 'forbidden', reason: '读取期间的账号或连接绑定变了，这份结果没有继续交付。' } };
      return {
        domain: args.domain,
        label: DOMAIN_LABEL[args.domain],
        cached: !args.refresh,
        connector: this.describe(),
        data: {
          ...(compactActivities && typeof compactActivities === 'object'
            ? compactActivities
            : { result: compactActivities }),
          origin: 'zju_account',
          authentication,
          course_id: args.courseId,
        },
      };
    }
    if (academicBundle) {
      if (!binding && this.snapshotProofs.readingVersion(academicBundle, resource))
        return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: !args.refresh, connector: this.describe(),
          data: { status: 'forbidden', recordRead: false,
            reason: '这份实际保存快照尚未与当前账号和资源类别建立绑定，本次没有改读另一份资料。', origin: 'zju_account' } };
      if (binding) {
        const unavailable = await this.requireSavedResourceStructure(binding, academicBundle, resource, signal);
        if (unavailable) return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: !args.refresh,
          connector: this.describe(), data: { ...unavailable, authentication, origin: 'zju_account' } };
      }
    }
    const cli = ['quick', resource];
    if (academicBundle) cli.push('--bundle', academicBundle);
    if (args.domain === 'learning_courses') cli.push('--endpoint', 'courses.list');
    if (learningBundle) cli.push('--bundle', learningBundle);
    if (args.window) cli.push('--window', args.window);
    if (args.from) cli.push('--from', args.from);
    if (args.to) cli.push('--to', args.to);
    if (args.at) cli.push('--at', args.at);
    if (args.timeMode) cli.push('--time-mode', args.timeMode);
    const blockedFields = (args.fields || []).filter(field => SENSITIVE_FIELD.test(field) || /(身份证|学号|手机号|邮箱)/.test(field));
    if (blockedFields.length) throw new Error('为保护本人身份信息，该字段不能作为模型读取字段。');
    const unsupportedFields = (args.fields || []).filter(field => !SAFE_MODEL_FIELDS.has(field));
    if (unsupportedFields.length) throw new Error('该字段不在安全摘要范围内，请缩小到工具提供的可读字段。');
    const fields = args.fields?.length ? args.fields : SUMMARY_FIELDS[args.domain];
    if (fields?.length) cli.push('--fields', fields.join(','));
    const filters = args.domain === 'courses'
      ? campusCourseLookupFilters(args.filters, await this.academicSemester(academicBundle, signal))
      : args.domain === 'grades' ? campusGradeLookupFilters(args.filters, args.query) : args.filters || [];
    for (const filter of filters) cli.push('--filter', filter);
    if (args.sort) cli.push(`--sort=${args.sort}`);
    cli.push('--limit', String(Math.min(50, Math.max(1, args.limit || 8))));
    cli.push('--offset', String(Math.max(0, args.offset || 0)));
    if (args.refresh && !ACADEMIC_RESOURCES.has(args.domain)) cli.push('--refresh');
    let result = await this.run(cli, signal, args.refresh ? 85_000 : 35_000);
    if (['courses', 'grades'].includes(args.domain)) result = { ...result, recordSelection: { filters,
      ...(args.sort ? { sort: args.sort } : {}), semester: filters.some(filter => filter.split(':', 1)[0].trim() === 'semester_id')
        ? 'semester_predicate_provided' : 'no_semester_predicate' } };
    if (refreshIssues.length) result = { ...result, status: 'partial', refreshIssues,
      reason: '本次部分来源刷新未完成，结果仍保留其旧采集时间与缺口。',
      coverage: { ...result.coverage, complete: false, issues: [...(result.coverage?.issues || []), 'resource_refresh_incomplete'] } };
    const versioned = await this.withSnapshotProof(result, args.domain === 'learning_courses' ? 'learning_courses' : resource, signal);
    if (refreshHead && this.snapshotProofs.headStamp(resource) !== refreshHead)
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector: this.describe(),
        data: { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '刷新后当前latest又有变化，本次没有把另一版本当作这次更新的连续结果。', origin: 'zju_account' } };
    if (readingIdentity && this.snapshotProofs.readingSourceIdentity() !== readingIdentity)
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector: this.describe(),
        data: { status: 'forbidden', reason: '读取期间的账号或连接绑定变了，这份结果没有继续交付。', origin: 'zju_account' } };
    if (binding && !this.savedBindingCurrent(binding))
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: !args.refresh, connector: this.describe(),
        data: { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '选定快照的实际文件版本在读取期间改变，这份结果没有继续交付。', origin: 'zju_account' } };
    if (args.expectedSnapshotVersion && versioned.snapshotProof?.version !== args.expectedSnapshotVersion)
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector: this.describe(),
        data: { status: 'conflict', snapshotChanged: true, reason: '原数据版本未能对应；这次没有把新版本当成原来的连续页。', origin: 'zju_account' } };
    const compact = compactResult(versioned, args.domain);
    return {
      domain: args.domain,
      label: DOMAIN_LABEL[args.domain],
      cached: !args.refresh,
      connector: this.describe(),
      data: {
        ...(compact && typeof compact === 'object' ? compact : { result: compact }),
        origin: 'zju_account',
        authentication,
      },
    };
  }

  async refresh(args: CampusRefreshArgs, signal: AbortSignal) {
    const connector = this.describe();
    if (!connector.available) return { scope: args.scope, label: '校园资料同步', connector, data: { status: 'unavailable', reason: connector.reason } };
    if (!connector.credentialsConfigured) return { scope: args.scope, label: '校园资料同步', connector, data: { status: 'auth_required', reason: '请先在资料面板设置本机校园账号。' } };
    if (args.scope === 'academic') {
      const academicYear = args.academicYear || this.defaultAcademicYear();
      if (!/^20\d{2}-20\d{2}$/.test(academicYear)) throw new Error('同步学业资料需要形如 2026-2027 的学年。');
      const term = args.term || this.defaultTerm();
      const result = await this.bootstrapAcademic(signal, academicYear, term);
      return { scope: args.scope, label: '学业资料同步', connector: this.describe(), data: compactResult(result) };
    }
    if (!args.domain || args.domain === 'source_status') throw new Error('按领域同步时需要指定具体领域。');
    const result = await this.read({ domain: args.domain, refresh: true, limit: 20 }, signal);
    return { ...result, scope: args.scope, label: `${DOMAIN_LABEL[args.domain]}同步` };
  }

  /**
   * Return only busy intervals for a public/group availability draft. Course
   * titles, teachers and every other private field are intentionally discarded
   * before the projection leaves this adapter.
   */
  async availability(from: string | undefined, to: string | undefined, signal: AbortSignal) {
    const start = from || new Date().toISOString();
    const end = to || new Date(Date.parse(start) + 7 * 24 * 60 * 60 * 1000).toISOString();
    const startMs = Date.parse(start), endMs = Date.parse(end);
    const identity = this.snapshotProofs.readingSourceIdentity();
    const request = { domain: 'schedule' as const, from: start, to: end, timeMode: 'overlap' as const,
      fields: ['uid', 'startTime', 'endTime'], limit: 50 };
    let data: any = (await this.read(request, signal)).data || {};
    const proof = data.snapshotProof as CampusSnapshotProof | undefined;
    const reading = proof && this.captureReadingProof(proof);
    const intervals: { start: string; end: string }[] = [], seen = new Set<string>(), sourceTimes: string[] = [];
    let complete = true, offset = 0, total: number | undefined;
    while (true) {
      signal.throwIfAborted();
      if (!['ok', 'partial'].includes(data.status) || !Array.isArray(data.records)) { complete = false; break; }
      const rows = data.records;
      if (!Number.isSafeInteger(data.total_matches) || data.total_matches < 0 || data.offset !== offset
        || total !== undefined && total !== data.total_matches) { complete = false; break; }
      total = data.total_matches;
      const next = offset + rows.length;
      if (data.next_offset === null ? next !== total
        : !rows.length || data.next_offset !== next || next >= data.total_matches) { complete = false; break; }
      if (data.status !== 'ok' || data.coverage?.complete !== true || data.truncated_for_model === true
        || data.nested_values_truncated === true) complete = false;
      for (const row of rows) {
        if (typeof row?.uid !== 'string' || seen.has(row.uid)) { complete = false; continue; }
        seen.add(row.uid);
        if (typeof row.startTime !== 'string' || typeof row.endTime !== 'string'
          || !Number.isFinite(Date.parse(row.startTime)) || !Number.isFinite(Date.parse(row.endTime))
          || Date.parse(row.endTime) <= Date.parse(row.startTime)) { complete = false; continue; }
        const lo = Math.max(startMs, Date.parse(row.startTime)), hi = Math.min(endMs, Date.parse(row.endTime));
        if (lo >= hi) { complete = false; continue; }
        intervals.push({ start: new Date(lo).toISOString(), end: new Date(hi).toISOString() });
      }
      sourceTimes.push(...Object.values(data.coverage?.source_fetched_at || {})
        .filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))),
        ...(typeof data.fetched_at === 'string' && Number.isFinite(Date.parse(data.fetched_at)) ? [data.fetched_at] : []));
      if (data.next_offset === null) break;
      if (!reading || !proof) { complete = false; break; }
      offset = next;
      try { data = (await this.read({ ...request, offset, bundleId: proof.bundleId, expectedSnapshotVersion: proof.version }, signal)).data || {}; }
      catch (error) { if (signal.aborted) throw error; complete = false; break; }
      if (data.snapshotProof?.bundleId !== proof.bundleId || data.snapshotProof?.version !== proof.version) { complete = false; break; }
    }
    const sameSavedHead = () => !!identity && !!reading && this.snapshotProofs.readingSourceIdentity() === identity
      && this.readingState(reading) === 'same_saved_head';
    if (complete && proof && sameSavedHead()) {
      try {
        const quality = await this.readPlanningQuality(proof, signal);
        if (quality.status !== 'ok' || !quality.generatedAllResolvableRules || quality.unresolvedRuleCount !== 0) complete = false;
      } catch (error) { if (signal.aborted) throw error; complete = false; }
    }
    const current = sameSavedHead();
    if (!current) complete = false;
    const fetchedAt = sourceTimes.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
    return {
      participant: '本人',
      busyIntervals: current ? intervals : [],
      status: complete ? 'fresh' : 'unknown',
      sourceId: CAMPUS_ACCOUNT_SOURCE_ID,
      fetchedAt,
      coverage: { complete, scope: '[本人浙大账号的忙闲投影]', until: end },
      window: { from: start, to: end },
      meaning: '这些是已保存课表里的计划上课时段，可供排除；列表之外不等于本人有空，也不证明实际出席。',
      reason: complete ? undefined : current ? '课表来源或分页还不完整，不能把剩下的时段当作确定有空。'
        : '读取期间账号或课表快照有变化，这次没有沿旧资料给出忙闲结论。',
    };
  }
}
