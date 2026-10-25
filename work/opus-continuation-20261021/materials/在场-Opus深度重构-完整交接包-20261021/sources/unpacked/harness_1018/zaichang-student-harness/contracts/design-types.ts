/**
 * 在场 Harness 的逻辑契约草案，2026-10-18。
 * 不导入生产，不据此另建服务；先映射现有 repository/domain/work/action 类型。
 * 此文件本身不授予读取或动作权限，不包含用户数据。
 */
export type Id = string;
export type Revision = number;
export type Instant = string; // RFC3339, with timezone offset; validate at boundary.
export type TimeZone = string; // IANA identifier; not a fixed UTC offset.
export type OpenText = string;

export interface TimeWindow {
  startsAt: Instant;
  endsAt: Instant;
  timeZone: TimeZone;
}

export interface EvidenceRef {
  sourceId: Id;
  recordId: Id;
  sourceVersion: string;
  locator?: string; // Original message span, document page/range, API record.
  subjectRef: Id;
  observedAt?: Instant;
  learnedAt: Instant;
  validFor?: TimeWindow;
  usePolicyRef: Id; // Host-owned existing permission/retention policy reference.
}

export type CoverageState =
  | 'complete_for_query'
  | 'partial'
  | 'not_connected'
  | 'not_authorized'
  | 'not_queried'
  | 'stale'
  | 'failed'
  | 'conflicting';

export interface Observation<T = unknown> {
  id: Id;
  revision: Revision;
  data?: T;
  evidence: EvidenceRef[];
  fetchedAt: Instant;
  validFor?: TimeWindow;
  coverage: { state: CoverageState; queryScope: OpenText; gaps: OpenText[] };
  businessFingerprint: string; // Excludes mere fetchedAt refresh.
}

export interface ChangeEnvelope {
  eventId: Id;
  userScopeRef: Id; // Assigned by host, never trusted from model output.
  sourceId: Id;
  objectRef: Id;
  sourceVersion: string;
  operation: 'upsert' | 'tombstone' | 'correction' | 'permission_changed' | 'time_wake';
  occurredAt?: Instant;
  receivedAt: Instant;
  payloadRef: Id;
  previousVersion?: string;
  dedupeKey: string;
  usePolicyRevision: Revision;
}

export interface DependencyRef {
  kind: 'fact' | 'goal' | 'commitment' | 'rule' | 'location' | 'weather' | 'permission' | 'assumption';
  ref: Id;
  version: string;
  requiredFor: 'preparation' | 'presentation' | 'execution';
  validUntil?: Instant;
}

export interface InitiativeMandate {
  id: Id;
  revision: Revision;
  source: 'user_declared' | 'user_edited';
  basis: EvidenceRef[];
  purpose: OpenText;
  goalRefs: Id[];
  sourceScopeRefs: Id[]; // Must intersect current permissions at use time.
  permittedHelp: OpenText;
  actionGrantRefs: Id[]; // Empty does not prohibit useful read-only preparation.
  validFor?: TimeWindow;
  status: 'active' | 'paused' | 'ended';
  stopConditions: OpenText[];
  interactionPolicyRef: Id;
}

export interface SituationSnapshot {
  id: Id;
  revision: Revision;
  asOf: Instant;
  timeZone: TimeZone;
  currentInputRef?: Id;
  matterRefs: Id[];
  goalRefs: Id[];
  commitmentRefs: Id[];
  observationRefs: Id[];
  userDeclaredStateRefs: Id[];
  relevantMemoryRefs: Id[];
  mandateRefs: Id[];
  dependencies: DependencyRef[];
  unknowns: OpenText[];
  processedThrough?: number;
  processingGaps: number[];
  sourceCoverage: Array<{ sourceRef: Id; state: CoverageState; scope: OpenText }>;
}

export type Participation = 'none' | 'prepare' | 'wait' | 'ask' | 'offer' | 'act';
export interface OpportunityProposal {
  id: Id;
  revision: Revision;
  mandateRef: Id;
  matterRef?: Id;
  triggerRefs: Id[];
  relevance: OpenText; // Why this helps this person now; not a probability.
  benefit: OpenText;
  missingFacts: OpenText[];
  feasibleWindows: TimeWindow[];
  latestActionAt?: Instant;
  nextReviewAt?: Instant;
  dependencies: DependencyRef[];
  participation: Participation;
  preparedArtifactRefs: Id[];
  stopConditions: OpenText[];
}

export interface PlanProposal {
  id: Id;
  revision: Revision;
  snapshotRef: Id;
  basedOnCalendarRevision: Revision;
  goalRefs: Id[];
  changes: Array<{
    objectRef?: Id;
    operation: 'create' | 'update' | 'cancel';
    proposedWindow?: TimeWindow;
    content: OpenText;
    expectedRevision?: Revision;
  }>;
  fixedCommitmentRefs: Id[];
  dependencies: DependencyRef[];
  feasibility: 'verified_for_known_constraints' | 'conditional' | 'infeasible';
  assumptions: OpenText[];
  tradeoffs: OpenText[];
  acceptance: { state: 'proposed' | 'accepted' | 'rejected' | 'superseded'; grantRef?: Id };
}

export interface PersonaCore {
  id: Id;
  revision: Revision;
  authoredBy: 'user' | 'preset';
  name: string;
  roleDescription: OpenText;
  fictionalPresentation?: OpenText;
  voice: OpenText;
  examples: Array<{ context: OpenText; response: OpenText }>;
  unfinishedFields: string[];
  // No private legacy guidance, user life facts, model tokens or action grants.
}

export interface LearnedAccommodation {
  id: Id;
  revision: Revision;
  authority: 'inferred'; // More evidence never silently changes this to declared.
  content: OpenText;
  conditions: OpenText[];
  evidence: EvidenceRef[];
  validFor?: TimeWindow;
  status: 'proposed' | 'active' | 'rejected' | 'retired';
}

export interface ScopedForget {
  targetRefs: Id[];
  operation: 'retire_inference' | 'stop_use' | 'delete_source' | 'stop_reextraction';
  purposeRefs?: Id[];
  preserveIndependentAcceptedObjects: boolean;
  basis: EvidenceRef[];
}

export interface WorkerAssignment {
  id: Id;
  parentWorkRef: Id;
  goal: OpenText;
  inputRefs: Id[];
  snapshotRef: Id;
  dependencies: DependencyRef[];
  allowedCapabilityRefs: Id[];
  budgetRef: Id; // A host-enforced shared parent budget.
  cancelWhen: OpenText[];
  outputContract: OpenText;
}

export interface WorkerResult {
  workRef: Id;
  status: 'completed' | 'partial' | 'failed' | 'cancelled' | 'superseded';
  facts: Array<{ content: OpenText; evidence: EvidenceRef[] }>;
  recommendations: OpenText[];
  unknowns: OpenText[];
  artifactRefs: Id[];
  basedOnDependencies: DependencyRef[];
  consumedByParentAt?: Instant;
}

export interface DurableJob {
  id: Id;
  workRef: Id;
  nextRunAt: Instant;
  ownerRef?: Id;
  leaseUntil?: Instant;
  fencingToken: Revision;
  attempt: number;
  idempotencyKey: string;
  state: 'queued' | 'running' | 'waiting' | 'resolved' | 'cancelled' | 'expired';
  dependencies: DependencyRef[];
  checkpointRef?: Id;
  lastFailure?: OpenText;
}

export interface PresentationReceipt {
  opportunityRef: Id;
  opportunityRevision: Revision;
  channel: 'conversation' | 'in_app' | 'os_notification';
  status: 'prepared' | 'submitted' | 'delivered' | 'seen' | 'failed' | 'unknown';
  recordedAt: Instant;
  evidenceRef?: Id; // submitted alone cannot justify delivered or seen.
  idempotencyKey: string;
}

export interface EffectReceipt {
  actionRef: Id;
  idempotencyKey: string;
  status: 'prepared' | 'authorized' | 'submitting' | 'succeeded' | 'failed' | 'unknown';
  targetRevision?: Revision;
  evidenceRef?: Id;
  recheckCapabilityRef?: Id;
}

// Host must recheck current dependencies/permissions before publish/execute.
// Do not interpret these schemas as an obligatory questionnaire for every turn.
