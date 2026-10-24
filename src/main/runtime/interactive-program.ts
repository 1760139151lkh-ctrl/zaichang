import { randomUUID } from 'node:crypto';
import { HarnessError } from '../../shared/harness';
import { PROGRAM_LIBRARY_VERSION, interactiveProgramInputSchema, type InteractiveProgramInput, type InteractiveProgramDraft,
  type ProgramStateValues } from '../../shared/interactive-program';
import type { PresentationView, SceneSnapshot } from '../../shared/scenes';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import { compileInteractiveProgram } from './interactive-program-compiler';
import { bindProgramSceneSources, inheritPreviousProgramSources, inheritPreviousProgramData, lookupPreviousProgram, resolveProgramBindings,
  type ProgramSourceAdmission } from './interactive-program-sources';
import { editedProgramStates, mergeProgramSource, sourceSlotReferences } from './interactive-program-edit';

type ProgramHost = Parameters<typeof resolveProgramBindings>[0] & Pick<RuntimeCoordinator, 'scenes' | 'assertPresenceCreation' | 'campusSceneSources'>;
export interface InteractiveProgramPresentation {
  view: PresentationView;
  admission: ProgramSourceAdmission;
  edit?: { mode: 'statement_patch'; stateOrigin: string; explicitInputFields: number };
}

/** Purpose review needs the proposed source boundary, not another reading of
 * authored arithmetic/layout or local values. Only the caller's already
 * source-qualified current reference may supply a formal Message identity. */
export function projectInteractiveProgramReadPurpose(request: unknown,
  currentProgramReference?: unknown, providedProgramReference?: { source: { messageId: string; programId: string; revision: number }; origin: 'delivered_this_run' | 'published_this_run' }) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return request;
  const envelope = request as Record<string, unknown>, raw = envelope.arguments;
  if (envelope.tool !== 'present_view' || !raw || typeof raw !== 'object' || Array.isArray(raw)) return request;
  const args = raw as Record<string, unknown>;
  if (args.program === undefined) return request;
  const input = interactiveProgramInputSchema.parse(args.program);
  const kinds = { number: 0, boolean: 0, text: 0, choice: 0, sequence: 0 };
  const fields = 'patch' in input ? input.stateChanges || {} : input.states;
  for (const state of Object.values(fields)) if (state) kinds[state.kind]++;
  const formal = currentProgramReference as { messageId?: unknown; programId?: unknown; revision?: unknown } | undefined;
  const source = formal && typeof formal.messageId === 'string' && typeof formal.programId === 'string'
    && Number.isSafeInteger(formal.revision) && Number(formal.revision) > 0
    ? { messageId: formal.messageId, programId: formal.programId, revision: Number(formal.revision) } : undefined;
  const matched = input.previous && source && input.previous.id === source.programId
    && input.previous.expectedRevision === source.revision;
  const provided = providedProgramReference?.source;
  const readMatched = input.previous && provided && input.previous.id === provided.programId
    && input.previous.expectedRevision === provided.revision;
  return { ...envelope, arguments: { ...args, program: {
    libraryVersion: input.libraryVersion, operation: input.previous ? 'revise' : 'create',
    ...(input.previous ? { previous: { ...input.previous, formalIdentity: matched
      ? { status: 'matches_current_admitted_reference', source }
      : { status: source ? 'not_matched_to_current_formal_reference' : 'no_current_formal_reference' },
      ...(readMatched ? { providedIdentity: { status: 'matches_provided_reference', origin: providedProgramReference!.origin, source: provided } } : {}) } } : {}),
    bindings: (input.bindings || []).map(({ alias, observationId, path }) => ({ alias, observationId, path: [...path] })),
    localFields: { count: Object.keys(fields).length, kinds, ...('patch' in input
      ? { mode: 'explicit_changes', removed: Object.values(fields).filter(value => value === null).length } : {}) },
    sourceSlotBoundary: 'patch' in input ? 'arguments.sceneRefs plus exact previous surviving SourceSlots after original owner revalidation' : 'arguments.sceneRefs',
    ...('patch' in input ? { editMode: 'statement_patch', explicitInputFields: Object.keys(input.inputChanges || {}).length,
      inheritance: 'original exact previous source closure; no new permission or new read acknowledgement' } : {}),
    meaning: '这里是在准备一件放进回复的作品，或接着修改原作。下面列的是想引用的资料地址，正文是否读到还要看实际读取；能放进作品的原画面也只在所列范围内。可以结合对方这次的原话、当前指着的作品，以及这轮真正读回的原作来理解用途；没有界面引用时，仍可沿已读原作认清是否同一件。应用接着会核对资料能否使用、原作版本和作品写法。',
  } } };
}

/** Compose a new revision in the ordinary assistant Message owner. No write,
 * source receipt or publication is committed until the caller admits it. */
export function createInteractiveProgramPresentation(host: ProgramHost, session: RunSession, raw: InteractiveProgramInput,
  scenes: SceneSnapshot[], signal: AbortSignal,
  sourceSupplement?: Parameters<typeof bindProgramSceneSources>[2]): InteractiveProgramPresentation {
  signal.throwIfAborted();
  const scope = host.policy.validate(session.ingress.contract.scope);
  if (scope.child || session.background && !session.presence || scope.audience !== 'self')
    throw new HarnessError('presentation_owner', '由当前主助手把交互内容接到这段交流里。');
  if (session.background) host.assertPresenceCreation(session);
  if (!session.outputMessageId) throw new HarnessError('interactive_program_owner', '这份交互尚未接到当前真实回复。');
  const input = interactiveProgramInputSchema.parse(raw);
  if (session.background && input.previous)
    throw new HarnessError('presence_creation_scope', '这次只准备新的作品，不在后台改动或恢复旧作。');
  const previous = input.previous ? lookupPreviousProgram(host, session, input.previous, signal) : undefined;
  if (previous && previous.view.revision >= Number.MAX_SAFE_INTEGER)
    throw new HarnessError('interactive_program_revision', '这份交互的修订范围已用完，请另开一份内容。');
  const admission = resolveProgramBindings(host, session, input.bindings || [], signal);
  if (previous) inheritPreviousProgramSources(admission, previous, session);
  let draft: InteractiveProgramDraft, edit: InteractiveProgramPresentation['edit'], initialInputs: ProgramStateValues | undefined,
    initialInputFields: string[] | undefined;
  if ('patch' in input) {
    if (!previous) throw new HarnessError('interactive_program_patch', '局部续改需要同一原作品的精确previous。');
    const dsl = mergeProgramSource(previous.program.sourceDsl, input.patch);
    const state = editedProgramStates(previous.program, input, session, previous.source);
    initialInputs = state.initialInputs;
    initialInputFields = state.initialInputFields;
    draft = { libraryVersion: input.libraryVersion, previous: input.previous, dsl, states: state.states, bindings: input.bindings || [] };
    inheritPreviousProgramData(admission, previous, session);
    const surviving = sourceSlotReferences(dsl), currentRefs = new Set(scenes.map(scene => `${scene.id}@${scene.revision}`));
    for (const ref of surviving) {
      if (currentRefs.has(ref)) continue;
      const allowed = previous.program.sourceSlots?.includes(ref)
        && previous.view.sceneRefs.find(scene => `${scene.id}@${scene.revision}` === ref);
      if (!allowed) throw new HarnessError('interactive_program_source_slot', '新增原画面先从本轮真实sceneRefs取得，不能由局部稿猜地址。');
      if (scenes.some(scene => scene.id === allowed.id))
        throw new HarnessError('duplicate_scene', '同一原画面的不同版本不能混在这次续改里，请明确替换旧引用后再呈现。');
      signal.throwIfAborted();
      const row = host.repo.db.prepare('SELECT session_id FROM messages WHERE id=?').get(previous.source.messageId);
      const sessionId = row ? String(row.session_id) : session.sceneSessionId || session.sessionId;
      scenes.push(host.scenes.get(session.ingress.contract.scope, sessionId, allowed, session.ingress.contract.id));
      currentRefs.add(ref);
    }
    edit = { mode: 'statement_patch', stateOrigin: state.stateOrigin, explicitInputFields: state.explicitInputFields };
  } else draft = input;
  const campusSources = scenes.flatMap(scene => {
    if (scene.kind !== 'campus' || scene.source.sourceId !== 'campus:zju-account') return [];
    const sources = host.campusSceneSources(session.ingress.contract.scope, session.sceneSessionId || session.sessionId, scene);
    if (!sources.length) throw new HarnessError('campus_history_changed', '这张校园画面的原账号来源还没有与本轮对应，先沿现在允许的资料重新读取。');
    return sources;
  });
  const campusSensitiveReads = scenes.flatMap(scene => {
    if (scene.kind !== 'campus' || scene.source.sourceId !== 'campus:zju-account') return [];
    const sessionId = session.sceneSessionId || session.sessionId;
    const owners = host.repo.campusSceneSourceMessageIds(session.ingress.contract.scope, sessionId, scene);
    return host.repo.conversationCampusSensitiveReads(session.ingress.contract.scope, sessionId, owners);
  });
  bindProgramSceneSources(admission, scenes, { ...sourceSupplement,
    ...(campusSources.length ? { campusReadingSources: [...(sourceSupplement?.campusReadingSources || []), ...campusSources] } : {}),
    ...(campusSensitiveReads.length ? { campusSensitiveReads: [...(sourceSupplement?.campusSensitiveReads || []), ...campusSensitiveReads] } : {}) });
  let program;
  try {
    program = compileInteractiveProgram(draft, admission.data, admission.provenance,
      scenes.map(({ id, revision }) => `${id}@${revision}`), admission.provenance.bindings.map(binding => binding.alias), initialInputs, initialInputFields);
  } catch (error) {
    if (!(error instanceof HarnessError) || !error.diagnostic) throw error;
    signal.throwIfAborted(); host.policy.validate(session.ingress.contract.scope);
    const previousNavigation = previous && input.previous ? {
      relation: 'matches_known_reference' as const, fields: { id: 'programId' as const, expectedRevision: 'revision' as const }, automaticRebase: false as const,
      knownReference: { basis: 'validated_previous' as const, source: previous.source,
        previous: { id: previous.view.id, expectedRevision: previous.view.revision },
        read: { tool: 'read_interactive_program' as const, arguments: { ...previous.source, mode: 'overview' as const } } },
    } : undefined;
    throw new HarnessError(error.code, error.message, error.retry, { ...error.diagnostic,
      ...(previousNavigation ? { previous: previousNavigation } : {}),
      explanation: '这份稿没有发表，也没有增加修订号。修订时仍沿此次已核过的previous；新稿没有取得programRef。' + error.diagnostic.explanation });
  }
  signal.throwIfAborted(); host.policy.validate(session.ingress.contract.scope);
  return { admission, ...(edit ? { edit } : {}), view: { id: previous?.view.id || randomUUID(), revision: previous ? previous.view.revision + 1 : 1,
    libraryVersion: PROGRAM_LIBRARY_VERSION, createdAt: host.repo.clock.now(),
    sceneRefs: scenes.map(({ id, revision }) => ({ id, revision })), dsl: program.dsl, program } };
}
