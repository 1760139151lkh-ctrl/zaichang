import {
  useEffect,
  useId,
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

type Entry = ({ kind: 'action'; item: Action } | { kind: 'campus'; item: CampusScheduleBlock }) & {
  key: string;
  start: number;
  end: number;
  lane: number;
  lanes: number;
};
type Move = {
  id: string;
  original: Action;
  startsAt: number;
  rawStartsAt: number;
  mode: 'pointer' | 'keyboard';
};
type PointerMove = {
  pointerId: number;
  node: HTMLButtonElement;
  original: Action;
  startY: number;
  clientY: number;
  grabOffset: number;
  moved: boolean;
  min: number;
  max: number;
  anchor: number;
  viewStart: number;
};
export type AgendaMoveDraft = { original: Action; initialStartsAt: string };

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
  campus,
  draft,
  onEdit,
  onPropose,
}: {
  active?: boolean;
  date: string;
  timeZone: string;
  actions: Action[];
  campus: CampusScheduleBlock[];
  draft?: AgendaMoveDraft;
  onEdit: (item: Action) => void;
  onPropose: (item: Action, startsAt: string) => void;
}) {
  const [fullDay, setFullDay] = useState(false);
  const [moving, setMoving] = useState<Move>();
  const [announcement, setAnnouncement] = useState('');
  const movingRef = useRef<Move | undefined>(undefined);
  const pointer = useRef<PointerMove | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const stage = useRef<HTMLDivElement>(null);
  const suppressClickUntil = useRef(0);
  const hintId = useId();
  const day = useMemo(() => agendaDayWindow(date, timeZone), [date, timeZone]);
  const entries = useMemo(
    () =>
      arrangeLanes(
        [
          ...actions.flatMap((item) => {
            const range = agendaTimedRange(item);
            return range
              ? [{ key: `action:${item.id}`, kind: 'action' as const, item, ...range, lane: 0, lanes: 1 }]
              : [];
          }),
          ...campus.flatMap((item) => {
            const range = campusTimedRange(item);
            return range
              ? [{ key: `campus:${item.id}`, kind: 'campus' as const, item, ...range, lane: 0, lanes: 1 }]
              : [];
          }),
        ].filter((entry) => day && entry.end > day.start && entry.start < day.end),
      ),
    [actions, campus, day],
  );

  const first = day ? Math.min(...entries.map((entry) => entry.start), day.end) : 0;
  const last = day ? Math.max(...entries.map((entry) => entry.end), day.start) : 0;
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
  const timeRange = (start: number, end: number) => `${clock(start)} — ${clock(end)}`;

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
    setFullDay(false);
  }, [date, timeZone]);
  useEffect(() => {
    const move = movingRef.current;
    if (!move) return;
    const current = actions.find(item => item.id === move.id);
    if (!current || (current.revision || 1) !== (move.original.revision || 1)
      || current.startsAt !== move.original.startsAt || current.durationMinutes !== move.original.durationMinutes)
      cancelMove();
  }, [actions]);

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
      id: active.original.id,
      original: active.original,
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
  function beginPointer(event: PointerEvent<HTMLButtonElement>, item: Action) {
    if (!isActive || event.button !== 0 || !event.isPrimary || !day || !stage.current || draft || item.saved !== true)
      return;
    const range = agendaTimedRange(item);
    if (!range || range.start < day.start || range.end > day.end) return;
    cancelMove();
    const node = event.currentTarget;
    node.focus({ preventScroll: true });
    node.setPointerCapture(event.pointerId);
    pointer.current = {
      pointerId: event.pointerId,
      node,
      original: { ...item },
      startY: event.clientY,
      clientY: event.clientY,
      grabOffset: event.clientY - stage.current.getBoundingClientRect().top - pixels(range.start),
      moved: false,
      min: viewStart,
      max: Math.max(viewStart, viewEnd - (range.end - range.start)),
      anchor: day.start,
      viewStart,
    };
  }
  function movePointer(event: PointerEvent<HTMLButtonElement>) {
    const active = pointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.clientY = event.clientY;
    if (!active.moved && Math.abs(active.clientY - active.startY) < 4) return;
    active.moved = true;
    pointerPosition(active);
    if (frame.current === undefined) frame.current = requestAnimationFrame(followScroll);
  }
  function finishPointer(event: PointerEvent<HTMLButtonElement>) {
    const active = pointer.current,
      move = movingRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    stopPointer();
    updateMove();
    if (active.moved) {
      suppressClickUntil.current = performance.now() + 350;
      if (move && move.startsAt !== Date.parse(active.original.startsAt!))
        onPropose(active.original, new Date(move.startsAt).toISOString());
    }
  }
  function moveKeyboard(event: KeyboardEvent<HTMLButtonElement>, item: Action) {
    if (!isActive) return;
    const active = movingRef.current;
    if (event.key === 'Escape' && active?.id === item.id) {
      event.preventDefault();
      event.stopPropagation();
      cancelMove();
      setAnnouncement('已放回原来的时间。');
      return;
    }
    if (event.key === 'Enter' && active?.id === item.id && active.mode === 'keyboard') {
      event.preventDefault();
      updateMove();
      if (active.startsAt !== Date.parse(item.startsAt!))
        onPropose(active.original, new Date(active.startsAt).toISOString());
      return;
    }
    if (
      !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      draft ||
      !day ||
      item.saved !== true
    )
      return;
    const range = agendaTimedRange(item);
    if (!range || range.start < day.start || range.end > day.end) return;
    event.preventDefault();
    const previous = active?.id === item.id ? active : undefined;
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
    const instant = clamp(
      (previous?.startsAt ?? range.start) + direction * (event.shiftKey ? 1 : 15) * MINUTE,
      viewStart,
      Math.max(viewStart, viewEnd - (range.end - range.start)),
    );
    updateMove({
      id: item.id,
      original: previous?.original || { ...item },
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
          id: draft.original.id,
          original: draft.original,
          startsAt: Date.parse(draft.initialStartsAt),
          rawStartsAt: Date.parse(draft.initialStartsAt),
          mode: 'keyboard' as const,
        }
      : undefined);
  const oldRange = visibleMove ? agendaTimedRange(visibleMove.original) : undefined;
  const ghost =
    visibleMove &&
    oldRange &&
    entries.find((entry) => entry.kind === 'action' && entry.item.id === visibleMove.id);
  return (
    <section
      className={`agenda-timeline ${moving?.mode === 'pointer' ? 'is-dragging' : ''}`}
      aria-label={`${date} 时间轴`}
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
            const moved =
              entry.kind === 'action' && visibleMove?.id === entry.item.id ? visibleMove : undefined;
            const start = moved?.rawStartsAt ?? entry.start,
              end = start + entry.end - entry.start;
            const shownStart = Math.max(viewStart, start),
              shownEnd = Math.min(viewEnd, end);
            const cardHeight = Math.max(2, pixels(shownEnd) - pixels(shownStart));
            const duration = entry.end - entry.start;
            const labelStart = moved?.startsAt ?? start;
            const isMovable =
              entry.kind === 'action' &&
              entry.item.saved === true &&
              entry.start >= day.start &&
              entry.end <= day.end;
            const style = {
              top: pixels(shownStart),
              height: cardHeight,
              left: `${(entry.lane / entry.lanes) * 100}%`,
              width: `${100 / entry.lanes}%`,
            } as CSSProperties;
            const className = `agenda-timeline-card ${entry.kind === 'campus' ? 'is-campus' : ''} ${moved ? 'is-moving' : ''} ${cardHeight < 48 ? 'is-short' : ''} ${isMovable ? 'is-movable' : ''}`;
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
                aria-label={`${item.title}，${timeRange(labelStart, labelStart + duration)}${isMovable ? '，可调整时间' : ''}`}
                aria-describedby={isMovable ? hintId : undefined}
                onPointerDown={(event) => beginPointer(event, item)}
                onPointerMove={movePointer}
                onPointerUp={finishPointer}
                onPointerCancel={cancelMove}
                onLostPointerCapture={() => {
                  if (pointer.current) cancelMove();
                }}
                onKeyDown={(event) => moveKeyboard(event, item)}
                onClick={() => {
                  if (performance.now() >= suppressClickUntil.current) {
                    cancelMove();
                    onEdit(item);
                  }
                }}
              >
                {contents}
              </button>
            );
          })}
        </div>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </section>
  );
}
