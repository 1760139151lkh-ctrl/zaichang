import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MODEL_REQUEST_TIMEOUT_MS, MODEL_WIRE_LIMITS, ProviderError, normalizeTransportError, readSSE, ssePendingCharacterLimit, toolArgumentCharacterLimit, type Completion, type CompletionOptions, type ModelWireMessage, type ProviderMetadata, type ToolSpec, type WireMessage } from './provider';
import modelContract from '../shared/model-contract.json';

export const LUNA_MODEL = modelContract.luna.model;
export const LUNA_DISPLAY_NAME = modelContract.luna.displayName;
export const LUNA_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
// Hermes reserves separate return time for model RPCs. Ordinary tools and
// child/authority lifetimes retain their own, shorter cancellation boundaries.
export const LUNA_REQUEST_TIMEOUT_MS = MODEL_REQUEST_TIMEOUT_MS;
export const LUNA_SUBSTITUTE = { providerId: 'openai-app-server', model: LUNA_MODEL, temporaryTestSubstitute: true, replaces: 'deepseek-flash', reasoningEffort: 'max', requestTimeoutMs: LUNA_REQUEST_TIMEOUT_MS } as const;
type Item = Record<string, any>;
const LUNA_PROTOCOL_PREFIX = 'zaichang-luna:';
const TRANSPORT_IDLE_MS = 15000;

function waitFor<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => {
      signal.removeEventListener('abort', abort); reject(error);
    });
    if (signal.aborted) abort();
  });
}

type LunaDependencies = { fetcher?: typeof fetch; executable?: string; spawn?: typeof spawn };
type TransportRequest = {
  admitted: boolean;
  handle: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  fail: (error: unknown) => void;
};

/** Only the authenticated pipe is shared. Each request has its own ephemeral
 * thread and one-use route; the real prompt never enters App Server history. */
class LunaTransport {
  readonly ready: Promise<void>;
  closed = false;
  reusable = true;
  cwd = '';
  port = 0;
  config: Record<string, unknown> = {};
  readonly requests = new Map<string, TransportRequest>();
  readonly turns = new Map<string, () => void>();
  private readonly pending = new Map<number, { resolve(value: any): void; reject(error: unknown): void }>();
  private readonly server = createServer((request, response) => {
    const active = request.method === 'POST' && this.requests.get(request.url || '');
    if (!active || active.admitted || this.closed) { response.writeHead(404).end(); return; }
    active.admitted = true;
    void active.handle(request, response).catch(active.fail);
  });
  private child?: ChildProcessWithoutNullStreams;
  private nextId = 0;
  private leases = 0;
  private authMode: string | null | undefined;
  private idle?: ReturnType<typeof setTimeout>;
  private readonly onExit = () => this.close(new DOMException('Model transport closed', 'AbortError'));

  constructor(private readonly dependencies: LunaDependencies, private readonly accountChanged: () => void) {
    process.once('beforeExit', this.onExit);
    process.once('exit', this.onExit);
    this.ready = this.initialize().catch(error => { this.close(error); throw error; });
    this.ready.catch(() => {});
  }
  retain() {
    if (this.closed) throw new ProviderError('App Server 代测进程已结束。', false, 'transport');
    clearTimeout(this.idle); this.idle = undefined; this.leases++;
    this.reference(true);
  }
  release() {
    this.leases--;
    if (this.closed || this.leases) return;
    if (!this.reusable) { this.close(); return; }
    this.reference(false);
    this.idle = setTimeout(() => this.close(), TRANSPORT_IDLE_MS);
    this.idle.unref();
  }
  retire() { this.reusable = false; if (!this.leases) this.close(); }
  private reference(active: boolean) {
    if (active) { this.server.ref(); this.child?.ref(); } else { this.server.unref(); this.child?.unref(); }
    for (const stream of [this.child?.stdin, this.child?.stdout, this.child?.stderr])
      if (stream instanceof Socket) { if (active) stream.ref(); else stream.unref(); }
  }
  rpc(method: string, params: unknown): Promise<any> {
    if (this.closed || !this.child) return Promise.reject(new ProviderError('App Server 代测进程已结束。', false, 'transport'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.child!.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => {
        if (error) { this.pending.delete(id); reject(new ProviderError('App Server 暂时无法接收请求。', false, 'transport')); }
      });
    });
  }
  close(reason: unknown = new DOMException('Model transport closed', 'AbortError')) {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.idle);
    process.removeListener('beforeExit', this.onExit); process.removeListener('exit', this.onExit);
    for (const request of this.requests.values()) request.fail(reason);
    this.requests.clear(); this.turns.clear();
    for (const call of this.pending.values()) call.reject(reason);
    this.pending.clear();
    const cleanup = () => { if (this.cwd) void rmdir(this.cwd).catch(() => {}); };
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) {
      this.reference(true);
      this.child.once('exit', cleanup); this.child.kill();
    } else cleanup();
    this.server.closeAllConnections(); this.server.close();
  }
  private async initialize() {
    this.cwd = await mkdtemp(path.join(tmpdir(), 'zaichang-luna-'));
    if (this.closed) { await rmdir(this.cwd).catch(() => {}); throw new DOMException('Model boundary invalidated', 'AbortError'); }
    await new Promise<void>((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve); });
    if (this.closed) throw new DOMException('Model boundary invalidated', 'AbortError');
    this.port = (this.server.address() as { port: number }).port;
    const features = Object.fromEntries(['shell_tool', 'unified_exec', 'shell_snapshot', 'multi_agent', 'apps', 'plugins', 'remote_plugin', 'browser_use', 'computer_use', 'image_generation', 'memories', 'hooks', 'goals', 'skill_search', 'sleep_tool', 'workspace_dependencies', 'context_management', 'code_mode', 'view_image'].map(name => [name, false]));
    this.config = { features, web_search: 'disabled', tools: { view_image: false }, project_doc_max_bytes: 0, history: { persistence: 'none' }, model_context_window: 1_000_000, model_auto_compact_token_limit: 999_999_999 };
    this.child = (this.dependencies.spawn || spawn)(this.dependencies.executable || lunaExecutable(), ['app-server', ...Object.entries(features).flatMap(([name, value]) => ['-c', `features.${name}=${value}`])], { cwd: this.cwd, env: lunaEnvironment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;
    this.child.stderr.resume();
    this.child.on('error', () => this.close(new ProviderError('App Server 代测进程暂时无法启动。', false, 'transport')));
    this.child.on('exit', () => this.close(new ProviderError('App Server 代测进程已结束。', false, 'transport')));
    createInterface({ input: this.child.stdout }).on('line', line => {
      try {
        const message = JSON.parse(line);
        if (message.id !== undefined && !message.method) {
          const call = this.pending.get(message.id); if (!call) return;
          this.pending.delete(message.id);
          message.error ? call.reject(new ProviderError('App Server 未接受代测协议。', false, 'protocol')) : call.resolve(message.result);
        } else if (message.id !== undefined) {
          this.child?.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Model transport exposes no native tool executor.' } }) + '\n');
        } else if (message.method === 'turn/completed') this.turns.get(message.params?.threadId)?.();
        // Initial auth is announced lazily when the first thread starts.
        else if (message.method === 'account/updated') {
          const mode = typeof message.params?.authMode === 'string' ? message.params.authMode : null;
          if (mode === null || this.authMode !== undefined && mode !== this.authMode) this.accountChanged();
          this.authMode = mode;
        } else if (message.method === 'account/login/completed' && message.params?.success && this.authMode !== undefined) this.accountChanged();
      } catch { this.close(new ProviderError('App Server 返回了无效传输帧。', false, 'protocol')); }
    });
    await this.rpc('initialize', { clientInfo: { name: 'zaichang_luna_test_transport', version: '1' }, capabilities: { experimentalApi: true } });
    this.child.stdin.write('{"method":"initialized"}\n');
    const inherited = await this.rpc('config/read', { cwd: this.cwd, includeLayers: false });
    this.config.mcp_servers = Object.fromEntries(Object.keys(inherited.config?.mcp_servers || {}).map(name => [name, { enabled: false }]));
  }
}

/** This temporary Max contract applies to every role, including legacy callers
 * that request a lower effort. Explicit no-thinking comparisons remain none. */
function lunaReasoningEffort(options?: CompletionOptions) {
  return options?.thinking === 'disabled' ? 'none' : LUNA_SUBSTITUTE.reasoningEffort;
}

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

/** Translate protocol roles and native image parts; never summarize source text. */
export function lunaInput(messages: ModelWireMessage[], opaque: (id: string) => Item[] | undefined = decodeProtocol): Item[] {
  return messages.flatMap(message => {
    if (message.role === 'assistant' && message.reasoning_content?.startsWith(LUNA_PROTOCOL_PREFIX)) {
      const items = opaque(message.reasoning_content);
      if (items) return structuredClone(items);
    }
    if (message.role === 'tool') return [{ type: 'function_call_output', call_id: message.tool_call_id, output: typeof message.content === 'string' ? message.content : (message.content || []).map(part => part.type === 'text' ? { type: 'input_text', text: part.text } : { type: 'input_image', image_url: part.image_url.url, detail: 'original' }) }];
    const result: Item[] = [];
    if (message.content) result.push({ type: 'message', role: message.role === 'system' ? 'developer' : message.role, content: typeof message.content === 'string'
      ? [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.content }]
      : message.content.map(part => part.type === 'text' ? { type: 'input_text', text: part.text } : { type: 'input_image', image_url: part.image_url.url, detail: 'original' }) });
    for (const call of message.tool_calls || []) result.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments });
    return result;
  });
}

export function lunaRequest(messages: ModelWireMessage[], tools: ToolSpec[], options: CompletionOptions = {}, opaque?: (id: string) => Item[] | undefined) {
  return {
    model: LUNA_MODEL, instructions: '', input: lunaInput(messages, opaque),
    tools: tools.map(tool => ({ type: 'function', ...tool.function, strict: Boolean(options.strict) })),
    tool_choice: options.toolChoice ? { type: 'function', name: options.toolChoice.function.name } : 'auto',
    parallel_tool_calls: true, reasoning: { effort: lunaReasoningEffort(options) },
    store: false, stream: true, include: ['reasoning.encrypted_content'],
  };
}

/** Account-backed test transport. Hermes remains the only application loop.
 * App Server authenticates a single ephemeral request to a secret loopback URL.
 * The bridge replaces Codex's automatic prompt/tools with the exact Harness
 * request. Actual Responses items go directly to Hermes; a transport-only ACK
 * ends the App Server turn, so no model-selected native tool can execute there.
 * Tokens are forwarded in memory only to the fixed official endpoint.
 */
export class AppServerLunaClient {
  readonly model = LUNA_MODEL;
  readonly capabilities = { providerId: LUNA_SUBSTITUTE.providerId, protocol: 'app-server-responses', protocolVersion: 'single-completion-v1', version: 'single-completion-v1', modalities: ['text', 'image'], toolDialect: 'function_calls', endpoint: LUNA_ENDPOINT, strictEndpoint: LUNA_ENDPOINT, thinking: true, reasoningContent: true, toolCalls: true, toolContinuation: true, strictTools: true, structuredOutput: false, opaqueState: 'bounded_tool_chain' };
  private protocol = new WeakMap<Completion, string>();
  private controllers = new Set<AbortController>();
  private transport?: LunaTransport;
  private readonly transports = new Set<LunaTransport>();
  private accountIdentity?: string;
  constructor(private dependencies: LunaDependencies = {}) {}
  providerMetadata(options?: CompletionOptions): ProviderMetadata {
    return { ...LUNA_SUBSTITUTE, reasoningEffort: lunaReasoningEffort(options), endpoint: LUNA_ENDPOINT, protocol: this.capabilities.protocol, protocolVersion: this.capabilities.protocolVersion, capabilities: { ...this.capabilities }, limits: { maxOutputTokens: options?.maxOutputTokens || 4096, contextTokens: 1_000_000, outputEnforcement: 'advisory' } };
  }
  assistantMessage(result: Completion): WireMessage {
    return { role: 'assistant', content: result.content || null, ...(result.tool_calls.length ? { tool_calls: result.tool_calls } : {}), ...(this.protocol.has(result) ? { reasoning_content: this.protocol.get(result) } : {}) };
  }
  invalidateBoundary() {
    this.protocol = new WeakMap();
    this.accountIdentity = undefined;
    for (const controller of this.controllers) controller.abort(new DOMException('Model boundary invalidated', 'AbortError'));
    for (const transport of this.transports) transport.close();
    this.transports.clear(); this.transport = undefined;
  }
  async complete(messages: ModelWireMessage[], tools: ToolSpec[], callerSignal: AbortSignal, onText?: (text: string) => void, options?: CompletionOptions): Promise<Completion> {
    const boundary = new AbortController(); this.controllers.add(boundary);
    const signal = AbortSignal.any([callerSignal, boundary.signal, AbortSignal.timeout(LUNA_REQUEST_TIMEOUT_MS)]);
    let deliveredText = false;
    try {
    for (let attempt = 0; attempt < (options?.allowTransportRetry === false ? 1 : 2); attempt++) {
      signal.throwIfAborted();
      try {
        const result = await this.completeOnce(messages, tools, signal, onText ? text => { deliveredText = true; onText(text); } : undefined, options);
        result.transportAttempts = attempt + 1;
        if (result.usage) result.usage = { ...result.usage, physical_attempts: attempt + 1, unreported_attempts: attempt };
        return result;
      } catch (error) {
        options?.onToolCallProgress?.({ kind: 'reset' });
        if (error instanceof ProviderError && error.code === 'authentication') this.invalidateBoundary();
        const transient = error instanceof ProviderError ? error.retryable : error instanceof TypeError && ['terminated', 'fetch failed'].includes(error.message);
        if (signal.aborted || deliveredText || !transient || attempt || options?.allowTransportRetry === false) {
          if (error && typeof error === 'object') Object.assign(error, { transportAttempts: attempt + 1 });
          throw normalizeTransportError(error, signal);
        }
        await abortableDelay(500, signal);
      }
    }
    throw new ProviderError('Luna 代测连接暂时不可用。', false, 'transport');
    } catch (error) {
      if (signal.aborted && !callerSignal.aborted && !boundary.signal.aborted) {
        const timeout = new ProviderError('这次 Luna 模型请求超时，尚未完成的部分可以继续处理。', false, 'request_timeout');
        Object.assign(timeout, { transportAttempts: Number((error as any)?.transportAttempts || 1) });
        throw timeout;
      }
      throw error;
    } finally { this.controllers.delete(boundary); }
  }
  private async completeOnce(messages: ModelWireMessage[], tools: ToolSpec[], callerSignal: AbortSignal, onText?: (text: string) => void, options?: CompletionOptions): Promise<Completion> {
    callerSignal.throwIfAborted();
    if (options?.maxOutputTokens !== undefined && (!Number.isInteger(options.maxOutputTokens) || options.maxOutputTokens < 256 || options.maxOutputTokens > 32768)) throw new ProviderError('本轮输出预算不合法。');
    const body = lunaRequest(messages, tools, options);
    const controller = new AbortController(); this.controllers.add(controller);
    const signal = AbortSignal.any([callerSignal, controller.signal, AbortSignal.timeout(LUNA_REQUEST_TIMEOUT_MS)]);
    const transport = this.transport && !this.transport.closed && this.transport.reusable ? this.transport : (this.transport = new LunaTransport(this.dependencies, () => this.invalidateBoundary()));
    for (const previous of this.transports) if (previous.closed) this.transports.delete(previous);
    this.transports.add(transport);
    transport.retain();
    const route = '/' + randomUUID();
    let threadId: string | undefined, turnId: string | undefined, nativeFinished = false, succeeded = false;
    let threadStarted: Promise<any> | undefined, turnStarted: Promise<any> | undefined;
    let nativeDone!: () => void;
    const nativeEnded = new Promise<void>(resolve => { nativeDone = resolve; });
    let resolve!: (value: Completion) => void, reject!: (reason: unknown) => void;
    const completion = new Promise<Completion>((yes, no) => { resolve = yes; reject = no; });
    // Avoid unhandled rejection while initialize/thread/start are outstanding.
    completion.catch(() => {});
    let admitted = false;
    const active: TransportRequest = { admitted: false, fail: error => { controller.abort(error); reject(error); }, handle: async (request, response) => {
      if (signal.aborted) { response.writeHead(404).end(); return; }
      admitted = true;
      let transportAttempts = 0;
      try {
      // App Server's generated prompt is neither persisted nor sent upstream.
      let bytes = 0; for await (const chunk of request) { bytes += chunk.length; if (bytes > 8_000_000) { response.writeHead(413).end(); reject(new ProviderError('App Server 请求超过传输上限。')); return; } }
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith('Bearer ')) { response.writeHead(401).end(); reject(new ProviderError('App Server 尚未登录，请先在 Codex 登录。', false, 'authentication', 401)); return; }
        const account = request.headers['chatgpt-account-id'];
        if (typeof account === 'string') {
          if (this.accountIdentity !== undefined && this.accountIdentity !== account) {
            this.invalidateBoundary();
            throw new ProviderError('模型账号已改变，这次连接已停止。', false, 'authentication');
          }
          this.accountIdentity = account;
        }
        const headers: Record<string, string> = { authorization, 'content-type': 'application/json', accept: 'text/event-stream', 'openai-beta': 'responses=experimental' };
        for (const name of ['chatgpt-account-id', 'originator', 'user-agent']) { const value = request.headers[name]; if (typeof value === 'string') headers[name] = value; }
        const fetcher = this.dependencies.fetcher || fetch;
        transportAttempts++;
        const upstream = await fetcher(LUNA_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body), signal, redirect: 'error' });
        if (!upstream.ok) {
          const status = upstream.status;
          // Error bodies can echo input; only transport status is exposed.
          await upstream.body?.cancel();
          throw new ProviderError(`Luna 代测请求未完成（HTTP ${status}）。`, status === 429 || status >= 500, status === 401 ? 'authentication' : status === 402 ? 'quota' : status === 429 ? 'rate_limit' : 'protocol', status);
        }
        let ended = false, finalOutputAvailable = false, content = '', responseModel: string | undefined, usage: Completion['usage'];
        const items: Item[] = [];
        const itemKinds = new Map<string, { type: string; role?: string }>(), partKinds = new Map<string, string>();
        await readSSE(upstream, data => {
          signal.throwIfAborted();
          if (!data || data === '[DONE]') return;
          const event = JSON.parse(data);
          if (['response.output_item.added', 'response.output_item.done'].includes(event.type)
            && typeof event.item?.id === 'string' && typeof event.item.type === 'string')
            itemKinds.set(event.item.id, { type: event.item.type, role: event.item.role });
          if (event.type === 'response.content_part.added' && typeof event.item_id === 'string'
            && Number.isInteger(event.content_index) && typeof event.part?.type === 'string')
            partKinds.set(event.item_id + ':' + event.content_index, event.part.type);
          if (event.type === 'response.output_item.added' && event.item?.type === 'function_call'
            && typeof event.item.call_id === 'string' && event.item.call_id
            && tools.some(tool => tool.function.name === event.item.name))
            options?.onToolCallProgress?.({ kind: 'call', id: event.item.call_id, name: event.item.name });
          if (event.type === 'response.output_text.delta') {
            const item = itemKinds.get(event.item_id), part = partKinds.get(event.item_id + ':' + event.content_index);
            if (typeof event.delta !== 'string' || item && (item.type !== 'message' || item.role !== 'assistant')
              || part && part !== 'output_text')
              throw new ProviderError('Luna 返回的正文与原消息类型没有对应上。', false, 'protocol', undefined, usage);
            content += event.delta;
            if (content.length > MODEL_WIRE_LIMITS.textCharacters) throw new ProviderError('回复达到本次长度上限。');
            onText?.(event.delta);
          }
          if (event.type === 'response.output_item.done') items.push(event.item);
          if (event.response?.usage) {
            const value = event.response.usage;
            usage = { prompt_tokens: value.input_tokens, completion_tokens: value.output_tokens, total_tokens: value.total_tokens,
              ...(typeof value.input_tokens_details?.cached_tokens === 'number' ? { prompt_cache_hit_tokens: value.input_tokens_details.cached_tokens } : {}),
              providerId: LUNA_SUBSTITUTE.providerId, model: LUNA_MODEL };
          }
          if (event.type === 'response.incomplete') throw new ProviderError('Luna 代测回复达到长度上限。', false, 'output_length', undefined, usage);
          if (event.type === 'error' || event.type === 'response.failed') throw new ProviderError('Luna 代测服务中断了本次请求。', false, 'protocol', undefined, usage);
          if (event.type === 'response.completed') {
            if (event.response.model !== LUNA_MODEL) throw new ProviderError('App Server 未确认指定模型，代测已停止。', false, 'model_mismatch');
            responseModel = event.response.model;
            ended = true;
            // A completion may carry items for which no item-done event was
            // emitted. Its nonempty final list is authoritative, not an
            // additive duplicate of the partial streamed list.
            if (Array.isArray(event.response.output) && event.response.output.length) {
              finalOutputAvailable = true;
              items.splice(0, items.length, ...event.response.output);
            }
          }
        }, signal, ssePendingCharacterLimit(tools));
        if (!ended) throw new ProviderError('Luna 代测连接在完成前断开。', false, 'protocol', undefined, usage);
        const tool_calls = items.filter(item => item.type === 'function_call').map(item => ({ id: item.call_id, type: 'function' as const, function: { name: item.name, arguments: item.arguments } }));
        if (tool_calls.length > 8 || tool_calls.some(call => !call.id || !tools.some(tool => tool.function.name === call.function.name) || call.function.arguments.length > toolArgumentCharacterLimit(call.function.name))) throw new ProviderError('Luna 返回了不在本轮工具契约内的请求。', false, 'protocol', undefined, usage);
        if (items.some(item => !['message', 'reasoning', 'function_call'].includes(item.type))) throw new ProviderError('Luna 返回了额外原生工具，代测已停止。', false, 'protocol', undefined, usage);
        const completedText = items.filter(item => item.type === 'message' && item.role === 'assistant')
          .flatMap(item => Array.isArray(item.content) ? item.content : [])
          .filter(part => part.type === 'output_text' && typeof part.text === 'string').map(part => part.text).join('');
        if (finalOutputAvailable || completedText) content = completedText;
        if (content.length > MODEL_WIRE_LIMITS.textCharacters) throw new ProviderError('回复达到本次长度上限。', false, 'output_length', undefined, usage);
        if (!content && !tool_calls.length) throw new ProviderError('Luna 没有返回可用内容。', false, 'empty_response', undefined, usage);
        if (usage && transportAttempts > 1) usage = { ...usage, physical_attempts: transportAttempts, unreported_attempts: transportAttempts - 1 };
        const result: Completion = { content, tool_calls, usage, transportAttempts, responseModel };
        const protocol = JSON.stringify(items);
        if (protocol.length > MODEL_WIRE_LIMITS.opaqueCharacters) throw new ProviderError('Luna 协议状态超过传输长度范围。', false, 'protocol_budget', undefined, usage);
        // Same lifecycle as DeepSeek reasoning_content: the host's bounded,
        // scoped in-memory protocol chain carries this across client instances.
        signal.throwIfAborted();
        this.protocol.set(result, LUNA_PROTOCOL_PREFIX + protocol);
        // A transport ACK only. The actual model result is never interpreted by
        // Codex's execution loop and is returned exclusively through resolve().
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end('data: ' + JSON.stringify({ type: 'response.completed', response: { id: 'bridge_ack', status: 'completed', output: [] } }) + '\n\n');
        succeeded = true;
        resolve(result);
      } catch (error) {
        if (error && typeof error === 'object') Object.assign(error, { transportAttempts });
        if (!response.headersSent) response.writeHead(502);
        response.end(); reject(error);
      }
    } };
    transport.requests.set(route + '/responses', active);
    const abort = () => { reject(signal.reason); transport.requests.delete(route + '/responses'); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      await waitFor(transport.ready, signal);
      signal.throwIfAborted();
      const config = { ...transport.config, model_provider: 'zaichang_luna_test', model_providers: { zaichang_luna_test: { name: 'Luna temporary test transport', base_url: `http://127.0.0.1:${transport.port}${route}`, wire_api: 'responses', requires_openai_auth: true, request_max_retries: 0, stream_max_retries: 0 } } };
      threadStarted = transport.rpc('thread/start', { model: LUNA_MODEL, modelProvider: 'zaichang_luna_test', allowProviderModelFallback: false, cwd: transport.cwd, ephemeral: true, baseInstructions: 'Complete the transport request.', developerInstructions: '', environments: [], selectedCapabilityRoots: [], approvalPolicy: 'never', sandbox: 'read-only', config });
      const started = await waitFor(threadStarted, signal);
      if (started.model !== LUNA_MODEL || started.thread.ephemeral !== true) throw new ProviderError('App Server 模型或临时会话契约不符。', false, 'model_mismatch');
      threadId = started.thread.id;
      transport.turns.set(threadId!, () => {
        nativeFinished = true; nativeDone();
        if (!succeeded) active.fail(new ProviderError(admitted ? 'App Server 代测请求未完成。' : 'App Server 未发起模型请求。', false, admitted ? 'protocol' : 'authentication'));
      });
      turnStarted = transport.rpc('turn/start', { threadId, input: [{ type: 'text', text: 'Transport request.', text_elements: [] }], effort: body.reasoning.effort });
      const turn = await waitFor(turnStarted, signal); turnId = turn.turn?.id;
      return await waitFor(completion, signal);
    } finally {
      signal.removeEventListener('abort', abort); controller.abort(); this.controllers.delete(controller);
      transport.requests.delete(route + '/responses');
      if (threadId && transport.turns.has(threadId)) transport.turns.set(threadId, () => { nativeFinished = true; nativeDone(); });
      // The caller need not wait for a transport ACK. Retain only the native
      // IDs during bounded cleanup; no prompt, output or credentials are sent.
      void (async () => {
        const cleanupSignal = AbortSignal.timeout(2000);
        try {
          if (!threadId && threadStarted) threadId = (await waitFor(threadStarted, cleanupSignal)).thread?.id;
          if (!threadId || transport.closed) return;
          if (succeeded) await waitFor(nativeEnded, cleanupSignal);
          else if (!nativeFinished) {
            if (!turnId && turnStarted) turnId = (await waitFor(turnStarted, cleanupSignal)).turn?.id;
            if (turnId) await waitFor(transport.rpc('turn/interrupt', { threadId, turnId }), cleanupSignal);
          }
          await waitFor(transport.rpc('thread/unsubscribe', { threadId }), cleanupSignal);
        } catch {
          // Finish independent in-flight requests, then retire a process whose
          // native cleanup could not be acknowledged instead of retaining stubs.
          transport.retire();
        } finally { if (threadId) transport.turns.delete(threadId); transport.release(); }
      })();
    }
  }
}

function decodeProtocol(value: string): Item[] {
  if (value.length > LUNA_PROTOCOL_PREFIX.length + MODEL_WIRE_LIMITS.opaqueCharacters)
    throw new ProviderError('Luna 协议状态超过本轮上限。', false, 'protocol_budget');
  const items = JSON.parse(value.slice(LUNA_PROTOCOL_PREFIX.length));
  if (!Array.isArray(items) || items.some(item => !['message', 'reasoning', 'function_call'].includes(item.type))) throw new ProviderError('Luna 协议续接内容无效。', false, 'protocol');
  return items;
}

export function lunaEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { RUST_LOG: 'off' };
  for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'CODEX_HOME']) if (process.env[name]) env[name] = process.env[name];
  return env;
}
function lunaExecutable(): string {
  if (process.env.ZAICHANG_CODEX_EXECUTABLE && existsSync(process.env.ZAICHANG_CODEX_EXECUTABLE)) return process.env.ZAICHANG_CODEX_EXECUTABLE;
  const root = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  if (existsSync(root)) for (const entry of readdirSync(root).reverse()) { const file = path.join(root, entry, 'codex.exe'); if (existsSync(file)) return file; }
  throw new ProviderError('未找到 App Server CLI，Luna 代测无法启动。', false, 'runtime_unavailable');
}
