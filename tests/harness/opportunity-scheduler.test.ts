import test from 'node:test';
import assert from 'node:assert/strict';
import { Fixture } from './support';
import { createOpportunityScheduler } from '../../src/main/runtime/opportunity-scheduler';
import type { WorkRecord } from '../../src/shared/harness';

function follow(f: Fixture, title: string, wakeAt: string[] = []) {
  const event = f.ingest(`这周帮我留意${title}，只用公开地图资料，先准备。`);
  return f.store.runtime.attention.control(f.scope(), 'synthetic-session', {
    operation: 'follow', title, rule: '持续读取已允许来源，先准备。', sources: ['map:local'], wakeAt,
    source: { eventId: event.id, quote: event.text },
  }) as WorkRecord;
}

test('persisted near deadlines wake before reconciliation and survive a restart', async () => {
  let f = new Fixture();
  try {
    const due = '2026-09-14T06:00:05.000Z';
    follow(f, '出行', [due]);
    await f.store.runtime.attention.scan(f.scope(), new AbortController().signal);
    const initial = f.store.runtime.attention.pending(f.scope(), 1)[0];
    f.store.runtime.attention.settleReview(f.scope(), initial);
    assert.equal(f.store.runtime.attention.nextReviewAt(), due);
    f = f.restart();
    assert.equal(f.store.runtime.attention.nextReviewAt(), due);
    f.clock.advance(5000);
    await f.store.runtime.attention.scan(f.scope(), new AbortController().signal);
    assert.ok(f.store.runtime.attention.pending(f.scope()).some(item => (item.data.facts as any).scheduledAt === due));
  } finally { f.close(); }
});

test('failed waiting work backs off durably and cannot overwrite cancellation', async () => {
  let f = new Fixture();
  try {
    const focus = follow(f, '开放地点');
    await f.store.runtime.attention.scan(f.scope(), new AbortController().signal);
    const first = f.store.runtime.attention.pending(f.scope(), 1)[0];
    f.store.runtime.attention.settleReview(f.scope(), first, new Error('PRIVATE provider payload'));
    let current = f.repo.work(f.scope(), undefined, first.id)[0];
    assert.equal(current.data.reviewFailures, 1);
    assert.equal(current.data.reconsiderAt, '2026-09-14T06:00:30.000Z');
    assert.doesNotMatch(JSON.stringify(current.data.reviewFailure), /PRIVATE/);
    f = f.restart();
    assert.equal(f.store.runtime.attention.pending(f.scope()).length, 0);
    f.clock.advance(30000);
    current = f.store.runtime.attention.pending(f.scope(), 1)[0];
    assert.equal(current.status, 'waiting');
    f.store.runtime.attention.settleReview(f.scope(), current, new Error('offline'));
    current = f.repo.work(f.scope(), undefined, first.id)[0];
    assert.equal(current.data.reviewFailures, 2);
    assert.equal(current.data.reconsiderAt, '2026-09-14T06:01:30.000Z');
    const cancellation = f.ingest('停止这项关注。');
    const liveFocus = f.repo.work(f.scope(), undefined, focus.id)[0];
    f.store.runtime.attention.control(f.scope(), 'synthetic-session', { operation: 'stop', targetId: focus.id, expectedRevision: liveFocus.revision,
      source: { eventId: cancellation.id, quote: cancellation.text } });
    const cancelled = f.repo.work(f.scope(), undefined, first.id)[0];
    f.store.runtime.attention.settleReview(f.scope(), current, new Error('late failure'));
    assert.deepEqual(f.repo.work(f.scope(), undefined, first.id)[0], cancelled);
    assert.equal(f.store.runtime.attention.nextReviewAt(), null);
  } finally { f.close(); }
});

test('expiry releases full waiting capacity before the next persisted time node', async () => {
  const f = new Fixture();
  try {
    const expiry = '2026-09-14T06:00:05.000Z', due = '2026-09-14T06:00:10.000Z';
    const focus = follow(f, '窗口', [due]);
    await f.store.runtime.attention.scan(f.scope(), new AbortController().signal);
    for (let index = 0; index < 4; index++) f.store.runtime.attention.offer(f.scope(), {
      bindingId: focus.id, watchId: 'capacity-fixture', evidenceId: focus.evidenceIds[0], category: 'map',
      title: `资料 ${index}`, facts: { index }, noveltyKey: `capacity-${index}`, expiresAt: expiry,
    });
    const queued = f.store.runtime.attention.pending(f.scope(), 5);
    assert.equal(queued.length, 5);
    for (const item of queued) {
      f.store.runtime.attention.settleReview(f.scope(), item);
      const waiting = f.repo.work(f.scope(), undefined, item.id)[0];
      f.store.runtime.work.update(f.scope(), item.id, waiting.revision, { data: { ...waiting.data, expiresAt: expiry } });
    }
    assert.equal(f.store.runtime.attention.nextReviewAt(), expiry);
    f.clock.advance(5000);
    assert.equal(f.store.runtime.attention.nextReviewAt(), due);
    f.clock.advance(5000);
    await f.store.runtime.attention.scan(f.scope(), new AbortController().signal);
    assert.ok(f.store.runtime.attention.pending(f.scope()).some(item => (item.data.facts as any).scheduledAt === due));
  } finally { f.close(); }
});

test('ordinary reviews rotate mandates while a genuinely near expiry remains first', async () => {
  const f = new Fixture();
  try {
    const first = follow(f, '地点甲');
    f.clock.advance(1);
    const second = follow(f, '地点乙');
    await f.store.runtime.attention.scan(f.scope(), new AbortController().signal);
    const a = f.store.runtime.attention.pending(f.scope(), 1)[0];
    const other = a.data.bindingId === first.id ? second.id : first.id;
    f.store.runtime.attention.settleReview(f.scope(), a, new Error('offline'));
    f.clock.advance(30000);
    assert.equal(f.store.runtime.attention.pending(f.scope(), 1)[0].data.bindingId, other);
    const waiting = f.repo.work(f.scope(), undefined, a.id)[0];
    f.store.runtime.work.update(f.scope(), waiting.id, waiting.revision, { data: { ...waiting.data,
      expiresAt: new Date(Date.parse(f.clock.now()) + 10000).toISOString() } });
    assert.equal(f.store.runtime.attention.pending(f.scope(), 1)[0].id, a.id);
  } finally { f.close(); }
});

test('on-request preference fences already queued reviews without destroying the work', async () => {
  const f = new Fixture();
  try {
    follow(f, '以后再看的准备');
    await f.store.runtime.attention.scan(f.scope(), new AbortController().signal);
    const queued = f.store.runtime.attention.pending(f.scope(), 1)[0];
    assert.ok(queued);
    f.store.saveSettings({ interaction: { ...f.store.settings().interaction, followup: 'on_request' } });
    assert.equal(f.store.runtime.attention.nextReviewAt(), null);
    assert.deepEqual(f.store.runtime.attention.pending(f.scope()), []);
    assert.equal(f.repo.work(f.scope(), undefined, queued.id)[0].status, 'candidate');
    f.store.saveSettings({ interaction: { ...f.store.settings().interaction, followup: 'meaningful_change' } });
    assert.equal(f.store.runtime.attention.pending(f.scope(), 1)[0].id, queued.id);
  } finally { f.close(); }
});

class Timers {
  now = 0;
  counter = 0;
  entries = new Map<number, { at: number; callback: () => void }>();
  set = (callback: () => void, delay: number) => { const id = ++this.counter; this.entries.set(id, { at: this.now + delay, callback }); return id; };
  clear = (id: unknown) => { this.entries.delete(id as number); };
  async advance(to: number) {
    for (;;) {
      const entry = [...this.entries].sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry || entry[1].at > to) break;
      this.now = entry[1].at; this.entries.delete(entry[0]); entry[1].callback();
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    this.now = to;
  }
}

test('wake timer coalesces changes, never overlaps a review and stops after shutdown', async () => {
  const timers = new Timers();
  let due: string | null = new Date(5000).toISOString(), calls = 0, finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const scheduler = createOpportunityScheduler({ timers, now: () => timers.now, nextReviewAt: () => due,
    review: async () => { calls++; await pending; due = null; } });
  for (let i = 0; i < 10; i++) scheduler.wake();
  assert.equal(timers.entries.size, 1);
  await timers.advance(4999); assert.equal(calls, 0);
  await timers.advance(5000); assert.equal(calls, 1);
  for (let i = 0; i < 10; i++) scheduler.wake();
  await timers.advance(20000); assert.equal(calls, 1);
  scheduler.stop(); finish();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(timers.entries.size, 0);
});

test('foreground unavailability does not spin and new availability advances the wake', async () => {
  const timers = new Timers();
  let available = false, calls = 0, due: string | null = new Date(0).toISOString();
  const scheduler = createOpportunityScheduler({ timers, now: () => timers.now, available: () => available,
    nextReviewAt: () => due, review: async () => { calls++; due = null; } });
  assert.equal([...timers.entries.values()][0].at, 60000);
  await timers.advance(2000); available = true; scheduler.wake();
  assert.equal([...timers.entries.values()][0].at, 3000);
  await timers.advance(3000); assert.equal(calls, 1);
  scheduler.stop();
});
