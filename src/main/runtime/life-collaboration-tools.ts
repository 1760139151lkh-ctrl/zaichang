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
    description: '为值得接着聊的话题、用户实际采用的共同说法和真实表达反馈留一个入口，或按当前原话修订、续聊、暂放、结束。来源须是本人真实原话；助手自己提过的话不代表双方已经采用。不记录好感度或情绪档案。明确希望以后沿用的相处习惯另用manage_method的conversation用途，不改角色核心、不排程或后台联系。' },
  { name: 'read_companion_session', grant: 'evidence:read', schema: companionSessionReadSchema,
    description: '找回同一件事一起做到哪里、当时希望怎样帮、哪些材料还在那里，以及回来时从哪一小步接起。材料地址只是入口，回读断点不代表已读材料、做完、掌握或恢复执行。仅为停止已知会话时可以只取当前状态。' },
  { name: 'manage_companion_session', grant: 'work:write', mutates: true, schema: companionSessionWriteSchema,
    description: '沿已有真实事项开始一起做、留下当前起点、暂放、回来接着做或收尾。帮助可以是听一会儿、一起理、只提示或直接帮做；从本轮原话理解，不强迫把烦恼变成计划。暂停和收尾不判断掌握，不登记计时提醒或完成其他业务。' },
  { name: 'read_study_companion', grant: 'evidence:read', schema: studyCompanionInput.options[1],
    description: '只读原题、你当时的尝试和已经留在同一张陪学纸上的步骤；可接着未读历史，不改变提示深度、不保存新步骤。适合只想找回内容或本轮不保留新记录时使用。' },
  { name: 'study_companion', grant: 'evidence:read', mutates: true, schema: studyCompanionInput,
    description: '围绕真实原题开一张陪学纸，接住你的尝试、给一点提示、换例子或直接讲清楚，也可回读、暂放和收好。题目可来自已给的原话或刚才真正看过的材料；每一步保留同一题和当前卡点。当前解释若适合让人轻改条件，可在packet.exploration声明有限二次式a*x²+b*x+c、系数参数与横纵范围，先用packet.text讲清，再联动曲线、同一点的高度和可选切线斜率。原题关系和另举的小例子须分清，不任意执行公式或模型代码，不把有限图示包装成全科模拟器；超范围仍继续正常解释/调查。用户改的是临时演算假设。提示深度由本轮选择，不把助手讲解、调过参数或经过时间当作你已独立掌握。' },
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
      throw new HarnessError('life_source_scope', '那句旧回复的来由现在不能完整带入，不能从片段补回其他私人内容。');
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
      ...(!allowCrossSession ? { restrictToSessionId: session.sessionId } : {}), observations, signal, permits };
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
      if (!matter || !allowCrossSession && !inConversation(matter, session.sessionId)
        || matter.sourceBinding && matter.sourceBinding.refs.some(ref => !permits(ref)))
        throw new HarnessError('life_matter_scope', '这件事还没在本轮允许的前情里打开，不能跨到另一段对话接着做。');
      return matter;
    };
    const admit = (value: unknown, records: WorkRecord[] = [], bindings: WorkSourceBinding[] = [], options: {
      history?: boolean; written?: { id: string; revision: number; status: string; read: unknown };
    } = {}) => {
      signal.throwIfAborted(); host.policy.validate(handle);
      for (const record of records) {
        if (!record.sourceBinding || record.sourceBinding.refs.some(ref => !permits(ref)))
          throw new HarnessError('life_changed', '刚才那段内容已经变化，先按现在的起点接回来。');
        if (record.data.type === 'collaboration_frame') host.companionContinuity.assertCurrent(handle, record.id, record.revision);
        else if (record.data.type === 'companion_session') host.companionSessions.assertCurrent(handle, record.id, record.revision, String(record.data.matterId), permits);
        else if (record.data.type === 'study_companion') host.studyCompanion.assertCurrent(handle, record.id, record.revision, studyContext);
        else throw new HarnessError('life_owner', '这份材料需要回到原来的阅读入口，不能在相处或陪学入口替代读取。');
      }
      if (bindings.some(binding => binding.refs.some(ref => !permits(ref))))
        throw new HarnessError('life_source_scope', '这段回复的部分来由不在当前允许范围内，未采用旧正文。');
      const text = canonical(value), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
      if (pack.receipt.budget.readBytes + bytes > contract.budget.maxReadBytes || pack.receipt.budget.estimatedTokens + tokens > contract.budget.maxTokens) {
        const partial = { status: 'partial', items: [], ...(options.written ? { saved: options.written } : {}),
          reason: options.written ? '这一小步已留好，完整内容还没带进当前回复；可按地址缩小范围回读。' : '这页还没带进当前回复；可缩小范围或只读其中一条，不能把缺少内容当作没有前情。' };
        const small = canonical(partial), smallBytes = Buffer.byteLength(small), smallTokens = Math.ceil(Array.from(small).length / 1.4);
        if (pack.receipt.budget.readBytes + smallBytes > contract.budget.maxReadBytes || pack.receipt.budget.estimatedTokens + smallTokens > contract.budget.maxTokens)
          throw new HarnessError('read_budget', '这轮内容已经很满，已保存的起点仍留在原事项里。');
        pack.receipt.budget.readBytes += smallBytes; pack.receipt.budget.estimatedTokens += smallTokens;
        host.repo.saveReceipt(handle, pack.receipt);
        return partial;
      }
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
      return admit({ ...result, read }, permittedRecords(records), [],
        { written: { id: result.id, revision: result.revision, status: result.status, read } });
    }
    if (name === 'read_companion_session' || name === 'manage_companion_session') {
      if (!args.metadataOnly && args.operation !== 'stop') ensureMatter(args.matterId);
      if (writing && !['begin', 'stop'].includes(args.operation)) {
        const prior = host.companionSessions.read(handle, { matterId: args.matterId, id: args.id }, permits);
        if (!permittedRecords(prior.records).length) throw new HarnessError('life_matter_scope', '这次尚不能采用原断点的完整来由，先打开允许的那一处。');
      }
      const result = writing ? host.companionSessions.write(handle, session.sessionId, args as z.infer<typeof companionSessionWriteSchema>)
        : host.companionSessions.read(handle, args as z.infer<typeof companionSessionReadSchema>, permits);
      const { records, scene, checkpoint: _storedCheckpoint, ...view } = result as {
        records: WorkRecord[]; scene?: unknown; checkpoint?: unknown; id?: string; revision?: number; status: string; [key: string]: unknown;
      };
      const allowed = permittedRecords(records), pointer = allowed[0] ? modulePointer(allowed[0]) : undefined;
      const visible = records.length && !allowed.length ? { status: 'not_available', matterId: args.matterId,
        meaning: '原断点的部分依据不在这次允许的范围里，没有沿旧副本展开。' }
        : { ...view, ...(scene ? { coWork: scene } : {}), ...(pointer ? { discussionModule: pointer } : {}) };
      const read = { tool: 'read_companion_session', arguments: { matterId: args.matterId, ...(view.id ? { id: view.id } : {}) } };
      return admit(visible, allowed, [], { history: allowed.some(record => Array.isArray(record.data.sourceIds) && record.data.sourceIds.includes('history:self')),
        ...(writing && typeof view.id === 'string' && typeof view.revision === 'number'
          ? { written: { id: view.id, revision: view.revision, status: view.status, read } } : {}) });
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
    const first = allowed[0], read = first ? { tool: 'study_companion', arguments: { operation: 'read', id: first.id } } : undefined;
    return admit({ ...view, items, ...(pointers.length ? { discussionModules: pointers } : {}) }, allowed, [],
      { ...(writing && first && read ? { written: { id: first.id, revision: first.revision, status: first.status, read } } : {}) });
  }
}
