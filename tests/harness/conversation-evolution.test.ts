import test from 'node:test';
import assert from 'node:assert/strict';
import { environmentSnapshot, planningSnapshot } from '../../src/main/runtime/scene-projections';
import { draftCalendarPlan, previewCalendarPlan } from '../../src/main/actions/planning';
import { sceneViewDsl } from '../../src/shared/scenes';
import { Fixture } from './support';

const now = '2026-09-14T06:00:00.000Z';
const input = { from: now, to: '2026-09-14T12:00:00Z', timeZone: 'Asia/Shanghai',
  tasks: [{ id: 'synthetic-reading', title: '合成阅读任务', durationMinutes: { min: 60, max: 60 }, setupMinutes: 10, cleanupMinutes: 5 }],
  protectedWindows: [{ start: '2026-09-14T10:00:00Z', end: '2026-09-14T11:00:00Z', reason: '这段就留着' }],
  sourceCoverage: [{ sourceId: 'user-declared', status: 'complete' }], restMinutes: 10, reserveMinutes: 30 };
const weather = { location: '合成公共参考点', timeZone: 'Asia/Shanghai',
  reference: { latitude: 30, longitude: 120, basis: 'explicit_public_reference', userLocation: false },
  forecast: { time: ['2026-09-14'], weather_code: [3], temperature_2m_max: [25], temperature_2m_min: [18], precipitation_probability_max: [40] },
  hourly: { time: [now], precipitationIntervalStart: ['2026-09-14T05:00:00Z'], temperature_2m: [22], precipitation_probability: [null], precipitation: [0.1], weather_code: [3] },
  window: { from: now, to: '2026-09-14T07:00:00Z', granularity: 'hourly', complete: false },
  observedAt: now, forecastIssuedAt: null, modelVersion: 'not_reported', limitations: ['降水对应前一小时，不代表现场。'] };

test('planning snapshot preserves preparation, work, cleanup and protected empty time without saving', () => {
  const data = draftCalendarPlan([], input);
  const scene = planningSnapshot({ status: 'fresh', sourceId: 'local-agenda', fetchedAt: now, data }, 'planning.draft', input, now)!;
  assert.deepEqual(scene.blocks.filter(block => ['setup', 'work', 'cleanup'].includes(block.kind)).map(block => block.kind), ['setup', 'work', 'cleanup']);
  assert.equal(scene.blocks.find(block => block.kind === 'protected')?.reason, '这段就留着');
  assert.equal(scene.blocks.find(block => block.kind === 'work')?.start, data.blocks[0].start);
  assert.equal(scene.applied, false);
  assert.match(sceneViewDsl([scene], 'stack'), /PlanningScene\(/);
  assert.equal(planningSnapshot({ status: 'forbidden', sourceId: 'local-agenda', data }, 'planning.draft', input, now), undefined);
  assert.equal(planningSnapshot({ status: 'fresh', sourceId: 'history:self', data }, 'planning.draft', input, now), undefined);
});

test('preview carries unknown ends, usable duration and external source dependencies', () => {
  const args = { from: now, to: '2026-09-14T12:00:00Z', busy: [{ start: '2026-09-14T09:00:00Z', end: null, sourceId: 'campus:zju-account' }], transitionMinutes: { min: 5, max: 10 } };
  const scene = planningSnapshot({ status: 'fresh', sourceId: 'local-agenda', data: previewCalendarPlan([], args) }, 'planning.preview', args, now)!;
  assert.equal(scene.blocks.find(block => block.kind === 'busy')?.end, null);
  assert.deepEqual(scene.blocks.find(block => block.kind === 'free')?.usableMinutes, { min: 160, max: 170 });
  assert.deepEqual(scene.requiredSourceIds, ['campus:zju-account']);
  assert.equal(scene.source.fetchedAt, '', 'missing retrieval time is never manufactured');
});

test('environment snapshot keeps nulls, exact instants, previous-hour precipitation and source kind', () => {
  const result = { status: 'partial', sourceId: 'weather:open-meteo', fetchedAt: now, data: weather };
  const scene = environmentSnapshot(result, 'weather.lookup', now)!;
  assert.equal(scene.samples[0].precipitationProbability, null);
  assert.equal(scene.samples[0].precipitationIntervalStart, '2026-09-14T05:00:00Z');
  assert.equal(scene.samples[0].temperatureC, 22);
  assert.equal(scene.window.complete, false);
  assert.equal(scene.forecastIssuedAt, null);
  assert.equal(scene.userLocation, false);
  assert.match(sceneViewDsl([scene], 'stack'), /EnvironmentScene\(/);
  assert.equal(environmentSnapshot(result, 'air_quality.lookup', now), undefined);
  assert.equal(environmentSnapshot({ ...result, status: 'failed' }, 'weather.lookup', now), undefined);
  assert.equal(environmentSnapshot({ ...result, data: { ...weather, hourly: undefined } }, 'weather.lookup', now), undefined);
});

test('air sample units remain different measures and are not a health assessment', () => {
  const scene = environmentSnapshot({ status: 'partial', sourceId: 'weather:open-meteo', fetchedAt: now, data: {
    location: weather.location, timeZone: weather.timeZone, reference: weather.reference,
    window: { from: now, to: '2026-09-14T07:00:00Z', complete: false },
    samples: [{ at: now, localTime: '2026-09-14 14:00', pm2_5: 12, pm10: null, us_aqi: 40, european_aqi: 20 }],
    units: { pm2_5: 'μg/m³', pm10: 'μg/m³', us_aqi: 'US AQI', european_aqi: 'European AQI' },
    kind: 'model_forecast', retrievedAt: now, issuedAt: null, source: 'Open-Meteo / CAMS', sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api', limitations: ['不能保证适宜运动。'],
  } }, 'air_quality.lookup', now)!;
  assert.equal(scene.domain, 'air_quality');
  assert.equal(scene.samples[0].usAqi, 40);
  assert.equal(scene.samples[0].europeanAqi, 20);
  assert.equal(scene.samples[0].pm10, null);
  assert.equal('healthAssessment' in scene, false);
});

test('new semantic selections bind exact snapshot and source scopes, never granting writes', () => {
  const f = new Fixture();
  try {
    const previewInput = { from: input.from, to: input.to, sourceCoverage: input.sourceCoverage };
    const data = previewCalendarPlan([], previewInput);
    const scene = f.store.runtime.scenes.planning('synthetic-scene-session', { status: 'fresh', sourceId: 'local-agenda', data }, 'planning.preview', previewInput, 'synthetic-run')!;
    const selection = { sceneId: scene.id, sceneRevision: scene.revision, kind: 'time_block' as const, blockId: scene.blocks[0].id };
    const verified = f.store.runtime.scenes.selection(f.scope(), 'synthetic-scene-session', selection);
    assert.equal(verified.timeBlock?.start, scene.blocks[0].start);
    assert.match(verified.meaning, /不是.*行动授权/);
    assert.equal(f.store.runtime.actions.list(f.scope()).length, 0);
    assert.throws(() => f.store.runtime.scenes.selection(f.scope(), 'other', selection), /当前对话/);
    assert.throws(() => f.store.runtime.scenes.selection(f.scope(), 'synthetic-scene-session', { ...selection, blockId: 'fake' }), /不相符/);
    assert.throws(() => f.store.runtime.scenes.selection(f.scope(), 'synthetic-scene-session', { ...selection, sampleId: now }), /不相符/);
    assert.throws(() => f.store.runtime.scenes.selection(f.scope({ sources: ['current'] }), 'synthetic-scene-session', selection), /资料范围/);
    const externalInput = { from: input.from, to: input.to, busy: [{ start: '2026-09-14T09:00:00Z', end: null, sourceId: 'campus:zju-account' }] };
    const external = f.store.runtime.scenes.planning('synthetic-scene-session', { status: 'fresh', sourceId: 'local-agenda', data: previewCalendarPlan([], externalInput) }, 'planning.preview', externalInput, 'synthetic-run')!;
    assert.throws(() => f.store.runtime.scenes.selection(f.scope({ sources: ['current', 'local-agenda', 'history:self'] }), 'synthetic-scene-session',
      { sceneId: external.id, sceneRevision: 1, kind: 'time_block', blockId: external.blocks[0].id }), /资料范围/, 'local-agenda cannot launder an excluded campus source');
    f.policy.grant('weather:read');
    const env = f.store.runtime.scenes.environment('synthetic-scene-session', { status: 'partial', sourceId: 'weather:open-meteo', data: weather }, 'weather.lookup', 'synthetic-run')!;
    const envSelection = { sceneId: env.id, sceneRevision: env.revision, kind: 'environment_sample' as const, sampleId: now };
    assert.equal(f.store.runtime.scenes.selection(f.scope(), 'synthetic-scene-session', envSelection).environmentSample?.temperatureC, 22);
    f.policy.revoke('weather:read');
    assert.throws(() => f.store.runtime.scenes.selection(f.scope(), 'synthetic-scene-session', envSelection), /当前对话/);
  } finally { f.close(); }
});

test('planning tool flows through coordinator to scene and preserves host plan references', async () => {
  const f = new Fixture();
  try {
    const run = f.store.runtime.begin('一起看看这段时间怎么安排，暂时不保存', 'synthetic-plan-request', 'synthetic-plan-thread', new AbortController().signal);
    const shown: any[] = [];
    const callbacks = { step: () => {}, plan: () => {}, action: () => {}, changed: () => {}, delegate: async () => [], present: (scenes: unknown[]) => { shown.push(...scenes); } };
    const result: any = await f.store.runtime.executeTool(run, 'look_up', { source: 'capability', capability: 'planning.draft', arguments: input }, callbacks);
    assert.ok(result.sceneRef);
    assert.equal(shown.length, 0);
    await f.store.runtime.executeTool(run, 'present_view', { sceneRefs: [result.sceneRef] }, callbacks);
    assert.equal(shown[0].kind, 'planning');
    assert.equal(shown[0].blocks.find((block: any) => block.kind === 'work').planRefs[0].planId, result.data.planId);
    assert.equal(f.store.runtime.actions.list(f.scope()).length, 0);
  } finally { f.close(); }
});

test('context receipts retain derived scene sources and a selected scene outside recent summaries', async () => {
  const f = new Fixture();
  try {
    const sessionId = 'synthetic-receipt-thread';
    const args = { from: input.from, to: input.to, busy: [{ start: '2026-09-14T09:00:00Z', end: null, sourceId: 'campus:zju-account' }] };
    const selected = f.store.runtime.scenes.planning(sessionId, { status: 'fresh', sourceId: 'local-agenda', data: previewCalendarPlan([], args) }, 'planning.preview', args, 'synthetic-origin-run')!;
    const run = f.store.runtime.begin('继续看看刚才的时间', 'synthetic-receipt-one', sessionId, new AbortController().signal);
    const first = await f.store.runtime.compile(run);
    assert.ok(first.receipt.providedSourceIds?.includes('campus:zju-account'));
    const plain = { from: input.from, to: input.to };
    for (let index = 0; index < 7; index++) f.store.runtime.scenes.planning(sessionId,
      { status: 'fresh', sourceId: 'local-agenda', data: previewCalendarPlan([], plain) }, 'planning.preview', plain, `synthetic-later-${index}`);
    const next = f.store.runtime.begin('就是我选的这段', 'synthetic-receipt-two', sessionId, new AbortController().signal,
      { selection: { sceneId: selected.id, sceneRevision: 1, kind: 'time_block', blockId: selected.blocks[0].id } });
    const pack = await f.store.runtime.compile(next);
    assert.ok(!(pack.data.availableScenes as {id: string}[]).some(scene => scene.id === selected.id), 'the selected scene really falls outside the six recent summaries');
    assert.ok(pack.receipt.providedSourceIds?.includes('campus:zju-account'));
    assert.ok(pack.receipt.sceneReferences?.some(ref => ref.id === selected.id));
    assert.ok((pack.data.currentSelection as any)?.timeBlock);
  } finally { f.close(); }
});

test('notebook question correction keeps one study owner, exact Unicode sources and earlier help boundaries', async () => {
  const f = new Fixture();
  try {
    const runtime = f.store.runtime, study = runtime.studyCompanion, sessionId = 'synthetic-note-study';
    const initial = f.ingest('我写到 E(X)=np。请把笔记里的题目和这一步放在一起。', 'synthetic-study-request', { sessionId });
    const citation = (event: typeof initial) => ({ eventId: event.id, contentVersion: event.contentVersion,
      start: 0, end: Array.from(event.text).length, quote: event.text });
    const source = citation(initial), handle = f.scope({ currentEventIds: [initial.id] });
    const frame = runtime.collaboration.update(handle, sessionId, { operation: 'frame', source,
      title: '合成二项分布学习', frame: { question: '继续原笔记中的题目', confirmedFacts: [], decisions: [],
        tentativeUnderstanding: [], participation: [], rejectedOptions: [], nextStep: null } });
    const matter = { ...frame, revision: frame.revision + 1, sourceBinding: f.repo.resolveWorkSourceBinding(handle,
      [{ eventId: source.eventId, contentVersion: source.contentVersion, start: source.start, end: source.end }]) };
    f.repo.saveSourcedWork(handle, matter, frame.revision);
    const created = f.store.notes.create({ title: '合成概率笔记', body: '😀前记\n证明二项分布的方差；我不明白交叉项为什么消失。\n后记' });
    assert.equal(created.status, 'saved');
    if (created.status !== 'saved') throw new Error('fixture note missing');
    const start = 4, end = Array.from(created.note.body).length - 3;
    const page = f.store.notes.read({ id: created.note.id, offset: start, limit: end - start }, handle);
    const proof = { id: page.note.id, revision: page.note.revision, sha256: page.note.sha256, start, end };
    const problem = { kind: 'note' as const, id: proof.id, revision: proof.revision, start, end };
    const open = { operation: 'open' as const, matterId: matter.id, expectedMatterRevision: matter.revision, source,
      title: '合成学习纸', problem, mode: 'small_hint' as const, focus: '交叉项', nextStart: '只向前一步' };
    await assert.rejects(study.execute(handle, open, { sessionId }), /先沿manage_note/);
    await assert.rejects(study.execute(handle, { ...open, problem: { ...problem, end: end + 1 } },
      { sessionId, noteSources: [proof] }), /先沿manage_note/, 'an unread character must not be borrowed from the stored note');
    const attemptText = '我写到 E(X)=np。', helpingText = '先把不同指标的交叉项单独写出来。';
    // Reproduce the real old paper: the requested activity was mistakenly
    // stored as its question. Repair must retain this owner and the real work.
    const before = await study.execute(handle, { ...open, problem: { kind: 'evidence', source },
      attempt: { ...source, end: Array.from(attemptText).length, quote: attemptText },
      packet: { kind: 'hint', text: helpingText, nextMove: '先看一个交叉项。' } }, { sessionId });
    const original = before.items[0], correction = f.ingest('左栏改成笔记里的原题，保留我的尝试。', 'synthetic-study-correction', { sessionId });
    const originalRead = await study.get(handle, original.id);
    assert.ok(originalRead);
    const originalSnapshot = study.sourceVersionSnapshot(handle, originalRead.record);
    assert.ok(originalSnapshot);
    const correcting = f.scope({ currentEventIds: [correction.id] });
    const after = await study.execute(correcting, { operation: 'respond', id: original.id, expectedRevision: original.revision,
      source: citation(correction), problem }, { sessionId, noteSources: [proof] });
    const fixed = after.items[0];
    assert.equal(fixed.id, original.id);
    assert.equal(fixed.revision, original.revision + 1);
    assert.equal(fixed.problem.display, page.body);
    assert.deepEqual(fixed.problem.origin.note, proof);
    assert.equal(fixed.attempts[0].id, original.attempts[0].id);
    assert.equal(fixed.currentStep?.id, original.currentStep?.id);
    assert.equal(f.store.notes.read({ id: proof.id }).note.revision, 1, 'selecting/correcting a study source never edits the notebook');
    assert.deepEqual(f.repo.workNoteSources(correcting, after.records), [proof]);
    const fixedRead = await study.get(correcting, fixed.id);
    assert.ok(fixedRead);
    const fixedSnapshot = study.sourceVersionSnapshot(correcting, fixedRead.record);
    assert.ok(fixedSnapshot);
    assert.equal(study.verifyFrozenSources(correcting, { id: original.id, ...originalSnapshot }), true,
      'correcting the current question does not replace an earlier frozen source');
    assert.deepEqual(fixedSnapshot.noteSources, [proof]);
    assert.equal(study.verifyFrozenSources(correcting, { id: fixed.id, ...fixedSnapshot }), true);
    assert.equal(study.verifyFrozenSources(correcting, { id: fixed.id, ...fixedSnapshot, noteSources: [] }), false,
      'a notebook question cannot lose its exact source proof in the historical version');
    const blocked = f.scope({ sources: f.repo.scope(correcting).sources.filter(value => value !== 'notes:self') });
    assert.equal(await study.get(blocked, fixed.id), undefined);
    assert.equal(study.index(blocked).items.length, 0);
    const updated = f.store.notes.update({ id: proof.id, expectedRevision: 1, title: '合成概率笔记', body: '这是更新后的笔记。' });
    assert.equal(updated.status, 'saved');
    assert.equal((await study.get(correcting, fixed.id))?.projection.problem.display, page.body,
      'a normal edit preserves the exact historical notebook revision already used by this paper');
    const next = f.store.notes.create({ title: '更正后的合成题目', body: '只研究两个独立的伯努利变量。' });
    assert.equal(next.status, 'saved');
    if (next.status !== 'saved') throw new Error('fixture correction note missing');
    const nextProof = { id: next.note.id, revision: 1, sha256: next.note.sha256, start: 0, end: Array.from(next.note.body).length };
    const correctedAgain = await study.execute(correcting, { operation: 'respond', id: fixed.id, expectedRevision: fixed.revision,
      source: citation(correction), problem: { kind: 'note', id: nextProof.id, revision: 1, start: 0, end: nextProof.end } },
    { sessionId, noteSources: [nextProof] });
    const current = correctedAgain.items[0], noteSources = f.repo.workNoteSources(correcting, correctedAgain.records);
    assert.deepEqual(new Set(noteSources.map(value => value.id)), new Set([proof.id, nextProof.id]));
    const help = await runtime.personalMethods.workHelpOwner!.prepare(correcting, { owner: 'study_companion', id: current.id,
      revision: current.revision, matterId: matter.id, stepId: current.currentStep!.id, start: 0,
      end: Array.from(helpingText).length, quote: helpingText }, {});
    assert.equal(runtime.personalMethods.workHelpOwner!.verify(correcting, help.proof), true);
    f.store.notes.changeState({ id: proof.id, expectedRevision: 2, state: 'deleted' });
    assert.equal(await study.get(correcting, current.id), undefined,
      'changing the visible question must not launder the notebook used by earlier teaching');
    assert.equal(runtime.personalMethods.workHelpOwner!.verify(correcting, help.proof), false);
    assert.equal(study.verifyFrozenSources(correcting, { id: fixed.id, ...fixedSnapshot }), false);
    assert.equal(f.repo.planningMessageReadable(correcting, { contextReceipt: { noteSources } }), false);
    assert.equal(f.store.notes.read({ id: nextProof.id }).body, next.note.body, 'an independent new notebook is preserved');
  } finally { f.close(); }
});
