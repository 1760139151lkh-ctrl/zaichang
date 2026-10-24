import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, workSourceRefSchema, type EvidenceEvent, type ScopeHandle, type WorkRecord, type WorkSourceRef } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from './policy';
import { codePointSlice, canonical } from './semantics';
import type { WorkflowRequirement, WorkflowSkill } from './skills';
import { personalMethodUsageSchema, type PersonalMethodUsage } from '../../shared/companion-continuity';
import { methodAssistanceInputSchema, methodWorkAnchorInputSchema, personalMethodConditionsSchema,
  personalMethodSourcesSchema, type PersonalMethodSources } from '../../shared/personal-method';
import { methodWorkHelpInputSchema } from '../../shared/method-work-help';
import type { MethodWorkHelpOwner, PreparedMethodWorkHelp } from './method-work-help';

const refSchema = z.object({ eventId: z.string().min(1).max(160), contentVersion: z.number().int().positive(),
  start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1).max(18000) }).strict();
const authorizationSchema = refSchema.extend({ quote: z.string().min(1).max(2000) });
const requirementSchema = z.object({ kind: z.enum(['tool', 'capability']), name: z.string().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/),
  purpose: z.string().min(1).max(500), optional: z.boolean().optional(), coverageNote: z.string().max(600).optional() }).strict();
const methodSchema = z.object({ name: z.string().min(1).max(120), description: z.string().min(1).max(1200),
  instructions: z.string().min(1).max(18000), requirements: z.array(requirementSchema).max(24),
  usage: personalMethodUsageSchema.default('work').describe('work留下一种做事的办法；conversation留下对方希望以后也沿用的相处方式。只靠文字就能做的，requirements可以留空。'),
  conditions: personalMethodConditionsSchema.optional().describe('从那次真正有帮助的地方写起：什么时候适合借用，今天想换一种时怎样跟上。由你来整理，对方用平常的话表达就好。') }).strict()
  .refine(value => new Set(value.requirements.map(item => item.kind + ':' + item.name)).size === value.requirements.length, '同一个方法需求只声明一次。');
// An amendment names only the parts that changed. In particular, omitting
// conditions or requirements cannot erase them or reset the method's usage.
const methodRevisionSchema = z.object({
  name: methodSchema.shape.name.optional(), description: methodSchema.shape.description.optional(),
  instructions: methodSchema.shape.instructions.optional(), requirements: methodSchema.shape.requirements.optional(),
  usage: personalMethodUsageSchema.optional(), conditions: personalMethodConditionsSchema.partial().optional(),
}).strict().refine(value => Object.entries(value).some(([key, part]) => part !== undefined
  && (key !== 'conditions' || Object.values(part).some(field => field !== undefined))), '写下这次想改的那一处，其他地方会留下。')
  .describe('只写这次想改的地方；conditions也可以只写其中一项，其他步骤、条件和用途都留下。若要整份重写，就把完整方法写出来。');
const methodId = z.string().regex(/^personal:[0-9a-f-]{36}$/);
export const personalMethodInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('save'), method: methodSchema, source: authorizationSchema, supports: z.array(refSchema).max(16).default([]),
    assistance: z.array(methodAssistanceInputSchema).max(4).default([]), workAssistance: z.array(methodWorkHelpInputSchema).max(4).default([]),
    workAnchors: z.array(methodWorkAnchorInputSchema).max(4).default([]) }).strict(),
  z.object({ operation: z.literal('revise'), id: methodId, expectedRevision: z.number().int().positive(),
    revisionMode: z.enum(['amend', 'replace']).default('amend').describe('amend只改这次说到的部分；对方想重写整份时用replace。你来照顾这一区别，无需让对方填写。'),
    method: methodRevisionSchema, source: authorizationSchema, supports: z.array(refSchema).max(16).default([]),
    assistance: z.array(methodAssistanceInputSchema).max(4).default([]), workAssistance: z.array(methodWorkHelpInputSchema).max(4).default([]),
    workAnchors: z.array(methodWorkAnchorInputSchema).max(4).default([]) }).strict(),
  z.object({ operation: z.literal('disable'), id: methodId, expectedRevision: z.number().int().positive(), source: authorizationSchema }).strict(),
]);
type MethodInput = z.infer<typeof personalMethodInput>;
interface MethodSession { events: EvidenceEvent[]; ephemeral: boolean; restrictToSessionId?: string;
  permits?: (ref: WorkSourceRef) => boolean }
type MethodReadContext = Pick<MethodSession, 'restrictToSessionId' | 'permits'>;
const ownershipReceiptSchema = z.object({ version: z.literal(1), ownerId: z.string(), workspaceId: z.string(),
  methodId, methodRevision: z.number().int().positive(), operation: z.enum(['save', 'revise', 'disable']),
  source: workSourceRefSchema, sourceQuoteSha256: z.string().regex(/^[a-f0-9]{64}$/),
  changedFields: z.array(z.string().min(1).max(100)).max(12), reviewDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  legacyOperationId: z.string().regex(/^personal-method:[a-f0-9]{64}$/).optional(),
  recordedAt: z.string().datetime().optional(),
}).strict().refine(value => !!value.reviewDigest !== !!value.legacyOperationId);
export interface PersonalMethodOwnership {
  receiptId: string; methodId: string; methodRevision: number; operation: 'save' | 'revise' | 'disable';
  source: WorkSourceRef; changedFields: string[]; reviewDigest?: string; legacyOperationId?: string; recordedAt?: string;
}

/** User-chosen procedural text in the existing work store. No executable plugin,
 * account permission, user fact, scheduler or independent agent is installed. */
export class PersonalMethodService {
  workHelpOwner?: MethodWorkHelpOwner;
  constructor(readonly repo: KernelRepository, readonly policy: PolicyKernel) {
    repo.verifyPersonalMethodSources = (handle, raw) => this.sourcesReadable(handle, raw);
  }
  get revision() { return this.repo.getMeta<number>('personal_methods_revision', 0); }

  /** Existing operation receipts identify an accepted procedural choice. They
   * contain no method prose and grant no access to an old method body. */
  ownership(handle: ScopeHandle, refs: readonly WorkSourceRef[]): PersonalMethodOwnership[] {
    const scope = this.policy.validate(handle);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.grants.includes('evidence:read') || !refs.length || this.repo.hasFence('work:self')) return [];
    const eventIds = [...new Set(refs.map(ref => ref.eventId))];
    const rows = this.repo.db.prepare(`SELECT id,result FROM h_operations WHERE kind='personal_method_choice'
      AND json_extract(result,'$.ownerId')=? AND json_extract(result,'$.workspaceId')=?
      AND json_extract(result,'$.source.eventId') IN (SELECT value FROM json_each(?))`)
      .all(scope.principalId, scope.workspaceId, JSON.stringify(eventIds));
    return rows.flatMap(row => {
      let stored: unknown;
      try { stored = JSON.parse(String(row.result)); } catch (error) { if (error instanceof SyntaxError) return []; throw error; }
      const parsed = ownershipReceiptSchema.safeParse(stored);
      if (!parsed.success) return [];
      const receipt = parsed.data, ref = receipt.source;
      if (!scope.sources.includes('work:self') && !scope.currentEventIds.includes(ref.eventId)) return [];
      if (!refs.some(selected => selected.eventId === ref.eventId && selected.contentVersion === ref.contentVersion
        && selected.start < ref.end && selected.end > ref.start)) return [];
      const source = this.repo.evidence(handle, ref.eventId);
      if (!source || !['active', 'redacted'].includes(source.status) || source.contentVersion !== ref.contentVersion
        || source.subjectId !== scope.principalId || source.worldId !== 'real' || source.speaker !== 'user'
        || source.authority !== 'user_statement' || source.parentEventId
        || !this.repo.citationMetadata(handle, { ...ref, role: 'authorization' })
        || createHash('sha256').update(codePointSlice(source.text, ref.start, ref.end)).digest('hex') !== receipt.sourceQuoteSha256) return [];
      // This metadata read does not unfold a method whose source is no longer
      // available. The accepted choice still has its own original address.
      // Recovery with only this current source may identify its own accepted
      // choice; it still cannot read any working text or regain an old scope.
      const method = this.repo.db.prepare(`SELECT r.revision FROM h_work r WHERE r.owner=? AND r.workspace=?
        AND r.subject=? AND r.world='real' AND r.audience='self' AND r.id=? AND r.kind='recipe_candidate'
        AND r.purpose IN (SELECT value FROM json_each(?)) AND (r.expires_at IS NULL OR julianday(r.expires_at)>julianday(?))
        AND json_extract(r.payload,'$.data.type')='personal_method'`).get(scope.principalId, scope.workspaceId,
        scope.principalId, receipt.methodId.slice('personal:'.length), JSON.stringify(scope.purposes), this.repo.clock.now());
      if (!method || Number(method.revision) < receipt.methodRevision || this.repo.hasFence(receipt.methodId.slice('personal:'.length), 'work:self')) return [];
      return [{ receiptId: String(row.id), methodId: receipt.methodId, methodRevision: receipt.methodRevision,
        operation: receipt.operation, source: ref, changedFields: receipt.changedFields,
        ...(receipt.recordedAt ? { recordedAt: receipt.recordedAt } : {}),
        ...(receipt.reviewDigest ? { reviewDigest: receipt.reviewDigest } : { legacyOperationId: receipt.legacyOperationId! }) }];
    }).sort((a, b) => a.receiptId.localeCompare(b.receiptId));
  }

  private recordOwnership(handle: ScopeHandle, input: MethodInput, id: string, revision: number,
    proof: { reviewDigest: string } | { legacyOperationId: string }) {
    const scope = this.owner(handle, true), { quote, ...source } = input.source;
    const changedFields = input.operation === 'disable' ? ['status'] : Object.entries(input.method)
      .filter(([, value]) => value !== undefined).flatMap(([field, value]) => field === 'conditions' && value && typeof value === 'object'
        ? Object.keys(value).map(key => 'conditions.' + key) : [field]);
    const receipt = ownershipReceiptSchema.parse({ version: 1, ownerId: scope.principalId, workspaceId: scope.workspaceId,
      methodId: id, methodRevision: revision, operation: input.operation, source,
      sourceQuoteSha256: createHash('sha256').update(quote).digest('hex'), changedFields, ...proof, recordedAt: this.repo.clock.now() });
    const { recordedAt: _recordedAt, ...identity } = receipt;
    const receiptId = 'personal-method-choice:' + createHash('sha256').update(canonical(identity)).digest('hex');
    if (!this.repo.operation(receiptId)) this.repo.completeOperation(receiptId, 'personal_method_choice', receipt);
  }

  /** Host recovery of a pre-receipt save. The complete original input must
   * reproduce the existing operation hash; this records no new approval and
   * changes neither method text nor source restrictions. */
  recoverSavedOwnership(handle: ScopeHandle, raw: unknown): PersonalMethodOwnership[] {
    const input = personalMethodInput.parse(raw), scope = this.owner(handle, true);
    if (input.operation !== 'save' || input.workAssistance.length || input.workAnchors.length)
      throw new HarnessError('method_ownership_recovery', '当时这份帮法的完整办理来由还没有找全，先保留原来的记录。');
    const operationId = 'personal-method:' + createHash('sha256').update(canonical({ owner: scope.principalId, workspace: scope.workspaceId, input })).digest('hex');
    const oldOperation = this.repo.operation<{ id: string; revision: number }>(operationId);
    const rememberedOwner = !oldOperation ? this.ownership(handle, [input.source]).find(receipt => receipt.legacyOperationId === operationId
      && receipt.operation === 'save' && receipt.methodRevision === 1) : undefined;
    const original = oldOperation || (rememberedOwner ? { id: rememberedOwner.methodId, revision: rememberedOwner.methodRevision } : undefined);
    if (!original || !methodId.safeParse(original.id).success || original.revision !== 1
      || oldOperation && !this.repo.db.prepare("SELECT 1 FROM h_operations WHERE id=? AND kind='personal_method'").get(operationId))
      throw new HarnessError('method_ownership_recovery', '这些内容没有与当时已经保存的那份做法对应上，没有补写过去的选择。');
    const verify = () => {
      if (this.repo.hasFence(original.id.slice('personal:'.length), 'work:self'))
        throw new HarnessError('method_ownership_recovery', '那份方法已经放下了，原来的记录会继续留在原处。');
      const metadata = this.repo.sourcedWorkMetadata(handle, original.id.slice('personal:'.length));
      if (!metadata || metadata.type !== 'personal_method' || metadata.kind !== 'recipe_candidate'
        || this.repo.hasFence(original.id.slice('personal:'.length), 'work:self'))
        throw new HarnessError('method_ownership_recovery', '原来的那份方法已经不在这里，先保留当时的记录。');
      for (const ref of [input.source, ...input.supports]) {
        const source = this.repo.evidence(handle, ref.eventId);
        if (!source || source.contentVersion !== ref.contentVersion || source.speaker !== 'user'
          || source.authority !== 'user_statement' || source.subjectId !== scope.principalId || source.worldId !== 'real'
          || source.parentEventId || !this.repo.citationMetadata(handle, { ...ref, role: 'authorization' })
          || codePointSlice(source.text, ref.start, ref.end) !== ref.quote)
          throw new HarnessError('method_ownership_recovery', '当时一段原话已经变化，先沿现在还能翻到的内容继续。');
      }
      for (const source of input.assistance) if (!this.repo.personalMethodAssistantSource(handle, source))
        throw new HarnessError('method_ownership_recovery', '当时真正提供的那段帮助现在翻不到，没有从旧副本补写它。');
      if (oldOperation ? canonical(this.repo.operation(operationId)) !== canonical(original)
        : this.repo.operation(operationId) !== undefined || !this.ownership(handle, [input.source])
          .some(receipt => canonical(receipt) === canonical(rememberedOwner)))
        throw new HarnessError('method_ownership_recovery', '当时的办理记录刚有变化，先留在原处。');
    };
    return this.repo.write(() => {
      verify();
      this.recordOwnership(handle, input, original.id, original.revision, { legacyOperationId: operationId });
      return this.ownership(handle, [input.source]);
    });
  }

  async prepareWorkHelp(handle: ScopeHandle, session: MethodSession, raw: unknown, signal?: AbortSignal) {
    const input = personalMethodInput.parse(raw);
    this.authorization(handle, session, input.source);
    if (session.ephemeral) throw new HarnessError('personal_method_retention', '这次原话不保留，眼前可以直接这样帮，没有保存长期方法。');
    const prepared: PreparedMethodWorkHelp[] = [];
    for (const source of input.operation === 'disable' ? [] : input.workAssistance) {
      if (!this.workHelpOwner) throw new HarnessError('personal_method_help_owner', '现在打不开当时那份帮助，可以先照顾眼前这一步。');
      prepared.push(await this.workHelpOwner.prepare(handle, source, { permits: session.permits,
        restrictToSessionId: session.restrictToSessionId, signal }));
      this.authorization(handle, session, input.source);
    }
    return prepared;
  }

  private owner(handle: ScopeHandle, write = false) {
    const scope = write ? this.policy.require(handle, 'work:write') : this.policy.validate(handle);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || write && (scope.child || scope.retention !== 'purpose_scoped') || !scope.sources.includes('work:self'))
      throw new HarnessError('personal_method_scope', '这次先照顾眼前的帮助，个人方法留待可以保存和翻看的时候再整理。');
    return scope;
  }
  private authorization(handle: ScopeHandle, session: MethodSession, ref: z.infer<typeof refSchema>) {
    const scope = this.owner(handle, true), event = session.events.find(value => value.id === ref.eventId);
    if (!event || !scope.currentEventIds.includes(event.id) || event.speaker !== 'user'
      || !['user_message', 'user_control'].includes(event.kind) || event.parentEventId
      || event.subjectId !== scope.principalId || event.worldId !== 'real' || event.status !== 'active' || event.authority !== 'user_statement'
      || session.permits?.(ref) === false || session.restrictToSessionId && event.sessionId !== session.restrictToSessionId
      || event.contentVersion !== ref.contentVersion || ref.end <= ref.start || codePointSlice(event.text, ref.start, ref.end) !== ref.quote)
      throw new HarnessError('personal_method_source', '还没找到对方这次想留下、修改或放下这份方法的那句话，可以先按眼前的意思帮忙。');
    // The current statement can change while the bounded intent verifier runs.
    // Even metadata-only stopping rechecks its own new authorization, without
    // reopening the old method or inheriting that method's former sources.
    if (!session.ephemeral) {
      this.repo.resolveWorkSourceBinding(handle, [{ eventId: ref.eventId, contentVersion: ref.contentVersion, start: ref.start, end: ref.end }]);
      const current = this.repo.evidence(handle, ref.eventId);
      if (!current || current.status !== 'active' || codePointSlice(current.text, ref.start, ref.end) !== ref.quote)
        throw new HarnessError('personal_method_source', '刚才关于这份方法的原话已经变了，需要按现在的意思继续。');
    }
    return event;
  }
  private metadata(handle: ScopeHandle, id: string, revision: number) {
    if (this.repo.hasFence(id.slice('personal:'.length), 'work:self'))
      throw new HarnessError('personal_method_missing', '这份方法已经放下了，先照顾眼前的需要。');
    const current = this.repo.sourcedWorkMetadata(handle, id.slice('personal:'.length));
    if (!current || current.type !== 'personal_method' || current.kind !== 'recipe_candidate')
      throw new HarnessError('personal_method_missing', '这份个人工作方法不存在或已删除。');
    if (current.revision !== revision) throw new HarnessError('revision_conflict', '这份方法已有新版本，手上的修订地址与当前版本没有对应上。');
    return current;
  }
  private support(handle: ScopeHandle, session: MethodSession, input: Exclude<MethodInput, { operation: 'disable' }>, prepared: readonly PreparedMethodWorkHelp[]) {
    if (prepared.length !== input.workAssistance.length || prepared.some((value, index) => canonical(value.input) !== canonical(input.workAssistance[index])
      || this.workHelpOwner?.verify(handle, value.proof) !== true || !this.refsPermitted(handle, value.proof.sourceBinding.refs, session)))
      throw new HarnessError('personal_method_help_proof', '当时那页帮助现在还没能完整翻开，可以从今天真正读到的内容开始整理。');
    const assistance = input.assistance.map(source => {
      const original = this.repo.personalMethodAssistantSource(handle, { ...source,
        ...(session.restrictToSessionId ? { sessionId: session.restrictToSessionId } : {}) });
      if (!original || !this.refsPermitted(handle, original.sourceRefs, session))
        throw new HarnessError('personal_method_assistance', '现在找不全当时那段帮助，先照顾今天这一处。');
      return { stored: { messageId: source.messageId, start: source.start, end: source.end,
        contentSha256: original.contentSha256, sourceRefs: original.sourceRefs },
        review: { ...source, origin: 'actual_assistant_help_not_authorization' as const } };
    });
    const anchors = input.workAnchors.map(source => {
      const record = this.repo.work(handle, source.kind === 'collaboration_frame' ? 'episode' : 'experience', source.id)[0];
      if (!record || record.revision !== source.revision || record.data.type !== source.kind || !record.sourceBinding
        || !this.refsPermitted(handle, record.sourceBinding.refs, session)
        || session.restrictToSessionId && record.data.sessionId !== session.restrictToSessionId
          && !(Array.isArray(record.data.sessionIds) && record.data.sessionIds.includes(session.restrictToSessionId))
        || source.kind === 'learning_process' && !this.repo.learningProcessReadable(handle, record.id, record.revision))
        throw new HarnessError('personal_method_practice', '当时一起做的那件事已经变了，先翻到现在那一页，再看看哪部分帮法值得留下。');
      return { id: record.id, revision: record.revision, kind: source.kind,
        matterId: source.kind === 'collaboration_frame' ? record.id : String(record.data.matterId), sourceBinding: record.sourceBinding };
    });
    let previous: WorkRecord | undefined;
    if (input.operation === 'revise' && input.revisionMode === 'amend') {
      previous = this.repo.work(handle, 'recipe_candidate', input.id.slice('personal:'.length))[0];
      if (!previous || previous.revision !== input.expectedRevision || previous.data.type !== 'personal_method' || !previous.sourceBinding
        || this.repo.hasFence(previous.id, 'work:self')
        || !this.refsPermitted(handle, previous.sourceBinding.refs, session)
        || !this.supportPermitted(handle, previous.data.methodSources, session))
        throw new HarnessError('personal_method_changed', '原来的方法现在翻不完整，其他条件先留在原处；眼前想换的帮法可以直接用起来。');
    }
    const prior = previous?.data.methodSources ? personalMethodSourcesSchema.parse(previous.data.methodSources) : undefined;
    const inherited = prepared.flatMap(value => value.inheritedSources);
    const inheritedBindings = [...(prior?.methodBinding?.refs || []), ...inherited.flatMap(value => value.methodBinding?.refs || [])];
    const sources: PersonalMethodSources = personalMethodSourcesSchema.parse({ version: 1,
      ...(inheritedBindings.length ? { methodBinding: this.repo.resolveWorkSourceBinding(handle, inheritedBindings) } : {}),
      workAssistance: [...new Map([...(prior?.workAssistance || []), ...inherited.flatMap(value => value.workAssistance), ...prepared.map(value => value.proof)]
        .map(value => [canonical(value), value])).values()],
      assistance: [...new Map([...(prior?.assistance || []), ...inherited.flatMap(value => value.assistance), ...assistance.map(value => value.stored)]
        .map(value => [canonical(value), value])).values()],
      anchors: [...new Map([...(prior?.anchors || []), ...inherited.flatMap(value => value.anchors), ...anchors]
        .map(value => [canonical(value), value])).values()] });
    if (!this.supportPermitted(handle, sources, session) || !this.sourcesReadable(handle, sources))
      throw new HarnessError('personal_method_help_changed', '当时帮助的一处来由刚有变化，先沿现在能翻到的内容继续。');
    return { sources, assistance: assistance.map(value => value.review),
      workAssistance: prepared.map(value => ({ ...value.input, origin: 'actual_owner_help_not_authorization' as const })), previous };
  }

  sourcesReadable(handle: ScopeHandle, raw: unknown): boolean {
    const parsed = personalMethodSourcesSchema.safeParse(raw);
    if (!parsed.success) return false;
    return (!parsed.data.methodBinding || this.repo.workBindingsReadable(handle, [parsed.data.methodBinding]))
      && parsed.data.workAssistance.every(source => this.workHelpOwner?.verify(handle, source) === true)
      && parsed.data.anchors.every(anchor => !this.repo.hasFence(anchor.id)
      && this.repo.workBindingsReadable(handle, [anchor.sourceBinding]))
      && parsed.data.assistance.every(source => {
        const current = this.repo.personalMethodAssistantSource(handle, source);
        return !!current && canonical(current.sourceRefs) === canonical(source.sourceRefs);
      });
  }

  private refsPermitted(handle: ScopeHandle, refs: readonly WorkSourceRef[], context: MethodReadContext) {
    return refs.every(ref => context.permits?.(ref) !== false && (!context.restrictToSessionId
      || this.repo.evidence(handle, ref.eventId)?.sessionId === context.restrictToSessionId));
  }

  private supportPermitted(handle: ScopeHandle, raw: unknown, context: MethodReadContext) {
    if (raw === undefined) return true;
    const parsed = personalMethodSourcesSchema.safeParse(raw);
    return parsed.success && this.refsPermitted(handle, [...parsed.data.assistance.flatMap(source => source.sourceRefs),
      ...parsed.data.workAssistance.flatMap(source => source.sourceBinding.refs),
      ...parsed.data.anchors.flatMap(anchor => anchor.sourceBinding.refs), ...(parsed.data.methodBinding?.refs || [])], context);
  }

  private binding(handle: ScopeHandle, input: Exclude<MethodInput, { operation: 'disable' }>, sources: PersonalMethodSources, session: MethodSession, previous?: WorkRecord) {
    const refs = [input.source, ...input.supports];
    const binding = this.repo.resolveWorkSourceBinding(handle, [...refs.map(({ quote: _quote, ...ref }) => ref),
      ...sources.assistance.flatMap(source => source.sourceRefs), ...sources.workAssistance.flatMap(source => source.sourceBinding.refs),
      ...sources.anchors.flatMap(anchor => anchor.sourceBinding.refs), ...(sources.methodBinding?.refs || []), ...(previous?.sourceBinding?.refs || [])]);
    if (!this.refsPermitted(handle, binding.refs, session))
      throw new HarnessError('personal_method_support', '这次能翻看的内容还不够整理这份方法，其他旧话先留在原处。');
    for (const ref of refs) {
      const event = this.repo.evidence(handle, ref.eventId);
      if (!event || event.contentVersion !== ref.contentVersion || codePointSlice(event.text, ref.start, ref.end) !== ref.quote
        || session.permits?.(ref) === false || session.restrictToSessionId && event.sessionId !== session.restrictToSessionId)
        throw new HarnessError('personal_method_support', '方法用到的那段话已经变了，先按现在的意思继续。');
    }
    return binding;
  }

  private method(input: Exclude<MethodInput, { operation: 'disable' }>, previous?: WorkRecord) {
    if (input.operation !== 'revise' || input.revisionMode === 'replace') return methodSchema.parse(input.method);
    if (!previous) throw new HarnessError('personal_method_changed', '原来的方法现在读不完整，先照顾这次想改的地方。');
    const original = methodSchema.parse(previous.data.method);
    const changes = Object.fromEntries(Object.entries(input.method).filter(([, value]) => value !== undefined));
    const conditions = input.method.conditions && Object.fromEntries(Object.entries(input.method.conditions).filter(([, value]) => value !== undefined));
    return methodSchema.parse({ ...original, ...changes,
      ...(conditions ? { conditions: { ...original.conditions, ...conditions } } : {}) });
  }

  private review<T extends object>(preview: T) {
    return { ...preview, reviewDigest: createHash('sha256').update(canonical(preview)).digest('hex') };
  }

  preview(handle: ScopeHandle, session: MethodSession, raw: unknown, known: (requirement: WorkflowRequirement) => boolean,
    prepared: readonly PreparedMethodWorkHelp[] = []) {
    const input = personalMethodInput.parse(raw);
    this.authorization(handle, session, input.source);
    if (session.ephemeral) throw new HarnessError('personal_method_retention', '这次的话只留在眼前，可以直接这样帮，等对方愿意留到以后时再整理。');
    if (input.operation === 'disable') {
      const current = this.metadata(handle, input.id, input.expectedRevision);
      return this.review({ targetKind: 'personal_method', operation: input.operation, current, source: input.source,
        meaning: '这份方法现在的状态在这里。对方想把它放下，接下来就照这次的意思停用；以前的话和另外约好的事仍各自留着。' });
    }
    const current = input.operation === 'revise' ? this.metadata(handle, input.id, input.expectedRevision) : undefined;
    const support = this.support(handle, session, input, prepared), method = this.method(input, support.previous);
    if ((input.assistance.length || input.workAssistance.length) && !method.conditions)
      throw new HarnessError('personal_method_conditions', '再想一想刚才哪里帮上了忙，把适合借用的时候和今天想换法时怎样跟上一起写下来。你来整理就好。');
    const unknown = method.requirements.filter(requirement => !known(requirement));
    if (unknown.length) throw new HarnessError('personal_method_requirement', '这份做法用到的一个帮手现在还找不到。可以先把已有工具能做的部分写清楚，保留实际可用的帮法。');
    const binding = this.binding(handle, input, support.sources, session, support.previous);
    return this.review({ targetKind: 'personal_method', operation: input.operation, current, method,
      source: input.source, supports: input.supports, assistance: support.assistance, workAssistance: support.workAssistance,
      ...(session.events.find(event => event.id === input.source.eventId)?.sourceContext
        ? { authorizationContext: session.events.find(event => event.id === input.source.eventId)!.sourceContext } : {}),
      workAnchors: support.sources.anchors, binding,
      methodSources: support.sources,
      ...(input.operation === 'revise' ? { revisionMode: input.revisionMode,
        methodChanges: input.method,
        ...(support.previous ? { previousMethod: methodSchema.parse(support.previous.data.method), previousBinding: support.previous.sourceBinding } : {}) } : {}),
      digest: createHash('sha256').update(canonical({ method, binding })).digest('hex'),
      meaning: '这是按对方这次的意思整理的做法，连同它的来由一起放在这里。若只改一处，其他步骤和条件也在这一版里完整留下；看看是否正好接住了想改的地方。' });
  }

  /** The host captures this identity before asking whether the displayed
   * proposal matches the person's choice. Approval covers that proposal only. */
  save(handle: ScopeHandle, session: MethodSession, raw: unknown, known: (requirement: WorkflowRequirement) => boolean,
    prepared: readonly PreparedMethodWorkHelp[] = [], reviewedDigest: string) {
    const input = personalMethodInput.parse(raw), scope = this.owner(handle, true);
    return this.repo.write(() => {
      const preview = this.preview(handle, session, input, known, prepared);
      if (typeof reviewedDigest !== 'string' || preview.reviewDigest !== reviewedDigest)
        throw new HarnessError('personal_method_review_changed', '这份方法和刚才一起看过的内容不一样了，需要先看清这次改动；原方法还留在原处。');
      const now = this.repo.clock.now();
      const operationId = 'personal-method:' + createHash('sha256').update(canonical({ owner: scope.principalId, workspace: scope.workspaceId, input })).digest('hex');
      if (input.operation === 'save') {
        const previous = this.repo.operation<{ id: string; revision: number }>(operationId);
        if (previous) {
          const current = this.repo.sourcedWorkMetadata(handle, previous.id.slice('personal:'.length));
          return { id: previous.id, revision: current?.revision ?? previous.revision,
            status: current?.status || 'unavailable', guidanceOnly: true as const, repeated: true,
            meaning: '这次想留下的做法已经存过了，现在的状态在这里；仍用原来那份。' };
        }
      }
      if (input.operation === 'disable') {
        const current = this.metadata(handle, input.id, input.expectedRevision), revision = current.revision + 1;
        // Metadata-only stop remains possible after the original method source
        // becomes unreadable. It cannot resume or replace that old source.
        this.repo.db.prepare(`UPDATE h_work SET status='disabled',revision=?,payload=json_set(payload,
          '$.status','disabled','$.revision',?,'$.data.updatedAt',?) WHERE id=? AND revision=?`)
          .run(revision, revision, now, current.id, current.revision);
        this.repo.outbox('work_changed', current.id);
        this.repo.setMeta('personal_methods_revision', this.revision + 1);
        this.repo.invalidate(current.id, 'personal_method_disabled');
        this.recordOwnership(handle, input, input.id, revision, { reviewDigest: reviewedDigest });
        return { id: input.id, revision, status: 'disabled' as const, guidanceOnly: true as const,
          meaning: '这份方法已经放下了，之后的帮助照眼前的意思来；另外留下的做法和约定仍各自留着。' };
      }
      const current = input.operation === 'revise' ? this.metadata(handle, input.id, input.expectedRevision) : undefined;
      const id = current?.id || randomUUID(), support = this.support(handle, session, input, prepared), binding = this.binding(handle, input, support.sources, session, support.previous);
      const method = this.method(input, support.previous);
      const sourceSessionId = session.events.find(event => event.id === input.source.eventId)?.sessionId;
      const record: WorkRecord = { id, kind: 'recipe_candidate', ownerId: scope.principalId, workspaceId: scope.workspaceId,
        subjectId: scope.subjectId, worldId: scope.worldId, revision: current ? current.revision + 1 : 1,
        status: current?.status === 'disabled' ? 'disabled' : 'active', title: method.name,
        evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], sourceBinding: binding,
        label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false },
        data: { type: 'personal_method', method, methodSources: support.sources,
          recordedAt: typeof support.previous?.data.recordedAt === 'string' ? support.previous.data.recordedAt : now, updatedAt: now,
          sourceIds: [...new Set([...binding.sourceIds, ...(support.sources.assistance.length
            || support.sources.workAssistance.some(source => source.owner === 'companion_session') ? ['history:self'] : [])])],
          ...(sourceSessionId ? { sessionId: sourceSessionId } : {}) } };
      this.repo.saveSourcedWork(handle, record, current?.revision);
      for (const source of support.sources.assistance) this.repo.addDependency(handle, { consumerId: record.id,
        producerId: source.messageId, producerRevision: 1, sensitivity: 'privacy', invalidation: 'block' });
      for (const source of support.sources.workAssistance) if (source.owner === 'companion_session')
        for (const [producerId, producerRevision] of [[source.messageId, 1], [source.sceneId, source.sceneRevision],
          ...source.assistantMaterials.map(material => [material.messageId, 1] as const)] as const)
          this.repo.addDependency(handle, { consumerId: record.id, producerId, producerRevision, sensitivity: 'privacy', invalidation: 'block' });
      if (input.operation === 'save') this.repo.completeOperation(operationId, 'personal_method', { id: 'personal:' + id, revision: record.revision });
      this.recordOwnership(handle, input, 'personal:' + id, record.revision, { reviewDigest: reviewedDigest });
      this.repo.setMeta('personal_methods_revision', this.revision + 1);
      if (current) this.repo.invalidate(id, 'personal_method_revised');
      return { id: 'personal:' + id, revision: record.revision, status: record.status, guidanceOnly: true as const,
        name: method.name, methodDigest: createHash('sha256').update(canonical(method)).digest('hex'),
        read: { tool: 'read_skill', id: 'personal:' + id },
        meaning: input.operation === 'revise'
          ? '想改的地方已经留好了，其他独立的帮法仍留在原处。下次遇到合适的时候，可以从这一版借一点；今天怎么接力，仍照今天的意思。'
          : '这份做法和当时的来由已经一起留好了。以后碰到合适的时候，可以自然借来帮忙；对方想自己来、想换一种时，就跟着今天的意思走。' };
    });
  }

  readHelp(handle: ScopeHandle, address: { id: string; revision: number; index: number }, context: MethodReadContext = {}) {
    this.owner(handle);
    if (this.repo.hasFence(address.id.slice('personal:'.length), 'work:self'))
      throw new HarnessError('personal_method_changed', '这份方法已经放下了，先照顾眼前的需要。');
    const current = this.repo.work(handle, 'recipe_candidate', address.id.slice('personal:'.length))[0];
    if (!current || current.revision !== address.revision || current.status !== 'active' || current.data.type !== 'personal_method'
      || this.repo.hasFence(current.id, 'work:self')
      || !current.sourceBinding || !this.refsPermitted(handle, current.sourceBinding.refs, context)
      || !this.supportPermitted(handle, current.data.methodSources, context))
      throw new HarnessError('personal_method_changed', '这份方法已经变了，或这次还翻不到它，可以先按眼前的需要帮忙。');
    const sources = personalMethodSourcesSchema.parse(current.data.methodSources), proof = sources.workAssistance[address.index];
    const text = proof && this.workHelpOwner?.read(handle, proof, context);
    if (text === undefined) throw new HarnessError('personal_method_help_changed', '当时那段帮助现在翻不到了，眼前的方法文字还可以按今天的需要重新商量。');
    return { data: { methodId: address.id, methodRevision: current.revision, origin: 'actual_assistant_help_not_user_approval' as const,
      owner: proof.owner, matterId: proof.matterId, text, coverage: { start: proof.start, end: proof.end },
      interpretation: 'original_help_excerpt_not_current_work_or_authorization' as const }, record: current,
      sources: { ...sources, methodBinding: current.sourceBinding } };
  }

  catalog(handle: ScopeHandle, selected: { id?: string; revision?: number; usage?: PersonalMethodUsage; sessionId?: string;
    permits?: MethodSession['permits'] } = {}): (WorkflowSkill & { usage: PersonalMethodUsage })[] {
    const scope = this.policy.validate(handle);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read') || this.repo.hasFence('work:self')) return [];
    const result: (WorkflowSkill & { usage: PersonalMethodUsage })[] = [];
    const { usage, permits, ...address } = selected;
    const context = { permits, restrictToSessionId: selected.sessionId };
    for (let offset = 0; ; offset += 100) {
      const rows = this.repo.workData(handle, ['personal_method'], { ...address, statuses: ['active'], limit: 100, offset });
      for (const record of rows) {
        const method = methodSchema.safeParse(record.data.method);
        if (!method.success || record.kind !== 'recipe_candidate' || !record.sourceBinding || usage && method.data.usage !== usage
          || this.repo.hasFence(record.id, 'work:self')
          || !this.refsPermitted(handle, record.sourceBinding.refs, context) || !this.supportPermitted(handle, record.data.methodSources, context)) continue;
        result.push({ id: 'personal:' + record.id, version: String(record.revision), ...method.data,
          supportingHelp: record.data.methodSources ? (() => {
            const sources = personalMethodSourcesSchema.parse(record.data.methodSources);
            return { assistance: sources.assistance.map(source => ({ messageId: source.messageId, start: source.start, end: source.end,
              read: { tool: 'read_assistant_history', arguments: { id: source.messageId, offset: source.start, limit: source.end - source.start } } })),
              workAssistance: sources.workAssistance.map((source, index) => ({ owner: source.owner, id: source.id, revision: source.revision,
                matterId: source.matterId, start: source.start, end: source.end,
                read: { tool: 'read_method_help', arguments: { id: 'personal:' + record.id, revision: record.revision, index } } })),
              work: sources.anchors.map(anchor => ({ id: anchor.id, revision: anchor.revision, matterId: anchor.matterId, kind: anchor.kind,
                read: anchor.kind === 'learning_process' ? { tool: 'read_learning', arguments: { matterId: anchor.matterId, id: anchor.id } }
                  : { tool: 'restore_collaboration', arguments: { id: anchor.id } } })) };
          })() : undefined,
          personalMethod: { workId: record.id, revision: record.revision, sourceIds: record.sourceBinding.sourceIds } });
      }
      if (rows.length < 100) break;
    }
    return result;
  }

  /** Few conditional discovery heads. Instructions still come from read_skill;
   * the main assistant judges relevance without a scenario keyword router. */
  cues(handle: ScopeHandle, options: { limit?: number; permits?: MethodSession['permits'] } = {}) {
    const scope = this.policy.validate(handle), limit = Math.min(6, Math.max(1, options.limit ?? 4));
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read') || this.repo.hasFence('work:self')) return { items: [], records: [], moreMayExist: false };
    // Keep the projection small without letting a page of conversational or
    // excluded methods hide every working method behind it. A bounded scan
    // can still end before the catalogue; discovery remains available then.
    const available: { record: WorkRecord; method: z.infer<typeof methodSchema> }[] = [];
    const pageSize = 20, scanLimit = 100;
    let moreMayExist = false;
    for (let offset = 0; offset < scanLimit; offset += pageSize) {
      const rows = this.repo.workData(handle, ['personal_method'], { statuses: ['active'], limit: pageSize, offset });
      for (const record of rows) {
        const method = methodSchema.safeParse(record.data.method);
        if (!method.success || record.kind !== 'recipe_candidate' || method.data.usage !== 'work' || !record.sourceBinding
          || this.repo.hasFence(record.id, 'work:self')
          || !this.refsPermitted(handle, record.sourceBinding.refs, options)
          || !this.supportPermitted(handle, record.data.methodSources, options)) continue;
        available.push({ record, method: method.data });
        if (available.length > limit) break;
      }
      moreMayExist = available.length > limit || rows.length === pageSize;
      if (available.length > limit || rows.length < pageSize) break;
    }
    const picked = available.slice(0, limit);
    return { items: picked.map(({ record, method }) => ({ id: 'personal:' + record.id, revision: record.revision, name: method.name,
      description: Array.from(method.description).slice(0, 300).join(''),
      ...(method.conditions ? { conditions: { when: Array.from(method.conditions.when).slice(0, 240).join(''),
        adaptToCurrent: Array.from(method.conditions.adaptToCurrent).slice(0, 240).join(''),
        ...(method.conditions.avoidWhen ? { avoidWhen: Array.from(method.conditions.avoidWhen).slice(0, 200).join('') } : {}) } } : {}),
      instructionsRead: false,
      conditionsComplete: !method.conditions || Array.from(method.conditions.when).length <= 240 && Array.from(method.conditions.adaptToCurrent).length <= 240
        && (!method.conditions.avoidWhen || Array.from(method.conditions.avoidWhen).length <= 200),
      read: { tool: 'read_skill', arguments: { id: 'personal:' + record.id } } })),
      records: picked.map(value => value.record), moreMayExist };
  }
}
