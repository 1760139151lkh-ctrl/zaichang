import { HarnessError, type ScopeHandle } from '../../shared/harness';
import {
  agendaDayInputSchema, agendaFocusSchema, agendaPreviewChangeInputSchema,
  type AgendaChangePreview, type AgendaDayResult, type AgendaFocus, type AgendaOccurrence, type AgendaReference,
} from '../../shared/agenda';
import type { Action } from '../../shared/types';
import type { Store } from '../store';
import { expandAgenda, projectCalendarChange } from '../actions/calendar';
import { planningDayBounds } from '../actions/planning-days';
import { previewCalendarPlan } from '../actions/planning';
import { dateInZone } from './semantics';

const MINUTE = 60000;
const validInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** A native view and a read-only assessment of the existing calendar owner. */
export class NativeAgendaService {
  constructor(private readonly store: Store) {}

  private readable(handle: ScopeHandle) {
    const runtime = this.store.runtime, scope = runtime.policy.require(handle, 'evidence:read');
    if (runtime.presentation.public || scope.worldId !== 'real' || scope.subjectId !== scope.principalId
      || scope.audience !== 'self' || !scope.sources.includes('local-agenda'))
      throw new HarnessError('agenda_private', '回到自己的对话后，再看看这份安排。');
    return scope;
  }
  private currentBoundary() {
    return { privacyEpoch: this.store.kernel.epoch, policyRevision: this.store.kernel.policyRevision,
      sourceBoundary: this.store.runtime.policy.sourceBoundary };
  }
  private boundary(input: ReturnType<NativeAgendaService['currentBoundary']>) {
    const current = this.currentBoundary();
    if (input.privacyEpoch !== current.privacyEpoch || input.policyRevision !== current.policyRevision
      || input.sourceBoundary !== current.sourceBoundary)
      throw new HarnessError('agenda_source_changed', '资料范围刚有变化，重新打开这一天后再试。');
  }
  private zone(value: string) {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); }
    catch { throw new HarnessError('time_zone', '这份安排的时区需要重新选一下。'); }
    return value;
  }
  private occurrence(row: Record<string, unknown>, fallbackZone: string): AgendaOccurrence {
    const item = row as unknown as Action;
    if (typeof item.id !== 'string' || typeof row.occurrenceId !== 'string')
      throw new HarnessError('agenda_read', '这份安排没有读完整，重新打开后再试。');
    const bounds = item.allDayDate ? planningDayBounds(item.allDayDate, item.timeZone || fallbackZone) : undefined;
    const start = bounds?.from || item.startsAt;
    const end = bounds?.to || (validInstant(row.endsAt) ? row.endsAt : item.durationMinutes && start
      ? new Date(Date.parse(start) + item.durationMinutes * MINUTE).toISOString() : null);
    if (!validInstant(start)) throw new HarnessError('agenda_read', '这份安排的开始时刻还没读完整。');
    return { record: { id: item.id, revision: item.revision || 1,
      ...(typeof row.originalDate === 'string' ? { occurrenceDate: row.originalDate } : {}) },
      occurrenceId: row.occurrenceId, item: structuredClone(item), start, end };
  }
  private record(handle: ScopeHandle, ref: AgendaReference) {
    this.readable(handle);
    const current = this.store.runtime.calendar.read(ref.id);
    if (!current) throw new HarnessError('calendar_missing', '这件事已经移除了，先看看现在的安排。');
    if ((current.revision || 1) !== ref.revision)
      throw new HarnessError('revision_conflict', '这件事后来有了改动，先看看现在这一版。');
    if (ref.occurrenceDate && !current.recurrence)
      throw new HarnessError('occurrence_missing', '这条安排现在不是原来的重复系列了。');
    return current;
  }
  private instance(item: Action, ref: AgendaReference, fallbackZone: string) {
    const zone = this.zone(item.timeZone || fallbackZone);
    let date = ref.occurrenceDate || item.allDayDate || (item.startsAt ? dateInZone(item.startsAt, zone) : undefined);
    if (!date) return null;
    if (item.recurrence && ref.occurrenceDate) {
      const exception = item.exceptions?.find(value => value.onDate === ref.occurrenceDate);
      if (exception?.cancelled) throw new HarnessError('occurrence_cancelled', '这一次已经取消，其他日期的安排仍保留着。');
      if (exception?.startsAt) date = dateInZone(exception.startsAt, zone);
    }
    const window = planningDayBounds(date, zone);
    if (Date.parse(window.to) <= Date.parse(window.from)) return null;
    const expanded = expandAgenda([{ ...item, done: false }], window.from, window.to, zone);
    const row = expanded.items.find(value => item.recurrence
      ? value.originalDate === (ref.occurrenceDate || item.allDayDate || dateInZone(item.startsAt!, zone))
      : value.id === item.id);
    if (!row) {
      if (expanded.issues.length) throw new HarnessError('occurrence_time', '这一次的时刻还不能确定，先在对话里核清时间。');
      throw new HarnessError('occurrence_missing', '这个日期里没有这一次安排，先看看当前系列。');
    }
    return this.occurrence({ ...row, done: item.done }, zone);
  }

  async day(raw: unknown, signal: AbortSignal): Promise<AgendaDayResult> {
    const input = agendaDayInputSchema.parse(raw), runtime = this.store.runtime;
    this.boundary(input); this.zone(input.timeZone);
    const handle = runtime.policy.hostScope(); this.readable(handle); signal.throwIfAborted();
    const window = planningDayBounds(input.date, input.timeZone);
    if (Date.parse(window.to) <= Date.parse(window.from)) return { date: input.date, timeZone: input.timeZone,
      window, items: [], issues: [], complete: true, fetchedAt: this.store.kernel.clock.now(), ...this.currentBoundary() };
    const result = await runtime.broker.invoke(handle, 'local.agenda.read', { ...window, timeZone: input.timeZone }, signal);
    signal.throwIfAborted(); this.readable(handle); this.boundary(input);
    const data = result.data as { items?: Record<string, unknown>[]; issues?: Record<string, unknown>[] } | undefined;
    if (!['fresh', 'partial', 'known_absent'].includes(result.status) || !Array.isArray(data?.items))
      throw new HarnessError('agenda_read', '这一天的安排刚才没读完整，可以重新打开。');
    return { date: input.date, timeZone: input.timeZone, window,
      items: data.items.map(row => this.occurrence(row, input.timeZone)),
      issues: (data.issues || []).map(row => ({ id: String(row.id), status: String(row.status),
        ...(typeof row.date === 'string' ? { date: row.date } : {}), ...(typeof row.startsAt === 'string' ? { startsAt: row.startsAt } : {}) })),
      complete: result.coverage?.complete === true, fetchedAt: result.fetchedAt || this.store.kernel.clock.now(), ...this.currentBoundary() };
  }

  async preview(raw: unknown, signal: AbortSignal): Promise<AgendaChangePreview> {
    const input = agendaPreviewChangeInputSchema.parse(raw), runtime = this.store.runtime;
    this.boundary(input); this.zone(input.timeZone);
    const handle = runtime.policy.hostScope(), scope = this.readable(handle);
    const original = this.record(handle, input.record);
    const change = { operation: input.record.occurrenceDate ? 'change_occurrence' as const : 'update' as const,
      targetId: input.record.id, expectedRevision: input.record.revision,
      ...(input.record.occurrenceDate ? { occurrenceDate: input.record.occurrenceDate } : {}), changes: input.changes };
    const after = projectCalendarChange(original, change, input.timeZone);
    const beforeOccurrence = this.instance(original, input.record, input.timeZone);
    const afterOccurrence = this.instance(after, input.record, input.timeZone);
    if (!afterOccurrence) throw new HarnessError('time_missing', '还没选具体日期，先把时间留在这里。');
    const starts = [beforeOccurrence?.start, afterOccurrence.start].filter(validInstant);
    const ends = [beforeOccurrence?.end, afterOccurrence.end].filter(validInstant);
    const earliest = Math.min(...starts.map(Date.parse)), latest = Math.max(...starts.map(Date.parse), ...ends.map(Date.parse));
    const from = planningDayBounds(dateInZone(new Date(earliest).toISOString(), input.timeZone), input.timeZone).from;
    const to = planningDayBounds(dateInZone(new Date(latest).toISOString(), input.timeZone), input.timeZone).to;
    if (Date.parse(to) - Date.parse(from) > 31 * 86400000)
      throw new HarnessError('time_window', '这次挪动跨了一个多月，先在对话里一起核对前后的安排。');
    signal.throwIfAborted();
    const campus = input.includeCampus ? await runtime.planning.readCampus(scope, from, to, signal) : null;
    signal.throwIfAborted(); this.readable(handle); this.boundary(input); this.record(handle, input.record);
    if (campus && !runtime.planning.campusCurrent(scope, campus))
      throw new HarnessError('planning_campus_changed', '课表刚有变化，重新读取后再看看这个时间。');
    const items = this.store.agenda();
    const preview = previewCalendarPlan(items, { from, to, timeZone: input.timeZone,
      busy: campus?.busy || [], sourceCoverage: campus ? [campus.coverage] : [],
      // The planner's internal option label is shorter than an agenda title.
      // Keep the complete title on the projected owner, not in this label.
      alternatives: [{ label: '这次修改', change }] });
    const alternative = preview.alternatives[0];
    const conflicts = alternative.conflicts.map(value => ({ id: value.objectId,
      title: items.find(item => item.id === value.objectId)?.title || (campus ? '课表中的安排' : '另一项安排'),
      start: value.start, end: value.end, source: items.some(item => item.id === value.objectId) ? 'agenda' as const : 'campus' as const }));
    return { record: input.record, window: preview.window,
      conflicts: [...new Map(conflicts.map(value => [`${value.id}:${value.start}:${value.end}`, value])).values()],
      unknown: alternative.unknown, violations: alternative.violations, sourceCoverage: preview.sourceCoverage,
      recurringScope: input.record.occurrenceDate ? 'once' : original.recurrence ? 'series' : 'single',
      assessedOccurrence: afterOccurrence, fetchedAt: this.store.kernel.clock.now(), applied: false };
  }

  /** Resolve only an address actually selected in native UI. This reads the
   * current owner and never promotes a trial into authored prose or approval. */
  resolveReference(handle: ScopeHandle, raw: AgendaFocus) {
    const focus = agendaFocusSchema.parse(raw), item = this.record(handle, focus.record);
    const occurrence = this.instance(item, focus.record, this.store.settings().timeZone || 'Asia/Shanghai');
    let trial: { proposedStart: string; proposedEnd: string; durationMinutes: number; executionAuthorized: false } | undefined;
    if (focus.trial) {
      if (!occurrence?.end || !occurrence.item.durationMinutes || item.done || item.allDayDate)
        throw new HarnessError('agenda_trial', '这次还不能整段试挪，先看看原来的时间和时长。');
      const proposedStart = new Date(focus.trial.proposedStart).toISOString();
      trial = { proposedStart, proposedEnd: new Date(Date.parse(proposedStart) + occurrence.item.durationMinutes * MINUTE).toISOString(),
        durationMinutes: occurrence.item.durationMinutes, executionAuthorized: false };
    }
    this.readable(handle);
    return { reference: focus.record, item, occurrence, ...(trial ? { trial } : {}),
      meaning: '这是本人在今天页明确指向的本机安排及当前修订。重复实例保留原发生日期；试放是临时条件，尚未评估可行，也不是本人逐字原话、长期偏好或修改许可。继续讨论沿原对象，实际修改仍需当前版本和原动作事务。' };
  }
}
