import { createHash } from 'node:crypto';
import { getDraftAttachments, type Draft, type Message } from '../../shared/types';
import { HarnessError } from '../../shared/harness';
import type { Store } from '../store';
import { isEphemeral } from '../runtime/policy';
import { hasCredentials } from '../runtime/redaction';
import { canonical } from '../runtime/semantics';

const materials = (draft: Draft) => getDraftAttachments(draft).flatMap(item => item.kind === 'text' && item.resource ? [item.resource] : []);

/** Unsent input stays in memory. Only a reviewed native UI action persists it. */
export class DraftStore {
  private pending = new Map<string, { draft: Draft; temporary: boolean; epoch: number }>();
  constructor(private store: Store) {
    // Restored drafts also own their originals, including drafts not opened yet.
    for (const row of store.db.prepare("SELECT key FROM meta WHERE key LIKE 'draft:%'").all()) {
      try {
        const id = String(row.key).slice('draft:'.length);
        for (const reference of materials(this.get(id))) store.runtime.materials.attachDraft(reference, id);
      }
      catch { /* A stale reference remains visible for the owner to replace. */ }
    }
  }
  get(id: string): Draft { return structuredClone(this.pending.get(id)?.draft || this.store.meta<Draft>('draft:' + id, { text: '', attachment: null })); }
  save(id: string, draft: Draft, temporary = false, expectedEpoch?: number) {
    if (expectedEpoch !== undefined && expectedEpoch !== this.store.kernel.epoch) throw new HarnessError('stale_draft', '旧窗口的草稿未覆盖当前资料范围。');
    if (draft.submission && (id !== 'submission-' + draft.submission.id || !/^submission-[a-f0-9-]{36}$/.test(id)))
      throw new HarnessError('submission_draft', '这份未发原稿的地址没有对应上。');
    if (draft.submission && !this.get(id).submission && this.submissions().length >= 16)
      throw new HarnessError('submission_draft_limit', '还有几份未确认的原稿，先取回处理好，再开始新的发送。');
    const previous = materials(this.get(id)), next = structuredClone(draft), references = materials(next);
    // Claim the validated snapshot before changing the draft or releasing its
    // former attachment. A rejected replacement leaves the old draft intact.
    for (const reference of references) this.store.runtime.materials.attachDraft(reference, id, true);
    for (const reference of references) this.store.runtime.materials.attachDraft(reference, id);
    this.pending.set(id, { draft: next, temporary: temporary || draft.submission?.controls?.retention === 'session_only'
      || draft.submission?.controls?.memoryMode === 'session_only' || this.store.conversationPolicy(id)?.retention === 'session_only', epoch: this.store.kernel.epoch });
    const old = this.store.db.prepare('SELECT 1 FROM meta WHERE key=?').get('draft:' + id);
    if (old) { this.store.db.prepare('DELETE FROM meta WHERE key=?').run('draft:' + id); this.store.kernel.checkpointPrivacy(); }
    for (const reference of previous) if (!references.some(next => next.resourceId === reference.resourceId)) this.store.runtime.materials.releasePending(reference, id);
  }
  info(id: string) {
    const entry = this.pending.get(id), draft = this.get(id);
    const digest = createHash('sha256').update(canonical({ draft, epoch: entry?.epoch ?? this.store.kernel.epoch })).digest('hex');
    return { digest, changed: !!entry, empty: !draft.text && !getDraftAttachments(draft).length, temporary: entry?.temporary || false, persisted: !entry };
  }
  persist(id: string, digest: string) {
    const entry = this.pending.get(id);
    if (!entry || this.info(id).digest !== digest || entry.epoch !== this.store.kernel.epoch) throw new HarnessError('stale_draft', '草稿或资料范围已改变，请先查看当前内容。');
    const text = entry.draft.text + getDraftAttachments(entry.draft).map(item => item.kind === 'text' ? '\n' + item.text : '').join('');
    if (entry.temporary || this.store.conversationPolicy(id)?.retention === 'session_only' || isEphemeral(entry.draft.text) || hasCredentials(text)) throw new HarnessError('ephemeral_draft', '这份草稿不写入本机保存区。');
    const references = materials(entry.draft);
    for (const reference of references) this.store.runtime.materials.assertPendingPersistable(reference);
    for (const reference of references) {
      // Keep the draft pending until its original is durable too. A file write
      // failure must still appear in the normal unsaved-draft close handshake.
      this.store.runtime.materials.persistPending(reference);
    }
    this.store.kernel.write(() => {
      // A model/control failure may occur before the conversation row exists.
      // Explicit saving must make this draft discoverable on restart without
      // persisting the failed user message or its text as a session title.
      if (id !== 'new' && !entry.draft.submission) this.store.session(id, '未发送草稿');
      this.store.putMeta('draft:' + id, entry.draft);
    });
    this.pending.delete(id);
  }
  clear(id?: string) {
    const removed = id ? [...this.pending].filter(([key]) => key === id) : [...this.pending];
    if (id) this.pending.delete(id); else this.pending.clear();
    for (const [key, entry] of removed) for (const reference of materials(entry.draft)) this.store.runtime.materials.releasePending(reference, key);
  }
  submissions() {
    const ids = new Set([...this.pending.keys(), ...this.store.db.prepare("SELECT key FROM meta WHERE key LIKE 'draft:submission-%'").all().map(row => String(row.key).slice('draft:'.length))]);
    return [...ids].filter(id => /^submission-[a-f0-9-]{36}$/.test(id)).flatMap(id => {
      const entry = this.pending.get(id);
      if (entry && entry.epoch !== this.store.kernel.epoch) return [];
      const draft = this.get(id);
      return draft.submission?.id && id === 'submission-' + draft.submission.id ? [{ id, draft }] : [];
    }).slice(0, 16);
  }
  private submissionMatches(message: Message, draft: Draft): boolean {
    if (message.role !== 'user' || !message.submissionId || !message.authoredSource || message.authoredSource.eventId !== message.id) return false;
    if (draft.submission?.id !== message.submissionId || Array.from(message.content).slice(0, message.authoredSource.displayEnd).join('') !== draft.text
      || message.authoredSource.sha256 !== createHash('sha256').update(draft.text).digest('hex')) return false;
    const expected = getDraftAttachments(draft), actual = message.attachments ? [...message.attachments]
      : message.image ? [{ ...message.image, sourceEventId: message.id }] : [];
    const document = draft.submission.materialDocument;
    if (canonical(document) !== canonical(message.submittedMaterialDocument)) return false;
    if (document && !expected.some(item => item.kind === 'text' && item.resource?.resourceId === document.resourceId && item.resource.sha256 === document.sha256)) {
      const first = actual[0];
      // A durably bound document keeps its original source and adds no event.
      if (first?.kind === 'text' && first.resource?.resourceId === document.resourceId && first.resource.sha256 === document.sha256) actual.shift();
      else if (message.content !== draft.text && !message.content.includes('\n\n[已附上文件：')) return false;
    }
    if (actual.length !== expected.length || expected.some((item, index) => {
      const value = actual[index];
      if (!value || item.kind !== value.kind || item.name !== value.name || item.attachmentId !== value.attachmentId) return true;
      if (item.kind === 'image') return value.kind !== 'image' || item.dataUrl !== value.dataUrl || item.mimeType !== value.mimeType || item.width !== value.width || item.height !== value.height
        || value.sourceEventId !== message.id + (item.attachmentId ? ':image:' + item.attachmentId : '');
      if (value.kind !== 'text' || item.text !== value.text || item.resource && canonical(item.resource) !== canonical(value.resource)) return true;
      return value.sourceEventId !== message.id + ':file' + (item.attachmentId ? ':' + item.attachmentId : '');
    })) return false;
    return true;
  }
  admitSubmission(message: Message) {
    if (!message.submissionId) return;
    const id = 'submission-' + message.submissionId;
    if (this.submissionMatches(message, this.get(id))) this.discardSubmission(id);
  }
  /** Recovery uses exactly the same immutable snapshot predicate as the live
   * handoff. A reused transport UUID alone never hides another held draft. */
  submissionAdmission(id: string) {
    const draft = this.get(id);
    if (!draft.submission || id !== 'submission-' + draft.submission.id) return;
    const rows = this.store.db.prepare(`SELECT m.payload FROM messages m JOIN h_evidence e ON e.id=m.id
      WHERE m.role='user' AND json_extract(m.payload,'$.submissionId')=? AND json_type(m.payload,'$.authoredSource')='object'
      AND e.status='active' ORDER BY m.created_at DESC LIMIT 16`).all(draft.submission.id);
    for (const row of rows) {
      const message = JSON.parse(String(row.payload)) as Message;
      if (this.submissionMatches(message, draft)) return { sessionId: message.sessionId, userMessageId: message.id };
    }
  }
  /** A real authored event has crossed admission. Its Message now owns the
   * originals; removing this transport snapshot grants no additional access. */
  discardSubmission(id: string) {
    if (!/^submission-[a-f0-9-]{36}$/.test(id)) return;
    const draft = this.get(id);
    if (!draft.submission || id !== 'submission-' + draft.submission.id) return;
    const references = materials(draft);
    this.pending.delete(id);
    this.store.kernel.write(() => {
      this.store.db.prepare('DELETE FROM meta WHERE key=?').run('draft:' + id);
      this.store.kernel.afterCommit(() => {
        for (const reference of references) this.store.runtime.materials.releasePersistedDraft(reference, id);
      });
    });
    for (const reference of references) this.store.runtime.materials.releasePending(reference, id);
  }
  unsaved() { return [...this.pending].filter(([, value]) => value.draft.text || getDraftAttachments(value.draft).length).map(([id]) => ({ id, ...this.info(id) })); }
}
