import type { ContextContract, WorkRecord, WorkSourceBinding, WorkSourceRef } from '../../shared/harness';
import type { RuntimeCoordinator } from './coordinator';
import { canonical } from './semantics';

export type LifeContinuityRuntime = Pick<RuntimeCoordinator,
  'repo' | 'store' | 'companionSessions' | 'companionContinuity' | 'studyCompanion'>;
export interface LifeContinuityAdmission {
  /** The caller knows these ingress facts; a ContextContract alone does not. */
  requiresReadPurpose: boolean;
  ephemeral: boolean;
  signal?: AbortSignal;
  permits?: (ref: WorkSourceRef) => boolean;
}
export interface LifeContinuityResult {
  /** Model-facing small cues only. Host records below must not be serialized. */
  data: Record<string, unknown>;
  records: WorkRecord[];
  bindings: WorkSourceBinding[];
  learningProcessVersions?: { id: string; revision: number }[];
}

const LIMIT = 2;
const RETURN_PREVIEW = 120;
const GUIDANCE = `这里有少量仍可回读的相处线索，以及上次一起做事时留下的起点。它们让你有机会接回重要的东西，眼前怎样回应、哪条值得顺势接起，仍由你结合本人这句话来判断。曾经暂停的探索保留当时的状态，旧起点本身没有添上一份现在必须继续的责任。

每条read都通向原来照管这份内容的地方，能带回具体背景和当前仍可读的条件。上次的帮法与解释，也可以在本人此刻的愿望下重新想一想。小习惯这里只带着方法名，read_skill还能读到它的正文和适用条件。

旧对话里的说话人沿当时的真实记录理解，身份尚不清楚时，这一层也保留未知。角色换过以后，历史中的参与者与眼前角色各有自己的身份，那段交流仍属于在场里留下的历史，当前角色可以用自己的方式理解和接续。陪学地址只是纸页的来处，题目和答案是否读过有自己的记录；共做起点也只说明上次停在哪里，恢复与完成各有实际的过程和依据。

这份线索没有覆盖全部前情，未列出的内容仍可能在原处。地址由应用照管，本人可以继续用自己的话提起它们。`;

/** Ambient life continuity supplies the original parent's initial context. It
 * never opens a material, starts a model, resumes an activity, writes a second
 * checkpoint or changes the owner's state. Each owner admits its own view.
 * The caller must budget data before recording the returned host provenance. */
export async function buildLifeContinuity(
  runtime: LifeContinuityRuntime,
  contract: ContextContract,
  sessionId: string | undefined,
  admission: LifeContinuityAdmission,
): Promise<LifeContinuityResult> {
  admission.signal?.throwIfAborted();
  const empty = (): LifeContinuityResult => ({ data: {}, records: [], bindings: [] });
  const scope = runtime.repo.scope(contract.scope);
  if (!sessionId || admission.requiresReadPurpose || admission.ephemeral || scope.child
    || contract.memoryMode !== 'relevant' || contract.retention !== 'purpose_scoped' || scope.retention !== 'purpose_scoped'
    || contract.audience !== 'self' || scope.audience !== 'self' || scope.subjectId !== scope.principalId
    || scope.worldId !== 'real' || contract.subjectId !== scope.principalId || contract.worldId !== 'real'
    || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read')) return empty();

  const handle = contract.scope;
  const admitted = (record: WorkRecord) => !!record.sourceBinding
    && record.sourceBinding.refs.every(ref => admission.permits?.(ref) !== false);
  const records = new Map<string, WorkRecord>();
  const bindings = new Map<string, WorkSourceBinding>();
  const learning = new Map<string, { id: string; revision: number }>();
  const remember = (record: WorkRecord, extra?: WorkSourceBinding) => {
    records.set(record.id + ':' + record.revision, record);
    for (const binding of [record.sourceBinding, extra]) if (binding) bindings.set(canonical(binding), binding);
  };

  const companionship = runtime.companionContinuity.index(handle, {
    sessionId, allowCrossSession: true, persona: runtime.store.settings().persona, limit: LIMIT,
  });
  const companionRecords = new Map(companionship.providedRecords.filter(admitted).map(record => [record.id, record]));
  const conversation = companionship.threads.flatMap(thread => {
    const record = companionRecords.get(thread.id);
    if (!record || record.revision !== thread.revision) return [];
    remember(record);
    return [{ id: thread.id, revision: thread.revision, kind: thread.kind, title: thread.title,
      updatedAt: thread.updatedAt, fromCurrentConversation: thread.fromCurrentConversation,
      personaRelation: thread.personaRelation,
      read: { tool: 'read_companion', arguments: { id: thread.id, expectedRevision: thread.revision } } }];
  });
  // The method title is a discovery cue; its actual instructions still require
  // read_skill. The source-bound method does not silently edit the role core.
  const conversationMethods = companionship.methods.slice(0, 1).flatMap(method => {
    const record = method.id.startsWith('personal:') ? companionRecords.get(method.id.slice('personal:'.length)) : undefined;
    if (!record || record.revision !== method.revision) return [];
    remember(record);
    return [{ id: method.id, revision: method.revision, name: method.name, usage: method.usage,
      instructionsRead: false, read: { tool: 'read_skill', arguments: { id: method.id } } }];
  });

  const coWorkIndex = runtime.companionSessions.index(handle, { limit: LIMIT, permits: admission.permits });
  const coWorkRecords = new Map(coWorkIndex.records.filter(admitted).map(record => [record.id, record]));
  const coWorking = coWorkIndex.items.flatMap(item => {
    const indexed = coWorkRecords.get(item.id);
    if (!indexed || indexed.revision !== item.revision) return [];
    // The owner permits this short working explanation after source checks.
    // It contains no file page, full checkpoint, attempt or teaching answer.
    const current = runtime.companionSessions.context(handle, item.matterId, admission.permits);
    if (!current || current.record.id !== item.id || current.record.revision !== item.revision || !admitted(current.record)) return [];
    remember(current.record, current.sourceBinding);
    for (const ref of current.learningProcessVersions) learning.set(ref.id + ':' + ref.revision, ref);
    return [{ id: item.id, revision: item.revision, matterId: item.matterId, state: current.projection.state,
      helpModeAtLastStop: current.projection.helpMode,
      previousReturnPoint: Array.from(current.projection.returnPoint).slice(0, RETURN_PREVIEW).join(''),
      previewOnly: true, origin: 'previous_working_explanation', availability: 'read_before_resuming',
      read: current.projection.read }];
  });

  // Metadata only: get/read performs asynchronous material recovery later,
  // when this particular paper is actually relevant to the user's new request.
  const studyIndex = runtime.studyCompanion.index(handle, { sessionId, permits: admission.permits, limit: LIMIT });
  const studyRecords = new Map(studyIndex.records.filter(admitted).map(record => [record.id, record]));
  const studyStops = studyIndex.items.flatMap(item => {
    const record = studyRecords.get(item.id);
    if (!record || record.revision !== item.revision) return [];
    remember(record);
    return [{ id: item.id, revision: item.revision, matterId: item.matterId, status: item.status,
      availability: item.availability,
      read: { tool: 'read_study_companion', arguments: { operation: 'read', id: item.id } } }];
  });
  admission.signal?.throwIfAborted(); runtime.repo.scope(handle);
  if (!conversation.length && !conversationMethods.length && !coWorking.length && !studyStops.length) return empty();
  const data = { lifeContinuity: {
    ...(conversation.length ? { conversation } : {}),
    ...(conversationMethods.length ? { conversationMethods } : {}),
    ...(coWorking.length ? { coWorking } : {}),
    ...(studyStops.length ? { studyStops } : {}),
    guidance: GUIDANCE,
    coverage: { scope: 'permitted_workspace', bounded: true, relevance: 'main_assistant_judges_current_request',
      moreMayExist: companionship.coverage.moreMayExist || companionship.methods.length > conversationMethods.length
        || coWorkIndex.moreMayExist || studyIndex.moreMayExist,
      meaning: '这里只带来少量可回读线索，旧事仍有尚未展开的部分。活动是否恢复、是否有新的托付，分别沿当前原话和实际状态判断。' },
  } };
  return { data, records: [...records.values()], bindings: [...bindings.values()],
    ...(learning.size ? { learningProcessVersions: [...learning.values()] } : {}) };
}
