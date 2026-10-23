import { generatePrompt } from '@openuidev/lang-core';
import { z } from 'zod';
import { getInteractiveProgramSpec } from '../../shared/interactive-library';
import { PROGRAM_LIBRARY_VERSION } from '../../shared/interactive-program';
import { HarnessError } from '../../shared/harness';
import type { WorkflowSkill } from './skills';

export const INTERACTIVE_PROGRAM_METHOD_ID = 'interactive-program';

/** Small public capability metadata. Actual grammar is fetched only as a
 * method; no data, persona instruction or generated demonstration lives here. */
export function interactiveProgramCapabilityHint() {
  return { libraryVersion: PROGRAM_LIBRARY_VERSION,
    method: { tool: 'read_skill', arguments: { id: INTERACTIVE_PROGRAM_METHOD_ID } },
    authoring: { tool: 'read_skill', arguments: { id: INTERACTIVE_PROGRAM_METHOD_ID, section: 'authoring' } },
    meaning: '把用户正在谈的内容做成可操作的作品，沿当前角色回应正在看什么、有意义的变化、接下来可试之处与自己的取舍。源码和签名供内部构作使用；用户明确询问实现时才展开实现。新作可一次读取authoring完整构作契约，已核当前作品则按需读原作与新增／报错签名。method缺省按本轮真实作品引用选择，不读取资料或增加权限。' };
}

type Signature = { signature: string; description?: string };
const methodWelcome = '这份材料把你手边能用的纸页、图形、局部输入和声音放在一起，供你照着眼前的问题自由组合。和人相处的仍是你：依照当前的人格、称呼与昵称，说说你发现了什么、为什么想一起看这一处、接下来可以试什么。字段和源码留在构作时查；对方问到实现，再把相关细节讲清楚。构作诊断是帮你自己接着修稿的材料；括号、类型和字段的问题能自己解决时，继续把作品做好，让交流跟着可操作的内容和其中的发现走。确实影响了结果、需要对方补充或作决定的地方，再按眼前情况自然讲清，不让他承担内部修稿过程。';
const compositionGuidance = '首屏围绕眼前最值得看和试的关系展开，让主体和必要操作在一起，公式、解释和辅助controls随它们各自的作用就近放置。Document.title本身就是可见标题，控件名称也已承担操作说明；图前后可以把篇幅留给有意思的发现与变化。现有暖灰纸面用ink承载主内容、muted承载辅助信息、克制的accent强调正在看的部分，留白随这一件作品的节奏来安排。';
const eachValueGuidance = '画函数图像、波形与叠加、衰减、轨迹这类由式子决定的曲线时，优先用 Curve：写一条式子，把要拖动的量放进 params 绑定 $ui，宿主原生取点，几乎不占计算上界；Each/Range 留给真实数据点列。Each返回内联模板值组成的有限数组，可直接用于组件属性，不限于children。需要点列或数值序列时，可在集合与执行安全上界内把有限Range逐项映为{x,y}对象、有限标量或null，也可将标量数组交实际Points函数；依据所用属性的真实签名选择。迭代变量只在自己的内联模板中可见，模板不提取成引用该变量的外部声明；使用实际纯函数计算各项，保留null缺口，无需为每个点手写展开DSL。';
const nullableValueGuidance = 'Choose必须显式给出真／假／未知三路值；只有条件可证为布尔或null且三路均为明确布尔，结果才可直接用于原生布尔运算。结果含null或类型未知时不直接用&&／||，为未知分支给出符合当前问题的纯值。Known只判断值是否非null／undefined，不会把它的参数缩窄成number或boolean。';
const sharedProcessGuidance = '相关画面可借Document的presentation=flow，让不同Paper和解释段落交织，并共享同一$ui；需要联动的机构和操控由此留在同一作品里。复杂作品先发表有意义、确实可操作的主体，再沿返回的programRef用previous+patch接着增加部件、解释与联动，让人一边玩一边看你继续做；其余要求仍在同一作品中继续完成，已发表的一小段不代替整项交付。一直按住的状态与触发后自行发展的过程各有含义：例如物体已经脱离驱动，Motion的releaseBehavior=finish就能让有限运动在松手后完成。声音若对应某个接触时刻，Voice.trigger可比较同一个局部时间是否越过该点，以false→true击发，音画便沿同一过程前进。数值、阶段与近似怎样取舍，仍要回到眼前原理来判断。';
const processGuidance = '关键部件读同一组局部量，关系和因果就能在操作里看出来。Press既能成为正文中的按住按钮，也能在Graphic里包住Rect/Polygon等可按几何；field表达持续按住，triggerField表达一次新击发，脱离驱动后的自由阶段可沿独立Motion轨道继续。Voice是放在Document/Flow等view容器里的声音部件，和图读同一状态；一次碰撞对应一次击发。延迟击发也可以由用户启动的有限Motion在接触时改变整数triggerField一次，gate则表达是否继续维持。输入参数与观察位置可以保留；按住、声音门、踏板和正在走的时间/事件计数声明transient:true，重开回声明initial，所以回来仍是安静的一页。少量就近的控件通常已经够用，声音入口也由宿主放在同一纸面。具体字段与上下界可查相应签名和反馈。';
const creationExample = '一种可供参考的陪看方式：若眼前是理想摆，先讲清绳长不变、摆球只在两侧来回摆动、忽略摩擦与空气阻力，并以最低点为重力势能零点。可以邀请对方“把摆球往左拉一点，看看它为什么又回来了”；慢看到最高点那一瞬，再一起发现速度为零、机械能全在重力势能里，随后看它怎样变回动能。若后来加入阻力，就把新的假设和损失表现出来。这只是一个从真实关系挑操作与解释的例子；当前要看什么、怎么说、怎样摆在纸上，都由你照眼前的人和问题来决定。';
const programReadGuidance = '续接原作用read_interactive_program的默认overview看有限呈现与状态预览，按返回的stateOrigin/coverage理解当前值；完整状态声明用mode=states及所需stateKeys，复制next按需续页。确需源码细节才用mode=source按绝对Unicode offset/limit分页，find只定位字面位置；显式full:true才请求全文且不与offset/limit/find混用，概要或末页不代表整份源码、曲线点列或SourceSlot原文已读。present_view.program有两个互斥入口：dsl提交完整稿；同作局部续改用真实previous加patch，只给完整原生声明，按声明名替换／新增，name=null显式删除，不自动清理未提及声明。承诺保留原内容时先读清需要保留的源码与真实状态，不把局部稿当整稿提交。stateChanges只列显式字段声明变更，inputChanges只列显式条件改值；局部续改只沿stateOrigin对应的本次Enter冻结输入；没有本次正式inputs时沿原版本document.initialState，不偷搬处理期间后来拖动的live值。已有字段改声明不暗改当前值，新字段用initial，Reset仍按声明默认；不兼容时原处拒绝，不clamp或重置。整稿仍按其states.initial，不自动carry。空patch也须有明确字段／条件／新绑定变化；旧绑定只可沿当前合法、未过期live原资料继承，历史或缺资料先回原owner读，不补空数据。已读且仍适用的内容直接复用，仅新增原语或具体报错时按精确names补方法，不为同作修订重读整册。同作修订直接复制读取结果的previous：id对应programId（或已发表programRef.id），expectedRevision对应同一原版本revision（或programRef.revision），不是messageId，也不预加1；该形状不保证最新头部、不自动重定版本，真实冲突沿原合法入口重读。';
function signatures(entries: Record<string, Signature> | undefined) {
  return Object.entries(entries || {}).map(([name, entry]) => ({ name,
    signature: entry.signature, ...(entry.description ? { description: entry.description } : {}) }));
}

export const interactiveProgramMethodReadFields = {
  section: z.enum(['authoring', 'overview', 'grammar', 'components', 'functions', 'actions']).optional()
    .describe('仅interactive-program：authoring一次提供全部实际构作签名、严格元数据和核心语法；缺省且本轮没有已核当前作品或实际交付的原作读取时默认authoring，否则overview。显式section优先。编辑按需读source与新增／报错names，原小页和grammar仍可用。'),
  names: z.array(z.string().min(1).max(80)).max(16).optional()
    .describe('仅该方法的签名分段：从总览复制需要的精确组件/函数/动作名称；不填则按定义顺序分页，不是场景或话题筛选。'),
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional().describe('仅该方法分段：复制methodRead.next中的位置。'),
  limit: z.number().int().min(1).max(12).optional().describe('仅该方法签名分段：本页完整条目数，默认6；按所选names和offset返回该页，复制next续页，不按估算tokens或bytes再裁短。'),
};
export type InteractiveProgramMethodRead = { section?: 'authoring' | 'overview' | 'grammar' | 'components' | 'functions' | 'actions';
  names?: string[]; offset?: number; limit?: number };
const methodReadInput = z.object(interactiveProgramMethodReadFields).strict();
type MethodSection = NonNullable<InteractiveProgramMethodRead['section']>;
type MethodReadLink = { tool: 'read_skill'; arguments: { id: typeof INTERACTIVE_PROGRAM_METHOD_ID; section: MethodSection;
  names?: string[]; offset?: number; limit?: number } };
type OverviewRead = { section: 'authoring' | 'overview' | 'grammar';
  coverage: { scope: 'authoring_contract' | 'overview_and_name_catalogs' | 'grammar_only'; complete: true; wholeMethodProvided: false;
    signatures?: { components: number; functions: number; actions: number }; scalarSchemaProvided?: false; parameterConstraintsProvided?: true; toolSchemaProvided?: false };
  sections: Record<string, MethodReadLink>; next: null; meaning: string };
export type SignatureRead = { section: 'components' | 'functions' | 'actions'; names?: string[]; unknownNames?: string[];
  coverage: { scope: 'requested_names' | 'whole_section'; offset: number; returned: number; total: number; catalogTotal: number;
    complete: boolean; wholeMethodProvided: false };
  next: MethodReadLink | null; meaning: string };
export type MethodReadMetadata = OverviewRead | SignatureRead;
type ProgramSpec = ReturnType<typeof getInteractiveProgramSpec>;
type MethodEntry = Signature & { name: string; kind?: string; childSlot?: string; stateKind?: string }
  & Partial<ProgramSpec['functions'][string]>;
function methodCatalogs(actual: ProgramSpec): Record<'components' | 'functions' | 'actions', MethodEntry[]> {
  return {
    components: signatures(actual.library.components).map(entry => ({ ...entry, ...actual.components[entry.name] })),
    functions: signatures(actual.library.functions).map(entry => ({ ...entry, signature: `@${entry.signature}`, ...actual.functions[entry.name] })),
    actions: signatures(actual.library.actions).map(entry => ({ ...entry, signature: `@${entry.signature}` })),
  };
}
function signatureLine(entry: Signature & { name: string }) {
  const { name: _name, signature, description, ...metadata } = entry;
  return signature + (description ? ' — ' + description : '')
    + (Object.keys(metadata).length ? ' ' + JSON.stringify(metadata) : '');
}

/** A projection of this library's real schema, never a second set of rules. */
function parameterConstraints(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const schema = raw as Record<string, unknown>, result: Record<string, unknown> = {};
  for (const key of ['$ref', 'type', 'const', 'enum', 'default', 'required', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
    'multipleOf', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties'])
    if (Object.hasOwn(schema, key)) result[key] = structuredClone(schema[key]);
  if (schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties))
    result.properties = Object.fromEntries(Object.entries(schema.properties).map(([name, property]) => [name, parameterConstraints(property)]));
  for (const key of ['items', 'additionalProperties', 'propertyNames']) if (Object.hasOwn(schema, key)) result[key] = parameterConstraints(schema[key]);
  for (const key of ['anyOf', 'oneOf', 'allOf']) if (Array.isArray(schema[key]))
    result[key] = [...new Map(schema[key].map(value => { const part = parameterConstraints(value); return [JSON.stringify(part), part]; })).values()];
  return result;
}

/** Return only the requested complete part. A full-method identity in the
 * descriptor never means that omitted signatures were delivered/read. */
export function interactiveProgramMethodPage(raw: InteractiveProgramMethodRead = {}): { instructions: string; methodRead: MethodReadMetadata } {
  const input = methodReadInput.parse(raw), section = input.section || 'overview';
  const names = input.names?.length ? [...new Set(input.names)] : undefined;
  const offset = input.offset || 0, limit = input.limit || 6;
  if ((section === 'authoring' || section === 'overview' || section === 'grammar') && (names?.length || offset
    || section === 'authoring' && input.limit !== undefined))
    throw new HarnessError('method_part_parameters', 'authoring整体交付，不按names／offset／limit裁短；总览与语法不按条目定位，具体签名选择components、functions或actions。');
  const actual = getInteractiveProgramSpec(), catalogs = methodCatalogs(actual);
  const full = interactiveProgramWorkflowSkill();
  const syntaxStart = full.instructions.indexOf('## Syntax Rules\n');
  const syntaxEnd = full.instructions.indexOf('## 当前编译器实际接纳的语言规则', syntaxStart);
  const syntax = full.instructions.slice(syntaxStart, syntaxEnd).trim();
  const builtinStart = full.instructions.indexOf('## 当前实际允许的原生函数\n');
  const builtinEnd = full.instructions.indexOf('## 当前实际局部动作', builtinStart);
  const builtins = full.instructions.slice(builtinStart, builtinEnd).trim();
  const grammar = [syntax, '## 当前实际接纳规则\n' + JSON.stringify(actual.rules),
    builtins, '## 当前实际有限范围\n' + JSON.stringify(actual.limits)].join('\n\n');
  const read = (part: MethodSection, position?: number): MethodReadLink => ({ tool: 'read_skill', arguments: {
    id: INTERACTIVE_PROGRAM_METHOD_ID, section: part, ...(names ? { names } : {}),
    ...(position !== undefined ? { offset: position, limit } : {}) } });
  if (section === 'authoring') {
    const prelude = full.instructions.slice(0, syntaxStart).trim();
    return { instructions: [prelude, grammar,
      '## 当前实际组件完整签名与参数约束\n' + catalogs.components.map(entry => signatureLine(entry)
        + '\nparameterConstraints: ' + JSON.stringify(parameterConstraints(actual.schema.$defs?.[entry.name]))).join('\n\n'),
      '## 当前实际纯函数完整签名与严格元数据\n' + catalogs.functions.map(signatureLine).join('\n\n'),
      '## 当前实际局部动作完整签名\n' + catalogs.actions.map(signatureLine).join('\n\n'),
      'parameterConstraints从当前共享定义投影出required/default、枚举、数值与长度上下界和嵌套引用；default表示原生组件可补的默认值，$ref仍指向同一库中的命名定义。本页提供构作签名、这些精简约束与核心语法，完整scalar schema仍可按components/names读取；present_view包络见工具schema。编辑时可按真实原作和新增或报错位置补读，已知适用的签名就直接复用。',
    ].join('\n\n'), methodRead: { section,
      coverage: { scope: 'authoring_contract', complete: true, wholeMethodProvided: false,
        signatures: { components: catalogs.components.length, functions: catalogs.functions.length, actions: catalogs.actions.length },
        scalarSchemaProvided: false, parameterConstraintsProvided: true, toolSchemaProvided: false },
      sections: Object.fromEntries((['overview', 'grammar', 'components', 'functions', 'actions'] as const).map(part => [part, read(part)])),
      next: null, meaning: '本页构作契约整体提供；完整签名不代表所有参数schema或资料正文已读，也不增加来源、用途或执行许可。' } };
  }
  if (section === 'overview' || section === 'grammar') {
    const minimalSyntax = syntax.split('\n').filter(line => /^(?:[123]\.|- Strings)/.test(line)).join('\n');
    const builtinSignatures = builtins.split('\n').filter(line => line.startsWith('@'));
    const componentNamesByKind: Record<string, string[]> = {};
    for (const entry of catalogs.components) (componentNamesByKind[entry.kind || 'unknown'] ??= []).push(entry.name);
    const instructions = section === 'grammar' ? grammar : [
      methodWelcome,
      `可操作的内容仍放在原消息里。DSL写进present_view.program，libraryVersion=${actual.libraryVersion}；states/bindings/previous的包络见当前工具schema。宿主提供$ui，DSL读取它；状态写入走下面的有限局部操作。组件名称直接调用，纯函数与局部动作以@名称调用，参数按位置。`,
      compositionGuidance,
      processGuidance,
      sharedProcessGuidance,
      '数值计算用实际纯函数，保留null与缺口。Data只绑当前真正读到的observationId与字面JSON路径；普通旧助手正文只能用来找原owner再读，旧bindingOrigins/priorDelivery不是新读取。局部输入是这次作品的试想，不是本人事实、偏好或行动许可。修改同一作品用真实previous id/revision；Continue接同一输入、保原稿、不自动发送。' + nullableValueGuidance,
      programReadGuidance,
      '## 原生最小入门语法\n' + minimalSyntax,
      '普通声明可通过名字复用，要呈现的声明应从root可达；组件参数顺序以其实际签名为准。完整语法、运算／索引规则和有限上界可按需读grammar，使用已读到的部分即可，不把整页规则加载当成前置。',
      '## 当前实际允许的原生函数\n' + builtinSignatures.join('\n'),
      actual.rules.allowedBuiltins.includes('Each')
        ? 'Each的模板就地内联，varName只在该模板中可见，不提为新的全局名；可从有限集合返回点对象、标量、null或组件数组，用在实际接纳该类型的属性或children。' : '',
      'SourceSlot只引用本次已准入的真实sceneRef，保持原Surface与选择入口；它不读取额外来源或授予Data绑定。局部动作只经过受检状态适配，不执行任意工具或写业务。',
      '## 实际组件完整名称（按kind，签名另读）\n' + JSON.stringify(componentNamesByKind),
      '## 纯函数完整名称（签名另读）\n' + catalogs.functions.map(entry => entry.name).join(', '),
      '## 局部动作实际签名\n' + catalogs.actions.map(signatureLine).join('\n'),
      '按当前作品需要，从methodRead.sections读取所需的精确names即可，不必遍历全目录。每页是完整条目，复制next继续确实还需要的部分；不要为wholeMethodProvided=false把整册读完当作使用前置。名称目录不代表签名已经读过，完整版本hash也不代表已读全文。用已读签名组合，具体反馈回来再修，不向用户复述内部方法或声称尚未显示的结果。',
    ].filter(Boolean).join('\n\n');
    return { instructions, methodRead: { section, coverage: { scope: section === 'overview' ? 'overview_and_name_catalogs' : 'grammar_only', complete: true, wholeMethodProvided: false },
      sections: Object.fromEntries((['grammar', 'components', 'functions', 'actions'] as const).map(part => [part, read(part)])),
      next: null, meaning: '这里只交付所选方法部分；所需签名读到即可使用，不以读完整册为前置，其余内容没有预先计为已读。' } };
  }
  const catalog = catalogs[section];
  const selected = names ? names.flatMap(name => { const row = catalog.find(entry => entry.name === name); return row ? [row] : []; }) : catalog;
  const page = selected.slice(offset, offset + limit), nextOffset = offset + page.length < selected.length ? offset + page.length : null;
  const delivered = section === 'components' ? page.map(entry => ({ ...entry,
    parameterSchema: actual.schema.$defs?.[entry.name],
  })) : page;
  return { instructions: `## ${section} · 实际共享库 ${actual.libraryVersion}\n` + delivered.map(signatureLine).join('\n\n')
    + (section === 'components' ? '\n\nparameterSchema直接来自当前共享组件定义，按同一签名参数顺序给出固定字段、枚举、默认值与上下界；$ref指向当前共享库中命名的组件。它不是用户资料或新权限。未展示的组件仍沿原目录按需读取；不必为一次修订重读整册。' : ''),
    methodRead: { section, ...(names ? { names, unknownNames: names.filter(name => !catalog.some(entry => entry.name === name)) } : {}),
      coverage: { scope: names ? 'requested_names' : 'whole_section', offset, returned: page.length,
        total: selected.length, catalogTotal: catalog.length, complete: nextOffset === null, wholeMethodProvided: false },
      next: nextOffset === null ? null : read(section, nextOffset),
      meaning: '仅本页完整签名已提供；过滤未命中或这一段读完，不表示整份方法或其他部分已读。' } };
}

/** The native generator supplies syntax; its default tool/actions tutorial
 * is deliberately not injected into this host's smaller admitted language. */
export function interactiveProgramWorkflowSkill(): WorkflowSkill {
  const actual = getInteractiveProgramSpec();
  const syntaxPrompt = generatePrompt({ ...actual.library, components: {}, componentGroups: [],
    functions: {}, actions: {}, tools: [], toolCalls: false, bindings: false, builtinFunctions: false,
    examples: [], toolExamples: [], editMode: false, inlineMode: false, preamble: '', additionalRules: [] });
  const start = syntaxPrompt.indexOf('## Syntax Rules\n');
  const end = syntaxPrompt.indexOf('\n## ', start + 1);
  if (start < 0) throw new Error('当前OpenUI库没有提供可读取的原生语法说明。');
  const syntax = syntaxPrompt.slice(start, end < 0 ? undefined : end).trim();
  const builtinPrompt = generatePrompt({ ...actual.library, components: {}, componentGroups: [],
    functions: {}, actions: {}, tools: [], toolCalls: false, bindings: false, builtinFunctions: true,
    examples: [], toolExamples: [], editMode: false, inlineMode: false, preamble: '', additionalRules: [] });
  const lines = builtinPrompt.split('\n');
  const builtins = actual.rules.allowedBuiltins.map(name => {
    const signature = lines.find(line => line.startsWith(`@${name}(`));
    if (!signature) throw new Error(`当前OpenUI库没有给出${name}的原生签名。`);
    return signature;
  });
  const { components, functions, actions } = methodCatalogs(actual);
  const instructions = [
    methodWelcome,
    '从眼前的问题决定值得一起动什么、动后能发现什么，再来编写这件作品。普通文字能说清的部分就自然说，适合动手看的部分再挑这些共享原语组合；以前的作品也可启发新的取舍。',
    compositionGuidance,
    processGuidance,
    sharedProcessGuidance,
    creationExample,
    `把DSL放进present_view.program；libraryVersion使用${actual.libraryVersion}。该工具的当前schema给出states、bindings和previous的真实包络。states只声明有限的局部输入；宿主生成$ui初值，DSL读取它，不自行声明$变量、重新赋值或写入来源数据。`,
    '来源数据先由当前合法工具真正读到，再按其observationId和字面JSON路径绑定alias；Data只读取这些已核别名。自己创作的说明、标签与计算假设可以直接写，但不能把编造的记录当真实来源。用户局部输入是本次试想，不据点击或拖动保存偏好、决定或业务状态。',
    '普通助手历史可用于找到来处，不直接把旧答复绑成Data。需要其中资料时，沿实际返回的原作品、笔记或其他owner入口按本次请求重读，再用新observationId绑定。原程序read给的bindingOrigins、priorDelivery和sourceNavigation是历史线索，不是已完成的新读取或可直接照抄的工具参数；未知来源不补造。',
    programReadGuidance,
    '只用下面实际库给出的签名和类型。组件直接以名称调用，纯函数和局部动作以@名称调用；参数按位置传递，原生语法中的占位名称不是额外组件。可先定义并复用表达式；数值派生使用实际纯函数，保留null与缺口，不能用0顶替未知。' + nullableValueGuidance,
    '修改同一件作品时带previous的真实id和expectedRevision；需要接着聊时让本节点和实际局部输入回同一composer，原稿保留、不自动发送。作品的内容与布局由你编排，来源、状态和业务边界由宿主守住，不把它们写成角色的默认台词。',
    syntax,
    '## 当前编译器实际接纳的语言规则\n' + JSON.stringify(actual.rules),
    '## 当前实际组件签名、用途与容纳关系\n' + JSON.stringify(components),
    '## 当前实际纯函数签名与返回种类\n' + JSON.stringify(functions),
    '## 当前实际允许的原生函数\n' + builtins.join('\n'),
    eachValueGuidance,
    '## 当前实际局部动作\n' + JSON.stringify(actions),
    '## 当前实际有限范围\n' + JSON.stringify(actual.limits),
    '这些目录和规则直接由本次共享库生成。没有列出的原生工具调用、外链、状态写法或函数不会因OpenUI通用文档提过就自动可用；使用当前真实库，收到具体反馈时修正这一件作品，不伪称它已经显示或生效。',
  ].join('\n\n');
  return { id: INTERACTIVE_PROGRAM_METHOD_ID, version: String(actual.libraryVersion),
    name: '把眼前想法做成可动的小作品',
    description: '主模型自由组合通用OpenUI文字、图形、局部输入与动效；新作可用read_skill的section=authoring一次取得实际共享库全部构作签名与核心语法，编辑沿原作与精确delta页。没有按话题预置的演示，不改变角色或权限。',
    requirements: [{ kind: 'tool', name: 'present_view', purpose: '通过当前真实program输入在原消息呈现通用交互作品' }], instructions };
}
