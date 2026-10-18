import { z } from 'zod';
import type { MapPoint, MapRouteResult } from './map-v2';

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
export type SceneSnapshot = MapScene | WeatherScene;
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
  kind: z.enum(['place', 'date', 'leg']),
  placeId: id.optional(), date: z.iso.date().optional(), legId: id.optional(),
}).strict();
export type SemanticSelection = z.infer<typeof semanticSelectionSchema>;
export interface VerifiedSelection extends SemanticSelection {
  label: string;
  source: SceneSource;
  selectedAt: string;
  meaning: string;
}
export const sceneReference = (scene: SceneRef) => `${scene.id}@${scene.revision}`;

/** A small, actual OpenUI library. No executable code or model-authored facts enter it. */
export function sceneViewDsl(scenes: SceneSnapshot[], layout: 'stack' | 'compare') {
  return `root = SceneStack([${scenes.map((_, index) => `scene${index}`).join(', ')}], ${JSON.stringify(layout)})\n`
    + scenes.map((scene, index) => `scene${index} = ${scene.kind === 'map' ? 'MapScene' : 'WeatherScene'}(${JSON.stringify(sceneReference(scene))})`).join('\n');
}
