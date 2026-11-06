import { SPEECH_AUDIO } from '../../shared/speech-text';
import workletUrl from './pcm-capture.worklet.ts?worker&url';

/*
 * Microphone -> 100 ms pieces of 16 kHz mono float audio. The page only captures; the
 * recognizer lives in the main process's speech runtime, and nothing here is recorded
 * or kept.
 *
 * MOBILE: the phone app captures natively (AVAudioEngine on iOS first, AudioRecord on
 * Android) and asks the platform for microphone permission; the pieces it hands to the
 * recognizer are identical.
 */

export type MicrophoneProblem = 'denied' | 'missing' | 'busy' | 'failed';
export class MicrophoneError extends Error {
  constructor(readonly problem: MicrophoneProblem) { super(problem); this.name = 'MicrophoneError'; }
}

export interface Microphone {
  readonly label: string;
  /** Sends the audio still waiting in the buffer, so the last words are not left behind. */
  flush(): Promise<void>;
  close(): void;
}

function classify(error: unknown): MicrophoneProblem {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'failed';
}

async function openStream(deviceId: string | undefined): Promise<MediaStream> {
  const base = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (deviceId) {
    try { return await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: deviceId } } }); }
    catch (error) { if (classify(error) !== 'missing') throw error; /* the chosen microphone is gone: use the default */ }
  }
  return navigator.mediaDevices.getUserMedia({ audio: base });
}

export async function openMicrophone(options: {
  deviceId?: string;
  onChunk: (samples: Float32Array, rms: number) => void;
  onLost: () => void;
}): Promise<Microphone> {
  let stream: MediaStream;
  try { stream = await openStream(options.deviceId); }
  catch (error) { throw new MicrophoneError(classify(error)); }
  let context: AudioContext | undefined;
  try {
    context = new AudioContext({ sampleRate: SPEECH_AUDIO.sampleRate, latencyHint: 'interactive' });
    await context.audioWorklet.addModule(workletUrl);
    if (context.state === 'suspended') await context.resume();
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'zaichang-pcm', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const mute = context.createGain();
    mute.gain.value = 0;
    // The graph has to end at the destination to be pulled; the gain keeps it silent.
    source.connect(node).connect(mute).connect(context.destination);
    let flushed: (() => void) | undefined;
    node.port.onmessage = (event: MessageEvent<{ type: string; samples?: Float32Array; rms?: number }>) => {
      const data = event.data;
      if (data.type === 'chunk' && data.samples) options.onChunk(data.samples, data.rms ?? 0);
      else if (data.type === 'flushed') flushed?.();
    };
    const track = stream.getAudioTracks()[0];
    track?.addEventListener('ended', options.onLost, { once: true });
    const opened = context;
    return {
      label: track?.label ?? '',
      flush: () => new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 400);
        flushed = () => { clearTimeout(timer); resolve(); };
        node.port.postMessage('flush');
      }),
      close: () => {
        track?.removeEventListener('ended', options.onLost);
        try { node.port.postMessage('stop'); node.disconnect(); source.disconnect(); mute.disconnect(); } catch { /* already torn down */ }
        stream.getTracks().forEach(item => item.stop());
        void opened.close().catch(() => undefined);
      },
    };
  } catch {
    stream.getTracks().forEach(item => item.stop());
    void context?.close().catch(() => undefined);
    throw new MicrophoneError('failed');
  }
}
