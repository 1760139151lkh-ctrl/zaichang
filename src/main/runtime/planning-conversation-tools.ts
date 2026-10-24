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
    description: '把两到四种实质不同的完整安排放回正在商量的同一件事。可以先用planning.compare试算，也可以给本次的完整条件和分支：保留原约定、挪动某项安排、试放尚未答应的活动，或调整任务偏重。taskPreferences.rhythm可以比较连着做和分段做，但要保留同样的完整工作量及每段准备收尾，原任务允许拆分时才拆。workRhythms给出实际段落和准备收尾，方便解释取舍，不评价本人的性格或效率。sourceRefs对应实际依据的精确原话，你想到的理由仍是你的理解。这里只留下可继续商量的方案及同一option地址，日历还没改；没排完的工作与各版遇到的问题都带上原因，实质相同的安排不靠换标题变成另一版。' },
  { name: 'read_planning_alternative', grant: 'evidence:read', schema: planningConversationReadInput,
    description: '沿准确地址找回同一件事的一版安排，放回当前日历里重看哪些保留、哪些挪动、想参加什么、还有什么没排下，以及原来的条件。过去点过这一版，说明当时想接着谈；原安排变了就继续商量，旧图不能替代现在可保存的方案。' },
  { name: 'continue_planning', grant: 'evidence:read', mutates: true, schema: planningConversationContinueInput,
    description: '沿同一版安排核对原动作的真实结果和当前日历，再给下一项原安排的change或新活动的save提议。原行动工具带回结果后，用actionRefs接上准确的stepId/actionId/actionRevision；没有原动作地址时先用inspect_action核对，参数相同还不能说明这一步已办成。每项仍按本人对具体动作的许可办理，点选方案本身不会执行。已办成的部分留着，结果不清楚的先核原动作，日程有变化就接着商量。前面的修改确实完成后，再用原规划器续排完整工作、准备、收尾和休息；有work:write时只保存原动作地址和实际planId，后续仍回原动作检查结果，安排好了也不等于事情做完。' },
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
        throw new HarnessError('work_source_changed', '这份内容所用的原话范围刚刚变了，这次没有继续带入旧正文。');
      for (const record of records) if (host.repo.work(handle, undefined, record.id)[0]?.revision !== record.revision)
        throw new HarnessError('revision_conflict', '商量已更新，先沿当前版本继续。');
      const serialized = canonical(view), bytes = Buffer.byteLength(serialized), tokens = Math.ceil(Array.from(serialized).length / 1.4);
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
