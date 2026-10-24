import type { LngLat } from './map-v2';

/** Structural subset of a raw workout fix. Matching never replaces this fix. */
export interface WorkoutMapFix {
  coordinate: LngLat;
  crs: string;
  timestamp: number;
  accuracy: number | null;
  source: string;
  provenance?: 'device' | 'simulated' | 'unknown';
  mock?: boolean | null;
}

export interface WorkoutRoadCandidate {
  edgeId: string;
  sourceEdgeId: string;
  wayId: string;
  name: string;
  coordinate: LngLat;
  fraction: number;
  residualM: number;
  conditions: string[];
  /** Lookup this file by sourceEdgeId (edge.id or edge.sourceEdge). */
  sourceLocator: string;
}

export interface WorkoutVenueObservation {
  venueId: string;
  name: string;
  relation: 'inside-recorded-area' | 'near-recorded-boundary';
  boundaryDistanceM: number;
  geometryVersion: string;
  geometryBasis: 'source-track-area' | 'source-venue-outline';
  nominalLapM: number | null;
  nominalLapBasis: string;
  /** Public map reference only, never a measured or certified lap length. */
  referenceLoopM?: number | null;
  referenceLoopBasis?: string;
  venueSourceLocator?: string;
  sourceLocator: string;
  /** A venue overlap cannot identify a lane, completed lap or school credit. */
  lapCount: null;
}

export interface WorkoutMapMatch {
  method: 'campus-local-candidates/v1';
  state: 'candidate' | 'ambiguous' | 'unmatched' | 'weak-signal' | 'unavailable';
  reason: 'one-candidate' | 'multiple-candidates' | 'no-recorded-road' | 'accuracy-missing'
    | 'accuracy-too-wide' | 'invalid-fix' | 'outside-map' | 'map-unavailable';
  mapVersion: string;
  mapLabel?: string;
  mapSourceDate: string;
  networkSha256: string | null;
  geographySha256: string | null;
  sharedFactsSha256: string | null;
  observedAt: number;
  fixSource: string;
  provenance: 'device' | 'simulated' | 'unknown';
  horizontalAccuracyM: number | null;
  /** Source-map positional accuracy has not been independently measured. */
  mapAccuracyM: null;
  searchRadiusM: number | null;
  candidates: WorkoutRoadCandidate[];
  candidateCount: number;
  selected?: WorkoutRoadCandidate;
  venues: WorkoutVenueObservation[];
  /** No inferred lines, travelled distance, lane, or lap totals are produced. */
  interpolated: false;
  lapCount: null;
}
