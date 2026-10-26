import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, Check, FileText, MessageCircle, Quote, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { SOURCE_BOOKMARK_MIME, sourceBookmarkAddress, sourceBookmarkReferenceSchema, type SourceBookmarkPreview,
  type SourceBookmarkReference } from '../shared/source-bookmark';
import { uiError } from './ui';
import { RichText } from './RichText';
import './source-bookmark.css';
import './keep-note-actions.css';

export interface StudyBookmarkDestination {
  sessionId: string;
  studyId: string;
  messageId?: string;
}
export interface BookmarkTarget {
  key: string;
  label: string;
  location?: StudyBookmarkDestination;
  preview: (reference: SourceBookmarkReference) => Promise<SourceBookmarkPreview>;
  accept: (reference: SourceBookmarkReference) => Promise<void>;
}
interface BookmarkTray {
  pick: (reference: SourceBookmarkReference, source?: HTMLElement | null) => Promise<void>;
  cite: (reference: SourceBookmarkReference, source?: HTMLElement | null) => Promise<void>;
  note: (reference: SourceBookmarkReference, source?: HTMLElement | null) => Promise<void>;
  offer: (reference: SourceBookmarkReference, key: string, source?: HTMLElement | null) => Promise<void>;
  register: (target: BookmarkTarget) => () => void;
  stage: (reference: SourceBookmarkReference, source?: HTMLElement | null) => void;
  release: (reference: SourceBookmarkReference) => void;
  getInteractionVersion: () => number | undefined;
}
const BookmarkTrayContext = createContext<BookmarkTray | undefined>(undefined);
export const useBookmarkTray = () => useContext(BookmarkTrayContext);
export function readBookmarkTransfer(transfer: DataTransfer): SourceBookmarkReference | undefined {
  const raw = transfer.getData(SOURCE_BOOKMARK_MIME);
  if (!raw || raw.length > 5000) return;
  try { const value = sourceBookmarkReferenceSchema.safeParse(JSON.parse(raw)); return value.success ? value.data : undefined; }
  catch { return; }
}
export function writeBookmarkTransfer(transfer: DataTransfer, reference: SourceBookmarkReference) {
  // Pending-file bearer tickets stay in this renderer's live hand-off, never
  // in a drag payload another application could receive.
  transfer.clearData();
  transfer.setData(SOURCE_BOOKMARK_MIME, JSON.stringify(sourceBookmarkAddress(reference))); transfer.effectAllowed = 'copy';
}

interface BookmarkReturnFocus {
  element: HTMLElement | null;
  input?: { length: number; text: string; start: number; end: number; direction: 'forward' | 'backward' | 'none' };
  passage?: { range: Range; text: string };
}
function bookmarkReturnFocus(source?: HTMLElement | null): BookmarkReturnFocus {
  const element = source || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if ((element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement)
    && element.selectionStart !== null && element.selectionEnd !== null)
    return { element, input: { length: element.value.length, text: element.value.slice(element.selectionStart, element.selectionEnd),
      start: element.selectionStart, end: element.selectionEnd,
      direction: element.selectionDirection || 'none' } };
  const selection = window.getSelection();
  const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0).cloneRange() : undefined;
  return { element, ...(range && (!source || source.contains(range.startContainer) && source.contains(range.endContainer))
    ? { passage: { range, text: range.toString() } } : {}) };
}
function restoreBookmarkFocus(place?: BookmarkReturnFocus) {
  if (!place?.element?.isConnected || !place.element.getClientRects().length) return;
  place.element.focus({ preventScroll: true });
  const { input, passage } = place;
  if (input && (place.element instanceof HTMLTextAreaElement || place.element instanceof HTMLInputElement)
    && place.element.value.length === input.length && place.element.value.slice(input.start, input.end) === input.text)
    place.element.setSelectionRange(input.start, input.end, input.direction);
  if (passage && passage.range.startContainer.isConnected && passage.range.endContainer.isConnected
    && passage.range.toString() === passage.text) {
    const selection = window.getSelection();
    selection?.removeAllRanges(); selection?.addRange(passage.range);
  }
}

/** Only the small paper currently in the hand lives here. Material, notebook,
 * and study truth remain in their original owners; closing drops this address. */
export function SourceBookmarkProvider({ boundaryKey, active = true, resetKey, onUnsavedChange, onDiscuss, onOpenNote, onOpenStudy, onOpenSource, onNoteSaved, getInteractionVersion, children }: {
  boundaryKey: string;
  active?: boolean;
  /** Changes only for a real clear-all operation, not ordinary source exit. */
  resetKey?: string | number;
  onUnsavedChange?: (unsaved: boolean) => void;
  onDiscuss: (reference: SourceBookmarkReference) => boolean | Promise<boolean>;
  onOpenNote?: (id: string, revision: number) => void;
  onOpenStudy?: (location: StudyBookmarkDestination) => void;
  onOpenSource?: (reference: SourceBookmarkReference) => void | Promise<void>;
  onNoteSaved?: (id: string, revision: number) => void;
  getInteractionVersion?: () => number;
  children: ReactNode;
}) {
  const targets = useRef(new Map<string, BookmarkTarget>());
  const staged = useRef<SourceBookmarkReference | undefined>(undefined), stagedFocus = useRef<BookmarkReturnFocus | undefined>(undefined);
  const sameAddress = (left: SourceBookmarkReference, right: SourceBookmarkReference) =>
    JSON.stringify(sourceBookmarkAddress(left)) === JSON.stringify(sourceBookmarkAddress(right));
  const [targetRevision, changed] = useState(0), [loadedPaper, setPaper] = useState<SourceBookmarkPreview>();
  const liveBoundary = useRef(boundaryKey); liveBoundary.current = boundaryKey;
  const paperBoundary = useRef(boundaryKey);
  const paper = paperBoundary.current === boundaryKey ? loadedPaper : undefined;
  const [destination, setDestination] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const previewTarget = useRef<BookmarkTarget | undefined>(undefined);
  const operation = useRef(0), returnFocus = useRef<BookmarkReturnFocus | undefined>(undefined), tray = useRef<HTMLElement>(null);
  const carriedReference = useRef<SourceBookmarkReference | undefined>(undefined), committing = useRef<number | undefined>(undefined);
  const [accepting, setAccepting] = useState(false);
  const [directCiting, setDirectCiting] = useState(false);
  const [directNote, setDirectNote] = useState(false);
  const [annotation, setAnnotation] = useState('');
  const annotationDraft = useRef(''); annotationDraft.current = annotation;
  const [detached, setDetached] = useState(false);
  const detachedDraft = useRef(detached); detachedDraft.current = detached;
  const privateSurface = useRef(active); privateSurface.current = active;
  const annotationInput = useRef<HTMLTextAreaElement>(null);
  const [savedNote, setSavedNote] = useState<{ id: string; revision: number; boundary: string; focus?: BookmarkReturnFocus }>();
  const receipt = useRef<HTMLElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const onDiscussRef = useRef(onDiscuss); onDiscussRef.current = onDiscuss;
  const onOpenSourceRef = useRef(onOpenSource); onOpenSourceRef.current = onOpenSource;
  const onNoteSavedRef = useRef(onNoteSaved); onNoteSavedRef.current = onNoteSaved;
  const unsavedCallback = useRef(onUnsavedChange); unsavedCallback.current = onUnsavedChange;
  const interactionVersion = useRef(getInteractionVersion); interactionVersion.current = getInteractionVersion;
  const clear = useCallback((restoreFocus = true) => {
    operation.current++; setPaper(undefined); setDestination(undefined); setError(''); setBusy(false); setAccepting(!!committing.current);
    setAnnotation(''); setDetached(false); setDirectCiting(false); setDirectNote(false);
    staged.current = undefined; stagedFocus.current = undefined; previewTarget.current = undefined; carriedReference.current = undefined;
    const focus = returnFocus.current; returnFocus.current = undefined;
    const request = operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    if (restoreFocus) requestAnimationFrame(() => {
      if (request === operation.current && boundary === liveBoundary.current
        && interaction === interactionVersion.current?.()) restoreBookmarkFocus(focus);
    });
  }, []);
  const previousBoundary = useRef(boundaryKey), previousReset = useRef(resetKey);
  useEffect(() => {
    if (previousBoundary.current === boundaryKey) return;
    previousBoundary.current = boundaryKey;
    const ownWriting = annotationDraft.current;
    clear(false); setSavedNote(undefined); setAnnouncement('');
    // Retire the source and its permission. Only the person's unsaved writing
    // survives, detached from any old address; saving it is a separate action.
    if (ownWriting.trim()) { setAnnotation(ownWriting); setDetached(true); }
  }, [boundaryKey, clear]);
  useEffect(() => {
    if (active) return;
    const ownWriting = annotationDraft.current;
    clear(false); setSavedNote(undefined); setAnnouncement('');
    if (ownWriting.trim()) { setAnnotation(ownWriting); setDetached(true); }
  }, [active, clear]);
  useEffect(() => {
    if (previousReset.current === resetKey) return;
    previousReset.current = resetKey;
    clear(false); setSavedNote(undefined); setAnnouncement('');
  }, [resetKey, clear]);
  useEffect(() => { unsavedCallback.current?.(!!annotation.trim()); }, [annotation]);
  useEffect(() => () => unsavedCallback.current?.(false), []);
  useEffect(() => {
    if (!savedNote) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { timer = setTimeout(() => {
      // A keyboard user can finish reading or open the note without the
      // receipt disappearing under their focused control.
      if (receipt.current?.matches(':hover, :focus-within')) schedule();
      else setSavedNote(current => current === savedNote ? undefined : current);
    }, 6000); };
    schedule(); return () => clearTimeout(timer);
  }, [savedNote]);
  useEffect(() => () => { operation.current++; }, []);
  const register = useCallback((target: BookmarkTarget) => {
    targets.current.set(target.key, target); changed(value => value + 1);
    return () => { if (targets.current.get(target.key) === target) { targets.current.delete(target.key); changed(value => value + 1); } };
  }, []);
  const stage = useCallback((reference: SourceBookmarkReference, source?: HTMLElement | null) => {
    if (!privateSurface.current) return;
    staged.current = reference;
    stagedFocus.current = source ? bookmarkReturnFocus(source) : undefined;
  }, []);
  const release = useCallback((reference: SourceBookmarkReference) => {
    if (staged.current && sameAddress(staged.current, reference)) { staged.current = undefined; stagedFocus.current = undefined; }
  }, []);
  const detachWriting = useCallback(() => {
    setPaper(undefined); setDestination(undefined); setDetached(!!annotationDraft.current.trim());
    carriedReference.current = undefined; staged.current = undefined; stagedFocus.current = undefined;
    previewTarget.current = undefined; returnFocus.current = undefined;
  }, []);
  const offer = useCallback(async (reference: SourceBookmarkReference, key?: string, sourceElement?: HTMLElement | null, noteEditor = false) => {
    // 收下 has already crossed from a preview to its owner. A second paper
    // cannot cancel that write or silently replace its eventual receipt.
    if (committing.current || !privateSurface.current) return;
    if (detachedDraft.current && annotationDraft.current.trim()) {
      setError('先保存自己的想法，或明确放下，再选择另一段原文。'); return;
    }
    if (annotationDraft.current.trim() && key !== 'note') {
      setError('刚写的想法还在这里。先留作笔记，或取消后再换用途。'); return;
    }
    if (annotationDraft.current.trim() && carriedReference.current && !sameAddress(carriedReference.current, reference)) {
      setError('刚写的想法还在这段原文下。先留好，或取消后再换另一段。'); return;
    }
    setDirectCiting(false); setDetached(false); setDirectNote(noteEditor);
    const request = ++operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && privateSurface.current && interaction === interactionVersion.current?.();
    // Changing the destination is still the same paper in the same hand.
    // Keep the original editor/selection rather than a button in this tray.
    if (!carriedReference.current || !sameAddress(carriedReference.current, reference)) {
      setAnnotation('');
      returnFocus.current = staged.current && sameAddress(staged.current, reference) && stagedFocus.current || bookmarkReturnFocus(sourceElement);
    }
    carriedReference.current = reference;
    setSavedNote(undefined); setAnnouncement('');
    setBusy(true); setError(''); setDestination(key); setPaper(undefined); previewTarget.current = undefined;
    const source = staged.current && sameAddress(staged.current, reference) ? staged.current : reference;
    const target = key && !['chat', 'note'].includes(key) ? targets.current.get(key) : undefined;
    try {
      if (key && !['chat', 'note'].includes(key) && !target) throw new Error('这张推导纸刚收起来了，可以把这一段先留在对话或笔记里。');
      const preview = target ? await target.preview(source) : await window.zaichang.sourceBookmarkPreview(source);
      if (!current()) return;
      paperBoundary.current = boundary;
      carriedReference.current = preview.reference; previewTarget.current = target; setPaper(preview);
      requestAnimationFrame(() => { if (current()) {
        if (key === 'note') annotationInput.current?.focus({ preventScroll: true });
        else tray.current?.querySelector<HTMLButtonElement>('[data-bookmark-primary]')?.focus({ preventScroll: true });
      } });
    } catch (problem) {
      if (!current()) return;
      // A different question may decline this paper. Reopen its source before
      // offering another destination: an old preview is never recovery proof.
      if (key && !['chat', 'note'].includes(key)) {
        try {
          const preview = await window.zaichang.sourceBookmarkPreview(source);
          if (!current()) return;
          paperBoundary.current = boundary; carriedReference.current = preview.reference; setPaper(preview); setDestination(undefined);
          requestAnimationFrame(() => { if (current()) tray.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); });
        } catch (sourceProblem) { if (current()) { setDestination(undefined); setError(uiError(sourceProblem)); } return; }
      }
      if (current()) { setDestination(undefined); setError(uiError(problem)); }
    }
    finally { if (owns()) {
      setBusy(false);
      if (!current() && annotationDraft.current.trim()) detachWriting();
    } }
  }, []);
  const pick = useCallback((reference: SourceBookmarkReference, source?: HTMLElement | null) => offer(reference, undefined, source), [offer]);
  const note = useCallback((reference: SourceBookmarkReference, source?: HTMLElement | null) => offer(reference, 'note', source, true), [offer]);
  const cite = useCallback(async (reference: SourceBookmarkReference, source?: HTMLElement | null) => {
    if (committing.current || !privateSurface.current) return;
    if (annotationDraft.current.trim()) { setError('刚写的想法还在这里，先留作笔记，或取消后再引用。'); return; }
    const request = ++operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && privateSurface.current && interaction === interactionVersion.current?.();
    const original = staged.current && sameAddress(staged.current, reference) ? staged.current : reference;
    returnFocus.current = bookmarkReturnFocus(source); carriedReference.current = original;
    setPaper(undefined); setDestination(undefined); setDetached(false); setBusy(true); setDirectCiting(true); setError(''); setSavedNote(undefined); setAnnouncement('正在引用这一段…');
    try {
      const preview = await window.zaichang.sourceBookmarkPreview(original);
      if (!current()) return;
      committing.current = request;
      if (!await onDiscussRef.current(preview.reference)) throw new Error('对话位置刚有变化，原文没有放进另一处草稿。请重新引用这一段。');
      if (owns()) { clear(false); setAnnouncement('已引用到输入框。'); }
    } catch (problem) { if (current()) setError(uiError(problem)); }
    finally { if (committing.current === request) { committing.current = undefined; setAccepting(false); }
      if (owns()) { setBusy(false); setDirectCiting(false); } }
  }, [clear]);
  const getCurrentInteractionVersion = useCallback(() => interactionVersion.current?.(), []);
  const value = useMemo(() => ({ register, pick, cite, note, offer, stage, release, getInteractionVersion: getCurrentInteractionVersion }),
    [register, pick, cite, note, offer, stage, release, getCurrentInteractionVersion]);
  const choose = async (key: string) => {
    if (!paper || busy || committing.current || !privateSurface.current) return;
    if (annotationDraft.current.trim() && key !== 'note') { setError('刚写的想法还在这里。先留作笔记，或取消后再换用途。'); return; }
    if (key === 'chat') { await cite(paper.reference, returnFocus.current?.element); return; }
    if (key === 'note') { previewTarget.current = undefined; setDestination(key); setError('');
      requestAnimationFrame(() => annotationInput.current?.focus({ preventScroll: true })); return; }
    await offer(paper.reference, key);
  };
  const accept = async () => {
    if (!paper || !destination || busy || committing.current || !privateSurface.current) return;
    const request = ++operation.current, reference = paper.reference, boundary = liveBoundary.current,
      interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && privateSurface.current && interaction === interactionVersion.current?.();
    let accepted = false;
    committing.current = request; setAccepting(true); setBusy(true); setError('');
    try {
      if (destination === 'chat') {
        if (!await onDiscussRef.current(reference)) throw new Error('对话位置刚有变化，原文没有放进另一处草稿。请重新引用这一段。');
        accepted = true;
      }
      else if (destination === 'note') {
        const result = await window.zaichang.sourceBookmarkKeep({ bookmark: reference, annotation,
          ...(paper.retainOriginalRequired ? { retainOriginal: true } : {}) });
        if (result.status !== 'saved') throw new Error('这页笔记刚在别处改过，原来的文字还在。');
        accepted = true;
        if (current()) { setSavedNote({ id: result.note.id, revision: result.note.revision, boundary, focus: returnFocus.current });
          onNoteSavedRef.current?.(result.note.id, result.note.revision); }
      } else {
        const target = targets.current.get(destination);
        if (!target) throw new Error('这张推导纸刚收起来了，原文仍在，可以重新打开再放。');
        if (target !== previewTarget.current) throw new Error('这张推导纸又往下写了一步，重新选一下它，就能看着现在的位置放。');
        await target.accept(reference);
        accepted = true;
        if (current() && target.location) onOpenStudy?.(target.location);
      }
    } catch (problem) {
      if (owns()) {
        if (committing.current === request) committing.current = undefined;
        setAccepting(false);
        // The owner may have refused a changed or withdrawn source after its
        // preview. Keep the paper only if that exact address still opens now.
        if (annotationDraft.current.trim()) detachWriting();
        else { setPaper(undefined); setDestination(undefined); previewTarget.current = undefined; }
        if (!current()) return;
        try {
          const preview = await window.zaichang.sourceBookmarkPreview(reference);
          if (current()) {
            paperBoundary.current = boundary; carriedReference.current = preview.reference; setDetached(false); setPaper(preview);
            if (annotationDraft.current.trim()) setDestination('note');
            setError(uiError(problem));
          }
        } catch (sourceProblem) { if (current()) setError(uiError(sourceProblem)); }
      }
    }
    finally {
      if (committing.current === request) { committing.current = undefined; setAccepting(false); }
      // A real acceptance is finished even when a later gesture vetoes only
      // its navigation. Retire this paper without focus or duplicate writes.
      if (accepted && owns()) clear(false);
      else if (owns()) { setBusy(false); setAccepting(false); }
    }
  };
  const saveDetached = async () => {
    if (!detached || !annotation.trim() || busy || committing.current || !privateSurface.current) return;
    const request = ++operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && privateSurface.current && interaction === interactionVersion.current?.();
    let accepted = false;
    committing.current = request; setAccepting(true); setBusy(true); setError('');
    try {
      // This is deliberately a new native notebook document containing only
      // the person's writing. No retired source address or cached quote joins it.
      const result = await window.zaichang.notesCreate({ title: '', body: annotation });
      if (result.status !== 'saved') throw new Error('自己的想法还没有保存，请再看一下当前内容。');
      accepted = true;
      if (current()) { setSavedNote({ id: result.note.id, revision: result.note.revision, boundary, focus: returnFocus.current });
        onNoteSavedRef.current?.(result.note.id, result.note.revision); }
    } catch (problem) { if (current()) setError(uiError(problem)); }
    finally {
      if (committing.current === request) { committing.current = undefined; setAccepting(false); }
      if (accepted && owns()) clear(false);
      else if (owns()) { setBusy(false); setAccepting(false); }
    }
  };
  const openSource = async () => {
    if (!paper || busy || committing.current || !onOpenSourceRef.current || !privateSurface.current) return;
    if (annotationDraft.current.trim()) { setError('刚写的想法还在这里，先留作笔记，再打开原文。'); return; }
    const request = ++operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && privateSurface.current && interaction === interactionVersion.current?.();
    setBusy(true); setError('');
    try {
      const preview = await window.zaichang.sourceBookmarkPreview(paper.reference);
      if (!current()) return;
      await onOpenSourceRef.current(preview.reference);
      if (owns()) clear(false);
    } catch (problem) { if (current()) setError(uiError(problem)); }
    finally { if (owns()) setBusy(false); }
  };
  const dismissReceipt = () => {
    const saved = savedNote, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    setSavedNote(undefined);
    requestAnimationFrame(() => {
      if (saved?.boundary === boundary && boundary === liveBoundary.current && interaction === interactionVersion.current?.())
        restoreBookmarkFocus(saved.focus);
    });
  };
  const studyTargets = useMemo(() => [...targets.current.values()], [targetRevision]);
  const directNoteEditor = directNote && destination === 'note' && !detached;
  const noteSaveLabel = paper?.retainOriginalRequired ? '留笔记与原文'
    : directNoteEditor ? annotation.trim() ? '保存笔记' : '留住这一段' : '留作笔记';
  return <BookmarkTrayContext.Provider value={value}>{children}
    {active && (paper || error || detached || busy && !directCiting) && createPortal(<aside ref={tray} className={`source-bookmark-tray${directNoteEditor ? ' is-direct-note' : ''}`} aria-label="引用与笔记"
      onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); clear(); } }}>
      <header><Quote size={16} aria-hidden="true" /><strong>{detached ? '自己的想法' : destination === 'note' ? '留作笔记' : '这段原文'}</strong><button type="button" className="icon-button"
        aria-label={accepting ? '收起保存进度' : annotation.trim() ? '不保留这些未保存的想法' : '取消这次操作'}
        title={annotation.trim() && !accepting ? '不保留这些未保存的想法' : undefined} onClick={() => clear()}><X size={16} /></button></header>
      {detached && <><p>原文刚有变化，你写的字还在。可以只把自己的想法保存成笔记。</p>
        <label className="source-bookmark-annotation">自己的想法
          <textarea ref={annotationInput} aria-label="自己的未保存想法" value={annotation} maxLength={4000} readOnly={busy}
            onChange={event => setAnnotation(event.target.value)} />
        </label>
        {accepting && !busy && <p role="status">刚才的保存还在处理中，自己的字仍在这里。</p>}
        <footer><button type="button" className="text-button" disabled={busy || accepting} onClick={() => clear()}>不保留这些想法</button>
          <button type="button" className="primary-button" disabled={busy || accepting || !annotation.trim()} onClick={() => void saveDetached()}>{busy || accepting ? '保存中…' : '只保存自己的想法'}</button></footer>
      </>}
      {paper && <><div className="source-bookmark-paper" draggable={!busy} onDragStart={event => { stage(paper.reference); writeBookmarkTransfer(event.dataTransfer, paper.reference); }} onDragEnd={() => release(paper.reference)}>
        {directNoteEditor ? <div className="source-bookmark-source-header"><span>{paper.title}{paper.page ? ` · 第 ${paper.page} 页` : ''}</span>
          {onOpenSource && <button type="button" className="icon-button" aria-label="打开原文" title="打开原文" disabled={busy} onClick={() => void openSource()}><ArrowUpRight size={15} /></button>}
        </div> : <span>{paper.title}{paper.page ? ` · 第 ${paper.page} 页` : ''}</span>}
        <blockquote><RichText text={paper.text} /></blockquote></div>
        {!directNoteEditor && <div className="source-bookmark-destinations" role="group" aria-label="这段原文的操作">
          <button type="button" data-bookmark-primary disabled={busy} onClick={() => void choose('chat')}><MessageCircle size={16} />引用这段</button>
          <button type="button" aria-pressed={destination === 'note'} disabled={busy} onClick={() => void choose('note')}><FileText size={16} />留作笔记</button>
          {onOpenSource && <button type="button" disabled={busy} onClick={() => void openSource()}><BookOpen size={16} />打开原文</button>}
        </div>}
        {!directNoteEditor && studyTargets.length > 0 && <details className="source-bookmark-study-targets"><summary>用于当前推导</summary><div className="source-bookmark-destinations">
          {studyTargets.map(target => <button type="button" key={target.key} aria-pressed={destination === target.key} disabled={busy} onClick={() => void choose(target.key)}><BookOpen size={16} />{target.label}</button>)}
        </div></details>}
        {destination === 'note' && <label className="source-bookmark-annotation">自己的想法
          <textarea ref={annotationInput} aria-label="对这段原文的想法" placeholder="刚才想到的…" maxLength={4000}
            value={annotation} readOnly={busy} onChange={event => setAnnotation(event.target.value)} />
        </label>}
        {destination === 'note' && paper.retainOriginalRequired && <p>原文件会一起保存在这台设备上。</p>}
        {destination && <footer>
          <button type="button" className="text-button" disabled={busy} title={directNoteEditor && annotation.trim() ? '不保留这些未保存的想法' : undefined}
            onClick={() => { if (!committing.current) clear(); }}>{!directNoteEditor && annotation.trim() ? '不保留这些想法' : '取消'}</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void accept()}>{busy ? destination === 'note' ? '保存中…' : '引用中…' : destination === 'note' ? noteSaveLabel : destination === 'chat' ? '引用这段' : '引用到这道推导'}</button></footer>}
      </>}
      {error && <p role="status">{error}</p>}{busy && !paper && <p role="status">正在打开这段原文…</p>}
      {error && !destination && !busy && !detached && <footer>
        <button type="button" className="text-button" onClick={() => clear()}>{annotation.trim() ? '不保留这些想法' : '取消'}</button>
        {carriedReference.current && <button type="button" className="primary-button" onClick={() => {
          const reference = carriedReference.current; if (reference) void offer(reference);
        }}>再看一次</button>}
      </footer>}
    </aside>, document.body)}
    {active && savedNote?.boundary === boundaryKey && createPortal(<aside ref={receipt} className="source-bookmark-tray source-bookmark-receipt" role="status" aria-label="笔记已保存">
      <Check size={16} /><span>已留作笔记</span>
      {onOpenNote && <button type="button" className="text-button" onClick={() => { onOpenNote(savedNote.id, savedNote.revision); setSavedNote(undefined); }}>打开笔记</button>}
      <button type="button" className="icon-button" aria-label="收起笔记保存提示" onClick={dismissReceipt}><X size={16} /></button>
    </aside>, document.body)}
    <span className="sr-only" role="status">{active ? announcement : ''}</span>
  </BookmarkTrayContext.Provider>;
}
