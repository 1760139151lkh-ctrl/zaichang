import { z } from 'zod';
import type { DeepSeekClient, ToolSpec } from '../provider';
import { structuredResult } from './structured-result';
import { usingLunaTestTransport } from '../model-selection';

const wireSchema = z.object({
  neededForCurrentRequest: z.boolean().describe('这项具体读取或公开查询是否帮助回答当前问题。独立普通知识通常用不到私人前情；相关公开查询、指代恢复、必要分页和定位可以有实际用途。能改为追问不等于前情无用，属于公开类别也不自动意味着相关。'),
  allowed: z.boolean().describe('这次操作的来源、主体、用途和参数与当前原话及显式限制是否相符。宿主另核实际身份和授权，这份判断不增加权限；有许可和有需要分别判断。'),
  reason: z.string().max(600).describe('给主助手的具体说明：这项操作能补哪处信息，或哪个范围与当前请求不相符。说明已知与未知即可，这里不拟写角色对用户的答复。'),
}).strict();
const verdictSchema = wireSchema.extend({ sourceQuote: z.string().max(3000).optional() }).strict();
export interface PresenceReadAuthority {
  kind: 'host_presence';
  companionCheckIns: 'sometimes' | 'often';
  sessionId: string;
  sources: string[];
  expiresAt: string;
}
/** Verify the specific read or outgoing query before it occurs; never grant host permissions. */
export async function verifyReadPurpose(original: string, proposed: unknown, complete: DeepSeekClient['complete'], signal: AbortSignal) {
  return reviewReadPurpose(original, proposed, complete, signal);
}
/** Called only after the presence owner checks this run's live capability.
 * A setting can authorize one optional message without becoming user speech. */
export async function verifyPresenceReadPurpose(authority: PresenceReadAuthority, proposed: unknown,
  complete: DeepSeekClient['complete'], signal: AbortSignal) {
  return reviewReadPurpose('', proposed, complete, signal, authority);
}
async function reviewReadPurpose(original: string, proposed: unknown, complete: DeepSeekClient['complete'], signal: AbortSignal,
  presence?: PresenceReadAuthority) {
  // The temporary max-effort Luna route counts reasoning and formatting in
  // total output. Keep the production allowance and the complete facade.
  const lunaTestTransport = usingLunaTestTransport();
  const maxOutputTokens = lunaTestTransport ? 8192 : 4096;
  const { $schema: _, ...parameters } = z.toJSONSchema(wireSchema);
  const tool: ToolSpec = { type: 'function', function: { name: 'verify_read_purpose', description: '在读取正文或发起公开查询前，核对这次具体操作是否服务当前请求，及来源、参数和外发词是否获准。', parameters } };
  const schema = verdictSchema.superRefine((verdict, context) => {
    if (!presence && verdict.allowed && (!original.trim() || verdict.sourceQuote !== undefined && (!verdict.sourceQuote || !original.includes(verdict.sourceQuote)))) context.addIssue({ code: 'custom', path: ['sourceQuote'], message: '许可引用对应的是实际用户原话；拟操作的用途说明不是用户原话。' });
  });
  const value = await structuredResult({ schema, tool, complete, signal, failureCode: 'purpose_unknown', failureMessage: '这次读取的用途还没有确认清楚，尚未开始读取。', options: { thinking: 'enabled', maxOutputTokens,
    // Use the existing named-function mapping only for temporary Luna
    // Responses. DeepSeek Chat Completion thinking mode must keep auto.
    ...(lunaTestTransport ? { toolChoice: { type: 'function' as const, function: { name: tool.function.name } } } : {}),
  }, messages: [
    { role: 'system', content: '我们在帮主助手确认这一次具体读取的用途和范围。限制常有自己的对象：某项后台托付、某份草稿或某个子问题的限源，不自动覆盖同一句里其他独立请求。当前明确要比较或修改的已有对象，可以有读取最小业务记录的需要。proposed.scopedSourceLimits带着前一步理解的局部限制和适用对象，帮助回到original核对；其中的解释仍可能把任务对象、参与方式和资料读取范围混在一起。只比较、先别改是在限制行动，完成比较所需的原记录、相关条件和冲突占用仍可能有用途；是否确实排除了某种资料，继续由原话的意思决定。前一步的解释不是对方另作的选择，也不扩大许可。真正的局部材料限制、全轮限源与底层权限继续生效；只对未来关注的限制，和当前比较任务分别理解。' },
    { role: 'system', content: '明确的持续关注委托包含一小部分必要控制信息：同范围已有托付的标识、许可来源、期限和停止规则。这些能帮助避免重复关注，也照顾已有的暂停或停止选择，不需要对方另说一次“读控制账本”。相关控制信息与关注内容、人物资料各有范围；新托付的来源限制仍约束后续采集，被排除的业务资料也不会因核对控制信息而变得可读。' },
    { role: 'system', content: 'neededForCurrentRequest和allowed回答不同问题。前者看proposed这次操作怎样帮助实质回答：独立的普通知识或文字任务用不到私人前情，私人读取为false；相关的指代、省略或连续讨论，恢复最小同会话对象、条件或结果就有用途。本条没重复这些信息，往往正是需要接上前情的原因；再问用户一遍是另一种选择，不等于前情无关。同一对话、条数有限或“可能有用”本身仍不足以说明需要，能否找回也要看实际读取。\nallowed看拟读主体、来源、领域、时间和字段是否与当前原话及显式限制相符。宿主在读取前另核实际身份、来源授权、隐私版本和对象，这份用途意见不签发权限。正在指着当前会话资料继续谈，也不需要重报已保存的连接凭据。代问、假想对象与本人资料分别判断；明确的任务材料本来就可以服务任务，无需套成人物画像。混合请求里独立的本人查询可以成立。权限未知和语义无关是两回事，proposed用途仍是待核提案，依据是original。结果用两个布尔值和reason交回，宿主绑定原始字节。\n这一步还不是最终答案完整性核查。相关资源的合法分页、计算所需字段、重修子集或先查时间标识，都可以是完整任务中的一步，offset大于0或单页不全并不让它失去用途。无关资源、他人资料和无关时段仍在原请求以外。' },
    { role: 'system', content: 'proposed.outgoingPublicQuery=true时，需要看将要外发的具体检索词。对方要查证或补充公开资料，相称的主题词可以帮助回答，neededForCurrentRequest可为true；一道独立知识题虽然用不到私人历史，相关公开搜索仍然有用。无关主题为false，“公开”或“只读”也不单独证明许可和需要。外发词还有自己的边界：不联网、只用附件或本条资料等真实选择继续生效；无关私人原文、身份、诊疗记录和私人链接，即使出现在当前消息里，也没有因此获得向公网发送的许可。公开查询和读取私人历史、个人位置是不同的操作。' },
    { role: 'system', content: '正在谈一件事时，对方说想再深入一点、增加难度或认真推进，而没有换对象，最小同会话前情能帮助给出具体接续，免得又让人从领域开始选。“刚才”等词是线索，不是唯一形式；同一会话的存在也不是每条普通问题都要翻前情的理由。独立翻译、概念说明或明确换话题有自己的材料，原话限源与宿主权限继续决定可用范围。' },
    { role: 'system', content: '为本人已有事项设提醒、修改或取消时，按相关日期读取本机日程里的最小标识与开始时刻，是定位原对象的一步，委托本身已有这个用途，不需要另复述“授权读取日程”。用途核对和提醒、修改批准仍是两回事。他人日程、仅谈方法、明确不读或宿主尚未授权的来源，不因此成为本人日程读取；混合请求里出现他人偏好，也不抵消独立的本人事项查询。' },
    { role: 'system', content: 'alreadyAdmittedSameConversation是宿主在当前许可范围内已交给主助手的同对话文字，用来解开“刚才／那一项／核对结果”等指代，本身不增加权限。上轮若兼有本地事项和外部提交，本轮要核对刚才结果，相关本地业务对象即使没有重写日期、标题，也可能有最小回读用途。上轮助手说“办好了”与真实业务状态不同，核对原对象正是为辨明这点。没有实际关联、当前已限源或普通纯知识问题，都各守自己的读取范围。' },
    { role: 'system', content: 'availableMaterialReferences只列本对话中已经过宿主资格核对的画面种类和地址，没有行正文、标题或私人筛选参数，也不表示对方看过或准许这次读取。它让你知道指代可能确有原件可接：对方说这页、这两项、接着刚才时，必要近期原话与原回复有时正是认清原页和顺序的材料；画面里的内容不一定逐行抄进过正文。把比较留在眼前两个对象上，与把承载原页的历史或账号来源一概排除，是不同的意思。结合真实新话辨清这一点，再看拟读范围是否合适；无关页面、整个私有库和新排除的来源仍不在这次需要之内。' },
    { role: 'system', content: 'currentUserReference是宿主按当前范围重新核过的真实界面引用，包含原对象、修订、选区和已展示页范围，不是模型提案、笔记正文或新授权。它能解释“这句／前面／这些想法”，让人不用再抄笔记名称和原文。所指条件或想法若在同一原页上下文，对该确切noteId／revision的最小回读可以帮助讨论；无关普通知识则用不到。引用范围和拟读参数仍逐项对应：整库、其他笔记、任意版本、整篇或未展示部分并不自动有用途，点击也不表示接受建议、保存偏好或安排日程。当前“不读旧内容”“只用选句”等选择优先，宿主继续核原来源与权限。' },
    { role: 'system', content: 'currentCampusReference是宿主在本轮重新核对真实界面引用后单列的地址、资源类别与可选显示字段；它和提案自己填的sceneId不同，不含课程名、学分、成绩、行正文或sourceKey。它帮助解开“这门／这一条”所指的是哪一条原记录。旧前情里助手说当时没有选中、没有拿到页面，只说明当时的状态，不能否认这一次已核过的界面引用。该地址仍不是allowed结论：本次字段是否帮助回答、是否超出对方限制，继续对照当前原话；例如只问credit时可选该字段并保留定位所需的稳定身份，教师等其他显示字段并不因此都有必要。真正读取还会按当前账号、来源、原bundle与版本重新核对，点击也不表示接受、到达、掌握或业务授权。' },
    { role: 'system', content: 'currentAgendaReference是宿主按本轮允许范围重新读取的本机安排地址和当前修订，occurrence指明重复系列中的这一次，trial只是尚未采用的试放条件。它帮助解开“这件事／这个时间”的指代；为了回答这件事而最小回读原安排或所需占用，可以有用途。是否需要其它安排、学校资料或更大窗口，仍逐项对照当前问题和限制；地址、试放和点击都不是修改许可。' },
    { role: 'system', content: 'currentProgramReference是宿主已正式准入的交互作品地址和节点身份，不含旧DSL、数据、局部输入，也不是新授权。它帮助理解“这里／这个参数／刚才的变化”指哪件作品；为回答最小回读同一messageId/programId/revision规格可以有用途，不必重报标题或复制整件作品。其他作品、全部历史、绑定的原私有库仍各有边界；临时观看条件也不是本人事实、采用或行动许可。拟读对象和参数仍独立核对，当前“不读旧内容”“只用本条”等新限制继续生效，引用存在本身不是allowed结论。' },
    { role: 'system', content: 'providedProgramReference保留这轮已经发生的交付：delivered_this_run是原作品实际读到的部分，readMode和coverage说明范围；published_this_run是主助手在本轮已发表、真实回执已交给它的同作修订。两者都由宿主重新核原地址与来源。它与currentProgramReference有不同来路，后者是对方入站时正式带来的观看引用，仍保留当时版本和局部输入。同作已在这轮续成新版本时，两份地址的revision可以不同；这说明了续做过程，是否仍在原请求内继续对照当前原话。对方也可以直接说要续改原作而没有先调控件，no_current_formal_reference保留的是界面引用缺省，providedIdentity则可确认提案对着已交付的确切原件。读取或发表回执都不说明用户已看，不改写正式输入，也不增加任意作品许可。旧版本、不同地址、新资料与新排除的来源仍各按实际情况处理。' },
    { role: 'system', content: '一段委托也可能按先后推进：先修原作，再读修好的版本继续调整。scopedSourceLimits里的appliesTo保留限制所对应的那件事或那一步；后一步的材料条件要等那一步真正开始时再对应，不能倒过来阻断前一步所需的原稿。providedProgramReference可以帮助分清手上是实际读到的旧稿，还是本轮刚发表的修订。维护同一作品时，对方明确希望保留的功能也有读取原声明的理由；不用对方逐个说出内部字段名，仍要结合这次实际读取范围与修订需要判断。读旧声明、理解作品内容和打开其绑定的私人来源各有范围，认出同一作品不会替后两者补出许可。' },
    { role: 'system', content: 'providedImageContext是本轮主助手确实已经读到的一段原对话，原收据把它与拟读图片的确切版本连在一起。它帮助你理解“继续刚才”“没讲完的地方”在这段交流里指什么；latestProvidedAssistant只比较这次已提供的前情，未声称用户已经看过。replyState若为partial或曝光未知，就仍是当时真正留下的片段，不补未发表的尾文。旧助手的文字不能替代像素，也不能证明其图像判断正确；认出所指以后，再按当前请求判断还需哪些视觉内容、是否允许整图读取。明确只看文字、局部限源、撤回和新的拒绝继续优先，不需要对方为了一个已能对应的回指重贴图片或报内部地址。' },
    { role: 'system', content: 'currentRehearsalReference是本轮正式准入且仍匹配的试说位置地址，不含正文，帮助理解“刚才那句／现在想说的意思”。练习台词、助手模拟与此刻对主助手提出的整理、回顾等外层请求分别理解：台词不自动成为现实委托，试说身份也不抹掉独立的真实请求。拟读对象、时间和字段仍对照本轮原话，取完成请求所需的最小部分；引用不增加权限，也不证明对方真实态度、整段历史已读或任意窗口都有用途。明确限源继续优先。' },
    { role: 'system', content: 'hostParameterRoles解释真实参数位置各做什么，不是allowed结论。current_request位置的source支持本次操作许可，正文经历则由独立citations和实际已读来源支持；所以一条许可句不需要同时讲完想回顾的生活经历。练习与模拟的身份保持原样。时间window、主体、来源和读取范围仍逐项对照原话；参数角色说明不补授权，也不自动覆盖更宽、未知或未来范围。' },
    { role: 'system', content: 'rehearsalActivityTiming是宿主从正式准入或已交付read/manage结果取得owner地址后，按当前精确版本与全部原来源重新核过的非正文时间。sourceReceived表示原话收到的边界，ownerCreatedAt/ownerUpdatedAt表示记录创建／更新；这些和现实事件发生时间、连续练习时长、整个窗口的读取许可不同。它们有助于理解“刚才这段”，相隔数小时的记录不能当成几分钟连续练习。窗口、原话和引用仍各核各的，单个时间或地址也不是allowed结论。' },
    ...(presence ? [{ role: 'system' as const, content: '这次没有新的本人消息。伙伴正在对方所选的“欢迎偶尔先开口”方式里，准备一条可忽略的分享；hostPresence是宿主刚核过的本次入口、当前选择、原对话和来源范围，不是本人引文，也不是模型提出的用途。帮忙看看这项具体读取或公开检索是否为这条分享提供实际内容，以及范围是否合适。neededForCurrentRequest在这里指这一次分享的需要；纯知识或新创作不必读取私人经历，若要接真实相处，只读相关且仍允许的最小前情。公开检索可以为这件内容查证或取材，检索词仍须逐项看清，私人原文与身份不能顺带传出去。它不承接新办事请求、不恢复旧活动，也不接受、记录或外发任何替对方作的决定。旧资料里明确的限制继续照顾；实际身份、来源和到期时间仍由宿主把关。这里没有需要补写的当前sourceQuote。' }] : []),
    { role: 'user', content: JSON.stringify({ ...(presence ? { hostPresence: presence } : { original }), proposed,
      hostContract: presence ? '这是一条尚未发送的主动分享。宿主在这次核对前后都重查原presence入口，核对结果只供这项具体读取使用；不增加来源、期限或行动许可。'
        : '参数可以由宿主当前时间、时区和已知来源口径解析；对方未逐字写出解析后的日期或学期标识，并不缺少这项查询的用途。读取相关学期索引以确定“本学期”本来就是任务一步。停止、暂停或修改本人既有关注时，读取其最小标识和当前状态用于操作原对象，和新增主动跟进、无关画像读取不同。已有来源限制与他人资料边界继续生效。' }) },
  ] });
  return { allowed: value.allowed && value.neededForCurrentRequest, reason: value.reason, ...(!presence ? { sourceQuote: original } : {}) };
}
