import { z } from 'zod';
import type { MapPoint, MapRouteResult } from './map-v2';
import { planningMaterialProvenanceSchema } from './harness';
import type { DiscussionScene, VerifiedDiscussionFocus } from './discussion-scene';
import type { StudyScene, StudyHistoryReference } from './study-presentation';
import { planningTrialConditionSchema, type PlanningComparisonView, type PlanningTrialObservation } from './planning-conversation';
import type { CuriosityScene, CuriosityHistoryReference } from './curiosity-scene';
import type { RehearsalScene, RehearsalHistoryReference } from './relationship-rehearsal';
import type { NoteScene, NoteHistoryReference } from './note-presentation';
import type { MapStorySetting } from './story-setting';
import type { CampusAcademicReference } from './campus-academic';

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
export interface WeatherScene extends SceneBase {
  kind: 'weather';
  location: string;
  timeZone: string;
  days: { date: string; weatherCode: number | null; maxC: number | null; minC: number | null; precipitationProbabilityMax: number | null }[];
}
export interface CampusRecord {
  /** Snapshot-local record identity. sourceRecordId retains a supplied attempt ID. */
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
  /** Original attempt identity, when the connector provided it. The scene id
   * can distinguish two returned rows without merging repeated attempts. */
  sourceRecordId?: string;
  grade?: { original: string | null; fivePoint: number | null; fourPoint?: number | null; fourPointLegacy?: number | null;
    hundredPoint?: number | null; hundredPointKind?: string; included: boolean | null; exclusionReason?: string;
    courseCode?: string; qualityIssues?: string[] };
  gpa?: { values: Partial<Record<CampusGpaScale, number | null>>; denominator: number | null;
    eligibleAttempts?: number; countedAttempts?: number; excludedAttempts?: number; incompleteAttempts?: number;
    complete?: boolean; sourceComplete?: boolean; policy?: string; formula?: string; throughTerm?: string };
}
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
export type SceneSnapshot = MapScene | WeatherScene | CampusScene | CampusAcademicReference | PlanningScene | EnvironmentScene | DiscussionScene | StudyScene | StudyHistoryReference | CuriosityScene | CuriosityHistoryReference | RehearsalScene | RehearsalHistoryReference | NoteScene | NoteHistoryReference;
export interface PresentationView extends SceneRef {
  libraryVersion: 1;
  createdAt: string;
  sceneRefs: SceneRef[];
  dsl: string;
  comparison?: PlanningComparisonView;
}
const id = z.string().min(1).max(160);
export const sceneRefSchema = z.object({ id, revision: z.number().int().positive() }).strict();
export const semanticSelectionSchema = z.object({
  sceneId: id, sceneRevision: z.number().int().positive(),
  kind: z.enum(['place', 'date', 'leg', 'record', 'time_block', 'environment_sample', 'discussion_point', 'discussion_option']),
  placeId: id.optional(), date: z.iso.date().optional(), legId: id.optional(), recordId: id.optional(),
  blockId: id.optional(), sampleId: id.optional(),
  pointId: id.optional(), optionId: id.optional(),
  campusScale: campusGpaScaleSchema.optional(),
  planningTrial: planningTrialConditionSchema.optional(),
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
  timeZone?: string;
  discussion?: VerifiedDiscussionFocus;
  planningTrialObservation?: PlanningTrialObservation;
  storySetting?: { work: MapStorySetting['work']; placeId?: string; legId?: string; mapVersion: string; meaning: string };
}
export const sceneReference = (scene: SceneRef) => `${scene.id}@${scene.revision}`;

/** A small, actual OpenUI library. No executable code or model-authored facts enter it. */
export function sceneViewDsl(scenes: SceneSnapshot[], layout: 'stack' | 'compare') {
  return `root = SceneStack([${scenes.map((_, index) => `scene${index}`).join(', ')}], ${JSON.stringify(layout)})\n`
    + scenes.map((scene, index) => `scene${index} = ${{ map: 'MapScene', weather: 'WeatherScene', campus: 'CampusScene', campus_reference: 'CampusScene', planning: 'PlanningScene', environment: 'EnvironmentScene', discussion: 'DiscussionScene', study: 'StudyScene', study_reference: 'StudyScene', curiosity: 'CuriosityScene', curiosity_reference: 'CuriosityScene', rehearsal: 'RehearsalScene', rehearsal_reference: 'RehearsalScene', note: 'NoteScene', note_reference: 'NoteScene' }[scene.kind]}(${JSON.stringify(sceneReference(scene))})`).join('\n');
}
