import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, personalLabel, type ScopeHandle, type WorkRecord } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from './policy';
import type { WorkService } from './work';
import type { BasisService } from './basis';
import type { CooperationService } from './cooperation';
import type { ReminderRuntime } from '../actions/reminders';
import type { CapabilityBroker } from '../capabilities/broker';
import { canonical } from './semantics';
import type { InteractionPreferences } from '../../shared/interaction';

const id = z.string().min(1).max(160);
const citation = z.object({ eventId: id.optional().describe('通常省略，由宿主按quote绑定唯一的本轮用户原话；填写时必须是精确的当前标识，不能用历史来源或猜测标识。'), quote: z.string().min(1).max(3000) }).strict();
export const attentionControlInput = z.object({
  operation: z.enum(['follow', 'pause', 'once', 'avoid', 'stop', 'resume', 'feedback', 'read']),
  targetId: id.optional(), expectedRevision: z.number().int().positive().optional(),
  source: citation.optional(), title: z.string().min(1).max(160).optional(),
  rule: z.string().min(1).max(1200).optional().describe('这一条限制所适用的内容。不同范围或期限的限制分别保存，不把整句的多个限制塞进同一个到期记录。'), until: z.string().datetime({ offset: true }).nullable().optional().describe('只属于当前这一项控制的到期时间。停止某种主动理由而没有明确终点时用null；时限归属有歧义也不自动恢复该主动行为，不借用同句另一项临时暂停的期限。'),
  eventCategory: z.string().min(1).max(80).optional(),
  sources: z.array(id).max(8).optional(), channel: z.enum(['in_app', 'local_notification']).optional(),
  probe: z.object({ capability: z.string().max(100), arguments: z.record(z.string(), z.json()) }).strict().optional(),
}).strict();
export const helpDecisionInput = z.object({
  id, expectedRevision: z.number().int().positive(),
  choice: z.enum(['prepare', 'wait', 'ask', 'notify', 'none']),
  reason: z.string().min(1).max(1600), actionDescription: z.string().min(1).max(600),
  sourceToolCallIds: z.array(id).max(12).optional().describe('本次实际查询返回的 observationId/toolCallId；描述能力、inspect_help和失败结果不是新材料。'),
  basisIds: z.array(id).max(12).optional().describe('仅限inspect_help.basisUses中仍可用的依据使用记录ID；没有使用这种解释时给空数组，不能填原话ID或工具调用ID。'),
  materialEvidenceIds: z.array(id).max(12).optional().describe('机会evidenceIds中实际提供的外部材料ID；不是工具调用ID，也不能用用户的关注许可充当查询材料。'),
  reuseArtifact: z.boolean().optional(),
  artifact: z.object({ title: z.string().min(1).max(160), body: z.string().min(1).max(12000) }).strict().optional(),
  newValue: z.object({ explanation: z.string().min(1).max(1200), evidenceIds: z.array(id).min(1).max(8).describe('支持新价值的真实外部材料ID或sourceToolCallIds中已取得的实际查询ID；用户关注许可本身不是新信息。') }).strict().optional(),
  reconsiderAt: z.string().datetime({ offset: true }).optional(),
  duplicateOf: id.optional(),
}).strict();
export interface HelpSignal {
  bindingId: string; watchId: string; evidenceId: string; category: string;
  title: string; facts: Record<string, unknown>; noveltyKey: string; expiresAt: string;
}
const activeChoices = ['candidate', 'waiting', 'prepared', 'question_ready', 'notification_queued'];

/** One attention decision for all capabilities. Signals cannot notify. Only
 * the responsible assistant may choose value; the host enforces scope and time. */
export class AttentionService {
  constructor(readonly repo: KernelRepository, readonly policy: PolicyKernel, readonly work: WorkService,
    readonly basis: BasisService, readonly cooperation: CooperationService, readonly reminders: ReminderRuntime,
    readonly broker: CapabilityBroker, private preferences?: () => InteractionPreferences) {}

  quietOptional() {
    const rows = this.repo.db.prepare(`SELECT id FROM h_work WHERE owner=? AND workspace=? AND json_extract(payload,'$.data.type')='help_opportunity' AND status IN ('candidate','waiting','prepared','question_ready','notification_queued')`).all(this.repo.identity.principalId, this.repo.identity.workspaceId);
    this.repo.write(() => {
      for (const row of rows) {
        this.reminders.cancel(String(row.id));
        this.repo.db.prepare("UPDATE h_work SET status='stale',revision=revision+1,payload=json_set(payload,'$.status','stale','$.revision',revision+1,'$.data.invalidationReason','quiet_preference') WHERE id=?").run(String(row.id));
      }
    });
  }
  keepPreparedInApp() {
    const scope = this.policy.hostScope();
    for (const record of this.repo.workData(scope, ['help_opportunity'], { statuses: ['notification_queued'], limit: 100 })) {
      this.reminders.cancel(record.id);
      this.work.update(scope, record.id, record.revision, { status: record.data.artifact ? 'prepared' : 'waiting', data: { ...record.data, choice: record.data.artifact ? 'prepare' : 'wait', notificationSuppressedBy: 'in_app_preference' } });
    }
  }

  canNotify(id: string) {
    const scope = this.policy.hostScope(), record = this.repo.work(scope, undefined, id)[0];
    if (!record || record.data.type !== 'help_opportunity' || record.status !== 'notification_queued' ||
      this.rules(scope, String(record.data.bindingId)).some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) return false;
    // A queued decision can become redundant before dispatch. Real display or
    // opening is observed after generation and must be checked at this boundary.
    const exposed = this.cooperation.history(scope, String(record.data.bindingId), 24).some(help =>
      (help.id === record.data.helpRecordId || help.data.basisFingerprint === record.data.fingerprint) &&
      (help.data.displayedAt || help.data.openedAt || help.data.submittedAt));
    if (exposed) {
      this.work.update(scope, record.id, record.revision, { status: 'prepared', data: { ...record.data, choice: 'prepare', notificationSuppressedBy: 'already_exposed' } });
      return false;
    }
    return true;
  }

  migrateLegacyWatches() {
    if (this.repo.getMeta('life_watch_migration_v1', false)) return;
    const rows = this.repo.db.prepare(`SELECT j.id,j.object_id,j.payload,j.status,w.id AS watch_id,w.goal_id,w.payload AS watch_payload
      FROM h_jobs j JOIN h_watches w ON substr(j.object_id,1,length(w.id)+1)=w.id||':'
      WHERE w.owner=? AND w.workspace=? AND j.kind='reminder' AND j.status IN ('queued','leased')`).all(this.repo.identity.principalId, this.repo.identity.workspaceId);
    this.repo.write(() => {
      for (const row of rows) {
        const scope = this.policy.hostScope(), watch = JSON.parse(String(row.watch_payload));
        const evidence = this.repo.dependencies(String(row.object_id)).map(dependency => this.repo.evidence(scope, dependency.producerId)).find(Boolean);
        if (evidence && Date.parse(watch.actionableUntil) > Date.parse(this.repo.clock.now())) this.offer(scope, {
          bindingId: String(row.goal_id), watchId: String(row.watch_id), evidenceId: evidence.id, category: String(watch.eventCategory), title: String(watch.title),
          facts: { legacySignal: true, originalConditionsNeedRecheck: true }, noveltyKey: String(row.object_id), expiresAt: String(watch.actionableUntil),
        });
        // Never reinterpret an ordinary user-created reminder as optional.
        // Only exact legacy watch-owned identities are migrated here.
        this.repo.db.prepare("UPDATE h_jobs SET status='superseded',fence=fence+1,lease_until=NULL WHERE id=?").run(String(row.id));
      }
      this.repo.setMeta('life_watch_migration_v1', { at: this.repo.clock.now(), migrated: rows.length });
    });
  }

  control(handle: ScopeHandle, sessionId: string, raw: z.infer<typeof attentionControlInput>, verified: { publicProbeHash?: string; expiryReview?: { requestedUntil: string; approved: boolean; reason: string }; includeHistory?: boolean } = {}) {
    const input = attentionControlInput.parse(raw);
    if (input.operation === 'read') return { focuses: this.repo.workData(handle, ['attention_focus'], { limit: 24 }), rules: this.rules(handle, input.targetId), helpHistory: verified.includeHistory !== false && input.targetId ? this.cooperation.history(handle, input.targetId) : [] };
    const scope = this.policy.require(handle, 'work:write');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self') throw new HarnessError('attention_scope', '只能在本人现实范围管理自己的关注。');
    if (!input.source?.eventId) throw new HarnessError('source_required', '这项关注控制还没有绑定本轮原话。');
    const source = { eventId: input.source.eventId, quote: input.source.quote };
    const event = this.repo.evidence(handle, source.eventId);
    if (!event || event.speaker !== 'user' || !event.text.includes(source.quote)) throw new HarnessError('source_required', '关注和暂停需要用户原话，不由旧成绩或性格推断。');
    const target = input.targetId ? this.repo.work(handle, undefined, input.targetId)[0] : undefined;
    if (input.targetId && !target) throw new HarnessError('target_missing', '需要先定位受影响的事项。');
    if (target && input.expectedRevision !== undefined && input.expectedRevision !== target.revision) throw new HarnessError('revision_conflict', '事项已经变化，请读取当前版本。');
    if (input.until && Date.parse(input.until) <= Date.parse(this.repo.clock.now())) throw new HarnessError('expired_control', '指定的范围已经结束。');
    if (input.operation === 'follow') {
      if (!input.title || !input.rule || !input.eventCategory || !input.sources?.length) throw new HarnessError('focus_incomplete', '需要明确关注什么、用途、来源和允许的方式。');
      if (input.sources.some(source => !scope.sources.includes(source))) throw new HarnessError('source_forbidden', '关注不能扩大本轮资料范围。');
      if (input.probe) {
        const capability = this.broker.describe(input.probe.capability);
        if (!capability || capability.effect !== 'read' || !input.sources.includes(capability.sourceId) || !capability.requiredScopes.every(grant => scope.grants.includes(grant)))
          throw new HarnessError('probe_forbidden', '后台只能读取此关注已经允许的能力与来源。');
        this.broker.validateArguments(input.probe.capability, input.probe.arguments);
        if (input.probe.capability === 'research.search' && verified.publicProbeHash !== createHash('sha256').update(canonical(input.probe)).digest('hex')) throw new HarnessError('probe_purpose', '公开检索的固定查询词需要单独核对用途，不能把私人背景作为后台检索词。');
      }
      const focus = this.work.create(handle, 'window', input.title, { type: 'attention_focus', sessionId, matterId: input.targetId || null,
        rule: input.rule, until: input.until || null, eventCategory: input.eventCategory, sources: input.sources,
        channel: input.channel || 'in_app', source, probe: input.probe || null, publicProbeHash: verified.publicProbeHash || null,
        nextScanAt: this.repo.clock.now(), lastFingerprint: null, approvedAt: this.repo.clock.now(),
        meaning: '获准的关注，不是用户新目标或行动授权。',
      }, { status: 'active', evidenceIds: [event.id] });
      for (const producerId of [event.id, ...(target ? [target.id] : [])]) this.repo.addDependency(handle, { consumerId: focus.id, producerId, producerRevision: 0, sensitivity: 'privacy', invalidation: 'block' });
      return focus;
    }
    if (input.operation === 'feedback') {
      if (!target || target.data.type !== 'cooperation_record' || !input.rule) throw new HarnessError('feedback_target', '需要选中一次实际帮助并记录明确反馈。');
      return this.cooperation.feedback(handle, target, { ...source, response: input.rule });
    }
    if (input.operation === 'resume') {
      if (!target || target.data.type !== 'attention_rule') throw new HarnessError('rule_required', '请选择要解除的具体限制；不能自动恢复全部旧提醒。');
      return this.work.update(handle, target.id, target.revision, { status: 'inactive', data: { ...target.data, endedBy: source } });
    }
    const ruleText = input.rule || source.quote;
    const rule = this.work.create(handle, 'experience', ruleText.slice(0, 160), {
      type: 'attention_rule', sessionId, matterId: target?.data.type === 'attention_focus' ? target.id : input.targetId || null,
      operation: input.operation, rule: ruleText, until: input.until || null, source,
      ...(verified.expiryReview ? { expiryReview: verified.expiryReview } : {}),
      optionalOnly: true, maximumDisplays: input.operation === 'once' ? 1 : null,
    }, { status: 'active', evidenceIds: [event.id] });
    this.repo.addDependency(handle, { consumerId: rule.id, producerId: event.id, producerRevision: event.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
    const focuses = this.repo.workData(handle, ['attention_focus'], { limit: 100 });
    const controlledBindings = new Set<string>(input.targetId ? [input.targetId] : focuses.map(focus => focus.id));
    for (let pass = 0; pass < focuses.length; pass++) {
      const previousSize = controlledBindings.size;
      for (const focus of focuses) if (controlledBindings.has(String(focus.data.matterId))) controlledBindings.add(focus.id);
      if (previousSize === controlledBindings.size) break;
    }
    // Existing suggestions must also respect a new rule. Explicit independent
    // appointments/reminders are not in this set and remain untouched.
    for (const opportunity of this.repo.workData(handle, ['help_opportunity'], { limit: 100 })) {
      if (input.targetId && !controlledBindings.has(String(opportunity.data.bindingId)) && !controlledBindings.has(String(opportunity.data.matterId))) continue;
      if (!activeChoices.includes(opportunity.status)) continue;
      this.reminders.cancel(opportunity.id);
      this.work.update(handle, opportunity.id, opportunity.revision, { status: input.operation === 'pause' ? 'paused' : input.operation === 'stop' ? 'stale' : 'candidate', data: { ...opportunity.data, invalidationReason: 'attention_rule_changed', ruleId: rule.id, ...(input.operation === 'pause' ? { pausedBy: rule.id } : {}) } });
    }
    if (input.operation === 'stop') {
      for (const focus of focuses) if (controlledBindings.has(focus.id)) {
        const current = this.repo.work(handle, undefined, focus.id)[0];
        if (current && current.status !== 'inactive') this.work.update(handle, current.id, current.revision, { status: 'inactive' });
        this.repo.invalidate(focus.id, 'attention_stopped');
      }
      for (const bindingId of controlledBindings) this.repo.db.prepare("UPDATE h_watches SET status='inactive' WHERE goal_id=?").run(bindingId);
    }
    return rule;
  }

  rules(handle: ScopeHandle, bindingId?: string) {
    const parentId = bindingId ? this.repo.work(handle, undefined, bindingId)[0]?.data.matterId : undefined;
    return this.repo.workData(handle, ['attention_rule'], { statuses: ['active'], limit: 100 }).filter(rule =>
      (!rule.data.matterId || !bindingId || rule.data.matterId === bindingId || rule.data.matterId === parentId) && (!rule.data.until || Date.parse(String(rule.data.until)) > Date.parse(this.repo.clock.now())));
  }

  offer(handle: ScopeHandle, input: HelpSignal) {
    this.expire();
    if (this.preferences?.().initiative === 'quiet') return null;
    const scope = this.policy.validate(handle), event = this.repo.evidence(handle, input.evidenceId), binding = this.repo.work(handle, undefined, input.bindingId)[0];
    if (!event || !binding || binding.status !== 'active' || Date.parse(input.expiresAt) <= Date.parse(this.repo.clock.now())) return null;
    const rules = this.rules(handle, binding.id);
    if (rules.some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) return null;
    if (binding.data.type === 'attention_focus' && !(binding.data.sources as string[]).includes(event.sourceId)) return null;
    const fingerprint = createHash('sha256').update(canonical({ bindingId: binding.id, category: input.category, facts: input.facts })).digest('hex');
    const existing = this.repo.workData(handle, ['help_opportunity'], { matterId: binding.id, limit: 100 });
    if (existing.some(item => item.data.fingerprint === fingerprint && !['stale', 'blocked'].includes(item.status))) return null;
    if (existing.filter(item => activeChoices.includes(item.status)).length >= 5) return null;
    const record = this.work.create(handle, 'window', input.title, { type: 'help_opportunity', matterId: binding.id, bindingId: binding.id, sessionId: String(binding.data.sessionId || ''),
      watchId: input.watchId, category: input.category, facts: z.record(z.string(), z.json()).parse(input.facts), fingerprint, noveltyKey: input.noveltyKey,
      expiresAt: input.expiresAt, channel: binding.data.type === 'attention_focus' ? binding.data.channel : 'in_app',
      scope: { sources: binding.data.type === 'attention_focus' ? binding.data.sources : [event.sourceId], epoch: scope.privacyEpoch, policyRevision: scope.policyRevision },
      basisIds: [], artifact: null, choice: null, modelReason: null,
    }, { status: 'candidate', evidenceIds: [input.evidenceId, ...binding.evidenceIds] });
    for (const producer of [{ id: binding.id, revision: binding.revision }, { id: event.id, revision: event.contentVersion }])
      this.repo.addDependency(handle, { consumerId: record.id, producerId: producer.id, producerRevision: producer.revision, sensitivity: 'privacy', invalidation: 'block' });
    if (typeof input.facts.objectId === 'string' && this.repo.db.prepare('SELECT id FROM h_domain WHERE id=? AND domain=? AND source=? AND owner=? AND workspace=?').get(input.facts.objectId, input.category, event.sourceId, scope.principalId, scope.workspaceId))
      this.repo.addDependency(handle, { consumerId: record.id, producerId: `domain:${input.category}:${input.facts.objectId}`, producerRevision: 0, sensitivity: 'hard', invalidation: 'block' });
    return record;
  }

  pending(handle: ScopeHandle, limit = 5) {
    this.expire();
    if (this.preferences?.().initiative === 'quiet') return [];
    return this.repo.workData(handle, ['help_opportunity'], { statuses: ['candidate', 'waiting'], limit }).filter(item =>
      (!item.data.reconsiderAt || Date.parse(String(item.data.reconsiderAt)) <= Date.parse(this.repo.clock.now())) &&
      !this.rules(handle, String(item.data.bindingId)).some(rule => ['pause', 'stop'].includes(String(rule.data.operation))));
  }

  inspect(handle: ScopeHandle, opportunity: WorkRecord, includeHistory = true) {
    const bindingId = String(opportunity.data.bindingId);
    const parent = this.repo.work(handle, undefined, bindingId)[0]?.data.matterId;
    return { opportunity, basisUses: [...this.basis.read(handle, bindingId), ...(typeof parent === 'string' ? this.basis.read(handle, parent) : [])],
      previousHelp: includeHistory ? this.cooperation.history(handle, bindingId) : [], rules: this.rules(handle, bindingId),
      suppliedMaterialIds: opportunity.evidenceIds.filter(id => this.repo.evidence(handle, id)?.speaker === 'external'),
      delivery: this.reminders.capabilities(), notificationsEnabled: this.reminders.attention().enabled,
      meaning: '信号只是待评机会。考虑新价值、已提供帮助、明确限制与实际可行动窗口；可以只准备、等待、询问或完全不介入。未观察到反馈就未知。' };
  }

  decide(handle: ScopeHandle, raw: z.infer<typeof helpDecisionInput>, observations: { tool: string; result: unknown; toolCallId?: string }[] = []) {
    this.expire();
    const input = helpDecisionInput.parse(raw), opportunity = this.repo.work(handle, undefined, input.id)[0];
    if (!opportunity || opportunity.data.type !== 'help_opportunity' || opportunity.revision !== input.expectedRevision)
      throw new HarnessError('revision_conflict', '这次机会已变，需要按当前条件重新判断。');
    if (!['candidate', 'waiting', 'prepared'].includes(opportunity.status)) throw new HarnessError('opportunity_inactive', '该机会已退出或处理，不能继续旧动作。');
    const bindingId = String(opportunity.data.bindingId), rules = this.rules(handle, bindingId);
    if (rules.some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) throw new HarnessError('attention_paused', '这项可选帮助已暂停。');
    const reused = input.reuseArtifact && opportunity.data.artifact && Array.isArray(opportunity.data.material) && opportunity.data.material.length ? opportunity.data.artifact as { title: string; body: string } : undefined;
    if (input.reuseArtifact && !reused) throw new HarnessError('artifact_missing', '没有实际已准备材料可复用。');
    if (reused) {
      if (input.artifact && canonical(input.artifact) !== canonical(reused)) throw new HarnessError('artifact_changed', '复用只保留原已验证材料；改变内容需要新的实际材料。');
      input.artifact = reused;
    }
    const material = (input.sourceToolCallIds || []).map(callId => observations.find(observation => observation.toolCallId === callId));
    if (material.some(item => !item)) throw new HarnessError('material_not_read', '准备材料必须引用本次真实取得的工具观察。');
    const suppliedIds = [...new Set([...(input.materialEvidenceIds || []), ...(input.newValue?.evidenceIds.filter(id => opportunity.evidenceIds.includes(id)) || [])])];
    const supplied = suppliedIds.map(id => opportunity.evidenceIds.includes(id) ? this.repo.evidence(handle, id) : undefined);
    if (supplied.some(event => !event || event.speaker !== 'external')) throw new HarnessError('material_not_supplied', '只能引用这个机会中实际提供的外部材料；用户的关注许可本身不是查询结果。');
    if (['prepare', 'notify', 'ask'].includes(input.choice) && !input.artifact) throw new HarnessError('artifact_required', '没有真实产物，不能显示已准备。');
    if (input.choice === 'prepare' && !material.length && !supplied.length && !reused) throw new HarnessError('material_not_read', '安静准备须有实际查询或已提供材料。');
    for (const item of material) if (!item || ['inspect_help'].includes(item.tool) || (item.result as any)?.catalogOnly || (item.result as any)?.inputSchema || ['failed', 'forbidden', 'not_connected', 'unknown', 'error'].includes(String((item.result as any)?.status))) throw new HarnessError('material_unavailable', '引用的查询没有取得可用资料；能力说明和机会本身不是新查询材料。');
    const prior = this.cooperation.history(handle, bindingId, 24);
    const displayed = prior.filter(record => record.data.displayedAt || record.data.openedAt || record.data.submittedAt);
    const validNewEvidence = input.newValue?.evidenceIds.every(id => opportunity.evidenceIds.includes(id) && this.repo.evidence(handle, id)?.speaker === 'external' || material.some(item => item?.toolCallId === id));
    if (input.newValue && !validNewEvidence) throw new HarnessError('new_value_evidence', '新的理由只能引用本次已核验材料：' + [...supplied.map(event => event!.id), ...material.map(item => item!.toolCallId!)].join('、'));
    const repeated = displayed.some(record => record.data.basisFingerprint === opportunity.data.fingerprint);
    const duplicate = input.duplicateOf || repeated;
    const onceExhausted = rules.some(rule => rule.data.operation === 'once' && displayed.length >= 1);
    const inAppOnly = this.preferences?.().initiative === 'prepare' && input.choice === 'notify';
    const choice = duplicate || onceExhausted ? 'none' : inAppOnly ? 'prepare' : input.choice;
    if (choice === 'notify' && (!input.newValue || !validNewEvidence)) throw new HarnessError('new_value_required', '主动提醒需要说明当前新价值，并引用实际变化或查询材料。');
    if (choice === 'prepare' && !material.length && !supplied.length && !reused) throw new HarnessError('material_not_read', '应用内准备也必须有实际材料，不能只显示已查好的说法。');
    if (choice === 'notify' && opportunity.data.channel !== 'local_notification') throw new HarnessError('channel_forbidden', '该关注只允许应用内准备，没有通知权限。');
    if (input.reconsiderAt && Date.parse(input.reconsiderAt) <= Date.parse(this.repo.clock.now())) throw new HarnessError('reconsider_time', '等待重评需一个未来时间。');
    const basisRecords = (input.basisIds || []).map(id => this.repo.work(handle, undefined, id)[0]);
    if (basisRecords.some(record => !record || record.data.type !== 'basis_use' || !['supported', 'tentative'].includes(record.status))) throw new HarnessError('basis_inactive', '引用的解释已不适用，需要重评。');
    const parentMatter = this.repo.work(handle, undefined, bindingId)[0]?.data.matterId;
    if (basisRecords.some(record => record!.data.matterId !== bindingId && record!.data.matterId !== parentMatter)) throw new HarnessError('basis_matter_mismatch', '这项解释不属于当前关注的事情。');
    return this.repo.write(() => {
      const status = choice === 'none' ? 'declined' : choice === 'wait' ? 'waiting' : choice === 'ask' ? 'question_ready' : choice === 'notify' ? 'notification_queued' : 'prepared';
      const next = this.work.update(handle, opportunity.id, opportunity.revision, { status, data: { ...opportunity.data, choice,
        modelReason: input.reason, actionDescription: input.actionDescription, basisIds: input.basisIds || [],
        reconsiderAt: input.reconsiderAt || (choice === 'wait' ? new Date(Date.parse(this.repo.clock.now()) + 1800000).toISOString() : null), artifact: ['none', 'wait'].includes(choice) ? null : input.artifact!,
        material: reused ? opportunity.data.material : [...material.map(item => { const result = item!.result as { sourceId?: string; observedAt?: string; fetchedAt?: string }; return { tool: item!.tool, observationId: item!.toolCallId!, resultHash: createHash('sha256').update(canonical(item!.result)).digest('hex'), ...(result.sourceId ? { sourceId: result.sourceId } : {}), observedAt: result.observedAt || result.fetchedAt || this.repo.clock.now() }; }), ...supplied.map(event => ({ evidenceId: event!.id, contentVersion: event!.contentVersion, resultHash: createHash('sha256').update(event!.text).digest('hex') }))],
        duplicateOf: input.duplicateOf || null, newValue: input.newValue || null, decidedAt: this.repo.clock.now(),
      } });
      for (const basis of basisRecords) this.basis.link(handle, basis!, next.id);
      if (['prepare', 'ask', 'notify'].includes(choice)) {
        const help = this.cooperation.record(handle, { opportunityId: next.id, sessionId: String(next.data.sessionId), matterId: bindingId,
          title: input.artifact!.title, reason: input.reason, actionDescription: input.actionDescription,
          basisFingerprint: String(next.data.fingerprint), evidenceIds: next.evidenceIds, sourceIds: (next.data.scope as { sources: string[] }).sources, basisIds: input.basisIds, resultRefs: [next.id] });
        next.data.helpRecordId = help.id;
        this.repo.db.prepare('UPDATE h_work SET payload=? WHERE id=?').run(JSON.stringify(next), next.id);
        if (choice === 'notify') this.reminders.schedule({ id: next.id, title: input.artifact!.title, detail: '', startsAt: this.repo.clock.now() }, undefined, String(next.data.expiresAt), { kind: 'suggestion', producerId: next.id, helpRecordId: help.id });
      }
      return { status: next.status, id: next.id, revision: next.revision, choice, artifactExists: !!next.data.artifact, reason: duplicate ? '同一理由已经提供过帮助，换文案不会重新获得提醒资格。' : onceExhausted ? '这件事只提醒一次的范围已用完。' : inAppOnly ? '当前只保留应用内材料，没有发送通知。' : input.reason };
    });
  }

  expire() {
    this.basis.recheck();
    const now = this.repo.clock.now();
    this.repo.write(() => {
      this.repo.db.prepare(`UPDATE h_work SET status='candidate',revision=revision+1,payload=json_set(payload,'$.status','candidate','$.revision',revision+1,'$.data.reconsiderAt',?)
        WHERE owner=? AND workspace=? AND json_extract(payload,'$.data.type')='help_opportunity' AND status='paused'
        AND julianday(json_extract(payload,'$.data.expiresAt'))>julianday(?)
        AND EXISTS(SELECT 1 FROM h_work rule WHERE rule.id=json_extract(h_work.payload,'$.data.pausedBy') AND (rule.status='inactive' OR julianday(json_extract(rule.payload,'$.data.until'))<=julianday(?)))`)
        .run(now, this.repo.identity.principalId, this.repo.identity.workspaceId, now, now);
      const staleScopes = this.repo.db.prepare(`SELECT id FROM h_work WHERE owner=? AND workspace=? AND json_extract(payload,'$.data.type')='help_opportunity' AND status IN ('candidate','waiting','prepared','question_ready','notification_queued') AND json_extract(payload,'$.data.scope.epoch')!=?`).all(this.repo.identity.principalId, this.repo.identity.workspaceId, this.repo.epoch);
      for (const row of staleScopes) {
        this.reminders.cancel(String(row.id));
        this.repo.db.prepare("UPDATE h_work SET status='stale',revision=revision+1,payload=json_set(payload,'$.status','stale','$.revision',revision+1,'$.data.invalidationReason','privacy_scope_changed','$.data.artifact',NULL) WHERE id=?").run(String(row.id));
      }
      const rows = this.repo.db.prepare(`SELECT id FROM h_work WHERE owner=? AND workspace=? AND json_extract(payload,'$.data.type')='help_opportunity'
        AND status IN ('candidate','waiting','prepared','question_ready','notification_queued') AND julianday(json_extract(payload,'$.data.expiresAt'))<=julianday(?)`).all(this.repo.identity.principalId, this.repo.identity.workspaceId, now);
      for (const row of rows) {
        this.reminders.cancel(String(row.id));
        this.repo.db.prepare("UPDATE h_work SET status='expired',revision=revision+1,payload=json_set(payload,'$.status','expired','$.revision',revision+1,'$.data.artifact',NULL) WHERE id=?").run(String(row.id));
      }
      const focuses = this.repo.db.prepare(`SELECT id FROM h_work WHERE owner=? AND workspace=? AND json_extract(payload,'$.data.type')='attention_focus' AND status='active' AND julianday(json_extract(payload,'$.data.until'))<=julianday(?)`).all(this.repo.identity.principalId, this.repo.identity.workspaceId, now);
      for (const row of focuses) {
        this.repo.invalidate(String(row.id), 'focus_expired');
        this.repo.db.prepare("UPDATE h_work SET status='expired',revision=revision+1,payload=json_set(payload,'$.status','expired','$.revision',revision+1) WHERE id=?").run(String(row.id));
        this.repo.db.prepare("UPDATE h_watches SET status='inactive' WHERE goal_id=?").run(String(row.id));
      }
    });
  }

  available(handle: ScopeHandle, matterId?: string) {
    this.expire();
    return this.repo.workData(handle, ['help_opportunity'], { matterId, statuses: ['prepared', 'question_ready'], limit: 5 }).filter(item => !!item.data.artifact);
  }

  /** At most two consented probes, no broad personal-data polling. */
  async scan(handle: ScopeHandle, signal: AbortSignal) {
    this.expire();
    if (this.preferences?.().initiative === 'quiet' || this.preferences?.().followup === 'on_request') return [];
    const scope = this.policy.validate(handle), result: HelpSignal[] = [];
    for (const focus of this.repo.workData(handle, ['attention_focus'], { statuses: ['active'], limit: 24 }).filter(focus => focus.data.probe && Date.parse(String(focus.data.nextScanAt)) <= Date.parse(this.repo.clock.now())).slice(0, 2)) {
      if (this.rules(handle, focus.id).some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) continue;
      const probe = focus.data.probe as { capability: string; arguments: Record<string, unknown> };
      if (probe.capability === 'research.search' && focus.data.publicProbeHash !== createHash('sha256').update(canonical(probe)).digest('hex')) continue;
      const sources = (focus.data.sources as string[]).filter(source => scope.sources.includes(source));
      const bounded = this.policy.narrow(handle, { sources, infer: false, grants: scope.grants.filter(grant => grant.endsWith(':read')) });
      const observation = await this.broker.invoke(bounded, probe.capability, probe.arguments, signal, { refresh: true, maxCalls: 2 });
      this.policy.validate(handle); signal.throwIfAborted();
      const fingerprint = createHash('sha256').update(canonical({ status: observation.status, data: observation.data, coverage: observation.coverage })).digest('hex');
      this.work.update(handle, focus.id, focus.revision, { data: { ...focus.data, nextScanAt: new Date(Date.parse(this.repo.clock.now()) + 1800000).toISOString(), lastFingerprint: fingerprint } });
      if (focus.data.lastFingerprint === fingerprint || !observation.data || !['fresh', 'partial', 'known_absent'].includes(observation.status)) continue;
      const eventId = randomUUID(), now = this.repo.clock.now();
      const expiresAt = String(focus.data.until || new Date(Date.parse(now) + 86400000).toISOString());
      const event = this.repo.ingest(handle, { id: eventId, ownerId: scope.principalId, workspaceId: scope.workspaceId, subjectId: scope.subjectId, worldId: scope.worldId, sourceId: observation.sourceId,
        contentVersion: 1, text: canonical(observation), speaker: 'external', kind: 'tool_result', authority: 'source_record', roots: [eventId],
        label: { ...personalLabel, infer: false, expiresAt }, receivedAt: now, status: 'active' });
      result.push({ bindingId: focus.id, watchId: 'scan:' + focus.id, evidenceId: event.id, category: String(focus.data.eventCategory), title: focus.title,
        facts: { capability: probe.capability, observation: observation.data }, noveltyKey: fingerprint, expiresAt });
    }
    return result;
  }
}
