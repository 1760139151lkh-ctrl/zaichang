import type { LngLat,MapOverview,MapPoint } from './map-v2';

type DetailFeature = { id?: string | number; properties: Record<string, unknown> | null };
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
