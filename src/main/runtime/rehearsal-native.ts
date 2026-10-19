import { HarnessError } from '../../shared/harness';
import { rehearsalNativeInput, type RehearsalScene } from '../../shared/relationship-rehearsal';
import type { Store } from '../store';
import type { RelationshipRehearsalService } from './relationship-rehearsal';

/** Private reopening of one original conversation address. It reads the
 * current original Work owner without starting/resuming the rehearsal. */
export class NativeRehearsalService {
  constructor(readonly store: Store, readonly rehearsals: RelationshipRehearsalService) {}

  project(raw: unknown): RehearsalScene {
    const input = rehearsalNativeInput.parse(raw), runtime = this.store.runtime, repo = this.store.kernel;
    if (runtime.presentation.public) throw new HarnessError('rehearsal_private', '先回到自己的对话，再看看那段试说。');
    const boundary = `${repo.epoch}:${repo.policyRevision}:${runtime.policy.sourceBoundary}`, scope = runtime.policy.hostScope();
    const operation = new AbortController(), remove = runtime.policy.onBarrier(() => operation.abort());
    try {
      const message = this.store.messages(input.sessionId).find(value => value.role === 'assistant' && value.id === input.messageId);
      const matches = (scene: { kind: string; id: string; revision: number }) =>
        (scene.kind === 'rehearsal' || scene.kind === 'rehearsal_reference') && scene.id === input.id && scene.revision === input.sceneRevision;
      if (!message?.scenes?.some(matches) || !runtime.presentation.sourceCurrentMessage(message).scenes?.some(matches))
        throw new HarnessError('rehearsal_reference_missing', '这一处不在当前可读的原回复里。');
      const read = this.rehearsals.read(scope, { sessionId: input.sessionId, allowCrossSession: false }, { id: input.id });
      if (!read.view) throw new HarnessError('rehearsal_source_changed', '这段试说的一处来由已改变，先接回现在允许的话。');
      operation.signal.throwIfAborted(); runtime.policy.validate(scope);
      if (runtime.presentation.public || boundary !== `${repo.epoch}:${repo.policyRevision}:${runtime.policy.sourceBoundary}`)
        throw new HarnessError('rehearsal_source_changed', '资料或展示范围刚有变化，请从当前对话重新打开。');
      const now = repo.clock.now();
      return { ...read.view, kind: 'rehearsal', sessionId: input.sessionId, createdAt: now, sourceBoundary: boundary,
        source: { sourceId: 'work:self', fetchedAt: now, version: `${read.view.id}@${read.view.revision}` } };
    } finally { remove(); }
  }
}
