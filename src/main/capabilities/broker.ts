import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  HarnessError,
  capabilityContractRefSchema,
  knowledgeStatus,
  type CapabilityContractRef,
  type ContextContract,
  type KnowledgeStatus,
  type Need,
  type ScopeHandle,
  type TypedValue,
} from '../../shared/harness';
import type { PolicyKernel } from '../runtime/policy';
import type { WorkService } from '../runtime/work';
import { canonical } from '../runtime/semantics';
import { publicFetch } from './public-network';

export interface CapabilityResult<T = unknown> {
  status: KnowledgeStatus;
  data?: T;
  sourceId: string;
  observedAt?: string;
  fetchedAt?: string;
  expiresAt?: string;
  coverage?: { complete: boolean; scope: string; until?: string };
  /** This requested page was delivered. It says nothing about global source
   * coverage, remaining pages, semantic sufficiency or business completion. */
  delivery?: { kind: 'page'; complete: true };
  reason?: string;
  validation?: { target: 'arguments' | 'result'; issues: { path: string; code: string }[] };
  simulated: boolean;
}
export interface CapabilityDefinition {
  name: string;
  displayName?: string;
  description?: string;
  version: string;
  input: z.ZodType;
  output: z.ZodType;
  effect: 'read' | 'local_write' | 'external_write';
  requiredScopes: string[];
  subjects: ('self' | 'other' | 'fictional')[];
  worlds: ('real' | 'scenario')[];
  timeoutMs: number;
  maxBytes: number;
  supportsIdempotency: boolean;
  supportsInspect: boolean;
  supportsCancel: boolean;
  /** Equivalent-scope reuse is opt-in: continuation/visual handles may belong to one scope handle. */
  cacheScope?: 'handle' | 'equivalent';
}
export interface CapabilityManifest {
  publicRead?: boolean;
  id: string;
  version: string;
  trust: 'bundled_reviewed' | 'external_reviewed' | 'untrusted_disabled';
  sourceId: string;
  capabilities: CapabilityDefinition[];
  egressHosts: string[];
  platforms: string[];
  simulated: boolean;
  offline: 'read_cache' | 'unsupported';
  license: string;
}
export interface InvocationContext {
  signal: AbortSignal;
  scope: ScopeHandle;
  capability: string;
  deadline: string;
  idempotencyKey?: string;
  /** Host-only pixel lifetime handoff; it grants no access and is not result data. */
  onVisualPrepared?: (observationId: string) => void;
  /** Only the broker's mediated network port is part of the provider API; interfaces alone are not an OS sandbox. */
  request(url: string, init?: RequestInit): Promise<Response>;
}
export interface CapabilityProvider {
  manifest: CapabilityManifest;
  connectionStatus?: (capability?: string) => { connected: boolean; reason?: string; entry?: string };
  invoke(name: string, args: any, context: InvocationContext): Promise<unknown> | unknown;
  inspect?(name: string, key: string, context: InvocationContext): Promise<unknown>;
  cancel?(name: string, key: string, context: InvocationContext): Promise<unknown>;
}
export interface Recipe {
  id: string;
  version: string;
  triggers: string[];
  capabilities: string[];
  needs: Need[];
  status: 'reviewed' | 'candidate' | 'rejected';
}
export interface InvocationAudit {
  id: string;
  capability: string;
  providerId: string;
  version: string;
  status: KnowledgeStatus;
  scopeId: string;
  simulated: boolean;
  bytes: number;
  cache?: 'hit' | 'shared' | 'miss';
}
function capabilityContract(provider: CapabilityProvider, definition: CapabilityDefinition): CapabilityContractRef {
  const manifest = provider.manifest;
  // JSON Schema cannot encode custom refinement/transform functions. Changes to
  // those or to implementation semantics must also advance the declared version.
  const contract = {
    provider: { id: manifest.id, version: manifest.version, sourceId: manifest.sourceId,
      trust: manifest.trust, publicRead: manifest.publicRead === true, simulated: manifest.simulated,
      offline: manifest.offline, egressHosts: [...manifest.egressHosts].sort(), platforms: [...manifest.platforms].sort() },
    capability: { name: definition.name, version: definition.version,
      inputSchema: z.toJSONSchema(definition.input), outputSchema: z.toJSONSchema(definition.output),
      effect: definition.effect, requiredScopes: [...definition.requiredScopes].sort(),
      subjects: [...definition.subjects].sort(), worlds: [...definition.worlds].sort(),
      timeoutMs: definition.timeoutMs, maxBytes: definition.maxBytes, cacheScope: definition.cacheScope || 'handle',
      supportsIdempotency: definition.supportsIdempotency, supportsInspect: definition.supportsInspect,
      supportsCancel: definition.supportsCancel, inspectHandler: !!provider.inspect, cancelHandler: !!provider.cancel },
  };
  return Object.freeze(capabilityContractRefSchema.parse({ revision: 1, providerId: manifest.id, providerVersion: manifest.version,
    capabilityName: definition.name, capabilityVersion: definition.version,
    digest: createHash('sha256').update(canonical(contract)).digest('hex') }));
}
interface SharedInvocation {
  controller: AbortController;
  promise: Promise<CapabilityResult>;
  waiters: Set<object>;
  settled: boolean;
}
const resultSchema = z
  .object({
    status: knowledgeStatus,
    data: z.unknown().optional(),
    sourceId: z.string(),
    observedAt: z.string().optional(),
    fetchedAt: z.string().optional(),
    expiresAt: z.string().optional(),
    coverage: z
      .object({ complete: z.boolean(), scope: z.string(), until: z.string().optional() })
      .strict()
      .optional(),
    delivery: z.object({ kind: z.literal('page'), complete: z.literal(true) }).strict().optional(),
    reason: z.string().max(500).optional(),
    validation: z.object({ target: z.enum(['arguments', 'result']), issues: z.array(z.object({ path: z.string().max(160), code: z.string().max(60) }).strict()).max(6) }).strict().optional(),
    simulated: z.boolean(),
  })
  .strict();
function validationIssues(error: z.ZodError) {
  // Only bounded schema paths and issue codes cross back to the model. Zod
  // messages can quote submitted values or unrecognized private field names.
  return error.issues.slice(0, 6).map(issue => ({
    path: issue.path.map(part => typeof part === 'number' ? `[${part}]` : typeof part === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,59}$/.test(part) ? part : '[field]').join('.').slice(0, 160) || '$',
    code: issue.code,
  }));
}
class CapabilityValidationError extends HarnessError {
  readonly validation: NonNullable<CapabilityResult['validation']>;
  constructor(target: 'arguments' | 'result', error: z.ZodError) {
    super(target === 'arguments' ? 'invalid_arguments' : 'invalid_result',
      target === 'arguments' ? '这次有几处没填对，位置留在下面；看一眼这项能力的完整用法就能接着改。' : '这次来源给的内容还没能读成可用资料，原查询和出错位置已留下。', target === 'arguments' ? 'read' : 'never');
    this.validation = { target, issues: validationIssues(error) };
  }
}
export class CapabilityBroker {
  private providers = new Map<string, CapabilityProvider>();
  private capabilities = new Map<
    string,
    { provider: CapabilityProvider; definition: CapabilityDefinition; contract: CapabilityContractRef }
  >();
  private recipes = new Map<string, Recipe[]>();
  private cached = new Map<string, CapabilityResult>();
  private readBackoff = new Map<string, { until: number; result: CapabilityResult }>();
  private inFlight = new Map<string, SharedInvocation>();
  private active = new Set<AbortController>();
  readonly invocations: InvocationAudit[] = [];
  readonly rejections: { capability: string; code: string }[] = [];
  private budgets = new WeakMap<ScopeHandle, { calls: number; bytes: number }>();
  private audit(value: InvocationAudit) {
    this.invocations.push(value);
    if (this.invocations.length > 256) this.invocations.splice(0, this.invocations.length - 256);
  }
  private async waitFor(flight: SharedInvocation, signal: AbortSignal): Promise<CapabilityResult> {
    signal.throwIfAborted();
    const waiter = {};
    flight.waiters.add(waiter);
    let abort!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    try { return await Promise.race([flight.promise, cancelled]); }
    finally {
      signal.removeEventListener('abort', abort);
      flight.waiters.delete(waiter);
      if (!flight.settled && !flight.waiters.size)
        flight.controller.abort(signal.reason || new DOMException('读取已没有等待者', 'AbortError'));
    }
  }
  constructor(
    readonly policy: PolicyKernel,
    private fetcher: typeof fetch = fetch,
  ) {
    policy.onBarrier(() => {
      for (const c of this.active) c.abort(new HarnessError('stale_scope', '资料范围已改变。'));
      this.cached.clear();
      this.readBackoff.clear();
      this.inFlight.clear();
    });
  }
  register(provider: CapabilityProvider, approval: { reviewed: boolean; source: string }) {
    const m = provider.manifest;
    if (!approval.reviewed || !approval.source || m.trust === 'untrusted_disabled')
      throw new HarnessError('unreviewed_provider', '这份扩展还没核对来源和做法，当前尚未启用。');
    if (this.providers.has(m.id)) throw new HarnessError('provider_exists', '扩展已登记，升级需要显式替换。');
    if (
      !/^[a-zA-Z0-9_.:-]{1,100}$/.test(m.id) ||
      !m.version ||
      !m.sourceId ||
      !m.license ||
      m.capabilities.length > 32
    )
      throw new HarnessError('invalid_manifest', '扩展登记信息不完整。');
    for (const d of m.capabilities) {
      if (
        this.capabilities.has(d.name) ||
        !d.name || !d.version ||
        !d.input ||
        !d.output ||
        d.timeoutMs <= 0 ||
        d.timeoutMs > 90000 ||
        d.maxBytes <= 0 ||
        d.maxBytes > 150000
      )
        throw new HarnessError('invalid_capability', '能力名称冲突或预算无效。');
      if (d.effect !== 'read' && d.worlds.includes('scenario'))
        throw new HarnessError('scenario_effect', '这份演练留在假设情境里，实际修改沿本人的现实事项继续。');
    }
    // Keep reviewed metadata and executable functions independent of later
    // mutations to the caller's provider object. Connection callbacks remain live.
    const definitions = m.capabilities.map(definition => ({ ...definition,
      requiredScopes: [...definition.requiredScopes], subjects: [...definition.subjects], worlds: [...definition.worlds] }));
    const snapshot: CapabilityProvider = {
      manifest: { ...m, capabilities: definitions, egressHosts: [...m.egressHosts], platforms: [...m.platforms] },
      invoke: provider.invoke.bind(provider),
      ...(provider.inspect ? { inspect: provider.inspect.bind(provider) } : {}),
      ...(provider.cancel ? { cancel: provider.cancel.bind(provider) } : {}),
      ...(provider.connectionStatus ? { connectionStatus: provider.connectionStatus.bind(provider) } : {}),
    };
    // Finish every schema conversion before making any part of registration visible.
    const entries = definitions.map(definition => ({ provider: snapshot, definition, contract: capabilityContract(snapshot, definition) }));
    this.providers.set(m.id, snapshot);
    for (const entry of entries) this.capabilities.set(entry.definition.name, entry);
    this.policy.registerSource(m.sourceId);
  }
  unregister(id: string) {
    const p = this.providers.get(id);
    if (!p) return;
    for (const c of p.manifest.capabilities) this.capabilities.delete(c.name);
    this.providers.delete(id);
    this.cached.clear();
    this.readBackoff.clear();
  }
  registerRecipe(recipe: Recipe, review: { approved: boolean; reviewer: string }) {
    if (!review.approved || !review.reviewer || recipe.status !== 'reviewed')
      throw new HarnessError('recipe_not_reviewed', '新方法需要审核后才能启用。');
    if (recipe.capabilities.some((c) => !this.capabilities.has(c)))
      throw new HarnessError('unknown_capability', '方法请求了未登记能力。');
    const versions = this.recipes.get(recipe.id) || [];
    this.recipes.set(recipe.id, [...versions, structuredClone(recipe)]);
  }
  rollbackRecipe(id: string, version: string) {
    const versions = this.recipes.get(id) || [];
    const index = versions.findIndex((r) => r.version === version);
    if (index < 0) throw new HarnessError('recipe_missing', '没有此方法版本。');
    this.recipes.set(id, versions.slice(0, index + 1));
  }
  recipeList() {
    return [...this.recipes.values()].map((v) => structuredClone(v[v.length - 1]));
  }
  matchRecipes(text: string) {
    return this.recipeList().filter((r) =>
      r.triggers.some((t) => text.toLowerCase().includes(t.toLowerCase())),
    );
  }
  describe(name: string) {
    const entry = this.capabilities.get(name);
    if (!entry) return;
    const { provider, definition: d } = entry;
    return {
      name: d.name,
      displayName: d.displayName || d.name,
      description: d.description || `查看“${d.displayName || d.name}”的完整用法，再按眼前需要填写参数。`,
      version: d.version,
      capabilityContract: { ...entry.contract },
      effect: d.effect,
      requiredScopes: [...d.requiredScopes],
      sourceId: provider.manifest.sourceId,
      simulated: provider.manifest.simulated,
      supportsIdempotency: d.supportsIdempotency,
      supportsInspect: d.supportsInspect,
      supportsCancel: d.supportsCancel,
      connection: provider.connectionStatus?.(name) || { connected: true },
    };
  }
  assertContract(name: string, expected: CapabilityContractRef | undefined) {
    if (!expected) throw new HarnessError('capability_contract_missing', '这份旧动作还缺当时的办理方式。先保留已有结果，没办的部分可以按当前用法重新准备。');
    const entry = this.capabilities.get(name);
    if (!entry || canonical(entry.contract) !== canonical(expected))
      throw new HarnessError('capability_contract_changed', '这件事的办理方式已经换了。先沿原动作核对已有结果，剩下的再按当前用法准备。');
    return this.describe(name)!;
  }
  validateArguments(name: string, args: unknown) {
    const entry = this.capabilities.get(name);
    if (!entry) throw new HarnessError('unsupported', '当前目录里没有这个做法，可以沿look_up的capability目录按用途再找。');
    return entry.definition.input.parse(args);
  }
  discover(handle: ScopeHandle) {
    const s = this.policy.validate(handle);
    const subject = s.subjectId === s.principalId ? 'self' : s.subjectId.startsWith('fictional:') ? 'fictional' : 'other';
    return [...this.capabilities.keys()]
      .filter((name) => {
        const d = this.capabilities.get(name)!;
        return (
          d.definition.requiredScopes.every((g) => s.grants.includes(g)) &&
          s.sources.includes(d.provider.manifest.sourceId) &&
          d.definition.subjects.includes(subject) &&
          d.definition.worlds.includes(s.worldId === 'real' ? 'real' : 'scenario') &&
          (d.provider.manifest.platforms.includes('*') || d.provider.manifest.platforms.includes(process.platform)) &&
          (!s.child || d.definition.effect === 'read')
        );
      })
      .map((n) => this.describe(n)!);
  }
  catalog(handle: ScopeHandle, query = '', offset = 0, limit = 12) {
    const eligible = new Set(this.discover(handle).map(item => item.name));
    query = query.normalize('NFKC').trim();
    const normalized = query.toLowerCase();
    // CJK substrings help retrieve Chinese names. Splitting Latin words into
    // bigrams made "email" match "map" via "ma", producing unrelated pages.
    const cjk = [...normalized.matchAll(/[\p{Script=Han}]+/gu)].flatMap(match => {
      const points = Array.from(match[0]);
      return [match[0], ...points.slice(0, -1).map((point, index) => point + points[index + 1])];
    });
    const terms = [...new Set([...normalized.split(/\s+/).filter(Boolean), ...(normalized.match(/[a-z0-9_.:-]+/g) || []), ...cjk])];
    const rows = [...this.capabilities.keys()].map(name => this.describe(name)!).map(row => {
      const text = `${row.name} ${row.displayName} ${row.description}`.normalize('NFKC').toLowerCase();
      return { row, score: normalized === row.name.toLowerCase() ? Number.MAX_SAFE_INTEGER
        : terms.reduce((score, term) => score + (text.includes(term) ? term.length : 0), 0) };
    }).filter(result => !normalized || result.score > 0)
      .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name, 'en')).map(result => result.row);
    const items = rows.slice(offset, offset + limit).map(row => ({ ...row,
      scopeEligible: eligible.has(row.name),
      describe: { tool: 'look_up', arguments: { source: 'capability', capability: row.name, describeOnly: true } },
    }));
    const nextOffset = offset + items.length < rows.length ? offset + items.length : null;
    return { items, nextOffset, total: rows.length, catalogOnly: true,
      ...(nextOffset !== null ? { continuation: { tool: 'look_up', arguments: {
        source: 'capability', ...(query ? { query } : {}), offset: nextOffset, limit,
      } } } : {}),
      ...(normalized ? { browse: { tool: 'look_up', arguments: { source: 'capability', offset: 0, limit } } } : {}),
      ...(offset > 0 ? { restart: { tool: 'look_up', arguments: {
        source: 'capability', ...(query ? { query } : {}), offset: 0, limit,
      } } } : {}),
      coverage: { query, matchingOnly: !!normalized, offset, returned: items.length, totalMatches: rows.length,
        meaning: items.length
          ? `找到${rows.length}种相关做法，本页列出${items.length}种；沿每项入口看具体读法与连接情况。${nextOffset !== null ? '还有下一页。' : '这一页是这次查找的最后一页。'}`
          : rows.length
            ? `这次找到${rows.length}种做法，当前起点已经超出目录。沿restart回到这次查找的第一页。`
            : normalized
              ? '这次没找到相近做法，可以换个用途再找，或沿browse看看完整目录。'
              : '目前这份目录是空的。已经提供的其他工具仍在原入口，校园和天气的连接情况也可在连接与偏好里查看。' },
    };
  }
  detail(handle: ScopeHandle, name: string) {
    this.policy.validate(handle);
    const entry = this.capabilities.get(name);
    if (!entry) return { status: 'not_found', reason: '当前目录里没有这个名称，可以换个用途再找。',
      discover: { tool: 'look_up', arguments: { source: 'capability' } } };
    const { $schema: _, ...inputSchema } = z.toJSONSchema(entry.definition.input);
    return { ...this.describe(name), inputSchema, status: 'described', effectMeaning: entry.definition.effect,
      meaning: entry.definition.effect === 'read'
        ? '这里是这份资料的读法，具体内容还没打开。照下面的用法填写后，沿look_up读取即可。'
        : '这里是这件事的办理方式。具体修改沿原行动入口继续，已有结果也沿同一动作核对。',
      timeoutMs: entry.definition.timeoutMs, outputBytesLimit: entry.definition.maxBytes };
  }
  private context(
    handle: ScopeHandle,
    name: string,
    controller: AbortController,
    idempotencyKey?: string,
    onVisualPrepared?: (observationId: string) => void,
  ): InvocationContext {
    const entry = this.capabilities.get(name)!;
    const d = entry.definition,
      m = entry.provider.manifest;
    return {
      scope: handle,
      signal: controller.signal,
      capability: name,
      idempotencyKey,
      onVisualPrepared,
      deadline: new Date(Date.parse(this.policy.repo.clock.now()) + d.timeoutMs).toISOString(),
      request: async (url, init = {}) => {
        this.policy.validate(handle);
        if (m.publicRead) {
          if (m.trust !== 'bundled_reviewed' || d.effect !== 'read' || (init.method && init.method !== 'GET') || init.body || init.headers) throw new HarnessError('public_request_forbidden', '这次的读法与公开网页入口没有对上，请求还没发出；可以按原来源的公开链接继续读取。');
          return publicFetch(url, controller.signal);
        }
        const parsed = new URL(url),
          method = (init.method || 'GET').toUpperCase();
        if (
          !m.egressHosts.includes(parsed.host) ||
          !['https:', 'http:'].includes(parsed.protocol) ||
          parsed.username ||
          parsed.password ||
          (parsed.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))
        )
          throw new HarnessError('egress_forbidden', '这个地址不在此来源已连接的范围里，请求还没发出；可以回到原来源给出的入口继续。');
        if (d.effect === 'read' && !['GET', 'HEAD'].includes(method))
          throw new HarnessError('effect_mismatch', '这里接的是读资料，这次带来的是修改请求；实际修改沿原行动入口继续。');
        if (d.effect === 'external_write' && !idempotencyKey)
          throw new HarnessError('approval_required', '这次外部修改还没对应到具体行动，可以接回原事项核对要办的内容，再沿原行动继续。');
        return this.fetcher(url, { ...init, redirect: 'error', signal: controller.signal });
      },
    };
  }
  async invoke(
    handle: ScopeHandle,
    name: string,
    args: unknown,
    signal: AbortSignal,
    options: {
      actionAttempt?: { id: string; key: string };
      inspectKey?: string;
      cancelKey?: string;
      /** @deprecated Legacy caller metadata, ignored; calls are measured only. */
      maxCalls?: number;
      refresh?: boolean;
      onVisualPrepared?: (observationId: string) => void;
    } = {},
  ): Promise<CapabilityResult> {
    const attemptId = randomUUID();
    let entry = this.capabilities.get(name);
    if (!entry)
      return {
        status: 'unsupported',
        sourceId: 'unregistered',
        reason: '当前目录里没有这项做法，可以沿look_up的capability目录按用途再找，在这次允许的资料范围内继续。',
        simulated: false,
      };
    const { definition: d, provider } = entry,
      m = provider.manifest;
    let readKey: string | undefined, allowReadBackoff = false;
    try {
      signal.throwIfAborted();
      const s = this.policy.validate(handle);
      allowReadBackoff = s.retention !== 'session_only';
      for (const grant of d.requiredScopes) this.policy.require(handle, grant);
      if (!s.sources.includes(m.sourceId))
        throw new HarnessError('source_forbidden', '这份来源这次没有开放读取，可以先用当前范围内的资料继续。');
      const subject =
        s.subjectId === s.principalId ? 'self' : s.subjectId.startsWith('fictional:') ? 'fictional' : 'other';
      if (!d.subjects.includes(subject) || !d.worlds.includes(s.worldId === 'real' ? 'real' : 'scenario'))
        throw new HarnessError('scope_mismatch', '这项做法与眼前正在谈的人或情境没有对应上，可以回到原事项选择合适的资料。');
      if (!m.platforms.includes(process.platform) && !m.platforms.includes('*'))
        return {
          status: 'unsupported',
          sourceId: m.sourceId,
          reason: '这台设备还没有这项做法的入口，可以在目录里看看其他已连接的来源。',
          simulated: m.simulated,
        };
      if (d.effect !== 'read' && !options.actionAttempt && !options.inspectKey && !options.cancelKey)
        throw new HarnessError('approval_required', '这项修改还没对应到一份具体行动。沿原行动入口继续，那里会保留已说清的安排和实际结果。');
      if (s.child && d.effect !== 'read') throw new HarnessError('child_write', '这次分头查资料只带了读取入口，实际修改交回原事项继续。');
      const checkedArguments = d.input.safeParse(args);
      if (!checkedArguments.success) {
        throw new CapabilityValidationError('arguments', checkedArguments.error);
      }
      const parsed = checkedArguments.data;
      if (options.actionAttempt) {
        const row = this.policy.repo.db
          .prepare(
            'SELECT t.action_id,t.idempotency_key,t.status,t.epoch,a.payload FROM h_attempts t JOIN h_actions a ON a.id=t.action_id WHERE t.id=? AND a.owner=? AND a.workspace=? AND a.subject=? AND a.world=?',
          )
          .get(options.actionAttempt.id, s.principalId, s.workspaceId, s.subjectId, s.worldId);
        const action = row ? JSON.parse(String(row.payload)) : undefined;
        if (
          !row ||
          row.idempotency_key !== options.actionAttempt.key ||
          row.status !== 'dispatching' ||
          Number(row.epoch) !== s.privacyEpoch ||
          action.capability !== name ||
          canonical(action.arguments) !== canonical(parsed)
        )
          throw new HarnessError('invalid_attempt', '这次要改的内容与原行动没有对上，可以先找回同一原行动，核对当前内容和办理结果，再继续修改。');
        this.assertContract(name, action.capabilityContract);
      }
      if (options.inspectKey || options.cancelKey) {
        const row = this.policy.repo.db
          .prepare(
            "SELECT payload FROM h_actions WHERE owner=? AND workspace=? AND subject=? AND world=? AND json_extract(payload,'$.capability')=? AND json_extract(payload,'$.idempotencyKey')=?",
          )
          .get(
            s.principalId,
            s.workspaceId,
            s.subjectId,
            s.worldId,
            name,
            options.inspectKey || options.cancelKey!,
          );
        if (!row) throw new HarnessError('invalid_attempt', '这次没有找到对应的原行动，可以先找回那份安排，再沿它自己的入口核对或撤回。');
        this.assertContract(name, JSON.parse(String(row.payload)).capabilityContract);
      }
      const domainRevision = this.policy.repo.domainRevision;
      const fingerprint = canonical({
        provider: m.id, providerVersion: m.version, capabilityVersion: d.version,
        handle: d.cacheScope === 'equivalent' ? undefined : handle.id,
        principal: s.principalId,
        workspace: s.workspaceId,
        grants: [...s.grants].sort(),
        retention: s.retention,
        infer: s.infer,
        child: s.child,
        sources: [...s.sources].sort(),
        subject: s.subjectId,
        world: s.worldId,
        purposes: [...s.purposes].sort(),
        audience: s.audience,
        epoch: s.privacyEpoch,
        revision: s.policyRevision,
        domainRevision,
        current: ['history:self', 'current'].includes(m.sourceId) ? s.currentEventIds : [],
      });
      const key = fingerprint + ':' + name + ':' + canonical(parsed);
      if (d.effect === 'read') readKey = key;
      const flightKey = key;
      const budget = this.budgets.get(handle) || { calls: 0, bytes: 0 };
      budget.calls++;
      this.budgets.set(handle, budget);
      for (const [cachedKey, result] of this.cached)
        if (!result.expiresAt || Date.parse(result.expiresAt) <= Date.parse(this.policy.repo.clock.now())) this.cached.delete(cachedKey);
      if (options.refresh) this.cached.delete(key);
      const reuse = (value: CapabilityResult, cache: 'hit' | 'shared' | 'miss') => {
        signal.throwIfAborted();
        this.policy.validate(handle);
        if (this.capabilities.get(name) !== entry) throw new HarnessError('provider_changed', '这份来源的读法刚刚换了，可以重新展开当前用法再接着查。');
        if (d.effect === 'read' && this.policy.repo.domainRevision !== domainRevision)
          throw new HarnessError('source_changed', '读取期间资料更新了，这次结果先放下；沿原查询重新读，就能接上当前内容。');
        const result = structuredClone(value), bytes = Buffer.byteLength(JSON.stringify(result));
        if (bytes > d.maxBytes) throw new HarnessError('output_budget', '这次返回的资料太长，还没能完整带回来。可以按日期、类别或较短片段分开读，保留原来的查询目标。');
        budget.bytes += bytes;
        if (result.status === 'fresh' && result.expiresAt && Date.parse(result.expiresAt) <= Date.parse(this.policy.repo.clock.now())) result.status = 'stale';
        if (cache !== 'miss') this.audit({ id: attemptId, capability: name, providerId: m.id, version: d.version, status: result.status, scopeId: handle.id, simulated: m.simulated, bytes, cache });
        const observationId = (result.data as { observationId?: unknown } | undefined)?.observationId;
        if (typeof observationId === 'string') options.onVisualPrepared?.(observationId);
        return result;
      };
      const cached = !options.refresh && d.effect === 'read' && s.retention !== 'session_only' ? this.cached.get(key) : undefined;
      if (cached?.expiresAt && Date.parse(cached.expiresAt) > Date.parse(this.policy.repo.clock.now())) {
        return reuse(cached, 'hit');
      }
      const unavailable = this.readBackoff.get(key);
      if (unavailable && unavailable.until > Date.parse(this.policy.repo.clock.now()) && !options.refresh)
        return reuse(unavailable.result, 'hit');
      this.readBackoff.delete(key);
      const existing = d.effect === 'read' && !options.refresh ? this.inFlight.get(flightKey) : undefined;
      if (existing && !existing.controller.signal.aborted) return reuse(await this.waitFor(existing, signal), 'shared');
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new HarnessError('provider_timeout', d.effect === 'read'
          ? '这份来源等到现在还没返回，稍后可在当前允许的范围内沿同一查询重新读取。'
          : '这次还没收到办理结果，是否办成要沿同一原行动核对；先查当前结果，再决定后续修改。')),
        d.timeoutMs,
      );
      this.active.add(controller);
      const flight: SharedInvocation = { controller, promise: undefined!, waiters: new Set(), settled: false };
      const invocation = this.context(
        handle,
        name,
        controller,
        options.actionAttempt?.key || options.inspectKey || options.cancelKey,
        options.onVisualPrepared,
      );
      const bounded = async <T>(operation: () => Promise<T> | T): Promise<T> => {
        let cancelled!: () => void;
        const interrupted = new Promise<never>((_resolve, reject) => {
          cancelled = () => reject(controller.signal.reason);
          controller.signal.addEventListener('abort', cancelled, { once: true });
          if (controller.signal.aborted) cancelled();
        });
        try {
          return await Promise.race([Promise.resolve().then(operation), interrupted]);
        } finally {
          controller.signal.removeEventListener('abort', cancelled);
        }
      };
      const run = async (): Promise<CapabilityResult> => {
        try {
          let raw: unknown;
          if (options.inspectKey) {
            if (!d.supportsInspect || !provider.inspect)
              return {
                status: 'unsupported',
                sourceId: m.sourceId,
                reason: '这个来源还没有可回查结果的入口，需要到原服务看看刚才办成了没有。',
                simulated: m.simulated,
              };
            raw = await bounded(() => provider.inspect!(name, options.inspectKey!, invocation));
          } else if (options.cancelKey) {
            if (!d.supportsCancel || !provider.cancel)
              return {
                status: 'unsupported',
                sourceId: m.sourceId,
                reason: '这个来源还没有直接撤回的入口，可以到原服务查看有哪些取消办法。',
                simulated: m.simulated,
              };
            raw = await bounded(() => provider.cancel!(name, options.cancelKey!, invocation));
          } else raw = await bounded(() => provider.invoke(name, parsed, invocation));
          controller.signal.throwIfAborted();
          this.policy.validate(handle);
          if (this.capabilities.get(name) !== entry) throw new HarnessError('provider_changed', '这份来源的读法刚刚换了，可以重新展开当前用法再接着查。');
          const bytes = Buffer.byteLength(JSON.stringify(raw));
          if (bytes > d.maxBytes)
            throw new HarnessError('output_budget', '这次返回的资料太长，还没能完整带回来。可以按日期、类别或较短片段分开读，保留原来的查询目标。');
          const checkedResult = resultSchema.safeParse(raw);
          if (!checkedResult.success) {
            throw new CapabilityValidationError('result', checkedResult.error);
          }
          const result = checkedResult.data as CapabilityResult;
          if (result.sourceId !== m.sourceId || result.simulated !== m.simulated)
            throw new HarnessError('provenance_mismatch', '这次返回的出处或资料类型与原来源没有对上，暂时还没有可采用的结果；可以回到原来源重新核对。');
          if (result.data !== undefined) {
            const checkedData = d.output.safeParse(result.data);
            if (!checkedData.success) {
              throw new CapabilityValidationError('result', checkedData.error);
            }
            result.data = checkedData.data;
          }
          if (
            result.status === 'fresh' &&
            result.expiresAt &&
            Date.parse(result.expiresAt) <= Date.parse(this.policy.repo.clock.now())
          )
            result.status = 'stale';
          if (result.status === 'known_absent' && result.coverage?.complete !== true)
            throw new HarnessError('incomplete_absence', '这份资料还没看全，空白部分仍可能有安排或条件；可以沿原查询继续读取。');
          if (d.effect === 'read' && this.policy.repo.domainRevision !== domainRevision)
            throw new HarnessError('source_changed', '读取期间资料更新了，这次结果先放下；沿原查询重新读，就能接上当前内容。');
          if (d.effect === 'read' && s.retention !== 'session_only' && result.status === 'fresh' && result.expiresAt && this.inFlight.get(flightKey) === flight) {
            this.cached.set(key, structuredClone(result));
            while (this.cached.size > 64) this.cached.delete(this.cached.keys().next().value!);
          }
          // A physical read still occurred when its first waiter cancelled
          // and a sibling received the result. Preserve that distinct receipt.
          this.audit({ id: attemptId, capability: name, providerId: m.id, version: d.version, status: result.status,
            scopeId: handle.id, simulated: m.simulated, bytes, cache: 'miss' });
          return result;
        } finally {
          flight.settled = true;
          clearTimeout(timer);
          this.active.delete(controller);
          if (this.inFlight.get(flightKey) === flight) this.inFlight.delete(flightKey);
        }
      };
      flight.promise = run();
      if (d.effect === 'read') this.inFlight.set(flightKey, flight);
      return reuse(await this.waitFor(flight, signal), 'miss');
    } catch (error) {
      if (signal.aborted) throw error;
      const code =
        error instanceof HarnessError
          ? error.code
          : error instanceof z.ZodError
            ? 'schema_rejected'
            : 'provider_failed';
      this.rejections.push({ capability: name, code });
      if (this.rejections.length > 128) this.rejections.splice(0, this.rejections.length - 128);
      const forbidden = [
        'forbidden',
        'source_forbidden',
        'scope_mismatch',
        'approval_required',
        'invalid_attempt',
        'stale_scope',
        'scope_expired',
        'forged_scope',
        'child_write',
        'egress_forbidden',
        'effect_mismatch',
      ].includes(code);
      if (d.effect !== 'read' && !forbidden) throw error; // An action timeout must reach ActionRuntime as outcome_unknown.
      const status: KnowledgeStatus = forbidden ? 'forbidden' : 'failed';
      this.audit({
        id: attemptId,
        capability: name,
        providerId: m.id,
        version: d.version,
        status,
        scopeId: handle.id,
        simulated: m.simulated,
        bytes: 0,
      });
      const result: CapabilityResult = {
        status,
        sourceId: m.sourceId,
        reason: error instanceof HarnessError ? error.message : '这次来源还没给出可用结果，可以在当前允许的范围内换一个来源继续查。',
        ...(error instanceof CapabilityValidationError ? { validation: error.validation } : {}),
        simulated: m.simulated,
      };
      if (readKey && allowReadBackoff
        && ['provider_failed', 'provider_timeout', 'weather_failed', 'weather_incomplete'].includes(code)) {
        this.readBackoff.set(readKey, { until: Date.parse(this.policy.repo.clock.now()) + 2000, result });
        while (this.readBackoff.size > 64) this.readBackoff.delete(this.readBackoff.keys().next().value!);
      }
      return result;
    }
  }
  async runRecipes(contract: ContextContract, text: string, work: WorkService, signal: AbortSignal) {
    const facts: Record<string, TypedValue> = {},
      results: { key: string; capability: string; result: CapabilityResult }[] = [];
    const updatedOptions: import('../../shared/harness').WorkRecord[] = [];
    for (const recipe of this.matchRecipes(text))
      for (const need of recipe.needs) {
        if (!need.capability || !recipe.capabilities.includes(need.capability)) continue;
        const result = await this.invoke(contract.scope, need.capability, need.args, signal);
        results.push({ key: need.key, capability: need.capability, result });
        const data = result.data as { available?: boolean; affordances?: string[] } | undefined;
        if (result.status === 'fresh' && typeof data?.available === 'boolean')
          facts['capability:' + need.capability] = { type: 'boolean', value: data.available };
      }
    if (Object.keys(facts).length && this.policy.can(contract.scope, 'work:write')) {
      const updated = work.revalidateRejections(contract.scope, facts);
      updatedOptions.push(...updated);
      for (const option of updated) {
        const checks = results.filter((r) => r.result.status === 'fresh'),
          expiresAt = checks
            .map(
              (r) =>
                r.result.expiresAt ||
                new Date(Date.parse(this.policy.repo.clock.now()) + 300000).toISOString(),
            )
            .sort()[0];
        work.update(contract.scope, option.id, option.revision, {
          data: {
            ...option.data,
            rejectionCheckExpiresAt: expiresAt,
            checkedCapabilities: checks.map((r) => r.capability),
          },
        });
        for (const check of checks)
          for (const grant of this.capabilities.get(check.capability)?.definition.requiredScopes || [])
            this.policy.repo.addDependency(contract.scope, {
              consumerId: option.id,
              producerId: 'grant:' + grant,
              producerRevision: contract.policyRevision,
              sensitivity: 'privacy',
              invalidation: 'block',
            });
      }
    }
    return { results, updatedOptions };
  }
}
