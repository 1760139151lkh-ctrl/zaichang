import { defaultSportSurface, sportSurfaceTokens, type MapPalette } from './map-theme';
import { endpointCaptionGap } from './fit-layout';
import type { LayerSpecification } from 'maplibre-gl';

// The study compares different readings of the same geography. Production uses
// relief; no extra product mode or altered footprint is required.
export type MapDirection = 'atlas' | 'relief' | 'focus';
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
const footway: any = ['in', ['get', 'highway'], ['literal', ['path', 'footway', 'pedestrian', 'steps']]];
const pedestrianArea: any = ['all', kind('road'), ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'highway'], 'pedestrian']];
const underground:any=['all',['==',['get','tunnel'],'yes'],['<',['to-number',['get','layer'],0],0]];
const waterCulvert:any=['any',['==',['get','tunnel'],'culvert'],['<',['to-number',['get','layer'],0],0]];
const roadWidth = (minor = false): any => ['interpolate', ['exponential', 1.65], ['zoom'], 13, minor ? .3 : .6, 16, minor ? .9 : 2.3, 19, minor ? 2.8 : 9, 21, minor ? 8 : 28];
const bridgeWidth=(factor=1):any=>['interpolate',['exponential',1.65],['zoom'],13,['case',footway,.3*factor,.6*factor],16,['case',footway,1.8*factor,2.3*factor],19,['case',footway,4.2*factor,9*factor],21,['case',footway,12*factor,28*factor]];

export function cartographyLayers(p: MapPalette, direction: MapDirection): LayerSpecification[] {
  const relief = direction !== 'atlas', focus = direction === 'focus';
  const dark = p.text === '#eeeadf';
  const ground = dark ? '#232620' : '#edeae0';
  const sportColor = ['match', ['get','role'], ...Object.entries(sportSurfaceTokens).flatMap(([role, token]) => [role, p[token.color]]), p[defaultSportSurface.color]];
  const sportOpacity = ['match', ['get','role'], ...Object.entries(sportSurfaceTokens).flatMap(([role, token]) => [role, token.opacity]), defaultSportSurface.opacity];
  const shadow = dark ? '#080b09' : '#8a8475';
  // Opaque, already toned road ink keeps independently acquired ways from
  // whitening their shared round caps. Fading each overlapping segment made
  // ordinary junctions look like a string of bright construction points.
  const roadInk=dark?'#5c5a50':'#aaa393',pathInk=dark?'#484b41':'#c9c3b2';
  const contextInk=dark?'#383a32':'#d6d1c4';
  const layers: any[] = [
    {id:'land',type:'fill',source:'geography',filter:kind('land'),paint:{'fill-color':['match',['get','role'],'garden',dark?'#35382e':'#d6d8c6','paving',p.paving,'stage',dark?'#665c47':'#bca985',ground],'fill-opacity':['match',['get','role'],'garden',.78,'paving',1,'stage',1,.22]}},
    {id:'garden-edge',type:'line',source:'geography',minzoom:16,filter:['all',kind('land'),['==',['get','role'],'garden']],layout:round,paint:{'line-color':p.outline,'line-opacity':.14,'line-width':.6}},
    {id:'areas',type:'line',source:'geography',filter:kind('area'),paint:{'line-color':p.outline,'line-opacity':.2,'line-width':.7,'line-dasharray':[2,8]}},
    {id:'water-depth',type:'line',source:'geography',filter:kind('water-surface'),layout:round,paint:{'line-color':shadow,'line-width':zoom(14,2,18,7),'line-blur':3,'line-opacity':relief?.55:0}},
    {id:'water',type:'fill',source:'geography',filter:kind('water-surface'),paint:{'fill-color':p.water,'fill-opacity':.93}},
    {id:'shore',type:'line',source:'geography',filter:kind('water-surface'),layout:round,paint:{'line-color':p.outline,'line-opacity':.3,'line-width':zoom(14,.6,19,1.1)}},
    {id:'waterway-edge',type:'line',source:'geography',filter:['all',kind('waterway'),['!',waterCulvert]],layout:round,paint:{'line-color':p.outline,'line-opacity':.22,'line-width':zoom(14,2,19,6.8)}},
    {id:'waterways',type:'line',source:'geography',filter:['all',kind('waterway'),['!',waterCulvert]],layout:round,paint:{'line-color':p.water,'line-width':zoom(14,1.5,19,5.5)}},
    {id:'water-culverts',type:'line',source:'geography',minzoom:17,filter:['all',kind('waterway'),waterCulvert],layout:round,paint:{'line-color':p.outline,'line-opacity':.18,'line-width':.75,'line-dasharray':[2,4]}},
    {id:'grounds',type:'fill',source:'geography',filter:kind('landmark'),paint:{'fill-color':p.land,'fill-opacity':.32}},
    {id:'landscape-steps',type:'line',source:'sports',filter:kind('landscape-step'),minzoom:17,layout:round,paint:{'line-color':p.outline,'line-opacity':zoom(17,0,18,.42,20,.62),'line-width':zoom(17,.4,20,.8)}},
    {id:'sports-fill',type:'fill',source:'geography',filter:kind('sport'),paint:{'fill-color':sportColor,'fill-opacity':sportOpacity}},
    {id:'court-inlays',type:'fill',source:'sports',filter:kind('court-inlay'),minzoom:16,paint:{'fill-color':dark?'#4d5245':'#c4c8b6','fill-opacity':zoom(16,0,17,.42,19,.64)}},
    {id:'sports-inset',type:'line',source:'geography',filter:kind('sport'),layout:round,paint:{'line-color':shadow,'line-width':zoom(16,1,19,4),'line-blur':1.2,'line-opacity':relief?.55:0}},
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
    {id:'paths',type:'line',source:'geography',minzoom:15.3,filter:['all',kind('road'),footway,['!',pedestrianArea],['!=',['get','displayRole'],'venue-interior-road'],['!',underground]],layout:round,paint:{'line-color':zoom(15.3,dark?'#30332c':'#dfdbcf',17,pathInk),'line-width':roadWidth(true)}},
    {id:'roads-case',type:'line',source:'geography',filter:['all',kind('road'),['!',footway],['!',underground]],layout:groundRoadLayout,paint:{'line-color':['case',context,dark?'#20231e':'#ded9cd',dark?'#191c17':'#b5ae9d'],'line-width':zoom(13,1.2,16,3.8,19,11,21,30)}},
    {id:'roads',type:'line',source:'geography',filter:['all',kind('road'),['!',footway],['!',underground]],layout:groundRoadLayout,paint:{'line-color':['case',context,contextInk,roadInk],'line-width':roadWidth()}},
    {id:'underground-paths',type:'line',source:'geography',minzoom:17,filter:['all',kind('road'),footway,underground],layout:round,paint:{'line-color':p.minorRoad,'line-opacity':.48,'line-width':roadWidth(true),'line-dasharray':[2,3]}},
    {id:'bridge-ground',type:'line',source:'geography',filter:['all',kind('road'),['==',['get','bridge'],'yes']],layout:round,paint:{'line-color':['case',footway,pathInk,roadInk],'line-width':bridgeWidth()}},
    {id:'bridges',type:'line',source:'geography',filter:['all',kind('road'),['==',['get','bridge'],'yes']],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.outline,'line-opacity':zoom(15,.2,17,.5,19,.65),'line-width':zoom(15,.35,19,.7),'line-offset':bridgeWidth(.46)}},
    {id:'bridge-near-edge',type:'line',source:'geography',filter:['all',kind('road'),['==',['get','bridge'],'yes']],layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.outline,'line-opacity':zoom(15,.2,17,.5,19,.65),'line-width':zoom(15,.35,19,.7),'line-offset':bridgeWidth(-.46)}},
    {id:'barriers',type:'line',source:'geography',minzoom:17.2,filter:kind('barrier'),paint:{'line-color':p.barrier,'line-width':.9,'line-dasharray':[1,2]}},
    // Screen-space contact shade gives flat footprints weight without making
    // up a building height, roof shape or an additional geographic object.
    {id:'building-shadow',type:'fill',source:'geography',filter:kind('building'),paint:{'fill-color':shadow,'fill-opacity':relief?.52:0,'fill-translate':[2.3,3.4],'fill-translate-anchor':'viewport'}},
    {id:'building-soft-shadow',type:'line',source:'geography',filter:kind('building'),paint:{'line-color':shadow,'line-width':5,'line-blur':3,'line-opacity':relief?.3:0,'line-translate':[2,3],'line-translate-anchor':'viewport'}},
    {id:'footprints',type:'fill',source:'geography',filter:kind('building'),paint:{'fill-color':['case',selected,dark?'#817659':'#c7ae75',contact(p.building,p.hover)],'fill-opacity':['case',context,.35,focus,.38,.74]}},
    {id:'building-edges',type:'line',source:'geography',filter:kind('building'),paint:{'line-color':['case',selected,p.selected,contact(p.outline,p.hover)],'line-width':['case',selected,1.65,['interpolate',['linear'],hoverValue,0,.65,1,1.25]],'line-opacity':['case',context,.28,selected,1,hover,.9,.65]}},
    {id:'roof-light',type:'line',source:'geography',filter:kind('building'),paint:{'line-color':p.text,'line-width':.6,'line-opacity':relief?.14:0,'line-translate':[-.4,-.6],'line-translate-anchor':'viewport'}},
    {id:'volumes',type:'fill-extrusion',source:'geography',filter:['all',kind('building'),['!', ['has','surfaceModel']],['>', ['coalesce',['get','heightM'],0],0]],paint:{'fill-extrusion-color':['case',selected,dark?'#877c60':'#c7ae75',contact(p.building,p.hover)],'fill-extrusion-height':['get','heightM'],'fill-extrusion-base':['coalesce',['get','minHeightM'],0],'fill-extrusion-opacity':focus?.3:relief?.86:.62,'fill-extrusion-opacity-transition':{duration:0},'fill-extrusion-vertical-gradient':true}},
    {id:'ghosts',type:'fill-extrusion',source:'geography',filter:['all',kind('building'),['in',['id'],['literal',[]]]],paint:{'fill-extrusion-color':p.outline,'fill-extrusion-height':['get','heightM'],'fill-extrusion-opacity':.18,'fill-extrusion-opacity-transition':{duration:0}}},
    {id:'selection-aura',type:'line',source:'geography',filter:kind('building'),paint:{'line-color':p.selected,'line-width':['case',selected,6,hover,4,0],'line-blur':3,'line-opacity':['case',selected,.18,hover,.13,0]}},
    {id:'references',type:'circle',source:'geography',filter:['any',kind('reference'),['==',['geometry-type'],'Point']],minzoom:17.2,paint:{'circle-radius':2.2,'circle-color':p.secondaryText,'circle-opacity':['case',selected,1,hover,.65,0]}},
    {id:'road-names',type:'symbol',source:'geography',minzoom:16.8,filter:['all',kind('road'),['has','name'],['!=',['get','name'],''],['!',underground]],layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':['Campus'],'text-size':10.5,'text-letter-spacing':.12,'symbol-spacing':330,'text-max-angle':30,'text-padding':4},paint:{'text-color':p.secondaryText,'text-opacity':.65,'text-halo-color':p.halo,'text-halo-width':1.5}},
    {id:'route-glow',type:'line',source:'route',filter:['all',['==',['geometry-type'],'LineString'],['==',['get','kind'],'network']],layout:round,paint:{'line-color':p.route,'line-width':14,'line-blur':8,'line-opacity':.22}},
    {id:'route-case',type:'line',source:'route',filter:['==',['geometry-type'],'LineString'],layout:round,paint:{'line-color':p.halo,'line-width':7,'line-opacity':.95}},
    {id:'route-line',type:'line',source:'route',filter:['all',['==',['geometry-type'],'LineString'],['==',['get','kind'],'network']],layout:round,paint:{'line-color':p.route,'line-width':3.8}},
    {id:'route-fine',type:'line',source:'route',filter:['all',['==',['geometry-type'],'LineString'],['==',['get','kind'],'network']],layout:round,paint:{'line-color':p.text,'line-width':.8,'line-opacity':.5}},
    {id:'route-estimate',type:'line',source:'route',filter:['all',['==',['geometry-type'],'LineString'],['==',['get','kind'],'estimate']],layout:round,paint:{'line-color':p.route,'line-width':2.1,'line-dasharray':[1,2],'line-opacity':.85}},
    {id:'route-reveal',type:'line',source:'reveal',layout:round,paint:{'line-color':p.text,'line-width':5,'line-opacity':.8}},
    {id:'preview-line',type:'line',source:'preview',filter:['==',['geometry-type'],'LineString'],layout:round,paint:{'line-color':p.text,'line-width':4}},
    {id:'preview-dot',type:'circle',source:'preview',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':7,'circle-color':p.halo,'circle-stroke-color':p.text,'circle-stroke-width':2}},
    {id:'entrances',type:'circle',source:'entrances',paint:{'circle-radius':['case',['boolean',['get','active'],false],4.5,3.5],'circle-color':p.halo,'circle-stroke-color':p.route,'circle-stroke-width':1.4}},
    {id:'water-names',type:'symbol',source:'names',filter:kind('water'),layout:{'text-field':['get','name'],'text-font':['Campus'],'text-size':13,'text-letter-spacing':.22,'text-padding':20},paint:{'text-color':p.secondaryText,'text-opacity':.64,'text-halo-color':p.water,'text-halo-width':1.2}},
    // Overview inclusion follows the place's role, not model sophistication.
    // Among visible authored roofs, a higher silhouette places its name first.
    {id:'names',type:'symbol',source:'names',filter:['all',['<=',['get','priority'],1],['!=',['get','kind'],'water']],layout:{'text-field':['get','name'],'text-font':['Campus'],'text-size':zoom(14,11,17,12,19,14),'text-max-width':9,'text-padding':10,'text-allow-overlap':false,'symbol-sort-key':['-', ['case',['boolean',['get','surfaceLabel'],false],0,['get','priority']],['/', ['coalesce',['get','labelHeight'],0],10000]],'text-rotation-alignment':'viewport','text-pitch-alignment':'viewport','symbol-height-offset':0,'icon-anchor':'bottom'},paint:{'text-color':['case',['<=',['get','priority'],1],p.text,p.secondaryText],'text-opacity':['*',['coalesce',['feature-state','labelVisible'],1],['coalesce',['feature-state','nameEmphasis'],1],['case',['==',['get','scope'],'context'],.65,.92]],'text-halo-color':p.halo,'text-halo-width':1.4,'text-halo-blur':.5,'icon-color':p.secondaryText,'icon-opacity':['*',.65,['coalesce',['feature-state','labelVisible'],1]]}},
    {id:'selected-shore',type:'line',source:'selection',filter:kind('selection-water'),layout:round,paint:{'line-color':p.selected,'line-opacity':.55,'line-width':zoom(14,.8,19,1.2)}},
    {id:'endpoint-stems',type:'line',source:'selection',filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','kind'],'selection-water']],paint:{'line-color':p.route,'line-opacity':.7,'line-width':1}},
    {id:'endpoints',type:'circle',source:'selection',filter:kind('selection-marker'),paint:{'circle-radius':['case',['==',['get','role'],''],5,12],'circle-color':['case',['==',['get','role'],'A'],p.halo,p.route],'circle-stroke-color':p.route,'circle-stroke-width':1.5}},
    {id:'endpoint-letters',type:'symbol',source:'selection',filter:kind('selection-marker'),layout:{'text-field':['get','role'],'text-font':['Campus'],'text-size':11,'text-allow-overlap':true},paint:{'text-color':['case',['==',['get','role'],'A'],p.text,p.halo]}},
    {id:'endpoint-names',type:'symbol',source:'selection',filter:kind('selection-name'),layout:{'text-field':['get','name'],'text-font':['Campus'],'text-size':13,'text-anchor':['case',['boolean',['get','hasMarker'],false],'bottom','center'],'text-offset':['case',['boolean',['get','hasMarker'],false],['literal',[0,-endpointCaptionGap/13]],['literal',[0,0]]],'text-max-width':14,'text-allow-overlap':true,'text-pitch-alignment':'viewport','symbol-height-offset':0},paint:{'text-color':p.text,'text-halo-color':p.halo,'text-halo-width':2}},
    {id:'location-area',type:'fill',source:'location',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':p.location,'fill-opacity':.08}},
    {id:'location-ring',type:'line',source:'location',filter:['==',['geometry-type'],'Polygon'],paint:{'line-color':p.location,'line-width':1,'line-opacity':.35}},
    {id:'location-dot',type:'circle',source:'location',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':5.5,'circle-color':p.location,'circle-stroke-color':p.halo,'circle-stroke-width':2}},
  ];
  return layers;
}
