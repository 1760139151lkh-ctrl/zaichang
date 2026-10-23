import { z } from 'zod';

const id = z.string().min(1).max(160);
export const personalMapPointSelectorSchema = z.object({
  profileId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), pointId: id,
}).strict();
export const personalMapPointProofSchema = personalMapPointSelectorSchema.extend({
  mapVersion: id, sha256: z.string().regex(/^[a-f0-9]{64}$/), publicPointId: id.optional(),
}).strict();
export type PersonalMapPointSelector = z.infer<typeof personalMapPointSelectorSchema>;
export type PersonalMapPointProof = z.infer<typeof personalMapPointProofSchema>;

export const spatialEndpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('public'), pointId: id }).strict(),
  personalMapPointSelectorSchema.extend({ kind: z.literal('personal') }).strict(),
]);
/** An accepted configuration keeps its own business identity. The original
 * request address is lifecycle metadata, never permission to quote its body. */
export const spatialBindingSchema = z.object({
  version: z.literal(1), endpoint: spatialEndpointSchema,
  basis: z.object({ eventId: id, contentVersion: z.number().int().positive(),
    start: z.number().int().nonnegative(), end: z.number().int().positive(),
    quoteSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict().refine(value => value.end > value.start),
}).strict();
export type SpatialBinding = z.infer<typeof spatialBindingSchema>;

/** Only an actual host-qualified binding or native selection can introduce
 * a personal endpoint. No coordinates or original conversation words. */
export const spatialSourceProofSchema = z.object({
  version: z.literal(1),
  origin: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('binding'), id, revision: z.number().int().positive() }).strict(),
    z.object({ kind: z.literal('selection'), id }).strict(),
  ]),
  point: personalMapPointProofSchema.optional(),
}).strict();
export type SpatialSourceProof = z.infer<typeof spatialSourceProofSchema>;
