import type { ContextReceipt, ReleaseSource, ScopeHandle } from '../../shared/harness';
import type { ReleaseArtifact } from '../../shared/types';
import type { AssistantWorkProofState, KernelRepository } from '../storage/repository';
import type { PolicyKernel } from './policy';

/** Draft disclosure does not authorize reading the original private bodies.
 * Only their current owner/version/restriction metadata is inspected here. */
type ReleaseBasis = Pick<ReleaseArtifact, 'privacyEpoch' | 'ownerId' | 'workspaceId' | 'sourceIds' | 'sourceMessageId' | 'sourceMessageIds' | 'sourceMessageVersions' | 'sourceReceipts' | 'basedOnObjects' | 'basedOnReleases'>;
export type ReleaseArtifactHeader = ReleaseBasis & Pick<ReleaseArtifact, 'id' | 'revision'>;
export function releaseBasisCurrent(repo: KernelRepository, policy: PolicyKernel, scope: ScopeHandle, artifact: ReleaseBasis, currentObjects = true,
  proofs: AssistantWorkProofState = { checked: new Map() }) {
  const allowed = policy.validate(scope);
  const sources = [...new Set([artifact.sourceMessageId, ...(artifact.sourceMessageIds || [])])];
  const currentOnly = sources.length > 0 && sources.every(id => allowed.currentEventIds.includes(id));
  if (artifact.privacyEpoch !== allowed.privacyEpoch
    || artifact.ownerId && artifact.ownerId !== allowed.principalId || artifact.workspaceId && artifact.workspaceId !== allowed.workspaceId
    || !(artifact.sourceIds || ['history:self']).every(id => allowed.sources.includes(id)
      || currentOnly && (id === 'history:self' || id.startsWith('file:') && allowed.currentEventIds.includes(id.slice(5))))) return false;
  const versions = new Map<string, number>();
  for (const ref of artifact.sourceMessageVersions || []) {
    if (versions.has(ref.id) && versions.get(ref.id) !== ref.revision) return false;
    versions.set(ref.id, ref.revision);
  }
  if (!sources.length || sources.some(id => {
    const revision = versions.get(id);
    if (!id || !Number.isSafeInteger(revision) || revision! < 1 || repo.hasFence(id)) return true;
    const row = repo.db.prepare('SELECT version,status,owner,workspace,subject,world,expires_at FROM h_evidence WHERE id=?').get(id);
    if (!row && allowed.retention === 'session_only' && allowed.currentEventIds.includes(id)) return false;
    if (!row || row.status !== 'active' || row.owner !== allowed.principalId || row.workspace !== allowed.workspaceId
      || row.subject !== allowed.subjectId || row.world !== allowed.worldId || row.version !== revision
      || row.expires_at !== null && (!Number.isFinite(Date.parse(String(row.expires_at))) || Date.parse(String(row.expires_at)) <= Date.parse(repo.clock.now()))) return true;
    return !!repo.db.prepare(`SELECT 1 FROM h_source_restrictions x WHERE x.event_id=? AND (
      NOT EXISTS(SELECT 1 FROM h_source_restriction_spans s WHERE s.event_id=x.event_id AND s.predicate=x.predicate)
      OR EXISTS(SELECT 1 FROM h_source_restriction_spans s WHERE s.event_id=x.event_id AND s.predicate=x.predicate
        AND (julianday(s.effective_from) IS NULL OR julianday(s.effective_from)<=julianday(?)))) LIMIT 1`).get(id, repo.clock.now());
  })) return false;
  if (!artifact.sourceReceipts?.length || !artifact.sourceReceipts.every(receipt => {
    if (currentObjects && receipt.releaseSources === undefined) return false;
    if (receipt.campusReadingIncomplete) return false;
    const metadata = receipt as ContextReceipt & { campusReadingProofs?: unknown };
    if (receipt.providedSourceIds?.includes('campus:zju-account') && receipt.campusReadingAddresses === undefined && metadata.campusReadingProofs === undefined
      && receipt.campusReadingSources === undefined) return false;
    return repo.planningMessageReadable(scope, { contextReceipt: receipt }, { ...proofs, localDisplay: true });
  })) return false;
  return !currentObjects || releaseSourcesReadable(repo, policy, scope, artifact.basedOnReleases || [], true, proofs) && (artifact.basedOnObjects || []).every(ref => {
    if (repo.hasFence(ref.id) || !Number.isSafeInteger(ref.revision) || ref.revision < 1) return false;
    if (ref.kind === 'agenda') return allowed.sources.includes('local-agenda') && allowed.grants.includes('evidence:read')
      && repo.db.prepare("SELECT COALESCE(json_extract(payload,'$.revision'),1) AS revision FROM agenda WHERE id=?").get(ref.id)?.revision === ref.revision;
    if (ref.kind === 'work') { const current = repo.work(scope, undefined, ref.id)[0]; return !!current && current.revision === ref.revision && !['stale', 'blocked', 'cancelled'].includes(current.status); }
    if (ref.kind === 'assertion') { const current = repo.assertion(scope, ref.id); return current?.revision === ref.revision && current.status === 'active'; }
    return versions.get(ref.id) === ref.revision;
  });
}

/** Exact original addresses share the existing call-local traversal. Historical
 * source qualification and current draft reuse never share a cached verdict. */
export function releaseSourcesReadable(repo: KernelRepository, policy: PolicyKernel, scope: ScopeHandle, raw: unknown, currentObjects = false,
  proofs: AssistantWorkProofState = { checked: new Map() }): boolean {
  if (!Array.isArray(raw) || raw.length > 128) return false;
  const allowed = policy.validate(scope);
  if (raw.length && (!allowed.sources.includes('history:self') || !allowed.grants.includes('evidence:read') || allowed.audience !== 'self'
    || allowed.subjectId !== allowed.principalId || allowed.worldId !== 'real')) return false;
  return raw.every(ref => {
    if (!ref || !['sessionId', 'messageId', 'artifactId'].every(key => typeof ref[key] === 'string' && ref[key] && ref[key].length <= 160)
      || !Number.isSafeInteger(ref.revision) || ref.revision < 1) return false;
    const key = JSON.stringify(['release', currentObjects ? 'current' : 'history', ref.sessionId, ref.messageId, ref.artifactId, ref.revision]);
    const previous = proofs.checked.get(key);
    if (previous !== undefined) return previous === true;
    proofs.checked.set(key, 'checking');
    let readable = false;
    try {
      if (repo.hasFence(ref.messageId) || !repo.db.prepare(`SELECT 1 FROM messages WHERE id=? AND session_id=? AND role='assistant'
        AND json_extract(payload,'$.status')='done'`).get(ref.messageId, ref.sessionId)) return false;
      const metadata = repo.messageSourceMetadata(ref.sessionId, ref.messageId);
      if (!metadata || !repo.planningMessageReadable(scope, { contextReceipt: metadata.contextReceipt, scenes: metadata.scenes }, { ...proofs, localDisplay: true })) return false;
      const header = Array.isArray(metadata.releaseArtifacts) ? metadata.releaseArtifacts.find(value => value.id === ref.artifactId && value.revision === ref.revision) : undefined;
      if (!header) return false;
      if (currentObjects && repo.db.prepare(`SELECT MAX(json_extract(draft.value,'$.revision')) AS revision FROM messages m,json_each(m.payload,'$.releaseArtifacts') draft
        WHERE m.session_id=? AND m.role='assistant' AND json_extract(m.payload,'$.status')='done' AND json_extract(draft.value,'$.id')=?`).get(ref.sessionId, ref.artifactId)?.revision !== ref.revision) return false;
      readable = releaseArtifactCurrent(repo, policy, scope, originalSourceVersions(header, metadata.contextReceipt), currentObjects, proofs);
      return readable;
    } finally { proofs.checked.set(key, readable); }
  });
}

/** Called only for an actual prior body delivered to the private projector. */
export function releaseSourceForArtifact(repo: KernelRepository, policy: PolicyKernel, scope: ScopeHandle, sessionId: string, artifact: ReleaseArtifact): ReleaseSource | undefined {
  const row = repo.db.prepare(`SELECT m.id FROM messages m,json_each(m.payload,'$.releaseArtifacts') draft WHERE m.session_id=? AND m.role='assistant'
    AND json_extract(m.payload,'$.status')='done' AND json_extract(draft.value,'$.id')=? AND json_extract(draft.value,'$.revision')=? ORDER BY m.rowid DESC LIMIT 1`)
    .get(sessionId, artifact.id, artifact.revision);
  const source = row ? { sessionId, messageId: String(row.id), artifactId: artifact.id, revision: artifact.revision } : undefined;
  return source && releaseSourcesReadable(repo, policy, scope, [source]) ? source : undefined;
}

export function releaseArtifactCurrent(repo: KernelRepository, policy: PolicyKernel, scope: ScopeHandle, artifact: ReleaseArtifactHeader, currentObjects = true,
  proofs: AssistantWorkProofState = { checked: new Map() }) {
  return !repo.hasFence(artifact.id) && releaseBasisCurrent(repo, policy, scope, artifact, currentObjects, proofs);
}

/** Existing receipts are contemporaneous evidence, not a newly issued proof. */
function originalSourceVersions<T extends ReleaseArtifactHeader>(artifact: T, raw: unknown): T {
  const receipt = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const references = Array.isArray(receipt) ? receipt : Array.isArray(receipt?.providedObjectVersions) ? receipt.providedObjectVersions : [];
  const candidates = [...(artifact.sourceMessageVersions || []),
    ...references.filter((ref: any) => ref && ref.kind === 'evidence').map((ref: any) => ({ id: ref.id, revision: ref.revision })),
    ...(artifact.basedOnObjects || []).filter(ref => ref.kind === 'evidence')];
  const ids = new Set([artifact.sourceMessageId, ...(artifact.sourceMessageIds || [])]), versions = new Map<string, number>();
  const conflicting = new Set<string>();
  for (const ref of candidates) {
    if (!ids.has(ref.id)) continue;
    if (!Number.isSafeInteger(ref.revision) || ref.revision < 1 || versions.has(ref.id) && versions.get(ref.id) !== ref.revision) conflicting.add(ref.id);
    else versions.set(ref.id, ref.revision);
  }
  conflicting.forEach(id => versions.delete(id));
  return { ...artifact, sourceMessageVersions: [...versions].map(([id, revision]) => ({ id, revision })),
    sourceReceipts: artifact.sourceReceipts?.length ? artifact.sourceReceipts : receipt && !Array.isArray(receipt) ? [receipt] : undefined };
}

/** Private history does not become the head for current reuse or public display. */
export function historicalReleaseArtifact<T extends ReleaseArtifactHeader>(repo: KernelRepository, policy: PolicyKernel, scope: ScopeHandle, artifact: T, originalVersions: unknown,
  proofs: AssistantWorkProofState = { checked: new Map() }) {
  const historical = originalSourceVersions(artifact, originalVersions);
  return releaseArtifactCurrent(repo, policy, scope, historical, false, proofs) ? historical : undefined;
}

/** A message can contain multiple editor revisions. Its rendered body belongs
 * to that message's head, not an older still-readable entry in the array.
 * Independent older messages remain historical: ordinary object revisions
 * alone do not revoke their source-qualified explanation. */
export function releaseMessageReadable(repo: KernelRepository, policy: PolicyKernel, scope: ScopeHandle, raw: unknown, receipt: unknown, legacy: boolean,
  proofs: AssistantWorkProofState = { checked: new Map() }) {
  if (raw !== undefined) {
    if (!Array.isArray(raw)) return false;
    const heads = new Map<string, ReleaseArtifactHeader>();
    for (const header of raw) {
      if (!header || typeof header.id !== 'string' || !header.id || !Number.isSafeInteger(header.revision) || header.revision < 1) return false;
      if (!heads.has(header.id) || heads.get(header.id)!.revision < header.revision) heads.set(header.id, header);
    }
    return [...heads.values()].every(header => !!historicalReleaseArtifact(repo, policy, scope, header, receipt, proofs));
  }
  if (!legacy) return true;
  const original = receipt as ContextReceipt | undefined;
  if (!original || !Array.isArray(original.providedEvidenceIds) || !original.providedEvidenceIds.length
    || !Array.isArray(original.providedObjectVersions)) return false;
  return releaseBasisCurrent(repo, policy, scope, { privacyEpoch: original.privacyEpoch, sourceMessageId: original.providedEvidenceIds[0],
    sourceMessageIds: original.providedEvidenceIds, sourceMessageVersions: original.providedObjectVersions
      .filter(ref => ref.kind === 'evidence' && original.providedEvidenceIds.includes(ref.id)).map(ref => ({ id: ref.id, revision: ref.revision })),
    sourceIds: original.providedSourceIds, sourceReceipts: [original] }, false, proofs);
}

/** Locate one current draft for exact-purpose review without reading its body
 * or the private material used to prepare it. An unavailable latest object
 * does not select an older object in its place. */
export function latestReleaseReference(repo: KernelRepository, policy: PolicyKernel, scope: ScopeHandle, sessionId: string) {
  const allowed = policy.validate(scope);
  if (!allowed.sources.includes('history:self') || !allowed.grants.includes('evidence:read') || allowed.audience !== 'self'
    || allowed.subjectId !== allowed.principalId || allowed.worldId !== 'real') return;
  const row = repo.db.prepare(`SELECT m.id AS message_id,json_extract(j.value,'$.id') AS id,
    json_extract(j.value,'$.revision') AS revision,json_extract(j.value,'$.createdAt') AS created_at,
    json_extract(j.value,'$.authoredBy') AS authored_by FROM messages m,json_each(m.payload,'$.releaseArtifacts') j
    WHERE m.session_id=? AND m.role='assistant' AND json_extract(m.payload,'$.status')='done'
    ORDER BY json_extract(j.value,'$.createdAt') DESC,json_extract(j.value,'$.revision') DESC,m.rowid DESC LIMIT 1`).get(sessionId);
  if (!row || typeof row.id !== 'string' || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1) return;
  const metadata = repo.messageSourceMetadata(sessionId, String(row.message_id));
  const header = Array.isArray(metadata?.releaseArtifacts) ? metadata.releaseArtifacts.find(value => value.id === row.id && value.revision === row.revision) : undefined;
  if (!header || !releaseArtifactCurrent(repo, policy, scope, originalSourceVersions(header, metadata?.contextReceipt))) return;
  return { id: row.id, revision: Number(row.revision), createdAt: String(row.created_at), authoredBy: row.authored_by === 'user' ? 'user' as const : 'assistant' as const };
}

/** Reads only approved draft payloads, after SQL identity/source/fence filtering. */
export function readReleaseArtifacts(repo: KernelRepository, policy: PolicyKernel, scope: ScopeHandle, sessionId: string, id?: string): ReleaseArtifact[] {
  const allowed = policy.validate(scope);
  if (!allowed.sources.includes('history:self') || !allowed.grants.includes('evidence:read') || allowed.audience !== 'self' || allowed.subjectId !== allowed.principalId || allowed.worldId !== 'real') return [];
  const rows = repo.db.prepare(`WITH heads AS (
    SELECT json_extract(j.value,'$.id') AS id,MAX(json_extract(j.value,'$.revision')) AS revision
    FROM messages m,json_each(m.payload,'$.releaseArtifacts') j
    WHERE m.session_id=? AND m.role='assistant' AND json_extract(m.payload,'$.status')='done' GROUP BY json_extract(j.value,'$.id')
  ), eligible AS (
    SELECT j.value, m.rowid AS message_order,json_extract(m.payload,'$.contextReceipt') AS original_versions,
      ROW_NUMBER() OVER(PARTITION BY json_extract(j.value,'$.id') ORDER BY json_extract(j.value,'$.revision') DESC,m.rowid DESC) AS version_rank
    FROM messages m,json_each(m.payload,'$.releaseArtifacts') j
    JOIN heads head ON head.id=json_extract(j.value,'$.id') AND head.revision=json_extract(j.value,'$.revision')
    JOIN h_evidence origin ON origin.id=json_extract(j.value,'$.sourceMessageId')
    WHERE m.session_id=? AND m.role='assistant' AND json_extract(m.payload,'$.status')='done'
      AND origin.owner=? AND origin.workspace=? AND origin.status='active'
      AND json_extract(j.value,'$.privacyEpoch')=?
      AND (json_extract(j.value,'$.ownerId') IS NULL OR json_extract(j.value,'$.ownerId')=?)
      AND (json_extract(j.value,'$.workspaceId') IS NULL OR json_extract(j.value,'$.workspaceId')=?)
      AND NOT EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(j.value,'$.sourceIds'),json_extract(m.payload,'$.contextReceipt.providedSourceIds'),'["history:self"]')) src WHERE src.value NOT IN (SELECT value FROM json_each(?)))
      ${id ? "AND json_extract(j.value,'$.id')=?" : ''}
  ) SELECT value,original_versions FROM eligible WHERE version_rank=1 ORDER BY message_order DESC ${id ? '' : 'LIMIT 12'}`).all(sessionId, sessionId, allowed.principalId, allowed.workspaceId, allowed.privacyEpoch, allowed.principalId, allowed.workspaceId, JSON.stringify(allowed.sources), ...(id ? [id] : []));
  const artifacts = rows.map(row => originalSourceVersions(JSON.parse(String(row.value)) as ReleaseArtifact, row.original_versions))
    .filter(artifact => releaseArtifactCurrent(repo, policy, scope, artifact));
  for (const artifact of artifacts) repo.access.push({ principalId: allowed.principalId, scopeId: scope.id, purposes: allowed.purposes, source: 'history:self', objectId: artifact.id, kind: 'release_artifact' });
  return artifacts;
}

/** Legacy outward-only messages have no draft version; never treat owner prose as an old draft. */
export function readLegacyRelease(repo: KernelRepository, policy: PolicyKernel, scope: ScopeHandle, sessionId: string) {
  const allowed = policy.validate(scope);
  if (!allowed.sources.includes('history:self') || !allowed.grants.includes('evidence:read') || allowed.audience !== 'self' || allowed.subjectId !== allowed.principalId || allowed.worldId !== 'real') return;
  const row = repo.db.prepare(`SELECT m.id,m.content,json_extract(m.payload,'$.scopeSummary.release') AS brief,
      json_extract(m.payload,'$.contextReceipt') AS receipt FROM messages m
    WHERE m.session_id=? AND m.role='assistant' AND json_extract(m.payload,'$.status')='done'
      AND json_type(m.payload,'$.releaseArtifacts') IS NULL
      AND json_type(m.payload,'$.scopeSummary.release')='object' AND json_extract(m.payload,'$.scopeSummary.audience') IN ('group','public')
      AND m.rowid=(SELECT latest.rowid FROM messages latest WHERE latest.session_id=m.session_id AND latest.role='assistant'
        AND json_extract(latest.payload,'$.status')='done' AND (
          json_array_length(latest.payload,'$.releaseArtifacts')>0 OR
          json_type(latest.payload,'$.scopeSummary.release')='object' AND json_extract(latest.payload,'$.scopeSummary.audience') IN ('group','public'))
        ORDER BY latest.created_at DESC,latest.rowid DESC LIMIT 1)
      AND json_extract(m.payload,'$.contextReceipt.privacyEpoch')=?
      AND EXISTS(SELECT 1 FROM messages u JOIN h_evidence e ON e.id=u.id WHERE u.session_id=m.session_id AND e.owner=? AND e.workspace=?)
      AND NOT EXISTS(SELECT 1 FROM messages u JOIN h_evidence e ON e.id=u.id WHERE u.session_id=m.session_id AND (e.owner!=? OR e.workspace!=?))
      AND NOT EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(m.payload,'$.contextReceipt.providedSourceIds'),'[]')) src WHERE src.value NOT IN (SELECT value FROM json_each(?)))
    ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1`).get(sessionId, allowed.privacyEpoch, allowed.principalId, allowed.workspaceId, allowed.principalId, allowed.workspaceId, JSON.stringify(allowed.sources));
  if (!row) return;
  const receipt = row.receipt ? JSON.parse(String(row.receipt)) : undefined;
  const sourceMessageIds = Array.isArray(receipt?.providedEvidenceIds) ? receipt.providedEvidenceIds : [];
  if (!sourceMessageIds.length) return;
  const sourceMessageVersions = Array.isArray(receipt?.providedObjectVersions) ? receipt.providedObjectVersions
    .filter((ref: any) => ref.kind === 'evidence' && sourceMessageIds.includes(ref.id)).map((ref: any) => ({ id: ref.id, revision: ref.revision })) : [];
  const basedOnObjects = Array.isArray(receipt?.providedObjectVersions) ? receipt.providedObjectVersions
    .filter((ref: any) => ['work', 'agenda', 'assertion', 'evidence'].includes(ref.kind)) : [];
  if (!releaseBasisCurrent(repo, policy, scope, { privacyEpoch: allowed.privacyEpoch, sourceMessageId: sourceMessageIds[0],
    sourceMessageIds, sourceMessageVersions, sourceIds: receipt.providedSourceIds, sourceReceipts: [receipt], basedOnObjects })) return;
  repo.access.push({ principalId: allowed.principalId, scopeId: scope.id, purposes: allowed.purposes, source: 'history:self', objectId: String(row.id), kind: 'legacy_release' });
  return { id: String(row.id), text: String(row.content), brief: JSON.parse(String(row.brief)) as { recipient: string; [key: string]: unknown },
    sourceMessageIds: sourceMessageIds as string[], sourceMessageVersions: sourceMessageVersions as { id: string; revision: number }[],
    sourceIds: receipt.providedSourceIds as string[], sourceReceipts: [receipt] as NonNullable<ReleaseArtifact['sourceReceipts']>,
    basedOnObjects: basedOnObjects as NonNullable<ReleaseArtifact['basedOnObjects']> };
}
