import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, statSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import type { Store } from './store';
import { validateCampusQuery, type CampusQuery } from './capabilities/campus-query';
import { CampusSnapshotProofs, type CampusSnapshotProof } from './capabilities/campus-saved-source';
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
  exams: ['id', 'name', 'type', 'startTime', 'endTime', 'dateLabel', 'location', 'seat', 'time_precision'],
  assignments: ['id', 'name', 'course', 'deadline', 'status'],
  grades: ['id', 'name', 'semester_id', 'credit', 'original', 'fivePoint', 'gpaIncluded', 'gpa_exclusion_reason'],
  gpa_semesters: ['semester_id', 'gpa', 'gpa_credit_denominator', 'eligible_attempts', 'counted_attempts', 'excluded_attempts', 'complete'],
  gpa_cumulative: ['through_semester', 'gpa', 'gpa_credit_denominator', 'eligible_attempts', 'counted_attempts', 'complete'],
  retakes: ['course_key', 'course_code', 'name', 'attempts', 'selected', 'selection_policy'],
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
const SAFE_MODEL_FIELDS = new Set([
  ...Object.values(SUMMARY_FIELDS).flat(),
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
    !existsSync(path.join(root, 'SKILL.md')) ||
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

function modelRecords(domain: CampusDomain | undefined, records: any): any {
  const clean = sanitize(records);
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
    schema_version: result.schema_version,
    snapshotProof: result.snapshotProof,
    snapshotProofs: result.snapshotProofs,
    semester_id: result.semester_id,
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
  if ('records' in result) output.records = modelRecords(domain, result.records);
  if ('results' in result) output.results = sanitize(result.results);
  if ('result' in result) output.result = sanitize(result.result);
  if (domain === 'source_status' && result.resources) output.resources = result.resources;
  if ('normalized' in result) output.normalized = sanitize(result.normalized);
  if ('bundle_id' in result) output.bundle_id = result.bundle_id;
  const safeOutput = sanitize(output);
  let serialized = JSON.stringify(safeOutput);
  if (serialized.length <= 56000) return safeOutput;
  if (safeOutput.normalized) delete safeOutput.normalized;
  if (Array.isArray(safeOutput.results)) safeOutput.results = safeOutput.results.slice(0, 8);
  if (Array.isArray(safeOutput.records)) {
    safeOutput.records = safeOutput.records.slice(0, 12);
  }
  safeOutput.truncated_for_model = true;
  safeOutput.note = '连接器保留完整加密数据；本次只返回有界摘要。请缩小时间范围或字段后继续。';
  serialized = JSON.stringify(safeOutput);
  if (serialized.length > 56000 && Array.isArray(safeOutput.results)) safeOutput.results = safeOutput.results.slice(0, 3);
  return safeOutput;
}

function sanitize(value: any, key = '', depth = 0): any {
  if (depth > 12) return '[depth limit]';
  if (SENSITIVE_FIELD.test(key) || /(身份证|学号|手机号|邮箱)/.test(key)) return '[redacted]';
  if (typeof value === 'string') {
    return value
      .replace(/(token|ticket|code|synjones-auth|password)=[^&\s"<>]+/gi, '$1=[redacted]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted]');
  }
  if (Array.isArray(value)) return value.map(item => sanitize(item, key, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k, depth + 1)]));
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
    // The installed skill is the source of truth.  Discover it for both dev and
    // packaged Electron runs so the user does not have to manually import files
    // or browse to an implementation directory on every machine start.
    // Test profiles are intentionally isolated from the real account.
    if (process.env.ZAICHANG_TEST === '1') return null;
    const candidates = [
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
      throw new Error('还没有找到浙大个人信息技能，请先安装或选择技能目录。');
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
        reason: '还没有找到浙大个人信息技能。可以安装技能，或在连接设置中选择它。',
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
              : '登录信息已保存，第一次读取时会用浙大统一身份认证校验。'
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
        reason: '技能目录可用，但连接状态摘要暂时不可读。',
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
      if (!this.root()) return { status: 'unavailable', reason: '没有找到浙大个人信息技能。' };
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
    if (!connector.available)
      return { status: 'unavailable', connector, reason: connector.reason };
    if (!connector.credentialsConfigured)
      return { status: 'auth_required', connector, reason: '请先在本机保存浙大统一身份认证信息。' };
    try {
      const result = await this.run(['auth'], signal, 75_000);
      if (result?.status === 'ok') {
        this.store.putMeta('zju_last_verified_at', new Date().toISOString());
        this.store.putMeta('zju_last_auth_error', null);
        this.store.putMeta('zju_verified_credentials_mtime', this.credentialsMtime() ?? null);
        return { ...result, connector: this.describe(), authentication: 'zju_sso_verified' };
      }
      this.store.putMeta('zju_last_auth_error', String(result?.error?.code || 'AUTH_FAILED').slice(0, 80));
      return { ...result, connector: this.describe() };
    } catch (error) {
      if (signal.aborted) throw error;
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
      return { status: 'ok', authenticated_at: connector.lastVerifiedAt };
    if (!this.authInFlight) {
      this.authInFlight = this.verifyAccount(signal).finally(() => {
        this.authInFlight = undefined;
      });
    }
    return this.authInFlight;
  }

  private childEnv() {
    const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } as Record<string, string | undefined>;
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
    const python = this.pythonCommand();
    const script = path.join(root, 'scripts', 'zju.py');
    const child = spawn(python, [script, ...args], {
      cwd: root,
      env: this.childEnv(),
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    if (cached && this.academicBundleStamps.get(key) === headStamp) return cached;
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
    if (args.refresh && (!['quick', 'select'].includes(args.operation) || args.bundleId || args.expectedSnapshotVersion))
      throw new HarnessError('campus_snapshot_request', '刷新需要新的资源查询起点；固定快照、版本和原页导航仍保留原地址，本次没有把它们当作刷新。');
    if (!connector.available) return { status: 'unavailable', reason: connector.reason };
    if (args.operation === 'resources') {
      const result = sanitize(await this.run(['resources'], signal));
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
    if (args.operation === 'schema') return sanitize(await this.run(['schema', args.model!], signal));
    if (campusAcademicAcquisition('campus.query', args) && !acquisition?.allowAcademicSync)
      return { status: 'forbidden', acquisition: campusAcademicAcquisition('campus.query', args), recordRead: false,
        reason: '本次资源刷新与既存完整学业快照的本机归一化还没有用途准入，尚未采集。已有保存资料仍可用refresh=false按原资源和页地址读取。' };
    const authenticated = await this.ensureAuthenticated(signal);
    if (authenticated?.status !== 'ok') return { status: 'auth_required', reason: '校园会话尚未完成校验；没有读取这些资料。' };
    const readingIdentity = this.snapshotProofs.readingSourceIdentity();
    const resource = args.resource || args.spec!.resource;
    for (const id of [args.bundleId, args.fromBundle, args.toBundle].filter((id): id is string => !!id))
      if (!readingIdentity || !await this.currentAccountHasBundle(id, signal))
        return { status: 'forbidden', reason: '这份快照不在当前连接可核对的账号资料中，尚未读取这份结果。' };
    if (args.expectedSnapshotVersion && (!args.bundleId || !this.snapshotProofs.matchesReadingVersion(args.bundleId, resource, args.expectedSnapshotVersion)))
      return { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '原页的数据版本在读取前已经不再对应，这次没有读取另一个版本来替代。' };
    let bundle = args.bundleId, refreshHead: string | undefined, refreshIssues: string[] = [];
    const academic = !['reservations', 'reservation_violations', 'card_accounts', 'transactions', 'student_profile', 'roles', 'activities'].includes(resource);
    if (['quick', 'select'].includes(args.operation) && academic && !bundle) {
      if (args.refresh) {
        const refreshed = await this.refreshAcademicResource(resource, signal, args.academicYear || this.defaultAcademicYear(), args.term || this.defaultTerm());
        if (!refreshed.bundle_id) return refreshed;
        bundle = refreshed.bundle_id; refreshHead = refreshed.refreshHead; refreshIssues = refreshed.refreshIssues;
      } else bundle = await this.resolveAcademicBundle(signal, args.academicYear || this.defaultAcademicYear(), args.term || this.defaultTerm());
      if (!bundle) return { status: 'partial', reason: '没有取得指定学期的完整快照。' };
    }
    let result: any;
    if (args.operation === 'history') {
      result = await this.run(['history', '--offset', String(args.offset), '--limit', String(args.limit)], signal);
      const sourceKind = academic ? 'academic' : resource === 'activities' ? 'learning' : 'source';
      if (Array.isArray(result.items)) result = { ...result, items: result.items.filter((item: any) => item.kind === sourceKind), requested_resource: resource, note: '只列匹配类别的快照元信息；分页仍沿原目录offset，空页不表示后面没有。' };
    } else if (args.operation === 'read') result = await this.run(['read', '--bundle', args.bundleId!, '--pointer', args.pointer!, '--offset', String(args.offset), '--limit', String(args.limit)], signal);
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
    const safe = sanitize(composite ? { ...result, snapshotProofStatus: 'not_issued_composite_sources_unresolved' }
      : await this.withSnapshotProof(result, resource, signal));
    if (refreshHead && this.snapshotProofs.headStamp(resource) !== refreshHead)
      return { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '刷新后当前latest又有变化，本次没有把另一版本当作这次更新的连续结果。' };
    if (!readingIdentity || this.snapshotProofs.readingSourceIdentity() !== readingIdentity)
      return { status: 'forbidden', reason: '读取期间的账号或连接绑定变了，这份结果没有继续交付。' };
    if (args.expectedSnapshotVersion && safe.snapshotProof?.version !== args.expectedSnapshotVersion)
      return { status: 'conflict', bundle_id: bundle, snapshotChanged: true, reason: '原数据版本未能对应；这次没有把新版本当成原来的连续页。' };
    if (Buffer.byteLength(JSON.stringify(safe)) > 110000) return { status: 'navigate_required', resource, bundle_id: safe.bundle_id || bundle, offset: args.offset, reason: '结果超出单次读取预算，原数据未截短。请减少字段或limit并继续分页。', coverage: safe.coverage, total_matches: safe.total_matches };
    return { ...safe, authenticated_at: this.describe().lastVerifiedAt, read_only: true, observed_change_not_publication_time: args.operation === 'diff' };
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
        throw new HarnessError('planning_campus_changed', '校园保存快照或账号已改变，未采用旧日程质量说明。');
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
    if (!connector.available) return { status: 'unavailable', connector, reason: connector.reason };
    if (!connector.credentialsConfigured)
      return { status: 'auth_required', connector, reason: '请先在本机保存浙大统一身份认证信息。' };
    if (args.refresh && !acquisition?.allowAcademicSync) return { status: 'forbidden', recordRead: false,
      acquisition: campusAcademicAcquisition('campus.overview', args), reason: '这次刷新涉及整份学业来源；当前可继续读取已保存、已准入的资料。' };
    const authenticated = await this.ensureAuthenticated(signal);
    if (authenticated?.status !== 'ok')
      return {
        status: authenticated?.status === 'auth_required' ? 'auth_required' : 'failed',
        connector: this.describe(),
        reason: '浙大统一身份认证没有完成，本次没有读取个人资料。',
      };
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
      authenticatedAt: this.describe().lastVerifiedAt,
      batches,
      note: '这是本人浙大账号产生的完整加密数据集分域索引；模型只收到每个分域的必要摘要，原始字段与完整分页仍在技能的本机加密库中。预约、签到、支付和修改资料均未执行。',
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
    const connector = this.describe();
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
    const authenticated = await this.ensureAuthenticated(signal);
    if (authenticated?.status !== 'ok')
      return {
        domain: args.domain,
        label: DOMAIN_LABEL[args.domain],
        cached: !args.refresh,
        connector: this.describe(),
        data: {
          status: authenticated?.status === 'auth_required' ? 'auth_required' : 'failed',
          reason: '浙大统一身份认证没有完成，本次没有读取个人资料。',
          origin: 'zju_account',
        },
      };
    const resource = DOMAIN_RESOURCE[args.domain];
    if (!resource) throw new Error('该校园资料类别暂未接入。');
    const academicYear = args.academicYear || this.defaultAcademicYear();
    const term = args.term || this.defaultTerm();
    if (args.bundleId && (!/^[a-f0-9]{32}$/.test(args.bundleId) || args.refresh))
      throw new HarnessError('campus_snapshot_request', '固定快照读取和刷新是两种查询；原快照地址保留原版本，刷新会建立新的查询起点。');
    const readingIdentity = this.snapshotProofs.readingSourceIdentity();
    if (args.bundleId && (['learning_courses', 'activities'].includes(args.domain) || !readingIdentity || !await this.currentAccountHasBundle(args.bundleId, signal)))
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector: this.describe(),
        data: { status: 'forbidden', reason: '这个原快照地址未能与当前账号和记录类别对应，本次没有读取其正文。', origin: 'zju_account' } };
    if (args.expectedSnapshotVersion && (!args.bundleId || !this.snapshotProofs.matchesReadingVersion(args.bundleId, resource, args.expectedSnapshotVersion)))
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector,
        data: { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '原页的数据版本在读取前已经不再对应，尚未读取另一个版本来替代。', origin: 'zju_account' } };
    let academicBundle: string | undefined = args.bundleId, refreshHead: string | undefined, refreshIssues: string[] = [];
    if (ACADEMIC_RESOURCES.has(args.domain)) {
      if (args.bundleId) {
        academicBundle = args.bundleId;
      } else if (args.refresh) {
        const refreshed = await this.refreshAcademicResource(resource, signal, academicYear, term);
        if (!refreshed.bundle_id) return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false,
          connector: this.describe(), data: { ...refreshed, origin: 'zju_account' } };
        academicBundle = refreshed.bundle_id; refreshHead = refreshed.refreshHead; refreshIssues = refreshed.refreshIssues;
      } else {
        academicBundle = await this.resolveAcademicBundle(signal, academicYear, term);
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
      if (!readingIdentity || this.snapshotProofs.readingSourceIdentity() !== readingIdentity)
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
          authenticated_at: this.describe().lastVerifiedAt,
          course_id: args.courseId,
        },
      };
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
    for (const filter of args.filters || []) cli.push('--filter', filter);
    if (args.sort) cli.push('--sort', args.sort);
    cli.push('--limit', String(Math.min(50, Math.max(1, args.limit || 8))));
    cli.push('--offset', String(Math.max(0, args.offset || 0)));
    if (args.refresh && !ACADEMIC_RESOURCES.has(args.domain)) cli.push('--refresh');
    let result = await this.run(cli, signal, args.refresh ? 85_000 : 35_000);
    if (refreshIssues.length) result = { ...result, status: 'partial', refreshIssues,
      reason: '本次部分来源刷新未完成，结果仍保留其旧采集时间与缺口。',
      coverage: { ...result.coverage, complete: false, issues: [...(result.coverage?.issues || []), 'resource_refresh_incomplete'] } };
    const versioned = await this.withSnapshotProof(result, args.domain === 'learning_courses' ? 'learning_courses' : resource, signal);
    if (refreshHead && this.snapshotProofs.headStamp(resource) !== refreshHead)
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector: this.describe(),
        data: { status: 'conflict', snapshotChanged: true, recordRead: false, reason: '刷新后当前latest又有变化，本次没有把另一版本当作这次更新的连续结果。', origin: 'zju_account' } };
    if (!readingIdentity || this.snapshotProofs.readingSourceIdentity() !== readingIdentity)
      return { domain: args.domain, label: DOMAIN_LABEL[args.domain], cached: false, connector: this.describe(),
        data: { status: 'forbidden', reason: '读取期间的账号或连接绑定变了，这份结果没有继续交付。', origin: 'zju_account' } };
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
        authenticated_at: this.describe().lastVerifiedAt,
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
    const result = await this.read(
      { domain: 'schedule', from: start, to: end, timeMode: 'overlap', limit: 50 },
      signal,
    );
    const data: any = result.data || {};
    const intervals = (Array.isArray(data.records) ? data.records : [])
      .filter((record: any) => typeof record?.startTime === 'string' && typeof record?.endTime === 'string')
      .map((record: any) => ({ start: record.startTime, end: record.endTime }));
    const complete = data.coverage?.complete === true;
    return {
      participant: '本人',
      busyIntervals: intervals,
      status: complete ? 'fresh' : 'unknown',
      sourceId: CAMPUS_ACCOUNT_SOURCE_ID,
      fetchedAt: data.authenticated_at || data.fetched_at,
      coverage: { complete, scope: '[本人浙大账号的忙闲投影]', until: end },
      window: { from: start, to: end },
      meaning: '这些时段确定忙，绝不是可约时间；只能用于排除，不能原样写成有空。',
      reason: complete ? undefined : '课表范围或调课信息不完整，不能把空白时段当成确定有空。',
    };
  }
}
