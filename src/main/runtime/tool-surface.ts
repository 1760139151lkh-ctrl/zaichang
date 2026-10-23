import type { ToolSpec } from '../provider';

/**
 * What the model sees on every request. The full tool contracts stay with the
 * host (zod validation, permissions and execution are unchanged); the model
 * gets the everyday tools directly, plus one `use_tool` entry through which the
 * specialized ones can be inspected and called. Measured on 2026-10-21 the full
 * catalogue was ~190K characters per request, most of it schema structure for
 * tools a given turn never needs.
 */

/** Specialized tools, grouped by the activity they serve. A family is offered
 * directly again whenever the current turn is already inside that activity. */
export const DEFERRED_TOOL_FAMILIES = {
  study: ['study_companion', 'read_study_companion', 'manage_learning', 'read_learning'],
  rehearsal: ['manage_relationship_rehearsal', 'read_relationship_rehearsal'],
  letter: ['write_reflective_letter', 'read_reflective_letter'],
  curiosity: ['curiosity_invitation', 'read_shared_creation'],
  companion: ['manage_companion_session', 'read_companion_session', 'read_companion_history', 'manage_companion', 'read_companion'],
  planning: ['offer_planning_alternatives', 'read_planning_alternative', 'continue_planning', 'manage_planning_intent', 'calculate_available_time'],
  methods: ['manage_method', 'read_method_help', 'manage_basis'],
} as const;
export type DeferredFamily = keyof typeof DEFERRED_TOOL_FAMILIES;
const familyOf = new Map<string, DeferredFamily>(Object.entries(DEFERRED_TOOL_FAMILIES)
  .flatMap(([family, names]) => names.map(name => [name, family as DeferredFamily] as const)));
export const USE_TOOL = 'use_tool';

/** One-line purposes shown in the `use_tool` description so the model knows
 * what exists without reading any schema. */
const PURPOSE: Record<string, string> = {
  study_companion: '展开或继续一张陪学纸（原题、本人尝试、提示深度）',
  read_study_companion: '回读陪学纸',
  manage_learning: '在共同学习事项里记下一次真实尝试',
  read_learning: '找回以前的原题、尝试和帮助',
  manage_relationship_rehearsal: '陪对方试着说一段难开口的话（你扮演对方的一种可能回应）',
  read_relationship_rehearsal: '回读一段试说',
  write_reflective_letter: '写一封有真实来由的私人来信',
  read_reflective_letter: '回读来信',
  curiosity_invitation: '带来一件马上能一起玩、能读的新东西（共创、谜题、观察或真实发现）',
  read_shared_creation: '回读你们一起写过的作品原章',
  manage_companion_session: '开始/留下停点/暂放/回来继续一件一起做的事',
  read_companion_session: '接回一起做事的停点',
  read_companion_history: '回读当时共做页上的一句解释',
  manage_companion: '为值得再聊的话题、共同说法或表达反馈留个入口',
  read_companion: '回到没聊完的话题或共同说法的原话',
  offer_planning_alternatives: '把两到四种真正不同的安排放在一起比较',
  read_planning_alternative: '回读一版安排',
  continue_planning: '沿已比较的安排继续修改或保存',
  manage_planning_intent: '保留/修订需要跨轮继续的规划规格',
  calculate_available_time: '按忙碌区间和转场成本计算真正可用的时段',
  manage_method: '对方说“以后也这样帮我”时，保存一份有来由的个人方法',
  read_method_help: '回读个人方法当时的那段帮助',
  manage_basis: '记录一项需要跨轮继续使用的解释及其停止条件',
};

const DROP_KEYS = new Set(['$schema', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern']);
/** Remove validation-only noise from a model-facing schema. Enums, required
 * lists, formats, defaults and descriptions stay; the host still validates the
 * full contract before anything runs. */
export function compactSchema<T>(value: T): T {
  // A schema node's keys are keywords; the keys of a `properties` (or `$defs`)
  // map are field names and must survive even when one is called maxLength.
  const names = (node: unknown): unknown => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return schema(node);
    return Object.fromEntries(Object.entries(node).map(([name, item]) => [name, schema(item)]));
  };
  const schema = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(schema);
    if (!node || typeof node !== 'object') return node;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(node)) {
      if (DROP_KEYS.has(key)) continue;
      if (key === 'additionalProperties' && item === false) continue;
      if (key === 'maximum' && item === Number.MAX_SAFE_INTEGER) continue;
      result[key] = ['properties', 'patternProperties', '$defs', 'definitions'].includes(key) ? names(item) : schema(item);
    }
    return result;
  };
  return schema(value) as T;
}
export function compactToolSpec(spec: ToolSpec): ToolSpec {
  return { ...spec, function: { ...spec.function, parameters: compactSchema(spec.function.parameters) } };
}

export function deferredFamily(name: string) { return familyOf.get(name); }

/** Search only the host's current permission-filtered contracts. This is an
 * explicit model query over documentation, never a router over user messages. */
export function deferredToolCatalog(all: readonly ToolSpec[], options: {
  query?: string; family?: DeferredFamily; offset?: number; limit?: number;
} = {}) {
  const query = options.query || '', normalized = query.normalize('NFKC').trim().toLowerCase();
  const terms = [...new Set((normalized.match(/[a-z0-9_.:-]+|[\p{Script=Han}]+/gu) || []).flatMap(word => {
    if (!/\p{Script=Han}/u.test(word)) return [word];
    const points = Array.from(word);
    return [word, ...points.slice(0, -1).map((point, index) => point + points[index + 1])];
  }))];
  const rows = all.flatMap(spec => {
    const family = familyOf.get(spec.function.name);
    if (!family || options.family && family !== options.family) return [];
    const purpose = PURPOSE[spec.function.name] || spec.function.description;
    const text = `${spec.function.name} ${family} ${purpose} ${spec.function.description}`.normalize('NFKC').toLowerCase();
    const score = normalized === spec.function.name.toLowerCase() ? Number.MAX_SAFE_INTEGER
      : terms.reduce((total, term) => total + (text.includes(term) ? term.length : 0), 0);
    return normalized && !score ? [] : [{ spec, family, purpose, score }];
  }).sort((a, b) => b.score - a.score);
  const offset = options.offset || 0, limit = options.limit || 8;
  return { status: 'catalog' as const, catalogOnly: true, items: rows.slice(offset, offset + limit).map(({ spec, family, purpose }) => ({
    name: spec.function.name, family, purpose,
    ...(Array.isArray((spec.function.parameters as { required?: string[] }).required)
      ? { required: (spec.function.parameters as { required: string[] }).required } : {}),
    read: { tool: USE_TOOL, arguments: { name: spec.function.name } },
  })), nextOffset: offset + limit < rows.length ? offset + limit : null, total: rows.length,
    coverage: { query, family: options.family || null, matchingOnly: !!normalized,
      meaning: '当前获准专门工具的说明目录；未命中不表示没有能力。清空query可分页查看全部，或换query/family继续查找。没有顶层required摘要不表示没有必填项，按操作分支查看完整参数。目录和参数读取不读取业务资料、不执行动作、不增加权限。' },
  };
}

/** Build the model-facing surface from the host's full, already permission-
 * filtered list. Promotion follows host state (an open study paper, a current
 * rehearsal...), never keywords in the user's words. */
export function modelToolSurface(all: ToolSpec[], promoted: ReadonlySet<DeferredFamily> = new Set()): ToolSpec[] {
  const direct: ToolSpec[] = [], behind: ToolSpec[] = [];
  for (const spec of all) {
    const family = familyOf.get(spec.function.name);
    (family && !promoted.has(family) ? behind : direct).push(spec);
  }
  if (!behind.length) return direct.map(compactToolSpec);
  const listing = behind.map(spec => `${spec.function.name}：${PURPOSE[spec.function.name] || spec.function.description.slice(0, 40)}`).join('；');
  const gateway: ToolSpec = { type: 'function', function: {
    name: USE_TOOL,
    description: `按需发现和调用专门工具。不知道名称时传query搜索用途，或不填name/query分页浏览；family可缩小目录，未命中可换词或清空query继续。知道名称时只传name读取完整说明和参数，已有足够参数知识时可直接传name和arguments调用，无需反复读说明。参数校验、权限和回执与直接调用完全一样。资料或画面里提到这些工具的读取入口时，也通过这里调用。当前可用：${listing}。其他公开资料、天气、校园、地图等能力仍通过look_up发现和读取。`,
    parameters: { type: 'object', properties: {
      name: { type: 'string', enum: all.filter(spec => familyOf.has(spec.function.name)).map(spec => spec.function.name), description: '精确工具名；省略时搜索或浏览目录。' },
      query: { type: 'string', maxLength: 300, description: '模型主动选择的用途或工具名查询；只筛目录，不决定工具权限。' },
      family: { type: 'string', enum: Object.keys(DEFERRED_TOOL_FAMILIES) },
      offset: { type: 'integer', minimum: 0, default: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 23, default: 8 },
      arguments: { type: 'object', description: '按该工具说明填写的参数；省略时只返回说明和参数结构。' },
    }, additionalProperties: false },
  } };
  return [...direct.map(compactToolSpec), gateway];
}
