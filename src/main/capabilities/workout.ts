import { z } from 'zod';
import { HarnessError } from '../../shared/harness';
import type { WorkoutState } from '../../shared/workout';
import type { PolicyKernel } from '../runtime/policy';
import type { CapabilityBroker, CapabilityResult, InvocationContext } from './broker';

export const WORKOUT_SOURCE_ID = 'workout:self';

const nonnegative = z.number().finite().nonnegative();
const stamp = z.string().datetime();
const observation = z.object({ observedAt: stamp.nullable(), receivedAt: stamp.nullable(),
  ageMs: nonnegative.nullable(), receivedAgeMs: nonnegative.nullable(),
  accuracyMeters: nonnegative.nullable(), accuracyConfidence: z.enum(['68-percent', '95-percent', 'unknown']),
  quality: z.enum(['accepted', 'provider-not-selected', 'invalid', 'accuracy', 'stale', 'timestamp', 'outlier', 'source-change']),
}).strict();
const current = z.object({
  schemaVersion: z.literal(1), id: z.string().uuid(), revision: z.number().int().positive(),
  sampleRevision: z.number().int().nonnegative(),
  sport: z.enum(['walking', 'running', 'cycling']), status: z.enum(['recording', 'paused', 'finished', 'cancelled']),
  startedAt: stamp, updatedAt: stamp, finishedAt: stamp.nullable(),
  pauseReason: z.enum(['user', 'stationary', 'interrupted', 'permission', 'capacity']).nullable(),
  signal: z.enum(['searching', 'good', 'weak', 'disconnected', 'stopped']),
  motion: z.enum(['unknown', 'moving', 'stationary']),
  streamStatus: z.enum(['starting', 'listening', 'unavailable', 'denied', 'disconnected', 'stopped']),
  provenance: z.enum(['device', 'simulated', 'unknown']),
  metrics: z.object({ distanceMeters: nonnegative, elapsedActiveMs: nonnegative,
    trustedActiveMs: nonnegative, movingMs: nonnegative, paceSecondsPerKm: nonnegative.nullable(),
    averagePaceSecondsPerKm: nonnegative.nullable(), cadenceStepsPerMinute: nonnegative.nullable(),
  }).strict(),
  lastObservation: observation.nullable(), lastAcceptedObservation: observation.nullable(),
  completedKilometers: z.number().int().nonnegative(),
  lastSplit: z.object({ kilometer: z.number().int().positive(), durationMs: nonnegative,
    paceSecondsPerKm: nonnegative, completedAt: stamp }).strict().nullable(),
  retention: z.enum(['encrypted-local', 'session-only']),
  persistence: z.enum(['encrypted-local', 'memory-only', 'error']),
  school: z.object({ submission: z.literal('not-submitted'), validCount: z.null() }).strict(),
}).strict();
const workoutSummarySchema = z.object({
  readAt: stamp, current: current.nullable(),
  cleanup: z.object({ recordingStopped: z.boolean(),
    streamStatus: z.enum(['starting', 'listening', 'unavailable', 'denied', 'disconnected', 'stopped']),
    localRemoval: z.enum(['complete', 'unconfirmed']),
    sourceRetraction: z.enum(['complete', 'unconfirmed', 'not-required']),
  }).strict().optional(),
  recovery: z.enum(['unavailable', 'none']),
}).strict();

export type WorkoutCurrentSummary = z.infer<typeof workoutSummarySchema>;
export interface WorkoutSummaryOwner { summary(): WorkoutCurrentSummary }

/** Only these fields can cross into a model request, never the original track. */
export const workoutReadPurpose = {
  projection: 'current_local_workout_summary',
  fields: ['id', 'schemaVersion', 'revision', 'sampleRevision', 'sport', 'status', 'times', 'pauseReason',
    'signal', 'motion', 'streamStatus', 'provenance', 'distance', 'activeDuration', 'pace', 'cadenceAvailability',
    'lastObservationTimesAndAccuracy', 'lastAcceptedObservationTimesAndAccuracy', 'lastKilometerSplit',
    'localRetention', 'schoolSubmission', 'resourceCleanup'],
  containsCoordinates: false, containsTrack: false, containsDeviceIdentity: false,
  meaning: '看看已经开启的这次运动：走了多远、跑了多久、最近一公里的节奏，以及定位和暂停情况。这里带回本次读到的运动摘要，原始位置与路线保留在本机。',
} as const;

/** Projection runs beside the existing owner. It neither restores nor starts it. */
export function projectWorkoutCurrent(state: WorkoutState, now: number): WorkoutCurrentSummary {
  if (state.access !== 'active') throw new HarnessError('workout_private', '这次运动现在没有开放读取，已经保存的记录仍在原处。');
  const record = state.session;
  const observationTime = (value: number) => Number.isFinite(value) && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toISOString() : null;
  const point = (value: NonNullable<WorkoutState['session']>['points'][number] | undefined) => {
    if (!value?.raw || typeof value.raw !== 'object') return null;
    return { observedAt: observationTime(value.raw.timestamp), receivedAt: observationTime(value.raw.receivedAt),
      ageMs: observationTime(value.raw.timestamp) ? Math.max(0, now - value.raw.timestamp) : null,
      receivedAgeMs: observationTime(value.raw.receivedAt) ? Math.max(0, now - value.raw.receivedAt) : null,
      accuracyMeters: typeof value.raw.accuracy === 'number' && Number.isFinite(value.raw.accuracy) && value.raw.accuracy >= 0
        ? value.raw.accuracy : null,
      accuracyConfidence: ['68-percent', '95-percent'].includes(value.raw.accuracyConfidence || '')
        ? value.raw.accuracyConfidence! : 'unknown' as const, quality: value.quality };
  };
  const last = record?.points.at(-1);
  let accepted: typeof last;
  for (let index = (record?.points.length || 0) - 1; index >= 0; index--) {
    if (record!.points[index].quality === 'accepted') { accepted = record!.points[index]; break; }
  }
  const split = record?.splits.at(-1);
  return workoutSummarySchema.parse({ readAt: new Date(now).toISOString(),
    current: record ? {
      schemaVersion: record.schemaVersion, id: record.id, revision: record.revision, sampleRevision: record.sampleRevision,
      sport: record.sport, status: record.status,
      startedAt: new Date(record.startedAt).toISOString(), updatedAt: new Date(record.updatedAt).toISOString(),
      finishedAt: record.finishedAt === null ? null : new Date(record.finishedAt).toISOString(),
      pauseReason: record.pauseReason || null, signal: record.signal, motion: record.motion,
      streamStatus: record.stream.status, provenance: record.provenance,
      metrics: { distanceMeters: record.metrics.distanceMeters, elapsedActiveMs: record.metrics.elapsedActiveMs,
        trustedActiveMs: record.metrics.trustedActiveMs, movingMs: record.metrics.movingMs,
        paceSecondsPerKm: record.metrics.paceSecondsPerKm, averagePaceSecondsPerKm: record.metrics.averagePaceSecondsPerKm,
        cadenceStepsPerMinute: record.metrics.cadenceStepsPerMinute },
      lastObservation: point(last), lastAcceptedObservation: point(accepted), completedKilometers: record.splits.length,
      lastSplit: split ? { kilometer: split.kilometer, durationMs: split.durationMs,
        paceSecondsPerKm: split.paceSecondsPerKm, completedAt: new Date(split.completedAt).toISOString() } : null,
      retention: record.retention, persistence: record.persistence.status, school: { ...record.school },
    } : null,
    ...(state.pendingStop ? { cleanup: { recordingStopped: state.pendingStop.stream.status === 'stopped',
      streamStatus: state.pendingStop.stream.status, localRemoval: state.pendingStop.localRemoval,
      sourceRetraction: state.pendingStop.sourceRetraction } } : {}),
    recovery: state.recoveryError ? 'unavailable' : 'none',
  });
}

function describeWorkout(view: WorkoutCurrentSummary): string {
  const record = view.current;
  if (!record) {
    if (view.cleanup) {
      const steps = [view.cleanup.recordingStopped ? '定位已停下' : '还在等设备确认停止定位',
        view.cleanup.localRemoval === 'complete' ? '本机这份记录已清除' : '本机记录尚未确认清除',
        ...(view.cleanup.sourceRetraction === 'not-required' ? [] : [view.cleanup.sourceRetraction === 'complete'
          ? '先前使用的引用也已撤回' : '先前使用的引用尚未确认撤回'])];
      return steps.join('，') + '。';
    }
    return view.recovery === 'unavailable' ? '上次的运动记录暂时没能打开，恢复后可以接着看。' : '现在没有正在展开的运动记录。';
  }
  const sport = { walking: '散步', running: '跑步', cycling: '骑行' }[record.sport];
  const status = { recording: '还在记录', paused: '已暂停', finished: '已结束', cancelled: '已取消' }[record.status];
  const details = [`这次${sport}${status}，距离和配速按已采纳的定位点估算`];
  if (record.provenance === 'simulated') details.push('这份记录来自模拟定位');
  else if (record.provenance === 'unknown') details.push('定位来源暂时没辨明');
  if (record.signal === 'weak') details.push('眼下定位较弱，距离和节奏可能有偏差');
  else if (record.signal === 'disconnected') details.push('定位连接断了，新的路程还没记进来');
  else if (record.signal === 'searching') details.push('正在等新的定位');
  if (record.lastObservation?.quality === 'stale') details.push('最近送来的位置测得较早');
  if (record.metrics.paceSecondsPerKm === null) details.push('当前配速还没算出来');
  if (record.metrics.cadenceStepsPerMinute === null) details.push('这次暂时没有步频读数');
  details.push('学校计入的锻炼次数可以到体艺记录里另看');
  return details.join('；') + '。';
}

export function registerWorkout(broker: CapabilityBroker, policy: PolicyKernel,
  getOwner: () => WorkoutSummaryOwner | undefined): void {
  const check = (ctx: InvocationContext) => {
    ctx.signal.throwIfAborted();
    const scope = policy.validate(ctx.scope);
    policy.require(ctx.scope, 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self')
      throw new HarnessError('scope_mismatch', '这份运动摘要只在本人的私下交流中查看。');
    if (!scope.sources.includes(WORKOUT_SOURCE_ID))
      throw new HarnessError('source_forbidden', '这次选用的资料里没有本地运动记录。');
  };
  broker.register({ manifest: {
    id: 'local-workout', version: '2', trust: 'bundled_reviewed', sourceId: WORKOUT_SOURCE_ID,
    capabilities: [{ name: 'workout.current', displayName: '看看这次运动', version: '2',
      description: '看看已经开启的这次跑步、散步或骑行：当前状态、距离、用时、配速、步频和最近一公里。也会带回定位新鲜度、精度与暂停情况；原始位置和路线留在本机。需要了解后来的进展时可以再读一次，学校计次另查体艺记录。',
      input: z.object({}).strict(),
      output: workoutSummarySchema.extend({ meaning: z.string() }).strict(),
      effect: 'read', requiredScopes: ['evidence:read'], subjects: ['self'], worlds: ['real'],
      timeoutMs: 5000, maxBytes: 10000, supportsIdempotency: false, supportsInspect: false, supportsCancel: false,
    }], egressHosts: [], platforms: ['*'], simulated: false, offline: 'read_cache', license: 'Project source',
  }, connectionStatus: () => ({ connected: !!getOwner(), ...(!getOwner() ? { reason: '当前没有本机运动记录入口。' } : {}) }),
  invoke: (_name, _args, ctx): CapabilityResult => {
    check(ctx);
    const owner = getOwner();
    if (!owner) return { status: 'not_connected', sourceId: WORKOUT_SOURCE_ID, simulated: false,
      reason: '当前没有本机运动记录入口；这次尚未查看运动数据。', coverage: { complete: false, scope: '当前本地运动' } };
    const view = workoutSummarySchema.parse(owner.summary());
    check(ctx);
    const meaning = describeWorkout(view);
    return { status: view.current || view.cleanup ? 'fresh' : view.recovery === 'unavailable' ? 'partial' : 'known_absent',
      sourceId: WORKOUT_SOURCE_ID, observedAt: view.current?.updatedAt || view.readAt, fetchedAt: view.readAt,
      data: { ...view, meaning }, coverage: { complete: view.recovery === 'none', scope: '这次本地运动在读取时刻的摘要' },
      simulated: false };
  } }, { reviewed: true, source: 'Bundled current-workout read projection review' });
}
