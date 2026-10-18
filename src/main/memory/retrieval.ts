import type { Assertion, EvidenceEvent, ScopeHandle } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';

/** Queries come from the reasoning model, never a hard-coded intent/synonym table. */
export interface RecallOptions {
  relatedQueries?: string[];
  mode?: 'search' | 'scan';
}
export type EvidenceProjection = (event: EvidenceEvent) => EvidenceEvent | undefined;

export function recallQueries(query: string, related: string[] = []) {
  const seen = new Set<string>();
  return [query, ...related].filter(value => {
    const key = value.normalize('NFKC').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 6);
}

/** Rank is fused, not incomparable backend scores. One arm gets one vote per ID. */
export function fuseRecallRanks<T extends { id: string }>(arms: T[][]): T[] {
  const hits = new Map<string, { item: T; score: number; first: number }>();
  arms.forEach(arm => {
    const seen = new Set<string>();
    arm.forEach((item, index) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      const hit = hits.get(item.id) || { item, score: 0, first: hits.size };
      hit.score += 1 / (60 + index + 1); hits.set(item.id, hit);
    });
  });
  return [...hits.values()].sort((a, b) => b.score - a.score || a.first - b.first || a.item.id.localeCompare(b.item.id)).map(hit => hit.item);
}

export function currentAssertion(assertion: Assertion, at: string) {
  const time = Date.parse(at);
  return assertion.status === 'active' && assertion.verification === 'verified'
    && (!assertion.temporal.validFrom || Date.parse(assertion.temporal.validFrom) <= time)
    && (!assertion.temporal.validTo || Date.parse(assertion.temporal.validTo) > time);
}

export function visibleEvidence(event: EvidenceEvent, project?: EvidenceProjection) {
  const view = project ? project(event) : event;
  if (!view || view.id !== event.id || view.contentVersion !== event.contentVersion) return undefined;
  return view;
}

export function matchesVisibleQuery(query: string, text: string) {
  const points = Array.from(query.normalize('NFKC').toLowerCase());
  const grams = points.slice(0, -1).map((point, index) => point + points[index + 1])
    .filter(gram => !/[\s，。？！、；：]/.test(gram));
  const visible = text.normalize('NFKC').toLowerCase();
  return grams.length ? grams.some(gram => visible.includes(gram)) : visible.includes(query.trim().toLowerCase());
}

export function projectHistoricalEvidence(repo: KernelRepository, scope: ScopeHandle, original: EvidenceEvent, project?: EvidenceProjection) {
  const event = visibleEvidence(original, project);
  if (!event) return undefined;
  const historical = repo.historicalEvidence(scope, event);
  if (event.text === original.text) return historical;
  // Restriction predicates/replacement links may describe a different, private passage.
  return { ...historical, restrictions: historical.restrictions.length ? [{ predicate: 'restricted_source_range', operation: 'RECHECK',
    replacementEventId: null, ranges: [], rangeUnknown: true, effectiveFrom: null }] : [] };
}

/** A selected understanding carries its conditions, exceptions and actual versioned dependencies. */
export function expandRecallBundle(repo: KernelRepository, scope: ScopeHandle, root: Assertion, at: string, project?: EvidenceProjection) {
  const assertions = new Map<string, Assertion>(), sources = new Map<string, EvidenceEvent>();
  const queue = [{ assertion: root, depth: 0 }], visited = new Set<string>();
  const gaps: { relation: 'exception' | 'dependency'; reason: string; id?: string }[] = [];
  // The root and its complete support are indivisible. Bound additional
  // traversal, then let the context compiler enforce the actual byte budget.
  const MAX_ADDITIONAL_OBJECTS = 24, MAX_DEPTH = 3;
  const maxObjects = 1 + root.evidenceIds.length + MAX_ADDITIONAL_OBJECTS;
  const addSource = (event: EvidenceEvent) => {
    const view = visibleEvidence(event, project);
    // A derived assertion cannot expose a summary of the ungranted remainder.
    if (!view || view.text !== event.text) return false;
    sources.set(view.id, view); return true;
  };
  while (queue.length) {
    const { assertion, depth } = queue.shift()!;
    if (visited.has(assertion.id)) continue;
    visited.add(assertion.id);
    if (!currentAssertion(assertion, at)) continue;
    const originals = assertion.evidenceIds.map(id => repo.evidence(scope, id));
    if (originals.some(event => !event || !visibleEvidence(event, project) || visibleEvidence(event, project)!.text !== event.text)) {
      if (assertion.id === root.id) return undefined;
      gaps.push({ relation: 'dependency', reason: 'supporting_source_unavailable_in_scope' }); continue;
    }
    if (assertions.size + 1 + sources.size + originals.filter(event => event && !sources.has(event.id)).length > maxObjects) {
      gaps.push({ relation: 'dependency', reason: 'bundle_object_budget' }); continue;
    }
    assertions.set(assertion.id, assertion);
    originals.forEach(event => { if (event) addSource(event); });
    const schedule = (id: string, relation: 'exception' | 'dependency', revision?: number) => {
      const related = repo.assertion(scope, id);
      if (!related) return false;
      if (revision !== undefined && related.revision !== revision) {
        gaps.push({ relation, reason: 'producer_revision_changed', id: related.id }); return true;
      }
      if (!currentAssertion(related, at)) {
        // An exception outside its own validity interval simply does not apply.
        if (relation === 'dependency') gaps.push({ relation, reason: 'producer_not_current', id: related.id });
        return true;
      }
      if (depth >= MAX_DEPTH || assertions.size + sources.size + queue.length >= maxObjects) {
        gaps.push({ relation, reason: depth >= MAX_DEPTH ? 'dependency_depth_limit' : 'bundle_object_budget', id: related.id }); return true;
      }
      queue.push({ assertion: related, depth: depth + 1 }); return true;
    };
    for (const id of assertion.exceptionIds) {
      if (!schedule(id, 'exception')) gaps.push({ relation: 'exception', reason: 'unavailable_in_scope' });
    }
    for (const dep of repo.dependencies(assertion.id)) {
      const relation = assertion.exceptionIds.includes(dep.producerId) ? 'exception' : 'dependency';
      if (schedule(dep.producerId, relation, dep.producerRevision)) continue;
      const event = repo.evidence(scope, dep.producerId);
      if (!event) { gaps.push({ relation: 'dependency', reason: 'unavailable_in_scope_or_not_memory_source' }); continue; }
      if (event.contentVersion !== dep.producerRevision) gaps.push({ relation: 'dependency', reason: 'producer_revision_changed', id: event.id });
      else if (sources.size + assertions.size >= maxObjects && !sources.has(event.id)) gaps.push({ relation: 'dependency', reason: 'bundle_object_budget' });
      else if (!addSource(event)) gaps.push({ relation: 'dependency', reason: 'source_projection_incomplete' });
    }
  }
  return { assertions: [...assertions.values()], sources: [...sources.values()].map(e => {
    const { use, restrictions } = repo.historicalEvidence(scope, e);
    return { id: e.id, text: e.text, contentVersion: e.contentVersion, receivedAt: e.receivedAt, sourceId: e.sourceId, authority: e.authority, use, restrictions };
  }), dependencyCoverage: { status: gaps.length ? 'incomplete' : 'complete', gaps, maxDepth: MAX_DEPTH, maxAdditionalObjects: MAX_ADDITIONAL_OBJECTS,
    meaning: gaps.length ? '条件组合未闭合；不得按完整现行依据使用，先核对缺口或给条件性判断。' : '已展开所记录的关系；这不证明未记录的现实条件全部齐备。' } };
}

/** Fixed, disclosed ranking window; continuations retain the real query so deeper hits remain reachable. */
export function multiQueryRecall(repo: KernelRepository, scope: ScopeHandle, queries: string[], at: string,
  offset: number, limit: number, hardOffset: number, profileAllowed: boolean, historyAllowed: boolean) {
  const window = 51;
  const softArms = profileAllowed ? queries.map(query => repo.lexicalAssertionPage(scope, query, { at, verified: true, strength: 'non_hard', limit: window })) : [];
  const hardArms = profileAllowed ? queries.map(query => repo.lexicalAssertionPage(scope, query, { at, verified: true, strength: 'hard', limit: window })) : [];
  const originalArms = historyAllowed ? queries.map(query => repo.lexicalEvidence(scope, query, window)) : [];
  const soft = fuseRecallRanks(softArms.map(arm => arm.items)), hard = fuseRecallRanks(hardArms.map(arm => arm.items));
  const originals = fuseRecallRanks(originalArms);
  return {
    selected: [...hard.slice(hardOffset, hardOffset + 8), ...soft.slice(offset, offset + limit)],
    raw: originals.slice(offset, offset + limit),
    nextOffset: soft.length > offset + limit || originals.length > offset + limit ? offset + limit : null,
    nextHardOffset: hard.length > hardOffset + 8 ? hardOffset + 8 : null,
    hardTotal: hard.length,
    queryContinuations: queries.flatMap((query, index) => {
      const softMore = (softArms[index]?.total || 0) > window, hardMore = (hardArms[index]?.total || 0) > window;
      const originalsMore = (originalArms[index]?.length || 0) === window;
      return softMore || hardMore || originalsMore ? [{ query, offset: softMore || originalsMore ? window : 0,
        hardOffset: hardMore ? window : 0, mode: 'search' as const, relatedQueries: [], mayHaveMoreOriginals: originalsMore }] : [];
    }),
    rankingWindow: { perQuery: window, fusion: 'reciprocal_rank', candidateWindowOnly: true },
  };
}
