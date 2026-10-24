import { contains } from '../../scripts/map-geometry.mjs';
import { allowsFootAccess, inBounds, metersBetween } from '../shared/map-routing';
import type { GraphEdge, LngLat, MapGraph, MapOverview } from '../shared/map-v2';
import type { MapVenue } from '../shared/map-v3';
import type { WorkoutMapFix, WorkoutMapMatch, WorkoutRoadCandidate, WorkoutVenueObservation } from '../shared/map-workout';

type AreaGeometry = { type: 'Polygon'; coordinates: LngLat[][] }
  | { type: 'MultiPolygon'; coordinates: LngLat[][][] };
interface SourceFeature {
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry?: { type: string; coordinates: unknown } | null;
}
export interface WorkoutMapGeography { features: SourceFeature[] }
interface RoadSegment { edge: GraphEdge; a: LngLat; b: LngLat }
interface VenueArea { venue: MapVenue; geometry: AreaGeometry; index: number; role: string }

/** Search policy, not a precision claim. A wider radius makes parallel campus
 * paths less distinguishable. Never enlarge it until a match is obtained.
 * The 5 m floor admits ordinary centreline/road-width differences; source-map
 * error is still unknown, not modelled as a Gaussian or certified by this floor. */
const minimumSearchM = 5;
const maximumAccuracyM = 30;
const outputCandidateLimit = 6;

function validCoordinate(value: unknown): value is LngLat {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

/** Campus-local tangent projection (longitude scaled at the observation's
 * latitude). Residuals use the existing WGS84 great-circle measurement.
 * This never uses Web Mercator metres, screen pixels or display interpolation. */
function project(point: LngLat, a: LngLat, b: LngLat) {
  const cos = Math.cos(point[1] * Math.PI / 180);
  const x = (b[0] - a[0]) * cos, y = b[1] - a[1];
  const fraction = Math.max(0, Math.min(1,
    ((point[0] - a[0]) * cos * x + (point[1] - a[1]) * y) / (x * x + y * y || 1)));
  const coordinate: LngLat = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
  return { coordinate, fraction, residualM: metersBetween(point, coordinate) };
}

function validArea(geometry: SourceFeature['geometry']): geometry is AreaGeometry {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return Array.isArray(polygons) && polygons.length > 0 && polygons.every(polygon =>
    Array.isArray(polygon) && polygon.length > 0 && polygon.every(ring =>
      Array.isArray(ring) && ring.length >= 4 && ring.every(validCoordinate)
      && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]));
}

function boundaryDistance(point: LngLat, geometry: AreaGeometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let nearest = Infinity;
  for (const polygon of polygons) for (const ring of polygon)
    for (let i = 1; i < ring.length; i++) nearest = Math.min(nearest, project(point, ring[i - 1], ring[i]).residualM);
  return nearest;
}

/** Read-only observations against the shared campus snapshot. No HMM route
 * completion or nearest-node connector is created; missing points stay missing.
 * Candidates cannot establish actual arrival, access, lane or school validity. */
export class CampusWorkoutMatcher {
  private readonly segments: RoadSegment[];
  private readonly venueAreas: VenueArea[];
  private readonly ready: boolean;

  constructor(private readonly graph: MapGraph, private readonly manifest: MapOverview,
    venues: readonly MapVenue[], geography: WorkoutMapGeography) {
    const nodes = new Map(graph.nodes.map(node => [node.id, node.coordinate]));
    this.segments = [];
    let invalidEdges = false;
    for (const edge of graph.edges) {
      const a = nodes.get(edge.from), b = nodes.get(edge.to);
      if (!a || !b || !validCoordinate(a) || !validCoordinate(b) || !Number.isFinite(edge.meters) || edge.meters <= 0) {
        invalidEdges = true;
        continue;
      }
      // Access estimates and user/profile connectors are not observed roads.
      if (!edge.way.startsWith('way/') || !allowsFootAccess(edge.foot)) continue;
      this.segments.push({ edge: structuredClone(edge), a: [...a], b: [...b] });
    }
    const byId = new Map(venues.map(venue => [venue.id, venue]));
    this.venueAreas = [];
    for (const [index, feature] of geography.features.entries()) {
      const venue = byId.get(String(feature.id));
      if (!venue) continue;
      if (!validArea(feature.geometry)) { invalidEdges = true; continue; }
      this.venueAreas.push({ venue, geometry: structuredClone(feature.geometry), index, role: String(feature.properties?.role || '') });
    }
    this.ready = !invalidEdges && this.venueAreas.length === venues.length
      && venues.every(venue => venue.geometryVersion === manifest.version)
      && manifest.dataStatus !== 'error' && manifest.dataStatus !== 'partial'
      && manifest.crs === 'EPSG:4326' && graph.version === manifest.version && this.segments.length > 0;
  }

  match(fix: WorkoutMapFix): WorkoutMapMatch {
    const accuracy = typeof fix.accuracy === 'number' && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 ? fix.accuracy : null;
    const result: WorkoutMapMatch = {
      method: 'campus-local-candidates/v1', state: 'unavailable', reason: 'invalid-fix',
      mapVersion: this.manifest.version, mapLabel: this.manifest.label, mapSourceDate: this.manifest.sourceDate,
      networkSha256: this.manifest.componentHashes?.['network.json'] || null,
      geographySha256: this.manifest.componentHashes?.['geography.geojson'] || null,
      sharedFactsSha256: this.manifest.componentHashes?.['shared-facts.json'] || null,
      observedAt: fix.timestamp, fixSource: fix.source,
      provenance: fix.mock === true || fix.provenance === 'simulated' ? 'simulated'
        : fix.provenance === 'device' && fix.mock === false ? 'device' : 'unknown',
      horizontalAccuracyM: accuracy, mapAccuracyM: null, searchRadiusM: null,
      candidates: [], candidateCount: 0, venues: [], interpolated: false, lapCount: null,
    };
    if (fix.crs !== 'EPSG:4326' || !validCoordinate(fix.coordinate) || !Number.isFinite(fix.timestamp) || fix.timestamp <= 0
      || (fix.accuracy !== null && accuracy === null)) return result;
    if (!this.ready) return { ...result, reason: 'map-unavailable' };
    if (!inBounds(fix.coordinate, this.manifest.bounds)) return { ...result, state: 'unmatched', reason: 'outside-map' };
    if (accuracy === null) return { ...result, state: 'weak-signal', reason: 'accuracy-missing' };
    if (accuracy > maximumAccuracyM) return { ...result, state: 'weak-signal', reason: 'accuracy-too-wide' };
    const radius = Math.max(minimumSearchM, accuracy);
    result.searchRadiusM = radius;
    result.venues = this.observeVenues(fix.coordinate, radius);
    const nearestBySource = new Map<string, WorkoutRoadCandidate>();
    for (const { edge, a, b } of this.segments) {
      const nearest = project(fix.coordinate, a, b);
      if (nearest.residualM > radius) continue;
      const candidate: WorkoutRoadCandidate = { edgeId: edge.id, sourceEdgeId: edge.sourceEdge || edge.id,
        wayId: edge.way, name: edge.name, ...nearest, conditions: [...(edge.conditions || [])],
        sourceLocator: 'assets/map-v2/network.json' };
      // Public entrance estimates may split one recorded segment. Those pieces
      // are one source candidate, not independent evidence or extra roads.
      const previous = nearestBySource.get(candidate.sourceEdgeId);
      if (!previous || candidate.residualM < previous.residualM
        || candidate.residualM === previous.residualM && candidate.edgeId.localeCompare(previous.edgeId) < 0)
        nearestBySource.set(candidate.sourceEdgeId, candidate);
    }
    const candidates = [...nearestBySource.values()];
    candidates.sort((a, b) => a.residualM - b.residualM || a.edgeId.localeCompare(b.edgeId));
    result.candidateCount = candidates.length;
    result.candidates = candidates.slice(0, outputCandidateLimit);
    if (!candidates.length) return { ...result, state: 'unmatched', reason: 'no-recorded-road' };
    // At junctions or parallel paths a single noisy fix cannot select a branch.
    if (candidates.length > 1) return { ...result, state: 'ambiguous', reason: 'multiple-candidates' };
    return { ...result, state: 'candidate', reason: 'one-candidate', selected: candidates[0] };
  }

  private observeVenues(point: LngLat, radius: number): WorkoutVenueObservation[] {
    return this.venueAreas.flatMap(({ venue, geometry, index, role }) => {
      const inside = contains(point, geometry), distance = boundaryDistance(point, geometry);
      if (!inside && distance > radius) return [];
      return [{ venueId: venue.id, name: venue.name,
        relation: inside && distance > radius ? 'inside-recorded-area' as const : 'near-recorded-boundary' as const,
        boundaryDistanceM: distance, geometryVersion: venue.geometryVersion,
        geometryBasis: role === 'running-track' ? 'source-track-area' as const : 'source-venue-outline' as const,
        nominalLapM: venue.nominalLapM, nominalLapBasis: venue.nominalLapBasis || venue.lapBasis,
        referenceLoopM: venue.loop && Number.isFinite(venue.geometricLoopM) ? venue.geometricLoopM : null,
        referenceLoopBasis: venue.lapBasis,
        venueSourceLocator: `assets/map-v2/venues.json#${venue.id}`,
        sourceLocator: `assets/map-v2/geography.geojson#/features/${index}`, lapCount: null }];
    });
  }
}
