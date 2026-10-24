import { createHash } from 'node:crypto';
import { HarnessError, type Dependency, type EffectAction, type ScopeHandle } from '../../shared/harness';
import { planningOfferSchema, type PlanningOfferProgress } from '../../shared/planning-offer';
import type { Action } from '../../shared/types';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from '../runtime/policy';
import { canonical } from '../runtime/semantics';
import type { ActionRuntime } from './runtime';
import type { PlanningApplicationService } from './planning-application';

/** One review card joins the existing ordered action transactions. It is not another planner. */
export class PlanningOfferService {
  private readonly inFlight = new Map<string, Promise<void>>();
  constructor(private readonly repo: KernelRepository, private readonly policy: PolicyKernel,
    private readonly planning: PlanningApplicationService, private readonly actions: ActionRuntime) {}

  private items(): Action[] {
    return this.repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload)));
  }
  prepare(handle: ScopeHandle, planId: string, dependencies: Dependency[]) {
    const proposal = this.planning.proposal(this.policy.validate(handle), this.items(), planId);
    const offer = planningOfferSchema.parse({ ...proposal, units: proposal.units.map(unit => ({
      blockId: unit.blockId, kind: unit.kind, arguments: unit.arguments, ...(unit.work ? { work: unit.work } : {}),
      actionId: 'plan:' + createHash('sha256').update(canonical(unit.arguments.planRef)).digest('hex'),
    })) });
    const first = offer.units[0];
    const action = this.actions.prepare(handle, { id: first.actionId, capability: 'local.agenda.save',
      arguments: first.arguments, planningOffer: offer, dependencies, validUntil: offer.expiresAt });
    if (canonical(action.planningOffer) !== canonical(offer))
      throw new HarnessError('planning_offer_changed', '这份安排已有不同的采用记录，尚未另建可重复采用的卡片。');
    return { ...first.arguments, id: action.id, revision: action.revision, approvalDigest: action.digest,
      planningOffer: offer, saved: false, coverage: 'verified' as const };
  }

  state(handle: ScopeHandle, action: EffectAction): PlanningOfferProgress | undefined {
    const offer = action.planningOffer;
    if (!offer) return;
    let saved = 0, present = 0, changed = 0, uncertain = false;
    const items = this.items();
    for (const unit of offer.units) {
      const effect = this.actions.get(handle, unit.actionId);
      const receipt = effect && this.actions.receipts(handle, effect.id).find(value => value.status === 'confirmed_success' && value.localStatus === 'local_saved');
      if (!effect || !receipt) {
        if (effect && ['dispatching', 'outcome_unknown', 'reconciling', 'unresolved'].includes(effect.status)) uncertain = true;
        continue;
      }
      saved++;
      const item = items.find(value => value.id === receipt.externalRecordId);
      if (item && Object.entries(unit.arguments).every(([key, value]) => canonical((item as unknown as Record<string, unknown>)[key]) === canonical(value))) present++;
      else changed++;
    }
    const base = { total: offer.units.length, saved, present, changed };
    if (uncertain) return { ...base, status: 'unknown', reason: '其中一项的保存结果还没有确认。' };
    if (saved === offer.units.length) return { ...base, status: changed ? 'recompute_required' : 'saved',
      ...(changed ? { reason: '先前已经保存的安排后来有了变化。' } : {}) };
    if (this.inFlight.has(action.id)) return { ...base, status: 'saving' };
    if (['cancelled', 'cancel_requested', 'cancellation_confirmed', 'cannot_cancel'].includes(action.status))
      return { ...base, status: 'stopped' };
    try {
      this.planning.proposal(this.policy.validate(handle), this.items(), offer.planId);
      return { ...base, status: saved ? 'partially_saved' : 'ready' };
    } catch (error) {
      return { ...base, status: 'recompute_required', reason: error instanceof Error ? error.message : '当前安排需要重新试排。' };
    }
  }

  /** The native click binds the complete original offer digest, not just its first unit. */
  accept(handle: ScopeHandle, item: Action) {
    const existing = this.inFlight.get(item.id);
    if (existing) return existing;
    const operation = this.apply(handle, item).finally(() => this.inFlight.delete(item.id));
    this.inFlight.set(item.id, operation);
    return operation;
  }
  private async apply(handle: ScopeHandle, item: Action) {
    const action = this.actions.get(handle, item.id), offer = action?.planningOffer;
    if (!action || !offer || action.revision !== item.revision || action.digest !== item.approvalDigest
      || canonical(item.planningOffer) !== canonical(offer))
      throw new HarnessError('approval_mismatch', '这张卡的内容刚刚变过，可以先看看现在这一版，再决定要不要这样安排。');
    if (item.done) throw new HarnessError('completion_scope', '采用一份安排与完成其中的工作是不同的事情。');
    for (const unit of offer.units) {
      // Each new step retains the original offer's dependencies and expiry.
      // A prior confirmed step is observed, never submitted a second time.
      const current = this.actions.get(handle, unit.actionId);
      if (current?.status === 'succeeded') {
        if (!this.actions.receipts(handle, current.id).some(receipt => receipt.status === 'confirmed_success' && receipt.localStatus === 'local_saved'))
          throw new HarnessError('planning_result_unknown', '已有步骤还缺可对应的本地成功回执，本次没有重复保存。');
        continue;
      }
      this.planning.validateSave(this.policy.validate(handle), unit.arguments.planRef, unit.arguments, this.items());
      const prepared = current || this.actions.prepare(handle, { id: unit.actionId, capability: 'local.agenda.save',
        arguments: unit.arguments, dependencies: action.dependencies, validUntil: offer.expiresAt });
      if (canonical(prepared.arguments) !== canonical(unit.arguments))
        throw new HarnessError('planning_parameters_changed', '原步骤的内容已经改变，后续采用停在这里。');
      const approval = this.actions.approve(handle, prepared.id, prepared.digest, prepared.revision);
      const receipt = await this.actions.execute(handle, prepared.id, approval.id);
      if (receipt.status !== 'confirmed_success' || receipt.localStatus !== 'local_saved')
        throw new HarnessError('planning_result_unknown', '这一步尚未取得本地成功回执，后续采用停在这里。');
    }
  }
}
