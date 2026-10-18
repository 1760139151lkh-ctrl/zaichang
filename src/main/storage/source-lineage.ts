import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { HarnessError, type EvidenceEvent } from '../../shared/harness';

/** Coordinates only. Source bodies stay in their existing evidence owner. */
export interface OriginSpan { eventId: string; sourceId?: string; contentVersion?: number; start?: number; end?: number }
export type LineageSource = Pick<EvidenceEvent, 'id' | 'ownerId' | 'workspaceId' | 'contentVersion' | 'roots' | 'parentEventId' | 'locator'>
  & { sourceId?: string; text?: string; textLength?: number };
type Range = { start: number; end: number };

function metadata(db: DatabaseSync, id: string, owner: string, workspace: string): LineageSource | undefined {
  const row = db.prepare(`SELECT id,owner,workspace,source,version,length(content) AS text_length,
    json_extract(payload,'$.roots') AS roots,json_extract(payload,'$.parentEventId') AS parent,
    json_extract(payload,'$.locator') AS locator FROM h_evidence WHERE id=? AND owner=? AND workspace=?`).get(id, owner, workspace);
  if (!row) return;
  const roots: unknown = JSON.parse(String(row.roots || '[]'));
  if (!Array.isArray(roots) || roots.some(root => typeof root !== 'string')) return;
  return { id, sourceId: String(row.source), ownerId: owner, workspaceId: workspace, contentVersion: Number(row.version), roots,
    textLength: Number(row.text_length), ...(row.parent ? { parentEventId: String(row.parent) } : {}),
    ...(row.locator ? { locator: JSON.parse(String(row.locator)) as EvidenceEvent['locator'] } : {}) };
}

function textExpression(source: LineageSource): { sql: string; params: SQLInputValue[] } {
  return source.text !== undefined ? { sql: '?', params: [source.text] }
    : { sql: "(SELECT content FROM h_evidence WHERE id=? AND version=? AND owner=? AND workspace=? AND status!='deleted')",
      params: [source.id, source.contentVersion, source.ownerId, source.workspaceId] };
}

/** An exact direct projection or an identical whole-source copy has a
 * provable coordinate transform. A paraphrase never does. */
export function projectSourceRange(db: DatabaseSync, source: LineageSource, rootId: string, range: Range) {
  const parent = metadata(db, rootId, source.ownerId, source.workspaceId);
  if (!parent) return;
  const length = source.text === undefined ? source.textLength : Array.from(source.text).length;
  if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end <= range.start
    || length === undefined || range.end > length) return;
  const text = textExpression(source);
  const identical = db.prepare(`SELECT 1 FROM h_evidence WHERE content=${text.sql} AND id=? AND owner=? AND workspace=? AND status!='deleted'`)
    .get(...text.params, rootId, source.ownerId, source.workspaceId);
  if (identical) return { source: parent, start: range.start, end: range.end };
  const locator = source.locator;
  if (source.parentEventId !== rootId || locator?.kind !== 'text' || locator.eventId !== rootId
    || locator.contentVersion !== parent.contentVersion || !Number.isSafeInteger(locator.startCodePoint)
    || !Number.isSafeInteger(locator.endCodePoint) || locator.startCodePoint < 0 || locator.endCodePoint <= locator.startCodePoint
    || locator.endCodePoint > (parent.textLength ?? 0)) return;
  const matches = db.prepare(`SELECT 1 FROM h_evidence WHERE substr(content,?,?)=${text.sql} AND id=? AND owner=? AND workspace=? AND status!='deleted'`)
    .get(locator.startCodePoint + 1, locator.endCodePoint - locator.startCodePoint, ...text.params, rootId, source.ownerId, source.workspaceId);
  if (matches) return { source: parent, start: locator.startCodePoint + range.start, end: locator.startCodePoint + range.end };
}

const spanKey = (span: OriginSpan) => JSON.stringify([span.eventId, span.contentVersion ?? null, span.start ?? null, span.end ?? null]);

/** Resolve all physical addresses and the terminal origins used for identity.
 * Redundant ancestor IDs are followed through their proven parent path.
 * Missing mappings remain explicit unknowns, including tombstone ancestry. */
export function sourceOriginSpans(db: DatabaseSync, source: LineageSource, range?: Range) {
  const all = new Map<string, OriginSpan>(), terminals = new Map<string, OriginSpan>(), completed = new Set<string>();
  let steps = 0;
  const visit = (node: LineageSource, selected: Range | undefined, path: ReadonlySet<string>) => {
    if (++steps > 512) throw new HarnessError('source_lineage_budget', '来源关系超过本次定位预算，未把不完整定位当作已完成的遗忘或独立证据。');
    const address: OriginSpan = { eventId: node.id, sourceId: node.sourceId, contentVersion: node.contentVersion, ...(selected || {}) };
    const key = spanKey(address);
    all.set(key, address);
    if (path.has(node.id)) {
      const unknown = { eventId: node.id, sourceId: node.sourceId, contentVersion: node.contentVersion };
      all.set(spanKey(unknown), unknown); terminals.set(spanKey(unknown), unknown);
      return;
    }
    // Reuse only a fully traversed subtree. Marking addresses at enqueue time
    // can hide a cycle when parallel roots reach both ends before either closes.
    if (completed.has(key)) return;
    const roots = [...new Set(node.roots)].filter(id => id !== node.id).sort();
    if (!roots.length) { terminals.set(key, address); completed.add(key); return; }
    const projected = roots.map(id => ({ id, projection: selected ? projectSourceRange(db, node, id, selected) : undefined }));
    const coveredAncestors = new Set(projected.flatMap(item => item.projection?.source.roots || []));
    const nextPath = new Set([...path, node.id]);
    for (const item of projected) {
      if (!item.projection && coveredAncestors.has(item.id)) continue;
      const next = item.projection?.source || metadata(db, item.id, node.ownerId, node.workspaceId);
      const nextRange = item.projection ? { start: item.projection.start, end: item.projection.end } : undefined;
      if (next) visit(next, nextRange, nextPath);
      else {
        const unknown = { eventId: item.id };
        all.set(spanKey(unknown), unknown); terminals.set(spanKey(unknown), unknown);
      }
    }
    completed.add(key);
  };
  visit(source, range, new Set());
  const origins = [...terminals.values()].sort((a, b) => spanKey(a) < spanKey(b) ? -1 : spanKey(a) > spanKey(b) ? 1 : 0);
  return { spans: [...all.values()], origins,
    complete: origins.length > 0 && origins.every(origin => origin.contentVersion !== undefined && origin.start !== undefined && origin.end !== undefined) };
}

export function sameSourceOrigins(left: ReturnType<typeof sourceOriginSpans>, right: ReturnType<typeof sourceOriginSpans>) {
  return left.complete && right.complete && left.origins.length === right.origins.length
    && left.origins.every((span, index) => spanKey(span) === spanKey(right.origins[index]));
}
