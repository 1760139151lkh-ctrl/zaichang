import { defineFunction, type DefinedFunction, type EvaluationContext } from '@openuidev/lang-core';
import { z } from 'zod/v4';
import { INTERACTIVE_PROGRAM_LIMITS, PROGRAM_AST_RULES, type ProgramDataMap } from './interactive-program';

export type InteractiveFunctionReturnKind = 'number?' | 'boolean?' | 'boolean' | 'text?' | 'collection?' | 'data';
export type InteractiveFunctionReturnRule = { kind: 'branch_join'; conditionArgument: 0;
  branchArguments: readonly [1, 2, 3]; condition: 'boolean_or_null' };
export type InteractiveFunctionCardinalityRule = { kind: 'length'; argument: 0 }
  | { kind: 'count_argument'; argument: 2 }
  | { kind: 'input_length' | 'at_most_input'; argument: 0; countArgument?: 2 };
export interface InteractiveFunctionMetadata {
  returnKind: InteractiveFunctionReturnKind;
  maxItems?: number;
  minimumArguments?: number;
  returnRule?: InteractiveFunctionReturnRule;
  cardinalityRule?: InteractiveFunctionCardinalityRule;
}
type Entry = InteractiveFunctionMetadata & { definition: DefinedFunction<any, any> };
const scalar = z.number().finite().nullable().default(null);
const numberResult = z.number().finite().nullable();
const collection = z.array(z.unknown()).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable().default(null);
const numericCollection = z.array(z.number().finite().nullable()).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable().default(null);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const resultNumber = (value: number) => Number.isFinite(value) ? value : null;
function bounded<T>(values: T[]): T[] {
  if (values.length > INTERACTIVE_PROGRAM_LIMITS.collection)
    throw new Error('这组序列超出当前可展开的范围；请缩小范围，没有截成完整结果。');
  return values;
}
function unary(name: string, description: string, compute: (value: number) => number | null): Entry {
  return { returnKind: 'number?', definition: defineFunction({ name, description,
    params: z.object({ value: scalar }), returns: numberResult,
    fn: ({ value }) => { if (!isNumber(value)) return null; const result = compute(value); return result === null ? null : resultNumber(result); },
  }) };
}
function binary(name: string, description: string, compute: (left: number, right: number) => number | null): Entry {
  return { returnKind: 'number?', definition: defineFunction({ name, description,
    params: z.object({ left: scalar, right: scalar }), returns: numberResult,
    fn: ({ left, right }) => { if (!isNumber(left) || !isNumber(right)) return null;
      const result = compute(left, right); return result === null ? null : resultNumber(result); },
  }) };
}
function comparison(name: string, description: string, compare: (left: number, right: number) => boolean): Entry {
  return { returnKind: 'boolean?', definition: defineFunction({ name, description,
    params: z.object({ left: scalar, right: scalar }), returns: z.boolean().nullable(),
    fn: ({ left, right }) => isNumber(left) && isNumber(right) ? compare(left, right) : null,
  }) };
}
function aggregate(name: string, description: string, compute: (values: number[]) => number | null): Entry {
  return { returnKind: 'number?', definition: defineFunction({ name, description,
    params: z.object({ values: numericCollection }), returns: numberResult,
    fn: ({ values }) => {
      if (!Array.isArray(values)) return null;
      bounded(values);
      if (!values.every(isNumber)) return null;
      const result = compute(values); return result === null ? null : resultNumber(result);
    },
  }) };
}
const entries: Entry[] = [
  binary('Add', '有限实数相加；未知值传播为null，不把缺值变成0。', (a, b) => a + b),
  binary('Subtract', '有限实数相减；未知值传播为null。', (a, b) => a - b),
  binary('Multiply', '有限实数相乘；未知值传播为null。', (a, b) => a * b),
  binary('Divide', '有限实数相除；零分母、未知或非有限结果为null。', (a, b) => b === 0 ? null : a / b),
  binary('Remainder', '有限实数余数；零除数或未知为null。', (a, b) => b === 0 ? null : a % b),
  binary('Power', '实数幂；非实数、0的0次幂、未知或非有限结果为null。', (a, b) => a === 0 && b === 0 ? null : Math.pow(a, b)),
  unary('Negative', '有限实数取相反数；未知为null。', value => -value),
  unary('Absolute', '有限实数绝对值；未知为null。', Math.abs),
  unary('Sin', '弧度制正弦；未知或非有限输入为null。', Math.sin),
  unary('Cos', '弧度制余弦；未知或非有限输入为null。', Math.cos),
  unary('Sqrt', '非负实数平方根；负数或未知为null。', value => value < 0 ? null : Math.sqrt(value)),
  unary('Exp', '自然指数；溢出或未知为null。', Math.exp),
  unary('Log', '自然对数；非正数或未知为null。', value => value <= 0 ? null : Math.log(value)),
  comparison('Less', '有限实数严格小于；任一未知时为null。', (a, b) => a < b),
  comparison('LessEqual', '有限实数小于等于；任一未知时为null。', (a, b) => a <= b),
  comparison('Greater', '有限实数严格大于；任一未知时为null。', (a, b) => a > b),
  comparison('GreaterEqual', '有限实数大于等于；任一未知时为null。', (a, b) => a >= b),
  aggregate('Total', '已知数列求和，已知空列之和为0；包含未知或溢出时为null。', values => values.reduce((sum, value) => sum + value, 0)),
  aggregate('Mean', '已知非空数列的平均数；空列、未知或溢出为null。', values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null),
  aggregate('Smallest', '已知非空数列最小值；空列或未知为null。', values => values.length ? Math.min(...values) : null),
  aggregate('Largest', '已知非空数列最大值；空列或未知为null。', values => values.length ? Math.max(...values) : null),
  { returnKind: 'boolean', definition: defineFunction({ name: 'Known', description: '判断值是否非null/undefined；不是对来源完整或事实正确的判断。',
    params: z.object({ value: z.unknown().default(null) }), returns: z.boolean(), fn: ({ value }) => value !== null && value !== undefined }) },
  { returnKind: 'data', minimumArguments: 4, returnRule: { kind: 'branch_join', conditionArgument: 0,
    branchArguments: [1, 2, 3], condition: 'boolean_or_null' }, definition: defineFunction({ name: 'Choose', description: '严格按true、false或未知选择一个已给出的纯值；必须明确提供三个分支，不把未知当false。不会执行动作。',
    params: z.object({ condition: z.boolean().nullable().default(null), whenTrue: z.unknown().default(null),
      whenFalse: z.unknown().default(null), whenUnknown: z.unknown().default(null) }), returns: z.unknown(),
    fn: ({ condition, whenTrue, whenFalse, whenUnknown }) => condition === true ? whenTrue : condition === false ? whenFalse : whenUnknown }) },
  { returnKind: 'boolean?', definition: defineFunction({ name: 'Equal', description: '严格比较两个同类型的有限标量；未知或不同类型不冒充相等。',
    params: z.object({ left: z.union([scalar, z.string(), z.boolean()]).default(null), right: z.union([scalar, z.string(), z.boolean()]).default(null) }),
    returns: z.boolean().nullable(), fn: ({ left, right }) => left === null || right === null ? null : typeof left === typeof right && left === right }) },
  { returnKind: 'number?', definition: defineFunction({ name: 'AsNumber', description: '只接受真正的有限number，不把文字、空值或布尔值转成数值。',
    params: z.object({ value: z.unknown().default(null) }), returns: numberResult, fn: ({ value }) => isNumber(value) ? value : null }) },
  { returnKind: 'text?', definition: defineFunction({ name: 'AsText', description: '只接受真正的string；未知或其他类型为null。',
    params: z.object({ value: z.unknown().default(null) }), returns: z.string().nullable(), fn: ({ value }) => typeof value === 'string' ? value : null }) },
  { returnKind: 'number?', definition: defineFunction({ name: 'ParseNumber', description: '显式解析十进制文字；空文字、无效文字或非有限数为null，不隐式补0。',
    params: z.object({ text: z.string().max(160).nullable().default(null) }), returns: numberResult,
    fn: ({ text }) => typeof text === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())
      ? resultNumber(Number(text.trim())) : null }) },
  { returnKind: 'number?', cardinalityRule: { kind: 'length', argument: 0 }, definition: defineFunction({ name: 'Length', description: '已知数组长度；未知为null。不是未读或未返回数据的总量。',
    params: z.object({ values: collection }), returns: numberResult,
    fn: ({ values }) => Array.isArray(values) ? bounded(values).length : null }) },
  { returnKind: 'data', definition: defineFunction({ name: 'Item', description: '读取已知数组的零起始下标；越界或未知为null，不查询新资料。',
    params: z.object({ values: collection, index: scalar }), returns: z.unknown(),
    fn: ({ values, index }) => Array.isArray(values) && isNumber(index) && Number.isSafeInteger(index)
      && index >= 0 && index < bounded(values).length ? values[index] ?? null : null }) },
  { returnKind: 'data', definition: defineFunction({ name: 'Field', description: '只取已给JSON对象自身的一个字面字段；未知或prototype字段为null，不执行路径或查询。',
    params: z.object({ value: z.unknown().default(null), key: z.string().min(1).max(160) }), returns: z.unknown(),
    fn: ({ value, key }) => value && typeof value === 'object' && !Array.isArray(value)
      && !PROGRAM_AST_RULES.forbiddenMemberKeys.includes(key) && Object.hasOwn(value, key)
      ? (value as Record<string, unknown>)[key] ?? null : null }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'count_argument', argument: 2 }, definition: defineFunction({ name: 'Range',
    description: '在start到end之间均匀取count个有限数，含两端；count=1取start，count=0给空列。最多256项，超出明确拒绝、不静默截尾。',
    params: z.object({ start: scalar, end: scalar, count: scalar }), returns: numericCollection,
    fn: ({ start, end, count }) => {
      if (!isNumber(start) || !isNumber(end) || !isNumber(count)) return null;
      if (!Number.isSafeInteger(count) || count < 0) return null;
      if (count > INTERACTIVE_PROGRAM_LIMITS.collection) throw new Error('当前最多展开256项；请缩小点数，没有把截取当完整序列。');
      if (count === 0) return [];
      if (count === 1) return [start];
      const span = end - start;
      if (!Number.isFinite(span)) return null;
      const values = Array.from({ length: count }, (_, index) => start + span * (index / (count - 1)));
      return values.every(isNumber) ? values : null;
    } }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'input_length', argument: 0 }, definition: defineFunction({ name: 'Enumerate',
    description: '把已知数组变成{index,value}序列，方便通用图形或列表组合；未知为null，最多256项。',
    params: z.object({ values: collection }), returns: collection,
    fn: ({ values }) => Array.isArray(values) ? bounded(values).map((value, index) => ({ index, value })) : null }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'input_length', argument: 0 }, definition: defineFunction({ name: 'ReverseSequence',
    description: '返回已知序列的逆序副本，不修改只读原数据；未知为null。',
    params: z.object({ values: collection }), returns: collection,
    fn: ({ values }) => Array.isArray(values) ? [...bounded(values)].reverse() : null }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'at_most_input', argument: 0, countArgument: 2 }, definition: defineFunction({ name: 'SliceSequence',
    description: '明确取已知序列从start起的count项；不是完整性证明，不修改原数据。未知或非法下标为null。',
    params: z.object({ values: collection, start: scalar, count: scalar }), returns: collection,
    fn: ({ values, start, count }) => Array.isArray(values) && isNumber(start) && Number.isSafeInteger(start) && start >= 0
      && isNumber(count) && Number.isSafeInteger(count) && count >= 0 && count <= INTERACTIVE_PROGRAM_LIMITS.collection
      ? bounded(values).slice(start, start + count) : null }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'input_length', argument: 0 }, definition: defineFunction({ name: 'SortSequence',
    description: '排序同类型的已知有限number或text序列副本。文字按确定字典序，不冒充语言学排序；混合/未知元素为null。',
    params: z.object({ values: collection, direction: z.enum(['asc', 'desc']).default('asc') }), returns: collection,
    fn: ({ values, direction }) => {
      if (!Array.isArray(values)) return null;
      bounded(values);
      const sign = direction === 'desc' ? -1 : 1;
      if (values.every(isNumber)) return [...values].sort((a, b) => a < b ? -sign : a > b ? sign : 0);
      if (values.every((value): value is string => typeof value === 'string'))
        return [...values].sort((a, b) => a < b ? -sign : a > b ? sign : 0);
      return null;
    } }) },
  { returnKind: 'number?', definition: defineFunction({ name: 'TextLength', description: '已知文字的Unicode码点数；未知为null，不按UTF-16拆代理对。',
    params: z.object({ text: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable().default(null) }), returns: numberResult,
    fn: ({ text }) => typeof text === 'string' ? Array.from(text).length : null }) },
  { returnKind: 'boolean?', definition: defineFunction({ name: 'TextContains', description: '字面子串匹配，不执行正则或代码；未知为null。',
    params: z.object({ text: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable().default(null),
      query: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable().default(null), caseSensitive: z.boolean().default(false) }),
    returns: z.boolean().nullable(), fn: ({ text, query, caseSensitive }) => typeof text !== 'string' || typeof query !== 'string' ? null
      : caseSensitive ? text.includes(query) : text.toLowerCase().includes(query.toLowerCase()) }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, definition: defineFunction({ name: 'SplitText',
    description: '按给定字面分隔符拆已知文字；空分隔符按Unicode码点拆。最多256项，超出明确拒绝，不执行正则。',
    params: z.object({ text: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable().default(null), separator: z.string().max(32).default('\n') }),
    returns: collection, fn: ({ text, separator }) => typeof text === 'string' ? bounded(separator === '' ? Array.from(text) : text.split(separator)) : null }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'at_most_input', argument: 0 }, definition: defineFunction({ name: 'FilterText',
    description: '在已知文字序列内作字面包含筛选，不查询新资料；未知或混合元素为null，不将空结果说成来源没有。',
    params: z.object({ values: z.array(z.string()).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable().default(null),
      query: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable().default(null), caseSensitive: z.boolean().default(false) }),
    returns: collection, fn: ({ values, query, caseSensitive }) => {
      if (!Array.isArray(values) || typeof query !== 'string') return null;
      bounded(values);
      if (!values.every(value => typeof value === 'string')) return null;
      const needle = caseSensitive ? query : query.toLowerCase();
      return bounded(values).filter(value => (caseSensitive ? value : value.toLowerCase()).includes(needle));
    } }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, definition: defineFunction({ name: 'Points',
    description: '把等长x/y数列组合成{x,y}点；未知的点保留null缺口。长度不齐或未知列为null，不连接虚构数据。',
    params: z.object({ x: numericCollection, y: numericCollection }),
    returns: z.array(z.object({ x: z.number().finite(), y: z.number().finite() }).nullable()).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable(),
    fn: ({ x, y }) => {
      if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return null;
      bounded(x); bounded(y);
      return x.map((value, index) => isNumber(value) && isNumber(y[index]) ? { x: value, y: y[index]! } : null);
    } }) },
  { returnKind: 'text?', definition: defineFunction({ name: 'FormatNumber', description: '把有限数格式化为至多指定小数位的文字（0–10）；未知为null。舍入不是数学相等证明。',
    params: z.object({ value: scalar, decimals: z.number().int().min(0).max(10).default(3) }), returns: z.string().nullable(),
    fn: ({ value, decimals }) => isNumber(value) && Number.isSafeInteger(decimals) && decimals >= 0 && decimals <= 10
      ? String(Number(value.toFixed(decimals))) : null }) },
  { returnKind: 'text?', definition: defineFunction({ name: 'JoinText', description: '连接已知文字序列；任一项未知时为null，不把缺值吞成一句确定陈述。',
    params: z.object({ parts: z.array(z.string().nullable()).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable().default(null), separator: z.string().max(32).default('') }),
    returns: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable(), fn: ({ parts, separator }) => {
      if (!Array.isArray(parts)) return null;
      bounded(parts);
      if (!parts.every(part => typeof part === 'string')) return null;
      const text = parts.join(separator);
      if (text.length > INTERACTIVE_PROGRAM_LIMITS.text) throw new Error('这段派生文字较长，请收成当前需要的一部分。');
      return text;
    } }) },
];

const dataEntry = (data: ProgramDataMap): Entry => ({ returnKind: 'data', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection,
  definition: defineFunction({ name: 'Data', description: '只读宿主已核过并绑定本程序的alias数据。未知alias为null；不读文件、网络或工具，不授予新权限。',
    params: z.object({ alias: z.string().min(1).max(48) }), returns: z.unknown(),
    fn: ({ alias }) => Object.hasOwn(data, alias) ? data[alias] : null,
  }),
});
/** The metadata and definitions come from the same entries, not a parallel
 * hand-maintained permission list. No callbacks, I/O or model code run here. */
export const interactiveFunctionMetadata: Readonly<Record<string, InteractiveFunctionMetadata>> = Object.freeze(
  Object.fromEntries([...entries, dataEntry({})].map(({ definition, returnKind, maxItems, minimumArguments, returnRule, cardinalityRule }) => [definition.name,
    { returnKind, ...(maxItems === undefined ? {} : { maxItems }), ...(minimumArguments === undefined ? {} : { minimumArguments }),
      ...(returnRule === undefined ? {} : { returnRule }), ...(cardinalityRule === undefined ? {} : { cardinalityRule }) }])),
);
export const interactiveFunctionNames: readonly string[] = Object.freeze(Object.keys(interactiveFunctionMetadata));
export function createInteractiveFunctions(data: ProgramDataMap = {}): DefinedFunction<any, any>[] {
  return [...entries.map(entry => entry.definition), dataEntry(data).definition];
}
export type InteractiveEvaluationFunctions = NonNullable<EvaluationContext['functions']>;
