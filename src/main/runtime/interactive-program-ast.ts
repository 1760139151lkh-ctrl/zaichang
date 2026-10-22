import { autoClose, parseExpression, split, tokenize, type ASTNode } from '@openuidev/lang-core';
import { HarnessError, type InteractiveProgramExpansionDiagnostic, type InteractiveProgramExpressionDiagnostic } from '../../shared/harness';
import { PROGRAM_AST_RULES } from '../../shared/interactive-program';
import type { InteractiveFunctionReturnRule, InteractiveFunctionCardinalityRule } from '../../shared/interactive-functions';

type ValueKind = 'number' | 'string' | 'boolean' | 'number?' | 'string?' | 'boolean?' | 'null' | 'unknown';
export interface ProgramAstPolicy {
  components: ReadonlySet<string>;
  functions: ReadonlySet<string>;
  bindingNames: ReadonlySet<string>;
  sourceSlots?: ReadonlySet<string>;
  stateKinds: Readonly<Record<string, ValueKind>>;
  functionKinds?: Readonly<Record<string, ValueKind>>;
  functionReturnRules?: Readonly<Record<string, InteractiveFunctionReturnRule>>;
  functionCardinalityRules?: Readonly<Record<string, InteractiveFunctionCardinalityRule>>;
  functionMinimumArguments?: Readonly<Record<string, number>>;
  functionHelp: {
    methodId: string;
    entries: Readonly<Record<string, { signature: string; returnKind: string; minimumArguments?: number }>>;
  };
  bindingCollectionLengths?: Readonly<Record<string, number>>;
  stateCollectionLengths?: Readonly<Record<string, number>>;
  stateNumberMaxima?: Readonly<Record<string, number>>;
  /** Only return an exact length for an expression independent of $ui and iterators. */
  constantCollectionLength?: (node: ASTNode) => number | undefined;
  constantNumber?: (node: ASTNode) => number | undefined;
  limits: { bytes: number; tokens: number; depth: number; statements: number; nodes: number; collection: number; expandedNodes: number };
}
export interface ProgramAstInspection {
  statements: ReadonlyMap<string, ASTNode>;
  nodeCount: number;
  expandedNodes: number;
}
const forbiddenKeys = new Set(PROGRAM_AST_RULES.forbiddenMemberKeys);
const forbiddenCalls = new Set(PROGRAM_AST_RULES.forbiddenCalls);
const identifier = /^[a-zA-Z_][a-zA-Z0-9_]{0,79}$/;
const interpreterTags = new Set(['Comp', 'Str', 'Num', 'Bool', 'Null', 'Arr', 'Obj', 'Ref', 'Ph', 'StateRef', 'RuntimeRef', 'BinOp', 'UnaryOp', 'Ternary', 'Member', 'Index', 'Assign']);
function fail(message: string): never { throw new HarnessError('interactive_program', message); }

/** Inspect the original statements, not just the parser's reachable root.
 * OpenUI intentionally permits incomplete/unused input; publishing does not. */
export function parseProgramStatements(dsl: string, limits: ProgramAstPolicy['limits'], requireRoot = true): ReadonlyMap<string, ASTNode> {
  if (!dsl.trim() || Buffer.byteLength(dsl, 'utf8') > limits.bytes)
    fail('这份交互内容超过当前篇幅，请保留眼前最有用的关系。');
  const closed = autoClose(dsl);
  if (closed.wasIncomplete) {
    const suffix = closed.text.slice(dsl.length), safe = [...suffix].every(value => ['\\', '"', "'", ')', ']', '}'].includes(value));
    const returned = Math.min(64, suffix.length);
    throw new HarnessError('interactive_program', '交互内容还没写完整，请补齐引号或括号。', 'never', {
      rejectedDimensions: ['native_auto_close.incomplete'],
      input: { tool: 'present_view', layer: 'source_completion', nativeIncomplete: true,
        end: { unit: 'utf16_code_units', offset: dsl.length, line: dsl.split('\n').length - 1,
          column: dsl.length - dsl.lastIndexOf('\n') - 1 },
        ...(safe ? { completion: { suffix: suffix.slice(0, returned), returned, total: suffix.length, complete: returned === suffix.length } } : {}) },
      explanation: 'end是这次原稿末尾的零起始UTF16位置、行和列，不是推测出的缺失字符位置。completion仅来自同一次原生autoClose追加的闭括号、引号或转义字符；超过64字符时明确未给全。补齐结果没有被当作源稿采用，也没有发表作品或增加修订。',
    });
  }
  const tokens = tokenize(dsl);
  if (tokens.length > limits.tokens) fail('交互表达式过多，请先缩小这一页。');
  const brackets: number[] = [];
  for (const token of tokens) {
    if ([1, 3, 5].includes(token.t)) {
      brackets.push(token.t);
      if (brackets.length > limits.depth) fail('交互表达式嵌套过深。');
    } else if ([2, 4, 6].includes(token.t) && brackets.pop() !== token.t - 1) fail('交互内容的括号没有对应。');
  }
  if (brackets.length) fail('交互内容的括号没有对应。');
  const raw = split(tokens);
  if (!raw.length || raw.length > limits.statements) fail('交互声明数量不在当前范围内。');
  // Native split skips invalid top-level lines. Account for every source token.
  const represented = raw.flatMap(statement => [{ t: statement.idTokenType, v: statement.id }, { t: 9 }, ...statement.tokens]);
  const meaningful = tokens.filter(token => token.t !== 0 && token.t !== 13);
  if (JSON.stringify(represented) !== JSON.stringify(meaningful)) fail('交互内容只能包含完整的 OpenUI 声明。');
  const statements = new Map<string, ASTNode>();
  for (const statement of raw) {
    if (!identifier.test(statement.id) || statement.id.startsWith('$'))
      fail('可调输入由宿主声明为 $ui，不在程序里另建或覆盖状态。');
    if (statements.has(statement.id)) fail(`交互声明 ${statement.id} 重复了。`);
    // parseExpression does not expose its consumed offset. A native parenthesized
    // expression followed by a marker proves it consumed the complete RHS.
    const end = '\u0000interactive-program-end';
    const guarded = parseExpression([{ t: 1 }, ...statement.tokens, { t: 2 }, { t: 25 }, { t: 14, v: end }]);
    if (guarded.k !== 'BinOp' || guarded.op !== '==' || guarded.right.k !== 'Str' || guarded.right.v !== end)
      fail(`交互声明 ${statement.id} 含有未解析的内容。`);
    statements.set(statement.id, guarded.left);
  }
  if (requireRoot && !statements.has('root')) fail('交互内容需要一个 root。');
  return statements;
}

export function inspectInteractiveProgram(dsl: string, policy: ProgramAstPolicy, checkExpansion = true): ProgramAstInspection {
  const statements = parseProgramStatements(dsl, policy.limits);
  let nodeCount = 0;
  const sourceSlots = new Set<string>();
  const joinKinds = (kinds: readonly ValueKind[]): ValueKind => {
    if (!kinds.length) return 'unknown';
    if (kinds.every(value => value === 'null')) return 'null';
    for (const base of ['number', 'string', 'boolean'] as const) {
      const nullable: ValueKind = `${base}?`;
      if (kinds.every(value => value === base || value === nullable || value === 'null'))
        return kinds.every(value => value === base) ? base : nullable;
    }
    return 'unknown';
  };
  const operationKind = (operator: string, left: ValueKind, right: ValueKind): ValueKind => {
    if (PROGRAM_AST_RULES.booleanOperators.includes(operator)) return left === 'boolean' && right === 'boolean' ? 'boolean' : 'unknown';
    if (PROGRAM_AST_RULES.sameKnownPrimitiveComparisons.includes(operator))
      return ['boolean', 'string', 'number'].includes(left) && left === right ? 'boolean' : 'unknown';
    if (PROGRAM_AST_RULES.knownFiniteNumberComparisons.includes(operator)) return left === 'number' && right === 'number' ? 'boolean' : 'unknown';
    return PROGRAM_AST_RULES.knownTextConcatenation.includes(operator) && left === 'string' && right === 'string' ? 'string' : 'unknown';
  };
  const inferredStatements = new Map<string, ValueKind>();
  const kind = (node: ASTNode, visiting = new Set<string>(), depth = 0): ValueKind => {
    if (depth > policy.limits.depth) return 'unknown';
    const childKind = (value: ASTNode) => kind(value, visiting, depth + 1);
    if (node.k === 'Num') return Number.isFinite(node.v) ? 'number' : 'unknown';
    if (node.k === 'Str') return 'string';
    if (node.k === 'Bool') return 'boolean';
    if (node.k === 'Null') return 'null';
    if (node.k === 'UnaryOp' && node.op === '-' && node.operand.k === 'Num') return childKind(node.operand);
    if (node.k === 'Member' && node.obj.k === 'StateRef' && node.obj.n === PROGRAM_AST_RULES.stateRoot) return policy.stateKinds[node.field] || 'unknown';
    if (node.k === 'Index' && node.obj.k === 'StateRef' && node.obj.n === PROGRAM_AST_RULES.stateRoot && node.index.k === 'Str')
      return policy.stateKinds[node.index.v] || 'unknown';
    if (node.k === 'Ref' && statements.has(node.n) && !visiting.has(node.n)) {
      const cached = inferredStatements.get(node.n);
      if (cached !== undefined) return cached;
      const result = kind(statements.get(node.n)!, new Set([...visiting, node.n]), depth + 1);
      inferredStatements.set(node.n, result); return result;
    }
    if (node.k === 'UnaryOp') return node.op === '!' && childKind(node.operand) === 'boolean' ? 'boolean' : 'unknown';
    if (node.k === 'BinOp') return operationKind(node.op, childKind(node.left), childKind(node.right));
    if (node.k === 'Comp') {
      const rule = policy.functionReturnRules?.[node.name];
      if (rule?.kind === 'branch_join') {
        const condition = node.args[rule.conditionArgument];
        if (!condition || rule.branchArguments.some(index => !node.args[index])) return 'unknown';
        const conditionKind = childKind(condition);
        if (rule.condition !== 'boolean_or_null' || !['boolean', 'boolean?', 'null'].includes(conditionKind)) return 'unknown';
        return joinKinds(rule.branchArguments.map(index => childKind(node.args[index])));
      }
      return policy.functionKinds?.[node.name] || 'unknown';
    }
    if (node.k === 'Ternary') {
      return childKind(node.cond) === 'boolean' ? joinKinds([childKind(node.then), childKind(node.else)]) : 'unknown';
    }
    return 'unknown';
  };
  const expressionFailure = (message: string, statementOrdinal: number, location: string,
    category: InteractiveProgramExpressionDiagnostic['category'], operator: string,
    operandKinds: InteractiveProgramExpressionDiagnostic['operandKinds'], candidates: readonly string[]): never => {
    const functions = [...new Set(candidates)].flatMap(name => {
      const entry = policy.functionHelp.entries[name];
      return entry && policy.functions.has(name) ? [{ name, ...entry }] : [];
    }).slice(0, 3);
    const operators = new Set(['+', '-', '*', '/', '%', '==', '!=', '>', '>=', '<', '<=', '&&', '||', '!', '?:', '[]']);
    const expression: InteractiveProgramExpressionDiagnostic = { statementOrdinal, location,
      category, operator: operators.has(operator) ? operator as InteractiveProgramExpressionDiagnostic['operator'] : 'unsupported',
      operandKinds, functions,
      read: { tool: 'read_skill', arguments: { id: policy.functionHelp.methodId,
        section: 'functions', names: functions.map(entry => entry.name), limit: Math.max(1, functions.length) } } };
    throw new HarnessError('interactive_program', message, 'never', { rejectedDimensions: ['expression_semantics'], expression,
      explanation: 'statementOrdinal从1计；location的sN表示第N条声明，后续数字从0计：调用参数、数组项、对象值按原顺序，二元为左/右，三元为条件/真/假，Each模板为2。functions来自当前库；nullable返回量保留未知，不隐式当作0或false。仅修订对应表达式后再提交。' });
  };
  const statementOrdinals = new Map([...statements.keys()].map((name, index) => [name, index + 1]));
  const checkedStatements = new Set<string>(), checkingStatements = new Set<string>();
  function checkStatement(name: string, referenceDepth = 0): void {
    if (checkingStatements.has(name)) fail(`交互声明 ${name} 形成循环引用。`);
    if (checkedStatements.has(name)) return;
    if (referenceDepth > policy.limits.depth) fail('交互引用嵌套过深。');
    const node = statements.get(name), ordinal = statementOrdinals.get(name);
    if (!node || ordinal === undefined) fail('交互引用尚未声明。');
    checkingStatements.add(name);
    try {
      check(node, new Set(), 0, ordinal, `s${ordinal}`, referenceDepth);
      checkedStatements.add(name);
    } finally { checkingStatements.delete(name); }
  }
  const check = (node: ASTNode, locals: ReadonlySet<string>, depth: number, statementOrdinal: number, location: string, referenceDepth: number): void => {
    if (++nodeCount > policy.limits.nodes || depth > policy.limits.depth) fail('交互结构超过当前范围。');
    let childOrdinal = 0;
    const child = (value: ASTNode) => check(value, locals, depth + 1, statementOrdinal, `${location}/${childOrdinal++}`, referenceDepth);
    switch (node.k) {
      case 'Num': if (!Number.isFinite(node.v)) fail('交互数值需要是有限数。'); return;
      case 'Str': case 'Bool': case 'Null': return;
      case 'StateRef': if (node.n !== PROGRAM_AST_RULES.stateRoot) fail('只能引用本页声明的 $ui 状态。'); return;
      case 'RuntimeRef': case 'Assign': case 'Ph': fail('交互内容不能发起工具或直接覆盖状态。');
      case 'Ref':
        if (!locals.has(node.n) && !statements.has(node.n)) fail(`交互引用 ${node.n} 尚未声明。`);
        if (!locals.has(node.n)) checkStatement(node.n, referenceDepth + 1);
        return;
      case 'Member':
        if (forbiddenKeys.has(node.field)) fail('交互内容不能访问原型字段。');
        if (node.obj.k === 'StateRef' && !Object.hasOwn(policy.stateKinds, node.field)) fail(`可调输入 ${node.field} 尚未声明。`);
        child(node.obj); return;
      case 'Index':
        if (node.index.k === 'Str' && forbiddenKeys.has(node.index.v)) fail('交互内容不能访问原型字段。');
        child(node.obj); child(node.index);
        if (node.index.k !== 'Str' && kind(node.index) !== 'number') expressionFailure('动态索引需要明确的数值，字段读取使用确切名称。',
          statementOrdinal, location, 'index', '[]', { right: kind(node.index) }, ['Item', 'Known', 'Choose']);
        if (node.obj.k === 'StateRef' && (node.index.k !== 'Str' || !Object.hasOwn(policy.stateKinds, node.index.v)))
          fail('可调输入索引需要指向已声明的确切字段。');
        return;
      case 'Obj': {
        const names = new Set<string>();
        for (const [name, value] of node.entries) {
          if (forbiddenKeys.has(name) || names.has(name)) fail('交互对象字段重复或不可用。');
          if (name === '__reactive' || name === 'k' && (value.k === 'Str' ? interpreterTags.has(value.v) : ['unknown', 'string', 'number?', 'string?', 'boolean?'].includes(kind(value)))
            || name === 'type' && value.k === 'Str' && value.v === 'element')
            fail('交互内容使用原生声明，不手写解释器、状态绑定或部件标记对象。');
          names.add(name); child(value);
        }
        return;
      }
      case 'Arr':
        if (node.els.length > policy.limits.collection) fail('交互集合太长，请保留有界的一部分。');
        node.els.forEach(child); return;
      case 'UnaryOp':
        child(node.operand);
        if (node.op === '-' && node.operand.k === 'Num') return;
        if (node.op !== '!' || kind(node.operand) !== 'boolean') expressionFailure('数值派生请使用库中的严格纯函数。',
          statementOrdinal, location, 'unary', node.op, { right: kind(node.operand) }, node.op === '-' ? ['Negative', 'Known', 'Choose'] : ['Choose', 'Known']);
        return;
      case 'BinOp': {
        child(node.left); child(node.right);
        const left = kind(node.left), right = kind(node.right);
        const allowed = operationKind(node.op, left, right) !== 'unknown';
        if (!allowed) {
          const candidates = node.op === '+' ? [left, right].some(value => value === 'string' || value === 'string?') ? ['JoinText', 'FormatNumber', 'Known'] : ['Add', 'Known', 'Choose']
            : ({ '-': ['Subtract'], '*': ['Multiply'], '/': ['Divide'], '%': ['Remainder'], '<': ['Less'], '<=': ['LessEqual'],
              '>': ['Greater'], '>=': ['GreaterEqual'], '==': ['Equal'], '!=': ['Equal'] } as Record<string, string[]>)[node.op] || [];
          expressionFailure('数值派生和未知量比较请使用库中的严格纯函数。', statementOrdinal, location, 'binary', node.op,
            { left, right }, [...candidates, 'Known', 'Choose']);
        }
        return;
      }
      case 'Ternary':
        child(node.cond); child(node.then); child(node.else);
        if (kind(node.cond) !== 'boolean') expressionFailure('交互分支条件需要明确的布尔值。', statementOrdinal, location,
          'condition', '?:', { condition: kind(node.cond) }, ['Choose', 'Known']);
        return;
      case 'Comp': {
        if (forbiddenCalls.has(node.name)) fail('画面内只处理本页状态和讨论引用，不派发工具或外部操作。');
        if (node.name === 'Each') {
          if (node.args.length !== 3) fail('Each 需要有限集合、局部名称和内容。');
          const binder = node.args[1], name = binder.k === 'Str' ? binder.v : binder.k === 'Ref' ? binder.n : '';
          if (!identifier.test(name) || locals.has(name) || statements.has(name) || forbiddenKeys.has(name)) fail('Each 的局部名称不合法或发生覆盖。');
          child(node.args[0]);
          check(node.args[2], new Set([...locals, name]), depth + 1, statementOrdinal, `${location}/2`, referenceDepth); return;
        }
        if (!policy.components.has(node.name) && !policy.functions.has(node.name)) fail(`当前交互库没有 ${node.name}。`);
        if (node.args.length < (policy.functionMinimumArguments?.[node.name] ?? 0)) fail(`${node.name} 需要显式给出全部必需分支。`);
        if (node.name === 'Document' && (node.args[1]?.k !== 'StateRef' || node.args[1].n !== PROGRAM_AST_RULES.stateRoot))
          fail('文档的 ui 只直接引用宿主生成的 $ui。');
        if (node.name === 'Data' && (node.args[0]?.k !== 'Str' || !policy.bindingNames.has(node.args[0].v)))
          fail('Data 只能引用本次已绑定的确切来源名称。');
        if (node.name === 'SourceSlot') {
          const ref = node.args[1];
          if (ref?.k !== 'Str' || !policy.sourceSlots?.has(ref.v))
            fail('SourceSlot 只直接引用本次已准入的确切 id@revision 地址。');
          if (sourceSlots.has(ref.v)) fail('同一原画面只在这份交互中放一次。');
          sourceSlots.add(ref.v);
        }
        node.args.forEach(child); return;
      }
    }
  };
  for (const name of statements.keys()) checkStatement(name);
  if (!checkExpansion) return { statements, nodeCount, expandedNodes: 0 };
  const countUpper = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value >= 0
    ? Math.min(policy.limits.collection, Math.floor(value)) : undefined;
  const stateField = (node: ASTNode): string | undefined => node.k === 'Member' && node.obj.k === 'StateRef' && node.obj.n === PROGRAM_AST_RULES.stateRoot
    ? node.field : node.k === 'Index' && node.obj.k === 'StateRef' && node.obj.n === PROGRAM_AST_RULES.stateRoot && node.index.k === 'Str' ? node.index.v : undefined;
  const numberMaxima = new Map<string, number | undefined>(), collectionMaxima = new Map<string, number | undefined>();
  const referenceBounds = new Map<string, number>();
  // These bounds describe possible output lengths, never a substitute value
  // for null/unknown. No initial $ui value participates in their calculation.
  const numberUpper = (node: ASTNode, visiting: ReadonlySet<string>, locals: ReadonlyMap<string, number>): number | undefined => {
    const fixed = policy.constantNumber?.(node);
    if (fixed !== undefined) return Number.isSafeInteger(fixed) ? countUpper(fixed) : undefined;
    if (node.k === 'Num') return Number.isSafeInteger(node.v) ? countUpper(node.v) : undefined;
    const field = stateField(node);
    if (field !== undefined && Object.hasOwn(policy.stateNumberMaxima || {}, field)) return countUpper(policy.stateNumberMaxima![field]);
    if (node.k === 'Ref' && statements.has(node.n) && !visiting.has(node.n)) {
      if (numberMaxima.has(node.n)) return numberMaxima.get(node.n);
      const bound = numberUpper(statements.get(node.n)!, new Set([...visiting, node.n]), new Map());
      numberMaxima.set(node.n, bound); return bound;
    }
    const rule = node.k === 'Comp' ? policy.functionCardinalityRules?.[node.name] : undefined;
    if (node.k === 'Comp' && rule?.kind === 'length' && node.args[rule.argument])
      return knownCollectionUpper(node.args[rule.argument], visiting, locals);
    return undefined;
  };
  const knownCollectionUpper = (node: ASTNode, visiting: ReadonlySet<string>, locals: ReadonlyMap<string, number>): number | undefined => {
    const fixed = policy.constantCollectionLength?.(node);
    if (fixed !== undefined) {
      if (!Number.isSafeInteger(fixed) || fixed < 0 || fixed > policy.limits.collection) fail('交互集合超出本页有限范围。');
      return fixed;
    }
    if (node.k === 'Arr') return node.els.length;
    const field = stateField(node);
    if (field !== undefined && Object.hasOwn(policy.stateCollectionLengths || {}, field)) return policy.stateCollectionLengths![field];
    if (node.k === 'Ref' && statements.has(node.n) && !visiting.has(node.n)) {
      if (collectionMaxima.has(node.n)) return collectionMaxima.get(node.n);
      const bound = knownCollectionUpper(statements.get(node.n)!, new Set([...visiting, node.n]), new Map());
      collectionMaxima.set(node.n, bound); return bound;
    }
    const rule = node.k === 'Comp' ? policy.functionCardinalityRules?.[node.name] : undefined;
    if (node.k === 'Comp' && (node.name === 'Each' || rule && rule.kind !== 'length')) return arrayBound(node, visiting, locals);
    return undefined;
  };
  const arrayBound = (node: ASTNode, visiting: ReadonlySet<string>, locals: ReadonlyMap<string, number>, precise = true): number => {
    if (precise) {
      const fixed = policy.constantCollectionLength?.(node);
      if (fixed !== undefined) {
        if (!Number.isSafeInteger(fixed) || fixed < 0 || fixed > policy.limits.collection) fail('交互集合超出本页有限范围。');
        return fixed;
      }
    }
    if (node.k === 'Arr') return precise ? node.els.length : Math.max(node.els.length, ...node.els
      .map(value => arrayBound(value, visiting, locals, precise)));
    if (node.k === 'Obj') return Math.max(0, ...node.entries.map(([, value]) => arrayBound(value, visiting, locals, precise)));
    if (node.k === 'Ref' && locals.has(node.n)) return locals.get(node.n)!;
    if (node.k === 'Ref' && statements.has(node.n) && !visiting.has(node.n)) {
      const key = `${precise ? 'outer' : 'descendant'}:${node.n}`;
      if (referenceBounds.has(key)) return referenceBounds.get(key)!;
      const bound = arrayBound(statements.get(node.n)!, new Set([...visiting, node.n]), new Map(), precise);
      referenceBounds.set(key, bound); return bound;
    }
    // Native Each is Array.map: its outer length is the input length even
    // when its template reads $ui. Item descendants keep the conservative
    // pass below, so mapping an item to a large array cannot hide nesting.
    if (precise && node.k === 'Comp' && node.name === 'Each')
      return arrayBound(node.args[0], visiting, locals, true);
    if (precise && node.k === 'Comp') {
      const rule = policy.functionCardinalityRules?.[node.name];
      if (rule?.kind === 'count_argument') return node.args[rule.argument]
        ? numberUpper(node.args[rule.argument], visiting, locals) ?? policy.limits.collection : policy.limits.collection;
      if (rule?.kind === 'input_length' || rule?.kind === 'at_most_input') {
        const input = node.args[rule.argument], inputUpper = input ? knownCollectionUpper(input, visiting, locals) : undefined;
        const count = rule.countArgument === undefined || !node.args[rule.countArgument] ? undefined : numberUpper(node.args[rule.countArgument], visiting, locals);
        return Math.min(inputUpper ?? policy.limits.collection, count ?? policy.limits.collection);
      }
    }
    if (node.k === 'Comp' && node.name === 'Data' && node.args[0]?.k === 'Str')
      return policy.bindingCollectionLengths?.[node.args[0].v] ?? policy.limits.collection;
    if (node.k === 'Member' && node.obj.k === 'StateRef') return policy.stateCollectionLengths?.[node.field] ?? policy.limits.collection;
    if (node.k === 'Index' && node.obj.k === 'StateRef' && node.index.k === 'Str') return policy.stateCollectionLengths?.[node.index.v] ?? policy.limits.collection;
    if (node.k === 'Member' || node.k === 'Index') return arrayBound(node.obj, visiting, locals, false);
    if (node.k === 'Num' || node.k === 'Str' || node.k === 'Bool' || node.k === 'Null') return 0;
    return policy.limits.collection;
  };
  const collectionKind = (node: ASTNode, visiting = new Set<string>()): 'exact' | 'upper_bound' => {
    if (policy.constantCollectionLength?.(node) !== undefined) return 'exact';
    if (node.k === 'Ref' && statements.has(node.n) && !visiting.has(node.n))
      return collectionKind(statements.get(node.n)!, new Set([...visiting, node.n]));
    if (node.k === 'Comp' && node.name === 'Each') return collectionKind(node.args[0], visiting);
    return 'upper_bound';
  };
  type LoopCost = { count: number; kind: 'exact' | 'upper_bound'; templateUnits: number; units: number };
  const expansion = (node: ASTNode, visiting: ReadonlySet<string>, depth: number, locals: ReadonlyMap<string, number>,
    placedSources: Set<string>, loops: LoopCost[], statementOrdinal: number,
    location: string): number => {
    if (depth > policy.limits.depth) fail('交互引用嵌套过深。');
    let size = 1;
    const charge = (amount: number) => {
      size += amount;
      if (!Number.isSafeInteger(size) || size > policy.limits.expandedNodes) {
        const loop = [...loops].sort((a, b) => b.units - a.units)[0];
        const functions = ['Field', 'AsNumber'].flatMap(name => Object.hasOwn(policy.functionHelp.entries, name)
          ? [{ name, ...policy.functionHelp.entries[name] }] : []);
        const metrics: InteractiveProgramExpansionDiagnostic = { measure: 'partial_static_expansion_upper_bound',
          estimatedSoFar: size, limit: policy.limits.expandedNodes, rawAstNodes: nodeCount, statements: statements.size,
          statementOrdinal, location: location.slice(-160),
          ...(loop ? { loop: { count: loop.count, kind: loop.kind, templateUnits: loop.templateUnits, units: loop.units } } : {}),
          referenceSemantics: 'ordinary_refs_inline',
          ...(functions.length ? { functions, read: { tool: 'read_skill', arguments: { id: policy.functionHelp.methodId,
            section: 'functions', names: functions.map(entry => entry.name), limit: functions.length } } } : {}),
          builtinRead: { tool: 'read_skill', arguments: { id: policy.functionHelp.methodId, section: 'grammar' } } };
        throw new HarnessError('interactive_program', '交互展开量过大，请缩小集合或减少嵌套。', 'never', {
          rejectedDimensions: ['expandedNodes'],
          expansion: metrics,
          explanation: 'expansion是阈值处停止的部分静态保守工作量，不是全程序精确数或UI节点数。普通声明Ref会逐处内联，不缓存算出的参数或点列。共同核集合长度与每项templateUnits；优先收每项重复参数计算。可用已有Each遍历仅含一条纯参数记录的数组，再在同一内联模板中遍历原集合、读取已求值局部记录；局部变量不提到外部声明，SourceSlot仍留在Each外。functions给当前实际小签名，builtinRead指向原Each语法。不以删交互或稀疏图线过门；仍以整件编译结果为准，未发表新版本。',
        });
      }
    };
    let childOrdinal = 0;
    const add = (value: ASTNode) => charge(expansion(value, visiting, depth + 1, locals, placedSources,
      loops, statementOrdinal, `${location}/${childOrdinal++}`));
    switch (node.k) {
      case 'Ref':
        if (statements.has(node.n)) {
          if (visiting.has(node.n)) fail(`交互声明 ${node.n} 形成循环引用。`);
          charge(expansion(statements.get(node.n)!, new Set([...visiting, node.n]), depth + 1, locals, placedSources,
            loops, statementOrdinal, `${location}/r`));
        }
        break;
      case 'Comp':
        if (node.name === 'SourceSlot') {
          const ref = node.args[1];
          if (ref.k !== 'Str' || locals.size || placedSources.has(ref.v))
            fail('同一原画面不重复展开，也不在 Each 中生成多个 surface。');
          placedSources.add(ref.v);
        }
        if (node.name === 'Each') {
          add(node.args[0]);
          const bound = arrayBound(node.args[0], visiting, locals), binder = node.args[1];
          const name = binder.k === 'Str' ? binder.v : binder.k === 'Ref' ? binder.n : '';
          const nestedBound = Math.max(bound, arrayBound(node.args[0], visiting, locals, false));
          const templateUnits = expansion(node.args[2], visiting, depth + 1,
            new Map([...locals, [name, nestedBound]]), placedSources, loops,
            statementOrdinal, `${location}/t`);
          const units = bound * templateUnits;
          loops.push({ count: bound, kind: collectionKind(node.args[0]), templateUnits, units });
          charge(units);
        } else node.args.forEach(add);
        break;
      case 'Arr': node.els.forEach(add); break;
      case 'Obj': node.entries.forEach(([, value]) => add(value)); break;
      case 'Member': add(node.obj); break;
      case 'Index': add(node.obj); add(node.index); break;
      case 'UnaryOp': add(node.operand); break;
      case 'BinOp': add(node.left); add(node.right); break;
      case 'Ternary': add(node.cond); add(node.then); add(node.else); break;
    }
    charge(0);
    return size;
  };
  let expandedNodes = 0;
  let statementOrdinal = 0;
  for (const [name, node] of statements) {
    statementOrdinal++;
    expandedNodes = Math.max(expandedNodes,
      expansion(node, new Set([name]), 0, new Map(), new Set(), [], statementOrdinal, `s${statementOrdinal}`));
  }
  return { statements, nodeCount, expandedNodes };
}
