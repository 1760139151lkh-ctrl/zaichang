import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, type ScopeHandle } from '../../shared/harness';
import type { ImageAttachment } from '../../shared/types';
import type { LocationStatusResult } from '../../shared/map-v2';
import type { CampusMapAdapter } from '../mapService';
import type { CampusReferenceAdapter, ImageCrop } from '../capabilities/campus-reference';
import type { PolicyKernel } from './policy';
import type { WorkService } from './work';

const id = z.string().min(1).max(160);
export const spatialInput = z.object({
  fromId: id.optional(), toId: id,
  originKind: z.enum(['given_places', 'user_statement', 'shared_map_selection', 'device_observation']).default('given_places'),
  role: z.string().max(50).optional(), source: z.object({ eventId: id, quote: z.string().min(1).max(2000) }).strict().optional(),
  mode: z.enum(['walk', 'bike']).default('walk'), avoidStairs: z.boolean().default(false), arrivalBy: z.string().datetime({ offset: true }).optional(),
}).strict();
export const spaceControlInput = z.object({
  operation: z.enum(['bind_role', 'alias', 'crosswalk', 'read']), role: z.string().min(1).max(50).optional(),
  placeId: id.optional(), alias: z.string().min(1).max(80).optional(), referenceId: id.optional(),
  source: z.object({ eventId: id, quote: z.string().min(1).max(2000) }).strict().optional(),
}).strict();
export interface VisualObservation { id: string; toolCallId?: string; image: ImageAttachment; hash: string; version: string; sourceId: string; source: unknown; crop: ImageCrop | null; scopeId: string; epoch: number }
export class SpatialService {
  reference?: CampusReferenceAdapter;
  private shared?: { fromId?: string; device?: LocationStatusResult; epoch: number; expiresAt: number };
  private visuals = new Map<string, VisualObservation>();
  constructor(readonly policy: PolicyKernel, readonly work: WorkService, private map: () => CampusMapAdapter | undefined) {
    policy.onBarrier(() => { this.shared = undefined; this.visuals.clear(); });
  }
  available(capability?: string) {
    return capability === 'map.relations' ? !!this.map() : !!this.reference?.overview().connected;
  }
  /** Called only by a direct host UI control. Location sharing is distinct
   * from turning on the local map's coordinate display. */
  share(input: { enabled: boolean; fromId?: string; device?: LocationStatusResult }) {
    this.shared = input.enabled ? { fromId: input.fromId, device: input.device, epoch: this.policy.repo.epoch, expiresAt: Date.parse(this.policy.repo.clock.now()) + 120000 } : undefined;
    return { enabled: !!this.shared, expiresAt: this.shared ? new Date(this.shared.expiresAt).toISOString() : null, coordinateEgress: false };
  }
  sharedStatus() {
    const value = this.shared;
    const enabled = !!value && value.epoch === this.policy.repo.epoch && value.expiresAt > Date.parse(this.policy.repo.clock.now());
    return { enabled, expiresAt: enabled ? new Date(value.expiresAt).toISOString() : null };
  }
  relation(handle: ScopeHandle, raw: unknown) {
    const scope = this.policy.require(handle, 'map:read');
    const input = spatialInput.parse(raw), map = this.map(), now = this.policy.repo.clock.now();
    if (!map) return { status: 'not_connected', reason: '地图未连接。' };
    let fromId = input.fromId;
    if ((input.role || ['shared_map_selection', 'device_observation'].includes(input.originKind)) && (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self')) return { status: 'forbidden', reason: '个人地点与设备观察不能被套用到他人或假设场景；仍可使用明确给出的公开地点。' };
    if (input.role) {
      const binding = this.policy.repo.workData(handle, ['spatial_role'], { statuses: ['active'], limit: 30 }).find(record => record.data.role === input.role);
      if (!binding) return { status: 'unknown', reason: '这个个人地点角色尚未绑定，没有把它当作当前位置。' };
      fromId = String(binding.data.placeId);
    }
    let originEvidence: Record<string, unknown> = { kind: input.originKind, userPresenceConfirmed: false };
    if (input.originKind === 'user_statement') {
      const event = input.source && this.policy.repo.evidence(handle, input.source.eventId);
      if (!event || event.speaker !== 'user' || !event.text.includes(input.source!.quote)) throw new HarnessError('location_statement', '地点陈述需要真实用户原话。');
      originEvidence = { kind: 'user_statement', at: event.receivedAt, sourceQuote: input.source!.quote, userPresenceConfirmed: 'statement_not_device_measurement' };
    }
    if (['shared_map_selection', 'device_observation'].includes(input.originKind)) {
      const shared = this.shared;
      if (!shared || shared.epoch !== this.policy.repo.epoch || shared.expiresAt < Date.parse(now)) return { status: 'forbidden', reason: '没有正在生效的地图关系共享；可用用户给出的两点继续比较，不需要精确定位。' };
      if (input.originKind === 'shared_map_selection') { fromId = shared.fromId; originEvidence = { kind: 'user_selected_origin', userPresenceConfirmed: false }; }
      else {
        const device = shared.device, fix = device?.fix;
        if (!fix || !['fresh', 'approximate'].includes(device.status) || Date.parse(now) - fix.timestamp > 120000) return { status: 'unknown', reason: '当前设备没有足够新的位置；用户所在地仍未知，可按明确起点作条件比较。' };
        const candidates = map.deviceCandidates(fix.coordinate, fix.accuracy);
        return { status: 'partial', device: { source: fix.source, label: fix.deviceLabel, observedAt: new Date(fix.timestamp).toISOString(), reportedAccuracyMeters: fix.accuracy },
          candidates: candidates.map(point => ({ id: point.id, label: point.displayName, namespace: 'osm-zju-v2' })),
          userPosition: 'not_established_by_device', originConnection: 'unconfirmed', coordinateEgress: false,
          reason: '这些只说明设备报告的位置关系，不能覆盖用户自己的地点陈述，也没有证明到路网的接入。' };
      }
    }
    if (!fromId) return { status: 'unknown', destination: input.toId, reason: '缺少起点；仍可先提供目的地事实，或按给定候选起点比较。' };
    const route = map.route({ from: { kind: 'place', id: fromId }, to: { kind: 'place', id: input.toId }, avoidStairs: input.avoidStairs });
    const summary = { namespace: 'osm-zju-v2', version: route.source.version, sourceDate: route.source.date,
      from: route.from ? { id: route.from.id, label: route.from.displayName } : null, to: route.to ? { id: route.to.id, label: route.to.displayName } : null,
      originEvidence, coordinateEgress: false, warnings: route.warnings, unknown: ['楼内走到入口的时间', '排队、停车和当天门禁', '用户实际速度与途中停留'] };
    if (route.status !== 'ready') {
      const conditionalRoutes = route.status === 'unknown_entrance' && input.mode === 'walk' ? (route.conditionalOrigins || []).map(candidate => ({
        from: { id: candidate.id, label: candidate.label },
        originEntrance: candidate.originEntrance, destinationEntrance: candidate.destinationEntrance,
        networkMeters: candidate.networkM, estimateMinutes: candidate.minutes,
        condition: candidate.condition, originConnection: candidate.connection, guaranteedOnTime: false,
      })) : [];
      return { ...summary, status: route.status === 'same' ? 'fresh' : 'partial', routeStatus: route.status, reason: route.reason,
        conditionalRoutes, estimateBasis: '候选建筑是原地点附近的独立建筑；每段距离从该候选建筑自身列出的已记录连通入口起算，不是原地点的出口或用户当前位置。原地点到候选入口、楼内与当天通行仍未知，不能用已知路段保证全程赶上。' };
    }
    const meters = route.distance!.networkM, minutes = { min: Math.ceil(meters / 90), max: Math.ceil(meters / 48) };
    const estimatedAccess=route.distance!.connectorM>0;
    return { ...summary, status: estimatedAccess?'partial':'fresh', routeStatus: route.status, networkMeters: meters, connectorMeters:route.distance!.connectorM,totalEstimatedMeters:route.distance!.totalM,
      estimateMinutes: input.mode === 'walk' ? minutes : null, mode: input.mode,
      estimateBasis: input.mode === 'walk' ? estimatedAccess ? '时间仅按记录道路每分钟48–90米作条件估计；另含避障接入估计，真实门和楼内走法未确认，不给完整抵达时刻。' : '仅已记录入口到入口，以每分钟48–90米作条件估计，未测得用户速度。' : '当前仅有步行路网，未核实自行车通行和停车，不能冒用步行估计。',
      arrivalWindow: input.mode === 'walk'&&!estimatedAccess ? { earliest: new Date(Date.parse(now) + minutes.min * 60000).toISOString(), latestBeforeUnknownCosts: new Date(Date.parse(now) + minutes.max * 60000).toISOString() } : null,
      requestedArrivalBy: input.arrivalBy || null, guaranteedOnTime: false,
    };
  }
  control(handle: ScopeHandle, raw: unknown) {
    const input = spaceControlInput.parse(raw);
    if (input.operation === 'read') return this.policy.repo.workData(handle, ['spatial_role', 'spatial_alias', 'spatial_crosswalk'], { statuses: ['active'], limit: 50 });
    const scope = this.policy.require(handle, 'work:write');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real') throw new HarnessError('space_scope', '个人地点绑定只属于本人现实范围。');
    const event = input.source && this.policy.repo.evidence(handle, input.source.eventId), point = input.placeId && this.map()?.point(input.placeId);
    if (!event || event.speaker !== 'user' || !event.text.includes(input.source!.quote) || !point) throw new HarnessError('space_source', '个人地点修改需要用户原话和已知稳定地点。');
    if (input.operation === 'bind_role' && !input.role || input.operation === 'alias' && !input.alias || input.operation === 'crosswalk' && (!input.referenceId || !this.reference?.has(input.referenceId))) throw new HarnessError('space_target', '地点或别名尚未完整确定。');
    const type = input.operation === 'bind_role' ? 'spatial_role' : input.operation === 'alias' ? 'spatial_alias' : 'spatial_crosswalk';
    const recordId = 'space:' + createHash('sha256').update(`${scope.principalId}:${scope.workspaceId}:${type}:${input.role || input.alias || input.referenceId}`).digest('hex');
    const old = this.policy.repo.work(handle, undefined, recordId)[0];
    const data = { type, namespace: 'osm-zju-v2', placeId: point.id, mapVersion: this.map()!.overview().version, role: input.role || null, alias: input.alias || null,
      referenceId: input.referenceId || null, referenceNamespace: input.referenceId ? this.reference!.namespace : null, source: input.source!, publicDataChanged: false };
    if (old) { this.policy.repo.invalidate(old.id, 'personal_place_changed'); return this.work.update(handle, old.id, old.revision, { data, evidenceIds: [event.id], status: 'active' }); }
    const result = this.work.create(handle, 'experience', input.alias || input.role || '用户确认的地点对应', data, { id: recordId, status: 'active', evidenceIds: [event.id] });
    this.policy.repo.addDependency(handle, { consumerId: result.id, producerId: event.id, producerRevision: event.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
    return result;
  }
  observe(handle: ScopeHandle, crop?: ImageCrop) {
    const scope = this.policy.require(handle, 'map:read'), observed = this.reference?.image(crop);
    if (!observed) return { status: 'not_connected', reason: '尚未连接真实俯瞰图资源。结构化地图仍可用。' };
    const hash = createHash('sha256').update(Buffer.from(observed.image.dataUrl.split(',')[1], 'base64')).digest('hex'), id = randomUUID();
    this.visuals.set(id, { id, image: observed.image, hash, version: observed.version, sourceId: 'map:local', source: observed.source, crop: observed.crop, scopeId: handle.id, epoch: scope.privacyEpoch });
    while (this.visuals.size > 4) this.visuals.delete(this.visuals.keys().next().value!);
    return { status: 'fresh', observationId: id, hash, version: observed.version, crop: observed.crop, source: observed.source,
      transport: 'prepared_for_next_model_request', meaning: '已取得真实图片，宿主将在后续模型请求送入像素；此记录不证明模型已经看懂。' };
  }
  visual(handle: ScopeHandle, id: string) {
    const scope = this.policy.validate(handle), image = this.visuals.get(id);
    if (!image || image.scopeId !== handle.id || image.epoch !== scope.privacyEpoch) throw new HarnessError('image_observation_missing', '没有此范围下的真实图像观察，不能伪造看图证明。');
    return image;
  }
}
