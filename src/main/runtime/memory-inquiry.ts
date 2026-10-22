import { z } from 'zod';
import { HarnessError, workSourceRefSchema, type DelegatedTask, type ScopeHandle, type WorkSourceRef } from '../../shared/harness';
import type { ModelWireMessage, ToolSpec } from '../provider';
import type { KernelRepository } from '../storage/repository';
import { canonical } from './semantics';

export const MEMORY_INQUIRY_TOOL = 'recall_experience';
const id = z.string().min(1).max(160);
const inquiryQuestion = z.string().min(1).max(1000);
const inquiryContent = {
  question: inquiryQuestion.describe('眼前这次想了解的前情：当时为何那样选择、什么经历影响现在，或后来哪些条件变了。当前问题给调查一个方向，本人的原因还在原话里。'),
  uncertainties: z.array(z.string().min(1).max(400)).max(6).optional()
    .describe('目前还没弄清、值得沿原文深入了解的问题。有几处就记几处，调查中的解释也可以随着新材料改变。'),
  anchorRefs: z.array(workSourceRefSchema).max(8).optional()
    .describe('已经知道的原文定位线索，地址采用宿主提供的绝对Unicode坐标。它帮助找到起点，正文阅读和经历之间的关系各有实际依据。'),
  relatedTo: z.array(id).max(4).optional().describe('已经知道的共同事项、学习过程或规划事项ID，可以沿原owner回到同一件事。'),
};
export const memoryInquiryInput = z.object({
  ...inquiryContent,
  sources: z.array(id).max(12).optional().describe('这次调查确实需要的已许可sourceId，可进一步限源；省略时仅采用当前许可的个人原话、理解和事项来源。'),
  currentEvidenceIds: z.array(id).max(8).optional().describe('这次确实需要交给调查同伴的当前原话ID；省略时没有默认共享的当前消息或附件。'),
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
    description: '眼前这件事需要旧经历、当时理由或后来变化时，可以请同一Hermes的只读调查同伴深入了解。当前问题和真正不确定处给它方向，它会自行搜索、展开原话、接回原事项、了解后来更正与例外，再带回有来处的理解和还没弄清的部分，让本人省下重讲背景的负担。适合需要深读与比较的前情；当前原话足够时，也可以直接接着交流。调查本身没有人物记忆、旧计划或动作的写入。', parameters } };
}

export const MEMORY_INQUIRY_PARENT_GUIDANCE = `这份交接围绕眼前问题，带回同伴目前能形成的理解。实际找到的经历、当时理由、后来变化和例外，以及仍有的空白，都各有价值。你可以联系本人现在的原话，形成自己的判断，也为那些能同时存在的感受和取舍留出位置。有了足够背景，就能顺着这件事继续商量，让他不必把已经讲过的经历再说一遍。

调查中的解释保留有来源的工作假设身份。evidenceIndex标明可回读的来处，其中实际给出的原文片段也有自己的覆盖；眼前材料足够时可以直接理解，确实缺少关键语境时也能沿它回读。有些支线没做成，独立取得且仍可用的材料也有自己的价值。若一个条件确实影响眼前结论、现有原文和工具又仍无法补足，再请本人帮忙说清那一点。

这份报告是在与你交接，最后怎样和本人交流，由你带着当前角色和眼前情况形成自己的话。找回经历支持的是这次理解，人物画像、排程、记忆写入和旧承诺是否恢复，都有各自的来源、选择与执行过程。`;

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
      throw new HarnessError('memory_inquiry_forbidden', '眼前允许读取的资料范围还没有这项个人经历调查所需的条件。');
    const sources = unique(input.sources ?? scope.sources.filter(source => ['history:self', 'profile:self', 'work:self'].includes(source)
      && (source !== 'profile:self' || scope.grants.includes('memory:read'))));
    const currentEvidenceIds = unique(input.currentEvidenceIds || []);
    if (currentEvidenceIds.some(eventId => !scope.currentEventIds.includes(eventId))
      || currentEvidenceIds.length > 0 && !scope.sources.includes('current')
      || sources.some(source => !scope.sources.includes(source) || source === 'profile:self' && !scope.grants.includes('memory:read')))
      throw new HarnessError('memory_inquiry_scope', '这次选择的当前原话或来源，没有与眼前允许读取的范围对应上。');
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
    if (!methodText.trim()) throw new HarnessError('memory_inquiry_method', '这次还没有取得经历调查的方法正文，交给调查同伴的说明尚未生成。');
    return methodText + '\n\n下面是这次想一起了解的问题与导航资料，帮助你找到方向；具体事实来自实际原文，读取范围仍沿原来的托付：\n'
      + canonical({ memoryInquiry: profile, availableTools: unique(availableTools), navigation: {
        anchorRefs: '这些是原文的绝对Unicode地址，read_evidence可以沿地址回读。后台引文工具有时使用局部坐标，宿主随结果提供的真实read入口已表达了这层位置关系，可以沿那个入口继续。',
        relatedTo: '这些ID指向原来的具体事项，restore_collaboration或该类型自己的read入口可以带你回到它的所有者。相似标题仍可能属于不同的事，各自保留原对象的身份。',
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
