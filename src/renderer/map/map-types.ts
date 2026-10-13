import type { MapOverview, MapPoint } from '../../shared/map-v2';
import type { MapVenue } from '../../shared/map-v3';

export interface SavedCamera {
  center: number[];
  resolution: number;
  rotation: number;
  pitch?: number;
  scale?: { meters: number; width: number; reference: string };
}
export interface MapData {
  manifest: MapOverview;
  places: MapPoint[];
  geography: object;
  sports?: object;
  venues?: MapVenue[];
}
export interface MapCallbacks {
  choose: (p: MapPoint) => void;
  candidates: (ps: MapPoint[]) => void;
  hover: (p?: MapPoint) => void;
  blank: () => void;
  camera: (camera: SavedCamera) => void;
  user: () => void;
  ready: () => void;
  error?: (message: string) => void;
}
