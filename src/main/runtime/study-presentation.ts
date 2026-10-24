import { z } from 'zod';
import { HarnessError, type ClockPort, type ScopeHandle, type WorkRecord } from '../../shared/harness';
import { studyFocusRefSchema, studyFocusTargetSchema, studyHistoryReference, studyInteractionSchema,
  type StudyFocusRef, type StudyFocusTarget, type StudyHistoryReference, type StudyInteraction,
  type StudyResolvedFocus, type StudyScene } from '../../shared/study-presentation';
import type { StudyCompanionView, StudyMode } from '../../shared/study-companion';
import type { StudyCompanionContext, StudyCompanionService } from './study-companion';
import { canonical, systemClock } from './semantics';
import { resolveExplorableStudy } from './explorable-study';

const id = z.string().min(1).max(160);
export const studyPresentationInput = z.object({ studyId: id, studyRevision: z.number().int().positive().optional(),
  focus: studyFocusTargetSchema.optional(), historyOffset: z.number().int().nonnegative().optional(),
  historyLimit: z.number().int().min(1).max(8).optional() }).strict();
type CurrentStudy = { record: WorkRecord; projection: StudyCompanionView };
const requestedModes: Record<StudyScene['actions'][number]['id'], StudyMode> = {
  try: 'small_hint', hint: 'small_hint', example: 'guided_step', explain: 'explain',
};

/** No scene cache or parallel lifecycle. Every body/focus/request is compiled
 * after the owner has completed its asynchronous material/source read. A sync
 * history endpoint receives only a read address, never a stale body admission. */
export class StudyPresentationService {
  constructor(readonly study: Pick<StudyCompanionService, 'get'>, readonly clock: ClockPort = systemClock) {}

  private async currentOwner(handle: ScopeHandle, studyId: string, context: StudyCompanionContext) {
    // One real owner/material read keeps all learner lines on the paper.
    // Earlier teaching answers are not merged into the current help.
    return this.study.get(handle, studyId, { ...context, allAttempts: true });
  }

  private focusRef(scene: Pick<StudyScene, 'id' | 'revision' | 'owner'>, target: StudyFocusTarget): StudyFocusRef {
    return { sceneId: scene.id, sceneRevision: scene.revision, studyId: scene.owner.id, studyRevision: scene.owner.revision, target };
  }

  private currentHelp(view: StudyCompanionView) {
    const help = view.currentStep;
    // Returning to discovery must not redisplay an earlier full explanation.
    // The main model generates a fresh requested move through the owner tool.
    return help && help.mode === view.mode
      && help.problemScope !== 'prior_problem' && help.problemScope !== 'unverified_legacy_problem'
      && (view.mode !== 'small_hint' || help.kind === 'question' || help.kind === 'hint')
      && (view.mode === 'explain' || help.kind !== 'explanation') ? help : undefined;
  }

  private target(view: StudyCompanionView, requested?: StudyFocusTarget) {
    const help = this.currentHelp(view);
    const target = requested || (help ? { kind: 'help' as const, stepId: help.id } : { kind: 'next' as const });
    if (target.kind === 'attempt' && !view.attempts.some(attempt => attempt.id === target.attemptId)
      || target.kind === 'help' && help?.id !== target.stepId
      || target.kind === 'next' && target.stepId !== undefined && help?.id !== target.stepId)
      throw new HarnessError('study_focus_changed', '这一处已不在当前学习画面里，请从现在的题目、尝试或提示重新选。');
    return target;
  }

  private build(value: CurrentStudy, options: { focus?: StudyFocusTarget; historyOffset?: number; historyLimit?: number },
    createdAt: string, fetchedAt: string): StudyScene {
    const view = value.projection, focus = this.target(view, options.focus), help = this.currentHelp(view);
    const attempt = focus.kind === 'attempt' ? view.attempts.find(value => value.id === focus.attemptId) : view.attempts[view.attempts.length - 1];
    const scene: StudyScene = { kind: 'study', id: 'study-scene:' + view.id, revision: view.revision, createdAt,
      source: { sourceId: 'work:self', fetchedAt, version: view.id + '@' + view.revision },
      owner: { kind: 'study_companion', id: view.id, revision: view.revision, matterId: view.matterId, sourceBinding: view.sourceBinding },
      historyWindow: { offset: options.historyOffset || 0, limit: options.historyLimit || 4 },
      heading: view.title, status: view.status, mode: view.mode, focus,
      problem: { text: view.problem.display, origin: view.problem.origin }, learnerLines: view.attempts,
      ...(view.bookmark ? { bookmark: view.bookmark } : {}),
      ...(attempt ? { learnerAttempt: attempt } : {}),
      attemptChoices: view.attempts.map(value => ({ id: value.id, receivedAt: value.receivedAt })),
      ...(help ? { help } : {}), helpState: help ? 'provided' : 'not_yet_provided_for_current_mode',
      nextMove: { text: help ? help.nextMove : view.currentStep && view.currentStep.mode !== view.mode
        ? '把你现在想到的一步写下来，我们从这里继续。' : view.nextStart,
        origin: 'assistant_suggestion', ...(help ? { stepId: help.id } : {}) },
      ...(view.stopPoint ? { stopPoint: view.stopPoint } : {}), ...(view.closure ? { closure: view.closure } : {}),
      ...(view.problem.origin.resourceId && view.problem.origin.page
        ? { materialPage: { resourceId: view.problem.origin.resourceId, page: view.problem.origin.page, kind: 'original_material_page' } } : {}),
      actions: [], history: { attemptCount: view.historyCoverage.attempts.total, teachingMoveCount: view.historyCoverage.steps.total,
        nextOffset: view.historyCoverage.nextOffset, read: { tool: 'study_companion',
          arguments: { operation: 'read', id: view.id, ...(view.historyCoverage.nextOffset !== null ? { historyOffset: view.historyCoverage.nextOffset } : {}) } } },
      refresh: { tool: 'study_companion', arguments: { operation: 'read', id: view.id } },
      bodyPolicy: 'async_current_owner_read_required',
      meaning: '这张纸把原题、你留下的尝试、一起讲过的内容和下一步放在同一处。点到哪一行，就能沿那一行接着聊；哪里想自己试、哪里想换个讲法，继续听你这次的意思。' };
    scene.actions = view.interaction.actions.flatMap(action => {
      if (!Object.hasOwn(requestedModes, action.id)) return [];
      const actionId = action.id as StudyScene['actions'][number]['id'];
      const target: StudyFocusTarget = help ? { kind: 'next', stepId: help.id } : { kind: 'next' };
      return [{ id: actionId, label: action.label, request: action.request, requestedMode: requestedModes[actionId], focus: this.focusRef(scene, target) }];
    });
    return scene;
  }

  async project(handle: ScopeHandle, raw: z.infer<typeof studyPresentationInput>, context: StudyCompanionContext = {}) {
    const input = studyPresentationInput.parse(raw), current = await this.currentOwner(handle, input.studyId,
      { ...context, historyOffset: input.historyOffset, historyLimit: input.historyLimit });
    if (!current || input.studyRevision !== undefined && current.record.revision !== input.studyRevision)
      throw new HarnessError('study_scene_unavailable', '这张学习纸现在不能完整展开，回到原题或原事项可以接着聊。');
    const now = this.clock.now(), scene = this.build(current, input, now, now);
    return { scene, records: [current.record], projection: current.projection };
  }

  /** Before a model, frontend body response, or selected excerpt is delivered,
   * call this async owner boundary. Do not substitute a timestamp or cached
   * successful call in a synchronous SceneService/history/IPC permission gate. */
  async assertCurrent(handle: ScopeHandle, scene: StudyScene, context: StudyCompanionContext = {}) {
    if (scene.kind !== 'study' || scene.bodyPolicy !== 'async_current_owner_read_required'
      || !Number.isFinite(Date.parse(scene.createdAt)) || !Number.isFinite(Date.parse(scene.source.fetchedAt)))
      throw new HarnessError('study_scene_invalid', '学习画面的引用不完整，请从当前学习纸重新打开。');
    const current = await this.currentOwner(handle, scene.owner.id, { ...context,
      historyOffset: scene.historyWindow.offset, historyLimit: scene.historyWindow.limit });
    if (!current || current.record.revision !== scene.owner.revision || current.projection.matterId !== scene.owner.matterId)
      throw new HarnessError('study_scene_changed', '原题、学习步骤或可用来源已经变化，请展开当前这张学习纸。');
    const expected = this.build(current, { focus: scene.focus, historyOffset: scene.historyWindow.offset,
      historyLimit: scene.historyWindow.limit }, scene.createdAt, scene.source.fetchedAt);
    if (canonical(expected) !== canonical(scene)) throw new HarnessError('study_scene_changed', '这张画面和现在的学习纸没对上，可以先重新打开当前原题和这一段帮助。');
    return current;
  }

  async resolveFocus(handle: ScopeHandle, scene: StudyScene, raw: StudyFocusRef, context: StudyCompanionContext = {}) {
    const selected = studyFocusRefSchema.parse(raw), current = await this.assertCurrent(handle, scene, context);
    if (selected.sceneId !== scene.id || selected.sceneRevision !== scene.revision
      || selected.studyId !== scene.owner.id || selected.studyRevision !== scene.owner.revision)
      throw new HarnessError('study_focus_changed', '所选的位置属于另一版学习画面，请重新选当前这一处。');
    const view = current.projection, target = this.target(view, selected.target), help = this.currentHelp(view);
    let text: string, origin: StudyResolvedFocus['origin'], source: StudyResolvedFocus['source'];
    if (target.kind === 'problem') {
      text = view.problem.display; origin = view.problem.origin.interpretation === 'assistant_page_description' ? 'assistant_problem_description' : 'original_problem';
    } else if (target.kind === 'attempt') {
      const attempt = view.attempts.find(value => value.id === target.attemptId)!;
      text = attempt.text; origin = 'user_report'; source = attempt.source;
    } else if (target.kind === 'help') { text = help!.text; origin = 'assistant_generated'; }
    else { text = scene.nextMove.text; origin = 'assistant_suggestion'; }
    const selection: StudyResolvedFocus = { ref: selected, matterId: view.matterId, text, origin,
      ...(source ? { source } : {}), sourceBinding: view.sourceBinding,
      ...(view.bookmark ? { bookmark: view.bookmark } : {}),
      meaning: '对方这次指到了同一道题里的这一处，可以从这里接着聊。原题、他自己写过的尝试和一起讲过的内容，都留着各自的来处。' };
    return { selection, records: [current.record], projection: current.projection };
  }

  /** Resolve an actual UI follow-up at the host request boundary before its
   * selection or teaching request is used. The normal ingress owns the real
   * new user message; this helper never writes a synthetic learner step. */
  async resolveInteraction(handle: ScopeHandle, scene: StudyScene, raw: StudyInteraction, context: StudyCompanionContext = {}) {
    const input = studyInteractionSchema.parse(raw), resolved = await this.resolveFocus(handle, scene, input.focus, context);
    if (input.kind === 'reference') return { ...resolved, intent: 'reference_only' as const };
    if (scene.status === 'closed') throw new HarnessError('study_closed', '这页已经收好；可以回读这一处，新的学习从新一页开始。');
    if (input.kind === 'explore') {
      if (input.focus.target.kind !== 'help') throw new HarnessError('study_exploration_changed', '所改条件需要对应当前这一段解释，请从这段图文重新选。');
      const exploration = resolveExplorableStudy(this.currentHelp(resolved.projection)?.exploration, input.values);
      return { ...resolved, selection: { ...resolved.selection, exploration }, intent: 'hypothetical_exploration' as const };
    }
    if (input.kind === 'attempt') {
      if (!input.text.trim()) throw new HarnessError('study_attempt_empty', '写下你现在想到的一步，就能从这里继续。');
      return { ...resolved, intent: 'learner_attempt' as const, text: input.text,
        meaning: '这是刚写下、准备带回对话的一步。等对方发出来，就能沿这段自己的尝试继续想，再一起看它站不站得住。' };
    }
    const action = scene.actions.find(value => value.id === input.actionId);
    if (!action) throw new HarnessError('study_action_changed', '这一步的学习入口已变化，请从当前画面继续。');
    return { ...resolved, intent: 'request_help' as const, text: action.request, requestedMode: action.requestedMode,
      meaning: '对方这次想换成这种讲法。把这个选择带回对话，就能从同一道题、当前这一步接着讲。' };
  }

  /** This is the only synchronous history/IPC fallback. It cannot authorize or
   * restore a stored StudyScene body, even if that snapshot was once valid. */
  historyReference(scene: StudyScene): StudyHistoryReference { return studyHistoryReference(scene); }
}
