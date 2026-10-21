import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, type InteractiveProgramReadDeliveryIssue, type InteractiveProgramReadFailure, type InteractiveProgramReadReceipt } from '../../shared/harness';
import { interactiveProgramReferenceSchema, programNodeIdSchema, validateProgramState,
  type InteractiveProgramDocument, type ProgramFollowupReference, type ProgramStateValues } from '../../shared/interactive-program';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import { admitProgramRead, programReferenceIdentity, programSourcesReadable, readProgramView, recordProgramSources,
  type ProgramSourceAddress, type ProgramSourceProvenance } from './interactive-program-sources';
import { validateProgramStateAndEvaluate } from './interactive-program-compiler';
import { canonical, codePointSlice } from './semantics';
import { boundedProgramPresentation } from './presentation-delivery';

type ProgramHost = Pick<RuntimeCoordinator, 'repo' | 'policy' | 'context' | 'broker' | 'studyCompanion'>;
const readInput = z.object({ messageId: z.string().min(1).max(160), programId: z.string().min(1).max(160),
  revision: z.number().int().positive(), mode: z.enum(['overview', 'source', 'states']).default('overview'),
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(64000).optional(),
  nodeId: programNodeIdSchema.optional().describe('overview可只读同native求值实际存在的一个节点；省略看文档根的有限概要。'),
  stateKeys: z.array(z.string().min(1).max(48)).min(1).max(8).optional().describe('states模式：只取这些真实字段的完整声明与该次状态。'),
  full: z.boolean().optional().describe('仅source：显式读取当前许可的完整sourceDsl，不暗截尾。'),
  find: z.string().min(1).max(160).optional().describe('仅source：查原sourceDsl字面文字的精确Unicode位置，不读正文、不猜statement或只取首个匹配。'),
}).strict().superRefine((input, context) => {
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (input.mode !== 'source' && (input.full || input.find)) issue('全文与文字位置查询只用于source模式。');
  if (input.mode !== 'states' && input.stateKeys) issue('指定完整字段时使用states模式。');
  if (input.mode !== 'overview' && input.nodeId) issue('节点范围只用于overview模式。');
  if (input.mode === 'overview' && (input.limit || 12) > 16) issue('概要一次最多16个真实节点，可复制next继续。');
  if (input.mode === 'states' && (input.limit || 4) > 8) issue('完整字段一次最多8项，可按真实stateKeys精确读取。');
  if (input.find && (input.limit || 8) > 16) issue('字面位置一次最多16项，可复制next继续。');
  if (input.full && (input.offset !== undefined || input.limit !== undefined || input.find)) issue('全文读取不与片段、位置或文字查询混用。');
});
export const interactiveProgramReadDefinitions = [{ name: 'read_interactive_program', grant: 'evidence:read', schema: readInput,
  description: '沿真实messageId/programId/revision按需读同一交互作品。默认overview从整件文档根分页给有限native概要和状态预览，显式nodeId才只看该节点，不读整份DSL；source按绝对Unicode offset/limit读精确sourceDsl，find只定位字面文字，全文须full:true；states按真实stateKeys或页读完整声明。复制next续页，概要/末页不等于全文已读。用户当前值只取本轮已核UIref；否则明示initial或focus_only。缺Data保持needs_refresh，SourceSlot仅地址不展开私表，不执行工具或升级授权。' }];

function locateNativeNode(value: unknown, nodeId: string): unknown {
  if (Array.isArray(value)) { for (const child of value) { const found = locateNativeNode(child, nodeId); if (found) return found; } return; }
  if (!value || typeof value !== 'object') return;
  const node = value as { type?: string; props?: { id?: string; children?: unknown } };
  if (node.type !== 'element') return;
  return node.props?.id === nodeId ? value : locateNativeNode(node.props?.children, nodeId);
}
function previewValue(value: unknown) {
  if (typeof value === 'string') {
    const total = Array.from(value).length, end = Math.min(80, total);
    return { value: codePointSlice(value, 0, end), coverage: { start: 0, end, total, complete: end === total } };
  }
  if (Array.isArray(value)) return { value: value.slice(0, 8).map(item => typeof item === 'string' ? codePointSlice(item, 0, 80) : item),
    coverage: { start: 0, end: Math.min(8, value.length), total: value.length,
      complete: value.length <= 8 && value.every(item => typeof item !== 'string' || Array.from(item).length <= 80) } };
  return { value, coverage: { complete: true } };
}
function inputProjection(inputs: ProgramStateValues) {
  return { inputs: structuredClone(inputs), inputCoverage: { complete: true } };
}
export function programStateForRead(session: RunSession, source: ProgramSourceAddress, program: InteractiveProgramDocument) {
  const ref = session.programReference, current = session.pack?.data.currentInteractive as Record<string, unknown> | undefined;
  const same = ref && ref.messageId === source.messageId && ref.programId === source.programId && ref.revision === source.revision
    && current?.messageId === source.messageId && current.programId === source.programId && current.revision === source.revision
    && current.nodeId === ref.nodeId;
  if (same && ref.inputs !== undefined && ['local_conditions', 'local_conditions_error'].includes(String(current.mode)))
    return { inputs: validateProgramState(program.states, ref.inputs), origin: 'this_turn_admitted_ui_reference' as const };
  return { inputs: program.initialState, origin: same && current.mode === 'focus_only'
    ? 'initial_only_focus_has_no_current_inputs' as const : 'initial_not_current_ui_state' as const };
}

function programReadNavigation(source: ProgramSourceAddress, nodeId: string) {
  return { previous: { id: source.programId, expectedRevision: source.revision },
    read: { tool: 'read_interactive_program', arguments: { ...source, mode: 'overview' } },
    readFocused: { tool: 'read_interactive_program', arguments: { ...source, mode: 'overview', nodeId } } };
}

/** Inputs are hypothetical local conditions. The host recomputes the same
 * native program, then locates the actual node; no client-derived answer or
 * tool invocation is accepted. A focus-only reference makes no value claim. */
export function resolveProgramReference(host: ProgramHost, session: RunSession, raw: ProgramFollowupReference, signal: AbortSignal) {
  signal.throwIfAborted();
  const ref = interactiveProgramReferenceSchema.parse(raw), source: ProgramSourceAddress = {
    messageId: ref.messageId, programId: ref.programId, revision: ref.revision };
  const view = readProgramView(host, session, source), program = view.program;
  if (!program) throw new HarnessError('interactive_program_missing', '原回复里的这份交互已不在当前可读范围。');
  const admission = admitProgramRead(host, session, source, view, signal);
  const observations = (program.provenance as ProgramSourceProvenance).bindings.map(binding => ({ alias: binding.alias,
    tool: binding.tool, sourceId: binding.sourceId, fetchedAt: binding.fetchedAt, expiresAt: binding.expiresAt,
    status: binding.status, use: binding.use, ...(binding.origin ? { origin: binding.origin, parent: binding.parent } : {}) }));
  if (ref.inputs === undefined) {
    if (!program.nodeIds.includes(ref.nodeId)) throw new HarnessError('interactive_node_changed', '这个部件需要连同当前完整局部输入一起引用。');
    return { reference: ref, programSources: [source], sourceAdmission: admission, projection: {
      ...source, nodeId: ref.nodeId, kind: 'interactive_program', mode: 'focus_only', observations,
      ...programReadNavigation(source, ref.nodeId),
      meaning: '用户把注意力放到同一交互作品；没有提供当前局部输入，不能声称看到调整后的派生值。',
    } };
  }
  const inputs = validateProgramState(program.states, ref.inputs);
  let evaluated: ReturnType<typeof validateProgramStateAndEvaluate>;
  try { evaluated = validateProgramStateAndEvaluate(program, inputs); }
  catch (error) {
    // A valid local condition can leave the expression/plot domain. Retain
    // that actual condition and honest failure, not an invented output or 0.
    if (!(error instanceof HarnessError) || error.code !== 'interactive_program') throw error;
    if (!program.nodeIds.includes(ref.nodeId)) throw new HarnessError('interactive_node_changed', '当前演算未生成这个部件，先回原内容接上真实位置。');
    return { reference: { ...ref, inputs }, programSources: [source], sourceAdmission: admission, projection: {
      ...source, nodeId: ref.nodeId, kind: 'interactive_program', mode: 'local_conditions_error', ...inputProjection(inputs), observations,
      error: { code: error.code, reason: error.message },
      ...programReadNavigation(source, ref.nodeId),
      meaning: '原部件地址有效，局部输入也在声明范围内；宿主同一native程序在这些条件下求值失败，尚无当前派生节点或答案。可沿当前条件解释或修订，不把失败值补0，不把参数当本人事实。',
    } };
  }
  if (!evaluated.nodeIds.includes(ref.nodeId)) throw new HarnessError('interactive_node_changed', '这个部件不在当前输入实际生成的画面中，请回原界面重新引用。');
  const target = locateNativeNode(evaluated.root, ref.nodeId);
  if (!target) throw new HarnessError('interactive_node_changed', '当前部件没有对应的真实求值结果。');
  signal.throwIfAborted();
  const presentation = boundedProgramPresentation(target);
  return { reference: { ...ref, inputs: evaluated.inputs }, programSources: [source], sourceAdmission: admission, projection: {
    ...source, nodeId: ref.nodeId, kind: 'interactive_program', mode: 'local_conditions', ...inputProjection(evaluated.inputs),
    presentation: { ...presentation, next: presentation.nextOffset === null ? null : { tool: 'read_interactive_program',
      arguments: { ...source, mode: 'overview', nodeId: ref.nodeId, offset: presentation.nextOffset, limit: 12 } } }, observations,
    ...programReadNavigation(source, ref.nodeId),
    meaning: '这是用户当次选择的局部假设与宿主同一native程序基于原已读观察的实际求值；观察时刻和覆盖仍属原来源，不冒充新的现场/账号读取。不把参数、计算或点击当本人事实/接受/执行。用户本轮自己的新陈述仍按原语义方法理解。',
  } };
}
export { programReferenceIdentity };

/** Failed model-supplied addresses never become host source addresses. Only
 * their relation to already-admitted identities and a fixed reason survive. */
function recordProgramReadFailure(host: ProgramHost, session: RunSession, ref: ProgramSourceAddress,
  mode: 'overview' | 'source' | 'states', error: unknown, signal: AbortSignal) {
  const reasons: Record<string, InteractiveProgramReadFailure['reason']> = {
    interactive_program_reference_unqualified: 'reference_unqualified',
    interactive_program_source_proof_unavailable: 'source_proof_unavailable',
    interactive_program_view_missing: 'view_missing',
  };
  if (!(error instanceof HarnessError) || !Object.hasOwn(reasons, error.code) || !session.pack || signal.aborted) return;
  signal.throwIfAborted(); host.policy.validate(session.ingress.contract.scope);
  const same = (value: { messageId?: unknown; programId?: unknown; revision?: unknown } | undefined) => value
    && value.messageId === ref.messageId && value.programId === ref.programId && value.revision === ref.revision;
  const current = session.pack.data.currentInteractive as { messageId?: unknown; programId?: unknown; revision?: unknown } | undefined;
  const formal = !!(same(current) && same(session.programReference));
  const admitted = !!session.pack.receipt.interactiveProgramReads?.some(receipt => same(receipt.source));
  const relation: InteractiveProgramReadFailure['relation'] = formal && admitted ? 'formal_and_admitted'
    : formal ? 'formal_current' : admitted ? 'earlier_admitted' : 'unmatched_request';
  session.pack.receipt.interactiveProgramReadFailures = [...(session.pack.receipt.interactiveProgramReadFailures || []),
    { mode, reason: reasons[error.code], relation }].slice(-6);
  host.repo.saveReceipt(session.pack.contract.scope, session.pack.receipt);
}

/** Only safe, bounded admission metrics. A successful local read is distinct
 * from inclusion in a later successful request, let alone understanding. */
function programReadReceipt(source: ProgramSourceAddress, mode: 'overview' | 'source' | 'states',
  section: Record<string, unknown>, needsData: boolean, id: string, bytes: number, estimatedTokens: number): InteractiveProgramReadReceipt {
  const presentation = section.presentation as { parts?: unknown[]; coverage?: { offset: number; end: number; total: number; completeForProjection: boolean } } | undefined;
  const sourcePart = section.source as { text?: string; matches?: unknown[]; total?: number; searchFrom?: number;
    completeFromOffset?: boolean; coverage?: { start: number; end: number; total: number; wholeSourceProvided: boolean } } | undefined;
  const stateCoverage = section.coverage as { offset?: number; end?: number; total?: number; wholeStatesProvided?: boolean } | undefined;
  const next = section.next as { arguments?: { offset?: number } } | null | undefined;
  const count = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0;
  const coverage = mode === 'overview' ? { offset: presentation?.coverage?.offset || 0, end: presentation?.coverage?.end || 0,
    total: presentation?.coverage?.total || 0, complete: presentation?.coverage?.completeForProjection === true,
    wholeSourceProvided: false, sourceBodiesProvided: false, geometryPointsProvided: false }
    : mode === 'states' ? { offset: stateCoverage?.offset || 0, end: stateCoverage?.end || 0,
      total: stateCoverage?.total || 0, complete: stateCoverage?.offset === 0 && stateCoverage.end === stateCoverage.total,
      wholeSourceProvided: false, sourceBodiesProvided: false, geometryPointsProvided: false }
    : sourcePart?.coverage ? { offset: sourcePart.coverage.start, end: sourcePart.coverage.end,
      total: sourcePart.coverage.total, complete: sourcePart.coverage.wholeSourceProvided,
      wholeSourceProvided: sourcePart.coverage.wholeSourceProvided, sourceBodiesProvided: false, geometryPointsProvided: false }
    : { offset: sourcePart?.searchFrom || 0, end: sourcePart?.completeFromOffset ? sourcePart.total || 0 : next?.arguments?.offset || 0,
      total: sourcePart?.total || 0, complete: sourcePart?.completeFromOffset === true,
      wholeSourceProvided: false, sourceBodiesProvided: false, geometryPointsProvided: false };
  return { id, source: { ...source }, mode,
    ...(section.stateOrigin ? { stateOrigin: section.stateOrigin as InteractiveProgramReadReceipt['stateOrigin'] } : {}),
    status: needsData ? 'needs_refresh' : section.evaluationError ? 'evaluation_error' : 'available', coverage,
    counts: { nodes: presentation?.parts?.length || 0, stateDeclarations: count(section.states), statePreviews: count(section.statePreviews),
      sourceCodePoints: typeof sourcePart?.text === 'string' ? Array.from(sourcePart.text).length : 0,
      literalMatches: sourcePart?.matches?.length || 0 }, bytes, estimatedTokens, delivery: 'admitted' };
}

/** Reuse the original exact tool-wire delivery ledger. No DSL, state, query
 * or user-named node enters the receipt; no new delivery authority is made. */
export function markInteractiveProgramReadsDelivered(host: ProgramHost, session: RunSession,
  deliveryIssues?: ReadonlyMap<string, InteractiveProgramReadDeliveryIssue>): void {
  const pack = session.pack;
  if (!pack?.receipt.interactiveProgramReads?.length) return;
  const delivered = new Set((session.observations || []).flatMap(observation => {
    if (observation.tool !== 'read_interactive_program' || !observation.toolCallId
      || !session.deliveredObservationIds?.has(observation.toolCallId)) return [];
    const result = observation.result as { readReceiptId?: unknown } | undefined;
    return typeof result?.readReceiptId === 'string' ? [result.readReceiptId] : [];
  }));
  let changed = false;
  for (const receipt of pack.receipt.interactiveProgramReads) {
    if (delivered.has(receipt.id)) {
      if (receipt.delivery !== 'delivered_to_model') { receipt.delivery = 'delivered_to_model'; changed = true; }
      if (receipt.deliveryIssue !== undefined) { delete receipt.deliveryIssue; changed = true; }
    } else if (receipt.delivery === 'admitted') {
      const issue = deliveryIssues?.get(receipt.id);
      if (issue !== undefined && receipt.deliveryIssue !== issue) { receipt.deliveryIssue = issue; changed = true; }
    }
  }
  if (changed) { host.policy.validate(pack.contract.scope); host.repo.saveReceipt(pack.contract.scope, pack.receipt); }
}

export function executeInteractiveProgramRead(host: ProgramHost, session: RunSession, name: string, raw: unknown,
  signal: AbortSignal): Promise<unknown> | undefined {
  if (name !== 'read_interactive_program') return;
  return Promise.resolve().then(() => {
    const input = readInput.parse(raw), ref: ProgramSourceAddress = { messageId: input.messageId, programId: input.programId, revision: input.revision };
    let view: ReturnType<typeof readProgramView>;
    try { view = readProgramView(host, session, ref); }
    catch (error) { recordProgramReadFailure(host, session, ref, input.mode, error, signal); throw error; }
    const program = view.program;
    if (!program || !session.pack) throw new HarnessError('interactive_program_missing', '先接回原交互的实际地址。');
    const admission = admitProgramRead(host, session, ref, view, signal);
    const original = program.provenance as ProgramSourceProvenance;
    const needsData = program.bindingAliases.length > 0 && !program.currentData;
    const read = (arguments_: Record<string, unknown>) => ({ tool: 'read_interactive_program', arguments: { ...ref, ...arguments_ } });
    const sourcePoints = Array.from(program.sourceDsl), sourceLength = sourcePoints.length;
    const state = programStateForRead(session, ref, program), keys = Object.keys(program.states);
    const base = { ...ref, previous: { id: ref.programId, expectedRevision: ref.revision },
      libraryVersion: 2, status: needsData ? 'needs_refresh' : 'available',
      ...(needsData ? { bindingAliases: program.bindingAliases,
        bindingOrigins: original.bindings.map(binding => ({ alias: binding.alias, tool: binding.tool,
          priorDelivery: { observationId: binding.observationId, path: binding.path }, sourceId: binding.sourceId,
          fetchedAt: binding.fetchedAt, expiresAt: binding.expiresAt, status: binding.status, use: binding.use,
          ...(binding.origin ? { origin: binding.origin, parent: binding.parent } : {}),
          meaning: '旧投递的来源线索，不是本轮可复用observationId或可直接执行的read参数。historical_only仍只作为历史，不恢复已更正命题。' })),
        sourceNavigation: {
          notes: original.receipt.noteSources || [], materials: original.receipt.materialReads || [],
          scenes: original.receipt.sceneReferences || [],
          records: original.receipt.providedObjectVersions.filter(record => record.kind === 'domain'),
          meaning: '仅原回执实际留下且本轮仍合法的owner地址元数据；先沿原owner及当前用户请求重读，不从这些地址自动展开整个账号。未知查询参数没有补造。',
        } } : {}),
    };
    let section: Record<string, unknown>;
    if (input.mode === 'source') {
      const offset = input.offset || 0;
      if (offset > sourceLength) throw new HarnessError('interactive_source_range', '源码位置超出这个版本的实际长度。');
      if (input.find) {
        const needle = Array.from(input.find), limit = input.limit || 8, matches: { start: number; end: number }[] = [];
        let more = false;
        for (let cursor = offset; cursor <= sourceLength - needle.length; cursor++) {
          if (!needle.every((point, index) => sourcePoints[cursor + index] === point)) continue;
          if (matches.length === limit) { more = true; break; }
          matches.push({ start: cursor, end: cursor + needle.length });
        }
        const nextOffset = more ? matches[matches.length - 1].start + 1 : null;
        section = { mode: 'source', source: { scope: 'literal_positions_not_statements', find: input.find,
          unit: 'unicode_code_points', total: sourceLength, searchFrom: offset, matches,
          completeFromOffset: !more, sourceTextProvided: false },
          next: nextOffset === null ? null : read({ mode: 'source', find: input.find, offset: nextOffset, limit }) };
      } else {
        const limit = input.limit || 1600, start = input.full ? 0 : offset,
          end = input.full ? sourceLength : Math.min(sourceLength, start + limit);
        section = { mode: 'source', source: { text: sourcePoints.slice(start, end).join(''),
          coverage: { unit: 'unicode_code_points', start, end, total: sourceLength,
            wholeSourceProvided: start === 0 && end === sourceLength, statesProvided: false } },
          next: end === sourceLength ? null : read({ mode: 'source', offset: end, limit }) };
      }
    } else if (input.mode === 'states') {
      const selected = input.stateKeys ? [...new Set(input.stateKeys)] : keys;
      if (selected.some(key => !Object.hasOwn(program.states, key))) throw new HarnessError('interactive_state_keys', '字段名不在这个版本的真实states中，请沿overview的名称读取。');
      const offset = input.offset || 0, limit = input.limit || (input.stateKeys?.length || 4);
      if (offset > selected.length) throw new HarnessError('interactive_state_range', '字段位置超出这个版本的实际声明。');
      const page = selected.slice(offset, offset + limit), end = offset + page.length;
      section = { mode: 'states', stateOrigin: state.origin,
        states: Object.fromEntries(page.map(key => [key, program.states[key]])),
        values: Object.fromEntries(page.map(key => [key, state.inputs[key]])),
        coverage: { scope: input.stateKeys ? 'requested_state_keys' : 'state_declarations', offset, end,
          total: selected.length, allStateCount: keys.length, wholeStatesProvided: offset === 0 && end === keys.length && selected.length === keys.length },
        next: end === selected.length ? null : read({ mode: 'states', ...(input.stateKeys ? { stateKeys: input.stateKeys } : {}), offset: end, limit }) };
    } else {
      const states: Record<string, unknown> = {}, statePreviews: Record<string, unknown> = {}, values: Record<string, unknown> = {};
      let stateEnd = 0;
      for (const key of keys.slice(0, 8)) {
        const declaration = program.states[key], complete = Array.from(canonical(declaration)).length <= 320;
        const shape = complete ? declaration : { kind: declaration.kind, initial: previewValue(declaration.initial),
          coverage: 'declaration_preview_only_use_states_for_complete' };
        const value = previewValue(state.inputs[key]);
        stateEnd++;
        if (complete) states[key] = declaration; else statePreviews[key] = shape;
        values[key] = value;
      }
      let presentation: unknown, evaluationError: unknown;
      if (!needsData) {
        try {
          const evaluated = validateProgramStateAndEvaluate(program, state.inputs), nodeId = input.nodeId || evaluated.nodeIds[0];
          if (!evaluated.nodeIds.includes(nodeId)) throw new HarnessError('interactive_node_changed', '节点不在本次真实状态生成的画面中。');
          const target = locateNativeNode(evaluated.root, nodeId);
          if (!target) throw new HarnessError('interactive_node_changed', '当前求值没有这个实际节点。');
          const summary = boundedProgramPresentation(target, { offset: input.offset, limit: input.limit });
          presentation = { nodeId, scope: input.nodeId ? 'explicit_node' : 'whole_document', ...summary,
            next: summary.nextOffset === null ? null : read({ mode: 'overview', ...(input.nodeId ? { nodeId } : {}),
              offset: summary.nextOffset, limit: input.limit || 12 }) };
        } catch (error) {
          if (!(error instanceof HarnessError) || error.code !== 'interactive_program') throw error;
          evaluationError = { code: error.code, reason: error.message };
        }
      }
      section = { mode: 'overview', stateOrigin: state.origin, states, statePreviews, values,
        stateCoverage: { offset: 0, end: stateEnd, total: keys.length, wholeDeclarationsProvided: stateEnd === keys.length && !Object.keys(statePreviews).length },
        stateKeys: keys, ...(presentation ? { presentation } : {}), ...(evaluationError ? { evaluationError } : {}),
        source: { totalCodePoints: sourceLength, textProvided: false, read: read({ mode: 'source', offset: 0, limit: 1600 }) },
        readStates: read({ mode: 'states', offset: 0, limit: 4 }),
        coverage: { scope: 'bounded_readable_projection_and_state_previews', wholeSourceProvided: false,
          sourceBodiesProvided: false, ...(needsData ? { evaluation: 'not_performed_missing_current_data' } : {}) } };
    }
    const readReceiptId = randomUUID();
    const value = { ...base, ...section, readReceiptId,
      meaning: '只提供所标范围。概要不是完整DSL、点列或SourceSlot正文；initial不是用户当前状态，this_turn_admitted_ui_reference也只代表本次发回的局部条件，不是本人事实或执行。完整声明与源码按真实续读地址取，不把未提供部分当已读。' };
    const serialized = canonical(value), bytes = Buffer.byteLength(serialized), tokens = Math.ceil(Array.from(serialized).length / 1.4);
    const pack = session.pack;
    signal.throwIfAborted(); host.policy.validate(pack.contract.scope);
    recordProgramSources(pack, admission);
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    pack.receipt.interactiveProgramReads = [...(pack.receipt.interactiveProgramReads || []),
      programReadReceipt(ref, input.mode, section, needsData, readReceiptId, bytes, tokens)].slice(-6);
    host.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  });
}

/** Restore the formally admitted focus after native transcript compaction.
 * This is the Enter-time projection already admitted to this run, not another
 * UI observation, a source read, a summary, or a proof of tool-wire delivery. */
export function programContinuationAfterCompression(host: ProgramHost, session: RunSession) {
  const pack = session.pack, ref = session.programReference;
  if (!pack || !ref || session.background) return;
  const scope = host.policy.validate(pack.contract.scope);
  if (scope.audience !== 'self' || scope.child) return;
  const current = pack.data.currentInteractive as Record<string, unknown> | undefined;
  if (!current || current.messageId !== ref.messageId || current.programId !== ref.programId
    || current.revision !== ref.revision || current.nodeId !== ref.nodeId
    || !['focus_only', 'local_conditions', 'local_conditions_error'].includes(String(current.mode))) return;
  const source: ProgramSourceAddress = { messageId: ref.messageId, programId: ref.programId, revision: ref.revision };
  if (!pack.receipt.interactiveProgramSources?.some(value => value.messageId === source.messageId
    && value.programId === source.programId && value.revision === source.revision)
    || !programSourcesReadable(host, pack.contract.scope, [source], session)) return;
  host.policy.validate(pack.contract.scope); session.signal.throwIfAborted();
  const copy = (value: unknown) => value === undefined ? undefined : structuredClone(value);
  const read = (arguments_: Record<string, unknown>) => ({ tool: 'read_interactive_program', arguments: { ...source, ...arguments_ } });
  const inputs = copy(current.inputs), inputPreview = copy(current.inputPreview);
  const observations = copy(current.observations);
  const observationMetadataProvided = !Array.isArray(current.observations) || !current.observations.length || observations !== undefined;
  // The original projector never includes SourceSlot bodies or graph points.
  // Keep the actual observation dates/status/history identity beside derived
  // values, without replacing their delivery by an estimated size allowance.
  const presentation = copy(current.presentation);
  const methodPages: Record<string, unknown>[] = [];
  for (const observation of [...(session.observations || [])].reverse()) {
    if (observation.tool !== 'read_skill') continue;
    const result = observation.result as Record<string, any> | undefined;
    const requested = observation.requestedArguments as Record<string, unknown> | undefined;
    const section = result?.methodRead?.section;
    if (result?.id !== 'interactive-program' || result.status !== 'read' || result.guidanceOnly !== true
      || result.authority !== 'bundled_reviewed_guidance' || requested?.id !== 'interactive-program'
      || !['authoring', 'overview', 'grammar', 'components', 'functions', 'actions'].includes(section)) continue;
    const arguments_ = { id: 'interactive-program', section,
      ...(Array.isArray(requested.names) ? { names: structuredClone(requested.names) } : {}),
      ...(typeof requested.offset === 'number' ? { offset: requested.offset } : {}),
      ...(typeof requested.limit === 'number' ? { limit: requested.limit } : {}) };
    if (methodPages.some(page => canonical(page.read) === canonical({ tool: 'read_skill', arguments: arguments_ }))) continue;
    const instructions = typeof result.instructions === 'string' ? result.instructions : undefined;
    methodPages.push({ read: { tool: 'read_skill', arguments: arguments_ },
      coverage: structuredClone(result.methodRead.coverage),
      ...(instructions === undefined ? {} : { instructions }) });
  }
  return { kind: 'current_interactive_continuation', ...source,
    previous: { id: source.programId, expectedRevision: source.revision }, nodeId: ref.nodeId, mode: current.mode,
    stateOrigin: ref.inputs === undefined ? 'focus_only_no_current_inputs' : 'user_submit_snapshot_not_live_ui',
    ...(inputs !== undefined ? { inputs } : inputPreview !== undefined ? { inputPreview } : {}),
    inputCoverage: inputs !== undefined || inputPreview !== undefined ? structuredClone(current.inputCoverage)
      : { complete: false, valuesProvided: false },
    ...(presentation !== undefined ? { presentation } : {}),
    ...(observations !== undefined ? { observations } : {}),
    ...(current.mode === 'local_conditions_error' ? { evaluationError: copy(current.error) } : {}),
    coverage: { replayOfThisRunAdmittedProjection: true, presentationProvided: presentation !== undefined,
      observationMetadataProvided, sourceDslProvided: false, sourceBodiesProvided: false, geometryPointsProvided: false },
    read: read({ mode: 'overview' }), readFocused: read({ mode: 'overview', nodeId: ref.nodeId }),
    readStates: read({ mode: 'states', offset: 0, limit: 4 }),
    ...(methodPages.length ? { admittedMethodPages: methodPages } : {}),
    meaning: '这是本轮已正式准入、来源刚重核过的同一作品焦点。局部输入固定为用户本次提交那一帧；后台资料仍按原观察时刻、partial/stale与historical_only身份理解，没有观察后来的手势或重新查询资料，不是本人事实或执行授权。这里只恢复所列有限材料，未提供的源码、其他节点和SourceSlot正文仍须沿精确地址按需读取。方法页来自本轮原工具读取，不因这次重挂变成整册已读或原工具wire已成功投递。' };
}
