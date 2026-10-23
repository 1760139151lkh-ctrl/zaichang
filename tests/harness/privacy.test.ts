import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Fixture, supported } from './support';
import { Harness } from '../../src/main/harness';
import { DeepSeekClient } from '../../src/main/provider';
import { materialQuoteAddress } from '../../src/shared/materials';

test('native material preview reads the selected original without binding, saving or admitting it to the model', async () => {
  const f = new Fixture();
  try {
    const materials = f.store.runtime.materials;
    const attachment = materials.stageBytes('手边的讲义.md', Buffer.from('原文第一行\n\n' + '甲😀乙'.repeat(6000)));
    const target = { kind: 'pending' as const, reference: attachment.resource! };
    const first = await materials.nativeReadPage({ target });
    assert.equal(first.text, Array.from('原文第一行\n\n' + '甲😀乙'.repeat(6000)).slice(0, 16000).join(''));
    assert.equal(first.nextOffset, 16000);
    const rest = await materials.nativeReadPage({ target, offset: first.nextOffset });
    assert.equal(rest.start, 16000); assert.equal(rest.nextOffset, null);
    assert.equal(materials.nativeList().length, 0);
    assert.equal(fs.existsSync(materials.directory), false);
    assert.equal(f.repo.watermarks().received, 0);
    await assert.rejects(materials.invokeLocal(f.scope(), 'materials.read', { resourceId: attachment.resource!.resourceId }, new AbortController().signal), /尚未发送/);
    await assert.rejects(materials.nativeReadPage({ target: { ...target, reference: { ...target.reference, accessKey: '0'.repeat(64) } } }), /失效/);
    materials.releasePending(attachment.resource);
    await assert.rejects(materials.nativeReadPage({ target }), /失效/);
  } finally { f.close(); }
});

test('saved native material reading follows its original source through restart and forgetting', async () => {
  let f = new Fixture();
  try {
    const attachment = f.store.runtime.materials.stageBytes('原文.txt', Buffer.from('SOURCE_CANARY 原始文字\n保持换行'));
    const run = f.store.runtime.begin('一起看看这份资料', 'reader-message', 'reader-session', new AbortController().signal, { material: attachment.resource });
    f.store.runtime.finish(run);
    const target = { kind: 'saved' as const, resourceId: attachment.resource!.resourceId };
    assert.equal(f.store.runtime.materials.nativeList().length, 1);
    assert.equal((await f.store.runtime.materials.nativeReadPage({ target })).text, 'SOURCE_CANARY 原始文字\n保持换行');
    await assert.rejects(f.store.runtime.materials.nativeReadPage({ target: { kind: 'pending', reference: attachment.resource } }), /失效/);
    f = f.restart();
    assert.equal((await f.store.runtime.materials.nativeReadPage({ target })).text, 'SOURCE_CANARY 原始文字\n保持换行');
    f.memory.forget(['reader-message']);
    assert.equal(f.store.runtime.materials.nativeList().length, 0);
    await assert.rejects(f.store.runtime.materials.nativeReadPage({ target }), /不在这里/);
    assert.throws(() => f.store.runtime.materials.nativeOriginal(target), /不在这里/);
  } finally { f.close(); }
});

test('material quotes re-read exact Unicode ranges and kept notes preserve their address without saving a pending original', async () => {
  let f = new Fixture();
  try {
    const original = '开始😀重复\n甲😀乙\n甲😀乙结束', start = Array.from('开始😀重复\n甲😀乙\n').length;
    const attachment = f.store.runtime.materials.stageBytes('原文摘录.txt', Buffer.from(original));
    const target = { kind: 'pending' as const, reference: attachment.resource! };
    const address = { resourceId: attachment.resource!.resourceId, sha256: attachment.resource!.sha256, start, end: start + 3 };
    const quote = await f.store.runtime.materials.nativeQuote({ target, quote: address });
    assert.equal(quote.text, '甲😀乙');
    assert.deepEqual(materialQuoteAddress(quote), address);
    await assert.rejects(f.store.runtime.materials.nativeQuote({ target, quote: { ...address, sha256: '0'.repeat(64) } }), /不一致/);
    await assert.rejects(f.store.runtime.materials.nativeQuote({ target, quote: { ...address, page: 1 } }), /不一致/);
    await assert.rejects(f.store.runtime.materials.nativeQuote({ target, quote: { ...address, end: 200 } }), /原来的位置/);
    const saved = await f.store.runtime.materials.nativeKeepQuote({ target, quote: address }, f.store.notes);
    assert.equal(saved.status, 'saved'); if (saved.status !== 'saved') return;
    assert.deepEqual(saved.note.source.material, { ...address, name: '原文摘录.txt' });
    assert.equal(saved.note.body, '甲😀乙');
    assert.equal(fs.existsSync(f.store.runtime.materials.directory), false, 'keeping the excerpt does not silently persist its complete pending file');
    f.store.runtime.materials.releasePending(attachment.resource);
    await assert.rejects(f.store.runtime.materials.nativeQuote({ target, quote: address }), /失效/);
    f = f.restart();
    const note = f.store.notes.read({ id: saved.note.id });
    assert.equal(note.body, '甲😀乙', 'the explicitly kept note is an independent user document');
    assert.deepEqual(note.note.source.material, { ...address, name: '原文摘录.txt' });
  } finally { f.close(); }
});

test('typed material focus enters current scoped context without becoming authored text, and expired source does not return', async () => {
  let f = new Fixture();
  try {
    const runtime = f.store.runtime, attachment = runtime.materials.stageBytes('可接着读.txt', Buffer.from('OUTSIDE_CANARY\n选😀段\nTAIL_CANARY'));
    const start = Array.from('OUTSIDE_CANARY\n').length;
    const address = { resourceId: attachment.resource!.resourceId, sha256: attachment.resource!.sha256, start, end: start + 3 };
    const run = runtime.begin('我卡在这里', 'material-focus-origin', 'material-focus-session', new AbortController().signal,
      { material: attachment.resource, materialQuote: address });
    const pack = await runtime.compile(run);
    assert.equal(run.ingress.authoredText, '我卡在这里');
    assert.equal((pack.data.currentMaterial as any)?.text, '选😀段');
    assert.equal(JSON.stringify(pack.data).includes('OUTSIDE_CANARY'), false);
    assert.equal(JSON.stringify(pack.data).includes('TAIL_CANARY'), false);
    assert.equal(pack.receipt.materialReads?.at(-1)?.start, start);
    assert.ok(pack.receipt.providedEvidenceIds.includes('material-focus-origin:file'));
    const saved = await runtime.materials.nativeKeepQuote({ target: { kind: 'saved', resourceId: address.resourceId }, quote: address }, f.store.notes);
    assert.equal(saved.status, 'saved'); if (saved.status !== 'saved') return;
    runtime.finish(run); f = f.restart();
    const source = f.store.notes.read({ id: saved.note.id }).note.source.material!;
    assert.equal((await f.store.runtime.materials.nativeQuote({ target: { kind: 'saved', resourceId: source.resourceId }, quote: materialQuoteAddress(source) })).text, '选😀段');
    const limited = f.store.runtime.begin('只用这次新说的话', 'material-focus-limited', 'other-session', new AbortController().signal,
      { sources: ['current'], materialQuote: address });
    const restricted = await f.store.runtime.compile(limited);
    assert.equal(restricted.data.currentMaterial, undefined);
    assert.ok(restricted.data.currentMaterialUnavailable);
    assert.equal(JSON.stringify(restricted.data).includes('选😀段'), false);
    f.store.runtime.finish(limited);
    f.memory.forget(['material-focus-origin']);
    await assert.rejects(f.store.runtime.materials.nativeQuote({ target: { kind: 'saved', resourceId: address.resourceId }, quote: address }), /不在这里/);
    assert.equal(f.store.notes.read({ id: saved.note.id }).body, '选😀段');
  } finally { f.close(); }
});

test('typed material focus supports a temporary current attachment without persisting original bytes', async () => {
  const f = new Fixture();
  try {
    const attachment = f.store.runtime.materials.stageBytes('临时资料.txt', Buffer.from('前文😀这一段后文'));
    const quote = { resourceId: attachment.resource!.resourceId, sha256: attachment.resource!.sha256, start: 3, end: 6 };
    const run = f.store.runtime.begin('这里怎么理解', 'temporary-material-focus', 'temporary-material-session', new AbortController().signal,
      { material: attachment.resource, materialQuote: quote, retention: 'session_only' });
    const pack = await f.store.runtime.compile(run);
    assert.equal((pack.data.currentMaterial as any)?.text, '这一段');
    assert.equal(f.repo.watermarks().received, 0);
    assert.equal(fs.existsSync(f.store.runtime.materials.directory), false);
    f.store.runtime.finish(run);
  } finally { f.close(); }
});

function clientRecorder(requests: any[], controls: Record<string, unknown> = {}) {
  const { sources, ...wireControls } = controls;
  let projected = false;
  return {
    complete: async (messages: any[], tools: any[] = [], _signal?: AbortSignal, _onText?: unknown, options?: { phase?: string }) => {
      const control = tools.some(t => t.function.name === 'propose_turn_controls');
      requests.push({ phase: options?.phase || (control ? 'control' : 'generation_or_review'), messages: structuredClone(messages) });
      if (control) return { content: '', tool_calls: [{ id: 'control', type: 'function', function: { name: 'propose_turn_controls', arguments: JSON.stringify({
        retention: 'unchanged', sourceAllowlist: sources === 'current_only' ? ['current'] : null, sourceExclusions: [], sourceBasis: null, subject: 'self', world: 'real', audience: 'self', actions: 'unchanged', actionsApplyToWholeTurn: false, specificActionLimits: [], release: null, basis: [], uncertain: false, uncertainControls: [], ...wireControls,
      }) } }] };
      if (tools.some(t => t.function.name === 'report_completion_gaps')) return { content: '', tool_calls: [{ id: 'review', type: 'function', function: { name: 'report_completion_gaps', arguments: '{"missing":[],"contradictions":[],"requests":[]}' } }] };
      if (tools.some(t => t.function.name === 'project_release_brief')) return { content: '', tool_calls: [{ id: 'brief', type: 'function', function: { name: 'project_release_brief', arguments: JSON.stringify({ ...controls.release as object, requestedOperation: 'draft', reusePriorDraft: false, referencePrevious: false }) } }] };
      if (tools.some(t => t.function.name === 'verify_read_purpose')) return { content: '', tool_calls: [{ id: 'purpose', type: 'function', function: { name: 'verify_read_purpose', arguments: JSON.stringify({ neededForCurrentRequest: true, allowed: true, sourceQuote: JSON.parse(String(messages.find(message => message.role === 'user')!.content)).original, reason: 'Synthetic explicit availability sharing.' }) } }] };
      if ((controls.release as any)?.useAvailability && !projected && tools.some(t => t.function.name === 'prepare_release')) {
        projected = true;
        return { content: '', tool_calls: [{ id: 'projection', type: 'function', function: { name: 'prepare_release', arguments: '{"sourceQuote":"给小组写一段可约时间","task":"给小组起草可约时段。","from":"2026-09-15T00:00:00Z","to":"2026-09-15T12:00:00Z"}' } }] };
      }
      return {
        content: messages[0].content.includes('[harness:extract')
          ? JSON.stringify({ status: 'no_personal_fact', changes: [] })
          : '受控回复；没有执行外部操作。',
        tool_calls: [],
      };
    },
  } as unknown as DeepSeekClient;
}
test('INV-02 original Harness only-attachment contract has zero history/profile reads and no private canary in model payload', async () => {
  const f = new Fixture();
  try {
    await f.remember('我喜欢CANARY_PROFILE_937。');
    f.store.saveSettings({ mode: 'deepseek' });
    f.repo.access.length = 0;
    const requests: any[] = [];
    const harness = new Harness(
      f.store,
      () => 'synthetic',
      () => {},
      () => clientRecorder(requests, { sources: 'current_only', sourceBasis: '只根据这份附件总结，不使用以前对我的了解。' }),
    );
    harness.start(
      undefined,
      '只根据这份附件总结，不使用以前对我的了解。\n\n[用户附上的文字资料：参考.md]\n打印服务开放时间。',
    );
    await harness.idle();
    assert.ok(!JSON.stringify(requests).includes('CANARY_PROFILE_937'));
    assert.equal(f.repo.access.filter((a) => a.source === 'profile:self').length, 0);
    assert.equal(f.repo.access.filter((a) => a.kind === 'original_search').length, 0);
    assert.equal(f.store.runtime.lastSession?.pack?.contract.memoryMode, 'current_sources_only');
  } finally {
    f.close();
  }
});
test('INV-19 ephemeral message and generated output do not persist in SQLite/WAL/queues/files even after restart', async () => {
  let f = new Fixture();
  try {
    f.store.saveSettings({ mode: 'deepseek' });
    const requests: any[] = [];
    const harness = new Harness(
      f.store,
      () => 'synthetic',
      () => {},
      () => clientRecorder(requests, { retention: 'session_only' }),
    );
    harness.start(undefined, '这句话只用于本轮，不保存：CANARY_EPHEMERAL_482。');
    await harness.idle();
    assert.equal(f.repo.watermarks().received, 0);
    assert.equal(f.store.conversations().length, 0);
    f = f.restart();
    const walk = (dir: string): string[] =>
      fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    for (const file of walk(f.dir))
      assert.equal(fs.readFileSync(file).includes(Buffer.from('CANARY_EPHEMERAL_482')), false, file);
    assert.ok(!JSON.stringify(f.store.export()).includes('CANARY_EPHEMERAL_482'));
  } finally {
    f.close();
  }
});
test('INV-14 group draft receives actual busy projection but neither private calendar title nor private current reason', async () => {
  const f = new Fixture();
  try {
    f.store.runtime.domains.importSnapshot({
      source: 'synthetic calendar',
      updatedAt: f.clock.now(),
      schedule: [
        {
          id: 'private-slot',
          title: 'CANARY_PRIVATE_REASON',
          startsAt: '2026-09-15T01:00:00Z',
          endsAt: '2026-09-15T02:00:00Z',
          location: '私人地点',
          status: 'scheduled',
          source: '合成',
        },
      ],
      exams: [],
      places: [],
      rules: [],
    });
    const requests: any[] = [];
    f.store.saveSettings({ mode: 'deepseek' });
    const harness = new Harness(
      f.store,
      () => 'synthetic',
      () => {},
      () => clientRecorder(requests, { audience: 'group', release: { purpose: '协调可约时间', allowedFacts: [], tone: '自然', recipient: '小组', useAvailability: true } }),
    );
    harness.start(
      undefined,
      '我有CANARY_CURRENT_REASON。给小组写一段可约时间，别解释我没空的原因，先别发送。',
    );
    await harness.idle();
    // The private owner and private projection see the current authored text.
    // The actual outward writer and its same-scope reviewer must not see it.
    const outward = requests.filter(request => ['release_write', 'release_review'].includes(request.phase));
    assert.ok(outward.some(request => request.phase === 'release_write'));
    assert.ok(outward.some(request => request.phase === 'release_review'));
    const payload = JSON.stringify(outward);
    assert.ok(payload.includes('2026-09-15T01:00:00Z'));
    assert.ok(!payload.includes('CANARY_PRIVATE_REASON'));
    assert.ok(!payload.includes('CANARY_CURRENT_REASON'));
    assert.equal(f.store.runtime.actions.list(f.scope()).length, 0);
  } finally {
    f.close();
  }
});
test('INV-09 correction prevents old raw evidence from re-entering current context, while historical provenance remains readable', async () => {
  const f = new Fixture();
  try {
    const a = await f.remember('我现在住旧住处。', {
        kind: 'explicit_fact',
        predicate: 'residence.current',
        value: { type: 'entity', value: 'old-home' },
      }),
      e = f.ingest('刚才说错了，我现在住新住处。');
    await f.memory.propose(
      f.scope(),
      f.change(e, {
        operation: 'CORRECT',
        targetId: a.id,
        expectedRevision: 1,
        kind: 'explicit_fact',
        predicate: 'residence.current',
        value: { type: 'entity', value: 'new-home' },
      }),
      undefined,
      { review: supported },
    );
    const run = f.store.runtime.begin('现在回住处怎么走？', 'now', 'test', new AbortController().signal);
    const pack = await f.store.runtime.compile(run);
    assert.ok(!JSON.stringify(pack.data).includes('old-home'));
    assert.ok(!JSON.stringify(pack.data).includes('我现在住旧住处'));
    assert.equal(f.repo.evidence(f.scope(), a.evidenceIds[0])?.text, '我现在住旧住处。');
  } finally {
    f.close();
  }
});
test('INV-09 old SQLite backup restores only after latest deletion barrier and independent source survives', async () => {
  let f = new Fixture();
  try {
    const a = await f.remember('我喜欢CANARY_BACKUP_724。');
    f.ingest('独立来源仍然保留。', 'keep');
    const backup = path.join(f.dir, 'manual-backup.sqlite');
    f.repo.db.prepare('VACUUM INTO ?').run(backup);
    f.memory.forget([a.id]);
    f.close();
    fs.copyFileSync(backup, f.file);
    f = new Fixture(f.dir, f.clock);
    assert.equal(f.repo.searchEvidence(f.scope(), 'CANARY_BACKUP_724').length, 0);
    assert.equal(f.repo.evidence(f.scope(), 'keep')?.text, '独立来源仍然保留。');
    assert.equal(f.repo.getMeta('restoration_fence_applied'), true);
  } finally {
    f.close();
  }
});
test('INV-09 forgetting traverses derived plan, accepted local action, reminder and restatement payloads', async () => {
  const f = new Fixture();
  try {
    const a = await f.remember('我喜欢CANARY_DERIVED_452。'),
      s = f.scope(),
      r = f.store.runtime;
    f.ingest('摘要提到了CANARY_DERIVED_452。', 'restated', {
      speaker: 'assistant',
      authority: 'model_derivative',
      roots: [a.evidenceIds[0]],
    });
    const plan = r.work.create(
      s,
      'plan',
      'CANARY_DERIVED_452 方案',
      { reason: 'CANARY_DERIVED_452' },
      { status: 'proposed', evidenceIds: a.evidenceIds },
    );
    f.repo.addDependency(s, {
      consumerId: plan.id,
      producerId: a.id,
      producerRevision: 1,
      sensitivity: 'privacy',
      invalidation: 'recompute',
    });
    const action = r.actions.prepare(s, {
      capability: 'local.agenda.save',
      arguments: { title: 'CANARY_DERIVED_452 安排', detail: '据此安排', startsAt: '2026-09-15T06:00:00Z' },
      dependencies: [
        {
          consumerId: 'pending',
          producerId: a.id,
          producerRevision: 1,
          sensitivity: 'privacy',
          invalidation: 'block',
        },
      ],
    });
    const approval = r.actions.approve(s, action.id, action.digest, 1);
    await r.actions.execute(s, action.id, approval.id);
    f.memory.forget([a.id]);
    assert.ok(!JSON.stringify(f.store.export()).includes('CANARY_DERIVED_452'));
    assert.ok(
      !JSON.stringify(
        f.repo.db
          .prepare(
            'SELECT payload FROM h_actions UNION ALL SELECT payload FROM h_jobs UNION ALL SELECT payload FROM h_work',
          )
          .all(),
      ).includes('CANARY_DERIVED_452'),
    );
    assert.equal(f.repo.evidence(f.scope(), 'restated'), undefined);
  } finally {
    f.close();
  }
});
test('INV-02 lexical retrieval can find an older Chinese two-word source beyond recent row windows', async () => {
  const f = new Fixture();
  try {
    f.ingest('主图旁的橙色小桥是那个未完成方案。', 'old-bridge');
    f.repo.indexEvidence(f.scope(), 'old-bridge');
    for (let i = 0; i < 240; i++) {
      const e = f.ingest('无关合成背景 ' + i);
      f.repo.indexEvidence(f.scope(), e.id);
    }
    const run = f.store.runtime.begin(
      '橙色小桥那件事原话是什么？',
      'new-query',
      'query-thread',
      new AbortController().signal,
    );
    const pack = await f.store.runtime.compile(run);
    assert.ok(!pack.receipt.providedEvidenceIds.includes('old-bridge'), 'minimal context does not automatically scan all history');
    f.store.runtime.context.prefetch(pack, '橙色小桥');
    assert.ok(pack.receipt.providedEvidenceIds.includes('old-bridge'), 'explicit retrieval reaches older original evidence');
    const restricted = f.policy.hostScope({ sources: ['current'], currentEventIds: [] });
    assert.equal(f.repo.lexicalEvidence(restricted, '主图').length, 0);
  } finally {
    f.close();
  }
});
test('INV-02 current source handles cannot be used as a wildcard for an earlier native memory control', async () => {
  const f = new Fixture();
  try {
    const memory = f.store.saveMemory('我喜欢CANARY_NATIVE_MEMORY。');
    const evidenceId = f.repo.assertion(f.scope(), memory.id)!.evidenceIds[0];
    const run = f.store.runtime.begin(
      '只看当前给出的内容',
      'scope-only',
      'scope-thread',
      new AbortController().signal,
      { memoryMode: 'current_sources_only' },
    );
    assert.equal(f.repo.evidence(run.ingress.contract.scope, evidenceId), undefined);
    await assert.rejects(
      () =>
        f.store.runtime.executeTool(
          run,
          'read_evidence',
          { id: evidenceId },
          { step: () => {}, plan: () => {}, action: () => {}, changed: () => {}, delegate: async () => [] },
        ),
      /不在本轮允许范围/,
    );
  } finally {
    f.close();
  }
});
test('INV-08 explicit permission regrant survives restart without lowering the privacy epoch', () => {
  let f = new Fixture();
  try {
    f.policy.grant('weather:read');
    f.policy.revoke('weather:read');
    const epoch = f.repo.epoch;
    f.policy.grant('weather:read');
    f = f.restart();
    assert.equal(f.repo.epoch, epoch);
    assert.equal(f.policy.can(f.scope(), 'weather:read'), true);
  } finally {
    f.close();
  }
});
test('INV-09 clear removes new storage families while keeping the irreversible deletion barrier', async () => {
  let f = new Fixture();
  try {
    await f.remember('我喜欢CANARY_CLEAR。');
    const before = f.repo.epoch;
    f.store.clear();
    assert.ok(f.repo.epoch > before);
    assert.equal(f.store.memories().length, 0);
    assert.equal(f.store.conversations().length, 0);
    f = f.restart();
    assert.ok(!JSON.stringify(f.store.export()).includes('CANARY_CLEAR'));
  } finally {
    f.close();
  }
});
