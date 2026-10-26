import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, ChevronRight, LoaderCircle, MessageCircle, NotebookPen, PanelsTopLeft,
  PencilLine, Plus, Search } from 'lucide-react';
import type { KeepSnapshot, KeepWorkItem, KeepWorkLocator } from '../shared/keep';
import { materialQuoteAddress } from '../shared/materials';
import type { MaterialItem } from '../shared/materials';
import { noteQuoteAddress, type NoteSummary } from '../shared/notes';
import type { SourceBookmarkReference } from '../shared/source-bookmark';
import type { Conversation } from '../shared/types';
import type { MaterialDocumentAddress } from './materials/material-document-transfer';
import { MaterialFileCover } from './materials/MaterialFileCover';
import { DEFAULT_TIME_ZONE, formatDateTime } from './time';
import { uiError } from './ui';
import './keep-panel.css';

export type KeepSectionKind = 'notes' | 'materials' | 'works' | 'conversations';
export interface KeepSelectionResolution {
  requestId: number;
  key: string;
  status: 'restored' | 'pending' | 'unavailable';
  selectedKey?: string;
}
type KeepAction = void | Promise<unknown>;

/** The parent loads owner projections and performs native navigation. This
 * surface owns neither saved bodies nor the conversation's current draft. */
export interface KeepPanelProps {
  snapshot?: KeepSnapshot;
  active?: boolean;
  loading?: boolean;
  loadingMore?: KeepSectionKind;
  error?: string;
  disabled?: boolean;
  timeZone?: string;
  /** An existing projection key is a viewing address, never a source grant. */
  selectionRequest?: { key: string; requestId: number };
  onSelectionChange?: (key: string | undefined) => void;
  onSelectionResolved?: (result: KeepSelectionResolution) => void;
  onRetry: () => KeepAction;
  onLoadMore?: (kind: KeepSectionKind) => KeepAction;
  onOpenNote: (id: string, revision: number) => KeepAction;
  onOpenMaterial: (address: MaterialDocumentAddress) => KeepAction;
  onOpenConversation: (id: string, messageId?: string) => KeepAction;
  onOpenWork: (locator: KeepWorkLocator) => KeepAction;
  onOpenSource?: (reference: SourceBookmarkReference) => KeepAction;
  onDiscussSource?: (reference: SourceBookmarkReference) => KeepAction;
  /** The original composer host, supplied only after an explicit continuation.
   * Its stable slot stays outside the changing selected-object subtree. */
  composer?: ReactNode;
  onBrowseNotes: () => KeepAction;
  onBrowseMaterials: () => KeepAction;
  onHistory: () => KeepAction;
  onNewNote: () => KeepAction;
}

/** Only an explicit native source address supplies a return action. Event IDs,
 * matching titles and the current collection subset establish no relation. */
export function keptNoteSource(note: NoteSummary): SourceBookmarkReference | undefined {
  const source = note.source;
  if (source.material) return { kind: 'material', reference: materialQuoteAddress(source.material) };
  if (source.notebook) return { kind: 'notebook', reference: noteQuoteAddress(source.notebook) };
  if (source.conversation) return { kind: 'conversation', reference: source.conversation };
}

type KeepObject =
  | { key: string; kind: 'notes'; value: NoteSummary; title: string; at: string }
  | { key: string; kind: 'materials'; value: MaterialItem; title: string; at?: string }
  | { key: string; kind: 'works'; value: KeepWorkItem; title: string; at: string }
  | { key: string; kind: 'conversations'; value: Conversation; title: string; at: string };

const sections: KeepSectionKind[] = ['notes', 'materials', 'works', 'conversations'];
const validDate = (value?: string) => value && Number.isFinite(Date.parse(value)) ? value : undefined;
const shortName = (value: string, limit = 14) => {
  const points = Array.from(value);
  return points.length <= limit ? value : `${points.slice(0, limit).join('')}…`;
};
const workKey = (work: KeepWorkItem) => `work:${work.locator.sessionId}:${work.locator.messageId}:${work.locator.programId}:${work.locator.revision}`;
const noteTitle = (note: NoteSummary) => note.source.referenceOnly && note.title.trim() === '纸边的一段原文'
  ? '摘录笔记' : note.title.trim() || '未命名笔记';
const selectionKind = (key: string): KeepSectionKind | undefined => key.startsWith('note:') ? 'notes'
  : key.startsWith('material:') ? 'materials' : key.startsWith('work:') ? 'works'
    : key.startsWith('conversation:') ? 'conversations' : undefined;

function objects(snapshot?: KeepSnapshot): KeepObject[] {
  if (!snapshot) return [];
  const result: KeepObject[] = [
    ...snapshot.notes.items.map(value => ({ key: `note:${value.id}`, kind: 'notes' as const, value,
      title: noteTitle(value), at: value.updatedAt })),
    ...snapshot.materials.items.map(value => ({ key: `material:${value.resourceId}:${value.sha256}`, kind: 'materials' as const,
      value, title: value.name, at: validDate(value.receivedAt) })),
    ...snapshot.works.items.map(value => ({ key: workKey(value), kind: 'works' as const, value,
      title: value.title, at: value.localState?.updatedAt || value.createdAt })),
    ...snapshot.conversations.items.map(value => ({ key: `conversation:${value.id}`, kind: 'conversations' as const,
      value, title: value.title, at: value.updatedAt })),
  ];
  // Unknown material dates stay unknown. Original-owner dates only arrange
  // these small entrances; they do not establish a relation or unfinished task.
  return result.sort((a, b) => (validDate(b.at) ? Date.parse(b.at!) : -Infinity)
    - (validDate(a.at) ? Date.parse(a.at!) : -Infinity));
}

function ObjectMark({ item }: { item: KeepObject }) {
  if (item.kind === 'materials') return <MaterialFileCover mediaType={item.value.mediaType}
    coverKey={item.value.resourceId} label={item.title} />;
  if (item.kind === 'notes') return <NotebookPen size={23} aria-hidden="true" />;
  if (item.kind === 'works') return <PanelsTopLeft size={23} aria-hidden="true" />;
  return <MessageCircle size={23} aria-hidden="true" />;
}

function noteDiscussion(note: NoteSummary): SourceBookmarkReference | undefined {
  if (note.bodyLength > 0 && note.bodyLength <= 4000) return { kind: 'notebook', reference: {
    id: note.id, revision: note.revision, sha256: note.sha256, start: 0, end: note.bodyLength,
  } };
  if (note.bodyLength === 0) return keptNoteSource(note);
}

/** One room and one changing object, with the original owners behind every
 * entrance. Selection is local viewing only, never an automatic quotation. */
export function KeepPanel({ snapshot, active = true, loading = false, loadingMore, error, disabled = false,
  timeZone = DEFAULT_TIME_ZONE, selectionRequest, onSelectionChange, onSelectionResolved,
  composer, onRetry, onLoadMore, onOpenNote, onOpenMaterial,
  onOpenConversation, onOpenWork, onOpenSource, onDiscussSource, onBrowseNotes, onBrowseMaterials,
  onHistory, onNewNote }: KeepPanelProps) {
  const id = useId();
  const boundary = snapshot ? `${snapshot.boundary.privacyEpoch}:${snapshot.boundary.policyRevision}:${snapshot.boundary.sourceBoundary}` : '';
  const items = useMemo(() => objects(snapshot), [snapshot]);
  const [choice, setChoice] = useState<{ boundary: string; key: string }>();
  const consumedSelectionRequest = useRef<number | undefined>(undefined);
  const selectionPending = !!selectionRequest && consumedSelectionRequest.current !== selectionRequest.requestId;
  const selectionReady = active && !!snapshot && !loading && !loadingMore;
  const requested = selectionReady && selectionPending ? items.find(item => item.key === selectionRequest!.key) : undefined;
  const selected = requested || items.find(item => choice?.boundary === boundary && choice.key === item.key)
    || items.find(item => item.kind === 'notes') || items[0];
  const selectedIndex = selected ? items.indexOf(selected) : -1;
  const [pending, setPending] = useState(''), [localError, setLocalError] = useState('');
  const rail = useRef<HTMLDivElement>(null), actionGeneration = useRef(0), pendingAction = useRef(false);
  const failedAction = useRef<{ key: string; action: () => KeepAction; boundary: string; objectKey?: string } | undefined>(undefined);
  const mounted = useRef(false), lastMore = useRef<KeepSectionKind | undefined>(undefined);
  const selectionCallback = useRef(onSelectionChange); selectionCallback.current = onSelectionChange;
  const resolutionCallback = useRef(onSelectionResolved); resolutionCallback.current = onSelectionResolved;
  const reportedSelection = useRef<{ boundary: string; key?: string } | undefined>(undefined);
  const reportedResolution = useRef<string | undefined>(undefined), manualSelection = useRef(false);
  const context = useRef({ active, boundary }); context.current = { active, boundary };
  const locked = disabled || !!pending;
  const localFailure = active && failedAction.current?.boundary === boundary
    && failedAction.current.objectKey === selected?.key ? localError : '';
  const more = snapshot ? sections.filter(kind => snapshot[kind].hasMore) : [];

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; actionGeneration.current++; pendingAction.current = false; failedAction.current = undefined; };
  }, []);
  useEffect(() => {
    actionGeneration.current++; pendingAction.current = false; failedAction.current = undefined; setPending(''); setLocalError('');
    reportedSelection.current = undefined; manualSelection.current = false;
    if (!active) return;
    lastMore.current = undefined;
  }, [active, boundary]);
  useEffect(() => {
    if (!selectionReady || !snapshot || !selectionRequest || !selectionPending) return;
    const kind = selectionKind(selectionRequest.key), page = kind ? snapshot[kind] : undefined;
    const status = requested ? 'restored' : page?.hasMore ? 'pending' : 'unavailable';
    if (requested) consumedSelectionRequest.current = selectionRequest.requestId;
    // A missing key remains an outstanding address while its native metadata
    // pages arrive. A user selection below retires it immediately instead.
    const receipt = JSON.stringify([boundary, selectionRequest.requestId, selectionRequest.key, status,
      selected?.key, page?.offset, page?.nextOffset, page?.items.length]);
    if (reportedResolution.current === receipt || !resolutionCallback.current) return;
    reportedResolution.current = receipt;
    resolutionCallback.current({ ...selectionRequest, status, selectedKey: selected?.key });
  }, [selectionReady, snapshot, boundary, selectionRequest?.requestId, selectionPending, requested?.key, selected?.key, !!onSelectionResolved]);
  useEffect(() => {
    if (!active || !snapshot || !selected) return;
    if (failedAction.current && failedAction.current.objectKey !== selected.key) {
      failedAction.current = undefined; setLocalError('');
    }
    if (choice?.boundary !== boundary || choice.key !== selected.key)
      setChoice({ boundary, key: selected.key });
    const list = rail.current, button = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !button) return;
    const left = button.offsetLeft, right = left + button.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
  }, [active, boundary, selected?.key]);
  useEffect(() => {
    if (!active || !snapshot) return;
    // Loading and an unresolved request must not overwrite the parent's
    // desired address with the ordinary visible fallback.
    if (!manualSelection.current && (!selectionReady || selectionPending && !requested)) return;
    if (!selectionCallback.current) { manualSelection.current = false; return; }
    const previous = reportedSelection.current;
    if (!manualSelection.current && previous?.boundary === boundary && previous.key === selected?.key) return;
    manualSelection.current = false;
    reportedSelection.current = { boundary, key: selected?.key };
    selectionCallback.current(selected?.key);
  }, [active, snapshot, boundary, selected?.key, choice, selectionReady, selectionPending, selectionRequest?.requestId, !!onSelectionChange]);

  async function perform(key: string, action: () => KeepAction) {
    if (disabled || pendingAction.current || !active) return;
    const generation = ++actionGeneration.current, originalBoundary = boundary, objectKey = selected?.key;
    pendingAction.current = true; failedAction.current = undefined; setPending(key); setLocalError('');
    const current = () => mounted.current && generation === actionGeneration.current
      && context.current.active && context.current.boundary === originalBoundary;
    try { await action(); }
    catch (cause) { if (current()) {
      // A retry keeps only this in-window native action and its original
      // address. The owner rechecks access and revision on every invocation.
      failedAction.current = { key, action, boundary: originalBoundary, objectKey };
      setLocalError(uiError(cause, { operation: 'open' }));
    } }
    finally { if (current()) { pendingAction.current = false; setPending(''); } }
  }
  function select(item: KeepObject, focus = false) {
    if (locked) return;
    if (selectionRequest) consumedSelectionRequest.current = selectionRequest.requestId;
    manualSelection.current = true;
    failedAction.current = undefined; setChoice({ boundary, key: item.key }); setLocalError('');
    if (focus) rail.current?.querySelector<HTMLButtonElement>(`[data-keep-key="${CSS.escape(item.key)}"]`)?.focus({ preventScroll: true });
  }
  function retryFailedAction() {
    const failed = failedAction.current;
    if (!failed || !active || failed.boundary !== boundary || failed.objectKey !== selected?.key) return;
    void perform(failed.key, failed.action);
  }
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % items.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + items.length - 1) % items.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (next === undefined) return;
    event.preventDefault(); event.stopPropagation(); select(items[next], true);
  }
  function loadMore() {
    if (!onLoadMore || !more.length || loadingMore) return;
    const next = more.find(kind => sections.indexOf(kind) > sections.indexOf(lastMore.current!)) || more[0];
    lastMore.current = next;
    void perform('more', () => onLoadMore(next));
  }
  function date(value?: string) {
    const instant = validDate(value);
    return instant ? <time dateTime={instant} title={formatDateTime(instant, timeZone)}>
      {formatDateTime(instant, timeZone, { hour: undefined, minute: undefined })}</time> : null;
  }
  function openObject(item: KeepObject) {
    if (item.kind === 'notes') return onOpenNote(item.value.id, item.value.revision);
    if (item.kind === 'materials') return onOpenMaterial({ resourceId: item.value.resourceId, sha256: item.value.sha256 });
    if (item.kind === 'works') return onOpenWork(item.value.locator);
    return onOpenConversation(item.value.id);
  }
  function sourceButton(note: NoteSummary) {
    const source = keptNoteSource(note);
    if (!source || !onOpenSource) return null;
    const material = source.kind === 'material' ? snapshot?.materials.items.find(item =>
      item.resourceId === source.reference.resourceId && item.sha256 === source.reference.sha256) : undefined;
    const label = source.kind === 'material' ? (source.reference.page ? `第 ${source.reference.page} 页` : '原文')
      : source.kind === 'notebook' ? '原笔记' : '原话';
    return <button type="button" className="keep-source" disabled={locked}
      title={material ? `回到原段：${material.name}` : '回到原段'} aria-label={`${label}，回到原段`}
      onClick={() => void perform('source', () => onOpenSource(source))}>
      {source.kind === 'material' ? <MaterialFileCover mediaType={material?.mediaType || (source.reference.page ? 'application/pdf' : undefined)}
        coverKey={source.reference.resourceId} label={material?.name || '原文'} /> : <BookOpen size={17} aria-hidden="true" />}
      <span>{label}</span><ArrowUpRight size={12} aria-hidden="true" />
    </button>;
  }
  function detail(item: KeepObject) {
    if (item.kind === 'notes') {
      const note = item.value, discussion = noteDiscussion(note), preview = note.preview.trim();
      return <>
        <div className="keep-object-meta">{sourceButton(note)}{date(note.updatedAt)}</div>
        {preview && <p className="keep-note-thought">{preview}</p>}
        <button type="button" className="keep-object-title keep-note-title" disabled={locked}
          onClick={() => void perform('open', () => openObject(item))} title={item.title}>
          <span>{item.title}</span><ArrowUpRight size={13} aria-hidden="true" />
        </button>
        <div className="keep-object-actions">
          {discussion && onDiscussSource && <button type="button" className="keep-continue" disabled={locked}
            onClick={() => void perform('discuss', () => onDiscussSource(discussion))}>
            <MessageCircle size={16} aria-hidden="true" /><span>{note.bodyLength ? '接着这页聊' : '接着这段聊'}</span>
          </button>}
          <button type="button" className="keep-icon-action keep-secondary-action" disabled={locked}
            aria-label="继续编辑这页笔记" title="继续编辑"
            onClick={() => void perform('edit', () => onOpenNote(note.id, note.revision))}><PencilLine size={18} aria-hidden="true" /></button>
        </div>
      </>;
    }
    if (item.kind === 'materials') {
      const material = item.value;
      const related = snapshot?.notes.items.find(note => note.source.material?.resourceId === material.resourceId
        && note.source.material.sha256 === material.sha256);
      return <>
        <div className="keep-object-meta"><MaterialFileCover mediaType={material.mediaType} size="regular" coverKey={material.resourceId} label={material.name} />{date(material.receivedAt)}</div>
        <h2 className="keep-object-title">{material.name}</h2>
        <div className="keep-object-actions">
          <button type="button" className="keep-continue" disabled={locked} onClick={() => void perform('open', () => openObject(item))}>
            <BookOpen size={16} aria-hidden="true" /><span>打开原文</span>
          </button>
          {related && <button type="button" className="keep-icon-action keep-secondary-action" disabled={locked}
            aria-label={`编辑这份资料上的笔记：${noteTitle(related)}`} title="页边的笔记"
            onClick={() => void perform('related', () => onOpenNote(related.id, related.revision))}><NotebookPen size={18} aria-hidden="true" /></button>}
        </div>
      </>;
    }
    if (item.kind === 'works') return <>
      <div className="keep-object-meta"><PanelsTopLeft size={25} aria-hidden="true" />{date(item.at)}</div>
      <h2 className="keep-object-title">{item.title}</h2>
      <div className="keep-object-actions">
        <button type="button" className="keep-continue" disabled={locked} onClick={() => void perform('open', () => openObject(item))}>
          <span>接着做</span><ArrowUpRight size={16} aria-hidden="true" />
        </button>
        <button type="button" className="keep-icon-action keep-secondary-action" disabled={locked} aria-label="回到作品的原对话" title="原对话"
          onClick={() => void perform('conversation', () => onOpenConversation(item.value.locator.sessionId, item.value.locator.messageId))}>
          <MessageCircle size={18} aria-hidden="true" />
        </button>
      </div>
    </>;
    return <>
      <div className="keep-object-meta"><MessageCircle size={24} aria-hidden="true" />{date(item.at)}</div>
      <h2 className="keep-object-title">{item.title}</h2>
      <div className="keep-object-actions"><button type="button" className="keep-continue" disabled={locked}
        onClick={() => void perform('open', () => openObject(item))}><span>回到这段对话</span><ArrowUpRight size={16} aria-hidden="true" /></button></div>
    </>;
  }

  return <section className="keep-panel" hidden={!active} aria-label="留下" aria-busy={loading && !snapshot}>
    <h1 className="sr-only">留下</h1>
    <div className="keep-within-reach">
      <header className="keep-heading" aria-label="留下的操作">
        <div className="keep-tools">
          <button type="button" className="keep-icon-action" disabled={locked} title="找一找" aria-label="找一找留下的内容"
            onClick={() => void perform('find', onHistory)}><Search size={18} aria-hidden="true" /></button>
          <button type="button" className="keep-icon-action" disabled={locked} title="写一页笔记" aria-label="写一页笔记"
            onClick={() => void perform('new', onNewNote)}><Plus size={19} aria-hidden="true" /></button>
        </div>
      </header>
      {selected ? <article className="keep-object" id={`${id}-object`} role="tabpanel"
        aria-labelledby={`${id}-entry-${selectedIndex}`} data-presence-edge="keep-object"
        data-presence-edge-label="留下的这一页" data-presence-edge-sides="top right left" data-keep-kind={selected.kind}>
        <div className="keep-object-content" key={selected.key}>{detail(selected)}</div>
      </article> : !loading && !error && !localFailure ? <div className="keep-empty">
        <button type="button" className="keep-empty-write" disabled={locked} onClick={() => void perform('new', onNewNote)}>
          <NotebookPen size={22} aria-hidden="true" /><span>写一页笔记</span><ArrowUpRight size={14} aria-hidden="true" />
        </button>
        <div className="keep-empty-tools">
          <button type="button" disabled={locked} onClick={() => void perform('notes', onBrowseNotes)}>翻翻笔记</button>
          <button type="button" disabled={locked} onClick={() => void perform('materials', onBrowseMaterials)}>打开资料</button>
        </div>
      </div> : null}
      <div className="keep-composer-slot" data-keep-composer-slot hidden={!composer}>{composer}</div>
      {!!items.length && <div className="keep-object-flow" ref={rail} role="tablist" aria-label="留下的内容">
        {items.map((item, index) => <button type="button" role="tab" key={item.key} data-keep-key={item.key}
          id={`${id}-entry-${index}`} aria-controls={`${id}-object`} aria-selected={selected?.key === item.key}
          tabIndex={selected?.key === item.key ? 0 : -1} className="keep-object-entry" disabled={locked}
          title={item.title} aria-label={item.title} onClick={() => select(item)} onKeyDown={event => move(event, index)}>
          <span className="keep-entry-mark"><ObjectMark item={item} /></span><span className="keep-entry-label">{shortName(item.title)}</span>
        </button>)}
      </div>}
      {(loading && !snapshot || pending || loadingMore) && <div className="keep-progress" role="status">
        <LoaderCircle size={14} aria-hidden="true" /><span>{loading && !snapshot ? '翻开看看…' : pending === 'more' || loadingMore ? '再翻找一下…' : '正在打开…'}</span>
      </div>}
      {localFailure ? <div className="keep-error" role="status"><p>{localFailure}</p>
        <div className="keep-error-actions">
          <button type="button" disabled={locked} onClick={retryFailedAction}>再试一次</button>
          {selected?.kind === 'materials' || selected?.kind === 'notes' && selected.value.source.material
            ? <button type="button" disabled={locked} onClick={() => void perform('materials', onBrowseMaterials)}>打开资料</button>
            : <button type="button" disabled={locked} onClick={() => void perform('find', onHistory)}>找一找</button>}
        </div>
      </div> : error ? <div className="keep-error" role="status"><p>{error}</p>
        <button type="button" disabled={locked} onClick={() => void perform('retry', onRetry)}>再试一次</button></div> : null}
      {!!more.length && onLoadMore && <button type="button" className="keep-more" disabled={locked || !!loadingMore}
        onClick={loadMore}>继续找<ChevronRight size={14} aria-hidden="true" /></button>}
    </div>
  </section>;
}
