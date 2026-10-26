import { z } from 'zod';
import type { Store } from '../store';
import { HarnessError, objectId, assistantWorkSourceSchema, interactiveProgramSourceSchema,
  type AssistantWorkSource, type InteractiveProgramSource, type ContextReceipt, type EvidenceEvent, type ScopeHandle } from '../../shared/harness';
import type { ReplySourceDisplay, ReplySourcePage, ReplySourceRange } from '../../shared/types';
import { materialCropSchema, materialReferenceSchema, type MaterialItem } from '../../shared/materials';
import { noteSourceProofSchema, type NoteSourceProof } from '../../shared/notes-source';
import { readEvidenceImage } from './evidence-images';
import { programReferenceIdentity, programSourcesReadable } from './interactive-program-sources';
import { programDocumentTitle } from './keep';

const inputSchema = z.object({ sessionId: objectId, messageId: objectId,
  offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(24).default(12) }).strict();
const natural = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

function materialRanges(receipt: ContextReceipt, event: EvidenceEvent, item: MaterialItem): ReplySourceDisplay['reading'] {
  if (!Array.isArray(receipt.materialReads)) return { state: 'unknown', ranges: [] };
  const ranges: ReplySourceRange[] = [];
  for (const read of receipt.materialReads) {
    if (read.sourceEventId !== event.id || read.parentEventId !== event.parentEventId || read.sourceSessionId !== event.sessionId
      || read.sourceContentVersion !== event.contentVersion || read.resourceId !== item.resourceId
      || read.sha256 !== item.sha256 || read.version !== 1) continue;
    const pdf = item.mediaType === 'application/pdf';
    if (pdf ? !natural(read.page) || read.page < 1 || read.page > 200 : read.page !== undefined) continue;
    if (read.capability === 'materials.observe' && pdf) {
      const crop = read.crop === undefined ? undefined : materialCropSchema.safeParse(read.crop);
      if (crop && !crop.success) continue;
      ranges.push({ unit: 'page_image', page: read.page, complete: read.complete === true,
        ...(crop?.success ? { crop: crop.data } : {}) });
    } else if (read.capability === 'materials.read' && natural(read.start) && natural(read.end) && natural(read.total)
      && read.end > read.start && read.end <= read.total) {
      ranges.push({ unit: pdf ? 'page_unicode_code_point' : 'unicode_code_point', ...(pdf ? { page: read.page } : {}),
        start: read.start, end: read.end, total: read.total, complete: read.complete === true });
    }
  }
  const unique = [...new Map(ranges.map(range => [JSON.stringify(range), range])).values()];
  return { state: unique.some(range => range.unit !== 'page_image') ? 'text_ranges'
    : unique.length ? 'page_images' : 'provided', ranges: unique };
}

function materialStatus(reading: ReplySourceDisplay['reading']) {
  const pages = [...new Set(reading.ranges.flatMap(range => range.page ? [range.page] : []))];
  if (reading.state === 'text_ranges') return pages.length ? `取到第 ${pages.join('、')} 页的文字片段` : '取到文件中的文字片段';
  if (reading.state === 'page_images') return reading.ranges.some(range => range.crop) ? '取到原页的局部图像' : '取到原页图像';
  return reading.state === 'unknown' ? '原文件仍在，具体读段尚不能核对' : '这次带来的资料，尚无正文读段';
}

function materialUnavailable(error: HarnessError) {
  return error.code === 'material_integrity' ? '原文件的内容与当时不同，请重新添加要看的那一份。'
    : error.code === 'material_source_forbidden' ? '这份原文的使用范围已改变，可以回原文件重新选择。'
      : '原文件目前不在这里，重新添加原文件就能继续。';
}

function unavailableOwner(id: string, kind: ReplySourceDisplay['kind'], title: string, reason: string): ReplySourceDisplay {
  return { id, kind, title, availability: 'unavailable', reading: { state: 'unknown', ranges: [] },
    statusText: '目前不能打开', unavailableReason: reason };
}

function notebookSource(store: Store, scope: ScopeHandle, id: string, proofs: NoteSourceProof[]): ReplySourceDisplay {
  const missing = () => unavailableOwner(id, 'notebook', '这页笔记', '这版笔记或所指范围已不可用，可以回笔记查看当前内容。');
  if (!store.kernel.noteSourcesReadable(scope, proofs)) return missing();
  const proof = proofs[0], owner = store.kernel.identity;
  const row = store.db.prepare(`SELECT json_extract(v.payload,'$.title') AS title,
    note_codepoint_length(json_extract(v.payload,'$.body')) AS total FROM h_notes n JOIN h_note_versions v ON v.note_id=n.id
    WHERE n.id=? AND v.revision=? AND n.owner=? AND n.workspace=?`).get(proof.id, proof.revision, owner.principalId, owner.workspaceId);
  if (!row) return missing();
  const ranges: ReplySourceRange[] = proofs.filter(value => value.end > value.start).map(value => ({ unit: 'unicode_code_point',
    start: value.start, end: value.end, total: Number(row.total), complete: value.start === 0 && value.end === row.total }));
  return { id, kind: 'notebook', title: typeof row.title === 'string' && row.title.trim() ? row.title : '未命名笔记',
    availability: 'available', reading: { state: ranges.length ? 'text_ranges' : 'unknown', ranges },
    statusText: ranges.length ? `第 ${proof.revision} 版中的文字片段` : `第 ${proof.revision} 版的笔记地址`,
    address: { kind: 'notebook', noteId: proof.id, revision: proof.revision, sha256: proof.sha256,
      start: ranges[0]?.start ?? proof.start, end: ranges[0]?.end ?? proof.end } };
}

function programSource(store: Store, scope: ScopeHandle, receipt: ContextReceipt, id: string, source: InteractiveProgramSource): ReplySourceDisplay {
  const runtime = store.runtime, missing = () => unavailableOwner(id, 'interactive', '这份交互作品',
    '原作品或其中一处来源目前不能打开，可以回原对话查看当前内容。');
  const identity = programReferenceIdentity(runtime, scope, source, undefined, { localDisplay: true });
  if (!identity || !programSourcesReadable(runtime, scope, [source], undefined, true)) return missing();
  const row = store.db.prepare(`SELECT json_extract(v.value,'$.program.hash') AS hash,
    json_extract(v.value,'$.program.sourceDsl') AS source_dsl,json_extract(v.value,'$.program.dsl') AS dsl,
    json_extract(v.value,'$.program.nodeIds[0]') AS node_id FROM messages m,json_each(m.payload,'$.views') v
    WHERE m.id=? AND m.session_id=? AND json_extract(v.value,'$.id')=? AND json_extract(v.value,'$.revision')=?
    AND json_extract(v.value,'$.libraryVersion')=2 LIMIT 1`).get(source.messageId, identity.sessionId, source.programId, source.revision);
  if (!row || typeof row.hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.hash)) return missing();
  const ranges: ReplySourceRange[] = [];
  for (const read of receipt.interactiveProgramReads || []) {
    const coverage = read.coverage;
    if (read.delivery !== 'delivered_to_model' || read.source.messageId !== source.messageId || read.source.programId !== source.programId
      || read.source.revision !== source.revision || !natural(coverage.offset) || !natural(coverage.end) || !natural(coverage.total)
      || coverage.end <= coverage.offset || coverage.end > coverage.total) continue;
    // sourceBodiesProvided concerns bound SourceSlot originals, not DSL text.
    // A literal search's scanned extent also is not a delivered DSL range.
    if (read.mode === 'source' && (!natural(read.counts.sourceCodePoints) || read.counts.sourceCodePoints === 0
      || read.counts.sourceCodePoints !== coverage.end - coverage.offset)) continue;
    ranges.push({ unit: read.mode === 'source' ? 'program_source' : read.mode === 'states' ? 'program_states' : 'program_outline',
      start: coverage.offset, end: coverage.end, total: coverage.total, complete: coverage.complete === true });
  }
  return { id, kind: 'interactive', title: programDocumentTitle(String(row.source_dsl || row.dsl || '')), availability: 'available',
    reading: { state: ranges.length ? 'program_reads' : 'unknown', ranges },
    statusText: ranges.length ? '这份作品留有具体读取范围' : '原作品的入口',
    // The hash comes from the qualified original view, never invented from a receipt.
    address: { kind: 'interactive', sessionId: identity.sessionId, ...source, programHash: row.hash,
      ...(typeof row.node_id === 'string' ? { nodeId: row.node_id } : {}) } };
}

function sceneSource(store: Store, scope: ScopeHandle, id: string, source: AssistantWorkSource): ReplySourceDisplay {
  const repo = store.kernel, missing = () => unavailableOwner(id, 'scene', '当时一起做的内容',
    '原来的共做页或其中一处来源已不可用，可以回原对话查看当前内容。');
  const identity = repo.assistantHistoricalWorkIdentity(scope, source) || repo.assistantCoWorkIdentity(scope, source).length;
  if (!identity || !repo.assistantWorkSourcesReadable(scope, [source], { checked: new Map(), localDisplay: true })) return missing();
  const row = store.db.prepare(`SELECT m.session_id AS session_id,
    json_extract(s.value,'$.matter.title') AS matter_title,json_extract(s.value,'$.view.title') AS view_title
    FROM messages m,json_each(m.payload,'$.scenes') s WHERE m.id=? AND json_extract(s.value,'$.id')=?
    AND json_extract(s.value,'$.revision')=? LIMIT 1`).get(source.messageId, source.sceneId, source.sceneRevision);
  if (!row) return missing();
  return { id, kind: 'scene', title: String(row.matter_title || row.view_title || '当时一起做的内容'), availability: 'available',
    reading: { state: 'unknown', ranges: [] }, statusText: '原来共做页的入口',
    address: { kind: 'scene', sessionId: String(row.session_id), messageId: source.messageId,
      sceneId: source.sceneId, revision: source.sceneRevision } };
}

type SourceCandidate = { kind: 'evidence'; id: string; eventId: string }
  | { kind: 'notebook'; id: string; proofs: NoteSourceProof[] }
  | { kind: 'interactive'; id: string; source: InteractiveProgramSource }
  | { kind: 'scene'; id: string; source: AssistantWorkSource };

/** A view of existing owners, with bounded original-utterance titles. It is
 * not a new source/body store or a model tool. */
export function replySources(store: Store, raw: unknown): ReplySourcePage {
  const input = inputSchema.parse(raw), runtime = store.runtime, repo = store.kernel;
  if (runtime.presentation.public) throw new HarnessError('source_private', '回到自己的对话，再打开原文。');
  const handle = runtime.policy.hostScope({ infer: false }), scope = runtime.policy.validate(handle);
  const boundary = runtime.policy.sourceBoundary;
  const row = store.db.prepare(`SELECT json_extract(payload,'$.contextReceipt') AS receipt,json_extract(payload,'$.status') AS status FROM messages
    WHERE id=? AND session_id=? AND role='assistant'`).get(input.messageId, input.sessionId);
  const receipt = row?.receipt ? JSON.parse(String(row.receipt)) as ContextReceipt : undefined;
  const ids = [...new Set(Array.isArray(receipt?.providedEvidenceIds) ? receipt.providedEvidenceIds.filter(id => typeof id === 'string') : [])];
  const candidates: SourceCandidate[] = ids.map(eventId => ({ kind: 'evidence', id: eventId, eventId }));
  const notes = new Map<string, NoteSourceProof[]>();
  for (const raw of receipt?.noteSources || []) {
    const parsed = noteSourceProofSchema.safeParse(raw); if (!parsed.success) continue;
    const proof = parsed.data, key = `notebook:${proof.id}@${proof.revision}:${proof.sha256}`;
    notes.set(key, [...(notes.get(key) || []), proof]);
  }
  for (const [id, proofs] of notes) candidates.push({ kind: 'notebook', id, proofs });
  const programs = new Map<string, InteractiveProgramSource>();
  for (const raw of [...(receipt?.interactiveProgramSources || []), ...(receipt?.interactiveProgramReads || []).map(read => read.source)]) {
    const parsed = interactiveProgramSourceSchema.safeParse(raw); if (!parsed.success) continue;
    const source = parsed.data; programs.set(`interactive:${source.messageId}/${source.programId}@${source.revision}`, source);
  }
  for (const [id, source] of programs) candidates.push({ kind: 'interactive', id, source });
  const scenes = new Map<string, AssistantWorkSource>();
  for (const raw of receipt?.assistantWorkSources || []) {
    const parsed = assistantWorkSourceSchema.safeParse(raw); if (!parsed.success) continue;
    const source = parsed.data; scenes.set(`scene:${source.messageId}/${source.sceneId}@${source.sceneRevision}`, source);
  }
  for (const [id, source] of scenes) candidates.push({ kind: 'scene', id, source });
  const unavailable = (eventId: string, reason = '这处原文已改变或不在当前可查看范围，可以回原来的位置重新选择。'): ReplySourceDisplay => ({
    id: eventId, eventId, kind: 'other', title: '这处来源', availability: 'unavailable', reading: { state: 'unknown', ranges: [] },
    statusText: '目前不能打开', unavailableReason: reason });
  const projectEvidence = (eventId: string): ReplySourceDisplay => {
    const event = repo.evidence(handle, eventId);
    const version = receipt?.providedObjectVersions?.find(value => value.kind === 'evidence' && value.id === eventId)?.revision;
    if (!event || !runtime.policy.can(handle, 'evidence:read') || event.status !== 'active'
      || version !== undefined && version !== event.contentVersion || repo.hasFence(event.id, event.sourceId)
      || repo.sourceRestrictions(handle, event.id).length || repo.sourceLineageRestricted(event)
      || event.sourceId === 'profile:self' && !runtime.policy.can(handle, 'memory:read')) return unavailable(eventId);
    const originalMessage = () => {
      if (!event.parentEventId || !event.sessionId) return;
      const parent = repo.evidence(handle, event.parentEventId);
      if (!parent || !['active', 'redacted'].includes(parent.status) || parent.speaker !== 'user'
        || parent.kind !== 'user_message' || parent.sessionId !== event.sessionId || repo.hasFence(parent.id, parent.sourceId)
        || repo.sourceRestrictions(handle, parent.id).length || repo.sourceLineageRestricted(parent)) return;
      const row = store.db.prepare("SELECT id FROM messages WHERE id=? AND session_id=? AND role='user'").get(parent.id, parent.sessionId);
      return row ? { kind: 'conversation' as const, sessionId: parent.sessionId!, messageId: parent.id, contentVersion: parent.contentVersion } : undefined;
    };
    if (event.kind === 'file_import') {
      if (event.locator?.kind !== 'file' || !materialReferenceSchema.shape.resourceId.safeParse(event.locator.artifactId).success
        || !event.sessionId || !event.parentEventId) {
        const recovery = originalMessage();
        return { ...unavailable(eventId, '这份资料没有可直接打开的原文件，可以回原消息核对或重新添加文件。'),
          kind: 'document' as const, title: event.fileName || '原来的资料', ...(recovery ? { address: recovery } : {}) };
      }
      try {
        const { item, target } = runtime.materials.nativeReplySource({ resourceId: event.locator.artifactId,
          sourceEventId: event.id, parentEventId: event.parentEventId, sessionId: event.sessionId, contentVersion: event.contentVersion });
        const reading = materialRanges(receipt!, event, item), first = reading.ranges[0];
        return { id: eventId, eventId, kind: 'document' as const, title: item.name, availability: 'available' as const, reading,
          statusText: materialStatus(reading), address: { kind: 'material' as const, target, resourceId: item.resourceId, sha256: item.sha256,
            ...(first?.page ? { page: first.page } : {}), ...(first?.start === undefined ? {} : { start: first.start, end: first.end }) } };
      } catch (error) {
        if (!(error instanceof HarnessError)) throw error;
        const recovery = originalMessage();
        return { ...unavailable(eventId, materialUnavailable(error)), kind: 'document' as const, title: event.fileName || '原来的资料',
          ...(recovery ? { address: recovery } : {}) };
      }
    }
    if (event.imageSource && event.sessionId) {
      try { readEvidenceImage(repo, handle, event.id, event.contentVersion); }
      catch (error) {
        if (error instanceof HarnessError || error instanceof z.ZodError)
          return unavailable(eventId, '原图片已不在当前可查看范围，可以重新添加图片。');
        throw error;
      }
      const parentId = event.parentEventId || event.id;
      const attachment = event.parentEventId ? store.db.prepare(`SELECT json_extract(a.value,'$.attachmentId') AS attachment_id,
        json_extract(a.value,'$.name') AS name FROM messages m,json_each(m.payload,'$.attachments') a
        WHERE m.id=? AND m.session_id=? AND json_extract(a.value,'$.sourceEventId')=?`).get(parentId, event.sessionId, event.id)
        : store.db.prepare("SELECT json_extract(payload,'$.image.name') AS name FROM messages WHERE id=? AND session_id=? AND role='user'").get(parentId, event.sessionId);
      const delivered = receipt?.imageRequests?.some(read => read.accepted && read.sourceEventId === event.id
        && read.sourceContentVersion === event.contentVersion && read.sha256 === event.imageSource!.sha256);
      return { id: eventId, eventId, kind: 'image' as const, title: attachment?.name ? String(attachment.name) : '你带来的图片',
        availability: 'available' as const, reading: { state: delivered ? 'page_images' as const : 'unknown' as const,
          ranges: delivered ? [{ unit: 'page_image' as const, complete: true }] : [] },
        statusText: delivered ? '这次提供了原图' : '你带来的图片', address: { kind: 'image' as const,
          sessionId: event.sessionId, messageId: parentId, sourceEventId: event.id,
          ...(attachment?.attachment_id ? { attachmentId: String(attachment.attachment_id) } : {}), sha256: event.imageSource.sha256 } };
    }
    if (event.speaker === 'user' && event.kind === 'user_message' && event.sessionId) {
      const original = store.db.prepare("SELECT id FROM messages WHERE id=? AND session_id=? AND role='user'").get(event.id, event.sessionId);
      if (!original) return unavailable(eventId, '这句原话没有保留在对话里，可以在当前对话继续说。');
      const points = Array.from(event.text), excerpt = points.slice(0, 24).join('');
      const title = excerpt.trim() ? `“${excerpt}”${points.length > 24 ? '…' : ''}` : '你在对话中写的原话';
      return { id: eventId, eventId, kind: 'conversation' as const, title, availability: 'available' as const,
        reading: { state: 'provided' as const, ranges: [] }, statusText: '回到这句原话',
        address: { kind: 'conversation' as const, sessionId: event.sessionId, messageId: event.id, contentVersion: event.contentVersion } };
    }
    return unavailable(eventId, '这条记录没有可直接打开的原件，可以回到对应功能重新核对。');
  };
  const items = candidates.slice(input.offset, input.offset + input.limit).map(candidate => candidate.kind === 'evidence'
    ? projectEvidence(candidate.eventId) : candidate.kind === 'notebook' ? notebookSource(store, handle, candidate.id, candidate.proofs)
      : candidate.kind === 'interactive' ? programSource(store, handle, receipt!, candidate.id, candidate.source)
        : sceneSource(store, handle, candidate.id, candidate.source));
  runtime.policy.validate(handle);
  if (boundary !== runtime.policy.sourceBoundary || runtime.presentation.public)
    throw new HarnessError('source_changed', '来源范围刚有变化，请重新打开原文。');
  return { items, nextOffset: input.offset + items.length < candidates.length ? input.offset + items.length : null, total: candidates.length,
    privacyEpoch: scope.privacyEpoch, policyRevision: scope.policyRevision, sourceBoundary: boundary,
    ...(!row ? { unavailableReason: '这条回复的来源地址目前无法核对，已打开的原文件仍可继续查看。' }
      : !receipt ? { unavailableReason: row.status === 'running' ? '这次的来源还在接回，稍后可以再打开。'
        : '这条旧回复没有留下可核对的来源地址。' } : {}) };
}
