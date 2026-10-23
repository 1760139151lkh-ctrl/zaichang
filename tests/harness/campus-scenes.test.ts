import test from 'node:test';
import assert from 'node:assert/strict';
import { campusSnapshot } from '../../src/main/runtime/scenes';
import { sceneViewDsl, type PresentationView, type SceneSnapshot } from '../../src/shared/scenes';
import { Fixture } from './support';

const now = '2026-10-18T08:00:00Z';
const result = () => ({ status: 'fresh', sourceId: 'campus:zju-account', fetchedAt: now, coverage: { complete: true }, data: {
  domain: 'schedule', origin: 'zju_account', termId: '2026-2027-1', total: 1,
  records: [{ uid: 'class-1', summary: '合成测试课程', startTime: '2026-10-19T14:00:00+08:00', endTime: '2026-10-19T15:35:00+08:00', location: '合成教室', teacher: '合成教师' }],
} });

test('campus scene projects only connector fields, preserving original time and missing values', () => {
  const input = result();
  const scene = campusSnapshot(input, 'campus.lookup', { domain: 'schedule' }, now)!;
  assert.equal(scene.records[0].startsAt, '2026-10-19T14:00:00+08:00');
  assert.equal(scene.records[0].title, '合成测试课程');
  assert.equal(scene.source.fetchedAt, now);
  assert.equal(scene.source.version?.length, 64);
  assert.equal(scene.complete, true);
  assert.match(sceneViewDsl([scene], 'stack'), /CampusScene\(/);
  const missing = campusSnapshot({ ...input, fetchedAt: undefined, data: { ...input.data, records: [{ uid: 'class-1', summary: '合成测试课程' }] } }, 'campus.lookup', { domain: 'schedule' }, now)!;
  assert.equal(missing.source.fetchedAt, '');
  assert.equal(missing.records[0].startsAt, undefined);
  assert.equal(missing.records[0].location, undefined);
  assert.notEqual(missing.source.version, scene.source.version);
  assert.equal(campusSnapshot({ ...input, data: { ...input.data, records: [{ course_id: 'wrong-contract', summary: '合成测试课程' }] } }, 'campus.lookup', { domain: 'schedule' }, now), undefined);
});

test('campus projection does not turn failed, conflicted, unrelated, aggregated or sensitive reads into a scene', () => {
  const input = result();
  for (const status of ['forbidden', 'failed', 'unknown', 'not_found', 'conflict']) {
    assert.equal(campusSnapshot({ ...input, status }, 'campus.lookup', { domain: 'schedule' }, now), undefined);
  }
  assert.equal(campusSnapshot({ ...input, sourceId: 'history:self' }, 'campus.lookup', { domain: 'schedule' }, now), undefined);
  assert.equal(campusSnapshot(input, 'campus.lookup', { domain: 'grades' }, now), undefined);
  assert.equal(campusSnapshot(input, 'campus.lookup', { domain: 'exams' }, now), undefined);
  assert.equal(campusSnapshot({ ...input, data: { ...input.data, conflicts: [{}] } }, 'campus.lookup', { domain: 'schedule' }, now), undefined);
  assert.equal(campusSnapshot(input, 'campus.query', { operation: 'select', spec: { resource: 'classes', operation: 'aggregate' } }, now), undefined);
  assert.equal(campusSnapshot(input, 'campus.query', { operation: 'select', spec: { resource: 'classes', join: { resource: 'grades' } } }, now), undefined);
  const page = campusSnapshot({ ...input, data: { resource: 'classes', records: input.data.records, next_offset: 1, total_matches: 12 } }, 'campus.query', { operation: 'quick', resource: 'classes' }, now)!;
  assert.equal(page.complete, false);
  assert.equal(page.total, 12);
});

test('offline campus records remain distinguishable and retain the source object revision', () => {
  const scene = campusSnapshot({ status: 'stale', sourceId: 'campus:local', fetchedAt: now, coverage: { complete: true }, data: {
    domain: 'exams', origin: 'legacy_import', source: '合成导入资料', termId: 'unspecified',
    records: [{ id: 'exam-1', title: '合成测试考试', startsAt: '2027-01-07T09:00:00+08:00', endsAt: '2027-01-07T11:00:00+08:00', status: 'cancelled' }],
    materialVersions: [{ id: 'exam-1', revision: 4, domain: 'exams', sourceId: 'campus:local' }],
  } }, 'campus.imported_lookup', { domain: 'exams' }, now)!;
  assert.equal(scene.origin, 'legacy_import');
  assert.equal(scene.sourceLabel, '合成导入资料');
  assert.equal(scene.records[0].sourceRevision, 4);
  assert.equal(scene.records[0].cancelled, true);
  assert.equal(scene.term, undefined);
});

test('record selection binds exact conversation, revision and campus source and cannot authorize a write', () => {
  const f = new Fixture();
  try {
    const service = f.store.runtime.scenes;
    const scene = service.campus('scene-session', result(), 'campus.lookup', { domain: 'schedule' }, 'scene-run')!;
    const selection = { kind: 'record' as const, sceneId: scene.id, sceneRevision: scene.revision, recordId: scene.records[0].id };
    const verified = service.selection(f.scope(), 'scene-session', selection, 'scene-run');
    assert.equal(verified.source.version, scene.source.version);
    assert.equal(verified.record?.startsAt, scene.records[0].startsAt);
    assert.match(verified.meaning, /不是.*行动授权/);
    assert.equal(f.store.runtime.actions.list(f.scope()).length, 0);
    assert.throws(() => service.selection(f.scope(), 'other-session', selection, 'scene-run'), /当前对话/);
    assert.throws(() => service.selection(f.scope(), 'scene-session', { ...selection, sceneRevision: 2 }, 'scene-run'), /当前对话/);
    assert.throws(() => service.selection(f.scope(), 'scene-session', { ...selection, recordId: 'forged-record' }, 'scene-run'), /不相符/);
    assert.throws(() => service.selection(f.scope(), 'scene-session', { ...selection, placeId: 'wrong-kind' }, 'scene-run'), /不相符/);
    assert.throws(() => service.selection(f.scope({ sources: ['current'] }), 'scene-session', selection, 'scene-run'), /资料范围/);
    assert.throws(() => service.selection(f.scope({ audience: 'group' }), 'scene-session', selection, 'scene-run'), /资料范围/);
    f.policy.revoke('campus:read');
    assert.throws(() => service.selection(f.scope(), 'scene-session', selection, 'scene-run'), /当前对话/);
  } finally { f.close(); }
});

test('campus tool result becomes a presentable scene through the existing coordinator', async () => {
  const f = new Fixture();
  try {
    f.store.runtime.domains.importSnapshot({ source: '合成测试课表', updatedAt: now,
      schedule: [{ id: 'imported-class', title: '合成测试课程', startsAt: '2026-10-19T06:00:00Z', endsAt: '2026-10-19T07:35:00Z', location: '合成测试教室', status: 'scheduled', source: '合成测试课表' }],
      exams: [], places: [], rules: [] });
    const run = f.store.runtime.begin('看看导入的课表', 'campus-request', 'campus-thread', new AbortController().signal);
    const shown: unknown[] = [];
    const callbacks = { step: () => {}, plan: () => {}, action: () => {}, changed: () => {}, delegate: async () => [], present: (scenes: unknown[]) => { shown.push(...scenes); } };
    const lookup: any = await f.store.runtime.executeTool(run, 'look_up', { source: 'capability', capability: 'campus.imported_lookup', arguments: { domain: 'schedule' } }, callbacks);
    assert.ok(lookup.sceneRef);
    assert.equal(shown.length, 0, 'the main assistant decides whether this result belongs in the current conversation');
    await f.store.runtime.executeTool(run, 'present_view', { sceneRefs: [lookup.sceneRef] }, callbacks);
    assert.equal((shown[0] as any).records[0].id, 'imported-class');
    assert.equal((shown[0] as any).origin, 'legacy_import');
    assert.equal(f.store.runtime.actions.list(f.scope()).length, 0);
  } finally { f.close(); }
});

test('focus composition keeps exact host scene references and facts without widening source or conversation access', async () => {
  const f = new Fixture();
  try {
    f.store.runtime.domains.importSnapshot({ source: '合成焦点布局资料', updatedAt: now,
      schedule: [{ id: 'focus-class', title: '合成课程原值', startsAt: '2026-10-19T06:00:00Z', endsAt: '2026-10-19T07:35:00Z', location: '合成原教室', status: 'scheduled', source: '合成焦点布局资料' }],
      exams: [{ id: 'focus-exam', title: '合成考试原值', startsAt: '2027-01-07T01:00:00Z', endsAt: '2027-01-07T03:00:00Z', status: 'scheduled', source: '合成焦点布局资料' }],
      places: [], rules: [] });
    const runtime = f.store.runtime;
    const run = runtime.begin('把这两份资料放在一起看', 'focus-request', 'focus-thread', new AbortController().signal);
    const shown: { scenes: SceneSnapshot[]; view?: PresentationView }[] = [];
    const callbacks = { step: () => {}, plan: () => {}, action: () => {}, changed: () => {}, delegate: async () => [],
      present: (scenes: SceneSnapshot[], view?: PresentationView) => { shown.push({ scenes, view }); } };
    const first: any = await runtime.executeTool(run, 'look_up', { source: 'capability', capability: 'campus.imported_lookup', arguments: { domain: 'schedule' } }, callbacks);
    const second: any = await runtime.executeTool(run, 'look_up', { source: 'capability', capability: 'campus.imported_lookup', arguments: { domain: 'exams' } }, callbacks);
    const refs = [first.sceneRef, second.sceneRef];
    assert.ok(refs.every(ref => ref?.id && ref.revision));
    const originals = refs.map(ref => runtime.scenes.get(run.ingress.contract.scope, run.sessionId, ref, run.ingress.contract.id));

    const result: any = await runtime.executeTool(run, 'present_view', { sceneRefs: refs, layout: 'focus' }, callbacks);
    // A native campus presentation now acknowledges already-known refs
    // without repeating them to the model. The actual UI keeps both refs.
    assert.equal(result.status, 'presented');
    assert.deepEqual(shown[0].view?.sceneRefs, refs);
    assert.deepEqual(shown[0].scenes, originals, 'layout must not regenerate facts or revise either original scene');
    assert.equal(shown[0].view?.dsl, sceneViewDsl(originals, 'focus'));
    assert.doesNotMatch(shown[0].view!.dsl, /合成课程原值|合成考试原值|合成原教室|2026-10-19/, 'the DSL contains component addresses, not a second fact store');
    assert.equal(runtime.actions.list(f.scope()).length, 0);

    const restricted = runtime.begin('只根据本句继续', 'focus-current-request', 'focus-thread', new AbortController().signal, { sources: ['current'] });
    await assert.rejects(runtime.executeTool(restricted, 'present_view', { sceneRefs: refs, layout: 'focus' }, callbacks), /当前对话与资料范围/);
    const otherConversation = runtime.begin('看看资料', 'focus-other-request', 'other-focus-thread', new AbortController().signal);
    await assert.rejects(runtime.executeTool(otherConversation, 'present_view', { sceneRefs: refs, layout: 'focus' }, callbacks), /当前对话与资料范围/);
    await assert.rejects(runtime.executeTool(run, 'present_view', { sceneRefs: [refs[0], { ...refs[1], revision: refs[1].revision + 1 }], layout: 'focus' }, callbacks), /当前对话与资料范围/);
    assert.equal(shown.length, 1, 'failed composition cannot partially publish the accessible first scene');
    assert.deepEqual(refs.map(ref => runtime.scenes.get(run.ingress.contract.scope, run.sessionId, ref, run.ingress.contract.id)), originals);
    assert.equal(runtime.actions.list(f.scope()).length, 0);
  } finally { f.close(); }
});
