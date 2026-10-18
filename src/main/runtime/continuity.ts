import type { ContextContract, WorkRecord } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';

export interface ContinuityIndex {
  preparedMaterials: {
    id: string;
    revision: number;
    title: string;
    expiresAt: string;
    fromCurrentConversation: boolean;
    delivery: 'not_observed' | 'submitted_or_delivered';
    meaning: string;
  }[];
  openThreads: {
    id: string;
    revision: number;
    title: string;
    nextStep: string;
    updatedAt: string | null;
    fromCurrentConversation: boolean;
    meaning: string;
  }[];
  providedSourceIds: string[];
  providedObjectVersions: { id: string; revision: number; kind: 'work' }[];
  coverage: {
    scope: 'none' | 'current_conversation' | 'permitted_workspace';
    bounded: true;
    moreMayExist: boolean;
    meaning: string;
  };
}

const PREPARED = ['prepared', 'question_ready', 'notification_queued'];
const PAGE_SIZE = 24;
const MAX_PAGES = 4;
const INDEX_LIMIT = 3;

function inConversation(record: WorkRecord, sessionId: string) {
  return record.data.sessionId === sessionId ||
    Array.isArray(record.data.sessionIds) && record.data.sessionIds.includes(sessionId);
}

/** Additional source bindings on generic collaboration frames are not covered
 * by the repository's prepared-material filter. Check before returning even a
 * title. Evidence/subject/world/privacy checks remain owned by the repository. */
function bindingsAllowed(repo: KernelRepository, contract: ContextContract, record: WorkRecord) {
  const scope = repo.scope(contract.scope);
  for (const [key, allowed] of [['sourceIds', scope.sources], ['requiredGrants', scope.grants]] as const) {
    const values = record.data[key];
    if (values !== undefined && (!Array.isArray(values) ||
      values.some(value => typeof value !== 'string' || !allowed.includes(value)))) return false;
  }
  return true;
}

/** Ambient continuity is a small discovery index, never a second memory or
 * background agent. Semantic relevance and whether to mention it remain the
 * main model's choice. Callers must suppress it when current read-purpose has
 * not yet been established. refreshPrepared is the existing AttentionService
 * expiry/invalidations path, so its material validators remain the authority. */
export function buildContinuityIndex(
  repo: KernelRepository,
  contract: ContextContract,
  sessionId: string | undefined,
  refreshPrepared?: () => void,
): ContinuityIndex {
  const empty: ContinuityIndex = {
    preparedMaterials: [], openThreads: [], providedSourceIds: [], providedObjectVersions: [],
    coverage: { scope: 'none', bounded: true, moreMayExist: false,
      meaning: '没有读取跨轮线索；这不表示没有未完事项或准备材料。' },
  };
  const scope = repo.scope(contract.scope);
  if (!sessionId || scope.child || scope.audience !== 'self' || scope.subjectId !== scope.principalId ||
    scope.worldId !== 'real' || !scope.sources.includes('work:self') ||
    !scope.grants.includes('evidence:read') || !['relevant', 'session_only'].includes(contract.memoryMode)) return empty;

  const crossConversation = contract.memoryMode === 'relevant';
  const now = Date.parse(repo.clock.now());
  let bounded = false;
  const collect = (type: string, statuses: string[]) => {
    const result: WorkRecord[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = repo.workData(contract.scope, [type], {
        statuses, offset: page * PAGE_SIZE, limit: PAGE_SIZE, respectSourceBindings: true,
        ...(!crossConversation && type === 'help_opportunity' ? { sessionId } : {}),
      });
      for (const record of rows) {
        if ((!crossConversation && !inConversation(record, sessionId)) || !bindingsAllowed(repo, contract, record)) continue;
        result.push(record);
      }
      if (rows.length < PAGE_SIZE) return result;
    }
    bounded = true;
    return result;
  };
  const latest = (a: WorkRecord, b: WorkRecord) => Number(inConversation(b, sessionId)) - Number(inConversation(a, sessionId)) ||
    (Date.parse(String(b.data.updatedAt || b.data.recordedAt)) || 0) - (Date.parse(String(a.data.updatedAt || a.data.recordedAt)) || 0);

  // Without the runtime's real refresh hook, do not advertise material as
  // current. An unconnected ContextCompiler can still list open work.
  const prepared: ContinuityIndex['preparedMaterials'] = [];
  const preparedRecords: WorkRecord[] = [];
  if (contract.enhancements?.opportunities !== false && refreshPrepared) {
    refreshPrepared();
    for (const record of collect('help_opportunity', PREPARED).sort(latest)) {
      const artifact = record.data.artifact as { title?: unknown; body?: unknown } | null;
      const expiresAt = record.data.expiresAt;
      if (!artifact || typeof artifact.title !== 'string' || typeof artifact.body !== 'string' || !artifact.body ||
        typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now) continue;
      const bindingId = record.data.bindingId;
      const binding = typeof bindingId === 'string' ? repo.work(contract.scope, undefined, bindingId)[0] : undefined;
      if (!binding || binding.status !== 'active' || !bindingsAllowed(repo, contract, binding)) continue;
      const help = typeof record.data.helpRecordId === 'string'
        ? repo.workData(contract.scope, ['cooperation_record'], { id: record.data.helpRecordId, limit: 1, respectSourceBindings: true })[0]
        : undefined;
      const sameMaterial = help && help.data.basisFingerprint === record.data.fingerprint;
      // Submission/delivery is not evidence of reading. Only real display,
      // open or seen receipts suppress this optional, unsolicited cue.
      if (sameMaterial && (help.data.displayedAt || help.data.openedAt || help.data.seenAt)) continue;
      prepared.push({ id: record.id, revision: record.revision, title: artifact.title, expiresAt,
        fromCurrentConversation: inConversation(record, sessionId),
        delivery: sameMaterial && (help.data.submittedAt || help.data.deliveredAt) ? 'submitted_or_delivered' : 'not_observed',
        meaning: '已有实际准备。先用inspect_help按精确ID读取当前正文、依据与限制；相关时可顺势使用，无须让用户重讲或重复调查。索引不是新提醒、已接受安排或新的执行授权。',
      });
      preparedRecords.push(record);
      if (prepared.length > INDEX_LIMIT) break;
    }
  }
  const frames = contract.enhancements?.currentMatter === false ? [] : collect('collaboration_frame', ['active'])
    .filter(record => typeof record.data.nextStep === 'string' && record.data.nextStep.trim().length > 0)
    .sort(latest);
  const selectedFrames = frames.slice(0, INDEX_LIMIT);
  const selectedRecords = [...preparedRecords.slice(0, INDEX_LIMIT), ...selectedFrames];
  // Even short titles and next steps inherit their actual sources. Later
  // history projection must not treat a calendar-derived cue as work-only.
  const providedSourceIds = new Set<string>(selectedRecords.length ? ['work:self'] : []);
  for (const record of selectedRecords) {
    for (const source of Array.isArray(record.data.sourceIds) ? record.data.sourceIds : [])
      if (typeof source === 'string') providedSourceIds.add(source);
    for (const id of record.evidenceIds) {
      const evidence = repo.evidence(contract.scope, id);
      if (evidence) providedSourceIds.add(evidence.sourceId);
    }
  }
  return {
    preparedMaterials: prepared.slice(0, INDEX_LIMIT),
    openThreads: selectedFrames.map(record => ({
      id: record.id, revision: record.revision, title: record.title, nextStep: String(record.data.nextStep),
      updatedAt: typeof record.data.updatedAt === 'string' ? record.data.updatedAt : null,
      fromCurrentConversation: inConversation(record, sessionId),
      meaning: '这是仍开放事项的续接线索，不表示现在必须继续或用户接受了下一步。相关时用restore_collaboration的relatedTo读取完整决定、条件与原文；用户当前意愿优先，不把旧探索重新变成义务。',
    })),
    providedSourceIds: [...providedSourceIds],
    providedObjectVersions: [
      ...prepared.slice(0, INDEX_LIMIT).map(record => ({ id: record.id, revision: record.revision, kind: 'work' as const })),
      ...selectedFrames.map(record => ({ id: record.id, revision: record.revision, kind: 'work' as const })),
    ],
    coverage: { scope: crossConversation ? 'permitted_workspace' : 'current_conversation', bounded: true,
      moreMayExist: bounded || prepared.length > INDEX_LIMIT || frames.length > INDEX_LIMIT,
      meaning: '只给少量当前许可内的续接候选，不是全部历史或自动任务。排序仅参考当前会话与记录更新；主助手判断与本轮是否有关。需要更多材料时继续inspect_help或restore_collaboration，不把未列出当不存在。' },
  };
}
