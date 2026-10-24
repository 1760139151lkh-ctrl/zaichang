import { createHash, randomUUID } from 'node:crypto';
import { HarnessError, type ScopeHandle } from '../../shared/harness';
import {
  noteCreateSchema,
  noteDraftInputSchema,
  noteHistorySchema,
  noteListSchema,
  noteReadSchema,
  noteStateSchema,
  noteUndoSchema,
  noteUpdateSchema,
  noteQuoteReferenceSchema,
  noteQuoteAddress,
  notebookQuoteReferenceSchema,
  type NotebookQuote,
  type NoteDocument,
  type NoteHistory,
  type NoteList,
  type NoteMutation,
  type NotePage,
  type NoteVersion,
  type NoteDraft,
  type NoteDraftResult,
  type NoteQuote,
  type NoteQuoteReference,
} from '../../shared/notes';
import type { KernelRepository } from '../storage/repository';
import { materialQuoteAddress, type MaterialQuoteReference, type MaterialNotes } from '../../shared/materials';

type VersionRecord = NoteDocument & { operation: NoteVersion['operation']; restoredFrom?: number };
type Origin = { via: 'notebook' | 'conversation'; eventId?: string; material?: NoteDocument['source']['material']; notebook?: NoteDocument['source']['notebook']; conversation?: NoteDocument['source']['conversation']; referenceOnly?: true };
export interface NoteChange {
  id: string;
  revision: number;
  state: NoteDocument['state'];
  operation: NoteVersion['operation'];
  at: string;
  sourceId: 'notes:self';
}
const parse = (row: Record<string, unknown> | undefined) =>
  row ? (JSON.parse(String(row.payload)) as VersionRecord) : undefined;
const digest = (title: string, body: string) =>
  createHash('sha256').update(JSON.stringify({ title, body })).digest('hex');

/** User-owned documents, separate from extracted memory and local calendar actions.
 * All revisions and their current row commit in the existing kernel transaction. */
export class NotesService {
  private listeners = new Set<(change: NoteChange) => void>();
  constructor(private repo: KernelRepository) {
    repo.write(() => {
      repo.db.exec(`CREATE TABLE IF NOT EXISTS h_notes(
        id TEXT PRIMARY KEY,owner TEXT NOT NULL,workspace TEXT NOT NULL,revision INTEGER NOT NULL,
        state TEXT NOT NULL,updated_at TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS h_notes_owner ON h_notes(owner,workspace,state,updated_at);
        CREATE TABLE IF NOT EXISTS h_note_versions(
          note_id TEXT NOT NULL REFERENCES h_notes(id) ON DELETE CASCADE,revision INTEGER NOT NULL,payload TEXT NOT NULL,
          PRIMARY KEY(note_id,revision));
        CREATE TABLE IF NOT EXISTS h_note_operations(
          event_id TEXT NOT NULL,fingerprint TEXT NOT NULL,note_id TEXT NOT NULL REFERENCES h_notes(id) ON DELETE CASCADE,
          PRIMARY KEY(event_id,fingerprint));
        CREATE TABLE IF NOT EXISTS h_note_drafts(
          owner TEXT NOT NULL,workspace TEXT NOT NULL,draft_key TEXT NOT NULL,revision INTEGER NOT NULL,
          base_revision INTEGER,updated_at TEXT NOT NULL,payload TEXT NOT NULL,
          PRIMARY KEY(owner,workspace,draft_key));`);
    });
  }
  onChanged(callback: (change: NoteChange) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /** Unfinished notebook writing belongs to this same native notebook owner.
   * Drafts are excluded from model tools, note versions, search, and export. */
  nativeDraft(raw: unknown): NoteDraftResult {
    const input = noteDraftInputSchema.parse(raw), epoch = this.repo.epoch;
    const { principalId: owner, workspaceId: workspace } = this.repo.identity;
    const rowFor = (key: string) => this.repo.db.prepare('SELECT payload FROM h_note_drafts WHERE owner=? AND workspace=? AND draft_key=?').get(owner, workspace, key);
    const parseDraft = (row: ReturnType<typeof rowFor>) => row ? JSON.parse(String(row.payload)) as NoteDraft : undefined;
    const current = 'key' in input ? parseDraft(rowFor(input.key)) : undefined;
    if (input.operation === 'list') {
      const rows = this.repo.db.prepare(`SELECT draft_key,revision,base_revision,updated_at FROM h_note_drafts d
        WHERE owner=? AND workspace=? AND (draft_key='new' OR EXISTS(SELECT 1 FROM h_notes n
          WHERE n.id=d.draft_key AND n.owner=d.owner AND n.workspace=d.workspace AND n.state='active')) ORDER BY updated_at DESC`).all(owner, workspace);
      return { epoch, status: 'current', items: rows.map(row => ({ key: String(row.draft_key), revision: Number(row.revision),
        ...(row.base_revision === null ? {} : { baseRevision: Number(row.base_revision) }), updatedAt: String(row.updated_at) })) };
    }
    if (input.key !== 'new') {
      const note = this.current(input.key);
      if (note.state !== 'active') throw new HarnessError('note_draft_closed', '这页已经收起来了，没有从旧草稿接回正文。');
    }
    if (input.operation === 'read') return { epoch, status: 'current', ...(current ? { draft: current } : {}) };
    return this.repo.write(() => {
      if (input.expectedEpoch !== this.repo.epoch) throw new HarnessError('note_draft_boundary', '笔记的本机范围刚有变化，刚写的字还在眼前，请重新打开后再收好。');
      const now = parseDraft(rowFor(input.key));
      if ((now?.revision || 0) !== input.expectedDraftRevision) return { epoch, status: 'conflict', ...(now ? { draft: now } : {}) };
      if (input.key !== 'new' && this.current(input.key).state !== 'active')
        throw new HarnessError('note_draft_closed', '这页已经收起来了，没有从旧草稿接回正文。');
      if (input.operation === 'discard') {
        this.repo.db.prepare('DELETE FROM h_note_drafts WHERE owner=? AND workspace=? AND draft_key=? AND revision=?')
          .run(owner, workspace, input.key, input.expectedDraftRevision);
        return { epoch, status: 'discarded' };
      }
      if (input.key !== 'new') {
        if (input.baseRevision === undefined) throw new HarnessError('note_draft_version', '这页草稿需要保留原来那一版的位置。');
        this.version(input.key, input.baseRevision);
      }
      const draft: NoteDraft = { key: input.key, revision: input.expectedDraftRevision + 1, title: input.title, body: input.body,
        ...(input.baseRevision ? { baseRevision: input.baseRevision } : {}), updatedAt: this.repo.clock.now() };
      this.repo.db.prepare(`INSERT INTO h_note_drafts VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(owner,workspace,draft_key) DO UPDATE SET revision=excluded.revision,base_revision=excluded.base_revision,
        updated_at=excluded.updated_at,payload=excluded.payload`).run(owner, workspace, draft.key, draft.revision,
        draft.baseRevision || null, draft.updatedAt, JSON.stringify(draft));
      return { epoch, status: 'saved', draft };
    });
  }
  private notify(change: NoteChange) {
    // Delivery failure cannot turn a committed document into a failed save.
    // The same transaction queued note_attention in the existing durable outbox.
    for (const callback of this.listeners) {
      try {
        const result = callback(change) as unknown;
        if (result && typeof (result as PromiseLike<unknown>).then === 'function')
          void Promise.resolve(result).catch(() => undefined);
      } catch {
        /* The durable consumer will retry this committed revision. */
      }
    }
  }
  /** Tools supply their real scope; native owner UI omits it. Never mint a host
   * scope for a model call, since that would widen its source restrictions. */
  private allowed(scope?: ScopeHandle, write = false, create = false) {
    if (!scope) return;
    if (!create && this.repo.hasFence('notes:self', 'notes:self'))
      throw new HarnessError('notes_forbidden', '这份记事本目前不在助手可读取的来源里。');
    const data = this.repo.scope(scope),
      identity = this.repo.identity;
    if (
      data.principalId !== identity.principalId ||
      data.workspaceId !== identity.workspaceId ||
      data.subjectId !== identity.principalId ||
      data.worldId !== 'real' ||
      data.audience !== 'self' ||
      !data.grants.includes(write ? 'local:write' : 'evidence:read') ||
      (!create && !data.sources.includes('notes:self'))
    )
      throw new HarnessError('notes_forbidden', '当前资料范围没有准入这份记事本。');
    if (write && (data.child || data.retention === 'session_only'))
      throw new HarnessError('notes_forbidden', '当前会话不允许写入长期记事本。');
  }
  private current(id: string) {
    const note = parse(
      this.repo.db
        .prepare('SELECT payload FROM h_notes WHERE id=? AND owner=? AND workspace=?')
        .get(id, this.repo.identity.principalId, this.repo.identity.workspaceId),
    );
    if (!note) throw new HarnessError('note_missing', '这条笔记已不存在。');
    return note;
  }
  private version(id: string, revision: number) {
    this.current(id);
    const note = parse(
      this.repo.db
        .prepare('SELECT payload FROM h_note_versions WHERE note_id=? AND revision=?')
        .get(id, revision),
    );
    if (!note) throw new HarnessError('note_version_missing', '这个版本已不存在。');
    return note;
  }
  private document(record: VersionRecord): NoteDocument {
    const { operation: _, restoredFrom: __, ...note } = record;
    const document = structuredClone(note);
    // A kept reference owns only its address and the person's independent
    // writing. Older anchor moves also stored the original file name; do not
    // revive that source-derived label through history, export or model reads.
    if (document.source.referenceOnly && document.source.material) {
      document.source.material.name = '原来的资料';
      document.attachmentLocators = document.attachmentLocators.map(locator => ({ ...locator, name: '原来的资料' }));
    }
    return document;
  }
  private put(note: VersionRecord) {
    this.repo.db
      .prepare(
        `INSERT INTO h_notes VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      revision=excluded.revision,state=excluded.state,updated_at=excluded.updated_at,title=excluded.title,body=excluded.body,payload=excluded.payload`,
      )
      .run(
        note.id,
        note.ownerId,
        note.workspaceId,
        note.revision,
        note.state,
        note.updatedAt,
        note.title,
        note.body,
        JSON.stringify(note),
      );
    this.repo.db
      .prepare('INSERT INTO h_note_versions VALUES(?,?,?)')
      .run(note.id, note.revision, JSON.stringify(note));
    if (note.state === 'deleted') this.repo.db.prepare('DELETE FROM h_note_drafts WHERE owner=? AND workspace=? AND draft_key=?')
      .run(note.ownerId, note.workspaceId, note.id);
    // A changed note triggers review; it must not silently cancel an independent
    // accepted calendar entry through the generic privacy invalidation path.
    const change: NoteChange = {
      id: note.id,
      revision: note.revision,
      state: note.state,
      operation: note.operation,
      at: note.updatedAt,
      sourceId: 'notes:self',
    };
    this.repo.outbox('note_attention', JSON.stringify([note.id, note.revision]));
    this.repo.afterCommit(() => this.notify(change));
    return this.document(note);
  }
  list(raw: unknown = {}, scope?: ScopeHandle): NoteList {
    this.allowed(scope);
    const input = noteListSchema.parse(raw),
      { principalId, workspaceId } = this.repo.identity;
    if (scope && input.state === 'deleted')
      throw new HarnessError('notes_forbidden', '回收站只在本机记事本中查看和恢复。');
    // instr keeps user search literal (%, _, quotes and CJK are not query syntax).
    const excluded = scope ? [...new Set(this.repo.fences().filter(fence => fence.kind === 'delete')
      .flatMap(fence => [...fence.objectIds, ...fence.sourceIds]).filter(value => /^note-[a-f0-9-]{36}$/.test(value)))] : [];
    const condition =
      "owner=? AND workspace=? AND state=? AND (?='' OR instr(lower(title),lower(?))>0 OR instr(lower(body),lower(?))>0)"
      + (scope ? ' AND id NOT IN (SELECT value FROM json_each(?))' : '');
    const params = [principalId, workspaceId, input.state, input.query, input.query, input.query, ...(scope ? [JSON.stringify(excluded)] : [])];
    const total = Number(
      this.repo.db.prepare('SELECT count(*) AS n FROM h_notes WHERE ' + condition).get(...params)?.n || 0,
    );
    const items = this.repo.db
      .prepare(
        'SELECT payload FROM h_notes WHERE ' + condition + ' ORDER BY updated_at DESC,id LIMIT ? OFFSET ?',
      )
      .all(...params, input.limit, input.offset)
      .map((row) => {
        const { body, ...note } = this.document(parse(row)!);
        const points = Array.from(body);
        return {
          ...note,
          preview: points.slice(0, 160).join('').replace(/\s+/g, ' '),
          bodyLength: points.length,
        };
      });
    return { items, total, offset: input.offset, hasMore: input.offset + items.length < total };
  }
  /** The native reader requests only active notes anchored to this exact
   * original. Full text and edits continue through the ordinary note owner. */
  forMaterial(resourceId: string, sha256: string, page?: number): MaterialNotes {
    const records = this.repo.db.prepare(`SELECT payload FROM h_notes
      WHERE owner=? AND workspace=? AND state='active'
      AND json_extract(payload,'$.source.material.resourceId')=?
      AND json_extract(payload,'$.source.material.sha256')=?
      AND (? IS NULL OR json_extract(payload,'$.source.material.page')=?)
      ORDER BY updated_at DESC,id LIMIT 101`).all(this.repo.identity.principalId, this.repo.identity.workspaceId,
        resourceId, sha256, page ?? null, page ?? null);
    return { items: records.slice(0, 100).map(row => {
      const note = parse(row)!, source = note.source.material!;
      return { id: note.id, revision: note.revision, title: note.title,
        preview: Array.from(note.body).slice(0, 160).join('').replace(/\s+/g, ' '), source: materialQuoteAddress(source) };
    }), hasMore: records.length > 100 };
  }
  read(raw: unknown, scope?: ScopeHandle): NotePage {
    this.allowed(scope);
    const input = noteReadSchema.parse(raw);
    if (scope && this.repo.hasFence(input.id, 'notes:self'))
      throw new HarnessError('notes_forbidden', '这页笔记目前不在助手可读取的来源里。');
    const current = this.current(input.id);
    if (scope && current.state === 'deleted')
      throw new HarnessError('note_deleted', '这条笔记已移入回收站。');
    const { body, ...note } = this.document(
      input.revision ? this.version(input.id, input.revision) : current,
    );
    const points = Array.from(body),
      offset = Math.min(input.offset, points.length),
      end = Math.min(points.length, offset + input.limit);
    const linked = note.source.referenceOnly ? note.source : undefined;
    let notebookCurrent = true;
    if (linked?.notebook) {
      try { this.quoteIdentity(scope, linked.notebook); }
      catch (error) { if (error instanceof HarnessError) notebookCurrent = false; else throw error; }
    }
    const originalRead: NotePage['originalRead'] = linked?.material ? {
      state: 'address_only',
      reference: { kind: 'material', reference: materialQuoteAddress(linked.material) },
      read: { tool: 'look_up', arguments: { source: 'capability', capability: 'materials.read', arguments: {
        resourceId: linked.material.resourceId, ...(linked.material.page ? { page: linked.material.page } : {}),
        offset: linked.material.start, limit: linked.material.end - linked.material.start } } },
      meaning: '这里保留了原文件这一段的地址，没有把原句复制进笔记正文；这次没有确认文件仍在或当前可读。需要解释时，回原资料owner核同一文件哈希、页内位置和当前范围，再读这一段。文件不在时，本人另写的字仍在这页；不能拿另一份同名文件冒充原句。',
    } : linked?.notebook && !notebookCurrent ? { state: 'changed', reference: { kind: 'notebook', reference: linked.notebook },
      meaning: '原句所在的笔记已经改版或收起，旧书签现在不能读作当前原句。这次只交付本页自己写的正文；旧地址没有恢复历史正文的许可，也不能换成新版本后说是原来的话。',
    } : linked?.notebook ? { state: 'address_only', reference: { kind: 'notebook', reference: linked.notebook },
      read: { tool: 'manage_note', arguments: { operation: 'read', input: { id: linked.notebook.id, revision: linked.notebook.revision,
        offset: linked.notebook.start, limit: linked.notebook.end - linked.notebook.start } } },
      meaning: '原句属于另一页笔记的这个确切版本；这里的正文是本人另外写的想法。原句未随这次读取展开，需要时仍回原owner核版本和范围。',
    } : linked?.conversation ? { state: 'address_only', reference: { kind: 'conversation', reference: linked.conversation },
      read: { tool: 'read_evidence', arguments: { id: linked.conversation.messageId, offset: linked.conversation.start,
        limit: linked.conversation.end - linked.conversation.start,
        ...(linked.conversation.contentVersion === undefined ? {} : { expectedVersion: linked.conversation.contentVersion }) } },
      meaning: '这里只保留原消息这一段的地址，笔记正文只含本人另外写的字；这次没有展开或确认原消息仍可读。需要解释时先按当前许可读这一段，并核原contentVersion与哈希；删除、范围、位置或版本变化时，不能从本页补出旧原句，也不能把当前不同的字冒充这句旧话。',
    } : undefined;
    return {
      note,
      body: points.slice(offset, end).join(''),
      offset,
      end,
      total: points.length,
      hasMore: end < points.length,
      ...(originalRead ? { originalRead } : {}),
    };
  }
  /** Only current ownership/version/length metadata is inspected here. A
   * notebook click does not authorize the model to read its body. */
  quoteIdentity(scope: ScopeHandle | undefined, raw: NoteQuoteReference) {
    this.allowed(scope);
    const reference = noteQuoteReferenceSchema.parse(raw);
    if (scope && this.repo.hasFence(reference.id, 'notes:self'))
      throw new HarnessError('notes_forbidden', '这页笔记目前不在助手可读取的来源里。');
    const row = this.repo.db.prepare(`SELECT revision,state,json_extract(payload,'$.sha256') AS hash,
      note_codepoint_length(body) AS body_length FROM h_notes WHERE id=? AND owner=? AND workspace=?`)
      .get(reference.id, this.repo.identity.principalId, this.repo.identity.workspaceId);
    if (!row || row.state !== 'active')
      throw new HarnessError('note_quote_missing', '这页笔记已经收起或移除了，先回笔记看看。');
    if (row.revision !== reference.revision || row.hash !== reference.sha256)
      throw new HarnessError('note_quote_changed', '这页笔记刚改过，请重新选一下想聊的文字。');
    if (typeof row.body_length !== 'number' || reference.end > row.body_length)
      throw new HarnessError('note_quote_range', '这段文字已不在原来的位置，请重新选一下。');
    return { origin: 'user_note' as const, reference };
  }
  quote(raw: NoteQuoteReference, scope?: ScopeHandle): NoteQuote {
    const { reference } = this.quoteIdentity(scope, raw);
    const page = this.read({ id: reference.id, revision: reference.revision,
      offset: reference.start, limit: reference.end - reference.start }, scope);
    if (page.note.sha256 !== reference.sha256 || page.offset !== reference.start || page.end !== reference.end || !page.body.trim())
      throw new HarnessError('note_quote_range', '这段文字已不在原来的位置，请重新选一下。');
    this.quoteIdentity(scope, reference);
    return { ...noteQuoteAddress(reference), title: page.note.title, text: page.body };
  }
  /** Compatibility with existing typed notebook addresses, through the same
   * owner and metadata-only identity gate used by the current notebook. */
  notebookQuoteIdentity(raw: unknown, scope?: ScopeHandle) {
    const reference = notebookQuoteReferenceSchema.parse(raw);
    const { reference: current } = this.quoteIdentity(scope, { id: reference.noteId,
      revision: reference.revision, sha256: reference.sha256, start: reference.start, end: reference.end });
    return { reference, proof: { id: current.id, revision: current.revision, sha256: current.sha256,
      start: current.start, end: current.end } };
  }
  notebookQuote(raw: unknown, scope?: ScopeHandle): NotebookQuote {
    const { reference } = this.notebookQuoteIdentity(raw, scope);
    const selected = this.quote({ id: reference.noteId, revision: reference.revision,
      sha256: reference.sha256, start: reference.start, end: reference.end }, scope);
    return { reference, title: selected.title, text: selected.text };
  }
  create(raw: unknown, scope?: ScopeHandle, origin: Origin = { via: 'notebook' }): NoteMutation {
    this.allowed(scope, true, true);
    const input = noteCreateSchema.parse(raw),
      now = this.repo.clock.now(),
      { principalId, workspaceId } = this.repo.identity;
    const sha256 = digest(input.title, input.body),
      // Idempotency covers the exact operation. Different titles may be two
      // deliberately separate notes even when their original text is identical.
      fingerprint = sha256,
      operationId = origin.via === 'conversation' ? origin.eventId : undefined;
    return this.repo.write(() => {
      const previous = operationId
        ? this.repo.db
            .prepare('SELECT note_id FROM h_note_operations WHERE event_id=? AND fingerprint=?')
            .get(operationId, fingerprint)
        : undefined;
      if (previous) {
        if (scope && !this.repo.scope(scope).sources.includes('notes:self'))
          throw new HarnessError(
            'notes_forbidden',
            '这次请求此前已保存笔记；当前范围没有准入重新读取，没有重复创建。',
          );
        const current = this.current(String(previous.note_id));
        if (current.state === 'deleted')
          throw new HarnessError('note_deleted', '此前保存的笔记已移入回收站，重试没有恢复它。');
        return { status: 'saved', note: this.document(current), reused: true };
      }
      const note = this.put({
        id: 'note-' + randomUUID(),
        revision: 1,
        title: input.title,
        body: input.body,
        state: 'active',
        createdAt: now,
        updatedAt: now,
        ownerId: principalId,
        workspaceId,
        subjectId: null,
        source: {
          kind: 'user_note',
          via: origin.via,
          ...(origin.eventId ? { eventId: origin.eventId } : {}),
          ...(origin.material ? { material: structuredClone(origin.material) } : {}),
          ...(origin.notebook ? { notebook: structuredClone(origin.notebook) } : {}),
          ...(origin.conversation ? { conversation: structuredClone(origin.conversation) } : {}),
          ...(origin.referenceOnly ? { referenceOnly: true } : {}),
        },
        effectiveAt: null,
        coverage: 'document_only',
        purposes: ['user_notebook'],
        attachmentLocators: origin.material ? [{ resourceId: origin.material.resourceId, name: origin.material.name }] : [],
        sha256,
        operation: 'create',
      });
      if (operationId)
        this.repo.db
          .prepare('INSERT INTO h_note_operations VALUES(?,?,?)')
          .run(operationId, fingerprint, note.id);
      return { status: 'saved', note };
    });
  }
  private change(
    id: string,
    expectedRevision: number,
    apply: (current: VersionRecord) => VersionRecord,
    scope?: ScopeHandle,
  ): NoteMutation {
    return this.repo.write(() => {
      const current = this.current(id);
      if (scope && current.state === 'deleted')
        throw new HarnessError('note_deleted', '这条笔记已移入回收站，请在本机记事本中恢复。');
      if (current.revision !== expectedRevision)
        return { status: 'conflict', current: this.document(current) };
      const next = apply(current);
      if (next === current) return { status: 'saved', note: this.document(current) };
      return {
        status: 'saved',
        note: this.put({
          ...next,
          revision: current.revision + 1,
          updatedAt: this.repo.clock.now(),
          sha256: digest(next.title, next.body),
        }),
        previousRevision: current.revision,
      };
    });
  }
  update(raw: unknown, scope?: ScopeHandle): NoteMutation {
    this.allowed(scope, true);
    const input = noteUpdateSchema.parse(raw);
    return this.change(
      input.id,
      input.expectedRevision,
      (current) => {
        if (current.state === 'deleted') throw new HarnessError('note_deleted', '请先恢复这条笔记再修改。');
        return current.title === input.title && current.body === input.body
          ? current
          : { ...current, title: input.title, body: input.body, operation: 'edit', restoredFrom: undefined };
      },
      scope,
    );
  }
  /** Called only after MaterialsService has re-read both source addresses.
   * Moving an anchor never replaces the independently edited notebook body. */
  moveMaterialSource(id: string, expectedRevision: number, from: MaterialQuoteReference,
    source: MaterialQuoteReference & { name: string }): NoteMutation {
    return this.change(id, expectedRevision, current => {
      if (current.state !== 'active' || !current.source.material
        || JSON.stringify(materialQuoteAddress(current.source.material)) !== JSON.stringify(materialQuoteAddress(from))
        || from.resourceId !== source.resourceId || from.sha256 !== source.sha256)
        throw new HarnessError('material_note_changed', '这条笔记的出处有了变化，刚才的试放没有覆盖它。');
      if (JSON.stringify(materialQuoteAddress(from)) === JSON.stringify(materialQuoteAddress(source))) return current;
      const name = current.source.referenceOnly ? '原来的资料' : source.name;
      return { ...current, source: { ...current.source, material: { ...structuredClone(source), name } },
        attachmentLocators: [{ resourceId: source.resourceId, name }], operation: 'edit', restoredFrom: undefined };
    });
  }
  changeState(raw: unknown, scope?: ScopeHandle): NoteMutation {
    this.allowed(scope, true);
    const input = noteStateSchema.parse(raw);
    return this.change(
      input.id,
      input.expectedRevision,
      (current) =>
        current.state === input.state
          ? current
          : {
              ...current,
              state: input.state,
              deletedAt: input.state === 'deleted' ? this.repo.clock.now() : undefined,
              operation: input.state === 'deleted' ? 'delete' : 'restore',
              restoredFrom: undefined,
            },
      scope,
    );
  }
  undo(raw: unknown, scope?: ScopeHandle): NoteMutation {
    this.allowed(scope, true);
    const input = noteUndoSchema.parse(raw);
    return this.change(
      input.id,
      input.expectedRevision,
      (current) => {
        const target = this.version(input.id, input.targetRevision);
        return {
          ...current,
          title: target.title,
          body: target.body,
          state: target.state,
          deletedAt: target.state === 'deleted' ? this.repo.clock.now() : undefined,
          operation: 'undo',
          restoredFrom: target.revision,
        };
      },
      scope,
    );
  }
  history(raw: unknown, scope?: ScopeHandle): NoteHistory {
    this.allowed(scope);
    const input = noteHistorySchema.parse(raw);
    if (scope && this.repo.hasFence(input.id, 'notes:self'))
      throw new HarnessError('notes_forbidden', '这页笔记目前不在助手可读取的来源里。');
    const current = this.current(input.id);
    if (scope && current.state === 'deleted')
      throw new HarnessError('note_deleted', '这条笔记已移入回收站。');
    const rows = this.repo.db
      .prepare('SELECT payload FROM h_note_versions WHERE note_id=? ORDER BY revision DESC LIMIT ? OFFSET ?')
      .all(input.id, input.limit, input.offset);
    const items = rows.map((row) => {
      const note = parse(row)!;
      return {
        revision: note.revision,
        sha256: note.sha256,
        title: note.title,
        state: note.state,
        updatedAt: note.updatedAt,
        operation: note.operation,
        ...(note.restoredFrom ? { restoredFrom: note.restoredFrom } : {}),
      };
    });
    return { items, total: current.revision, hasMore: input.offset + items.length < current.revision };
  }
  /** Used only by the existing all-data deletion/export paths, never a model tool. */
  clear() {
    this.repo.write(() => {
      this.repo.db
        .prepare('DELETE FROM h_notes WHERE owner=? AND workspace=?')
        .run(this.repo.identity.principalId, this.repo.identity.workspaceId);
      this.repo.db.prepare('DELETE FROM h_note_drafts WHERE owner=? AND workspace=?')
        .run(this.repo.identity.principalId, this.repo.identity.workspaceId);
    });
  }
  export(): NoteDocument[] {
    return this.repo.db
      .prepare(
        "SELECT payload FROM h_notes WHERE owner=? AND workspace=? AND state='active' ORDER BY updated_at,id",
      )
      .all(this.repo.identity.principalId, this.repo.identity.workspaceId)
      .map((row) => this.document(parse(row)!));
  }
}
