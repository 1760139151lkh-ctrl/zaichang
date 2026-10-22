import { z } from 'zod';
import { workSourceBindingSchema, workSourceRefSchema } from './harness';

const id = z.string().min(1).max(160);
const revision = z.number().int().positive();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const range = { start: z.number().int().nonnegative(), end: z.number().int().positive() };
const address = { id, revision, matterId: id, ...range };
const companionField = z.enum(['workingExplanation', 'nextStep', 'returnPoint']);
export const methodWorkHelpInputSchema = z.discriminatedUnion('owner', [
  z.object({ owner: z.literal('study_companion'), ...address, stepId: id, quote: z.string().min(1).max(12000) }).strict(),
  z.object({ owner: z.literal('companion_session'), ...address, field: companionField,
    messageId: id.optional(), sceneId: id.optional(), sceneRevision: revision.optional(), quote: z.string().min(1).max(1600) }).strict(),
]).refine(value => value.end > value.start, '须定位原来真正提供过的帮助。')
  .refine(value => value.owner !== 'companion_session' || [value.messageId, value.sceneId, value.sceneRevision].every(part => part === undefined)
    || [value.messageId, value.sceneId, value.sceneRevision].every(part => part !== undefined), '原页地址须完整；省略时由宿主按原owner精确版本找已发布页。');
export type MethodWorkHelpInput = z.infer<typeof methodWorkHelpInputSchema>;

export const methodHelpMaterialIdentitySchema = z.object({ resourceId: id, sha256: sha, version: revision,
  sourceEventId: id, contentVersion: revision, parentEventId: id,
  interpretation: z.enum(['retained_text_layer', 'retained_file_lifetime_only']),
}).strict();
export type MethodHelpMaterialIdentity = z.infer<typeof methodHelpMaterialIdentitySchema>;
/** Source identity of actual historical teaching text, never a second lesson. */
export const historicalWorkSourceSchema = z.object({ owner: z.literal('study_companion'), id, revision,
  sourceBinding: workSourceBindingSchema, sourceMaterial: methodHelpMaterialIdentitySchema.optional() }).strict();
export type HistoricalWorkSource = z.infer<typeof historicalWorkSourceSchema>;
const common = { ...address, sessionId: id, contentSha256: sha, fragmentSha256: sha,
  sourceBinding: workSourceBindingSchema };
const assistant = z.object({ messageId: id, ...range, contentSha256: sha,
  sourceRefs: z.array(workSourceRefSchema).min(1).max(32) }).strict();
/** Frozen source metadata only. The helping words remain with their original
 * study step or published message Scene; this is neither a second lesson nor
 * a claim that the user approved or completed that work. */
export const methodWorkHelpProofSchema = z.discriminatedUnion('owner', [
  z.object({ owner: z.literal('study_companion'), ...common, stepId: id,
    stepRefs: z.array(workSourceRefSchema).min(1).max(9), problemIdentitySha256: sha,
    material: methodHelpMaterialIdentitySchema.optional() }).strict(),
  z.object({ owner: z.literal('companion_session'), ...common, field: companionField,
    messageId: id, sceneId: id, sceneRevision: revision, runId: id,
    assistantMaterials: z.array(assistant).max(6), materials: z.array(methodHelpMaterialIdentitySchema).max(6),
    learningProcessRefs: z.array(z.object({ id, revision, sourceBinding: workSourceBindingSchema }).strict()).max(4).default([]) }).strict(),
]);
export type MethodWorkHelpProof = z.infer<typeof methodWorkHelpProofSchema>;
