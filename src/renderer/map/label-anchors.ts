import type { Feature, FeatureCollection, Position } from 'geojson';
import type { LngLat, MapPoint } from '../../shared/map-v2';

export type LabelAnchor={coordinate:LngLat;height:number};
type XY=[number,number];
const distanceToSegment=(p:XY,a:XY,b:XY)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
};

/** A view-only interior anchor. Scan between vertex ordinates, respecting holes,
 * and prefer clearance over a bounding-box centre in an empty courtyard. The
 * small local scale is used only to compare label room, never for route metres. */
function interior(feature:Feature,reference:LngLat):LngLat {
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[];
  const sx=Math.cos(reference[1]*Math.PI/180)*111320,sy=110574;
  const local=(p:Position):XY=>[(p[0]-reference[0])*sx,(p[1]-reference[1])*sy];
  let chosen:XY=[0,0],best=-Infinity;
  for(const polygon of polygons){
    const rings=polygon.map(r=>r.map(local)),ys=[...new Set(rings.flat().map(p=>p[1]))].sort((a,b)=>a-b);
    const edges=rings.flatMap(r=>r.slice(1).map((p,i)=>[r[i],p] as [XY,XY]));
    for(let n=1;n<ys.length;n++){
      if(ys[n]-ys[n-1]<.08)continue;
      const y=(ys[n]+ys[n-1])/2,xs:number[]=[];
      for(const [a,b] of edges)if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      xs.sort((a,b)=>a-b);
      for(let i=0;i+1<xs.length;i+=2){
        const p:XY=[(xs[i]+xs[i+1])/2,y],clearance=Math.min(...edges.map(([a,b])=>distanceToSegment(p,a,b)));
        const score=clearance-Math.hypot(...p)*.015;
        if(score>best){best=score;chosen=p;}
      }
    }
  }
  return [reference[0]+chosen[0]/sx,reference[1]+chosen[1]/sy];
}

function meshRoof(model:any,coordinate:LngLat):LabelAnchor|undefined {
  let height=-Infinity,fallback:{score:number;anchor:LabelAnchor}|undefined;
  for(const part of model.parts||[]){
    if(!['roof','glass','garden','dorm-roof','tile-roof','dome'].includes(part.material))continue;
    for(let i=0;i<part.vertices.length;i+=3){
      const [a,b,c]=part.vertices.slice(i,i+3) as number[][];
      // Barycentric interpolation on the horizontal projection of actual
      // display triangles. Vertical walls and ground garden fills do not count.
      const bx=b[0]-a[0],by=b[1]-a[1],cx=c[0]-a[0],cy=c[1]-a[1],d=bx*cy-by*cx;
      if(Math.abs(d)<1e-17||Math.max(a[2],b[2],c[2])<1)continue;
      const px=coordinate[0]-a[0],py=coordinate[1]-a[1],u=(px*cy-py*cx)/d,v=(bx*py-by*px)/d;
      if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001)height=Math.max(height,a[2]+u*(b[2]-a[2])+v*(c[2]-a[2]));
      const centre:LngLat=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3];
      const score=Math.hypot((centre[0]-coordinate[0])*Math.cos(coordinate[1]*Math.PI/180),centre[1]-coordinate[1]);
      if(!fallback||score<fallback.score)fallback={score,anchor:{coordinate:centre,height:(a[2]+b[2]+c[2])/3}};
    }
  }
  return Number.isFinite(height)?{coordinate,height}:fallback?.anchor;
}

/** Labels are display anchors, separate from canonical place/entrance points. */
export function labelAnchors(data:FeatureCollection,places:MapPoint[]):Map<string,LabelAnchor>{
  const features=new Map(data.features.map(f=>[String(f.id),f])),result=new Map<string,LabelAnchor>();
  for(const p of places){
    const f=features.get(p.id),model=f?.properties?.surfaceModel;
    if(!f||p.personal?.referencePoint||(p.geometryStatus==='reference-point'&&!model)||(p.kind!=='building'&&!model)){result.set(p.id,{coordinate:p.coordinate,height:0});continue;}
    const coordinate=interior(f,p.coordinate);
    let anchor:LabelAnchor={coordinate,height:Number(f.properties?.heightM||0)};
    if(model?.type==='authored-mesh')anchor=meshRoof(model,coordinate)||anchor;
    else if(model)anchor={coordinate:model.center,height:Number(model.heightM||0)};
    result.set(p.id,anchor);
  }
  return result;
}
