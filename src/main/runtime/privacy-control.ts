import { z } from 'zod';
import type { DeepSeekClient, ToolSpec } from '../provider';
import { HarnessError } from '../../shared/harness';

const schema = z.object({ approved: z.boolean(), quote: z.string().max(3000), reason: z.string().max(600) }).strict();
export async function verifyPrivacyControl(original: string, operation: unknown, complete: DeepSeekClient['complete'], signal: AbortSignal, hostState?: unknown) {
  const { $schema: _, ...parameters } = z.toJSONSchema(schema);
  const tool: ToolSpec = { type: 'function', function: { name: 'verify_privacy_control', description: '把你对当前原话的理解交给宿主：本人是否明确希望对这个对象停用、遗忘或撤权，以及是否就是眼前这个时机。', parameters } };
  const result = await complete([
    { role: 'system', content: `想请你一起听清本人这句话，以及眼前提案要处理的对象。他是否真的希望停用、遗忘或撤权，还是正在讨论、引用、假设或说出一份烦恼？这些意思都值得按原样理解。遗忘会清理本机原文和派生资料，暂时不想用则有它自己的停用方式；具体范围也沿他点名的那一处。

operation里的目标text描述的是准备处理的既有内容或理解。本人此刻说“请忘掉……”是在表达这次选择，他真正点名的旧内容有自己的来处；删除眼前这句请求本身，还没有处理到那份旧内容。若目前只找到了控制请求、尚未定位所指旧内容，approved为false，reason可以说明还需找回哪份理解或来源。其他信息尚不足时，也保留这个尚未支持的判断。

停用、遗忘和撤权各有不同的对象。比如“先别再参考这条理解”可以停用理解并保留原文；“忘掉这段原话和由它形成的内容”指向资料清理；“以后别读取我的成绩”则关乎那项读取权限。撤权本身不表示已经删除资料，停用也不改变原文说过什么。例子帮助区分意思，实际选择仍看original里的完整语境、对象和逐字依据；引用或讨论这些说法也有自己的身份。

approved为true时，quote保留支持这次操作的当前用户逐字片段。你的理解通过verify_privacy_control交给宿主，实际处理仍由原操作流程完成。` },
    { role: 'system', content: `还想请你留意时间：这个提案一旦通过，宿主会现在执行。因此除了认清对象，也要看看本人约定的时机是否已经到了。未来某个条件触发后再处理的约定，在条件还没发生时仍保留着那份等待，眼前提案对应approved=false。

hostState.conversationRetention若已有会话结束清理登记，宿主会在相应生命周期处理它，眼前原话此刻仍可以安稳保留。本人另外明确要立刻处理的独立对象，也仍有自己现在的范围和时机。` },
    { role: 'user', content: JSON.stringify({ original, operation, executionTiming: 'immediate_current_turn', hostState }) },
  ], [tool], signal, undefined, { thinking: 'enabled', maxOutputTokens: 4096 });
  const call = result.tool_calls.find(c => c.function.name === tool.function.name);
  if (!call) throw new HarnessError('privacy_control_unknown', '这次还没有取得完整的处理判断，提议的停用、遗忘或撤权尚未进行。');
  const verdict = schema.parse(JSON.parse(call.function.arguments));
  if (verdict.approved && (!verdict.quote || !original.includes(verdict.quote))) throw new HarnessError('privacy_control_unknown', '这份判断里的引文还没有对应到本人这次的原话，提议的停用、遗忘或撤权尚未进行。');
  return verdict;
}
