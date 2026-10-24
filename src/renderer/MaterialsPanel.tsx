import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUpRight, BookOpen, BookmarkPlus, ChevronLeft, ChevronRight, Download, FileText, FolderOpen, GripVertical, Image, List, LoaderCircle, MessageCircle, Plus, Search, StickyNote, Type, Undo2, X } from 'lucide-react';
import type { TextAttachment } from '../shared/types';
import { MATERIAL_LIMITS, materialQuoteAddress, type MaterialItem, type MaterialNote, type MaterialPage, type MaterialQuote, type MaterialQuoteReference, type MaterialTarget } from '../shared/materials';
import type { LocalSearchLocator } from '../shared/search';
import { uiError } from './ui';
import { MaterialPdfPage, type MaterialPageSelection } from './MaterialPdfPage';
import { useMaterialReadingPosition } from './useMaterialReadingPosition';
import { useBookmarkTray, writeBookmarkTransfer } from './SourceBookmarkTray';
import type { MaterialReturnAddress } from './workspace-return';
import './materials.css';

export type { MaterialQuote } from '../shared/materials';
interface Props {
  pending?: TextAttachment | null;
  sessionId?: string;
  boundary: string;
  compact?: boolean;
  active?: boolean;
  refreshKey?: string;
  draftEnabled?: boolean;
  focus?: { locator: Extract<LocalSearchLocator, { kind: 'material' }>; requestId: number };
  reference?: MaterialQuoteReference;
  onUnsavedChange?: (unsaved: boolean) => void;
  onAttach: (attachment: TextAttachment) => boolean;
  onQuote: (quote: MaterialQuote) => boolean;
  onOpenNote?: (id: string, revision: number) => void;
  onClose: () => void;
  children?: ReactNode;
  conversationTarget?: RefObject<HTMLElement | null>;
  onReturnAddressChange?: (address: MaterialReturnAddress | undefined) => void;
  resume?: { address: MaterialReturnAddress; requestId: number };
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
export function MaterialsPanel({ pending, sessionId, boundary, compact = false, active = true, refreshKey, draftEnabled = true, focus, reference, onUnsavedChange, onAttach, onQuote, onOpenNote, onClose, children, conversationTarget, onReturnAddressChange, resume }: Props) {
  const bookmarkTray = useBookmarkTray();
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [target, setTarget] = useState<MaterialTarget>();
  const [document, setDocument] = useState<MaterialPage>();
  const [page, setPage] = useState(1), [offset, setOffset] = useState(0);
  const [view, setView] = useState<'text' | 'page'>('text');
  const [zoom, setZoom] = useState(100);
  const [listOpen, setListOpen] = useState(false), [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false), [choosing, setChoosing] = useState(false), [exporting, setExporting] = useState(false);
  const [error, setError] = useState(''), [listError, setListError] = useState(''), [notice, setNotice] = useState('');
  const [quote, setQuote] = useState<MaterialQuote>();
  const [quotePosition, setQuotePosition] = useState<{ left: number; top: number }>();
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [savedNote, setSavedNote] = useState<{ id: string; revision: number }>();
  const [notes, setNotes] = useState<MaterialNote[]>([]), [notesError, setNotesError] = useState('');
  const [notesRefresh, setNotesRefresh] = useState(0), [notePending, setNotePending] = useState(false);
  type NoteEditor = { key: string; target: MaterialTarget; quote: MaterialQuote; body: string; originalBody: string; note?: { id: string; revision: number; title: string }; error?: string };
  const [noteEditor, setNoteEditor] = useState<NoteEditor>();
  const [noteDraftCount, setNoteDraftCount] = useState(0);
  type AnchorUndo = { target: MaterialTarget; noteId: string; expectedRevision: number; from: MaterialQuoteReference; quote: MaterialQuoteReference };
  const [anchorUndo, setAnchorUndo] = useState<AnchorUndo>();
  const noteDrafts = useRef(new Map<string, NoteEditor>()), noteRequest = useRef(0), editorRequest = useRef(0);
  const noteProjectionKey = useRef('');
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const unsavedCallback = useRef(onUnsavedChange); unsavedCallback.current = onUnsavedChange;
  const noteReturnFocus = useRef<HTMLElement | null>(null);
  const [retry, setRetry] = useState(0), [refresh, setRefresh] = useState(0);
  const request = useRef(0), selectionRequest = useRef(0), mounted = useRef(true);
  const prose = useRef<HTMLPreElement>(null), scroller = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const bookmarks = useRef(new Map<string, { page: number; offset: number; view: 'text' | 'page'; zoom: number }>());
  const readingPositions = useMaterialReadingPosition({ boundary });
  const targetRef = useRef(target); targetRef.current = target;
  const boundaryRef = useRef(boundary);
  const focusRequest = useRef(0);
  const revealPending = useRef(false);
  const [highlight, setHighlight] = useState<Extract<LocalSearchLocator, { kind: 'material' }>>();
  const destination = useRef({ sessionId, boundary, enabled: draftEnabled, active });
  destination.current = { sessionId, boundary, enabled: draftEnabled, active };
  const conversation = useRef<HTMLDivElement>(null);
  const quoteTransfer = useRef<{ target: MaterialTarget; quote: MaterialQuoteReference; sessionId?: string; boundary: string } | undefined>(undefined);
  const quotePointer = useRef<{ id: number; element: HTMLButtonElement; x: number; y: number; moved: boolean } | undefined>(undefined);
  const quoteTransferRequest = useRef(0);
  const [draggingQuote, setDraggingQuote] = useState(false), [dropActive, setDropActive] = useState(false);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number }>();
  const pendingRef = pending?.resource;
  const selectedId = targetId(target);
  const readingKey = `${selectedId || ''}:${page}:${offset}:${view}`;
  const currentReadingKey = useRef(readingKey); currentReadingKey.current = readingKey;
  const documentReadingKey = useRef('');
  const currentBoundary = boundaryRef.current === boundary;
  const selected = currentBoundary ? pendingRef?.resourceId === selectedId ? pendingRef : items.find(item => item.resourceId === selectedId) || document?.item : undefined;
  const returnCallback = useRef(onReturnAddressChange); returnCallback.current = onReturnAddressChange;
  const resumeRequest = useRef(0), resumeSelection = useRef<{ boundary: string; quote: MaterialQuoteReference; readDone: boolean } | undefined>(undefined);
  const resumeInFlight = useRef(false);
  const readerNavigation = useRef(0);
  const interruptResume = () => {
    const interrupted = resumeInFlight.current;
    readerNavigation.current++; resumeInFlight.current = false; resumeSelection.current = undefined;
    if (interrupted) { if (document) setLoading(false); else setRetry(value => value + 1); }
  };
  const reportReturnAddress = () => {
    if (!active || !currentBoundary || loading || !document || documentReadingKey.current !== readingKey
      || document.item.resourceId !== selectedId || resumeInFlight.current
      || resume && resumeRequest.current !== resume.requestId) return;
    returnCallback.current?.({ resourceId: document.item.resourceId, sha256: document.item.sha256,
      page, offset, view, zoom, scrollTop: scroller.current?.scrollTop || 0,
      ...(quote?.resourceId === document.item.resourceId && quote.sha256 === document.item.sha256 && quote.page === document.page
        ? { selection: materialQuoteAddress(quote) } : {}) });
  };
  useEffect(() => { reportReturnAddress(); }, [active, loading, document, page, offset, view, zoom, quote]);
  useEffect(() => {
    if (!active || !resume || resumeRequest.current === resume.requestId) return;
    resumeRequest.current = resume.requestId;
    resumeInFlight.current = true;
    request.current++; const navigation = ++readerNavigation.current;
    let live = true; const address = resume.address, originalBoundary = boundary;
    void api.materialsList({ sessionId }).then(next => {
      if (!live || navigation !== readerNavigation.current || originalBoundary !== destination.current.boundary) return;
      const item = next.find(value => value.resourceId === address.resourceId && value.sha256 === address.sha256)
        || (pendingRef?.resourceId === address.resourceId && pendingRef.sha256 === address.sha256 ? pendingRef : undefined);
      if (!item) { interruptResume(); setNotice('那份原文现在不在桌边了，可以重新带来它。'); return; }
      setItems(next); setHighlight(undefined); setQuote(undefined); setPage(address.page); setOffset(address.offset);
      setView(address.view); setZoom(address.zoom); setListOpen(false);
      positions.current.set(`${address.resourceId}:${address.page}:${address.offset}:${address.view}`, address.scrollTop);
      resumeSelection.current = address.selection ? { boundary: originalBoundary, quote: address.selection, readDone: false } : undefined;
      setTarget(pendingRef?.resourceId === item.resourceId ? { kind: 'pending', reference: pendingRef } : { kind: 'saved', resourceId: item.resourceId });
    }).catch(problem => { if (live && navigation === readerNavigation.current && originalBoundary === destination.current.boundary) {
      interruptResume(); setNotice(readingError(problem));
    } });
    return () => { live = false; };
  }, [active, resume?.requestId, boundary, sessionId]);
  useEffect(() => {
    const selected = resumeSelection.current;
    if (!active || !selected?.readDone || !target || !document || selected.boundary !== boundary
      || selected.quote.resourceId !== document.item.resourceId || selected.quote.sha256 !== document.item.sha256
      || selected.quote.page !== document.page) return;
    resumeSelection.current = undefined; let live = true; const navigation = readerNavigation.current, originalKey = readingKey;
    void api.materialsQuote({ target, quote: selected.quote }).then(value => {
      if (!live || navigation !== readerNavigation.current || originalKey !== currentReadingKey.current || selected.boundary !== destination.current.boundary) return;
      setQuote(value); setQuotePosition({ left: 12, top: 76 });
      setHighlight({ kind: 'material', resourceId: value.resourceId, sha256: value.sha256,
        ...(value.page ? { page: value.page } : {}), field: 'body', offset: value.start, end: value.end });
    }).catch(problem => { if (live && navigation === readerNavigation.current && originalKey === currentReadingKey.current) setNotice(readingError(problem)); });
    return () => { live = false; };
  }, [active, document, target, boundary]);
  function dropSurface() { return conversationTarget?.current || conversation.current; }
  function bookmarkSource() {
    return (document?.image ? reader.current?.querySelector<HTMLElement>('.material-pdf-text-layer') : prose.current) || scroller.current;
  }

  function clearQuoteTransfer() {
    const transfer = quoteTransfer.current;
    if (transfer) bookmarkTray?.release({ kind: 'material', reference: transfer.quote, target: transfer.target });
    quoteTransfer.current = undefined;
    const pointer = quotePointer.current; quotePointer.current = undefined;
    if (pointer?.element.hasPointerCapture(pointer.id)) pointer.element.releasePointerCapture(pointer.id);
    setDraggingQuote(false); setDropActive(false); setDragPreview(undefined);
  }
  useEffect(() => { quoteTransferRequest.current++; clearQuoteTransfer(); setAnchorUndo(undefined); setQuoteBusy(false); }, [sessionId, boundary, active, readingKey]);
  useEffect(() => () => {
    quoteTransferRequest.current++;
    const pointer = quotePointer.current;
    if (pointer?.element.hasPointerCapture(pointer.id)) pointer.element.releasePointerCapture(pointer.id);
  }, []);
  useEffect(() => {
    if (!draggingQuote) return;
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); clearQuoteTransfer(); setNotice('原文还在这一页。');
    };
    window.addEventListener('keydown', cancel, true);
    window.addEventListener('blur', clearQuoteTransfer);
    return () => { window.removeEventListener('keydown', cancel, true); window.removeEventListener('blur', clearQuoteTransfer); };
  }, [draggingQuote]);
  useEffect(() => {
    const surface = conversationTarget?.current;
    if (!surface || !active) return;
    const over = (event: globalThis.DragEvent) => {
      if (bookmarkTray && event.target instanceof Element && event.target.closest('[data-bookmark-target]')) return;
      if (!quoteTransfer.current) return;
      event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; setDropActive(true);
    };
    const leave = (event: globalThis.DragEvent) => { if (!(event.relatedTarget instanceof Node) || !surface.contains(event.relatedTarget)) setDropActive(false); };
    const drop = (event: globalThis.DragEvent) => { if (!quoteTransfer.current || bookmarkTray && event.target instanceof Element && event.target.closest('[data-bookmark-target]')) return; event.preventDefault(); event.stopPropagation(); void dropQuote(); };
    surface.addEventListener('dragover', over, true); surface.addEventListener('dragleave', leave); surface.addEventListener('drop', drop, true);
    surface.classList.toggle('is-receiving-quote', draggingQuote); surface.classList.toggle('is-drop-active', dropActive);
    return () => {
      surface.removeEventListener('dragover', over, true); surface.removeEventListener('dragleave', leave); surface.removeEventListener('drop', drop, true);
      surface.classList.remove('is-receiving-quote', 'is-drop-active');
    };
  }, [conversationTarget, active, draggingQuote, dropActive, sessionId, boundary]);
  function startQuoteTransfer(source: MaterialQuoteReference) {
    if (!active || !draftEnabled || !target || (!children && !conversationTarget?.current && !bookmarkTray) || quoteBusy) return false;
    if (source.end - source.start > 4000) { setNotice('这段有些长，选短一点，我们接着聊。'); return false; }
    quoteTransfer.current = { target, quote: materialQuoteAddress(source), sessionId, boundary };
    bookmarkTray?.stage({ kind: 'material', reference: materialQuoteAddress(source), target }, bookmarkSource());
    setDraggingQuote(true); return true;
  }
  async function dropQuote() {
    const transfer = quoteTransfer.current;
    clearQuoteTransfer();
    if (!transfer) return;
    if (bookmarkTray) { await bookmarkTray.offer({ kind: 'material', reference: transfer.quote, target: transfer.target }, 'chat', bookmarkSource()); return; }
    const generation = ++quoteTransferRequest.current, originalReadingKey = currentReadingKey.current;
    setQuoteBusy(true); setNotice('');
    try {
      const current = await api.materialsQuote({ target: transfer.target, quote: transfer.quote });
      if (!mounted.current || generation !== quoteTransferRequest.current || originalReadingKey !== currentReadingKey.current
        || !destination.current.enabled || !destination.current.active
        || transfer.sessionId !== destination.current.sessionId || transfer.boundary !== destination.current.boundary) return;
      if (onQuote(current)) setQuote(undefined);
    } catch (problem) { if (mounted.current && generation === quoteTransferRequest.current
      && originalReadingKey === currentReadingKey.current && destination.current.active
      && transfer.sessionId === destination.current.sessionId && transfer.boundary === destination.current.boundary) setNotice(readingError(problem)); }
    finally { if (mounted.current && generation === quoteTransferRequest.current) setQuoteBusy(false); }
  }
  function startNativeTransfer(event: DragEvent<HTMLElement>, source: MaterialQuoteReference) {
    if (!startQuoteTransfer(source)) { event.preventDefault(); return; }
    // Only an in-memory transfer from this reader is accepted on drop. The
    // payload contains an address, never client-authored text or authority.
    event.dataTransfer.clearData();
    if (target) writeBookmarkTransfer(event.dataTransfer, { kind: 'material', reference: materialQuoteAddress(source), target });
    event.dataTransfer.setData('application/x-zaichang-material', JSON.stringify(materialQuoteAddress(source)));
    event.dataTransfer.effectAllowed = 'copy';
  }
  function beginQuotePointer(event: PointerEvent<HTMLButtonElement>) {
    if (!quote || quotePointer.current || event.button !== 0 || !event.isPrimary || !startQuoteTransfer(quote)) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    quotePointer.current = { id: event.pointerId, element: event.currentTarget, x: event.clientX, y: event.clientY, moved: false };
  }
  function moveQuotePointer(event: PointerEvent<HTMLButtonElement>) {
    const pointer = quotePointer.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer.moved ||= Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5;
    if (!pointer.moved) return;
    setDragPreview({ x: event.clientX, y: event.clientY });
    const bounds = dropSurface()?.getBoundingClientRect();
    setDropActive(!!bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom);
  }
  function endQuotePointer(event: PointerEvent<HTMLButtonElement>) {
    if (quotePointer.current?.id !== event.pointerId) return;
    const moved = quotePointer.current.moved;
    const receiver = window.document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-bookmark-target]');
    if (moved && receiver?.dataset.bookmarkTarget && bookmarkTray && quoteTransfer.current) {
      const source = quoteTransfer.current; clearQuoteTransfer();
      void bookmarkTray.offer({ kind: 'material', reference: source.quote, target: source.target }, receiver.dataset.bookmarkTarget, bookmarkSource()); return;
    }
    const bounds = dropSurface()?.getBoundingClientRect();
    const accepted = quotePointer.current.moved && bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (accepted) void dropQuote();
    else { clearQuoteTransfer(); if (!moved) void useQuote(bookmarkTray ? 'tray' : 'chat'); }
  }

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selectionRequest.current++; void api.materialsCancel(); }; }, []);
  useEffect(() => {
    if (boundaryRef.current === boundary) return;
    boundaryRef.current = boundary;
    request.current++; selectionRequest.current++;
    setDocument(undefined); setTarget(undefined); setItems([]); setQuote(undefined); setError(''); setHighlight(undefined);
    positions.current.clear(); bookmarks.current.clear(); setSavedNote(undefined);
    noteRequest.current++; editorRequest.current++; noteDrafts.current.clear(); setNoteDraftCount(0); setNoteEditor(undefined); setNotePending(false); setNotes([]); setNotesError('');
    void api.materialsCancel();
  }, [boundary]);
  useEffect(() => { selectionRequest.current++; setChoosing(false); }, [sessionId]);
  useEffect(() => { if (selectedId) bookmarks.current.set(selectedId, { page, offset, view, zoom }); }, [selectedId, page, offset, view, zoom]);
  useEffect(() => {
    if (!noteEditor) return;
    if (noteEditor.body !== noteEditor.originalBody) noteDrafts.current.set(noteEditor.key, noteEditor);
    else noteDrafts.current.delete(noteEditor.key);
    setNoteDraftCount(noteDrafts.current.size);
  }, [noteEditor]);
  useEffect(() => { onUnsavedChange?.(noteDraftCount > 0 || !!noteEditor && noteEditor.body !== noteEditor.originalBody); }, [noteDraftCount, noteEditor, onUnsavedChange]);
  useEffect(() => () => unsavedCallback.current?.(false), []);
  useEffect(() => { if (noteEditor) requestAnimationFrame(() => noteInput.current?.focus({ preventScroll: true })); }, [noteEditor?.key]);
  useEffect(() => {
    if (!quote) return;
    const clear = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.material-selection-actions, .source-bookmark-tray')) setQuote(undefined);
    };
    window.addEventListener('pointerdown', clear);
    return () => window.removeEventListener('pointerdown', clear);
  }, [quote]);
  useEffect(() => {
    if (!pendingRef || target?.kind === 'saved') return;
    setPage(1); setOffset(0); setView(pendingRef.mediaType === 'application/pdf' ? 'page' : 'text');
  }, [pendingRef?.resourceId]);
  useEffect(() => {
    if (!focus || focusRequest.current === focus.requestId) return;
    focusRequest.current = focus.requestId;
    interruptResume(); request.current++;
    const locator = focus.locator;
    revealPending.current = true;
    setTarget(pendingRef?.resourceId === locator.resourceId ? { kind: 'pending', reference: pendingRef } : { kind: 'saved', resourceId: locator.resourceId });
    setPage(locator.page || 1);
    setOffset(locator.field === 'body' ? locator.page ? Math.floor(locator.offset / MATERIAL_LIMITS.readCodePoints) * MATERIAL_LIMITS.readCodePoints : Math.max(0, locator.offset - 120) : 0);
    setView(locator.page ? 'page' : 'text'); setListOpen(false); setQuery(''); setHighlight(locator);
  }, [focus]);

  useEffect(() => {
    if (!active) return;
    let current = true;
    void api.materialsList({ sessionId }).then(next => {
      if (!current) return;
      setItems(next); setListError('');
      readingPositions.retain([...(pendingRef ? [pendingRef] : []), ...next,
        ...(targetRef.current?.kind === 'pending' ? [targetRef.current.reference] : [])]);
      if (!targetRef.current && !pendingRef) {
        const recent = readingPositions.latest(next);
        if (recent) {
          const { page, offset, view, zoom, scrollTop } = recent.position;
          setPage(page); setOffset(offset); setView(view); setZoom(zoom);
          positions.current.set(`${recent.resource.resourceId}:${page}:${offset}:${view}`, scrollTop);
          setTarget({ kind: 'saved', resourceId: recent.resource.resourceId });
          return;
        }
      }
      setTarget(previous => {
        if (pendingRef) {
          if (previous?.kind === 'pending' && previous.reference.resourceId === pendingRef.resourceId) return previous;
          if (!previous || previous.kind === 'pending') return { kind: 'pending', reference: pendingRef };
        }
        const id = targetId(previous);
        if (id && next.some(item => item.resourceId === id)) return previous?.kind === 'saved' ? previous : { kind: 'saved', resourceId: id };
        // Sending consumes the draft before its source is bound. Keep the same
        // reading address during admission; the next host refresh adopts the
        // saved target. A removed source still fails the normal owner read.
        if (previous?.kind === 'pending' && !pendingRef) return previous;
        return previous && next.some(item => item.resourceId === targetId(previous)) ? previous : undefined;
      });
    }).catch(problem => { if (current) setListError(uiError(problem)); });
    return () => { current = false; };
  }, [sessionId, boundary, pendingRef?.resourceId, refresh, refreshKey, active]);

  useEffect(() => {
    if (!active) { setQuote(undefined); return; }
    if (!target) { setDocument(undefined); setLoading(false); return; }
    const id = ++request.current;
    const remembered = selected && readingPositions.restore(selected);
    const previousScroll = positions.current.get(readingKey) ?? (remembered?.page === page && remembered.offset === offset && remembered.view === view ? remembered.scrollTop : 0);
    setLoading(true); setError(''); setNotice(''); setQuote(undefined); setDocument(undefined);
    void api.materialsRead({ target, page, offset, view }).then(result => {
      if (id !== request.current) return;
      documentReadingKey.current = readingKey;
      resumeInFlight.current = false;
      if (resumeSelection.current?.boundary === boundary && resumeSelection.current.quote.resourceId === result.item.resourceId
        && resumeSelection.current.quote.sha256 === result.item.sha256 && resumeSelection.current.quote.page === result.page)
        resumeSelection.current.readDone = true;
      setDocument(result);
      requestAnimationFrame(() => {
        if (id !== request.current) return;
        const mark = revealPending.current && reader.current?.querySelector<HTMLElement>('.material-search-match, .material-pdf-text-layer mark.is-search');
        if (mark) { mark.scrollIntoView({ block: 'center' }); revealPending.current = false; }
        else scroller.current?.scrollTo({ top: previousScroll });
        readingPositions.save(result.item, { page, offset, view, zoom, scrollTop: scroller.current?.scrollTop || 0 });
      });
    }).catch(problem => { if (id === request.current) { resumeInFlight.current = false; setError(readingError(problem)); } })
      .finally(() => { if (id === request.current) setLoading(false); });
    return () => { request.current++; void api.materialsCancel(); };
  }, [target, page, offset, view, boundary, retry, active, pendingRef?.resourceId]);
  useEffect(() => {
    const generation = ++noteRequest.current;
    const projection = `${boundary}:${targetId(target)}:${selected?.sha256}:${selected?.mediaType === 'application/pdf' ? page : ''}`;
    if (noteProjectionKey.current !== projection || !active || !target) {
      noteProjectionKey.current = projection; setNotes([]);
    }
    setNotesError('');
    if (!active || !target) return;
    void api.materialsNotes({ target, ...(selected?.mediaType === 'application/pdf' ? { page } : {}) }).then(result => {
      if (noteRequest.current === generation) setNotes(result.items);
    }).catch(problem => { if (noteRequest.current === generation) setNotesError(readingError(problem)); });
    return () => { noteRequest.current++; };
  }, [active, target, selected?.mediaType, selected?.sha256, page, boundary, notesRefresh]);
  useEffect(() => {
    if (active && document && document.item.resourceId === selectedId && (!document.page || document.page === page))
      readingPositions.save(document.item, { page, offset, view, zoom, scrollTop: scroller.current?.scrollTop || 0 });
  }, [zoom]);
  useEffect(() => {
    if (!document || !highlight || document.item.resourceId !== highlight.resourceId) return;
    if (document.item.sha256 !== highlight.sha256) {
      setHighlight(undefined); setNotice('原文件已经换过，这里是现在的内容。'); return;
    }
  }, [document, highlight]);

  function open(item: MaterialItem, pendingItem = false) {
    interruptResume(); request.current++;
    setHighlight(undefined);
    const bookmark = bookmarks.current.get(item.resourceId) || readingPositions.restore(item);
    setPage(bookmark?.page || 1); setOffset(bookmark?.offset || 0);
    setView(bookmark?.view || (item.mediaType === 'application/pdf' ? 'page' : 'text')); setZoom(bookmark?.zoom || 100);
    setTarget(pendingItem && pendingRef ? { kind: 'pending', reference: pendingRef } : { kind: 'saved', resourceId: item.resourceId });
    setListOpen(false); setQuery('');
  }
  async function attach() {
    interruptResume(); request.current++;
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
    if (Array.from(text).length > 4000) { setQuote(undefined); setNotice('这段有些长，选短一点，我们接着聊。'); return; }
    setNotice('');
    const start = document.start + Array.from(prefix.toString()).length;
    const current = { resourceId: document.item.resourceId, sha256: document.item.sha256, name: document.item.name,
      text, page: document.page, start, end: start + Array.from(text).length };
    setQuote(current);
    const rect = range.getBoundingClientRect(), container = reader.current?.getBoundingClientRect();
    if (container) setQuotePosition({ left: Math.max(12, Math.min(container.width - 292, rect.left - container.left)),
      top: Math.max(116, Math.min(container.height - 110, rect.top - container.top - 52)) });
    setSavedNote(undefined);
    return current;
  }
  const capturePageSelection = useCallback((selection?: MaterialPageSelection) => {
    if (!selection || !document) { setQuote(undefined); return; }
    if (selection.end - selection.start > 4000) { setQuote(undefined); setNotice('这段有些长，选短一点，我们接着聊。'); return; }
    const text = Array.from(document.text).slice(selection.start - document.start, selection.end - document.start).join('');
    if (!text.trim()) { setQuote(undefined); return; }
    setQuote({ resourceId: document.item.resourceId, sha256: document.item.sha256, name: document.item.name,
      text, page: document.page, start: selection.start, end: selection.end });
    const container = reader.current?.getBoundingClientRect(), rect = selection.rect;
    if (container) setQuotePosition({ left: Math.max(12, Math.min(container.width - 292, rect.left - container.left)),
      top: Math.max(76, Math.min(container.height - 110, rect.top - container.top - 52)) });
    setNotice(''); setSavedNote(undefined);
  }, [document]);
  async function useQuote(operation: 'chat' | 'note' | 'tray') {
    if (!quote || !target || quoteBusy || !destination.current.active || operation === 'chat' && !destination.current.enabled) return;
    const selected = quote, originalDestination = { ...destination.current }, originalReadingKey = currentReadingKey.current;
    const generation = ++quoteTransferRequest.current;
    const stillCurrent = () => mounted.current && generation === quoteTransferRequest.current && destination.current.active
      && originalReadingKey === currentReadingKey.current && originalDestination.boundary === destination.current.boundary
      && originalDestination.sessionId === destination.current.sessionId;
    setQuoteBusy(true); setNotice('');
    try {
      const input = { target, quote: materialQuoteAddress(selected) };
      if (operation === 'tray' && bookmarkTray) {
        await bookmarkTray.pick({ kind: 'material', reference: input.quote, target }, bookmarkSource()); return;
      }
      if (operation === 'note') {
        const current = await api.materialsQuote(input);
        if (!stillCurrent()) return;
        const key = `${current.resourceId}:${current.page || 0}:${current.start}:${current.end}`;
        noteReturnFocus.current = window.document.activeElement as HTMLElement;
        setNoteEditor(noteDrafts.current.get(key) || { key, target, quote: current, body: '', originalBody: '' });
      } else {
        const current = await api.materialsQuote(input);
        if (!stillCurrent() || !destination.current.enabled) return;
        if (!onQuote(current)) return;
      }
      setQuote(undefined);
    } catch (problem) { if (stillCurrent()) setNotice(readingError(problem)); }
    finally { if (mounted.current && generation === quoteTransferRequest.current) setQuoteBusy(false); }
  }
  const openNote = useCallback(async (note: MaterialNote) => {
    if (!target || notePending || !destination.current.active) return;
    const generation = ++editorRequest.current, originalBoundary = boundary, originalTarget = target,
      originalReadingKey = currentReadingKey.current;
    setNotePending(true);
    try {
      const [quote, page] = await Promise.all([
        api.materialsQuote({ target, quote: note.source }), api.notesRead({ id: note.id }),
      ]);
      if (!mounted.current || generation !== editorRequest.current || destination.current.boundary !== originalBoundary
        || !destination.current.active || originalReadingKey !== currentReadingKey.current) return;
      if (page.note.state !== 'active') { setNotesRefresh(value => value + 1); return; }
      if (page.hasMore) { onOpenNote?.(page.note.id, page.note.revision); return; }
      setQuote(undefined);
      const draft = noteDrafts.current.get(note.id);
      noteReturnFocus.current = window.document.activeElement as HTMLElement;
      setNoteEditor(draft?.note ? { ...draft, target: originalTarget, quote,
        ...(draft.note.revision !== page.note.revision ? { error: '这条笔记在另一处改过了，刚写的内容仍留在这里。' } : {}) } : { key: note.id, target: originalTarget,
        quote, body: page.body, originalBody: page.body, note: { id: page.note.id, revision: page.note.revision, title: page.note.title } });
    } catch (problem) { if (mounted.current && generation === editorRequest.current && destination.current.active
      && destination.current.boundary === originalBoundary && originalReadingKey === currentReadingKey.current) setNotice(readingError(problem)); }
    finally { if (mounted.current && generation === editorRequest.current) setNotePending(false); }
  }, [target, notePending, boundary, onOpenNote]);
  async function relocateNote(input: AnchorUndo, undo = false) {
    if (!active || notePending || boundaryRef.current !== boundary) return;
    const generation = ++editorRequest.current, originalBoundary = boundary, originalReadingKey = readingKey;
    setNotePending(true); setNotice('');
    try {
      const result = await api.materialsMoveNote(input);
      if (!mounted.current || generation !== editorRequest.current || originalBoundary !== destination.current.boundary
        || !destination.current.active || originalReadingKey !== currentReadingKey.current) return;
      if (result.status === 'conflict') {
        setNotice('这条笔记刚在另一处改过，刚才的试放没有覆盖它。'); setNotesRefresh(value => value + 1); return;
      }
      const source = materialQuoteAddress(input.quote);
      setNotes(current => current.map(note => note.id === input.noteId ? { ...note, revision: result.note.revision, source } : note));
      setNoteEditor(current => current?.note?.id === input.noteId ? { ...current,
        quote: { ...current.quote, ...source }, note: { ...current.note, revision: result.note.revision } } : current);
      // Undo only moves this anchor back. The owner revision prevents it from
      // reverting a later edit, and the independent body is never replaced.
      setAnchorUndo(undo ? undefined : { ...input, expectedRevision: result.note.revision, from: source, quote: input.from });
      setNotice(undo ? '笔记回到了原处。' : '笔记留在这一处了。');
      setNotesRefresh(value => value + 1);
    } catch (problem) { if (generation === editorRequest.current && destination.current.active
      && originalReadingKey === currentReadingKey.current) setNotice(readingError(problem)); }
    finally { if (mounted.current && generation === editorRequest.current) setNotePending(false); }
  }
  function moveNoteAnchor(note: MaterialNote, source: MaterialQuoteReference) {
    if (!target) return;
    void relocateNote({ target, noteId: note.id, expectedRevision: note.revision, from: note.source, quote: source });
  }
  async function saveNote() {
    if (!noteEditor || notePending) return;
    const editor = noteEditor, generation = ++editorRequest.current, originalBoundary = boundary;
    setNotePending(true);
    try {
      // Reopen the original even for an existing note. Editing the independent
      // notebook document elsewhere remains available if this source leaves.
      await api.materialsQuote({ target: editor.target, quote: materialQuoteAddress(editor.quote) });
      if (!mounted.current || generation !== editorRequest.current || destination.current.boundary !== originalBoundary) return;
      const result = editor.note ? await api.notesUpdate({ id: editor.note.id, expectedRevision: editor.note.revision,
        title: editor.note.title, body: editor.body }) : await api.materialsKeepQuote({ target: editor.target,
        quote: materialQuoteAddress(editor.quote), annotation: editor.body });
      if (!mounted.current || generation !== editorRequest.current || destination.current.boundary !== originalBoundary) return;
      if (result.status === 'conflict') {
        setNoteEditor(current => current?.key === editor.key ? { ...current, error: '这条笔记在另一处改过了，打开笔记对照一下，刚写的内容还在这里。' } : current);
        return;
      }
      noteDrafts.current.delete(editor.key); setNoteDraftCount(noteDrafts.current.size); setNoteEditor(undefined); setNotesRefresh(value => value + 1);
      setSavedNote({ id: result.note.id, revision: result.note.revision });
      setNotice('留好了。');
    } catch (problem) { if (generation === editorRequest.current) setNoteEditor(current => current?.key === editor.key ? { ...current, error: readingError(problem) } : current); }
    finally { if (mounted.current && generation === editorRequest.current) setNotePending(false); }
  }
  function closeNote() {
    if (notePending) return;
    setNoteEditor(undefined);
    requestAnimationFrame(() => (noteReturnFocus.current?.isConnected ? noteReturnFocus.current : scroller.current)?.focus({ preventScroll: true }));
  }
  function resumeNote() {
    const draft = [...noteDrafts.current.values()].at(-1);
    if (!draft) return;
    interruptResume(); request.current++;
    setTarget(draft.target); setPage(draft.quote.page || 1);
    setOffset(draft.quote.page ? Math.floor(draft.quote.start / MATERIAL_LIMITS.readCodePoints) * MATERIAL_LIMITS.readCodePoints : Math.max(0, draft.quote.start - 120));
    setView(draft.quote.page ? 'page' : 'text'); setNoteEditor(draft);
  }
  function changeZoom(value: number) {
    interruptResume();
    const viewport = scroller.current;
    const ratio = viewport && viewport.scrollHeight > viewport.clientHeight ? viewport.scrollTop / (viewport.scrollHeight - viewport.clientHeight) : 0;
    setZoom(value);
    requestAnimationFrame(() => { if (viewport) viewport.scrollTop = ratio * (viewport.scrollHeight - viewport.clientHeight); });
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
  return <section hidden={!active} className={`materials-panel ${compact ? 'is-compact' : ''} ${children ? 'has-conversation' : ''}`} aria-label="资料原文">
    <div className="materials-reader" ref={reader} data-source-current={currentBoundary} aria-hidden={!currentBoundary} inert={!currentBoundary}
      onPointerDownCapture={() => { if (resumeInFlight.current) interruptResume(); }}
      onWheelCapture={() => { if (resumeInFlight.current) interruptResume(); }}
      onKeyDownCapture={() => { if (resumeInFlight.current) interruptResume(); }}>
      {!target && <header className="materials-heading"><button className="text-button" onClick={onClose}><ArrowLeft size={16} />回到聊天</button></header>}
      {!target ? <div className="materials-welcome">
        <div className="materials-welcome-copy"><h1>资料</h1></div>
        {allItems.length ? index : <div className="materials-empty"><div className="materials-paper-mark"><FileText size={52} strokeWidth={1} /></div><p>讲义、文章，或刚记下的一段话。</p><button className="primary-button" onClick={() => void attach()} disabled={choosing || !draftEnabled}><FolderOpen size={17} />{choosing ? '等你选好…' : '选一份资料'}</button><small>PDF、Markdown 和文字文件</small></div>}
        {listError && !allItems.length && <p className="materials-muted" role="alert">{listError}</p>}
      </div> : <>
        <div className="materials-toolbar">
          <button className="icon-button" aria-label="收起资料，回到聊天" title="回到聊天" onClick={onClose}><ArrowLeft size={18} /></button>
          <button className="icon-button" aria-label={listOpen ? '收起资料列表' : '打开资料列表'} aria-expanded={listOpen} onClick={() => setListOpen(value => !value)}><List size={19} /></button>
          <strong className="materials-filename" title={selected?.name}>{selected?.name || '原文'}</strong>
          <button className="icon-button" aria-label="带走原文件" title="带走原文件" disabled={exporting} onClick={() => void exportOriginal()}><Download size={17} /></button>
          {selected?.mediaType === 'application/pdf' && <div className="materials-view-switch" role="group" aria-label="阅读方式">
            <button aria-pressed={view === 'page'} title="原页面" onClick={() => { setView('page'); setOffset(0); }}><Image size={16} /><span>页面</span></button>
            <button aria-pressed={view === 'text'} title="可选中的原文字层" onClick={() => { setView('text'); setOffset(0); }}><Type size={16} /><span>文字</span></button>
          </div>}
        </div>
        {listOpen && <div className="materials-list-popover">{index}</div>}
        <div className="materials-scroll" ref={scroller} tabIndex={-1} aria-busy={loading} onScroll={() => {
          if (!loading && document && scroller.current) {
            positions.current.set(readingKey, scroller.current.scrollTop);
            readingPositions.save(document.item, { page, offset, view, zoom, scrollTop: scroller.current.scrollTop });
            reportReturnAddress();
          }
          if (quote) setQuote(undefined);
        }}>
          {!currentBoundary || loading || !!document && documentReadingKey.current !== readingKey ? <div className="materials-opening" role="status"><LoaderCircle size={23} className="spin" /><p>正在翻开这一页…</p></div> : error ? <div className="materials-recovery" role="alert">
            <div className="materials-paper-mark"><FileText size={48} strokeWidth={1} /></div><h2>这份文件没能打开。</h2><p>你可以再试一次，也可以换一份原文件。</p>
            <div className="field-buttons"><button className="primary-button" onClick={() => setRetry(value => value + 1)}>再试一次</button><button className="subtle-button" onClick={() => void attach()} disabled={choosing || !draftEnabled}>重新选择</button></div>
            <details><summary>看看原因</summary><p>{error}</p></details>
          </div> : document ? <>
            {document.image ? <MaterialPdfPage document={document} zoom={zoom} notes={notes}
                reference={noteEditor?.quote.resourceId === document.item.resourceId && noteEditor.quote.page === document.page ? noteEditor.quote : reference}
                activeNoteId={noteEditor?.note?.id} onSelection={capturePageSelection} onOpenNote={openNote}
                onMoveNote={moveNoteAnchor} moveDisabled={!active || notePending || loading}
                onSelectionDragStart={(event, selection) => startNativeTransfer(event, { resourceId: document.item.resourceId,
                  sha256: document.item.sha256, page: document.page, start: selection.start, end: selection.end })}
                onSelectionDragEnd={clearQuoteTransfer}
                highlight={highlight?.field === 'body' && highlight.resourceId === document.item.resourceId && highlight.sha256 === document.item.sha256
                  && highlight.page === document.page ? highlight : undefined} />
              : document.text ? <pre className="material-original" ref={prose} style={{ fontSize: `calc(var(--reading-size) * ${zoom / 100})` }}
                  onPointerUp={captureSelection} onKeyUp={captureSelection}
                  onDragStart={event => { const source = captureSelection(); if (source) startNativeTransfer(event, source); else event.preventDefault(); }}
                  onDragEnd={clearQuoteTransfer} tabIndex={0} aria-label="可选择的原文">{originalText()}</pre>
              : <div className="materials-scan"><BookOpen size={32} strokeWidth={1.25} /><h2>先看看这一页</h2><p>这一页没有可选中的文字。可以先看原页面，再说说你想问哪里。</p><button className="primary-button" onClick={() => { setView('page'); setOffset(0); }}>看原页面</button></div>}
            {view === 'text' && document.needsVisual && document.text && <p className="materials-page-note">这一页还有图表，切到「页面」可以一起看。</p>}
          </> : null}
        </div>
        {quote && currentBoundary && !loading && documentReadingKey.current === readingKey && <div className="material-selection-actions" style={quotePosition} role="group" aria-label="选段操作" onMouseDown={event => event.preventDefault()}>
          {(!!children || !!conversationTarget || !!bookmarkTray) && <button type="button" className="material-drag-quote" aria-label="拿起选段，放到推导纸、笔记或对话" title="拿到纸边"
            disabled={!draftEnabled || quoteBusy} onPointerDown={beginQuotePointer} onPointerMove={moveQuotePointer}
            onPointerUp={endQuotePointer} onPointerCancel={clearQuoteTransfer}
            onLostPointerCapture={() => { if (quotePointer.current) clearQuoteTransfer(); }}
            onClick={event => { if (event.detail === 0) void useQuote(bookmarkTray ? 'tray' : 'chat'); }}><GripVertical size={17} /></button>}
          <button disabled={!draftEnabled || quoteBusy} onClick={() => void useQuote('chat')}><MessageCircle size={17} />聊这一段</button>
          <button disabled={quoteBusy || notePending} onClick={() => void useQuote('note')}><BookmarkPlus size={17} />记一笔</button>
          {bookmarkTray && <button disabled={quoteBusy} onClick={() => void useQuote('tray')}><BookOpen size={16} />书签夹</button>}
        </div>}
        {noteEditor && boundaryRef.current === boundary && <section className="material-margin-editor" aria-label="这一处的笔记" aria-busy={notePending}
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeNote(); } }}>
          <header><span><StickyNote size={15} />{noteEditor.quote.name}{noteEditor.quote.page ? ` · 第 ${noteEditor.quote.page} 页` : ''}</span>
            <button type="button" className="icon-button" aria-label="收起笔记" disabled={notePending} onClick={closeNote}><X size={16} /></button></header>
          {!noteEditor.note && <blockquote>{noteEditor.quote.text}</blockquote>}
          <textarea ref={noteInput} aria-label={noteEditor.note ? '笔记内容' : '写下这一处的想法'} value={noteEditor.body}
            maxLength={noteEditor.note ? 200000 : 4000} disabled={notePending} placeholder="刚才想到的…"
            onChange={event => setNoteEditor(current => current ? { ...current, body: event.target.value, error: undefined } : current)} />
          {noteEditor.error && <p role="alert">{noteEditor.error}</p>}
          <footer>{bookmarkTray && <button type="button" className="text-button" disabled={notePending}
              onClick={() => void bookmarkTray.pick({ kind: 'material', reference: materialQuoteAddress(noteEditor.quote), target: noteEditor.target }, noteInput.current || bookmarkSource())}>
              <BookOpen size={14} />拿起这一处原文</button>}
            {noteEditor.note && onOpenNote && <button type="button" className="text-button" disabled={notePending}
              onClick={() => onOpenNote(noteEditor.note!.id, noteEditor.note!.revision)}>打开笔记<ArrowUpRight size={13} /></button>}
            <button type="button" className="primary-button" disabled={notePending || !!noteEditor.note && !noteEditor.body.trim()} onClick={() => void saveNote()}>
              {notePending ? <LoaderCircle size={15} className="spin" /> : <BookmarkPlus size={15} />}留在笔记</button></footer>
        </section>}
        <footer className="materials-footer" hidden={!currentBoundary}>
          <select className="materials-zoom" aria-label="阅读缩放" value={zoom} onChange={event => changeZoom(Number(event.target.value))}>
            {[85, 100, 115, 130, 150].map(value => <option key={value} value={value}>{value}%</option>)}
          </select>
          {noteDraftCount > 0 && !noteEditor && <button type="button" className="text-button material-note-resume" onClick={resumeNote}><StickyNote size={14} />继续写</button>}
          {!!notes.length && !document?.image && <details className="material-text-notes"><summary><StickyNote size={15} /><span>{notes.length}</span></summary>
            <div>{notes.map(note => <button type="button" key={note.id} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void openNote(note); }}>
              <span>{note.preview}</span><ChevronRight size={14} /></button>)}</div></details>}
          {document?.pageCount ? <div className="materials-pagination"><button className="icon-button" aria-label="上一页" disabled={loading || page <= 1} onClick={() => { setPage(value => value - 1); setOffset(0); }}><ChevronLeft size={18} /></button><label><input aria-label="PDF页码" type="number" min="1" max={document.pageCount} value={page} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= document.pageCount!) { setPage(value); setOffset(0); } }} /><span>/ {document.pageCount}</span></label><button className="icon-button" aria-label="下一页" disabled={loading || page >= document.pageCount} onClick={() => { setPage(value => value + 1); setOffset(0); }}><ChevronRight size={18} /></button></div> : null}
          {document && (document.nextOffset !== null || document.start > 0) && <div className="materials-pagination"><button className="icon-button" aria-label="上一段原文" disabled={loading || offset <= 0} onClick={() => setOffset(Math.max(0, offset - MATERIAL_LIMITS.readCodePoints))}><ChevronLeft size={18} /></button><small>{Math.floor(offset / MATERIAL_LIMITS.readCodePoints) + 1} / {Math.ceil(document.total / MATERIAL_LIMITS.readCodePoints)}</small><button className="icon-button" aria-label="下一段原文" disabled={loading || document.nextOffset === null} onClick={() => setOffset(document.nextOffset!)}><ChevronRight size={18} /></button></div>}
        </footer>
      </>}
      {notice && <div className="materials-notice" role="status"><span>{notice}</span>
        {anchorUndo && <button type="button" className="text-button" disabled={notePending} onClick={() => void relocateNote(anchorUndo, true)}><Undo2 size={14} />放回原处</button>}
        {savedNote && onOpenNote && <button className="text-button" onClick={() => onOpenNote(savedNote.id, savedNote.revision)}>打开笔记<ChevronRight size={14} /></button>}</div>}
      {notesError && !error && <div className="materials-notice materials-note-error" role="status"><span>这次没能取回页边笔记。</span>
        <button type="button" className="text-button" title={notesError} onClick={() => setNotesRefresh(value => value + 1)}>再看一次</button></div>}
    </div>
    {children && <div ref={conversation} className={`materials-conversation${draggingQuote ? ' is-receiving-quote' : ''}${dropActive ? ' is-drop-active' : ''}`}
      onDragOverCapture={event => { if (!quoteTransfer.current || bookmarkTray && event.target instanceof Element && event.target.closest('[data-bookmark-target]')) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setDropActive(true); }}
      onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropActive(false); }}
      onDropCapture={event => { if (!quoteTransfer.current || bookmarkTray && event.target instanceof Element && event.target.closest('[data-bookmark-target]')) return; event.preventDefault(); event.stopPropagation(); void dropQuote(); }}>
      {children}{draggingQuote && <div className="material-drop-invitation" aria-hidden="true"><MessageCircle size={18} />放进对话</div>}
    </div>}
    {dragPreview && <div className="material-drag-preview" style={{ left: dragPreview.x, top: dragPreview.y }} aria-hidden="true"><FileText size={16} />这一段原文</div>}
    {draggingQuote && conversationTarget?.current && createPortal(<div className="material-drop-invitation" aria-hidden="true"><MessageCircle size={18} />放进对话</div>, conversationTarget.current)}
  </section>;
}
