import { randomUUID } from 'node:crypto';
import { WorkoutCadenceEstimator } from './workout-cadence';
import type { LngLat } from '../../shared/map-v2';
import type { WorkoutMapMatch } from '../../shared/map-workout';
import type {
  WorkoutCadenceObservation, WorkoutCancelRequest, WorkoutInputFix, WorkoutLocationStream, WorkoutPendingStop, WorkoutPendingStopView, WorkoutPointQuality, WorkoutSessionRecord,
  WorkoutRecordingSource, WorkoutResumeRequest, WorkoutSessionReference, WorkoutSessionStorage, WorkoutSport, WorkoutStartRequest,
  WorkoutState, WorkoutStreamStatus, WorkoutTrackPoint,
} from '../../shared/workout';

const EARTH_METERS = 6371008.8;
const MAX_ACCURACY_METERS = 50;
const MAX_SAMPLE_AGE_MS = 30_000;
const MAX_SAMPLE_GAP_MS = 15_000;
// Local selection policy: allow about three observed 3-second GPS cycles, below the gap boundary.
// Android does not promise this cadence; every measurement still passes its own quality checks.
const ANDROID_PROVIDER_FRESH_MS = 10_000;
const MAX_POINTS = 86_400;
const PACE_WINDOW_MS = 30_000;
const STOP_UNCONFIRMED = '还不能确认定位已经关掉。可以重试，或到设备上关闭这次定位。';
type AndroidProvider = 'gps' | 'network';
type AndroidProviderEvidence = { measuredAt: number; receivedAt: number; accuracy: number };
const speedLimit: Record<WorkoutSport, number> = { walking: 4.5, running: 12, cycling: 25 };
const rad = (value: number) => value * Math.PI / 180;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullableFinite = (value: unknown) => value === null || finite(value);
const longitudeDelta = (value: number) => (value + 540) % 360 - 180;

function recordingSource(value: WorkoutRecordingSource | undefined): WorkoutRecordingSource | undefined {
  if (value === undefined) return undefined;
  if (!value || !['windows', 'adb', 'hdc', 'ios-simulator'].includes(value.source)
    || Object.keys(value).some(key => key !== 'source' && key !== 'deviceId')
    || value.deviceId !== undefined && (typeof value.deviceId !== 'string' || !value.deviceId.length || value.deviceId.length > 256))
    throw new Error('这次运动的定位设备选择无法识别，请重新选择。');
  return { source: value.source, ...(value.deviceId ? { deviceId: value.deviceId } : {}) };
}

function distance(a: LngLat, b: LngLat) {
  const x = Math.sin(rad(b[1] - a[1]) / 2) ** 2
    + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(longitudeDelta(b[0] - a[0])) / 2) ** 2;
  return 2 * EARTH_METERS * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

function validFix(fix: WorkoutInputFix) {
  return fix && Array.isArray(fix.coordinate) && fix.coordinate.length === 2
    && fix.coordinate.every(finite) && Math.abs(fix.coordinate[0]) <= 180 && Math.abs(fix.coordinate[1]) <= 90
    && fix.crs === 'EPSG:4326' && finite(fix.timestamp) && fix.timestamp > 0
    && finite(fix.receivedAt) && fix.receivedAt > 0
    && nullableFinite(fix.accuracy) && (fix.accuracy === null || fix.accuracy >= 0)
    && nullableFinite(fix.altitude) && nullableFinite(fix.altitudeAccuracy)
    && (fix.altitudeAccuracy === null || fix.altitudeAccuracy >= 0)
    && nullableFinite(fix.speed)
    && nullableFinite(fix.heading) && (fix.heading === null || fix.heading >= 0 && fix.heading <= 360)
    && typeof fix.source === 'string' && fix.source.length > 0 && fix.source.length <= 160
    && typeof fix.deviceId === 'string' && fix.deviceId.length > 0 && fix.deviceId.length <= 256
    && typeof fix.deviceLabel === 'string' && fix.deviceLabel.length <= 256
    && (fix.transportDeviceId === undefined || typeof fix.transportDeviceId === 'string' && fix.transportDeviceId.length <= 256)
    && ['device', 'simulated', 'unknown'].includes(fix.provenance)
    && (fix.mock === null || typeof fix.mock === 'boolean')
    && (fix.elapsedRealtimeMs === undefined || finite(fix.elapsedRealtimeMs) && fix.elapsedRealtimeMs >= 0)
    && (fix.clockId === undefined || typeof fix.clockId === 'string' && fix.clockId.length <= 256);
}

/** Isotropic Gaussian approximation only, not a calibrated guarantee (W3C: 95%; Android: 68%). */
function measurementVariance(fix: WorkoutInputFix) {
  const radius = Math.max(1, fix.accuracy!);
  const sigma = fix.accuracyConfidence === '95-percent' ? radius / 2.448
    : fix.accuracyConfidence === '68-percent' ? radius / 1.51 : radius;
  return Math.max(1, sigma ** 2);
}

/** Two independent constant-velocity Kalman axes in a local metric plane. */
class PositionFilter {
  private origin: LngLat;
  private x = { position: 0, velocity: 0, pp: 1, pv: 0, vv: 100 };
  private y = { position: 0, velocity: 0, pp: 1, pv: 0, vv: 100 };
  constructor(fix: WorkoutInputFix) {
    this.origin = [...fix.coordinate];
    this.x.pp = this.y.pp = measurementVariance(fix);
  }
  update(fix: WorkoutInputFix, dtSeconds: number): LngLat {
    const latitudeScale = EARTH_METERS * Math.PI / 180;
    const longitudeScale = Math.max(0.000001, Math.cos(rad(this.origin[1]))) * latitudeScale;
    const step = (axis: typeof this.x, observed: number) => {
      // White acceleration model; deliberately not a claim of calibrated device noise.
      const t = dtSeconds, q = 4;
      const pp = axis.pp + 2 * t * axis.pv + t * t * axis.vv + q * t ** 4 / 4;
      const pv = axis.pv + t * axis.vv + q * t ** 3 / 2;
      const vv = axis.vv + q * t * t;
      const predicted = axis.position + t * axis.velocity;
      const denominator = pp + measurementVariance(fix), kp = pp / denominator, kv = pv / denominator;
      axis.position = predicted + kp * (observed - predicted);
      axis.velocity += kv * (observed - predicted);
      axis.pp = Math.max(0, (1 - kp) * pp);
      axis.pv = (1 - kp) * pv;
      axis.vv = Math.max(0, vv - kv * pv);
      return axis.position;
    };
    const x = step(this.x, longitudeDelta(fix.coordinate[0] - this.origin[0]) * longitudeScale);
    const y = step(this.y, (fix.coordinate[1] - this.origin[1]) * latitudeScale);
    return [longitudeDelta(this.origin[0] + x / longitudeScale), this.origin[1] + y / latitudeScale];
  }
}

export interface WorkoutKernelOptions {
  stream: WorkoutLocationStream;
  storage?: WorkoutSessionStorage;
  now?: () => number;
  monotonicNow?: () => number;
  /** Recheck the original user/session/source grant before controls and every sample. */
  assertAccess?: () => void;
  onChanged?: (state: WorkoutState) => void;
  /** Synchronous, exact session deletion fence; called only after a matching control revision. */
  onCancel?: (id: string) => void;
  matchFix?: (fix: WorkoutInputFix) => WorkoutMapMatch;
}

/** Sole local workout owner. It has no school upload, model call, or background agent. */
export class WorkoutSessionKernel {
  private record: WorkoutSessionRecord | null = null;
  private pendingStop: WorkoutPendingStop | undefined;
  private cleanupDurableId: string | undefined;
  private cadence = new WorkoutCadenceEstimator();
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private filter: PositionFilter | null = null;
  private previous: WorkoutTrackPoint | null = null;
  private anchor: LngLat | null = null;
  private activeSince: number | null = null;
  private segmentStartedAt = 0;
  private sourceIdentity = '';
  private androidSelection?: { identity: string; selected: AndroidProvider | null;
    gps?: AndroidProviderEvidence; network?: AndroidProviderEvidence };
  private lastMeasuredAt = 0;
  private paceEdges: { durationMs: number; distanceMeters: number }[] = [];
  private stationaryMs = 0;
  private recoveryError: string | undefined;
  private cleanupRecoveryError = false;
  private recoveryCleanupId: string | undefined;
  private recoveryBodyRemoved = false;
  private accessSuspended = false;
  private storageBlockedReason: string | undefined;
  private readonly now: () => number;
  private readonly monotonicNow: () => number;

  constructor(private options: WorkoutKernelOptions) {
    this.now = options.now || Date.now;
    this.monotonicNow = options.monotonicNow || (() => performance.now());
  }

  getState(): WorkoutState {
    if (!this.accessSuspended && !this.closed) {
      try { this.options.assertAccess?.(); }
      catch {
        // A read cannot race the next GPS callback or an outer onBarrier listener.
        this.accessSuspended = true;
        void this.invalidate().catch(() => undefined);
      }
    }
    if (this.closed) this.accessSuspended = true;
    const pending = this.pendingView(!this.accessSuspended);
    if (this.accessSuspended) return { session: null, access: 'suspended', ...(this.record ? {
      suspendedSession: { id: this.record.id, revision: this.record.revision, status: this.record.status },
    } : {}), ...(pending ? { pendingStop: pending } : {}),
      ...(this.recoveryError ? { recoveryError: this.recoveryError } : {}) };
    const session = this.record && this.record.status !== 'cancelled' ? structuredClone(this.record) : null;
    if (session) session.metrics.cadenceStepsPerMinute = session.status === 'recording'
      ? this.cadence.snapshot(this.now()).stepsPerMinute : null;
    if (session && this.activeSince !== null) session.metrics.elapsedActiveMs += Math.max(0, this.monotonicNow() - this.activeSince);
    // A stale pace must not keep claiming the last speed during a lost signal.
    if (session && (session.status !== 'recording' || !this.previous || this.now() - this.previous.raw.receivedAt > MAX_SAMPLE_GAP_MS)) {
      session.metrics.paceSecondsPerKm = null;
      if (session.status === 'recording' && session.signal === 'good') session.signal = 'weak';
    }
    return { session, access: 'active', ...(pending ? { pendingStop: pending } : {}),
      ...(this.recoveryError ? { recoveryError: this.recoveryError } : {}) };
  }

  private pendingView(includeProducer: boolean): WorkoutPendingStopView | undefined {
    if (!this.pendingStop) return undefined;
    const { recordingSource, ...control } = structuredClone(this.pendingStop);
    const requiresDeviceSelection = control.stream.status !== 'stopped' && (!recordingSource
      || recordingSource.source !== 'windows' && !recordingSource.deviceId);
    return { ...control, ...(includeProducer && recordingSource ? { recordingSource } : {}), requiresDeviceSelection };
  }

  private notify() {
    // A closing renderer or failed event delivery must never prevent stopping the device stream.
    try { this.options.onChanged?.(this.getState()); } catch { /* Native state remains available through getState. */ }
  }
  private checkAccess(collection = true) {
    if (this.closed) throw new Error('运动记录已经关闭。');
    if (collection) this.options.assertAccess?.();
  }
  private control(reference: WorkoutSessionReference, collection = false) {
    this.checkAccess(collection);
    if (!this.record || this.record.id !== reference.id || this.record.revision !== reference.expectedRevision)
      throw new Error('这次运动刚刚有了变化，请先查看当前记录。');
    return this.record;
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private checkpointClock() {
    if (!this.record || this.activeSince === null) return;
    const at = this.monotonicNow();
    this.record.metrics.elapsedActiveMs += Math.max(0, at - this.activeSince);
    this.activeSince = at;
  }
  private breakSegment() {
    if (this.record) this.record.segment++;
    this.androidSelection = undefined;
    this.previous = null; this.anchor = null; this.filter = null;
    this.paceEdges = []; this.stationaryMs = 0;
    if (this.record) { this.record.metrics.paceSecondsPerKm = null; this.record.motion = 'unknown'; }
  }
  private persist() {
    if (!this.record || this.record.retention === 'session-only') return;
    if (this.storageBlockedReason) {
      this.record.persistence = { status: 'memory-only', reason: this.storageBlockedReason };
      return;
    }
    if (!this.options.storage) {
      this.record.persistence = { status: 'memory-only', reason: '本机安全保存暂不可用，关闭应用后这次记录无法恢复。' };
      return;
    }
    try {
      this.record.persistence = { status: 'encrypted-local' };
      this.options.storage.save(this.record);
    } catch {
      this.record.persistence = { status: 'error', reason: '这次变化还没有安全保存。记录暂留在当前窗口，先不要关闭应用。' };
    }
  }

  private persistCleanup() {
    if (!this.pendingStop) return;
    if (!this.options.storage?.saveCleanup) {
      this.pendingStop.persistence = { status: 'memory-only', reason: '停止定位的进展还没保存。关闭后，需要重新检查设备。' }; return;
    }
    const hadDurableIdentity = this.cleanupDurableId === this.pendingStop.id;
    try {
      this.pendingStop.persistence = { status: 'encrypted-local' };
      this.options.storage.saveCleanup(this.pendingStop);
      this.cleanupDurableId = this.pendingStop.id;
    } catch {
      this.pendingStop.persistence = { status: 'error', reason: hadDurableIdentity
        ? '刚才停止定位的进展还没保存，之前保存的部分还在。'
        : '还没能安全保存停止定位的进展。先别关闭，重开后可能无法接着处理。' };
    }
  }

  /** No stream is started by restoration. Downtime is never added to active time. */
  restore() {
    this.checkAccess(false);
    if (this.record || this.pendingStop) return this.getState();
    try {
      this.pendingStop = this.options.storage?.loadCleanup?.() || undefined;
      this.cleanupRecoveryError = false;
      if (this.pendingStop?.persistence.status === 'encrypted-local') this.cleanupDurableId = this.pendingStop.id;
      if (this.pendingStop) return this.getState();
    } catch {
      this.cleanupRecoveryError = true;
      this.recoveryError = '还没读出上次停止定位的进展。上次保存的内容还在，可以重试恢复。';
      return this.getState();
    }
    this.checkAccess();
    this.accessSuspended = false;
    try {
      const record = this.options.storage?.load();
      this.recoveryError = undefined;
      if (record) {
        this.record = structuredClone(record);
        this.cadence.reset(); this.record.metrics.cadenceStepsPerMinute = null;
        if (record.status === 'recording' || record.status === 'paused') {
          this.record.status = 'paused'; this.record.pauseReason = 'interrupted'; this.record.revision++;
          this.record.pauseDetail = '上次的运动记录还在，继续后重新开启定位。';
          this.record.stream = record.stream.status === 'stopped'
            ? { status: 'stopped', reason: '上次的运动记录还在，继续后重新开启定位。' }
            : { status: 'unavailable', reason: '上次的位置读取已经中断，设备是否停止还不能确认。可以检查设备，或继续这次运动。' };
          this.record.signal = 'stopped'; this.record.updatedAt = this.now();
          this.breakSegment(); this.persist();
        }
      }
    } catch {
      this.recoveryError = '上次的运动草稿暂时读不到，请检查本机安全存储；原草稿没有被覆盖。';
    }
    return this.getState();
  }

  start(request: WorkoutStartRequest) {
    return this.serial(async () => {
      this.checkAccess();
      if (!['walking', 'running', 'cycling'].includes(request.sport)
        || !['encrypted-local', 'session-only'].includes(request.retention)) throw new Error('请选择运动类型与保存方式。');
      const source = recordingSource(request.recordingSource);
      if (!this.pendingStop && this.options.storage?.loadCleanup) {
        try { this.pendingStop = this.options.storage.loadCleanup() || undefined; }
        catch { throw new Error('还没读出上次停止定位的进展，先重试恢复，再开始新的记录。'); }
        if (this.pendingStop?.persistence.status === 'encrypted-local') this.cleanupDurableId = this.pendingStop.id;
      }
      if (this.pendingStop) { await this.clearPendingStop(); this.checkAccess(); }
      if (this.record && !['finished', 'cancelled'].includes(this.record.status)) throw new Error('先结束或取消当前运动，再开始新的一次。');
      if (this.record) { await this.stopStream(); this.checkAccess(); }
      this.storageBlockedReason = undefined;
      if (request.retention === 'encrypted-local' && this.options.storage) {
        try {
          const stored = this.options.storage.load();
          if (stored) {
            if (stored.id !== this.record?.id || !['finished', 'cancelled'].includes(stored.status))
              throw new Error('Another local draft is retained');
            this.options.storage.remove(stored.id, stored.revision);
          }
        } catch {
          // An unreadable original remains untouched. A temporary new recording is still useful.
          this.storageBlockedReason = '原来的安全草稿暂时读不到，已保留原件；这次记录仅留在当前窗口，关闭后无法恢复。';
        }
      }
      this.accessSuspended = false;
      const at = this.now();
      this.record = {
        schemaVersion: 1, id: randomUUID(), revision: 1, sampleRevision: 0,
        sport: request.sport, status: 'recording', retention: request.retention,
        ...(source ? { recordingSource: source } : {}),
        startedAt: at, updatedAt: at, finishedAt: null,
        metrics: { distanceMeters: 0, rawDistanceMeters: 0, elapsedActiveMs: 0, trustedActiveMs: 0, movingMs: 0,
          averagePaceSecondsPerKm: null, paceSecondsPerKm: null, cadenceStepsPerMinute: null },
        points: [], splits: [], rejectedPoints: 0, segment: 0,
        signal: 'searching', motion: 'unknown', provenance: 'unknown',
        stream: { status: 'starting', reason: '正在取得位置。' },
        persistence: { status: 'memory-only' }, school: { submission: 'not-submitted', validCount: null },
      };
      this.cadence.reset();
      this.sourceIdentity = ''; this.lastMeasuredAt = 0; this.breakSegment(); this.activeSince = this.monotonicNow();
      this.segmentStartedAt = at;
      this.persist(); this.notify(); void this.openStream();
      return this.getState();
    });
  }

  private async openStream() {
    if (this.accessSuspended || this.closed) return;
    try { this.checkAccess(); }
    catch { await this.invalidate().catch(() => undefined); return; }
    const generation = ++this.generation;
    this.segmentStartedAt = this.now();
    try {
      await this.options.stream.start(
        fix => { if (generation === this.generation) this.receive(fix); },
        status => { if (generation === this.generation) this.receiveStatus(status); },
        observation => { if (generation === this.generation) this.receiveCadence(observation); },
      );
    } catch {
      if (generation === this.generation) this.receiveStatus({ status: 'unavailable', reason: '暂时没有取得位置，记录还在，可以继续重试或结束。' });
    }
  }

  private async stopStream() {
    ++this.generation;
    this.cadence.reset();
    if (this.record) this.record.metrics.cadenceStepsPerMinute = null;
    const owner = this.record || this.pendingStop;
    try {
      await this.options.stream.stop(owner ? { id: owner.id, stopped: owner.stream.status === 'stopped',
        ...(owner.recordingSource ? { recordingSource: structuredClone(owner.recordingSource) } : {}) } : undefined);
      if (this.record) this.record.stream = { status: 'stopped', reason: '定位已停止。' };
      if (this.pendingStop) this.pendingStop.stream = { status: 'stopped', reason: '定位已停止。' };
    } catch {
      if (this.record) this.record.stream = { status: 'unavailable', reason: STOP_UNCONFIRMED };
      if (this.pendingStop) this.pendingStop.stream = { status: 'unavailable', reason: STOP_UNCONFIRMED };
      this.persist(); this.persistCleanup(); this.notify();
      throw new Error(STOP_UNCONFIRMED);
    }
  }

  private receiveStatus(status: WorkoutStreamStatus) {
    const record = this.record;
    if (!record || record.status !== 'recording') return;
    try { this.checkAccess(); } catch { void this.invalidate().catch(() => undefined); return; }
    record.stream = structuredClone(status);
    if (['unavailable', 'denied', 'disconnected', 'stopped'].includes(status.status)) {
      record.signal = status.status === 'stopped' ? 'stopped' : 'disconnected';
      this.checkpointClock(); this.breakSegment();
      // A failed acquisition is resumable, rather than a timer that keeps claiming an active session.
      record.status = 'paused'; record.pauseReason = status.status === 'denied' ? 'permission' : 'interrupted';
      record.pauseDetail = status.reason;
      record.revision++; this.activeSince = null;
      ++this.generation;
      void this.serial(async () => { await this.stopStream(); this.persist(); this.notify(); }).catch(() => undefined);
    }
    record.updatedAt = this.now(); this.persist(); this.notify();
  }

  private receiveCadence(observation: WorkoutCadenceObservation) {
    const record = this.record;
    if (!record || record.status !== 'recording') return;
    try { this.checkAccess(); } catch { void this.invalidate().catch(() => undefined); return; }
    if (!this.cadence.observe(observation)) return;
    const first = record.points.length === 0 && !record.latestCadenceObservation;
    record.provenance = first ? observation.provenance
      : record.provenance === 'simulated' || observation.provenance === 'simulated' ? 'simulated'
        : record.provenance === 'unknown' || observation.provenance === 'unknown' ? 'unknown' : 'device';
    record.latestCadenceObservation = structuredClone(observation);
    record.metrics.cadenceStepsPerMinute = this.cadence.snapshot(this.now()).stepsPerMinute;
    this.checkpointClock(); record.sampleRevision++; record.updatedAt = this.now();
    this.persist(); this.notify();
  }

  private reject(raw: WorkoutInputFix, quality: WorkoutPointQuality, preserveSegment = false) {
    const record = this.record!;
    // Duplicate or late cached callbacks do not erase the newer accepted anchor.
    // A genuine quality / source discontinuity does break the measured segment.
    const redundant = preserveSegment || (quality === 'timestamp' || quality === 'stale') && this.previous !== null;
    if (!redundant) this.breakSegment();
    record.rejectedPoints++;
    if (!redundant) record.signal = quality === 'accuracy' ? 'weak' : 'searching';
    record.points.push({ sequence: record.points.length + 1, raw, quality, segment: record.segment,
      deltaDistanceMeters: 0, trustedDeltaMs: 0, cumulativeDistanceMeters: record.metrics.distanceMeters,
      cumulativeTrustedMs: record.metrics.trustedActiveMs });
  }

  private androidProvider(raw: WorkoutInputFix): AndroidProvider | undefined {
    return raw.source === 'android-location-manager' && raw.transport === 'adb' && raw.clockId
      && (raw.provider === 'gps' || raw.provider === 'network') ? raw.provider : undefined;
  }

  private freshAndroidEvidence(value: AndroidProviderEvidence | undefined, at: number): value is AndroidProviderEvidence {
    return !!value && at - value.measuredAt <= ANDROID_PROVIDER_FRESH_MS && at - value.receivedAt <= ANDROID_PROVIDER_FRESH_MS;
  }

  private preserveSelectedAndroid(raw: WorkoutInputFix, identity: string, at: number): boolean {
    const provider = this.androidProvider(raw), selection = this.androidSelection;
    return !!provider && selection?.identity === identity && !!selection.selected && provider !== selection.selected
      && this.freshAndroidEvidence(selection[selection.selected], at);
  }

  /** Preserve every observation; only choose which same-device provider can advance metrics. */
  private considerAndroidProvider(raw: WorkoutInputFix, identity: string, at: number): boolean {
    const provider = this.androidProvider(raw);
    if (!provider) { this.androidSelection = undefined; return false; }
    const selection = this.androidSelection?.identity === identity ? this.androidSelection
      : this.androidSelection = { identity, selected: null };
    // A slightly earlier GPS fix may establish availability without rewinding accepted time.
    // Duplicates cannot refresh availability indefinitely: both measured and received ages expire.
    if (raw.timestamp > (selection[provider]?.measuredAt || 0)
      && at - raw.timestamp <= ANDROID_PROVIDER_FRESH_MS && at - raw.receivedAt <= ANDROID_PROVIDER_FRESH_MS) {
      selection[provider] = { measuredAt: raw.timestamp, receivedAt: raw.receivedAt, accuracy: raw.accuracy! };
    }
    const gps = this.freshAndroidEvidence(selection.gps, at) ? selection.gps : undefined;
    const network = this.freshAndroidEvidence(selection.network, at) ? selection.network : undefined;
    // Both are Android's reported horizontal radii. A provider name cannot outweigh
    // a clearer fresh observation; equal reports prefer GNSS, without claiming ground truth.
    const preferred = gps && (!network || gps.accuracy <= network.accuracy) ? 'gps' : network ? 'network' : provider;
    return provider !== preferred;
  }

  private selectAndroidProvider(raw: WorkoutInputFix, identity: string, at: number) {
    const provider = this.androidProvider(raw), selection = this.androidSelection;
    if (!provider || !selection || selection.identity !== identity) return;
    if (selection.selected && selection.selected !== provider) {
      // Provider offsets are not a measured route. The current fix starts a new baseline.
      this.breakSegment(); this.considerAndroidProvider(raw, identity, at);
    }
    this.androidSelection!.selected = provider;
  }

  private receive(input: WorkoutInputFix) {
    const record = this.record;
    if (!record || record.status !== 'recording') return;
    try { this.checkAccess(); } catch { void this.invalidate().catch(() => undefined); return; }
    this.checkpointClock();
    // Bounded session storage. Stop acquisition rather than silently dropping a tail.
    if (record.points.length >= MAX_POINTS) {
      record.status = 'paused'; record.pauseReason = 'capacity'; record.revision++; this.activeSince = null;
      record.pauseDetail = '这次运动记录已经很长，请先结束，再开始新的一次。';
      this.breakSegment();
      ++this.generation;
      void this.serial(async () => { await this.stopStream(); this.persist(); this.notify(); }).catch(() => undefined);
      return;
    }
    const raw = structuredClone(input), at = this.now();
    if (!raw || typeof raw !== 'object') {
      record.rejectedPoints++; record.sampleRevision++; record.signal = 'searching';
      this.breakSegment(); this.persist(); this.notify(); return;
    }
    const first = record.points.length === 0 && !record.latestCadenceObservation;
    const provenance = raw.mock === true || raw.provenance === 'simulated' ? 'simulated' : raw.provenance === 'device' && raw.mock === false ? 'device' : 'unknown';
    record.provenance = first ? provenance : record.provenance === 'simulated' || provenance === 'simulated' ? 'simulated'
      : record.provenance === 'unknown' || provenance === 'unknown' ? 'unknown' : 'device';
    const identity = `${raw.source}\u0000${raw.deviceId}\u0000${provenance}\u0000${raw.clockId || ''}`;
    let quality: WorkoutPointQuality | null = null;
    if (!validFix(raw)) quality = 'invalid';
    else if (raw.accuracy === null || raw.accuracy > MAX_ACCURACY_METERS) quality = 'accuracy';
    else if (Math.abs(raw.receivedAt - at) > MAX_SAMPLE_AGE_MS || raw.receivedAt - raw.timestamp > MAX_SAMPLE_AGE_MS
      || raw.timestamp - raw.receivedAt > 5_000 || raw.timestamp < this.segmentStartedAt) quality = 'stale';
    else if (this.sourceIdentity && identity !== this.sourceIdentity) quality = 'source-change';
    const providerNotSelected = !quality && this.considerAndroidProvider(raw, identity, at);
    if (!quality && !providerNotSelected && this.lastMeasuredAt && raw.timestamp <= this.lastMeasuredAt) quality = 'timestamp';
    if (quality) {
      // An unselected weak provider must not erase another still-healthy provider's anchor.
      this.reject(raw, quality, this.preserveSelectedAndroid(raw, identity, at));
      if (quality === 'source-change') this.sourceIdentity = identity;
    } else if (providerNotSelected) {
      record.points.push({ sequence: record.points.length + 1, raw, quality: 'provider-not-selected', segment: record.segment,
        deltaDistanceMeters: 0, trustedDeltaMs: 0, cumulativeDistanceMeters: record.metrics.distanceMeters,
        cumulativeTrustedMs: record.metrics.trustedActiveMs });
    } else {
      this.sourceIdentity = identity; this.lastMeasuredAt = raw.timestamp;
      this.selectAndroidProvider(raw, identity, at);
      let previous = this.previous;
      let dt = previous ? raw.timestamp - previous.raw.timestamp : 0;
      if (previous && raw.clockId && raw.clockId === previous.raw.clockId
        && raw.elapsedRealtimeMs !== undefined && previous.raw.elapsedRealtimeMs !== undefined)
        dt = raw.elapsedRealtimeMs - previous.raw.elapsedRealtimeMs;
      if (previous && (dt <= 0 || Math.abs(dt - (raw.timestamp - previous.raw.timestamp)) > 2_000)) {
        this.reject(raw, 'timestamp');
      } else {
        if (previous && (dt > MAX_SAMPLE_GAP_MS || raw.receivedAt - previous.raw.receivedAt > MAX_SAMPLE_GAP_MS)) {
          this.breakSegment(); this.considerAndroidProvider(raw, identity, at); this.selectAndroidProvider(raw, identity, at);
          previous = null; dt = 0;
        }
        const rawDistance = previous ? distance(previous.raw.coordinate, raw.coordinate) : 0;
        const uncertainty = previous ? Math.min(10, Math.max(previous.raw.accuracy!, raw.accuracy!)) : 0;
        // Plausibility includes reported uncertainty; provider speed alone cannot create distance.
        if (previous && rawDistance > speedLimit[record.sport] * dt / 1000 + Math.max(10, uncertainty)) {
          this.reject(raw, 'outlier');
        } else {
          if (!this.filter) this.filter = new PositionFilter(raw);
          const filtered = previous ? this.filter.update(raw, dt / 1000) : [...raw.coordinate] as LngLat;
          if (!this.anchor) this.anchor = filtered;
          const delta = distance(this.anchor, filtered);
          const jitter = Math.max(1.5, Math.min(raw.accuracy!, previous?.raw.accuracy ?? raw.accuracy!) * 0.3);
          const counted = previous && delta >= jitter ? delta : 0;
          if (counted) this.anchor = filtered;
          const beforeDistance = record.metrics.distanceMeters, beforeTrusted = record.metrics.trustedActiveMs;
          // A provider may deliver several measured fixes in one polling batch. Allocate their
          // measured intervals against the accumulated live host budget, not per-callback latency.
          // The earlier segment/gap checks still exclude every unobserved or paused interval.
          const trustedDelta = previous ? Math.min(dt,
            Math.max(0, record.metrics.elapsedActiveMs - record.metrics.trustedActiveMs)) : 0;
          record.metrics.distanceMeters += counted;
          record.metrics.rawDistanceMeters += rawDistance;
          record.metrics.trustedActiveMs += trustedDelta;
          if (counted) record.metrics.movingMs += trustedDelta;
          // A wide uncertainty circle or missing speed cannot establish that a person stopped.
          this.stationaryMs = !counted && previous && raw.speed !== null && Math.abs(raw.speed) <= 0.3 && raw.accuracy! <= 15
            && previous.raw.speed !== null && Math.abs(previous.raw.speed) <= 0.3 && previous.raw.accuracy! <= 15
            ? this.stationaryMs + trustedDelta : 0;
          record.motion = counted ? 'moving' : this.stationaryMs >= 20_000 ? 'stationary' : 'unknown';
          record.signal = 'good';
          const point: WorkoutTrackPoint = { sequence: record.points.length + 1, raw, quality: 'accepted', segment: record.segment,
            filteredCoordinate: filtered, deltaDistanceMeters: counted, trustedDeltaMs: trustedDelta,
            cumulativeDistanceMeters: record.metrics.distanceMeters, cumulativeTrustedMs: record.metrics.trustedActiveMs };
          if (this.options.matchFix) {
            try { point.mapMatch = this.options.matchFix(raw); } catch { /* Geometry is optional evidence, never a recording dependency. */ }
          }
          record.points.push(point); this.previous = point;
          this.updatePace(trustedDelta, counted);
          if (counted) this.updateSplits(beforeDistance, beforeTrusted, raw.timestamp, dt, trustedDelta, counted);
          record.metrics.averagePaceSecondsPerKm = record.metrics.distanceMeters >= 10
            ? record.metrics.trustedActiveMs / record.metrics.distanceMeters : null;
        }
      }
    }
    record.sampleRevision++; record.updatedAt = at; this.persist(); this.notify();
    if (record.motion === 'stationary') {
      // Only the same still-current observation may pause. A queued user action or newer
      // moving/weak fix can invalidate this decision before its serial operation runs.
      void this.pauseForReason({ id: record.id, expectedRevision: record.revision }, 'stationary').catch(() => undefined);
    }
  }

  private updatePace(durationMs: number, distanceMeters: number) {
    if (durationMs <= 0) return;
    this.paceEdges.push({ durationMs, distanceMeters });
    let duration = this.paceEdges.reduce((total, edge) => total + edge.durationMs, 0);
    while (duration > PACE_WINDOW_MS && this.paceEdges.length) {
      const edge = this.paceEdges[0], removed = Math.min(edge.durationMs, duration - PACE_WINDOW_MS);
      const ratio = (edge.durationMs - removed) / edge.durationMs;
      edge.durationMs -= removed; edge.distanceMeters *= ratio; duration -= removed;
      if (edge.durationMs === 0) this.paceEdges.shift();
    }
    const meters = this.paceEdges.reduce((total, edge) => total + edge.distanceMeters, 0);
    this.record!.metrics.paceSecondsPerKm = duration >= 5_000 && meters >= 5 ? duration / meters : null;
  }

  private updateSplits(beforeDistance: number, beforeTrusted: number, at: number, measuredMs: number, durationMs: number, delta: number) {
    const record = this.record!;
    for (let kilometer = record.splits.length + 1; kilometer * 1000 <= record.metrics.distanceMeters; kilometer++) {
      const ratio = Math.max(0, Math.min(1, (kilometer * 1000 - beforeDistance) / delta));
      const totalMs = beforeTrusted + durationMs * ratio;
      const previousTotal = record.splits.reduce((sum, split) => sum + split.durationMs, 0);
      const splitMs = totalMs - previousTotal;
      record.splits.push({ kilometer, distanceMeters: 1000, durationMs: splitMs,
        paceSecondsPerKm: splitMs / 1000, completedAt: at - measuredMs * (1 - ratio) });
    }
  }

  pause(reference: WorkoutSessionReference) {
    return this.pauseForReason(reference, 'user');
  }

  private pauseForReason(reference: WorkoutSessionReference, reason: 'user' | 'stationary') {
    return this.serial(async () => {
      const record = this.control(reference);
      if (reason === 'stationary' && (record.status !== 'recording' || record.motion !== 'stationary')) return this.getState();
      if (record.status === 'paused') {
        await this.stopStream(); this.persist(); this.notify(); return this.getState();
      }
      if (record.status !== 'recording') throw new Error('当前运动没有在继续记录。');
      this.checkpointClock(); this.activeSince = null;
      record.status = 'paused'; record.pauseReason = reason; record.revision++;
      if (reason === 'stationary') record.pauseDetail = '位置已持续静止，自动暂停了记录。点继续后重新开启定位。';
      else delete record.pauseDetail;
      record.updatedAt = this.now(); record.signal = 'stopped'; this.breakSegment();
      this.persist(); this.notify();
      await this.stopStream(); this.persist(); this.notify(); return this.getState();
    });
  }

  resume(reference: WorkoutResumeRequest) {
    return this.serial(async () => {
      const record = this.control(reference, true);
      const source = recordingSource(reference.recordingSource);
      if (record.status !== 'paused') throw new Error('这次运动现在不能继续。');
      if (record.points.length >= MAX_POINTS) throw new Error('这次运动记录已经很长，请先结束，再开始新的一次。');
      // A failed stop must be reconciled before replacing the provider or opening another subscription.
      await this.stopStream(); this.checkAccess();
      this.accessSuspended = false;
      if (source) record.recordingSource = source;
      delete record.latestCadenceObservation;
      record.status = 'recording'; delete record.pauseReason; delete record.pauseDetail; record.revision++;
      record.updatedAt = this.now(); record.signal = 'searching';
      record.stream = { status: 'starting', reason: '正在重新取得位置。' };
      this.breakSegment(); this.activeSince = this.monotonicNow();
      this.persist(); this.notify(); void this.openStream(); return this.getState();
    });
  }

  finish(reference: WorkoutSessionReference) {
    return this.serial(async () => {
      const record = this.control(reference);
      if (record.status === 'finished') {
        await this.stopStream(); this.persist(); this.notify(); return this.getState();
      }
      if (!['recording', 'paused'].includes(record.status)) throw new Error('这次运动已经结束。');
      this.checkpointClock(); this.activeSince = null;
      record.status = 'finished'; record.finishedAt = this.now(); record.updatedAt = record.finishedAt;
      record.revision++; record.signal = 'stopped'; this.breakSegment();
      this.persist(); this.notify();
      await this.stopStream(); this.persist(); this.notify(); return this.getState();
    });
  }

  cancel(reference: WorkoutCancelRequest) {
    return this.serial(async () => {
      let justCancelled = false;
      if (this.record) {
        const record = this.control(reference);
        ++this.generation; this.activeSince = null; this.breakSegment();
        record.status = 'cancelled'; record.revision++;
        this.pendingStop = { id: record.id, revision: record.revision,
          ...(record.recordingSource ? { recordingSource: structuredClone(record.recordingSource) } : {}),
          stream: structuredClone(record.stream),
          localRemoval: record.retention === 'encrypted-local' && !this.storageBlockedReason ? 'unconfirmed' : 'complete',
          sourceRetraction: this.options.onCancel ? 'unconfirmed' : 'complete', persistence: { status: 'memory-only' } };
        // Durable control metadata precedes source withdrawal and deleting the body.
        this.persistCleanup();
        try { this.options.onCancel?.(record.id); this.pendingStop.sourceRetraction = 'complete'; }
        catch { /* A partial source withdrawal must still stop acquisition and remove the local body. */ }
        // Deleting the local body does not depend on an online phone acknowledging STOP.
        record.points = []; record.splits = [];
        this.record = null; this.sourceIdentity = ''; this.lastMeasuredAt = 0; this.segmentStartedAt = 0;
        justCancelled = true;
      } else {
        this.checkAccess(false);
        if (!this.pendingStop || this.pendingStop.id !== reference.id || this.pendingStop.revision !== reference.expectedRevision)
          throw new Error('这次运动刚刚有了变化，请先查看当前记录。');
        const selected = recordingSource(reference.recordingSource);
        if (selected && !this.pendingStop.recordingSource) {
          this.pendingStop.recordingSource = selected;
          this.persistCleanup();
        } else if (selected && this.pendingStop.recordingSource?.source === selected.source
          && selected.source !== 'windows' && !this.pendingStop.recordingSource.deviceId && selected.deviceId) {
          this.pendingStop.recordingSource = selected;
          this.persistCleanup();
        } else if (selected && JSON.stringify(selected) !== JSON.stringify(this.pendingStop.recordingSource)) {
          throw new Error('这份清理已经绑定原来的设备，没有替换为另一台设备。');
        }
      }
      await this.clearPendingStop(!justCancelled); return this.getState();
    });
  }

  private async clearPendingStop(retryRetraction = true) {
    const pending = this.pendingStop;
    if (!pending) return;
    if (pending.sourceRetraction === 'unconfirmed' && retryRetraction) {
      try { this.options.onCancel?.(pending.id); pending.sourceRetraction = 'complete'; }
      catch { /* Retain only this cleanup identity for an explicit retry. */ }
    }
    this.persistCleanup();
    let removalFailed = false;
    if (pending.localRemoval === 'unconfirmed') {
      try { this.options.storage?.remove(pending.id, pending.revision); pending.localRemoval = 'complete'; }
      catch { removalFailed = true; }
    }
    this.notify();
    // Even a local disk error must not prevent trying to close the device subscription.
    try { await this.stopStream(); }
    finally { this.persistCleanup(); this.notify(); }
    if (removalFailed) throw new Error('本机的运动记录还没有删完，可以重试删除；定位已经停止。');
    if (pending.sourceRetraction === 'unconfirmed') throw new Error('这次记录已删除，定位也已关掉；之前引用它的内容还没清理完，可以再试一次。');
    if (this.recoveryCleanupId === pending.id) {
      this.recoveryCleanupId = undefined; this.recoveryError = undefined; this.recoveryBodyRemoved = false;
    }
    try { this.options.storage?.removeCleanup?.(pending.id); }
    catch {
      pending.persistence = { status: 'error', reason: '记录和定位都已经清理好，但最后的收尾没做完。可以再试一次。' };
      this.notify(); throw new Error(pending.persistence.reason);
    }
    this.pendingStop = undefined; this.notify();
    this.cleanupDurableId = undefined;
  }

  /** Withdraw live use, preserving independently retained local history. Never silently resumes. */
  invalidate() {
    // Withdraw callbacks immediately, including while a provider start is still awaiting a device.
    ++this.generation;
    this.accessSuspended = true;
    return this.serial(async () => {
      const record = this.record;
      this.checkpointClock(); this.activeSince = null;
      if (record?.status === 'recording') {
        record.status = 'paused'; record.pauseReason = 'permission'; record.revision++;
        record.pauseDetail = '位置访问已经关闭，记录先停在这里。';
        record.signal = 'stopped'; this.breakSegment();
      }
      try { await this.stopStream(); }
      finally { this.persist(); this.notify(); }
      return this.getState();
    });
  }

  /** User explicitly discards an unreadable encrypted draft; never an automatic recovery path. */
  discardRecovery() {
    return this.serial(async () => {
      this.checkAccess(false);
      if (this.cleanupRecoveryError) throw new Error('还没读出上次停止定位的进展。可以先重试恢复，或检查这台电脑的安全保存。');
      if (this.record && this.record.retention === 'encrypted-local' && !this.storageBlockedReason && !this.recoveryCleanupId)
        throw new Error('请先取消当前这次运动。');
      if (!this.recoveryError && !this.recoveryCleanupId) return this.getState();
      if (!this.options.storage?.discardUnrecoverable) throw new Error('目前无法删除这份运动草稿。');
      const id = this.recoveryCleanupId || this.options.storage.unrecoverableId?.();
      if (id && !this.record && !this.pendingStop) {
        this.pendingStop = { id, revision: 1,
          stream: { status: 'unavailable', reason: '旧草稿的原设备尚不明确，设备是否停止还不能确认。' },
          localRemoval: 'unconfirmed', sourceRetraction: this.options.onCancel ? 'unconfirmed' : 'complete',
          persistence: { status: 'memory-only' } };
        this.recoveryCleanupId = id;
        this.persistCleanup();
      }
      let retractionFailed = false;
      if (id) {
        try {
          this.options.onCancel?.(id);
          if (this.pendingStop?.id !== id) this.recoveryCleanupId = undefined;
          if (this.pendingStop?.id === id) this.pendingStop.sourceRetraction = 'complete';
        }
        catch { this.recoveryCleanupId = id; retractionFailed = true; }
      }
      try {
        if (!this.recoveryBodyRemoved) this.options.storage.discardUnrecoverable(id);
        this.recoveryBodyRemoved = true;
        if (id && this.pendingStop?.id === id) this.pendingStop.localRemoval = 'complete';
      }
      catch {
        this.recoveryError = '本机运动草稿还没有删完，可以重试删除。'; this.notify();
        throw new Error(this.recoveryError);
      }
      this.recoveryError = retractionFailed
        ? '运动草稿已经删除，先前引用的资料还没有撤回完成，可以重试清理。' : undefined;
      this.storageBlockedReason = undefined;
      this.persist();
      this.persistCleanup();
      this.notify();
      if (retractionFailed) throw new Error(this.recoveryError);
      if (!id || this.pendingStop?.id !== id) this.recoveryBodyRemoved = false;
      return this.getState();
    });
  }

  dispose() {
    return this.serial(async () => {
      if (this.closed) return;
      if (this.pendingStop) await this.clearPendingStop();
      this.checkpointClock(); this.activeSince = null;
      if (this.record?.status === 'recording') {
        this.record.status = 'paused'; this.record.pauseReason = 'interrupted'; this.record.revision++;
        this.record.signal = 'stopped'; this.breakSegment();
      }
      if (this.record?.retention === 'session-only' && this.record.stream.status !== 'stopped') {
        const record = this.record;
        this.pendingStop = { id: record.id, revision: record.revision,
          ...(record.recordingSource ? { recordingSource: structuredClone(record.recordingSource) } : {}),
          stream: structuredClone(record.stream), localRemoval: 'complete', sourceRetraction: 'not-required',
          persistence: { status: 'memory-only' } };
        // Closing a temporary body is not a withdrawal of independent history. Only resource
        // cleanup identity survives if stopping this explicit subscription cannot be confirmed.
        record.points = []; record.splits = []; this.record = null;
        this.persistCleanup(); await this.clearPendingStop(false);
      }
      await this.stopStream();
      this.closed = true;
      if (this.record?.retention === 'session-only') this.record = null;
      else this.persist();
      this.notify();
    });
  }
}
