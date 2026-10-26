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
    meaning: '把正在聊的想法做成能一起动手看的小作品，照自己的性格说发现、邀他试一试。做新作品可沿authoring一次读齐制作方法；接着改已有作品时，先读原作，再沿method补眼下需要的签名。源码细节留在制作时查，对方想了解实现时再展开。' };
}

type Signature = { signature: string; description?: string };
const methodWelcome = '这里有纸页、图形、局部输入和声音，供你照着眼前的问题自由组合。和他相处的仍是你，称呼、亲疏和好奇心都可以自然带进来：哪里有意思，动一下会发现什么，就一起看。源码细节在制作时按需查，工具批注能帮你接着改稿。作品里看清的关系、亲手试出的变化和你自己的想法，都可以顺着交流带给他。某处暂时影响了可看的内容或可做的操作，也能照你的口吻讲清发生了什么、还能怎样继续。';
const compositionGuidance = '首屏围绕眼前最值得看和试的关系展开，让主体和必要操作在一起，公式、解释和辅助controls随它们各自的作用就近放置。直接操作的图、命名和当前读数靠近彼此，不必为每组参数分别铺一张大纸，让人反复滚动找变化。Document.title本身就是可见标题，控件名称也已承担操作说明；图前后可以把篇幅留给有意思的发现与变化。函数图两轴单位不同时，可用默认independent把纸面宽度让给曲线；需要保持几何长度与角度时再用equal。现有暖灰纸面用ink承载主内容、muted承载辅助信息、克制的accent强调正在看的部分，留白随这一件作品的节奏来安排。';
const eachValueGuidance = '画函数图像、波形与叠加、衰减、轨迹这类由式子决定的曲线时，优先用 Curve：写一条式子，把要拖动的量放进 params 绑定 $ui，宿主原生取点，几乎不占计算上界；Each/Range 留给真实数据点列。Each返回内联模板值组成的有限数组，可直接用于组件属性，不限于children。需要点列或数值序列时，可在集合与执行安全上界内把有限Range逐项映为{x,y}对象、有限标量或null，也可将标量数组交实际Points函数；依据所用属性的真实签名选择。迭代变量只在自己的内联模板中可见，模板不提取成引用该变量的外部声明；使用实际纯函数计算各项，保留null缺口，无需为每个点手写展开DSL。';
const directManipulationGuidance = '当人想动的是图上的关系，可以把DragHandle直接放到那个关系上：只绑幅值的yField，再用Group把它移到当前波峰；相位和观察时刻各绑自己的xField，放在对应的坐标轴或观察线上。Group仍沿同一坐标反算，另一轴和标签可读同一组派生量，数值编辑保留为键盘入口。曲线、公式和观察值从同一参数定义推导；相差半圈只有在频率与幅值也相同的条件下才处处相消。重叠的手柄要在空间上有可分别抓取的位置，标签也为边界留出读字的位置。这是如何把直接操纵放回内容里的例子，不是一套固定波形版式。';
const geometricConstraintGuidance = '有传力或接触关系时，先把固定支点、随动关节和刚体上的局部点定清，再用同一旋转和平移关系算世界坐标；相接杆端、支承连线与部件原点共用这些点，避免各画一个看似接近的位置。由方向向量求角可用Atan2(y,x)，结果为弧度；Group.rotate用度，按单位换算后可让整件刚体共用一次旋转，不逐顶点复制同一变换。零向量没有可用方向，仍保留未知。受力方向也沿这些关节判断，不能一端上升、相接端却下降。接触边界由实际轮廓和同一尺度决定，声音事件与画面沿同一个接触时刻发生，触后回弹不穿过障碍；图元半径、线宽等屏幕像素与数据坐标各按实际签名使用。驱动脱开后，支承仍接在原随动关节，脱开阶段可以由本次单调过程保持到真正复位，不从回弹高度倒推已经重新接合。简化可以少画细节，仍让保留的连接和因果成立。';
const nullableValueGuidance = 'Choose显式写出真／假／未知三路值。条件为布尔或null、三路都明确为布尔时，结果就能用于原生布尔运算；结果仍可能是null或未知类型时，先为未知分支选好符合当前问题的纯值，再接&&／||。Known判断的是值是否已有内容（非null／undefined），数值与布尔类型仍各按自己的条件确定。';
const sharedProcessGuidance = '相关画面可借Document的presentation=flow，让不同Paper和解释段落交织，并共享同一$ui；需要联动的机构和操控由此留在同一作品里。复杂作品先发表有意义、确实可操作的主体，再沿返回的programRef用previous+patch接着增加部件、解释与联动，让人一边玩一边看你继续做；其余要求仍在同一作品中继续完成，已发表的一小段不代替整项交付。一直按住的状态与触发后自行发展的过程各有含义：例如物体已经脱离驱动，Motion的releaseBehavior=finish就能让有限运动在松手后完成。声音若对应某个接触时刻，Voice.trigger可比较同一个局部时间是否越过该点，以false→true击发，音画便沿同一过程前进。单调前进的过程时钟在末帧仍记得已经越过接触点；减少动态直接完成本段时，也就不会略过一个只在中途短暂为真的击发门。数值、阶段与近似怎样取舍，仍要回到眼前原理来判断。';
const processGuidance = '关键部件读同一组局部量，关系和因果就能在操作里看出来。Press既能成为正文中的按住按钮，也能在Graphic里包住Rect/Polygon等可按几何；field表达持续按住，triggerField表达一次新击发，脱离驱动后的自由阶段可沿独立Motion轨道继续。Voice是放在Document/Flow等view容器里的声音部件，和图读同一状态；一次碰撞对应一次击发。延迟击发也可以由用户启动的有限Motion在接触时改变整数triggerField一次，gate则表达是否继续维持。输入参数与观察位置可以保留；按住、声音门、踏板和正在走的时间/事件计数声明transient:true，重开回声明initial，所以回来仍是安静的一页。少量就近的控件通常已经够用，声音入口也由宿主放在同一纸面。具体字段与上下界可查相应签名和反馈。';
const causalTimeGuidance = '机构作品可以先把持续施力、驱动脱离、一次接触、自由振动和阻尼接触分别想清楚，再让它们共享过程时钟。真实按住和松开用Press持有的门表示，点击按钮启动一段自动过程不能代替松手。Press.values可以在实际按下时选中对象并锁存这次力度、频率等局部初始条件；这些条件和按住门在同一受检变更生效，不从松手后已归零的压力倒推初始能量。声音在实际接触阶段击发，持续按住不反复制造碰撞；自由运动也不因手松开就凭空消失。一次动作带入的初始量也可在Motion首帧写到独立transient数值轨，后续帧沿其取值。慢放可以拉长可观察的机构过程，音高仍由物理参数计算；若有意改变听觉时间尺度，应把这个选择表达清楚。制音门要表达真正解除维持或接触阻尼，和总声音开关分开；延续控制改变能量如何消散，不当作第二次击发，也不把持续能量源和自然衰减混同。AudioTrace可在声音旁显示同一合成输出的实际数字波形；说明公式的Curve和实际采样各有作用，静音时不画一条假装正在发声的采样波。参数改变后的图、读数和下一次声音保持同一关系，简化模型与真实装置的区别只在影响理解时就近说明。';
const pianoGuidance = '一起看三角钢琴时，Piano能在同一张纸上给出88键、和弦、延音、真实数字声音波形和可接管的击弦过程；声音是有独立衰减泛音的模态合成，保持与实测采样的区别。只需四个独立局部字段：held为number sequence（initial:[]、min:21、max:108、maxItems:88、transient:true），selected为number（initial:60、min:21、max:108、step:1），pedal为boolean（initial:false、transient:true），phase为number（initial:0、min:0、max:1、transient:true）。其余想一起探索的力度、慢放倍数、弦长/张力/线密度比例、明亮程度，用当前number字段和就近的Number控件绑定到Piano相应参数。让一件机构和键盘占住纸面主体，不另叠一排黑色仪表板；公式与变化后的发现跟着参数摆在附近。Piano自带本作品的继续入口与实际AudioTrace，不重复加声音开关或另一张波形。弦长、张力与线密度是理想弦的相对探索，具体钢琴仍要按真实来源解释；慢放只放慢机构，音高保持。若对方伸手弹奏，新的按键直接接过过程，不排队补播旧示范。';
const creationExample = '一种可供参考的陪看方式：若眼前是理想摆，先讲清绳长不变、摆球只在两侧来回摆动、忽略摩擦与空气阻力，并以最低点为重力势能零点。可以邀请对方“把摆球往左拉一点，看看它为什么又回来了”；慢看到最高点那一瞬，再一起发现速度为零、机械能全在重力势能里，随后看它怎样变回动能。若后来加入阻力，就把新的假设和损失表现出来。这只是一个从真实关系挑操作与解释的例子；当前要看什么、怎么说、怎样摆在纸上，都由你照眼前的人和问题来决定。';
const programReadGuidance = `接回原作时，read_interactive_program的默认overview先带来有限画面与状态预览，stateOrigin/coverage说明当前值来自哪里、这次读到了多少。完整状态声明用mode=states和所需stateKeys，后页沿next继续。需要源码细节时，mode=source按绝对Unicode offset/limit分页，find帮你定位字面位置；想读全文则显式用full:true，这一次省略offset/limit/find。概要、源码页、曲线点列和SourceSlot原文各有自己的读取范围，接着需要哪部分就沿对应入口去读。
present_view.program可以交完整dsl，也可以沿同作的真实previous交局部patch。patch里的每项是完整原生声明，按声明名替换或新增，name=null明确删除；没提及的声明原样保留。想保住原内容，先读清相关源码与真实状态，再选相应的完整稿或局部稿写法。
stateChanges列这次明确改变的字段声明，inputChanges列明确改变的条件值。局部续改用stateOrigin对应的本次Enter冻结输入，没有本次正式inputs时沿原版本document.initialState；处理期间后来拖动的live值仍属于后来的操作。已有字段的声明和当前值分别保留，新字段才取initial，Reset沿声明默认值。条件不兼容时，原稿与输入留在原处等你改清楚。完整dsl则按自己的states.initial起步。
patch为空时，这次仍要有明确的字段、条件或新绑定变化。沿用的旧绑定连着当前合法、未过期的live原资料；只有历史线索或缺资料时，就回原owner重新读到内容。已读且仍适用的内容可以直接复用，新用到的原语或具体报错再按精确names补读方法。
续改时可以直接复制读取结果的previous：id用programId或已发表的programRef.id，expectedRevision用那一版的revision或programRef.revision。这份地址指向原作品的确切版本，messageId另有消息归属，下一版编号由保存结果给出；遇到真实版本冲突，再沿原入口读当前版本。`;
function signatures(entries: Record<string, Signature> | undefined) {
  return Object.entries(entries || {}).map(([name, entry]) => ({ name,
    signature: entry.signature, ...(entry.description ? { description: entry.description } : {}) }));
}

export const interactiveProgramMethodReadFields = {
  section: z.enum(['authoring', 'overview', 'grammar', 'components', 'functions', 'actions']).optional()
    .describe('interactive-program的制作方法：authoring一次读齐全部签名、类型说明与核心语法。做新作品时默认authoring；这轮已有核过的当前作品或读回的原作时，默认overview。也可直接指定这一项；修改时按需读source及新增或报错的names。grammar与各签名分页仍可单独读。'),
  names: z.array(z.string().min(1).max(80)).max(16).optional()
    .describe('读interactive-program的组件、函数或动作时，从总览复制想看的精确名称；留空就按目录顺序分页。'),
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional().describe('接着读interactive-program时，复制methodRead.next里的位置。'),
  limit: z.number().int().min(1).max(12).optional().describe('interactive-program的签名一页看几个完整条目，默认6个。按所选names和offset取这一页，想继续就复制next；每条签名会完整保留。'),
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
    throw new HarnessError('method_part_parameters', 'authoring会整份展开，取掉names、offset和limit即可；overview与grammar整页展开，想按名称或位置找签名时选components、functions或actions。');
  const actual = getInteractiveProgramSpec(), catalogs = methodCatalogs(actual);
  const full = interactiveProgramWorkflowSkill();
  const syntaxStart = full.instructions.indexOf('## Syntax Rules\n');
  const syntaxEnd = full.instructions.indexOf('## 当前编译器实际接纳的语言规则', syntaxStart);
  const syntax = full.instructions.slice(syntaxStart, syntaxEnd).trim();
  const builtinStart = full.instructions.indexOf('## 当前实际允许的原生函数\n');
  const builtinEnd = full.instructions.indexOf('## 当前实际局部动作', builtinStart);
  const builtins = full.instructions.slice(builtinStart, builtinEnd).trim();
  const grammar = [syntax,
    '普通声明Ref会逐处内联，拆成多条声明不缓存中间结果。较长的纯参数推导可以用Each遍历只含一条参数记录的数组，在同一内联模板内读取已经求值的局部记录，再逐段建立下一条有限记录；每段仍守嵌套与集合上界。局部变量只在其模板可见，不提为引用该变量的全局声明；数值运算与未知量仍沿当前严格纯函数处理。SourceSlot留在Each外。',
    '## 当前实际接纳规则\n' + JSON.stringify(actual.rules),
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
      next: null, meaning: '这页有制作作品所需的全部签名、简要参数约束和核心语法；某个参数还想看细一点，可以沿下面的入口展开。这是做法说明，想引用的资料仍要另读，办事也仍照你们已有的约定。' } };
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
      causalTimeGuidance,
      pianoGuidance,
      sharedProcessGuidance,
      geometricConstraintGuidance,
      directManipulationGuidance,
      '数值计算沿实际纯函数，null与缺口也有自己的含义。Data连到本轮真正读回的observationId与字面JSON路径；旧助手正文、bindingOrigins和priorDelivery可以带你找到原owner，再读现在需要的资料。局部输入留作这件作品里的试想，本人现实情况、偏好和行动各回自己的来处理解。修改同作沿真实previous id/revision；Continue把内容接回同一输入，原稿留下，发送由本人决定。' + nullableValueGuidance,
      programReadGuidance,
      '## 原生最小入门语法\n' + minimalSyntax,
      '普通声明可通过名字复用，要呈现的声明应从root可达；组件参数顺序以其实际签名为准。完整语法、运算／索引规则和有限上界可按需读grammar，使用已读到的部分即可，不把整页规则加载当成前置。',
      '## 当前实际允许的原生函数\n' + builtinSignatures.join('\n'),
      actual.rules.allowedBuiltins.includes('Each')
        ? 'Each的模板就地内联，varName只在该模板中可见，不提为新的全局名；可从有限集合返回点对象、标量、null或组件数组，用在实际接纳该类型的属性或children。' : '',
      'SourceSlot用这次提供的sceneRef把原画面和选择入口留在作品里；要用其中的资料做计算，再沿原来的读取入口取得Data。局部动作让人试动这件作品，真正保存笔记、改日程等事情仍沿各自的办事入口。',
      '## 实际组件完整名称（按kind，签名另读）\n' + JSON.stringify(componentNamesByKind),
      '## 纯函数完整名称（签名另读）\n' + catalogs.functions.map(entry => entry.name).join(', '),
      '## 局部动作实际签名\n' + catalogs.actions.map(signatureLine).join('\n'),
      '想用哪几个部件，就从methodRead.sections按精确names读它们的签名；目录帮你找位置，实际参数在各条签名里。每页保留完整条目，还有需要的就复制next继续。手边的方法已经够用时，可以直接制作，收到具体批注再接着修这一件作品。',
    ].filter(Boolean).join('\n\n');
    return { instructions, methodRead: { section, coverage: { scope: section === 'overview' ? 'overview_and_name_catalogs' : 'grammar_only', complete: true, wholeMethodProvided: false },
      sections: Object.fromEntries((['grammar', 'components', 'functions', 'actions'] as const).map(part => [part, read(part)])),
      next: null, meaning: section === 'grammar'
        ? '这一页是语法和可用范围，具体组件、函数和动作的签名可沿下面的入口按需看。'
        : '这一页有制作思路、基本用法和名称目录。想用的部件可以沿下面的入口看参数，手边方法够用就能开始。' } };
  }
  const catalog = catalogs[section];
  const selected = names ? names.flatMap(name => { const row = catalog.find(entry => entry.name === name); return row ? [row] : []; }) : catalog;
  const page = selected.slice(offset, offset + limit), nextOffset = offset + page.length < selected.length ? offset + page.length : null;
  const delivered = section === 'components' ? page.map(entry => ({ ...entry,
    parameterSchema: actual.schema.$defs?.[entry.name],
  })) : page;
  return { instructions: `## ${section} · 实际共享库 ${actual.libraryVersion}\n` + delivered.map(signatureLine).join('\n\n')
    + (section === 'components' ? '\n\nparameterSchema给出这个组件的字段、可选值、默认值与上下界，参数顺序沿同一签名；$ref指向当前库里的命名定义。想用别的组件时，再沿目录读对应名称即可。' : ''),
    methodRead: { section, ...(names ? { names, unknownNames: names.filter(name => !catalog.some(entry => entry.name === name)) } : {}),
      coverage: { scope: names ? 'requested_names' : 'whole_section', offset, returned: page.length,
        total: selected.length, catalogTotal: catalog.length, complete: nextOffset === null, wholeMethodProvided: false },
      next: nextOffset === null ? null : read(section, nextOffset),
      meaning: page.length === 0 ? '这一页没有条目，可以回看目录里的名称和这一页的位置，再选需要的部分。'
        : nextOffset === null ? '这次选的这一段已经到末页，本页条目各自完整。若还要看别的部件，回到目录选对应名称即可。'
          : '这里是这一页的完整签名，想看的这一段后面还有内容，可以复制next接着读；手边这些已经够用时就先制作。' } };
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
    causalTimeGuidance,
    pianoGuidance,
    sharedProcessGuidance,
    geometricConstraintGuidance,
    directManipulationGuidance,
    creationExample,
    `把DSL放进present_view.program；libraryVersion使用${actual.libraryVersion}。当前工具schema列着states、bindings和previous的写法。有限的局部输入在states里声明，宿主由此生成唯一$ui初值；DSL作为只读表达式读取它，改变输入沿局部动作办理，来源数据仍归原处。`,
    '来源资料沿本轮允许的工具真正读回后，用它的observationId和字面JSON路径绑定alias，Data就能读取这份别名。原创说明、标签与计算假设也可以直接写，照它们自己的创作或假设身份来用。用户这次拖动和输入的是作品里的试想，偏好保存、现实决定与业务状态各沿相应原操作继续。',
    '普通助手历史可以带你找到来处。要用其中资料时，沿实际返回的原作品、笔记或其他owner入口按本次请求重读，再把新的observationId交给Data。原程序read里的bindingOrigins、priorDelivery与sourceNavigation保留旧资料的来路；沿这些线索回原处取得这次确切可用的读取地址与内容，尚未找到的部分继续留作未知。',
    programReadGuidance,
    '下面是这份库当前提供的签名和类型：组件直接以名称调用，纯函数与局部动作以@名称调用，参数按位置传递；语法里的占位名称帮助读懂参数位置，具体部件沿真实名称目录选择。表达式可以先定义再复用，数值派生沿实际纯函数，null和数值0各保留自己的含义。' + nullableValueGuidance,
    '修改同一件作品时带previous的真实id和expectedRevision；想接着聊时，让本节点与实际局部输入回到同一composer，原稿留下，发送由本人决定。内容、布局与怎样和他一起看由你来想，来源、状态和实际保存由宿主照管。',
    syntax,
    '## 当前编译器实际接纳的语言规则\n' + JSON.stringify(actual.rules),
    '## 当前实际组件签名、用途与容纳关系\n' + JSON.stringify(components),
    '## 当前实际纯函数签名与返回种类\n' + JSON.stringify(functions),
    '## 当前实际允许的原生函数\n' + builtins.join('\n'),
    eachValueGuidance,
    '## 当前实际局部动作\n' + JSON.stringify(actions),
    '## 当前实际有限范围\n' + JSON.stringify(actual.limits),
    '这些目录和规则来自当前这份共享库，照这里的签名制作即可。工具会带回本次作品的实际结果与批注，沿它们接着修稿；作品里看清的东西，再照你自己的口吻和对方聊。',
  ].join('\n\n');
  return { id: INTERACTIVE_PROGRAM_METHOD_ID, version: String(actual.libraryVersion),
    name: '把眼前想法做成可动的小作品',
    description: '把正在聊的想法做成能动手试的小作品。新作用read_skill的section=authoring读齐签名与语法；接着修改时，读原作和新用到或报错的几条方法即可。',
    requirements: [{ kind: 'tool', name: 'present_view', purpose: '把作品放回原消息，和对方一起看、一起试' }], instructions };
}
