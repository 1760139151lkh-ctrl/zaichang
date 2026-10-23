import { z } from 'zod';

const id = z.string().min(1).max(160);
/** Finite native route conditions, re-read by the host against this map and
 * profile version. No coordinates, display prose or execution permission. */
export const sharedMapRouteSchema = z.object({
  fromId: id,
  toId: id,
  fromKind: z.enum(['place', 'node']).optional(),
  toKind: z.enum(['place', 'node']).optional(),
  mapVersion: id,
  profileRevision: id.optional(),
  originAccessId: id.optional(),
  destinationAccessId: id.optional(),
  avoidStairs: z.boolean().default(false),
  allowConditional: z.boolean().default(false),
}).strict();
export type SharedMapRoute = z.infer<typeof sharedMapRouteSchema>;
export const mapRouteReferenceSchema = z.object({ selectionId: z.string().uuid() }).strict();
export type MapRouteReference = z.infer<typeof mapRouteReferenceSchema>;
