import { HarnessError, type AssistantWorkSource, type ContextPack, type ContextReceipt, type ScopeHandle,
  type WorkRecord, type WorkSourceBinding, type WorkSourceRef, type InteractiveProgramPreviousDiagnostic } from '../../shared/harness';
import { PROGRAM_LIBRARY_VERSION, interactiveBindingInputSchema, type InteractiveBindingInput,
  type ProgramDataMap, type ProgramJsonValue } from '../../shared/interactive-program';
import type { Message } from '../../shared/types';
import type { PresentationView, SceneSnapshot } from '../../shared/scenes';
import type { NoteSourceProof } from '../../shared/notes-source';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import { canonical, codePointSlice } from './semantics';

export interface ProgramSourceAddress { messageId: string; programId: string; revision: number }
type ProgramHost = Pick<RuntimeCoordinator, 'repo' | 'policy' | 'context' | 'broker' | 'studyCompanion'>;
type SourceReceipt = Pick<ContextReceipt, 'providedEvidenceIds' | 'providedSourceIds' | 'providedObjectVersions'>
  & Partial<Pick<ContextReceipt, 'workSourceBindings' | 'assistantWorkSources' | 'personalMethodSources' | 'campusSensitiveReads'
    | 'noteSources' | 'learningProcessVersions' | 'reflectiveLetterSources' | 'historicalAssertionVersions'
    | 'planningProvenance' | 'sceneReferences' | 'materialReads' | 'toolAttempts'>>;
export interface ProgramSourceProvenance {
  version: 1;
  identity: { principalId: string; workspaceId: string; subjectId: string; worldId: string; audience: string };
  bindings: (InteractiveBindingInput & { tool: string; sourceId?: string; fetchedAt?: string; expiresAt?: string;
    status?: string; use?: 'historical_only' | 'source_evidence';
    /** Host-only inheritance. A prior observation is never a new delivery. */
    origin?: 'previous_program'; parent?: ProgramSourceAddress })[];
  requiredGrants: string[];
  restrictionBaselines: { eventId: string; metadata: string | null }[];
  evidenceWindows: WorkSourceRef[];
  receipt: SourceReceipt;
  parents: ProgramSourceAddress[];
  /** Original owner/source metadata for every admitted SourceSlot, including
   * branches absent in the initial render. No Scene body or campus rows. */
  sceneMetadata?: Record<string, unknown>[];
  sceneOwnerRefs?: { kind: 'work' | 'agenda'; id: string; revision: number; study?: boolean; sessionId?: string }[];
}
export interface ProgramSceneSourceSupplement {
  records?: Pick<WorkRecord, 'id' | 'revision' | 'sourceBinding'>[];
  bindings?: WorkSourceBinding[];
  assistantWorkSources?: AssistantWorkSource[];
  noteSources?: NoteSourceProof[];
}
export interface ProgramSourceAdmission { data: ProgramDataMap; provenance: ProgramSourceProvenance }
type TrustedAdmission = { host: ProgramHost; session: RunSession; signal: AbortSignal };
const admissions = new WeakMap<ProgramSourceAdmission, TrustedAdmission>();
type AuthoredEvidence = { id: string; sourceId: string; version: number; persistent: boolean; restrictions: string };
type LiveProgram = { sessionId: string; boundary: number; ephemeral: boolean; view: PresentationView;
  provenance: ProgramSourceProvenance; creatorEvidence: AuthoredEvidence[]; authoredEvidence?: AuthoredEvidence[] };
const livePrograms = new WeakMap<ProgramHost['repo'], Map<string, LiveProgram>>();
const sourceKeys = ['workSourceBindings', 'assistantWorkSources', 'personalMethodSources', 'campusSensitiveReads', 'noteSources',
  'learningProcessVersions', 'reflectiveLetterSources', 'historicalAssertionVersions', 'planningProvenance', 'sceneReferences', 'materialReads', 'toolAttempts'] as const;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const sourceKey = (ref: ProgramSourceAddress) => canonical(ref);
function fail(message: string): never { throw new HarnessError('interactive_program_source_changed', message); }

function address(raw: unknown): ProgramSourceAddress | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some(key => !['messageId', 'programId', 'revision'].includes(key))
    || typeof r.messageId !== 'string' || !r.messageId || r.messageId.length > 160
    || typeof r.programId !== 'string' || !r.programId || r.programId.length > 160
    || !Number.isSafeInteger(r.revision) || Number(r.revision) < 1) return;
  return { messageId: r.messageId, programId: r.programId, revision: Number(r.revision) };
}
function provenance(raw: unknown): ProgramSourceProvenance | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const p = raw as ProgramSourceProvenance;
  if (p.version !== 1 || !p.identity || !['principalId', 'workspaceId', 'subjectId', 'worldId', 'audience']
    .every(key => typeof p.identity[key as keyof typeof p.identity] === 'string')
    || !Array.isArray(p.bindings) || p.bindings.length > 8 || !Array.isArray(p.requiredGrants)
    || p.requiredGrants.some(grant => typeof grant !== 'string') || !Array.isArray(p.parents) || p.parents.length > 32
    || !Array.isArray(p.restrictionBaselines) || p.restrictionBaselines.some(value => typeof value?.eventId !== 'string'
      || value.metadata !== null && typeof value.metadata !== 'string')
    || p.parents.some(ref => !address(ref)) || !p.receipt || !Array.isArray(p.receipt.providedEvidenceIds)
    || p.sceneMetadata !== undefined && (!Array.isArray(p.sceneMetadata) || p.sceneMetadata.length > 32)
    || p.sceneOwnerRefs !== undefined && (!Array.isArray(p.sceneOwnerRefs) || p.sceneOwnerRefs.length > 256
      || p.sceneOwnerRefs.some(ref => !ref || !['work', 'agenda'].includes(ref.kind) || typeof ref.id !== 'string'
        || !Number.isSafeInteger(ref.revision) || ref.revision < 1))
    || p.receipt.providedEvidenceIds.some(id => typeof id !== 'string')
    || p.receipt.providedSourceIds !== undefined && (!Array.isArray(p.receipt.providedSourceIds)
      || p.receipt.providedSourceIds.some(id => typeof id !== 'string'))
    || !Array.isArray(p.receipt.providedObjectVersions) || p.receipt.providedObjectVersions.some(ref => !ref
      || typeof ref.id !== 'string' || !Number.isSafeInteger(ref.revision) || ref.revision < 1)
    || !Array.isArray(p.evidenceWindows) || p.evidenceWindows.some(ref => !ref || typeof ref.eventId !== 'string'
      || !Number.isSafeInteger(ref.contentVersion) || !Number.isSafeInteger(ref.start) || !Number.isSafeInteger(ref.end)
      || ref.contentVersion < 1 || ref.start < 0 || ref.end < ref.start)
    || p.bindings.some(binding => !binding || typeof binding.tool !== 'string'
      || binding.origin !== undefined && (binding.origin !== 'previous_program' || !address(binding.parent)
        || !p.parents.some(parent => sourceKey(parent) === sourceKey(binding.parent!)))
      || binding.origin === undefined && binding.parent !== undefined
      || !interactiveBindingInputSchema.safeParse({ alias: binding.alias, observationId: binding.observationId, path: binding.path }).success)) return;
  return p;
}
function sourceReceipt(receipt: ContextReceipt): SourceReceipt {
  const result: SourceReceipt = { providedEvidenceIds: [...receipt.providedEvidenceIds],
    providedSourceIds: [...(receipt.providedSourceIds || [])], providedObjectVersions: structuredClone(receipt.providedObjectVersions) };
  for (const key of sourceKeys) if (receipt[key] !== undefined) (result as any)[key] = structuredClone(receipt[key]);
  // A host-created current receipt explicitly distinguishes ordinary campus
  // reads from legacy generic calls with no purpose provenance.
  result.campusSensitiveReads ??= [];
  return result;
}
function cloneData(raw: unknown, depth = 0, counter = { count: 0 }): ProgramJsonValue {
  if (++counter.count > 24000 || depth > 32) fail('这份已读资料结构过大，请先读取眼前需要的部分。');
  if (raw === null || typeof raw === 'boolean' || typeof raw === 'string') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (Array.isArray(raw)) return Object.freeze(raw.map(value => cloneData(value, depth + 1, counter))) as unknown as ProgramJsonValue[];
  if (!raw || typeof raw !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('绑定资料必须是实际交付的普通 JSON。');
  const result: Record<string, ProgramJsonValue> = Object.create(null);
  for (const [key, value] of Object.entries(raw)) {
    if (forbidden.has(key)) fail('这个资料字段不能作为交互数据。');
    result[key] = cloneData(value, depth + 1, counter);
  }
  return Object.freeze(result);
}
function select(value: unknown, path: InteractiveBindingInput['path']) {
  let current = value;
  for (const part of path) {
    if (typeof part === 'number') {
      if (!Array.isArray(current) || part >= current.length || !Object.hasOwn(current, part)) fail('所选资料位置不在实际交付的结果中。');
    } else if (!current || typeof current !== 'object' || Array.isArray(current) || forbidden.has(part) || !Object.hasOwn(current, part))
      fail('所选资料字段不在实际交付的结果中。');
    current = (current as any)[part];
  }
  return cloneData(current);
}
function sourcePermits(host: ProgramHost, handle: ScopeHandle, session?: RunSession) {
  return (ref: WorkSourceRef) => {
    const view = session?.attentionEvidenceViews?.[ref.eventId];
    if (!view) return true;
    const event = host.repo.evidence(handle, ref.eventId);
    return !!event && event.contentVersion === ref.contentVersion && view.contentVersion === ref.contentVersion
      && ref.start >= view.sourceStart && ref.end <= view.sourceEnd
      && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
  };
}
function currentProofReadable(host: ProgramHost, handle: ScopeHandle, p: ProgramSourceProvenance, session?: RunSession,
  localDisplay = false, live?: LiveProgram): boolean {
  const s = host.policy.validate(handle), i = p.identity;
  if (i.principalId !== s.principalId || i.workspaceId !== s.workspaceId || i.subjectId !== s.subjectId
    || i.worldId !== s.worldId || i.audience !== s.audience || !s.grants.includes('evidence:read')
    || p.requiredGrants.some(grant => !s.grants.includes(grant))) return false;
  if ((p.receipt.providedSourceIds || []).some(id => !s.sources.includes(id)
    && !p.receipt.providedEvidenceIds.some(eventId => s.currentEventIds.includes(eventId)
      && session?.events.some(event => event.id === eventId && event.sourceId === id)))) return false;
  const permits = sourcePermits(host, handle, session);
  if (p.evidenceWindows.some(ref => !permits(ref))
    || p.receipt.providedEvidenceIds.some(id => session?.attentionEvidenceViews?.[id] && !p.evidenceWindows.some(ref => ref.eventId === id))
    || (p.receipt.workSourceBindings || []).some(binding => binding.refs.some(ref => !permits(ref)))
    || !host.repo.planningMessageReadable(handle, { contextReceipt: p.receipt, scenes: p.sceneMetadata || [] },
      { checked: new Map(), localDisplay, permits })) return false;
  for (const ref of p.sceneOwnerRefs || []) {
    if (host.repo.hasFence(ref.id)) return false;
    if (ref.kind === 'agenda') {
      const row = host.repo.db.prepare(`SELECT COALESCE(json_extract(payload,'$.revision'),1) AS revision FROM agenda WHERE id=?`).get(ref.id);
      if (!row || row.revision !== ref.revision) return false;
    } else {
      const filter = host.repo.filter(handle);
      const row = host.repo.db.prepare(`SELECT r.revision FROM h_work r WHERE ${filter.sql} AND r.id=?`).get(...filter.params, ref.id);
      if (!row || row.revision !== ref.revision || !s.sources.includes('work:self')) return false;
      if (ref.study) {
        try { host.studyCompanion.assertCurrent(handle, ref.id, ref.revision, { permits,
          ...(ref.sessionId ? { restrictToSessionId: ref.sessionId } : {}), ...(session ? { signal: session.signal } : {}) }); }
        catch (error) { if (error instanceof HarnessError) return false; throw error; }
      }
    }
  }
  const restrictions = host.repo.sourceRestrictionSnapshot(handle);
  if (p.restrictionBaselines.some(value => (restrictions.get(value.eventId)?.metadata ?? null) !== value.metadata)) return false;
  for (const id of p.receipt.providedEvidenceIds) {
    const event = host.repo.evidence(handle, id) || (s.currentEventIds.includes(id) ? session?.events.find(event => event.id === id) : undefined);
    const versions = p.receipt.providedObjectVersions.filter(ref => ref.kind === 'evidence' && ref.id === id);
    if (!event && live && creatorMetadataReadable(host, handle, live, id, session, localDisplay)) {
      const creator = live.creatorEvidence.find(value => value.id === id)!;
      if (versions.some(version => version.revision !== creator.version)
        || p.evidenceWindows.some(ref => ref.eventId === id && ref.contentVersion !== creator.version)) return false;
      continue;
    }
    if (!event || host.repo.hasFence(id, event.sourceId) || versions.some(version => event.contentVersion !== version.revision)) return false;
    if (p.evidenceWindows.some(ref => ref.eventId === id && ref.contentVersion !== event.contentVersion)) return false;
  }
  return true;
}
function restrictionBaselines(host: ProgramHost, pack: ContextPack) {
  const snapshot = host.repo.sourceRestrictionSnapshot(pack.contract.scope);
  return pack.receipt.providedEvidenceIds.map(eventId => ({ eventId, metadata: snapshot.get(eventId)?.metadata ?? null }));
}
function evidenceWindows(host: ProgramHost, session: RunSession, pack: ContextPack): WorkSourceRef[] {
  // Conservative source extent, not read coverage or ACK. An unknown preview
  // dependency requires full-source permission rather than inventing a quote.
  return pack.receipt.providedEvidenceIds.flatMap(eventId => {
    const view = session.attentionEvidenceViews?.[eventId];
    if (view) return [{ eventId, contentVersion: view.contentVersion, start: view.sourceStart, end: view.sourceEnd }];
    const event = session.events.find(event => event.id === eventId);
    const row = event ? { version: event.contentVersion, length: Array.from(event.text).length }
      : host.repo.db.prepare(`SELECT version,CASE WHEN instr(json_extract(payload,'$.text'),char(0))=0
          THEN length(json_extract(payload,'$.text')) END AS length FROM h_evidence WHERE id=?
        AND owner=? AND workspace=?`).get(eventId, host.repo.identity.principalId, host.repo.identity.workspaceId);
    return row && Number.isSafeInteger(row.version) && Number.isSafeInteger(row.length)
      ? [{ eventId, contentVersion: Number(row.version), start: 0, end: Number(row.length) }] : [];
  });
}
function liveDataFresh(host: ProgramHost, p: ProgramSourceProvenance) {
  return p.bindings.every(binding => !binding.expiresAt || Number.isFinite(Date.parse(binding.expiresAt))
    && Date.parse(binding.expiresAt) > Date.parse(host.repo.clock.now()));
}
function directRestrictions(host: ProgramHost, eventId: string) {
  return canonical(host.repo.db.prepare(`SELECT x.predicate,x.operation,x.replacement_event_id,s.content_version,
    s.start_cp,s.end_cp,s.effective_from FROM h_source_restrictions x LEFT JOIN h_source_restriction_spans s
    ON s.event_id=x.event_id AND s.predicate=x.predicate WHERE x.event_id=?
    AND (s.effective_from IS NULL OR julianday(s.effective_from) IS NULL OR julianday(s.effective_from)<=julianday(?))
    ORDER BY x.predicate,s.content_version,s.start_cp,s.end_cp`).all(eventId, host.repo.clock.now()));
}
function creatorEvidence(host: ProgramHost, session: RunSession, p: ProgramSourceProvenance): AuthoredEvidence[] {
  const scope = host.policy.validate(session.ingress.contract.scope);
  return session.events.filter(event => scope.currentEventIds.includes(event.id) && p.receipt.providedEvidenceIds.includes(event.id)
    && event.speaker === 'user' && !event.parentEventId).map(event => ({ id: event.id, sourceId: event.sourceId,
      version: event.contentVersion, persistent: !!host.repo.db.prepare('SELECT 1 FROM h_evidence WHERE id=?').get(event.id),
      restrictions: directRestrictions(host, event.id) }));
}
function creatorMetadataReadable(host: ProgramHost, handle: ScopeHandle, live: LiveProgram, eventId: string,
  session?: RunSession, localDisplay = false) {
  const scope = host.policy.validate(handle), proof = live.creatorEvidence.find(value => value.id === eventId);
  if (!proof || live.boundary !== host.policy.sourceBoundary || scope.child || session?.background
    || !scope.sources.includes(proof.sourceId)
    || !localDisplay && (!session || session.sessionId !== live.sessionId || !session.ingress.ownerHistoryAllowed
      || session.ingress.controlFallback || session.ingress.controlProposal?.sources === 'current_only'
      || session.ingress.contract.memoryMode === 'current_sources_only')
    || host.repo.hasFence(proof.id, proof.sourceId) || directRestrictions(host, proof.id) !== proof.restrictions) return false;
  const row = host.repo.db.prepare('SELECT version,source,status FROM h_evidence WHERE id=? AND owner=? AND workspace=?')
    .get(proof.id, scope.principalId, scope.workspaceId);
  return row ? row.status !== 'deleted' && row.version === proof.version && row.source === proof.sourceId : !proof.persistent;
}
function authoredEvidence(host: ProgramHost, session: RunSession, view: PresentationView, p: ProgramSourceProvenance): AuthoredEvidence[] | undefined {
  if (view.program?.bindingAliases.length || p.bindings.length || p.requiredGrants.some(grant => grant !== 'evidence:read')
    || (p.receipt.providedSourceIds || []).some(source => source !== 'current' && source !== 'history:self')
    || sourceKeys.some(key => key !== 'toolAttempts' && (p.receipt[key]?.length || 0) > 0)) return;
  const scope = host.policy.validate(session.ingress.contract.scope), result: AuthoredEvidence[] = [];
  const coveredUsers = new Set<string>(), coveredMessages = new Set<string>(), visited = new Set<string>(), pending = [...p.parents];
  while (pending.length) {
    if (visited.size > 4096) return;
    const parent = pending.pop()!, key = sourceKey(parent);
    if (visited.has(key)) continue;
    visited.add(key);
    const cached = livePrograms.get(host.repo)?.get(key);
    if (!cached?.authoredEvidence || cached.sessionId !== session.sessionId || cached.boundary !== host.policy.sourceBoundary) return;
    coveredMessages.add(parent.messageId);
    for (const evidence of cached.authoredEvidence) coveredUsers.add(evidence.id);
    pending.push(...cached.provenance.parents);
  }
  const history = [...(Array.isArray(session.pack?.data.history) ? session.pack.data.history : []),
    ...(Array.isArray(session.pack?.data.volatileConversationHistory) ? session.pack.data.volatileConversationHistory : [])];
  if (history.some(row => row?.role === 'assistant' ? !coveredMessages.has(row.id)
    : row?.role === 'user' && !coveredUsers.has(row.id) && !scope.currentEventIds.includes(row.id))) return;
  for (const observation of session.observations || []) {
    if (observation.tool !== 'read_assistant_history' || !observation.toolCallId
      || !session.deliveredObservationIds?.has(observation.toolCallId)) continue;
    const items = (observation.result as { items?: { id?: unknown; text?: unknown }[] })?.items;
    if (Array.isArray(items) && items.some(row => typeof row.text === 'string' && row.text.length && !coveredMessages.has(String(row.id)))) return;
  }
  if (p.receipt.providedObjectVersions.some(ref => ref.kind !== 'evidence'
    || !scope.currentEventIds.includes(ref.id) && !coveredUsers.has(ref.id))) return;
  for (const id of p.receipt.providedEvidenceIds) {
    if (coveredUsers.has(id)) continue;
    const event = session.events.find(event => event.id === id && scope.currentEventIds.includes(id)
      && event.speaker === 'user' && !event.parentEventId);
    if (!event) return;
    result.push({ id, sourceId: event.sourceId, version: event.contentVersion,
      persistent: !!host.repo.db.prepare('SELECT 1 FROM h_evidence WHERE id=?').get(id), restrictions: directRestrictions(host, id) });
  }
  return result;
}
/** An original, source-free local artifact can remain in its volatile
 * conversation without retaining the prompt body. Explicit source limits,
 * a different conversation, deletion or a policy barrier still end access. */
function authoredLiveReadable(host: ProgramHost, handle: ScopeHandle, live: LiveProgram, session?: RunSession, localDisplay = false) {
  const scope = host.policy.validate(handle), p = live.provenance;
  if (!live.authoredEvidence || live.boundary !== host.policy.sourceBoundary || scope.audience !== 'self'
    || scope.child || session?.background
    || p.identity.principalId !== scope.principalId || p.identity.workspaceId !== scope.workspaceId
    || !scope.grants.includes('evidence:read') || !host.repo.db.prepare('SELECT 1 FROM sessions WHERE id=?').get(live.sessionId)
    || !localDisplay && (!session || live.sessionId !== session.sessionId || !session.ingress.ownerHistoryAllowed
      || session.ingress.controlFallback || session.ingress.contract.memoryMode === 'current_sources_only'
      || session.ingress.controlProposal?.sources === 'current_only'
      || p.identity.subjectId !== scope.subjectId || p.identity.worldId !== scope.worldId)) return false;
  if (p.evidenceWindows.some(ref => {
    const view = session?.attentionEvidenceViews?.[ref.eventId];
    return view && (view.contentVersion !== ref.contentVersion || ref.start < view.sourceStart || ref.end > view.sourceEnd);
  })) return false;
  return live.authoredEvidence.every(proof => {
    if (host.repo.hasFence(proof.id, proof.sourceId) || directRestrictions(host, proof.id) !== proof.restrictions) return false;
    const row = host.repo.db.prepare(`SELECT version,source,status FROM h_evidence WHERE id=? AND owner=? AND workspace=?`)
      .get(proof.id, scope.principalId, scope.workspaceId);
    return row ? row.status !== 'deleted' && row.version === proof.version && row.source === proof.sourceId : !proof.persistent;
  });
}

/** Only ToolRegistry's final, actually delivered model-view is selectable.
 * requestedArguments, raw capability results and arbitrary owner paths never
 * participate. No hidden lookup is used to complete a missing binding. */
export function resolveProgramBindings(host: ProgramHost, session: RunSession, raw: InteractiveBindingInput[], signal: AbortSignal): ProgramSourceAdmission {
  signal.throwIfAborted();
  const pack = session.pack;
  if (!pack) fail('先接上当前对话，再使用已经读到的资料。');
  const bindings = raw.map(value => interactiveBindingInputSchema.parse(value));
  if (bindings.length > 8 || new Set(bindings.map(binding => binding.alias)).size !== bindings.length) fail('当前只保留互不重名的有限资料绑定。');
  const data: Record<string, ProgramJsonValue> = Object.create(null), proofBindings: ProgramSourceProvenance['bindings'] = [];
  for (const binding of bindings) {
    const matches = (session.observations || []).filter(observation => observation.toolCallId === binding.observationId);
    if (!session.deliveredObservationIds?.has(binding.observationId) || matches.length !== 1) fail('这份资料尚未真正提供给当前主模型，请先从原工具读取。');
    const observed = matches[0], result = observed.result as { observationId?: unknown } | null;
    if (observed.tool === 'read_assistant_history') fail('旧助手正文不是可恢复资料表，请沿它给出的原作品、笔记或账号来源重读后绑定；没有复制通用旧正文来绕过原消息删除。');
    if (!result || typeof result !== 'object' || result.observationId !== binding.observationId) fail('资料的实际投递地址不一致。');
    data[binding.alias] = select(observed.result, binding.path);
    const facts = observed.result as { sourceId?: unknown; fetchedAt?: unknown; expiresAt?: unknown; status?: unknown; use?: unknown };
    proofBindings.push({ ...binding, tool: observed.tool,
      ...(typeof facts.sourceId === 'string' ? { sourceId: facts.sourceId } : {}),
      ...(typeof facts.fetchedAt === 'string' ? { fetchedAt: facts.fetchedAt } : {}),
      ...(typeof facts.expiresAt === 'string' ? { expiresAt: facts.expiresAt } : {}),
      ...(typeof facts.status === 'string' ? { status: facts.status } : {}),
      ...(facts.use === 'historical_only' || facts.use === 'source_evidence' ? { use: facts.use } : {}) });
  }
  const scope = host.policy.validate(pack.contract.scope);
  const p: ProgramSourceProvenance = { version: 1, identity: { principalId: scope.principalId, workspaceId: scope.workspaceId,
    subjectId: scope.subjectId, worldId: scope.worldId, audience: scope.audience }, bindings: proofBindings,
    receipt: sourceReceipt(pack.receipt), requiredGrants: [...new Set(['evidence:read', ...host.broker.discover(pack.contract.scope)
      .filter(capability => capability.effect === 'read' && (pack.receipt.providedSourceIds || []).includes(capability.sourceId))
      .flatMap(capability => capability.requiredScopes), ...pack.receipt.toolAttempts
      .filter(attempt => ['fresh', 'partial', 'stale'].includes(attempt.status))
      .flatMap(attempt => host.broker.describe(attempt.capability)?.requiredScopes || [])])],
    restrictionBaselines: restrictionBaselines(host, pack),
    evidenceWindows: evidenceWindows(host, session, pack),
    parents: structuredClone(pack.receipt.interactiveProgramSources || []) };
  if (!currentProofReadable(host, pack.contract.scope, p, session)) fail('已读材料的一处来源刚发生变化，请回到现在允许的内容。');
  const admission = { data: Object.freeze(data), provenance: p };
  admissions.set(admission, { host, session, signal }); return admission;
}

/** Complete the source closure from actual host-qualified staged Scenes.
 * This never registers a model/body read. The caller records the actual
 * delivery size and one source admission before publishing the real view. */
export function bindProgramSceneSources(admission: ProgramSourceAdmission, scenes: SceneSnapshot[],
  supplement: ProgramSceneSourceSupplement = {}) {
  const trusted = admissions.get(admission);
  if (!trusted || !trusted.session.pack) fail('这组来源画面没有本轮主机准入。');
  const { host, session, signal } = trusted, handle = session.ingress.contract.scope;
  signal.throwIfAborted();
  const p = admission.provenance, receipt = p.receipt;
  const merge = (key: keyof SourceReceipt, values: unknown[]) => {
    (receipt as any)[key] = [...new Map([...(receipt[key] || []), ...values]
      .map(value => [canonical(value), structuredClone(value)])).values()];
  };
  const bindings: WorkSourceBinding[] = [...(supplement.bindings || []), ...(supplement.records || []).flatMap(record => record.sourceBinding ? [record.sourceBinding] : [])];
  const owners = [...(p.sceneOwnerRefs || []), ...(supplement.records || []).map(({ id, revision }) => ({ kind: 'work' as const, id, revision }))];
  const metadata = [...(p.sceneMetadata || [])];
  const assistantSources = [...(supplement.assistantWorkSources || []),
    ...host.repo.workAssistantWorkSources(handle, supplement.records || [])];
  const notes = [...(supplement.noteSources || [])];
  const learning: { id: string; revision: number }[] = [];
  const planning: NonNullable<ContextReceipt['planningProvenance']> = [];
  for (const scene of scenes) {
    const base: Record<string, unknown> = { id: scene.id, revision: scene.revision, kind: scene.kind,
      createdAt: scene.createdAt, source: { sourceId: scene.source.sourceId } };
    merge('sceneReferences', [{ id: scene.id, revision: scene.revision, sourceId: scene.source.sourceId,
      fetchedAt: scene.source.fetchedAt, ...(scene.source.expiresAt ? { expiresAt: scene.source.expiresAt } : {}) }]);
    merge('providedSourceIds', [scene.source.sourceId, ...(scene.kind === 'planning' ? scene.requiredSourceIds : [])]);
    p.requiredGrants = [...new Set([...p.requiredGrants, scene.kind === 'map' ? 'map:read'
      : scene.kind === 'campus' || scene.kind === 'campus_reference' ? 'campus:read'
      : scene.kind === 'weather' || scene.kind === 'environment' ? 'weather:read' : 'evidence:read'])];
    if (scene.kind === 'discussion') {
      bindings.push(scene.provenance.sourceBinding, ...scene.modules.map(module => module.sourceBinding));
      base.sessionId = scene.sessionId; base.matter = { id: scene.matter.id, revision: scene.matter.revision, needsReview: scene.matter.needsReview };
      base.provenance = { sourceBinding: scene.provenance.sourceBinding }; base.modules = scene.modules;
      base.coWork = scene.coWork.map(work => ({ id: work.id, revision: work.revision, matterId: work.matterId,
        matterRevision: work.matterRevision, snapshotProof: work.snapshotProof }));
      assistantSources.push(...scene.coWork.flatMap(work => work.historySource ? [work.historySource] : []));
      if (!scene.history) owners.push({ kind: 'work', id: scene.matter.id, revision: scene.matter.revision },
        ...scene.provenance.optionRefs.map(ref => ({ kind: 'work' as const, ...ref })));
      for (const work of scene.coWork) if (!work.history) learning.push(...work.learningProcessRefs);
    } else if (scene.kind === 'curiosity') {
      bindings.push(scene.provenance.sourceBinding); assistantSources.push(...(scene.provenance.assistantWorkSources || []));
      base.provenance = { sourceBinding: scene.provenance.sourceBinding, assistantWorkSources: scene.provenance.assistantWorkSources || [] };
      if (scene.view.status !== 'historical') owners.push({ kind: 'work', id: scene.view.id, revision: scene.view.revision },
        { kind: 'work', id: scene.view.matterId, revision: scene.view.matterRevision });
    } else if (scene.kind === 'study') {
      bindings.push(scene.owner.sourceBinding);
      owners.push({ kind: 'work', id: scene.owner.id, revision: scene.owner.revision, study: true,
        ...(session.ingress.contract.memoryMode === 'relevant' ? {} : { sessionId: session.sceneSessionId || session.sessionId }) });
    } else if (scene.kind === 'rehearsal') {
      bindings.push(scene.sourceBinding); owners.push({ kind: 'work', id: scene.ref.id, revision: scene.ref.revision });
    } else if (scene.kind === 'note') {
      notes.push(scene.proof); base.proof = scene.proof;
    } else if (scene.kind === 'planning') {
      if (scene.continuation) {
        base.continuation = scene.continuation;
        const { intentId, intentRevision, sourceBinding, attemptBasis } = scene.continuation;
        planning.push({ intentId, intentRevision, sourceBinding, attemptBasis });
        bindings.push(sourceBinding, ...attemptBasis.map(attempt => attempt.sourceBinding));
      }
      owners.push(...scene.blocks.flatMap(block => block.agendaRecord
        ? [{ kind: 'agenda' as const, id: block.agendaRecord.id, revision: block.agendaRecord.revision }] : []));
    } else if (scene.kind === 'map' && scene.storySetting) {
      bindings.push(scene.storySetting.sourceBinding); assistantSources.push(...(scene.storySetting.assistantWorkSources || []));
      base.storySetting = { sourceBinding: scene.storySetting.sourceBinding, assistantWorkSources: scene.storySetting.assistantWorkSources || [] };
    }
    metadata.push(base);
  }
  if (metadata.length > 32 || owners.length > 256) fail('来源画面的独立地址较多，请先保留当前需要的部分。');
  p.sceneMetadata = [...new Map(metadata.map(value => [canonical(value), value])).values()];
  p.sceneOwnerRefs = [...new Map(owners.map(value => [canonical(value), value])).values()];
  merge('workSourceBindings', bindings); merge('assistantWorkSources', assistantSources); merge('noteSources', notes);
  merge('learningProcessVersions', learning); merge('planningProvenance', planning);
  merge('providedObjectVersions', owners.filter(ref => ref.kind === 'work').map(({ id, revision }) => ({ id, revision, kind: 'work' })));
  for (const binding of bindings) {
    merge('providedSourceIds', binding.sourceIds); merge('providedEvidenceIds', binding.refs.map(ref => ref.eventId));
    merge('providedObjectVersions', binding.refs.map(ref => ({ id: ref.eventId, revision: ref.contentVersion, kind: 'evidence' })));
  }
  const baseline = host.repo.sourceRestrictionSnapshot(handle);
  const knownBaselines = new Set(p.restrictionBaselines.map(value => value.eventId));
  p.restrictionBaselines.push(...receipt.providedEvidenceIds.filter(eventId => !knownBaselines.has(eventId))
    .map(eventId => ({ eventId, metadata: baseline.get(eventId)?.metadata ?? null })));
  // Metadata extents preserve scope dependencies; they do not grant body-read
  // ACK. The actual model never receives staged Scene rows from this helper.
  p.evidenceWindows = [...new Map([...p.evidenceWindows,
    ...evidenceWindows(host, session, { ...session.pack!, receipt: receipt as ContextReceipt })]
    .map(ref => [canonical(ref), ref])).values()];
  if (!currentProofReadable(host, handle, p, session) || !programSourcesReadable(host, handle, p.parents, session))
    fail('一处来源画面的原owner、版本或可用片段已变化，未给隐藏分支补签。');
}

/** Editing an old program keeps its actual old source closure. A transient
 * revision replaced inside this same output Message is not invented as a
 * saved chapter; its existing parents and proofs remain exact dependencies. */
export function inheritPreviousProgramSources(admission: ProgramSourceAdmission,
  previous: { view: PresentationView; source: ProgramSourceAddress; program: NonNullable<PresentationView['program']> }, session: RunSession) {
  const trusted = admissions.get(admission), old = provenance(previous.program.provenance);
  if (!trusted || trusted.session !== session || !old || previous.view.id !== previous.source.programId
    || previous.view.revision !== previous.source.revision) fail('旧版本没有当前主机核过的真实来源。');
  trusted.signal.throwIfAborted();
  if (!programSourcesReadable(trusted.host, session.ingress.contract.scope, [previous.source], session)) fail('旧交互的来由已经变化。');
  const next = admission.provenance, sameOutput = previous.source.messageId === session.outputMessageId;
  if (sameOutput) {
    for (const key of ['providedEvidenceIds', 'providedSourceIds', 'providedObjectVersions', ...sourceKeys] as const) {
      const values = [...(next.receipt[key] || []), ...(old.receipt[key] || [])];
      (next.receipt as any)[key] = [...new Map(values.map(value => [canonical(value), structuredClone(value)])).values()];
    }
    next.requiredGrants = [...new Set([...next.requiredGrants, ...old.requiredGrants])];
    next.restrictionBaselines = [...new Map([...next.restrictionBaselines, ...old.restrictionBaselines]
      .map(value => [canonical(value), value])).values()];
    next.evidenceWindows = [...new Map([...next.evidenceWindows, ...old.evidenceWindows]
      .map(value => [canonical(value), value])).values()];
    next.sceneMetadata = [...new Map([...(next.sceneMetadata || []), ...(old.sceneMetadata || [])]
      .map(value => [canonical(value), value])).values()];
    next.sceneOwnerRefs = [...new Map([...(next.sceneOwnerRefs || []), ...(old.sceneOwnerRefs || [])]
      .map(value => [canonical(value), value])).values()];
  }
  next.parents = [...new Map([...next.parents, ...(sameOutput ? old.parents : [previous.source])]
    .map(ref => [sourceKey(ref), ref])).values()];
  if (next.parents.length > 32 || !currentProofReadable(trusted.host, session.ingress.contract.scope, next, session)) fail('这次修改没有截掉旧版本的来源条件。');
}

/** Only an exact, currently qualified previous live projection can supply
 * unchanged aliases. Proof/expiry remains attached to that original delivery;
 * no old observation is inserted into this run's delivered set. */
export function inheritPreviousProgramData(admission: ProgramSourceAdmission,
  previous: { view: PresentationView; source: ProgramSourceAddress; program: NonNullable<PresentationView['program']> }, session: RunSession) {
  const trusted = admissions.get(admission), old = provenance(previous.program.provenance);
  if (!trusted || trusted.session !== session || !old) fail('旧资料没有当前主机核过的来源。');
  trusted.signal.throwIfAborted();
  if (!programSourcesReadable(trusted.host, session.ingress.contract.scope, [previous.source], session)) fail('旧交互的来由已经变化。');
  const next = admission.provenance, replaced = new Set(next.bindings.map(binding => binding.alias));
  const retained = previous.program.bindingAliases.filter(alias => !replaced.has(alias));
  const data: Record<string, ProgramJsonValue> = { ...admission.data };
  for (const alias of retained) {
    const binding = old.bindings.find(item => item.alias === alias);
    if (!binding || !previous.program.currentData || !Object.hasOwn(previous.program.currentData, alias)
      || binding.expiresAt !== undefined && (!Number.isFinite(Date.parse(binding.expiresAt))
        || Date.parse(binding.expiresAt) <= Date.parse(trusted.host.repo.clock.now())))
      throw new HarnessError('interactive_program_data_unavailable', '原作品的一份资料需要沿原来源重新读到，再用本轮绑定接上；旧值没有补成空集。');
    const sameOutput = previous.source.messageId === session.outputMessageId;
    const inherited = sameOutput ? structuredClone(binding) : { ...structuredClone(binding),
      origin: 'previous_program' as const, parent: structuredClone(previous.source) };
    if (inherited.parent && !next.parents.some(parent => sourceKey(parent) === sourceKey(inherited.parent!)))
      fail('继承的资料没有保留原作品来源链。');
    next.bindings.push(inherited);
    data[alias] = cloneData(previous.program.currentData[alias]);
  }
  if (next.bindings.length > 8 || !provenance(next)
    || !currentProofReadable(trusted.host, session.ingress.contract.scope, next, session)) fail('继承的资料超出当前合法绑定范围。');
  admission.data = Object.freeze(data);
}

/** Called once for an actual source-qualified publication/read. A caller cannot
 * turn a model-supplied provenance object into a host receipt. */
export function recordProgramSources(pack: ContextPack, admission: ProgramSourceAdmission) {
  const trusted = admissions.get(admission);
  if (!trusted || trusted.session.pack !== pack) fail('这份交互没有本轮真实资料准入。');
  const { host, session, signal } = trusted; signal.throwIfAborted();
  if (!currentProofReadable(host, pack.contract.scope, admission.provenance, session)
    || !programSourcesReadable(host, pack.contract.scope, admission.provenance.parents, session)) fail('交互发布前一处原来源已改变。');
  const parents = admission.provenance.parents.filter(ref => ref.messageId !== session.outputMessageId);
  const combined = [...new Map([...(pack.receipt.interactiveProgramSources || []), ...parents].map(ref => [sourceKey(ref), ref])).values()];
  if (combined.length > 32) fail('当前采用的独立交互来源较多，请先继续眼前相关的一份。');
  if (combined.length) pack.receipt.interactiveProgramSources = structuredClone(combined);
  pack.receipt.campusSensitiveReads ??= [];
  host.repo.saveReceipt(pack.contract.scope, pack.receipt);
}

/** Host publication cache is not a second persistent owner. Every reuse
 * checks the current source proof; policy barriers make all live data stale. */
export function rememberProgramPublication(host: ProgramHost, session: RunSession, view: PresentationView, admission: ProgramSourceAdmission) {
  if (admissions.get(admission)?.session !== session || !session.outputMessageId || !view.program
    || canonical(view.program.provenance) !== canonical(admission.provenance)) fail('交互产物没有绑定到当前真实回复。');
  let cache = livePrograms.get(host.repo);
  if (!cache) {
    cache = new Map(); livePrograms.set(host.repo, cache);
    const ownedCache = cache;
    host.policy.onBarrier(() => ownedCache.clear());
  }
  const ref = { messageId: session.outputMessageId, programId: view.id, revision: view.revision };
  cache.set(sourceKey(ref), { sessionId: session.sessionId, boundary: host.policy.sourceBoundary, ephemeral: session.ephemeral,
    view: structuredClone(view), provenance: structuredClone(admission.provenance),
    creatorEvidence: creatorEvidence(host, session, admission.provenance),
    authoredEvidence: authoredEvidence(host, session, view, admission.provenance) });
  while (cache.size > 64) cache.delete(cache.keys().next().value!);
}
export function forgetProgramPublication(host: ProgramHost, session: RunSession, view: PresentationView) {
  if (session.outputMessageId) livePrograms.get(host.repo)?.delete(sourceKey({ messageId: session.outputMessageId,
    programId: view.id, revision: view.revision }));
}

/** Only a published view whose real ACK reached this main run can be refined
 * as part of the same reply. A pending cache entry is not a delivery. */
export function canRefineCurrentProgramPublication(host: ProgramHost, session: RunSession,
  previous: { id: string; expectedRevision: number }, signal: AbortSignal): boolean {
  signal.throwIfAborted();
  const handle = session.ingress.contract.scope, scope = host.policy.validate(handle);
  if (session.background || scope.child || scope.audience !== 'self' || !session.outputMessageId || !session.pack) return false;
  const cache = livePrograms.get(host.repo);
  if (!cache) return false;
  let latest: ProgramSourceAddress | undefined;
  for (const observation of session.observations || []) {
    if (observation.tool !== 'present_view' || !observation.toolCallId
      || !session.deliveredObservationIds?.has(observation.toolCallId)) continue;
    const result = observation.result as { status?: unknown; libraryVersion?: unknown;
      programRef?: { id?: unknown; revision?: unknown } } | undefined;
    const ref = result?.programRef;
    if (result?.status !== 'presented' || result.libraryVersion !== PROGRAM_LIBRARY_VERSION
      || ref?.id !== previous.id || typeof ref.revision !== 'number' || !Number.isSafeInteger(ref.revision) || ref.revision < 1) continue;
    const source = { messageId: session.outputMessageId, programId: previous.id, revision: ref.revision };
    const published = cache.get(sourceKey(source));
    if (!published || published.sessionId !== session.sessionId || published.boundary !== host.policy.sourceBoundary
      || published.view.id !== source.programId || published.view.revision !== source.revision
      || published.view.libraryVersion !== PROGRAM_LIBRARY_VERSION || !published.view.program) continue;
    if (!latest || source.revision > latest.revision) latest = source;
  }
  if (!latest || latest.revision !== previous.expectedRevision) return false;
  const readable = programSourcesReadable(host, handle, [latest], session);
  signal.throwIfAborted(); host.policy.validate(handle);
  return readable;
}

type ProgramMetadata = { sessionId: string; source: ProgramSourceAddress; provenance: ProgramSourceProvenance };
function metadata(host: ProgramHost, handle: ScopeHandle, ref: ProgramSourceAddress, sessionId?: string): ProgramMetadata | undefined {
  const s = host.policy.validate(handle);
  if (s.audience !== 'self' || s.subjectId !== s.principalId || s.worldId !== 'real' || !s.sources.includes('history:self')
    || !s.grants.includes('evidence:read') || host.repo.hasFence(ref.messageId) || host.repo.hasFence(ref.programId)) return;
  // Qualify identity before selecting any DSL, state, current data or text.
  const row = host.repo.db.prepare(`SELECT m.session_id AS session_id,json_extract(v.value,'$.program.provenance') AS provenance
    FROM messages m,json_each(m.payload,'$.views') v WHERE m.id=? AND m.role='assistant'
    AND json_extract(m.payload,'$.status')='done' AND json_extract(v.value,'$.id')=? AND json_extract(v.value,'$.revision')=?
    AND json_extract(v.value,'$.libraryVersion')=2 ${sessionId ? 'AND m.session_id=?' : ''}
    AND EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id
      AND e.owner=? AND e.workspace=? AND e.subject=? AND e.world='real' AND e.status!='deleted')
    AND NOT EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id AND (e.owner!=? OR e.workspace!=?))
    LIMIT 1`).get(ref.messageId, ref.programId, ref.revision, ...(sessionId ? [sessionId] : []),
      s.principalId, s.workspaceId, s.principalId, s.principalId, s.workspaceId);
  if (!row) return;
  let p: ProgramSourceProvenance | undefined;
  try { p = provenance(JSON.parse(String(row.provenance))); } catch { return; }
  if (!p || p.identity.principalId !== s.principalId || p.identity.workspaceId !== s.workspaceId || p.identity.subjectId !== s.subjectId
    || p.identity.worldId !== s.worldId || p.identity.audience !== s.audience
    || p.requiredGrants.some(grant => !s.grants.includes(grant))
    || (p.receipt.providedSourceIds || []).some(id => !s.sources.includes(id))) return;
  return { sessionId: String(row.session_id), source: ref, provenance: p };
}
export function programSourcesReadable(host: ProgramHost, handle: ScopeHandle, raw: unknown, session?: RunSession, localDisplay = false): boolean {
  if (!Array.isArray(raw) || raw.length > 32) return false;
  const checked = new Map<string, boolean | 'checking'>();
  const stack: { value: unknown; exit?: boolean }[] = raw.map(value => ({ value }));
  let visited = 0;
  try { while (stack.length) {
    session?.signal.throwIfAborted();
    if (++visited > 8192) return false;
    const item = stack.pop()!, ref = address(item.value); if (!ref) return false;
    const key = sourceKey(ref), prior = checked.get(key);
    if (item.exit) { checked.set(key, true); continue; }
    if (prior === true) continue;
    if (prior === 'checking') return false;
    checked.set(key, 'checking');
    const saved = metadata(host, handle, ref, session && session.ingress.contract.memoryMode !== 'relevant' ? session.sessionId : undefined);
    const live = livePrograms.get(host.repo)?.get(key);
    const permittedLive = live && live.boundary === host.policy.sourceBoundary
      && (session && live.sessionId === session.sessionId
        && (live.ephemeral || ref.messageId === session.outputMessageId || authoredLiveReadable(host, handle, live, session))
        || localDisplay && authoredLiveReadable(host, handle, live, undefined, true))
      && !host.repo.hasFence(ref.messageId) && !host.repo.hasFence(ref.programId);
    const p = saved?.provenance || (permittedLive ? live.provenance : undefined);
    const ownerMetadata = saved ? host.repo.messageSourceMetadata(saved.sessionId, ref.messageId) : undefined;
    if (saved && !ownerMetadata) return false;
    const { interactiveProgramSources: ownerParents = [], ...ownerReceipt } = ownerMetadata?.contextReceipt || {};
    if (!Array.isArray(ownerParents) || ownerParents.some(value => !address(value))) return false;
    const permits = sourcePermits(host, handle, session);
    if (Array.isArray(ownerReceipt.workSourceBindings) && ownerReceipt.workSourceBindings.some(binding =>
      !Array.isArray(binding?.refs) || binding.refs.some((ref: WorkSourceRef) => !permits(ref)))) return false;
    if (!p || !(currentProofReadable(host, handle, p, session, localDisplay, permittedLive ? live : undefined)
        || permittedLive && authoredLiveReadable(host, handle, live, session, localDisplay))
      || ownerMetadata && !host.repo.planningMessageReadable(handle, { ...ownerMetadata, contextReceipt: ownerReceipt },
        { checked: new Map(), localDisplay, permits })) return false;
    stack.push({ value: ref, exit: true }, ...[...p.parents, ...ownerParents].map(value => ({ value })));
  } return true; } catch (error) { if (error instanceof HarnessError) return false; throw error; }
}
export function programReferenceIdentity(host: ProgramHost, handle: ScopeHandle, ref: ProgramSourceAddress, sessionId?: string) {
  const saved = metadata(host, handle, ref, sessionId);
  const live = livePrograms.get(host.repo)?.get(sourceKey(ref));
  const liveIdentity = live && host.policy.validate(handle).sources.includes('history:self')
    && live.sessionId === sessionId && authoredLiveReadable(host, handle, live, undefined, true)
    && !host.repo.hasFence(ref.messageId) && !host.repo.hasFence(ref.programId);
  // No proof-body traversal, DSL or data selection before control parsing.
  return saved || liveIdentity ? { ...ref, sessionId: saved?.sessionId || live!.sessionId, kind: 'interactive_program' as const,
    meaning: '共同讨论的交互作品；局部参数不是本人事实或执行授权。' } : undefined;
}

export function readProgramView(host: ProgramHost, session: RunSession, raw: ProgramSourceAddress): PresentationView {
  const ref = address(raw); if (!ref) fail('交互地址不完整。');
  const handle = session.ingress.contract.scope, cache = livePrograms.get(host.repo)?.get(sourceKey(ref));
  const allowCross = session.ingress.contract.memoryMode === 'relevant';
  const saved = metadata(host, handle, ref, allowCross ? undefined : session.sessionId);
  if (cache && cache.boundary === host.policy.sourceBoundary && (allowCross || cache.sessionId === session.sessionId)
    && (saved || cache.sessionId === session.sessionId && (cache.ephemeral || ref.messageId === session.outputMessageId
      || authoredLiveReadable(host, handle, cache, session)))
    && !host.repo.hasFence(ref.messageId) && !host.repo.hasFence(ref.programId)
    && (currentProofReadable(host, handle, cache.provenance, session, false, cache) || authoredLiveReadable(host, handle, cache, session))
    && programSourcesReadable(host, handle, [ref], session)) {
    const view = structuredClone(cache.view);
    if (view.program && !liveDataFresh(host, cache.provenance)) delete view.program.currentData;
    return view;
  }
  if (!saved) throw new HarnessError('interactive_program_reference_unqualified',
    '这个地址暂未接到当前可读的原作品，请沿本轮提供的原入口继续。');
  if (!programSourcesReadable(host, handle, [ref], session)) throw new HarnessError('interactive_program_source_proof_unavailable',
    '原作品的一处依据现在不可用，先按当前允许的来源继续。');
  const row = host.repo.db.prepare(`SELECT v.value AS view FROM messages m,json_each(m.payload,'$.views') v
    WHERE m.id=? AND json_extract(v.value,'$.id')=? AND json_extract(v.value,'$.revision')=? LIMIT 1`)
    .get(ref.messageId, ref.programId, ref.revision);
  if (!row) throw new HarnessError('interactive_program_view_missing',
    '原作品的这版画面已不在原位置，请回原入口取得当前版本。');
  const view = JSON.parse(String(row.view)) as PresentationView;
  if (view.program) delete view.program.currentData;
  return view;
}

/** A real source-qualified original read, issued by the host reader rather
 * than a model-supplied proof. It records an address, not a second data owner. */
export function admitProgramRead(host: ProgramHost, session: RunSession, ref: ProgramSourceAddress,
  view: PresentationView, signal: AbortSignal): ProgramSourceAdmission {
  signal.throwIfAborted();
  if (!session.pack || !view.program || view.id !== ref.programId || view.revision !== ref.revision
    || !programSourcesReadable(host, session.ingress.contract.scope, [ref], session)) fail('交互原地址不能按本轮来源继续读取。');
  const scope = host.policy.validate(session.ingress.contract.scope);
  const admission: ProgramSourceAdmission = { data: view.program.currentData || Object.freeze({}), provenance: {
    version: 1, requiredGrants: ['evidence:read'], identity: { principalId: scope.principalId, workspaceId: scope.workspaceId, subjectId: scope.subjectId,
    worldId: scope.worldId, audience: scope.audience }, bindings: [], receipt: sourceReceipt(session.pack.receipt),
    restrictionBaselines: restrictionBaselines(host, session.pack), evidenceWindows: evidenceWindows(host, session, session.pack), parents: [ref],
  } };
  admissions.set(admission, { host, session, signal }); return admission;
}

/** A failed submitted address never becomes navigation authority. Only the
 * same formally admitted focus or an exact delivered read can offer a shape. */
function knownPreviousNavigation(host: ProgramHost, session: RunSession,
  previous: { id: string; expectedRevision: number }, signal: AbortSignal): InteractiveProgramPreviousDiagnostic {
  const base = { fields: { id: 'programId', expectedRevision: 'revision' }, automaticRebase: false } as const;
  const candidates: { source: ProgramSourceAddress; basis: 'formal_current' | 'delivered_this_run' }[] = [];
  const formal = session.programReference;
  const current = session.pack?.data.currentInteractive as Record<string, unknown> | undefined;
  if (formal && current?.messageId === formal.messageId && current.programId === formal.programId
    && current.revision === formal.revision && current.nodeId === formal.nodeId
    && session.pack?.receipt.interactiveProgramSources?.some(ref => ref.messageId === formal.messageId
      && ref.programId === formal.programId && ref.revision === formal.revision))
    candidates.push({ source: { messageId: formal.messageId, programId: formal.programId, revision: formal.revision }, basis: 'formal_current' });
  for (const read of [...(session.pack?.receipt.interactiveProgramReads || [])].reverse()) {
    const source = address(read.source);
    if (read.delivery !== 'delivered_to_model' || !source
      || previous.id !== source.programId && previous.id !== source.messageId
      || candidates.some(candidate => sourceKey(candidate.source) === sourceKey(source))) continue;
    candidates.push({ source, basis: 'delivered_this_run' });
  }
  for (const candidate of candidates) {
    signal.throwIfAborted(); host.policy.validate(session.ingress.contract.scope);
    if (!programSourcesReadable(host, session.ingress.contract.scope, [candidate.source], session)) continue;
    signal.throwIfAborted(); host.policy.validate(session.ingress.contract.scope);
    const source = { ...candidate.source };
    return { ...base,
      relation: previous.id === source.programId ? previous.expectedRevision === source.revision
        ? 'matches_known_reference' : 'known_program_revision_mismatch'
        : previous.id === source.messageId ? 'message_id_used_as_program_id' : 'unmatched_input',
      knownReference: { basis: candidate.basis, source, previous: { id: source.programId, expectedRevision: source.revision },
        read: { tool: 'read_interactive_program', arguments: { ...source, mode: 'overview' } } } };
  }
  signal.throwIfAborted(); host.policy.validate(session.ingress.contract.scope);
  return { ...base, relation: 'no_qualified_known_reference' };
}

export function lookupPreviousProgram(host: ProgramHost, session: RunSession, previous: { id: string; expectedRevision: number }, signal: AbortSignal) {
  signal.throwIfAborted();
  const allowCross = session.ingress.contract.memoryMode === 'relevant';
  const rows = host.repo.db.prepare(`SELECT m.id AS message_id,json_extract(v.value,'$.revision') AS revision
    FROM messages m,json_each(m.payload,'$.views') v WHERE m.role='assistant' AND json_extract(m.payload,'$.status')='done'
    AND json_extract(v.value,'$.libraryVersion')=2 AND json_extract(v.value,'$.id')=?
    ${allowCross ? '' : 'AND m.session_id=?'} ORDER BY json_extract(v.value,'$.revision') DESC,m.rowid DESC LIMIT 1`)
    .all(previous.id, ...(allowCross ? [] : [session.sessionId]));
  const candidates = rows.map(row => ({ messageId: String(row.message_id), programId: previous.id, revision: Number(row.revision) }));
  for (const [key, cached] of livePrograms.get(host.repo) || []) {
    if (cached.sessionId !== session.sessionId || cached.view.id !== previous.id || cached.boundary !== host.policy.sourceBoundary) continue;
    const ref = JSON.parse(key) as ProgramSourceAddress;
    if (!candidates.some(candidate => sourceKey(candidate) === key)) candidates.push(ref);
  }
  const latest = candidates.sort((a, b) => b.revision - a.revision)[0];
  if (!latest || latest.revision !== previous.expectedRevision)
    throw new HarnessError('revision_conflict', '提交的原作品地址或版本与当前入口不匹配，请先接回已知原地址。', 'never', {
      rejectedDimensions: ['previous_reference'], previous: knownPreviousNavigation(host, session, previous, signal),
      explanation: '这次拒绝不证明存在新版本。program.previous.id对应programId，不是messageId；expectedRevision对应已读取的revision。knownReference仅来自本轮正式引用或精确已投递且来源重新核合法的原地址，不是SQL最新版本；复制形状须自行明确提交，不自动代填或rebase。真正版本冲突仍先沿原合法入口取得当前版本，未取得时不修改。',
    });
  const source = { messageId: latest.messageId, programId: latest.programId, revision: latest.revision };
  const view = readProgramView(host, session, source);
  return { view, source, program: view.program! };
}

export function programReferencesForSession(host: ProgramHost, handle: ScopeHandle, sessionId: string, options: { limit?: number } = {}) {
  const limit = Math.min(64, Math.max(1, options.limit ?? 4));
  const rows = host.repo.db.prepare(`SELECT m.id AS message_id,json_extract(v.value,'$.id') AS program_id,
    json_extract(v.value,'$.revision') AS revision FROM messages m,json_each(m.payload,'$.views') v
    WHERE m.session_id=? AND m.role='assistant' AND json_extract(m.payload,'$.status')='done'
    AND json_extract(v.value,'$.libraryVersion')=2 ORDER BY m.created_at DESC,m.rowid DESC LIMIT ?`).all(sessionId, limit * 4);
  const refs: { messageId: string; programId: string; revision: number; libraryVersion: 2;
    read: { tool: string; arguments: ProgramSourceAddress } }[] = [];
  for (const row of rows) {
    const ref = address({ messageId: row.message_id, programId: row.program_id, revision: row.revision });
    if (!ref || !metadata(host, handle, ref, sessionId)) continue;
    refs.push({ ...ref, libraryVersion: 2, read: { tool: 'read_interactive_program', arguments: ref } });
    if (refs.length >= limit) break;
  }
  return refs;
}

/** Never mutate the live IPC object while removing bound personal data from
 * the original persistent Message owner. No alternative data table is made. */
export function sanitizeProgramMessageForStorage(message: Message): Message {
  if (!message.views?.some(view => view.program?.currentData !== undefined)) return message;
  return { ...message, views: message.views.map(view => {
    if (!view.program) return view;
    const { currentData: _currentData, ...program } = view.program;
    return { ...view, program };
  }) };
}
export function programMessageProjection(host: ProgramHost, message: Message, options: { live?: boolean } = {}): Message {
  if (!message.views?.some(view => view.program)) return message;
  const handle = host.policy.hostScope();
  return { ...message, views: message.views.map(view => {
    if (!view.program) return view;
    const p = provenance(view.program.provenance), live = livePrograms.get(host.repo)?.get(sourceKey({ messageId: message.id,
      programId: view.id, revision: view.revision }));
    const readable = p && (currentProofReadable(host, handle, p, undefined, true, live)
      || live && authoredLiveReadable(host, handle, live, undefined, true))
      && programSourcesReadable(host, handle, p.parents, undefined, true);
    if (!readable || view.program.bindingAliases.length && (!options.live || !view.program.currentData || !liveDataFresh(host, p!))) return {
      id: view.id, revision: view.revision, libraryVersion: 2, createdAt: view.createdAt, sceneRefs: [], dsl: '',
      programReference: { messageId: message.id, programId: view.id, revision: view.revision,
        status: readable ? 'needs_refresh' : 'source_unavailable', ...(readable && view.program.nodeIds[0]
          ? { nodeId: view.program.nodeIds[0] } : {}) },
    };
    return view;
  }) };
}
