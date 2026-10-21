import { z } from 'zod';
import { HarnessError } from '../../shared/harness';
import type { DeepSeekClient, ToolSpec } from '../provider';
import { structuredResult } from './structured-result';
import { observationsForReview } from './observation-review';

const reviewSchema = z.object({
  missing: z.array(z.object({ quote: z.string().min(1).max(3000).describe('逐字引用original中尚未满足的要求。答复中的无依据声明放入contradictions，不在这里改写或去掉Markdown后引用答复。'), needed: z.string().max(1500), disposition: z.enum(['repairable', 'blocked_explained']).default('repairable').describe('本轮继续调用可补齐时为repairable；外部通道/权限不可用且答复已准确说明未完成时为blocked_explained。') }).strict()).max(12),
  blocked: z.array(z.object({ quote: z.string().min(1).max(3000), reason: z.string().max(1500) }).strict()).max(12).default([]),
  contradictions: z.array(z.string().max(1200)).max(12),
  requests: z.array(z.object({ id: z.string().max(160), status: z.enum(['answered', 'succeeded', 'unresolved']), actionIds: z.array(z.string().max(160)).max(8),
    kind: z.enum(['answer', 'action', 'artifact']).optional().describe('按用户实际所需结果核对；请求记录里的分类也是可纠正提案。说明是answer，成稿是artifact，改变业务状态才是action。'),
    basisQuote: z.string().min(1).max(3000).optional().describe('修正请求分类时逐字引用该请求原话，不能由成稿推定外发已经完成。'),
    artifactIds: z.array(z.string().max(160)).max(8).optional().describe('实际成稿ID；它们不是动作ID，不放入actionIds。'),
  }).strict()).max(20).default([]),
}).strict();
export type CompletionReview = z.infer<typeof reviewSchema>;

/** Long originals are reviewed in bounded overlapping segments so a request in
 * the middle cannot disappear behind repeated background text. The final tail
 * is included only to recognize later corrections that supersede an earlier
 * action; every reported quote must still come from the focused segment. */
export async function reviewLongInputCoverage(original: string, reply: string, complete: DeepSeekClient['complete'], signal: AbortSignal): Promise<CompletionReview> {
  const points = Array.from(original);
  if (points.length <= 8000) return { missing: [], blocked: [], contradictions: [], requests: [] };
  const segmentSchema = z.object({ missing: z.array(z.object({ quote: z.string().min(1).max(3000), needed: z.string().max(1500) }).strict()).max(8), contradictions: z.array(z.string().max(1200)).max(8) }).strict();
  const { $schema: _, ...parameters } = z.toJSONSchema(segmentSchema);
  const tool: ToolSpec = { type: 'function', function: { name: 'report_segment_gaps', description: '核对长原话当前片段中的明确要求是否在最终答复中得到保留。', parameters } };
  const tail = points.slice(-2500).join('');
  const missing: CompletionReview['missing'] = [], contradictions: string[] = [];
  const segments: { index: number; text: string }[] = [];
  for (let start = 0, index = 0; start < points.length; start += 4800, index++) segments.push({ index, text: points.slice(start, Math.min(points.length, start + 5000)).join('') });
  const controller = new AbortController(), reviewSignal = AbortSignal.any([signal, controller.signal]);
  let values: { segment: string; value: z.infer<typeof segmentSchema> }[];
  try {
    values = await Promise.all(segments.map(async ({ index, text: segment }) => ({ segment, value: await structuredResult({ schema: segmentSchema, tool, complete, signal: reviewSignal, failureCode: 'long_review_incomplete', failureMessage: '长内容的覆盖核查没有完成。', options: { thinking: 'enabled', maxOutputTokens: 8192, phase: 'completion_review' }, messages: [
      { role: 'system', content: '只核对focusedSegment中的明确用户要求、问题、禁止条件或要求带回的标识是否被finalReply实质满足。重复背景、叙述材料和没有要求回应的内容不算缺口。finalTail用于识别后来更正：末尾明确撤回或替换了片段中的早期动作时，不要求执行被撤回动作；但与末尾更正兼容的独立回答要求仍须保留。分段只防止要求从中间消失，不负责判定答复事实来自哪个片段：finalReply可能依据其他片段作答；不能因为某个答复事实未出现在当前focusedSegment就报矛盾，也不能因当前片段只有问题、答案在别的片段就说问题不可回答。只有focusedSegment本身明确与finalReply冲突时才报contradiction。不要要求额外解释或固定措辞。missing.quote必须逐字来自focusedSegment；没有缺口就返回空数组。调用指定工具。' },
      { role: 'user', content: JSON.stringify({ segmentIndex: index, focusedSegment: segment, finalTail: tail, finalReply: reply }) },
    ] }) })));
  } catch (error) {
    controller.abort(new DOMException('Sibling long-input review failed', 'AbortError'));
    throw error;
  }
  for (const { segment, value } of values) {
    // finalTail is shown to every reviewer only to understand supersession. A
    // model may mistakenly cite it as if it were in this focused segment; drop
    // that cross-segment proposal. The segment which actually contains the
    // quote reviews it independently. Global completion review owns factual
    // contradictions, so ungrounded segment contradiction prose is not used.
    for (const gap of value.missing.filter(gap => segment.includes(gap.quote)))
      if (!missing.some(item => item.quote === gap.quote && item.needed === gap.needed)) missing.push({ ...gap, disposition: 'repairable' });
  }
  return { missing, blocked: [], contradictions, requests: [] };
}

/** Targeted coverage/receipt review, not a style/personality rewriting agent. */
export async function reviewCompletion(input: {
  original: string; reply: string; requests: unknown[]; actions: unknown[]; observations: unknown[]; hostState?: unknown;
}, complete: DeepSeekClient['complete'], signal: AbortSignal): Promise<CompletionReview> {
  const { $schema: _, ...parameters } = z.toJSONSchema(reviewSchema);
  const tool: ToolSpec = { type: 'function', function: { name: 'report_completion_gaps', description: '只报告实质遗漏、事实/回执不一致，以及各明确请求的实际状态。', parameters } };
  const groundedReview = reviewSchema.superRefine((value, context) => {
    for (const [index, gap] of value.missing.entries()) {
      const fromOriginal = input.original.includes(gap.quote);
      const fromReply = gap.disposition === 'repairable' && input.reply.includes(gap.quote);
      if (!fromOriginal && !fromReply) context.addIssue({ code: 'custom', path: ['missing', index, 'quote'], message: '引用必须逐字来自original；答复缺证据可写入contradictions。不得补造用户要求或改写引文。' });
      if (/无实质遗漏|没有实质遗漏|没有需要补|无需补充/.test(gap.needed))
        context.addIssue({ code: 'custom', path: ['missing', index, 'needed'], message: 'needed说没有实质遗漏就不能同时提交repairable缺口；请重新核对最终答复。' });
    }
    for (const [index, gap] of value.blocked.entries()) if (!input.original.includes(gap.quote))
      context.addIssue({ code: 'custom', path: ['blocked', index, 'quote'], message: '外部阻塞所对应的要求必须逐字来自original。' });
  });
  const admittedObservations = observationsForReview(input.observations);
  const observedRows = admittedObservations.filter(value => value && typeof value === 'object') as Record<string, unknown>[];
  const hasSimulatedCampusRecord = observedRows.some(observation => {
    const result = observation.result as Record<string, unknown> | undefined;
    const data = result?.data as Record<string, unknown> | undefined;
    return observation.tool === 'look_up' && result?.simulated === true && typeof result.sourceId === 'string'
      && result.sourceId.startsWith('campus:') && Array.isArray(data?.records) && data.records.length > 0;
  });
  const hasUnverifiedLocalCampusRecord = observedRows.some(observation => {
    const result = observation.result as Record<string, unknown> | undefined;
    const data = result?.data as Record<string, unknown> | undefined;
    return observation.tool === 'look_up' && result?.sourceId === 'campus:local'
      && data?.live === false && data.authenticated === false && data.origin === 'legacy_import'
      && Array.isArray(data.records) && data.records.length > 0;
  });
  const hasConditionalMapRoute = observedRows.some(observation => {
    const result = observation.result as Record<string, unknown> | undefined;
    return observation.tool === 'map_route' && Array.isArray(result?.reviewConditionalSegments) && result.reviewConditionalSegments.length > 0;
  });
  const hasReadyMapRoute = observedRows.some(observation => {
    const result = observation.result as Record<string, unknown> | undefined;
    const data = result?.data as Record<string, unknown> | undefined;
    return observation.tool === 'map_route' && data?.status === 'ready';
  });
  const hasUnknownMapRouteWithOtherOptions = observedRows.some(observation => {
    const result = observation.result as Record<string, unknown> | undefined;
    const data = result?.data as Record<string, unknown> | undefined;
    return observation.tool === 'map_route' && ['unknown_entrance', 'unreachable'].includes(String(data?.status));
  }) && Array.isArray((input.hostState as any)?.knownDiscussionPlaces)
    && (input.hostState as any).knownDiscussionPlaces.length >= 3;
  const hasConditionalMapRelation = observedRows.some(observation => {
    const result = observation.result as Record<string, unknown> | undefined;
    const data = result?.data as Record<string, unknown> | undefined;
    return observation.tool === 'map.relations' && (Array.isArray(data?.conditionalRoutes) || Array.isArray(result?.conditionalRoutes));
  });
  const hasUnknownMapRouteWithoutCandidate = observedRows.some(observation => {
    const result = observation.result as Record<string, unknown> | undefined;
    const data = result?.data as Record<string, unknown> | undefined;
    const from = data?.from as Record<string, unknown> | undefined;
    return observation.tool === 'map_route' && data?.status === 'unknown_entrance'
      && Array.isArray(from?.entrances) && from.entrances.length === 0
      && Array.isArray(data.conditionalOrigins) && data.conditionalOrigins.length === 0;
  });
  // Literal coverage checks are evidence for the reviewer, never an automatic
  // semantic verdict. They help it notice values already present in a long
  // answer without promoting source text to an instruction.
  const answerCoverage = {
    syntheticRecords: observedRows.flatMap(observation => {
      const result = observation.result as Record<string, unknown> | undefined;
      const data = result?.data as Record<string, unknown> | undefined;
      if (observation.tool !== 'look_up' || result?.simulated !== true || !Array.isArray(data?.records)) return [];
      return data.records.slice(0, 5).map((value, index) => {
        const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        return { observationId: result.observationId, recordIndex: index,
          locationMentioned: typeof record.location === 'string' && input.reply.includes(record.location),
          titleMentioned: typeof record.title === 'string' && input.reply.includes(record.title) };
      });
    }),
    localImportedRecords: observedRows.flatMap(observation => {
      const result = observation.result as Record<string, unknown> | undefined;
      const data = result?.data as Record<string, unknown> | undefined;
      if (observation.tool !== 'look_up' || result?.sourceId !== 'campus:local'
        || data?.live !== false || data.authenticated !== false || data.origin !== 'legacy_import' || !Array.isArray(data.records)) return [];
      return data.records.slice(0, 5).map((value, index) => {
        const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        return { observationId: result.observationId, recordIndex: index, sourceIsSyntheticFixture: data.institutionId === 'synthetic-campus',
          locationMentioned: typeof record.location === 'string' && input.reply.includes(record.location),
          titleMentioned: typeof record.title === 'string' && input.reply.includes(record.title) };
      });
    }),
    mapCandidates: observedRows.flatMap(observation => {
      const result = observation.result as Record<string, unknown> | undefined;
      if (observation.tool !== 'map_route' || !Array.isArray(result?.reviewConditionalSegments)) return [];
      return result.reviewConditionalSegments.slice(0, 5).map(value => {
        const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        const minutes = candidate.knownSegmentMinutes as Record<string, unknown> | undefined;
        return { observationId: result.observationId, candidateOriginId: candidate.candidateOriginId,
          candidateLabelMentioned: typeof candidate.candidateOriginLabel === 'string' && input.reply.includes(candidate.candidateOriginLabel),
          minuteBoundsMentioned: typeof minutes?.min === 'number' && typeof minutes.max === 'number'
            && input.reply.includes(String(minutes.min)) && input.reply.includes(String(minutes.max)) };
      });
    }),
    mapRelations: observedRows.flatMap(observation => {
      const result = observation.result as Record<string, unknown> | undefined;
      const data = result?.data as Record<string, unknown> | undefined;
      if (observation.tool !== 'map.relations') return [];
      const routes = Array.isArray(data?.conditionalRoutes) ? data.conditionalRoutes : Array.isArray(result?.conditionalRoutes) ? result.conditionalRoutes : [];
      return routes.slice(0, 5).map((value, index) => {
        const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        const from = candidate.from as Record<string, unknown> | undefined;
        const minutes = candidate.estimateMinutes as Record<string, unknown> | undefined;
        return { observationId: result?.observationId, candidateIndex: index,
          knownOriginId: typeof from?.id === 'string' ? from.id : null,
          knownOriginLabelMentioned: typeof from?.label === 'string' && input.reply.includes(from.label),
          minuteBoundsMentioned: typeof minutes?.min === 'number' && typeof minutes.max === 'number'
            && input.reply.includes(String(minutes.min)) && input.reply.includes(String(minutes.max)),
          originConnection: candidate.originConnection || null };
      });
    }),
  };
  // These are schema meanings selected only from already-admitted observations.
  // Never interpolate external text into a system message or infer permission.
  const observationGuidance: { role: 'system'; content: string }[] = [];
  if (hasSimulatedCampusRecord) observationGuidance.push({ role: 'system', content: '当前实际校园查询结果标simulated=true。即使sourceId名称像正式账号、能力目录显示connected，也只证明合成记录所列的课次值；答复准确给出该值并用一句自然短语说明是模拟记录、真实学校尚未核验，是有用且有边界的回答。只裸报教室名/数值却不说明模拟范围，会让用户误当现实已确认，属于可补的来源缺口；“只要教室名称/简短回答”不授权删除这种会改变事实含义的限定，也不要求一大段免责声明。answerCoverage.syntheticRecords只标出地点/标题是否逐字出现，true不证明来源已经交代，但报“完全漏掉记录值”前必须核对。若用户只问课次地点，不自动要求路线或定位；先回答可得课次，赶路问题出现后再核相关位置。没有另一份可用的真实来源时，不能为了不存在的现实确认反复要求等价查询或删掉记录值；若把合成值说成真实官方确认仍报错。' });
  if (hasUnverifiedLocalCampusRecord) observationGuidance.push({ role: 'system', content: '当前实际读取的是campus:local的未认证、非实时legacy_import记录；result.simulated=false不等于记录已经由真实学校账号认证。answerCoverage.localImportedRecords标出记录值是否已出现在答复，并标明institutionId是否为合成夹具。答复可以准确报告该导入记录所列地点、课次和适用日期，同时说明现实学校来源尚未核实；不能把导入值裸称为当前学校正式确认。若能力目录中没有本轮已连接且获准的真实学校来源，不得为了不可取得的现实确认反复要求再读同一导入记录，或让已有记录值从答复消失；应保留可报告值与现实未知。若用户明确要最新真实结果，且确有已连接获准的权威来源，则仍应查询它，不能用本地快照冒充。' });
  if (hasConditionalMapRoute) observationGuidance.push({ role: 'system', content: '当前map_route实际返回conditionalOrigins。reviewConditionalSegments中的candidateOriginId是候选建筑，candidateEntranceId是本次路段实际选中的该楼入口；candidateEntranceRouteConnected=true才证明这处入口在已记录路网中连通。originalPlaceToCandidateConnection=unknown说的是用户原地点到候选入口未知，不是候选楼入口的连通状态。answerCoverage.mapCandidates只标出候选名称/分钟数字是否已逐字出现在回复，true仍须检查入口前提和未知连接。核缺口前逐句回读完整reply：若已经说出某个候选楼自身入口、已知X–Y分钟、原位置到入口及进目的楼的时间未知、因而无法保证从当前位置赶上，并问决定性楼号/出口，已交付可用部分；不能又把这些已说出的内容写进needed当成待补。已知分钟在剩余窗口内，不证明未知两段也能走完，不要求固定句式另说一次“条件可行”。只说“如果人在候选楼里”而不限定入口，或把该入口冒作原楼出口，仍可能遗漏关键条件。' });
  if (hasReadyMapRoute) observationGuidance.push({ role: 'system', content: '本轮map_route的ready只证明实际返回的已记录入口间路段。先对照original、获准前情、工具结果的from/to和reply中的方向：问“进入某楼侧门是否更近”时，该楼是待比较到达端；除非原话明确说从那栋楼出发，否则只查该楼→另一楼的反向路段、再说没有原路起终点，不算交付原比较。反向距离即使数值相同，也不能将方向默换。可在已讨论另一候选的前提下重新查“另一候选→该楼”并作条件答复；真实有多个会改变结果的候选才问一处区别，不把候选当实际人位置。若问题提及一个尚未在观察里找到稳定入口身份的侧门，答复给方向正确的已知入口间路线与来源，并明确侧门是哪一个、开放与否及是否更近仍未知，就是有边界的帮助；不能为了当前证据不存在的侧门距离或替代路段反复报repairable。若实际观察确有可对应的侧门ID和可比较路线，仍须核对，不把所有侧门永久视为未知。' });
  if (observedRows.some(observation => observation.tool === 'map_search' || observation.tool === 'map_route' || observation.tool === 'map.relations'))
    observationGuidance.push({ role: 'system', content: '当前纠正若撤回了某个候选起点，其他尚未选定的地点不会自动成为新的实际出发点；搜索结果中多个相似建筑也不证明用户已经选中其中一处。若用户只问目标楼侧门而本轮没有确认的出发点或侧门身份，准确交付目标楼已知入口及其缺口、问一个决定性位置即可，不要求挨个尝试其余候选建筑或把入口节点当建筑ID。用户明确改从另一处出发时，才针对那一处核当前路网及未知连接。' });
  if (Array.isArray((input.hostState as any)?.knownDiscussionPlaces)
    && (input.hostState as any).knownDiscussionPlaces.length
    && Array.isArray((input.hostState as any)?.capabilityDirectory?.items)
    && (input.hostState as any).capabilityDirectory.items.some((item: any) => item?.connected && ['map.search', 'map.route', 'map.relations', 'map_search', 'map_route'].includes(item.name)))
    observationGuidance.push({ role: 'system', content: '若当前用户具体问到某栋楼的侧门/入口，且当前范围有已连接地图能力，核答复是否先交付能查到的入口事实或诚实说明这项资料尚未核实，再问真正决定比较的起点/参照。只问“和哪儿比”却不说门的证据边界，也没有尝试已许可的一次相关查询，属于可在本轮补的遗漏；不能要求为了此事穷举所有其它候选起点。当前更正撤销旧地点时，hostState.knownDiscussionPlaces中的旧索引也不能覆盖原话。' });
  if (hasUnknownMapRouteWithOtherOptions) observationGuidance.push({ role: 'system', content: '当前只有某一对已讨论地点的map_route返回unknown_entrance/unreachable，而宿主同范围事项还有其他带稳定地点ID的候选。该失败不能被概括成所有候选之间都没有可用条件路段。若当前原话仍在比较这些候选、没有明确排除其他候选，可用已连接路线工具至多补查两对相关地点；实际有路才交付条件结果，不能编数字或说用户就在候选处。若用户明确限定只比较失败的这一对、或排除了其它候选，准确说明这一对未知即可，不强求无关路线。' });
  if (hasConditionalMapRelation) observationGuidance.push({ role: 'system', content: 'map.relations的conditionalRoutes须按实际from、estimateMinutes与originConnection解读。answerCoverage.mapRelations记录候选是否有稳定from.id，以及其名称和分钟数是否已在reply出现；它是核读提示，不自动判通过。若from.id不存在，不能从一条旧条件区间凭空造出满足新入口限制的替代路线。若from.id存在且答复已经给候选入口后的分钟区间、当前原位置到它及目的楼内耗时未知、全程能否赶上未知，就不要重复要求这些已说内容或不存在的原楼出口时长；尤其不能把3–5分钟小于13分钟误写成整条路已保证。只有真实漏掉可用候选、错误认定用户在候选处或作无依据保证，才报实质缺口。' });
  const reviewHostState = input.hostState as Record<string, unknown> | undefined;
  if (Array.isArray(reviewHostState?.reviewRouteCandidates) && reviewHostState.reviewRouteCandidates.length) observationGuidance.push({ role: 'system', content: 'hostState.reviewRouteCandidates是宿主在本轮已允许的当前事项选项之间，用本地公开路网有界计算出的**可查询条件路段机会**；它们不是用户实际起点，也不是主助手已经读取的工具回执，更不保证侧门或当天开放。先核本轮原话是否仍在比较其中一对、是否明确排除某选项：未排除且问相对路程时，主答只因侧门身份/本人位置未知就不查任何相关路线、要求用户重给已知候选，是可补的取证和帮助缺口，应请主助手实际用路线工具核证后有条件交付；不能由这份review-only提示直接替助手报成功或数字。明确只限入口未知的一对/排除候选时，不强迫用别的对凑路线。' });
  const conversationContext = reviewHostState?.conversationContext as Record<string, unknown> | undefined;
  if ((!Array.isArray(reviewHostState?.knownDiscussionPlaces) || reviewHostState.knownDiscussionPlaces.length === 0)
    && Array.isArray(conversationContext?.history) && conversationContext.history.some((message: any) => message?.role === 'user')
    && observedRows.some(observation => observation.tool === 'map_search' || observation.tool === 'map_overview')) observationGuidance.push({ role: 'system', content: 'knownDiscussionPlaces为空只说明本轮没有结构化work选项锚点，可能是主体/来源限制；它不抹去hostState.conversationContext.history中**已经合法准入的同一对话用户原话**。当前若问先前路线或相对路程，先读那些用户原话是否明说了两个相关地点/选项映射：有具体名称且未被本轮纠正/排除时，可让主助手用当前获准的map_search核稳定ID、再用地图工具求条件路段，不该先要求用户重报现成的起终点；只有确实没有可唯一对应的地点或用户限制只看本条时，才问一个决定性区别。不得因这条提示扩大work:self、画像或设备定位，也不把旧候选认作人的实际位置。' });
  if (hasReadyMapRoute && Array.isArray(conversationContext?.history)
    && conversationContext.history.some((message: any) => message?.role === 'user')) observationGuidance.push({ role: 'system', content: '若用户指代“刚才那段”而旧助手的完整路线文字因来源范围未进入本轮，不能假称确切记得过去答过什么；但主助手本轮若已从获准用户前情重查到一对相关地点的ready路线，也不能同时说“完全对不上起终点、请从头重报”。可把当前实际求出的路段明确限定为“若你指这对候选”，交付其已知范围和侧门未知；用户若另有所指，只请其指出区别。若合法前情确有两个同样可能的路线且会改变结论，可以先问一处关键区分，不强行指定一对。绝不可把重新计算冒充旧历史回执，也不把候选当实际人位置。' });
  const currentMatter = conversationContext?.currentMatter as Record<string, unknown> | undefined;
  if (typeof currentMatter?.nextStep === 'string' && currentMatter.nextStep.trim()) observationGuidance.push({ role: 'system', content: '宿主已向主助手提供一个当前事项的具体nextStep。仅当本轮原话确实要求继续该事项、且该步仍适用时，先核reply是否**实际交付**这一步；只问用户要不要核原步骤或要不要转做附带处境，不能代替已知下一步。用户明确撤销、更改优先级或有真实歧义时，不强迫旧步骤。已给出准确结果后的可选后续问句则不抹去已完成的事实。' });
  if (Array.isArray(reviewHostState?.inspectedActionFinalStates) && reviewHostState.inspectedActionFinalStates.length) observationGuidance.push({ role: 'system', content: 'hostState.inspectedActionFinalStates是宿主在本轮最后从同一scope重新读取的、仅限已inspect动作ID的实际终态，不是助手自报。若用户明确停止唯一未派发的已批准动作，且已核该动作没有外部效果，终态仍approved/awaiting_approval时，只答“以后不做”或“我会停止”不算执行停止；应标repairable并要求真实取消状态。若终态cancelled且回执限定本地未派发，不再要求撤回不存在的外部效果。用户只问状态或暂缓本轮而未撤既有批准时，也不能为求安全擅自取消。' });
  if (hasUnknownMapRouteWithoutCandidate) observationGuidance.push({ role: 'system', content: '当前map_route对原地点实际返回unknown_entrance，from.entrances为空且conditionalOrigins也为空：本次观察没有可报告的候选入口路段。用户说自己在一个宽泛片区，不等于已给具体可路由的楼门；不能仅因地点搜索或地图能力存在，就要求对这同一缺入口的原地点再算数字。答复如实说明无法判断全程并问具体楼号/出口，已完成可做部分。若另有独立、已准入且相关的真实路线观察，仍须使用。' });
  if (reviewHostState?.writingOnly === true) observationGuidance.push({ role: 'system', content: '本次核验的是对外稿件的实质完成与披露边界，不是可选润色。permittedMaterial.allowedFacts限定可写出的事实；符合受众的普通称呼、自然过渡、标题或主题范围说明，若没有新增事实、私人原因、承诺或误导，不因它们未逐字列在allowedFacts中就报missing或contradiction。“只用可公开内容”“仅保留学术内容”等披露范围不自动等于禁止这些正常写作结构。若原请求或获准的purpose/tone明确要求纯正文、禁止称呼/元说明、指定格式，则须遵守，违反这一明确要求仍是实质缺口。遗漏所需内容、泄露私人信息、虚构结论、错误限定事实强度或谎称已发送仍须阻断；已有正文不免除这次必要审阅，也不能把未通过审阅的稿件当成已交付。' });
  const value = await structuredResult({ schema: groundedReview, tool, complete, signal, failureCode: 'review_incomplete', failureMessage: '答复还没完成必要核查，请重试。', options: { thinking: 'enabled', maxOutputTokens: 16384, phase: 'completion_review' }, messages: [
    { role: 'system', content: 'hostState.presentedContent由本轮实际成功发布回调记录，parts是真正已在原生画面给出的助手帮助、公式、必要图形或局部初态，不是主助手自报已经完成，也不是只有opaque SceneRef的目录。把这些实际内容、拟发正文和工具观察一起核对原请求；所需的实质解释已在纸上给出，就不要求再有一份交差正文、重复朗读整段帮助或重读同一页。继续独立判断其中的数学、对象、来源和实质遗漏；显示不等于正确、已读、采用、掌握或执行。retainedLearnerLines/lines仅证明这些原行地址仍在本次纸面，不给出其正文或独立正确性。currentStudy与currentInteractive是主助手本轮已合法准入的真实引用/局部假设，不是新本人事实；program初态不替代用户后来调整并实际传回的currentInteractive.inputs。contentCoverage只覆盖所列投影，partial/gaps、references_only、空内容不证明全部要求完成；未转送某个来源正文也不证明画面未交付，仍看实际观察，不为补回不存在的遗漏而空转。校园UI-only行没有经此入口读给你，不得据它补造原数据。' },
    { role: 'system', content: '把拟发正文与实际已发布的内容合起来判断交付：observations中成功的present_view回执及其真实sceneRefs，表示对应画面已随本轮工具调用交给用户，不是尚待生成的候选。数据画面已经清楚展示的时段、记录或表格无需在正文逐项复抄；简短结论、关键差异与影响答案的限制可以完成回答，也不因最终正文候选被重写就要求重复查询或重建同一画面。availableScenes、目录、未呈现的引用或失败回执则不证明画面已经交付。创作、教学或稿件仍须有真正可读的所需内容，正文或实际发布的画面均可承载，空卡片和候选菜单不能替代作品；用户明确另需纯文本、可复制全文或导出内容时仍须满足；仅要求完整覆盖记录，可由实际画面满足，不强求第二份数据正文。成功呈现不证明用户已读、接受方案或业务动作成功。继续核对实际对象、日期、来源和覆盖是否答到，真实失败与实质遗漏照常报告；不要仅因省略重复数据或未逐项列出无关权限边界而要求修复。' },
    { role: 'system', content: 'hostState.conversationContext仅包含主助手已经合法取得的当前对话前情与事项，不是新的读取或授权。结合它和实际观察理解省略的主体、对象与范围；短答沿用当前话题不自动成为全局或永久承诺。已执行限制的简短确认不必逐项复述全部后台限定、时间戳或不相关例外。只有原话中的实质要求未满足，或答复明确越过实际对象/期限/渠道/结果时才报缺口；不能仅因还可以写得更严密而要求反复改写。历史助手解释不是真实动作回执，当前明确纠正仍优先。若currentMatter已有明确、仍适用的nextStep，先看该步是否完成；“在路上”等附带处境本身不建立同等优先的新任务。对唯一已知话题的接续，接住原选择并给一个具体、可回答、其答案能改变下一步判断的问题，或者直接作一项有依据的比较，任一方式已能继续当前回答型请求；不要同时强求问题、选项列表和比较。仅让用户选择接下来谈哪个阶段，且没有任何会改变判断的条件或比较，仍是抽象菜单。确有两个同等可能的旧事项时，允许问一处关键区别。' },
    { role: 'system', content: '用当前时区与前情核对相对日期；若“周日18点”在本轮唯一指向已有截止，不因答复省略年份就判矛盾。用户要兼顾自愿休闲与已接受承诺、却未委托详细排程且工作量未知时，说明已知截止、可选地问剩余工作或提供轻量检查即可；不强求先读所有日程、规定多日固定时段，或把娱乐设为必须先完成工作的奖励。若答复实际上把这些时段和先决条件强加给用户，应报实质参与缺口。' },
    { role: 'system', content: 'hostState.conversationContext.recentObservations若存在，是宿主已经按当前范围提供给主助手的同对话前情与外部观察，附原来源与时间，不是这次核查新增读取。可用它核对“曾发生一次参与”等可观察事实；不能据参与推断动机、满意度、长期偏好、同一具体活动或后续授权。主助手谨慎说“记录显示参加过一次，但不确定是否同一件事、感受未知”有来源依据；若该数组为空，不可把未提供的观察当已知。关联未知时，主答可以沿用户原本未定的一次探索与长期选择作有条件比较，或问一个答案会推进**原选择**的关键问题；“这次体验之后”与泛观察出现在同一答复，不自动等于断言观察属于该具体活动。若是否同一活动决定下一步是首次体验还是体验后再试，问这处关联，或只沿一个明示的条件分支问具体体验中影响再试/停下的因素并保留另一情形未知，都可以继续；不能强求每次先做身份确认或把两条分支都写全。反过来，只给出没有已知候选/成本依据的另一套新二选一、既未核活动关联也没沿原本未定之处继续，就算话术尊重自主，仍可能是接续缺口。须看完整答复是否真的声称同一、推断满意或扩权；明确说关联未核实并问一个有关具体体验或选择的可答问题时，不要因没有活动ID或缺少完整选项列表反复要求改写。完全不接住已知探索、只要用户从头重讲，同样是缺口。' },
    { role: 'system', content: 'hostState.conversationRetention.status=active是宿主在本轮模型调用前已安装的对话保存控制；其中endCleanup.status=registered表示指定结束条件触发时的聊天清理已登记，由实际退出/重启流程负责。确认“本段不保存、离开时清理”有这个宿主状态即有依据，不要求另造删除工具回执，更不能要求现在提前删除来满足将来条件。completed=false时不得宣称聊天已经清除。独立已确认业务与聊天正文分开。' },
    { role: 'system', content: 'host_state_change只证明与先前观察相比版本发生变化，不证明是谁改的、是否发生在本轮。核对“本轮我没有改动某项”时看本轮动作与写入回执；不能拿用户自己或其他流程已经做的修改当成助手写入的证据。相反，助手声称自己已修改时，宿主发现版本差异也不能代替相符的本轮成功回执。' },
    { role: 'system', content: '用户先说“暂不提交、只讨论”仅限制本轮派发，不自动撤销一个既有批准；不能为表现谨慎而多做取消。后来若明确表示唯一尚未派发的步骤不再要、自己接手，且inspect_action证实原动作仍approved且无提交回执，须核实取消后的实际状态；只答“我以后不做”但批准仍可执行，是可补的未完成。取消未派发批准只改本地待执行状态，不等于撤回外部已发生结果；已经派发则分别停止未派发部分并核查接收端，不可假称撤回。' },
    { role: 'system', content: '用户仅要求比较两项可能的操作而禁止当前执行、没有要求核实实时状态时，答复应分开说明各项的可用能力、已准入前情能支持的批准/结果范围、可逆边界及本轮没有写入；只复述对象名称而不说明差异可补。旧批准只能说是当时记录，现在是否另有提交可保留未知；不应仅为了概念比较要求读取私人动作或因读用途拒绝而反复要求同一读取。用户随后明确要求核实是否提交/停止待执行步骤，才按当前用途inspect。没有发生超时或被问到故障恢复时，不强制讲内部动作ID、重试协议或所有异常。' },
    { role: 'system', content: 'actions只含当前回复产生的动作，observations只含本轮及仍合法保留的先前工具观察，不是完整业务数据库。两者为空不能证明旧动作未发生或无法核查。用户要求区分已产生结果和未执行事项时，若相关只读核查能力可用且对象标识可取得，“没有本轮回执、此前助手说法不算证明”仍只是尚未核查，属于原请求的repairable缺口，不能用这句免责声明代替核查，也不能把初始状态当成现状。暂停后续写入不自动禁止这项明确请求中的只读核查；确实缺少权限或通道时再保留未知。' },
    { role: 'system', content: '观察中的requestedArguments是实际传给工具的参数，不是返回事实或授权。用它核对检索对象、时间和筛选覆盖；查错范围得到空结果不算资料缺失，应修正后回答。地图可行性先核**起点关联**：用户自己确认的可路由地点或已讨论的候选才是起点；仅有地图工具连接、一个未绑定的公开地名或设备点，不构成可用起点，答复说明全程未知并问具体起点即可，不能要求无起点查询或编数字。实际地图工具有两种等价字段：map.relations返回conditionalRoutes/estimateMinutes，map_route返回conditionalOrigins/minutes；后者在审阅材料里另有reviewConditionalSegments投影，仅摘录同一工具结果，不证明用户已在候选入口。若当前合法观察确有相关且仍适用的候选入口与已知区间，赶路答复只称“有条件路线”或只问楼号则遗漏可用部分；至少说一个真实候选建筑自身入口、该已知路段区间，并保留原位置到入口和楼内未知。不把邻楼入口冒作原楼出口；只问地点、无相关候选或新入口限制使旧路失效时不强求数字。' },
    { role: 'system', content: '本地日程读取的query只作标题逐字包含筛选；日期范围由from/to决定。用户问某一天或某个时段“有什么安排”时，如果实际query是“周六”等泛时间词，空结果只说明没有标题含这个词的安排，不能证明该日无安排。可用日期范围不带标题筛选重查时，这是可补的实质缺口；已有真正完整覆盖时不要重复查询。' },
    { role: 'system', content: '用户要求给已存在的相对日期事项设提醒时，检查原话、本轮时区与实际日程查询是否一致。当前事项里更晚但尚未选定、没有开始时刻的候选不能替代最近匹配且已登记的具体事项；若实际查询只覆盖较晚候选，空结果不能证明用户所指的近期安排不存在。可按明确的星期或日期范围读取已登记安排以核对后再回答；多个确实相符的已确认对象并存时才询问关键区别，不凭模型猜哪项是用户选择。' },
    { role: 'system', content: '用户后来改变交通方式或排除某入口时，旧路线的时间只在原有起点、模式和入口条件下成立。若被排除入口没有稳定ID，不能凭地图证明旧路已经绕开它，也不能强求模型画出不存在的绕行；答复应说明旧区间是否仍可用于新条件尚未知，再给可用的其他条件路段或询问决定性出口。仅重复旧分钟数和索要楼号、却不说明新限制对旧估计的影响，是可补的实质缺口。' },
    { role: 'system', content: '比较未知入口或路程前，先核本轮已读事项中的hostState.knownDiscussionPlaces：它只给选项ID、标题和地图地点ID，不证明用户在任一候选处。该字段为空时，再看已经准入的同一对话history是否明确把两个相关地点与选项对应；只有名称而尚无ID时可先用地图搜索核定，再计算两点路线，不能直接编ID。当前问题确在追问已讨论的路线、侧门或距离，相关两点能从已准入前情唯一恢复且路线能力已连接时，主答只因缺本人当前位置就拒绝所有比较、也不查可用条件路段，是repairable缺口；不能把“模型还没调用map_route”当成地图没有路线。若前情真正并列谈过两条或更多旧路线，当前“刚才那条”无法唯一对应且会改变答案，只问一处关键区分即可；不要为得到数字先强迫把所有可能路线查完，也不要任选一条冒充用户所指。若同一事项有多个仍相关的地点，一对路线返回入口未知或不可达，不证明其它候选对也无路；用户未排除其他候选且问题在作相对比较时，可有界核剩余相关对并交付确有的条件路段。用户明确只限一对或排除某候选时不能改算它来凑答案。可从已讨论候选出发计算，并清楚说“如果从这里出发”，保留实际当前位置和侧门开放未知。若没有相关的两个地点、候选对都确无可用路段或查询表明不可达，说明未知并问实际起点是合适的；不能把未绑定的公开地名或设备点伪造为候选。只问建筑身份或位置时不强制规划路线。' },
    { role: 'system', content: '“我在家”确认人的角色地点，不自动给出可路由的home地图ID。设备在家、未绑定的公开小区、历史别名都不能代替本人确认。若当前没有home角色绑定、也没有用户已确认的其他起点，答复保留已知课次与来源、说明无法判断是否赶上并询问具体起点，已是本轮可完成的帮助；不要为了数字把公开候选当家或报repairable缺口。后来确认起点时再重算。' },
    { role: 'system', content: '来源和结论按实际声称的强度核对，不要求逐字抄标题。答复明确说“记录列出”或以尚未确认的条件给出估计时，只核对这个受限陈述，不能将其升级为无条件现实保证再报缺口。提供了可用部分并准确说明真实来源未接通时，不为获得当前不存在的现实确认而反复要求相同查询；确无具体可用新来源的剩余确认属于blocked_explained。课程资料等类别概括与来源标题不同不是矛盾；将隔离开发中的合成资料称为测试数据也没有升级其真实性。反之，把合成、示例、过期或局部材料说成真实账号实时核验，或把模拟动作说成实际外部成功，仍必须报出实质升级。' },
    { role: 'system', content: '同一sourceId下的两个查询接口不是两份独立资料。相关时段已经查询且允许的刷新仍返回明确的部分覆盖时，诚实说明“这段尚不能确认”可以完成当前询问；除非实际证据表明另一接口拥有更多时段或另一来源可用，不得仅凭能力目录里还有另一种查询语法，就反复要求等价查询或把有边界的未知判成未答。若答复把覆盖外的空记录断言成现实没有安排，仍须报矛盾；若尚未执行可用的相关查询或刷新且它可能改变结论，仍可报repairable。' },
    { role: 'system', content: 'hostState.imageRequests只属于当前回合及本回合重试；重复出现同一hash不能证明它与此前回合的图片相同。accepted=true表示该版本真实像素已进入主助手请求，prepared_for_next_model_request只是送图前状态。你未收到像素不等于主助手未收到。旧助手的视觉答复不是图像真值，也不能据它否定主助手按当前图片作出的新判断；没有旧图身份时不得猜测两轮图片相同。只有当前真实证据反驳答复或主张越过图像可证明范围时才报矛盾，例如把线条相交当成现实道路连通。传输记录只证明送图，不替代视觉内容理解；路径、caption或map_seen也不能替代实际传输。' },
    { role: 'system', content: '请求类别补充规则：original是当前用户请求，不属于hostState中的参考资料。恢复、回到或接续已存事项，以便继续读取、比较、判断或回答，是answer型上下文恢复，不要求“恢复动作”的业务回执。明确采用或撤销已有事项中的某一方案，则应同步该事项的实际选择；只口头复述、说成既有资料或等待后台人物记忆提取不能代替当前选择记录。普通比较不要求采用，临时不保存范围下只在当前对话保持选择；这都不要求新增日程或外部业务回执。只有真实改变目标、日程、提醒、外发或其他业务状态才是action。若已有请求记录误标为action，用当前原话basisQuote修正为answer；答复已完成恢复后的实质判断时标answered。缺口只在同一轮继续使用现有工具/资料能够补齐时标repairable。外部发送通道、账号、权限或服务未连接，且答复已明确说明没有执行、实际阻塞和已保留的可用结果时，标blocked_explained；它保留未完成状态，但不能触发重复尝试或要求模型制造成功回执。' },
    { role: 'system', content: '能力目录若标matchingOnly或有分页，省略项不是不存在的证明。单项工具supportsCancel=false只证明它不能原生取消；若答复断言全部连接器或所有外部渠道都不能取消，应报无依据的范围扩张。已派发动作先按inspect确认真实后果，未派发部分停止；没有当前已知、已连接且获准的取消能力时，答复限定“这项工具不能在此撤回，其他渠道未核实，已提交结果尚无取消回执”即可，不要仅因筛选目录可能遗漏别的工具而要求继续搜索或声称存在可执行取消步骤。用户已表示自行接手时尤其不应制造新的外部动作；若确有具体可用的取消能力与授权，再按其真实合同处理。' },
    { role: 'system', content: '核对原话、实际工具观察、宿主动作回执与拟发答复。检查明确请求是否真正答到或办成、最新纠正是否改变判断、禁止动作是否仍未执行、失败/未知是否诚实、未来提醒是否有实际渠道。不能信答复自报成功，action请求必须对应参数相符的成功回执。manage_goal的confirmed_success回执若同时给出relatedAttention.coverage、remainingQueuedOrLeased=0和remainingActiveWatches=0，就证明该稳定goal_id关联的本地提醒/watch已停止；不能因它不是普通日程Action回执而否认。hostState中的目录是宿主提供的能力说明；搜索结果只覆盖匹配项，没出现在某页中不能证明能力不存在。区分能力存在、连接状态、本轮操作许可和动作已经发生；目录不证明动作完成。hostState.availableDrafts是宿主在当前权限内确认存在的既有成稿元数据；发送通道未连接时不强求再生成一份稿，但答复不得声称稿件不存在或要求用户重贴，应说明未发送并保留已有草稿。若hostState.requireReleaseArtifacts=true，用户实际要求的新对外稿件须有hostState.releaseArtifacts或prepare_release回执；宿主会把成稿原样附在主回复后，应连同成稿判断是否交付，不要求主Agent复写正文。主回复自行写出的对外文稿不能代替独立成稿。只请求私下讨论/说明或当前通道未连接的发送请求不强求新稿。若hostState.writingOnly=true，则本次本身是成稿核验，不需要另一份成稿回执。只报告实质问题，禁止扩张用户目标或按个人风格重写答复；不要将合理简短回答判为缺详细解释。missing.quote必须逐字来自original；没有实质缺口就返回空数组。requests只更新输入提供的请求ID，不自造ID。请求记录在本次核验完成前保持pending/resultRefs为空是预期事务顺序：若实际回执已证明完成，应在requests返回succeeded及actionIds，让宿主随后原子收尾；不得同时把“记录尚未同步”报作missing或contradiction，否则会形成无法完成的循环。原请求类别也是模型提案：私下说明是answer，交付草稿是artifact，实际登记/发送才是action；类别误判时给kind及该请求的逐字basisQuote。成稿引用artifactIds并标answered，业务操作引用actionIds及成功回执，不能用稿件冒充发送回执。调用指定工具提交。' },
    ...observationGuidance,
    { role: 'user', content: JSON.stringify({ ...input, observations: admittedObservations, answerCoverage }) },
  ] });
  for (const gap of value.missing.filter(gap => gap.disposition === 'blocked_explained')) value.blocked.push({ quote: gap.quote, reason: gap.needed });
  value.missing = value.missing.filter(gap => gap.disposition === 'repairable');
  const replyClaims = value.missing.filter(gap => !input.original.includes(gap.quote) && input.reply.includes(gap.quote));
  value.contradictions.push(...replyClaims.map(gap => gap.needed));
  value.missing = value.missing.filter(gap => !replyClaims.includes(gap));
  if (value.missing.some(gap => !input.original.includes(gap.quote)))
    throw new HarnessError('review_evidence', '核查未能对齐原话，不能据此扩大任务。');
  return value;
}
