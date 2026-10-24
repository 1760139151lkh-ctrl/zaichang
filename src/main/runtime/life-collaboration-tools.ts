import { z } from 'zod';
import { companionManageInput, companionReadInput } from '../../shared/companion-continuity';
import { companionSessionReadSchema, companionSessionWriteSchema } from '../../shared/companion-session';
import { studyCompanionInput } from '../../shared/study-companion';
import { HarnessError, type WorkRecord, type WorkSourceBinding, type WorkSourceRef } from '../../shared/harness';
import type { DiscussionModuleRef } from '../../shared/discussion-scene';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import type { StudyCompanionContext } from './study-companion';
import { canonical, codePointSlice } from './semantics';
import { resolveSourceQuote } from './source-quote';

export interface LifeCollaborationDefinition {
  name: string;
  description: string;
  schema: z.ZodType;
  grant?: string;
  mutates?: boolean;
}

export const definitions: LifeCollaborationDefinition[] = [
  { name: 'read_companion', grant: 'evidence:read', schema: companionReadInput,
    description: '接回我们聊过但没说完的话题、共同用过的说法，或你曾给过的表达反馈。可按名字找，也可读一条准确地址；没有下一步、任务或期限也能继续聊。读取不要求现在继续，不将旧感受或一句反馈变成长久的人物判断。' },
  { name: 'manage_companion', grant: 'work:write', mutates: true, schema: companionManageInput,
    description: '为值得接着聊的话题、两人真正用起来的共同说法和本人给过的表达反馈留一个入口，也能按今天的话修订、续聊、暂放或结束。本人原话说明这份意思；只是你提过的说法，还要看看对方有没有一起用过。这里留具体相处的来由，没有好感度或情绪档案。明确希望以后也这样相处时，可用manage_method的conversation用途留下帮法；角色核心、日程和后台联系仍走各自的选择。' },
  { name: 'read_companion_session', grant: 'evidence:read', schema: companionSessionReadSchema,
    description: '找回同一件事一起做到哪里、当时希望怎样帮、哪些材料还在那里，以及回来时从哪一小步接起。沿资料的来处打开原文，再接今天想做的事；实际做到哪里，看各自留下的尝试与结果。只想停下这段共做过程时，读当前状态就够了。' },
  { name: 'manage_companion_session', grant: 'work:write', mutates: true, schema: companionSessionWriteSchema,
    description: '沿已有共同事项开始一起做、留下当前起点、暂放、回来接着做或收尾。听一会儿、一起理、只提示或直接帮做，都沿对方本轮的意思。这里照顾一起做事的进度；日历、固定提醒和其他业务继续回各自原来的地方办理。' },
  { name: 'read_study_companion', grant: 'evidence:read', schema: studyCompanionInput.options[1],
    description: '打开同一张陪学纸上的原题、你当时的尝试和已经讲过的步骤，也能接着翻较早的过程。适合这次只想找回内容的时候，原来的讲法和停留位置保持原样。' },
  { name: 'study_companion', grant: 'evidence:read', mutates: true, schema: studyCompanionInput,
    description: '把原题、你写过的尝试和这次讲过的内容放到同一张陪学纸，回来可以从原处继续。先找回或建立共同事项（update_collaboration的frame），它的id用作matterId；另行登记的请求有自己的id。source留这次保存或更正的完整请求，原题另留自己的真实出处：已读到的聊天原段、笔记或文件页。已有纸就沿同一张纸修正题目、换讲法、暂放或收好，原来的过程留在历史里。按这次需要保存或展开原生学习画面；适合时也可配有限二次式a*x²+b*x+c的小图，改系数和取值，看高度与斜率怎样一起变。原题与另举的例子各自讲清，只提示、一起走一步或完整讲解，都沿这次真正想听的深度。' },
];
export const lifeCollaborationToolDefinitions = definitions;
const names = new Set(definitions.map(definition => definition.name));
export type LifeCollaborationHost = Pick<RuntimeCoordinator,
  'repo' | 'policy' | 'context' | 'companionContinuity' | 'companionSessions' | 'studyCompanion' | 'scenes' | 'store'>;

function exactPermits(host: LifeCollaborationHost, session: RunSession, source: WorkSourceRef) {
  const handle = session.ingress.contract.scope;
  try {
    host.policy.validate(handle);
    host.repo.resolveWorkSourceBinding(handle, [source]);
    const view = session.attentionEvidenceViews?.[source.eventId];
    if (!view) return true;
    const event = host.repo.evidence(handle, source.eventId);
    return !!event && event.contentVersion === source.contentVersion && view.contentVersion === source.contentVersion
      && view.sourceStart <= source.start && view.sourceEnd >= source.end
      && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
  } catch (error) { if (error instanceof HarnessError) return false; throw error; }
}

function inConversation(record: WorkRecord, sessionId: string) {
  return record.data.sessionId === sessionId || Array.isArray(record.data.sessionIds) && record.data.sessionIds.includes(sessionId);
}

/** Check cited fragments and actual old replies before a writer can preserve
 * them. This is range enforcement; the main model still understands meaning. */
function checkInputSources(host: LifeCollaborationHost, session: RunSession, input: unknown) {
  if (!input || typeof input !== 'object') return;
  if (Array.isArray(input)) { for (const value of input) checkInputSources(host, session, value); return; }
  const value = input as Record<string, unknown>, handle = session.ingress.contract.scope;
  if (typeof value.eventId === 'string' && typeof value.quote === 'string') {
    const event = host.repo.evidence(handle, value.eventId), source = event && resolveSourceQuote(event, value);
    if (!source || !exactPermits(host, session, { eventId: source.eventId, contentVersion: source.contentVersion, start: source.start, end: source.end }))
      throw new HarnessError('life_source_scope', '这次只带回原话里已经允许一起看的那一段。');
  }
  if (typeof value.messageId === 'string' && typeof value.quote === 'string'
    && typeof value.start === 'number' && typeof value.end === 'number') {
    const reply = host.repo.learningAssistantSource(handle, { messageId: value.messageId, start: value.start, end: value.end, quote: value.quote });
    if (!reply || reply.sourceRefs.some(source => !exactPermits(host, session, source)))
      throw new HarnessError('life_source_scope', '那句旧回复用过的资料，这次还不能完整打开。可以先回到能一起看的片段。');
  }
  if (Array.isArray(value.learningProcessRefs)) for (const linked of value.learningProcessRefs) {
    const ref = linked as { id?: unknown; revision?: unknown }, record = typeof ref.id === 'string' ? host.repo.work(handle, 'experience', ref.id)[0] : undefined;
    if (!record || record.revision !== ref.revision || !record.sourceBinding
      || record.sourceBinding.refs.some(source => !exactPermits(host, session, source)))
      throw new HarnessError('life_source_scope', '这份尝试过程超出本次已打开的范围，先沿原事项回到允许的那一段。');
  }
  for (const nested of Object.values(value)) checkInputSources(host, session, nested);
}

function modulePointer(record: WorkRecord): DiscussionModuleRef | undefined {
  if (!record.sourceBinding || typeof record.data.matterId !== 'string') return;
  const owner = record.data.type === 'companion_session' ? 'co_work'
    : record.data.type === 'study_companion' ? 'study_companion' : undefined;
  if (!owner) return;
  return { owner, id: record.id, revision: record.revision, matterId: record.data.matterId, sourceBinding: record.sourceBinding };
}

/** The outer coordinator owns verifyReadPurpose when ingress requires it and
 * changed() after a successful write. Existing manage_method remains the only
 * local-delegation gate for saving a future conversational habit. */
export function executeLifeCollaborationTool(
  host: LifeCollaborationHost, session: RunSession, name: string, raw: unknown, signal: AbortSignal,
): Promise<unknown> | undefined {
  if (!names.has(name)) return undefined;
  return execute();
  async function execute() {
    signal.throwIfAborted();
    const contract = session.ingress.contract, handle = contract.scope, scope = host.policy.require(handle, 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self' || !scope.sources.includes('work:self'))
      throw new HarnessError('life_scope', '这次没有打开本人的这段共同话题或学习材料，仍可以继续眼前的交流。');
    const pack = session.pack;
    if (!pack) throw new HarnessError('context_missing', '先接上这轮对话，再回到共同的那一段。');
    const permits = (ref: WorkSourceRef) => exactPermits(host, session, ref), allowCrossSession = contract.memoryMode === 'relevant';
    const persona = host.store.settings().persona;
    const readScope = { sessionId: session.sessionId, allowCrossSession, persona };
    const observations = (session.observations || []).filter(observation => !!observation.toolCallId
      && session.deliveredObservationIds?.has(observation.toolCallId));
    const studyContext: StudyCompanionContext = { sessionId: session.sessionId,
      ...(!allowCrossSession ? { restrictToSessionId: session.sessionId } : {}), observations,
      noteSources: pack.receipt.noteSources || [], signal, permits };
    const definition = definitions.find(item => item.name === name)!;
    const args = definition.schema.parse(raw) as Record<string, any>;
    const writing = name.startsWith('manage_') || name === 'study_companion' && args.operation !== 'read';
    if (writing && (session.ephemeral || scope.child || session.background))
      throw new HarnessError('life_retention', '这次先在当前对话里一起做，不另存以后会恢复的相处或学习记录。');
    if (writing) {
      host.policy.require(handle, 'work:write');
      checkInputSources(host, session, args);
    }
    const permittedRecords = (records: WorkRecord[]) => records.filter(record => record.sourceBinding
      && record.sourceBinding.refs.every(permits) && (allowCrossSession || inConversation(record, session.sessionId)));
    const ensureMatter = (matterId: string) => {
      const matter = host.repo.work(handle, 'episode', matterId)[0];
      if (!matter && host.repo.work(handle, undefined, matterId)[0]?.data.type === 'request_item')
        throw new HarnessError('life_matter_kind', '这里需要正在一起学的共同事项，刚带来的是单独登记的请求。先找回或建立共同事项，再接这张纸。');
      if (!matter || matter.data.type !== 'collaboration_frame' || !allowCrossSession && !inConversation(matter, session.sessionId)
        || matter.sourceBinding && matter.sourceBinding.refs.some(ref => !permits(ref)))
        throw new HarnessError('life_matter_scope', '这次还没有打开这件事的前情，先回到能一起看的那一段。');
      return matter;
    };
    const admit = (value: unknown, records: WorkRecord[] = [], bindings: WorkSourceBinding[] = [], options: {
      history?: boolean;
    } = {}) => {
      signal.throwIfAborted(); host.policy.validate(handle);
      for (const record of records) {
        if (!record.sourceBinding || record.sourceBinding.refs.some(ref => !permits(ref)))
          throw new HarnessError('life_changed', '刚才那段内容已经变化，先按现在的起点接回来。');
        if (record.data.type === 'collaboration_frame') host.companionContinuity.assertCurrent(handle, record.id, record.revision);
        else if (record.data.type === 'companion_session') host.companionSessions.assertCurrent(handle, record.id, record.revision, String(record.data.matterId), permits);
        else if (record.data.type === 'study_companion') host.studyCompanion.assertCurrent(handle, record.id, record.revision, studyContext);
        else throw new HarnessError('life_owner', '这份材料要回到它原来的阅读入口才能打开。');
      }
      if (bindings.some(binding => binding.refs.some(ref => !permits(ref))))
        throw new HarnessError('life_source_scope', '这段回复用过的一部分资料，这次还不能打开，旧正文没有带回来。');
      const text = canonical(value), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
      host.context.recordWorkSources(pack, records);
      host.context.recordWorkSourceBindings(pack, bindings);
      if (options.history) pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'history:self'])];
      pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
      host.repo.saveReceipt(handle, pack.receipt);
      return value;
    };

    if (name === 'read_companion') {
      const { providedRecords, assistantSourceBindings: _allReplyBindings, ...view } = host.companionContinuity.restore(handle, args, readScope);
      const allowed = permittedRecords(providedRecords), allowedIds = new Set(allowed.map(record => record.id));
      const items = view.items.filter(item => allowedIds.has(item.id));
      // Reply bindings are independent of the user's own feedback. Withhold a
      // target outside this projection without losing the permitted feedback.
      const replyBindings: WorkSourceBinding[] = [];
      let withheldTarget = false;
      const visibleItems = items.map(item => {
        const target = item.replyTarget;
        if (!target || typeof target.quote !== 'string' || typeof target.messageId !== 'string'
          || typeof target.start !== 'number' || typeof target.end !== 'number') return item;
        const original = host.repo.learningAssistantSource(handle, { messageId: target.messageId,
          start: target.start, end: target.end, quote: target.quote });
        if (!original || original.sourceRefs.some(source => !permits(source))) {
          withheldTarget = true;
          return { ...item, replyTarget: null };
        }
        replyBindings.push(host.repo.resolveWorkSourceBinding(handle, original.sourceRefs));
        return item;
      });
      const projected = { ...view, items: visibleItems,
        ...(view.items.length && !visibleItems.length ? { status: 'unavailable',
          meaning: '找到了话题的位置，但这次能一起看的前情还不够，正文先留在原处。可以接着眼前的话聊。' } : {}),
        coverage: { ...view.coverage, returned: visibleItems.length, someUnavailable: visibleItems.length !== view.items.length || withheldTarget } };
      return admit(projected, allowed, replyBindings, { history: replyBindings.length > 0 });
    }
    if (name === 'manage_companion') {
      if (!['remember', 'pause', 'close'].includes(args.operation)) {
        const prior = host.companionContinuity.restore(handle, { id: args.id, includeInactive: true }, readScope);
        if (!permittedRecords(prior.providedRecords).length) throw new HarnessError('life_matter_scope', '这段话题还不能沿本轮允许的前情恢复。');
      }
      const { records, ...result } = host.companionContinuity.manage(handle, { sessionId: session.sessionId, ephemeral: session.ephemeral, persona }, args);
      const read = { tool: 'read_companion', arguments: { id: result.id, expectedRevision: result.revision, includeInactive: true } };
      return admit({ ...result, read }, permittedRecords(records));
    }
    if (name === 'read_companion_session' || name === 'manage_companion_session') {
      if (!args.metadataOnly && args.operation !== 'stop') ensureMatter(args.matterId);
      if (writing && !['begin', 'stop'].includes(args.operation)) {
        const prior = host.companionSessions.read(handle, { matterId: args.matterId, id: args.id }, permits);
        if (!permittedRecords(prior.records).length) throw new HarnessError('life_matter_scope', '上次停在这里时用过的资料，这次还不能完整打开。先回到能一起看的那一处。');
      }
      const result = writing ? host.companionSessions.write(handle, session.sessionId, args as z.infer<typeof companionSessionWriteSchema>)
        : host.companionSessions.read(handle, args as z.infer<typeof companionSessionReadSchema>, permits);
      const { records, scene, checkpoint: _storedCheckpoint, ...view } = result as {
        records: WorkRecord[]; scene?: unknown; checkpoint?: unknown; id?: string; revision?: number; status: string; [key: string]: unknown;
      };
      const allowed = permittedRecords(records), pointer = allowed[0] ? modulePointer(allowed[0]) : undefined;
      const visible = records.length && !allowed.length ? { status: 'not_available', matterId: args.matterId,
        meaning: '上次停的位置还在，但它用过的一部分资料这次不能打开，正文没有带回来。' }
        : { ...view, ...(scene ? { coWork: scene } : {}), ...(pointer ? { discussionModule: pointer } : {}) };
      return admit(visible, allowed, [], { history: allowed.some(record => Array.isArray(record.data.sourceIds) && record.data.sourceIds.includes('history:self')) });
    }

    // Only real tool replies already delivered across a model boundary may
    // establish what material the actor has read or seen. Calls in flight and
    // same-batch siblings are deliberately excluded.
    if (args.matterId) ensureMatter(args.matterId);
    const result = await host.studyCompanion.execute(handle, args as z.infer<typeof studyCompanionInput>, studyContext);
    signal.throwIfAborted(); host.policy.validate(handle);
    const { records, ...view } = result;
    const allowed = permittedRecords(records), ids = new Set(allowed.map(record => record.id));
    const items = view.items.filter(item => ids.has(item.id));
    const pointers = allowed.flatMap(record => { const pointer = modulePointer(record); return pointer ? [pointer] : []; });
    return admit({ ...view, items, ...(pointers.length ? { discussionModules: pointers } : {}),
      ...(view.items.length !== items.length && 'coverage' in view
        ? { coverage: { ...view.coverage, someUnavailable: true } } : {}),
      ...(view.items.length && !items.length ? { status: 'unavailable',
        meaning: '这张纸的位置找到了，但正文这次还不能带回来。保存结果可以沿原来的学习事项核对，眼前仍能继续聊。' } : {}) }, allowed);
  }
}
