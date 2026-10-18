// Shared ground and building materials. Geometry and the transparent map canvas
// are independent of these cartographic colors.
export const darkMapPalette = {
  water: '#252c30',
  waterBank: '#788083',
  land: '#35372f',
  garden: '#3c4035',
  paving: '#4c4942',
  stage: '#6c604c',
  sportField: '#41483d',
  courtInlay: '#51574a',
  runningTrack: '#746554',
  building: '#90897c',
  roof: '#a69e8e',
  wall: '#867e71',
  glass: '#565c5e',
  recess: '#43494a',
  trim: '#a49b88',
  tile: '#767064',
  timber: '#62564a',
  selectedBuilding: '#a48e65',
  outline: '#a89b84',
  road: '#888176',
  minorRoad: '#6d685e',
  passage: '#383831',
  contextRoad: '#625d53',
  pathFade: '#42423b',
  roadCasing: '#1b1c1b',
  shadow: '#0c0f10',
  text: '#eeeadf',
  secondaryText: '#b9b3a4',
  halo: '#20211f',
  hover: '#b9ad8a',
  selected: '#e0c77e',
  route: '#ead18a',
  location: '#ead18a',
  barrier: '#787464',
};
export type MapPalette = typeof darkMapPalette;
export const lightMapPalette: MapPalette = {
  water: '#d3dadd',
  waterBank: '#89979b',
  land: '#e3e4da',
  garden: '#d5dbc9',
  paving: '#e9e4d9',
  stage: '#bca985',
  sportField: '#d1d7c7',
  courtInlay: '#bec9b2',
  runningTrack: '#c7b89f',
  building: '#d8d1c3',
  roof: '#e4ded1',
  wall: '#c4bbab',
  glass: '#a7b4ba',
  recess: '#8e9a9f',
  trim: '#e4dac5',
  tile: '#b5ac98',
  timber: '#9d8d74',
  selectedBuilding: '#c7ae75',
  outline: '#a8a08c',
  road: '#a69b89',
  minorRoad: '#beb4a2',
  passage: '#625c50',
  contextRoad: '#c2b9a9',
  pathFade: '#dfdbcf',
  roadCasing: '#e9e3d7',
  shadow: '#8a8475',
  text: '#373329',
  secondaryText: '#656050',
  halo: '#fffdf5',
  hover: '#b59b59',
  selected: '#8b6923',
  route: '#725114',
  location: '#725114',
  barrier: '#aaa18b',
};

// Stored material names retain their identity; equivalent architectural
// surfaces share one palette role instead of a second per-renderer theme.
export const surfaceMaterialTokens: Readonly<Record<string, keyof MapPalette>> = {
  dome: 'roof',
  roof: 'roof',
  skylight: 'trim',
  glass: 'glass',
  wall: 'wall',
  mullion: 'trim',
  seam: 'recess',
  garden: 'garden',
  'dorm-roof': 'roof',
  'dorm-wall': 'wall',
  'dorm-parapet': 'trim',
  'dorm-band': 'wall',
  'dorm-glass': 'glass',
  'dorm-window': 'recess',
  'tile-roof': 'tile',
  'stone-wall': 'wall',
  'facade-recess': 'recess',
  timber: 'timber',
  'academic-window': 'glass',
};

export const defaultLandSurface = { color: 'land', opacity: 0.45 } as const;
export const landSurfaceTokens: Readonly<Record<string, { color: keyof MapPalette; opacity: number }>> = {
  garden: { color: 'garden', opacity: 0.78 },
  paving: { color: 'paving', opacity: 1 },
  stage: { color: 'stage', opacity: 1 },
};

export function landSurfacePaint(palette: MapPalette, role: unknown) {
  const token = typeof role === 'string' && Object.hasOwn(landSurfaceTokens, role)
    ? landSurfaceTokens[role] : defaultLandSurface;
  return { color: palette[token.color], opacity: token.opacity };
}

export const defaultSportSurface = { color: 'sportField', opacity: 0.78 } as const;
export const sportSurfaceTokens: Readonly<Record<string, { color: keyof MapPalette; opacity: number }>> = {
  'indoor-venue': { color: 'building', opacity: 0.78 },
  'running-track': { color: 'runningTrack', opacity: 0.78 },
  'running-venue': { color: 'runningTrack', opacity: 0.78 },
  'track-apron': { color: 'runningTrack', opacity: 0.4 },
  'court-group': { color: 'sportField', opacity: 0.35 },
  'court-runoff': { color: 'sportField', opacity: 0.42 },
  'infield-surround': { color: 'sportField', opacity: 0.5 },
};

export function sportSurfacePaint(palette: MapPalette, role: unknown) {
  const token = typeof role === 'string' && Object.hasOwn(sportSurfaceTokens, role)
    ? sportSurfaceTokens[role] : defaultSportSurface;
  return { color: palette[token.color], opacity: token.opacity };
}
