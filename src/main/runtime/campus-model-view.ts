import type { CapabilityResult } from '../capabilities/broker';
import type { CampusScene } from '../../shared/scenes';
import { majorGpaPointer, majorGpaReadFields } from '../capabilities/campus-query';

/** Source receipts belong to the host. Their coverage is already present in
 * the result's public source envelope; sending both full copies consumes model
 * context without delivering another record or a new read permission. */
export function projectCampusModelResult(capability: string, result: CapabilityResult): CapabilityResult {
  if (!['campus.lookup', 'campus.query', 'campus.imported_lookup'].includes(capability)
    || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) return result;
  const data = result.data as Record<string, unknown>;
  const academic = ['grades', 'gpa', 'gpa_overall', 'gpa_semesters', 'gpa_cumulative', 'retakes'].includes(String(data.resource || data.domain));
  if (!academic && !Object.hasOwn(data, 'snapshotProof') && !Object.hasOwn(data, 'snapshotProofs')) return result;
  const account = result.sourceId === 'campus:zju-account';
  const proof = data.snapshotProof && typeof data.snapshotProof === 'object' && !Array.isArray(data.snapshotProof)
    ? data.snapshotProof as Record<string, unknown> : undefined;
  const bundleId = data.bundle_id ?? data.bundleId;
  const majorVersion = account && proof?.sourceId === 'campus:zju-account' && proof.resource === 'gpa_overall'
    && proof.bundleId === bundleId && typeof proof.version === 'string' && /^[a-f0-9]{64}$/.test(proof.version) ? proof.version : undefined;
  const academicMeaning = account
    ? '逐科 fivePoint 是学校返回的绩点；gpa 中的均值由本机按记录的计入规则和学分加权。fourPoint 是工具沿用的 4.3 换算，fourPointLegacy 只是五分绩点封顶 4.0，不是学校历史出国算法。百分数的 numeric_source 是原分，repository_equivalent 是等级等值。分母是实际计入 GPA 的学分，取得学分另列，逐次取得学分相加可能重复计算重修。学期、累计截止学期、全部/首次/最高修读各有自己的分母；总均绩行没有返回 policy 时，每行的修读选择仍未标明，同学期首次先后也可能未知。major=true 是在主修来源匹配到了这次修读，false 只说明未确认。主修与全部修读分别取自己的结果和来源完整性；缺值、未出分和零分分开，查询时刻也不是成绩公布时刻。'
    : '这份成绩来自导入资料，分数、尺度、计入范围与来源说明按文件保留。它采用哪种绩点、怎样处理重修，需要沿文件自己的说明理解；没有写明的尺度或分母仍然未知。';
  const { snapshotProof: _proof, snapshotProofs: _proofs, ...body } = data;
  return { ...result, data: { ...body,
    ...(_proof || _proofs ? { hostSnapshotProof: '原资料的版本凭据由本机留着，后续读取仍回到同一份校园资料。' } : {}),
    ...(academic ? { academicMeaning,
      academicCalculation: '讨论某门课时，可以沿原记录读课程、学分、该尺度绩点和计入状态，再找相同范围、尺度和修读选择的均绩 G 与分母 C。只有确认该次修读已计入、其它记录和分母不变时，改为目标绩点 p 的假设结果才是 G + 学分×(p−原绩点)/C；新增一门确会计入、没有替换旧记录的 c 学分课，才用 (G×C+p×c)/(C+c)。重修或替代课程先核实际选取规则。目标绩点也有该尺度的上限；百分分数需要沿适用的折算表换成绩点，涨一分未必涨绩点。未出分课程的目标只是试算条件，原成绩仍未知；不同学期均绩要按各自分母合并，不能简单平均。解释可以落在眼前这门课的学分占比和具体变化，不必搬出整张成绩单。',
      ...(account ? { academicConversion: '账号连接器的 fourPoint 和 fourPointLegacy 都由每门课的 fivePoint 换算，不是另外从原始百分分数计算。当前本机 4.3 映射为 5→4.3、4.8→4.2、4.5→4.1、4.2→4.0；不超过4的值保持不变，其余大于4的值沿工具兼容规则封顶4，这个兜底没有校方换算保证。4.0封顶是逐科 min(4, fivePoint)。各科先换算，再按相同计入学分分别加权，总均绩本身不能直接套单科换算。如果讨论同一次修读的提分，目标绩点也沿同一规则换算到所比较的尺度；独立编辑某个展示字段、保留其它旧字段，是另一种假设，需要另说清。',
        academicPolicyReference: { title: '浙江大学本科课程成绩评定与管理办法（浙大发本〔2022〕24号）',
        url: 'https://meetc.zju.edu.cn/2024/0306/c79045a2885825/page.htm',
        meaning: '这份2022年办法规定，校内平均包含同课程号每次考核；2022级起出国成绩单用4.3制并取同课程号最高成绩，学院评价可以另设权重。眼前的分组、等级等值和排除规则仍是本机分析方法；正式主修、推免、评奖或出国成绩单还需看本人年级和用途所适用的规则。连接器把“无效”排除，与文件第十八条计入的规定不同。' },
        ...(majorVersion && typeof bundleId === 'string' && /^[a-f0-9]{32}$/.test(bundleId) ? { majorGpa: {
          capability: 'campus.query', arguments: { operation: 'read', resource: 'gpa_overall', bundleId,
            pointer: majorGpaPointer, expectedSnapshotVersion: majorVersion, fields: [...majorGpaReadFields], offset: 0, limit: 1, refresh: false },
          meaning: '这是同一快照中已确认主修记录的汇总地址，还没有读取那份正文。它有自己的学分分母，读取时会一起核对成绩与主修来源。' } } : {}) } : {}) } : {}) } };
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
    sourceCoverage: source.sourceCoverage ?? source.coverage, ...(source.authentication ? { authentication: source.authentication } : {}),
    ...(source.courseRecords ? { courseRecords: source.courseRecords } : {}), next: scene.continuation || null,
    meaning: '逐行课程、课次和考试都留在本机的校园资料页。这里有这次读到的范围、条数、来源和下一页地址，还没有逐行正文；想看具体内容，可以沿原地址继续读，或看你在页面选中的那一行。' },
    sceneRef: { id: scene.id, revision: scene.revision },
    presentation: '这份 sceneRef 可以交给 present_view，在对话里展开同一份校园资料。逐行正文还没有读进来；你选中某门课后，read_current_campus_selection 能回到原资料读那一行。学期、采集时间和已读范围都随原资料保留，课表记录的是学校的计划安排。' };
}

export function campusSceneModelSummary(scene: CampusScene) {
  const source: CampusScene['source'] = { sourceId: scene.source.sourceId, fetchedAt: '' };
  return { id: scene.id, revision: scene.revision, kind: scene.kind, domain: scene.domain,
    source, modelBodyDelivered: false as const,
    meaning: '这个地址能找回原来的校园画面，还没有逐行正文。眼前谈的是哪一页，要沿本轮前情里的 campusReading 地址核对；你在页面选中一行时，read_current_campus_selection 能读回同一条原记录。' };
}
