import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { shell, systemPreferences } from 'electron';
import {
  joinSpeechText, SPEECH_AUDIO, SPEECH_MESSAGES, type SpeechEndReason, type SpeechEndReceipt, type SpeechErrorCode, type SpeechEvent,
  type SpeechLanguage, type SpeechMicrophoneAccess, type SpeechModelStatus, type SpeechStartInput, type SpeechStartResult, type SpeechStatus,
} from '../../shared/speech';
import { SPEECH_PATHS, SPEECH_WORKER_FILE } from './speech-contract';
import { SpeechClipboard } from './speech-clipboard';
import { SpeechEngine } from './speech-engine';
import { SpeechModelStore, type SpeechModelPlaces } from './speech-models';
import type { SpeechWorkerEvent, SpeechWorkerFiles } from './speech-protocol';

export interface SpeechServiceOptions {
  /** Folder that holds worker.cjs, node_modules/sherpa-onnx-* and vad/ (the staged speech runtime). */
  runtimeRoot: string;
  models: SpeechModelPlaces;
  send: (event: SpeechEvent) => void;
  isPublic: () => boolean;
}

interface Session {
  id: string;
  language: SpeechLanguage;
  keep: boolean;
  startedAt: number;
  openedAt: number | null;
  state: 'preparing' | 'listening' | 'finishing' | 'ended';
  nextSequence: number;
  samples: number;
  queue: Float32Array[];
  queuedSamples: number;
  finals: Map<number, string>;
  speaking: boolean;
  sawSpeech: boolean;
  lastSpeechAt: number;
  ready: Promise<boolean>;
  markReady: (ok: boolean) => void;
  flushed: ((ok: boolean) => void) | null;
  receipt: Promise<SpeechEndReceipt> | null;
  cancelReason: 'cancelled' | 'private' | null;
  ticker: ReturnType<typeof setInterval>;
}

const ENGINE_IDLE_MS = 5 * 60_000;
const WAIT_FOR_ENGINE_MS = 20_000;
const FLUSH_TIMEOUT_MS = 6_000;
const delay = <T>(ms: number, value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms).unref());

function microphoneAccess(): SpeechMicrophoneAccess {
  try { return systemPreferences.getMediaAccessStatus('microphone'); } catch { return 'unknown'; }
}

/**
 * Local voice input for the desktop app: one dictation at a time, text only.
 * It never sends a message, never saves a note, and keeps no audio; the finished
 * words go to the field the person was writing in (the renderer does that) and,
 * if they allow it, stay on the clipboard.
 */
export class SpeechService {
  private session: Session | null = null;
  private readonly models: SpeechModelStore;
  private readonly engine: SpeechEngine;
  private readonly clipboard = new SpeechClipboard();
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly options: SpeechServiceOptions) {
    this.models = new SpeechModelStore(options.models, () => this.sendStatus());
    this.engine = new SpeechEngine({
      workerPath: path.join(options.runtimeRoot, SPEECH_WORKER_FILE),
      files: () => this.workerFiles(),
      onEvent: event => this.fromWorker(event),
      onState: () => this.sendStatus(),
    });
  }

  private get supported(): boolean {
    return process.platform === 'win32' && process.arch === 'x64'
      && existsSync(path.join(this.options.runtimeRoot, SPEECH_WORKER_FILE))
      && existsSync(path.join(this.options.runtimeRoot, SPEECH_PATHS.vad))
      && existsSync(path.join(this.options.runtimeRoot, 'node_modules', 'sherpa-onnx-node'));
  }

  private workerFiles(): SpeechWorkerFiles | null {
    const directory = this.models.location;
    if (!directory) return null;
    return { model: path.join(directory, SPEECH_PATHS.model), tokens: path.join(directory, SPEECH_PATHS.tokens),
      vad: path.join(this.options.runtimeRoot, SPEECH_PATHS.vad) };
  }

  private snapshot(): SpeechStatus {
    const supported = this.supported;
    const model: SpeechModelStatus = supported ? this.models.status
      : { state: 'unsupported', message: '这个版本的在场还没有带上语音组件。' };
    return { supported, model, microphone: microphoneAccess(), engine: this.engine.current, activeSessionId: this.session?.id ?? null };
  }

  private sendStatus(): void {
    if (!this.disposed) this.options.send({ type: 'status', status: this.snapshot() });
  }

  async status(): Promise<SpeechStatus> {
    if (this.supported) await this.models.refresh();
    return this.snapshot();
  }

  private refuse(code: SpeechErrorCode, message: string = (SPEECH_MESSAGES as Record<string, string>)[code]): SpeechStartResult {
    return { ok: false, code, message };
  }

  async start(input: SpeechStartInput): Promise<SpeechStartResult> {
    if (this.disposed) return this.refuse('unsupported');
    if (this.options.isPublic()) return this.refuse('public_surface');
    if (!this.supported) return this.refuse('unsupported');
    const model = await this.models.refresh();
    if (this.disposed) return this.refuse('unsupported');
    if (this.options.isPublic()) return this.refuse('public_surface');
    if (model.state !== 'ready') return this.refuse(model.state === 'verifying' ? 'model_busy' : 'model_missing');
    if (this.session) await this.finish(this.session, 'replaced');
    if (this.disposed) return this.refuse('unsupported');
    if (this.options.isPublic()) return this.refuse('public_surface');
    clearTimeout(this.idleTimer);

    let markReady!: (ok: boolean) => void;
    const ready = new Promise<boolean>(resolve => { markReady = resolve; });
    const now = Date.now();
    const session: Session = {
      id: randomUUID(), language: input.language, keep: input.keepInClipboard, startedAt: now, openedAt: null, state: 'preparing',
      nextSequence: 0, samples: 0, queue: [], queuedSamples: 0, finals: new Map(), speaking: false, sawSpeech: false, lastSpeechAt: now,
      ready, markReady, flushed: null, receipt: null, cancelReason: null,
      ticker: setInterval(() => this.watch(session), 1_000),
    };
    session.ticker.unref();
    this.session = session;
    const engineWasReady = this.engine.current === 'ready';
    void this.bringUp(session);
    this.sendStatus();
    return { ok: true, sessionId: session.id, sampleRate: SPEECH_AUDIO.sampleRate, engine: engineWasReady ? 'ready' : 'loading' };
  }

  private async bringUp(session: Session): Promise<void> {
    try {
      await this.engine.ensure();
      if (this.session !== session || session.state === 'ended') { session.markReady(false); return; }
      this.engine.post({ type: 'begin', sessionId: session.id, language: session.language });
      // The session becomes ready when the worker answers 'began'.
    } catch {
      session.markReady(false);
      this.fail(session, 'engine_failed');
    }
  }

  /** Audio from the page: 16 kHz mono, numbered from zero. Never throws. */
  audio(sessionId: unknown, sequence: unknown, samples: unknown): void {
    const session = this.session;
    if (!session || session.id !== sessionId || session.state === 'finishing' || session.state === 'ended') return;
    const chunk = samples instanceof Float32Array ? samples
      : samples instanceof ArrayBuffer && samples.byteLength % Float32Array.BYTES_PER_ELEMENT === 0 ? new Float32Array(samples) : null;
    if (!chunk || !chunk.length || chunk.length > SPEECH_AUDIO.maxChunkSamples || !Number.isSafeInteger(sequence)
      || (sequence as number) < 0 || chunk.some(sample => !Number.isFinite(sample))) { this.fail(session, 'invalid_audio'); return; }
    if ((sequence as number) < session.nextSequence) return;
    if (sequence !== session.nextSequence) { this.fail(session, 'invalid_audio'); return; }
    session.nextSequence = (sequence as number) + 1;
    session.samples += chunk.length;
    if (session.samples > SPEECH_AUDIO.maxSessionMs * SPEECH_AUDIO.sampleRate / 1000) { void this.finish(session, 'limit'); return; }
    if (session.state === 'preparing') {
      session.queue.push(chunk);
      session.queuedSamples += chunk.length;
      if (session.queuedSamples > SPEECH_AUDIO.maxQueuedMs * SPEECH_AUDIO.sampleRate / 1000) this.fail(session, 'engine_overloaded');
      return;
    }
    this.engine.post({ type: 'audio', sessionId: session.id, samples: chunk });
  }

  private fromWorker(event: SpeechWorkerEvent): void {
    const session = this.session;
    if (event.type === 'fault') {
      if (session && (!event.sessionId || event.sessionId === session.id)) this.fail(session, event.code === 'overloaded' ? 'engine_overloaded' : 'engine_failed');
      return;
    }
    if (event.type === 'loaded') return;
    if (!session || !('sessionId' in event) || event.sessionId !== session.id || session.state === 'ended' || session.cancelReason) return;
    switch (event.type) {
      case 'began':
        session.state = session.state === 'finishing' ? 'finishing' : 'listening';
        session.openedAt = Date.now();
        session.lastSpeechAt = session.openedAt;
        for (const chunk of session.queue.splice(0)) this.engine.post({ type: 'audio', sessionId: session.id, samples: chunk });
        session.queuedSamples = 0;
        session.markReady(true);
        this.options.send({ type: 'ready', sessionId: session.id });
        this.sendStatus();
        break;
      case 'speech':
        session.speaking = event.speaking;
        if (event.speaking) session.sawSpeech = true;
        session.lastSpeechAt = Date.now();
        this.options.send({ type: 'speech', sessionId: session.id, speaking: event.speaking });
        break;
      case 'partial':
        session.lastSpeechAt = Date.now();
        this.options.send({ type: 'partial', sessionId: session.id, segmentId: event.segmentId, text: event.text });
        break;
      case 'final':
        session.lastSpeechAt = Date.now();
        session.finals.set(event.segmentId, event.text);
        this.options.send({ type: 'final', sessionId: session.id, segmentId: event.segmentId, text: event.text });
        break;
      case 'discard':
        session.finals.delete(event.segmentId);
        this.options.send({ type: 'discard', sessionId: session.id, segmentId: event.segmentId });
        break;
      case 'finished':
        session.flushed?.(true);
        break;
    }
  }

  /** Quiet-time and length limits, checked once a second. */
  private watch(session: Session): void {
    if (session.state !== 'listening' || session.openedAt === null) return;
    const now = Date.now();
    if (now - session.startedAt > SPEECH_AUDIO.maxSessionMs) void this.finish(session, 'limit');
    else if (!session.sawSpeech && now - session.openedAt > SPEECH_AUDIO.firstSpeechTimeoutMs) void this.finish(session, 'silence');
    else if (session.sawSpeech && !session.speaking && now - session.lastSpeechAt > SPEECH_AUDIO.silenceTimeoutMs) void this.finish(session, 'silence');
  }

  private fail(session: Session, code: SpeechErrorCode): void {
    if (session.state === 'ended') return;
    this.options.send({ type: 'error', sessionId: session.id, code, message: (SPEECH_MESSAGES as Record<string, string>)[code] });
    session.markReady(false);
    void this.finish(session, 'error');
  }

  /** Let the recognizer read what is left, then close out: words, clipboard, event. */
  private finish(session: Session, reason: SpeechEndReason): Promise<SpeechEndReceipt> {
    if (session.receipt) return session.receipt;
    session.state = session.state === 'ended' ? 'ended' : 'finishing';
    session.receipt = (async () => {
      // A short phrase can be over before the model has loaded; wait for it so no words are lost.
      const ready = reason === 'error' ? false : await Promise.race([session.ready, delay(WAIT_FOR_ENGINE_MS, false)]);
      if (ready && this.engine.current === 'ready') {
        const flushed = new Promise<boolean>(resolve => { session.flushed = resolve; });
        const complete = this.engine.post({ type: 'finish', sessionId: session.id })
          && await Promise.race([flushed, delay(FLUSH_TIMEOUT_MS, false)]);
        if (!complete && !session.cancelReason) {
          this.options.send({ type: 'error', sessionId: session.id, code: 'engine_failed', message: SPEECH_MESSAGES.engine_failed });
          this.engine.post({ type: 'abort', sessionId: session.id });
          reason = 'error';
        }
      } else if (!session.cancelReason && reason !== 'error') {
        this.options.send({ type: 'error', sessionId: session.id, code: 'engine_failed', message: SPEECH_MESSAGES.engine_failed });
        reason = 'error';
      }
      return this.conclude(session, reason);
    })();
    return session.receipt;
  }

  private async conclude(session: Session, reason: SpeechEndReason): Promise<SpeechEndReceipt> {
    session.state = 'ended';
    clearInterval(session.ticker);
    session.markReady(false);
    const discarded = () => !!session.cancelReason || reason === 'cancelled' || reason === 'private' || this.options.isPublic();
    const transcript = discarded() ? '' : joinSpeechText([...session.finals.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text));
    const clipboard = discarded() || !session.keep ? ({ state: 'off' } as const)
      : await this.clipboard.keep(transcript, () => !discarded() && !this.disposed);
    if (this.session === session) this.session = null;
    const receipt: SpeechEndReceipt = { sessionId: session.id, reason: session.cancelReason ?? reason,
      transcript: discarded() ? '' : transcript, clipboard: discarded() ? { state: 'off' } : clipboard };
    this.armIdle();
    this.options.send({ type: 'ended', ...receipt });
    this.sendStatus();
    return receipt;
  }

  private armIdle(): void {
    clearTimeout(this.idleTimer);
    if (this.disposed) return;
    this.idleTimer = setTimeout(() => { if (!this.session) this.engine.shutdown(); }, ENGINE_IDLE_MS);
    this.idleTimer.unref();
  }

  /** The person pressed stop (or sent the message): keep what was heard. */
  async stop(sessionId: string): Promise<SpeechEndReceipt> {
    const session = this.session;
    if (!session || session.id !== sessionId) return { sessionId, reason: 'stopped', transcript: '', clipboard: { state: 'off' } };
    return this.finish(session, 'stopped');
  }

  /** Throw away the unfinished words. */
  async cancel(sessionId: string): Promise<void> {
    const session = this.session;
    if (session && session.id === sessionId) await this.cancelActive('cancelled');
  }

  private async cancelActive(reason: 'cancelled' | 'private'): Promise<void> {
    const session = this.session;
    if (!session) return;
    session.cancelReason = reason;
    session.markReady(false);
    session.flushed?.(false);
    this.engine.post({ type: 'abort', sessionId: session.id });
    session.receipt ??= this.conclude(session, reason);
    await session.receipt;
  }

  /** The window went away, the screen locked, or the view turned public. */
  async endActive(reason: 'hidden' | 'private'): Promise<void> {
    if (reason === 'private') { this.clipboard.forget(); this.options.send({ type: 'reset' }); }
    const session = this.session;
    if (!session) return;
    if (reason === 'private') await this.cancelActive('private');
    else await this.finish(session, 'hidden');
  }

  async restoreClipboard(): Promise<{ restored: boolean }> { return { restored: this.options.isPublic() ? false : await this.clipboard.restore() }; }

  async openMicrophoneSettings(): Promise<void> { await shell.openExternal('ms-settings:privacy-microphone'); }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.idleTimer);
    const session = this.session;
    if (session) { clearInterval(session.ticker); this.engine.post({ type: 'abort', sessionId: session.id }); this.session = null; }
    this.engine.shutdown();
    this.clipboard.forget();
  }
}
