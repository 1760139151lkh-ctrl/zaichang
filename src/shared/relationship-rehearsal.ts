import { z } from 'zod';
import { workSourceBindingSchema, workSourceRefSchema, type WorkSourceBinding } from './harness';

const id = z.string().min(1).max(160), revision = z.number().int().positive();
export const REHEARSAL_SOURCE_CONTEXT_MEANING = `sourceContext.kind=relationship_rehearsal说明这条话沿本人的试说或改表达界面而来。它帮助认出来源与活动，具体许可和每句话的真实归属仍有各自的依据。

想请你听清几种可能同时出现的声音：本人试着对别人说的台词、助手扮演的一种可能回应、对试说的评论，以及此刻真正向助手提出的退出或独立请求。纯台词里的第一人称、答应、记住、采用、发给和执行，都先属于这段试说；助手的模拟回应也保留可能性的身份。本人和对方的现实事实、记录许可、选择与行动托付，则沿真实原话分别理解。

一个人试说到一半，也可以认真提出新请求，整条话的归属仍由你结合语义判断。本人现实ADD有两份相互配合的依据：真实事实片段，以及精确的记录许可。界面引用和台词中的“记住”说明当时所指的内容，新的现实记录仍有它自己的来处。`;
export const rehearsalCitationSchema = workSourceRefSchema.safeExtend({ quote: z.string().min(1).max(4000) });
export type RehearsalCitation = z.infer<typeof rehearsalCitationSchema>;
const locator = workSourceRefSchema.safeExtend({ quoteSha256: z.string().regex(/^[a-f0-9]{64}$/) });
export type RehearsalLocator = z.infer<typeof locator>;
const supported = z.object({ text: z.string().min(1).max(1400), sources: z.array(rehearsalCitationSchema).min(1).max(8) }).strict();
const storedSupported = z.object({ text: z.string().min(1).max(1400), sources: z.array(locator).min(1).max(8) }).strict();
const premise = z.object({
  text: z.string().min(1).max(1200), origin: z.enum(['user_report_for_this_rehearsal', 'assistant_possibility']),
  sources: z.array(rehearsalCitationSchema).max(8),
}).strict().superRefine((value, context) => {
  if (value.origin === 'user_report_for_this_rehearsal' && !value.sources.length)
    context.addIssue({ code: 'custom', path: ['sources'], message: '本人对本次处境的说明须有实际原话；助手想到的可能性不冒充报告。' });
});
const storedPremise = z.object({ text: z.string().min(1).max(1200),
  origin: z.enum(['user_report_for_this_rehearsal', 'assistant_possibility']), sources: z.array(locator).max(8) }).strict();

export const rehearsalRefSchema = z.object({ id, revision, matterId: id, activeTurnId: id.nullable() }).strict();
export type RehearsalRef = z.infer<typeof rehearsalRefSchema>;
export const rehearsalInteractionSchema = z.object({
  kind: z.enum(['reference', 'utterance', 'alternative', 'collect', 'pause', 'resume']), ref: rehearsalRefSchema,
}).strict();
export type RehearsalInteraction = z.infer<typeof rehearsalInteractionSchema>;

const base = { id, expectedRevision: revision, matterId: id, source: rehearsalCitationSchema };
export const rehearsalWriteInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('begin'), matterId: id, expectedMatterRevision: revision, source: rehearsalCitationSchema,
    intention: supported.describe('本人真正想表达或守住的意思，保留原话依据；不是替他赢对话。'),
    boundaries: z.array(supported).max(6),
    counterpart: z.object({ label: z.string().min(1).max(80), premise }).strict(),
    opening: z.string().min(1).max(2000).optional().describe('对方一种可能的开场，始终是助手试演，不冒充此人真的说过。可省略，让本人先试一句。'),
  }).strict(),
  z.object({ operation: z.literal('respond'), ...base,
    userLine: rehearsalCitationSchema.describe('本轮本人确实试说的连续原句；不是助手替本人编一条台词。'),
    response: z.string().min(1).max(2500).describe('主助手试演对方的一种可能回应；不推断对方一定这样想，不增加真实关系事实。可以不顺利、不认同或停在难接处，不必把回应演成快速接受边界的结局。'),
    aside: z.string().max(800).optional().describe('确有必要时以原助手身份接住意思；不要每轮评分、点评或布置练习。'),
  }).strict(),
  z.object({ operation: z.literal('alternative'), ...base, targetTurnId: id,
    premise: premise.optional(), response: z.string().min(1).max(2500),
    aside: z.string().max(800).optional(),
  }).strict(),
  z.object({ operation: z.literal('adjust'), ...base,
    intention: supported.optional(), boundaries: z.array(supported).max(6).optional(), premise: premise.optional(),
    aside: z.string().max(800).optional(),
  }).strict(),
  z.object({ operation: z.literal('collect'), ...base,
    expression: z.string().min(1).max(6000).describe('现在愿意拿来考虑的一段表达，只是助手草稿；不代本人答应、发送或声称已经谈妥。可以未演满一轮就整理。'),
    fromTurnIds: z.array(id).max(24).optional().describe('实际参考的本次台词或可能回应ID，仅供来由定位；不把对方试演当成真实来信。'),
  }).strict(),
  z.object({ operation: z.enum(['pause', 'resume', 'close']), ...base }).strict(),
]);
export type RehearsalWriteInput = z.infer<typeof rehearsalWriteInput>;
export const rehearsalReadInput = z.object({ id, expectedRevision: revision.optional(),
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(24).optional(),
}).strict();

const userTurn = z.object({ id, parentId: id.nullable(), actor: z.literal('you'), origin: z.literal('user_practice_not_actual_exchange'),
  source: locator, controlSource: locator, createdAt: z.string(), basedOnRevision: revision }).strict();
const otherTurn = z.object({ id, parentId: id.nullable(), actor: z.literal('possible_other'), origin: z.literal('assistant_simulation'),
  text: z.string().min(1).max(2500), requestedBy: locator, alternativeOf: id.nullable(), createdAt: z.string(), basedOnRevision: revision }).strict();
export const rehearsalStoredTurnSchema = z.discriminatedUnion('actor', [userTurn, otherTurn]);
export const rehearsalDataSchema = z.object({
  type: z.literal('relationship_rehearsal'), version: z.literal(1), matterId: id,
  state: z.enum(['active', 'held', 'closed']), sessionId: id, sessionIds: z.array(id).min(1).max(128),
  startedBy: locator, lastControl: locator,
  intention: storedSupported, boundaries: z.array(storedSupported).max(6),
  counterpart: z.object({ label: z.string().min(1).max(80), premise: storedPremise }).strict(),
  turns: z.array(rehearsalStoredTurnSchema).max(128), activeTurnId: id.nullable(),
  lastAside: z.object({ text: z.string().max(800), requestedBy: locator, at: z.string() }).strict().nullable(),
  expression: z.object({ optionId: id, revision, requestedBy: locator,
    fromTurnIds: z.array(id).max(24), origin: z.literal('assistant_draft_not_sent'), at: z.string() }).strict().nullable(),
  operations: z.array(z.object({ key: z.string(), operation: z.string(), source: locator, at: z.string() }).strict()).max(128),
  lifecycleControl: z.object({ operation: z.enum(['pause', 'close']), source: locator, at: z.string() }).strict().optional(),
  sourceIds: z.array(id).max(32), createdAt: z.string(), updatedAt: z.string(),
}).strict();
export type RehearsalData = z.infer<typeof rehearsalDataSchema>;
export type RehearsalStoredTurn = z.infer<typeof rehearsalStoredTurnSchema>;

export interface RehearsalView {
  id: string; revision: number; matterId: string; state: RehearsalData['state'];
  ref: RehearsalRef; intention: string; boundaries: string[];
  counterpart: { label: string; premise: string; premiseOrigin: RehearsalData['counterpart']['premise']['origin'] };
  turns: { id: string; actor: 'you' | 'possible_other'; text: string;
    origin: 'user_practice_not_actual_exchange' | 'assistant_simulation'; alternativeCount: number }[];
  aside: string | null;
  expression: { optionId: string; revision: number; text: string; origin: 'assistant_draft_not_sent' } | null;
  coverage: { offset: number; total: number; nextOffset: number | null };
  sourceBinding: WorkSourceBinding;
  updatedAt: string;
  meaning: string;
}
export const rehearsalViewSchema = z.object({
  id, revision, matterId: id, state: z.enum(['active', 'held', 'closed']), ref: rehearsalRefSchema,
  intention: z.string().min(1).max(1400), boundaries: z.array(z.string().min(1).max(1400)).max(6),
  counterpart: z.object({ label: z.string().min(1).max(80), premise: z.string().min(1).max(1200),
    premiseOrigin: z.enum(['user_report_for_this_rehearsal', 'assistant_possibility']) }).strict(),
  turns: z.array(z.object({ id, actor: z.enum(['you', 'possible_other']), text: z.string().min(1).max(4000),
    origin: z.enum(['user_practice_not_actual_exchange', 'assistant_simulation']), alternativeCount: z.number().int().nonnegative() }).strict()).max(24),
  aside: z.string().max(800).nullable(), expression: z.object({ optionId: id, revision, text: z.string().min(1).max(6000),
    origin: z.literal('assistant_draft_not_sent') }).strict().nullable(),
  coverage: z.object({ offset: z.number().int().nonnegative(), total: z.number().int().nonnegative(), nextOffset: z.number().int().nonnegative().nullable() }).strict(),
  sourceBinding: workSourceBindingSchema, updatedAt: z.string(), meaning: z.string().max(1600),
}).strict().superRefine((view, context) => {
  if (view.id !== view.ref.id || view.revision !== view.ref.revision || view.matterId !== view.ref.matterId)
    context.addIssue({ code: 'custom', path: ['ref'], message: '试演引用须属于同一当前对象。' });
  if (view.turns.some(turn => turn.actor === 'you' ? turn.origin !== 'user_practice_not_actual_exchange' : turn.origin !== 'assistant_simulation'))
    context.addIssue({ code: 'custom', path: ['turns'], message: '本人试说与对方一种可能回应不能混成真实交流。' });
});
export const rehearsalPresentationInput = z.object({ id, expectedRevision: revision }).strict();
export const rehearsalNativeInput = z.object({ sessionId: id, messageId: id, id, sceneRevision: revision }).strict();
export type RehearsalNativeInput = z.infer<typeof rehearsalNativeInput>;
export interface RehearsalNativeBridge { rehearsalProject(input: RehearsalNativeInput): Promise<RehearsalScene> }

/** This is one bounded message projection of the original Work artifact. */
export const rehearsalSceneRefSchema = z.object({ id, revision, matterId: id, sourceBinding: workSourceBindingSchema }).strict();
export interface RehearsalScene extends RehearsalView {
  kind: 'rehearsal'; sessionId: string; createdAt: string; sourceBoundary: string; source: import('./scenes').SceneSource;
}
export interface RehearsalHistoryReference {
  kind: 'rehearsal_reference'; id: string; revision: number; sessionId: string; createdAt: string; source: import('./scenes').SceneSource;
  owner: { id: string; revision: number; matterId: string }; label: '接着那段试说'; requiresCurrentRead: true;
  read: { tool: 'read_relationship_rehearsal'; arguments: { id: string } };
}
export function rehearsalHistoryReference(scene: RehearsalScene): RehearsalHistoryReference {
  return { kind: 'rehearsal_reference', id: scene.id, revision: scene.revision, sessionId: scene.sessionId, createdAt: scene.createdAt,
    source: { sourceId: 'work:self', fetchedAt: scene.source.fetchedAt, ...(scene.source.version ? { version: scene.source.version } : {}) },
    owner: { id: scene.ref.id, revision: scene.ref.revision, matterId: scene.ref.matterId }, label: '接着那段试说', requiresCurrentRead: true,
    read: { tool: 'read_relationship_rehearsal', arguments: { id: scene.ref.id } } };
}

export function rehearsalFollowup(view: RehearsalView, kind: RehearsalInteraction['kind']) {
  const text = kind === 'alternative' ? '换一种可能的回应，让我再试试。'
    : kind === 'collect' ? '先不继续演了，帮我把现在想说的意思整理成一句能用的话。'
      : kind === 'pause' ? '先停在这里。' : kind === 'resume' ? '我们接着刚才这一段试一试。' : '';
  return { text, rehearsalInteraction: { kind, ref: view.ref } satisfies RehearsalInteraction };
}
