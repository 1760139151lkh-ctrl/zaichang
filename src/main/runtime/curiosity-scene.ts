import { randomUUID } from 'node:crypto';
import { HarnessError, type ScopeHandle, type WorkSourceRef } from '../../shared/harness';
import { curiosityPresentationInput, curiosityViewSchema, type CuriosityScene } from '../../shared/curiosity-scene';
import type { z } from 'zod';
import type { RuntimeCoordinator, RunSession } from './coordinator';
import type { CuriosityContext, CuriosityInvitationService } from './curiosity-invitation';
import { canonical, codePointSlice } from './semantics';

type Host = Pick<RuntimeCoordinator, 'repo' | 'policy'> & { curiosityInvitations: CuriosityInvitationService };

export function curiosityContextForRun(host: Host, session: RunSession): CuriosityContext {
  const handle = session.ingress.contract.scope;
  return { sessionId: session.sessionId, events: session.events, ephemeral: session.ephemeral,
    allowCrossSession: session.ingress.contract.memoryMode === 'relevant',
    observations: session.observations || [], deliveredObservationIds: session.deliveredObservationIds || new Set(),
    permits: (ref: WorkSourceRef) => {
      const view = session.attentionEvidenceViews?.[ref.eventId];
      if (!view) return true;
      const event = host.repo.evidence(handle, ref.eventId) || session.events.find(value => value.id === ref.eventId);
      return !!event && event.contentVersion === ref.contentVersion && view.contentVersion === ref.contentVersion
        && view.sourceStart <= ref.start && view.sourceEnd >= ref.end
        && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
    } };
}

/** The caller admits the final presentation budget and records the returned
 * sources once. This factory neither publishes a scene nor writes another owner. */
export function createCuriosityPresentation(host: Host, session: RunSession,
  raw: z.infer<typeof curiosityPresentationInput>, signal: AbortSignal) {
  signal.throwIfAborted();
  const input = curiosityPresentationInput.parse(raw), handle = session.ingress.contract.scope;
  const scope = host.policy.require(handle, 'evidence:read');
  if (session.background || scope.child || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
    || scope.audience !== 'self' || !scope.sources.includes('work:self'))
    throw new HarnessError('curiosity_presentation', '这份小体验在当前本人的交流里展开，不从后台另发一份。');
  const read = host.curiosityInvitations.read(handle, curiosityContextForRun(host, session), input.id);
  if (read.value.status !== 'available')
    throw new HarnessError('curiosity_public_refresh', '这份发现的原资料还没在本轮重新读到；先回原地址，或直接一起玩一个不含未核事实的创作。', 'read');
  const view = curiosityViewSchema.parse(read.value.curiosity);
  if (view.revision !== input.expectedRevision || view.matterRevision !== input.expectedMatterRevision)
    throw new HarnessError('curiosity_changed', '这段体验已经往前走了，先接上现在的这一段。');
  const refs = [...new Map(read.records.flatMap(record => record.sourceBinding?.refs || [])
    .map(ref => [canonical(ref), ref])).values()];
  const binding = host.repo.resolveWorkSourceBinding(handle, refs), now = host.repo.clock.now();
  const scene: CuriosityScene = { kind: 'curiosity', id: randomUUID(), revision: 1,
    sessionId: session.sceneSessionId || session.sessionId, createdAt: now,
    source: { sourceId: 'work:self', fetchedAt: now, version: `${view.matterRevision}:${view.revision}` },
    view, provenance: { sourceBinding: binding, ...(read.assistantWorkSources?.length ? { assistantWorkSources: read.assistantWorkSources } : {}) } };
  signal.throwIfAborted(); host.policy.validate(handle);
  return { scene, records: read.records, bindings: [binding, ...read.bindings], assistantWorkSources: read.assistantWorkSources || [] };
}

/** Generic history may show a legal creation, but cannot refresh a public
 * discovery from its cached body. Public/mixed scenes require the actual run's
 * delivered research.read observations again, including at parent adoption. */
export function assertCuriositySceneReadable(host: Host, handle: ScopeHandle, scene: CuriosityScene,
  context?: CuriosityContext) {
  assertCuriositySnapshotSourcesReadable(host, handle, scene);
  if (scene.view.origin === 'created' && scene.view.status === 'historical' && !scene.view.choices.length) {
    // A source-legal old work is not the current option state. Later turns can
    // add private conditions; reading the past piece need not read those too.
    return curiosityViewSchema.parse(scene.view);
  }
  if (scene.view.origin !== 'created' && !context)
    throw new HarnessError('curiosity_public_refresh', '这份公开发现要先在当前交流回读，旧画面没有冒充现在的新资料。');
  const current = host.curiosityInvitations.read(handle, context || { sessionId: scene.sessionId, events: [], ephemeral: false,
    observations: [], deliveredObservationIds: new Set() }, scene.view.id);
  if (current.value.status !== 'available')
    throw new HarnessError('curiosity_public_refresh', '先展开当前公开来源，再继续这份发现。');
  const view = curiosityViewSchema.parse(current.value.curiosity);
  // A newly read public source may have a different actual read time/call ID.
  // That is a new projection, not permission to rewrite this picture in place.
  if (canonical(view) !== canonical(scene.view))
    throw new HarnessError('curiosity_changed', '这段体验或它的当前来源已经变化，重新展开现在的内容。');
  const refs = [...new Map(current.records.flatMap(record => record.sourceBinding?.refs || [])
    .map(ref => [canonical(ref), ref])).values()];
  if (canonical(host.repo.resolveWorkSourceBinding(handle, refs)) !== canonical(scene.provenance.sourceBinding))
    throw new HarnessError('curiosity_source_changed', '这段体验的依据已经变化，先沿当前原话接着聊。');
  return view;
}

/** Displaying an already-authored snapshot is distinct from adopting public
 * facts in a new run. Only the live host path can use this weaker source check. */
export function assertCuriositySnapshotSourcesReadable(host: Pick<Host, 'repo' | 'policy'>, handle: ScopeHandle, scene: CuriosityScene) {
  const scope = host.policy.require(handle, 'evidence:read');
  if (scope.child || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
    || !scope.sources.includes('work:self')) throw new HarnessError('curiosity_scope', '这份作品还不在当前本人的可读交流里。');
  if (scene.kind !== 'curiosity' || scene.source.sourceId !== 'work:self'
    || !host.repo.workBindingsReadable(handle, [scene.provenance.sourceBinding])
    || !host.repo.assistantWorkSourcesReadable(handle, scene.provenance.assistantWorkSources || []))
    throw new HarnessError('curiosity_source_changed', '这段体验的一处来由已经变化，没有从画面副本带回正文。');
  return curiosityViewSchema.parse(scene.view);
}
