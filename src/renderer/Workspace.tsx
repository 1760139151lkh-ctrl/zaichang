import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { Action, State } from '../shared/types';
import { IconButton, PagePanel } from './ui';
import { WorkAndReceipts } from './HarnessViews';
import {
  AgendaEditor,
  MatterCard,
  PreparationShelf,
  type MatterInteraction,
  type MatterInteractionUpdate,
} from './LifePanels';
import { DEFAULT_TIME_ZONE, timeZoneLabel, toTimeInput } from './time';
import type { SharedMatterView } from '../shared/presentation';
import './today.css';

export type WorkspaceView =
  'chat' | 'agenda' | 'notes' | 'materials' | 'memory' | 'settings' | 'companion';
type AgendaScope = 'day' | 'all' | 'undated' | 'completed';

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
  const [today, setToday] = useState(() =>
    toTimeInput(new Date().toISOString(), zone).slice(0, 10),
  );
  const [selectedDate, setSelectedDate] = useState(today);
  const [section, setSection] = useState<'agenda' | 'entrusted'>('agenda');
  const [scope, setScope] = useState<AgendaScope>('day');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Action>();
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
    return scope === 'undated' ? !date : date === selectedDate;
  });
  const grouped = new Map<string, Action[]>();
  for (const item of filtered) {
    const date = actionDate(item, zone);
    grouped.set(date, [...(grouped.get(date) || []), item]);
  }
  const weekday = new Date(`${selectedDate}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(selectedDate, -((weekday + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
  const datedDays = new Set(
    ordered.filter((item) => !item.done && !item.recurrence).map((item) => actionDate(item, zone)),
  );
  const selectedLabel = dateLabel(selectedDate);
  const heading =
    section === 'entrusted'
      ? '你交给我的事'
      : selectedDate === today
        ? '今天，慢慢安排。'
        : '这一天，慢慢安排。';

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
            onClick={() => setEditing({ ...item })}
          >
            <strong>{item.title}</strong>
            {item.detail && <span className="today-item-detail">{item.detail}</span>}
            {(series ||
              sourceClock ||
              item.demo ||
              item.coverage === 'conditional' ||
              item.done) && (
              <span className="today-item-context">
                {series && (
                  <span>
                    {repeatLabel(item)}
                    {originDate
                      ? ` · 从 ${dateLabel(originDate, { weekday: undefined })} 开始`
                      : ''}
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
          <div>
            <p className="today-selected-date">{selectedLabel}</p>
            <small>{timeZoneLabel(zone)}</small>
          </div>
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
          <div className="today-search">
            <Search size={16} />
            <input
              aria-label="搜索所有安排"
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
        </div>
        {search && <p className="today-search-note">在所有日期里找「{query.trim()}」</p>}
        <div className={`today-agenda-list ${scope === 'day' && !search ? 'one-day' : ''}`}>
          {[...grouped]
            .sort(([a], [b]) => (a || '9999').localeCompare(b || '9999'))
            .map(([date, items]) => (
              <section className="today-day-group" key={date || 'undated'}>
                {(scope !== 'day' || search) && (
                  <h2>{date ? dateLabel(date, { year: 'numeric' }) : '还没定日期'}</h2>
                )}
                {items.map((item) => row(item, !!item.recurrence))}
              </section>
            ))}
          {!filtered.length && (
            <div className="today-empty">
              <span className="today-empty-line" aria-hidden="true" />
              <h2>
                {search
                  ? '还没找到这件事。'
                  : scope === 'completed'
                    ? '慢慢做，不着急。'
                    : scope === 'undated'
                      ? '想到的事，可以先放在这里。'
                      : scope === 'all'
                        ? '想做什么，我们慢慢说。'
                        : '给这一天，留一点空白。'}
              </h2>
              <p>
                {search
                  ? '换个词试试，所有日期里的安排都会一起找。'
                  : scope === 'completed'
                    ? '做完的事情，会留在这里。'
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
          {!!filtered.length && scope === 'day' && !search && (
            <p className="today-breathing-room">不必把每一刻都排满。</p>
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
          {!!state.preparations?.length && (
            <div className="today-prepared">
              <PreparationShelf
                inline
                items={state.preparations}
                timeZone={zone}
                onState={onState}
                onContinue={onContinue}
              />
            </div>
          )}
          <WorkAndReceipts
            onResume={onResume}
            onChanged={onChanged}
            onAttention={setAttention}
            currentActionIds={state.agenda.map((item) => item.effectActionId || item.id)}
          />
        </div>
      )}
      {editing && (
        <AgendaEditor
          original={editing}
          current={state.agenda.find((item) => item.id === editing.id)}
          timeZone={zone}
          onState={onState}
          onClose={() => setEditing(undefined)}
        />
      )}
    </PagePanel>
  );
}
