import { z } from 'zod';
import type { MapPoint, MapRouteResult } from './map-v2';
import { planningMaterialProvenanceSchema } from './harness';

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
  arrival?: { kind: 'user_statement'; eventId: string; quote: string; reportedAt: string };
}
export interface WeatherScene extends SceneBase {
  kind: 'weather';
  location: string;
  timeZone: string;
  days: { date: string; weatherCode: number | null; maxC: number | null; minC: number | null; precipitationProbabilityMax: number | null }[];
}
export interface CampusRecord {
  /** Identity supplied by the campus source, scoped by this snapshot and domain. */
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
}
export interface CampusScene extends SceneBase {
  kind: 'campus';
  domain: 'courses' | 'schedule' | 'exams';
  sourceLabel: string;
  origin: 'zju_account' | 'legacy_import';
  term?: string;
  records: CampusRecord[];
  /** Only the returned page, never an assertion that the whole term is loaded. */
  total?: number;
  complete: boolean;
}
export interface PlanningBlock {
  id: string;
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
  mode: 'preview' | 'draft';
  window: { from: string; to: string; timeZone: string };
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
  /** A picture of a calculation, never a receipt for saved calendar items. */
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
export type SceneSnapshot = MapScene | WeatherScene | CampusScene | PlanningScene | EnvironmentScene;
export interface PresentationView extends SceneRef {
  libraryVersion: 1;
  createdAt: string;
  sceneRefs: SceneRef[];
  dsl: string;
}
const id = z.string().min(1).max(160);
export const sceneRefSchema = z.object({ id, revision: z.number().int().positive() }).strict();
export const semanticSelectionSchema = z.object({
  sceneId: id, sceneRevision: z.number().int().positive(),
  kind: z.enum(['place', 'date', 'leg', 'record', 'time_block', 'environment_sample']),
  placeId: id.optional(), date: z.iso.date().optional(), legId: id.optional(), recordId: id.optional(),
  blockId: id.optional(), sampleId: id.optional(),
}).strict();
export type SemanticSelection = z.infer<typeof semanticSelectionSchema>;
export interface VerifiedSelection extends SemanticSelection {
  label: string;
  source: SceneSource;
  selectedAt: string;
  meaning: string;
  record?: CampusRecord;
  timeBlock?: PlanningBlock;
  environmentSample?: EnvironmentSample;
  timeZone?: string;
}
export const sceneReference = (scene: SceneRef) => `${scene.id}@${scene.revision}`;

/** A small, actual OpenUI library. No executable code or model-authored facts enter it. */
export function sceneViewDsl(scenes: SceneSnapshot[], layout: 'stack' | 'compare') {
  return `root = SceneStack([${scenes.map((_, index) => `scene${index}`).join(', ')}], ${JSON.stringify(layout)})\n`
    + scenes.map((scene, index) => `scene${index} = ${{ map: 'MapScene', weather: 'WeatherScene', campus: 'CampusScene', planning: 'PlanningScene', environment: 'EnvironmentScene' }[scene.kind]}(${JSON.stringify(sceneReference(scene))})`).join('\n');
}
