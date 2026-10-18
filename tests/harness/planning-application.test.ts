import test from 'node:test';
import assert from 'node:assert/strict';
import { Fixture } from './support';
import type { Action } from '../../src/shared/types';
import type { ScopeHandle } from '../../src/shared/harness';
import type { RuntimeCallbacks } from '../../src/main/runtime/coordinator';
import { PlanningApplicationService } from '../../src/main/actions/planning-application';

const at = (time: string) => `2026-09-15T${time}:00+08:00`;
const task = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, durationMinutes: { min: 30, max: 30 }, ...extra });
const input = (extra: Record<string, unknown> = {}) => ({ from: at('09:00'), to: at('12:00'), tasks: [task('a'), task('b', { dependsOn: ['a'] })],
  sourceCoverage: [{ sourceId: 'user-declared', status: 'complete' }], reserveMinutes: 0, restMinutes: 0, ...extra });
const callbacks: RuntimeCallbacks = { step() {}, plan() {}, action() {}, changed() {}, delegate: async () => [],
  verifyReadPurpose: async () => ({ allowed: true, reason: 'Explicit synthetic current calendar planning request.' }) };
type Draft = ReturnType<PlanningApplicationService['prepare']>;
type Proposal = Draft['acceptanceProposals'][number];
const items = (f: Fixture): Action[] => f.repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload)));
const scopeData = (f: Fixture, handle = f.scope()) => f.policy.validate(handle);
const save = (f: Fixture, proposal: Proposal, id: string, scope: ScopeHandle = f.scope(), args = proposal.arguments) =>
  f.store.runtime.actions.directLocal(scope, { id, capability: 'local.agenda.save', arguments: args, authorized: true });
const busy = (id: string, start = '11:00'): Action => ({ id, title: id, detail: '', kind: 'event', startsAt: at(start), durationMinutes: 30, saved: true, done: false });
async function draft(f: Fixture, raw = input()): Promise<Draft> {
  const run = f.store.runtime.begin('请根据当前日历安排这两项任务，先给出完整方案。', `planning-request-${f.repo.db.prepare('SELECT count(*) AS n FROM h_evidence').get()!.n}`, 'planning-test', new AbortController().signal);
  const result = await f.store.runtime.executeTool(run, 'look_up', { source: 'capability', capability: 'planning.draft', arguments: raw }, callbacks) as { status: string; data: Draft };
  assert.equal(result.status, 'fresh');
  assert.ok(result.data.planId);
  return result.data;
}

test('real planning tool stays read-only and exact ordered saves preserve work, setup, rest and protection', async () => {
  const f = new Fixture();
  try {
    const plan = await draft(f, input({ tasks: [task('a', { setupMinutes: 5, cleanupMinutes: 5 }), task('b', { dependsOn: ['a'] })], restMinutes: 10,
      protectedWindows: [{ start: at('11:00'), end: at('11:30'), reason: '已要求保留的空白' }] }));
    assert.equal(plan.adoption.status, 'ready_for_authorized_steps');
    assert.equal(plan.adoption.atomic, false);
    assert.equal(items(f).length, 0);
    assert.equal(f.store.runtime.actions.list(f.scope()).length, 0);
    assert.deepEqual(plan.acceptanceProposals.map(value => value.kind), ['work', 'transition', 'work', 'protected']);
    assert.deepEqual(plan.acceptanceProposals.map(value => value.arguments.durationMinutes), [40, 10, 30, 30]);
    for (const [index, proposal] of plan.acceptanceProposals.entries()) {
      const before = f.store.runtime.planning.validateSave(scopeData(f), proposal.arguments.planRef, proposal.arguments, items(f));
      assert.equal(before.completedSteps, index);
      const executed = await save(f, proposal, `accepted-unit-${index}`);
      assert.equal(executed.receipt.status, 'confirmed_success');
      assert.equal(items(f).length, index + 1);
      const stored = items(f).find(value => value.id === executed.action.id)!;
      for (const [key, value] of Object.entries(proposal.arguments)) assert.deepEqual((stored as unknown as Record<string, unknown>)[key], value);
      const replay = await save(f, proposal, executed.action.id);
      assert.equal(replay.receipt.id, executed.receipt.id, 'same authorized action returns its durable receipt without advancing again');
      assert.equal(items(f).length, index + 1);
    }
    await assert.rejects(save(f, plan.acceptanceProposals[0], 'replay-with-new-id'), { code: 'planning_order' });
    assert.equal(items(f).length, 4);
    const complete = f.store.runtime.planning.progress(plan.acceptanceProposals[0].arguments.planRef);
    assert.equal(complete.status, 'applied'); assert.equal(complete.completedSteps, 4); assert.equal(complete.nextBlockId, null);
  } finally { f.close(); }
});

test('transaction checks whole calendar additions and existing edits after approval', async () => {
  for (const change of ['insert', 'edit', 'delete'] as const) {
    const f = new Fixture();
    try {
      f.store.saveAction(busy('original'));
      const plan = await draft(f), proposal = plan.acceptanceProposals[0], scope = f.scope();
      const action = f.store.runtime.actions.prepare(scope, { id: `approved-before-${change}`, capability: 'local.agenda.save', arguments: proposal.arguments });
      const approval = f.store.runtime.actions.approve(scope, action.id, action.digest, action.revision);
      if (change === 'insert') f.store.saveAction(busy('new-conflict', '09:00'));
      else if (change === 'edit') f.store.saveAction({ ...items(f)[0], startsAt: at('09:00') });
      else f.store.deleteAction('original');
      const before = items(f);
      await assert.rejects(f.store.runtime.actions.execute(scope, action.id, approval.id, new AbortController().signal), { code: 'planning_stale' });
      assert.deepEqual(items(f), before);
      assert.equal(f.store.runtime.actions.get(f.scope(), action.id)?.status, 'failed_confirmed');
    } finally { f.close(); }
  }
});

test('own successful first step advances the ledger; later external change stops remaining steps without undoing success', async () => {
  const f = new Fixture();
  try {
    const plan = await draft(f), [first, second] = plan.acceptanceProposals;
    const accepted = await save(f, first, 'partial-first');
    const progress = f.store.runtime.planning.validateSave(scopeData(f), second.arguments.planRef, second.arguments, items(f));
    assert.equal(progress.completedSteps, 1); assert.equal(progress.totalSteps, 2);
    assert.equal(f.store.runtime.planning.progress(first.arguments.planRef).status, 'partially_applied');
    f.store.saveAction(busy('later-change', '09:30'));
    await assert.rejects(save(f, second, 'partial-second'), { code: 'planning_stale' });
    assert.equal(f.store.runtime.actions.get(f.scope(), accepted.action.id)?.status, 'succeeded');
    assert.equal(items(f).length, 2);
    assert.ok(items(f).some(value => value.id === accepted.action.id));
    assert.ok(!items(f).some(value => value.id === 'partial-second'));
    const stopped = f.store.runtime.planning.progress(first.arguments.planRef);
    assert.equal(stopped.status, 'invalidated'); assert.equal(stopped.completedSteps, 1); assert.equal(stopped.nextBlockId, null);
    assert.equal(stopped.applied[0].recordId, accepted.action.id);
  } finally { f.close(); }
});

test('changed parameters and skipped units fail closed without consuming the authorized next step', async () => {
  const f = new Fixture();
  try {
    const plan = await draft(f), [first, second] = plan.acceptanceProposals;
    await assert.rejects(save(f, second, 'out-of-order'), { code: 'planning_order' });
    await assert.rejects(save(f, first, 'changed-time', f.scope(), { ...first.arguments, startsAt: at('10:00') }), { code: 'planning_parameters_changed' });
    await assert.rejects(save(f, first, 'changed-length', f.scope(), { ...first.arguments, durationMinutes: 20 }), { code: 'planning_parameters_changed' });
    assert.equal(items(f).length, 0);
    assert.equal((await save(f, first, 'valid-first')).receipt.status, 'confirmed_success');
    assert.equal((await save(f, second, 'valid-second')).receipt.status, 'confirmed_success');
  } finally { f.close(); }
});

test('failure after local write rolls back the calendar and does not advance the in-memory plan ledger', async () => {
  const f = new Fixture();
  try {
    const plan = await draft(f), [first, second] = plan.acceptanceProposals;
    f.repo.fault = point => { if (point === 'after_local_write_before_receipt') throw new Error('injected-plan-write-rollback'); };
    await assert.rejects(save(f, first, 'rolled-back-first'), /injected-plan-write-rollback/);
    f.repo.fault = undefined;
    assert.equal(items(f).length, 0);
    assert.equal(f.store.runtime.planning.progress(first.arguments.planRef).status, 'not_applied');
    assert.equal(f.store.runtime.planning.validateSave(scopeData(f), first.arguments.planRef, first.arguments, items(f)).completedSteps, 0);
    await assert.rejects(save(f, second, 'cannot-skip-rolled-back'), { code: 'planning_order' });
    assert.equal((await save(f, first, 'retried-first')).receipt.status, 'confirmed_success');
    assert.equal((await save(f, second, 'after-retried-first')).receipt.status, 'confirmed_success');
    assert.equal(items(f).length, 2);
  } finally { f.repo.fault = undefined; f.close(); }
});

test('ticket expiration and restart reject outstanding saves while retaining completed business rows', async () => {
  let f = new Fixture();
  try {
    const expired = await draft(f);
    f.clock.advance(5 * 60000);
    await assert.rejects(save(f, expired.acceptanceProposals[0], 'expired'), { code: 'planning_expired' });
    const fresh = await draft(f), [first, second] = fresh.acceptanceProposals;
    await save(f, first, 'before-restart');
    f = f.restart();
    await assert.rejects(save(f, second, 'after-restart'), { code: 'planning_ticket_missing' });
    assert.equal(items(f).length, 1);
    assert.equal(items(f)[0].id, 'before-restart');
    const unknown = f.store.runtime.planning.progress(second.arguments.planRef);
    assert.equal(unknown.progressKnown, false); assert.equal(unknown.completedSteps, null); assert.equal(unknown.status, 'unavailable');
  } finally { f.close(); }
});

test('current scope and policy revisions are rechecked at actual save rather than inherited from planning', async () => {
  for (const change of ['source', 'subject', 'policy', 'privacy', 'retention', 'grant'] as const) {
    const f = new Fixture();
    try {
      const plan = await draft(f), first = plan.acceptanceProposals[0];
      let scope: ScopeHandle;
      if (change === 'source') scope = f.scope({ sources: ['current', 'local-agenda'] });
      else if (change === 'subject') scope = f.scope({ subjectId: 'different-person' });
      else if (change === 'retention') scope = f.scope({ retention: 'session_only' });
      else if (change === 'grant') scope = f.scope({ grants: scopeData(f).grants.filter(grant => grant !== 'local:write') });
      else {
        f.repo.setMeta(change === 'policy' ? 'policy_revision' : 'privacy_epoch', (change === 'policy' ? f.repo.policyRevision : f.repo.epoch) + 1);
        scope = f.scope();
      }
      await assert.rejects(save(f, first, `restricted-${change}`, scope), { code: change === 'subject' ? 'effect_scope' : change === 'retention' ? 'draft_only' : change === 'grant' ? 'forbidden' : 'planning_policy_changed' });
      assert.equal(items(f).length, 0);
    } finally { f.close(); }
  }
});

test('unknown coverage and unverifiable concrete source versions cannot be adopted through ActionRuntime', async () => {
  for (const extra of [{ sourceCoverage: [] }, { tasks: [task('external', { sourceId: 'history:self', sourceVersion: '1' })] },
    { sourceCoverage: [{ sourceId: 'history:self', status: 'complete' }] },
    { sourceCoverage: [{ sourceId: 'history:self', status: 'complete', sourceVersion: '1' }] }]) {
    const f = new Fixture();
    try {
      const plan = await draft(f, input(extra));
      assert.equal(plan.adoption.status, 'blocked');
      assert.ok(plan.adoption.blockers.length);
      await assert.rejects(save(f, plan.acceptanceProposals[0], 'unverified-source'), { code: 'planning_conditions_unverified' });
      assert.equal(items(f).length, 0);
    } finally { f.close(); }
  }
});

test('prepare_action normalization preserves exact plan units and reports each actual committed step', async () => {
  const f = new Fixture();
  try {
    const text = '请根据这份明确的两任务安排逐步登记本地日历，并保留准备、休息与留白。';
    const run = f.store.runtime.begin(text, 'planning-tool-write', 'planning-tool-session', new AbortController().signal);
    const localCallbacks: RuntimeCallbacks = { ...callbacks, verifyLocalDelegation: async () => ({ decision: 'execute_local',
      basis: [{ id: run.events[0].id, quote: text }], missing: [], reason: 'Synthetic exact authorization of the current complete local occupancy.' }) };
    const prepared = await f.store.runtime.executeTool(run, 'look_up', { source: 'capability', capability: 'planning.draft', arguments: input({ tasks: [task('a', { setupMinutes: 5, cleanupMinutes: 5 }), task('b', { dependsOn: ['a'] })], restMinutes: 10 }) }, localCallbacks) as { data: Draft };
    const proposals = prepared.data.acceptanceProposals;
    assert.equal(proposals.length, 3);
    for (const [index, proposal] of proposals.entries()) {
      const result = await f.store.runtime.executeTool(run, 'prepare_action', structuredClone(proposal.arguments), localCallbacks) as { saved: boolean; status: string; planProgress: { status: string; completedSteps: number } };
      assert.equal(result.saved, true); assert.equal(result.status, 'confirmed_success');
      assert.equal(result.planProgress.completedSteps, index + 1);
      assert.equal(result.planProgress.status, index === proposals.length - 1 ? 'applied' : 'partially_applied');
    }
    assert.equal(items(f).length, 3);
  } finally { f.close(); }
});

test('version resolver changes invalidate external evidence and 15 minutes caps longer-lived host scopes', () => {
  const f = new Fixture();
  try {
    let version: string | undefined = '1';
    const service = new PlanningApplicationService(() => f.clock.now(), () => version);
    const scope = scopeData(f, f.scope({ expiresAt: '2026-09-14T07:00:00.000Z' }));
    const plan = service.prepare(scope, [], input({ tasks: [task('source-backed', { sourceId: 'history:self', sourceVersion: '1' })] }));
    assert.equal(plan.adoption.status, 'ready_for_authorized_steps');
    const first = plan.acceptanceProposals[0];
    assert.doesNotThrow(() => service.validateSave(scope, first.arguments.planRef, first.arguments, []));
    version = '2';
    assert.throws(() => service.validateSave(scope, first.arguments.planRef, first.arguments, []), { code: 'planning_conditions_unverified' });
    version = undefined;
    assert.throws(() => service.validateSave(scope, first.arguments.planRef, first.arguments, []), { code: 'planning_conditions_unverified' });
    version = '1'; f.clock.advance(15 * 60000);
    assert.throws(() => service.validateSave(scope, first.arguments.planRef, first.arguments, []), { code: 'planning_expired' });
  } finally { f.close(); }
});

test('recovery reads real adopted units and offers only the next complete authorized step', async () => {
  const f = new Fixture();
  try {
    const plan = await draft(f, input({ restMinutes: 10 }));
    await save(f, plan.acceptanceProposals[0], 'recover-first');
    const before = items(f);
    const recovered = f.store.runtime.planning.recover(scopeData(f), before, { planId: plan.planId });
    assert.equal(recovered.status, 'can_continue_authorized_steps');
    assert.equal(recovered.observedCount, 1);
    assert.equal(recovered.completedSteps, 1);
    assert.equal(recovered.nextProposal?.kind, 'transition');
    assert.equal(recovered.remainingRequest, null, 'cannot skip the not-yet-saved rest while deriving a continuation');
    assert.deepEqual(items(f), before, 'recovery never writes');
    await save(f, plan.acceptanceProposals[1], 'recover-rest');
    const afterRest = f.store.runtime.planning.recover(scopeData(f), items(f), { planId: plan.planId });
    assert.equal(afterRest.remainingRequest?.tasks.length, 1);
    assert.equal(afterRest.remainingRequest?.tasks[0].id, 'b');
    assert.deepEqual(afterRest.remainingRequest?.tasks[0].dependsOn, []);
    assert.ok(Date.parse(afterRest.remainingRequest!.tasks[0].earliestStart!) >= Date.parse(plan.acceptanceProposals[2].arguments.startsAt));
  } finally { f.close(); }
});

test('recovery derives remaining work from work minutes rather than reservations and never declares future work done', async () => {
  const f = new Fixture();
  try {
    const plan = await draft(f, input({ tasks: [task('long', { durationMinutes: { min: 90, max: 120 }, splittable: true, minimumChunkMinutes: 30, maximumChunkMinutes: 60, setupMinutes: 5, cleanupMinutes: 5 }), task('follow', { dependsOn: ['long'] })], maxScheduledMinutes: 150 }));
    await save(f, plan.acceptanceProposals[0], 'first-half');
    f.store.saveAction(busy('changed-calendar', '11:30'));
    const recovered = f.store.runtime.planning.recover(scopeData(f), items(f), { planId: plan.planId });
    assert.equal(recovered.status, 'recompute_required');
    assert.equal(recovered.nextProposal, null);
    assert.deepEqual(recovered.remainingRequest!.tasks.find(value => value.id === 'long')?.durationMinutes, { min: 30, max: 60 });
    assert.equal(recovered.remainingRequest!.maxScheduledMinutes, 90);
    assert.deepEqual(recovered.remainingRequest!.tasks.find(value => value.id === 'follow')?.dependsOn, ['long']);
    assert.deepEqual(recovered.remainingRequest!.completedTaskIds, []);
    const fresh = f.store.runtime.planning.prepare(scopeData(f), items(f), recovered.remainingRequest);
    assert.notEqual(fresh.planId, plan.planId);
    assert.equal(fresh.blocks.filter(value => value.taskId === 'long').reduce((sum, value) => sum + value.durationMinutes, 0), 60);
    assert.equal(items(f).length, 2);
  } finally { f.close(); }
});

test('recovery after process restart reports only current rows and never invents total or resumable steps', async () => {
  let f = new Fixture();
  try {
    const plan = await draft(f);
    await save(f, plan.acceptanceProposals[0], 'durable-plan-row');
    f = f.restart();
    const recovered = f.store.runtime.planning.recover(scopeData(f), items(f), { planId: plan.planId });
    assert.equal(recovered.status, 'observed_only_recompute_required');
    assert.equal(recovered.evidence, 'current_calendar_only');
    assert.equal(recovered.observedCount, 1);
    assert.equal(recovered.observed[0].recordId, 'durable-plan-row');
    assert.equal(recovered.totalSteps, null); assert.equal(recovered.completedSteps, null);
    assert.equal(recovered.nextProposal, null); assert.equal(recovered.remainingRequest, null);
    assert.equal(items(f).length, 1);
  } finally { f.close(); }
});

test('planning.recover is reachable through the real read capability without writing or reusing a stale result', async () => {
  const f = new Fixture();
  try {
    const plan = await draft(f);
    const run = f.store.runtime.begin('看看刚才那个日程方案到底保存了哪些安排，先不要再保存。', 'recover-via-capability', 'planning-test', new AbortController().signal);
    const recover = () => f.store.runtime.executeTool(run, 'look_up', { source: 'capability', capability: 'planning.recover', arguments: { planId: plan.planId } }, callbacks) as Promise<{ status: string; data: ReturnType<PlanningApplicationService['recover']> }>;
    const first = await recover();
    assert.equal(first.status, 'fresh'); assert.equal(first.data.observedCount, 0);
    await save(f, plan.acceptanceProposals[0], 'saved-between-reads');
    const second = await recover();
    assert.equal(second.data.observedCount, 1);
    assert.equal(second.data.observed[0].recordId, 'saved-between-reads');
    assert.equal(items(f).length, 1);
  } finally { f.close(); }
});

test('source versions are checked once per source with the current scope and inconsistent claims stay blocked', () => {
  const f = new Fixture();
  try {
    const scope = scopeData(f); let calls = 0;
    const service = new PlanningApplicationService(() => f.clock.now(), (sourceId, currentScope) => {
      calls++; assert.equal(sourceId, 'history:self'); assert.equal(currentScope.privacyEpoch, scope.privacyEpoch); return '1';
    });
    const plan = service.prepare(scope, [], input({ tasks: [task('a', { sourceId: 'history:self', sourceVersion: '1' }), task('b', { sourceId: 'history:self', sourceVersion: '2' })] }));
    assert.equal(calls, 1);
    assert.equal(plan.adoption.status, 'blocked');
    assert.throws(() => service.validateSave(scope, plan.acceptanceProposals[0].arguments.planRef, plan.acceptanceProposals[0].arguments, []), { code: 'planning_conditions_unverified' });
    assert.equal(calls, 2);
  } finally { f.close(); }
});

test('recovery treats deleted, moved and duplicate records as review conditions and checks current scope', async () => {
  const f = new Fixture();
  try {
    const plan = await draft(f);
    await save(f, plan.acceptanceProposals[0], 'edited-plan-row');
    const original = items(f)[0];
    const service = f.store.runtime.planning, scope = scopeData(f);
    const missing = service.recover(scope, [], { planId: plan.planId });
    assert.equal(missing.changedSteps[0].status, 'missing'); assert.equal(missing.remainingRequest, null);
    const moved = service.recover(scope, [{ ...original, startsAt: at('10:30') }], { planId: plan.planId });
    assert.equal(moved.status, 'review_required'); assert.equal(moved.changedSteps[0].status, 'changed');
    const duplicated = service.recover(scope, [original, { ...original, id: 'copy' }], { planId: plan.planId });
    assert.equal(duplicated.duplicateBlockIds.length, 1); assert.equal(duplicated.nextProposal, null);
    assert.throws(() => service.recover({ ...scope, sources: [] }, items(f), { planId: plan.planId }), { code: 'planning_scope' });
    assert.throws(() => service.recover({ ...scope, principalId: 'other', subjectId: 'other' }, items(f), { planId: plan.planId }), { code: 'planning_scope' });
  } finally { f.close(); }
});

test('a committed plan row remains a known success when a simultaneous unrelated change invalidates the next step', () => {
  const f = new Fixture();
  try {
    const service = new PlanningApplicationService(() => f.clock.now()), scope = scopeData(f);
    const previous = busy('baseline'), plan = service.prepare(scope, [previous], input()), first = plan.acceptanceProposals[0];
    const accepted: Action = { ...first.arguments, id: 'actually-committed', saved: true, done: false, revision: 1 };
    const observed = [{ ...previous, title: 'changed-after-sql-commit', revision: 2 }, accepted];
    assert.throws(() => service.committed(first.arguments.planRef, observed), { code: 'planning_commit_mismatch' });
    const progress = service.progress(first.arguments.planRef);
    assert.equal(progress.status, 'invalidated'); assert.equal(progress.progressKnown, true);
    assert.equal(progress.completedSteps, 1); assert.equal(progress.applied[0].recordId, accepted.id);
    assert.equal(progress.nextBlockId, null);
    const next = plan.acceptanceProposals[1];
    assert.throws(() => service.validateSave(scope, next.arguments.planRef, next.arguments, observed), { code: 'planning_stale' });
  } finally { f.close(); }
});

test('real prepare_action and final transaction reject common copies with the plan reference stripped', async () => {
  const f = new Fixture();
  try {
    const plan = await draft(f, input({ tasks: [task('a', { setupMinutes: 5, cleanupMinutes: 5 })] }));
    const { planRef: _ref, ...detached } = plan.acceptanceProposals[0].arguments;
    const { kind: _kind, ...withoutKind } = detached;
    const variants = [detached, { ...detached, durationMinutes: 20 }, { ...detached, detail: '改写详情不能丢失核验' }, withoutKind,
      { ...detached, startsAt: plan.blocks[0].start, durationMinutes: plan.blocks[0].durationMinutes }];
    const run = f.store.runtime.begin('把刚才方案里的这项写入日历。', 'detach-plan', 'detach-thread', new AbortController().signal);
    let verifierCalls = 0;
    const localCallbacks: RuntimeCallbacks = { ...callbacks, verifyLocalDelegation: async () => { verifierCalls++; return { decision: 'execute_local',
      basis: [{ id: run.events[0].id, quote: run.events[0].text }], missing: [], reason: 'Synthetic delegation does not override provenance.' }; } };
    for (const [index, args] of variants.entries()) {
      await assert.rejects(f.store.runtime.executeTool(run, 'prepare_action', structuredClone(args), localCallbacks), { code: 'planning_reference_required' }, `prepare_action detached variant ${index}`);
      await assert.rejects(f.store.runtime.actions.directLocal(f.scope(), { id: `detached-final-${index}`, capability: 'local.agenda.save', arguments: args, authorized: true }), { code: 'planning_reference_required' }, `final transaction detached variant ${index}`);
    }
    assert.equal(verifierCalls, 0, 'host provenance guard precedes the semantic authorization callback');
    assert.equal(items(f).length, 0);
    assert.equal((await save(f, plan.acceptanceProposals[0], 'complete-reference')).receipt.status, 'confirmed_success');
  } finally { f.close(); }
});

test('expired detached copies stay rejected while unrelated ordinary local registration remains usable', async () => {
  const f = new Fixture();
  try {
    const plan = await draft(f), { planRef: _ref, ...detached } = plan.acceptanceProposals[0].arguments;
    f.clock.advance(5 * 60000);
    await assert.rejects(f.store.runtime.actions.directLocal(f.scope(), { id: 'expired-detached', capability: 'local.agenda.save', arguments: detached, authorized: true }), { code: 'planning_reference_required' });
    const text = '请为另一件独立的事情登记一个本地日历事件。';
    const run = f.store.runtime.begin(text, 'ordinary-after-plan', 'ordinary-thread', new AbortController().signal);
    const result = await f.store.runtime.executeTool(run, 'prepare_action', { title: '独立事件', detail: '', kind: 'event', startsAt: at('13:00'), durationMinutes: 20 },
      { ...callbacks, verifyLocalDelegation: async () => ({ decision: 'execute_local', basis: [{ id: run.events[0].id, quote: text }], missing: [], reason: 'Explicit synthetic independent registration.' }) }) as { saved: boolean; status: string };
    assert.equal(result.saved, true); assert.equal(result.status, 'confirmed_success');
    assert.equal(items(f).length, 1); assert.equal(items(f)[0].title, '独立事件');
  } finally { f.close(); }
});
