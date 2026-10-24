import { createLibrary, createParser, defineAction, defineComponent, markReactive,
  type Library, type EvaluationContext } from '@openuidev/lang-core';
import { z } from 'zod/v4';
import { createInteractiveFunctions, interactiveFunctionMetadata } from './interactive-functions';
import { checkCurveNames, parseCurveExpression } from './curve-expression';
import type { InteractiveProgramComponentDiagnostic } from './harness';
import { INTERACTIVE_PROGRAM_LIMITS, PROGRAM_AST_RULES, PROGRAM_LIBRARY_VERSION, interactiveStateValuesSchema,
  programKeySchema, programNodeIdSchema, checkedProgramPatch, initialProgramState,
  interactiveProgramDraftSchema, interactiveProgramPatchSchema,
  type InteractiveStateDeclarations, type ProgramDataMap } from './interactive-program';

const finite = z.number().finite(), coordinate = finite.nullable().default(null);
const color = z.enum(['ink', 'muted', 'accent', 'blue', 'green', 'rose', 'paper']);
const text = z.string().max(INTERACTIVE_PROGRAM_LIMITS.text);
const point = z.object({ x: coordinate, y: coordinate }).strict().nullable();
const uiBinding = z.record(z.string(), z.unknown()); markReactive(uiBinding);

export const interactiveActions = [
  defineAction({ name: 'LocalChange', description: '只修改本程序声明的局部字段；整份next $ui通过schema核验后才原子写入，不执行工具或发送消息。',
    params: z.object({ values: interactiveStateValuesSchema }).strict() }),
  defineAction({ name: 'LocalReset', description: '把声明的fields恢复初值；空数组表示全部局部字段。不恢复数据来源、权限或业务。',
    params: z.object({ fields: z.array(programKeySchema).max(INTERACTIVE_PROGRAM_LIMITS.states).default([]) }).strict() }),
  defineAction({ name: 'Continue', description: '把当前节点与实际局部输入附到同一个普通composer；不填假本人话、不自动发送、不执行业务。',
    params: z.object({}).strict() }),
] as const;
const localAction = z.union(interactiveActions.map(action => action.ref) as [z.ZodType, z.ZodType, ...z.ZodType[]]);
let viewRefs: z.ZodType[] = [], graphicRefs: z.ZodType[] = [];
const children = (kind: 'view' | 'graphic' | 'same') => z.array(z.lazy(() => {
  const refs = kind === 'view' ? viewRefs : kind === 'graphic' ? graphicRefs : [...viewRefs, ...graphicRefs];
  return z.union(refs as [z.ZodType, z.ZodType, ...z.ZodType[]]);
})).max(INTERACTIVE_PROGRAM_LIMITS.expandedNodes);
type PrimitiveKind = 'document' | 'view' | 'graphic' | 'motion' | 'control' | 'source';
interface PrimitiveSpec {
  name: string; description: string; kind: PrimitiveKind;
  props: z.ZodObject<any>; scalarProps: z.ZodObject<any>;
  childSlot?: 'view' | 'graphic' | 'same';
  stateKind?: 'number' | 'boolean' | 'text' | 'choice' | 'sequence';
}
const specs: PrimitiveSpec[] = [];
function primitive(name: string, description: string, kind: PrimitiveKind, fields: z.ZodRawShape,
  options: Pick<PrimitiveSpec, 'childSlot' | 'stateKind'> = {}) {
  const shape = options.stateKind ? { ...fields, disabled: z.boolean().default(false) } : fields;
  const required = Object.fromEntries(Object.entries(shape).filter(([, schema]) => !(schema as z.ZodType).isOptional()));
  const optional = Object.fromEntries(Object.entries(shape).filter(([, schema]) => (schema as z.ZodType).isOptional()));
  const scalarProps = z.object({ id: programNodeIdSchema, ...required, ...optional }).strict();
  const props = options.childSlot ? z.object({ id: programNodeIdSchema, ...required, children: children(options.childSlot), ...optional }).strict() : scalarProps;
  specs.push({ name, description, kind, props, scalarProps, ...options });
}

// Fields keep a stable positional order in the generated OpenUI signatures.
// This is the actual library, not a second prose catalog or a business router.
const documentScalars = z.object({ id: programNodeIdSchema, title: z.string().max(160).optional(), presentation: z.enum(['paper', 'flow']).default('paper') }).strict();
specs.push({ name: 'Document', kind: 'document', description: '当前回复内的通用交互文档。可选title直接显示，勿用同名Text重复。presentation=paper是一张纸；flow不加外框，适合让说明段落、不同Paper与可操作图交织，全部仍共享同一$ui（相关机械/声音不拆成互不相通的作品）。ui只能直接绑定宿主生成的$ui；原App人物与聊天输入仍由宿主持有。',
  scalarProps: documentScalars,
  props: z.object({ id: programNodeIdSchema, ui: uiBinding, children: children('view'), title: z.string().max(160).optional(), presentation: z.enum(['paper', 'flow']).default('paper') }).strict(), childSlot: 'view' });
primitive('Flow', '组合横向、纵向或网格内容；布局不表示步骤执行或事实关系。', 'view', {
  direction: z.enum(['column', 'row', 'grid']).default('column'), gap: z.number().int().min(0).max(48).default(16),
  columns: z.number().int().min(1).max(6).default(2), align: z.enum(['start', 'center', 'stretch']).default('stretch'),
}, { childSlot: 'view' });
primitive('Paper', '承载一组当前内容，沿应用现有材质与颜色；不是新页面或另一个聊天壳。', 'view', {
  tone: z.enum(['plain', 'paper', 'glass']).default('plain'), padding: z.number().int().min(0).max(40).default(16),
}, { childSlot: 'view' });
primitive('Text', '显示文字或有限标量；null明确表示未给出，不转成0。不接受HTML。', 'view', {
  value: z.union([text, finite, z.boolean(), z.null()]).default(null), size: z.enum(['small', 'body', 'title']).default('body'),
  tone: z.enum(['ink', 'muted', 'accent']).default('ink'),
});
primitive('Formula', '仅排版当前TeX文字，不执行公式或脚本。来源原文与助手说明保持身份。', 'view', {
  tex: z.string().max(2000).nullable().default(null), display: z.boolean().default(true),
});
primitive('Number', '编辑已声明number字段；范围、步长和初值来自states，全next $ui核验后改变。', 'view', {
  field: programKeySchema, label: z.string().min(1).max(160), presentation: z.enum(['inline', 'slider', 'input']).default('slider'),
}, { stateKind: 'number' });
primitive('TextInput', '编辑已声明text字段的局部文字，不另建聊天输入；只有Continue才把实际输入带回原composer。', 'view', {
  field: programKeySchema, label: z.string().min(1).max(160), placeholder: z.string().max(200).optional(), multiline: z.boolean().default(false),
}, { stateKind: 'text' });
primitive('SequenceInput', '编辑已声明的number或text序列，按其元素类型、长度和范围逐项核验，不把文字当代码执行。', 'view', {
  field: programKeySchema, label: z.string().min(1).max(160), placeholder: z.string().max(200).optional(),
}, { stateKind: 'sequence' });
primitive('Choice', '选择已声明choice字段的一项；选项来自states，可换按钮、下拉或tab表达。', 'view', {
  field: programKeySchema, label: z.string().min(1).max(160), presentation: z.enum(['select', 'buttons', 'tabs']).default('select'),
}, { stateKind: 'choice' });
primitive('Toggle', '切换已声明boolean字段；只改变局部显示或演算，不推断偏好或批准动作。', 'view', {
  field: programKeySchema, label: z.string().min(1).max(160),
}, { stateKind: 'boolean' });
primitive('Press', '按住与松开一个临时boolean字段，支持鼠标/触摸/键盘。在Graphic中包可按几何，在正文中包按钮内容。field必须transient:true且initial:false。可选pressureField必须transient且initial:0，写明确strength（不冒充鼠标测得力度）；triggerField是transient整数事件计数，每次新按下加一步、到max回min，松开不改它。可选values在首次实际按下时，同一次受检变更写其他已声明的局部初始条件，例如选中的对象、发起时的力度或频率；松开不清这些初始条件。values不能包含自身field、pressureField或triggerField。多个Press共用field时，最后一个持有者松开才释放，并清除首次按下实际写入的压力；首次按下的入口只产生它自己声明的values/pressureField/triggerField，不从别的入口借字段。因此图中按键和键盘若代表同一次击发，两处可以共用相同的压力和击发字段。hotkey仅在本作品焦点内、非文字输入时响应；失焦/取消/卸载自动释放，不自动发消息或恢复按住。', 'control', {
  field: programKeySchema, label: z.string().min(1).max(160), strength: finite.min(0).max(1).default(1),
  pressureField: programKeySchema.nullable().optional(), triggerField: programKeySchema.nullable().optional(),
  hotkey: z.string().regex(/^[\x21-\x7e]$/).nullable().optional(),
  appearance: z.enum(['plain', 'light', 'dark']).default('plain'), disabled: z.boolean().default(false),
  values: interactiveStateValuesSchema.nullable().optional().describe('首次实际按下时一并写入的有限局部初始条件，例如所选对象、发起时的力度或频率。按当前states核验，与按住/压力/计数同一次checked patch生效；松开只释放Press拥有的门与压力，不抹掉这些初始条件。不能包含本Press的field、pressureField或triggerField，不执行动作、工具或业务。'),
}, { childSlot: 'same', stateKind: 'boolean' });
const voiceSettings = z.object({ gain: finite.min(0).max(1).default(.25), velocity: finite.min(0).max(1).default(1),
  harmonics: z.array(finite.min(-1).max(1)).min(1).max(32).default([1]),
  attackMs: finite.min(1).max(2000).default(8), decayMs: finite.min(1).max(10000).default(250),
  sustainLevel: finite.min(0).max(1).default(.45), releaseMs: finite.min(1).max(10000).default(180),
}).strict();
primitive('Voice', '本机合成一个可重复击发的声音。宿主已自动提供本作品的“听听声音／静音”总声音入口；gateField表达眼前过程是否仍持有或驱动，不必再做一个总声音开关。gateField必须transient boolean且initial:false。可选triggerField为transient整数事件计数，改变才击发；也可改用末尾trigger纯表达式，boolean仅由假变真击发，number每次改变击发，两者不可同时给。位置参数中的settings、sustainField、triggerField可用null表示未选，便于写到后面的trigger。这样可由同一局部时间在机械接触时产生一次声音，不在按键时提前响。都不提供时gate由假变真击发。sustainField为transient且initial:false的延续开关，松gate后为真则保留正在衰减的声音，关闭才制音。gain、velocity、attackMs、decayMs和sustainLevel在每次击发时取值，后来修改用于下一次声音；attackMs升到峰值，decayMs降到sustainLevel。sustainLevel=0时会自然衰减至静音并结束，大于0则停在持续音量；延续开关不会补充能量或改变这条包络。releaseMs是松门且未延续、或关闭延续开关时的制音时长。frequency为Hz，null静音，频率和harmonics可实时改变；默认为正弦，harmonics显式塑造音色。声音由用户明确开启，初始/重开不播放。', 'view', {
  gateField: programKeySchema, frequency: finite.min(1).max(20000).nullable(),
  settings: voiceSettings.nullable().optional(), sustainField: programKeySchema.nullable().optional(), triggerField: programKeySchema.nullable().optional(),
  trigger: z.union([finite, z.boolean()]).optional(),
});
primitive('AudioTrace', '显示本作品Voice经过合成与总音量后的真实本机数字波形，不是另画一条公式曲线。横向是当前数字声音的一小段取样窗口，不是机构慢放的时间轴。没有发声时是安静的基线；只有用户开启声音且本作品正在发声、可见时才取样绘制。不会读取麦克风、外部音频或保存录音。magnification只放大图上振幅，不改变音量；波形反映实际数字输出，不证明设备扬声器已被听见。', 'view', {
  label: z.string().min(1).max(160), height: z.number().int().min(80).max(240).default(120),
  magnification: finite.min(1).max(16).default(4), color: color.default('accent'),
});
primitive('Button', '执行一个checked局部变更、恢复初值或Continue；不运行原生Set/Run/工具/外链/自动发送。', 'view', {
  label: z.string().min(1).max(160), action: localAction, emphasis: z.enum(['quiet', 'normal']).default('quiet'), disabled: z.boolean().default(false),
});
primitive('SourceSlot', '在当前作品里放原工具实际准入的精确Scene引用。ref只能是原id@revision字面地址，由宿主原owner显示；不查询工具、不复制正文。', 'source', {
  ref: z.string().min(1).max(320),
});
primitive('Graphic', '通用数据坐标画布，组合安全几何与文字。coordinateScale=equal让横纵一个单位在画面里同样长，旋转的刚性几何便保持长度与角度；默认independent适合两轴单位不同的图表。空出的区域留白，指针仍按同一坐标映射。可选轴名可用null跳过。坐标缺值保留缺口，画面之外不改数值。', 'view', {
  domain: z.object({ xMin: finite, xMax: finite, yMin: finite, yMax: finite }).strict(),
  height: z.number().int().min(120).max(600).default(260), yDirection: z.enum(['up', 'down']).default('up'),
  axes: z.boolean().default(false), xLabel: z.string().max(80).nullable().optional(), yLabel: z.string().max(80).nullable().optional(),
  label: z.string().min(1).max(240),
  coordinateScale: z.enum(['independent', 'equal']).default('independent'),
}, { childSlot: 'graphic' });
primitive('Group', '在当前Graphic中组合几何；只允许有限的平移、旋转、缩放。子图元用本组局部坐标，rotate绕局部(0,0)旋转，再把该点放到x/y。固定铰点的刚体可保持x/y不动，只改rotate；改变x/y则表示连铰点一起移动。需要保持真实长度与角度时，所在Graphic使用equal坐标尺度。', 'graphic', {
  x: coordinate.default(0), y: coordinate.default(0), rotate: finite.min(-36000).max(36000).default(0),
  scale: finite.min(.001).max(1000).default(1),
}, { childSlot: 'graphic' });
primitive('Line', '画两点之间的一条直线；任一坐标未知时留缺口，不补零。', 'graphic', {
  x1: coordinate, y1: coordinate, x2: coordinate, y2: coordinate, color: color.default('ink'),
  width: finite.min(.25).max(8).default(1.5), dashed: z.boolean().default(false),
});
primitive('Polyline', '按真实给出的有限点列连线；null或未知点断开，不能跨缺口假连。', 'graphic', {
  points: z.array(point).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable().default(null), color: color.default('ink'),
  width: finite.min(.25).max(8).default(1.75), dashed: z.boolean().default(false),
});
primitive('Curve', '按一个数学式画连续曲线：expression 是 y 关于 variable（默认 x）的式子；再给 xExpression 时画参数曲线（两式都关于同一个 variable，比如 t）。式子只认数字、+ - * / ^、括号、sin cos tan exp ln log sqrt abs min max 等常用函数、pi/e，以及 params 里命名的量——params 的值可以绑定 $ui 局部输入，拖动时曲线立刻跟着变。在 from 到 to 之间取 samples 个点，无定义处断开；不执行代码。一条曲线只算一个节点，画波形、叠加、衰减、轨迹都不用自己展开点列。', 'graphic', {
  expression: z.string().min(1).max(400), from: finite, to: finite,
  params: z.record(programKeySchema, finite.nullable()).default({}),
  color: color.default('accent'), samples: z.number().int().min(2).max(512).default(160),
  width: finite.min(.25).max(8).default(2), dashed: z.boolean().default(false),
  variable: z.string().regex(/^[A-Za-z]$/).default('x'),
  xExpression: z.string().min(1).max(400).optional(),
});
primitive('Circle', '画一个有限坐标圆点或圆；半径是画面像素，不引入外部图像或业务。', 'graphic', {
  x: coordinate, y: coordinate, radius: finite.min(.5).max(80).default(4), color: color.default('accent'), filled: z.boolean().default(true),
});
primitive('Rect', '在当前数据坐标画矩形，随Group变换；几何尺寸使用数据单位，线宽使用像素。paper色沿当前纸面，不接受任意CSS。', 'graphic', {
  x: coordinate, y: coordinate, width: finite.positive(), height: finite.positive(), color: color.default('ink'),
  filled: z.boolean().default(false), strokeWidth: finite.min(0).max(8).default(1.5),
});
primitive('Polygon', '当前数据坐标的闭合多边形；任一点未知时整片留空，不跨缺口补形。随Group变换。', 'graphic', {
  points: z.array(point).min(3).max(INTERACTIVE_PROGRAM_LIMITS.collection), color: color.default('ink'),
  filled: z.boolean().default(false), strokeWidth: finite.min(0).max(8).default(1.5),
});
primitive('Label', '在当前Graphic坐标处显示短文字；坐标或文字未知时保留缺口。', 'graphic', {
  x: coordinate, y: coordinate, text: z.string().max(240).nullable().default(null), color: color.default('ink'),
  anchor: z.enum(['start', 'middle', 'end']).default('start'),
});
primitive('DragHandle', '直接拖动已声明number字段在当前Graphic中的位置；通过checkedPatch写局部值，不变更原数据。只绑y轴时xField传null跳过；两轴不能都空。只绑一轴时，另一轴位于当前局部坐标的0（域不含0时取最近边界）；可放进Group平移到波峰、相位轴或观察线所在位置，全部仍按同一坐标反算。按下保留抓取偏移，方向键可等价调整；Esc、失焦或取消手势回到本次抓取前的值，松手保留当前位置。', 'graphic', {
  xField: programKeySchema.nullable().optional(), yField: programKeySchema.nullable().optional(), label: z.string().min(1).max(160),
  color: color.default('accent'), radius: finite.min(3).max(14).default(5), disabled: z.boolean().default(false),
});
const frame = z.object({ opacity: finite.min(0).max(1).optional(),
  x: finite.min(-1000).max(1000).optional().describe('本帧的视觉CSS像素平移，正值向屏幕右方，不是Graphic数据坐标；过程结束撤去临时视觉变换。'),
  y: finite.min(-1000).max(1000).optional().describe('本帧的视觉CSS像素平移，正值向屏幕下方，不是Graphic数据坐标；过程结束撤去临时视觉变换。'),
  rotate: finite.min(-360).max(360).optional(), scale: finite.min(.1).max(4).optional(),
  values: z.record(programKeySchema, finite).optional() }).strict();
primitive('Motion', '用户点按钮、按下Press、切换选项使when改变后启动有限动效；帧values只改已声明number，各轨道在相邻帧之间连续插值，再按state.step舍入。帧x/y是临时视觉CSS像素平移，rotate/scale绕可见范围中心，结束撤去视觉变换；它们不改Graphic数据坐标或持久位置。需要部件在某处保持、沿固定铰点转动或带动其他部件时，让Group读同一局部数值，Motion.values只推动这些数值。末帧里的值并非只在结束时写入：step=1的0/1轨道会在区间中途切换，若它又参与本段when，就可能提前取消。releaseBehavior=cancel时when变false取消；finish则让已经开始的有限过程完成，适合激励已经脱开的自由运动，松手状态与此时间分开。手动数值、文字或拖点仍立即接管；不自动播放，减少动态时直接到末帧。', 'motion', {
  when: z.union([finite, z.string().max(160), z.boolean(), z.null()]).optional(),
  frames: z.array(frame).min(2).max(8), durationMs: z.number().int().min(1).max(10000).default(280),
  iterations: z.number().int().min(1).max(3).default(1), easing: z.enum(['linear', 'ease', 'ease-out']).default('ease-out'),
  releaseBehavior: z.enum(['cancel', 'finish']).default('cancel'),
}, { childSlot: 'same' });

// The neutral definitions use an opaque renderer slot; lang-core never calls
// it. The later React adapter injects actual renderers with the same schemas.
const neutralDefinitions = specs.map(spec => defineComponent({ name: spec.name, props: spec.props,
  description: spec.description, component: null }));
viewRefs = neutralDefinitions.filter(def => ['view', 'motion', 'control', 'source'].includes(specs.find(spec => spec.name === def.name)!.kind)).map(def => def.ref as z.ZodType);
graphicRefs = neutralDefinitions.filter(def => ['graphic', 'motion', 'control'].includes(specs.find(spec => spec.name === def.name)!.kind)).map(def => def.ref as z.ZodType);
export const interactiveComponentSpecs: readonly PrimitiveSpec[] = Object.freeze(specs);
export const interactiveComponentNames: readonly string[] = Object.freeze(specs.map(spec => spec.name));
export type InteractiveComponentName = 'Document' | 'Flow' | 'Paper' | 'Text' | 'Formula' | 'Number' | 'TextInput' | 'SequenceInput'
  | 'Choice' | 'Toggle' | 'Press' | 'Voice' | 'AudioTrace' | 'Button' | 'SourceSlot' | 'Graphic' | 'Group' | 'Line' | 'Polyline' | 'Curve' | 'Circle' | 'Rect' | 'Polygon' | 'Label' | 'DragHandle' | 'Motion';

export function createInteractiveLibrary<C = null>(options: { data?: ProgramDataMap; renderers?: Partial<Record<InteractiveComponentName, C>> } = {}) {
  const components = neutralDefinitions.map(def => ({ ...def,
    component: (options.renderers?.[def.name as InteractiveComponentName] ?? null) as C }));
  return createLibrary({ id: 'zaichang-interactive-v2', root: 'Document', components,
    functions: createInteractiveFunctions(options.data), actions: [...interactiveActions] });
}
const neutralLibrary = createInteractiveLibrary();
export function createInteractiveParser() { return createParser(neutralLibrary.toJSONSchema(), neutralLibrary.root); }
export function getInteractiveProgramSpec() {
  return { libraryVersion: PROGRAM_LIBRARY_VERSION, library: neutralLibrary.toSpec(), schema: neutralLibrary.toJSONSchema(),
    rules: PROGRAM_AST_RULES, limits: INTERACTIVE_PROGRAM_LIMITS, functions: interactiveFunctionMetadata,
    components: Object.fromEntries(specs.map(spec => [spec.name, { kind: spec.kind,
      ...(spec.childSlot ? { childSlot: spec.childSlot } : {}), ...(spec.stateKind ? { stateKind: spec.stateKind } : {}) }])) };
}
/** Runtime function schemas and implementations must travel together. */
export function interactiveEvaluationFunctions(library: Library): NonNullable<EvaluationContext['functions']> {
  const schemas = library.toJSONSchema().functions ?? {};
  return Object.fromEntries(Object.entries(schemas).flatMap(([name, schema]) => {
    const implementation = library.functions?.[name]?.fn;
    return implementation ? [[name, { ...schema, fn: implementation }]] : [];
  }));
}

const nativeLocalActionPlan = z.object({ steps: z.array(z.object({ type: z.literal('custom_action'),
  name: z.string(), params: z.record(z.string(), z.unknown()),
}).strict()).length(1) }).strict();
/** OpenUI evaluates an action expression into its native ActionPlan. The
 * expression-slot schema is for parsing, not for this materialized value. */
export function validateInteractiveActionPlan(raw: unknown, states: InteractiveStateDeclarations, disabled = false): string | undefined {
  const parsed = nativeLocalActionPlan.safeParse(raw);
  if (!parsed.success) return '按钮需要一个明确的局部操作。';
  const step = parsed.data.steps[0], definition = interactiveActions.find(action => action.name === step.name);
  if (!definition) return '按钮只能修改本页条件、恢复初值或引用当前内容。';
  const params = definition.params.safeParse(step.params);
  if (!params.success) return '按钮参数不符合当前局部操作声明。';
  if (step.name === 'LocalChange') {
    const values = (params.data as { values: Record<string, unknown> }).values;
    for (const [field, value] of Object.entries(values)) {
      const state = states[field];
      if (!Object.hasOwn(states, field) || !state || (state.kind === 'number' ? typeof value !== 'number' || !Number.isFinite(value)
        : state.kind === 'boolean' ? typeof value !== 'boolean'
          : state.kind === 'sequence' ? !Array.isArray(value) || value.some(item => state.element === 'number'
            ? typeof item !== 'number' || !Number.isFinite(item) : typeof item !== 'string') : typeof value !== 'string'))
        return '局部修改需要对应已声明的字段和输入类型。';
    }
    // A disabled boundary button may describe the next out-of-range value.
    // It cannot execute; actual events always validate the full next state.
    if (!disabled) {
      try { checkedProgramPatch(states, initialProgramState(states), values); }
      catch { return '局部修改需要符合当前声明的字段、类型和范围。'; }
    }
  }
  if (step.name === 'LocalReset' && (params.data as { fields: string[] }).fields.some(field => !Object.hasOwn(states, field)))
    return '恢复按钮需要当前声明的确切字段。';
  return undefined;
}

type ComponentIssue = InteractiveProgramComponentDiagnostic['issues'][number];
export interface InteractivePrimitivePropertiesProblem { message: string; issues: ComponentIssue[] }
const schemaIssueCodes = new Set(['invalid_type', 'too_big', 'too_small', 'invalid_format', 'not_multiple_of',
  'unrecognized_keys', 'invalid_union', 'invalid_key', 'invalid_element', 'invalid_value', 'custom']);
const schemaExpectedTypes = new Set(['string', 'number', 'int', 'boolean', 'array', 'object', 'null', 'record', 'nonoptional']);

/** Traverse only the fixed schema. Record/unknown keys stop the path rather
 * than echoing supplied names; union details, messages and inputs stay out. */
function safeSchemaIssue(schema: z.ZodType, issue: z.core.$ZodIssue, parameterFields?: readonly string[]): ComponentIssue {
  let current = schema;
  const path: (string | number)[] = [];
  let pathComplete = true;
  for (const part of issue.path) {
    for (let depth = 0; depth < 8 && (current instanceof z.ZodOptional || current instanceof z.ZodNullable
      || current instanceof z.ZodDefault || current instanceof z.ZodReadonly); depth++) current = current.unwrap() as z.ZodType;
    if (typeof part === 'string' && current instanceof z.ZodObject && Object.hasOwn(current.shape, part)) {
      path.push(part); current = current.shape[part];
    } else if (typeof part === 'number' && Number.isSafeInteger(part) && part >= 0 && current instanceof z.ZodArray) {
      path.push(part); current = current.element as z.ZodType;
    } else { pathComplete = false; break; }
  }
  for (let depth = 0; depth < 8 && (current instanceof z.ZodOptional || current instanceof z.ZodNullable
    || current instanceof z.ZodDefault || current instanceof z.ZodReadonly); depth++) current = current.unwrap() as z.ZodType;
  const allowedProperties = issue.code === 'unrecognized_keys' && pathComplete && current instanceof z.ZodObject
    ? Object.keys(current.shape) : undefined;
  const parameterIndex = typeof path[0] === 'string' ? parameterFields?.indexOf(path[0]) ?? -1 : -1;
  return { stage: 'schema', code: schemaIssueCodes.has(issue.code) ? issue.code as ComponentIssue['code'] : 'schema_issue',
    path, pathComplete, ...(parameterIndex >= 0 ? { parameterIndex } : {}),
    ...(allowedProperties ? { allowedProperties } : {}),
    ...(issue.code === 'invalid_type' && schemaExpectedTypes.has(issue.expected)
      ? { expected: issue.expected as ComponentIssue['expected'] } : {}),
    ...(issue.code === 'too_small' && typeof issue.minimum === 'number' && Number.isFinite(issue.minimum) ? { minimum: issue.minimum } : {}),
    ...(issue.code === 'too_big' && typeof issue.maximum === 'number' && Number.isFinite(issue.maximum) ? { maximum: issue.maximum } : {}),
    ...((issue.code === 'too_small' || issue.code === 'too_big') && typeof issue.inclusive === 'boolean' ? { inclusive: issue.inclusive } : {}) };
}

/** Used only by the original program envelope parse, never a second parse.
 * Keep the same safe projection as component errors, with no source position. */
export function interactiveProgramInputIssues(schema: z.ZodType, issues: readonly z.core.$ZodIssue[], mode?: 'draft' | 'patch'): ComponentIssue[] {
  if (mode && schema instanceof z.ZodObject && Object.hasOwn(schema.shape, 'program')) {
    // This projects errors from the same original union parse, never reparses
    // input. Only the two fixed program envelope branches are unwrapped.
    const branch = mode === 'patch' ? interactiveProgramPatchSchema : interactiveProgramDraftSchema;
    const knownSchema = z.object({ ...schema.shape, program: branch.optional() });
    const branchIssues = issues.flatMap(issue => issue.code === 'invalid_union'
      && issue.path.length === 1 && issue.path[0] === 'program'
      ? (issue.errors[mode === 'patch' ? 1 : 0] || []).map(child => ({ ...child, path: ['program', ...child.path] }))
      : [issue]);
    return branchIssues.slice(0, 4).map(issue => safeSchemaIssue(knownSchema, issue));
  }
  return issues.slice(0, 4).map(issue => safeSchemaIssue(schema, issue));
}

/** The original property/contract checks, returning only safe metadata from
 * the actual failed check. Renderer callers retain the string wrapper below. */
export function inspectInteractivePrimitiveProperties(name: string, raw: Record<string, unknown>, states: InteractiveStateDeclarations): InteractivePrimitivePropertiesProblem | undefined {
  const spec = specs.find(value => value.name === name);
  if (!spec) return { message: '界面引用了当前库没有的部件。',
    issues: [{ stage: 'contract', code: 'unknown_component', path: [], pathComplete: true }] };
  const reject = (message: string, code: ComponentIssue['code'], paths: (string | number)[][]): InteractivePrimitivePropertiesProblem => ({
    message, issues: paths.slice(0, 4).map(path => {
      const parameterIndex = typeof path[0] === 'string' ? Object.keys(spec.props.shape).indexOf(path[0]) : -1;
      return { stage: 'contract', code, path, pathComplete: true, ...(parameterIndex >= 0 ? { parameterIndex } : {}) };
    }),
  });
  const scalars = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'children' && !(name === 'Document' && key === 'ui')));
  const schema = name === 'Button' ? spec.scalarProps.omit({ action: true }) : spec.scalarProps;
  const checked = schema.safeParse(name === 'Button' ? Object.fromEntries(Object.entries(scalars).filter(([key]) => key !== 'action')) : scalars);
  if (!checked.success) return { message: `部件${name}的属性不符合当前库声明。`,
    issues: checked.error.issues.slice(0, 4).map(issue => safeSchemaIssue(schema, issue, Object.keys(spec.props.shape))) };
  if (name === 'Button') {
    const problem = validateInteractiveActionPlan(raw.action, states, raw.disabled === true);
    if (problem) return reject(problem, 'local_action', [['action']]);
  }
  if (spec.stateKind && (typeof raw.field !== 'string' || states[raw.field]?.kind !== spec.stateKind))
    return reject(`部件${name}需要对应已声明的${spec.stateKind}局部字段。`, 'state_kind', [['field']]);
  if (name === 'Press' || name === 'Voice') {
    if (name === 'Voice' && raw.triggerField != null && raw.trigger !== undefined)
      return reject('同一声音只选triggerField计数或trigger表达式中的一种。', 'state_kind', [['triggerField'], ['trigger']]);
    const heldKey = name === 'Press' ? 'field' : 'gateField';
    for (const key of [heldKey, ...(raw.sustainField == null ? [] : ['sustainField'])]) {
      const state = typeof raw[key] === 'string' ? states[raw[key] as string] : undefined;
      if (state?.kind !== 'boolean' || state.initial !== false || state.transient !== true)
        return reject('按住、声音门和延续开关需要transient:true且initial:false的boolean字段；重开不能恢复按住或发声。', 'state_kind', [[key]]);
    }
    if (raw.pressureField != null) {
      const state = states[String(raw.pressureField)];
      if (state?.kind !== 'number' || state.transient !== true || state.initial !== 0 || state.min > 0 || state.max < 1)
        return reject('力度字段需要transient:true、initial:0并覆盖0至1的number声明。', 'state_kind', [['pressureField']]);
    }
    if (raw.triggerField != null) {
      const state = states[String(raw.triggerField)];
      if (state?.kind !== 'number' || state.transient !== true || state.initial !== 0 || state.min !== 0
        || !Number.isInteger(state.max) || state.step !== 1 || raw.triggerField === raw.pressureField)
        return reject('击发计数需要独立的transient:true整数number字段，initial/min=0、step=1；每次改变代表一次新击发。', 'state_kind', [['triggerField']]);
    }
    if (name === 'Press' && raw.values != null) {
      const values = checked.data.values as Record<string, unknown>;
      if ([raw.field, raw.pressureField, raw.triggerField].some(key => typeof key === 'string' && Object.hasOwn(values, key)))
        return reject('按住、压力和击发计数由这次Press本身持有；values只放其他已声明的局部初始条件。', 'state_kind', [['values']]);
      try { checkedProgramPatch(states, initialProgramState(states), values); }
      catch { return reject('按下时的初始条件需要符合当前声明的局部字段、类型和范围。', 'state_kind', [['values']]); }
    }
  }
  if (name === 'Graphic') {
    const domain = checked.data.domain as { xMin: number; xMax: number; yMin: number; yMax: number };
    if (!(domain.xMax > domain.xMin) || !(domain.yMax > domain.yMin)
      || !Number.isFinite(domain.xMax - domain.xMin) || !Number.isFinite(domain.yMax - domain.yMin))
      return reject('画布需要有限且有宽度的横纵范围。', 'graphic_domain', [['domain']]);
  }
  if (name === 'Curve') {
    const params = (checked.data.params || {}) as Record<string, unknown>, variable = String(checked.data.variable || 'x');
    if (Object.hasOwn(params, variable)) return reject('曲线变量不能同时是参数名。', 'curve_expression', [['params']]);
    for (const key of ['expression', 'xExpression'] as const) {
      const source = checked.data[key];
      if (source === undefined) continue;
      try {
        const problem = checkCurveNames(parseCurveExpression(String(source)), [variable, ...Object.keys(params)]);
        if (problem) return reject(problem, 'curve_expression', [[key]]);
      } catch (error) { return reject(error instanceof Error ? error.message : '这个式子写得不对。', 'curve_expression', [[key]]); }
    }
    if (!(Number(checked.data.to) > Number(checked.data.from))) return reject('曲线的 from 要小于 to。', 'curve_range', [['from'], ['to']]);
  }
  if (name === 'DragHandle') {
    const fields = [raw.xField, raw.yField].filter((value): value is string => typeof value === 'string');
    if (!fields.length || new Set(fields).size !== fields.length || fields.some(field => states[field]?.kind !== 'number'))
      return reject('拖点需要至少一个真实、互不重复的number局部字段。', 'drag_fields', [['xField'], ['yField']]);
  }
  if (name === 'Motion' && Number(checked.data.durationMs) * Number(checked.data.iterations) > INTERACTIVE_PROGRAM_LIMITS.motionSeconds * 1000)
    return reject('这段动效超过当前有限时长。', 'motion_duration', [['durationMs'], ['iterations']]);
  if (name === 'Motion') {
    try {
      for (const frame of checked.data.frames as { values?: Record<string, unknown> }[])
        if (frame.values) {
          if (Object.keys(frame.values).some(key => states[key]?.kind !== 'number')) return reject('动效帧只能改变当前声明的number局部输入。', 'motion_number_fields', [['frames']]);
          checkedProgramPatch(states, initialProgramState(states), frame.values);
        }
    } catch { return reject('动效帧需要符合当前声明的局部字段、类型和范围。', 'motion_state_patch', [['frames']]); }
  }
  return undefined;
}

/** Cross-prop/state checks absent from JSON Schema. Parent child-slot checks
 * and stable node identities belong to the compiler's native-tree walk. */
export function validateInteractivePrimitiveProperties(name: string, raw: Record<string, unknown>, states: InteractiveStateDeclarations): string | undefined {
  return inspectInteractivePrimitiveProperties(name, raw, states)?.message;
}
