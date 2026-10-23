import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, type EvidenceEvent, type ScopeHandle } from '../../shared/harness';
import type { KernelRepository, MemoryContextDirectoryPosition } from '../storage/repository';
import { canonical, codePointSlice } from '../runtime/semantics';
import type { MemoryContext } from './service';

export const MEMORY_CONTEXT_METHOD = 'source-windows-v4';
/** Target for optional previews, not a refusal threshold for required text. */
export const MEMORY_CONTEXT_BYTES = 48_000;
export const contextBrowseSchema = z.array(z.enum(['before', 'later'])).max(2);
export type ContextBrowseDirection = z.infer<typeof contextBrowseSchema>[number];
export const contextRequestSchema = z.object({ eventId: z.string().min(1).max(160), contentVersion: z.number().int().positive(),
  start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict();
export type ContextRequest = z.infer<typeof contextRequestSchema>;
export interface ContextRange { start: number; end: number }
export interface MemorySourceDirectory {
  eventId: string; contentVersion: number; sourceId: string; sequence: number;
  relation: 'current' | 'before' | 'later_clarification';
  /** Only a wholly admitted source exposes its original length. */
  textLength?: number; availableLength: number; allowedRanges: ContextRange[];
  providedRanges: ContextRange[]; gaps: ContextRange[];
}
export interface MemorySourceWindow extends ContextRequest {
  text: string; relation: MemorySourceDirectory['relation']; sourceContext?: EvidenceEvent['sourceContext'];
}
export interface ContextRequestResult { index: number; status: 'provided' | 'not_admitted' | 'version_changed' | 'invalid_range' | 'budget_exceeded' }
interface AdmittedSource { event: EvidenceEvent; ranges: ContextRange[] }

const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const textDigest = (text: string) => createHash('sha256').update(text).digest('hex');
export function canonicalContextRequests(requests: ContextRequest[]) {
  return [...new Map(requests.map(request => [canonical(request), request])).values()]
    .sort((a, b) => a.eventId.localeCompare(b.eventId) || a.contentVersion - b.contentVersion || a.start - b.start || a.end - b.end);
}
export const contextRequestSignature = (requests: ContextRequest[]) => digest(canonicalContextRequests(requests));
export const memoryContextAttemptSignature = (sourceSignature: string, requests: ContextRequest[]) =>
  digest({ source: sourceSignature, requests: contextRequestSignature(requests), method: MEMORY_CONTEXT_METHOD });
function merge(ranges: ContextRange[]) {
  const result: ContextRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = result.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else result.push({ ...range });
  }
  return result;
}
function subtract(ranges: ContextRange[], excluded: ContextRange[]) {
  let result = ranges.map(range => ({ ...range }));
  for (const cut of excluded) result = result.flatMap(range => cut.end <= range.start || cut.start >= range.end ? [range]
    : [...(cut.start > range.start ? [{ start: range.start, end: cut.start }] : []), ...(cut.end < range.end ? [{ start: cut.end, end: range.end }] : [])]);
  return result;
}
export function containsContextRange(ranges: ContextRange[], range: ContextRange) {
  return range.end > range.start && ranges.some(allowed => range.start >= allowed.start && range.end <= allowed.end);
}

/** Inference context never turns a stopped passage into a requestable gap. */
function admitted(repo: KernelRepository, handle: ScopeHandle, event: EvidenceEvent): AdmittedSource | undefined {
  if (!event.label.infer || event.speaker !== 'user' || event.status === 'deleted') return;
  const scope = repo.scope(handle), grant = scope.currentEventIds.includes(event.id) ? 'evidence:read'
    : event.sourceId === 'profile:self' ? 'memory:read' : event.sourceId.startsWith('campus:') ? 'campus:read' : 'evidence:read';
  if (!scope.grants.includes(grant)) return;
  const ranges = repo.availableInferenceRanges(event);
  return ranges.length ? { event, ranges } : undefined;
}

/** SQL scope and usable-source projection precede the bounded context count. */
function sourcesForContext(repo: KernelRepository, handle: ScopeHandle, event: EvidenceEvent, retainedIds: string[], position?: MemoryContextDirectoryPosition) {
  const current = repo.evidence(handle, event.id);
  if (!current || current.contentVersion !== event.contentVersion) throw new HarnessError('memory_context_changed', '原文版本或读取范围已改变，整理保持待处理。');
  const result = new Map<string, AdmittedSource>();
  const coverage = { beforeComplete: true, laterComplete: true, maxScannedPerDirection: 96 };
  const nextPosition: MemoryContextDirectoryPosition = { before: position?.before ?? event.sequence, later: position?.later ?? event.sequence };
  let sessionWatermark = event.sequence;
  const own = admitted(repo, handle, current);
  if (own) result.set(current.id, own);
  if (event.sessionId) {
    const filter = repo.filter(handle);
    // A new clarification wakes an older page too. This is an internal change
    // marker, never a claim that the unlisted source body has been read.
    sessionWatermark = Number(repo.db.prepare(`SELECT max(r.seq) AS sequence FROM h_evidence r WHERE ${filter.sql}
      AND r.infer=1 AND r.status IN ('active','redacted') AND json_extract(r.payload,'$.speaker')='user'
      AND json_extract(r.payload,'$.sessionId')=?`).get(...filter.params, event.sessionId)?.sequence || event.sequence);
    for (const direction of ['before', 'later'] as const) {
      let cursor = nextPosition[direction], count = 0, scanned = 0;
      while (scanned < 96) {
        const rows = repo.db.prepare(`SELECT r.* FROM h_evidence r WHERE ${filter.sql} AND r.infer=1
          AND r.status IN ('active','redacted') AND json_extract(r.payload,'$.speaker')='user'
          AND json_extract(r.payload,'$.sessionId')=? AND r.seq${direction === 'before' ? '<' : '>'}?
          ORDER BY r.seq ${direction === 'before' ? 'DESC' : 'ASC'} LIMIT 24`)
          .all(...filter.params, event.sessionId, cursor);
        for (const row of rows) {
          scanned++;
          cursor = Number(row.seq);
          const candidate = JSON.parse(String(row.payload)) as EvidenceEvent;
          const view = admitted(repo, handle, candidate);
          if (!view) continue;
          result.set(candidate.id, view);
          if (++count === 4) break;
        }
        if (count === 4 || rows.length < 24) {
          coverage[direction === 'before' ? 'beforeComplete' : 'laterComplete'] = rows.length < 24 && count < 4;
          break;
        }
      }
      nextPosition[direction] = cursor;
      if (scanned >= 96) coverage[direction === 'before' ? 'beforeComplete' : 'laterComplete'] = false;
    }
    // These addresses were admitted when a previous pass saved the request.
    // They remain only locators: every hydration still uses today's scope.
    for (const id of retainedIds) {
      if (result.has(id)) continue;
      const candidate = repo.evidence(handle, id);
      if (!candidate || candidate.sessionId !== event.sessionId) continue;
      const view = admitted(repo, handle, candidate);
      if (view) result.set(id, view);
    }
  }
  return { sources: [...result.values()], coverage, current, nextPosition, sessionWatermark };
}

function contextPlan(repo: KernelRepository, handle: ScopeHandle, event: EvidenceEvent, requests: ContextRequest[], position?: MemoryContextDirectoryPosition) {
  const { sources, coverage, current, nextPosition, sessionWatermark } = sourcesForContext(repo, handle, event, requests.map(request => request.eventId), position);
  const recent = event.sessionId ? repo.conversationHistory(handle, event.sessionId, [event.id], 12) : [];
  // A deferred source may be far behind the live conversation. Its actual
  // preceding question must not be replaced by twelve much later messages.
  // Pass the original message anchor to the existing bounded transcript
  // reader, which still applies every source, owner and provenance check.
  const preceding = event.sessionId ? repo.conversationHistory(handle, event.sessionId, [event.id], 12,
    { beforeMessageId: event.id }) : [];
  // The nearest original question gets the first chance at the byte budget.
  // Later replies remain separately labelled reference context, never facts
  // already known when the original user statement was made.
  const assistants = [...new Map([...preceding.filter(turn => turn.role === 'assistant').reverse(),
    ...recent.filter(turn => turn.role === 'assistant')].map(turn => [turn.id, turn])).values()];
  const scope = repo.scope(handle);
  const signature = digest({ method: MEMORY_CONTEXT_METHOD, event: [event.id, event.contentVersion], position: position || null, sessionWatermark,
    scope: { sources: [...new Set(scope.sources)].sort(), purposes: [...new Set(scope.purposes)].sort(), grants: [...new Set(scope.grants)].sort() },
    sources: sources.map(({ event: source, ranges }) => [source.id, source.contentVersion, source.sequence, source.sourceId, source.sourceContext || null, ranges,
      digest(ranges.map(range => codePointSlice(source.text, range.start, range.end)))]),
    references: assistants.map(turn => [turn.id, turn.createdAt, digest(turn.content), turn.replyState || null]),
  });
  return { sources, assistants, originalQuestionId: preceding.filter(turn => turn.role === 'assistant').at(-1)?.id,
    signature, coverage, current, nextPosition };
}

export function memoryContextGeneration(repo: KernelRepository, handle: ScopeHandle, event: EvidenceEvent, requests: ContextRequest[], position?: MemoryContextDirectoryPosition) {
  return memoryContextAttemptSignature(contextPlan(repo, handle, event, requests, position).signature, requests);
}
/** Expired locators cannot permanently consume the eight active request slots. */
export function activeContextRequests(repo: KernelRepository, handle: ScopeHandle, event: EvidenceEvent, requests: ContextRequest[], position?: MemoryContextDirectoryPosition) {
  const { sources } = sourcesForContext(repo, handle, event, requests.map(request => request.eventId), position);
  return canonicalContextRequests(requests.filter(request => {
    const source = sources.find(source => source.event.id === request.eventId);
    return source?.event.contentVersion === request.contentVersion && containsContextRange(source.ranges, request);
  }));
}
export function memoryContextIdentity(repo: KernelRepository, handle: ScopeHandle, event: EvidenceEvent, requests: ContextRequest[], position?: MemoryContextDirectoryPosition) {
  const plan = contextPlan(repo, handle, event, requests, position);
  return { sourceSignature: plan.signature, contextWatermark: Math.max(event.sequence, ...plan.sources.map(source => source.event.sequence)),
    generation: memoryContextAttemptSignature(plan.signature, requests) };
}

/** Only the host advances the page which was actually supplied. The durable
 * position contains no text or authority; every hydration uses today's scope. */
export function advanceMemoryContextDirectory(repo: KernelRepository, handle: ScopeHandle, event: EvidenceEvent,
  requests: ContextRequest[], position: MemoryContextDirectoryPosition | undefined, directions: ContextBrowseDirection[]) {
  const plan = contextPlan(repo, handle, event, requests, position);
  const next = { before: position?.before ?? event.sequence, later: position?.later ?? event.sequence };
  const initial = { ...next };
  for (const direction of new Set(directions)) if (!plan.coverage[direction === 'before' ? 'beforeComplete' : 'laterComplete'])
    next[direction] = plan.nextPosition[direction];
  return canonical(next) === canonical(initial) ? position : next;
}

export function buildMemoryContext(repo: KernelRepository, handle: ScopeHandle, event: EvidenceEvent,
  span: { start: number; end: number }, base: MemoryContext, requests: ContextRequest[] = [], position?: MemoryContextDirectoryPosition): MemoryContext {
  const plan = contextPlan(repo, handle, event, requests, position), directory: MemorySourceDirectory[] = plan.sources.map(({ event: source, ranges }) => ({
    eventId: source.id, contentVersion: source.contentVersion, sourceId: source.sourceId, sequence: source.sequence,
    relation: source.id === event.id ? 'current' : source.sequence < event.sequence ? 'before' : 'later_clarification',
    ...(ranges.length === 1 && ranges[0].start === 0 && ranges[0].end === Array.from(source.text).length ? { textLength: Array.from(source.text).length } : {}),
    availableLength: ranges.reduce((sum, range) => sum + range.end - range.start, 0), allowedRanges: ranges, providedRanges: [], gaps: ranges,
  }));
  let selected = new Map<string, ContextRange[]>();
  const requestResults: ContextRequestResult[] = requests.map((_request, index) => ({ index, status: 'budget_exceeded' }));
  const referenceCoverage = plan.assistants.map(turn => ({ id: turn.id, textLength: Array.from(turn.content).length,
    contentSha256: textDigest(turn.content), provided: false, requestable: false as const,
    ...(turn.replyState ? { replyState: turn.replyState } : {}) }));
  const referenceEvent = (turn: (typeof plan.assistants)[number]): NonNullable<MemoryContext['priorEvents']>[number] => ({
    id: turn.id, speaker: 'assistant', text: turn.content, authority: 'assistant_response', receivedAt: turn.createdAt,
    textLength: Array.from(turn.content).length, coverage: turn.replyState ? 'excerpt' : 'complete',
    ...(turn.replyState ? { replyState: turn.replyState } : {}), relation: (() => {
      const sourceOrder = repo.db.prepare('SELECT rowid AS ordinal,created_at FROM messages WHERE id=?').get(event.id);
      const turnOrder = repo.db.prepare('SELECT rowid AS ordinal,created_at FROM messages WHERE id=?').get(turn.id);
      return sourceOrder && turnOrder ? Date.parse(String(turnOrder.created_at)) < Date.parse(String(sourceOrder.created_at))
        || turnOrder.created_at === sourceOrder.created_at && Number(turnOrder.ordinal) < Number(sourceOrder.ordinal) ? 'before' : 'later_clarification'
        : Date.parse(turn.createdAt) < Date.parse(event.receivedAt) ? 'before' : 'later_clarification';
    })(),
  });
  let reservedReference: NonNullable<MemoryContext['priorEvents']> = [];
  const ownLength = Array.from(plan.current.text).length, tailStart = Math.max(0, ownLength - 1200);
  const render = (ranges: Map<string, ContextRange[]>): MemoryContext => {
    const sources = directory.map(source => ({ ...source, providedRanges: ranges.get(source.eventId) || [], gaps: subtract(source.allowedRanges, ranges.get(source.eventId) || []) }));
    const sourceWindows: MemorySourceWindow[] = sources.flatMap(source => {
      const original = plan.sources.find(item => item.event.id === source.eventId)!.event;
      return source.providedRanges.map(range => ({ eventId: source.eventId,
        contentVersion: source.contentVersion, ...range, relation: source.relation,
        ...(original.sourceContext ? { sourceContext: original.sourceContext } : {}),
        text: codePointSlice(original.text, range.start, range.end) }));
    });
    const current = sources.find(source => source.eventId === event.id), ownWindows = sourceWindows.filter(window => window.eventId === event.id);
    const focus = { start: span.start, end: span.end };
    const priorEvents: NonNullable<MemoryContext['priorEvents']> = sourceWindows.filter(window => window.eventId !== event.id).map(window => {
      const source = plan.sources.find(item => item.event.id === window.eventId)!.event;
      return { id: source.id, speaker: source.speaker, text: window.text, contentVersion: source.contentVersion, sequence: source.sequence,
        subjectId: source.subjectId, worldId: source.worldId, authority: source.authority, receivedAt: source.receivedAt,
        ...(source.sourceContext ? { sourceContext: source.sourceContext } : {}),
        textLength: sources.find(item => item.eventId === source.id)?.textLength, coverage: window.start === 0 && window.end === Array.from(source.text).length ? 'complete' : 'excerpt',
        rangeStart: window.start, rangeEnd: window.end, relation: window.relation };
    });
    const excerpt = ownWindows.find(window => window.start <= span.start && window.end > span.start) || ownWindows[0];
    return { ...base, methodVersion: MEMORY_CONTEXT_METHOD, sourceSignature: plan.signature, sourceDirectory: sources, sourceWindows,
      ...(position ? { contextDirectoryPosition: { ...position } } : {}),
      sourceScanCoverage: { ...plan.coverage, bounded: true,
        continuations: (['before', 'later'] as const).filter(direction => !plan.coverage[direction === 'before' ? 'beforeComplete' : 'laterComplete'])
          .map(direction => ({ direction, request: { contextBrowse: [direction] } })),
        meaning: '这是原话前后的一页同会话目录。前面按由近到远、后来按实际收到顺序逐页查看；continuations里的方向可以放进contextBrowse，下一次整理会接着翻。已找到且仍需一起理解的片段可放进contextRequests保留，目录地址本身不表示正文已经读到。没有列出的内容仍可能在后页。' },
      contextRequestResults: [...requestResults], contextPreviewByteTarget: MEMORY_CONTEXT_BYTES, referenceCoverage,
      priorEvents: [...priorEvents, ...reservedReference],
      current: { eventId: event.id, contentVersion: event.contentVersion, sequence: event.sequence,
        ...(plan.current.sourceContext ? { sourceContext: plan.current.sourceContext } : {}),
        focusRange: focus, sourceExcerptStart: excerpt?.start, sourceExcerptEnd: excerpt?.end,
        focusText: current && containsContextRange(current.providedRanges, focus) ? codePointSlice(plan.current.text, span.start, span.end) : '',
        sourceExcerpt: excerpt?.text || '',
        ...(span.end >= tailStart && current && containsContextRange(current.providedRanges, { start: tailStart, end: ownLength })
          ? { tailText: codePointSlice(plan.current.text, tailStart, ownLength), tailStart } : {}),
        textLength: current?.textLength },
    };
  };
  const serializedBytes = (context: MemoryContext) => {
    const { contextDirectoryPosition: _hostPosition, ...visible } = context;
    return Buffer.byteLength(canonical({ context: visible, extractionText: context.current?.sourceExcerpt || '' }), 'utf8');
  };
  const bytes = (ranges: Map<string, ContextRange[]>) => serializedBytes(render(ranges));
  const originalQuestion = plan.assistants.find(turn => turn.id === plan.originalQuestionId);
  if (originalQuestion) {
    reservedReference = [referenceEvent(originalQuestion)];
    referenceCoverage[plan.assistants.indexOf(originalQuestion)].provided = true;
  }
  const add = (eventId: string, ranges: ContextRange[], required = false) => {
    const next = new Map(selected); next.set(eventId, merge([...(next.get(eventId) || []), ...ranges]));
    if (required || bytes(next) <= MEMORY_CONTEXT_BYTES) { selected = next; return true; }
    return false;
  };
  // The actual focus and explicitly requested legal text are required input.
  // The preview target controls discovery volume, never whether they arrive.
  const own = directory.find(source => source.eventId === event.id);
  if (own) add(event.id, own.allowedRanges.flatMap(range => {
    const start = Math.max(range.start, span.start), end = Math.min(range.end, span.end);
    return end > start ? [{ start, end }] : [];
  }), true);
  // Complete small originals fit within the optional discovery target.
  const full = new Map(directory.map(source => [source.eventId, source.allowedRanges]));
  if (bytes(full) <= MEMORY_CONTEXT_BYTES) selected = full;
  else {
    // Keep the established protected suffix available near the end, with its
    // exact legal locator. It remains one window, not proof of full context.
    if (own && span.end >= tailStart && containsContextRange(own.allowedRanges, { start: tailStart, end: ownLength }))
      add(event.id, [{ start: tailStart, end: ownLength }]);
    if (own) for (const range of own.allowedRanges) {
      const start = Math.max(range.start, span.start - 300), end = Math.min(range.end, span.end + 300);
      if (end > start) add(event.id, [{ start, end }]);
    }
  }
  for (const [index, request] of requests.entries()) {
    const source = directory.find(item => item.eventId === request.eventId);
    const status = !source ? 'not_admitted' : source.contentVersion !== request.contentVersion ? 'version_changed'
      : !containsContextRange(source.allowedRanges, request) ? 'invalid_range'
        : add(request.eventId, [{ start: request.start, end: request.end }], true) ? 'provided' : 'budget_exceeded';
    requestResults[index] = { index, status };
  }
  // Fit complete small originals before a long preview consumes the remainder.
  const originalBytes = (source: MemorySourceDirectory) => source.allowedRanges.reduce((sum, range) => sum
    + Buffer.byteLength(codePointSlice(plan.sources.find(item => item.event.id === source.eventId)!.event.text, range.start, range.end), 'utf8'), 0);
  if (bytes(full) > MEMORY_CONTEXT_BYTES) for (const source of [...directory].sort((a, b) => originalBytes(a) - originalBytes(b))) add(source.eventId, source.allowedRanges);
  if (bytes(full) > MEMORY_CONTEXT_BYTES) for (const source of directory) {
    if (source.allowedRanges.every(range => containsContextRange(selected.get(source.eventId) || [], range))) continue;
    // A bounded exact prefix is a preview, never a pretend complete source.
    const range = source.allowedRanges[0];
    let low = range.start, high = range.end;
    while (low < high) {
      const end = Math.ceil((low + high) / 2), candidate = new Map(selected);
      candidate.set(source.eventId, merge([...(candidate.get(source.eventId) || []), { start: range.start, end }]));
      if (bytes(candidate) <= MEMORY_CONTEXT_BYTES) low = end; else high = end - 1;
    }
    if (low > range.start) add(source.eventId, [{ start: range.start, end: low }]);
  }
  let result = render(selected);
  // Assistant output is reference context only, never an evidence directory entry.
  for (const [index, turn] of plan.assistants.entries()) {
    if (reservedReference.some(reference => reference.id === turn.id)) continue;
    const candidate: MemoryContext = { ...result, referenceCoverage,
      priorEvents: [...(result.priorEvents || []), referenceEvent(turn)] };
    if (serializedBytes(candidate) <= MEMORY_CONTEXT_BYTES) {
      referenceCoverage[index].provided = true;
      result = candidate;
    }
  }
  result = { ...result, contextBytes: 0 };
  // Include the metric's own JSON field in this context+extraction accounting.
  for (let pass = 0; pass < 3; pass++) result.contextBytes = serializedBytes(result);
  return result;
}

/** A later unrelated turn need not invalidate a primary-only candidate. */
export function validateMemoryContextSnapshot(repo: KernelRepository, handle: ScopeHandle, event: EvidenceEvent,
  context?: MemoryContext, requireCurrentSet = false) {
  if (!context?.sourceSignature || !context.sourceDirectory) return;
  for (const source of context.sourceDirectory) {
    const current = repo.evidence(handle, source.eventId), view = current && admitted(repo, handle, current);
    if (!view || current!.contentVersion !== source.contentVersion || source.providedRanges.some(range => !containsContextRange(view.ranges, range)))
      throw new HarnessError('memory_context_changed', '已提供前情的版本、用途或允许范围改变，整理保持待处理。');
  }
  for (const reference of context.referenceCoverage || []) {
    if (!reference.provided) continue;
    const current = repo.assistantHistory(handle, { id: reference.id, limit: 1 })[0];
    if (!reference.contentSha256 || !current || current.sessionId !== event.sessionId
      || textDigest(current.text) !== reference.contentSha256
      || canonical(current.replyState || null) !== canonical(reference.replyState || null))
      throw new HarnessError('memory_context_changed', '已提供的原问答参考已改变或不可读，整理保持待处理。');
  }
  if (requireCurrentSet) {
    const retained = context.sourceDirectory.map(source => source.eventId);
    if (contextPlan(repo, handle, event, retained.map(eventId => ({ eventId, contentVersion: 1, start: 0, end: 1 })), context.contextDirectoryPosition).signature !== context.sourceSignature)
      throw new HarnessError('memory_context_changed', '同一对话有了新的合法前情，需要按当前资料重新核对。');
  }
}
