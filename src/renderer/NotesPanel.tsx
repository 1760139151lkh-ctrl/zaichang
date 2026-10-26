import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  History,
  FileText,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  NOTE_LIMITS,
  noteQuoteAddress,
  type NoteDocument,
  type NoteHistory,
  type NoteList,
  type NoteMutation,
  type NoteQuote,
  type NoteQuoteReference,
  type NotesBridge,
  type NoteDraftAddress,
  type NoteSummary,
} from '../shared/notes';
import { IconButton, PagePanel, uiError } from './ui';
import { DEFAULT_TIME_ZONE, formatDateTime } from './time';
import type { LocalSearchLocator } from '../shared/search';
import { materialQuoteAddress, type MaterialQuoteReference } from '../shared/materials';
import { readBookmarkTransfer, useBookmarkTray, writeBookmarkTransfer } from './SourceBookmarkTray';
import { SOURCE_BOOKMARK_MIME, sourceBookmarkReferenceSchema, type ConversationBookmarkReference, type SourceBookmarkPreview, type SourceBookmarkReference } from '../shared/source-bookmark';
import type { NoteReturnAddress } from './workspace-return';
import './notes.css';
import './keep-note-actions.css';

type Editor = { note?: NoteDocument; title: string; body: string };
type NoteSelection = { editor: Editor; start: number; end: number; left: number; top: number };
const fresh = (): Editor => ({ title: '', body: '' });
const keyOf = (editor: Editor) => editor.note?.id || 'new';
const isDirty = (editor?: Editor) =>
  !!editor &&
  (editor.note
    ? editor.title !== editor.note.title || editor.body !== editor.note.body
    : !!editor.title || !!editor.body);
const editable = (note: NoteDocument): Editor => ({
  note,
  title: note.title,
  body: note.body,
});
const referenceNoteTitle = '纸边的一段原文';
const ownNoteLabel = (note: Pick<NoteDocument, 'title' | 'source'>) =>
  note.source.referenceOnly && note.title === referenceNoteTitle ? '摘录笔记' : note.title || '没有标题的一页';
function noteSourceReference(note?: Pick<NoteDocument, 'source'>): SourceBookmarkReference | undefined {
  if (!note?.source.referenceOnly) return;
  const { material, notebook, conversation } = note.source;
  return material ? { kind: 'material', reference: materialQuoteAddress(material) } : notebook ? { kind: 'notebook', reference: notebook }
    : conversation ? { kind: 'conversation', reference: conversation } : undefined;
}
/** A visible source label is a fresh owner projection, never a saved title or
 * a cache used to recreate words withdrawn from the original. */
function KeptNoteEntry({ note, active, boundary, busy, current, hasDraft, date, onOpen }: {
  note: NoteSummary; active: boolean; boundary: string; busy: boolean; current: boolean; hasDraft: boolean;
  date: string; onOpen: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null), generation = useRef(0);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; value: SourceBookmarkPreview }>();
  const [unavailable, setUnavailable] = useState(false);
  const address = noteSourceReference(note), addressKey = JSON.stringify(address);
  const key = `${boundary}:${note.id}@${note.revision}:${note.sha256}:${note.state}`;
  const preview = active && note.state === 'active' && loaded?.key === key ? loaded.value : undefined;
  useEffect(() => {
    if (!active || !button.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(button.current); return () => observer.disconnect();
  }, [active, note.id]);
  useEffect(() => {
    const request = ++generation.current; setLoaded(undefined); setUnavailable(false);
    if (!active || !visible || note.state !== 'active' || !address) return;
    void window.zaichang.sourceBookmarkPreview(address).then(value => {
      if (generation.current === request) setLoaded({ key, value });
    }).catch(() => { if (generation.current === request) setUnavailable(true); });
    return () => { generation.current++; };
  }, [active, visible, key, addressKey]);
  const ownTitle = note.title && (!note.source.referenceOnly || note.title !== referenceNoteTitle) ? note.title : undefined;
  const sourceName = preview ? `${preview.title}${preview.page ? ` · 第 ${preview.page} 页` : ''}`
    : note.source.material ? `资料摘录${note.source.material.page ? ` · 第 ${note.source.material.page} 页` : ''}`
      : note.source.conversation ? '对话摘录' : '笔记摘录';
  return <button ref={button} className={`notes-entry ${current ? 'is-current' : ''}`} disabled={busy}
    onClick={onOpen} aria-current={current ? 'true' : undefined} onFocus={() => setVisible(true)} onMouseEnter={() => setVisible(true)}>
    <strong>{ownTitle || (note.source.referenceOnly ? sourceName : '没有标题的一页')}</strong>
    {note.preview && <span className="notes-preview">{note.preview}</span>}
    {preview && <span className="notes-preview notes-source-preview">{Array.from(preview.text).slice(0, 140).join('')}</span>}
    {!preview && unavailable && <small>原文暂时打不开，你写的想法仍在。</small>}
    <small>{hasDraft ? '还有没写完的字' : date}</small>
  </button>;
}

function noteTextPosition(control: HTMLTextAreaElement, start: number, end: number) {
    // Measure the real editor's wrapped text. The mirror is only geometry;
    // original text and Unicode source coordinates still belong to the note.
    const style = window.getComputedStyle(control), mirror = document.createElement('div');
    mirror.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;border:0;box-sizing:border-box;';
    for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'text-indent', 'tab-size']) mirror.style.setProperty(property, style.getPropertyValue(property));
    mirror.style.width = `${control.clientWidth}px`;
    mirror.append(document.createTextNode(control.value.slice(0, start)));
    const mark = document.createElement('span');
    mark.textContent = control.value.slice(start, end) || '\u200b';
    mirror.append(mark); document.body.append(mirror);
    const position = { top: mark.offsetTop, left: mark.offsetLeft };
    mirror.remove();
    return position;
}
function revealNoteMatch(control: HTMLInputElement | HTMLTextAreaElement, start: number, end: number) {
  control.focus({ preventScroll: true });
  control.setSelectionRange(start, end);
  if (control instanceof HTMLTextAreaElement) {
    control.scrollTop = Math.max(0, noteTextPosition(control, start, end).top - control.clientHeight / 2);
  }
  control.scrollIntoView({ block: 'nearest' });
}

function NotesFrame({
  embedded,
  onClose,
  children,
}: {
  embedded: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return embedded ? (
    <section className="notes-page notes-embedded" aria-label="笔记">
      <div className="notes-content">
        <h2 className="sr-only" data-notes-focus tabIndex={-1}>
          笔记
        </h2>
        {children}
      </div>
    </section>
  ) : (
    <PagePanel title="笔记" onClose={onClose} className="notes-page">
      {children}
    </PagePanel>
  );
}

/** A separate notebook. Saving here does not create memories or arrangements. */
export function NotesPanel({
  onClose,
  onUnsavedChange,
  onOpenMaterialSource,
  onOpenMaterials,
  onOpenConversationSource,
  onReturnAddressChange,
  resume,
  onQuote,
  quoteContext = '',
  quoteBoundary = '',
  quoteEnabled = true,
  active = true,
  refreshKey,
  focus,
  embedded = false,
  bridge = window.zaichang as unknown as NotesBridge,
  timeZone = DEFAULT_TIME_ZONE,
}: {
  onClose: () => void;
  onUnsavedChange?: (unsaved: boolean) => void;
  onOpenMaterialSource?: (source: MaterialQuoteReference, discuss?: boolean) => Promise<void>;
  onOpenMaterials?: () => void;
  onOpenConversationSource?: (reference: ConversationBookmarkReference) => Promise<void>;
  onReturnAddressChange?: (address: NoteReturnAddress | undefined) => void;
  resume?: { address: NoteReturnAddress; requestId: number };
  onQuote?: (quote: NoteQuote) => boolean;
  quoteContext?: string;
  quoteBoundary?: string;
  quoteEnabled?: boolean;
  active?: boolean;
  refreshKey?: string | number;
  focus?: { locator: Extract<LocalSearchLocator, { kind: 'note' }>; requestId: number };
  embedded?: boolean;
  bridge?: NotesBridge;
  timeZone?: string;
}) {
  const bookmarkTray = useBookmarkTray();
  const [list, setList] = useState<NoteList>({
    items: [],
    total: 0,
    offset: 0,
    hasMore: false,
  });
  const [query, setQuery] = useState(''),
    [appliedQuery, setAppliedQuery] = useState('');
  const [state, setState] = useState<'active' | 'deleted'>('active');
  const [editor, setEditor] = useState<Editor>(),
    [conflict, setConflict] = useState<NoteDocument>();
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [receipt, setReceipt] = useState(''),
    [undoRevision, setUndoRevision] = useState<number>();
  const [history, setHistory] = useState<NoteHistory>(),
    [version, setVersion] = useState<NoteDocument>();
  const [closing, setClosing] = useState(false),
    [draftCount, setDraftCount] = useState(0);
  const [sourceError, setSourceError] = useState(''), [sourceOpening, setSourceOpening] = useState(false);
  const [loadedExcerpt, setLoadedExcerpt] = useState<{ key: string; value: SourceBookmarkPreview }>(), [excerptLoading, setExcerptLoading] = useState(false),
    [excerptError, setExcerptError] = useState(''), [excerptRefresh, setExcerptRefresh] = useState(0);
  const excerptGeneration = useRef(0);
  const [selection, setSelection] = useState<NoteSelection>();
  const [quoting, setQuoting] = useState(false);
  const quoteGeneration = useRef(0), bookmarkDrag = useRef<SourceBookmarkReference | undefined>(undefined);
  const quoteDestination = useRef({ context: quoteContext, boundary: quoteBoundary, enabled: quoteEnabled, active, focus });
  quoteDestination.current = { context: quoteContext, boundary: quoteBoundary, enabled: quoteEnabled, active, focus };
  const returnSelection = useRef<{ address: NoteQuoteReference; boundary: string;
    scrollTop: number; pageTop: number; width: number; height: number } | undefined>(undefined);
  const drafts = useRef(new Map<string, Editor>()),
    request = useRef(0),
    listRequest = useRef(0),
    mounted = useRef(true);
  const savedDrafts = useRef(new Map<string, NoteDraftAddress>()), draftEpoch = useRef<number | undefined>(undefined);
  const draftQueues = useRef(new Map<string, Promise<void>>()), draftTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const queuedDrafts = useRef(new Map<string, { value: Editor; boundary: string; epoch?: number }>()), draftConflicts = useRef(new Set<string>());
  const draftContext = useRef(quoteBoundary); draftContext.current = quoteBoundary;
  const [recentDraft, setRecentDraft] = useState<string>();
  const backedDrafts = useRef(new Map<string, Editor>());
  const [draftBackupRevision, bumpDraftBackup] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const focusRequest = useRef(0), focusPending = useRef<typeof focus>(undefined);
  const unsavedCallback = useRef(onUnsavedChange);
  unsavedCallback.current = onUnsavedChange;
  const dirty = isDirty(editor),
    deleted = editor?.note?.state === 'deleted';
  const excerptKey = `${quoteBoundary}:${editor?.note?.id || ''}@${editor?.note?.revision || 0}`;
  const sourceExcerpt = active && !deleted && loadedExcerpt?.key === excerptKey ? loadedExcerpt.value : undefined;
  const returnCallback = useRef(onReturnAddressChange); returnCallback.current = onReturnAddressChange;
  const resumeRequest = useRef(0), resumeAddress = useRef<NoteReturnAddress | undefined>(undefined);
  const editorCurrent = useRef(editor); editorCurrent.current = editor;
  const viewingGeneration = useRef(0);
  const [resumeProof, setResumeProof] = useState(0);
  const reportReturnAddress = (includeSelection = true) => {
    if (!active || !editor || deleted || resumeAddress.current || resume && resumeRequest.current !== resume.requestId) return;
    const control = host.current?.querySelector<HTMLTextAreaElement>('textarea.notes-body'),
      page = host.current?.querySelector<HTMLElement>('.notes-embedded, .page-panel');
    returnCallback.current?.({ id: editor.note?.id || 'new',
      ...(editor.note ? { revision: editor.note.revision, sha256: editor.note.sha256 } : {}),
      ...(includeSelection && !dirty && editor.note && selection?.editor === editor ? { selection: {
        id: editor.note.id, revision: editor.note.revision, sha256: editor.note.sha256, start: selection.start, end: selection.end } } : {}),
      scrollTop: control?.scrollTop || 0, pageTop: page?.scrollTop || 0 });
  };
  useEffect(() => { reportReturnAddress(); }, [active, editor, selection, dirty, deleted]);
  useEffect(() => {
    if (!active || !resume || busy || resumeRequest.current === resume.requestId) return;
    resumeRequest.current = resume.requestId; resumeAddress.current = resume.address;
    setResumeProof(0); const requestId = resume.requestId;
    void (resume.address.id === 'new' ? newNote() : open(resume.address.id)).then(success => {
      if (success && resumeRequest.current === requestId) setResumeProof(requestId);
      else if (resumeRequest.current === requestId) resumeAddress.current = undefined;
    });
  }, [active, resume?.requestId, busy]);
  useEffect(() => {
    const address = resumeAddress.current;
    if (!active || busy || !address || !editor || resumeProof !== resumeRequest.current || (editor.note?.id || 'new') !== address.id) return;
    resumeAddress.current = undefined;
    const requestId = resumeRequest.current, context = quoteBoundary, currentEditor = editor, viewing = viewingGeneration.current;
    requestAnimationFrame(() => {
      if (!mounted.current || !quoteDestination.current.active || quoteDestination.current.boundary !== context
        || resumeRequest.current !== requestId || editorCurrent.current !== currentEditor || viewingGeneration.current !== viewing) return;
      const control = host.current?.querySelector<HTMLTextAreaElement>('textarea.notes-body'),
        page = host.current?.querySelector<HTMLElement>('.notes-embedded, .page-panel');
      if (control) control.scrollTop = address.scrollTop || 0;
      if (page) page.scrollTop = address.pageTop || 0;
      if (!address.selection || dirty || conflict || !editor.note || editor.note.revision !== address.revision
        || editor.note.sha256 !== address.sha256 || !control) { control?.focus({ preventScroll: true }); reportReturnAddress(); return; }
      const points = Array.from(editor.body), start = points.slice(0, address.selection.start).join('').length,
        end = points.slice(0, address.selection.end).join('').length;
      if (address.selection.end > points.length) { control.focus({ preventScroll: true }); reportReturnAddress(); return; }
      revealNoteMatch(control, start, end);
      selectPassage(control);
      reportReturnAddress();
    });
  }, [active, busy, editor, resumeProof]);
  useEffect(() => {
    const turn = ++excerptGeneration.current, reference = noteSourceReference(editor?.note);
    setLoadedExcerpt(undefined); setExcerptError(''); setExcerptLoading(false);
    if (!active || deleted || !reference) return;
    setExcerptLoading(true);
    void window.zaichang.sourceBookmarkPreview(reference).then(value => {
      if (turn === excerptGeneration.current) setLoadedExcerpt({ key: excerptKey, value });
    }).catch(cause => { if (turn === excerptGeneration.current) setExcerptError(uiError(cause)); })
      .finally(() => { if (turn === excerptGeneration.current) setExcerptLoading(false); });
    return () => { excerptGeneration.current++; };
  }, [active, editor?.note?.id, editor?.note?.revision, deleted, quoteBoundary, excerptRefresh]);
  const updateDraftCount = () => {
    const keys = new Set([...savedDrafts.current.keys(), ...drafts.current.keys()]);
    setDraftCount(keys.size); setRecentDraft(keys.values().next().value);
  };
  const queueDraftWrite = (key: string, value: Editor | undefined,
    context = draftContext.current, epochAtQueue = draftEpoch.current) => {
    const previous = draftQueues.current.get(key) || Promise.resolve();
    const task = previous.catch(() => undefined).then(async () => {
      if (typeof bridge.notesDraft !== 'function' || draftContext.current !== context) return;
      if (value && draftConflicts.current.has(key)) return;
      let known = savedDrafts.current.get(key), epoch = epochAtQueue;
      if (epoch === undefined) {
        const result = await bridge.notesDraft({ operation: 'read', key });
        if (draftContext.current !== context) return;
        epoch = result.epoch; draftEpoch.current = result.epoch;
        if (result.draft) { known = result.draft; savedDrafts.current.set(key, result.draft); }
      }
      const result = value ? await bridge.notesDraft({ operation: 'write', key, expectedEpoch: epoch,
        expectedDraftRevision: known?.revision || 0, ...(value.note ? { baseRevision: value.note.revision } : {}), title: value.title, body: value.body })
        : known ? await bridge.notesDraft({ operation: 'discard', key, expectedEpoch: epoch,
          expectedDraftRevision: known.revision }) : undefined;
      if (!result || draftContext.current !== context) return;
      if (result.status === 'conflict') {
        draftConflicts.current.add(key);
        if (mounted.current) setError('另一处也写了这页。眼前的字还在，先把两边的想法留住，再决定保存哪一版。');
        return;
      }
      if (result.draft) savedDrafts.current.set(key, result.draft);
      else savedDrafts.current.delete(key);
      if (value) backedDrafts.current.set(key, value); else backedDrafts.current.delete(key);
      draftConflicts.current.delete(key);
      if (mounted.current) { updateDraftCount(); bumpDraftBackup(value => value + 1); }
    }).catch(cause => { if (mounted.current && draftContext.current === context) setError(uiError(cause)); });
    draftQueues.current.set(key, task); return task;
  };
  const flushDraft = (key: string) => {
    const timer = draftTimers.current.get(key); if (timer) clearTimeout(timer); draftTimers.current.delete(key);
    const queued = queuedDrafts.current.get(key); queuedDrafts.current.delete(key);
    return queued ? queueDraftWrite(key, queued.value, queued.boundary, queued.epoch) : draftQueues.current.get(key);
  };
  const scheduleDraft = (value: Editor) => {
    const key = keyOf(value), timer = draftTimers.current.get(key);
    if (timer) clearTimeout(timer);
    queuedDrafts.current.set(key, { value, boundary: draftContext.current, epoch: draftEpoch.current });
    draftTimers.current.set(key, setTimeout(() => void flushDraft(key), 250));
  };
  const discardDraft = (key: string) => {
    const timer = draftTimers.current.get(key); if (timer) clearTimeout(timer); draftTimers.current.delete(key);
    queuedDrafts.current.delete(key);
    return queueDraftWrite(key, undefined);
  };
  useEffect(() => {
    if (!active || typeof bridge.notesDraft !== 'function') return;
    let live = true;
    void bridge.notesDraft({ operation: 'list' }).then(result => {
      if (!live) return;
      if (draftEpoch.current !== undefined && draftEpoch.current !== result.epoch) {
        drafts.current.clear(); draftConflicts.current.clear(); backedDrafts.current.clear();
      }
      draftEpoch.current = result.epoch;
      savedDrafts.current = new Map((result.items || []).map(value => [value.key, value])); updateDraftCount();
    }).catch(cause => { if (live) setError(uiError(cause)); });
    return () => { live = false; for (const key of queuedDrafts.current.keys()) void flushDraft(key); };
  }, [active, quoteBoundary, bridge]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releaseBookmarkDrag();
      request.current++;
      listRequest.current++;
      // A restarted mount must retry navigation whose read was just invalidated.
      // In StrictMode the refs survive the cleanup, unlike the pending read.
      focusRequest.current = 0;
      resumeRequest.current = 0;
      resumeAddress.current = undefined;
      focusPending.current = undefined;
    };
  }, []);
  useEffect(() => {
    if (active)
      host.current
        ?.querySelector<HTMLHeadingElement>('h1, [data-notes-focus]')
        ?.focus({ preventScroll: true });
  }, [active]);
  useEffect(() => {
    onUnsavedChange?.(typeof bridge.notesDraft === 'function'
      ? [...drafts.current].some(([key, draft]) => backedDrafts.current.get(key) !== draft)
        || !!editor && dirty && backedDrafts.current.get(keyOf(editor)) !== editor
      : dirty || draftCount > 0);
  }, [dirty, draftCount, editor, draftBackupRevision, onUnsavedChange]);
  useEffect(() => () => unsavedCallback.current?.(false), []);
  useEffect(() => {
    quoteGeneration.current++;
    releaseBookmarkDrag();
    setSelection(undefined);
    setQuoting(false);
  }, [active, quoteContext]);
  useEffect(() => { setSelection(undefined); }, [editor]);
  useEffect(() => { returnSelection.current = undefined; }, [quoteBoundary]);
  useEffect(() => {
    if (!selection) return;
    const dismiss = () => setSelection(undefined);
    window.addEventListener('resize', dismiss);
    return () => window.removeEventListener('resize', dismiss);
  }, [!!selection]);
  useEffect(() => {
    if (closing)
      host.current
        ?.querySelector<HTMLElement>('.notes-leave')
        ?.scrollIntoView({ block: 'nearest' });
  }, [closing]);
  useEffect(() => {
    if (history || conflict) {
      host.current?.querySelector<HTMLElement>('.notes-side')?.scrollIntoView({ block: 'nearest' });
    }
  }, [!!history, !!conflict]);

  async function loadList(nextState = state, search = appliedQuery, append = false) {
    const token = ++listRequest.current;
    setLoading(true);
    try {
      const result = await bridge.notesList({
        state: nextState,
        query: search,
        offset: append ? list.items.length : 0,
      });
      if (!mounted.current || token !== listRequest.current) return;
      setList((current) =>
        append ? { ...result, items: [...current.items, ...result.items] } : result,
      );
    } catch (cause) {
      if (mounted.current && token === listRequest.current) setError(uiError(cause));
    } finally {
      if (mounted.current && token === listRequest.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (active) void loadList();
  }, [state, appliedQuery, active, refreshKey]);
  useEffect(() => {
    if (!active || !focus || busy || focusRequest.current === focus.requestId) return;
    focusRequest.current = focus.requestId;
    focusPending.current = focus;
    const requestId = focus.requestId, context = quoteBoundary;
    setState('active'); setQuery(''); setAppliedQuery('');
    void open(focus.locator.noteId).then(success => {
      // A bookmark can create a page while this already-active notebook is
      // open. Refresh its real owner list as well as opening the new editor.
      if (success && focusRequest.current === requestId && quoteDestination.current.active
        && quoteDestination.current.boundary === context) void loadList('active', '');
    });
  }, [active, focus, busy]);
  useEffect(() => {
    const pending = focusPending.current;
    if (!active || busy || !pending || editor?.note?.id !== pending.locator.noteId) return;
    focusPending.current = undefined;
    if (isDirty(editor)) { setReceipt('你刚写下的内容还在，先接着这一版。'); return; }
    if (editor.note.revision !== pending.locator.revision) { setReceipt('这一页后来改过，这里是现在的内容。'); return; }
    const field = pending.locator.field === 'title' ? 'input.notes-title' : 'textarea.notes-body';
    const control = host.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(field);
    if (!control) return;
    const text = pending.locator.field === 'title' ? editor.title : editor.body;
    const points = Array.from(text);
    const start = points.slice(0, pending.locator.offset).join('').length;
    const end = points.slice(0, pending.locator.end).join('').length;
    revealNoteMatch(control, start, end);
  }, [editor, active, busy]);
  useEffect(() => {
    if (!active || busy || !editor?.note || isDirty(editor) || focusPending.current) return;
    const id = editor.note.id,
      revision = editor.note.revision,
      token = ++request.current;
    const activationFocus = document.activeElement, activationViewing = viewingGeneration.current,
      activationInteraction = bookmarkTray?.getInteractionVersion();
    setBusy(true);
    void readAll(id)
      .then((note) => {
        if (!mounted.current || token !== request.current) return;
        if (note.revision !== revision) {
          setEditor(editable(note));
          resetFeedback();
          return;
        }
        const resume = returnSelection.current, destination = quoteDestination.current;
        if (!resume || !destination.active) return;
        if (resume.boundary !== destination.boundary
          || destination.focus && destination.focus.requestId !== focusRequest.current || focusPending.current
          || note.state !== 'active' || note.id !== resume.address.id || note.revision !== resume.address.revision
          || note.sha256 !== resume.address.sha256 || document.activeElement !== activationFocus
          || activationViewing !== viewingGeneration.current || activationInteraction !== bookmarkTray?.getInteractionVersion()) {
          returnSelection.current = undefined;
          return;
        }
        // The existing owner read qualified the same saved document. Restore
        // its native editor range once; no copied body or durable focus exists.
        returnSelection.current = undefined;
        const control = host.current?.querySelector<HTMLTextAreaElement>('textarea.notes-body');
        if (!control) return;
        const points = Array.from(note.body);
        revealNoteMatch(control, points.slice(0, resume.address.start).join('').length,
          points.slice(0, resume.address.end).join('').length);
        if (control.clientWidth === resume.width && control.clientHeight === resume.height) {
          control.scrollTop = resume.scrollTop;
          const page = host.current?.querySelector<HTMLElement>('.notes-embedded, .page-panel');
          if (page) page.scrollTop = resume.pageTop;
        }
      })
      .catch((cause) => {
        if (mounted.current && token === request.current) setError(uiError(cause));
      })
      .finally(() => {
        if (mounted.current && token === request.current) setBusy(false);
      });
  }, [active]);

  function retainDraft() {
    if (editor && isDirty(editor)) { drafts.current.set(keyOf(editor), editor); scheduleDraft(editor); void flushDraft(keyOf(editor)); }
    else if (editor) drafts.current.delete(keyOf(editor));
    updateDraftCount();
  }
  function resetFeedback() {
    cancelQuote();
    setError('');
    setReceipt('');
    setConflict(undefined);
    setUndoRevision(undefined);
    setHistory(undefined);
    setVersion(undefined);
    setClosing(false);
    setSourceError('');
  }
  async function readAll(id: string, revision?: number) {
    const first = await bridge.notesRead({ id, revision });
    let body = first.body,
      page = first;
    while (page.hasMore) {
      page = await bridge.notesRead({
        id,
        revision: first.note.revision,
        offset: page.end,
      });
      body += page.body;
    }
    return { ...first.note, body };
  }
  async function open(id: string, stillRequested: () => boolean = () => true) {
    if (busy || !stillRequested()) return false;
    retainDraft();
    resetFeedback();
    const token = ++request.current;
    const draft = drafts.current.get(id);
    setBusy(true);
    try {
      const note = await readAll(id);
      if (!mounted.current || token !== request.current || !stillRequested()) return false;
      const kept = !draft && note.state === 'active' && typeof bridge.notesDraft === 'function'
        ? await bridge.notesDraft({ operation: 'read', key: id }) : undefined;
      if (!mounted.current || token !== request.current || !stillRequested()) return false;
      const original = kept?.draft?.baseRevision && kept.draft.baseRevision !== note.revision
        ? await readAll(id, kept.draft.baseRevision) : note;
      if (mounted.current && token === request.current && stillRequested()) {
        if (kept) { draftEpoch.current = kept.epoch; if (kept.draft) savedDrafts.current.set(id, kept.draft); }
        const resumed = note.state === 'active' ? draft || (kept?.draft ? { note: original,
          title: kept.draft.title, body: kept.draft.body } : undefined) : undefined;
        setEditor(resumed || editable(note));
        if (resumed) { drafts.current.set(id, resumed); if (kept?.draft) backedDrafts.current.set(id, resumed);
          if (resumed.note?.revision !== note.revision) setConflict(note); }
        updateDraftCount();
        return true;
      }
    } catch (cause) {
      if (mounted.current && token === request.current && stillRequested()) setError(uiError(cause));
    } finally {
      if (mounted.current && token === request.current) setBusy(false);
    }
    return false;
  }
  async function newNote() {
    if (busy) return false;
    retainDraft();
    resetFeedback();
    const token = ++request.current;
    setState('active');
    const local = drafts.current.get('new');
    if (local || typeof bridge.notesDraft !== 'function') { setEditor(local || fresh()); return true; }
    setBusy(true);
    try {
      const kept = await bridge.notesDraft({ operation: 'read', key: 'new' });
      if (!mounted.current || token !== request.current) return;
      draftEpoch.current = kept.epoch;
      if (kept.draft) { savedDrafts.current.set('new', kept.draft); const resumed = { title: kept.draft.title, body: kept.draft.body };
        drafts.current.set('new', resumed); backedDrafts.current.set('new', resumed); setEditor(resumed); }
      else setEditor(fresh());
      updateDraftCount();
      return true;
    } catch (cause) { if (mounted.current && token === request.current) setError(uiError(cause)); }
    finally { if (mounted.current && token === request.current) setBusy(false); }
    return false;
  }
  function changeDraft(change: Partial<Pick<Editor, 'title' | 'body'>>) {
    if (!editor) return;
    cancelQuote();
    const next = { ...editor, ...change };
    setEditor(next);
    setReceipt('');
    setUndoRevision(undefined);
    if (isDirty(next)) { drafts.current.set(keyOf(next), next); scheduleDraft(next); }
    else { drafts.current.delete(keyOf(next)); void discardDraft(keyOf(next)); }
    updateDraftCount();
  }
  function acceptResult(result: NoteMutation) {
    if (result.status === 'conflict') {
      setConflict(result.current);
      return false;
    }
    if (editor) { drafts.current.delete(keyOf(editor)); void discardDraft(keyOf(editor)); }
    updateDraftCount();
    setEditor(editable(result.note));
    setConflict(undefined);
    setUndoRevision(result.previousRevision);
    setVersion(undefined);
    setHistory(undefined);
    return true;
  }
  async function save(useCurrent = false) {
    if (!editor || busy || deleted) return false;
    setBusy(true);
    setError('');
    try {
      const result = editor.note
        ? await bridge.notesUpdate({
            id: editor.note.id,
            expectedRevision: useCurrent && conflict ? conflict.revision : editor.note.revision,
            title: editor.title,
            body: editor.body,
          })
        : await bridge.notesCreate({ title: editor.title, body: editor.body });
      const saved = acceptResult(result);
      if (saved) {
        setReceipt('保存好了');
        await loadList();
      }
      return saved && result.status === 'saved' ? result.note : undefined;
    } catch (cause) {
      setError(uiError(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function selectPassage(control: HTMLTextAreaElement, point?: { x: number; y: number }) {
    returnSelection.current = undefined;
    if ((!onQuote && !bookmarkTray) || !active || !editor || deleted || busy || quoting || control.value !== editor.body) return;
    const from = control.selectionStart, to = control.selectionEnd;
    const text = control.value.slice(from, to);
    if (!text.trim()) { setSelection(undefined); return; }
    const start = Array.from(control.value.slice(0, from)).length, length = Array.from(text).length;
    if (length > 4000) { setSelection(undefined); setReceipt('这一段有些长，选短一点再聊。'); return; }
    const rect = control.getBoundingClientRect();
    const position = point ? { left: point.x, top: point.y } : (() => {
      const mark = noteTextPosition(control, from, to);
      return { left: rect.left + mark.left - control.scrollLeft,
        top: Math.max(rect.top, rect.top + mark.top - control.scrollTop) };
    })();
    setSelection({ editor, start, end: start + length,
      left: Math.max(16, Math.min(window.innerWidth - 190, position.left)),
      top: Math.max(84, Math.min(window.innerHeight - 64, position.top - 52)) });
  }
  function cancelQuote() {
    quoteGeneration.current++;
    returnSelection.current = undefined;
    setSelection(undefined);
    setQuoting(false);
  }
  function releaseBookmarkDrag() {
    if (bookmarkDrag.current) bookmarkTray?.release(bookmarkDrag.current);
    bookmarkDrag.current = undefined;
  }
  async function discussSelection() {
    if (!selection || selection.editor !== editor || !onQuote || !quoteEnabled || busy || quoting || deleted || conflict) return;
    const selected = selection, destination = quoteDestination.current, generation = ++quoteGeneration.current,
      interaction = bookmarkTray?.getInteractionVersion();
    const current = () => mounted.current && generation === quoteGeneration.current
      && destination.context === quoteDestination.current.context && destination.boundary === quoteDestination.current.boundary
      && quoteDestination.current.active && quoteDestination.current.enabled
      && interaction === bookmarkTray?.getInteractionVersion();
    setQuoting(true); setError('');
    try {
      // "Save and discuss" is one explicit user action. An unsaved edit must
      // never be described by the earlier saved revision or material source.
      const note = isDirty(editor) ? await save() : editor.note;
      if (!note || !current()) return;
      if (note.body !== selected.editor.body) throw new Error('这一页的内容变了，请重新选中想聊的那一段。');
      const quote = await bridge.notesQuote({ id: note.id, revision: note.revision, sha256: note.sha256,
        start: selected.start, end: selected.end });
      if (!current()) return;
      const control = host.current?.querySelector<HTMLTextAreaElement>('textarea.notes-body');
      const page = host.current?.querySelector<HTMLElement>('.notes-embedded, .page-panel');
      const resume = control ? { address: noteQuoteAddress(quote), boundary: quoteDestination.current.boundary,
        scrollTop: control.scrollTop, pageTop: page?.scrollTop || 0,
        width: control.clientWidth, height: control.clientHeight } : undefined;
      if (onQuote(quote)) { returnSelection.current = resume; setSelection(undefined); }
    } catch (cause) { if (current()) setError(uiError(cause)); }
    finally { if (mounted.current && generation === quoteGeneration.current) setQuoting(false); }
  }
  async function pickSelection() {
    if (!selection || selection.editor !== editor || !bookmarkTray || busy || quoting || deleted || conflict) return;
    const selected = selection, generation = ++quoteGeneration.current, destination = quoteDestination.current,
      interaction = bookmarkTray.getInteractionVersion();
    const current = () => mounted.current && generation === quoteGeneration.current
      && destination.context === quoteDestination.current.context && destination.boundary === quoteDestination.current.boundary
      && quoteDestination.current.active && destination.enabled === quoteDestination.current.enabled
      && interaction === bookmarkTray.getInteractionVersion();
    setQuoting(true); setError('');
    try {
      const note = isDirty(editor) ? await save() : editor.note;
      if (!note || !current()) return;
      if (note.body !== selected.editor.body) throw new Error('这一页的内容变了，请重新选中想留下的那一段。');
      const quote = await bridge.notesQuote({ id: note.id, revision: note.revision, sha256: note.sha256,
        start: selected.start, end: selected.end });
      if (!current()) return;
      await bookmarkTray.note({ kind: 'notebook', reference: noteQuoteAddress(quote) },
        host.current?.querySelector<HTMLTextAreaElement>('textarea.notes-body'));
    } catch (cause) { if (current()) setError(uiError(cause)); }
    finally { if (mounted.current && generation === quoteGeneration.current) setQuoting(false); }
  }
  async function openNotebookSource() {
    const source = editor?.note?.source.notebook;
    if (!source || sourceOpening || busy) return;
    const destination = quoteDestination.current, interaction = bookmarkTray?.getInteractionVersion();
    const current = () => mounted.current && quoteDestination.current.active
      && destination.context === quoteDestination.current.context && destination.boundary === quoteDestination.current.boundary
      && interaction === bookmarkTray?.getInteractionVersion();
    setSourceOpening(true); setSourceError('');
    try {
      await bridge.notesQuote(source);
      if (!current() || !await open(source.id, current)) return;
      requestAnimationFrame(() => {
        if (!current()) return;
        const control = host.current?.querySelector<HTMLTextAreaElement>('textarea.notes-body');
        const opened = editorCurrent.current;
        if (!control || !opened?.note || opened.note.id !== source.id || control.value !== opened.body) return;
        if (isDirty(opened)) {
          setReceipt('你刚写下的内容还在，先接着这一版。');
          control.focus({ preventScroll: true });
          return;
        }
        if (opened.note.state !== 'active' || opened.note.revision !== source.revision || opened.note.sha256 !== source.sha256) {
          setReceipt(opened.note.state === 'deleted' ? '这页已收起来，原句没有重新选中。' : '这一页后来改过，这里是现在的内容。');
          control.focus({ preventScroll: true });
          return;
        }
        const points = Array.from(control.value), start = points.slice(0, source.start).join('').length,
          end = points.slice(0, source.end).join('').length;
        revealNoteMatch(control, start, end);
      });
    } catch (cause) { if (current()) setSourceError(uiError(cause)); }
    finally { if (mounted.current) setSourceOpening(false); }
  }
  async function recoverOriginalPage() {
    if (!editor?.note || busy || sourceOpening) return;
    const source = editor.note.source, destination = quoteDestination.current, interaction = bookmarkTray?.getInteractionVersion();
    const current = () => mounted.current && quoteDestination.current.active
      && destination.context === quoteDestination.current.context && destination.boundary === quoteDestination.current.boundary
      && interaction === bookmarkTray?.getInteractionVersion();
    // The user explicitly opens today's original page. The old quote address
    // on this kept page is not rewritten to that newer version.
    if (source.notebook) { await open(source.notebook.id, current); return; }
    if (source.material && onOpenMaterials) {
      retainDraft();
      await Promise.allSettled([...queuedDrafts.current.keys()].map(key => flushDraft(key)));
      if (current()) onOpenMaterials();
    }
  }
  async function mutate(kind: 'state' | 'undo', target: 'active' | 'deleted' | number) {
    if (!editor?.note || busy) return;
    cancelQuote();
    setBusy(true);
    setError('');
    try {
      const input = {
        id: editor.note.id,
        expectedRevision: editor.note.revision,
      };
      const result =
        kind === 'state'
          ? await bridge.notesChangeState({
              ...input,
              state: target as 'active' | 'deleted',
            })
          : await bridge.notesUndo({
              ...input,
              targetRevision: target as number,
            });
      if (acceptResult(result)) {
        setReceipt(
          kind === 'undo'
            ? '这一版回来了'
            : target === 'deleted'
              ? '先收在这里，随时可以放回去'
              : '笔记回来了',
        );
        await loadList();
      }
    } catch (cause) {
      setError(uiError(cause));
    } finally {
      setBusy(false);
    }
  }
  async function showHistory(append = false) {
    if (!editor?.note || busy) return;
    cancelQuote();
    setBusy(true);
    setError('');
    try {
      const result = await bridge.notesHistory({
        id: editor.note.id,
        offset: append ? history?.items.length || 0 : 0,
      });
      setHistory((current) =>
        append && current ? { ...result, items: [...current.items, ...result.items] } : result,
      );
    } catch (cause) {
      setError(uiError(cause));
    } finally {
      setBusy(false);
    }
  }
  async function viewVersion(revision: number) {
    if (!editor?.note || busy) return;
    setBusy(true);
    setError('');
    try {
      setVersion(await readAll(editor.note.id, revision));
    } catch (cause) {
      setError(uiError(cause));
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    if (busy) return;
    cancelQuote();
    retainDraft();
    if (typeof bridge.notesDraft !== 'function') { if (dirty || drafts.current.size) setClosing(true); else onClose(); return; }
    setBusy(true);
    const token = ++request.current, closingContext = quoteDestination.current.context;
    await Promise.allSettled([...new Set([...queuedDrafts.current.keys(), ...draftQueues.current.keys()])].map(key => flushDraft(key)));
    if (!mounted.current || token !== request.current) return;
    setBusy(false);
    if (!quoteDestination.current.active || quoteDestination.current.context !== closingContext) return;
    if ([...drafts.current].some(([key, draft]) => backedDrafts.current.get(key) !== draft)) setClosing(true);
    else onClose();
  }
  async function openMaterial(discuss = false) {
    const source = editor?.note?.source.material;
    if (!source || !onOpenMaterialSource || sourceOpening) return;
    cancelQuote();
    setSourceOpening(true); setSourceError('');
    try { await onOpenMaterialSource(source, discuss); }
    catch (cause) { if (mounted.current) setSourceError(uiError(cause)); }
    finally { if (mounted.current) setSourceOpening(false); }
  }
  const date = (value: string) => formatDateTime(value, timeZone);
  const hasContent = !!editor?.title.trim() || !!editor?.body.trim();
  return (
    <div className="notes-host" hidden={!active} ref={host}
      onPointerDownCapture={() => { viewingGeneration.current++; }} onWheelCapture={() => { viewingGeneration.current++; }}
      onKeyDownCapture={() => { viewingGeneration.current++; }}
      onScrollCapture={() => { setSelection(undefined); reportReturnAddress(false); }}>
      <NotesFrame embedded={embedded} onClose={close}>
        <div className="notes-toolbar">
          <form
            className="notes-search"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) setAppliedQuery(query);
            }}
          >
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="搜索笔记"
              placeholder="找一段写过的话"
              value={query}
              disabled={busy}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="text-button" disabled={loading || busy}>
              查找
            </button>
          </form>
          <button className="primary-button notes-new" onClick={newNote} disabled={busy}>
            <Plus size={17} />
            写一页
          </button>
        </div>
        {closing && (
          <div className="notes-leave" role="alert">
            <span>刚写的字还没保存，要先留下吗？</span>
            <div className="notes-inline-actions">
              {dirty && (
                <button
                  className="primary-button"
                  disabled={busy || !hasContent || !!conflict}
                  onClick={() =>
                    void save().then((saved) => {
                      if (saved && drafts.current.size === 0) onClose();
                    })
                  }
                >
                  保存这一页
                </button>
              )}
              <button className="text-button" disabled={busy} onClick={() => setClosing(false)}>
                再写一会儿
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  for (const key of drafts.current.keys()) void discardDraft(key);
                  drafts.current.clear();
                  setDraftCount(0);
                  setEditor(editor?.note ? editable(editor.note) : undefined);
                  resetFeedback();
                  onClose();
                }}
              >
                不保留这些改动，返回
              </button>
            </div>
          </div>
        )}
        <div className="notes-workspace" aria-busy={busy}>
          <aside className="notes-index" aria-label="笔记列表">
            <div className="notes-tabs" role="tablist" aria-label="笔记范围">
              <button
                role="tab"
                aria-selected={state === 'active'}
                disabled={busy}
                onClick={() => setState('active')}
              >
                写下的
              </button>
              <button
                role="tab"
                aria-label="回收站"
                aria-selected={state === 'deleted'}
                disabled={busy}
                onClick={() => setState('deleted')}
              >
                最近收起的
              </button>
            </div>
            {loading && !list.items.length && (
              <p className="notes-empty" role="status">
                翻开笔记…
              </p>
            )}
            {!loading && !list.items.length && (
              <p className="notes-empty">
                {appliedQuery
                  ? '这次没找到，换几个字试试。'
                  : state === 'deleted'
                    ? '这里还没有收起的笔记。'
                    : '想到什么，就从一页开始。'}
              </p>
            )}
            <div className="notes-list">
              {list.items.map(note => <KeptNoteEntry key={note.id} note={note} active={active} boundary={quoteBoundary}
                busy={busy} current={editor?.note?.id === note.id}
                hasDraft={drafts.current.has(note.id) || savedDrafts.current.has(note.id)} date={date(note.updatedAt)}
                onOpen={() => void open(note.id)} />)}
            </div>
            {list.hasMore && (
              <button
                className="text-button notes-more"
                disabled={loading || busy}
                onClick={() => void loadList(state, appliedQuery, true)}
              >
                再翻一些
              </button>
            )}
            {draftCount > 0 && (drafts.current.has('new') || savedDrafts.current.has('new')) && editor?.note && (
              <button className="text-button notes-more" disabled={busy} onClick={newNote}>
                接着写刚才那一页
              </button>
            )}
          </aside>
          <section className="notes-reading-area" aria-label={editor?.note?.source.referenceOnly ? '摘录与自己的想法' : editor?.note?.title || '笔记正文'}>
            {!editor ? (
              <div className="notes-paper notes-start">
                <div>
                  <p className="notes-start-title">留一点位置，给你的想法。</p>
                  <p>一句话也好，慢慢写也好。</p>
                  <button className="text-button" disabled={busy} onClick={() => recentDraft && recentDraft !== 'new' ? void open(recentDraft) : void newNote()}>
                    <Plus size={17} />
                    {recentDraft ? '接着写刚才那一页' : '写下第一句'}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`notes-reader-grid ${history || conflict ? 'has-companion-panel' : ''}`}
              >
                <div className="notes-paper">
                  <div className="notes-document-meta">
                    <span>
                      {deleted
                        ? '收在这里，随时可以放回笔记'
                        : dirty
                          ? '还在写的这一版'
                          : editor.note
                            ? date(editor.note.updatedAt)
                            : '新的一页'}
                    </span>
                    {editor.note && (
                      <button
                        className="text-button"
                        disabled={busy}
                        aria-label="查看历史版本"
                        onClick={() =>
                          history
                            ? (setHistory(undefined), setVersion(undefined))
                            : void showHistory()
                        }
                        aria-expanded={!!history}
                      >
                        <History size={15} />
                        以前写下的
                      </button>
                    )}
                  </div>
                  <form
                    className="notes-editor"
                    data-bookmark-target="note"
                    onDragOver={event => { if (bookmarkTray && event.dataTransfer.types.includes(SOURCE_BOOKMARK_MIME)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; } }}
                    onDrop={event => { const reference = readBookmarkTransfer(event.dataTransfer); if (reference && bookmarkTray) { event.preventDefault(); event.stopPropagation(); void bookmarkTray.offer(reference, 'note'); } }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save();
                    }}
                  >
                    <label className="notes-title-label">
                      <span className="sr-only">笔记标题</span>
                      <input
                        className="notes-title"
                        aria-label="笔记标题"
                        placeholder="给这一页起个名字"
                        value={editor.note?.source.referenceOnly && editor.title === referenceNoteTitle ? '' : editor.title}
                        maxLength={NOTE_LIMITS.title}
                        readOnly={deleted || busy}
                        onChange={(event) => changeDraft({ title: editor.note?.source.referenceOnly && !event.target.value ? referenceNoteTitle : event.target.value })}
                      />
                    </label>
                    {editor.note?.source.referenceOnly && <section className="note-live-excerpt" aria-label="引用的原文" aria-busy={excerptLoading}>
                      {sourceExcerpt && <><header><BookOpen size={15} /><span>{sourceExcerpt.title}{sourceExcerpt.page ? ` · 第 ${sourceExcerpt.page} 页` : ''}</span></header><blockquote tabIndex={-1} onDragStart={event => {
                        const selection = window.getSelection(), node = event.currentTarget;
                        if (!selection?.rangeCount || selection.isCollapsed || node.textContent !== sourceExcerpt.text) { event.preventDefault(); return; }
                        const range = selection.getRangeAt(0);
                        if (!node.contains(range.startContainer) || !node.contains(range.endContainer)) { event.preventDefault(); return; }
                        const prefix = range.cloneRange(); prefix.selectNodeContents(node); prefix.setEnd(range.startContainer, range.startOffset);
                        const start = sourceExcerpt.reference.reference.start + Array.from(prefix.toString()).length,
                          end = start + Array.from(range.toString()).length;
                        const reference = sourceBookmarkReferenceSchema.parse({ ...sourceExcerpt.reference,
                          reference: { ...sourceExcerpt.reference.reference, start, end } });
                        bookmarkDrag.current = reference; bookmarkTray?.stage(reference, node);
                        writeBookmarkTransfer(event.dataTransfer, reference);
                      }} onDragEnd={releaseBookmarkDrag}>{sourceExcerpt.text}</blockquote>
                        <div>{sourceExcerpt.reference.kind === 'material' && onOpenMaterialSource && <button type="button" className="text-button" disabled={busy || sourceOpening} onClick={() => void openMaterial()}>打开原文</button>}
                          {sourceExcerpt.reference.kind === 'notebook' && <button type="button" className="text-button" disabled={busy || sourceOpening} onClick={() => void openNotebookSource()}>打开原文</button>}
                          {sourceExcerpt.reference.kind === 'conversation' && onOpenConversationSource && <button type="button" className="text-button" disabled={busy || sourceOpening} onClick={() => {
                            const reference = sourceExcerpt.reference, generation = excerptGeneration.current;
                            if (reference.kind === 'conversation') void onOpenConversationSource(reference.reference).catch(cause => {
                              if (generation === excerptGeneration.current && quoteDestination.current.active) setExcerptError(uiError(cause));
                            });
                          }}>打开原文</button>}
                          {bookmarkTray && <button type="button" className="text-button" disabled={busy || sourceOpening} draggable={!busy && !sourceOpening} onDragStart={event => {
                            bookmarkDrag.current = sourceExcerpt.reference;
                            bookmarkTray.stage(sourceExcerpt.reference, event.currentTarget.closest('.note-live-excerpt')?.querySelector<HTMLElement>('blockquote'));
                            writeBookmarkTransfer(event.dataTransfer, sourceExcerpt.reference);
                          }} onDragEnd={releaseBookmarkDrag} onClick={event => void bookmarkTray.cite(sourceExcerpt.reference,
                            event.currentTarget.closest('.note-live-excerpt')?.querySelector<HTMLElement>('blockquote'))}><MessageCircle size={14} />引用这段</button>}</div></>}
                      {excerptLoading && <p role="status">翻回留下的那一段…</p>}{excerptError && <><p role="status">{excerptError}</p><div>
                        {(editor.note.source.notebook || editor.note.source.material && onOpenMaterials) && <button type="button" className="text-button" disabled={busy || sourceOpening} onClick={() => void recoverOriginalPage()}>{editor.note.source.notebook ? '看看现在的原页' : '重新带来资料'}</button>}
                        <button type="button" className="text-button" disabled={busy || excerptLoading} onClick={() => setExcerptRefresh(value => value + 1)}>再看一次</button></div></>}
                    </section>}
                    <label className="notes-body-label">
                      <span className={editor.note?.source.referenceOnly ? 'note-own-thoughts-label' : 'sr-only'}>{editor.note?.source.referenceOnly ? '自己的想法' : '笔记正文'}</span>
                      <textarea
                        className="notes-body"
                        aria-label="笔记正文"
                        placeholder={editor.note?.source.referenceOnly ? '写下自己的理解，原文仍在上方。' : '把眼前的想法，慢慢写在这里…'}
                        value={editor.body}
                        maxLength={NOTE_LIMITS.body}
                        readOnly={deleted || busy}
                        onChange={(event) => changeDraft({ body: event.target.value })}
                        onPointerUp={event => selectPassage(event.currentTarget, { x: event.clientX, y: event.clientY })}
                        onKeyDown={event => {
                          if (event.nativeEvent.isComposing) return;
                          if (event.key === 'Escape' && selection?.editor === editor) {
                            event.preventDefault(); event.stopPropagation(); cancelQuote();
                          }
                        }}
                        onKeyUp={event => {
                          if (event.nativeEvent.isComposing) return;
                          if (event.key === 'Escape') cancelQuote();
                          else selectPassage(event.currentTarget);
                        }}
                        onScroll={() => setSelection(undefined)}
                        onDragStart={event => {
                          if (!bookmarkTray) return;
                          if (dirty || !editor.note) { event.preventDefault(); setReceipt('这句还在草稿里，可以点「保存并引用」。'); return; }
                          if (!selection || selection.editor !== editor) { event.preventDefault(); return; }
                          const reference: SourceBookmarkReference = { kind: 'notebook', reference: {
                            id: editor.note.id, revision: editor.note.revision, sha256: editor.note.sha256,
                            start: selection.start, end: selection.end } };
                          bookmarkDrag.current = reference; bookmarkTray.stage(reference, event.currentTarget);
                          writeBookmarkTransfer(event.dataTransfer, reference);
                        }}
                        onDragEnd={releaseBookmarkDrag}
                        onBlur={event => {
                          if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.closest('.note-selection-actions, .source-bookmark-tray')) setSelection(undefined);
                        }}
                      />
                    </label>
                    {selection && selection.editor === editor && active && <div className="note-selection-actions"
                      style={{ left: selection.left, top: selection.top }} role="group" aria-label="笔记选段操作"
                      onKeyDown={event => {
                        if (event.key === 'Escape') {
                          event.preventDefault(); cancelQuote();
                          host.current?.querySelector<HTMLTextAreaElement>('textarea.notes-body')?.focus({ preventScroll: true });
                        }
                      }}
                      onBlur={event => {
                        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)
                          && !(event.relatedTarget instanceof Element && event.relatedTarget.closest('.source-bookmark-tray'))) setSelection(undefined);
                      }}
                      onMouseDown={event => event.preventDefault()}>
                      {onQuote && <button type="button" disabled={busy || quoting || !quoteEnabled || !!conflict}
                        onClick={() => void discussSelection()}><MessageCircle size={16} />{dirty ? '保存并引用' : '引用这段'}</button>
                      }
                      {bookmarkTray && <button type="button" disabled={busy || quoting || !!conflict} onClick={() => void pickSelection()}><FileText size={16} />{dirty ? '保存并留作笔记' : '留作笔记'}</button>}
                    </div>}
                    {editor.note?.source.notebook && !editor.note.source.referenceOnly && <div className="note-material-source"><div className="note-material-source-name"><FileText size={17} /><span>从原来的笔记留来</span></div>
                      <button type="button" className="text-button" disabled={sourceOpening || busy} onClick={() => void openNotebookSource()}><BookOpen size={16} />打开原文</button></div>}
                    {editor.note?.source.notebook && sourceError && <p className="note-material-source-error" role="status">{sourceError}</p>}
                    {editor.note?.source.material && !editor.note.source.referenceOnly && <div className="note-material-source">
                      <div className="note-material-source-name"><FileText size={17} /><span>{editor.note.source.material.name}{editor.note.source.material.page ? ` · 第 ${editor.note.source.material.page} 页` : ''}</span></div>
                      <div className="note-material-source-actions">
                        {onOpenMaterialSource && <><button type="button" className="text-button" disabled={sourceOpening} onClick={() => void openMaterial()}><BookOpen size={16} />打开原文</button>
                          <button type="button" className="text-button" disabled={sourceOpening} onClick={() => void openMaterial(true)}><MessageCircle size={16} />引用这段</button></>}
                      </div>
                      {sourceError && <div className="note-material-source-error" role="alert"><p>{sourceError}</p>{onOpenMaterials && <button type="button" className="text-button" onClick={onOpenMaterials}>重新带来资料</button>}</div>}
                    </div>}
                    <div className="notes-editor-actions">
                      {deleted ? (
                        <button
                          className="primary-button"
                          type="button"
                          disabled={busy}
                          onClick={() => void mutate('state', 'active')}
                        >
                          <RotateCcw size={16} />
                          放回笔记
                        </button>
                      ) : (
                        <button
                          className="primary-button"
                          type="submit"
                          disabled={busy || !hasContent || !dirty || !!conflict}
                        >
                          保存笔记
                        </button>
                      )}
                      {(dirty || draftCount > 0) && (
                        <button
                          className="text-button notes-draft-action"
                          type="button"
                          disabled={busy}
                          onClick={close}
                        >
                          先放下
                        </button>
                      )}
                      {editor.note && !deleted && (
                        <button
                          className="text-button notes-delete"
                          type="button"
                          disabled={busy || dirty}
                          title={dirty ? '先保存刚写的字，再收起这页' : '收进回收站，之后可以放回'}
                          aria-label="移入回收站"
                          onClick={() => void mutate('state', 'deleted')}
                        >
                          <Trash2 size={15} />
                          收起这页
                        </button>
                      )}
                      {receipt && (
                        <span className="notes-receipt" role="status">
                          <Check size={15} />
                          {receipt}
                          {undoRevision && !dirty && (
                            <button
                              className="text-button"
                              type="button"
                              disabled={busy}
                              onClick={() => void mutate('undo', undoRevision)}
                            >
                              撤销
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </form>
                </div>
                {(history || conflict) && (
                  <aside
                    className="notes-side"
                    aria-label={conflict ? '一起看看不同的改动' : '以前写下的'}
                  >
                    {conflict && (
                      <section className="notes-conflict" role="alert">
                        <header>
                          <h3>这一页有了新的改动</h3>
                        </header>
                        <p>你刚写的还在。看看另一份内容，再决定留下哪一份。</p>
                        <div className="notes-conflict-compare">
                          <details open>
                            <summary>你刚写的</summary>
                            <h4>{editor.note ? ownNoteLabel({ ...editor.note, title: editor.title }) : editor.title || '没有标题的一页'}</h4>
                            <pre>{editor.body}</pre>
                          </details>
                          <details open>
                            <summary>
                              新的内容
                              {conflict.state === 'deleted' ? ' · 已收起' : ''}
                            </summary>
                            <h4>{ownNoteLabel(conflict)}</h4>
                            <pre>{conflict.body}</pre>
                          </details>
                        </div>
                        <div className="notes-side-actions">
                          {conflict.state === 'active' && (
                            <button
                              className="primary-button"
                              disabled={busy || !hasContent}
                              onClick={() => void save(true)}
                            >
                              保留我的文字并保存
                            </button>
                          )}
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => {
                              setEditor(editable(conflict));
                              drafts.current.delete(conflict.id);
                              void discardDraft(conflict.id);
                              setConflict(undefined);
                              updateDraftCount();
                            }}
                          >
                            采用新的内容
                          </button>
                        </div>
                      </section>
                    )}
                    {history && (
                      <section className="notes-history">
                        <header>
                          <h3>以前写下的</h3>
                          <IconButton
                            label="收起历史版本"
                            onClick={() => {
                              setHistory(undefined);
                              setVersion(undefined);
                            }}
                          >
                            <X size={17} />
                          </IconButton>
                        </header>
                        {version ? (
                          <>
                            <button
                              className="text-button notes-history-back"
                              onClick={() => setVersion(undefined)}
                            >
                              <ChevronLeft size={15} />
                              看看其他版本
                            </button>
                            <div className="notes-version-copy">
                              <p>{date(version.updatedAt)}</p>
                              <h4>{ownNoteLabel(version)}</h4>
                              <pre>{version.body || '这一页还没有正文。'}</pre>
                            </div>
                            <div className="notes-side-actions">
                              <button
                                className="primary-button"
                                disabled={
                                  busy || dirty || version.revision === editor.note?.revision
                                }
                                onClick={() => void mutate('undo', version.revision)}
                              >
                                {version.revision === editor.note?.revision
                                  ? '正用着这一版'
                                  : '用这个版本'}
                              </button>
                              {dirty && <p>先保存刚写的字，再换回以前的版本。</p>}
                              <button
                                className="text-button"
                                onClick={() => {
                                  setHistory(undefined);
                                  setVersion(undefined);
                                }}
                              >
                                回到现在
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="notes-history-list">
                              {history.items.map((item) => (
                                <button
                                  className="notes-history-row"
                                  key={item.revision}
                                  disabled={busy}
                                  onClick={() => void viewVersion(item.revision)}
                                >
                                  <span>
                                    <time>{date(item.updatedAt)}</time>
                                    <small>
                                      {
                                        {
                                          create: '写下这一页',
                                          edit: '改了几笔',
                                          delete: '收起这一页',
                                          restore: '放回笔记',
                                          undo: '换回以前的版本',
                                        }[item.operation]
                                      }
                                      {item.revision === editor.note?.revision ? ' · 正在用' : ''}
                                    </small>
                                  </span>
                                  <ChevronRight size={15} />
                                </button>
                              ))}
                            </div>
                            {history.hasMore && (
                              <button
                                className="text-button notes-more"
                                disabled={busy}
                                onClick={() => void showHistory(true)}
                              >
                                再往前翻
                              </button>
                            )}
                          </>
                        )}
                      </section>
                    )}
                  </aside>
                )}
              </div>
            )}
            {error && (
              <div className="inline-problem notes-error" role="alert">
                <span>{error}</span>
                <button className="text-button" disabled={busy} onClick={() => void loadList()}>
                  再打开笔记列表
                </button>
              </div>
            )}
          </section>
        </div>
      </NotesFrame>
    </div>
  );
}
