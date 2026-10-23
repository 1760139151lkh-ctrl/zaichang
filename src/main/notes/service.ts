import { createHash, randomUUID } from 'node:crypto';
import { HarnessError, type ScopeHandle } from '../../shared/harness';
import {
  noteCreateSchema,
  noteHistorySchema,
  noteListSchema,
  noteReadSchema,
  noteStateSchema,
  noteUndoSchema,
  noteUpdateSchema,
  notebookQuoteReferenceSchema,
  type NotebookQuote,
  type NoteDocument,
  type NoteHistory,
  type NoteList,
  type NoteMutation,
  type NotePage,
  type NoteVersion,
} from '../../shared/notes';
import type { KernelRepository } from '../storage/repository';
import { materialQuoteAddress, type MaterialNotes } from '../../shared/materials';

type VersionRecord = NoteDocument & { operation: NoteVersion['operation']; restoredFrom?: number };
type Origin = { via: 'notebook' | 'conversation'; eventId?: string; material?: NoteDocument['source']['material'] };
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
          PRIMARY KEY(event_id,fingerprint));`);
    });
  }
  onChanged(callback: (change: NoteChange) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
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
    return structuredClone(note);
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
    return {
      note,
      body: points.slice(offset, end).join(''),
      offset,
      end,
      total: points.length,
      hasMore: end < points.length,
    };
  }
  /** A native selection points at the current saved revision, never a copy
   * of the textarea or a historical Scene with a fabricated message address. */
  quoteIdentity(raw: unknown, scope?: ScopeHandle) {
    this.allowed(scope);
    const reference = notebookQuoteReferenceSchema.parse(raw), note = this.current(reference.noteId);
    if (note.state !== 'active' || note.revision !== reference.revision || note.sha256 !== reference.sha256
      || reference.end > Array.from(note.body).length || scope && this.repo.hasFence(note.id, 'notes:self'))
      throw new HarnessError('notebook_quote_changed', '这页笔记后来改过，请回到现在的内容重新选这一段。');
    return { reference, proof: { id: note.id, revision: note.revision, sha256: note.sha256,
      start: reference.start, end: reference.end } };
  }
  quote(raw: unknown, scope?: ScopeHandle): NotebookQuote {
    const { reference } = this.quoteIdentity(raw, scope);
    const page = this.read({ id: reference.noteId, revision: reference.revision,
      offset: reference.start, limit: reference.end - reference.start }, scope);
    if (page.offset !== reference.start || page.end !== reference.end || !page.body.trim())
      throw new HarnessError('notebook_quote_empty', '先选一小段想接着聊的笔记。');
    this.quoteIdentity(reference, scope);
    return { reference, title: page.note.title || '没有标题的一页', text: page.body };
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
    this.repo.write(() =>
      this.repo.db
        .prepare('DELETE FROM h_notes WHERE owner=? AND workspace=?')
        .run(this.repo.identity.principalId, this.repo.identity.workspaceId),
    );
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
