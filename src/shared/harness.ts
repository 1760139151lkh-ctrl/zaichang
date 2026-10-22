import { z } from 'zod';
import { programNodeIdSchema } from './interactive-program';
import { planningOfferSchema } from './planning-offer';

export const objectId = z.string().min(1).max(160);
export const instant = z.string().datetime({ offset: true });
export const knowledgeStatus = z.enum([
  'fresh',
  'partial',
  'not_connected',
  'stale',
  'conflict',
  'not_queried',
  'not_found',
  'failed',
  'forbidden',
  'unsupported',
  'known_absent',
  'unknown',
]);
export type KnowledgeStatus = z.infer<typeof knowledgeStatus>;
export const typedValue = z.discriminatedUnion('type', [
  z.object({ type: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({ type: z.literal('text'), value: z.string().max(4000) }).strict(),
  z.object({ type: z.literal('entity'), value: objectId }).strict(),
  z
    .object({
      type: z.literal('quantity'),
      value: z.number().finite(),
      unit: z.string().min(1).max(40),
      dimension: z.string().min(1).max(60),
    })
    .strict(),
  z.object({ type: z.literal('instant'), value: instant }).strict(),
  z.object({ type: z.literal('unknown'), reason: z.string().max(300) }).strict(),
]);
export type TypedValue = z.infer<typeof typedValue>;
export type Condition =
  | { op: 'all' | 'any'; terms: Condition[] }
  | { op: 'not'; term: Condition }
  | {
      op: 'compare';
      predicate: string;
      comparator: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';
      value: TypedValue;
    }
  | { op: 'known'; predicate: string }
  | { op: 'unknown'; reason: string };
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.enum(['all', 'any']), terms: z.array(conditionSchema).max(32) }).strict(),
    z.object({ op: z.literal('not'), term: conditionSchema }).strict(),
    z
      .object({
        op: z.literal('compare'),
        predicate: objectId,
        comparator: z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte']),
        value: typedValue,
      })
      .strict(),
    z.object({ op: z.literal('known'), predicate: objectId }).strict(),
    z.object({ op: z.literal('unknown'), reason: z.string().max(300) }).strict(),
  ]),
);
export const always: Condition = { op: 'all', terms: [] };
export type Truth = 'true' | 'false' | 'unknown';

export const locatorSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('text'),
        eventId: objectId,
        contentVersion: z.number().int().positive(),
        startCodePoint: z.number().int().nonnegative(),
        endCodePoint: z.number().int().positive(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('file'),
        artifactId: objectId,
        version: z.number().int().positive(),
        page: z.number().int().positive().optional(),
        paragraphId: objectId.optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('image'),
        artifactId: objectId,
        version: z.number().int().positive(),
        region: z.tuple([
          z.number().min(0).max(1),
          z.number().min(0).max(1),
          z.number().positive().max(1),
          z.number().positive().max(1),
        ]),
        objectId: objectId.optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('audio'),
        artifactId: objectId,
        version: z.number().int().positive(),
        startMs: z.number().int().nonnegative(),
        endMs: z.number().int().positive(),
        transcriptVersion: z.number().int().positive().optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('structured'),
        snapshotId: objectId,
        jsonPointer: z.string().regex(/^(?:\/(?:[^~]|~[01])*)*$/),
        sourceRecordId: objectId,
      })
      .strict(),
  ])
  .superRefine((loc, ctx) => {
    if (loc.kind === 'text' && loc.endCodePoint <= loc.startCodePoint)
      ctx.addIssue({ code: 'custom', message: 'Empty/reversed span' });
    if (loc.kind === 'audio' && loc.endMs <= loc.startMs)
      ctx.addIssue({ code: 'custom', message: 'Reversed audio interval' });
    if (loc.kind === 'image' && (loc.region[0] + loc.region[2] > 1 || loc.region[1] + loc.region[3] > 1))
      ctx.addIssue({ code: 'custom', message: 'Region outside image' });
  });
export type EvidenceLocator = z.infer<typeof locatorSchema>;
export const labelSchema = z
  .object({
    purpose: z.string().min(1).max(80).default('personal_assistance'),
    audience: z.enum(['self', 'group', 'public']).default('self'),
    retention: z.enum(['purpose_scoped', 'history_no_inference', 'session_only']).default('purpose_scoped'),
    sensitivity: z.enum(['public', 'personal', 'restricted']).default('personal'),
    infer: z.boolean().default(true),
    expiresAt: instant.optional(),
  })
  .strict();
export type PolicyLabel = z.infer<typeof labelSchema>;
export const personalLabel: PolicyLabel = labelSchema.parse({});
export interface HostIdentity {
  principalId: string;
  workspaceId: string;
  deviceId: string;
}
declare const scopeBrand: unique symbol;
export interface ScopeHandle {
  readonly id: string;
  readonly [scopeBrand]: true;
}
export interface ClockPort {
  now(): string;
  monotonicMs(): number;
}
export interface ScopeData extends HostIdentity {
  subjectId: string;
  worldId: string;
  sources: readonly string[];
  currentEventIds: readonly string[];
  purposes: readonly string[];
  audience: 'self' | 'group' | 'public';
  grants: readonly string[];
  privacyEpoch: number;
  policyRevision: number;
  retention: PolicyLabel['retention'];
  infer: boolean;
  expiresAt: string;
  child: boolean;
}
export interface ContextContract {
  enhancements?: { prefetch?: boolean; currentMatter?: boolean; repairRejudge?: boolean; closure?: boolean; applicability?: boolean; cooperationHistory?: boolean; opportunities?: boolean; interaction?: boolean; lightPrinciples?: boolean };
  id: string;
  revision: number;
  scope: ScopeHandle;
  subjectId: string;
  worldId: string;
  memoryMode: 'relevant' | 'current_sources_only' | 'session_only' | 'none';
  retention: PolicyLabel['retention'];
  audience: ScopeData['audience'];
  purpose: string;
  interactionMode: 'listen' | 'clarify' | 'analyze' | 'suggest_next' | 'tutor_hint' | 'direct_answer';
  actionMode: 'respond' | 'read' | 'propose';
  exploration: boolean;
  privacyEpoch: number;
  policyRevision: number;
  timeZone: string;
  now: string;
  budget: {
    /** Legacy persisted fields only. Material/token counts do not grant or
     * withhold reads, and cumulative model/tool counts are not run quotas. */
    maxTokens?: number;
    maxRows: number;
    maxReadBytes?: number;
    toolCalls?: number;
    modelCalls?: number;
    dependencyDepth: number;
  };
  excludedReasons: string[];
  temporalAmbiguities: string[];
  resolvedDates: string[];
  /**
   * A host-validated, editable interpretation of the authored turn.  It is
   * deliberately optional so older callers which construct ContextContract
   * literals continue to work.  This is descriptive routing data, never an
   * authorization token; all effects still require the ScopeHandle below.
   */
  interpretation?: InterpretationProposal;
}

/** Small, source-anchored intents used to keep mixed requests separate. */
export type RequestIntent =
  | 'listen'
  | 'reflect'
  | 'record_local'
  | 'retrieve'
  | 'plan'
  | 'hypothesis'
  | 'correction'
  | 'quote'
  | 'other';

export interface RequestFragment {
  id: string;
  startCodePoint: number;
  endCodePoint: number;
  text: string;
  subjectId: string;
  worldId: string;
  intents: RequestIntent[];
  readSources: ('campus' | 'history' | 'weather' | 'map' | 'local' | 'capability')[];
  /** Participation posture is independent from effects (e.g. listen + record_local). */
  participation?: 'listen' | 'reflect' | 'analyze' | 'act';
  audience: 'self' | 'group' | 'public';
  constraints: string[];
  unresolvedReferences: string[];
  confidence: 'clear' | 'ambiguous';
}

export interface InterpretationProposal {
  fragments: RequestFragment[];
  hasListen: boolean;
  hasRetrieval: boolean;
  explicitLocalWrite: boolean;
  /** True only when an explicit local write is fully scoped to the real owner. */
  directLocalWrite: boolean;
}
export const requestFragmentSchema = z
  .object({
    id: objectId,
    startCodePoint: z.number().int().nonnegative(),
    endCodePoint: z.number().int().positive(),
    text: z.string().max(250000),
    subjectId: objectId,
    worldId: objectId,
    intents: z.array(
      z.enum(['listen', 'reflect', 'record_local', 'retrieve', 'plan', 'hypothesis', 'correction', 'quote', 'other']),
    ).max(9),
    readSources: z.array(z.enum(['campus', 'history', 'weather', 'map', 'local', 'capability'])).max(6),
    participation: z.enum(['listen', 'reflect', 'analyze', 'act']).optional(),
    audience: z.enum(['self', 'group', 'public']),
    constraints: z.array(z.string().max(300)).max(12),
    unresolvedReferences: z.array(z.string().max(80)).max(12),
    confidence: z.enum(['clear', 'ambiguous']),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endCodePoint <= value.startCodePoint)
      ctx.addIssue({ code: 'custom', message: 'Empty/reversed request fragment' });
  });
export const interpretationProposalSchema = z
  .object({
    fragments: z.array(requestFragmentSchema).max(64),
    hasListen: z.boolean(),
    hasRetrieval: z.boolean(),
    explicitLocalWrite: z.boolean(),
    directLocalWrite: z.boolean(),
  })
  .strict();
export const evidenceImageSourceSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  contentVersion: z.number().int().positive(),
  mimeType: z.literal('image/jpeg'),
  width: z.number().int().positive(), height: z.number().int().positive(),
}).strict();
export const evidenceSchema = z
  .object({
    id: objectId,
    ownerId: objectId,
    workspaceId: objectId,
    subjectId: objectId,
    worldId: objectId,
    sourceId: objectId,
    contentVersion: z.number().int().positive(),
    sequence: z.number().int().nonnegative(),
    text: z.string().max(250000),
    speaker: z.enum(['user', 'assistant', 'external']),
    kind: z.enum(['user_message', 'user_control', 'file_import', 'tool_result', 'external_observation']),
    /** Host-bound original pixels remain owned by the same user Message. */
    imageSource: evidenceImageSourceSchema.optional(),
    sourceContext: z.discriminatedUnion('kind', [z.object({
      kind: z.literal('relationship_rehearsal'), origin: z.literal('user_interface_reference'),
      artifactId: objectId, artifactRevision: z.number().int().positive(), matterId: objectId,
      activeTurnId: objectId.nullable(), inputKind: z.enum(['reference', 'utterance', 'alternative', 'collect', 'pause', 'resume']),
    }).strict(), z.object({
      kind: z.literal('shared_creation'), origin: z.literal('user_interface_reference'),
      artifactId: objectId, artifactRevision: z.number().int().positive(),
      matterId: objectId, matterRevision: z.number().int().positive(),
      referenceKind: z.enum(['work', 'map_place', 'map_leg']),
      chapter: z.object({ messageId: objectId, sceneId: objectId, sceneRevision: z.number().int().positive() }).strict().optional(),
    }).strict(), z.object({
      kind: z.literal('interactive_program'), origin: z.literal('user_interface_reference'),
      messageId: objectId, programId: objectId, revision: z.number().int().positive(), nodeId: programNodeIdSchema,
    }).strict()]).optional(),
    authority: z.enum([
      'user_statement',
      'source_record',
      'quotation',
      'model_derivative',
      'legacy_unverified',
    ]),
    roots: z.array(objectId).min(1).max(64),
    label: labelSchema,
    receivedAt: instant,
    parentEventId: objectId.optional(),
    sessionId: objectId.optional(),
    fileName: z.string().max(260).optional(),
    interpretationTimeZone: z.string().max(100).optional(),
    locator: locatorSchema.optional(),
    status: z.enum(['active', 'redacted', 'deleted']).default('active'),
  })
  .strict();
export type EvidenceEvent = z.infer<typeof evidenceSchema>;
export const temporalSchema = z
  .object({
    validFrom: instant.optional(),
    validTo: instant.optional(),
    precision: z.enum(['instant', 'day', 'interval', 'unresolved']),
    recordedFrom: instant,
    recordedTo: instant.optional(),
    unresolvedExpression: z.string().max(200).optional(),
  })
  .strict()
  .refine(
    (t) => !t.validFrom || !t.validTo || Date.parse(t.validTo) > Date.parse(t.validFrom),
    'Invalid validity interval',
  );
/** Assistant wording can resolve a user's reply, but is never personal evidence. */
export const memoryReferenceInputSchema = z.object({
  messageId: objectId, start: z.number().int().nonnegative(), end: z.number().int().positive(),
}).strict().refine(value => value.end > value.start, 'Invalid reference context range');
export const memoryReferenceSchema = memoryReferenceInputSchema.extend({
  sessionId: objectId, contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRefs: z.array(z.lazy(() => workSourceRefSchema)).min(1).max(32),
  replyState: z.object({ status: z.enum(['cancelled', 'error']), completion: z.literal('partial'),
    exposure: z.literal('unknown'), meaning: z.string().min(1).max(400) }).strict().optional(),
});
export type MemoryReferenceContext = z.infer<typeof memoryReferenceSchema>;
export const assertionSchema = z
  .object({
    id: objectId,
    ownerId: objectId,
    workspaceId: objectId,
    subjectId: objectId,
    worldId: objectId,
    revision: z.number().int().positive(),
    predicate: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,119}$/),
    value: typedValue,
    text: z.string().min(1).max(4000),
    kind: z.enum([
      'explicit_fact',
      'explicit_preference',
      'current_state',
      'inferred_hypothesis',
      'legacy_unverified',
    ]),
    strength: z.enum(['hard', 'soft', 'unconfirmed']),
    conditions: conditionSchema,
    exceptionIds: z.array(objectId).max(64),
    temporal: temporalSchema,
    status: z.enum(['candidate', 'active', 'disputed', 'superseded', 'expired', 'retracted', 'inactive']),
    evidenceIds: z.array(objectId).max(64),
    referenceContexts: z.array(memoryReferenceSchema).max(16).optional(),
    label: labelSchema,
    verification: z.enum(['verified', 'pending', 'unverified']),
  })
  .strict();
export type Assertion = z.infer<typeof assertionSchema>;
export const memorySupportSchema = z.object({
  eventId: objectId, contentVersion: z.number().int().positive(), quote: z.string().min(1).max(12000),
  startCodePoint: z.number().int().nonnegative(), endCodePoint: z.number().int().positive(),
}).strict().refine(value => value.endCodePoint > value.startCodePoint, 'Invalid support range');
export type MemorySupport = z.infer<typeof memorySupportSchema>;
/** Exact source addresses, including historical revisions; no copied source text. */
export interface AssertionCitation {
  eventId: string; contentVersion?: number; start?: number; end?: number;
  role: 'primary' | 'support' | 'authorization';
  /** Host-only, bound to this stored revision/citation; never accepted in a proposal. */
  restrictionReceipt?: string;
}
export const memoryChangeOperationMeaning = 'CORRECT依据新原话改写既有说法或理解，也包括本人后来重新回想、澄清；这个操作本身不判断是谁曾误读、误记，也不说明旧记录失真。SUPERSEDE表示事实或条件后来改变，保留旧时段的身份。说明过去具体发生过的失误时，仍对照当时原陈述与实际保存内容；没有这类依据就保留变化本身。';
export const changeSchema = z
  .object({
    operation: z.enum([
      'ADD',
      'SUPPORT',
      'REFINE',
      'ADD_EXCEPTION',
      'SUPERSEDE',
      'CORRECT',
      'DISPUTE',
      'EXPIRE',
      'RETRACT',
    ]).describe(memoryChangeOperationMeaning),
    targetId: objectId.optional(),
    expectedRevision: z.number().int().positive().optional(),
    eventId: objectId,
    sourceQuote: z.string().min(1).max(12000),
    sourceContentVersion: z.number().int().positive().optional(),
    sourceStartCodePoint: z.number().int().nonnegative().optional(),
    sourceEndCodePoint: z.number().int().positive().optional(),
    supports: z.array(memorySupportSchema).max(16).optional(),
    referenceContexts: z.array(memoryReferenceInputSchema).max(16).optional()
      .describe('确实用于解释本人答复所指对象的先前助手原问句，按context实际provided地址声明；助手内容不是本人事实。省略保留已有理解的依赖，显式[]仅在当前原话独立支持完整新内容时清除。'),
    predicate: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,119}$/),
    value: typedValue,
    text: z.string().min(1).max(4000),
    kind: z.enum(['explicit_fact', 'explicit_preference', 'current_state', 'inferred_hypothesis']),
    strength: z.enum(['hard', 'soft', 'unconfirmed']),
    conditions: conditionSchema,
    validFrom: instant.optional(),
    validTo: instant.optional().describe('原文明确给出的有效终点；持续偏好或约定未指定终点时省略，不把开放期限当作未知期限。'),
    unresolvedTime: z.string().max(200).optional().describe('仅保留原文确有但尚无法核清的生效/到期条件；现在已采用、以后继续使用的偏好没有截止日时省略，不因此创建待确认候选。'),
    subject: z.enum(['self', 'source_subject', 'other', 'fictional']).default('source_subject'),
    world: z.enum(['source_world', 'hypothetical']).default('source_world'),
    idempotencyKey: objectId,
  })
  .strict();
export type MemoryChange = z.infer<typeof changeSchema>;
export type ProcessingStatus =
  | 'pending'
  | 'candidate_emitted'
  | 'ephemeral_only'
  | 'quote_or_hypothesis'
  | 'no_personal_fact'
  | 'needs_context'
  | 'failed';
export interface ProcessingSpan {
  id: string;
  eventId: string;
  contentVersion: number;
  start: number;
  end: number;
  status: ProcessingStatus;
  indexed: boolean;
}
export interface Watermarks {
  received: number;
  extractedContiguous: number;
  indexedContiguous: number;
  extractionGaps: number[];
  indexingGaps: number[];
}
export const needSchema = z
  .object({
    id: objectId,
    key: objectId,
    importance: z.enum(['must', 'conditional', 'optional']),
    capability: objectId.optional(),
    args: z.record(z.string(), z.json()).default({}),
    condition: conditionSchema.default(always),
    mode: z.enum(['all', 'any']).default('all'),
    childIds: z.array(objectId).max(32).default([]),
  })
  .strict();
export type Need = z.infer<typeof needSchema>;
export interface NeedResult {
  id: string;
  key: string;
  capability?: string;
  status: KnowledgeStatus;
  evidenceIds: string[];
  reason?: string;
  value?: unknown;
  fetchedAt?: string;
  coverage?: unknown;
}
export interface EvidenceBundle {
  id: string;
  assertionIds: string[];
  evidenceIds: string[];
  text: string;
  estimatedTokens: number;
  hard: boolean;
  coverage: 'complete' | 'conditional' | 'blocked';
}
/** Non-secret provider facts captured with a context receipt. */
export interface ProviderReceipt {
  providerId: string;
  endpoint: string;
  /** Every endpoint actually attempted after the receipt was created. */
  observedEndpoints?: string[];
  model: string;
  /** Actual completed-response model IDs; never inferred from a request/config. */
  observedResponseModels?: string[];
  protocol: string;
  protocolVersion: string;
  capabilities: {
    thinking: boolean;
    reasoningContent: boolean;
    toolCalls: boolean;
    toolContinuation: boolean;
    strictTools: boolean;
    structuredOutput: boolean;
    modalities: string[];
    toolDialect: string;
    opaqueState: string;
  };
  limits: {
    /** Host/request ceiling for generated output. */
    maxOutputTokens: number;
    /** Only present when verified from provider metadata or an isolated probe. */
    contextTokens?: number;
    /** Legacy host estimate, not an account/provider quota. New receipts omit it. */
    hostContextTokens?: number;
  };
  requestModes?: {
    thinking: 'enabled' | 'disabled' | 'mixed';
    strict: boolean | 'mixed';
    tools: boolean;
  };
}
export const assistantWorkSourceSchema = z.object({ messageId: objectId, sceneId: objectId,
  sceneRevision: z.number().int().positive() }).strict();
/** An immutable saved chapter address, never another copy of its prose. */
export type AssistantWorkSource = z.infer<typeof assistantWorkSourceSchema>;
export const interactiveProgramSourceSchema = z.object({ messageId: objectId, programId: objectId,
  revision: z.number().int().positive() }).strict();
/** An original message/view address, never a program or bound data copy. */
export type InteractiveProgramSource = z.infer<typeof interactiveProgramSourceSchema>;

export type InteractiveProgramReadDeliveryIssue = 'call_id_missing' | 'wire_not_found' | 'json_layer' | 'body_mismatch';
/** Safe counters for one actual reader admission. The host creates the UUID;
 * coverage describes this delivery, not a claim of understanding or adoption. */
export interface InteractiveProgramReadReceipt {
  id: string;
  source: InteractiveProgramSource;
  mode: 'overview' | 'source' | 'states';
  stateOrigin?: 'this_turn_admitted_ui_reference' | 'initial_only_focus_has_no_current_inputs' | 'initial_not_current_ui_state';
  status: 'available' | 'needs_refresh' | 'evaluation_error';
  coverage: {
    offset: number;
    end: number;
    total: number;
    complete: boolean;
    wholeSourceProvided: boolean;
    sourceBodiesProvided: boolean;
    geometryPointsProvided: boolean;
  };
  counts: { nodes: number; stateDeclarations: number; statePreviews: number; sourceCodePoints: number; literalMatches: number };
  /** Actual admitted reader budget, including readReceiptId but excluding the
   * registry's later observationId. These are not provider token measurements. */
  bytes: number;
  estimatedTokens: number;
  delivery: 'admitted' | 'delivered_to_model';
  deliveryIssue?: InteractiveProgramReadDeliveryIssue;
}

/** Safe failure classification only. Formal/admitted relations match a
 * current-turn address or an original successful read; they do not assert
 * that the source proof is readable now. */
export interface InteractiveProgramReadFailure {
  mode: 'overview' | 'source' | 'states';
  reason: 'reference_unqualified' | 'source_proof_unavailable' | 'view_missing';
  relation: 'formal_and_admitted' | 'formal_current' | 'earlier_admitted' | 'unmatched_request';
}

/** Estimates come from the same native request before the host appends its
 * continuation core, or from existing native telemetry. Only afterMain is
 * the actual prompt usage of a successful provider main request. */
export interface HermesCompressionReceipt {
  compactionCount: number;
  thresholdTokens: number;
  nativeSystemEstimatedTokens: number;
  nativeToolsEstimatedTokens: number;
  protectedHeadEstimatedTokens?: number;
  protectedTailEstimatedTokens?: number;
  middleEstimatedTokens?: number;
  beforeEstimatedTokens?: number;
  afterMainPromptTokens?: number;
  continuationCoreIncluded?: boolean;
}
/** One safe terminal cause for this attempt, never an authority renewal. */
export interface RunEndReceipt {
  reason: 'scope_expired';
  scopeExpiresAt: string;
  endedAt: string;
}

/** Compiler counters and actual registry navigation only: no authored DSL,
 * identifiers, source data or body text. */
export interface InteractiveProgramExpansionDiagnostic {
  measure: 'partial_static_expansion_upper_bound';
  estimatedSoFar: number;
  limit: number;
  rawAstNodes: number;
  statements: number;
  statementOrdinal: number;
  location: string;
  loop?: { count: number; kind: 'exact' | 'upper_bound'; templateUnits: number; units: number };
  /** Ordinary statement references are inlined by the installed native
   * parser. These signatures help reduce repeated parameter work, not raise
   * limits or assert a particular failed program's implementation. */
  referenceSemantics?: 'ordinary_refs_inline';
  functions?: InteractiveProgramExpressionDiagnostic['functions'];
  read?: InteractiveProgramExpressionDiagnostic['read'];
  builtinRead?: { tool: 'read_skill'; arguments: { id: string; section: 'grammar' } };
}
type InteractiveProgramOperandKind = 'number' | 'string' | 'boolean' | 'number?' | 'string?' | 'boolean?' | 'null' | 'unknown';
/** Host-created expression shape and registry signatures only. location is
 * an ordinal/numeric path; no authored identifiers or source text belong here. */
export interface InteractiveProgramExpressionDiagnostic {
  statementOrdinal: number;
  location: string;
  category: 'binary' | 'unary' | 'condition' | 'index';
  operator: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '>' | '>=' | '<' | '<=' | '&&' | '||' | '!' | '?:' | '[]' | 'unsupported';
  operandKinds: { left?: InteractiveProgramOperandKind; right?: InteractiveProgramOperandKind; condition?: InteractiveProgramOperandKind };
  /** At most three entries from the actual shared registry, selected by host. */
  functions: { name: string; signature: string; returnKind: string; minimumArguments?: number }[];
  read: { tool: 'read_skill'; arguments: { id: string; section: 'functions'; names: string[]; limit: number } };
}
/** Only fixed registry/schema metadata. No supplied values, unknown keys,
 * authored node identity or inferred source-statement position belong here. */
export interface InteractiveProgramComponentDiagnostic {
  name: string;
  signature: string;
  issues: {
    stage: 'schema' | 'contract';
    code: 'invalid_type' | 'too_big' | 'too_small' | 'invalid_format' | 'not_multiple_of' | 'unrecognized_keys'
      | 'invalid_union' | 'invalid_key' | 'invalid_element' | 'invalid_value' | 'custom' | 'schema_issue'
      | 'unknown_component' | 'local_action' | 'state_kind' | 'graphic_domain' | 'drag_fields'
      | 'motion_duration' | 'motion_number_fields' | 'motion_state_patch' | 'curve_expression' | 'curve_range';
    path: (string | number)[];
    /** False means the path stopped before an arbitrary/record key. */
    pathComplete: boolean;
    /** Zero-based position in the real component signature, not in source. */
    parameterIndex?: number;
    expected?: 'string' | 'number' | 'int' | 'boolean' | 'array' | 'object' | 'null' | 'record' | 'nonoptional';
    /** Bounds from the fixed component schema, never the rejected input. */
    minimum?: number;
    maximum?: number;
    inclusive?: boolean;
  }[];
  read: { tool: 'read_skill'; arguments: { id: string; section: 'components'; names: string[]; limit: number } };
}
/** Safe metadata from the actual envelope/native checks, without draft text. */
export type InteractiveProgramInputDiagnostic = {
  tool: 'present_view';
  layer: 'tool_envelope';
  issues: InteractiveProgramComponentDiagnostic['issues'];
} | {
  tool: 'present_view';
  layer: 'source_completion';
  nativeIncomplete: true;
  /** Original end boundary, not a guessed position of a missing character. */
  end: { unit: 'utf16_code_units'; offset: number; line: number; column: number };
  /** Bounded native autoClose suffix; only closing delimiters and escapes. */
  completion?: { suffix: string; returned: number; total: number; complete: boolean };
} | {
  tool: 'present_view';
  layer: 'native_parser';
  flags: { incomplete: boolean; unresolved: boolean; parseErrors: boolean; query: boolean; mutation: boolean };
  /** Counts of actual native arrays; incomplete is its boolean as 0/1. */
  counts: { incomplete: number; unresolved: number; parseErrors: number; query: number; mutation: number };
  errors: {
    code: 'missing-required' | 'null-required' | 'unknown-component' | 'inline-reserved'
      | 'excess-args' | 'type-mismatch' | 'unknown-function' | 'no-root';
    statementOrdinal?: number;
    /** Only fixed schema keys and numeric array positions; never input values
     * or arbitrary record keys. Relative to this component's props. */
    property?: Pick<InteractiveProgramComponentDiagnostic['issues'][number], 'path' | 'pathComplete' | 'parameterIndex' | 'expected'>;
    /** Only an own-key hit in the current host registry may supply this. */
    contract?: { kind: 'component' | 'function'; name: string; signature: string;
      read: { tool: 'read_skill'; arguments: { id: string; section: 'components' | 'functions'; names: string[]; limit: number } } };
  }[];
};
/** Navigation to an already-known, currently requalified reference only.
 * This neither reports the SQL latest revision nor authorizes a rebase. */
export interface InteractiveProgramPreviousDiagnostic {
  relation: 'matches_known_reference' | 'known_program_revision_mismatch' | 'message_id_used_as_program_id'
    | 'unmatched_input' | 'no_qualified_known_reference';
  fields: { id: 'programId'; expectedRevision: 'revision' };
  automaticRebase: false;
  knownReference?: {
    basis: 'formal_current' | 'delivered_this_run' | 'validated_previous';
    source: InteractiveProgramSource;
    previous: { id: string; expectedRevision: number };
    read: { tool: 'read_interactive_program'; arguments: InteractiveProgramSource & { mode: 'overview' } };
  };
}

/** Fixed numeric costs of the actual initial model projection. Standalone
 * group serializations need not sum to the full JSON; these are host estimates,
 * never provider token counts or an acknowledgement of deferred source bodies. */
export interface InitialContextComposition {
  strategy: 'standard' | 'current_work_first';
  stage: 'compiler' | 'ready_for_main';
  groups: { category: 'current_originals' | 'history' | 'observations' | 'continuity' | 'capabilities'
    | 'focused_work' | 'presentation_guidance' | 'other'; bytes: number; estimatedTokens: number }[];
  serialized: { bytes: number; estimatedTokens: number };
  accounted: { readBytes: number; estimatedTokens: number };
  history: { userBodies: number; assistantBodies: number; deferredAssistantBodies: number };
  deferred: { ambientContinuity: boolean; recentObservations: boolean; capabilityDescriptions: boolean };
  protectedHelp?: { completeBodies: number; providedBodies: number; bytes: number; estimatedTokens: number;
    availableBytes: number; availableTokens: number; deferredForReserve: boolean };
}

/** A host-issued address to an immutable account snapshot, without records.
 * It is navigation metadata, not a renewed read or action permission. */
export interface CampusSavedReadingProof {
  sourceId: 'campus:zju-account'; bundleId: string; resource: string; version: string;
  sourceIdentity: string; headIdentity: string; selection: 'saved_head' | 'historical'; collectedAt?: string;
}
export interface CampusReadingAddress {
  sourceId: 'campus:zju-account'; snapshot: CampusSavedReadingProof;
  read: { capability: 'campus.query' | 'campus.lookup'; arguments: Record<string, unknown> };
  next?: { capability: 'campus.query' | 'campus.lookup'; arguments: Record<string, unknown> };
  page: { offset: number; returned: number; nextOffset: number | null };
  evaluation: { at?: string; paging: 'fixed_conditions' | 'evaluation_dependent'; dynamicValues: boolean };
  observedAt: string;
  /** Actual host read-completion order within this reply; absent in older receipts. */
  readOrdinal?: number;
  contract: CapabilityContractRef;
}
/** Original draft bound to assistant text actually supplied in this run.
 * An address does not claim that its whole body was read or that it is current. */
export interface ReleaseSource { sessionId: string; messageId: string; artifactId: string; revision: number }
export interface ContextReceipt {
  /** New runs start with []; absence on an old receipt is unknown, not no adoption. */
  releaseSources?: ReleaseSource[];
  initialComposition?: InitialContextComposition;
  /** Where the standing instructions of the main run came from, in order. */
  promptComposition?: { id: string; origin: string; characters: number }[];
  /** Exact original ranges adopted from work or semantic discoveries; no copied body. */
  workSourceBindings?: WorkSourceBinding[];
  /** Original work addresses supporting supplied text or metadata. This is
   * provenance, not a claim that the entire chapter body was read. */
  assistantWorkSources?: AssistantWorkSource[];
  /** Original typed teaching sources inherited with actually adopted history. */
  historicalWorkSources?: import('./method-work-help').HistoricalWorkSource[];
  interactiveProgramSources?: InteractiveProgramSource[];
  /** Latest six actual reader receipts, bounded by the reader owner. */
  interactiveProgramReads?: InteractiveProgramReadReceipt[];
  /** Latest six safe read failures, bounded by the reader owner. */
  interactiveProgramReadFailures?: InteractiveProgramReadFailure[];
  /** Bounded safe failure counters from actual calls. The optional delivery
   * mark means an identical tool result was in a successful model request,
   * not that the model understood it or any program was published. */
  interactiveProgramDiagnostics?: { stepId: string; toolCallId?: string;
    rejectionCode?: string;
    expansion?: InteractiveProgramExpansionDiagnostic; expression?: InteractiveProgramExpressionDiagnostic;
    component?: InteractiveProgramComponentDiagnostic; input?: InteractiveProgramInputDiagnostic;
    previous?: InteractiveProgramPreviousDiagnostic; explanationTruncated: boolean;
    includedInSuccessfulModelRequest?: boolean }[];
  /** Supporting help/process addresses for supplied personal-method text or
   * metadata, not a rating, body-read ACK or new action authorization. */
  personalMethodSources?: import('./personal-method').PersonalMethodSources[];
  campusSensitiveReads?: import('./campus-academic').CampusSensitiveRead[];
  /** Latest six actual account-reading addresses. No course/grade row body. */
  campusReadingAddresses?: CampusReadingAddress[];
  campusReadingReadCount?: number;
  /** Account source dependencies, including admitted prior replies; no read ACK. */
  campusReadingSources?: CampusSavedReadingProof[];
  /** A delivered account result had no complete readable snapshot proof. */
  campusReadingIncomplete?: true;
  /** Actual note revision/range provenance, never a personal fact or read ACK. */
  noteSources?: import('./notes-source').NoteSourceProof[];
  /** Source-bound learning processes actually provided to this model run. */
  learningProcessVersions?: { id: string; revision: number }[];
  reflectiveLetterSources?: {
    binding: WorkSourceBinding;
    request: WorkSourceRef & { quoteSha256: string };
    proofs: import('./reflective-letter').ReflectiveLetterProof[];
  }[];
  /** Historical artifacts were supplied as history, never as current assertions. */
  historicalAssertionVersions?: { id: string; revision: number }[];
  /** Exact host provenance for planning-derived text, rechecked before reuse. */
  planningProvenance?: PlanningMaterialProvenance[];
  sceneReferences?: { id: string; revision: number; sourceId: string; fetchedAt: string; expiresAt?: string }[];
  materialReads?: { capability: string; resourceId: string; sha256: string; version: number; sourceEventId?: string; parentEventId?: string; page?: number; start?: number; end?: number; total?: number; complete: boolean; extraction?: string }[];
  imageRequests?: { requestId: string; sha256: string; source: 'upload' | 'tool'; version: string; accepted: boolean; role: string;
    sourceEventId?: string; sourceContentVersion?: number }[];
  mechanismUses?: { prefetch: number; currentMatter: number; repairRejudge: number; closure: number };
  engine?: { name: string; commit: string; adapterSha256: string; python: string };
  /** Latest four compactions, updated by compactionCount in the main harness. */
  hermesCompressions?: HermesCompressionReceipt[];
  runEnd?: RunEndReceipt;
  /** Actual terminal state of an optional presence attempt; no message body,
   * draft or inferred reason for choosing silence is retained here. */
  presenceOutcome?: { status: 'sent' | 'silent' | 'interrupted' | 'failed'; preparedProgram: boolean; errorCode?: string };
  delegations?: { id: string; parentId: string; title: string; status: 'queued' | 'running' | 'produced' | 'consumed' | 'failed' | 'cancelled'; sources?: string[]; currentEvidenceIds?: string[]; modelCalls: number; responses: number; toolCalls: number }[];
  modelUsage?: { phase: string; responseModel?: string; inputTokens: number | null; cachedInputTokens?: number | null; outputTokens: number | null; usdMin: number | null; usdMax: number | null;
    status?: 'failed'; errorCode?: string; requestMaxOutputTokens?: number }[];
  id: string;
  runId: string;
  contractRevision: number;
  policyRevision: number;
  privacyEpoch: number;
  watermarks: Watermarks;
  providedEvidenceIds: string[];
  providedSourceIds?: string[];
  providedObjectVersions: { id: string; revision: number; kind?: 'evidence' | 'assertion' | 'work' | 'agenda' | 'domain';
    /** Only accepted, explicitly bound pixels or inherited original-image
     * provenance; this is not a pixel-delivery or understanding ACK. */
    imageSha256?: string;
    sourceId?: string; domain?: string; institutionId?: string; termId?: string;
    /** Work sources frozen at this actual read, not proof of the current Work revision. */
    sourceBinding?: WorkSourceBinding;
    /** Original retained material used by an actual typed owner read; no body or read ACK. */
    sourceMaterial?: import('./method-work-help').MethodHelpMaterialIdentity }[];
  needResults: { key: string; status: KnowledgeStatus }[];
  excludedReasonCounts: Record<string, number>;
  /** Full, non-secret provider/protocol facts for this run. */
  provider?: ProviderReceipt;
  /** Compatibility label; derived from the selected protocol, never a model default. */
  providerVersion: string;
  toolAttempts: { id: string; capability: string; status: string; version: string; cache?: 'hit' | 'shared' | 'miss' }[];
  coverage: 'complete_for_candidate' | 'conditional' | 'blocked';
  budget: { estimatedTokens: number; readBytes: number; outputLimitAdjustments?: { requested: number; applied: number; actor: 'main' | 'child' }[] };
}
export interface DelegatedTask {
  title: string;
  instruction: string;
  sources?: string[];
  currentEvidenceIds?: string[];
  memoryInquiry?: {
    version: 1;
    question: string;
    uncertainties?: string[];
    anchorRefs?: WorkSourceRef[];
    relatedTo?: string[];
  };
}
export interface ContextPack {
  contract: ContextContract;
  bundles: EvidenceBundle[];
  assertions: Assertion[];
  evidence: EvidenceEvent[];
  needs: NeedResult[];
  receipt: ContextReceipt;
  data: Record<string, unknown>;
  currentText: string;
}
/**
 * A bounded, audience-specific brief for public/group drafting.
 *
 * This is deliberately not the authored request: it carries only the facts
 * the user elected to release and the constraints needed to write the draft.
 * The public model must never need the private source event to understand the
 * requested communication.
 */
export const releaseSpecSchema = z
  .object({
    id: objectId,
    recipient: z.string().min(1).max(160),
    purpose: z.string().min(1).max(300),
    allowedFacts: z.array(z.string().min(1).max(600)).max(24),
    allowedProjection: z.record(z.string(), z.json()).default({}),
    tone: z.string().max(120).default('自然、礼貌'),
    length: z.enum(['short', 'medium', 'long']).default('short'),
    prohibitedCategories: z.array(z.string().max(120)).max(24).default([]),
    mode: z.enum(['draft', 'send']).default('draft'),
    materialVersions: z.array(z.object({ id: objectId, revision: z.number().int().positive() }).strict()).max(64).default([]),
    authorization: z.enum(['explicit_draft', 'explicit_send', 'projection_only']).default('projection_only'),
  })
  .strict();
export type ReleaseSpec = z.infer<typeof releaseSpecSchema>;
export const dependencySchema = z
  .object({
    consumerId: objectId,
    producerId: objectId,
    producerRevision: z.number().int().nonnegative(),
    sensitivity: z.enum(['hard', 'soft', 'privacy']),
    invalidation: z.enum(['block', 'revalidate', 'recompute', 'expire']),
  })
  .strict();
export type Dependency = z.infer<typeof dependencySchema>;
export const actionStatusSchema = z.enum([
  'proposed',
  'awaiting_approval',
  'approved',
  'dispatching',
  'succeeded',
  'failed_confirmed',
  'outcome_unknown',
  'reconciling',
  'unresolved',
  'cancelled',
  'cancel_requested',
  'cancellation_confirmed',
  'cancellation_unknown',
  'cannot_cancel',
]);
export type ActionStatus = z.infer<typeof actionStatusSchema>;
/** Host-generated identity for the reviewed invocation contract, not an authorization grant. */
export const capabilityContractRefSchema = z.object({
  revision: z.literal(1),
  providerId: objectId,
  providerVersion: z.string().min(1).max(160),
  capabilityName: objectId,
  capabilityVersion: z.string().min(1).max(160),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type CapabilityContractRef = z.infer<typeof capabilityContractRefSchema>;

/** Host-bound speaking turn for a saved reminder, not a claim about who
 * originally composed its words. The hash binds this exact reminder text. */
export const reminderSpeakerSchema = z.object({
  messageId: objectId,
  name: z.string().min(1).max(60),
  textSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ReminderSpeaker = z.infer<typeof reminderSpeakerSchema>;

export const effectSchema = z
  .object({
    id: objectId,
    ownerId: objectId,
    workspaceId: objectId,
    subjectId: objectId,
    worldId: objectId,
    revision: z.number().int().positive(),
    capability: objectId,
    // Optional only so historical records remain readable; unbound effects cannot be dispatched.
    capabilityContract: capabilityContractRefSchema.optional(),
    arguments: z.record(z.string(), z.json()),
    reminderSpeaker: reminderSpeakerSchema.optional(),
    planningOffer: planningOfferSchema.optional(),
    compensation: z.object({ targetId: objectId, expectedRevision: z.number().int().nonnegative(), previous: z.record(z.string(), z.json()).nullable(), applied: z.boolean() }).strict().optional(),
    audience: objectId,
    status: actionStatusSchema,
    digest: z.string(),
    idempotencyKey: objectId,
    dependencies: z.array(dependencySchema).max(128),
    validUntil: instant,
    policyRevision: z.number().int().positive(),
    privacyEpoch: z.number().int().positive(),
    effect: z.enum(['local_write', 'external_write']),
    executionTier: z.enum(['direct_local', 'approval_required']).default('approval_required'),
    sourceId: objectId,
    goalId: objectId.optional(),
    reason: z.string().max(300).optional(),
    nonDispatchProof: z.object({ actionId: objectId, actionRevision: z.number().int().positive(),
      actionDigest: z.string().regex(/^[a-f0-9]{64}$/), observedAt: instant }).strict().optional(),
    simulated: z.boolean().default(false),
  })
  .strict();
export type EffectAction = z.infer<typeof effectSchema>;
export interface Approval {
  id: string;
  actionId: string;
  actionDigest: string;
  actionRevision: number;
  principalId: string;
  policyRevision: number;
  privacyEpoch: number;
  expiresAt: string;
  used: boolean;
}
export interface EffectReceipt {
  id: string;
  actionId: string;
  attemptId: string;
  sourceId: string;
  status: 'confirmed_success' | 'confirmed_failure' | 'accepted_not_confirmed' | 'unknown';
  externalRecordId?: string;
  observedAt: string;
  localStatus?: 'local_saved';
  reason?: string;
}
export const workSourceRefSchema = z.object({
  eventId: objectId, contentVersion: z.number().int().positive(),
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
}).strict().refine(ref => Number.isSafeInteger(ref.start) && Number.isSafeInteger(ref.end) && ref.end > ref.start, '来源片段范围无效');
export type WorkSourceRef = z.infer<typeof workSourceRefSchema>;
export const workSourceBindingSchema = z.object({
  version: z.literal(1), refs: z.array(workSourceRefSchema).min(1).max(32),
  sourceIds: z.array(objectId).min(1).max(32), requiredGrants: z.array(z.string().min(1).max(100)).max(32),
}).strict();
export type WorkSourceBinding = z.infer<typeof workSourceBindingSchema>;
/** Prior proofs actually read, never a model-authored adoption claim. */
export const planningAttemptBasisSchema = z.object({
  planId: objectId, intentId: objectId,
  specDigest: z.string().regex(/^[a-f0-9]{64}$/), manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  sourceBinding: workSourceBindingSchema,
}).strict();
export type PlanningAttemptBasis = z.infer<typeof planningAttemptBasisSchema>;
export const planningMaterialProvenanceSchema = z.object({
  intentId: objectId, intentRevision: z.number().int().positive(),
  sourceBinding: workSourceBindingSchema, attemptBasis: z.array(planningAttemptBasisSchema),
}).strict();
export type PlanningMaterialProvenance = z.infer<typeof planningMaterialProvenanceSchema>;
export const workSchema = z
  .object({
    id: objectId,
    kind: z.enum([
      'episode',
      'goal',
      'plan',
      'option',
      'commitment',
      'task',
      'experience',
      'hypothesis',
      'learning',
      'window',
      'feedback',
      'recipe_candidate',
    ]),
    ownerId: objectId,
    workspaceId: objectId,
    subjectId: objectId,
    worldId: objectId,
    revision: z.number().int().positive(),
    status: z.string().min(1).max(50),
    title: z.string().max(400),
    evidenceIds: z.array(objectId).max(128),
    sourceBinding: workSourceBindingSchema.optional(),
    /** Host provenance on derived work; the repository validates the owner
     * schema before saving or reading. Kept outside each owner's data. */
    personalMethodSources: z.array(z.custom<import('./personal-method').PersonalMethodSources>()).optional(),
    label: labelSchema,
    data: z.record(z.string(), z.json()),
  })
  .strict();
export type WorkRecord = z.infer<typeof workSchema>;
export const candidateSchema = z
  .object({
    id: objectId,
    title: z.string().min(1).max(300),
    activity: z.string().max(80),
    location: z.string().max(120).optional(),
    startsAt: instant.optional(),
    endsAt: instant.optional(),
    needs: z.array(needSchema).max(32).default([]),
    dependencies: z.array(dependencySchema).max(128).default([]),
    resourceCapabilities: z.array(objectId).max(16).default([]),
    preservesUnstructuredTime: z.boolean().default(false),
    rationale: z.string().max(1200),
  })
  .strict();
export type PlanCandidate = z.infer<typeof candidateSchema>;
export const domainDeltaSchema = z
  .object({
    sourceId: objectId,
    domain: z.string().min(1).max(80),
    institutionId: objectId,
    termId: objectId,
    scopeKeys: z.array(objectId).min(1).max(100),
    completeness: z.enum(['complete', 'partial', 'failed']),
    sourceRevision: z.string().max(100).optional(),
    fromCursor: z.string().max(200).optional(),
    toCursor: z.string().max(200).optional(),
    upserts: z
      .array(
        z
          .object({ recordId: objectId, value: z.record(z.string(), z.json()), evidenceId: objectId })
          .strict(),
      )
      .max(6000),
    tombstones: z.array(objectId).max(6000),
    fetchedAt: instant,
    observedAt: instant.optional(),
    errors: z.array(z.string().max(400)).max(100),
  })
  .strict();
export type DomainDelta = z.infer<typeof domainDeltaSchema>;
export interface DomainRecord {
  id: string;
  domain: string;
  sourceId: string;
  institutionId: string;
  termId: string;
  revision: number;
  evidenceId: string;
  value: Record<string, unknown>;
  status: KnowledgeStatus;
  fetchedAt: string;
}
export interface MemoryView {
  id: string;
  text: string;
  quote: string;
  createdAt: string;
  status: Assertion['status'];
  kind: Assertion['kind'];
  revision: number;
  verification: Assertion['verification'];
  conditions: string;
  validFrom?: string;
  validTo?: string;
  evidenceIds: string[];
}
export class HarnessError extends Error {
  constructor(
    public code: string,
    message: string,
    public retry: 'never' | 'read' | 'reconcile' = 'never',
    /** Model-facing diagnostic; callers must not promote it to a UI status. */
    public diagnostic?: { rejectedDimensions: string[]; explanation: string;
      expansion?: InteractiveProgramExpansionDiagnostic; expression?: InteractiveProgramExpressionDiagnostic;
      component?: InteractiveProgramComponentDiagnostic; input?: InteractiveProgramInputDiagnostic;
      previous?: InteractiveProgramPreviousDiagnostic },
  ) {
    super(message);
    this.name = 'HarnessError';
  }
}
