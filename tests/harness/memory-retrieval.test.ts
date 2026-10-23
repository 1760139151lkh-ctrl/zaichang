import test from 'node:test';
import assert from 'node:assert/strict';
import { Fixture, supported } from './support';
import { expandRecallBundle, fuseRecallRanks, recallQueries } from '../../src/main/memory/retrieval';

async function packFor(f: Fixture, text: string) {
  return f.store.runtime.context.compile(f.policy.ingress(text, 'recall-test', f.store.settings()), [], new AbortController().signal);
}

test('model-supplied cross-language queries recover a fact with no literal overlap and enter the real context receipt', async () => {
  const f = new Fixture();
  try {
    const fact = await f.remember('I do my most focused reading away from my apartment.', { predicate: 'reading.place' });
    const query = '接下来去哪儿读书更专注';
    assert.equal(f.repo.lexicalAssertionPage(f.scope(), query, { at: f.clock.now() }).items.length, 0);
    const pack = await packFor(f, query);
    const result = f.store.runtime.context.prefetch(pack, query, undefined, 0, 8, 0, undefined,
      { relatedQueries: ['focused reading', '适合学习的地点'] }) as any;
    assert.ok(result.bundles.some((bundle: any) => bundle.assertions.some((a: any) => a.id === fact.id)));
    assert.equal(result.coverage.retrieval, 'model_multi_query_rrf');
    assert.ok(pack.assertions.some(a => a.id === fact.id));
    assert.ok(pack.receipt.providedObjectVersions.some(v => v.id === fact.id && v.revision === fact.revision));
    assert.ok(pack.receipt.providedEvidenceIds.includes(fact.evidenceIds[0]));
    assert.equal(pack.data.retrievedContext, result);
  } finally { f.close(); }
});

test('a model can scan zero-overlap candidates; eligibility precedes pagination and every current page is reachable', async () => {
  const f = new Fixture();
  try {
    const retained = [];
    for (let i = 0; i < 13; i++) retained.push(await f.remember(`Amber notebook observation ${i}`, { predicate: `scan.${i}` }));
    for (let i = 0; i < 55; i++) await f.remember(`expired ${i}`, { predicate: `old.${i}`, validTo: '2026-09-13T06:00:00.000Z' });
    const pack = await packFor(f, '帮我回想那个没用中文描述的习惯');
    const found: string[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const result = f.store.runtime.context.prefetch(pack, '毫无字面联系', undefined, offset, 5, 0, undefined, { mode: 'scan' }) as any;
      assert.equal(result.status, 'fresh');
      found.push(...result.bundles.map((bundle: any) => bundle.assertions[0].id));
      offset = result.coverage.nextOffset;
    }
    assert.deepEqual(new Set(found), new Set(retained.map(a => a.id)));
    assert.equal(found.length, 13);
  } finally { f.close(); }
});

test('retrieval follows explicit dependency conditions and marks version drift instead of silently dropping them', async () => {
  const f = new Fixture();
  try {
    const location = await f.remember('设备在家中书桌', { predicate: 'device.place' });
    const activity = await f.remember('做项目需要这台设备', { predicate: 'project.device' });
    const root = await f.remember('选择今晚的工作场所', { predicate: 'work.place' });
    for (const [consumer, producer] of [[root, activity], [activity, location]]) f.repo.addDependency(f.scope(), {
      consumerId: consumer.id, producerId: producer.id, producerRevision: producer.revision, sensitivity: 'hard', invalidation: 'revalidate',
    });
    const expanded = expandRecallBundle(f.repo, f.scope(), root, f.clock.now())!;
    assert.deepEqual(new Set(expanded.assertions.map(a => a.id)), new Set([root.id, activity.id, location.id]));
    assert.equal(expanded.dependencyCoverage.status, 'complete');
    f.repo.saveAssertion(f.scope(), { ...location, revision: location.revision + 1 }, location.revision);
    const changed = expandRecallBundle(f.repo, f.scope(), root, f.clock.now())!;
    assert.equal(changed.dependencyCoverage.status, 'incomplete');
    assert.ok(changed.dependencyCoverage.gaps.some(g => g.reason === 'producer_revision_changed'));
    assert.ok(!changed.assertions.some(a => a.id === location.id));
  } finally { f.close(); }
});

test('expired dependencies and inaccessible supporting text cannot be smuggled in through another recalled fact', async () => {
  const f = new Fixture();
  try {
    const expired = await f.remember('旧的可用设备', { predicate: 'device.old', validTo: '2026-09-13T06:00:00.000Z' });
    const privateFact = await f.remember('公开片段。隐藏位置代号银杏。', { predicate: 'device.secret' });
    const root = await f.remember('考虑项目的下一步', { predicate: 'project.next' });
    for (const producer of [expired, privateFact]) f.repo.addDependency(f.scope(), {
      consumerId: root.id, producerId: producer.id, producerRevision: producer.revision, sensitivity: 'hard', invalidation: 'revalidate',
    });
    const result = expandRecallBundle(f.repo, f.scope(), root, f.clock.now(), event =>
      event.id === privateFact.evidenceIds[0] ? { ...event, text: '公开片段。' } : event)!;
    assert.deepEqual(result.assertions.map(a => a.id), [root.id]);
    assert.equal(result.dependencyCoverage.status, 'incomplete');
    assert.ok(!JSON.stringify(result).includes('银杏'));
    assert.ok(!JSON.stringify(result).includes('旧的可用设备'));
  } finally { f.close(); }
});

test('a temporary exception stops applying when its time ends without making the long-term preference unusable', async () => {
  const f = new Fixture();
  try {
    const root = await f.remember('通常愿意晚间跑步', { predicate: 'run.evening' });
    const event = f.ingest('只有今天不跑');
    const exception = await f.memory.propose(f.scope(), f.change(event, { operation: 'ADD_EXCEPTION', targetId: root.id,
      expectedRevision: root.revision, predicate: root.predicate, validFrom: f.clock.now(), validTo: '2026-09-15T00:00:00.000Z' }),
      undefined, { review: { ...supported, temporalType: 'temporary', derivation: 'maintain_existing' } });
    const stored = f.repo.assertion(f.scope(), root.id)!;
    const today = expandRecallBundle(f.repo, f.scope(), stored, f.clock.now())!;
    assert.ok(today.assertions.some(a => a.id === exception.id));
    const tomorrow = expandRecallBundle(f.repo, f.scope(), stored, '2026-09-15T06:00:00.000Z')!;
    assert.deepEqual(tomorrow.assertions.map(a => a.id), [root.id]);
    assert.equal(tomorrow.dependencyCoverage.status, 'complete');
  } finally { f.close(); }
});

test('searching old wording brings the exact correction source while the old assertion stays inactive', async () => {
  const f = new Fixture();
  try {
    const old = await f.remember('我喜欢爵士乐', { predicate: 'music.preference' });
    const event = f.ingest('更正，我偏好古典乐。');
    const replacement = await f.memory.propose(f.scope(), f.change(event, { operation: 'CORRECT', targetId: old.id,
      expectedRevision: old.revision, predicate: old.predicate }), undefined, { review: { ...supported, derivation: 'maintain_existing' } });
    const pack = await packFor(f, '当时聊的爵士乐');
    const result = f.store.runtime.context.prefetch(pack, '爵士乐') as any;
    assert.ok(result.originals.some((e: any) => e.id === old.evidenceIds[0] && e.use === 'historical_only'));
    assert.ok(result.correctionFollowups.some((e: any) => e.id === event.id && e.text.includes('古典')));
    assert.ok(!pack.assertions.some(a => a.id === old.id));
    assert.ok(pack.receipt.providedEvidenceIds.includes(event.id));
    assert.equal(f.repo.assertion(f.scope(), replacement.id)?.status, 'active');
  } finally { f.close(); }
});

test('scope denial and partial projection also hold for scan and multi-query paths', async () => {
  const f = new Fixture();
  try {
    const secret = await f.remember('Personal hidden code Rowan', { predicate: 'private.code' });
    const pack = await packFor(f, '查阅我的记忆');
    const result = f.store.runtime.context.prefetch(pack, '完全不同的词', undefined, 0, 8, 0,
      event => event.id === secret.evidenceIds[0] ? { ...event, text: 'Personal' } : event, { mode: 'scan' }) as any;
    assert.equal(result.bundles.length, 0);
    assert.ok(!JSON.stringify(result).includes('Rowan'));
    const denied = await packFor(f, '只看眼前材料');
    denied.contract.scope = f.scope({ sources: ['current'] });
    const value = f.store.runtime.context.prefetch(denied, 'Rowan', undefined, 0, 8, 0, undefined, { relatedQueries: ['Personal'], mode: 'scan' });
    assert.equal(value.status, 'forbidden');
  } finally { f.close(); }
});

test('fusion bounds are visible and all deep results retain executable single-query continuations', async () => {
  const f = new Fixture();
  try {
    for (let i = 0; i < 56; i++) await f.remember(`alpha notebook entry ${i}`, { predicate: `fusion.${i}` });
    const pack = await packFor(f, 'alpha');
    const result = f.store.runtime.context.prefetch(pack, 'alpha', undefined, 0, 5, 0, undefined, { relatedQueries: ['notebook'] }) as any;
    assert.equal(result.coverage.rankingWindow.candidateWindowOnly, true);
    const continuation = result.coverage.queryContinuations.find((v: any) => v.query === 'alpha');
    assert.equal(continuation.offset, 51);
    const rest = f.store.runtime.context.prefetch(pack, continuation.query, undefined, continuation.offset, 8, continuation.hardOffset) as any;
    assert.equal(rest.bundles.length, 5);
  } finally { f.close(); }
});

test('duplicate query arms and duplicate IDs do not manufacture extra support', () => {
  assert.deepEqual(recallQueries('ＡＢ', ['ab', 'CD', 'cd']), ['ＡＢ', 'CD']);
  const ranked = fuseRecallRanks([[{ id: 'a' }, { id: 'a' }, { id: 'b' }], [{ id: 'b' }]]);
  assert.deepEqual(ranked.map(a => a.id), ['b', 'a']);
});

test('deep dependencies disclose their gap and usage estimates do not truncate admitted facts', async () => {
  const f = new Fixture();
  try {
    const chain = [];
    for (let i = 0; i < 6; i++) chain.push(await f.remember(`依赖记录${i}：条件与例外都必须完整保留。`, { predicate: `chain.${i}` }));
    for (let i = 0; i < chain.length - 1; i++) f.repo.addDependency(f.scope(), { consumerId: chain[i].id,
      producerId: chain[i + 1].id, producerRevision: chain[i + 1].revision, sensitivity: 'hard', invalidation: 'revalidate' });
    const expanded = expandRecallBundle(f.repo, f.scope(), chain[0], f.clock.now())!;
    assert.equal(expanded.dependencyCoverage.status, 'incomplete');
    assert.ok(expanded.dependencyCoverage.gaps.some(g => g.reason === 'dependency_depth_limit'));
    assert.equal(expanded.assertions.length, 4);
    const pack = await packFor(f, '依赖记录');
    pack.contract.budget.maxReadBytes = 1;
    const result = f.store.runtime.context.prefetch(pack, '依赖记录') as any;
    assert.equal(result.status, 'fresh');
    assert.ok(result.bundles.every((bundle: any) => bundle.assertions.every((a: any) => a.text.includes('条件与例外都必须完整保留。'))));
    assert.deepEqual(pack.assertions.map(a => a.id).sort(), chain.map(a => a.id).sort());
    assert.equal(pack.data.retrievedContext, result);
    assert.ok(chain.every(a => pack.receipt.providedObjectVersions.some(v => v.kind === 'assertion' && v.id === a.id && v.revision === a.revision)));
  } finally { f.close(); }
});
