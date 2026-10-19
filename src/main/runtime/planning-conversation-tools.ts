import { z } from 'zod';
import { HarnessError, workSourceRefSchema, type WorkRecord, type WorkSourceBinding, type WorkSourceRef } from '../../shared/harness';
import { planningComparisonInput } from '../actions/planning-comparison';
import { planningConversationContinueInput, planningConversationReadInput } from './planning-conversation';
import type { RuntimeCoordinator, RunSession } from './coordinator';
import { canonical, codePointSlice } from './semantics';

const offerInput = z.object({ matterId: z.string().min(1).max(160), expectedMatterRevision: z.number().int().positive(),
  comparison: planningComparisonInput, sourceRefs: z.array(workSourceRefSchema).min(1).max(32) }).strict();
export const definitions: { name: string; description: string; schema: z.ZodType; grant?: string; mutates?: boolean }[] = [
  { name: 'offer_planning_alternatives', grant: 'work:write', mutates: true, schema: offerInput,
    description: '把两到四种实质不同的完整安排接到已恢复的同一商量里。先用planning.compare推演也可以直接给本次原规格与分支；可保留原约定、移动原对象、拟参加未答应活动或换任务偏重。同一任务可用taskPreferences.rhythm比较连着做完或按较短上限拆开做，保留同一完整工作量和逐段准备收尾；原任务不允许拆就不能拆。workRhythms返回真实段落与准备收尾事实，由主助手解释取舍，不给人格或效率打分。sourceRefs是这次实际依据的精确原话，不把模型理由冒充用户偏好。只保存非执行方案与原option身份，日历不变；没排完的节奏不冒充完整另一版，失败分支和未排任务保留原因，不能换名字凑数。' },
  { name: 'read_planning_alternative', grant: 'evidence:read', schema: planningConversationReadInput,
    description: '回到同一件生活商量的一个准确方案，按当前真实日历重看保留、移动、拟参加活动、剩余任务和条件。过去的点选只是讨论；原安排变了就继续商量，不把历史图当现在能直接采用的方案。' },
  { name: 'continue_planning', grant: 'evidence:read', mutates: true, schema: planningConversationContinueInput,
    description: '沿同一方案核对真实原动作、回执和当前日历，给下一项原对象change或新活动save提议。原行动工具返回后用actionRefs把准确stepId/actionId/actionRevision接回来；只凭相同参数不归因成功，缺失引用先inspect。每项仍走现有行动授权，不因选过方案自动执行。已成功部分不重做，未知先inspect，其他安排变化就回到同一商量。前置修改确实完成后用原planner续排完整工作/准备/休息，work:write下只记原动作地址和实际planId引用，不另建成功账本或执行循环，不把已安排说成已完成。' },
];
export const planningConversationToolDefinitions = definitions;
const names = new Set(definitions.map(value => value.name));
export type PlanningConversationToolHost = Pick<RuntimeCoordinator, 'repo' | 'policy' | 'context' | 'planning' | 'planningConversation'>;

export function executePlanningConversationTool(host: PlanningConversationToolHost, session: RunSession,
  name: string, raw: unknown, signal: AbortSignal): Promise<unknown> | undefined {
  if (!names.has(name)) return undefined;
  return execute();
  async function execute() {
    signal.throwIfAborted();
    const contract = session.ingress.contract, handle = contract.scope, scope = host.policy.require(handle, 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.sources.includes('local-agenda'))
      throw new HarnessError('planning_conversation_scope', '这次先用当前允许的材料商量；之前的工作事项或真实日历尚未在本轮打开。');
    const pack = session.pack;
    if (!pack) throw new HarnessError('context_missing', '先接上这轮对话，再继续同一件商量。');
    if ((name === 'offer_planning_alternatives' || name === 'continue_planning') && (scope.child || session.background || session.ephemeral))
      throw new HarnessError('planning_conversation_owner', '由当前主助手在本人允许的前台商量；后台或临时范围不保留方案、不续接行动。');
    const args = definitions.find(value => value.name === name)!.schema.parse(raw) as Record<string, any>;
    const permits = (ref: WorkSourceRef) => {
      try {
        host.repo.resolveWorkSourceBinding(handle, [ref]);
        const projection = session.attentionEvidenceViews?.[ref.eventId];
        if (!projection) return true;
        const event = host.repo.evidence(handle, ref.eventId);
        return !!event && event.contentVersion === projection.contentVersion && event.contentVersion === ref.contentVersion
          && projection.sourceStart <= ref.start && projection.sourceEnd >= ref.end
          && codePointSlice(event.text, projection.sourceStart, projection.sourceEnd) === projection.quote;
      } catch (error) { if (error instanceof HarnessError) return false; throw error; }
    };
    const readOptions = { ...(contract.memoryMode === 'relevant' ? {} : { sessionId: session.sessionId }), permits };
    const allSources = (record: WorkRecord): WorkSourceBinding[] => {
      if (record.sourceBinding) {
        if (record.sourceBinding.refs.some(ref => !permits(ref))) throw new HarnessError('planning_conversation_scope', '这份办法的部分原话不在当前允许的片段中。');
        return [record.sourceBinding];
      }
      const refs = record.kind === 'episode' && record.data.type === 'collaboration_frame'
        ? host.planningConversation.matterSources(handle, record.id, record.revision).refs : record.evidenceIds.map(eventId => {
        const event = host.repo.evidence(handle, eventId);
        if (!event) throw new HarnessError('work_source_changed', '商量原话已不可读。');
        const ref = { eventId, contentVersion: event.contentVersion, start: 0, end: Array.from(event.text).length };
        if (!ref.end || !permits(ref)) throw new HarnessError('planning_conversation_scope', '旧商量没有可证明的精确片段，不能从整条原话补回未允许的部分。');
        return ref;
      });
      if (refs.some(ref => !ref.end || !permits(ref)))
        throw new HarnessError('planning_conversation_scope', '原商量声明的来源片段不在本次允许范围内。');
      const result: WorkSourceBinding[] = [];
      for (let index = 0; index < refs.length; index += 32) result.push(host.repo.resolveWorkSourceBinding(handle, refs.slice(index, index + 32)));
      return result;
    };
    const admit = (result: any) => {
      signal.throwIfAborted(); host.policy.validate(handle);
      const { records = [], bindings = [], ...view } = result as { records?: WorkRecord[]; bindings?: WorkSourceBinding[]; [key: string]: any };
      const actualBindings = [...bindings, ...records.flatMap(allSources)];
      if (actualBindings.some(binding => binding.refs.some(ref => !permits(ref))))
        throw new HarnessError('work_source_changed', '实际带回的来源范围刚刚改变，未采用旧正文。');
      for (const record of records) if (host.repo.work(handle, undefined, record.id)[0]?.revision !== record.revision)
        throw new HarnessError('revision_conflict', '商量已更新，先沿当前版本继续。');
      const serialized = canonical(view), bytes = Buffer.byteLength(serialized), tokens = Math.ceil(Array.from(serialized).length / 1.4);
      if (pack.receipt.budget.readBytes + bytes > contract.budget.maxReadBytes || pack.receipt.budget.estimatedTokens + tokens > contract.budget.maxTokens) {
        const address = typeof view.optionId === 'string' ? { tool: 'read_planning_alternative', arguments: {
          matterId: view.matterId, optionId: view.optionId, expectedRevision: view.revision } } : view.comparisonView?.branches?.find((branch: any) => branch.optionRef)
          ? { tool: 'read_planning_alternative', arguments: { matterId: view.matterId,
            optionId: view.comparisonView.branches.find((branch: any) => branch.optionRef).optionRef.id } } : undefined;
        const partial = { status: 'partial', ...(address ? { read: address } : {}),
          reason: '这次完整安排还放不进当前回复；已保存的商量仍在原事项中，沿准确地址逐一接着看，没有把未读部分说成已经处理。' };
        const small = canonical(partial), smallBytes = Buffer.byteLength(small), smallTokens = Math.ceil(Array.from(small).length / 1.4);
        if (pack.receipt.budget.readBytes + smallBytes > contract.budget.maxReadBytes || pack.receipt.budget.estimatedTokens + smallTokens > contract.budget.maxTokens)
          throw new HarnessError('read_budget', '这轮内容已经很满，实际保存和动作仍留在原来的位置。');
        // A visible address is metadata, not an expanded option body. Preserve
        // its real revision (including this host's own write) without claiming
        // that every other branch reached the model.
        const addressed = address ? records.filter(record => record.id === address.arguments.matterId || record.id === address.arguments.optionId) : [];
        host.context.recordWorkSources(pack, addressed);
        host.context.recordWorkSourceBindings(pack, addressed.flatMap(allSources));
        pack.receipt.budget.readBytes += smallBytes; pack.receipt.budget.estimatedTokens += smallTokens;
        host.repo.saveReceipt(handle, pack.receipt);
        return partial;
      }
      host.context.recordWorkSources(pack, records); host.context.recordWorkSourceBindings(pack, actualBindings);
      const factSources = records.filter(record => record.data.type === 'planning_alternative').flatMap(record =>
        Array.isArray(record.data.sourceIds) ? record.data.sourceIds.filter((source): source is string => typeof source === 'string') : []);
      pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'local-agenda', ...factSources])];
      pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
      host.repo.saveReceipt(handle, pack.receipt);
      return view;
    };
    const currentItems = () => host.repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload)));
    if (name === 'offer_planning_alternatives') {
      const frame = host.repo.work(handle, 'episode', args.matterId)[0];
      if (!frame || contract.memoryMode !== 'relevant' && frame.data.sessionId !== session.sessionId
        && !(Array.isArray(frame.data.sessionIds) && frame.data.sessionIds.includes(session.sessionId)))
        throw new HarnessError('planning_conversation_scope', '这件事尚未在本会话允许的前情中打开。');
      const matterBindings = allSources(frame);
      const refs = z.array(workSourceRefSchema).parse(args.sourceRefs);
      if (refs.some(ref => !permits(ref))) throw new HarnessError('planning_conversation_scope', '这次依据超出已允许的原话片段。');
      const input = planningComparisonInput.parse(args.comparison);
      const campus = await host.planning.readCampus(scope, input.draft.from, input.draft.to, signal);
      signal.throwIfAborted(); host.policy.validate(handle);
      const binding = host.repo.resolveWorkSourceBinding(handle, refs);
      const sources = [...new Set([...input.draft.busy, ...input.draft.energyWindows, ...input.draft.travelTimes,
        ...input.draft.tasks, ...input.draft.conditions.filter(value => value.status !== 'unknown'),
        ...input.draft.tasks.flatMap(task => task.conditions.filter(value => value.status !== 'unknown')),
        ...input.draft.sourceCoverage.filter(value => value.status !== 'not_checked')]
        .flatMap(value => value.sourceId && !['current', 'user-declared'].includes(value.sourceId) ? [value.sourceId] : []))];
      const observed = new Set([...(pack.receipt.providedSourceIds || []), ...binding.sourceIds,
        ...matterBindings.flatMap(value => value.sourceIds), 'local-agenda', ...(campus ? [campus.sourceId] : [])]);
      if (sources.some(source => !observed.has(source)))
        throw new HarnessError('planning_parameter_source_unknown', '方案借用的部分事实还没有在本轮真正读到，先按当前允许来源查清，不靠模型填一个来源名。');
      const result = host.planningConversation.offer(handle, currentItems(), input, { sessionId: session.sessionId,
        matterId: args.matterId, expectedMatterRevision: args.expectedMatterRevision, sourceRefs: refs,
        dependentSourceIds: sources }, campus);
      return admit(result);
    }
    if (name === 'read_planning_alternative') return admit(host.planningConversation.read(handle, currentItems(), args, readOptions));
    const { actionRefs: _actionRefs, ...address } = args;
    const description = host.planningConversation.describe(handle, address, readOptions);
    for (const record of description.records) allSources(record);
    const campus = description.hasContinuation ? null
      : await host.planning.readCampus(scope, description.window.from, description.window.to, signal);
    signal.throwIfAborted(); host.policy.validate(handle);
    return admit(host.planningConversation.continue(handle, currentItems(), args, campus, readOptions));
  }
}
