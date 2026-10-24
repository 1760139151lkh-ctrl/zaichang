import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../store';
import type { WorkoutPendingStop, WorkoutSessionRecord, WorkoutSessionStorage } from '../../shared/workout';
import { workoutSourceObjectId } from '../../shared/workout-source';
import { workoutFixTime } from '../../shared/workout';
import type { WorkoutInputFix } from '../../shared/workout';

export interface WorkoutDraftProtection {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

const number = z.number().finite();
const nonnegative = number.nonnegative();
const coordinate = z.tuple([number.min(-180).max(180), number.min(-90).max(90)]);
const recordingSourceSchema = z.object({ source: z.enum(['windows', 'adb', 'hdc', 'ios-simulator']),
  deviceId: z.string().min(1).max(256).optional() }).strict();
const cleanupSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().positive(), recordingSource: recordingSourceSchema.optional(),
  stream: z.object({ status: z.enum(['starting', 'listening', 'unavailable', 'denied', 'disconnected', 'stopped']), reason: z.string().max(1000) }).strict(),
  localRemoval: z.enum(['complete', 'unconfirmed']), sourceRetraction: z.enum(['complete', 'unconfirmed', 'not-required']),
  persistence: z.object({ status: z.enum(['encrypted-local', 'memory-only', 'error']), reason: z.string().max(1000).optional() }).strict(),
}).strict();
const cadenceObservation = z.object({
  status: z.enum(['listening', 'unsupported', 'denied', 'unavailable', 'stopped']),
  source: z.enum(['android-step-detector', 'android-step-counter']).nullable(),
  permission: z.enum(['granted', 'denied', 'not-required', 'unknown']),
  deviceId: z.string().min(1).max(256), clockId: z.string().min(1).max(256), subscriptionId: z.string().min(1).max(256),
  sequence: z.number().int().nonnegative(), timestamp: number.positive(), receivedAt: number.positive(),
  elapsedRealtimeMs: nonnegative, cumulativeSteps: nonnegative.nullable(), provenance: z.enum(['device', 'simulated', 'unknown']),
  sensor: z.object({ name: z.string().max(200), vendor: z.string().max(200), version: z.number().int().nonnegative() }).optional(),
});
const rawFix = z.object({
  coordinate, crs: z.literal('EPSG:4326'), timestamp: number.positive(), receivedAt: number.positive(),
  accuracy: nonnegative.nullable(), altitude: number.nullable(), altitudeAccuracy: nonnegative.nullable(),
  speed: number.nullable(), heading: number.min(0).max(360).nullable(),
  source: z.string().min(1).max(160), deviceId: z.string().min(1).max(256), deviceLabel: z.string().max(256),
  provenance: z.enum(['device', 'simulated', 'unknown']), mock: z.boolean().nullable(),
  reportedElapsedRealtimeMs: number.optional(),
  clockQuality: z.enum(['boot-range-checked', 'outside-boot-range', 'unverified']).optional(),
  clockCorrelation: z.object({ kind: z.literal('command-reply'), commandId: z.string().uuid(), subscriptionId: z.string().uuid(),
    basis: z.enum(['state-after-command', 'command-processed']).optional(),
    sourceProcessId: z.number().int().positive(), sourceObservedAt: number.positive(), hostSentAt: number.positive(),
    hostReceivedAt: number.positive(), hostElapsedMs: nonnegative, hostSinceAckMs: nonnegative.optional() }).strict().optional(),
}).passthrough();
const recordSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().uuid(), revision: z.number().int().positive(), sampleRevision: z.number().int().nonnegative(),
  sport: z.enum(['walking', 'running', 'cycling']), status: z.enum(['recording', 'paused', 'finished', 'cancelled']),
  pauseReason: z.enum(['user', 'stationary', 'interrupted', 'permission', 'capacity']).optional(),
  retention: z.literal('encrypted-local'), startedAt: number.positive(), updatedAt: number.positive(), finishedAt: number.positive().nullable(),
  recordingSource: recordingSourceSchema.optional(),
  latestCadenceObservation: cadenceObservation.optional(),
  metrics: z.object({ distanceMeters: nonnegative, rawDistanceMeters: nonnegative, elapsedActiveMs: nonnegative,
    trustedActiveMs: nonnegative, movingMs: nonnegative, averagePaceSecondsPerKm: nonnegative.nullable(),
    paceSecondsPerKm: nonnegative.nullable(), cadenceStepsPerMinute: nonnegative.nullable() }),
  points: z.array(z.object({ sequence: z.number().int().positive(),
    // Rejected malformed samples are diagnostics only and never become measured geometry.
    raw: z.unknown(), quality: z.enum(['accepted', 'provider-not-selected', 'invalid', 'accuracy', 'stale', 'timestamp', 'outlier', 'source-change']),
    segment: z.number().int().nonnegative(), filteredCoordinate: coordinate.optional(), deltaDistanceMeters: nonnegative,
    trustedDeltaMs: nonnegative, cumulativeDistanceMeters: nonnegative, cumulativeTrustedMs: nonnegative,
  }).passthrough()).max(86_400),
  splits: z.array(z.object({ kilometer: z.number().int().positive(), distanceMeters: z.literal(1000),
    durationMs: nonnegative, paceSecondsPerKm: nonnegative, completedAt: number.positive() })),
  rejectedPoints: z.number().int().nonnegative(), segment: z.number().int().nonnegative(),
  signal: z.enum(['searching', 'good', 'weak', 'disconnected', 'stopped']), motion: z.enum(['unknown', 'moving', 'stationary']),
  stream: z.object({ status: z.enum(['starting', 'listening', 'unavailable', 'denied', 'disconnected', 'stopped']), reason: z.string() }),
  provenance: z.enum(['device', 'simulated', 'unknown']),
  persistence: z.object({ status: z.enum(['encrypted-local', 'memory-only', 'error']), reason: z.string().optional() }),
  school: z.object({ submission: z.literal('not-submitted'), validCount: z.null() }),
}).passthrough().superRefine((record, context) => {
  for (const point of record.points) if (['accepted', 'provider-not-selected'].includes(point.quality)) {
    const parsed = rawFix.safeParse(point.raw);
    if (!parsed.success || !workoutFixTime(parsed.data as unknown as WorkoutInputFix, parsed.data.receivedAt)?.fresh)
      context.addIssue({ code: 'custom', message: 'Invalid accepted position' });
  }
  if (record.metrics.movingMs > record.metrics.trustedActiveMs + 1 || record.metrics.trustedActiveMs > record.metrics.elapsedActiveMs + 1)
    context.addIssue({ code: 'custom', message: 'Invalid elapsed duration' });
});

/** Encrypted payload in the existing meta store. No location plaintext enters SQLite/WAL. */
export class WorkoutDraftStore implements WorkoutSessionStorage {
  private readonly key: string;
  private readonly identity: string;
  private readonly cleanupKey: string;
  constructor(
    private store: Pick<Store, 'db' | 'meta' | 'putMeta' | 'kernel'>,
    private protection: WorkoutDraftProtection,
  ) {
    this.identity = JSON.stringify([store.kernel.identity.principalId, store.kernel.identity.workspaceId]);
    this.key = 'workout-draft:v1:' + createHash('sha256').update(this.identity).digest('hex');
    this.cleanupKey = this.key + ':cleanup';
  }

  private available() {
    if (!this.protection.isEncryptionAvailable()
      || process.platform === 'linux' && this.protection.getSelectedStorageBackend?.() === 'basic_text')
      throw new Error('系统安全存储暂不可用，运动轨迹没有以明文保存。');
  }

  private pointKey(id: string, sequence: number) { return `${this.key}:point:${id}:${String(sequence).padStart(6, '0')}`; }

  load(): WorkoutSessionRecord | null {
    const envelope = this.store.meta<{ version: number; id: string; pointCount: number; ciphertext: string } | null>(this.key, null);
    if (!envelope) return null;
    const identity = z.string().uuid().safeParse(envelope.id);
    if (!identity.success) throw new Error('运动草稿的会话身份无法识别，没有读取正文。');
    const cleanup = this.store.meta<{ id?: string } | null>(this.cleanupKey, null);
    if (cleanup?.id === identity.data) return null;
    if (this.store.kernel.hasFence(workoutSourceObjectId(identity.data), 'workout:self')) {
      // Cancellation may have committed its deletion fence before a failed local delete.
      // Do not decrypt/revive that body on restart; finish the already-authorized local cleanup.
      this.discardUnrecoverable(identity.data);
      return null;
    }
    this.available();
    if (envelope.version !== 1 || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > 4 * 1024 * 1024
      || !Number.isInteger(envelope.pointCount) || envelope.pointCount < 0 || envelope.pointCount > 86_400)
      throw new Error('运动草稿格式无法识别。');
    const decoded = JSON.parse(this.protection.decryptString(Buffer.from(envelope.ciphertext, 'base64')));
    if (decoded.identity !== this.identity) throw new Error('这份运动草稿属于另一个本机用户。');
    if (decoded.record.id !== envelope.id) throw new Error('运动草稿已经变化。');
    const rows = this.store.db.prepare('SELECT value FROM meta WHERE key LIKE ? ORDER BY key').all(`${this.key}:point:${envelope.id}:%`);
    if (rows.length !== envelope.pointCount) throw new Error('运动草稿的轨迹没有完整保存。');
    decoded.record.points = rows.map((row, index) => {
      const point = JSON.parse(this.protection.decryptString(Buffer.from(String(JSON.parse(String(row.value)).ciphertext), 'base64')));
      if (point.identity !== this.identity || point.id !== envelope.id || point.point.sequence !== index + 1)
        throw new Error('运动草稿的轨迹顺序无法确认。');
      return point.point;
    });
    return recordSchema.parse(decoded.record) as unknown as WorkoutSessionRecord;
  }

  save(record: WorkoutSessionRecord) {
    if (record.retention !== 'encrypted-local') throw new Error('这次运动仅在当前窗口保留。');
    if (this.store.meta<{ id?: string } | null>(this.cleanupKey, null)?.id === record.id)
      throw new Error('这次运动已经开始清理，没有重新保存待删正文。');
    if (this.store.kernel.hasFence(workoutSourceObjectId(record.id), 'workout:self'))
      throw new Error('这次运动已经取消，没有重新保存已删除的正文。');
    this.available();
    const old = this.store.meta<{ id: string; pointCount: number; revision?: number; sampleRevision?: number } | null>(this.key, null);
    if (old && (old.id !== record.id || !Number.isInteger(old.pointCount) || old.pointCount < 0
      || old.pointCount > record.points.length || (old.revision ?? 0) > record.revision
      || (old.sampleRevision ?? 0) > record.sampleRevision)) throw new Error('运动草稿已经变化，没有覆盖另一份记录。');
    // Append only new encrypted samples; a long recording does not rewrite its full track each second.
    const encryptedPoints = record.points.slice(old?.pointCount || 0).map(point => ({
      sequence: point.sequence,
      ciphertext: this.protection.encryptString(JSON.stringify({ identity: this.identity, id: record.id, point })).toString('base64'),
    }));
    const ciphertext = this.protection.encryptString(JSON.stringify({ identity: this.identity, record: { ...record, points: [] } })).toString('base64');
    this.store.kernel.write(() => {
      for (const point of encryptedPoints) this.store.putMeta(this.pointKey(record.id, point.sequence), { ciphertext: point.ciphertext });
      this.store.putMeta(this.key, { version: 1, id: record.id, revision: record.revision, sampleRevision: record.sampleRevision,
        pointCount: record.points.length, ciphertext });
    });
  }

  remove(id: string, expectedRevision?: number) {
    const envelope = this.store.meta<{ id: string; revision?: number } | null>(this.key, null);
    if (envelope && (envelope.id !== id || expectedRevision !== undefined && (envelope.revision ?? 0) > expectedRevision))
      throw new Error('运动草稿已经变化，没有删除另一份记录。');
    this.discardUnrecoverable();
  }

  unrecoverableId(): string | undefined {
    try {
      const envelope = this.store.meta<{ id?: unknown } | null>(this.key, null);
      const id = z.string().uuid().safeParse(envelope?.id);
      return id.success ? id.data : undefined;
    } catch { return undefined; }
  }

  loadCleanup(): WorkoutPendingStop | null {
    const envelope = this.store.meta<{ version: number; id: string; ciphertext: string } | null>(this.cleanupKey, null);
    if (envelope) {
      this.available();
      if (envelope.version !== 1 || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > 65536)
        throw new Error('本机的停采清理回执暂时无法读取。');
      const decoded = JSON.parse(this.protection.decryptString(Buffer.from(envelope.ciphertext, 'base64')));
      const cleanup = cleanupSchema.parse(decoded.cleanup);
      if (decoded.identity !== this.identity || cleanup.id !== envelope.id) throw new Error('停采清理身份已经变化。');
      return { ...cleanup, persistence: { status: 'encrypted-local' } };
    }
    const id = this.unrecoverableId();
    if (!id || !this.store.kernel.hasFence(workoutSourceObjectId(id), 'workout:self')) return null;
    const draft = this.store.meta<{ revision?: number } | null>(this.key, null);
    const cleanup: WorkoutPendingStop = { id, revision: Number.isSafeInteger(draft?.revision) && draft!.revision! > 0 ? draft!.revision! : 1,
      stream: { status: 'unavailable', reason: '这次记录已经停用，设备定位还没确认关闭。选一下原设备，继续清理。' },
      localRemoval: 'unconfirmed', sourceRetraction: 'unconfirmed', persistence: { status: 'memory-only' } };
    // Legacy leftovers expose only their opaque identity. A delete fence forbids decrypting the body.
    try { cleanup.persistence = { status: 'encrypted-local' }; this.saveCleanup(cleanup); }
    catch { cleanup.persistence = { status: 'error', reason: '还没能保存停止定位的进展，关闭后可能无法接着处理。' }; }
    return cleanup;
  }

  saveCleanup(cleanup: WorkoutPendingStop) {
    this.available();
    const value = cleanupSchema.parse(cleanup);
    const old = this.store.meta<{ id: string } | null>(this.cleanupKey, null);
    if (old && old.id !== value.id) throw new Error('还有另一份停采清理没有结束，没有覆盖它。');
    const ciphertext = this.protection.encryptString(JSON.stringify({ identity: this.identity, cleanup: value })).toString('base64');
    this.store.putMeta(this.cleanupKey, { version: 1, id: value.id, ciphertext });
  }

  removeCleanup(id: string) {
    const old = this.store.meta<{ id: string } | null>(this.cleanupKey, null);
    if (old && old.id !== id) throw new Error('清理回执已经变化，没有删除另一份回执。');
    this.store.db.prepare('DELETE FROM meta WHERE key=?').run(this.cleanupKey);
    this.store.kernel.checkpointPrivacy();
  }

  discardUnrecoverable(expectedId?: string) {
    const current = this.unrecoverableId();
    if (expectedId && current && current !== expectedId) throw new Error('本机运动草稿已经变化，没有删除另一份记录。');
    // Deletion remains possible when the OS key is unavailable; no decryption is needed.
    this.store.kernel.write(() => {
      this.store.db.prepare('DELETE FROM meta WHERE key=? OR key LIKE ?').run(this.key, `${this.key}:point:%`);
    });
    this.store.kernel.checkpointPrivacy();
  }
}
