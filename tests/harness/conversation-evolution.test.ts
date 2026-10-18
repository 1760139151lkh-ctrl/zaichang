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
