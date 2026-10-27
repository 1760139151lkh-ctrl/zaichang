import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Archive, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, List, MapPinned, MessageSquareText, MoreHorizontal, Plus, Search, Sparkles, X } from 'lucide-react';
import './today-navigation.css';

export type TodayNavigationScope = 'day' | 'all' | 'undated' | 'completed';

export interface TodayNavigationProps {
  selectedDate: string;
  today: string;
  timeZoneLabel: string;
  section: 'agenda' | 'entrusted';
  scope: TodayNavigationScope;
  query: string;
  dayLayout: 'timeline' | 'list';
  hasTimeline: boolean;
  attention?: number;
  onDateChange: (date: string) => void;
  onSectionChange: (section: 'agenda' | 'entrusted') => void;
  onScopeChange: (scope: TodayNavigationScope) => void;
  onQueryChange: (query: string) => void;
  onLayoutChange: (layout: 'timeline' | 'list') => void;
  onCompose: () => void;
  onOpenMap?: () => void;
  onDiscussDay: () => void;
  campusTools?: ReactNode;
  calendarTools?: ReactNode;
}

function shiftedDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const scopeOptions = [
  { value: 'day', label: '这一天', Icon: CalendarDays },
  { value: 'all', label: '全部安排', Icon: List },
  { value: 'undated', label: '未定日期', Icon: Archive },
  { value: 'completed', label: '做过的事', Icon: Check },
] as const;

/** Local navigation only. The original AgendaView retains every owner and draft. */
export function TodayNavigation({ selectedDate, today, timeZoneLabel, section, scope, query, dayLayout,
  hasTimeline, attention = 0, onDateChange, onSectionChange, onScopeChange, onQueryChange,
  onLayoutChange, onCompose, onOpenMap, onDiscussDay, campusTools, calendarTools }: TodayNavigationProps) {
  const options = useRef<HTMLDetailsElement>(null);
  const optionsTrigger = useRef<HTMLElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const dateField = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(!!query);
  const searching = section === 'agenda' && (searchOpen || !!query);
  const dateText = new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString('zh-CN', {
    timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short',
  });
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (options.current?.open && event.target instanceof Node && !options.current.contains(event.target)) options.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  function closeOptions(returnFocus = false) {
    if (options.current) options.current.open = false;
    if (returnFocus) optionsTrigger.current?.focus();
  }
  function chooseDate(date: string) {
    const returnFocus = options.current?.contains(document.activeElement) === true;
    const returnToDate = document.activeElement instanceof HTMLElement && document.activeElement.classList.contains('today-navigation-now');
    onSectionChange('agenda'); onDateChange(date); closeOptions(returnFocus);
    if (returnToDate) requestAnimationFrame(() => dateField.current?.focus());
  }
  function chooseScope(value: TodayNavigationScope) {
    const returnFocus = options.current?.contains(document.activeElement) === true;
    const returnToDate = document.activeElement instanceof HTMLElement && document.activeElement.classList.contains('today-navigation-current');
    onSectionChange('agenda'); onScopeChange(value); closeOptions(returnFocus);
    if (returnToDate) requestAnimationFrame(() => dateField.current?.focus());
  }
  return <div className="today-navigation" data-section={section}>
    {section === 'agenda' && <div className="today-navigation-date" role="group" aria-label="查看哪一天">
      <button type="button" className="today-navigation-icon" aria-label="前一天" onClick={() => chooseDate(shiftedDate(selectedDate, -1))}><ChevronLeft size={17} /></button>
      <label className="today-navigation-picker">
        <CalendarDays size={15} aria-hidden="true" /><span>{dateText}</span>
        <input ref={dateField} type="date" aria-label="选择日期" value={selectedDate} onChange={event => { if (event.target.value) chooseDate(event.target.value); }} />
      </label>
      <button type="button" className="today-navigation-icon" aria-label="后一天" onClick={() => chooseDate(shiftedDate(selectedDate, 1))}><ChevronRight size={17} /></button>
      {(selectedDate !== today || scope !== 'day' || !!query) && <button type="button" className="today-navigation-now" onClick={() => chooseDate(today)}>回今天</button>}
    </div>}
    {section === 'agenda' && scope !== 'day' && !query && <button type="button" className="today-navigation-current" onClick={() => chooseScope('day')}>
      {scopeOptions.find(value => value.value === scope)?.label}<X size={13} aria-hidden="true" />
    </button>}
    {section === 'entrusted' && <button type="button" className="today-navigation-current" onClick={() => chooseScope('day')}><CalendarDays size={15} aria-hidden="true" />回到这一天</button>}
    <div className="today-navigation-actions">
      {onOpenMap && <button type="button" className="today-navigation-icon" aria-label="打开校园地图" title="校园地图" onClick={onOpenMap}><MapPinned size={19} /></button>}
      <button type="button" className="today-navigation-add" aria-label="在对话里记一件事" onClick={onCompose}><Plus size={17} aria-hidden="true" /><span>记一件事</span></button>
      <button ref={searchTrigger} type="button" className="today-navigation-icon" aria-label={searching ? '收起安排搜索' : '找一件事'} aria-expanded={searching} onClick={() => {
        if (searching) { onQueryChange(''); setSearchOpen(false); return; }
        onSectionChange('agenda'); setSearchOpen(true); requestAnimationFrame(() => searchField.current?.focus());
      }}><Search size={17} /></button>
      <details ref={options} className="today-navigation-more" onBlur={event => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) closeOptions();
      }} onKeyDown={event => {
        if (event.key === 'Escape' && !event.defaultPrevented && options.current?.open) {
          event.preventDefault(); event.stopPropagation(); closeOptions(true);
        }
      }}>
        <summary ref={optionsTrigger} className="today-navigation-icon" aria-label="更多安排和托付" title="更多安排和托付"><MoreHorizontal size={20} /></summary>
        <div className="today-options-popover">
          <div className="today-options-scopes" role="group" aria-label="安排范围">
            {scopeOptions.map(({ value, label, Icon }) => <button type="button" key={value} aria-pressed={section === 'agenda' && !query && scope === value} onClick={() => chooseScope(value)}><Icon size={16} aria-hidden="true" /><span>{label}</span></button>)}
          </div>
          <button type="button" className="today-options-entrusted" aria-pressed={section === 'entrusted'} onClick={() => { onSectionChange('entrusted'); closeOptions(true); }}>
            <Sparkles size={16} aria-hidden="true" /><span>你交给我的事</span>{attention > 0 && <i className="today-attention-dot" aria-label="有一件事需要看看" />}
          </button>
          <button type="button" className="today-options-entrusted" onClick={() => { closeOptions(); onDiscussDay(); }}><MessageSquareText size={17} aria-hidden="true" /><span>聊聊这一天</span></button>
          {section === 'agenda' && scope === 'day' && !query && hasTimeline && <div className="today-options-layout" role="group" aria-label="安排视图">
            <button type="button" aria-pressed={dayLayout === 'timeline'} onClick={() => { onLayoutChange('timeline'); closeOptions(true); }}><Clock3 size={16} aria-hidden="true" />时间轴</button>
            <button type="button" aria-pressed={dayLayout === 'list'} onClick={() => { onLayoutChange('list'); closeOptions(true); }}><List size={16} aria-hidden="true" />列表</button>
          </div>}
          <div className="today-options-date" role="group" aria-label="按周移动日期">
            <button type="button" onClick={() => chooseDate(shiftedDate(selectedDate, -7))}><ChevronLeft size={14} aria-hidden="true" />前一周</button>
            <button type="button" onClick={() => chooseDate(shiftedDate(selectedDate, 7))}>后一周<ChevronRight size={14} aria-hidden="true" /></button>
          </div>
          {(campusTools || calendarTools) && <div className="today-options-tools">{campusTools}{calendarTools}</div>}
          <span className="today-options-zone" title={timeZoneLabel} aria-label={timeZoneLabel}><Clock3 size={17} aria-hidden="true" /></span>
        </div>
      </details>
    </div>
    {searching && <div className="today-navigation-search">
      <Search size={16} aria-hidden="true" />
      <input ref={searchField} aria-label="搜索所有日期的本机安排" placeholder="找一件事" value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onQueryChange(''); setSearchOpen(false); searchTrigger.current?.focus(); }
      }} />
      <button type="button" className="today-navigation-icon" aria-label={query ? '清空搜索' : '收起安排搜索'} onClick={() => {
        if (query) { onQueryChange(''); searchField.current?.focus(); } else { setSearchOpen(false); searchTrigger.current?.focus(); }
      }}><X size={15} /></button>
    </div>}
  </div>;
}
