import { useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  History,
  MapPinned,
  MessageSquare,
  Plus,
  Search,
  SlidersHorizontal,
  Sprout,
  X,
  Pencil,
} from 'lucide-react';
import type { Action, State } from '../shared/types';
import { IconButton, PagePanel, Portal } from './ui';
import { WorkAndReceipts } from './HarnessViews';
import { AgendaEditor, MatterCard, type MatterInteraction, type MatterInteractionUpdate } from './LifePanels';
import { DEFAULT_TIME_ZONE, timeZoneLabel } from './time';
import type { SharedMatterView } from '../shared/presentation';

export type WorkspaceView = 'chat' | 'agenda' | 'memory' | 'settings';

function dayKey(value?: string, timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return '没有指定时间';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '时间需要核对'
    : d.toLocaleDateString('zh-CN', {
        timeZone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });
}

export function AgendaView({
  state,
  onAction,
  onResume,
  onChanged,
  onClose,
  onCompose,
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
  onState: (state: State) => void;
  onPresentMatter: (matter: SharedMatterView) => void;
  onMap: (id: string) => void;
  matterInteractions: Record<string, MatterInteraction>;
  onMatterInteraction: (id: string, value: MatterInteractionUpdate) => void;
}) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Action>();
  const [attention, setAttention] = useState(0);
  const pending = state.agenda.filter((a) => !a.done && `${a.title} ${a.detail}`.includes(query));
  const completed = state.agenda.filter((a) => a.done && `${a.title} ${a.detail}`.includes(query));
  const grouped = new Map<string, Action[]>();
  for (const a of [...pending].sort((a, b) =>
    (a.allDayDate || a.startsAt || '9999').localeCompare(b.allDayDate || b.startsAt || '9999'),
  )) {
    const key = dayKey(
      a.allDayDate ? `${a.allDayDate}T12:00:00Z` : a.startsAt,
      a.allDayDate ? 'UTC' : a.timeZone || state.settings.timeZone,
    );
    grouped.set(key, [...(grouped.get(key) || []), a]);
  }
  function row(a: Action) {
    return (
      <article className={`agenda-item ${a.done ? 'done' : ''}`} key={a.id}>
        <IconButton
          label={a.done ? '已标记完成（仅本机）' : `标记完成（仅本机）：${a.title}`}
          disabled={a.done}
          onClick={() => onAction(a, 'done')}
        >
          {a.done ? <Check size={18} /> : <Circle size={20} />}
        </IconButton>
        <div className="agenda-item-content">
          <strong>{a.title}</strong>
          {a.detail && <p>{a.detail}</p>}
          <small>
            {a.allDayDate
              ? '全天'
              : a.startsAt
                ? new Date(a.startsAt).toLocaleTimeString('zh-CN', {
                    timeZone: a.timeZone || state.settings.timeZone,
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })
                : '时间待定'}
            {a.durationMinutes ? ` · ${a.durationMinutes} 分钟` : ''}
            {a.timeZone && a.timeZone !== state.settings.timeZone ? ` · ${timeZoneLabel(a.timeZone)}` : ''}
            {a.recurrence ? ' · 重复安排' : ''}
            {a.demo ? ' · 示例建议' : ''}
            {a.coverage === 'conditional' ? ' · 条件待核对' : ''}
          </small>
        </div>
        <IconButton label={`修改：${a.title}`} onClick={() => setEditing({ ...a })}>
          <Pencil size={15} />
        </IconButton>
        <IconButton label={`移除：${a.title}`} onClick={() => onAction(a, 'delete')}>
          <X size={16} />
        </IconButton>
      </article>
    );
  }
  return (
    <PagePanel title="我的安排" onClose={onClose} className="agenda-page">
      <div className="page-lede">
        <p>按{timeZoneLabel(state.settings.timeZone)}显示，其他时区单独注明。</p>
        <button className="subtle-button" onClick={onCompose}>
          记一件事
          <ArrowUpRight size={15} />
        </button>
      </div>
      {state.agenda.length > 6 && (
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="搜索安排"
            placeholder="找一件事"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      {!!pending.length && (
        <div className="agenda-list">
          {[...grouped].map(([day, items]) => (
            <section className="agenda-day" key={day}>
              <h2>{day}</h2>
              {items.map(row)}
            </section>
          ))}
        </div>
      )}
      {!pending.length && (
        <div className="page-empty">
          <CalendarDays size={28} />
          <h2>{query ? '没有找到这件事。' : completed.length ? '当前安排都已完成' : '还没有安排'}</h2>
          <p>{query ? '换一个词试试。' : '想起一件事时，可以直接在对话里告诉在场。'}</p>
          {!query && (
            <button className="text-button" onClick={onCompose}>
              说一件想做的事
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      )}
      {!!completed.length && (
        <details className="completed-agenda">
          <summary>
            已经完成 <span>{completed.length}</span>
          </summary>
          {completed.map(row)}
        </details>
      )}
      {!!state.matters?.length && (
        <details className="shared-matters">
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
      {editing && (
        <AgendaEditor
          original={editing}
          current={state.agenda.find((item) => item.id === editing.id)}
          timeZone={state.settings.timeZone}
          onState={onState}
          onClose={() => setEditing(undefined)}
        />
      )}
      <details className={`agenda-followup ${attention ? 'needs-attention' : ''}`}>
        <summary>
          {attention ? `${attention} 件事的结果需要核查` : '进行中的事与操作记录'}
          <ChevronRight size={15} />
        </summary>
        <WorkAndReceipts
          onResume={onResume}
          onChanged={onChanged}
          onAttention={setAttention}
          currentActionIds={state.agenda.map((a) => a.effectActionId || a.id)}
        />
      </details>
      <p className="page-footnote">
        {state.settings.remindersEnabled
          ? '在场运行时，会提醒已设定时间的安排。'
          : '提醒未开启。需要时，可以在偏好中打开。'}
      </p>
    </PagePanel>
  );
}
