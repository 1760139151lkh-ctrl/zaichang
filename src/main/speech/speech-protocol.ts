import type { SpeechLanguage } from '../../shared/speech-text';

/*
 * Messages between Electron main and the speech utility process, plus the
 * recognizer tuning. This file holds types and numbers only, so the worker bundle
 * does not pull Electron or the model lock into the separate process.
 */

export const SPEECH_ENGINE = Object.freeze({
  /** Silero voice detector: when a stretch of speech starts and ends. */
  vad: Object.freeze({ threshold: 0.5, minSilenceSeconds: 0.5, minSpeechSeconds: 0.2, maxSpeechSeconds: 18, windowSize: 512 }),
  /** Audio kept in front of a detected start, so the first sound is not clipped (300 ms). */
  prerollSamples: 4_800,
  /** Audio kept after a detected end, so the last sound is not clipped (200 ms). */
  postrollSamples: 3_200,
  /** A tentative result is refreshed at most this often while someone is still talking. */
  partialEveryMs: 450,
  /** ...and only when at least this much new audio has arrived since the last one (250 ms). */
  partialMinGrowthSamples: 4_000,
  /** The first guess for a stretch waits for this much speech (450 ms): shorter windows produce stray characters. */
  firstPartialMinSamples: 7_200,
  /** Rolling audio memory for building decode windows. */
  ringSamples: 16_000 * 40,
  /** Finals waiting for the recognizer beyond this means the computer cannot keep up. */
  maxPendingFinals: 6,
  /** Call gc() after this many throwaway recognizer streams (native memory is not visible to the collector). */
  collectEvery: 24,
});

export interface SpeechWorkerFiles { model: string; tokens: string; vad: string }

export type SpeechWorkerCommand =
  | { type: 'init'; files: SpeechWorkerFiles; threads: number }
  | { type: 'begin'; sessionId: string; language: SpeechLanguage }
  | { type: 'audio'; sessionId: string; samples: Float32Array }
  /** Flush the voice detector, decode what is left, then report 'finished'. */
  | { type: 'finish'; sessionId: string }
  /** Drop everything for this session without producing text. */
  | { type: 'abort'; sessionId: string }
  | { type: 'shutdown' };

export type SpeechWorkerFault = 'model_load' | 'runtime_load' | 'decode' | 'overloaded' | 'protocol';

export type SpeechWorkerEvent =
  | { type: 'loaded'; loadMs: number; runtime: { sherpa: string; onnxruntime: string } }
  | { type: 'began'; sessionId: string }
  | { type: 'speech'; sessionId: string; speaking: boolean }
  | { type: 'partial'; sessionId: string; segmentId: number; text: string }
  | { type: 'final'; sessionId: string; segmentId: number; text: string; audioMs: number; decodeMs: number }
  | { type: 'discard'; sessionId: string; segmentId: number }
  | { type: 'finished'; sessionId: string }
  | { type: 'fault'; code: SpeechWorkerFault; sessionId?: string; detail?: string };
