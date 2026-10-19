import type { DatabaseSync } from 'node:sqlite';
import { HarnessError } from '../../shared/harness';

export interface SemanticRange { start: number; end: number }
export interface SemanticChunkAddress extends SemanticRange {
  eventId: string;
  contentVersion: number;
  textSha256: string;
  /** Fixed model, tokenizer, pooling, query format and chunking method identity. */
  methodId: string;
}
export interface SemanticChunk extends SemanticChunkAddress { vector: Float32Array }
export interface SemanticChunkMetadata extends SemanticChunkAddress { dimensions: number }
interface SemanticChunkBatch {
  eventId: string; contentVersion: number; methodId: string; chunks: SemanticChunk[];
}

/** A disposable index in the evidence owner's database, never another fact store.
 * Install before replaying restoration fences so restored vectors are erased by
 * the same transaction as their original evidence. There are no copied bodies. */
export function installSemanticSchema(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS h_semantic_chunks(
    event_id TEXT NOT NULL REFERENCES h_evidence(id) ON DELETE CASCADE,
    content_version INTEGER NOT NULL CHECK(content_version>0),
    start_cp INTEGER NOT NULL CHECK(start_cp>=0),
    end_cp INTEGER NOT NULL CHECK(end_cp>start_cp),
    text_sha256 TEXT NOT NULL CHECK(length(text_sha256)=64),
    method_id TEXT NOT NULL,
    dimensions INTEGER NOT NULL CHECK(dimensions>0 AND dimensions<=4096),
    vector BLOB NOT NULL CHECK(length(vector)=dimensions*4),
    PRIMARY KEY(event_id,content_version,start_cp,end_cp,method_id));
    CREATE INDEX IF NOT EXISTS h_semantic_method ON h_semantic_chunks(method_id,event_id);`);
}

function requireTransaction(db: DatabaseSync) {
  if (!db.isTransaction) throw new HarnessError('semantic_transaction_required', '原文索引变更须与当前来源复核或遗忘同事务提交。');
}
function validRange(range: SemanticRange) {
  return Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end) && range.start >= 0 && range.end > range.start;
}
function validAddress(address: SemanticChunkAddress) {
  return !!address.eventId && Number.isSafeInteger(address.contentVersion) && address.contentVersion > 0
    && validRange(address) && /^[a-f0-9]{64}$/.test(address.textSha256) && !!address.methodId;
}

/** Explicit little-endian float32 keeps the derived format independent of the
 * current process's typed-array alignment. Vectors remain private source data. */
export function encodeSemanticVector(vector: Float32Array) {
  if (!vector.length || vector.length > 4096 || vector.some(value => !Number.isFinite(value)))
    throw new HarnessError('semantic_vector_invalid', '本地召回向量的维度或数值不合法。');
  const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) throw new HarnessError('semantic_vector_invalid', '本地召回向量不能归一化。');
  const bytes = Buffer.alloc(vector.length * 4);
  vector.forEach((value, index) => bytes.writeFloatLE(value / norm, index * 4));
  return bytes;
}

export function decodeSemanticVector(bytes: Uint8Array, dimensions: number) {
  if (!Number.isSafeInteger(dimensions) || dimensions <= 0 || dimensions > 4096 || bytes.byteLength !== dimensions * 4)
    throw new HarnessError('semantic_vector_invalid', '已保存的本地召回向量格式不完整。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), vector = new Float32Array(dimensions);
  let squaredNorm = 0;
  for (let index = 0; index < dimensions; index++) {
    const value = view.getFloat32(index * 4, true);
    if (!Number.isFinite(value)) throw new HarnessError('semantic_vector_invalid', '已保存的本地召回向量数值不合法。');
    vector[index] = value; squaredNorm += value * value;
  }
  if (!Number.isFinite(squaredNorm) || squaredNorm === 0)
    throw new HarnessError('semantic_vector_invalid', '已保存的本地召回向量不能归一化。');
  return vector;
}

function encodeSemanticChunks(input: SemanticChunkBatch) {
  if (!input.eventId || !Number.isSafeInteger(input.contentVersion) || input.contentVersion <= 0 || !input.methodId)
    throw new HarnessError('semantic_address_invalid', '本地召回索引的来源地址不合法。');
  const seen = new Set<string>(), dimensions = input.chunks[0]?.vector.length;
  // Validate and encode the complete batch before changing any saved rows.
  return input.chunks.map(chunk => {
    const key = chunk.start + ':' + chunk.end;
    if (!validAddress(chunk) || chunk.eventId !== input.eventId || chunk.contentVersion !== input.contentVersion
      || chunk.methodId !== input.methodId || chunk.vector.length !== dimensions || seen.has(key))
      throw new HarnessError('semantic_address_invalid', '本地召回索引的片段地址、方法或维度不一致。');
    seen.add(key);
    return { chunk, bytes: encodeSemanticVector(chunk.vector) };
  });
}

/** Host-internal persistence only. The repository must re-read the exact
 * evidence version/hash and current inference/projected ranges in this same
 * transaction after asynchronous inference, before calling this function.
 * Use this only for a complete rebuild, never a child scope or partial batch. */
export function replaceSemanticChunks(db: DatabaseSync, input: SemanticChunkBatch) {
  requireTransaction(db);
  const rows = encodeSemanticChunks(input);
  // A new method/version never leaves the old private vectors as hidden history.
  db.prepare('DELETE FROM h_semantic_chunks WHERE event_id=?').run(input.eventId);
  const insert = db.prepare(`INSERT INTO h_semantic_chunks
    (event_id,content_version,start_cp,end_cp,text_sha256,method_id,dimensions,vector) VALUES(?,?,?,?,?,?,?,?)`);
  for (const { chunk, bytes } of rows)
    insert.run(chunk.eventId, chunk.contentVersion, chunk.start, chunk.end, chunk.textSha256, chunk.methodId, chunk.vector.length, bytes);
}

/** Incremental indexing preserves other legal fragments of the same source.
 * A child scope or per-turn budget cannot erase fragments outside its own
 * batch. The host separately removes globally stopped/forgotten ranges in the
 * source owner's transaction, using the full current inference permission. */
export function saveSemanticChunks(db: DatabaseSync, input: SemanticChunkBatch) {
  requireTransaction(db);
  const rows = encodeSemanticChunks(input), dimensions = input.chunks[0]?.vector.length;
  if (dimensions !== undefined && db.prepare(`SELECT 1 FROM h_semantic_chunks WHERE event_id=?
    AND content_version=? AND method_id=? AND dimensions!=? LIMIT 1`).get(input.eventId, input.contentVersion, input.methodId, dimensions))
    throw new HarnessError('semantic_address_invalid', '同一本地召回方法已保存的片段维度不一致，未覆盖其他合法片段。');
  db.prepare('DELETE FROM h_semantic_chunks WHERE event_id=? AND (content_version!=? OR method_id!=?)')
    .run(input.eventId, input.contentVersion, input.methodId);
  const insert = db.prepare(`INSERT INTO h_semantic_chunks
    (event_id,content_version,start_cp,end_cp,text_sha256,method_id,dimensions,vector) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(event_id,content_version,start_cp,end_cp,method_id) DO UPDATE SET
      text_sha256=excluded.text_sha256,dimensions=excluded.dimensions,vector=excluded.vector`);
  for (const { chunk, bytes } of rows)
    insert.run(chunk.eventId, chunk.contentVersion, chunk.start, chunk.end, chunk.textSha256, chunk.methodId, chunk.vector.length, bytes);
}

/** Only coordinates, hashes and dimensions. Call after the repository's SQL
 * scope filter; recheck each exact current range before loading its vector. */
export function semanticChunkMetadata(db: DatabaseSync, eventId: string, methodId: string): SemanticChunkMetadata[] {
  return db.prepare(`SELECT content_version,start_cp,end_cp,text_sha256,dimensions FROM h_semantic_chunks
    WHERE event_id=? AND method_id=? ORDER BY start_cp,end_cp`).all(eventId, methodId).map(row => ({
      eventId, contentVersion: Number(row.content_version), start: Number(row.start_cp), end: Number(row.end_cp),
      textSha256: String(row.text_sha256), methodId, dimensions: Number(row.dimensions),
    }));
}

/** There is deliberately no unscoped nearest-neighbour/top-K API. The caller
 * first proves scope, purpose, current source/version/hash and the complete
 * allowed range, then loads/ranks all eligible candidates before pagination. */
export function semanticChunkVector(db: DatabaseSync, address: SemanticChunkMetadata) {
  if (!validAddress(address)) return undefined;
  const row = db.prepare(`SELECT vector,dimensions FROM h_semantic_chunks WHERE event_id=? AND content_version=?
    AND start_cp=? AND end_cp=? AND text_sha256=? AND method_id=? AND dimensions=?`).get(address.eventId,
      address.contentVersion, address.start, address.end, address.textSha256, address.methodId, address.dimensions);
  if (!row || !(row.vector instanceof Uint8Array)) return undefined;
  return decodeSemanticVector(row.vector, Number(row.dimensions));
}

/** Run inside the original forget/restore transaction with its already-expanded
 * exact-copy/lineage addresses. Unknown version mapping clears every version of
 * that event; a proven disjoint current fragment keeps its independent vector. */
export function eraseSemanticChunks(db: DatabaseSync, input: {
  eventIds?: readonly string[]; sourceIds?: readonly string[];
  ranges?: readonly (SemanticRange & { eventId: string; contentVersion: number })[];
}) {
  requireTransaction(db);
  if (input.eventIds?.length) db.prepare('DELETE FROM h_semantic_chunks WHERE event_id IN (SELECT value FROM json_each(?))')
    .run(JSON.stringify(input.eventIds));
  if (input.sourceIds?.length) db.prepare(`DELETE FROM h_semantic_chunks WHERE event_id IN (
    SELECT e.id FROM h_evidence e WHERE e.source IN (SELECT value FROM json_each(?))
      OR e.id IN (SELECT value FROM json_each(?))
      OR json_extract(e.payload,'$.locator.artifactId') IN (SELECT value FROM json_each(?)))`)
    .run(JSON.stringify(input.sourceIds), JSON.stringify(input.sourceIds), JSON.stringify(input.sourceIds));
  for (const range of input.ranges || []) {
    if (!validRange(range) || !Number.isSafeInteger(range.contentVersion) || range.contentVersion <= 0)
      throw new HarnessError('semantic_address_invalid', '原文遗忘的片段地址不合法，未跳过本地召回索引清理。');
    db.prepare(`DELETE FROM h_semantic_chunks WHERE event_id=?
      AND (content_version!=? OR (start_cp<? AND end_cp>?))`).run(range.eventId, range.contentVersion, range.end, range.start);
  }
}

function unionRanges(ranges: readonly SemanticRange[]) {
  const sorted = ranges.map(range => {
    if (!validRange(range)) throw new HarnessError('semantic_address_invalid', '本地召回覆盖范围不合法。');
    return { start: range.start, end: range.end };
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  const result: SemanticRange[] = [];
  for (const range of sorted) {
    const last = result[result.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else result.push(range);
  }
  return result;
}

/** Coverage uses only currently permitted ranges and individually validated
 * current chunks. Never count a chunk that bridges an ungranted/stopped gap.
 * The returned count is index coverage, never a semantic relevance judgement. */
export function semanticCoverage(allowedRanges: readonly SemanticRange[], indexedRanges: readonly SemanticRange[]) {
  const allowed = unionRanges(allowedRanges);
  const indexed = unionRanges(indexedRanges.filter(range => validRange(range)
    && allowed.some(window => range.start >= window.start && range.end <= window.end)));
  const gaps = allowed.flatMap(window => {
    let start = window.start;
    const missing: SemanticRange[] = [];
    for (const range of indexed) {
      if (range.end <= start || range.start >= window.end) continue;
      if (range.start > start) missing.push({ start, end: range.start });
      start = Math.max(start, range.end);
    }
    if (start < window.end) missing.push({ start, end: window.end });
    return missing;
  });
  const count = (ranges: readonly SemanticRange[]) => ranges.reduce((total, range) => total + range.end - range.start, 0);
  return { allowed, indexed, gaps, allowedCodePoints: count(allowed), indexedCodePoints: count(indexed), complete: gaps.length === 0 };
}
