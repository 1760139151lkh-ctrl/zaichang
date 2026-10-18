import test from 'node:test';
import assert from 'node:assert/strict';
import { Fixture, supported } from './support';
import type { EvidenceEvent, WorkRecord } from '../../src/shared/harness';

function useBasis(f: Fixture, event: EvidenceEvent, matter: WorkRecord, quote: string, consumerIds: string[] = []) {
  return f.store.runtime.basis.update(f.scope(), 'basis-restriction-session', {
    operation: 'use', matterId: matter.id, source: { eventId: event.id, quote },
    interpretation: quote, purpose: '比较本次可选活动', validWhen: '本次活动比较且原话仍适用',
    stopWhen: '用户更正这项偏好或结束比较', recheckAt: null,
    standing: 'supported', applicability: 'applies_now', consumerIds,
  }) as WorkRecord;
}

test('source correction retires only overlapping basis uses and their candidates, preserving unrelated uses and accepted calendar', async () => {
  let f = new Fixture();
  try {
    const event = f.ingest('🎼我喜欢爵士乐。跑步常去西操场。', 'basis-combined-source');
    const music = await f.memory.propose(f.scope(), f.change(event, {
      sourceQuote: '我喜欢爵士乐。', text: '我喜欢爵士乐。', predicate: 'music.preference',
    }), undefined, { review: supported });
    const matter = f.store.runtime.work.create(f.scope(), 'episode', '周末活动比较', {}, { status: 'active' });
    const option = f.store.runtime.work.create(f.scope(), 'option', '爵士演出候选', {}, { status: 'proposed' });
    const oldBasis = useBasis(f, event, matter, '我喜欢爵士乐。', [option.id]);
    const unrelated = useBasis(f, event, matter, '跑步常去西操场。');
    assert.deepEqual((oldBasis.data.source as any).start, 1, 'source offsets use Unicode code points');
    f.store.saveAction({ id: 'independent-calendar', title: '已确认的讨论', detail: '', done: false, startsAt: '2026-09-14T10:00:00Z' });
    const accepted = structuredClone(f.store.agenda());

    const correction = f.ingest('更正：我只喜欢古典乐。', 'basis-music-correction');
    await f.memory.propose(f.scope(), f.change(correction, {
      operation: 'CORRECT', targetId: music.id, expectedRevision: music.revision, predicate: music.predicate,
    }), undefined, { review: { ...supported, derivation: 'maintain_existing' } });

    const states = f.store.runtime.basis.read(f.scope(), matter.id);
    const corrected = states.find(record => record.id === oldBasis.id)!;
    assert.equal(corrected.usableNow, false);
    assert.equal(corrected.status, 'insufficient');
    assert.equal(corrected.data.invalidationReason, 'basis_source_changed');
    assert.equal(corrected.data.inverseEstablished, false);
    assert.equal(states.find(record => record.id === unrelated.id)?.usableNow, true);
    assert.equal(f.repo.work(f.scope(), undefined, option.id)[0].status, 'stale');
    assert.deepEqual(f.store.agenda(), accepted);
    assert.throws(() => useBasis(f, event, matter, '我喜欢爵士乐。'), { code: 'basis_source_changed' });
    assert.doesNotThrow(() => useBasis(f, event, matter, '跑步常去西操场。'));
    assert.doesNotThrow(() => useBasis(f, correction, matter, correction.text));
    assert.throws(() => f.store.runtime.basis.link(f.scope(), oldBasis, option.id), { code: 'basis_inactive' });

    f = f.restart();
    assert.equal(f.store.runtime.basis.read(f.scope(), matter.id).find(record => record.id === oldBasis.id)?.usableNow, false);
    assert.equal(f.store.runtime.basis.read(f.scope(), matter.id).find(record => record.id === unrelated.id)?.usableNow, true);
    assert.deepEqual(f.store.agenda(), accepted);
  } finally { f.close(); }
});

test('a future supersession retires the old basis at its effective time, including after restart', async () => {
  let f = new Fixture();
  try {
    const event = f.ingest('我目前跑步常去西操场。', 'basis-current-place');
    const old = await f.memory.propose(f.scope(), f.change(event, { predicate: 'running.venue' }), undefined, { review: supported });
    const matter = f.store.runtime.work.create(f.scope(), 'episode', '选择跑步地点', {}, { status: 'active' });
    const basis = useBasis(f, event, matter, event.text);
    const future = f.ingest('从明天开始我改去东操场跑步。', 'basis-future-place');
    const starts = '2026-09-15T06:00:00.000Z';
    await f.memory.propose(f.scope(), f.change(future, {
      operation: 'SUPERSEDE', targetId: old.id, expectedRevision: old.revision, predicate: old.predicate, validFrom: starts,
    }), undefined, { review: { ...supported, derivation: 'maintain_existing', temporalType: 'future' } });
    assert.equal(f.store.runtime.basis.read(f.scope(), matter.id).find(record => record.id === basis.id)?.usableNow, true);
    assert.doesNotThrow(() => useBasis(f, event, matter, event.text));
    f = f.restart();
    f.clock.set(starts);
    assert.equal(f.store.runtime.basis.read(f.scope(), matter.id).find(record => record.id === basis.id)?.usableNow, false);
    assert.throws(() => useBasis(f, event, matter, event.text), { code: 'basis_source_changed' });
  } finally { f.close(); }
});

test('legacy restrictions without a locator request re-evaluation without invalidating a different source', async () => {
  const f = new Fixture();
  try {
    const old = f.ingest('我喜欢爵士乐。', 'basis-legacy-source');
    const separate = f.ingest('跑步常去西操场。', 'basis-separate-source');
    const matter = f.store.runtime.work.create(f.scope(), 'episode', '活动比较', {}, { status: 'active' });
    const restricted = useBasis(f, old, matter, old.text);
    const unrelated = useBasis(f, separate, matter, separate.text);
    f.repo.db.prepare('INSERT INTO h_source_restrictions VALUES(?,?,?,?)').run(old.id, 'music.preference', 'CORRECT', null);
    const states = f.store.runtime.basis.read(f.scope(), matter.id);
    assert.equal(states.find(record => record.id === restricted.id)?.usableNow, false);
    assert.equal(states.find(record => record.id === unrelated.id)?.usableNow, true);
    assert.throws(() => useBasis(f, old, matter, old.text), { code: 'basis_source_changed' });
    assert.equal(f.repo.evidence(f.scope(), old.id)?.text, old.text, 'retiring a use does not delete the original');
  } finally { f.close(); }
});
