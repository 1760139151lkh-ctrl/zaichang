import { randomUUID } from 'node:crypto';
import { HarnessError, type ContextReceipt, type DelegatedTask, type WorkRecord, type WorkSourceRef } from '../../shared/harness';
import type { DeepSeekClient, ModelWireMessage } from '../provider';
import { ToolRegistry, type ToolContext } from '../tools';
import type { RunSession } from './coordinator';
import type { HermesRun } from './hermes';
import { verifyReadPurpose } from './read-purpose';
import type { SourceRestrictionSnapshot } from '../storage/repository';
import { canonical, codePointSlice } from './semantics';
import { mergeProvidedObjectVersions, providedImageVersions } from './evidence-images';
import { delegationEvidenceIndex } from './delegation-evidence';
import memoryInquiryMethod from '../../../prompts/memory-inquiry.md';

type Delegation = NonNullable<ContextReceipt['delegations']>[number];
interface Worker { run: RunSession; task: DelegatedTask; registry: ToolRegistry; metadata: Delegation; sourceRestrictions: SourceRestrictionSnapshot; deliveredObservations: Set<string> }
type WorkerReport = { _host_children?: string[]; results?: Record<string, unknown>[] };

function toolWireJSON(content: ModelWireMessage['content']): { parsed: true; value: unknown } | { parsed: false } {
  let text: unknown = content;
  if (Array.isArray(content) && content.length === 1) {
    const part = content[0];
    if (part?.type === 'text' && typeof part.text === 'string' && Object.keys(part).every(key => key === 'type' || key === 'text'))
      text = part.text;
  }
  if (typeof text !== 'string') return { parsed: false };
  try { return { parsed: true, value: JSON.parse(text) }; } catch { return { parsed: false }; }
}

/** Uses the same pinned Hermes child protocol as foreground investigations.
 * The original entrustment supplies authority; workers have read-only subsets
 * and cannot create attention, memory, agenda entries or further workers. */
export class BackgroundDelegation {
  readonly workers = new Map<string, Worker>();
  private authorized: DelegatedTask[] = [];
  private readonly reports = new Map<string, unknown>();
  private readonly opportunity: { id: string; revision: number; bindingId: string; bindingRevision: number };
  private readonly taskVersion: number;
  constructor(private run: RunSession, private context: ToolContext,
    private complete: DeepSeekClient['complete'], private system: string) {
    const prepared = run.pack?.data.opportunity as { opportunity?: WorkRecord; mandate?: WorkRecord } | undefined;
    if (!run.background || !prepared?.opportunity || !prepared.mandate)
      throw new HarnessError('background_context', '这次调查还缺少对应的机会或原来的托付。');
    this.opportunity = { id: prepared.opportunity.id, revision: prepared.opportunity.revision,
      bindingId: prepared.mandate.id, bindingRevision: prepared.mandate.revision };
    this.taskVersion = run.ingress.contract.revision;
  }

  private get runtime() { return this.context.store.runtime; }
  private get pack() {
    if (!this.run.pack) throw new HarnessError('context_missing', '这次调查要用的材料还没准备好。');
    return this.run.pack;
  }
  /** A task may use an old event only through the parent's current, exact
   * authorization quote. The task question itself supplies no extra authority. */
  private permits(ref: WorkSourceRef) {
    const view = this.run.attentionEvidenceViews?.[ref.eventId];
    if (!view) return true;
    const event = this.runtime.repo.evidence(this.run.ingress.contract.scope, ref.eventId);
    return !!event && event.contentVersion === view.contentVersion && ref.contentVersion === view.contentVersion
      && ref.start >= view.sourceStart && ref.end <= view.sourceEnd
      && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
  }
  authorize(tasks: DelegatedTask[], signal = this.run.signal) {
    signal.throwIfAborted(); this.validateParent();
    for (const task of tasks) {
      this.runtime.memoryInquiry.profile(this.run.ingress.contract.scope, task, { permits: ref => this.permits(ref) });
      this.runtime.childScope(this.run, task);
    }
    this.authorized.push(...structuredClone(tasks));
    return { status: 'authorized', meaning: '这几个方向已在原托付范围内，可以由同一 Hermes 并行读资料、作调查；结果会在实际查过之后接回来。' };
  }
  /** Parent-only model-wire aliasing; execution still belongs to the original
   * Hermes delegate hooks below and uses their exact entrustment projection. */
  normalizeAssistant(message: ModelWireMessage, allowedTools: ReadonlySet<string>) {
    this.validateParent();
    return this.runtime.memoryInquiry.normalizeAssistant(this.run.ingress.contract.scope, message,
      { allowedTools, permits: ref => this.permits(ref) });
  }
  /** Optional work may stop without changing the global privacy epoch. */
  private validateParent() {
    this.run.signal.throwIfAborted();
    const settings = this.context.store.settings();
    if (settings.interaction.followup === 'on_request')
      throw new HarnessError('background_paused', '当前已先暂停持续照看，这次调查停在原处。');
    const contract = this.run.ingress.contract, scope = this.runtime.policy.validate(contract.scope);
    this.runtime.attention.expire();
    const current = this.runtime.repo.work(contract.scope, undefined, this.opportunity.id)[0];
    const binding = this.runtime.repo.work(contract.scope, undefined, this.opportunity.bindingId)[0];
    // A successful decision from this same host run may revise the opportunity
    // before Hermes asks for its final response. That exact receipt permits
    // completion; a later pause/change still has a different revision.
    const ownDecision = current && this.run.observations?.flatMap(observation => {
      const result = observation.result as { id?: string; revision?: number; status?: string;
        mandateUpdate?: { id: string; previousRevision: number; revision: number; operation: string } } | undefined;
      return observation.tool === 'decide_help' && result?.id === current.id && result.revision === current.revision
        && result.status === current.status && ['prepared', 'question_ready', 'notification_queued', 'waiting', 'declined'].includes(current.status) ? [result] : [];
    }).at(-1);
    // A material expiry may schedule its next read in the same transaction.
    // Accept only that host receipt's exact predecessor/successor pair. An
    // unrelated edit before or after it must still stop this background run.
    const ownMandateUpdate = ownDecision?.mandateUpdate;
    const ownBindingRevision = !!binding && ownMandateUpdate?.operation === 'material_wakes'
      && ownMandateUpdate.id === binding.id && ownMandateUpdate.previousRevision === this.opportunity.bindingRevision
      && ownMandateUpdate.revision === binding.revision;
    if (contract.revision !== this.taskVersion || !current
      || !(current.revision === this.opportunity.revision && ['candidate', 'waiting'].includes(current.status) || ownDecision)
      || !binding || binding.status !== 'active'
      || binding.revision !== this.opportunity.bindingRevision && !ownBindingRevision
      || this.runtime.attention.rules(contract.scope, binding.id, String((current.data.facts as any)?.objectId || ''), current.id)
        .some(rule => ['pause', 'stop'].includes(String(rule.data.operation))))
      throw new HarnessError('background_changed', '这份托付已暂停、停止或改变，本次没有沿用旧约定下的调查依据。');
    if (ownBindingRevision) this.opportunity.bindingRevision = binding.revision;
    return scope;
  }
  private async validateWorker(worker: Worker) {
    const parent = this.validateParent(), child = this.runtime.policy.validate(worker.run.ingress.contract.scope);
    if ((['sources', 'currentEventIds', 'purposes', 'grants'] as const).some(key =>
      child[key].some(value => !parent[key].includes(value)))
      || (['principalId', 'workspaceId', 'subjectId', 'worldId', 'audience', 'retention'] as const).some(key => child[key] !== parent[key])
      || Date.parse(child.expiresAt) > Date.parse(parent.expiresAt)) return false;
    await this.runtime.refreshDependencies(worker.run);
    this.validateParent(); this.runtime.policy.validate(worker.run.ingress.contract.scope);
    const stopped = this.runtime.repo.sourceRestrictionsChanged(worker.run.ingress.contract.scope,
      worker.sourceRestrictions, worker.run.pack?.receipt.providedEvidenceIds || []);
    const methodChanged = (worker.run.pack?.receipt.personalMethodSources || []).some(source =>
      this.runtime.repo.verifyPersonalMethodSources?.(this.run.ingress.contract.scope, source) !== true);
    const notesChanged = !this.runtime.repo.noteSourcesReadable(this.run.ingress.contract.scope, worker.run.pack?.receipt.noteSources || []);
    const spatialChanged = !this.runtime.repo.spatialSourcesReadable(worker.run.ingress.contract.scope, worker.run.pack?.receipt.spatialSources)
      || !this.runtime.repo.spatialSourcesReadable(this.run.ingress.contract.scope, worker.run.pack?.receipt.spatialSources);
    const releasesChanged = this.runtime.repo.verifyReleaseSources?.(this.run.ingress.contract.scope,
      worker.run.pack?.receipt.releaseSources || [], false, { checked: new Map() }) !== true;
    const programSources = worker.run.pack?.receipt.interactiveProgramSources || [];
    const programsChanged = programSources.length > 0 && this.runtime.repo.verifyInteractiveProgramSources?.(this.run.ingress.contract.scope, programSources) !== true;
    const campusChanged = this.runtime.repo.verifyCampusSensitiveReads?.(this.run.ingress.contract.scope, worker.run.pack?.receipt.campusSensitiveReads || []) !== true;
    const campusSourcesChanged = this.runtime.repo.verifyCampusReadingProofs?.(this.run.ingress.contract.scope, worker.run.pack?.receipt.campusReadingSources || []) !== true;
    const materialNavigationChanged = !this.runtime.repo.materialNavigationSourcesReadable(this.run.ingress.contract.scope,
      worker.run.pack?.receipt.materialNavigationSources);
    return !stopped && !methodChanged && !notesChanged && !spatialChanged && !releasesChanged && !programsChanged && !campusChanged
      && !campusSourcesChanged && !materialNavigationChanged && !worker.run.dependencyNotices?.length;
  }
  private fail(worker: Worker) { worker.metadata.status = 'failed'; }
  private failedRow(id: string) {
    return { hostTaskId: id, status: 'failed', summary: '', error: '这项调查还没有取得当前可用的完整结果；本次也没有带入先前结论。' };
  }
  private usableReport(rows: Record<string, unknown>[] | undefined, id: string) {
    const matches = rows?.filter(row => row.hostTaskId === id) || [];
    const row = matches.length === 1 ? matches[0] : undefined;
    const completed = (row?.status === 'completed' || row?.status === 'produced')
      && (row?.exit_reason === undefined || row?.exit_reason === 'completed');
    return !!row && completed && row.truncated !== true && !row.error
      && typeof row.summary === 'string' && !!row.summary.trim() && row.summary.trim() !== '(empty)';
  }
  private approvedReport(wire: ModelWireMessage): WorkerReport | undefined {
    if (wire.role !== 'tool') return;
    const approved = wire.tool_call_id ? this.reports.get(wire.tool_call_id) as WorkerReport | undefined : undefined;
    const decoded = toolWireJSON(wire.content);
    // Registration protects the report even if its body loses the marker or
    // can no longer be decoded. Accept only the exact host-owned hand-off.
    if (approved) {
      if (!decoded.parsed || !Array.isArray(approved._host_children) || canonical(approved) !== canonical(decoded.value))
        throw new HarnessError('child_report_changed', '这份调查说明和刚才实际收到的内容没有对上，先留在一旁；原来的材料还在。');
      return approved;
    }
    const value = decoded.parsed ? decoded.value as { _host_children?: unknown } | null : null;
    if (Array.isArray(value?._host_children))
      throw new HarnessError('child_report_changed', '这份调查说明和刚才实际收到的内容没有对上，先留在一旁；原来的材料还在。');
  }
  /** The host calls this before and after each child model/tool boundary. */
  async validateBoundary(id?: string) {
    this.validateParent();
    if (!id) return;
    const worker = this.workers.get(id);
    if (!worker) throw new HarnessError('child_missing', '这项调查不在本次已约定的任务里。');
    if (!await this.validateWorker(worker)) {
      this.fail(worker);
      throw new HarnessError('stale_child_result', '调查可读的范围或所依据的材料有了变化，这次请求没有继续使用先前的调查依据。');
    }
  }

  hooks(registry: ToolRegistry): NonNullable<HermesRun['children']> {
    return {
      authorize: async (args, _callId, signal) => {
        const response = JSON.parse(await registry.execute('delegate', JSON.stringify(args), undefined, signal));
        if (response.status !== 'authorized') throw new HarnessError('delegation_rejected', response.error || response.reason || '这次调查还没有对应到已经约定的范围。');
      },
      open: async (task, signal = this.run.signal) => {
        signal.throwIfAborted(); this.validateParent();
        const key = (value: DelegatedTask) => canonical([value.title, value.instruction, value.sources || [], value.currentEvidenceIds || [], value.memoryInquiry || null]);
        const index = this.authorized.findIndex(value => key(value) === key(task));
        if (index < 0) throw new HarnessError('child_scope', '这个调查方向与刚才约定的任务内容尚未对应上。');
        this.authorized.splice(index, 1);
        const runtime = this.runtime, contract = this.run.ingress.contract, id = randomUUID();
        runtime.memoryInquiry.profile(contract.scope, task, { permits: ref => this.permits(ref) });
        const handle = runtime.childScope(this.run, task), scope = runtime.policy.validate(handle);
        // Keep the parent's sliced authority view. Never replace it with an
        // unrestricted database read of the original entrustment message.
        const events = scope.currentEventIds.flatMap(eventId => {
          const event = this.run.events.find(value => value.id === eventId);
          return event ? [event] : [];
        });
        const deliveredObservationIds = new Set<string>();
        const childRun: RunSession = { ...this.run, events, observations: [], deliveredObservationIds, pack: undefined,
          sessionId: id, sceneSessionId: undefined, image: undefined, toolImages: [],
          methodNotes: [], controlUsages: undefined, dependencyNotices: undefined,
          privacyResult: undefined, releaseArtifacts: undefined, episodeId: undefined,
          budgetOwner: this.run, toolCalls: 0, modelCalls: 0,
          ingress: { ...this.run.ingress, text: task.instruction, authoredText: task.instruction,
            attachment: undefined, controlProposal: undefined, releaseBrief: undefined,
            priorReleaseArtifacts: undefined, priorReleasedDraft: undefined,
            projectionSources: scope.sources.filter(source => ['local-agenda', 'campus:local', 'campus:zju-account'].includes(source)),
            threadContextAllowed: false, requiresReadPurpose: true,
            contract: { ...contract, id, scope: handle, actionMode: 'read' } },
        };
        const sourceRestrictions = runtime.repo.sourceRestrictionSnapshot(handle);
        childRun.pack = await runtime.context.compile(childRun.ingress, events, signal, [], false, id);
        signal.throwIfAborted(); this.validateParent(); runtime.policy.validate(handle);
        const budget = this.pack.receipt.budget, initial = childRun.pack.receipt.budget;
        budget.readBytes += initial.readBytes; budget.estimatedTokens += initial.estimatedTokens;
        childRun.pack.receipt.budget = budget;
        const childRegistry = new ToolRegistry({ ...this.context, runtimeSession: childRun, child: true,
          userText: task.instruction,
          verifyReadPurpose: async (request, operationSignal = this.run.signal) => {
            await this.validateBoundary(id);
            const verdict = await verifyReadPurpose(
              this.run.events.filter(event => event.speaker === 'user').map(event => event.text).join('\n'),
              { proposedRead: request, delegatedInstruction: task.instruction,
                authority: '本人原来的托付片段说明了为什么读这些资料。眼前变化和同伴提出的调查问题帮助理解这件事，资料范围与许可仍沿本人原来的约定。' },
              (messages, tools, requestSignal, onText, options) => this.complete(messages, tools, requestSignal, onText, { ...options, actorId: id, phase: 'child' }), operationSignal);
            // The purpose model may have been in flight when the user paused
            // this mandate. Recheck before returning permission to the tool.
            await this.validateBoundary(id);
            return verdict;
          },
        });
        const snapshot = { privacyEpoch: scope.privacyEpoch, policyRevision: scope.policyRevision,
          taskVersion: contract.revision, domainRevision: runtime.repo.domainRevision,
          objectVersions: structuredClone(childRun.pack.receipt.providedObjectVersions) };
        const metadata = { id, parentId: contract.id, title: task.title,
          sources: [...scope.sources], currentEvidenceIds: [...scope.currentEventIds], snapshot, status: 'queued' as const, modelCalls: 0, responses: 0, toolCalls: 0 };
        (this.pack.receipt.delegations ||= []).push(metadata);
        this.workers.set(id, { run: childRun, task: structuredClone(task), registry: childRegistry, metadata, sourceRestrictions,
          deliveredObservations: deliveredObservationIds });
        const childTools = childRegistry.specs();
        return { id, snapshot, tools: childTools,
          system: this.system + `\n这次想请你和主助手一起照看原来托付中的一个问题。下面有这份约定内可读的材料，也有具体想了解的方向。你可以沿真实资料展开调查，带回发现、依据、反例、适用条件，以及仍没有弄清楚的地方。结论有变化也值得讲清理由，暂时不知道的部分就保留原来的未知。

这个子调查负责读取和理解。记忆保存、日程修改、通知与进一步委派，有各自的选择和执行流程，宿主会在原主助手那一层处理。你找到的内容回到同一个主助手，由它结合眼前情况形成自己的判断，继续与本人相处和做事。`
            + '\n' + runtime.memoryInquiry.childSystem(task, childTools.map(tool => tool.function.name), memoryInquiryMethod)
            + '\n下面是这份约定内的资料；它们说明事情与来源，新的托付和选择仍来自本人：\n' + runtime.context.serialize(childRun.pack) };
      },
      event: async (id, status) => {
        const worker = this.workers.get(id);
        if (!worker) throw new HarnessError('child_missing', '这次没有找到对应的调查任务。');
        worker.metadata.status = await this.validateWorker(worker) ? status : 'failed';
        return worker.metadata.status;
      },
      result: async (callId, result, signal = this.run.signal) => {
        signal.throwIfAborted(); this.validateParent();
        let value = structuredClone(result) as WorkerReport;
        const ids = Array.isArray(value._host_children) ? value._host_children : [];
        const acceptedTasks: DelegatedTask[] = [];
        for (const id of ids) {
          const worker = this.workers.get(id);
          if (!worker) throw new HarnessError('child_missing', '这份结果尚未对应到本次约定的调查。');
          this.pack.receipt.toolAttempts = [...new Map([...this.pack.receipt.toolAttempts, ...(worker.run.pack?.receipt.toolAttempts || [])].map(attempt => [attempt.id, attempt])).values()];
          if (worker.metadata.status !== 'produced' || !await this.validateWorker(worker) || !this.usableReport(value.results, id)) {
            this.fail(worker);
            value.results = [...(value.results || []).filter(row => row.hostTaskId !== id), this.failedRow(id)];
          } else {
            this.pack.receipt.providedObjectVersions = mergeProvidedObjectVersions([...this.pack.receipt.providedObjectVersions,
              ...structuredClone(worker.run.pack?.receipt.providedObjectVersions || [])], null);
            const evidenceIndex = delegationEvidenceIndex(this.runtime.repo, this.run, worker.run, worker.deliveredObservations, this.pack);
            value.results = value.results?.map(row => row.hostTaskId === id ? { ...row, evidenceIndex } : row);
            acceptedTasks.push(worker.task);
          }
        }
        value = this.runtime.memoryInquiry.parentHandoff(acceptedTasks, value) as typeof value;
        const prior = this.reports.get(callId);
        if (prior && canonical(prior) !== canonical(value))
          throw new HarnessError('child_observation_conflict', '同一份调查回执出现了不同内容，这次冲突的内容没有继续接入。');
        this.reports.set(callId, structuredClone(value));
        (this.run.observations ||= []).push({ tool: 'delegate', toolCallId: callId, result: value });
        return value;
      },
    };
  }

  /** Revalidate at the parent's model boundary, before child text is sent. */
  async consume(messages: ModelWireMessage[]) {
    const ready = new Set<Worker>();
    for (const wire of messages.filter(value => value.role === 'tool')) {
      const report = this.approvedReport(wire);
      if (!report) continue;
      const results = report.results;
      for (const id of report._host_children!) {
        const worker = this.workers.get(String(id));
        if (!worker) throw new HarnessError('child_missing', '这份结果没有对应到本次约定的调查任务。');
        if (worker.metadata.status === 'failed') {
          // A failure can arrive after result() copied a produced report. Only
          // the host's sanitized failure row is safe to send to the parent.
          const row = results?.find(value => value.hostTaskId === id);
          if (JSON.stringify(row) !== JSON.stringify(this.failedRow(String(id))))
            throw new HarnessError('stale_child_result', '这项调查的依据或状态已不再适用，本次没有继续把旧报告正文交给主助手。');
          continue;
        }
        if (!await this.validateWorker(worker)) {
          this.fail(worker);
          throw new HarnessError('stale_child_result', '接回这份结果之前，调查依据已发生变化，先前结果已停止使用。');
        }
        if (worker.metadata.status === 'consumed') continue;
        if (worker.metadata.status !== 'produced') throw new HarnessError('child_incomplete', '这项调查还没完成，完整报告目前还没有接回来。');
        if (!this.usableReport(results, String(id)))
          throw new HarnessError('child_incomplete', '这里还缺这项调查实际完成的那份完整报告，暂时没有把其中的读取算作主助手已参考的材料。');
        ready.add(worker);
      }
    }
    // Earlier workers may have waited while later ones were checked. Recheck
    // these source families synchronously before adopting any selected report.
    for (const worker of ready) if (!this.runtime.repo.materialNavigationSourcesReadable(worker.run.ingress.contract.scope,
      worker.run.pack?.receipt.materialNavigationSources)
      || !this.runtime.repo.materialNavigationSourcesReadable(this.run.ingress.contract.scope, worker.run.pack?.receipt.materialNavigationSources)
      || !this.runtime.repo.spatialSourcesReadable(worker.run.ingress.contract.scope, worker.run.pack?.receipt.spatialSources)
      || !this.runtime.repo.spatialSourcesReadable(this.run.ingress.contract.scope, worker.run.pack?.receipt.spatialSources)) {
      this.fail(worker);
      throw new HarnessError('stale_child_result', '接回这份调查之前，原来采用的一处来源已经变化，旧报告没有继续采用。');
    }
    const observations = [...(this.run.observations || [])];
    for (const worker of ready) for (const observation of worker.run.observations || []) {
      if (!observation.toolCallId || !worker.deliveredObservations.has(observation.toolCallId)) continue;
      const previous = observations.find(value => value.toolCallId === observation.toolCallId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(observation))
        throw new HarnessError('child_observation_conflict', '同一个调查观察标识对应了不同内容，这次冲突的内容没有继续接入。');
      if (!previous) observations.push(structuredClone(observation));
    }
    this.run.observations = observations;
    for (const worker of ready) {
        worker.metadata.status = 'consumed';
        (this.run.observations ||= []).push({ tool: 'consumed_child_observations', result: {
          taskId: worker.metadata.id, status: 'consumed', observations: structuredClone((worker.run.observations || [])
            .filter(observation => observation.toolCallId && worker.deliveredObservations.has(observation.toolCallId))),
        } });
        const receipt = worker.run.pack!.receipt;
        this.pack.receipt.providedEvidenceIds = [...new Set([...this.pack.receipt.providedEvidenceIds, ...receipt.providedEvidenceIds])];
        this.pack.receipt.providedSourceIds = [...new Set([...(this.pack.receipt.providedSourceIds || []), ...(receipt.providedSourceIds || [])])];
        if (receipt.historicalAssertionVersions?.length) this.pack.receipt.historicalAssertionVersions = [...new Map([
          ...(this.pack.receipt.historicalAssertionVersions || []), ...receipt.historicalAssertionVersions,
        ].map(version => [version.id + ':' + version.revision, version])).values()];
        this.runtime.context.recordLearningProcesses(this.pack, receipt.learningProcessVersions || []);
        this.runtime.context.recordWorkSourceBindings(this.pack, receipt.workSourceBindings || []);
        this.runtime.context.recordPlanningProvenance(this.pack, receipt.planningProvenance || []);
        this.runtime.context.recordReflectiveLetterSources(this.pack, receipt.reflectiveLetterSources || []);
        this.runtime.context.recordAssistantWorkSources(this.pack, receipt.assistantWorkSources || []);
        this.runtime.context.recordReleaseSources(this.pack, receipt.releaseSources || []);
        this.runtime.context.recordPersonalMethodSources(this.pack, receipt.personalMethodSources || []);
        this.runtime.context.recordNoteSources(this.pack, receipt.noteSources || []);
        this.runtime.context.recordSpatialSources(this.pack, receipt.spatialSources || []);
        this.runtime.context.recordImageSourceVersions(this.pack, providedImageVersions(receipt));
        this.runtime.context.recordCampusSensitiveReads(this.pack, receipt.campusSensitiveReads || []);
        this.runtime.context.recordCampusSourceProofs(this.pack, receipt.campusReadingSources || [], !!receipt.campusReadingIncomplete);
        this.runtime.context.recordInteractiveProgramSources(this.pack, receipt.interactiveProgramSources || []);
        this.runtime.context.recordMaterialNavigationSources(this.pack, receipt.materialNavigationSources || []);
    }
  }

  /** Record what really reached this worker; a final unread tool result is
   * still an observation, but cannot be advertised as investigated evidence. */
  async recordDeliveredEvidence(id: string, messages: ModelWireMessage[]) {
    const worker = this.workers.get(id);
    if (!worker || !await this.validateWorker(worker)) throw new HarnessError('stale_child_result', '这项调查或它的资料来处已不再对应当前约定，先前结果没有继续交接。');
    for (const message of messages) {
      if (message.role !== 'tool' || !message.tool_call_id) continue;
      const wire = toolWireJSON(message.content);
      if (!wire.parsed) continue;
      if ((worker.run.observations || []).some(observation => observation.toolCallId === message.tool_call_id
        && canonical(observation.result) === canonical(wire.value))) {
        worker.deliveredObservations.add(message.tool_call_id);
        (worker.run.deliveredObservationIds ||= new Set()).add(message.tool_call_id);
      }
    }
  }

  /** Only observations from the exact approved report in the actual parent
   * request may become eligible after that provider request succeeds. */
  async deliveredObservationIds(messages: ModelWireMessage[]) {
    const ids = new Set<string>();
    for (const wire of messages) {
      const report = this.approvedReport(wire);
      if (!report) continue;
      for (const id of report._host_children!) {
        const worker = this.workers.get(String(id));
        if (!worker || worker.metadata.status !== 'consumed') continue;
        if (!await this.validateWorker(worker))
          throw new HarnessError('stale_child_result', '主助手读到这份材料之前，调查依据发生了变化，本次没有把旧观察算作主助手新收到的材料。');
        for (const observation of worker.run.observations || [])
          if (observation.toolCallId && worker.deliveredObservations.has(observation.toolCallId)) ids.add(observation.toolCallId);
      }
    }
    return [...ids];
  }
}
