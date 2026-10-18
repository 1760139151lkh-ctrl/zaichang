import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Reviewed procedural guidance. Reading it never executes code or grants access. */
export interface WorkflowRequirement {
  kind: 'tool' | 'capability';
  name: string;
  purpose: string;
  optional?: boolean;
  coverageNote?: string;
}
export interface WorkflowAvailability {
  state: 'available' | 'not_connected' | 'not_authorized' | 'not_registered' | 'unknown';
  version?: string;
  sourceId?: string;
  reason?: string;
}
export type WorkflowResolver = (requirement: WorkflowRequirement) => WorkflowAvailability | undefined;
interface WorkflowSkill {
  id: string;
  version: string;
  name: string;
  description: string;
  requirements: WorkflowRequirement[];
  instructions: string;
}

const skills: readonly WorkflowSkill[] = [
  {
    id: 'memory-investigation', version: '1', name: '找回前情与核对记忆',
    description: '跨轮接续、记得理由和例外、处理矛盾或更正；先找相关原文，再沿时间展开。可把独立的旧事调查交给有界只读子任务。',
    requirements: [
      { kind: 'tool', name: 'search_context', purpose: '寻找有来源的理解和未提取原文' },
      { kind: 'tool', name: 'read_evidence', purpose: '展开原话、前后文和长文未读部分' },
      { kind: 'tool', name: 'read_understanding', purpose: '取得完整条件、例外、状态和来源指针' },
      { kind: 'tool', name: 'restore_collaboration', purpose: '恢复同一事项的未决请求和已确认选择', optional: true },
      { kind: 'tool', name: 'delegate', purpose: '并行调查彼此独立的前情，父助手统一消费证据', optional: true },
    ],
    instructions: `从当前原话决定需要找回哪件事、哪个理由或哪次选择；当前材料足够时直接继续，不为每句话查记忆。先保留当前纠正，再用 search_context 检索相关内容。搜索结果只是候选；核对人物、现实或假设、当时日期、适用条件、来源及当前状态。需要时用 read_understanding 取得整条理解，用 read_evidence 按 nextOffset 继续读取原文；片段没提到不等于原文没有。跨轮理由沿原文定位展开前后文，不靠相邻话题猜同一对象。
没有命中时换同义表述、旧对象名或时间界限，并检查搜索覆盖；已有记录可查时不立即让用户重讲。来源不准读则保留这个准确缺口，不扩大用途。旧日程、学校计次等当前业务事实回读对应业务能力，记忆只提供历史理由和条件。
独立而复杂的历史调查可以用 delegate：任务中写清要回答的问题、允许来源、必要原文ID、时间范围、已知纠正和停止条件；只给必要上下文。要求返回事实与推断分开、每条事实的证据ID和定位、时间、条件、冲突、仍未查到什么以及是否受预算截断。简单的两三次读取直接完成。子任务不能改记忆、日历、角色或授权；父助手必须消费结果，核对当前版本，不能把相同原文的多个转述算作独立证据。失效或迟到结果不恢复撤回的结论。
用户说“忘掉这条判断，原话留着”时，按精确对象和用途执行已有隐私入口，不自动删除原聊天或独立已接受安排。只把足以支持本次任务的已核前情带回自然对话，不向用户倾倒记忆管理步骤。`,
  },
  {
    id: 'schedule-planning', version: '1', name: '安排下一段时间',
    description: '结合真实课程、已接受安排、连续时间、转场和当前意愿，比较少量可行方案；接受后更新原对象并核对回执。',
    requirements: [
      { kind: 'capability', name: 'situation.read', purpose: '读取指定时间窗内已知的承诺、目标与覆盖' },
      { kind: 'capability', name: 'planning.preview', purpose: '检验时间冲突与原对象版本绑定的修改方案' },
      { kind: 'capability', name: 'planning.draft', purpose: '从任务时长和连续性约束生成新时段候选', optional: true },
      { kind: 'tool', name: 'resolve_time', purpose: '将具体本地日期和IANA时区转换为真实时刻', optional: true },
      { kind: 'tool', name: 'change_local_action', purpose: '在真实授权下修改同一已存安排', optional: true },
      { kind: 'tool', name: 'prepare_action', purpose: '在真实授权下保存新安排或提醒', optional: true },
    ],
    instructions: `先理解用户真正想保住什么：学习、休息、朋友、探索都可成为目标，不默认填满空档。明确所需时间窗和本轮时区，按需读 situation.read。硬承诺、可移动但已接受的安排、邀请、愿望与草案分别处理。检查来源覆盖和具体课次例外；空日历只表示已知记录为空，不证明现实空闲或精力充足。
只补会改变方案的关键条件：剩余时长范围、最小连续块、必要地点或设备、交通和准备成本。已有原话或允许工具能查到的先查；未知结束时间保留未知，不默认一小时。提出少量有真实取舍的候选并用 planning.preview 检查。方案沿当前依赖版本保存，同一对象修改带回原ID和revision；发生变化只调整受影响部分。
需要安排多项任务时可用 planning.draft。采用其方案必须按 acceptanceProposals 的 order 逐项使用完整 arguments，保留 planRef；不能只保存工作核心时间，不能删掉准备、收尾、转场、休息或保护留白。提议不是新授权，宿主仍在每步核查身份、策略、来源版本、整个日历及精确参数。票据只在本进程内短时有效，重启、过期或来源不能复验时重新读取并生成，不绕过 blocked。整组不是原子提交，按实际进度说明哪些已保存；中途失败不能称全部完成，也不能将已保存部分重复创建。
“能怎么安排”支持比较；“就按第二个改”或仍有效的持续授权才支持对应提交。已有明确且充分的可撤销本地委托直接沿宿主执行，不反复确认；否则先准备可审阅方案。新建用 prepare_action，旧对象用 change_local_action，不能重复创建同名安排。成功后按真实回执说明保存结果；结果未知先 inspect_action 核查原动作。
用户只在倾诉或说今晚不安排时，可以不规划。固定提醒遵守自己的约定；减少普通建议不自动取消已经明确设定的提醒。`,
  },
  {
    id: 'contextual-outing', version: '1', name: '把出行准备妥当',
    description: '按当下意图自然结合地点、课次、路线与所需天气窗口；检查起点质量、数据覆盖和到达余量，安静准备可用材料。',
    requirements: [
      { kind: 'capability', name: 'map.relations', purpose: '按稳定地点和起点质量准备版本化路线' },
      { kind: 'capability', name: 'weather.lookup', purpose: '查所需公开地点和小时或日期窗口', optional: true },
      { kind: 'capability', name: 'air_quality.lookup', purpose: '户外活动确实需要时查询公开参考地点的空气质量', optional: true,
        coverageNote: 'US AQI、EU AQI和中国AQI不是同一口径；公开参考点的模型或预报数据不等于个人实时暴露。' },
      { kind: 'capability', name: 'situation.read', purpose: '按出行用途核对具体承诺和时间', optional: true },
      { kind: 'capability', name: 'map.location_status', purpose: '确实需要时检查已经共享的设备观察质量', optional: true,
        coverageNote: '设备观察不等于本人所在处；本机Windows位置不能称为手机实时GPS。' },
    ],
    instructions: `用户问出行或有效托付涉及地点变化时，主动发现并使用相关能力，不等用户点名“地图、天气、GPS”。先利用原话给出的起点和目的地；只有位置会改变结论且当前范围允许时才读取已有设备位置，能用公共参考地点满足天气问题就不读取精确私人坐标。不因一句“在路上”自动创建导航任务。
核对目的地稳定ID、具体发生时间、起点来源/精度/时间与地图版本。地点名字查不到时继续发现能力或缩短名称，不能编ID。map.relations 的估计连接、步行条件、入口未知和交通模式须保留；不能把现有步行图换说成骑行或无障碍精确ETA。教室换楼使旧路线失效，应按新版本重算。
天气按真正问题查询：某小时出发用时间窗，不用日级阴雨给分钟级保证。预报发布时间、获取时刻和实际观测不同；天气缺字段、范围不覆盖或空气质量能力未接入时准确保留未知，不用天气推断空气质量。
先准备真实可复用的路线和合理出发余量，再决定当前聊天呈现、等合适窗口提起还是安静保留。后台准备不抢镜头；展示地图不代表到达、接受安排或发送通知。展示前复核依赖；只把会改变用户选择的限制自然说明。`,
  },
  {
    id: 'campus-sports', version: '1', name: '核对体育次数与运动窗口',
    description: '查询真实体育记录、计次规则与期限；结合已知日程和天气比较运动窗口，区分有效次数、尝试次数和未核实自述。',
    requirements: [
      { kind: 'capability', name: 'campus.query', purpose: '发现体育资源、字段及真实账户记录',
        coverageNote: '连接成功不证明有有效跑步次数字段。先查resources/schema；practice_summary或sports标签不证明计次覆盖完整。' },
      { kind: 'capability', name: 'campus.imported_lookup', purpose: '账户未接入时读取用户已导入的体育或规则材料', optional: true,
        coverageNote: '本地导入与学校当前记录分别标记，不能把导入当作已完成账号查询。' },
      { kind: 'capability', name: 'situation.read', purpose: '在用户要求安排时查询相关时间窗', optional: true },
      { kind: 'capability', name: 'weather.lookup', purpose: '在安排户外活动时比较所需窗口预报', optional: true },
      { kind: 'capability', name: 'planning.preview', purpose: '检验自愿运动方案，不自动写入日历', optional: true },
    ],
    instructions: `用户询问跑步次数或已授权关注体育进度时，先发现当前 campus.query 的resources/schema，读取学校实际支持的体育记录。明确学期、统计截止、适用规则、有效次数、待审核、被拒绝和记录分页覆盖；接口名或体育分类不是“已查到有效跑步次数”的证据。不把不同计次口径相加，不把学校考试或实践总览当跑步明细。
账户未连接、该资源无权限或接口没有计次字段时，分别说明准确缺口。可使用已获准的本地导入或本轮用户给出的数字继续做条件计算，明确其依据；不为读取次数去索取密码，也不伪造学校认证。后续真实连接器应返回记录ID、版本、学期、有效性、分母规则、覆盖和观察时间。
需要规划时再读相关日程、规则期限和可用预报，比较多个可行窗口；还差几次不等于今天非跑不可。只在所有可行方案都依赖今天且条件已核实时才作唯一窗口判断。身体状态只按本人当下自述或获准数据理解，不由定位或沉默作诊断。先尊重休息和用户目标，已明确要求的提醒独立保留。
本地勾选或安排成功不改变学校有效次数。结果回来后把已核次数、尚未核的条件和一个实际有用的下一步说清楚；不暴露一排内部资源字段。`,
  },
  {
    id: 'quiet-initiative', version: '1', name: '有分寸地主动照应',
    description: '从有效托付、新变化或真实行动窗口发现帮助，主动查关键资料、先准备结果，并决定等待、顺势提起或不介入。',
    requirements: [
      { kind: 'tool', name: 'inspect_help', purpose: '核对已有准备、最近参与和明确限制' },
      { kind: 'tool', name: 'decide_help', purpose: '将真实材料与当前参与时机绑定' },
      { kind: 'tool', name: 'look_up', purpose: '发现并读取当前托付范围内必要能力' },
      { kind: 'tool', name: 'manage_attention', purpose: '按真实原话维持或调整持续托付', optional: true },
    ],
    instructions: `主动性来自完成有用准备并持续负责，不只来自多发一句提醒。在已有托付、当前请求和真实允许来源内，自己判断哪些事实值得补查；可以组合相关记忆、日程、公共天气与所需位置，但不把“了解用户”当成读遍所有私人来源的理由。人格里的热情不授予来源或行动权限。
先用 inspect_help 核对同一事项已做过什么、是否已有可复用材料、当前明确限制和有效窗口。来源变化、时间窗口、新目标关联都可带来实质帮助；新抓取时间、同一事实的改写和新写一份建议本身不构成再次打扰的理由。只读取会改变决定的资料，已有新鲜而适用的材料可直接复用。
帮助也包括期待活动开放、休息机会、朋友见面和具体的小进展，不只做风险雷达。根据当下决定安静准备、顺着当前话题提起、等待、问一个关键问题、提示或结束。prepare 引用真实观察和可用产物；“我把路线准备好了”必须有真实材料。没必要介入时安静完成内部更新，不发送完成报告。
展示与执行前重新核对来源、对象版本、期限和停止条件。用户撤回后迟到材料不再激活；一次建议被拒绝不等于永远不再关心，也不自动撤销明确固定提醒。持续托付允许的动作继续完成；范围外只先准备可审阅材料。`,
  },
  {
    id: 'recover-action', version: '1', name: '失败后继续把事情办清',
    description: '区分参数错误、暂时失败、未授权、过期与结果未知；核对原动作，保留已有成果，避免重复发送和假成功。',
    requirements: [
      { kind: 'tool', name: 'inspect_action', purpose: '查原动作和未知提交的真实回执' },
      { kind: 'tool', name: 'look_up', purpose: '重查能力契约、连接状态或当前业务版本', optional: true },
      { kind: 'tool', name: 'execute_approved_action', purpose: '只执行已有具体授权且未派发的动作', optional: true },
    ],
    instructions: `先看实际错误类别和动作阶段，不从一句“失败了”推断没有产生后果。参数无效时按schema修正原意；来源未连接或未授权时不反复重试；对象版本已变时回读原对象，重新判断这份修改仍适不适用。只读暂时网络失败可以在宿主预算和退避内有限重试，取消与撤权不能当网络失败重试。
写入超时或结果 unknown 时，用 inspect_action 的原动作标识和 reconcile 读取真实回执，不新建动作、不换幂等键重发。外部服务不支持核查时保留结果未知及下一可核渠道；不能根据本地缓存给成功结论。父任务停止后子任务不能继续提交，迟到回执只补充真实结果。
把已完成部分、未完成部分与可恢复材料分开保留。失败并不要求让用户重讲整个请求；只问当前确实阻塞的一项。最终自然地说清是否保存、是否发送以及还缺哪一步，不把尝试、批准、提交、送达和已读混为一谈。`,
  },
];

const listInput = z.object({
  query: z.string().max(400).default(''),
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  limit: z.number().int().min(1).max(20).default(12),
}).strict();

function descriptor(skill: WorkflowSkill) {
  return {
    id: skill.id, version: skill.version, name: skill.name, description: skill.description,
    contentHash: createHash('sha256').update(JSON.stringify(skill)).digest('hex'),
    requirementCount: skill.requirements.length,
  };
}

/** Search filters documentation only; it never routes a user's task or hides tools. */
export function listWorkflowSkills(options: { query?: string; offset?: number; limit?: number } = {}) {
  const { query, offset, limit } = listInput.parse(options);
  const normalized = query.normalize('NFKC').trim().toLowerCase();
  const words = normalized.match(/[a-z0-9_.:-]+|[\p{Script=Han}]+/gu) || [];
  const terms = [...new Set(words.flatMap(word => /\p{Script=Han}/u.test(word)
    ? [word, ...Array.from(word).slice(0, -1).map((point, index) => point + Array.from(word)[index + 1])]
    : [word]))];
  const ranked = skills.map(skill => {
    const text = `${skill.id} ${skill.name} ${skill.description} ${skill.requirements.map(item => item.name).join(' ')}`.normalize('NFKC').toLowerCase();
    return { skill, score: terms.reduce((score, term) => score + (text.includes(term) ? term.length : 0), 0) };
  }).filter(row => !normalized || row.score > 0).sort((a, b) => b.score - a.score);
  return {
    items: ranked.slice(offset, offset + limit).map(row => descriptor(row.skill)),
    nextOffset: offset + limit < ranked.length ? offset + limit : null,
    total: ranked.length, guidanceOnly: true as const,
    coverage: { query, matchingOnly: !!normalized, totalMatches: ranked.length,
      meaning: '只列按需工作方法；未命中不证明能力不存在。空query可分页查看全部方法。指南不读取私人资料、不执行动作、不增加权限。' },
  };
}

export function readWorkflowSkill(id: string, resolve?: WorkflowResolver) {
  const checkedId = z.string().min(1).max(100).parse(id);
  const skill = skills.find(item => item.id === checkedId);
  if (!skill) return { status: 'not_found' as const, guidanceOnly: true as const,
    reason: '没有这个工作方法；先查看目录中的精确ID。其他合法能力仍可直接使用。' };
  const requirements = skill.requirements.map(requirement => ({
    ...requirement,
    availability: structuredClone(resolve?.({ ...requirement }) || {
      state: 'unknown' as const, reason: '尚未核对本轮工具范围与实际连接；读取指南不代表这些能力已可调用。',
    }),
  }));
  return {
    ...descriptor(skill), status: 'read' as const, instructions: skill.instructions,
    requirements, guidanceOnly: true as const,
    readiness: requirements.every(item => item.optional || item.availability.state === 'available')
      ? 'ready_for_known_requirements' as const : 'conditional' as const,
    limitation: '可用只表示本轮已知工具入口和连接可用；具体查询覆盖、事实新鲜度及动作授权仍由实际能力和宿主逐次核验。指南可以只采用所需部分，不是强制流程。',
  };
}
