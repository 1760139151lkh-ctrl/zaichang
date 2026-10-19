import { randomUUID } from 'node:crypto';
import { HarnessError, type ScopeHandle, type WorkSourceRef } from '../../shared/harness';
import type { MapOverview, MapPoint } from '../../shared/map-v2';
import { storySettingRequestSchema, storySettingSnapshotSchema, storySettingPresentationInput,
  mapStorySettingSchema, type StorySettingSnapshot } from '../../shared/story-setting';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from './policy';
import type { RuntimeCoordinator, RunSession } from './coordinator';
import type { MapScene } from '../../shared/scenes';
import { curiosityViewSchema } from '../../shared/curiosity-scene';
import { curiosityContextForRun } from './curiosity-scene';
import { curiosityFollowupReferenceSchema } from '../../shared/curiosity-source';
import { semanticSelectionSchema } from '../../shared/scenes';

export interface PublicSettingMap { overview(): MapOverview; point(id: string): MapPoint | undefined }
/** A host fact from the public adapter only. Never profile overlays, Windows
 * coordinates, guessed names or an imagined story event. */
export function publicStoryPlace(policy: PolicyKernel, handle: ScopeHandle, map: PublicSettingMap | undefined, raw: unknown) {
  const input = storySettingRequestSchema.parse(raw), scope = policy.validate(handle);
  if (!scope.sources.includes('map:local') || !policy.can(handle, 'map:read')) throw new HarnessError('story_map_scope', '这次还没有打开公共地图资料，作品仍可直接继续。');
  const manifest = map?.overview(), point = map?.point(input.placeId);
  if (!manifest || manifest.version === 'unavailable' || manifest.version !== input.mapVersion || !point || point.personal)
    throw new HarnessError('story_map_changed', '这个取景点还没有对上当前公共地图；先读现有地点，不猜旧名称或私人位置。', 'read');
  return { manifest, point };
}

export function retainStorySetting(repo: KernelRepository, policy: PolicyKernel, handle: ScopeHandle,
  sessionId: string, map: PublicSettingMap | undefined, raw: unknown): StorySettingSnapshot {
  const { manifest, point } = publicStoryPlace(policy, handle, map, raw), scope = policy.require(handle, 'work:write');
  const id = randomUUID(), now = repo.clock.now();
  const text = JSON.stringify({ kind: 'public_map_place', placeId: point.id, label: point.displayName,
    mapVersion: manifest.version, sourceDate: manifest.sourceDate, sourceUrl: point.source.url,
    meaning: '公共地图中的地点资料；只供虚构作品取景，不是用户当前位置、到达、现场观察或真实行程。' });
  const event = repo.ingest(handle, { id, ownerId: scope.principalId, workspaceId: scope.workspaceId,
    subjectId: scope.subjectId, worldId: 'real', sourceId: 'map:local', contentVersion: 1, status: 'active',
    text, speaker: 'external', kind: 'tool_result', authority: 'source_record', roots: [id],
    label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'public', infer: false },
    locator: { kind: 'structured', snapshotId: manifest.version, sourceRecordId: point.id, jsonPointer: '' },
    receivedAt: now, sessionId });
  const evidenceRef: WorkSourceRef = { eventId: event.id, contentVersion: event.contentVersion, start: 0, end: Array.from(text).length };
  return { kind: 'fictional_setting', placeId: point.id, label: point.displayName, mapVersion: manifest.version,
    sourceDate: manifest.sourceDate, capturedAt: now, sourceUrl: point.source.url, evidenceRef };
}

/** A setting uses the original owner and the existing map surface. The factory
 * is staged: the caller admits its body/proofs before remembering/publishing. */
export function createStorySettingPresentation(host: Pick<RuntimeCoordinator, 'repo' | 'policy' | 'connections' | 'curiosityInvitations' | 'scenes'>,
  session: RunSession, raw: unknown, signal: AbortSignal) {
  signal.throwIfAborted();
  const input = storySettingPresentationInput.parse(raw), handle = session.ingress.contract.scope;
  const scope = host.policy.require(handle, 'evidence:read');
  if (session.background || scope.child || scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self')
    throw new HarnessError('story_map_owner', '取景跟着当前本人的共同作品展开，不另起后台故事。');
  const result = host.curiosityInvitations.read(handle, curiosityContextForRun(host, session), input.id);
  if (result.value.status !== 'available') throw new HarnessError('story_map_read', '先回读这份作品当前可采用的材料，再展开取景。', 'read');
  const view = curiosityViewSchema.parse(result.value.curiosity);
  if (view.revision !== input.expectedRevision || view.matterRevision !== input.expectedMatterRevision)
    throw new HarnessError('revision_conflict', '作品已有下一段，先接现在这一段的取景。');
  if (view.origin !== 'created') throw new HarnessError('story_map_setting', '图上取景接共同创作；普通发现按自己的原资料展开，不必强加地图。');
  const map = host.connections.map?.publicView();
  host.policy.require(handle, 'map:read');
  if (!scope.sources.includes('map:local')) throw new HarnessError('story_map_scope', '这次还没有打开公共地图，仍可以直接写这一幕。');
  const manifest = map?.overview();
  if (!manifest || manifest.version === 'unavailable') throw new HarnessError('map_unavailable', '公共地图暂未装配，作品仍留在原处。');
  const point = view.setting ? publicStoryPlace(host.policy, handle, map, { placeId: view.setting.placeId, mapVersion: view.setting.mapVersion }).point : undefined;
  const sessionId = session.sceneSessionId || session.sessionId;
  const available = host.scenes.available(handle, sessionId, session.ingress.contract.id,
    session.selection ? { id: session.selection.sceneId, revision: session.selection.sceneRevision } : undefined);
  const previous = input.map ? available.find((scene): scene is MapScene => scene.kind === 'map' && scene.id === input.map!.id && scene.revision === input.map!.revision)
    : [...available].reverse().find((scene): scene is MapScene => scene.kind === 'map');
  if (input.map && !previous) throw new HarnessError('story_map_previous', '这张地图已变化，先沿当前画面继续。');
  if (previous && previous.source.version !== manifest.version)
    throw new HarnessError('story_map_changed', '地图资料已有新版本，先更新公共地图再接取景；原作品没有消失。', 'read');
  const base = previous || host.scenes.browse(sessionId, { ...(point ? { placeId: point.id } : {}), stageOnly: true });
  const refs = [...new Map(result.records.flatMap(record => record.sourceBinding?.refs || []).map(ref => [JSON.stringify(ref), ref])).values()];
  const binding = host.repo.resolveWorkSourceBinding(handle, refs);
  const setting = mapStorySettingSchema.parse({ kind: 'fictional_setting',
    work: { id: view.id, revision: view.revision, matterId: view.matterId, matterRevision: view.matterRevision },
    mapVersion: manifest.version, ...(view.setting ? { place: storySettingSnapshotSchema.parse(view.setting) } : {}), sourceBinding: binding,
    ...(result.assistantWorkSources?.length ? { assistantWorkSources: result.assistantWorkSources } : {}) });
  const scene: MapScene = { ...base, revision: previous ? previous.revision + 1 : base.revision,
    createdAt: host.repo.clock.now(), display: view.setting ? 'compact' : 'expanded', storySetting: setting };
  // Adding a work relation never manufactures a camera request or real arrival.
  delete scene.arrival;
  signal.throwIfAborted(); host.policy.validate(handle);
  return { scene, previous: previous ? { id: previous.id, revision: previous.revision } : undefined,
    records: result.records, bindings: [binding, ...result.bindings], assistantWorkSources: result.assistantWorkSources || [] };
}

/** Before parsing the new utterance, identify only an exact saved map's work
 * pointer. No map geometry, story field, receipt proof body or original quote
 * is selected here. Formal compile still performs the full owner read. */
export function mapStoryReferenceIdentity(host: Pick<RuntimeCoordinator, 'repo' | 'policy' | 'curiosityInvitations'>,
  handle: ScopeHandle, sessionId: string, raw: unknown) {
  const selection = semanticSelectionSchema.parse(raw), scope = host.policy.require(handle, 'evidence:read');
  if (!(selection.kind === 'place' && selection.placeId || selection.kind === 'leg' && selection.legId) || scope.audience !== 'self' || scope.worldId !== 'real'
    || scope.subjectId !== scope.principalId || !scope.sources.includes('work:self') || !scope.sources.includes('map:local')
    || !host.policy.can(handle, 'map:read')) return;
  const row = host.repo.db.prepare(`SELECT m.id AS message_id,json_extract(s.value,'$.storySetting.work') AS work
    FROM messages m JOIN json_each(m.payload,'$.scenes') s WHERE m.session_id=? AND m.role='assistant'
    AND json_extract(m.payload,'$.status')='done' AND json_extract(s.value,'$.kind')='map'
    AND json_extract(s.value,'$.id')=? AND json_extract(s.value,'$.revision')=?
    AND json_extract(s.value,'$.source.sourceId')='map:local'
    AND json_extract(s.value,'$.storySetting.kind')='fictional_setting'
    AND (? IS NULL OR EXISTS(SELECT 1 FROM json_each(s.value,'$.journey.legs') leg WHERE json_extract(leg.value,'$.id')=?))
    AND EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id
      AND e.owner=? AND e.workspace=? AND e.subject=? AND e.world='real' AND e.status!='deleted')
    AND NOT EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id AND (e.owner!=? OR e.workspace!=?))
    AND NOT EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(m.payload,'$.contextReceipt.providedSourceIds'),'["map:local"]')) src
      WHERE src.value NOT IN (SELECT value FROM json_each(?)))
    AND json_type(s.value,'$.storySetting.sourceBinding.sourceIds')='array'
    AND json_type(s.value,'$.storySetting.sourceBinding.requiredGrants')='array'
    AND NOT EXISTS(SELECT 1 FROM json_each(s.value,'$.storySetting.sourceBinding.sourceIds') src
      WHERE src.type!='text' OR src.value NOT IN (SELECT value FROM json_each(?)))
    AND NOT EXISTS(SELECT 1 FROM json_each(s.value,'$.storySetting.sourceBinding.requiredGrants') permission
      WHERE permission.type!='text' OR permission.value NOT IN (SELECT value FROM json_each(?))) LIMIT 1`)
    .get(sessionId, selection.sceneId, selection.sceneRevision, selection.legId || null, selection.legId || null, scope.principalId, scope.workspaceId, scope.principalId,
      scope.principalId, scope.workspaceId, JSON.stringify(scope.sources), JSON.stringify(scope.sources), JSON.stringify(scope.grants));
  if (!row || typeof row.work !== 'string' || host.repo.hasFence(String(row.message_id)) || host.repo.hasFence(selection.sceneId)) return;
  let value: unknown;
  try { value = JSON.parse(row.work); } catch { return; }
  const parsed = curiosityFollowupReferenceSchema.safeParse(value);
  if (!parsed.success) return;
  const identity = host.curiosityInvitations.referenceIdentity(handle, parsed.data, { sessionId, allowCrossSession: false });
  return identity.origin === 'created' ? { work: parsed.data, origin: 'created' as const } : undefined;
}
