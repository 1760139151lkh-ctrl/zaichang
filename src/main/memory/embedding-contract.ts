import embeddingLock from '../../../runtime/embedding/lock.json';
import { createHash } from 'node:crypto';

/** Change the method identity when tokenization, slicing, prefix or pooling changes. */
const methodHash = createHash('sha256').update(JSON.stringify({ repository: embeddingLock.repository,
  revision: embeddingLock.revision, files: embeddingLock.files, method: embeddingLock.method, dependencies: embeddingLock.dependencies })).digest('hex');
export const EMBEDDING_METHOD_ID = `${embeddingLock.runtimeVersion}:${methodHash}:cls-l2-zhq1:cp1200-o48-t512-v1`;

export const EMBEDDING_CONTRACT = Object.freeze({
  methodId: EMBEDDING_METHOD_ID,
  modelId: embeddingLock.modelId,
  runtimeVersion: embeddingLock.runtimeVersion,
  dimensions: embeddingLock.method.dimensions,
  maxTokens: embeddingLock.method.maxTokens,
  queryPrefix: embeddingLock.method.queryPrefix,
  maxChunkCodePoints: 1200,
  overlapCodePoints: 48,
  maxCodePointsPerRequest: 64_000,
  maxOutstandingRequests: 8,
  clsTokenId: 101,
  sepTokenId: 102,
  padTokenId: 0,
  workerFile: 'embedding-worker.cjs',
  assets: embeddingLock.files.map(asset => Object.freeze({ ...asset, path: `model/${asset.path}` })),
});

export type LocalEmbeddingErrorCode =
  | 'embedding_configuration' | 'embedding_input' | 'embedding_query_too_long'
  | 'embedding_contract' | 'embedding_assets' | 'embedding_busy'
  | 'embedding_cancelled' | 'embedding_closed' | 'embedding_unavailable';

export class LocalEmbeddingError extends Error {
  constructor(readonly code: LocalEmbeddingErrorCode, message: string) {
    super(message);
    this.name = 'LocalEmbeddingError';
  }
}

/**
 * Exactly one host-authorized contiguous source range, never concatenated across
 * gaps. text must equal Array.from(original).slice(startCodePoint,endCodePoint).
 * Coordinates count original Unicode code points, not normalized tokens/UTF-16.
 * Authority and source/version checks remain the caller's responsibility.
 */
export type EmbeddingPassageInput = { text: string; startCodePoint: number; endCodePoint: number };
export type EmbeddingQueryResult = {
  kind: 'query'; methodId: string; vector: Float32Array; tokenCount: number;
};
export type EmbeddingChunk = {
  startCodePoint: number; endCodePoint: number; textHash: string; tokenCount: number; vector: Float32Array;
};
export type EmbeddingPassageResult = {
  kind: 'passage'; methodId: string; chunks: EmbeddingChunk[];
  /** Overlapping chunks cover this entire input range; no claim about other ranges. */
  coverage: { unit: 'unicode_code_point'; start: number; end: number; complete: true };
};
export type EmbeddingResult = EmbeddingQueryResult | EmbeddingPassageResult;
export type EmbeddingRuntimeDescription = {
  methodId: string; runtimeVersion: string; dimensions: number;
  /** files_present is only a size/existence observation, not a model-load result. */
  state: 'files_present' | 'files_missing' | 'loaded' | 'failed' | 'closed';
  failureCode?: LocalEmbeddingErrorCode;
};

export type EmbeddingWorkerRequest = {
  id: number; cancellation: SharedArrayBuffer;
} & ({ kind: 'query'; text: string } | ({ kind: 'passage' } & EmbeddingPassageInput));
export type EmbeddingWorkerResponse =
  | { id: number; ok: true; result: EmbeddingResult }
  | { id: number; ok: false; error: { code: LocalEmbeddingErrorCode; message: string } };
