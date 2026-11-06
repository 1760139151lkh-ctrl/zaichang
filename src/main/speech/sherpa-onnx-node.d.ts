/*
 * The npm package ships JSDoc typedefs but no declaration file. This is the small
 * part of it the speech worker uses (sherpa-onnx-node 2.0.1, see runtime/speech/lock.json).
 */
declare module 'sherpa-onnx-node' {
  export interface Waveform { samples: Float32Array; sampleRate: number }
  export interface OfflineRecognizerResult {
    text: string;
    tokens?: string[];
    timestamps?: number[];
    lang?: string;
    emotion?: string;
    event?: string;
  }
  export class OfflineStream {
    acceptWaveform(waveform: Waveform): void;
    setOption(key: string, value: string): void;
  }
  export interface OfflineRecognizerConfig {
    featConfig?: { sampleRate?: number; featureDim?: number };
    modelConfig?: {
      senseVoice?: { model?: string; language?: string; useInverseTextNormalization?: number };
      tokens?: string;
      numThreads?: number;
      debug?: boolean | number;
      provider?: string;
    };
  }
  export class OfflineRecognizer {
    constructor(config: OfflineRecognizerConfig);
    static createAsync(config: OfflineRecognizerConfig): Promise<OfflineRecognizer>;
    createStream(hotwords?: string): OfflineStream;
    setConfig(config: OfflineRecognizerConfig): void;
    decodeAsync(stream: OfflineStream): Promise<OfflineRecognizerResult>;
    getResult(stream: OfflineStream): OfflineRecognizerResult;
  }
  export interface SpeechSegment { start: number; samples: Float32Array }
  export interface VadConfig {
    sileroVad?: { model?: string; threshold?: number; minSilenceDuration?: number; minSpeechDuration?: number; windowSize?: number; maxSpeechDuration?: number };
    sampleRate?: number;
    numThreads?: number;
    provider?: string;
    debug?: boolean | number;
  }
  export class Vad {
    constructor(config: VadConfig, bufferSizeInSeconds: number);
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    isDetected(): boolean;
    pop(): void;
    clear(): void;
    front(enableExternalBuffer?: boolean): SpeechSegment;
    reset(): void;
    flush(): void;
  }
  export function readWave(filename: string, enableExternalBuffer?: boolean): Waveform;
  export const version: unknown;
  export const onnxruntimeVersion: unknown;
}
