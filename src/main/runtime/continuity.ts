import type { ContextContract, WorkRecord } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';

export interface ContinuityIndex {
  planningIntents: {
    id: string;
    revision: number;
    title: string;
    updatedAt: string | null;
    fromCurrentConversation: boolean;
    read: { tool: 'restore_collaboration'; type: 'planning_intent'; id: string };
  }[];
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
  providedEvidenceIds: string[];
  providedObjectVersions: { id: string; revision: number; kind: 'work' | 'evidence' }[];
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
    preparedMaterials: [], openThreads: [], planningIntents: [], providedSourceIds: [], providedEvidenceIds: [], providedObjectVersions: [],
    coverage: { scope: 'none', bounded: true, moreMayExist: false,
      meaning: '这次没有带回先前的线索。想找某件事，可以沿它原来的记录再看。' },
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
        meaning: '这件事已经备好了一份内容，可以从这里打开正文，看看当时用了哪些资料、还差哪些条件。若正好接得上眼前的话，就沿着已有的准备往下聊；要提醒、采用安排或实际去做，再接各自的约定。',
      });
      preparedRecords.push(record);
      if (prepared.length > INDEX_LIMIT) break;
    }
  }
  const frames = contract.enhancements?.currentMatter === false ? [] : collect('collaboration_frame', ['active'])
    .filter(record => typeof record.data.nextStep === 'string' && record.data.nextStep.trim().length > 0)
    .sort(latest);
  const selectedFrames = frames.slice(0, INDEX_LIMIT);
  const intents = contract.enhancements?.currentMatter === false ? [] : collect('planning_intent', ['active']).sort(latest);
  const selectedIntents = intents.slice(0, INDEX_LIMIT);
  const selectedRecords = [...preparedRecords.slice(0, INDEX_LIMIT), ...selectedFrames, ...selectedIntents];
  // Even short titles and next steps inherit their actual sources. Later
  // history projection must not treat a calendar-derived cue as work-only.
  const providedSourceIds = new Set<string>(selectedRecords.length ? ['work:self'] : []);
  const evidenceVersions = new Map<string, number>();
  for (const record of selectedRecords) {
    if (record.sourceBinding) {
      for (const source of record.sourceBinding.sourceIds) providedSourceIds.add(source);
      for (const ref of record.sourceBinding.refs) evidenceVersions.set(ref.eventId, ref.contentVersion);
    }
    for (const source of Array.isArray(record.data.sourceIds) ? record.data.sourceIds : [])
      if (typeof source === 'string') providedSourceIds.add(source);
    for (const id of record.evidenceIds) {
      if (record.sourceBinding) continue;
      const evidence = repo.evidence(contract.scope, id);
      // Generic cues expose only their own work metadata. Keep the legacy
      // source gate without claiming that their unexpanded originals were
      // provided; typed source-bound work separately carries exact versions.
      if (evidence) providedSourceIds.add(evidence.sourceId);
    }
  }
  return {
    planningIntents: selectedIntents.map(record => ({ id: record.id, revision: record.revision, title: record.title,
      updatedAt: typeof record.data.updatedAt === 'string' ? record.data.updatedAt : null,
      fromCurrentConversation: inConversation(record, sessionId),
      read: { tool: 'restore_collaboration', type: 'planning_intent', id: record.id },
    })),
    preparedMaterials: prepared.slice(0, INDEX_LIMIT),
    openThreads: selectedFrames.map(record => ({
      id: record.id, revision: record.revision, title: record.title, nextStep: String(record.data.nextStep),
      updatedAt: typeof record.data.updatedAt === 'string' ? record.data.updatedAt : null,
      fromCurrentConversation: inConversation(record, sessionId),
      meaning: '这件事上次停在这里，还留着可以往下聊的一步。先前只是探索的想法仍按探索来读；今天想怎样继续，接眼前这句话。需要前情时，可以沿这件事找回当时的决定、条件和原话。',
    })),
    providedSourceIds: [...providedSourceIds],
    providedEvidenceIds: [...evidenceVersions.keys()],
    providedObjectVersions: [
      ...prepared.slice(0, INDEX_LIMIT).map(record => ({ id: record.id, revision: record.revision, kind: 'work' as const })),
      ...selectedFrames.map(record => ({ id: record.id, revision: record.revision, kind: 'work' as const })),
      ...selectedIntents.map(record => ({ id: record.id, revision: record.revision, kind: 'work' as const })),
      ...[...evidenceVersions].map(([id, revision]) => ({ id, revision, kind: 'evidence' as const })),
    ],
    coverage: { scope: crossConversation ? 'permitted_workspace' : 'current_conversation', bounded: true,
      moreMayExist: bounded || prepared.length > INDEX_LIMIT || frames.length > INDEX_LIMIT || intents.length > INDEX_LIMIT,
      meaning: '这里先带回几处现在还能打开的线索，眼前这段对话和最近更新的记录排在前面。哪一处接得上这次的话，由你自己判断；想再看更多，可以沿原来的准备或事项继续找。找回前情以后，仍听今天想怎样过。' },
  };
}
