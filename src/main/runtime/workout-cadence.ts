import type { WorkoutCadenceObservation } from '../../shared/workout';

const WINDOW_MS = 30_000;
const FRESH_MS = 15_000;
const MIN_WINDOW_MS = 4_000;
const MIN_STEPS = 3;
const MAX_STEPS_PER_MINUTE = 400;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export interface WorkoutCadenceEstimate {
  stepsPerMinute: number | null;
  windowMs: number | null;
  source: WorkoutCadenceObservation['source'];
  status: WorkoutCadenceObservation['status'] | 'warming-up' | 'measured' | 'stale';
}

/** A short sensor-derived estimate. GPS, stride length and speed never enter it. */
export class WorkoutCadenceEstimator {
  private latest?: WorkoutCadenceObservation;
  private identity = '';
  private samples: { elapsedMs: number; steps: number }[] = [];

  reset() { this.latest = undefined; this.identity = ''; this.samples = []; }

  observe(value: WorkoutCadenceObservation): boolean {
    if (!value || !['listening', 'unsupported', 'denied', 'unavailable', 'stopped'].includes(value.status)
      || ![null, 'android-step-detector', 'android-step-counter'].includes(value.source)
      || !['granted', 'denied', 'not-required', 'unknown'].includes(value.permission)
      || !['device', 'simulated', 'unknown'].includes(value.provenance)
      || ![value.deviceId, value.clockId, value.subscriptionId].every(text => typeof text === 'string' && text.length > 0 && text.length <= 256)
      || !Number.isSafeInteger(value.sequence) || value.sequence < 0
      || value.sensor !== undefined && (!value.sensor || typeof value.sensor.name !== 'string' || value.sensor.name.length > 200
        || typeof value.sensor.vendor !== 'string' || value.sensor.vendor.length > 200 || !Number.isSafeInteger(value.sensor.version) || value.sensor.version < 0)
      || ![value.timestamp, value.receivedAt, value.elapsedRealtimeMs].every(finite)
      || value.timestamp <= 0 || value.receivedAt <= 0 || value.elapsedRealtimeMs < 0
      || value.cumulativeSteps !== null && (!Number.isSafeInteger(value.cumulativeSteps) || value.cumulativeSteps < 0)
      || value.timestamp - value.receivedAt > 30_000 || value.receivedAt - value.timestamp > FRESH_MS) return false;
    const identity = [value.deviceId, value.clockId, value.subscriptionId, value.source, value.provenance].join('\0');
    if (identity !== this.identity) { this.reset(); this.identity = identity; }
    if (this.latest && value.sequence <= this.latest.sequence) return false;
    if (this.latest && value.elapsedRealtimeMs < this.latest.elapsedRealtimeMs) return false;
    this.latest = structuredClone(value);
    if (value.status !== 'listening' || !value.source || !['granted', 'not-required'].includes(value.permission) || value.cumulativeSteps === null) {
      this.samples = []; return true;
    }
    const previous = this.samples.at(-1);
    if (previous) {
      const elapsed = value.elapsedRealtimeMs - previous.elapsedMs;
      const delta = value.cumulativeSteps - previous.steps;
      // Counter reset, time gaps and impossible jumps open a new measured window.
      if (elapsed <= 0 || elapsed > FRESH_MS || delta < 0 || delta * 60_000 > elapsed * MAX_STEPS_PER_MINUTE) this.samples = [];
    }
    this.samples.push({ elapsedMs: value.elapsedRealtimeMs, steps: value.cumulativeSteps });
    this.samples = this.samples.filter(sample => value.elapsedRealtimeMs - sample.elapsedMs <= WINDOW_MS).slice(-128);
    return true;
  }

  snapshot(now = Date.now()): WorkoutCadenceEstimate {
    const latest = this.latest;
    if (!latest) return { stepsPerMinute: null, windowMs: null, source: null, status: 'warming-up' };
    const empty = { stepsPerMinute: null, windowMs: null, source: latest.source };
    if (latest.status !== 'listening') return { ...empty, status: latest.status };
    if (now - latest.timestamp > FRESH_MS || now - latest.receivedAt > FRESH_MS || now < latest.receivedAt - 30_000) return { ...empty, status: 'stale' };
    const first = this.samples[0], last = this.samples.at(-1);
    if (!first || !last) return { ...empty, status: 'warming-up' };
    const elapsed = last.elapsedMs - first.elapsedMs, steps = last.steps - first.steps;
    if (elapsed < MIN_WINDOW_MS || steps < MIN_STEPS) return { ...empty, status: 'warming-up' };
    const cadence = steps * 60_000 / elapsed;
    return cadence <= MAX_STEPS_PER_MINUTE ? { stepsPerMinute: cadence, windowMs: elapsed, source: latest.source, status: 'measured' }
      : { ...empty, status: 'warming-up' };
  }
}
