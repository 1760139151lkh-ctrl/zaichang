import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  History,
  MapPinned,
  Pencil,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import type { WorkspaceView } from './Workspace';

/** Navigation opens existing views; it never owns business data. */
export function Navigation({
  busy,
  view,
  onView,
  onNew,
  onHistory,
  onMap,
}: {
  busy: boolean;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  onNew: () => void;
  onHistory: () => void;
  onMap: () => void;
}) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    host.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const go = (action: () => void) => {
    setOpen(false);
    action();
  };
  return (
    <nav className="top-navigation" aria-label="常用操作">
      <button className="nav-button" aria-label="历史对话" title="历史对话 · Ctrl K" onClick={onHistory}>
        <History size={18} />
        <span>历史</span>
      </button>
      <button
        className="nav-button"
        aria-label="新的对话"
        title="新的对话 · Ctrl N"
        onClick={onNew}
        disabled={busy}
      >
        <Pencil size={17} />
        <span>新对话</span>
      </button>
      <div className="navigation-menu-anchor" ref={host}>
        <button
          ref={trigger}
          className={`nav-button ${open ? 'is-open' : ''}`}
          aria-label="更多功能"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span>更多</span>
          <ChevronDown size={14} />
        </button>
        {open && (
          <div
            className="navigation-menu"
            role="menu"
            aria-label="更多功能"
            onKeyDown={(event) => {
              const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
              const i = items.indexOf(document.activeElement as HTMLButtonElement);
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : (i + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
                items[next]?.focus();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                trigger.current?.focus();
              }
              if (event.key === 'Tab') {
                event.preventDefault();
                const focusables = [
                  ...document.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
                  ),
                ].filter((el) => el.getClientRects().length > 0 && !event.currentTarget.contains(el));
                const index = focusables.indexOf(trigger.current!);
                const next = focusables[index + (event.shiftKey ? -1 : 1)];
                setOpen(false);
                (next || trigger.current)?.focus({ preventScroll: true });
              }
            }}
          >
            <button
              role="menuitem"
              aria-current={view === 'agenda' ? 'page' : undefined}
              onClick={() => go(() => onView('agenda'))}
            >
              <CalendarDays size={18} />
              <span>我的安排</span>
            </button>
            <button role="menuitem" aria-label="打开校园地图" onClick={() => go(onMap)}>
              <MapPinned size={18} />
              <span>校园地图</span>
            </button>
            <button
              role="menuitem"
              aria-current={view === 'memory' ? 'page' : undefined}
              onClick={() => go(() => onView('memory'))}
            >
              <UserRound size={18} />
              <span>关于你</span>
            </button>
            <button
              role="menuitem"
              aria-current={view === 'settings' ? 'page' : undefined}
              onClick={() => go(() => onView('settings'))}
            >
              <SlidersHorizontal size={18} />
              <span>连接与偏好</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
