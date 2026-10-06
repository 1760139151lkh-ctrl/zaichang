import { z } from 'zod';
import type { DeepSeekClient, ToolSpec } from '../provider';
import { structuredResult } from './structured-result';

const wireSchema = z.object({
  neededForCurrentRequest: z.boolean().describe('这次具体读取或公开查询是否服务于当前请求的实质回答。独立普通知识不需要私人前情，读取私人前情时为false；用户要求查询相关公开资料时，针对该具体query可为true。公开类别不自动代表有用途，无关查询为false。指代、省略或沿当前事项开放式深入需要最小前情时可为true，能改为追问不等于无需上下文。必要分页和定位可为true。'),
  allowed: z.boolean().describe('独立判断来源、主体、用途和参数是否符合当前原话及显式限制；宿主另行强制执行实际身份和授权，不能在这里扩大权限。允许并不代表需要。'),
  reason: z.string().max(600),
}).strict();
const verdictSchema = wireSchema.extend({ sourceQuote: z.string().max(3000).optional() }).strict();
/** Verify the specific read or outgoing query before it occurs; never grant host permissions. */
export async function verifyReadPurpose(original: string, proposed: unknown, complete: DeepSeekClient['complete'], signal: AbortSignal) {
  const { $schema: _, ...parameters } = z.toJSONSchema(wireSchema);
  const tool: ToolSpec = { type: 'function', function: { name: 'verify_read_purpose', description: '在读取正文或发起公开查询前，核对这次具体操作是否服务当前请求，及来源、参数和外发词是否获准。', parameters } };
  const schema = verdictSchema.superRefine((verdict, context) => {
    if (verdict.allowed && (!original.trim() || verdict.sourceQuote !== undefined && (!verdict.sourceQuote || !original.includes(verdict.sourceQuote)))) context.addIssue({ code: 'custom', path: ['sourceQuote'], message: 'The authorization must refer to the actual original user text, never a proposed tool purpose.' });
  });
  const value = await structuredResult({ schema, tool, complete, signal, failureCode: 'purpose_unknown', failureMessage: '读取用途缺少原话依据，暂未读取。', options: { thinking: 'enabled', maxOutputTokens: 4096 }, messages: [
    { role: 'system', content: '在具体操作发生前分别判断neededForCurrentRequest和allowed。neededForCurrentRequest针对proposed中的这次读取或查询能否服务实质回答，而不是能否改为追问。对私人前情的读取，不依赖前情的普通知识或文字任务为false；同一对话、条数有限或可能有用都不能单独证明需要。指代、省略或连续讨论需要前文对象、条件或结果时，最小当前会话恢复有实际用途；本条没有重复这些信息恰是恢复的原因，不能以“缺少参数，可以让用户再说一次”断言前情无关。是否能找回由实际观察决定，不要求在读取前已经知道答案。\nallowed核对拟读取主体、来源、领域、时间和字段是否符合当前原话及显式限制；实际身份、来源授权、隐私版本和可读对象由宿主在读取前独立强制执行。本判定不签发权限，也不要求用户为其所指的当前会话资料重复声明连接凭据。不能把代问或假想对象的需要套成本人资料用途；明确任务材料无需虚构人物画像用途。混合请求中明确的本人查询可独立成立。权限上的未知与语义上的不相关分开，不利用歧义扩大实际范围。proposed用途仍只是待审提案，不能取代original。只提交两个布尔值和reason，宿主将结果绑定原始字节。\n这是读取用途核对，不是最终答案完整性核验。相关资源的合法分页、计算必需字段、重修子集或先查时间标识都可以是完整任务中的一步；不能因单次查询尚未覆盖全部结果或offset大于0而拒绝，也不能借探索读取无关资源、他人资料或无关时间段。' },
    { role: 'system', content: '若proposed.outgoingPublicQuery为true，核对的是将要发出的具体公开检索词。用户要求查询、核查或补充相关公开资料时，相称的主题词可有实际用途，neededForCurrentRequest可为true；即使这是一道独立知识问题、不需要本人画像或私人历史，也不能据此把相关公开检索判为无用。用户没有请求的无关主题仍为false；“公开”或“只读”标签本身不证明allowed或needed。allowed还须逐项核对外发词：禁止联网、只准使用附件或本条资料等真实限制必须遵守；不得把无关私人原文、身份、诊疗记录或私人链接混进检索词。那些文字即使出现在当前消息里，也不等于获准向公网发送。相关公开查询的许可不扩展到私人历史或个人位置读取。' },
    { role: 'system', content: '用户在正在进行的对话里开放式地想继续深入、增加难度或认真推进，却未另指定新对象时，最小同会话前情可用于给出一个具体接续，避免再次要求选择领域。这与独立的翻译、概念解释或明确换话题不同；仍须遵守原话的限源与实际宿主权限。不要仅因本条没有“刚才”等指代词就判为完全无关，也不因同一会话存在便对每条普通问题自动读取。' },
    { role: 'system', content: '用户明确要为本人已有事项设置提醒、修改或取消它时，先在本机既有日程中按相关日期读取该事项的最小标识和开始时间，是完成委托所必需的定位步骤；不要求用户再逐字说“授权读取日程”。这只判断读取用途，不批准提醒或修改。若原话说的是他人日程、仅讨论方法、明确禁止读取或宿主来源未获授权，仍不得借此读取本人日程；混合请求中的他人偏好不否定独立成立的本人事项读取。' },
    { role: 'system', content: 'proposed中若包含alreadyAdmittedSameConversation，那些是宿主在当前许可范围内已经提供给主助手的同对话文字，只可用来解开当前原话的“刚才／那一项／核对结果”等指代，不是新授权。若上轮同时处理本地事项和外部提交，本轮要求核对刚才的结果时，核对相关本地业务对象可有正当用途，即使本轮没重写日期或标题；只读与该指代相关的最小对象。上轮助手自称已办成不能证明当前业务状态，正是需要读取真实对象的原因。无实际同对话关联、当前明确限源或纯知识问题仍不能借历史扩大读取。' },
    { role: 'user', content: JSON.stringify({ original, proposed, hostContract: '参数可由宿主当前时间、时区及已知来源口径解析，不要求用户逐字写出解析后的日期或学期标识。读取相关学期索引以确定“本学期”是允许的任务步骤；不能用“原话未写年份”拒绝整个已授权查询。停止、暂停或修改本人既有关注时，读取对应关注的最小标识与当前状态是操作必要步骤，不能把它误当成新增主动跟进或无关画像读取。仍须遵守已有来源限制，不可借当前请求查其他人的资料。' }) },
  ] });
  return { allowed: value.allowed && value.neededForCurrentRequest, reason: value.reason, sourceQuote: original };
}
