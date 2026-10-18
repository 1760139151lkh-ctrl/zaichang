import { defaultLandSurface, landSurfaceTokens, defaultSportSurface, sportSurfaceTokens, lightMapPalette, type MapPalette } from './map-theme';
import { endpointCaptionGap } from './fit-layout';
import { pedestrianHighways, majorHighways, coveredRoadTunnels, buildingPassageFilter, historicalBridgeFilter } from './road-semantics';
import type { LayerSpecification } from 'maplibre-gl';

const kind = (value: string): any => ['==', ['get', 'kind'], value];
const zoom = (...stops: unknown[]): any => ['interpolate', ['linear'], ['zoom'], ...stops];
const selected: any = ['any', ['boolean', ['feature-state', 'selected'], false], ['boolean', ['feature-state', 'origin'], false]];
const hover: any = ['boolean', ['feature-state', 'hover'], false];
const hoverValue:any=['coalesce',['feature-state','hoverValue'],0];
const contact=(idle:string,active:string):any=>['interpolate',['linear'],hoverValue,0,idle,1,active];
const context: any = ['==', ['get', 'scope'], 'context'];
const round = { 'line-cap': 'round', 'line-join': 'round' };
// A subdued outside segment must not paint its round end over the campus
// continuation. Keep this ordering inside the existing ground-road layers;
// the separate bridge layers still control their documented vertical order.
const groundRoadLayout = { ...round, 'line-sort-key': ['case', context, 0, 1] };
const footway: any = ['in', ['get', 'highway'], ['literal', pedestrianHighways]];
const majorRoad: any = ['in', ['get', 'highway'], ['literal', majorHighways]];
const pedestrianArea: any = ['all', kind('road'), ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'highway'], 'pedestrian']];
const coveredRoad:any=['any',['in',['get','tunnel'],['literal',coveredRoadTunnels]],['==',['get','covered'],'yes']];
const bridge:any=['==',['get','bridge'],'yes'];
// A negative layer orders crossings; it does not make an open stream a tunnel.
const waterCulvert:any=['in',['get','tunnel'],['literal',['culvert','yes']]];
const recordedRoute:any=['all',['==',['geometry-type'],'LineString'],['==',['get','kind'],'network'],['!=',['get','unverified'],true]];
const dashed:any=['==',['get','dashed'],true];
const estimated:any=['==',['get','estimated'],true];
const roadWidth = (minor?: boolean, casing=false, factor=1): any => {
  const at=(walk:number,road:number,padding:number)=>{
    const vehicle=['case',majorRoad,road,road*.65];
    const ink=minor===true?walk:minor===false?vehicle:['case',footway,walk,vehicle];
    return factor!==1?['*',ink,factor]:casing?['+',ink,padding]:ink;
  };
  return ['interpolate', ['exponential', 1.65], ['zoom'], 13, at(.3,.6,.6), 16, at(.9,2.3,1.5), 19, at(2.8,9,2), 21, at(8,28,2)];
};

export function cartographyLayers(p: MapPalette): LayerSpecification[] {
  const lightHalos=p.halo===lightMapPalette.halo;
  const landColor = ['match', ['get','role'], ...Object.entries(landSurfaceTokens).flatMap(([role, token]) => [role, p[token.color]]), p[defaultLandSurface.color]];
  const landOpacity = ['match', ['get','role'], ...Object.entries(landSurfaceTokens).flatMap(([role, token]) => [role, token.opacity]), defaultLandSurface.opacity];
  const sportColor = ['match', ['get','role'], ...Object.entries(sportSurfaceTokens).flatMap(([role, token]) => [role, p[token.color]]), p[defaultSportSurface.color]];
  const sportOpacity = ['match', ['get','role'], ...Object.entries(sportSurfaceTokens).flatMap(([role, token]) => [role, token.opacity]), defaultSportSurface.opacity];
  // Opaque, already toned road ink keeps independently acquired ways from
  // whitening their shared round caps. Fading each overlapping segment made
  // ordinary junctions look like a string of bright construction points.
  // Keep bridge approaches traceable at overview scale. Their opaque ink
  // changes tone with zoom instead of dropping the whole path class.
  const roadInk=p.road,pathInk=zoom(13,p.pathFade,17,p.minorRoad),contextInk=p.contextRoad;
  const shadow=p.shadow;
  const layers: any[] = [
    {id:'land',type:'fill',source:'geography',filter:kind('land'),paint:{'fill-color':landColor,'fill-opacity':landOpacity}},
    {id:'garden-edge',type:'line',source:'geography',minzoom:16,filter:['all',kind('land'),['==',['get','role'],'garden']],layout:round,paint:{'line-color':p.outline,'line-opacity':.14,'line-width':.6}},
    {id:'areas',type:'line',source:'geography',filter:kind('area'),paint:{'line-color':p.outline,'line-opacity':.2,'line-width':.7,'line-dasharray':[2,8]}},
    // The surface owns visible water wherever a polygon exists. Draw source
    // centrelines below it, so they cannot masquerade as roads or dams inside it.
    {id:'shore',type:'line',source:'geography',filter:kind('water-surface'),layout:round,paint:{'line-color':p.waterBank,'line-opacity':.48,'line-width':zoom(14,1.2,19,2.2)}},
    {id:'waterway-edge',type:'line',source:'geography',filter:['all',kind('waterway'),['!',waterCulvert]],layout:round,paint:{'line-color':p.waterBank,'line-opacity':.35,'line-width':zoom(14,2,19,6.8)}},
    {id:'waterways',type:'line',source:'geography',filter:['all',kind('waterway'),['!',waterCulvert]],layout:round,paint:{'line-color':p.water,'line-width':zoom(14,1.5,19,5.5)}},
    {id:'water-culverts',type:'line',source:'geography',minzoom:14,filter:['all',kind('waterway'),waterCulvert],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.waterBank,'line-opacity':.5,'line-width':.9,'line-dasharray':[2,3]}},
    {id:'water',type:'fill',source:'geography',filter:kind('water-surface'),paint:{'fill-color':p.water,'fill-opacity':1}},
    // GroundStroke clips this soft inner edge to the water's own fill. Roads
    // and bridge decks remain above it; small waterways stay clear at overview.
    {id:'water-depth',type:'line',source:'geography',filter:kind('water-surface'),layout:round,paint:{'line-color':shadow,'line-width':zoom(14,2,18,7),'line-blur':3,'line-opacity':zoom(14,0,16,.28,18,.5,20,.55)}},
    {id:'grounds',type:'fill',source:'geography',filter:kind('landmark'),paint:{'fill-color':p.land,'fill-opacity':.32}},
    {id:'landscape-steps',type:'line',source:'sports',filter:kind('landscape-step'),minzoom:17,layout:round,paint:{'line-color':p.outline,'line-opacity':zoom(17,0,18,.42,20,.62),'line-width':zoom(17,.4,20,.8)}},
    {id:'sports-fill',type:'fill',source:'geography',filter:kind('sport'),paint:{'fill-color':sportColor,'fill-opacity':sportOpacity}},
    {id:'court-inlays',type:'fill',source:'sports',filter:kind('court-inlay'),minzoom:16,paint:{'fill-color':p.courtInlay,'fill-opacity':zoom(16,0,17,.42,19,.64)}},
    {id:'sports-inset',type:'line',source:'geography',filter:kind('sport'),layout:round,paint:{'line-color':shadow,'line-width':zoom(16,1,19,4),'line-blur':1.2,'line-opacity':.55}},
    {id:'sports-edge',type:'line',source:'geography',filter:kind('sport'),layout:round,paint:{'line-color':['case',selected,p.selected,contact(p.outline,p.hover)],'line-width':['case',selected,1.5,.8],'line-opacity':['case',selected,.95,['in',['get','role'],['literal',['court-runoff','court-group','track-apron']]],.22,.6]}},
    {id:'markings',type:'line',source:'sports',filter:['all',['==',['geometry-type'],'LineString'],kind('marking')],minzoom:16.6,layout:round,paint:{'line-color':p.text,'line-opacity':zoom(16.6,0,18,.5,20,.72),'line-width':zoom(17,.65,19,1.05,20,1.4)}},
    {id:'court-nets',type:'line',source:'sports',filter:['all',['==',['geometry-type'],'LineString'],kind('net')],minzoom:17,layout:round,paint:{'line-color':p.text,'line-opacity':zoom(17,0,19,.58),'line-width':zoom(17,1,20,2.2)}},
    {id:'court-equipment',type:'line',source:'sports',filter:['all',['==',['geometry-type'],'LineString'],kind('equipment')],minzoom:18.3,layout:round,paint:{'line-color':p.text,'line-opacity':zoom(18.3,0,19,.75),'line-width':zoom(18.3,.8,20,1.5)}},
    {id:'athletic-lanes',type:'line',source:'sports',filter:kind('track-lane'),minzoom:16.5,layout:round,paint:{'line-color':p.text,'line-opacity':zoom(16.5,0,17,.25,18.6,.48,20,.68),'line-width':zoom(16.5,.45,18,.65,19,.8,20,1.1)}},
    // Roads are a legible ground surface, with a dark shoulder. Class widths
    // are cartographic emphasis, not measured physical road widths.
    // Acquired pedestrian polygons describe a surface, including its holes.
    // Their boundaries are not centreline roads with an inferred width.
    {id:'pedestrian-areas',type:'fill',source:'geography',filter:pedestrianArea,paint:{'fill-color':p.paving,'fill-opacity':['case',context,.35,1]}},
    {id:'pedestrian-area-edges',type:'line',source:'geography',filter:pedestrianArea,paint:{'line-color':p.outline,'line-opacity':.3,'line-width':.65}},
    // Explicit covered sections remain traceable between their portals. A
    // tunnel is not restricted to footways and does not require a layer tag.
    {id:'covered-roads',type:'line',source:'geography',minzoom:14,filter:['all',kind('road'),['!',footway],coveredRoad],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':['case',context,contextInk,roadInk],'line-opacity':.55,'line-opacity-transition':{duration:0},'line-width':roadWidth(),'line-dasharray':[2,3]}},
    {id:'underground-paths',type:'line',source:'geography',minzoom:17,filter:['all',kind('road'),footway,coveredRoad],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.minorRoad,'line-opacity':.55,'line-opacity-transition':{duration:0},'line-width':roadWidth(true),'line-dasharray':[2,3]}},
    // All shoulders precede all road ink. Painting a road shoulder over a
    // joining path leaves a dark break immediately before the junction.
    {id:'roads-case',type:'line',source:'geography',filter:['all',kind('road'),['!',footway],['!',coveredRoad],['!',bridge],['!',historicalBridgeFilter]],layout:groundRoadLayout,paint:{'line-color':p.roadCasing,'line-width':roadWidth(false,true)}},
    {id:'paths',type:'line',source:'geography',filter:['all',kind('road'),footway,['!=',['get','highway'],'steps'],['!',pedestrianArea],['!=',['get','displayRole'],'venue-interior-road'],['!',coveredRoad],['!',bridge],['!',historicalBridgeFilter]],layout:round,paint:{'line-color':pathInk,'line-width':roadWidth(true)}},
    {id:'steps',type:'line',source:'geography',filter:['all',kind('road'),['==',['get','highway'],'steps'],['!',coveredRoad],['!',bridge],['!',historicalBridgeFilter]],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':pathInk,'line-width':roadWidth(true),'line-dasharray':[1,2]}},
    {id:'roads',type:'line',source:'geography',filter:['all',kind('road'),['!',footway],['!',coveredRoad],['!',bridge],['!',historicalBridgeFilter]],layout:groundRoadLayout,paint:{'line-color':['case',context,contextInk,roadInk],'line-width':roadWidth()}},
    {id:'historical-crossings',type:'line',source:'geography',minzoom:15.3,filter:['all',kind('road'),historicalBridgeFilter],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.minorRoad,'line-opacity':.8,'line-width':roadWidth(),'line-dasharray':[1,3]}},
    // A bridge deck separates a crossing road below it. The butt-ended casing
    // leaves its approaches open, and the deck keeps the approach's ink width.
    {id:'bridge-case',type:'line',source:'geography',filter:['all',kind('road'),bridge],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.roadCasing,'line-width':roadWidth(undefined,true)}},
    {id:'bridge-ground',type:'line',source:'geography',filter:['all',kind('road'),bridge],layout:groundRoadLayout,paint:{'line-color':zoom(13,['case',footway,p.pathFade,context,contextInk,roadInk],17,['case',footway,p.minorRoad,context,contextInk,roadInk]),'line-width':roadWidth()}},
    {id:'bridges',type:'line',source:'geography',filter:['all',kind('road'),bridge],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.outline,'line-opacity':zoom(15,.2,17,.5,19,.65),'line-width':zoom(15,.35,19,.7),'line-offset':roadWidth(undefined,false,.46)}},
    {id:'bridge-near-edge',type:'line',source:'geography',filter:['all',kind('road'),bridge],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.outline,'line-opacity':zoom(15,.2,17,.5,19,.65),'line-width':zoom(15,.35,19,.7),'line-offset':roadWidth(undefined,false,-.46)}},
    {id:'barriers',type:'line',source:'geography',minzoom:17.2,filter:kind('barrier'),paint:{'line-color':p.barrier,'line-width':.9,'line-dasharray':[1,2]}},
    // Screen-space contact shade gives flat footprints weight without making
    // up a building height, roof shape or an additional geographic object.
    {id:'building-shadow',type:'fill',source:'geography',filter:kind('building'),paint:{'fill-color':shadow,'fill-opacity':.52,'fill-translate':[2.3,3.4],'fill-translate-anchor':'viewport'}},
    {id:'building-soft-shadow',type:'line',source:'geography',filter:kind('building'),paint:{'line-color':shadow,'line-width':5,'line-blur':3,'line-opacity':.3,'line-translate':[2,3],'line-translate-anchor':'viewport'}},
    {id:'footprints',type:'fill',source:'geography',filter:['all',kind('building'),['!', ['boolean',['get','groundIsProjection'],false]]],paint:{'fill-color':['case',selected,p.selectedBuilding,contact(p.building,p.hover)],'fill-opacity':['case',context,.35,.74]}},
    {id:'building-edges',type:'line',source:'geography',filter:kind('building'),paint:{'line-color':['case',selected,p.selected,contact(p.outline,p.hover)],'line-width':['case',selected,1.65,['interpolate',['linear'],hoverValue,0,.65,1,1.25]],'line-opacity':['case',context,.28,selected,1,hover,.9,.65]}},
    {id:'underground-stations',type:'line',source:'geography',filter:kind('underground-station'),paint:{'line-color':p.selected,'line-width':1.1,'line-dasharray':[3,4],'line-opacity':['case',selected,.65,hover,.35,0]}},
    {id:'roof-light',type:'line',source:'geography',filter:kind('building'),paint:{'line-color':p.text,'line-width':.6,'line-opacity':.14,'line-translate':[-.4,-.6],'line-translate-anchor':'viewport'}},
    {id:'selection-aura',type:'line',source:'geography',filter:kind('building'),paint:{'line-color':p.selected,'line-width':['case',selected,6,hover,4,0],'line-blur':3,'line-opacity':['case',selected,.18,hover,.13,0]}},
    {id:'references',type:'circle',source:'geography',filter:['any',kind('reference'),['==',['geometry-type'],'Point']],minzoom:17.2,paint:{'circle-radius':2.2,'circle-color':p.secondaryText,'circle-opacity':['case',selected,1,hover,.65,0]}},
    {id:'road-names',type:'symbol',source:'geography',minzoom:16.8,filter:['all',kind('road'),['has','name'],['!=',['get','name'],'']],layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':['Campus'],'text-size':10.5,'text-letter-spacing':.12,'symbol-spacing':330,'text-max-angle':30,'text-padding':4},paint:{'text-color':p.secondaryText,'text-opacity':['case',coveredRoad,.5,.65],'text-halo-color':p.halo,'text-halo-width':lightHalos?.45:1.5}},
    {id:'route-glow',type:'line',source:'route',filter:recordedRoute,layout:round,paint:{'line-color':p.route,'line-width':14,'line-blur':8,'line-opacity':.22}},
    // Plan view can show a covered crossing through a roof projection. Fade
    // this ink below the volume as the real spatial camera rises.
    {id:'passage-overprint',type:'line',source:'geography',minzoom:15.3,filter:['all',kind('road'),buildingPassageFilter],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.passage,'line-opacity':0,'line-opacity-transition':{duration:0},'line-width':roadWidth(),'line-dasharray':[2,3]}},
    {id:'route-case',type:'line',source:'route',filter:['==',['geometry-type'],'LineString'],layout:round,paint:{'line-color':p.halo,'line-width':7,'line-opacity':.95}},
    {id:'route-line',type:'line',source:'route',filter:recordedRoute,layout:round,paint:{'line-color':p.route,'line-width':3.8}},
    {id:'route-fine',type:'line',source:'route',filter:recordedRoute,layout:round,paint:{'line-color':p.text,'line-width':.8,'line-opacity':.5}},
    {id:'route-conditional',type:'line',source:'route',filter:['all',['==',['geometry-type'],'LineString'],['==',['get','kind'],'network'],['==',['get','unverified'],true]],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.route,'line-width':3.8,'line-dasharray':[2,2]}},
    {id:'route-estimate',type:'line',source:'route',filter:['all',['==',['geometry-type'],'LineString'],['==',['get','kind'],'estimate']],layout:round,paint:{'line-color':p.route,'line-width':2.1,'line-dasharray':[1,2],'line-opacity':.85}},
    {id:'route-reveal',type:'line',source:'reveal',filter:['!',dashed],layout:round,paint:{'line-color':p.text,'line-width':5,'line-opacity':.8}},
    {id:'route-reveal-dashed',type:'line',source:'reveal',filter:['all',dashed,['!',estimated]],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.text,'line-width':3.8,'line-opacity':.8,'line-dasharray':[2,2]}},
    {id:'route-reveal-estimate',type:'line',source:'reveal',filter:estimated,layout:round,paint:{'line-color':p.text,'line-width':2.1,'line-opacity':.8,'line-dasharray':[1,2]}},
    {id:'preview-line',type:'line',source:'preview',filter:['all',['==',['geometry-type'],'LineString'],['!',dashed]],layout:round,paint:{'line-color':p.text,'line-width':4}},
    {id:'preview-dashed',type:'line',source:'preview',filter:['all',['==',['geometry-type'],'LineString'],dashed,['!',estimated]],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.text,'line-width':3.8,'line-dasharray':[2,2]}},
    {id:'preview-estimate',type:'line',source:'preview',filter:['all',['==',['geometry-type'],'LineString'],estimated],layout:round,paint:{'line-color':p.text,'line-width':2.1,'line-dasharray':[1,2]}},
    {id:'preview-dot',type:'circle',source:'preview',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':7,'circle-color':p.halo,'circle-stroke-color':p.text,'circle-stroke-width':2}},
    {id:'entrances',type:'circle',source:'entrances',paint:{'circle-radius':['case',['boolean',['get','active'],false],4.5,3.5],'circle-color':p.halo,'circle-stroke-color':p.route,'circle-stroke-width':1.4}},
    {id:'water-names',type:'symbol',source:'names',filter:kind('water'),layout:{'text-field':['get','name'],'text-font':['Campus'],'text-size':13,'text-letter-spacing':.22,'text-padding':20,'text-variable-anchor':['center','right','left','bottom','top'],'text-radial-offset':2.4},paint:{'text-color':p.secondaryText,'text-opacity':.64,'text-halo-color':p.water,'text-halo-width':1.2}},
    // Overview inclusion follows the place's role, not model sophistication.
    // Among visible authored roofs, a higher silhouette places its name first.
    {id:'names',type:'symbol',source:'names',filter:['all',['<=',['get','priority'],1],['!=',['get','kind'],'water']],layout:{'text-field':['get','name'],'text-font':['Campus'],'text-size':zoom(14,11,17,12,19,14),'text-max-width':9,'text-padding':10,'text-allow-overlap':false,'text-variable-anchor':['center','right','left','bottom','top'],'text-radial-offset':2.4,'symbol-sort-key':['-', ['case',['boolean',['get','surfaceLabel'],false],0,['get','priority']],['/', ['coalesce',['get','labelHeight'],0],10000]],'text-rotation-alignment':'viewport','text-pitch-alignment':'viewport','symbol-height-offset':0,'icon-anchor':'bottom'},paint:{'text-color':['case',['<=',['get','priority'],1],p.text,p.secondaryText],'text-opacity':['*',['coalesce',['feature-state','labelVisible'],1],['coalesce',['feature-state','nameEmphasis'],1],['case',['==',['get','scope'],'context'],.65,.92]],'text-halo-color':p.halo,'text-halo-width':lightHalos?.45:1.4,'text-halo-blur':lightHalos?0:.5,'icon-color':p.secondaryText,'icon-opacity':['*',.65,['coalesce',['feature-state','labelVisible'],1]]}},
    {id:'selected-shore',type:'line',source:'selection',filter:kind('selection-water'),layout:round,paint:{'line-color':p.selected,'line-opacity':.55,'line-width':zoom(14,.8,19,1.2)}},
    {id:'selected-part',type:'line',source:'selection',filter:kind('selection-building-part'),layout:round,paint:{'line-color':p.selected,'line-opacity':.85,'line-width':zoom(14,.8,19,1.2)}},
    {id:'endpoint-stems',type:'line',source:'selection',filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','kind'],'selection-water']],paint:{'line-color':p.route,'line-opacity':.7,'line-width':1}},
    {id:'endpoints',type:'circle',source:'selection',filter:kind('selection-marker'),paint:{'circle-radius':['case',['==',['get','role'],''],5,12],'circle-color':['case',['==',['get','role'],'A'],p.halo,p.route],'circle-stroke-color':p.route,'circle-stroke-width':1.5}},
    {id:'endpoint-letters',type:'symbol',source:'selection',filter:kind('selection-marker'),layout:{'text-field':['get','role'],'text-font':['Campus'],'text-size':11,'text-allow-overlap':true},paint:{'text-color':['case',['==',['get','role'],'A'],p.text,p.halo]}},
    {id:'endpoint-names',type:'symbol',source:'selection',filter:['all',kind('selection-name'),['in',['get','role'],['literal',['A','B']]]],layout:{'text-field':['get','name'],'text-font':['Campus'],'text-size':13,'text-anchor':['case',['boolean',['get','captionBelow'],false],'top',['boolean',['get','hasMarker'],false],'bottom','center'],'text-offset':['case',['boolean',['get','captionBelow'],false],['literal',[0,endpointCaptionGap/13]],['boolean',['get','hasMarker'],false],['literal',[0,-endpointCaptionGap/13]],['literal',[0,0]]],'text-max-width':14,'text-allow-overlap':true,'text-pitch-alignment':'viewport','symbol-height-offset':0},paint:{'text-color':p.text,'text-halo-color':p.halo,'text-halo-width':lightHalos?.65:2}},
    {id:'browse-name',type:'symbol',source:'selection',filter:['all',kind('selection-name'),['==',['get','role'],'']],layout:{'text-field':['get','name'],'text-font':['Campus'],'text-size':13,'text-max-width':14,'text-padding':2,'text-allow-overlap':false,'text-variable-anchor-offset':['case',['boolean',['get','hasMarker'],false],['literal',['bottom',[0,-endpointCaptionGap/13],'right',[-2.4,0],'left',[2.4,0],'top',[0,2.4]]],['literal',['center',[0,0],'right',[-2.4,0],'left',[2.4,0],'bottom',[0,-2.4],'top',[0,2.4]]]],'text-pitch-alignment':'viewport','symbol-height-offset':0},paint:{'text-color':p.text,'text-halo-color':p.halo,'text-halo-width':lightHalos?.65:2}},
    {id:'location-area',type:'fill',source:'location',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':p.location,'fill-opacity':.08}},
    {id:'location-ring',type:'line',source:'location',filter:['==',['geometry-type'],'Polygon'],paint:{'line-color':p.location,'line-width':1,'line-opacity':.35}},
    {id:'location-dot',type:'circle',source:'location',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':5.5,'circle-color':p.location,'circle-stroke-color':p.halo,'circle-stroke-width':2}},
    // Transparent symbols reserve the measured DOM footprint in native text
    // placement. They have no geographic or selectable entity identity.
    {id:'control-occupancy',type:'symbol',source:'control-occupancy',layout:{'icon-image':['get','image'],'icon-offset':[0,0],'icon-anchor':'center','icon-allow-overlap':true,'icon-ignore-placement':false,'icon-padding':0,'icon-pitch-alignment':'viewport','icon-rotation-alignment':'viewport'}},
  ];
  return layers;
}
