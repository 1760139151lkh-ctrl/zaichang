import { HarnessError, type ScopeHandle } from '../../shared/harness';
import { studyNativeInputSchema, type StudyNativeInput, type StudyScene } from '../../shared/study-presentation';
import type { Store } from '../store';
import type { StudyPresentationService } from './study-presentation';

/** Trusted private UI reads one known learning artifact. The renderer cannot
 * provide a source, file path, tool call or cached body to authorize itself. */
export class NativeStudyService {
  constructor(readonly store: Store, readonly presentation: StudyPresentationService) {}

  private boundary() {
    const { kernel, runtime } = this.store, settings = this.store.settings();
    return JSON.stringify([kernel.epoch, kernel.policyRevision, runtime.policy.sourceBoundary,
      runtime.presentation.public, settings.memoryEnabled, settings.weatherEnabled]);
  }

  private scope() {
    const { runtime } = this.store;
    if (runtime.presentation.public) throw new HarnessError('private_view_required', '先回到自己的对话，再接着学习这一页。');
    const settings = this.store.settings(), base = runtime.policy.validate(runtime.policy.hostScope());
    return runtime.policy.hostScope({ sources: base.sources.filter(source =>
      (settings.memoryEnabled || !['history:self', 'profile:self'].includes(source))
      && (settings.weatherEnabled || source !== 'weather:open-meteo')),
      grants: base.grants.filter(grant => grant.endsWith(':read')), currentEventIds: [], infer: false, audience: 'self' });
  }

  private conversation(sessionId: string) {
    if (!this.store.db.prepare('SELECT 1 FROM sessions WHERE id=?').get(sessionId)
      || this.store.conversationPolicy(sessionId)?.retention === 'session_only')
      throw new HarnessError('study_conversation', '这段对话现在不能恢复已保存的陪学纸。');
    const latest = this.store.db.prepare(`SELECT COALESCE(json_extract(payload,'$.scopeSummary.audience'),
      json_extract(payload,'$.requestControls.audience')) AS audience FROM messages WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`).get(sessionId);
    if (latest?.audience === 'group' || latest?.audience === 'public')
      throw new HarnessError('study_private_conversation', '陪学内容只在本人的私人交流中展开。');
  }

  private authorize(handle: ScopeHandle, input: StudyNativeInput) {
    this.conversation(input.sessionId);
    const attached = this.store.messages(input.sessionId).some(message => {
      if (input.messageId && message.id !== input.messageId || message.role !== 'assistant'
        || message.scopeSummary?.audience && message.scopeSummary.audience !== 'self') return false;
      return (message.scenes || []).some(scene => {
        const value = scene as unknown as { kind?: string; id?: string; revision?: number; owner?: { id?: string; revision?: number } };
        return ['study', 'study_reference'].includes(String(value.kind)) && value.owner?.id === input.studyId
          && value.owner.revision === input.studyRevision && value.revision === input.studyRevision && value.id === 'study-scene:' + input.studyId;
      });
    });
    // An already-saved owner in this exact conversation may also be opened
    // while its current reply is still being attached to the message.
    const own = this.store.kernel.workArtifactRecords(handle, 'study_companion', { id: input.studyId, sessionId: input.sessionId, limit: 1 })[0];
    if (!attached && (!own || own.revision !== input.studyRevision))
      throw new HarnessError('study_reference_missing', '这一页不是当前对话中已有的学习引用，请从原消息或原学习事项打开。');
    if (input.messageId && !attached) throw new HarnessError('study_reference_missing', '这条消息没有所选的学习引用。');
    const current = own || (attached ? this.store.kernel.workArtifactRecords(handle, 'study_companion', { id: input.studyId, limit: 1 })[0] : undefined);
    return { attached, own, current };
  }

  async project(raw: StudyNativeInput): Promise<StudyScene> {
    const input = studyNativeInputSchema.parse(raw), boundary = this.boundary(), handle = this.scope();
    const admission = this.authorize(handle, input);
    const current = admission.current?.revision === input.studyRevision;
    const value = await this.presentation.project(handle, { studyId: input.studyId,
      // An old message is an address to the current owner, never a request to
      // replay its old answer. A changed owner starts at its current focus.
      ...(current ? { studyRevision: input.studyRevision, focus: input.focus } : {}),
      historyOffset: input.historyOffset, historyLimit: input.historyLimit },
    { ...(admission.attached ? {} : { restrictToSessionId: input.sessionId }) });
    this.store.runtime.policy.validate(handle);
    if (boundary !== this.boundary()) throw new HarnessError('study_boundary_changed', '资料或展示范围刚有变化，请从当前对话重新打开这一页。');
    this.authorize(handle, input);
    return value.scene;
  }

  async read(raw: StudyNativeInput): Promise<StudyScene> { return this.project(raw); }
}
