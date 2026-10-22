import { z } from 'zod';
import { HarnessError, type WorkSourceRef } from '../../shared/harness';
import { reflectiveLetterReadInput, reflectiveLetterWriteInput } from '../../shared/reflective-letter';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import type { ReflectiveLetterContext } from './reflective-letter';
import { canonical, codePointSlice } from './semantics';

export const reflectiveLetterToolDefinitions: {
  name: string; description: string; schema: z.ZodType; grant?: string; mutates?: boolean;
}[] = [
  { name: 'write_reflective_letter', grant: 'work:write', mutates: true, schema: reflectiveLetterWriteInput,
    description: '按本人这次真实请求，或确实包含回顾的既有有效托付，写一封私人来信。begin可用currentQuote逐字引用本轮写信请求，由宿主在已交付的当前原话中精确唯一定位；或用已知source地址，两者只选一个。窗口仍按实际收到的相关材料与当前请求独立核定，不猜日期。begin成功后复制data.compose.arguments的真实机会地址，补title/paragraphs/coverage进行compose，不手造ID/版本。经历原文另经paragraphs[].citations引用，写信请求不是经历材料。记起具体生活片段、变化的取舍和被忽略的小事，按当前角色自然表达；不是生产力周报或人物评定。需要深读旧经历可用recall_experience，候选/子调查目录须沿原文回读才能进事实段落。原话的sourceContext若来自试说/改表达，保留其身份：可以回顾当时练习了什么，不能把练习台词当已经对外说过、真实承诺或关系结果。memory、可修正解释reflection、愿望wish、纯陪伴care分开；资料少就写短，不杜撰共同往事。不会保存人物事实、自动排程或设置周期通知。' },
  { name: 'read_reflective_letter', grant: 'evidence:read', schema: reflectiveLetterReadInput,
    description: '回到已经写给本人的同一封信，按精确机会ID读取。当前原话、更正、学习过程和资料版本仍须合法；回读不恢复旧托付或通知，不证明用户已看，也不把来信当人物事实的独立证据。' },
];
export const definitions = reflectiveLetterToolDefinitions;
const names = new Set(definitions.map(definition => definition.name));
export type ReflectiveLetterHost = Pick<RuntimeCoordinator, 'repo' | 'policy' | 'context' | 'reflectiveLetters' | 'store'>;
const sourceAddress = (ref: WorkSourceRef): WorkSourceRef => ({ eventId: ref.eventId,
  contentVersion: ref.contentVersion, start: ref.start, end: ref.end });

function permits(host: ReflectiveLetterHost, session: RunSession, ref: WorkSourceRef) {
  try {
    host.policy.validate(session.ingress.contract.scope);
    host.repo.resolveWorkSourceBinding(session.ingress.contract.scope, [ref]);
    const projection = session.attentionEvidenceViews?.[ref.eventId];
    if (!projection) return session.ingress.contract.memoryMode === 'relevant'
      || session.events.some(event => event.id === ref.eventId)
      || host.repo.evidence(session.ingress.contract.scope, ref.eventId)?.sessionId === session.sessionId;
    const event = host.repo.evidence(session.ingress.contract.scope, ref.eventId);
    return !!event && event.contentVersion === ref.contentVersion && projection.contentVersion === ref.contentVersion
      && projection.sourceStart <= ref.start && projection.sourceEnd >= ref.end
      && codePointSlice(event.text, projection.sourceStart, projection.sourceEnd) === projection.quote;
  } catch (error) { if (error instanceof HarnessError) return false; throw error; }
}

/** The same delivered-version/range snapshot is used before purpose review
 * and again before writing; repository reads only recheck that snapshot. */
export function reflectiveLetterContext(host: ReflectiveLetterHost, session: RunSession, signal: AbortSignal): ReflectiveLetterContext {
  const handle = session.ingress.contract.scope, scope = host.policy.require(handle, 'evidence:read');
  const pack = session.pack;
  if (!pack) throw new HarnessError('context_missing', '先接上本轮原话，再写这次来信。');
  const currentRanges = session.events.flatMap(event => {
    if (!scope.currentEventIds.includes(event.id)) return [];
    const projection = session.attentionEvidenceViews?.[event.id];
    if (projection) return projection.contentVersion === event.contentVersion
      && codePointSlice(event.text, projection.sourceStart, projection.sourceEnd) === projection.quote
      ? [{ eventId: event.id, contentVersion: event.contentVersion, start: projection.sourceStart, end: projection.sourceEnd }] : [];
    return !session.background && event.text.length
      ? [{ eventId: event.id, contentVersion: event.contentVersion, start: 0, end: Array.from(event.text).length }] : [];
  });
  return { sessionId: session.sessionId, receipt: pack.receipt, currentRanges, currentEvents: session.events,
    observations: session.observations || [], deliveredObservationIds: session.deliveredObservationIds || new Set(),
    permits: ref => permits(host, session, ref), signal };
}

export function resolveReflectiveLetterRequest(host: ReflectiveLetterHost, session: RunSession, raw: unknown, signal: AbortSignal) {
  const args = reflectiveLetterWriteInput.parse(raw);
  return args.operation === 'begin'
    ? host.reflectiveLetters.resolveRequest(session.ingress.contract.scope, reflectiveLetterContext(host, session, signal), args) : args;
}

/** As with the other collaboration tools, unmatched names synchronously return
 * undefined. The caller owns ordinary read-purpose gates and changed(). */
export function executeReflectiveLetterTool(host: ReflectiveLetterHost, session: RunSession,
  name: string, raw: unknown, signal: AbortSignal): Promise<unknown> | undefined {
  if (!names.has(name)) return undefined;
  return execute();
  async function execute() {
    signal.throwIfAborted();
    const contract = session.ingress.contract, handle = contract.scope, scope = host.policy.require(handle, 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self' || !scope.sources.includes('work:self'))
      throw new HarnessError('letter_scope', '这封信只写给本人，不把私人前情带进公开或他人的交流。');
    const pack = session.pack;
    if (!pack) throw new HarnessError('context_missing', '先接上本轮原话，再写这次来信。');
    const args = name === 'read_reflective_letter' ? reflectiveLetterReadInput.parse(raw) : reflectiveLetterWriteInput.parse(raw);
    const writing = name === 'write_reflective_letter';
    if (writing && (session.ephemeral || scope.child || scope.retention !== 'purpose_scoped'))
      throw new HarnessError('letter_retention', '这次可在当前交流中陪你回看，不另外保存以后还会恢复的私人来信。');
    if (writing) host.policy.require(handle, 'work:write');
    const context = reflectiveLetterContext(host, session, signal);
    const admit = (value: unknown, usage?: ReturnType<RuntimeCoordinator['reflectiveLetters']['usage']>) => {
      signal.throwIfAborted(); host.policy.validate(handle);
      const text = canonical(value), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
      if (usage) {
        if (usage.workSourceBindings.some(binding => binding.refs.some(ref => !context.permits!(ref))))
          throw new HarnessError('letter_source_forbidden', '来信的部分来由已经退出本次范围，未采用旧正文。');
        if (usage.reflectiveLetterSources?.some(metadata => !host.reflectiveLetters.metadataReadable(handle, metadata, context.permits)))
          throw new HarnessError('letter_source_changed', '这封信所用的原资料或经历已改变，未采用旧正文。');
        host.context.recordWorkSourceBindings(pack, usage.workSourceBindings);
        host.context.recordLearningProcesses(pack, usage.learningProcessVersions);
        host.context.recordReflectiveLetterSources(pack, usage.reflectiveLetterSources || []);
        host.context.recordNoteSources(pack, usage.noteSources);
        if (usage.materialReads.length) pack.receipt.materialReads = [...new Map([
          ...(pack.receipt.materialReads || []), ...usage.materialReads,
        ].map(read => [canonical(read), read])).values()];
      }
      pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
      host.repo.saveReceipt(handle, pack.receipt);
      return value;
    };
    if (args.operation === 'begin') {
      if (session.background) throw new HarnessError('letter_current_request', '后台来信须沿已读机会的有效原托付，不把旧授权原话重新当作本轮请求。');
      const result = host.reflectiveLetters.begin(handle, context, args);
      const value = admit(result, { workSourceBindings: [host.repo.resolveWorkSourceBinding(handle, [sourceAddress(result.data.request.source)])],
        learningProcessVersions: [], materialReads: [], reflectiveLetterSources: [], noteSources: [] });
      host.context.recordObjects(pack, [{ id: result.data.opportunityId, revision: result.data.revision }], 'work');
      host.repo.saveReceipt(handle, pack.receipt);
      return value;
    }
    if (args.operation === 'begin_for_opportunity') {
      const opportunity = host.repo.work(handle, undefined, args.opportunityId)[0];
      const inspected = (session.observations || []).some(observation => observation.tool === 'inspect_help' && !!observation.toolCallId
        && session.deliveredObservationIds?.has(observation.toolCallId) && (observation.result as any)?.discoveryOnly === false
        && Array.isArray((observation.result as any)?.items) && (observation.result as any).items.some((item: any) =>
          item?.opportunity?.id === args.opportunityId && item.opportunity.revision === args.expectedRevision
          && item?.mandate?.id === opportunity?.data.bindingId));
      if (!opportunity || contract.memoryMode !== 'relevant' && opportunity.data.sessionId !== session.sessionId
        || !inspected)
        throw new HarnessError('letter_mandate_not_read', '先读取这项真实机会和原托付，再决定来信是否属于已获准的帮助。');
      const result = host.reflectiveLetters.issueForOpportunity(handle, args.opportunityId, args.expectedRevision, args.window, context.permits);
      const value = admit(result, { workSourceBindings: [host.repo.resolveWorkSourceBinding(handle, [sourceAddress(result.data.request.source)])],
        learningProcessVersions: [], materialReads: [], reflectiveLetterSources: [], noteSources: [] });
      host.context.recordObjects(pack, [{ id: result.data.opportunityId, revision: result.data.revision }], 'work');
      host.repo.saveReceipt(handle, pack.receipt);
      return value;
    }
    if (args.operation === 'compose') {
      // The original prepare transaction validates the draft and its sources.
      const result = host.reflectiveLetters.prepare(handle, context, args, { presentInConversation: !session.background });
      const { usage, conversationHelpRef, ...visible } = result as typeof result & {
        usage?: ReturnType<RuntimeCoordinator['reflectiveLetters']['usage']>;
        conversationHelpRef?: { id: string; revision: number; helpRecordId: string };
      };
      const admitted = admit(visible, usage);
      if (conversationHelpRef) {
        session.conversationHelpRefs = [...new Map([...(session.conversationHelpRefs || []), conversationHelpRef]
          .map(ref => [ref.id + ':' + ref.revision, ref])).values()];
      }
      if (result.letterPrepared) {
        host.context.recordObjects(pack, [{ id: result.id, revision: result.revision }], 'work');
        host.repo.saveReceipt(handle, pack.receipt);
      }
      return admitted;
    }
    const record = host.repo.work(handle, undefined, args.opportunityId)[0];
    if (record && contract.memoryMode !== 'relevant' && record.data.sessionId !== session.sessionId)
      throw new HarnessError('letter_session_scope', '这封旧信没有在本轮允许的前情中打开。');
    const result = host.reflectiveLetters.read(handle, args, context.permits);
    const { usage, ...visible } = result as typeof result & { usage?: ReturnType<RuntimeCoordinator['reflectiveLetters']['usage']> };
    const admitted = admit(visible, usage);
    if (result.status === 'fresh' && result.letter) {
      host.context.recordObjects(pack, [{ id: result.letter.id, revision: result.letter.revision }], 'work');
      host.repo.saveReceipt(handle, pack.receipt);
    }
    return admitted;
  }
}
