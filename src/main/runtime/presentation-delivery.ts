import type { ElementNode } from '@openuidev/lang-core';
import type { PresentationView, SceneSnapshot } from '../../shared/scenes';
import { getInteractiveProgramSpec } from '../../shared/interactive-library';
import { validateProgramStateAndEvaluate } from './interactive-program-compiler';

type DeliveredPart = Record<string, unknown>;
export interface ProgramReadablePresentation {
  parts: DeliveredPart[];
  coverage: { scope: 'evaluated_native_node_outline'; offset: number; end: number; total: number;
    completeForProjection: boolean; sourceDslProvided: false; sourceBodiesProvided: false; geometryPointsProvided: false };
  gaps: string[];
  nextOffset: number | null;
}

/** The same real native tree, projected for conversation rather than copied
 * back as a second UI payload. SourceSlot never opens its owner's body. */
export function boundedProgramPresentation(value: unknown,
  options: { offset?: number; limit?: number } = {}): ProgramReadablePresentation {
  const requestedOffset = options.offset || 0, limit = options.limit || 12;
  const nodes: ElementNode[] = [];
  const walk = (item: unknown) => {
    if (Array.isArray(item)) { item.forEach(walk); return; }
    if (!item || typeof item !== 'object' || (item as ElementNode).type !== 'element') return;
    const node = item as ElementNode; nodes.push(node); walk(node.props.children);
  };
  walk(value);
  const offset = Math.min(requestedOffset, nodes.length);
  const parts: DeliveredPart[] = [], gaps = new Set<string>();
  let end = offset;
  for (const node of nodes.slice(offset, offset + limit)) {
    const props = node.props, part: DeliveredPart = { nodeId: props.id, component: node.typeName };
    for (const key of ['title', 'label', 'field', 'direction', 'columns', 'presentation', 'xLabel', 'yLabel'])
      if (typeof props[key] === 'string' || typeof props[key] === 'number') part[key] = props[key];
    if (node.typeName === 'Text' || node.typeName === 'Formula') {
      const key = node.typeName === 'Text' ? 'value' : 'tex', raw = props[key];
      if (typeof raw === 'string' || raw === null || typeof raw === 'number' || typeof raw === 'boolean') part[key] = raw;
    } else if (node.typeName === 'SourceSlot') {
      part.ref = props.ref; part.body = 'not_read_by_this_projection'; gaps.add('source_slot_body_not_provided');
    } else if (node.typeName === 'Graphic') {
      part.domain = props.domain; part.axes = props.axes;
    } else if (Array.isArray(props.points)) {
      part.pointCount = props.points.length;
      part.gapCount = props.points.filter(point => point === null || typeof point === 'object' && point
        && ((point as { x?: unknown }).x === null || (point as { y?: unknown }).y === null)).length;
      gaps.add('geometry_points_not_provided');
    } else if (node.typeName === 'Motion') {
      part.durationMs = props.durationMs; part.iterations = props.iterations;
      part.playback = 'configuration_not_browser_completion';
    }
    parts.push(part); end++;
  }
  const nextOffset = end < nodes.length ? end : null;
  if (nextOffset !== null) gaps.add('remaining_native_nodes_not_provided');
  return { parts, coverage: { scope: 'evaluated_native_node_outline', offset, end, total: nodes.length,
    completeForProjection: offset === 0 && nextOffset === null, sourceDslProvided: false, sourceBodiesProvided: false, geometryPointsProvided: false },
    gaps: [...gaps], nextOffset };
}
type Delivery = {
  view: { id: string; revision: number; libraryVersion: number };
  sceneRefs: { id: string; revision: number }[];
  parts: DeliveredPart[];
  contentCoverage: 'complete' | 'partial' | 'references_only';
  gaps: string[];
  contentScope: 'assistant_help_and_program_initial_projection';
};

function programParts(value: unknown, add: (part: DeliveredPart) => void) {
  const spec = getInteractiveProgramSpec();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object' || (value as ElementNode).type !== 'element') return;
    const node = value as ElementNode, props = node.props;
    const metadata = spec.components[node.typeName];
    const identity = { nodeId: props.id, component: node.typeName };
    if (node.typeName === 'Text') add({ ...identity, value: props.value });
    else if (node.typeName === 'Formula') add({ ...identity, tex: props.tex });
    else if (metadata?.kind === 'graphic') {
      add({ ...identity, geometry: Object.fromEntries(Object.entries(props).filter(([key]) => key !== 'children')) });
    } else if (metadata?.kind === 'motion') {
      add({ ...identity, motion: { when: props.when, frames: props.frames, durationMs: props.durationMs,
        iterations: props.iterations, easing: props.easing }, meaning: '已发布的有限动效配置，不是浏览器播放完成回执。' });
    } else if (typeof props.label === 'string' || typeof props.title === 'string') {
      add({ ...identity, ...(typeof props.title === 'string' ? { title: props.title } : {}),
        ...(typeof props.label === 'string' ? { label: props.label } : {}),
        ...(metadata?.stateKind ? { field: props.field, stateKind: metadata.stateKind } : {}),
        ...(node.typeName === 'Graphic' ? { domain: props.domain } : {}) });
    }
    visit(props.children);
  };
  visit(value);
}

/** Reuse the actual admitted input/node projection, without carrying native
 * action plans, an entire subtree or read-only source data into the review. */
export function interactiveContextForReview(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const current = value as Record<string, unknown>;
  const parts: DeliveredPart[] = [];
  if (current.presentation) return { messageId: current.messageId, programId: current.programId, revision: current.revision,
    nodeId: current.nodeId, kind: current.kind, mode: current.mode,
    ...(current.inputs !== undefined ? { inputs: structuredClone(current.inputs) } : {}),
    ...(current.inputPreview !== undefined ? { inputPreview: structuredClone(current.inputPreview) } : {}),
    ...(current.inputCoverage !== undefined ? { inputCoverage: structuredClone(current.inputCoverage) } : {}),
    presentation: structuredClone(current.presentation), observations: structuredClone(current.observations), meaning: current.meaning };
  if (current.mode === 'local_conditions') programParts(current.target, part => { parts.push(part); });
  return { messageId: current.messageId, programId: current.programId, revision: current.revision,
    nodeId: current.nodeId, kind: current.kind, mode: current.mode,
    ...(current.inputs !== undefined ? { inputs: structuredClone(current.inputs) } : {}),
    ...(current.inputPreview !== undefined ? { inputPreview: structuredClone(current.inputPreview) } : {}),
    ...(current.inputCoverage !== undefined ? { inputCoverage: structuredClone(current.inputCoverage) } : {}),
    ...(current.mode === 'local_conditions' ? { target: { parts, contentCoverage: 'complete' } } : {}),
    ...(current.mode === 'local_conditions_error' ? { error: structuredClone(current.error) } : {}),
    meaning: current.meaning };
}

/** This is one reply's transient publication evidence, never a source owner,
 * stored body cache or a completion verdict. Only the successful publication
 * callback may add it; model-boundary source checks still run before review. */
export class PresentationDeliveries {
  private readonly current = new Map<string, Delivery>();

  record(scenes: readonly SceneSnapshot[], view: PresentationView, activeViews: readonly PresentationView[]) {
    const active = new Set(activeViews.map(value => value.id));
    for (const id of this.current.keys()) if (!active.has(id)) this.current.delete(id);
    const delivery: Delivery = { view: { id: view.id, revision: view.revision, libraryVersion: view.libraryVersion },
      sceneRefs: view.sceneRefs.map(({ id, revision }) => ({ id, revision })), parts: [],
      contentCoverage: 'references_only', gaps: [], contentScope: 'assistant_help_and_program_initial_projection' };
    const add = (part: DeliveredPart) => { delivery.parts.push(part); };
    for (const scene of scenes) {
      if (!view.sceneRefs.some(ref => ref.id === scene.id && ref.revision === scene.revision)) continue;
      // This text was authored by the same assistant and actually published
      // on the paper. Question/material/learner bodies are not re-read here.
      // Retained line addresses establish visibility, not correctness/mastery.
      if (scene.kind === 'study') {
        add({ kind: 'teaching_on_paper', sceneRef: { id: scene.id, revision: scene.revision },
          owner: { id: scene.owner.id, revision: scene.owner.revision }, mode: scene.mode,
          helpState: scene.helpState,
          ...(scene.help ? { help: { id: scene.help.id, origin: scene.help.origin,
            ...(scene.help.title ? { title: scene.help.title } : {}), text: scene.help.text } } : {}) });
        add({ kind: 'retained_learner_line_addresses', sceneRef: { id: scene.id, revision: scene.revision },
          lines: scene.learnerLines.map(line => ({ id: line.id, origin: line.origin, source: line.source })) });
      }
      // In particular, native campus rows may be host-held UI-only data.
      // Other native source bodies remain in their actual tool observations;
      // a SceneRef alone neither supplies those bodies nor proves completion.
    }
    if (view.program) {
      try {
        const evaluated = validateProgramStateAndEvaluate(view.program, view.program.initialState);
        add({ kind: 'interactive_initial_state', inputs: evaluated.inputs,
          meaning: '本次真正发布的初始局部状态；不是用户后来未传回的手势、本人事实或业务执行结果。' });
        programParts(evaluated.root, add);
      } catch {
        // Publication remains real if the optional review projection cannot
        // be recovered. Never replace missing bindings with empty data or
        // claim a readable document merely from an opaque program address.
        delivery.gaps.push('published_program_content_not_available_for_review');
      }
    }
    if (delivery.parts.length) delivery.contentCoverage = delivery.gaps.length ? 'partial' : 'complete';
    this.current.delete(view.id);
    this.current.set(view.id, delivery);
  }

  forReview() {
    const items = [...this.current.values()].reverse().map(delivery => structuredClone(delivery));
    return { items,
      meaning: '仅本轮及其接续中已成功发布、当前仍保留的内容。原样文字与实际初态可用于核对回答；引用、空卡片或partial不证明内容完整，发布也不表示正确、已读、采用、掌握或业务成功。其余依据仍看实际工具观察；不能因这里没有转送某个来源正文就断言那张画面未交付。' };
  }
}
