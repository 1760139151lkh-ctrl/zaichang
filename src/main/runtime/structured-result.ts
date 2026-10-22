import type { z } from 'zod';
import type { DeepSeekClient, ModelWireMessage, ToolSpec, CompletionOptions } from '../provider';
import { ProviderError } from '../provider';
import { HarnessError } from '../../shared/harness';

/** A malformed proposal gets one fresh bounded attempt; never relax its schema. */
export async function structuredResult<T>(input: {
  schema: z.ZodType<T>; tool: ToolSpec; messages: ModelWireMessage[];
  complete: DeepSeekClient['complete']; signal: AbortSignal; options: CompletionOptions;
  failureCode: string; failureMessage: string;
}): Promise<T> {
  let formatIssue = '这次还没有收到完整的判断。';
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = attempt ? [...input.messages, { role: 'system' as const, content: '刚才这份判断还没能完整读进来，具体卡在这里：' + formatIssue + ' 原来的材料仍在。可以再帮忙理一下，用同一个工具带回你的判断吗？字段说明写着各部分的含义，缺少的信息也可以照实际情况保留；原话、事实和对方的选择仍是我们要照顾的事情。' }] : input.messages;
    let result: Awaited<ReturnType<DeepSeekClient['complete']>>;
    try { result = await input.complete(messages, [input.tool], input.signal, undefined, input.options); }
    catch (error) {
      if (attempt !== 0 || !(error instanceof ProviderError) || !['output_length', 'empty_response'].includes(error.code)) throw error;
      formatIssue = error.code === 'empty_response' ? '这一次没有收到内容，还没有据此作决定。' : '这次内容在写完之前到了长度上限，完整的判断还没收到。';
      input.signal.throwIfAborted();
      continue;
    }
    const calls = result.tool_calls.filter(call => call.function.name === input.tool.function.name);
    if (calls.length !== 1) continue;
    try {
      const parsed = input.schema.safeParse(JSON.parse(calls[0].function.arguments));
      if (parsed.success) return parsed.data;
      formatIssue = JSON.stringify(parsed.error.issues.slice(0, 8).map(issue => ({ field: issue.path.join('.'), code: issue.code, message: issue.message })));
    } catch { formatIssue = '这份工具参数目前还无法按JSON对象读取。'; }
  }
  throw new HarnessError(input.failureCode, input.failureMessage);
}
