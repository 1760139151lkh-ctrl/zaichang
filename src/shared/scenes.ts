import { z } from 'zod';
import type { MapPoint, MapRouteResult } from './map-v2';
import { planningMaterialProvenanceSchema } from './harness';
import { discussionArtworkSchema, type DiscussionScene, type VerifiedDiscussionFocus } from './discussion-scene';
import type { StudyScene, StudyHistoryReference } from './study-presentation';
import { planningTrialConditionSchema, type PlanningComparisonView, type PlanningTrialObservation } from './planning-conversation';
import type { CuriosityScene, CuriosityHistoryReference } from './curiosity-scene';
import type { RehearsalScene, RehearsalHistoryReference } from './relationship-rehearsal';
import type { NoteScene, NoteHistoryReference } from './note-presentation';
import type { MapStorySetting, StorySettingRoute } from './story-setting';
import { mapViewSchema, type MapView } from './map-view';
import type { CampusAcademicReference } from './campus-academic';
import type { InteractiveProgramDocument, InteractiveProgramHistoryReference } from './interactive-program';

/** Facts are immutable message snapshots; camera and trial selections never imply an action. */
export interface SceneSource {
  sourceId: string;
  fetchedAt: string;
  expiresAt?: string;
  version?: string;
  sourceDate?: string;
  coverage?: unknown;
}
export interface SceneRef { id: string; revision: number }
export interface JourneyStop { id: string; placeId: string; label: string; dwellMinutes?: number }
export interface JourneyLeg { id: string; fromStopId: string; toStopId: string; route: MapRouteResult }
export type CameraIntent = 'route' | 'overview' | 'destination' | 'selection' | 'explain';
interface SceneBase extends SceneRef { createdAt: string; source: SceneSource }
export interface MapScene extends SceneBase {
  kind: 'map';
  place?: MapPoint;
  journey: { id: string; revision: number; stops: JourneyStop[]; legs: JourneyLeg[]; estimate?: { networkM: number; estimatedAccessM: number; walkingMinutes: { min: number; max: number }; dwellMinutes: number; totalMinutes: { min: number; max: number }; complete: boolean; basis: string } };
  cameraIntent: CameraIntent;
  focusPlaceId?: string;
  activeLegId?: string;
  cameraRequestId?: string;
  cameraUserRequested?: boolean;
  display?: 'expanded' | 'compact';
  storySetting?: MapStorySetting;
  arrival?: { kind: 'user_statement'; eventId: string; quote: string; reportedAt: string };
}
/** A real picture from a public web page, fetched by the host and kept as
 * verified bytes. The caption is the assistant's words; the origin is where
 * the picture actually came from. It never stands for a live observation. */
export interface FigureScene extends SceneBase {
  kind: 'figure';
  image: { dataUrl: string; mediaType: string; width: number | null; height: number | null; bytes: number; sha256: string };
  origin: { url: string; pageUrl?: string; pageTitle?: string; alt?: string };
  caption?: string;
}
export interface WeatherDayAggregation {
  date: string;
  sourceWindow: { from: string; to: string };
  localDay: { from: string; to: string };
  matchesLocalDay: boolean;
  valuesComplete: boolean;
}
export interface WeatherScene extends SceneBase {
  kind: 'weather';
  location: string;
  timeZone: string;
  days: { date: string; weatherCode: number | null; maxC: number | null; minC: number | null; precipitationProbabilityMax: number | null;
    aggregation?: WeatherDayAggregation & { basis: 'source_fixed_offset_24h'; utcOffsetSeconds: number } }[];
  limitations?: string[];
}
/** Coverage is a projection of recorded daily intervals, never a reconstruction
 * of an older source's calendar or an edit to its saved values. */
export function normalizeWeatherSceneCoverage(scene: WeatherScene): WeatherScene {
  const known = scene.days.length > 0 && scene.days.every(day => !!day.aggregation);
  const complete = known && scene.days.every(day => day.aggregation?.valuesComplete === true && day.aggregation.matchesLocalDay === true);
  const coverage = scene.source.coverage && typeof scene.source.coverage === 'object' && !Array.isArray(scene.source.coverage)
    ? scene.source.coverage as Record<string, unknown> : {};
  return { ...scene, source: { ...scene.source, coverage: { ...coverage, complete,
    meaning: known ? 'complete表示各日统计的数值完整且区间与当地自然日重合，实际区间保留在aggregation。'
      : '原快照未记载统计区间，能否覆盖当地自然日未知。' } } };
}
export interface CampusRecord {
  /** Snapshot-local record identity. sourceRecordId retains the original source key. */
  id: string;
  title: string;
  startsAt?: string;
  endsAt?: string;
  dateLabel?: string;
  location?: string;
  teachers?: string[];
  credit?: string | number;
  term?: string;
  examType?: string;
  seat?: string | number;
  cancelled?: boolean;
  rescheduled?: boolean;
  timePrecision?: string;
  sourceRevision?: number;
  /** Original source identity, when the connector provided it. The scene id
   * can distinguish repeated attempts or different exams of the same course. */
  sourceRecordId?: string;
  grade?: { original: string | null; fivePoint: number | null; fourPoint?: number | null; fourPointLegacy?: number | null;
    hundredPoint?: number | null; hundredPointKind?: string; included: boolean | null; exclusionReason?: string;
    courseCode?: string; qualityIssues?: string[];
    /** A positive match in the major transcript confirms membership. A missing
     * match does not establish that a course is outside the user's major. */
    majorConfirmed?: boolean; creditIncluded?: boolean; earnedCredit?: number | null; earnedCreditRepository?: number | null };
  gpa?: { values: Partial<Record<CampusGpaScale, number | null>>; denominator: number | null;
    eligibleAttempts?: number; countedAttempts?: number; excludedAttempts?: number; incompleteAttempts?: number;
    complete?: boolean; sourceComplete?: boolean; policy?: string; formula?: string; throughTerm?: string;
    earnedCreditsSumAttempts?: number | null; zeroCreditAttempts?: number };
}
export const campusExamTypeLabel = (type: string) => type === 'midterm' ? '期中' : type === 'final' ? '期末' : type;
export const campusGpaScaleSchema = z.enum(['fivePoint', 'fourPoint', 'fourPointLegacy', 'hundredPoint']);
export type CampusGpaScale = z.infer<typeof campusGpaScaleSchema>;
export const campusDisplayInputSchema = z.object({ sceneId: z.string().min(1).max(160),
  mode: z.enum(['detail', 'table', 'trend']), scale: campusGpaScaleSchema.optional(),
  semesterId: z.string().regex(/^\d{4}-\d{4}-[12]$/).optional().describe('只选本轮真实成绩记录已经返回的精确semester_id；按这个学期等值展开，并保留同范围的原owner回读地址。不能填“最近/这学期”或仅在正文挑一部分却呈现全量表。') }).strict();
export interface CampusScene extends SceneBase {
  kind: 'campus';
  domain: 'courses' | 'schedule' | 'exams' | 'grades' | 'gpa_semesters' | 'gpa_overall' | 'gpa_cumulative';
  sourceLabel: string;
  origin: 'zju_account' | 'legacy_import';
  term?: string;
  records: CampusRecord[];
  /** Only the returned page, never an assertion that the whole term is loaded. */
  total?: number;
  complete: boolean;
  requiredGrants?: string[];
  academicDisplay?: { mode: 'detail' | 'table' | 'trend'; scale: CampusGpaScale; semesterId?: string };
  resultStatus?: 'fresh' | 'partial' | 'stale';
  continuation?: { capability: 'campus.query' | 'campus.lookup'; arguments: Record<string, unknown> };
  sensitiveRead?: { grant: 'campus:grades:read' | 'campus:gpa:read'; resource: string; sourceVersion: string;
    privacyEpoch: number; policyRevision: number };
  academicSessionId?: string;
  academicRead?: { capability: 'campus.query' | 'campus.lookup'; arguments: Record<string, unknown> };
  /** Live owner proof only; omitted when this scene becomes a history address. */
  academicSnapshotProof?: unknown;
  /** Ordinary course pages may be rendered locally without delivering their
   * rows to the model. The original owner remains the only read address. */
  modelBodyDelivered?: boolean;
  nativeRead?: { capability: 'campus.query' | 'campus.lookup'; arguments: Record<string, unknown>; snapshotProof?: unknown };
  nativePage?: { offset: number; returned: number };
  sourceCoverage?: unknown;
}
export interface PlanningBlock {
  id: string;
  /** Original occurrence or host task/boundary identity, never inferred from a label. */
  sourceObjectId?: string;
  /** Address of an existing calendar record, not an adoption proposal. */
  agendaRecord?: {
    id: string; revision: number; occurrenceId: string; occurrenceDate?: string;
    kind?: 'event' | 'todo' | 'deadline' | 'reminder' | 'time_block';
    state: 'invitation' | 'wish' | 'proposed' | 'accepted' | 'registered';
    timeZone: string; allDayDate?: string;
  };
  comparisonChange?: { kind: 'moved' | 'added' | 'changed'; before?: { start: string; end: string | null } };
  kind: 'busy' | 'work' | 'setup' | 'cleanup' | 'transition' | 'protected' | 'free';
  label: string;
  start: string;
  end: string | null;
  placeId?: string;
  taskId?: string;
  reason?: string;
  usableMinutes?: { min: number; max: number };
  /** A cross-day display part retains the full source interval and proposal identity. */
  originalRange?: { start: string; end: string | null };
  /** These identify existing host proposals, never a browser-authored save payload. */
  planRefs?: { planId: string; blockId: string }[];
}
export const planningContinuationSchema = planningMaterialProvenanceSchema.extend({
  allocatedMinutes: z.number().finite().nonnegative(), scheduledMinutes: z.number().finite().nonnegative(),
}).strict();
export type PlanningContinuation = z.infer<typeof planningContinuationSchema>;
export interface PlanningScene extends SceneBase {
  kind: 'planning';
  mode: 'preview' | 'draft' | 'agenda';
  window: { from: string; to: string; timeZone: string };
  /** Query dates only: these do not calculate availability or a daily budget. */
  agendaRead?: { days: { date: string; from: string; to: string }[]; complete: boolean; titleQuery?: string };
  /** A declared scheduling domain is distinct from calendar time without records. */
  scheduleCoverage?: {
    mode: 'provided_windows' | 'horizon_only';
    windows: { start: string; end: string }[];
    meaning: string;
  };
  blocks: PlanningBlock[];
  /** Host-calculated local days; the renderer never invents a daily budget. */
  daySummaries?: {
    date: string;
    from: string;
    to: string;
    eligibleWindows?: { start: string; end: string }[];
    eligibleMinutes?: number;
    outsideScopeMinutes?: number;
    scheduledMinutes: number;
    initialFreeMinutes: number;
    occupiedMinutes: number;
    freeMinutes: number;
    budget: { maxScheduledMinutes?: number; reserveMinutes?: number } | null;
    reserveShortfallMinutes: number;
    status: 'within_declared_budget' | 'existing_commitments_exceed_reserve';
  }[];
  requiredSourceIds: string[];
  sourceCoverage: { sourceId: string; status: string; reason?: string }[];
  conditions: string[];
  unscheduled: { title: string; reason: string }[];
  adoption?: { status: string; blockers: string[]; totalSteps: number; completedSteps: number };
  planId?: string;
  expiresAt?: string;
  /** Host-bound continuation evidence, never an approval or a saved calendar result. */
  continuation?: PlanningContinuation;
  /** Rendering performs no write; agenda mode separately identifies saved records. */
  applied: false;
}
export interface EnvironmentSample {
  id: string;
  at: string;
  temperatureC?: number | null;
  precipitationProbability?: number | null;
  precipitationMm?: number | null;
  precipitationIntervalStart?: string;
  weatherCode?: number | null;
  pm2_5?: number | null;
  pm10?: number | null;
  usAqi?: number | null;
  europeanAqi?: number | null;
}
export interface EnvironmentScene extends SceneBase {
  kind: 'environment';
  domain: 'weather' | 'air_quality';
  location: string;
  timeZone: string;
  window: { from: string; to: string; complete: boolean };
  samples: EnvironmentSample[];
  limitations: string[];
  forecastIssuedAt: null;
  userLocation: false;
}
export type SceneSnapshot = MapScene | FigureScene | WeatherScene | CampusScene | CampusAcademicReference | PlanningScene | EnvironmentScene | DiscussionScene | StudyScene | StudyHistoryReference | CuriosityScene | CuriosityHistoryReference | RehearsalScene | RehearsalHistoryReference | NoteScene | NoteHistoryReference;
export interface PresentationView extends SceneRef {
  libraryVersion: 1 | 2;
  createdAt: string;
  /** Host-created preview; an assistant-authored composition may adopt it. */
  automatic?: true;
  sceneRefs: SceneRef[];
  dsl: string;
  program?: InteractiveProgramDocument;
  programReference?: InteractiveProgramHistoryReference;
  /** Host-owned viewing conditions for this exact version; never new facts. */
  localState?: import('./interactive-program').ProgramLocalState;
  comparison?: PlanningComparisonView;
  /** Position in the reply's committed prose, in UTF-16 units. Earlier words
   * remain a stable prefix; before supports old replies that were rewritten. */
  anchor?: ViewAnchor;
}
export interface ViewAnchor { offset: number; before: string }

/** Split a reply into prose and views in the order she actually said and
 * showed them. A view whose spot cannot be found falls after the first
 * paragraph, as before anchors existed. */
export function interleaveViews<V extends { id: string; anchor?: ViewAnchor }>(text: string, views: readonly V[]):
  ({ kind: 'text'; text: string } | { kind: 'view'; view: V })[] {
  if (!views.length) return text ? [{ kind: 'text', text }] : [];
  const firstBreak = text.search(/\n\s*\n/);
  const fallback = firstBreak >= 0 ? firstBreak : text.length;
  const position = (anchor?: ViewAnchor) => {
    if (!anchor) return fallback;
    const at = Number.isSafeInteger(anchor.offset) ? Math.min(Math.max(0, anchor.offset), text.length) : fallback;
    if (!anchor.before || text.slice(Math.max(0, at - anchor.before.length), at) === anchor.before) return at;
    // Historical reconciliation may have moved the surrounding prose. Only
    // a unique match can recover its position; repeated text is ambiguous.
    const found = text.indexOf(anchor.before);
    return found >= 0 && text.indexOf(anchor.before, found + 1) < 0 ? found + anchor.before.length : at;
  };
  const placed = views.map((view, order) => ({ view, order, at: position(view.anchor) }))
    .sort((a, b) => a.at - b.at || a.order - b.order);
  const parts: ({ kind: 'text'; text: string } | { kind: 'view'; view: V })[] = [];
  let cursor = 0;
  for (const item of placed) {
    const at = Math.max(item.at, cursor);
    const chunk = text.slice(cursor, at);
    if (chunk.trim()) parts.push({ kind: 'text', text: chunk });
    parts.push({ kind: 'view', view: item.view });
    cursor = at;
  }
  const rest = text.slice(cursor);
  if (rest.trim()) parts.push({ kind: 'text', text: rest });
  return parts;
}
const id = z.string().min(1).max(160);
export const sceneRefSchema = z.object({ id, revision: z.number().int().positive() }).strict();
export const semanticSelectionSchema = z.object({
  sceneId: id, sceneRevision: z.number().int().positive(),
  kind: z.enum(['place', 'date', 'leg', 'record', 'time_block', 'environment_sample', 'discussion_point', 'discussion_option', 'discussion_artwork']),
  placeId: id.optional(), date: z.iso.date().optional(), legId: id.optional(), recordId: id.optional(),
  blockId: id.optional(), sampleId: id.optional(),
  pointId: id.optional(), optionId: id.optional(),
  artwork: discussionArtworkSchema.optional(),
  campusScale: campusGpaScaleSchema.optional(),
  planningTrial: planningTrialConditionSchema.optional(),
  mapView: mapViewSchema.optional(),
}).strict();
export type SemanticSelection = z.infer<typeof semanticSelectionSchema>;
export interface VerifiedSelection extends SemanticSelection {
  label: string;
  source: SceneSource;
  selectedAt: string;
  meaning: string;
  record?: CampusRecord;
  campusContext?: { domain: CampusScene['domain']; term?: string; complete: boolean; origin: CampusScene['origin'];
    display?: CampusScene['academicDisplay']; observationAt: string; total?: number };
  timeBlock?: PlanningBlock;
  environmentSample?: EnvironmentSample;
  weatherDay?: WeatherScene['days'][number];
  timeZone?: string;
  discussion?: VerifiedDiscussionFocus;
  planningTrialObservation?: PlanningTrialObservation;
  storySetting?: { work: MapStorySetting['work']; placeId?: string; legId?: string; mapVersion: string;
    view?: MapView; route?: StorySettingRoute; meaning: string };
}
export const sceneReference = (scene: SceneRef) => `${scene.id}@${scene.revision}`;
export type SceneLayout = 'stack' | 'compare' | 'focus';

/** A small, actual OpenUI library. No executable code or model-authored facts enter it. */
export function sceneViewDsl(scenes: SceneSnapshot[], layout: SceneLayout) {
  return `root = SceneStack([${scenes.map((_, index) => `scene${index}`).join(', ')}], ${JSON.stringify(layout)})\n`
    + scenes.map((scene, index) => `scene${index} = ${{ map: 'MapScene', figure: 'FigureScene', weather: 'WeatherScene', campus: 'CampusScene', campus_reference: 'CampusScene', planning: 'PlanningScene', environment: 'EnvironmentScene', discussion: 'DiscussionScene', study: 'StudyScene', study_reference: 'StudyScene', curiosity: 'CuriosityScene', curiosity_reference: 'CuriosityScene', rehearsal: 'RehearsalScene', rehearsal_reference: 'RehearsalScene', note: 'NoteScene', note_reference: 'NoteScene' }[scene.kind]}(${JSON.stringify(sceneReference(scene))})`).join('\n');
}
