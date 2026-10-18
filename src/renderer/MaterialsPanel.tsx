import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Download, FileText, FolderOpen, Image, List, LoaderCircle, Plus, Quote, Search, Type, X } from 'lucide-react';
import type { TextAttachment } from '../shared/types';
import { MATERIAL_LIMITS, type MaterialItem, type MaterialPage, type MaterialQuote, type MaterialTarget } from '../shared/materials';
import type { LocalSearchLocator } from '../shared/search';
import { uiError } from './ui';
import './materials.css';

export type { MaterialQuote } from '../shared/materials';
interface Props {
  pending?: TextAttachment | null;
  sessionId?: string;
  boundary: string;
  compact?: boolean;
  draftEnabled?: boolean;
  focus?: { locator: Extract<LocalSearchLocator, { kind: 'material' }>; requestId: number };
  onAttach: (attachment: TextAttachment) => boolean;
  onQuote: (quote: MaterialQuote) => boolean;
  onClose: () => void;
  children?: ReactNode;
}
const api = window.zaichang;
const targetId = (target?: MaterialTarget) => target?.kind === 'pending' ? target.reference.resourceId : target?.resourceId;
const readingError = (problem: unknown) => {
  const message = uiError(problem);
  return /PDF.*(?:组件|核验|启动)/.test(message)
    ? '这台电脑暂时打不开 PDF 页面，原文件仍在。可以带走原文件，或换一份文字版。'
    : message;
};

/** A view onto the host's original snapshots, never another material store. */
export function MaterialsPanel({ pending, sessionId, boundary, compact = false, draftEnabled = true, focus, onAttach, onQuote, onClose, children }: Props) {
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [target, setTarget] = useState<MaterialTarget>();
  const [document, setDocument] = useState<MaterialPage>();
  const [page, setPage] = useState(1), [offset, setOffset] = useState(0);
  const [view, setView] = useState<'text' | 'page'>('text');
  const [listOpen, setListOpen] = useState(false), [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false), [choosing, setChoosing] = useState(false), [exporting, setExporting] = useState(false);
  const [error, setError] = useState(''), [listError, setListError] = useState(''), [notice, setNotice] = useState('');
  const [quote, setQuote] = useState<MaterialQuote>();
  const [retry, setRetry] = useState(0), [refresh, setRefresh] = useState(0);
  const request = useRef(0), selectionRequest = useRef(0), mounted = useRef(true);
  const prose = useRef<HTMLPreElement>(null), scroller = useRef<HTMLDivElement>(null);
  const boundaryRef = useRef(boundary);
  const focusRequest = useRef(0);
  const [highlight, setHighlight] = useState<Extract<LocalSearchLocator, { kind: 'material' }>>();
  const destination = useRef({ sessionId, boundary, enabled: draftEnabled });
  destination.current = { sessionId, boundary, enabled: draftEnabled };
  const pendingRef = pending?.resource;
  const selectedId = targetId(target);
  const selected = pendingRef?.resourceId === selectedId ? pendingRef : items.find(item => item.resourceId === selectedId) || document?.item;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selectionRequest.current++; void api.materialsCancel(); }; }, []);
  useEffect(() => {
    if (boundaryRef.current === boundary) return;
    boundaryRef.current = boundary;
    request.current++; selectionRequest.current++;
    setDocument(undefined); setTarget(undefined); setItems([]); setQuote(undefined); setError(''); setHighlight(undefined);
    void api.materialsCancel();
  }, [boundary]);
  useEffect(() => { selectionRequest.current++; setChoosing(false); }, [sessionId]);
  useEffect(() => {
    if (!pendingRef) return;
    setPage(1); setOffset(0); setView(pendingRef.mediaType === 'application/pdf' ? 'page' : 'text');
  }, [pendingRef?.resourceId]);
  useEffect(() => {
    if (!focus || focusRequest.current === focus.requestId) return;
    focusRequest.current = focus.requestId;
    const locator = focus.locator;
    setTarget({ kind: 'saved', resourceId: locator.resourceId });
    setPage(locator.page || 1);
    setOffset(locator.field === 'body' ? Math.max(0, locator.offset - 120) : 0);
    setView('text'); setListOpen(false); setQuery(''); setHighlight(locator);
  }, [focus]);

  useEffect(() => {
    let current = true;
    void api.materialsList({ sessionId }).then(next => {
      if (!current) return;
      setItems(next); setListError('');
      setTarget(previous => {
        if (pendingRef) {
          if (!previous || previous.kind === 'pending') return { kind: 'pending', reference: pendingRef };
        }
        const id = targetId(previous);
        if (id && next.some(item => item.resourceId === id)) return { kind: 'saved', resourceId: id };
        if (previous?.kind === 'pending' && !pendingRef) return undefined;
        return previous && next.some(item => item.resourceId === targetId(previous)) ? previous : undefined;
      });
    }).catch(problem => { if (current) setListError(uiError(problem)); });
    return () => { current = false; };
  }, [sessionId, boundary, pendingRef?.resourceId, refresh]);

  useEffect(() => {
    if (!target) { setDocument(undefined); setLoading(false); return; }
    const id = ++request.current;
    setLoading(true); setError(''); setNotice(''); setQuote(undefined); setDocument(undefined);
    void api.materialsRead({ target, page, offset, view }).then(result => {
      if (id !== request.current) return;
      setDocument(result); scroller.current?.scrollTo({ top: 0 });
    }).catch(problem => { if (id === request.current) setError(readingError(problem)); })
      .finally(() => { if (id === request.current) setLoading(false); });
    return () => { request.current++; void api.materialsCancel(); };
  }, [target, page, offset, view, boundary, retry]);
  useEffect(() => {
    if (!document || !highlight || document.item.resourceId !== highlight.resourceId) return;
    if (document.item.sha256 !== highlight.sha256) {
      setHighlight(undefined); setNotice('原文件已经换过，这里是现在的内容。'); return;
    }
    const mark = prose.current?.querySelector<HTMLElement>('.material-search-match');
    mark?.scrollIntoView({ block: 'center' });
  }, [document, highlight]);

  function open(item: MaterialItem, pendingItem = false) {
    setHighlight(undefined);
    setPage(1); setOffset(0); setView(item.mediaType === 'application/pdf' ? 'page' : 'text');
    setTarget(pendingItem && pendingRef ? { kind: 'pending', reference: pendingRef } : { kind: 'saved', resourceId: item.resourceId });
    setListOpen(false); setQuery('');
  }
  async function attach() {
    if (!destination.current.enabled) return;
    const id = ++selectionRequest.current;
    const originalDestination = { ...destination.current };
    setChoosing(true); setNotice('');
    try {
      const attachment = await api.attachText();
      if (!attachment) return;
      if (!mounted.current || id !== selectionRequest.current || !destination.current.enabled
        || destination.current.sessionId !== originalDestination.sessionId || destination.current.boundary !== originalDestination.boundary) {
        if (attachment.resource) await api.materialsDiscard({ reference: attachment.resource });
        return;
      }
      if (!onAttach(attachment)) {
        if (attachment.resource) await api.materialsDiscard({ reference: attachment.resource });
        return;
      }
      if (attachment.resource) {
        setTarget({ kind: 'pending', reference: attachment.resource });
        setPage(1); setOffset(0); setView(attachment.resource.mediaType === 'application/pdf' ? 'page' : 'text');
        setListOpen(false);
      }
    } catch (problem) { if (id === selectionRequest.current) setError(uiError(problem)); }
    finally { if (mounted.current && id === selectionRequest.current) setChoosing(false); }
  }
  async function exportOriginal() {
    if (!target) return;
    setExporting(true); setNotice('');
    try { if (await api.materialsExport({ target })) setNotice('原文件已经带好了。'); }
    catch (problem) { setNotice(uiError(problem)); }
    finally { if (mounted.current) setExporting(false); }
  }
  function captureSelection() {
    const selection = window.getSelection();
    if (!document || !prose.current || !selection?.rangeCount || selection.isCollapsed) { setQuote(undefined); return; }
    const range = selection.getRangeAt(0);
    if (!prose.current.contains(range.startContainer) || !prose.current.contains(range.endContainer)) { setQuote(undefined); return; }
    const prefix = range.cloneRange(); prefix.selectNodeContents(prose.current); prefix.setEnd(range.startContainer, range.startOffset);
    const text = range.toString();
    if (!text.trim()) { setQuote(undefined); return; }
    if (text.length > 4000) { setQuote(undefined); setNotice('这段有些长，选短一点，我们接着聊。'); return; }
    setNotice('');
    const start = document.start + Array.from(prefix.toString()).length;
    setQuote({ resourceId: document.item.resourceId, sha256: document.item.sha256, name: document.item.name,
      text, page: document.page, start, end: start + Array.from(text).length });
  }
  const pendingItem: MaterialItem | undefined = pendingRef && { resourceId: pendingRef.resourceId, name: pendingRef.name, mediaType: pendingRef.mediaType, byteLength: pendingRef.byteLength, sha256: pendingRef.sha256 };
  const allItems = [...(pendingItem ? [pendingItem] : []), ...items.filter(item => item.resourceId !== pendingRef?.resourceId)];
  const visibleItems = allItems.filter(item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  function originalText() {
    if (!document) return null;
    if (!highlight || highlight.field !== 'body' || document.item.resourceId !== highlight.resourceId
      || document.item.sha256 !== highlight.sha256 || (highlight.page && document.page !== highlight.page)
      || highlight.offset < document.start || highlight.end > document.end) return document.text;
    const points = Array.from(document.text), start = highlight.offset - document.start, end = highlight.end - document.start;
    return <>{points.slice(0, start).join('')}<mark className="material-search-match">{points.slice(start, end).join('')}</mark>{points.slice(end).join('')}</>;
  }
  const index = <div className="materials-index">
    <div className="materials-index-heading"><strong>放在身边的资料</strong>{target && <button className="icon-button" aria-label="收起资料列表" onClick={() => setListOpen(false)}><X size={17} /></button>}</div>
    {allItems.length > 4 && <label className="materials-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="找一份资料" aria-label="搜索资料文件名" /></label>}
    <div className="materials-files">
      {visibleItems.map(item => <button type="button" className={`material-file ${selectedId === item.resourceId ? 'is-current' : ''}`} key={item.resourceId} onClick={() => open(item, item.resourceId === pendingRef?.resourceId)}>
        <span className="material-file-icon"><FileText size={21} strokeWidth={1.5} /></span>
        <span><strong>{item.name}</strong><small>{item.resourceId === pendingRef?.resourceId ? '这次带来的' : '对话里留下的'} · {item.mediaType === 'application/pdf' ? 'PDF' : item.mediaType === 'text/markdown' ? 'Markdown' : '文字'}</small></span><ChevronRight size={15} />
      </button>)}
      {!!query && !visibleItems.length && <p className="materials-muted">换一个词，或再带来一份资料。</p>}
    </div>
    {listError && <div className="materials-inline-error" role="alert"><p>这次没能取回资料列表。</p><button className="text-button" onClick={() => setRefresh(value => value + 1)}>再看一次</button></div>}
    <button className="text-button materials-add" onClick={() => void attach()} disabled={choosing || !draftEnabled}><Plus size={17} />{choosing ? '等你选好…' : '再添一份资料'}</button>
  </div>;
  return <section className={`materials-panel ${compact ? 'is-compact' : ''} ${children ? 'has-conversation' : ''}`} aria-label="资料原文">
    <div className="materials-reader">
      <header className="materials-heading"><button className="text-button" onClick={onClose}><ArrowLeft size={16} />回到聊天</button><span>留在手边，慢慢看。</span></header>
      {!target ? <div className="materials-welcome">
        <div className="materials-welcome-copy"><span className="materials-eyebrow">留下 · 资料</span><h1>把资料放在身边</h1><p>翻到想聊的那一页，我们一起看。</p></div>
        {allItems.length ? index : <div className="materials-empty"><div className="materials-paper-mark"><FileText size={52} strokeWidth={1} /></div><p>讲义、文章，或刚记下的一段话。</p><button className="primary-button" onClick={() => void attach()} disabled={choosing || !draftEnabled}><FolderOpen size={17} />{choosing ? '等你选好…' : '选一份资料'}</button><small>PDF、Markdown 和文字文件</small></div>}
        {listError && !allItems.length && <p className="materials-muted" role="alert">{listError}</p>}
      </div> : <>
        <div className="materials-toolbar">
          <button className="icon-button" aria-label={listOpen ? '收起资料列表' : '打开资料列表'} aria-expanded={listOpen} onClick={() => setListOpen(value => !value)}><List size={19} /></button>
          <strong className="materials-filename" title={selected?.name}>{selected?.name || '原文'}</strong>
          <button className="icon-button" aria-label="带走原文件" title="带走原文件" disabled={exporting} onClick={() => void exportOriginal()}><Download size={17} /></button>
          {selected?.mediaType === 'application/pdf' && <div className="materials-view-switch" role="group" aria-label="阅读方式">
            <button aria-pressed={view === 'page'} title="原页面" onClick={() => { setView('page'); setOffset(0); }}><Image size={16} /><span>页面</span></button>
            <button aria-pressed={view === 'text'} title="可选中的原文字层" onClick={() => { setView('text'); setOffset(0); }}><Type size={16} /><span>文字</span></button>
          </div>}
        </div>
        {listOpen && <div className="materials-list-popover">{index}</div>}
        <div className="materials-scroll" ref={scroller} aria-busy={loading}>
          {loading ? <div className="materials-opening" role="status"><LoaderCircle size={23} className="spin" /><p>正在翻开这一页…</p></div> : error ? <div className="materials-recovery" role="alert">
            <div className="materials-paper-mark"><FileText size={48} strokeWidth={1} /></div><h2>这份文件没能打开。</h2><p>你可以再试一次，也可以换一份原文件。</p>
            <div className="field-buttons"><button className="primary-button" onClick={() => setRetry(value => value + 1)}>再试一次</button><button className="subtle-button" onClick={() => void attach()} disabled={choosing || !draftEnabled}>重新选择</button></div>
            <details><summary>看看原因</summary><p>{error}</p></details>
          </div> : document ? <>
            {document.image ? <div className="material-page-image"><img src={document.image.dataUrl} width={document.image.width} height={document.image.height} alt={`${document.item.name}，第 ${document.page} 页原文`} /></div>
              : document.text ? <pre className="material-original" ref={prose} onMouseUp={captureSelection} onKeyUp={captureSelection} tabIndex={0}>{originalText()}</pre>
              : <div className="materials-scan"><BookOpen size={32} strokeWidth={1.25} /><h2>先看看这一页</h2><p>这一页没有可选中的文字。可以先看原页面，再说说你想问哪里。</p><button className="primary-button" onClick={() => { setView('page'); setOffset(0); }}>看原页面</button></div>}
            {document.needsVisual && document.text && <p className="materials-page-note">这一页还有图表，切到「页面」可以一起看。</p>}
          </> : null}
        </div>
        <footer className="materials-footer">
          {quote ? <button className="material-quote-button" disabled={!draftEnabled} onClick={() => { if (destination.current.enabled && onQuote(quote)) { setNotice('这段原文放进输入框了，想好再发。'); setQuote(undefined); } }}><Quote size={16} />带着这段问<ChevronRight size={14} /></button> : <span className="materials-reading-hint">{error ? '原文件还在，随时可以换一份。' : view === 'page' ? '切到文字，可以选一段接着聊。' : '选一段原文，接着问。'}</span>}
          {document?.pageCount ? <div className="materials-pagination"><button className="icon-button" aria-label="上一页" disabled={loading || page <= 1} onClick={() => { setPage(value => value - 1); setOffset(0); }}><ChevronLeft size={18} /></button><label><input aria-label="PDF页码" type="number" min="1" max={document.pageCount} value={page} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= document.pageCount!) { setPage(value); setOffset(0); } }} /><span>/ {document.pageCount}</span></label><button className="icon-button" aria-label="下一页" disabled={loading || page >= document.pageCount} onClick={() => { setPage(value => value + 1); setOffset(0); }}><ChevronRight size={18} /></button></div> : null}
          {document && (document.nextOffset !== null || document.start > 0) && <div className="materials-pagination"><button className="icon-button" aria-label="上一段原文" disabled={loading || offset <= 0} onClick={() => setOffset(Math.max(0, offset - MATERIAL_LIMITS.readCodePoints))}><ChevronLeft size={18} /></button><small>{Math.floor(offset / MATERIAL_LIMITS.readCodePoints) + 1} / {Math.ceil(document.total / MATERIAL_LIMITS.readCodePoints)}</small><button className="icon-button" aria-label="下一段原文" disabled={loading || document.nextOffset === null} onClick={() => setOffset(document.nextOffset!)}><ChevronRight size={18} /></button></div>}
        </footer>
      </>}
      {notice && <p className="materials-notice" role="status">{notice}</p>}
    </div>
    {children && <div className="materials-conversation">{children}</div>}
  </section>;
}
