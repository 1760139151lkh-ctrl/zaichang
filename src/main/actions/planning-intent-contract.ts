import { z } from 'zod';
import type { Action } from '../../shared/types';
import type { EffectAction, EffectReceipt, PlanningAttemptBasis } from '../../shared/harness';
export { planningAttemptBasisSchema, planningMaterialProvenanceSchema } from '../../shared/harness';
export type { PlanningAttemptBasis, PlanningMaterialProvenance } from '../../shared/harness';
import { planningDraftInput } from './planning-draft';

export type PlanningDraftRequest = z.infer<typeof planningDraftInput>;
const staticTask = planningDraftInput.shape.tasks.element.omit({ sourceId: true, sourceVersion: true, conditions: true });
export const planningStaticRequestSchema = planningDraftInput.omit({ busy: true, sourceCoverage: true, conditions: true, travelTimes: true, energyWindows: true })
  .extend({ tasks: z.array(staticTask).max(30) });
export type PlanningStaticRequest = z.infer<typeof planningStaticRequestSchema>;
export const planningRefreshRequirementSchema = z.object({
  kind: z.enum(['busy', 'travel', 'energy', 'source_coverage', 'task_source', 'condition', 'completion']),
  sourceId: z.string().max(160).optional(), sourceVersion: z.string().max(160).nullable().optional(), taskId: z.string().max(160).optional(),
  condition: z.string().max(300).optional().describe('需重新核实的条件描述，属于规划解释，不保留旧satisfied状态或当前外源事实。'),
}).strict();
export type PlanningRefreshRequirement = z.infer<typeof planningRefreshRequirementSchema>;
export const planningIntentSpecSchema = z.object({
  version: z.literal(1), interpretation: z.literal('model_interpretation_with_method_defaults'),
  request: planningStaticRequestSchema,
  requiredRefresh: z.array(planningRefreshRequirementSchema).max(2048),
  coverageMode: z.enum(['retained_local_interpretation', 'unestablished']).describe('仅保留有合法来源的规划解释，不宣称重新查过现实全部承诺。'),
}).strict();
export type PlanningIntentSpec = z.infer<typeof planningIntentSpecSchema>;
export interface PlanningIntentRef { id: string; revision: number; specDigest: string }
export interface PlanningAllocationBasis { calendarFingerprint: string; groupIds: string[] }
export interface PlanningRecordVersion { id: string; revision: number }
export interface RetainedWorkAnchor {
  id: string; taskId: string; segment: number; start: string; end: string; reservedStart: string; reservedEnd: string;
  durationMinutes: number; recordIds: string[]; recordVersions: PlanningRecordVersion[]; placeId?: string;
}
export interface RetainedBoundaryCoverage {
  id: string; start: string; end: string; restMinutes: number; travelMinutes: number;
  fromWorkId?: string; toWorkId?: string; fromTaskId?: string; toTaskId?: string;
  fromPlaceId?: string; toPlaceId?: string; recordIds: string[]; recordVersions: PlanningRecordVersion[];
}
export interface PlanningRetainedContext {
  work: RetainedWorkAnchor[]; boundaries: RetainedBoundaryCoverage[];
  scheduledTasks: { taskId: string; reservedEnd: string }[];
}
/** Exact prior proofs read to derive this ticket, excluding later preparations. */
/** Host-only. This is never part of planningDraftInput or a model tool schema. */
export interface PlanningHostContext {
  intent: PlanningIntentRef; allocationBasis: PlanningAllocationBasis; retained: PlanningRetainedContext;
  attemptBasis: PlanningAttemptBasis[];
}
export interface PlanningManifestUnit {
  blockId: string; kind: 'work' | 'transition' | 'protected'; order: number; start: string; end: string;
  argumentsDigest: string; argumentKeys: string[]; groupId?: string; boundaryId?: string;
}
export interface PlanningManifestGroup {
  id: string; taskId: string; segment: number; start: string; end: string; reservedStart: string; reservedEnd: string;
  durationMinutes: number; unitIds: string[]; placeId?: string;
}
export interface PlanningManifestBoundary {
  id: string; start: string; end: string; restMinutes: number; travelMinutes: number;
  fromWorkId?: string; toWorkId?: string; fromTaskId?: string; toTaskId?: string;
  fromPlaceId?: string; toPlaceId?: string; unitIds: string[];
}
export interface PlanningManifest {
  version: 1; planId: string; createdAt: string; timeZone: string; inputDigest: string; calendarFingerprint: string;
  allocationBasis: PlanningAllocationBasis; units: PlanningManifestUnit[]; groups: PlanningManifestGroup[]; boundaries: PlanningManifestBoundary[];
  sourceVersions: { sourceId: string; sourceVersion: string | null }[];
}
export interface PlanningAttemptRecord { planId: string; intentId: string; specDigest: string; manifest: PlanningManifest; createdAt: string }
export interface PlanningActionLink { planId: string; blockId: string; actionId: string; actionRevision: number; actionDigest: string }
export interface PlanningActionAttempt { id: string; actionId: string; idempotencyKey: string; status: string }
export interface PlanningAdoptionInput {
  intentId: string; specDigest: string; spec: PlanningIntentSpec; attempts: PlanningAttemptRecord[]; links: PlanningActionLink[];
  actions: EffectAction[]; actionAttempts: PlanningActionAttempt[]; receipts: EffectReceipt[]; calendar: Action[];
  calendarRevisions: Record<string, number>; now: string;
}
export interface PlanningUnitObservation {
  planId: string; blockId: string; status: 'never_prepared' | 'not_adopted' | 'intact' | 'partial' | 'changed' | 'deleted' | 'done_marked' | 'duplicate' | 'unavailable' | 'pending';
  recordId?: string; recordRevision?: number; actionId?: string; reason?: string;
}
export interface PlanningAdoptionProjection {
  status: 'ready' | 'needs_review'; reasons: string[]; observations: PlanningUnitObservation[];
  retained: PlanningRetainedContext; taskMinutes: { taskId: string; minutes: number; reservedEnd: string }[];
  dailyMinutes: { date: string; minutes: number }[]; allocatedMinutes: number; calendarFingerprint: string;
}
export interface PlanningReplanMaterialization {
  status: 'ready' | 'needs_review' | 'no_future_domain' | 'required_refresh'; request: PlanningDraftRequest | null;
  retained: PlanningRetainedContext; reasons: string[]; requiredRefresh: PlanningRefreshRequirement[];
}
