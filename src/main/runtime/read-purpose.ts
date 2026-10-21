import { z } from 'zod';
import type { DeepSeekClient, ToolSpec } from '../provider';
import { structuredResult } from './structured-result';
import { usingLunaTestTransport } from '../model-selection';

const wireSchema = z.object({
  neededForCurrentRequest: z.boolean().describe('这次具体读取或公开查询是否服务于当前请求的实质回答。独立普通知识不需要私人前情，读取私人前情时为false；用户要求查询相关公开资料时，针对该具体query可为true。公开类别不自动代表有用途，无关查询为false。指代、省略或沿当前事项开放式深入需要最小前情时可为true，能改为追问不等于无需上下文。必要分页和定位可为true。'),
  allowed: z.boolean().describe('独立判断来源、主体、用途和参数是否符合当前原话及显式限制；宿主另行强制执行实际身份和授权，不能在这里扩大权限。允许并不代表需要。'),
  reason: z.string().max(600),
}).strict();
const verdictSchema = wireSchema.extend({ sourceQuote: z.string().max(3000).optional() }).strict();
/** Verify the specific read or outgoing query before it occurs; never grant host permissions. */
export async function verifyReadPurpose(original: string, proposed: unknown, complete: DeepSeekClient['complete'], signal: AbortSignal) {
  // The temporary max-effort Luna route counts reasoning and formatting in
  // total output. Keep the production allowance and the complete facade.
  const lunaTestTransport = usingLunaTestTransport();
  const maxOutputTokens = lunaTestTransport ? 8192 : 4096;
  const { $schema: _, ...parameters } = z.toJSONSchema(wireSchema);
  const tool: ToolSpec = { type: 'function', function: { name: 'verify_read_purpose', description: '在读取正文或发起公开查询前，核对这次具体操作是否服务当前请求，及来源、参数和外发词是否获准。', parameters } };
  const schema = verdictSchema.superRefine((verdict, context) => {
    if (verdict.allowed && (!original.trim() || verdict.sourceQuote !== undefined && (!verdict.sourceQuote || !original.includes(verdict.sourceQuote)))) context.addIssue({ code: 'custom', path: ['sourceQuote'], message: 'The authorization must refer to the actual original user text, never a proposed tool purpose.' });
  });
  const value = await structuredResult({ schema, tool, complete, signal, failureCode: 'purpose_unknown', failureMessage: '未取得合法用途判断结构，暂未继续这次操作。', options: { thinking: 'enabled', maxOutputTokens,
    // Use the existing named-function mapping only for temporary Luna
    // Responses. DeepSeek Chat Completion thinking mode must keep auto.
    ...(lunaTestTransport ? { toolChoice: { type: 'function' as const, function: { name: tool.function.name } } } : {}),
  }, messages: [
    { role: 'system', content: '先确定每项限制修饰的具体请求。某项后台托付、某份草稿或某个子问题的限源，不自动限制同一句中其他独立请求；当前明确要求比较或修改的已有对象，可以读取完成该请求所需的最小业务记录。proposed.scopedSourceLimits是前置核对保留的逐字局部限制及适用对象，辅助对齐original，不能变成全轮禁读或扩权。真正全轮限源与底层权限仍必须遵守；不要把仅对未来持续关注的限制转成当前比较任务的禁读。' },
    { role: 'system', content: '用户明确托付持续关注时，可核对同范围当前托付的最小标识、许可来源、期限和停止规则，以避免重复关注或违背既有控制；不要求用户另说读取控制账本。此用途不能扩展到无关关注内容或人物资料。新托付自身的来源限制仍约束后续采集，不能用控制核对读取被排除的业务资料。' },
    { role: 'system', content: '在具体操作发生前分别判断neededForCurrentRequest和allowed。neededForCurrentRequest针对proposed中的这次读取或查询能否服务实质回答，而不是能否改为追问。对私人前情的读取，不依赖前情的普通知识或文字任务为false；同一对话、条数有限或可能有用都不能单独证明需要。指代、省略或连续讨论需要前文对象、条件或结果时，最小当前会话恢复有实际用途；本条没有重复这些信息恰是恢复的原因，不能以“缺少参数，可以让用户再说一次”断言前情无关。是否能找回由实际观察决定，不要求在读取前已经知道答案。\nallowed核对拟读取主体、来源、领域、时间和字段是否符合当前原话及显式限制；实际身份、来源授权、隐私版本和可读对象由宿主在读取前独立强制执行。本判定不签发权限，也不要求用户为其所指的当前会话资料重复声明连接凭据。不能把代问或假想对象的需要套成本人资料用途；明确任务材料无需虚构人物画像用途。混合请求中明确的本人查询可独立成立。权限上的未知与语义上的不相关分开，不利用歧义扩大实际范围。proposed用途仍只是待审提案，不能取代original。只提交两个布尔值和reason，宿主将结果绑定原始字节。\n这是读取用途核对，不是最终答案完整性核验。相关资源的合法分页、计算必需字段、重修子集或先查时间标识都可以是完整任务中的一步；不能因单次查询尚未覆盖全部结果或offset大于0而拒绝，也不能借探索读取无关资源、他人资料或无关时间段。' },
    { role: 'system', content: '若proposed.outgoingPublicQuery为true，核对的是将要发出的具体公开检索词。用户要求查询、核查或补充相关公开资料时，相称的主题词可有实际用途，neededForCurrentRequest可为true；即使这是一道独立知识问题、不需要本人画像或私人历史，也不能据此把相关公开检索判为无用。用户没有请求的无关主题仍为false；“公开”或“只读”标签本身不证明allowed或needed。allowed还须逐项核对外发词：禁止联网、只准使用附件或本条资料等真实限制必须遵守；不得把无关私人原文、身份、诊疗记录或私人链接混进检索词。那些文字即使出现在当前消息里，也不等于获准向公网发送。相关公开查询的许可不扩展到私人历史或个人位置读取。' },
    { role: 'system', content: '用户在正在进行的对话里开放式地想继续深入、增加难度或认真推进，却未另指定新对象时，最小同会话前情可用于给出一个具体接续，避免再次要求选择领域。这与独立的翻译、概念解释或明确换话题不同；仍须遵守原话的限源与实际宿主权限。不要仅因本条没有“刚才”等指代词就判为完全无关，也不因同一会话存在便对每条普通问题自动读取。' },
    { role: 'system', content: '用户明确要为本人已有事项设置提醒、修改或取消它时，先在本机既有日程中按相关日期读取该事项的最小标识和开始时间，是完成委托所必需的定位步骤；不要求用户再逐字说“授权读取日程”。这只判断读取用途，不批准提醒或修改。若原话说的是他人日程、仅讨论方法、明确禁止读取或宿主来源未获授权，仍不得借此读取本人日程；混合请求中的他人偏好不否定独立成立的本人事项读取。' },
    { role: 'system', content: 'proposed中若包含alreadyAdmittedSameConversation，那些是宿主在当前许可范围内已经提供给主助手的同对话文字，只可用来解开当前原话的“刚才／那一项／核对结果”等指代，不是新授权。若上轮同时处理本地事项和外部提交，本轮要求核对刚才的结果时，核对相关本地业务对象可有正当用途，即使本轮没重写日期或标题；只读与该指代相关的最小对象。上轮助手自称已办成不能证明当前业务状态，正是需要读取真实对象的原因。无实际同对话关联、当前明确限源或纯知识问题仍不能借历史扩大读取。' },
    { role: 'system', content: 'proposed.currentUserReference若存在，是宿主按当前范围重新核过的本条真实界面引用，仅含原对象、修订、选区和原已展示页范围，不是模型提案、笔记正文或新授权。结合它理解当前原话的“这句／前面／这些想法”等指代，不要求用户再复制笔记名称或原文。用户指着原句继续讨论，而所指对象、条件或想法在同一笔记原页的上下文时，对该确切noteId／revision的必要最小回读可以有实际用途；这与无关联的普通知识问题不同。仍须逐项核拟读参数与原话：原引用不单独证明整库、其它笔记、任意版本、整篇或未展示部分均有读取需要，也不证明接受其中建议、保存偏好或安排日程。当前明确不读旧内容、只用所选句或其他限源始终优先；用途判定不能替代宿主原来源与权限门。' },
    { role: 'system', content: 'proposed.currentProgramReference若存在，是宿主在当前范围重核、且已正式准入给主助手的交互作品地址和节点身份，不含旧DSL、数据、局部输入或新授权。可据此理解“这里／这个参数／刚才的变化”正在指哪份作品；为了回答而最小回读同一messageId/programId/revision的规格可以有用途，不要求用户重报标题或复制整件作品。仍独立核拟读对象和参数；它不允许读取其它作品、整个历史或绑定资料的原私有库，不把临时条件当本人事实、采用或行动许可。明确不读旧内容、只用本条等新限制始终优先；不因为引用存在就自动allowed。' },
    { role: 'system', content: 'proposed.currentRehearsalReference若存在，是宿主对本轮正式准入、且目前仍匹配的试说位置重核得到的非正文地址，只帮助理解“刚才那句／现在想说的意思”等指代。练习台词、助手模拟与本人此刻对主助手提出的整理、回顾或其他外层请求分别判断；试说身份既不能让台词自动成为现实委托，也不能把整轮真实请求一并拒绝。仍按本轮原话核对拟读取的确切对象、时间和字段，只读完成当前请求所需的最小部分；引用不是新授权，不证明对方真实态度、整段历史已读或任意窗口都需要读取，明确限源始终优先。' },
    { role: 'system', content: '拟操作中若有hostParameterRoles，是宿主对真实参数位置职责的说明，不是allowed结论。按这些职责区分本轮请求许可与正文经历依据：作为current_request的source应核它是否支持本次操作，不额外要求许可句自身包含希望回顾的生活经历；经验材料仍由独立citations和实际已读来源支持，练习与模拟的身份不改变。时间window、主体、来源与读取范围仍逐项对照原话，角色说明不补足缺失授权，也不自动允许更宽、未知或未来范围。' },
    { role: 'system', content: 'proposed.rehearsalActivityTiming若存在，是宿主从本轮正式准入或已实际交付的read/manage结果取得owner地址，再按当前精确版本与全部原来源重核的非正文时间信息。sourceReceived是原话被收到的边界，ownerCreatedAt/ownerUpdatedAt是记录创建／更新时刻；它们都不是现实事件发生时间、连续练习时长或整个时间窗的读取许可。用真实时刻解开“刚才这段”等指代，不把相隔数小时的同段活动硬猜成几分钟，也不因此扩大window。仍分别核对本轮请求、具体来源和引用，不能把其中任何时间或地址当成allowed结论。' },
    { role: 'user', content: JSON.stringify({ original, proposed, hostContract: '参数可由宿主当前时间、时区及已知来源口径解析，不要求用户逐字写出解析后的日期或学期标识。读取相关学期索引以确定“本学期”是允许的任务步骤；不能用“原话未写年份”拒绝整个已授权查询。停止、暂停或修改本人既有关注时，读取对应关注的最小标识与当前状态是操作必要步骤，不能把它误当成新增主动跟进或无关画像读取。仍须遵守已有来源限制，不可借当前请求查其他人的资料。' }) },
  ] });
  return { allowed: value.allowed && value.neededForCurrentRequest, reason: value.reason, sourceQuote: original };
}
