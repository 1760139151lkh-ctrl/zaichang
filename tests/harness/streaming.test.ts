import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Fixture, withHostReplies } from './support';
import { Harness } from '../../src/main/harness';
import { DeepSeekClient, type Completion } from '../../src/main/provider';
import type { RunEvent } from '../../src/shared/types';

const call = (name: string, args: unknown): Completion => ({ content: '', tool_calls: [{ id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Mechanism only: a scripted model streams like a real one. This proves the
 * words reach the screen while the turn is still working and are not
 * repeated at the end; it says nothing about how good a real model's words are. */
test('her first words appear while she is still working, and the answer continues instead of repeating', async () => {
  const f = new Fixture();
  try {
    f.store.saveSettings({ mode: 'deepseek' });
    const events: RunEvent[] = [];
    let round = 0, toolDone = false;
    const client = new DeepSeekClient('synthetic');
    client.complete = async (_messages, tools, _signal, onText) => {
      const names = tools.map(tool => tool.function.name);
      if (names.length === 1 && names[0] === 'report_completion_gaps') return call(names[0], { missing: [], contradictions: [], requests: [] });
      if (names.length === 1 && names[0].startsWith('verify_')) return call(names[0], { neededForCurrentRequest: true, allowed: true, sourceQuote: '', reason: 'fixture' });
      round++;
      if (round === 1) {
        onText?.('好呀，'); await pause(220);
        onText?.('我看看今天的安排～'); await pause(220);
        return { ...call('look_up', { source: 'local', from: '2026-10-21T00:00:00+08:00', to: '2026-10-22T00:00:00+08:00' }), content: '好呀，我看看今天的安排～' };
      }
      toolDone = true;
      onText?.('今天没有记下别的事，'); await pause(220);
      onText?.('晚上可以完全留给自己。');
      return { content: '今天没有记下别的事，晚上可以完全留给自己。', tool_calls: [] };
    };
    const harness = new Harness(f.store, () => 'synthetic', event => events.push(structuredClone(event)), () => withHostReplies(client));
    const { sessionId } = harness.start(undefined, '帮我看看今天还有什么安排');
    await harness.idle();
    const assistant = events.filter((event): event is Extract<RunEvent, { type: 'message' }> => event.type === 'message' && event.message.role === 'assistant');
    const earlyIndex = assistant.findIndex(event => event.message.status === 'running' && event.message.content.includes('我看看今天的安排'));
    assert.ok(earlyIndex >= 0, 'the opener was published while the run was still going');
    assert.ok(assistant.slice(0, earlyIndex + 1).every(event => !event.message.content.includes('晚上可以')), 'before the tool result arrived');
    assert.ok(toolDone);
    const final = f.store.messages(sessionId).find(message => message.role === 'assistant')!;
    assert.equal(final.status, 'done');
    assert.equal(final.content.match(/我看看今天的安排/g)?.length, 1, 'the opener is not repeated');
    assert.match(final.content, /好呀，我看看今天的安排～\s+今天没有记下别的事，晚上可以完全留给自己。/);
  } finally { f.close(); }
});
