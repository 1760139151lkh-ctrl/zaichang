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
      { role: 'system', content: "这是一段长交流中的一个片段，想请你帮忙看看其中明确提出的需要有没有被finalReply接住。focusedSegment是你这次照看的部分，finalTail让你知道后来有没有撤回或改口；已经改变的早期动作按新意思理解，独立仍在的问题也值得留下。长话分开读是为了照顾中间容易漏掉的需要，答案的依据可能在别的片段，所以这里只把与本片段明确相冲突的内容记作contradiction。重复背景与没有要求回应的叙述可以自然留在背景里。若真有遗漏，在missing.quote保留本片段的连续原文，说明补上什么会有帮助；已经妥当时数组为空即可。report_segment_gaps会把你的发现交回伙伴，措辞、详略和声音仍由他自己决定。" },
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
      if (!fromOriginal && !fromReply) context.addIssue({ code: 'custom', path: ['missing', index, 'quote'], message: '这段引文还没在original里找到，可以沿那段连续原话再看一眼。若问题是答复缺乏依据，contradictions可以容纳这个发现。' });
      if (/无实质遗漏|没有实质遗漏|没有需要补|无需补充/.test(gap.needed))
        context.addIssue({ code: 'custom', path: ['missing', index, 'needed'], message: '这条needed说已经没有实质遗漏，与repairable的意思不一致；可以结合完整答复再判断一次。' });
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
  if (hasSimulatedCampusRecord) observationGuidance.push({ role: 'system', content: "这次校园结果的 simulated=true 表示它是模拟记录，sourceId 的名称和 connected 状态并不改变这个来历。记录里可读到的课次和地点仍有用，请结合完整回答看看，伙伴是否把它们当作这份记录的内容，而没有让人误会成真实学校刚刚确认的结果。answerCoverage.syntheticRecords 只是帮你找到已经出现的地点和标题，不替代对整句话含义的判断。对方只问教室时，课次与来源可能已经答到了；路线和定位可以等真正涉及赶路时再考虑。眼前若没有另一份真实来源，重复读模拟记录不会带来现实确认，也不必让已有的值从回答里消失。" });
  if (hasUnverifiedLocalCampusRecord) observationGuidance.push({ role: 'system', content: "这里读到的是 campus:local 的 legacy_import 资料，live=false、authenticated=false 描述了它的来历；simulated=false 本身并不说明它来自当前学校账号。answerCoverage.localImportedRecords 帮你定位回答里已有的值，也标出了是否来自合成示例。伙伴可以讲清这份导入资料列了什么和适用的日期，现实中的最新情况则看是否另有当前可读的学校来源。对方确实要最新结果、来源也可用时，那一步值得完成；没有这条路时，保留已有信息和实际未知，比重复读同一份资料更有帮助。" });
  if (hasConditionalMapRoute) observationGuidance.push({ role: 'system', content: "这份路线有 conditionalOrigins：candidateOriginId 是候选建筑，candidateEntranceId 是这次实际采用的入口，candidateEntranceRouteConnected 描述该入口与已记录路网的连通。originalPlaceToCandidateConnection=unknown 则是人原先的位置到这个候选入口还不清楚，两者是不同的一段。answerCoverage.mapCandidates 仅标出名字和分钟数有没有出现。请看看完整回答有没有把真实候选入口、已知区间与两端仍未知的路程说明白；已经做到的部分可以留下。比如入口后的3–5分钟小于剩下13分钟，仍不足以保证未知的前后两段也来得及。反过来，入口后那一段确实可算，就值得交给对方，不必再用另一套固定句式重复说一遍。" });
  if (hasReadyMapRoute) observationGuidance.push({ role: 'system', content: "map_route 的 ready 描述的是 from 到 to 的已记录入口间路段。请顺着对方的原问题看方向：要比较进入某楼的侧门，那栋楼是到达端；反向距离即使碰巧一样，也未必回答了同一个问题。已讨论的候选可以作为有前提的起点，人实际在哪儿则另看原话。侧门身份或开放情况确实未知时，方向正确的已知路线仍能提供帮助。若资料里已经有可对应的侧门ID和比较路线，就值得真正读到它；若没有，重复要求一个不存在的距离也无助于这次判断。" });
  if (observedRows.some(observation => observation.tool === 'map_search' || observation.tool === 'map_route' || observation.tool === 'map.relations'))
    observationGuidance.push({ role: 'system', content: "对方最新的纠正可能已经放下一个旧起点，其余候选不会因此自动变成他所在的地方。搜索里的相似建筑和入口节点也各有身份。问到某栋楼的侧门时，可以先看看已经可知的入口，再判断缺少的起点或参照究竟会改变哪一部分比较；一个决定性的区别往往就够了。对方明确换了出发点时，再沿那个点看当前路线。这样既接得住纠正，也不用为了得到一个数字试遍所有楼。" });
  if (Array.isArray((input.hostState as any)?.knownDiscussionPlaces)
    && (input.hostState as any).knownDiscussionPlaces.length
    && Array.isArray((input.hostState as any)?.capabilityDirectory?.items)
    && (input.hostState as any).capabilityDirectory.items.some((item: any) => item?.connected && ['map.search', 'map.route', 'map.relations', 'map_search', 'map_route'].includes(item.name)))
    observationGuidance.push({ role: 'system', content: "当前范围里有地图能力，也有已讨论的地点。对方具体问侧门或入口时，值得看看伙伴有没有把现在能读到的入口信息交给他，再问真正影响比较的起点。完全还没尝试相关读取就只问和哪儿比，可能留下了眼前可做的帮助；确实读不到的那部分则可以如实留白。这不需要穷举所有出发点。knownDiscussionPlaces 是旧讨论的线索，仍随对方当前的纠正理解。" });
  if (hasUnknownMapRouteWithOtherOptions) observationGuidance.push({ role: 'system', content: "这里是一对候选地点的路线没有取得，而同一件事还有别的、带稳定地点ID的候选。一个组合的 unknown_entrance 或 unreachable 还不能说明其余组合也相同。若原问题确实在比较这些候选，最多再看看两对相关路线，可能就有实质帮助；真正取得哪段，再讲哪段。对方若只关心失败的这一对，或者已经排除了其它地点，就照顾那个范围，保留实际的未知即可。" });
  if (hasConditionalMapRelation) observationGuidance.push({ role: 'system', content: "map.relations 的 conditionalRoutes 描述 from、estimateMinutes 和 originConnection。answerCoverage.mapRelations 帮你找到已有的地点、分钟和稳定ID。没有 from.id 的旧区间，还不足以构成符合新入口要求的替代路线。有真实候选入口、已知区间且回答已经说清两端未知时，那段帮助已经在了；例如3–5分钟小于13分钟，并没有因此保证全程来得及。值得指出的是确实漏掉的可用路段、误把候选当作人的位置，或超出材料的保证，而非换一种话重讲相同条件。" });
  const reviewHostState = input.hostState as Record<string, unknown> | undefined;
  if (Array.isArray(reviewHostState?.reviewRouteCandidates) && reviewHostState.reviewRouteCandidates.length) observationGuidance.push({ role: 'system', content: "hostState.reviewRouteCandidates 是在当前事项的公开路网里算到的可查询机会。它让你知道可能还有哪段值得读，却不是主助手已经读过的结果，也不说明人真的在那里或侧门当天开放。若对方仍在比较那两个候选，伙伴只因缺少本人位置便放弃全部比较，可能遗漏了一项可以实际求证的条件路线。你的反馈可以指出这个机会，让伙伴沿原工具真正读到它；具体数字和成功结果仍来自那次读取。原话已经排除的候选就保留在过去。" });
  const conversationContext = reviewHostState?.conversationContext as Record<string, unknown> | undefined;
  if ((!Array.isArray(reviewHostState?.knownDiscussionPlaces) || reviewHostState.knownDiscussionPlaces.length === 0)
    && Array.isArray(conversationContext?.history) && conversationContext.history.some((message: any) => message?.role === 'user')
    && observedRows.some(observation => observation.tool === 'map_search' || observation.tool === 'map_overview')) observationGuidance.push({ role: 'system', content: "knownDiscussionPlaces 为空时，同一对话里已经允许读到的用户原话仍可能包含两个地点及其关系。请看看 conversationContext.history 是否真的留下了可唯一对应的名称；若有，伙伴可以沿当前地图搜索找到稳定ID，再求有前提的路段。索引没列出与人从未说过不同。来源范围仍是这次已给出的范围，旧候选也仍是候选。若地点确实无法对应，或对方只想谈本条文字，一个会改变答案的问题就能继续。" });
  if (hasReadyMapRoute && Array.isArray(conversationContext?.history)
    && conversationContext.history.some((message: any) => message?.role === 'user')) observationGuidance.push({ role: 'system', content: "旧助手那段完整路线可能没有进入本轮，但获准的用户前情有时足够让伙伴重新查到同一对相关地点。重新算出的 ready 路线是真实的新结果，可以按对这对候选的理解交给对方；它并不证明逐字记得以前说过什么。两条同样可能的旧路确实会导向不同答案时，一个关键区别也许更合适。请同时照顾这两个事实：缺少旧原文与眼前有了新结果，避免让对方为已经能恢复的信息从头讲起。" });
  const currentMatter = conversationContext?.currentMatter as Record<string, unknown> | undefined;
  if (typeof currentMatter?.nextStep === 'string' && currentMatter.nextStep.trim()) observationGuidance.push({ role: 'system', content: "这里已经有当前事项的具体 nextStep。若对方确实想继续这件事，而那一步仍适用，请看看伙伴有没有真正接着做；只再问要不要做，可能还没接住已有的托付。对方改了方向或优先级时，当然按眼前的意思来。已经给出实在结果后的可选下一问，也不会抹去完成的部分。" });
  if (Array.isArray(reviewHostState?.inspectedActionFinalStates) && reviewHostState.inspectedActionFinalStates.length) observationGuidance.push({ role: 'system', content: "hostState.inspectedActionFinalStates 是本轮最后沿同一范围读到的动作状态，只包含已经 inspect 过的对象。对方明确放下唯一未派发的批准，而状态仍为 approved 或 awaiting_approval 时，口头承诺停下还没有改变待执行的那一步；取消它会把决定落到实际状态。若已经 cancelled 且原本没有外部效果，这件事就已停妥，不需要另撤回一个从未发生的外部结果。只是问现状或暂缓这一轮的情形，则保留对方原来的意思。" });
  if (hasUnknownMapRouteWithoutCandidate) observationGuidance.push({ role: 'system', content: "这次原地点的路线确实是 unknown_entrance，from.entrances 和 conditionalOrigins 都为空，因而没有这次可报告的候选入口路段。宽泛片区与具体可路由的楼门还有一段差别。伙伴说清全程暂时无法判断，再问影响路线的楼号或出口，已经可以接着帮忙；对同一份缺入口资料重复算数字不会增加信息。若同时还有独立、相关且可读的其它路线，则一起考虑它。" });
  if (reviewHostState?.writingOnly === true) observationGuidance.push({ role: 'system', content: "这次你在帮忙看一份对外稿。permittedMaterial.allowedFacts 列出了可以讲给这个受众的事实；称呼、自然过渡和标题可以让文章像一封真正的信，只要没有额外带出私人原因、承诺或事实。对方确实指定纯正文、格式或特定语气时，那也是这份稿子的需要。重点看看所需内容是否到了、隐私是否仍妥当、结论有没有被写得过强，以及稿件完成与实际发出有没有混淆。已经写出了正文，也仍值得这一眼认真阅读。" });
  const value = await structuredResult({ schema: groundedReview, tool, complete, signal, failureCode: 'review_incomplete', failureMessage: '答复还没完成必要核查，请重试。', options: { thinking: 'enabled', maxOutputTokens: 16384, phase: 'completion_review' }, messages: [
    { role: 'system', content: `你在帮一位伙伴看一眼这次交流是否真正照顾到了对方。这里有对方的原话、伙伴已经说出或准备说的话，以及实际读到的资料和做成的事情。希望你带着自己的判断看看：有没有重要的问题漏下了，有没有把猜测说得太确定，有没有答应的事情还没办成。伙伴的性格、亲昵、幽默、详略和自然措辞属于这段关系；你的帮助是发现会改变结果的实质问题，而不是替他重写声音。已经妥当的地方可以安心留下，反馈里也可以没有问题。

这段交流可能散在正文、图、表和可操作的作品里。hostState.presentedContent 来自真正发生过的画面发布，parts 是画面里已经给出的解释、公式、图形或局部初态；成功的 present_view 与 sceneRefs 也记录了画面送出的事实。把这些和正文一起读，会比只盯着最后一段话更接近对方实际收到的帮助。表格里的完整记录不必又抄进正文，已经能读的教学或作品也不必再交一份同样的文章。对方另要纯文本、全文或导出时，那份需要仍在。目录、availableScenes、未发布的引用和失败记录只是线索；空卡片也接不住需要实际内容的创作。显示出来与内容正确、对方看过或接受、日程已经改变，分别是不同的事。

画面的内容说明也有自己的范围。contentCoverage 的 partial、gaps 或 references_only 描述了你实际能看到多少；retainedLearnerLines/lines 保留的是原行地址，单凭地址还看不到题解。currentStudy 与 currentInteractive 是这次真正带来的引用和局部试放，program 初态与对方后来调过并传来的 currentInteractive.inputs 各有时间。校园界面里有些记录只给了用户看，未送到这里；你可以承认那次发布，具体数值仍以已提供的材料为依据。

对需要随输入和时间变化的作品，parts 中的 sound、press、motion 保留了实际发布的配置，可以帮助辨认触发、持续与停止之间是否自洽。按键或滑杆的名字不能替代这些关系；初态有图不证明后续联动，声音配置也不证明设备已经发声。已能判断的声明矛盾与确实缺少的运行观察，分别保留各自的依据。

hostState.conversationContext 是伙伴这次已经读到的前情。它能帮你理解省略的主语、刚才的选择和正在继续的事；新的明确纠正比旧的解释更贴近眼前。后来澄清了一件事，与伙伴曾经误读或误记，也是不同的事实；声称自己以前犯过某个具体错误时，同样看看当时的原话，普通关心或歉意则由伙伴自然表达。currentMatter 若有仍适用的 nextStep，就看看这一步有没有被接住。一个有依据的比较，或一个答了就能推进原选择的问题，都可能是合适的接续，没必要同时索要选项表、完整比较和一串问题。让人重新讲已经知道的事、或者换成一套无根据的新选择，才容易把原来的事丢下。附带说自己在路上，也可能只是更新处境。时间、指代或事情身份真有会改变答案的歧义时，留一个有用的问题就好。

hostState.replyPublication 则是当前同一条回复的现场来历。previousCandidates 按先后保留了续改前实际发表过、后来被替换的末段，state=superseded_tail表示它已不在当前正文里；publication里的范围与partial说明这次带来了多少，exposure=unknown没有表示对方已经看过。旧片段可以帮助理解“刚才漏了”或后来改口的来由。原请求需要留给对方阅读的内容，仍看当前reply和真正保留的画面；只在被替换的旧片段里出现过，还没有留在当前成稿。旧稿也不会额外增加一份交付要求。没有带来的片段仍是未知，仅凭缺页不能断定伙伴从未说过；具体事实继续与实际原文和观察对照。

分页材料有原页地址和读取顺序。conversationContext里的campusReading是伙伴已经收到的这类导航，标明原回复、实际页范围与固定条件；它没有替伙伴读取新页，也不证明对方已看。核对“这页里的第一项、第二项”这类相对指代时，先把原话、最近原回复和对应页地址对上，再看答复是否用了那页真实提供的对象与数值。较早页的同名序号不能替代后来正在讨论的页；整份列表的顺序与页内顺序也各有含义。当前原话明确换页或另指对象时按新指向理解。资料不足以认清时留下具体缺口，不从旧页找一个看似能比较的答案。

前情中的 recentObservations 带着原来源和时间。参加过一次活动能说明那次参与，动机、满意度、是否就是当前谈的活动、以后还想不想去，则可能仍待理解。伙伴若沿一个说清前提的分支继续谈，已经可能给到帮助；既不需要把每种分支列全，也不需要每次都先追问活动编号。相对日期结合当前时区和你们已知的截止理解，例如唯一对应的周日18点不需要每次重念年份。自愿的休闲与接受过的承诺可以一起照顾，休闲本身不是完成工作的奖赏。若对方没请你们详细排程，已知截止加一个有用的余量问题，通常比代定几天的固定时段更合适。

资料的来历决定了能说明什么。查询参数 requestedArguments 是查了哪个对象、哪个时段、用了什么筛选；查错范围后的空结果，并不能回答原问题。本地日程的 query 只匹配标题，日期靠 from/to；用“周六”筛标题为空，与周六没安排不同。相对日期指向已有事项时，最近匹配、已经登记且有开始时刻的对象，与更晚但尚未选择的候选各有身份。资料确实只覆盖一部分时，有用的已知部分与仍未知的部分可以并存；同一 sourceId 下换一种查询语法也未必带来新资料。判断还值得查什么，看是否真有相关、可用的新来源或刷新机会，而非单看目录里有多少入口。

动作的结果从实际记录里看。actions 是本轮的新动作，observations 是本轮及仍可使用的先前观察；空数组并不是完整数据库为空，也不说明以前没有办过。对方要弄清既有结果，而相应只读能力和对象还在时，值得真正读一读；只说缺本轮回执，可能还没有回答他。动作成功要与对象、参数和成功记录相符；host_state_change 只说明版本变过，谁改的、什么时候改的，还要看对应记录。manage_goal 的 confirmed_success 若同时给出 relatedAttention.coverage、remainingQueuedOrLeased=0、remainingActiveWatches=0，已经说明那个 goal_id 的本地提醒和关注都停下了。目录说明能力，连接说明通道，许可说明这次能做什么，成功记录说明已经发生什么，它们各有用处。

“先别提交，我们聊聊”与“这一步不要了，我自己来”可能意味着不同的决定。前者让这轮先停在商量，原批准是否保留仍按原话；后者若明确指向唯一未派发的批准，实际取消后的状态才接得住他的决定。已派发的部分看接收端真实结果，本地停止与撤回外部结果分别理解。概念比较只需把可做什么、当时批准了什么、已经发生什么和可逆之处解释清楚，未必需要额外读私人记录或展开故障协议。若对方后来要查现状，再按那次需要读。能力目录可能筛选或分页，一项工具没有取消功能只说明该工具的范围；未知的别处渠道既不是全都不行，也不是值得凭空制造的新行动。对方已自行接手时，保留他的决定。

hostState.conversationRetention.status=active 表示这次的聊天保存选择已经生效；endCleanup.status=registered 表示结束时清理已安排。这样的状态可以支持对约定的自然确认，清理实际发生则另看 completed。独立日程与聊天原文各自保留自己的状态。“记住了”也值得放在整句话里理解：接住对方的更正、从此按新情况相处，与声称某项持久记录已经写入并不总是一回事。真正声称已保存到具体地方或已删完时，再核对应结果；自然的承接不需要改成一段数据库状态说明。

对外的稿件和真正外发也各有完成方式。hostState.availableDrafts 是收尾时再次经原所有者核过、当前仍可使用的既有稿件，发送通道暂时不可用时，它们仍然在。draftReferencesAtRead 则保留较早读取时的目录身份，中途的修订或来源变化可能已经改变资格。requireReleaseArtifacts=true 表示这次需要单独准备的对外稿：releaseArtifacts 或 prepare_release 成功后，宿主会把原稿作为本条回复里的独立稿件显示。私下讨论、当前无法完成的发送请求，以及 writingOnly 本身就是成稿审阅的情形，各按眼前的任务理解。permittedMaterial.allowedFacts 给出可以对受众讲的事实；普通称呼、标题和自然过渡并不凭空增加私人事实。实际要求的纯正文、格式或披露范围仍值得认真照顾。稿件有了不等于已经送到别人那里。

releaseSourceQualification 区分旧稿的两种资格：historicalSources 是这次确实提供过的原稿地址，正常事项修订后，仍合法的历史可以回顾、引用和讨论；currentReuse 则是现在继续把它作为成稿依据的复核，qualified=false 没有把旧稿升级成当前资料。rejectedBases 留下这次未通过的原稿与对象版本地址，尚未提供它们的新正文。当前请求若要一份继续采用原稿依据的新成稿，原资格门没有通过后，把同样的新稿移到私下回复里、说没有另存，并没有补齐那份交付，也没有消除原依据的变化。历史回顾仍可成立，怎样与对方交流留给伙伴；这和重新交付当前稿件各有身份。若当前真实对象仍能支持这项写作，沿其原所有者实际读到的内容可以形成新的依据；缺失的新内容、旧资料和模型自己的任务描述分别保留其分量，旧地址不能换签为新修订。你可以结合真实可读路径判断尚可补齐的需要与确实受阻的部分，帮助伙伴继续有内容地照顾这件事。

hostState.imageRequests 只记录这次及其重试的送图情况。accepted=true 表示那个版本的真实像素已经进了主助手的请求；prepared_for_next_model_request 表示还在准备。你没有收到像素，不等于伙伴没看见；旧轮助手的文字也不替代当前图像本身。传输记录能证明送图，不能替你判断画面内容。真正的反证或超出图像所能说明的结论才值得指出，比如把图上两条线的交点说成现实道路连通。不同回合图片的身份也需要各自的依据。

给伙伴的反馈可以具体、坦率，也留得下余地。missing 对应原话里还没接住的要求，quote 保留那段连续原文，needed 说明补上什么会有帮助；答复里无根据的声明放在 contradictions。眼前同一轮确实有路可补的记为 repairable；缺少外部通道、权限或资料，且已清楚交代可用部分与实际难处的，记为 blocked_explained，它仍是未完成的事，但不需要让伙伴重复同一个无效步骤。判断事实时按伙伴实际说到的强度理解，“记录列出”或有条件估计与无条件保证有区别。也请让反馈停在原请求之内。

report_completion_gaps 把你的判断带回同伴。requests 只对应这次给你的请求ID：说明、比较和接回旧事项通常是 answer，实在的稿件是 artifact，改变日程、提醒、外发等业务状态是 action。原分类也可能需要更正，kind 与逐字 basisQuote 可以说明缘由。成稿用 artifactIds、answered；业务完成用实际 actionIds、succeeded。请求本身暂时 pending/resultRefs 为空是收尾前的正常顺序，你的判断回来后才统一更新；已经有成功结果时无需再把这个先后顺序当缺口。恢复上下文没有独立的业务动作，明确采用或撤销既有方案则要落实到那件事自己的状态。` },
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
