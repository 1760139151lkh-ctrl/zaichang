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
import { sceneRefSchema, type SceneRef, type SceneSnapshot } from '../../shared/scenes';
import type { DomainChange } from '../storage/domains';
import { addDate, dateInZone } from './semantics';
import { campusQueryGrants, campusQueryInput, campusResources, validateCampusQuery } from '../capabilities/campus-query';
import { attentionListInput, attentionChangeInput, type AttentionControlItem, type AttentionControlPage, type AttentionChangeInput } from '../../shared/attention-control';

const id = z.string().min(1).max(160);
const citation = z.object({ eventId: id.optional().describe('通常省略，由宿主按quote绑定唯一的本轮用户原话；填写时必须是精确的当前标识，不能用历史来源或猜测标识。'), quote: z.string().min(1).max(3000) }).strict();
export const attentionControlInput = z.object({
  operation: z.enum(['follow', 'pause', 'once', 'avoid', 'stop', 'resume', 'feedback', 'read']),
  targetId: id.optional(), expectedRevision: z.number().int().positive().optional(),
  source: citation.optional(), title: z.string().min(1).max(160).optional(),
  rule: z.string().min(1).max(1200).optional().describe('这一条限制所适用的内容。不同范围或期限的限制分别保存，不把整句的多个限制塞进同一个到期记录。'), until: z.string().datetime({ offset: true }).nullable().optional().describe('只属于当前这一项控制的到期时间。停止某种主动理由而没有明确终点时用null；时限归属有歧义也不自动恢复该主动行为，不借用同句另一项临时暂停的期限。'),
  eventCategory: z.string().min(1).max(80).optional().describe('广义托付可用all；具体类别只是依赖提示，来源内尚未关联的新变化仍交主模型判断。'),
  sources: z.array(id).max(8).optional().describe('托付后续履约实际可读取的来源，不只是首个变化或probe的来源。按rule所需的资料与能力，在当前已获准范围内完整列出；不能承诺产出这些来源无法支持的结果，也不能扩大用户明确的限源。'), channel: z.enum(['in_app', 'local_notification']).optional(),
  wakeAt: z.array(z.string().datetime({ offset: true })).max(16).optional().describe('已知的开放、下课或最后行动节点；到时重评，即使来源没有更新。'),
  probe: z.object({ capability: z.string().max(100), arguments: z.record(z.string(), z.json()), relativeDate: z.object({ argument: z.string().min(1).max(80), offsetDays: z.number().int().min(-1).max(365), timeZone: z.string().max(80) }).strict().optional() }).strict().optional(),
}).strict();
export const helpDecisionInput = z.object({
  id, expectedRevision: z.number().int().positive(),
  choice: z.enum(['prepare', 'wait', 'ask', 'notify', 'none']),
  reason: z.string().min(1).max(1600), actionDescription: z.string().min(1).max(600),
  sourceToolCallIds: z.array(id).max(12).optional().describe('本次实际查询返回的 observationId/toolCallId；描述能力、inspect_help和失败结果不是新材料。'),
  basisIds: z.array(id).max(12).optional().describe('仅限inspect_help.basisUses中仍可用的依据使用记录ID；没有使用这种解释时给空数组，不能填原话ID或工具调用ID。'),
  materialEvidenceIds: z.array(id).max(12).optional().describe('机会evidenceIds中实际提供的外部材料ID；不是工具调用ID，也不能用用户的关注许可充当查询材料。'),
  reuseArtifact: z.boolean().optional(),
  presentInConversation: z.boolean().optional().describe('仅前台prepare/ask：把这份已核验材料绑定当前聊天的真实呈现；宿主记录精确机会版本，实际渲染后才记displayed。'),
  artifact: z.object({ title: z.string().min(1).max(160), body: z.string().min(1).max(12000), sceneRefs: z.array(sceneRefSchema).max(3).optional() }).strict().optional(),
  newValue: z.object({ explanation: z.string().min(1).max(1200), evidenceIds: z.array(id).min(1).max(8).describe('支持新价值的真实外部材料ID或sourceToolCallIds中已取得的实际查询ID；用户关注许可本身不是新信息。') }).strict().optional(),
  reconsiderAt: z.string().datetime({ offset: true }).optional(),
  duplicateOf: id.optional(),
}).strict();
export interface HelpSignal {
  bindingId: string; watchId: string; evidenceId: string; category: string;
  title: string; facts: Record<string, unknown>; noveltyKey: string; expiresAt: string;
}
const activeChoices = ['candidate', 'waiting', 'prepared', 'question_ready', 'notification_queued'];
interface MaterialVersion { kind: 'agenda' | 'work' | 'domain'; id: string; revision: number; sourceId?: string; domain?: string; institutionId?: string; termId?: string; state?: 'present' | 'done' | 'deleted' }
interface MaterialWake { at: string; opportunityId: string; opportunityRevision: number; objectId?: string; kind?: 'wait'; reconsiderAt?: string }
interface MaterialObservation { tool: string; result: unknown; toolCallId?: string; requestedArguments?: unknown }

/** One attention decision for all capabilities. Signals cannot notify. Only
 * the responsible assistant may choose value; the host enforces scope and time. */
export class AttentionService {
  resumeChanges?: (handle: ScopeHandle) => void;
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
    for (const record of this.records(scope, 'help_opportunity', ['notification_queued'])) {
      this.reminders.cancel(record.id);
      this.work.update(scope, record.id, record.revision, { status: record.data.artifact ? 'prepared' : 'waiting', data: { ...record.data, choice: record.data.artifact ? 'prepare' : 'wait', notificationSuppressedBy: 'in_app_preference' } });
    }
  }

  canNotify(id: string) {
    this.expire();
    const scope = this.policy.hostScope(), record = this.repo.work(scope, undefined, id)[0];
    if (!record || record.data.type !== 'help_opportunity' || record.status !== 'notification_queued' ||
      this.rules(scope, String(record.data.bindingId), String((record.data.facts as any)?.objectId || ''), record.id).some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) return false;
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

  /** A paged native management projection, separate from model context and material reads. */
  nativeList(handle: ScopeHandle, raw: unknown = {}): AttentionControlPage {
    const input = attentionListInput.parse(raw || {});
    this.policy.require(handle, 'evidence:read');
    const management = this.managementScope(handle), scope = this.policy.validate(handle);
    const records = this.repo.db.prepare(`SELECT id,revision,status FROM h_work WHERE owner=? AND workspace=? AND subject=?
      AND world='real' AND audience='self' AND source='work:self'
      AND json_extract(payload,'$.data.type') IN ('attention_focus','attention_rule') ORDER BY rowid DESC`)
      .all(scope.principalId, scope.workspaceId, scope.principalId);
    const version = createHash('sha256').update(canonical({ records, epoch: this.repo.epoch, policy: this.repo.policyRevision,
      sources: [...scope.sources].sort(), grants: [...scope.grants].sort() })).digest('hex');
    let offset = 0;
    if (input.cursor) {
      let cursor: { offset: number; version: string };
      try {
        cursor = z.object({ offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), version: z.string() }).strict()
          .parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')));
      } catch { throw new HarnessError('invalid_page', '这页的位置没能找回来，重新翻开列表试试。'); }
      if (cursor.version !== version) throw new HarnessError('attention_list_changed', '这些事有了变化，请重新翻开列表。');
      offset = cursor.offset;
    }
    const page = this.repo.workData(management, ['attention_focus'], { limit: input.limit + 1, offset });
    return { items: page.slice(0, input.limit).map(focus => this.nativeView(handle, focus)),
      nextCursor: page.length > input.limit ? Buffer.from(JSON.stringify({ offset: offset + input.limit, version })).toString('base64url') : null };
  }

  nativeItem(handle: ScopeHandle, focusId: string): AttentionControlItem {
    this.policy.require(handle, 'evidence:read');
    const focus = this.repo.workData(this.managementScope(handle, focusId), ['attention_focus'], { id: focusId, limit: 1 })[0];
    if (!focus) throw new HarnessError('attention_missing', '这件事已经不在这里了，重新看一眼列表吧。');
    return this.nativeView(handle, focus);
  }

  private nativeView(handle: ScopeHandle, focus: WorkRecord): AttentionControlItem {
    const scope = this.policy.validate(handle), rules = this.rules(handle, focus.id), now = Date.parse(this.repo.clock.now());
    const sources = Array.isArray(focus.data.sources) ? focus.data.sources.filter((source): source is string => typeof source === 'string') : [];
    const required = new Set<string>(sources.map(source => source === 'map:local' ? 'map:read' : source === 'weather:open-meteo' ? 'weather:read'
      : source === 'profile:self' ? 'memory:read' : source.startsWith('campus:') ? 'campus:read' : 'evidence:read'));
    const probe = focus.data.probe as { capability?: string } | null;
    if (probe?.capability) for (const grant of this.broker.describe(probe.capability)?.requiredScopes || []) required.add(grant);
    const permitted = sources.every(source => scope.sources.includes(source)) && [...required].every(grant => scope.grants.includes(grant));
    const until = typeof focus.data.until === 'string' ? focus.data.until : null;
    const expired = focus.status === 'expired' || !!until && Date.parse(until) <= now;
    const ended = focus.status !== 'active' || rules.some(rule => rule.data.operation === 'stop');
    const activeParent = this.bindingActive(this.managementScope(handle), focus);
    const pauses = rules.filter(rule => rule.data.operation === 'pause');
    const status: AttentionControlItem['status'] = expired ? 'expired' : ended ? 'ended' : pauses.length ? 'paused'
      : !permitted || !activeParent ? 'unavailable' : 'active';
    const controlVersion = createHash('sha256').update(canonical({ focus: { id: focus.id, revision: focus.revision, status: focus.status },
      rules: rules.map(rule => ({ id: rule.id, revision: rule.revision, operation: rule.data.operation, until: rule.data.until })).sort((a, b) => a.id.localeCompare(b.id)),
      status, activeParent, permitted, epoch: this.repo.epoch, policy: this.repo.policyRevision })).digest('hex');
    return { id: focus.id, title: focus.title, revision: focus.revision, controlVersion, status, sources, until,
      ...(typeof focus.data.sessionId === 'string' && focus.data.sessionId ? { sessionId: focus.data.sessionId } : {}),
      channel: focus.data.channel === 'local_notification' ? 'local_notification' : 'in_app',
      pauseRules: pauses.map(rule => ({ id: rule.id, revision: rule.revision, until: typeof rule.data.until === 'string' ? rule.data.until : null,
        resumable: !expired && !ended && permitted && activeParent && rule.data.matterId === focus.id && !rule.data.targetOpportunityId })),
      canPause: !expired && !ended && activeParent && !pauses.length,
      canStop: !expired && !ended,
      ...(!permitted ? { unavailableReason: 'source_permission' as const } : !activeParent && !expired && !ended ? { unavailableReason: 'parent_inactive' as const } : {}),
    };
  }

  /** Called only after NativeControls records this exact user click as new evidence. */
  nativeChange(handle: ScopeHandle, raw: AttentionChangeInput, source: { eventId: string; quote: string }): AttentionControlItem {
    const input = attentionChangeInput.parse(raw), item = this.nativeItem(handle, input.id);
    if (item.revision !== input.expectedRevision || item.controlVersion !== input.expectedControlVersion)
      throw new HarnessError('revision_conflict', '这件事有了变化，先看看现在的约定再决定。');
    if (input.operation === 'resume') {
      const rule = item.pauseRules.find(rule => rule.id === input.ruleId && rule.revision === input.ruleRevision);
      if (!rule?.resumable) throw new HarnessError('attention_not_resumable', '这次暂停现在不能解除。回到对话，我们重新看看原来的约定。');
      this.control(handle, '', { operation: 'resume', targetId: rule.id, expectedRevision: rule.revision, source });
    } else {
      if (!(input.operation === 'pause' ? item.canPause : item.canStop))
        throw new HarnessError('attention_ended', '这件事已经停下了，原来的约定不会重新开始。');
      this.control(handle, '', { operation: input.operation, targetId: item.id, expectedRevision: item.revision, source });
    }
    return this.nativeItem(handle, input.id);
  }

  control(handle: ScopeHandle, sessionId: string, raw: z.infer<typeof attentionControlInput>, verified: { publicProbeHash?: string; expiryReview?: { requestedUntil: string; approved: boolean; reason: string }; includeHistory?: boolean; parentFocus?: string } = {}) {
    const input = attentionControlInput.parse(raw);
    if (input.operation === 'read') {
      this.policy.require(handle, 'evidence:read');
      const management = this.managementScope(handle);
      return { focuses: this.repo.workData(management, ['attention_focus'], { limit: 24 }).map(record => this.controlMetadata(record)),
        rules: this.rules(handle, input.targetId).map(record => this.controlMetadata(record)), helpHistory: [],
        meaning: '这里只提供本人关注控制的标识、版本、状态和范围；不读取旧聊天原话、人物资料或准备正文。' };
    }
    const scope = this.policy.require(handle, 'work:write');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self') throw new HarnessError('attention_scope', '只能在本人现实范围管理自己的关注。');
    if (!input.source?.eventId) throw new HarnessError('source_required', '这项关注控制还没有绑定本轮原话。');
    const source = { eventId: input.source.eventId, quote: input.source.quote };
    const event = this.repo.evidence(handle, source.eventId);
    if (!event || event.speaker !== 'user' || !event.text.includes(source.quote)) throw new HarnessError('source_required', '关注和暂停需要用户原话，不由旧成绩或性格推断。');
    const management = this.managementScope(handle);
    const managedTarget = input.targetId ? this.repo.work(this.managementScope(handle, input.targetId), undefined, input.targetId)[0] : undefined;
    const target = input.targetId ? this.repo.work(handle, undefined, input.targetId)[0] ||
      (managedTarget && ['attention_focus', 'attention_rule', 'help_opportunity'].includes(String(managedTarget.data.type)) ? managedTarget : undefined) : undefined;
    if (input.targetId && !target) throw new HarnessError('target_missing', '需要先定位受影响的事项。');
    if (target && input.expectedRevision !== undefined && input.expectedRevision !== target.revision) throw new HarnessError('revision_conflict', '事项已经变化，请读取当前版本。');
    if (input.until && Date.parse(input.until) <= Date.parse(this.repo.clock.now())) throw new HarnessError('expired_control', '指定的范围已经结束。');
    if (input.operation === 'follow') {
      if (!input.title || !input.rule || !input.sources?.length) throw new HarnessError('focus_incomplete', '需要明确关注什么、用途、来源和允许的方式。');
      if (input.sources.some(source => !scope.sources.includes(source))) throw new HarnessError('source_forbidden', '关注不能扩大本轮资料范围。');
      if (verified.parentFocus && (!target || target.id !== verified.parentFocus || target.data.type !== 'attention_focus' || !this.bindingActive(handle, target) ||
        input.sources.some(source => !(target.data.sources as string[]).includes(source)) ||
        (input.channel === 'local_notification' && target.data.channel !== 'local_notification') ||
        (target.data.until && (!input.until || Date.parse(input.until) > Date.parse(String(target.data.until)))) || !target.evidenceIds.includes(event.id)))
        throw new HarnessError('focus_scope', '派生关注只能沿用仍有效托付的来源、期限和渠道。');
      if (input.wakeAt?.some(at => Date.parse(at) <= Date.parse(this.repo.clock.now()) || input.until && Date.parse(at) >= Date.parse(input.until))) throw new HarnessError('wake_time', '唤醒节点须在当前托付的未来有效期内。');
      if (input.probe) {
        const capability = this.broker.describe(input.probe.capability);
        if (!capability || capability.effect !== 'read' || !input.sources.includes(capability.sourceId) || !capability.requiredScopes.every(grant => scope.grants.includes(grant)))
          throw new HarnessError('probe_forbidden', '后台只能读取此关注已经允许的能力与来源。');
        this.broker.validateArguments(input.probe.capability, this.probeArguments(input.probe));
        if (input.probe.capability === 'research.search' && verified.publicProbeHash !== createHash('sha256').update(canonical(input.probe)).digest('hex')) throw new HarnessError('probe_purpose', '公开检索的固定查询词需要单独核对用途，不能把私人背景作为后台检索词。');
      }
      const focusId = 'focus:' + createHash('sha256').update(canonical({ eventId: event.id, ...input })).digest('hex');
      const existing = this.repo.work(handle, undefined, focusId)[0];
      if (existing) return existing;
      const focus = this.work.create(handle, 'window', input.title, { type: 'attention_focus', sessionId, matterId: input.targetId || null,
        rule: input.rule, governingRule: verified.parentFocus ? target!.data.rule : input.rule, until: input.until || null, eventCategory: input.eventCategory || 'all', sources: input.sources,
        channel: input.channel || 'in_app', source, probe: input.probe || null, publicProbeHash: verified.publicProbeHash || null,
        wakeAt: [...new Set(input.wakeAt || [])].sort(), completedWakes: [], discoveryPending: true,
        nextScanAt: this.repo.clock.now(), lastFingerprint: null, approvedAt: this.repo.clock.now(),
        meaning: '获准的关注，不是用户新目标或行动授权。',
      }, { id: focusId, status: 'active', evidenceIds: [event.id] });
      for (const producerId of [event.id, ...(target ? [target.id] : [])]) this.repo.addDependency(handle, { consumerId: focus.id, producerId, producerRevision: 0, sensitivity: 'privacy', invalidation: 'block' });
      return focus;
    }
    if (input.operation === 'feedback') {
      if (!target || target.data.type !== 'cooperation_record' || !input.rule) throw new HarnessError('feedback_target', '需要选中一次实际帮助并记录明确反馈。');
      return this.cooperation.feedback(handle, target, { ...source, response: input.rule });
    }
    if (input.operation === 'resume') {
      if (!target || target.data.type !== 'attention_rule') throw new HarnessError('rule_required', '请选择要解除的具体限制；不能自动恢复全部旧提醒。');
      return this.controlMetadata(this.work.update(management, target.id, target.revision, { status: 'inactive', data: { ...target.data, endedBy: source } }));
    }
    const ruleText = input.rule || source.quote;
    const rule = this.work.create(handle, 'experience', ruleText.slice(0, 160), {
      type: 'attention_rule', sessionId, matterId: target?.data.type === 'attention_focus' ? target.id : input.targetId || null,
      operation: input.operation, rule: ruleText, until: input.until || null, source,
      ...(target?.data.type === 'help_opportunity' ? { targetOpportunityId: target.id, targetBindingId: target.data.bindingId,
        targetObjectId: (target.data.facts as { objectId?: string })?.objectId || null } : {}),
      ...(verified.expiryReview ? { expiryReview: verified.expiryReview } : {}),
      optionalOnly: true, maximumDisplays: input.operation === 'once' ? 1 : null,
    }, { status: 'active', evidenceIds: [event.id] });
    this.repo.addDependency(handle, { consumerId: rule.id, producerId: event.id, producerRevision: event.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
    const focuses = this.records(management, 'attention_focus');
    const controlledBindings = new Set<string>(input.targetId ? [input.targetId] : focuses.map(focus => focus.id));
    for (let pass = 0; pass < focuses.length; pass++) {
      const previousSize = controlledBindings.size;
      for (const focus of focuses) if (controlledBindings.has(String(focus.data.matterId))) controlledBindings.add(focus.id);
      if (previousSize === controlledBindings.size) break;
    }
    // Existing suggestions must also respect a new rule. Explicit independent
    // appointments/reminders are not in this set and remain untouched.
    for (const opportunity of this.records(management, 'help_opportunity')) {
      if (input.targetId && opportunity.id !== input.targetId && !controlledBindings.has(String(opportunity.data.bindingId)) && !controlledBindings.has(String(opportunity.data.matterId))) continue;
      if (!activeChoices.includes(opportunity.status)) continue;
      this.reminders.cancel(opportunity.id);
      this.work.update(management, opportunity.id, opportunity.revision, { status: input.operation === 'pause' ? 'paused' : input.operation === 'stop' ? 'stale' : 'candidate', data: { ...opportunity.data, invalidationReason: 'attention_rule_changed', ruleId: rule.id, ...(input.operation === 'stop' ? { artifact: null } : {}), ...(input.operation === 'pause' ? { pausedBy: rule.id } : {}) } });
    }
    if (input.operation === 'stop') {
      for (const focus of focuses) if (controlledBindings.has(focus.id)) {
        const current = this.repo.work(management, undefined, focus.id)[0];
        if (current && current.status !== 'inactive') this.work.update(management, current.id, current.revision, { status: 'inactive' });
        this.repo.invalidate(focus.id, 'attention_stopped');
      }
      for (const bindingId of controlledBindings) this.repo.db.prepare("UPDATE h_watches SET status='inactive' WHERE goal_id=?").run(bindingId);
    }
    return rule;
  }

  rules(handle: ScopeHandle, bindingId?: string, objectId?: string, opportunityId?: string) {
    const scope = this.policy.validate(handle);
    if (!this.ownerControlScope(scope)) return [];
    const management = this.managementScope(handle);
    const ancestors = new Set<string>();
    let cursor = bindingId;
    while (cursor && !ancestors.has(cursor)) {
      ancestors.add(cursor);
      const managed = this.repo.work(management, undefined, cursor)[0];
      const parent = (managed && ['attention_focus', 'attention_rule', 'help_opportunity'].includes(String(managed.data.type)) ? managed : this.repo.work(handle, undefined, cursor)[0])?.data.matterId;
      cursor = typeof parent === 'string' ? parent : undefined;
    }
    return this.records(management, 'attention_rule', ['active']).filter(rule =>
      (!bindingId || (rule.data.targetOpportunityId
        ? rule.data.targetOpportunityId === opportunityId || !!objectId && rule.data.targetObjectId === objectId && ancestors.has(String(rule.data.targetBindingId))
        : !rule.data.matterId || ancestors.has(String(rule.data.matterId)))) && (!rule.data.until || Date.parse(String(rule.data.until)) > Date.parse(this.repo.clock.now())))
      .map(rule => scope.sources.includes('history:self') && this.repo.work(handle, undefined, rule.id)[0] || this.controlMetadata(rule));
  }

  private ownerControlScope(scope: ReturnType<PolicyKernel['validate']>) {
    return scope.principalId === this.repo.identity.principalId && scope.workspaceId === this.repo.identity.workspaceId &&
      scope.subjectId === scope.principalId && scope.worldId === 'real' && scope.audience === 'self' && !scope.child;
  }

  /** Host-only authority over existing attention controls. It admits exact
   * provenance IDs for validation, never history/profile sources or a model
   * context. Ordinary material reads keep their original scope. */
  private managementScope(handle: ScopeHandle, targetId?: string) {
    const scope = this.policy.validate(handle);
    if (!this.ownerControlScope(scope)) throw new HarnessError('attention_scope', '只能管理本人现实私有范围的关注控制。');
    const rows = this.repo.db.prepare(`SELECT id,purpose,json_extract(payload,'$.evidenceIds') AS evidence_ids FROM h_work
      WHERE owner=? AND workspace=? AND subject=? AND world='real' AND audience='self' AND source='work:self'
      AND json_extract(payload,'$.data.type') IN ('attention_focus','attention_rule','help_opportunity') ${targetId ? 'AND id=?' : ''}`)
      .all(scope.principalId, scope.workspaceId, scope.principalId, ...(targetId ? [targetId] : []));
    return this.policy.hostScope({ sources: ['work:self'], currentEventIds: [...new Set([...scope.currentEventIds, ...rows.flatMap(row => JSON.parse(String(row.evidence_ids || '[]')) as string[])])],
      purposes: [...new Set([...scope.purposes, ...rows.map(row => String(row.purpose))])], grants: scope.grants, retention: scope.retention, infer: false });
  }

  private controlMetadata(record: WorkRecord): WorkRecord {
    const data = record.data, selected: WorkRecord['data'] = { type: data.type!, controlMetadataOnly: true };
    for (const key of ['matterId', 'bindingId', 'operation', 'until', 'channel', 'sources', 'targetOpportunityId', 'targetBindingId', 'targetObjectId', 'maximumDisplays'])
      if (data[key] !== undefined) selected[key] = data[key];
    let title = data.type === 'attention_focus' ? record.title : '可选帮助';
    if (data.type === 'attention_rule') {
      const labels: Record<string, string> = { pause: '暂停', stop: '停止', once: '只提醒一次', avoid: '主动依据限制' };
      const targetId = data.targetBindingId || data.matterId;
      const target = typeof targetId === 'string' ? this.repo.db.prepare(`SELECT title FROM h_work WHERE id=? AND owner=? AND workspace=? AND subject=? AND world='real' AND audience='self' AND source='work:self' AND json_extract(payload,'$.data.type')='attention_focus'`)
        .get(targetId, record.ownerId, record.workspaceId, record.ownerId) : undefined;
      title = (labels[String(data.operation)] || '关注限制') + (target ? ' · ' + String(target.title) : typeof targetId === 'string' ? ' · ' + targetId : ' · 全部关注');
    }
    return { ...record, title, evidenceIds: [], data: selected };
  }

  private records(handle: ScopeHandle, type: string, statuses?: string[]) {
    const records: WorkRecord[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = this.repo.workData(handle, [type], { statuses, limit: 100, offset });
      records.push(...page);
      if (page.length < 100) return records;
    }
  }

  private bindingActive(handle: ScopeHandle, binding: WorkRecord, visited = new Set<string>()): boolean {
    if (binding.status !== 'active' || visited.has(binding.id) || binding.data.until && Date.parse(String(binding.data.until)) <= Date.parse(this.repo.clock.now())) return false;
    visited.add(binding.id);
    if (binding.data.type !== 'attention_focus' || !binding.data.matterId) return true;
    const parent = this.repo.work(handle, undefined, String(binding.data.matterId))[0];
    return !!parent && this.bindingActive(handle, parent, visited);
  }

  private noteCurrent(id: string, revision: number, state = 'active') {
    if (!this.repo.db.prepare("SELECT name FROM sqlite_master WHERE name='h_notes'").get()) return false;
    const note = this.repo.db.prepare('SELECT revision,state FROM h_notes WHERE id=? AND owner=? AND workspace=?').get(id, this.repo.identity.principalId, this.repo.identity.workspaceId);
    return !!note && Number(note.revision) === revision && note.state === state;
  }

  private materialVersions(result: unknown): MaterialVersion[] {
    const value = result as { sourceId?: string; data?: any }, data = value?.data;
    if (!data) return [];
    const list = (items: unknown): any[] => Array.isArray(items) ? items : [];
    const versions: MaterialVersion[] = list(data.materialVersions).map(version => version?.kind === 'domain' && version.sourceId === 'local-agenda' && version.domain === 'agenda'
      ? { kind: 'agenda', id: version.id, revision: version.revision } : version);
    if ((value.sourceId || data.sourceId) === 'local-agenda' && data.domain === 'agenda' && typeof data.objectId === 'string' && Number.isSafeInteger(data.revision))
      versions.push({ kind: 'agenda', id: data.objectId, revision: data.revision, state: data.operation === 'tombstone' ? 'deleted' : data.value?.done ? 'done' : 'present' });
    const agenda = value.sourceId === 'local-agenda' ? [ ...list(data.items), ...list(data.busy), ...list(data.pending), ...list(data.acceptedMovable),
      ...list(data.alternatives).flatMap((item: any) => item.before ? [item.before] : []) ] : list(data.localAgenda?.items);
    for (const item of agenda) if (typeof item?.id === 'string') versions.push({ kind: 'agenda', id: item.sourceActionId || item.seriesId || item.id, revision: item.revision || 1 });
    for (const item of [...list(data.goals), ...list(data.commitments)]) if (typeof item?.id === 'string' && Number.isSafeInteger(item.revision)) versions.push({ kind: 'work', id: item.id, revision: item.revision });
    for (const group of list(data.campus)) for (const item of list(group.records)) if (typeof item?.id === 'string' && Number.isSafeInteger(item.revision)) versions.push({ kind: 'domain', id: item.id, revision: item.revision,
      sourceId: item.sourceId, domain: item.domain || group.domain, institutionId: item.institutionId, termId: item.termId });
    return [...new Map(versions.map(version => [canonical(version), version])).values()];
  }

  private evidenceVersions(event: { sourceId: string; text: string }) {
    try { return this.materialVersions({ sourceId: event.sourceId, data: JSON.parse(event.text) }); }
    catch { return []; }
  }

  private versionsCurrent(handle: ScopeHandle, versions: MaterialVersion[]) {
    const scope = this.policy.validate(handle);
    return versions.every(version => {
      if (!Number.isSafeInteger(version.revision) || version.revision < 1) return false;
      if (version.kind === 'work') return this.repo.work(handle, undefined, version.id)[0]?.revision === version.revision;
      if (version.kind === 'agenda') {
        if (!scope.sources.includes('local-agenda')) return false;
        const row = this.repo.db.prepare("SELECT COALESCE(json_extract(payload,'$.revision'),1) AS revision,COALESCE(json_extract(payload,'$.done'),0) AS done FROM agenda WHERE id=?").get(version.id);
        if (version.state === 'deleted') return !row && Number(this.repo.db.prepare('SELECT max(revision) AS revision FROM h_calendar_versions WHERE agenda_id=?').get(version.id)?.revision || 0) === version.revision;
        return !!row && Number(row.revision) === version.revision && (version.state === 'done' ? !!row.done : !row.done);
      }
      if (version.kind !== 'domain' || !version.sourceId || !scope.sources.includes(version.sourceId)) return false;
      const f = this.repo.filter(handle);
      const row = this.repo.db.prepare(`SELECT revision,status FROM h_domain r WHERE ${f.sql} AND id=? AND source=? AND domain=? AND institution=? AND term=?`)
        .get(...f.params, version.id, version.sourceId, String(version.domain), String(version.institutionId), String(version.termId));
      return !!row && Number(row.revision) === version.revision && row.status !== 'known_absent';
    });
  }

  private observationSources(observation: { tool: string; result: unknown }) {
    const sources = new Set<string>();
    const visit = (value: unknown) => {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === 'sourceId' && typeof child === 'string') sources.add(child);
        else if (key === 'sourceIds' && Array.isArray(child)) { for (const source of child) if (typeof source === 'string') sources.add(source); }
        else visit(child);
      }
    };
    visit(observation.result);
    if (observation.tool === 'manage_note') sources.add('notes:self');
    if (observation.tool === 'resolve_time') sources.add('current');
    if (!sources.size) throw new HarnessError('material_source_unknown', '实际查询未保留可核对的材料来源，不能据此保存或展示准备。');
    return [...sources];
  }

  private storedMaterialSources(handle: ScopeHandle, record: WorkRecord) {
    const sources = new Set<string>(Array.isArray(record.data.sourceIds) ? record.data.sourceIds.filter((source): source is string => typeof source === 'string') : []);
    for (const material of Array.isArray(record.data.material) ? record.data.material : []) {
      const value = material as { sourceId?: string; sourceIds?: string[]; noteId?: string; tool?: string; evidenceId?: string };
      if (typeof value.sourceId === 'string') sources.add(value.sourceId);
      for (const source of value.sourceIds || []) if (typeof source === 'string') sources.add(source);
      if (value.noteId || value.tool === 'manage_note') sources.add('notes:self');
      if (value.evidenceId) { const event = this.repo.evidence(handle, value.evidenceId); if (event) sources.add(event.sourceId); }
    }
    for (const id of record.evidenceIds) { const event = this.repo.evidence(handle, id); if (event?.speaker === 'external') sources.add(event.sourceId); }
    return [...sources];
  }

  private campusMaterialGrants(domain: string): string[] | undefined {
    const aliases: Record<string, string> = { schedule: 'classes', learning_courses: 'courses', assignments: 'todos',
      gpa: 'gpa_overall', card: 'card_accounts', profile: 'student_profile', practice: 'practice_summary', sports: 'projects' };
    if (domain === 'places' || domain === 'rules') return [];
    const resource = aliases[domain] || domain;
    return (campusResources as readonly string[]).includes(resource)
      ? campusQueryGrants(validateCampusQuery({ operation: 'quick', resource })) : undefined;
  }

  private materialGrants(observation: MaterialObservation, sources: string[]) {
    const required = new Set<string>(sources.map(source => source === 'map:local' ? 'map:read' : source === 'weather:open-meteo' ? 'weather:read'
      : source === 'profile:self' ? 'memory:read' : source.startsWith('campus:') ? 'campus:read' : 'evidence:read'));
    const args = observation.requestedArguments as Record<string, any> | undefined;
    const capability = observation.tool === 'look_up' ? args?.capability || (args?.source === 'campus' ? args.mode === 'overview' ? 'campus.overview' : 'campus.lookup' : undefined) : observation.tool;
    for (const grant of capability ? this.broker.describe(capability)?.requiredScopes || [] : []) required.add(grant);
    if (!sources.some(source => source.startsWith('campus:'))) return [...required];
    let known = false;
    const domain = (name: unknown) => {
      if (typeof name !== 'string') return;
      const grants = this.campusMaterialGrants(name);
      if (!grants) throw new HarnessError('material_permission_unknown', '校园材料的具体类别缺少可核对权限，不能保存或展示旧正文。');
      known = true; grants.forEach(grant => required.add(grant));
    };
    const input = { ...args, ...(args?.arguments || {}) };
    if (capability === 'campus.query') {
      const query = validateCampusQuery(Object.fromEntries(Object.entries(input).filter(([key]) => key in campusQueryInput.shape)));
      campusQueryGrants(query).forEach(grant => required.add(grant)); known = true;
    } else if (capability === 'campus.lookup' || capability === 'campus.imported_lookup') domain(input.domain);
    else if (capability === 'campus.overview') {
      known = true;
      if (input.includeSensitiveDomains) for (const name of campusResources) this.campusMaterialGrants(name)!.forEach(grant => required.add(grant));
    }
    const data = (observation.result as { data?: any } | undefined)?.data;
    domain(data?.domain);
    for (const item of Array.isArray(data?.domains) ? data.domains : []) domain(item.domain);
    for (const group of Array.isArray(data?.campus) ? data.campus : []) {
      domain(group.domain);
      for (const item of Array.isArray(group.records) ? group.records : []) domain(item.domain);
    }
    for (const version of this.materialVersions(observation.result)) if (version.kind === 'domain' && (!version.sourceId || version.sourceId.startsWith('campus:'))) domain(version.domain);
    if (!known) throw new HarnessError('material_permission_unknown', '校园材料没有保留具体查询类别或权限依据，需要重新读取后准备。');
    return [...required];
  }

  /** Unrelated source changes remain evidence, not instructions. The same
   * assistant evaluates them against the user's broad rule; no topic lexicon. */
  discover(handle: ScopeHandle, change: DomainChange) {
    if (this.preferences?.().initiative === 'quiet') return true;
    let accepted = true;
    for (const focus of this.records(handle, 'attention_focus', ['active'])) {
      if (!this.bindingActive(handle, focus) || !(focus.data.sources as string[]).includes(change.sourceId)) continue;
      const rules = this.rules(handle, focus.id, change.objectId);
      if (rules.some(rule => rule.data.operation === 'stop')) continue;
      if (rules.some(rule => rule.data.operation === 'pause')) { accepted = false; continue; }
      const facts = { objectId: change.objectId, operation: change.operation, revision: change.revision, value: change.value, observedAt: change.observedAt, discovery: 'source_change_within_mandate' };
      const offered = this.offer(handle, { bindingId: focus.id, watchId: 'discovery:' + focus.id, evidenceId: change.eventId, category: change.domain, title: focus.title,
        facts, noveltyKey: change.eventId, expiresAt: String(focus.data.until || new Date(Date.parse(this.repo.clock.now()) + 7 * 86400000).toISOString()) });
      if (!offered && !this.records(handle, 'help_opportunity').some(item => item.data.bindingId === focus.id && item.data.noveltyKey === change.eventId)) accepted = false;
    }
    return accepted;
  }

  acceptSignal(handle: ScopeHandle, input: HelpSignal) {
    const opportunity = this.offer(handle, input);
    if (opportunity) return { opportunity, acknowledged: true };
    const event = this.repo.evidence(handle, input.evidenceId), binding = this.repo.work(handle, undefined, input.bindingId)[0];
    if (event && binding && this.bindingActive(handle, binding) && this.rules(handle, binding.id, String(input.facts.objectId || '')).some(rule => rule.data.operation === 'pause'))
      return { opportunity: null, acknowledged: false };
    if (this.preferences?.().initiative === 'quiet' || !event || !binding || !this.bindingActive(handle, binding) || Date.parse(input.expiresAt) <= Date.parse(this.repo.clock.now()) ||
      this.rules(handle, binding.id, String(input.facts.objectId || '')).some(rule => ['pause', 'stop'].includes(String(rule.data.operation))) ||
      binding.data.type === 'attention_focus' && !(binding.data.sources as string[]).includes(event.sourceId) && !binding.evidenceIds.includes(event.id)) return { opportunity: null, acknowledged: true };
    const fingerprint = createHash('sha256').update(canonical({ bindingId: binding.id, category: input.category, facts: input.facts })).digest('hex');
    return { opportunity: null, acknowledged: this.records(handle, 'help_opportunity').some(item => item.data.bindingId === binding.id &&
      (item.data.noveltyKey === input.noveltyKey || item.data.fingerprint === fingerprint) && !['stale', 'blocked'].includes(item.status)) };
  }

  offer(handle: ScopeHandle, input: HelpSignal) {
    this.expire();
    if (this.preferences?.().initiative === 'quiet') return null;
    const scope = this.policy.validate(handle), event = this.repo.evidence(handle, input.evidenceId), binding = this.repo.work(handle, undefined, input.bindingId)[0];
    if (!event || !binding || !this.bindingActive(handle, binding) || Date.parse(input.expiresAt) <= Date.parse(this.repo.clock.now())) return null;
    const rules = this.rules(handle, binding.id, String(input.facts.objectId || ''));
    if (rules.some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) return null;
    if (binding.data.type === 'attention_focus' && !(binding.data.sources as string[]).includes(event.sourceId) && !binding.evidenceIds.includes(event.id)) return null;
    const fingerprint = createHash('sha256').update(canonical({ bindingId: binding.id, category: input.category, facts: input.facts })).digest('hex');
    const existing = this.records(handle, 'help_opportunity').filter(item => item.data.bindingId === binding.id);
    if (existing.some(item => (item.data.noveltyKey === input.noveltyKey || item.data.fingerprint === fingerprint) && !['stale', 'blocked'].includes(item.status))) return null;
    // Limit undecided semantic work. Already prepared materials must not hold
    // the source queue hostage until the whole mandate expires.
    if (existing.filter(item => ['candidate', 'waiting'].includes(item.status)).length >= 5) return null;
    let signalGrants: string[] | undefined;
    if (event.speaker === 'external') {
      let data: unknown;
      try { data = JSON.parse(event.text); } catch { data = undefined; }
      try { signalGrants = this.materialGrants({ tool: 'supplied_evidence', result: { data } }, [event.sourceId]); }
      catch (error) { if (!(error instanceof HarnessError) || error.code !== 'material_permission_unknown') throw error; }
    }
    const record = this.work.create(handle, 'window', input.title, { type: 'help_opportunity', matterId: binding.id, bindingId: binding.id, sessionId: String(binding.data.sessionId || ''),
      watchId: input.watchId, category: input.category, facts: z.record(z.string(), z.json()).parse(input.facts), fingerprint, noveltyKey: input.noveltyKey,
      expiresAt: input.expiresAt, channel: binding.data.type === 'attention_focus' ? binding.data.channel : 'in_app',
      scope: { sources: binding.data.type === 'attention_focus' ? binding.data.sources : [event.sourceId], epoch: scope.privacyEpoch, policyRevision: scope.policyRevision },
      sourceIds: event.speaker === 'external' ? [event.sourceId] : [],
      ...(signalGrants ? { materialGrantContractVersion: 1, requiredGrants: signalGrants } : {}),
      basisIds: [], artifact: null, choice: null, modelReason: null,
    }, { status: 'candidate', evidenceIds: [input.evidenceId, ...binding.evidenceIds] });
    for (const producer of [{ id: binding.id, revision: binding.revision }, { id: event.id, revision: event.contentVersion }])
      this.repo.addDependency(handle, { consumerId: record.id, producerId: producer.id, producerRevision: producer.revision, sensitivity: 'privacy', invalidation: 'block' });
    if (typeof input.facts.objectId === 'string' && this.repo.db.prepare('SELECT id FROM h_domain WHERE id=? AND domain=? AND source=? AND owner=? AND workspace=?').get(input.facts.objectId, input.category, event.sourceId, scope.principalId, scope.workspaceId))
      this.repo.addDependency(handle, { consumerId: record.id, producerId: `domain:${input.category}:${input.facts.objectId}`, producerRevision: 0, sensitivity: 'hard', invalidation: 'block' });
    if (event.sourceId === 'local-agenda' && input.category === 'agenda' && typeof input.facts.objectId === 'string' && Number.isSafeInteger(input.facts.revision))
      this.repo.addDependency(handle, { consumerId: record.id, producerId: this.repo.calendarVersionId(input.facts.objectId, Number(input.facts.revision)), producerRevision: Number(input.facts.revision), sensitivity: 'hard', invalidation: 'block' });
    return record;
  }

  pending(handle: ScopeHandle, limit = 5) {
    this.expire();
    if (this.preferences?.().initiative === 'quiet' || this.preferences?.().followup === 'on_request') return [];
    const all = this.records(handle, 'help_opportunity');
    const lastReviewed = new Map<string, number>();
    for (const item of all) {
      const at = Date.parse(String(item.data.lastReviewAt || item.data.decidedAt || ''));
      if (Number.isFinite(at)) lastReviewed.set(String(item.data.bindingId), Math.max(lastReviewed.get(String(item.data.bindingId)) || 0, at));
    }
    return this.records(handle, 'help_opportunity', ['candidate', 'waiting']).filter(item =>
      (!item.data.reconsiderAt || Date.parse(String(item.data.reconsiderAt)) <= Date.parse(this.repo.clock.now())) &&
      !this.rules(handle, String(item.data.bindingId), String((item.data.facts as any)?.objectId || ''), item.id).some(rule => ['pause', 'stop'].includes(String(rule.data.operation))))
      .sort((a, b) => {
        const now = Date.parse(this.repo.clock.now());
        // A near expiry is an actual host deadline, not a model-generated
        // importance score. Otherwise rotate mandates so a noisy source
        // cannot occupy every available semantic review turn.
        const urgent = (item: WorkRecord) => Date.parse(String(item.data.expiresAt)) <= now + 300000;
        if (urgent(a) !== urgent(b)) return urgent(a) ? -1 : 1;
        if (urgent(a)) return Date.parse(String(a.data.expiresAt)) - Date.parse(String(b.data.expiresAt));
        return (lastReviewed.get(String(a.data.bindingId)) || 0) - (lastReviewed.get(String(b.data.bindingId)) || 0)
          || Date.parse(String(a.data.recordedAt)) - Date.parse(String(b.data.recordedAt));
      }).slice(0, limit);
  }

  /** Persist retry timing for BOTH new and previously waiting work. A late
   * failure cannot overwrite a newer decision, cancellation or correction. */
  settleReview(handle: ScopeHandle, original: WorkRecord, error?: unknown) {
    const current = this.repo.work(handle, undefined, original.id)[0];
    if (!current || current.revision !== original.revision || !['candidate', 'waiting'].includes(current.status)) return;
    const binding = this.repo.work(handle, undefined, String(current.data.bindingId))[0];
    if (!binding || !this.bindingActive(handle, binding) ||
      this.rules(handle, binding.id, String((current.data.facts as any)?.objectId || ''), current.id).some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) return;
    const failures = error ? Math.min(12, Number(current.data.reviewFailures || 0) + 1) : 0;
    const delay = error ? Math.min(900000, 30000 * 2 ** (failures - 1)) : 1800000;
    const now = this.repo.clock.now();
    this.work.update(handle, current.id, current.revision, { status: 'waiting', data: { ...current.data,
      lastReviewAt: now, reviewFailures: failures,
      reconsiderAt: new Date(Date.parse(now) + delay).toISOString(),
      preparationStatus: error ? 'review_failed' : 'no_artifact_produced',
      // Error bodies may contain provider responses or private tool material.
      reviewFailure: error ? { at: now, code: error instanceof HarnessError ? error.code : error instanceof Error && error.name === 'AbortError' ? 'interrupted' : 'review_failed' } : null,
    } });
  }

  /** The timer is disposable; these persisted records are the schedule. The
   * caller may still reconcile periodically for new external source events. */
  nextReviewAt(handle = this.policy.hostScope()): string | null {
    this.expire();
    if (this.preferences?.().initiative === 'quiet' || this.preferences?.().followup === 'on_request') return null;
    const now = Date.parse(this.repo.clock.now()), times: number[] = [];
    const add = (value: unknown) => { const time = Date.parse(String(value)); if (Number.isFinite(time)) times.push(Math.max(now, time)); };
    for (const item of this.records(handle, 'help_opportunity', ['candidate', 'waiting'])) {
      if (this.rules(handle, String(item.data.bindingId), String((item.data.facts as any)?.objectId || ''), item.id).some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) continue;
      add(item.data.reconsiderAt || this.repo.clock.now());
      // Expiry can release a full mandate queue before its next time node.
      // Reconcile then so that capacity does not hide a shorter deadline.
      add(item.data.expiresAt);
    }
    for (const focus of this.records(handle, 'attention_focus', ['active'])) {
      if (!this.bindingActive(handle, focus) || this.rules(handle, focus.id).some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) continue;
      const hasCapacity = this.records(handle, 'help_opportunity', ['candidate', 'waiting']).filter(item => item.data.bindingId === focus.id).length < 5;
      if (hasCapacity && (focus.data.discoveryPending || focus.data.pendingProbe)) times.push(now);
      const completed = (focus.data.completedWakes || []) as string[];
      for (const at of (focus.data.wakeAt || []) as string[]) if (hasCapacity && !completed.includes(at)) add(at);
      for (const wake of (focus.data.materialWakes || []) as unknown as MaterialWake[]) {
        if (hasCapacity && !this.rules(handle, focus.id, wake.objectId, wake.opportunityId).some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) add(wake.at);
      }
      if (focus.data.probe && !focus.data.pendingProbe) add(focus.data.nextScanAt);
    }
    // A timed pause is itself a future decision boundary. It must not depend
    // on the next arbitrary sixty-second poll to become eligible again.
    for (const rule of this.records(handle, 'attention_rule', ['active'])) if (rule.data.until && Date.parse(String(rule.data.until)) > now) add(rule.data.until);
    return times.length ? new Date(Math.min(...times)).toISOString() : null;
  }

  inspect(handle: ScopeHandle, opportunity: WorkRecord, includeHistory = true) {
    const current = this.repo.work(handle, undefined, opportunity.id)[0];
    if (!current || current.data.type !== 'help_opportunity') throw new HarnessError('target_missing', '当前许可范围内没有这份机会或准备材料。');
    if (current.revision !== opportunity.revision) throw new HarnessError('revision_conflict', '这份机会已经变化，请读取当前版本。');
    opportunity = current;
    const bindingId = String(opportunity.data.bindingId);
    const binding = this.repo.work(handle, undefined, bindingId)[0], parent = binding?.data.matterId;
    return { opportunity, mandate: binding, basisUses: [...this.basis.read(handle, bindingId), ...(typeof parent === 'string' ? this.basis.read(handle, parent) : [])],
      previousHelp: includeHistory ? this.cooperation.history(handle, bindingId) : [], rules: this.rules(handle, bindingId),
      opportunityControls: this.rules(handle).filter(rule => rule.data.targetBindingId === bindingId),
      suppliedMaterialIds: opportunity.evidenceIds.filter(id => this.repo.evidence(handle, id)?.speaker === 'external'),
      deliveryReceipts: this.repo.db.prepare('SELECT d.status,d.payload FROM h_deliveries d JOIN h_jobs j ON j.id=d.job_id WHERE j.object_id=? ORDER BY d.rowid DESC LIMIT 8').all(opportunity.id)
        .map(row => ({ status: String(row.status), ...JSON.parse(String(row.payload)), meaning: '这是渠道回执；unknown或submitted不证明送达或已读。迟到回执不会重开已停止的提醒。' })),
      delivery: this.reminders.capabilities(), notificationsEnabled: this.reminders.attention().enabled,
      meaning: '信号只是待评机会。考虑新价值、已提供帮助、明确限制与实际可行动窗口；可以只准备、等待、询问或完全不介入。未观察到反馈就未知。' };
  }

  decide(handle: ScopeHandle, raw: z.infer<typeof helpDecisionInput>, observations: MaterialObservation[] = [], resolveScenes?: (refs: SceneRef[]) => SceneSnapshot[]) {
    this.expire();
    const input = helpDecisionInput.parse(raw), opportunity = this.repo.work(handle, undefined, input.id)[0];
    if (!opportunity || opportunity.data.type !== 'help_opportunity')
      throw new HarnessError('target_missing', '当前许可范围内没有这个材料或机会标识。没有改动资料；请省略id调用inspect_help重新发现，再精确复制id与revision，不要拼接或改写标识。');
    if (opportunity.revision !== input.expectedRevision)
      throw new HarnessError('revision_conflict', '这次机会已变，需要按当前条件重新判断。');
    const presentingExisting = input.reuseArtifact && input.presentInConversation && ['question_ready', 'notification_queued'].includes(opportunity.status);
    if (!['candidate', 'waiting', 'prepared'].includes(opportunity.status) && !presentingExisting) throw new HarnessError('opportunity_inactive', '该机会已退出或处理，不能继续旧动作。');
    const bindingId = String(opportunity.data.bindingId), rules = this.rules(handle, bindingId, String((opportunity.data.facts as any)?.objectId || ''), opportunity.id);
    const binding = this.repo.work(handle, undefined, bindingId)[0];
    if (!binding || !this.bindingActive(handle, binding)) throw new HarnessError('attention_stopped', '原托付或目标已经停止，不能发布旧准备。');
    if (rules.some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) throw new HarnessError('attention_paused', '这项可选帮助已暂停。');
    const storedQuestionBasis = Array.isArray(opportunity.data.questionBasis) ? opportunity.data.questionBasis as { evidenceId: string; contentVersion: number; sourceId: string; readSource: string }[] : [];
    const reusableQuestion = input.choice === 'ask' && storedQuestionBasis.length > 0 && storedQuestionBasis.every(basis => {
      const event = this.repo.evidence(handle, basis.evidenceId);
      return event?.status === 'active' && event.speaker === 'user' && event.contentVersion === basis.contentVersion
        && !this.repo.db.prepare('SELECT 1 FROM h_source_restrictions WHERE event_id=? LIMIT 1').get(event.id);
    });
    const reused = input.reuseArtifact && opportunity.data.artifact && (Array.isArray(opportunity.data.material) && opportunity.data.material.length || reusableQuestion) ? opportunity.data.artifact as { title: string; body: string } : undefined;
    if (input.reuseArtifact && !reused) throw new HarnessError('artifact_missing', '没有实际已准备材料可复用。');
    if (input.presentInConversation && !['prepare', 'ask'].includes(input.choice)) throw new HarnessError('conversation_choice', '随当前交流呈现需选择prepare或ask，并提供真实材料。');
    if (reused) {
      if (input.artifact && canonical(input.artifact) !== canonical(reused)) throw new HarnessError('artifact_changed', '复用只保留原已验证材料；改变内容需要新的实际材料。');
      input.artifact = reused;
    }
    const material = (input.sourceToolCallIds || []).map(callId => observations.find(observation => observation.toolCallId === callId));
    if (material.some(item => !item)) throw new HarnessError('material_not_read', '准备材料必须引用本次真实取得的工具观察。');
    const materialVersions = material.flatMap(item => this.materialVersions(item!.result));
    if (!this.versionsCurrent(handle, materialVersions)) throw new HarnessError('material_changed', '查询所依据的安排或资料版本已变，需要回读后准备。');
    const materialExpiries = material.flatMap(item => {
      const expiresAt = (item!.result as { expiresAt?: string })?.expiresAt;
      return expiresAt && Number.isFinite(Date.parse(expiresAt)) ? [expiresAt] : [];
    });
    if (materialExpiries.some(at => Date.parse(at) <= Date.parse(this.repo.clock.now()))) throw new HarnessError('material_expired', '查询材料已过期，需要刷新后准备。');
    for (const item of material) {
      const note = (item?.result as { note?: { id: string; revision: number } })?.note;
      if (item?.tool === 'manage_note' && note && !this.noteCurrent(note.id, note.revision)) throw new HarnessError('material_changed', '笔记已经更改或移除，请回读当前版本再准备。');
    }
    const sceneRefs = input.artifact?.sceneRefs || [];
    if (!reused && sceneRefs.some(ref => !material.some(item => {
      const observed = (item?.result as { sceneRef?: SceneRef } | undefined)?.sceneRef;
      return observed?.id === ref.id && observed.revision === ref.revision;
    }))) throw new HarnessError('scene_material', '准备画面必须绑定这次实际取得的地图或天气观察，不能借用无关旧画面。');
    const sceneSnapshots = !reused && sceneRefs.length ? resolveScenes?.(sceneRefs) : undefined;
    if (!reused && sceneRefs.length && !sceneSnapshots) throw new HarnessError('scene_unavailable', '当前准备通道没有核验这些画面。');
    const suppliedIds = [...new Set([...(input.materialEvidenceIds || []), ...(input.newValue?.evidenceIds.filter(id => opportunity.evidenceIds.includes(id)) || [])])];
    const supplied = suppliedIds.map(id => opportunity.evidenceIds.includes(id) ? this.repo.evidence(handle, id) : undefined);
    if (supplied.some(event => !event || event.speaker !== 'external')) throw new HarnessError('material_not_supplied', '只能引用这个机会中实际提供的外部材料；用户的关注许可本身不是查询结果。');
    const suppliedVersions = supplied.flatMap(event => this.evidenceVersions(event!));
    if (!this.versionsCurrent(handle, suppliedVersions)) throw new HarnessError('material_changed', '提供的本机安排已经变化，需要按当前版本重新准备。');
    materialVersions.push(...suppliedVersions);
    const scope = this.policy.validate(handle);
    // A question can be grounded in the user's missing conditions alone.
    // Keep the original source/version while recording an already-authorized
    // current-event projection as current; this is never external material.
    const questionBasis = reused && reusableQuestion ? storedQuestionBasis : input.choice === 'ask' && !material.length && !supplied.length && !reused
      ? [...new Set(opportunity.evidenceIds)].flatMap(id => {
        const event = this.repo.evidence(handle, id);
        return event?.speaker === 'user' && event.authority === 'user_statement' && event.status === 'active'
          ? [{ evidenceId: event.id, contentVersion: event.contentVersion, sourceId: event.sourceId,
            readSource: scope.currentEventIds.includes(event.id) ? 'current' : event.sourceId }] : [];
      }) : [];
    if (input.choice === 'ask' && !material.length && !supplied.length && !reused && !questionBasis.length)
      throw new HarnessError('source_required', '这个问题还需要仍可读取的用户依据。');
    const materialSources = material.map(item => this.observationSources(item!));
    const sourceIds = [...new Set([...this.storedMaterialSources(handle, opportunity), ...materialSources.flat(), ...supplied.map(event => event!.sourceId), ...questionBasis.map(item => item.readSource)])];
    const materialGrants = material.map((item, index) => this.materialGrants(item!, materialSources[index]));
    const suppliedGrants = supplied.map(event => {
      let data: unknown;
      try { data = JSON.parse(event!.text); } catch { data = undefined; }
      return this.materialGrants({ tool: 'supplied_evidence', result: { data } }, [event!.sourceId]);
    });
    const requiredGrants = [...new Set([...(Array.isArray(opportunity.data.requiredGrants) ? opportunity.data.requiredGrants.filter((grant): grant is string => typeof grant === 'string') : []),
      ...sourceIds.map(source => source === 'map:local' ? 'map:read' : source === 'weather:open-meteo' ? 'weather:read'
        : source === 'profile:self' ? 'memory:read' : source.startsWith('campus:') ? 'campus:read' : 'evidence:read'),
      ...materialGrants.flat(), ...suppliedGrants.flat()])];
    if (sourceIds.some(source => !scope.sources.includes(source))) throw new HarnessError('material_source_forbidden', '当前范围不再允许读取这份准备所依据的实际来源，旧材料没有采用。');
    if (['prepare', 'notify', 'ask'].includes(input.choice) && !input.artifact) throw new HarnessError('artifact_required', '没有真实产物，不能显示已准备。');
    if (input.choice === 'prepare' && !material.length && !supplied.length && !reused) throw new HarnessError('material_not_read', '安静准备须有实际查询或已提供材料。');
    for (const item of material) if (!item || ['inspect_help'].includes(item.tool) || (item.result as any)?.catalogOnly || (item.result as any)?.inputSchema || ['failed', 'forbidden', 'not_connected', 'unknown', 'error'].includes(String((item.result as any)?.status))) throw new HarnessError('material_unavailable', '引用的查询没有取得可用资料；能力说明和机会本身不是新查询材料。');
    const prior = this.cooperation.history(handle, bindingId, 24);
    const displayed = prior.filter(record => record.data.displayedAt || record.data.openedAt || record.data.submittedAt);
    const validNewEvidence = input.newValue?.evidenceIds.every(id => opportunity.evidenceIds.includes(id) && this.repo.evidence(handle, id)?.speaker === 'external' || material.some(item => item?.toolCallId === id));
    if (input.newValue && !validNewEvidence) throw new HarnessError('new_value_evidence', '新的理由只能引用本次已核验材料：' + [...supplied.map(event => event!.id), ...material.map(item => item!.toolCallId!)].join('、'));
    const repeated = displayed.some(record => record.data.basisFingerprint === opportunity.data.fingerprint);
    const duplicate = input.duplicateOf || repeated;
    const onceExhausted = rules.some(rule => rule.data.operation === 'once' && displayed.some(help => !rule.data.targetOpportunityId || help.data.opportunityId === rule.data.targetOpportunityId));
    const inAppOnly = this.preferences?.().initiative === 'prepare' && input.choice === 'notify';
    const showExisting = input.presentInConversation && !!reused && !input.duplicateOf;
    const choice = (duplicate || onceExhausted) && !showExisting ? 'none' : inAppOnly ? 'prepare' : input.choice;
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
        materialContractVersion: 1,
        materialSourceContractVersion: 1, sourceIds, materialGrantContractVersion: 1, requiredGrants, questionBasis,
        expiresAt: new Date(Math.min(Date.parse(String(opportunity.data.expiresAt)), ...materialExpiries.map(Date.parse))).toISOString(),
        reconsiderAt: input.reconsiderAt || (choice === 'wait' ? new Date(Date.parse(this.repo.clock.now()) + 1800000).toISOString() : null), artifact: ['none', 'wait'].includes(choice) ? null : JSON.parse(JSON.stringify({ ...input.artifact!, ...(sceneSnapshots ? { scenes: sceneSnapshots } : {}) })),
        material: reused ? opportunity.data.material : [...material.map((item, index) => { const result = item!.result as { sourceId?: string; observedAt?: string; fetchedAt?: string; expiresAt?: string; note?: { id: string; revision: number } }; return { tool: item!.tool, observationId: item!.toolCallId!, resultHash: createHash('sha256').update(canonical(item!.result)).digest('hex'), sourceIds: materialSources[index], requiredGrants: materialGrants[index], ...(result.sourceId ? { sourceId: result.sourceId } : {}), ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}), versions: z.json().parse(this.materialVersions(item!.result)), ...(item!.tool === 'manage_note' && result.note ? { sourceId: 'notes:self', noteId: result.note.id, noteRevision: result.note.revision } : {}), observedAt: result.observedAt || result.fetchedAt || this.repo.clock.now() }; }), ...supplied.map((event, index) => ({ evidenceId: event!.id, contentVersion: event!.contentVersion, sourceId: event!.sourceId, requiredGrants: suppliedGrants[index], versions: z.json().parse(this.evidenceVersions(event!)), resultHash: createHash('sha256').update(event!.text).digest('hex') }))],
        duplicateOf: input.duplicateOf || null, newValue: input.newValue || null, presentationChannel: input.presentInConversation ? 'conversation' : null, decidedAt: this.repo.clock.now(),
      } });
      for (const version of materialVersions) this.repo.addDependency(handle, { consumerId: next.id,
        producerId: version.kind === 'domain' ? `domain:${version.domain}:${version.id}` : version.kind === 'agenda' ? this.repo.calendarVersionId(version.id, version.revision) : version.id,
        producerRevision: version.revision, sensitivity: 'hard', invalidation: 'block' });
      for (const basis of basisRecords) this.basis.link(handle, basis!, next.id);
      let conversationHelpRef: { id: string; revision: number; helpRecordId: string } | undefined;
      if (['prepare', 'ask', 'notify'].includes(choice)) {
        const help = this.cooperation.record(handle, { opportunityId: next.id, sessionId: String(next.data.sessionId), matterId: bindingId,
          title: input.artifact!.title, reason: input.reason, actionDescription: input.actionDescription,
          basisFingerprint: String(next.data.fingerprint), evidenceIds: next.evidenceIds, sourceIds, requiredGrants, basisIds: input.basisIds, resultRefs: [next.id] });
        next.data.helpRecordId = help.id;
        this.repo.db.prepare('UPDATE h_work SET payload=? WHERE id=?').run(JSON.stringify(next), next.id);
        if (input.presentInConversation) conversationHelpRef = { id: next.id, revision: next.revision, helpRecordId: help.id };
        if (choice === 'notify') this.reminders.schedule({ id: next.id, title: input.artifact!.title, detail: '', startsAt: this.repo.clock.now() }, undefined, String(next.data.expiresAt), { kind: 'suggestion', producerId: next.id, helpRecordId: help.id });
      }
      if (opportunity.status === 'notification_queued' && choice !== 'notify') this.reminders.cancel(next.id);
      let mandateUpdate: { id: string; previousRevision: number; revision: number; operation: 'material_wakes' } | undefined;
      if (binding.data.type === 'attention_focus') {
        const current = this.repo.work(handle, undefined, binding.id)[0]!;
        const wakes = ((current.data.materialWakes || []) as unknown as MaterialWake[]).filter(wake => wake.opportunityId !== next.id);
        const expiry = Math.min(...materialExpiries.map(Date.parse), ...supplied.flatMap(event => event!.label.expiresAt ? [Date.parse(event!.label.expiresAt)] : []),
          ...(reused ? (opportunity.data.material as { expiresAt?: string }[]).flatMap(item => item.expiresAt ? [Date.parse(item.expiresAt)] : []) : []),
          ...(choice === 'wait' ? opportunity.evidenceIds.flatMap(id => { const event = this.repo.evidence(handle, id); return event?.speaker === 'external' && event.label.expiresAt ? [Date.parse(event.label.expiresAt)] : []; }) : []));
        // An ordinary wait can resume the same readable opportunity. If the
        // source expires first (or that resume was missed), retain a separate
        // time node which requests a fresh read, without extending old evidence.
        const wakeAt = choice === 'wait' ? Math.max(expiry, Date.parse(String(next.data.reconsiderAt))) : expiry;
        if (['prepare', 'ask', 'notify', 'wait'].includes(choice) && Number.isFinite(wakeAt) && wakeAt > Date.parse(this.repo.clock.now()) &&
          (!current.data.until || wakeAt < Date.parse(String(current.data.until)))) {
          const objectId = (next.data.facts as { objectId?: string })?.objectId;
          wakes.push({ at: new Date(wakeAt).toISOString(), opportunityId: next.id, opportunityRevision: next.revision, ...(objectId ? { objectId } : {}),
            ...(choice === 'wait' ? { kind: 'wait', reconsiderAt: String(next.data.reconsiderAt) } : {}) });
        }
        if (canonical(current.data.materialWakes || []) !== canonical(wakes)) {
          const updated = this.work.update(handle, current.id, current.revision, { data: { ...current.data, materialWakes: z.json().parse(wakes) } });
          mandateUpdate = { id: current.id, previousRevision: current.revision, revision: updated.revision, operation: 'material_wakes' };
        }
      }
      return { status: next.status, id: next.id, revision: next.revision, choice, artifactExists: !!next.data.artifact, ...(mandateUpdate ? { mandateUpdate } : {}), ...(conversationHelpRef ? { conversationHelpRef } : {}), reason: showExisting ? '原有材料已绑定当前交流；实际展示仍等界面回执，不新增系统通知。' : duplicate ? '同一理由已经提供过帮助，换文案不会重新获得提醒资格。' : onceExhausted ? '这件事只提醒一次的范围已用完。' : inAppOnly ? '当前只保留应用内材料，没有发送通知。' : input.reason };
    });
  }

  expire() {
    this.basis.recheck();
    const now = this.repo.clock.now();
    this.repo.write(() => {
      const scope = this.policy.hostScope();
      for (const record of this.records(scope, 'help_opportunity', activeChoices)) {
        const binding = this.repo.work(scope, undefined, String(record.data.bindingId))[0];
        const material = record.data.material as { noteId?: string; noteRevision?: number; versions?: MaterialVersion[]; expiresAt?: string }[] | undefined;
        const facts = record.data.facts as { objectId?: string; revision?: number; operation?: string; value?: { done?: boolean } } | undefined;
        const noteChanged = material?.some(item => item.noteId && !this.noteCurrent(item.noteId, Number(item.noteRevision))) ||
          record.data.category === 'notes' && !!facts?.objectId && Number.isSafeInteger(facts.revision) && !this.noteCurrent(facts.objectId, Number(facts.revision), facts.operation === 'tombstone' ? 'deleted' : 'active');
        const agendaChanged = record.data.category === 'agenda' && !!facts?.objectId && Number.isSafeInteger(facts.revision) &&
          !this.versionsCurrent(scope, [{ kind: 'agenda', id: facts.objectId, revision: Number(facts.revision), state: facts.operation === 'tombstone' ? 'deleted' : facts.value?.done ? 'done' : 'present' }]);
        const materialChanged = ['prepared', 'question_ready', 'notification_queued'].includes(record.status) && record.data.materialContractVersion !== 1 ||
          material?.some(item => item.expiresAt && Date.parse(item.expiresAt) <= Date.parse(now) || !this.versionsCurrent(scope, item.versions || []));
        if (binding && this.bindingActive(scope, binding) && !noteChanged && !agendaChanged && !materialChanged) continue;
        this.reminders.cancel(record.id);
        this.work.update(scope, record.id, record.revision, { status: 'stale', data: { ...record.data, invalidationReason: noteChanged ? 'note_changed' : agendaChanged ? 'agenda_changed' : materialChanged ? 'material_changed' : 'binding_inactive', artifact: null } });
      }
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

  private probeArguments(probe: z.infer<typeof attentionControlInput>['probe']) {
    if (!probe) return {};
    if (!probe.relativeDate) return probe.arguments;
    const { argument, offsetDays, timeZone } = probe.relativeDate;
    return { ...probe.arguments, [argument]: addDate(dateInZone(this.repo.clock.now(), timeZone), offsetDays) };
  }

  /** Persisted nodes wake semantic review once. Polling itself creates no model
   * work. Source probes retain their own bounded, read-only refresh budget. */
  async scan(handle: ScopeHandle, signal: AbortSignal) {
    this.expire();
    if (this.preferences?.().initiative === 'quiet' || this.preferences?.().followup === 'on_request') return [];
    this.resumeChanges?.(handle);
    const scope = this.policy.validate(handle), now = this.repo.clock.now();
    const focuses = this.records(handle, 'attention_focus', ['active']).filter(focus => this.bindingActive(handle, focus))
      .sort((a, b) => Date.parse(String(a.data.nextScanAt)) - Date.parse(String(b.data.nextScanAt)));
    for (const original of focuses) {
      let focus = this.repo.work(handle, undefined, original.id)[0]!;
      if (this.rules(handle, focus.id).some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) continue;
      const source = focus.data.source as { eventId: string };
      const completed = (focus.data.completedWakes || []) as string[];
      const due = ((focus.data.wakeAt || []) as string[]).filter(at => !completed.includes(at) && Date.parse(at) <= Date.parse(now));
      const nodes = [...(focus.data.discoveryPending ? ['mandate_started'] : []), ...due];
      for (const node of nodes) {
        const expiresAt = String(focus.data.until || new Date(Date.parse(now) + 7 * 86400000).toISOString());
        const opportunity = this.offer(handle, { bindingId: focus.id, watchId: 'wake:' + focus.id, evidenceId: source.eventId,
          category: String(focus.data.eventCategory), title: focus.title, noveltyKey: `${focus.id}:${node}`, expiresAt,
          facts: { trigger: node === 'mandate_started' ? 'mandate_started' : 'time_window_opened', scheduledAt: node, rule: focus.data.rule, meaning: '这是托付或时间节点，不是新的外部事实；先核实当前条件再准备。' } });
        if (!opportunity && !this.records(handle, 'help_opportunity').some(item => item.data.noveltyKey === `${focus.id}:${node}`)) continue;
        focus = this.work.update(handle, focus.id, focus.revision, { data: { ...focus.data, ...(node === 'mandate_started' ? { discoveryPending: false } : { completedWakes: [...new Set([...(focus.data.completedWakes as string[] || []), node])] }) } });
      }
      const materialWakes = (focus.data.materialWakes || []) as unknown as MaterialWake[], remainingWakes: MaterialWake[] = [];
      for (const wake of materialWakes) {
        if (Date.parse(wake.at) > Date.parse(now)) { remainingWakes.push(wake); continue; }
        const rules = this.rules(handle, focus.id, wake.objectId, wake.opportunityId);
        if (rules.some(rule => rule.data.operation === 'pause')) { remainingWakes.push(wake); continue; }
        const prior = this.repo.db.prepare('SELECT status FROM h_work WHERE id=? AND owner=? AND workspace=?').get(wake.opportunityId, scope.principalId, scope.workspaceId);
        if (!prior || ['dismissed', 'declined', 'cancelled'].includes(String(prior.status)) || rules.some(rule => rule.data.operation === 'stop')) continue;
        const displayed = this.cooperation.history(handle, focus.id, 24).filter(help => help.data.displayedAt || help.data.openedAt || help.data.submittedAt);
        if (rules.some(rule => rule.data.operation === 'once' && displayed.some(help => !rule.data.targetOpportunityId || help.data.opportunityId === rule.data.targetOpportunityId))) continue;
        const noveltyKey = `${wake.kind === 'wait' ? 'wait-refresh' : 'material-expired'}:${wake.opportunityId}:${wake.opportunityRevision}:${wake.at}`;
        const opportunity = this.offer(handle, { bindingId: focus.id, watchId: 'wake:' + focus.id, evidenceId: source.eventId,
          category: String(focus.data.eventCategory), title: focus.title, noveltyKey,
          expiresAt: String(focus.data.until || new Date(Date.parse(now) + 7 * 86400000).toISOString()),
          facts: { trigger: wake.kind === 'wait' ? 'wait_refresh' : 'material_expired', scheduledAt: wake.at, previousOpportunityId: wake.opportunityId, previousRevision: wake.opportunityRevision,
            ...(wake.reconsiderAt ? { requestedReconsiderAt: wake.reconsiderAt } : {}), ...(wake.objectId ? { objectId: wake.objectId } : {}), rule: focus.data.rule,
            meaning: wake.kind === 'wait' ? '等待的重评时间已到，原来源材料已过期或原复核未完成；先刷新当前事实，再判断继续等待、准备或结束，不复用旧证据，不自动通知。' : '原准备材料已经过期；来源的业务值可能未变，先取得当前有效材料再决定是否仍值得准备，不自动通知。' } });
        if (!opportunity && !this.records(handle, 'help_opportunity').some(item => item.data.noveltyKey === noveltyKey)) remainingWakes.push(wake);
      }
      if (remainingWakes.length !== materialWakes.length) focus = this.work.update(handle, focus.id, focus.revision, { data: { ...focus.data, materialWakes: z.json().parse(remainingWakes) } });
      const pending = focus.data.pendingProbe as unknown as HelpSignal | undefined;
      if (pending && (Date.parse(pending.expiresAt) <= Date.parse(now) || !this.repo.evidence(handle, pending.evidenceId))) this.work.update(handle, focus.id, focus.revision, { data: { ...focus.data, pendingProbe: null, nextScanAt: now } });
      else if (pending && this.offer(handle, pending)) this.work.update(handle, focus.id, focus.revision, { data: { ...focus.data, pendingProbe: null, lastFingerprint: pending.noveltyKey } });
    }
    for (const original of focuses.filter(focus => focus.data.probe && !focus.data.pendingProbe && Date.parse(String(focus.data.nextScanAt)) <= Date.parse(now)).slice(0, 2)) {
      const focus = this.repo.work(handle, undefined, original.id)[0]!;
      if (this.rules(handle, focus.id).some(rule => ['pause', 'stop'].includes(String(rule.data.operation)))) continue;
      if (focus.data.pendingProbe) continue;
      const probe = focus.data.probe as NonNullable<z.infer<typeof attentionControlInput>['probe']>;
      if (probe.capability === 'research.search' && focus.data.publicProbeHash !== createHash('sha256').update(canonical(probe)).digest('hex')) continue;
      const sources = (focus.data.sources as string[]).filter(source => scope.sources.includes(source));
      const bounded = this.policy.narrow(handle, { sources, infer: false, grants: scope.grants.filter(grant => grant.endsWith(':read')) });
      let observation: Awaited<ReturnType<CapabilityBroker['invoke']>>;
      try { observation = await this.broker.invoke(bounded, probe.capability, this.probeArguments(probe), signal, { refresh: true, maxCalls: 2 }); }
      catch (error) {
        signal.throwIfAborted(); this.policy.validate(handle);
        const current = this.repo.work(handle, undefined, focus.id)[0];
        if (current?.revision === focus.revision && this.bindingActive(handle, current)) this.work.update(handle, current.id, current.revision, { data: { ...current.data,
          nextScanAt: new Date(Date.parse(this.repo.clock.now()) + 300000).toISOString(), lastProbeFailure: { at: this.repo.clock.now(), code: error instanceof HarnessError ? error.code : 'probe_failed' } } });
        continue;
      }
      this.policy.validate(handle); signal.throwIfAborted();
      const current = this.repo.work(handle, undefined, focus.id)[0];
      if (!current || current.revision !== focus.revision || !this.bindingActive(handle, current)) continue;
      // Weather's observedAt is the fetch receipt, not a forecast publication
      // or a changed forecast value. Its validity is handled by material wakes.
      const data = probe.capability === 'weather.lookup' && observation.data && typeof observation.data === 'object'
        ? { ...observation.data, observedAt: undefined } : observation.data;
      const facts = JSON.parse(JSON.stringify({ status: observation.status, data, coverage: observation.coverage },
        (key, value) => ['fetchedAt', 'retrievedAt', 'queriedAt', 'computedAt'].includes(key) ? undefined : value));
      const fingerprint = createHash('sha256').update(canonical(facts)).digest('hex');
      const updated = this.work.update(handle, focus.id, focus.revision, { data: { ...focus.data, nextScanAt: new Date(Date.parse(this.repo.clock.now()) + 1800000).toISOString() } });
      if (focus.data.lastFingerprint === fingerprint || !observation.data || !['fresh', 'partial', 'known_absent'].includes(observation.status)) continue;
      const eventId = randomUUID(), now = this.repo.clock.now();
      const focusExpiry = String(focus.data.until || new Date(Date.parse(now) + 86400000).toISOString());
      const sourceExpiry = observation.expiresAt && Date.parse(observation.expiresAt);
      const expiresAt = sourceExpiry && Number.isFinite(sourceExpiry)
        ? new Date(Math.min(Date.parse(focusExpiry), sourceExpiry)).toISOString() : focusExpiry;
      const event = this.repo.ingest(handle, { id: eventId, ownerId: scope.principalId, workspaceId: scope.workspaceId, subjectId: scope.subjectId, worldId: scope.worldId, sourceId: observation.sourceId,
        contentVersion: 1, text: canonical(observation), speaker: 'external', kind: 'tool_result', authority: 'source_record', roots: [eventId],
        label: { ...personalLabel, infer: false, expiresAt }, receivedAt: now, status: 'active' });
      const change: HelpSignal = { bindingId: focus.id, watchId: 'scan:' + focus.id, evidenceId: event.id, category: String(focus.data.eventCategory), title: focus.title,
        facts: { capability: probe.capability, observation: observation.data }, noveltyKey: fingerprint, expiresAt };
      const offered = this.offer(handle, change);
      this.work.update(handle, focus.id, updated.revision, { data: { ...updated.data, ...(offered ? { lastFingerprint: fingerprint, pendingProbe: null } : { pendingProbe: z.json().parse(change) }) } });
    }
    return [] as HelpSignal[];
  }
}
