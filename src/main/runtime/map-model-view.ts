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

/** Place lookup delivers semantic facts, not the renderer's entrance/access
 * path geometry. Keep the one public reference coordinate for weather and
 * explicit geographic questions; it is never the user's device location. */
export function projectMapSearchPoint(point: MapPoint): Record<string, unknown> {
  const facts=projectObject(point),groups=new Map<string,{kind:MapAccessCandidate['kind'];name:string;stairs:boolean|null;
    connected:boolean|null;conditions:string[];distanceRangeM:{min:number;max:number};
    candidates:{id:string;source:string;nodeId:string;entranceId?:string}[]}>();
  for(const candidate of point.accessCandidates||[]){
    const known=candidate.entranceId?point.entrances.find(entrance=>entrance.id===candidate.entranceId):undefined;
    const stairs=candidate.stairs??null,connected=known?known.connected:null,conditions=candidate.conditions||[];
    const key=JSON.stringify([candidate.kind,candidate.name,stairs,connected,conditions]);
    const member={id:candidate.id,source:candidate.source,nodeId:candidate.nodeId,
      ...(candidate.entranceId?{entranceId:candidate.entranceId}:{})};
    const group=groups.get(key);
    if(group){group.distanceRangeM.min=Math.min(group.distanceRangeM.min,candidate.meters);
      group.distanceRangeM.max=Math.max(group.distanceRangeM.max,candidate.meters);group.candidates.push(member);}
    else groups.set(key,{kind:candidate.kind,name:candidate.name,stairs,connected,conditions:[...conditions],
      distanceRangeM:{min:candidate.meters,max:candidate.meters},candidates:[member]});
  }
  // Discovery does not need one repeated record per alternative path. Preserve
  // every candidate identity/source and each distinct condition combination;
  // the exact chosen access, geometry and distance still come from map.route.
  delete facts.accessCandidates;
  return { ...facts, coordinate: [point.coordinate[0], point.coordinate[1]],
    accessSummary:{summary:true,candidateCount:point.accessCandidates?.length||0,groups:[...groups.values()],
      coverage:'all_candidates_grouped'},
    geometryOmitted: true, coordinateMeaning: 'public_reference_not_device' };
}

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
