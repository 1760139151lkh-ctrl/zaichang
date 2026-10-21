import { randomUUID } from 'node:crypto';
import type { Action } from '../../shared/types';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from '../runtime/policy';
import { HarnessError } from '../../shared/harness';
import { expandAgenda } from './calendar';
import { dateInZone } from '../runtime/semantics';

export interface AttentionPolicy {
  quietWindows: [string, string][];
  timeZone: string;
  maxPerDay: number;
  cooldownMs: number;
  enabled: boolean;
}
export interface DeliveryTarget { sessionId?: string; view?: 'agenda' }
export interface DeliveryPort {
  capabilities: {
    submitted: boolean;
    delivered: boolean;
    seen: boolean;
    stableId: boolean;
    closedApp: boolean;
  };
  submit(
    input: { id: string; title: string; body: string; target?: DeliveryTarget; silent?: boolean },
    signal: AbortSignal,
  ): Promise<{ status: 'submitted_to_os' | 'provider_delivered' | 'seen' | 'unknown'; externalId?: string }>;
  cancel?(id: string): Promise<void>;
}
interface Job {
  kind: string;
  id: string;
  object_id: string;
  goal_id: string | null;
  epoch: number;
  due_at: string;
  status: string;
  lease_until: string | null;
  fence: number;
  attempts: number;
  dedup_key: string;
  payload: string;
}
export class ReminderRuntime {
  port?: DeliveryPort;
  beforeDispatch?: () => void;
  validateSuggestion?: (objectId: string) => boolean;
  canSubmitSuggestion?: () => boolean;
  onSubmitted?: (helpRecordId: string) => void;
  onDelivery?: (helpRecordId: string, status: 'submitted_to_os' | 'provider_delivered' | 'seen' | 'unknown') => void;
  private recurringRefresh = new Map<string, string>();
  readonly submitted: { id: string; status: string }[] = [];
  constructor(
    readonly repo: KernelRepository,
    readonly policy: PolicyKernel,
  ) {}
  attention(): AttentionPolicy {
    return this.repo.getMeta<AttentionPolicy>('attention', {
      quietWindows: [['22:00', '08:00']],
      timeZone: 'Asia/Shanghai',
      maxPerDay: 3,
      cooldownMs: 600000,
      enabled: false,
    });
  }
  configure(value: Partial<AttentionPolicy>) {
    const next = { ...this.attention(), ...value };
    if (
      !Number.isInteger(next.maxPerDay) ||
      next.maxPerDay < 0 ||
      next.maxPerDay > 20 ||
      !Number.isFinite(next.cooldownMs) ||
      next.cooldownMs < 0 ||
      next.quietWindows.some((pair) => pair.some((time) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)))
    )
      throw new HarnessError('attention_policy', '提醒设置不合法。');
    new Intl.DateTimeFormat('en', { timeZone: next.timeZone });
    this.repo.write(() => this.repo.setMeta('attention', next));
  }
  schedule(action: Action, goalId?: string, expiresAt?: string, options: { restore?: boolean; kind?: 'reminder' | 'suggestion'; producerId?: string; helpRecordId?: string;
    /** Her own words for an optional notice, and where a click should lead. */ body?: string; sessionId?: string } = {}) {
    if (action.done || action.planning && action.planning.state !== 'accepted') { this.cancel(action.id); return; }
    const requestedAt = action.remindAt || (action.kind === 'reminder' || !action.kind ? action.startsAt : undefined);
    if (!requestedAt || action.done) return;
    if (goalId && this.repo.db.prepare('SELECT status FROM h_work WHERE id=?').get(goalId)?.status !== 'active') { this.cancel(action.id); return; }
    const now = this.repo.clock.now();
    const recurring = action.kind === 'reminder' && !!action.recurrence;
    const horizon = recurring ? expandAgenda([action], new Date(Date.parse(now) - 3600000).toISOString(), new Date(Date.parse(now) + 90 * 86400000).toISOString(), action.timeZone || this.attention().timeZone) : undefined;
    const times = horizon ? horizon.items.map(item => item.startsAt).filter((at): at is string => typeof at === 'string') : [requestedAt];
    const keys = times.map(at => action.id + ':' + new Date(at).toISOString());
    this.repo.write(() => {
      this.repo.db.prepare(`UPDATE h_jobs SET status='cancelled',fence=fence+1 WHERE object_id=? AND status IN ('queued','leased') AND dedup_key NOT IN (SELECT value FROM json_each(?))`).run(action.id, JSON.stringify(keys));
      for (const time of times) {
        const startsAt = new Date(time).toISOString(), key = action.id + ':' + startsAt, id = randomUUID();
        const payload = JSON.stringify({ title: action.title, startsAt, expiresAt: expiresAt || (recurring ? new Date(Date.parse(startsAt) + 3600000).toISOString() : undefined), recurring, helpRecordId: options.helpRecordId,
          ...(action.reminderMessage ? { message: action.reminderMessage } : {}), ...(options.body ? { body: options.body } : {}), ...(options.sessionId ? { sessionId: options.sessionId } : {}) });
        this.repo.db.prepare('INSERT OR IGNORE INTO h_jobs(id,kind,object_id,goal_id,source,epoch,due_at,status,dedup_key,payload) VALUES(?,?,?,?,?,?,?,?,?,?)')
          .run(id, options.kind || 'reminder', action.id, goalId || null, options.kind === 'suggestion' ? 'work:self' : 'local-agenda', this.repo.epoch, startsAt, 'queued', key, payload);
        // Even an unknown intent may already have reached the OS. Only a
        // cancelled occurrence with no submission attempt can be requeued.
        if (options.restore) this.repo.db.prepare(`UPDATE h_jobs SET status='queued',fence=fence+1,lease_until=NULL WHERE dedup_key=? AND status='cancelled' AND NOT EXISTS(SELECT 1 FROM h_deliveries d WHERE d.job_id=h_jobs.id)`).run(key);
        this.repo.db.prepare("UPDATE h_jobs SET payload=? WHERE dedup_key=? AND status='queued'").run(payload, key);
        const jobId = String(this.repo.db.prepare('SELECT id FROM h_jobs WHERE dedup_key=?').get(key)!.id);
        const handle = this.policy.hostScope();
        this.repo.addDependency(handle, { consumerId: jobId, producerId: options.producerId || this.repo.calendarVersionId(action.id, action.revision || 1), producerRevision: 1, sensitivity: 'hard', invalidation: 'block' });
        if (goalId) this.repo.addDependency(handle, { consumerId: jobId, producerId: goalId, producerRevision: 1, sensitivity: 'hard', invalidation: 'block' });
      }
    });
    if (recurring) this.recurringRefresh.set(action.id, `${this.repo.epoch}:${action.revision || 1}:${dateInZone(now, action.timeZone || this.attention().timeZone)}`);
  }
  private maintainRecurring() {
    const rows = this.repo.db.prepare(`SELECT g.payload FROM agenda g LEFT JOIN h_actions a ON a.id=COALESCE(json_extract(g.payload,'$.effectActionId'),g.id) LEFT JOIN h_work goal ON goal.id=json_extract(g.payload,'$.goalId')
      WHERE json_extract(g.payload,'$.kind')='reminder' AND json_type(g.payload,'$.recurrence')='object' AND COALESCE(json_extract(g.payload,'$.done'),0)=0
      AND (json_extract(g.payload,'$.planning.state') IS NULL OR json_extract(g.payload,'$.planning.state')='accepted')
      AND (a.id IS NULL OR a.status='succeeded') AND (json_extract(g.payload,'$.goalId') IS NULL OR goal.status='active') LIMIT 500`).all();
    for (const row of rows) {
      const action = JSON.parse(String(row.payload)) as Action;
      if (this.repo.hasFence(action.id, 'local-agenda')) continue;
      const key = `${this.repo.epoch}:${action.revision || 1}:${dateInZone(this.repo.clock.now(), action.timeZone || this.attention().timeZone)}`;
      if (this.recurringRefresh.get(action.id) !== key) this.schedule(action, action.goalId);
    }
  }
  cancel(actionId: string) {
    const jobs = this.repo.db.prepare('SELECT id FROM h_jobs WHERE object_id=?').all(actionId);
    this.repo.write(() =>
      this.repo.db
        .prepare("UPDATE h_jobs SET status='cancelled',fence=fence+1,lease_until=NULL WHERE object_id=?")
        .run(actionId),
    );
    this.repo.afterCommit(() => { for (const job of jobs) void this.port?.cancel?.(String(job.id)); });
  }
  /** Whether optional contact should hold back right now. */
  quietNow() { return this.quiet(); }
  private quiet() {
    const policy = this.attention(),
      time = new Intl.DateTimeFormat('en-GB', {
        timeZone: policy.timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(this.repo.clock.now()));
    return policy.quietWindows.some(([from, to]) =>
      from <= to ? time >= from && time < to : time >= from || time < to,
    );
  }
  recover() {
    this.repo.write(() => {
      const now = this.repo.clock.now();
      for (const row of this.repo.db
        .prepare("SELECT * FROM h_jobs WHERE status='leased' AND lease_until<=?")
        .all(now)) {
        const delivery = this.repo.db
          .prepare('SELECT status FROM h_deliveries WHERE job_id=?')
          .get(String(row.id));
        // A lease expiring after OS submission cannot safely be blindly re-delivered on platforms without stable IDs.
        this.repo.db
          .prepare('UPDATE h_jobs SET status=?,fence=fence+1,lease_until=NULL WHERE id=?')
          .run(delivery ? 'unknown' : 'queued', String(row.id));
      }
    });
  }
  private lease(kind: 'reminder' | 'suggestion', notBefore = ''): Job | undefined {
    return this.repo.write(() => {
      const row = this.repo.db
        .prepare(
          "SELECT * FROM h_jobs WHERE kind=? AND status='queued' AND due_at<=? AND due_at>=? AND epoch=? ORDER BY due_at LIMIT 1",
        )
        .get(kind, this.repo.clock.now(), notBefore, this.repo.epoch) as unknown as Job | undefined;
      if (!row) return;
      const payload = JSON.parse(row.payload);
      if (kind === 'reminder') {
        const agenda = this.repo.db.prepare('SELECT payload FROM agenda WHERE id=?').get(row.object_id);
        const action = agenda && JSON.parse(String(agenda.payload)) as Action | undefined;
        if (action && (action.done || action.planning && action.planning.state !== 'accepted')) {
          this.repo.db.prepare("UPDATE h_jobs SET status='cancelled',fence=fence+1,lease_until=NULL WHERE id=?").run(row.id);
          return;
        }
      }
      if (kind === 'suggestion' && !this.validateSuggestion?.(row.object_id)) {
        this.repo.db.prepare("UPDATE h_jobs SET status='cancelled',fence=fence+1 WHERE id=?").run(row.id);
        return;
      }
      if (payload.expiresAt && Date.parse(payload.expiresAt) <= Date.parse(this.repo.clock.now())) {
        this.repo.db.prepare("UPDATE h_jobs SET status='expired',fence=fence+1 WHERE id=?").run(row.id);
        return;
      }
      if (row.goal_id) {
        const goal = this.repo.db.prepare('SELECT status FROM h_work WHERE id=?').get(row.goal_id);
        if (!goal || goal.status !== 'active') {
          this.repo.db.prepare("UPDATE h_jobs SET status='cancelled',fence=fence+1 WHERE id=?").run(row.id);
          return;
        }
      }
      const leaseUntil = new Date(Date.parse(this.repo.clock.now()) + 60000).toISOString();
      this.repo.db
        .prepare(
          "UPDATE h_jobs SET status='leased',lease_until=?,fence=fence+1,attempts=attempts+1 WHERE id=? AND status='queued'",
        )
        .run(leaseUntil, row.id);
      return {
        ...row,
        status: 'leased',
        fence: row.fence + 1,
        attempts: row.attempts + 1,
        lease_until: leaseUntil,
      };
    });
  }
  async runDue(signal: AbortSignal = new AbortController().signal) {
    this.beforeDispatch?.();
    this.recover();
    this.maintainRecurring();
    const policy = this.attention();
    if (!policy.enabled || !this.port?.capabilities.submitted) return;
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: policy.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(this.repo.clock.now()));
    const hasCommitted = !!this.repo.db.prepare("SELECT id FROM h_jobs WHERE kind='reminder' AND status='queued' AND due_at<=? AND epoch=? LIMIT 1").get(this.repo.clock.now(), this.repo.epoch);
    const kind = hasCommitted ? 'reminder' : 'suggestion';
    // Quiet hours hold back optional notices and late catch-ups. A reminder
    // the person set for this time is a promise: it fires now, quiet or not.
    const onTime = kind === 'reminder' && !!this.repo.db.prepare("SELECT id FROM h_jobs WHERE kind='reminder' AND status='queued' AND due_at<=? AND due_at>=? AND epoch=? LIMIT 1")
      .get(this.repo.clock.now(), new Date(Date.parse(this.repo.clock.now()) - 3600000).toISOString(), this.repo.epoch);
    if (!onTime && this.quiet()) return;
    if (kind === 'suggestion' && this.canSubmitSuggestion && !this.canSubmitSuggestion()) return;
    const usageKey = kind === 'suggestion' ? 'optional_attention_usage' : 'committed_attention_usage';
    const usage = this.repo.getMeta<{ date: string; count: number; lastAt?: string }>(usageKey, {
      date,
      count: 0,
    });
    if (usage.date !== date) {
      usage.date = date;
      usage.count = 0;
      usage.lastAt = undefined;
    }
    if (
      kind === 'suggestion' && (usage.count >= policy.maxPerDay ||
      (usage.lastAt && Date.parse(this.repo.clock.now()) - Date.parse(usage.lastAt) < policy.cooldownMs))
    )
      return;
    // On resume, collapse old reminders into one review request; do not dump ten overdue notifications.
    const overdue = this.repo.db
      .prepare("SELECT id FROM h_jobs WHERE kind='reminder' AND status='queued' AND due_at<? AND epoch=?")
      .all(new Date(Date.parse(this.repo.clock.now()) - 3600000).toISOString(), this.repo.epoch);
    if (overdue.length > 1)
      this.repo.write(() => {
        for (const row of overdue.slice(1))
          this.repo.db.prepare("UPDATE h_jobs SET status='collapsed' WHERE id=?").run(String(row.id));
        this.repo.setMeta('catchup_summary_count', 1);
        this.repo.db
          .prepare('UPDATE h_jobs SET payload=? WHERE id=?')
          .run(
            JSON.stringify({ title: '之前留出的时间已过去，打开后可一起整理', catchup: true }),
            String(overdue[0].id),
          );
      });
    // In quiet hours only the reminder due right now goes out; late ones wait.
    const job = this.lease(kind, onTime && this.quiet() ? new Date(Date.parse(this.repo.clock.now()) - 3600000).toISOString() : '');
    if (!job) return;
    const deliveryId = randomUUID();
    try {
      signal.throwIfAborted();
      const current = this.repo.db.prepare('SELECT fence,status,epoch FROM h_jobs WHERE id=?').get(job.id);
      if (
        current?.status !== 'leased' ||
        Number(current.fence) !== job.fence ||
        Number(current.epoch) !== this.repo.epoch
      )
        return;
      const payload = JSON.parse(job.payload);
      // Persist submission intent before touching the OS. Crash recovery treats an unresolved intent as unknown.
      this.repo.write(() =>
        this.repo.db
          .prepare('INSERT INTO h_deliveries VALUES(?,?,?,?,?)')
          .run(
            deliveryId,
            job.id,
            'unknown',
            job.dedup_key,
            JSON.stringify({ attemptedAt: this.repo.clock.now(), fence: job.fence }),
          ),
      );
      const result = await this.port.submit(
        { id: job.id, ...notificationText(this.repo.getMeta('settings', {}), kind, payload), silent: kind === 'suggestion',
          ...(typeof payload?.sessionId === 'string' ? { target: { sessionId: payload.sessionId } } : kind === 'reminder' ? { target: { view: 'agenda' as const } } : {}) },
        signal,
      );
      this.repo.fault?.('after_notification_submit');
      if (
        (result.status === 'seen' && !this.port.capabilities.seen) ||
        (result.status === 'provider_delivered' && !this.port.capabilities.delivered)
      )
        throw new HarnessError('unsupported_receipt', '平台不能提供这种送达证明。');
      const committed = this.repo.write(() => {
        const latest = this.repo.db.prepare('SELECT fence,epoch,status FROM h_jobs WHERE id=?').get(job.id);
        // A late receipt can add evidence to a cancelled occurrence. It never
        // reopens that job, and a privacy epoch change still rejects it.
        if (latest && Number(latest.epoch) === this.repo.epoch) this.repo.db
          .prepare('UPDATE h_deliveries SET status=?,payload=? WHERE id=?')
          .run(result.status, JSON.stringify({ ...result, attemptedAt: this.repo.clock.now(), ...(result.status !== 'unknown' ? { submittedAt: this.repo.clock.now() } : {}), fence: job.fence }), deliveryId);
        if (
          latest?.status !== 'leased' ||
          Number(latest.fence) !== job.fence ||
          Number(latest.epoch) !== this.repo.epoch
        )
          return false;
        this.repo.db
          .prepare('UPDATE h_jobs SET status=?,lease_until=NULL WHERE id=? AND fence=?')
          .run(result.status === 'unknown' ? 'unknown' : 'done', job.id, job.fence);
        this.repo.setMeta(usageKey, { date, count: usage.count + 1, lastAt: this.repo.clock.now() });
        return true;
      });
      if (!committed) return;
      this.submitted.push({ id: job.id, status: result.status });
      if (payload.helpRecordId) {
        this.onDelivery?.(String(payload.helpRecordId), result.status);
        if (result.status !== 'unknown') this.onSubmitted?.(String(payload.helpRecordId));
      }
    } catch (error) {
      const changed = this.repo.write(() =>
        this.repo.db
          .prepare(
            "UPDATE h_jobs SET status='unknown',lease_until=NULL WHERE id=? AND fence=? AND status='leased'",
          )
          .run(job.id, job.fence),
      );
      const payload = JSON.parse(job.payload);
      if (changed.changes && payload.helpRecordId) this.onDelivery?.(String(payload.helpRecordId), 'unknown');
      if (signal.aborted) throw error;
    }
  }
  capabilities() {
    return {
      closedAppReminders: false,
      delivery: this.port?.capabilities || {
        submitted: false,
        delivered: false,
        seen: false,
        stableId: false,
        closedApp: false,
      },
      duplicateRisk: !this.port?.capabilities.stableId,
    };
  }
}

const clip = (text: string, max: number) => {
  const points = Array.from(text.replace(/\s+/g, ' ').trim());
  return points.length > max ? points.slice(0, max - 1).join('') + '…' : points.join('');
};
/** What the OS shows. The title is who is speaking; the body is her actual
 * words when the person allows previews, otherwise a quiet placeholder. */
export function notificationText(settings: { persona?: { core?: { name?: string } }; notificationPreview?: 'words' | 'private' },
  kind: 'reminder' | 'suggestion', payload: { title?: unknown; message?: unknown; body?: unknown; catchup?: unknown }) {
  const name = typeof settings?.persona?.core?.name === 'string' && settings.persona.core.name.trim() ? settings.persona.core.name.trim() : '在场';
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  const words = settings?.notificationPreview !== 'private';
  if (kind === 'reminder') {
    if (payload?.catchup) return { title: name, body: '有几件约好的事已经过了时间，回来时我们一起看看。' };
    if (!words) return { title: name, body: '到约好的时间了。' };
    const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
    return { title: name, body: message ? clip(message, 90) : title ? `到时间了：${clip(title, 60)}` : '到约好的时间了。' };
  }
  if (!words) return { title: name, body: '有件事想跟你说。' };
  const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
  return { title: name, body: body ? clip(body, 90) : title ? clip(title, 90) : '有件事想跟你说。' };
}
