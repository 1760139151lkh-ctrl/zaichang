import type { LngLat,MapOverview,MapPoint } from './map-v2';

type DetailFeature = { id?: string | number; properties: Record<string, unknown> | null };
/** Restore relationships omitted by the original island generator, without editing geometry. */
export function restoreLandscapeDetailParents<T extends { features: DetailFeature[] }>(details:T, parentIds:ReadonlySet<string>):T {
  const result=structuredClone(details);
  for(const feature of result.features){
    const p=feature.properties,id=String(feature.id);
    if(!p||p.kind!=='landscape-step'||p.parentId)continue;
    const step=/^island\/amphitheatre-step-(\d+)$/.exec(id),terrace=/^island\/waterfront-terrace-(\d+)$/.exec(id);
    const parent=step&&Number(step[1])<12?'island/amphitheatre':terrace&&Number(terrace[1])<3?'island/waterfront':undefined;
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
