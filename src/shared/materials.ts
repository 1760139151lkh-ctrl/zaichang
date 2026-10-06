import { z } from 'zod';

/** A host-issued reference to a selected snapshot. It contains no filesystem
 * path, evidence ID or authority that a renderer could choose. */
export const materialReferenceSchema = z.object({
  resourceId: z.string().regex(/^material-[a-f0-9-]{36}$/),
  accessKey: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1).max(260),
  mediaType: z.enum(['text/plain', 'text/markdown', 'application/pdf']),
  byteLength: z.number().int().nonnegative().max(20_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.literal(1),
}).strict();
export type MaterialReference = z.infer<typeof materialReferenceSchema>;
export const materialCropSchema = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
}).strict().refine(value => value.x + value.width <= 1 && value.y + value.height <= 1);
export const MATERIAL_LIMITS = { bytes: 20_000_000, pending: 8, textCodePoints: 2_000_000, readCodePoints: 16000, pages: 200, imageDataUrl: 3_000_000 } as const;
