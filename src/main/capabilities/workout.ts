import { z } from 'zod';
import { HarnessError } from '../../shared/harness';
import { workoutFixTime, type WorkoutState } from '../../shared/workout';
import type { PolicyKernel } from '../runtime/policy';
import type { CapabilityBroker, CapabilityResult, InvocationContext } from './broker';

export const WORKOUT_SOURCE_ID = 'workout:self';

const nonnegative = z.number().finite().nonnegative();
const stamp = z.string().datetime();
const hostTimeEstimate = z.object({ earliest: stamp, latest: stamp }).strict();
const ageRange = z.object({ earliest: z.number().finite(), latest: z.number().finite() }).strict();
const timeBasis = z.enum(['reported-time', 'bounded-host-estimate']);
const observation = z.object({ observedAt: stamp.nullable(), receivedAt: stamp.nullable(),
  ageMs: nonnegative.nullable(), receivedAgeMs: nonnegative.nullable(),
  ageRangeMs: ageRange.nullable(), timeBasis: timeBasis.nullable(), hostTimeEstimate: hostTimeEstimate.nullable(),
  accuracyMeters: nonnegative.nullable(), accuracyConfidence: z.enum(['68-percent', '95-percent', 'unknown']),
  quality: z.enum(['accepted', 'provider-not-selected', 'invalid', 'accuracy', 'stale', 'timestamp', 'outlier', 'source-change']),
}).strict();
const place = z.object({
  state: z.enum(['candidate', 'ambiguous', 'unmatched', 'weak-signal', 'unavailable']),
  reason: z.enum(['one-candidate', 'multiple-candidates', 'no-recorded-road', 'accuracy-missing',
    'accuracy-too-wide', 'invalid-fix', 'outside-map', 'map-unavailable']),
  timing: z.enum(['current', 'last-known', 'stale']),
  observedAt: stamp, receivedAt: stamp, ageMs: nonnegative, receivedAgeMs: nonnegative,
  ageRangeMs: ageRange, timeBasis, hostTimeEstimate: hostTimeEstimate.nullable(),
  provenance: z.enum(['device', 'simulated', 'unknown']),
  accuracyMeters: nonnegative.nullable(), mapAccuracyMeters: z.null(),
  map: z.object({ label: z.string().nullable(), version: z.string(), sourceDate: z.string(),
    networkSha256: z.string().nullable(), geographySha256: z.string().nullable(), sharedFactsSha256: z.string().nullable(),
  }).strict(),
  roads: z.array(z.object({ id: z.string(), sourceEdgeId: z.string(), wayId: z.string(),
    name: z.string(), conditions: z.array(z.string()), sourceLocator: z.string(),
  }).strict()).max(6),
  candidateCount: z.number().int().nonnegative(),
  venues: z.array(z.object({ id: z.string(), name: z.string(),
    relation: z.enum(['inside-recorded-area', 'near-recorded-boundary']), geometryVersion: z.string(),
    nominalLapMeters: nonnegative.nullable(), nominalLapBasis: z.string(),
    referenceLoopMeters: nonnegative.nullable(), referenceLoopBasis: z.string().nullable(),
    sourceLocator: z.string(), venueSourceLocator: z.string().nullable(),
  }).strict()),
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
  place: place.nullable(),
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
    'lastObservationTimesAndAccuracy', 'lastAcceptedObservationTimesAndAccuracy', 'measurementTimeEstimateAndAgeBounds', 'lastKilometerSplit',
    'campusPlaceNamesAndPublicSourceIds', 'placeObservationTimesAndAccuracy', 'mapInputVersions',
    'nominalTrackLengthAndReferenceLoopBasis',
    'localRetention', 'schoolSubmission', 'resourceCleanup'],
  containsCoordinates: false, containsTrack: false, containsDeviceIdentity: false, containsClockProof: false,
  meaning: '看看地图当前仍保留的这份运动：大约在校园哪里、走了多远、最近一公里的节奏，以及定位和暂停情况。暂停或结束后，仍能沿这份记录看最后读到的位置。原始位置与路线保留在本机。',
} as const;

// Same freshness window as the owner's sample-gap boundary. A recent delivery
// cannot make an old measurement current, and a stopped record stays historical.
const CURRENT_PLACE_AGE_MS = 15_000;

function projectPlace(record: NonNullable<WorkoutState['session']>,
  accepted: NonNullable<WorkoutState['session']>['points'][number] | undefined, now: number): z.infer<typeof place> | null {
  try {
    const match = accepted?.mapMatch;
    if (!accepted || !match || match.method !== 'campus-local-candidates/v1'
      || match.observedAt !== accepted.raw.timestamp || match.fixSource !== accepted.raw.source
      || match.horizontalAccuracyM !== accepted.raw.accuracy
      || match.venues.some(venue => venue.geometryVersion !== match.mapVersion)
      || !Number.isFinite(match.observedAt) || !Number.isFinite(accepted.raw.receivedAt)
      || Number.isNaN(new Date(match.observedAt).getTime()) || Number.isNaN(new Date(accepted.raw.receivedAt).getTime())) return null;
    const time = workoutFixTime(accepted.raw, now, CURRENT_PLACE_AGE_MS);
    if (!time || !time.fresh && time.ageMs.earliest < 0) return null;
    const ageMs = Math.max(0, time.ageMs.latest), receivedAgeMs = Math.max(0, now - accepted.raw.receivedAt);
    const last = record.points.at(-1);
    const recent = time.fresh;
    const isCurrent = recent
      && record.status === 'recording' && record.stream.status === 'listening' && record.signal === 'good'
      && accepted.segment === record.segment && (last?.quality === 'accepted' || last?.quality === 'provider-not-selected');
    // Copy only public semantic evidence. In particular selected/candidate
    // coordinates, fractions, residuals, raw source, device identity and clock
    // correlation proofs/offsets stay here.
    const roads = match.candidates.slice(0, 6).map(road => ({ id: road.edgeId, sourceEdgeId: road.sourceEdgeId,
      wayId: road.wayId, name: road.name, conditions: [...road.conditions], sourceLocator: road.sourceLocator }));
    return place.parse({ state: match.state, reason: match.reason, timing: !recent ? 'stale' : isCurrent ? 'current' : 'last-known',
      observedAt: new Date(match.observedAt).toISOString(), receivedAt: new Date(accepted.raw.receivedAt).toISOString(),
      timeBasis: time.correlated ? 'bounded-host-estimate' : 'reported-time', ageRangeMs: { ...time.ageMs },
      hostTimeEstimate: time.correlated ? { earliest: new Date(time.measuredAt.earliest).toISOString(),
        latest: new Date(time.measuredAt.latest).toISOString() } : null,
      ageMs, receivedAgeMs, provenance: record.provenance, accuracyMeters: match.horizontalAccuracyM, mapAccuracyMeters: null,
      map: { label: match.mapLabel || null, version: match.mapVersion, sourceDate: match.mapSourceDate,
        networkSha256: match.networkSha256, geographySha256: match.geographySha256, sharedFactsSha256: match.sharedFactsSha256 },
      roads, candidateCount: match.candidateCount,
      venues: match.venues.map(venue => ({ id: venue.venueId, name: venue.name, relation: venue.relation,
        geometryVersion: venue.geometryVersion, nominalLapMeters: venue.nominalLapM, nominalLapBasis: venue.nominalLapBasis,
        referenceLoopMeters: venue.referenceLoopM ?? null, referenceLoopBasis: venue.referenceLoopBasis || null,
        sourceLocator: venue.sourceLocator, venueSourceLocator: venue.venueSourceLocator || null })),
    });
  } catch {
    // Historical drafts can predate optional map evidence. A damaged match
    // must not prevent reading the original workout's time and distance.
    return null;
  }
}

/** Projection runs beside the existing owner. It neither restores nor starts it. */
export function projectWorkoutCurrent(state: WorkoutState, now: number): WorkoutCurrentSummary {
  if (state.access !== 'active') throw new HarnessError('workout_private', '这次运动现在没有开放读取，已经保存的记录仍在原处。');
  const record = state.session;
  const observationTime = (value: number) => Number.isFinite(value) && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toISOString() : null;
  const point = (value: NonNullable<WorkoutState['session']>['points'][number] | undefined) => {
    if (!value?.raw || typeof value.raw !== 'object') return null;
    const time = workoutFixTime(value.raw, now, CURRENT_PLACE_AGE_MS);
    return { observedAt: observationTime(value.raw.timestamp), receivedAt: observationTime(value.raw.receivedAt),
      ageMs: time && (time.fresh || time.ageMs.earliest >= 0) ? Math.max(0, time.ageMs.latest) : null,
      receivedAgeMs: observationTime(value.raw.receivedAt) ? Math.max(0, now - value.raw.receivedAt) : null,
      ageRangeMs: time ? { ...time.ageMs } : null,
      timeBasis: time ? time.correlated ? 'bounded-host-estimate' as const : 'reported-time' as const : null,
      hostTimeEstimate: time?.correlated ? { earliest: observationTime(time.measuredAt.earliest),
        latest: observationTime(time.measuredAt.latest) } : null,
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
      place: projectPlace(record, accepted, now),
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

function describePlace(value: z.infer<typeof place> | null): string | null {
  if (!value) return null;
  const venues = [...new Set(value.venues.map(venue => venue.name).filter(Boolean))];
  const roads = [...new Set(value.roads.map(road => road.name).filter(Boolean))];
  const prefix = value.timing === 'current' ? '定位大约在' : '上次定位大约在';
  let description: string;
  if (venues.length === 1) {
    const inside = value.venues.every(venue => venue.relation === 'inside-recorded-area');
    description = prefix + venues[0] + (inside ? '范围内' : '附近');
  } else if (venues.length > 1) description = prefix + venues.join('、') + '附近，具体场地还分不清';
  else if (roads.length === 1) description = prefix + roads[0] + '一带'
    + (value.state === 'ambiguous' ? '，具体路段还分不清' : '');
  else if (roads.length > 1) description = prefix + roads.slice(0, 3).join('、') + '附近，暂时分不清是哪条路';
  else if (value.state === 'weak-signal') description = '这次定位范围比较宽，暂时辨不出具体场地';
  else if (value.reason === 'outside-map') description = '最近的位置不在这份校园地图的范围内';
  else if (value.state === 'unavailable') description = '这次还没能对上校园地图';
  else description = value.candidateCount ? '附近道路还没有名称，暂时说不准具体路段' : '附近还没有匹配到已记录的道路';
  if (value.timing === 'stale') {
    const seconds = Math.ceil(Math.max(value.ageMs, value.receivedAgeMs) / 1000);
    description += `；这是大约${seconds < 60 ? seconds + '秒' : Math.floor(seconds / 60) + '分' + seconds % 60 + '秒'}前的位置`;
  }
  return description;
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
  const details = [`这次${sport}${status}`];
  if (record.status === 'paused' && record.pauseReason) details.push({
    user: '你按下了暂停', stationary: '这段时间没有记到新的路程，记录自动暂停了',
    interrupted: '上次记录中断了，可以从这里继续', permission: '定位权限还没恢复，新的路程暂时没有记进来',
    capacity: '这次记录已装满，需要结束后再开始新的一次',
  }[record.pauseReason]);
  if (record.provenance === 'simulated') details.push('这份记录来自模拟定位');
  else if (record.provenance === 'unknown') details.push('定位来源暂时没辨明');
  const location = describePlace(record.place);
  if (location) details.push(location);
  const distance = record.metrics.distanceMeters;
  details.push(distance > 0 ? `定位估计的路程约${distance >= 1000 ? (distance / 1000).toFixed(2) + '公里' : Math.round(distance) + '米'}`
    : record.lastAcceptedObservation ? '记录里还没有累积路程' : '定位还没记下可用路程');
  const activeSeconds = Math.floor(record.metrics.elapsedActiveMs / 1000);
  details.push(`开着记录的时间约${Math.floor(activeSeconds / 60)}分${activeSeconds % 60}秒`);
  if (record.lastSplit) {
    const seconds = Math.round(record.lastSplit.durationMs / 1000);
    details.push(`记录中的第${record.lastSplit.kilometer}公里用时${Math.floor(seconds / 60)}分${seconds % 60}秒`);
  }
  if (record.metrics.cadenceStepsPerMinute === null) details.push('步频这次还没有读数');
  if (record.streamStatus === 'denied' && record.pauseReason !== 'permission') details.push('定位权限还没打开');
  else if (record.streamStatus === 'unavailable') details.push('这会儿设备还没能提供位置');
  if (record.signal === 'weak') details.push('最近的定位有些飘，距离和节奏先作估计');
  else if (record.signal === 'disconnected') details.push('定位连接断了，新的路程还没记进来');
  else if (record.signal === 'searching') details.push('正在等新的定位');
  if (record.lastObservation?.quality === 'stale') details.push(record.status === 'recording'
    ? '最近位置的时间没对上，这个点没添进路程，正在等新位置接上' : '末次位置的时间没对上，这个点没添进这次路程');
  if (record.status === 'recording' && record.metrics.paceSecondsPerKm === null) details.push('当前配速还在等足够的路程');
  if (record.persistence === 'error') details.push('这次记录暂时还没存好，眼前的内容仍保留着');
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
    id: 'local-workout', version: '4', trust: 'bundled_reviewed', sourceId: WORKOUT_SOURCE_ID,
    capabilities: [{ name: 'workout.current', displayName: '看看这次运动', version: '4',
      description: '看看地图当前仍保留的这份跑步、散步或骑行记录；正在记、已暂停或已结束，都能沿同一份记录看最近的位置和进展：大约在校园哪块场地、哪条路附近，定位估出的距离和配速、用了多久、步频、完成的公里，以及暂停的缘由。地点带着测量时间、精度和地图来处；跑道的400米标准与地图参考环线分开写清。原始位置和路线留在本机；想看后来的进展可再读一次，学校计次另查体艺记录。',
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
