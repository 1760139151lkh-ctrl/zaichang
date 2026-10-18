import { transform } from 'ol/proj.js';
import { contains, crossesInterior } from '../../scripts/map-geometry.mjs';
import { metersBetween, allowsFootAccess } from '../shared/map-routing';
import type { LngLat, MapGraph, MapPoint, MapAccessCandidate } from '../shared/map-v2';
export function fromLocal(e:number,n:number):LngLat { return transform([e+217000,n+3355200],'EPSG:32651','EPSG:4326') as LngLat; }
export function toLocal(c:LngLat):number[] { const p=transform(c,'EPSG:4326','EPSG:32651');return [p[0]-217000,p[1]-3355200]; }
function project(p:LngLat,a:LngLat,b:LngLat){const cos=Math.cos(p[1]*Math.PI/180),x=(b[0]-a[0])*cos,y=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*cos*x+(p[1]-a[1])*y)/(x*x+y*y||1)));return {t,q:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t] as LngLat};}
const cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const intersect=(a:number[],b:number[],c:number[],d:number[])=>cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(a[0],b[0])>=Math.min(c[0],d[0])&&Math.min(a[0],b[0])<=Math.max(c[0],d[0])&&Math.max(a[1],b[1])>=Math.min(c[1],d[1])&&Math.min(a[1],b[1])<=Math.max(c[1],d[1]);

/** Estimate only the selected references against the retained public obstacles.
 * Public supplements and personal overlays share the same limits. Graph splits
 * remain derived records; acquired geometry and files are never rewritten. */
export function estimateAccess(points:MapPoint[],graph:MapGraph,geography:any,changed:Set<string>,scope:'personal'|'public'='personal'):MapGraph {
  if(!changed.size)return graph;
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  const obstacles=(geography.features||[]).filter((f:any)=>!f.properties.undergroundStation&&['building','water','barrier','access-review-area'].includes(f.properties.kind));
  const reviewAreas=obstacles.filter((f:any)=>f.properties.kind==='access-review-area');
  // Layer orders crossings; only an explicit tunnel removes an open-water barrier.
  const flows=(geography.features||[]).filter((f:any)=>f.properties.kind==='waterway'&&!['culvert','yes'].includes(f.properties.tunnel))
    .flatMap((f:any)=>f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.type==='MultiLineString'?f.geometry.coordinates:[]);
  const walls=obstacles.filter((f:any)=>f.properties.kind==='barrier').flatMap((f:any)=>f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.type==='MultiLineString'?f.geometry.coordinates:[]);
  const gates=graph.nodes.filter(n=>n.barrier?.includes('gate'));
  const splits=new Map<string,{t:number;id:string}[]>();
  for(const place of points.filter(p=>changed.has(p.id))){
    const review=reviewAreas.find((f:any)=>contains(place.coordinate,f.geometry));
    if(review){place.accessCandidates=[];place.accessReviewBasis=review.properties.accessReviewBasis;continue;}
    delete place.accessReviewBasis;
    const station=place.undergroundStation&&!place.personal?.referencePoint;
    if(!station&&place.entrances.some(e=>e.connected))continue;
    const origins=station?place.entrances:[{id:'',name:'',coordinate:place.coordinate,source:'',structureId:undefined}];
    place.accessCandidates=station?(place.accessCandidates||[]).filter(candidate=>candidate.kind==='entrance'):[];
    for(const origin of origins){
      const start=origin.coordinate,candidates:{edge:MapGraph['edges'][number];t:number;q:LngLat;meters:number}[]=[];
      if(reviewAreas.some((f:any)=>contains(start,f.geometry)))continue;
      for(const edge of graph.edges){
        if(edge.conditions?.length||!allowsFootAccess(edge.foot))continue;const a=nodes.get(edge.from)!.coordinate,b=nodes.get(edge.to)!.coordinate;
        if(Math.abs((a[1]+b[1])/2-start[1])>Math.abs(a[1]-b[1])/2+.0008)continue;
        const {t,q}=project(start,a,b),meters=metersBetween(start,q);if(meters>80)continue;
        const blocked=obstacles.some((f:any)=>{
          if(!['Polygon','MultiPolygon'].includes(f.geometry.type))return false;
          if(f.properties.kind==='building'&&(f.id===place.id||f.id===origin.structureId||contains(start,f.geometry)))return false;
          return crossesInterior(start,q,f.geometry);
        })||walls.some((ring:number[][])=>ring.slice(1).some((d,i)=>intersect(start,q,ring[i],d)))
          ||flows.some((ring:number[][])=>ring.slice(1).some((d,i)=>intersect(start,q,ring[i],d)&&cross(ring[i],d,start)*cross(ring[i],d,q)<0))
          ||gates.some(g=>metersBetween(g.coordinate,project(g.coordinate,start,q).q)<1.5);
        if(!blocked)candidates.push({edge,t,q,meters});
      }
      const chosen:typeof candidates=[];
      for(const c of candidates.sort((a,b)=>a.meters-b.meters||a.edge.id.localeCompare(b.edge.id))){if(chosen.some(x=>metersBetween(x.q,c.q)<3))continue;chosen.push(c);if(chosen.length===6)break;}
      place.accessCandidates.push(...chosen.map((c,i):MapAccessCandidate=>{
        const suffix=origin.id?`${origin.id}/${i}`:String(i);
        const existing=splits.get(c.edge.id)?.find(split=>Math.abs(split.t-c.t)<1e-8);
        const id=c.t<1e-8?c.edge.from:c.t>1-1e-8?c.edge.to:existing?.id||`${scope}-access/${place.id}/${suffix}`;
        if(!nodes.has(id)){nodes.set(id,{id,coordinate:c.q});splits.set(c.edge.id,[...(splits.get(c.edge.id)||[]),{t:c.t,id}]);}
        return {id:`estimate/${place.id}/${suffix}`,entranceId:origin.id||undefined,nodeId:id,kind:'estimate',name:origin.id?`${origin.name}接入估计`:scope==='public'?'路网接入估计':'个人参考点接入估计',coordinate:c.q,coordinates:[start,c.q],meters:c.meters,source:origin.source?`${origin.source}; ${c.edge.way}`:c.edge.way,conditions:[],stairs:c.edge.stairs};
      }));
    }
  }
  const edges=graph.edges.flatMap(e=>{
    const split=splits.get(e.id);if(!split)return [e];const chain=[{t:0,id:e.from},...split,{t:1,id:e.to}].sort((a,b)=>a.t-b.t);
    return chain.slice(1).map((b,i)=>({...e,id:e.id+(scope==='public'?':public:':':profile:')+i,sourceEdge:e.sourceEdge||e.id,from:chain[i].id,to:b.id,meters:Math.max(1e-8,(b.t-chain[i].t)*e.meters)}));
  });
  return {...graph,nodes:[...nodes.values()],edges};
}
