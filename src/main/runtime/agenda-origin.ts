import { createHash } from 'node:crypto';
import { agendaOriginInputSchema, type AgendaOrigin, type AgendaOriginInput } from '../../shared/agenda';
import { effectSchema, HarnessError, type Dependency, type EffectAction, type EffectReceipt, type ScopeHandle } from '../../shared/harness';
import type { Action, Message } from '../../shared/types';
import type { LocalSearchService } from '../search';
import type { Store } from '../store';

type SourceRef = { eventId: string; contentVersion: number };
type EffectProof = { id: string; revision: number; digest: string; agendaRevision: number;
  receiptId: string; attemptId: string; approvalIds: string[] };
type OriginProof = { ref: SourceRef; relation: AgendaOrigin['relation'];
  chain?: EffectProof[] };
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const sourceRef = (eventId: unknown, version: unknown): SourceRef | undefined => typeof eventId === 'string'
  && eventId.length > 0 && eventId.length <= 160 && Number.isSafeInteger(version) && Number(version) > 0
  ? { eventId, contentVersion: Number(version) } : undefined;

/** Native navigation through the current calendar, evidence and message
 * owners. Nothing is indexed, copied into a new work, or granted to a model. */
export class NativeAgendaOrigin {
  constructor(private readonly store: Store, private readonly search: Pick<LocalSearchService, 'resolve'>) {}

  private boundary(input: AgendaOriginInput) {
    if (input.privacyEpoch !== this.store.kernel.epoch || input.policyRevision !== this.store.kernel.policyRevision
      || input.sourceBoundary !== this.store.runtime.policy.sourceBoundary)
      throw new HarnessError('agenda_source_changed', '资料范围刚有变化，重新打开这一天后再试。');
  }

  private evidence(handle: ScopeHandle, ref: SourceRef) {
    const repo = this.store.kernel, event = repo.evidence(handle, ref.eventId);
    if (!event || event.contentVersion !== ref.contentVersion || event.status !== 'active'
      || event.label.retention !== 'purpose_scoped' || repo.hasFence(event.id, event.sourceId)
      || repo.sourceRestrictions(handle, event.id).length || repo.sourceLineageRestricted(event)) return;
    if (event.sourceId.startsWith('campus:') && this.store.runtime.policy.revoked().some(grant => grant.startsWith('campus:'))) return;
    const grant = event.sourceId === 'profile:self' ? 'memory:read' : event.sourceId.startsWith('campus:') ? 'campus:read'
      : event.sourceId === 'map:local' ? 'map:read' : event.sourceId === 'weather:open-meteo' ? 'weather:read' : 'evidence:read';
    if (!this.store.runtime.policy.can(handle, grant)) return;
    return event;
  }

  private dependencyReadable(handle: ScopeHandle, dependency: Dependency) {
    const repo = this.store.kernel;
    if (repo.hasFence(dependency.producerId)) return false;
    const row = repo.db.prepare('SELECT version FROM h_evidence WHERE id=?').get(dependency.producerId);
    if (row) {
      const ref = sourceRef(dependency.producerId, dependency.producerRevision);
      return !!ref && !!this.evidence(handle, ref);
    }
    // A non-evidence source label is only a current source gate. Unknown work
    // or assertion dependencies cannot identify one original conversation.
    const scope = this.store.runtime.policy.validate(handle);
    if (dependency.producerId.startsWith('campus:') && this.store.runtime.policy.revoked().some(grant => grant.startsWith('campus:'))) return false;
    return scope.sources.includes(dependency.producerId)
      && this.store.runtime.policy.can(handle, dependency.producerId.startsWith('campus:') ? 'campus:read'
        : dependency.producerId === 'profile:self' ? 'memory:read' : dependency.producerId === 'map:local' ? 'map:read'
          : dependency.producerId === 'weather:open-meteo' ? 'weather:read' : 'evidence:read');
  }

  private effectProof(handle: ScopeHandle, owner: Action): { effect: EffectAction; proof: EffectProof } | undefined {
    const repo = this.store.kernel, runtime = this.store.runtime, scope = runtime.policy.validate(handle);
    const parsed = effectSchema.safeParse(runtime.actions.get(handle, owner.effectActionId || owner.id));
    if (!parsed.success) return;
    const effect = parsed.data, revision = owner.revision || 1;
    if (!Number.isSafeInteger(revision) || revision < 1 || !owner.saved || owner.demo
      || effect.ownerId !== scope.principalId || effect.workspaceId !== scope.workspaceId
      || effect.subjectId !== scope.principalId || effect.worldId !== 'real' || effect.audience !== 'self'
      || effect.sourceId !== 'local-agenda' || effect.effect !== 'local_write'
      || repo.hasFence(owner.id, 'local-agenda') || repo.hasFence(effect.id, effect.sourceId)
      || effect.status !== 'succeeded' || effect.simulated || !owner.approvalDigest
      || owner.approvalDigest !== effect.digest || !['local.agenda.save', 'local.agenda.change'].includes(effect.capability)
      || !effect.compensation?.applied || effect.compensation.targetId !== owner.id
      || effect.compensation.expectedRevision !== revision) return;
    if (effect.digest !== runtime.actions.digest({ capability: effect.capability, capabilityContract: effect.capabilityContract,
      arguments: effect.arguments, audience: effect.audience, revision: effect.revision, worldId: effect.worldId,
      validUntil: effect.validUntil, dependencies: effect.dependencies,
      ...(effect.planningOffer ? { planningOffer: effect.planningOffer } : {}),
      ...(effect.reminderSpeaker ? { reminderSpeaker: effect.reminderSpeaker } : {}) })) return;
    const versionId = repo.calendarVersionId(owner.id, revision), producers = repo.dependencies(versionId);
    if (repo.hasFence(versionId, 'local-agenda') || !repo.db.prepare('SELECT 1 FROM h_calendar_versions WHERE id=? AND agenda_id=? AND revision=?')
      .get(versionId, owner.id, revision) || producers.length !== 1 || producers[0].producerId !== effect.id
      || producers[0].producerRevision !== 0 || producers[0].sensitivity !== 'privacy' || producers[0].invalidation !== 'block') return;
    // Navigation checks an actual committed dispatch, not whether its old
    // execution ticket is still valid or can be approved again today.
    const receipts = repo.db.prepare(`SELECT r.id,r.attempt_id,r.payload,t.idempotency_key,t.status,t.epoch,t.payload AS attempt_payload
      FROM h_receipts r LEFT JOIN h_attempts t ON t.id=r.attempt_id AND t.action_id=r.action_id
      WHERE r.action_id=? AND json_extract(r.payload,'$.status')='confirmed_success'`).all(effect.id);
    if (receipts.length !== 1) return;
    const row = receipts[0], receipt = JSON.parse(String(row.payload)) as EffectReceipt;
    if (receipt.id !== row.id || receipt.actionId !== effect.id || receipt.attemptId !== row.attempt_id
      || receipt.sourceId !== effect.sourceId || receipt.localStatus !== 'local_saved' || receipt.externalRecordId !== owner.id
      || row.status !== 'succeeded' || row.idempotency_key !== effect.idempotencyKey || Number(row.epoch) !== effect.privacyEpoch
      || JSON.parse(String(row.attempt_payload)).capability !== effect.capability
      || repo.hasFence(receipt.id) || repo.hasFence(receipt.attemptId)) return;
    const approvalIds = repo.db.prepare(`SELECT id FROM h_approvals WHERE action_id=? AND json_extract(payload,'$.id')=id
      AND json_extract(payload,'$.actionId')=action_id AND json_extract(payload,'$.actionDigest')=?
      AND json_extract(payload,'$.actionRevision')=? AND json_extract(payload,'$.principalId')=?
      AND json_extract(payload,'$.privacyEpoch')=? AND json_extract(payload,'$.policyRevision')=?
      AND json_extract(payload,'$.used')=1 ORDER BY id`)
      .all(effect.id, effect.digest, effect.revision, scope.principalId, effect.privacyEpoch, effect.policyRevision)
      .map(approval => String(approval.id)).filter(id => !repo.hasFence(id));
    if (!approvalIds.length) return;
    const recorded = repo.dependencies(effect.id);
    if (new Set(effect.dependencies.map(dependency => dependency.producerId)).size !== effect.dependencies.length
      || effect.dependencies.some(dependency => !recorded.some(edge => edge.producerId === dependency.producerId
        && edge.producerRevision === dependency.producerRevision && edge.sensitivity === dependency.sensitivity
        && edge.invalidation === dependency.invalidation))) return;
    return { effect, proof: { id: effect.id, revision: effect.revision, digest: effect.digest,
      agendaRevision: revision, receiptId: receipt.id, attemptId: receipt.attemptId, approvalIds } };
  }

  private proof(handle: ScopeHandle, owner: Action): OriginProof | undefined {
    const repo = this.store.kernel;
    if (repo.hasFence(owner.id, 'local-agenda')) return;
    const legacy = owner as Action & { sourceEventId?: unknown; sourceVersion?: unknown };
    const declared = [[legacy.sourceEventId, legacy.sourceVersion],
      [owner.planning?.sourceEventId, owner.planning?.sourceVersion]].filter(pair => pair.some(value => value !== undefined));
    if (declared.length) {
      const refs = declared.map(([eventId, version]) => sourceRef(eventId, version));
      if (refs.some(ref => !ref) || refs.some(ref => ref!.eventId !== refs[0]!.eventId
        || ref!.contentVersion !== refs[0]!.contentVersion)) return;
      return { ref: refs[0]!, relation: 'declared_source' };
    }
    const chain: EffectProof[] = [];
    let item = owner;
    while (true) {
      const step = this.effectProof(handle, item);
      if (!step || chain.some(previous => previous.id === step.effect.id)) return;
      const { effect } = step;
      chain.push(step.proof);
      const calendar = effect.dependencies.filter(dependency => dependency.producerId.startsWith('agenda-version:'));
      if (effect.dependencies.some(dependency => !calendar.includes(dependency) && !this.dependencyReadable(handle, dependency))) return;
      if (effect.capability === 'local.agenda.change') {
        const previous = effect.compensation!.previous as unknown as Action | null, expected = effect.arguments.expectedRevision;
        if (!previous || previous.id !== owner.id || !Number.isSafeInteger(expected) || Number(expected) < 1
          || effect.arguments.targetId !== owner.id || effect.arguments.operation === 'delete'
          || (previous.revision || 1) !== expected || step.proof.agendaRevision !== Number(expected) + 1
          || calendar.length !== 1 || calendar[0].producerId !== repo.calendarVersionId(owner.id, Number(expected))
          || ![0, expected].includes(calendar[0].producerRevision) || calendar[0].invalidation !== 'block'
          || !['privacy', 'hard'].includes(calendar[0].sensitivity)) return;
        // Only this host-recorded predecessor can supply the next effect ID
        // and digest. A newer calendar object never signs an older reference.
        item = previous;
        continue;
      }
      if (calendar.length || effect.compensation!.previous !== null) return;
      const origins = effect.dependencies.flatMap(dependency => {
        if (dependency.invalidation !== 'block' || !['privacy', 'hard'].includes(dependency.sensitivity)) return [];
        const ref = sourceRef(dependency.producerId, dependency.producerRevision), event = ref && this.evidence(handle, ref);
        return ref && event?.sourceId === 'history:self' && event.speaker === 'user' && event.authority === 'user_statement' ? [ref] : [];
      });
      if (origins.length !== 1) return;
      return { ref: origins[0], relation: 'action_dependency', chain };
    }
  }

  private conversation(handle: ScopeHandle, ref: SourceRef): AgendaOrigin['locator'] | undefined {
    const repo = this.store.kernel, event = this.evidence(handle, ref);
    if (!event || event.sourceId !== 'history:self' || !event.sessionId || event.speaker !== 'user'
      || event.authority !== 'user_statement' || this.store.conversationPolicy(event.sessionId)?.retention === 'session_only') return;
    const rows = this.store.db.prepare(`SELECT m.id,m.session_id,m.content,m.payload,s.title FROM messages m
      JOIN sessions s ON s.id=m.session_id WHERE m.role='user' AND m.session_id=?
      AND (json_extract(m.payload,'$.authoredSource.eventId')=? OR m.id=?) LIMIT 2`)
      .all(event.sessionId, event.id, event.id);
    if (rows.length !== 1) return;
    const row = rows[0], message = JSON.parse(String(row.payload)) as Message;
    if (message.id !== row.id || message.sessionId !== row.session_id || message.role !== 'user'
      || message.retention === 'session_only' || repo.hasFence(message.id, 'history:self')) return;
    const length = Array.from(event.text).length, stamp = message.authoredSource;
    // The equality fallback admits old canonical rows only after proving the
    // actual retained message/session and exact body; the event ID alone is
    // never a navigation address. Stamped rows also permit attachment labels.
    const stamped = stamp && stamp.eventId === event.id && stamp.contentVersion === event.contentVersion
      && stamp.sha256 === hash(event.text) && stamp.displayStart === 0 && stamp.displayEnd === length
      && Array.from(String(row.content)).slice(0, length).join('') === event.text;
    if (!stamped && (stamp || message.id !== event.id || row.content !== event.text)) return;
    const retired = this.store.db.prepare(`SELECT 1 FROM h_evidence WHERE owner=? AND workspace=?
      AND json_extract(payload,'$.sessionId')=? AND status IN ('deleted','redacted') LIMIT 1`)
      .get(repo.identity.principalId, repo.identity.workspaceId, event.sessionId);
    const title = retired ? '一段对话' : String(row.title);
    return { kind: 'conversation', sessionId: message.sessionId, messageId: message.id,
      contentHash: hash(JSON.stringify([title, String(row.content)])), field: 'body', offset: 0, end: 0 };
  }

  async resolve(raw: unknown): Promise<AgendaOrigin | null> {
    const input = agendaOriginInputSchema.parse(raw);
    this.boundary(input);
    const runtime = this.store.runtime, handle = runtime.policy.hostScope({ infer: false, currentEventIds: [], audience: 'self' });
    const scope = runtime.policy.require(handle, 'evidence:read');
    const current = runtime.nativeAgenda.resolveReference(handle, { record: input.record });
    if (!scope.sources.includes('history:self') || this.store.kernel.hasFence('history:self')) return null;
    const proof = this.proof(handle, current.item), locator = proof && this.conversation(handle, proof.ref);
    if (!proof || !locator) return null;
    try {
      const resolved = await this.search.resolve(locator);
      this.boundary(input);
      const owner = runtime.nativeAgenda.resolveReference(handle, { record: input.record }).item;
      const fresh = this.proof(handle, owner), address = fresh && this.conversation(handle, fresh.ref);
      if (resolved.kind !== 'conversation' || JSON.stringify(fresh) !== JSON.stringify(proof)
        || !address || address.kind !== resolved.kind || address.sessionId !== resolved.sessionId
        || address.messageId !== resolved.messageId || address.contentHash !== resolved.contentHash
        || address.field !== resolved.field || address.offset !== resolved.offset || address.end !== resolved.end) return null;
      runtime.policy.validate(handle);
      return { locator: resolved, relation: proof.relation };
    } catch (error) {
      this.boundary(input);
      if (error instanceof HarnessError) return null;
      throw error;
    }
  }
}
