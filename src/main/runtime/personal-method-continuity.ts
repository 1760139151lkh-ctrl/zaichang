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
  if (!cues.items.length) return empty();
  return { data: { personalHelpMethods: { items: cues.items, moreMayExist: cues.moreMayExist,
    guidance: '这里留着几种本人愿意以后再借用的帮法，以及各自适合的时候。它们能让你想起当时什么帮助奏效，是否适合眼下这处阻点，仍由你结合当前交流判断。read_skill 可以读到现在的完整做法，discover_skills 还能找到这里没有列出的其他办法。对方无需记住方法名或从目录里挑选，也可以直接得到眼前需要的帮助。只想这次试试、想换一种、今天不适用，都可以只调整这次；长期方法另有明确修改意愿和版本，局部 amend 会保留其他有效条件。这些线索和读取记录说明曾经选过什么、现在读到了什么，本身没有作出新的认可、完成判断或行动授权。' } },
    records: cues.records,
    bindings: cues.records.flatMap(record => record.sourceBinding ? [record.sourceBinding] : []),
    sources: cues.records.flatMap(record => {
      const parsed = personalMethodSourcesSchema.safeParse(record.data.methodSources);
      return parsed.success ? [parsed.data] : [];
    }) };
}
