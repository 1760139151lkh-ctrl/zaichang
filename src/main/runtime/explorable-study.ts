import { HarnessError } from '../../shared/harness';
import { explorableStudySchema, projectExplorableStudy, type ExplorableStudySpec } from '../../shared/explorable-study';

/** A calculation boundary after the real Study owner/material read. No Work,
 * facts, background job or authority is created by changing a condition. */
export function resolveExplorableStudy(spec: ExplorableStudySpec | undefined, values: unknown) {
  if (!spec) throw new HarnessError('study_exploration_changed', '当前这一段没有同一个可改条件的解释，请从现在的学习纸重新接着问。');
  try { return projectExplorableStudy(explorableStudySchema.parse(spec), values).observation; }
  catch (error) {
    throw new HarnessError('study_exploration_range', error instanceof Error && !(error.name === 'ZodError')
      ? error.message : '当前解释或所改条件不在这段二次关系的有限支持范围内，仍可接着正常讲解或调查。');
  }
}
