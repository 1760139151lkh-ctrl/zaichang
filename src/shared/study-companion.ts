import { z } from 'zod';
import { workSourceRefSchema, type WorkSourceBinding, type WorkSourceRef } from './harness';
import { explorableStudySchema, type ExplorableStudySpec } from './explorable-study';

const id = z.string().min(1).max(160);
export const studyCitationSchema = workSourceRefSchema.safeExtend({ quote: z.string().min(1).max(8000) }).strict();
export const studyModeSchema = z.enum(['small_hint', 'guided_step', 'explain']);
export type StudyMode = z.infer<typeof studyModeSchema>;
const material = { observationId: id.describe('刚才materials.read/observe工具返回的顶层observationId；不是文件ID、描述目录的ID或内部页图ID。'),
  resourceId: z.string().regex(/^material-[a-f0-9-]{36}$/) };
export const studyProblemInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('evidence'), source: studyCitationSchema }).strict(),
  z.object({ kind: z.literal('material_text'), ...material, page: z.number().int().positive().optional(),
    start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1).max(8000) }).strict(),
  z.object({ kind: z.literal('material_page'), ...material, page: z.number().int().positive(),
    description: z.string().min(1).max(2400).describe('依据已取得的真实页图整理题意；这是助手转述，原图仍可打开。') }).strict(),
]);
export const studyPacketInput = z.object({
  kind: z.enum(['question', 'hint', 'explanation', 'example', 'practice']),
  title: z.string().min(1).max(120).optional(),
  text: z.string().min(1).max(8000).describe('本次实际提供的一段教学内容，支持Markdown和数学公式；small_hint只给能推进的一点，不把后续解法藏在同段中。'),
  nextMove: z.string().min(1).max(800).describe('接下来可自己想、写或问的一小步；用户要直讲时可给一句自然的理解检查，不强制考试。'),
  supports: z.array(studyCitationSchema).max(8).optional().describe('这段教学实际借用的其他已读原话或资料片段；模型自带的一般知识不冒充私人来源。'),
  exploration: explorableStudySchema.optional().describe('可选的同纸可操作解释：仅有限二次关系a*x²+b*x+c。packet.text先给能独立读懂的解释和观察线索，再让用户改已声明系数或移动x，看高度与当前斜率联动；不用再存第二份解释文字，不预填超出当前提示深度的答案。不是通用模拟器，超范围继续用正常讲解/调查。所改值是临时假设，不是本人事实或掌握。'),
}).strict();
const target = { id, expectedRevision: z.number().int().positive(), source: studyCitationSchema };
export const studyCompanionInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('open'), matterId: id, expectedMatterRevision: z.number().int().positive(),
    source: studyCitationSchema, title: z.string().min(1).max(160), problem: studyProblemInput,
    mode: studyModeSchema, attempt: studyCitationSchema.optional(), focus: z.string().min(1).max(800),
    nextStart: z.string().min(1).max(800), packet: studyPacketInput.optional() }).strict(),
  z.object({ operation: z.literal('read'), id: id.optional(), matterId: id.optional(),
    offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(12).optional(),
    historyOffset: z.number().int().nonnegative().optional(), historyLimit: z.number().int().min(1).max(8).optional() }).strict(),
  z.object({ operation: z.literal('respond'), ...target, mode: studyModeSchema.optional(),
    attempt: studyCitationSchema.optional(), packet: studyPacketInput.optional(),
    focus: z.string().min(1).max(800).optional(), nextStart: z.string().min(1).max(800).optional() }).strict(),
  z.object({ operation: z.literal('park'), ...target, nextStart: z.string().min(1).max(800) }).strict(),
  z.object({ operation: z.literal('close'), ...target, note: z.string().max(800).optional() }).strict(),
]);
export type StudyCompanionInput = z.infer<typeof studyCompanionInput>;
export interface StudyOrigin {
  kind: 'evidence' | 'material_text' | 'material_page';
  sourceId: string;
  eventId?: string;
  contentVersion?: number;
  start?: number;
  end?: number;
  resourceId?: string;
  page?: number;
  name?: string;
  interpretation?: 'original_excerpt' | 'assistant_page_description';
  read: { tool: string; arguments: Record<string, unknown> };
}
export interface StudyCompanionView {
  id: string;
  revision: number;
  matterId: string;
  title: string;
  status: 'active' | 'parked' | 'closed';
  mode: StudyMode;
  focus: string;
  problem: { display: string; origin: StudyOrigin };
  attempts: { id: string; text: string; origin: 'user_report'; source: WorkSourceRef; receivedAt: string }[];
  steps: { id: string; kind: z.infer<typeof studyPacketInput>['kind']; title?: string;
    text: string; origin: 'assistant_generated'; nextMove: string; mode: StudyMode; providedAt: string;
    exploration?: ExplorableStudySpec }[];
  currentStep?: StudyCompanionView['steps'][number];
  historyCoverage: { attempts: { returned: number; total: number }; steps: { returned: number; total: number };
    nextOffset: number | null; read?: { tool: 'study_companion'; arguments: Record<string, unknown> } };
  nextStart: string;
  stopPoint?: { text: string; at: string };
  closure?: { text: string; at: string };
  sourceBinding: WorkSourceBinding;
  interaction: { actions: { id: string; label: string; request: string }[];
    meaning: string };
  updatedAt: string;
  meaning: string;
}
