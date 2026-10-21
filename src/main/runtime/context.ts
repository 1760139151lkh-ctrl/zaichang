import { randomUUID } from 'node:crypto';
import { sourceContextGuidance } from '../../shared/source-context';
import type { ScopeHandle } from '../../shared/harness';
import type {
  Assertion,
  AssistantWorkSource,
  InteractiveProgramSource,
  InitialContextComposition,
  ContextContract,
  ContextPack,
  EvidenceBundle,
  EvidenceEvent,
  Need,
  NeedResult,
  PlanningMaterialProvenance,
  TypedValue,
  WorkRecord,
  WorkSourceBinding,
  WorkSourceRef,
} from '../../shared/harness';
import { always, HarnessError, interactiveProgramSourceSchema, planningMaterialProvenanceSchema } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel, IngressDecision } from './policy';
import type { CapabilityBroker, CapabilityResult } from '../capabilities/broker';
import type { DomainService } from '../storage/domains';
import type { WorkService } from './work';
import { canonical, dateInZone, dayBounds, evaluateCondition } from './semantics';
import { redactCredentials } from './redaction';
import type { ModelWireMessage, ProviderMetadata } from '../provider';
import type { ProviderReceipt } from '../../shared/harness';
import { usageCost } from './model-usage';
import type { Completion } from '../provider';
import { projectMapModelResult } from './map-model-view';
import { projectCampusModelResult } from './campus-model-view';
import { expandRecallBundle, fuseRecallMethods, matchesVisibleQuery, multiQueryRecall, projectHistoricalEvidence, recallQueries, type EvidenceProjection, type RecallOptions } from '../memory/retrieval';
import { buildContinuityIndex } from './continuity';
import { EvidenceBrowser } from '../memory/browse';
import type { InvestigationFrontierService, InvestigationSession } from './investigation-frontier';
import type { SemanticRecallService, SemanticRecallResult } from '../memory/semantic-recall';
import type { PersonalMethodSources } from '../../shared/personal-method';
import type { CampusSensitiveRead } from '../../shared/campus-academic';
import type { NoteSourceProof } from '../../shared/notes-source';

export interface LifeContinuityContext {
  data: Record<string, unknown>;
  records: WorkRecord[];
  bindings: WorkSourceBinding[];
  learningProcessVersions?: { id: string; revision: number }[];
}
/** Scheduling only: supplied by the current foreground host's typed work
 * reference. It grants no source read and is not a model/Bridge parameter. */
export interface InitialContextOptions {
  currentWorkFirst?: true;
  /** Typed foreground navigation only; a match is selected exclusively from
   * the existing permitted, completed history window. This grants no read. */
  currentProgramMessageId?: string;
}

function grams(text: string) {
  const p = Array.from(text.toLowerCase()),
    out = new Set<string>();
  for (let i = 0; i < p.length - 1; i++)
    if (!/[\s，。！？、；：]/.test(p[i] + p[i + 1])) out.add(p[i] + p[i + 1]);
  return out;
}
function lexical(query: string, text: string) {
  const a = grams(query),
    b = grams(text);
  let score = 0;
  for (const g of a) if (b.has(g)) score++;
  return score;
}
export class ContextCompiler {
  private readonly evidenceBrowser = new EvidenceBrowser();
  private providerMetadata?: ProviderMetadata;
  private continuityRefresh?: () => void;
  private lifeContinuity?: (ingress: IngressDecision, sessionId: string, signal: AbortSignal) => Promise<LifeContinuityContext | undefined>;
  constructor(
    readonly repo: KernelRepository,
    readonly policy: PolicyKernel,
    readonly broker: CapabilityBroker,
    readonly domains: DomainService,
    readonly work: WorkService,
    readonly semanticRecall?: SemanticRecallService,
  ) {}
  /** Bind only non-secret protocol facts; payloads and credentials never enter the receipt. */
  setProviderMetadata(metadata?: ProviderMetadata) {
    this.providerMetadata = metadata
  }
  setContinuityRefresh(refresh: () => void) {
    this.continuityRefresh = refresh;
  }
  setLifeContinuity(provider: NonNullable<ContextCompiler['lifeContinuity']>) {
    this.lifeContinuity = provider;
  }
  /** The main model chooses additional evidence; no word list creates needs. */
  initialNeeds(_contract: ContextContract, _text: string): Need[] { return []; }
  async compile(
    ingress: IngressDecision, currentEvents: EvidenceEvent[], signal: AbortSignal,
    additionalNeeds: Need[] = [], acquire = false, sessionId?: string, options: InitialContextOptions = {},
  ): Promise<ContextPack> {
    signal.throwIfAborted();
    const contract = ingress.contract, scope = this.policy.validate(contract.scope);
    const currentWorkFirst = options.currentWorkFirst === true && !scope.child && scope.audience === 'self';
    // A hypothetical continuation can refer to what this same user just said
    // in this thread. Read only that transcript, never their ambient profile,
    // and never override explicit UI/source restrictions.
    const canReadHistory = this.policy.can(contract.scope, 'evidence:read');
    const historyScope = ingress.threadContextAllowed && canReadHistory ? this.policy.hostScope({ sources: ['current', 'history:self'], subjectId: scope.principalId, worldId: 'real', purposes: scope.purposes, audience: 'self', grants: ['evidence:read'], retention: scope.retention, infer: false }) : contract.scope;
    const historyCandidates = sessionId && canReadHistory && (!ingress.requiresReadPurpose || ingress.threadContextAllowed) ? this.repo.conversationHistory(historyScope, sessionId, currentEvents.map(e => e.id), ingress.threadContextAllowed ? 6 : 12) : [];
    // This repository window contains only complete, currently readable
    // messages. Preserve the nearest help and the exact typed origin without
    // guessing relevance or treating a completed reply as a fulfilled promise.
    const assistantHistory = historyCandidates.filter(message => message.role === 'assistant');
    const recentHelp = assistantHistory.at(-1);
    const programOrigin = assistantHistory.find(message => message.id === options.currentProgramMessageId);
    const protectedAssistantIds = new Set([recentHelp?.id, programOrigin?.id].filter((id): id is string => !!id));
    const history = historyCandidates;
    const historyProjection = (provided: typeof history) => {
      const ids = new Set(provided.map(message => message.id));
      const historyIndex = assistantHistory.filter(message => !ids.has(message.id) && !protectedAssistantIds.has(message.id)).map(message => ({ id: message.id, role: message.role, createdAt: message.createdAt,
        codePoints: Array.from(message.content).length, bodyProvided: false,
        read: { tool: 'read_assistant_history', arguments: { id: message.id, offset: 0, limit: 1600 } } }));
      const carryover = new Map<string, { identities: ('recent_assistant_help' | 'current_program_origin')[]; messageId: string;
        bodyProvided: boolean; status: 'provided_complete_reply' | 'not_in_permitted_completed_window';
        read: { tool: 'read_assistant_history'; arguments: { id: string; offset: number; limit: number } } }>();
      for (const [identity, id] of [['recent_assistant_help', recentHelp?.id], ['current_program_origin', options.currentProgramMessageId]] as const) {
        if (!id) continue;
        const prior = carryover.get(id);
        if (prior) { prior.identities.push(identity); continue; }
        const bodyProvided = protectedAssistantIds.has(id) && ids.has(id);
        carryover.set(id, { identities: [identity], messageId: id, bodyProvided,
          status: bodyProvided ? 'provided_complete_reply' : 'not_in_permitted_completed_window',
          read: { tool: 'read_assistant_history', arguments: { id, offset: 0, limit: 1600 } } });
      }
      return { historyIndex, historyCarryover: [...carryover.values()],
        historyCoverage: { scope: 'permitted_recent_conversation_window', userBodiesProvided: provided.filter(message => message.role === 'user').length,
          assistantBodiesProvided: provided.filter(message => message.role === 'assistant').length,
          assistantBodiesDeferred: assistantHistory.filter(message => !ids.has(message.id)).length, moreMayExist: true,
          meaning: '本合法窗口中的用户与助手正文完整提供；最近帮助及所指原作按historyCarryover标身份，重合不重复。消息完整不证明承诺或动作已办。窗口之外仍可能有条件或约定，需要时沿原read入口核对；窗口外地址不表示正文已读或现行授权。' } };
    };
    const historyOrganization = currentWorkFirst ? { ...historyProjection(history),
      contextOrganization: { mode: 'current_work_first',
        meaning: '当前真实原话与所指作品优先理解；既有合法前情照常提供，不因材料数量省略。来源、用途、版本和撤销仍逐项复核。' } } : {};
    const recentObservations = sessionId && history.length && canReadHistory && !ingress.requiresReadPurpose && scope.sources.includes('history:self')
      ? this.repo.sessionExternalObservations(contract.scope, sessionId, contract.now) : [];
    const observationSummaries = recentObservations.map(event => ({ id: event.id, sourceId: event.sourceId, authority: event.authority, receivedAt: event.receivedAt, text: event.text,
      meaning: '与本对话关联的近期外部观察；只证明所述观察，不代表用户确认、喜欢或授权后续行动。' }));
    const currentMatter = sessionId && canReadHistory && !ingress.requiresReadPurpose && contract.enhancements?.currentMatter !== false && scope.sources.includes('work:self') ? this.repo.currentMatter(contract.scope, sessionId) : null;
    const continuity = !ingress.requiresReadPurpose ? buildContinuityIndex(this.repo, contract, sessionId, this.continuityRefresh) : undefined;
    const preparedMaterials = continuity?.preparedMaterials || [], openThreads = continuity?.openThreads || [], planningIntents = continuity?.planningIntents || [];
    const continuityData: Record<string, unknown> = { ...(preparedMaterials.length ? { preparedMaterials } : {}), ...(openThreads.length ? { openThreads } : {}),
      ...(planningIntents.length ? { planningIntents } : {}),
      ...(continuity ? { continuityCoverage: continuity.coverage } : {}) };
    const discovered = this.broker.discover(contract.scope);
    const capabilityDirectory = { items: discovered.slice(0, 24).map(item => ({ name: item.name, sourceId: item.sourceId, displayName: item.displayName,
      description: item.description, connection: item.connection, effect: item.effect, connected: item.connection.connected,
      executableInThisTurn: item.connection.connected && (item.effect === 'read' || contract.actionMode !== 'respond') })), more: discovered.length > 24,
      meaning: '仅是许可范围内的非敏感能力说明，没有读取资料或执行动作；存在、已连接、本轮允许执行、实际完成是不同事实。用look_up的capability目录继续搜索、分页或获取输入schema。' };
    const sourceContextMeaning = sourceContextGuidance(...currentEvents.map(event => event.sourceContext), ...history.map(message => message.sourceContext));
    let life: LifeContinuityContext | undefined;
    const initial = { current: ingress.authoredText, attachments: currentEvents.filter(e => e.speaker === 'external'), history, ...historyOrganization, sourceContextMeaning,
      ...(observationSummaries.length ? { recentObservations: observationSummaries } : {}), currentMatter, ...continuityData, capabilityDirectory };
    if (this.lifeContinuity && sessionId && !ingress.requiresReadPurpose && scope.retention === 'purpose_scoped') {
      const offered = await this.lifeContinuity(ingress, sessionId, signal);
      signal.throwIfAborted(); this.policy.validate(contract.scope);
      if (offered) {
        life = offered;
        Object.assign(continuityData, offered.data);
      }
    }
    const text = canonical({ ...initial, ...continuityData });
    const estimatedTokens = Math.ceil(Array.from(text).length / 1.4);
    // The repository physically selected these permitted history bodies.
    // Deferring their model projection does not refund that byte charge.
    const readBytes = Math.max(Buffer.byteLength(text), currentWorkFirst
      ? Buffer.byteLength(canonical({ ...initial, ...continuityData, history: historyCandidates })) : 0);
    const evidenceIds = [...new Set([...currentEvents.map(e => e.id), ...history.filter(m => m.role === 'user').map(m => m.id), ...recentObservations.map(e => e.id), ...(continuity?.providedEvidenceIds || [])])];
    const receipt: ContextPack['receipt'] = {
      mechanismUses: { prefetch: 0, currentMatter: Number(!!currentMatter), repairRejudge: 0, closure: 0 },
      id: randomUUID(), runId: contract.id, contractRevision: contract.revision,
      policyRevision: contract.policyRevision, privacyEpoch: contract.privacyEpoch,
      watermarks: this.repo.watermarks(), providedEvidenceIds: evidenceIds,
      providedSourceIds: [...new Set([...currentEvents.map(e => e.sourceId), ...(history.length ? ['history:self'] : []), ...recentObservations.map(e => e.sourceId), ...(continuity?.providedSourceIds || []), ...(preparedMaterials.length || openThreads.length || planningIntents.length || currentMatter ? ['work:self'] : [])])],
      providedObjectVersions: [...new Map([...currentEvents.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })), ...recentObservations.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })), ...(continuity?.providedObjectVersions || []), ...(currentMatter ? [{ id: currentMatter.id, revision: currentMatter.revision, kind: 'work' as const }, ...currentMatter.optionPlaces.map(option => ({ id: option.id, revision: option.revision, kind: 'work' as const }))] : [])]
        .map(ref => [ref.kind + ':' + ref.id, ref])).values()],
      needResults: [], excludedReasonCounts: Object.fromEntries(contract.excludedReasons.map(reason => [reason, 1])),
      providerVersion: this.providerMetadata ? `${this.providerMetadata.protocol}/${this.providerMetadata.protocolVersion}` : 'unknown',
      ...(this.providerMetadata ? { provider: { ...this.providerMetadata, limits: { ...this.providerMetadata.limits } } } : {}),
      toolAttempts: [], campusSensitiveReads: [], coverage: 'conditional', budget: { estimatedTokens, readBytes },
    };
    const pack: ContextPack = {
      contract, bundles: [], assertions: [], evidence: currentEvents, needs: [], receipt,
      currentText: ingress.authoredText,
      data: {
        scope: { subject: scope.subjectId, world: scope.worldId, purpose: contract.purpose, audience: scope.audience, memoryMode: contract.memoryMode, retention: contract.retention },
        time: { now: contract.now, timeZone: contract.timeZone,
          local: new Intl.DateTimeFormat('zh-CN', { timeZone: contract.timeZone, dateStyle: 'full', timeStyle: 'long', hour12: false }).format(new Date(contract.now)),
          meaning: 'now中的Z表示UTC，local是宿主按timeZone计算的本地时刻；不能把UTC钟面数字标成本地时间。' },
        situation: { asOf: contract.now, timeZone: contract.timeZone, versions: this.repo.watermarks(),
          currentStatements: currentEvents.filter(event => event.speaker === 'user').map(event => ({ evidenceId: event.id, version: event.contentVersion })),
          coverage: { calendar: 'not_queried', campus: 'not_queried', location: 'not_queried', weather: 'not_queried', energy: 'unknown' },
          read: '按当前问题发现并读取直接相关的原来源，单源资料可沿其原读取入口取得；确需跨源理解安排、承诺与目标时，再用situation.read汇合单次不超过31天的情境，planning.preview用于检验实际方案。未查询、未覆盖、确实为空和当前可用精力分别判断。当前原话与更正优先于旧摘要，必要时展开原始条件。' },
        history, ...historyOrganization, ...(observationSummaries.length ? { recentObservations: observationSummaries } : {}), ...(ingress.threadContextAllowed ? { historyUse: '仅作为同一对话里用户已提供的背景理解当前假设；不代表假设已在现实发生，也未读取本人长期画像或其他会话。' } : {}), currentSources: currentEvents.map(e => ({ id: e.id, sourceId: e.sourceId, authority: e.authority, text: e.text,
          ...(e.sourceContext ? { sourceContext: e.sourceContext } : {}) })),
        sourceContextMeaning,
        currentMatter, ...continuityData, capabilityDirectory,
        currentFacts: {}, correctionOverlay: [], workState: [], needs: [],
        coverage: receipt.coverage,
        limitations: [],
      },
    };
    if (sessionId) {
      const ids = history.map(message => message.id);
      this.recordWorkSourceBindings(pack, this.repo.conversationWorkSourceBindings(historyScope, sessionId, ids));
      this.recordPlanningProvenance(pack, this.repo.conversationPlanningProvenance(historyScope, sessionId, ids));
      this.recordHistoricalAssertions(pack, this.repo.conversationHistoricalAssertionVersions(historyScope, sessionId, ids));
      this.recordLearningProcesses(pack, this.repo.conversationLearningProcessVersions(historyScope, sessionId, ids));
      this.recordReflectiveLetterSources(pack, this.repo.conversationReflectiveLetterSources(historyScope, sessionId, ids));
      this.recordAssistantWorkSources(pack, this.repo.conversationAssistantWorkSources(historyScope, sessionId, ids));
      this.recordPersonalMethodSources(pack, this.repo.conversationPersonalMethodSources(historyScope, sessionId, ids));
      this.recordNoteSources(pack, this.repo.conversationNoteSources(historyScope, sessionId, ids));
      this.recordCampusSensitiveReads(pack, this.repo.conversationCampusSensitiveReads(historyScope, sessionId, ids));
      this.recordInteractiveProgramSources(pack, this.repo.conversationInteractiveProgramSources(historyScope, sessionId, ids));
    }
    if (currentMatter) this.recordWorkSources(pack, [currentMatter.id, ...currentMatter.optionPlaces.map(option => option.id)]
      .flatMap(id => this.repo.work(contract.scope, undefined, id)));
    if (life) {
      this.recordWorkSources(pack, life.records);
      this.recordWorkSourceBindings(pack, life.bindings);
      if (life.learningProcessVersions?.length) this.recordLearningProcesses(pack, life.learningProcessVersions);
    }
    this.recordInitialComposition(pack, 'compiler');
    if (acquire && additionalNeeds.length) await this.expand(pack, additionalNeeds, signal);
    return pack;
  }
  /** One bounded numeric projection in the existing receipt. This does not
   * alter read accounting, source adoption, or the model's budget. */
  recordInitialComposition(pack: ContextPack, stage: InitialContextComposition['stage'] = 'ready_for_main') {
    const serialized = this.serialize(pack), data = JSON.parse(serialized) as Record<string, unknown>;
    const costs = (value: unknown) => { const text = canonical(value); return {
      bytes: Buffer.byteLength(text), estimatedTokens: Math.ceil(Array.from(text).length / 1.4),
    }; };
    const categories: { category: InitialContextComposition['groups'][number]['category']; keys: readonly string[] }[] = [
      { category: 'current_originals', keys: ['currentSources', 'currentRequest'] },
      { category: 'history', keys: ['history', 'historyIndex', 'historyCarryover', 'historyCoverage', 'historyUse', 'volatileConversationHistory'] },
      { category: 'observations', keys: ['recentObservations'] },
      { category: 'continuity', keys: ['currentMatter', 'preparedMaterials', 'openThreads', 'planningIntents', 'continuityCoverage'] },
      { category: 'capabilities', keys: ['capabilityDirectory'] },
      { category: 'focused_work', keys: ['currentInteractive', 'currentInteractiveUnavailable', 'currentNote', 'currentNoteUnavailable',
        'currentLetter', 'currentLetterUnavailable', 'currentStudy', 'currentCuriosity', 'currentCuriosityUnavailable',
        'currentCompanion', 'currentRehearsal', 'currentRehearsalUnavailable', 'currentCampusReference', 'currentSelection', 'currentSelectionUnavailable'] },
      { category: 'presentation_guidance', keys: ['availableScenes', 'presentationLibrary', 'interactiveProgram', 'currentInteractivePrograms'] },
    ];
    const assigned = new Set<string>();
    const groups: InitialContextComposition['groups'] = categories.map(({ category, keys }) => {
      const entries = keys.filter(key => Object.hasOwn(data, key)).map(key => { assigned.add(key); return [key, data[key]]; });
      return { category, ...(entries.length ? costs(Object.fromEntries(entries)) : { bytes: 0, estimatedTokens: 0 }) };
    });
    groups.push({ category: 'other', ...costs(Object.fromEntries(Object.entries(data).filter(([key]) => !assigned.has(key)))) });
    const history = Array.isArray(data.history) ? data.history as { role?: unknown }[] : [];
    const organization = pack.data.contextOrganization as { mode?: unknown } | undefined;
    const currentWorkFirst = organization?.mode === 'current_work_first';
    const historyCoverage = pack.data.historyCoverage as { assistantBodiesDeferred?: number } | undefined;
    pack.receipt.initialComposition = { strategy: currentWorkFirst ? 'current_work_first' : 'standard', stage, groups,
      serialized: { bytes: Buffer.byteLength(serialized), estimatedTokens: Math.ceil(Array.from(serialized).length / 1.4) },
      accounted: { readBytes: pack.receipt.budget.readBytes, estimatedTokens: pack.receipt.budget.estimatedTokens },
      history: { userBodies: history.filter(message => message.role === 'user').length,
        assistantBodies: history.filter(message => message.role === 'assistant').length,
        deferredAssistantBodies: historyCoverage?.assistantBodiesDeferred ?? (Array.isArray(data.historyIndex) ? data.historyIndex.length : 0) },
      deferred: { ambientContinuity: false, recentObservations: false, capabilityDescriptions: false } };
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Second layer: model-activated, scoped candidates; original search remains independent. */
  includeVerifiedConversation(pack: ContextPack, sessionId: string, currentIds: string[], verifiedMaterialScope?: ScopeHandle) {
    const targetScope = this.policy.validate(pack.contract.scope), readScope = verifiedMaterialScope || pack.contract.scope;
    const scope = this.policy.validate(readScope);
    if ((!verifiedMaterialScope && !['relevant', 'session_only'].includes(pack.contract.memoryMode)) || targetScope.audience !== 'self' || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real' || !scope.sources.includes('history:self') || !this.policy.can(readScope, 'evidence:read'))
      throw new HarnessError('history_scope', '本轮范围不允许读取先前对话。');
    const recent = this.repo.conversationHistory(readScope, sessionId, currentIds, 5);
    const anchor = pack.contract.enhancements?.prefetch === false ? null
      : this.repo.conversationAnchor(readScope, sessionId, pack.currentText, [...currentIds, ...recent.map(message => message.id)]);
    const history = anchor ? [anchor, ...recent] : recent;
    const currentMatter = scope.sources.includes('work:self') && pack.contract.enhancements?.currentMatter !== false ? this.repo.currentMatter(readScope, sessionId) : null;
    const observations = this.repo.sessionExternalObservations(readScope, sessionId, pack.contract.now)
      .filter(event => !pack.receipt.providedEvidenceIds.includes(event.id));
    const recentObservations = observations.map(event => ({ id: event.id, sourceId: event.sourceId, authority: event.authority, receivedAt: event.receivedAt, text: event.text,
      meaning: '与本对话关联的近期外部观察；只证明所述观察，不代表用户确认、喜欢或授权后续行动。' }));
    const sourceContextMeaning = sourceContextGuidance(...pack.evidence.map(event => event.sourceContext), ...history.map(message => message.sourceContext));
    const text = canonical({ history, currentMatter, recentObservations, sourceContextMeaning }), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
    pack.data.history = history;
    pack.data.sourceContextMeaning = sourceContextMeaning;
    pack.data.currentMatter = currentMatter;
    if (recentObservations.length) pack.data.recentObservations = recentObservations;
    pack.data.historyUse = '经当前原话核清用途，只恢复本对话近期材料；不读取其他对话或人物画像，不把先前方案自动视为已选择。当前事项索引为空也不抹去已准入的同对话用户原话：其中若有具体选项/地点名称，可按当前问题重新查公开稳定ID，不能要求用户重报；若旧助手具体路线不在本轮材料里，不能自称记得它，但可把新查到的相关一段标为“若你指这段”的条件比较，另有所指再问关键区别。本轮明确排除或纠正优先。前情中每个人的事实仍各属其主体；共同讨论的地点候选不证明本人或他人实际位置，不能把本人的偏好或约定套给别人。';
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...history.filter(message => message.role === 'user').map(message => message.id), ...observations.map(event => event.id)])];
    if (history.length || observations.length) pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...(history.length ? ['history:self'] : []), ...observations.map(event => event.sourceId)])];
    pack.receipt.providedObjectVersions.push(...observations.map(event => ({ id: event.id, revision: event.contentVersion, kind: 'evidence' as const })));
    if (currentMatter) {
      pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'work:self'])];
      pack.receipt.providedObjectVersions.push({ id: currentMatter.id, revision: currentMatter.revision, kind: 'work' }, ...currentMatter.optionPlaces.map(option => ({ id: option.id, revision: option.revision, kind: 'work' as const })));
      if (pack.receipt.mechanismUses) pack.receipt.mechanismUses.currentMatter = 1;
      this.recordWorkSources(pack, [currentMatter.id, ...currentMatter.optionPlaces.map(option => option.id)]
        .flatMap(id => this.repo.work(readScope, undefined, id)));
    }
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    this.recordWorkSourceBindings(pack, this.repo.conversationWorkSourceBindings(readScope, sessionId, history.map(message => message.id)));
    this.recordPlanningProvenance(pack, this.repo.conversationPlanningProvenance(readScope, sessionId, history.map(message => message.id)));
    this.recordHistoricalAssertions(pack, this.repo.conversationHistoricalAssertionVersions(readScope, sessionId, history.map(message => message.id)));
    this.recordLearningProcesses(pack, this.repo.conversationLearningProcessVersions(readScope, sessionId, history.map(message => message.id)));
    this.recordReflectiveLetterSources(pack, this.repo.conversationReflectiveLetterSources(readScope, sessionId, history.map(message => message.id)));
    this.recordAssistantWorkSources(pack, this.repo.conversationAssistantWorkSources(readScope, sessionId, history.map(message => message.id)));
    this.recordPersonalMethodSources(pack, this.repo.conversationPersonalMethodSources(readScope, sessionId, history.map(message => message.id)));
    this.recordNoteSources(pack, this.repo.conversationNoteSources(readScope, sessionId, history.map(message => message.id)));
    this.recordCampusSensitiveReads(pack, this.repo.conversationCampusSensitiveReads(readScope, sessionId, history.map(message => message.id)));
    this.recordInteractiveProgramSources(pack, this.repo.conversationInteractiveProgramSources(readScope, sessionId, history.map(message => message.id)));
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return { status: history.length || observations.length ? 'fresh' : 'not_found', count: history.length, observationCount: observations.length };
  }

  /** Production search may add local semantic discoveries. The existing sync
   * lexical/browse entry remains available to callers which do not request it. */
  async prefetchWithSemantic(pack: ContextPack, query: string, at = pack.contract.now, offset = 0, limit = 8, hardOffset = 0,
    sourceProjection?: EvidenceProjection, recall: RecallOptions = {},
    investigation?: { service: InvestigationFrontierService; session: InvestigationSession; readCoordinates?: 'projection' | 'source' },
    options: { signal: AbortSignal; projectRanges?: (event: EvidenceEvent) => readonly { start: number; end: number }[];
      projectionKey?: string; coordinateBase?: (event: EvidenceEvent) => number;
      sourceRelatedAllowed?: boolean } = { signal: new AbortController().signal }) {
    options.signal.throwIfAborted();
    const scope = this.policy.validate(pack.contract.scope);
    if (!Number.isFinite(Date.parse(at))) throw new HarnessError('invalid_time', '检索时间不合法。');
    if (recall.mode !== 'browse' && (recall.cursor || recall.sourceIds || recall.receivedFrom || recall.receivedBefore))
      throw new HarnessError('browse_mode_required', '来源、收到时间和浏览游标只用于mode=browse。');
    if ((recall.mode === 'browse' || recall.mode === 'scan') && (recall.semanticSnapshot || recall.semanticOffset !== undefined || recall.semanticWindowCursor))
      throw new HarnessError('semantic_search_required', '语义候选分页只用于普通search；原文浏览游标仍走原入口。');
    if (recall.semanticWindowCursor && (offset || recall.semanticSnapshot || recall.semanticOffset))
      throw new HarnessError('semantic_window_invalid', '下一候选窗口从offset=0开始，不能混用旧排名或窗口内位置。');
    let semantic: SemanticRecallResult | undefined;
    if (this.semanticRecall && (!recall.mode || recall.mode === 'search')
      && (offset === 0 || !!recall.semanticSnapshot)
      && (scope.sources.includes('history:self') || scope.sources.includes('profile:self')) && this.policy.can(pack.contract.scope, 'evidence:read')) {
      semantic = await this.semanticRecall.search(pack.contract.scope, recallQueries(query, recall.relatedQueries), {
        signal: options.signal, projectRanges: options.projectRanges, projectionKey: options.projectionKey,
        maxRows: pack.contract.budget.maxRows, offset: recall.semanticOffset || 0, limit: 51, rankingId: recall.semanticSnapshot,
        windowCursor: recall.semanticWindowCursor,
        onReadBytes: bytes => {
          options.signal.throwIfAborted(); this.policy.validate(pack.contract.scope);
          pack.receipt.budget.readBytes += bytes;
          this.repo.saveReceipt(pack.contract.scope, pack.receipt);
        },
      });
      options.signal.throwIfAborted(); this.policy.validate(pack.contract.scope);
    }
    return this.prefetch(pack, query, at, offset, limit, hardOffset, sourceProjection, recall, investigation,
      semantic ? { result: semantic, coordinateBase: options.coordinateBase } : undefined, options);
  }
  prefetch(pack: ContextPack, query: string, at = pack.contract.now, offset = 0, limit = 8, hardOffset = 0,
    sourceProjection?: EvidenceProjection, recall: RecallOptions = {},
    investigation?: { service: InvestigationFrontierService; session: InvestigationSession; readCoordinates?: 'projection' | 'source' },
    semantic?: { result: SemanticRecallResult; coordinateBase?: (event: EvidenceEvent) => number },
    discovery: { sourceRelatedAllowed?: boolean;
      projectRanges?: (event: EvidenceEvent) => readonly { start: number; end: number }[] } = {}) {
    const scope = this.policy.validate(pack.contract.scope), time = Date.parse(at);
    if (!Number.isFinite(time)) throw new HarnessError('invalid_time', '检索时间不合法。');
    if (recall.mode !== 'browse' && (recall.cursor || recall.sourceIds || recall.receivedFrom || recall.receivedBefore))
      throw new HarnessError('browse_mode_required', '来源、收到时间和浏览游标只用于mode=browse；未按普通关键词检索忽略这些限制。');
    if (recall.mode === 'browse') {
      if (offset || hardOffset) throw new HarnessError('browse_cursor_required', '原文浏览用cursor继续，不使用offset分页。');
      if (!this.policy.can(pack.contract.scope, 'evidence:read'))
        return { status: 'forbidden', originals: [], reason: '本轮不允许读取原文。' };
      const seed = investigation?.service.resolveBrowse(investigation.session, pack.contract.scope, recall.cursor);
      const { value, position } = this.evidenceBrowser.pageWithPosition(this.repo, pack.contract.scope, recall,
        Math.max(1, Math.min(limit, 20)), sourceProjection, pack.contract.budget.maxRows, seed, investigation?.readCoordinates,
        discovery.projectRanges ? event => {
          const ranges = discovery.projectRanges!(event);
          return ranges.length === 1 ? ranges[0] : undefined;
        } : undefined);
      value.originals = value.originals.map(original => {
        const address = position.originals.find(ref => ref.eventId === original.id && ref.contentVersion === original.contentVersion);
        const sourceRelated = address && this.sourceRelatedRead(pack, [{ eventId: original.id,
          contentVersion: original.contentVersion, start: address.sourceStart,
          end: address.sourceStart + address.previewEnd }], discovery.sourceRelatedAllowed);
        return { ...original, ...(sourceRelated ? { sourceRelated } : {}) };
      });
      const serialized = canonical(value), bytes = Buffer.byteLength(serialized), tokens = Math.ceil(Array.from(serialized).length / 1.4);
      pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...value.originals.map(event => event.id)])];
      pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...value.originals.map(event => event.sourceId)])];
      const versions = value.originals.map(event => ({ id: event.id, revision: event.contentVersion, kind: 'evidence' as const }));
      pack.receipt.providedObjectVersions = [...new Map([...pack.receipt.providedObjectVersions, ...versions].map(version => [version.kind + ':' + version.id, version])).values()];
      pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
      pack.data.retrievedContext = value;
      this.repo.saveReceipt(pack.contract.scope, pack.receipt);
      // A budget-admitted page is only a host candidate. ToolRegistry stages
      // it after the final, safe result has a real Hermes tool-call identity.
      investigation?.service.rememberBrowse(value, position);
      return value;
    }
    if (!scope.sources.includes('history:self') && !scope.sources.includes('profile:self'))
      return { status: 'forbidden', bundles: [], reason: '本轮资料范围不包括个人历史和记忆。' };
    if (recall.mode === 'scan' && !scope.sources.includes('profile:self'))
      return { status: 'forbidden', bundles: [], reason: '本轮范围不允许浏览个人理解候选。' };
    const queries = recallQueries(query, recall.relatedQueries);
    const options = { at, verified: true };
    const scan = recall.mode === 'scan';
    const multi = !scan && queries.length > 1 ? multiQueryRecall(this.repo, pack.contract.scope, queries, at, offset, limit, hardOffset,
      scope.sources.includes('profile:self'), scope.sources.includes('history:self')) : undefined;
    const scanPage = scan ? this.repo.assertions(pack.contract.scope, { ...options, offset, limit: limit + 1 }) : [];
    const soft = !multi && !scan && scope.sources.includes('profile:self') ? this.repo.lexicalAssertionPage(pack.contract.scope, query, { ...options, strength: 'non_hard', offset, limit }) : { items: [], total: 0 };
    const hard = !multi && !scan && scope.sources.includes('profile:self') ? this.repo.lexicalAssertionPage(pack.contract.scope, query, { ...options, strength: 'hard', offset: hardOffset, limit: 8 }) : { items: [], total: 0 };
    // Strength controls priority within relevant candidates, not universal
    // applicability. Unrelated hard preferences must not enter every question.
    const selected = scan ? scanPage.slice(0, limit) : multi?.selected || [...hard.items, ...soft.items];
    const bundles = selected.flatMap(assertion => {
      const bundle = expandRecallBundle(this.repo, pack.contract.scope, assertion, at, sourceProjection);
      return bundle ? [bundle] : [];
    });
    const semanticActive = semantic && !semantic.result.restartRequired && ['fresh', 'partial'].includes(semantic.result.status);
    const rawPage = multi ? semanticActive ? multi.rawRanking : multi.raw : !scan && scope.sources.includes('history:self')
      ? this.repo.lexicalEvidence(pack.contract.scope, query, semanticActive ? 51 : limit + 1, semanticActive ? 0 : offset) : [];
    const lexicalRaw = (semanticActive ? rawPage : rawPage.slice(0, limit)).flatMap(original => {
      const historical = projectHistoricalEvidence(this.repo, pack.contract.scope, original, sourceProjection);
      if (!historical) return [];
      if (historical.text === original.text) return [historical];
      // Do not reveal even a search hit solely because the hidden part matched.
      return queries.some(value => matchesVisibleQuery(value, historical.text)) ? [historical] : [];
    });
    const semanticRaw = semanticActive ? semantic.result.items.flatMap(item => {
      const event = this.repo.evidence(pack.contract.scope, item.eventId);
      if (!event || event.contentVersion !== item.contentVersion || !this.repo.availableInferenceRanges(event)
        .some(range => range.start <= item.matchedRange.start && range.end >= item.matchedRange.end)
        || Array.from(event.text).slice(item.startCodePoint, item.endCodePoint).join('') !== item.preview)
        throw new HarnessError('semantic_source_changed', '候选原话的范围已改变，需要从当前来源重新检索。');
      const base = semantic.coordinateBase?.(event) || 0;
      if (item.matchedRange.start < base) throw new HarnessError('semantic_projection_invalid', '候选地址不在当前原文片段内。');
      return [{ id: event.id, contentVersion: event.contentVersion, sourceId: event.sourceId, receivedAt: event.receivedAt,
        authority: event.authority, ...(event.sourceContext ? { sourceContext: event.sourceContext } : {}), text: item.preview, preview: item.preview, previewOnly: true as const, excerptOnly: true,
        use: 'candidate_requires_original_read', restrictions: [] as ReturnType<KernelRepository['historicalEvidence']>['restrictions'],
        sourceRange: { start: item.startCodePoint, end: item.endCodePoint }, matchedRange: item.matchedRange,
        read: { tool: 'read_evidence', arguments: { id: event.id, offset: item.matchedRange.start - base,
          limit: Math.min(1200, item.matchedRange.end - item.matchedRange.start) } }, rankingOnly: true }];
    }) : [];
    const originalRanking = semanticActive ? fuseRecallMethods<(typeof lexicalRaw)[number] | (typeof semanticRaw)[number]>([lexicalRaw, semanticRaw]) : lexicalRaw;
    const selectedRaw = semanticActive ? originalRanking.slice(offset, offset + limit) : lexicalRaw;
    const raw = selectedRaw.map(event => {
      if (!discovery.sourceRelatedAllowed) return event;
      let ref: WorkSourceRef | undefined;
      if ('sourceRange' in event && event.sourceRange) ref = { eventId: event.id,
        contentVersion: event.contentVersion, start: event.sourceRange.start, end: event.sourceRange.end };
      else {
        const original = this.repo.evidence(pack.contract.scope, event.id);
        if (original) {
          const ranges = event.text === original.text ? [{ start: 0, end: Array.from(original.text).length }]
            : discovery.projectRanges?.(original) || [];
          const matching = ranges.filter(range => Array.from(original.text).slice(range.start, range.end).join('') === event.text);
          if (matching.length === 1) ref = { eventId: event.id, contentVersion: event.contentVersion, ...matching[0] };
        }
      }
      const sourceRelated = ref && this.sourceRelatedRead(pack, [ref], true);
      return { ...event, ...(sourceRelated ? { sourceRelated } : {}) };
    });
    const searchRead = (arguments_: Record<string, unknown>) => ({ tool: 'search_context',
      arguments: { ...(!sourceProjection ? { query, relatedQueries: recall.relatedQueries } : {}), ...arguments_ },
      ...(sourceProjection ? { reuseCurrentQuery: true,
        meaning: '受限视图不回显查询文字；保留刚才的query/relatedQueries，复制其余继续参数。' } : {}) });
    // Old wording can be the only search clue. Follow its exact correction link
    // to the current source without reviving the superseded assertion.
    const correctionIds = [...new Set(raw.flatMap(event => event.restrictions.flatMap(restriction => restriction.replacementEventId ? [restriction.replacementEventId] : [])))];
    const correctionFollowups = correctionIds.slice(0, 16).flatMap(id => {
      if (raw.some(event => event.id === id)) return [];
      const event = this.repo.evidence(pack.contract.scope, id);
      const view = event && projectHistoricalEvidence(this.repo, pack.contract.scope, event, sourceProjection);
      return view ? [view] : [];
    });
    const value = { status: bundles.length || raw.length ? 'fresh' : semantic && semantic.result.status !== 'not_found' ? 'partial' : 'not_found', bundles, originals: raw, correctionFollowups,
      sourceContextMeaning: sourceContextGuidance(...raw.map(event => event.sourceContext),
        ...correctionFollowups.map(event => event.sourceContext), ...bundles.flatMap(bundle => bundle.sources.map(event => event.sourceContext))),
      coverage: { candidatesOnly: true, at,
        retrieval: scan ? 'model_candidate_scan' : semanticActive ? 'local_semantic_and_lexical' : queries.length > 1 ? 'model_multi_query_rrf' : 'lexical',
        ...(!sourceProjection ? { queries } : {}),
        nextOffset: scan ? scanPage.length > limit ? offset + limit : null : semanticActive
          ? originalRanking.length > offset + limit || (multi ? multi.nextOffset !== null : soft.total > offset + limit) ? offset + limit : null
          : multi ? multi.nextOffset : soft.total > offset + limit || rawPage.length > limit ? offset + limit : null,
        nextHardOffset: scan ? null : multi ? multi.nextHardOffset : hard.total > hardOffset + 8 ? hardOffset + 8 : null,
        hardTotal: scan ? null : sourceProjection ? bundles.filter(bundle => bundle.assertions[0].strength === 'hard').length : multi?.hardTotal ?? hard.total,
        hardTotalCoverage: scan || sourceProjection ? 'visible_page' : multi ? 'ranking_window' : 'all_candidates',
        ...(semanticActive ? { rankingWindow: { perLexicalQuery: 51, lexicalQueryCount: queries.length, semanticWindow: 51,
          fusion: 'method_heads_then_rrf', lexicalQueriesCollapsed: true,
          candidateWindowOnly: true }, queryContinuations: sourceProjection ? [] : multi?.queryContinuations || [],
          ...(!multi && rawPage.length === 51 ? { lexicalContinuation: searchRead({ mode: 'search', at, offset: 51, hardOffset: 0, limit }) } : {}) }
          : multi ? { rankingWindow: multi.rankingWindow, queryContinuations: sourceProjection ? [] : multi.queryContinuations } : {}),
        vectorSearch: semantic ? { status: semantic.result.status, methodId: semantic.result.methodId,
          rankingId: semantic.result.rankingId, restartRequired: semantic.result.restartRequired,
          ...semantic.result.coverage, indexGap: semantic.result.indexGap,
          ...(semantic.result.nextWindowCursor ? { nextWindow: searchRead({ mode: 'search', at, offset: 0, hardOffset: 0,
            limit, semanticOffset: 0, semanticWindowCursor: semantic.result.nextWindowCursor }) } : {}),
          ...(semantic.result.nextOffset === null || !semantic.result.rankingId ? {} : { read: searchRead({
            mode: 'search', at, offset: 0, hardOffset: 0, limit,
            semanticSnapshot: semantic.result.rankingId, semanticOffset: semantic.result.nextOffset }) }),
          meaning: '本地向量只排候选；查到片段须回原文，索引覆盖不证明条件或语义完整，分数不是真实性。' } : 'not_connected', hardConstraintsSeparate: !scan,
        correctionFollowupsComplete: correctionIds.length <= 16 && correctionIds.every(id => raw.some(event => event.id === id) || correctionFollowups.some(event => event.id === id)),
        guidance: '由模型提出同义、跨语言和必要条件的relatedQueries；零词面重合仍可用mode=scan按页查看合法现行理解。候选未自动判定适用，未命中不证明没有记忆。coverage.read继续合并页，vectorSearch.read继续本窗口语义排名，vectorSearch.nextWindow继续较早候选窗口；lexicalContinuation和多query的queryContinuations保留词法深页。reuseCurrentQuery时沿用刚才的query/relatedQueries并复制其余参数；不把有界窗口当全集。',
        historicalOriginals: '局部更正的原文仍可发现；restrictions所指范围不得当作现行事实，未受影响的内容仍须核对语境。' } };
    if (semanticActive && semantic.result.rankingId && value.coverage.nextOffset !== null)
      Object.assign(value.coverage, { read: searchRead({ mode: 'search',
        at, offset: value.coverage.nextOffset, hardOffset: value.coverage.nextHardOffset || 0, limit,
        semanticSnapshot: semantic.result.rankingId, semanticOffset: recall.semanticOffset || 0 }) });
    const bytes = Buffer.byteLength(canonical(value)), tokens = Math.ceil(Array.from(canonical(value)).length / 1.4);
    pack.assertions = [...new Map([...pack.assertions, ...bundles.flatMap(b => b.assertions)].map(a => [a.id, a])).values()];
    // A semantic preview depends on the exact original range used to derive
    // its rank. Same-version correction/retraction must also stop later reuse.
    this.recordWorkSourceBindings(pack, raw.flatMap(event => 'matchedRange' in event && event.rankingOnly
      ? [this.repo.resolveWorkSourceBinding(pack.contract.scope, [{ eventId: event.id, contentVersion: event.contentVersion,
        start: event.matchedRange.start, end: event.matchedRange.end }])] : []));
    const ids = [...raw.map(e => e.id), ...correctionFollowups.map(e => e.id), ...bundles.flatMap(b => b.sources.map(e => e.id))];
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...ids])];
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...raw.map(e => e.sourceId), ...correctionFollowups.map(e => e.sourceId), ...bundles.flatMap(b => b.sources.map(e => e.sourceId))])];
    const versions = [...pack.assertions.map(a => ({ id: a.id, revision: a.revision, kind: 'assertion' as const })),
      ...raw.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })),
      ...correctionFollowups.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })),
      ...bundles.flatMap(bundle => bundle.sources.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })))];
    pack.receipt.providedObjectVersions = [...new Map([...pack.receipt.providedObjectVersions, ...versions].map(version => [version.kind + ':' + version.id, version])).values()];
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    pack.data.retrievedContext = value;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  }
  prefetchForMatter(pack: ContextPack, matter: WorkRecord, currentText: string) {
    // Opening one matter is not permission to search every personal transcript
    // for words in its title. Only its explicit evidence links are automatic;
    // the agent can request a separate, purpose-checked search if needed.
    if (matter.sourceBinding) return this.prefetchBoundWork(pack, matter);
    const originals = matter.evidenceIds.slice(-4).map(id => this.repo.evidence(pack.contract.scope, id)).filter((event): event is EvidenceEvent => !!event);
    const candidates = { status: originals.length ? 'fresh' : 'not_found', bundles: [], originals,
      coverage: { candidatesOnly: true, at: pack.contract.now, nextOffset: null, nextHardOffset: null, hardTotal: 0,
        vectorSearch: 'not_requested_for_matter_links', automaticScope: 'matter_evidence_links_only' } };
    const value = { ...candidates, matterOriginals: originals, originalCoverage: 'bounded_related_originals',
      meaning: '只自动回读此事项明确关联且当前可读的原文；更广的跨事项检索须另按本轮用途请求。候选仍需判断当前适用性。' };
    const bytes = Buffer.byteLength(canonical(value)), tokens = Math.ceil(Array.from(canonical(value)).length / 1.4);
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...originals.map(event => event.id)])];
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...originals.map(event => event.sourceId)])];
    this.recordWorkSources(pack, [matter]);
    pack.data.retrievedContext = value;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  }
  private prefetchBoundWork(pack: ContextPack, matter: WorkRecord) {
    const fragments = this.repo.readWorkSources(pack.contract.scope, matter);
    this.recordWorkSources(pack, [matter]);
    const offered = fragments.slice(-4), originals: Record<string, unknown>[] = [];
    const address = (fragment: typeof fragments[number], end = fragment.end) => ({ id: fragment.eventId,
      eventId: fragment.eventId, contentVersion: fragment.contentVersion, sourceId: fragment.sourceId,
      sourceRange: { start: fragment.start, end }, boundRange: { start: fragment.start, end: fragment.end }, excerptOnly: true });
    const valueFor = (rows: Record<string, unknown>[]) => ({ status: rows.length ? 'fresh' : 'partial', bundles: [], originals: rows,
      matterOriginals: rows, originalCoverage: 'exact_bound_fragments',
      coverage: { candidatesOnly: true, automaticScope: 'exact_work_source_ranges_only', returned: rows.length,
        totalBoundFragments: fragments.length, complete: fragments.length === rows.length && rows.every((row, index) =>
          (row.sourceRange as { end: number }).end === offered[index].end),
        unread: fragments.filter(fragment => !rows.some(row => row.eventId === fragment.eventId
          && (row.sourceRange as { start: number; end: number }).start === fragment.start
          && (row.sourceRange as { end: number }).end === fragment.end)).map(fragment => {
            const supplied = rows.find(row => row.eventId === fragment.eventId && (row.sourceRange as { start: number }).start === fragment.start);
            const offset = supplied ? (supplied.sourceRange as { end: number }).end : fragment.start;
            return { ...address(fragment), nextOffset: offset,
              read: { tool: 'read_evidence', id: fragment.eventId, offset, limit: Math.min(20000, fragment.end - offset) } };
          }) },
      meaning: '只提供本事项sourceBinding内当前合法的精确原话片段；sourceRange是本次实际正文，boundRange是合法引用原范围，均为原文Unicode坐标。片段不代表全文，未读部分不证明没有条件；必要时按精确入口继续核对。' });
    for (const fragment of offered) {
      originals.push({ ...address(fragment), text: fragment.text });
    }
    const value = valueFor(originals);
    const serialized = canonical(value);
    pack.receipt.budget.readBytes += Buffer.byteLength(serialized);
    pack.receipt.budget.estimatedTokens += Math.ceil(Array.from(serialized).length / 1.4);
    pack.data.retrievedContext = value;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  }
  async expand(pack: ContextPack, needs: Need[], signal: AbortSignal) {
    this.policy.validate(pack.contract.scope);
    for (const need of needs) {
      if (pack.needs.some((n) => n.key === need.key)) continue;
      const result = need.capability
        ? await this.broker.invoke(pack.contract.scope, need.capability, need.args, signal)
        : undefined;
      pack.needs.push({
        id: need.id,
        key: need.key,
        capability: need.capability,
        status: result?.status || 'unknown',
        evidenceIds: [],
        value: result?.data,
        reason: result?.reason || '缺少当前事实',
        fetchedAt: result?.fetchedAt,
      });
      if (result?.data)
        pack.receipt.providedSourceIds = [
          ...new Set([...(pack.receipt.providedSourceIds || []), result.sourceId]),
        ];
    }
    if (pack.needs.some((n) => !['fresh', 'known_absent'].includes(n.status)))
      pack.receipt.coverage = 'conditional';
    pack.receipt.needResults = pack.needs.map((n) => ({ key: n.key, status: n.status }));
    pack.data.needs = pack.needs;
    pack.data.coverage = pack.receipt.coverage;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return pack;
  }
  /** Record the actual endpoint/mode used by a model call without retaining payloads. */
  recordObjects(pack: ContextPack | undefined, records: { id: string; revision: number }[], kind: 'assertion' | 'work' | 'agenda' | 'evidence') {
    if (!pack) return;
    for (const record of records) {
      const previous = pack.receipt.providedObjectVersions.find(value => value.id === record.id && value.kind === kind);
      if (previous) previous.revision = record.revision;
      else pack.receipt.providedObjectVersions.push({ id: record.id, revision: record.revision, kind });
    }
  }
  recordHistoricalAssertions(pack: ContextPack, refs: { id: string; revision: number }[]) {
    if (!this.repo.historicalAssertionsReadable(pack.contract.scope, refs))
      throw new HarnessError('memory_history_changed', '刚读的理解历史依据已改变，旧正文不能继续采用。');
    if (refs.length) pack.receipt.historicalAssertionVersions = [...new Map([
      ...(pack.receipt.historicalAssertionVersions || []), ...refs,
    ].map(ref => [ref.id + ':' + ref.revision, ref])).values()];
  }
  recordLearningProcesses(pack: ContextPack, refs: { id: string; revision: number }[]) {
    if (refs.some(ref => !this.repo.learningProcessReadable(pack.contract.scope, ref.id, ref.revision)))
      throw new HarnessError('learning_process_changed', '刚读的学习过程依据已改变，旧正文不能继续采用。');
    if (refs.length) pack.receipt.learningProcessVersions = [...new Map([
      ...(pack.receipt.learningProcessVersions || []), ...refs,
    ].map(ref => [ref.id + ':' + ref.revision, ref])).values()];
  }
  /** A read address proposes navigation; it does not discover or adopt a work record. */
  private sourceRelatedRead(pack: ContextPack, refs: WorkSourceRef[], allowed = false) {
    if (!allowed || !refs.length || refs.length > 8) return;
    const scope = this.policy.validate(pack.contract.scope);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read')) return;
    try {
      const binding = this.repo.resolveWorkSourceBinding(pack.contract.scope, refs);
      return { tool: 'restore_collaboration', arguments: { type: 'source_related', sourceRefs: binding.refs },
        meaning: '按本次已展示的原文范围寻找已有事项的候选入口；没有读取事项正文、合并事项或恢复活动状态。' };
    } catch (error) {
      if (!(error instanceof HarnessError)) throw error;
    }
  }
  /** Final model-visible evidence reads share the same ledger as capability
   * reads. A preview never enters this path and a withheld result has no read
   * coverage for a later investigation acknowledgement. */
  recordEvidenceRead(pack: ContextPack, raw: unknown, safe: unknown, eventId: string, sourceRelatedAllowed = false): unknown {
    const scope = this.policy.validate(pack.contract.scope);
    const event = this.repo.evidence(pack.contract.scope, eventId)
      || (scope.currentEventIds.includes(eventId) ? pack.evidence.find(value => value.id === eventId) : undefined);
    if (!event) throw new HarnessError('evidence_forbidden', '这段原文的当前读取范围已经改变。');
    const original = raw as { id?: unknown; version?: unknown; text?: unknown; coverage?: { start?: unknown; end?: unknown; total?: unknown };
      projection?: { kind?: unknown; sourceStart?: unknown; sourceEnd?: unknown; originalContentVersion?: unknown } };
    const result = safe as Record<string, unknown>;
    const coverage = original.coverage, projection = original.projection;
    const hasBody = original.id === event.id && original.version === event.contentVersion && typeof original.text === 'string'
      && result.text === original.text && coverage && Number.isSafeInteger(coverage.start) && Number.isSafeInteger(coverage.end)
      && Number.isSafeInteger(coverage.total) && Number(coverage.start) >= 0 && Number(coverage.end) >= Number(coverage.start)
      && Number(coverage.end) <= Number(coverage.total);
    let ranges: { eventId: string; contentVersion: number; start: number; end: number }[] = [];
    if (hasBody) {
      const projected = projection?.kind === 'attention_authorization_quote';
      if (projected && (!Number.isSafeInteger(projection.sourceStart) || !Number.isSafeInteger(projection.sourceEnd)
        || projection.originalContentVersion !== event.contentVersion || Number(projection.sourceStart) < 0
        || Number(projection.sourceEnd) - Number(projection.sourceStart) !== Number(coverage.total)))
        throw new HarnessError('evidence_changed', '原文片段的来源定位已经改变。');
      if (!projected && Number(coverage.total) !== Array.from(event.text).length)
        throw new HarnessError('evidence_changed', '原文长度在读取后发生变化，请重新读取。');
      const start = Number(coverage.start) + (projected ? Number(projection!.sourceStart) : 0);
      const end = Number(coverage.end) + (projected ? Number(projection!.sourceStart) : 0);
      if (Array.from(event.text).slice(start, end).join('') !== original.text)
        throw new HarnessError('evidence_changed', '原文在读取后发生变化，请按当前来源重新读取。');
      if (end > start) ranges = [{ eventId: event.id, contentVersion: event.contentVersion, start, end }];
    }
    const sourceRelated = this.sourceRelatedRead(pack, ranges, sourceRelatedAllowed);
    const value: Record<string, unknown> = { ...result,
      sourceId: typeof result.sourceId === 'string' && result.sourceId ? result.sourceId : event.sourceId,
      ...(event.sourceContext ? { sourceContext: event.sourceContext, sourceContextMeaning: sourceContextGuidance(event.sourceContext) } : {}),
      ...(typeof original.text === 'string' ? { actualReadRanges: ranges } : {}),
      ...(sourceRelated ? { sourceRelated } : {}) };
    const serialized = canonical(value);
    const withheld = value.status === 'unknown';
    const bytes = Math.max(Buffer.byteLength(canonical(raw)), Buffer.byteLength(serialized)),
      tokens = Math.ceil(Array.from(serialized).length / 1.4);
    const budget = pack.receipt.budget;
    budget.readBytes += bytes;
    budget.estimatedTokens += tokens;
    if (withheld) {
      this.repo.saveReceipt(pack.contract.scope, pack.receipt);
      return value;
    }
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, event.id])];
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), event.sourceId])];
    pack.receipt.providedObjectVersions = [...new Map([...pack.receipt.providedObjectVersions,
      { id: event.id, revision: event.contentVersion, kind: 'evidence' as const }]
      .map(version => [version.kind + ':' + version.id, version])).values()];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  }
  /** A title/specification inherits every actual bound source, even when
   * only some of its exact original fragments were expanded for the model. */
  recordWorkSources(pack: ContextPack | undefined, records: Pick<WorkRecord, 'id' | 'revision' | 'sourceBinding'>[]) {
    if (!pack) return;
    const assistantWorkSources = this.repo.workAssistantWorkSources(pack.contract.scope, records);
    this.recordObjects(pack, records, 'work');
    if (records.length) pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'work:self'])];
    this.recordWorkSourceBindings(pack, records.flatMap(record => record.sourceBinding ? [record.sourceBinding] : []));
    this.recordAssistantWorkSources(pack, assistantWorkSources);
  }
  /** History and adopted child reports inherit only exact host source addresses.
   * Ordinary method edits or stops do not rewrite their historical meaning. */
  recordWorkSourceBindings(pack: ContextPack | undefined, bindings: WorkSourceBinding[]) {
    if (!pack || !bindings.length) return;
    if (!this.repo.workBindingsReadable(pack.contract.scope, bindings))
      throw new HarnessError('work_source_changed', '刚读的工作方法或事项原话已改变或停止使用，旧正文不能继续采用。');
    for (const binding of bindings) this.recordSourceBinding(pack, binding);
    pack.receipt.workSourceBindings = [...new Map([...(pack.receipt.workSourceBindings || []), ...bindings]
      .map(binding => [canonical(binding), structuredClone(binding)])).values()];
  }
  recordReflectiveLetterSources(pack: ContextPack | undefined, sources: NonNullable<ContextPack['receipt']['reflectiveLetterSources']>) {
    if (!pack || !sources.length) return;
    if (sources.some(source => !this.repo.verifyReflectiveLetterSources?.(pack.contract.scope, source)))
      throw new HarnessError('letter_source_changed', '来信中一处来由已经变化，先回到现在允许展开的内容。');
    this.recordWorkSourceBindings(pack, sources.map(source => source.binding));
    pack.receipt.reflectiveLetterSources = [...new Map([...(pack.receipt.reflectiveLetterSources || []), ...sources]
      .map(source => [canonical(source), structuredClone(source)])).values()];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Original work addresses support supplied prose or metadata. Recording an
   * address never claims the whole saved chapter was read or acknowledged. */
  recordAssistantWorkSources(pack: ContextPack | undefined, sources: AssistantWorkSource[]) {
    if (!pack || !sources.length) return;
    const combined = this.repo.compactAssistantWorkSources(pack.contract.scope,
      [...new Map([...(pack.receipt.assistantWorkSources || []), ...sources]
        .map(source => [canonical(source), structuredClone(source)])).values()]);
    if (!this.repo.assistantWorkSourcesReadable(pack.contract.scope, combined))
      throw new HarnessError('assistant_work_changed', '刚读的作品或共做页已有一处来由变化，先回原来的页面；旧正文不能继续采用。');
    this.recordWorkSourceBindings(pack, this.repo.assistantWorkSourceBindings(pack.contract.scope, combined));
    pack.receipt.assistantWorkSources = combined;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'history:self'])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Notebook documents remain independent original sources; this records
   * actual delivered ranges without treating their contents as personal facts. */
  recordNoteSources(pack: ContextPack | undefined, sources: NoteSourceProof[]) {
    if (!pack || !sources.length) return;
    const combined = [...new Map([...(pack.receipt.noteSources || []), ...sources]
      .map(source => [canonical(source), structuredClone(source)])).values()];
    if (combined.length > 256) throw new HarnessError('note_source_budget', '这轮采用的独立笔记片段太多，请先保留眼前相关的几段；没有截掉原来源。');
    if (!this.repo.noteSourcesReadable(pack.contract.scope, combined))
      throw new HarnessError('note_source_changed', '这份笔记或它的原版本已不可用，先回当前允许的笔记；旧正文不能继续采用。');
    pack.receipt.noteSources = combined;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'notes:self'])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Actual history/child adoption carries original program addresses. This
   * is dependency metadata, never an assertion that DSL or bound data was read. */
  recordInteractiveProgramSources(pack: ContextPack | undefined, sources: InteractiveProgramSource[]) {
    if (!pack || !sources.length) return;
    const combined = [...new Map([...(pack.receipt.interactiveProgramSources || []), ...sources]
      .map(source => { const checked = interactiveProgramSourceSchema.parse(source); return [canonical(checked), checked] as const; })).values()];
    if (combined.length > 32) throw new HarnessError('interactive_source_budget', '这轮采用的独立交互来源较多，请先继续眼前相关的一份；没有裁掉原来源。');
    if (this.repo.verifyInteractiveProgramSources?.(pack.contract.scope, combined) !== true)
      throw new HarnessError('interactive_source_changed', '刚读的交互作品或它的原来由已经变化，旧内容不能继续采用。');
    pack.receipt.interactiveProgramSources = structuredClone(combined);
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'history:self'])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** Adopt a delivered notebook result and its proof in one transaction, so a
   * rejected range cannot remain in model-visible needs without provenance. */
  recordNoteTool(pack: ContextPack, result: CapabilityResult, capability: string, invocationScopeId: string,
    sources: NoteSourceProof[], modelView: unknown = result) {
    const bytes = Buffer.byteLength(canonical(result)), staged: ContextPack = { ...pack, receipt: structuredClone(pack.receipt),
      needs: structuredClone(pack.needs), data: { ...pack.data } };
    try {
      this.repo.write(() => {
        this.recordTool(staged, result, capability, invocationScopeId, modelView, undefined, true);
        this.recordNoteSources(staged, sources);
      });
      staged.data.needs = staged.needs;
      pack.receipt = staged.receipt; pack.needs = staged.needs; pack.data = staged.data;
    } catch (error) {
      pack.receipt.budget.readBytes += bytes; pack.receipt.coverage = 'blocked';
      try { this.repo.saveReceipt(pack.contract.scope, pack.receipt); } catch (problem) { if (!(problem instanceof HarnessError)) throw problem; }
      throw error;
    }
  }
  /** Carry the original assistance/anchor proof with supplied method prose.
   * A normal method revision does not replace this historical source basis. */
  recordPersonalMethodSources(pack: ContextPack | undefined, sources: PersonalMethodSources[]) {
    if (!pack || !sources.length) return;
    const combined = [...new Map([...(pack.receipt.personalMethodSources || []), ...sources]
      .map(source => [canonical(source), structuredClone(source)])).values()];
    if (combined.some(source => this.repo.verifyPersonalMethodSources?.(pack.contract.scope, source) !== true))
      throw new HarnessError('method_source_changed', '这个方法当时借用的帮助或原话已有变化，先沿现在的来源重新读；旧文字不能继续采用。');
    this.recordWorkSourceBindings(pack, sources.flatMap(source => [
      ...(source.methodBinding ? [source.methodBinding] : []),
      ...(source.workAssistance || []).map(help => help.sourceBinding),
      ...source.anchors.map(anchor => anchor.sourceBinding),
      ...source.assistance.map(assistance => this.repo.resolveWorkSourceBinding(pack.contract.scope, assistance.sourceRefs)),
    ]));
    pack.receipt.personalMethodSources = combined;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  recordCampusSensitiveReads(pack: ContextPack | undefined, reads: CampusSensitiveRead[]) {
    if (!pack || !reads.length) return;
    const combined = [...new Map([...(pack.receipt.campusSensitiveReads || []), ...reads].map(read => [canonical(read), structuredClone(read)])).values()];
    if (this.repo.verifyCampusSensitiveReads?.(pack.contract.scope, combined) !== true)
      throw new HarnessError('campus_purpose_changed', '这份成绩资料不在本轮已核清的用途内，未继续采用旧正文。');
    pack.receipt.campusSensitiveReads = combined;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  /** A sensitive read adopts body and its current-purpose proof together.
   * A failed source/budget admission keeps only its physical read charge. */
  recordCampusTool(pack: ContextPack, result: CapabilityResult, capability: string, invocationScopeId: string,
    reads: () => CampusSensitiveRead[], modelView: unknown = projectCampusModelResult(capability, result), hostRead = false) {
    const bytes = Buffer.byteLength(canonical(result)), staged: ContextPack = { ...pack, receipt: structuredClone(pack.receipt),
      needs: structuredClone(pack.needs), data: { ...pack.data } };
    try {
      this.repo.write(() => {
        this.recordTool(staged, result, capability, invocationScopeId, modelView, undefined, hostRead);
        this.recordCampusSensitiveReads(staged, reads());
      });
      staged.data.needs = staged.needs;
      pack.receipt = staged.receipt; pack.needs = staged.needs; pack.data = staged.data;
    } catch (error) {
      pack.receipt.budget.readBytes += bytes; pack.receipt.coverage = 'blocked';
      try { this.repo.saveReceipt(pack.contract.scope, pack.receipt); } catch (problem) { if (!(problem instanceof HarnessError)) throw problem; }
      throw error;
    }
  }
  recordSourceBinding(pack: ContextPack | undefined, binding: NonNullable<WorkRecord['sourceBinding']>) {
    if (!pack) return;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...binding.sourceIds])];
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...binding.refs.map(ref => ref.eventId)])];
    for (const ref of binding.refs) {
      const previous = pack.receipt.providedObjectVersions.find(value => value.kind === 'evidence' && value.id === ref.eventId);
      if (previous) previous.revision = ref.contentVersion;
      else pack.receipt.providedObjectVersions.push({ id: ref.eventId, revision: ref.contentVersion, kind: 'evidence' });
    }
  }
  recordPlanningAdoption(pack: ContextPack | undefined, value: unknown, record?: Pick<WorkRecord, 'id' | 'revision' | 'sourceBinding'>) {
    const adoption = value as { status?: string; retained?: { work?: { recordVersions: { id: string; revision: number }[] }[];
      boundaries?: { recordVersions: { id: string; revision: number }[] }[] }; attemptBasis?: { sourceBinding: NonNullable<WorkRecord['sourceBinding']> }[] } | undefined;
    if (!pack || !adoption) return;
    if (record?.sourceBinding) {
      const provenance = planningMaterialProvenanceSchema.parse({ intentId: record.id, intentRevision: record.revision,
        sourceBinding: record.sourceBinding, attemptBasis: adoption.attemptBasis || [] });
      this.recordPlanningProvenance(pack, [provenance]);
    }
    if (adoption.status === 'not_checked') return;
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'local-agenda'])];
    for (const attempt of adoption.attemptBasis || []) this.recordSourceBinding(pack, attempt.sourceBinding);
    this.recordObjects(pack, [...(adoption.retained?.work || []), ...(adoption.retained?.boundaries || [])].flatMap(row => row.recordVersions), 'agenda');
  }
  recordPlanningProvenance(pack: ContextPack | undefined, values: PlanningMaterialProvenance[]) {
    if (!pack || !values.length) return;
    for (const value of values) {
      this.recordSourceBinding(pack, value.sourceBinding);
      for (const attempt of value.attemptBasis) this.recordSourceBinding(pack, attempt.sourceBinding);
    }
    pack.receipt.planningProvenance = [...new Map([...(pack.receipt.planningProvenance || []), ...values]
      .map(item => [canonical(item), item])).values()];
  }
  private recordDomainObjects(pack: ContextPack, records: any[]) {
    for (const record of records) {
      if (!record || !Number.isSafeInteger(record.revision) || record.revision < 1
        || ['id', 'sourceId', 'domain', 'institutionId', 'termId'].some(key => typeof record[key] !== 'string' || !record[key])) continue;
      const ref = { kind: 'domain' as const, id: record.id as string, revision: record.revision as number,
        sourceId: record.sourceId as string, domain: record.domain as string,
        institutionId: record.institutionId as string, termId: record.termId as string };
      const previous = pack.receipt.providedObjectVersions.find(value => value.kind === 'domain' && value.id === ref.id
        && value.sourceId === ref.sourceId && value.domain === ref.domain && value.institutionId === ref.institutionId && value.termId === ref.termId);
      if (previous) previous.revision = ref.revision;
      else pack.receipt.providedObjectVersions.push(ref);
    }
  }
  recordModelUsage(pack: ContextPack | undefined, usage: Completion['usage'], phase: string, responseModel?: string,
    failure?: { code: string; requestMaxOutputTokens?: number }) {
    if (!pack) return;
    const cost = usageCost(usage);
    const actualModel = typeof responseModel === 'string' && responseModel.length > 0 && responseModel.length <= 160 ? responseModel : undefined;
    const errorCode = failure && /^[a-zA-Z0-9_.:-]{1,80}$/.test(failure.code) ? failure.code : undefined;
    const requestMaxOutputTokens = failure && Number.isSafeInteger(failure.requestMaxOutputTokens)
      && Number(failure.requestMaxOutputTokens) > 0 ? failure.requestMaxOutputTokens : undefined;
    (pack.receipt.modelUsage ||= []).push({ phase, ...(actualModel ? { responseModel: actualModel } : {}),
      ...(failure ? { status: 'failed' as const, ...(errorCode ? { errorCode } : {}),
        ...(requestMaxOutputTokens !== undefined ? { requestMaxOutputTokens } : {}) } : {}),
      inputTokens: usage?.prompt_tokens ?? null, cachedInputTokens: usage?.prompt_cache_hit_tokens ?? null,
      outputTokens: usage?.completion_tokens ?? null, usdMin: cost?.usdMin ?? null, usdMax: cost?.usdMax ?? null });
    if (actualModel && pack.receipt.provider) pack.receipt.provider.observedResponseModels = [...new Set([
      ...(pack.receipt.provider.observedResponseModels || []), actualModel,
    ])];
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  recordProviderRequest(
    pack: ContextPack | undefined,
    metadata: ProviderMetadata | undefined,
    mode: { thinking: 'enabled' | 'disabled'; strict: boolean; tools: boolean },
  ) {
    if (!pack || !metadata) return;
    const previous = pack.receipt.provider;
    const thinking = previous?.requestModes?.thinking;
    const strict = previous?.requestModes?.strict;
    const provider: ProviderReceipt = {
      ...metadata,
      observedEndpoints: [
        ...new Set([...(previous?.observedEndpoints || []), metadata.endpoint]),
      ],
      ...(previous?.observedResponseModels?.length ? { observedResponseModels: [...previous.observedResponseModels] } : {}),
      capabilities: {
        ...metadata.capabilities,
        modalities: [...metadata.capabilities.modalities],
      },
      limits: {
        ...metadata.limits,
      },
      requestModes: {
        thinking:
          thinking && thinking !== mode.thinking
            ? 'mixed'
            : (thinking || mode.thinking),
        strict: strict !== undefined && strict !== mode.strict ? 'mixed' : (strict ?? mode.strict),
        tools: Boolean(previous?.requestModes?.tools || mode.tools),
      },
    };
    pack.receipt.provider = provider;
    pack.receipt.providerVersion = `${provider.protocol}/${provider.protocolVersion}`;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  recordTool(pack: ContextPack, result: CapabilityResult, capability: string, invocationScopeId = pack.contract.scope.id,
    modelView: unknown = projectCampusModelResult(capability, projectMapModelResult(capability, result)), attemptId?: string, hostRead = false) {
    this.policy.validate(pack.contract.scope);
    const attempt = this.broker.invocations
      .filter((i) => i.scopeId === invocationScopeId && i.capability === capability && (!attemptId || i.id === attemptId))
      .at(-1);
    if (attempt && !pack.receipt.toolAttempts.some(value => value.id === attempt.id))
      pack.receipt.toolAttempts.push({ id: attempt.id, capability, status: result.status, version: attempt.version, cache: attempt.cache });
    const serialized = canonical(result), bytes = Buffer.byteLength(serialized);
    // A multi-leg read records each physical result, but sends one aggregate
    // observation. null means this raw leg adds no separate model message.
    const modelSerialized = modelView === null ? '' : canonical(modelView), tokens = Math.ceil(Array.from(modelSerialized).length / 1.4);
    pack.receipt.budget.readBytes += bytes;
    pack.receipt.budget.estimatedTokens += tokens;
    const modelResult = projectCampusModelResult(capability, projectMapModelResult(capability, result));
    const modelData = modelView && typeof modelView === 'object' && 'data' in modelView
      ? (modelView as CapabilityResult).data : modelResult.data;
    const data = result.data as Record<string, any> | undefined;
    if (capability.startsWith('materials.') && modelData && typeof modelData === 'object') {
      const material = modelData as { source?: any; items?: { source?: any }[] };
      for (const source of [material.source, ...(Array.isArray(material.items) ? material.items.map(item => item.source) : [])]) {
        if (source?.kind !== 'user_selected_file' || typeof source.sourceEventId !== 'string') continue;
        const event = this.repo.evidence(pack.contract.scope, source.sourceEventId);
        if (!event || event.contentVersion !== source.contentVersion)
          throw new HarnessError('material_changed', '文件来源在读取时有了变化，请重新寻找当前原文。');
        const originals = [event, ...(Array.isArray(source.roots) ? source.roots.filter((id: unknown) => typeof id === 'string' && id !== event.id)
          .flatMap((id: string) => { const root = this.repo.evidence(pack.contract.scope, id); return root ? [root] : []; }) : [])];
        pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...originals.map(original => original.id)])];
        pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...originals.map(original => original.sourceId)])];
        this.recordObjects(pack, originals.map(original => ({ id: original.id, revision: original.contentVersion })), 'evidence');
      }
    }
    const recordAgenda = (items: any[]) => this.recordObjects(pack, items.filter(item => item && typeof (item.sourceActionId || item.seriesId || item.id) === 'string')
      .map(item => ({ id: item.sourceActionId || item.seriesId || item.id, revision: item.revision || 1 })), 'agenda');
    if (capability === 'local.agenda.read' && Array.isArray(data?.items)) recordAgenda(data.items);
    if (capability === 'planning.replan' && data?.record) {
      this.recordWorkSources(pack, [data.record]);
      this.recordPlanningAdoption(pack, data.adoptionEvidence, data.record);
    }
    if (['planning.draft', 'planning.replan', 'planning.compare', 'situation.read'].includes(capability) && data?.campusCalendar?.sourceId === 'campus:zju-account')
      pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), data.campusCalendar.sourceId])];
    if (['planning.draft', 'planning.replan'].includes(capability) && Array.isArray(data?.sourceRevisions))
      this.recordObjects(pack, data.sourceRevisions.filter((row: any) => typeof row.occurrenceId === 'string' && Number.isSafeInteger(Number(row.sourceVersion)) && Number(row.sourceVersion) > 0)
        .map((row: any) => ({ id: row.sourceId, revision: Number(row.sourceVersion) })), 'agenda');
    if (capability === 'planning.preview') recordAgenda([
      ...(Array.isArray(data?.busy) ? data.busy : []), ...(Array.isArray(data?.pending) ? data.pending : []),
      ...(Array.isArray(data?.acceptedMovable) ? data.acceptedMovable : []),
      ...(Array.isArray(data?.alternatives) ? data.alternatives.flatMap((option: any) => option.before ? [option.before] : []) : []),
    ]);
    if (capability === 'planning.compare') {
      recordAgenda(Array.isArray(data?.baseline) ? data.baseline : []);
      for (const branch of Array.isArray(data?.branches) ? data.branches : []) {
        recordAgenda(Array.isArray(branch.preserved) ? branch.preserved : []);
        recordAgenda(Array.isArray(branch.changes) ? branch.changes.map((change: any) => change.before).filter(Boolean) : []);
        if (Array.isArray(branch.draft?.sourceRevisions)) this.recordObjects(pack, branch.draft.sourceRevisions
          .filter((row: any) => typeof row.sourceId === 'string' && Number.isSafeInteger(Number(row.sourceVersion)) && Number(row.sourceVersion) > 0)
          .map((row: any) => ({ id: row.sourceId, revision: Number(row.sourceVersion) })), 'agenda');
      }
    }
    if (capability === 'situation.read') {
      if (Array.isArray(data?.localAgenda?.items)) recordAgenda(data.localAgenda.items);
      this.recordObjects(pack, [...(Array.isArray(data?.goals) ? data.goals : []), ...(Array.isArray(data?.commitments) ? data.commitments : [])]
        .filter(item => typeof item.id === 'string' && Number.isSafeInteger(item.revision)), 'work');
      this.recordDomainObjects(pack, (Array.isArray(data?.campus) ? data.campus : [])
        .flatMap((group: any) => Array.isArray(group.records) ? group.records.map((record: any) => ({ ...record, domain: record.domain || group.domain })) : []));
    }
    if (capability === 'campus.imported_lookup' && Array.isArray(data?.materialVersions))
      this.recordDomainObjects(pack, data.materialVersions.filter((record: any) => record.kind === 'domain'));
    if (result.data) {
      pack.receipt.providedSourceIds = [
        ...new Set([...(pack.receipt.providedSourceIds || []), result.sourceId]),
      ];
      if (capability === 'evidence.search')
        for (const entry of (result.data as any).results || [])
          if (typeof entry.id === 'string' && this.repo.evidence(pack.contract.scope, entry.id))
            pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, entry.id])];
    }
    const key =
      capability === 'campus.lookup'
        ? (result.data as any)?.domain || 'campus'
        : capability === 'weather.lookup'
          ? 'weather'
          : capability;
    const existing = pack.needs.find((n) => n.key === key || n.capability === capability);
    if (existing) {
      existing.status = result.status;
      existing.value = modelData;
      existing.reason = result.reason;
      existing.fetchedAt = result.fetchedAt;
      existing.coverage = result.coverage;
    } else
      pack.needs.push({
        id: key,
        key,
        capability,
        status: result.status,
        evidenceIds: [],
        value: modelData,
        reason: result.reason,
        fetchedAt: result.fetchedAt,
        coverage: result.coverage,
      });
    pack.receipt.needResults = pack.needs.map((n) => ({ key: n.key, status: n.status }));
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
  }
  includeVolatileConversation(pack: ContextPack, dialogue: { id: string; role: 'user' | 'assistant'; content: string }[]) {
    const scope = this.policy.validate(pack.contract.scope);
    if (scope.retention !== 'session_only' || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real' || !scope.sources.includes('history:self') || !this.policy.can(pack.contract.scope, 'evidence:read')) throw new HarnessError('history_scope', '本轮范围不允许使用临时前情。');
    const recent = dialogue.slice(-6), text = canonical(recent), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
    pack.data.volatileConversationHistory = recent.map(message => ({ ...message, origin: 'current_conversation_memory_only', persisted: false, authority: 'historical_context_not_current_delegation' }));
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    return { status: 'included' };
  }
  serializeForContinuation(pack: ContextPack, retained: ModelWireMessage[]) {
    if (!retained.length || pack.contract.audience !== 'self') return this.serialize(pack);
    const history = Array.isArray(pack.data.history) ? pack.data.history as { role: string; content: string }[] : [];
    const remaining = history.filter(item => !retained.some(message => message.role === item.role && typeof message.content === 'string' && message.content === item.content));
    const data: ContextPack['data'] = { ...pack.data, history: remaining };
    const directory = pack.data.capabilityDirectory as { items?: Record<string, unknown>[]; more?: boolean; meaning?: string } | undefined;
    if (directory?.items && retained.some(message => typeof message.content === 'string' && message.content.includes(canonical(directory)))) {
      data.capabilityDirectory = { ...directory, items: directory.items.map(({ description: _description, ...item }) => item), meaning: '完整说明已在保留上下文中提供；以下更新本轮连接与可用状态，输入schema仍可按需读取。' };
    }
    if (remaining.length !== history.length) data.historyReuse = '未重复列出的历史原文仍以相同角色完整保留在当前协议链中；原始存储和检索不变。';
    return this.serialize({ ...pack, data });
  }
  serialize(pack: ContextPack) {
    this.policy.validate(pack.contract.scope);
    // Public/group drafting receives a release brief and explicitly allowed
    // projection only. Never serialize the authored event, speech acts,
    // history bundles or private work state into this model boundary.
    if (pack.contract.audience !== 'self') {
      return redactCredentials(
        canonical({
          scope: {
            audience: pack.contract.audience,
            purpose: pack.contract.purpose,
            memoryMode: pack.contract.memoryMode,
            retention: pack.contract.retention,
          },
          time: pack.data.time,
          interactionMode: pack.data.interactionMode,
          releaseSpec: pack.data.releaseSpec,
          availabilityProjection: pack.data.availabilityProjection,
          coverage: pack.receipt.coverage,
          limitations: pack.data.limitations,
        }),
      );
    }
    if (pack.receipt.coverage === 'blocked')
      return redactCredentials(
        canonical({
          scope: pack.data.scope,
          time: pack.data.time,
          currentRequest: pack.currentText,
          coverage: 'blocked',
          limitations: pack.data.limitations,
          missing: pack.receipt.needResults,
        }),
      );
    return redactCredentials(canonical(pack.data));
  }
}
