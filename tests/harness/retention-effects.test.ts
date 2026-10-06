import test from 'node:test';
import assert from 'node:assert/strict';
import { Fixture, controlProposal, withHostReplies } from './support';
import { Harness } from '../../src/main/harness';
import { DeepSeekClient } from '../../src/main/provider';
import { DraftStore } from '../../src/main/storage/drafts';
import type { Message } from '../../src/shared/types';
import fs from 'node:fs';
import path from 'node:path';
import type { RuntimeCallbacks } from '../../src/main/runtime/coordinator';

const base: RuntimeCallbacks = { step() {}, plan() {}, action() {}, changed() {}, delegate: async () => [] };

test('a whole-conversation privacy control persists across turns, clears only its chat on exit, and a new conversation saves normally', async () => {
  const f = new Fixture(); f.store.saveSettings({ mode: 'deepseek' }); f.memory.paused = true;
  const session = f.store.session('temporary-conversation', '旧标题'), marker = 'VOLATILE_LIFETIME_941';
  f.store.putMessage({ id: 'prior-chat', sessionId: session, role: 'user', content: 'PRIOR_CHAT_LIFETIME_443', createdAt: f.clock.now(), status: 'done', steps: [], actions: [], obligations: [] });
  await f.store.runtime.actions.directLocal(f.scope(), { id: 'independent-approved-reminder', capability: 'local.agenda.save', arguments: { title: '已确认的资料复核', detail: '', startsAt: '2026-09-15T09:00:00+08:00' },
    dependencies: [{ consumerId: 'pending', producerId: 'prior-chat', producerRevision: 1, sensitivity: 'privacy', invalidation: 'block' }], authorized: true });
  const first = `这整段临时聊天结束后清掉，后面的消息也不保存。代号${marker}。`;
  let proposal = controlProposal({ retention: 'session_only', retentionScope: 'conversation', clearConversationOnExit: true, basis: [first] });
  let latest: Message | undefined, sawVolatilePrevious = false;
  const harness = new Harness(f.store, () => 'synthetic', event => { if (event.type === 'message' && event.message.role === 'assistant') latest = event.message; }, () => {
    const client = new DeepSeekClient('synthetic');
    client.complete = async (messages, tools) => {
      if (tools[0]?.function.name === 'verify_read_purpose') return { content: '', tool_calls: [{ id: 'verified-current-dialogue', type: 'function', function: { name: 'verify_read_purpose', arguments: JSON.stringify({ neededForCurrentRequest: true, allowed: true, reason: 'The current question explicitly continues this dialogue only.' }) } }] };
      if (proposal.retention === 'unchanged' && JSON.stringify(messages).includes(marker)) sawVolatilePrevious = true;
      return { content: '已按本次聊天的保存范围处理，独立的已确认安排保留。', tool_calls: [] };
    };
    return withHostReplies(client, proposal);
  });
  try {
    harness.start(session, first); await harness.idle(); assert.equal(latest?.status, 'done', latest?.content || 'No reply');
    proposal = controlProposal({ subject: 'none' });
    harness.start(session, '接着聊刚才的代号。'); await harness.idle();
    assert.equal(latest?.retention, 'session_only'); assert.equal(latest?.scopeSummary?.retentionScope, 'conversation'); assert.ok(sawVolatilePrevious);
    assert.deepEqual(f.store.messages(session).map(message => message.id), ['prior-chat']);
    assert.ok(!JSON.stringify(f.store.export()).includes(marker));
    const drafts = new DraftStore(f.store); drafts.save(session, { text: '后续私密草稿', attachment: null });
    assert.throws(() => drafts.persist(session, drafts.info(session).digest), /不写入/);
    harness.endConversation(session);
    assert.equal(f.store.messages(session).length, 0); assert.equal(f.store.agenda().length, 1);
    assert.ok(!JSON.stringify(f.store.export()).includes('PRIOR_CHAT_LIFETIME_443'));
    const fresh = harness.start(undefined, '新对话可以按通常方式保存。'); await harness.idle();
    assert.equal(latest?.retention, 'purpose_scoped'); assert.equal(f.store.messages(fresh.sessionId).length, 2);
  } finally { await harness.stop(); f.close(); }
});

test('conversation deletion preserves the exact approved business version across backup recovery, but not its old undo payload or pending proposals', async () => {
  let f = new Fixture();
  try {
    const marker = 'CHAT_AND_OLD_TITLE_927', session = f.store.session('business-retention', marker);
    f.store.putMessage({ id: 'business-source', sessionId: session, role: 'user', content: marker + '，请登记安排。', createdAt: f.clock.now(), status: 'done', steps: [], actions: [], obligations: [] });
    const dependencies = [{ consumerId: 'pending', producerId: 'business-source', producerRevision: 1, sensitivity: 'privacy' as const, invalidation: 'block' as const }];
    const created = await f.store.runtime.actions.directLocal(f.scope(), { id: 'business-approved', capability: 'local.agenda.save', arguments: { title: marker, detail: '', startsAt: '2026-09-15T09:00:00+08:00' }, dependencies, authorized: true });
    await f.store.runtime.changeLocalFromUI({ ...f.store.agenda()[0], title: '当前确认的安排', startsAt: '2026-09-15T10:00:00+08:00' }, 'update');
    const current = f.store.agenda()[0], effectId = current.effectActionId!;
    assert.notEqual(effectId, created.action.id);
    const pending = f.store.runtime.actions.prepare(f.scope(), { id: 'unsubmitted-proposal', capability: 'local.agenda.save', arguments: { title: '未提交的提案', detail: '' }, dependencies });
    const backup = path.join(f.dir, 'before-conversation-delete.sqlite'); f.repo.db.prepare('VACUUM INTO ?').run(backup);
    f.store.deleteSession(session);
    assert.deepEqual(f.store.agenda(), [current]); assert.equal(f.store.runtime.actions.get(f.scope(), effectId)?.status, 'succeeded');
    assert.equal(f.store.runtime.actions.get(f.scope(), pending.id)?.status, 'cancelled');
    assert.ok(!JSON.stringify(f.store.export()).includes(marker));
    await assert.rejects(f.store.runtime.actions.cancel(f.scope(), effectId), { code: 'undo_history_deleted' });
    assert.deepEqual(f.store.agenda(), [current]);
    f.store.close(); fs.copyFileSync(backup, f.file); f = new Fixture(f.dir, f.clock);
    assert.deepEqual(f.store.agenda(), [current]); assert.equal(f.store.messages(session).length, 0); assert.equal(f.store.conversations().some(item => item.id === session), false);
    assert.ok(!JSON.stringify(f.store.export()).includes(marker), 'Restoration must not revive erased text or its conversation title');
    await f.store.runtime.changeLocalFromUI(current, 'delete'); assert.equal(f.store.agenda().length, 0, 'The retained business object remains directly controllable at its actual version');
  } finally { f.close(); }
});

test('ordinary source erasure still removes a dependent business object without a conversation-only preservation exception', async () => {
  const f = new Fixture();
  try {
    const source = f.ingest('敏感旧来源');
    await f.store.runtime.actions.directLocal(f.scope(), { id: 'source-dependent-business', capability: 'local.agenda.save', arguments: { title: '待清除的派生安排', detail: '' }, dependencies: [{ consumerId: 'pending', producerId: source.id, producerRevision: 1, sensitivity: 'privacy', invalidation: 'block' }], authorized: true });
    f.memory.forget([], [source.id]); assert.equal(f.store.agenda().length, 0);
    assert.equal(f.repo.fences().at(-1)?.preservedLocalAgenda, undefined);
  } finally { f.close(); }
});

test('exit cleanup recovers after restart, while a one-turn restriction does not clear prior chat or leak into later turns', () => {
  let f = new Fixture();
  try {
    const session = f.store.session('crash-privacy', '待清理聊天');
    f.store.putMessage({ id: 'crash-prior', sessionId: session, role: 'user', content: 'CRASH_CHAT_CANARY_331', createdAt: f.clock.now(), status: 'done', steps: [], actions: [], obligations: [] });
    f.store.restrictConversation(session, 'session_only', true);
    f = f.restart(); assert.equal(f.store.messages(session).length, 0); assert.ok(!JSON.stringify(f.store.export()).includes('CRASH_CHAT_CANARY_331'));
    const run = f.store.runtime.begin('只这一轮不保存。', 'single-turn', 'ordinary-session', new AbortController().signal, { retention: 'session_only' });
    assert.equal(run.ephemeral, true); f.store.runtime.finish(run);
    const next = f.store.runtime.begin('后续普通消息', 'normal-after-single', 'ordinary-session', new AbortController().signal);
    assert.equal(next.ephemeral, false); assert.equal(f.store.conversationPolicy('ordinary-session'), null);
  } finally { f.close(); }
});

test('temporary retention never overrides an explicit current-only or no-memory read boundary', async () => {
  for (const memoryMode of ['current_sources_only', 'none'] as const) {
    const f = new Fixture();
    try {
      const session = f.store.session('restricted-temporary', '不应读取的历史');
      f.store.putMessage({ id: 'unread-private-original', sessionId: session, role: 'user', content: 'PRIVATE_HISTORY_MUST_STAY_UNREAD_609', createdAt: f.clock.now(), status: 'done', steps: [], actions: [], obligations: [] });
      const run = f.store.runtime.begin('仅处理我当前这条问题，不保存。', 'restricted-current', session, new AbortController().signal, { retention: 'session_only', memoryMode, semantic: controlProposal() });
      const scope = f.policy.validate(run.ingress.contract.scope);
      assert.equal(scope.sources.includes('history:self'), false); assert.equal(scope.sources.includes('profile:self'), false);
      if (memoryMode === 'current_sources_only') assert.deepEqual(scope.sources, ['current']);
      const pack = await f.store.runtime.compile(run); assert.ok(!JSON.stringify(pack.data).includes('PRIVATE_HISTORY_MUST_STAY_UNREAD_609'));
      assert.throws(() => f.store.runtime.context.includeVolatileConversation(pack, [{ id: 'old-volatile', role: 'user', content: 'OLD_VOLATILE_PRIVATE_771' }]), { code: 'history_scope' });
    } finally { f.close(); }
  }
});

test('a verified local effect retains its business receipt but not the transient conversation, and can be changed and undone', async () => {
  let f = new Fixture();
  const marker = 'CANARY_TRANSIENT_EFFECT_971';
  try {
    const text = `${marker} 不保存聊天，但登记明天下午三点资料复核，不把私话放入事项。`;
    const run = f.store.runtime.begin(text, 'transient-effect-origin', 'temporary', new AbortController().signal, { retention: 'session_only' });
    assert.ok(f.store.runtime.toolSpecs(run).some(tool => tool.function.name === 'prepare_action'));
    const callbacks: RuntimeCallbacks = { ...base, verifyLocalDelegation: async () => ({ decision: 'execute_local', basis: [{ id: run.events[0].id, quote: text }], missing: [], reason: 'Synthetic exact local delegation.' }) };
    const args = { title: '资料复核', detail: '', startsAt: '2026-09-15T15:00:00+08:00' };
    const result: any = await f.store.runtime.executeTool(run, 'prepare_action', args, callbacks);
    assert.equal(result.saved, true); assert.equal(result.receipt.status, 'confirmed_success');
    assert.equal(f.store.agenda().length, 1); assert.equal(f.store.agenda()[0].durationMinutes, undefined);
    await f.store.runtime.executeTool(run, 'prepare_action', args, callbacks);
    assert.equal(f.store.agenda().length, 1);
    const item = f.store.agenda()[0];
    const changed: any = await f.store.runtime.executeTool(run, 'change_local_action', { operation: 'update', targetId: item.id, expectedRevision: item.revision || 1, changes: { durationMinutes: 30 } }, callbacks);
    assert.equal(changed.applied, true); assert.equal(f.store.agenda()[0].durationMinutes, 30);
    assert.equal(f.repo.watermarks().received, 0); assert.equal(f.repo.db.prepare('SELECT count(*) AS n FROM messages').get()?.n, 0);
    assert.ok(!JSON.stringify(f.store.export()).includes(marker));
    const undoId = changed.actionId;
    f.store.runtime.finish(run); f = f.restart();
    assert.equal(f.store.agenda()[0].durationMinutes, 30);
    await f.store.runtime.actions.cancel(f.scope(), undoId);
    assert.equal(f.store.agenda()[0].durationMinutes, undefined);
    assert.ok(!JSON.stringify(f.store.export()).includes(marker));
  } finally { f.close(); }
});

test('transient turns without verified delegation or with an explicit effect prohibition create no persisted proposal', async () => {
  const f = new Fixture();
  try {
    for (const semantic of [undefined, controlProposal({ actions: 'none', actionsApplyToWholeTurn: true })]) {
      const run = f.store.runtime.begin('不保存聊天，也没有委托登记。', 'not-delegated-' + !!semantic, 'temporary', new AbortController().signal, { retention: 'session_only', semantic });
      const result: any = await f.store.runtime.executeTool(run, 'prepare_action', { title: '不应登记', detail: '' }, { ...base, verifyLocalDelegation: async () => ({ decision: semantic ? 'execute_local' : 'not_requested', basis: [], missing: [], reason: 'The explicit prohibition must remain authoritative.' }) });
      assert.equal(result.saved, false);
    }
    assert.equal(f.store.agenda().length, 0); assert.equal(f.store.runtime.actions.list(f.scope()).length, 0);
    assert.equal(f.repo.watermarks().received, 0);
  } finally { f.close(); }
});

test('the business scope is source-limited and revocable, and opaque transient provenance still cancels pending effects', () => {
  const f = new Fixture();
  try {
    const run = f.store.runtime.begin('只存业务参数。', 'opaque-transient-origin', 'temporary', new AbortController().signal, { retention: 'session_only' });
    const parent = f.policy.validate(run.ingress.contract.scope), effect = f.policy.localEffectScope(run.ingress.contract.scope), data = f.policy.validate(effect);
    assert.deepEqual(data.sources, ['local-agenda']); assert.equal(data.infer, false); assert.equal(data.expiresAt, parent.expiresAt);
    assert.ok(!data.grants.includes('memory:write')); assert.equal(parent.retention, 'session_only');
    assert.throws(() => f.store.runtime.actions.prepare(run.ingress.contract.scope, { capability: 'local.agenda.save', arguments: { title: 'proposal', detail: '' } }), /持久动作/);
    const action = f.store.runtime.actions.prepare(effect, { capability: 'local.agenda.save', arguments: { title: '尚未提交', detail: '' }, dependencies: [{ consumerId: 'pending', producerId: run.events[0].id, producerRevision: 0, sensitivity: 'privacy', invalidation: 'block' }] });
    f.store.runtime.actions.cancelPendingFromSources([run.events[0].id]);
    assert.equal(f.store.runtime.actions.get(f.scope(), action.id)?.status, 'cancelled');
    assert.equal(f.store.agenda().length, 0);
    f.policy.revoke('local:write'); assert.throws(() => f.policy.validate(effect), /范围已改变/);
  } finally { f.close(); }
});
