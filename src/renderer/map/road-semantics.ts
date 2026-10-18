// Display roles only. Walking permissions remain owned by the route graph.
import { inactiveBridgeValues } from '../../shared/map-v3';
export const pedestrianHighways = ['path', 'footway', 'pedestrian', 'steps'];
export const coveredRoadTunnels = ['yes', 'building_passage', 'culvert'];
export const majorHighways = [
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential',
  'living_street', 'unclassified',
];

export function isPedestrianHighway(highway: unknown): boolean {
  return typeof highway === 'string' && pedestrianHighways.includes(highway);
}

export function isCoveredRoad(tunnel: unknown, covered?: unknown): boolean {
  return covered === 'yes' || typeof tunnel === 'string' && coveredRoadTunnels.includes(tunnel);
}

export function isBuildingPassage(tunnel: unknown, covered?: unknown): boolean {
  return tunnel === 'building_passage' || covered === 'yes' && tunnel !== 'yes' && tunnel !== 'culvert';
}

export const buildingPassageFilter: any = ['any', ['==', ['get','tunnel'], 'building_passage'],
  ['all', ['==', ['get','covered'], 'yes'], ['!', ['in', ['get','tunnel'], ['literal', ['yes','culvert']]]]]];

export const historicalBridgeFilter: any = ['in', ['get','bridge'], ['literal', [...inactiveBridgeValues]]];

export function isHistoricalBridge(bridge: unknown): boolean {
  return typeof bridge === 'string' && inactiveBridgeValues.has(bridge);
}

export function isMajorHighway(highway: unknown): boolean {
  return typeof highway === 'string' && majorHighways.includes(highway);
}
