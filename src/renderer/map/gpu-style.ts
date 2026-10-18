import type { FlatStyleLike } from 'ol/style/flat';
import { defaultLandSurface, landSurfaceTokens, defaultSportSurface, sportSurfaceTokens, type MapPalette } from './map-theme';
import { pedestrianHighways, coveredRoadTunnels, majorHighways, buildingPassageFilter, historicalBridgeFilter } from './road-semantics';
const alpha = (hex: string, a: number) => {
  const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  return `rgba(${r},${g},${b},${a})`;
};
/** V3 planar compatibility view; spatial rendering is owned by map-engine. */
export function planarGpuStyle(p: MapPalette, contrast = false, waterKind: 'water' | 'water-surface' = 'water'): FlatStyleLike {
  const kind = (name: string) => ['==', ['get', 'kind'], name];
  const context = ['==', ['get', 'scope'], 'context'];
  const near = ['==', ['var', 'near'], 1];
  const sports = ['==', ['var','sports'], 1], equipment = ['==', ['var','equipment'], 1];
  const major = ['in', ['get', 'highway'], ['literal', majorHighways]];
  const path = ['in', ['get', 'highway'], ['literal', pedestrianHighways]];
  const pedestrianArea = kind('pedestrian-area');
  const coveredRoad = ['any', ['in', ['get', 'tunnel'], ['literal', coveredRoadTunnels]], ['==', ['get','covered'], 'yes']];
  const bridge = ['==', ['get','bridge'], 'yes'];
  const roadFilter = ['all', kind('road'), ['!', historicalBridgeFilter]];
  const coveredWater = ['in', ['get','tunnel'], ['literal', ['culvert','yes']]];
  const width = ['case', major, ['case', near, 2.8, 1.9], path, ['case', near, 1.05, 0.7], 1.2];
  const roadColor = ['case', path, p.minorRoad, context, p.contextRoad, p.road];
  const landColor = ['match', ['get','role'], ...Object.entries(landSurfaceTokens).flatMap(([role, token]) => [role, alpha(p[token.color], token.opacity)]), alpha(p[defaultLandSurface.color], defaultLandSurface.opacity)];
  const sportColor = ['match', ['get','role'], ...Object.entries(sportSurfaceTokens).flatMap(([role, token]) => [role, alpha(p[token.color], token.opacity)]), alpha(p[defaultSportSurface.color], defaultSportSurface.opacity)];
  return [
    { filter: kind('land'), style: { 'fill-color': landColor } },
    {
      filter: kind('area'),
      style: { 'stroke-color': alpha(p.outline, 0.23), 'stroke-width': 0.65, 'stroke-line-dash': [3, 5] },
    },
    { filter: kind(waterKind), style: { 'stroke-color': alpha(p.waterBank, 0.48), 'stroke-width': 1.4 } },
    { filter: ['all', kind('waterway'), ['!', coveredWater]], style: { 'stroke-color': p.water, 'stroke-width': ['case', near, 3.5, 2] } },
    { filter: ['all', kind('waterway'), coveredWater], style: { 'stroke-color': alpha(p.waterBank, .5), 'stroke-width': .9, 'stroke-line-dash': [2, 3], 'stroke-line-cap': 'butt' } },
    {
      filter: kind(waterKind),
      style: { 'fill-color': p.water },
    },
    { filter: kind('sport'), style: { 'fill-color': sportColor, 'stroke-color': p.outline, 'stroke-width': .9 } },
    { filter: ['all', sports, kind('court-inlay')], style: { 'fill-color': alpha(p.courtInlay, .5) } },
    { filter: ['all', sports, ['in', ['get','kind'], ['literal',['marking','track-lane','net','landscape-step']]]], style: {
      'stroke-color': ['case', kind('landscape-step'), alpha(p.outline,.42), kind('net'), alpha(p.text,.55), alpha(p.text,.42)],
      'stroke-width': ['case', kind('net'), 1, kind('track-lane'), .7, .8], 'stroke-line-cap': 'round', 'stroke-line-join': 'round',
    } },
    { filter: ['all', equipment, kind('equipment')], style: { 'stroke-color': alpha(p.text,.42), 'stroke-width': 1.1, 'stroke-line-cap': 'round', 'stroke-line-join': 'round' } },
    {
      filter: kind('landmark'),
      style: {
        'fill-color': [255, 255, 255, 0.16],
        'stroke-color': p.selected,
        'stroke-width': 1.2,
        'stroke-line-dash': [3, 2],
      },
    },
    { filter: pedestrianArea, style: {
      'fill-color': ['case', context, alpha(p.paving, .35), p.paving],
      'stroke-color': alpha(p.outline, .3), 'stroke-width': .65,
    } },
    {
      filter: ['all', roadFilter, coveredRoad, ['!',buildingPassageFilter]],
      style: { 'stroke-color': ['case', context, alpha(p.contextRoad,.55), path, alpha(p.minorRoad,.55), alpha(p.road,.55)], 'stroke-width': width, 'stroke-line-dash': [3, 4], 'stroke-line-cap': 'butt', 'stroke-line-join': 'round' },
    },
    {
      filter: ['all', roadFilter, ['!', coveredRoad], ['!',bridge], ['!=', ['get', 'highway'], 'steps']],
      style: {
        'stroke-color': roadColor,
        'stroke-width': width,
        'stroke-line-cap': 'round',
        'stroke-line-join': 'round',
      },
    },
    {
      filter: ['all', roadFilter, ['==', ['get', 'highway'], 'steps'], ['!', coveredRoad], ['!',bridge]],
      style: { 'stroke-color': roadColor, 'stroke-width': width, 'stroke-line-dash': [1, 2], 'stroke-line-cap': 'butt', 'stroke-line-join': 'round' },
    },
    { filter: ['all', kind('road'), historicalBridgeFilter], style: {
      'stroke-color': alpha(p.minorRoad,.8), 'stroke-width': width, 'stroke-line-dash': [1,3], 'stroke-line-cap':'butt', 'stroke-line-join':'round',
    } },
    { filter: ['all', roadFilter, bridge], style: {
      'stroke-color': p.roadCasing, 'stroke-width': ['+',width,2.4], 'stroke-line-cap':'butt', 'stroke-line-join':'round',
    } },
    { filter: ['all', roadFilter, bridge], style: {
      'stroke-color': roadColor, 'stroke-width': width, 'stroke-line-cap':'round', 'stroke-line-join':'round',
    } },
    {
      filter: kind('building'),
      style: {
        'fill-color': ['case', context, alpha(p.building, 0.7), p.building],
        'stroke-color': [
          'case',
          context,
          alpha(contrast ? p.text : p.outline, 0.65),
          contrast ? p.text : p.outline,
        ],
        'stroke-width': ['case', near, 0.85, 0.65],
      },
    },
    { filter: ['all', kind('barrier'), near], style: { 'stroke-color': p.barrier, 'stroke-width': 0.8 } },
    { filter: ['all',roadFilter,buildingPassageFilter], style: {
      'stroke-color': alpha(p.passage,.85),
      'stroke-width': width, 'stroke-line-dash': [3,4], 'stroke-line-cap':'butt', 'stroke-line-join':'round',
    } },
  ] as FlatStyleLike;
}
