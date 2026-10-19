import { z } from 'zod';
import { curiosityInvitationInput } from '../../shared/curiosity-invitation';
import { sharedCreationReadInput } from '../../shared/curiosity-source';
import { HarnessError, type WorkSourceRef } from '../../shared/harness';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import type { CuriosityContext, CuriosityInvitationService } from './curiosity-invitation';
import { canonical, codePointSlice } from './semantics';

export interface CuriosityToolDefinition {
  name: string; description: string; schema: z.ZodType; grant?: string; mutates?: boolean;
}
export const definitions: CuriosityToolDefinition[] = [{
  name: 'curiosity_invitation', grant: 'evidence:read', mutates: true, schema: curiosityInvitationInput,
  description: '用户当下想看点新鲜的、一起玩一会儿，或不想再按旧兴趣推荐时，先实际带来一个有内容、现在就能体验的小东西：一段共创、一个谜题或观察，或有原来源的发现，不固定故事或两选一。offer提交title/opening/experience/firstMove，纯创作标created可直接玩；public/mixed须引用本轮真正投递的research.read observationId和正文quote，搜索摘要或子摘要不能当已读原文。brief可先整理可公开主题和检索入口，不外传私人原话/画像，实际搜索仍走原readPurpose。read/continue/another/put_aside沿原ID及revision接着玩、换一个或放下；用户自己的任意回答也可推进同一体验，不必先点按钮。共同虚构能沿原作品继续：记得的是我们一起编过，不把作品里的第一人称或虚构发生当作用户现实经历，也不另建故事人生库。不建目标、爱好标签、提醒或订阅，当前邀请压过旧画像，不能因换一个推定永久不喜欢。不要先问用户选类别或要不要你找，资源暂时失败仍可给不含未核事实、明确标创作的小起点。choices只是可用互动，不必每次展示菜单或追问。取景资料的后端保留不等于地图与作品联动界面已接；该联动当前不可用，不宣传为可点击改写的画面。原共同创作正文与普通校园地图仍可各自使用，公共地点不证明本人到达或真实行程。',
}, { name: 'read_shared_creation', grant: 'evidence:read', schema: sharedCreationReadInput,
  description: '找回并阅读共同作品的早期原章。operation=history可按真实matterId/ownerId或query查目录，order=oldest从最早章开始，复制next继续；这是原messages.Scene的章节地址，不是另存摘要。读正文时用目录/read_assistant_history实际返回的messageId/sceneId/sceneRevision（不传operation），分opening/experience/firstMove按Unicode码点分页。它是当时助手/共创作品，虚构第一人称不是用户现实经历；当前option.seed改变不能替代旧章。阅读/目录不恢复邀请或动作，源与范围每次重核，不读公开缓存冒新事实。',
}];
export const curiosityToolDefinitions = definitions;
export type CuriosityToolHost = Pick<RuntimeCoordinator, 'repo' | 'policy' | 'context'> & {
  curiosityInvitations: CuriosityInvitationService;
};

/** The existing outer coordinator owns read-purpose/local-delegation review
 * when applicable, and changed(). This helper never calls a new classifier. */
export function executeCuriosityTool(
  host: CuriosityToolHost, session: RunSession, name: string, raw: unknown, signal: AbortSignal,
): Promise<unknown> | undefined {
  if (name !== 'curiosity_invitation' && name !== 'read_shared_creation') return undefined;
  return execute();
  async function execute() {
    signal.throwIfAborted();
    const handle = session.ingress.contract.scope, scope = host.policy.require(handle, 'evidence:read');
    if (name !== 'read_shared_creation' && (session.background || scope.child))
      throw new HarnessError('curiosity_current_invitation', '这份小体验由当前私聊的主助手接住，不从后台随机发起或让子调查另建邀请。');
    const pack = session.pack;
    if (!pack) throw new HarnessError('context_missing', '先接上当前对话，再把这份体验拿来一起玩。');
    const shared = name === 'read_shared_creation' ? sharedCreationReadInput.parse(raw) : undefined;
    const input = shared ? 'operation' in shared ? shared : { ...shared, operation: 'read_history' as const }
      : curiosityInvitationInput.parse(raw);
    const permits = (ref: WorkSourceRef) => {
      const view = session.attentionEvidenceViews?.[ref.eventId];
      if (!view) return true;
      const event = host.repo.evidence(handle, ref.eventId) || session.events.find(item => item.id === ref.eventId);
      return !!event && event.contentVersion === ref.contentVersion && view.contentVersion === ref.contentVersion
        && view.sourceStart <= ref.start && view.sourceEnd >= ref.end
        && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
    };
    const context: CuriosityContext = { sessionId: session.sessionId, events: session.events, ephemeral: session.ephemeral,
      allowCrossSession: session.ingress.contract.memoryMode === 'relevant', observations: session.observations || [],
      deliveredObservationIds: session.deliveredObservationIds || new Set(), permits };
    const result = host.curiosityInvitations.execute(handle, context, input);
    signal.throwIfAborted(); host.policy.validate(handle);
    const text = canonical(result.value), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
    if (pack.receipt.budget.readBytes + bytes > session.ingress.contract.budget.maxReadBytes
      || pack.receipt.budget.estimatedTokens + tokens > session.ingress.contract.budget.maxTokens) {
      const current = result.records.find(record => record.kind === 'option');
      const value = { status: 'partial', ...(current ? { saved: { id: current.id, revision: current.revision,
        read: { tool: 'curiosity_invitation', arguments: { operation: 'read', id: current.id } } } } : {}),
        reason: current ? '这个起点已留在原事项里，完整内容还没带入这轮回复；可按原地址再读。' : '这轮没有容纳完整体验内容，尚未把它当作已交付。' };
      const small = canonical(value), smallBytes = Buffer.byteLength(small), smallTokens = Math.ceil(Array.from(small).length / 1.4);
      if (pack.receipt.budget.readBytes + smallBytes > session.ingress.contract.budget.maxReadBytes
        || pack.receipt.budget.estimatedTokens + smallTokens > session.ingress.contract.budget.maxTokens)
        throw new HarnessError('read_budget', '这轮内容已经很满，实际已保存的起点仍留在原事项里。');
      pack.receipt.budget.readBytes += smallBytes; pack.receipt.budget.estimatedTokens += smallTokens;
      host.repo.saveReceipt(handle, pack.receipt);
      return value;
    }
    host.context.recordWorkSources(pack, result.records);
    host.context.recordWorkSourceBindings(pack, result.bindings);
    host.context.recordAssistantWorkSources(pack, result.assistantWorkSources || []);
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    host.repo.saveReceipt(handle, pack.receipt);
    return result.value;
  }
}
