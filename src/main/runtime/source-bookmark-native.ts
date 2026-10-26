import { HarnessError, type ScopeHandle } from '../../shared/harness';
import { sourceBookmarkKeepSchema, sourceBookmarkReferenceSchema, type SourceBookmarkPreview,
  type SourceBookmarkReference, conversationBookmarkReferenceSchema, type ConversationBookmarkReference } from '../../shared/source-bookmark';
import type { Store } from '../store';
import { createHash } from 'node:crypto';
import { sourceContextGuidance } from '../../shared/source-context';

/** Native paper hand-off. The source owner reopens the exact address both for
 * the preview and for the explicit save; the UI never supplies trusted prose. */
export class NativeSourceBookmarkService {
  constructor(readonly store: Store) {}

  private boundary() {
    if (this.store.runtime.presentation.public)
      throw new HarnessError('bookmark_private', '回到自己的桌边，再接过这一段。');
    return `${this.store.kernel.epoch}:${this.store.kernel.policyRevision}:${this.store.runtime.policy.sourceBoundary}`;
  }

  /** A model adoption must supply its own current scope. The native preview
   * uses the same source owner, but never lends its host scope to a run. */
  conversationQuote(scope: ScopeHandle, raw: ConversationBookmarkReference) {
    const reference = conversationBookmarkReferenceSchema.parse(raw);
    const message = this.store.db.prepare('SELECT session_id,role FROM messages WHERE id=? AND session_id=?')
      .get(reference.messageId, reference.sessionId);
    const event = this.store.kernel.evidence(scope, reference.messageId);
    if (!message || message.role !== 'user' || !event || event.sessionId !== reference.sessionId
      || event.speaker !== 'user' || event.authority !== 'user_statement' || !['active', 'redacted'].includes(event.status)
      || event.label.retention === 'session_only' || this.store.conversationPolicy(reference.sessionId)?.retention === 'session_only'
      || reference.contentVersion !== undefined && reference.contentVersion !== event.contentVersion
      || createHash('sha256').update(event.text).digest('hex') !== reference.sha256)
      throw new HarnessError('bookmark_message_changed', '这句原话已经变化或收起来了，请回原消息重新拿起。');
    const sourceRef = { eventId: event.id, contentVersion: event.contentVersion, start: reference.start, end: reference.end };
    const sourceBinding = this.store.kernel.resolveWorkSourceBinding(scope, [sourceRef]);
    const points = Array.from(event.text), text = points.slice(reference.start, reference.end).join('');
    if (reference.end > points.length || !text.trim()) throw new HarnessError('bookmark_message_range', '这一段已经不在原来的位置，请回原消息重新选择。');
    this.store.runtime.policy.validate(scope);
    const row = this.store.db.prepare('SELECT m.content,m.payload,s.title FROM messages m JOIN sessions s ON s.id=m.session_id WHERE m.id=? AND m.session_id=?')
      .get(reference.messageId, reference.sessionId);
    if (!row) throw new HarnessError('bookmark_message_changed', '这句原话的位置刚有变化，请回原消息再拿一次。');
    const stamp = (JSON.parse(String(row.payload)) as import('../../shared/types').Message).authoredSource;
    if (row.content !== event.text && (!stamp || stamp.eventId !== event.id || stamp.contentVersion !== event.contentVersion
      || stamp.sha256 !== reference.sha256 || stamp.displayStart !== 0 || stamp.displayEnd !== points.length
      || Array.from(String(row.content)).slice(0, stamp.displayEnd).join('') !== event.text))
      throw new HarnessError('bookmark_message_changed', '这句原话与文件标签的位置还没对上，请重新打开原消息再选。');
    const retiredTitle = this.store.db.prepare(`SELECT 1 FROM h_evidence WHERE owner=? AND workspace=?
      AND json_extract(payload,'$.sessionId')=? AND status IN ('deleted','redacted') LIMIT 1`)
      .get(this.store.kernel.identity.principalId, this.store.kernel.identity.workspaceId, reference.sessionId);
    const title = retiredTitle ? '一段对话' : String(row.title);
    const locator = { kind: 'conversation' as const, sessionId: reference.sessionId, messageId: reference.messageId,
      contentHash: createHash('sha256').update(JSON.stringify([title, String(row.content)])).digest('hex'),
      field: 'body' as const, offset: reference.start, end: reference.end };
    return { reference: { ...reference, contentVersion: event.contentVersion }, title: '对话中的这一句', text,
      locator,
      sourceRef, sourceBinding, origin: 'retained_user_message' as const,
      ...(event.sourceContext ? { sourceContext: event.sourceContext, sourceContextMeaning: sourceContextGuidance(event.sourceContext) } : {}),
      meaning: '这是本人所指的既有原话片段，由原消息按当前范围重新读到；不是这次新写的原话，不表示再次赞同、接受安排或允许扩大读取。原话里的作品或试演仍留着当时的身份，本轮新话另按眼前意思理解。' };
  }

  async preview(raw: SourceBookmarkReference): Promise<SourceBookmarkPreview> {
    const bookmark = sourceBookmarkReferenceSchema.parse(raw), before = this.boundary();
    let value: SourceBookmarkPreview;
    if (bookmark.kind === 'material') {
      const quote = bookmark.target
        ? await this.store.runtime.materials.nativeQuote({ target: bookmark.target, quote: bookmark.reference })
        : await this.store.runtime.materials.nativeBookmarkQuote(bookmark.reference);
      value = { reference: bookmark, title: quote.name, text: quote.text, ...(quote.page ? { page: quote.page } : {}),
        ...(this.store.runtime.materials.notebookOriginalRequired(quote) ? { retainOriginalRequired: true } : {}) };
    } else if (bookmark.kind === 'notebook') {
      const quote = this.store.notes.quote(bookmark.reference);
      value = { reference: bookmark, title: quote.title || '没有标题的笔记', text: quote.text };
    } else {
      // The message row establishes only the visible conversation address.
      // Its body is read through the original current evidence/policy owner.
      const scope = this.store.runtime.policy.hostScope({ infer: false, currentEventIds: [], audience: 'self' });
      const current = this.conversationQuote(scope, bookmark.reference);
      value = { reference: { kind: 'conversation', reference: current.reference }, title: current.title, text: current.text, locator: current.locator };
    }
    if (before !== this.boundary()) throw new HarnessError('bookmark_changed', '这一段的来源刚有变化，请回原处再拿一次。');
    return value;
  }

  async keep(raw: unknown) {
    const input = sourceBookmarkKeepSchema.parse(raw), before = this.boundary();
    const preview = await this.preview(input.bookmark);
    const adopted = preview.reference;
    if (adopted.kind === 'material')
      await this.store.runtime.materials.nativeBookmarkQuote(adopted.reference);
    else if (adopted.kind === 'notebook')
      this.store.notes.quoteIdentity(undefined, adopted.reference);
    else {
      const scope = this.store.runtime.policy.hostScope({ infer: false, currentEventIds: [], audience: 'self' });
      this.conversationQuote(scope, adopted.reference);
    }
    if (before !== this.boundary()) throw new HarnessError('bookmark_changed', '这一段的来源刚有变化，请回原处再拿一次。');
    const annotation = input.annotation?.trim();
    // Creating a separate kept page leaves every existing notebook draft and
    // saved original intact. The existing notebook owner supplies its history.
    // Source names can contain the very words later withdrawn from their
    // original owner too. Keep only a neutral label here; the live preview
    // supplies the current source name when this page is opened.
    const createNote = () => this.store.notes.create({ title: '纸边的一段原文',
      body: annotation || '' }, undefined, { via: 'notebook', referenceOnly: true,
      ...(adopted.kind === 'material' ? { material: { ...adopted.reference, name: '原来的资料' } }
        : adopted.kind === 'notebook' ? { notebook: adopted.reference } : { conversation: adopted.reference }) });
    return adopted.kind === 'material' && input.retainOriginal
      ? this.store.runtime.materials.retainNotebookOriginal(adopted.reference, createNote) : createNote();
  }
}
