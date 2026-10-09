import type { LngLat,MapOverview,MapPoint,MapGraph } from './map-v2';

type DetailFeature = { id?: string | number; properties: Record<string, unknown> | null };
export const bridgeStatusUnverified = 'bridge_status_unverified';
const inactiveBridgeValues = new Set(['abandoned','disused','demolished','dismantled','removed','razed']);

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
