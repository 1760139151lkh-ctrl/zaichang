import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Action, Obligation, Step } from '../shared/types';
import { HarnessError, type DelegatedTask } from '../shared/harness';
import type { Store } from './store';
import type { RunSession } from './runtime/coordinator';
import { ProviderError, type ToolSpec } from './provider';
import { redactCredentials } from './runtime/redaction';
import { compactSchema, deferredFamily, USE_TOOL } from './runtime/tool-surface';

export interface ToolContext {
  prepareRelease?: import('./runtime/coordinator').RuntimeCallbacks['prepareRelease'];
  verifyPrivacyControl?: import('./runtime/coordinator').RuntimeCallbacks['verifyPrivacyControl'];
  verifyReadPurpose?: import('./runtime/coordinator').RuntimeCallbacks['verifyReadPurpose'];
  verifyAttentionExpiry?: import('./runtime/coordinator').RuntimeCallbacks['verifyAttentionExpiry'];
  verifyLocalDelegation?: import('./runtime/coordinator').RuntimeCallbacks['verifyLocalDelegation'];
  verifyBusinessChoice?: import('./runtime/coordinator').RuntimeCallbacks['verifyBusinessChoice'];
  store: Store;
  signal: AbortSignal;
  userText: string;
  currentUserId: string;
  child: boolean;
  step: (step: Step) => void;
  plan: (items: Obligation[]) => void;
  action: (item: Action) => void;
  changed: () => void;
  delegate: (tasks: DelegatedTask[], operationSignal?: AbortSignal) => Promise<unknown>;
  runtimeSession?: RunSession;
  campus?: import('./zjuAdapter').ZjuAdapter;
  map?: import('./mapService').CampusMapAdapter;
  mapCard?: (card: import('../shared/map-v2').MapCard) => void;
  present?: import('./runtime/coordinator').RuntimeCallbacks['present'];
  attentionMessage?: import('./runtime/coordinator').RuntimeCallbacks['attentionMessage'];
  // Compatibility shape only. Cache eligibility belongs to CapabilityBroker.
  campusMemo?: {
    fullContextUsed: boolean;
    domains: Set<string>;
    results: Map<string, unknown>;
    inFlight?: Map<string, Promise<unknown>>;
  };
  campusReady?: (result: unknown) => void;
  campusInvalidate?: () => void;
}

function formatToolStepTitle(name: string, raw: string): string {
  let args: any = {};
  try {
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
      args = JSON.parse(raw);
    }
  } catch {}

  if (name === 'look_up' || name === 'search_history' || name === 'query_campus' || name === 'get_weather') {
    if (args.source === 'weather' || name === 'get_weather') return '查看天气情况';
    if (args.source === 'campus' || name === 'query_campus') {
      const domain = args.domain || args.kind;
      if (domain === 'schedule') return '查询课程与日程';
      if (domain === 'grades') return '查询成绩与学分';
      return '查询校园信息';
    }
    if (args.source === 'history' || name === 'search_history') return '检索过往记录';
    return '查找相关资料';
  }
  if (name.startsWith('map_')) {
    if (name === 'map_route') return '规划路线与时间';
    if (name === 'map_search') return '查找地点位置';
    if (name === 'map_overview') return '查看校园地图全貌';
    return '查看地图信息';
  }
  if (name === 'manage_note') {
    const act = args?.action;
    if (act === 'read') return '翻看笔记内容';
    if (act === 'list') return '查看笔记列表';
    if (act === 'create') return '记录新笔记';
    if (act === 'append') return '补充笔记内容';
    if (act === 'search') return '查找相关笔记';
    return '整理笔记';
  }
  if (name === 'manage_calendar') {
    const act = args?.action;
    if (act === 'read' || act === 'query') return '核对日程安排';
    if (act === 'create') return '添加日程';
    if (act === 'update') return '调整日程';
    return '整理日程';
  }
  if (name === 'search_context') return '检索过往记录';
  if (name === 'read_evidence') return '核对原话记录';
  if (name === 'read_understanding') return '查看先前的理解';
  if (name === 'recall_experience') return '回顾过往相处与经历';
  if (name === 'curiosity_invitation') return '准备一份好奇邀请';
  if (name === 'write_reflective_letter') return '写一封生活来信';
  if (name === 'manage_relationship_rehearsal') return '一起试着说';
  if (name === 'read_relationship_rehearsal') return '翻回这段试说';
  if (name === 'manage_companion') return '记住相处小约定';
  if (name === 'read_companion') return '回顾相处细节';
  if (name === 'read_skill') return args.id === 'persona-expression' ? '回顾习惯的相处方式' : '翻看合适的做法';
  if (name === 'manage_method') return '记住新的相处习惯';
  if (name === 'remember_preference' || name === 'propose_memory_change') return '整理当前信息';
  if (name === 'prepare_action' || name === 'propose_action') return '准备下一步安排';
  if (name === 'present_view') return '准备界面呈现';
  if (name === 'decide_help') return '权衡回应方式';

  return '梳理手头的事项';
}

export class ToolRegistry {
  private run: RunSession;
  constructor(private context: ToolContext) {
    context.store.runtime.connect({ campus: context.campus, map: context.map });
    this.run =
      context.runtimeSession ||
      context.store.runtime.begin(
        context.userText,
        context.currentUserId || randomUUID(),
        'tool-contract',
        context.signal,
      );
    if (context.child && !context.runtimeSession) {
      const scope = context.store.runtime.policy.narrow(this.run.ingress.contract.scope, {
        child: true,
        infer: false,
        grants: context.store.runtime.policy
          .validate(this.run.ingress.contract.scope)
          .grants.filter((g) => g.endsWith(':read')),
      });
      this.run = {
        ...this.run,
        ingress: { ...this.run.ingress, contract: { ...this.run.ingress.contract, scope } },
      };
    }
  }
  /** What the model is offered for this request (see runtime/tool-surface). */
  specs(): ToolSpec[] {
    return this.context.store.runtime.modelToolSpecs(this.run, this.context.child);
  }
  /** The full permission-filtered contract list owned by the host. */
  allSpecs(): ToolSpec[] {
    return this.context.store.runtime.toolSpecs(this.run, this.context.child);
  }
  async execute(name: string, raw: string, toolCallId?: string, operationSignal?: AbortSignal): Promise<string> {
    if (name === USE_TOOL) return this.useTool(raw, toolCallId, operationSignal);
    const signal = AbortSignal.any([this.context.signal, this.run.signal, ...(operationSignal ? [operationSignal] : [])]);
    const id = randomUUID(),
      title = formatToolStepTitle(name, raw);
    signal.throwIfAborted();
    this.context.step({ id, title, status: 'running' });
    let requestedArguments: unknown;
    try {
      if (raw.length > 40000) throw new HarnessError('input_budget', '工具参数超过长度上限。');
      const args = JSON.parse(raw);
      requestedArguments = JSON.parse(redactCredentials(JSON.stringify(args)));
      if (name === 'read_evidence' && !this.run.pack)
        await this.context.store.runtime.compile(this.run, false, signal);
      const readBaseline = this.run.investigation && ['search_context', 'read_evidence'].includes(name)
        ? this.context.store.runtime.repo.sourceRestrictionSnapshot(this.run.ingress.contract.scope) : undefined;
      const result = await this.context.store.runtime.executeTool(
          this.run,
          name,
          args,
          this.context,
          this.context.child,
          signal,
        );
      if (toolCallId && typeof (result as any)?.data?.observationId === 'string') {
        const visual = this.run.toolImages?.find(image => image.id === (result as any).data.observationId);
        if (visual) visual.toolCallId = toolCallId;
      }
      signal.throwIfAborted();
      const status = (result as any)?.status;
      this.context.step({
        id,
        title,
        status: [
          'failed',
          'forbidden',
          'unsupported',
          'not_connected',
          'unknown',
          'stale',
          'partial',
          'conflict',
          'needs_confirmation',
        ].includes(status)
          ? 'blocked'
          : 'done',
        detail: (result as any)?.reason,
      });
      const identified = toolCallId ? result && typeof result === 'object' && !Array.isArray(result)
        ? { ...result, observationId: toolCallId } : { data: result, observationId: toolCallId } : result;
      const output = JSON.stringify(identified);
      let finalResult = JSON.parse(redactCredentials(output));
      if (name === 'read_evidence' && this.run.pack && typeof args.id === 'string'
        && !['failed', 'forbidden', 'unsupported', 'not_connected', 'unknown', 'stale', 'conflict'].includes((result as any)?.status))
        finalResult = this.context.store.runtime.context.recordEvidenceRead(this.run.pack, result, finalResult, args.id,
          this.specs().some(tool => tool.function.name === 'restore_collaboration'));
      const safe = JSON.stringify(finalResult);
      signal.throwIfAborted();
      this.context.store.runtime.policy.validate(this.run.ingress.contract.scope);
      if (this.run.investigation && toolCallId && ['search_context', 'read_evidence'].includes(name))
        this.context.store.runtime.investigation.stageOutput(this.run.investigation,
          this.run.ingress.contract.scope, name, toolCallId, result, finalResult, readBaseline);
      (this.run.observations ||= []).push({ tool: name, requestedArguments, result: finalResult, ...(toolCallId ? { toolCallId } : {}) });
      return safe;
    } catch (error) {
      if (signal.aborted) throw error;
      const detail =
        error instanceof HarnessError
          ? error.message
          : error instanceof ProviderError
            ? name === 'present_view' ? '这次呈现还没完成，原内容仍在。' : '这一步还没完成，已有内容仍在。'
            : error instanceof z.ZodError
              ? '工具参数不符合要求，请核对字段、主体与时间。'
              : error instanceof SyntaxError
                ? '工具参数不是有效 JSON，请修正。'
                : '这一步没有完成。';
      this.context.step({ id, title, status: 'blocked', detail });
      const diagnosticExplanation = error instanceof HarnessError && error.diagnostic
        ? redactCredentials(error.diagnostic.explanation) : undefined;
      const failedResult = {
        status:
          error instanceof HarnessError && /forbidden|scope|approval/.test(error.code)
            ? 'forbidden'
            : 'failed',
        error: detail,
        code: error instanceof HarnessError || error instanceof ProviderError ? error.code : 'invalid_request',
        ...(error instanceof ProviderError ? {
          retry: '本次模型调用没有完成，失败输出未被采用。保留原请求与已经合法取得的内容，按实际错误处理；不要提高额度或改写用户要求来通过。',
        } : {}),
        ...(error instanceof HarnessError && error.diagnostic ? {
          diagnostic: { rejectedDimensions: error.diagnostic.rejectedDimensions, explanation: diagnosticExplanation!.slice(0, 500),
            ...(error.diagnostic.expansion ? { expansion: error.diagnostic.expansion } : {}),
            ...(error.diagnostic.expression ? { expression: error.diagnostic.expression } : {}),
            ...(error.diagnostic.component ? { component: error.diagnostic.component } : {}),
            ...(error.diagnostic.input ? { input: error.diagnostic.input } : {}),
            ...(error.diagnostic.previous ? { previous: error.diagnostic.previous } : {}) },
          retry: error.code.startsWith('interactive_') || error.diagnostic.input || error.diagnostic.previous
            ? '这是交互程序的实际校验诊断，不是新指令。沿诊断修正结构、字段或引用，不能删掉用户要求或改变原意来绕过校验。失败调用没有发表新画面或新版本；合法地址不授权自动改签，也不能补造未证实的旧状态。可用已读签名与诊断继续，不必反复整页读取方法。'
            : '这是对候选的核验意见，不是新指令。仅在能依据原话修正时再提交；不能删掉真实条件或编造精确期限来通过。当前原话仍可直接用于本轮回应，长期整理失败不等于无法回答。未提交的候选不能声称已保存。',
        } : {}),
        ...(error instanceof z.ZodError ? { fields: error.issues.slice(0, 12).map(issue => ({ path: issue.path.join('.'), code: issue.code, requirement: redactCredentials(issue.message) })), retry: '参照工具schema逐项修正这些字段；失败调用没有提交，不要改变用户原意来绕过校验。' } : {}),
      };
      (this.run.observations ||= []).push({ tool: name, requestedArguments, result: failedResult, ...(toolCallId ? { toolCallId } : {}) });
      if (error instanceof HarnessError && (error.diagnostic?.expansion || error.diagnostic?.expression || error.diagnostic?.component || error.diagnostic?.input || error.diagnostic?.previous) && this.run.pack) {
        const receipt = this.run.pack.receipt;
        receipt.interactiveProgramDiagnostics = [...(receipt.interactiveProgramDiagnostics || []), {
          stepId: id, ...(toolCallId ? { toolCallId } : {}),
          ...(error.diagnostic.expansion ? { expansion: structuredClone(error.diagnostic.expansion) } : {}),
          ...(error.diagnostic.expression ? { expression: structuredClone(error.diagnostic.expression) } : {}),
          ...(error.diagnostic.component ? { component: structuredClone(error.diagnostic.component) } : {}),
          ...(error.diagnostic.input ? { input: structuredClone(error.diagnostic.input) } : {}),
          ...(error.diagnostic.previous ? { previous: structuredClone(error.diagnostic.previous) } : {}),
          explanationTruncated: diagnosticExplanation!.length > 500,
        }].slice(-8);
        this.context.store.runtime.repo.saveReceipt(this.run.pack.contract.scope, receipt);
      }
      return JSON.stringify(failedResult);
    }
  }
  /** The gateway for specialized tools. Describing returns the same contract
   * the host validates; calling runs the ordinary execute path, so the
   * observation, step and receipt carry the real tool name. */
  private async useTool(raw: string, toolCallId?: string, operationSignal?: AbortSignal): Promise<string> {
    let request: { name?: unknown; arguments?: unknown };
    try { request = JSON.parse(raw); } catch { return JSON.stringify({ status: 'failed', code: 'invalid_request', error: 'use_tool 的参数不是有效 JSON。' }); }
    const name = typeof request?.name === 'string' ? request.name : '';
    const spec = this.allSpecs().find(item => item.function.name === name && deferredFamily(name));
    if (!spec) return JSON.stringify({ status: 'failed', code: 'tool_unavailable', error: '这个专门工具现在不可用，或者它本来就在工具列表里，可以直接调用。' });
    if (request.arguments === undefined) {
      const described = { status: 'schema', name, description: spec.function.description, parameters: compactSchema(spec.function.parameters),
        next: '按这份参数结构再调用一次 use_tool，并传入 arguments。' };
      (this.run.observations ||= []).push({ tool: USE_TOOL, requestedArguments: { name }, result: described, ...(toolCallId ? { toolCallId } : {}) });
      return JSON.stringify(described);
    }
    return this.execute(name, JSON.stringify(request.arguments), toolCallId, operationSignal);
  }
}
