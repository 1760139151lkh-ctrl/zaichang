import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, type EvidenceEvent, type ScopeHandle, type WorkRecord } from '../../shared/harness';
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
  usage: personalMethodUsageSchema.default('work').describe('work是做事方法；conversation是用户明确选择的长期相处做法，可以没有工具需求，不是提醒或角色核心改动。'),
  conditions: personalMethodConditionsSchema.optional().describe('伙伴从实际帮助起草适用条件和如何随当前意愿调整；不是用户必须填写的标签，不把一时状态固定成人格。') }).strict()
  .refine(value => new Set(value.requirements.map(item => item.kind + ':' + item.name)).size === value.requirements.length, '同一个方法需求只声明一次。');
const methodId = z.string().regex(/^personal:[0-9a-f-]{36}$/);
export const personalMethodInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('save'), method: methodSchema, source: authorizationSchema, supports: z.array(refSchema).max(16).default([]),
    assistance: z.array(methodAssistanceInputSchema).max(4).default([]), workAssistance: z.array(methodWorkHelpInputSchema).max(4).default([]),
    workAnchors: z.array(methodWorkAnchorInputSchema).max(4).default([]) }).strict(),
  z.object({ operation: z.literal('revise'), id: methodId, expectedRevision: z.number().int().positive(),
    revisionMode: z.enum(['amend', 'replace']).default('amend').describe('通常只改本人这次指定的部分，保留独立有效的条件与做法；只有明确重写整份时replace。无需用户填写该字段。'),
    method: methodSchema, source: authorizationSchema, supports: z.array(refSchema).max(16).default([]),
    assistance: z.array(methodAssistanceInputSchema).max(4).default([]), workAssistance: z.array(methodWorkHelpInputSchema).max(4).default([]),
    workAnchors: z.array(methodWorkAnchorInputSchema).max(4).default([]) }).strict(),
  z.object({ operation: z.literal('disable'), id: methodId, expectedRevision: z.number().int().positive(), source: authorizationSchema }).strict(),
]);
type MethodInput = z.infer<typeof personalMethodInput>;
interface MethodSession { events: EvidenceEvent[]; ephemeral: boolean; restrictToSessionId?: string;
  permits?: (ref: import('../../shared/harness').WorkSourceRef) => boolean }

/** User-chosen procedural text in the existing work store. No executable plugin,
 * account permission, user fact, scheduler or independent agent is installed. */
export class PersonalMethodService {
  workHelpOwner?: MethodWorkHelpOwner;
  constructor(readonly repo: KernelRepository, readonly policy: PolicyKernel) {
    repo.verifyPersonalMethodSources = (handle, raw) => this.sourcesReadable(handle, raw);
  }
  get revision() { return this.repo.getMeta<number>('personal_methods_revision', 0); }

  async prepareWorkHelp(handle: ScopeHandle, session: MethodSession, raw: unknown, signal?: AbortSignal) {
    const input = personalMethodInput.parse(raw);
    this.authorization(handle, session, input.source);
    if (session.ephemeral) throw new HarnessError('personal_method_retention', '这次原话不保留，眼前可以直接这样帮，没有保存长期方法。');
    const prepared: PreparedMethodWorkHelp[] = [];
    for (const source of input.operation === 'disable' ? [] : input.workAssistance) {
      if (!this.workHelpOwner) throw new HarnessError('personal_method_help_owner', '这份实际帮助的原读取入口暂不可用。');
      prepared.push(await this.workHelpOwner.prepare(handle, source, { permits: session.permits,
        restrictToSessionId: session.restrictToSessionId, signal }));
    }
    return prepared;
  }

  private owner(handle: ScopeHandle, write = false) {
    const scope = write ? this.policy.require(handle, 'work:write') : this.policy.validate(handle);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || write && scope.child || !scope.sources.includes('work:self'))
      throw new HarnessError('personal_method_scope', '眼前可用的资料范围还没有这份个人工作方法所需的条件。');
    return scope;
  }
  private authorization(handle: ScopeHandle, session: MethodSession, ref: z.infer<typeof refSchema>) {
    const scope = this.owner(handle, true), event = session.events.find(value => value.id === ref.eventId);
    if (!event || !scope.currentEventIds.includes(event.id) || event.speaker !== 'user'
      || !['user_message', 'user_control'].includes(event.kind) || event.parentEventId
      || event.subjectId !== scope.principalId || event.worldId !== 'real'
      || event.contentVersion !== ref.contentVersion || ref.end <= ref.start || codePointSlice(event.text, ref.start, ref.end) !== ref.quote)
      throw new HarnessError('personal_method_source', '这次保存、修订或停用方法的选择，还没有对应到本轮本人明确说过的原话；附件文字保留材料的身份。');
    // The current statement can change while the bounded intent verifier runs.
    // Even metadata-only stopping rechecks its own new authorization, without
    // reopening the old method or inheriting that method's former sources.
    if (!session.ephemeral) {
      this.repo.resolveWorkSourceBinding(handle, [{ eventId: ref.eventId, contentVersion: ref.contentVersion, start: ref.start, end: ref.end }]);
      const current = this.repo.evidence(handle, ref.eventId);
      if (!current || current.status !== 'active' || codePointSlice(current.text, ref.start, ref.end) !== ref.quote)
        throw new HarnessError('personal_method_source', '这次方法管理原话已变化或不可用，没有采用旧许可。');
    }
    return event;
  }
  private metadata(handle: ScopeHandle, id: string, revision: number) {
    const current = this.repo.sourcedWorkMetadata(handle, id.slice('personal:'.length));
    if (!current || current.type !== 'personal_method' || current.kind !== 'recipe_candidate')
      throw new HarnessError('personal_method_missing', '这份个人工作方法不存在或已删除。');
    if (current.revision !== revision) throw new HarnessError('revision_conflict', '这份方法已有新版本，手上的修订地址与当前版本没有对应上。');
    return current;
  }
  private support(handle: ScopeHandle, session: MethodSession, input: Exclude<MethodInput, { operation: 'disable' }>, prepared: readonly PreparedMethodWorkHelp[]) {
    if (prepared.length !== input.workAssistance.length || prepared.some((value, index) => canonical(value.input) !== canonical(input.workAssistance[index])
      || this.workHelpOwner?.verify(handle, value.proof) !== true || value.proof.sourceBinding.refs.some(ref => session.permits?.(ref) === false)))
      throw new HarnessError('personal_method_help_proof', '这份纸面帮助还缺原页面实际读取时留下的依据，这次没有把给出的地址当成已经回读的内容。');
    const assistance = input.assistance.map(source => {
      const original = this.repo.personalMethodAssistantSource(handle, { ...source,
        ...(session.restrictToSessionId ? { sessionId: session.restrictToSessionId } : {}) });
      if (!original || original.sourceRefs.some(ref => session.permits?.(ref) === false))
        throw new HarnessError('personal_method_assistance', '刚才真正用过的帮助现在不可核对；没有用助手提议或旧副本补成已获认可的方法。');
      return { stored: { messageId: source.messageId, start: source.start, end: source.end,
        contentSha256: original.contentSha256, sourceRefs: original.sourceRefs },
        review: { ...source, origin: 'actual_assistant_help_not_authorization' as const } };
    });
    const anchors = input.workAnchors.map(source => {
      const record = this.repo.work(handle, source.kind === 'collaboration_frame' ? 'episode' : 'experience', source.id)[0];
      if (!record || record.revision !== source.revision || record.data.type !== source.kind || !record.sourceBinding
        || record.sourceBinding.refs.some(ref => session.permits?.(ref) === false)
        || session.restrictToSessionId && record.data.sessionId !== session.restrictToSessionId
          && !(Array.isArray(record.data.sessionIds) && record.data.sessionIds.includes(session.restrictToSessionId))
        || source.kind === 'learning_process' && !this.repo.learningProcessReadable(handle, record.id, record.revision))
        throw new HarnessError('personal_method_practice', '这次帮助所接的工作或学习过程已有变化，眼前地址没有与原过程对应上；一次完成和本人认可这套帮法，各有自己的依据。');
      return { id: record.id, revision: record.revision, kind: source.kind,
        matterId: source.kind === 'collaboration_frame' ? record.id : String(record.data.matterId), sourceBinding: record.sourceBinding };
    });
    let previous: WorkRecord | undefined;
    if (input.operation === 'revise' && input.revisionMode === 'amend') {
      previous = this.repo.work(handle, 'recipe_candidate', input.id.slice('personal:'.length))[0];
      if (!previous || previous.revision !== input.expectedRevision || previous.data.type !== 'personal_method' || !previous.sourceBinding)
        throw new HarnessError('personal_method_changed', '旧方法当前不可完整回读，未把一次局部修改变成删掉其他条件；可以先只照顾这次。');
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
    if (!this.sourcesReadable(handle, sources)) throw new HarnessError('personal_method_help_changed', '当时帮助的一处原来源刚有变化，未用旧证明保存新方法。');
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

  private supportPermitted(raw: unknown, permits?: MethodSession['permits']) {
    if (raw === undefined) return true;
    const parsed = personalMethodSourcesSchema.safeParse(raw);
    return parsed.success && [...parsed.data.assistance.flatMap(source => source.sourceRefs),
      ...parsed.data.workAssistance.flatMap(source => source.sourceBinding.refs),
      ...parsed.data.anchors.flatMap(anchor => anchor.sourceBinding.refs), ...(parsed.data.methodBinding?.refs || [])].every(ref => permits?.(ref) !== false);
  }

  private binding(handle: ScopeHandle, input: Exclude<MethodInput, { operation: 'disable' }>, sources: PersonalMethodSources, session: MethodSession, previous?: WorkRecord) {
    const refs = [input.source, ...input.supports];
    const binding = this.repo.resolveWorkSourceBinding(handle, [...refs.map(({ quote: _quote, ...ref }) => ref),
      ...sources.assistance.flatMap(source => source.sourceRefs), ...sources.workAssistance.flatMap(source => source.sourceBinding.refs),
      ...sources.anchors.flatMap(anchor => anchor.sourceBinding.refs), ...(sources.methodBinding?.refs || []), ...(previous?.sourceBinding?.refs || [])]);
    if (binding.refs.some(ref => session.permits?.(ref) === false))
      throw new HarnessError('personal_method_support', '方法的一处原始支持超出当前可读范围，没有借局部修改恢复旧私文。');
    for (const ref of refs) {
      const event = this.repo.evidence(handle, ref.eventId);
      if (!event || event.contentVersion !== ref.contentVersion || codePointSlice(event.text, ref.start, ref.end) !== ref.quote
        || session.permits?.(ref) === false || session.restrictToSessionId && event.sessionId !== session.restrictToSessionId)
        throw new HarnessError('personal_method_support', '这个方法所依据的片段已有变化，这次没有继续使用先前的正文。');
    }
    return binding;
  }

  preview(handle: ScopeHandle, session: MethodSession, raw: unknown, known: (requirement: WorkflowRequirement) => boolean,
    prepared: readonly PreparedMethodWorkHelp[] = []) {
    const input = personalMethodInput.parse(raw);
    this.authorization(handle, session, input.source);
    if (session.ephemeral) throw new HarnessError('personal_method_retention', '当前原话不作持久保留；这次可以直接按该方法工作，没有保存可跨轮读取的方法。');
    if (input.operation === 'disable') {
      const current = this.metadata(handle, input.id, input.expectedRevision);
      return { targetKind: 'personal_method', operation: input.operation, current, source: input.source,
        meaning: '这里给出待停用方法的当前管理信息，具体停用还在接下来的保存中完成。原话、事实记忆与独立接受的安排各有自己的归属；先前的方法正文没有随这一步展开。' };
    }
    const current = input.operation === 'revise' ? this.metadata(handle, input.id, input.expectedRevision) : undefined;
    if ((input.assistance.length || input.workAssistance.length) && !input.method.conditions)
      throw new HarnessError('personal_method_conditions', '这份方法还缺适合什么情况、怎样随当前意愿调整的说明。刚才真正奏效的帮助能提供起点，具体条件可以由你结合那段交流来理解，让本人省下另填一张表的负担。一次的做法和长期适用的条件也各有不同。');
    const unknown = input.method.requirements.filter(requirement => !known(requirement));
    if (unknown.length) throw new HarnessError('personal_method_requirement', '这份方法提到了当前没有登记的工具或能力。本来的文字帮法仍有价值，方法所列的需求则有各自的实际入口；保存方法本身没有安装能力。');
    const support = this.support(handle, session, input, prepared), binding = this.binding(handle, input, support.sources, session, support.previous);
    return { targetKind: 'personal_method', operation: input.operation, current, method: input.method,
      source: input.source, supports: input.supports, assistance: support.assistance, workAssistance: support.workAssistance,
      ...(session.events.find(event => event.id === input.source.eventId)?.sourceContext
        ? { authorizationContext: session.events.find(event => event.id === input.source.eventId)!.sourceContext } : {}),
      workAnchors: support.sources.anchors, binding,
      methodSources: support.sources,
      ...(input.operation === 'revise' ? { revisionMode: input.revisionMode,
        ...(support.previous ? { previousMethod: methodSchema.parse(support.previous.data.method), previousBinding: support.previous.sourceBinding } : {}) } : {}),
      digest: createHash('sha256').update(canonical({ method: input.method, binding })).digest('hex'),
      meaning: '这里给出本人选择、准备保存的可编辑方法文字与已知需求。工具和资料需求在这里作为说明留下，代码安装、实际读取与动作仍各有自己的选择和执行过程。' };
  }

  save(handle: ScopeHandle, session: MethodSession, raw: unknown, known: (requirement: WorkflowRequirement) => boolean,
    prepared: readonly PreparedMethodWorkHelp[] = []) {
    const input = personalMethodInput.parse(raw), scope = this.owner(handle, true);
    this.preview(handle, session, input, known, prepared);
    return this.repo.write(() => {
      const now = this.repo.clock.now();
      const operationId = 'personal-method:' + createHash('sha256').update(canonical({ owner: scope.principalId, workspace: scope.workspaceId, input })).digest('hex');
      if (input.operation === 'save') {
        const previous = this.repo.operation<{ id: string; revision: number }>(operationId);
        if (previous) {
          const current = this.repo.sourcedWorkMetadata(handle, previous.id.slice('personal:'.length));
          return { id: previous.id, revision: current?.revision ?? previous.revision,
            status: current?.status || 'unavailable', guidanceOnly: true as const, repeated: true,
            meaning: '这次明确保存请求已经记录，没有重复创建方法；当前对象状态如上，不恢复已停用或已删除的方法。' };
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
        return { id: input.id, revision, status: 'disabled' as const, guidanceOnly: true as const };
      }
      const current = input.operation === 'revise' ? this.metadata(handle, input.id, input.expectedRevision) : undefined;
      const id = current?.id || randomUUID(), support = this.support(handle, session, input, prepared), binding = this.binding(handle, input, support.sources, session, support.previous);
      const sourceSessionId = session.events.find(event => event.id === input.source.eventId)?.sessionId;
      const record: WorkRecord = { id, kind: 'recipe_candidate', ownerId: scope.principalId, workspaceId: scope.workspaceId,
        subjectId: scope.subjectId, worldId: scope.worldId, revision: current ? current.revision + 1 : 1,
        status: current?.status === 'disabled' ? 'disabled' : 'active', title: input.method.name,
        evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], sourceBinding: binding,
        label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false },
        data: { type: 'personal_method', method: input.method, methodSources: support.sources, recordedAt: now, updatedAt: now,
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
      this.repo.setMeta('personal_methods_revision', this.revision + 1);
      if (current) this.repo.invalidate(id, 'personal_method_revised');
      return { id: 'personal:' + id, revision: record.revision, status: record.status, guidanceOnly: true as const,
        name: input.method.name, methodDigest: createHash('sha256').update(canonical(input.method)).digest('hex'),
        read: { tool: 'read_skill', id: 'personal:' + id },
        meaning: '这份方法文字和实际来由的版本已一起保存，启用或停用状态也随当前记录保留。以后借用时可以再结合当时的交流判断是否适合；所需资料按当次用途读取，实际动作仍沿原来的托付与执行过程。' };
    });
  }

  readHelp(handle: ScopeHandle, address: { id: string; revision: number; index: number }, context: Pick<MethodSession, 'restrictToSessionId' | 'permits'> = {}) {
    this.owner(handle);
    const current = this.repo.work(handle, 'recipe_candidate', address.id.slice('personal:'.length))[0];
    if (!current || current.revision !== address.revision || current.status !== 'active' || current.data.type !== 'personal_method'
      || !current.sourceBinding || !this.supportPermitted(current.data.methodSources, context.permits))
      throw new HarnessError('personal_method_changed', '这份方法已变化或退出当前范围，先读现在可用的做法。');
    const sources = personalMethodSourcesSchema.parse(current.data.methodSources), proof = sources.workAssistance[address.index];
    const text = proof && this.workHelpOwner?.read(handle, proof, context);
    if (text === undefined) throw new HarnessError('personal_method_help_changed', '当时这份帮助的原来源已不可回读，没有用方法摘要冒充原来的帮助。');
    return { data: { methodId: address.id, methodRevision: current.revision, origin: 'actual_assistant_help_not_user_approval' as const,
      owner: proof.owner, matterId: proof.matterId, text, coverage: { start: proof.start, end: proof.end },
      interpretation: 'original_help_excerpt_not_current_work_or_authorization' as const }, record: current,
      sources: { ...sources, methodBinding: current.sourceBinding } };
  }

  catalog(handle: ScopeHandle, selected: { id?: string; revision?: number; usage?: PersonalMethodUsage; sessionId?: string;
    permits?: MethodSession['permits'] } = {}): (WorkflowSkill & { usage: PersonalMethodUsage })[] {
    const scope = this.policy.validate(handle);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read')) return [];
    const result: (WorkflowSkill & { usage: PersonalMethodUsage })[] = [];
    const { usage, permits, ...address } = selected;
    for (let offset = 0; ; offset += 100) {
      const rows = this.repo.workData(handle, ['personal_method'], { ...address, statuses: ['active'], limit: 100, offset });
      for (const record of rows) {
        const method = methodSchema.safeParse(record.data.method);
        if (!method.success || record.kind !== 'recipe_candidate' || !record.sourceBinding || usage && method.data.usage !== usage
          || record.sourceBinding.refs.some(ref => permits?.(ref) === false) || !this.supportPermitted(record.data.methodSources, permits)) continue;
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
      || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read')) return { items: [], records: [], moreMayExist: false };
    const scan = Math.min(40, limit * 4 + 1), rows = this.repo.workData(handle, ['personal_method'], { statuses: ['active'], limit: scan });
    const available = rows.flatMap(record => {
      const method = methodSchema.safeParse(record.data.method);
      if (!method.success || method.data.usage !== 'work' || !record.sourceBinding
        || record.sourceBinding.refs.some(ref => options.permits?.(ref) === false) || !this.supportPermitted(record.data.methodSources, options.permits)) return [];
      return [{ record, method: method.data }];
    }), picked = available.slice(0, limit);
    return { items: picked.map(({ record, method }) => ({ id: 'personal:' + record.id, revision: record.revision, name: method.name,
      description: Array.from(method.description).slice(0, 300).join(''),
      ...(method.conditions ? { conditions: { when: Array.from(method.conditions.when).slice(0, 240).join(''),
        adaptToCurrent: Array.from(method.conditions.adaptToCurrent).slice(0, 240).join(''),
        ...(method.conditions.avoidWhen ? { avoidWhen: Array.from(method.conditions.avoidWhen).slice(0, 200).join('') } : {}) } } : {}),
      instructionsRead: false, read: { tool: 'read_skill', arguments: { id: 'personal:' + record.id } } })),
      records: picked.map(value => value.record), moreMayExist: rows.length === scan || available.length > picked.length };
  }
}
