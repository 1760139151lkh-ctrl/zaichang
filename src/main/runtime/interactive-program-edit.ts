import { mergeStatements, walkAST, type ASTNode } from '@openuidev/lang-core';
import { HarnessError } from '../../shared/harness';
import { INTERACTIVE_PROGRAM_LIMITS, type InteractiveProgramDocument, type InteractiveProgramInput,
  interactiveStateDeclarationsSchema, validateProgramState } from '../../shared/interactive-program';
import type { RunSession } from './coordinator';
import { parseProgramStatements } from './interactive-program-ast';
import { canonical } from './semantics';
import { programStateForRead } from './interactive-program-reference';

const limits = { bytes: INTERACTIVE_PROGRAM_LIMITS.dslBytes, tokens: INTERACTIVE_PROGRAM_LIMITS.tokens,
  depth: INTERACTIVE_PROGRAM_LIMITS.depth, statements: INTERACTIVE_PROGRAM_LIMITS.statements,
  nodes: INTERACTIVE_PROGRAM_LIMITS.evaluationSteps, collection: INTERACTIVE_PROGRAM_LIMITS.collection,
  expandedNodes: INTERACTIVE_PROGRAM_LIMITS.expandedNodes };
function fail(message: string): never { throw new HarnessError('interactive_program_patch', message); }
interface Statement { id: string; ast: ASTNode; raw: string; rhs: string }

/** Source spans only: native tokenize/split/parseExpression owns their meaning.
 * Unlike native merge's private splitter, this retains top-level ternaries. */
function statementSources(source: string): string[] {
  const result: string[] = [];
  let start = 0, depth = 0, ternary = 0, quote = '', escaped = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
    else if (depth === 0 && char === '?') ternary++;
    else if (depth === 0 && char === ':' && ternary) ternary--;
    if (char !== '\n' || depth > 0 || ternary > 0) continue;
    let next = index + 1;
    while (next < source.length && /\s/.test(source[next])) next++;
    if (source[next] === '?') continue;
    const raw = source.slice(start, index).trim();
    if (raw) result.push(raw);
    start = index + 1;
  }
  const tail = source.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}
function statements(source: string, requireRoot: boolean): Statement[] {
  const whole = parseProgramStatements(source, limits, requireRoot), result: Statement[] = [];
  for (const raw of statementSources(source)) {
    const parsed = parseProgramStatements(raw, limits, false);
    if (parsed.size !== 1) fail('局部稿的每条声明需要有清楚的完整边界。');
    const [id, ast] = [...parsed][0], head = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.exec(raw);
    if (!head || canonical(whole.get(id)) !== canonical(ast) || result.some(statement => statement.id === id))
      fail('局部稿没有完整对应原生声明，请保留完整的声明与分支。');
    result.push({ id, ast, raw, rhs: raw.slice(head[0].length) });
  }
  if (result.length !== whole.size) fail('局部稿含有未完整识别的声明，没有忽略这些内容。');
  return result;
}

/** Native merge performs replacement/deletion/order. Its tolerant parser and
 * GC cannot make a bad or unmentioned declaration disappear: both inputs are
 * strict first, GC is disabled by an absent root, and every result is checked. */
export function mergeProgramSource(existing: string, patch: string): string {
  const before = statements(existing, true);
  if (!patch.trim()) return existing;
  const changes = statements(patch, false);
  const expected = new Map(before.map(statement => [statement.id, statement]));
  for (const statement of changes) {
    if (statement.ast.k === 'Null') {
      if (!expected.delete(statement.id)) fail('删除的声明不在这个原版本里，请先沿原稿确认名称。');
    } else expected.set(statement.id, statement);
  }
  const normalize = (rows: Statement[]) => rows.map(row => `${row.id} = (\n${row.rhs}\n)`).join('\n');
  let absentRoot = '__host_merge_without_gc';
  while (expected.has(absentRoot) || before.some(row => row.id === absentRoot) || changes.some(row => row.id === absentRoot)) absentRoot += '_';
  const merged = mergeStatements(normalize(before), normalize(changes), absentRoot);
  const actual = parseProgramStatements(merged, { ...limits, bytes: limits.bytes * 2 + limits.statements * 32,
    tokens: limits.tokens * 2 + limits.statements * 4, statements: limits.statements * 2, depth: limits.depth + 1 }, true);
  if (actual.size !== expected.size || canonical([...actual.keys()]) !== canonical([...expected.keys()])
    || [...actual].some(([id, ast]) => !expected.has(id) || canonical(ast) !== canonical(expected.get(id)!.ast)))
    fail('原生合并没有完整保留声明，这次未发表修改。');
  // The private merge normalization is not saved. Unchanged authored source
  // remains the same, and its parentheses do not consume the final DSL budget.
  const result = [...actual.keys()].map(id => expected.get(id)!.raw).join('\n');
  parseProgramStatements(result, limits, true);
  return result;
}

export function sourceSlotReferences(source: string): string[] {
  const refs = new Set<string>();
  for (const ast of parseProgramStatements(source, limits).values()) walkAST(ast, node => {
    if (node.k === 'Comp' && node.name === 'SourceSlot' && node.args[1]?.k === 'Str') refs.add(node.args[1].v);
  });
  return [...refs];
}

export function editedProgramStates(program: InteractiveProgramDocument,
  input: Extract<InteractiveProgramInput, { patch: string }>, session: RunSession,
  source: { messageId: string; programId: string; revision: number }) {
  const state = programStateForRead(session, source, program);
  const declarations = structuredClone(program.states);
  for (const [key, change] of Object.entries(input.stateChanges || {})) {
    if (change === null) {
      if (!Object.hasOwn(declarations, key)) fail('删除的局部字段不在这个原版本里。');
      delete declarations[key];
    } else declarations[key] = structuredClone(change);
  }
  const states = interactiveStateDeclarationsSchema.parse(declarations);
  const carried = Object.fromEntries(Object.entries(states).map(([key, declaration]) =>
    [key, Object.hasOwn(program.states, key) ? structuredClone(state.inputs[key]) : structuredClone(declaration.initial)]));
  try {
    const values = validateProgramState(states, { ...carried, ...input.inputChanges });
    return { states, initialInputs: values, initialInputFields: Object.keys(input.inputChanges || {}).sort(), stateOrigin: state.origin,
      explicitInputFields: Object.keys(input.inputChanges || {}).length };
  } catch {
    throw new HarnessError('interactive_program_state_transition', '新声明接不住本次条件，这次没有重置原作品。请保留原范围，或明确改变对应条件后再续改。', 'never', {
      rejectedDimensions: ['state_transition'], explanation: 'patch已有字段保stateOrigin对应的提交快照或原初值，stateChanges.initial不重置已有字段。仅inputChanges显式改变对应条件。请核同原版本mode=states的真实字段和范围，合并后仍完整validate，不clamp、删条件或猜当前live值。失败没有发表新版本。',
    });
  }
}
