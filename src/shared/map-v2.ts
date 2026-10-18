/** Backward-compatible wire contract; V3 adds explicit access and spatial facts.
 * Coordinates are always [longitude, latitude] in WGS84. */
export type LngLat = [number, number];
export type Bounds = [number, number, number, number];
export interface MapEntrance {
  id: string;
  structureId?: string;
  name: string;
  coordinate: LngLat;
  connected: boolean;
  source: string;
}
export interface MapAccessCandidate {
  id: string;
  entranceId?: string;
  nodeId: string;
  kind: 'entrance' | 'estimate' | 'road-point';
  name: string;
  coordinate: LngLat;
  coordinates: LngLat[];
  meters: number;
  source: string;
  conditions?: string[];
  stairs?: boolean;
}
export interface MapPoint {
  id: string;
  undergroundStation?: boolean;
  graphNodeId?: string;
  displayName: string;
  aliases: string[];
  scope?: 'campus' | 'context';
  kind: 'building' | 'area' | 'node' | 'landmark' | 'facility' | 'water';
  coordinate: LngLat;
  bounds: Bounds;
  entrances: MapEntrance[];
  source: { url: string; version?: number; updatedAt?: string; featureId?: string };
  geometryStatus: 'mapped' | 'reference-point';
  accessCandidates?: MapAccessCandidate[];
  nearbyRoadReferences?: { id: string; straightM: number }[];
  roadReference?: { nodeId: string; roadName: string; forPlaceIds: string[] };
  officialIds?: string[];
  legacyIds?: string[];
  volumeBasis?: 'source-height' | 'levels-estimate' | 'footprint-only' | 'official-approximate-height' | 'construction-document' | 'image-proportioned' | 'cartographic-proxy';
  heightM?: number;
  modelBasis?: string;
  accessReviewBasis?: string;
  historicalReference?: boolean;
  waterBasis?: string;
  documentedLevels?: number;
  sourceCorrection?: { previousName: string; basis: string };
  personal?: { note?: string; roles?: string[]; roleKeys?: string[]; basis: 'user'; referencePoint?: boolean };
}
export interface MapOverview {
  schemaVersion: 'campus-map/v2';
  version: string;
  sourceDate: string;
  acquiredAt: string;
  bounds: Bounds;
  campusBounds: Bounds;
  label: string;
  crs: 'EPSG:4326';
  coordinateOrder: string;
  renderProjection: 'EPSG:3857';
  distance: string;
  license: string;
  attribution: string;
  source: string;
  copyright: string;
  buildings: number;
  selectable: number;
  entrances: number;
  connectedEntrances: number;
  routableBuildings: number;
  nodes: number;
  edges: number;
  features: number;
  coreLandmarks?: number;
  rejected: Record<string, number>;
  limitations: string[];
  dataStatus?: 'ready' | 'partial' | 'error';
  dataError?: string;
  implementation?: 'campus-map/v3';
  sourceSha256?: string;
  profileRevision?: string;
  profileName?: string;
  estimatedAccessCandidates?: number;
  volumeCoverage?: Record<string, number>;
  componentHashes?: Record<string,string>;
}
export interface LocationFix {
  coordinate: LngLat;
  crs: 'EPSG:4326';
  timestamp: number;
  accuracy: number;
  source: 'windows-native' | 'browser-local' | 'phone-synced' | 'test';
  deviceLabel: string;
}
export type LocationState =
  'idle' | 'requesting' | 'fresh' | 'approximate' | 'stale' | 'denied' | 'unavailable' | 'outside';
export interface LocationStatusResult {
  status: LocationState;
  reason: string;
  source: string;
  fix?: LocationFix;
  phoneConnected: false;
}
export type MapEndpoint = { kind: 'place' | 'node'; id: string } | { kind: 'current'; fix?: LocationFix };
/** Retain explicit graph endpoints when a route is reopened in the map. */
export function mapPointEndpoint(point:MapPoint):MapEndpoint {
  const legacyNode=point.kind==='node'&&!point.scope&&!point.personal&&point.id.startsWith('node/')
    &&point.entrances.some(e=>e.connected&&e.id===point.id.slice(5));
  const id=point.graphNodeId||(legacyNode?point.id.slice(5):undefined);
  return id&&point.id===`node/${id}`?{kind:'node',id}:{kind:'place',id:point.id};
}
export interface MapRouteQuery {
  from?: MapEndpoint;
  to?: MapEndpoint;
  avoidStairs?: boolean;
  version?: string;
  profileRevision?: string;
  allowConditional?: boolean;
  originAccessId?: string;
  destinationAccessId?: string;
}
export interface GraphNode {
  id: string;
  coordinate: LngLat;
  entrance?: string;
  name?: string;
  barrier?: string;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  meters: number;
  way: string;
  name: string;
  stairs: boolean;
  bridge: boolean;
  gate: boolean;
  covered?: boolean;
  buildingPassage?: boolean;
  reviewedApproach?: boolean;
  oneway: boolean;
  foot?: string;
  conditions?: string[];
  sourceEdge?: string;
}
export interface MapGraph {
  version: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export type RouteStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'same'
  | 'missing_origin'
  | 'missing_destination'
  | 'unknown_entrance'
  | 'unreachable'
  | 'outside'
  | 'origin_confirmation'
  | 'error';
export interface MapRouteResult {
  routeBasis?: 'recorded_network' | 'recorded_network_with_estimates' | 'access_estimate_only' | 'access_estimate_dominant';
  conditionalOrigins?: {
    id: string;
    label: string;
    originEntrance: Pick<MapEntrance, 'id' | 'name' | 'connected' | 'source'>;
    destinationEntrance: Pick<MapEntrance, 'id' | 'name' | 'connected' | 'source'>;
    networkM: number;
    minutes: { min: number; max: number };
    connection: 'unknown';
    condition: string;
  }[];
  schemaVersion: 'map-route/v2';
  status: RouteStatus;
  roadReferences?: { endpoint: 'origin' | 'destination'; point: MapPoint; straightM: number; forPlace: string }[];
  reason: string;
  from?: MapPoint;
  to?: MapPoint;
  originEntrance?: MapEntrance;
  destinationEntrance?: MapEntrance;
  coordinates: LngLat[];
  nodeIds: string[];
  edgeIds: string[];
  distance?: { totalM: number; networkM: number; connectorM: number };
  originAccess?: MapAccessCandidate;
  destinationAccess?: MapAccessCandidate;
  segments?: { id: string; name: string; coordinates: LngLat[]; meters: number; kind: 'network' | 'estimate'; stairs?: boolean; bridge?: boolean; conditions?: string[] }[];
  profileRevision?: string;
  warnings: string[];
  source: { version: string; kind: 'osm'; date: string };
  elapsedMs?: number;
}
export interface MapCard {
  kind: 'route';
  route: MapRouteResult;
}
export function routeHasUnverifiedPassages(route:MapRouteResult):boolean {
  return route.status==='ready'&&Boolean(route.originAccess?.conditions?.length||route.destinationAccess?.conditions?.length||route.segments?.some(segment=>segment.conditions?.length));
}
export function mapRoutePointName(point:MapPoint|undefined,access?:MapAccessCandidate):string {
  const entrance=point?.undergroundStation&&point.entrances.find(e=>e.id===(access?.entranceId||(access?.kind==='entrance'?access.nodeId:undefined)));
  return point?(entrance?`${point.displayName} · ${entrance.name}`:point.displayName):'';
}
export function emptyRoute(reason = '选择一个地点，看看怎么走。'): MapRouteResult {
  return {
    schemaVersion: 'map-route/v2',
    status: 'idle',
    reason,
    coordinates: [],
    nodeIds: [],
    edgeIds: [],
    warnings: [],
    source: { version: '', kind: 'osm', date: '' },
  };
}
