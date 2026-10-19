import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Assertion,
  AssertionCitation,
  ClockPort,
  ContextReceipt,
  Dependency,
  EvidenceEvent,
  HostIdentity,
  ProcessingSpan,
  ProcessingStatus,
  PlanningMaterialProvenance,
  ScopeData,
  ScopeHandle,
  Watermarks,
  WorkRecord,
  WorkSourceBinding,
  WorkSourceRef,
} from '../../shared/harness';
import { HarnessError, assertionSchema, evidenceSchema, workSchema, workSourceBindingSchema, workSourceRefSchema } from '../../shared/harness';
import { canonical, codePointSlice, systemClock } from '../runtime/semantics';
import { sameSourceOrigins, sourceOriginSpans, type LineageSource, type OriginSpan } from './source-lineage';
import { planningMaterialProvenanceSchema, type PlanningAttemptBasis } from '../actions/planning-intent-contract';

type Row = Record<string, unknown>;
export interface PrivacyFence {
  id: string;
  epoch: number;
  objectIds: string[];
  sourceIds: string[];
  createdAt: string;
  kind: 'delete' | 'revoke';
  scope?: string;
  spans?: { eventId: string; contentVersion: number; start: number; end: number }[];
  /** Host-only conversation deletion exception; no source text is retained. */
  preservedLocalAgenda?: { agendaId: string; agendaRevision: number; agendaSha256: string; actionId: string; actionRevision: number; actionDigest: string }[];
  deletedConversationIds?: string[];
}
export type FaultInjector = (point: string) => void;
export type SourceRestrictionSnapshot = ReadonlyMap<string, { metadata: string; wholeSource: boolean }>;
export interface ReviewedSourceRestriction {
  eventId: string; predicate: string; operation: string; replacementEventId: string | null;
  ranges: { contentVersion: number; start: number; end: number }[];
}
export type MemoryContextScope = Pick<ScopeData, 'principalId' | 'workspaceId' | 'subjectId' | 'worldId' | 'audience' | 'retention' | 'infer'
  | 'sources' | 'currentEventIds' | 'purposes' | 'grants'>;
const parse = <T>(row: Row | undefined): T | undefined => (row ? JSON.parse(String(row.payload)) : undefined);
const placeholders = (values: readonly unknown[]) => values.map(() => '?').join(',') || 'NULL';
const queryGrams = (query: string) => {
  const points = Array.from(query.normalize('NFKC').toLowerCase());
  return [...new Set(points.slice(0, -1).map((point, index) => point + points[index + 1])
    .filter(gram => !/[\s，。？！、；：]/.test(gram)))];
};
const columns = `owner TEXT NOT NULL, workspace TEXT NOT NULL, subject TEXT NOT NULL, world TEXT NOT NULL,
 source TEXT NOT NULL, purpose TEXT NOT NULL, audience TEXT NOT NULL, sensitivity TEXT NOT NULL,
 retain TEXT NOT NULL, infer INTEGER NOT NULL, expires_at TEXT`;

/** Owns short synchronous SQLite transactions. No provider/model work is permitted inside write(). */
export class KernelRepository {
  readonly identity: HostIdentity;
  readonly clock: ClockPort;
  readonly databasePath: string;
  private validateScope?: (scope: ScopeHandle) => ScopeData;
  private verifyPlanningAttemptBasis?: (handle: ScopeHandle, intentId: string, basis: PlanningAttemptBasis[]) => void;
  private transactionDepth = 0;
  private afterCommitCallbacks: (() => void)[] = [];
  private privacyCleanupListeners = new Set<() => void>();
  fault?: FaultInjector;
  readonly transitions: { at: string; objectId: string; from?: string; to: string; revision?: number }[] = [];
  readonly access: { principalId: string; scopeId: string; purposes: readonly string[]; source: string; objectId: string; kind: string }[] = [];
  readonly conflicts: { objectId: string; expected: number; actual: number }[] = [];
  constructor(
    readonly db: DatabaseSync,
    file: string,
    clock: ClockPort = systemClock,
    identity?: HostIdentity,
  ) {
    this.databasePath = file;
    this.clock = clock;
    this.migrate();
    this.migrateCalendarVersions();
    this.migrateSourceRestrictionSpans();
    this.migrateAssertionCitations();
    this.migrateMemoryContextProgress();
    this.migrateCitationRestrictionReceipts();
    this.migratePlanningIntentRelations();
    this.migratePlanningIntentSources();
    this.db.exec(
      "INSERT INTO h_evidence_fts(h_evidence_fts,rank) VALUES('secure-delete',1); INSERT INTO h_assertion_fts(h_assertion_fts,rank) VALUES('secure-delete',1);",
    );
    this.identity = this.getMeta<HostIdentity>('identity') ||
      identity || { principalId: randomUUID(), workspaceId: randomUUID(), deviceId: randomUUID() };
    if (!this.getMeta('identity')) this.write(() => this.setMeta('identity', this.identity));
    this.applyRestorationFences();
    this.removeDeletedSourceReplays();
    this.onPrivacyCleanup(() => this.cleanupMemoryContextRequests());
    this.cleanupMemoryContextRequests();
  }
  bindPolicy(validate: (scope: ScopeHandle) => ScopeData) {
    this.validateScope = validate;
  }
  bindPlanningAttemptVerifier(verify: (handle: ScopeHandle, intentId: string, basis: PlanningAttemptBasis[]) => void) {
    this.verifyPlanningAttemptBasis = verify;
  }
  scope(scope: ScopeHandle): ScopeData {
    if (!this.validateScope) throw new HarnessError('policy_unavailable', '策略尚未初始化。');
    return this.validateScope(scope);
  }
  private migrate() {
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;');
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version || 0);
    if (version > 11) throw new HarnessError('newer_schema', '资料来自更新版本，请使用相应版本打开。');
    if (version >= 4) return;
    if (version === 3) {
      this.migrateRoots();
      return;
    }
    if (version === 2) {
      this.migrateDomainVersions();
      return;
    }
    if (version === 1) {
      this.migratePorts();
      return;
    }
    // Backup is local, never exported. Fresh/empty test stores need no redundant backup.
    const count = Number(
      this.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='messages'").get()
        ?.n || 0,
    );
    if (
      this.databasePath !== ':memory:' &&
      count &&
      Number(this.db.prepare('SELECT count(*) AS n FROM messages').get()?.n || 0)
    ) {
      const backup = this.databasePath + '.pre-harness-v1.sqlite';
      if (!fs.existsSync(backup)) this.db.prepare('VACUUM INTO ?').run(backup);
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`
        CREATE TABLE h_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE h_migrations(id TEXT PRIMARY KEY,version INTEGER NOT NULL,applied_at TEXT NOT NULL,details TEXT NOT NULL);
        CREATE TABLE h_fences(id TEXT PRIMARY KEY,epoch INTEGER NOT NULL,payload TEXT NOT NULL);
        CREATE TABLE h_evidence(id TEXT PRIMARY KEY,${columns},version INTEGER NOT NULL,seq INTEGER UNIQUE NOT NULL,
          received_at TEXT NOT NULL,status TEXT NOT NULL,content TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE INDEX h_evidence_scope ON h_evidence(owner,workspace,subject,world,source,status,seq);
        CREATE INDEX h_evidence_time ON h_evidence(owner,workspace,received_at);
        CREATE TABLE h_spans(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES h_evidence(id) ON DELETE CASCADE,
          content_version INTEGER NOT NULL,start_cp INTEGER NOT NULL,end_cp INTEGER NOT NULL,status TEXT NOT NULL,indexed INTEGER NOT NULL DEFAULT 0,
          UNIQUE(event_id,content_version,start_cp,end_cp));
        CREATE TABLE h_assertions(id TEXT PRIMARY KEY,${columns},revision INTEGER NOT NULL,predicate TEXT NOT NULL,
          kind TEXT NOT NULL,status TEXT NOT NULL,strength TEXT NOT NULL,valid_from TEXT,valid_to TEXT,text TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE INDEX h_assertions_scope ON h_assertions(owner,workspace,subject,world,source,status,predicate);
        CREATE INDEX h_assertions_time ON h_assertions(owner,workspace,valid_from,valid_to,status);
        CREATE TABLE h_assertion_versions(id TEXT NOT NULL REFERENCES h_assertions(id) ON DELETE CASCADE,revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(id,revision));
        CREATE TABLE h_assertion_evidence(assertion_id TEXT NOT NULL REFERENCES h_assertions(id) ON DELETE CASCADE,event_id TEXT NOT NULL REFERENCES h_evidence(id) ON DELETE CASCADE,
          start_cp INTEGER,end_cp INTEGER,PRIMARY KEY(assertion_id,event_id));
        CREATE INDEX h_evidence_assertion_reverse ON h_assertion_evidence(event_id,assertion_id);
        CREATE TABLE h_proposals(id TEXT PRIMARY KEY,event_id TEXT,epoch INTEGER NOT NULL,status TEXT NOT NULL,reason TEXT,payload TEXT NOT NULL);
        CREATE TABLE h_operations(id TEXT PRIMARY KEY,kind TEXT NOT NULL,result TEXT NOT NULL);
        CREATE TABLE h_outbox(id TEXT PRIMARY KEY,kind TEXT NOT NULL,object_id TEXT NOT NULL,epoch INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL);
        CREATE INDEX h_outbox_pending ON h_outbox(status,created_at);
        CREATE TABLE h_dependencies(consumer_id TEXT NOT NULL,producer_id TEXT NOT NULL,producer_revision INTEGER NOT NULL,sensitivity TEXT NOT NULL,invalidation TEXT NOT NULL,
          PRIMARY KEY(consumer_id,producer_id));
        CREATE INDEX h_dependencies_reverse ON h_dependencies(producer_id,consumer_id);
        CREATE TABLE h_work(id TEXT PRIMARY KEY,${columns},kind TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,title TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE INDEX h_work_scope ON h_work(owner,workspace,subject,world,kind,status);
        CREATE TABLE h_worlds(id TEXT PRIMARY KEY,owner TEXT NOT NULL,workspace TEXT NOT NULL,subject TEXT NOT NULL,base_revision INTEGER NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE TABLE h_domain(id TEXT NOT NULL,source TEXT NOT NULL,domain TEXT NOT NULL,institution TEXT NOT NULL,term TEXT NOT NULL,${columns.replace('source TEXT NOT NULL,', '')},
          revision INTEGER NOT NULL,status TEXT NOT NULL,evidence_id TEXT NOT NULL REFERENCES h_evidence(id),fetched_at TEXT NOT NULL,payload TEXT NOT NULL,
          PRIMARY KEY(id,source,domain,institution,term));
        CREATE INDEX h_domain_scope ON h_domain(owner,workspace,subject,world,domain,institution,term,status);
        CREATE TABLE h_sync(source TEXT NOT NULL,domain TEXT NOT NULL,institution TEXT NOT NULL,term TEXT NOT NULL,scope_key TEXT NOT NULL,status TEXT NOT NULL,cursor TEXT,payload TEXT NOT NULL,
          PRIMARY KEY(source,domain,institution,term,scope_key));
        CREATE TABLE h_actions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,workspace TEXT NOT NULL,subject TEXT NOT NULL,world TEXT NOT NULL,
          revision INTEGER NOT NULL,status TEXT NOT NULL,goal_id TEXT,source TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE INDEX h_actions_scope ON h_actions(owner,workspace,subject,world,status);
        CREATE TABLE h_approvals(id TEXT PRIMARY KEY,action_id TEXT NOT NULL REFERENCES h_actions(id) ON DELETE CASCADE,payload TEXT NOT NULL);
        CREATE TABLE h_attempts(id TEXT PRIMARY KEY,action_id TEXT NOT NULL REFERENCES h_actions(id) ON DELETE CASCADE,idempotency_key TEXT NOT NULL,status TEXT NOT NULL,epoch INTEGER NOT NULL,payload TEXT NOT NULL);
        CREATE INDEX h_attempts_action ON h_attempts(action_id,status);
        CREATE TABLE h_receipts(id TEXT PRIMARY KEY,action_id TEXT NOT NULL REFERENCES h_actions(id) ON DELETE CASCADE,attempt_id TEXT NOT NULL REFERENCES h_attempts(id),payload TEXT NOT NULL);
        CREATE TABLE h_jobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,object_id TEXT NOT NULL,goal_id TEXT,source TEXT NOT NULL,
          epoch INTEGER NOT NULL,due_at TEXT NOT NULL,status TEXT NOT NULL,lease_until TEXT,fence INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,
          dedup_key TEXT UNIQUE NOT NULL,payload TEXT NOT NULL);
        CREATE INDEX h_jobs_due ON h_jobs(status,due_at,lease_until);
        CREATE TABLE h_deliveries(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES h_jobs(id) ON DELETE CASCADE,status TEXT NOT NULL,dedup_key TEXT UNIQUE NOT NULL,payload TEXT NOT NULL);
        CREATE TABLE h_runs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,workspace TEXT NOT NULL,epoch INTEGER NOT NULL,payload TEXT NOT NULL);
        CREATE TABLE h_aliases(entity_id TEXT NOT NULL,alias TEXT NOT NULL,owner TEXT NOT NULL,workspace TEXT NOT NULL,institution TEXT NOT NULL,role TEXT NOT NULL,source TEXT NOT NULL,
          PRIMARY KEY(entity_id,alias,institution));
        CREATE INDEX h_alias_lookup ON h_aliases(owner,workspace,institution,alias);
        CREATE VIRTUAL TABLE h_evidence_fts USING fts5(id UNINDEXED,text,tokenize='trigram');
        CREATE VIRTUAL TABLE h_assertion_fts USING fts5(id UNINDEXED,text,tokenize='trigram');
        CREATE TABLE h_grams(kind TEXT NOT NULL,object_id TEXT NOT NULL,gram TEXT NOT NULL,PRIMARY KEY(kind,object_id,gram));
        CREATE INDEX h_grams_lookup ON h_grams(kind,gram,object_id);
        INSERT INTO h_meta VALUES('privacy_epoch','1'),('policy_revision','1'),('received_seq','0'),('sequence_base','0'),('domain_revision','0');
        PRAGMA user_version=1;
      `);
      this.db
        .prepare('INSERT INTO h_migrations VALUES(?,?,?,?)')
        .run(
          'harness-foundation-v1',
          1,
          this.clock.now(),
          JSON.stringify({ legacyPreserved: true, privacyBarrierRequiredForRollback: true }),
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.migratePorts();
  }
  private migratePorts() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`
        CREATE TABLE h_observations(id TEXT PRIMARY KEY,${columns},kind TEXT NOT NULL,version INTEGER NOT NULL,status TEXT NOT NULL,evidence_id TEXT NOT NULL REFERENCES h_evidence(id),payload TEXT NOT NULL);
        CREATE INDEX h_observations_scope ON h_observations(owner,workspace,subject,world,kind,status,source);
        CREATE TABLE h_observation_versions(id TEXT NOT NULL REFERENCES h_observations(id) ON DELETE CASCADE,version INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(id,version));
        CREATE TABLE h_sync_operations(device_id TEXT NOT NULL,operation_id TEXT NOT NULL,object_id TEXT NOT NULL,base_revision INTEGER NOT NULL,epoch INTEGER NOT NULL,status TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(device_id,operation_id));
        CREATE TABLE h_watches(id TEXT PRIMARY KEY,owner TEXT NOT NULL,workspace TEXT NOT NULL,goal_id TEXT NOT NULL,status TEXT NOT NULL,epoch INTEGER NOT NULL,novelty_key TEXT,payload TEXT NOT NULL);
        CREATE INDEX h_watches_goal ON h_watches(goal_id,status);
        CREATE TABLE h_source_restrictions(event_id TEXT NOT NULL,predicate TEXT NOT NULL,operation TEXT NOT NULL,replacement_event_id TEXT,PRIMARY KEY(event_id,predicate));
        PRAGMA user_version=2;
      `);
      this.db.prepare('INSERT INTO h_migrations VALUES(?,?,?,?)').run(
        'extension-ports-v2',
        2,
        this.clock.now(),
        JSON.stringify({
          observations: 'versioned',
          sync: 'proposals_only',
          sourceRestrictions: 'no_plaintext',
        }),
      );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.migrateDomainVersions();
  }
  private migrateDomainVersions() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .exec(`CREATE TABLE h_domain_versions(id TEXT NOT NULL,source TEXT NOT NULL,domain TEXT NOT NULL,institution TEXT NOT NULL,term TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(id,source,domain,institution,term,revision));
        INSERT INTO h_domain_versions SELECT id,source,domain,institution,term,revision,payload FROM h_domain;
        PRAGMA user_version=3;`);
      this.db
        .prepare('INSERT INTO h_migrations VALUES(?,?,?,?)')
        .run(
          'domain-versions-v3',
          3,
          this.clock.now(),
          JSON.stringify({ purpose: 'immutable bound scenario baselines' }),
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.migrateRoots();
  }
  private migrateRoots() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .exec(`CREATE TABLE h_evidence_roots(event_id TEXT NOT NULL REFERENCES h_evidence(id) ON DELETE CASCADE,root_id TEXT NOT NULL,PRIMARY KEY(event_id,root_id));
        CREATE INDEX h_evidence_root_reverse ON h_evidence_roots(root_id,event_id);
        INSERT INTO h_evidence_roots SELECT e.id,root.value FROM h_evidence e,json_each(e.payload,'$.roots') root;
        PRAGMA user_version=4;`);
      this.db
        .prepare('INSERT INTO h_migrations VALUES(?,?,?,?)')
        .run(
          'provenance-roots-v4',
          4,
          this.clock.now(),
          JSON.stringify({ purpose: 'reverse source-root deletion and derivation traversal' }),
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private migrateCalendarVersions() {
    if (Number(this.db.prepare('PRAGMA user_version').get()?.user_version) >= 5) return;
    if (this.databasePath !== ':memory:' && Number(this.db.prepare('SELECT count(*) AS n FROM messages').get()?.n || 0)) {
      const backup = this.databasePath + '.pre-harness-v5.sqlite';
      if (!fs.existsSync(backup)) this.db.prepare('VACUUM INTO ?').run(backup);
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('CREATE TABLE h_calendar_versions(id TEXT PRIMARY KEY,agenda_id TEXT NOT NULL,revision INTEGER NOT NULL,UNIQUE(agenda_id,revision)); PRAGMA user_version=5;');
      this.db.prepare('INSERT INTO h_migrations VALUES(?,?,?,?)').run('calendar-provenance-v5', 5, this.clock.now(), JSON.stringify({ purpose: 'versioned local calendar provenance and safe compensation', rollback: 'pre-harness-v5 backup plus latest privacy fences' }));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private migrateSourceRestrictionSpans() {
    if (Number(this.db.prepare('PRAGMA user_version').get()?.user_version) >= 6) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Locators contain no copied source text. Keep the existing four-column
      // restriction table compatible with source revocation and sync writers.
      this.db.exec(`CREATE TABLE h_source_restriction_spans(
        event_id TEXT NOT NULL,predicate TEXT NOT NULL,content_version INTEGER NOT NULL,
        start_cp INTEGER NOT NULL,end_cp INTEGER NOT NULL,effective_from TEXT,
        PRIMARY KEY(event_id,predicate,content_version,start_cp,end_cp),
        FOREIGN KEY(event_id,predicate) REFERENCES h_source_restrictions(event_id,predicate) ON DELETE CASCADE);
        CREATE TABLE h_memory_recovery(event_id TEXT PRIMARY KEY REFERENCES h_evidence(id) ON DELETE CASCADE,
          last_attempt_at TEXT NOT NULL,due_at TEXT NOT NULL,transient_failures INTEGER NOT NULL,outcome TEXT NOT NULL);
        PRAGMA user_version=6;`);
      this.db.prepare('INSERT INTO h_migrations VALUES(?,?,?,?)').run('source-restriction-spans-v6', 6, this.clock.now(), JSON.stringify({ purpose: 'preserve exact corrected source ranges without suppressing independent facts', legacy: 'unknown ranges remain explicit' }));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private migrateAssertionCitations() {
    if (Number(this.db.prepare('PRAGMA user_version').get()?.user_version) >= 7) return;
    this.write(() => {
      this.db.exec(`CREATE TABLE h_assertion_citations(
        citation_key TEXT PRIMARY KEY,assertion_id TEXT NOT NULL,assertion_revision INTEGER NOT NULL,
        event_id TEXT NOT NULL REFERENCES h_evidence(id) ON DELETE CASCADE,content_version INTEGER,
        start_cp INTEGER,end_cp INTEGER,role TEXT NOT NULL,
        FOREIGN KEY(assertion_id,assertion_revision) REFERENCES h_assertion_versions(id,revision) ON DELETE CASCADE);
        CREATE INDEX h_citation_source ON h_assertion_citations(event_id,assertion_id,assertion_revision);
        CREATE INDEX h_citation_version ON h_assertion_citations(assertion_id,assertion_revision);`);
      for (const row of this.db.prepare('SELECT v.id,v.revision,v.payload,a.revision AS current_revision FROM h_assertion_versions v JOIN h_assertions a ON a.id=v.id').all()) {
        const value = JSON.parse(String(row.payload)) as Assertion;
        for (const [index, eventId] of value.evidenceIds.entries()) {
          const event = this.db.prepare('SELECT version FROM h_evidence WHERE id=?').get(eventId);
          if (!event) continue;
          const locator = row.revision === row.current_revision
            ? this.db.prepare('SELECT start_cp,end_cp FROM h_assertion_evidence WHERE assertion_id=? AND event_id=?').get(value.id, eventId) : undefined;
          this.storeCitation(value.id, Number(row.revision), { eventId, role: index ? 'support' : 'primary',
            ...(locator?.start_cp !== null && locator?.start_cp !== undefined && locator.end_cp !== null
              ? { contentVersion: Number(event.version), start: Number(locator.start_cp), end: Number(locator.end_cp) } : {}) });
        }
      }
      this.db.exec('PRAGMA user_version=7;');
      this.db.prepare('INSERT INTO h_migrations VALUES(?,?,?,?)').run('assertion-citations-v7', 7, this.clock.now(), JSON.stringify({ purpose: 'versioned exact multi-source support without copied text', legacyHistoricalRanges: 'unknown' }));
    });
  }
  private migrateMemoryContextProgress() {
    if (Number(this.db.prepare('PRAGMA user_version').get()?.user_version) >= 8) {
      // The in-flight v8 unit may have been opened before scope binding landed.
      if (!(this.db.prepare('PRAGMA table_info(h_memory_context)').all() as { name: string }[]).some(column => column.name === 'scope_binding'))
        this.db.exec("ALTER TABLE h_memory_context ADD COLUMN scope_binding TEXT NOT NULL DEFAULT '{}'");
      return;
    }
    this.write(() => {
      this.db.exec(`CREATE TABLE h_memory_context(
        span_id TEXT PRIMARY KEY REFERENCES h_spans(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL REFERENCES h_evidence(id) ON DELETE CASCADE,
        source_version INTEGER NOT NULL,method_version TEXT NOT NULL,
        attempt_signature TEXT NOT NULL,source_signature TEXT NOT NULL,context_watermark INTEGER NOT NULL,
        request_signature TEXT NOT NULL,requests TEXT NOT NULL,request_results TEXT NOT NULL,updated_at TEXT NOT NULL,
        scope_binding TEXT NOT NULL);
        CREATE INDEX h_memory_context_event ON h_memory_context(event_id);
        PRAGMA user_version=8;`);
      this.db.prepare('INSERT INTO h_migrations VALUES(?,?,?,?)').run('memory-context-progress-v8', 8, this.clock.now(),
        JSON.stringify({ purpose: 'bounded versioned context addresses and one attempt per legal context generation', copiedSourceText: false }));
    });
  }
  private migrateCitationRestrictionReceipts() {
    if (Number(this.db.prepare('PRAGMA user_version').get()?.user_version) >= 9) return;
    this.write(() => {
      this.db.exec(`CREATE TABLE h_citation_restriction_receipts(
        citation_key TEXT PRIMARY KEY REFERENCES h_assertion_citations(citation_key) ON DELETE CASCADE,
        restriction_snapshot TEXT NOT NULL);
        PRAGMA user_version=9;`);
      this.db.prepare('INSERT INTO h_migrations VALUES(?,?,?,?)').run('citation-restriction-receipts-v9', 9, this.clock.now(),
        JSON.stringify({ purpose: 'reviewed source use bound to an exact assertion revision and citation', legacyReceipts: 'not_backfilled' }));
    });
  }
  private migratePlanningIntentRelations() {
    if (Number(this.db.prepare('PRAGMA user_version').get()?.user_version) >= 10) return;
    this.write(() => {
      this.db.exec(`CREATE TABLE h_planning_intent_attempts(
        plan_id TEXT PRIMARY KEY,intent_id TEXT NOT NULL REFERENCES h_work(id) ON DELETE CASCADE,
        spec_digest TEXT NOT NULL,manifest TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE INDEX h_planning_intent_owner ON h_planning_intent_attempts(intent_id);
        CREATE TABLE h_planning_intent_action_links(
          plan_id TEXT NOT NULL REFERENCES h_planning_intent_attempts(plan_id) ON DELETE CASCADE,
          block_id TEXT NOT NULL,action_id TEXT NOT NULL,action_revision INTEGER NOT NULL,action_digest TEXT NOT NULL,
          PRIMARY KEY(plan_id,block_id,action_id,action_revision));
        CREATE INDEX h_planning_intent_action ON h_planning_intent_action_links(action_id);
        PRAGMA user_version=10;`);
      this.db.prepare('INSERT INTO h_migrations VALUES(?,?,?,?)').run('planning-intent-relations-v10', 10, this.clock.now(),
        JSON.stringify({ owner: 'h_work', manifest: 'host_only_nonexecuting', successAuthority: 'existing_action_receipts', legacyBackfill: false }));
    });
  }
  private migratePlanningIntentSources() {
    if (Number(this.db.prepare('PRAGMA user_version').get()?.user_version) >= 11) return;
    this.write(() => {
      // A current parent cannot attest to the sources of an older attempt.
      // Keep its opaque existence so recovery cannot interpret it as unwritten.
      this.db.exec(`ALTER TABLE h_planning_intent_attempts ADD COLUMN source_binding TEXT;
        ALTER TABLE h_planning_intent_attempts ADD COLUMN redacted INTEGER NOT NULL DEFAULT 0;
        UPDATE h_planning_intent_attempts SET manifest='{}',redacted=1;
        PRAGMA user_version=11;`);
      this.db.prepare('INSERT INTO h_migrations VALUES(?,?,?,?)').run('planning-intent-sources-v11', 11, this.clock.now(),
        JSON.stringify({ ownAttemptSources: true, legacySources: 'not_backfilled', unavailableAttempts: 'opaque_unknown' }));
    });
  }
  private citationKey(id: string, revision: number, citation: AssertionCitation) {
    return JSON.stringify([id, revision, citation.eventId, citation.contentVersion ?? null, citation.start ?? null, citation.end ?? null, citation.role]);
  }
  private storeCitation(id: string, revision: number, citation: AssertionCitation) {
    this.db.prepare('INSERT OR IGNORE INTO h_assertion_citations VALUES(?,?,?,?,?,?,?,?)').run(
      this.citationKey(id, revision, citation),
      id, revision, citation.eventId, citation.contentVersion ?? null, citation.start ?? null, citation.end ?? null, citation.role);
  }
  assertionCitations(handle: ScopeHandle, id: string, revision?: number): AssertionCitation[] {
    const assertion = this.assertion(handle, id);
    if (!assertion) return [];
    if (revision !== undefined && revision !== assertion.revision && !this.assertionVersion(handle, id, revision)) return [];
    return this.citationRows(id, revision ?? assertion.revision);
  }
  private citationSourceReadable(handle: ScopeHandle, citation: AssertionCitation, strict = false) {
    const event = this.evidence(handle, citation.eventId);
    if (!event || (citation.contentVersion !== undefined && citation.contentVersion !== event.contentVersion)) return false;
    const known = citation.start !== undefined && citation.end !== undefined && citation.contentVersion !== undefined;
    if (strict && !known) return false;
    if (known && (!Number.isSafeInteger(citation.start) || !Number.isSafeInteger(citation.end)
      || citation.start! < 0 || citation.end! <= citation.start! || citation.end! > Array.from(event.text).length)) return false;
    if (this.fences().some(fence => fence.kind === 'delete' && (fence.objectIds.includes(event.id)
      || fence.sourceIds.includes(event.id) || fence.sourceIds.includes(event.sourceId) || fence.spans?.some(span => span.eventId === event.id
        && (!known || span.contentVersion !== citation.contentVersion || span.start < citation.end! && span.end > citation.start!))))) return false;
    return !this.blockedDeletedLineage(event, known ? { start: citation.start!, end: citation.end! } : undefined, false);
  }
  private sourceSpanRestrictions(origin: OriginSpan) {
    const known = origin.start !== undefined && origin.end !== undefined && origin.contentVersion !== undefined;
    return this.db.prepare(`SELECT x.event_id AS eventId,x.predicate,x.operation,x.replacement_event_id,
      s.content_version,s.start_cp,s.end_cp,s.effective_from FROM h_source_restrictions x
      LEFT JOIN h_source_restriction_spans s ON s.event_id=x.event_id AND s.predicate=x.predicate
      WHERE x.event_id=? AND (
      x.predicate='*' OR NOT EXISTS(SELECT 1 FROM h_source_restriction_spans s WHERE s.event_id=x.event_id AND s.predicate=x.predicate)
      OR (s.effective_from IS NULL OR julianday(s.effective_from) IS NULL OR julianday(s.effective_from)<=julianday(?))
        AND (?=0 OR s.content_version!=? OR s.start_cp<? AND s.end_cp>?))
      ORDER BY x.predicate,x.operation,x.replacement_event_id,s.content_version,s.start_cp,s.end_cp,s.effective_from`)
      .all(origin.eventId, this.clock.now(), Number(known), origin.contentVersion ?? 0, origin.end ?? 0, origin.start ?? 0);
  }
  private citationRestrictionState(citation: AssertionCitation) {
    const event = parse<EvidenceEvent>(this.db.prepare('SELECT payload FROM h_evidence WHERE id=?').get(citation.eventId));
    const known = citation.start !== undefined && citation.end !== undefined && citation.contentVersion !== undefined;
    const origins = event ? this.sourceOrigins(event, known ? { start: citation.start!, end: citation.end! } : undefined).spans : [citation];
    const unique = new Map<string, Row>();
    let canReview = known && citation.role !== 'authorization';
    for (const origin of origins) {
      const rows = this.sourceSpanRestrictions(origin);
      if (rows.length) canReview &&= origin.start !== undefined && origin.end !== undefined && rows.every(row => row.predicate !== '*'
        && row.content_version === origin.contentVersion && row.start_cp !== null && row.end_cp !== null);
      for (const row of rows) unique.set(JSON.stringify(row), row);
    }
    const rows = [...unique.values()].sort((a, b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0);
    return { rows, entries: rows.map(row => JSON.stringify(row)), snapshot: JSON.stringify(rows), canReview };
  }
  private citationRestrictionsAllow(citation: AssertionCitation) {
    const state = this.citationRestrictionState(citation);
    if (!state.rows.length) return true;
    if (!state.canReview || !citation.restrictionReceipt) return false;
    if (citation.restrictionReceipt === state.snapshot) return true;
    try {
      const saved: unknown = JSON.parse(citation.restrictionReceipt);
      if (!Array.isArray(saved) || saved.length !== state.rows.length || saved.some(row => !row || typeof row !== 'object' || Array.isArray(row))) return false;
      const keys = new Set(state.rows.map(row => canonical(row)));
      // Earlier development receipts covered direct sources only. Bind those
      // rows to this citation's actual event; they cannot acknowledge a root.
      const previous = saved.map(row => canonical({ ...row, eventId: row.eventId ?? citation.eventId }));
      return new Set(previous).size === keys.size && previous.every(key => keys.has(key));
    } catch { return false; }
  }
  /** Only host-loaded current-target citations can carry a stored review receipt. */
  citationReadable(handle: ScopeHandle, citation: AssertionCitation, strict = false) {
    return this.citationSourceReadable(handle, citation, strict) && this.citationRestrictionsAllow(citation);
  }
  private citationAddress(citation: AssertionCitation) {
    return JSON.stringify([citation.eventId, citation.contentVersion ?? null, citation.start ?? null, citation.end ?? null]);
  }
  citationReviewBaseline(handle: ScopeHandle, citations: AssertionCitation[]) {
    const baseline = new Map<string, string[]>();
    for (const citation of citations) {
      if (!this.citationSourceReadable(handle, citation)) throw new HarnessError('source_suppressed', '原支持来源已不可用。');
      baseline.set(this.citationAddress(citation), this.citationRestrictionState(citation).entries);
    }
    return baseline;
  }
  /** Finish a semantic commit, never an ordinary save/rebuild/status change.
   * Existing restrictions must match its pre-write baseline; only the exact
   * restrictions installed by this same commit may be newly acknowledged. */
  recordReviewedCitationUse(handle: ScopeHandle, revisions: { id: string; revision: number }[],
    baseline: Map<string, string[]>, installed: ReviewedSourceRestriction[]) {
    if (!this.transactionDepth) throw new HarnessError('citation_review_transaction', '来源复核回执须与理解在同一事务保存。');
    const scope = this.scope(handle);
    if (!scope.infer || !scope.grants.includes('memory:write')) throw new HarnessError('inference_forbidden', '当前范围不能提交理解复核。');
    for (const ref of revisions) {
      const row = this.db.prepare('SELECT revision FROM h_assertions WHERE id=? AND owner=? AND workspace=? AND subject=? AND world=?')
        .get(ref.id, scope.principalId, scope.workspaceId, scope.subjectId, scope.worldId);
      if (!row || Number(row.revision) !== ref.revision) throw new HarnessError('revision_conflict', '理解版本已变化，没有签发来源回执。');
      for (const citation of this.citationRows(ref.id, ref.revision)) {
        if (!this.citationSourceReadable(handle, citation)) throw new HarnessError('source_suppressed', '支持来源已删除或改变。');
        const state = this.citationRestrictionState(citation);
        if (!state.rows.length) continue;
        const previous = baseline.get(this.citationAddress(citation)) || [];
        const newlyReviewed = state.rows.every((restriction, index) => previous.includes(state.entries[index]) || installed.some(change =>
          change.eventId === restriction.eventId && change.predicate === restriction.predicate && change.operation === restriction.operation
          && change.replacementEventId === restriction.replacement_event_id && (change.ranges.some(range => range.contentVersion === restriction.content_version
            && range.start === restriction.start_cp && range.end === restriction.end_cp)
            || previous.some(entry => {
              const prior = JSON.parse(entry) as Row;
              return ['eventId', 'predicate', 'content_version', 'start_cp', 'end_cp', 'effective_from'].every(key => prior[key] === restriction[key]);
            }))));
        if (!state.canReview || !newlyReviewed) throw new HarnessError('source_restrictions_changed', '复核期间支持片段的限制发生变化，未采用旧结果。');
        this.db.prepare('INSERT OR REPLACE INTO h_citation_restriction_receipts VALUES(?,?)')
          .run(this.citationKey(ref.id, ref.revision, citation), state.snapshot);
      }
    }
    this.refreshCitationRestrictions();
  }
  private citationRows(id: string, revision: number): AssertionCitation[] {
    return this.db.prepare(`SELECT c.event_id,c.content_version,c.start_cp,c.end_cp,c.role,p.restriction_snapshot
      FROM h_assertion_citations c LEFT JOIN h_citation_restriction_receipts p ON p.citation_key=c.citation_key
      WHERE c.assertion_id=? AND c.assertion_revision=? ORDER BY c.event_id,c.start_cp,c.end_cp,c.role`).all(id, revision)
      .map(row => ({ eventId: String(row.event_id), role: row.role as AssertionCitation['role'],
        ...(row.restriction_snapshot !== null ? { restrictionReceipt: String(row.restriction_snapshot) } : {}),
        ...(row.content_version !== null ? { contentVersion: Number(row.content_version) } : {}),
        ...(row.start_cp !== null && row.end_cp !== null ? { start: Number(row.start_cp), end: Number(row.end_cp) } : {}) }));
  }
  /** Historical text is admitted only under that version's actual source set. */
  assertionVersion(handle: ScopeHandle, id: string, revision: number): Assertion | undefined {
    if (!this.assertion(handle, id)) return undefined;
    const row = this.db.prepare('SELECT payload FROM h_assertion_versions WHERE id=? AND revision=?').get(id, revision);
    if (!row) return undefined;
    const value = JSON.parse(String(row.payload)) as Assertion;
    const citations = this.citationRows(id, revision);
    if (!citations.length || value.evidenceIds.some(eventId => !this.evidence(handle, eventId))
      || citations.some(citation => !this.citationReadable(handle, citation, true))) return undefined;
    return value;
  }
  calendarVersionId(id: string, revision: number) { return 'agenda-version:' + createHash('sha256').update(`${id}:${revision}`).digest('hex'); }
  registerCalendarVersion(handle: ScopeHandle, id: string, revision: number, producer?: string) {
    this.scope(handle);
    const versionId = this.calendarVersionId(id, revision);
    this.write(() => {
      this.db.prepare('INSERT OR IGNORE INTO h_calendar_versions VALUES(?,?,?)').run(versionId, id, revision);
      if (producer && this.db.prepare('SELECT id FROM h_actions WHERE id=?').get(producer)) this.addDependency(handle, { consumerId: versionId, producerId: producer, producerRevision: 0, sensitivity: 'privacy', invalidation: 'block' });
    });
    return versionId;
  }
  private clearMigrationBackups() {
    if (this.databasePath === ':memory:') return;
    const directory = path.dirname(this.databasePath), prefix = path.basename(this.databasePath) + '.pre-harness-v';
    for (const name of fs.readdirSync(directory)) if (name.startsWith(prefix) && /^\d+\.sqlite$/.test(name.slice(prefix.length))) fs.unlinkSync(path.join(directory, name));
  }
  write<T>(fn: () => T): T {
    if (this.transactionDepth) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.transactionDepth++;
    this.afterCommitCallbacks = [];
    let result: T;
    try {
      result = fn();
      if (result && typeof result === 'object' && typeof (result as any).then === 'function')
        throw new HarnessError('async_transaction', '事务内不能调用异步服务。');
      this.fault?.('before_transaction_commit');
      this.db.exec('COMMIT');
    } catch (error) {
      this.afterCommitCallbacks = [];
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.transactionDepth--;
    }
    const callbacks = this.afterCommitCallbacks;
    this.afterCommitCallbacks = [];
    for (const callback of callbacks) callback();
    return result!;
  }
  afterCommit(callback: () => void) {
    if (this.transactionDepth) this.afterCommitCallbacks.push(callback);
    else callback();
  }
  /** Host-owned original artifacts must follow the committed source deletion. */
  onPrivacyCleanup(callback: () => void) { this.privacyCleanupListeners.add(callback); return () => this.privacyCleanupListeners.delete(callback); }
  getMeta<T>(key: string, fallback?: T): T {
    const row = this.db.prepare('SELECT value FROM h_meta WHERE key=?').get(key);
    return row ? JSON.parse(String(row.value)) : (fallback as T);
  }
  setMeta(key: string, value: unknown) {
    this.db
      .prepare('INSERT INTO h_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, JSON.stringify(value));
  }
  get epoch() {
    return this.getMeta<number>('privacy_epoch', 1);
  }
  get policyRevision() {
    return this.getMeta<number>('policy_revision', 1);
  }
  get domainRevision() {
    return this.getMeta<number>('domain_revision', 0);
  }
  filter(handle: ScopeHandle, alias = 'r'): { sql: string; params: SQLInputValue[] } {
    const s = this.scope(handle),
      prefix = alias + '.';
    const persistentSources = s.sources.filter((source) => source !== 'current');
    return {
      sql: `${prefix}owner=? AND ${prefix}workspace=? AND ${prefix}subject=? AND ${prefix}world=?
        AND (${prefix}source IN (${placeholders(persistentSources)}) ${s.currentEventIds.length ? `OR ${prefix}id IN (${placeholders(s.currentEventIds)})` : ''})
        AND ${prefix}purpose IN (${placeholders(s.purposes)})
        AND ${prefix}audience IN (${placeholders(s.audience === 'self' ? ['self', 'public'] : [s.audience, 'public'])})
        AND (${prefix}expires_at IS NULL OR julianday(${prefix}expires_at)>julianday(?))
        ${s.grants.includes('restricted:read') ? '' : `AND ${prefix}sensitivity!='restricted'`}`,
      params: [
        s.principalId,
        s.workspaceId,
        s.subjectId,
        s.worldId,
        ...persistentSources,
        ...s.currentEventIds,
        ...s.purposes,
        ...(s.audience === 'self' ? ['self', 'public'] : [s.audience, 'public']),
        this.clock.now(),
      ],
    };
  }
  private envelope(
    e: {
      ownerId: string;
      workspaceId: string;
      subjectId: string;
      worldId: string;
      label: EvidenceEvent['label'];
    },
    sourceId: string,
  ): SQLInputValue[] {
    return [
      e.ownerId,
      e.workspaceId,
      e.subjectId,
      e.worldId,
      sourceId,
      e.label.purpose,
      e.label.audience,
      e.label.sensitivity,
      e.label.retention,
      e.label.infer ? 1 : 0,
      e.label.expiresAt || null,
    ];
  }
  private recordAccess(handle: ScopeHandle, row: Row, kind: string) {
    const scope = this.scope(handle);
    this.access.push({
      principalId: scope.principalId,
      scopeId: handle.id,
      purposes: scope.purposes,
      source: scope.currentEventIds.includes(String(row.id)) ? 'current' : String(row.source),
      objectId: String(row.id),
      kind,
    });
  }
  hasFence(objectId: string, sourceId?: string): boolean {
    return this.fences().some(
      (f) =>
        f.kind === 'delete' &&
        (f.objectIds.includes(objectId) ||
          f.sourceIds.includes(objectId) ||
          (!!sourceId && f.sourceIds.includes(sourceId))),
    );
  }
  sourceOrigins(source: LineageSource, range?: { start: number; end: number }) { return sourceOriginSpans(this.db, source, range); }
  sameSourceOrigin(left: EvidenceEvent, leftRange: { start: number; end: number }, right: EvidenceEvent, rightRange: { start: number; end: number }) {
    return sameSourceOrigins(this.sourceOrigins(left, leftRange), this.sourceOrigins(right, rightRange));
  }
  private validateLocalOrigin(eventId: string) {
    const row = this.db.prepare('SELECT owner,workspace FROM h_evidence WHERE id=?').get(eventId);
    if (row && (row.owner !== this.identity.principalId || row.workspace !== this.identity.workspaceId))
      throw new HarnessError('source_lineage_forbidden', '来源关系超出当前资料归属，不能改写或删除该来源。');
  }
  private blockedDeletedLineage(input: LineageSource & { text: string }, range?: { start: number; end: number }, allowMasked = true) {
    const chars = Array.from(input.text), selected = range || { start: 0, end: chars.length };
    const fences = this.fences().filter(fence => fence.kind === 'delete');
    if (!fences.length) return false;
    const origins = this.sourceOrigins(input, selected).spans;
    return origins.some(origin => this.hasFence(origin.eventId, origin.sourceId) || fences.some(fence => (fence.spans || []).some(cut => {
      if (cut.eventId !== origin.eventId) return false;
      if (origin.contentVersion !== cut.contentVersion || origin.start === undefined || origin.end === undefined
        || origin.end - origin.start !== selected.end - selected.start) return true;
      const start = Math.max(cut.start, origin.start), end = Math.min(cut.end, origin.end);
      if (end <= start) return false;
      // Retain an already redacted raw copy's legal remainder. A citation can
      // never use these coordinates, even when their body is now a mask.
      return !allowMasked || chars.slice(selected.start + start - origin.start, selected.start + end - origin.start).some(char => char !== '█');
    })));
  }
  /** Build the durable erasure addresses before any source body is masked.
   * Exact copies/projections share their origin; independent repetitions do not. */
  sourceErasure(spans: NonNullable<PrivacyFence['spans']>, unknownEventIds: string[] = []) {
    const locations = new Map<string, NonNullable<PrivacyFence['spans']>[number]>(), whole = new Set<string>();
    const add = (origin: OriginSpan) => {
      this.validateLocalOrigin(origin.eventId);
      if (origin.contentVersion === undefined || origin.start === undefined || origin.end === undefined) whole.add(origin.eventId);
      else {
        const span = { eventId: origin.eventId, contentVersion: origin.contentVersion, start: origin.start, end: origin.end };
        locations.set(canonical(span), span);
      }
    };
    const selected: OriginSpan[] = [...spans, ...unknownEventIds.map(eventId => ({ eventId }))];
    for (const target of selected) {
      const source = parse<EvidenceEvent>(this.db.prepare('SELECT payload FROM h_evidence WHERE id=? AND owner=? AND workspace=?')
        .get(target.eventId, this.identity.principalId, this.identity.workspaceId));
      if (!source) { whole.add(target.eventId); continue; }
      const known = target.contentVersion === source.contentVersion && target.start !== undefined && target.end !== undefined
        && Number.isSafeInteger(target.start) && Number.isSafeInteger(target.end) && target.start >= 0
        && target.end > target.start && target.end <= Array.from(source.text).length;
      for (const origin of this.sourceOrigins(source, known ? { start: target.start!, end: target.end! } : undefined).spans) add(origin);
    }
    const canonicalSpans = [...locations.values()], targets = [...new Set([...whole, ...canonicalSpans.map(span => span.eventId)])];
    if (targets.length) {
      const rows = this.db.prepare(`WITH RECURSIVE family(id) AS (
        SELECT value FROM json_each(?) UNION SELECT r.event_id FROM h_evidence_roots r JOIN family f ON r.root_id=f.id)
        SELECT e.payload FROM h_evidence e JOIN family f ON f.id=e.id WHERE e.owner=? AND e.workspace=? AND e.status!='deleted'`)
        .all(JSON.stringify(targets), this.identity.principalId, this.identity.workspaceId);
      for (const row of rows) {
        const source = parse<EvidenceEvent>(row)!, length = Array.from(source.text).length;
        for (const origin of this.sourceOrigins(source, { start: 0, end: length }).spans) {
          if (whole.has(origin.eventId)) { whole.add(source.id); break; }
          for (const cut of canonicalSpans.filter(span => span.eventId === origin.eventId)) {
            if (origin.contentVersion !== cut.contentVersion || origin.start === undefined || origin.end === undefined || origin.end - origin.start !== length) {
              whole.add(source.id); break;
            }
            const start = Math.max(cut.start, origin.start), end = Math.min(cut.end, origin.end);
            if (end > start) add({ eventId: source.id, contentVersion: source.contentVersion, start: start - origin.start, end: end - origin.start });
          }
        }
      }
    }
    return { spans: [...locations.values()].filter(span => !whole.has(span.eventId)), sourceIds: [...whole] };
  }
  /** Older versions could ingest an unlocated copy after a partial deletion.
   * Retire only that forbidden lineage; broad old cleanups must not run again
   * over later independent work or accepted business records. */
  private removeDeletedSourceReplays() {
    const roots = [...new Set(this.fences().filter(fence => fence.kind === 'delete').flatMap(fence => (fence.spans || []).map(span => span.eventId)))];
    if (!roots.length) return;
    const rows = this.db.prepare(`WITH RECURSIVE family(id) AS (
      SELECT value FROM json_each(?) UNION SELECT r.event_id FROM h_evidence_roots r JOIN family f ON r.root_id=f.id)
      SELECT DISTINCT e.payload FROM h_evidence e JOIN family f ON f.id=e.id
      WHERE e.owner=? AND e.workspace=? AND e.status!='deleted'`).all(JSON.stringify(roots), this.identity.principalId, this.identity.workspaceId);
    const ids = rows.map(row => parse<EvidenceEvent>(row)!).filter(event => this.blockedDeletedLineage(event)).map(event => event.id);
    if (!ids.length) return;
    const fence = this.establishFence({ kind: 'delete', objectIds: ids, sourceIds: [] });
    this.cleanupFence(fence);
    this.checkpointPrivacy();
  }
  ingest(handle: ScopeHandle, input: Omit<EvidenceEvent, 'sequence'>): EvidenceEvent {
    const scope = this.scope(handle);
    if (scope.retention === 'session_only' || input.label.retention === 'session_only')
      throw new HarnessError('ephemeral_only', '本轮内容不会持久保存。');
    if (
      scope.principalId !== input.ownerId ||
      scope.workspaceId !== input.workspaceId ||
      scope.subjectId !== input.subjectId ||
      scope.worldId !== input.worldId
    )
      throw new HarnessError('scope_mismatch', '来源归属不匹配。');
    if (!scope.sources.includes(input.sourceId) && !scope.currentEventIds.includes(input.id))
      throw new HarnessError('source_forbidden', '未授权的来源。');
    if (input.label.sensitivity === 'restricted')
      throw new HarnessError('protection_unavailable', '当前整库未加密，受限资料只用于本轮。');
    if (this.hasFence(input.id, input.sourceId) || input.roots.some((root) => this.hasFence(root)))
      throw new HarnessError('deleted_source', '此旧来源已经被删除，不能重放。');
    if (this.blockedDeletedLineage(input))
      throw new HarnessError('deleted_source_range', '这份副本仍源于已忘记的片段，不能换一个标识恢复；无关的精确片段仍可保留。');
    const existing = this.db
      .prepare('SELECT payload FROM h_evidence WHERE id=? AND owner=? AND workspace=?')
      .get(input.id, scope.principalId, scope.workspaceId);
    if (existing) {
      const event = parse<EvidenceEvent>(existing)!;
      if (event.text !== input.text || event.contentVersion !== input.contentVersion)
        throw new HarnessError('event_conflict', '相同事件标识的原文不同。');
      return event;
    }
    const event = evidenceSchema.parse({ ...input, sequence: this.getMeta<number>('received_seq', 0) + 1 });
    this.write(() => {
      this.db
        .prepare('INSERT INTO h_evidence VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          event.id,
          ...this.envelope(event, event.sourceId),
          event.contentVersion,
          event.sequence,
          event.receivedAt,
          event.status,
          event.text,
          JSON.stringify(event),
        );
      for (const root of event.roots)
        this.db.prepare('INSERT INTO h_evidence_roots VALUES(?,?)').run(event.id, root);
      const points = Array.from(event.text);
      for (let start = 0; start < points.length; start += 1800) {
        const end = Math.min(points.length, start + 1800),
          spanId = event.id + ':' + event.contentVersion + ':' + start;
        this.db
          .prepare('INSERT INTO h_spans VALUES(?,?,?,?,?,?,0)')
          .run(
            spanId,
            event.id,
            event.contentVersion,
            start,
            end,
            event.label.infer && event.speaker === 'user' ? 'pending' : 'quote_or_hypothesis',
          );
      }
      this.setMeta('received_seq', event.sequence);
      this.outbox('extract', event.id);
      this.outbox('index_evidence', event.id);
    });
    this.afterCommit(() => this.fault?.('after_event_and_outbox_commit'));
    return event;
  }
  evidence(handle: ScopeHandle, id: string): EvidenceEvent | undefined {
    const f = this.filter(handle);
    const row = this.db
      .prepare(`SELECT r.* FROM h_evidence r WHERE ${f.sql} AND r.id=? AND r.status!='deleted'`)
      .get(...f.params, id);
    if (row) this.recordAccess(handle, row, 'evidence');
    return parse<EvidenceEvent>(row);
  }
  sourceRestrictions(handle: ScopeHandle, eventId: string) {
    if (!this.evidence(handle, eventId)) return [];
    return this.db.prepare('SELECT predicate,operation,replacement_event_id FROM h_source_restrictions WHERE event_id=? ORDER BY predicate').all(eventId).map(row => {
      const spans = this.db.prepare('SELECT content_version,start_cp,end_cp,effective_from FROM h_source_restriction_spans WHERE event_id=? AND predicate=? ORDER BY start_cp,end_cp').all(eventId, String(row.predicate));
      const dates = spans.map(span => span.effective_from).filter((date): date is string => typeof date === 'string' && Number.isFinite(Date.parse(date)))
        .sort((a, b) => Date.parse(a) - Date.parse(b));
      return { predicate: String(row.predicate), operation: String(row.operation),
        replacementEventId: row.replacement_event_id ? String(row.replacement_event_id) : null,
        ranges: spans.map(span => ({ contentVersion: Number(span.content_version), start: Number(span.start_cp), end: Number(span.end_cp) })),
        rangeUnknown: !spans.length, effectiveFrom: dates.length === spans.length ? dates[0] || null : null };
    });
  }
  /** Host-only projection of inherited stops. Parent bodies are compared in
   * SQL, never returned or added to the caller's read scope. */
  private lineageRestrictionState(event: EvidenceEvent, location?: { start: number; end: number }) {
    const entries: Row[] = [];
    let wholeSource = false;
    const selected = location || { start: 0, end: Array.from(event.text).length };
    const origins = this.sourceOrigins(event, selected).spans.filter(origin => origin.eventId !== event.id);
    for (const origin of origins) {
      const rootId = origin.eventId;
      const restrictions = this.db.prepare(`SELECT x.predicate,x.operation,x.replacement_event_id,
        s.content_version,s.start_cp,s.end_cp,s.effective_from FROM h_source_restrictions x
        LEFT JOIN h_source_restriction_spans s ON s.event_id=x.event_id AND s.predicate=x.predicate
        WHERE x.event_id=? AND (x.predicate='*' OR s.event_id IS NULL OR s.effective_from IS NULL
          OR julianday(s.effective_from) IS NULL OR julianday(s.effective_from)<=julianday(?))
        ORDER BY x.predicate,s.content_version,s.start_cp,s.end_cp,s.effective_from`)
        .all(rootId, this.clock.now());
      if (!restrictions.length) continue;
      for (const restriction of restrictions) {
        const known = origin.start !== undefined && origin.end !== undefined && restriction.predicate !== '*' && restriction.content_version === origin.contentVersion
          && typeof restriction.start_cp === 'number' && typeof restriction.end_cp === 'number';
        if (known && (Number(restriction.end_cp) <= origin.start! || Number(restriction.start_cp) >= origin.end!)) continue;
        wholeSource ||= !known;
        entries.push({ rootId, sourceVersion: event.contentVersion, rootVersion: origin.contentVersion ?? null,
          ...restriction, originStart: origin.start ?? null, originEnd: origin.end ?? null, rangeUnknown: !known });
      }
    }
    return { entries, wholeSource };
  }
  sourceLineageRestricted(event: EvidenceEvent, location?: { start: number; end: number }) {
    return this.lineageRestrictionState(event, location).entries.length > 0;
  }
  /** Host-only, body-free baseline for child work. Future local changes enter
   * the active snapshot when they take effect; whole-source stops fail closed. */
  sourceRestrictionSnapshot(handle: ScopeHandle): SourceRestrictionSnapshot {
    const f = this.filter(handle), values = new Map<string, { metadata: string; wholeSource: boolean }>();
    const rows = this.db.prepare(`SELECT r.id AS event_id,r.version AS source_version,x.predicate,x.operation,x.replacement_event_id,
      s.content_version,s.start_cp,s.end_cp,s.effective_from
      FROM h_evidence r JOIN h_source_restrictions x ON x.event_id=r.id
      LEFT JOIN h_source_restriction_spans s ON s.event_id=x.event_id AND s.predicate=x.predicate
      WHERE ${f.sql} AND r.status!='deleted'
        AND (x.predicate='*' OR s.event_id IS NULL OR s.effective_from IS NULL OR julianday(s.effective_from) IS NULL OR julianday(s.effective_from)<=julianday(?))
      ORDER BY r.id,x.predicate,s.content_version,s.start_cp,s.end_cp,s.effective_from`).all(...f.params, this.clock.now());
    for (const row of rows) {
      const id = String(row.event_id), prior = values.get(id);
      values.set(id, { metadata: (prior?.metadata || '') + JSON.stringify({ sourceVersion: row.source_version,
        predicate: row.predicate, operation: row.operation, replacementEventId: row.replacement_event_id,
        contentVersion: row.content_version, start: row.start_cp, end: row.end_cp, effectiveFrom: row.effective_from }) + '\n',
        wholeSource: !!prior?.wholeSource || row.predicate === '*' || row.content_version === null || row.start_cp === null || row.end_cp === null });
    }
    const derived = this.db.prepare(`WITH RECURSIVE family(id) AS (
      SELECT event_id FROM h_source_restrictions UNION SELECT roots.event_id FROM h_evidence_roots roots JOIN family f ON roots.root_id=f.id)
      SELECT DISTINCT r.id,r.payload FROM h_evidence r JOIN family f ON f.id=r.id
      WHERE ${f.sql} AND r.status!='deleted' ORDER BY r.id`).all(...f.params);
    for (const row of derived) {
      const state = this.lineageRestrictionState(parse<EvidenceEvent>(row)!);
      if (!state.entries.length) continue;
      const id = String(row.id), prior = values.get(id);
      values.set(id, { metadata: (prior?.metadata || '') + JSON.stringify(state.entries), wholeSource: !!prior?.wholeSource || state.wholeSource });
    }
    return values;
  }
  sourceRestrictionsChanged(handle: ScopeHandle, baseline: SourceRestrictionSnapshot, evidenceIds: readonly string[]) {
    const current = this.sourceRestrictionSnapshot(handle);
    return evidenceIds.some(id => current.get(id)?.wholeSource
      || current.get(id)?.metadata !== baseline.get(id)?.metadata);
  }
  restrictSource(handle: ScopeHandle, eventId: string, predicate: string, operation: string, replacementEventId: string | null,
    ranges: { contentVersion: number; start: number; end: number }[], effectiveFrom: string, deferCitationRefresh = false) {
    if (deferCitationRefresh && !this.transactionDepth) throw new HarnessError('citation_review_transaction', '延后来源失效检查须位于完整提交事务内。');
    if (!this.evidence(handle, eventId)) throw new HarnessError('source_forbidden', '不能修改此来源的使用范围。');
    this.write(() => {
      this.writeSourceRestriction(eventId, predicate, operation, replacementEventId, ranges, effectiveFrom);
      if (!deferCitationRefresh) this.refreshCitationRestrictions();
    });
  }
  private writeSourceRestriction(eventId: string, predicate: string, operation: string, replacementEventId: string | null,
    ranges: ReviewedSourceRestriction['ranges'], effectiveFrom: string) {
    const alreadyWhole = !!this.db.prepare(`SELECT 1 FROM h_source_restrictions x WHERE x.event_id=? AND x.predicate=?
      AND NOT EXISTS(SELECT 1 FROM h_source_restriction_spans s WHERE s.event_id=x.event_id AND s.predicate=x.predicate)`).get(eventId, predicate);
    this.db.prepare(`INSERT INTO h_source_restrictions VALUES(?,?,?,?) ON CONFLICT(event_id,predicate)
      DO UPDATE SET operation=excluded.operation,replacement_event_id=excluded.replacement_event_id`).run(eventId, predicate, operation, replacementEventId);
    if (!ranges.length) this.db.prepare('DELETE FROM h_source_restriction_spans WHERE event_id=? AND predicate=?').run(eventId, predicate);
    else if (!alreadyWhole) for (const range of ranges) this.db.prepare(`INSERT INTO h_source_restriction_spans VALUES(?,?,?,?,?,?)
      ON CONFLICT(event_id,predicate,content_version,start_cp,end_cp) DO UPDATE SET effective_from=CASE
        WHEN julianday(effective_from) IS NULL OR julianday(excluded.effective_from) IS NULL THEN NULL
        WHEN julianday(effective_from)<=julianday(excluded.effective_from) THEN effective_from ELSE excluded.effective_from END`)
      .run(eventId, predicate, range.contentVersion, range.start, range.end, effectiveFrom);
  }
  /** The permitted citation is the authority for restricting its own origin.
   * This never loads ancestor bodies into the caller's scope. */
  restrictCitationOrigins(handle: ScopeHandle, citations: AssertionCitation[], predicate: string, operation: string,
    replacementEventId: string | null, effectiveFrom: string, deferCitationRefresh = false): ReviewedSourceRestriction[] {
    if (deferCitationRefresh && !this.transactionDepth) throw new HarnessError('citation_review_transaction', '来源复核须在同一提交事务。');
    const scope = this.scope(handle);
    if (!scope.infer || !scope.grants.includes('memory:write')) throw new HarnessError('inference_forbidden', '当前范围不能改变理解来源。');
    const targets = new Map<string, { unknown: boolean; ranges: ReviewedSourceRestriction['ranges'] }>();
    for (const citation of citations) {
      const source = this.evidence(handle, citation.eventId);
      if (!source || !this.citationSourceReadable(handle, citation)) throw new HarnessError('source_forbidden', '支持来源已不可用。');
      const known = citation.contentVersion !== undefined && citation.start !== undefined && citation.end !== undefined;
      for (const origin of this.sourceOrigins(source, known ? { start: citation.start!, end: citation.end! } : undefined).spans) {
        this.validateLocalOrigin(origin.eventId);
        const target = targets.get(origin.eventId) || { unknown: false, ranges: [] };
        if (origin.contentVersion === undefined || origin.start === undefined || origin.end === undefined) target.unknown = true;
        else if (!target.ranges.some(range => range.contentVersion === origin.contentVersion && range.start === origin.start && range.end === origin.end))
          target.ranges.push({ contentVersion: origin.contentVersion, start: origin.start, end: origin.end });
        targets.set(origin.eventId, target);
      }
    }
    const installed = [...targets].map(([eventId, target]) => ({ eventId, predicate, operation, replacementEventId, ranges: target.unknown ? [] : target.ranges }));
    this.write(() => {
      for (const restriction of installed) this.writeSourceRestriction(restriction.eventId, predicate, operation, replacementEventId, restriction.ranges, effectiveFrom);
      if (!deferCitationRefresh) this.refreshCitationRestrictions();
    });
    return installed;
  }
  /** Metadata-only retirement at writes and reads also covers future-effective
   * corrections. Exact disjoint citations do not share an invalidation. */
  private refreshCitationRestrictions() {
    const affected = () => this.db.prepare(`WITH RECURSIVE family(id) AS (
      SELECT event_id FROM h_source_restrictions UNION SELECT roots.event_id FROM h_evidence_roots roots JOIN family f ON roots.root_id=f.id)
      SELECT DISTINCT a.id,a.payload FROM h_assertions a
      JOIN h_assertion_citations c ON c.assertion_id=a.id AND c.assertion_revision=a.revision
      JOIN family f ON f.id=c.event_id
      WHERE a.owner=? AND a.workspace=? AND a.status IN ('active','candidate')`).all(this.identity.principalId, this.identity.workspaceId);
    let rows = affected();
    if (!rows.length) return;
    this.write(() => {
      for (;;) {
        let retired = false;
        for (const row of rows) {
          const assertion = JSON.parse(String(row.payload)) as Assertion;
          const invalid = this.citationRows(assertion.id, assertion.revision).filter(citation => !this.citationRestrictionsAllow(citation));
          if (!invalid.length) continue;
          if (invalid.some(citation => citation.role === 'authorization')) for (const citation of this.citationRows(assertion.id, assertion.revision).filter(value => value.role === 'primary')) {
            const projected = parse<EvidenceEvent>(this.db.prepare('SELECT payload FROM h_evidence WHERE id=?').get(citation.eventId));
            if (!projected?.parentEventId || projected.locator?.kind !== 'text') continue;
            projected.label.infer = false;
            this.db.prepare('UPDATE h_evidence SET infer=0,payload=? WHERE id=?').run(JSON.stringify(projected), projected.id);
            this.db.prepare("INSERT OR REPLACE INTO h_source_restrictions VALUES(?,'*','AUTHORIZATION_RETRACT',NULL)").run(projected.id);
          }
          this.saveAssertionWithoutScope({ ...assertion, status: 'inactive', verification: 'pending', revision: assertion.revision + 1 });
          this.invalidate(assertion.id, 'supporting_source_changed');
          retired = true;
        }
        // Retirement can stop a projected evidence source. Close that finite
        // cascade before a single caller receives any affected active row.
        if (!retired) break;
        rows = affected();
        if (!rows.length) break;
      }
    });
  }
  refreshSourceConstraints() { this.refreshCitationRestrictions(); }
  private saveAssertionWithoutScope(value: Assertion) {
    const previous = this.citationRows(value.id, value.revision - 1);
    this.db.prepare('UPDATE h_assertions SET status=?,revision=?,payload=? WHERE id=?').run(value.status, value.revision, JSON.stringify(value), value.id);
    this.db.prepare('INSERT INTO h_assertion_versions VALUES(?,?,?)').run(value.id, value.revision, JSON.stringify(value));
    for (const citation of previous) this.storeCitation(value.id, value.revision, citation);
    this.outbox('assertion_changed', value.id);
  }
  historicalEvidence(handle: ScopeHandle, event: EvidenceEvent) {
    this.refreshCitationRestrictions();
    const restrictions = this.sourceRestrictions(handle, event.id);
    if (this.sourceLineageRestricted(event)) restrictions.push({ predicate: 'restricted_source_lineage', operation: 'RECHECK',
      replacementEventId: null, ranges: [], rangeUnknown: true, effectiveFrom: null });
    return { ...event, use: restrictions.length ? 'historical_only' as const : 'source_evidence' as const, restrictions };
  }
  evidenceList(handle: ScopeHandle, limit = 100, after = 0): EvidenceEvent[] {
    const f = this.filter(handle);
    const rows = this.db
      .prepare(
        `SELECT r.* FROM h_evidence r WHERE ${f.sql} AND r.status!='deleted' AND r.seq>?
      AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=r.id) ORDER BY r.seq DESC LIMIT ?`,
      )
      .all(...f.params, after, Math.min(500, limit));
    return rows.map((row) => {
      this.recordAccess(handle, row, 'evidence');
      return parse<EvidenceEvent>(row)!;
    });
  }
  /** Original-source browsing is independent of extraction and literal search.
   * Keyset pagination fixes the upper sequence while rechecking current policy. */
  evidenceBrowsePage(handle: ScopeHandle, options: { sourceIds: string[]; receivedFrom?: string; receivedBefore?: string;
    snapshot: number; before: number; limit: number }): EvidenceEvent[] {
    const f = this.filter(handle);
    if (!options.sourceIds.length) return [];
    const rows = this.db.prepare(`SELECT r.* FROM h_evidence r WHERE ${f.sql} AND r.status!='deleted'
      AND r.source IN (${placeholders(options.sourceIds)}) AND r.seq<=? AND r.seq<?
      ${options.receivedFrom ? 'AND julianday(r.received_at)>=julianday(?)' : ''}
      ${options.receivedBefore ? 'AND julianday(r.received_at)<julianday(?)' : ''}
      AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=r.id AND x.predicate='*')
      ORDER BY r.seq DESC LIMIT ?`).all(...f.params, ...options.sourceIds, options.snapshot, options.before,
        ...(options.receivedFrom ? [options.receivedFrom] : []), ...(options.receivedBefore ? [options.receivedBefore] : []),
        Math.max(1, Math.min(options.limit, 51)));
    return rows.map(row => { this.recordAccess(handle, row, 'source_browse'); return parse<EvidenceEvent>(row)!; });
  }
  sessionEvidence(handle: ScopeHandle, sessionId: string, limit = 4): EvidenceEvent[] {
    const f = this.filter(handle);
    const rows = this.db
      .prepare(
        `SELECT r.* FROM h_evidence r JOIN messages m ON m.id=r.id WHERE ${f.sql} AND m.session_id=? AND r.status!='deleted'
      AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=r.id) ORDER BY r.seq DESC LIMIT ?`,
      )
      .all(...f.params, sessionId, Math.min(limit, 8));
    return rows.map((row) => {
      this.recordAccess(handle, row, 'session_reference');
      return parse<EvidenceEvent>(row)!;
    });
  }
  private conversationPlanningMetadata(sessionId: string) {
    const candidates = this.db.prepare(`SELECT id,json_extract(payload,'$.contextReceipt.planningProvenance') AS provenance,
      json_extract(payload,'$.scenes') AS scenes,json_extract(payload,'$.views') AS views FROM messages WHERE session_id=? AND role='assistant'`).all(sessionId);
    const snapshots = new Map<string, any>(candidates.flatMap(row => (row.scenes === null ? [] : JSON.parse(String(row.scenes)))
      .map((scene: any) => [`${scene.id}@${scene.revision}`, scene])));
    return candidates.map(row => ({ id: String(row.id), value: {
        contextReceipt: row.provenance === null ? undefined : { planningProvenance: JSON.parse(String(row.provenance)) },
        scenes: [...(row.scenes === null ? [] : JSON.parse(String(row.scenes))),
          ...(row.views === null ? [] : JSON.parse(String(row.views))).flatMap((view: any) => (view.sceneRefs || [])
            .flatMap((ref: any) => snapshots.has(`${ref.id}@${ref.revision}`) ? [snapshots.get(`${ref.id}@${ref.revision}`)] : []))],
      } }));
  }
  /** Carry only the provenance of the historical bodies actually provided. */
  conversationPlanningProvenance(handle: ScopeHandle, sessionId: string, messageIds: string[]): PlanningMaterialProvenance[] {
    const scope = this.scope(handle);
    if (!scope.sources.includes('history:self') || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real') return [];
    const selected = new Set(messageIds), provenance: PlanningMaterialProvenance[] = [];
    for (const row of this.conversationPlanningMetadata(sessionId).filter(row => selected.has(row.id))) {
      if (!this.planningMessageReadable(handle, row.value)) throw new HarnessError('history_changed', '刚才读取的前情依据已改变，需要重新读取。');
      provenance.push(...row.value.contextReceipt?.planningProvenance || []);
      for (const scene of row.value.scenes) if (scene?.kind === 'planning' && scene.continuation) {
        const value = scene.continuation;
        provenance.push(planningMaterialProvenanceSchema.parse({ intentId: value.intentId, intentRevision: value.intentRevision,
          sourceBinding: value.sourceBinding, attemptBasis: value.attemptBasis }));
      }
    }
    return [...new Map(provenance.map(value => [canonical(value), value])).values()];
  }
  /** Select permitted transcript bodies in SQL, before they enter model memory. */
  conversationHistory(handle: ScopeHandle, sessionId: string, excludeIds: string[], limit = 12) {
    const s = this.scope(handle);
    if (!s.sources.includes('history:self') || s.audience !== 'self' || s.subjectId !== s.principalId || s.worldId !== 'real') return [];
    const f = this.filter(handle);
    const denied = this.conversationPlanningMetadata(sessionId).filter(row => !this.planningMessageReadable(handle, row.value)).map(row => row.id);
    const rows = this.db.prepare(`SELECT m.id,m.role,CASE WHEN m.role='user' THEN (SELECT content FROM h_evidence WHERE id=m.id) ELSE m.content END AS content,m.created_at FROM messages m
      WHERE m.session_id=? AND m.id NOT IN (SELECT value FROM json_each(?))
      AND json_extract(m.payload,'$.status')='done'
      AND ((m.role='user' AND EXISTS(SELECT 1 FROM h_evidence r WHERE r.id=m.id AND ${f.sql} AND r.status='active'
        AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=r.id)))
        OR (m.role='assistant' AND json_extract(m.payload,'$.contextReceipt.privacyEpoch')=?
          AND json_extract(m.payload,'$.contextReceipt.policyRevision')=?
          AND json_type(m.payload,'$.contextReceipt.providedSourceIds')='array'
          AND m.id NOT IN (SELECT value FROM json_each(?))
          AND NOT EXISTS(SELECT 1 FROM json_each(m.payload,'$.contextReceipt.providedSourceIds') src
            WHERE src.value NOT IN (SELECT value FROM json_each(?)))))
      ORDER BY m.created_at DESC,m.rowid DESC LIMIT ?`).all(
       sessionId, JSON.stringify(excludeIds), ...f.params, s.privacyEpoch, s.policyRevision, JSON.stringify(denied), JSON.stringify(s.sources), Math.min(24, limit),
    );
    for (const row of rows) this.recordAccess(handle, { ...row, source: 'history:self' }, 'conversation_history');
    return rows.reverse().map(row => ({ id: String(row.id), role: row.role as 'user' | 'assistant', content: String(row.content), createdAt: String(row.created_at) }));
  }
  /** A linked source observation can inform a same-conversation continuation.
   * This is only an automatic context window; older evidence remains searchable
   * and its truth is never inferred from its age. */
  sessionExternalObservations(handle: ScopeHandle, sessionId: string, at: string, limit = 2): EvidenceEvent[] {
    const s = this.scope(handle);
    if (!s.sources.includes('history:self') || s.audience !== 'self' || s.subjectId !== s.principalId || s.worldId !== 'real') return [];
    const now = Date.parse(at);
    if (!Number.isFinite(now)) return [];
    const f = this.filter(handle);
    const rows = this.db.prepare(`SELECT r.* FROM h_evidence r WHERE ${f.sql} AND r.status='active'
      AND json_extract(r.payload,'$.sessionId')=? AND json_extract(r.payload,'$.speaker')='external'
      AND json_extract(r.payload,'$.kind')='external_observation'
      AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=r.id)
      ORDER BY r.seq DESC LIMIT 12`).all(...f.params, sessionId);
    const selected = rows.map(row => parse<EvidenceEvent>(row)!).filter(event => {
      const age = now - Date.parse(event.receivedAt);
      return Number.isFinite(age) && age >= 0 && age <= 3 * 86400000;
    }).slice(0, Math.min(2, limit)).reverse();
    for (const event of selected) this.recordAccess(handle, { id: event.id, source: event.sourceId }, 'session_external_observation');
    return selected;
  }
  /** One older, related user statement from this session. Scope and session
   * filters run in SQL before any candidate body is returned. It supplements
   * a short recent window, never searches another conversation or profile. */
  conversationAnchor(handle: ScopeHandle, sessionId: string, query: string, excludeIds: string[]) {
    const s = this.scope(handle);
    if (!s.sources.includes('history:self') || s.audience !== 'self' || s.subjectId !== s.principalId || s.worldId !== 'real') return null;
    const points = Array.from(query.normalize('NFKC').toLowerCase()).slice(0, 240);
    const grams = [...new Set(points.slice(0, -1).map((point, index) => point + points[index + 1])
      .filter(gram => /^[\p{L}\p{N}]{2}$/u.test(gram)))].slice(0, 24);
    if (!grams.length) return null;
    const f = this.filter(handle);
    let row = this.db.prepare(`WITH eligible AS MATERIALIZED(
      SELECT r.id,r.seq,r.content,m.created_at FROM h_evidence r JOIN messages m ON m.id=r.id
      WHERE ${f.sql} AND m.session_id=? AND m.role='user' AND r.status='active'
      AND r.id NOT IN (SELECT value FROM json_each(?))
      AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=r.id)),
      scored AS (SELECT e.*,(${grams.map(() => 'CASE WHEN instr(lower(e.content),?)>0 THEN 1 ELSE 0 END').join('+')}) AS matches FROM eligible e)
      SELECT id,content,created_at FROM scored WHERE matches>0 ORDER BY matches DESC,seq DESC LIMIT 1`).get(
      ...f.params, sessionId, JSON.stringify(excludeIds), ...grams,
    );
    // A deictic follow-up can share no literal bigram with its earlier
    // subject ("that math" versus an equation). Under the same SQL boundary,
    // retain one substantial older user statement as a candidate. Its length
    // is only a retrieval fallback, never evidence that it is still the topic.
    if (!row) row = this.db.prepare(`SELECT r.id,r.content,m.created_at FROM h_evidence r JOIN messages m ON m.id=r.id
      WHERE ${f.sql} AND m.session_id=? AND m.role='user' AND r.status='active'
      AND r.id NOT IN (SELECT value FROM json_each(?))
      AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=r.id)
      ORDER BY length(r.content) DESC,r.seq DESC LIMIT 1`).get(...f.params, sessionId, JSON.stringify(excludeIds));
    if (!row) return null;
    this.recordAccess(handle, { ...row, source: 'history:self' }, 'conversation_anchor');
    return { id: String(row.id), role: 'user' as const, content: String(row.content), createdAt: String(row.created_at) };
  }
  pendingConstraints(handle: ScopeHandle, sessionId: string): EvidenceEvent[] {
    const f = this.filter(handle);
    const rows = this.db
      .prepare(
        `SELECT DISTINCT r.* FROM h_evidence r JOIN messages m ON m.id=r.id WHERE ${f.sql} AND m.session_id=? AND r.status='active'
      AND EXISTS(SELECT 1 FROM h_spans p WHERE p.event_id=r.id AND p.status IN ('pending','failed','needs_context'))
      AND (r.content LIKE '%必须%' OR r.content LIKE '%未完成要求%' OR r.content LIKE '%截止%' OR r.content LIKE '%不接受%' OR r.content LIKE '%保留%')
      AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=r.id) ORDER BY r.seq DESC LIMIT 50`,
      )
      .all(...f.params, sessionId);
    return rows.map((row) => {
      this.recordAccess(handle, row, 'pending_constraint');
      return parse<EvidenceEvent>(row)!;
    });
  }
  searchEvidence(handle: ScopeHandle, query: string, limit = 12, offset = 0): EvidenceEvent[] {
    const terms = [...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))];
    if (!terms.length) return [];
    const f = this.filter(handle),
      patterns = terms.map((t) => '%' + t.replace(/[\\%_]/g, '\\$&') + '%');
    // Index misses and pending extraction never hide original evidence. SQL scope precedes the bounded result set.
    const rows = this.db
      .prepare(
        `SELECT r.* FROM h_evidence r WHERE ${f.sql} AND r.status!='deleted'
      AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=r.id AND x.predicate='*')
      AND NOT EXISTS(SELECT 1 FROM json_each(?) term WHERE lower(r.content) NOT LIKE term.value ESCAPE '\\')
      ORDER BY r.seq DESC LIMIT ? OFFSET ?`,
      )
      .all(...f.params, JSON.stringify(patterns), Math.max(1, Math.min(limit, 51)), Math.max(0, offset));
    return rows.map((row) => {
      this.recordAccess(handle, row, 'original_search');
      return parse<EvidenceEvent>(row)!;
    });
  }
  lexicalEvidence(handle: ScopeHandle, query: string, limit = 12, offset = 0): EvidenceEvent[] {
    const f = this.filter(handle), grams = queryGrams(query);
    if (!grams.length) return this.searchEvidence(handle, query, limit, offset);
    // Apply scope before matching, then rank indexed and unindexed originals
    // together. OFFSET applies to the complete result set, never a top-50 pool.
    const rows = this.db.prepare(`WITH query_grams AS MATERIALIZED(SELECT value AS gram FROM json_each(?)),
      eligible AS MATERIALIZED(SELECT r.* FROM h_evidence r WHERE ${f.sql} AND r.status!='deleted'
        AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=r.id AND x.predicate='*')),
      scores AS (
        SELECT r.id,count(*) AS matches FROM eligible r JOIN h_grams g ON g.object_id=r.id
          JOIN query_grams q ON q.gram=g.gram WHERE g.kind='evidence' GROUP BY r.id
        UNION ALL
        SELECT r.id,(SELECT count(*) FROM query_grams q WHERE instr(lower(r.content),q.gram)>0) AS matches FROM eligible r
          WHERE NOT EXISTS(SELECT 1 FROM h_grams g WHERE g.object_id=r.id AND g.kind='evidence'))
      SELECT r.*,scores.matches FROM eligible r JOIN scores ON scores.id=r.id WHERE scores.matches>0
        ORDER BY CASE WHEN instr(lower(r.content),?)>0 THEN 1 ELSE 0 END DESC,scores.matches DESC,r.seq DESC
        LIMIT ? OFFSET ?`).all(JSON.stringify(grams), ...f.params, query.trim().toLowerCase(), Math.max(1, Math.min(limit, 51)), Math.max(0, offset));
    return rows.map((row) => {
      this.recordAccess(handle, row, 'lexical_search');
      return parse<EvidenceEvent>(row)!;
    });
  }
  lexicalAssertions(handle: ScopeHandle, query: string, limit = 24): Assertion[] {
    return this.lexicalAssertionPage(handle, query, { limit }).items;
  }
  lexicalAssertionPage(handle: ScopeHandle, query: string,
    options: { limit?: number; offset?: number; at?: string; strength?: 'hard' | 'non_hard'; verified?: boolean } = {}) {
    this.scope(handle);
    this.refreshCitationRestrictions();
    const f = this.filter(handle), e = this.filter(handle, 'e'), grams = queryGrams(query);
    if (!grams.length) return { items: [] as Assertion[], total: 0 };
    if (options.at && !Number.isFinite(Date.parse(options.at))) throw new HarnessError('invalid_time', '检索时间不合法。');
    // Permission, verification and valid-time eligibility precede ranking and
    // pagination so stale or inaccessible high-score rows cannot crowd out truth.
    const base = `WITH query_grams AS MATERIALIZED(SELECT value AS gram FROM json_each(?)),
      eligible AS MATERIALIZED(SELECT r.id,r.rowid AS ordinal FROM h_assertions r WHERE ${f.sql} AND r.status='active'
        AND NOT EXISTS(SELECT 1 FROM h_assertion_citations ae LEFT JOIN h_evidence e ON e.id=ae.event_id
          WHERE ae.assertion_id=r.id AND ae.assertion_revision=r.revision AND (e.id IS NULL OR NOT (${e.sql}) OR e.status='deleted'))
        ${options.verified ? "AND json_extract(r.payload,'$.verification')='verified'" : ''}
        ${options.at ? 'AND (r.valid_from IS NULL OR julianday(r.valid_from)<=julianday(?)) AND (r.valid_to IS NULL OR julianday(r.valid_to)>julianday(?))' : ''}
        ${options.strength === 'hard' ? "AND r.strength='hard'" : options.strength === 'non_hard' ? "AND r.strength!='hard'" : ''}),
      scored AS (SELECT a.id,a.ordinal,count(*) AS matches FROM eligible a JOIN h_grams g ON g.object_id=a.id
        JOIN query_grams q ON q.gram=g.gram WHERE g.kind='assertion' GROUP BY a.id)`;
    const params = [JSON.stringify(grams), ...f.params, ...e.params, ...(options.at ? [options.at, options.at] : [])];
    const rows = this.db.prepare(`${base} SELECT *,count(*) OVER() AS total FROM scored ORDER BY matches DESC,ordinal DESC,id
      LIMIT ? OFFSET ?`).all(...params, Math.max(1, Math.min(options.limit || 24, 51)), Math.max(0, options.offset || 0));
    const total = rows.length ? Number(rows[0].total) : Number(this.db.prepare(`${base} SELECT count(*) AS total FROM scored`).get(...params)?.total || 0);
    return { items: rows.map(row => this.assertion(handle, String(row.id))).filter((a): a is Assertion => !!a), total };
  }
  spans(handle: ScopeHandle, eventId: string): ProcessingSpan[] {
    if (!this.evidence(handle, eventId)) return [];
    return this.db
      .prepare(
        'SELECT id,event_id AS eventId,content_version AS contentVersion,start_cp AS start,end_cp AS end,status,indexed FROM h_spans WHERE event_id=? ORDER BY start_cp',
      )
      .all(eventId)
      .map((r) => ({ ...r, indexed: !!r.indexed }) as unknown as ProcessingSpan);
  }
  /** Legal new-inference windows, projected through proven affine source lineage.
   * Receipts for old assertions never authorize another read of stopped text. */
  availableInferenceRanges(event: EvidenceEvent): { start: number; end: number }[] {
    const length = Array.from(event.text).length;
    if (!length || event.status === 'deleted') return [];
    let lineage: ReturnType<KernelRepository['sourceOrigins']>;
    try { lineage = this.sourceOrigins(event, { start: 0, end: length }); }
    catch (error) {
      if (error instanceof HarnessError && error.code === 'source_lineage_budget') return [];
      throw error;
    }
    if (!lineage.complete) return [];
    const deleted = this.fences().filter(fence => fence.kind === 'delete').flatMap(fence => fence.spans || []);
    const excluded: { start: number; end: number }[] = [];
    for (const origin of lineage.spans) {
      if (!origin.sourceId || !Number.isSafeInteger(origin.contentVersion) || !Number.isSafeInteger(origin.start)
        || !Number.isSafeInteger(origin.end) || origin.start! < 0 || origin.end! - origin.start! !== length) return [];
      const current = this.db.prepare('SELECT source,version,status FROM h_evidence WHERE id=? AND owner=? AND workspace=?')
        .get(origin.eventId, event.ownerId, event.workspaceId);
      if (!current || current.status === 'deleted' || Number(current.version) !== origin.contentVersion
        || String(current.source) !== origin.sourceId || this.hasFence(origin.eventId, origin.sourceId)) return [];
      const cuts = [
        ...deleted.filter(cut => cut.eventId === origin.eventId).map(cut => ({ version: cut.contentVersion, start: cut.start, end: cut.end })),
        ...this.sourceSpanRestrictions(origin).map(row => ({ version: row.content_version, start: row.start_cp, end: row.end_cp, whole: row.predicate === '*' })),
      ];
      for (const cut of cuts) {
        if ('whole' in cut && cut.whole || cut.version !== origin.contentVersion || !Number.isSafeInteger(cut.start)
          || !Number.isSafeInteger(cut.end) || Number(cut.start) < 0 || Number(cut.end) <= Number(cut.start)) return [];
        const start = Math.max(0, Number(cut.start) - origin.start!), end = Math.min(length, Number(cut.end) - origin.start!);
        if (end > start) excluded.push({ start, end });
      }
    }
    let ranges = [{ start: 0, end: length }];
    for (const cut of excluded) ranges = ranges.flatMap(range => cut.end <= range.start || cut.start >= range.end ? [range]
      : [...(cut.start > range.start ? [{ start: range.start, end: cut.start }] : []), ...(cut.end < range.end ? [{ start: cut.end, end: range.end }] : [])]);
    return ranges;
  }
  /** Host recovery queue: least-recently-attempted first, with durable backoff.
   * A pending WAL entry is not permission to revive paused or restricted data. */
  memoryRecoveryCandidates(eventId?: string) {
    return this.db.prepare(`SELECT e.id,e.received_at,e.source,e.purpose,json_extract(e.payload,'$.interpretationTimeZone') AS time_zone
      FROM h_evidence e LEFT JOIN h_memory_recovery q ON q.event_id=e.id
      WHERE e.owner=? AND e.workspace=? AND e.subject=? AND e.world='real'
        AND e.infer=1 AND e.retain='purpose_scoped' AND e.status IN ('active','redacted') AND json_extract(e.payload,'$.speaker')='user'
        AND (e.expires_at IS NULL OR julianday(e.expires_at)>julianday(?))
        AND (? IS NULL OR e.id=?) AND (q.due_at IS NULL OR julianday(q.due_at)<=julianday(?))
        AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=e.id AND x.predicate='*')
        AND NOT EXISTS(SELECT 1 FROM h_evidence_roots r JOIN h_source_restrictions x ON x.event_id=r.root_id WHERE r.event_id=e.id AND x.predicate='*')
        AND EXISTS(SELECT 1 FROM h_spans s WHERE s.event_id=e.id AND s.status IN ('pending','needs_context'))
      ORDER BY COALESCE(q.last_attempt_at,''),e.seq`).all(this.identity.principalId, this.identity.workspaceId,
        this.identity.principalId, this.clock.now(), eventId || null, eventId || null, this.clock.now());
  }
  memoryContextProgress(handle: ScopeHandle, spanId: string) {
    const row = this.db.prepare('SELECT * FROM h_memory_context WHERE span_id=?').get(spanId);
    if (!row || !this.evidence(handle, String(row.event_id))) return undefined;
    return { sourceVersion: Number(row.source_version), methodVersion: String(row.method_version),
      attemptSignature: String(row.attempt_signature), sourceSignature: String(row.source_signature), contextWatermark: Number(row.context_watermark),
      requestSignature: String(row.request_signature), requests: JSON.parse(String(row.requests)) as { eventId: string; contentVersion: number; start: number; end: number }[],
      requestResults: JSON.parse(String(row.request_results)) as { index: number; status: string }[],
      scopeBinding: JSON.parse(String(row.scope_binding)) as MemoryContextScope };
  }
  recordMemoryContext(handle: ScopeHandle, eventId: string, spanId: string, value: {
    sourceVersion: number; methodVersion: string; attemptSignature: string; sourceSignature: string; contextWatermark: number;
    requestSignature: string; requests: { eventId: string; contentVersion: number; start: number; end: number }[];
    requestResults: { index: number; status: string }[];
    scopeBinding: MemoryContextScope;
  }) {
    this.write(() => {
      const event = this.evidence(handle, eventId);
      if (!event || event.contentVersion !== value.sourceVersion || !this.db.prepare('SELECT 1 FROM h_spans WHERE id=? AND event_id=? AND content_version=?').get(spanId, eventId, event.contentVersion))
        throw new HarnessError('memory_context_changed', '原文已变化，未保存旧的上下文进度。');
      const requests = JSON.stringify(value.requests), results = JSON.stringify(value.requestResults);
      if (value.requests.length > 8 || Buffer.byteLength(requests) + Buffer.byteLength(results) > 16_000)
        throw new HarnessError('memory_context_budget', '上下文位置超过持久恢复预算，原片段仍待处理。');
      this.db.prepare(`INSERT INTO h_memory_context VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(span_id) DO UPDATE SET
        source_version=excluded.source_version,method_version=excluded.method_version,attempt_signature=excluded.attempt_signature,
        source_signature=excluded.source_signature,context_watermark=excluded.context_watermark,request_signature=excluded.request_signature,
        requests=excluded.requests,request_results=excluded.request_results,updated_at=excluded.updated_at,scope_binding=excluded.scope_binding`)
        .run(spanId, eventId, value.sourceVersion, value.methodVersion, value.attemptSignature, value.sourceSignature, value.contextWatermark,
          value.requestSignature, requests, results, this.clock.now(), JSON.stringify(value.scopeBinding));
    });
  }
  /** Privacy cleanup owns locator removal, never retry status or new authority. */
  cleanupMemoryContextRequests() {
    const fences = this.fences(), removed = (id: string) => {
      const row = this.db.prepare('SELECT source,status FROM h_evidence WHERE id=?').get(id);
      return !row || row.status === 'deleted' || this.hasFence(id, String(row.source));
    };
    this.write(() => {
      for (const row of this.db.prepare('SELECT span_id,requests,request_results,scope_binding FROM h_memory_context').all()) {
        const prior = JSON.parse(String(row.requests)) as { eventId: string; contentVersion: number; start: number; end: number }[];
        const priorResults = JSON.parse(String(row.request_results)) as { index: number; status: string }[];
        const retained = prior.map((request, index) => ({ request, index })).filter(({ request }) => {
          const source = this.db.prepare('SELECT version,payload FROM h_evidence WHERE id=?').get(request.eventId);
          if (!source || removed(request.eventId) || Number(source.version) !== request.contentVersion) return false;
          const event = JSON.parse(String(source.payload)) as EvidenceEvent;
          return this.availableInferenceRanges(event).some(range => request.end > request.start && request.start >= range.start && request.end <= range.end);
        }).sort((a, b) => a.request.eventId.localeCompare(b.request.eventId) || a.request.contentVersion - b.request.contentVersion
          || a.request.start - b.request.start || a.request.end - b.request.end);
        const requests = retained.map(item => item.request), results = retained.map((item, index) => ({ index,
          status: priorResults.find(result => result.index === item.index)?.status || 'budget_exceeded' }));
        const binding = JSON.parse(String(row.scope_binding)) as MemoryContextScope;
        if (Array.isArray(binding.currentEventIds)) binding.currentEventIds = binding.currentEventIds.filter(id => !removed(id));
        if (Array.isArray(binding.sources)) binding.sources = binding.sources.filter(source => !fences.some(fence => fence.sourceIds.includes(source)));
        const serializedRequests = JSON.stringify(requests), serializedResults = JSON.stringify(results), serializedBinding = JSON.stringify(binding);
        if (serializedRequests !== row.requests || serializedResults !== row.request_results || serializedBinding !== row.scope_binding)
          this.db.prepare('UPDATE h_memory_context SET requests=?,request_results=?,request_signature=?,scope_binding=?,updated_at=? WHERE span_id=?')
            .run(serializedRequests, serializedResults, createHash('sha256').update(canonical(requests)).digest('hex'), serializedBinding, this.clock.now(), String(row.span_id));
      }
    });
  }
  nextPendingMemory(eventId?: string) {
    return this.db.prepare(`SELECT e.id,e.received_at,e.source,e.purpose,json_extract(e.payload,'$.interpretationTimeZone') AS time_zone
      FROM h_evidence e LEFT JOIN h_memory_recovery q ON q.event_id=e.id
      WHERE e.owner=? AND e.workspace=? AND e.subject=? AND e.world='real'
        AND e.infer=1 AND e.retain='purpose_scoped' AND e.status IN ('active','redacted') AND json_extract(e.payload,'$.speaker')='user'
        AND (e.expires_at IS NULL OR julianday(e.expires_at)>julianday(?))
        AND (? IS NULL OR e.id=?) AND (q.due_at IS NULL OR julianday(q.due_at)<=julianday(?))
        AND NOT EXISTS(SELECT 1 FROM h_source_restrictions x WHERE x.event_id=e.id AND x.predicate='*')
        AND NOT EXISTS(SELECT 1 FROM h_evidence_roots r JOIN h_source_restrictions x ON x.event_id=r.root_id WHERE r.event_id=e.id AND x.predicate='*')
        AND EXISTS(SELECT 1 FROM h_spans s WHERE s.event_id=e.id AND s.status='pending')
      ORDER BY COALESCE(q.last_attempt_at,''),e.seq LIMIT 1`).get(this.identity.principalId, this.identity.workspaceId,
        this.identity.principalId, this.clock.now(), eventId || null, eventId || null, this.clock.now());
  }
  recordMemoryAttempt(eventId: string, outcome: 'budget' | 'retryable' | 'interrupted' | 'checked') {
    const counts = this.db.prepare(`SELECT count(*) AS total,sum(status='pending') AS pending,sum(status='failed') AS failed,
      sum(status='needs_context') AS needs_context FROM h_spans WHERE event_id=?`).get(eventId)!;
    const pending = Number(counts.pending || 0), total = Number(counts.total || 0);
    const status = pending ? 'pending' as const : counts.failed ? 'failed' as const : counts.needs_context ? 'needs_context' as const : 'complete' as const;
    const previous = Number(this.db.prepare('SELECT transient_failures FROM h_memory_recovery WHERE event_id=?').get(eventId)?.transient_failures || 0);
    const failures = outcome === 'retryable' ? Math.min(20, previous + 1) : 0;
    const delay = pending ? outcome === 'retryable' ? Math.min(300000, 1000 * 2 ** (failures - 1)) : outcome === 'budget' ? 1000 : 0 : 0;
    const deferredUntil = new Date(Date.parse(this.clock.now()) + delay).toISOString();
    if (this.db.prepare('SELECT 1 FROM h_evidence WHERE id=?').get(eventId)) this.write(() => {
      this.db.prepare(`INSERT INTO h_memory_recovery VALUES(?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET
        last_attempt_at=excluded.last_attempt_at,due_at=excluded.due_at,transient_failures=excluded.transient_failures,outcome=excluded.outcome`)
        .run(eventId, this.clock.now(), deferredUntil, failures, outcome);
    });
    return { status, pending, total, deferredUntil: pending ? deferredUntil : null };
  }
  markSpans(handle: ScopeHandle, eventId: string, status: ProcessingStatus, spanIds?: string[]) {
    if (!this.evidence(handle, eventId)) throw new HarnessError('source_forbidden', '不能处理此来源。');
    this.write(() => {
      this.db
        .prepare(
          `UPDATE h_spans SET status=? WHERE event_id=? ${spanIds?.length ? `AND id IN (${placeholders(spanIds)})` : ''}`,
        )
        .run(status, eventId, ...(spanIds || []));
      if (
        !this.db
          .prepare(
            "SELECT id FROM h_spans WHERE event_id=? AND status IN ('pending','failed','needs_context') LIMIT 1",
          )
          .get(eventId)
      )
        this.db
          .prepare("UPDATE h_outbox SET status='done' WHERE object_id=? AND kind='extract'")
          .run(eventId);
    });
  }
  watermarks(): Watermarks {
    const base = this.getMeta<number>('sequence_base', 0),
      received = this.getMeta<number>('received_seq', 0);
    const rows = this.db
      .prepare(
        `SELECT e.seq,e.status, count(s.id) AS total,
      sum(CASE WHEN s.status IN ('pending','failed','needs_context') THEN 1 ELSE 0 END) AS pending,
      sum(CASE WHEN s.indexed=0 THEN 1 ELSE 0 END) AS unindexed
      FROM h_evidence e LEFT JOIN h_spans s ON s.event_id=e.id GROUP BY e.id ORDER BY e.seq`,
      )
      .all();
    const bySeq = new Map(rows.map((r) => [Number(r.seq), r]));
    let extracted = base,
      indexed = base;
    const extractionGaps: number[] = [],
      indexingGaps: number[] = [];
    for (let seq = base + 1; seq <= received; seq++) {
      const row = bySeq.get(seq),
        extractionDone = !!row && (row.status === 'deleted' || !Number(row.pending)),
        indexDone = !!row && (row.status === 'deleted' || !Number(row.unindexed));
      if (extractionDone && extracted === seq - 1) extracted = seq;
      if (indexDone && indexed === seq - 1) indexed = seq;
      if (!extractionDone) extractionGaps.push(seq);
      if (!indexDone) indexingGaps.push(seq);
    }
    return {
      received,
      extractedContiguous: extracted,
      indexedContiguous: indexed,
      extractionGaps,
      indexingGaps,
    };
  }
  indexEvidence(handle: ScopeHandle, id: string) {
    const event = this.evidence(handle, id);
    if (!event) return;
    this.fault?.('before_index_commit');
    this.write(() => {
      this.replaceIndex('evidence', id, event.text);
      this.db.prepare('UPDATE h_spans SET indexed=1 WHERE event_id=?').run(id);
      this.db
        .prepare("UPDATE h_outbox SET status='done' WHERE object_id=? AND kind='index_evidence'")
        .run(id);
    });
  }
  private replaceIndex(kind: 'evidence' | 'assertion', id: string, text: string) {
    this.db.prepare(`DELETE FROM h_${kind}_fts WHERE id=?`).run(id);
    this.db.prepare(`INSERT INTO h_${kind}_fts(id,text) VALUES(?,?)`).run(id, text);
    this.db.prepare('DELETE FROM h_grams WHERE kind=? AND object_id=?').run(kind, id);
    const points = Array.from(text.normalize('NFKC').toLowerCase()),
      grams = new Set<string>();
    for (let i = 0; i < points.length - 1; i++)
      if (!/\s/.test(points[i] + points[i + 1])) grams.add(points[i] + points[i + 1]);
    const insert = this.db.prepare('INSERT OR IGNORE INTO h_grams VALUES(?,?,?)');
    for (const gram of grams) insert.run(kind, id, gram);
  }
  assertions(
    handle: ScopeHandle,
    options: { statuses?: string[]; predicate?: string; strength?: string; limit?: number; offset?: number; at?: string; verified?: boolean } = {},
  ): Assertion[] {
    this.scope(handle);
    this.refreshCitationRestrictions();
    if (options.at && !Number.isFinite(Date.parse(options.at))) throw new HarnessError('invalid_time', '检索时间不合法。');
    const f = this.filter(handle),
      e = this.filter(handle, 'e'),
      statuses = options.statuses || ['active'];
    const rows = this.db
      .prepare(
        `SELECT r.* FROM h_assertions r WHERE ${f.sql} AND r.status IN (${placeholders(statuses)})
      ${options.predicate ? 'AND r.predicate=?' : ''}
      ${options.strength ? "AND json_extract(r.payload,'$.strength')=?" : ''}
      ${options.verified ? "AND json_extract(r.payload,'$.verification')='verified'" : ''}
      ${options.at ? 'AND (r.valid_from IS NULL OR julianday(r.valid_from)<=julianday(?)) AND (r.valid_to IS NULL OR julianday(r.valid_to)>julianday(?))' : ''}
      AND NOT EXISTS(SELECT 1 FROM h_assertion_citations ae LEFT JOIN h_evidence e ON e.id=ae.event_id WHERE ae.assertion_id=r.id AND ae.assertion_revision=r.revision AND (e.id IS NULL OR NOT (${e.sql}) OR e.status='deleted'))
      ORDER BY r.revision DESC,r.rowid DESC,r.id LIMIT ? OFFSET ?`,
      )
      .all(
        ...f.params,
        ...statuses,
        ...(options.predicate ? [options.predicate] : []),
        ...(options.strength ? [options.strength] : []),
        ...(options.at ? [options.at, options.at] : []),
        ...e.params,
        Math.min(options.limit || 200, 500),
        Math.max(0, options.offset || 0),
      );
    return rows.map((row) => {
      this.recordAccess(handle, row, 'assertion');
      return parse<Assertion>(row)!;
    });
  }
  assertion(handle: ScopeHandle, id: string): Assertion | undefined {
    this.scope(handle);
    this.refreshCitationRestrictions();
    const f = this.filter(handle),
      e = this.filter(handle, 'e');
    const row = this.db
      .prepare(
        `SELECT r.* FROM h_assertions r WHERE ${f.sql} AND r.id=?
      AND NOT EXISTS(SELECT 1 FROM h_assertion_citations ae LEFT JOIN h_evidence e ON e.id=ae.event_id WHERE ae.assertion_id=r.id AND ae.assertion_revision=r.revision AND (e.id IS NULL OR NOT (${e.sql}) OR e.status='deleted'))`,
      )
      .get(...f.params, id, ...e.params);
    if (row) this.recordAccess(handle, row, 'assertion');
    const value = parse<Assertion>(row);
    return value && this.citationRows(value.id, value.revision).every(citation => this.citationReadable(handle, citation)) ? value : undefined;
  }
  saveAssertion(
    handle: ScopeHandle,
    input: Assertion,
    expectedRevision?: number,
    locators: { eventId: string; start: number; end: number; contentVersion?: number; role?: AssertionCitation['role']; restrictionReceipt?: string }[] = [],
  ) {
    const s = this.scope(handle),
      value = assertionSchema.parse(input);
    if (
      value.ownerId !== s.principalId ||
      value.workspaceId !== s.workspaceId ||
      value.subjectId !== s.subjectId ||
      value.worldId !== s.worldId
    )
      throw new HarnessError('scope_mismatch', '理解的主体或世界不匹配。');
    if (!s.infer || s.retention !== 'purpose_scoped')
      throw new HarnessError('inference_forbidden', '这次资料不用于长期理解。');
    if (this.hasFence(value.id)) throw new HarnessError('deleted_object', '已删除的理解不能恢复。');
    for (const id of value.evidenceIds)
      if (!this.evidence(handle, id))
        throw new HarnessError('evidence_forbidden', '缺少有权使用的原始证据。');
    for (const locator of locators) {
      const source = this.evidence(handle, locator.eventId);
      if (!source || !this.citationReadable(handle, { ...locator, role: locator.role || 'primary',
        contentVersion: locator.contentVersion ?? source.contentVersion }, true))
        throw new HarnessError('citation_forbidden', '引用版本、范围、权限或当前来源限制已变化。');
      if (locator.role !== 'authorization' && !value.evidenceIds.includes(locator.eventId))
        throw new HarnessError('citation_mismatch', '事实引用不在实际支持来源集合中。');
    }
    this.write(() => {
      const old = this.db.prepare('SELECT revision,status FROM h_assertions WHERE id=?').get(value.id);
      if (old && (expectedRevision === undefined || Number(old.revision) !== expectedRevision)) {
        this.conflicts.push({
          objectId: value.id,
          expected: expectedRevision || 0,
          actual: Number(old.revision),
        });
        throw new HarnessError('revision_conflict', '理解已被更新，请重读后合并。');
      }
      if (!old && expectedRevision !== undefined)
        throw new HarnessError('revision_conflict', '原理解已不存在。');
      this.db
        .prepare(
          `INSERT INTO h_assertions VALUES(${Array(21).fill('?').join(',')}) ON CONFLICT(id) DO UPDATE SET
        revision=excluded.revision,predicate=excluded.predicate,kind=excluded.kind,status=excluded.status,strength=excluded.strength,
        valid_from=excluded.valid_from,valid_to=excluded.valid_to,text=excluded.text,payload=excluded.payload,expires_at=excluded.expires_at`,
        )
        .run(
          value.id,
          ...this.envelope(value, 'profile:self'),
          value.revision,
          value.predicate,
          value.kind,
          value.status,
          value.strength,
          value.temporal.validFrom || null,
          value.temporal.validTo || null,
          value.text,
          JSON.stringify(value),
        );
      this.db
        .prepare('INSERT INTO h_assertion_versions VALUES(?,?,?)')
        .run(value.id, value.revision, JSON.stringify(value));
      const previousLocators = old ? this.citationRows(value.id, Number(old.revision)) : [];
      this.db.prepare('DELETE FROM h_assertion_evidence WHERE assertion_id=?').run(value.id);
      for (const id of value.evidenceIds) {
        const selected = locators.filter(locator => locator.eventId === id && locator.role !== 'authorization');
        const citations: AssertionCitation[] = selected.length ? selected.map(locator => ({ ...locator,
          contentVersion: locator.contentVersion ?? this.evidence(handle, id)!.contentVersion, role: locator.role || 'primary' }))
          : previousLocators.filter(locator => locator.eventId === id && locator.role !== 'authorization');
        if (!citations.length) citations.push({ eventId: id, role: value.evidenceIds[0] === id ? 'primary' : 'support' });
        for (const citation of citations) this.storeCitation(value.id, value.revision, citation);
        const single = citations.length === 1 ? citations[0] : undefined;
        this.db
          .prepare('INSERT INTO h_assertion_evidence VALUES(?,?,?,?)')
          .run(
            value.id,
            id,
            single?.start ?? null,
            single?.end ?? null,
          );
      }
      const authorizations = locators.filter(locator => locator.role === 'authorization');
      for (const locator of authorizations.length ? authorizations : previousLocators.filter(locator => locator.role === 'authorization')) {
        if (!this.evidence(handle, locator.eventId)) throw new HarnessError('evidence_forbidden', '保存许可的来源已不可读。');
        this.storeCitation(value.id, value.revision, { ...locator, role: 'authorization' });
      }
      this.replaceIndex('assertion', value.id, value.text);
      this.outbox('assertion_changed', value.id);
      this.transitions.push({
        at: this.clock.now(),
        objectId: value.id,
        from: old ? String(old.status) : undefined,
        to: value.status,
        revision: value.revision,
      });
    });
  }
  operation<T>(id: string): T | undefined {
    const row = this.db.prepare('SELECT result FROM h_operations WHERE id=?').get(id);
    return row ? JSON.parse(String(row.result)) : undefined;
  }
  completeOperation(id: string, kind: string, result: unknown) {
    this.db.prepare('INSERT INTO h_operations VALUES(?,?,?)').run(id, kind, JSON.stringify(result));
  }
  outbox(kind: string, objectId: string) {
    this.db
      .prepare('INSERT INTO h_outbox VALUES(?,?,?,?,?,?)')
      .run(randomUUID(), kind, objectId, this.epoch, 'pending', this.clock.now());
  }
  pending(kind: string) {
    return this.db
      .prepare(
        "SELECT * FROM h_outbox WHERE kind=? AND status='pending' AND epoch=? ORDER BY rowid LIMIT 100",
      )
      .all(kind, this.epoch);
  }
  private workSourceGrant(sourceId: string) {
    return sourceId === 'map:local' ? 'map:read' : sourceId === 'weather:open-meteo' ? 'weather:read'
      : sourceId === 'profile:self' ? 'memory:read' : sourceId.startsWith('campus:') ? 'campus:read' : 'evidence:read';
  }
  private permittedWorkSource(handle: ScopeHandle, ref: WorkSourceRef) {
    const f = this.filter(handle);
    // This is a permission check, not source delivery. In particular, a list's
    // metadata prefilter must not log every candidate as provided to a model.
    const event = parse<EvidenceEvent>(this.db.prepare(`SELECT r.payload FROM h_evidence r WHERE ${f.sql} AND r.id=? AND r.status!='deleted'`)
      .get(...f.params, ref.eventId));
    const scope = this.scope(handle);
    if (!event || event.contentVersion !== ref.contentVersion || event.label.retention !== 'purpose_scoped'
      || !scope.grants.includes('evidence:read') || !scope.grants.includes(this.workSourceGrant(event.sourceId))
      || ref.end > Array.from(event.text).length || !this.availableInferenceRanges(event).some(range => range.start <= ref.start && range.end >= ref.end))
      throw new HarnessError('work_source_unavailable', '事项的原话片段已改变或不在当前可用范围内。');
    return event;
  }
  resolveWorkSourceBinding(handle: ScopeHandle, raw: WorkSourceRef[]): WorkSourceBinding {
    if (!Array.isArray(raw) || !raw.length || raw.length > 32) throw new HarnessError('work_sources_required', '需要明确的事项原话片段。');
    const unique = new Map<string, WorkSourceRef>();
    for (const value of raw) { const ref = workSourceRefSchema.parse(value); unique.set(canonical(ref), ref); }
    const refs = [...unique].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value);
    const events = refs.map(ref => this.permittedWorkSource(handle, ref));
    return { version: 1, refs, sourceIds: [...new Set(events.map(event => event.sourceId))].sort(),
      requiredGrants: [...new Set(['evidence:read', ...events.map(event => this.workSourceGrant(event.sourceId))])].sort() };
  }
  private workBindingReadable(handle: ScopeHandle, raw: unknown) {
    try {
      const binding = workSourceBindingSchema.parse(raw);
      return canonical(binding) === canonical(this.resolveWorkSourceBinding(handle, binding.refs));
    } catch (error) {
      if (error instanceof HarnessError || error instanceof Error && error.name === 'ZodError') return false;
      throw error;
    }
  }
  planningActionReadable(handle: ScopeHandle, actionId: string) {
    const action = this.db.prepare("SELECT json_extract(payload,'$.reason') AS reason FROM h_actions WHERE id=?").get(actionId);
    if (action?.reason === 'planning_source_deleted_details_removed') return false;
    const rows = this.db.prepare(`SELECT a.source_binding,a.redacted FROM h_planning_intent_attempts a
      JOIN h_planning_intent_action_links l ON l.plan_id=a.plan_id WHERE l.action_id=?`).all(actionId);
    if (!rows.length) return true;
    // An actually accepted current calendar object is an independent business
    // record. The exception conveys no authority to retry the old proposal.
    const scope = this.scope(handle);
    if (scope.principalId === scope.subjectId && scope.worldId === 'real' && scope.audience === 'self'
      && scope.sources.includes('local-agenda') && this.confirmedAgendaReferences().some(item => item.actionId === actionId)) return true;
    return rows.every(row => {
      if (Number(row.redacted) !== 0 || typeof row.source_binding !== 'string') return false;
      try { return this.workBindingReadable(handle, JSON.parse(row.source_binding)); }
      catch (error) { if (error instanceof SyntaxError) return false; throw error; }
    });
  }
  /** Metadata-only gate for text derived from a source-bound planning read. */
  planningMessageReadable(handle: ScopeHandle, value: { contextReceipt?: { planningProvenance?: unknown }; scenes?: unknown }) {
    if (value.contextReceipt?.planningProvenance !== undefined && !this.planningMaterialReadable(handle, value.contextReceipt.planningProvenance, { requireCurrentIntent: false })) return false;
    for (const scene of Array.isArray(value.scenes) ? value.scenes : []) {
      if (scene?.kind !== 'planning' || !scene.continuation) continue;
      const continuation = scene.continuation;
      if (!this.planningMaterialReadable(handle, [{ intentId: continuation.intentId, intentRevision: continuation.intentRevision,
        sourceBinding: continuation.sourceBinding, attemptBasis: continuation.attemptBasis }], { requireCurrentIntent: false })) return false;
    }
    return true;
  }
  planningMaterialReadable(handle: ScopeHandle, raw: unknown, options: { requireCurrentIntent?: boolean } = {}) {
    if (!Array.isArray(raw)) return false;
    try {
      const scope = this.scope(handle);
      if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
        || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read')) return raw.length === 0;
      const f = this.filter(handle);
      return raw.every(value => {
        const provenance = planningMaterialProvenanceSchema.parse(value);
        if (new Set(provenance.attemptBasis.map(attempt => attempt.planId)).size !== provenance.attemptBasis.length
          || provenance.attemptBasis.some(attempt => attempt.intentId !== provenance.intentId)) return false;
        const row = this.db.prepare(`SELECT r.revision,r.status,json_extract(r.payload,'$.data.type') AS type,
          json_extract(r.payload,'$.sourceBinding') AS binding FROM h_work r WHERE ${f.sql} AND r.id=?`)
          .get(...f.params, provenance.intentId);
        if (!row || row.type !== 'planning_intent'
          || options.requireCurrentIntent !== false && (Number(row.revision) !== provenance.intentRevision || row.status !== 'active'
            || typeof row.binding !== 'string' || canonical(JSON.parse(row.binding)) !== canonical(provenance.sourceBinding))
          || !this.workBindingReadable(handle, provenance.sourceBinding) || !this.verifyPlanningAttemptBasis) return false;
        this.verifyPlanningAttemptBasis(handle, provenance.intentId, provenance.attemptBasis);
        return true;
      });
    } catch (error) {
      if (error instanceof HarnessError || error instanceof SyntaxError || error instanceof Error && error.name === 'ZodError') return false;
      throw error;
    }
  }
  private planningMaterialFilter(handle: ScopeHandle, alias: string) {
    const scope = this.scope(handle), denied: string[] = [];
    const legacy = `(EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.artifact.scenes') scene
        WHERE json_extract(scene.value,'$.kind')='planning' AND json_type(scene.value,'$.continuation')='object')
      OR EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.material') material
        WHERE json_extract(material.value,'$.tool') IN ('planning.replan','planning_intent')
          OR EXISTS(SELECT 1 FROM json_each(material.value,'$.versions') version JOIN h_work intent
            ON intent.id=json_extract(version.value,'$.id') WHERE json_extract(version.value,'$.kind')='work'
            AND json_extract(intent.payload,'$.data.type')='planning_intent'))
      OR EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.resultRefs') ref JOIN h_work prepared ON prepared.id=ref.value
        JOIN json_each(prepared.payload,'$.data.artifact.scenes') scene
        WHERE json_extract(scene.value,'$.kind')='planning' AND json_type(scene.value,'$.continuation')='object'))`;
    const rows = this.db.prepare(`SELECT r.id,json_extract(r.payload,'$.data.planningProvenance') AS provenance,
      json_extract(r.payload,'$.data.materialPlanningContractVersion') AS contract
      FROM h_work r WHERE r.owner=? AND r.workspace=? AND (json_type(r.payload,'$.data.planningProvenance') IS NOT NULL OR ${legacy})`)
      .all(scope.principalId, scope.workspaceId);
    for (const row of rows) {
      try {
        if (Number(row.contract) !== 1 || typeof row.provenance !== 'string' || !this.planningMaterialReadable(handle, JSON.parse(row.provenance)))
          denied.push(String(row.id));
      } catch (error) { if (error instanceof SyntaxError) denied.push(String(row.id)); else throw error; }
    }
    return { sql: `${alias}.id NOT IN (SELECT value FROM json_each(?))`, params: [JSON.stringify(denied)] };
  }
  /** Candidate metadata only; the returned SQL gate applies before matching,
   * counting or paging any protected title/specification. */
  private workSourceFilter(handle: ScopeHandle, alias = 'r') {
    const scope = this.scope(handle), allowed: string[] = [], planning = this.planningMaterialFilter(handle, alias);
    for (const row of this.db.prepare(`SELECT id,json_extract(payload,'$.sourceBinding') AS binding FROM h_work
      WHERE owner=? AND workspace=? AND json_type(payload,'$.sourceBinding') IS NOT NULL`).all(scope.principalId, scope.workspaceId)) {
      try { if (this.workBindingReadable(handle, JSON.parse(String(row.binding)))) allowed.push(String(row.id)); }
      catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    return { sql: `((json_type(${alias}.payload,'$.sourceBinding') IS NULL AND COALESCE(json_extract(${alias}.payload,'$.data.type'),'')!='planning_intent')
      OR ${alias}.id IN (SELECT value FROM json_each(?))) AND ${planning.sql}`, params: [JSON.stringify(allowed), ...planning.params] };
  }
  readWorkSources(handle: ScopeHandle, record: WorkRecord) {
    const current = this.work(handle, undefined, record.id)[0];
    if (!current || current.revision !== record.revision || !current.sourceBinding || canonical(current.sourceBinding) !== canonical(record.sourceBinding))
      throw new HarnessError('revision_conflict', '事项或原话范围已变化，请重新读取。');
    return current.sourceBinding.refs.map(ref => {
      const event = this.permittedWorkSource(handle, ref);
      this.recordAccess(handle, { id: event.id, source: event.sourceId }, 'work_source_fragment');
      return { ...ref, sourceId: event.sourceId, text: codePointSlice(event.text, ref.start, ref.end) };
    });
  }
  exportWorkingRecords(handle: ScopeHandle) {
    const scope = this.scope(handle), bindings = this.workSourceFilter(handle), sources = this.helpSourceFilter(handle);
    return this.db.prepare(`SELECT r.payload FROM h_work r WHERE r.owner=? AND r.workspace=?
      AND r.retain!='session_only' AND r.sensitivity!='restricted' AND ${bindings.sql} AND ${sources.sql}`)
      .all(scope.principalId, scope.workspaceId, ...bindings.params, ...sources.params).map(row => parse<WorkRecord>(row)!);
  }
  exportWorkingState(handle: ScopeHandle) {
    const work = this.exportWorkingRecords(handle), ids = JSON.stringify(work.filter(record => record.data.type === 'planning_intent').map(record => record.id));
    const metadata = this.db.prepare('SELECT plan_id,source_binding,redacted FROM h_planning_intent_attempts WHERE intent_id IN (SELECT value FROM json_each(?))').all(ids);
    const permittedPlans = metadata.filter(row => {
      if (Number(row.redacted) !== 0 || typeof row.source_binding !== 'string') return false;
      try { return this.workBindingReadable(handle, JSON.parse(row.source_binding)); }
      catch (error) { if (error instanceof SyntaxError) return false; throw error; }
    }).map(row => String(row.plan_id));
    const attempts = this.db.prepare('SELECT * FROM h_planning_intent_attempts WHERE plan_id IN (SELECT value FROM json_each(?))').all(JSON.stringify(permittedPlans));
    const planIds = JSON.stringify(attempts.map(row => String(row.plan_id)));
    const links = this.db.prepare('SELECT * FROM h_planning_intent_action_links WHERE plan_id IN (SELECT value FROM json_each(?))').all(planIds);
    const scope = this.scope(handle), actionIds = JSON.stringify([...new Set(links.map(row => String(row.action_id)))]);
    const permittedActions = JSON.stringify(this.db.prepare(`SELECT id FROM h_actions WHERE owner=? AND workspace=? AND id IN (SELECT value FROM json_each(?))`)
      .all(scope.principalId, scope.workspaceId, actionIds).map(row => String(row.id)).filter(id => this.planningActionReadable(handle, id)));
    return { work, planningIntentState: { version: 1,
      attempts: attempts.map(row => ({ planId: row.plan_id, intentId: row.intent_id, specDigest: row.spec_digest, manifest: JSON.parse(String(row.manifest)), sourceBinding: JSON.parse(String(row.source_binding)), createdAt: row.created_at })),
      actionLinks: links.map(row => ({ planId: row.plan_id, blockId: row.block_id, actionId: row.action_id, actionRevision: row.action_revision, actionDigest: row.action_digest })),
      actionAttempts: this.db.prepare('SELECT id,action_id AS actionId,idempotency_key AS idempotencyKey,status FROM h_attempts WHERE action_id IN (SELECT value FROM json_each(?))').all(permittedActions),
      receipts: this.db.prepare('SELECT payload FROM h_receipts WHERE action_id IN (SELECT value FROM json_each(?))').all(permittedActions).map(row => JSON.parse(String(row.payload))),
      evidenceCoverage: metadata.length === attempts.length ? 'available' : 'unavailable', restoresAuthorization: false,
    } };
  }
  sourcedWorkMetadata(handle: ScopeHandle, id: string) {
    const scope = this.scope(handle);
    if (scope.child || scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.grants.includes('work:write'))
      throw new HarnessError('work_control_forbidden', '当前范围不能管理这份持续事项。');
    const f = this.filter(handle);
    const row = this.db.prepare(`SELECT r.id,r.revision,r.status,r.kind,json_extract(r.payload,'$.data.type') AS type
      FROM h_work r WHERE ${f.sql} AND r.id=? AND json_type(r.payload,'$.sourceBinding')='object'`).get(...f.params, id);
    if (!row || this.hasFence(id)) return;
    return { id: String(row.id), revision: Number(row.revision), status: String(row.status), kind: String(row.kind), type: String(row.type) };
  }
  /** Stopping a known business intention does not require disclosing its old
   * specification. This path cannot resume it or replace any source binding. */
  transitionSourcedWork(handle: ScopeHandle, input: { id: string; expectedRevision: number; status: 'paused' | 'retired';
    transition: { operation: 'pause' | 'retire'; source: WorkSourceRef; at?: string; quoteSha256?: string } }) {
    return this.write(() => {
      const old = this.sourcedWorkMetadata(handle, input.id), scope = this.scope(handle), ref = workSourceRefSchema.parse(input.transition.source);
      if (!old || old.type !== 'planning_intent') throw new HarnessError('work_missing', '这份持续事项不存在或不可管理。');
      if (old.revision !== input.expectedRevision) throw new HarnessError('revision_conflict', '事项已变化，请按当前状态停止。');
      if (input.status === 'paused' ? input.transition.operation !== 'pause' || old.status !== 'active'
        : input.status !== 'retired' || input.transition.operation !== 'retire' || !['active', 'paused'].includes(old.status))
        throw new HarnessError('planning_intent_state', '当前状态不适用这项停止变更。');
      const source = this.permittedWorkSource(handle, ref);
      if (!scope.currentEventIds.includes(source.id) || source.speaker !== 'user' || source.ownerId !== scope.principalId
        || source.subjectId !== scope.principalId || source.worldId !== 'real')
        throw new HarnessError('work_control_source', '停止事项需要本轮本人的明确原话。');
      const now = this.clock.now(), revision = old.revision + 1;
      const transition = { operation: input.transition.operation, source: ref, at: now,
        quoteSha256: createHash('sha256').update(codePointSlice(source.text, ref.start, ref.end)).digest('hex') };
      this.db.prepare(`UPDATE h_work SET status=?,revision=?,payload=json_set(payload,'$.status',?,'$.revision',?,
        '$.data.updatedAt',?,'$.data.lastTransition',json(?)) WHERE id=? AND revision=?`)
        .run(input.status, revision, input.status, revision, now, JSON.stringify(transition), old.id, old.revision);
      this.outbox('work_changed', old.id);
      return { id: old.id, revision, status: input.status };
    });
  }
  saveSourcedWork(handle: ScopeHandle, input: WorkRecord, expectedRevision?: number) {
    return this.write(() => {
      if (!this.scope(handle).grants.includes('work:write') || !input.sourceBinding || input.label.retention !== 'purpose_scoped')
        throw new HarnessError('work_sources_required', '当前不能保存有依据的持续事项。');
      const binding = this.resolveWorkSourceBinding(handle, input.sourceBinding.refs);
      if (canonical(binding) !== canonical(input.sourceBinding)
        || canonical([...new Set(input.evidenceIds)].sort()) !== canonical([...new Set(binding.refs.map(ref => ref.eventId))].sort()))
        throw new HarnessError('work_sources_changed', '事项支持集合与实际原话不一致。');
      return this.writeWork(handle, input, expectedRevision, true);
    });
  }
  saveWork(handle: ScopeHandle, input: WorkRecord, expectedRevision?: number) {
    return this.writeWork(handle, input, expectedRevision, false);
  }
  private writeWork(handle: ScopeHandle, input: WorkRecord, expectedRevision: number | undefined, sourced: boolean) {
    const s = this.scope(handle),
      work = workSchema.parse(input);
    if (
      work.ownerId !== s.principalId ||
      work.workspaceId !== s.workspaceId ||
      work.subjectId !== s.subjectId ||
      work.worldId !== s.worldId ||
      s.retention === 'session_only'
    )
      throw new HarnessError('scope_mismatch', '不能保存此事项。');
    for (const id of work.evidenceIds)
      if (!this.evidence(handle, id)) throw new HarnessError('evidence_forbidden', '事项证据不可用。');
    if (this.hasFence(work.id)) throw new HarnessError('deleted_object', '此事项已删除。');
    this.write(() => {
      const old = this.db.prepare('SELECT revision,payload FROM h_work WHERE id=?').get(work.id);
      if (!sourced && (work.sourceBinding || work.data.type === 'planning_intent' || parse<WorkRecord>(old)?.sourceBinding))
        throw new HarnessError('typed_work_writer_required', '这项持续规格需要按原话和当前版本修改，不能直接合并旧数据。');
      if (old && Number(old.revision) !== expectedRevision) {
        this.conflicts.push({
          objectId: work.id,
          expected: expectedRevision || 0,
          actual: Number(old.revision),
        });
        throw new HarnessError('revision_conflict', '事项已更新，请重读后修改。');
      }
      this.db
        .prepare(
          `INSERT INTO h_work VALUES(${Array(17).fill('?').join(',')}) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,status=excluded.status,title=excluded.title,payload=excluded.payload`,
        )
        .run(
          work.id,
          ...this.envelope(work, 'work:self'),
          work.kind,
          work.revision,
          work.status,
          work.title,
          JSON.stringify(work),
        );
      this.outbox('work_changed', work.id);
    });
  }
  /** Prepared bodies carry the sources actually read, independently of the
   * user's mandate. Legacy material is readable only when each source can be
   * established from its stored receipt; a broad captured scope is no proof. */
  private helpSourceFilter(handle: ScopeHandle) {
    const scope = this.scope(handle);
    const allowed = JSON.stringify(scope.sources.filter(source => scope.grants.includes(source === 'map:local' ? 'map:read'
      : source === 'weather:open-meteo' ? 'weather:read' : source === 'profile:self' ? 'memory:read' : source.startsWith('campus:') ? 'campus:read' : 'evidence:read')));
    return { sql: `(COALESCE(json_extract(r.payload,'$.data.type'),'') NOT IN ('help_opportunity','cooperation_record') OR (
      (json_type(r.payload,'$.data.sourceIds') IS NULL OR json_type(r.payload,'$.data.sourceIds')='array')
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.sourceIds') src WHERE src.type!='text' OR src.value NOT IN (SELECT value FROM json_each(?)))
      AND (json_type(r.payload,'$.data.requiredGrants') IS NULL OR json_type(r.payload,'$.data.requiredGrants')='array')
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.requiredGrants') permission WHERE permission.type!='text' OR permission.value NOT IN (SELECT value FROM json_each(?)))
      AND ((NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.sourceIds') src WHERE src.value LIKE 'campus:%')
        AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.material') material WHERE json_extract(material.value,'$.sourceId') LIKE 'campus:%'
          OR EXISTS(SELECT 1 FROM json_each(material.value,'$.sourceIds') src WHERE src.value LIKE 'campus:%')
          OR EXISTS(SELECT 1 FROM json_each(material.value,'$.versions') version WHERE json_extract(version.value,'$.sourceId') LIKE 'campus:%'))
        AND NOT EXISTS(SELECT 1 FROM h_evidence evidence WHERE evidence.id IN (SELECT value FROM json_each(r.payload,'$.evidenceIds'))
          AND evidence.source LIKE 'campus:%' AND json_extract(evidence.payload,'$.speaker')='external'))
        OR (json_extract(r.payload,'$.data.materialGrantContractVersion')=1 AND json_type(r.payload,'$.data.requiredGrants')='array'
          AND EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.requiredGrants') permission WHERE permission.value='campus:read')))
      AND (((json_type(r.payload,'$.data.artifact') IS NULL OR json_type(r.payload,'$.data.artifact')='null')
          AND (json_type(r.payload,'$.data.material') IS NULL OR json_type(r.payload,'$.data.material')='null' OR (json_type(r.payload,'$.data.material')='array' AND json_array_length(r.payload,'$.data.material')=0)))
        OR (json_extract(r.payload,'$.data.materialSourceContractVersion')=1 AND json_type(r.payload,'$.data.sourceIds')='array' AND json_array_length(r.payload,'$.data.sourceIds')>0)
        OR (json_type(r.payload,'$.data.material')='array' AND json_array_length(r.payload,'$.data.material')>0
          AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.material') material WHERE NOT CASE
            WHEN json_type(material.value,'$.noteId')='text' OR json_extract(material.value,'$.tool')='manage_note'
              THEN 'notes:self' IN (SELECT value FROM json_each(?))
            WHEN json_type(material.value,'$.evidenceId')='text'
              THEN EXISTS(SELECT 1 FROM json_each(r.payload,'$.evidenceIds') ref WHERE ref.value=json_extract(material.value,'$.evidenceId'))
            ELSE COALESCE(json_type(material.value,'$.sourceId')='text' AND json_extract(material.value,'$.sourceId')!='current'
              AND json_extract(material.value,'$.sourceId') IN (SELECT value FROM json_each(?)),0) END))
      )))`, params: [allowed, JSON.stringify(scope.grants), allowed, allowed] };
  }
  work(handle: ScopeHandle, kind?: WorkRecord['kind'], id?: string): WorkRecord[] {
    const f = this.filter(handle),
      e = this.filter(handle, 'e'), sources = this.helpSourceFilter(handle), bindings = this.workSourceFilter(handle);
    const rows = this.db
      .prepare(
        `SELECT r.* FROM h_work r WHERE ${f.sql} ${kind ? 'AND r.kind=?' : ''} ${id ? 'AND r.id=?' : ''} AND ${sources.sql} AND ${bindings.sql}
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.evidenceIds') ref WHERE NOT EXISTS(SELECT 1 FROM h_evidence e WHERE e.id=ref.value AND ${e.sql} AND e.status!='deleted'))
      ORDER BY r.rowid DESC LIMIT 200`,
      )
      .all(...f.params, ...(kind ? [kind] : []), ...(id ? [id] : []), ...sources.params, ...bindings.params, ...e.params);
    return rows.map((r) => parse<WorkRecord>(r)!);
  }
  /** Bounded typed working records, with the same SQL-before-body scope and
   * source checks as ordinary work. No parallel personal information store. */
  workData(handle: ScopeHandle, types: string[], options: { id?: string; revision?: number; matterId?: string; sessionId?: string; statuses?: string[]; limit?: number; offset?: number; query?: string; respectSourceBindings?: boolean } = {}) {
    const limit = options.limit || 20, offset = options.offset || 0;
    if (!types.length || types.length > 12 || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0)
      throw new HarnessError('invalid_page', '工作记录的读取范围无效。');
    if (options.query !== undefined && (typeof options.query !== 'string' || options.query.length > 300)) throw new HarnessError('invalid_query', '事项检索范围无效。');
    const terms = [...new Set((options.query || '').normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean))];
    if (terms.length > 16) throw new HarnessError('invalid_query', '检索词过多，请缩小查询。');
    const f = this.filter(handle), e = this.filter(handle, 'e'), sources = this.helpSourceFilter(handle), bindings = this.workSourceFilter(handle);
    const rows = this.db.prepare(`SELECT r.* FROM h_work r WHERE ${f.sql}
      AND ${sources.sql} AND ${bindings.sql}
      AND json_extract(r.payload,'$.data.type') IN (SELECT value FROM json_each(?))
      ${options.id ? 'AND r.id=?' : ''}
      ${options.revision !== undefined ? 'AND r.revision=?' : ''}
      ${options.matterId ? "AND json_extract(r.payload,'$.data.matterId')=?" : ''}
      ${options.sessionId ? `AND (json_extract(r.payload,'$.data.sessionId')=? OR (
        json_extract(r.payload,'$.data.type')='planning_intent' AND json_type(r.payload,'$.data.sessionIds')='array'
        AND EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.sessionIds') membership WHERE membership.type='text' AND membership.value=?)))` : ''}
      ${options.statuses ? 'AND r.status IN (SELECT value FROM json_each(?))' : ''}
      ${options.respectSourceBindings ? "AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.sourceIds') src WHERE src.value NOT IN (SELECT value FROM json_each(?)))" : ''}
      ${terms.length ? 'AND (' + terms.map(() => "instr(lower(r.title || ' ' || r.payload),?)>0").join(' OR ') + ')' : ''}
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.evidenceIds') ref WHERE NOT EXISTS(SELECT 1 FROM h_evidence e WHERE e.id=ref.value AND ${e.sql} AND e.status!='deleted'))
      ORDER BY r.rowid DESC LIMIT ? OFFSET ?`).all(...f.params, ...sources.params, ...bindings.params, JSON.stringify(types), ...(options.id ? [options.id] : []), ...(options.revision !== undefined ? [options.revision] : []), ...(options.matterId ? [options.matterId] : []), ...(options.sessionId ? [options.sessionId, options.sessionId] : []), ...(options.statuses ? [JSON.stringify(options.statuses)] : []), ...(options.respectSourceBindings ? [JSON.stringify(this.scope(handle).sources)] : []), ...terms, ...e.params, limit, offset);
    for (const row of rows) this.recordAccess(handle, row, 'working_record');
    return rows.map(row => parse<WorkRecord>(row)!);
  }
  /** Only sync proposals for exact, currently readable own working records.
   * Metadata has no independent owner label, so scope is enforced on the work
   * and its evidence before any proposal body is returned. */
  pendingSyncForWork(handle: ScopeHandle, objectIds: string[], offset = 0, limit = 8) {
    const scope = this.scope(handle);
    if (scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
      || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read')) return { items: [], nextOffset: null };
    if (objectIds.length > 24 || objectIds.some(id => typeof id !== 'string' || !id || id.length > 160)
      || !Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new HarnessError('invalid_page', '同步修改的读取范围无效。');
    const selectedIds = [...new Set(objectIds)].filter(id => !this.hasFence(id));
    if (!selectedIds.length) return { items: [], nextOffset: null };
    const f = this.filter(handle, 'w'), e = this.filter(handle, 'e'), bindings = this.workSourceFilter(handle, 'w');
    const permittedSources = JSON.stringify(scope.sources.filter(source => source !== 'current'));
    const rows = this.db.prepare(`SELECT s.*,w.source,w.title,w.revision AS current_revision,w.payload AS current_payload
      FROM h_sync_operations s JOIN h_work w ON w.id=s.object_id WHERE ${f.sql} AND ${bindings.sql}
      AND json_type(w.payload,'$.sourceBinding') IS NULL AND COALESCE(json_extract(w.payload,'$.data.type'),'')!='planning_intent'
      AND w.id IN (SELECT value FROM json_each(?)) AND s.epoch=?
      AND ((s.status='pending' AND s.base_revision=w.revision)
        OR (s.status='rejected' AND json_extract(s.result,'$.code')='revision_conflict'
          AND json_extract(s.result,'$.currentRevision')=w.revision))
      AND (json_type(w.payload,'$.data.sourceIds') IS NULL OR json_type(w.payload,'$.data.sourceIds')='array')
      AND NOT EXISTS(SELECT 1 FROM json_each(w.payload,'$.data.sourceIds') src WHERE src.type!='text' OR src.value NOT IN (SELECT value FROM json_each(?)))
      AND (json_type(s.result,'$.proposed.data.sourceIds') IS NULL OR json_type(s.result,'$.proposed.data.sourceIds')='array')
      AND NOT EXISTS(SELECT 1 FROM json_each(s.result,'$.proposed.data.sourceIds') src WHERE src.type!='text' OR src.value NOT IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM json_each(w.payload,'$.evidenceIds') ref WHERE NOT EXISTS
        (SELECT 1 FROM h_evidence e WHERE e.id=ref.value AND ${e.sql} AND e.status!='deleted'))
      ORDER BY s.rowid DESC LIMIT ? OFFSET ?`).all(...f.params, ...bindings.params, JSON.stringify(selectedIds), this.epoch,
        permittedSources, permittedSources, ...e.params, limit + 1, offset);
    const items = rows.slice(0, limit).map(row => {
      const result = JSON.parse(String(row.result)), work = JSON.parse(String(row.current_payload)) as WorkRecord;
      const delta = result.proposed || {}, changes: { field: string; proposed: unknown; current: unknown }[] = [];
      for (const field of ['title', 'status']) if (Object.hasOwn(delta, field)) changes.push({ field, proposed: delta[field], current: work[field as 'title' | 'status'] });
      if (delta.data && typeof delta.data === 'object') for (const [field, value] of Object.entries(delta.data))
        changes.push({ field: 'data.' + field, proposed: value, current: work.data[field] ?? null });
      this.recordAccess(handle, { id: work.id, source: row.source }, 'sync_proposal');
      return { objectId: work.id, operationId: String(row.operation_id), deviceId: String(row.device_id),
        state: row.status === 'pending' ? 'not_synced' : 'revision_conflict', expectedRevision: Number(row.base_revision),
        currentRevision: work.revision, createdAt: result.createdAt || null, changes,
        authoritativeObjectChanged: false, requiresUserChoice: row.status === 'rejected' };
    });
    return { items, nextOffset: rows.length > limit ? offset + limit : null };
  }
  relatedWorkPage(handle: ScopeHandle, parentIds: string[], offset = 0, limit = 8) {
    if (!parentIds.length) return { items: [] as WorkRecord[], total: 0, nextOffset: null as number | null };
    if (parentIds.length > 20 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 20) throw new HarnessError('invalid_page', '关联事项的读取范围无效。');
    const f = this.filter(handle), e = this.filter(handle, 'e'), bindings = this.workSourceFilter(handle);
    const scoped = `WITH related AS MATERIALIZED(SELECT r.*,r.rowid AS work_order FROM h_work r WHERE ${f.sql} AND ${bindings.sql}
      AND COALESCE(json_extract(r.payload,'$.data.type'),'')!='planning_intent'
      AND (json_extract(r.payload,'$.data.matterId') IN (SELECT value FROM json_each(?)) OR json_extract(r.payload,'$.data.episodeId') IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.sourceIds') src WHERE src.value NOT IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.evidenceIds') ref WHERE NOT EXISTS(SELECT 1 FROM h_evidence e WHERE e.id=ref.value AND ${e.sql} AND e.status!='deleted')))`;
    const params = [...f.params, ...bindings.params, JSON.stringify(parentIds), JSON.stringify(parentIds), JSON.stringify(this.scope(handle).sources), ...e.params];
    const total = Number(this.db.prepare(`${scoped} SELECT count(*) AS total FROM related`).get(...params)?.total || 0);
    const rows = this.db.prepare(`${scoped} SELECT * FROM related ORDER BY work_order DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    for (const row of rows) this.recordAccess(handle, row, 'related_work');
    return { items: rows.map(row => parse<WorkRecord>(row)!), total, nextOffset: offset + rows.length < total ? offset + rows.length : null };
  }
  assistantHistory(handle: ScopeHandle, options: { id?: string; query?: string; limit?: number }) {
    const scope = this.scope(handle);
    if (scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real' || !scope.sources.includes('history:self') || !scope.grants.includes('evidence:read')) return [];
    const rows = this.db.prepare(`WITH permitted AS MATERIALIZED(
      SELECT m.* FROM messages m WHERE m.role='assistant' AND json_extract(m.payload,'$.status')='done'
      AND EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id AND e.owner=? AND e.workspace=? AND e.subject=? AND e.world='real' AND e.status!='deleted')
      AND NOT EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id AND (e.owner!=? OR e.workspace!=?))
      AND NOT EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(m.payload,'$.contextReceipt.providedSourceIds'),'["history:self"]')) src WHERE src.value NOT IN (SELECT value FROM json_each(?)))
    ) SELECT id,session_id,content,created_at FROM permitted WHERE ${options.id ? 'id=?' : "instr(lower(content),lower(?))>0"} ORDER BY created_at DESC LIMIT ?`).all(scope.principalId, scope.workspaceId, scope.principalId, scope.principalId, scope.workspaceId, JSON.stringify(scope.sources), options.id || options.query || '', Math.max(1, Math.min(options.limit || 8, 12)));
    for (const row of rows) this.access.push({ principalId: scope.principalId, scopeId: handle.id, purposes: scope.purposes, source: 'history:self', objectId: String(row.id), kind: 'assistant_original' });
    return rows.map(row => ({ id: String(row.id), sessionId: String(row.session_id), text: String(row.content), createdAt: String(row.created_at), authority: 'assistant_history_not_user_fact' }));
  }
  collaborationPage(handle: ScopeHandle, sessionId: string, query = '', offset = 0, limit = 8) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new HarnessError('invalid_page', '事项分页范围不合法。');
    const terms = [...new Set(query.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean))];
    if (terms.length > 16) throw new HarnessError('invalid_query', '检索词过多，请缩小查询。');
    const f = this.filter(handle), e = this.filter(handle, 'e'), bindings = this.workSourceFilter(handle);
    const permitted = `WITH permitted AS MATERIALIZED(
      SELECT r.*,r.rowid AS work_order FROM h_work r WHERE ${f.sql} AND ${bindings.sql}
      AND COALESCE(json_extract(r.payload,'$.data.type'),'')!='planning_intent'
      AND (json_extract(r.payload,'$.data.type') IN ('collaboration_frame','request_item') OR r.kind IN ('goal','plan','commitment'))
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.evidenceIds') ref WHERE NOT EXISTS(SELECT 1 FROM h_evidence e WHERE e.id=ref.value AND ${e.sql} AND e.status!='deleted'))
      ${terms.length ? '' : "AND (json_extract(r.payload,'$.data.sessionId')=? OR EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.sessionIds') s WHERE s.value=?))"}
    ), matching AS (SELECT * FROM permitted r ${terms.length ? 'WHERE ' + terms.map(() => "instr(lower(r.title || ' ' || r.payload),?)>0").join(' OR ') : ''})`;
    const params = [...f.params, ...bindings.params, ...e.params, ...(terms.length ? terms : [sessionId, sessionId])];
    const total = Number(this.db.prepare(`${permitted} SELECT count(*) AS total FROM matching`).get(...params)?.total || 0);
    const rows = this.db.prepare(`${permitted} SELECT * FROM matching ORDER BY work_order DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    for (const row of rows) this.recordAccess(handle, row, 'collaboration_restore');
    return { items: rows.map(row => parse<WorkRecord>(row)!), total, nextOffset: offset + rows.length < total ? offset + rows.length : null };
  }
  requestItems(handle: ScopeHandle, sessionId: string, openOnly = false): WorkRecord[] {
    const f = this.filter(handle), e = this.filter(handle, 'e'), bindings = this.workSourceFilter(handle);
    const rows = this.db.prepare(`SELECT r.* FROM h_work r WHERE ${f.sql} AND ${bindings.sql} AND r.kind='task'
      AND json_extract(r.payload,'$.data.type')='request_item'
      AND (json_extract(r.payload,'$.data.sessionId')=? OR EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.sessionIds') s WHERE s.value=?))
      ${openOnly ? "AND json_extract(r.payload,'$.data.state') NOT IN ('answered','succeeded','withdrawn','unfulfilled')" : ''}
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.evidenceIds') ref WHERE NOT EXISTS(SELECT 1 FROM h_evidence e WHERE e.id=ref.value AND ${e.sql} AND e.status!='deleted'))
      ORDER BY r.rowid DESC LIMIT 200`).all(...f.params, ...bindings.params, sessionId, sessionId, ...e.params);
    for (const row of rows) this.recordAccess(handle, row, 'current_requests');
    return rows.map(row => parse<WorkRecord>(row)!);
  }

  /**
   * Scoped episode projection for conversation-frame recovery.  Keeping this
   * on the repository makes the scope/deletion fence rules identical to all
   * other work reads; callers never need a second profile or user database.
   */
  conversationFrames(
    handle: ScopeHandle,
    options: { sessionId?: string; anchorKey?: string; includeClosed?: boolean; limit?: number } = {},
  ): WorkRecord[] {
    const records = this.work(handle, 'episode').filter((episode) => {
      if (!options.includeClosed && ['closed', 'cancelled', 'stale', 'blocked'].includes(episode.status))
        return false;
      if (options.sessionId) {
        const sessions = Array.isArray(episode.data.sessionIds)
          ? (episode.data.sessionIds as string[])
          : typeof episode.data.sessionId === 'string'
            ? [episode.data.sessionId]
            : [];
        if (!sessions.includes(options.sessionId)) return false;
      }
      if (options.anchorKey && episode.data.anchorKey !== options.anchorKey) return false;
      return true;
    });
    return records
      .sort((a, b) => Number(b.data.focusSequence || 0) - Number(a.data.focusSequence || 0))
      .slice(0, Math.min(options.limit || 32, 100));
  }
  currentMatter(handle: ScopeHandle, sessionId: string) {
    const f = this.filter(handle), e = this.filter(handle, 'e'), bindings = this.workSourceFilter(handle);
    const row = this.db.prepare(`SELECT r.id,r.title,r.revision,r.status,r.payload,json_extract(r.payload,'$.data.question') AS question,json_extract(r.payload,'$.data.nextStep') AS next_step,json_extract(r.payload,'$.data.updatedAt') AS updated_at
      FROM h_work r WHERE ${f.sql} AND ${bindings.sql} AND r.kind='episode' AND r.status='active'
      AND (json_extract(r.payload,'$.data.sessionId')=? OR EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.sessionIds') s WHERE s.value=?))
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.evidenceIds') ref WHERE NOT EXISTS(SELECT 1 FROM h_evidence e WHERE e.id=ref.value AND ${e.sql} AND e.status!='deleted'))
      ORDER BY r.rowid DESC LIMIT 1`).get(...f.params, ...bindings.params, sessionId, sessionId, ...e.params);
    if (!row) return null;
    this.recordAccess(handle, { ...row, source: 'work:self' }, 'current_matter');
    const frame = parse<WorkRecord>(row);
    const optionIds = Array.isArray(frame?.data.optionIds) ? frame.data.optionIds.slice(0, 8) : [];
    const optionPlaces = optionIds.flatMap(id => typeof id === 'string' ? this.work(handle, undefined, id) : [])
      .filter(option => option.data.type !== 'planning_intent' && option.data.episodeId === row.id && ['option', 'plan'].includes(option.kind)
        && !['rejected', 'blocked', 'stale', 'cancelled'].includes(option.status) && typeof option.data.placeId === 'string')
      .map(option => ({ id: option.id, title: option.title, placeId: String(option.data.placeId), revision: option.revision }));
    return { id: String(row.id), title: String(row.title), revision: Number(row.revision), question: row.question || null, nextStep: row.next_step || null, updatedAt: row.updated_at || null,
      optionPlaces, optionPlacesMeaning: '这些是当前事项中已记录的候选地点ID与版本，不证明用户或他人现在位于其中任何地点；具体路线和入口仍需实际查询。',
      meaning: '这是未结束事项的有界索引，不是完整内容。需要完整决定、条件与原文时用restore_collaboration读取；不适用时忽略，当前原话优先。' };
  }
  addDependency(handle: ScopeHandle, d: Dependency) {
    this.scope(handle);
    const cycle = this.db
      .prepare(
        `WITH RECURSIVE chain(id) AS (SELECT ? UNION SELECT producer_id FROM h_dependencies JOIN chain ON consumer_id=chain.id) SELECT id FROM chain WHERE id=?`,
      )
      .get(d.producerId, d.consumerId);
    if (cycle) throw new HarnessError('dependency_cycle', '依赖关系形成循环。');
    this.db
      .prepare(
        'INSERT INTO h_dependencies VALUES(?,?,?,?,?) ON CONFLICT(consumer_id,producer_id) DO UPDATE SET producer_revision=excluded.producer_revision,sensitivity=excluded.sensitivity,invalidation=excluded.invalidation',
      )
      .run(d.consumerId, d.producerId, d.producerRevision, d.sensitivity, d.invalidation);
  }
  dependencies(consumerId: string): Dependency[] {
    return this.db
      .prepare(
        'SELECT consumer_id AS consumerId,producer_id AS producerId,producer_revision AS producerRevision,sensitivity,invalidation FROM h_dependencies WHERE consumer_id=?',
      )
      .all(consumerId) as unknown as Dependency[];
  }
  invalidate(producerId: string, reason = 'dependency_changed', preserved: ReadonlySet<string> = new Set()): string[] {
    return this.write(() => {
      const affected: string[] = [],
        queue = [producerId],
        seen = new Set<string>();
      while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        if (seen.size > 2000) throw new HarnessError('dependency_budget', '依赖展开超出上限，暂停本轮更新。');
        for (const row of this.db.prepare('SELECT * FROM h_dependencies WHERE producer_id=?').all(id)) {
          const consumer = String(row.consumer_id);
          if (preserved.has(consumer)) continue;
          affected.push(consumer);
          queue.push(consumer);
          const world = parse<any>(this.db.prepare('SELECT payload FROM h_worlds WHERE id=?').get(consumer));
          if (world) {
            world.status = 'stale';
            world.invalidationReason = reason;
            this.db
              .prepare("UPDATE h_worlds SET status='stale',payload=? WHERE id=?")
              .run(JSON.stringify(world), consumer);
          }
          const work = parse<WorkRecord>(
            this.db.prepare('SELECT payload FROM h_work WHERE id=?').get(consumer),
          );
          if (work) {
            work.status = row.invalidation === 'block' ? 'blocked' : 'stale';
            work.revision++;
            work.data = { ...work.data, invalidationReason: reason };
            this.db
              .prepare('UPDATE h_work SET status=?,revision=?,payload=? WHERE id=?')
              .run(work.status, work.revision, JSON.stringify(work), consumer);
          }
          const action = parse<any>(
            this.db.prepare('SELECT payload FROM h_actions WHERE id=?').get(consumer),
          );
          if (action) {
            action.status = ['dispatching', 'outcome_unknown', 'reconciling', 'succeeded'].includes(
              action.status,
            )
              ? 'cancel_requested'
              : 'cancelled';
            action.reason = reason;
            this.db
              .prepare('UPDATE h_actions SET status=?,payload=? WHERE id=?')
              .run(action.status, JSON.stringify(action), consumer);
          }
          this.db
            .prepare(
              "UPDATE h_jobs SET status='cancelled',fence=fence+1,lease_until=NULL WHERE object_id=? OR id=?",
            )
            .run(consumer, consumer);
          this.db.prepare('DELETE FROM h_runs WHERE id=?').run(consumer);
        }
      }
      return [...new Set(affected)];
    });
  }
  saveReceipt(handle: ScopeHandle, receipt: ContextReceipt) {
    const s = this.scope(handle);
    if (s.retention === 'session_only') return;
    this.write(() =>
      this.db
        .prepare(
          'INSERT INTO h_runs VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,epoch=excluded.epoch',
        )
        .run(receipt.runId, s.principalId, s.workspaceId, this.epoch, JSON.stringify(receipt)),
    );
  }
  fences(): PrivacyFence[] {
    return this.db
      .prepare('SELECT payload FROM h_fences ORDER BY epoch')
      .all()
      .map((r) => parse<PrivacyFence>(r)!);
  }
  confirmedAgendaReferences(): NonNullable<PrivacyFence['preservedLocalAgenda']> {
    if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='agenda'").get()) return [];
    return this.db.prepare('SELECT id,payload FROM agenda').all().flatMap(row => {
      const item = JSON.parse(String(row.payload)), actionId = item.effectActionId || item.id;
      const action = parse<any>(this.db.prepare("SELECT payload FROM h_actions WHERE id=? AND owner=? AND workspace=? AND subject=? AND world='real' AND status='succeeded'").get(actionId, this.identity.principalId, this.identity.workspaceId, this.identity.principalId));
      if (!action || action.effect !== 'local_write' || !['local.agenda.save', 'local.agenda.change'].includes(action.capability) || action.goalId || item.goalId) return [];
      const approved = this.db.prepare("SELECT 1 FROM h_approvals WHERE action_id=? AND json_extract(payload,'$.actionDigest')=? AND json_extract(payload,'$.actionRevision')=? AND json_extract(payload,'$.used')=1").get(actionId, action.digest, action.revision);
      const confirmed = this.db.prepare("SELECT 1 FROM h_receipts WHERE action_id=? AND json_extract(payload,'$.status')='confirmed_success'").get(actionId);
      return approved && confirmed ? [{ agendaId: String(row.id), agendaRevision: item.revision || 1, agendaSha256: createHash('sha256').update(String(row.payload)).digest('hex'), actionId, actionRevision: action.revision, actionDigest: action.digest }] : [];
    });
  }
  private fenceFile() {
    return this.databasePath === ':memory:' ? undefined : this.databasePath + '.privacy-fences.json';
  }
  private replacePolicyFile(file: string, payload: unknown) {
    const temp = file + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(payload), { mode: 0o600, flush: true });
    // Windows indexers may briefly hold the destination. Keep the old complete
    // barrier intact and retry the atomic rename, never delete it first.
    for (let attempt = 0; ; attempt++) {
      try {
        this.fault?.('before_privacy_rename');
        fs.renameSync(temp, file);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt >= 9 || !['EPERM', 'EACCES', 'EBUSY'].includes(code || '')) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1));
      }
    }
  }
  persistPolicyState() {
    const file = this.fenceFile();
    if (!file) return;
    const payload = {
      version: 1,
      minimumEpoch: this.epoch,
      policyRevision: this.policyRevision,
      fences: this.fences(),
      authorizations: {
        grants: this.getMeta<string[]>('grants', []),
        revoked: this.getMeta<string[]>('revoked', []),
      },
    };
    this.replacePolicyFile(file, payload);
  }
  establishFence(input: Omit<PrivacyFence, 'id' | 'epoch' | 'createdAt'>): PrivacyFence {
    const fence: PrivacyFence = {
      ...input,
      id: randomUUID(),
      epoch: this.epoch + 1,
      createdAt: this.clock.now(),
    };
    const file = this.fenceFile();
    if (file) {
      const fences = [...this.fences(), fence],
        grants = this.getMeta<string[] | undefined>('grants'),
        revoked = this.getMeta<string[]>('revoked', []);
      const authorizations = grants
        ? {
            grants: input.kind === 'revoke' ? grants.filter((g) => g !== input.scope) : grants,
            revoked:
              input.kind === 'revoke' && input.scope ? [...new Set([...revoked, input.scope])] : revoked,
          }
        : undefined;
      this.replacePolicyFile(file, {
        version: 1,
        minimumEpoch: fence.epoch,
        policyRevision: this.policyRevision + 1,
        fences,
        authorizations,
      });
    }
    this.write(() => {
      this.db.prepare('INSERT INTO h_fences VALUES(?,?,?)').run(fence.id, fence.epoch, JSON.stringify(fence));
      this.setMeta('privacy_epoch', fence.epoch);
      this.setMeta('policy_revision', this.policyRevision + 1);
      this.db
        .prepare("UPDATE h_outbox SET status='cancelled' WHERE epoch<? AND status='pending'")
        .run(fence.epoch);
      this.db
        .prepare(
          "UPDATE h_jobs SET status=CASE WHEN status='leased' THEN 'unknown' ELSE 'paused_privacy' END,fence=fence+1,lease_until=NULL WHERE epoch<? AND status IN ('queued','leased')",
        )
        .run(fence.epoch);
      this.db.prepare('DELETE FROM h_runs').run();
    });
    return fence;
  }
  revalidatePrivacyJobs() {
    this.write(() => {
      for (const row of this.db.prepare("SELECT * FROM h_jobs WHERE status='paused_privacy'").all()) {
        const action = this.db.prepare('SELECT status FROM h_actions WHERE id=?').get(String(row.object_id));
        const goal = row.goal_id
          ? this.db.prepare('SELECT status FROM h_work WHERE id=?').get(String(row.goal_id))
          : undefined;
        const invalid =
          this.hasFence(String(row.object_id), String(row.source)) ||
          (action &&
            ['cancelled', 'cancel_requested', 'cancellation_confirmed', 'cannot_cancel'].includes(
              String(action.status),
            )) ||
          (row.goal_id && goal?.status !== 'active');
        this.db
          .prepare('UPDATE h_jobs SET status=?,epoch=? WHERE id=?')
          .run(invalid ? 'cancelled' : 'queued', this.epoch, String(row.id));
      }
    });
  }
  private applyRestorationFences() {
    const file = this.fenceFile();
    if (!file || !fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      version: number;
      minimumEpoch?: number;
      policyRevision?: number;
      fences: PrivacyFence[];
      authorizations?: { grants: string[]; revoked: string[] };
    };
    if (data.version !== 1 || !Array.isArray(data.fences))
      throw new HarnessError('invalid_privacy_barrier', '隐私恢复屏障损坏，暂不打开资料。');
    for (const fence of data.fences) {
      this.write(() => {
        this.db
          .prepare('INSERT OR IGNORE INTO h_fences VALUES(?,?,?)')
          .run(fence.id, fence.epoch, JSON.stringify(fence));
        this.setMeta('privacy_epoch', Math.max(this.epoch, fence.epoch));
      });
      if (fence.kind === 'delete') this.cleanupFence(fence);
      if (fence.kind === 'revoke' && fence.scope) {
        const revoked = this.getMeta<string[]>('revoked', []);
        this.setMeta('revoked', [...new Set([...revoked, fence.scope])]);
      }
    }
    this.setMeta('privacy_epoch', Math.max(this.epoch, data.minimumEpoch || 1));
    this.setMeta('policy_revision', Math.max(this.policyRevision, data.policyRevision || 1));
    if (data.authorizations) {
      this.setMeta('grants', data.authorizations.grants);
      this.setMeta('revoked', data.authorizations.revoked);
    }
    this.setMeta('restoration_fence_applied', true);
  }
  cleanupFence(fence: PrivacyFence) {
    if (fence.kind !== 'delete') return;
    // The marker commits with the cleanup. Restored older snapshots lack it and must
    // replay the fence; an already-clean database must preserve later independent work.
    if (this.getMeta('cleaned_fence:' + fence.id, false)) {
      this.clearMigrationBackups();
      return;
    }
    this.write(() => {
      const currentBusiness = fence.preservedLocalAgenda?.length ? this.confirmedAgendaReferences() : [];
      const preservedBusiness = (fence.preservedLocalAgenda || []).filter(expected => !fence.sourceIds.includes('local-agenda') && !fence.objectIds.includes(expected.actionId) && !fence.objectIds.includes(expected.agendaId)
        && currentBusiness.some(actual => actual.agendaId === expected.agendaId && actual.agendaRevision === expected.agendaRevision && actual.agendaSha256 === expected.agendaSha256 && actual.actionId === expected.actionId && actual.actionRevision === expected.actionRevision && actual.actionDigest === expected.actionDigest));
      const preservedAgendaIds = new Set(preservedBusiness.map(item => item.agendaId));
      const preserved = new Set(preservedBusiness.flatMap(item => [item.actionId, this.calendarVersionId(item.agendaId, item.agendaRevision)]));
      const eventIds = new Set<string>(
        fence.sourceIds.flatMap((source) =>
          this.db
            .prepare(
              "SELECT id FROM h_evidence WHERE source=? OR id=? OR json_extract(payload,'$.locator.artifactId')=?",
            )
            .all(source, source, source)
            .map((r) => String(r.id)),
        ),
      );
      const affected = new Set<string>(),
        redactedPlanningActions = new Set<string>(),
        redactedSources = new Set<string>(),
        redactedRanges = new Map<string, { contentVersion: number; start: number; end: number }[]>();
      const redactPlanningAttempts = (matches: (row: Row) => boolean) => {
        for (const row of this.db.prepare('SELECT plan_id,intent_id,source_binding,redacted FROM h_planning_intent_attempts').all()) {
          if (!matches(row)) continue;
          for (const link of this.db.prepare('SELECT action_id FROM h_planning_intent_action_links WHERE plan_id=?').all(String(row.plan_id))) {
            const actionId = String(link.action_id);
            if (preserved.has(actionId)) continue;
            redactedPlanningActions.add(actionId);
            affected.add(actionId);
            for (const dependent of this.invalidate(actionId, 'source_deleted', preserved)) affected.add(dependent);
          }
          // Preserve existence and source addresses, never the old private
          // manifest. Missing proof must remain unknown on the next recovery.
          this.db.prepare("UPDATE h_planning_intent_attempts SET manifest='{}',redacted=1 WHERE plan_id=?").run(String(row.plan_id));
        }
      };
      // Collect linked pending actions before an explicit owner deletion can
      // cascade away their only planning relation.
      redactPlanningAttempts(row => fence.objectIds.includes(String(row.intent_id)) || fence.objectIds.includes(String(row.plan_id)));
      const recordRedaction = (eventId: string, contentVersion: number, start: number, end: number) => {
        redactedSources.add(eventId);
        redactedRanges.set(eventId, [...(redactedRanges.get(eventId) || []), { contentVersion, start, end }]);
      };
      for (const span of fence.spans || []) {
        const event = parse<EvidenceEvent>(
          this.db.prepare('SELECT payload FROM h_evidence WHERE id=?').get(span.eventId),
        );
        const legacy = this.db.prepare('SELECT content FROM messages WHERE id=?').get(span.eventId);
        const original = event?.text ?? (legacy ? String(legacy.content) : undefined);
        if (original === undefined) continue;
        const chars = Array.from(original);
        const start = event && event.contentVersion !== span.contentVersion ? 0 : span.start,
          end = event && event.contentVersion !== span.contentVersion ? chars.length : span.end;
        for (let i = start; i < Math.min(end, chars.length); i++) chars[i] = '█';
        const text = chars.join('');
        if (event) {
          event.text = text;
          event.status = 'redacted';
          this.db
            .prepare('UPDATE h_evidence SET content=?,status=?,payload=? WHERE id=?')
            .run(text, event.status, JSON.stringify(event), event.id);
          this.replaceIndex('evidence', event.id, text);
          recordRedaction(event.id, event.contentVersion, start, end);
        }
        this.redactLegacyMessage(span.eventId, text);
      }
      for (const id of fence.objectIds) {
        if (this.db.prepare('SELECT id FROM h_evidence WHERE id=?').get(id)) eventIds.add(id);
        const refs = this.db
          .prepare('SELECT event_id,content_version,start_cp,end_cp FROM h_assertion_citations WHERE assertion_id=?')
          .all(id);
        for (const ref of refs) {
          const eid = String(ref.event_id),
            event = parse<EvidenceEvent>(
              this.db.prepare('SELECT payload FROM h_evidence WHERE id=?').get(eid),
            );
          if (!event) continue;
          if (ref.content_version === null || ref.start_cp === null || ref.end_cp === null) {
            eventIds.add(eid);
            continue;
          }
          const chars = Array.from(event.text);
          const start = Number(ref.content_version) === event.contentVersion ? Number(ref.start_cp) : 0,
            end = Number(ref.content_version) === event.contentVersion ? Number(ref.end_cp) : chars.length;
          for (let i = Math.max(0, start); i < Math.min(end, chars.length); i++) chars[i] = '█';
          event.text = chars.join('');
          event.status = 'redacted';
          this.db
            .prepare('UPDATE h_evidence SET content=?,status=?,payload=? WHERE id=?')
            .run(event.text, event.status, JSON.stringify(event), eid);
          this.replaceIndex('evidence', eid, event.text);
          this.redactLegacyMessage(eid, event.text);
          recordRedaction(eid, event.contentVersion, start, end);
        }
        this.removeAssertion(id);
        for (const dependent of this.invalidate(id, 'source_deleted', preserved)) affected.add(dependent);
        this.db.prepare('DELETE FROM h_work WHERE id=?').run(id);
        this.db.prepare('DELETE FROM h_sync_operations WHERE object_id=?').run(id);
      }
      const directlyDeletedEvents = new Set(eventIds);
      const roots = [...eventIds, ...redactedSources, ...fence.sourceIds],
        visited = new Set<string>();
      while (roots.length) {
        const root = roots.shift()!;
        if (visited.has(root)) continue;
        visited.add(root);
        for (const row of this.db
          .prepare('SELECT event_id FROM h_evidence_roots WHERE root_id=?')
          .all(root)) {
          const id = String(row.event_id);
          if (id === root || redactedSources.has(id)) continue;
          const event = parse<EvidenceEvent>(this.db.prepare('SELECT payload FROM h_evidence WHERE id=?').get(id));
          const ranges = redactedRanges.get(root);
          if (!eventIds.has(root) && ranges?.length && event) {
            const origins = this.sourceOrigins(event, { start: 0, end: Array.from(event.text).length }).spans.filter(origin => origin.eventId === root);
            // A proven disjoint origin remains legal through multiple exact
            // projections. An unknown summary cannot make that promise.
            if (origins.length && origins.every(origin => origin.start !== undefined && origin.end !== undefined
              && ranges.every(range => range.contentVersion === origin.contentVersion && (range.end <= origin.start! || range.start >= origin.end!)))) continue;
          }
          if (!eventIds.has(id)) {
            eventIds.add(id);
            roots.push(id);
          }
        }
      }
      // Exact versioned citations, including authorization quotes, are the
      // dependency relation. A source-ID join cannot represent disjoint uses.
      const citationQueue = [...new Set([...redactedRanges.keys(), ...eventIds])], checkedSources = new Set<string>();
      while (citationQueue.length) {
        const eventId = citationQueue.shift()!;
        if (checkedSources.has(eventId)) continue;
        checkedSources.add(eventId);
        const ranges = redactedRanges.get(eventId) || [], whole = eventIds.has(eventId);
        for (const row of this.db.prepare(`SELECT c.*,a.revision AS current_revision FROM h_assertion_citations c
          JOIN h_assertions a ON a.id=c.assertion_id WHERE c.event_id=?`).all(eventId)) {
          if (!whole && row.content_version !== null && row.start_cp !== null && row.end_cp !== null
            && !ranges.some(range => range.contentVersion !== Number(row.content_version)
              || range.start < Number(row.end_cp) && range.end > Number(row.start_cp))) continue;
          const id = String(row.assertion_id), revision = Number(row.assertion_revision);
          if (revision === Number(row.current_revision)) {
            if (row.role === 'authorization') {
              for (const citation of this.citationRows(id, revision).filter(value => value.role === 'primary')) {
                const projected = parse<EvidenceEvent>(this.db.prepare('SELECT payload FROM h_evidence WHERE id=?').get(citation.eventId));
                if (projected?.parentEventId !== eventId || projected.locator?.kind !== 'text') continue;
                const derived = [projected.id];
                while (derived.length) {
                  const sourceId = derived.shift()!;
                  if (eventIds.has(sourceId)) continue;
                  eventIds.add(sourceId); citationQueue.push(sourceId);
                  for (const child of this.db.prepare('SELECT event_id FROM h_evidence_roots WHERE root_id=? AND event_id!=?').all(sourceId, sourceId)) derived.push(String(child.event_id));
                }
              }
            }
            this.removeAssertion(id);
          } else this.db.prepare('DELETE FROM h_assertion_versions WHERE id=? AND revision=?').run(id, revision);
          for (const dependent of this.invalidate(id, 'source_redacted', preserved)) affected.add(dependent);
        }
      }
      for (const id of redactedSources)
        for (const dependent of this.invalidate(id, 'source_redacted', preserved)) affected.add(dependent);
      for (const id of eventIds) {
        for (const observation of this.db
          .prepare('SELECT id FROM h_observations WHERE evidence_id=?')
          .all(id))
          this.db.prepare('DELETE FROM h_observations WHERE id=?').run(String(observation.id));
        this.db.prepare('DELETE FROM h_domain WHERE evidence_id=?').run(id);
        const dependents = this.db
          .prepare('SELECT assertion_id FROM h_assertion_evidence WHERE event_id=?')
          .all(id);
        for (const dep of dependents) {
          const aid = String(dep.assertion_id);
          const assertion = parse<Assertion>(
            this.db.prepare('SELECT payload FROM h_assertions WHERE id=?').get(aid),
          );
          if (!assertion) continue;
          const remaining = assertion.evidenceIds.filter((e) => e !== id && !eventIds.has(e));
          if (!remaining.length) this.removeAssertion(aid);
          else {
            assertion.evidenceIds = remaining;
            assertion.status = 'candidate';
            assertion.verification = 'pending';
            assertion.text = '来源已变更，等待从保留证据重新核验';
            assertion.value = { type: 'unknown', reason: 'source_deleted' };
            assertion.revision++;
            this.db
              .prepare('UPDATE h_assertions SET status=?,text=?,payload=?,revision=? WHERE id=?')
              .run(assertion.status, assertion.text, JSON.stringify(assertion), assertion.revision, aid);
            this.db.prepare('DELETE FROM h_assertion_versions WHERE id=?').run(aid);
            this.db
              .prepare('DELETE FROM h_assertion_evidence WHERE assertion_id=? AND event_id=?')
              .run(aid, id);
            this.replaceIndex('assertion', aid, assertion.text);
          }
          for (const dependent of this.invalidate(aid, 'source_deleted', preserved)) affected.add(dependent);
        }
        const event = parse<EvidenceEvent>(
          this.db.prepare('SELECT payload FROM h_evidence WHERE id=?').get(id),
        );
        if (event) {
          if (event.parentEventId && directlyDeletedEvents.has(id)) {
            const parent = parse<EvidenceEvent>(
              this.db.prepare('SELECT payload FROM h_evidence WHERE id=?').get(event.parentEventId),
            );
            if (parent) {
              if (event.locator?.kind === 'text') {
                const chars = Array.from(parent.text);
                for (
                  let i = event.locator.startCodePoint;
                  i < Math.min(event.locator.endCodePoint, chars.length);
                  i++
                )
                  chars[i] = '█';
                parent.text = chars.join('');
                parent.status = 'redacted';
                this.db
                  .prepare('UPDATE h_evidence SET content=?,status=?,payload=? WHERE id=?')
                  .run(parent.text, parent.status, JSON.stringify(parent), parent.id);
                this.replaceIndex('evidence', parent.id, parent.text);
              }
              this.redactLegacyMessage(
                parent.id,
                parent.text + (event.kind === 'file_import' ? '\n[附件内容已删除]' : ''),
              );
            }
          }
          event.text = '';
          event.status = 'deleted';
          this.db
            .prepare("UPDATE h_evidence SET content='',status='deleted',payload=? WHERE id=?")
            .run(JSON.stringify(event), id);
        }
        this.db.prepare('DELETE FROM h_evidence_fts WHERE id=?').run(id);
        this.db.prepare("DELETE FROM h_grams WHERE kind='evidence' AND object_id=?").run(id);
        this.db.prepare('DELETE FROM h_spans WHERE event_id=?').run(id);
        this.redactLegacyMessage(id, '[这段内容已删除]');
        for (const dependent of this.invalidate(id, 'source_deleted', preserved)) affected.add(dependent);
      }
      for (const id of [...eventIds, ...redactedSources]) {
        this.db.prepare("DELETE FROM h_domain_versions WHERE json_extract(payload,'$.evidenceId')=?").run(id);
        for (const row of this.db
          .prepare(
            "SELECT id,payload FROM h_work WHERE EXISTS(SELECT 1 FROM json_each(h_work.payload,'$.evidenceIds') e WHERE e.value=?)",
          )
          .all(id)) {
          const work = parse<WorkRecord>(row), binding = workSourceBindingSchema.safeParse(work?.sourceBinding);
          if (!eventIds.has(id) && binding.success && !binding.data.refs.some(ref => ref.eventId === id
            && (redactedRanges.get(id) || []).some(range => range.contentVersion !== ref.contentVersion || range.start < ref.end && range.end > ref.start))) continue;
          affected.add(String(row.id));
        }
      }
      const planningBindingAffected = (raw: unknown) => {
        const binding = workSourceBindingSchema.safeParse(raw);
        if (!binding.success) return true;
        return binding.data.sourceIds.some(source => fence.sourceIds.includes(source)) || binding.data.refs.some(ref =>
          eventIds.has(ref.eventId) || (redactedRanges.get(ref.eventId) || []).some(range =>
            range.contentVersion !== ref.contentVersion || range.start < ref.end && range.end > ref.start));
      };
      redactPlanningAttempts(row => {
        if (affected.has(String(row.intent_id))) return true;
        try { return planningBindingAffected(typeof row.source_binding === 'string' ? JSON.parse(row.source_binding) : undefined); }
        catch (error) { if (error instanceof SyntaxError) return true; throw error; }
      });
      const planningProvenanceAffected = (value: unknown) => {
        const parsed = planningMaterialProvenanceSchema.safeParse(value);
        return !parsed.success || fence.objectIds.includes(parsed.data.intentId) || affected.has(parsed.data.intentId)
          || planningBindingAffected(parsed.data.sourceBinding) || parsed.data.attemptBasis.some(attempt =>
            fence.objectIds.includes(attempt.planId) || planningBindingAffected(attempt.sourceBinding));
      };
      for (const row of this.db.prepare(`SELECT id,json_extract(payload,'$.data.planningProvenance') AS provenance FROM h_work
        WHERE json_type(payload,'$.data.planningProvenance') IS NOT NULL`).all()) {
        let remove = false;
        try {
          const values: unknown = JSON.parse(String(row.provenance));
          remove = !Array.isArray(values) || values.some(planningProvenanceAffected);
        } catch (error) { if (error instanceof SyntaxError) remove = true; else throw error; }
        if (remove) {
          const id = String(row.id); affected.add(id);
          for (const dependent of this.invalidate(id, 'source_deleted', preserved)) affected.add(dependent);
        }
      }
      // A saved view is another source-derived copy, even when it was attached
      // in a different conversation without an ordinary dependency edge.
      for (const row of this.db.prepare(`SELECT id,payload FROM messages WHERE role='assistant'
        AND (json_type(payload,'$.contextReceipt.planningProvenance') IS NOT NULL
          OR EXISTS(SELECT 1 FROM json_each(messages.payload,'$.scenes') s WHERE json_type(s.value,'$.continuation')='object'))`).all()) {
        const message = JSON.parse(String(row.payload));
        const receiptProvenance = message.contextReceipt?.planningProvenance;
        const provenance = [...(Array.isArray(receiptProvenance) ? receiptProvenance : receiptProvenance === undefined ? [] : [null]),
          ...(Array.isArray(message.scenes) ? message.scenes : []).flatMap((scene: { kind?: string; continuation?: Record<string, unknown> }) => {
            const value = scene.continuation;
            return scene.kind === 'planning' && value ? [{ intentId: value.intentId, intentRevision: value.intentRevision,
              sourceBinding: value.sourceBinding, attemptBasis: value.attemptBasis }] : [];
          })];
        if (provenance.some(planningProvenanceAffected)) affected.add(String(row.id));
      }
      for (const id of affected) {
        if (preserved.has(id)) continue;
        this.removeAssertion(id);
        const calendar = this.db.prepare('SELECT agenda_id,revision FROM h_calendar_versions WHERE id=?').get(id);
        if (calendar) {
          this.db.prepare("DELETE FROM agenda WHERE id=? AND COALESCE(json_extract(payload,'$.revision'),1)=?").run(String(calendar.agenda_id), Number(calendar.revision));
          this.db.prepare('DELETE FROM h_calendar_versions WHERE id=?').run(id);
        }
        const outputRow = this.db
          .prepare("SELECT payload FROM messages WHERE id=? AND role='assistant'")
          .get(id);
        if (outputRow) {
          const output = this.clearedMessage(JSON.parse(String(outputRow.payload)), '[相关来源已更改，这段旧回复已停止使用]');
          this.db
            .prepare('UPDATE messages SET content=?,payload=? WHERE id=?')
            .run(output.content, JSON.stringify(output), id);
        }
        const worldRow = this.db.prepare('SELECT payload FROM h_worlds WHERE id=?').get(id);
        if (worldRow) {
          const world = JSON.parse(String(worldRow.payload));
          world.status = 'stale';
          world.assumptions = {};
          world.baseline = [];
          world.domainRefs = [];
          world.evidenceIds = [];
          this.db
            .prepare("UPDATE h_worlds SET status='stale',payload=? WHERE id=?")
            .run(JSON.stringify(world), id);
        }
        const work = parse<WorkRecord>(this.db.prepare('SELECT payload FROM h_work WHERE id=?').get(id));
        if (work) {
          const protectedType = work.sourceBinding && typeof work.data.type === 'string' ? work.data.type : undefined;
          work.status = 'stale';
          work.title = '相关来源已删除，等待重新核对';
          work.data = { ...(protectedType ? { type: protectedType } : {}), invalidationReason: 'source_deleted', requiresRebuild: true };
          work.evidenceIds = work.evidenceIds.filter((e) => !eventIds.has(e));
          // Retain only opaque source addresses as a replay barrier. Removing
          // the typed binding would turn this into a generic sync/edit target.
          this.db.prepare('DELETE FROM h_sync_operations WHERE object_id=?').run(work.id);
          this.db
            .prepare('UPDATE h_work SET status=?,title=?,payload=? WHERE id=?')
            .run(work.status, work.title, JSON.stringify(work), id);
        }
        const action = parse<any>(this.db.prepare('SELECT payload FROM h_actions WHERE id=?').get(id));
        if (action) {
          action.status = ['dispatching', 'outcome_unknown', 'reconciling', 'succeeded', 'cancel_requested'].includes(action.status)
            ? 'cancel_requested' : 'cancelled';
          action.arguments = {};
          delete action.compensation;
          action.audience = 'redacted';
          action.reason = redactedPlanningActions.has(id) ? 'planning_source_deleted_details_removed' : 'source_deleted_details_removed';
          this.db.prepare('UPDATE h_actions SET status=?,payload=? WHERE id=?').run(action.status, JSON.stringify(action), id);
          if (!preservedAgendaIds.has(id)) this.db.prepare('DELETE FROM agenda WHERE id=?').run(id);
        }
      }
      for (const item of preservedBusiness) {
        const action = parse<any>(this.db.prepare('SELECT payload FROM h_actions WHERE id=?').get(item.actionId));
        if (action?.compensation?.previous) {
          // Retain the current approved object, not earlier private versions.
          delete action.compensation;
          action.reason = 'prior_business_version_removed_with_conversation';
          this.db.prepare('UPDATE h_actions SET payload=? WHERE id=?').run(JSON.stringify(action), action.id);
        }
      }
      // Derived views are cheap and are rebuilt only from surviving sources; never keep old textual summaries.
      this.db
        .prepare("DELETE FROM h_work WHERE kind IN ('experience','hypothesis','feedback') AND status='stale'")
        .run();
      this.db.prepare('DELETE FROM h_proposals').run();
      this.db.prepare('DELETE FROM h_operations').run();
      this.db.prepare('DELETE FROM h_runs').run();
      this.db
        .prepare("UPDATE h_jobs SET payload='{}',status='cancelled',fence=fence+1 WHERE status='cancelled'")
        .run();
      this.db.prepare("DELETE FROM h_outbox WHERE status='cancelled'").run();
      if (this.db.prepare("SELECT name FROM sqlite_master WHERE name='sessions'").get())
        this.db.prepare("UPDATE sessions SET summary='',summary_count=0").run();
      for (const sessionId of fence.deletedConversationIds || []) {
        if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='sessions'").get()) this.db.prepare('DELETE FROM sessions WHERE id=?').run(sessionId);
        if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='meta'").get()) this.db.prepare('DELETE FROM meta WHERE key=?').run('draft:' + sessionId);
      }
      this.setMeta('cleaned_fence:' + fence.id, true);
    });
    this.clearMigrationBackups();
    this.revalidatePrivacyJobs();
    this.afterCommit(() => { for (const callback of this.privacyCleanupListeners) callback(); });
  }
  private removeAssertion(id: string) {
    this.db.prepare('DELETE FROM h_assertion_fts WHERE id=?').run(id);
    this.db.prepare("DELETE FROM h_grams WHERE kind='assertion' AND object_id=?").run(id);
    this.db.prepare('DELETE FROM h_assertions WHERE id=?').run(id);
    if (this.db.prepare("SELECT name FROM sqlite_master WHERE name='memories'").get())
      this.db.prepare('DELETE FROM memories WHERE id=?').run(id);
  }
  private clearedMessage(message: Record<string, any>, content: string) {
    // Retain only structural fields. New semantic payloads (drafts, images,
    // alternate response text, future extensions) must not escape deletion.
    return { id: message.id, sessionId: message.sessionId, role: message.role, createdAt: message.createdAt,
      status: message.status === 'running' ? 'cancelled' : message.status, retention: message.retention,
      content, steps: [], obligations: [], actions: [] };
  }
  private redactLegacyMessage(id: string, content: string) {
    if (!this.db.prepare("SELECT name FROM sqlite_master WHERE name='messages'").get()) return;
    const row = this.db.prepare('SELECT payload,session_id FROM messages WHERE id=?').get(id);
    if (!row) return;
    const message = this.clearedMessage(JSON.parse(String(row.payload)), content);
    this.db
      .prepare('UPDATE messages SET content=?,payload=? WHERE id=?')
      .run(content, JSON.stringify(message), id);
    // Assistant messages may repeat the erased source without a precise locator. Redact that derived session conservatively.
    for (const output of this.db
      .prepare("SELECT id,payload FROM messages WHERE session_id=? AND role='assistant'")
      .all(row.session_id as string)) {
      const m = this.clearedMessage(JSON.parse(String(output.payload)), '[相关来源已更改，这段旧回复已停止使用]');
      this.db
        .prepare('UPDATE messages SET content=?,payload=? WHERE id=?')
        .run(m.content, JSON.stringify(m), output.id as string);
    }
    this.db
      .prepare("UPDATE sessions SET title='已整理的对话',summary='',summary_count=0 WHERE id=?")
      .run(row.session_id as string);
    this.db.prepare('DELETE FROM meta WHERE key=?').run('draft:' + row.session_id);
  }
  checkpointPrivacy() {
    if (this.databasePath !== ':memory:') {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    }
  }
}
