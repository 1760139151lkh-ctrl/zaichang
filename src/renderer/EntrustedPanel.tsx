import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, MessageCircle, Pause, RotateCcw, Sprout } from 'lucide-react';
import { attentionSourceName as sourceName, type AttentionControlItem } from '../shared/attention-control';
import type { State } from '../shared/types';
import type { PreparationView } from '../shared/presentation';
import { PreparationShelf } from './LifePanels';
import { DEFAULT_TIME_ZONE, formatDateTime, timeZoneLabel } from './time';
import { uiError } from './ui';
import './entrusted-detail.css';
import { EntrustedRevision } from './EntrustedRevision';

const api = window.zaichang;
const stateNames: Record<AttentionControlItem['status'], string> = {
  active: '先替你留着心', paused: '先放一放', ended: '这件事，不再留意了',
  expired: '这段约定到这里了', unavailable: '先停在这里，等条件齐了',
};
function stateDescription(item: AttentionControlItem) {
  if (item.status === 'ended') return '后续不会再围绕这件事主动查看。想重新约定时，我们再聊。';
  if (item.status === 'expired') return '已经到了约好的时间。之后还需要的话，我们可以再聊聊。';
  if (item.unavailableReason === 'source_permission') return '这件事需要的资料现在不能使用，先不继续查看。';
  if (item.unavailableReason === 'permission_retracted') return '这件事原来使用的资料许可已经收回。想再留意时，我们重新约定。';
  if (item.unavailableReason === 'parent_inactive') return '相关的约定已经暂停或结束，这件事也先停在这里。';
  if (item.status === 'paused') return '这件事先不着急。你想继续时，可以从这里接着来。';
  return '在你约好的范围里，有了新的变化，再一起看看。';
}

export function EntrustedPanel({ onResume, onChanged, preparations, onState, onContinue, timeZone = DEFAULT_TIME_ZONE }: { onResume: (sessionId: string) => void; onChanged: () => void; preparations: PreparationView[]; onState: (state: State) => void; onContinue: (text: string) => void; timeZone?: string }) {
  const [items, setItems] = useState<AttentionControlItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pastOpen, setPastOpen] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const zone = timeZone;
  const generation = useRef(0);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async (next?: string, retain?: AttentionControlItem) => {
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const result = await api.attentionList({ ...(next ? { cursor: next } : {}), limit: 30 });
      if (!mounted.current || generation.current !== request) return;
      const incoming = retain && !result.items.some(item => item.id === retain.id) ? [...result.items, retain] : result.items;
      setItems(current => next ? [...current.filter(item => !incoming.some(added => added.id === item.id)), ...incoming] : incoming);
      setCursor(result.nextCursor); setLoaded(true);
      setSelectedId(current => current && (next || incoming.some(item => item.id === current)) ? current : (result.items.find(item => item.status === 'active') || result.items[0])?.id || '');
    } catch (problem) {
      if (mounted.current && generation.current === request) setError(uiError(problem));
    } finally {
      if (mounted.current && generation.current === request) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; generation.current++; };
  }, [load]);

  useEffect(() => {
    if (pending) return;
    const now = Date.now();
    const nextBoundary = items.flatMap(item => ['active', 'paused', 'unavailable'].includes(item.status)
      ? [item.until, ...item.pauseRules.map(rule => rule.until)] : [])
      .filter((at): at is string => !!at).map(at => Date.parse(at)).filter(at => Number.isFinite(at) && at > now).sort((a, b) => a - b)[0];
    if (!nextBoundary) return;
    const timer = window.setTimeout(() => void load(), Math.min(nextBoundary - now + 150, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [items, pending, load]);

  const selected = items.find(item => item.id === selectedId);
  const ongoing = items.filter(item => ['active', 'unavailable'].includes(item.status));
  const past = items.filter(item => !['active', 'unavailable'].includes(item.status));
  const selectedInPast = !!selected && past.some(item => item.id === selected.id);
  const otherPreparations = preparations.filter(item => !items.some(focus => focus.id === item.matterId));
  const relatedPreparations = selected?.status === 'active' ? preparations.filter(item => item.matterId === selected.id) : [];
  const when = (value: string) => formatDateTime(value, zone, { year: 'numeric' });

  async function revise(base: AttentionControlItem, changes: { sources: string[]; until: string | null }) {
    if (pending) return;
    setPending(base.id); setError(''); setNotice('');
    try {
      const updated = await api.attentionChange({ id: base.id, expectedRevision: base.revision, expectedControlVersion: base.controlVersion, operation: 'revise', changes });
      if (!mounted.current) return;
      setItems(current => current.map(item => item.id === updated.id ? updated : item));
      setEditingId(''); setNotice('这件事会照新的约定留意。'); onChanged();
      await load(undefined, updated);
      requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    } catch (problem) {
      await load();
      throw problem;
    } finally { if (mounted.current) setPending(''); }
  }

  async function change(operation: 'pause' | 'resume' | 'stop', rule?: AttentionControlItem['pauseRules'][number]) {
    if (!selected || pending) return;
    const target = selected;
    setPending(target.id); setError(''); setNotice('');
    try {
      const updated = await api.attentionChange({ id: target.id, expectedRevision: target.revision,
        expectedControlVersion: target.controlVersion, operation,
        ...(rule ? { ruleId: rule.id, ruleRevision: rule.revision } : {}) });
      if (!mounted.current) return;
      setItems(current => current.map(item => item.id === updated.id ? updated : item));
      if (!['active', 'unavailable'].includes(updated.status)) setPastOpen(true);
      setNotice(operation === 'pause' ? '先放在这里，等你想继续。' : operation === 'stop' ? '好，这件事就不再留意了。' : updated.status === 'active' ? '继续按原来的约定留意。' : '这次暂停已经放开，其他约定仍会保留。');
      onChanged();
      await load(undefined, updated);
      requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    } catch (problem) {
      if (mounted.current) {
        const reason = uiError(problem);
        // Read back the current contract after a conflict; never retry a mutation automatically.
        await load();
        if (mounted.current) setError(reason);
      }
    } finally { if (mounted.current) setPending(''); }
  }

  function choice(item: AttentionControlItem) {
    return <button key={item.id} type="button" className="entrusted-choice" aria-pressed={selectedId === item.id}
      disabled={!!pending || !!editingId && editingId !== item.id} onClick={() => { setSelectedId(item.id); setNotice(''); setError(''); setMobileListOpen(false); requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); }}>
      <span className="entrusted-choice-mark" aria-hidden="true">{item.status === 'paused' ? <Pause size={20} /> : item.status === 'expired' || item.status === 'ended' ? <CalendarDays size={20} /> : <Sprout size={22} />}</span>
      <span className="entrusted-choice-copy"><strong>{item.title}</strong><small>{item.status === 'active' ? (item.until ? `到 ${formatDateTime(item.until, zone)}` : '按我们的约定') : stateNames[item.status]}</small></span>
      <ChevronRight size={15} aria-hidden="true" />
    </button>;
  }

  if (!loaded && loading) return <div className="entrusted-opening" role="status"><Sprout size={24} strokeWidth={1.4} /><p>看看你交给我的事…</p></div>;
  if (!loaded) return <section className="entrusted-start" aria-label="你交给我的事"><span className="entrusted-state-mark" aria-hidden="true"><BookOpen size={28} strokeWidth={1.35} /></span><div><h3>刚才没能翻开这些约定</h3><p role="alert">{error}</p><button type="button" className="subtle-button" onClick={() => void load()}>再看看</button></div></section>;
  if (!items.length) return <><section className="entrusted-start" aria-label="你交给我的事">
    <span className="entrusted-state-mark" aria-hidden="true"><Sprout size={30} strokeWidth={1.35} /></span>
    <div><h3>有件事，想让我帮你留意吗？</h3><p>回到聊天，告诉我想关注什么。什么时候停、怎样告诉你，都可以慢慢约定。</p></div>
    {error && <div role="alert" className="entrusted-problem"><p>{error}</p><button type="button" className="text-button" disabled={loading} onClick={() => void load()}><RotateCcw size={15} />再看一次</button></div>}
  </section>{!!otherPreparations.length && <PreparationShelf inline items={otherPreparations} timeZone={zone} onState={onState} onContinue={onContinue} />}</>;

  return <><section className="entrusted-workspace" aria-label="持续留意的事" aria-busy={!!pending}>
    <nav className={`entrusted-list ${mobileListOpen ? 'is-open' : ''}`} aria-label="选择托付">
      <div className="entrusted-list-heading"><span className="entrusted-list-label">放在心上的事</span><button type="button" className="entrusted-list-toggle" aria-expanded={mobileListOpen} aria-controls="entrusted-choices" onClick={() => setMobileListOpen(value => !value)}>换一件事看看<ChevronDown size={16} /></button><button type="button" className="icon-button" aria-label="再看看托付" title="再看看" disabled={loading || !!pending || !!editingId} onClick={() => void load()}><RotateCcw size={15} /></button></div>
      <div className="entrusted-choices" id="entrusted-choices"><div className="entrusted-current-list">{ongoing.map(choice)}</div>
      {!!past.length && <details className="entrusted-past" open={pastOpen || selectedInPast} onToggle={event => setPastOpen(event.currentTarget.open)}>
        <summary><ChevronDown size={16} />先放下的约定<span>{past.length}</span></summary>
        <div>{past.map(choice)}</div>
      </details>}
      {cursor && <button type="button" className="text-button entrusted-more" disabled={loading || !!pending} onClick={() => void load(cursor)}>{loading ? '正在翻看…' : '再看看之前的事'}</button>}</div>
    </nav>
    {selected && <div className="entrusted-detail" aria-labelledby="entrusted-detail-title">
      <header className="entrusted-detail-heading"><h2 id="entrusted-detail-title" ref={heading} tabIndex={-1}>{selected.title}</h2>
        <p><CalendarDays size={16} aria-hidden="true" />{selected.until ? `到 ${when(selected.until)}` : '没有约定结束日期'}<span aria-hidden="true"> · </span>{selected.channel === 'in_app' ? '在对话里告诉你' : '可以用系统通知提醒你'}</p>
      </header>
      <div className="entrusted-detail-paper">
        <div className="entrusted-state-copy"><span className="entrusted-state-mark" aria-hidden="true">{selected.status === 'paused' ? <Pause size={28} strokeWidth={1.4} /> : selected.status === 'expired' || selected.status === 'ended' ? <CalendarDays size={28} strokeWidth={1.4} /> : <Sprout size={29} strokeWidth={1.4} />}</span>
          <div><h3>{relatedPreparations.length ? '有些内容，想和你一起看看' : stateNames[selected.status]}</h3><p>{relatedPreparations.length ? '这件事留下的资料在下面，想看时再打开。' : stateDescription(selected)}</p></div>
        </div>
        {!!relatedPreparations.length && <div className="entrusted-materials"><PreparationShelf key={selected.id} inline items={relatedPreparations} timeZone={zone} onState={onState} onContinue={onContinue} /></div>}
        {editingId === selected.id ? <EntrustedRevision item={selected} timeZone={zone} pending={!!pending} sourceName={sourceName} onSave={revise} onCancel={() => { setEditingId(''); requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); }} /> : <><div className="entrusted-agreement-edit">{selected.canRevise && <button type="button" className="text-button" disabled={!!pending} onClick={() => { setEditingId(selected.id); setNotice(''); setError(''); requestAnimationFrame(() => document.getElementById('entrusted-revision-title')?.focus({ preventScroll: true })); }}>改一改约定</button>}</div><details className="entrusted-agreement" open>
          <summary>范围与约定<ChevronDown size={16} /></summary>
          <dl><div><dt><BookOpen size={19} />允许参考</dt><dd>{selected.sources.length ? [...new Set(selected.sources.map(sourceName))].join('、') : '还没有可用的资料范围'}</dd></div>
            <div><dt><CalendarDays size={19} />到什么时候</dt><dd>{selected.until ? <><time dateTime={selected.until}>{when(selected.until)}</time><small>{timeZoneLabel(zone)}</small></> : '没有约定结束日期，随时可以停止'}</dd></div>
            <div><dt><MessageCircle size={19} />怎样告诉你</dt><dd>{selected.channel === 'in_app' ? '在对话里' : '在这里，也可以用系统通知'}</dd></div></dl>
          {selected.status === 'paused' && selected.pauseRules.some(rule => rule.until) && <p className="entrusted-pause-until">这次暂停的约定：{selected.pauseRules.filter(rule => rule.until).map(rule => `到 ${when(rule.until!)}`).join('；')}。</p>}
        </details></>}
        <div className="entrusted-detail-actions">
          {selected.canPause && <button type="button" className="primary-button" disabled={!!pending} onClick={() => void change('pause')}>先放一放</button>}
          {selected.pauseRules.filter(rule => rule.resumable).map((rule, index, resumable) => <button key={rule.id} type="button" className="primary-button" disabled={!!pending} onClick={() => void change('resume', rule)}>{resumable.length === 1 ? '继续留意' : rule.until ? `解除到 ${formatDateTime(rule.until, zone)} 的暂停` : `解除暂停 ${index + 1}`}</button>)}
          {selected.sessionId && <button type="button" className="subtle-button" disabled={!!pending} onClick={() => onResume(selected.sessionId!)}>{selected.status === 'expired' || selected.status === 'ended' ? '再聊聊这件事' : '回到那段对话'}</button>}
          {selected.canStop && <button type="button" className="text-button entrusted-stop" disabled={!!pending} onClick={() => void change('stop')}>不再留意</button>}
        </div>
        {selected.status === 'paused' && !selected.pauseRules.some(rule => rule.resumable) && !selected.unavailableReason && <p className="entrusted-contract-note">还有其他暂停约定。想换一种安排，可以回到聊天告诉我。</p>}
        <details className="entrusted-about"><summary>关于这件事</summary><p>想换留意的内容或提醒方式，可以回到那段对话再说说。暂停或停止时，这件事和从它延伸的托付会一起停下，其他约定仍照常保留。</p><p>在场开着时才会继续留意。允许参考的资料，也要在当前仍可使用。</p></details>
        {notice && <p className="entrusted-notice" role="status">{notice}</p>}
        {error && <p className="entrusted-problem" role="alert">{error}</p>}
      </div>
    </div>}
  </section>{!!otherPreparations.length && <div className="entrusted-other-materials"><PreparationShelf inline items={otherPreparations} timeZone={zone} onState={onState} onContinue={onContinue} /></div>}</>;
}
