import { randomUUID } from 'node:crypto';
import type { ScopeHandle } from '../../shared/harness';
import type {
  Assertion,
  ContextContract,
  ContextPack,
  EvidenceBundle,
  EvidenceEvent,
  Need,
  NeedResult,
  TypedValue,
  WorkRecord,
} from '../../shared/harness';
import { always, HarnessError } from '../../shared/harness';
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
import { expandRecallBundle, matchesVisibleQuery, multiQueryRecall, projectHistoricalEvidence, recallQueries, type EvidenceProjection, type RecallOptions } from '../memory/retrieval';
import { buildContinuityIndex } from './continuity';

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
  private providerMetadata?: ProviderMetadata;
  private continuityRefresh?: () => void;
  constructor(
    readonly repo: KernelRepository,
    readonly policy: PolicyKernel,
    readonly broker: CapabilityBroker,
    readonly domains: DomainService,
    readonly work: WorkService,
  ) {}
  /** Bind only non-secret protocol facts; payloads and credentials never enter the receipt. */
  setProviderMetadata(metadata?: ProviderMetadata) {
    this.providerMetadata = metadata
  }
  setContinuityRefresh(refresh: () => void) {
    this.continuityRefresh = refresh;
  }
  /** The main model chooses additional evidence; no word list creates needs. */
  initialNeeds(_contract: ContextContract, _text: string): Need[] { return []; }
  async compile(
    ingress: IngressDecision, currentEvents: EvidenceEvent[], signal: AbortSignal,
    additionalNeeds: Need[] = [], acquire = false, sessionId?: string,
  ): Promise<ContextPack> {
    signal.throwIfAborted();
    const contract = ingress.contract, scope = this.policy.validate(contract.scope);
    // A hypothetical continuation can refer to what this same user just said
    // in this thread. Read only that transcript, never their ambient profile,
    // and never override explicit UI/source restrictions.
    const canReadHistory = this.policy.can(contract.scope, 'evidence:read');
    const historyScope = ingress.threadContextAllowed && canReadHistory ? this.policy.hostScope({ sources: ['current', 'history:self'], subjectId: scope.principalId, worldId: 'real', purposes: scope.purposes, audience: 'self', grants: ['evidence:read'], retention: scope.retention, infer: false }) : contract.scope;
    const history = sessionId && canReadHistory && (!ingress.requiresReadPurpose || ingress.threadContextAllowed) ? this.repo.conversationHistory(historyScope, sessionId, currentEvents.map(e => e.id), ingress.threadContextAllowed ? 6 : 12) : [];
    const recentObservations = sessionId && history.length && canReadHistory && !ingress.requiresReadPurpose && scope.sources.includes('history:self')
      ? this.repo.sessionExternalObservations(contract.scope, sessionId, contract.now) : [];
    const observationSummaries = recentObservations.map(event => ({ id: event.id, sourceId: event.sourceId, authority: event.authority, receivedAt: event.receivedAt, text: event.text,
      meaning: '与本对话关联的近期外部观察；只证明所述观察，不代表用户确认、喜欢或授权后续行动。' }));
    const currentMatter = sessionId && canReadHistory && !ingress.requiresReadPurpose && contract.enhancements?.currentMatter !== false && scope.sources.includes('work:self') ? this.repo.currentMatter(contract.scope, sessionId) : null;
    const continuity = !ingress.requiresReadPurpose ? buildContinuityIndex(this.repo, contract, sessionId, this.continuityRefresh) : undefined;
    const preparedMaterials = continuity?.preparedMaterials || [], openThreads = continuity?.openThreads || [];
    const continuityData = { ...(preparedMaterials.length ? { preparedMaterials } : {}), ...(openThreads.length ? { openThreads } : {}),
      ...(continuity ? { continuityCoverage: continuity.coverage } : {}) };
    const discovered = this.broker.discover(contract.scope);
    const capabilityDirectory = { items: discovered.slice(0, 24).map(item => ({ name: item.name, sourceId: item.sourceId, displayName: item.displayName, description: item.description, effect: item.effect, connected: item.connection.connected, connection: item.connection, executableInThisTurn: item.connection.connected && (item.effect === 'read' || contract.actionMode !== 'respond') })), more: discovered.length > 24, meaning: '仅是许可范围内的非敏感能力说明，没有读取资料或执行动作；存在、已连接、本轮允许执行、实际完成是不同事实。用look_up的capability目录继续搜索、分页或获取输入schema。' };
    const text = canonical({ current: ingress.authoredText, attachments: currentEvents.filter(e => e.speaker === 'external'), history, ...(observationSummaries.length ? { recentObservations: observationSummaries } : {}), currentMatter, ...continuityData, capabilityDirectory });
    const estimatedTokens = Math.ceil(Array.from(text).length / 1.4), readBytes = Buffer.byteLength(text);
    const blocked = estimatedTokens > contract.budget.maxTokens || readBytes > contract.budget.maxReadBytes;
    const evidenceIds = [...new Set([...currentEvents.map(e => e.id), ...history.filter(m => m.role === 'user').map(m => m.id), ...recentObservations.map(e => e.id)])];
    const receipt: ContextPack['receipt'] = {
      mechanismUses: { prefetch: 0, currentMatter: Number(!!currentMatter), repairRejudge: 0, closure: 0 },
      id: randomUUID(), runId: contract.id, contractRevision: contract.revision,
      policyRevision: contract.policyRevision, privacyEpoch: contract.privacyEpoch,
      watermarks: this.repo.watermarks(), providedEvidenceIds: evidenceIds,
      providedSourceIds: [...new Set([...currentEvents.map(e => e.sourceId), ...(history.length ? ['history:self'] : []), ...recentObservations.map(e => e.sourceId), ...(continuity?.providedSourceIds || []), ...(preparedMaterials.length || openThreads.length || currentMatter ? ['work:self'] : [])])],
      providedObjectVersions: [...currentEvents.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })), ...recentObservations.map(e => ({ id: e.id, revision: e.contentVersion, kind: 'evidence' as const })), ...(continuity?.providedObjectVersions || []), ...(currentMatter ? [{ id: currentMatter.id, revision: currentMatter.revision, kind: 'work' as const }, ...currentMatter.optionPlaces.map(option => ({ id: option.id, revision: option.revision, kind: 'work' as const }))] : [])],
      needResults: [], excludedReasonCounts: Object.fromEntries(contract.excludedReasons.map(reason => [reason, 1])),
      providerVersion: this.providerMetadata ? `${this.providerMetadata.protocol}/${this.providerMetadata.protocolVersion}` : 'unknown',
      ...(this.providerMetadata ? { provider: { ...this.providerMetadata, limits: { ...this.providerMetadata.limits, hostContextTokens: contract.budget.maxTokens } } } : {}),
      toolAttempts: [], coverage: blocked ? 'blocked' : 'conditional', budget: { estimatedTokens, readBytes },
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
          read: '按当前任务发现并读取situation.read、planning.preview及相应来源；未查询、未覆盖、确实为空和当前可用精力分别判断。当前原话与更正优先于旧摘要，必要时展开原始条件。' },
        history, ...(observationSummaries.length ? { recentObservations: observationSummaries } : {}), ...(ingress.threadContextAllowed ? { historyUse: '仅作为同一对话里用户已提供的背景理解当前假设；不代表假设已在现实发生，也未读取本人长期画像或其他会话。' } : {}), currentSources: currentEvents.map(e => ({ id: e.id, sourceId: e.sourceId, authority: e.authority, text: e.text })),
        currentMatter, ...continuityData, capabilityDirectory,
        currentFacts: {}, correctionOverlay: [], workState: [], needs: [],
        coverage: receipt.coverage,
        limitations: blocked ? ['原话及必要前情超过本轮预算，尚未截断；需要分段处理或缩小范围。'] : [],
      },
    };
    this.repo.saveReceipt(contract.scope, receipt);
    if (acquire && additionalNeeds.length) await this.expand(pack, additionalNeeds, signal);
    return pack;
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
    const text = canonical({ history, currentMatter, recentObservations }), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
    if (pack.receipt.budget.readBytes + bytes > pack.contract.budget.maxReadBytes || pack.receipt.budget.estimatedTokens + tokens > pack.contract.budget.maxTokens)
      return { status: 'partial', reason: '这段完整前情超过本轮预算，需要按实际事项分段读取；未截掉条件。' };
    pack.data.history = history;
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
    }
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    this.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return { status: history.length || observations.length ? 'fresh' : 'not_found', count: history.length, observationCount: observations.length };
  }

  prefetch(pack: ContextPack, query: string, at = pack.contract.now, offset = 0, limit = 8, hardOffset = 0,
    sourceProjection?: EvidenceProjection, recall: RecallOptions = {}) {
    const scope = this.policy.validate(pack.contract.scope), time = Date.parse(at);
    if (!Number.isFinite(time)) throw new HarnessError('invalid_time', '检索时间不合法。');
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
    const rawPage = multi ? multi.raw : !scan && scope.sources.includes('history:self') ? this.repo.lexicalEvidence(pack.contract.scope, query, limit + 1, offset) : [];
    const raw = rawPage.slice(0, limit).flatMap(original => {
      const historical = projectHistoricalEvidence(this.repo, pack.contract.scope, original, sourceProjection);
      if (!historical) return [];
      if (historical.text === original.text) return [historical];
      // Do not reveal even a search hit solely because the hidden part matched.
      return queries.some(value => matchesVisibleQuery(value, historical.text)) ? [historical] : [];
    });
    // Old wording can be the only search clue. Follow its exact correction link
    // to the current source without reviving the superseded assertion.
    const correctionIds = [...new Set(raw.flatMap(event => event.restrictions.flatMap(restriction => restriction.replacementEventId ? [restriction.replacementEventId] : [])))];
    const correctionFollowups = correctionIds.slice(0, 16).flatMap(id => {
      if (raw.some(event => event.id === id)) return [];
      const event = this.repo.evidence(pack.contract.scope, id);
      const view = event && projectHistoricalEvidence(this.repo, pack.contract.scope, event, sourceProjection);
      return view ? [view] : [];
    });
    const value = { status: bundles.length || raw.length ? 'fresh' : 'not_found', bundles, originals: raw, correctionFollowups,
      coverage: { candidatesOnly: true, at,
        retrieval: scan ? 'model_candidate_scan' : queries.length > 1 ? 'model_multi_query_rrf' : 'lexical',
        ...(!sourceProjection ? { queries } : {}),
        nextOffset: scan ? scanPage.length > limit ? offset + limit : null : multi ? multi.nextOffset : soft.total > offset + limit || rawPage.length > limit ? offset + limit : null,
        nextHardOffset: scan ? null : multi ? multi.nextHardOffset : hard.total > hardOffset + 8 ? hardOffset + 8 : null,
        hardTotal: scan ? null : sourceProjection ? bundles.filter(bundle => bundle.assertions[0].strength === 'hard').length : multi?.hardTotal ?? hard.total,
        hardTotalCoverage: scan || sourceProjection ? 'visible_page' : multi ? 'ranking_window' : 'all_candidates',
        ...(multi ? { rankingWindow: multi.rankingWindow, queryContinuations: sourceProjection ? [] : multi.queryContinuations } : {}),
        vectorSearch: 'not_connected', hardConstraintsSeparate: !scan,
        correctionFollowupsComplete: correctionIds.length <= 16 && correctionIds.every(id => raw.some(event => event.id === id) || correctionFollowups.some(event => event.id === id)),
        guidance: '由模型提出同义、跨语言和必要条件的relatedQueries；零词面重合仍可用mode=scan按页查看合法现行理解。候选未自动判定适用，未命中不证明没有记忆。多query的queryContinuations用单query继续，不把有界融合窗口当全集。',
        historicalOriginals: '局部更正的原文仍可发现；restrictions所指范围不得当作现行事实，未受影响的内容仍须核对语境。' } };
    const bytes = Buffer.byteLength(canonical(value)), tokens = Math.ceil(Array.from(canonical(value)).length / 1.4);
    if (pack.receipt.budget.readBytes + bytes > pack.contract.budget.maxReadBytes || pack.receipt.budget.estimatedTokens + tokens > pack.contract.budget.maxTokens)
      return { status: 'partial', reason: '完整条件与来源超出当前预算，没有拆散条件或静默截断。请缩小查询或分段读原文。', candidates: bundles.flatMap(bundle => bundle.assertions).map(a => ({ id: a.id, preview: Array.from(a.text).slice(0, 100).join(''), previewOnly: true, length: Array.from(a.text).length, hard: a.strength === 'hard' })), originals: raw.map(e => ({ id: e.id, length: Array.from(e.text).length })) };
    pack.assertions = [...new Map([...pack.assertions, ...bundles.flatMap(b => b.assertions)].map(a => [a.id, a])).values()];
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
    const originals = matter.evidenceIds.slice(-4).map(id => this.repo.evidence(pack.contract.scope, id)).filter((event): event is EvidenceEvent => !!event);
    const candidates = { status: originals.length ? 'fresh' : 'not_found', bundles: [], originals,
      coverage: { candidatesOnly: true, at: pack.contract.now, nextOffset: null, nextHardOffset: null, hardTotal: 0,
        vectorSearch: 'not_connected', automaticScope: 'matter_evidence_links_only' } };
    const value = { ...candidates, matterOriginals: originals, originalCoverage: 'bounded_related_originals',
      meaning: '只自动回读此事项明确关联且当前可读的原文；更广的跨事项检索须另按本轮用途请求。候选仍需判断当前适用性。' };
    const bytes = Buffer.byteLength(canonical(value)), tokens = Math.ceil(Array.from(canonical(value)).length / 1.4);
    if (pack.receipt.budget.readBytes + bytes > pack.contract.budget.maxReadBytes || pack.receipt.budget.estimatedTokens + tokens > pack.contract.budget.maxTokens)
      return { status: 'partial', bundles: [], originals: [], coverage: candidates.coverage,
        matterOriginals: originals.map(event => ({ id: event.id, contentVersion: event.contentVersion, length: Array.from(event.text).length })), originalCoverage: 'pointers_only_read_evidence_for_full_text' };
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    pack.receipt.providedEvidenceIds = [...new Set([...pack.receipt.providedEvidenceIds, ...originals.map(event => event.id)])];
    pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), ...originals.map(event => event.sourceId)])];
    this.recordObjects(pack, [matter], 'work');
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
  recordObjects(pack: ContextPack | undefined, records: { id: string; revision: number }[], kind: 'assertion' | 'work' | 'agenda') {
    if (!pack) return;
    for (const record of records) {
      const previous = pack.receipt.providedObjectVersions.find(value => value.id === record.id && value.kind === kind);
      if (previous) previous.revision = record.revision;
      else pack.receipt.providedObjectVersions.push({ id: record.id, revision: record.revision, kind });
    }
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
  recordModelUsage(pack: ContextPack | undefined, usage: Completion['usage'], phase: string) {
    if (!pack) return;
    const cost = usageCost(usage);
    (pack.receipt.modelUsage ||= []).push({ phase, inputTokens: usage?.prompt_tokens ?? null, cachedInputTokens: usage?.prompt_cache_hit_tokens ?? null, outputTokens: usage?.completion_tokens ?? null, usdMin: cost?.usdMin ?? null, usdMax: cost?.usdMax ?? null });
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
      capabilities: {
        ...metadata.capabilities,
        modalities: [...metadata.capabilities.modalities],
      },
      limits: {
        ...metadata.limits,
        hostContextTokens: pack.contract.budget.maxTokens,
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
    modelView: unknown = projectMapModelResult(capability, result), attemptId?: string, hostRead = false) {
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
    const overBudget = pack.receipt.budget.readBytes + bytes > pack.contract.budget.maxReadBytes
      || pack.receipt.budget.estimatedTokens + tokens > pack.contract.budget.maxTokens;
    pack.receipt.budget.readBytes += bytes;
    if (overBudget) {
      pack.receipt.coverage = 'blocked';
      this.repo.saveReceipt(pack.contract.scope, pack.receipt);
      // A completed action's real receipt remains visible even when no room
      // remains for further reading. Only read results can be withheld.
      if (hostRead || this.broker.describe(capability)?.effect === 'read')
        throw new HarnessError('read_budget', '资料读取已达到本轮总量上限，请用已取得的结果完成说明。');
    }
    pack.receipt.budget.estimatedTokens += tokens;
    const modelResult = projectMapModelResult(capability, result);
    const modelData = modelView && typeof modelView === 'object' && 'data' in modelView
      ? (modelView as CapabilityResult).data : modelResult.data;
    const data = result.data as Record<string, any> | undefined;
    const recordAgenda = (items: any[]) => this.recordObjects(pack, items.filter(item => item && typeof (item.sourceActionId || item.seriesId || item.id) === 'string')
      .map(item => ({ id: item.sourceActionId || item.seriesId || item.id, revision: item.revision || 1 })), 'agenda');
    if (capability === 'local.agenda.read' && Array.isArray(data?.items)) recordAgenda(data.items);
    if (capability === 'planning.preview') recordAgenda([
      ...(Array.isArray(data?.busy) ? data.busy : []), ...(Array.isArray(data?.pending) ? data.pending : []),
      ...(Array.isArray(data?.acceptedMovable) ? data.acceptedMovable : []),
      ...(Array.isArray(data?.alternatives) ? data.alternatives.flatMap((option: any) => option.before ? [option.before] : []) : []),
    ]);
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
    if (pack.receipt.budget.readBytes + bytes > pack.contract.budget.maxReadBytes || pack.receipt.budget.estimatedTokens + tokens > pack.contract.budget.maxTokens)
      return { status: 'partial', reason: '完整临时前情超过本轮范围，没有截去限制后继续使用。' };
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
