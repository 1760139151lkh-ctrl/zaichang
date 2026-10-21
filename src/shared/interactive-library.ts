import { createLibrary, createParser, defineAction, defineComponent, markReactive,
  type Library, type EvaluationContext } from '@openuidev/lang-core';
import { z } from 'zod/v4';
import { createInteractiveFunctions, interactiveFunctionMetadata } from './interactive-functions';
import type { InteractiveProgramComponentDiagnostic } from './harness';
import { INTERACTIVE_PROGRAM_LIMITS, PROGRAM_AST_RULES, PROGRAM_LIBRARY_VERSION, interactiveStateValuesSchema,
  programKeySchema, programNodeIdSchema, checkedProgramPatch, initialProgramState,
  interactiveProgramDraftSchema, interactiveProgramPatchSchema,
  type InteractiveStateDeclarations, type ProgramDataMap } from './interactive-program';

const finite = z.number().finite(), coordinate = finite.nullable().default(null);
const color = z.enum(['ink', 'muted', 'accent', 'blue', 'green', 'rose']);
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
type PrimitiveKind = 'document' | 'view' | 'graphic' | 'motion' | 'source';
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
const documentScalars = z.object({ id: programNodeIdSchema, title: z.string().max(160).optional() }).strict();
specs.push({ name: 'Document', kind: 'document', description: '当前回复内的通用交互文档。可选title会直接显示为文档顶部的可见标题；已提供title时，不要无意再用同名Text重复标题。ui只能直接绑定宿主生成的$ui；子项自由组合，原App人物与聊天输入仍由宿主持有。',
  scalarProps: documentScalars,
  props: z.object({ id: programNodeIdSchema, ui: uiBinding, children: children('view'), title: z.string().max(160).optional() }).strict(), childSlot: 'view' });
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
primitive('Button', '执行一个checked局部变更、恢复初值或Continue；不运行原生Set/Run/工具/外链/自动发送。', 'view', {
  label: z.string().min(1).max(160), action: localAction, emphasis: z.enum(['quiet', 'normal']).default('quiet'), disabled: z.boolean().default(false),
});
primitive('SourceSlot', '在当前作品里放原工具实际准入的精确Scene引用。ref只能是原id@revision字面地址，由宿主原owner显示；不查询工具、不复制正文。', 'source', {
  ref: z.string().min(1).max(320),
});
primitive('Graphic', '通用数据坐标画布，组合安全几何与文字；不是特定学科图。坐标缺值保留缺口，画面之外不改数值。', 'view', {
  domain: z.object({ xMin: finite, xMax: finite, yMin: finite, yMax: finite }).strict(),
  height: z.number().int().min(120).max(600).default(260), yDirection: z.enum(['up', 'down']).default('up'),
  axes: z.boolean().default(false), xLabel: z.string().max(80).optional(), yLabel: z.string().max(80).optional(),
  label: z.string().min(1).max(240),
}, { childSlot: 'graphic' });
primitive('Group', '在当前Graphic中组合几何；只允许有限的平移、旋转、缩放。', 'graphic', {
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
primitive('Circle', '画一个有限坐标圆点或圆；半径是画面像素，不引入外部图像或业务。', 'graphic', {
  x: coordinate, y: coordinate, radius: finite.min(.5).max(80).default(4), color: color.default('accent'), filled: z.boolean().default(true),
});
primitive('Label', '在当前Graphic坐标处显示短文字；坐标或文字未知时保留缺口。', 'graphic', {
  x: coordinate, y: coordinate, text: z.string().max(240).nullable().default(null), color: color.default('ink'),
  anchor: z.enum(['start', 'middle', 'end']).default('start'),
});
primitive('DragHandle', '拖动已声明number字段在当前Graphic中的位置；通过checkedPatch写局部值，不变更原数据。', 'graphic', {
  xField: programKeySchema.optional(), yField: programKeySchema.optional(), label: z.string().min(1).max(160),
  color: color.default('accent'), radius: finite.min(3).max(14).default(5), disabled: z.boolean().default(false),
});
const frame = z.object({ opacity: finite.min(0).max(1).optional(), x: finite.min(-1000).max(1000).optional(),
  y: finite.min(-1000).max(1000).optional(), rotate: finite.min(-360).max(360).optional(), scale: finite.min(.1).max(4).optional(),
  values: z.record(programKeySchema, finite).optional() }).strict();
primitive('Motion', '用户按钮改变when后启动有限动效；帧values只改变已声明number局部输入，按原步长插值，每次都经完整checkedPatch。手动输入立即接管；不自动播放，不执行工具，减少动态时直接到末帧。', 'motion', {
  when: z.union([finite, z.string().max(160), z.boolean(), z.null()]).optional(),
  frames: z.array(frame).min(2).max(8), durationMs: z.number().int().min(1).max(10000).default(280),
  iterations: z.number().int().min(1).max(3).default(1), easing: z.enum(['linear', 'ease', 'ease-out']).default('ease-out'),
}, { childSlot: 'same' });

// The neutral definitions use an opaque renderer slot; lang-core never calls
// it. The later React adapter injects actual renderers with the same schemas.
const neutralDefinitions = specs.map(spec => defineComponent({ name: spec.name, props: spec.props,
  description: spec.description, component: null }));
viewRefs = neutralDefinitions.filter(def => ['view', 'motion', 'source'].includes(specs.find(spec => spec.name === def.name)!.kind)).map(def => def.ref as z.ZodType);
graphicRefs = neutralDefinitions.filter(def => ['graphic', 'motion'].includes(specs.find(spec => spec.name === def.name)!.kind)).map(def => def.ref as z.ZodType);
export const interactiveComponentSpecs: readonly PrimitiveSpec[] = Object.freeze(specs);
export const interactiveComponentNames: readonly string[] = Object.freeze(specs.map(spec => spec.name));
export type InteractiveComponentName = 'Document' | 'Flow' | 'Paper' | 'Text' | 'Formula' | 'Number' | 'TextInput' | 'SequenceInput'
  | 'Choice' | 'Toggle' | 'Button' | 'SourceSlot' | 'Graphic' | 'Group' | 'Line' | 'Polyline' | 'Circle' | 'Label' | 'DragHandle' | 'Motion';

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
  const parameterIndex = typeof path[0] === 'string' ? parameterFields?.indexOf(path[0]) ?? -1 : -1;
  return { stage: 'schema', code: schemaIssueCodes.has(issue.code) ? issue.code as ComponentIssue['code'] : 'schema_issue',
    path, pathComplete, ...(parameterIndex >= 0 ? { parameterIndex } : {}),
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
  if (name === 'Graphic') {
    const domain = checked.data.domain as { xMin: number; xMax: number; yMin: number; yMax: number };
    if (!(domain.xMax > domain.xMin) || !(domain.yMax > domain.yMin)
      || !Number.isFinite(domain.xMax - domain.xMin) || !Number.isFinite(domain.yMax - domain.yMin))
      return reject('画布需要有限且有宽度的横纵范围。', 'graphic_domain', [['domain']]);
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
