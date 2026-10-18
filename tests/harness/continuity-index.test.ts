import test from 'node:test';
import assert from 'node:assert/strict';
import { Fixture } from './support';
import type { ContextContract, WorkRecord } from '../../src/shared/harness';
import { buildContinuityIndex } from '../../src/main/runtime/continuity';

function contract(f: Fixture, changes: Partial<ContextContract> = {}): ContextContract {
  return { ...f.policy.ingress('继续我们刚才讨论的事情', 'continuity-index', f.store.settings()).contract,
    scope: f.scope(), ...changes };
}

function frame(f: Fixture, sessionId = 'old-session', title = '还没写完的故事') {
  const event = f.ingest('我想先保留这个故事的下一幕，等回来再接着写。');
  return f.store.runtime.collaboration.update(f.scope(), sessionId, { operation: 'frame', title,
    source: { eventId: event.id, quote: event.text }, frame: {
      question: '下一幕如何开始', confirmedFacts: [], decisions: [], tentativeUnderstanding: [], participation: [], rejectedOptions: [],
      nextStep: '接着比较已经讨论过的两种开场；尚未选定。',
    } });
}

async function prepare(f: Fixture, sessionId = 'old-session') {
  const runtime = f.store.runtime, event = f.ingest('请留意这份本地安排，合适时先准备好，回来再和我说。');
  const focus = runtime.attention.control(f.scope(), sessionId, { operation: 'follow', title: '留意本地安排', rule: event.text,
    sources: ['local-agenda'], source: { eventId: event.id, quote: event.text }, until: '2026-09-15T06:00:00Z' }) as WorkRecord;
  f.store.saveAction({ id: 'fixture-class', title: '合成课程', detail: 'PRIVATE-CALENDAR-BODY', startsAt: '2026-09-14T07:00:00Z', durationMinutes: 60, kind: 'event' });
  const opportunity = runtime.attention.offer(f.scope(), { bindingId: focus.id, watchId: 'fixture-watch', evidenceId: event.id,
    category: 'agenda', title: '安排准备', facts: {}, noveltyKey: 'fixture-first', expiresAt: '2026-09-14T08:00:00Z' })!;
  assert.ok(opportunity);
  const result = await runtime.broker.invoke(f.scope(), 'local.agenda.read', { from: '2026-09-14T06:00:00Z', to: '2026-09-14T12:00:00Z' }, new AbortController().signal);
  assert.equal(result.status, 'fresh');
  runtime.attention.decide(f.scope(), { id: opportunity.id, expectedRevision: opportunity.revision, choice: 'prepare',
    reason: '合成日历已实际回读。', actionDescription: '安静保存下一次可用的准备。', sourceToolCallIds: ['fixture-read'],
    artifact: { title: '已核对的一段时间', body: 'PRIVATE-ARTIFACT-BODY: 合成课程07:00到08:00 UTC。' } },
  [{ tool: 'look_up', toolCallId: 'fixture-read', result }]);
  return { focus, opportunity: f.repo.work(f.scope(), undefined, opportunity.id)[0], event };
}

const index = (f: Fixture, sessionId = 'new-session', changes: Partial<ContextContract> = {}) =>
  buildContinuityIndex(f.repo, contract(f, changes), sessionId, () => f.store.runtime.attention.expire());

test('real prepared output and unfinished frames are discoverable across conversations without their bodies or new effects', async () => {
  const f = new Fixture();
  try {
    const prepared = await prepare(f), open = frame(f);
    const result = index(f);
    assert.deepEqual(result.preparedMaterials.map(item => item.id), [prepared.opportunity.id]);
    assert.deepEqual(result.openThreads.map(item => item.id), [open.id]);
    assert.equal(result.preparedMaterials[0].fromCurrentConversation, false);
    assert.equal(result.openThreads[0].fromCurrentConversation, false);
    assert.equal(result.coverage.scope, 'permitted_workspace');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-ARTIFACT-BODY|PRIVATE-CALENDAR-BODY|sourceToolCallIds/);
    assert.equal(result.providedObjectVersions.length, 2);
    assert.ok(result.providedSourceIds.includes('local-agenda'), 'even short metadata retains its underlying source in the context receipt');
    assert.ok(result.providedSourceIds.includes('history:self'));
    assert.equal(f.store.agenda().length, 1, 'discovery did not schedule anything');
    assert.equal(Number(f.repo.db.prepare('SELECT count(*) AS n FROM h_jobs').get()!.n), 0, 'discovery did not send or schedule a notification');
  } finally { f.close(); }
});

test('session-only and restricted turns never acquire ambient context or refresh private work', async () => {
  const f = new Fixture();
  try {
    await prepare(f); const here = frame(f, 'new-session');
    const local = index(f, 'new-session', { memoryMode: 'session_only' });
    assert.deepEqual(local.preparedMaterials, []);
    assert.deepEqual(local.openThreads.map(item => item.id), [here.id]);
    assert.equal(local.coverage.scope, 'current_conversation');
    let refreshed = 0;
    for (const changes of [
      { memoryMode: 'none' as const }, { memoryMode: 'current_sources_only' as const },
      { scope: f.scope({ sources: ['current', 'history:self'] }) },
      { scope: f.scope({ audience: 'group' }) },
      { scope: f.scope({ worldId: 'fictional:test' }) },
      { scope: f.scope({ subjectId: 'friend-b' }) },
    ]) {
      const result = buildContinuityIndex(f.repo, contract(f, changes), 'new-session', () => { refreshed++; });
      assert.equal(result.coverage.scope, 'none');
      assert.deepEqual(result.providedObjectVersions, []);
    }
    assert.equal(refreshed, 0);
  } finally { f.close(); }
});

test('current sources and grants gate even titles and unfinished frame metadata', async () => {
  const f = new Fixture();
  try {
    const prepared = await prepare(f), open = frame(f, 'old-session', 'PRIVATE-FRAME-TITLE');
    f.store.runtime.work.update(f.scope(), open.id, open.revision, { data: { ...open.data, sourceIds: ['local-agenda'] } });
    const scope = f.scope({ sources: f.repo.scope(f.scope()).sources.filter(source => source !== 'local-agenda') });
    const result = index(f, 'new-session', { scope });
    assert.deepEqual(result.preparedMaterials, []);
    assert.deepEqual(result.openThreads, []);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-FRAME-TITLE|已核对的一段时间/);
    assert.ok(f.repo.work(f.scope(), undefined, prepared.opportunity.id)[0], 'a restricted view does not delete legitimate preparation');
    const malformed = frame(f, 'old-session', 'MALFORMED-SOURCE-TITLE');
    f.store.runtime.work.update(f.scope(), malformed.id, malformed.revision, { data: { ...malformed.data, sourceIds: [42] } });
    assert.doesNotMatch(JSON.stringify(index(f)), /MALFORMED-SOURCE-TITLE/);
  } finally { f.close(); }
});

test('actual calendar revisions, stop controls and expiry invalidate prepared cues before projection', async () => {
  const f = new Fixture();
  try {
    const prepared = await prepare(f);
    assert.equal(index(f).preparedMaterials.length, 1);
    const original = f.store.agenda().find(item => item.id === 'fixture-class')!;
    f.store.saveAction({ ...original, startsAt: '2026-09-14T09:00:00Z', revision: (original.revision || 1) + 1 });
    assert.deepEqual(index(f).preparedMaterials, []);
    assert.equal(f.repo.work(f.scope(), undefined, prepared.opportunity.id)[0].status, 'stale');
  } finally { f.close(); }
  const stopped = new Fixture();
  try {
    const prepared = await prepare(stopped), event = stopped.ingest('这件事不用再继续了。');
    stopped.store.runtime.attention.control(stopped.scope(), 'old-session', { operation: 'stop', targetId: prepared.focus.id,
      source: { eventId: event.id, quote: event.text } });
    assert.deepEqual(index(stopped).preparedMaterials, []);
  } finally { stopped.close(); }
  const expired = new Fixture();
  try {
    await prepare(expired); expired.clock.advance(3 * 60 * 60 * 1000);
    assert.deepEqual(index(expired).preparedMaterials, []);
  } finally { expired.close(); }
});

test('real display suppresses an unsolicited cue while OS submission is not treated as seen', async () => {
  const f = new Fixture();
  try {
    const prepared = await prepare(f), runtime = f.store.runtime;
    const helpId = String(prepared.opportunity.data.helpRecordId);
    const help = f.repo.work(f.scope(), undefined, helpId)[0];
    assert.ok(help);
    const submitted = runtime.cooperation.delivery(f.scope(), help.id, help.revision, 'submitted_to_os');
    assert.equal(index(f).preparedMaterials[0].delivery, 'submitted_or_delivered');
    runtime.cooperation.exposure(f.scope(), help.id, submitted.revision, 'displayed');
    assert.deepEqual(index(f).preparedMaterials, []);
    assert.ok(runtime.attention.inspect(f.scope(), f.repo.work(f.scope(), undefined, prepared.opportunity.id)[0]).opportunity.data.artifact,
      'already-seen material is still explicitly retrievable');
  } finally { f.close(); }
});

test('index survives restart, omits ended threads, and never claims freshness without the real refresh hook', async () => {
  let f = new Fixture();
  try {
    const prepared = await prepare(f), open = frame(f);
    f = f.restart();
    assert.equal(index(f).preparedMaterials[0].id, prepared.opportunity.id);
    assert.equal(index(f).openThreads[0].id, open.id);
    const noHook = buildContinuityIndex(f.repo, contract(f), 'new-session');
    assert.deepEqual(noHook.preparedMaterials, []);
    const current = f.repo.work(f.scope(), undefined, open.id)[0];
    f.store.runtime.work.update(f.scope(), open.id, current.revision, { status: 'closed' });
    assert.deepEqual(index(f).openThreads, []);
  } finally { f.close(); }
});

test('coordinator connects the real refresher and compiler carries discovery provenance into the actual pack', async () => {
  const f = new Fixture();
  try {
    const prepared = await prepare(f), open = frame(f);
    const ingress = f.policy.ingress('我们回来继续刚才的安排和故事。', 'pack-continuity', f.store.settings());
    ingress.contract = contract(f);
    const pack = await f.store.runtime.context.compile(ingress, [], new AbortController().signal, [], false, 'new-session');
    assert.deepEqual((pack.data.preparedMaterials as { id: string }[]).map(item => item.id), [prepared.opportunity.id]);
    assert.deepEqual((pack.data.openThreads as { id: string }[]).map(item => item.id), [open.id]);
    assert.ok(pack.receipt.providedSourceIds?.includes('local-agenda'));
    assert.ok(pack.receipt.providedObjectVersions.some(item => item.id === prepared.opportunity.id));
    assert.doesNotMatch(JSON.stringify(pack.data), /PRIVATE-ARTIFACT-BODY|PRIVATE-CALENDAR-BODY/);
    ingress.requiresReadPurpose = true;
    const restricted = await f.store.runtime.context.compile(ingress, [], new AbortController().signal, [], false, 'new-session');
    assert.equal(restricted.data.preparedMaterials, undefined);
    assert.equal(restricted.data.openThreads, undefined);
  } finally { f.close(); }
});
