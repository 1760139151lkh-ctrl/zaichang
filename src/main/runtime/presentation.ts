import { createHash } from 'node:crypto';
import { DEFAULT_SETTINGS, type Message, type State } from '../../shared/types';
import type { ObjectPresentationState, PreparationReference, PreparationView, SharedMatterView, SurfaceView } from '../../shared/presentation';
import type { Store } from '../store';
import { historicalReleaseArtifact, readReleaseArtifacts, releaseMessageReadable } from './release-store';
import { latestReleases, renderReleases } from './release-composer';
import { HarnessError, type ScopeHandle } from '../../shared/harness';
import { reflectiveLetterProjectInput, type ReflectiveLetterProjectInput } from '../../shared/reflective-letter';
import { rehearsalHistoryReference } from '../../shared/relationship-rehearsal';
import { noteHistoryReference } from '../../shared/note-presentation';
import { studyHistoryReference, type StudyScene } from '../../shared/study-presentation';
import { curiosityHistoricalProjection } from '../../shared/curiosity-scene';
import { assertCuriositySnapshotSourcesReadable } from './curiosity-scene';
import type { SceneSnapshot } from '../../shared/scenes';
import { campusAcademicReference } from '../../shared/campus-academic';
import { isAcademicCampus } from './campus-academic';
import { programMessageProjection } from './interactive-program-sources';
import { orderCampusPageViews } from './campus-page-order';

type PresentationRead = { liveCuriosity?: boolean; liveRehearsal?: boolean; liveNote?: boolean; liveCampus?: boolean; liveProgram?: boolean };

/** Audience projection happens before IPC. Public presentation has neither
 * private transcript payloads nor hidden explanations in DOM/ARIA metadata. */
export class PresentationService {
  private preparationFocus?: PreparationReference;
  constructor(readonly store: Store) {}
  private setting() { return this.store.meta<{ mode: 'private' | 'public'; revision: number; selected: { kind?: 'artifact' | 'matter'; sessionId?: string; id: string; revision: number; hash: string }[] }>('presentation_surface', { mode: 'private', revision: 1, selected: [] }); }
  get public() { return this.setting().mode === 'public'; }
  setSurface(mode: 'private' | 'public') {
    const old = this.setting();
    this.store.putMeta('presentation_surface', { ...old, mode, revision: old.revision + 1 });
    return this.surface();
  }
  selectArtifact(sessionId: string, id: string, revision: number) {
    if (this.public) throw new HarnessError('private_review_required', '先回到私人视图核对要公开显示的内容。');
    const runtime = this.store.runtime;
    const artifact = readReleaseArtifacts(this.store.kernel, runtime.policy, runtime.policy.hostScope(), sessionId, id)[0];
    if (!artifact || artifact.revision !== revision) throw new HarnessError('revision_conflict', '这份稿件或它所依据的安排已经变化，需要先核对当前版本。');
    const old = this.setting();
    this.store.putMeta('presentation_surface', { ...old, revision: old.revision + 1, selected: [{ kind: 'artifact', sessionId, id, revision, hash: createHash('sha256').update(artifact.body).digest('hex') }] });
    return this.surface();
  }
  selectMatter(id: string, revision: number) {
    if (this.public) throw new HarnessError('private_review_required', '先回到私人视图核对要展示的内容。');
    const matter = this.matter(id, revision);
    if (!matter) throw new HarnessError('revision_conflict', '这份安排已经变化，请先看当前内容。');
    const old = this.setting();
    this.store.putMeta('presentation_surface', { ...old, revision: old.revision + 1, selected: [{ kind: 'matter', id, revision, hash: createHash('sha256').update(matter.publicBody).digest('hex') }] });
    return this.surface();
  }
  matter(id: string, revision?: number): SharedMatterView | null {
    const runtime = this.store.runtime, scope = runtime.policy.hostScope();
    const record = this.store.kernel.workData(scope, ['collaboration_frame'], { id, revision, statuses: ['active', 'needs_review'], limit: 1 })[0];
    if (!record) return null;
    const options = (Array.isArray(record.data.optionIds) ? record.data.optionIds : []).flatMap(id => {
      const option = this.store.kernel.work(scope, undefined, String(id))[0];
      if (!option || ['planning_intent', 'rehearsal_expression'].includes(String(option.data.type)) || !['option', 'plan'].includes(option.kind) || ['blocked', 'stale', 'rejected', 'cancelled', 'needs_review'].includes(option.status)) return [];
      const point = typeof option.data.placeId === 'string' ? runtime.connections.map?.point(option.data.placeId) : undefined;
      return [{ id: option.id, revision: option.revision, title: option.title, ...(point ? { placeId: point.id, placeLabel: point.displayName } : {}) }];
    });
    const selectedOptionId = typeof record.data.selectedOptionId === 'string' && options.some(option => option.id === record.data.selectedOptionId) ? record.data.selectedOptionId : null;
    const selected = options.find(option => option.id === selectedOptionId);
    return { id: record.id, revision: record.revision, title: record.title, needsReview: record.status === 'needs_review', selectedOptionId, options, sessionId: typeof record.data.sessionId === 'string' ? record.data.sessionId : undefined,
      publicBody: record.title + '\n' + (selected ? (selected.placeLabel ? '地点：' : '当前选择：') + (selected.placeLabel || selected.title) : options.some(option => option.placeId) ? '地点待定' : '方案未定') };
  }
  matters(): SharedMatterView[] {
    if (this.public) return [];
    const runtime = this.store.runtime, scope = runtime.policy.hostScope();
    return this.store.kernel.workData(scope, ['collaboration_frame'], { statuses: ['active', 'needs_review'], excludeCuriosityInvitations: true, limit: 5 }).flatMap(record => {
      if (record.data.curiosityInvitation === true) return [];
      const view = this.matter(record.id, record.revision); return view?.options.length ? [view] : [];
    });
  }
  clearSelection() {
    const old = this.setting(); this.store.putMeta('presentation_surface', { ...old, selected: [], revision: old.revision + 1 }); return this.surface();
  }
  surface(): SurfaceView {
    const settings = this.setting(), runtime = this.store.runtime, scope = runtime.policy.hostScope();
    const artifacts = settings.selected.flatMap(selected => {
      if (selected.kind === 'matter') {
        const matter = this.matter(selected.id, selected.revision);
        if (!matter || createHash('sha256').update(matter.publicBody).digest('hex') !== selected.hash) return [];
        return [{ id: matter.id, revision: matter.revision, title: '已选择的公开内容', body: matter.publicBody }];
      }
      const artifact = readReleaseArtifacts(this.store.kernel, runtime.policy, scope, selected.sessionId || '', selected.id)[0];
      if (!artifact || artifact.revision !== selected.revision || createHash('sha256').update(artifact.body).digest('hex') !== selected.hash) return [];
      return [{ id: artifact.id, revision: artifact.revision, title: '已选择的公开内容', body: artifact.body }];
    });
    return { mode: settings.mode, revision: settings.revision, artifacts, ...(settings.selected.length && !artifacts.length ? { notice: '所选内容已经变化，请回到私人视图核对后重新展示。' } : {}) };
  }
  /** A native notification selects an address, never a cached private body.
   * Every State projection reopens it through the same current owner gates. */
  focusPreparation(ref: PreparationReference): boolean {
    if (this.public || typeof ref?.id !== 'string' || ref.id.length > 160 || !ref.id
      || typeof ref.helpRecordId !== 'string' || !ref.helpRecordId || ref.helpRecordId.length > 160
      || !Number.isSafeInteger(ref.revision) || ref.revision < 1) return false;
    this.preparationFocus = { id: ref.id, revision: ref.revision, helpRecordId: ref.helpRecordId };
    const found = this.preparations().some(item => item.id === ref.id && item.revision === ref.revision && item.helpRecordId === ref.helpRecordId);
    if (!found) this.preparationFocus = undefined;
    return found;
  }
  preparations(): PreparationView[] {
    if (this.public) return [];
    const runtime = this.store.runtime, scope = runtime.policy.hostScope();
    const ordinary = runtime.attention.available(scope), ref = this.preparationFocus;
    const focused = ref ? this.store.kernel.workData(scope, ['help_opportunity'], { id: ref.id, revision: ref.revision,
      statuses: ['prepared', 'question_ready', 'notification_queued'], limit: 1 })
      .filter(record => record.data.helpRecordId === ref.helpRecordId && !!record.data.artifact) : [];
    if (ref && !focused.length) this.preparationFocus = undefined;
    const records = [...new Map([...focused, ...ordinary].map(record => [record.id, record])).values()];
    return records.flatMap(record => {
      if (!runtime.reflectiveLetters.recordReadable(scope, record)) return [];
      const artifact = record.data.artifact as unknown as { title: string; body: string; scenes?: import('../../shared/scenes').SceneSnapshot[] };
      const reflectiveLetter = record.data.reflectiveLetter ? runtime.reflectiveLetters.projectRecord(scope, record) : undefined;
      if (record.data.reflectiveLetter && !reflectiveLetter) return [];
      const sources = (Array.isArray(record.data.material) ? record.data.material : []).flatMap(material => {
        const value = material as { evidenceId?: string; sourceId?: string; observedAt?: string };
        const event = value.evidenceId ? this.store.kernel.evidence(this.store.runtime.policy.hostScope(), value.evidenceId) : undefined;
        const sourceId = value.sourceId || event?.sourceId;
        if (!sourceId) return [];
        return [{ label: sourceId === 'map:local' ? '校园步行地图' : sourceId === 'campus:local' ? '导入的校园资料' : sourceId.startsWith('campus:') ? '已连接的校园资料' : sourceId === 'web:public' ? '公开资料' : '本次提供或查询的资料', ...(value.observedAt || event?.receivedAt ? { at: value.observedAt || event!.receivedAt } : {}) }];
      });
      return [{ id: record.id, revision: record.revision, matterId: String(record.data.matterId), title: artifact.title, body: artifact.body, expiresAt: String(record.data.expiresAt), kind: record.status === 'question_ready' ? 'question' as const : 'material' as const, sources,
        ...(reflectiveLetter ? { reflectiveLetter } : {}), ...(artifact.scenes ? { scenes: this.currentScenes(artifact.scenes) } : {}), ...(record.data.helpRecordId ? { helpRecordId: String(record.data.helpRecordId) } : {}) }];
    });
  }
  /** A kept letter is read through its original help reference, never copied
   * into a new message owner or reactivated as a current opportunity. */
  letterProject(handle: ScopeHandle, raw: ReflectiveLetterProjectInput): PreparationView {
    if (this.public) throw new HarnessError('letter_private', '先回到自己的对话，再打开那封信。');
    const input = reflectiveLetterProjectInput.parse(raw), runtime = this.store.runtime;
    runtime.policy.validate(handle);
    const message = this.store.messages(input.sessionId).find(value => value.id === input.messageId && value.role === 'assistant');
    const matches = (ref: NonNullable<Message['helpRefs']>[number]) => ref.id === input.ref.id
      && ref.revision === input.ref.revision && ref.helpRecordId === input.ref.helpRecordId;
    if (!message?.helpRefs?.some(matches) || !this.sourceCurrentMessage(message).helpRefs?.some(matches))
      throw new HarnessError('letter_reference_missing', '这封信的入口已不在当前可读的原回复里。');
    const record = this.store.kernel.work(handle, undefined, input.ref.id)[0];
    if (!record || record.revision < input.ref.revision || record.data.type !== 'help_opportunity'
      || record.data.helpRecordId !== input.ref.helpRecordId || !record.data.reflectiveLetter)
      throw new HarnessError('letter_reference_changed', '原来那封信现在不能展开，没有用另一封信替它补回。');
    // The writer forbids replacing an existing document in this opportunity.
    // Ordinary dismissal/expiry may advance its envelope revision while the
    // kept letter and all of its real source proofs remain the same owner.
    const read = runtime.reflectiveLetters.read(handle, { operation: 'read', opportunityId: record.id, expectedRevision: record.revision });
    if (!read.letter) throw new HarnessError('letter_source_changed', '这封信的一处来由已改变，先接回现在允许的话。');
    const letter = { ...read.letter, historical: true as const };
    return { id: record.id, revision: record.revision, matterId: String(record.data.matterId || record.data.bindingId || record.id),
      title: letter.title, body: letter.body, expiresAt: String(record.data.expiresAt), kind: 'material',
      helpRecordId: input.ref.helpRecordId, reflectiveLetter: letter };
  }
  state(value: State): State {
    const surface = this.surface();
    if (this.public) return { settings: { ...DEFAULT_SETTINGS }, conversations: [], memories: [], agenda: [], campus: null, campusConnector: null, presentation: surface, preparations: [], matters: [] };
    return { ...value, presentation: surface, preparations: this.preparations(), matters: this.matters() };
  }
  private sceneReadable(scene: SceneSnapshot, options: PresentationRead = {}) {
    const runtime = this.store.runtime, scope = runtime.policy.hostScope();
    if (scene.kind === 'curiosity' && options.liveCuriosity) {
      try { assertCuriositySnapshotSourcesReadable({ repo: this.store.kernel, policy: runtime.policy }, scope, scene); return true; }
      catch (error) { if (error instanceof HarnessError || error instanceof Error && error.name === 'ZodError') return false; throw error; }
    }
    return runtime.scenes.snapshotReadable(scope, scene);
  }
  private historicalScene(scene: SceneSnapshot, options: PresentationRead) {
    if (scene.kind === 'campus' && isAcademicCampus(scene) && !options.liveCampus) return campusAcademicReference(scene);
    if (scene.kind === 'note' && !options.liveNote) return noteHistoryReference(scene);
    if (scene.kind === 'discussion') {
      try { return this.store.runtime.scenes.discussionSnapshot(this.store.runtime.policy.hostScope(), scene); }
      catch (error) {
        if (!(error instanceof HarnessError || error instanceof Error && error.name === 'ZodError')) throw error;
        // Keep the original only as an input to the common denied-source gate;
        // no stale projection escapes through this fallback.
        return scene;
      }
    }
    if (scene.kind === 'rehearsal' && !options.liveRehearsal) return rehearsalHistoryReference(scene);
    return scene.kind === 'curiosity' && !options.liveCuriosity ? curiosityHistoricalProjection(scene) : scene;
  }
  private currentScenes(scenes: import('../../shared/scenes').SceneSnapshot[], options: PresentationRead = {}) {
    return scenes.flatMap<SceneSnapshot>(scene => {
      if (this.studySnapshot(scene)) return [studyHistoryReference(scene)];
      if (scene.kind === 'study_reference') return [scene];
      const projected = this.historicalScene(scene, options);
      if (projected.kind === 'curiosity_reference' || projected.kind === 'rehearsal_reference' || projected.kind === 'note_reference') return [projected];
      return this.sceneReadable(projected, options) ? [projected] : [];
    });
  }
  private studySnapshot(scene: SceneSnapshot): scene is StudyScene { return scene.kind === 'study'; }
  /** Historical IPC and exports must apply the same source gate as scene tools. */
  sourceCurrentMessage(value: Message, options: PresentationRead = {}): Message {
    const runtime = this.store.runtime, scope = runtime.policy.hostScope();
    value = programMessageProjection(runtime, value, { live: options.liveProgram });
    if (value.releaseArtifacts?.length) {
      const originals = value.releaseArtifacts;
      const heads = new Set(latestReleases(originals).filter(artifact =>
        !!historicalReleaseArtifact(this.store.kernel, runtime.policy, scope, artifact, value.contextReceipt)).map(artifact => artifact.id));
      const visible = originals.flatMap(artifact => {
        if (!heads.has(artifact.id)) return [];
        const historical = historicalReleaseArtifact(this.store.kernel, runtime.policy, scope, artifact, value.contextReceipt);
        return historical ? [historical] : [];
      });
      const rendered = renderReleases(latestReleases(visible));
      const knownHostBody = [renderReleases(originals), renderReleases(latestReleases(originals)), ...originals.map(artifact => renderReleases([artifact]))].includes(value.content);
      const separated = value.responseText !== undefined || knownHostBody;
      value = { ...value, releaseArtifacts: visible,
        content: separated ? (value.responseText || '') + (value.responseText && rendered ? '\n\n' : '') + rendered : visible.length === originals.length ? value.content : '',
        ...(visible.length !== originals.length ? { hostStatus: { kind: 'notice' as const, code: 'source_changed' as const, text: '这份旧稿的一处来源已变化，相关正文暂不可读。' } } : {}) };
    }
    if (!value.releaseArtifacts && value.scopeSummary?.release && ['group', 'public'].includes(value.scopeSummary.audience)
      && !releaseMessageReadable(this.store.kernel, runtime.policy, scope, undefined, value.contextReceipt, true))
      value = { ...value, content: '', responseText: undefined,
        hostStatus: { kind: 'notice', code: 'source_changed', text: '这份旧稿的来源证明暂时接不上，正文暂不可读。' } };
    const scopeData = runtime.policy.validate(scope);
    const snapshots = [...new Map([...(value.scenes || []), ...runtime.scenes.all(value.sessionId)]
      .map(scene => [`${scene.id}@${scene.revision}`, this.historicalScene(scene, options)])).values()];
    const referenced = new Set((value.views || []).flatMap(view => view.sceneRefs.map(ref => `${ref.id}@${ref.revision}`)));
    const attached = snapshots.filter(scene => !this.studySnapshot(scene) && scene.kind !== 'study_reference' && scene.kind !== 'curiosity_reference' && scene.kind !== 'rehearsal_reference' && scene.kind !== 'note_reference'
      && ((value.scenes || []).some(item => item.id === scene.id && item.revision === scene.revision)
        || referenced.has(`${scene.id}@${scene.revision}`)));
    const helpRefs: NonNullable<Message['helpRefs']> = (value.helpRefs || []).map(({ kind: _kind, ...ref }) => {
      // The kind is a host projection of this original owner, not a client
      // assertion and not a second copy of the private letter body.
      const marker = this.store.kernel.db.prepare(`SELECT 1 FROM h_work WHERE id=? AND owner=? AND workspace=?
        AND (json_type(payload,'$.data.reflectiveLetterBinding') IS NOT NULL OR json_type(payload,'$.data.reflectiveLetter') IS NOT NULL)`)
        .get(ref.id, scopeData.principalId, scopeData.workspaceId);
      return marker ? { ...ref, kind: 'reflective_letter' } : ref;
    });
    const lettersReadable = helpRefs.every(ref => {
      if (ref.kind !== 'reflective_letter') return true;
      const record = this.store.kernel.work(scope, undefined, ref.id)[0];
      return !!record && runtime.reflectiveLetters.recordReadable(scope, record);
    });
    const bodyReadable = this.store.kernel.planningMessageReadable(scope, { contextReceipt: value.contextReceipt, scenes: attached }, { checked: new Map(), localDisplay: true })
      && attached.every(scene => this.sceneReadable(scene, options)) && lettersReadable;
    if (value.role === 'assistant' && !bodyReadable) return { ...value,
      content: '', responseText: undefined,
      hostStatus: { kind: 'notice', code: 'source_changed', text: '这条回复的依据已改变，正文暂不可读。' },
      steps: [], obligations: [], actions: [], mapCards: undefined, scenes: [], views: [],
      releaseArtifacts: undefined, helpRefs: undefined, primaryHelpRef: undefined, cooperationId: undefined,
      contextReceipt: undefined, objectStates: undefined, image: undefined };
    const denied = new Set(snapshots.filter(scene => !this.studySnapshot(scene) && scene.kind !== 'study_reference' && scene.kind !== 'curiosity_reference' && scene.kind !== 'rehearsal_reference' && scene.kind !== 'note_reference'
      && !this.sceneReadable(scene, options)).map(scene => `${scene.id}@${scene.revision}`));
    const visibleScenes = value.scenes ? this.currentScenes(value.scenes, options) : undefined;
    const visibleViews = value.views?.filter(view => view.sceneRefs.every(ref => !denied.has(`${ref.id}@${ref.revision}`)));
    return { ...value, ...(value.helpRefs ? { helpRefs } : {}), ...(visibleScenes ? { scenes: visibleScenes } : {}),
      ...(visibleViews ? { views: orderCampusPageViews(visibleViews, visibleScenes || []) } : {}) };
  }
  message(value: Message, options: PresentationRead = {}): Message | null {
    if (this.public) return null;
    const safe = this.sourceCurrentMessage(value, options);
    const objectStates: ObjectPresentationState[] = safe.actions.map(action => {
      const current = this.store.runtime.calendar.read(action.id);
      const effect = this.store.runtime.actions.get(this.store.runtime.policy.hostScope(), action.effectActionId || action.id);
      const currentRevision = current?.revision || (current ? 1 : null), historicalRevision = action.revision || 1;
      const retired = effect && ['succeeded', 'cancelled', 'cancel_requested', 'cancellation_confirmed', 'cannot_cancel'].includes(effect.status);
      const relation = !current ? action.saved || retired ? 'removed' : 'current' : currentRevision === historicalRevision ? 'current' : 'changed';
      return { id: action.id, kind: 'agenda', currentRevision, historicalRevision, relation, operationAvailable: relation === 'current' };
    });
    const workVersions = new Map<string, number>();
    for (const ref of safe.contextReceipt?.providedObjectVersions || []) if (ref.kind === 'work') workVersions.set(ref.id, Math.max(workVersions.get(ref.id) || 0, ref.revision));
    for (const [id, historicalRevision] of workVersions) {
      const current = this.store.kernel.work(this.store.runtime.policy.hostScope(), undefined, id)[0];
      const relation = !current ? 'removed' : current.revision === historicalRevision ? 'current' : 'changed';
      objectStates.push({ id, kind: 'work', historicalRevision, currentRevision: current?.revision || null, relation, operationAvailable: relation === 'current' && !['stale', 'blocked', 'cancelled'].includes(current?.status || '') });
    }
    const boundary = this.store.runtime.policy.validate(this.store.runtime.policy.hostScope());
    return { ...safe, objectStates,
      presentationBoundaryKey: `${boundary.privacyEpoch}:${boundary.policyRevision}:${this.store.runtime.policy.sourceBoundary}` };
  }
  permitsIpc(name: string) {
    return !this.public || ['state', 'messages', 'presentation:surface', 'presentation:clear', 'stop', 'text:copy', 'draft:info', 'draft:unsaved'].includes(name);
  }
}
