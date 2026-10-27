import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronRight, FileText, History, LoaderCircle, MessageCircle, Search, Trash2, X } from 'lucide-react';
import type { Conversation, State } from '../shared/types';
import { LOCAL_SEARCH_LIMITS, type LocalSearchBridge, type LocalSearchHit, type LocalSearchKind, type LocalSearchLocator, type LocalSearchPage } from '../shared/search';
import { IconButton, Modal, uiError } from './ui';
import { formatDateTime } from './time';
import './local-search.css';

const api = window.zaichang as typeof window.zaichang & LocalSearchBridge;
const kinds = [{ value: 'all', label: '全部' }, { value: 'conversation', label: '对话' }, { value: 'note', label: '笔记' }, { value: 'material', label: '资料' }] as const;
const kindName = { conversation: '对话', note: '笔记', material: '资料' };
const kindAction = { conversation: '回到这句话', note: '翻开这一页', material: '打开原文' };

function Excerpt({ hit }: { hit: LocalSearchHit }) {
  const text = Array.from(hit.snippet);
  return <>{text.slice(0, hit.match.start).join('')}<mark>{text.slice(hit.match.start, hit.match.end).join('')}</mark>{text.slice(hit.match.end).join('')}</>;
}

/** Owner-only local retrieval. A hit is resolved again before leaving the sheet. */
export function LocalSearchPanel({ state, conversations, busy, onClose, onRestoreFocus, onOpen, onSelect, onDelete }: {
  state: Pick<State, 'privacyEpoch' | 'policyRevision' | 'sourceBoundary' | 'settings'>;
  conversations: Conversation[];
  busy: boolean;
  onClose: () => void;
  onRestoreFocus: () => void;
  onOpen: (id: string) => Promise<void>;
  onSelect: (locator: LocalSearchLocator) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | LocalSearchKind>('all');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [chosenSessions, setChosenSessions] = useState<string[]>([]);
  const [scopePickerOpen, setScopePickerOpen] = useState(true);
  const [result, setResult] = useState<LocalSearchPage>();
  const [resultKey, setResultKey] = useState('');
  const [loading, setLoading] = useState(false), [opening, setOpening] = useState('');
  const [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [deleting, setDeleting] = useState(''), [removing, setRemoving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0), mounted = useRef(true);
  const boundary = `${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`;
  const currentBoundary = useRef(boundary);
  currentBoundary.current = boundary;
  const term = query.trim();
  const selectedScope = kind === 'conversation' && scope === 'selected';
  const availableSessions = new Set(conversations.map(conversation => conversation.id));
  const sessionIds = [...new Set(chosenSessions.filter(id => availableSessions.has(id)))].sort();
  const selectionMissing = selectedScope && !sessionIds.length;
  const requestKey = JSON.stringify([boundary, kind, selectedScope ? sessionIds : null, term]);
  const currentRequest = useRef(requestKey);
  currentRequest.current = requestKey;
  const visible = resultKey === requestKey && result && result.privacyEpoch === state.privacyEpoch
    && result.policyRevision === state.policyRevision && (result.sourceBoundary ?? 0) === (state.sourceBoundary ?? 0) ? result : undefined;

  function invalidate() {
    generation.current++;
    setResult(undefined); setError(''); setOpening(''); setLoading(false); setDeleting('');
    void api.searchCancel().catch(() => {});
  }
  function chooseSession(id: string) {
    invalidate();
    setChosenSessions(previous => sessionIds.includes(id) ? previous.filter(value => value !== id)
      : sessionIds.length < LOCAL_SEARCH_LIMITS.sessions ? [...sessionIds, id] : sessionIds);
  }
  function searchInput() {
    return { query: term, ...(kind === 'all' ? {} : { kinds: [kind] }), ...(selectedScope ? { sessionIds } : {}) };
  }

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; void api.searchCancel().catch(() => {}); }; }, []);
  useEffect(() => {
    const token = ++generation.current;
    setResult(undefined); setError(''); setOpening(''); setLoading(!!term && !selectionMissing); setDeleting('');
    void api.searchCancel().catch(() => {});
    if (!term || selectionMissing) return;
    const timer = window.setTimeout(() => {
      void api.searchLocal(searchInput()).then(page => {
        if (mounted.current && token === generation.current && currentRequest.current === requestKey
          && currentBoundary.current === boundary) { setResult(page); setResultKey(requestKey); }
      }).catch(cause => {
        if (mounted.current && token === generation.current && currentRequest.current === requestKey) setError(uiError(cause));
      }).finally(() => { if (mounted.current && token === generation.current && currentRequest.current === requestKey) setLoading(false); });
    }, 180);
    return () => { window.clearTimeout(timer); generation.current++; void api.searchCancel().catch(() => {}); };
  }, [requestKey, retry]);

  async function more() {
    if (loading || !visible?.nextCursor) return;
    const token = generation.current;
    setLoading(true); setError('');
    try {
      const page = await api.searchLocal({ ...searchInput(), cursor: visible.nextCursor });
      if (!mounted.current || token !== generation.current || currentRequest.current !== requestKey || currentBoundary.current !== boundary) return;
      setResult(previous => ({ ...page, items: [...new Map([...(previous?.items || []), ...page.items].map(item => [item.id, item])).values()], warnings: [...new Map([...(previous?.warnings || []), ...page.warnings].map(warning => [`${warning.kind}:${warning.code}:${warning.resourceId || ''}`, warning])).values()] }));
    } catch (cause) { if (mounted.current && token === generation.current && currentRequest.current === requestKey) setError(uiError(cause)); }
    finally { if (mounted.current && token === generation.current && currentRequest.current === requestKey) setLoading(false); }
  }
  async function select(hit: LocalSearchHit) {
    if (opening || busy) return;
    const token = generation.current;
    setOpening(hit.id); setError('');
    try {
      const locator = await api.searchResolve(hit.locator);
      if (!mounted.current || token !== generation.current || currentRequest.current !== requestKey || currentBoundary.current !== boundary) return;
      await onSelect(locator);
    } catch (cause) {
        if (mounted.current && token === generation.current && currentRequest.current === requestKey) {
        setError(uiError(cause));
        setResult(previous => previous && { ...previous, items: previous.items.filter(item => item.id !== hit.id) });
      }
    } finally { if (mounted.current && token === generation.current && currentRequest.current === requestKey) setOpening(''); }
  }
  async function remove(id: string) {
    setRemoving(true); setError('');
    try { await onDelete(id); if (mounted.current) setDeleting(''); }
    catch (cause) { if (mounted.current) setError(uiError(cause)); }
    finally { if (mounted.current) setRemoving(false); }
  }

  return <Modal title="找一找" className="local-search-panel" onClose={onClose} fallbackFocus={onRestoreFocus}>
    <div className="local-search-body">
      <div className="local-search-input">
        <Search size={21} strokeWidth={1.5} />
        <input ref={input} autoFocus aria-label={selectedScope ? '在选中的对话里搜索原话' : '搜索对话、笔记与资料'} placeholder="想找回哪一句？" value={query} maxLength={LOCAL_SEARCH_LIMITS.query} onChange={event => { invalidate(); setQuery(event.target.value); }} />
        {query && <IconButton label="清空搜索" onClick={() => { invalidate(); setQuery(''); input.current?.focus(); }}><X size={17} /></IconButton>}
      </div>
      <div className="local-search-kinds" role="group" aria-label="寻找的内容">
        {kinds.map(option => <button type="button" key={option.value} aria-pressed={kind === option.value} onClick={() => { if (kind !== option.value) { invalidate(); setKind(option.value); } }}>{option.label}</button>)}
      </div>
      {kind === 'conversation' && <section className="local-search-scope" aria-label="对话查找范围">
        <div className="local-scope-choices" role="group" aria-label="要找哪些对话">
          <button type="button" aria-pressed={scope === 'all'} onClick={() => { if (scope !== 'all') { invalidate(); setScope('all'); } }}>全部对话</button>
          <button type="button" aria-pressed={scope === 'selected'} onClick={() => { setScopePickerOpen(true); if (scope !== 'selected') { invalidate(); setScope('selected'); } }}>只看这几段</button>
        </div>
        {selectedScope && <>
          {!!sessionIds.length && <div className="local-scope-chips" aria-label="已选对话">{conversations.filter(conversation => sessionIds.includes(conversation.id)).map(conversation =>
            <button type="button" key={conversation.id} onClick={() => chooseSession(conversation.id)} aria-label={`不再查找：${conversation.title}`}><span>{conversation.title}</span><X size={13} /></button>)}</div>}
          <details className="local-scope-picker" open={scopePickerOpen} onToggle={event => setScopePickerOpen(event.currentTarget.open)}>
            <summary>{sessionIds.length ? `在这 ${sessionIds.length} 段对话里找 · 更换范围` : '先选几段对话'}</summary>
            <div className="local-scope-list">{conversations.map(conversation => <label key={conversation.id}>
              <input type="checkbox" checked={sessionIds.includes(conversation.id)} disabled={!sessionIds.includes(conversation.id) && sessionIds.length >= LOCAL_SEARCH_LIMITS.sessions} onChange={() => chooseSession(conversation.id)} />
              <span title={formatDateTime(conversation.updatedAt, state.settings.timeZone)}><strong>{conversation.title}</strong></span>
            </label>)}</div>
            {sessionIds.length >= LOCAL_SEARCH_LIMITS.sessions && <p>一次可以选 {LOCAL_SEARCH_LIMITS.sessions} 段，先留下这次想找的。</p>}
          </details>
        </>}
      </section>}
      <div className="local-search-results" aria-busy={loading}>
        {selectionMissing ? <div className="local-search-empty"><MessageCircle size={34} strokeWidth={1.2} /><h3>{conversations.length ? '想回到哪几段？' : '还没有留下的对话。'}</h3><p>{conversations.length ? '选好范围后，再找当时说过的话。' : '以后留下的对话，可以在这里选来找。'}</p></div> : !term ? kind === 'all' || kind === 'conversation' ? <>
          {conversations.filter(conversation => !selectedScope || sessionIds.includes(conversation.id)).map(conversation => <div className="local-recent-row" key={conversation.id}>
            <button type="button" className="local-recent-open" disabled={busy || removing} onClick={() => void onOpen(conversation.id)}>
              <span className="local-search-symbol"><MessageCircle size={21} strokeWidth={1.4} /></span>
              <span className="local-recent-copy" title={formatDateTime(conversation.updatedAt, state.settings.timeZone)}><strong>{conversation.title}</strong></span>
              <span className="local-search-action" aria-label="接着聊"><ChevronRight size={18} /></span>
            </button>
            {deleting === conversation.id ? <div className="local-search-delete"><span>让这段对话离开？</span><button disabled={busy || removing} onClick={() => void remove(conversation.id)}>删除</button><button disabled={removing} onClick={() => setDeleting('')}>留下</button></div> : <IconButton className="local-recent-remove" label={`删除对话：${conversation.title}`} disabled={busy} onClick={() => setDeleting(conversation.id)}><Trash2 size={15} /></IconButton>}
          </div>)}
          {!conversations.length && <div className="local-search-empty"><History size={34} strokeWidth={1.2} /><h3>故事，从第一次对话开始。</h3><p>以后想起一句话，可以来这里找。</p></div>}
        </> : <div className="local-search-empty"><BookOpen size={35} strokeWidth={1.2} /><h3>还记得哪个词？</h3><p>写下它，我们从{kindName[kind]}里找找。</p></div> : <>
          {visible?.items.map(hit => {
            const Icon = hit.kind === 'conversation' ? MessageCircle : hit.kind === 'note' ? BookOpen : FileText;
            return <button type="button" className={`local-search-hit is-${hit.kind}`} key={hit.id} disabled={busy || !!opening} onClick={() => void select(hit)}>
              <span className="local-search-symbol"><Icon size={23} strokeWidth={1.4} /></span>
              <span className="local-hit-copy"><span className="local-hit-kind">{kindName[hit.kind]}{hit.locator.kind === 'material' && hit.locator.page ? ` · 第 ${hit.locator.page} 页` : hit.kind === 'conversation' && hit.role ? hit.role === 'user' ? ' · 你说过' : ' · 在场的回复' : ''}</span><strong>{hit.title}</strong><span className="local-hit-excerpt"><Excerpt hit={hit} /></span></span>
              <span className="local-search-action">{opening === hit.id ? <LoaderCircle size={17} className="spin" /> : <>{kindAction[hit.kind]}<ArrowUpRight size={16} /></>}</span>
            </button>;
          })}
          {loading && !visible?.items.length ? <div className="local-search-empty local-search-looking" role="status"><LoaderCircle size={28} strokeWidth={1.2} className="spin" /><p>在留下的文字里找找…</p></div> : visible && !visible.items.length && !error && <div className="local-search-empty"><BookOpen size={36} strokeWidth={1.1} /><h3>{visible.nextCursor ? '还可以再往前找找。' : '这次还没有找到。'}</h3><p>{visible.nextCursor ? '前面的文字还没翻完，可以接着找。' : '换一个短一点的词，也许就想起来了。'}</p></div>}
          {visible?.nextCursor && <button type="button" className="text-button local-search-more" disabled={loading || !!opening} onClick={() => void more()}>{loading ? <><LoaderCircle size={16} className="spin" />再翻一翻…</> : '再往前找找'}</button>}
        </>}
      </div>
      {error && <div className="local-search-problem" role="alert"><p>这次没能接上，我们再找一次。</p><button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>重新找找</button><details><summary>看看原因</summary><p>{error}</p></details></div>}
      {!!visible?.warnings.length && <details className="local-search-coverage"><summary>有些内容暂时没能一起找</summary>{visible.warnings.map((warning, index) => <p key={index}>{warning.message}</p>)}</details>}
    </div>
  </Modal>;
}
