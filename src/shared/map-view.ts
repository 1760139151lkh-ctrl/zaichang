import { z } from 'zod';

/** A finite public-map camera, in EPSG:3857 metres, map units per pixel and
 * radians. This is a viewing condition, never a device position or preference. */
export const mapViewSchema = z.object({
  center: z.tuple([z.number().finite(), z.number().finite()]),
  resolution: z.number().finite().positive(),
  rotation: z.number().finite(),
  pitch: z.number().finite().min(0).max(75),
}).strict();
export type MapView = z.infer<typeof mapViewSchema>;
