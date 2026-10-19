import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ModelWireMessage, ToolSpec } from '../provider';
import { HarnessError, type DelegatedTask } from '../../shared/harness';

export const HERMES_COMMIT = 'd595e636c83aa0b9606d4e914e1140ae9c796897';
const MAX_FRAME = 16 * 1024 * 1024;
export const HERMES_RPC_DEADLINE_MS = 175000;
export interface HermesChildSnapshot {
  privacyEpoch: number;
  policyRevision: number;
  taskVersion: number;
  domainRevision: number;
  objectVersions: { id: string; revision: number; kind?: string }[];
}
class RpcDeadlineError extends Error {
  readonly code = 'rpc_timeout';
  constructor() { super('这一步等待超时，结果尚未确认；已派发的操作需核对实际回执。'); }
}
export interface HermesRun {
  modelIdentity?: { model: string; providerId: string; temporaryTestSubstitute?: boolean };
  runId: string;
  parentRunId?: string;
  epoch: number;
  taskVersion: number;
  system: string;
  userMessage: ModelWireMessage['content'];
  history: ModelWireMessage[];
  tools: ToolSpec[];
  thinking: 'enabled' | 'disabled';
  maxIterations?: number;
  maxOutputTokens?: number;
  compression?: { enabled: boolean; thresholdTokens: number; forceInitial?: boolean };
  signal: AbortSignal;
  /** Mechanism probes may shorten the host deadline, never extend it. */
  rpcDeadlineMs?: number;
  validate: () => void | Promise<void>;
  model: (request: { messages: ModelWireMessage[]; tools?: ToolSpec[]; thinking?: { type: string }; [key: string]: unknown }, operationSignal?: AbortSignal) => Promise<{ assistant: ModelWireMessage; usage?: unknown }>;
  tool: (name: string, args: unknown, callId: string, agentId?: string, operationSignal?: AbortSignal) => Promise<unknown>;
  children?: {
    authorize: (args: unknown, callId: string, operationSignal?: AbortSignal) => Promise<void>;
    open: (task: DelegatedTask, operationSignal?: AbortSignal) => Promise<{ id: string; system: string; tools: ToolSpec[]; snapshot?: HermesChildSnapshot }>;
    event: (id: string, status: 'running' | 'produced' | 'failed') => unknown;
    result: (callId: string, result: unknown, operationSignal?: AbortSignal) => Promise<unknown>;
  };
  event?: (event: { kind: string; sequence: number; payload: unknown }) => void;
}
export interface HermesResult {
  compactions?: number;
  content: string;
  messages: ModelWireMessage[];
  interrupted: boolean;
}

/** Transport/state adapter only: the production model/tool loop lives in AIAgent. */
export async function runHermes(input: HermesRun): Promise<HermesResult> {
  input.signal.throwIfAborted();
  await input.validate();
  input.signal.throwIfAborted();
  const rpcDeadlineMs = input.rpcDeadlineMs ?? HERMES_RPC_DEADLINE_MS;
  if (!Number.isSafeInteger(rpcDeadlineMs) || rpcDeadlineMs <= 0 || rpcDeadlineMs > HERMES_RPC_DEADLINE_MS)
    throw new Error('Hermes RPC 截止时间只能在宿主上限内缩短。');
  const root = path.resolve(process.env.ZAICHANG_RUNTIME_ROOT || process.cwd());
  const bundledPython = path.join(root, '.runtime', 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
  const python = fs.existsSync(bundledPython) ? bundledPython : path.join(root, '.runtime', 'hermes-agent', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const script = path.join(root, 'runtime', 'hermes', 'sidecar.py');
  if (!fs.existsSync(python) || !fs.existsSync(script))
    return Promise.reject(new Error('Hermes 运行环境未安装，请运行 node scripts/setup-hermes.mjs。'));
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH'])
    if (process.env[key]) environment[key] = process.env[key];
  environment.PYTHONUTF8 = '1';
  environment.PYTHONDONTWRITEBYTECODE = '1';
  environment.HERMES_HOME = path.join(root, '.runtime', 'hermes-home');
  environment.ZAICHANG_HERMES_HOST = '1';
  const identity = { version: 1, run_id: input.runId, parent_run_id: input.parentRunId || null, epoch: input.epoch, task_version: input.taskVersion };
  return new Promise<HermesResult>((resolve, reject) => {
    const child = spawn(python, ['-I', '-X', 'utf8', '-B', script], { cwd: root, env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer: Buffer = Buffer.alloc(0), sequence = 0, sentSequence = 0, settled = false;
    const pending = new Set<Promise<void>>(), childIds = new Set<string>();
    const childSnapshots = new Map<string, string>();
    const operations = new Map<string, AbortController>();
    const close = (reason: unknown = input.signal.reason || new DOMException('Hermes 已结束', 'AbortError')) => {
      for (const controller of operations.values()) controller.abort(reason);
      operations.clear();
      input.signal.removeEventListener('abort', abort); child.stdin.destroy(); child.kill();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      close(error);
      reject(error instanceof Error ? error : new Error('Hermes 运行失败。'));
    };
    const abort = () => fail(input.signal.reason || new DOMException('已停止', 'AbortError'));
    const write = (frame: unknown) => {
      const data = Buffer.from(JSON.stringify({ ...(frame as object), sequence: ++sentSequence }));
      if (data.length > MAX_FRAME) throw new Error('Hermes 协议帧超限，原输入未被截断。');
      const prefix = Buffer.alloc(4); prefix.writeUInt32BE(data.length);
      child.stdin.write(Buffer.concat([prefix, data]));
    };
    const handle = async (frame: any, preceding: Promise<void>[]) => {
      if (settled) return;
      input.signal.throwIfAborted(); await input.validate(); input.signal.throwIfAborted();
      if (settled) return;
      input.event?.({ kind: frame.kind, sequence: frame.sequence, payload: frame.kind === 'run.error' || frame.kind === 'run.ready' ? frame.payload : undefined });
      if (frame.kind === 'run.error') throw new Error('Hermes 侧车失败：' + JSON.stringify(frame.payload));
      if (frame.kind === 'run.final') {
        // Validation can now await owner recovery. Capture predecessors before
        // registering this final frame so it never waits for its own promise.
        await Promise.all(preceding);
        if (settled) return;
        input.signal.throwIfAborted(); await input.validate(); input.signal.throwIfAborted();
        settled = true;
        close();
        resolve(frame.payload as HermesResult);
        return;
      }
      if (frame.kind === 'run.ready') return;
      if (!frame.request_id) throw new Error('Hermes 请求缺少配对标识。');
      const agentId = frame.payload.agent_id || input.runId;
      if (agentId !== input.runId && !childIds.has(agentId)) throw new Error('Hermes 子任务没有宿主许可。');
      if (childSnapshots.has(agentId) && JSON.stringify(frame.payload.snapshot) !== childSnapshots.get(agentId))
        throw new Error('Hermes 子任务快照与宿主批准的版本不匹配。');
      if (operations.has(frame.request_id)) throw new Error('重复的 Hermes 请求标识。');
      const controller = new AbortController();
      operations.set(frame.request_id, controller);
      const operationSignal = AbortSignal.any([input.signal, controller.signal]);
      const timer = setTimeout(() => controller.abort(new RpcDeadlineError()), rpcDeadlineMs);
      let onAbort!: () => void;
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(operationSignal.reason);
        operationSignal.addEventListener('abort', onAbort, { once: true });
        if (operationSignal.aborted) onAbort();
      });
      const dispatch = async () => {
        operationSignal.throwIfAborted(); await input.validate(); operationSignal.throwIfAborted();
        if (frame.kind === 'model.request') return input.model(frame.payload, operationSignal);
        if (frame.kind === 'tool.request') return input.tool(frame.payload.name, frame.payload.arguments, frame.payload.tool_call_id, agentId, operationSignal);
        if (frame.kind === 'delegate.authorize' && input.children && agentId === input.runId) {
          try {
            await input.children.authorize(frame.payload.arguments, frame.payload.tool_call_id, operationSignal);
            return { authorized: true };
          } catch (error) {
            operationSignal.throwIfAborted(); await input.validate(); operationSignal.throwIfAborted();
            return { authorized: false, error: { code: error instanceof HarnessError ? error.code : 'delegation_rejected',
              message: error instanceof HarnessError ? error.message : '独立调查未获当前范围许可，请核对来源与任务。' } };
          }
        }
        if (frame.kind === 'child.open' && input.children && agentId === input.runId) {
          const ticket = await input.children.open(frame.payload.task, operationSignal);
          operationSignal.throwIfAborted(); await input.validate(); operationSignal.throwIfAborted();
          if (childIds.has(ticket.id) || ticket.id === input.runId) throw new Error('重复的子任务标识。');
          if (ticket.snapshot) childSnapshots.set(ticket.id, JSON.stringify(ticket.snapshot));
          childIds.add(ticket.id); return ticket;
        }
        if (['child.started', 'child.finished'].includes(frame.kind) && input.children && childIds.has(agentId)) {
          const status = frame.kind === 'child.started' ? 'running' : frame.payload.status === 'produced' ? 'produced' : 'failed';
          const accepted = await input.children.event(agentId, status);
          return { received: true, status: ['running', 'produced', 'failed'].includes(String(accepted)) ? accepted : status };
        }
        if (frame.kind === 'delegate.result' && input.children && agentId === input.runId) {
          const accepted = await input.children.result(frame.payload.tool_call_id, frame.payload.result, operationSignal);
          return { received: true, result: accepted === undefined ? frame.payload.result : accepted };
        }
        throw new Error('未知或未授权的 Hermes 事件。');
      };
      try {
        const payload = await Promise.race([dispatch(), cancelled]);
        operationSignal.throwIfAborted(); await input.validate(); operationSignal.throwIfAborted();
        if (!settled) write({ ...identity, kind: 'response', request_id: frame.request_id, payload });
      } catch (error) {
        if (!(error instanceof RpcDeadlineError) || input.signal.aborted) throw error;
        await input.validate();
        if (!settled) write({ ...identity, kind: 'response', request_id: frame.request_id,
          error: { code: error.code, outcome: 'unknown', message: error.message } });
      } finally {
        clearTimeout(timer);
        operationSignal.removeEventListener('abort', onAbort);
        operations.delete(frame.request_id);
        controller.abort(new DOMException('本次 RPC 已结束', 'AbortError'));
      }
    };
    child.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        while (buffer.length >= 4) {
          const size = buffer.readUInt32BE(0);
          if (size < 2 || size > MAX_FRAME) throw new Error('Hermes 协议帧长度不合法。');
          if (buffer.length < size + 4) break;
          const frame = JSON.parse(buffer.subarray(4, size + 4).toString('utf8'));
          buffer = buffer.subarray(size + 4);
          if (frame.version !== 1 || frame.run_id !== input.runId || frame.epoch !== input.epoch || frame.task_version !== input.taskVersion || frame.parent_run_id !== identity.parent_run_id || frame.sequence !== ++sequence)
            throw new Error('Hermes 运行归属、版本或事件顺序不匹配。');
          const request = handle(frame, [...pending]).catch(async error => {
            const agentId = frame.payload?.agent_id;
            if (agentId && childIds.has(agentId) && ['model.request', 'tool.request'].includes(frame.kind) && !input.signal.aborted && !settled) {
              try {
                await input.validate();
                input.signal.throwIfAborted();
                write({ ...identity, kind: 'response', request_id: frame.request_id, error: { code: error?.code || 'child_call_failed' } });
                return;
              } catch { /* A parent boundary failure still stops the whole tree. */ }
            }
            fail(error);
          });
          pending.add(request);
          void request.finally(() => pending.delete(request));
        }
      } catch (error) { fail(error); }
    });
    child.stderr.resume(); // Sidecar stderr is never trusted as user-safe diagnostics.
    child.stdin.on('error', fail);
    child.on('error', fail);
    child.on('exit', code => { void Promise.all([...pending]).then(() => { if (!settled) fail(new Error('Hermes 提前退出，退出码 ' + code)); }); });
    input.signal.addEventListener('abort', abort, { once: true });
    write({ ...identity, kind: 'run.start', payload: { modelIdentity: input.modelIdentity, system: input.system, userMessage: input.userMessage, history: input.history, tools: input.tools, thinking: input.thinking, maxIterations: input.maxIterations || 12, maxOutputTokens: input.maxOutputTokens || 4096, compression: input.compression } });
  });
}
