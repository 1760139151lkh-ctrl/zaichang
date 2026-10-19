import { createHash, randomUUID } from 'node:crypto';
import type { Action } from '../../shared/types';
import {
  effectSchema,
  HarnessError,
  type Approval,
  type Dependency,
  type EffectAction,
  type EffectReceipt,
  type ScopeHandle,
  type ScopeData,
} from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from '../runtime/policy';
import type { CapabilityBroker, CapabilityResult } from '../capabilities/broker';
import { canonical } from '../runtime/semantics';
import type { LocalEffectResult } from './local-calendar';

/** Host-only planning provenance. Neither callback grants permission to execute. */
export interface LocalPlanPort {
  onPrepared(handle: ScopeHandle, action: EffectAction): void;
  assertCurrent(handle: ScopeHandle, action: EffectAction): void;
}

export class ActionRuntime {
  private inFlight = new Map<string, Promise<EffectReceipt>>();
  beforeDispatch?: () => Promise<void>;
  afterDispatch?: () => void;
  constructor(
    readonly repo: KernelRepository,
    readonly policy: PolicyKernel,
    readonly broker: CapabilityBroker,
    private localWrite: (action: Action, effect?: EffectAction, scope?: ScopeData) => void | LocalEffectResult,
    private localUndo?: (effect: EffectAction) => void,
    private readonly localPlanPort?: LocalPlanPort,
  ) {
    // A terminated process cannot know whether a dispatched external effect succeeded.
    repo.write(() => {
      for (const row of repo.db
        .prepare("SELECT payload FROM h_actions WHERE status IN ('dispatching','reconciling')")
        .all()) {
        const action = JSON.parse(String(row.payload)) as EffectAction;
        action.status = 'outcome_unknown';
        action.reason = 'interrupted_after_dispatch';
        this.put(action);
        repo.db
          .prepare(
            "UPDATE h_attempts SET status='outcome_unknown' WHERE action_id=? AND status='dispatching'",
          )
          .run(action.id);
      }
    });
  }
  private localPlanBoundary(operation: keyof LocalPlanPort, handle: ScopeHandle, action: EffectAction) {
    if (action.effect !== 'local_write' || !this.localPlanPort) return;
    const result: unknown = this.localPlanPort[operation](handle, action);
    if (result && typeof result === 'object' && typeof (result as { then?: unknown }).then === 'function')
      throw new HarnessError('planning_async_port', '规划来源关联须在当前同步事务内核对，尚未提交。');
  }
  digest(
    action: Pick<
      EffectAction,
      'capability' | 'capabilityContract' | 'arguments' | 'audience' | 'revision' | 'worldId' | 'validUntil' | 'dependencies'
    >,
  ) {
    return createHash('sha256').update(canonical(action)).digest('hex');
  }
  prepare(
    handle: ScopeHandle,
    input: {
      id?: string;
      capability: string;
      arguments: Record<string, any>;
      audience?: string;
      sourceId?: string;
      goalId?: string;
      dependencies?: Dependency[];
      validUntil?: string;
    },
  ): EffectAction {
    const scope = this.policy.validate(handle),
      cap = this.broker.describe(input.capability);
    if (!cap || cap.effect === 'read') throw new HarnessError('unsupported_action', '这项动作尚未接入。');
    if (scope.retention === 'session_only' || scope.worldId !== 'real')
      throw new HarnessError('draft_only', '本轮仅可比较草稿，不能创建持久动作。');
    const existing = input.id ? this.storedAction(handle, input.id) : undefined;
    if (existing) {
      if (existing.audience === 'redacted' || !this.repo.planningActionReadable(handle, existing.id))
        throw new HarnessError('action_unreadable', '动作不存在或当前来源不可读；不能由此推断此前没有执行。');
      if (existing.capability !== input.capability || canonical(existing.arguments) !== canonical(this.broker.validateArguments(input.capability, input.arguments)))
        throw new HarnessError('idempotency_conflict', '同一动作标识对应的参数已改变，需要核对原结果或准备明确修改。');
      if (['proposed', 'awaiting_approval', 'approved', 'failed_confirmed'].includes(existing.status))
        this.localPlanBoundary('assertCurrent', handle, existing);
      return existing;
    }
    const action: EffectAction = {
      id: input.id || randomUUID(),
      ownerId: scope.principalId,
      workspaceId: scope.workspaceId,
      subjectId: scope.subjectId,
      worldId: scope.worldId,
      revision: 1,
      capability: input.capability,
      capabilityContract: cap.capabilityContract,
      arguments: this.broker.validateArguments(
        input.capability,
        input.arguments,
      ) as EffectAction['arguments'],
      audience: input.audience || 'self',
      status: 'awaiting_approval',
      digest: '',
      idempotencyKey: randomUUID(),
      dependencies: input.dependencies || [],
      validUntil: input.validUntil || new Date(Date.parse(this.repo.clock.now()) + 86400000).toISOString(),
      policyRevision: scope.policyRevision,
      privacyEpoch: scope.privacyEpoch,
      effect: cap.effect,
      // The tier is descriptive until the trusted host explicitly calls
      // directLocal(). External effects never qualify, even when reversible.
      executionTier: cap.effect === 'local_write' && cap.supportsCancel ? 'direct_local' : 'approval_required',
      sourceId: input.sourceId || cap.sourceId,
      goalId: input.goalId,
      simulated: cap.simulated,
    };
    action.digest = this.digest({
      capability: action.capability,
      capabilityContract: action.capabilityContract,
      arguments: action.arguments,
      audience: action.audience,
      revision: action.revision,
      worldId: action.worldId,
      validUntil: action.validUntil,
      dependencies: action.dependencies,
    });
    effectSchema.parse(action);
    // Proposal, dependencies and outbox commit together, before any provider is called.
    this.repo.write(() => {
      this.repo.db
        .prepare('INSERT INTO h_actions VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(
          action.id,
          action.ownerId,
          action.workspaceId,
          action.subjectId,
          action.worldId,
          action.revision,
          action.status,
          action.goalId || null,
          action.sourceId,
          JSON.stringify(action),
        );
      for (const d of action.dependencies) this.repo.addDependency(handle, { ...d, consumerId: action.id });
      if (action.goalId)
        this.repo.addDependency(handle, {
          consumerId: action.id,
          producerId: action.goalId,
          producerRevision: this.workRevision(action.goalId),
          sensitivity: 'hard',
          invalidation: 'block',
        });
      for (const grant of cap.requiredScopes)
        this.repo.addDependency(handle, {
          consumerId: action.id,
          producerId: 'grant:' + grant,
          producerRevision: scope.policyRevision,
          sensitivity: 'privacy',
          invalidation: 'block',
        });
      this.localPlanBoundary('onPrepared', handle, action);
      this.repo.outbox('action_prepared', action.id);
    });
    this.repo.transitions.push({
      at: this.repo.clock.now(),
      objectId: action.id,
      to: action.status,
      revision: 1,
    });
    return action;
  }
  /**
   * Execute an explicitly host-authorized, parameter-complete, reversible
   * local registration without forcing a second confirmation card. This is
   * intentionally separate from model/tool input; callers must opt in from a
   * trusted UI or host path. External or non-reversible effects remain on the
   * normal digest-bound approval path.
   */
  async directLocal(
    handle: ScopeHandle,
    input: {
      id?: string;
      capability: string;
      arguments: Record<string, any>;
      audience?: string;
      sourceId?: string;
      goalId?: string;
      dependencies?: Dependency[];
      validUntil?: string;
      authorized: true;
    },
    signal: AbortSignal = new AbortController().signal,
  ): Promise<{ action: Pick<EffectAction, 'id' | 'revision' | 'digest' | 'status' | 'compensation'>; approval: Approval; receipt: EffectReceipt }> {
    if (input.authorized !== true) throw new HarnessError('approval_required', '本地直接登记需要明确确认。');
    const capability = this.broker.describe(input.capability);
    if (!capability || capability.effect !== 'local_write' || !capability.supportsCancel)
      throw new HarnessError('approval_required', '这项动作仍需具体确认后才能执行。');
    const action = this.prepare(handle, input);
    if (action.executionTier !== 'direct_local')
      throw new HarnessError('approval_required', '这项动作仍需具体确认后才能执行。');
    // prepare() has already validated the full argument schema and source;
    // approve() repeats the policy/epoch checks immediately before dispatch.
    const approval = this.approve(handle, action.id, action.digest, action.revision);
    const receipt = await this.execute(handle, action.id, approval.id, signal);
    const current = this.storedAction(handle, action.id) || action, visible = this.get(handle, action.id);
    return { action: visible || { id: current.id, revision: current.revision, digest: current.digest, status: current.status }, approval, receipt };
  }
  private workRevision(id: string) {
    return Number(this.repo.db.prepare('SELECT revision FROM h_work WHERE id=?').get(id)?.revision || 0);
  }
  private put(action: EffectAction) {
    this.repo.db
      .prepare('UPDATE h_actions SET revision=?,status=?,payload=? WHERE id=?')
      .run(action.revision, action.status, JSON.stringify(action), action.id);
  }
  /** Internal lifecycle reads retain the exact effect; display has a separate source gate. */
  private storedAction(handle: ScopeHandle, id: string): EffectAction | undefined {
    const s = this.policy.validate(handle),
      row = this.repo.db
        .prepare(
          'SELECT payload FROM h_actions WHERE id=? AND owner=? AND workspace=? AND subject=? AND world=? AND source IN (SELECT value FROM json_each(?))',
        )
        .get(id, s.principalId, s.workspaceId, s.subjectId, s.worldId, JSON.stringify(s.sources));
    return row ? JSON.parse(String(row.payload)) : undefined;
  }
  get(handle: ScopeHandle, id: string): EffectAction | undefined {
    const action = this.storedAction(handle, id);
    return action && this.repo.planningActionReadable(handle, id) ? action : undefined;
  }
  list(handle: ScopeHandle): EffectAction[] {
    const s = this.policy.validate(handle);
    return this.repo.db
      .prepare(
        'SELECT id,payload FROM h_actions WHERE owner=? AND workspace=? AND subject=? AND world=? AND source IN (SELECT value FROM json_each(?)) ORDER BY rowid DESC',
      )
      .all(s.principalId, s.workspaceId, s.subjectId, s.worldId, JSON.stringify(s.sources))
      .filter(row => this.repo.planningActionReadable(handle, String(row.id)))
      .map((r) => JSON.parse(String(r.payload)));
  }
  private cancellationView(handle: ScopeHandle, action: EffectAction) {
    return this.get(handle, action.id) || { id: action.id, capability: action.capability,
      status: action.status, revision: action.revision, parametersAvailable: false as const };
  }
  cancelPendingFromSources(sourceIds: string[]) {
    if (!sourceIds.length) return;
    this.repo.write(() => {
      const rows = this.repo.db.prepare(`SELECT a.id,a.payload FROM h_actions a WHERE a.owner=? AND a.workspace=?
        AND a.status IN ('proposed','awaiting_approval','approved')
        AND EXISTS(SELECT 1 FROM h_dependencies d WHERE d.consumer_id=a.id AND d.producer_id IN (SELECT value FROM json_each(?)))`)
        .all(this.repo.identity.principalId, this.repo.identity.workspaceId, JSON.stringify(sourceIds));
      for (const row of rows) {
        const action = JSON.parse(String(row.payload)) as EffectAction;
        action.status = 'cancelled'; action.reason = 'parent_run_cancelled'; this.put(action);
        this.repo.db.prepare("UPDATE h_jobs SET status='cancelled',fence=fence+1 WHERE object_id=?").run(action.id);
      }
    });
  }
  revise(
    handle: ScopeHandle,
    id: string,
    expectedRevision: number,
    args: Record<string, any>,
    audience?: string,
  ) {
    const action = this.get(handle, id);
    if (!action) throw new HarnessError('action_missing', '动作不存在或当前来源不可读。');
    if (action.audience === 'redacted') throw new HarnessError('action_unreadable', '旧动作的来源详情已清除，不能以修改恢复。');
    if (action.revision !== expectedRevision)
      throw new HarnessError('revision_conflict', '动作内容已更新，请重新查看。');
    if (['dispatching', 'outcome_unknown', 'succeeded', 'reconciling', 'unresolved', 'cancel_requested',
      'cancellation_unknown', 'cannot_cancel', 'cancellation_confirmed'].includes(action.status))
      throw new HarnessError('effect_already_dispatched', '该动作已派发，请先核查或取消。');
    this.broker.assertContract(action.capability, action.capabilityContract);
    const next = {
      ...action,
      arguments: this.broker.validateArguments(action.capability, args) as EffectAction['arguments'],
      audience: audience || action.audience,
      revision: action.revision + 1,
      status: 'awaiting_approval' as const,
      privacyEpoch: this.repo.epoch,
      policyRevision: this.repo.policyRevision,
    };
    delete next.reason;
    next.digest = this.digest({
      capability: next.capability,
      capabilityContract: next.capabilityContract,
      arguments: next.arguments,
      audience: next.audience,
      revision: next.revision,
      worldId: next.worldId,
      validUntil: next.validUntil,
      dependencies: next.dependencies,
    });
    this.repo.write(() => {
      const current = this.get(handle, id);
      if (!current || current.revision !== expectedRevision || current.digest !== action.digest)
        throw new HarnessError('revision_conflict', '动作内容已更新，请重新查看。');
      this.localPlanBoundary('assertCurrent', handle, current);
      this.put(next);
      // A linked action cannot shed or replace its planRef through revision.
      // The host port compares every prior link before registering this revision.
      this.localPlanBoundary('onPrepared', handle, next);
    });
    return next;
  }
  approve(handle: ScopeHandle, id: string, digest: string, revision: number): Approval {
    const s = this.policy.validate(handle),
      action = this.get(handle, id);
    if (!action) throw new HarnessError('action_missing', '动作不存在或当前来源不可读。');
    if (action.digest !== digest || action.revision !== revision)
      throw new HarnessError('approval_mismatch', '动作内容已经变化，需要重新确认。');
    if (['cancelled', 'cancel_requested', 'cannot_cancel', 'cancellation_confirmed'].includes(action.status))
      throw new HarnessError('action_cancelled', '已撤销的动作不能再次批准。');
    // Returning a prior approval must still verify its original execution contract.
    this.preflight(handle, action);
    const existing = this.repo.db
      .prepare('SELECT payload FROM h_approvals WHERE action_id=? ORDER BY rowid DESC LIMIT 1')
      .get(id);
    if (existing) {
      const approval = JSON.parse(String(existing.payload)) as Approval;
      if (
        approval.actionDigest === digest &&
        approval.actionRevision === revision &&
        approval.privacyEpoch === s.privacyEpoch &&
        approval.policyRevision === s.policyRevision &&
        approval.expiresAt > this.repo.clock.now()
      )
        return approval;
    }
    const approval: Approval = {
      id: randomUUID(),
      actionId: id,
      actionDigest: digest,
      actionRevision: revision,
      principalId: s.principalId,
      policyRevision: s.policyRevision,
      privacyEpoch: s.privacyEpoch,
      expiresAt: new Date(
        Math.min(Date.parse(action.validUntil), Date.parse(this.repo.clock.now()) + 600000),
      ).toISOString(),
      used: false,
    };
    this.repo.write(() => {
      this.repo.db
        .prepare('INSERT INTO h_approvals VALUES(?,?,?)')
        .run(approval.id, id, JSON.stringify(approval));
      action.status = 'approved';
      action.policyRevision = s.policyRevision;
      action.privacyEpoch = s.privacyEpoch;
      this.put(action);
    });
    return approval;
  }
  private preflight(handle: ScopeHandle, action: EffectAction, approval?: Approval) {
    const s = this.policy.validate(handle);
    const current = this.storedAction(handle, action.id);
    if (!current || current.revision !== action.revision || current.digest !== action.digest)
      throw new HarnessError('revision_conflict', '动作在核验前已改变，未执行旧参数。');
    if (['cancelled', 'cancel_requested', 'cancellation_confirmed', 'cancellation_unknown', 'cannot_cancel'].includes(current.status))
      throw new HarnessError('action_cancelled', '动作已取消或正在核查取消结果，未执行旧参数。');
    if (current.status !== action.status) throw new HarnessError('action_changed', '动作状态已改变，请先核查当前结果。');
    if (!this.repo.planningActionReadable(handle, action.id))
      throw new HarnessError('action_unreadable', '动作的原来源当前不可读，未执行旧参数。');
    const cap = this.broker.assertContract(action.capability, action.capabilityContract);
    if (!s.sources.includes(cap.sourceId))
      throw new HarnessError('source_forbidden', '此动作来源不在当前授权范围内。');
    if (action.worldId !== 'real' || s.subjectId !== s.principalId)
      throw new HarnessError('effect_scope', '不能替其他主体或假设世界执行动作。');
    for (const grant of cap.requiredScopes) this.policy.require(handle, grant);
    this.broker.validateArguments(action.capability, action.arguments);
    this.localPlanBoundary('assertCurrent', handle, action);
    if (Date.parse(action.validUntil) <= Date.parse(this.repo.clock.now()))
      throw new HarnessError('action_expired', '动作已经超过确认期限。');
    if (action.goalId) {
      const goal = this.repo.db.prepare("SELECT status,owner,workspace,subject,world FROM h_work WHERE id=? AND kind='goal'").get(action.goalId);
      if (!goal || goal.status !== 'active' || goal.owner !== s.principalId || goal.workspace !== s.workspaceId || goal.subject !== s.subjectId || goal.world !== 'real')
        throw new HarnessError('goal_cancelled', '相关目标已经取消或暂停。');
    }
    for (const dep of action.dependencies) {
      const row = this.repo.db
        .prepare(
          'SELECT revision,status FROM h_work WHERE id=? UNION ALL SELECT revision,status FROM h_assertions WHERE id=?',
        )
        .get(dep.producerId, dep.producerId);
      if (
        row &&
        (Number(row.revision) !== dep.producerRevision ||
          ['cancelled', 'inactive', 'retracted', 'expired', 'stale', 'blocked'].includes(String(row.status)))
      )
        throw new HarnessError('dependency_changed', '动作依据已发生变化，请重新核对。');
      if (this.repo.hasFence(dep.producerId))
        throw new HarnessError('source_deleted', '动作的来源已经删除。');
    }
    if (
      approval &&
      (approval.actionDigest !== action.digest ||
        approval.actionRevision !== action.revision ||
        approval.principalId !== s.principalId ||
        approval.privacyEpoch !== s.privacyEpoch ||
        approval.policyRevision !== s.policyRevision ||
        Date.parse(approval.expiresAt) <= Date.parse(this.repo.clock.now()))
    )
      throw new HarnessError('approval_invalid', '这次确认已失效，请重新查看具体动作。');
  }
  execute(
    handle: ScopeHandle,
    id: string,
    approvalId: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<EffectReceipt> {
    const running = this.inFlight.get(id);
    if (running) return running;
    const pending = this.dispatch(handle, id, approvalId, signal).finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, pending);
    return pending;
  }
  private async dispatch(
    handle: ScopeHandle,
    id: string,
    approvalId: string,
    signal: AbortSignal,
  ): Promise<EffectReceipt> {
    let action = this.storedAction(handle, id);
    if (!action) throw new HarnessError('action_missing', '动作不存在。');
    if (action.status === 'succeeded') {
      const previous = this.storedReceipts(handle, id).at(-1);
      if (previous) return this.receiptView(handle, previous);
    }
    if (['outcome_unknown', 'dispatching', 'reconciling', 'unresolved'].includes(action.status))
      throw new HarnessError('inspect_first', '结果尚未确定，请先核查，不能重复执行。', 'reconcile');
    const approvalRow = this.repo.db
        .prepare('SELECT payload FROM h_approvals WHERE id=? AND action_id=?')
        .get(approvalId, id),
      approval: Approval | undefined = approvalRow ? JSON.parse(String(approvalRow.payload)) : undefined;
    if (!approval) throw new HarnessError('approval_required', '缺少该动作的具体确认。');
    await this.beforeDispatch?.();
    signal.throwIfAborted();
    try {
      this.preflight(handle, action, approval);
    } catch (error) {
      this.repo.write(() => {
        const latest = this.repo.db.prepare('SELECT payload FROM h_actions WHERE id=?').get(id);
        if (latest) {
          const current = JSON.parse(String(latest.payload)) as EffectAction;
          // A cancellation or revision that won the await boundary keeps its
          // own state and proof; a stale dispatch cannot rewrite either one.
          if (current.revision !== action!.revision || current.digest !== action!.digest || current.status !== action!.status) return;
          action = current;
          action!.status = 'cancelled';
          action!.reason =
            action!.reason === 'permission_revoked'
              ? 'permission_revoked'
              : error instanceof HarnessError
                ? error.code
                : 'preflight_failed';
          this.put(action!);
        }
      });
      throw error;
    }
    if (approval.used) throw new HarnessError('approval_used', '这次确认已使用，请核查已有回执。');
    const attemptId = randomUUID();
    this.repo.write(() => {
      this.preflight(handle, action!, approval);
      approval.used = true;
      this.repo.db
        .prepare('UPDATE h_approvals SET payload=? WHERE id=?')
        .run(JSON.stringify(approval), approval.id);
      action!.status = 'dispatching';
      this.put(action!);
      this.repo.db
        .prepare('INSERT INTO h_attempts VALUES(?,?,?,?,?,?)')
        .run(
          attemptId,
          id,
          action!.idempotencyKey,
          'dispatching',
          this.repo.epoch,
          JSON.stringify({ createdAt: this.repo.clock.now(), capability: action!.capability }),
        );
    });
    this.repo.transitions.push({
      at: this.repo.clock.now(),
      objectId: id,
      from: 'approved',
      to: 'dispatching',
      revision: action.revision,
    });
    if (action.effect === 'local_write') {
      let afterCommit: (() => void) | undefined;
      let committedReceipt: EffectReceipt;
      try {
        committedReceipt = this.repo.write(() => {
          this.preflight(handle, action!, approval);
          const local = this.localWrite({
            ...action!.arguments,
            id,
            saved: true,
            done: false,
            revision: action!.revision,
            approvalDigest: action!.digest,
          } as Action, action!, this.policy.validate(handle));
          afterCommit = local?.afterCommit;
          const recordId = local?.recordId || id;
          const stored = this.repo.db.prepare('SELECT payload FROM agenda WHERE id=?').get(recordId);
          const current = stored ? JSON.parse(String(stored.payload)) as Action : undefined;
          if (local?.current === null ? !!current : !current)
            throw new HarnessError('local_verification', '本地状态没有通过写后核查，事务已回滚。');
          const expected = local?.current || (local?.current === null ? null : action!.arguments);
          if (expected && Object.entries(expected).some(([key, value]) => !['coverage', 'missingNeeds', 'approvalDigest'].includes(key) && canonical((current as any)?.[key]) !== canonical(value)))
            throw new HarnessError('local_verification', '本地记录与批准内容不一致，事务已回滚。');
          if (local) action!.compensation = { targetId: recordId, expectedRevision: local.recordRevision ?? local.current?.revision ?? 0, previous: local.previous as any, applied: local.applied };
          this.repo.fault?.('after_local_write_before_receipt');
          const receipt: EffectReceipt = {
            id: randomUUID(),
            actionId: id,
            attemptId,
            sourceId: action!.sourceId,
            status: 'confirmed_success',
            localStatus: 'local_saved',
            externalRecordId: recordId,
            observedAt: this.repo.clock.now(),
          };
          this.record(action!, receipt);
          return receipt;
        });
      } catch (error) {
        action.status = 'failed_confirmed';
        action.reason = 'local_transaction_rolled_back';
        this.repo.write(() => this.put(action!));
        throw error;
      }
      // This is an ephemeral plan cursor, not the authority for the saved
      // business row. A bookkeeping failure must never relabel a committed
      // local action as failed; the unchanged cursor rejects the next block.
      try { afterCommit?.(); } catch { /* The next adoption requires a fresh draft. */ }
      return committedReceipt;
    }
    try {
      const result = await this.broker.invoke(handle, action.capability, action.arguments, signal, {
        actionAttempt: { id: attemptId, key: action.idempotencyKey },
      });
      this.afterDispatch?.();
      this.repo.fault?.('after_external_dispatch_before_receipt');
      const receipt = this.fromResult(action, attemptId, result);
      this.repo.write(() => this.record(action!, receipt));
      return receipt;
    } catch (error) {
      const receipt: EffectReceipt = {
        id: randomUUID(),
        actionId: id,
        attemptId,
        sourceId: action.sourceId,
        status: 'unknown',
        observedAt: this.repo.clock.now(),
        reason: 'receipt_unavailable',
      };
      this.repo.write(() => this.record(action!, receipt));
      return receipt;
    }
  }
  private fromResult(action: EffectAction, attemptId: string, result: CapabilityResult): EffectReceipt {
    const data = result.data as
      { receiptStatus?: EffectReceipt['status']; externalRecordId?: string } | undefined;
    const status = data?.receiptStatus || 'unknown';
    return {
      id: randomUUID(),
      actionId: action.id,
      attemptId,
      sourceId: result.sourceId,
      status,
      observedAt: this.repo.clock.now(),
      externalRecordId: data?.externalRecordId,
      reason: result.reason,
    };
  }
  private record(action: EffectAction, receipt: EffectReceipt) {
    const latest = this.repo.db.prepare('SELECT status FROM h_actions WHERE id=?').get(action.id);
    action.status =
      receipt.status === 'confirmed_success'
        ? 'succeeded'
        : receipt.status === 'confirmed_failure'
          ? 'failed_confirmed'
          : 'outcome_unknown';
    if (latest?.status === 'cancel_requested') {
      action.status = 'cancel_requested';
      action.reason = 'effect_may_have_occurred_after_revocation';
    }
    this.put(action);
    this.repo.db
      .prepare('INSERT INTO h_receipts VALUES(?,?,?,?)')
      .run(receipt.id, receipt.actionId, receipt.attemptId, JSON.stringify(receipt));
    this.repo.db.prepare('UPDATE h_attempts SET status=? WHERE id=?').run(action.status, receipt.attemptId);
    this.repo.transitions.push({
      at: this.repo.clock.now(),
      objectId: action.id,
      to: action.status,
      revision: action.revision,
    });
    this.repo.outbox('action_receipt', action.id);
  }
  private storedReceipts(handle: ScopeHandle, id: string): EffectReceipt[] {
    if (!this.storedAction(handle, id)) return [];
    return this.repo.db
      .prepare('SELECT payload FROM h_receipts WHERE action_id=? ORDER BY rowid')
      .all(id)
      .map((r) => JSON.parse(String(r.payload)));
  }
  private receiptView(handle: ScopeHandle, receipt: EffectReceipt): EffectReceipt {
    if (this.repo.planningActionReadable(handle, receipt.actionId)) return receipt;
    return { id: receipt.id, actionId: receipt.actionId, attemptId: receipt.attemptId, sourceId: receipt.sourceId,
      status: receipt.status, observedAt: receipt.observedAt, ...(receipt.localStatus ? { localStatus: receipt.localStatus } : {}) };
  }
  receipts(handle: ScopeHandle, id: string): EffectReceipt[] {
    return this.storedReceipts(handle, id).map(receipt => this.receiptView(handle, receipt));
  }
  async reconcile(handle: ScopeHandle, id: string, signal: AbortSignal = new AbortController().signal) {
    const action = this.storedAction(handle, id);
    if (!action) throw new HarnessError('action_missing', '动作不存在。');
    if (!['outcome_unknown', 'unresolved', 'cancel_requested'].includes(action.status))
      return this.receipts(handle, id).at(-1);
    if (action.effect === 'local_write' && ['local.agenda.save', 'local.agenda.change'].includes(action.capability)) {
      signal.throwIfAborted(); this.policy.validate(handle);
      const known = this.storedReceipts(handle, id).at(-1);
      if (known) return this.receiptView(handle, known);
      const attempt = this.repo.db.prepare('SELECT id FROM h_attempts WHERE action_id=? ORDER BY rowid DESC LIMIT 1').get(id);
      if (!attempt) throw new HarnessError('attempt_missing', '没有可核查的派发记录。');
      // These handlers commit the local row and its receipt in one SQLite
      // transaction. No receipt after restart means that transaction did not
      // commit; unlike an external HTTP timeout, a local re-dispatch is not guessed.
      const receipt: EffectReceipt = { id: randomUUID(), actionId: id, attemptId: String(attempt.id), sourceId: action.sourceId,
        status: 'confirmed_failure', observedAt: this.repo.clock.now(), reason: 'local_transaction_not_committed' };
      this.repo.write(() => this.record(action, receipt));
      return this.receiptView(handle, receipt);
    }
    let cap: ReturnType<CapabilityBroker['assertContract']>;
    try { cap = this.broker.assertContract(action.capability, action.capabilityContract); }
    catch (error) {
      action.status = 'unresolved';
      action.reason = error instanceof HarnessError ? error.code : 'inspection_unavailable';
      this.repo.write(() => this.put(action));
      return;
    }
    if (!cap?.supportsInspect) {
      action.status = 'unresolved';
      action.reason = 'provider_has_no_inspect_check_manually';
      this.repo.write(() => this.put(action));
      return;
    }
    const row = this.repo.db
      .prepare('SELECT id FROM h_attempts WHERE action_id=? ORDER BY rowid DESC LIMIT 1')
      .get(id);
    if (!row) throw new HarnessError('attempt_missing', '缺少派发记录。');
    action.status = 'reconciling';
    this.repo.write(() => this.put(action));
    try {
      const result = await this.broker.invoke(handle, action.capability, action.arguments, signal, {
        inspectKey: action.idempotencyKey,
      });
      const receipt = this.fromResult(action, String(row.id), result);
      this.repo.write(() => this.record(action, receipt));
      return this.receiptView(handle, receipt);
    } catch {
      action.status = 'unresolved';
      action.reason = 'inspection_unavailable';
      this.repo.write(() => this.put(action));
      return;
    }
  }
  async cancel(handle: ScopeHandle, id: string, signal: AbortSignal = new AbortController().signal) {
    const action = this.storedAction(handle, id);
    if (!action) return;
    signal.throwIfAborted();
    if (['cancelled', 'cancellation_confirmed'].includes(action.status)) return this.cancellationView(handle, action);
    if (['proposed', 'awaiting_approval', 'approved', 'failed_confirmed'].includes(action.status)) {
      const cancelled = this.repo.write(() => {
        const current = this.storedAction(handle, id);
        if (!current || current.revision !== action.revision || current.digest !== action.digest || current.status !== action.status)
          throw new HarnessError('revision_conflict', '动作已变化，请先核查当前结果再取消。');
        // This affirmative host marker is created only while cancellation and
        // the complete absence of any dispatch/business proof share one writer.
        // Legacy cancelled, failed or redacted actions receive no such proof.
        const ref = current.arguments.planRef as { planId?: string; blockId?: string } | undefined;
        const neverDispatched = ['proposed', 'awaiting_approval', 'approved'].includes(current.status)
          && current.capability === 'local.agenda.save' && current.effect === 'local_write' && !current.simulated && current.audience === 'self'
          && !current.compensation
          && !this.repo.db.prepare('SELECT 1 FROM h_attempts WHERE action_id=?').get(id)
          && !this.repo.db.prepare('SELECT 1 FROM h_receipts WHERE action_id=?').get(id)
          && !this.repo.db.prepare("SELECT 1 FROM h_approvals WHERE action_id=? AND json_extract(payload,'$.used')=1").get(id)
          && !this.repo.db.prepare(`SELECT 1 FROM agenda WHERE id=? OR json_extract(payload,'$.effectActionId')=?
            OR (? IS NOT NULL AND json_extract(payload,'$.planRef.planId')=? AND json_extract(payload,'$.planRef.blockId')=?)`)
            .get(id, id, ref?.planId ?? null, ref?.planId ?? null, ref?.blockId ?? null);
        if (neverDispatched) current.reason = 'cancelled_before_dispatch';
        else if (current.reason === 'cancelled_before_dispatch') delete current.reason;
        current.status = 'cancelled';
        this.repo.db.prepare("UPDATE h_jobs SET status='cancelled',fence=fence+1 WHERE object_id=?").run(id);
        this.put(current);
        return current;
      });
      return this.cancellationView(handle, cancelled);
    }
    if (action.effect === 'local_write') {
      this.policy.require(handle, 'local:write');
      if (action.reason === 'prior_business_version_removed_with_conversation') throw new HarnessError('undo_history_deleted', '修改前的版本已随对话清除。当前安排仍保留，可从安排中按当前版本修改或删除。');
      this.repo.write(() => {
        if (this.localUndo) this.localUndo(action);
        else {
          this.repo.db.prepare('DELETE FROM agenda WHERE id=?').run(id);
          this.repo.db.prepare("UPDATE h_jobs SET status='cancelled',fence=fence+1 WHERE object_id=?").run(id);
        }
        action.status = 'cancellation_confirmed';
        this.put(action);
      });
      return this.cancellationView(handle, action);
    }
    action.status = 'cancel_requested';
    this.repo.write(() => { this.repo.db.prepare("UPDATE h_jobs SET status='cancelled',fence=fence+1 WHERE object_id=?").run(id); this.put(action); });
    let cap: ReturnType<CapabilityBroker['assertContract']>;
    try { cap = this.broker.assertContract(action.capability, action.capabilityContract); }
    catch (error) {
      // Preserve the pending cancellation and any prior result. A replacement
      // provider must never receive the original provider's recovery key.
      action.reason = error instanceof HarnessError ? error.code : 'cancellation_unavailable';
      this.repo.write(() => this.put(action));
      return this.cancellationView(handle, action);
    }
    if (!cap?.supportsCancel) {
      action.status = 'cannot_cancel';
      action.reason = 'provider_cannot_reverse_effect';
      this.repo.write(() => this.put(action));
      return this.cancellationView(handle, action);
    }
    try {
      const result = await this.broker.invoke(handle, action.capability, action.arguments, signal, {
        cancelKey: action.idempotencyKey,
      });
      const data = result.data as { receiptStatus?: string } | undefined;
      action.status =
        data?.receiptStatus === 'confirmed_success' ? 'cancellation_confirmed' : 'cancellation_unknown';
    } catch {
      action.status = 'cancellation_unknown';
    }
    this.repo.write(() => this.put(action));
    return this.cancellationView(handle, action);
  }
}
