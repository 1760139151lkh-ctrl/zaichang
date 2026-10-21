import { createHash, randomUUID } from 'node:crypto';
import type { Store } from '../store';
import type { PolicyKernel } from './policy';
import { HarnessError, type ScopeHandle } from '../../shared/harness';
import type { MapRouteResult } from '../../shared/map-v2';
import { campusDisplayInputSchema, planningContinuationSchema, sceneViewDsl, semanticSelectionSchema, type CampusRecord, type CampusScene, type EnvironmentSample, type MapScene, type PlanningBlock, type PlanningScene, type PresentationView, type SceneRef, type SceneSnapshot, type SemanticSelection, type VerifiedSelection, type WeatherScene } from '../../shared/scenes';
import { environmentSnapshot, planningSnapshot } from './scene-projections';
import { agendaSnapshot } from './agenda-scene';
import { canonical } from './semantics';
import { DiscussionSceneProjector, type DiscussionAdmission, type DiscussionModuleVerifier, type DiscussionSnapshotVerifier, type DiscussionProjectionInput } from './discussion-scene';
import type { DiscussionScene, DiscussionSnapshotMetadata } from '../../shared/discussion-scene';
import { assertPlanningComparisonSceneReadable, resolvePlanningComparisonSelection, resolvePlanningTrial } from './planning-comparison-scene';
import { assertCuriositySceneReadable } from './curiosity-scene';
import { assertRehearsalSnapshotReadable } from './rehearsal-presentation';
import { rehearsalHistoryReference } from '../../shared/relationship-rehearsal';
import { noteHistoryReference } from '../../shared/note-presentation';
import { mapStorySettingSchema } from '../../shared/story-setting';
import { campusAcademicReference, type CampusAcademicReference } from '../../shared/campus-academic';
import { campusAcademicSnapshot, isAcademicCampus } from './campus-academic';
import { campusSceneModelSummary } from './campus-model-view';

/** A strict projection of the installed connector's named fields. No prose parsing,
 * guessed course matches, aggregate rows, or model-authored facts enter a scene. */
export function campusSnapshot(result: { status: string; sourceId: string; data?: unknown; fetchedAt?: string; expiresAt?: string; coverage?: { complete?: boolean } }, capability: string, input: unknown, now: string): CampusScene | undefined {
  const academic = campusAcademicSnapshot(result, capability, input, now);
  if (academic) return academic;
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
  const rowTerms = [...new Set(rows.flatMap(row => row.term ? [row.term] : []))];
  const term = rowTerms.length === 1 ? rowTerms[0] : rowTerms.length > 1 ? undefined
    : text(data.termId === 'unspecified' ? undefined : data.termId || data.semester_id, 80);
  const nextOffset = data.next_offset ?? data.nextOffset;
  const sourceOffset = Number.isSafeInteger(data.offset) && data.offset >= 0 ? data.offset
    : query && Number.isSafeInteger(request?.spec?.offset) ? request?.spec?.offset : Number.isSafeInteger(request?.offset) ? request?.offset : 0;
  const continuation = Number.isSafeInteger(nextOffset) && nextOffset >= 0 && request
    ? { capability: (query ? 'campus.query' : 'campus.lookup') as 'campus.query' | 'campus.lookup',
      arguments: query && request.spec ? { ...request, spec: { ...request.spec, offset: nextOffset }, offset: nextOffset, refresh: false }
        : { ...request, offset: nextOffset, refresh: false } } : undefined;
  return { kind: 'campus', id: randomUUID(), revision: 1, createdAt: now, domain,
    source: { sourceId: result.sourceId, fetchedAt, expiresAt: result.expiresAt,
      version: createHash('sha256').update(JSON.stringify({ sourceId: result.sourceId, fetchedAt, data })).digest('hex'), coverage: result.coverage },
    sourceLabel: imported ? text(data.source, 200) || '导入的校园资料' : '浙江大学校园资料',
    origin: imported ? 'legacy_import' : 'zju_account', ...(term ? { term } : {}), records: rows,
    resultStatus: result.status as 'fresh' | 'partial' | 'stale',
    ...((data.sourceCoverage || data.coverage) ? { sourceCoverage: structuredClone(data.sourceCoverage || data.coverage) } : {}),
    ...(account && request ? { nativeRead: { capability: (query ? 'campus.query' : 'campus.lookup') as 'campus.query' | 'campus.lookup', arguments: structuredClone(request),
      ...(data.snapshotProof ? { snapshotProof: structuredClone(data.snapshotProof) } : {}) } } : {}),
    ...(account ? { nativePage: { offset: sourceOffset, returned: data.records.length } } : {}),
    ...(continuation ? { continuation } : {}),
    ...(typeof total === 'number' && Number.isInteger(total) && total >= rows.length ? { total } : {}),
    complete: result.coverage?.complete === true && rows.length === data.records.length && nextOffset == null && (typeof total !== 'number' || total === rows.length),
  };
}

/** Host-verified snapshots stay in their conversation; no selection is indexed as memory. */
export class SceneService {
  private sessions = new Map<string, SceneSnapshot[]>();
  private runSnapshots = new Map<string, string>();
  private preparedOnly = new Set<string>();
  private readonly discussions: DiscussionSceneProjector;
  private academicScopes = new Map<string, { handle: ScopeHandle; runId?: string }>();
  private academicAdoptions = new Map<string, Set<string>>();
  academicScopeAuthorized?: (handle: ScopeHandle, grant: string) => boolean;
  academicSnapshotCurrent?: (proof: unknown) => boolean;
  constructor(private store: Store, private policy: PolicyKernel, discussionModules?: DiscussionModuleVerifier,
    discussionSnapshots?: DiscussionSnapshotVerifier) {
    this.discussions = new DiscussionSceneProjector(store.kernel, policy, discussionModules, discussionSnapshots);
    policy.onBarrier(() => { this.sessions.clear(); this.runSnapshots.clear(); this.preparedOnly.clear(); this.academicScopes.clear(); this.academicAdoptions.clear(); });
  }
  private academicReadable(handle: ScopeHandle, scene: CampusScene | CampusAcademicReference, runId?: string, localDisplay = false) {
    const scope = this.policy.validate(handle), expected = scene.domain === 'grades' ? 'campus:grades:read' : 'campus:gpa:read';
    const marker = scene.sensitiveRead;
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !this.policy.can(handle, 'campus:read') || !scope.sources.includes(scene.source.sourceId) || this.policy.revoked().includes(expected)
      || !marker || marker.grant !== expected || marker.sourceVersion !== scene.source.version) return false;
    if (localDisplay || scene.kind === 'campus_reference') return true;
    if (this.academicScopeAuthorized?.(handle, expected) && this.academicAdoptions.get(handle.id)?.has(`${scene.id}@${scene.revision}`)) return true;
    const approved = this.academicScopes.get(`${scene.id}@${scene.revision}`);
    if (!approved || !runId || approved.runId !== runId) return false;
    try { return this.policy.can(approved.handle, expected) && this.academicScopeAuthorized?.(approved.handle, expected) === true; }
    catch (error) { if (error instanceof HarnessError) return false; throw error; }
  }
  private permitted(handle: ScopeHandle, scene: SceneSnapshot, runId?: string, localDisplay = false) {
    const scope = this.policy.validate(handle);
    if (scene.kind === 'campus_reference') return this.academicReadable(handle, scene, runId, localDisplay);
    if (scene.kind === 'campus' && isAcademicCampus(scene) && !this.academicReadable(handle, scene, runId, localDisplay)) return false;
    // Teaching bodies need the original asynchronous material/owner read.
    // A synchronous scene lookup never revives a cached answer.
    if (scene.kind === 'study') return false;
    if (scene.kind === 'note') return this.store.runtime.notePresentation.snapshotReadable(handle, scene);
    if (scene.kind === 'note_reference') return scope.audience === 'self' && scope.subjectId === scope.principalId
      && scope.worldId === 'real' && scope.sources.includes('notes:self') && this.policy.can(handle, 'evidence:read');
    if (scene.kind === 'rehearsal_reference') return scope.audience === 'self' && scope.subjectId === scope.principalId
      && scope.worldId === 'real' && scope.sources.includes('work:self') && this.policy.can(handle, 'evidence:read');
    if (scene.kind === 'rehearsal') {
      try { assertRehearsalSnapshotReadable({ repo: this.store.kernel, policy: this.policy }, handle, scene); return true; }
      catch (error) { if (error instanceof HarnessError || error instanceof Error && error.name === 'ZodError') return false; throw error; }
    }
    if (scene.kind === 'curiosity_reference') return scope.audience === 'self' && scope.subjectId === scope.principalId
      && scope.worldId === 'real' && scope.sources.includes('work:self') && this.policy.can(handle, 'evidence:read');
    if (scene.kind === 'curiosity') {
      try { assertCuriositySceneReadable({ repo: this.store.kernel, policy: this.policy, curiosityInvitations: this.store.runtime.curiosityInvitations }, handle, scene); return true; }
      catch (error) { if (error instanceof HarnessError || error instanceof Error && error.name === 'ZodError') return false; throw error; }
    }
    if (scene.kind === 'study_reference') return scope.audience === 'self' && scope.subjectId === scope.principalId
      && scope.worldId === 'real' && scope.sources.includes('work:self') && this.policy.can(handle, 'evidence:read');
    const allowed = scope.audience === 'self' && this.policy.can(handle, scene.kind === 'map' ? 'map:read' : scene.kind === 'campus' ? 'campus:read' : scene.kind === 'planning' || scene.kind === 'discussion' ? 'evidence:read' : 'weather:read')
      && scope.sources.includes(scene.source.sourceId)
      && (scene.kind !== 'planning' || scene.requiredSourceIds.every(sourceId => scope.sources.includes(sourceId)
        && (!sourceId.startsWith('campus:') || this.policy.can(handle, 'campus:read'))
        && (!sourceId.startsWith('weather:') || this.policy.can(handle, 'weather:read'))
        && (!sourceId.startsWith('map:') || this.policy.can(handle, 'map:read'))));
    if (!allowed) return false;
    if (scene.kind === 'map' && scene.storySetting) {
      const setting = mapStorySettingSchema.safeParse(scene.storySetting);
      if (!setting.success || !scope.sources.includes('work:self') || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
        || !this.store.kernel.workBindingsReadable(handle, [setting.data.sourceBinding])
        || !this.store.kernel.assistantWorkSourcesReadable(handle, setting.data.assistantWorkSources || [])) return false;
    }
    if (scene.kind === 'planning') {
      try { assertPlanningComparisonSceneReadable({ repo: this.store.kernel, policy: this.policy }, handle, scene); }
      catch (error) { if (error instanceof HarnessError) return false; throw error; }
    }
    if (scene.kind === 'discussion') {
      try { this.discussions.snapshot(handle, scene.sessionId, scene); return true; }
      catch (error) {
        if (error instanceof HarnessError || error instanceof Error && error.name === 'ZodError') return false;
        throw error;
      }
    }
    if (scene.kind !== 'planning' || scene.continuation === undefined) return true;
    const parsed = planningContinuationSchema.safeParse(scene.continuation);
    if (!parsed.success) return false;
    const continuation = parsed.data;
    try {
      const record = this.store.kernel.workData(handle, ['planning_intent'], { id: continuation.intentId, revision: continuation.intentRevision, limit: 1 })[0];
      if (!record || record.kind !== 'plan' || record.status !== 'active' || !record.sourceBinding
        || canonical(record.sourceBinding) !== canonical(continuation.sourceBinding)) return false;
      const binding = this.store.kernel.resolveWorkSourceBinding(handle, continuation.sourceBinding.refs);
      if (canonical(binding) !== canonical(continuation.sourceBinding)
        || new Set(continuation.attemptBasis.map(attempt => attempt.planId)).size !== continuation.attemptBasis.length
        || continuation.attemptBasis.some(attempt => attempt.intentId !== continuation.intentId)) return false;
      this.store.runtime.planningIntents.assertAttemptBasis(handle, continuation.intentId, continuation.attemptBasis);
      return true;
    } catch (error) {
      if (error instanceof HarnessError || error instanceof SyntaxError) return false;
      throw error;
    }
  }
  snapshotReadable(handle: ScopeHandle, scene: SceneSnapshot) { return this.permitted(handle, scene, undefined, true); }
  discussionMetadataReadable(handle: ScopeHandle, metadata: DiscussionSnapshotMetadata, permits?: DiscussionAdmission['permits']) {
    try { this.discussions.snapshotMetadata(handle, metadata, { permits }); return true; }
    catch (error) { if (error instanceof HarnessError || error instanceof SyntaxError || error instanceof Error && error.name === 'ZodError') return false; throw error; }
  }
  discussionSnapshot(handle: ScopeHandle, scene: DiscussionScene, permits?: DiscussionAdmission['permits']) {
    const snapshot = this.discussions.snapshot(handle, scene.sessionId, scene, { permits });
    if (!snapshot.coWork.length) return snapshot;
    const scope = this.policy.validate(handle);
    if (!scope.sources.includes('history:self') || snapshot.coWork.some(projection => !projection.snapshotProof)) return snapshot;
    const rows = this.store.db.prepare(`SELECT m.id,json_extract(s.value,'$.provenance.sourceBinding') AS binding FROM messages m,
      json_each(m.payload,'$.scenes') s WHERE m.session_id=? AND m.role='assistant' AND json_extract(m.payload,'$.status')='done'
      AND json_extract(s.value,'$.kind')='discussion' AND json_extract(s.value,'$.id')=? AND json_extract(s.value,'$.revision')=?
      AND EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id
        AND e.owner=? AND e.workspace=? AND e.subject=? AND e.world='real' AND e.status!='deleted')
      AND NOT EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id AND (e.owner!=? OR e.workspace!=?))
      ORDER BY m.created_at DESC,m.rowid DESC LIMIT 20`).all(scene.sessionId, scene.id, scene.revision,
        scope.principalId, scope.workspaceId, scope.principalId, scope.principalId, scope.workspaceId);
    const original = rows.find(row => !this.store.kernel.hasFence(String(row.id))
      && canonical(JSON.parse(String(row.binding))) === canonical(scene.provenance.sourceBinding));
    return original ? { ...snapshot, coWork: snapshot.coWork.map(projection => ({ ...projection,
      historySource: { messageId: String(original.id), sceneId: scene.id, sceneRevision: scene.revision } })) } : snapshot;
  }
  all(sessionId: string): SceneSnapshot[] {
    const stored = this.store.messages(sessionId).flatMap(message => message.scenes || []);
    const prepared = this.store.kernel.workData(this.policy.hostScope(), ['help_opportunity'], { sessionId, statuses: ['prepared', 'question_ready', 'notification_queued'], limit: 5 })
      .flatMap(record => (record.data.artifact as { scenes?: SceneSnapshot[] } | undefined)?.scenes || []);
    return [...new Map([...stored, ...prepared, ...(this.sessions.get(sessionId) || [])].map(scene => [`${scene.id}@${scene.revision}`, scene])).values()];
  }
  private canRestore(handle: ScopeHandle, sessionId: string, scene: SceneSnapshot, runId?: string, attached?: SceneRef) {
    if (['discussion', 'curiosity', 'curiosity_reference', 'rehearsal', 'rehearsal_reference', 'note', 'note_reference'].includes(scene.kind) && 'sessionId' in scene && scene.sessionId !== sessionId) return false;
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
    for (const scene of this.all(sessionId)) if (this.permitted(handle, scene, runId) && this.canRestore(handle, sessionId, scene, runId, attached) && (!latest.has(scene.id) || latest.get(scene.id)!.revision < scene.revision)) {
      latest.delete(scene.id); latest.set(scene.id, scene.kind === 'discussion' ? this.discussionSnapshot(handle, scene) : scene);
    }
    return [...latest.values()];
  }
  get(handle: ScopeHandle, sessionId: string, ref: SceneRef, runId?: string, attached = false) {
    const scene = this.all(sessionId).find(scene => scene.id === ref.id && scene.revision === ref.revision);
    if (!scene || !this.permitted(handle, scene, runId) || !this.canRestore(handle, sessionId, scene, runId, attached ? ref : undefined)) throw new HarnessError('scene_unavailable', '这个画面不在当前对话与资料范围内，请先取得当前结果。');
    if (scene.kind === 'rehearsal' || scene.kind === 'rehearsal_reference')
      throw new HarnessError('rehearsal_current_read', '先沿read_relationship_rehearsal或present_view.rehearsal回读原排练，再展开眼前这一轮。');
    if (scene.kind === 'note' || scene.kind === 'note_reference')
      throw new HarnessError('note_current_read', '先沿manage_note read真正读到原页，再用present_view.note展开，不恢复缓存正文。');
    return scene.kind === 'discussion' ? this.discussionSnapshot(handle, scene) : structuredClone(scene);
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
  browse(sessionId: string, options: { placeId?: string; runId?: string; preparationOnly?: boolean; stageOnly?: boolean } = {}): MapScene {
    const map = this.store.runtime.connections.map, publicMap = map?.publicView?.() || map, overview = publicMap?.overview();
    if (!publicMap || !overview || overview.version === 'unavailable') throw new HarnessError('map_unavailable', '公共地图尚未装配。');
    const place = options.placeId ? publicMap.point(options.placeId) : undefined;
    if (options.placeId && !place) throw new HarnessError('unknown_place', '这个地点不在当前公共地图中。');
    const now = this.store.kernel.clock.now(), sceneId = randomUUID();
    const scene: MapScene = { kind: 'map', id: sceneId, revision: 1, createdAt: now,
      source: { sourceId: 'map:local', fetchedAt: now, version: overview.version, sourceDate: overview.sourceDate, coverage: '公共地图浏览；不含旅程、实时位置或到达判断。' },
      ...(place ? { place, focusPlaceId: place.id } : {}), cameraIntent: place ? 'selection' : 'overview',
      journey: { id: randomUUID(), revision: 0, stops: place ? [{ id: randomUUID(), placeId: place.id, label: place.displayName }] : [], legs: [] },
    };
    return options.stageOnly ? scene : this.remember(sessionId, scene, options.runId, options.preparationOnly);
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
  view(scenes: SceneSnapshot[], layout: 'stack' | 'compare', comparison?: PresentationView['comparison']): PresentationView {
    return { id: randomUUID(), revision: 1, libraryVersion: 1, createdAt: this.store.kernel.clock.now(), sceneRefs: scenes.map(({ id, revision }) => ({ id, revision })), dsl: sceneViewDsl(scenes, layout), ...(comparison ? { comparison } : {}) };
  }
  campus(sessionId: string, result: Parameters<typeof campusSnapshot>[0], capability: string, input: unknown, runId?: string, preparationOnly = false,
    readScope?: ScopeHandle, stageOnly = false) {
    const scene = campusSnapshot(result, capability, input, this.store.kernel.clock.now());
    if (scene && isAcademicCampus(scene)) {
      if (!readScope || !scene.source.version) throw new HarnessError('campus_purpose_required', '成绩画面须来自本次获准的真实读取。');
      const scope = this.policy.validate(readScope), grant = scene.domain === 'grades' ? 'campus:grades:read' : 'campus:gpa:read';
      if (!this.academicScopeAuthorized?.(readScope, grant)) throw new HarnessError('campus_purpose_required', '这次成绩用途尚未核清。');
      scene.academicSessionId = sessionId;
      scene.sensitiveRead = { grant, resource: scene.domain, sourceVersion: scene.source.version,
        privacyEpoch: scope.privacyEpoch, policyRevision: scope.policyRevision };
      this.academicScopes.set(`${scene.id}@${scene.revision}`, { handle: readScope, runId });
      this.academicAdoptions.set(readScope.id, new Set([...(this.academicAdoptions.get(readScope.id) || []), `${scene.id}@${scene.revision}`]));
      while (this.academicScopes.size > 128) this.academicScopes.delete(this.academicScopes.keys().next().value!);
    }
    if (stageOnly) return scene;
    return scene ? this.remember(sessionId, preparationOnly && isAcademicCampus(scene) ? campusAcademicReference(scene) : scene, runId, preparationOnly) : undefined;
  }
  ordinaryCampusSelectionIdentity(handle: ScopeHandle, sessionId: string, input: SemanticSelection) {
    if (input.kind !== 'record' || !input.recordId || input.campusScale) return;
    const scene = this.all(sessionId).find(scene => scene.id === input.sceneId && scene.revision === input.sceneRevision);
    if (!scene || scene.kind !== 'campus' || scene.modelBodyDelivered !== false || !scene.nativeRead
      || !['courses', 'schedule', 'exams'].includes(scene.domain) || !this.permitted(handle, scene)
      || !this.canRestore(handle, sessionId, scene, undefined, { id: scene.id, revision: scene.revision })) return;
    const messages = this.store.messages(sessionId).filter(message => message.scenes?.some(item => item.id === scene.id && item.revision === scene.revision));
    if (messages.length && !messages.some(message => !this.store.kernel.hasFence(message.id)
      && this.store.runtime.presentation.sourceCurrentMessage(message).scenes?.some(item => item.id === scene.id && item.revision === scene.revision))) return;
    const row = scene.records.find(record => record.id === input.recordId);
    if (!row) return;
    return { selection: input, resource: (scene.domain === 'schedule' ? 'classes' : scene.domain) as 'classes' | 'courses' | 'exams',
      sourceKey: row.sourceRecordId || row.id, sourceVersion: scene.source.version, scopeOnly: true as const };
  }
  ordinaryCampusSelectedSource(handle: ScopeHandle, sessionId: string, input: SemanticSelection) {
    const identity = this.ordinaryCampusSelectionIdentity(handle, sessionId, input);
    if (!identity) return;
    const scene = this.all(sessionId).find(scene => scene.id === input.sceneId && scene.revision === input.sceneRevision) as CampusScene;
    return { ...identity, owner: scene.nativeRead!, snapshotCurrent: !!scene.nativeRead?.snapshotProof
      && this.academicSnapshotCurrent?.(scene.nativeRead.snapshotProof) === true,
      select: () => this.selection(handle, sessionId, input), scene };
  }
  academicReference(handle: ScopeHandle, sessionId: string, ref: SceneRef): CampusAcademicReference {
    const scene = this.all(sessionId).find(scene => scene.id === ref.id && scene.revision === ref.revision);
    const reference = scene?.kind === 'campus_reference' ? scene : scene?.kind === 'campus' && isAcademicCampus(scene) ? campusAcademicReference(scene) : undefined;
    if (!reference || reference.sessionId !== sessionId || !this.academicReadable(handle, reference, undefined, true))
      throw new HarnessError('campus_reference_unavailable', '这份成绩资料地址不在当前自己的对话范围。');
    const messages = this.store.messages(sessionId).filter(message => message.scenes?.some(scene => scene.id === ref.id && scene.revision === ref.revision));
    if (messages.length && !messages.some(message => !this.store.kernel.hasFence(message.id)
      && this.store.runtime.presentation.sourceCurrentMessage(message).scenes?.some(scene => scene.id === ref.id && scene.revision === ref.revision)))
      throw new HarnessError('campus_reference_changed', '原成绩回复的请求或来源已停止使用，不能从旧地址重新展开。');
    return reference;
  }
  academicSelectionIdentity(handle: ScopeHandle, sessionId: string, input: SemanticSelection) {
    if (input.kind !== 'record' || !input.recordId) return;
    const scene = this.all(sessionId).find(scene => scene.id === input.sceneId && scene.revision === input.sceneRevision);
    if (!scene || scene.kind !== 'campus' || !isAcademicCampus(scene) || !this.academicReadable(handle, scene, undefined, true)) return;
    const row = scene.records.find(record => record.id === input.recordId);
    if (!row) return;
    return { selection: input, resource: scene.domain as CampusAcademicReference['domain'],
      sourceKey: row.sourceRecordId || row.id, sourceVersion: scene.source.version,
      grant: scene.domain === 'grades' ? 'campus:grades:read' as const : 'campus:gpa:read' as const,
      scopeOnly: true as const };
  }
  academicDisplay(handle: ScopeHandle, scene: CampusScene, raw: unknown, runId: string): CampusScene {
    const input = campusDisplayInputSchema.parse(raw);
    if (!isAcademicCampus(scene) || input.sceneId !== scene.id || !this.academicReadable(handle, scene, runId))
      throw new HarnessError('campus_display_source', '先取得这份成绩资料的真实本轮画面，再选择怎么展开。');
    let scoped = scene;
    if (input.semesterId) {
      if (!['grades', 'gpa_semesters'].includes(scene.domain) || !scene.academicRead)
        throw new HarnessError('campus_semester_scope', '学期筛选只接原成绩或分学期GPA；累计范围和总GPA政策不能改称该学期结果。');
      const records = scene.records.filter(row => row.term === input.semesterId);
      if (!records.length) throw new HarnessError('campus_semester_unavailable', '这页实际结果没有该学期记录，先回原校园来源精确读取；没有拿别的学期补齐。');
      const owner = structuredClone(scene.academicRead), original = owner.arguments;
      if (owner.capability === 'campus.lookup') {
        const filter = `semester_id:eq:${input.semesterId}`, filters = Array.isArray(original.filters) ? original.filters : [];
        if (!filters.includes(filter) && filters.length >= 6)
          throw new HarnessError('campus_semester_filter_limit', '原查询已有六项条件，请用campus.query的AND筛选保留全部条件后读取该学期。');
        owner.arguments = { ...original, offset: 0, filters: [...new Set([...filters, filter])], refresh: false };
      } else {
        const spec = original.spec && typeof original.spec === 'object' && !Array.isArray(original.spec)
          ? original.spec as Record<string, unknown> : {};
        const condition = { field: 'semester_id', op: 'eq', value: input.semesterId };
        owner.arguments = { ...original, operation: 'select', offset: 0, refresh: false,
          spec: { ...spec, resource: scene.domain, offset: 0, limit: spec.limit || original.limit || 50,
            ...(spec.fields || !original.fields ? {} : { fields: original.fields }),
            where: spec.where ? { and: [spec.where, condition] } : condition } };
      }
      scoped = { ...scene, records, term: input.semesterId, total: scene.complete ? records.length : undefined,
        complete: scene.complete, academicRead: owner, continuation: undefined };
    }
    const scale = input.scale || scoped.academicDisplay?.scale || 'fivePoint';
    const hasScale = scoped.records.some(row => row.gpa ? Object.hasOwn(row.gpa.values, scale) : row.grade && Object.hasOwn(row.grade, scale));
    if (!hasScale) throw new HarnessError('campus_scale_unavailable', '这次原资料没有返回该制式，先回原来源读取，不从别的数字换算。');
    if (input.mode === 'trend' && (!['gpa_semesters', 'gpa_cumulative'].includes(scoped.domain)
      || scoped.records.filter(row => /^\d{4}-\d{4}-[12]$/.test(row.term || row.gpa?.throughTerm || '') && typeof row.gpa?.values[scale] === 'number').length < 2))
      throw new HarnessError('campus_trend_unavailable', '趋势需要至少两个真实学期、同一制式和原GPA口径；这份结果先用明细或表格，不按课程分数编出学期趋势。');
    const updated: CampusScene = { ...scoped, revision: scene.revision + 1,
      academicDisplay: { mode: input.mode, scale, ...(input.semesterId || scoped.academicDisplay?.semesterId
        ? { semesterId: input.semesterId || scoped.academicDisplay?.semesterId } : {}) } };
    const prior = this.academicScopes.get(`${scene.id}@${scene.revision}`);
    if (prior) {
      this.academicScopes.set(`${updated.id}@${updated.revision}`, prior);
      this.academicAdoptions.set(prior.handle.id, new Set([...(this.academicAdoptions.get(prior.handle.id) || []), `${updated.id}@${updated.revision}`]));
    }
    return updated;
  }
  academicCachedSelection(handle: ScopeHandle, sessionId: string, input: SemanticSelection) {
    const identity = this.academicSelectionIdentity(handle, sessionId, input);
    if (!identity || this.academicScopeAuthorized?.(handle, identity.grant) !== true) return;
    const scene = this.all(sessionId).find(scene => scene.id === input.sceneId && scene.revision === input.sceneRevision);
    if (!scene || scene.kind !== 'campus' || !scene.academicSnapshotProof || this.academicSnapshotCurrent?.(scene.academicSnapshotProof) !== true) return;
    this.academicAdoptions.set(handle.id, new Set([...(this.academicAdoptions.get(handle.id) || []), `${scene.id}@${scene.revision}`]));
    return { selection: this.selection(handle, sessionId, input), scene };
  }
  planning(sessionId: string, result: Parameters<typeof planningSnapshot>[0], capability: string, input: unknown, runId?: string, preparationOnly = false) {
    const scene = planningSnapshot(result, capability, input, this.store.kernel.clock.now());
    return scene ? this.remember(sessionId, scene, runId, preparationOnly) : undefined;
  }
  agenda(sessionId: string, result: Parameters<typeof agendaSnapshot>[0], input: unknown, runId?: string, preparationOnly = false) {
    const scene = agendaSnapshot(result, input, this.store.kernel.clock.now());
    if (!scene) return;
    const queryKey = (value: PlanningScene) => canonical({ sourceId: value.source.sourceId,
      from: new Date(value.window.from).toISOString(), to: new Date(value.window.to).toISOString(),
      timeZone: value.window.timeZone, titleQuery: value.agendaRead?.titleQuery || null });
    const key = queryKey(scene);
    // Re-reading one calendar query updates its picture in this response. The
    // Harness already replaces a presented view by this real scene identity.
    // Other windows/filters and earlier conversations keep their own snapshots.
    const previous = runId ? [...(this.sessions.get(sessionId) || [])].reverse().find((candidate): candidate is PlanningScene =>
      candidate.kind === 'planning' && candidate.mode === 'agenda'
      && this.runSnapshots.get(`${candidate.id}@${candidate.revision}`) === runId && queryKey(candidate) === key) : undefined;
    if (previous) {
      if (previous.source.version === scene.source.version) return structuredClone(previous);
      scene.id = previous.id;
      scene.revision = previous.revision + 1;
    }
    return this.remember(sessionId, scene, runId, preparationOnly);
  }
  environment(sessionId: string, result: Parameters<typeof environmentSnapshot>[0], capability: string, runId?: string, preparationOnly = false) {
    const scene = environmentSnapshot(result, capability, this.store.kernel.clock.now());
    return scene ? this.remember(sessionId, scene, runId, preparationOnly) : undefined;
  }
  discussion(handle: ScopeHandle, sessionId: string,
    input: Omit<DiscussionProjectionInput, 'previous'> & { previous?: SceneRef },
    options: { runId?: string; preparationOnly?: boolean; admission?: DiscussionAdmission; stageOnly?: boolean } = {}): DiscussionScene {
    const snapshots = this.all(sessionId).filter((scene): scene is DiscussionScene => scene.kind === 'discussion'
      && scene.sessionId === sessionId && scene.matter.id === input.matterId
      && this.canRestore(handle, sessionId, scene, options.runId));
    const previous = input.previous ? snapshots.find(scene => scene.id === input.previous!.id && scene.revision === input.previous!.revision)
      : snapshots.reduce<DiscussionScene | undefined>((latest, scene) => !latest || scene.matter.revision > latest.matter.revision
        || scene.matter.revision === latest.matter.revision && Date.parse(scene.createdAt) > Date.parse(latest.createdAt) ? scene : latest, undefined);
    if (input.previous && !previous) throw new HarnessError('discussion_previous', '那页商量暂时不能接到当前对话，先打开现在的内容。');
    const scene = this.discussions.project(handle, sessionId, { ...input, previous }, options.admission);
    return options.stageOnly ? scene : this.remember(sessionId, scene, options.runId, options.preparationOnly);
  }
  selection(handle: ScopeHandle, sessionId: string, raw: SemanticSelection): VerifiedSelection {
    const input = semanticSelectionSchema.parse(raw), scene = this.get(handle, sessionId, { id: input.sceneId, revision: input.sceneRevision }, undefined, true);
    let label: string | undefined;
    let record: CampusRecord | undefined;
    let timeBlock: PlanningBlock | undefined;
    let planningTrialObservation: VerifiedSelection['planningTrialObservation'];
    let storySetting: VerifiedSelection['storySetting'];
    let environmentSample: EnvironmentSample | undefined;
    let discussion: ReturnType<DiscussionSceneProjector['verifyFocus']> | undefined;
    const targets = [input.placeId, input.date, input.legId, input.recordId, input.blockId, input.sampleId, input.pointId, input.optionId].filter(value => value !== undefined);
    if (targets.length !== 1) throw new HarnessError('selection_target', '选择的对象与这份画面不相符；每次引用只选择一个对象。');
    if (input.planningTrial && (input.kind !== 'time_block' || scene.kind !== 'planning'))
      throw new HarnessError('selection_target', '试放条件只接在这幅安排里明确选中的完整时间段上。');
    if (input.campusScale && (input.kind !== 'record' || scene.kind !== 'campus' || !isAcademicCampus(scene)))
      throw new HarnessError('selection_target', '绩点制式只用于当前成绩资料中选中的记录。');
    if (input.kind === 'date' && scene.kind === 'weather') label = scene.days.find(day => day.date === input.date)?.date;
    if (input.kind === 'place' && scene.kind === 'map' && input.placeId) {
      const map = this.store.runtime.connections.map, publicMap = map?.publicView?.() || map;
      label = publicMap?.point(input.placeId)?.displayName;
    }
    if (input.kind === 'leg' && scene.kind === 'map') {
      const leg = scene.journey.legs.find(leg => leg.id === input.legId);
      if (leg) label = `${scene.journey.stops.find(stop => stop.id === leg.fromStopId)?.label} → ${scene.journey.stops.find(stop => stop.id === leg.toStopId)?.label}`;
    }
    if (input.kind === 'record' && scene.kind === 'campus') {
      record = scene.records.find(item => item.id === input.recordId);
      label = record?.title;
      if (input.campusScale && (!isAcademicCampus(scene) || !record
        || !(record.gpa ? Object.hasOwn(record.gpa.values, input.campusScale) : record.grade && Object.hasOwn(record.grade, input.campusScale))))
        throw new HarnessError('selection_target', '这条校园记录没有提供所选绩点制式，未用其他数字换算代替。');
    }
    if (input.kind === 'time_block' && scene.kind === 'planning') {
      timeBlock = scene.blocks.find(block => block.id === input.blockId);
      label = timeBlock ? `${timeBlock.label}（${timeBlock.start} 至 ${timeBlock.end || '结束时间未知'}）` : undefined;
      if (timeBlock && input.planningTrial) {
        const trial = resolvePlanningTrial({ repo: this.store.kernel, policy: this.policy }, handle, scene, timeBlock.id, input.planningTrial);
        planningTrialObservation = trial.observation; discussion = trial.discussion; label = trial.label;
      }
    }
    if (input.kind === 'environment_sample' && scene.kind === 'environment') {
      environmentSample = scene.samples.find(sample => sample.id === input.sampleId);
      label = environmentSample ? `${scene.location} · ${environmentSample.at} 的${scene.domain === 'weather' ? '天气' : '空气'}预报` : undefined;
    }
    if (scene.kind === 'discussion' && (input.kind === 'discussion_point' && input.pointId || input.kind === 'discussion_option' && input.optionId)) {
      discussion = this.discussions.verifyFocus(handle, sessionId, scene, input.kind === 'discussion_point'
        ? { kind: 'discussion_point', pointId: input.pointId! } : { kind: 'discussion_option', optionId: input.optionId! });
      label = discussion.label;
    }
    if (scene.kind === 'planning' && input.kind === 'discussion_option' && input.optionId) {
      discussion = resolvePlanningComparisonSelection({ repo: this.store.kernel, policy: this.policy }, handle, scene, input.optionId);
      label = discussion.label;
    }
    if (label && scene.kind === 'map' && scene.storySetting && (input.kind === 'place' || input.kind === 'leg')) {
      const manifest = this.store.runtime.connections.map?.publicView().overview();
      if (manifest?.version !== scene.storySetting.mapVersion)
        throw new HarnessError('selection_target', '取景所用地图已有变化，先重新打开公共地点。');
      try { this.store.runtime.curiosityInvitations.referenceIdentity(handle, scene.storySetting.work, { sessionId, allowCrossSession: false }); }
      catch (error) {
        if (!(error instanceof HarnessError)) throw error;
        throw new HarnessError('selection_target', '这张取景图指的作品已有后续，先接现在的作品再选地点。');
      }
      storySetting = { work: scene.storySetting.work, ...(input.placeId ? { placeId: input.placeId } : { legId: input.legId }), mapVersion: manifest.version,
        meaning: '共同作品在公共地图上的临时取景焦点。地点或道路本身来自公共地图，下一句可据此改写场景；不证明本人到达、GPS、现场事件或真实出行，不自动修改原作品。' };
    }
    if (!label) throw new HarnessError('selection_target', '选择的对象与这份画面不相符，请重新选择。');
    const { planningTrial: _rawTrial, ...reference } = input;
    return { ...reference, label, source: scene.source, ...(record ? { record: structuredClone(record) } : {}),
      ...(scene.kind === 'campus' ? { campusContext: { domain: scene.domain, ...(scene.term ? { term: scene.term } : {}), complete: scene.complete,
        origin: scene.origin, display: scene.academicDisplay ? { ...scene.academicDisplay, scale: input.campusScale || scene.academicDisplay.scale } : undefined,
        observationAt: scene.source.fetchedAt, ...(scene.total === undefined ? {} : { total: scene.total }) } } : {}),
      ...(timeBlock ? { timeBlock: structuredClone(timeBlock), timeZone: scene.kind === 'planning' ? scene.window.timeZone : undefined } : {}),
      ...(environmentSample ? { environmentSample: structuredClone(environmentSample), timeZone: scene.kind === 'environment' ? scene.timeZone : undefined } : {}),
      ...(discussion ? { discussion } : {}),
      ...(planningTrialObservation ? { planningTrialObservation } : {}),
      ...(storySetting ? { storySetting } : {}),
      selectedAt: this.store.kernel.clock.now(), meaning: (planningTrialObservation ? 'planningTrialObservation是界面手势或时刻编辑提交的临时试放条件，不是本人逐字原话、已评估可行的安排或执行授权；完整日期、时区、原对象及完整工作量由原画面核对，须沿同一事项/原planner继续商量准备、收尾、休息、冲突与其他条件。若试放落点不能成立要说明具体影响，不能在别处排好就声称这个落点已可行。本人真实新话优先，不能把这条界面条件另存成长期偏好或假造用户引文。' : '')
        + (timeBlock?.agendaRecord ? 'timeBlock.agendaRecord指本次读取时已有的本机记录及确切修订/重复实例；其state保留原邀请、愿望、待确认或已登记/接受状态。选择只引用，不能把旧读取当当前版本或把待确认事项当已接受；修改前沿local.agenda.read回读原owner，按targetId/expectedRevision和原occurrenceDate走既有动作。' : '')
        + '用户在当前对话界面明确选中的临时引用/试算；不是当前位置、到达证明、接受安排、长期偏好或行动授权。校园记录保留查询时刻，不代表之后没有变化；日期只确定当天，下午的具体起止时间仍以原话和真实日程核对。规划草案及planRefs采用前重新核查现有票据、覆盖与完整占用；跨日画面部分的originalRange保留原时段，planRefs仍指完整采用单位，不能只采用切片而省掉其他占用。旧画面不会恢复过期票据。小时温度对应时刻，降水对应标明的前一小时，空气指数保留自己的制式；都不是现场观察或个人运动安全结论。' };
  }
  summaries(handle: ScopeHandle, sessionId: string, runId?: string, attached?: SceneRef) {
    const available = this.available(handle, sessionId, runId, attached), recent = available.slice(-6);
    const journey = [...available].reverse().find(scene => scene.kind === 'map' && scene.journey.legs.length > 0);
    const selected = journey && !recent.some(scene => scene.id === journey.id) ? [journey, ...recent.slice(-5)] : recent;
    return selected.map(scene => scene.kind === 'note' ? noteHistoryReference(scene) : scene.kind === 'rehearsal' ? rehearsalHistoryReference(scene) : scene.kind === 'map' ? { id: scene.id, revision: scene.revision, kind: scene.kind, source: scene.source,
      ...(scene.place ? { place: { id: scene.place.id, label: scene.place.displayName } } : {}),
      ...(scene.storySetting ? { storySetting: scene.storySetting } : {}),
      journey: { ...scene.journey, legs: scene.journey.legs.map(({ id, fromStopId, toStopId, route }) => ({ id, fromStopId, toStopId, status: route.status, distance: route.distance, warnings: route.warnings })) } }
      : scene.kind === 'campus' ? campusSceneModelSummary(scene)
      : scene.kind === 'planning' ? { ...scene, blocks: scene.blocks.slice(0, 16), sceneBlockCount: scene.blocks.length, summaryOmittedBlocks: Math.max(0, scene.blocks.length - 16) }
      : scene.kind === 'environment' ? { ...scene, samples: scene.samples.slice(0, 8), sceneSampleCount: scene.samples.length, summaryOmittedSamples: Math.max(0, scene.samples.length - 8) }
      : scene.kind === 'discussion' ? { ...scene, points: scene.points.slice(0, 8), branches: scene.branches.slice(0, 6),
        scenePointCount: scene.points.length, summaryOmittedPoints: Math.max(0, scene.points.length - 8),
        sceneBranchCount: scene.branches.length, summaryOmittedBranches: Math.max(0, scene.branches.length - 6) }
      : { ...scene });
  }
}
