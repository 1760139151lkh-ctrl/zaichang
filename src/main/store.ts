import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SETTINGS,
  DEEPSEEK_MODEL,
  type Action,
  type CampusSnapshot,
  type Conversation,
  type Memory,
  type Message,
  type Settings,
  type SettingsUpdate,
  type State,
} from '../shared/types';
import { terms } from '../shared/schemas';
import { KernelRepository } from './storage/repository';
import { RuntimeCoordinator } from './runtime/coordinator';
import type { AssistantWorkSource, ClockPort, HostIdentity } from '../shared/harness';
import { interactiveProgramSourceSchema } from '../shared/harness';
import { redactExport } from './runtime/redaction';
import { assertTestStoreFile } from './testBoundary';
import { applyPersonaUpdate, companionPreset, initialPersona, isUntouchedDefaultPersona, migratePersona, personaStateSchema } from '../shared/persona';
import { DEFAULT_INTERACTION, LEGACY_DEFAULT_INTERACTION, type InteractionPreferences } from '../shared/interaction';
import { NotesService } from './notes/service';
import { canonical } from './runtime/semantics';
import { campusAcademicReference } from '../shared/campus-academic';
import { isAcademicCampus } from './runtime/campus-academic';
import { sanitizeProgramMessageForStorage } from './runtime/interactive-program-sources';

export interface AgendaChange {
  id: string; revision: number; operation: 'upsert' | 'tombstone'; at: string;
  calendarVersionId: string; changedFields: string[];
  kind?: Action['kind']; startsAt?: string; durationMinutes?: number;
  timeZone?: string; allDayDate?: string; done?: boolean;
  planning?: Pick<NonNullable<Action['planning']>, 'state' | 'flexibility'>;
}
function agendaBusinessValue(item: Action) {
  const { revision: _revision, effectActionId: _effect, approvalDigest: _approval, saved: _saved,
    coverage: _coverage, missingNeeds: _needs, calendarChange: _change, createNew: _copy, ...value } = item;
  const instant = (at: string | undefined) => at && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : at;
  return { ...value, done: !!value.done, startsAt: instant(value.startsAt), remindAt: instant(value.remindAt),
    exceptions: value.exceptions?.map(exception => ({ ...exception, startsAt: instant(exception.startsAt) })) };
}

export class Store {
  db: DatabaseSync;
  readonly kernel: KernelRepository;
  readonly notes: NotesService;
  readonly runtime: RuntimeCoordinator;
  private agendaListeners = new Set<(change: AgendaChange) => void>();
  constructor(path: string, options: { clock?: ClockPort; identity?: HostIdentity } = {}) {
    assertTestStoreFile(path);
    this.db = new DatabaseSync(path);
    const hadHistoryIndex = !!this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'")
      .get();
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, updated_at TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', summary_count INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id, created_at);
      CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, text TEXT NOT NULL, quote TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agenda (id TEXT PRIMARY KEY, payload TEXT NOT NULL, notified INTEGER NOT NULL DEFAULT 0);
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content='messages', content_rowid='rowid', tokenize='trigram');
      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid, content) VALUES(new.rowid, new.content); END;
      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN INSERT INTO messages_fts(messages_fts,rowid,content) VALUES('delete', old.rowid, old.content); END;
      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN INSERT INTO messages_fts(messages_fts,rowid,content) VALUES('delete', old.rowid, old.content); INSERT INTO messages_fts(rowid,content) VALUES(new.rowid,new.content); END;`);
    if (!hadHistoryIndex) this.db.exec("INSERT INTO messages_fts(messages_fts) VALUES('rebuild')");
    this.kernel = new KernelRepository(this.db, path, options.clock, options.identity);
    this.notes = new NotesService(this.kernel);
    this.runtime = new RuntimeCoordinator(this, this.kernel);
    // A process exit also ends temporary conversations. The journal stores
    // only session IDs and controls, so recovery never needs private text.
    this.endTemporaryConversations();
    for (const row of this.db.prepare('SELECT payload FROM messages').all()) {
      const message = JSON.parse(String(row.payload)) as Message;
      if (message.status === 'running') {
        message.status = 'cancelled';
        message.hostStatus = { kind: 'cancelled', code: 'process_restarted', text: '上次处理在应用退出时中断了。' };
        message.steps = message.steps.map((s) =>
          s.status === 'running' ? { ...s, status: 'cancelled' } : s,
        );
        message.obligations = message.obligations.map((o) =>
          o.status === 'pending' || o.status === 'running' ? { ...o, status: 'blocked' } : o,
        );
        this.putMessage(message);
      }
    }
  }
  meta<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? (JSON.parse(String(row.value)) as T) : fallback;
  }
  putMeta(key: string, value: unknown) {
    if (key === 'campus' && this.runtime) {
      if (value) this.runtime.domains.importSnapshot(value as CampusSnapshot);
      else this.runtime.domains.disconnect();
    }
    this.db
      .prepare('INSERT INTO meta VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, JSON.stringify(value));
  }
  settings(): Settings {
    const stored = this.meta<Partial<Settings>>('settings', {});
    const parsedPersona = personaStateSchema.safeParse(stored.persona);
    let persona = parsedPersona.success ? parsedPersona.data : stored.guidance ? migratePersona(stored.guidance) : initialPersona();
    let migrated = !parsedPersona.success;
    if (!parsedPersona.success && stored.guidance && !this.meta<unknown>('legacy-private-guidance', null)) {
      // Preserve the exact pre-migration private text. It is never part of the
      // role history, template, preview or always-on prompt projection.
      this.putMeta('legacy-private-guidance', { text: stored.guidance, classification: 'private_unreviewed', migratedAt: this.kernel?.clock.now() || new Date().toISOString() });
    }
    let interaction: InteractionPreferences = { ...DEFAULT_SETTINGS.interaction, ...stored.interaction };
    if ((stored.defaultsVersion ?? 1) < 2) {
      // Shipped defaults change once: a never-saved role becomes the character
      // the person sees by default, and the exact old default interaction
      // tuple becomes the new one. Any value the person actually chose stays.
      if (isUntouchedDefaultPersona(persona)) persona = initialPersona();
      if (stored.interaction && (Object.keys(LEGACY_DEFAULT_INTERACTION) as (keyof InteractionPreferences)[])
        .every(key => stored.interaction![key] === LEGACY_DEFAULT_INTERACTION[key])) interaction = { ...DEFAULT_INTERACTION };
      migrated = true;
    }
    if (migrated) this.putMeta('settings', { ...stored, persona, interaction, defaultsVersion: 2 });
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      interaction,
      persona,
      model: DEEPSEEK_MODEL,
      hasKey: false,
      defaultsVersion: 2,
    };
  }
  /** A role that was never saved follows the artwork the person picked, so a
   * new user who chose 祥子 talks to 祥子. Saved roles are never touched. */
  followDefaultCompanion(companionId: string) {
    const current = this.settings();
    const preset = companionPreset(companionId);
    if (!preset || current.persona.revision !== 0 || current.persona.source !== 'default' || current.persona.history.length) return current;
    if (current.persona.core.presetId === preset.core.presetId) return current;
    this.putMeta('settings', { ...this.meta<Partial<Settings>>('settings', {}), persona: { ...current.persona, core: preset.core } });
    return this.settings();
  }
  saveSettings(value: SettingsUpdate) {
    const { personaUpdate, apiKey: _apiKey, ...patch } = value;
    const current = this.settings();
    const persona = personaUpdate ? applyPersonaUpdate(current.persona, personaUpdate, this.kernel.clock.now()) : current.persona;
    if (this.runtime) {
      const previous = this.settings();
      if (value.weatherEnabled !== undefined && value.weatherEnabled !== previous.weatherEnabled) {
        if (value.weatherEnabled) this.runtime.policy.grant('weather:read');
        else this.runtime.policy.revoke('weather:read');
      }
      if (value.memoryEnabled === false && previous.memoryEnabled) this.runtime.policy.signalBarrier();
      if (value.remindersEnabled !== undefined)
        this.runtime.reminders.configure({ enabled: value.remindersEnabled });
      if (value.timeZone !== undefined) this.runtime.reminders.configure({ timeZone: value.timeZone });
      if (value.interaction?.initiative === 'quiet' && previous.interaction.initiative !== 'quiet') this.runtime.attention.quietOptional();
      if (value.interaction?.initiative === 'prepare' && previous.interaction.initiative !== 'prepare') this.runtime.attention.keepPreparedInApp();
    }
    this.putMeta('settings', { ...this.settings(), ...patch, persona, model: DEEPSEEK_MODEL, hasKey: false, defaultsVersion: 2 });
  }
  session(id?: string, title = '新的对话'): string {
    if (id && this.db.prepare('SELECT id FROM sessions WHERE id=?').get(id)) return id;
    const newId = id || randomUUID();
    this.db
      .prepare('INSERT INTO sessions(id,title,updated_at) VALUES (?,?,?)')
      .run(newId, title.slice(0, 36), new Date().toISOString());
    return newId;
  }
  conversationPolicy(id: string) {
    return this.meta<{ retention: 'history_no_inference' | 'session_only'; clearOnExit: boolean } | null>('conversation-policy:' + id, null);
  }
  restrictConversation(id: string, retention: 'history_no_inference' | 'session_only', clearOnExit = false) {
    const previous = this.conversationPolicy(id);
    this.putMeta('conversation-policy:' + id, { retention: previous?.retention === 'session_only' ? 'session_only' : retention, clearOnExit: !!previous?.clearOnExit || clearOnExit });
  }
  endConversation(id: string) {
    const policy = this.conversationPolicy(id);
    if (policy?.clearOnExit) {
      this.deleteSession(id);
      this.putMeta('conversation-policy:' + id, { ...policy, clearOnExit: false });
    }
  }
  endTemporaryConversations() {
    for (const row of this.db.prepare("SELECT key FROM meta WHERE key LIKE 'conversation-policy:%'").all()) this.endConversation(String(row.key).slice('conversation-policy:'.length));
  }
  conversations(): Conversation[] {
    return this.db
      .prepare('SELECT id,title,updated_at AS updatedAt FROM sessions ORDER BY updated_at DESC')
      .all() as unknown as Conversation[];
  }
  messages(id: string): Message[] {
    return this.db
      .prepare('SELECT payload FROM messages WHERE session_id=? ORDER BY created_at, rowid')
      .all(id)
      .map((r) => JSON.parse(String(r.payload)));
  }
  putMessage(m: Message) {
    if (m.retention === 'session_only' || this.conversationPolicy(m.sessionId)?.retention === 'session_only') return;
    if (
      this.runtime &&
      m.role === 'user' &&
      !this.db.prepare('SELECT id FROM h_evidence WHERE id=?').get(m.id)
    ) {
      const run = this.runtime.begin(m.content, m.id, m.sessionId, new AbortController().signal);
      if (run.ephemeral) return;
    }
    const sanitized = sanitizeProgramMessageForStorage(m);
    const persisted: Message = { ...sanitized, presentationBoundaryKey: undefined,
      ...(sanitized.scenes ? { scenes: sanitized.scenes.map(scene => scene.kind === 'campus' && isAcademicCampus(scene)
        ? campusAcademicReference(scene) : scene) } : {}) };
    this.kernel.write(() => {
      this.db
        .prepare(
          'INSERT INTO messages VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,payload=excluded.payload',
        )
        .run(m.id, m.sessionId, m.role, m.content, m.createdAt, JSON.stringify(persisted));
      this.db
        .prepare('UPDATE sessions SET updated_at=? WHERE id=?')
        .run(new Date().toISOString(), m.sessionId);
      if (m.role === 'assistant' && m.contextReceipt) {
        const scope = this.runtime.policy.hostScope();
        for (const source of new Set([
          ...m.contextReceipt.providedEvidenceIds,
          ...(m.contextReceipt.providedSourceIds || []),
          ...(m.contextReceipt.campusSensitiveReads || []).map(source => source.authorizationEventId),
          ...(m.contextReceipt.noteSources || []).map(source => source.id),
          ...(m.scenes || []).flatMap(scene => scene.kind === 'note' ? [scene.proof.id] : []),
          ...(m.contextReceipt.personalMethodSources || []).flatMap(source => source.assistance.map(assistance => assistance.messageId)),
          ...(m.contextReceipt.personalMethodSources || []).flatMap(source => (source.workAssistance || []).flatMap(help =>
            help.owner === 'companion_session' ? [help.messageId, ...help.assistantMaterials.map(material => material.messageId)] : [])),
          ...(m.scenes || []).flatMap(scene => scene.kind === 'discussion'
            ? scene.coWork.flatMap(projection => projection.snapshotProof?.assistantMaterials.map(source => source.messageId) || []) : []),
          ...(m.releaseArtifacts || []).flatMap(artifact => artifact.sourceMessageIds || [artifact.sourceMessageId]),
        ]))
          this.kernel.addDependency(scope, {
            consumerId: m.id,
            producerId: source,
            producerRevision: 0,
            sensitivity: 'privacy',
            invalidation: 'block',
          });
        const chapters = [...(m.contextReceipt.assistantWorkSources || []), ...(m.scenes || []).flatMap(scene => scene.kind === 'curiosity'
          ? (scene.provenance as { assistantWorkSources?: AssistantWorkSource[] }).assistantWorkSources || [] : [])];
        for (const chapter of new Map(chapters.map(source => [canonical(source), source])).values())
          for (const [source, revision] of [[chapter.messageId, 1], [chapter.sceneId, chapter.sceneRevision]] as const)
            this.kernel.addDependency(scope, { consumerId: m.id, producerId: source, producerRevision: revision,
              sensitivity: 'privacy', invalidation: 'block' });
        const programSources = [...(m.contextReceipt.interactiveProgramSources || []), ...(m.views || []).flatMap(view => {
          const parents = (view.program?.provenance as { parents?: unknown } | undefined)?.parents;
          return Array.isArray(parents) ? parents : [];
        })].flatMap(source => {
          const parsed = interactiveProgramSourceSchema.safeParse(source);
          return parsed.success ? [parsed.data] : [];
        });
        for (const source of new Map(programSources.map(source => [canonical(source), source])).values()) {
          if (source.messageId === m.id) continue;
          for (const [producerId, producerRevision] of [[source.messageId, 1], [source.programId, source.revision]] as const)
            this.kernel.addDependency(scope, { consumerId: m.id, producerId, producerRevision,
              sensitivity: 'privacy', invalidation: 'block' });
        }
      }
    });
  }
  summary(id: string): { text: string; count: number } {
    const r = this.db.prepare('SELECT summary,summary_count FROM sessions WHERE id=?').get(id);
    return { text: String(r?.summary || ''), count: Number(r?.summary_count || 0) };
  }
  saveSummary(id: string, text: string, count: number) {
    this.db.prepare('UPDATE sessions SET summary=?,summary_count=? WHERE id=?').run(text, count, id);
  }
  search(query: string, excludeId = '') {
    const words = terms(query);
    if (!words.length) return [];
    const sql = `SELECT m.id,m.session_id AS sessionId,m.role,m.content,m.created_at AS createdAt,s.title FROM messages m JOIN sessions s ON s.id=m.session_id WHERE m.id != ?`;
    if (words.every((w) => [...w].length >= 3)) {
      const match = words.map((w) => '"' + w.replaceAll('"', '""') + '"').join(' AND ');
      return this.db
        .prepare(
          sql +
            ' AND m.rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?) ORDER BY m.created_at DESC LIMIT 6',
        )
        .all(excludeId, match)
        .map((r) => ({ ...r, content: String(r.content).slice(0, 1600) }));
    }
    const patterns = words.map((w) => '%' + w.replace(/[\\%_]/g, '\\$&') + '%');
    return this.db
      .prepare(
        sql +
          words.map(() => " AND lower(m.content) LIKE ? ESCAPE '\\'").join('') +
          ' ORDER BY m.created_at DESC LIMIT 6',
      )
      .all(excludeId, ...patterns)
      .map((r) => ({ ...r, content: String(r.content).slice(0, 1600) }));
  }
  memories(): Memory[] {
    return this.runtime.memories();
  }
  saveMemory(text: string, quote = '你在记忆面板中填写', id?: string): Memory {
    return this.runtime.saveMemoryControl(text, id);
  }
  deleteMemory(id: string) {
    this.runtime.memory.forget([id]);
  }
  campus(): CampusSnapshot | null {
    return this.runtime.domains.campusSnapshot() || this.meta('campus', null);
  }
  agenda(): Action[] {
    return this.db
      .prepare('SELECT payload FROM agenda ORDER BY rowid DESC')
      .all()
      .map((r) => JSON.parse(String(r.payload)));
  }
  saveAction(item: Action) {
    return this.kernel.write(() => {
      const current = this.writeAgendaProjection(item);
      this.runtime.reminders.schedule(current);
      return current;
    });
  }
  onAgendaChanged(callback: (change: AgendaChange) => void) {
    this.agendaListeners.add(callback);
    return () => this.agendaListeners.delete(callback);
  }
  agendaRevision(id: string) {
    const row = this.db.prepare(`SELECT max(revision) AS revision FROM (
      SELECT revision FROM h_calendar_versions WHERE agenda_id=?
      UNION ALL SELECT COALESCE(json_extract(payload,'$.revision'),1) FROM agenda WHERE id=?)`).get(id, id);
    return Number(row?.revision || 0);
  }
  private journalAgendaChange(item: Action, revision: number, operation: AgendaChange['operation'], changedFields: string[], producerId?: string) {
    const versionId = this.runtime
      ? this.kernel.registerCalendarVersion(this.runtime.policy.hostScope(), item.id, revision, producerId || item.effectActionId || item.id)
      : this.kernel.calendarVersionId(item.id, revision);
    if (!this.runtime) this.db.prepare('INSERT OR IGNORE INTO h_calendar_versions VALUES(?,?,?)').run(versionId, item.id, revision);
    const change: AgendaChange = { id: item.id, revision, operation, at: this.kernel.clock.now(), calendarVersionId: versionId, changedFields,
      ...(item.kind ? { kind: item.kind } : {}), ...(item.startsAt ? { startsAt: item.startsAt } : {}),
      ...(item.durationMinutes ? { durationMinutes: item.durationMinutes } : {}), ...(item.timeZone ? { timeZone: item.timeZone } : {}),
      ...(item.allDayDate ? { allDayDate: item.allDayDate } : {}), done: !!item.done,
      ...(item.planning ? { planning: { state: item.planning.state, flexibility: item.planning.flexibility } } : {}) };
    this.kernel.outbox('agenda_attention', JSON.stringify(change));
    this.kernel.afterCommit(() => {
      for (const callback of this.agendaListeners) {
        try {
          const result = callback(change) as unknown;
          if (result && typeof (result as PromiseLike<unknown>).then === 'function') void Promise.resolve(result).catch(() => undefined);
        } catch { /* The committed outbox remains available to the durable consumer. */ }
      }
    });
  }
  writeAgendaProjection(item: Action): Action {
    return this.kernel.write(() => {
      const offeredRow = this.db
        .prepare(
          "SELECT a.value FROM messages m,json_each(m.payload,'$.actions') a WHERE json_extract(a.value,'$.id')=? ORDER BY m.rowid DESC LIMIT 1",
        )
        .get(item.id);
      const offered = offeredRow ? (JSON.parse(String(offeredRow.value)) as Action) : undefined;
      const priorRow = this.db.prepare('SELECT payload FROM agenda WHERE id=?').get(item.id);
      const prior = priorRow ? (JSON.parse(String(priorRow.payload)) as Action) : undefined;
      const projection: Action = {
        ...item,
        coverage: offered?.coverage || prior?.coverage || item.coverage,
        missingNeeds: offered?.missingNeeds || prior?.missingNeeds || item.missingNeeds,
        saved: true,
      };
      const before = prior ? agendaBusinessValue(prior) : undefined, after = agendaBusinessValue(projection);
      if (before && canonical(before) === canonical(after)) return prior!;
      const highWater = this.agendaRevision(item.id);
      projection.revision = Math.max(highWater + 1, item.revision || 1);
      this.db
        .prepare(
          'INSERT INTO agenda(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
        )
        .run(item.id, JSON.stringify(projection));
      const changedFields = [...new Set([...Object.keys(before || {}), ...Object.keys(after)])].filter(key => canonical((before as any)?.[key]) !== canonical((after as any)[key]));
      this.journalAgendaChange(projection, projection.revision, 'upsert', changedFields);
      return projection;
    });
  }
  deleteAction(id: string, producerId?: string) {
    return this.kernel.write(() => {
      const row = this.db.prepare('SELECT payload FROM agenda WHERE id=?').get(id);
      if (!row) return { previous: null, revision: this.agendaRevision(id), applied: false };
      const previous = JSON.parse(String(row.payload)) as Action, revision = this.agendaRevision(id) + 1;
      this.runtime.reminders.cancel(id);
      this.db.prepare('DELETE FROM agenda WHERE id=?').run(id);
      this.journalAgendaChange(previous, revision, 'tombstone', ['deleted'], producerId);
      return { previous, revision, applied: true };
    });
  }
  due(now: number): Action[] {
    return this.db
      .prepare('SELECT payload FROM agenda WHERE notified=0')
      .all()
      .map((r) => JSON.parse(String(r.payload)) as Action)
      .filter(
        (a) =>
          !a.done && a.startsAt && Date.parse(a.startsAt) <= now && Date.parse(a.startsAt) > now - 3600_000,
      );
  }
  markNotified(id: string) {
    this.db.prepare('UPDATE agenda SET notified=1 WHERE id=?').run(id);
  }
  deleteSession(id: string) {
    const sourceIds = this.db
      .prepare("SELECT id FROM messages WHERE session_id=? UNION SELECT id FROM h_evidence WHERE owner=? AND workspace=? AND json_extract(payload,'$.sessionId')=?")
      .all(id, this.kernel.identity.principalId, this.kernel.identity.workspaceId, id)
      .map((r) => String(r.id));
    if (sourceIds.length) this.runtime.memory.forget([], sourceIds, [], { preservedLocalAgenda: this.kernel.confirmedAgendaReferences(), deletedConversationIds: [id] });
    this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);
    this.db.prepare('DELETE FROM meta WHERE key=?').run('draft:' + id);
  }
  clear() {
    const ids = this.db
      .prepare('SELECT id FROM h_evidence')
      .all()
      .map((r) => String(r.id));
    const objects = this.db
      .prepare('SELECT id FROM h_assertions UNION SELECT id FROM h_work')
      .all()
      .map((r) => String(r.id));
    const fence = this.kernel.establishFence({ kind: 'delete', objectIds: objects, sourceIds: ids });
    this.runtime.policy.signalBarrier();
    this.kernel.cleanupFence(fence);
    this.kernel.write(() => {
      this.notes.clear();
      for (const table of [
        'h_receipts',
        'h_attempts',
        'h_approvals',
        'h_actions',
        'h_deliveries',
        'h_jobs',
        'h_domain_versions',
        'h_calendar_versions',
        'h_domain',
        'h_sync',
        'h_observation_versions',
        'h_observations',
        'h_evidence_roots',
        'h_assertion_evidence',
        'h_assertion_versions',
        'h_assertions',
        'h_spans',
        'h_evidence',
        'h_work',
        'h_worlds',
        'h_aliases',
        'h_dependencies',
        'h_outbox',
        'h_operations',
        'h_runs',
        'h_proposals',
        'h_grams',
        'h_watches',
        'h_source_restrictions',
        'h_sync_operations',
      ])
        this.db.exec('DELETE FROM ' + table);
      this.db.exec('DELETE FROM h_evidence_fts; DELETE FROM h_assertion_fts;');
      this.db
        .prepare(
          "DELETE FROM h_meta WHERE key NOT IN ('identity','privacy_epoch','policy_revision','registered_sources','legacy_migrated')",
        )
        .run();
      this.kernel.setMeta('received_seq', 0);
      this.kernel.setMeta('sequence_base', 0);
    });
    this.db.exec(
      'BEGIN; DELETE FROM messages; DELETE FROM sessions; DELETE FROM memories; DELETE FROM agenda; DELETE FROM meta; COMMIT; VACUUM;',
    );
  }
  state(hasKey: boolean): State {
    const campus = this.campus();
    return {
      privacyEpoch: this.kernel.epoch,
      policyRevision: this.kernel.policyRevision,
      sourceBoundary: this.runtime.policy.sourceBoundary,
      settings: { ...this.settings(), hasKey },
      conversations: this.conversations(),
      memories: this.memories(),
      agenda: this.agenda(),
      campus: campus
        ? {
            source: campus.source,
            updatedAt: campus.updatedAt,
            count: campus.schedule.length + campus.exams.length,
          }
        : null,
      campusConnector: null,
    };
  }
  export() {
    const { principalId, workspaceId } = this.kernel.identity;
    const owned = (table: string, extra = '') =>
      this.db
        .prepare(`SELECT payload FROM ${table} WHERE owner=? AND workspace=? ${extra}`)
        .all(principalId, workspaceId)
        .map((r) => JSON.parse(String(r.payload)));
    const labelFilter = "AND retain!='session_only' AND sensitivity!='restricted'";
    const exportScope = this.runtime.policy.hostScope();
    const workingState = this.kernel.exportWorkingState(exportScope);
    return redactExport({
      version: 1,
      manifest: {
        schema_version: '1',
        at_rest_encrypted: false,
        privacy_epoch: this.kernel.epoch,
        excluded: ['credentials', 'deleted_content', 'ephemeral_content', 'opaque_model_state'],
      },
      exportedAt: new Date().toISOString(),
      settings: this.settings(),
      sessions: this.conversations().map((s) => ({ ...s, messages: this.messages(s.id).map(message => this.runtime.presentation.sourceCurrentMessage(message)) })),
      drafts: Object.fromEntries(
        this.db
          .prepare("SELECT key,value FROM meta WHERE key LIKE 'draft:%'")
          .all()
          .map((r) => [String(r.key).slice(6), JSON.parse(String(r.value))]),
      ),
      memories: this.memories(),
      agenda: this.agenda(),
      campus: this.campus(),
      notes: this.notes.export(),
      evidence: owned('h_evidence', labelFilter + " AND status!='deleted'"),
      assertions: owned('h_assertions', labelFilter),
      work: workingState.work,
      planningIntentState: workingState.planningIntentState,
      worlds: owned('h_worlds'),
      actions: owned('h_actions').filter(action => this.kernel.planningActionReadable(exportScope, action.id)),
      domainRecords: owned('h_domain', labelFilter + " AND status!='known_absent'"),
      privacyFences: this.kernel.fences(),
    });
  }
  close() {
    void this.runtime?.embeddings.dispose();
    if (this.db.isOpen) this.db.close();
  }
}
