import { createHash } from 'node:crypto';
import { DEFAULT_SETTINGS, type Message, type State } from '../../shared/types';
import type { ObjectPresentationState, PreparationView, SharedMatterView, SurfaceView } from '../../shared/presentation';
import type { Store } from '../store';
import { readReleaseArtifacts } from './release-store';
import { HarnessError } from '../../shared/harness';

/** Audience projection happens before IPC. Public presentation has neither
 * private transcript payloads nor hidden explanations in DOM/ARIA metadata. */
export class PresentationService {
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
    if (!artifact || artifact.revision !== revision || !this.artifactCurrent(artifact)) throw new HarnessError('revision_conflict', '这份稿件或它所依据的安排已经变化，需要先核对当前版本。');
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
      if (!option || !['option', 'plan'].includes(option.kind) || ['blocked', 'stale', 'rejected', 'cancelled', 'needs_review'].includes(option.status)) return [];
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
    return this.store.kernel.workData(scope, ['collaboration_frame'], { statuses: ['active', 'needs_review'], limit: 5 }).flatMap(record => {
      const view = this.matter(record.id, record.revision); return view?.options.length ? [view] : [];
    });
  }
  private artifactCurrent(artifact: import('../../shared/types').ReleaseArtifact) {
    const runtime = this.store.runtime, scope = runtime.policy.hostScope(), repo = this.store.kernel;
    return (artifact.basedOnObjects || []).every(ref => {
      if (ref.kind === 'agenda') { const current = runtime.calendar.read(ref.id); return !!current && (current.revision || 1) === ref.revision; }
      if (ref.kind === 'work') { const current = repo.work(scope, undefined, ref.id)[0]; return !!current && current.revision === ref.revision && !['stale', 'blocked', 'cancelled'].includes(current.status); }
      if (ref.kind === 'assertion') return repo.assertion(scope, ref.id)?.revision === ref.revision;
      return repo.evidence(scope, ref.id)?.contentVersion === ref.revision;
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
      if (!artifact || artifact.revision !== selected.revision || createHash('sha256').update(artifact.body).digest('hex') !== selected.hash || !this.artifactCurrent(artifact)) return [];
      return [{ id: artifact.id, revision: artifact.revision, title: '已选择的公开内容', body: artifact.body }];
    });
    return { mode: settings.mode, revision: settings.revision, artifacts, ...(settings.selected.length && !artifacts.length ? { notice: '所选内容已经变化，请回到私人视图核对后重新展示。' } : {}) };
  }
  preparations(): PreparationView[] {
    if (this.public) return [];
    return this.store.runtime.attention.available(this.store.runtime.policy.hostScope()).map(record => {
      const artifact = record.data.artifact as { title: string; body: string };
      const sources = (Array.isArray(record.data.material) ? record.data.material : []).flatMap(material => {
        const value = material as { evidenceId?: string; sourceId?: string; observedAt?: string };
        const event = value.evidenceId ? this.store.kernel.evidence(this.store.runtime.policy.hostScope(), value.evidenceId) : undefined;
        const sourceId = value.sourceId || event?.sourceId;
        if (!sourceId) return [];
        return [{ label: sourceId === 'map:local' ? '校园步行地图' : sourceId === 'campus:local' ? '导入的校园资料' : sourceId.startsWith('campus:') ? '已连接的校园资料' : sourceId === 'web:public' ? '公开资料' : '本次提供或查询的资料', ...(value.observedAt || event?.receivedAt ? { at: value.observedAt || event!.receivedAt } : {}) }];
      });
      return { id: record.id, revision: record.revision, matterId: String(record.data.matterId), title: artifact.title, body: artifact.body, expiresAt: String(record.data.expiresAt), kind: record.status === 'question_ready' ? 'question' : 'material', sources, ...(record.data.helpRecordId ? { helpRecordId: String(record.data.helpRecordId) } : {}) };
    });
  }
  state(value: State): State {
    const surface = this.surface();
    if (this.public) return { settings: { ...DEFAULT_SETTINGS }, conversations: [], memories: [], agenda: [], campus: null, campusConnector: null, presentation: surface, preparations: [], matters: [] };
    return { ...value, presentation: surface, preparations: this.preparations(), matters: this.matters() };
  }
  message(value: Message): Message | null {
    if (this.public) return null;
    const objectStates: ObjectPresentationState[] = value.actions.map(action => {
      const current = this.store.runtime.calendar.read(action.id);
      const effect = this.store.runtime.actions.get(this.store.runtime.policy.hostScope(), action.effectActionId || action.id);
      const currentRevision = current?.revision || (current ? 1 : null), historicalRevision = action.revision || 1;
      const retired = effect && ['succeeded', 'cancelled', 'cancel_requested', 'cancellation_confirmed', 'cannot_cancel'].includes(effect.status);
      const relation = !current ? action.saved || retired ? 'removed' : 'current' : currentRevision === historicalRevision ? 'current' : 'changed';
      return { id: action.id, kind: 'agenda', currentRevision, historicalRevision, relation, operationAvailable: relation === 'current' };
    });
    const workVersions = new Map<string, number>();
    for (const ref of value.contextReceipt?.providedObjectVersions || []) if (ref.kind === 'work') workVersions.set(ref.id, Math.max(workVersions.get(ref.id) || 0, ref.revision));
    for (const [id, historicalRevision] of workVersions) {
      const current = this.store.kernel.work(this.store.runtime.policy.hostScope(), undefined, id)[0];
      const relation = !current ? 'removed' : current.revision === historicalRevision ? 'current' : 'changed';
      objectStates.push({ id, kind: 'work', historicalRevision, currentRevision: current?.revision || null, relation, operationAvailable: relation === 'current' && !['stale', 'blocked', 'cancelled'].includes(current?.status || '') });
    }
    return { ...value, objectStates };
  }
  permitsIpc(name: string) {
    return !this.public || ['state', 'messages', 'presentation:surface', 'presentation:clear', 'stop', 'text:copy', 'draft:info', 'draft:unsaved'].includes(name);
  }
}
