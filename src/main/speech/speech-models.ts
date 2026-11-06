import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { SPEECH_MESSAGES, type SpeechModelStatus } from '../../shared/speech';
import { SPEECH_DOWNLOAD_BYTES, SPEECH_DOWNLOADS, SPEECH_LOCK_SHA256, SPEECH_MODEL_ID, SPEECH_PATHS } from './speech-contract';

export interface SpeechModelPlaces {
  /** Explicit local model folder for development or offline deployments. */
  override?: string;
  /** The model included with the application, also in the development runtime. */
  packaged?: string;
  /** Read older installations without moving or deleting their files. */
  installDir: string;
}

interface Marker {
  version: 1; modelId: string; lockSha256: string;
  files: { path: string; bytes: number; sha256: string; mtimeMs: number }[];
}

async function digest(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function readMarker(directory: string): Promise<Marker | null> {
  try {
    const file = path.join(directory, SPEECH_PATHS.marker), info = await stat(file);
    if (!info.isFile() || info.size > 64 * 1024) return null;
    const marker = JSON.parse(await readFile(file, 'utf8')) as Marker;
    return marker.version === 1 && marker.modelId === SPEECH_MODEL_ID && marker.lockSha256 === SPEECH_LOCK_SHA256 && Array.isArray(marker.files) ? marker : null;
  } catch { return null; }
}

/** Runtime only reads shipped local files. It never downloads a model or opens a setup flow. */
export class SpeechModelStore {
  private current: SpeechModelStatus = { state: 'missing', totalBytes: SPEECH_DOWNLOAD_BYTES };
  private directory: string | null = null;
  private refreshing: Promise<SpeechModelStatus> | null = null;
  private verified = new Map<string, string>();

  constructor(private readonly places: SpeechModelPlaces, private readonly onChange: (status: SpeechModelStatus) => void) {}
  get status(): SpeechModelStatus { return this.current; }
  get location(): string | null { return this.current.state === 'ready' ? this.directory : null; }
  private set(next: SpeechModelStatus): SpeechModelStatus { this.current = next; this.onChange(next); return next; }

  refresh(): Promise<SpeechModelStatus> {
    if (this.refreshing) return this.refreshing;
    return this.refreshing = this.inspect().finally(() => { this.refreshing = null; });
  }

  private async inspect(): Promise<SpeechModelStatus> {
    let damaged = false;
    for (const directory of [this.places.override, this.places.packaged, this.places.installDir]) {
      if (!directory) continue;
      const infos = await Promise.all(SPEECH_DOWNLOADS.map(file => stat(path.join(directory, file.path)).catch(() => null)));
      if (!infos.every((info, i) => info?.isFile() && info.size === SPEECH_DOWNLOADS[i].bytes)) {
        damaged ||= infos.some(info => !!info);
        continue;
      }
      const signature = infos.map(info => info!.size + ':' + info!.mtimeMs).join('|');
      const marker = await readMarker(directory);
      const stamped = SPEECH_DOWNLOADS.every((file, i) => marker?.files.some(item => item.path === file.path
        && item.bytes === file.bytes && item.sha256 === file.sha256 && Math.round(item.mtimeMs) === Math.round(infos[i]!.mtimeMs)));
      if (this.verified.get(directory) !== signature && !stamped) {
        this.set({ state: 'verifying', totalBytes: SPEECH_DOWNLOAD_BYTES });
        let valid = true;
        for (const file of SPEECH_DOWNLOADS) {
          if (await digest(path.join(directory, file.path)).catch(() => '') !== file.sha256) { valid = false; break; }
        }
        if (!valid) { damaged = true; continue; }
      }
      this.verified.set(directory, signature);
      this.directory = directory;
      return this.set({ state: 'ready', totalBytes: SPEECH_DOWNLOAD_BYTES });
    }
    this.directory = null;
    return this.set(damaged
      ? { state: 'failed', reason: 'integrity', message: SPEECH_MESSAGES.integrity_failed, totalBytes: SPEECH_DOWNLOAD_BYTES }
      : { state: 'missing', totalBytes: SPEECH_DOWNLOAD_BYTES });
  }
}
