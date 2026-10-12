import * as ml from 'maplibre-gl';
import type { FeatureCollection, Feature, Position } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import latinFont from '@fontsource-variable/noto-sans-sc/files/noto-sans-sc-latin-wght-normal.woff2?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fromLonLat, toLonLat } from 'ol/proj';
import type { LocationFix, MapPoint, MapRouteResult, LngLat } from '../../shared/map-v2';
import { metersBetween } from '../../shared/map-routing';
import { CameraOwnership } from './map-state';
import { darkMapPalette, lightMapPalette, type MapPalette } from './map-theme';
import { PlanarCampusMap } from './planar-map';
import { cartographyLayers, type MapDirection } from './cartography';
import { VolumeEdges } from './volume-edges';
import { RoofSurfaces } from './roof-surfaces';
import { GroundFill } from './ground-fills';
import { GroundStroke,groundStrokeLayers } from './ground-strokes';
import { endpointCaptionGap, pairedCaptionSides, mapFitInsets, mapLabelObstructions, observeLabelObstructions, measureCaptions, type FitInsets } from './fit-layout';
import { nativeCaptionBounds } from './native-caption-bounds';
import { labelAnchors as makeLabelAnchors,type LabelAnchor } from './label-anchors';
import {namedWaterAreas,namedWaterShores,namedWaterHit} from './named-water';
import type { SavedCamera, MapData, MapCallbacks } from './planar-map';
export type { SavedCamera, MapData, MapCallbacks } from './planar-map';
export { PlanarCampusMap } from './planar-map';
export type CampusMapEngine = SpatialCampusMap | PlanarCampusMap;
ml.setWorkerUrl(workerUrl);
const empty = (): FeatureCollection => ({type:'FeatureCollection',features:[]});
const collection = (features: Feature[]): FeatureCollection => ({type:'FeatureCollection',features});
const line = (coordinates: LngLat[], properties: Record<string,unknown> = {}): Feature => ({type:'Feature',geometry:{type:'LineString',coordinates},properties});
const point = (coordinate: LngLat, properties: Record<string,unknown> = {}): Feature => ({type:'Feature',geometry:{type:'Point',coordinates:coordinate},properties});
const kind = (name: string): any => ['==',['get','kind'],name];
const rgba=(hex:string,a:number)=>`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;

export function createCampusMap(target: HTMLDivElement,data: MapData,callbacks: MapCallbacks,saved?:SavedCamera):CampusMapEngine {
  try { return new SpatialCampusMap(target,data,callbacks,saved); }
  catch { target.replaceChildren();target.dataset.compatibility='WebGL不可用，已使用同一数据的平面视图';return new PlanarCampusMap(target,data,callbacks,saved); }
}

/** Data arrivals only change sources. Camera mutations require direct input or
 * an explicit control. Geometry, hit testing and all overlays share one camera. */
export class SpatialCampusMap {
  readonly supportsSpace=true;
  readonly ownership=new CameraOwnership();
  readonly map: ml.Map;
  private points = new Map<string,MapPoint>();
  private waterAreas:Feature[]=[];
  private waterShores=new Map<string,Feature>();
  private loaded=false;
  private pendingData=false;
  private disposed=false;
  private selected?:string;
  private origin?:string;
  private selectionPoints=new Map<string,MapPoint>();
  private captionEntries:Feature[]=[];
  private captionSides:boolean[]=[false,false];
  private routeRoles=true;
  private hovered?:string;
  private hoverFrame=0;
  private hoverMotion=new Map<string,{value:number;target:number}>();
  private timer?:ReturnType<typeof setTimeout>;
  private routeResult?:MapRouteResult;
  private entrancesVisible=false;
  private palette:MapPalette;
  private reduced=matchMedia('(prefers-reduced-motion: reduce)');
  private detail=false;
  private near=false;
  private fine=false;
  private volumeOpacity=-1;
  private renders=0;
  private cleanup:(()=>void)[]=[];
  private resize:ResizeObserver;
  private started=performance.now();
  private ghostIds:string[]=[];
  private pendingLocation?:LocationFix;
  private rims?:VolumeEdges;
  private roofs?:RoofSurfaces;
  private groundFills=new Map<string,GroundFill>();
  private groundStrokes=new Map<string,GroundStroke>();
  private groundStates=new Map<string,Record<string,boolean|number>>();
  private occupancyKey='';
  private occupancyImages=new Set<string>();
  private labelAnchors=new Map<string,LabelAnchor>();
  private labelMode:'ground'|'roof'|'callout'='roof';
  private labelsRaised?:boolean;
  private hiddenNames=new Set<string>();
  private labelOcclusionKey='';
  private lastCameraMove=-Infinity;
  private occlusionTimer?:ReturnType<typeof setTimeout>;
  private routeFitRefine?:()=>void;
  private revealFrame=0;
  private routeKey="";
  private routeMeasures:{coordinate:LngLat;meters:number}[]=[];
  constructor(private target:HTMLDivElement,public data:MapData,private callbacks:MapCallbacks,saved?:SavedCamera,private direction:MapDirection='relief') {
    this.points=new Map(data.places.map(p=>[p.id,p]));
    this.waterAreas=namedWaterAreas(data.geography as FeatureCollection);
    this.waterShores=namedWaterShores(data.geography as FeatureCollection);
    this.labelAnchors=makeLabelAnchors(data.geography as FeatureCollection,data.places);
    this.palette=document.documentElement.dataset.theme==='dark'?darkMapPalette:lightMapPalette;
    target.dataset.version=data.manifest.version;
    const center=saved?toLonLat(saved.center) as LngLat:[(data.manifest.campusBounds[0]+data.manifest.campusBounds[2])/2,(data.manifest.campusBounds[1]+data.manifest.campusBounds[3])/2] as LngLat;
    this.map=new ml.Map({container:target,center,zoom:saved?Math.log2(78271.51696402048/saved.resolution):15.4,bearing:saved?-saved.rotation*180/Math.PI:0,pitch:saved?.pitch||0,
      pixelRatio:Math.min(2,devicePixelRatio),minZoom:12.5,maxZoom:20,maxPitch:55,bearingSnap:0,renderWorldCopies:false,attributionControl:false,
      canvasContextAttributes:{antialias:true},localIdeographFontFamily:'"Noto Sans SC Variable", "Microsoft YaHei", sans-serif',
      scrollZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,style:this.style(),fadeDuration:this.reduced.matches?0:120,
      maxBounds:[[data.manifest.bounds[0]-.01,data.manifest.bounds[1]-.01],[data.manifest.bounds[2]+.01,data.manifest.bounds[3]+.01]],
    });
    target.dataset.renderer='maplibre-6.11.2';
    this.map.getCanvas().tabIndex=-1;
    this.map.on('load',()=>{
      if(this.disposed)return;
      this.loaded=true;
      if(this.pendingData){this.pendingData=false;this.source('geography',this.geography());this.source('names',this.names());this.source('sports',(this.data.sports||empty()) as FeatureCollection);}
      this.installGroundLayers();
      this.installSurfaces();
      this.updateLabelObstructions();
      if(!saved&&!this.ownership.interacted)this.fit(this.data.manifest.campusBounds,0,16.2);
      this.updateDetail();this.refreshSelection();this.route(this.routeResult);this.location(this.pendingLocation);
      target.dataset.ready='true';target.dataset.loadMs=(performance.now()-this.started).toFixed(1);callbacks.ready();this.report();
    });
    this.map.on('render',()=>{if(this.disposed)return;target.dataset.renders=String(++this.renders);this.updateNameOcclusion();this.report();});
    this.map.on('move',()=>{this.lastCameraMove=performance.now();this.updateDetail();this.updateCaptionSides();this.updateLabelObstructions();this.report();});
    this.map.on('moveend',()=>this.scheduleOcclusion());
    this.map.on('error',e=>{target.dataset.lastError=String(e.error?.message||e.error);if(!this.loaded)callbacks.error?.('地图绘制资源未能载入；可以重新载入。');});
    this.map.on('webglcontextlost',()=>{this.loaded=false;target.dataset.context='lost';target.dataset.ready='false';});
    this.map.on('webglcontextrestored',()=>{
      if(this.disposed)return;
      target.dataset.context='restoring';
      // MapLibre rebuilds its serialized style, which cannot retain custom
      // layers. Rebind the current public snapshot without changing the camera.
      this.map.once('style.load',()=>{
        if(this.disposed)return;
        this.loaded=true;this.pendingData=false;this.volumeOpacity=-1;this.labelsRaised=undefined;this.labelOcclusionKey='';this.hiddenNames.clear();
        // The rebuilt sources also lost their derived cutaway feature state.
        // Recompute it even when the visible occluder IDs stay the same.
        this.ghostIds=[];
        this.installGroundLayers();this.installSurfaces();
        this.occupancyKey='';this.updateLabelObstructions();
        for(const [id,state] of this.groundStates)this.map.setFeatureState({source:'geography',id},state);
        this.refreshSelection();this.route(this.routeResult);this.location(this.pendingLocation);
        target.dataset.context='restored';target.dataset.ready='true';this.report();
      });
      this.map.setStyle(this.style(),{diff:false});
    });
    const take=()=>{target.focus({preventScroll:true});this.takeControl();callbacks.user();this.hover(undefined);};
    target.addEventListener('pointerdown',take,{capture:true});
    const wheel=(e:WheelEvent)=>{
      if(!this.loaded || e.defaultPrevented)return;
      e.preventDefault();take();
      // Only wheel processing is replaced after comparison. Pan and pinch are
      // engine-native. No batch wait, chasing easing or queued reverse tail.
      const unit=e.deltaMode===1?40:e.deltaMode===2?target.clientHeight:1;
      const delta=Math.max(-450,Math.min(450,e.deltaY*unit));if(!delta)return;
      const rect=target.getBoundingClientRect();const anchor=this.map.unproject([e.clientX-rect.left,e.clientY-rect.top]);
      this.map.easeTo({zoom:this.map.getZoom()-delta/450,around:anchor,duration:0});
      target.dataset.lastInput=JSON.stringify({at:performance.now(),delta:e.deltaY,deltaMode:e.deltaMode,kind:'wheel'});
    };
    target.addEventListener('wheel',wheel,{passive:false});
    const keyboard=(e:KeyboardEvent)=>this.keyboard(e);target.addEventListener('keydown',keyboard);
    const leave=()=>this.hover(undefined);target.addEventListener('pointerleave',leave);
    const blur=()=>{this.map.stop();this.hover(undefined);};window.addEventListener('blur',blur);
    this.cleanup.push(()=>target.removeEventListener('pointerdown',take,true),()=>target.removeEventListener('wheel',wheel),()=>target.removeEventListener('keydown',keyboard),()=>target.removeEventListener('pointerleave',leave),()=>window.removeEventListener('blur',blur));
    this.map.on('mousemove',e=>{if(this.map.isMoving())return;const points=this.hit(e.point);target.style.cursor=points.length?'pointer':'grab';this.hover(points[0]);});
    this.map.on('click',e=>{
      const touch=e.originalEvent instanceof TouchEvent || (e.originalEvent instanceof PointerEvent && e.originalEvent.pointerType==='touch');
      const points=this.hit(e.point,touch?9:0);
      if(points.length>1 && touch)callbacks.candidates(points.slice(0,6));else if(points[0])callbacks.choose(points[0]);else callbacks.blank();
    });
    const theme=()=>{this.palette=document.documentElement.dataset.theme==='dark'?darkMapPalette:lightMapPalette;if(this.loaded)this.applyTheme();};
    const observer=new MutationObserver(theme);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});this.cleanup.push(()=>observer.disconnect());
    const reduced=()=>{if(this.reduced.matches)this.map.stop();};this.reduced.addEventListener('change',reduced);this.cleanup.push(()=>this.reduced.removeEventListener('change',reduced));
    this.resize=new ResizeObserver(()=>{if(!this.disposed){const ratio=Math.min(2,devicePixelRatio);if(Math.abs(this.map.getPixelRatio()-ratio)>.01)this.map.setPixelRatio(ratio);else this.map.resize();this.report();}});this.resize.observe(target);
    this.cleanup.push(observeLabelObstructions(target,()=>this.updateLabelObstructions()));
  }
  private names():FeatureCollection {
    return collection([...this.points.values()].filter(p=>!p.displayName.startsWith('未命名')&&!p.roadReference&&(!p.historicalReference||!!p.personal)).map(p=>{const anchor=this.labelMode==='ground'?undefined:this.labelAnchors.get(p.id);return {...point(anchor?.coordinate||p.coordinate,{id:p.id,name:this.caption(p),kind:p.kind,scope:p.scope,labelHeight:anchor?.height||0,surfaceLabel:!!p.modelBasis,priority:this.namePriority(p)}),id:p.id};}));
  }
  private narrowLongName(p:MapPoint){return p.kind==='building'&&p.geometryStatus==='mapped'&&p.displayName.length>8&&Math.min((p.bounds[2]-p.bounds[0])*111320*Math.cos(p.coordinate[1]*Math.PI/180),(p.bounds[3]-p.bounds[1])*110574)<22;}
  private caption(p:MapPoint){
    if(p.personal)return p.displayName;
    const local=p.scope==='campus'?p.displayName.replace(/^浙江大学[（(]?紫金港(?:校区)?[）)]?[-·\s]*/,'').replace(/^紫金港校区/,''):p.displayName;
    if(!this.narrowLongName(p))return local||p.displayName;
    return p.aliases.filter(n=>n.length>=2&&n.length<=6&&(n.match(/[\u3400-\u9fff]/g)?.length||0)>=2).sort((a,b)=>a.length-b.length)[0]||local||p.displayName;
  }
  private namePriority(p:MapPoint){return this.narrowLongName(p)?6:p.scope==='context'?5:/图书馆|田径场|月牙楼|食堂|求是大讲堂/.test(p.displayName)?0:p.kind==='area'?1:p.geometryStatus==='reference-point'?4:2;}
  private geography():FeatureCollection {
    // The mesh belongs only to the custom GPU layer. Exclude it before copying
    // properties for MapLibre, rather than cloning it just to throw it away.
    const data=collection((this.data.geography as FeatureCollection).features.map(f=>{
      const {surfaceModel,...properties}=f.properties||{};
      return {...f,geometry:structuredClone(f.geometry),properties:{...structuredClone(properties),...(surfaceModel?{surfaceModel:true}:properties.kind==='building'&&Number(properties.heightM)>0?{untiledVolume:true}:{}),id:String(f.id)}};
    }));
    const ids=new Set(data.features.map(f=>String(f.id)));
    for(const f of data.features){f.properties={...f.properties,id:String(f.id)};
      // Custom roof geometry belongs to its GPU layer. Keeping large vertex
      // arrays in tiled feature properties would copy them during hit queries.
      if(f.properties.surfaceModel)f.properties.surfaceModel=true;
      const p=this.points.get(String(f.id));if(p&&f.geometry.type==='Point'){f.geometry.coordinates=p.coordinate;}}
    for(const p of this.points.values())if(!ids.has(p.id)&&p.personal)data.features.push({...point(p.coordinate,{kind:'reference',name:p.displayName,scope:'campus'}),id:p.id});
    return data;
  }
  private style(includeNativeGroundLayers=false):ml.StyleSpecification {
    const p=this.palette,selected:any=['any',['boolean',['feature-state','selected'],false],['boolean',['feature-state','origin'],false]],hovered:any=['boolean',['feature-state','hover'],false];
    const sports=this.data.sports as FeatureCollection||empty();
    const layers=cartographyLayers(p,this.direction).filter(layer=>includeNativeGroundLayers||!((layer.type==='fill'&&['geography','sports'].includes(layer.source))||groundStrokeLayers.has(layer.id)));
    return {version:8,'font-faces':{Campus:latinFont},light:{anchor:'map',color:'#fff6e8',intensity:.42,position:[1.25,225,45]},sources:{geography:{type:'geojson',data:this.geography(),promoteId:'id',tolerance:.02,maxzoom:20},sports:{type:'geojson',data:sports,tolerance:.02,maxzoom:20},names:{type:'geojson',data:this.names(),promoteId:'id'},route:{type:'geojson',data:empty(),tolerance:0},selection:{type:'geojson',data:empty()},preview:{type:'geojson',data:empty(),tolerance:0},reveal:{type:'geojson',data:empty(),tolerance:0},entrances:{type:'geojson',data:empty()},location:{type:'geojson',data:empty()},'control-occupancy':{type:'geojson',data:empty(),tolerance:0,maxzoom:24}},layers};
  }
  private updateLabelObstructions(){
    if(!this.loaded||this.disposed)return;
    const boxes=mapLabelObstructions(this.target),key=JSON.stringify([boxes,this.map.getCenter().toArray(),this.map.getZoom(),this.map.getBearing(),this.map.getPitch()]);
    if(key===this.occupancyKey)return;this.occupancyKey=key;
    const images=new Set<string>(),features:Feature[]=[];
    // A ground symbol away from the camera centre is perspective-scaled even
    // with viewport alignment. Keep each reservation at the view centre and
    // use its pixel offset, so its collision rectangle stays the DOM size.
    const coordinate=this.map.getCenter().toArray(),centre=this.map.project(coordinate);
    for(const box of boxes){
      const width=Math.ceil(box.width),height=Math.ceil(box.height),image=`control-occupancy-${box.id}-${width}x${height}`;
      images.add(image);if(!this.map.hasImage(image))this.map.addImage(image,{width,height,data:new Uint8Array(width*height*4)});
      features.push(point(coordinate,{kind:'control-occupancy',image,offset:[(box.left+box.right)/2-centre.x,(box.top+box.bottom)/2-centre.y]}));
    }
    this.source('control-occupancy',collection(features));
    for(const image of this.occupancyImages)if(!images.has(image)&&this.map.hasImage(image))this.map.removeImage(image);
    this.occupancyImages=images;
  }
  private installGroundLayers(){
    const layers=cartographyLayers(this.palette,this.direction);
    for(const [i,specification] of layers.entries()){
      const fill=specification.type==='fill'&&['geography','sports'].includes(specification.source),stroke=specification.type==='line'&&groundStrokeLayers.has(specification.id);
      if(!fill&&!stroke)continue;
      const data=(specification.source==='geography'?this.data.geography:specification.source==='sports'?this.data.sports||empty():empty()) as FeatureCollection;
      const layer=fill?new GroundFill(specification as ml.FillLayerSpecification,data,this.groundStates):new GroundStroke(specification as ml.LineLayerSpecification,data,this.groundStates);
      const before=layers.slice(i+1).map(layer=>this.groundFills.get(layer.id)?.id||this.groundStrokes.get(layer.id)?.id||layer.id).find(id=>this.map.getLayer(id));
      const previous=this.groundFills.get(specification.id)||this.groundStrokes.get(specification.id);
      if(previous&&this.map.getLayer(previous.id))this.map.removeLayer(previous.id);
      this.map.addLayer(layer,before);if(fill)this.groundFills.set(specification.id,layer as GroundFill);else this.groundStrokes.set(specification.id,layer as GroundStroke);
    }
    this.target.dataset.groundRenderer='untiled-float32';
  }
  private installSurfaces(){
    this.rims=new VolumeEdges(this.data.geography as FeatureCollection,this.palette);this.map.addLayer(this.rims,'route-glow');
    this.roofs=new RoofSurfaces(this.data.geography as FeatureCollection,this.palette,this.groundStates,this.direction==='focus'?.3:this.direction==='atlas'?.62:.86);this.map.addLayer(this.roofs,'volume-rims');
  }
  private applyTheme(){const next=this.style(true);this.volumeOpacity=-1;for(const layer of next.layers){const fill=this.groundFills.get(layer.id),stroke=this.groundStrokes.get(layer.id);if(fill&&layer.type==='fill')fill.updateStyle(layer);else if(stroke&&layer.type==='line')stroke.updateStyle(layer);else for(const [key,value] of Object.entries(layer.paint||{}))this.map.setPaintProperty(layer.id,key as Parameters<ml.Map['setPaintProperty']>[1],value);}this.map.setLight(next.light!);this.refreshSelection();this.updateDetail(true);}
  private source(name:string,data:FeatureCollection){if(this.loaded&&!this.disposed){(this.map.getSource(name) as ml.GeoJSONSource)?.setData(data);if(name==='selection')this.groundStrokes.get('selected-shore')?.updateData(data);}}
  private hit(pixel:ml.Point,tolerance=0):MapPoint[]{
    if(!this.loaded)return [];
    const query=tolerance?[[pixel.x-tolerance,pixel.y-tolerance],[pixel.x+tolerance,pixel.y+tolerance]]:pixel;
    const native=this.map.queryRenderedFeatures(query as any,{layers:['names','endpoint-names','browse-name','water-names','endpoints','volumes','ghosts','references']});
    const ground=['footprints','sports-fill'].flatMap(id=>(this.groundFills.get(id)?.query(pixel.x,pixel.y,tolerance)||[]).map(f=>({...f,properties:{...f.properties,id:String(f.id)} as Record<string,any>,layer:{id}})));
    const fs=[...native,...ground];
    const marker=fs.find(f=>f.layer.id==='endpoints');
    const markedPoint=marker&&this.selectionPoint(String(marker.properties.id||marker.id));
    if(markedPoint)return [markedPoint];
    const caption=fs.find(f=>['names','endpoint-names','browse-name','water-names'].includes(f.layer.id)&&!!this.selectionPoint(String(f.properties.id||f.id))&&!(f.layer.id==='names'&&this.hiddenNames.has(String(f.properties.id||f.id))));
    const captionPoint=caption&&this.selectionPoint(String(caption.properties.id||caption.id));
    const geometries=fs.filter(f=>!['names','endpoint-names','browse-name','water-names'].includes(f.layer.id)&&!this.ghostIds.includes(String(f.properties.id||f.id)));
    // A temporary cutaway reveals the object below it. Its subdued caption
    // remains an explicit way to select the occluder itself.
    let roof=this.roofs?.pickHit(pixel.x,pixel.y,undefined,false);
    if(roof){
      const native=new Set(geometries.filter(f=>f.layer.id==='volumes').map(f=>String(f.properties.id||f.id)));
      for(const id of native){const depth=this.roofs!.nativeDepth(id,pixel.x,pixel.y);if(depth<roof.depth)roof={id,depth};}
      if(captionPoint&&(['endpoint-names','browse-name'].includes(caption?.layer.id||'')||captionPoint.id===roof.id||this.ghostIds.includes(captionPoint.id)))return [captionPoint];
      return this.points.has(roof.id)?[this.points.get(roof.id)!]:[];
    }
    const ids=[...new Set(geometries.filter(f=>f.layer.id!=='references'||String(f.id)===this.selected||String(f.id)===this.origin).map(f=>String(f.properties.venueId||f.properties.id||f.id)).filter(id=>this.points.has(id)))];
    // A long caption's hit box must not steal a click inside its neighbouring
    // building. Captions remain direct targets on their own body or background.
    const visibleBuilding=ids.find(id=>this.points.get(id)?.kind==='building');
    if(captionPoint&&(['endpoint-names','browse-name'].includes(caption?.layer.id||'')||captionPoint.id===visibleBuilding||this.ghostIds.includes(captionPoint.id)||!visibleBuilding))return [captionPoint];
    if(!visibleBuilding){
      const cutaway=this.roofs?.pickHit(pixel.x,pixel.y);
      const id=cutaway&&this.ghostIds.includes(cutaway.id)?cutaway.id:fs.find(f=>f.layer.id==='ghosts')?.properties.id;
      if(id&&this.points.has(String(id)))return [this.points.get(String(id))!];
    }
    if(!ids.length){
      const bridge=this.map.queryRenderedFeatures(pixel,{layers:['bridge-ground']}).some(f=>f.properties.bridge==='yes');
      if(!bridge&&this.groundFills.get('water')?.query(pixel.x,pixel.y).length){const c=this.map.unproject(pixel),water=namedWaterHit(this.waterAreas,this.points,[c.lng,c.lat]);if(water)return [water];}
    }
    return ids.map(id=>this.points.get(id)!).sort((a,b)=>Number(b.kind==='building')-Number(a.kind==='building'));
  }
  private state(id:string|undefined,value:Record<string,boolean|number>){if(id&&!this.disposed){this.groundStates.set(id,{...this.groundStates.get(id),...value});if(this.loaded)this.map.setFeatureState({source:'geography',id},value);}}
  private hover(p?:MapPoint){
    if(p?.id===this.hovered)return;clearTimeout(this.timer);this.callbacks.hover(undefined);
    if(this.hovered){this.state(this.hovered,{hover:false});const v=this.hoverMotion.get(this.hovered)?.value||0;this.hoverMotion.set(this.hovered,{value:v,target:0});}
    this.hovered=p?.id;
    this.roofs?.update(this.palette,[this.selected,this.origin].filter(Boolean) as string[],this.ghostIds,this.hovered);
    if(p){this.state(p.id,{hover:true});this.hoverMotion.set(p.id,{value:this.hoverMotion.get(p.id)?.value||0,target:1});this.timer=setTimeout(()=>{if(!this.disposed&&this.hovered===p.id)this.callbacks.hover(p);},220);}
    cancelAnimationFrame(this.hoverFrame);let last=performance.now();
    const step=(now:number)=>{if(this.disposed)return;const blend=this.reduced.matches?1:1-Math.exp(-Math.max(16,now-last)/42);last=now;let active=false;
      for(const [id,v] of this.hoverMotion){v.value+=(v.target-v.value)*blend;if(Math.abs(v.target-v.value)<.01)v.value=v.target;else active=true;this.state(id,{hoverValue:v.value});if(!v.value&&!v.target)this.hoverMotion.delete(id);}
      if(active)this.hoverFrame=requestAnimationFrame(step);};step(last);
  }
  private selectionPoint(id:string){const point=this.selectionPoints.get(id);return point?.graphNodeId?point:this.points.get(id)||point;}
  select(destination?:MapPoint,origin?:MapPoint,routeRoles=true){this.state(this.selected,{selected:false});this.state(this.origin,{origin:false});this.selected=destination?.id;this.origin=origin?.id;this.selectionPoints=new Map([destination,origin].filter((p):p is MapPoint=>!!p).map(p=>[p.id,p]));this.captionSides=[false,false];this.routeRoles=routeRoles;this.refreshSelection();this.updateOcclusion();}
  private pairedSides(){return pairedCaptionSides(this.captionEntries.map(f=>{const p=this.map.project((f.geometry as GeoJSON.Point).coordinates as LngLat);return {pixel:[p.x,p.y],name:String(f.properties?.name||'')};}),{font:'13px "Noto Sans SC Variable", "Microsoft YaHei", sans-serif',size:13,offsetY:0,padding:2,marker:13.5,maxWidthEm:14},this.captionSides);}
  private updateCaptionSides(){if(!this.loaded||!this.routeRoles)return;const next=this.pairedSides();if(next.some((v,i)=>v!==this.captionSides[i])){this.captionSides=next;this.refreshSelection();}}
  private refreshSelection(){
    if(!this.selectionPoints.get(this.selected||'')?.graphNodeId)this.state(this.selected,{selected:true});
    if(!this.selectionPoints.get(this.origin||'')?.graphNodeId)this.state(this.origin,{origin:true});
    this.rims?.update(this.palette,[this.selected,this.origin].filter(Boolean) as string[],this.ghostIds);
    this.roofs?.update(this.palette,[this.selected,this.origin].filter(Boolean) as string[],this.ghostIds,this.hovered);
    const fs:Feature[]=[];for(const [role,id] of [['A',this.origin],['B',this.selected]]){const p=id&&this.selectionPoint(id);if(p){
      const access=this.routeResult?.status==='ready'?(role==='A'?this.routeResult.originAccess:this.routeResult.destinationAccess):undefined,coordinate=access?.kind==='entrance'?access.coordinate:p.coordinate;
      const anchor=this.routeRoles||this.labelMode==='ground'||p.graphNodeId?undefined:this.labelAnchors.get(p.id);
      const hasBodyLabel=!!anchor&&(p.kind==='building'||!!p.modelBasis)&&p.geometryStatus==='mapped'&&!p.personal?.referencePoint;
      const water=!this.routeRoles&&p.kind==='water',shore=water&&this.waterShores.get(p.id);
      if(shore)fs.push({...shore,properties:{kind:'selection-water'}});
      const hasMarker=this.routeRoles||(!hasBodyLabel&&!water);
      if(hasMarker)fs.push(point(coordinate,{id:p.id,kind:'selection-marker',role:this.routeRoles?role:''}));
      fs.push(point(anchor?.coordinate||coordinate,{id:p.id,kind:'selection-name',name:this.routeRoles?p.displayName:this.caption(p),role:this.routeRoles?role:'',hasMarker,labelHeight:anchor?.height||0}));
    }}
    this.captionEntries=this.routeRoles?fs.filter(f=>f.properties?.kind==='selection-name'):[];
    this.captionSides=this.pairedSides();this.captionEntries.forEach((f,i)=>{f.properties!.captionBelow=this.captionSides[i];});
    this.source('selection',collection(fs));this.refreshEntrances();this.updateDetail(true);
  }
  updatePlaces(places:MapPoint[]){this.points=new Map(places.map(p=>[p.id,p]));this.labelAnchors=makeLabelAnchors(this.data.geography as FeatureCollection,places);this.labelOcclusionKey='';this.source('names',this.names());this.source('geography',this.geography());this.refreshSelection();}
  updateData(data:MapData){
    if(this.disposed)return;
    this.data=data;this.points=new Map(data.places.map(p=>[p.id,p]));
    this.target.dataset.version=data.manifest.version;
    this.waterAreas=namedWaterAreas(data.geography as FeatureCollection);this.waterShores=namedWaterShores(data.geography as FeatureCollection);
    this.labelAnchors=makeLabelAnchors(data.geography as FeatureCollection,data.places);this.labelOcclusionKey='';this.labelsRaised=undefined;
    if(!this.loaded){this.pendingData=true;return;}
    // Keep the map, input handlers and camera alive. Only replace the sources
    // and authored geometry that depend on this complete public snapshot.
    this.stopReveal();this.source('preview',empty());
    for(const id of ['roof-surfaces','volume-rims'])if(this.map.getLayer(id))this.map.removeLayer(id);
    this.source('geography',this.geography());this.source('names',this.names());this.source('sports',(data.sports||empty()) as FeatureCollection);
    this.installGroundLayers();
    this.installSurfaces();
    this.refreshSelection();this.updateDetail(true);
    // Source tiles and the replacement surfaces need their first render before
    // silhouette picking can refine the existing route cutaway.
    this.map.once('idle',()=>{if(this.disposed)return;this.updateOcclusion();this.updateNameOcclusion();this.map.triggerRepaint();});
  }
  route(result?:MapRouteResult){
    this.routeResult=result;this.target.dataset.routeStatus=result?.status||'idle';this.source('preview',empty());
    const fs:Feature[]=result?.status==='ready'?(result.segments?.map(s=>line(s.coordinates,{kind:s.kind}))||[line(result.coordinates,{kind:'network'})]):[];
    this.source('route',collection(fs));this.refreshSelection();this.updateOcclusion();
    const key=result?.status==='ready'?result.coordinates.map(c=>c.join(',')).join(';'):'';
    if(key!==this.routeKey){this.routeKey=key;this.stopReveal();this.routeMeasures=[];let total=0;
      for(const [i,coordinate] of (result?.coordinates||[]).entries()){if(i)total+=metersBetween(result!.coordinates[i-1],coordinate);this.routeMeasures.push({coordinate,meters:total});}
      if(key&&this.loaded&&!this.reduced.matches)this.reveal();
    }
  }
  showEntrances(visible:boolean){this.entrancesVisible=visible;this.refreshEntrances();}
  private refreshEntrances(){
    const fs:Feature[]=[];const route=this.routeResult;
    for(const [role,id,used] of [['A',this.origin,route?.originAccess],['B',this.selected,route?.destinationAccess]] as const){const p=id&&this.points.get(id);if(!p)continue;
      for(const entrance of p.entrances){const active=used?.kind==='entrance'&&used.nodeId===entrance.id;if(active||this.entrancesVisible)fs.push(point(entrance.coordinate,{active,name:role+' · '+entrance.name}));}}
    this.source('entrances',collection(fs));
  }
  // Interpolation follows every recorded bend; never takes a chord through a courtyard.
  private atDistance(distance:number):LngLat {
    const ms=this.routeMeasures;if(!ms.length)return [0,0];
    const i=ms.findIndex(v=>v.meters>=distance);if(i<=0)return i===0?ms[0].coordinate:ms.at(-1)!.coordinate;
    const a=ms[i-1],b=ms[i],t=(distance-a.meters)/(b.meters-a.meters||1);
    return [a.coordinate[0]+t*(b.coordinate[0]-a.coordinate[0]),a.coordinate[1]+t*(b.coordinate[1]-a.coordinate[1])];
  }
  private stopReveal(){cancelAnimationFrame(this.revealFrame);this.revealFrame=0;this.source('reveal',empty());}
  private reveal(){
    const start=performance.now(),total=this.routeMeasures.at(-1)?.meters||0;if(!total)return;
    const frame=(now:number)=>{if(this.disposed)return;const t=Math.min(1,(now-start)/640),a=Math.max(0,t-.09)*total,b=t*total;
      this.source('reveal',collection([line([this.atDistance(a),...this.routeMeasures.filter(p=>p.meters>a&&p.meters<b).map(p=>p.coordinate),this.atDistance(b)])]));
      if(t<1)this.revealFrame=requestAnimationFrame(frame);else this.stopReveal();};
    this.revealFrame=requestAnimationFrame(frame);
  }
  preview(progress?:number){
    this.stopReveal();const r=this.routeResult;if(progress===undefined||r?.status!=='ready'||!r.segments?.length){this.source('preview',empty());return;}
    const target=Math.max(0,Math.min(1,progress))*(this.routeMeasures.at(-1)?.meters||0);let used=0;
    const s=r.segments.find((s,i)=>{if(used+s.meters>=target||i===r.segments!.length-1)return true;used+=s.meters;return false;})!;
    this.source('preview',collection([line(s.coordinates),point(this.atDistance(target),{name:'路线预览，非当前位置'})]));
  }
  /** Used only by the source-level visual study, never exposed as product settings. */
  present(direction:MapDirection){this.direction=direction;this.target.dataset.direction=direction;if(this.loaded)this.applyTheme();}
  /** A visual-study comparison; not a product preference or camera mutation. */
  presentLabels(mode:'ground'|'roof'|'callout'){
    this.labelMode=mode;this.labelsRaised=undefined;this.source('names',this.names());this.refreshSelection();this.updateOcclusion();
    if(this.loaded){
      if(mode==='callout'&&!this.map.hasImage('campus-label-stem')){
        const stem=new Uint8Array(8*36*4);
        for(let y=1;y<34;y++)for(let x=0;x<8;x++)if((y<29&&x>=3&&x<=4)||Math.hypot(x-3.5,y-30)<2.4)stem.set([255,255,255,255],(y*8+x)*4);
        this.map.addImage('campus-label-stem',{width:8,height:36,data:stem},{pixelRatio:2,sdf:true});
      }
      const raised:any=['>', ['coalesce',['get','labelHeight'],0],0];
      this.map.setLayoutProperty('names','text-offset',mode==='callout'?['case',raised,['literal',[0,-1.7]],['literal',[0,0]]]:[0,0]);
      this.map.setLayoutProperty('names','icon-image',mode==='callout'?['case',raised,'campus-label-stem','']:undefined);
    }
  }
  private scheduleOcclusion(){
    clearTimeout(this.occlusionTimer);
    this.occlusionTimer=setTimeout(()=>{if(this.disposed)return;if(this.map.isMoving()){this.scheduleOcclusion();return;}this.updateOcclusion();this.updateNameOcclusion();this.map.triggerRepaint();},120);
  }
  private updateOcclusion(){
    if(!this.loaded)return;
    if(!this.roofs?.cameraKey){this.scheduleOcclusion();return;}
    if(this.map.isMoving()||performance.now()-this.lastCameraMove<110){this.scheduleOcclusion();return;}
    if(!this.loaded||this.disposed)return;const coords=this.routeResult?.status==='ready'?this.routeResult.coordinates:[];const ids=new Set<string>();
    if(this.map.getPitch()>5)for(let i=0;i<coords.length;i+=Math.max(1,Math.floor(coords.length/70))){const pixel=this.map.project(coords[i]);for(const f of this.map.queryRenderedFeatures(pixel,{layers:['volumes','ghosts']}))ids.add(String(f.properties.id||f.id));const roof=this.roofs?.pick(pixel.x,pixel.y);if(roof)ids.add(roof);}
    if(this.labelMode!=='ground'&&!this.routeRoles&&this.selected&&this.map.getPitch()>=12){const anchor=this.labelAnchors.get(this.selected);if(anchor){const id=this.roofs?.labelOccluder(anchor,this.selected,true);if(id)ids.add(id);}}
    const next=[...ids].sort();if(next.join()===this.ghostIds.join())return;
    for(const id of this.ghostIds)if(!ids.has(id))this.map.setFeatureState({source:'names',id},{nameEmphasis:1});
    for(const id of next)this.map.setFeatureState({source:'names',id},{nameEmphasis:.42});
    this.ghostIds=next;
    this.rims?.update(this.palette,[this.selected,this.origin].filter(Boolean) as string[],next);
    this.roofs?.update(this.palette,[this.selected,this.origin].filter(Boolean) as string[],next,this.hovered);
    this.map.setFilter('volumes',['all',kind('building'),['!', ['has','surfaceModel']],['!', ['has','untiledVolume']],['>',['coalesce',['get','heightM'],0],0],['!', ['in',['id'],['literal',next]]]]);
    this.map.setFilter('ghosts',['all',kind('building'),['!', ['has','surfaceModel']],['!', ['has','untiledVolume']],['in',['id'],['literal',next]]]);
  }
  private updateNameOcclusion(){
    if(!this.loaded||!this.roofs)return;
    // Exact silhouette tests are useful when the view settles. Reprojecting
    // every curved roof for every wheel frame was the measured CPU hot path.
    // Native labels still move with the camera; only their occlusion verdict
    // is retained through the gesture and refreshed immediately after it.
    if(this.map.isMoving()||performance.now()-this.lastCameraMove<110)return;
    const key=[this.roofs.cameraKey,this.labelMode,this.selected,this.origin,this.ghostIds.join(),this.near,this.detail,this.fine].join('|');
    if(key===this.labelOcclusionKey)return;this.labelOcclusionKey=key;
    const hidden=new Set<string>();
    if(this.labelMode!=='ground'&&this.map.getPitch()>=12)for(const p of this.points.values()){
      if(p.id===this.selected||p.id===this.origin||p.kind==='water'||p.kind==='area'||p.displayName.startsWith('未命名')||this.namePriority(p)>(this.fine?6:this.near?5:this.detail?2:1))continue;
      const anchor=this.labelAnchors.get(p.id);if(anchor&&this.roofs.labelOccluder(anchor,p.id))hidden.add(p.id);
    }
    for(const id of this.hiddenNames)if(!hidden.has(id))this.map.setFeatureState({source:'names',id},{labelVisible:1});
    for(const id of hidden)if(!this.hiddenNames.has(id))this.map.setFeatureState({source:'names',id},{labelVisible:0});
    this.hiddenNames=hidden;
  }
  location(fix?:LocationFix){
    this.pendingLocation=fix;if(!fix){this.source('location',empty());return;}
    const ring:Position[]=[],lat=fix.coordinate[1]*Math.PI/180;
    for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;ring.push([fix.coordinate[0]+fix.accuracy*Math.cos(a)/(111320*Math.cos(lat)),fix.coordinate[1]+fix.accuracy*Math.sin(a)/110574]);}
    this.source('location',collection([{type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{}},point(fix.coordinate,{name:fix.source==='test'?'模拟位置':'设备位置'})]));
  }
  project(coordinate:LngLat){const p=this.map.project(coordinate);return [p.x,p.y];}
  snapshot():SavedCamera {const c=this.map.getCenter();return {center:fromLonLat(c.toArray()),resolution:78271.51696402048/2**this.map.getZoom(),rotation:-this.map.getBearing()*Math.PI/180,pitch:this.map.getPitch()};}
  private report(){
    if(this.disposed)return;const camera=this.snapshot(),w=this.target.clientWidth,h=this.target.clientHeight,pad=this.padding();const x=(pad.left+w-pad.right)/2,y=(pad.top+h-pad.bottom)/2;
    const a=this.map.unproject([x-45,y]),b=this.map.unproject([x+45,y]),length=metersBetween(a.toArray(),b.toArray());const power=10**Math.floor(Math.log10(length||1)),meters=[1,2,5,10].map(v=>v*power).filter(v=>v<=length).at(-1)||power;
    camera.scale={meters,width:90*meters/(length||1),reference:this.map.getPitch()>1?'视野中心横向地面':'地面'};
    this.target.dataset.pixelRatio=String(this.map.getPixelRatio());this.target.dataset.camera=JSON.stringify({...camera,size:[w,h],projection:'EPSG:3857',moving:this.map.isMoving()});this.target.dataset.scale=JSON.stringify(camera.scale);this.callbacks.camera(camera);
  }
  private updateDetail(force=false){
    if(!this.loaded)return;const alpha=Math.max(0,Math.min(1,this.map.getPitch()/12));if(Math.abs(alpha-this.volumeOpacity)>.008){this.volumeOpacity=alpha;for(const id of ['volumes','ghosts'])this.map.setLayoutProperty(id,'visibility',alpha===0?'none':'visible');this.map.setPaintProperty('volumes','fill-extrusion-opacity',alpha*(this.direction==='focus'?.3:this.direction==='atlas'?.62:.86));this.map.setPaintProperty('ghosts','fill-extrusion-opacity',alpha*.18);}
    // Native label elevation keeps the engine's collision placement and text
    // projection. Change its layout only when entering/leaving planar mode;
    // changing a global layout expression on every frame would reload tiles.
    const raised=this.labelMode!=='ground'&&this.map.getPitch()>.6;
    if(raised!==this.labelsRaised){this.labelsRaised=raised;for(const id of ['names','endpoint-names','browse-name'])this.map.setLayoutProperty(id,'symbol-height-offset',raised?['coalesce',['get','labelHeight'],0]:0);}
    const z=this.map.getZoom(),detail=this.detail?z>15.9:z>16.2,near=this.near?z>17.3:z>17.55,fine=this.fine?z>18.2:z>18.5;
    if(force||detail!==this.detail||near!==this.near||fine!==this.fine){this.detail=detail;this.near=near;this.fine=fine;this.map.setFilter('names',['all',['!', ['in',['get','kind'],['literal',detail?['water','area']:['water']]]],['<=',['get','priority'],fine?6:near?5:detail?2:1],['!', ['in',['get','id'],['literal',[this.origin,this.selected].filter(Boolean) as string[]]]]]);}
  }
  takeControl(){this.ownership.take();if(this.routeFitRefine){this.map.off('idle',this.routeFitRefine);this.routeFitRefine=undefined;}this.map.stop();this.stopReveal();}
  private duration(ms:number){return this.reduced.matches?0:ms;}
  zoom(delta:number,animate=true){this.takeControl();this.map.easeTo({zoom:this.map.getZoom()+delta,duration:animate?this.duration(160):0});}
  rotate(delta:number,animate=true){this.takeControl();this.map.easeTo({bearing:this.map.getBearing()-delta*180/Math.PI,duration:animate?this.duration(160):0});}
  north(animate=true){this.takeControl();this.map.easeTo({bearing:0,duration:animate?this.duration(220):0});}
  setPitch(pitch:number,animate=false){this.takeControl();this.map.easeTo({pitch:Math.max(0,Math.min(55,pitch)),duration:animate?this.duration(280):0});}
  private padding(caption?:FitInsets){return mapFitInsets(this.target,caption);}
  private fit(bounds:number[],duration:number,maxZoom:number,caption?:FitInsets){
    const w=this.target.clientWidth,h=this.target.clientHeight;if(!w||!h)return;
    const box:[[number,number],[number,number]]=[[bounds[0],bounds[1]],[bounds[2],bounds[3]]];
    const options={padding:this.padding(caption),duration,maxZoom,bearing:this.map.getBearing(),pitch:this.map.getPitch()};
    const camera=this.map.cameraForBounds(box,options);if(!camera?.center||camera.zoom===undefined||!Number.isFinite(camera.zoom))return;
    // maxBounds constrains the whole viewport, including the area behind
    // cards. It must not push a correctly fitted route back under those cards.
    // Extend navigation limits by the current/requested viewport footprints;
    // the source AOI, coverage, geometry and coordinate bounds are untouched.
    const b=this.data.manifest.bounds,allowed=new ml.LngLatBounds([b[0]-.01,b[1]-.01],[b[2]+.01,b[3]+.01]);
    for(const [center,zoom] of [[this.map.getCenter(),this.map.getZoom()],[camera.center,camera.zoom]] as const){
      const c=ml.MercatorCoordinate.fromLngLat(center),world=512*2**zoom,dx=(w/2+1)/world,dy=(h/2+1)/world;
      allowed.extend(new ml.MercatorCoordinate(Math.max(0,c.x-dx),Math.min(1,c.y+dy)).toLngLat());
      allowed.extend(new ml.MercatorCoordinate(Math.min(1,c.x+dx),Math.max(0,c.y-dy)).toLngLat());
    }
    this.map.setMinZoom(Math.min(this.map.getMinZoom(),Math.max(0,camera.zoom)));
    this.map.setMaxBounds(allowed);
    this.map.fitBounds(box,options);
  }
  overview(){this.takeControl();this.fit(this.data.manifest.campusBounds,this.duration(300),16.2);}
  focusPlace(p:MapPoint){this.takeControl();this.fit(p.bounds,this.duration(250),17.4);}
  fitRoute(result:MapRouteResult,ticket?:number){
    if(result.status!=='ready'||!result.coordinates.length||ticket!==undefined)return;
    const expected=new Map([result.from,result.to].filter((p):p is MapPoint=>!!p).map(p=>[p.id,(this.points.get(p.id)||p).displayName]));
    const caption=nativeCaptionBounds(this.map,expected)?.insets||measureCaptions([...expected.values()],
      {font:'13px "Noto Sans SC Variable", "Microsoft YaHei", sans-serif',size:13,offsetY:-endpointCaptionGap,padding:2,marker:13.5,maxWidthEm:14,anchor:'bottom'});
    this.takeControl();const ticketNow=this.ownership.ticket(),cs=result.coordinates;
    const bounds=[Math.min(...cs.map(c=>c[0])),Math.min(...cs.map(c=>c[1])),Math.max(...cs.map(c=>c[0])),Math.max(...cs.map(c=>c[1]))];
    this.fit(bounds,this.duration(300),17.7,caption);
    // Initial glyph placement can arrive after the fit request. Check the
    // actual text once idle, with at most two measured corrections. A newer
    // user gesture, route, or disposal invalidates this request.
    let corrections=0;
    const refine=()=>{
      this.routeFitRefine=undefined;
      if(!this.ownership.accepts(ticketNow)||this.disposed||this.routeResult!==result)return;
      const measured=nativeCaptionBounds(this.map,expected);if(!measured)return;
      const p=this.padding(),w=this.target.clientWidth,h=this.target.clientHeight;
      if(measured.boxes.every(b=>b[0]>=p.left&&b[1]>=p.top&&b[2]<=w-p.right&&b[3]<=h-p.bottom))return;
      if(corrections++>=2)return;
      this.fit(bounds,0,17.7,measured.insets);this.routeFitRefine=refine;this.map.once('idle',refine);
    };
    this.routeFitRefine=refine;this.map.once('idle',refine);
  }
  locate(fix:LocationFix,intro=false,ticket?:number){if(intro||ticket!==undefined&&!this.ownership.accepts(ticket))return;this.takeControl();this.map.easeTo({center:fix.coordinate,zoom:17.2,duration:this.duration(250)});}
  private keyboard(e:KeyboardEvent){
    if(!(e.target instanceof Node)||!this.target.contains(e.target)||e.altKey||e.metaKey||e.ctrlKey)return;
    const k=e.key.toLowerCase();if(!['arrowup','arrowdown','arrowleft','arrowright','+','=','-','q','e','n','0','[',']'].includes(k))return;
    e.preventDefault();this.takeControl();this.callbacks.user();
    if(k==='+'||k==='=')this.zoom(.5,false);else if(k==='-')this.zoom(-.5,false);else if(k==='q')this.rotate(-Math.PI/12,false);else if(k==='e')this.rotate(Math.PI/12,false);else if(k==='n')this.north(false);else if(k==='0')this.overview();else if(k==='[')this.setPitch(this.map.getPitch()-5);else if(k===']')this.setPitch(this.map.getPitch()+5);else this.map.panBy([k==='arrowleft'?-70:k==='arrowright'?70:0,k==='arrowup'?-70:k==='arrowdown'?70:0],{duration:0});
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.ownership.destroy();clearTimeout(this.timer);clearTimeout(this.occlusionTimer);this.stopReveal();cancelAnimationFrame(this.hoverFrame);this.resize.disconnect();this.cleanup.forEach(f=>f());this.map.stop();this.map.remove();}
}
