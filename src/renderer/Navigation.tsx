import { Pencil, Search, Settings2, Sun } from 'lucide-react';
import type { WorkspaceView } from './Workspace';
import { CompanionAvatar } from './companion';
import { APPEARANCE_PALETTES, useEffectiveEnvironment } from './appearance';

/** Places stay stable; personal appearance and app preferences have their own
 * entrances instead of sharing a drawer with every kind of work. */
export function Navigation({ busy, view, onView, onNew, onHistory, onCompanion }: {
  busy: boolean;
  view: WorkspaceView | 'home';
  onView: (view: WorkspaceView) => void;
  onNew: () => void;
  onHistory: () => void;
  onCompanion: (entry: 'partner' | 'light') => void;
}) {
  const environment = useEffectiveEnvironment();
  const lightName = APPEARANCE_PALETTES.find(item => item.id === environment.palette)?.name || '光线';
  return <nav className="top-navigation" aria-label="常用操作">
    <div className="primary-navigation" aria-label="主要页面" data-view={view === 'notes' || view === 'keep' ? 'notes' : view === 'materials' ? 'chat' : view}>
      <span className="primary-selection" aria-hidden="true" />
      <button type="button" aria-current={view === 'chat' || view === 'materials' ? 'page' : undefined} onClick={() => onView('chat')}>聊天</button>
      <button type="button" aria-current={view === 'agenda' ? 'page' : undefined} onClick={() => onView('agenda')}>今天</button>
      <button type="button" aria-current={view === 'notes' || view === 'keep' ? 'page' : undefined} onClick={() => onView('keep')}>留下</button>
    </div>
    <div className="navigation-personal">
      <button type="button" className="nav-button" aria-label="搜索对话、笔记与资料" title="搜索 · Ctrl K" onClick={onHistory}><Search size={19} /></button>
      {(view === 'chat' || view === 'home') && <button type="button" className="nav-button nav-new-conversation" aria-label="新的对话" title="新的对话 · Ctrl N" onClick={onNew} disabled={busy}><Pencil size={18} /></button>}
      <button type="button" className="nav-button navigation-atmosphere" aria-label={`选择氛围，当前${lightName}`} title="选择氛围" onClick={() => onCompanion('light')}><Sun size={19} /><span>{lightName}</span></button>
      <button type="button" className="nav-button companion-menu-trigger" aria-label="选择伙伴" title="选择伙伴" aria-current={view === 'companion' ? 'page' : undefined} onClick={() => onCompanion('partner')}><CompanionAvatar size={35} /></button>
      <button type="button" className="nav-button navigation-preferences" aria-label="相处、阅读与连接设置" title="设置" aria-current={view === 'settings' ? 'page' : undefined} onClick={() => onView('settings')}><Settings2 size={19} /></button>
    </div>
  </nav>;
}
