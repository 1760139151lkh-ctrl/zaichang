import os from 'node:os';
import v8 from 'node:v8';
import vm from 'node:vm';
import { cleanSpeechText, SPEECH_AUDIO, type SpeechLanguage } from '../../shared/speech-text';
import {
  SPEECH_ENGINE, type SpeechWorkerCommand, type SpeechWorkerEvent, type SpeechWorkerFault, type SpeechWorkerFiles,
} from './speech-protocol';
import type * as Sherpa from 'sherpa-onnx-node';

/*
 * The recognizer, in its own OS process.
 *
 * Why a separate process: sherpa-onnx ships its own onnxruntime.dll (1.28.x) and the
 * memory index already loads onnxruntime-node (1.30.x) inside the main process.
 * Two different DLLs with the same name cannot live in one Windows process, and a
 * native crash here must never take the app down.
 *
 * How it listens: a small neural voice detector (Silero) cuts the stream into spoken
 * stretches. While a stretch is still open, the audio so far is re-read by SenseVoice
 * every ~0.45 s, so words appear while the person is still talking ("partial"). When the
 * stretch ends it is read once more, with a little audio on both sides, and that careful
 * reading, with punctuation and numbers written the usual way, replaces the guess
 * ("final"). This is rolling-window recognition, not a stateful streaming model;
 * throughput depends on the CPU. The bounded windows and queue limit keep it from
 * accumulating unbounded work on a slower computer.
 *
 * MOBILE: the phone app keeps this shape (detector -> partial -> final) but should read
 * partials from a small streaming model (e.g. streaming Zipformer CTC, ~25 MB) instead of
 * re-reading with SenseVoice, to save battery. Same events, same SenseVoice for finals.
 */

type Ctx = typeof Sherpa;
type Stretch = { id: number; audio: Float32Array; startedAt: number };

/**
 * A guess for words still being spoken should not end a sentence: the model closes every window
 * with a full stop, which then jumps around as more words arrive. Only the final keeps it.
 */
const unfinished = (text: string) => text.replace(/[\s。．.！!？?，,、；;：:…]+$/u, '');

/** Rolling audio memory addressed by absolute sample index. */
class Ring {
  private chunks: { start: number; data: Float32Array }[] = [];
  private end = 0;
  constructor(private readonly capacity: number) {}
  push(start: number, data: Float32Array): void {
    this.chunks.push({ start, data });
    this.end = start + data.length;
    while (this.chunks.length > 1 && this.end - this.chunks[0].start > this.capacity + this.chunks[0].data.length) this.chunks.shift();
  }
  get first(): number { return this.chunks[0]?.start ?? 0; }
  slice(from: number, to: number): Float32Array {
    const a = Math.max(from, this.first), b = Math.min(to, this.end);
    if (b <= a) return new Float32Array(0);
    const out = new Float32Array(b - a);
    let at = 0;
    for (const chunk of this.chunks) {
      const s = chunk.start, e = s + chunk.data.length;
      if (e <= a) continue;
      if (s >= b) break;
      const x = Math.max(a, s), y = Math.min(b, e);
      out.set(chunk.data.subarray(x - s, y - s), at);
      at += y - x;
    }
    return out;
  }
}

interface Session {
  id: string;
  vad: Sherpa.Vad;
  ring: Ring;
  total: number;
  speaking: boolean;
  /** Spoken stretches that started but have no final yet, oldest first. */
  open: number[];
  nextSegment: number;
  onset: number;
  lastEnd: number;
  finals: Stretch[];
  partial: { id: number; from: number; to: number } | null;
  shown: Map<number, string>;
  lastPartialAt: number;
  lastPartialTotal: number;
  busy: boolean;
  finishing: boolean;
  aborted: boolean;
}

export class SpeechCore {
  private sherpa: Ctx | null = null;
  private recognizer: Sherpa.OfflineRecognizer | null = null;
  private files: SpeechWorkerFiles | null = null;
  private threads = 2;
  private language = '';
  private session: Session | null = null;
  private streamsMade = 0;
  private beginGeneration = 0;
  private pendingSession: string | null = null;

  constructor(private readonly send: (event: SpeechWorkerEvent) => void, private readonly collect?: () => void,
    private readonly now: () => number = () => Date.now()) {}

  private fault(code: SpeechWorkerFault, sessionId?: string, error?: unknown): void {
    // Native and library errors can carry local paths; only the message class goes back.
    this.send({ type: 'fault', code, ...(sessionId ? { sessionId } : {}), ...(error instanceof Error ? { detail: error.name } : {}) });
  }

  private config(language: string): Sherpa.OfflineRecognizerConfig {
    const files = this.files!;
    return {
      featConfig: { sampleRate: SPEECH_AUDIO.sampleRate, featureDim: 80 },
      modelConfig: {
        senseVoice: { model: files.model, language, useInverseTextNormalization: 1 },
        tokens: files.tokens, numThreads: this.threads, debug: 0, provider: 'cpu',
      },
    };
  }

  async init(files: SpeechWorkerFiles, threads: number): Promise<void> {
    const started = this.now();
    this.files = files;
    this.threads = Math.max(1, Math.min(8, Math.floor(threads) || 2));
    // A plain require keeps the native addon an external of this CommonJS bundle (no namespace wrapper).
    try { this.sherpa = require('sherpa-onnx-node') as Ctx; }
    catch (error) { this.fault('runtime_load', undefined, error); return; }
    try { this.recognizer = await this.sherpa.OfflineRecognizer.createAsync(this.config('')); this.language = ''; }
    catch (error) { this.fault('model_load', undefined, error); return; }
    this.send({ type: 'loaded', loadMs: this.now() - started,
      runtime: { sherpa: String(this.sherpa.version ?? ''), onnxruntime: String(this.sherpa.onnxruntimeVersion ?? '') } });
  }

  /** SenseVoice reads its language hint when the recognizer is built; change it by rebuilding. */
  private async applyLanguage(language: SpeechLanguage, generation: number): Promise<void> {
    const wanted = language === 'auto' ? '' : language;
    if (wanted === this.language || !this.sherpa || !this.files) return;
    const recognizer = await this.sherpa.OfflineRecognizer.createAsync(this.config(wanted));
    if (generation !== this.beginGeneration) return;
    this.recognizer = recognizer;
    this.language = wanted;
    // The replaced recognizer holds ~300 MB of native memory that V8 cannot see; collect it now,
    // and once more after pending native finalizers have had a turn.
    this.collect?.();
    await new Promise<void>(resolve => setImmediate(resolve));
    this.collect?.();
  }

  async begin(sessionId: string, language: SpeechLanguage): Promise<void> {
    if (!this.sherpa || !this.recognizer || !this.files) { this.fault('protocol', sessionId); return; }
    this.abortSession();
    const generation = ++this.beginGeneration;
    this.pendingSession = sessionId;
    try { await this.applyLanguage(language, generation); }
    catch (error) { this.fault('model_load', sessionId, error); return; }
    if (generation !== this.beginGeneration) return;
    this.pendingSession = null;
    const { sherpa } = this;
    const v = SPEECH_ENGINE.vad;
    const vad = new sherpa.Vad({
      sileroVad: { model: this.files.vad, threshold: v.threshold, minSilenceDuration: v.minSilenceSeconds,
        minSpeechDuration: v.minSpeechSeconds, windowSize: v.windowSize, maxSpeechDuration: v.maxSpeechSeconds },
      sampleRate: SPEECH_AUDIO.sampleRate, numThreads: 1, provider: 'cpu', debug: 0,
    }, 60);
    this.session = { id: sessionId, vad, ring: new Ring(SPEECH_ENGINE.ringSamples), total: 0, speaking: false, open: [],
      nextSegment: 1, onset: 0, lastEnd: 0, finals: [], partial: null, shown: new Map(), lastPartialAt: 0, lastPartialTotal: 0,
      busy: false, finishing: false, aborted: false };
    this.send({ type: 'began', sessionId });
  }

  audio(sessionId: string, samples: Float32Array): void {
    const s = this.session;
    if (!s || s.id !== sessionId || s.aborted || s.finishing) return;
    if (!(samples instanceof Float32Array) || samples.length === 0 || samples.length > SPEECH_AUDIO.maxChunkSamples) {
      this.fault('protocol', sessionId);
      return;
    }
    try {
      const start = s.total;
      s.total += samples.length;
      s.ring.push(start, samples);
      s.vad.acceptWaveform(samples);
      this.collectStretches(s);
      this.followSpeech(s);
      this.maybeGuess(s);
      this.pump(s);
    } catch (error) { this.fault('decode', sessionId, error); this.abortSession(); }
  }

  /** Spoken stretches the detector has closed become finals. */
  private collectStretches(s: Session): void {
    const pad = SPEECH_ENGINE;
    while (!s.vad.isEmpty()) {
      const stretch = s.vad.front(false);
      s.vad.pop();
      const end = stretch.start + stretch.samples.length;
      const from = Math.max(s.lastEnd, stretch.start - pad.prerollSamples), to = Math.min(s.total, end + pad.postrollSamples);
      const audio = s.ring.slice(from, to);
      const id = s.open.shift() ?? s.nextSegment++;
      if (s.partial?.id === id) s.partial = null;
      s.finals.push({ id, audio: audio.length ? audio : stretch.samples, startedAt: this.now() });
      s.lastEnd = end;
      if (s.finals.length > SPEECH_ENGINE.maxPendingFinals) {
        this.fault('overloaded', s.id);
        this.abortSession();
        return;
      }
    }
  }

  private followSpeech(s: Session): void {
    const detected = s.vad.isDetected();
    if (detected && !s.speaking) {
      s.speaking = true;
      s.onset = Math.max(s.lastEnd, s.total - SPEECH_ENGINE.prerollSamples - 3_200);
      if (!s.open.length) s.open.push(s.nextSegment++);
      this.send({ type: 'speech', sessionId: s.id, speaking: true });
    } else if (detected && !s.open.length) {
      // The detector split a very long stretch; speech simply continues.
      s.onset = s.lastEnd;
      s.open.push(s.nextSegment++);
    } else if (!detected && s.speaking) {
      s.speaking = false;
      this.send({ type: 'speech', sessionId: s.id, speaking: false });
    }
    if (!detected) {
      // A blip the detector dropped (too short to be speech): take back its tentative text.
      for (const id of s.open.splice(0)) this.dropTentative(s, id);
    }
  }

  private dropTentative(s: Session, id: number): void {
    if (s.partial?.id === id) s.partial = null;
    if (s.shown.delete(id)) this.send({ type: 'discard', sessionId: s.id, segmentId: id });
  }

  private maybeGuess(s: Session): void {
    if (!s.speaking || !s.open.length) return;
    if (!s.shown.has(s.open[0]) && s.total - s.onset < SPEECH_ENGINE.firstPartialMinSamples) return;
    const t = this.now();
    if (t - s.lastPartialAt < SPEECH_ENGINE.partialEveryMs || s.total - s.lastPartialTotal < SPEECH_ENGINE.partialMinGrowthSamples) return;
    s.partial = { id: s.open[0], from: Math.max(s.onset - SPEECH_ENGINE.prerollSamples, s.lastEnd), to: s.total };
    s.lastPartialAt = t;
    s.lastPartialTotal = s.total;
  }

  /** One read at a time: closed stretches first, then the freshest guess. */
  private pump(s: Session): void {
    if (s.busy || s.aborted) return;
    void (async () => {
      s.busy = true;
      try {
        for (;;) {
          if (s.aborted) return;
          const final = s.finals.shift();
          if (final) {
            const t = this.now();
            const text = await this.read(final.audio);
            if (s.aborted) return;
            const decodeMs = this.now() - t;
            s.shown.delete(final.id);
            if (text) this.send({ type: 'final', sessionId: s.id, segmentId: final.id, text,
              audioMs: Math.round(final.audio.length * 1000 / SPEECH_AUDIO.sampleRate), decodeMs });
            else this.send({ type: 'discard', sessionId: s.id, segmentId: final.id });
            continue;
          }
          const guess = s.finishing ? null : s.partial;
          if (!guess) break;
          s.partial = null;
          const audio = s.ring.slice(guess.from, guess.to);
          const text = unfinished(await this.read(audio));
          if (s.aborted) return;
          // A guess that was overtaken by its own final, or by a dropped blip, is stale.
          if (!s.open.includes(guess.id) || !text || s.shown.get(guess.id) === text) continue;
          s.shown.set(guess.id, text);
          this.send({ type: 'partial', sessionId: s.id, segmentId: guess.id, text });
        }
      } catch (error) {
        if (!s.aborted) { this.fault('decode', s.id, error); this.abortSession(); }
        return;
      } finally { s.busy = false; }
      if (s.aborted) return;
      if (s.finals.length || s.partial && !s.finishing) { this.pump(s); return; }
      if (s.finishing) {
        this.session = null;
        this.send({ type: 'finished', sessionId: s.id });
      }
    })();
  }

  private async read(audio: Float32Array): Promise<string> {
    // Too little sound for the model to say anything honest.
    const recognizer = this.recognizer;
    if (!recognizer || audio.length < 1_600) return '';
    const stream = recognizer.createStream();
    stream.acceptWaveform({ sampleRate: SPEECH_AUDIO.sampleRate, samples: audio });
    const result = await recognizer.decodeAsync(stream);
    // Native stream memory is invisible to the collector; release it on a schedule.
    if (++this.streamsMade % SPEECH_ENGINE.collectEvery === 0) this.collect?.();
    return cleanSpeechText(result.text ?? '');
  }

  finish(sessionId: string): void {
    const s = this.session;
    if (!s || s.id !== sessionId) { this.send({ type: 'finished', sessionId }); return; }
    if (s.finishing) return;
    try {
      s.vad.flush();
      this.collectStretches(s);
      s.speaking = false;
      for (const id of s.open.splice(0)) this.dropTentative(s, id);
      s.partial = null;
      s.finishing = true;
    } catch (error) { this.fault('decode', sessionId, error); this.abortSession(); this.send({ type: 'finished', sessionId }); return; }
    if (!s.busy && !s.finals.length) { this.session = null; this.send({ type: 'finished', sessionId }); return; }
    this.pump(s);
  }

  abort(sessionId: string): void {
    if (this.pendingSession === sessionId) { this.beginGeneration++; this.pendingSession = null; }
    if (this.session?.id === sessionId) this.abortSession();
  }

  private abortSession(): void {
    const s = this.session;
    if (!s) return;
    s.aborted = true;
    s.finals.length = 0;
    s.partial = null;
    this.session = null;
  }

  shutdown(): void {
    this.beginGeneration++;
    this.pendingSession = null;
    this.abortSession();
    this.recognizer = null;
    this.sherpa = null;
  }
}

/** Binds the core to the utility-process channel. Does nothing when imported elsewhere (tests, tools). */
interface ParentPort { on(event: 'message', listener: (message: { data: unknown }) => void): void; postMessage(value: unknown): void }
const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
if (parentPort) {
  try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* Priority is a courtesy to the interface thread. */ }
  // Native recognizer streams are invisible to V8's collector; get a gc() handle without a launch flag.
  const collect = (() => {
    try { v8.setFlagsFromString('--expose_gc'); return vm.runInNewContext('gc') as () => void; } catch { return undefined; }
  })();
  const core = new SpeechCore(event => parentPort.postMessage(event), collect);
  const route = (command: SpeechWorkerCommand) => {
    switch (command.type) {
      case 'init': return core.init(command.files, command.threads);
      case 'begin': return core.begin(command.sessionId, command.language);
      case 'audio': return core.audio(command.sessionId, command.samples);
      case 'finish': return core.finish(command.sessionId);
      case 'abort': return core.abort(command.sessionId);
      case 'shutdown': core.shutdown(); return process.exit(0);
    }
  };
  parentPort.on('message', ({ data }) => {
    if (!data || typeof data !== 'object' || typeof (data as { type?: unknown }).type !== 'string') return;
    void Promise.resolve(route(data as SpeechWorkerCommand)).catch(() => parentPort.postMessage({ type: 'fault', code: 'protocol' } satisfies SpeechWorkerEvent));
  });
  // After an unexpected error the state is unknown: say so, then exit so the host starts a clean one.
  const lost = () => { parentPort.postMessage({ type: 'fault', code: 'decode' } satisfies SpeechWorkerEvent); setTimeout(() => process.exit(1), 60); };
  process.on('uncaughtException', lost);
  process.on('unhandledRejection', lost);
}
