import { z } from 'zod';
import type { CapabilityBroker } from './broker';
import { spatialInput, type SpatialService } from '../runtime/spatial';

export function registerSpatial(broker: CapabilityBroker, spatial: SpatialService) {
  const sourceId = 'map:local', base = { version: '1', output: z.record(z.string(), z.json()), effect: 'read' as const, requiredScopes: ['map:read'], subjects: ['self', 'other', 'fictional'] as ('self' | 'other' | 'fictional')[], worlds: ['real', 'scenario'] as ('real' | 'scenario')[], timeoutMs: 15000, maxBytes: 60000, supportsIdempotency: false, supportsInspect: false, supportsCancel: false };
  broker.register({ manifest: { id: 'spatial-evidence', version: '1', sourceId, trust: 'bundled_reviewed', egressHosts: [], platforms: ['*'], simulated: false, offline: 'read_cache', license: 'Project-owned adapter; OSM ODbL and ZJU source rights remain separate', capabilities: [
    { ...base, version: '4', name: 'map.relations', displayName: '看看怎么过去', description: '按地点ID、对方说的地点、已保存的地点叫法或这次选出的起点，计算路线与步行时间范围。bindingId沿manage_space.read给出的对应使用，role选择已保存的地点角色。departAt可试算出发时刻，mapVersion可接回先前那版路线。起点会说明来自手选、保存还是设备观察，坐标留在本机；楼内通行、当天门禁与停车情况仍待现场确认。', input: spatialInput },
    { ...base, name: 'map.reference_search', displayName: '查官方俯瞰图地点名', description: '在已安装的官方俯瞰图索引中找地点名称，带回来源和版本。这里的地点编号属于俯瞰图索引，对应路网地点时另有匹配。', input: z.object({ query: z.string().max(100), limit: z.number().int().min(1).max(12).default(5) }).strict() },
    { ...base, name: 'map.observe', displayName: '看看官方俯瞰图', description: '查看官方俯瞰图的真实图像，适合判断建筑与地形的相对位置。crop用0到1的矩形选择局部；按名称找地点或算距离可先用索引和路线。', input: z.object({ crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().gt(0).max(1), height: z.number().gt(0).max(1) }).refine(crop => crop.x + crop.width <= 1 && crop.y + crop.height <= 1).optional() }).strict() },
  ] }, connectionStatus: capability => ({ connected: spatial.available(capability), reason: spatial.available(capability) ? undefined : '此空间资料尚未装配，其他已连接地图能力仍可使用。' }), invoke: (name, args, context) => {
    if (name === 'map.reference_search') return { status: spatial.reference?.overview().connected ? 'fresh' : 'not_connected', sourceId, data: { source: spatial.reference?.overview() || { connected: false }, items: spatial.reference?.search(args.query, args.limit) || [] }, simulated: false };
    const data = name === 'map.observe' ? spatial.observe(context.scope, args.crop, context.onVisualPrepared) : spatial.relation(context.scope, args);
    return { status: data.status, sourceId, data, fetchedAt: broker.policy.repo.clock.now(), simulated: false };
  } }, { reviewed: true, source: 'project-owned spatial and public visual evidence adapter' });
}
