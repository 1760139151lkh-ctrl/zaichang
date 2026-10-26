import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Action, Obligation, Step } from '../shared/types';
import { HarnessError, type DelegatedTask } from '../shared/harness';
import type { Store } from './store';
import type { RunSession } from './runtime/coordinator';
import { ProviderError, toolArgumentCharacterLimit, type ToolSpec } from './provider';
import { redactCredentials, redactCredentialValues } from './runtime/redaction';
import { DEFERRED_TOOL_FAMILIES, deferredFamily, deferredToolCatalog, USE_TOOL, type DeferredFamily } from './runtime/tool-surface';

const useToolInput = z.object({
  name: z.string().min(1).max(100).optional(), query: z.string().max(300).optional(),
  family: z.enum(Object.keys(DEFERRED_TOOL_FAMILIES) as [DeferredFamily, ...DeferredFamily[]]).optional(),
  offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(23).default(8),
  arguments: z.record(z.string(), z.unknown()).optional(),
}).strict();

function parameterRequirement(issue: z.ZodIssue): string {
  // Keep authored business explanations. Standard validation prose can quote
  // arbitrary submitted keys; the path and code already identify the problem.
  if (issue.code === 'custom') return redactCredentials(issue.message);
  if (issue.code === 'invalid_type') {
    const types: Record<string, string> = { string: '文字', number: '数字', bigint: '整数', boolean: '是或否', array: '一组内容', object: '一份对象', date: '日期', file: '文件' };
    return `这里需要${types[issue.expected] || '用法中指定的内容'}。`;
  }
  if (issue.code === 'too_small' || issue.code === 'too_big') {
    const amount = issue.code === 'too_small' ? issue.minimum : issue.maximum;
    const measure = issue.origin === 'string' ? '文字长度' : issue.origin === 'array' ? '项目数量' : '数值';
    const relation = issue.code === 'too_small' ? issue.inclusive === false ? '大于' : '至少为' : issue.inclusive === false ? '小于' : '至多为';
    return `${measure}需要${relation}${amount}。`;
  }
  if (issue.code === 'unrecognized_keys') return '这里多填了这份用法里没有的项目，可以对照完整用法调整。';
  if (issue.code === 'invalid_value') return '这里需要从完整用法给出的选项里选择。';
  if (issue.code === 'invalid_union') return '这里有几种写法，当前这一份还没对应上，可以回看完整用法再选一种。';
  return '这里的格式还没对上，可以回看这一项的完整用法。';
}

export interface ToolContext {
  prepareRelease?: import('./runtime/coordinator').RuntimeCallbacks['prepareRelease'];
  verifyPrivacyControl?: import('./runtime/coordinator').RuntimeCallbacks['verifyPrivacyControl'];
  verifyReadPurpose?: import('./runtime/coordinator').RuntimeCallbacks['verifyReadPurpose'];
  readConversation?: import('./runtime/coordinator').RuntimeCallbacks['readConversation'];
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
  companionActivity?: import('./runtime/coordinator').RuntimeCallbacks['companionActivity'];
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

function formatToolStepTitle(name: string, raw: string, capabilityTitle?: (name: string) => string | undefined): string {
  let args: any = {};
  try {
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
      args = JSON.parse(raw);
    }
  } catch {}
  if (name === 'use_tool' && typeof args?.name === 'string')
    return args.arguments === undefined ? '看看这件事该怎么做' : formatToolStepTitle(args.name, JSON.stringify(args.arguments), capabilityTitle);
  if (name === 'look_up') {
    if (args.source === 'local') return '翻看日程安排';
    if (args.source === 'map') return '查看地图';
    if (args.source === 'capability') {
      if (!args.capability) return '找找能用的办法';
      if (args.describeOnly || args.arguments === undefined) return '看看这份资料能怎样读取';
      return capabilityTitle?.(args.capability) || '查找相关资料';
    }
  }
  if (name === 'present_view') return '把结果摊开给你看';
  if (name === 'change_local_action') return '调整安排';
  if (name === 'inspect_action') return '确认安排的结果';
  if (name === 'cancel_action') return '撤回安排';
  if (name === 'delegate') return '分头去查';
  if (name === 'send_check_in') return '来找你说句话';
  if (name === 'study_companion' || name === 'read_study_companion') return '展开陪学纸';
  if (name === 'manage_relationship_rehearsal') return '一起试着说';
  if (name === 'offer_planning_alternatives') return '比较几种安排';

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
    const act = args?.operation;
    if (act === 'read') return '翻看笔记内容';
    if (act === 'list') return args.input?.query ? '查找相关笔记' : '查看笔记列表';
    if (act === 'history') return '翻看笔记旧版本';
    if (act === 'create') return '记录新笔记';
    if (act === 'update') return '修改笔记内容';
    if (act === 'change_state') return args.input?.state === 'deleted' ? '移除这份笔记' : '恢复这份笔记';
    if (act === 'undo') return '撤回笔记修改';
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
  if (name === 'read_evidence') return args.view === 'image' ? '再看看原图' : '核对原话记录';
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

/** Model continuation/retry instructions remain in the tool result. The
 * activity line describes only what this host operation actually delivered. */
function toolStepDisplay(title: string, status: Step['status'], result?: any, materialRead = false): NonNullable<Step['userFacing']> {
  const coverage = result?.coverage?.complete === false ? 'partial' as const
    : result?.coverage?.complete === true ? 'complete' as const : undefined;
  if (materialRead) {
    const data = result?.data, range = data?.coverage, page = Number.isSafeInteger(data?.page) && data.page > 0 ? data.page : undefined;
    if (status === 'done') {
      const detail = range?.end > range?.start ? page ? `读到了第 ${page} 页的这一段文字。` : '读到了这一段原文。'
        : page ? '已到这一页文字的末尾。' : '这份文件里没有文字。';
      return { title, status, detail, ...(coverage ? { coverage } : {}) };
    }
    if (result?.status === 'partial' && data?.needsVisual && range?.total === 0)
      return { title, status, coverage: 'partial', detail: '这一页没有取出可读文字，可以打开原页看看。' };
  }
  const explanations: Record<string, string> = {
    partial: '这一步只取得了部分内容，还需要继续核对。', stale: '这份内容已有变化，需要按当前版本核对。',
    forbidden: '这次没有取得相应资料的使用许可。', unsupported: '当前来源不能完成这一步，可以换一种做法。',
    not_connected: '这个来源还没有连上。', not_queried: '这份资料这次还没有查到。',
    unknown: '目前还不能确认这一步的结果。', conflict: '原来的内容刚有变化，需要先核对当前版本。',
    needs_confirmation: '这一步还需要你决定。', outcome_unknown: '还没有确切结果，先核对原来的操作。',
    reconciling: '正在核对原来的操作结果。', cancellation_unknown: '还没有收到撤回的确切结果。',
    cannot_cancel: '这一步目前不能直接撤回，可以先查看实际结果。', failed: '这一步没有完成，已有内容仍在。',
    failed_confirmed: '这一步没有完成，已有内容仍在。', unresolved: '这一步还没有得到可确认的结果。',
    dispatching: '这一步还在办理。', cancel_requested: '已经提出撤回，正在等实际结果。',
  };
  const detail = status === 'blocked' ? explanations[String(result?.status)] || '这一步还没有完成。' : undefined;
  return { title, status, ...(detail ? { detail } : {}), ...(coverage ? { coverage } : {}) };
}

function failedStepDisplay(title: string, error: unknown): NonNullable<Step['userFacing']> {
  const code = error instanceof HarnessError ? error.code : '';
  const detail = /material_integrity|material_reference_changed/.test(code) ? '原文件与当时不同，可以重新选择要看的那一份。'
    : /material.*range|quote.*range/.test(code) ? '所指的位置超出了原文，可以回到原页重新选择。'
      : code === 'material_not_sent' ? '这份文件还没有随消息送出，可以先把它带到对话里。'
      : /forbidden|scope|privacy/.test(code) ? '这次没有取得所需资料的使用许可，可以回原处确认使用范围。'
      : /material|source/.test(code) ? '目前不能打开这处原文，可以回原来的位置重新选择。'
      : /revision|conflict|changed/.test(code) ? '原来的内容刚有变化，请先核对当前版本。'
        : '这一步还没完成，已经可用的内容仍在。';
  return { title, status: 'blocked', detail };
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
      title = formatToolStepTitle(name, raw, capability => this.context.store.runtime.broker.describe(capability)?.displayName);
    signal.throwIfAborted();
    this.context.step({ id, title, status: 'running', userFacing: { title, status: 'running' } });
    let requestedArguments: unknown;
    try {
      if (raw.length > toolArgumentCharacterLimit(name))
        throw new HarnessError('input_budget', '这次填写的内容太长了，可以缩短这一份后再继续，原本要办的事不必删掉。');
      const args = JSON.parse(raw);
      requestedArguments = redactCredentialValues(args);
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
        const visual = this.run.toolImages && [...this.run.toolImages].reverse()
          .find(image => image.id === (result as any).data.observationId && !image.toolCallId);
        if (visual) visual.toolCallId = toolCallId;
      }
      signal.throwIfAborted();
      const status = (result as any)?.status;
      // A reviewed read owner can distinguish this delivered page from the
      // remaining global coverage. Missing sources and business partials do
      // not receive this mark; raw status/coverage/continuation stay intact.
      // Reading an older saved page can finish without refreshing its source.
      const deliveredReaderPage = name === 'look_up' && (result as any)?.delivery?.kind === 'page'
        && (result as any)?.delivery?.complete === true;
      // A ready route has finished its calculation even when entrance/access
      // conditions keep its knowledge coverage partial. Keep that original
      // result intact; this only describes whether this tool step finished.
      const route = (result as any)?.data;
      const calculatedMapRoute = status === 'partial' && (result as any)?.sourceId === 'map:local'
        && (name === 'map_route' || name === 'look_up' && args.capability === 'map.route')
        && route?.schemaVersion === 'map-route/v2' && route.status === 'ready';
      const stepStatus: Step['status'] = [
        'failed', 'forbidden', 'unsupported', 'not_connected', 'unknown', 'conflict', 'needs_confirmation',
        'not_queried', 'failed_confirmed', 'outcome_unknown', 'unresolved', 'dispatching', 'reconciling',
        'cancel_requested', 'cancellation_unknown', 'cannot_cancel',
      ].includes(status) || ['partial', 'stale'].includes(status) && !deliveredReaderPage && !calculatedMapRoute ? 'blocked' : 'done';
      const userFacing = toolStepDisplay(title, stepStatus, result, name === 'look_up' && args.capability === 'materials.read');
      this.context.step({
        id,
        title,
        status: stepStatus,
        detail: userFacing.detail,
        userFacing,
      });
      const identified = toolCallId ? result && typeof result === 'object' && !Array.isArray(result)
        ? { ...result, observationId: toolCallId } : { data: result, observationId: toolCallId } : result;
      // Keep the normal JSON projection (including toJSON values), then
      // redact decoded fields without changing quotes or field boundaries.
      let finalResult = redactCredentialValues(JSON.parse(JSON.stringify(identified)));
      if (name === 'read_evidence' && this.run.pack && typeof args.id === 'string'
        && !['failed', 'forbidden', 'unsupported', 'not_connected', 'unknown', 'stale', 'conflict'].includes((result as any)?.status))
        finalResult = this.context.store.runtime.context.recordEvidenceRead(this.run.pack, result, finalResult, args.id,
          this.specs().some(tool => tool.function.name === 'restore_collaboration'));
      if (name === 'search_context' && this.run.pack)
        finalResult = this.context.store.runtime.context.recordSearchEvidenceRead(this.run.pack, result, finalResult);
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
            ? name === 'present_view' ? '这次还没准备好画面。' : '这次还没拿到可用结果。'
            : error instanceof z.ZodError
              ? '这次有几处没填对，下面留着位置和需要的内容。'
              : error instanceof SyntaxError
                ? requestedArguments === undefined
                  ? '这次的参数没能读开，整理成完整 JSON 后可以继续。'
                  : '这次有一段返回内容没能读开，还没有拿到可用结果。'
                : '这一步没有完成。';
      const userFacing = failedStepDisplay(title, error);
      this.context.step({ id, title, status: 'blocked', detail: userFacing.detail, userFacing });
      const diagnosticExplanation = error instanceof HarnessError && error.diagnostic
        ? redactCredentials(error.diagnostic.explanation) : undefined;
      const programAttempt = name === 'present_view' && requestedArguments !== null && typeof requestedArguments === 'object'
        && !Array.isArray(requestedArguments) && Object.hasOwn(requestedArguments, 'program');
      const failedResult = {
        status:
          error instanceof HarnessError && /forbidden|scope|approval/.test(error.code)
            ? 'forbidden'
            : 'failed',
        error: detail,
        code: error instanceof HarnessError || error instanceof ProviderError ? error.code : 'invalid_request',
        ...(error instanceof ProviderError ? {
          retry: '这次模型没给出可用结果，已经拿到且仍可用的内容可以接着处理。若这一步涉及实际修改，先沿原动作看看结果，再决定怎么继续。',
        } : {}),
        ...(error instanceof HarnessError && error.diagnostic ? {
          diagnostic: { rejectedDimensions: error.diagnostic.rejectedDimensions, explanation: diagnosticExplanation!.slice(0, 500),
            ...(error.diagnostic.expansion ? { expansion: error.diagnostic.expansion } : {}),
            ...(error.diagnostic.depth ? { depth: error.diagnostic.depth } : {}),
            ...(error.diagnostic.expression ? { expression: error.diagnostic.expression } : {}),
            ...(error.diagnostic.component ? { component: error.diagnostic.component } : {}),
            ...(error.diagnostic.input ? { input: error.diagnostic.input } : {}),
            ...(error.diagnostic.previous ? { previous: error.diagnostic.previous } : {}) },
          retry: error.code.startsWith('interactive_') || error.diagnostic.input || error.diagnostic.previous
            ? (programAttempt ? '这份稿还没发表，下面的批注留着具体缺口。' : '')
              + '先把当前这一处接好；沿原作续改时，仍用那份原稿的来源和版本。已有说明够用就能继续改，缺哪部分再展开相应做法。新的可用部分做好以后，也能接回眼前的交流。'
            : '这份理解还没保存，批注留下了缺口。可以对照原话、当时的条件和期限继续整理，说不准的先留着；眼前的问题仍可以先好好回答。',
        } : {}),
        ...(error instanceof z.ZodError ? {
          fields: error.issues.slice(0, 12).map(issue => ({ path: issue.path.join('.'), code: issue.code, requirement: parameterRequirement(issue) })),
          ...(this.allSpecs().some(spec => spec.function.name === name) ? { usage: { tool: USE_TOOL, arguments: { name } } } : {}),
          retry: '下面留着没填对的位置和需要的内容，完整用法也有入口可看。修好后可以接着办；若刚才涉及实际修改，先核对原动作的结果。',
        } : {}),
      };
      (this.run.observations ||= []).push({ tool: name, requestedArguments, result: failedResult, ...(toolCallId ? { toolCallId } : {}) });
      const programDiagnostic = error instanceof HarnessError ? error.diagnostic : undefined;
      if ((programAttempt || programDiagnostic?.expansion || programDiagnostic?.depth || programDiagnostic?.expression || programDiagnostic?.component || programDiagnostic?.input || programDiagnostic?.previous) && this.run.pack) {
        const receipt = this.run.pack.receipt;
        receipt.interactiveProgramDiagnostics = [...(receipt.interactiveProgramDiagnostics || []), {
          stepId: id, ...(toolCallId ? { toolCallId } : {}),
          rejectionCode: error instanceof HarnessError && /^[a-z][a-z0-9_]{0,79}$/.test(error.code)
            ? error.code : error instanceof z.ZodError ? 'invalid_program_envelope' : 'program_rejected',
          ...(programDiagnostic?.expansion ? { expansion: structuredClone(programDiagnostic.expansion) } : {}),
          ...(programDiagnostic?.depth ? { depth: structuredClone(programDiagnostic.depth) } : {}),
          ...(programDiagnostic?.expression ? { expression: structuredClone(programDiagnostic.expression) } : {}),
          ...(programDiagnostic?.component ? { component: structuredClone(programDiagnostic.component) } : {}),
          ...(programDiagnostic?.input ? { input: structuredClone(programDiagnostic.input) } : {}),
          ...(programDiagnostic?.previous ? { previous: structuredClone(programDiagnostic.previous) } : {}),
          explanationTruncated: (diagnosticExplanation?.length || 0) > 500,
        }].slice(-8);
        this.context.store.runtime.repo.saveReceipt(this.run.pack.contract.scope, receipt);
      }
      return JSON.stringify(failedResult);
    }
  }
  /** Reads any current tool's original contract. Specialized tools call the
   * ordinary execute path; everyday tools keep their direct entry point. */
  private async useTool(raw: string, toolCallId?: string, operationSignal?: AbortSignal): Promise<string> {
    const signal = AbortSignal.any([this.context.signal, this.run.signal, ...(operationSignal ? [operationSignal] : [])]);
    signal.throwIfAborted();
    let requestedArguments: unknown;
    const respond = (result: unknown) => {
      signal.throwIfAborted();
      this.context.store.runtime.policy.validate(this.run.ingress.contract.scope);
      const safeResult = redactCredentialValues(result);
      (this.run.observations ||= []).push({ tool: USE_TOOL, requestedArguments, result: safeResult, ...(toolCallId ? { toolCallId } : {}) });
      return JSON.stringify(safeResult);
    };
    try {
      if (raw.length > toolArgumentCharacterLimit(USE_TOOL)) throw new HarnessError('input_budget', '这次填写的内容太长了，可以缩短这一份后再继续，原本要办的事不必删掉。');
      const request = useToolInput.parse(JSON.parse(raw));
      requestedArguments = redactCredentialValues(request);
      const available = this.allSpecs(), { name } = request;
      if (!name) {
        if (request.arguments !== undefined) throw new HarnessError('tool_name_required', '已经填了要办的内容，还差工具名。可以先用query找用途，或翻一翻目录；找到后把name和arguments一起交来。');
        return respond(deferredToolCatalog(available, request));
      }
      if (request.query !== undefined || request.family !== undefined)
        throw new HarnessError('tool_mode_conflict', '这次同时给了具体工具名和目录查找条件。看用法或办事时保留name；想找工具时保留query或family。');
      const spec = available.find(item => item.function.name === name);
      if (!spec
        && available.some(item => item.function.name === 'look_up')) {
        const capability = this.context.store.runtime.broker.describe(name);
        if (capability) {
          if (request.arguments === undefined)
            return this.execute('look_up', JSON.stringify({ source: 'capability', capability: name, describeOnly: true }), toolCallId, signal);
          return respond({ status: 'failed', code: 'capability_entry_required',
            error: capability.effect === 'read'
              ? '这是一份资料的读取方式，要办的内容已经保留在下面的入口里，沿look_up继续就好。'
              : '这项会修改实际安排，沿原行动入口继续办理；下面可以先看它的完整用法。',
            usage: { tool: 'look_up', arguments: { source: 'capability', capability: name, describeOnly: true } },
            ...(capability.effect === 'read' ? { continuation: { tool: 'look_up', arguments: {
              source: 'capability', capability: name, arguments: request.arguments,
            } } } : {}),
          });
        }
      }
      if (spec && request.arguments === undefined) return respond({ status: 'schema', name, description: spec.function.description,
        parameters: spec.function.parameters,
        ...(!deferredFamily(name) ? { directTool: name } : {}),
        next: deferredFamily(name)
          ? '这里是这项工具的完整用法。要用时保留同一个name，把需要的内容填进arguments。刚看过而且条件没变，可以直接接着用，也可以继续找别的办法。'
          : `这里是${name}的完整用法，实际使用时从${name}原入口继续，把下面的参数直接填给它即可。已经了解的用法不必反复展开。` });
      if (!spec || !deferredFamily(name)) return respond({ status: 'failed', code: 'tool_unavailable',
        error: spec
          ? '这个工具这次已经直接提供，从原入口继续就好。'
          : '这次的专门目录里没找到这个工具，可以沿下面的入口重新找用途，也可以用look_up找其他资料来源的做法。',
        discover: { tool: USE_TOOL, arguments: {} },
        ...(!spec && available.some(item => item.function.name === 'look_up') ? {
          capabilityCatalog: { tool: 'look_up', arguments: { source: 'capability' } },
        } : {}),
        ...(spec ? { directTool: name, continuation: { tool: name, arguments: request.arguments } } : {}),
      });
      return this.execute(name, JSON.stringify(request.arguments), toolCallId, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      return respond({ status: 'failed', code: error instanceof HarnessError ? error.code : 'invalid_request',
        error: error instanceof HarnessError ? error.message : error instanceof z.ZodError
          ? '这次有几处没填对，下面保留了位置。找工具可以填query或family；已经知道工具名就填name，要办的内容放进arguments。'
          : '这次的参数没有读开，整理成完整JSON后，可以从同一个入口继续。',
        ...(error instanceof z.ZodError ? { fields: error.issues.slice(0, 8).map(issue => ({ path: issue.path.join('.'), code: issue.code, requirement: parameterRequirement(issue) })) } : {}),
        discover: { tool: USE_TOOL, arguments: {} },
      });
    }
  }
}
