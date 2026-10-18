import { createHash, randomUUID } from 'node:crypto';
import type { Store } from '../store';
import type { PolicyKernel } from './policy';
import { HarnessError, type ScopeHandle } from '../../shared/harness';
import type { MapRouteResult } from '../../shared/map-v2';
import { sceneViewDsl, semanticSelectionSchema, type CampusRecord, type CampusScene, type MapScene, type PresentationView, type SceneRef, type SceneSnapshot, type SemanticSelection, type VerifiedSelection, type WeatherScene } from '../../shared/scenes';

/** A strict projection of the installed connector's named fields. No prose parsing,
 * guessed course matches, aggregate rows, or model-authored facts enter a scene. */
export function campusSnapshot(result: { status: string; sourceId: string; data?: unknown; fetchedAt?: string; expiresAt?: string; coverage?: { complete?: boolean } }, capability: string, input: unknown, now: string): CampusScene | undefined {
  const request = input as Record<string, any> | undefined, data = result.data as Record<string, any> | undefined;
  const account = result.sourceId === 'campus:zju-account', imported = result.sourceId === 'campus:local';
  if (!data || !['fresh', 'partial', 'stale'].includes(result.status) || !account && !imported) return;
  const query = capability === 'campus.query';
  if (query && (!['quick', 'select'].includes(request?.operation) || request?.spec?.operation && request.spec.operation !== 'select' || request?.spec?.join || request?.spec?.resources?.length || request?.spec?.group_by?.length || request?.spec?.metrics?.length)) return;
  if (!query && !['campus.lookup', 'campus.imported_lookup'].includes(capability)) return;
  if (!query && (account && data.origin !== 'zju_account' || imported && data.origin !== 'legacy_import')) return;
  if (query && !account) return;
  const requested = query ? request?.resource || request?.spec?.resource : request?.domain;
  const domain = requested === 'classes' ? 'schedule' : requested;
  if (!['courses', 'schedule', 'exams'].includes(domain)) return;
  if (data.domain && data.domain !== domain || data.resource && data.resource !== requested) return;
  if (!Array.isArray(data.records) || !data.records.length || data.conflicts?.length) return;
  const text = (value: unknown, limit = 400): string | undefined => typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : undefined;
  const scalar = (value: unknown): string | number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : text(value, 80);
  const rows: CampusRecord[] = [];
  for (const value of data.records.slice(0, 100)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const rawId = imported ? value.id : domain === 'schedule' ? value.uid : domain === 'courses' ? value.key : value.id;
    const id = typeof rawId === 'string' || typeof rawId === 'number' && Number.isFinite(rawId) ? text(String(rawId), 160) : undefined;
    const title = text(imported ? value.title : domain === 'schedule' ? value.summary : value.name, 200);
    if (!id || !title || rows.some(row => row.id === id)) continue;
    const teachers = domain === 'courses' ? value.teachers : value.teacher;
    const teacherNames = (Array.isArray(teachers) ? teachers : [teachers]).flatMap(teacher => text(teacher, 100) ? [text(teacher, 100)!] : []).slice(0, 12);
    const version = imported ? data.materialVersions?.find((item: any) => item.id === id && item.domain === domain && item.sourceId === result.sourceId) : undefined;
    rows.push({ id, title,
      ...(text(imported ? value.startsAt : value.startTime, 80) ? { startsAt: text(imported ? value.startsAt : value.startTime, 80) } : {}),
      ...(text(imported ? value.endsAt : value.endTime, 80) ? { endsAt: text(imported ? value.endsAt : value.endTime, 80) } : {}),
      ...(text(value.dateLabel, 100) ? { dateLabel: text(value.dateLabel, 100) } : {}),
      ...(text(value.location) ? { location: text(value.location) } : {}),
      ...(teacherNames.length ? { teachers: teacherNames } : {}),
      ...(scalar(value.credit) !== undefined ? { credit: scalar(value.credit) } : {}),
      ...(text(value.semester_id, 80) ? { term: text(value.semester_id, 80) } : {}),
      ...(domain === 'exams' && text(value.type, 80) ? { examType: text(value.type, 80) } : {}),
      ...(domain === 'exams' && scalar(value.seat) !== undefined ? { seat: scalar(value.seat) } : {}),
      ...(value.status === 'cancelled' ? { cancelled: true } : {}),
      ...(value.rescheduled === true ? { rescheduled: true } : {}),
      ...(text(value.time_precision, 80) ? { timePrecision: text(value.time_precision, 80) } : {}),
      ...(Number.isInteger(version?.revision) && version.revision > 0 ? { sourceRevision: version.revision } : {}),
    });
  }
  if (!rows.length) return;
  const total = query ? data.total_matches : data.total;
  const fetchedAt = result.fetchedAt && Number.isFinite(Date.parse(result.fetchedAt)) ? result.fetchedAt : '';
  const term = text(data.termId === 'unspecified' ? undefined : data.termId || data.semester_id, 80);
  return { kind: 'campus', id: randomUUID(), revision: 1, createdAt: now, domain,
    source: { sourceId: result.sourceId, fetchedAt, expiresAt: result.expiresAt,
      version: createHash('sha256').update(JSON.stringify({ sourceId: result.sourceId, fetchedAt, data })).digest('hex'), coverage: result.coverage },
    sourceLabel: imported ? text(data.source, 200) || '导入的校园资料' : '浙江大学校园资料',
    origin: imported ? 'legacy_import' : 'zju_account', ...(term ? { term } : {}), records: rows,
    ...(typeof total === 'number' && Number.isInteger(total) && total >= rows.length ? { total } : {}),
    complete: result.coverage?.complete === true && rows.length === data.records.length && data.next_offset == null && (typeof total !== 'number' || total === rows.length),
  };
}

/** Host-verified snapshots stay in their conversation; no selection is indexed as memory. */
export class SceneService {
  private sessions = new Map<string, SceneSnapshot[]>();
  private runSnapshots = new Map<string, string>();
  private preparedOnly = new Set<string>();
  constructor(private store: Store, private policy: PolicyKernel) {
    policy.onBarrier(() => { this.sessions.clear(); this.runSnapshots.clear(); this.preparedOnly.clear(); });
  }
  private permitted(handle: ScopeHandle, scene: SceneSnapshot) {
    const scope = this.policy.validate(handle);
    return scope.audience === 'self' && this.policy.can(handle, scene.kind === 'map' ? 'map:read' : scene.kind === 'campus' ? 'campus:read' : 'weather:read')
      && scope.sources.includes(scene.source.sourceId);
  }
  all(sessionId: string): SceneSnapshot[] {
    const stored = this.store.messages(sessionId).flatMap(message => message.scenes || []);
    const prepared = this.store.kernel.workData(this.policy.hostScope(), ['help_opportunity'], { sessionId, statuses: ['prepared', 'question_ready', 'notification_queued'], limit: 5 })
      .flatMap(record => (record.data.artifact as { scenes?: SceneSnapshot[] } | undefined)?.scenes || []);
    return [...new Map([...stored, ...prepared, ...(this.sessions.get(sessionId) || [])].map(scene => [`${scene.id}@${scene.revision}`, scene])).values()];
  }
  private canRestore(handle: ScopeHandle, sessionId: string, scene: SceneSnapshot, runId?: string, attached?: SceneRef) {
    const scope = this.policy.validate(handle);
    const key = `${scene.id}@${scene.revision}`, sameRun = !!runId && this.runSnapshots.get(key) === runId;
    const livePreparation = () => scope.sources.includes('work:self') && this.store.kernel.workData(handle, ['help_opportunity'], { sessionId, statuses: ['prepared', 'question_ready', 'notification_queued'], limit: 5 })
      .some(record => (record.data.artifact as unknown as { sceneRefs?: SceneRef[] } | undefined)?.sceneRefs?.some(ref => ref.id === scene.id && ref.revision === scene.revision));
    // A completed background read alone has no right to surface. A withdrawn
    // preparation stays hidden until a fresh decision produces a live artifact.
    if (this.preparedOnly.has(key) && !sameRun && !livePreparation()) return false;
    if (scope.sources.includes('history:self') && this.policy.can(handle, 'evidence:read')) return true;
    if (attached?.id === scene.id && attached.revision === scene.revision) return true;
    if (sameRun) return true;
    return livePreparation();
  }
  available(handle: ScopeHandle, sessionId: string, runId?: string, attached?: SceneRef) {
    const latest = new Map<string, SceneSnapshot>();
    for (const scene of this.all(sessionId)) if (this.permitted(handle, scene) && this.canRestore(handle, sessionId, scene, runId, attached) && (!latest.has(scene.id) || latest.get(scene.id)!.revision < scene.revision)) {
      latest.delete(scene.id); latest.set(scene.id, scene);
    }
    return [...latest.values()];
  }
  get(handle: ScopeHandle, sessionId: string, ref: SceneRef, runId?: string, attached = false) {
    const scene = this.all(sessionId).find(scene => scene.id === ref.id && scene.revision === ref.revision);
    if (!scene || !this.permitted(handle, scene) || !this.canRestore(handle, sessionId, scene, runId, attached ? ref : undefined)) throw new HarnessError('scene_unavailable', '这个画面不在当前对话与资料范围内，请先取得当前结果。');
    return structuredClone(scene);
  }
  remember<T extends SceneSnapshot>(sessionId: string, scene: T, runId?: string, preparationOnly = false): T {
    const items = (this.sessions.get(sessionId) || []).filter(item => item.id !== scene.id || item.revision !== scene.revision);
    for (const retired of [...items, scene].slice(0, -24)) {
      const key = `${retired.id}@${retired.revision}`; this.runSnapshots.delete(key); this.preparedOnly.delete(key);
    }
    this.sessions.set(sessionId, [...items, structuredClone(scene)].slice(-24));
    if (runId) this.runSnapshots.set(`${scene.id}@${scene.revision}`, runId);
    if (preparationOnly) this.preparedOnly.add(`${scene.id}@${scene.revision}`);
    while (this.runSnapshots.size > 256) this.runSnapshots.delete(this.runSnapshots.keys().next().value!);
    while (this.sessions.size > 12) this.forget(this.sessions.keys().next().value!);
    return scene;
  }
  publish(refs: SceneRef[]) { for (const ref of refs) this.preparedOnly.delete(`${ref.id}@${ref.revision}`); }
  forget(sessionId?: string) {
    if (sessionId) {
      for (const scene of this.sessions.get(sessionId) || []) { const key = `${scene.id}@${scene.revision}`; this.runSnapshots.delete(key); this.preparedOnly.delete(key); }
      this.sessions.delete(sessionId);
    } else { this.sessions.clear(); this.runSnapshots.clear(); this.preparedOnly.clear(); }
  }
  browse(sessionId: string, options: { placeId?: string; runId?: string; preparationOnly?: boolean } = {}): MapScene {
    const map = this.store.runtime.connections.map, publicMap = map?.publicView?.() || map, overview = publicMap?.overview();
    if (!publicMap || !overview || overview.version === 'unavailable') throw new HarnessError('map_unavailable', '公共地图尚未装配。');
    const place = options.placeId ? publicMap.point(options.placeId) : undefined;
    if (options.placeId && !place) throw new HarnessError('unknown_place', '这个地点不在当前公共地图中。');
    const now = this.store.kernel.clock.now(), sceneId = randomUUID();
    return this.remember(sessionId, { kind: 'map', id: sceneId, revision: 1, createdAt: now,
      source: { sourceId: 'map:local', fetchedAt: now, version: overview.version, sourceDate: overview.sourceDate, coverage: '公共地图浏览；不含旅程、实时位置或到达判断。' },
      ...(place ? { place, focusPlaceId: place.id } : {}), cameraIntent: place ? 'selection' : 'overview',
      journey: { id: randomUUID(), revision: 0, stops: place ? [{ id: randomUUID(), placeId: place.id, label: place.displayName }] : [], legs: [] },
    }, options.runId, options.preparationOnly);
  }
  map(sessionId: string, routes: MapRouteResult[], options: { previous?: MapScene; stops?: { id?: string; placeId: string; dwellMinutes?: number }[]; runId?: string; preparationOnly?: boolean } = {}): MapScene {
    const previous = options.previous, now = this.store.kernel.clock.now();
    const points = routes.length ? [routes[0].from, ...routes.map(route => route.to)] : [];
    if (points.some(point => !point)) throw new HarnessError('scene_endpoints', '路线还没有完整的稳定起终点，不能建立旅程。');
    const stops = points.map((point, index) => {
      const requested = options.stops?.[index], old = previous?.journey.stops[index];
      return { id: requested?.id || (old?.placeId === point!.id ? old.id : randomUUID()), placeId: point!.id, label: point!.displayName,
        ...(requested?.dwellMinutes !== undefined ? { dwellMinutes: requested.dwellMinutes } : {}) };
    });
    if (new Set(stops.map(stop => stop.id)).size !== stops.length) throw new HarnessError('stop_identity', '每次停靠需要独立身份；同一地点可以停靠多次。');
    const legs = routes.map((route, index) => ({ id: previous?.journey.legs.find(leg => leg.fromStopId === stops[index].id && leg.toStopId === stops[index + 1].id)?.id || randomUUID(), fromStopId: stops[index].id, toStopId: stops[index + 1].id, route: structuredClone(route) }));
    const networkM = routes.reduce((sum, route) => sum + (route.distance?.networkM || 0), 0), estimatedAccessM = routes.reduce((sum, route) => sum + (route.distance?.connectorM || 0), 0);
    const dwellMinutes = stops.reduce((sum, stop) => sum + (stop.dwellMinutes || 0), 0);
    const walkingMinutes = { min: Math.ceil(networkM / 90), max: Math.ceil(networkM / 48) };
    const scene: MapScene = { kind: 'map', id: previous?.id || randomUUID(), revision: (previous?.revision || 0) + 1, createdAt: now,
      source: { sourceId: 'map:local', fetchedAt: now, version: routes[0].source.version, sourceDate: routes[0].source.date, coverage: '现有步行路网；接入估计、条件路段和楼内时间保留各段原始说明。' },
      journey: { id: previous?.journey.id || randomUUID(), revision: (previous?.journey.revision || 0) + 1, stops, legs,
        estimate: { networkM, estimatedAccessM, walkingMinutes, dwellMinutes, totalMinutes: { min: walkingMinutes.min + dwellMinutes, max: walkingMinutes.max + dwellMinutes },
          complete: routes.every(route => ['ready', 'same'].includes(route.status) && !route.distance?.connectorM && !route.originAccess?.conditions?.length && !route.destinationAccess?.conditions?.length && !route.segments?.some(segment => segment.conditions?.length)), basis: '已记录道路按每分钟48–90米作条件估计，加上明确给出的停留时间；接入估计、楼内、门禁、排队和未提供的停留时间另计，不保证抵达时刻。' } }, cameraIntent: 'route', activeLegId: legs[0]?.id };
    return this.remember(sessionId, scene, options.runId, options.preparationOnly);
  }
  weather(sessionId: string, result: { data?: unknown; fetchedAt?: string; expiresAt?: string; coverage?: unknown }, runId?: string, preparationOnly = false): WeatherScene {
    const data = result.data as { location: string; timeZone: string; forecast: Record<string, (string | number | null)[]> };
    if (!data?.forecast || !Array.isArray(data.forecast.time)) throw new HarnessError('weather_snapshot', '天气结果尚未取得，不能生成日期画面。');
    const value = (column: string, index: number) => typeof data.forecast[column]?.[index] === 'number' ? data.forecast[column][index] as number : null;
    const now = this.store.kernel.clock.now();
    const scene: WeatherScene = { kind: 'weather', id: randomUUID(), revision: 1, createdAt: now,
      source: { sourceId: 'weather:open-meteo', fetchedAt: result.fetchedAt || now, expiresAt: result.expiresAt, coverage: result.coverage }, location: data.location, timeZone: data.timeZone,
      days: data.forecast.time.map((date, index) => ({ date: String(date), weatherCode: value('weather_code', index), maxC: value('temperature_2m_max', index), minC: value('temperature_2m_min', index), precipitationProbabilityMax: value('precipitation_probability_max', index) })) };
    return this.remember(sessionId, scene, runId, preparationOnly);
  }
  view(scenes: SceneSnapshot[], layout: 'stack' | 'compare'): PresentationView {
    return { id: randomUUID(), revision: 1, libraryVersion: 1, createdAt: this.store.kernel.clock.now(), sceneRefs: scenes.map(({ id, revision }) => ({ id, revision })), dsl: sceneViewDsl(scenes, layout) };
  }
  campus(sessionId: string, result: Parameters<typeof campusSnapshot>[0], capability: string, input: unknown, runId?: string, preparationOnly = false) {
    const scene = campusSnapshot(result, capability, input, this.store.kernel.clock.now());
    return scene ? this.remember(sessionId, scene, runId, preparationOnly) : undefined;
  }
  selection(handle: ScopeHandle, sessionId: string, raw: SemanticSelection): VerifiedSelection {
    const input = semanticSelectionSchema.parse(raw), scene = this.get(handle, sessionId, { id: input.sceneId, revision: input.sceneRevision }, undefined, true);
    let label: string | undefined;
    let record: CampusRecord | undefined;
    if (input.kind === 'date' && scene.kind === 'weather' && !input.placeId && !input.legId && !input.recordId) label = scene.days.find(day => day.date === input.date)?.date;
    if (input.kind === 'place' && scene.kind === 'map' && !input.date && !input.legId && !input.recordId && input.placeId) {
      const map = this.store.runtime.connections.map, publicMap = map?.publicView?.() || map;
      label = publicMap?.point(input.placeId)?.displayName;
    }
    if (input.kind === 'leg' && scene.kind === 'map' && !input.placeId && !input.date && !input.recordId) {
      const leg = scene.journey.legs.find(leg => leg.id === input.legId);
      if (leg) label = `${scene.journey.stops.find(stop => stop.id === leg.fromStopId)?.label} → ${scene.journey.stops.find(stop => stop.id === leg.toStopId)?.label}`;
    }
    if (input.kind === 'record' && scene.kind === 'campus' && !input.placeId && !input.date && !input.legId) {
      record = scene.records.find(item => item.id === input.recordId);
      label = record?.title;
    }
    if (!label) throw new HarnessError('selection_target', '选择的对象与这份画面不相符，请重新选择。');
    return { ...input, label, source: scene.source, ...(record ? { record: structuredClone(record) } : {}), selectedAt: this.store.kernel.clock.now(), meaning: '用户在当前对话界面明确选中的临时引用/试算；不是当前位置、到达证明、已接受的安排、长期偏好或行动授权。校园记录保留查询时刻，不代表之后没有变化；日期只确定当天，下午的具体起止时间仍以原话和真实日程核对。' };
  }
  summaries(handle: ScopeHandle, sessionId: string, runId?: string, attached?: SceneRef) {
    const available = this.available(handle, sessionId, runId, attached), recent = available.slice(-6);
    const journey = [...available].reverse().find(scene => scene.kind === 'map' && scene.journey.legs.length > 0);
    const selected = journey && !recent.some(scene => scene.id === journey.id) ? [journey, ...recent.slice(-5)] : recent;
    return selected.map(scene => scene.kind === 'map' ? { id: scene.id, revision: scene.revision, kind: scene.kind, source: scene.source,
      ...(scene.place ? { place: { id: scene.place.id, label: scene.place.displayName } } : {}),
      journey: { ...scene.journey, legs: scene.journey.legs.map(({ id, fromStopId, toStopId, route }) => ({ id, fromStopId, toStopId, status: route.status, distance: route.distance, warnings: route.warnings })) } }
      : scene.kind === 'campus' ? { ...scene, records: scene.records.slice(0, 8), sceneRecordCount: scene.records.length, summaryOmittedRecords: Math.max(0, scene.records.length - 8) }
      : { ...scene });
  }
}
