import { createHash, randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { HarnessError } from '../shared/harness';
import { LOCAL_SEARCH_LIMITS, localSearchLocatorSchema, localSearchSchema,
  type LocalSearchHit, type LocalSearchKind, type LocalSearchLocator, type LocalSearchPage, type LocalSearchWarning } from '../shared/search';
import type { MaterialItem } from '../shared/materials';
import type { Message } from '../shared/types';
import type { Store } from './store';
import { parsePdf, type PdfResult } from './materials/pdf';

type PdfReader = (bytes: Buffer, request: { operation: 'read'; page: number }, signal: AbortSignal) => Promise<PdfResult>;
type SearchState = {
  query: string; kinds: LocalSearchKind[]; epoch: number; policy: number; generation: number; expires: number;
  messageBefore: number; noteBefore: number; done: Set<LocalSearchKind>; nextKind: number;
  materials: MaterialItem[]; materialIndex: number; materialPage: number; materialTitleChecked: boolean;
  warnings: Map<string, LocalSearchWarning>;
};
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const messageDigest = (title: string, content: string) => digest(JSON.stringify([title, content]));
const kinds: LocalSearchKind[] = ['conversation', 'note', 'material'];
const unavailable = () => new HarnessError('search_source_changed', '这段内容已经变化或不在这里了，请重新找一次。');

/** Literal search, with stable code-point positions even for case expansions. */
function excerpt(text: string, query: string) {
  const needle = query.toLowerCase(), at = text.toLowerCase().indexOf(needle);
  if (at < 0) return null;
  // Keep only the small excerpt, rather than a multi-million-entry offset map
  // for every long document. Lowercase expansion still counts the source points.
  let foldedUnits = 0, pointIndex = 0, offset = 0, end = 0;
  for (const point of text) {
    const next = foldedUnits + point.toLowerCase().length;
    if (at >= foldedUnits && at < next) offset = pointIndex;
    if (at + needle.length <= next) { end = pointIndex + 1; break; }
    foldedUnits = next; pointIndex++;
  }
  const start = Math.max(0, offset - Math.min(50, Math.max(0, LOCAL_SEARCH_LIMITS.snippet - (end - offset))));
  const stop = Math.max(start + LOCAL_SEARCH_LIMITS.snippet, end);
  let slice = '', index = 0, more = false;
  for (const point of text) {
    if (index >= stop) { more = true; break; }
    if (index++ >= start) slice += point;
  }
  const prefix = start ? '…' : '', suffix = more ? '…' : '';
  return { snippet: prefix + slice + suffix,
    match: { start: offset - start + (start ? 1 : 0), end: end - start + (start ? 1 : 0) }, offset, end };
}
function decoded(bytes: Buffer) {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}

/** Native owner operation only. Never register this service as an agent tool.
 * There is no model call, background index, query log or retained source body.
 * Cursor state contains IDs/progress only and is discarded at privacy barriers. */
export class LocalSearchService {
  private cursors = new Map<string, SearchState>();
  private active?: AbortController;
  private generation = 0;
  constructor(private store: Store, private readPdf: PdfReader = parsePdf) {
    store.runtime.policy.onBarrier(() => this.cancel());
    store.kernel.onPrivacyCleanup(() => this.cancel());
  }
  cancel() {
    this.generation++;
    this.active?.abort(); this.active = undefined;
    this.cursors.clear();
  }
  private privateView() {
    if (this.store.runtime.presentation.public)
      throw new HarnessError('search_private_view', '回到自己的空间后，就可以找这些内容了。');
  }
  private current(state: SearchState, signal: AbortSignal) {
    signal.throwIfAborted(); this.privateView();
    if (state.epoch !== this.store.kernel.epoch || state.policy !== this.store.kernel.policyRevision || state.generation !== this.generation)
      throw new HarnessError('search_scope_changed', '资料范围刚刚变了，请重新找一次。');
  }
  private canReadEvidence() {
    const policy = this.store.runtime.policy;
    return policy.can(policy.hostScope({ infer: false }), 'evidence:read');
  }
  private newState(query: string, selected: LocalSearchKind[]): SearchState {
    const state: SearchState = { query, kinds: selected, epoch: this.store.kernel.epoch, policy: this.store.kernel.policyRevision,
      generation: this.generation, expires: Date.now() + 120_000, messageBefore: Number.MAX_SAFE_INTEGER, noteBefore: Number.MAX_SAFE_INTEGER,
      done: new Set(), nextKind: 0, materials: [], materialIndex: 0, materialPage: 1, materialTitleChecked: false, warnings: new Map() };
    // The local notebook has its own owner UI permission, independent of model
    // memory/inference. Material originals retain their existing evidence gate.
    if (!this.canReadEvidence()) {
      for (const kind of selected.filter(kind => kind !== 'note')) {
        state.done.add(kind);
        state.warnings.set(kind, { kind, code: 'unavailable', message: '这部分内容的读取范围已经关闭。' });
      }
    } else if (selected.includes('material')) state.materials = this.store.runtime.materials.nativeList();
    return state;
  }
  async search(raw: unknown): Promise<LocalSearchPage> {
    const input = localSearchSchema.parse(raw); this.privateView();
    let state: SearchState;
    if (input.cursor) {
      const previous = this.cursors.get(input.cursor);
      this.cursors.delete(input.cursor);
      if (!previous || previous.expires < Date.now() || previous.query !== input.query
        || input.kinds && JSON.stringify([...new Set(input.kinds)].sort()) !== JSON.stringify([...previous.kinds].sort()))
        throw new HarnessError('search_cursor_expired', '这次查找已经结束了，可以再找一次。');
      state = previous;
    } else {
      this.cancel();
      state = this.newState(input.query, [...new Set(input.kinds || kinds)]);
    }
    const controller = new AbortController();
    this.active?.abort(); this.active = controller;
    const items: LocalSearchHit[] = [];
    try {
      this.current(state, controller.signal);
      if (!input.query) return { items, nextCursor: null, complete: true, warnings: [], privacyEpoch: state.epoch, policyRevision: state.policy };
      // Each continuation visits bounded source units; all three kinds get a
      // turn, so a long transcript does not starve notebooks or documents.
      for (let scanned = 0, pdfPages = 0; scanned < 72 && items.length < input.limit && state.done.size < state.kinds.length; scanned++) {
        this.current(state, controller.signal);
        const kind = state.kinds[state.nextKind++ % state.kinds.length];
        if (state.done.has(kind)) continue;
        let hit: LocalSearchHit | null = null;
        if (kind === 'conversation') hit = this.nextMessage(state);
        if (kind === 'note') hit = this.nextNote(state);
        if (kind === 'material') {
          const next = state.materials[state.materialIndex];
          if (next?.mediaType === 'application/pdf' && ++pdfPages > 4) break;
          hit = await this.nextMaterial(state, controller.signal);
        }
        if (hit) items.push(hit);
        if (scanned % 6 === 5) await setImmediate();
      }
      this.current(state, controller.signal);
      const nextCursor = state.done.size < state.kinds.length ? randomUUID() : null;
      if (nextCursor) { state.expires = Date.now() + 120_000; this.cursors.set(nextCursor, state); }
      return { items, nextCursor, complete: !nextCursor && state.warnings.size === 0,
        warnings: [...state.warnings.values()], privacyEpoch: state.epoch, policyRevision: state.policy };
    } finally { if (this.active === controller) this.active = undefined; }
  }
  private message(id: string) {
    if (!this.canReadEvidence()) return null;
    const row = this.store.db.prepare('SELECT m.payload,m.content,s.title FROM messages m JOIN sessions s ON s.id=m.session_id WHERE m.id=?').get(id);
    if (!row) return null;
    const message = JSON.parse(String(row.payload)) as Message;
    const repo = this.store.kernel;
    if (message.retention === 'session_only' || this.store.conversationPolicy(message.sessionId)?.retention === 'session_only'
      || repo.hasFence(id, 'history:self')) return null;
    const evidence = this.store.db.prepare('SELECT owner,workspace,status,retain,sensitivity,source,expires_at FROM h_evidence WHERE id=?').get(id);
    if (message.role === 'user' && !evidence) return null;
    if (evidence && (evidence.owner !== repo.identity.principalId || evidence.workspace !== repo.identity.workspaceId
      || !['active', 'redacted'].includes(String(evidence.status)) || evidence.retain === 'session_only' || evidence.sensitivity === 'restricted'
      || evidence.expires_at && Date.parse(String(evidence.expires_at)) <= Date.parse(repo.clock.now())
      || repo.hasFence(id, String(evidence.source)))) return null;
    // A predicate-level deactivation stops inference, not the owner's access
    // to retained original text. Whole-source restrictions do stop this search.
    if (this.store.db.prepare("SELECT 1 FROM h_source_restrictions WHERE event_id=? AND predicate='*'").get(id)) return null;
    if (message.role === 'assistant') {
      const refs = [...message.contextReceipt?.providedEvidenceIds || [], ...message.contextReceipt?.providedSourceIds || []];
      for (const ref of refs) {
        if (repo.hasFence(ref) || this.store.db.prepare("SELECT 1 FROM h_source_restrictions WHERE event_id=? AND predicate='*'").get(ref)) return null;
        const source = this.store.db.prepare('SELECT status,source FROM h_evidence WHERE id=?').get(ref);
        if (source && source.status !== 'active') return null;
        const sourceId = String(source?.source || ref), policy = this.store.runtime.policy;
        const grant = sourceId === 'map:local' ? 'map:read' : sourceId === 'weather:open-meteo' ? 'weather:read'
          : sourceId === 'profile:self' ? 'memory:read' : sourceId.startsWith('campus:') ? 'campus:read' : 'evidence:read';
        if (policy.revoked().includes(grant)) return null;
        // Older campus receipts did not always retain a per-field permission.
        // Do not reuse their private text after a campus subdomain is revoked.
        if (sourceId.startsWith('campus:') && policy.revoked().some(value => value.startsWith('campus:'))) return null;
      }
      for (const attempt of message.contextReceipt?.toolAttempts || [])
        if (this.store.runtime.broker.describe(attempt.capability)?.requiredScopes.some(grant => this.store.runtime.policy.revoked().includes(grant))) return null;
    }
    const projected = this.store.runtime.presentation.message(message);
    if (!projected) return null;
    // Session titles may have been derived from a now-forgotten first message.
    // A surviving message must not reintroduce that text through its heading.
    const retiredTitleSource = this.store.db.prepare(`SELECT 1 FROM h_evidence WHERE owner=? AND workspace=?
      AND json_extract(payload,'$.sessionId')=? AND status IN ('deleted','redacted') LIMIT 1`)
      .get(repo.identity.principalId, repo.identity.workspaceId, message.sessionId);
    return { message: projected, title: retiredTitleSource ? '一段对话' : String(row.title), content: String(row.content) };
  }
  private nextMessage(state: SearchState): LocalSearchHit | null {
    const row = this.store.db.prepare(`SELECT m.rowid AS position,m.id FROM messages m JOIN sessions s ON s.id=m.session_id
      WHERE m.rowid<? AND (instr(lower(m.content),lower(?))>0 OR
        (instr(lower(s.title),lower(?))>0 AND m.rowid=(SELECT max(x.rowid) FROM messages x WHERE x.session_id=m.session_id)))
      ORDER BY m.rowid DESC LIMIT 1`).get(state.messageBefore, state.query, state.query);
    if (!row) { state.done.add('conversation'); return null; }
    state.messageBefore = Number(row.position);
    const current = this.message(String(row.id));
    if (!current) return null;
    const { message, title, content } = current, body = excerpt(content, state.query), found = body || excerpt(title, state.query);
    if (!found) return null;
    return { id: 'conversation:' + message.id, kind: 'conversation', title, snippet: found.snippet, match: found.match,
      updatedAt: message.createdAt, role: message.role,
      locator: { kind: 'conversation', sessionId: message.sessionId, messageId: message.id, contentHash: messageDigest(title, content),
        field: body ? 'body' : 'title', offset: found.offset, end: found.end } };
  }
  private nextNote(state: SearchState): LocalSearchHit | null {
    const repo = this.store.kernel;
    const row = this.store.db.prepare(`SELECT rowid AS position,id,title,body,revision,updated_at FROM h_notes
      WHERE owner=? AND workspace=? AND state='active' AND rowid<?
        AND (instr(lower(title),lower(?))>0 OR instr(lower(body),lower(?))>0) ORDER BY rowid DESC LIMIT 1`)
      .get(repo.identity.principalId, repo.identity.workspaceId, state.noteBefore, state.query, state.query);
    if (!row) { state.done.add('note'); return null; }
    state.noteBefore = Number(row.position);
    if (repo.hasFence(String(row.id), 'notes:self')) return null;
    const body = excerpt(String(row.body), state.query), found = body || excerpt(String(row.title), state.query);
    if (!found) return null;
    return { id: 'note:' + row.id, kind: 'note', title: String(row.title) || '没有标题的笔记', snippet: found.snippet, match: found.match,
      updatedAt: String(row.updated_at), locator: { kind: 'note', noteId: String(row.id), revision: Number(row.revision),
        field: body ? 'body' : 'title', offset: found.offset, end: found.end } };
  }
  private advanceMaterial(state: SearchState) { state.materialIndex++; state.materialPage = 1; state.materialTitleChecked = false; }
  private async nextMaterial(state: SearchState, signal: AbortSignal): Promise<LocalSearchHit | null> {
    const item = state.materials[state.materialIndex];
    if (!item) { state.done.add('material'); return null; }
    try {
      const original = this.store.runtime.materials.nativeOriginal({ kind: 'saved', resourceId: item.resourceId });
      if (original.item.sha256 !== item.sha256) throw unavailable();
      if (!state.materialTitleChecked) {
        state.materialTitleChecked = true;
        const found = excerpt(item.name, state.query);
        if (found) return this.materialHit(item, found, 'title');
      }
      let text: string, page: number | undefined;
      if (item.mediaType === 'application/pdf') {
        page = state.materialPage;
        const result = await this.readPdf(original.bytes, { operation: 'read', page }, signal);
        this.current(state, signal);
        this.store.runtime.materials.nativeOriginal({ kind: 'saved', resourceId: item.resourceId });
        text = result.text || '';
        if (result.needsVisual) state.warnings.set(item.resourceId + ':text', { kind: 'material', code: 'text_layer_only', resourceId: item.resourceId,
          message: `「${item.name}」里还有图片或扫描内容，这次只查了可以读取的文字。` });
        if (result.pageCount > 200) state.warnings.set(item.resourceId + ':pages', { kind: 'material', code: 'unavailable', resourceId: item.resourceId,
          message: `「${item.name}」超过了这次能翻开的页数，后面的内容还没有查到。` });
        if (page >= Math.min(result.pageCount, 200)) this.advanceMaterial(state); else state.materialPage++;
      } else { text = decoded(original.bytes); this.advanceMaterial(state); }
      const found = excerpt(text, state.query);
      return found ? this.materialHit(item, found, 'body', page) : null;
    } catch (error) {
      this.current(state, signal);
      // A file failure is visible as a coverage gap, never converted to "no match".
      state.warnings.set(item.resourceId, { kind: 'material', code: 'unavailable', resourceId: item.resourceId,
        message: `「${item.name}」这次没能打开，其他地方还可以继续找。` });
      this.advanceMaterial(state);
      return null;
    }
  }
  private materialHit(item: MaterialItem, found: NonNullable<ReturnType<typeof excerpt>>, field: 'title' | 'body', page?: number): LocalSearchHit {
    return { id: `material:${item.resourceId}:${field}:${page || 0}`, kind: 'material', title: item.name,
      snippet: found.snippet, match: found.match, ...(item.receivedAt ? { updatedAt: item.receivedAt } : {}),
      locator: { kind: 'material', resourceId: item.resourceId, sha256: item.sha256, field, offset: found.offset, end: found.end, ...(page ? { page } : {}) } };
  }
  /** Resolve just before navigation. Existing owner readers still check again;
   * the search result does not confer a lasting right to stale source content. */
  async resolve(raw: unknown): Promise<LocalSearchLocator> {
    this.privateView();
    const locator = localSearchLocatorSchema.parse(raw);
    if (locator.kind === 'conversation') {
      const current = this.message(locator.messageId);
      if (!current || current.message.sessionId !== locator.sessionId || messageDigest(current.title, current.content) !== locator.contentHash) throw unavailable();
      if (locator.end > Array.from(locator.field === 'body' ? current.content : current.title).length) throw unavailable();
    } else if (locator.kind === 'note') {
      if (this.store.kernel.hasFence(locator.noteId, 'notes:self')) throw unavailable();
      const current = this.store.notes.read({ id: locator.noteId, offset: 0, limit: 1 });
      if (current.note.state !== 'active' || current.note.revision !== locator.revision
        || locator.end > (locator.field === 'body' ? current.total : Array.from(current.note.title).length)) throw unavailable();
    } else {
      const original = this.store.runtime.materials.nativeOriginal({ kind: 'saved', resourceId: locator.resourceId });
      if (original.item.sha256 !== locator.sha256) throw unavailable();
      if (locator.field === 'title' && locator.end > Array.from(original.item.name).length) throw unavailable();
      if (original.item.mediaType !== 'application/pdf' && locator.field === 'body'
        && locator.end > Array.from(decoded(original.bytes)).length) throw unavailable();
    }
    return locator;
  }
}
