import { z } from 'zod';
import { HarnessError, type Assertion, type ScopeHandle } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import { canonical } from '../runtime/semantics';

export const understandingReadInput = z.object({
  id: z.string().min(1).max(160),
  view: z.enum(['current', 'history']).optional(),
  snapshotRevision: z.number().int().positive().optional(),
  beforeRevision: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(20).optional(),
  knownAt: z.string().datetime({ offset: true }).optional().describe('系统在此时已保存的理解；不是现实生效时间。旧版本无宿主提交时间时保持未知。'),
  validAt: z.string().datetime({ offset: true }).optional().describe('另行核对这一现实时间是否在该版本声明的有效区间内；不改变历史或当前状态。'),
}).strict();

const meaning = '这是同一条理解的修订历史，只解释当时保存了什么及后来怎样变化，不授予现在使用旧事实或恢复旧授权的许可。现实有效时间与宿主保存时间分别保留；无可靠提交时间的旧版本不会推算日期。来源后来纠正、删除、撤权或退出本轮范围时，相关旧正文仍不展开。';

function validTime(assertion: Assertion) {
  return { from: assertion.temporal.validFrom ?? null, to: assertion.temporal.validTo ?? null,
    precision: assertion.temporal.precision, ...(assertion.temporal.unresolvedExpression ? { unresolved: assertion.temporal.unresolvedExpression } : {}) };
}

/** A transient view over the existing assertion owner. No second memory,
 * periodic summary, copied evidence or historical authorization is created. */
export function readUnderstandingHistory(repo: KernelRepository, handle: ScopeHandle, raw: z.infer<typeof understandingReadInput>,
  sourceReadable?: (eventId: string) => boolean) {
  if (!repo.personalMemoryReadable(handle))
    throw new HarnessError('memory_history_scope', '本轮范围不允许读取个人理解历史。');
  const page = repo.assertionHistory(handle, raw.id, raw);
  if (!page) return { status: 'not_found', items: [], reason: '当前范围内没有可读取的这条理解。' };
  const items = page.items.map((entry, index) => {
    const value = entry.assertion && [...entry.assertion.evidenceIds, ...(entry.citations || []).map(citation => citation.eventId)]
      .every(id => sourceReadable?.(id) !== false)
      && (!entry.cause || sourceReadable?.(entry.cause.eventId) !== false) ? entry.assertion : undefined;
    const prior = page.items[index + 1]?.assertion;
    const priorCause = page.items[index + 1]?.cause;
    const previous = prior && [...prior.evidenceIds, ...(page.items[index + 1]?.citations || []).map(citation => citation.eventId)]
      .every(id => sourceReadable?.(id) !== false)
      && (!priorCause || sourceReadable?.(priorCause.eventId) !== false) ? prior : undefined;
    const cause = entry.cause && sourceReadable?.(entry.cause.eventId) !== false ? entry.cause : undefined;
    const changes = value && previous && previous.revision + 1 === value.revision
      ? ([['wording', previous.text, value.text], ['value', previous.value, value.value],
        ['conditions', previous.conditions, value.conditions], ['exceptions', previous.exceptionIds, value.exceptionIds],
        ['validTime', validTime(previous), validTime(value)], ['status', previous.status, value.status],
        ['sources', previous.evidenceIds, value.evidenceIds]] as const)
        .filter(([, before, after]) => canonical(before) !== canonical(after)).map(([field]) => field) : undefined;
    const appliesAt = value && raw.validAt ? value.temporal.precision === 'unresolved'
      || !value.temporal.validFrom && !value.temporal.validTo ? null
      : (!value.temporal.validFrom || Date.parse(value.temporal.validFrom) <= Date.parse(raw.validAt))
        && (!value.temporal.validTo || Date.parse(value.temporal.validTo) > Date.parse(raw.validAt)) : undefined;
    return { revision: entry.revision, committedAt: entry.committedAt, timing: entry.timing,
      operation: entry.operation, previousRevision: entry.previousRevision,
      ...(cause ? { changeSource: { ...cause, read: { tool: 'read_evidence', arguments: {
        id: cause.eventId, offset: cause.start, limit: Math.min(1200, cause.end - cause.start) } } } } : {}),
      ...(entry.related ? { relatedUnderstanding: entry.related } : {}),
      sourceCoverage: value ? 'available' : 'suppressed', currentUse: 'not_authorized_by_history',
      ...(value ? { understanding: { id: value.id, predicate: value.predicate, text: value.text, value: value.value,
        kind: value.kind, strength: value.strength, conditions: value.conditions, exceptionIds: value.exceptionIds,
        validTime: validTime(value), statusAtRevision: value.status, verificationAtRevision: value.verification },
      ...(value.referenceContexts?.length ? { referenceContexts: value.referenceContexts.map(reference => ({
        ...reference, meaning: '助手原问句只解释本人答复的指代，不是本人事实或执行许可。',
        read: { tool: 'read_assistant_history', arguments: { id: reference.messageId, offset: reference.start,
          limit: Math.min(1200, reference.end - reference.start) } },
      })) } : {}),
      citations: entry.citations, ...(appliesAt === undefined ? {} : { declaredIntervalContainsValidAt: appliesAt }) }
        : { reason: '这个修订的原依据已不在当前可用范围，没有恢复旧正文。' }),
      ...(changes ? { changedFields: changes } : {}),
    };
  });
  return { status: raw.knownAt && page.knownAtCoverage === 'unknown' ? 'unknown' : items.length ? 'fresh' : 'not_found',
    id: page.id, mode: raw.knownAt ? 'as_known_at' : 'revision_history',
    ...(raw.knownAt ? { knownAt: raw.knownAt, selectedRevision: page.selectedRevision ?? null } : {}),
    ...(raw.validAt ? { validAt: raw.validAt } : {}), items,
    coverage: { kind: 'revision_directory', snapshotRevision: page.snapshotRevision, nextBeforeRevision: page.nextBeforeRevision,
      complete: page.nextBeforeRevision === null, unknownCommitTimes: page.unknownCommitTimes,
      historicalContentComplete: page.nextBeforeRevision === null && (!raw.knownAt || !page.unknownCommitTimes)
        && items.every(item => item.sourceCoverage === 'available'),
      ...(raw.knownAt ? { knownAtCoverage: page.knownAtCoverage } : {}),
      ...(page.nextBeforeRevision === null ? {} : { read: { tool: 'read_understanding', arguments: { ...raw, view: 'history',
        snapshotRevision: page.snapshotRevision, beforeRevision: page.nextBeforeRevision } } }) }, meaning };
}
