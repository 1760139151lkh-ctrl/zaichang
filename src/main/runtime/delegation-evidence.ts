import type { ContextPack } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { RunSession } from './coordinator';
import { codePointSlice } from './semantics';

interface EvidenceAddress {
  eventId: string;
  contentVersion: number;
  sourceId: string;
  observedBy: 'worker';
  observationId: string;
  coverage: 'candidate_only' | 'original_excerpt';
  sourceRange: { start: number; end: number };
  providedOriginal?: { text: string; sourceRange: { start: number; end: number }; complete: boolean };
  reread: { tool: 'read_evidence'; arguments: { id: string; offset: number; limit: number } };
  continue?: EvidenceAddress['reread'];
}

/** A disposable hand-off over existing child observations. Rechecked excerpts
 * create no new evidence, verify no claim, and grant no additional source. */
export function delegationEvidenceIndex(repo: KernelRepository, parent: RunSession, child: RunSession,
  delivered: ReadonlySet<string>, pack: ContextPack) {
  const parentScope = parent.ingress.contract.scope, childScope = child.ingress.contract.scope;
  const parentData = repo.scope(parentScope); repo.scope(childScope);
  const items: EvidenceAddress[] = [], seen = new Set<string>();
  const toolReads: { observationId: string; sourceId?: string; status: string;
    recheck: { tool: string; arguments: unknown } }[] = [];
  const assistantExcerpts: { observationId: string; messageId: string; sessionId: string;
    authority: 'assistant_history_not_user_fact'; text: string; sourceRange: { start: number; end: number }; complete: boolean;
    replyState?: ReturnType<KernelRepository['assistantHistory']>[number]['replyState'];
    positions: { position: 'before_anchor' | 'after_anchor'; anchorSource: unknown }[];
    continue?: { tool: 'read_assistant_history'; arguments: { id: string; offset: number; limit: number } } }[] = [];
  const observations = (child.observations || []).filter(value => value.toolCallId && delivered.has(value.toolCallId));
  let moreMayExist = observations.length > 24;
  const add = (eventId: string, version: number, start: number, end: number, observationId: string,
    coverage: EvidenceAddress['coverage'], next?: number, nextEnd?: number) => {
    const source = repo.evidence(childScope, eventId), current = repo.evidence(parentScope, eventId);
    if (!source || !current || source.contentVersion !== version || current.contentVersion !== version
      || source.text !== current.text || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start < 0 || end <= start || end > Array.from(source.text).length) return;
    const view = parent.attentionEvidenceViews?.[eventId];
    if (view && (view.contentVersion !== version || codePointSlice(current.text, view.sourceStart, view.sourceEnd) !== view.quote
      || start < view.sourceStart || end > view.sourceEnd)) return;
    const origin = view?.sourceStart || 0, ceiling = view?.sourceEnd ?? Array.from(current.text).length;
    const key = [eventId, version, start, end, coverage].join(':');
    if (seen.has(key)) return;
    if (items.length >= 16) { moreMayExist = true; return; }
    seen.add(key);
    const read = (offset: number, stop: number): EvidenceAddress['reread'] => ({ tool: 'read_evidence',
      arguments: { id: eventId, offset: offset - origin, limit: Math.min(1200, stop - offset) } });
    const providedEnd = coverage === 'original_excerpt' ? Math.min(end, start + 1200) : start;
    items.push({ eventId, contentVersion: version, sourceId: current.sourceId, observedBy: 'worker', observationId, coverage,
      sourceRange: { start, end }, reread: read(start, end),
      ...(coverage === 'original_excerpt' ? { providedOriginal: { text: codePointSlice(current.text, start, providedEnd),
        sourceRange: { start, end: providedEnd }, complete: start === 0 && providedEnd === Array.from(current.text).length } } : {}),
      ...(providedEnd > start && providedEnd < end ? { continue: read(providedEnd, end) }
        : next !== undefined && nextEnd !== undefined && Number.isSafeInteger(next) && next >= end && next < nextEnd && nextEnd <= ceiling
        ? { continue: read(next, nextEnd) } : {}) });
  };
  for (const observation of observations.slice(-24)) {
    const result = observation.result as Record<string, any> | undefined, observationId = observation.toolCallId!;
    if (!result || ['failed', 'forbidden', 'unknown', 'stale'].includes(String(result.status))) continue;
    if (observation.tool === 'read_evidence' && typeof result.id === 'string' && Number.isSafeInteger(result.version)
      && typeof result.text === 'string' && Array.isArray(result.actualReadRanges)) {
      const event = repo.evidence(childScope, result.id);
      for (const range of result.actualReadRanges) {
        if (!event || range.eventId !== event.id || range.contentVersion !== event.contentVersion
          || codePointSlice(event.text, range.start, range.end) !== result.text) continue;
        const projection = result.projection?.kind === 'attention_authorization_quote' ? result.projection : undefined;
        const origin = projection?.sourceStart || 0;
        const next = Number.isSafeInteger(result.nextOffset) ? result.nextOffset + origin : undefined;
        const stop = projection?.sourceEnd ?? Array.from(event.text).length;
        add(event.id, event.contentVersion, range.start, range.end, observationId, 'original_excerpt', next, stop);
      }
    } else if (observation.tool === 'search_context' && Array.isArray(result.originals)) {
      const originals = [...result.originals, ...(Array.isArray(result.correctionFollowups) ? result.correctionFollowups : []),
        ...(Array.isArray(result.bundles) ? result.bundles.flatMap(bundle => Array.isArray(bundle?.sources) ? bundle.sources : []) : [])];
      for (const original of originals) {
        if (typeof original?.id !== 'string' || !Number.isSafeInteger(original.contentVersion)) continue;
        const event = repo.evidence(childScope, original.id), view = child.attentionEvidenceViews?.[original.id];
        if (!event || event.contentVersion !== original.contentVersion) continue;
        if (!original.previewOnly && original.bodyCoverage?.kind === 'original_text' && typeof original.text === 'string'
          && Array.isArray(original.actualReadRanges)) {
          for (const range of original.actualReadRanges) {
            if (range.eventId !== event.id || range.contentVersion !== event.contentVersion
              || codePointSlice(event.text, range.start, range.end) !== original.text) continue;
            add(event.id, event.contentVersion, range.start, range.end, observationId, 'original_excerpt');
          }
          continue;
        }
        if (!original.previewOnly) continue;
        const args = original.read?.arguments, exact = original.sourceRange;
        if (exact && (!Number.isSafeInteger(exact.start) || !Number.isSafeInteger(exact.end) || exact.end <= exact.start)) continue;
        const start = exact ? exact.start : view?.sourceStart ?? (Number.isSafeInteger(args?.offset) ? args.offset : 0);
        const length = Array.from(String(original.preview || '')).length, end = start + length;
        if (exact && exact.end !== end) continue;
        if (!length || codePointSlice(event.text, start, end) !== original.preview) continue;
        add(event.id, event.contentVersion, start, end, observationId, 'candidate_only');
      }
    } else if (observation.tool === 'read_assistant_history' && Array.isArray(result.items)) {
      for (const item of result.items) {
        if (assistantExcerpts.length >= 8) { moreMayExist = true; break; }
        const range = item?.coverage;
        if (typeof item?.id !== 'string' || typeof item.text !== 'string' || !range
          || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end <= range.start) continue;
        const permits = (run: RunSession) => (ref: { eventId: string; contentVersion: number; start: number; end: number }) => {
          const view = run.attentionEvidenceViews?.[ref.eventId];
          if (!view) return true;
          const event = repo.evidence(run.ingress.contract.scope, ref.eventId);
          return !!event && event.contentVersion === ref.contentVersion && view.contentVersion === ref.contentVersion
            && ref.start >= view.sourceStart && ref.end <= view.sourceEnd
            && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
        };
        const source = repo.assistantHistory(childScope, { id: item.id, limit: 1, permits: permits(child) })[0];
        const current = repo.assistantHistory(parentScope, { id: item.id, limit: 1, permits: permits(parent) })[0];
        if (!source || !current || source.text !== current.text || current.sessionId !== item.sessionId
          || codePointSlice(current.text, range.start, range.end) !== item.text) continue;
        const end = Math.min(range.end, range.start + 1200), total = Array.from(current.text).length;
        const positions = ['before_anchor', 'after_anchor'].includes(item.position)
          ? [{ position: item.position as 'before_anchor' | 'after_anchor', anchorSource: item.anchorSource }] : [];
        const existing = assistantExcerpts.find(value => value.messageId === current.id
          && value.sourceRange.start === range.start && value.sourceRange.end === end);
        if (existing) {
          for (const position of positions) if (!existing.positions.some(value => JSON.stringify(value) === JSON.stringify(position))) existing.positions.push(position);
          continue;
        }
        assistantExcerpts.push({ observationId, messageId: current.id, sessionId: current.sessionId,
          authority: 'assistant_history_not_user_fact', text: codePointSlice(current.text, range.start, end),
          ...(current.replyState ? { replyState: structuredClone(current.replyState) } : {}),
          sourceRange: { start: range.start, end }, complete: range.start === 0 && end === total, positions,
          ...(end < total ? { continue: { tool: 'read_assistant_history', arguments: { id: current.id, offset: end, limit: 1200 } } } : {}) });
      }
    } else if (observation.requestedArguments !== undefined) {
      if (toolReads.length >= 8) { moreMayExist = true; continue; }
      const sourceId = typeof result.sourceId === 'string' && (result.sourceId === 'current' || parentData.sources.includes(result.sourceId))
        ? result.sourceId : undefined;
      toolReads.push({ observationId, ...(sourceId ? { sourceId } : {}), status: String(result.status || 'returned').slice(0, 60),
        recheck: { tool: observation.tool, arguments: structuredClone(observation.requestedArguments) } });
    }
  }
  const value = { status: 'available', items, assistantExcerpts, toolReads, moreMayExist, complete: false,
    meaning: '这份交接带来眼前问题相关的一部分材料。providedOriginal和assistantExcerpts是调查同伴实际收到、父助手目前仍可读且已逐字核对的原文，这次已经随报告交付；内容足够时，可以据此理解。各片段的complete与sourceRange说明它们自己的覆盖，worker全文有另外的阅读范围。助手片段保留助手身份与前后位置，定位预览也保留预览身份；同源多次引用共享一份支持。报告提供的是有来处的理解，reread能回到原文，continue能带来后面的语境。toolReads给出同一读取的重新查询入口，查询时仍沿当前来源与用途取得当次结果；它本身只是一处回读地址。' };
  const serialized = JSON.stringify(value), bytes = Buffer.byteLength(serialized), tokens = Math.ceil(Array.from(serialized).length / 1.4);
  pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
  repo.saveReceipt(parentScope, pack.receipt);
  return value;
}
