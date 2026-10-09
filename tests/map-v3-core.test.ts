import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { WalkingGraph } from '../src/shared/map-routing';
import { CampusMapAdapter } from '../src/main/mapService';
import { initialSelection, selectionReducer } from '../src/renderer/map/map-state';
import type { MapGraph, MapPoint } from '../src/shared/map-v2';
import { restoreLandscapeDetailParents, restoreRecordedRoadDisplays } from '../src/shared/map-v3';
import { drawableTriangle, roofBoundaryEdges, type MeshVertex } from '../src/renderer/map/mesh-geometry';
import { GroundFill, groundFillPolygons, groundFillCoordinate, groundFillNodes } from '../src/renderer/map/ground-fills';
import earcut from 'earcut';
const service=new CampusMapAdapter('assets/map-v2');
const node=(id:string)=>({id,coordinate:[120.08,30.31] as [number,number]});
const edge=(id:string,from:string,to:string,meters:number,extra={})=>({id,from,to,meters,way:'way/test',name:'',oneway:false,stairs:false,bridge:false,gate:false,...extra});

const exactFillArea2=(points:number[][])=>points.reduce((sum,p,i)=>{
 const q=points[(i+1)%points.length],integer=(v:number)=>BigInt(v*2**149);
 return sum+integer(p[0])*integer(q[1])-integer(q[0])*integer(p[1]);
},0n);
const absArea=(v:bigint)=>v<0n?-v:v;
const drawnFillArea2=(vertices:ArrayLike<number>,indices:number[])=>{
 let sum=0n;for(let i=0;i<indices.length;i+=3)sum+=absArea(exactFillArea2(indices.slice(i,i+3).map(k=>[vertices[k*2],vertices[k*2+1]])));
 return sum;
};

test('西田径场窄铺装保留原坐标，填充不经过会折返的整数瓦片环',()=>{
 const feature=(service.dataset().geography as any).features.find((f:any)=>f.id==='way/161322822:apron');
 assert.ok(feature);const before=JSON.stringify(feature),polygons=groundFillPolygons(feature);
 assert.equal(polygons.length,1);assert.ok(polygons[0].indices.length);
 for(const p of polygons){const expected=absArea(exactFillArea2(p.rings[0]))-p.rings.slice(1).reduce((s,r)=>s+absArea(exactFillArea2(r)),0n);assert.equal(drawnFillArea2(p.vertices,p.indices),expected);}
 assert.equal(JSON.stringify(feature),before);
 // Synthetic self-crossing ring: the area predicate must reject it. Actual
 // source-derived failure witnesses stay in the local audit, not this fixture.
 const bad=[[0,0],[10,10],[0,10],[10,0],[0,0]];
 assert.notEqual(drawnFillArea2(bad.flat(),earcut(bad.flat())),absArea(exactFillArea2(bad)));
});

test('地面填充保留合法院落孔洞与分离的多部件',()=>{
 const feature:any={type:'Feature',id:'fixture/courtyard',properties:{kind:'building'},geometry:{type:'MultiPolygon',coordinates:[
  [[[120.078,30.306],[120.0784,30.306],[120.0784,30.3064],[120.078,30.3064],[120.078,30.306]],[[120.0781,30.3061],[120.0781,30.3063],[120.0783,30.3063],[120.0783,30.3061],[120.0781,30.3061]]],
  [[[120.079,30.306],[120.0791,30.306],[120.079,30.3061],[120.079,30.306]]]
 ]}};
 const polygons=groundFillPolygons(feature);assert.equal(polygons.length,2);assert.equal(polygons[0].rings.length,2);
 for(const p of polygons){const expected=absArea(exactFillArea2(p.rings[0]))-p.rings.slice(1).reduce((s,r)=>s+absArea(exactFillArea2(r)),0n);assert.equal(drawnFillArea2(p.vertices,p.indices),expected);}
 const p=polygons[0],outerArea=absArea(exactFillArea2(p.rings[0]));assert.notEqual(drawnFillArea2(p.vertices,p.indices),outerArea,'Filling the courtyard must fail');
});

test('同场馆已有交点在派生填充两侧共用，邻近独立边界不会被吸附',()=>{
 const data:any=service.dataset().geography,nodes=groundFillNodes(data);
 const edges=(polygons:ReturnType<typeof groundFillPolygons>)=>new Set(polygons.flatMap(p=>p.rings.flatMap(r=>r.slice(0,-1).map((a,i)=>[a.join(','),r[i+1].join(',')].sort().join('|')))));
 for(const id of ['way/161322822','relation/14296233']){
  const track=data.features.find((f:any)=>f.id===id),apron=data.features.find((f:any)=>f.id===id+':apron'),before=JSON.stringify(track);
  const a=edges(groundFillPolygons(track)),b=edges(groundFillPolygons(apron)),noded=edges(groundFillPolygons(track,nodes.get(id)));
  assert.ok([...noded].filter(e=>b.has(e)).length>[...a].filter(e=>b.has(e)).length,'Shared apron junctions must survive on both rings');
  assert.equal(JSON.stringify(track),before);
 }
 const feature:any={type:'Feature',id:'fixture/near',properties:{kind:'building'},geometry:{type:'Polygon',coordinates:[[[120.078,30.306],[120.0784,30.306],[120.0784,30.3064],[120.078,30.3064],[120.078,30.306]]]}};
 const plain=groundFillPolygons(feature),near=groundFillPolygons(feature,[{coordinate:[120.0782,30.306000001],owners:new Set(['fixture/neighbor'])}]);
 assert.deepEqual(near,plain,'A nearby separate edge is not a shared node');
 const fill=new GroundFill({id:'footprints',type:'fill',source:'geography'},{type:'FeatureCollection',features:[feature]},new Map());
 assert.notEqual(fill.id,'footprints','Do not collide with a native tile bucket during feature-state updates');
});

test('地面拾取反解实际透视矩阵，拒绝相机后方与裁切外位置',()=>{
 const matrix=new Float32Array([2,0,0,.25, 0,3,0,.125, 0,0,1,0, .1,-.2,0,1]);
 const x=.2,y=-.1,w=matrix[3]*x+matrix[7]*y+matrix[15];
 const screenX=((matrix[0]*x+matrix[4]*y+matrix[12])/w+1)*400;
 const screenY=(1-(matrix[1]*x+matrix[5]*y+matrix[13])/w)*300;
 const picked=groundFillCoordinate(matrix,800,600,screenX,screenY)!;
 assert.ok(Math.abs(picked[0]-x)<1e-14&&Math.abs(picked[1]-y)<1e-14);
 const behind=matrix.slice();behind[15]=-1;assert.equal(groundFillCoordinate(behind,800,600,400,300),undefined);
 const clipped=matrix.slice();clipped[14]=5;assert.equal(groundFillCoordinate(clipped,800,600,400,300),undefined);
});

test('零面积绘制面被拒绝，合法薄面、立墙和坏输入保持不同结果',()=>{
 assert.equal(drawableTriangle([[0,0,0],[0,0,0],[1,1,1]]),false);
 assert.equal(drawableTriangle([[0,0,0],[1,0,0],[2,0,0]]),false);
 assert.equal(drawableTriangle([[0,0,0],[1,0,0],[1,1e-12,0]]),true);
 assert.equal(drawableTriangle([[0,0,0],[0,1,0],[0,1,1]]),true);
 assert.throws(()=>drawableTriangle([[0,0,0],[1,0,0],[NaN,1,0]]));
 assert.throws(()=>drawableTriangle([[0,0,0],[1,0,0],[1e308,1,0]]));
});
test('重复屋顶三角面不消掉外边，共享三角剖分边不画成裂缝',()=>{
 const a:MeshVertex=[0,0,1],b:MeshVertex=[1,0,1],c:MeshVertex=[1,1,1],d:MeshVertex=[0,1,1];
 const edges=roofBoundaryEdges([{material:'roof',vertices:[a,b,c,a,c,d,c,b,a]}]);
 const keys=edges.map(e=>[e.a.join(','),e.b.join(',')].sort().join('|'));
 assert.equal(edges.length,4);assert.ok(!keys.includes([a.join(','),c.join(',')].sort().join('|')));
 assert.equal(roofBoundaryEdges([{material:'wall',vertices:[a,b,c]}]).length,0);
 assert.throws(()=>roofBoundaryEdges([{material:'roof',vertices:[a,b]}]));
});
test('现有岛上阶梯恢复到真实生成父对象，未知成员不能冒认归属',()=>{
 const raw=JSON.parse(fs.readFileSync('assets/map-v2/sports-details.geojson','utf8'));
 const display=JSON.parse(fs.readFileSync('assets/map-v2/display-geography.geojson','utf8'));
 const parents=new Set<string>(display.features.map(f=>String(f.id)));
 const original=JSON.stringify(raw),legacy=structuredClone(raw);
 for(const f of legacy.features)if(f.properties.kind==='landscape-step')delete f.properties.parentId;
 const restored=restoreLandscapeDetailParents(legacy,parents);
 assert.deepEqual(restored.features.map(f=>f.id),raw.features.map(f=>f.id));
 assert.deepEqual(restored.features.map(f=>f.geometry),raw.features.map(f=>f.geometry));
 const steps=restored.features.filter(f=>f.properties.kind==='landscape-step');
 assert.equal(steps.length,15);assert.ok(steps.every(f=>parents.has(f.properties.parentId)));
 assert.ok(legacy.features.filter(f=>f.properties.kind==='landscape-step').every(f=>!f.properties.parentId));
 assert.equal(JSON.stringify(raw),original);
 const payload=JSON.parse(service.serializedDataset());
 assert.ok(payload.sports.features.filter(f=>f.properties.kind==='landscape-step').every(f=>parents.has(f.properties.parentId)));
 const unknown={features:[{id:'island/amphitheatre-step-99',properties:{kind:'landscape-step'}},{id:'island/amphitheatre-step-01',properties:{kind:'landscape-step'}},{id:'island/waterfront-terrace-02',properties:{kind:'landscape-step'}},{id:'unmapped-step',properties:{kind:'landscape-step'}}]};
 assert.deepEqual(restoreLandscapeDetailParents(unknown,parents),unknown);
 assert.deepEqual(restoreLandscapeDetailParents(legacy,new Set()),legacy);
});

test('接入较近不一定总路程较短；终点代价也参与全局比较',()=>{
 const graph:MapGraph={version:'fixture',nodes:['a','b','x','y'].map(node),edges:[edge('ax','a','x',100),edge('by','b','y',8),edge('xy','x','y',60)]};
 const found=new WalkingGraph(graph).shortest(['a','b'],['x','y'],false,new Map([['a',1],['b',10]]),new Map([['x',1],['y',4]]));
 assert.equal(found?.meters,22);assert.deepEqual(found?.nodeIds,['b','y']);
});

test('一条源路的普通外段不会被待核内段一起隐藏，原图和未知仍保留',()=>{
 const raw=JSON.parse(fs.readFileSync('assets/map-v2/display-geography.geojson','utf8'));
 const graph=JSON.parse(fs.readFileSync('assets/map-v2/network.json','utf8')) as MapGraph;
 const before=JSON.stringify(raw),graphBefore=JSON.stringify(graph);
 const restored=restoreRecordedRoadDisplays(raw,graph);
 assert.equal(JSON.stringify(raw),before);assert.equal(JSON.stringify(graph),graphBefore);
 assert.deepEqual(restored.features.map(f=>f.id),raw.features.map(f=>f.id));
 const changed=restored.features.filter((f,i)=>JSON.stringify(f)!==JSON.stringify(raw.features[i]));
 assert.deepEqual(changed.map(f=>f.id),['way/411343656']);
 const f=changed[0],ordinary=graph.edges.filter(e=>e.way===f.id&&!e.conditions?.length),nodes=new Map(graph.nodes.map(n=>[n.id,n.coordinate]));
 assert.equal(f.properties.kind,'road');assert.equal(f.properties.sourceDisplayKind,'source-history');
 assert.deepEqual(f.properties.recordedDisplayEdgeIds,ordinary.map(e=>e.id));
 assert.equal(f.properties.conditionalSourceEdgeIds.length,4);
 assert.deepEqual(f.geometry.coordinates,[nodes.get(ordinary[0].from),...ordinary.map(e=>nodes.get(e.to))]);
 assert.equal(restored.features.filter(f=>f.properties.kind==='source-history').length,14);
 const payload=JSON.parse(service.serializedDataset());
 assert.deepEqual(payload.geography.features.find(x=>x.id===f.id),f);
 const fixture={features:[{id:'way/test',properties:{kind:'source-history'},geometry:{type:'LineString',coordinates:[[120.08,30.31],[120.081,30.31]]}}]};
 const sample:MapGraph={version:'fixture',nodes:[{id:'a',coordinate:[120.08,30.31]},{id:'b',coordinate:[120.081,30.31]},{id:'c',coordinate:[120.082,30.31]},{id:'d',coordinate:[120.083,30.31]}],edges:[edge('ab','a','b',1),edge('bc','b','c',1,{conditions:['site_unverified']}),edge('cd','c','d',1)]};
 const split=restoreRecordedRoadDisplays(fixture,sample).features[0];
 assert.equal(split.geometry?.type,'MultiLineString');
 assert.deepEqual(split.geometry?.coordinates,[[[120.08,30.31],[120.081,30.31]],[[120.082,30.31],[120.083,30.31]]]);
 assert.deepEqual(restoreRecordedRoadDisplays(fixture,{...sample,edges:sample.edges.map(e=>({...e,conditions:['site_unverified']}))}),fixture);
 assert.deepEqual(restoreRecordedRoadDisplays(fixture,{...sample,edges:[]}),fixture);
 const reverse=restoreRecordedRoadDisplays(fixture,{...sample,edges:[edge('ba','b','a',1,{oneway:true}),edge('cb','c','b',1,{oneway:true})]}).features[0];
 assert.equal(reverse.geometry?.type,'LineString');
 assert.deepEqual(reverse.geometry?.coordinates,[[120.082,30.31],[120.081,30.31],[120.08,30.31]]);
 assert.throws(()=>restoreRecordedRoadDisplays(fixture,{...sample,nodes:sample.nodes.filter(n=>n.id!=='a')}));
});
test('固定小图的Bellman-Ford与多起终点Dijkstra独立交叉验证',()=>{
 let seed=41729;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let round=0;round<60;round++){
  const nodes=Array.from({length:9},(_,i)=>node(String(i))),edges=[] as MapGraph['edges'];
  for(let i=0;i<9;i++)for(let j=i+1;j<9;j++)if(random()<.32)edges.push(edge(`${i}-${j}`,String(i),String(j),1+Math.floor(random()*30),{oneway:random()<.4,stairs:random()<.2,conditions:random()<.1?['gate_opening_unverified']:[]}));
  const source=new Map([['0',2],['1',8]]),target=new Map([['7',3],['8',13]]),avoid=round%2===0,conditional=round%3===0;
  const dist=new Map(nodes.map(n=>[n.id,source.get(n.id)??Infinity]));
  for(let i=0;i<nodes.length-1;i++)for(const e of edges){if(avoid&&e.stairs||!conditional&&e.conditions?.length)continue;dist.set(e.to,Math.min(dist.get(e.to)!,dist.get(e.from)!+e.meters));if(!e.oneway)dist.set(e.from,Math.min(dist.get(e.from)!,dist.get(e.to)!+e.meters));}
  const expected=Math.min(...[...target].map(([id,cost])=>dist.get(id)!+cost));const actual=new WalkingGraph({version:'small',nodes,edges}).shortest([...source.keys()],[...target.keys()],avoid,source,target,conditional);
  assert.equal(actual?.meters??Infinity,expected);
 }
});
test('门点假设和避台阶不能被缓存或上一条结果忽略',()=>{
 const g=new WalkingGraph({version:'gate',nodes:['a','b','c'].map(node),edges:[edge('gate','a','b',1,{conditions:['gate_opening_unverified']}),edge('stairs','a','c',5,{stairs:true}),edge('last','c','b',5)]});
 assert.equal(g.shortest(['a'],['b'])?.meters,10);assert.equal(g.shortest(['a'],['b'],true),null);assert.equal(g.shortest(['a'],['b'],true,new Map(),new Map(),true)?.meters,1);
});
test('浏览进入两点保留所选A；C只换终点；撤销重算且旧返回被拒',()=>{
 const a=service.search('东3教学楼')[0],b=service.search('东4教学楼')[0],c=service.search('西1教学楼')[0];
 let s=selectionReducer(initialSelection,{type:'choose',point:a});assert.equal(s.mode,'browse');s=selectionReducer(s,{type:'two'});assert.equal(s.origin?.id,a.id);assert.equal(s.stage,'destination');
 s=selectionReducer(s,{type:'choose',point:b});const revision=s.revision;s=selectionReducer(s,{type:'choose',point:c});assert.equal(s.origin?.id,a.id);assert.equal(s.destination?.id,c.id);
 const late=service.route({from:{kind:'place',id:a.id},to:{kind:'place',id:b.id}});assert.equal(selectionReducer(s,{type:'result',revision,route:late}),s);
 s=selectionReducer(s,{type:'undo'});assert.equal(s.destination?.id,b.id);assert.ok(s.revision>revision);assert.equal(s.route.status,'idle');
});
test('估计路线分解、选定真实门、同楼与超范围都有明确语义',()=>{
 const a=service.search('东3教学楼')[0],b=service.search('西1教学楼')[0],r=service.route({from:{kind:'place',id:a.id},to:{kind:'place',id:b.id}});
 assert.equal(r.status,'ready');assert.ok(r.distance!.connectorM>0);assert.ok(Math.abs(r.distance!.totalM-r.distance!.networkM-r.distance!.connectorM)<1e-6);assert.equal(r.destinationEntrance,undefined);assert.equal(r.destinationAccess?.kind,'estimate');
 assert.ok(r.segments?.some(s=>s.kind==='estimate'));assert.ok(!r.segments?.some(s=>s.conditions?.length));
 const door=service.search('东4教学楼')[0],fixed=door.accessCandidates!.find(c=>c.kind==='entrance')!;
 const chosen=service.route({from:{kind:'place',id:a.id},to:{kind:'place',id:door.id},destinationAccessId:fixed.id});assert.equal(chosen.destinationAccess?.id,fixed.id);
 assert.equal(service.route({from:{kind:'place',id:a.id},to:{kind:'place',id:a.id}}).status,'same');
 assert.equal(service.route({from:{kind:'place',id:a.id},to:{kind:'place',id:'missing'}}).status,'outside');
});
test('候选分段保持每条源路段总长，不因显示曲线改变路线权重',()=>{
 const graph=service.verificationGraph(),sums=new Map<string,number>();
 for(const e of graph.edges)sums.set(e.sourceEdge||e.id,(sums.get(e.sourceEdge||e.id)||0)+e.meters);
 const grouped=new Map<string,MapGraph['edges']>();for(const e of graph.edges)grouped.set(e.sourceEdge||e.id,[...(grouped.get(e.sourceEdge||e.id)||[]),e]);
 const raw=JSON.parse(gunzipSync(fs.readFileSync('assets/map-v2/source.osm.json.gz')).toString());const nodes=new Map(raw.elements.filter(e=>e.type==='node').map(e=>[String(e.id),e]));const ways=new Map(raw.elements.filter(e=>e.type==='way').map(e=>['way/'+e.id,e]));
 const sphere=(a:any,b:any)=>{const d=Math.PI/180,h=Math.sin((b.lat-a.lat)*d/2)**2+Math.cos(a.lat*d)*Math.cos(b.lat*d)*Math.sin((b.lon-a.lon)*d/2)**2;return 2*6371008.8*Math.asin(Math.sqrt(h));};
 for(const [id,length] of sums){const split=id.lastIndexOf(':'),way:any=ways.get(id.slice(0,split)),i=Number(id.slice(split+1));assert.ok(Math.abs(length-sphere(nodes.get(String(way.nodes[i])),nodes.get(String(way.nodes[i+1]))))<1e-5,id);}
 // Vertex count and a historic smoothing budget cannot judge the current
 // authored oval. This test protects source road weights independently of
 // the display treatment; appearance is reviewed in the running map.
});
test('跨来源数字编号不混用，真实场馆和未核圈长保持不同',()=>{
 const facts=JSON.parse(fs.readFileSync('assets/map-v2/shared-facts.json','utf8'));
 assert.ok(facts.officialToCanonical['1016']);assert.ok(Object.keys(facts.officialToCanonical).some(k=>k.startsWith('wfs/')));
 const west=facts.venues.find(v=>v.id==='way/161322822'),east=facts.venues.find(v=>v.id==='relation/14296233');assert.equal(west.loop,null);assert.equal(west.nominalLapM,400);assert.equal(east.nominalLapM,400);assert.ok(east.loop.coordinates.length>20);
 assert.notEqual(service.search('望月公寓')[0].id,service.search('桂花苑')[0].id);
});
test('本地个人配置不会流入公开模型工具；切换空配置后不保留别人的名字',()=>{
 const dir=fs.mkdtempSync(path.resolve('.test-data/map-v3-core-'));fs.mkdirSync(path.join(dir,'profiles'));fs.writeFileSync(path.join(dir,'profiles/config.json'),JSON.stringify({active:'one'}));
 fs.writeFileSync(path.join(dir,'profiles/one.json'),JSON.stringify({profile_name:'测试',records:{1016:{name:'独有测试别名',note:'仅本机测试备注'}},roles:{home:{place_id:'1016',label:'测试住处'}}}));
 const map=new CampusMapAdapter('assets/map-v2',{profileDirectory:dir});assert.equal(map.search('独有测试别名').length,1);assert.equal(map.publicView().search('独有测试别名').length,0);assert.ok(map.publicView().allPoints().every(p=>!p.personal));
 const localPayload=JSON.parse(map.serializedDataset());assert.ok(localPayload.places.some(p=>p.personal?.note==='仅本机测试备注'));assert.equal(localPayload.manifest.version,service.overview().version);assert.ok(localPayload.geography.features.some(f=>f.properties?.surfaceModel?.parts?.length));
 const publicPayload=JSON.parse(map.publicView().serializedDataset());assert.ok(publicPayload.places.every(p=>!p.personal));
 fs.writeFileSync(path.join(dir,'profiles/two.json'),JSON.stringify({profile_name:'空白',records:{},roles:{}}));fs.writeFileSync(path.join(dir,'profiles/config.json'),JSON.stringify({active:'two'}));assert.equal(map.search('独有测试别名').length,0);assert.equal(map.search('测试住处').length,0);
 const emptyPayload=JSON.parse(map.serializedDataset());assert.equal(emptyPayload.manifest.profileName,'空白');assert.ok(emptyPayload.places.every(p=>!p.personal));
});
test('一次性参考点不会改写公共图；失效定位不生成位置路线',()=>{
 const target=service.search('东4教学楼')[0],count=service.walking.nodes.size;
 const ref={id:'reference/public-test',name:'模拟参考点',coordinate:service.search('东3教学楼')[0].coordinate};
 const result=service.routeReferences({from:{kind:'place',id:ref.id},to:{kind:'place',id:target.id}},[ref]);assert.equal(result.route.status,'ready');assert.ok(result.route.distance!.connectorM>0);assert.equal(service.walking.nodes.size,count);assert.equal(service.point(ref.id),undefined);
 const stale=service.route({from:{kind:'current',fix:{coordinate:ref.coordinate,accuracy:10,timestamp:Date.now()-130000,crs:'EPSG:4326',source:'test',deviceLabel:'测试'}},to:{kind:'place',id:target.id}});assert.equal(stale.status,'origin_confirmation');assert.equal(stale.coordinates.length,0);
});
