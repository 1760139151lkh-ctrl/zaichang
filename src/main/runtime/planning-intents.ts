import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, workSourceBindingSchema, workSourceRefSchema, type EffectAction, type EffectReceipt, type ScopeHandle, type WorkRecord, type WorkSourceRef, type WorkSourceBinding } from '../../shared/harness';
import type { Action } from '../../shared/types';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from './work';
import { canonical, codePointSlice } from './semantics';
import { PlanningApplicationService, planningPlanRefSchema } from '../actions/planning-application';
import { calendarPlanFingerprint } from '../actions/planning-draft';
import { planningIntentSpecSchema, type PlanningIntentSpec, type PlanningHostContext, type PlanningIntentRef, type PlanningAttemptRecord, type PlanningAttemptBasis,
  type PlanningActionLink, type PlanningAdoptionInput, type PlanningManifest } from '../actions/planning-intent-contract';
import { normalizePlanningIntentSpec, projectPlanningAdoption, materializePlanningIntent } from '../actions/planning-intent-ledger';

const source = workSourceRefSchema.safeExtend({ quote: z.string().min(1).max(4000) });
const common = { source, supports: z.array(source).max(16).optional() };
const existing = { id: z.string().min(1).max(160), expectedRevision: z.number().int().positive() };
export const managePlanningIntentInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('keep'), planId: z.string().uuid(), ...common }).strict(),
  z.object({ operation: z.literal('update'), ...existing, planId: z.string().uuid(), ...common }).strict(),
  z.object({ operation: z.enum(['pause', 'resume', 'retire']), ...existing, ...common }).strict(),
]);
export const planningIntentReadInput = z.object({ id: z.string().min(1).max(160), expectedRevision: z.number().int().positive().optional(), sessionId: z.string().min(1).max(160).optional() }).strict();
export const planningIntentReplanInput = z.object(existing).strict();
export const planningIntentPageInput = z.object({ query: z.string().max(300).optional(), sessionId: z.string().min(1).max(160).optional(),
  relatedTo: z.string().min(1).max(160).optional(), statuses: z.array(z.enum(['active', 'paused', 'retired'])).min(1).max(3).optional(),
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(20).optional() }).strict();
export interface PlanningIntentSessionContext {
  currentEventIds: string[]; matterId?: string; sessionId?: string;
  /** Internal host verdict after independent delegation review; never model tool arguments. */
  verification?: { allowed: boolean; proposalDigest: string; basis: { id: string; quote: string }[]; dependentSourceIds?: string[] };
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const data = (value: unknown): WorkRecord['data'] => JSON.parse(JSON.stringify(value));
const refsOf = (values: WorkSourceRef[]) => [...new Map(values.map(value => {
  const { eventId, contentVersion, start, end } = value;
  const ref = workSourceRefSchema.parse({ eventId, contentVersion, start, end }); return [canonical(ref), ref];
})).values()].sort((a, b) => canonical(a).localeCompare(canonical(b)));
const meaning = '这是保留的规划解释与方法默认值，不是人物偏好、当前事实或日历批准。已安排不等于已完成；继续采用须重新核对当前来源、日历和新票据。';

/** One source-bound WorkRecord owns the static intention. Tickets and actual
 * action/receipt/calendar facts retain their existing owners. */
export class PlanningIntentService {
  constructor(readonly repo: KernelRepository, readonly work: WorkService, readonly planning: PlanningApplicationService) {
    repo.bindPlanningAttemptVerifier((handle, intentId, basis) => this.assertAttemptBasis(handle, intentId, basis));
    planning.setIntentValidator((scope, context) => {
      const handle = this.work.policy.hostScope({ currentEventIds: scope.currentEventIds, purposes: scope.purposes });
      const current = this.work.policy.validate(handle);
      if (scope.principalId !== current.principalId || scope.workspaceId !== current.workspaceId || scope.subjectId !== current.subjectId
        || scope.worldId !== 'real' || scope.audience !== 'self' || scope.privacyEpoch !== current.privacyEpoch || scope.policyRevision !== current.policyRevision)
        throw new HarnessError('planning_intent_scope', '规划意图属于另一资料归属。');
      // Rebuild only a narrower current read handle; no stored scope is revived.
      const narrowed = this.work.policy.narrow(handle, { sources: current.sources.filter(id => scope.sources.includes(id)),
        currentEventIds: current.currentEventIds.filter(id => scope.currentEventIds.includes(id)),
        grants: current.grants.filter(id => scope.grants.includes(id)), purposes: current.purposes.filter(id => scope.purposes.includes(id)) });
      this.assertIntentReference(narrowed, context.intent);
      this.assertAttemptBasis(narrowed, context.intent.id, context.attemptBasis);
    });
  }
  private scope(handle: ScopeHandle, calendar = false, write = false) {
    const scope = this.work.policy.require(handle, write ? 'work:write' : 'evidence:read');
    if (scope.child && (calendar || write) || scope.worldId !== 'real' || scope.subjectId !== scope.principalId || scope.audience !== 'self'
      || calendar && (!scope.sources.includes('local-agenda') || scope.retention === 'session_only')
      || write && (scope.retention !== 'purpose_scoped' || !scope.sources.includes('work:self')))
      throw new HarnessError('planning_intent_scope', '规划意图需要本人当前有效的真实世界业务范围。');
    return scope;
  }
  private record(handle: ScopeHandle, id: string, revision?: number, sessionId?: string) {
    this.scope(handle);
    const record = sessionId ? this.repo.workData(handle, ['planning_intent'], { id, sessionId, limit: 1 })[0] : this.repo.work(handle, 'plan', id)[0];
    if (!record || record.data.type !== 'planning_intent' || !record.sourceBinding)
      throw new HarnessError('planning_intent_missing', '没有当前可读的这份规划意图。');
    if (revision !== undefined && record.revision !== revision) throw new HarnessError('revision_conflict', '规划意图已更新，请先读取当前版本。');
    const spec = planningIntentSpecSchema.parse(record.data.spec), specBasis = z.array(workSourceRefSchema).min(1).max(32).parse(record.data.specBasis);
    if (typeof record.data.specDigest !== 'string') throw new HarnessError('planning_intent_invalid', '这份意图缺少可核对的规格身份。');
    if (hash({ spec, refs: specBasis }) !== record.data.specDigest || specBasis.some(ref => !record.sourceBinding!.refs.some(bound => canonical(bound) === canonical(ref))))
      throw new HarnessError('planning_intent_invalid', '这份意图的规格与原始依据身份不一致。');
    return record;
  }
  private reference(record: WorkRecord): PlanningIntentRef {
    return { id: record.id, revision: record.revision, specDigest: String(record.data.specDigest) };
  }
  private assertIntentReference(handle: ScopeHandle, ref: PlanningIntentRef) {
    const record = this.record(handle, ref.id, ref.revision);
    if (record.status !== 'active' || record.data.specDigest !== ref.specDigest)
      throw new HarnessError('planning_intent_changed', '原规划意图已搁置、停止或改变，旧方案不能继续采用。');
    this.repo.readWorkSources(handle, record);
    return record;
  }
  private checkSources(handle: ScopeHandle, args: z.infer<typeof managePlanningIntentInput>, session: PlanningIntentSessionContext) {
    const scope = this.scope(handle, false, true);
    if (!session.currentEventIds.includes(args.source.eventId) || !scope.currentEventIds.includes(args.source.eventId))
      throw new HarnessError('planning_intent_current_source', '保留或改变意图须有本轮用户原话。');
    for (const [index, ref] of [args.source, ...(args.supports || [])].entries()) {
      const event = this.repo.evidence(handle, ref.eventId);
      if (!event || (index === 0 ? event.speaker !== 'user' || event.authority !== 'user_statement' : !['user', 'external'].includes(event.speaker)) || event.ownerId !== scope.principalId
        || event.subjectId !== scope.subjectId || event.worldId !== scope.worldId || event.contentVersion !== ref.contentVersion
        || codePointSlice(event.text, ref.start, ref.end) !== ref.quote)
        throw new HarnessError('unsupported_evidence', '规划意图的原话版本或精确位置不能核实。');
    }
    return refsOf([args.source, ...(args.supports || [])]);
  }
  private assertBoundSources(sourceIds: string[], binding: Pick<WorkSourceBinding, 'sourceIds'>) {
    if (sourceIds.some(id => !['local-agenda', 'user-declared', 'current'].includes(id) && !binding.sourceIds.includes(id)))
      throw new HarnessError('planning_intent_unbound_source', '这份规划使用的真实来源缺少精确、当前可用的支持片段；未保留其派生字段。');
  }
  private dependencyBinding(preview: { operation: string; binding: WorkSourceBinding; existingSpecSourceIds?: string[] }) {
    return { sourceIds: [...new Set([...preview.binding.sourceIds, ...(preview.operation === 'resume' ? preview.existingSpecSourceIds || [] : [])])] };
  }
  private sourceBoundSpec(handle: ScopeHandle, spec: PlanningIntentSpec, binding: WorkSourceBinding, manifest: PlanningManifest) {
    const scope = this.scope(handle), external = new Set(binding.sourceIds.filter(id => !['history:self', 'current', 'user-declared', 'local-agenda'].includes(id)));
    for (const ref of binding.refs) {
      const row = this.repo.db.prepare("SELECT source,json_extract(payload,'$.speaker') speaker FROM h_evidence WHERE id=? AND owner=? AND workspace=? AND version=?")
        .get(ref.eventId, scope.principalId, scope.workspaceId, ref.contentVersion);
      if (row?.speaker === 'external') external.add(String(row.source));
    }
    const requiredRefresh = [...spec.requiredRefresh];
    for (const sourceId of external) if (!requiredRefresh.some(value => value.kind === 'source_coverage' && value.sourceId === sourceId))
      requiredRefresh.push({ kind: 'source_coverage', sourceId, sourceVersion: manifest.sourceVersions.find(value => value.sourceId === sourceId)?.sourceVersion ?? null });
    return planningIntentSpecSchema.parse({ ...spec, requiredRefresh });
  }
  previewManage(handle: ScopeHandle, raw: unknown, session: PlanningIntentSessionContext) {
    const args = managePlanningIntentInput.parse(raw), refs = this.checkSources(handle, args, session);
    const binding = this.repo.resolveWorkSourceBinding(handle, refs);
    const stopping = args.operation === 'pause' || args.operation === 'retire';
    const metadata = stopping ? this.repo.sourcedWorkMetadata(handle, args.id) : undefined;
    if (stopping && (!metadata || metadata.kind !== 'plan' || metadata.type !== 'planning_intent'))
      throw new HarnessError('planning_intent_missing', '没有当前可管理的这份规划意图。');
    if (metadata && 'expectedRevision' in args && metadata.revision !== args.expectedRevision)
      throw new HarnessError('revision_conflict', '规划意图已更新，请先核对当前版本。');
    const old = args.operation === 'keep' || stopping ? undefined : this.record(handle, args.id, args.expectedRevision);
    if (args.operation === 'update' && old!.status !== 'active')
      throw new HarnessError('planning_intent_inactive', '修改规格前先按当前原话恢复这份已搁置的意图；已停止的意图需另行明确建立。');
    const exported = args.operation === 'keep' || args.operation === 'update'
      ? this.planning.exportTicket(this.scope(handle, true), args.planId) : undefined;
    const spec = exported && this.sourceBoundSpec(handle, normalizePlanningIntentSpec(exported.input), binding, exported.manifest);
    if (exported && spec) {
      this.assertBoundSources(exported.manifest.sourceVersions.map(version => version.sourceId), binding);
      const expectedId = old?.id || 'planning-intent:' + hash({ source: binding.refs, planId: exported.planId });
      const existingRecord = old || this.repo.work(handle, 'plan', expectedId)[0];
      const digest = hash({ spec, refs: binding.refs });
      if (exported.intentRef && (exported.intentRef.id !== expectedId || exported.intentRef.specDigest !== digest
        || exported.intentRef.revision !== (args.operation === 'update' ? old!.revision + 1 : existingRecord?.revision || 1)))
        throw new HarnessError('planning_intent_binding', '这份票据已属于另一意图或修订，不能改绑保留。');
      const scope = this.scope(handle, true);
      const prepared = this.repo.db.prepare(`SELECT 1 FROM h_actions WHERE owner=? AND workspace=? AND subject=? AND world=?
        AND json_extract(payload,'$.arguments.planRef.planId')=? LIMIT 1`).get(scope.principalId, scope.workspaceId, scope.subjectId, scope.worldId, exported.planId);
      if (!exported.intentRef && (exported.hasPreparations || prepared))
        throw new HarnessError('planning_intent_already_prepared', '这份旧试算已经准备过动作，不能事后补造采用关联；请按当前意图重新试算后保留。');
    }
    if (session.matterId && !stopping) {
      const matter = this.repo.work(handle, 'episode', session.matterId)[0];
      if (!matter || matter.data.type !== 'collaboration_frame') throw new HarnessError('planning_intent_matter', '关联事项不是当前可读的共同事项。');
    }
    const target = metadata ? { ...metadata, contentAvailable: false as const }
      : old ? { id: old.id, revision: old.revision, title: old.title, status: old.status, contentAvailable: true as const } : undefined;
    const proposal = { operation: args.operation, target,
      ...(spec ? { hostProposal: { planId: exported!.planId, spec, interpretation: spec.interpretation,
        dependentSourceIds: [...new Set(exported!.manifest.sourceVersions.map(version => version.sourceId))] } } : {}),
      source: args.source, supports: args.supports || [], binding,
      existingSpecSourceIds: args.operation === 'resume' ? old!.sourceBinding!.sourceIds : [],
      matterId: stopping ? null : session.matterId || old?.data.matterId || null };
    return { ...proposal, digest: hash(proposal) };
  }
  manage(handle: ScopeHandle, raw: unknown, session: PlanningIntentSessionContext) {
    const args = managePlanningIntentInput.parse(raw), preview = this.previewManage(handle, args, session), verification = session.verification;
    if (!verification?.allowed || verification.proposalDigest !== preview.digest || !verification.basis.some(basis =>
      basis.id === args.source.eventId && basis.quote.length > 0 && args.source.quote.includes(basis.quote)))
      throw new HarnessError('planning_intent_not_delegated', '尚未核实当前原话对这项保留或变更的明确委托。');
    this.assertBoundSources(verification.dependentSourceIds || [], this.dependencyBinding(preview));
    const now = this.repo.clock.now(), currentSource = this.repo.evidence(handle, args.source.eventId)!;
    if (session.sessionId && currentSource.sessionId !== session.sessionId) throw new HarnessError('planning_intent_session', '意图依据不属于当前会话。');
    const sessionId = currentSource.sessionId;
    const lastTransition = { operation: args.operation, source: refsOf([args.source])[0], at: now,
      quoteSha256: createHash('sha256').update(args.source.quote).digest('hex') };
    if (args.operation === 'pause' || args.operation === 'retire') {
      const operation = args.operation;
      const transition = this.repo.write(() => {
        const checked = this.previewManage(handle, args, session);
        if (checked.digest !== preview.digest) throw new HarnessError('planning_intent_changed', '核验期间事项版本已改变。');
        this.assertBoundSources(verification.dependentSourceIds || [], this.dependencyBinding(checked));
        return this.repo.transitionSourcedWork(handle, { id: args.id, expectedRevision: args.expectedRevision,
          status: operation === 'pause' ? 'paused' : 'retired', transition: { operation, source: refsOf([args.source])[0] } });
      });
      return { operation: args.operation, transition: { ...transition, contentAvailable: false as const }, sources: [],
        meaning: '这项规划的管理状态已更新；没有展开或恢复旧规格、旧来源或旧日历批准。' };
    }
    const record = this.repo.write(() => {
      // Recheck all real references inside the same short writer transaction.
      const checked = this.previewManage(handle, args, session);
      if (checked.digest !== preview.digest) throw new HarnessError('planning_intent_changed', '核验期间意图或草案已变化。');
      this.assertBoundSources(verification.dependentSourceIds || [], this.dependencyBinding(checked));
      const old = args.operation === 'keep' ? undefined : this.record(handle, args.id, args.expectedRevision);
      let next: WorkRecord;
      if (args.operation === 'keep' || args.operation === 'update') {
        const spec = preview.hostProposal!.spec, refs = preview.binding.refs;
        const specDigest = hash({ spec, refs }), id = old?.id || 'planning-intent:' + hash({ source: refs, planId: args.planId });
        const prior = !old && this.repo.work(handle, 'plan', id)[0];
        if (prior) {
          if (prior.data.type !== 'planning_intent' || prior.data.specDigest !== specDigest) throw new HarnessError('idempotency_conflict', '同一保留依据已有不同意图。');
          return prior;
        }
        const scope = this.scope(handle, false, true);
        const title = spec.request.tasks.map(task => task.title).slice(0, 2).join('、').slice(0, 160) || '保留的规划意图';
        next = old ? { ...old, revision: old.revision + 1, title, sourceBinding: preview.binding, evidenceIds: [...new Set(refs.map(ref => ref.eventId))],
          data: data({ type: 'planning_intent', contractVersion: 1, spec, specDigest, specBasis: refs, recordedAt: old.data.recordedAt || now, updatedAt: now,
            ...(preview.matterId ? { matterId: preview.matterId } : {}), sessionId,
            sessionIds: [...new Set([...(typeof old.data.sessionId === 'string' && old.data.sessionId ? [old.data.sessionId] : []),
              ...(Array.isArray(old.data.sessionIds) ? old.data.sessionIds : []), ...(sessionId ? [sessionId] : [])])], retainedFromPlanId: args.planId,
            lastTransition }) }
          : { id, kind: 'plan', ownerId: scope.principalId, workspaceId: scope.workspaceId, subjectId: scope.subjectId, worldId: scope.worldId,
            revision: 1, status: 'active', title,
            evidenceIds: [...new Set(refs.map(ref => ref.eventId))], sourceBinding: preview.binding,
            label: { purpose: scope.purposes[0], audience: scope.audience, retention: scope.retention, sensitivity: 'personal', infer: false },
            data: data({ type: 'planning_intent', contractVersion: 1, spec, specDigest, specBasis: refs, recordedAt: now, updatedAt: now, sessionId,
              sessionIds: sessionId ? [sessionId] : [], ...(preview.matterId ? { matterId: preview.matterId } : {}), retainedFromPlanId: args.planId,
              lastTransition }) };
      } else {
        if (old!.status !== 'paused')
          throw new HarnessError('planning_intent_state', '当前意图状态不适用这项变更，请先读取。');
        const binding = this.repo.resolveWorkSourceBinding(handle, z.array(workSourceRefSchema).min(1).max(32).parse(old!.data.specBasis));
        next = { ...old!, revision: old!.revision + 1, status: 'active',
          sourceBinding: binding, evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], data: data({ ...old!.data, updatedAt: now, sessionId,
            sessionIds: [...new Set([...(typeof old!.data.sessionId === 'string' && old!.data.sessionId ? [old!.data.sessionId] : []),
              ...(Array.isArray(old!.data.sessionIds) ? old!.data.sessionIds : []), ...(sessionId ? [sessionId] : [])])],
            lastTransition }) };
      }
      if (Buffer.byteLength(canonical(next.data), 'utf8') > 160_000) throw new HarnessError('planning_intent_budget', '这份意图超过本次持久内容预算，尚未保存。');
      return this.work.savePlanningIntent(handle, next, old?.revision);
    });
    if (args.operation === 'keep' || args.operation === 'update') {
      const exported = this.planning.exportTicket(this.scope(handle, true), args.planId);
      const context: PlanningHostContext = { intent: this.reference(record), allocationBasis: { calendarFingerprint: exported.manifest.calendarFingerprint, groupIds: [] },
        retained: { work: [], boundaries: [], scheduledTasks: [] }, attemptBasis: [] };
      this.planning.bindIntent(this.scope(handle, true), args.planId, context);
    }
    return { operation: args.operation, ...this.read(handle, { id: record.id, expectedRevision: record.revision }) };
  }
  page(handle: ScopeHandle, raw: unknown = {}) {
    this.scope(handle);
    const args = planningIntentPageInput.parse(raw), limit = args.limit || 8, offset = args.offset || 0;
    const records = this.repo.workData(handle, ['planning_intent'], { query: args.query, sessionId: args.sessionId, matterId: args.relatedTo,
      statuses: args.statuses || ['active'], offset, limit: limit + 1, respectSourceBindings: true });
    return { items: records.slice(0, limit).map(record => ({ id: record.id, revision: record.revision, title: record.title, status: record.status,
      sourceBinding: record.sourceBinding, matterId: record.data.matterId, specDigest: record.data.specDigest, updatedAt: record.data.updatedAt })),
      nextOffset: records.length > limit ? offset + limit : null,
      coverage: { complete: records.length <= limit, meaning: '这里只覆盖当前来源与用途下匹配的规划意图；没有结果不证明不存在其它范围的记录。' } };
  }
  read(handle: ScopeHandle, raw: unknown) {
    const args: z.infer<typeof planningIntentReadInput> = typeof raw === 'string' ? { id: raw } : planningIntentReadInput.parse(raw);
    const record = this.record(handle, args.id, args.expectedRevision, args.sessionId), sources = this.repo.readWorkSources(handle, record);
    const scope = this.scope(handle);
    const adoptionEvidence = !scope.child && scope.retention !== 'session_only' && scope.sources.includes('local-agenda') ? this.adoption(handle, record, this.currentCalendar())
      : { status: 'not_checked' as const, reason: '本轮只读意图范围未展开当前日历的采用证明。' };
    return { record, sources, spec: planningIntentSpecSchema.parse(record.data.spec), specDigest: String(record.data.specDigest), adoptionEvidence, meaning };
  }
  replan(handle: ScopeHandle, raw: unknown, currentItems: Action[]) {
    this.scope(handle, true);
    const args = planningIntentReplanInput.parse(raw), record = this.record(handle, args.id, args.expectedRevision);
    if (record.status !== 'active') throw new HarnessError('planning_intent_inactive', '这份意图目前已搁置或停止；继续前需按当前原话明确恢复。');
    const adoption = this.adoption(handle, record, currentItems), spec = planningIntentSpecSchema.parse(record.data.spec);
    if ('evidenceCoverage' in adoption) return { status: 'needs_review' as const, intent: { ...this.reference(record), sourceBinding: record.sourceBinding },
      record, sources: this.repo.readWorkSources(handle, record), adoptionEvidence: adoption, reasons: adoption.reasons, applied: false, meaning };
    const materialized = materializePlanningIntent(spec, adoption, { now: this.repo.clock.now() });
    const sources = this.repo.readWorkSources(handle, record), intent = { ...this.reference(record), sourceBinding: record.sourceBinding };
    if (materialized.status !== 'ready' || !materialized.request) return { status: materialized.status, intent, record, sources, adoptionEvidence: adoption,
      reasons: materialized.reasons, requiredRefresh: materialized.requiredRefresh, applied: false, meaning };
    const context: PlanningHostContext = { intent: this.reference(record), allocationBasis: { calendarFingerprint: adoption.calendarFingerprint,
      groupIds: materialized.retained.work.map(anchor => anchor.id) }, retained: materialized.retained, attemptBasis: adoption.attemptBasis };
    const result = this.planning.prepare(this.scope(handle, true), currentItems, materialized.request, context);
    return { ...result, intent, record, sources, planningInput: materialized.request, adoptionEvidence: adoption, applied: false, meaning };
  }
  private currentCalendar(): Action[] { return this.repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload)) as Action); }
  private attemptBindingReadable(handle: ScopeHandle, raw: unknown) {
    try {
      const binding = workSourceBindingSchema.parse(typeof raw === 'string' ? JSON.parse(raw) : raw);
      return canonical(binding) === canonical(this.repo.resolveWorkSourceBinding(handle, binding.refs));
    } catch (error) {
      if (error instanceof HarnessError || error instanceof SyntaxError || error instanceof Error && error.name === 'ZodError') return false;
      throw error;
    }
  }
  /** Read-only source/proof check, shared by execution and derived material gates. */
  assertAttemptBasis(handle: ScopeHandle, intentId: string, basis: PlanningAttemptBasis[]) {
    this.scope(handle);
    for (const expected of basis) {
      const metadata = this.repo.db.prepare('SELECT intent_id,spec_digest,source_binding,redacted FROM h_planning_intent_attempts WHERE plan_id=?').get(expected.planId);
      if (expected.intentId !== intentId || !metadata || metadata.intent_id !== expected.intentId || metadata.spec_digest !== expected.specDigest
        || Number(metadata.redacted) !== 0 || !this.attemptBindingReadable(handle, metadata.source_binding)
        || canonical(JSON.parse(String(metadata.source_binding))) !== canonical(expected.sourceBinding))
        throw new HarnessError('planning_intent_adoption_changed', '本次重算使用的原采用来源已改变或不可复核，须重新核查后再安排。');
      const content = this.repo.db.prepare('SELECT manifest FROM h_planning_intent_attempts WHERE plan_id=? AND intent_id=? AND redacted=0').get(expected.planId, intentId);
      if (!content || hash(JSON.parse(String(content.manifest))) !== expected.manifestDigest)
        throw new HarnessError('planning_intent_adoption_changed', '本次重算使用的原采用证明已改变，须重新核查后再安排。');
    }
  }
  private adoption(handle: ScopeHandle, record: WorkRecord, calendar: Action[]) {
    this.scope(handle, true); this.repo.readWorkSources(handle, record);
    // The parent's current binding cannot authorize an earlier specification.
    // Inspect only opaque metadata until every attempt's own sources pass.
    const rows = this.repo.db.prepare('SELECT plan_id,spec_digest,source_binding,redacted FROM h_planning_intent_attempts WHERE intent_id=? ORDER BY created_at,plan_id').all(record.id);
    if (rows.some(row => Number(row.redacted) !== 0 || !this.attemptBindingReadable(handle, row.source_binding)))
      return { status: 'needs_review' as const, evidenceCoverage: 'unavailable' as const, observations: [], allocatedMinutes: null,
        reasons: ['有旧采用依据不在当前范围或不可复核，不能据此推断未保存；请核查当前许可来源和真实动作结果。'],
        calendarFingerprint: calendarPlanFingerprint(calendar) };
    const attemptBasis: PlanningAttemptBasis[] = [];
    const attempts: PlanningAttemptRecord[] = rows.map(row => {
      const content = this.repo.db.prepare('SELECT manifest,created_at FROM h_planning_intent_attempts WHERE plan_id=? AND intent_id=? AND redacted=0').get(String(row.plan_id), record.id);
      if (!content) throw new HarnessError('planning_intent_changed', '读取期间规划采用依据已变化。');
      const manifest = JSON.parse(String(content.manifest)) as PlanningManifest;
      attemptBasis.push({ planId: String(row.plan_id), intentId: record.id, specDigest: String(row.spec_digest),
        manifestDigest: hash(manifest), sourceBinding: workSourceBindingSchema.parse(JSON.parse(String(row.source_binding))) });
      return { planId: String(row.plan_id), intentId: record.id, specDigest: String(row.spec_digest), manifest, createdAt: String(content.created_at) };
    });
    const links: PlanningActionLink[] = attempts.flatMap(attempt => this.repo.db.prepare('SELECT * FROM h_planning_intent_action_links WHERE plan_id=?').all(attempt.planId)
      .map(row => ({ planId: attempt.planId, blockId: String(row.block_id), actionId: String(row.action_id), actionRevision: Number(row.action_revision), actionDigest: String(row.action_digest) })));
    const ids = [...new Set(links.map(link => link.actionId))];
    const scope = this.scope(handle, true), actions: EffectAction[] = [], actionAttempts: PlanningAdoptionInput['actionAttempts'] = [], receipts: EffectReceipt[] = [];
    for (const id of ids) {
      const row = this.repo.db.prepare('SELECT payload FROM h_actions WHERE id=? AND owner=? AND workspace=? AND subject=? AND world=?').get(id, scope.principalId, scope.workspaceId, scope.subjectId, scope.worldId);
      if (!row) continue;
      actions.push(JSON.parse(String(row.payload)) as EffectAction);
      actionAttempts.push(...this.repo.db.prepare('SELECT id,action_id,idempotency_key,status FROM h_attempts WHERE action_id=?').all(id)
        .map(attempt => ({ id: String(attempt.id), actionId: id, idempotencyKey: String(attempt.idempotency_key), status: String(attempt.status) })));
      receipts.push(...this.repo.db.prepare('SELECT payload FROM h_receipts WHERE action_id=?').all(id).map(receipt => JSON.parse(String(receipt.payload)) as EffectReceipt));
    }
    const calendarRevisions: Record<string, number> = {};
    for (const item of calendar) calendarRevisions[item.id] = Number(this.repo.db.prepare('SELECT max(revision) revision FROM h_calendar_versions WHERE agenda_id=?').get(item.id)?.revision || item.revision || 1);
    return { ...projectPlanningAdoption({ intentId: record.id, specDigest: String(record.data.specDigest), spec: planningIntentSpecSchema.parse(record.data.spec),
      attempts, links, actions, actionAttempts, receipts, calendar, calendarRevisions, now: this.repo.clock.now() }), attemptBasis };
  }
  onPreparedAction(handle: ScopeHandle, action: EffectAction) {
    const old = this.linksForAction(action.id), parsed = planningPlanRefSchema.safeParse(action.arguments.planRef);
    if (old.length && (!parsed.success || old.some(link => link.planId !== parsed.data.planId || link.blockId !== parsed.data.blockId)))
      throw new HarnessError('planning_intent_detached_action', '已关联规划意图的动作不能去掉或更换原方案引用。');
    if (old.some(link => link.actionRevision === action.revision && link.actionDigest !== action.digest))
      throw new HarnessError('planning_intent_action_changed', '同一动作修订已有不同的完整参数身份。');
    if (!parsed.success) return;
    // Ordinary planner tickets keep their original effect-phase checks. This
    // hook owns only tickets explicitly bound to a persistent intention.
    if (!old.length && !this.planning.hasIntentBinding(parsed.data.planId)) return;
    const binding = this.planning.preparationBinding(this.scope(handle, true), parsed.data, action.arguments);
    this.planning.markPrepared(this.scope(handle, true), parsed.data.planId);
    if (!binding) { if (old.length) throw new HarnessError('planning_intent_ticket_missing', '原规划关联已不可用，不能恢复旧动作准备。'); return; }
    const ref = binding.intentRef;
    this.assertActionOwner(handle, action);
    const intentRecord = this.assertIntentReference(handle, ref), sourceBinding = intentRecord.sourceBinding!;
    const manifest = binding.manifest, unit = manifest.units.find(value => value.blockId === parsed.data.blockId);
    if (!unit || hash(action.arguments) !== unit.argumentsDigest || action.capability !== 'local.agenda.save')
      throw new HarnessError('planning_intent_parameters', '动作参数与宿主方案的完整保存单位不符。');
    if (!this.repo.db.isTransaction) throw new HarnessError('planning_intent_transaction', '规划采用关联须与动作准备在同一事务。');
    const prior = this.repo.db.prepare('SELECT intent_id,spec_digest,source_binding,redacted FROM h_planning_intent_attempts WHERE plan_id=?').get(parsed.data.planId);
    if (prior && (prior.intent_id !== ref.id || prior.spec_digest !== ref.specDigest || Number(prior.redacted) !== 0
      || !this.attemptBindingReadable(handle, prior.source_binding) || canonical(JSON.parse(String(prior.source_binding))) !== canonical(sourceBinding)))
      throw new HarnessError('planning_intent_manifest_conflict', '这个方案已有不同的持久归属或宿主清单。');
    if (prior) {
      const content = this.repo.db.prepare('SELECT manifest FROM h_planning_intent_attempts WHERE plan_id=? AND redacted=0').get(parsed.data.planId);
      if (!content || canonical(JSON.parse(String(content.manifest))) !== canonical(manifest))
        throw new HarnessError('planning_intent_manifest_conflict', '这个方案已有不同的宿主清单。');
    } else this.repo.db.prepare('INSERT INTO h_planning_intent_attempts(plan_id,intent_id,spec_digest,manifest,created_at,source_binding,redacted) VALUES(?,?,?,?,?,?,0)')
      .run(parsed.data.planId, ref.id, ref.specDigest, JSON.stringify(manifest), this.repo.clock.now(), JSON.stringify(sourceBinding));
    this.repo.db.prepare('INSERT OR IGNORE INTO h_planning_intent_action_links(plan_id,block_id,action_id,action_revision,action_digest) VALUES(?,?,?,?,?)')
      .run(parsed.data.planId, parsed.data.blockId, action.id, action.revision, action.digest);
  }
  private linksForAction(id: string): PlanningActionLink[] {
    return this.repo.db.prepare('SELECT * FROM h_planning_intent_action_links WHERE action_id=?').all(id).map(row => ({ planId: String(row.plan_id),
      blockId: String(row.block_id), actionId: id, actionRevision: Number(row.action_revision), actionDigest: String(row.action_digest) }));
  }
  private assertActionOwner(handle: ScopeHandle, action: EffectAction) {
    const scope = this.work.policy.validate(handle);
    if (action.ownerId !== scope.principalId || action.workspaceId !== scope.workspaceId || action.subjectId !== scope.subjectId
      || action.worldId !== scope.worldId || action.audience !== scope.audience)
      throw new HarnessError('planning_intent_scope', '动作不属于当前规划资料范围。');
    const current = this.repo.db.prepare('SELECT revision,payload FROM h_actions WHERE id=? AND owner=? AND workspace=?').get(action.id, scope.principalId, scope.workspaceId);
    if (!current || Number(current.revision) !== action.revision || (JSON.parse(String(current.payload)) as EffectAction).digest !== action.digest)
      throw new HarnessError('planning_intent_action_changed', '准备中的实际动作身份或版本已变化。');
  }
  assertActionCurrent(handle: ScopeHandle, action: EffectAction) {
    const links = this.linksForAction(action.id);
    if (!links.length) return;
    this.scope(handle, true);
    this.assertActionOwner(handle, action);
    const parsed = planningPlanRefSchema.safeParse(action.arguments.planRef);
    const link = parsed.success && links.find(value => value.planId === parsed.data.planId && value.blockId === parsed.data.blockId
      && value.actionRevision === action.revision && value.actionDigest === action.digest);
    if (!link) throw new HarnessError('planning_intent_detached_action', '动作的当前版本缺少原规划关联，不能按旧信息执行。');
    const metadata = this.repo.db.prepare('SELECT intent_id,spec_digest,source_binding,redacted FROM h_planning_intent_attempts WHERE plan_id=?').get(link.planId);
    if (!metadata || Number(metadata.redacted) !== 0 || !this.attemptBindingReadable(handle, metadata.source_binding))
      throw new HarnessError('planning_intent_source_unavailable', '原规划采用依据已不可复核，不能按旧参数执行。');
    const binding = this.planning.preparationBinding(this.scope(handle, true), action.arguments.planRef, action.arguments), ref = binding?.intentRef;
    if (!metadata || !ref || metadata.intent_id !== ref.id || metadata.spec_digest !== ref.specDigest)
      throw new HarnessError('planning_intent_ticket_missing', '原规划票据已不可用，须按当前意图重新规划。');
    this.assertIntentReference(handle, ref);
  }
}
