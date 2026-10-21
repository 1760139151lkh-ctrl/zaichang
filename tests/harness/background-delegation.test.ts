import test from 'node:test';
import assert from 'node:assert/strict';
import { Fixture, supported } from './support';
import { BackgroundDelegation } from '../../src/main/runtime/background-delegation';
import { ToolRegistry, type ToolContext } from '../../src/main/tools';
import { DeepSeekClient, type ModelWireMessage } from '../../src/main/provider';
import type { DelegatedTask, WorkRecord } from '../../src/shared/harness';
import { Harness } from '../../src/main/harness';

// These are controlled host-mechanism checks. No fixture claims that a real
// model discovered a useful task, interpreted permission or wrote well.
const reply = (name: string, args: unknown, id = name) => ({ content: '', tool_calls: [{ id, type: 'function' as const, function: { name, arguments: JSON.stringify(args) } }] });
const completion: DeepSeekClient['complete'] = async (_messages, tools) => {
  assert.deepEqual(tools.map(tool => tool.function.name), ['verify_read_purpose']);
  return reply('verify_read_purpose', { neededForCurrentRequest: true, allowed: true, reason: 'Explicit synthetic scope fixture.' });
};

async function background(sources = ['local-agenda', 'profile:self', 'history:self'], complete = completion) {
  const f = new Fixture(), controller = new AbortController(), runtime = f.store.runtime;
  if (sources.includes('weather:open-meteo')) f.store.saveSettings({ weatherEnabled: true });
  const quote = '请留意我的本地日程和已确认偏好，合适时先帮我准备。';
  const authority = f.ingest('UNRELATED_PRIVATE_CANARY。' + quote + '另外这段是无关内容。');
  const focus = runtime.attention.control(f.scope(), 'synthetic-session', {
    operation: 'follow', title: '留意合成生活安排', rule: quote, sources,
    source: { eventId: authority.id, quote }, until: '2026-09-15T06:00:00Z',
  }) as WorkRecord;
  const opportunity = runtime.attention.offer(f.scope(), { bindingId: focus.id, watchId: 'synthetic-background', evidenceId: authority.id,
    category: 'agenda', title: '核对一次合成安排', facts: { source: 'synthetic host check' }, noveltyKey: 'first', expiresAt: '2026-09-14T08:00:00Z' })!;
  assert.ok(opportunity);
  const run = runtime.beginOpportunity(opportunity, controller.signal);
  await runtime.compile(run);
  run.pack!.data.opportunity = runtime.attention.inspect(run.ingress.contract.scope, opportunity);
  let helper!: BackgroundDelegation;
  const context: ToolContext = { store: f.store, runtimeSession: run, signal: controller.signal, userText: '', currentUserId: '', child: false,
    step() {}, plan() {}, changed() {}, action() { throw new Error('Background effects are forbidden.'); }, delegate: (tasks, signal) => Promise.resolve(helper.authorize(tasks, signal)) };
  helper = new BackgroundDelegation(run, context, complete, 'Synthetic product assistant.');
  const registry = new ToolRegistry(context), hooks = helper.hooks(registry);
  const task: DelegatedTask = { title: '核对安排', instruction: '只核对本地安排和已确认的偏好，保留原始来源。', sources, currentEvidenceIds: [authority.id] };
  return { f, runtime, controller, quote, authority, focus, opportunity, run, helper, registry, hooks, task };
}
const resultFor = (id: string, summary = 'CONTROLLED_CHILD_FINDING') => ({ _host_children: [id], results: [{ hostTaskId: id, status: 'produced', summary }] });
const wireFor = (value: unknown, id = 'delegation'): ModelWireMessage[] => [{ role: 'tool', tool_call_id: id, content: JSON.stringify(value) }];
async function open(s: Awaited<ReturnType<typeof background>>, task = s.task) {
  s.helper.authorize([task]);
  return s.hooks.open(task);
}
function changeAttention(s: Awaited<ReturnType<typeof background>>, operation: 'pause' | 'stop') {
  const event = s.f.ingest(operation === 'pause' ? '这项关注先暂停。' : '停止这项关注。');
  s.runtime.attention.control(s.f.scope(), 'synthetic-session', { operation, targetId: s.focus.id, source: { eventId: event.id, quote: event.text } });
}

test('background workers receive only their quoted authority, read-only tools and one shared budget', async () => {
  const s = await background(['local-agenda']);
  try {
    const before = s.run.pack!.receipt.budget.readBytes, ticket = await open(s), worker = s.helper.workers.get(ticket.id)!;
    assert.ok(ticket.system.includes(s.quote));
    assert.doesNotMatch(ticket.system, /UNRELATED_PRIVATE_CANARY|另外这段/);
    assert.deepEqual(worker.run.events.map(event => event.text), [s.quote]);
    const observed = JSON.parse(await worker.registry.execute('read_evidence', JSON.stringify({ id: s.authority.id }), 'quoted-read'));
    assert.equal(observed.text, s.quote);
    const searched = await worker.registry.execute('search_context', JSON.stringify({ query: 'UNRELATED_PRIVATE_CANARY' }), 'search-quoted-source');
    assert.doesNotMatch(searched, /UNRELATED_PRIVATE_CANARY|另外这段/, 'search cannot reopen the full authority message');
    const tools = ticket.tools.map(spec => spec.function.name);
    for (const forbidden of ['delegate', 'propose_memory_change', 'prepare_action', 'change_local_action', 'manage_attention', 'decide_help']) assert.ok(!tools.includes(forbidden), forbidden);
    assert.equal(worker.run.pack!.receipt.budget, s.run.pack!.receipt.budget);
    assert.ok(s.run.pack!.receipt.budget.readBytes > before);
    assert.equal(worker.run.budgetOwner, s.run);
    const second = await open(s, { ...s.task, title: '独立第二项' });
    const sibling = s.helper.workers.get(second.id)!;
    assert.equal(sibling.run.pack!.receipt.budget, worker.run.pack!.receipt.budget);
    assert.throws(() => s.helper.authorize([{ ...s.task, title: '超出总数' }]), /最多/);
    const prior = s.run.toolCalls;
    await sibling.registry.execute('read_evidence', JSON.stringify({ id: s.authority.id }), 'second-read');
    assert.equal(s.run.toolCalls, prior + 1);
    assert.equal(s.f.store.agenda().length, 0);
  } finally { s.f.close(); }
});

test('a failed sibling is sanitized while an independent successful sibling remains consumable', async () => {
  const s = await background(['local-agenda']);
  try {
    const left = await open(s), right = await open(s, { ...s.task, title: '第二条调查' });
    await s.hooks.event(left.id, 'produced'); await s.hooks.event(right.id, 'failed');
    const accepted = await s.hooks.result('two-children', { _host_children: [left.id, right.id], results: [
      { hostTaskId: left.id, status: 'produced', summary: 'AVAILABLE_SIBLING' },
      { hostTaskId: right.id, status: 'failed', summary: 'FAILED_PRIVATE_CANARY', extra: 'FAILED_PRIVATE_CANARY' },
    ] });
    assert.doesNotMatch(JSON.stringify(accepted), /FAILED_PRIVATE_CANARY/);
    assert.match(JSON.stringify(accepted), /AVAILABLE_SIBLING/);
    await s.helper.consume(wireFor(accepted, 'two-children'));
    assert.equal(s.helper.workers.get(left.id)!.metadata.status, 'consumed');
    assert.equal(s.helper.workers.get(right.id)!.metadata.status, 'failed');
  } finally { s.f.close(); }
});

test('authorized history lookup keeps the entrustment quote sliced while other in-scope originals remain retrievable', async () => {
  const s = await background(['history:self']);
  try {
    s.f.ingest('另一次真实存储的合成原话：HISTORY_ALLOWED_482。');
    const ticket = await open(s), worker = s.helper.workers.get(ticket.id)!;
    const privateSearch = await worker.registry.execute('search_context', JSON.stringify({ query: 'UNRELATED_PRIVATE_CANARY' }), 'authority-search');
    assert.doesNotMatch(privateSearch, /UNRELATED_PRIVATE_CANARY|另外这段/, 'the authority source is still a selected quote');
    const allowed = await worker.registry.execute('search_context', JSON.stringify({ query: 'HISTORY_ALLOWED_482' }), 'other-history-search');
    assert.match(allowed, /HISTORY_ALLOWED_482/, 'authorized useful history remains reachable');
  } finally { s.f.close(); }
});

test('direct memory detail cannot reopen an assertion derived from the unquoted authority text', async () => {
  const s = await background(['profile:self', 'history:self']);
  try {
    const memory = await s.f.memory.propose(s.f.scope(), s.f.change(s.authority, {
      sourceQuote: 'UNRELATED_PRIVATE_CANARY', text: 'UNRELATED_PRIVATE_CANARY', value: { type: 'text', value: 'UNRELATED_PRIVATE_CANARY' },
    }), undefined, { review: supported });
    const ticket = await open(s), worker = s.helper.workers.get(ticket.id)!;
    const result = await worker.registry.execute('read_understanding', JSON.stringify({ id: memory.id }), 'unquoted-memory');
    assert.doesNotMatch(result, /UNRELATED_PRIVATE_CANARY/, 'derived memory must respect the original authority projection');
    const searched = await worker.registry.execute('search_context', JSON.stringify({ query: 'UNRELATED_PRIVATE_CANARY' }), 'unquoted-search');
    assert.doesNotMatch(searched, /UNRELATED_PRIVATE_CANARY/, 'memory bundles must respect the same projection');
  } finally { s.f.close(); }
});

test('a narrowed current parent scope rejects an already produced worker report before model consumption', async () => {
  const s = await background();
  try {
    const ticket = await open(s);
    await s.hooks.event(ticket.id, 'produced');
    const accepted = await s.hooks.result('delegation', resultFor(ticket.id));
    s.run.ingress.contract.scope = s.f.policy.narrow(s.run.ingress.contract.scope, { sources: ['current', 'work:self'], currentEventIds: [] });
    await assert.rejects(() => s.helper.consume(wireFor(accepted)), /范围|改变|停止/);
    assert.notEqual(s.helper.workers.get(ticket.id)!.metadata.status, 'consumed');
  } finally { s.f.close(); }
});

test('pause and stop after child production reject old report adoption without cancelling an independent reminder', async () => {
  for (const operation of ['pause', 'stop'] as const) {
    const s = await background();
    try {
      s.runtime.reminders.schedule({ id: 'independent-reminder', title: '合成提醒', detail: '', kind: 'reminder', startsAt: '2026-09-14T07:00:00Z' });
      const ticket = await open(s); await s.hooks.event(ticket.id, 'produced');
      const accepted = await s.hooks.result('delegation', resultFor(ticket.id));
      changeAttention(s, operation);
      await assert.rejects(() => s.helper.consume(wireFor(accepted)), /改变|停止|暂停|退出/);
      assert.equal(s.f.repo.db.prepare('SELECT status FROM h_jobs WHERE object_id=?').get('independent-reminder')?.status, 'queued');
      assert.equal(s.f.store.agenda().length, 0);
    } finally { s.f.close(); }
  }
});

test('memory correction between worker result and parent use rejects both late text and old observations', async () => {
  const s = await background();
  try {
    const memory = await s.f.remember('我平时喜欢上午学习。');
    const ticket = await open(s), worker = s.helper.workers.get(ticket.id)!;
    const read = JSON.parse(await worker.registry.execute('read_understanding', JSON.stringify({ id: memory.id }), 'memory-read'));
    assert.equal(read.assertion.id, memory.id);
    await s.hooks.event(ticket.id, 'produced');
    const accepted = await s.hooks.result('delegation', resultFor(ticket.id, 'OLD_MORNING_FINDING'));
    const correction = s.f.ingest('刚才说错了，我平时喜欢下午学习。');
    await s.f.memory.propose(s.f.scope(), s.f.change(correction, { operation: 'CORRECT', targetId: memory.id, expectedRevision: 1 }), undefined, { review: supported });
    // Simulate an event reaching the host before the parent asks to consume.
    assert.equal(await s.hooks.event(ticket.id, 'produced'), 'failed');
    await assert.rejects(() => s.helper.consume(wireFor(accepted)), /改变|停止|失效|旧/);
    assert.ok(!s.run.observations?.some(item => item.toolCallId === 'memory-read'));
  } finally { s.f.close(); }
});

test('source revocation and root cancellation reject late worker output', async () => {
  for (const kind of ['revoke', 'cancel'] as const) {
    const s = await background();
    try {
      const ticket = await open(s); await s.hooks.event(ticket.id, 'produced');
      const accepted = await s.hooks.result('delegation', resultFor(ticket.id));
      if (kind === 'revoke') s.f.policy.revoke('evidence:read');
      else s.controller.abort(new DOMException('synthetic_cancel', 'AbortError'));
      await assert.rejects(() => s.helper.consume(wireFor(accepted)), /改变|synthetic_cancel/);
      assert.notEqual(s.helper.workers.get(ticket.id)!.metadata.status, 'consumed');
    } finally { s.f.close(); }
  }
});

test('pausing during a child purpose check blocks the source read before its result exists', async () => {
  let release!: (value: Awaited<ReturnType<DeepSeekClient['complete']>>) => void, started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const s = await background(['local-agenda'], async (_messages, tools) => {
    assert.deepEqual(tools.map(tool => tool.function.name), ['verify_read_purpose']);
    started();
    return new Promise(resolve => { release = resolve; });
  });
  try {
    const ticket = await open(s), worker = s.helper.workers.get(ticket.id)!;
    const pending = worker.registry.execute('look_up', JSON.stringify({ source: 'local', from: '2026-09-14T06:00:00Z', to: '2026-09-14T12:00:00Z' }), 'stale-purpose-read');
    await ready;
    changeAttention(s, 'pause');
    release(reply('verify_read_purpose', { neededForCurrentRequest: true, allowed: true, reason: 'Synthetic late verdict.' }));
    const result = JSON.parse(await pending);
    assert.equal(result.code, 'background_changed');
    assert.ok(!s.runtime.broker.invocations.some(attempt => attempt.capability === 'local.agenda.read'));
    assert.ok(!worker.run.observations?.some(observation => observation.toolCallId === 'stale-purpose-read' && (observation.result as any)?.status === 'fresh'));
  } finally { s.f.close(); }
});

test('only consumed real child observations can back a prepared artifact through the existing decision tool', async () => {
  const s = await background(['local-agenda']);
  try {
    s.f.store.saveAction({ id: 'synthetic-class', title: '合成课程', detail: '本地合成来源', startsAt: '2026-09-14T07:00:00Z', durationMinutes: 60, kind: 'event' });
    const ticket = await open(s), worker = s.helper.workers.get(ticket.id)!;
    const observed = JSON.parse(await worker.registry.execute('look_up', JSON.stringify({ source: 'local', from: '2026-09-14T06:00:00Z', to: '2026-09-14T12:00:00Z' }), 'calendar-read'));
    assert.equal(observed.status, 'fresh');
    assert.ok(JSON.stringify(observed).includes('synthetic-class'));
    await s.helper.recordDeliveredEvidence(ticket.id, [{ role: 'tool', tool_call_id: 'calendar-read', content: JSON.stringify(observed) }]);
    await s.hooks.event(ticket.id, 'produced');
    const accepted = await s.hooks.result('delegation', resultFor(ticket.id));
    assert.ok(!s.run.observations?.some(item => item.toolCallId === 'calendar-read'));
    await s.helper.consume(wireFor(accepted));
    assert.equal(s.run.observations?.filter(item => item.toolCallId === 'calendar-read').length, 1);
    await s.helper.consume(wireFor(accepted));
    assert.equal(s.run.observations?.filter(item => item.toolCallId === 'calendar-read').length, 1);
    const prepared = JSON.parse(await s.registry.execute('decide_help', JSON.stringify({ id: s.opportunity.id, expectedRevision: s.opportunity.revision,
      choice: 'prepare', reason: '已从合成本地安排读取实际时段。', actionDescription: '安静保存一份可回看的准备。', sourceToolCallIds: ['calendar-read'],
      artifact: { title: '合成安排准备', body: '合成课程占用 07:00—08:00 UTC，其他时间仍只代表本地登记覆盖。' } })));
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    assert.equal(s.f.store.agenda().length, 1, 'preparing has not created another calendar entry');
    assert.equal(s.f.repo.work(s.f.scope(), undefined, s.opportunity.id)[0].status, 'prepared');
  } finally { s.f.close(); }
});

test('a background decision can finish after its own expiry wake update, but later edits still stop it', async () => {
  const s = await background(['weather:open-meteo']);
  try {
    s.run.observations = [{ tool: 'look_up', toolCallId: 'timed-weather', result: {
      status: 'fresh', sourceId: 'weather:open-meteo', fetchedAt: s.f.clock.now(), expiresAt: '2026-09-14T07:00:00Z',
      data: { location: 'public synthetic point', forecast: { time: ['2026-09-14'] } },
    } }];
    const result = JSON.parse(await s.registry.execute('decide_help', JSON.stringify({ id: s.opportunity.id, expectedRevision: s.opportunity.revision,
      choice: 'prepare', reason: 'Controlled expiring observation.', actionDescription: 'Prepare within the existing mandate.', sourceToolCallIds: ['timed-weather'],
      artifact: { title: 'Synthetic weather', body: 'This is a deterministic fixture, not a real forecast.' } }), 'timed-decision'));
    assert.equal(result.status, 'prepared');
    assert.deepEqual(result.mandateUpdate, { id: s.focus.id, previousRevision: s.focus.revision, revision: s.focus.revision + 1, operation: 'material_wakes' });
    await assert.doesNotReject(() => s.helper.validateBoundary());
    await assert.doesNotReject(() => s.helper.validateBoundary(), 'the accepted host revision is stable across model boundaries');
    const current = s.f.repo.work(s.f.scope(), undefined, s.focus.id)[0];
    s.runtime.work.update(s.f.scope(), current.id, current.revision, { data: { ...current.data, rule: 'A separate later revision.' } });
    await assert.rejects(() => s.helper.validateBoundary(), /改变|暂停|停止/);
  } finally { s.f.close(); }
});

test('a decision receipt cannot absorb an unrelated mandate edit made before its expiry wake update', async () => {
  const s = await background(['weather:open-meteo']);
  try {
    s.runtime.work.update(s.f.scope(), s.focus.id, s.focus.revision, { data: { ...s.focus.data, rule: 'Separate earlier edit.' } });
    const result = s.runtime.attention.decide(s.run.ingress.contract.scope, { id: s.opportunity.id, expectedRevision: s.opportunity.revision,
      choice: 'prepare', reason: 'Controlled observation.', actionDescription: 'Prepare a fixture.', sourceToolCallIds: ['timed-weather'],
      artifact: { title: 'Synthetic weather', body: 'Controlled fixture.' } }, [{ tool: 'look_up', toolCallId: 'timed-weather', result: {
        status: 'fresh', sourceId: 'weather:open-meteo', fetchedAt: s.f.clock.now(), expiresAt: '2026-09-14T07:00:00Z', data: {},
      } }]);
    s.run.observations = [{ tool: 'decide_help', result }];
    assert.equal(result.mandateUpdate?.previousRevision, s.focus.revision + 1);
    await assert.rejects(() => s.helper.validateBoundary(), /改变|暂停|停止/);
  } finally { s.f.close(); }
});

test('a background decision to leave the user alone completes without a spurious stale-run error', async () => {
  const s = await background(['local-agenda']);
  try {
    const result = JSON.parse(await s.registry.execute('decide_help', JSON.stringify({ id: s.opportunity.id, expectedRevision: s.opportunity.revision,
      choice: 'none', reason: 'There is no useful new value.', actionDescription: 'Do not interrupt.' }), 'leave-alone'));
    assert.equal(result.status, 'declined');
    await assert.doesNotReject(() => s.helper.validateBoundary());
    changeAttention(s, 'pause');
    await assert.rejects(() => s.helper.validateBoundary(), /改变|暂停|停止/);
  } finally { s.f.close(); }
});

test('background entry uses real Hermes children and the parent consumes actual local-calendar output', async () => {
  const s = await background(['local-agenda']);
  try {
    s.f.store.saveSettings({ mode: 'deepseek' });
    s.f.store.saveAction({ id: 'native-child-class', title: '合成原生日程', detail: '', startsAt: '2026-09-14T07:00:00Z', durationMinutes: 60, kind: 'event' });
    const client = new DeepSeekClient('synthetic'), actorCalls = new Map<string, number>();
    let rootCalls = 0, childObserved = false;
    client.complete = async (messages, tools, _signal, _onText, options) => {
      if (tools.length === 1 && tools[0].function.name === 'verify_read_purpose') return completion(messages, tools, _signal);
      if (options?.actorId) {
        const count = (actorCalls.get(options.actorId) || 0) + 1; actorCalls.set(options.actorId, count);
        if (count === 1) return reply('look_up', { source: 'local', from: '2026-09-14T06:00:00Z', to: '2026-09-14T12:00:00Z' }, 'native-calendar-read');
        assert.ok(JSON.stringify(messages).includes('native-child-class')); childObserved = true;
        return { content: '本次 native-calendar-read 已取得合成原生日程，07:00 UTC 开始，持续 60 分钟。', tool_calls: [] };
      }
      rootCalls++;
      if (rootCalls === 1) return reply('delegate', { tasks: [{ title: '核对今天', instruction: '核对今天本地安排的实际开始时间和持续时长。', sources: ['local-agenda'] }] });
      if (rootCalls === 2) {
        assert.ok(JSON.stringify(messages).includes('native-calendar-read'));
        return reply('decide_help', { id: s.opportunity.id, expectedRevision: s.opportunity.revision, choice: 'prepare', reason: '已从独立调查取得日程原始记录。', actionDescription: '安静准备。', sourceToolCallIds: ['native-calendar-read'], artifact: { title: '已核对时间', body: '合成原生日程从07:00 UTC开始，持续60分钟。' } });
      }
      return { content: '合成机制检查完成。', tool_calls: [] };
    };
    const harness = new Harness(s.f.store, () => 'synthetic', () => {}, () => client);
    await harness.reviewOpportunities();
    assert.ok(childObserved, 'a real AIAgent child consumed the host query result');
    assert.equal(actorCalls.size, 1);
    assert.equal(rootCalls, 3, 'the same-run decision receipt permits the final Hermes response');
    assert.equal(s.f.repo.work(s.f.scope(), undefined, s.opportunity.id)[0].status, 'prepared');
    assert.equal(s.f.store.agenda().length, 1);
  } finally { s.f.close(); }
});

test('pausing a real in-flight background child prevents its late tool proposal from reading or preparing', async () => {
  const s = await background(['local-agenda']);
  let harness: Harness | undefined, release: (value: Awaited<ReturnType<DeepSeekClient['complete']>>) => void = () => {};
  let ready!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  try {
    s.f.store.saveSettings({ mode: 'deepseek' });
    const client = new DeepSeekClient('synthetic');
    let childCalls = 0, rootCalls = 0;
    client.complete = async (_messages, _tools, _signal, _onText, options) => {
      if (options?.actorId) {
        childCalls++; ready();
        return new Promise(resolve => { release = resolve; });
      }
      rootCalls++;
      return reply('delegate', { tasks: [{ title: '挂起核对', instruction: '只读取今天的本地日程，并保留原始来源。', sources: ['local-agenda'] }] });
    };
    harness = new Harness(s.f.store, () => 'synthetic', () => {}, () => client);
    const pending = harness.reviewOpportunities();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([started, pending.then(() => { throw new Error('Background ended before child request.'); }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Controlled child did not start.')), 20000); })]);
    } finally { if (timer) clearTimeout(timer); }
    changeAttention(s, 'pause');
    release(reply('look_up', { source: 'local', from: '2026-09-14T06:00:00Z', to: '2026-09-14T12:00:00Z' }, 'late-read'));
    await pending;
    assert.equal(childCalls, 1);
    assert.equal(rootCalls, 1, 'the stale child result did not enter another parent completion');
    assert.ok(!s.runtime.broker.invocations.some(attempt => attempt.capability === 'local.agenda.read'));
    assert.equal(s.f.repo.work(s.f.scope(), undefined, s.opportunity.id)[0].status, 'paused');
    assert.equal(s.f.store.agenda().length, 0);
  } finally {
    release({ content: 'late controlled response', tool_calls: [] });
    await harness?.stop();
    s.f.close();
  }
});
