import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Undo2,
  X,
} from 'lucide-react';
import type { Action, State } from '../shared/types';
import { IconButton, PagePanel, uiError } from './ui';
import { WorkAndReceipts } from './HarnessViews';
import {
  AgendaEditor,
  MatterCard,
  PreparationShelf,
  type MatterInteraction,
  type MatterInteractionUpdate,
} from './LifePanels';
import { DEFAULT_TIME_ZONE, formatDateTime, timeZoneLabel, toTimeInput } from './time';
import type { SharedMatterView } from '../shared/presentation';
import type { CampusScheduleBlock } from '../shared/campus-calendar';
import type { AgendaDayResult, AgendaFocus, AgendaOccurrence, AgendaReference } from '../shared/agenda';
import './today.css';
import { TodayNavigation } from './TodayNavigation';
import { CalendarHandoff } from './CalendarHandoff';
import { CampusDayControls, CampusScheduleRow, useCampusDaySchedule } from './CampusDaySchedule';
import { AgendaDayTimeline, agendaDayWindow, agendaTimedRange, campusTimedRange } from './AgendaDayTimeline';
import { workspaceReturnAddressSchema, type AgendaReturnAddress } from './workspace-return';

export type WorkspaceView = 'chat' | 'agenda' | 'keep' | 'notes' | 'materials' | 'memory' | 'settings' | 'companion';
type AgendaScope = 'day' | 'all' | 'undated' | 'completed';
export interface AgendaViewPosition { selectedDate: string; scope: AgendaScope; dayLayout: 'timeline' | 'list'; query: string }
type AgendaEdit = { original: Action; initialStartsAt?: string; trialDurationMinutes?: number | null; occurrenceDate?: string; occurrenceId?: string; restoreRequestId?: number };
type AgendaMoveUndo = { previous: Action; saved: Action; occurrenceDate?: string; previousAt?: string; savedAt?: string; error?: string };

// Civil dates stay independent of the operating system's time zone. All-day
// dates are already civil dates and must never be shifted through an instant.
function actionDate(item: Action, zone: string) {
  return item.allDayDate || toTimeInput(item.startsAt, zone).slice(0, 10);
}
function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
function dateLabel(date: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('zh-CN', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    ...options,
  });
}
function repeatLabel(item: Action) {
  const rule = item.recurrence;
  if (!rule) return '';
  const interval = rule.interval || 1;
  const unit = { daily: '天', weekly: '周', monthly: '个月', yearly: '年' }[rule.frequency];
  const weekdays = rule.weekdays
    ?.map((day) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day])
    .join('、');
  return `每${interval === 1 ? '' : ` ${interval} `}${unit}${weekdays ? ` · ${weekdays}` : ''}`;
}

export function AgendaView({
  active = true,
  state,
  onAction,
  onResume,
  onChanged,
  onClose,
  onCompose,
  onContinue,
  onState,
  onPresentMatter,
  onMap,
  onDiscuss,
  onOpenOrigin,
  position,
  focus,
  onPositionChange,
  onReturnAddressChange,
  resume,
  matterInteractions,
  onMatterInteraction,
}: {
  active?: boolean;
  state: State;
  onAction: (item: Action, action: 'done' | 'delete') => void;
  onResume: (id: string) => void;
  onChanged: () => void;
  onClose: () => void;
  onCompose: () => void;
  onContinue: (text: string) => void;
  onState: (state: State) => void;
  onPresentMatter: (matter: SharedMatterView) => void;
  onMap: (id: string) => void;
  onDiscuss?: (focus: AgendaFocus, label: string) => void;
  onOpenOrigin?: (record: AgendaReference) => void;
  position?: AgendaViewPosition;
  focus?: AgendaFocus;
  onPositionChange?: (position: AgendaViewPosition) => void;
  onReturnAddressChange?: (address: AgendaReturnAddress | undefined) => void;
  resume?: { address: AgendaReturnAddress; requestId: number };
  matterInteractions: Record<string, MatterInteraction>;
  onMatterInteraction: (id: string, value: MatterInteractionUpdate) => void;
}) {
  const zone = state.settings.timeZone || DEFAULT_TIME_ZONE;
  const [today, setToday] = useState(() => toTimeInput(new Date().toISOString(), zone).slice(0, 10));
  const [selectedDate, setSelectedDate] = useState(position?.selectedDate || today);
  const [section, setSection] = useState<'agenda' | 'entrusted'>('agenda');
  const [scope, setScope] = useState<AgendaScope>(position?.scope || 'day');
  const [query, setQuery] = useState(position?.query || '');
  const [editing, setEditing] = useState<AgendaEdit | undefined>(() => {
    const owner = focus && state.agenda.find(item => item.id === focus.record.id && (item.revision || 1) === focus.record.revision);
    return owner && focus ? { original: { ...owner }, occurrenceDate: focus.record.occurrenceDate,
      occurrenceId: focus.record.occurrenceDate ? `${owner.id}::${focus.record.occurrenceDate}` : owner.id,
      initialStartsAt: focus.trial?.proposedStart, trialDurationMinutes: focus.trial?.durationMinutes } : undefined;
  });
  const [dayLayout, setDayLayout] = useState<'timeline' | 'list'>(position?.dayLayout || 'timeline');
  const [dayRead, setDayRead] = useState<{ key: string; result: AgendaDayResult }>();
  const [dayError, setDayError] = useState('');
  const [dayAttempt, setDayAttempt] = useState(0);
  const dayGeneration = useRef(0);
  const zoneRef = useRef(zone);
  const positionCallback = useRef(onPositionChange);
  positionCallback.current = onPositionChange;
  const [moveUndo, setMoveUndo] = useState<AgendaMoveUndo>();
  const [undoing, setUndoing] = useState(false);
  const [undoAnnouncement, setUndoAnnouncement] = useState('');
  const [returnError, setReturnError] = useState('');
  const [returnCurrentId, setReturnCurrentId] = useState<string>();
  const lastResume = useRef<number | undefined>(undefined);
  const pendingResume = useRef<number | undefined>(undefined);
  const resumeIntent = useRef(0);
  const restoreFocus = useRef<{ id: string; revision: number; occurrenceId: string; date: string } | undefined>(undefined);
  const returnCallback = useRef(onReturnAddressChange);
  returnCallback.current = onReturnAddressChange;
  const [attention, setAttention] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef(0);
  const restorePosition = useRef(true);
  const lastFocus = useRef<HTMLElement | null>(null);
  const viewingBoundary = JSON.stringify([state.privacyEpoch, state.policyRevision, state.sourceBoundary, state.presentation?.mode || 'private']);
  const previousBoundary = useRef(viewingBoundary);
  const returnContext = useRef({ state, active, zone, boundary: viewingBoundary });
  returnContext.current = { state, active, zone, boundary: viewingBoundary };
  useEffect(() => {
    if (!editing && (pendingResume.current === resume?.requestId && pendingResume.current !== undefined
      || active && resume && lastResume.current !== resume.requestId)) return;
    const address = editing && previousBoundary.current === viewingBoundary && state.presentation?.mode !== 'public' ? {
      record: { id: editing.original.id, revision: editing.original.revision || 1,
        ...(editing.occurrenceDate ? { occurrenceDate: editing.occurrenceDate } : {}) },
      timeZone: editing.original.timeZone || zone,
      ...(editing.initialStartsAt ? { trial: { proposedStart: editing.initialStartsAt,
        ...(editing.trialDurationMinutes !== undefined ? { durationMinutes: editing.trialDurationMinutes } : {}) } } : {}),
    } : undefined;
    const parsed = address && workspaceReturnAddressSchema.safeParse({ view: 'agenda', agenda: address });
    returnCallback.current?.(parsed && parsed.success ? parsed.data.agenda : undefined);
  }, [editing?.original.id, editing?.original.revision, editing?.occurrenceDate, editing?.initialStartsAt,
    editing?.trialDurationMinutes, zone, state.presentation?.mode, viewingBoundary, active, resume?.requestId, returnError]);
  useEffect(() => {
    if (!active || !resume || lastResume.current === resume.requestId) return;
    lastResume.current = resume.requestId;
    pendingResume.current = resume.requestId;
    const intent = ++resumeIntent.current;
    let live = true;
    const parsed = workspaceReturnAddressSchema.safeParse({ view: 'agenda', agenda: resume.address });
    const address = parsed.success ? parsed.data.agenda : undefined;
    const currentOwner = address && state.agenda.find(item => item.id === address.record.id);
    const owner = currentOwner && (currentOwner.revision || 1) === address?.record.revision ? currentOwner : undefined;
    if (!address || !owner || state.presentation?.mode === 'public' || address.record.occurrenceDate && !owner.recurrence
      || address.trial && (owner.done || owner.allDayDate)
      || address.timeZone !== (owner.timeZone || zone)) {
      setReturnError(state.presentation?.mode === 'public' ? '回到自己的对话后，再打开这份安排。'
        : !address ? '这张书签现在打不开，可以从当天安排重新接上。'
          : !currentOwner ? '现在没找到书签里的这件事，可以看看当天安排。'
            : !owner ? '这件事后来改过，先看看现在这一版。'
              : address.timeZone !== (owner.timeZone || zone) ? '先按现在的时区，重新看看这件事。'
                : '这一次现在不能按原来的时段试放，可以看看目前的安排。');
      setReturnCurrentId(state.presentation?.mode !== 'public' ? currentOwner?.id : undefined);
      pendingResume.current = undefined;
      if (!editing) returnCallback.current?.(undefined);
      return;
    }
    const intended = () => {
      const context = returnContext.current;
      return live && context.active && context.boundary === viewingBoundary && context.zone === zone
        && lastResume.current === resume.requestId && resumeIntent.current === intent;
    };
    const current = () => intended() && returnContext.current.state.agenda.some(item => item.id === owner.id
      && (item.revision || 1) === address.record.revision);
    void (async () => {
      let start = owner.startsAt, occurrenceId = owner.id;
      if (address.record.occurrenceDate) {
        const exception = owner.exceptions?.find(value => value.onDate === address.record.occurrenceDate);
        const date = exception?.startsAt ? toTimeInput(exception.startsAt, address.timeZone).slice(0, 10) : address.record.occurrenceDate;
        if (typeof state.privacyEpoch !== 'number' || typeof state.policyRevision !== 'number' || typeof state.sourceBoundary !== 'number')
          throw new Error('重新打开这件事后，就可以接着看了。');
        const day = await window.zaichang.agendaDay({ date, timeZone: address.timeZone, privacyEpoch: state.privacyEpoch,
          policyRevision: state.policyRevision, sourceBoundary: state.sourceBoundary });
        if (!current()) { if (intended()) throw new Error('这件事后来改过，先看看现在这一版。'); return; }
        const occurrence = day.items.find(item => item.record.id === owner.id && item.record.revision === address.record.revision
          && item.record.occurrenceDate === address.record.occurrenceDate);
        if (!occurrence) throw new Error('这一次的安排后来有了变化，先看看现在这一版。');
        start = occurrence.start; occurrenceId = occurrence.occurrenceId;
      }
      if (!current()) { if (intended()) throw new Error('这件事后来改过，先看看现在这一版。'); return; }
      // Owner instants are shown in the current view's zone; all-day dates
      // remain civil dates. A recurrence's original date is not an instant.
      const date = owner.allDayDate && !address.trial ? address.record.occurrenceDate || owner.allDayDate
        : toTimeInput(address.trial?.proposedStart || start, zone).slice(0, 10);
      if (!date) throw new Error('这件事还没定日期，可以从全部安排里继续。');
      pendingResume.current = undefined;
      setReturnError(''); setReturnCurrentId(undefined); setSection('agenda'); setScope('day'); setQuery(''); setDayLayout('timeline'); setSelectedDate(date);
      restoreFocus.current = { id: owner.id, revision: owner.revision || 1, date, occurrenceId };
      setEditing(value => value?.original.id === owner.id && (value.original.revision || 1) === address.record.revision
        && value.occurrenceDate === address.record.occurrenceDate && value.initialStartsAt === address.trial?.proposedStart
        && value.trialDurationMinutes === address.trial?.durationMinutes ? value : {
          original: { ...owner }, occurrenceDate: address.record.occurrenceDate, occurrenceId,
          initialStartsAt: address.trial?.proposedStart, trialDurationMinutes: address.trial?.durationMinutes, restoreRequestId: resume.requestId,
        });
    })().catch(error => {
      if (!intended()) return;
      pendingResume.current = undefined;
      setReturnError(uiError(error)); setReturnCurrentId(returnContext.current.state.agenda.some(item => item.id === owner.id) ? owner.id : undefined);
      if (!editing) returnCallback.current?.(undefined);
    }).finally(() => { if (pendingResume.current === resume.requestId) pendingResume.current = undefined; });
    return () => { live = false; if (pendingResume.current === resume.requestId) pendingResume.current = undefined; };
  }, [active, resume?.requestId, viewingBoundary, zone]);
  useEffect(() => {
    if (previousBoundary.current !== viewingBoundary) {
      previousBoundary.current = viewingBoundary;
      setEditing(undefined); setMoveUndo(undefined); setReturnError(''); setReturnCurrentId(undefined); restoreFocus.current = undefined;
    }
  }, [viewingBoundary]);
  useEffect(() => {
    if (!active) return;
    const update = () => setToday(toTimeInput(new Date().toISOString(), zone).slice(0, 10));
    update();
    const timer = window.setInterval(update, 60000);
    return () => window.clearInterval(timer);
  }, [zone, active]);
  useEffect(() => {
    if (zoneRef.current === zone) return;
    zoneRef.current = zone;
    setSelectedDate(toTimeInput(new Date().toISOString(), zone).slice(0, 10));
  }, [zone]);
  useEffect(() => {
    positionCallback.current?.({ selectedDate, scope, dayLayout, query });
  }, [selectedDate, scope, dayLayout, query]);

  const search = query.trim().toLocaleLowerCase();
  const dayWindow = useMemo(() => agendaDayWindow(selectedDate, zone), [selectedDate, zone]);
  const nativeDayVisible = section === 'agenda' && scope === 'day' && !search && state.presentation?.mode !== 'public';
  const nativeBoundary = typeof state.privacyEpoch === 'number' && typeof state.policyRevision === 'number' && typeof state.sourceBoundary === 'number'
    ? { privacyEpoch: state.privacyEpoch, policyRevision: state.policyRevision, sourceBoundary: state.sourceBoundary } : undefined;
  const dayKey = JSON.stringify([selectedDate, zone, state.privacyEpoch, state.policyRevision, state.sourceBoundary,
    state.agenda.map(item => [item.id, item.revision || 1]), dayAttempt]);
  useEffect(() => {
    const request = ++dayGeneration.current;
    setDayError('');
    if (!nativeDayVisible || !nativeBoundary) return;
    void window.zaichang.agendaDay({ date: selectedDate, timeZone: zone, ...nativeBoundary }).then(result => {
      if (dayGeneration.current === request) setDayRead({ key: dayKey, result });
    }).catch(error => {
      if (dayGeneration.current === request) setDayError(uiError(error));
    });
    return () => { dayGeneration.current++; };
  }, [dayKey, nativeDayVisible]);
  const currentDay = nativeDayVisible && dayRead?.key === dayKey ? dayRead.result : undefined;
  const retainedDay = nativeDayVisible && dayRead?.result.date === selectedDate && dayRead.result.timeZone === zone
    && dayRead.result.privacyEpoch === state.privacyEpoch && dayRead.result.policyRevision === state.policyRevision
    && dayRead.result.sourceBoundary === state.sourceBoundary ? dayRead.result : undefined;
  const nativeDay = currentDay || retainedDay;
  const dayLoading = nativeDayVisible && !!nativeBoundary && !currentDay && !dayError;
  useEffect(() => {
    const pending = restoreFocus.current;
    if (!pending || !active || dayLoading || !host.current) return;
    if (selectedDate !== pending.date || editing?.original.id !== pending.id || (editing.original.revision || 1) !== pending.revision) return;
    restoreFocus.current = undefined;
    const intent = resumeIntent.current;
    const frame = requestAnimationFrame(() => {
      if (!host.current || host.current.hidden || resumeIntent.current !== intent) return;
      const source = [...host.current.querySelectorAll<HTMLButtonElement>('[data-occurrence-id]')]
        .find(node => node.dataset.occurrenceId === pending.occurrenceId);
      source?.scrollIntoView({ block: matchMedia('(max-width: 820px)').matches ? 'start' : 'center' });
      const field = host.current.querySelector<HTMLInputElement>('.agenda-editor input[aria-label="安排开始时间"]')
        || host.current.querySelector<HTMLInputElement>('.agenda-editor input:not(:disabled)');
      field?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, dayLoading, selectedDate, editing?.original.id, editing?.original.revision, editing?.restoreRequestId, resume?.requestId]);
  const earlierUnknown = nativeDay?.issues.filter(issue => issue.status === 'unknown_end' && issue.startsAt
    && !nativeDay.items.some(value => value.record.id === issue.id && value.start === issue.startsAt)) || [];
  const campusDayVisible =
    active && section === 'agenda' && scope === 'day' && !search && state.presentation?.mode !== 'public';
  const connector = state.campusConnector;
  const campusBoundary = JSON.stringify([
    state.privacyEpoch,
    state.policyRevision,
    state.sourceBoundary,
    state.presentation?.mode || 'private',
    connector?.configured,
    connector?.available,
    connector?.sourceKind,
    connector?.credentialsConfigured,
  ]);
  const campus = useCampusDaySchedule({
    date: selectedDate,
    nextDate: shiftDate(selectedDate, 1),
    timeZone: zone,
    active: campusDayVisible,
    boundary: campusBoundary,
  });
  useLayoutEffect(() => {
    if (!active) { restorePosition.current = true; return; }
    const previous = lastFocus.current;
    const focus = previous?.isConnected && previous.getClientRects().length
      && !previous.matches(':disabled') ? previous : host.current?.querySelector<HTMLElement>('h1');
    focus?.focus({ preventScroll: true });
  }, [active]);
  useLayoutEffect(() => {
    if (!active || !restorePosition.current) return;
    const panel = host.current?.querySelector<HTMLElement>('.page-panel');
    if (panel) panel.scrollTop = scrollPosition.current;
    // A visible campus day is re-read on return. Its rows can restore the
    // page's original height; do not replace the saved position while loading.
    if (!campus.loading) restorePosition.current = false;
  }, [active, campus.loading, campus.result]);
  const ordered = [...state.agenda].sort((a, b) => {
    const first = actionDate(a, zone) || '9999';
    const second = actionDate(b, zone) || '9999';
    return (
      first.localeCompare(second) ||
      Number(!!b.allDayDate) - Number(!!a.allDayDate) ||
      (a.startsAt || '').localeCompare(b.startsAt || '')
    );
  });
  const repeated = ordered.filter((item) => !item.done && item.recurrence);
  const filtered = ordered.filter((item) => {
    if (search) return `${item.title} ${item.detail}`.toLocaleLowerCase().includes(search);
    if (scope === 'completed') return !!item.done;
    if (item.done || item.recurrence) return false;
    if (scope === 'all') return true;
    const date = actionDate(item, zone);
    if (scope === 'undated') return !date;
    const timed = agendaTimedRange(item);
    return (
      date === selectedDate ||
      !!(dayWindow && timed && timed.start < dayWindow.end && timed.end > dayWindow.start)
    );
  });
  const grouped = new Map<string, Action[]>();
  for (const item of filtered) {
    const date = actionDate(item, zone);
    grouped.set(date, [...(grouped.get(date) || []), item]);
  }
  const dayEntries: ({ kind: 'action'; item: Action; occurrence?: AgendaOccurrence } | { kind: 'campus'; item: CampusScheduleBlock })[] = [
    ...(nativeDay ? nativeDay.items.map(occurrence => ({ kind: 'action' as const, item: occurrence.item, occurrence }))
      : filtered.map((item) => ({ kind: 'action' as const, item }))),
    ...(campus.result?.items || []).map((item) => ({ kind: 'campus' as const, item })),
  ];
  dayEntries.sort((a, b) => {
    const first =
      a.kind === 'action'
        ? a.item.allDayDate
          ? -Infinity
          : a.item.startsAt
            ? Date.parse(a.item.startsAt)
            : Infinity
        : Date.parse(a.item.start);
    const second =
      b.kind === 'action'
        ? b.item.allDayDate
          ? -Infinity
          : b.item.startsAt
            ? Date.parse(b.item.startsAt)
            : Infinity
        : Date.parse(b.item.start);
    return first === second ? a.item.id.localeCompare(b.item.id) : first - second;
  });
  const timedActions = filtered.filter((item) => !!agendaTimedRange(item));
  const timedCampus = (campus.result?.items || []).filter((item) => !!campusTimedRange(item));
  const trialStart = editing?.initialStartsAt ? Date.parse(editing.initialStartsAt) : NaN;
  const trialMinutes = editing?.trialDurationMinutes === null ? null : editing?.trialDurationMinutes ?? editing?.original.durationMinutes;
  const trialEnd = Number.isFinite(trialStart) && trialMinutes ? trialStart + trialMinutes * 60000 : trialStart;
  const hasTrialOnDay = !!dayWindow && Number.isFinite(trialStart) && trialStart < dayWindow.end
    && (trialMinutes ? trialEnd > dayWindow.start : trialStart >= dayWindow.start);
  const hasTimeline = !!(nativeDay?.window || dayWindow) && !!((nativeDay
    ? nativeDay.items.some(value => !value.item.allDayDate && !!value.end) : timedActions.length) || timedCampus.length || hasTrialOnDay);
  const showTimeline = scope === 'day' && !search && dayLayout === 'timeline' && hasTimeline;
  const untimedEntries = dayEntries.filter((entry) =>
    entry.kind === 'action' ? entry.occurrence ? !!entry.item.allDayDate || !entry.occurrence.end : !agendaTimedRange(entry.item)
      : !campusTimedRange(entry.item),
  );
  const heading = section === 'entrusted' ? '你交给我的事' : selectedDate === today ? '今天' : '这一天';

  function closeEditor() {
    const occurrenceId = editing?.occurrenceId || editing?.original.id;
    setEditing(undefined);
    restoreFocus.current = undefined;
    const intent = resumeIntent.current;
    requestAnimationFrame(() => {
      if (!active || !host.current || host.current.hidden || resumeIntent.current !== intent) return;
      const source = [...host.current.querySelectorAll<HTMLButtonElement>('[data-occurrence-id]')]
        .find(node => node.dataset.occurrenceId === occurrenceId);
      (source && !source.disabled ? source : host.current.querySelector<HTMLElement>('.page-heading h1'))?.focus({ preventScroll: true });
    });
  }
  function focusEditor(time = false) {
    const intent = resumeIntent.current;
    requestAnimationFrame(() => {
      if (!active || !host.current || host.current.hidden || resumeIntent.current !== intent) return;
      const first = host.current.querySelector<HTMLInputElement>(time ? '.agenda-editor input[aria-label="安排开始时间"]'
        : '.agenda-editor input[aria-label="安排标题"]');
      const field = first && !first.disabled ? first : host.current.querySelector<HTMLInputElement>('.agenda-editor input[aria-label="安排开始时间"]')
        || host.current.querySelector<HTMLInputElement>('.agenda-editor input:not(:disabled)');
      field?.focus({ preventScroll: true });
    });
  }
  function takeOverReturn() {
    resumeIntent.current++; pendingResume.current = undefined; restoreFocus.current = undefined;
    if (!editing) returnCallback.current?.(undefined);
  }

  async function undoMove() {
    if (!moveUndo || undoing) return;
    const operation = moveUndo;
    setUndoing(true);
    try {
      const fresh = await window.zaichang.state();
      onState(fresh);
      const current = fresh.agenda.find((item) => item.id === operation.saved.id);
      if (!current) throw new Error('这件事已经移除了，不能直接放回。原来的时间仍记在这里。');
      if ((current.revision || 1) !== (operation.saved.revision || 1)) {
        throw new Error('这件事后来又改过，先看看现在的安排，再决定是否改回原时间。');
      }
      // Restore only this move's time fields. Keep the same object and ask the
      // host to compare-and-swap the revision read immediately above.
      const next = await window.zaichang.action({
        action: 'save',
        item: operation.occurrenceDate ? {
          ...current,
          exceptions: [...(current.exceptions || []).filter(value => value.onDate !== operation.occurrenceDate),
            ...(operation.previous.exceptions || []).filter(value => value.onDate === operation.occurrenceDate)],
        } : {
          ...current,
          startsAt: operation.previous.startsAt,
          timeZone: operation.previous.timeZone,
          durationMinutes: operation.previous.durationMinutes,
        },
      });
      onState(next);
      setMoveUndo(undefined);
      setUndoAnnouncement(`已把 ${operation.saved.title} 放回原来的时间。`);
    } catch (error) {
      setMoveUndo({ ...operation, error: uiError(error) });
      try {
        onState(await window.zaichang.state());
      } catch {
        /* Keep the undo context available. */
      }
    } finally {
      setUndoing(false);
    }
  }

  function row(item: Action, series = false, occurrence?: AgendaOccurrence) {
    const owner = state.agenda.find(value => value.id === item.id) || item;
    const clock = item.allDayDate
      ? '全天'
      : item.startsAt
        ? toTimeInput(item.startsAt, zone).slice(11, 16)
        : '随时';
    const end =
      item.startsAt && item.durationMinutes
        ? toTimeInput(
            new Date(Date.parse(item.startsAt) + item.durationMinutes * 60000).toISOString(),
            zone,
          ).slice(11, 16)
        : '';
    const originDate = actionDate(item, zone);
    const sourceClock =
      item.timeZone && item.timeZone !== zone && item.startsAt
        ? `${toTimeInput(item.startsAt, item.timeZone).replace('T', ' ')} · ${timeZoneLabel(item.timeZone)}`
        : '';
    return (
      <article className={`today-item ${item.done ? 'is-done' : ''}`} key={occurrence?.occurrenceId || item.id}>
        <div className="today-item-time">
          <span>{clock}</span>
          {end && <small>{end}</small>}
        </div>
        <div className="today-item-paper">
          <IconButton
            label={
              item.done
                ? `做过的事：${item.title}`
                : `${series || owner.recurrence ? '完成整个重复安排' : '记下这件事做完了'}：${item.title}`
            }
            disabled={item.done || dayLoading}
            onClick={() => onAction(owner, 'done')}
          >
            {item.done ? <Check size={18} /> : <Circle size={19} />}
          </IconButton>
          <button
            type="button"
            className="today-item-content"
            data-occurrence-id={occurrence?.occurrenceId || owner.id}
            disabled={dayLoading}
            aria-label={`修改：${item.title}`}
            onClick={() => { restoreFocus.current = undefined;
              setEditing({ original: { ...owner }, occurrenceDate: occurrence?.record.occurrenceDate, occurrenceId: occurrence?.occurrenceId }); focusEditor(); }}
          >
            <strong>{item.title}</strong>
            {item.detail && <span className="today-item-detail">{item.detail}</span>}
            {(series || sourceClock || item.demo || item.coverage === 'conditional' && !!item.missingNeeds?.length || item.done) && (
              <span className="today-item-context">
                {series && (
                  <span>
                    {repeatLabel(item)}
                    {originDate ? ` · 从 ${dateLabel(originDate, { weekday: undefined })} 开始` : ''}
                    {item.exceptions?.length ? ' · 有单次调整' : ''}
                  </span>
                )}
                {sourceClock && <span>{sourceClock}</span>}
                {item.done && <span>做过的事</span>}
                {item.demo && <span>体验时留下的安排</span>}
                {item.coverage === 'conditional' && !!item.missingNeeds?.length && <span>出发前，还有条件需要看看</span>}
              </span>
            )}
          </button>
          {!occurrence?.record.occurrenceDate && <IconButton
            label={`移除${owner.recurrence ? '整个重复安排' : ''}：${item.title}`}
            className="today-item-remove"
            onClick={() => onAction(owner, 'delete')}
          >
            <X size={15} />
          </IconButton>}
        </div>
      </article>
    );
  }

  const editingOccurrence = editing ? nativeDay?.items.find(value => value.occurrenceId === editing.occurrenceId) : undefined;
  const inlineEditing = !!editing && section === 'agenda' && scope === 'day' && !search;
  function renderEditor(embedded: boolean) {
    if (!editing) return null;
    return <AgendaEditor key={`${editing.original.id}:${editing.original.revision || 1}:${editing.occurrenceDate || 'series'}`} embedded={embedded}
      original={editing.original} current={state.agenda.find(item => item.id === editing.original.id)}
      timeZone={zone} initialStartsAt={editing.initialStartsAt} initialOccurrenceDate={editing.occurrenceDate}
      initialDurationMinutes={editing.trialDurationMinutes} restoreRequestId={editing.restoreRequestId}
      boundary={nativeBoundary} includeCampus={campus.enabled} onDiscuss={onDiscuss} onOpenOrigin={onOpenOrigin} onMap={onMap}
      calendarVersionKey={dayKey}
      onReload={item => { restoreFocus.current = undefined; setEditing(value => value ? { original: { ...item },
        ...(item.recurrence && value.occurrenceDate ? { occurrenceDate: value.occurrenceDate,
          occurrenceId: `${item.id}::${value.occurrenceDate}` } : { occurrenceId: item.id }) } : value); focusEditor(); }}
      onTrialChange={(startsAt, durationMinutes) => setEditing(value => value
        && (value.initialStartsAt !== startsAt || value.trialDurationMinutes !== durationMinutes)
        ? { ...value, initialStartsAt: startsAt, trialDurationMinutes: durationMinutes } : value)}
      onState={onState} onSaved={(saved, previous, timing) => {
        if (timing?.kind === 'time_change' || !timing && editing.initialStartsAt) {
          setMoveUndo({ previous: { ...previous }, saved: { ...saved }, occurrenceDate: timing ? timing.occurrenceDate : editing.occurrenceDate,
            previousAt: timing?.before || editingOccurrence?.start || previous.startsAt, savedAt: timing?.after || editing.initialStartsAt });
          setUndoAnnouncement('');
        }
      }} onClose={closeEditor} />;
  }

  return (
    <div className="today-workspace" ref={host} hidden={!active} inert={!active}
      onPointerDownCapture={takeOverReturn}
      onKeyDownCapture={takeOverReturn}
      onKeyDown={event => {
        if (!event.defaultPrevented && event.key === 'Escape' && editing
          && !(event.target instanceof HTMLElement && event.target.closest('.agenda-editor'))) {
          event.preventDefault(); event.stopPropagation(); closeEditor();
        }
      }}
      onFocusCapture={event => { if (active) lastFocus.current = event.target as HTMLElement; }}
      onScrollCapture={event => {
        if (active && !restorePosition.current && event.target instanceof HTMLElement
          && event.target.classList.contains('page-panel')) scrollPosition.current = event.target.scrollTop;
      }}>
    <PagePanel
      title={heading}
      onClose={onClose}
      className={`agenda-page today-page ${section === 'entrusted' ? 'is-entrusted' : ''}`}
      headingContent={<TodayNavigation selectedDate={selectedDate} today={today} timeZoneLabel={timeZoneLabel(zone)}
        section={section} scope={scope} query={query} dayLayout={dayLayout} hasTimeline={hasTimeline} attention={attention}
        onDateChange={date => { setSelectedDate(date); setScope('day'); setQuery(''); }}
        onSectionChange={setSection} onScopeChange={value => { setScope(value); setQuery(''); }}
        onQueryChange={setQuery} onLayoutChange={setDayLayout} onCompose={onCompose}
        onDiscussDay={() => onContinue(`我们接着聊 ${selectedDate} 这一天的安排。`)}
        campusTools={state.presentation?.mode !== 'public'
          ? <CampusDayControls campus={campus} dayVisible={campusDayVisible} timeZone={zone} /> : undefined}
        calendarTools={<CalendarHandoff date={selectedDate} timeZone={zone} />} />}
    >
      <div className={`today-page-layout ${inlineEditing ? 'has-current-object' : ''}`}>
      <div className="today-main">
      <div id="today-agenda-panel" role="region" aria-label="安排" hidden={section !== 'agenda'}>
        {search && <p className="today-search-note">在所有日期的本机安排里找「{query.trim()}」</p>}
        {moveUndo && (
          <div className="today-move-undo" role="status">
            <div>
              <p>
                <strong>{moveUndo.saved.title}</strong> · {formatDateTime(moveUndo.savedAt || moveUndo.saved.startsAt!, zone)}
              </p>
              {moveUndo.error && (
                <p className="today-move-undo-error">
                  {moveUndo.error} 原来是 {formatDateTime(moveUndo.previousAt || moveUndo.previous.startsAt!, zone)}。
                </p>
              )}
            </div>
            {moveUndo.error ? (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  const current = state.agenda.find((item) => item.id === moveUndo.saved.id);
                  if (current) setEditing({ original: { ...current } });
                }}
                disabled={!state.agenda.some((item) => item.id === moveUndo.saved.id)}
              >
                看看现在
              </button>
            ) : (
              <button
                type="button"
                className="text-button"
                onClick={() => void undoMove()}
                disabled={undoing}
              >
                <Undo2 size={14} />
                {undoing ? '正在放回…' : '撤回挪动'}
              </button>
            )}
            <IconButton label="收起这次改动" disabled={undoing} onClick={() => setMoveUndo(undefined)}>
              <X size={14} />
            </IconButton>
          </div>
        )}
        <div className="sr-only" role="status" aria-live="polite">
          {undoAnnouncement}
        </div>
        {returnError && <div className="today-calendar-problem" role="status"><span>{returnError}</span>
          {returnCurrentId && <button type="button" className="text-button" onClick={() => {
            const owner = state.agenda.find(item => item.id === returnCurrentId);
            if (!owner) return;
            const date = actionDate(owner, owner.timeZone || zone);
            if (date) { setSelectedDate(date); setScope('day'); } else setScope('undated');
            setQuery(''); setSection('agenda'); setEditing({ original: { ...owner }, occurrenceId: owner.id });
            setReturnError(''); setReturnCurrentId(undefined);
          }}>看看现在</button>}
          <button type="button" className="text-button" onClick={() => { setReturnError(''); setReturnCurrentId(undefined); }}>收起</button></div>}
        {dayError && <div className="today-calendar-problem" role="status"><span>{dayError}</span>
          <button type="button" className="text-button" onClick={() => setDayAttempt(value => value + 1)}>再读一次</button></div>}
        <div className="today-workspace">
        <div className={`today-agenda-list ${scope === 'day' && !search ? 'one-day' : ''}`} aria-busy={dayLoading}>
          {dayLoading && !dayEntries.length && <p className="today-day-loading" role="status">正在翻开这一天的安排…</p>}
          {scope === 'day' && !search
            ? (!!dayEntries.length || hasTrialOnDay) && (
                <section className="today-day-group">
                  {showTimeline && (
                    <AgendaDayTimeline
                      active={active}
                      date={selectedDate}
                      timeZone={zone}
                      actions={timedActions}
                      occurrences={nativeDay?.items}
                      campus={timedCampus}
                      window={nativeDay?.window}
                      disabled={dayLoading}
                      sourceBoundaryKey={viewingBoundary}
                      selectedOccurrenceId={editing?.occurrenceId || editing?.original.id}
                      onViewDate={date => { setSelectedDate(date); setScope('day'); setQuery(''); }}
                      draft={
                        editing?.initialStartsAt
                          ? { original: editingOccurrence?.item || editing.original, initialStartsAt: editing.initialStartsAt, durationMinutes: editing.trialDurationMinutes,
                            occurrenceId: editing.occurrenceId, reference: { id: editing.original.id, revision: editing.original.revision || 1,
                              ...(editing.occurrenceDate ? { occurrenceDate: editing.occurrenceDate } : {}) } }
                          : undefined
                      }
                      onEdit={(item, reference) => { restoreFocus.current = undefined;
                        setEditing({ original: { ...(state.agenda.find(value => value.id === reference.id) || item) },
                          occurrenceDate: reference.occurrenceDate, occurrenceId: reference.occurrenceDate ? `${reference.id}::${reference.occurrenceDate}` : reference.id }); focusEditor(); }}
                      onPropose={(_item, initialStartsAt, reference, occurrenceId) => {
                        const owner = state.agenda.find(value => value.id === reference.id
                          && (value.revision || 1) === reference.revision);
                        if (dayLoading || !owner) return;
                        restoreFocus.current = undefined;
                        setEditing({ original: { ...owner }, initialStartsAt,
                          occurrenceDate: reference.occurrenceDate, occurrenceId });
                        focusEditor(true);
                      }}
                    />
                  )}
                  {(showTimeline ? untimedEntries : dayEntries).map((entry) =>
                    entry.kind === 'action' ? (
                      row(entry.item, false, entry.occurrence)
                    ) : (
                      <CampusScheduleRow
                        key={entry.item.id}
                        item={entry.item}
                        date={selectedDate}
                        timeZone={zone}
                      />
                    ),
                  )}
                </section>
              )
            : [...grouped]
                .sort(([a], [b]) => (a || '9999').localeCompare(b || '9999'))
                .map(([date, items]) => (
                  <section className="today-day-group" key={date || 'undated'}>
                    {(scope !== 'day' || search) && (
                      <h2>{date ? dateLabel(date, { year: 'numeric' }) : '还没定日期'}</h2>
                    )}
                    {items.map((item) => row(item, !!item.recurrence))}
                  </section>
                ))}
          {!dayLoading && !hasTrialOnDay && !earlierUnknown.length && !(scope === 'day' && !search ? dayEntries.length : filtered.length) && !campus.result?.items.length && (
            <div className="today-empty">
              <span className="today-empty-line" aria-hidden="true" />
              <h2>
                {search
                  ? '还没找到这件事。'
                  : scope === 'completed'
                    ? '做完的事，会留在这里。'
                    : scope === 'undated'
                      ? '想到的事，可以先放在这里。'
                      : scope === 'all'
                        ? '还没有记下安排。'
                        : '这一天，还没有记下的安排。'}
              </h2>
            </div>
          )}
        </div>
        </div>
        {earlierUnknown.map(issue => {
          const owner = state.agenda.find(item => item.id === issue.id);
          return <div className="today-earlier-arrangement" key={`${issue.id}:${issue.startsAt}`}>
            <div><strong>{owner?.title || '先前的一项安排'}</strong><span>{formatDateTime(issue.startsAt!, zone)} 起，结束还没确定</span></div>
            {owner && <button type="button" className="text-button" onClick={() => setEditing({ original: { ...owner }, occurrenceDate: issue.date,
              occurrenceId: issue.date ? `${owner.id}::${issue.date}` : owner.id })}>看看这件事<ArrowUpRight size={14} /></button>}
          </div>;
        })}
        {nativeDay?.issues.some(value => value.status !== 'unknown_end') && <p className="today-calendar-issue">有几次重复安排的时刻还没确定，先保留原来的记录。</p>}
        {!search && scope !== 'completed' && scope !== 'undated' && !!repeated.length && (scope !== 'day' || !nativeDay) && (
          <section className="today-repeated">
            <h2>重复的安排</h2>
            {repeated.map((item) => row(item, true))}
          </section>
        )}
        {!!state.matters?.length && (
          <details className="shared-matters today-matters">
            <summary>
              还在商量的事
              <ChevronRight size={15} />
            </summary>
            {state.matters.map((matter) => (
              <MatterCard
                key={matter.id}
                matter={matter}
                interaction={matterInteractions[matter.id]}
                onInteraction={(value) => onMatterInteraction(matter.id, value)}
                onState={onState}
                onPresent={() => onPresentMatter(matter)}
                onMap={onMap}
              />
            ))}
          </details>
        )}
      </div>
      {active && section === 'entrusted' && (
        <div
          id="today-entrusted-panel"
          role="region"
          aria-label="你交给我的事"
          className="today-entrusted"
        >
          <WorkAndReceipts
            key={`${state.privacyEpoch}:${state.policyRevision}`}
            onResume={onResume}
            onChanged={onChanged}
            onAttention={setAttention}
            agenda={state.agenda}
            preparations={state.preparations || []}
            onState={onState}
            onContinue={onContinue}
            timeZone={zone}
          />
        </div>
      )}
      </div>
      {inlineEditing && <aside className="today-current-object">{renderEditor(true)}</aside>}
      </div>
      {active && editing && !inlineEditing && renderEditor(false)}
    </PagePanel>
    </div>
  );
}
