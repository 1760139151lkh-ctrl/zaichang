import { z } from 'zod';
import type { DeepSeekClient, ToolSpec } from '../provider';
import { structuredResult } from './structured-result';
import { usingLunaTestTransport } from '../model-selection';
import { HarnessError } from '../../shared/harness';
import { localCloudRestriction } from './turn-controls';

const wireSchema = z.object({
  neededForCurrentRequest: z.boolean().describe('读这份内容或查这些公开资料，能帮眼前的问题补上什么。独立的常识题通常用不到私人前情；接上指代、读下一页或找到原对象，也可以是必要的一步。能问用户，不等于已有前情就没有帮助；资料公开，也还要与问题有关。'),
  allowed: z.boolean().describe('这次想读谁的什么资料、用来做什么，是否照顾了用户原话里的选择和限制。程序另会检查账号与来源权限；这里分清“帮得上忙”和“这次允许读”两件事。'),
  reason: z.string().max(600).describe('把判断的缘由讲给主助手：能补哪一点，哪份内容超出了这次约定，或者还缺什么。接下来怎样对用户开口，留给她按自己的性格和眼前交流来。'),
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
  // A read-purpose model is another cloud boundary, not an exception to the
  // author's current local-only choice. Check before serializing any proposal.
  if (!presence && localCloudRestriction(original)) throw new HarnessError('cloud_disabled', '这次内容只留在本机；当前没有可用的离线模型。');
  // The temporary max-effort Luna route counts reasoning and formatting in
  // total output. Keep the production allowance and the complete facade.
  const lunaTestTransport = usingLunaTestTransport();
  const maxOutputTokens = lunaTestTransport ? 8192 : 4096;
  const { $schema: _, ...parameters } = z.toJSONSchema(wireSchema);
  const tool: ToolSpec = { type: 'function', function: { name: 'verify_read_purpose', description: '一起看看这次想读的内容或公开检索怎样帮助眼前的问题，范围和检索词是否照顾了用户的选择。', parameters } };
  const schema = verdictSchema.superRefine((verdict, context) => {
    if (!presence && verdict.allowed && (!original.trim() || verdict.sourceQuote !== undefined && (!verdict.sourceQuote || !original.includes(verdict.sourceQuote)))) context.addIssue({ code: 'custom', path: ['sourceQuote'], message: '这段引用没能在用户原话里找到。想读什么、为什么读是提议；用户自己的话仍要沿original来找。' });
  });
  const value = await structuredResult({ schema, tool, complete, signal, failureCode: 'purpose_unknown', failureMessage: '这次读取的用途还没有确认清楚，尚未开始读取。', options: { thinking: 'enabled', maxOutputTokens,
    // Use the existing named-function mapping only for temporary Luna
    // Responses. DeepSeek Chat Completion thinking mode must keep auto.
    ...(lunaTestTransport ? { toolChoice: { type: 'function' as const, function: { name: tool.function.name } } } : {}),
  }, messages: [
    { role: 'system', content: '想请你帮主助手看清，这次读什么、为什么读。用户的限制有时只对着某件事：一项以后要留意的托付、一份草稿，或其中一个问题；同一句里的另一件请求仍按它自己的意思理解。用户想比较或修改已有事项时，可能需要先读到相关记录。proposed.scopedSourceLimits是前一步对限制和对象的理解，可以沿它回看original；如果它混淆了讨论方式和资料范围，以原话为准。只比较、先别改，说的是暂不行动，比较所需的原记录、条件和冲突安排仍可能要看。用户确实排除了哪些资料，就继续照这个选择做；前一步的解释不会替用户扩大或收窄范围，账号权限和整次交流的明确限制也仍然算数。' },
    { role: 'system', content: '用户托付以后留意一件事时，需要知道同一范围里已有哪份托付、能看哪些来源、何时结束、怎样停止。读这些少量信息能避免重复，也能接住先前的暂停或停止，用户不用另外说一遍去读它。关注内容和私人经历仍按各自范围处理；为认清已有托付读到的标识，不会让用户已经排除的资料重新变得可读。' },
    { role: 'system', content: 'neededForCurrentRequest看这次proposed操作怎样帮助回答。独立的常识题或文字任务用不到私人前情时，私人读取为false；接着刚才的对象、条件或结果继续谈，相关的少量前情就可能正是需要的内容。这句话没有重说日期或标题，不等于没关系，也不用总让用户再讲一遍。同在一段对话里、只读几条或笼统说可能有用，都还要讲清与问题的实际联系；能否找到仍看真正读到的内容。\nallowed再看读谁、从哪里读、读哪一段时间和哪些内容，是否符合original里的选择。账号、来源、隐私变化和对象版本由程序在读取前检查，这份理解不会另添权限。当前会话里继续谈已有资料，也无需重报已保存的凭据。代别人问、假想中的人和用户本人分别理解；明确交来的任务材料可以用于那件任务，不必先变成人物画像。混合请求中，用户自己的那一项也可以成立。还不知道权限，与材料无关，是两种情况。两个布尔值和reason记下你的理解，原话的原始内容由程序保存。\n这里看的是这一步有没有帮助，整件事是否完成由后续再看。接着合法分页、取计算要用的字段、看重修的相关记录或先找到时间标识，都可以是其中一步；offset大于0或一页还没读全，不会因此变成无关。无关资源、别人的资料和无关时段仍留在这次请求以外。' },
    { role: 'system', content: 'proposed.outgoingPublicQuery=true时，一起看看真正要发出去的检索词。用户想查证或补充公开资料，贴合问题的主题词就能帮助回答，neededForCurrentRequest可以为true；独立知识题用不到私人历史，也仍可能需要相关公开搜索。无关主题则为false，公开或只读本身还说明不了这一步的需要。用户说不联网、只看附件或只用这条资料，就照这个选择做。私人原话、身份、诊疗记录和私人链接即使在当前消息里，也不因此适合一起发到公网；公开搜索、私人历史和个人位置各看各的。' },
    { role: 'system', content: '正在谈一件事时，对方说想再深入一点、增加难度或认真推进，而没有换对象，最小同会话前情能帮助给出具体接续，免得又让人从领域开始选。“刚才”等词是线索，不是唯一形式；同一会话的存在也不是每条普通问题都要翻前情的理由。独立翻译、概念说明或明确换话题有自己的材料，原话限源与宿主权限继续决定可用范围。' },
    { role: 'system', content: '为本人已有事项设提醒、修改或取消时，按相关日期读取本机日程里的最小标识与开始时刻，是定位原对象的一步，委托本身已有这个用途，不需要另复述“授权读取日程”。用途核对和提醒、修改批准仍是两回事。他人日程、仅谈方法、明确不读或宿主尚未授权的来源，不因此成为本人日程读取；混合请求里出现他人偏好，也不抵消独立的本人事项查询。' },
    { role: 'system', content: 'alreadyAdmittedSameConversation是这次允许范围内已经交给主助手的同一段对话，可以用来认清“刚才／那一项／核对结果”指什么。上轮同时办了本地事项和外部提交，这次想看结果，即使没重说日期和标题，也可能要回读相关本地记录。助手说过办好了，还要与原对象的实际状态分清；回读正可以查清这点。没有实际联系、用户刚限制了来源，或只是独立常识题，就按这次真正需要的范围来。已有对话不会另添权限。' },
    { role: 'system', content: 'currentAssistantReference是程序刚核过的本对话上一条实际回复的地址、长度和完成状态，没有正文，也还没有表示这次允许整条读回。它帮助认出“你刚给的那个例子”这类指向，对方不用为了报内部地址再贴一次原文。read_assistant_history的arguments.id与这个messageId相同时，可以进一步看这次是否确实需要其中哪一段：textOnly=true并带locate是在本机这一条回复内找连续短语，只回小节或段落的地址，不把整条回复、其他聊天或旧工具材料带给模型。这个定位步骤本身可以服务只沿原例继续的请求；语义无关的短语则仍没有帮助。定位没找到或有多处时，程序不会自动把范围放大。后续passageId沿程序刚找到的同一原文窗口回读，hostAssistantPassage列出实际地址、原文版本和范围；这仍是待读窗口，不是正文已读或用户已看过。offset和limit只在这一处继续，具体范围仍须符合当前原话。限定一个例子不妨碍为了接上它而定位原段，也没有因此准许最近几条或同回复里的无关部分；其他资料、路线和页面仍各有自己的读取范围。' },
    { role: 'system', content: 'hostAssistantReplyIdentity是程序对这次arguments.id另行核过的同对话身份，也只有地址、长度和状态；它可以来自刚找到的前一条，而未必是眼前最新回复。中间曾有一条没能接上的回答，所指原例仍可能在它前面。textOnly=true、previous=true是在已知id之前只找一条原回复的身份，没有正文、标题或旧工具材料；锚点和前一条都要仍可读，不会暗中越过被排除的一条或连续搜更多。当前确实想接回前面的原例时，这种一步定位可以帮助认出原件，对方不用自己管理消息ID。找到地址仍未读到原例，下一步locate和passageId继续分别看当前用途与范围；身份核过也不意味着那一条就必然相关。' },
    { role: 'system', content: 'availableMaterialReferences列出程序已经检查过的画面种类和地址，里面没有正文、标题或私人的筛选条件，也没有说明用户已经看过或这次允许读取。它告诉你眼前可能还有原页可接：用户说这页、这两项、接着刚才，近期相关原话和原回复有时能帮助认出页面和先后顺序，画面内容未必逐行写进过聊天正文。想围绕眼前两个对象比较，也未必是在排除存放原页的历史或账号。沿当前原话辨清具体意思；无关页面、整个私人库和刚被排除的来源仍用不到。' },
    { role: 'system', content: 'currentUserReference是程序按当前范围重新检查过的界面引用，带着原对象、版本、选区和已展示页的范围，还没有带来笔记正文或新的读取许可。它能帮助认出“这句／前面／这些想法”，用户不用再抄一遍名称和原文。同一原页里相关的条件或想法，可以沿确切noteId／revision回读所需部分来继续讨论；独立常识题就用不到。整库、其他笔记、别的版本、整篇或未展示部分是否需要，仍各自看这次问题。点过一下，也还没有选择保存偏好、接受建议或安排日程。用户刚说不读旧内容、只用选句，就照新的意思做，原来源和权限由程序继续检查。' },
    { role: 'system', content: 'currentCampusReference来自程序这次重新检查过的真实界面引用，只有地址、资料类别和可选显示字段；它与提议里自己填写的sceneId不同，还没有课程名、学分、成绩、正文或sourceKey。它帮助认出“这门／这一条”对应哪条原记录。前文里助手当时没拿到页面，只说明当时的情况，这次已有的真实引用仍然有用。读哪些字段继续照眼前问题和用户的限制来：只问credit时，可以取它和找到原记录所需的标识，教师等其他内容未必也需要。账号、来源、原bundle与版本由程序在真正读取时重查。选中记录本身也还没有表达接受、到达、掌握或要办一件事。' },
    { role: 'system', content: 'currentAgendaReference是程序按这次允许的范围重新读到的本机安排地址和当前版本。occurrence指出重复安排中的这一次，trial留下的只是还没决定保存的试放条件。它们帮助认出“这件事／这个时间”；回答这件事可能需要回读相关原安排和占用。别的安排、学校资料或更宽时间窗是否也需要，仍照当前问题和限制来看；有地址、点过或试放过，还不表示已经同意修改。' },
    { role: 'system', content: 'currentProgramReference是程序已经检查过的作品地址和节点标识，还没有带来旧DSL、数据或局部输入，也没有新增权限。它帮助认清“这里／这个参数／刚才的变化”指哪件作品；需要时可以沿同一messageId/programId/revision读回相关规格，用户不必重报标题或复制作品。其他作品、全部历史和作品连接的私人库仍各按自己的范围。观看时暂调的条件，也还不是用户的生活事实或行动选择。具体要读什么继续照当前请求来；刚说不读旧内容、只用本条，就按新的选择做。' },
    { role: 'system', content: 'providedProgramReference说明这轮手上已经有哪些作品内容：delivered_this_run是实际读到的原稿部分，readMode和coverage说明读到哪里；published_this_run是这轮已经发表、且主助手已经拿到真实回执的同作修订。程序重新检查了它们的原地址和来源。currentProgramReference则是用户发来这句话时带着的观看引用，保留当时版本和局部输入。同作在这轮改出了新版，两边revision不同也可以是正常的续做过程，是否仍在请求内要沿当前原话理解。用户直接说续改原作，即使还没调过控件，也可能已有确切对象；no_current_formal_reference只是没有界面引用，providedIdentity可以帮助认出已经交到手上的原件。读到或发表过，还不知道用户是否看过，也不会改写原来的输入或放宽到任意作品。旧版本、别的地址、新资料和刚排除的来源仍各看各的。' },
    { role: 'system', content: '一段委托也可能按先后推进：先修原作，再读修好的版本继续调整。scopedSourceLimits里的appliesTo保留限制所对应的那件事或那一步；后一步的材料条件要等那一步真正开始时再对应，不能倒过来阻断前一步所需的原稿。providedProgramReference可以帮助分清手上是实际读到的旧稿，还是本轮刚发表的修订。维护同一作品时，对方明确希望保留的功能也有读取原声明的理由；不用对方逐个说出内部字段名，仍要结合这次实际读取范围与修订需要判断。读旧声明、理解作品内容和打开其绑定的私人来源各有范围，认出同一作品不会替后两者补出许可。' },
    { role: 'system', content: 'providedImageContext是这轮主助手确实读到的一段原对话，原来的记录将它连到这次图片的确切版本。它能帮助认清“继续刚才”“没讲完的地方”；latestProvidedAssistant只说这次已经交来的前情，不说明用户是否看过。replyState为partial或还不知道是否上屏时，手上就只有真正留下的那一段，未发表的尾文仍没有到这里。旧回复代替不了图片，也不能证明当时看图看得对；认清所指后，再按眼前问题看还要读哪些画面、是否允许整图。用户只想看文字、只看局部、撤回或刚说不看了，都照新的意思做。已经能对应的回指，用户不用再贴一次图或报内部地址。' },
    { role: 'system', content: 'providedStudyReference带着程序刚检查过的同一张陪学纸、版本、题目来处和已经交到手上的那一段，还没有题目或答案正文。delivered_this_run表示这轮确实从原处读回、也交给了主助手；current_admitted_focus是对方这次在界面上指着的位置，整张旧纸还未必读过。对方说“眼前这一点”“接着想”，已有具体停点，不用重报题目、纸的名字或工具。沿原题和停点读回相关一小段，才能给下一点贴切的启发；即使另问一句泛化问题也可以，眼前这道题仍有自己的用途。题面已经完整，对方又想接回那张陪学纸，读回同一处自己的尝试和当前提示，也是在接住这件事，可以继续留在原纸上。每一步还是沿原话看需要什么、愿意读到哪里；别的题、别的版本或后面尚未看到的步骤，各按自己的范围。眼前有了地址，还不知道对方是否看懂或掌握。' },
    { role: 'system', content: 'currentRehearsalReference是程序这次检查过、仍与眼前试说位置相符的地址，还没有正文。它帮助认出“刚才那句／现在想说的意思”。练习台词、助手扮演的说法和用户此刻对助手提出的整理或回顾，要各自读懂：台词仍是试说，同一句里另外真正提出的请求也值得接住。读哪个对象、哪段时间和哪些内容，继续沿这次原话取所需部分。地址不会新增权限，也说明不了真实态度、整段历史是否读过或更宽时间窗是否相关；用户明确限制的来源仍按原约定。' },
    { role: 'system', content: 'hostParameterRoles帮助认清参数各自说明什么。current_request里的source说明用户这次托付了哪一步，想回顾的经历则另有citations和真正读过的原来源；用户不用在一句许可里重讲那些经历。练习和模拟继续保留它们原来的身份。window时间、涉及谁、从哪里读和具体范围，仍照原话分别看清；参数说明本身还没有给出allowed，也没有同意更宽、未知或未来的范围。' },
    { role: 'system', content: 'rehearsalActivityTiming是程序从已检查过或已经交来的read/manage结果找到原记录，再按当前确切版本和全部原来源重查的时间信息，里面没有正文。sourceReceived说的是原话何时收到，ownerCreatedAt/ownerUpdatedAt说的是记录何时创建或更新；它们还说明不了现实事件发生时间、连续练习了多久，或整段时间是否允许读取。它们可以帮助认清“刚才这段”，相隔几小时的记录仍不能当成几分钟连续练习。要读的时间窗、原话和引用各自检查，单个时间或地址也不会给出allowed。' },
    ...(presence ? [{ role: 'system' as const, content: '这次用户没有发来新消息。对方选过欢迎偶尔先开口，伙伴正准备一条可以不接的分享。hostPresence带着程序刚检查过的这次入口、当前选择、原对话和能用的来源，它不是用户这次说的话，也不是模型自己提出的理由。想请你看看，这项读取或公开搜索能为眼前分享带来什么，范围是否合适。neededForCurrentRequest在这里说的是这条分享需要什么；常识或新创作未必要读私人经历，想接真实相处时，只读相关且仍允许的那一点前情。公开搜索可以帮忙查证或找材料，真正发出的词仍要看清，私人原话和身份留在原处。这次没有新的办事托付，不会因此恢复旧活动，也不替用户决定、记下一项选择或向外发送。旧资料里的明确限制仍然算数；账号、来源和期限由程序检查，这里也没有一条需要补写的当前sourceQuote。' }] : []),
    { role: 'user', content: JSON.stringify({ ...(presence ? { hostPresence: presence } : { original }), proposed,
      hostContract: presence ? '这条主动分享还没发出。程序会在这次理解前后重查原presence入口，这份判断只帮眼前这项读取，原来的来源、期限和行动选择都照旧。'
        : '程序会把眼前的时间、时区和来源里已有的说法对应到参数。对方说本学期，不必自己写出内部学期标识；先看相关学期目录，正可以找到那一学期。想停下、暂停或改一件已有托付，也可能需要先认出那一项和它现在的状态。这一步只帮忙找到原对象，其他人的资料、无关经历和新的跟进仍各按原来的约定。' }) },
  ] });
  return { allowed: value.allowed && value.neededForCurrentRequest, reason: value.reason, ...(!presence ? { sourceQuote: original } : {}) };
}
