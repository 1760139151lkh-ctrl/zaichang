import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  List,
  Plus,
  Search,
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
import './today.css';
import { CalendarHandoff } from './CalendarHandoff';
import { CampusDayControls, CampusScheduleRow, useCampusDaySchedule } from './CampusDaySchedule';
import { AgendaDayTimeline, agendaDayWindow, agendaTimedRange, campusTimedRange } from './AgendaDayTimeline';

export type WorkspaceView = 'chat' | 'agenda' | 'notes' | 'materials' | 'memory' | 'settings' | 'companion';
type AgendaScope = 'day' | 'all' | 'undated' | 'completed';
type AgendaEdit = { original: Action; initialStartsAt?: string };
type AgendaMoveUndo = { previous: Action; saved: Action; error?: string };

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
  matterInteractions,
  onMatterInteraction,
}: {
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
  matterInteractions: Record<string, MatterInteraction>;
  onMatterInteraction: (id: string, value: MatterInteractionUpdate) => void;
}) {
  const zone = state.settings.timeZone || DEFAULT_TIME_ZONE;
  const [today, setToday] = useState(() => toTimeInput(new Date().toISOString(), zone).slice(0, 10));
  const [selectedDate, setSelectedDate] = useState(today);
  const [section, setSection] = useState<'agenda' | 'entrusted'>('agenda');
  const [scope, setScope] = useState<AgendaScope>('day');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<AgendaEdit>();
  const [dayLayout, setDayLayout] = useState<'timeline' | 'list'>('timeline');
  const [moveUndo, setMoveUndo] = useState<AgendaMoveUndo>();
  const [undoing, setUndoing] = useState(false);
  const [undoAnnouncement, setUndoAnnouncement] = useState('');
  const [attention, setAttention] = useState(0);
  useEffect(() => {
    const update = () => setToday(toTimeInput(new Date().toISOString(), zone).slice(0, 10));
    update();
    const timer = window.setInterval(update, 60000);
    return () => window.clearInterval(timer);
  }, [zone]);
  useEffect(() => {
    setSelectedDate(toTimeInput(new Date().toISOString(), zone).slice(0, 10));
  }, [zone]);

  const search = query.trim().toLocaleLowerCase();
  const dayWindow = useMemo(() => agendaDayWindow(selectedDate, zone), [selectedDate, zone]);
  const campusDayVisible =
    section === 'agenda' && scope === 'day' && !search && state.presentation?.mode !== 'public';
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
  const dayEntries: ({ kind: 'action'; item: Action } | { kind: 'campus'; item: CampusScheduleBlock })[] = [
    ...filtered.map((item) => ({ kind: 'action' as const, item })),
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
  const hasTimeline = !!dayWindow && !!(timedActions.length || timedCampus.length);
  const showTimeline = scope === 'day' && !search && dayLayout === 'timeline' && hasTimeline;
  const untimedEntries = dayEntries.filter((entry) =>
    entry.kind === 'action' ? !agendaTimedRange(entry.item) : !campusTimedRange(entry.item),
  );
  const weekday = new Date(`${selectedDate}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(selectedDate, -((weekday + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
  const datedDays = new Set(
    ordered.filter((item) => !item.done && !item.recurrence).map((item) => actionDate(item, zone)),
  );
  const selectedLabel = dateLabel(selectedDate);
  const heading = section === 'entrusted' ? '你交给我的事' : selectedDate === today ? '今天' : '这一天';

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
        item: {
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

  function row(item: Action, series = false) {
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
      <article className={`today-item ${item.done ? 'is-done' : ''}`} key={item.id}>
        <div className="today-item-time">
          <span>{clock}</span>
          {end && <small>{end}</small>}
        </div>
        <div className="today-item-paper">
          <IconButton
            label={
              item.done
                ? `做过的事：${item.title}`
                : `${series ? '完成整个重复安排' : '记下这件事做完了'}：${item.title}`
            }
            disabled={item.done}
            onClick={() => onAction(item, 'done')}
          >
            {item.done ? <Check size={18} /> : <Circle size={19} />}
          </IconButton>
          <button
            type="button"
            className="today-item-content"
            aria-label={`修改：${item.title}`}
            onClick={() => setEditing({ original: { ...item } })}
          >
            <strong>{item.title}</strong>
            {item.detail && <span className="today-item-detail">{item.detail}</span>}
            {(series || sourceClock || item.demo || item.coverage === 'conditional' || item.done) && (
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
                {item.coverage === 'conditional' && <span>出发前，还有条件需要看看</span>}
              </span>
            )}
          </button>
          <IconButton
            label={`移除：${item.title}`}
            className="today-item-remove"
            onClick={() => onAction(item, 'delete')}
          >
            <X size={15} />
          </IconButton>
        </div>
      </article>
    );
  }

  return (
    <PagePanel
      title={heading}
      eyebrow={section === 'agenda' ? selectedLabel : undefined}
      onClose={onClose}
      className={`agenda-page today-page ${section === 'entrusted' ? 'is-entrusted' : ''}`}
    >
      <div className="today-section-tabs" role="tablist" aria-label="今天的内容">
        <button
          type="button"
          role="tab"
          id="today-agenda-tab"
          aria-controls="today-agenda-panel"
          aria-selected={section === 'agenda'}
          onClick={() => setSection('agenda')}
        >
          安排
        </button>
        <button
          type="button"
          role="tab"
          id="today-entrusted-tab"
          aria-controls="today-entrusted-panel"
          aria-selected={section === 'entrusted'}
          onClick={() => setSection('entrusted')}
        >
          你交给我的事
          {attention > 0 && <span className="today-attention-dot" aria-label="有一件事需要看看" />}
        </button>
      </div>
      <div
        id="today-agenda-panel"
        role="tabpanel"
        aria-labelledby="today-agenda-tab"
        hidden={section !== 'agenda'}
      >
        <div className="today-date-heading">
          <small>{timeZoneLabel(zone)}</small>
          <div className="today-date-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setSelectedDate(today);
                setScope('day');
                setQuery('');
              }}
            >
              今天
            </button>
            <label className="today-date-picker">
              <CalendarDays size={16} />
              <span>选一天</span>
              <input
                type="date"
                aria-label="选择日期"
                value={selectedDate}
                onChange={(event) => {
                  if (event.target.value) {
                    setSelectedDate(event.target.value);
                    setScope('day');
                    setQuery('');
                  }
                }}
              />
            </label>
            <CalendarHandoff date={selectedDate} timeZone={zone} />
          </div>
        </div>
        <div className="today-week" aria-label="这一周">
          <IconButton
            label="前一周"
            onClick={() => {
              setSelectedDate(shiftDate(selectedDate, -7));
              setScope('day');
              setQuery('');
            }}
          >
            <ChevronLeft size={17} />
          </IconButton>
          <div className="today-week-days">
            {week.map((date, index) => (
              <button
                type="button"
                key={date}
                aria-label={dateLabel(date)}
                aria-pressed={selectedDate === date && scope === 'day' && !search}
                className={date === today ? 'is-today' : ''}
                onClick={() => {
                  setSelectedDate(date);
                  setScope('day');
                  setQuery('');
                }}
              >
                <span>{['周一', '周二', '周三', '周四', '周五', '周六', '周日'][index]}</span>
                <strong>{Number(date.slice(8))}</strong>
                <i className={datedDays.has(date) ? 'has-arrangement' : ''} aria-hidden="true" />
              </button>
            ))}
          </div>
          <IconButton
            label="后一周"
            onClick={() => {
              setSelectedDate(shiftDate(selectedDate, 7));
              setScope('day');
              setQuery('');
            }}
          >
            <ChevronRight size={17} />
          </IconButton>
        </div>
        {state.presentation?.mode !== 'public' && (
          <CampusDayControls campus={campus} dayVisible={campusDayVisible} timeZone={zone} />
        )}
        <div className="today-list-tools">
          <div className="today-scope" aria-label="安排范围">
            {(
              [
                ['day', '当天'],
                ['all', '全部安排'],
                ['undated', '未定日期'],
                ['completed', '做过的事'],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={!search && scope === value}
                onClick={() => {
                  setScope(value);
                  setQuery('');
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="today-search-tools">
            <div className="today-search">
              <Search size={16} />
              <input
                aria-label="搜索所有日期的本机安排"
                placeholder="找一件事"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <IconButton label="清空搜索" onClick={() => setQuery('')}>
                  <X size={13} />
                </IconButton>
              )}
            </div>
            {scope === 'day' && !search && hasTimeline && (
              <div className="today-layout-toggle" aria-label="安排视图">
                <button
                  type="button"
                  title="时间轴"
                  aria-label="时间轴"
                  aria-pressed={dayLayout === 'timeline'}
                  onClick={() => setDayLayout('timeline')}
                >
                  <Clock3 size={16} />
                </button>
                <button
                  type="button"
                  title="列表"
                  aria-label="列表"
                  aria-pressed={dayLayout === 'list'}
                  onClick={() => setDayLayout('list')}
                >
                  <List size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
        {search && <p className="today-search-note">在所有日期的本机安排里找「{query.trim()}」</p>}
        {moveUndo && (
          <div className="today-move-undo" role="status">
            <div>
              <p>
                <strong>{moveUndo.saved.title}</strong> · {formatDateTime(moveUndo.saved.startsAt!, zone)}
              </p>
              {moveUndo.error && (
                <p className="today-move-undo-error">
                  {moveUndo.error} 原来是 {formatDateTime(moveUndo.previous.startsAt!, zone)}。
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
        <div className={`today-agenda-list ${scope === 'day' && !search ? 'one-day' : ''}`}>
          {scope === 'day' && !search
            ? !!dayEntries.length && (
                <section className="today-day-group">
                  {showTimeline && (
                    <AgendaDayTimeline
                      date={selectedDate}
                      timeZone={zone}
                      actions={timedActions}
                      campus={timedCampus}
                      draft={
                        editing?.initialStartsAt
                          ? { original: editing.original, initialStartsAt: editing.initialStartsAt }
                          : undefined
                      }
                      onEdit={(item) => setEditing({ original: { ...item } })}
                      onPropose={(item, initialStartsAt) =>
                        setEditing({ original: { ...item }, initialStartsAt })
                      }
                    />
                  )}
                  {(showTimeline ? untimedEntries : dayEntries).map((entry) =>
                    entry.kind === 'action' ? (
                      row(entry.item)
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
          {!filtered.length && !campus.result?.items.length && (
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
              <p>
                {search
                  ? '换个词试试，所有日期里的安排都会一起找。'
                  : scope === 'completed'
                    ? '可以回头看看，也可以再接着做。'
                    : scope === 'undated'
                      ? '不必马上为它选一个时间。'
                      : '想起一件事时，再记下来也来得及。'}
              </p>
              {scope === 'day' && !search && (
                <button type="button" className="text-button" onClick={() => setScope('all')}>
                  看看全部安排
                  <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        {!search && scope !== 'completed' && scope !== 'undated' && !!repeated.length && (
          <section className="today-repeated">
            <h2>重复的安排</h2>
            <p>从这里改一次，或调整整个安排。</p>
            {repeated.map((item) => row(item, true))}
          </section>
        )}
        <button type="button" className="today-add" onClick={onCompose}>
          <Plus size={17} />
          记一件事
        </button>
        {scope === 'day' && !search && (
          <button
            type="button"
            className="today-continue-day text-button"
            onClick={() => onContinue(`我们接着聊 ${selectedDate} 这一天的安排。`)}
          >
            接着聊这一天
            <ArrowUpRight size={14} />
          </button>
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
        <p className="page-footnote">
          {state.settings.remindersEnabled
            ? '在场开着时，会在约好的时间提醒你。'
            : '想在约好的时间听到提醒，可以在偏好里打开。'}
        </p>
      </div>
      {section === 'entrusted' && (
        <div
          id="today-entrusted-panel"
          role="tabpanel"
          aria-labelledby="today-entrusted-tab"
          className="today-entrusted"
        >
          <p className="today-entrusted-lede">放在这里的事，随时可以继续，也可以先歇一歇。</p>
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
      {editing && (
        <AgendaEditor
          original={editing.original}
          current={state.agenda.find((item) => item.id === editing.original.id)}
          timeZone={zone}
          initialStartsAt={editing.initialStartsAt}
          onState={onState}
          onSaved={(saved, previous) => {
            if (
              editing.initialStartsAt &&
              saved.startsAt &&
              previous.startsAt &&
              saved.startsAt !== previous.startsAt
            ) {
              setMoveUndo({ previous: { ...previous }, saved: { ...saved } });
              setUndoAnnouncement('');
            }
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
    </PagePanel>
  );
}
