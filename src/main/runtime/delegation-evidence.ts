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
  reread: { tool: 'read_evidence'; arguments: { id: string; offset: number; limit: number } };
  continue?: EvidenceAddress['reread'];
}

/** A disposable hand-off index over existing child observations. Addresses do
 * not copy evidence, verify claims, or grant the parent access to new sources. */
export function delegationEvidenceIndex(repo: KernelRepository, parent: RunSession, child: RunSession,
  delivered: ReadonlySet<string>, pack: ContextPack) {
  const parentScope = parent.ingress.contract.scope, childScope = child.ingress.contract.scope;
  const parentData = repo.scope(parentScope); repo.scope(childScope);
  const items: EvidenceAddress[] = [], seen = new Set<string>();
  const toolReads: { observationId: string; sourceId?: string; status: string;
    recheck: { tool: string; arguments: unknown } }[] = [];
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
    items.push({ eventId, contentVersion: version, sourceId: current.sourceId, observedBy: 'worker', observationId, coverage,
      sourceRange: { start, end }, reread: read(start, end),
      ...(next !== undefined && nextEnd !== undefined && Number.isSafeInteger(next) && next >= end && next < nextEnd && nextEnd <= ceiling
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
      for (const original of result.originals.slice(0, 20)) {
        if (typeof original?.id !== 'string' || !Number.isSafeInteger(original.contentVersion) || !original.previewOnly) continue;
        const event = repo.evidence(childScope, original.id), view = child.attentionEvidenceViews?.[original.id];
        if (!event || event.contentVersion !== original.contentVersion) continue;
        const args = original.read?.arguments, exact = original.sourceRange;
        if (exact && (!Number.isSafeInteger(exact.start) || !Number.isSafeInteger(exact.end) || exact.end <= exact.start)) continue;
        const start = exact ? exact.start : view?.sourceStart ?? (Number.isSafeInteger(args?.offset) ? args.offset : 0);
        const length = Array.from(String(original.preview || '')).length, end = start + length;
        if (exact && exact.end !== end) continue;
        if (!length || codePointSlice(event.text, start, end) !== original.preview) continue;
        add(event.id, event.contentVersion, start, end, observationId, 'candidate_only');
      }
    } else if (observation.requestedArguments !== undefined) {
      if (toolReads.length >= 8) { moreMayExist = true; continue; }
      const sourceId = typeof result.sourceId === 'string' && (result.sourceId === 'current' || parentData.sources.includes(result.sourceId))
        ? result.sourceId : undefined;
      toolReads.push({ observationId, ...(sourceId ? { sourceId } : {}), status: String(result.status || 'returned').slice(0, 60),
        recheck: { tool: observation.tool, arguments: structuredClone(observation.requestedArguments) } });
    }
  }
  const value = { status: 'available', items, toolReads, moreMayExist, complete: false,
    meaning: '这是有界交接目录，不是全部来源清单。这些地址来自该子调查实际收到的工具结果；定位预览与原文片段分开。同一来源被多个子调查引用仍不算独立支持。父助手没有因此读过全文，摘要也不是事实证明。可沿reread核原文、沿continue接下一段；toolReads给同一读取的重新查询入口，不是旧结果重放或执行授权，每次仍核当前来源与用途。' };
  const serialized = JSON.stringify(value), bytes = Buffer.byteLength(serialized), tokens = Math.ceil(Array.from(serialized).length / 1.4);
  if (pack.receipt.budget.readBytes + bytes > pack.contract.budget.maxReadBytes
    || pack.receipt.budget.estimatedTokens + tokens > pack.contract.budget.maxTokens)
    return { status: 'bounded', items: [], moreMayExist: true,
      meaning: '子调查已返回，但本轮剩余上下文不能再展开来源目录；没有把未展示地址称为父助手已读取。' };
  pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
  repo.saveReceipt(parentScope, pack.receipt);
  return value;
}
