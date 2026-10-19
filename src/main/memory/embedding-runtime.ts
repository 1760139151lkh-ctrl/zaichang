import { isAbsolute, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import {
  EMBEDDING_CONTRACT, LocalEmbeddingError,
  type EmbeddingPassageInput, type EmbeddingPassageResult, type EmbeddingQueryResult,
  type EmbeddingResult, type EmbeddingWorkerRequest, type EmbeddingWorkerResponse,
  type LocalEmbeddingErrorCode, type EmbeddingRuntimeDescription,
} from './embedding-contract';

export type EmbeddingRequestOptions = { signal?: AbortSignal };
export type LocalEmbeddingRuntimeOptions = {
  /** Host-selected product resources; never a renderer-provided model path. */
  resourceDirectory: string;
  /** The separately built worker, outside renderer and source-text bundles. */
  workerPath?: string;
};

type PendingRequest = {
  resolve: (value: EmbeddingResult) => void;
  reject: (error: LocalEmbeddingError) => void;
  cancellation: Int32Array;
  cleanup: () => void;
  settled: boolean;
};

/** One local CPU worker. Construction does not load packages, assets or a model. */
export class LocalEmbeddingRuntime {
  private worker: Worker | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 0;
  private closed = false;
  private loaded = false;
  private failure: LocalEmbeddingError | null = null;

  constructor(private readonly options: LocalEmbeddingRuntimeOptions) {
    if (!isAbsolute(options.resourceDirectory) || (options.workerPath && !isAbsolute(options.workerPath)))
      throw new LocalEmbeddingError('embedding_configuration', '本地语义候选需要明确的产品资源路径。');
  }

  async embedQuery(text: string, options: EmbeddingRequestOptions = {}): Promise<EmbeddingQueryResult> {
    const result = await this.request({ kind: 'query', text }, options);
    if (result.kind !== 'query') throw new LocalEmbeddingError('embedding_contract', '本地语义候选返回类型不一致。');
    return result;
  }

  async embedPassage(input: EmbeddingPassageInput, options: EmbeddingRequestOptions = {}): Promise<EmbeddingPassageResult> {
    const result = await this.request({ kind: 'passage', ...input }, options);
    if (result.kind !== 'passage') throw new LocalEmbeddingError('embedding_contract', '本地语义候选返回类型不一致。');
    return result;
  }

  /** File presence only; this does not start the worker or load native packages. */
  async describe(): Promise<EmbeddingRuntimeDescription> {
    const identity = { methodId: EMBEDDING_CONTRACT.methodId, runtimeVersion: EMBEDDING_CONTRACT.runtimeVersion,
      dimensions: EMBEDDING_CONTRACT.dimensions };
    if (this.closed) return { ...identity, state: 'closed' };
    if (this.failure) return { ...identity, state: 'failed', failureCode: this.failure.code };
    if (this.loaded) return { ...identity, state: 'loaded' };
    try {
      const worker = await stat(this.options.workerPath || join(__dirname, EMBEDDING_CONTRACT.workerFile));
      if (!worker.isFile()) return { ...identity, state: 'files_missing' };
      for (const asset of EMBEDDING_CONTRACT.assets) {
        const info = await stat(join(this.options.resourceDirectory, asset.path));
        if (!info.isFile() || info.size !== asset.bytes) return { ...identity, state: 'files_missing' };
      }
      return { ...identity, state: 'files_present' };
    } catch { return { ...identity, state: 'files_missing' }; }
  }

  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.failPending(new LocalEmbeddingError('embedding_closed', '本地语义候选已关闭。'));
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.terminate();
  }

  private request(
    input: { kind: 'query'; text: string } | ({ kind: 'passage' } & EmbeddingPassageInput),
    options: EmbeddingRequestOptions,
  ): Promise<EmbeddingResult> {
    if (this.closed) return Promise.reject(new LocalEmbeddingError('embedding_closed', '本地语义候选已关闭。'));
    if (this.failure) return Promise.reject(this.failure);
    if (options.signal?.aborted) return Promise.reject(new LocalEmbeddingError('embedding_cancelled', '本地语义候选已取消。'));
    // Cancelled native calls remain outstanding until the worker acknowledges them.
    if (this.pending.size >= EMBEDDING_CONTRACT.maxOutstandingRequests)
      return Promise.reject(new LocalEmbeddingError('embedding_busy', '本地语义候选正在处理已有片段，请稍后继续。'));
    if (typeof input.text !== 'string' || !input.text.length || input.text.length > EMBEDDING_CONTRACT.maxCodePointsPerRequest * 2
      || Array.from(input.text).length > EMBEDDING_CONTRACT.maxCodePointsPerRequest)
      return Promise.reject(new LocalEmbeddingError('embedding_input', '本地语义候选片段为空或超过单次完整处理范围。'));

    let worker: Worker;
    try { worker = this.ensureWorker(); }
    catch { return Promise.reject(new LocalEmbeddingError('embedding_unavailable', '本地语义候选运行时暂不可用。')); }
    const id = ++this.nextRequestId;
    const cancellation = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    return new Promise<EmbeddingResult>((resolve, reject) => {
      const abort = () => {
        const pending = this.pending.get(id);
        if (!pending || pending.settled) return;
        Atomics.store(pending.cancellation, 0, 1);
        pending.settled = true;
        pending.cleanup();
        pending.reject(new LocalEmbeddingError('embedding_cancelled', '本地语义候选已取消。'));
      };
      const pending: PendingRequest = { resolve, reject, cancellation, settled: false,
        cleanup: () => options.signal?.removeEventListener('abort', abort) };
      this.pending.set(id, pending);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      // Cancellation cannot stop a native kernel already executing. The worker
      // reads this shared flag before/after work; the host also discards its reply.
      const request: EmbeddingWorkerRequest = { ...input, id, cancellation: cancellation.buffer as SharedArrayBuffer };
      try { worker.ref(); worker.postMessage(request); }
      catch {
        this.pending.delete(id);
        pending.cleanup();
        if (!pending.settled) pending.reject(new LocalEmbeddingError('embedding_unavailable', '本地语义候选请求未能提交。'));
        if (!this.pending.size) worker.unref();
      }
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(this.options.workerPath || join(__dirname, EMBEDDING_CONTRACT.workerFile), {
      workerData: { resourceDirectory: this.options.resourceDirectory }, execArgv: [], name: 'local-memory-embedding',
    });
    this.worker = worker;
    worker.on('message', (message: EmbeddingWorkerResponse) => {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      pending.cleanup();
      if (!pending.settled) {
        pending.settled = true;
        if (message.ok) { this.loaded = true; pending.resolve(message.result); }
        else {
          const error = new LocalEmbeddingError(message.error.code, message.error.message);
          if (['embedding_assets', 'embedding_contract', 'embedding_unavailable', 'embedding_configuration'].includes(error.code))
            this.failure = error;
          pending.reject(error);
        }
      }
      if (!this.pending.size) worker.unref();
    });
    worker.on('error', () => this.workerFailed(worker, 'embedding_unavailable'));
    worker.on('exit', () => this.workerFailed(worker, 'embedding_unavailable'));
    return worker;
  }

  private workerFailed(worker: Worker, code: LocalEmbeddingErrorCode): void {
    if (this.worker !== worker) return;
    this.worker = null;
    if (this.closed) return;
    this.failure = new LocalEmbeddingError(code, '本地语义候选运行时已退出；现有原文查找仍可继续。');
    this.failPending(this.failure);
  }

  private failPending(error: LocalEmbeddingError): void {
    for (const pending of this.pending.values()) {
      Atomics.store(pending.cancellation, 0, 1);
      pending.cleanup();
      if (!pending.settled) pending.reject(error);
    }
    this.pending.clear();
  }
}
