import type { LngLat,MapOverview,MapPoint,MapGraph,MapAccessCandidate } from './map-v2';

interface OfficialCorrespondence {
  id: string;
  basis?: string;
  source?: string;
  offsetM?: number;
  reportedBasis?: string;
  identityStatus?: 'unverified' | 'reference-only';
  evidence?: { kind: 'recorded-link' | 'name-spatial-candidate' | 'reference-only'; locator?: string };
}
interface ReferenceLink { id: string; official?: string[]; legacy?: string[] }
interface CorrespondenceFacts {
  officialToCanonical?: Record<string, OfficialCorrespondence>;
  fidelityObservations?: {
    reviewedReferenceLinks?: ReferenceLink[];
    westArchitectureObservations?: {
      silverSupplement?: { canonicalCorrectionsForIntegration?: { id: string; officialIds?: string[] }[] };
    };
  };
}

/** A retained lookup target is not proof that the source and building are one
 * physical entity. In particular, an alias made by the same nearby-point
 * match cannot confirm that match. Keep the IDs and search data, preserve the
 * original assertion, and distinguish recorded links from heuristic matches.
 * Recorded links still require current source and physical qualification. */
export function retainUnverifiedOfficialCorrespondences<T extends CorrespondenceFacts>(facts:T):T {
  const reviewed = new Map<string, { id:string; locator:string }>();
  for (const [index, link] of (facts.fidelityObservations?.reviewedReferenceLinks || []).entries()) {
    const locator = `shared-facts.json#/fidelityObservations/reviewedReferenceLinks/${index}`;
    for (const id of link.official || []) reviewed.set('wfs/' + id, { id:link.id, locator });
    for (const id of link.legacy || []) reviewed.set(id, { id:link.id, locator });
  }
  const corrections = facts.fidelityObservations?.westArchitectureObservations?.silverSupplement?.canonicalCorrectionsForIntegration || [];
  for (const [index, link] of corrections.entries()) {
    const locator = `shared-facts.json#/fidelityObservations/westArchitectureObservations/silverSupplement/canonicalCorrectionsForIntegration/${index}`;
    for (const id of link.officialIds || []) reviewed.set('wfs/' + id, { id:link.id, locator });
  }
  const officialToCanonical = Object.fromEntries(Object.entries(facts.officialToCanonical || {}).map(([id, record]) => {
    if (record.basis === 'official reference only; footprint not identified' ||
        record.basis === 'legacy official reference only; footprint not identified') {
      return [id, { ...record, identityStatus:'reference-only', evidence:{ kind:'reference-only' } }];
    }
    if (record.basis !== 'public name/spatial correspondence' &&
        record.basis !== 'legacy official name and nearby ground location') return [id, record];
    const link = reviewed.get(id), recorded = link?.id === record.id;
    return [id, {
      ...record,
      reportedBasis:record.basis,
      basis:recorded ? 'recorded link; physical identity unverified' : 'retained name/spatial candidate; physical identity unverified',
      identityStatus:'unverified',
      evidence:recorded ? { kind:'recorded-link', locator:link.locator } : { kind:'name-spatial-candidate' },
    }];
  }));
  return { ...facts, officialToCanonical };
}

type DetailFeature = { id?: string | number; properties: Record<string, unknown> | null };
export interface UndergroundStationObservation {
  id: string;
  sourceVersion: number;
  entrances: { id:string; name:string; coordinate:LngLat; source:string; structureId?:string; structureVersion?:number }[];
  interiorWays: { id:string; version:number }[];
}

/** Only individually reviewed station records receive underground semantics.
 * Source polygons remain retained facts; they are not ground obstacles or floors.
 * An OSM entrance/graph link records a location, not current opening or access. */
export function qualifyUndergroundStations(points:MapPoint[],graph:MapGraph,geography:{features:DetailFeature[]},display:{features:DetailFeature[]},observations:UndergroundStationObservation[]):MapGraph {
  const sources=new Map(geography.features.map(feature=>[String(feature.id),feature.properties]));
  for(const station of observations){
    const source=sources.get(station.id);
    if(source?.version!==station.sourceVersion||source.building!=='train_station'||!(Number(source.layer)<0))throw new Error('Underground station source changed');
    for(const way of station.interiorWays){const source=sources.get(way.id);if(source?.version!==way.version||!(Number(source.layer)<0)||!['yes','culvert'].includes(String(source.tunnel)))throw new Error('Station passage source changed');}
    for(const entrance of station.entrances)if(entrance.structureId&&sources.get(entrance.structureId)?.version!==entrance.structureVersion)throw new Error('Station entrance structure changed');
  }
  const stations=new Map(observations.map(item=>[item.id,item]));
  const interiors=new Set(observations.flatMap(station=>station.interiorWays.map(way=>way.id)));
  const nodes=new Map(graph.nodes.map(node=>[node.id,node]));
  for(const feature of geography.features)if(stations.has(String(feature.id))&&feature.properties)feature.properties.undergroundStation=true;
  for(const feature of display.features){
    if(!feature.properties)continue;
    if(stations.has(String(feature.id)))feature.properties.kind='underground-station';
    else if(interiors.has(String(feature.id)))feature.properties.kind='station-interior';
  }
  for(const point of points){
    const record=stations.get(point.id);if(!record)continue;
    point.undergroundStation=true;
    point.aliases=[...new Set([...point.aliases,point.displayName+'站',point.displayName+'地铁站'])];
    point.entrances=record.entrances.map(entrance=>({...entrance,connected:entrance.coordinate.every((value,i)=>nodes.get(entrance.id)?.coordinate[i]===value)}));
    point.accessCandidates=point.entrances.filter(entrance=>entrance.connected).map(entrance=>({
      id:'entrance/'+entrance.id,entranceId:entrance.id,nodeId:entrance.id,kind:'entrance',name:entrance.name,
      coordinate:entrance.coordinate,coordinates:[entrance.coordinate],meters:0,source:entrance.source,
    }));
    point.modelBasis='地下车站；轮廓只表示源数据中的站体范围。步行路线以已记录出入口为端点，不包含进站、乘车或站内换乘。';
  }
  return {...graph,edges:graph.edges.map(edge=>interiors.has(edge.way)
    ? {...edge,conditions:[...new Set([...(edge.conditions||[]),'indoor_passage_unverified'])]}:edge)};
}

export const bridgeStatusUnverified = 'bridge_status_unverified';
export const inactiveBridgeValues: ReadonlySet<string> = new Set(['abandoned','disused','demolished','dismantled','removed','razed']);

/** Keep an explicit historical bridge tag separate from gate-opening assumptions.
 * The tag is source evidence, not confirmation of the bridge's present state.
 * Retain all graph members and existing conditions; do not invent a bridge flag.
 */
export function retainBridgeStatusConditions<T extends MapGraph>(graph:T,geography:{features:DetailFeature[]}):T {
  const uncertain=new Set(geography.features.filter(feature=>{
    const value=feature.properties?.bridge;
    return typeof value==='string'&&inactiveBridgeValues.has(value.trim().toLowerCase());
  }).map(feature=>String(feature.id)));
  return {...graph,edges:graph.edges.map(edge=>uncertain.has(edge.way)&&!edge.conditions?.includes(bridgeStatusUnverified)
    ? {...edge,conditions:[...(edge.conditions||[]),bridgeStatusUnverified]}:edge)};
}

/** Current source access applies only to the traced, unchanged source segments.
 * A known foot prohibition cannot be opened by an unknown-passage hypothesis.
 * Keep the original edges, coordinates and weights for provenance and display.
 */
export const publishedFootRestrictions = [{
  way:'way/588262375',foot:'no',version:6,sourceTimestamp:'2026-09-29T08:04:59Z',
  sourceUrl:'https://api.openstreetmap.org/api/0.6/way/588262375.json',
  sourceSegments:['way/588262375:0','way/588262375:1','way/588262375:2','way/588262375:3'],
}] as const;

export function retainPublishedFootRestrictions<T extends MapGraph>(graph:T):T {
  return {...graph,edges:graph.edges.map(edge=>publishedFootRestrictions.some(observation=>
    observation.way===edge.way&&(observation.sourceSegments as readonly string[]).includes(edge.sourceEdge||edge.id))
      ? {...edge,foot:'no'}:edge)};
}

/** Published gate restrictions remain uncertain until a reopening is verified.
 * Expected completion, including possible early completion, is not that receipt.
 * These named-place observations do not assign construction extents to roads.
 */
export const publishedPlaceAccessUncertainty = [{
  placeId:'official/hotmap_221027.1264',
  name:'东一门（游泳馆门）',
  sourceUrl:'http://www.zwc.zju.edu.cn/2026/0930/c22012a3210902/page.htm',
  publishedDate:'2026-09-30',scheduledStart:'2026-10-01',expectedCompletion:'2026-10-11',
  conditions:['gate_opening_unverified'],
}] as const;

export function retainPublishedPlaceAccessConditions(points:MapPoint[]):MapPoint[] {
  return points.map(point=>{
    const observation=publishedPlaceAccessUncertainty.find(item=>item.placeId===point.id);
    if(!observation)return point;
    const candidates:MapAccessCandidate[]=point.accessCandidates??point.entrances.filter(e=>e.connected).map(e=>({
      id:'entrance/'+e.id,nodeId:e.id,kind:'entrance',name:e.name,coordinate:e.coordinate,
      coordinates:[e.coordinate],meters:0,source:e.source,
    }));
    return {...point,accessCandidates:candidates.map(candidate=>({...candidate,
      conditions:[...new Set([...(candidate.conditions||[]),...observation.conditions])],
    }))};
  });
}

/** Explain the actual assumptions used by an edge or selected access point.
 * A redevelopment or unknown condition must not become an opening-hours claim.
 */
export function routeConditionWarning(conditions:readonly string[]):string|undefined {
  const remaining=new Set(conditions);
  if(!remaining.size)return;
  const descriptions:[string,string,string][]=[
    [bridgeStatusUnverified,'历史桥位','这条假设路线经过历史桥位，桥的现状尚未核实。'],
    ['redeveloped_site_access_unverified','重建片区的旧通路','这条假设路线经过重建片区，旧通路的现状尚未核实。'],
    ['indoor_passage_unverified','室内通道','这条假设路线包含室内通道，当前通行条件尚未核实。'],
    ['gate_opening_unverified','门禁','已按你的选择包含待核通路；这是假设路线，不代表门已开放。'],
  ];
  const labels:string[]=[];
  for(const [id,label,single] of descriptions)if(remaining.has(id)){
    if(conditions.every(c=>c===id))return single;
    labels.push(label);remaining.delete(id);
  }
  if(remaining.size)labels.push('其他待核通路');
  return `这条假设路线涉及${labels.join('、')}，相关通行现状尚未核实。`;
}

const legacyIslandParents=new Map<string,string>([
  ...Array.from({length:12},(_,n)=>[`island/amphitheatre-step-${n}`,'island/amphitheatre'] as [string,string]),
  ...Array.from({length:3},(_,n)=>[`island/waterfront-terrace-${n}`,'island/waterfront'] as [string,string]),
]);
/** Restore relationships omitted by the original island generator, without editing geometry. */
export function restoreLandscapeDetailParents<T extends { features: DetailFeature[] }>(details:T, parentIds:ReadonlySet<string>):T {
  const result=structuredClone(details);
  for(const feature of result.features){
    const p=feature.properties,id=String(feature.id);
    if(!p||p.kind!=='landscape-step'||p.parentId)continue;
    const parent=legacyIslandParents.get(id);
    if(parent&&parentIds.has(parent))p.parentId=parent;
  }
  return result;
}

type RoadDisplayFeature = DetailFeature & { geometry: { type:string; coordinates?:unknown } | null };
/** Keep the original source way while displaying only its default graph segments.
 * A source-history way can contain both conditional and ordinary segments.
 * This is a display derivation; it does not certify current physical access.
 */
export function restoreRecordedRoadDisplays<T extends { features:RoadDisplayFeature[] }>(display:T,graph:MapGraph):T {
  const result={...display,features:[...display.features]},nodes=new Map(graph.nodes.map(n=>[n.id,n.coordinate]));
  const byWay=new Map<string,MapGraph['edges']>();
  for(const edge of graph.edges){
    const edges=byWay.get(edge.way)||[];edges.push(edge);byWay.set(edge.way,edges);
  }
  for(let index=0;index<result.features.length;index++){
    const feature=result.features[index];
    const p=feature.properties;
    if(!p||p.kind!=='source-history')continue;
    const edges=byWay.get(String(feature.id))||[],ordinary=edges.filter(e=>!e.conditions?.length);
    if(!ordinary.length)continue;
    if(!feature.geometry||!['LineString','MultiLineString'].includes(feature.geometry.type))
      throw new Error('Source road display requires line geometry');
    const runs:{start:string;end:string;coordinates:LngLat[]}[]=[];
    for(const edge of ordinary){
      const from=nodes.get(edge.from),to=nodes.get(edge.to);
      if(!from||!to||[from,to].some(c=>c.length!==2||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>90))
        throw new Error('Source road display node is unavailable');
      const run=runs.at(-1);
      if(run?.end===edge.from){run.coordinates.push([...to]);run.end=edge.to;}
      else if(run?.end===edge.to){run.coordinates.push([...from]);run.end=edge.from;}
      else if(run?.start===edge.to){run.coordinates.unshift([...from]);run.start=edge.from;}
      else if(run?.start===edge.from){run.coordinates.unshift([...to]);run.start=edge.to;}
      else runs.push({start:edge.from,end:edge.to,coordinates:[[...from],[...to]]});
    }
    const geometry=runs.length===1
      ? {type:'LineString',coordinates:runs[0].coordinates}
      : {type:'MultiLineString',coordinates:runs.map(r=>r.coordinates)};
    result.features[index]={...feature,geometry,properties:{...p,kind:'road',sourceDisplayKind:'source-history',
      recordedDisplayEdgeIds:ordinary.map(e=>e.id),conditionalSourceEdgeIds:edges.filter(e=>e.conditions?.length).map(e=>e.id)}};
  }
  return result;
}

export interface MapDataset {manifest:MapOverview;places:MapPoint[];geography:object;sports?:object;venues?:MapVenue[];}
export interface MapVenue {
  displayBasis?: string;
  displaySourceImageId?: string;
  id: string;
  name: string;
  trackSource: string;
  infieldSource: string;
  entranceIds: string[];
  accessCandidateIds?: string[];
  geometryVersion: string;
  nominalLapM: number | null;
  nominalLapBasis?: string;
  laneCount: number | null;
  laneBasis?: string;
  displayLaneCount?: number;
  displayLaneBasis?: string;
  loop: { type: string; coordinates: LngLat[] } | null;
  geometricLoopM: number | null;
  lapBasis: string;
  markingBasis: string;
}
/** A view/plan reference is not an activity record or a completion receipt. */
export interface RunningMapReference {
  venueId: string;
  geometryVersion: string;
  plannedLoop?: LngLat[];
  lengthBasis: string;
  recordedObservations: never[];
}
