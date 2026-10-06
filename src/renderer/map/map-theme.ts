// Quiet geography; the active route is the visual priority. Canvas stays transparent.
export const darkMapPalette = {
  water: '#2d2f2b',
  land: '#35352f',
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
