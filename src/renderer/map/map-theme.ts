// Quiet geography; the active route is the visual priority. Canvas stays transparent.
export const darkMapPalette = {
  water: '#2d2f2b',
  land: '#35352f',
  paving: '#434338',
  sportField: '#3b4037',
  runningTrack: '#706657',
  building: '#646157',
  outline: '#a59b83',
  road: '#777369',
  minorRoad: '#53534b',
  text: '#eeeadf',
  secondaryText: '#b9b3a4',
  halo: '#20221e',
  hover: '#b9ad8a',
  selected: '#e0c77e',
  route: '#ead18a',
  location: '#ead18a',
  barrier: '#787464',
};
export const lightMapPalette = {
  water: '#e4e1d8',
  land: '#f2f0e7',
  paving: '#d8d3c3',
  sportField: '#d9d9c9',
  runningTrack: '#cac0a9',
  building: '#dedacd',
  outline: '#a8a08c',
  road: '#8d8779',
  minorRoad: '#c7c1b0',
  text: '#373329',
  secondaryText: '#656050',
  halo: '#fffdf5',
  hover: '#b59b59',
  selected: '#8b6923',
  route: '#89651b',
  location: '#89651b',
  barrier: '#aaa18b',
};
export type MapPalette = typeof darkMapPalette;

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
