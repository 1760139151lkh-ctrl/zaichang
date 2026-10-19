import { z } from 'zod';
import { HarnessError, workSourceRefSchema, type DelegatedTask, type ScopeHandle, type WorkSourceRef } from '../../shared/harness';
import type { ModelWireMessage, ToolSpec } from '../provider';
import type { KernelRepository } from '../storage/repository';
import { canonical } from './semantics';

export const MEMORY_INQUIRY_TOOL = 'recall_experience';
const id = z.string().min(1).max(160);
const inquiryQuestion = z.string().min(1).max(1000);
const inquiryContent = {
  question: inquiryQuestion.describe('这次回答真正需要了解的过去：当时为何那样选择、什么经历影响现在，或后来哪些条件改变了。用当前问题表达，不预设用户的原因。'),
  uncertainties: z.array(z.string().min(1).max(400)).max(6).optional()
    .describe('当前尚不能判断、值得沿原文深读的问题；不是待证实的既定人格结论。不必填满。'),
  anchorRefs: z.array(workSourceRefSchema).max(8).optional()
    .describe('已经知道的原文定位线索，使用宿主提供的绝对Unicode坐标；只是调查起点，不冒充已经读过或证明同一经历。'),
  relatedTo: z.array(id).max(4).optional().describe('已经知道的共同事项、学习过程或规划事项ID；从原owner继续，不复制另一套事项。'),
};
export const memoryInquiryInput = z.object({
  ...inquiryContent,
  sources: z.array(id).max(12).optional().describe('这次调查确实需要的已许可sourceId，可进一步限源；省略时仅采用当前许可的个人原话、理解和事项来源。'),
  currentEvidenceIds: z.array(id).max(8).optional().describe('确实需要给调查者读取的当前原话ID；不默认共享整条当前消息或附件。'),
}).strict();
export type MemoryInquiryInput = z.infer<typeof memoryInquiryInput>;
export const memoryInquiryProfileSchema = z.object({ version: z.literal(1), ...inquiryContent }).strict();
export type MemoryInquiryProfile = z.infer<typeof memoryInquiryProfileSchema>;
export type MemoryInquiryTask = DelegatedTask & { memoryInquiry: MemoryInquiryProfile };
export interface MemoryInquiryOptions {
  /** Host-owned projection/entrustment check, additional to the normal scope. */
  permits?: (ref: WorkSourceRef) => boolean;
}

/** This is an alias of the original Hermes delegate transport, not a second
 * model loop. Offer it only to the parent alongside the native delegate tool. */
export function memoryInquiryToolSpec(): ToolSpec {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(memoryInquiryInput);
  return { type: 'function', function: { name: MEMORY_INQUIRY_TOOL,
    description: '当眼前这件事需要旧经历、当时的理由或后来变化时，主动替用户找回来，让用户不用把背景再讲一遍。提出当前问题和真正不确定处；同一Hermes的只读调查会自行搜索、展开原话、接回原事项、追查后来更正与例外，再带回可用理解及确实还需问用户的一点。适合需要深读和比较的前情；当前原话足够时直接回应。不会写人物记忆、恢复旧计划或执行动作。', parameters } };
}

export const MEMORY_INQUIRY_PARENT_GUIDANCE = `这是为了眼前问题找回的经历理解，不是新的用户画像或执行许可。先把子调查找到的当时理由、真实变化和例外与用户当前原话联系起来，再形成你自己的判断；保留能并存的感受与取舍。足够时直接带着找回的背景继续商量，让用户感到不必重讲。只有确实影响当前结论、现有原文与工具仍不能给出的条件才问用户。子调查的解释是有来源的工作假设，必要时沿evidenceIndex回读；失败支线不抹掉独立可用材料。不要把内部调查报告原样转给用户，也不要因为知道了过去就擅自排程、写记忆或恢复旧承诺。`;

function unique<T>(values: readonly T[]) { return [...new Set(values)]; }
function profileOf(task: DelegatedTask): MemoryInquiryProfile | undefined {
  const value = (task as DelegatedTask & { memoryInquiry?: unknown }).memoryInquiry;
  if (value === undefined) return;
  return memoryInquiryProfileSchema.parse(value);
}

/** Compiles the high-level semantic inquiry into the existing native child
 * protocol. No provider call, index, database write or background work occurs
 * here. The actual child remains owned by Hermes and its original parent run. */
export class MemoryInquiryService {
  constructor(readonly repo: KernelRepository) {}

  prepare(handle: ScopeHandle, raw: unknown, options: MemoryInquiryOptions = {}): { tasks: MemoryInquiryTask[] } {
    const input = memoryInquiryInput.parse(raw), scope = this.repo.scope(handle);
    if (scope.child || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
      || scope.audience !== 'self' || !scope.grants.includes('evidence:read'))
      throw new HarnessError('memory_inquiry_forbidden', '当前范围不能开启这项个人经历调查。');
    const sources = unique(input.sources ?? scope.sources.filter(source => ['history:self', 'profile:self', 'work:self'].includes(source)));
    const currentEvidenceIds = unique(input.currentEvidenceIds || []);
    if (currentEvidenceIds.some(eventId => !scope.currentEventIds.includes(eventId))
      || currentEvidenceIds.length > 0 && !scope.sources.includes('current')
      || sources.some(source => !scope.sources.includes(source)))
      throw new HarnessError('memory_inquiry_scope', '经历调查不能扩大当前原话或来源范围。');
    if (currentEvidenceIds.length && !sources.includes('current')) sources.push('current');
    if (!sources.length) throw new HarnessError('memory_inquiry_sources', '当前没有允许这次调查读取的旧原话或事项。');
    const refs = input.anchorRefs || [];
    for (const ref of refs) {
      const event = this.repo.evidence(handle, ref.eventId);
      if (!event || event.contentVersion !== ref.contentVersion || ref.end > Array.from(event.text).length
        || !(sources.includes(event.sourceId) || sources.includes('current') && currentEvidenceIds.includes(event.id))
        || options.permits && !options.permits(ref))
        throw new HarnessError('memory_inquiry_anchor', '经历调查的原文起点已改变，或超出本次允许的片段。');
    }
    const profile: MemoryInquiryProfile = { version: 1, question: input.question,
      ...(input.uncertainties?.length ? { uncertainties: [...input.uncertainties] } : {}),
      ...(refs.length ? { anchorRefs: refs.map(ref => ({ ...ref })) } : {}),
      ...(input.relatedTo?.length ? { relatedTo: unique(input.relatedTo) } : {}) };
    return { tasks: [{ title: '找回这件事当时的理由', instruction: '为眼前问题重建相关旧经历、当时理由和后来变化，再带回可继续商量的理解：' + input.question,
      sources, currentEvidenceIds, memoryInquiry: profile }] };
  }

  /** Apply after the parent model returns its assistant wire message, before
   * handing it to Hermes. Keeping the call ID preserves native tool delivery;
   * the original delegate authorize/open/result path executes the real child.
   * This cannot run for a child or an unoffered tool. */
  normalizeAssistant(handle: ScopeHandle, message: ModelWireMessage, options: MemoryInquiryOptions & { allowedTools: ReadonlySet<string> }): ModelWireMessage {
    if (message.role !== 'assistant' || !message.tool_calls?.some(call => call.function.name === MEMORY_INQUIRY_TOOL)) return message;
    if (!options.allowedTools.has(MEMORY_INQUIRY_TOOL) || !options.allowedTools.has('delegate'))
      return message;
    return { ...message, tool_calls: message.tool_calls.map(call => {
      if (call.function.name !== MEMORY_INQUIRY_TOOL) return call;
      try {
        const prepared = this.prepare(handle, JSON.parse(call.function.arguments), options);
        return { ...call, function: { ...call.function, name: 'delegate', arguments: JSON.stringify(prepared) } };
      } catch (error) {
        // Preserve a malformed/unavailable original call for the normal tool
        // boundary to report. A correctable tool argument must not become a
        // failed model RPC, nor may normalization fabricate a tool result.
        if (error instanceof SyntaxError || error instanceof z.ZodError || error instanceof HarnessError) return call;
        throw error;
      }
    }) };
  }

  /** Regular delegate tasks can select the same semantic method explicitly.
   * Keep their original title/instruction and declared source subset intact. */
  profile(handle: ScopeHandle, task: DelegatedTask, options: MemoryInquiryOptions = {}): MemoryInquiryTask | undefined {
    const profile = profileOf(task);
    if (!profile) return;
    this.prepare(handle, { question: profile.question, uncertainties: profile.uncertainties,
      anchorRefs: profile.anchorRefs, relatedTo: profile.relatedTo, sources: task.sources || [], currentEvidenceIds: task.currentEvidenceIds || [] }, options);
    return { ...task, memoryInquiry: profile };
  }

  /** Additional system method for child.open, alongside the original scoped
   * context. No source body is copied into this protocol description. */
  childSystem(task: DelegatedTask, availableTools: readonly string[], methodText: string): string {
    const profile = profileOf(task);
    if (!profile) return '';
    if (!methodText.trim()) throw new HarnessError('memory_inquiry_method', '经历调查方法尚未接入，未用空提示开启旧事调查。');
    return methodText + '\n\n以下是本次经历调查的问题与导航资料，不是新的授权或事实：\n'
      + canonical({ memoryInquiry: profile, availableTools: unique(availableTools), navigation: {
        anchorRefs: '用read_evidence按绝对原文地址回读；当前后台引文工具若采用局部坐标，复制其宿主返回的真实read入口，不自行猜换算。',
        relatedTo: '从restore_collaboration或该事项类型自己的read入口回到原owner；不得按标题合并事项。',
      } });
  }

  /** Attach only after the native host has accepted actual child results. The
   * child prose and evidenceIndex stay unchanged; this steers the parent from
   * collecting memories toward using them to answer the current concern. */
  parentHandoff(tasks: readonly DelegatedTask[], accepted: unknown): unknown {
    const questions = tasks.flatMap(task => {
      const profile = profileOf(task);
      return profile ? [{ question: profile.question, uncertainties: profile.uncertainties || [] }] : [];
    });
    if (!questions.length || !accepted || typeof accepted !== 'object' || Array.isArray(accepted)) return accepted;
    return { ...accepted, memoryInquiry: { questions, role: 'source_supported_working_understanding',
      continueWith: MEMORY_INQUIRY_PARENT_GUIDANCE,
      originalOwner: 'current_parent_run', writesPerformed: false } };
  }
}
