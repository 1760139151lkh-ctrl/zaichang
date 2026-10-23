import { createHash } from 'node:crypto';
import { HarnessError, type ScopeHandle } from '../../shared/harness';
import { NOTE_READING_MEANING, noteNativeInput, notePresentationInput, noteReferenceSchema,
  type NoteScene, type NoteReference, type NoteNativeInput } from '../../shared/note-presentation';
import { noteSourceProofSchema, type NoteSourceProof } from '../../shared/notes-source';
import type { Store } from '../store';
import type { Message } from '../../shared/types';
import type { RunSession } from './coordinator';
import type { NotebookQuoteReference } from '../../shared/notes';

export class NotePresentationService {
  constructor(readonly store: Store) {}
  private boundary() { const runtime = this.store.runtime; return `${this.store.kernel.epoch}:${this.store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`; }
  private readable(handle: ScopeHandle, proof: NoteSourceProof) {
    this.store.runtime.policy.require(handle, 'evidence:read');
    if (!this.store.kernel.noteSourcesReadable(handle, [proof]))
      throw new HarnessError('note_source_changed', '这页笔记现在不能沿原来的来源展开，请先看看当前允许的内容。');
  }
  private page(handle: ScopeHandle, proof: NoteSourceProof, sessionId: string): NoteScene {
    this.readable(handle, proof);
    const page = this.store.notes.read({ id: proof.id, revision: proof.revision, offset: proof.start,
      limit: Math.max(1, proof.end - proof.start) }, handle);
    if (page.note.sha256 !== proof.sha256 || page.note.revision !== proof.revision || page.offset !== proof.start
      || page.end !== proof.end) throw new HarnessError('note_source_changed', '这页笔记的原文位置有了变化，没有沿旧文字补回。');
    this.readable(handle, proof);
    const identity = createHash('sha256').update(JSON.stringify(proof)).digest('hex');
    return { kind: 'note', id: `note-reading:${identity}`, revision: proof.revision, sessionId, createdAt: this.store.kernel.clock.now(),
      source: { sourceId: 'notes:self', fetchedAt: this.store.kernel.clock.now(), version: `${proof.id}@${proof.revision}` },
      sourceBoundary: this.boundary(), proof, title: page.note.title || '没有标题的笔记', body: page.body, updatedAt: page.note.updatedAt,
      coverage: { start: page.offset, end: page.end, total: page.total, hasMore: page.hasMore }, meaning: NOTE_READING_MEANING };
  }
  create(session: RunSession, raw: unknown, signal: AbortSignal) {
    signal.throwIfAborted();
    const input = notePresentationInput.parse(raw), pack = session.pack;
    if (!pack || session.background || this.store.runtime.policy.validate(pack.contract.scope).child)
      throw new HarnessError('note_presentation_owner', '先在当前对话真正读到这页笔记，再放在一起看。');
    const delivered = pack.receipt.noteSources?.find(proof => proof.id === input.id && proof.revision === input.revision
      && proof.start <= input.start && proof.end >= input.end);
    if (!delivered) throw new HarnessError('note_not_delivered', '这页原文还没有实际带进本轮，请沿manage_note read读取，不编造展示地址。');
    const proof = noteSourceProofSchema.parse({ ...delivered, start: input.start, end: input.end });
    const scene = this.page(pack.contract.scope, proof, session.sceneSessionId || session.sessionId);
    signal.throwIfAborted(); this.readable(pack.contract.scope, proof);
    return { scene, sources: [proof] };
  }
  snapshotReadable(handle: ScopeHandle, scene: NoteScene) {
    try { this.readable(handle, noteSourceProofSchema.parse(scene.proof)); return true; }
    catch (error) { if (error instanceof HarnessError || error instanceof Error && error.name === 'ZodError') return false; throw error; }
  }
  private original(sessionId: string, input: Pick<NoteNativeInput, 'messageId' | 'sceneId' | 'sceneRevision'>) {
    const row = this.store.db.prepare("SELECT payload FROM messages WHERE session_id=? AND id=? AND role='assistant'")
      .get(sessionId, input.messageId);
    const message = row ? JSON.parse(String(row.payload)) as Message : undefined;
    const scene = message?.scenes?.find(value => value.kind === 'note' && value.id === input.sceneId && value.revision === input.sceneRevision);
    if (!message || !scene || scene.kind !== 'note'
      || !this.store.runtime.presentation.sourceCurrentMessage(message).scenes?.some(value => value.id === scene.id && value.revision === scene.revision))
      throw new HarnessError('note_reference_missing', '这一页不在当前可读的原回复里。');
    return scene;
  }
  project(raw: NoteNativeInput, signal: AbortSignal): NoteScene {
    const input = noteNativeInput.parse(raw), runtime = this.store.runtime;
    if (runtime.presentation.public) throw new HarnessError('note_private', '先回到自己的对话，再翻开笔记。');
    const before = this.boundary(), scope = runtime.policy.hostScope(); signal.throwIfAborted();
    const original = this.original(input.sessionId, input), current = this.page(scope, original.proof, input.sessionId);
    if (current.id !== original.id || current.revision !== original.revision) throw new HarnessError('note_reference_changed', '原笔记的这一页需要重新读取。');
    signal.throwIfAborted();
    if (runtime.presentation.public || before !== this.boundary()) throw new HarnessError('note_source_changed', '资料范围刚有变化，请从当前对话重新打开。');
    return current;
  }
  referenceIdentity(handle: ScopeHandle, raw: NoteReference, sessionId: string) {
    this.store.runtime.policy.require(handle, 'evidence:read');
    const ref = noteReferenceSchema.parse(raw);
    const row = this.store.db.prepare(`SELECT json_extract(s.value,'$.proof.id') AS note_id,
      json_extract(s.value,'$.proof.revision') AS note_revision,json_extract(s.value,'$.proof.start') AS start,
      json_extract(s.value,'$.proof.end') AS end FROM messages m,json_each(m.payload,'$.scenes') s
      WHERE m.session_id=? AND m.id=? AND m.role='assistant' AND json_extract(s.value,'$.kind')='note'
      AND json_extract(s.value,'$.id')=? AND json_extract(s.value,'$.revision')=? LIMIT 1`)
      .get(sessionId, ref.messageId, ref.sceneId, ref.sceneRevision);
    if (!row || row.note_id !== ref.noteId || row.note_revision !== ref.revision
      || typeof row.start !== 'number' || typeof row.end !== 'number' || !Number.isSafeInteger(row.start)
      || !Number.isSafeInteger(row.end) || row.start < 0 || row.end < row.start
      || ref.start < Number(row.start) || ref.end > Number(row.end)
      || ref.intent === 'continue_reading' && ref.end !== row.end)
      throw new HarnessError('note_reference_missing', '这句不在原来那页笔记里。');
    return { origin: 'user_note' as const };
  }
  resolveReference(handle: ScopeHandle, raw: NoteReference, sessionId: string) {
    const input = noteReferenceSchema.parse(raw); this.referenceIdentity(handle, input, sessionId);
    const original = this.original(sessionId, input);
    if (input.intent === 'continue_reading') {
      this.readable(handle, original.proof);
      if (!original.coverage.hasMore || input.end !== original.proof.end)
        throw new HarnessError('note_continuation_changed', '原来这一页没有未读的后文，先回到当前那一页。');
      return { text: '', title: original.title, origin: 'user_note' as const, reference: input,
        sources: [{ ...original.proof, start: input.end, end: input.end }], meaning: NOTE_READING_MEANING,
        read: { tool: 'manage_note', arguments: { operation: 'read', input: {
          id: original.proof.id, revision: original.proof.revision, offset: input.end, limit: 4000 } } } };
    }
    const proof = { ...original.proof, start: input.start, end: input.end };
    const scene = this.page(handle, proof, sessionId), text = scene.body;
    if (!text.trim()) throw new HarnessError('note_reference_empty', '先选一小段想接着聊的原文。');
    this.readable(handle, proof);
    return { text, title: scene.title, origin: 'user_note' as const, reference: input, sources: [proof], meaning: NOTE_READING_MEANING };
  }
  resolveNotebookQuote(handle: ScopeHandle, raw: NotebookQuoteReference) {
    const selected = this.store.notes.quote(raw, handle), { proof } = this.store.notes.quoteIdentity(raw, handle);
    this.readable(handle, proof);
    return { ...selected, origin: 'user_note' as const, sources: [proof], meaning: NOTE_READING_MEANING };
  }
  notebookQuoteIdentity(handle: ScopeHandle, raw: NotebookQuoteReference) {
    const { reference, proof } = this.store.notes.quoteIdentity(raw, handle);
    this.readable(handle, proof);
    return { origin: 'user_note' as const, reference, selectedRange: { start: proof.start, end: proof.end },
      meaning: '本条当前UI指向已保存笔记中的这一段；它只解释当前指代，不扩大笔记读取、记录或修改权限。' };
  }
  /** Identifies the document currently being pointed at without delivering any
   * additional text or granting a later private read. */
  readPurposeReference(handle: ScopeHandle, raw: NoteReference, sessionId: string) {
    const ref = noteReferenceSchema.parse(raw); this.referenceIdentity(handle, ref, sessionId);
    const row = this.store.db.prepare(`SELECT json_extract(s.value,'$.proof.id') AS note_id,
      json_extract(s.value,'$.proof.revision') AS note_revision,json_extract(s.value,'$.proof.sha256') AS note_sha,
      json_extract(s.value,'$.proof.start') AS source_start,json_extract(s.value,'$.proof.end') AS source_end
      FROM messages m,json_each(m.payload,'$.scenes') s WHERE m.session_id=? AND m.id=? AND m.role='assistant'
      AND json_extract(s.value,'$.kind')='note' AND json_extract(s.value,'$.id')=? AND json_extract(s.value,'$.revision')=? LIMIT 1`)
      .get(sessionId, ref.messageId, ref.sceneId, ref.sceneRevision);
    if (!row) throw new HarnessError('note_reference_missing', '这一处笔记来源目前不能定位。');
    const proof = noteSourceProofSchema.parse({ id: row.note_id, revision: row.note_revision, sha256: row.note_sha,
      start: row.source_start, end: row.source_end });
    this.readable(handle, proof);
    return { origin: 'user_note' as const, reference: ref, selectedRange: { start: ref.start, end: ref.end },
      displayedPage: { start: proof.start, end: proof.end },
      meaning: '本条当前UI引用，仅解指代；不是授权，不证明本轮已读全文。独立笔记读取仍由当前来源、用途与范围门判断。' };
  }
}
