import { existsSync } from 'node:fs';
import os from 'node:os';
import { utilityProcess, type UtilityProcess } from 'electron';
import type { SpeechWorkerCommand, SpeechWorkerEvent, SpeechWorkerFiles } from './speech-protocol';

export type SpeechEngineState = 'stopped' | 'starting' | 'ready' | 'failed';

const LOAD_TIMEOUT_MS = 90_000;

/**
 * Owns the speech utility process. Launching is lazy (first dictation), the process
 * is a separate OS process (see speech-worker.ts for why), and when it exits for any
 * reason the next dictation simply starts a fresh one.
 *
 * MOBILE: there is no process boundary on a phone; the same commands/events are
 * served by the in-app sherpa-onnx object and this class is not needed.
 */
export class SpeechEngine {
  private child: UtilityProcess | null = null;
  private loading: Promise<void> | null = null;
  private state: SpeechEngineState = 'stopped';
  private generation = 0;
  private cancelLoading: (() => void) | null = null;

  constructor(private readonly options: {
    workerPath: string;
    files: () => SpeechWorkerFiles | null;
    onEvent: (event: SpeechWorkerEvent) => void;
    onState: (state: SpeechEngineState) => void;
  }) {}

  get current(): SpeechEngineState { return this.state; }

  private set(state: SpeechEngineState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onState(state);
  }

  /** Starts the process once and resolves when the recognizer has loaded its model. */
  ensure(): Promise<void> {
    if (this.state === 'ready' && this.child) return Promise.resolve();
    if (this.loading) return this.loading;
    const loading = this.launch().finally(() => { if (this.loading === loading) this.loading = null; });
    return this.loading = loading;
  }

  private launch(): Promise<void> {
    const files = this.options.files();
    if (!files || !existsSync(this.options.workerPath)) { this.set('failed'); return Promise.reject(new Error('speech runtime missing')); }
    this.set('starting');
    const generation = ++this.generation;
    const system = process.env.SystemRoot || process.env.SYSTEMROOT || '';
    // The recognizer needs no network, no credentials and nothing from the person's environment.
    const env: Record<string, string> = { ZAICHANG_SPEECH_WORKER: '1' };
    for (const [name, value] of [['SystemRoot', system], ['WINDIR', process.env.WINDIR || system], ['TEMP', os.tmpdir()], ['TMP', os.tmpdir()]] as const) if (value) env[name] = value;
    const child = utilityProcess.fork(this.options.workerPath, [], { serviceName: 'zaichang-speech', stdio: 'ignore', env });
    this.child = child;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.cancelLoading === cancel) this.cancelLoading = null;
        if (generation !== this.generation) { reject(new Error('speech startup cancelled')); return; }
        if (error) { this.drop(child, 'failed'); reject(error); } else { this.set('ready'); resolve(); }
      };
      const cancel = () => done(new Error('speech startup cancelled'));
      this.cancelLoading = cancel;
      const timer = setTimeout(() => done(new Error('speech model load timed out')), LOAD_TIMEOUT_MS);
      child.on('spawn', () => child.postMessage({ type: 'init', files, threads: Math.min(4, Math.max(2, Math.floor(os.availableParallelism() / 2))) } satisfies SpeechWorkerCommand));
      child.on('message', (message: SpeechWorkerEvent) => {
        if (generation !== this.generation || !message || typeof message !== 'object') return;
        if (message.type === 'loaded') done();
        else if (message.type === 'fault' && !settled) { done(new Error('speech runtime failed: ' + message.code)); return; }
        this.options.onEvent(message);
      });
      child.on('exit', () => {
        if (generation !== this.generation) return;
        const wasReady = this.state === 'ready';
        this.child = null;
        if (!settled) done(new Error('speech process exited while loading'));
        else { this.set(wasReady ? 'stopped' : 'failed'); if (wasReady) this.options.onEvent({ type: 'fault', code: 'protocol', detail: 'exit' }); }
      });
    });
  }

  post(command: SpeechWorkerCommand): boolean {
    if (!this.child || this.state !== 'ready') return false;
    try { this.child.postMessage(command); return true; } catch { return false; }
  }

  private drop(child: UtilityProcess, state: SpeechEngineState): void {
    if (this.child === child) this.child = null;
    try { child.kill(); } catch { /* already gone */ }
    this.set(state);
  }

  /** Frees the model's memory. A later dictation starts a new process. */
  shutdown(): void {
    const child = this.child;
    this.generation++;
    this.cancelLoading?.();
    this.loading = null;
    if (!child) { this.set('stopped'); return; }
    this.child = null;
    try { child.postMessage({ type: 'shutdown' } satisfies SpeechWorkerCommand); } catch { /* the kill below is enough */ }
    setTimeout(() => { try { child.kill(); } catch { /* already gone */ } }, 1_000).unref();
    this.set('stopped');
  }
}
