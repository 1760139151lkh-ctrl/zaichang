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
  const cues = runtime.personalMethods.cues(contract.scope, { limit: 4, permits: admission.permits });
  if (!cues.items.length && !cues.moreMayExist) return empty();
  return { data: { personalHelpMethods: { items: cues.items, moreMayExist: cues.moreMayExist,
    guidance: '这些是对方希望以后还可以借用的帮法。先听今天想怎样接力，碰到相近的阻点，再翻开合适的一份，把有用的那一点自然做进眼前的帮助。熟悉的默契可以安静地借上，让对方直接得到这一步的帮助；他问起原约定时，再一起说清那份意思。这里是几行引子，完整的步骤和适用条件在read_skill里；继续找还可以用discover_skills，对方用平常的话就能改，无需记方法名。今天想自己来、想换一种，都照今天来；只想这次换，就留在这次，以后也想改的部分再通过manage_method留下。只改一处时用amend；步骤里只换几句话，可用instructionEdits指到原句，余下文字会原样留住，条件也可只改其中一项。旧日题目、当时用过的材料和那次做到了哪里，都可以沿各自的来由再翻看；眼前这件事怎样做，仍从今天开始。' } },
    records: cues.records,
    bindings: cues.records.flatMap(record => record.sourceBinding ? [record.sourceBinding] : []),
    sources: cues.records.flatMap(record => {
      const parsed = personalMethodSourcesSchema.safeParse(record.data.methodSources);
      return parsed.success ? [parsed.data] : [];
    }) };
}
