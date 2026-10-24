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
const FAMILY_PURPOSE: Record<DeferredFamily, string> = {
  study: '一起学题，接回原题、尝试和提示',
  rehearsal: '试着说一段难开口的话',
  letter: '写信，回看相处里的真实来由',
  curiosity: '带来能一起玩、一起写的新东西',
  companion: '一起做事，留下停点，下次接着来',
  planning: '商量安排，比较取舍，找出能用的时间',
  methods: '记住合适的帮忙方式，以及它适用的条件',
};
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
  manage_planning_intent: '记住或调整这次安排要照顾的条件，方便下次接着商量',
  calculate_available_time: '按忙碌区间和转场成本计算真正可用的时段',
  manage_method: '对方说“以后也这样帮我”时，保存一份有来由的个人方法',
  read_method_help: '回读个人方法当时的那段帮助',
  manage_basis: '记录一项需要跨轮继续使用的解释及其停止条件',
};

/** Everyday tools stay directly callable. These short introductions only
 * replace repeated top-level prose; use_tool reads the owner's original
 * description and full parameters when more detail is useful. */
const TOOL_INTRODUCTIONS: Record<string, string> = {
  present_view: '把眼前真正需要的结果摊开：地图、课表、陪学纸、安排比较，或能亲手试的小作品。sceneRefs沿资料返回的画面地址；笔记和试说沿原结果的present.arguments。成绩可用campusDisplay选学期与口径。继续原题、原安排或原作品时沿它原来的地址和版本；新作品的做法可从read_skill查。companionActivity选择自己的陪伴姿态，镜头变化照顾对方刚才的手动浏览。',
  update_collaboration: '记下这件事已经聊清什么、还有什么没办、刚才试得怎样，以及后来改了什么。确定的内容与暂时猜想各自保留；对方明确选中或撤回一种做法时用choose。讲题、即兴共写和接着讨论，可以把实际内容直接写在当前回复里；另要独立成稿或保留原生纸时，再连回那份成果。真正保存安排沿原行动继续。',
  prepare_release: '对方明确要单独的稿页、稿件版本，或要交给具体收件人的正文时，沿原话准备这份稿件，保留读者、用途和可用材料。已有稿件可用真实priorArtifactId接回；写忙闲时带具体from/to。正文会在独立稿页里呈现，你可以接着聊内容与修改。平常讲题、即兴共写和私下讨论，可以直接在当前回复里完成；要怎样交付，沿对方这次的需要来。',
  prepare_action: '把明确托付的本地安排办好，或把尚在商量的安排做成可接受的建议卡。整份规划沿原planId递出，单项托付保留真实日期和提醒时刻；时长还未知时留空。结果会说明现在是建议已备好、安排已保存，还是还差哪一步。',
  look_up: '查眼前需要的原资料：校园课程与成绩、已存安排、天气、地图或以前的原话。source选择来源；找其他读法时用capability目录，describeOnly展开说明，再带arguments读取。日期与下一页沿来源给出的地址继续，返回的sceneRef可直接摊开。跨来源一起看安排时可找situation.read，单次最多31天。',
  manage_attention: '记住对方托付你照看的事，也能暂停、停止、改成只提醒一次，或记下这次提醒合不合适。沿原托付继续，保留他说的期限、提醒方式和停止条件；明确时刻放wakeAt，相对日期随当天重算。预约或发送消息沿各自的行动办理。',
  restore_collaboration: '接回没聊完或没办完的事，找回原话、当时的理解和后来改变的条件。默认看当前会话；有原话地址时用source_related找相关事项与方法，再沿正文和下一页继续。规划条件可用planning_intent回读。找到线索后再判断眼前是否还用得上。',
  inspect_help: '翻回已经准备的材料、照看的事项和相处约定。可以按关键词、关联事项、状态或日期找，再沿原id读正文和来由。已有材料仍合用时，decide_help可以把它带回当前交流；实际送到哪一步会分别留下记录。',
  read_assistant_history: '回看自己以前说过或递过什么。知道回复id就沿它分页读；只记得一句话时用连续短语找。本人原话旁的conversationContext可接回前后回复，共同作品沿historicalWorks读当时的原章。用当时读到的内容接话，也留意后来有没有修订。',
  read_skill: '翻看这件事合适的做法与适用条件。按精确id读，下一页沿next继续；做互动作品可选interactive-program的authoring，改已有作品先接回原稿。借个人方法帮眼前这件事时，forCurrentHelp连回本轮原话与事项；回顾或修改方法时直接读原方法。',
  read_interactive_program: '接回同一个可玩作品的原稿、文字位置和真实状态声明。沿messageId/programId/revision读取；overview看梗概，source分页或full读原稿，find找文字，states看状态字段。当前手势和数值沿这轮画面给出的UIref接续，原稿与下一页都保留原地址。',
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
  const query = (options.query || '').normalize('NFKC').trim(), normalized = query.toLowerCase();
  const terms = [...new Set((normalized.match(/[a-z0-9_.:-]+|[\p{Script=Han}]+/gu) || []).flatMap(word => {
    if (!/\p{Script=Han}/u.test(word)) return [word];
    const points = Array.from(word);
    return [word, ...points.slice(0, -1).map((point, index) => point + points[index + 1])];
  }))];
  const rows = all.flatMap(spec => {
    const family = familyOf.get(spec.function.name);
    if (!family || options.family && family !== options.family) return [];
    const purpose = PURPOSE[spec.function.name] || spec.function.description;
    const text = `${spec.function.name} ${family} ${FAMILY_PURPOSE[family]} ${purpose} ${spec.function.description}`.normalize('NFKC').toLowerCase();
    const score = normalized === spec.function.name.toLowerCase() ? Number.MAX_SAFE_INTEGER
      : terms.reduce((total, term) => total + (text.includes(term) ? term.length : 0), 0);
    return normalized && !score ? [] : [{ spec, family, purpose, score }];
  }).sort((a, b) => b.score - a.score || a.spec.function.name.localeCompare(b.spec.function.name, 'en'));
  const offset = options.offset || 0, limit = options.limit || 8;
  const items = rows.slice(offset, offset + limit).map(({ spec, family, purpose }) => ({
    name: spec.function.name, family, purpose, familyPurpose: FAMILY_PURPOSE[family],
    ...(Array.isArray((spec.function.parameters as { required?: string[] }).required)
      ? { required: (spec.function.parameters as { required: string[] }).required } : {}),
    read: { tool: USE_TOOL, arguments: { name: spec.function.name } },
  }));
  const nextOffset = offset + items.length < rows.length ? offset + items.length : null;
  return { status: 'catalog' as const, catalogOnly: true, items, nextOffset, total: rows.length,
    ...(nextOffset !== null ? { continuation: { tool: USE_TOOL, arguments: {
      ...(query ? { query } : {}), ...(options.family ? { family: options.family } : {}), offset: nextOffset, limit,
    } } } : {}),
    ...(normalized || options.family ? { browse: { tool: USE_TOOL, arguments: { offset: 0, limit } } } : {}),
    coverage: { query, family: options.family || null, matchingOnly: !!normalized, offset, returned: items.length, totalMatches: rows.length,
      meaning: rows.length
        ? `找到${rows.length}种相关做法，这一页列出${items.length}种。沿每项入口看完整用法。${nextOffset !== null ? '还有下一页可接着翻。' : '这份目录已翻到末页。'}`
        : '这次的用途还没找到相近做法，可以换个说法，或从完整目录里看看。' },
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
  const introduced = direct.map(spec => compactToolSpec({ ...spec, function: { ...spec.function,
    description: TOOL_INTRODUCTIONS[spec.function.name] || spec.function.description,
  } }));
  if (!behind.length) return introduced;
  const examples = Object.values(DEFERRED_TOOL_FAMILIES).flatMap(names => {
    const name = names.find(name => behind.some(spec => spec.function.name === name));
    return name ? [name] : [];
  });
  const gateway: ToolSpec = { type: 'function', function: {
    name: USE_TOOL,
    description: `想找做法，用query描述用途，或用family缩小范围；不填时浏览专门目录，没找到可以换词或继续翻页。所有当前工具都可只填name看完整用法。专门工具已知怎样填写时，把name和arguments一起交来就能办；常用工具仍从原入口执行。手边例如${examples.join('、')}，资料或画面给出的专门工具入口也从这里继续。公开资料、天气、校园和地图沿look_up查找。`,
    parameters: { type: 'object', properties: {
      name: { type: 'string', enum: all.map(spec => spec.function.name), description: '精确工具名，读取完整用法；省略时搜索或浏览专门目录。' },
      query: { type: 'string', maxLength: 300, description: '想找的用途或工具名；用来找说明，具体资料仍沿原有范围阅读。' },
      family: { type: 'string', enum: Object.keys(DEFERRED_TOOL_FAMILIES), description: Object.entries(FAMILY_PURPOSE).map(([name, purpose]) => `${name}：${purpose}`).join('；') },
      offset: { type: 'integer', minimum: 0, default: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 23, default: 8 },
      arguments: { type: 'object', description: '照这项工具的用法填写；先不填时，可以只看看说明和要填的内容。' },
    }, additionalProperties: false },
  } };
  return [...introduced, gateway];
}
