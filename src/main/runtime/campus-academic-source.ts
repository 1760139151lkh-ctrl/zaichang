import { createHash } from 'node:crypto';
import { campusSensitiveReadSchema, type CampusSensitiveRead } from '../../shared/campus-academic';
import { HarnessError, type EvidenceEvent, type ScopeHandle } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from './policy';
import { canonical } from './semantics';

export function campusSensitiveResource(capability: string, raw: unknown): CampusSensitiveRead['resource'] | undefined {
  if (!['campus.lookup', 'campus.imported_lookup', 'campus.query'].includes(capability) || !raw || typeof raw !== 'object') return;
  const input = raw as { operation?: string; domain?: string; resource?: string; spec?: { resource?: string } };
  if (capability === 'campus.query' && ['resources', 'schema'].includes(input.operation || '')) return;
  const resource = capability === 'campus.query' ? input.resource || input.spec?.resource : input.domain;
  return resource === 'gpa' ? 'gpa_overall' : ['grades', 'retakes', 'gpa_overall', 'gpa_semesters', 'gpa_cumulative'].includes(resource || '')
    ? resource as CampusSensitiveRead['resource'] : undefined;
}
export function campusSensitiveResources(capability: string, raw: unknown): CampusSensitiveRead['resource'][] {
  const first = campusSensitiveResource(capability, raw), input = raw as { spec?: { resources?: string[]; join?: { resource?: string } } } | undefined;
  const more = capability === 'campus.query' ? [...(input?.spec?.resources || []), ...(input?.spec?.join?.resource ? [input.spec.join.resource] : [])]
    .flatMap(resource => campusSensitiveResource('campus.query', { operation: 'select', resource }) || []) : [];
  return [...new Set([...(first ? [first] : []), ...more])];
}
export const campusSensitiveGrant = (resource: CampusSensitiveRead['resource']): CampusSensitiveRead['grant'] =>
  resource === 'grades' || resource === 'retakes' ? 'campus:grades:read' : 'campus:gpa:read';

/** Records an actual, bounded purpose admission. These process-local handles
 * do not alter the main contract or the user's configured grants. */
export class CampusAcademicSourceService {
  private approved = new Map<string, Set<string>>();
  constructor(readonly repo: KernelRepository, readonly policy: PolicyKernel) {
    repo.verifyCampusSensitiveReads = (handle, reads, localDisplay = false) => this.readable(handle, reads, localDisplay);
    policy.onBarrier(() => this.approved.clear());
  }
  authorizeScope(handle: ScopeHandle, grants: readonly string[]) {
    this.policy.validate(handle);
    for (const grant of grants) this.policy.require(handle, grant);
    this.approved.set(handle.id, new Set(grants));
    while (this.approved.size > 128) this.approved.delete(this.approved.keys().next().value!);
  }
  scopeAuthorized(handle: ScopeHandle, grant: string) {
    try { return this.approved.get(handle.id)?.has(grant) === true && this.policy.can(handle, grant); }
    catch (error) { if (error instanceof HarnessError) return false; throw error; }
  }
  stamp(parent: ScopeHandle, readScope: ScopeHandle, resource: CampusSensitiveRead['resource'], sourceId: string,
    data: unknown, events: readonly EvidenceEvent[]): CampusSensitiveRead {
    const scope = this.policy.validate(parent), grant = campusSensitiveGrant(resource);
    if (!this.scopeAuthorized(readScope, grant)) throw new HarnessError('campus_purpose_required', '这次成绩读取尚未核清具体用途。');
    const event = events.find(event => scope.currentEventIds.includes(event.id) && event.speaker === 'user'
      && event.authority === 'user_statement' && !event.parentEventId);
    if (!event) throw new HarnessError('campus_purpose_source', '这次成绩用途缺少本轮本人请求，未保留跨轮读取许可。');
    return campusSensitiveReadSchema.parse({ grant, resource, sourceId,
      sourceVersion: createHash('sha256').update(canonical(data)).digest('hex'), authorizationEventId: event.id,
      authorizationContentVersion: event.contentVersion, privacyEpoch: scope.privacyEpoch, policyRevision: scope.policyRevision,
      sourceBoundary: this.policy.sourceBoundary });
  }
  readable(handle: ScopeHandle, raw: unknown, localDisplay = false): boolean {
    if (!Array.isArray(raw) || raw.length > 64) return false;
    const scope = this.policy.validate(handle);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self') return raw.length === 0;
    return raw.every(value => {
      const parsed = campusSensitiveReadSchema.safeParse(value); if (!parsed.success) return false;
      const read = parsed.data;
      if (!scope.sources.includes(read.sourceId) || this.policy.revoked().includes(read.grant) || !this.policy.can(handle, 'campus:read')) return false;
      const currentPurpose = scope.currentEventIds.includes(read.authorizationEventId) && read.privacyEpoch === scope.privacyEpoch
        && read.policyRevision === scope.policyRevision && read.sourceBoundary === this.policy.sourceBoundary;
      // A private local rendering of an original retained answer is separate
      // from sending that answer into a new model context.
      const original = this.repo.db.prepare(`SELECT json_extract(payload,'$.contentVersion') AS version FROM h_evidence
        WHERE id=? AND owner=? AND workspace=? AND subject=? AND world='real' AND status='active' AND json_extract(payload,'$.speaker')='user'`)
        .get(read.authorizationEventId, scope.principalId, scope.workspaceId, scope.principalId);
      if (this.repo.hasFence(read.authorizationEventId) || original && original.version !== read.authorizationContentVersion) return false;
      if (currentPurpose) return !!original || scope.retention === 'session_only';
      return !!original && localDisplay;
    });
  }
}
