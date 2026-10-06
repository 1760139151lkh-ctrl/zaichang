import type {FeatureCollection,Feature,Position} from 'geojson';
import type {LngLat,MapPoint} from '../../shared/map-v2';

function insideRing([x,y]:LngLat,ring:Position[]):boolean{
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}

/** The merged surface has no place identity. Derived masks keep named
 * identities aligned with visible water while respecting island holes. */
export function namedWaterAreas(data:FeatureCollection):Feature[]{
 const displayed=data.features.filter(f=>f.properties?.kind==='named-water-hit');
 return displayed.length?displayed:data.features.filter(f=>f.properties?.kind==='water'&&['Polygon','MultiPolygon'].includes(f.geometry.type));
}

export function namedWaterShores(data:FeatureCollection):Map<string,Feature>{
 return new Map(data.features.filter(f=>f.properties?.kind==='named-water-shore').map(f=>[String(f.properties!.waterId),f]));
}

export function namedWaterHit(areas:Feature[],places:Map<string,MapPoint>,coordinate:LngLat):MapPoint|undefined{
 for(const f of areas){
  const id=String(f.properties?.waterId||f.id);
  if(!places.has(id))continue;
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
  for(const rings of polygons)if(insideRing(coordinate,rings[0])&&!rings.slice(1).some(r=>insideRing(coordinate,r)))return places.get(id);
 }
}
