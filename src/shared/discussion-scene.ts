import { z } from 'zod';
import { workSourceBindingSchema, workSourceRefSchema } from './harness';
import type { SceneRef, SceneSource } from './scenes';
import { companionSceneProjectionSchema } from './companion-session';

const id = z.string().min(1).max(160);
const revision = z.number().int().positive();
export const discussionArtworkSchema = z.object({
  assetId: z.enum(['night_bridge', 'lamp_letter']),
  optionId: id.optional(),
}).strict();
export type DiscussionArtwork = z.infer<typeof discussionArtworkSchema>;
const sourceQuote = z.object({ eventId: id, contentVersion: revision,
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
  quote: z.string().min(1).max(4000),
}).strict().refine(source => Number.isSafeInteger(source.start) && Number.isSafeInteger(source.end) && source.end > source.start);

/** A reference for the next utterance. Looking at a branch never chooses it. */
export const discussionFocusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('discussion_point'), pointId: id }).strict(),
  z.object({ kind: z.literal('discussion_option'), optionId: id }).strict(),
]);
export type DiscussionFocus = z.infer<typeof discussionFocusSchema>;

export const discussionPointSchema = z.object({
  id,
  role: z.enum(['anchor', 'condition', 'decision', 'thought', 'participation', 'open_question', 'next_step']),
  text: z.string().min(1).max(4000),
  origin: z.enum(['user_quote', 'source_bound_summary', 'recorded_decision', 'assistant_thought', 'assistant_proposal']),
  source: sourceQuote.optional(),
  /** All these original ranges must remain usable; this is not a new fact. */
  sourceRefs: z.array(workSourceRefSchema).min(1).max(32),
}).strict();
export type DiscussionPoint = z.infer<typeof discussionPointSchema>;

export const discussionBranchSchema = z.object({
  id, revision, title: z.string().min(1).max(400),
  kind: z.enum(['option', 'plan']), status: z.string().min(1).max(50),
  rationale: z.string().max(1200).nullable(),
  /** This is the existing matter choice, not an effect of scene focus. */
  selected: z.boolean(),
  sourceRefs: z.array(workSourceRefSchema).min(1).max(32),
}).strict();
export type DiscussionBranch = z.infer<typeof discussionBranchSchema>;

/** Another owner keeps its teaching/work state and performs its own reads.
 * The discussion carries only a real address, never a copied lesson or ledger. */
export const discussionModuleRefSchema = z.object({
  owner: z.enum(['study_companion', 'co_work']), id, revision,
  matterId: id, currentStepId: id.optional(),
  sourceBinding: workSourceBindingSchema,
}).strict();
export type DiscussionModuleRef = z.infer<typeof discussionModuleRefSchema>;

export const discussionContinuitySchema = z.object({
  relation: z.enum(['first', 'unchanged', 'revised']),
  previous: z.object({ id, revision, matterRevision: revision }).strict().nullable(),
  addedPointIds: z.array(id).max(80), changedPointIds: z.array(id).max(80), removedPointIds: z.array(id).max(80),
  addedOptionIds: z.array(id).max(64), changedOptionIds: z.array(id).max(64), removedOptionIds: z.array(id).max(64),
  focus: discussionFocusSchema.nullable(),
  focusRelation: z.enum(['none', 'explicit', 'retained', 'changed', 'removed']),
}).strict();

export const discussionContentSchema = z.object({
  sessionId: id,
  matter: z.object({ id, revision, title: z.string().min(1).max(400),
    question: z.string().min(1).max(4000), needsReview: z.boolean() }).strict(),
  points: z.array(discussionPointSchema).max(80),
  branches: z.array(discussionBranchSchema).max(64),
  modules: z.array(discussionModuleRefSchema).max(8),
  coWork: z.array(companionSceneProjectionSchema).max(8),
  artwork: z.array(discussionArtworkSchema).max(2),
  provenance: z.object({
    sourceBinding: workSourceBindingSchema,
    optionRefs: z.array(z.object({ id, revision }).strict()).max(64),
  }).strict(),
  coverage: z.object({
    declaredOptionCount: z.number().int().nonnegative(), returnedOptionCount: z.number().int().nonnegative(),
    unavailableOptionCount: z.number().int().nonnegative(),
    withheldInterpretations: z.boolean(),
    /** A legacy whole-source dependency is conservatively kept whole. */
    legacySourceIds: z.array(id).max(128),
  }).strict(),
}).strict();
export type DiscussionContent = z.infer<typeof discussionContentSchema>;

/** A host projection of one existing conversation frame, not a second owner.
 * Interpretation, a suggested next step and a remembered choice remain distinct. */
export interface DiscussionScene extends SceneRef, DiscussionContent {
  kind: 'discussion';
  createdAt: string;
  source: SceneSource;
  continuity: z.infer<typeof discussionContinuitySchema>;
  /** A source-checked former page. Its words remain the words shown then;
   * the current owner must be read before changing the matter. */
  history?: { currentMatterRevision: number; currentStatus: string };
}
export interface DiscussionSnapshotMetadata {
  sessionId: string;
  matter: Pick<DiscussionContent['matter'], 'id' | 'revision' | 'needsReview'>;
  createdAt: string;
  sourceBinding: DiscussionContent['provenance']['sourceBinding'];
}

export interface VerifiedDiscussionFocus {
  target: DiscussionFocus;
  matter: { id: string; revision: number };
  label: string;
  point?: DiscussionPoint;
  branch?: DiscussionBranch;
  sourceBinding: DiscussionContent['provenance']['sourceBinding'];
  viewedMatterRevision?: number;
  historicalReference?: boolean;
  meaning: string;
}
