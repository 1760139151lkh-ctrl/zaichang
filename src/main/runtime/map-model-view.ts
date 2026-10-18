import type { MapAccessCandidate, MapEntrance, MapPoint, MapRouteResult } from '../../shared/map-v2';
import type { CapabilityResult } from '../capabilities/broker';

const geometryFields = new Set(['coordinate', 'coordinates', 'bounds', 'nodeIds', 'edgeIds']);

function projectObject(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
    .filter(([key, child]) => !geometryFields.has(key) && child !== undefined)
      .map(([key, child]) => [key, projectValue(child)]),
  );
}

function projectValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(projectValue);
  if (
    value &&
    typeof value === 'object' &&
    'schemaVersion' in value &&
    value.schemaVersion === 'map-route/v2'
  )
    return projectMapRoute(value as MapRouteResult);
  return value !== null && typeof value === 'object' ? projectObject(value) : value;
}

/** Prepared material may contain the same route snapshot as a map tool. */
export const projectMapValue = (value: unknown): unknown => projectValue(value);

function endpoint(point: MapPoint | undefined) {
  if (!point) return undefined;
  return {
    id: point.id,
    displayName: point.displayName,
    kind: point.kind,
    graphNodeId: point.graphNodeId,
    geometryStatus: point.geometryStatus,
    undergroundStation: point.undergroundStation,
    historicalReference: point.historicalReference,
    roadReference: point.roadReference,
    source: point.source,
  };
}
function entrance(value: MapEntrance | undefined) {
  return value
    ? { id: value.id, name: value.name, connected: value.connected, source: value.source }
    : undefined;
}
function access(value: MapAccessCandidate | undefined) {
  return value
    ? {
        id: value.id,
        entranceId: value.entranceId,
        kind: value.kind,
        name: value.name,
        meters: value.meters,
        source: value.source,
        conditions: value.conditions,
        stairs: value.stairs,
      }
    : undefined;
}

/** Preserve road order and every access condition, while joining adjacent
 * graph edges that tell the model the same thing. Drawing uses the raw edges. */
function sections(route: MapRouteResult) {
  const result: {
    name: string;
    kind: 'network' | 'estimate';
    meters: number;
    stairs: boolean | null;
    bridge: boolean | null;
    conditions: string[];
    sourceSegmentCount: number;
  }[] = [];
  let priorKey = '';
  for (const segment of route.segments || []) {
    const conditions = segment.conditions || [],
      key = JSON.stringify([segment.name, segment.kind, segment.stairs ?? null, segment.bridge ?? null, conditions]);
    const count = (segment as typeof segment & { sourceSegmentCount?: number }).sourceSegmentCount || 1;
    if (key === priorKey && result.length) {
      result.at(-1)!.meters += segment.meters;
      result.at(-1)!.sourceSegmentCount += count;
    } else
      result.push({
        name: segment.name,
        kind: segment.kind,
        meters: segment.meters,
        stairs: segment.stairs ?? null,
        bridge: segment.bridge ?? null,
        conditions,
        sourceSegmentCount: count,
      });
    priorKey = key;
  }
  return result;
}

/** A model copy retains route facts and identities; the map keeps its full geometry. */
export function projectMapRoute(route: MapRouteResult): Record<string, unknown> {
  return projectObject({
    schemaVersion: route.schemaVersion,
    status: route.status,
    reason: route.reason,
    from: endpoint(route.from),
    to: endpoint(route.to),
    distance: route.distance,
    routeBasis: route.routeBasis,
    originEntrance: entrance(route.originEntrance),
    destinationEntrance: entrance(route.destinationEntrance),
    originAccess: access(route.originAccess),
    destinationAccess: access(route.destinationAccess),
    segments: sections(route),
    geometryOmitted: true,
    segmentGrouping: 'adjacent_equal_name_and_conditions',
    conditionalOrigins: projectValue(route.conditionalOrigins),
    roadReferences: route.roadReferences?.map((value) => ({ ...value, point: endpoint(value.point) })),
    warnings: route.warnings,
    source: route.source,
    profileRevision: route.profileRevision,
  });
}

export function projectMapModelResult(capability: string, result: CapabilityResult): CapabilityResult {
  if (capability !== 'map.route' && capability !== 'map.relations') return result;
  return {
    ...projectObject(result),
    status: result.status,
    sourceId: result.sourceId,
    simulated: result.simulated,
  };
}
