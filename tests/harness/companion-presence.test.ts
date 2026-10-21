import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Fixture } from './support';
import { Harness } from '../../src/main/harness';
import { DeepSeekClient, type Completion } from '../../src/main/provider';
import type { Message, RunEvent } from '../../src/shared/types';

const call = (name: string, args: unknown): Completion => ({ content: '', tool_calls: [{ id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
const say = (content: string): Completion => ({ content, tool_calls: [] });

/** Mechanism only: a scripted model stands in for her judgement. This proves
 * the gate, the real Hermes run, the presence-only tool and the publication;
 * it does not prove that a real model writes a good check-in. */
function setup() {
  const f = new Fixture();
  f.store.saveSettings({ mode: 'deepseek', companionCheckIns: 'sometimes' });
  const sessionId = f.store.session(undefined, '昨晚聊的');
  f.clock.set('2026-10-20T12:00:00Z');
  f.store.putMessage({ id: randomUUID(), sessionId, role: 'user', content: '今天考完了，好累。', createdAt: f.clock.now(), status: 'done', steps: [], obligations: [], actions: [], retention: 'purpose_scoped' } as Message);
  return { f, sessionId };
}

test('she may drop by once on her own, into the last conversation, and never twice while unanswered', async () => {
  const { f, sessionId } = setup();
  try {
    const events: RunEvent[] = [], seen: string[] = [];
    let modelCalls = 0;
    const client = new DeepSeekClient('synthetic');
    client.complete = async (messages, tools) => {
      modelCalls++;
      const names = tools.map(tool => tool.function.name);
      if (names.length === 1 && names[0] === 'verify_read_purpose') return call('verify_read_purpose', { neededForCurrentRequest: true, allowed: true, sourceQuote: '', reason: 'fixture' });
      seen.push(...names);
      if (names.includes('send_check_in')) return call('send_check_in', { message: '考完一觉睡醒了没？今天就慢慢来吧～', kind: 'follow_up' });
      return say('');
    };
    const harness = new Harness(f.store, () => 'synthetic', event => events.push(event), () => client);
    // 13:30 Beijing time, 9.5 hours after the last word: a gentle moment.
    f.clock.set('2026-10-21T05:30:00Z');
    await harness.considerCheckIn();
    assert.ok(seen.includes('send_check_in'), 'the presence-only tool is offered');
    assert.ok(!seen.includes('decide_help') && !seen.includes('manage_attention'), 'no entrusted-work controls in a check-in');
    const posted = f.store.messages(sessionId).filter(message => message.proactive === 'check_in');
    assert.equal(posted.length, 1);
    assert.equal(posted[0].content, '考完一觉睡醒了没？今天就慢慢来吧～');
    assert.equal(posted[0].authorName, f.store.settings().persona.core.name);
    assert.ok(events.some(event => event.type === 'message' && event.message.id === posted[0].id));
    // Unanswered: a day later she does not come again, and no model is called.
    const before = modelCalls;
    f.clock.set('2026-10-22T05:30:00Z');
    await harness.considerCheckIn();
    assert.equal(modelCalls, before);
    assert.equal(f.store.messages(sessionId).filter(message => message.proactive === 'check_in').length, 1);
    // Once the person has spoken again, a later gentle moment is possible.
    f.store.putMessage({ id: randomUUID(), sessionId, role: 'user', content: '睡醒啦', createdAt: '2026-10-22T06:00:00Z', status: 'done', steps: [], obligations: [], actions: [], retention: 'purpose_scoped' } as Message);
    f.clock.set('2026-10-23T06:30:00Z');
    assert.equal(f.store.presenceTarget(f.clock.now(), false), sessionId);
  } finally { f.close(); }
});

test('no check-in when the person turned it off, in quiet hours, or before they have ever talked', async () => {
  const { f, sessionId } = setup();
  try {
    f.clock.set('2026-10-21T05:30:00Z');
    assert.equal(f.store.presenceTarget(f.clock.now(), true), undefined, 'quiet hours');
    f.clock.set('2026-10-21T15:30:00Z');
    assert.equal(f.store.presenceTarget(f.clock.now(), false), undefined, '23:30 local is too late');
    f.clock.set('2026-10-21T05:30:00Z');
    f.store.saveSettings({ companionCheckIns: 'off' });
    assert.equal(f.store.presenceTarget(f.clock.now(), false), undefined, 'turned off');
    f.store.saveSettings({ companionCheckIns: 'sometimes', interaction: { ...f.store.settings().interaction, initiative: 'quiet' } });
    assert.equal(f.store.presenceTarget(f.clock.now(), false), undefined, 'asked to wait until spoken to');
    assert.ok(sessionId);
  } finally { f.close(); }
  const fresh = new Fixture();
  try {
    fresh.store.saveSettings({ mode: 'deepseek' });
    assert.equal(fresh.store.presenceTarget('2026-10-21T05:30:00Z', false), undefined, 'never before a first conversation');
  } finally { fresh.close(); }
});
