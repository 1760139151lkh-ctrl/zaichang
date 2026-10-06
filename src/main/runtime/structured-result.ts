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
  let formatIssue = '缺少完整指定工具调用。';
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = attempt ? [...input.messages, { role: 'system' as const, content: '上次结构未被采用。具体结构问题：' + formatIssue + ' 根据相同原始材料重新调用指定工具，简洁提交严格合法的JSON对象，补齐schema所需字段。不得为通过格式校验改变事实、权限或任务要求。' }] : input.messages;
    let result: Awaited<ReturnType<DeepSeekClient['complete']>>;
    try { result = await input.complete(messages, [input.tool], input.signal, undefined, input.options); }
    catch (error) {
      if (attempt !== 0 || !(error instanceof ProviderError) || !['output_length', 'empty_response'].includes(error.code)) throw error;
      formatIssue = error.code === 'empty_response' ? '模型没有返回指定结构，未采用任何判断。' : '输出长度耗尽，未取得完整结构。';
      input.signal.throwIfAborted();
      continue;
    }
    const calls = result.tool_calls.filter(call => call.function.name === input.tool.function.name);
    if (calls.length !== 1) continue;
    try {
      const parsed = input.schema.safeParse(JSON.parse(calls[0].function.arguments));
      if (parsed.success) return parsed.data;
      formatIssue = JSON.stringify(parsed.error.issues.slice(0, 8).map(issue => ({ field: issue.path.join('.'), code: issue.code, message: issue.message })));
    } catch { formatIssue = '工具参数不是有效的JSON对象。'; }
  }
  throw new HarnessError(input.failureCode, input.failureMessage);
}
