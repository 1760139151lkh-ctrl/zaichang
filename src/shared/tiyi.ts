/** School observations are distinct from local workouts and practice credits. */
export const TIYI_SOURCE_ID = 'campus:zju-tiyi';

/** Public edition references, not cached thresholds or a personal progress source. */
export const TIYI_PUBLIC_RULE_REFERENCES = [
  {
    id: 'zju-tiyi-exercise-2026-4',
    title: '浙江大学本科生课外体育锻炼实施办法（2026年9月修订）',
    url: 'https://tyys.zju.edu.cn/attachments/2026-09/01-1790564985-221699.pdf',
    documentDate: '2026-09-18', listedAt: '2026-09-28', checkedAt: '2026-10-23',
    catalogUrl: 'https://tyys.zju.edu.cn/redir.php?catalog_id=172611',
  },
  {
    id: 'zju-tiyi-pe-courses-2026-3',
    title: '浙江大学本科生体育课程修读办法（2026年9月修订）',
    url: 'https://tyys.zju.edu.cn/attachments/2026-09/01-1790564936-221695.pdf',
    documentDate: '2026-09-18', listedAt: '2026-09-28', checkedAt: '2026-10-23',
    scope: '非体育类专业普通本科生',
    catalogUrl: 'https://tyys.zju.edu.cn/redir.php?catalog_id=172611',
  },
] as const;

export const TIYI_MODULES = [
  { id: 77, resource: 'study_records', label: '修学记录' },
  { id: 5, resource: 'exercise', label: '课外锻炼' },
  { id: 76, resource: 'notices', label: '活动预告' },
  { id: 43, resource: 'teams', label: '运动队' },
  { id: 78, resource: 'westward', label: '西迁活动' },
  { id: 75, resource: 'counselling', label: '辅导站' },
  { id: 69, resource: 'counts', label: '次数查询' },
  { id: 61, resource: 'venues', label: '场馆服务' },
  { id: 50, resource: 'fitness_attendance', label: '身体素质课考勤' },
  { id: 67, resource: 'training', label: '培训课程' },
  { id: 3, resource: 'fitness', label: '体测' },
  { id: 37, resource: 'competitions', label: '我的比赛' },
  { id: 23, resource: 'classes', label: '上课考勤' },
  { id: 73, resource: 'venue_entries', label: '场馆出入记录' },
  { id: 72, resource: 'feedback', label: '意见反馈' },
  { id: 62, resource: 'venue_live', label: '场地实况' },
  { id: 81, resource: 'graduation_courses', label: '体测与锻炼课' },
  { id: 84, resource: 'graduation_report', label: '毕业体艺报告' },
  { id: 85, resource: 'codoon', label: '咕咚运动' },
] as const;

export type TiyiModuleResource = typeof TIYI_MODULES[number]['resource'];
export type TiyiResource = TiyiModuleResource | 'profile' | 'menus' | 'terms' | 'summary'
  | 'records' | 'record_detail' | 'statistics' | 'rules' | 'course_terms' | 'courses' | 'attendance';

export interface TiyiReadArgs {
  resource: TiyiResource;
  refresh?: boolean;
  /** Opaque saved observation; continuing it never changes to a newer response. */
  snapshotId?: string;
  offset?: number;
  limit?: number;
  /** Zero-based school page; distinct from continuing a saved response. */
  upstreamPage?: number;
  /** From the same mode's school venue directory, never an arbitrary ID. */
  venueSiteId?: string;
  /** School calendar date in Asia/Shanghai, not an instant or booking request. */
  searchDate?: string;
  pointer?: string;
  schoolYear?: string;
  termId?: string;
  recordId?: string;
  courseId?: string;
  begin?: number;
  end?: number;
  period?: 'WEEK' | 'MONTH' | 'TERM';
  validStatus?: -1 | 0 | 1;
  subpage?: 'results' | 'schedule' | 'feedback' | 'records' | 'mine' | 'attendance' | 'orders' | 'buddies' | 'training' | 'reservation' | 'art_reservation' | 'certificates';
}

export interface TiyiConnectorState {
  sourceId: typeof TIYI_SOURCE_ID;
  label: string;
  configured: boolean;
  credentialsConfigured: boolean;
  sessionSaved: boolean;
  runtimeAvailable: boolean;
  signerConfigured: boolean;
  readAllowed?: boolean;
  campusReadAllowed?: boolean;
  via?: 'direct' | 'webvpn';
  gateway?: { gatewayAuthenticated: boolean; gatewayStatus: 'authenticated' | 'login_required' | 'unavailable'; windowOpen: boolean; reason?: string;
    diagnostic?: { code: string; httpStatus?: number; networkCode?: string } };
  reason?: string;
}

export interface TiyiObservation {
  sourceId: typeof TIYI_SOURCE_ID;
  resource: TiyiResource;
  status: 'fresh' | 'saved' | 'partial' | 'auth_required' | 'unavailable';
  fetchedAt?: string;
  observedAt: string;
  snapshotId?: string;
  /** Reader payloads use recordRead/personalRecordRead for an actual completed
   * personal query, including a school's explicit empty result. Existence is
   * expressed separately by readState, recordCount and the returned list.
   * Public catalogues/live counts and unread/denied queries keep both false. */
  data?: unknown;
  coverage: {
    complete: boolean;
    kind: 'records' | 'official_page' | 'catalog' | 'unknown';
    total?: number;
    returned?: number;
    offset?: number;
    next?: { snapshotId: string; offset: number; pointer?: string };
    upstreamPagination?: 'whole_response' | 'paged_response' | 'unknown';
    /** A new school query, never a continuation within this saved response. */
    upstreamNext?: { resource: 'venues' | 'training' | 'counselling' | 'venue_entries'; subpage?: 'orders' | 'training' | 'records'; upstreamPage: number; termId?: string };
    venueSelection?: {
      resource: 'venues';
      subpage: 'reservation' | 'art_reservation';
      directoryPointer: '/response/data' | '/directoryResponse/data';
      venueMapField: 'venueInfo';
      siteMapField: 'venueSiteInfo';
      idField: 'id';
      dateFormat: 'YYYY-MM-DD';
      timeZone: 'Asia/Shanghai';
    };
    extent?: 'returned_response';
    unit?: 'unicode_codepoints';
    navigationOnly?: boolean;
    /** JSON pointer within this immutable source response, never an API URL. */
    pointer?: string;
    /** The immutable source is the authenticated owner's venue profile. */
    profileRead?: boolean;
  };
  error?: { code: string; message: string; httpStatus?: number; diagnosticsSaved?: boolean };
  note?: string;
}
