import { HarnessError, type EvidenceEvent, type ScopeHandle } from '../../shared/harness';
import { ZodError } from 'zod';
import type { RuntimeCoordinator } from './coordinator';
import type { IngressDecision, InputControls } from './policy';
import type { TurnControlInteractionContext } from './turn-controls';
import { mapStoryReferenceIdentity } from './story-setting';
import { programReferenceIdentity } from './interactive-program-sources';
import { NativeSourceBookmarkService } from './source-bookmark-native';
import { workspaceContextSchema, type WorkspaceTarget } from '../../shared/workspace-context';
import { workspaceInputControls } from './workspace-context';
import { canonical } from './semantics';

type Runtime = Pick<RuntimeCoordinator, 'repo' | 'policy' | 'store' | 'context' | 'broker' | 'companionSessions' | 'curiosityInvitations' | 'studyCompanion' | 'reflectiveLetters' | 'rehearsals' | 'notePresentation' | 'materials' | 'presentation' | 'nativeAgenda' | 'spatial' | 'scenes'>;

/** Body-free context for the existing pre-storage control parser. A selected
 * address is re-read through its current owner using read-only permissions.
 * This is not an ingress scope, evidence receipt, read-purpose approval or a
 * promise that the same object will remain available after admission. */
export function interactionContextForControls(runtime: Runtime, controls: InputControls, sessionId: string,
  materialDocument?: Extract<WorkspaceTarget, { kind: 'material' }>['reference']): TurnControlInteractionContext | undefined {
  if (controls.transmission === 'local_only' || controls.audience && controls.audience !== 'self'
    || controls.memoryMode === 'current_sources_only' || controls.subjectId && controls.subjectId !== runtime.repo.identity.principalId
    || controls.worldId && controls.worldId !== 'real') return;
  if (controls.workspaceContext) {
    const parsed = workspaceContextSchema.safeParse(controls.workspaceContext);
    if (!parsed.success) return;
    const objects = parsed.data.objects.flatMap(object => {
      const identity = interactionContextForControls(runtime, workspaceInputControls(controls, object.target), sessionId,
        object.target.kind === 'material' ? object.target.reference : undefined);
      return identity ? [{ slot: object.slot, activity: identity.activity, contentIdentity: identity.contentIdentity, focus: identity.focus }] : [];
    });
    if (!objects.length) return;
    const same = objects.every(object => object.activity === objects[0].activity && object.contentIdentity === objects[0].contentIdentity);
    return { activity: same ? objects[0].activity : 'discussion', contentIdentity: same ? objects[0].contentIdentity : 'mixed',
      focus: objects.length === 1 ? objects[0].focus : 'shared_object', objects,
      ...(objects.length === 2 && parsed.data.relation ? { relation: parsed.data.relation } : {}) };
  }
  if (!materialDocument && !controls.curiosityReference && !controls.companionReference && !controls.studyInteraction && !controls.letterReference && !controls.rehearsalInteraction && !controls.noteReference && !controls.noteQuote && !controls.preparationReference && !controls.notebookQuote && !controls.mapRouteReference && !controls.agendaFocus && !controls.materialQuote && !controls.conversationQuote && !controls.programReference && !controls.selection) return;
  const baseline = runtime.policy.hostScope(), host = runtime.policy.validate(baseline);
  let sources = [...host.sources];
  if (controls.sources) sources = sources.filter(source => controls.sources!.includes(source));
  if (controls.memoryMode === 'none' || !runtime.store.settings().memoryEnabled && !controls.memoryMode)
    sources = sources.filter(source => source !== 'history:self' && source !== 'profile:self');
  if (!materialDocument && !controls.materialQuote && (controls.agendaFocus ? !sources.includes('local-agenda')
    : controls.mapRouteReference ? !sources.includes('map:local')
    : controls.noteReference || controls.noteQuote || controls.notebookQuote ? !sources.includes('notes:self')
    : controls.programReference || controls.conversationQuote ? !sources.includes('history:self') : !sources.includes('work:self'))) return;
  const handle = runtime.policy.hostScope({ sources, purposes: [controls.purpose || 'personal_assistance'], infer: false,
    grants: host.grants.filter(grant => grant === 'evidence:read' || (controls.programReference || controls.preparationReference) && grant.endsWith(':read')
      || (!!controls.selection || !!controls.mapRouteReference) && grant === 'map:read'), currentEventIds: [] });
  try {
    if (materialDocument) {
      runtime.materials.workspaceIdentity(handle, materialDocument);
      runtime.policy.validate(handle);
      return { activity: 'material_reading', contentIdentity: 'external_document', focus: 'source_object' };
    }
    if (controls.conversationQuote) {
      new NativeSourceBookmarkService(runtime.store).conversationQuote(handle, controls.conversationQuote);
      runtime.policy.validate(handle);
      return { activity: 'message_reading', contentIdentity: 'retained_user_message', focus: 'sentence_or_passage' };
    }
    if (controls.noteQuote) {
      runtime.store.notes.quoteIdentity(handle, controls.noteQuote);
      runtime.policy.validate(handle);
      return { activity: 'note_reading', contentIdentity: 'user_note', focus: 'sentence_or_passage' };
    }
    if (controls.mapRouteReference) {
      runtime.spatial.sharedRoute(handle, controls.mapRouteReference);
      runtime.policy.validate(handle);
      return { activity: 'planning', contentIdentity: 'source_bound_work', focus: 'source_object' };
    }
    if (controls.agendaFocus) {
      runtime.nativeAgenda.resolveReference(handle, controls.agendaFocus);
      runtime.policy.validate(handle);
      return { activity: 'planning', contentIdentity: 'source_bound_work', focus: 'source_object' };
    }
    if (controls.notebookQuote) {
      runtime.notePresentation.notebookQuoteIdentity(handle, controls.notebookQuote);
      runtime.policy.validate(handle);
      return { activity: 'note_reading', contentIdentity: 'user_note', focus: 'sentence_or_passage' };
    }
    if (controls.materialQuote) {
      runtime.materials.quoteIdentity(handle, controls.materialQuote);
      runtime.policy.validate(handle);
      return { activity: 'material_reading', contentIdentity: 'external_document', focus: 'sentence_or_passage' };
    }
    if (controls.preparationReference) {
      runtime.presentation.preparationIdentity(handle, controls.preparationReference);
      runtime.policy.validate(handle);
      return { activity: 'prepared_help', contentIdentity: 'source_bound_work', focus: 'source_object' };
    }
    if (controls.programReference) {
      if (!programReferenceIdentity(runtime, handle, { messageId: controls.programReference.messageId,
        programId: controls.programReference.programId, revision: controls.programReference.revision }, sessionId)) return;
      runtime.policy.validate(handle);
      return { activity: 'interactive_program', contentIdentity: 'interactive_work', focus: 'source_object' };
    }
    if (controls.noteReference) {
      runtime.notePresentation.referenceIdentity(handle, controls.noteReference, sessionId);
      runtime.policy.validate(handle);
      return { activity: 'note_reading', contentIdentity: 'user_note', focus: controls.noteReference.intent === 'continue_reading' ? 'shared_object' : 'sentence_or_passage' };
    }
    if (controls.rehearsalInteraction) {
      runtime.rehearsals.referenceIdentity(handle, sessionId, controls.rehearsalInteraction);
      runtime.policy.validate(handle);
      return { activity: 'relationship_rehearsal', contentIdentity: 'simulation', focus: 'shared_object' };
    }
    if (controls.letterReference) {
      runtime.reflectiveLetters.referenceIdentity(handle, controls.letterReference, sessionId);
      runtime.policy.validate(handle);
      return { activity: 'reflective_letter', contentIdentity: 'assistant_interpretation', focus: 'sentence_or_passage' };
    }
    if (controls.curiosityReference) {
      const { origin } = runtime.curiosityInvitations.referenceIdentity(handle, controls.curiosityReference,
        { sessionId, allowCrossSession: false });
      runtime.policy.validate(handle);
      return { activity: origin === 'created' ? 'shared_creation' : 'shared_exploration',
        contentIdentity: origin === 'created' ? 'creation' : origin === 'public' ? 'public_reference' : 'mixed',
        focus: controls.curiosityReference.focus ? 'sentence_or_passage' : 'shared_object' };
    }
    if (controls.companionReference) {
      runtime.companionSessions.referenceIdentity(handle, controls.companionReference, { sessionId });
      runtime.policy.validate(handle);
      return { activity: 'co_work', contentIdentity: 'source_bound_work',
        focus: controls.companionReference.target ? 'source_object' : 'shared_object' };
    }
    if (controls.studyInteraction) {
      const ref = controls.studyInteraction.focus;
      runtime.studyCompanion.referenceIdentity(handle, ref.studyId, ref.studyRevision, { restrictToSessionId: sessionId });
      runtime.policy.validate(handle);
      return { activity: 'study', contentIdentity: 'source_bound_work', focus: 'line_or_step' };
    }
    if (controls.selection && mapStoryReferenceIdentity(runtime, handle, sessionId, controls.selection)) {
      runtime.policy.validate(handle);
      return { activity: 'shared_creation', contentIdentity: 'creation', focus: 'source_object' };
    }
    if (controls.selection && runtime.scenes.artworkReferenceIdentity(handle, sessionId, controls.selection))
      return { activity: 'shared_creation', contentIdentity: 'creation', focus: 'source_object' };
  } catch (error) {
    // A stale or no-longer-readable address supplies no context. The normal
    // parser still handles the entire new utterance and its explicit limits.
    if (!(error instanceof HarnessError) && !(error instanceof ZodError)) throw error;
  }
}

/** Recheck after the new utterance's controls have been applied. The event
 * keeps this body-free origin through extraction/recovery; a UI address alone
 * never grants old content or changes the whole event's inference label. */
export function creationSourceContextForIngress(runtime: Runtime, controls: InputControls, sessionId: string,
  ingress: Pick<IngressDecision, 'contract' | 'localOnly'>): EvidenceEvent['sourceContext'] | undefined {
  if (controls.workspaceContext) {
    const parsed = workspaceContextSchema.safeParse(controls.workspaceContext);
    if (!parsed.success || ingress.localOnly) return;
    const contexts = parsed.data.objects.flatMap(object => {
      const focused = workspaceInputControls(controls, object.target);
      if (focused.rehearsalInteraction) {
        try {
          runtime.rehearsals.referenceIdentity(ingress.contract.scope, sessionId, focused.rehearsalInteraction);
          const ref = focused.rehearsalInteraction.ref;
          return [{ kind: 'relationship_rehearsal' as const, origin: 'user_interface_reference' as const,
            artifactId: ref.id, artifactRevision: ref.revision, matterId: ref.matterId, activeTurnId: ref.activeTurnId,
            inputKind: 'reference' as const }];
        } catch (error) { if (!(error instanceof HarnessError || error instanceof ZodError)) throw error; return []; }
      }
      const context = creationSourceContextForIngress(runtime, focused, sessionId, ingress);
      return context ? [context] : [];
    });
    // One event can retain one exact origin. Distinct A/B origins stay in the
    // control context and currentWorkspace rather than borrowing either ID.
    return contexts.length === parsed.data.objects.length && contexts.every(context => canonical(context) === canonical(contexts[0]))
      ? contexts[0] : undefined;
  }
  if (ingress.localOnly || controls.preparationReference || controls.noteQuote || controls.rehearsalInteraction || controls.letterReference || controls.noteReference || controls.notebookQuote || controls.mapRouteReference || controls.agendaFocus || controls.materialQuote) return;
  const handle: ScopeHandle = ingress.contract.scope, scope = runtime.policy.validate(handle);
  if (scope.child || scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
    || !runtime.policy.can(handle, 'evidence:read')) return;
  try {
    if (controls.programReference) {
      const ref = controls.programReference;
      if (!programReferenceIdentity(runtime, handle, { messageId: ref.messageId, programId: ref.programId,
        revision: ref.revision }, sessionId)) return;
      runtime.policy.validate(handle);
      return { kind: 'interactive_program', origin: 'user_interface_reference', messageId: ref.messageId,
        programId: ref.programId, revision: ref.revision, nodeId: ref.nodeId };
    }
    if (!scope.sources.includes('work:self')) return;
    const frame = controls.selection ? runtime.scenes.artworkReferenceIdentity(handle, sessionId, controls.selection) : undefined;
    if (frame) return { kind: 'shared_creation', origin: 'user_interface_reference', ...frame };
    const direct = controls.curiosityReference;
    const mapped = !direct && controls.selection ? mapStoryReferenceIdentity(runtime, handle, sessionId, controls.selection) : undefined;
    const work = direct || mapped?.work;
    if (!work) return;
    if (direct && runtime.curiosityInvitations.referenceIdentity(handle, direct,
      { sessionId, allowCrossSession: false }).origin !== 'created') return;
    runtime.policy.validate(handle);
    return { kind: 'shared_creation', origin: 'user_interface_reference', artifactId: work.id, artifactRevision: work.revision,
      matterId: work.matterId, matterRevision: work.matterRevision,
      referenceKind: mapped ? controls.selection?.kind === 'leg' ? 'map_leg' : 'map_place' : 'work',
      ...(work.chapter ? { chapter: { ...work.chapter } } : {}) };
  } catch (error) {
    // Losing the old pointer must not reject the user's new sentence. Formal
    // compile can ask for current context without resurrecting old prose.
    if (!(error instanceof HarnessError) && !(error instanceof ZodError)) throw error;
  }
}
