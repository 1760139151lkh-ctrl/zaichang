import { createHash, randomUUID } from 'node:crypto';
import {
  discussionArtworkSchema, discussionContentSchema, discussionFocusSchema, discussionModuleRefSchema,
  type DiscussionBranch, type DiscussionContent, type DiscussionFocus,
    type DiscussionArtwork, type DiscussionModuleRef, type DiscussionPoint, type DiscussionScene, type DiscussionSnapshotMetadata, type VerifiedDiscussionFocus,
} from '../../shared/discussion-scene';
import { HarnessError, type ScopeHandle, type WorkRecord, type WorkSourceRef } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from './policy';
import { canonical } from './semantics';
import { resolveRetainedSourceQuote } from './source-quote';
import { companionSceneProjectionSchema, type CompanionSceneProjection } from '../../shared/companion-session';

type JsonObject = Record<string, unknown>;
export type DiscussionAdmission = {
  /** Host derives this from the current memory contract, never tool arguments. */
  allowCrossSession?: boolean;
  /** Exact original-range projection, when a parent supplied only a fragment. */
  permits?: (ref: WorkSourceRef) => boolean;
};
export interface DiscussionProjectionInput {
  matterId: string;
  expectedRevision: number;
  previous?: DiscussionScene;
  focus?: DiscussionFocus;
  modules?: DiscussionModuleRef[];
  artwork?: DiscussionArtwork[];
}
/** Each original owner rechecks dependencies that a generic Work reference
 * cannot establish, such as the exact assistant aid or a learning revision. */
export type DiscussionModuleVerifier = (handle: ScopeHandle, ref: DiscussionModuleRef) => { record: WorkRecord; coWork?: CompanionSceneProjection } | undefined;
export type DiscussionSnapshotVerifier = (handle: ScopeHandle, projection: CompanionSceneProjection,
  permits?: (ref: WorkSourceRef) => boolean) => CompanionSceneProjection;
const object = (value: unknown): JsonObject | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
const text = (value: unknown, max = 4000): string | undefined =>
  typeof value === 'string' && value.trim() && value.length <= max ? value : undefined;
const values = (value: unknown) => Array.isArray(value) ? value : [];
const uniqueRefs = (refs: WorkSourceRef[]) => {
  const unique = [...new Map(refs.map(ref => [canonical(ref), ref])).values()];
  return unique.filter(ref => !unique.some(other => other !== ref && other.eventId === ref.eventId
    && other.contentVersion === ref.contentVersion && other.start <= ref.start && other.end >= ref.end));
};
const key = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex').slice(0, 24);
const terminal = new Set(['cancelled', 'withdrawn', 'closed', 'deleted', 'blocked', 'stale']);
const unavailableOption = new Set([...terminal, 'rejected', 'needs_review']);
const quoteInput = (value: unknown) => {
  const source = object(value);
  return source && typeof source.eventId === 'string' && text(source.quote) ? source : undefined;
};
const sceneContent = (scene: DiscussionScene) => discussionContentSchema.parse({
  sessionId: scene.sessionId, matter: scene.matter, points: scene.points, branches: scene.branches,
  modules: scene.modules, coWork: scene.coWork, artwork: scene.artwork, provenance: scene.provenance, coverage: scene.coverage,
});

/** Read-only composition: the original Work frame owns every decision and
 * option. Scene focus changes no record, reminder, plan, or acceptance. */
export class DiscussionSceneProjector {
  constructor(readonly repo: KernelRepository, readonly policy: PolicyKernel,
    private readonly moduleCurrent?: DiscussionModuleVerifier, private readonly moduleSnapshot?: DiscussionSnapshotVerifier) {}

  private scope(handle: ScopeHandle) {
    const scope = this.policy.require(handle, 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self'))
      throw new HarnessError('discussion_scope', '这件事不在当前可以一起商量的资料范围内。');
    return scope;
  }

  private record(handle: ScopeHandle, id: string, revision: number) {
    const record = this.repo.work(handle, 'episode', id)[0];
    if (!record || record.data.type !== 'collaboration_frame' || record.revision !== revision || terminal.has(record.status))
      throw new HarnessError('discussion_changed', '这件事已经有了变化，先接上现在的内容。');
    return record;
  }

  private cite(handle: ScopeHandle, raw: unknown) {
    const source = quoteInput(raw);
    const event = source ? this.repo.evidence(handle, String(source.eventId)) : undefined;
    const resolved = event && resolveRetainedSourceQuote(event, source);
    if (!event || !resolved)
      throw new HarnessError('discussion_source_changed', '商量中的一处原话已经改变或无法展开，先重新接上那一处。');
    this.repo.resolveWorkSourceBinding(handle, [{ eventId: resolved.eventId, contentVersion: resolved.contentVersion,
      start: resolved.start, end: resolved.end }]);
    return resolved;
  }

  private binding(handle: ScopeHandle, record: WorkRecord, known: WorkSourceRef[], admission: DiscussionAdmission,
    legacySourceIds: Set<string>) {
    const refs = [...known, ...(record.sourceBinding?.refs || [])];
    const addressed = new Set(refs.map(ref => ref.eventId));
    for (const eventId of record.evidenceIds) {
      if (record.sourceBinding && addressed.has(eventId)) continue;
      const event = this.repo.evidence(handle, eventId);
      if (!event || !event.text.length)
        throw new HarnessError('discussion_source_changed', '这件事的一处来由暂时无法展开。');
      // Older frames recorded only event-level dependencies. Their question,
      // assistant interpretation or choice may use another span of the same
      // event; a short displayed quotation cannot retroactively narrow that.
      refs.push({ eventId: event.id, contentVersion: event.contentVersion, start: 0, end: Array.from(event.text).length });
      legacySourceIds.add(event.id);
    }
    const unique = uniqueRefs(refs);
    if (!unique.length || unique.some(ref => admission.permits?.(ref) === false))
      throw new HarnessError('discussion_source_scope', '这页商量还需要当前没有展开的原话；没有把片段扩成整条资料。');
    const binding = this.repo.resolveWorkSourceBinding(handle, unique);
    if (record.sourceBinding && !this.repo.workBindingsReadable(handle, [record.sourceBinding]))
      throw new HarnessError('discussion_source_changed', '这件事所依据的内容已经改变。');
    return binding;
  }

  private modules(handle: ScopeHandle, matter: WorkRecord, refs: DiscussionModuleRef[], admission: DiscussionAdmission) {
    if (refs.length > 8 || new Set(refs.map(ref => ref.owner + ':' + ref.id)).size !== refs.length)
      throw new HarnessError('discussion_modules', '这页引用的共同步骤不完整。');
    const coWork: CompanionSceneProjection[] = [];
    const currentRefs = refs.map(raw => {
      const ref = discussionModuleRefSchema.parse(raw), owner = this.moduleCurrent?.(handle, ref), record = owner?.record;
      const ownerType = ref.owner === 'co_work' ? 'companion_session' : ref.owner;
      if (!record || ref.matterId !== matter.id || record.data.matterId !== matter.id || record.data.type !== ownerType
        || record.revision !== ref.revision || terminal.has(record.status) || !record.sourceBinding
        || canonical(record.sourceBinding) !== canonical(ref.sourceBinding)
        || record.ownerId !== matter.ownerId || record.workspaceId !== matter.workspaceId
        || record.subjectId !== matter.subjectId || record.worldId !== matter.worldId
        || ref.sourceBinding.refs.some(source => admission.permits?.(source) === false)
        || !this.repo.workBindingsReadable(handle, [ref.sourceBinding]))
        throw new HarnessError('discussion_module_changed', '一起做的这一步已经变化，先从原来的内容接上。');
      // This verifies the exact owner address only. The owner's own read gate
      // must expand teaching/material text; no copied lesson enters this scene.
      if (ref.currentStepId !== undefined) {
        const currentStep = object(record.data.currentStep);
        if (currentStep?.id !== ref.currentStepId && record.data.currentStepId !== ref.currentStepId)
          throw new HarnessError('discussion_module_changed', '当前停留的步骤已经改变。');
      }
      if (owner?.coWork) {
        const projection = companionSceneProjectionSchema.parse(owner.coWork);
        if (ref.owner !== 'co_work' || projection.id !== ref.id || projection.revision !== ref.revision || projection.matterId !== ref.matterId)
          throw new HarnessError('discussion_module_changed', '共同做事的当前起点已经变化。');
        coWork.push(projection);
      }
      return ref;
    });
    return { refs: currentRefs, coWork };
  }

  private content(handle: ScopeHandle, sessionId: string, input: DiscussionProjectionInput, admission: DiscussionAdmission): DiscussionContent {
    this.scope(handle);
    const matter = this.record(handle, input.matterId, input.expectedRevision);
    const memberships = new Set([matter.data.sessionId, matter.data.lastSessionId, ...values(matter.data.sessionIds)]);
    if (!sessionId || !admission.allowCrossSession && !memberships.has(sessionId))
      throw new HarnessError('discussion_session', '这件事还没有接到当前这段对话中。');
    const question = text(matter.data.question), title = text(matter.title, 400);
    if (!question || !title) throw new HarnessError('discussion_incomplete', '这件事还没有形成可以一起看的问题。');
    const source = quoteInput(matter.data.source) ? this.cite(handle, matter.data.source) : undefined;
    const sourceRefs: WorkSourceRef[] = source ? [{ eventId: source.eventId, contentVersion: source.contentVersion, start: source.start, end: source.end }] : [];
    const pending: Omit<DiscussionPoint, 'sourceRefs'>[] = [];
    if (source) pending.push({ id: 'anchor', role: 'anchor', text: source.quote, origin: 'user_quote', source });
    const supported = (field: string, role: 'condition' | 'decision', origin: 'source_bound_summary' | 'recorded_decision') => {
      const entries = values(matter.data[field]);
      if (entries.length > 12) throw new HarnessError('discussion_incomplete', '这件事的原话范围需要先整理清楚。');
      for (const value of entries) {
        const item = object(value), summary = text(item?.text, 1200);
        if (!item || !summary) throw new HarnessError('discussion_incomplete', '这件事的一处记录还不完整。');
        const citation = this.cite(handle, item.source);
        const ref = { eventId: citation.eventId, contentVersion: citation.contentVersion, start: citation.start, end: citation.end };
        sourceRefs.push(ref);
        pending.push({ id: `${role}:${key([ref, summary])}`, role, text: summary, origin, source: citation });
      }
    };
    supported('confirmedFacts', 'condition', 'source_bound_summary');
    const needsReview = matter.status === 'needs_review' || matter.data.decisionsNeedRevalidation === true;
    if (!needsReview) supported('decisions', 'decision', 'recorded_decision');
    // Even undisplayed, structured old reasons remain dependencies of the
    // frame. Resolve their actual locators rather than broadening the message.
    for (const value of values(matter.data.rejectedOptions)) {
      const citation = this.cite(handle, object(value)?.source);
      sourceRefs.push({ eventId: citation.eventId, contentVersion: citation.contentVersion, start: citation.start, end: citation.end });
    }
    const legacySourceIds = new Set<string>();
    const frameBinding = this.binding(handle, matter, sourceRefs, admission, legacySourceIds);
    const point = (value: unknown, role: DiscussionPoint['role'], origin: DiscussionPoint['origin'], pointId?: string) => {
      const content = text(value, role === 'next_step' ? 1000 : 1200);
      if (content) pending.push({ id: pointId || `${role}:${key(content)}`, role, text: content, origin });
    };
    if (!needsReview) {
      for (const thought of values(matter.data.tentativeUnderstanding)) point(thought, 'thought', 'assistant_thought');
      for (const participation of values(matter.data.participation)) point(participation, 'participation', 'assistant_proposal');
      for (const open of values(matter.data.openQuestions)) point(open, 'open_question', 'assistant_proposal');
      if (!values(matter.data.openQuestions).length) point(matter.data.nextSmallQuestion, 'open_question', 'assistant_proposal', 'open-question');
      point(matter.data.nextStep, 'next_step', 'assistant_proposal', 'next-step');
    }
    const points = [...new Map(pending.map(value => [value.id, { ...value,
      sourceRefs: value.source ? [{ eventId: value.source.eventId, contentVersion: value.source.contentVersion,
        start: value.source.start, end: value.source.end }] : frameBinding.refs }])).values()];
    const declaredIds = [...new Set(values(matter.data.optionIds).filter((value): value is string => typeof value === 'string'))];
    if (declaredIds.length > 64) throw new HarnessError('discussion_options', '这件事的分支太多，先回到眼前准备比较的几条。');
    const branches: DiscussionBranch[] = [], allRefs = [...frameBinding.refs];
    for (const id of declaredIds) {
      const option = this.repo.work(handle, undefined, id)[0];
      if (!option || !['option', 'plan'].includes(option.kind) || option.data.type === 'planning_intent'
        || unavailableOption.has(option.status) || option.ownerId !== matter.ownerId || option.workspaceId !== matter.workspaceId
        || option.subjectId !== matter.subjectId || option.worldId !== matter.worldId
        || typeof option.data.matterId === 'string' && option.data.matterId !== matter.id
        || typeof option.data.episodeId === 'string' && option.data.episodeId !== matter.id) continue;
      const binding = this.binding(handle, option, option.sourceBinding?.refs || frameBinding.refs, admission, legacySourceIds);
      allRefs.push(...binding.refs);
      branches.push({ id: option.id, revision: option.revision, title: option.title,
        kind: option.kind as 'option' | 'plan', status: option.status,
        rationale: text(option.data.rationale, 1200) || null,
        selected: matter.data.selectedOptionId === option.id, sourceRefs: binding.refs });
    }
    const moduleView = this.modules(handle, matter, input.modules || [], admission), modules = moduleView.refs;
    for (const module of modules) allRefs.push(...module.sourceBinding.refs);
    const binding = this.repo.resolveWorkSourceBinding(handle, uniqueRefs(allRefs));
    const artwork = (input.artwork || []).map(value => discussionArtworkSchema.parse(value));
    if (artwork.length > 2 || artwork.some(value => value.optionId && !branches.some(branch => branch.id === value.optionId)))
      throw new HarnessError('discussion_artwork', '插画只陪着眼前真实在讨论的这一版，不替资料或地点作证明。');
    return discussionContentSchema.parse({ sessionId,
      matter: { id: matter.id, revision: matter.revision, title, question, needsReview }, points, branches, modules, coWork: moduleView.coWork, artwork,
      provenance: { sourceBinding: binding, optionRefs: branches.map(({ id, revision }) => ({ id, revision })) },
      coverage: { declaredOptionCount: declaredIds.length, returnedOptionCount: branches.length,
        unavailableOptionCount: declaredIds.length - branches.length, withheldInterpretations: needsReview,
        legacySourceIds: [...legacySourceIds] },
    });
  }

  project(handle: ScopeHandle, sessionId: string, input: DiscussionProjectionInput, admission: DiscussionAdmission = {}): DiscussionScene {
    const content = this.content(handle, sessionId, input, admission);
    const previous = input.previous;
    if (previous && (previous.kind !== 'discussion' || previous.sessionId !== sessionId || previous.matter.id !== content.matter.id))
      throw new HarnessError('discussion_previous', '这份前情属于另一件事，没有把两段商量并在一起。');
    // A prior picture can explain genuine changes only while its original
    // words remain legal. Do not extract old text from a revoked snapshot.
    const canCompare = previous && this.repo.workBindingsReadable(handle, [previous.provenance.sourceBinding])
      && previous.provenance.sourceBinding.refs.every(ref => admission.permits?.(ref) !== false);
    const old = canCompare ? previous : undefined;
    const oldPoints = new Map(old?.points.map(point => [point.id, point]) || []);
    const oldBranches = new Map(old?.branches.map(branch => [branch.id, branch]) || []);
    const points = new Map(content.points.map(point => [point.id, point]));
    const branches = new Map(content.branches.map(branch => [branch.id, branch]));
    const same = !!old && canonical(sceneContent(old)) === canonical(content);
    let focus: DiscussionFocus | null = input.focus ? discussionFocusSchema.parse(input.focus) : null;
    let focusRelation: DiscussionScene['continuity']['focusRelation'] = focus ? 'explicit' : 'none';
    const contains = (target: DiscussionFocus) => target.kind === 'discussion_point' ? points.has(target.pointId) : branches.has(target.optionId);
    if (focus && !contains(focus)) throw new HarnessError('discussion_focus', '这一点已经变化，重新选一下眼前的内容。');
    if (!focus && old?.continuity.focus) {
      const retained = old.continuity.focus;
      if (!contains(retained)) focusRelation = 'removed';
      else {
        focus = retained;
        const before = retained.kind === 'discussion_point' ? oldPoints.get(retained.pointId) : oldBranches.get(retained.optionId);
        const after = retained.kind === 'discussion_point' ? points.get(retained.pointId) : branches.get(retained.optionId);
        focusRelation = canonical(before) === canonical(after) ? 'retained' : 'changed';
      }
    }
    if (old && same && canonical(old.continuity.focus) === canonical(focus)) {
      this.assertReadable(handle, sessionId, old, admission);
      return structuredClone(old);
    }
    const now = this.repo.clock.now();
    const scene: DiscussionScene = { ...content, kind: 'discussion', id: old?.id || randomUUID(),
      revision: old ? old.revision + 1 : 1,
      createdAt: now,
      source: { sourceId: 'work:self', fetchedAt: now, version: String(content.matter.revision) },
      continuity: {
        relation: old ? same ? 'unchanged' : 'revised' : 'first',
        previous: old ? { id: old.id, revision: old.revision, matterRevision: old.matter.revision } : null,
        addedPointIds: old ? content.points.filter(point => !oldPoints.has(point.id)).map(point => point.id) : [],
        changedPointIds: old ? content.points.filter(point => oldPoints.has(point.id) && canonical(oldPoints.get(point.id)) !== canonical(point)).map(point => point.id) : [],
        removedPointIds: old ? old.points.filter(point => !points.has(point.id)).map(point => point.id) : [],
        addedOptionIds: old ? content.branches.filter(branch => !oldBranches.has(branch.id)).map(branch => branch.id) : [],
        changedOptionIds: old ? content.branches.filter(branch => oldBranches.has(branch.id) && canonical(oldBranches.get(branch.id)) !== canonical(branch)).map(branch => branch.id) : [],
        removedOptionIds: old ? old.branches.filter(branch => !branches.has(branch.id)).map(branch => branch.id) : [],
        focus, focusRelation,
      },
    };
    // Reuse means revalidate, not permission inherited from a previous picture.
    this.assertReadable(handle, sessionId, scene, admission);
    return scene;
  }

  assertReadable(handle: ScopeHandle, sessionId: string, scene: DiscussionScene, admission: DiscussionAdmission = {}) {
    const content = sceneContent(scene);
    if (scene.kind !== 'discussion' || content.sessionId !== sessionId || scene.source?.sourceId !== 'work:self')
      throw new HarnessError('discussion_session', '这页商量不属于当前对话。');
    const current = this.content(handle, sessionId, { matterId: scene.matter.id, expectedRevision: scene.matter.revision, modules: scene.modules, artwork: scene.artwork },
      { ...admission, allowCrossSession: true });
    if (canonical(current) !== canonical(content))
      throw new HarnessError('discussion_changed', '商量中的内容或方案已经变化，先接上现在的这一页。');
    return current;
  }

  /** A later sentence or ordinary pause does not erase what we legally wrote
   * together. This is a historical source check, never current-plan recovery.
   * Corrections and each embedded owner's stronger dependency gate still win. */
  snapshotMetadata(handle: ScopeHandle, metadata: DiscussionSnapshotMetadata, admission: DiscussionAdmission = {}) {
    this.scope(handle);
    const filter = this.repo.filter(handle);
    const matter = this.repo.db.prepare(`SELECT r.id,r.revision,r.status,json_extract(r.payload,'$.data.repair') AS repair,
      json_extract(r.payload,'$.data.decisionsNeedRevalidation') AS review FROM h_work r WHERE ${filter.sql} AND r.id=?
      AND r.kind='episode' AND json_extract(r.payload,'$.data.type')='collaboration_frame'`).get(...filter.params, metadata.matter.id);
    const repair = matter?.repair ? object(JSON.parse(String(matter.repair))) : undefined;
    if (!metadata.sessionId || !Number.isFinite(Date.parse(metadata.createdAt)) || !matter || this.repo.hasFence(metadata.matter.id) || Number(matter.revision) < metadata.matter.revision
      || ['deleted', 'stale', 'blocked'].includes(String(matter.status))
      || !metadata.matter.needsReview && (matter.status === 'needs_review' || matter.review === 1)
      || typeof repair?.at === 'string' && repair.at > metadata.createdAt)
      throw new HarnessError('discussion_source_changed', '这页商量的一处理解已被更正，先接上现在的内容。');
    const binding = metadata.sourceBinding;
    if (!this.repo.workBindingsReadable(handle, [binding]) || binding.refs.some(ref => admission.permits?.(ref) === false))
      throw new HarnessError('discussion_source_changed', '这页商量的来由已改变或不在当前范围内。');
    return matter;
  }

  snapshot(handle: ScopeHandle, sessionId: string, scene: DiscussionScene, admission: DiscussionAdmission = {}): DiscussionScene {
    const content = sceneContent(scene);
    if (scene.kind !== 'discussion' || content.sessionId !== sessionId || scene.source?.sourceId !== 'work:self')
      throw new HarnessError('discussion_session', '这页商量不属于当前对话。');
    const binding = content.provenance.sourceBinding;
    const matter = this.snapshotMetadata(handle, { sessionId, matter: scene.matter, createdAt: scene.createdAt, sourceBinding: binding }, admission);
    const contains = (source: WorkSourceRef) => binding.refs.some(ref => ref.eventId === source.eventId
      && ref.contentVersion === source.contentVersion && ref.start <= source.start && ref.end >= source.end);
    if (content.points.some(point => point.sourceRefs.some(ref => !contains(ref)))
      || content.branches.some(branch => branch.sourceRefs.some(ref => !contains(ref))))
      throw new HarnessError('discussion_source_changed', '这页商量的一处来源不完整。');
    for (const point of content.points) if (point.source) {
      const cited = this.cite(handle, point.source);
      if (canonical(cited) !== canonical(point.source))
        throw new HarnessError('discussion_source_changed', '这页商量中的原话已经改变。');
    }
    const coWork: CompanionSceneProjection[] = [];
    for (const ref of content.modules) {
      if (ref.matterId !== scene.matter.id || !this.repo.workBindingsReadable(handle, [ref.sourceBinding])
        || ref.sourceBinding.refs.some(source => admission.permits?.(source) === false))
        throw new HarnessError('discussion_module_changed', '这份原步骤的一处来源已经退出当前范围。');
      if (ref.owner === 'co_work') {
        const prior = content.coWork.find(value => value.id === ref.id && value.revision === ref.revision && value.matterId === ref.matterId);
        if (!prior || !this.moduleSnapshot || prior.snapshotProof && canonical(prior.snapshotProof.sourceBinding) !== canonical(ref.sourceBinding))
          throw new HarnessError('discussion_module_changed', '原共同步骤缺少这一版的完整来源证明。');
        coWork.push(this.moduleSnapshot(handle, prior, admission.permits));
      } else {
        // Only the original study address lives here; its teaching body still
        // requires the existing asynchronous study owner read.
        const f = this.repo.filter(handle);
        if (this.repo.hasFence(ref.id) || !this.repo.db.prepare(`SELECT r.id FROM h_work r WHERE ${f.sql} AND r.id=?
          AND json_extract(r.payload,'$.data.type')='study_companion' AND json_extract(r.payload,'$.data.matterId')=?`)
          .get(...f.params, ref.id, ref.matterId)) throw new HarnessError('discussion_module_changed', '原陪学地址已经退出，未恢复缓存内容。');
      }
    }
    if (coWork.length !== content.coWork.length) throw new HarnessError('discussion_module_changed', '原页的共同步骤地址不完整。');
    return { ...structuredClone(scene), coWork,
      ...(Number(matter.revision) !== scene.matter.revision || coWork.some(value => !!value.history)
        ? { history: { currentMatterRevision: Number(matter.revision), currentStatus: String(matter.status) } } : { history: undefined }) };
  }

  verifyFocus(handle: ScopeHandle, sessionId: string, scene: DiscussionScene, raw: DiscussionFocus, admission: DiscussionAdmission = {}): VerifiedDiscussionFocus {
    const snapshot = this.snapshot(handle, sessionId, scene, admission);
    const target = discussionFocusSchema.parse(raw);
    const point = target.kind === 'discussion_point' ? scene.points.find(point => point.id === target.pointId) : undefined;
    const branch = target.kind === 'discussion_option' ? scene.branches.find(option => option.id === target.optionId) : undefined;
    if (!point && !branch) throw new HarnessError('discussion_focus', '这一点不在眼前这页商量里，重新选一下。');
    return { target, matter: { id: scene.matter.id, revision: snapshot.history?.currentMatterRevision || scene.matter.revision }, label: point?.text || branch!.title,
      ...(point ? { point: structuredClone(point) } : {}), ...(branch ? { branch: structuredClone(branch) } : {}),
      sourceBinding: structuredClone(scene.provenance.sourceBinding),
      ...(snapshot.history ? { viewedMatterRevision: scene.matter.revision, historicalReference: true } : {}),
      meaning: (snapshot.history ? '用户指的是当时这一页的内容；原事项已有后续，解释与方案保留当时版本，改变事项前先回读当前原owner。' : '')
        + '这是临时交流引用，不表示赞同解释、选择方案、实际做到这一步、长期偏好或行动授权；不改变原事项、教学状态、安排或提醒。' };
  }
}
