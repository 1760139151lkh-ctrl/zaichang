import type { LngLat } from './map-v2';
import type { WorkoutMapMatch } from './map-workout';

/** A native command was processed between these host observations. Never rewrites measured time. */
export interface WorkoutClockCorrelation {
  kind: 'command-reply';
  /** Missing on older retained observations, whose event was the state written after the command. */
  basis?: 'state-after-command' | 'command-processed';
  commandId: string;
  subscriptionId: string;
  sourceProcessId: number;
  /** Source epoch for basis; retained state events are never promoted to exact processing times. */
  sourceObservedAt: number;
  hostSentAt: number;
  hostReceivedAt: number;
  /** Independent host monotonic duration detects a wall-clock step during the exchange. */
  hostElapsedMs: number;
  /** Monotonic age of the fixed ACK anchor when this point was received. */
  hostSinceAckMs?: number;
}

/** A device observation. Coordinates are never replaced by a map match or filter. */
export interface WorkoutInputFix {
  coordinate: LngLat;
  crs: 'EPSG:4326';
  /** Original source epoch, never replaced by the derived host-time bounds. */
  timestamp: number;
  /** Host receipt time, retained separately from the source measurement. */
  receivedAt: number;
  accuracy: number | null;
  accuracyConfidence?: '68-percent' | '95-percent' | 'unknown';
  altitude: number | null;
  altitudeAccuracy: number | null;
  altitudeDatum?: 'wgs84-ellipsoid' | 'mean-sea-level' | 'unknown';
  /** Native m/s; Windows may report a negative value for reverse movement. */
  speed: number | null;
  heading: number | null;
  source: string;
  deviceId: string;
  deviceLabel: string;
  /** Original transport alias; private recovery metadata, never a replacement for stable deviceId. */
  transportDeviceId?: string;
  provider?: string;
  transport?: 'windows' | 'adb' | 'hdc' | 'ios-simulator';
  provenance: 'device' | 'simulated' | 'unknown';
  mock: boolean | null;
  /** Only comparable within the same device boot / clockId. */
  elapsedRealtimeMs?: number;
  /** The original native report, retained even when it cannot be used as a boot clock. */
  reportedElapsedRealtimeMs?: number;
  clockQuality?: 'boot-range-checked' | 'outside-boot-range' | 'unverified';
  clockId?: string;
  clockCorrelation?: WorkoutClockCorrelation;
}

export interface WorkoutFixTime {
  /** Derived host-time bounds, distinct from the original source timestamp. */
  measuredAt: { earliest: number; latest: number };
  ageMs: { earliest: number; latest: number };
  offsetMs: { earliest: number; latest: number } | null;
  correlated: boolean;
  fresh: boolean;
}

/** One time rule for acquisition, private map freshness and the finite companion summary. */
export function workoutFixTime(fix: WorkoutInputFix, now = Date.now(), maxAgeMs = 30_000): WorkoutFixTime | null {
  if (!fix || ![fix.timestamp, fix.receivedAt, now, maxAgeMs].every(Number.isFinite)
    || fix.timestamp <= 0 || fix.receivedAt <= 0 || maxAgeMs < 0) return null;
  let earliest = fix.timestamp, latest = fix.timestamp;
  let offsetMs: WorkoutFixTime['offsetMs'] = null;
  const clock = fix.clockCorrelation;
  if (clock !== undefined) {
    if (!clock || clock.kind !== 'command-reply' || fix.transport !== 'ios-simulator'
      || fix.source !== 'ios-core-location-simulator'
      || fix.provenance !== 'simulated' || fix.mock !== true
      || typeof fix.transportDeviceId !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(fix.transportDeviceId)
      || fix.deviceId !== `ios-simulator:${fix.transportDeviceId}`
      || ![clock.sourceObservedAt, clock.hostSentAt, clock.hostReceivedAt, clock.hostElapsedMs].every(Number.isFinite)
      || ![clock.commandId, clock.subscriptionId].every(value => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value))
      || !Number.isSafeInteger(clock.sourceProcessId) || clock.sourceProcessId < 1
      || fix.clockId !== `ios-simulator:${fix.transportDeviceId}:${clock.sourceProcessId}`
      || clock.sourceObservedAt <= 0 || clock.hostSentAt <= 0 || clock.hostElapsedMs < 0
      || clock.hostReceivedAt < clock.hostSentAt
      // This ten-second exchange limit is separate from the unchanged five-second future guard.
      || clock.hostReceivedAt - clock.hostSentAt > 10_000
      || Math.abs(clock.hostReceivedAt - clock.hostSentAt - clock.hostElapsedMs) > 250) return null;
    if (clock.basis === 'command-processed') {
      if (!Number.isFinite(clock.hostSinceAckMs) || clock.hostSinceAckMs! < 0 || clock.hostSinceAckMs! > 10_000
        || fix.receivedAt < clock.hostReceivedAt
        || Math.abs(fix.receivedAt - clock.hostReceivedAt - clock.hostSinceAckMs!) > 250) return null;
    } else if ((clock.basis !== undefined && clock.basis !== 'state-after-command') || clock.hostReceivedAt !== fix.receivedAt
      || clock.hostSinceAckMs !== undefined && clock.hostSinceAckMs !== 0)
      return null;
    offsetMs = { earliest: clock.sourceObservedAt - clock.hostReceivedAt,
      latest: clock.sourceObservedAt - clock.hostSentAt };
    earliest = fix.timestamp - offsetMs.latest;
    latest = fix.timestamp - offsetMs.earliest;
  }
  if (![earliest, latest].every(Number.isFinite) || earliest <= 0 || latest < earliest) return null;
  const ageMs = { earliest: now - latest, latest: now - earliest };
  return { measuredAt: { earliest, latest }, ageMs, offsetMs, correlated: offsetMs !== null,
    fresh: Math.abs(now - fix.receivedAt) <= maxAgeMs && ageMs.latest <= maxAgeMs && ageMs.earliest >= -5_000
      && fix.receivedAt - earliest <= maxAgeMs && latest - fix.receivedAt <= 5_000 };
}

export interface WorkoutStreamStatus {
  status: 'starting' | 'listening' | 'unavailable' | 'denied' | 'disconnected' | 'stopped';
  reason: string;
}

/** A single explicit recording owns this subscription; stop must release OS resources. */
export interface WorkoutLocationStream {
  start(onFix: (fix: WorkoutInputFix) => void, onStatus: (status: WorkoutStreamStatus) => void,
    onCadence?: (observation: WorkoutCadenceObservation) => void): void | Promise<void>;
  stop(owner?: WorkoutStopOwner): void | Promise<void>;
}

export type WorkoutSport = 'walking' | 'running' | 'cycling';
export type WorkoutRetention = 'encrypted-local' | 'session-only';
export type WorkoutPointQuality = 'accepted' | 'provider-not-selected' | 'invalid' | 'accuracy' | 'stale' | 'timestamp' | 'outlier' | 'source-change';

/** Explicit producer selection, not an observation of the user's location. */
export interface WorkoutRecordingSource {
  source: 'windows' | 'adb' | 'hdc' | 'ios-simulator';
  deviceId?: string;
}

export interface WorkoutCadenceObservation {
  status: 'listening' | 'unsupported' | 'denied' | 'unavailable' | 'stopped';
  source: 'android-step-detector' | 'android-step-counter' | null;
  permission: 'granted' | 'denied' | 'not-required' | 'unknown';
  deviceId: string;
  clockId: string;
  subscriptionId: string;
  sequence: number;
  timestamp: number;
  receivedAt: number;
  elapsedRealtimeMs: number;
  cumulativeSteps: number | null;
  provenance: 'device' | 'simulated' | 'unknown';
  sensor?: { name: string; vendor: string; version: number };
}

/** Private kernel-to-native cleanup identity. This is never a renderer read projection. */
export interface WorkoutStopOwner {
  id: string;
  recordingSource?: WorkoutRecordingSource;
  stopped: boolean;
}

export interface WorkoutTrackPoint {
  sequence: number;
  raw: WorkoutInputFix;
  quality: WorkoutPointQuality;
  segment: number;
  /** A derived, causal Kalman estimate. This is not a measured coordinate. */
  filteredCoordinate?: LngLat;
  deltaDistanceMeters: number;
  trustedDeltaMs: number;
  cumulativeDistanceMeters: number;
  cumulativeTrustedMs: number;
  mapMatch?: WorkoutMapMatch;
}

export interface WorkoutSplit {
  kilometer: number;
  distanceMeters: 1000;
  durationMs: number;
  paceSecondsPerKm: number;
  /** Interpolated inside a measured segment; no distance is filled across gaps. */
  completedAt: number;
}

export interface WorkoutMetrics {
  /** Causal filtered distance estimate, never map-snapped distance. */
  distanceMeters: number;
  /** Unfiltered accepted sample distances, retained for comparison. */
  rawDistanceMeters: number;
  elapsedActiveMs: number;
  trustedActiveMs: number;
  movingMs: number;
  averagePaceSecondsPerKm: number | null;
  paceSecondsPerKm: number | null;
  cadenceStepsPerMinute: number | null;
}

export interface WorkoutSessionRecord {
  schemaVersion: 1;
  id: string;
  /** User controls change this; arriving GPS samples change sampleRevision. */
  revision: number;
  sampleRevision: number;
  sport: WorkoutSport;
  status: 'recording' | 'paused' | 'finished' | 'cancelled';
  pauseReason?: 'user' | 'stationary' | 'interrupted' | 'permission' | 'capacity';
  pauseDetail?: string;
  retention: WorkoutRetention;
  /** Last explicitly selected producer, retained even if it yielded zero fixes. */
  recordingSource?: WorkoutRecordingSource;
  latestCadenceObservation?: WorkoutCadenceObservation;
  startedAt: number;
  updatedAt: number;
  finishedAt: number | null;
  metrics: WorkoutMetrics;
  points: WorkoutTrackPoint[];
  splits: WorkoutSplit[];
  rejectedPoints: number;
  segment: number;
  signal: 'searching' | 'good' | 'weak' | 'disconnected' | 'stopped';
  motion: 'unknown' | 'moving' | 'stationary';
  stream: WorkoutStreamStatus;
  /** Sticky: a simulated / unknown sample cannot later become a device record. */
  provenance: 'device' | 'simulated' | 'unknown';
  persistence: { status: 'encrypted-local' | 'memory-only' | 'error'; reason?: string };
  /** A local session is never an official school acceptance or valid-count receipt. */
  school: { submission: 'not-submitted'; validCount: null };
}

export interface WorkoutSessionReference { id: string; expectedRevision: number }
export interface WorkoutStartRequest { sport: WorkoutSport; retention: WorkoutRetention; recordingSource?: WorkoutRecordingSource }
export interface WorkoutResumeRequest extends WorkoutSessionReference { recordingSource?: WorkoutRecordingSource }
export interface WorkoutCancelRequest extends WorkoutSessionReference { recordingSource?: WorkoutRecordingSource }
/** Minimal cleanup control after deleting a session; its own encrypted receipt has no track, metrics or original time. */
export interface WorkoutPendingStop {
  id: string;
  revision: number;
  recordingSource?: WorkoutRecordingSource;
  stream: WorkoutStreamStatus;
  localRemoval: 'complete' | 'unconfirmed';
  sourceRetraction: 'complete' | 'unconfirmed' | 'not-required';
  persistence: { status: 'encrypted-local' | 'memory-only' | 'error'; reason?: string };
}
export interface WorkoutPendingStopView extends WorkoutPendingStop {
  requiresDeviceSelection: boolean;
}
export interface WorkoutState {
  session: WorkoutSessionRecord | null;
  access: 'active' | 'suspended';
  pendingStop?: WorkoutPendingStopView;
  /** Opaque local control identity only; no position, metrics, or private device fields. */
  suspendedSession?: { id: string; revision: number; status: WorkoutSessionRecord['status'] };
  recoveryError?: string;
}

/** This owner stores one local session draft, outside school records and memory assertions. */
export interface WorkoutSessionStorage {
  load(): WorkoutSessionRecord | null;
  save(record: WorkoutSessionRecord): void;
  remove(id: string, expectedRevision?: number): void;
  /** Explicit user deletion when the encrypted draft cannot be decrypted. */
  discardUnrecoverable?(expectedId?: string): void;
  /** Opaque identity only; this must not decrypt or read the private session body. */
  unrecoverableId?(): string | undefined;
  loadCleanup?(): WorkoutPendingStop | null;
  saveCleanup?(cleanup: WorkoutPendingStop): void;
  removeCleanup?(id: string): void;
}
