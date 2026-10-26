import type { ASTNode } from '@openuidev/lang-core';
import { HarnessError } from '../../shared/harness';
import { INTERACTIVE_PROGRAM_LIMITS } from '../../shared/interactive-program';
import { keepSnapshotInputSchema, type KeepPage, type KeepSnapshot, type KeepWorkItem } from '../../shared/keep';
import type { Conversation } from '../../shared/types';
import type { Store } from '../store';
import { parseProgramStatements } from './interactive-program-ast';
import { programReferenceIdentity, programSourcesReadable } from './interactive-program-sources';

const astLimits = { bytes: INTERACTIVE_PROGRAM_LIMITS.dslBytes, tokens: INTERACTIVE_PROGRAM_LIMITS.tokens,
  depth: INTERACTIVE_PROGRAM_LIMITS.depth, statements: INTERACTIVE_PROGRAM_LIMITS.statements,
  nodes: INTERACTIVE_PROGRAM_LIMITS.expandedNodes, collection: INTERACTIVE_PROGRAM_LIMITS.collection,
  expandedNodes: INTERACTIVE_PROGRAM_LIMITS.expandedNodes };

/** Only an existing Document title is a work title. No prose, state or child
 * text is searched to invent one, and expressions are never evaluated here. */
export function programDocumentTitle(dsl: string): string {
  try {
    const statements = parseProgramStatements(dsl, astLimits), visited = new Set<string>();
    const resolve = (node: ASTNode | undefined): ASTNode | undefined => {
      while (node?.k === 'Ref') {
        if (visited.has(node.n)) return;
        visited.add(node.n); node = statements.get(node.n);
      }
      return node;
    };
    const root = resolve(statements.get('root'));
    // Document(id, ui, children, title, presentation), from the shared library.
    const title = root?.k === 'Comp' && root.name === 'Document' ? resolve(root.args[3]) : undefined;
    if (title?.k === 'Str' && title.v.trim() && Array.from(title.v).length <= 160) return title.v;
  } catch (error) { if (!(error instanceof HarnessError)) throw error; }
  return '一起做的作品';
}

function page<T>(items: T[], offset: number, limit: number): KeepPage<T> {
  const selected = items.slice(offset, offset + limit), hasMore = offset + selected.length < items.length;
  return { items: selected, offset, total: items.length, hasMore,
    ...(hasMore ? { nextOffset: offset + selected.length } : {}) };
}

/** The private native directory reads existing owner indexes. It creates no
 * table, content cache, source admission, model request or inferred relation. */
export class NativeKeepService {
  constructor(private readonly store: Store) {}

  private boundary(): KeepSnapshot['boundary'] {
    if (this.store.runtime.presentation.public) throw new HarnessError('keep_private', '回到自己的桌边，再打开留下的内容。');
    return { privacyEpoch: this.store.kernel.epoch, policyRevision: this.store.kernel.policyRevision,
      sourceBoundary: this.store.runtime.policy.sourceBoundary };
  }

  private conversations(offset: number, limit: number): KeepPage<Conversation> {
    const { principalId, workspaceId } = this.store.kernel.identity;
    if (this.store.kernel.hasFence('history:self')) return { items: [], offset, total: 0, hasMore: false };
    const fences = this.store.kernel.fences().filter(fence => fence.kind === 'delete');
    const hiddenIds = JSON.stringify([...new Set(fences.flatMap(fence => [...fence.objectIds, ...fence.sourceIds]))]);
    const changedEventIds = JSON.stringify([...new Set(fences.flatMap(fence => [...fence.objectIds,
      ...(fence.spans || []).map(span => span.eventId)]))]);
    const condition = `COALESCE(json_extract(p.value,'$.retention'),'history_no_inference')!='session_only'
      AND s.id NOT IN (SELECT value FROM json_each(?))
      AND EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=s.id
        AND e.owner=? AND e.workspace=? AND e.subject=? AND e.world='real' AND e.status!='deleted')
      AND NOT EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=s.id
        AND (e.owner!=? OR e.workspace!=?))`;
    const params = [hiddenIds, principalId, workspaceId, principalId, principalId, workspaceId];
    const from = `FROM sessions s LEFT JOIN meta p ON p.key='conversation-policy:'||s.id WHERE ${condition}`;
    const total = Number(this.store.db.prepare(`SELECT count(*) AS n ${from}`).get(...params)?.n || 0);
    const rows = this.store.db.prepare(`SELECT s.id,s.title,s.updated_at AS updatedAt,
      EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=s.id
        AND (e.status IN ('deleted','redacted') OR e.id IN (SELECT value FROM json_each(?))
          OR e.source IN (SELECT value FROM json_each(?))
          OR EXISTS(SELECT 1 FROM h_source_restrictions r WHERE r.event_id=e.id))) AS neutralTitle
      ${from} ORDER BY s.updated_at DESC,s.id LIMIT ? OFFSET ?`).all(changedEventIds, hiddenIds, ...params, limit, offset);
    const items = rows.map(row => ({
      id: String(row.id), title: row.neutralTitle ? '一段对话' : String(row.title), updatedAt: String(row.updatedAt),
    }));
    const nextOffset = offset + rows.length, hasMore = nextOffset < total;
    return { items, offset, total, hasMore, ...(hasMore ? { nextOffset } : {}) };
  }

  private works(offset: number, limit: number): KeepPage<KeepWorkItem> {
    const runtime = this.store.runtime, scope = runtime.policy.hostScope();
    // Select addresses first. Neither reply content nor program text is read
    // before that exact original's identity and current source proof pass.
    const rows = this.store.db.prepare(`SELECT m.session_id AS sessionId,m.id AS messageId,
      json_extract(v.value,'$.id') AS programId,json_extract(v.value,'$.revision') AS revision,
      COALESCE(NULLIF(json_extract(v.value,'$.createdAt'),''),m.created_at) AS createdAt
      FROM messages m,json_each(m.payload,'$.views') v
      LEFT JOIN meta p ON p.key='conversation-policy:'||m.session_id
      WHERE m.role='assistant' AND json_extract(m.payload,'$.status') IN ('done','cancelled','error')
      AND json_extract(v.value,'$.libraryVersion')=2 AND json_type(v.value,'$.program')='object'
      AND COALESCE(json_extract(p.value,'$.retention'),'history_no_inference')!='session_only'
      ORDER BY m.created_at DESC,m.rowid DESC,CAST(v.key AS INTEGER) DESC LIMIT ? OFFSET ?`).all(limit + 1, offset);
    const candidates = rows.slice(0, limit), items: KeepWorkItem[] = [];
    for (const row of candidates) {
      const sessionId = String(row.sessionId), source = { messageId: String(row.messageId), programId: String(row.programId), revision: Number(row.revision) };
      if (!Number.isSafeInteger(source.revision) || source.revision < 1) continue;
      const identity = programReferenceIdentity(runtime, scope, source, sessionId, { localDisplay: true });
      if (!identity || identity.sessionId !== sessionId || !programSourcesReadable(runtime, scope, [source], undefined, true)) continue;
      const metadata = this.store.db.prepare(`SELECT
        json_extract(v.value,'$.program.hash') AS programHash,
        json_extract(v.value,'$.program.sourceDsl') AS sourceDsl,
        json_extract(v.value,'$.program.dsl') AS dsl,
        json_array_length(v.value,'$.program.bindingAliases') AS bindings,
        json_extract(v.value,'$.program.nodeIds[0]') AS nodeId,
        json_extract(v.value,'$.localState.programHash') AS localHash,
        json_extract(v.value,'$.localState.stateRevision') AS stateRevision,
        json_extract(v.value,'$.localState.updatedAt') AS stateUpdatedAt
        FROM messages m,json_each(m.payload,'$.views') v WHERE m.id=? AND m.session_id=?
        AND json_extract(v.value,'$.id')=? AND json_extract(v.value,'$.revision')=? LIMIT 1`)
        .get(source.messageId, sessionId, source.programId, source.revision);
      if (!metadata || typeof metadata.programHash !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.programHash)) continue;
      const stateRevision = Number(metadata.stateRevision), localState = metadata.localHash === metadata.programHash
        && Number.isSafeInteger(stateRevision) && stateRevision > 0 && typeof metadata.stateUpdatedAt === 'string'
        ? { stateRevision, updatedAt: metadata.stateUpdatedAt } : null;
      items.push({ kind: 'interactive_program', title: programDocumentTitle(String(metadata.sourceDsl || metadata.dsl || '')),
        createdAt: String(row.createdAt), locator: { sessionId, ...source, programHash: metadata.programHash,
          ...(typeof metadata.nodeId === 'string' ? { nodeId: metadata.nodeId } : {}) },
        status: Number(metadata.bindings) > 0 ? 'needs_refresh' : 'ready', localState });
    }
    runtime.policy.validate(scope);
    const hasMore = rows.length > limit;
    return { items, offset, hasMore, ...(hasMore ? { nextOffset: offset + candidates.length } : {}) };
  }

  snapshot(raw: unknown = {}): KeepSnapshot {
    const input = keepSnapshotInputSchema.parse(raw), boundary = this.boundary();
    const notes = this.store.notes.list({ state: 'active', offset: input.notesOffset, limit: input.limit });
    const result: KeepSnapshot = { boundary,
      notes: { ...notes, ...(notes.hasMore ? { nextOffset: notes.offset + notes.items.length } : {}) },
      materials: page(this.store.runtime.materials.nativeList(), input.materialsOffset, input.limit),
      conversations: this.conversations(input.conversationsOffset, input.limit), works: this.works(input.worksOffset, input.limit) };
    const current = this.boundary();
    if (current.privacyEpoch !== boundary.privacyEpoch || current.policyRevision !== boundary.policyRevision || current.sourceBoundary !== boundary.sourceBoundary)
      throw new HarnessError('keep_boundary', '留下的内容刚有变化，请再打开一次。');
    return result;
  }
}
