import type { CapabilityResult } from '../capabilities/broker';
import type { CampusScene } from '../../shared/scenes';

/** Source receipts belong to the host. Their coverage is already present in
 * the result's public source envelope; sending both full copies consumes model
 * context without delivering another record or a new read permission. */
export function projectCampusModelResult(capability: string, result: CapabilityResult): CapabilityResult {
  if (!['campus.lookup', 'campus.query', 'campus.imported_lookup'].includes(capability)
    || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) return result;
  const data = result.data as Record<string, unknown>;
  if (!Object.hasOwn(data, 'snapshotProof') && !Object.hasOwn(data, 'snapshotProofs')) return result;
  const { snapshotProof: _proof, snapshotProofs: _proofs, ...body } = data;
  return { ...result, data: { ...body, hostSnapshotProof: 'retained_by_host_for_source_rechecks_not_model_permission' } };
}

/** This is a document address, not a summary of unseen course rows. */
export function campusNativeModelResult(result: CapabilityResult, scene: CampusScene): CapabilityResult & {
  sceneRef: { id: string; revision: number }; presentation: string;
} {
  const source = result.data as Record<string, unknown>;
  return { ...result, data: { domain: scene.domain, modelBodyDelivered: false,
    nativeDocument: { id: scene.id, revision: scene.revision, kind: scene.kind, term: scene.term,
      returned: scene.records.length, total: scene.total, complete: scene.complete, source: scene.source,
      sourceLabel: scene.sourceLabel },
    sourceCoverage: source.sourceCoverage ?? source.coverage, next: scene.continuation || null,
    meaning: '这些逐行课程/课次/考试保留在宿主原生资料页，本次没有把行正文交给模型；这里只交付确切范围、条数、来源覆盖和继续读取地址，不能据此概括未读行或猜下一节课。' },
    sceneRef: { id: scene.id, revision: scene.revision },
    presentation: '用present_view引用此真实sceneRef展开原生资料页即可，不必把全表重新读进模型。modelBodyDelivered=false表示模型未读逐行正文，不可概括未读课程；需具体行时在界面选中后沿read_current_campus_selection回原owner读取。原学期、采集时间、覆盖与部分页保持原值，不把资料页当出席或新安排。' };
}

export function campusSceneModelSummary(scene: CampusScene) {
  const source: CampusScene['source'] = { sourceId: scene.source.sourceId, fetchedAt: '' };
  return { id: scene.id, revision: scene.revision, kind: scene.kind, domain: scene.domain,
    source, modelBodyDelivered: false as const,
    meaning: '这是原校园画面的目录地址，未提供行正文、查询条件或续页参数，也不表示它就是眼前所说的那一页。具体内容沿当前已准入前情的campusReading地址回读；界面明确选中一行时，read_current_campus_selection回原owner读取。' };
}
