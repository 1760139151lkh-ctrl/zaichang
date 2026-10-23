import type { Action } from '../../shared/types';
import type { EffectAction, ScopeData } from '../../shared/harness';
import { HarnessError } from '../../shared/harness';
import { localCalendarChangeSchema } from '../../shared/calendar';
import type { Store } from '../store';
import type { ReminderRuntime } from './reminders';
import { projectCalendarChange } from './calendar';
import { canonical } from '../runtime/semantics';
import type { PlanningApplicationService } from './planning-application';

export interface LocalEffectResult { recordId: string; recordRevision?: number; previous: Action | null; current: Action | null; applied: boolean; afterCommit?: () => void }

/** Invoked inside ActionRuntime's transaction, after approval and preflight. */
export class LocalCalendarService {
  constructor(private store: Store, private reminders: ReminderRuntime, private planning?: PlanningApplicationService) {}
  private items(): Action[] { return this.store.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload))); }
  read(id: string): Action | undefined {
    const row = this.store.db.prepare('SELECT payload FROM agenda WHERE id=?').get(id);
    return row ? JSON.parse(String(row.payload)) : undefined;
  }
  apply(projection: Action, effect?: EffectAction, scope?: ScopeData): LocalEffectResult {
    if (!effect || effect.capability === 'local.agenda.save') {
      if (Object.hasOwn(projection, 'planRef') && (!effect || !scope))
        throw new HarnessError('planning_guard_missing', '方案采用不能绕过受控动作与当前范围，尚未保存。');
      if (effect && scope) this.planning?.assertNoDetachedProposal(scope, effect.arguments);
      const planRef = effect?.arguments.planRef as { planId: string; blockId: string } | undefined;
      if (planRef) {
        if (!scope || !this.planning) throw new HarnessError('planning_guard_missing', '草案采用需要当前规划校验，尚未保存。');
        this.planning.validateSave(scope, planRef, effect!.arguments, this.items());
      }
      const previous = this.read(projection.id) || null;
      const current = this.store.writeAgendaProjection({ ...projection, effectActionId: effect?.id || projection.id },
        { reminderSpeaker: effect?.reminderSpeaker });
      if (current.planning && current.planning.state !== 'accepted') this.reminders.cancel(current.id);
      else this.reminders.schedule(current, effect?.goalId || projection.goalId);
      return { recordId: projection.id, recordRevision: current.revision || 1, previous, current, applied: !previous || (previous.revision || 1) !== current.revision,
        ...(planRef ? { afterCommit: () => { this.planning!.committed(planRef, this.items()); } } : {}) };
    }
    const args = localCalendarChangeSchema.parse(effect.arguments), previous = this.read(args.targetId);
    if (!previous) {
      if (args.operation === 'delete') return { recordId: args.targetId, previous: null, current: null, applied: false };
      throw new HarnessError('calendar_missing', '这个安排已经不存在，尚未修改。');
    }
    if ((previous.revision || 1) !== args.expectedRevision) throw new HarnessError('revision_conflict', '安排已在其他地方改变，请先读取当前版本。');
    if (args.operation === 'delete') {
      const deleted = this.store.deleteAction(args.targetId, effect.id);
      return { recordId: args.targetId, recordRevision: deleted.revision, previous, current: null, applied: deleted.applied };
    }
    let changed = projectCalendarChange(previous, args, this.store.settings().timeZone || 'Asia/Shanghai');
    if (canonical(changed) === canonical(previous)) return { recordId: args.targetId, previous, current: previous, applied: false };
    changed.revision = (previous.revision || 1) + 1;
    changed.effectActionId = effect.id;
    changed.approvalDigest = effect.digest;
    changed = this.store.writeAgendaProjection(changed, { reminderSpeaker: effect.reminderSpeaker });
    if (changed.done || changed.planning && changed.planning.state !== 'accepted' || !(changed.remindAt || ((changed.kind === 'reminder' || !changed.kind) && changed.startsAt))) this.reminders.cancel(args.targetId);
    // This transaction is an authorized current revision. Reusing a prior
    // trigger (A→B→A or invitation→accepted) restores its cancelled job only
    // when the reminder runtime has no existing submission receipt.
    else this.reminders.schedule(changed, changed.goalId, undefined, { restore: true });
    return { recordId: args.targetId, recordRevision: changed.revision, previous, current: changed, applied: (previous.revision || 1) !== changed.revision };
  }
  undo(effect: EffectAction) {
    const undo = effect.compensation;
    if (!undo) throw new HarnessError('undo_history_missing', '旧操作没有可核对的撤销版本，请从当前安排修改或删除。');
    if (!undo.applied) return;
    const current = this.read(undo.targetId);
    const currentRevision = this.store.agendaRevision(undo.targetId);
    const legacyAbsentRevision = !current && undo.expectedRevision === 0 && undo.previous ? Number(undo.previous.revision || 1) : undo.expectedRevision;
    if (currentRevision !== legacyAbsentRevision) throw new HarnessError('undo_conflict', '安排已再次变化，不能用旧撤销覆盖它。');
    if (!undo.previous) this.store.deleteAction(undo.targetId, effect.id);
    else {
      this.reminders.cancel(undo.targetId);
      const previous = undo.previous as unknown as Action;
      const restored = this.store.writeAgendaProjection({ ...previous, revision: currentRevision + 1 },
        { reminderSpeaker: previous.reminderSpeaker });
      this.reminders.schedule(restored, restored.goalId, undefined, { restore: true });
    }
  }
}
