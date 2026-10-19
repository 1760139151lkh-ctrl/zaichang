import { z } from 'zod';

/** A delivered original document range. Empty ranges carry metadata only. */
export const noteSourceProofSchema = z.object({
  id: z.string().regex(/^note-[a-f0-9-]{36}$/),
  revision: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  start: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  end: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict().refine(value => value.end >= value.start, '笔记片段范围不能倒置。');
export type NoteSourceProof = z.infer<typeof noteSourceProofSchema>;
