import { createHash } from 'node:crypto';
import { evaluate, evaluateRoot, isReactiveAssign, walkAST, type ASTNode, type ElementNode, type EvaluationContext, type OpenUIError } from '@openuidev/lang-core';
import { HarnessError, type InteractiveProgramInputDiagnostic } from '../../shared/harness';
import { createInteractiveLibrary, createInteractiveParser, getInteractiveProgramSpec, interactiveEvaluationFunctions,
  inspectInteractivePrimitiveProperties } from '../../shared/interactive-library';
import { interactiveFunctionMetadata, interactiveFunctionNames } from '../../shared/interactive-functions';
import { INTERACTIVE_PROGRAM_LIMITS, PROGRAM_AST_RULES, PROGRAM_LIBRARY_VERSION, initialProgramState,
  interactiveProgramDraftSchema, validateProgramState, type InteractiveProgramDocument, type InteractiveProgramDraft,
  type ProgramDataMap, type ProgramJsonValue, type ProgramStateValues } from '../../shared/interactive-program';
import { canonical } from './semantics';
import { inspectInteractiveProgram, type ProgramAstPolicy } from './interactive-program-ast';
import { INTERACTIVE_PROGRAM_METHOD_ID } from './interactive-program-guidance';

function fail(message: string): never { throw new HarnessError('interactive_program', message); }
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const spec = getInteractiveProgramSpec();
const primitiveNames = new Set(Object.keys(spec.components));
const functionNames = new Set([...interactiveFunctionNames, ...PROGRAM_AST_RULES.customActions]);
const functionHelp: ProgramAstPolicy['functionHelp'] = { methodId: INTERACTIVE_PROGRAM_METHOD_ID,
  entries: Object.fromEntries(Object.entries(spec.library.functions || {}).flatMap(([name, entry]) => {
    const metadata = interactiveFunctionMetadata[name];
    return metadata && functionNames.has(name) ? [[name, { signature: `@${entry.signature}`, returnKind: metadata.returnKind,
      ...(metadata.minimumArguments === undefined ? {} : { minimumArguments: metadata.minimumArguments }) }]] : [];
  })) };
const prototypeKeys = new Set(PROGRAM_AST_RULES.forbiddenMemberKeys);
type NativeParserInput = Extract<InteractiveProgramInputDiagnostic, { layer: 'native_parser' }>;
/** Project the native JSON Pointer through the fixed library schema. The
 * parser's message can contain rejected values, so it never crosses this port. */
function nativeProperty(name: string | undefined, pointer: string | undefined): NativeParserInput['errors'][number]['property'] | undefined {
  if (!name || typeof pointer !== 'string' || !Object.hasOwn(spec.schema.$defs || {}, name) || !pointer.startsWith('/')) return;
  const root = spec.schema.$defs![name] as Record<string, any>;
  let current = root;
  const path: (string | number)[] = [], parts = pointer.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let pathComplete = parts.length <= 12;
  for (const part of parts.slice(0, 12)) {
    const properties = current.properties;
    if (properties && typeof properties === 'object' && Object.hasOwn(properties, part)) {
      path.push(part); current = properties[part];
    } else if (current.type === 'array' && /^(?:0|[1-9]\d*)$/.test(part) && Number.isSafeInteger(Number(part))
      && current.items && typeof current.items === 'object' && !Array.isArray(current.items)) {
      path.push(Number(part)); current = current.items;
    } else { pathComplete = false; break; }
    if (!current || typeof current !== 'object' || Array.isArray(current)) { pathComplete = false; break; }
  }
  if (!path.length) return;
  const parameterIndex = Object.keys(root.properties || {}).indexOf(String(path[0]));
  const tail = current as Record<string, any>, kind = tail.type === 'integer' ? 'int' : tail.type;
  const expected = typeof kind === 'string' && ['string', 'number', 'int', 'boolean', 'array', 'object', 'null'].includes(kind)
    ? kind as NonNullable<NativeParserInput['errors'][number]['property']>['expected'] : undefined;
  return { path, pathComplete, ...(parameterIndex >= 0 ? { parameterIndex } : {}), ...(expected ? { expected } : {}) };
}
function componentFailure(name: string, problem: NonNullable<ReturnType<typeof inspectInteractivePrimitiveProperties>>, statementOrdinal?: number): never {
  const definitions = spec.library.components || {};
  const definition = Object.hasOwn(definitions, name) ? definitions[name] : undefined;
  if (!definition) fail(problem.message);
  throw new HarnessError('interactive_program', problem.message, 'never', { rejectedDimensions: ['component_properties'],
    component: { name, signature: definition.signature, ...(statementOrdinal === undefined ? {} : { statementOrdinal }), issues: problem.issues.slice(0, 4),
      read: { tool: 'read_skill', arguments: { id: INTERACTIVE_PROGRAM_METHOD_ID, section: 'components', names: [name], limit: 1 } } },
    explanation: 'component带着当前组件签名，issues指出这次能定位的字段或数字下标，原输入值留在原稿里。parameterIndex从0计，沿签名找参数；statementOrdinal从1计，回到对应原声明。同一声明里有几个同类部件时，这个编号先帮你找到声明，再结合原稿看具体一处。沿所附read展开需要的参数说明，就能继续修这一件作品。' });
}

/** Bound data remains a live projection; neither this clone nor its digest is
 * a new source owner or permission to restore it from history. */
function admittedData(aliases: readonly string[], raw?: ProgramDataMap): ProgramDataMap {
  if (aliases.some(alias => !raw || !Object.hasOwn(raw, alias)))
    throw new HarnessError('interactive_program_data_unavailable', '这份交互的原资料还没重新读到，先接回它的来源。');
  let count = 0;
  const copy = (value: unknown, depth: number): ProgramJsonValue => {
    if (++count > INTERACTIVE_PROGRAM_LIMITS.evaluationSteps || depth > INTERACTIVE_PROGRAM_LIMITS.depth)
      fail('这组绑定资料的结构过大，请先缩小实际读取范围。');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('绑定资料含有非有限数。'); return value; }
    if (Array.isArray(value)) {
      if (value.length > INTERACTIVE_PROGRAM_LIMITS.collection) fail('绑定序列较长，请读取有界的一部分，没有静默截尾。');
      return Object.freeze(value.map(item => copy(item, depth + 1))) as unknown as ProgramJsonValue[];
    }
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
      fail('绑定资料需要是已交付的普通 JSON 值。');
    const tagged = value as Record<string, unknown>;
    if (Object.hasOwn(tagged, '__reactive') || typeof tagged.k === 'string'
      && ['Comp', 'Str', 'Num', 'Bool', 'Null', 'Arr', 'Obj', 'Ref', 'Ph', 'StateRef', 'RuntimeRef', 'BinOp', 'UnaryOp', 'Ternary', 'Member', 'Index', 'Assign'].includes(tagged.k)
      || tagged.type === 'element' && typeof tagged.typeName === 'string')
      fail('绑定资料含有解释器保留标记，请选取需要的普通字段或文字。');
    const result: Record<string, ProgramJsonValue> = Object.create(null);
    for (const [key, child] of Object.entries(value)) {
      if (prototypeKeys.has(key)) fail('这组资料包含不可用的对象字段，请选取所需的确切部分。');
      result[key] = copy(child, depth + 1);
    }
    return Object.freeze(result);
  };
  return Object.freeze(Object.fromEntries(aliases.map(alias => [alias, copy(raw![alias], 0)])));
}
function largestCollection(value: ProgramJsonValue): number {
  if (Array.isArray(value)) return Math.max(value.length, 0, ...value.map(largestCollection));
  if (value && typeof value === 'object') return Math.max(0, ...Object.values(value).map(largestCollection));
  return 0;
}
function programHash(program: Pick<InteractiveProgramDocument, 'sourceDsl' | 'states' | 'bindingAliases' | 'sourceSlots' | 'provenance' | 'initialState' | 'initialStateMode' | 'initialInputFields'>, data: ProgramDataMap) {
  return digest({ libraryVersion: PROGRAM_LIBRARY_VERSION, sourceDsl: program.sourceDsl, states: program.states,
    bindingAliases: program.bindingAliases, sourceSlots: program.sourceSlots || [], data: digest(data), provenance: program.provenance,
    ...(program.initialStateMode === 'admitted_seed' ? { initialStateMode: program.initialStateMode, initialState: program.initialState,
      ...(program.initialInputFields?.length ? { initialInputFields: program.initialInputFields } : {}) } : {}) });
}
export interface InteractiveProgramEvaluation {
  inputs: ProgramStateValues;
  root: ElementNode;
  nodeIds: string[];
  stats: InteractiveProgramDocument['stats'];
}

function evaluateProgram(sourceDsl: string, states: InteractiveProgramDocument['states'], inputs: ProgramStateValues,
  aliases: readonly string[], data: ProgramDataMap, sourceSlots: readonly string[]): InteractiveProgramEvaluation & { dsl: string } {
  const library = createInteractiveLibrary({ data });
  const nativeFunctions = interactiveEvaluationFunctions(library);
  let steps = 0;
  const charge = () => { if (++steps > INTERACTIVE_PROGRAM_LIMITS.evaluationSteps) fail('这次演算超过当前有限工作量，请缩小内容。'); };
  const functions: NonNullable<EvaluationContext['functions']> = Object.fromEntries(Object.entries(nativeFunctions).map(([name, definition]) =>
    [name, { ...definition, fn: (args: unknown) => { charge(); return definition.fn(args); } }]));
  const reports: string[] = [];
  let statements: ReadonlyMap<string, ASTNode> = new Map();
  const resolving = new Set<string>(), values = new Map<string, unknown>();
  const context: EvaluationContext = {
    getState(name) { charge(); return name === PROGRAM_AST_RULES.stateRoot ? inputs : undefined; },
    resolveRef(name) {
      charge();
      if (values.has(name)) return values.get(name);
      const node = statements.get(name);
      if (!node || resolving.has(name)) fail('交互引用缺失或形成循环。');
      resolving.add(name);
      try { const value = evaluate(node, context, { library }); values.set(name, value); return value; }
      finally { resolving.delete(name); }
    },
    functions, actions: library.toJSONSchema().actions, reportError(message) { reports.push(message); },
  };
  const stateKinds = Object.fromEntries(Object.entries(states).map(([key, state]) => [key,
    state.kind === 'number' || state.kind === 'boolean' ? state.kind : state.kind === 'text' || state.kind === 'choice' ? 'string' : 'unknown'])) as ProgramAstPolicy['stateKinds'];
  const stateLengths = Object.fromEntries(Object.entries(states).flatMap(([key, state]) => state.kind === 'sequence' ? [[key, state.maxItems]] : []));
  const stateNumberMaxima = Object.fromEntries(Object.entries(states).flatMap(([key, state]) => state.kind === 'number' ? [[key, state.max]] : []));
  const fixedLengths = new WeakMap<ASTNode, number | undefined>();
  const fixedNumbers = new WeakMap<ASTNode, number | undefined>();
  const independentReferences = new Map<string, boolean>();
  const stateIndependent = (node: ASTNode, visiting: ReadonlySet<string>): boolean => {
    switch (node.k) {
      case 'StateRef': case 'Assign': case 'RuntimeRef': case 'Ph': return false;
      case 'Ref': {
        if (!statements.has(node.n) || visiting.has(node.n)) return false;
        if (independentReferences.has(node.n)) return independentReferences.get(node.n)!;
        const independent = stateIndependent(statements.get(node.n)!, new Set([...visiting, node.n]));
        independentReferences.set(node.n, independent); return independent;
      }
      case 'Comp': return node.name !== 'Each' && !primitiveNames.has(node.name) && node.args.every(arg => stateIndependent(arg, visiting));
      case 'Arr': return node.els.every(arg => stateIndependent(arg, visiting));
      case 'Obj': return node.entries.every(([, arg]) => stateIndependent(arg, visiting));
      case 'Member': return stateIndependent(node.obj, visiting);
      case 'Index': return stateIndependent(node.obj, visiting) && stateIndependent(node.index, visiting);
      case 'BinOp': return stateIndependent(node.left, visiting) && stateIndependent(node.right, visiting);
      case 'UnaryOp': return stateIndependent(node.operand, visiting);
      case 'Ternary': return stateIndependent(node.cond, visiting) && stateIndependent(node.then, visiting) && stateIndependent(node.else, visiting);
      default: return true;
    }
  };
  const policy: ProgramAstPolicy = { components: primitiveNames, functions: functionNames, bindingNames: new Set(aliases), sourceSlots: new Set(sourceSlots), stateKinds, functionHelp,
    stateCollectionLengths: stateLengths, stateNumberMaxima,
    bindingCollectionLengths: Object.fromEntries(Object.entries(data).map(([alias, value]) => [alias, largestCollection(value)])),
    functionCardinalityRules: Object.fromEntries(Object.entries(interactiveFunctionMetadata).flatMap(([name, metadata]) =>
      metadata.cardinalityRule ? [[name, metadata.cardinalityRule]] : [])),
    functionKinds: Object.fromEntries(Object.entries(interactiveFunctionMetadata).map(([name, metadata]) => [name,
      metadata.returnKind === 'boolean' || metadata.returnKind === 'boolean?' || metadata.returnKind === 'number?' ? metadata.returnKind
        : metadata.returnKind === 'text?' ? 'string?' : 'unknown'])),
    functionReturnRules: Object.fromEntries(Object.entries(interactiveFunctionMetadata).flatMap(([name, metadata]) =>
      metadata.returnRule ? [[name, metadata.returnRule]] : [])),
    functionMinimumArguments: Object.fromEntries(Object.entries(interactiveFunctionMetadata).flatMap(([name, metadata]) =>
      metadata.minimumArguments === undefined ? [] : [[name, metadata.minimumArguments]])),
    limits: { bytes: INTERACTIVE_PROGRAM_LIMITS.dslBytes, tokens: INTERACTIVE_PROGRAM_LIMITS.tokens, depth: INTERACTIVE_PROGRAM_LIMITS.depth,
      statements: INTERACTIVE_PROGRAM_LIMITS.statements, nodes: INTERACTIVE_PROGRAM_LIMITS.expandedNodes,
      collection: INTERACTIVE_PROGRAM_LIMITS.collection, expandedNodes: INTERACTIVE_PROGRAM_LIMITS.expandedNodes },
    constantCollectionLength(node) {
      if (fixedLengths.has(node)) return fixedLengths.get(node);
      if (!stateIndependent(node, new Set())) { fixedLengths.set(node, undefined); return; }
      const value = evaluate(node, context, { library });
      const length = Array.isArray(value) ? value.length : undefined;
      fixedLengths.set(node, length); return length;
    },
    constantNumber(node) {
      if (fixedNumbers.has(node)) return fixedNumbers.get(node);
      if (!stateIndependent(node, new Set())) { fixedNumbers.set(node, undefined); return; }
      const value = evaluate(node, context, { library });
      const number = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
      fixedNumbers.set(node, number); return number;
    },
  };
  // Build the native statement map first. Expansion inspection then has the
  // same pure resolver for exact state-independent collection cardinality.
  const initialInspection = inspectInteractiveProgram(sourceDsl, { ...policy, constantCollectionLength: undefined, constantNumber: undefined }, false);
  statements = initialInspection.statements;
  // A finite trajectory does not change its own endpoints as $ui advances.
  // Check every declared branch through the same native evaluator, including
  // Motion nodes not materialized by the initial condition.
  let motionStatementOrdinal = 0;
  for (const statement of statements.values()) {
    motionStatementOrdinal++;
    walkAST(statement, node => {
      if (node.k !== 'Comp' || node.name !== 'Motion') return;
      const frames = node.args[1];
      if (!frames || !stateIndependent(frames, new Set())) fail('Motion 帧需要与可调输入和 Each 局部值无关的有限纯表达式。');
      const problem = inspectInteractivePrimitiveProperties('Motion', { id: 'motion-frame-boundary',
        frames: evaluate(frames, context, { library }) }, states);
      if (problem) componentFailure('Motion', problem, motionStatementOrdinal);
    });
  }
  const inspection = inspectInteractiveProgram(sourceDsl, policy);
  statements = inspection.statements;
  values.clear();
  const dsl = `${PROGRAM_AST_RULES.stateRoot} = ${JSON.stringify(initialProgramState(states))}\n${sourceDsl}`;
  const parsed = createInteractiveParser().parse(dsl);
  if (parsed.meta.incomplete || parsed.meta.unresolved.length || parsed.meta.errors.length || parsed.queryStatements.length || parsed.mutationStatements.length) {
    const counts = { incomplete: parsed.meta.incomplete ? 1 : 0, unresolved: parsed.meta.unresolved.length,
      parseErrors: parsed.meta.errors.length, query: parsed.queryStatements.length, mutation: parsed.mutationStatements.length };
    const flags = { incomplete: parsed.meta.incomplete, unresolved: counts.unresolved > 0,
      parseErrors: counts.parseErrors > 0, query: counts.query > 0, mutation: counts.mutation > 0 };
    const ordinals = new Map([...inspection.statements.keys()].map((name, index) => [name, index + 1]));
    const errors: NativeParserInput['errors'] = parsed.meta.errors.slice(0, 4).map(error => {
      const statementOrdinal = error.statementId === undefined ? undefined : ordinals.get(error.statementId);
      const name = error.component;
      const components = spec.library.components || {}, functions = spec.library.functions || {};
      let contract: NativeParserInput['errors'][number]['contract'];
      if (typeof name === 'string' && (Object.hasOwn(components, name) || Object.hasOwn(functions, name))) {
        const component = Object.hasOwn(components, name), definition = component ? components[name] : functions[name];
        contract = { kind: component ? 'component' : 'function', name,
          signature: `${component ? '' : '@'}${definition.signature}`,
          read: { tool: 'read_skill', arguments: { id: INTERACTIVE_PROGRAM_METHOD_ID,
            section: component ? 'components' : 'functions', names: [name], limit: 1 } } };
      }
      const property = nativeProperty(name, error.path);
      return { code: error.code, ...(statementOrdinal === undefined ? {} : { statementOrdinal }), ...(property ? { property } : {}), ...(contract ? { contract } : {}) };
    });
    const input: NativeParserInput = { tool: 'present_view', layer: 'native_parser', flags, counts, errors };
    throw new HarnessError('interactive_program_parse', '这份画面的写法还没接上，下面留着这次的解析结果和可继续的读法。', 'never', {
      rejectedDimensions: ([['native_parser.incomplete', flags.incomplete], ['native_parser.unresolved', flags.unresolved],
        ['native_parser.parse_errors', flags.parseErrors], ['native_parser.query', flags.query], ['native_parser.mutation', flags.mutation]] as const)
        .filter(([, blocked]) => blocked).map(([name]) => name), input,
      explanation: 'input的flags和counts记着这一次原生解析遇到什么，unresolved数的是尚未定义的引用，orphaned另指未使用声明。statementOrdinal按原声明从1编号；property.path沿组件的固定字段和数组下标找位置，parameterIndex从0计，对应签名中的参数。一个声明里若有几个同名部件，先回到这条声明，再结合原稿确定具体一处。pathComplete=false表示路径读到未知或record键前停住，expected给出共享定义里的类型，contract带着当前签名和read入口。批注按这次能确定的位置、类型与读法展开，输入内容仍可沿原稿回看。',
    });
  }
  if (Object.keys(parsed.stateDeclarations).length !== 1 || !Object.hasOwn(parsed.stateDeclarations, PROGRAM_AST_RULES.stateRoot))
    fail('交互内容只能使用宿主生成的一个 $ui 记录。');
  const errors: OpenUIError[] = [];
  const root = evaluateRoot(parsed, { ctx: context, library, store: null, errors });
  if (!root || reports.length || errors.some(error => error.severity !== 'warning')) fail('这组条件下的交互表达式无法完整求值，请修订对应关系。');
  const nodeIds: string[] = [], identities = new Set<string>(), placedSources = new Set<string>();
  let materialized = 0;
  const walkChildren = (value: unknown, slot: 'view' | 'graphic', depth: number): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length > INTERACTIVE_PROGRAM_LIMITS.expandedNodes) fail('子项超过本页有限展开范围。');
      for (const child of value) walkChildren(child, slot, depth + 1);
      return;
    }
    if (typeof value !== 'object' || (value as ElementNode).type !== 'element') fail('子项需要是真实的交互部件。');
    walk(value as ElementNode, slot, depth);
  };
  const walk = (node: ElementNode, slot: 'root' | 'view' | 'graphic', depth: number): void => {
    if (++materialized > INTERACTIVE_PROGRAM_LIMITS.expandedNodes || depth > INTERACTIVE_PROGRAM_LIMITS.depth) fail('画面展开超过本页有限范围。');
    const metadata = spec.components[node.typeName];
    if (!metadata || slot === 'root' && metadata.kind !== 'document' || slot !== 'root' && metadata.kind === 'document'
      || slot === 'view' && metadata.kind === 'graphic' || slot === 'graphic' && ['view', 'source'].includes(metadata.kind)) fail('部件需要放在其实际支持的容器中。');
    const problem = inspectInteractivePrimitiveProperties(node.typeName, node.props, states);
    if (problem) componentFailure(node.typeName, problem);
    const id = node.props.id;
    if (typeof id !== 'string' || identities.has(id)) fail('当前展开的每个部件需要唯一且稳定的节点地址。');
    identities.add(id); nodeIds.push(id);
    if (metadata.kind === 'source') {
      const ref = node.props.ref;
      if (typeof ref !== 'string' || !sourceSlots.includes(ref) || placedSources.has(ref))
        fail('原画面需要本次准入的唯一确切地址。');
      placedSources.add(ref);
    }
    if (metadata.kind === 'document') {
      if (!isReactiveAssign(node.props.ui) || node.props.ui.target !== PROGRAM_AST_RULES.stateRoot
        || node.props.ui.expr.k !== 'StateRef' || node.props.ui.expr.n !== '$value') fail('文档只能直接绑定宿主的 $ui 记录。');
    }
    if (!metadata.childSlot && node.props.children !== undefined) fail('这个部件没有子项插槽。');
    if (metadata.childSlot) {
      const childSlot = metadata.childSlot === 'same' ? slot === 'graphic' ? 'graphic' : 'view' : metadata.childSlot;
      walkChildren(node.props.children, childSlot, depth + 1);
    }
  };
  walk(root, 'root', 0);
  return { inputs, root, nodeIds, dsl, stats: { statements: inspection.statements.size, astNodes: inspection.nodeCount,
    expandedNodes: Math.max(inspection.expandedNodes, materialized) } };
}

export function compileInteractiveProgram(raw: InteractiveProgramDraft, readonlyData: ProgramDataMap = {}, provenance?: unknown,
  sourceSlots: readonly string[] = [], admittedAliases?: readonly string[], initialInputs?: ProgramStateValues,
  initialInputFields?: readonly string[]): InteractiveProgramDocument {
  const input = interactiveProgramDraftSchema.parse(raw), aliases = [...(admittedAliases ?? input.bindings.map(binding => binding.alias))];
  if (aliases.length > INTERACTIVE_PROGRAM_LIMITS.bindings || new Set(aliases).size !== aliases.length)
    fail('当前只保留互不重名的有限资料绑定。');
  if (sourceSlots.length > 5 || new Set(sourceSlots).size !== sourceSlots.length
    || sourceSlots.some(ref => typeof ref !== 'string' || !ref.length || ref.length > 320 || /[\u0000-\u001f]/.test(ref)))
    fail('原画面引用需要本次已核的有限确切地址。');
  const data = admittedData(aliases, readonlyData), inputs = initialInputs === undefined
    ? initialProgramState(input.states) : validateProgramState(input.states, initialInputs);
  if (initialInputFields?.length && (initialInputs === undefined || initialInputFields.length > INTERACTIVE_PROGRAM_LIMITS.states
    || new Set(initialInputFields).size !== initialInputFields.length || initialInputFields.some(key => !Object.hasOwn(input.states, key))))
    fail('明确改值的字段需要属于这次完整的局部输入。');
  const result = evaluateProgram(input.dsl, input.states, inputs, aliases, data, sourceSlots);
  const document: InteractiveProgramDocument = { libraryVersion: PROGRAM_LIBRARY_VERSION, dsl: result.dsl, sourceDsl: input.dsl,
    states: input.states, initialState: inputs, ...(initialInputs === undefined ? {} : { initialStateMode: 'admitted_seed' as const }),
    ...(initialInputFields?.length ? { initialInputFields: [...initialInputFields].sort() } : {}),
    bindingAliases: aliases, ...(aliases.length ? { currentData: data } : {}),
    ...(sourceSlots.length ? { sourceSlots: [...sourceSlots] } : {}),
    hash: '', nodeIds: result.nodeIds, stats: result.stats, ...(provenance === undefined ? {} : { provenance }) };
  document.hash = programHash(document, data);
  return document;
}

/** Recompute client-selected inputs; client positions, derived answers and
 * permissions never enter this function. Source admission remains its owner. */
export function validateProgramStateAndEvaluate(program: InteractiveProgramDocument, completeInputs: unknown,
  readonlyData: ProgramDataMap | undefined = program.currentData): InteractiveProgramEvaluation {
  if (program.libraryVersion !== PROGRAM_LIBRARY_VERSION) fail('这份交互使用了其他库版本，请回原内容重新展开。');
  const data = admittedData(program.bindingAliases, readonlyData), inputs = validateProgramState(program.states, completeInputs);
  if (program.hash !== programHash(program, data)) throw new HarnessError('interactive_program_changed', '这份交互或它的资料已有变化，请从当前版本接着看。');
  const evaluated = evaluateProgram(program.sourceDsl, program.states, inputs, program.bindingAliases, data, program.sourceSlots || []);
  return { inputs: evaluated.inputs, root: evaluated.root, nodeIds: evaluated.nodeIds, stats: evaluated.stats };
}
