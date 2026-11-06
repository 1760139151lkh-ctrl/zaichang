/*
 * Runs inside the browser's audio thread. It cuts the microphone stream into 100 ms
 * pieces of 16 kHz mono float audio (the format the recognizer wants) and reports how
 * loud each piece was. The page asks for a 16 kHz audio context, so normally nothing
 * is resampled here; the averaging fallback only exists for a context that refuses.
 *
 * MOBILE: replaced by AVAudioEngine (iOS) / AudioRecord (Android) feeding the same pieces.
 */
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, processor: new (options?: unknown) => AudioWorkletProcessor): void;

const TARGET_RATE = 16_000;
const CHUNK = 1_600;

class PcmCapture extends AudioWorkletProcessor {
  private readonly chunk = new Float32Array(CHUNK);
  private filled = 0;
  private energy = 0;
  private readonly step = sampleRate / TARGET_RATE;
  private phase = 0;
  private sum = 0;
  private count = 0;
  private stopped = false;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      if (event.data === 'flush') { this.emit(); this.port.postMessage({ type: 'flushed' }); }
      else if (event.data === 'stop') this.stopped = true;
    };
  }

  private emit(): void {
    if (!this.filled) return;
    const samples = this.chunk.slice(0, this.filled);
    this.port.postMessage({ type: 'chunk', samples, rms: Math.sqrt(this.energy / this.filled) }, [samples.buffer]);
    this.filled = 0;
    this.energy = 0;
  }

  private push(sample: number): void {
    this.chunk[this.filled++] = sample;
    this.energy += sample * sample;
    if (this.filled === CHUNK) this.emit();
  }

  process(inputs: Float32Array[][]): boolean {
    if (this.stopped) return false;
    const input = inputs[0]?.[0];
    if (!input) return true;
    if (this.step === 1) {
      for (let i = 0; i < input.length; i++) this.push(input[i]);
      return true;
    }
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count++;
      this.phase += 1;
      if (this.phase >= this.step) {
        this.phase -= this.step;
        this.push(this.sum / this.count);
        this.sum = 0;
        this.count = 0;
      }
    }
    return true;
  }
}

registerProcessor('zaichang-pcm', PcmCapture);
