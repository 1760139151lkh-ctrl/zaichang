import type { ContextContract, WorkRecord, WorkSourceBinding, WorkSourceRef } from '../../shared/harness';
import { personalMethodSourcesSchema, type PersonalMethodSources } from '../../shared/personal-method';
import type { KernelRepository } from '../storage/repository';
import type { PersonalMethodService } from './personal-methods';

/** Discovery projection of the existing personal-method owner. No method,
 * rating, background task or automatic adoption is created here. */
export function buildPersonalMethodContinuity(runtime: { repo: KernelRepository; personalMethods: PersonalMethodService },
  contract: ContextContract, admission: { ephemeral: boolean; requiresReadPurpose: boolean; permits?: (ref: WorkSourceRef) => boolean }) {
  const empty = () => ({ data: {} as Record<string, unknown>, records: [] as WorkRecord[],
    bindings: [] as WorkSourceBinding[], sources: [] as PersonalMethodSources[] });
  const scope = runtime.repo.scope(contract.scope);
  if (admission.ephemeral || admission.requiresReadPurpose || scope.child || contract.memoryMode !== 'relevant'
    || contract.retention !== 'purpose_scoped' || contract.audience !== 'self' || scope.retention !== 'purpose_scoped'
    || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real') return empty();
  const currentRequest = [...scope.currentEventIds].reverse().map(id => runtime.repo.evidence(contract.scope, id))
    .find(event => event?.speaker === 'user' && event.authority === 'user_statement' && !event.parentEventId
      && ['user_message', 'user_control'].includes(event.kind) && event.status === 'active' && Array.from(event.text).length > 0);
  const source = currentRequest ? { eventId: currentRequest.id, contentVersion: currentRequest.contentVersion,
    start: 0, end: Array.from(currentRequest.text).length } : undefined;
  const cues = runtime.personalMethods.cues(contract.scope, { limit: 4, permits: admission.permits,
    ...(source && admission.permits?.(source) !== false ? { forCurrentHelp: { source } } : {}) });
  if (!cues.items.length && !cues.moreMayExist) return empty();
  return { data: { personalHelpMethods: { items: cues.items, moreMayExist: cues.moreMayExist,
    guidance: '这些是对方希望以后还可以借用的帮法。先听今天想怎样接力，碰到相近的阻点，想实际借来帮眼前这一步时，就沿readForCurrentHelp翻开，把有用的那一点自然做进去；只想回看原约定，就沿read看看，这次回看仍只是回看。readForCurrentHelp带着这次原话的地址，借用就能接回同一次请求；一句里有几件事，就把forCurrentHelp.source缩到真正借用的那一段，已经读到原事项时也可带上matterId。熟悉的默契可以安静地借上，让对方直接得到这一步的帮助；他问起原约定，或今天想法与旧做法不同，再沿choices里的read翻到本人当时怎样选、后来改了哪一处。这里给的是原话地址，完整步骤和适用条件在read_skill里；继续找可以用discover_skills，对方用平常的话就能改，无需记方法名。今天想自己来、只收一步、先粗写一句或认真看完，都照今天来；只想这次换，就留在这次，以后也想改的部分再通过manage_method留下。只改一处时用amend；步骤里只换几句话，可用instructionEdits指到原句，余下文字会原样留住，条件也可只改其中一项。旧日题目、当时用过的材料和那次做到了哪里，都可以沿各自的来由再翻看；眼前这件事怎样做，仍从今天开始。' } },
    records: cues.records,
    bindings: cues.records.flatMap(record => record.sourceBinding ? [record.sourceBinding] : []),
    sources: cues.records.flatMap(record => {
      const parsed = personalMethodSourcesSchema.safeParse(record.data.methodSources);
      return parsed.success ? [parsed.data] : [];
    }) };
}
