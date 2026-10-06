import { z } from 'zod';
import type { CapabilityBroker } from './broker';
import { spatialInput, type SpatialService } from '../runtime/spatial';

export function registerSpatial(broker: CapabilityBroker, spatial: SpatialService) {
  const sourceId = 'map:local', base = { version: '1', output: z.record(z.string(), z.json()), effect: 'read' as const, requiredScopes: ['map:read'], subjects: ['self', 'other', 'fictional'] as ('self' | 'other' | 'fictional')[], worlds: ['real', 'scenario'] as ('real' | 'scenario')[], timeoutMs: 15000, maxBytes: 60000, supportsIdempotency: false, supportsInspect: false, supportsCancel: false };
  broker.register({ manifest: { id: 'spatial-evidence', version: '1', sourceId, trust: 'bundled_reviewed', egressHosts: [], platforms: ['*'], simulated: false, offline: 'read_cache', license: 'Project-owned adapter; OSM ODbL and ZJU source rights remain separate', capabilities: [
    { ...base, name: 'map.relations', displayName: '本地计算空间与到达关系', description: '按稳定地点ID、用户原话或明确共享的地图起点在本机计算入口间路程与条件时间范围，坐标留在本机。设备观察不是人的位置；楼内、门禁和停车未知。没有定位可用given_places两点计算。', input: spatialInput },
    { ...base, name: 'map.reference_search', displayName: '官方俯瞰图公开索引', description: '检索已安装定位技能的公开地点名称，返回独立命名空间、来源和版本。未确认对应关系的官方ID不能当作原生路网ID。', input: z.object({ query: z.string().max(100), limit: z.number().int().min(1).max(12).default(5) }).strict() },
    { ...base, name: 'map.observe', displayName: '实际查看官方俯瞰图', description: '需要视觉判断时读取真实像素，宿主会在接下来当前模型请求中送图，来源保持外部工具证据。crop使用0到1归一化矩形按需看局部；实际传入和正确理解分别核查。一般索引/距离查询无需反复看整图。', input: z.object({ crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().gt(0).max(1), height: z.number().gt(0).max(1) }).refine(crop => crop.x + crop.width <= 1 && crop.y + crop.height <= 1).optional() }).strict() },
  ] }, connectionStatus: capability => ({ connected: spatial.available(capability), reason: spatial.available(capability) ? undefined : '此空间资料尚未装配，其他已连接地图能力仍可使用。' }), invoke: (name, args, context) => {
    if (name === 'map.reference_search') return { status: spatial.reference?.overview().connected ? 'fresh' : 'not_connected', sourceId, data: { source: spatial.reference?.overview() || { connected: false }, items: spatial.reference?.search(args.query, args.limit) || [] }, simulated: false };
    const data = name === 'map.observe' ? spatial.observe(context.scope, args.crop) : spatial.relation(context.scope, args);
    return { status: data.status, sourceId, data, fetchedAt: broker.policy.repo.clock.now(), simulated: false };
  } }, { reviewed: true, source: 'project-owned spatial and public visual evidence adapter' });
}
