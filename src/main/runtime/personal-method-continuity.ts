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
    guidance: '这些是本人明确愿意以后借用的有条件帮法，只是少量线索，不是人格或成绩标签。你按眼下真实阻点判断是否相关，需要时先read_skill读当前正文，再先实际帮一点；不把目录抛给用户选择，不要求用户记方法名。当前说只这次、想换法或不适用时直接调整本轮，不因此改长期方法；明确要改原方法时按当前revision作局部amend，保住独立有效的条件。没有列出不表示没有其他办法，可用discover_skills继续找。读取不是采用、认可、完成或业务行动授权。' } },
    records: cues.records,
    bindings: cues.records.flatMap(record => record.sourceBinding ? [record.sourceBinding] : []),
    sources: cues.records.flatMap(record => {
      const parsed = personalMethodSourcesSchema.safeParse(record.data.methodSources);
      return parsed.success ? [parsed.data] : [];
    }) };
}
