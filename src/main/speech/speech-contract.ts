import { createHash } from 'node:crypto';
import speechLock from '../../../runtime/speech/lock.json';

export interface SpeechLockFile { path: string; bytes: number; sha256: string; sources: readonly string[] }
/** Recognizer and vocabulary shipped with the speech runtime. */
export const SPEECH_DOWNLOADS: readonly SpeechLockFile[] = speechLock.download;
export const SPEECH_DOWNLOAD_BYTES = SPEECH_DOWNLOADS.reduce((sum, file) => sum + file.bytes, 0);
export const SPEECH_MODEL_ID: string = speechLock.modelId;
/** Fingerprint of what the lock asks for; an installed model is only trusted if it was verified against the same one. */
export const SPEECH_LOCK_SHA256 = createHash('sha256').update(JSON.stringify(
  speechLock.download.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })))).digest('hex');

export const SPEECH_PATHS = Object.freeze({
  model: 'sense-voice/model.int8.onnx',
  tokens: 'sense-voice/tokens.txt',
  vad: 'vad/silero_vad.onnx',
  marker: 'manifest.json',
});

export const SPEECH_WORKER_FILE = 'worker.cjs';
