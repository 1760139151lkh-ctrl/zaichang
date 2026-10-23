import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { BookOpen, Clock3 } from 'lucide-react';
import type { Action } from '../shared/types';
import type { CampusScheduleBlock } from '../shared/campus-calendar';
import type { AgendaOccurrence, AgendaReference } from '../shared/agenda';
import { fromTimeInput, toTimeInput } from './time';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const PIXELS_PER_HOUR = 68;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** A day is a pair of real instants, including 23/25-hour daylight-saving days. */
export function agendaDayWindow(date: string, timeZone: string) {
  try {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const start = fromTimeInput(`${date}T00:00`, timeZone);
    const end = fromTimeInput(`${next.toISOString().slice(0, 10)}T00:00`, timeZone);
    if (!start || !end || Date.parse(end) <= Date.parse(start)) return undefined;
    return { start: Date.parse(start), end: Date.parse(end) };
  } catch {
    // A rare ambiguous/missing midnight must not silently become another date.
    return undefined;
  }
}

export function agendaTimedRange(item: Action) {
  const start = item.startsAt ? Date.parse(item.startsAt) : NaN;
  if (
    item.allDayDate ||
    item.recurrence ||
    item.done ||
    !Number.isFinite(start) ||
    !Number.isFinite(item.durationMinutes) ||
    !(item.durationMinutes! > 0)
  )
    return undefined;
  return { start, end: start + item.durationMinutes! * MINUTE };
}

export function campusTimedRange(item: CampusScheduleBlock) {
  const start = Date.parse(item.start),
    end = item.end ? Date.parse(item.end) : NaN;
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : undefined;
}

type Entry = ({ kind: 'action'; item: Action; reference: AgendaReference } | { kind: 'campus'; item: CampusScheduleBlock }) & {
  key: string;
  start: number;
  end: number;
  lane: number;
  lanes: number;
};
type MoveSource = {
  original: Action;
  reference: AgendaReference;
  originalStart: number;
  originalEnd: number;
  contextKey: string;
};
type Move = MoveSource & {
  id: string;
  startsAt: number;
  rawStartsAt: number;
  mode: 'pointer' | 'keyboard';
};
type PointerMove = MoveSource & {
  pointerId: number;
  node: HTMLButtonElement;
  key: string;
  startY: number;
  clientY: number;
  grabOffset: number;
  moved: boolean;
  min: number;
  max: number;
  anchor: number;
  viewStart: number;
};
export type AgendaMoveDraft = { original: Action; initialStartsAt: string; occurrenceId?: string; reference?: AgendaReference };

function arrangeLanes(entries: Entry[]) {
  const sorted = [...entries].sort((a, b) => a.start - b.start || a.end - b.end);
  let group: Entry[] = [],
    ends: number[] = [],
    groupEnd = -Infinity;
  const finish = () => {
    group.forEach((entry) => {
      entry.lanes = ends.length;
    });
  };
  for (const entry of sorted) {
    if (entry.start >= groupEnd) {
      finish();
      group = [];
      ends = [];
      groupEnd = -Infinity;
    }
    const free = ends.findIndex((end) => end <= entry.start);
    entry.lane = free < 0 ? ends.length : free;
    ends[entry.lane] = entry.end;
    group.push(entry);
    groupEnd = Math.max(groupEnd, entry.end);
  }
  finish();
  return sorted;
}

export function AgendaDayTimeline({
  active: isActive = true,
  date,
  timeZone,
  actions,
  occurrences,
  campus,
  window: hostWindow,
  draft,
  disabled = false,
  sourceBoundaryKey,
  selectedOccurrenceId,
  onEdit,
  onPropose,
}: {
  active?: boolean;
  date: string;
  timeZone: string;
  actions: Action[];
  occurrences?: AgendaOccurrence[];
  campus: CampusScheduleBlock[];
  window?: { from: string; to: string };
  draft?: AgendaMoveDraft;
  disabled?: boolean;
  sourceBoundaryKey?: string;
  selectedOccurrenceId?: string;
  onEdit: (item: Action, reference: AgendaReference) => void;
  onPropose: (item: Action, startsAt: string, reference: AgendaReference, occurrenceId: string) => void;
}) {
  const [fullDay, setFullDay] = useState(false);
  const [moving, setMoving] = useState<Move>();
  const [announcement, setAnnouncement] = useState('');
  const movingRef = useRef<Move | undefined>(undefined);
  const pointer = useRef<PointerMove | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const stage = useRef<HTMLDivElement>(null);
  const expanding = useRef<{ panel: HTMLElement; offset: number } | undefined>(undefined);
  const suppressClickUntil = useRef(0);
  const hintId = useId();
  const day = useMemo(() => hostWindow ? { start: Date.parse(hostWindow.from), end: Date.parse(hostWindow.to) }
    : agendaDayWindow(date, timeZone), [date, timeZone, hostWindow?.from, hostWindow?.to]);
  const entries = useMemo(
    () =>
      arrangeLanes(
        [
          ...(occurrences ? occurrences.flatMap(occurrence => {
            const start = Date.parse(occurrence.start), end = occurrence.end ? Date.parse(occurrence.end) : NaN;
            return !occurrence.item.allDayDate && Number.isFinite(end) && end > start
              ? [{ key: occurrence.occurrenceId, kind: 'action' as const, item: occurrence.item,
                reference: occurrence.record, start, end, lane: 0, lanes: 1 }] : [];
          }) : actions.flatMap((item) => {
            const range = agendaTimedRange(item);
            return range
              ? [{ key: item.id, kind: 'action' as const, item, reference: { id: item.id, revision: item.revision || 1 }, ...range, lane: 0, lanes: 1 }]
              : [];
          })),
          ...campus.flatMap((item) => {
            const range = campusTimedRange(item);
            return range
              ? [{ key: `campus:${item.id}`, kind: 'campus' as const, item, ...range, lane: 0, lanes: 1 }]
              : [];
          }),
        ].filter((entry) => day && entry.end > day.start && entry.start < day.end),
      ),
    [actions, occurrences, campus, day],
  );
  const contextKey = JSON.stringify([date, timeZone, sourceBoundaryKey, day?.start, day?.end]);
  // Compare actual owner values. New arrays and unrelated row updates must not
  // interrupt a healthy gesture on the same occurrence.
  const entryVersions = JSON.stringify(entries.filter(entry => entry.kind === 'action').map(entry =>
    [entry.key, entry.reference.id, entry.reference.revision, entry.reference.occurrenceDate,
      entry.start, entry.end, entry.item.durationMinutes, entry.item.saved, entry.item.done]));

  const trialStart = draft ? Date.parse(draft.initialStartsAt) : NaN;
  const trialEnd = trialStart + (draft?.original.durationMinutes || 0) * MINUTE;
  const trialInDay = !!day && Number.isFinite(trialStart) && trialStart < day.end && trialEnd > day.start;
  const first = day ? Math.min(...entries.map((entry) => entry.start), trialInDay ? trialStart : day.end, day.end) : 0;
  const last = day ? Math.max(...entries.map((entry) => entry.end), trialInDay ? trialEnd : day.start, day.start) : 0;
  let viewStart = day
    ? Math.max(day.start, day.start + Math.floor((first - day.start) / HOUR) * HOUR - HOUR)
    : 0;
  let viewEnd = day ? Math.min(day.end, day.start + Math.ceil((last - day.start) / HOUR) * HOUR + HOUR) : 0;
  if (day && viewEnd - viewStart < 6 * HOUR) {
    viewEnd = Math.min(day.end, viewStart + 6 * HOUR);
    viewStart = Math.max(day.start, viewEnd - 6 * HOUR);
  }
  if (fullDay && day) {
    viewStart = day.start;
    viewEnd = day.end;
  }
  const pixels = (instant: number) => ((instant - viewStart) / HOUR) * PIXELS_PER_HOUR;
  const height = ((viewEnd - viewStart) / HOUR) * PIXELS_PER_HOUR;
  const clock = (instant: number) => toTimeInput(new Date(instant).toISOString(), timeZone).slice(11, 16);
  const timeRange = (start: number, end: number) => {
    const stamp = (instant: number) => new Date(instant).toLocaleString('zh-CN', { timeZone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return `${day && start < day.start ? stamp(start) : clock(start)} — ${day && end > day.end ? stamp(end) : end === day?.end ? '24:00' : clock(end)}`;
  };

  function updateMove(value?: Move) {
    movingRef.current = value;
    setMoving(value);
  }
  function stopPointer() {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    const active = pointer.current;
    pointer.current = undefined;
    if (active?.node.hasPointerCapture(active.pointerId)) active.node.releasePointerCapture(active.pointerId);
  }
  function cancelMove() {
    // Cancelling a short drag can leave the pointer over the original button.
    // Its following native click must not reopen the edit that was cancelled.
    if (pointer.current?.moved) suppressClickUntil.current = performance.now() + 350;
    stopPointer();
    updateMove();
  }
  function overlaps(key: string, start: number, duration: number) {
    return entries.filter(entry => entry.key !== key && start < entry.end && start + duration > entry.start);
  }
  function nearestOpening(move: Move) {
    if (!day) return undefined;
    const duration = move.originalEnd - move.originalStart;
    const occupied = entries.filter(entry => entry.key !== move.id);
    const step = 15 * MINUTE;
    const ceil = (value: number) => day.start + Math.ceil((value - day.start) / step) * step;
    const floor = (value: number) => day.start + Math.floor((value - day.start) / step) * step;
    // The closest fitting interval starts at the desired time or touches an
    // existing interval's edge. Keep all other owners exactly where they are.
    const candidates = [move.startsAt, day.start, day.end - duration, floor(day.end - duration),
      ...occupied.flatMap(entry => [entry.end, entry.start - duration, ceil(entry.end), floor(entry.start - duration)])];
    return [...new Set(candidates)].filter(start => start >= day.start && start + duration <= day.end
      && !overlaps(move.id, start, duration).length)
      .sort((a, b) => Math.abs(a - move.startsAt) - Math.abs(b - move.startsAt) || a - b)[0];
  }
  function expandDay() {
    if (fullDay || !day || !stage.current || expanding.current) return;
    const panel = stage.current.closest<HTMLElement>('.page-panel');
    if (panel) expanding.current = { panel, offset: pixels(day.start) * -1 };
    setFullDay(true);
  }
  useLayoutEffect(() => {
    const expansion = expanding.current;
    if (fullDay && expansion) {
      expanding.current = undefined;
      expansion.panel.scrollTop += expansion.offset;
      const active = pointer.current;
      if (active?.moved && day) {
        active.viewStart = day.start;
        pointerPosition(active);
      }
    }
    const move = movingRef.current;
    if (move?.mode !== 'keyboard' || !stage.current) return;
    const panel = stage.current.closest<HTMLElement>('.page-panel');
    if (!panel) return;
    const bounds = panel.getBoundingClientRect();
    const top = stage.current.getBoundingClientRect().top + pixels(move.startsAt);
    const end = top + (move.originalEnd - move.originalStart) / HOUR * PIXELS_PER_HOUR;
    if (top < bounds.top + 24) panel.scrollTop -= bounds.top + 24 - top;
    else if (end > bounds.bottom - 116) panel.scrollTop += Math.min(end - bounds.bottom + 116, top - bounds.top - 24);
  }, [fullDay, moving?.startsAt]);
  function proposeMove(move: Move) {
    if (!isActive || !currentMove(move.id, move)) { cancelMove(); return; }
    updateMove();
    if (move.startsAt !== move.originalStart)
      onPropose(move.original, new Date(move.startsAt).toISOString(), move.reference, move.id);
  }
  function currentMove(key: string, source: MoveSource) {
    const entry = entries.find(value => value.kind === 'action' && value.key === key);
    return !disabled && !draft && source.contextKey === contextKey && entry?.kind === 'action'
      && entry.reference.id === source.reference.id && entry.reference.revision === source.reference.revision
      && entry.reference.occurrenceDate === source.reference.occurrenceDate
      && entry.start === source.originalStart && entry.end === source.originalEnd
      && entry.item.durationMinutes === source.original.durationMinutes && entry.item.saved === true && !entry.item.done;
  }
  useLayoutEffect(() => {
    const active = pointer.current, move = movingRef.current;
    if ((active && !currentMove(active.key, active)) || (move && !currentMove(move.id, move))) cancelMove();
  }, [disabled, !!draft, contextKey, entryVersions]);
  useEffect(() => {
    if (!isActive) {
      // A pointer cannot keep dragging an invisible day. A keyboard trial is
      // still a local proposal and can be picked up when the same day returns.
      if (movingRef.current?.mode === 'pointer') cancelMove();
      else stopPointer();
      return;
    }
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && movingRef.current) {
        event.preventDefault();
        event.stopPropagation();
        cancelMove();
        setAnnouncement('已放回原来的时间。');
      }
    };
    window.addEventListener('keydown', cancel);
    window.addEventListener('blur', cancelMove);
    return () => {
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('blur', cancelMove);
      stopPointer();
    };
  }, [date, timeZone, isActive]);
  useEffect(() => {
    cancelMove();
    expanding.current = undefined;
    setFullDay(false);
  }, [date, timeZone]);

  function pointerPosition(active: PointerMove) {
    if (!stage.current) return;
    const raw = clamp(
      active.viewStart +
        ((active.clientY - stage.current.getBoundingClientRect().top - active.grabOffset) / PIXELS_PER_HOUR) *
          HOUR,
      active.min,
      active.max,
    );
    const snapped = clamp(
      active.anchor + Math.round((raw - active.anchor) / (15 * MINUTE)) * 15 * MINUTE,
      active.min,
      active.max,
    );
    updateMove({
      id: active.key,
      original: active.original,
      reference: active.reference,
      originalStart: active.originalStart,
      originalEnd: active.originalEnd,
      contextKey: active.contextKey,
      startsAt: snapped,
      rawStartsAt: raw,
      mode: 'pointer',
    });
  }
  function followScroll() {
    const active = pointer.current;
    if (!active?.moved || !stage.current) {
      frame.current = undefined;
      return;
    }
    const panel = stage.current.closest<HTMLElement>('.page-panel');
    if (panel) {
      const bounds = panel.getBoundingClientRect();
      const edge = 60;
      const velocity =
        active.clientY < bounds.top + edge
          ? -Math.min(12, (bounds.top + edge - active.clientY) / 5)
          : active.clientY > bounds.bottom - edge
            ? Math.min(12, (active.clientY - bounds.bottom + edge) / 5)
            : 0;
      if (velocity) {
        panel.scrollTop += velocity;
        pointerPosition(active);
      }
    }
    frame.current = requestAnimationFrame(followScroll);
  }
  function beginPointer(event: PointerEvent<HTMLButtonElement>, entry: Extract<Entry, {kind:'action'}>) {
    const item = entry.item;
    if (!isActive || event.button !== 0 || !event.isPrimary || !day || !stage.current || draft || disabled || item.saved !== true)
      return;
    const range = { start: entry.start, end: entry.end };
    if (!range || range.start < day.start || range.end > day.end) return;
    cancelMove();
    const node = event.currentTarget;
    node.focus({ preventScroll: true });
    node.setPointerCapture(event.pointerId);
    pointer.current = {
      pointerId: event.pointerId,
      node,
      original: { ...item },
      key: entry.key,
      reference: entry.reference,
      originalStart: entry.start,
      originalEnd: entry.end,
      contextKey,
      startY: event.clientY,
      clientY: event.clientY,
      grabOffset: event.clientY - stage.current.getBoundingClientRect().top - pixels(range.start),
      moved: false,
      min: day.start,
      max: Math.max(day.start, day.end - (range.end - range.start)),
      anchor: day.start,
      viewStart,
    };
  }
  function movePointer(event: PointerEvent<HTMLButtonElement>) {
    const active = pointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (!currentMove(active.key, active)) { cancelMove(); return; }
    active.clientY = event.clientY;
    if (!active.moved && Math.abs(active.clientY - active.startY) < 4) return;
    event.preventDefault();
    active.moved = true;
    expandDay();
    pointerPosition(active);
    if (frame.current === undefined) frame.current = requestAnimationFrame(followScroll);
  }
  function finishPointer(event: PointerEvent<HTMLButtonElement>) {
    const active = pointer.current,
      move = movingRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (!currentMove(active.key, active)) { cancelMove(); return; }
    stopPointer();
    updateMove();
    if (active.moved) {
      suppressClickUntil.current = performance.now() + 350;
      if (move && move.startsAt !== active.originalStart) {
        const conflicts = overlaps(move.id, move.startsAt, move.originalEnd - move.originalStart);
        if (conflicts.length) {
          updateMove({ ...move, rawStartsAt: move.startsAt, mode: 'keyboard' });
          setAnnouncement(`这个时间和${conflicts.map(entry => entry.item.title).join('、')}重叠。可以试试附近的空档，或继续确认这个时间。`);
        } else proposeMove(move);
      }
    }
  }
  function moveKeyboard(event: KeyboardEvent<HTMLButtonElement>, entry: Extract<Entry, {kind:'action'}>) {
    if (!isActive) return;
    const item = entry.item;
    const active = movingRef.current;
    if (active && !currentMove(active.id, active)) { cancelMove(); return; }
    if (event.key === 'Escape' && active?.id === entry.key) {
      event.preventDefault();
      event.stopPropagation();
      cancelMove();
      setAnnouncement('已放回原来的时间。');
      return;
    }
    if (event.key === 'Enter' && active?.id === entry.key && active.mode === 'keyboard') {
      event.preventDefault();
      proposeMove(active);
      return;
    }
    if (
      !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      draft ||
      disabled ||
      !day ||
      item.saved !== true
    )
      return;
    const range = { start: entry.start, end: entry.end };
    if (!range || range.start < day.start || range.end > day.end) return;
    event.preventDefault();
    expandDay();
    const previous = active?.id === entry.key ? active : undefined;
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
    const instant = clamp(
      (previous?.startsAt ?? range.start) + direction * (event.shiftKey ? 1 : 15) * MINUTE,
      day.start,
      Math.max(day.start, day.end - (range.end - range.start)),
    );
    updateMove({
      id: entry.key,
      original: previous?.original || { ...item },
      reference: entry.reference,
      originalStart: entry.start,
      originalEnd: entry.end,
      contextKey,
      startsAt: instant,
      rawStartsAt: instant,
      mode: 'keyboard',
    });
    setAnnouncement(
      `${item.title}，试放在 ${timeRange(instant, instant + range.end - range.start)}。按回车确认，Escape 放回。`,
    );
  }

  if (!day || !entries.length) return null;
  const ticks: number[] = [];
  for (let tick = viewStart; tick <= viewEnd; tick += HOUR) ticks.push(tick);
  if (ticks.at(-1) !== viewEnd) ticks.push(viewEnd);
  const visibleMove =
    moving ||
    (draft
      ? {
          id: draft.occurrenceId || draft.original.id,
          original: draft.original,
          reference: draft.reference || { id: draft.original.id, revision: draft.original.revision || 1 },
          startsAt: Date.parse(draft.initialStartsAt),
          rawStartsAt: Date.parse(draft.initialStartsAt),
          mode: 'keyboard' as const,
        }
      : undefined);
  const oldEntry = visibleMove ? entries.find(entry => entry.kind === 'action' && entry.key === visibleMove.id) : undefined;
  const oldRange = oldEntry ? { start: oldEntry.start, end: oldEntry.end } : undefined;
  const ghost =
    visibleMove &&
    oldRange &&
    oldEntry;
  const displayedLanes = visibleMove && oldRange ? arrangeLanes(entries.map(entry => ({ ...entry,
    ...(entry.key === visibleMove.id ? { start: visibleMove.startsAt, end: visibleMove.startsAt + oldRange.end - oldRange.start } : {}) }))) : entries;
  const laneByKey = new Map(displayedLanes.map(entry => [entry.key, entry]));
  const conflicts = moving ? overlaps(moving.id, moving.startsAt, moving.originalEnd - moving.originalStart) : [];
  const nearby = moving && conflicts.length ? nearestOpening(moving) : undefined;
  return (
    <section
      className={`agenda-timeline ${moving?.mode === 'pointer' ? 'is-dragging' : ''}`}
      aria-label={`${date} 时间轴`}
      onBlur={event => {
        if (movingRef.current?.mode === 'keyboard'
          && (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))) cancelMove();
      }}
    >
      <div className="agenda-timeline-tools">
        <span>
          <Clock3 size={14} />
          {fullDay ? '这一天' : `${clock(viewStart)} — ${viewEnd === day.end ? '24:00' : clock(viewEnd)}`}
        </span>
        <button
          type="button"
          className="text-button"
          aria-pressed={fullDay}
          onClick={() => {
            cancelMove();
            setFullDay((value) => !value);
          }}
        >
          {fullDay ? '回到安排' : '看全天'}
        </button>
      </div>
      <p id={hintId} className="sr-only">
        拖动试放时间，松手后确认。方向键每次移动十五分钟，Shift 加方向键移动一分钟；回车打开确认，Escape
        放回。课程仅供查看。
      </p>
      <div className="agenda-timeline-stage" ref={stage} style={{ height }}>
        {ticks.map((instant) => (
          <div
            className="agenda-timeline-tick"
            key={instant}
            style={{ top: pixels(instant) }}
            aria-hidden="true"
          >
            <time>{instant === day.end ? '24:00' : clock(instant)}</time>
            <span />
          </div>
        ))}
        <div className="agenda-timeline-track">
          {ghost && oldRange && (
            <div
              className="agenda-timeline-ghost"
              style={{
                top: pixels(Math.max(viewStart, oldRange.start)),
                height: Math.max(
                  2,
                  pixels(Math.min(viewEnd, oldRange.end)) - pixels(Math.max(viewStart, oldRange.start)),
                ),
                left: `${(ghost.lane / ghost.lanes) * 100}%`,
                width: `${100 / ghost.lanes}%`,
              }}
              aria-hidden="true"
            >
              <span>{clock(oldRange.start)}</span>
            </div>
          )}
          {entries.map((entry) => {
            const layout = laneByKey.get(entry.key) || entry;
            const moved =
              entry.kind === 'action' && visibleMove?.id === entry.key ? visibleMove : undefined;
            const start = moved?.rawStartsAt ?? entry.start,
              end = start + entry.end - entry.start;
            const shownStart = Math.max(viewStart, start),
              shownEnd = Math.min(viewEnd, end);
            if (shownEnd <= shownStart) return null;
            const cardHeight = Math.max(2, pixels(shownEnd) - pixels(shownStart));
            const duration = entry.end - entry.start;
            const labelStart = moved?.startsAt ?? start;
            const isMovable =
              entry.kind === 'action' &&
              !disabled &&
              entry.item.saved === true &&
              entry.start >= day.start &&
              entry.end <= day.end;
            const style = {
              top: pixels(shownStart),
              height: cardHeight,
              left: `${(layout.lane / layout.lanes) * 100}%`,
              width: `${100 / layout.lanes}%`,
            } as CSSProperties;
            const overlap = moved && entries.some(other => other.key !== entry.key && labelStart < other.end && labelStart + duration > other.start);
            const className = `agenda-timeline-card ${entry.kind === 'campus' ? 'is-campus' : ''} ${moved ? 'is-moving' : ''} ${overlap ? 'has-overlap' : ''} ${selectedOccurrenceId === entry.key ? 'is-selected' : ''} ${cardHeight < 48 ? 'is-short' : ''} ${isMovable ? 'is-movable' : ''}`;
            const contents = (
              <>
                <span className="agenda-timeline-card-title">
                  {entry.kind === 'campus' && <BookOpen size={13} />}
                  <strong>{entry.item.title}</strong>
                </span>
                <span className="agenda-timeline-card-time">
                  {timeRange(labelStart, labelStart + duration)}
                  {entry.kind === 'campus' ? ` · ${entry.item.kind === 'class' ? '课程' : '考试'}` : ''}
                </span>
                {cardHeight >= 84 && (entry.kind === 'campus' ? entry.item.location : entry.item.detail) && (
                  <span className="agenda-timeline-card-detail">
                    {entry.kind === 'campus' ? entry.item.location : entry.item.detail}
                  </span>
                )}
              </>
            );
            if (entry.kind === 'campus')
              return (
                <article
                  key={entry.key}
                  className={className}
                  style={style}
                  aria-label={`${entry.item.title}，${timeRange(start, end)}，${entry.item.kind === 'class' ? '课程' : '考试'}，只读`}
                >
                  {contents}
                </article>
              );
            const item = entry.item;
            return (
              <button
                key={entry.key}
                type="button"
                className={className}
                style={style}
                data-agenda-id={item.id}
                data-occurrence-id={entry.key}
                aria-pressed={selectedOccurrenceId === entry.key}
                aria-label={`${item.title}，${timeRange(labelStart, labelStart + duration)}${isMovable ? '，可调整时间' : ''}`}
                aria-describedby={isMovable ? hintId : undefined}
                onPointerDown={(event) => beginPointer(event, entry)}
                onPointerMove={movePointer}
                onPointerUp={finishPointer}
                onPointerCancel={cancelMove}
                onLostPointerCapture={() => {
                  if (pointer.current) cancelMove();
                }}
                onKeyDown={(event) => moveKeyboard(event, entry)}
                onClick={() => {
                  if (performance.now() >= suppressClickUntil.current) {
                    cancelMove();
                    if (!disabled) onEdit(item, entry.reference);
                  }
                }}
              >
                {contents}
              </button>
            );
          })}
        </div>
      </div>
      {moving && <div className={`agenda-timeline-feedback${conflicts.length ? ' has-conflict' : ''}`}>
        <div className="agenda-timeline-trial-time" role="status" aria-live="polite">
          <strong>{timeRange(moving.startsAt, moving.startsAt + moving.originalEnd - moving.originalStart)}</strong>
          <span>{conflicts.length ? `和${conflicts.slice(0, 2).map(entry => `「${entry.item.title}」`).join('、')}${conflicts.length > 2 ? `等${conflicts.length}项安排` : ''}重叠`
            : '先放在这里看看'}</span>
        </div>
        {moving.mode === 'keyboard' && <div className="agenda-timeline-trial-actions">
          {nearby !== undefined && <button type="button" className="text-button" title="只按时间轴里有完整起止时间的安排寻找空档，保存前会再核对。" onClick={() => {
            const move = movingRef.current;
            if (!move || !currentMove(move.id, move)) { cancelMove(); return; }
            const start = nearestOpening(move);
            if (start === undefined) return;
            updateMove({ ...move, startsAt: start, rawStartsAt: start, mode: 'keyboard' });
            setAnnouncement(`试放在${timeRange(start, start + move.originalEnd - move.originalStart)}，原来的安排还没有改动。`);
          }}>试试 {clock(nearby)} 的空档</button>}
          <button type="button" className="text-button" onClick={() => proposeMove(moving)}>{conflicts.length ? '仍放这里' : '用这个时间'}</button>
          <button type="button" className="text-button" onClick={cancelMove}>放回</button>
        </div>}
      </div>}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </section>
  );
}
