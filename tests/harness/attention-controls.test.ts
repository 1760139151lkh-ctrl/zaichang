import test from 'node:test';
import assert from 'node:assert/strict';
import { Fixture } from './support';
import { NativeControls } from '../../src/main/runtime/controls';
import type { AttentionControlItem } from '../../src/shared/attention-control';
import type { WorkRecord } from '../../src/shared/harness';

const controls = (f: Fixture) => new NativeControls(f.store, { running: false, recoverPending: async () => {} });
function follow(f: Fixture, title: string, options: { until?: string; parent?: string; sessionId?: string; sources?: string[] } = {}) {
  const event = f.ingest(`PRIVATE-ORIGINAL: 我把${title}交给你留意，遵守这份具体约定。`);
  return f.store.runtime.attention.control(f.scope(), options.sessionId || 'synthetic-session', {
    operation: 'follow', title, rule: 'PRIVATE-RULE: 只按原来的来源与期限留意。', sources: options.sources || ['map:local'],
    ...(options.until ? { until: options.until } : {}), ...(options.parent ? { targetId: options.parent } : {}),
    source: { eventId: event.id, quote: event.text },
  }) as WorkRecord;
}
function command(item: AttentionControlItem, operation: 'pause' | 'resume' | 'stop') {
  const rule = item.pauseRules.find(rule => rule.resumable);
  return { id: item.id, expectedRevision: item.revision, expectedControlVersion: item.controlVersion, operation,
    ...(operation === 'resume' && rule ? { ruleId: rule.id, ruleRevision: rule.revision } : {}) };
}

test('native entrusted list pages every focus, excludes private bodies, and rejects changed cursors', () => {
  const f = new Fixture();
  try {
    const api = controls(f), sessionId = f.store.session();
    const ids = Array.from({ length: 27 }, (_, i) => follow(f, `托付 ${i}`, { sessionId }).id);
    const first = api.attentionList({ limit: 10 }), second = api.attentionList({ limit: 10, cursor: first.nextCursor! });
    const third = api.attentionList({ limit: 10, cursor: second.nextCursor! });
    assert.equal(third.nextCursor, null);
    assert.deepEqual(new Set([...first.items, ...second.items, ...third.items].map(item => item.id)), new Set(ids));
    assert.equal(first.items[0].sessionId, sessionId);
    assert.doesNotMatch(JSON.stringify(first), /PRIVATE-ORIGINAL|PRIVATE-RULE|evidenceIds|probe|governingRule/);
    follow(f, '后来的一件事');
    assert.throws(() => api.attentionList({ limit: 10, cursor: first.nextCursor! }), /变化/);
    assert.throws(() => api.attentionList({ cursor: 'not a cursor' }), /位置/);
  } finally { f.close(); }
});

test('native pause is durable, stale clicks roll back, and resume clears only its exact live rule', () => {
  let f = new Fixture();
  try {
    const focus = follow(f, '看看路线', { until: '2026-09-20T06:00:00Z' });
    let api = controls(f), item = api.attentionList().items[0];
    const stale = command(item, 'pause'), paused = api.attentionChange(stale);
    assert.equal(paused.status, 'paused');
    assert.equal(paused.pauseRules.length, 1);
    assert.notEqual(paused.controlVersion, item.controlVersion);
    const count = () => Number(f.repo.db.prepare('SELECT COUNT(*) AS n FROM h_evidence').get()!.n);
    const before = count();
    assert.throws(() => api.attentionChange(stale), /变化/);
    assert.equal(count(), before, 'a stale click leaves no misleading user-control evidence');
    f = f.restart(); api = controls(f); item = api.attentionList().items[0];
    assert.equal(item.status, 'paused');
    const resumed = api.attentionChange(command(item, 'resume'));
    assert.equal(resumed.id, focus.id);
    assert.equal(resumed.status, 'active');
    assert.equal(resumed.until, '2026-09-20T06:00:00Z');
    assert.deepEqual(resumed.sources, ['map:local']);
    const pausedAgain = api.attentionChange(command(resumed, 'pause'));
    const oldResume = command(pausedAgain, 'resume');
    const stopped = api.attentionChange(command(pausedAgain, 'stop'));
    assert.equal(stopped.status, 'ended');
    assert.equal(stopped.canPause, false);
    assert.ok(stopped.pauseRules.every(rule => !rule.resumable));
    assert.throws(() => api.attentionChange(oldResume), /变化/);
    assert.equal(api.attentionList().items[0].status, 'ended');
    const audit = f.repo.db.prepare("SELECT content FROM h_evidence WHERE json_extract(payload,'$.kind')='user_control'").all();
    assert.ok(audit.some(row => String(row.content).includes('选中的这次暂停')));
  } finally { f.close(); }
});

test('native resume never lifts an inherited or global pause and cannot revive expired permission', () => {
  const f = new Fixture();
  try {
    const api = controls(f), parent = follow(f, '周末安排'), child = follow(f, '其中的出行', { parent: parent.id });
    const parentItem = api.attentionList().items.find(item => item.id === parent.id)!;
    api.attentionChange(command(parentItem, 'pause'));
    const childItem = api.attentionList().items.find(item => item.id === child.id)!;
    assert.equal(childItem.status, 'paused');
    assert.ok(childItem.pauseRules.every(rule => !rule.resumable));
    assert.throws(() => api.attentionChange({ ...command(childItem, 'resume'), ruleId: childItem.pauseRules[0].id,
      ruleRevision: childItem.pauseRules[0].revision }), /不能解除/);

    const globalEvent = f.ingest('这些可选关注都先停一停。');
    f.store.runtime.attention.control(f.scope(), '', { operation: 'pause', source: { eventId: globalEvent.id, quote: globalEvent.text } });
    const globallyPaused = api.attentionList().items.find(item => item.id === child.id)!;
    assert.equal(globallyPaused.pauseRules.length, 2);
    assert.ok(globallyPaused.pauseRules.every(rule => !rule.resumable));

    // Resolve the global pause through the original attention contract so the
    // expiry case below exercises an independently resumable local pause.
    const globalRule = f.store.runtime.attention.rules(f.scope()).find(rule => !rule.data.matterId && rule.data.operation === 'pause')!;
    const globalResume = f.ingest('解除刚才对全部关注的暂停。');
    f.store.runtime.attention.control(f.scope(), '', { operation: 'resume', targetId: globalRule.id, expectedRevision: globalRule.revision,
      source: { eventId: globalResume.id, quote: globalResume.text } });

    const short = follow(f, '今天的事', { until: '2026-09-14T06:10:00Z' });
    const paused = api.attentionChange(command(api.attentionList().items.find(item => item.id === short.id)!, 'pause'));
    f.clock.advance(11 * 60_000);
    const expired = api.attentionList().items.find(item => item.id === short.id)!;
    assert.equal(expired.status, 'expired');
    assert.ok(expired.pauseRules.every(rule => !rule.resumable));
    assert.throws(() => api.attentionChange(command(paused, 'resume')), /变化/);
    assert.equal(f.repo.work(f.scope(), undefined, short.id)[0].data.until, '2026-09-14T06:10:00Z');
  } finally { f.close(); }
});

test('native pause and stop fence real optional opportunities without cancelling an independent reminder', () => {
  const f = new Fixture();
  try {
    const runtime = f.store.runtime, api = controls(f), focus = follow(f, '沿路看看');
    const opportunity = runtime.attention.offer(f.scope(), { bindingId: focus.id, watchId: 'synthetic-change',
      evidenceId: focus.evidenceIds[0], category: 'map', title: '一份出行准备', facts: { fixture: 'a real stored opportunity' },
      noveltyKey: 'first', expiresAt: '2026-09-14T08:00:00Z' })!;
    assert.ok(opportunity);
    runtime.reminders.schedule({ id: opportunity.id, title: '有一份出行准备', detail: '', kind: 'reminder', startsAt: '2026-09-14T07:00:00Z' }, focus.id,
      '2026-09-14T08:00:00Z', { kind: 'suggestion', producerId: opportunity.id });
    runtime.reminders.schedule({ id: 'independent-reminder', title: '喝水', detail: '', kind: 'reminder', startsAt: '2026-09-14T07:00:00Z' });
    const jobStatus = (id: string) => f.repo.db.prepare('SELECT status FROM h_jobs WHERE object_id=?').get(id)?.status;
    const paused = api.attentionChange(command(api.attentionList().items[0], 'pause'));
    assert.equal(f.repo.work(f.scope(), undefined, opportunity.id)[0].status, 'paused');
    assert.equal(jobStatus(opportunity.id), 'cancelled');
    assert.equal(jobStatus('independent-reminder'), 'queued');
    assert.equal(runtime.attention.pending(f.scope()).length, 0);
    const resumed = api.attentionChange(command(paused, 'resume'));
    assert.ok(runtime.attention.pending(f.scope()).some(item => item.id === opportunity.id));
    assert.equal(jobStatus(opportunity.id), 'cancelled', 'resuming only makes preparation eligible; it never resends the old notification');
    api.attentionChange(command(resumed, 'stop'));
    assert.equal(runtime.attention.pending(f.scope()).length, 0);
    assert.equal(jobStatus('independent-reminder'), 'queued');
  } finally { f.close(); }
});

test('native metadata remains manageable with memory off, revoked sources cannot resume, and public or other-subject reads fail', () => {
  const f = new Fixture();
  try {
    const focus = follow(f, '路线变化'), api = controls(f);
    const paused = api.attentionChange(command(api.attentionList().items[0], 'pause'));
    f.store.saveSettings({ memoryEnabled: false });
    const privateView = api.attentionList().items.find(item => item.id === focus.id)!;
    assert.equal(privateView.status, 'paused');
    assert.doesNotMatch(JSON.stringify(privateView), /PRIVATE-/);
    f.policy.revoke('map:read');
    const blocked = api.attentionList().items.find(item => item.id === focus.id)!;
    assert.equal(blocked.unavailableReason, 'source_permission');
    assert.ok(blocked.pauseRules.every(rule => !rule.resumable));
    assert.throws(() => api.attentionChange(command(paused, 'resume')), /变化/);
    assert.equal(api.attentionChange(command(blocked, 'stop')).status, 'ended');
    assert.throws(() => f.store.runtime.attention.nativeList(f.scope({ subjectId: 'someone-else' }), {}), /本人/);
    f.store.runtime.presentation.setSurface('public');
    assert.throws(() => api.attentionList(), /自己的页面/);
    assert.throws(() => api.attentionChange(command(blocked, 'stop')), /自己的页面/);
  } finally { f.close(); }
});
