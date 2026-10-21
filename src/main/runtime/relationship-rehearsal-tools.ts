import { z } from 'zod';
import { rehearsalReadInput, rehearsalWriteInput } from '../../shared/relationship-rehearsal';
import { HarnessError, type WorkSourceRef } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { ContextCompiler } from './context';
import type { PolicyKernel } from './policy';
import type { RunSession } from './coordinator';
import type { RelationshipRehearsalService, RehearsalAdmission } from './relationship-rehearsal';
import { canonical, codePointSlice } from './semantics';

export const relationshipRehearsalToolDefinitions: { name: string; description: string; schema: z.ZodType; grant?: string; mutates?: boolean }[] = [
  { name: 'manage_relationship_rehearsal', schema: rehearsalWriteInput, grant: 'work:write', mutates: true,
    description: '在原共同事项里真正来回试说一段人际表达。begin保留本人想说的意思与边界；respond只取本人本轮真正试说的一句，再由你试演对方的一种可能回应；他觉得不像就alternative或adjust。可随时collect直接整理成眼下愿意考虑的表达，或pause/close，不要求演满轮数、评分或完成关卡。对方台词始终是simulation，不是实际来信、他人画像或承诺。本人练习台词不是已对外说过。已有共同事项可直接用；没有时沿原update_collaboration形成这件事，不让用户选内部ID。返回view.ref是原排练的真实地址与版本，present.arguments可直接交present_view；不要把matterId当画面ID。begin遇到同一事项仍合法active的原排练只回读，不重开或恢复；按返回版本respond后再呈现，只有opening不表示本人已试说。最终成稿与外发仍沿prepare_release/原行动边界。' },
  { name: 'read_relationship_rehearsal', schema: rehearsalReadInput, grant: 'evidence:read',
    description: '回到同一件事的表达排练：本人想守住的意思、实际试说、对方一种可能回应与未发送表达分开。只读不继续演、不恢复状态。较长的来回按固定expectedRevision及coverage继续回读；不把试演当现实关系记忆。若本人请求就此写信，返回的activityTiming.reviewNavigation.use.arguments可复制为begin并补本轮currentQuote，无需猜from/before；该结构只导航这些已核来源的接收时段，不授予整窗资料读取或把间隔当持续练习。' },
];
const names = new Set(relationshipRehearsalToolDefinitions.map(definition => definition.name));
export interface RelationshipRehearsalToolHost {
  repo: KernelRepository; policy: PolicyKernel; context: ContextCompiler; rehearsals: RelationshipRehearsalService;
}
type RehearsalRun = RunSession & { rehearsalAdmission?: RehearsalAdmission };

export function executeRelationshipRehearsalTool(host: RelationshipRehearsalToolHost, session: RehearsalRun,
  name: string, raw: unknown, signal: AbortSignal): Promise<unknown> | undefined {
  if (!names.has(name)) return undefined;
  return execute();
  async function execute() {
    const handle = session.ingress.contract.scope, contract = session.ingress.contract, scope = host.policy.require(handle, 'evidence:read');
    signal.throwIfAborted();
    const pack = session.pack;
    if (!pack) throw new HarnessError('context_missing', '先接上本轮原话，再一起试说。');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self' || !scope.sources.includes('work:self'))
      throw new HarnessError('rehearsal_scope', '这段表达只在本人允许的私人范围里排练。');
    const writing = name === 'manage_relationship_rehearsal';
    if (writing && (session.background || session.ephemeral || scope.child))
      throw new HarnessError('rehearsal_owner', '这段来回由当前主助手陪本人试说，不在后台或子调查里替人开演。');
    const permits = (ref: WorkSourceRef) => {
      try {
        host.repo.resolveWorkSourceBinding(handle, [{ eventId: ref.eventId, contentVersion: ref.contentVersion, start: ref.start, end: ref.end }]);
        const view = session.attentionEvidenceViews?.[ref.eventId];
        if (!view) return contract.memoryMode === 'relevant' || session.events.some(event => event.id === ref.eventId)
          || host.repo.evidence(handle, ref.eventId)?.sessionId === session.sessionId;
        const event = host.repo.evidence(handle, ref.eventId);
        return !!event && event.contentVersion === ref.contentVersion && view.contentVersion === ref.contentVersion
          && view.sourceStart <= ref.start && view.sourceEnd >= ref.end && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
      } catch (error) { if (error instanceof HarnessError) return false; throw error; }
    };
    const context = { sessionId: session.sessionId, allowCrossSession: contract.memoryMode === 'relevant',
      permits, admission: session.rehearsalAdmission, signal };
    const result = writing ? host.rehearsals.write(handle, context, rehearsalWriteInput.parse(raw))
      : host.rehearsals.read(handle, context, rehearsalReadInput.parse(raw));
    signal.throwIfAborted(); host.policy.validate(handle);
    const { records, ...payload } = result;
    const view = 'view' in result ? result.view : undefined;
    const reference = view ? { id: view.id, revision: view.revision } : 'id' in result && typeof result.id === 'string'
      ? { id: result.id, revision: result.revision } : undefined;
    const activityTiming = view ? host.rehearsals.activityTiming(handle, view.id, view.revision, { ...context, timeZone: contract.timeZone }) : undefined;
    const visible = { ...payload, ...(activityTiming ? { activityTiming } : {}), ...(reference ? { present: { tool: 'present_view', arguments: { rehearsal: {
      id: reference.id, expectedRevision: reference.revision } } } } : {}) };
    const text = canonical(visible), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
    if (records.some(record => !record.sourceBinding || record.sourceBinding.refs.some(ref => !permits(ref))))
      throw new HarnessError('rehearsal_source_changed', '刚才这段试说的一处来由已改变，先回到当前允许的那一句。');
    host.context.recordWorkSources(pack, records);
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    host.repo.saveReceipt(handle, pack.receipt);
    return visible;
  }
}
