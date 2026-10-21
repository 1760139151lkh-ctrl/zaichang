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
const compositionGuidance = '围绕当前要看或试改的主体关系组织首屏，让主体与最必要操作先可见，公式、解释和辅助controls按作用就近安排，避免纵向堆满控件把主体挤出首屏。Document.title会直接显示标题，不再用同名Text重复一遍。沿现有暖灰纸面，用ink承载主内容、muted承载辅助信息、克制的accent强调当前焦点和真正变化；布局与取舍服务这一件作品。';
const eachValueGuidance = '画函数图像、波形与叠加、衰减、轨迹这类由式子决定的曲线时，优先用 Curve：写一条式子，把要拖动的量放进 params 绑定 $ui，宿主原生取点，几乎不占计算上界；Each/Range 留给真实数据点列。Each返回内联模板值组成的有限数组，可直接用于组件属性，不限于children。需要点列或数值序列时，可在集合与执行安全上界内把有限Range逐项映为{x,y}对象、有限标量或null，也可将标量数组交实际Points函数；依据所用属性的真实签名选择。迭代变量只在自己的内联模板中可见，模板不提取成引用该变量的外部声明；使用实际纯函数计算各项，保留null缺口，无需为每个点手写展开DSL。';
const nullableValueGuidance = 'Choose必须显式给出真／假／未知三路值；只有条件可证为布尔或null且三路均为明确布尔，结果才可直接用于原生布尔运算。结果含null或类型未知时不直接用&&／||，为未知分支给出符合当前问题的纯值。Known只判断值是否非null／undefined，不会把它的参数缩窄成number或boolean。';
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
    signatures?: { components: number; functions: number; actions: number }; scalarSchemaProvided?: false; toolSchemaProvided?: false };
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
      '## 当前实际组件完整签名\n' + catalogs.components.map(signatureLine).join('\n\n'),
      '## 当前实际纯函数完整签名与严格元数据\n' + catalogs.functions.map(signatureLine).join('\n\n'),
      '## 当前实际局部动作完整签名\n' + catalogs.actions.map(signatureLine).join('\n\n'),
      '本页完整提供上述共享库构作签名与核心语法，不含完整scalar参数schema或present_view工具schema；包络以当前工具schema为准，具体参数约束仍由原检查核验。无需再遍历相同签名小页；同作修订按前述整稿／局部声明入口与真实状态保留原内容，仅新增或具体报错的签名再按names补读。',
    ].join('\n\n'), methodRead: { section,
      coverage: { scope: 'authoring_contract', complete: true, wholeMethodProvided: false,
        signatures: { components: catalogs.components.length, functions: catalogs.functions.length, actions: catalogs.actions.length },
        scalarSchemaProvided: false, toolSchemaProvided: false },
      sections: Object.fromEntries((['overview', 'grammar', 'components', 'functions', 'actions'] as const).map(part => [part, read(part)])),
      next: null, meaning: '本页构作契约整体提供；完整签名不代表所有参数schema或资料正文已读，也不增加来源、用途或执行许可。' } };
  }
  if (section === 'overview' || section === 'grammar') {
    const minimalSyntax = syntax.split('\n').filter(line => /^(?:[123]\.|- Strings)/.test(line)).join('\n');
    const builtinSignatures = builtins.split('\n').filter(line => line.startsWith('@'));
    const componentNamesByKind: Record<string, string[]> = {};
    for (const entry of catalogs.components) (componentNamesByKind[entry.kind || 'unknown'] ??= []).push(entry.name);
    const instructions = section === 'grammar' ? grammar : [
      `沿当前角色自然交流。互动能让人看见、试改或一起想时，自行挑共享原语组合，不套话题演示或另建聊天壳。把DSL放进present_view.program，libraryVersion=${actual.libraryVersion}；states/bindings/previous的包络以当前工具schema为准。宿主提供$ui，DSL读取它，不自行声明状态或赋值。组件名称直接调用，纯函数与局部动作以@名称调用，参数按位置；原生语法里的占位组件名不能当成库中组件。`,
      compositionGuidance,
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
  return { instructions: `## ${section} · 实际共享库 ${actual.libraryVersion}\n` + page.map(signatureLine).join('\n\n'),
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
    '这是供你按需使用的构作方法，不是给用户复述的规则。继续沿当前角色自己的语气交流；有用的内容先给出来，不用免责横幅或内部过程占据作品。普通文字已足够时直接说话，互动确实能让人看见、试一试或一起改时，再自己选择合适组合。',
    '先围绕眼前的问题决定想让人动什么、动后能看见什么变化，再编写这一件作品；不按话题挑固定演示，不把以前某个生成程序当标准答案，也不另建页面或聊天壳。',
    compositionGuidance,
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
