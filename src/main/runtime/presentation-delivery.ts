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
      part.releaseBehavior = props.releaseBehavior;
      part.playback = 'configuration_not_browser_completion';
    } else if (node.typeName === 'Voice') {
      part.sound = { gateField: props.gateField, frequency: props.frequency, settings: props.settings ?? null,
        sustainField: props.sustainField, triggerField: props.triggerField,
        ...(props.trigger === undefined ? {} : { trigger: props.trigger }) };
      part.playback = 'configuration_not_browser_output';
    } else if (node.typeName === 'Press') {
      part.press = { field: props.field, strength: props.strength, pressureField: props.pressureField,
        triggerField: props.triggerField, hotkey: props.hotkey };
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
    else if (node.typeName === 'SourceSlot') add({ ...identity, ref: props.ref,
      body: 'native_owner_read_required' });
    else if (node.typeName === 'Voice') {
      add({ ...identity, sound: { gateField: props.gateField, frequency: props.frequency, settings: props.settings ?? null,
        sustainField: props.sustainField, triggerField: props.triggerField,
        ...(props.trigger === undefined ? {} : { trigger: props.trigger }) },
      meaning: '这是这次作品的初始声音设置。没有单独的trigger时，发声时机由gate从关闭变为开启来决定，声音的起落和延续仍按这份设置运行。这些设置本身没有记录声音是否已开启、是否真的响过，设备上的听感也要以实际播放为准。' });
    } else if (node.typeName === 'Press') {
      add({ ...identity, label: props.label, press: { field: props.field, strength: props.strength,
        pressureField: props.pressureField, triggerField: props.triggerField, hotkey: props.hotkey },
      meaning: '这是作品里的按住控件，以及它连接的局部字段。这里说明可以怎样操作，没有记录本人已经按过，也不表示本人答应了任何实际动作。' });
    } else if (metadata?.kind === 'graphic') {
      add({ ...identity, geometry: Object.fromEntries(Object.entries(props).filter(([key]) => key !== 'children')) });
    } else if (metadata?.kind === 'motion') {
      add({ ...identity, motion: { when: props.when, frames: props.frames, durationMs: props.durationMs,
        iterations: props.iterations, easing: props.easing, releaseBehavior: props.releaseBehavior }, meaning: '这是作品中这段动画的播放设置；浏览器是否已经播放完，还要看实际播放状态。' });
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
    const placedSceneRefs = new Set<string>();
    let initialProgram: ReturnType<typeof validateProgramStateAndEvaluate> | undefined;
    const initialParts: DeliveredPart[] = [];
    if (view.libraryVersion === 2) {
      try {
        if (!view.program) throw new Error('Initial program not provided');
        initialProgram = validateProgramStateAndEvaluate(view.program, view.program.initialState);
        programParts(initialProgram.root, part => {
          initialParts.push(part);
          if (part.component === 'SourceSlot' && typeof part.ref === 'string') placedSceneRefs.add(part.ref);
        });
      } catch {
        initialProgram = undefined; initialParts.length = 0; placedSceneRefs.clear();
        delivery.gaps.push('published_program_content_not_available_for_review');
      }
    } else for (const ref of view.sceneRefs) placedSceneRefs.add(`${ref.id}@${ref.revision}`);
    for (const scene of scenes) {
      if (!view.sceneRefs.some(ref => ref.id === scene.id && ref.revision === scene.revision)) continue;
      // A program's sceneRefs are an upper bound. Only an actually placed
      // SourceSlot in its evaluated initial tree publishes a native surface.
      if (!placedSceneRefs.has(`${scene.id}@${scene.revision}`)) continue;
      // This text was authored by the same assistant and published to the
      // native paper. Its disclosure contract is separate from its availability.
      // Question/material/learner bodies are not re-read here.
      // Retained line addresses establish visibility, not correctness/mastery.
      if (scene.kind === 'study') {
        const foldedHint = !!scene.help && scene.mode === 'small_hint';
        add({ kind: 'native_study_surface', sceneRef: { id: scene.id, revision: scene.revision },
          owner: { id: scene.owner.id, revision: scene.owner.revision },
          componentContract: { layout: 'original_question_and_learner_work_on_two_papers',
            divider: 'pointer_and_keyboard_resizable_without_copying_the_problem',
            writing: 'same_live_conversation_composer_at_the_work_paper',
            ...(foldedHint ? { hint: { initialDisclosure: 'folded_until_person_opens',
              choices: ['open', 'smaller_hint', 'keep_for_later', 'put_down'],
              restoredLocalChoice: 'same_problem_and_help_address_only',
              browserExposure: 'not_observed_by_publication' } } : {}) },
          meaning: '这次发表的是原生陪学组件，原题、本人尝试和提示由同一owner回读；两张纸、可调分隔线与原输入槽是组件已有行为。这里说明实际发表了哪种界面及其行为合同，未观察浏览器后来的手势、收好或接过，也不证明对方已经看过或掌握。' });
        add({ kind: 'teaching_on_paper', sceneRef: { id: scene.id, revision: scene.revision },
          owner: { id: scene.owner.id, revision: scene.owner.revision }, mode: scene.mode,
          helpState: scene.helpState,
          disclosure: !scene.help ? 'not_provided'
            : foldedHint ? 'available_in_folded_note_not_automatically_revealed' : 'expanded_on_paper',
          ...(scene.help ? { help: { id: scene.help.id, origin: scene.help.origin,
            ...(scene.help.title ? { title: scene.help.title } : {}), text: scene.help.text } } : {}) });
        add({ kind: 'retained_learner_line_addresses', sceneRef: { id: scene.id, revision: scene.revision },
          lines: scene.learnerLines.map(line => ({ id: line.id, origin: line.origin, source: line.source })) });
      }
      // In particular, native campus rows may be host-held UI-only data.
      // Other native source bodies remain in their actual tool observations;
      // a SceneRef alone neither supplies those bodies nor proves completion.
    }
    if (initialProgram) {
      add({ kind: 'interactive_initial_state', inputs: initialProgram.inputs,
        meaning: '这是这次作品实际发表时的起始状态。本人之后若又拖动或按下，要以随后真正传回的交互为准；控件初值也不能当成本人的实际情况或事情已经办成。' });
      initialParts.forEach(add);
    }
    if (delivery.parts.length) delivery.contentCoverage = delivery.gaps.length ? 'partial' : 'complete';
    this.current.delete(view.id);
    this.current.set(view.id, delivery);
  }

  forReview() {
    const items = [...this.current.values()].reverse().map(delivery => structuredClone(delivery));
    return { items,
      meaning: '这里收的是本轮及接续中确实已发表、目前仍保留在这条回复里的内容，可以用原样文字和真正的起始状态核对回答。只给地址、空卡片或标为partial的片段时，还不能据此说完整正文都在这里。发表过也不说明内容正确、对方已经看过、看懂、选定或掌握，更不说明实际事情已办成。其他事实仍看相应工具真正读到的结果；某份来源正文没有在这里再列一遍，也不表示那张画面没有交给对方。' };
  }
}
