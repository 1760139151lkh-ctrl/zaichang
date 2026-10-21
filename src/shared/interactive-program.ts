import { z } from 'zod/v4';

/** One version of the shared component/function contract, independent of the
 * OpenUI package version. Version 1 remains the existing Scene-only library. */
export const PROGRAM_LIBRARY_VERSION = 2 as const;
/** Opened only when the same bundle has its actual renderer and source gates. */
export const INTERACTIVE_PROGRAM_AVAILABLE = true as boolean;
export const INTERACTIVE_PROGRAM_LIMITS = {
  dslBytes: 64000, tokens: 12000, depth: 32, statements: 160,
  states: 32, stateBytes: 24000, collection: 256, sequence: 128,
  text: 4000, expandedNodes: 4096, evaluationSteps: 24000,
  bindings: 8, pathDepth: 12, motionSeconds: 30,
} as const;

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
export const programKeySchema = z.string().min(1).max(48).regex(/^[A-Za-z][A-Za-z0-9_]*$/)
  .refine(value => !forbiddenKeys.has(value), '这个名称不是可用的局部字段。');
const id = z.string().min(1).max(160);
export const programNodeIdSchema = id.refine(value => !!value.trim() && !forbiddenKeys.has(value) && !/[\u0000-\u001f\u007f]/.test(value),
  '节点地址不能是空白、控制字符或保留对象字段。');
const finite = z.number().finite();
const numberState = z.object({ kind: z.literal('number'), initial: finite, min: finite, max: finite,
  step: finite.positive().optional() }).strict();
const booleanState = z.object({ kind: z.literal('boolean'), initial: z.boolean() }).strict();
const textState = z.object({ kind: z.literal('text'), initial: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text),
  maxLength: z.number().int().min(1).max(INTERACTIVE_PROGRAM_LIMITS.text) }).strict();
const choiceState = z.object({ kind: z.literal('choice'), initial: z.string().max(160),
  options: z.array(z.string().min(1).max(160)).min(1).max(64) }).strict();
const sequenceState = z.object({ kind: z.literal('sequence'), element: z.enum(['number', 'text']),
  initial: z.array(z.union([finite, z.string().max(256)])).max(INTERACTIVE_PROGRAM_LIMITS.sequence),
  maxItems: z.number().int().min(1).max(INTERACTIVE_PROGRAM_LIMITS.sequence),
  min: finite.optional(), max: finite.optional(), maxItemLength: z.number().int().min(1).max(256).optional() }).strict();

const aligned = (value: number, min: number, step: number) => {
  const index = (value - min) / step;
  return Number.isFinite(index) && Math.abs(index - Math.round(index)) <= 1e-7;
};
export const interactiveStateDeclarationSchema = z.discriminatedUnion('kind', [numberState, booleanState, textState, choiceState, sequenceState])
  .superRefine((state, context) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', message });
    if (state.kind === 'number') {
      const span = state.max - state.min;
      if (!(span > 0) || !Number.isFinite(span) || state.initial < state.min || state.initial > state.max)
        issue('数值初值须在有限且有宽度的范围内。');
      if (state.step !== undefined && (state.step > span || span / state.step > 1000000 || !aligned(state.initial, state.min, state.step)))
        issue('初值和步长须落在同一有限数值网格。');
    } else if (state.kind === 'text') {
      if (state.initial.length > state.maxLength) issue('文字初值超过声明的长度。');
    } else if (state.kind === 'choice') {
      if (new Set(state.options).size !== state.options.length || !state.options.includes(state.initial))
        issue('选项须唯一，初值须是其中一项。');
    } else if (state.kind === 'sequence') {
      if (state.initial.length > state.maxItems || state.min !== undefined && state.max !== undefined && state.min > state.max)
        issue('序列长度或数值范围无效。');
      if (state.element === 'text' && (state.min !== undefined || state.max !== undefined)
        || state.element === 'number' && state.maxItemLength !== undefined)
        issue('序列元素约束须与其文字或数值身份一致。');
      if (state.initial.some(value => state.element === 'number'
        ? typeof value !== 'number' || !Number.isFinite(value) || state.min !== undefined && value < state.min || state.max !== undefined && value > state.max
        : typeof value !== 'string' || value.length > (state.maxItemLength ?? 256)))
        issue('序列初值不符合元素约束。');
    }
  });
export type InteractiveStateDeclaration = z.infer<typeof interactiveStateDeclarationSchema>;
export const interactiveStateDeclarationsSchema = z.record(programKeySchema, interactiveStateDeclarationSchema)
  .refine(value => Object.keys(value).length <= INTERACTIVE_PROGRAM_LIMITS.states, '局部字段太多，请只保留当前交互需要的部分。');
export type InteractiveStateDeclarations = z.infer<typeof interactiveStateDeclarationsSchema>;
export type ProgramStateValue = number | boolean | string | (number | string)[];
export type ProgramStateValues = Record<string, ProgramStateValue>;
export type ProgramJsonValue = null | boolean | number | string | ProgramJsonValue[] | { [key: string]: ProgramJsonValue };
export type ProgramDataMap = Readonly<Record<string, ProgramJsonValue>>;

export const interactiveStateValuesSchema = z.record(programKeySchema, z.union([
  finite, z.boolean(), z.string().max(INTERACTIVE_PROGRAM_LIMITS.text),
  z.array(z.union([finite, z.string().max(256)])).max(INTERACTIVE_PROGRAM_LIMITS.sequence),
]));
const pathKey = z.string().min(1).max(160).refine(value => !forbiddenKeys.has(value), '该路径字段不可读取。');
export const interactiveBindingInputSchema = z.object({ alias: programKeySchema,
  observationId: id.describe('本轮真正提供给模型的只读工具结果顶层observationId。不是原文eventId、文件ID或新授权。'),
  path: z.array(z.union([pathKey, z.number().int().min(0).max(1000000)])).max(INTERACTIVE_PROGRAM_LIMITS.pathDepth)
    .describe('原结果中的字面JSON key或数组index；不是dot path、查询式或工具参数。'),
}).strict();
export type InteractiveBindingInput = z.infer<typeof interactiveBindingInputSchema>;

const previousProgramSchema = z.object({
  id: id.describe('复制原作品读取结果的previous.id，即programId或已发表ACK的programRef.id；不是messageId、sceneId或nodeId。'),
  expectedRevision: z.number().int().positive().describe('复制同一原版本的previous.expectedRevision，即读取的revision或已发表programRef.revision；不要预加1，不是将产生的新版本。'),
}).strict();
const bindingsSchema = z.array(interactiveBindingInputSchema).max(INTERACTIVE_PROGRAM_LIMITS.bindings)
  .refine(bindings => new Set(bindings.map(binding => binding.alias)).size === bindings.length, '只读数据别名不能重复。');
const sourceTextSchema = z.string().max(INTERACTIVE_PROGRAM_LIMITS.dslBytes)
  .refine(value => new TextEncoder().encode(value).byteLength <= INTERACTIVE_PROGRAM_LIMITS.dslBytes,
    '这段界面较长，请收成眼前需要的一部分。');
export const interactiveProgramDraftSchema = z.object({ libraryVersion: z.literal(PROGRAM_LIBRARY_VERSION),
  dsl: sourceTextSchema.min(1),
  states: interactiveStateDeclarationsSchema,
  bindings: bindingsSchema,
  previous: previousProgramSchema.optional(),
}).strict();
export type InteractiveProgramDraft = z.infer<typeof interactiveProgramDraftSchema>;
export const interactiveProgramPatchSchema = z.object({ libraryVersion: z.literal(PROGRAM_LIBRARY_VERSION),
  previous: previousProgramSchema,
  patch: sourceTextSchema.describe('原生 OpenUI 完整声明的局部稿。按声明名替换或新增；name = null 显式删除该声明。未提及的声明保留，不自动清理不可达项。'),
  stateChanges: z.record(programKeySchema, interactiveStateDeclarationSchema.nullable())
    .refine(value => Object.keys(value).length <= INTERACTIVE_PROGRAM_LIMITS.states, '局部字段变更太多。').optional()
    .describe('只列显式新增或替换的完整字段声明，null 删除字段。已有字段保本次正式输入（若有），否则沿原版本initialState；新字段才用initial。Reset默认仍由声明initial决定。改变已有条件须显式inputChanges，不借initial重置。'),
  inputChanges: interactiveStateValuesSchema
    .refine(value => Object.keys(value).length <= INTERACTIVE_PROGRAM_LIMITS.states, '条件变更太多。').optional()
    .describe('仅明确改变的局部条件；未提及字段保原提交快照。与合并后完整states一起严格核验，不自动clamp，不是本人原话或动作许可。'),
  bindings: bindingsSchema.optional().describe('仅新增或替换的本轮实际投递绑定；未提及的旧别名须仍有合法、未过期的 live 原资料才可继承。'),
}).strict().superRefine((input, context) => {
  if (!input.patch.trim() && !Object.keys(input.stateChanges || {}).length && !Object.keys(input.inputChanges || {}).length && !input.bindings?.length)
    context.addIssue({ code: 'custom', path: ['patch'], message: '空局部稿需要明确的字段、条件或新绑定变更。' });
});
export const interactiveProgramInputSchema = z.union([interactiveProgramDraftSchema, interactiveProgramPatchSchema]);
export type InteractiveProgramInput = z.infer<typeof interactiveProgramInputSchema>;

/** Source-owned provenance is opaque here. Only its owner may validate it;
 * it is neither model input nor a client-provided permission. currentData is
 * for a live, currently admitted delivery and must not become stored truth. */
export interface InteractiveProgramDocument {
  libraryVersion: typeof PROGRAM_LIBRARY_VERSION;
  dsl: string;
  sourceDsl: string;
  states: InteractiveStateDeclarations;
  initialState: ProgramStateValues;
  /** New patch deliveries may seed the native record independently of the
   * declarations' Reset defaults. The seed is then part of the hash. Absent
   * on older/full-draft documents, whose existing hash contract is retained. */
  initialStateMode?: 'admitted_seed';
  /** Names only, never a source proof. Nonempty aliases require all current
   * data to be re-admitted before evaluation; absent data is not an empty set. */
  bindingAliases: string[];
  /** Exact Scene addresses admitted with this view. Rendering delegates to
   * their original owner; these names do not grant another source read. */
  sourceSlots?: string[];
  currentData?: ProgramDataMap;
  hash: string;
  nodeIds: string[];
  stats: { statements: number; astNodes: number; expandedNodes: number };
  provenance?: unknown;
}

/** The compiler and on-demand method consume the same actual subset. Native
 * OpenUI parsing/evaluation still owns expressions; this is its admission
 * policy, not another language evaluator. */
export const PROGRAM_AST_RULES = {
  stateRoot: '$ui', modelStateDeclarations: false, assignments: false,
  numericBinaryOperators: [] as readonly string[],
  knownTextConcatenation: ['+'] as readonly string[],
  booleanOperators: ['!', '&&', '||'] as readonly string[],
  sameKnownPrimitiveComparisons: ['==', '!='] as readonly string[],
  knownFiniteNumberComparisons: ['>', '>=', '<', '<='] as readonly string[],
  ternaryNeedsKnownBoolean: true, dataAliasMustBeLiteral: true,
  safeLiteralMemberOrIndexOnly: true,
  forbiddenMemberKeys: [...forbiddenKeys] as readonly string[],
  allowedBuiltins: ['Each'] as readonly string[],
  forbiddenCalls: ['Query', 'Mutation', 'Run', 'OpenUrl', 'ToAssistant', 'Action', 'Set', 'Reset'] as readonly string[],
  customActions: ['LocalChange', 'LocalReset', 'Continue'] as readonly string[],
  writableBindingMustBeDirectStateRoot: true,
  sourceSlotReference: 'literal_in_current_scene_refs_once',
  motionFrames: 'bounded_state_independent_values_numeric_only',
} as const;

/** Address and the user-selected local input only. Never accepts a program
 * body, source proof, derived answer, tool name or permission from the client. */
export const interactiveProgramReferenceSchema = z.object({ messageId: id, programId: id,
  revision: z.number().int().positive(), nodeId: programNodeIdSchema,
  inputs: interactiveStateValuesSchema.optional(),
}).strict();
export type ProgramFollowupReference = z.infer<typeof interactiveProgramReferenceSchema>;
/** Bound-source history retains only an original view address until its owner
 * has re-admitted the actual source for a live delivery. */
export interface InteractiveProgramHistoryReference {
  messageId: string;
  programId: string;
  revision: number;
  status: 'needs_refresh' | 'source_unavailable';
  /** Original host-evaluated root, only supplied for readable continuation. */
  nodeId?: string;
}

export class InteractiveProgramValueError extends Error {
  readonly code = 'interactive_state_invalid';
  constructor(message = '这组局部条件不符合当前界面的范围，请保留原稿并重新选择。') { super(message); this.name = 'InteractiveProgramValueError'; }
}
function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function valueAllowed(state: InteractiveStateDeclaration, value: unknown) {
  if (state.kind === 'number') return typeof value === 'number' && Number.isFinite(value)
    && value >= state.min && value <= state.max && (state.step === undefined || aligned(value, state.min, state.step));
  if (state.kind === 'boolean') return typeof value === 'boolean';
  if (state.kind === 'text') return typeof value === 'string' && value.length <= state.maxLength;
  if (state.kind === 'choice') return typeof value === 'string' && state.options.includes(value);
  return Array.isArray(value) && value.length <= state.maxItems && value.every(item => state.element === 'number'
    ? typeof item === 'number' && Number.isFinite(item) && (state.min === undefined || item >= state.min) && (state.max === undefined || item <= state.max)
    : typeof item === 'string' && item.length <= (state.maxItemLength ?? 256));
}
export function validateProgramState(states: InteractiveStateDeclarations, raw: unknown): ProgramStateValues {
  if (!plainRecord(raw) || Object.keys(raw).length !== Object.keys(states).length
    || Object.keys(raw).some(key => !Object.hasOwn(states, key))) throw new InteractiveProgramValueError();
  const result: ProgramStateValues = {};
  for (const [key, state] of Object.entries(states)) {
    const value = raw[key];
    if (!Object.hasOwn(raw, key) || !valueAllowed(state, value)) throw new InteractiveProgramValueError(`局部字段「${key}」不符合当前声明的范围。`);
    result[key] = Array.isArray(value) ? [...value] as (number | string)[] : value as number | boolean | string;
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > INTERACTIVE_PROGRAM_LIMITS.stateBytes)
    throw new InteractiveProgramValueError('这组输入较长，请只带眼前需要继续的一部分。');
  return result;
}
export function initialProgramState(states: InteractiveStateDeclarations): ProgramStateValues {
  return validateProgramState(states, Object.fromEntries(Object.entries(states).map(([key, state]) => [key, state.initial])));
}
/** The one native $ui record is changed atomically only after this succeeds. */
export function checkedProgramPatch(states: InteractiveStateDeclarations, current: unknown, rawPatch: unknown): ProgramStateValues {
  const before = validateProgramState(states, current);
  if (!plainRecord(rawPatch) || Object.keys(rawPatch).some(key => !Object.hasOwn(states, key))) throw new InteractiveProgramValueError();
  return validateProgramState(states, { ...before, ...rawPatch });
}
export function resetProgramState(states: InteractiveStateDeclarations, current: unknown, keys?: readonly string[]) {
  if (!keys?.length) return initialProgramState(states);
  const defaults = initialProgramState(states), patch: ProgramStateValues = {};
  for (const key of keys) {
    if (!Object.hasOwn(defaults, key)) throw new InteractiveProgramValueError();
    patch[key] = defaults[key];
  }
  return checkedProgramPatch(states, current, patch);
}
export function snapProgramNumber(value: number, state: Extract<InteractiveStateDeclaration, { kind: 'number' }>) {
  if (!Number.isFinite(value)) throw new InteractiveProgramValueError();
  if (state.step === undefined) return Math.min(state.max, Math.max(state.min, value));
  const last = Math.floor((state.max - state.min) / state.step + 1e-8);
  const index = Math.max(0, Math.min(last, Math.round((value - state.min) / state.step)));
  return Math.max(state.min, Math.min(state.max, state.min + index * state.step));
}
