import { z } from 'zod';
import type { SceneRef, SceneSource } from './scenes';
import type { WorkSourceBinding, WorkSourceRef } from './harness';
import type { StudyCompanionView, StudyMode, StudyOrigin } from './study-companion';
import { explorableStudyValuesSchema, formatExplorableNumber, validateExplorableValues, type ExplorableStudyObservation, type ExplorableStudyValues } from './explorable-study';

const id = z.string().min(1).max(160);
export const studyFocusTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('problem') }).strict(),
  z.object({ kind: z.literal('attempt'), attemptId: id }).strict(),
  z.object({ kind: z.literal('help'), stepId: id }).strict(),
  z.object({ kind: z.literal('next'), stepId: id.optional() }).strict(),
]);
export type StudyFocusTarget = z.infer<typeof studyFocusTargetSchema>;
export const studyFocusRefSchema = z.object({ sceneId: id, sceneRevision: z.number().int().positive(),
  studyId: id, studyRevision: z.number().int().positive(), target: studyFocusTargetSchema }).strict();
export type StudyFocusRef = z.infer<typeof studyFocusRefSchema>;
export const studyInteractionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reference'), focus: studyFocusRefSchema }).strict(),
  z.object({ kind: z.literal('request'), focus: studyFocusRefSchema,
    actionId: z.enum(['try', 'hint', 'example', 'explain']) }).strict(),
  z.object({ kind: z.literal('attempt'), focus: studyFocusRefSchema, text: z.string().min(1).max(20000) }).strict(),
  z.object({ kind: z.literal('explore'), focus: studyFocusRefSchema,
    values: explorableStudyValuesSchema }).strict(),
]);
export type StudyInteraction = z.infer<typeof studyInteractionSchema>;
export const studyNativeInputSchema = z.object({ sessionId: id, studyId: id, studyRevision: z.number().int().positive(),
  messageId: id.optional(), focus: studyFocusTargetSchema.optional(),
  historyOffset: z.number().int().nonnegative().optional(), historyLimit: z.number().int().min(1).max(8).optional() }).strict();
export type StudyNativeInput = z.infer<typeof studyNativeInputSchema>;

/** One current teaching move, compiled from the real learning owner's read.
 * It is a presentation snapshot, never a new learning record or permission. */
export interface StudyScene extends SceneRef {
  kind: 'study';
  createdAt: string;
  source: SceneSource;
  owner: { kind: 'study_companion'; id: string; revision: number; matterId: string; sourceBinding: WorkSourceBinding };
  historyWindow: { offset: number; limit: number };
  heading: string;
  status: StudyCompanionView['status'];
  mode: StudyMode;
  focus: StudyFocusTarget;
  problem: { text: string; origin: StudyOrigin };
  learnerLines: StudyCompanionView['attempts'];
  learnerAttempt?: { id: string; text: string; origin: 'user_report'; source: WorkSourceRef; receivedAt: string };
  attemptChoices: { id: string; receivedAt: string }[];
  help?: StudyCompanionView['steps'][number];
  helpState: 'provided' | 'not_yet_provided_for_current_mode';
  nextMove: { text: string; origin: 'assistant_suggestion'; stepId?: string };
  stopPoint?: { text: string; at: string };
  closure?: { text: string; at: string };
  materialPage?: { resourceId: string; page: number; kind: 'original_material_page' };
  actions: { id: 'try' | 'hint' | 'example' | 'explain'; label: string; request: string; requestedMode: StudyMode; focus: StudyFocusRef }[];
  history: { attemptCount: number; teachingMoveCount: number; nextOffset: number | null;
    read: { tool: 'study_companion'; arguments: Record<string, unknown> } };
  refresh: { tool: 'study_companion'; arguments: { operation: 'read'; id: string } };
  bodyPolicy: 'async_current_owner_read_required';
  meaning: string;
}

/** Persisted/history/ordinary synchronous IPC fallback: deliberately no title,
 * question, attempt, answer, teaching checkpoint, or copied source text. */
export interface StudyHistoryReference extends SceneRef {
  kind: 'study_reference';
  createdAt: string;
  source: SceneSource;
  owner: { id: string; revision: number; matterId: string };
  label: '接着学习这一页';
  requiresAsyncRefresh: true;
  read: { tool: 'study_companion'; arguments: { operation: 'read'; id: string } };
}

export interface StudyResolvedFocus {
  ref: StudyFocusRef;
  matterId: string;
  text: string;
  origin: 'original_problem' | 'assistant_problem_description' | 'user_report' | 'assistant_generated' | 'assistant_suggestion';
  source?: WorkSourceRef;
  sourceBinding: WorkSourceBinding;
  exploration?: ExplorableStudyObservation;
  meaning: string;
}

/** Build normal conversation input. The host still resolves the exact scene
 * and ingests this new user input before any teaching artifact can be changed. */
export function studyFollowup(scene: StudyScene, actionId: StudyScene['actions'][number]['id']): {
  text: string; studyInteraction: StudyInteraction;
} {
  const action = scene.actions.find(value => value.id === actionId);
  if (!action) throw new Error('这一步的学习入口已变化，请重新打开当前陪学纸。');
  return { text: action.request, studyInteraction: { kind: 'request', focus: action.focus, actionId } };
}

/** Attach only the temporary condition the reader actually chose. The host
 * reopens this exact teaching step and recomputes before model adoption. */
export function studyExplorationFollowup(scene: StudyScene, values: ExplorableStudyValues) {
  if (!scene.help?.exploration) throw new Error('这一段解释已经变化，请从现在的图文重新选择条件。');
  const selected = validateExplorableValues(scene.help.exploration, values);
  const condition = [...scene.help.exploration.parameters.map(parameter => `${parameter.id}=${formatExplorableNumber(selected.parameters[parameter.id])}`),
    `x=${formatExplorableNumber(selected.x)}`].join('，');
  return { text: '', focusLabel: `试改 ${condition}`, studyInteraction: { kind: 'explore' as const,
    focus: { sceneId: scene.id, sceneRevision: scene.revision, studyId: scene.owner.id,
      studyRevision: scene.owner.revision, target: { kind: 'help' as const, stepId: scene.help.id } },
    values: selected } };
}

export function studyHistoryReference(scene: StudyScene): StudyHistoryReference {
  return { kind: 'study_reference', id: scene.id, revision: scene.revision, createdAt: scene.createdAt,
    source: { sourceId: 'work:self', fetchedAt: scene.source.fetchedAt, ...(scene.source.version ? { version: scene.source.version } : {}) },
    owner: { id: scene.owner.id, revision: scene.owner.revision, matterId: scene.owner.matterId },
    label: '接着学习这一页', requiresAsyncRefresh: true,
    read: { tool: 'study_companion', arguments: { operation: 'read', id: scene.owner.id } } };
}
