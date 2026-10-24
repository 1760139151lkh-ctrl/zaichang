import { z } from 'zod';

/** Address of one actually delivered local summary, never a second track store. */
export const workoutSourceProofSchema = z.object({
  workoutId: z.string().uuid(), schemaVersion: z.literal(1),
  revision: z.number().int().positive(), sampleRevision: z.number().int().nonnegative(),
  observedAt: z.string().datetime(), readAt: z.string().datetime(),
}).strict();
export type WorkoutSourceProof = z.infer<typeof workoutSourceProofSchema>;

/** One workout can be withdrawn without erasing independent local workouts. */
export const workoutSourceObjectId = (workoutId: string) => 'workout:' + z.string().uuid().parse(workoutId);

/** Only host-held successful observations can introduce this provenance. */
export function workoutObservationSources(raw: unknown): WorkoutSourceProof[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const result = raw as { sourceId?: unknown; status?: unknown;
    data?: { readAt?: unknown; current?: { id?: unknown; schemaVersion?: unknown;
      revision?: unknown; sampleRevision?: unknown; updatedAt?: unknown } | null } };
  if (result.sourceId !== 'workout:self' || !['fresh', 'partial', 'stale'].includes(String(result.status))) return [];
  const current = result.data?.current;
  if (!current) return [];
  return [workoutSourceProofSchema.parse({ workoutId: current.id, schemaVersion: current.schemaVersion,
    revision: current.revision, sampleRevision: current.sampleRevision,
    observedAt: current.updatedAt, readAt: result.data?.readAt })];
}
