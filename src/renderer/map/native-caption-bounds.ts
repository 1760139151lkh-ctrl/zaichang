import type { Map as MapLibreMap } from 'maplibre-gl';
import type { FitInsets } from './fit-layout';

/** Read the pinned engine's placed text boxes, not a second text shaper.
 * Missing placement is a pending measurement, never a zero-size caption. */
export function nativeCaptionBounds(map: MapLibreMap, expected: Map<string, string>) {
  const placement = map.style?.placement;
  if (!placement || !expected.size) return undefined;
  const insets: FitInsets = { top: 13.5, right: 13.5, bottom: 13.5, left: 13.5 };
  const boxes: number[][] = [], seen = new Set<string>();
  for (const grid of [placement.collisionIndex.grid, placement.collisionIndex.ignoredGrid]) {
    const padX = (grid.width - placement.transform.width) / 2, padY = (grid.height - placement.transform.height) / 2;
    for (let i = 0; i < grid.boxKeys.length; i++) {
      const key = grid.boxKeys[i], retained = placement.retainedQueryData[key.bucketInstanceId];
      if (!retained) continue;
      const index = retained.featureIndex;
      if (!index.bucketLayerIDs[retained.bucketIndex]?.includes('endpoint-names')) continue;
      const layers = index.loadVTLayers(), layer = layers[index.sourceLayerCoder.decode(retained.sourceLayerIndex)];
      const feature = layer.feature(key.featureIndex), properties = feature.properties;
      const id = String(properties.id);
      if (!expected.has(id) || properties.kind !== 'selection-name' || properties.name !== expected.get(id)) continue;
      const anchor = feature.loadGeometry()[0]?.[0]; if (!anchor) continue;
      const p = placement.collisionIndex.projectAndGetPerspectiveRatio(anchor.x, anchor.y, retained.tileID.toUnwrapped(), 0);
      const b = grid.bboxes.slice(i * 4, i * 4 + 4);
      if (![...b,p.x,p.y].every(Number.isFinite)) continue;
      insets.left = Math.max(insets.left, p.x - b[0]); insets.right = Math.max(insets.right, b[2] - p.x);
      insets.top = Math.max(insets.top, p.y - b[1]); insets.bottom = Math.max(insets.bottom, b[3] - p.y);
      boxes.push([b[0]-padX,b[1]-padY,b[2]-padX,b[3]-padY]); seen.add(id);
    }
  }
  return seen.size === expected.size ? { insets, boxes } : undefined;
}
