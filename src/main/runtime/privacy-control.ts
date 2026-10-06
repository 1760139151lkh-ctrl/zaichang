import { z } from 'zod';
import type { DeepSeekClient, ToolSpec } from '../provider';
import { HarnessError } from '../../shared/harness';

const schema = z.object({ approved: z.boolean(), quote: z.string().max(3000), reason: z.string().max(600) }).strict();
export async function verifyPrivacyControl(original: string, operation: unknown, complete: DeepSeekClient['complete'], signal: AbortSignal, hostState?: unknown) {
  const { $schema: _, ...parameters } = z.toJSONSchema(schema);
  const tool: ToolSpec = { type: 'function', function: { name: 'verify_privacy_control', description: '核对具体停用、遗忘或撤权是否得到当前用户明确要求。', parameters } };
  const result = await complete([
    { role: 'system', content: '核对原始用户话语是否明确要求对给定对象停用、遗忘或撤权；区分讨论、引用、假设、抱怨与实际控制。遗忘会清理本机原文和派生资料，不能把暂时不用理解成删除，不能扩大目标对象。目标对象的text必须就是用户要忘掉的既有内容或理解；当前这句“请忘掉……”只是授权请求，删除它自身不能代替删除其中点名的旧内容。若目标只是当前控制请求，而被点名的旧内容仍未定位，approved=false并在reason说明应先查找对应理解/来源。信息不足则approved=false。批准必须引用当前用户逐字quote。只调用给定工具，不执行任何操作。' },
    { role: 'system', content: '这次提案会立即执行，核对的不只是目标，也包括是否已到用户授权的时机。用户要求未来某个条件触发后再处理，而当前尚未触发时，不批准提前操作。hostState.conversationRetention若已有结束清理登记，它由宿主对话生命周期执行；当前无需删除原话来证明登记成功。用户另外明确要求立刻处理的独立对象仍按它自己的范围判断。' },
    { role: 'user', content: JSON.stringify({ original, operation, executionTiming: 'immediate_current_turn', hostState }) },
  ], [tool], signal, undefined, { thinking: 'enabled', maxOutputTokens: 4096 });
  const call = result.tool_calls.find(c => c.function.name === tool.function.name);
  if (!call) throw new HarnessError('privacy_control_unknown', '这次要改动的内容还不明确，尚未删除或撤权。');
  const verdict = schema.parse(JSON.parse(call.function.arguments));
  if (verdict.approved && (!verdict.quote || !original.includes(verdict.quote))) throw new HarnessError('privacy_control_unknown', '这项控制没有有效的原话依据。');
  return verdict;
}
