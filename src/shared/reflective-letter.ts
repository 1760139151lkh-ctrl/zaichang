import { z } from 'zod';
import { evidenceSchema, workSourceBindingSchema, workSourceRefSchema, type EvidenceEvent, type WorkSourceBinding, type WorkSourceRef } from './harness';
import { noteSourceProofSchema, type NoteSourceProof } from './notes-source';

const id = z.string().min(1).max(160);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const original = workSourceRefSchema.safeExtend({ quote: z.string().min(1).max(4000) });

/** A review window describes conversations received during the period. The
 * time of an experience still comes from what its original source says. */
export const reflectiveLetterWindowSchema = z.object({
  from: z.string().datetime({ offset: true }),
  before: z.string().datetime({ offset: true }),
  timeZone: z.string().min(1).max(80),
}).strict().superRefine((window, context) => {
  if (Date.parse(window.from) >= Date.parse(window.before))
    context.addIssue({ code: 'custom', path: ['before'], message: '回顾终点须晚于起点。' });
  try { new Intl.DateTimeFormat('en', { timeZone: window.timeZone }).format(); }
  catch { context.addIssue({ code: 'custom', path: ['timeZone'], message: '需要有效的声明时区。' }); }
});
export type ReflectiveLetterWindow = z.infer<typeof reflectiveLetterWindowSchema>;
export const reflectiveLetterSourceInput = z.object({
  opportunityId: id, expectedRevision: z.number().int().positive(),
  paragraphIndex: z.number().int().min(0).max(11), sourceIndex: z.number().int().min(0).max(7),
}).strict();
export type ReflectiveLetterSourceInput = z.infer<typeof reflectiveLetterSourceInput>;
const letterExcerptReferenceSchema = z.object({
  opportunityId: id, revision: z.number().int().positive(), paragraphIndex: z.number().int().min(0).max(11),
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
}).strict().refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start, '来信选句范围无效');
export const letterReferenceSchema = z.union([
  letterExcerptReferenceSchema,
  z.object({ opportunityId: id, revision: z.number().int().positive(), scope: z.literal('whole') }).strict(),
]);
export type LetterReference = z.infer<typeof letterReferenceSchema>;
export interface LetterFocusContext { letterReference: LetterReference; focusLabel: string }
export const reflectiveLetterProjectInput = z.object({
  sessionId: id, messageId: id,
  ref: z.object({ id, revision: z.number().int().positive(), helpRecordId: id }).strict(),
}).strict();
export type ReflectiveLetterProjectInput = z.infer<typeof reflectiveLetterProjectInput>;
export interface ReflectiveLetterSourceView {
  heading: string;
  excerpts: { label: string; text: string; receivedAt?: string }[];
}

export const reflectiveLetterRequestInput = z.object({
  operation: z.literal('begin'),
  source: original.optional().describe('与currentQuote二选一：本轮本人请求这次回顾的精确原话地址；不是旧经历或周期许可。'),
  currentQuote: z.string().min(1).max(4000).optional().describe('与source二选一：逐字复制本轮本人请求写信的原句。宿主只在本轮已交付且已授权的本人原话范围中精确唯一定位，不修剪、不近似匹配，不扩大授权。'),
  window: reflectiveLetterWindowSchema,
}).strict().superRefine((input, context) => {
  if ((input.source === undefined) === (input.currentQuote === undefined))
    context.addIssue({ code: 'custom', path: ['currentQuote'], message: 'source与currentQuote须且只能提供一个；currentQuote逐字引用本轮写信请求，不填旧经历。' });
});
export const reflectiveLetterMandateInput = z.object({
  operation: z.literal('begin_for_opportunity'), opportunityId: id,
  expectedRevision: z.number().int().positive(), window: reflectiveLetterWindowSchema,
}).strict().describe('仅当已读机会的有效本人托付确实包含这种回顾时使用；选择来信形式不扩大原托付、来源、期限或渠道。');

export const reflectiveLetterCitationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('original'), ...original.shape }).strict(),
  noteSourceProofSchema.safeExtend({
    kind: z.literal('note'), observationId: id, quote: z.string().min(1).max(4000),
  }).refine(value => value.end > value.start, '笔记正文引用需要非空范围')
    .describe('本轮manage_note.read实际交付的笔记正文：observationId沿该次工具调用，id/revision/sha256沿原页，start/end为正文绝对Unicode位置。笔记保存时间与文中经历发生时间分别理解，笔记记述也不等于外部核实。'),
  z.object({
    kind: z.literal('material'), observationId: id,
    resourceId: id, sha256: digest, version: z.number().int().positive(),
    sourceEventId: id, contentVersion: z.number().int().positive(), parentEventId: id,
    page: z.number().int().positive().optional(),
    start: z.number().int().nonnegative(), end: z.number().int().positive(),
    quote: z.string().min(1).max(4000),
  }).strict().refine(value => value.end > value.start, '资料文字范围无效'),
  z.object({
    kind: z.literal('learning'), id, revision: z.number().int().positive(),
    originals: z.array(original).min(1).max(8),
  }).strict(),
]);
export type ReflectiveLetterCitation = z.infer<typeof reflectiveLetterCitationSchema>;

export const reflectiveLetterParagraphSchema = z.object({
  kind: z.enum(['memory', 'reflection', 'wish', 'care']).describe('memory回顾有来源的具体片段；reflection是可修正的解释；wish是希望/可选邀请；care仅表达当下陪伴。后两种不能夹带无依据的过去、诊断或承诺。'),
  text: z.string().min(1).max(1600),
  citations: z.array(reflectiveLetterCitationSchema).max(8),
}).strict().superRefine((paragraph, context) => {
  if (['memory', 'reflection'].includes(paragraph.kind) && !paragraph.citations.length)
    context.addIssue({ code: 'custom', path: ['citations'], message: '生活片段和解释需要实际读到的来源；缺资料时可写短一点，不补造经历。' });
  if (paragraph.kind === 'care' && paragraph.citations.length)
    context.addIssue({ code: 'custom', path: ['citations'], message: '纯陪伴段不承载事实引用；有具体经历时请用memory或reflection。' });
});

export const reflectiveLetterDraftInput = z.object({
  operation: z.literal('compose'),
  opportunityId: id, expectedRevision: z.number().int().positive(),
  title: z.string().min(1).max(160),
  paragraphs: z.array(reflectiveLetterParagraphSchema).min(1).max(12),
  coverage: z.object({
    experienceCoverage: z.enum(['selected_fragments', 'no_experience_evidence']),
    unresolved: z.array(z.string().min(1).max(500)).max(6),
  }).strict().describe('少量真实读到的生活片段，不称覆盖整周、全部经历或完整成长。未知可留白，别为填满来信而寻找人生标签。'),
}).strict().superRefine((draft, context) => {
  if (draft.paragraphs.map(paragraph => paragraph.text).join('\n\n').length > 12000)
    context.addIssue({ code: 'custom', path: ['paragraphs'], message: '这封信太长，请保留真正想接住的片段。' });
  if (draft.coverage.experienceCoverage === 'no_experience_evidence'
    && draft.paragraphs.some(paragraph => ['memory', 'reflection'].includes(paragraph.kind)))
    context.addIssue({ code: 'custom', path: ['coverage'], message: '没有经历资料时不能写成已记起的生活片段或有依据的解释。' });
});
export type ReflectiveLetterDraftInput = z.infer<typeof reflectiveLetterDraftInput>;

export const reflectiveLetterReadInput = z.object({
  operation: z.literal('read'), opportunityId: id, expectedRevision: z.number().int().positive().optional(),
}).strict();
export const reflectiveLetterToolInput = z.discriminatedUnion('operation', [
  reflectiveLetterRequestInput, reflectiveLetterMandateInput, reflectiveLetterDraftInput, reflectiveLetterReadInput,
]);
export const reflectiveLetterWriteInput = z.discriminatedUnion('operation', [
  reflectiveLetterRequestInput, reflectiveLetterMandateInput, reflectiveLetterDraftInput,
]);

export interface ReflectiveLetterOriginalProof extends WorkSourceRef {
  kind: 'original'; quoteSha256: string; sourceId: string; speaker: string; authority: string;
  receivedAt: string; receivedInWindow: boolean;
  sourceContext?: EvidenceEvent['sourceContext'];
}
export interface ReflectiveLetterMaterialProof {
  kind: 'material'; resourceId: string; sha256: string; version: number;
  sourceEventId: string; contentVersion: number; parentEventId: string;
  page?: number; start: number; end: number; quoteSha256: string; sourceId: string;
  sourceEnvelopeRefs: WorkSourceRef[];
}
export interface ReflectiveLetterLearningProof {
  kind: 'learning'; id: string; revision: number; sourceBinding: WorkSourceBinding;
  originals: ReflectiveLetterOriginalProof[]; observation: 'reported_process';
}
export interface ReflectiveLetterNoteProof extends NoteSourceProof {
  kind: 'note'; sourceId: 'notes:self'; quoteSha256: string;
}
export type ReflectiveLetterProof = ReflectiveLetterOriginalProof | ReflectiveLetterMaterialProof | ReflectiveLetterLearningProof | ReflectiveLetterNoteProof;
export interface ReflectiveLetterDocument {
  version: 1;
  title: string;
  window: ReflectiveLetterWindow;
  asOf: string;
  request: WorkSourceRef & { quoteSha256: string };
  authorization: 'current_request' | 'existing_mandate';
  paragraphs: { kind: 'memory' | 'reflection' | 'wish' | 'care'; text: string; sources: ReflectiveLetterProof[] }[];
  sourceBinding: WorkSourceBinding;
  coverage: ReflectiveLetterDraftInput['coverage'];
  createdAt: string;
  meaning: string;
}

const originalProof = workSourceRefSchema.safeExtend({
  kind: z.literal('original'), quoteSha256: digest, sourceId: id, speaker: z.string(), authority: z.string(),
  receivedAt: z.string().datetime({ offset: true }), receivedInWindow: z.boolean(),
  sourceContext: evidenceSchema.shape.sourceContext,
});
const materialProof = z.object({
  kind: z.literal('material'), resourceId: id, sha256: digest, version: z.number().int().positive(),
  sourceEventId: id, contentVersion: z.number().int().positive(), parentEventId: id,
  page: z.number().int().positive().optional(), start: z.number().int().nonnegative(), end: z.number().int().positive(),
  quoteSha256: digest, sourceId: id, sourceEnvelopeRefs: z.array(workSourceRefSchema).min(1).max(2),
}).strict().refine(value => value.end > value.start, '资料文字范围无效');
const learningProof = z.object({
  kind: z.literal('learning'), id, revision: z.number().int().positive(), sourceBinding: workSourceBindingSchema,
  originals: z.array(originalProof).min(1).max(8), observation: z.literal('reported_process'),
}).strict();
const noteProof = noteSourceProofSchema.safeExtend({
  kind: z.literal('note'), sourceId: z.literal('notes:self'), quoteSha256: digest,
}).refine(value => value.end > value.start, '笔记正文引用需要非空范围');
export const reflectiveLetterProofSchema = z.discriminatedUnion('kind', [originalProof, materialProof, learningProof, noteProof]);
export const reflectiveLetterMetadataSchema = z.object({
  binding: workSourceBindingSchema,
  request: workSourceRefSchema.safeExtend({ quoteSha256: digest }),
  proofs: z.array(reflectiveLetterProofSchema).max(96),
}).strict();
export type ReflectiveLetterMetadata = z.infer<typeof reflectiveLetterMetadataSchema>;
export const reflectiveLetterDocumentSchema = z.object({
  version: z.literal(1), title: z.string().min(1).max(160), window: reflectiveLetterWindowSchema, asOf: z.string().datetime({ offset: true }),
  request: workSourceRefSchema.safeExtend({ quoteSha256: digest }),
  authorization: z.enum(['current_request', 'existing_mandate']),
  paragraphs: z.array(z.object({ kind: z.enum(['memory', 'reflection', 'wish', 'care']), text: z.string().min(1).max(1600),
    sources: z.array(reflectiveLetterProofSchema).max(8),
  }).strict()).min(1).max(12),
  sourceBinding: workSourceBindingSchema,
  coverage: reflectiveLetterDraftInput.shape.coverage,
  createdAt: z.string().datetime({ offset: true }), meaning: z.string().max(1200),
}).strict();

/** A private view of the same prepared opportunity. It neither creates an
 * independent memory nor records that the user read or agreed with the letter. */
export interface ReflectiveLetterView {
  id: string; revision: number; kind: 'reflective_letter';
  title: string; body: string; window: ReflectiveLetterWindow; asOf: string;
  paragraphs: { kind: 'memory' | 'reflection' | 'wish' | 'care'; text: string;
    sources: { label: string; receivedAt?: string; read: { tool: string; arguments: Record<string, unknown> } }[] }[];
  coverage: ReflectiveLetterDraftInput['coverage'];
  generatedAt: string; displayed: 'not_established'; readByUser: 'not_established';
  historical?: true;
  meaning: string;
}
